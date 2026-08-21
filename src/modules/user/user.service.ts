import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ERROR_MESSAGES } from 'src/common/constants';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async getProfile(userId: string) {
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

  async updateProfile(
    userId: string,
    data: UpdateUserDto,
    file?: Express.Multer.File,
  ) {
    let avatarUrl = data.avatar;

    if (file) {
      const uploadResult = await this.cloudinaryService.uploadFileFromBuffer(
        file.buffer,
        'user_avatars',
        `avatar_${userId}_${Date.now()}`,
        'image',
      );
      avatarUrl = uploadResult.secure_url;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(avatarUrl !== undefined && { avatar: avatarUrl }),
        ...(data.bio !== undefined && { bio: data.bio }),
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

    return updated;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    // Upload to Cloudinary folder "user_avatars"
    const uploadResult = await this.cloudinaryService.uploadFileFromBuffer(
      file.buffer,
      'user_avatars',
      `avatar_${userId}_${Date.now()}`,
      'image',
    );

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatar: uploadResult.secure_url,
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

    return {
      avatarUrl: uploadResult.secure_url,
      user: updatedUser,
    };
  }

  async searchUsers(query: string, excludeUserId?: string, limit = 20) {
    const trimmed = (query || '').trim();
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    const where: any = {};

    if (excludeUserId) {
      where.id = { not: excludeUserId };
    }

    if (trimmed) {
      where.OR = [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { email: { contains: trimmed, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
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
      take: safeLimit,
      orderBy: { name: 'asc' },
    });

    return users;
  }

  async getAllUsers(
    currentUserId?: string,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const where: any = {};

    if (currentUserId) {
      where.id = { not: currentUserId };
    }

    const trimmed = (search || '').trim();
    if (trimmed) {
      where.OR = [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { email: { contains: trimmed, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
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
        skip,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where,
      }),
    ]);

    return {
      users,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }
}
