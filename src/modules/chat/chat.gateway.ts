import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatService } from './chat.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { SendMessageDto } from './dto/send-message.dto';
import { DeleteMessageDto, DeleteType } from './dto/delete-message.dto';
import { IEnv } from 'src/config/env.config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly userSocketMap = new Map<string, Set<string>>(); // userId -> Set<socketId>

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit() {
    this.logger.log('Socket.IO Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake?.auth?.token ||
        (client.handshake?.headers?.authorization?.startsWith('Bearer ')
          ? client.handshake.headers.authorization.split(' ')[1]
          : client.handshake?.query?.token);

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided (${client.id})`);
        client.disconnect();
        return;
      }

      const env = this.configService.get<IEnv>('env');
      const payload = await this.jwtService.verifyAsync(token as string, {
        secret: env?.JWT_CONFIG.JWT_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          bio: true,
          isOnline: true,
        },
      });

      if (!user) {
        this.logger.warn(`Connection rejected: User not found (${client.id})`);
        client.disconnect();
        return;
      }

      client.data.user = user;
      const userId = user.id;

      // Track active sockets for multi-device support
      if (!this.userSocketMap.has(userId)) {
        this.userSocketMap.set(userId, new Set());
      }
      this.userSocketMap.get(userId)!.add(client.id);

      // Join individual user room
      client.join(`user:${userId}`);

      // Update online status in DB
      await this.chatService.setUserOnline(userId, true);

      // Broadcast user online presence to all connected clients
      this.server.emit('presence_update', {
        userId,
        isOnline: true,
      });

      this.logger.log(`Client connected: ${user.name} (${client.id})`);
    } catch (err: any) {
      this.logger.error(`Connection authentication failed: ${err.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data?.user;
    if (!user) return;

    const userId = user.id;
    const userSockets = this.userSocketMap.get(userId);

    if (userSockets) {
      userSockets.delete(client.id);
      if (userSockets.size === 0) {
        this.userSocketMap.delete(userId);

        // Mark as offline in DB and record lastSeen
        const updated = await this.chatService.setUserOnline(userId, false);

        // Broadcast offline presence
        this.server.emit('presence_update', {
          userId,
          isOnline: false,
          lastSeen: updated.lastSeen,
        });
      }
    }

    this.logger.log(`Client disconnected: ${user.name} (${client.id})`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const user = client.data.user;
    await this.chatService.getConversationById(data.conversationId, user.id);

    client.join(`conversation:${data.conversationId}`);
    return { event: 'joined_conversation', conversationId: data.conversationId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    client.leave(`conversation:${data.conversationId}`);
    return { event: 'left_conversation', conversationId: data.conversationId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto,
  ) {
    const user = client.data.user;
    const { message, recipientId } = await this.chatService.sendMessage(user.id, data);

    // Emit to conversation room & recipient's personal room
    this.server
      .to(`conversation:${data.conversationId}`)
      .to(`user:${recipientId}`)
      .to(`user:${user.id}`)
      .emit('new_message', message);

    return { status: 'success', message };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const user = client.data.user;
    const result = await this.chatService.setTypingStatus(
      data.conversationId,
      user.id,
      data.isTyping,
    );

    if (result) {
      this.server
        .to(`conversation:${data.conversationId}`)
        .to(`user:${result.recipientId}`)
        .emit('user_typing', {
          conversationId: data.conversationId,
          userId: user.id,
          userName: user.name,
          isTyping: data.isTyping,
        });
    }

    return { status: 'success' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('edit_message')
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; content: string },
  ) {
    const user = client.data.user;
    const { message, recipientId, conversationId } = await this.chatService.editMessage(
      user.id,
      data.messageId,
      data.content,
    );

    this.server
      .to(`conversation:${conversationId}`)
      .to(`user:${recipientId}`)
      .to(`user:${user.id}`)
      .emit('message_edited', message);

    return { status: 'success', message };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; type: DeleteType },
  ) {
    const user = client.data.user;
    const result = await this.chatService.deleteMessage(
      user.id,
      data.messageId,
      data.type || DeleteType.ME,
    );

    if (result.type === DeleteType.EVERYONE) {
      this.server
        .to(`conversation:${result.conversationId}`)
        .to(`user:${result.recipientId}`)
        .to(`user:${user.id}`)
        .emit('message_deleted', {
          messageId: result.messageId,
          conversationId: result.conversationId,
          type: DeleteType.EVERYONE,
        });
    } else {
      this.server.to(`user:${user.id}`).emit('message_deleted', {
        messageId: result.messageId,
        conversationId: result.conversationId,
        type: DeleteType.ME,
      });
    }

    return { status: 'success', result };
  }
}
