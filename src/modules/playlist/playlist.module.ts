import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlaylistController } from './playlist.controller';
import { PlaylistService } from './playlist.service';

/**
 * 플레이리스트 도메인 모듈.
 * - JwtAuthGuard(passport-jwt) 사용을 위해 AuthModule(PassportModule export)을 import 한다.
 * - PrismaService 는 전역(PrismaModule @Global)이라 별도 import 불필요.
 */
@Module({
  imports: [AuthModule],
  controllers: [PlaylistController],
  providers: [PlaylistService],
  exports: [PlaylistService],
})
export class PlaylistModule {}
