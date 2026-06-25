import { ApiProperty } from '@nestjs/swagger';
import { PlayLinksDto } from '../../music-source/play-links';

/**
 * 단건/목록용 곡 응답.
 * 필드: id(Spotify track id), title, artist, album, duration, albumImagePath, playLinks
 */
export class SongResponseDto {
  @ApiProperty({ description: '곡 ID (Spotify track id)' })
  id!: string;

  @ApiProperty({ description: '곡 제목' })
  title!: string;

  @ApiProperty({ description: '아티스트' })
  artist!: string;

  @ApiProperty({ description: '앨범명', nullable: true })
  album!: string | null;

  @ApiProperty({ description: '재생 시간(초)' })
  duration!: number;

  @ApiProperty({ description: '앨범 이미지 경로' })
  albumImagePath!: string;

  @ApiProperty({ description: '플랫폼별 재생 링크', type: PlayLinksDto })
  playLinks!: PlayLinksDto;
}

/**
 * 전체 곡 목록 응답 (필드명 songResponses 유지)
 */
export class SongListResponseDto {
  @ApiProperty({ type: [SongResponseDto], description: '곡 목록' })
  songResponses!: SongResponseDto[];
}
