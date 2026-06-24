import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';

/**
 * 댓글(드롭 댓글) 도메인 모듈.
 * - JwtAuthGuard(passport-jwt) 사용을 위해 AuthModule(PassportModule export)을 import 한다.
 * - PrismaService 는 전역(PrismaModule @Global)이라 별도 import 불필요.
 */
@Module({
  imports: [AuthModule],
  controllers: [CommentController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}
