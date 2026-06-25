import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Foundation 스모크: health + 회원가입/로그인/프로필 + 인증 가드.
 */
describe('Foundation E2E (auth/user/health)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  const user = {
    username: '현우',
    password: 'super-secret-1',
    email: 'foundation@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200', async () => {
    await request(app.getHttpServer()).get(api('/health')).expect(200);
  });

  it('POST /auth/register → 201', async () => {
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send(user)
      .expect(201);
  });

  it('중복 가입 → 409 (USER_ALREADY_EXISTS)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send(user)
      .expect(409);
    expect(res.body.code).toBe('USER_ALREADY_EXISTS');
  });

  it('잘못된 비밀번호 로그인 → 400 (INVALID_PASSWORD)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: user.email, password: 'wrong-password' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_PASSWORD');
  });

  it('POST /auth/login → 200 + accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: user.email, password: user.password })
      .expect(200);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('토큰 없이 GET /users → 401', async () => {
    await request(app.getHttpServer()).get(api('/users')).expect(401);
  });

  it('GET /users (인증) → 200 + 프로필', async () => {
    const login = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: user.email, password: user.password })
      .expect(200);
    const token = login.body.accessToken as string;

    const res = await request(app.getHttpServer())
      .get(api('/users'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.username).toBe(user.username);
    expect(res.body.gender).toBe(true);
  });

  it('탈퇴 후에는 유효 토큰이어도 인증 거부 → 403 (USER_WITHDRAWN)', async () => {
    const quitter = {
      username: '탈퇴자',
      password: 'quit-secret-1',
      email: 'quitter@example.com',
      birthDate: '2000-03-03',
      gender: false,
    };
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send(quitter)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: quitter.email, password: quitter.password })
      .expect(200);
    const token = login.body.accessToken as string;

    // 탈퇴(soft-delete) 수행 — 토큰은 그대로 유효
    await request(app.getHttpServer())
      .post(api('/users/withdrawal'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // 같은 토큰으로 재접근 → 403
    const res = await request(app.getHttpServer())
      .get(api('/users'))
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(res.body.code).toBe('USER_WITHDRAWN');
  });
});
