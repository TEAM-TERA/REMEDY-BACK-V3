import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpotifyMusicClient } from '../src/modules/music-source/clients/spotify-music.client';
import { MusicTrack } from '../src/modules/music-source/music-track';

/**
 * 검색 레이트 리밋 E2E.
 * /songs/search 는 IP 기준 레이트 리밋(기본 30회/60s)으로 보호된다 —
 * 한 클라이언트가 공유 Spotify 풀을 독식하지 못하게 한다.
 * (이 스펙은 자체 app 인스턴스라 throttler 카운터가 다른 스펙과 격리됨)
 */
describe('Search throttle E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  const spotifyMock = {
    search: jest.fn((): Promise<MusicTrack[]> => Promise.resolve([])),
    getTracks: jest.fn((): Promise<MusicTrack[]> => Promise.resolve([])),
  };

  beforeAll(async () => {
    app = await createTestApp((b) =>
      b.overrideProvider(SpotifyMusicClient).useValue(spotifyMock),
    );
    prisma = app.get(PrismaService);
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('기본 한도(30회/60s) 초과 시 429', async () => {
    const statuses: number[] = [];
    // 31회 순차 호출 → 30회까지 200, 31회째 429
    for (let i = 0; i < 31; i++) {
      const res = await request(app.getHttpServer())
        .get(api('/songs/search'))
        .query({ query: 'loadtest' });
      statuses.push(res.status);
    }

    expect(statuses[0]).toBe(200);
    expect(statuses[29]).toBe(200);
    expect(statuses[30]).toBe(429);
    // 캐시 덕분에 31회 요청에도 Spotify 검색은 1회만
    expect(spotifyMock.search).toHaveBeenCalledTimes(1);
  });
});
