import { Injectable } from '@nestjs/common';
import type { Comment } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 댓글 작성 (원본 createComment).
   * 드랍핑 존재를 먼저 검증한 뒤 댓글을 저장한다.
   * 원본은 작성 후 CommentCreatedEvent 를 SSE 로 발행하나,
   * 본 프로젝트엔 GlobalEventPublisher/SSE 인프라가 아직 없으므로 이벤트 발행은 생략한다(아래 보고 참고).
   */
  async createComment(
    userId: number,
    request: CreateCommentRequest,
  ): Promise<void> {
    await this.findDroppingOrThrow(request.droppingId);

    await this.prisma.comment.create({
      data: {
        content: request.content,
        userId,
        droppingId: request.droppingId,
      },
    });
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

  /** 드랍핑 존재 검증 후 없으면 예외 (원본 droppingRepository.findById/existsById) */
  private async findDroppingOrThrow(droppingId: string): Promise<void> {
    if (!(await this.droppingExists(droppingId))) {
      throw new DroppingNotFoundException();
    }
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
