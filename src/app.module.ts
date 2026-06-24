import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/app-config.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { HealthModule } from './modules/health/health.module';
import { SongModule } from './modules/song/song.module';
import { PlaylistModule } from './modules/playlist/playlist.module';
import { OAuth2Module } from './modules/oauth2/oauth2.module';
import { DroppingModule } from './modules/dropping/dropping.module';
import { LikeModule } from './modules/like/like.module';
import { CommentModule } from './modules/comment/comment.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './infrastructure/storage/storage.module';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
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
  ],
})
export class AppModule {}
