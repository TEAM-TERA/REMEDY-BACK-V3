import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LikeCountResponse,
  LikeDroppingListResponse,
  LikeToggleResponse,
} from './dto/like-response.dto';
import { DroppingNotFoundException } from './exceptions/like.exceptions';

@Injectable()
export class LikeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 좋아요 토글 (원본 LikeService.toggleLike).
   * dropping 존재 검증 → (userId, droppingId) 로 기존 좋아요 조회 →
   * 있으면 삭제(false), 없으면 생성(true). @@unique([userId,droppingId]) 활용.
   *
   * TODO(통합): 원본은 좋아요 생성 시 dropping 소유자에게 SSE 알림(LikeCreatedEvent)을
   * 발행한다(자기 자신 드롭 제외). SSE/이벤트 인프라 이식 시 여기에 추가한다.
   */
  async toggleLike(
    userId: number,
    droppingId: string,
  ): Promise<LikeToggleResponse> {
    return this.prisma.$transaction(async (tx) => {
      const dropping = await tx.dropping.findUnique({
        where: { id: droppingId },
        select: { id: true },
      });
      if (!dropping) {
        throw new DroppingNotFoundException();
      }

      const existing = await tx.like.findUnique({
        where: { userId_droppingId: { userId, droppingId } },
      });

      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        return { liked: false };
      }

      try {
        await tx.like.create({ data: { userId, droppingId } });
        return { liked: true };
      } catch (error) {
        // 동시 더블탭으로 이미 생성된 경우 → 멱등하게 성공 처리(500 방지)
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          return { liked: true };
        }
        throw error;
      }
    });
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
    const dropping = await this.prisma.dropping.findUnique({
      where: { id: droppingId },
      select: { id: true },
    });
    if (!dropping) {
      throw new DroppingNotFoundException();
    }
  }
}
