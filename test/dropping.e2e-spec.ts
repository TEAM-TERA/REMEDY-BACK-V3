import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { DroppingModule } from '../src/modules/dropping/dropping.module';
import { truncateAll } from './utils/test-app';

/**
 * Dropping 도메인 E2E (이 서비스의 핵심).
 *
 * 참고: 현 시점 src/app.module.ts 가 DroppingModule 을 아직 import 하지 않으므로
 * (수정 금지 파일 + 통합 담당이 와이어링) 본 스펙은 AppModule 과 함께 DroppingModule 을
 * 직접 import 하는 테스트 전용 모듈로 앱을 부팅한다.
 *
 * 검증:
 *  - MUSIC 생성 → 근처 검색 포함 → 단건 조회 → soft delete → 삭제 후 검색 미포함
 *  - 같은 좌표 1m 중복 생성 시 409 (DROPPING_ALREADY_EXISTS)
 *  - 먼 좌표(km 단위) 검색 미포함
 *  - VOTE 생성 → vote/cancelVote → optionVotes 반영(prisma 로 payload 직접 확인)
 *
 * 좌표 기준점: 서울 시청 부근(lat 37.5665, lng 126.9780).
 *  - 같은 좌표: 1m 중복 충돌 유발
 *  - 근처: 경도 +0.0005도(약 44m) → 수십 m, 검색 distance 1km 면 충분히 포함
 *  - 먼 곳: lat/lng 각각 +0.5도(약 50km+) → 1km 검색에 미포함
 */
async function createDroppingTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, DroppingModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();
  return app;
}

describe('Dropping E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  const BASE_LAT = 37.5665;
  const BASE_LNG = 126.978;

  const owner = {
    username: '드랍주인',
    password: 'owner-secret-1',
    email: 'drop-owner@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };
  const other = {
    username: '드랍타인',
    password: 'other-secret-1',
    email: 'drop-other@example.com',
    birthDate: '2001-02-02',
    gender: false,
  };

  let ownerToken: string;
  let otherToken: string;

  const songs = [
    {
      id: 'd-song-1',
      title: '좋은 날',
      artist: '아이유',
      duration: 219,
      albumImagePath: '/img/song1.png',
    },
    {
      id: 'd-song-2',
      title: '밤편지',
      artist: '아이유',
      duration: 254,
      albumImagePath: '/img/song2.png',
    },
    {
      id: 'd-song-3',
      title: 'Dynamite',
      artist: 'BTS',
      duration: 199,
      albumImagePath: '/img/song3.png',
    },
  ];

  const registerAndLogin = async (u: typeof owner): Promise<string> => {
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send(u)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: u.email, password: u.password })
      .expect(200);
    return login.body.accessToken as string;
  };

  beforeAll(async () => {
    app = await createDroppingTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    ownerToken = await registerAndLogin(owner);
    otherToken = await registerAndLogin(other);

    await prisma.song.createMany({ data: songs });
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 인증 ────────────────────────────────────────────────────

  it('토큰 없이 POST /droppings → 401', async () => {
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .send({
        type: 'MUSIC',
        songId: 'd-song-1',
        latitude: BASE_LAT,
        longitude: BASE_LNG,
        address: '서울',
      })
      .expect(401);
  });

  // ── MUSIC 전체 흐름 ──────────────────────────────────────────

  let musicDroppingId: string;

  it('POST /droppings (MUSIC) → 201', async () => {
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'MUSIC',
        songId: 'd-song-1',
        content: '여기서 듣는 좋은 날',
        latitude: BASE_LAT,
        longitude: BASE_LNG,
        address: '서울 시청',
      })
      .expect(201);

    const created = await prisma.dropping.findFirst({
      where: { droppingType: 'MUSIC' },
    });
    expect(created).toBeTruthy();
    musicDroppingId = created!.id;
    // payload JSONB 구조 확인
    expect(created!.payload).toEqual({ songId: 'd-song-1' });
  });

  it('같은 좌표 1m 중복 생성 → 409 (DROPPING_ALREADY_EXISTS)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        type: 'MUSIC',
        songId: 'd-song-2',
        latitude: BASE_LAT,
        longitude: BASE_LNG,
        address: '서울 시청 바로 옆',
      })
      .expect(409);
    expect(res.body.code).toBe('DROPPING_ALREADY_EXISTS');
  });

  it('GET /droppings (근처) → MUSIC dropping 포함', async () => {
    // 약 44m 떨어진 곳에서 1km 반경 검색
    const res = await request(app.getHttpServer())
      .get(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({
        latitude: BASE_LAT,
        longitude: BASE_LNG + 0.0005,
        distance: 1, // km
      })
      .expect(200);

    const list = res.body.droppings;
    expect(Array.isArray(list)).toBe(true);
    const found = list.find(
      (d: { droppingId: string }) => d.droppingId === musicDroppingId,
    );
    expect(found).toBeTruthy();
    expect(found.type).toBe('MUSIC');
    expect(found.songId).toBe('d-song-1');
    expect(found.title).toBe('좋은 날');
    expect(found.albumImageUrl).toBe('/img/song1.png');
    expect(found.isMyDropping).toBe(true);
  });

  it('GET /droppings (먼 곳) → MUSIC dropping 미포함', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({
        latitude: BASE_LAT + 0.5, // 약 55km
        longitude: BASE_LNG + 0.5,
        distance: 1, // km
      })
      .expect(200);

    const list = res.body.droppings;
    const found = list.find(
      (d: { droppingId: string }) => d.droppingId === musicDroppingId,
    );
    expect(found).toBeUndefined();
  });

  it('GET /droppings (타 유저 근처 검색) → isMyDropping=false', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/droppings'))
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ latitude: BASE_LAT, longitude: BASE_LNG, distance: 1 })
      .expect(200);

    const found = res.body.droppings.find(
      (d: { droppingId: string }) => d.droppingId === musicDroppingId,
    );
    expect(found).toBeTruthy();
    expect(found.isMyDropping).toBe(false);
  });

  it('GET /droppings/:droppingId (MUSIC) → 단건 상세', async () => {
    const res = await request(app.getHttpServer())
      .get(api(`/droppings/${musicDroppingId}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.body.droppingId).toBe(musicDroppingId);
    expect(res.body.songId).toBe('d-song-1');
    expect(res.body.username).toBe(owner.username);
    expect(res.body.albumImageUrl).toBe('/img/song1.png');
    expect(res.body.content).toBe('여기서 듣는 좋은 날');
  });

  it('GET /droppings/:droppingId (없는 id) → 404 (DROPPING_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/droppings/99999999-9999-9999-9999-999999999999'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(res.body.code).toBe('DROPPING_NOT_FOUND');
  });

  it('DELETE /droppings/:droppingId (타 유저) → 403', async () => {
    const res = await request(app.getHttpServer())
      .delete(api(`/droppings/${musicDroppingId}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    expect(res.body.code).toBe('INVALID_DROPPING_DELETE_REQUEST');
  });

  it('DELETE /droppings/:droppingId (소유자) → 204 + soft delete', async () => {
    await request(app.getHttpServer())
      .delete(api(`/droppings/${musicDroppingId}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const row = await prisma.dropping.findUnique({
      where: { id: musicDroppingId },
    });
    expect(row!.isDeleted).toBe(true);
  });

  it('삭제 후 GET /droppings (근처) → 미포함', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ latitude: BASE_LAT, longitude: BASE_LNG, distance: 1 })
      .expect(200);

    const found = res.body.droppings.find(
      (d: { droppingId: string }) => d.droppingId === musicDroppingId,
    );
    expect(found).toBeUndefined();
  });

  // ── VOTE 흐름 ────────────────────────────────────────────────

  let voteDroppingId: string;
  // 이전 MUSIC dropping 은 soft delete 되어 1m 제약에 안 걸리므로 같은 좌표 재사용 가능
  const VOTE_LAT = BASE_LAT;
  const VOTE_LNG = BASE_LNG;

  it('POST /droppings (VOTE) → 201', async () => {
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'VOTE',
        topic: '최고의 곡은?',
        options: ['d-song-1', 'd-song-2'],
        latitude: VOTE_LAT,
        longitude: VOTE_LNG,
        address: '투표 장소',
      })
      .expect(201);

    const created = await prisma.dropping.findFirst({
      where: { droppingType: 'VOTE' },
    });
    expect(created).toBeTruthy();
    voteDroppingId = created!.id;
    expect(created!.payload).toEqual({
      topic: '최고의 곡은?',
      optionVotes: { 'd-song-1': [], 'd-song-2': [] },
    });
  });

  it('POST /droppings/:id/vote → 200 + optionVotes 반영', async () => {
    await request(app.getHttpServer())
      .post(api(`/droppings/${voteDroppingId}/vote`))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ songId: 'd-song-2' })
      .expect(200);

    const otherUser = await prisma.user.findUnique({
      where: { email: other.email },
    });
    const row = await prisma.dropping.findUnique({
      where: { id: voteDroppingId },
    });
    const payload = row!.payload as unknown as {
      optionVotes: Record<string, number[]>;
    };
    expect(payload.optionVotes['d-song-2']).toContain(otherUser!.id);
    expect(payload.optionVotes['d-song-1']).toHaveLength(0);
  });

  it('재투표(다른 옵션) → 기존 옵션에서 제거되고 새 옵션에만 존재', async () => {
    await request(app.getHttpServer())
      .post(api(`/droppings/${voteDroppingId}/vote`))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ songId: 'd-song-1' })
      .expect(200);

    const otherUser = await prisma.user.findUnique({
      where: { email: other.email },
    });
    const row = await prisma.dropping.findUnique({
      where: { id: voteDroppingId },
    });
    const payload = row!.payload as unknown as {
      optionVotes: Record<string, number[]>;
    };
    expect(payload.optionVotes['d-song-1']).toContain(otherUser!.id);
    expect(payload.optionVotes['d-song-2']).not.toContain(otherUser!.id);
  });

  it('존재하지 않는 옵션 투표 → 400 (INVALID_VOTE_OPTION)', async () => {
    const res = await request(app.getHttpServer())
      .post(api(`/droppings/${voteDroppingId}/vote`))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ songId: 'd-song-3' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_VOTE_OPTION');
  });

  it('GET /droppings/:id (VOTE) → 상세 + totalVotes/userVotedOption', async () => {
    const res = await request(app.getHttpServer())
      .get(api(`/droppings/${voteDroppingId}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);

    expect(res.body.topic).toBe('최고의 곡은?');
    expect(res.body.totalVotes).toBe(1);
    expect(res.body.userVotedOption).toBe('d-song-1');
    expect(res.body.options).toHaveLength(2);
    const opt1 = res.body.options.find(
      (o: { songId: string }) => o.songId === 'd-song-1',
    );
    expect(opt1.voteCount).toBe(1);
    expect(opt1.title).toBe('좋은 날');
  });

  it('DELETE /droppings/:id/vote → 204 + 모든 옵션에서 제거', async () => {
    await request(app.getHttpServer())
      .delete(api(`/droppings/${voteDroppingId}/vote`))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(204);

    const row = await prisma.dropping.findUnique({
      where: { id: voteDroppingId },
    });
    const payload = row!.payload as unknown as {
      optionVotes: Record<string, number[]>;
    };
    expect(payload.optionVotes['d-song-1']).toHaveLength(0);
    expect(payload.optionVotes['d-song-2']).toHaveLength(0);
  });

  // ── 검증 실패 케이스 ─────────────────────────────────────────

  it('MUSIC 타입에 songId 누락 → 400', async () => {
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'MUSIC',
        latitude: BASE_LAT + 0.2,
        longitude: BASE_LNG + 0.2,
        address: '어딘가',
      })
      .expect(400);
  });

  it('VOTE 타입 options 1개 → 400', async () => {
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'VOTE',
        topic: '하나뿐인 옵션',
        options: ['d-song-1'],
        latitude: BASE_LAT + 0.3,
        longitude: BASE_LNG + 0.3,
        address: '어딘가',
      })
      .expect(400);
  });
});
