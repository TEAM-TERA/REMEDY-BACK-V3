import { ApiProperty } from '@nestjs/swagger';

/**
 * 원본 CommentResponse 이식 — 댓글 응답.
 * 원본 record(CommentResponse)의 필드를 그대로 따른다: id, content, droppingId, username.
 * username 은 작성자(user) join 으로 채운다(원본 CommentMapper.toResponse: comment.getUser().getUsername()).
 */
export class CommentResponse {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: '좋은 드랍핑이네요!' })
  content!: string;

  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  droppingId!: string;

  @ApiProperty({ example: '작성자', description: '작성자 username' })
  username!: string;
}

/** 댓글 수 응답 (원본은 bare Long; 관용적 JSON 객체로 래핑) */
export class CommentCountResponse {
  @ApiProperty({ example: 3, description: '드랍핑의 댓글 수' })
  count!: number;
}
