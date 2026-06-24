import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** 알림 목록 조회 쿼리 (cursor 기반 페이지네이션) */
export class NotificationQuery {
  @ApiPropertyOptional({
    description: '페이지 크기(기본 30, 최대 100)',
    minimum: 1,
    maximum: 100,
    default: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      '이 알림 ID 이후(더 과거)부터 조회. 직전 응답의 nextCursor 를 전달',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
