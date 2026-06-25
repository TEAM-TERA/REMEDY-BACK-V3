import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Comment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import {
  CommentUpdateRequest,
  CreateCommentRequest,
} from './dto/comment-request.dto';
import { CommentResponse } from './dto/comment-response.dto';
import {
  CommentAccessDeniedException,
  CommentNotFoundException,
  DroppingNotFoundException,
} from './exceptions/comment.exceptions';

@Injectable()
export class CommentService {
  private readonly logger = new Logger(CommentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 댓글 작성 (원본 createComment).
   * 드랍핑 존재를 먼저 검증한 뒤 댓글을 저장한다.
   * 저장 후 드롭 소유자에게 알림을 발행한다(원본 CommentCreatedEvent).
   * 자기 자신 드롭 댓글은 NotificationService 에서 제외하며, 알림 실패가 댓글 작성을
   * 실패시키지 않도록 best-effort 로 처리한다.
   */
  async createComment(
    userId: number,
    request: CreateCommentRequest,
  ): Promise<void> {
    const dropping = await this.findDroppingOrThrow(request.droppingId);

    try {
      await this.prisma.comment.create({
        data: {
          content: request.content,
          userId,
          droppingId: request.droppingId,
        },
      });
    } catch (error) {
      // 존재검증과 insert 사이에 드롭이 삭제된 경우(FK 위반 P2003) → 일관된 404
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new DroppingNotFoundException();
      }
      throw error;
    }

    try {
      await this.notificationService.notifyComment({
        recipientId: dropping.userId,
        actorId: userId,
        droppingId: request.droppingId,
        commentContent: request.content,
      });
    } catch (error) {
      this.logger.error(
        `댓글 알림 발행 실패 - droppingId=${request.droppingId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * 특정 드랍핑의 댓글 목록 조회 (원본 getCommentsByDropping).
   * 정렬: id 내림차순(원본 findByDroppingIdOrderByIdDesc → 최신순).
   * 목록이 비어있고 드랍핑도 존재하지 않으면 DroppingNotFoundException(원본 동작).
   */
  async getCommentsByDropping(droppingId: string): Promise<CommentResponse[]> {
    const comments = await this.prisma.comment.findMany({
      where: { droppingId },
      orderBy: { id: 'desc' },
      // username 만 필요 — user 전체(비밀번호 포함) 로딩 방지
      include: { user: { select: { username: true } } },
    });

    if (comments.length === 0) {
      const exists = await this.droppingExists(droppingId);
      if (!exists) {
        throw new DroppingNotFoundException();
      }
    }

    return comments.map((comment) => this.toResponse(comment));
  }

  /**
   * 댓글 수정 (원본 updateComment).
   * 댓글 존재 → 소유자 검증 후 내용 갱신.
   */
  async updateComment(
    userId: number,
    commentId: number,
    request: CommentUpdateRequest,
  ): Promise<void> {
    const comment = await this.findCommentOrThrow(commentId);
    this.validateCommentOwnership(userId, comment);

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { content: request.content },
    });
  }

  /**
   * 댓글 삭제 (원본 deleteComment).
   * 댓글 존재 → 소유자 검증 후 삭제.
   */
  async deleteComment(userId: number, commentId: number): Promise<void> {
    const comment = await this.findCommentOrThrow(commentId);
    this.validateCommentOwnership(userId, comment);

    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  /**
   * 특정 드랍핑의 댓글 수 (원본 countByDroppingId).
   * 드랍핑이 존재하지 않으면 DroppingNotFoundException(원본 동작).
   */
  async countByDroppingId(droppingId: string): Promise<number> {
    await this.findDroppingOrThrow(droppingId);

    return this.prisma.comment.count({ where: { droppingId } });
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────

  /** 댓글 조회 후 없으면 예외 (원본 findById → CommentNotFoundException) */
  private async findCommentOrThrow(commentId: number): Promise<Comment> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new CommentNotFoundException();
    }
    return comment;
  }

  /** 소유자 검증 (원본 validateCommentOwnership) */
  private validateCommentOwnership(userId: number, comment: Comment): void {
    if (comment.userId !== userId) {
      throw new CommentAccessDeniedException();
    }
  }

  /**
   * 드랍핑 조회 후 없으면 예외 (원본 droppingRepository.findById/existsById).
   * 알림 수신자(소유자) 식별을 위해 userId 를 함께 반환한다.
   */
  private async findDroppingOrThrow(
    droppingId: string,
  ): Promise<{ id: string; userId: number }> {
    const dropping = await this.prisma.dropping.findUnique({
      where: { id: droppingId },
      select: { id: true, userId: true },
    });
    if (!dropping) {
      throw new DroppingNotFoundException();
    }
    return dropping;
  }

  /** 드랍핑 존재 여부 */
  private async droppingExists(droppingId: string): Promise<boolean> {
    const count = await this.prisma.dropping.count({
      where: { id: droppingId },
    });
    return count > 0;
  }

  /**
   * Comment(+user) → CommentResponse 변환 (원본 CommentMapper.toResponse).
   * username 은 작성자(user) join 결과에서 가져온다.
   */
  private toResponse(
    comment: Comment & { user: { username: string } },
  ): CommentResponse {
    return {
      id: comment.id,
      content: comment.content,
      droppingId: comment.droppingId,
      username: comment.user.username,
    };
  }
}
