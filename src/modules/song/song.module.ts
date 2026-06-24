import { Module } from '@nestjs/common';
import { SongController } from './song.controller';
import { SongService } from './song.service';

/**
 * 곡 도메인 모듈.
 * PrismaModule 은 전역(@Global)이라 별도 import 불필요.
 * SongService 를 export 하여 다른 도메인(예: 플레이리스트/드로핑)이 곡 조회를 재사용할 수 있게 한다.
 */
@Module({
  controllers: [SongController],
  providers: [SongService],
  exports: [SongService],
})
export class SongModule {}
