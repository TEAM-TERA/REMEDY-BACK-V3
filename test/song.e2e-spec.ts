import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpotifyMusicClient } from '../src/modules/music-source/clients/spotify-music.client';
import { MusicTrack } from '../src/modules/music-source/music-track';

/**
 * Song 도메인 E2E.
 * - 검색: Spotify 프록시(클라이언트 mock 주입). 결과 형태/필드 검증.
 * - 단건/목록/삭제: 로컬 캐시(prisma 시드). playLinks(YouTube 가용성 포함) 검증.
 */
describe('Song E2E (songs)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  // Spotify 검색 mock 카탈로그
  const catalog: MusicTrack[] = [
    {
      id: 'sp-iu-goodday',
      title: '좋은 날',
      artist: '아이유',
      album: 'Real',
      duration: 219,
      albumImagePath: 'https://img/iu-goodday.jpg',
    },
    {
      id: 'sp-iu-nightletter',
      title: '밤편지',
      artist: '아이유',
      album: 'Palette',
      duration: 254,
      albumImagePath: 'https://img/iu-night.jpg',
    },
    {
      id: 'sp-bts-dynamite',
      title: 'Dynamite',
      artist: 'BTS',
      album: 'Dynamite',
      duration: 199,
      albumImagePath: 'https://img/bts-dynamite.jpg',
    },
  ];

  const spotifyMock = {
    search: jest.fn((query: string): Promise<MusicTrack[]> => {
      const q = query.trim();
      return Promise.resolve(
        catalog.filter((t) => t.title.includes(q) || t.artist.includes(q)),
      );
    }),
    getTracks: jest.fn(
      (ids: string[]): Promise<MusicTrack[]> =>
        Promise.resolve(catalog.filter((t) => ids.includes(t.id))),
    ),
  };

  // 로컬 캐시 시드용 곡(이미 드랍되어 캐시된 상태를 모사). youtube 매칭 캐시도 포함.
  const cached = [
    {
      id: 'cached-yt-ok',
      title: 'Cached With YT',
      artist: 'Tester',
      album: 'Album A',
      duration: 200,
      albumImagePath: '/img/a.png',
      youtubeVideoId: 'vid-abc',
      youtubeChecked: true,
    },
    {
      id: 'cached-yt-none',
      title: 'Cached No YT',
      artist: 'Tester',
      album: null,
      duration: 180,
      albumImagePath: '/img/b.png',
      youtubeVideoId: null,
      youtubeChecked: true,
    },
  ];

  beforeAll(async () => {
    app = await createTestApp((b) =>
      b.overrideProvider(SpotifyMusicClient).useValue(spotifyMock),
    );
    prisma = app.get(PrismaService);
    await truncateAll(prisma);
    await prisma.song.createMany({ data: cached });
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /songs/search?query=아이 → Spotify 프록시로 '아이유' 곡 검색", async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/search'))
      .query({ query: '아이' })
      .expect(200);

    const results = res.body.songSearchResponses;
    expect(Array.isArray(results)).toBe(true);
    const artists = results.map((s: { artist: string }) => s.artist);
    expect(artists).toContain('아이유');
    expect(results.length).toBe(2);
    // 검색 응답: album 포함, duration/playLinks 미포함
    expect(results[0]).toHaveProperty('album');
    expect(results[0]).not.toHaveProperty('duration');
    expect(results[0]).not.toHaveProperty('playLinks');
  });

  it('GET /songs/search?query=Dynamite → 제목 검색', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/search'))
      .query({ query: 'Dynamite' })
      .expect(200);

    const results = res.body.songSearchResponses;
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('sp-bts-dynamite');
    expect(results[0].artist).toBe('BTS');
  });

  it('GET /songs/search (query 누락) → 400', async () => {
    await request(app.getHttpServer()).get(api('/songs/search')).expect(400);
  });

  it('동일 검색어는 캐시로 응답 → Spotify 중복 호출 없음', async () => {
    spotifyMock.search.mockClear();

    const first = await request(app.getHttpServer())
      .get(api('/songs/search'))
      .query({ query: 'BTS' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(api('/songs/search'))
      .query({ query: 'BTS' })
      .expect(200);

    expect(second.body).toEqual(first.body);
    // 두 번 요청했지만 Spotify 검색은 1회만(캐시 hit)
    expect(spotifyMock.search).toHaveBeenCalledTimes(1);
  });

  it('GET /songs/:id (캐시, YT 매칭 있음) → playLinks 양쪽 available', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/cached-yt-ok'))
      .expect(200);

    expect(res.body.id).toBe('cached-yt-ok');
    expect(res.body.duration).toBe(200);
    expect(res.body.album).toBe('Album A');

    expect(res.body.playLinks.spotify).toEqual({
      available: true,
      url: 'https://open.spotify.com/track/cached-yt-ok',
    });
    expect(res.body.playLinks.youtubeMusic).toEqual({
      available: true,
      url: 'https://music.youtube.com/watch?v=vid-abc',
    });
  });

  it('GET /songs/:id (캐시, YT 매칭 없음) → youtubeMusic 미지원', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/cached-yt-none'))
      .expect(200);

    expect(res.body.playLinks.spotify.available).toBe(true);
    expect(res.body.playLinks.youtubeMusic).toEqual({
      available: false,
      url: null,
    });
  });

  it('GET /songs/:id (캐시에 없음) → 404 (SONG_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/sp-iu-goodday'))
      .expect(404);
    expect(res.body.code).toBe('SONG_NOT_FOUND');
  });

  it('GET /songs → 캐시된 목록(playLinks 포함)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs'))
      .expect(200);

    expect(res.body.songResponses).toHaveLength(2);
    expect(res.body.songResponses[0]).toHaveProperty('playLinks');
  });
});
