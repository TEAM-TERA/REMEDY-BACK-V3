import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 통합 검색 쿼리 파라미터 (원본 @RequestParam String query 이식)
 * GET /songs/search?query=아이유
 */
export class SongSearchQueryDto {
  @ApiProperty({ description: '제목+가수 통합 검색어', example: '아이유' })
  @IsString()
  @IsNotEmpty({ message: '검색어를 입력해주세요.' })
  query!: string;
}

/**
 * 검색 결과 단건 응답 (Spotify 검색 결과).
 * 필드: id(Spotify track id), title, artist, album, albumImagePath (duration 제외).
 * 재생 링크/YouTube 가용성은 드랍 생성(ensureSongs) 시점에 확정되므로 검색 결과엔 싣지 않는다.
 */
export class SongSearchResponseDto {
  @ApiProperty({ description: '곡 ID (Spotify track id)' })
  id!: string;

  @ApiProperty({ description: '곡 제목' })
  title!: string;

  @ApiProperty({ description: '아티스트' })
  artist!: string;

  @ApiProperty({ description: '앨범명', nullable: true })
  album!: string | null;

  @ApiProperty({ description: '앨범 이미지 경로' })
  albumImagePath!: string;
}

/**
 * 검색 결과 목록 응답 (원본 SongSearchListResponse 이식)
 * 원본 필드명(songSearchResponses)을 그대로 유지한다.
 */
export class SongSearchListResponseDto {
  @ApiProperty({ type: [SongSearchResponseDto], description: '검색 결과 목록' })
  songSearchResponses!: SongSearchResponseDto[];
}
