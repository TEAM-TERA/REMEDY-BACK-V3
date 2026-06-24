import {
  AlreadyExistsException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/business.exception';

/** 플레이리스트를 찾을 수 없음 (원본 PlaylistNotFoundException) */
export class PlaylistNotFoundException extends NotFoundException {
  constructor() {
    super('PLAYLIST_NOT_FOUND', '플레이리스트를 찾을 수 없습니다.');
  }
}

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

/** 곡을 찾을 수 없음 (원본 song 도메인 SongNotFoundException — playlist 내부에서 재사용) */
export class SongNotFoundException extends NotFoundException {
  constructor() {
    super('SONG_NOT_FOUND', '곡을 찾을 수 없습니다.');
  }
}
