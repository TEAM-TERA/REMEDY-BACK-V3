import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { CommentModule } from '../src/modules/comment/comment.module';
import { truncateAll } from './utils/test-app';

/**
 * Comment 도메인 E2E.
 *
 * 참고: 현 시점 src/app.module.ts 가 CommentModule 을 아직 import 하지 않으므로
 * (수정 금지 파일 + 도메인 병렬 개발 중), 본 스펙은 AppModule 과 함께 CommentModule 을
 * 직접 import 하는 테스트 전용 모듈로 앱을 부팅한다. app.module 에 CommentModule 이
 * 정식 등록되면 이 보강 import 는 제거 가능하다.
 */
async function createCommentTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule, CommentModule],
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

describe('Comment E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  // 작성자
  const author = {
    username: '작성자',
    password: 'author-secret-1',
    email: 'author@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };
  // 타 유저 (권한 검증용)
  const other = {
    username: '타인',
    password: 'other-secret-1',
    email: 'comment-other@example.com',
    birthDate: '2001-02-02',
    gender: false,
  };

  let authorToken: string;
  let otherToken: string;
  let authorId: number;
  let droppingId: string;

  const registerAndLogin = async (u: typeof author): Promise<string> => {
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
    app = await createCommentTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    authorToken = await registerAndLogin(author);
    otherToken = await registerAndLogin(other);

    const authorUser = await prisma.user.findUnique({
      where: { email: author.email },
    });
    authorId = authorUser!.id;

    // 드랍핑은 PrismaService 로 직접 seed
    const dropping = await prisma.dropping.create({
      data: {
        droppingType: 'MUSIC',
        payload: { songId: 's' },
        userId: authorId,
        latitude: 37.5,
        longitude: 127.0,
        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        content: null,
      },
    });
    droppingId = dropping.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let commentId: number;

  it('POST /comments → 201 (작성)', async () => {
    await request(app.getHttpServer())
      .post(api('/comments'))
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ content: '첫 댓글', droppingId })
      .expect(201);

    const created = await prisma.comment.findFirst({
      where: { droppingId, content: '첫 댓글' },
    });
    expect(created).toBeTruthy();
    commentId = created!.id;
  });

  it('토큰 없이 POST /comments → 401', async () => {
    await request(app.getHttpServer())
      .post(api('/comments'))
      .send({ content: 'x', droppingId })
      .expect(401);
  });

  it('content 누락 시 POST /comments → 400', async () => {
    await request(app.getHttpServer())
      .post(api('/comments'))
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ droppingId })
      .expect(400);
  });

  it('존재하지 않는 드랍핑에 작성 → 404 (DROPPING_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/comments'))
      .set('Authorization', `Bearer ${authorToken}`)
      .send({
        content: '댓글',
        droppingId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(404);
    expect(res.body.code).toBe('DROPPING_NOT_FOUND');
  });

  it('GET /comments/droppings/:droppingId → 200 (목록, 작성자 username 포함)', async () => {
    const res = await request(app.getHttpServer())
      .get(api(`/comments/droppings/${droppingId}`))
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: commentId,
      content: '첫 댓글',
      droppingId,
      username: author.username,
    });
  });

  it('GET /comments/count/:droppingId → 200 (댓글 수)', async () => {
    const res = await request(app.getHttpServer())
      .get(api(`/comments/count/${droppingId}`))
      .expect(200);
    expect(res.body.count).toBe(1);
  });

  it('존재하지 않는 드랍핑 댓글 수 → 404 (DROPPING_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/comments/count/00000000-0000-0000-0000-000000000000'))
      .expect(404);
    expect(res.body.code).toBe('DROPPING_NOT_FOUND');
  });

  it('PUT /comments/:commentId → 200 (본인 수정)', async () => {
    await request(app.getHttpServer())
      .put(api(`/comments/${commentId}`))
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ content: '수정된 댓글' })
      .expect(200);

    const updated = await prisma.comment.findUnique({
      where: { id: commentId },
    });
    expect(updated!.content).toBe('수정된 댓글');
  });

  it('타 유저 수정 → 403 (COMMENT_ACCESS_DENIED)', async () => {
    const res = await request(app.getHttpServer())
      .put(api(`/comments/${commentId}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ content: '해킹' })
      .expect(403);
    expect(res.body.code).toBe('COMMENT_ACCESS_DENIED');
  });

  it('존재하지 않는 댓글 수정 → 404 (COMMENT_NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer())
      .put(api('/comments/999999'))
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ content: 'x' })
      .expect(404);
    expect(res.body.code).toBe('COMMENT_NOT_FOUND');
  });

  it('타 유저 삭제 → 403 (COMMENT_ACCESS_DENIED)', async () => {
    const res = await request(app.getHttpServer())
      .delete(api(`/comments/${commentId}`))
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    expect(res.body.code).toBe('COMMENT_ACCESS_DENIED');
  });

  it('DELETE /comments/:commentId → 200 (본인 삭제)', async () => {
    await request(app.getHttpServer())
      .delete(api(`/comments/${commentId}`))
      .set('Authorization', `Bearer ${authorToken}`)
      .expect(200);

    const deleted = await prisma.comment.findUnique({
      where: { id: commentId },
    });
    expect(deleted).toBeNull();
  });
});
