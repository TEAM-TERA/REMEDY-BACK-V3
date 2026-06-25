import {
  AlreadyExistsException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/business.exception';

/**
 * playlist 도메인 전용 예외.
 * 참고: PlaylistNotFoundException / SongNotFoundException 은 교차 참조되므로
 * src/common/exceptions/not-found.exception.ts 로 통합되어 여기서 정의하지 않는다.
 */

/**
 * 플레이리스트 소유자가 아님 (원본 PlaylistAccessDeniedException).
 * 원본은 BusinessBaseException(PLAYLIST_ACCESS_DENIED)이나,
 * 본 프로젝트 컨벤션상 소유권 위반은 403 Forbidden 으로 매핑한다.
 */
export class UnauthorizedPlaylistAccessException extends ForbiddenException {
  constructor() {
    super(
      'UNAUTHORIZED_PLAYLIST_ACCESS',
      '플레이리스트에 접근할 권한이 없습니다.',
    );
  }
}

/** 곡이 이미 플레이리스트에 존재함 (원본 SongAlreadyInPlaylistException) */
export class SongAlreadyInPlaylistException extends AlreadyExistsException {
  constructor() {
    super('SONG_ALREADY_IN_PLAYLIST', '이미 플레이리스트에 존재하는 곡입니다.');
  }
}

/** 곡이 플레이리스트에 존재하지 않음 (원본 SongNotInPlaylistException) */
export class SongNotInPlaylistException extends NotFoundException {
  constructor() {
    super('SONG_NOT_IN_PLAYLIST', '플레이리스트에 존재하지 않는 곡입니다.');
  }
}
