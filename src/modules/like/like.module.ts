import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LikeController } from './like.controller';
import { LikeService } from './like.service';

/**
 * 좋아요(Like) 도메인 모듈.
 * - JwtAuthGuard(passport-jwt) 사용을 위해 AuthModule(PassportModule export)을 import 한다.
 * - PrismaService 는 전역(PrismaModule @Global)이라 별도 import 불필요.
 * - LikeService 는 user 의 my-like 등에서 재사용할 수 있도록 export 한다.
 */
@Module({
  imports: [AuthModule],
  controllers: [LikeController],
  providers: [LikeService],
  exports: [LikeService],
})
export class LikeModule {}
