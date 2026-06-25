import { ApiProperty } from '@nestjs/swagger';
import { DroppingType } from '@prisma/client';
import { PlayLinksDto } from '../../music-source/play-links';

/**
 * 거리기반 검색 결과 항목의 공통 인터페이스 (원본 DroppingResponse 인터페이스 이식).
 * MUSIC/VOTE/PLAYLIST search 응답이 모두 만족한다.
 */
export interface DroppingResponse {
  type: DroppingType;
  droppingId: string;
  userId: number;
  latitude: number;
  longitude: number;
  address: string | null;
  isMyDropping: boolean;
}

/** 원본 MusicDroppingSearchResponse 이식 */
export class MusicDroppingSearchResponse implements DroppingResponse {
  @ApiProperty({ enum: DroppingType }) type!: DroppingType;
  @ApiProperty() droppingId!: string;
  @ApiProperty() userId!: number;
  @ApiProperty() songId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() artist!: string;
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty() albumImageUrl!: string;
  @ApiProperty() isMyDropping!: boolean;
}

/** 원본 VoteDroppingSearchResponse 이식 */
export class VoteDroppingSearchResponse implements DroppingResponse {
  @ApiProperty({ enum: DroppingType }) type!: DroppingType;
  @ApiProperty() droppingId!: string;
  @ApiProperty() userId!: number;
  @ApiProperty() topic!: string;
  @ApiProperty({ type: [String] }) options!: string[];
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty() firstAlbumImageUrl!: string;
  @ApiProperty() isMyDropping!: boolean;
}

/** 원본 PlaylistDroppingSearchResponse 이식 */
export class PlaylistDroppingSearchResponse implements DroppingResponse {
  @ApiProperty({ enum: DroppingType }) type!: DroppingType;
  @ApiProperty() droppingId!: string;
  @ApiProperty() userId!: number;
  @ApiProperty() playlistName!: string;
  @ApiProperty({ type: [String] }) songIds!: string[];
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty() firstAlbumImageUrl!: string;
  @ApiProperty() isMyDropping!: boolean;
}

/** 원본 DroppingSearchListResponse 이식 */
export class DroppingSearchListResponse {
  @ApiProperty({ isArray: true })
  droppings!: DroppingResponse[];
}

// ── 단건 상세 응답 ────────────────────────────────────────────

/** 원본 MusicDroppingResponse 이식 (+ 플랫폼별 재생 링크) */
export class MusicDroppingResponse {
  @ApiProperty() droppingId!: string;
  @ApiProperty() songId!: string;
  @ApiProperty() userId!: number;
  @ApiProperty() username!: string;
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() expiryDate!: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() albumImageUrl!: string;
  @ApiProperty({ type: PlayLinksDto }) playLinks!: PlayLinksDto;
}

/** 원본 VoteOptionInfo 이식 (+ 플랫폼별 재생 링크) */
export class VoteOptionInfo {
  @ApiProperty() songId!: string;
  @ApiProperty() albumImagePath!: string;
  @ApiProperty() title!: string;
  @ApiProperty() artist!: string;
  @ApiProperty() voteCount!: number;
  @ApiProperty({ type: PlayLinksDto }) playLinks!: PlayLinksDto;
}

/** 원본 VoteDroppingResponse 이식 */
export class VoteDroppingResponse {
  @ApiProperty() droppingId!: string;
  @ApiProperty() userId!: number;
  @ApiProperty() topic!: string;
  @ApiProperty({ type: [VoteOptionInfo] }) options!: VoteOptionInfo[];
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty() expiryDate!: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() totalVotes!: number;
  @ApiProperty({ nullable: true }) userVotedOption!: string | null;
}

/** 원본 PlaylistDroppingResponse.SongInfo 이식 (+ 플랫폼별 재생 링크) */
export class PlaylistSongInfo {
  @ApiProperty() songId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() artist!: string;
  @ApiProperty() albumImagePath!: string;
  @ApiProperty({ type: PlayLinksDto }) playLinks!: PlayLinksDto;
}

/** 원본 PlaylistDroppingResponse 이식 */
export class PlaylistDroppingResponse {
  @ApiProperty() droppingId!: string;
  @ApiProperty() userId!: number;
  @ApiProperty() playlistName!: string;
  @ApiProperty({ type: [PlaylistSongInfo] }) songs!: PlaylistSongInfo[];
  @ApiProperty({ nullable: true }) content!: string | null;
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true }) address!: string | null;
  @ApiProperty() expiryDate!: Date;
  @ApiProperty() createdAt!: Date;
}
