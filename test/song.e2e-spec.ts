import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Song 도메인 E2E.
 * 곡 생성 API 가 없으므로 PrismaService 로 songs 를 직접 seed 한 뒤
 * 목록/검색(한글 부분일치)/단건/삭제를 검증한다.
 */
describe('Song E2E (songs)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  // 시드용 곡 데이터. id 를 고정해 단건/삭제 검증을 단순화한다.
  const songs = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      title: '좋은 날',
      artist: '아이유',
      duration: 219,
      albumImagePath: '/images/iu-goodday.png',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      title: '밤편지',
      artist: '아이유',
      duration: 254,
      albumImagePath: '/images/iu-nightletter.png',
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      title: 'Dynamite',
      artist: 'BTS',
      duration: 199,
      albumImagePath: '/images/bts-dynamite.png',
    },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);
    await prisma.song.createMany({ data: songs });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /songs → 200 + 전체 목록', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs'))
      .expect(200);

    expect(Array.isArray(res.body.songResponses)).toBe(true);
    expect(res.body.songResponses).toHaveLength(3);
    // duration 필드가 포함되어야 한다 (SongResponse)
    const sample = res.body.songResponses[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('title');
    expect(sample).toHaveProperty('artist');
    expect(sample).toHaveProperty('duration');
    expect(sample).toHaveProperty('albumImagePath');
  });

  it("GET /songs/search?query=아이 → 가수 '아이유' 부분일치 검색", async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/search'))
      .query({ query: '아이' })
      .expect(200);

    const results = res.body.songSearchResponses;
    expect(Array.isArray(results)).toBe(true);
    // 아이유 곡 2건이 검색되어야 한다.
    const artists = results.map((s: { artist: string }) => s.artist);
    expect(artists).toContain('아이유');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // 검색 응답에는 duration 이 없어야 한다 (SongSearchResponse)
    expect(results[0]).not.toHaveProperty('duration');
    expect(results[0]).toHaveProperty('albumImagePath');
  });

  it('GET /songs/search?query=밤편지 → 제목 부분일치 검색', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/search'))
      .query({ query: '밤편지' })
      .expect(200);

    const results = res.body.songSearchResponses;
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((s: { title: string }) => s.title === '밤편지')).toBe(
      true,
    );
  });

  it('GET /songs/search (query 누락) → 400', async () => {
    await request(app.getHttpServer()).get(api('/songs/search')).expect(400);
  });

  it('GET /songs/:id → 200 + 단건', async () => {
    const res = await request(app.getHttpServer())
      .get(api(`/songs/${songs[0].id}`))
      .expect(200);

    expect(res.body.id).toBe(songs[0].id);
    expect(res.body.title).toBe(songs[0].title);
    expect(res.body.artist).toBe(songs[0].artist);
    expect(res.body.duration).toBe(songs[0].duration);
  });

  it('GET /songs/:id (없는 곡) → 404 (SONG_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/songs/99999999-9999-9999-9999-999999999999'))
      .expect(404);
    expect(res.body.code).toBe('SONG_NOT_FOUND');
  });

  it('DELETE /songs/:id → 204 + 실제 삭제', async () => {
    await request(app.getHttpServer())
      .delete(api(`/songs/${songs[2].id}`))
      .expect(204);

    // 삭제 후 단건 조회는 404
    await request(app.getHttpServer())
      .get(api(`/songs/${songs[2].id}`))
      .expect(404);

    // 목록도 2건으로 줄어든다.
    const res = await request(app.getHttpServer())
      .get(api('/songs'))
      .expect(200);
    expect(res.body.songResponses).toHaveLength(2);
  });

  it('DELETE /songs/:id (없는 곡) → 404 (SONG_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .delete(api('/songs/99999999-9999-9999-9999-999999999999'))
      .expect(404);
    expect(res.body.code).toBe('SONG_NOT_FOUND');
  });
});
