import { ApiProperty } from '@nestjs/swagger';

/** 원본 LikeToggleResponse 이식 — 토글 결과(true: 좋아요 생성, false: 좋아요 취소) */
export class LikeToggleResponse {
  @ApiProperty({ description: '좋아요 상태 (true: 생성됨, false: 취소됨)' })
  liked!: boolean;
}

/**
 * 원본 LikeCountResponse 이식.
 * 원본 record 컴포넌트명이 `likeCount` 이므로 직렬화 필드명도 `likeCount` 로 유지한다.
 */
export class LikeCountResponse {
  @ApiProperty({ description: '좋아요 개수' })
  likeCount!: number;
}

/**
 * 원본 LikeDroppingListResponse 이식 (my-like 상세 목록용).
 * 원본은 droppings: List<Object> (타입별 상세 응답)이나,
 * dropping 상세 변환은 dropping/song 모듈과 결합되므로 통합 단계 TODO 로 남긴다.
 * 우선 droppingId + 기본정보(좋아요 시각) 까지만 노출한다.
 */
export class LikeDroppingItemResponse {
  @ApiProperty()
  droppingId!: string;

  @ApiProperty({ description: '좋아요를 누른 시각' })
  likedAt!: Date;
}

export class LikeDroppingListResponse {
  @ApiProperty({ type: [LikeDroppingItemResponse] })
  droppings!: LikeDroppingItemResponse[];
}
