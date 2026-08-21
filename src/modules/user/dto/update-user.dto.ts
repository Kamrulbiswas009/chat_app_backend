import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe', description: 'User full name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile avatar image file (JPG, PNG, WEBP)',
  })
  @IsOptional()
  file?: any;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/.../avatar.png',
    description: 'Avatar image URL (optional if not uploading file directly)',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({
    example: 'Software Engineer & Tech Enthusiast',
    description: 'User biography',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;
}
