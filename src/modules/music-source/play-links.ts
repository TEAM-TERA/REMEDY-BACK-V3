import { ApiProperty } from '@nestjs/swagger';

/** 곡 재생 링크에 필요한 최소 곡 정보(캐시된 Song 의 부분집합) */
export interface PlayLinkSource {
  id: string; // Spotify track id
  youtubeVideoId: string | null;
  youtubeChecked: boolean;
}

/** 단일 플랫폼 재생 링크 */
export class PlayLinkDto {
  @ApiProperty({ description: '해당 플랫폼에서 재생 가능한지' })
  available!: boolean;

  @ApiProperty({
    description: '재생 링크(미지원이면 null)',
    nullable: true,
  })
  url!: string | null;
}

/** 곡의 플랫폼별 재생 링크 묶음 */
export class PlayLinksDto {
  @ApiProperty({ description: 'Spotify 재생 링크' })
  spotify!: PlayLinkDto;

  @ApiProperty({ description: 'YouTube Music 재생 링크' })
  youtubeMusic!: PlayLinkDto;
}

/**
 * 곡의 플랫폼별 재생 링크를 계산한다.
 * - Spotify: 검색·식별 소스이므로 항상 가능. id 로 트랙 URL 구성.
 * - YouTube Music: 곡당 1회 resolve 결과(youtubeVideoId)로 판단.
 *     videoId 있음 → 정확한 watch 링크(available)
 *     youtubeChecked=true 인데 videoId 없음 → 매칭 없음(미지원)
 *     아직 미확인(youtubeChecked=false) → 보수적으로 미지원 처리
 *       (드랍 생성 시 ensureSongs 가 항상 resolve 하므로 커밋된 곡은 확인됨)
 */
export function buildPlayLinks(song: PlayLinkSource): PlayLinksDto {
  return {
    spotify: {
      available: true,
      url: `https://open.spotify.com/track/${song.id}`,
    },
    youtubeMusic: song.youtubeVideoId
      ? {
          available: true,
          url: `https://music.youtube.com/watch?v=${song.youtubeVideoId}`,
        }
      : { available: false, url: null },
  };
}
