import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsPositive,
  Max,
  Min,
} from 'class-validator';

/** 원본 VoteRequest 이식 — 투표할 곡 ID */
export class VoteRequest {
  @ApiProperty({ description: '투표할 음악 ID' })
  @IsNotEmpty({ message: '투표할 음악 ID는 필수입니다' })
  @IsString()
  songId!: string;
}

/** 거리기반 검색 쿼리 (원본 searchDroppings @RequestParam) */
export class DroppingSearchQuery {
  @ApiProperty({ description: '경도', minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber({}, { message: '경도는 숫자여야 합니다.' })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ description: '위도', minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber({}, { message: '위도는 숫자여야 합니다.' })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ description: '검색 반경 (km)' })
  @Type(() => Number)
  @IsNumber({}, { message: '검색 반경은 숫자여야 합니다.' })
  @IsPositive({ message: '검색 반경은 0보다 커야 합니다.' })
  distance!: number;
}
