import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({
    example: 'cuid_recipient_user_id',
    description: 'The user ID to start conversation with',
  })
  @IsNotEmpty()
  @IsString()
  recipientId: string;
}
