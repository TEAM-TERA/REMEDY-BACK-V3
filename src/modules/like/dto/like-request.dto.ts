import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** 원본 LikeRequest 이식 — 좋아요 토글 대상 dropping id */
export class LikeRequest {
  @ApiProperty({ example: 'dropping-uuid' })
  @IsNotEmpty({ message: 'droppingId 는 필수입니다.' })
  @IsString()
  droppingId!: string;
}
