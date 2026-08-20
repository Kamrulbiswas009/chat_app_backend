import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserSignUpDto } from './dto/user.singup.dto';
import { ERROR_MESSAGES } from 'src/common/constants';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IEnv } from 'src/config/env.config';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async userSignUp(data: UserSignUpDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new BadRequestException(ERROR_MESSAGES.USER.USER_ALREADY_EXISTS);
    }

    const hashedPassword = await this.hashPassword(data.password);

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        avatar: data.avatar,
        bio: data.bio,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  async signIn(data: LoginDto, clientInfo?: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    const tokens = await this.generateTokens(user.id, user.email);

    // Save session to database
    const refreshExpiresInDays = 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpiresInDays);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        device: clientInfo?.userAgent,
        ip: clientInfo?.ip,
        expiresAt,
      },
    });

    const { password: _, ...safeUser } = user;

    return {
      user: safeUser,
      tokens,
    };
  }

  async refreshToken(refreshToken: string) {
    const env = this.configService.get<IEnv>('env');
    let payload: { sub: string; email: string };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: env?.JWT_CONFIG.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => null);
      }
      throw new UnauthorizedException('Session expired or invalid. Please login again.');
    }

    const newTokens = await this.generateTokens(session.userId, session.user.email);

    const refreshExpiresInDays = 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshExpiresInDays);

    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newTokens.refreshToken,
        expiresAt,
      },
    });

    return newTokens;
  }

  async logout(refreshToken?: string, userId?: string) {
    if (refreshToken) {
      await this.prisma.session.deleteMany({
        where: { refreshToken },
      });
    } else if (userId) {
      await this.prisma.session.deleteMany({
        where: { userId },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER.USER_NOT_FOUND);
    }

    return user;
  }

  async generateTokens(userId: string, email: string) {
    const env = this.configService.get<IEnv>('env');
    const payload = { sub: userId, email };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: env?.JWT_CONFIG.JWT_SECRET,
      expiresIn: (env?.JWT_CONFIG.JWT_EXPIRES_IN as any) || '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: env?.JWT_CONFIG.JWT_REFRESH_SECRET,
      expiresIn: (env?.JWT_CONFIG.JWT_REFRESH_EXPIRES_IN as any) || '30d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}
