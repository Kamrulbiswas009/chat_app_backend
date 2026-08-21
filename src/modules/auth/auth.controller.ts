import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserSignUpDto } from './dto/user.singup.dto';
import { SUCCESS_MESSAGES } from 'src/common/constants';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.token.dto';
import { GetCurrentUser } from 'src/common/decorator/get-current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { sendResponse } from 'src/common/helpers/api-response.helper';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'password'],
      properties: {
        name: { type: 'string', example: 'John Doe', description: 'Full name of the user' },
        email: { type: 'string', example: 'john@example.com', description: 'Unique email address' },
        password: { type: 'string', example: 'SecurePassword123!', description: 'Password (min 6 characters)' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Profile avatar image file (JPG, PNG, WEBP)',
        },
        avatar: {
          type: 'string',
          example: 'https://example.com/avatar.jpg',
          description: 'Avatar image URL (optional fallback)',
        },
        bio: {
          type: 'string',
          example: 'Hey there! I am using this app.',
          description: 'User biography',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'User registered successfully' })
  async userSignUp(
    @Body() data: UserSignUpDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.authService.userSignUp(data, file);
    return sendResponse(
      HttpStatus.CREATED,
      SUCCESS_MESSAGES.AUTH.REGISTRATION_SUCCESS,
      result,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ description: 'Login successful' })
  async signIn(@Body() data: LoginDto, @Req() req: Request) {
    const clientInfo = {
      ip: req.ip || (req.headers['x-forwarded-for'] as string),
      userAgent: req.headers['user-agent'],
    };
    const result = await this.authService.signIn(data, clientInfo);
    return sendResponse(
      HttpStatus.OK,
      SUCCESS_MESSAGES.AUTH.LOGIN_SUCCESS,
      result,
    );
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate access and refresh tokens' })
  @ApiOkResponse({ description: 'Token refreshed successfully' })
  async refreshToken(@Body() body: RefreshTokenDto) {
    const result = await this.authService.refreshToken(body.refreshToken);
    return sendResponse(HttpStatus.OK, 'Token refreshed successfully', result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and terminate active session' })
  @ApiOkResponse({ description: 'Logged out successfully' })
  async logout(@Body() body: Partial<RefreshTokenDto>) {
    const result = await this.authService.logout(body.refreshToken);
    return sendResponse(HttpStatus.OK, 'Logged out successfully', result);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ description: 'User profile fetched successfully' })
  async getMe(@GetCurrentUser() user: any) {
    const result = await this.authService.findUser(user?.id);
    return sendResponse(
      HttpStatus.OK,
      'User profile fetched successfully',
      result,
    );
  }
}
