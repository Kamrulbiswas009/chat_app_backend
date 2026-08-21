import {
  Body,
  Controller,
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
import { UserService } from './user.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { GetCurrentUser } from 'src/common/decorator/get-current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { sendResponse } from 'src/common/helpers/api-response.helper';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all users with pagination and optional search' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default 20)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Optional search filter (name or email)' })
  @ApiQuery({ name: 'excludeSelf', required: false, type: Boolean, description: 'Exclude current user (default false)' })
  @ApiOkResponse({ description: 'Users list fetched successfully' })
  async getAllUsers(
    @GetCurrentUser('id') currentUserId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('excludeSelf') excludeSelf?: string,
  ) {
    const isExcludeSelf = excludeSelf === 'true';
    const result = await this.userService.getAllUsers(
      isExcludeSelf ? currentUserId : undefined,
      parseInt(String(page || 1), 10) || 1,
      parseInt(String(limit || 20), 10) || 20,
      search,
    );
    return sendResponse(HttpStatus.OK, 'Users fetched successfully', result);
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search users by name or email (case-insensitive)' })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search term for name or email' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max items to return (default 20)' })
  @ApiQuery({ name: 'excludeSelf', required: false, type: Boolean, description: 'Exclude current user (default false)' })
  @ApiOkResponse({ description: 'Search results fetched successfully' })
  async searchUsers(
    @GetCurrentUser('id') currentUserId: string,
    @Query('q') query?: string,
    @Query('limit') limit = '20',
    @Query('excludeSelf') excludeSelf?: string,
  ) {
    const isExcludeSelf = excludeSelf === 'true';
    const result = await this.userService.searchUsers(
      query || '',
      isExcludeSelf ? currentUserId : undefined,
      parseInt(String(limit || 20), 10) || 20,
    );
    return sendResponse(HttpStatus.OK, 'Search completed successfully', result);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiOkResponse({ description: 'User profile fetched successfully' })
  async getUserById(@Param('id') id: string) {
    const result = await this.userService.getProfile(id);
    return sendResponse(
      HttpStatus.OK,
      'User profile fetched successfully',
      result,
    );
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Update own user profile details (with optional avatar file upload)' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'John Doe', description: 'User full name' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Profile avatar image file (JPG, PNG, WEBP)',
        },
        avatar: {
          type: 'string',
          example: 'https://res.cloudinary.com/.../avatar.png',
          description: 'Avatar URL (optional fallback)',
        },
        bio: {
          type: 'string',
          example: 'Software Engineer & Tech Enthusiast',
          description: 'User biography',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Profile updated successfully' })
  async updateProfile(
    @GetCurrentUser('id') currentUserId: string,
    @Body() data: UpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.userService.updateProfile(currentUserId, data, file);
    return sendResponse(HttpStatus.OK, 'Profile updated successfully', result);
  }

  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload and update user profile avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Profile avatar image file (JPG, PNG, WEBP)',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Avatar uploaded and updated successfully' })
  async uploadAvatar(
    @GetCurrentUser('id') currentUserId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const result = await this.userService.uploadAvatar(currentUserId, file);
    return sendResponse(HttpStatus.OK, 'Avatar uploaded successfully', result);
  }
}
