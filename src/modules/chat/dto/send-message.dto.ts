import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'cuid_conversation_id', description: 'Conversation ID' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({ example: 'Hello there!', description: 'Text message content' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ enum: MessageType, default: MessageType.TEXT, description: 'Type of message' })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/.../file.pdf', description: 'Attachment URL if already uploaded' })
  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @ApiPropertyOptional({ description: 'File binary/data (for Socket.IO or REST upload)' })
  @IsOptional()
  file?: any;
}
