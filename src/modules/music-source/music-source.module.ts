import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SpotifyMusicClient } from './clients/spotify-music.client';
import { SpotifyMusicClientImpl } from './clients/spotify-music.client.impl';
import { YouTubeMusicResolver } from './clients/youtube-music.resolver';
import { YouTubeMusicResolverImpl } from './clients/youtube-music.resolver.impl';

/**
 * 외부 음원 소스(Spotify 검색·식별 / YouTube Music 매칭) 모듈.
 * - HttpModule 로 외부 API 호출(타임아웃·리다이렉트 차단).
 * - 추상 토큰(SpotifyMusicClient/YouTubeMusicResolver)에 구현체를 바인딩 →
 *   E2E 에서 .overrideProvider(...) 로 가짜 구현 주입 가능.
 * - 클라이언트를 export 하여 SongModule(곡 캐시/검색)이 주입받아 사용한다.
 */
@Module({
  imports: [HttpModule.register({ timeout: 5000, maxRedirects: 0 })],
  providers: [
    { provide: SpotifyMusicClient, useClass: SpotifyMusicClientImpl },
    { provide: YouTubeMusicResolver, useClass: YouTubeMusicResolverImpl },
  ],
  exports: [SpotifyMusicClient, YouTubeMusicResolver],
})
export class MusicSourceModule {}
