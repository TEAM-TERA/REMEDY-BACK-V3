/**
 * dropping payload JSONB 타입 정의 (원본 Payload/Music·Vote·PlaylistDroppingPayload 이식).
 *
 * 스키마(JSONB):
 *   MUSIC    : { "songId": "..." }
 *   PLAYLIST : { "playlistName": "...", "songIds": ["...", ...] }
 *   VOTE     : { "topic": "...", "optionVotes": { "<songId>": [userId, ...] } }
 *
 * 원본은 Jackson @JsonTypeInfo 다형성 직렬화를 사용하나, 여기서는 droppingType 컬럼으로
 * 타입을 판별하므로 payload 내부에는 type discriminator 를 두지 않는다.
 */

/** MUSIC payload */
export interface MusicPayload {
  songId: string;
}

/** PLAYLIST payload */
export interface PlaylistPayload {
  playlistName: string;
  songIds: string[];
}

/**
 * VOTE payload.
 * optionVotes 는 곡 ID → 투표한 userId 배열. 키 순서가 곧 옵션 순서다(원본 LinkedHashMap).
 * JS 객체는 문자열 키 삽입 순서를 보존하므로 옵션 순서가 유지된다.
 */
export interface VotePayload {
  topic: string;
  optionVotes: Record<string, number[]>;
}
