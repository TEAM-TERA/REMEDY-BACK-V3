import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '@prisma/client';

/**
 * 알림 단건 응답 (SSE 이벤트 data 와 GET /notifications 목록에 공통 사용).
 * 표시용 스냅샷(actorUsername/songId/commentContent)은 생성 시점 값이다.
 */
export class NotificationResponse {
  @ApiProperty({ description: '알림 ID' })
  id!: string;

  @ApiProperty({ enum: NotificationType, description: '알림 종류' })
  type!: NotificationType;

  @ApiProperty({ nullable: true, description: '관련 드롭 ID' })
  droppingId!: string | null;

  @ApiProperty({ nullable: true, description: '알림을 유발한 사용자 ID' })
  actorId!: number | null;

  @ApiProperty({
    nullable: true,
    description: '알림을 유발한 사용자 이름(스냅샷)',
  })
  actorUsername!: string | null;

  @ApiProperty({ nullable: true, description: 'DROPPING 알림의 곡 ID' })
  songId!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'COMMENT 알림의 댓글 내용(스냅샷)',
  })
  commentContent!: string | null;

  @ApiProperty({ description: '읽음 여부' })
  isRead!: boolean;

  @ApiProperty({ description: '생성 시각' })
  createdAt!: Date;
}

export class NotificationListResponse {
  @ApiProperty({ type: [NotificationResponse] })
  notifications!: NotificationResponse[];

  @ApiProperty({
    nullable: true,
    description: '다음 페이지 cursor(없으면 마지막 페이지)',
  })
  nextCursor!: string | null;
}

export class UnreadCountResponse {
  @ApiProperty({ description: '안 읽은 알림 개수' })
  unreadCount!: number;
}

export class MarkAllReadResponse {
  @ApiProperty({ description: '읽음 처리된 알림 개수' })
  updated!: number;
}
