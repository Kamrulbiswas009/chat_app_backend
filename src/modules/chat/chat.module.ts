import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: process.env.JWT_SECRET,
        signOptions: {
          expiresIn: '7d',
        },
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, WsJwtGuard],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
