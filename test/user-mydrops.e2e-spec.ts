import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * User my-drop / my-like E2E (dropping·like 서비스 연동).
 */
describe('User my-drop/my-like E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  const user = {
    username: '드랍퍼',
    password: 'dropper-secret-1',
    email: 'dropper@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };

  let token: string;
  let userId: number;
  let droppingId: string;

  beforeAll(async () => {
    app = await createTestApp();
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

    const created = await prisma.user.findUnique({
      where: { email: user.email },
    });
    userId = created!.id;

    await prisma.song.create({
      data: {
        id: 'my-song',
        title: 'My Song',
        artist: 'My Artist',
        duration: 200,
        albumImagePath: 'https://img/my.jpg',
      },
    });

    const dropping = await prisma.dropping.create({
      data: {
        droppingType: 'MUSIC',
        payload: { songId: 'my-song' },
        userId,
        latitude: 37.5,
        longitude: 127.0,
        content: null,
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    droppingId = dropping.id;

    await prisma.like.create({ data: { userId, droppingId } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/my-drop → 내가 드랍한 목록', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/users/my-drop'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.droppings)).toBe(true);
    expect(res.body.droppings).toHaveLength(1);
    expect(res.body.droppings[0].droppingId).toBe(droppingId);
    expect(res.body.droppings[0].isMyDropping).toBe(true);
  });

  it('GET /users/my-like → 내가 좋아요한 드랍 목록', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/users/my-like'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.droppings)).toBe(true);
    expect(res.body.droppings).toHaveLength(1);
    expect(res.body.droppings[0].droppingId).toBe(droppingId);
  });

  it('토큰 없이 my-drop → 401', async () => {
    await request(app.getHttpServer()).get(api('/users/my-drop')).expect(401);
  });
});
