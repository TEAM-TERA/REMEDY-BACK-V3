import { Module } from '@nestjs/common';
import { SongModule } from '../song/song.module';
import { DroppingController } from './dropping.controller';
import { DroppingService } from './dropping.service';

/**
 * dropping 도메인 모듈 (이 서비스의 핵심).
 * PrismaModule 은 전역(@Global)이라 별도 import 불필요.
 * 만료 정리 cron(@Cron)을 위해 ScheduleModule 은 AppModule 에 forRoot 등록되어 있다.
 * SongModule 을 import 해 곡 생성 시 SongService.ensureSongs(Spotify upsert)를 재사용한다.
 * DroppingService 를 export 하여 user 모듈(my-drop)이 getUserDroppings 를 재사용할 수 있게 한다.
 */
@Module({
  imports: [SongModule],
  controllers: [DroppingController],
  providers: [DroppingService],
  exports: [DroppingService],
})
export class DroppingModule {}
