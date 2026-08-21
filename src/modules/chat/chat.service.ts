import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { DeleteType } from './dto/delete-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { MessageType } from '@prisma/client';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private getOrderedUserIds(
    user1Id: string,
    user2Id: string,
  ): [string, string] {
    return user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
  }

  async setUserOnline(userId: string, isOnline: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isOnline,
        ...(!isOnline && { lastSeen: new Date() }),
      },
      select: {
        id: true,
        name: true,
        isOnline: true,
        lastSeen: true,
      },
    });
  }

  async getOrCreateConversation(currentUserId: string, recipientId: string) {
    if (currentUserId === recipientId) {
      throw new BadRequestException(
        'Cannot start a conversation with yourself',
      );
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient user not found');
    }

    const [userAId, userBId] = this.getOrderedUserIds(
      currentUserId,
      recipientId,
    );

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        userAId_userBId: {
          userAId,
          userBId,
        },
      },
      include: {
        userA: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
            lastSeen: true,
          },
        },
        userB: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
            lastSeen: true,
          },
        },
        messages: {
          where: {
            deletions: {
              none: {
                userId: currentUserId,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          userAId,
          userBId,
        },
        include: {
          userA: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              bio: true,
              isOnline: true,
              lastSeen: true,
            },
          },
          userB: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              bio: true,
              isOnline: true,
              lastSeen: true,
            },
          },
          messages: {
            take: 0,
          },
        },
      });
    }

    const partner =
      conversation.userAId === currentUserId
        ? conversation.userB
        : conversation.userA;
    const lastMessage = conversation.messages?.[0] || null;

    return {
      id: conversation.id,
      userAId: conversation.userAId,
      userBId: conversation.userBId,
      partner,
      lastMessage: lastMessage
        ? {
            ...lastMessage,
            content: lastMessage.isDeletedForEveryone
              ? 'This message was deleted'
              : lastMessage.content,
          }
        : null,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
    };
  }

  async getUserConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
            lastSeen: true,
          },
        },
        userB: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
            lastSeen: true,
          },
        },
        messages: {
          where: {
            deletions: {
              none: {
                userId,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });

    return conversations.map((conv) => {
      const partner = conv.userAId === userId ? conv.userB : conv.userA;
      const lastMessage = conv.messages?.[0] || null;

      return {
        id: conv.id,
        userAId: conv.userAId,
        userBId: conv.userBId,
        partner,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderId: lastMessage.senderId,
              content: lastMessage.isDeletedForEveryone
                ? 'This message was deleted'
                : lastMessage.content,
              type: lastMessage.type,
              attachmentUrl: lastMessage.attachmentUrl,
              isDeletedForEveryone: lastMessage.isDeletedForEveryone,
              isEdited: lastMessage.isEdited,
              createdAt: lastMessage.createdAt,
            }
          : null,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
      };
    });
  }

  async getConversationById(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        userA: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
            lastSeen: true,
          },
        },
        userB: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            bio: true,
            isOnline: true,
            lastSeen: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this conversation',
      );
    }

    const partner =
      conversation.userAId === userId ? conversation.userB : conversation.userA;

    return {
      id: conversation.id,
      userAId: conversation.userAId,
      userBId: conversation.userBId,
      partner,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
    };
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    query: QueryMessagesDto,
  ) {
    await this.getConversationById(conversationId, userId);

    const { page = 1, limit = 30, before } = query;
    const skip = before ? 0 : (page - 1) * limit;

    const whereClause: any = {
      conversationId,
      deletions: {
        none: {
          userId,
        },
      },
      ...(before && {
        createdAt: {
          lt: (
            await this.prisma.message.findUnique({
              where: { id: before },
              select: { createdAt: true },
            })
          )?.createdAt,
        },
      }),
    };

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: whereClause,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.message.count({ where: whereClause }),
    ]);

    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      sender: msg.sender,
      content: msg.isDeletedForEveryone
        ? 'This message was deleted'
        : msg.content,
      type: msg.type,
      attachmentUrl: msg.isDeletedForEveryone ? null : msg.attachmentUrl,
      isDeletedForEveryone: msg.isDeletedForEveryone,
      isEdited: msg.isEdited,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    }));

    return {
      messages: formattedMessages.reverse(), // chronologically ordered (oldest to newest)
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async sendMessage(
    senderId: string,
    data: SendMessageDto,
    file?:
      | Express.Multer.File
      | { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const conversationId = data.conversationId;
    if (!conversationId) {
      throw new BadRequestException('conversationId is required');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      conversation.userAId !== senderId &&
      conversation.userBId !== senderId
    ) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    let attachmentUrl = data.attachmentUrl;
    let messageType = data.type || MessageType.TEXT;

    // Direct file attachment handling
    const fileToUpload = file || data.file;
    if (fileToUpload && fileToUpload.buffer) {
      const uploadResult = await this.uploadChatAttachment(
        fileToUpload as Express.Multer.File,
      );
      attachmentUrl = uploadResult.url;
      messageType = uploadResult.type;
    }

    const content = data.content || (attachmentUrl ? '' : '');
    if (!content && !attachmentUrl) {
      throw new BadRequestException(
        'Message must contain either text content or a file attachment',
      );
    }

    const recipientId =
      conversation.userAId === senderId
        ? conversation.userBId
        : conversation.userAId;

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          content,
          type: messageType,
          attachmentUrl,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return {
      message,
      recipientId,
    };
  }

  async editMessage(userId: string, messageId: string, content: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    if (message.isDeletedForEveryone) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content,
        isEdited: true,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    const recipientId =
      message.conversation.userAId === userId
        ? message.conversation.userBId
        : message.conversation.userAId;

    return {
      message: updatedMessage,
      recipientId,
      conversationId: message.conversationId,
    };
  }

  async deleteMessage(userId: string, messageId: string, type: DeleteType) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isParticipant =
      message.conversation.userAId === userId ||
      message.conversation.userBId === userId;

    if (!isParticipant) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    const recipientId =
      message.conversation.userAId === userId
        ? message.conversation.userBId
        : message.conversation.userAId;

    if (type === DeleteType.EVERYONE) {
      if (message.senderId !== userId) {
        throw new ForbiddenException(
          'You can only delete for everyone on your own messages',
        );
      }

      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          isDeletedForEveryone: true,
          deletedAt: new Date(),
        },
      });

      return {
        messageId,
        conversationId: message.conversationId,
        type: DeleteType.EVERYONE,
        recipientId,
      };
    } else {
      // Delete for me
      await this.prisma.messageDeletion.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        create: {
          messageId,
          userId,
        },
        update: {
          deletedAt: new Date(),
        },
      });

      return {
        messageId,
        conversationId: message.conversationId,
        type: DeleteType.ME,
        userId,
      };
    }
  }

  async setTypingStatus(
    conversationId: string,
    userId: string,
    isTyping: boolean,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) return null;

    const recipientId =
      conversation.userAId === userId
        ? conversation.userBId
        : conversation.userAId;

    await this.prisma.typingStatus.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      create: {
        conversationId,
        userId,
        isTyping,
      },
      update: {
        isTyping,
      },
    });

    return {
      conversationId,
      userId,
      isTyping,
      recipientId,
    };
  }

  async uploadChatAttachment(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No attachment file provided');
    }

    let messageType: MessageType = MessageType.FILE;
    let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';

    if (file.mimetype.startsWith('image/')) {
      messageType = MessageType.IMAGE;
      resourceType = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      messageType = MessageType.VIDEO;
      resourceType = 'video';
    } else if (file.mimetype.startsWith('audio/')) {
      messageType = MessageType.AUDIO;
      resourceType = 'video';
    } else {
      messageType = MessageType.FILE;
      resourceType = 'raw';
    }

    const uploadResult = await this.cloudinaryService.uploadFileFromBuffer(
      file.buffer,
      'chat_attachments',
      `attachment_${Date.now()}_${file.originalname}`,
      resourceType,
    );

    return {
      url: uploadResult.secure_url,
      type: messageType,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }
}
