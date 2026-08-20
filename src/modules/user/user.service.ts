import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async updateProfile(userId: string, data: UpdateUserDto) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.avatar !== undefined && { avatar: data.avatar }),
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
      },
    });

    return {
      avatarUrl: uploadResult.secure_url,
      user: updatedUser,
    };
  }

  async searchUsers(query: string, currentUserId: string, limit = 20) {
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          { id: { not: currentUserId } },
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
      },
      take: limit,
      orderBy: { name: 'asc' },
    });

    return users;
  }

  async getAllUsers(currentUserId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { not: currentUserId },
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({
        where: {
          id: { not: currentUserId },
        },
      }),
    ]);

    return {
      users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
