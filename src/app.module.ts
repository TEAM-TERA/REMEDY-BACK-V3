import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/app-config.module';
import { LoggingModule } from './common/logging/logging.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { HealthModule } from './modules/health/health.module';
import { SongModule } from './modules/song/song.module';
import { PlaylistModule } from './modules/playlist/playlist.module';
import { OAuth2Module } from './modules/oauth2/oauth2.module';
import { DroppingModule } from './modules/dropping/dropping.module';
import { LikeModule } from './modules/like/like.module';
import { CommentModule } from './modules/comment/comment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './infrastructure/storage/storage.module';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    ScheduleModule.forRoot(),
    // 레이트 리밋(검색 등 외부 음원 호출 보호). 한도는 env 로 조정(기본 30회/60s).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('SEARCH_RATE_TTL_MS')) || 60_000,
            limit: Number(config.get('SEARCH_RATE_LIMIT')) || 30,
          },
        ],
      }),
    }),
    PrismaModule,
    StorageModule,
    HealthModule,
    AuthModule,
    UserModule,
    SongModule,
    PlaylistModule,
    OAuth2Module,
    DroppingModule,
    LikeModule,
    CommentModule,
    NotificationModule,
  ],
})
export class AppModule {}
