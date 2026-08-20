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
  @ApiOperation({ summary: 'List all other users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Users list fetched successfully' })
  async getAllUsers(
    @GetCurrentUser('id') currentUserId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const result = await this.userService.getAllUsers(
      currentUserId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
    return sendResponse(HttpStatus.OK, 'Users fetched successfully', result);
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search users by name or email' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Search results fetched successfully' })
  async searchUsers(
    @GetCurrentUser('id') currentUserId: string,
    @Query('q') query: string,
    @Query('limit') limit = '20',
  ) {
    const result = await this.userService.searchUsers(
      query || '',
      currentUserId,
      parseInt(limit, 10),
    );
    return sendResponse(HttpStatus.OK, 'Search completed successfully', result);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user profile by ID' })
  @ApiOkResponse({ description: 'User profile fetched successfully' })
  async getUserById(@Param('id') id: string) {
    const result = await this.userService.getProfile(id);
    return sendResponse(HttpStatus.OK, 'User profile fetched successfully', result);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own user profile details' })
  @ApiOkResponse({ description: 'Profile updated successfully' })
  async updateProfile(
    @GetCurrentUser('id') currentUserId: string,
    @Body() data: UpdateUserDto,
  ) {
    const result = await this.userService.updateProfile(currentUserId, data);
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
