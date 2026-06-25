import { MusicTrack } from '../music-track';

/**
 * Spotify 음원 소스 추상화(검색·식별 마스터).
 * - 추상 클래스를 DI 토큰으로 사용하므로 E2E 에서 overrideProvider 로 가짜 구현 주입이 가능하다.
 * - 구현체(Impl)는 Client Credentials 토큰으로 Spotify Web API 를 호출한다.
 */
export abstract class SpotifyMusicClient {
  /** 제목/아티스트 통합 검색 */
  abstract search(query: string, limit?: number): Promise<MusicTrack[]>;

  /** track id 목록으로 메타 일괄 조회(존재하지 않는 id 는 결과에서 제외) */
  abstract getTracks(trackIds: string[]): Promise<MusicTrack[]>;
}
