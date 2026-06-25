import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, registerAndLogin, truncateAll } from './utils/test-app';

/**
 * Like 도메인 E2E.
 *
 * dropping 은 dropping 모듈과 무관하게 PrismaService 로 직접 seed 한다
 * (location 컬럼은 DB 트리거가 채움).
 */
describe('Like E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  const owner = {
    username: '좋아요유저',
    password: 'liker-secret-1',
    email: 'liker@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };
  const other = {
    username: '타인',
    password: 'other-secret-1',
    email: 'other-like@example.com',
    birthDate: '2001-02-02',
    gender: false,
  };

  let ownerToken: string;
  let otherToken: string;
  let ownerUserId: number;
  let droppingId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    ownerToken = await registerAndLogin(app, owner);
    otherToken = await registerAndLogin(app, other);

    const ownerUser = await prisma.user.findUnique({
      where: { email: owner.email },
    });
    ownerUserId = ownerUser!.id;

    // dropping 직접 seed (location 은 트리거가 채움)
    const future = new Date('2999-01-01T00:00:00.000Z');
    const dropping = await prisma.dropping.create({
      data: {
        droppingType: 'MUSIC',
        payload: { songId: 'song-x' },
        userId: ownerUserId,
        latitude: 37.5,
        longitude: 127.0,
        expiryDate: future,
        content: null,
      },
    });
    droppingId = dropping.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /likes → 200 (좋아요 생성, liked=true)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ droppingId })
      .expect(200);

    expect(res.body.liked).toBe(true);

    const count = await prisma.like.count({
      where: { userId: ownerUserId, droppingId },
    });
    expect(count).toBe(1);
  });

  it('POST /likes 재토글 → 200 (좋아요 취소, liked=false)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ droppingId })
      .expect(200);

    expect(res.body.liked).toBe(false);

    const count = await prisma.like.count({
      where: { userId: ownerUserId, droppingId },
    });
    expect(count).toBe(0);
  });

  it('토큰 없이 POST /likes → 401', async () => {
    await request(app.getHttpServer())
      .post(api('/likes'))
      .send({ droppingId })
      .expect(401);
  });

  it('droppingId 누락 시 POST /likes → 400', async () => {
    await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(400);
  });

  it('존재하지 않는 dropping 토글 → 404 (DROPPING_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ droppingId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
    expect(res.body.code).toBe('DROPPING_NOT_FOUND');
  });

  it('GET /likes/count/user → 200 (내 좋아요 수)', async () => {
    // owner, other 가 각각 좋아요 → owner 의 수는 1
    await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ droppingId })
      .expect(200);
    await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ droppingId })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(api('/likes/count/user'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.likeCount).toBe(1);
  });

  it('토큰 없이 GET /likes/count/user → 401', async () => {
    await request(app.getHttpServer())
      .get(api('/likes/count/user'))
      .expect(401);
  });

  it('GET /likes/count/dropping/:droppingId → 200 (드롭 좋아요 수)', async () => {
    // 직전 테스트에서 owner + other 가 좋아요 → 2
    const res = await request(app.getHttpServer())
      .get(api(`/likes/count/dropping/${droppingId}`))
      .expect(200);
    expect(res.body.likeCount).toBe(2);
  });

  it('존재하지 않는 dropping 카운트 → 404 (DROPPING_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/likes/count/dropping/00000000-0000-0000-0000-000000000000'))
      .expect(404);
    expect(res.body.code).toBe('DROPPING_NOT_FOUND');
  });
});
