/**
 * 외부 음원 소스(현재 Spotify)에서 가져온 곡의 표준 표현.
 * provider별 응답을 이 형태로 정규화해 SongService 가 동일하게 캐시한다.
 */
export interface MusicTrack {
  /** Spotify track id (우리 Song.id 자연키로 사용) */
  id: string;
  title: string;
  artist: string;
  /** 앨범명(없을 수 있음) */
  album: string | null;
  /** 재생 시간(초) */
  duration: number;
  /** 앨범 커버 이미지 URL */
  albumImagePath: string;
}
