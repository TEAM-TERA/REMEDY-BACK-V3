import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, registerAndLogin, truncateAll } from './utils/test-app';

/**
 * Playlist 도메인 E2E.
 */
describe('Playlist E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  // 소유자
  const owner = {
    username: '주인',
    password: 'owner-secret-1',
    email: 'owner@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };
  // 타 유저 (권한 검증용)
  const other = {
    username: '타인',
    password: 'other-secret-1',
    email: 'other@example.com',
    birthDate: '2001-02-02',
    gender: false,
  };

  let ownerToken: string;
  let otherToken: string;

  // seed songs
  const songA = {
    id: 'song-a',
    title: 'Song A',
    artist: 'Artist A',
    duration: 180,
    albumImagePath: 'https://img/a.jpg',
  };
  const songB = {
    id: 'song-b',
    title: 'Song B',
    artist: 'Artist B',
    duration: 200,
    albumImagePath: 'https://img/b.jpg',
  };
  const songC = {
    id: 'song-c',
    title: 'Song C',
    artist: 'Artist C',
    duration: 220,
    albumImagePath: 'https://img/c.jpg',
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    ownerToken = await registerAndLogin(app, owner);
    otherToken = await registerAndLogin(app, other);

    await prisma.song.createMany({ data: [songA, songB, songC] });
  });

  afterAll(async () => {
    await app.close();
  });

  let playlistId: string;

  it('POST /playlists → 201 (생성)', async () => {
    await request(app.getHttpServer())
      .post(api('/playlists'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: '내 첫 플레이리스트' })
      .expect(201);

    const created = await prisma.playlist.findFirst({
      where: { name: '내 첫 플레이리스트' },
    });
    expect(created).toBeTruthy();
    playlistId = created!.id;
  });

  it('토큰 없이 POST /playlists → 401', async () => {
    await request(app.getHttpServer())
      .post(api('/playlists'))
      .send({ name: 'x' })
      .expect(401);
  });

  it('name 누락 시 POST /playlists → 400', async () => {
    await request(app.getHttpServer())
      .post(api('/playlists'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(400);
  });

  it('POST /playlists/:id/songs → 201 (곡 추가, 순서 유지)', async () => {
    await request(app.getHttpServer())
      .post(api(`/playlists/${playlistId}/songs`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ songIds: [songA.id, songB.id] })
      .expect(201);

    const updated = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    expect(updated!.songIds).toEqual([songA.id, songB.id]);
  });

  it('중복 곡 추가 → 409 (SONG_ALREADY_IN_PLAYLIST)', async () => {
    const res = await request(app.getHttpServer())
      .post(api(`/playlists/${playlistId}/songs`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ songIds: [songA.id] })
      .expect(409);
    expect(res.body.code).toBe('SONG_ALREADY_IN_PLAYLIST');
  });

  it('존재하지 않는 곡 추가 → 404 (SONG_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .post(api(`/playlists/${playlistId}/songs`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ songIds: ['no-such-song'] })
      .expect(404);
    expect(res.body.code).toBe('SONG_NOT_FOUND');
  });

  it('GET /playlists/:id → 200 (곡 resolved, 순서 유지)', async () => {
    const res = await request(app.getHttpServer())
      .get(api(`/playlists/${playlistId}`))
      .expect(200);

    expect(res.body.id).toBe(playlistId);
    expect(res.body.name).toBe('내 첫 플레이리스트');
    expect(res.body.songs.map((s: { id: string }) => s.id)).toEqual([
      songA.id,
      songB.id,
    ]);
    expect(res.body.songs[0]).toMatchObject({
      id: songA.id,
      title: songA.title,
      artist: songA.artist,
      duration: songA.duration,
      albumImagePath: songA.albumImagePath,
    });
  });

  it('존재하지 않는 플레이리스트 상세 → 404 (PLAYLIST_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/playlists/00000000-0000-0000-0000-000000000000'))
      .expect(404);
    expect(res.body.code).toBe('PLAYLIST_NOT_FOUND');
  });

  it('GET /playlists/my → 200 (내 목록, 대표 앨범 이미지)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/playlists/my'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(Array.isArray(res.body.playlists)).toBe(true);
    expect(res.body.playlists).toHaveLength(1);
    expect(res.body.playlists[0]).toMatchObject({
      id: playlistId,
      name: '내 첫 플레이리스트',
      albumImageUrl: songA.albumImagePath, // 첫 곡의 앨범 이미지
    });
  });

  it('타 유저 목록은 비어있음', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/playlists/my'))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(res.body.playlists).toHaveLength(0);
  });

  it('PUT /playlists/:id → 204 (이름 수정)', async () => {
    await request(app.getHttpServer())
      .put(api(`/playlists/${playlistId}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: '수정된 이름' })
      .expect(204);

    const updated = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    expect(updated!.name).toBe('수정된 이름');
  });

  it('타 유저 이름 수정 → 403 (UNAUTHORIZED_PLAYLIST_ACCESS)', async () => {
    const res = await request(app.getHttpServer())
      .put(api(`/playlists/${playlistId}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: '해킹' })
      .expect(403);
    expect(res.body.code).toBe('UNAUTHORIZED_PLAYLIST_ACCESS');
  });

  it('타 유저 곡 추가 → 403', async () => {
    const res = await request(app.getHttpServer())
      .post(api(`/playlists/${playlistId}/songs`))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ songIds: [songC.id] })
      .expect(403);
    expect(res.body.code).toBe('UNAUTHORIZED_PLAYLIST_ACCESS');
  });

  it('DELETE /playlists/:id/songs/:songId → 204 (곡 제거)', async () => {
    await request(app.getHttpServer())
      .delete(api(`/playlists/${playlistId}/songs/${songA.id}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const updated = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    expect(updated!.songIds).toEqual([songB.id]);
  });

  it('플레이리스트에 없는 곡 제거 → 404 (SONG_NOT_IN_PLAYLIST)', async () => {
    const res = await request(app.getHttpServer())
      .delete(api(`/playlists/${playlistId}/songs/${songA.id}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(res.body.code).toBe('SONG_NOT_IN_PLAYLIST');
  });

  it('타 유저 곡 제거 → 403', async () => {
    const res = await request(app.getHttpServer())
      .delete(api(`/playlists/${playlistId}/songs/${songB.id}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    expect(res.body.code).toBe('UNAUTHORIZED_PLAYLIST_ACCESS');
  });

  it('타 유저 삭제 → 403', async () => {
    const res = await request(app.getHttpServer())
      .delete(api(`/playlists/${playlistId}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    expect(res.body.code).toBe('UNAUTHORIZED_PLAYLIST_ACCESS');
  });

  it('DELETE /playlists/:id → 204 (삭제)', async () => {
    await request(app.getHttpServer())
      .delete(api(`/playlists/${playlistId}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const deleted = await prisma.playlist.findUnique({
      where: { id: playlistId },
    });
    expect(deleted).toBeNull();
  });
});
