import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEmitter } from './notification.emitter';
import {
  MarkAllReadResponse,
  NotificationListResponse,
  NotificationResponse,
  UnreadCountResponse,
} from './dto/notification-response.dto';
import { NotificationNotFoundException } from './exceptions/notification.exceptions';
import {
  NOTIFICATION_EVENT_NAME,
  NotificationPayload,
  NotificationType,
} from './notification.types';

/** prisma.notification 행(필요 컬럼) */
type NotificationRow = {
  id: string;
  type: NotificationType;
  recipientId: number;
  actorId: number | null;
  droppingId: string | null;
  payload: Prisma.JsonValue;
  isRead: boolean;
  createdAt: Date;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: NotificationEmitter,
  ) {}

  // ── SSE 구독 ─────────────────────────────────────────────────

  /** 사용자의 실시간 알림 스트림(SSE) */
  subscribe(userId: number): Observable<MessageEvent> {
    return this.emitter.subscribe(userId);
  }

  // ── 알림 발행(도메인 서비스에서 호출) ─────────────────────────

  /**
   * 좋아요 알림 (원본 LikeCreatedEvent → "like-created").
   * 자기 자신의 드롭에 좋아요를 누른 경우는 알림을 만들지 않는다(원본 동작).
   */
  async notifyLike(params: {
    recipientId: number;
    actorId: number;
    droppingId: string;
  }): Promise<void> {
    if (params.recipientId === params.actorId) {
      return;
    }
    const actorUsername = await this.resolveUsername(params.actorId);
    await this.create({
      type: NotificationType.LIKE,
      recipientId: params.recipientId,
      actorId: params.actorId,
      droppingId: params.droppingId,
      payload: { actorUsername },
    });
  }

  /**
   * 댓글 알림 (원본 CommentCreatedEvent → "comment-created").
   * 자기 자신의 드롭에 댓글을 단 경우는 알림을 만들지 않는다(원본 동작).
   */
  async notifyComment(params: {
    recipientId: number;
    actorId: number;
    droppingId: string;
    commentContent: string;
  }): Promise<void> {
    if (params.recipientId === params.actorId) {
      return;
    }
    const actorUsername = await this.resolveUsername(params.actorId);
    await this.create({
      type: NotificationType.COMMENT,
      recipientId: params.recipientId,
      actorId: params.actorId,
      droppingId: params.droppingId,
      payload: { actorUsername, commentContent: params.commentContent },
    });
  }

  /**
   * 드롭 생성 알림 (원본 DroppingCreatedEvent → "dropping-created").
   * 원본 동작 그대로, 드롭 생성자 본인에게 발행한다(actor == recipient).
   */
  async notifyDropping(params: {
    recipientId: number;
    droppingId: string;
    songId: string;
  }): Promise<void> {
    await this.create({
      type: NotificationType.DROPPING,
      recipientId: params.recipientId,
      actorId: params.recipientId,
      droppingId: params.droppingId,
      payload: { songId: params.songId },
    });
  }

  /** 알림 영속화 + 연결되어 있으면 SSE 실시간 푸시 */
  private async create(input: {
    type: NotificationType;
    recipientId: number;
    actorId: number | null;
    droppingId: string | null;
    payload: NotificationPayload;
  }): Promise<NotificationResponse> {
    const row = await this.prisma.notification.create({
      data: {
        type: input.type,
        recipientId: input.recipientId,
        actorId: input.actorId,
        droppingId: input.droppingId,
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
    });

    const response = this.toResponse(row);
    this.emitter.push(input.recipientId, {
      type: NOTIFICATION_EVENT_NAME[input.type],
      data: response,
      id: response.id,
    });
    return response;
  }

  // ── 조회/읽음 처리 ───────────────────────────────────────────

  /** 기본/최대 페이지 크기 */
  private static readonly DEFAULT_LIMIT = 30;
  private static readonly MAX_LIMIT = 100;

  /**
   * 내 알림 목록(최신순, cursor 기반 페이지네이션).
   * 영속화 설계상 알림이 무한 증가할 수 있으므로 항상 페이지 크기를 제한한다.
   * createdAt+id 복합 정렬로 동시각 알림의 순서를 안정화하고, take+1 로 다음 페이지 존재를 판별한다.
   */
  async list(
    recipientId: number,
    options?: { limit?: number; cursor?: string },
  ): Promise<NotificationListResponse> {
    const take = Math.min(
      options?.limit ?? NotificationService.DEFAULT_LIMIT,
      NotificationService.MAX_LIMIT,
    );

    const rows = await this.prisma.notification.findMany({
      where: { recipientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > take;
    const page = hasNext ? rows.slice(0, take) : rows;

    return {
      notifications: page.map((row) => this.toResponse(row)),
      nextCursor: hasNext ? page[page.length - 1].id : null,
    };
  }

  /** 안 읽은 알림 개수 */
  async getUnreadCount(recipientId: number): Promise<UnreadCountResponse> {
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId, isRead: false },
    });
    return { unreadCount };
  }

  /**
   * 단건 읽음 처리. 본인 소유 알림만 처리하며, 없으면 NotFound.
   * updateMany(where: id + recipientId) 로 소유권을 한 번에 강제한다(IDOR 방지).
   */
  async markAsRead(recipientId: number, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId },
      data: { isRead: true },
    });
    if (result.count === 0) {
      throw new NotificationNotFoundException();
    }
  }

  /** 내 알림 전체 읽음 처리 */
  async markAllAsRead(recipientId: number): Promise<MarkAllReadResponse> {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────

  /** actor 의 username 스냅샷 조회(없으면 null) */
  private async resolveUsername(
    actorId: number | null,
  ): Promise<string | null> {
    if (actorId === null) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { username: true },
    });
    return user?.username ?? null;
  }

  /**
   * Notification 행 → 응답 DTO(JSONB payload 평탄화).
   * actorId 는 FK(actor SetNull)라 actor 탈퇴 시 null 이 되지만, actorUsername 은
   * 생성 시점 스냅샷이라 그대로 남는다(의도된 동작 — 탈퇴 후에도 이력 표시 유지).
   */
  private toResponse(row: NotificationRow): NotificationResponse {
    const payload = this.parsePayload(row.payload);
    return {
      id: row.id,
      type: row.type,
      droppingId: row.droppingId,
      actorId: row.actorId,
      actorUsername: payload.actorUsername ?? null,
      songId: payload.songId ?? null,
      commentContent: payload.commentContent ?? null,
      isRead: row.isRead,
      createdAt: row.createdAt,
    };
  }

  private parsePayload(payload: Prisma.JsonValue): NotificationPayload {
    if (typeof payload === 'object' && payload !== null) {
      return payload as NotificationPayload;
    }
    return {};
  }
}
