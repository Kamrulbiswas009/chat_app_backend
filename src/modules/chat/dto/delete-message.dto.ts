import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum DeleteType {
  ME = 'ME',
  EVERYONE = 'EVERYONE',
}

export class DeleteMessageDto {
  @ApiProperty({
    enum: DeleteType,
    default: DeleteType.ME,
    description:
      'Delete mode: ME (delete for me only) or EVERYONE (delete for everyone)',
  })
  @IsNotEmpty()
  @IsEnum(DeleteType)
  type: DeleteType;
}
