import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationController } from './notification.controller';
import { NotificationEmitter } from './notification.emitter';
import { NotificationService } from './notification.service';
import { SseJwtAuthGuard } from './guards/sse-jwt-auth.guard';

/**
 * 알림(Notification) 모듈.
 * - @Global: dropping/like/comment 서비스가 NotificationService 를 별도 import 없이 주입한다.
 * - AuthModule(JwtModule/PassportModule export) import: SSE 토큰 검증(JwtService) 및 JwtAuthGuard 사용.
 * - PrismaService 는 전역(PrismaModule)이라 별도 import 불필요.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationEmitter, SseJwtAuthGuard],
  exports: [NotificationService],
})
export class NotificationModule {}
