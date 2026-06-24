import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 공백 제거 트랜스폼 (원본 @NotBlank 의미: 공백만인 내용 거절) */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** 원본 CreateCommentRequest 이식 — 댓글 작성 요청 */
export class CreateCommentRequest {
  @ApiProperty({ example: '좋은 드랍핑이네요!', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: '내용은 필수입니다.' })
  @MaxLength(100, { message: '댓글은 100자를 초과할 수 없습니다.' })
  content!: string;

  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  @IsNotEmpty({ message: '드랍핑 ID는 필수입니다.' })
  @IsString()
  droppingId!: string;
}

/** 원본 CommentUpdateRequest 이식 — 댓글 수정 요청 */
export class CommentUpdateRequest {
  @ApiProperty({ example: '수정된 댓글 내용', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: '내용은 필수입니다.' })
  @MaxLength(100, { message: '댓글은 100자를 초과할 수 없습니다.' })
  content!: string;
}
