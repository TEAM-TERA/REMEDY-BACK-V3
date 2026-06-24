import { NotificationType } from '@prisma/client';

export { NotificationType };

/**
 * 알림 표시용 스냅샷(JSONB payload).
 * 알림 생성 시점의 값을 저장해 두어, 이후 actor 이름 변경/곡 변경과 무관하게
 * 알림 이력이 일관되게 보이도록 한다.
 *   LIKE     : { actorUsername }
 *   COMMENT  : { actorUsername, commentContent }
 *   DROPPING : { songId }
 */
export interface NotificationPayload {
  actorUsername?: string | null;
  commentContent?: string;
  songId?: string;
}

/**
 * SSE 이벤트 이름(원본 GlobalEventPublisher 와 동일하게 유지해 클라이언트 호환).
 */
export const NOTIFICATION_EVENT_NAME: Record<NotificationType, string> = {
  [NotificationType.LIKE]: 'like-created',
  [NotificationType.COMMENT]: 'comment-created',
  [NotificationType.DROPPING]: 'dropping-created',
};
