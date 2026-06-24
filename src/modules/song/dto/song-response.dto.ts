import { ApiProperty } from '@nestjs/swagger';

/**
 * 단건/목록용 곡 응답 (원본 SongResponse 이식)
 * 필드: id, title, artist, duration, albumImagePath
 */
export class SongResponseDto {
  @ApiProperty({ description: '곡 ID(uuid)' })
  id!: string;

  @ApiProperty({ description: '곡 제목' })
  title!: string;

  @ApiProperty({ description: '아티스트' })
  artist!: string;

  @ApiProperty({ description: '재생 시간(초)' })
  duration!: number;

  @ApiProperty({ description: '앨범 이미지 경로' })
  albumImagePath!: string;
}

/**
 * 전체 곡 목록 응답 (원본 SongListResponse 이식)
 * 원본 필드명(songResponses)을 그대로 유지한다.
 */
export class SongListResponseDto {
  @ApiProperty({ type: [SongResponseDto], description: '곡 목록' })
  songResponses!: SongResponseDto[];
}
