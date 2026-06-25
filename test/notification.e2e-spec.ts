import { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { createTestApp, truncateAll } from './utils/test-app';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * 알림(Notification) E2E.
 * - 도메인 액션(드롭/좋아요/댓글) → 알림 영속화 + 표시 스냅샷 검증
 * - 자기 자신 액션 알림 제외, 안읽음 카운트/읽음 처리/IDOR
 * - SSE 구독: 인증(쿼리 토큰), connect 이벤트, 실시간 like-created 수신
 */
describe('Notification E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  const owner = {
    username: '드롭주인',
    password: 'owner-secret-1',
    email: 'owner@example.com',
    birthDate: '2000-01-01',
    gender: true,
  };
  const actor = {
    username: '반응자',
    password: 'actor-secret-1',
    email: 'actor@example.com',
    birthDate: '2000-02-02',
    gender: false,
  };

  let ownerToken: string;
  let actorToken: string;
  let ownerId: number;
  let droppingId: string;

  const songId = 'noti-song';

  async function registerAndLogin(u: typeof owner): Promise<string> {
    await request(app.getHttpServer())
      .post(api('/auth/register'))
      .send(u)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post(api('/auth/login'))
      .send({ email: u.email, password: u.password })
      .expect(200);
    return login.body.accessToken as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await truncateAll(prisma);

    ownerToken = await registerAndLogin(owner);
    actorToken = await registerAndLogin(actor);
    ownerId = (await prisma.user.findUnique({ where: { email: owner.email } }))!
      .id;

    await prisma.song.create({
      data: {
        id: songId,
        title: 'Noti Song',
        artist: 'Noti Artist',
        duration: 180,
        albumImagePath: 'https://img/noti.jpg',
      },
    });

    // 소유자가 MUSIC 드롭 생성 → dropping-created(본인) 알림 발행
    await request(app.getHttpServer())
      .post(api('/droppings'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'MUSIC',
        songId,
        latitude: 37.5,
        longitude: 127.0,
        address: '서울시 어딘가',
        content: '첫 드롭',
      })
      .expect(201);

    droppingId = (await prisma.dropping.findFirst({
      where: { userId: ownerId },
    }))!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('MUSIC 드롭 생성 시 생성자에게 DROPPING 알림이 쌓인다', async () => {
    const res = await request(app.getHttpServer())
      .get(api('/notifications'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const dropNoti = res.body.notifications.find(
      (n: { type: string }) => n.type === 'DROPPING',
    );
    expect(dropNoti).toBeDefined();
    expect(dropNoti.songId).toBe(songId);
    expect(dropNoti.droppingId).toBe(droppingId);
    expect(dropNoti.isRead).toBe(false);
  });

  it('타인이 좋아요/댓글 시 소유자에게 LIKE/COMMENT 알림(스냅샷 포함)', async () => {
    await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ droppingId })
      .expect(200);

    await request(app.getHttpServer())
      .post(api('/comments'))
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ droppingId, content: '멋진 선곡!' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(api('/notifications'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const like = res.body.notifications.find(
      (n: { type: string }) => n.type === 'LIKE',
    );
    const comment = res.body.notifications.find(
      (n: { type: string }) => n.type === 'COMMENT',
    );

    expect(like).toBeDefined();
    expect(like.actorUsername).toBe(actor.username);
    expect(like.droppingId).toBe(droppingId);

    expect(comment).toBeDefined();
    expect(comment.actorUsername).toBe(actor.username);
    expect(comment.commentContent).toBe('멋진 선곡!');

    // 최신순 정렬: 댓글이 좋아요보다 뒤에 생성 → 더 앞(index)이어야 함
    const types = res.body.notifications.map((n: { type: string }) => n.type);
    expect(types.indexOf('COMMENT')).toBeLessThan(types.indexOf('LIKE'));
  });

  it('자기 자신 드롭에 좋아요해도 추가 LIKE 알림이 생기지 않는다', async () => {
    const before = await prisma.notification.count({
      where: { recipientId: ownerId, type: 'LIKE' },
    });

    await request(app.getHttpServer())
      .post(api('/likes'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ droppingId })
      .expect(200);

    const after = await prisma.notification.count({
      where: { recipientId: ownerId, type: 'LIKE' },
    });
    expect(after).toBe(before);
  });

  it('안 읽음 개수 / 단건 읽음 / 전체 읽음 처리', async () => {
    const unread1 = await request(app.getHttpServer())
      .get(api('/notifications/unread-count'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(unread1.body.unreadCount).toBe(3); // DROPPING + LIKE + COMMENT

    const list = await request(app.getHttpServer())
      .get(api('/notifications'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const firstId = list.body.notifications[0].id as string;

    await request(app.getHttpServer())
      .patch(api(`/notifications/${firstId}/read`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const unread2 = await request(app.getHttpServer())
      .get(api('/notifications/unread-count'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(unread2.body.unreadCount).toBe(2);

    const all = await request(app.getHttpServer())
      .patch(api('/notifications/read-all'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(all.body.updated).toBe(2);

    const unread3 = await request(app.getHttpServer())
      .get(api('/notifications/unread-count'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(unread3.body.unreadCount).toBe(0);
  });

  it('타인의 알림을 읽음 처리하면 404 (IDOR 방지)', async () => {
    const ownerNoti = await prisma.notification.findFirst({
      where: { recipientId: ownerId },
    });

    await request(app.getHttpServer())
      .patch(api(`/notifications/${ownerNoti!.id}/read`))
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(404);
  });

  it('존재하지 않는 알림 읽음 처리 → 404', async () => {
    await request(app.getHttpServer())
      .patch(api('/notifications/00000000-0000-0000-0000-000000000000/read'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('limit/cursor 페이지네이션이 동작한다', async () => {
    const page1 = await request(app.getHttpServer())
      .get(api('/notifications?limit=2'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(page1.body.notifications).toHaveLength(2);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    const page2 = await request(app.getHttpServer())
      .get(api(`/notifications?limit=2&cursor=${page1.body.nextCursor}`))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    // 총 3건(DROPPING+LIKE+COMMENT) → 2번째 페이지는 1건, 다음 cursor 없음
    expect(page2.body.notifications).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    // 페이지 간 중복 없음
    const ids1 = (page1.body.notifications as Array<{ id: string }>).map(
      (n) => n.id,
    );
    const page2First = (page2.body.notifications as Array<{ id: string }>)[0]
      .id;
    expect(ids1).not.toContain(page2First);
  });

  describe('SSE 구독', () => {
    it('토큰 없이 구독 → 401', async () => {
      await request(app.getHttpServer())
        .get(api('/notifications/subscribe'))
        .expect(401);
    });

    it('잘못된 토큰으로 구독 → 401', async () => {
      await request(app.getHttpServer())
        .get(api('/notifications/subscribe?token=invalid.token.here'))
        .expect(401);
    });

    it('유효 토큰 구독 → connect 수신 후 실시간 like-created 수신', async () => {
      const server = app.getHttpServer();
      if (!server.listening) {
        await new Promise<void>((resolve) => {
          server.listen(0, resolve);
        });
      }
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}/api/v1`;

      const controller = new AbortController();
      const res = await fetch(
        `${base}/notifications/subscribe?token=${ownerToken}`,
        {
          signal: controller.signal,
          headers: { Accept: 'text/event-stream' },
        },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // 지정한 이벤트 이름이 스트림에 나타날 때까지 읽는다.
      // 미수신 시 it 타임아웃(15s)까지 매달리지 않도록 자체 타임아웃(5s)으로 빠르게 실패시킨다.
      const readUntil = async (marker: string): Promise<string> => {
        let buf = '';
        const deadline = Date.now() + 5000;
        while (!buf.includes(marker)) {
          let timer: NodeJS.Timeout | undefined;
          const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`'${marker}' 5s 내 미수신`)),
              Math.max(0, deadline - Date.now()),
            );
          });
          try {
            const { value, done } = await Promise.race([
              reader.read(),
              timeout,
            ]);
            if (done) throw new Error(`스트림 종료, '${marker}' 미수신`);
            buf += decoder.decode(value, { stream: true });
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
        return buf;
      };

      try {
        await readUntil('event: connect');

        // 다른 사용자가 좋아요 → 실시간 like-created 이벤트가 흘러야 함
        // (앞 테스트에서 actor 가 이미 좋아요한 상태이므로 토글 후 재좋아요)
        await request(server)
          .post(api('/likes'))
          .set('Authorization', `Bearer ${actorToken}`)
          .send({ droppingId }); // 토글 off
        await request(server)
          .post(api('/likes'))
          .set('Authorization', `Bearer ${actorToken}`)
          .send({ droppingId }); // 토글 on → 알림 발행

        const received = await readUntil('event: like-created');
        expect(received).toContain('like-created');
      } finally {
        controller.abort();
        reader.cancel().catch(() => undefined);
      }
    }, 15000);
  });

  // actor 를 삭제하므로 반드시 마지막에 실행(이후 actorToken 으로는 액션 불가)
  it('actor 탈퇴 후에도 actorUsername 스냅샷은 유지, actorId 는 null', async () => {
    const actorId = (await prisma.user.findUnique({
      where: { email: actor.email },
    }))!.id;

    // actor 하드 삭제 → FK(actor SetNull)로 알림의 actorId 만 null 처리
    await prisma.user.delete({ where: { id: actorId } });

    const res = await request(app.getHttpServer())
      .get(api('/notifications'))
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const like = res.body.notifications.find(
      (n: { type: string }) => n.type === 'LIKE',
    );
    expect(like).toBeDefined();
    expect(like.actorId).toBeNull();
    expect(like.actorUsername).toBe(actor.username); // 스냅샷 유지
  });
});
