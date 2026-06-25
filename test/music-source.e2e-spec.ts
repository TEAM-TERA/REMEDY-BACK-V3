import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpotifyMusicClient } from '../src/modules/music-source/clients/spotify-music.client';
import {
  YouTubeMatch,
  YouTubeMusicResolver,
} from '../src/modules/music-source/clients/youtube-music.resolver';
import { MusicTrack } from '../src/modules/music-source/music-track';

/**
 * 외부 음원 소스 통합 E2E.
 * 드랍 생성 → Spotify 에서 곡 fetch + YouTube 매칭 1회 resolve + songs 캐시 upsert →
 * 드랍 상세에 플랫폼별 playLinks(YouTube 가용성 포함) 노출까지 검증한다.
 */
describe('Music source 통합 E2E (Spotify fetch + YouTube resolve)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  // Spotify 카탈로그(mock)
  const catalog: MusicTrack[] = [
    {
      id: 'ms-ok',
      title: 'Map Song',
      artist: 'Artist OK',
      album: 'Album OK',
      duration: 210,
      albumImagePath: 'https://img/ok.jpg',
    },
    {
      id: 'ms-noyt',
      title: 'No YT Song',
      artist: 'Artist NoYT',
      album: 'Album NoYT',
      duration: 190,
      albumImagePath: 'https://img/noyt.jpg',
    },
    {
      id: 'ms-err',
      title: 'YT Error Song',
      artist: 'Artist Err',
      album: null,
      duration: 200,
      albumImagePath: 'https://img/err.jpg',
    },
    {
      id: 'ms-pl-new',
      title: 'Playlist New Song',
      artist: 'Artist PL',
      album: 'Album PL',
      duration: 175,
      albumImagePath: 'https://img/pl.jpg',
    },
  ];

  const spotifyMock = {
    search: jest.fn((): Promise<MusicTrack[]> => Promise.resolve(catalog)),
    getTracks: jest.fn(
      (ids: string[]): Promise<MusicTrack[]> =>
        Promise.resolve(catalog.filter((t) => ids.includes(t.id))),
    ),
  };

  // YouTube 매칭: ms-ok=매칭, ms-noyt=매칭없음(null), ms-err=확인불가(throw)
  const youtubeMock = {
    resolve: jest.fn(
      (track: { title: string }): Promise<YouTubeMatch | null> => {
        if (track.title === 'No YT Song') return Promise.resolve(null);
        if (track.title === 'YT Error Song') {
          return Promise.reject(new Error('quota exceeded'));
        }
        return Promise.resolve({ videoId: 'yt-map' });
      },
    ),
  };

  const user = {
    username: '음원유저',
    password: 'music-secret-1',
    email: 'music@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };
  let token: string;

  async function dropMusic(
    songId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'MUSIC',
        songId,
        latitude: lat,
        longitude: lng,
        address: '서울',
      })
      .expect(201);
  }

  async function detailOf(songId: string): Promise<request.Response> {
    const dropping = await prisma.dropping.findFirst({
      where: { payload: { equals: { songId } } },
    });
    return request(app.getHttpServer())
      .get(api(`/droppings/${dropping!.id}`))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp((b) =>
      b
        .overrideProvider(SpotifyMusicClient)
        .useValue(spotifyMock)
        .overrideProvider(YouTubeMusicResolver)
        .useValue(youtubeMock),
    );
    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send(user)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: user.email, password: user.password })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('MUSIC 드랍 생성 → 미캐시 곡을 Spotify 에서 fetch + 캐시(youtubeVideoId 포함)', async () => {
    await dropMusic('ms-ok', 37.5, 127.0);

    const song = await prisma.song.findUnique({ where: { id: 'ms-ok' } });
    expect(song).toBeTruthy();
    expect(song!.title).toBe('Map Song');
    expect(song!.album).toBe('Album OK');
    expect(song!.youtubeVideoId).toBe('yt-map');
    expect(song!.youtubeChecked).toBe(true);
  });

  it('드랍 상세 → playLinks 양쪽 available (YT 매칭됨)', async () => {
    const res = await detailOf('ms-ok');
    expect(res.body.playLinks.spotify).toEqual({
      available: true,
      url: 'https://open.spotify.com/track/ms-ok',
    });
    expect(res.body.playLinks.youtubeMusic).toEqual({
      available: true,
      url: 'https://music.youtube.com/watch?v=yt-map',
    });
  });

  it('YT 매칭 없는 곡 → 캐시 checked=true, 상세 youtubeMusic 미지원', async () => {
    await dropMusic('ms-noyt', 37.6, 127.1);

    const song = await prisma.song.findUnique({ where: { id: 'ms-noyt' } });
    expect(song!.youtubeChecked).toBe(true);
    expect(song!.youtubeVideoId).toBeNull();

    const res = await detailOf('ms-noyt');
    expect(res.body.playLinks.youtubeMusic).toEqual({
      available: false,
      url: null,
    });
  });

  it('YT 확인 불가(쿼터/오류) → best-effort: 곡은 생성되고 checked=false(미확인)', async () => {
    await dropMusic('ms-err', 37.7, 127.2);

    const song = await prisma.song.findUnique({ where: { id: 'ms-err' } });
    expect(song).toBeTruthy(); // 드랍 생성은 막히지 않음
    expect(song!.youtubeChecked).toBe(false);
    expect(song!.youtubeVideoId).toBeNull();

    const res = await detailOf('ms-err');
    expect(res.body.playLinks.youtubeMusic.available).toBe(false);
  });

  it('이미 캐시된 곡 재드랍 → 외부 호출 없음(cache hit)', async () => {
    const ytBefore = youtubeMock.resolve.mock.calls.length;
    const spBefore = spotifyMock.getTracks.mock.calls.length;

    // ms-ok 는 이미 캐시됨 → 다른 위치에 재드랍해도 외부 fetch/resolve 없어야 함
    await dropMusic('ms-ok', 37.9, 127.4);

    expect(youtubeMock.resolve.mock.calls.length).toBe(ytBefore);
    expect(spotifyMock.getTracks.mock.calls.length).toBe(spBefore);
  });

  it('PLAYLIST 다곡 드랍 → 부분 캐시: 새 곡만 fetch + YT resolve(곡당 1회)', async () => {
    const ytBefore = youtubeMock.resolve.mock.calls.length;

    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'PLAYLIST',
        playlistName: '믹스',
        songIds: ['ms-ok', 'ms-pl-new'], // ms-ok 캐시 hit, ms-pl-new 신규
        latitude: 37.95,
        longitude: 127.5,
        address: '서울',
      })
      .expect(201);

    const newSong = await prisma.song.findUnique({
      where: { id: 'ms-pl-new' },
    });
    expect(newSong).toBeTruthy();
    expect(newSong!.youtubeVideoId).toBe('yt-map');

    // 신규 곡(ms-pl-new) 1건만 resolve, 캐시 hit(ms-ok)은 호출 안 함
    expect(youtubeMock.resolve.mock.calls.length).toBe(ytBefore + 1);
  });

  it('Spotify 에 없는 songId 로 드랍 → 404 (SONG_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'MUSIC',
        songId: 'does-not-exist',
        latitude: 37.8,
        longitude: 127.3,
        address: '서울',
      })
      .expect(404);
    expect(res.body.code).toBe('SONG_NOT_FOUND');
  });
});
