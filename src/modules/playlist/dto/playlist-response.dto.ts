import { ApiProperty } from '@nestjs/swagger';

/**
 * 곡 응답 — 원본 song 도메인 PlaylistSongResponse 이식.
 * song 모듈을 import 하지 않고 playlist 상세 응답 내부에서 직접 사용한다.
 */
export class PlaylistSongResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  artist!: string;

  @ApiProperty({ description: '재생 시간(초)' })
  duration!: number;

  @ApiProperty()
  albumImagePath!: string;
}

/** 원본 PlaylistDetailResponse 이식 — songIds 를 곡 정보로 해석한 상세 응답 */
export class PlaylistDetailResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [PlaylistSongResponse] })
  songs!: PlaylistSongResponse[];
}

/** 원본 PlaylistResponse 이식 — 목록 항목(대표 앨범 이미지 포함) */
export class PlaylistResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, description: '첫 곡의 앨범 이미지 URL' })
  albumImageUrl!: string | null;
}

/** 원본 PlaylistListResponse 이식 — 내 플레이리스트 목록 */
export class PlaylistListResponse {
  @ApiProperty({ type: [PlaylistResponse] })
  playlists!: PlaylistResponse[];
}
