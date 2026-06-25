import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  LikeCountResponse,
  LikeDroppingListResponse,
  LikeToggleResponse,
} from './dto/like-response.dto';
import { DroppingNotFoundException } from '../../common/exceptions/not-found.exception';
import { orThrow } from '../../common/utils/guard';

@Injectable()
export class LikeService {
  private readonly logger = new Logger(LikeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 좋아요 토글 (원본 LikeService.toggleLike).
   * dropping 존재 검증 → (userId, droppingId) 로 기존 좋아요 조회 →
   * 있으면 삭제(false), 없으면 생성(true). @@unique([userId,droppingId]) 활용.
   *
   * 좋아요가 새로 생성되면 dropping 소유자에게 알림을 발행한다(원본 LikeCreatedEvent).
   * 자기 자신 드롭 좋아요는 NotificationService 에서 제외한다. 알림 실패가 좋아요 자체를
   * 실패시키지 않도록 트랜잭션 커밋 이후 best-effort 로 처리한다.
   */
  async toggleLike(
    userId: number,
    droppingId: string,
  ): Promise<LikeToggleResponse> {
    const { liked, ownerId } = await this.prisma.$transaction(async (tx) => {
      const dropping = await tx.dropping.findUnique({
        where: { id: droppingId },
        select: { id: true, userId: true },
      });
      if (!dropping) {
        throw new DroppingNotFoundException();
      }

      const existing = await tx.like.findUnique({
        where: { userId_droppingId: { userId, droppingId } },
      });

      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        return { liked: false, ownerId: dropping.userId };
      }

      try {
        await tx.like.create({ data: { userId, droppingId } });
        return { liked: true, ownerId: dropping.userId };
      } catch (error) {
        // 동시 더블탭으로 이미 생성된 경우 → 멱등하게 성공 처리(500 방지)
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { liked: true, ownerId: dropping.userId };
        }
        throw error;
      }
    });

    if (liked) {
      try {
        await this.notificationService.notifyLike({
          recipientId: ownerId,
          actorId: userId,
          droppingId,
        });
      } catch (error) {
        this.logger.error(
          `좋아요 알림 발행 실패 - droppingId=${droppingId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return { liked };
  }

  /** 내가 누른 좋아요 수 (원본 getLikeCountByUser) */
  async getLikeCountByUser(userId: number): Promise<LikeCountResponse> {
    const likeCount = await this.prisma.like.count({ where: { userId } });
    return { likeCount };
  }

  /** 특정 dropping 의 좋아요 수 (원본 getLikeCountByDropping, 존재 검증 포함) */
  async getLikeCountByDropping(droppingId: string): Promise<LikeCountResponse> {
    await this.assertDroppingExists(droppingId);

    const likeCount = await this.prisma.like.count({ where: { droppingId } });
    return { likeCount };
  }

  /**
   * 내가 좋아요한 dropping 상세 목록 (원본 getLikeDroppingsDetailByUser).
   *
   * 원본은 dropping 타입(MUSIC/VOTE/PLAYLIST)별 상세 응답으로 변환하고
   * 비활성(만료/삭제) dropping 은 제외한다. 그러나 그 변환은 dropping/song 모듈과
   * 강하게 결합되므로, 통합 단계 전까지는 droppingId + 좋아요 시각까지만 노출한다.
   *
   * TODO(통합): dropping 모듈 결합 후 타입별 상세 응답(Music/Vote/Playlist) 변환 +
   * 비활성 dropping 필터링을 추가한다.
   */
  async getLikeDroppingsDetailByUser(
    userId: number,
  ): Promise<LikeDroppingListResponse> {
    const likes = await this.prisma.like.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      droppings: likes.map((like) => ({
        droppingId: like.droppingId,
        likedAt: like.createdAt,
      })),
    };
  }

  /** dropping 존재 검증 (없으면 DroppingNotFoundException) */
  private async assertDroppingExists(droppingId: string): Promise<void> {
    orThrow(
      await this.prisma.dropping.findUnique({
        where: { id: droppingId },
        select: { id: true },
      }),
      () => new DroppingNotFoundException(),
    );
  }
}
