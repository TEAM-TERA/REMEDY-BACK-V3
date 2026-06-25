import { Module } from '@nestjs/common';
import { MusicSourceModule } from '../music-source/music-source.module';
import { SongController } from './song.controller';
import { SongService } from './song.service';

/**
 * 곡 도메인 모듈.
 * PrismaModule 은 전역(@Global)이라 별도 import 불필요.
 * MusicSourceModule 을 import 해 Spotify 검색/YouTube 매칭 클라이언트를 주입받는다.
 * SongService 를 export 하여 다른 도메인(드로핑 등)이 곡 캐시/검색을 재사용할 수 있게 한다.
 */
@Module({
  imports: [MusicSourceModule],
  controllers: [SongController],
  providers: [SongService],
  exports: [SongService],
})
export class SongModule {}
