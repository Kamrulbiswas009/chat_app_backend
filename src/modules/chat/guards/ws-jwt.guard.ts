import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from 'src/prisma/prisma.service';
import { IEnv } from 'src/config/env.config';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const user = client.data?.user;

    if (user) {
      return true;
    }

    const token =
      client.handshake?.auth?.token ||
      (client.handshake?.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.split(' ')[1]
        : client.handshake?.query?.token);

    if (!token) {
      throw new WsException('Unauthorized: No token provided');
    }

    try {
      const env = this.configService.get<IEnv>('env');
      const payload = await this.jwtService.verifyAsync(token as string, {
        secret: env?.JWT_CONFIG.JWT_SECRET,
      });

      const dbUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          bio: true,
          isOnline: true,
        },
      });

      if (!dbUser) {
        throw new WsException('Unauthorized: User not found');
      }

      client.data.user = dbUser;
      return true;
    } catch {
      throw new WsException('Unauthorized: Invalid token');
    }
  }
}
