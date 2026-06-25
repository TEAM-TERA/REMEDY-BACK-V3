import { NotFoundException } from './business.exception';

/**
 * 여러 도메인이 교차 참조하는 공통 NotFound 예외.
 *
 * 과거에는 각 도메인 exceptions 파일에서 동일 에러코드를 개별 정의해
 * 메시지 표기가 갈렸다(예: DROPPING_NOT_FOUND → "드롭/드랍/드랍핑").
 * 컨벤션(docs/CONVENTIONS.md §3)에 따라 단일 정의로 통합하고 표기를 통일한다.
 */

/** 곡을 찾을 수 없음 */
export class SongNotFoundException extends NotFoundException {
  constructor() {
    super('SONG_NOT_FOUND', '곡을 찾을 수 없습니다.');
  }
}

/** 드랍을 찾을 수 없음 */
export class DroppingNotFoundException extends NotFoundException {
  constructor() {
    super('DROPPING_NOT_FOUND', '드랍을 찾을 수 없습니다.');
  }
}

/** 플레이리스트를 찾을 수 없음 */
export class PlaylistNotFoundException extends NotFoundException {
  constructor() {
    super('PLAYLIST_NOT_FOUND', '플레이리스트를 찾을 수 없습니다.');
  }
}

/** 사용자를 찾을 수 없음 */
export class UserNotFoundException extends NotFoundException {
  constructor() {
    super('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  }
}
