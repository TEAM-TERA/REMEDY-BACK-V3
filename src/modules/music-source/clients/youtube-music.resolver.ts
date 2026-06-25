/** YouTube Music 매칭 결과(곡당 1회 resolve) */
export interface YouTubeMatch {
  /** 매칭된 영상 id (watch?v=) */
  videoId: string;
}

/**
 * YouTube Music 매칭 추상화.
 * - 곡(제목/아티스트)을 받아 YouTube 에서 한 번 검색해 대표 영상 id 를 찾는다.
 * - 매칭이 없거나 쿼터 소진/키 없음 등으로 확인 불가하면 null 을 반환한다(미지원 처리).
 * - 추상 클래스를 DI 토큰으로 사용해 E2E 에서 가짜 구현 주입이 가능하다.
 */
export abstract class YouTubeMusicResolver {
  abstract resolve(track: {
    title: string;
    artist: string;
  }): Promise<YouTubeMatch | null>;
}
