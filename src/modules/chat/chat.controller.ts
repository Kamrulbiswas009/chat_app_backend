import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { GetCurrentUser } from 'src/common/decorator/get-current-user.decorator';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';
import { sendResponse } from 'src/common/helpers/api-response.helper';
import { ChatGateway } from './chat.gateway';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload an image, video, audio, or document for chat' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image, video, audio, or document attachment file',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'File uploaded to Cloudinary successfully' })
  async uploadAttachment(@UploadedFile() file: Express.Multer.File) {
    const result = await this.chatService.uploadChatAttachment(file);
    return sendResponse(HttpStatus.OK, 'File uploaded successfully', result);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get or start a 1-to-1 conversation with another user' })
  @ApiOkResponse({ description: 'Conversation retrieved or created' })
  async getOrCreateConversation(
    @GetCurrentUser('id') currentUserId: string,
    @Body() body: CreateConversationDto,
  ) {
    const result = await this.chatService.getOrCreateConversation(
      currentUserId,
      body.recipientId,
    );
    return sendResponse(HttpStatus.OK, 'Conversation retrieved successfully', result);
  }

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all active conversations for the current user' })
  @ApiOkResponse({ description: 'Conversations list fetched successfully' })
  async getUserConversations(@GetCurrentUser('id') currentUserId: string) {
    const result = await this.chatService.getUserConversations(currentUserId);
    return sendResponse(HttpStatus.OK, 'Conversations fetched successfully', result);
  }

  @Get('conversations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a specific conversation' })
  @ApiOkResponse({ description: 'Conversation details fetched successfully' })
  async getConversationById(
    @GetCurrentUser('id') currentUserId: string,
    @Param('id') conversationId: string,
  ) {
    const result = await this.chatService.getConversationById(
      conversationId,
      currentUserId,
    );
    return sendResponse(HttpStatus.OK, 'Conversation details fetched successfully', result);
  }

  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get paginated message history for a conversation' })
  @ApiOkResponse({ description: 'Messages list fetched successfully' })
  async getConversationMessages(
    @GetCurrentUser('id') currentUserId: string,
    @Param('id') conversationId: string,
    @Query() query: QueryMessagesDto,
  ) {
    const result = await this.chatService.getConversationMessages(
      conversationId,
      currentUserId,
      query,
    );
    return sendResponse(HttpStatus.OK, 'Messages fetched successfully', result);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Send a message (text and/or file attachment: image, video, audio, file)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          example: 'Here is the video attachment',
          description: 'Optional text message',
        },
        type: {
          type: 'string',
          enum: ['TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO'],
          example: 'TEXT',
        },
        attachmentUrl: {
          type: 'string',
          example: 'https://res.cloudinary.com/.../file.png',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Direct file attachment (image, video, audio, or document)',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Message sent successfully' })
  async sendMessage(
    @GetCurrentUser('id') currentUserId: string,
    @Param('id') conversationId: string,
    @Body() body: Omit<SendMessageDto, 'conversationId'>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const { message, recipientId } = await this.chatService.sendMessage(
      currentUserId,
      {
        ...body,
        conversationId,
      },
      file,
    );

    // Notify connected Socket.IO clients in real time
    this.chatGateway.server
      .to(`conversation:${conversationId}`)
      .to(`user:${recipientId}`)
      .to(`user:${currentUserId}`)
      .emit('new_message', message);

    return sendResponse(HttpStatus.CREATED, 'Message sent successfully', message);
  }

  @Patch('messages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Edit a message' })
  @ApiOkResponse({ description: 'Message edited successfully' })
  async editMessage(
    @GetCurrentUser('id') currentUserId: string,
    @Param('id') messageId: string,
    @Body() body: EditMessageDto,
  ) {
    const { message, recipientId, conversationId } = await this.chatService.editMessage(
      currentUserId,
      messageId,
      body.content,
    );

    this.chatGateway.server
      .to(`conversation:${conversationId}`)
      .to(`user:${recipientId}`)
      .to(`user:${currentUserId}`)
      .emit('message_edited', message);

    return sendResponse(HttpStatus.OK, 'Message updated successfully', message);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a message (for me or for everyone)' })
  @ApiOkResponse({ description: 'Message deleted successfully' })
  async deleteMessage(
    @GetCurrentUser('id') currentUserId: string,
    @Param('id') messageId: string,
    @Query() query: DeleteMessageDto,
  ) {
    const result = await this.chatService.deleteMessage(
      currentUserId,
      messageId,
      query.type,
    );

    if (result.type === 'EVERYONE') {
      this.chatGateway.server
        .to(`conversation:${result.conversationId}`)
        .to(`user:${result.recipientId}`)
        .to(`user:${currentUserId}`)
        .emit('message_deleted', {
          messageId: result.messageId,
          conversationId: result.conversationId,
          type: 'EVERYONE',
        });
    } else {
      this.chatGateway.server.to(`user:${currentUserId}`).emit('message_deleted', {
        messageId: result.messageId,
        conversationId: result.conversationId,
        type: 'ME',
      });
    }

    return sendResponse(HttpStatus.OK, 'Message deleted successfully', result);
  }
}
