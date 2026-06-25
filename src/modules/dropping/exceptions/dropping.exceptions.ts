import {
  AlreadyExistsException,
  ForbiddenException,
  InvalidRequestException,
} from '../../../common/exceptions/business.exception';

/**
 * dropping 도메인 전용 예외 (원본 dropping/application/exception 이식).
 * 원본은 ErrorCode + BusinessBaseException 계열을 사용하나,
 * 본 프로젝트 컨벤션상 의미별 베이스 예외(NotFound/AlreadyExists/...)로 매핑한다.
 *
 * 참고: 교차 참조되는 NotFound 예외(Dropping/Song/Playlist/User)는
 * src/common/exceptions/not-found.exception.ts 로 통합되어 여기서 정의하지 않는다.
 */

/** 1m 이내 중복 dropping 존재 (원본 DroppingAlreadyExistsException) */
export class DroppingAlreadyExistsException extends AlreadyExistsException {
  constructor() {
    super('DROPPING_ALREADY_EXISTS', '이미 근처에 드랍이 존재합니다.');
  }
}

/** 잘못된 dropping 타입 / payload 타입 불일치 (원본 InvalidDroppingTypeException) */
export class InvalidDroppingTypeException extends InvalidRequestException {
  constructor() {
    super('INVALID_DROPPING_TYPE', '유효하지 않은 드랍 타입입니다.');
  }
}

/** 존재하지 않는 투표 옵션에 투표 (원본 InvalidVoteOptionException) */
export class InvalidVoteOptionException extends InvalidRequestException {
  constructor() {
    super('INVALID_VOTE_OPTION', '유효하지 않은 투표 옵션입니다.');
  }
}

/** 투표 옵션이 비어 있음 (원본 EmptyVoteOptionsException) */
export class EmptyVoteOptionsException extends InvalidRequestException {
  constructor() {
    super('EMPTY_VOTE_OPTIONS', '투표 옵션이 비어 있습니다.');
  }
}

/** 플레이리스트 곡이 비어 있음 (원본 EmptyPlaylistSongsException) */
export class EmptyPlaylistSongsException extends InvalidRequestException {
  constructor() {
    super('EMPTY_PLAYLIST_SONGS', '플레이리스트 곡이 비어 있습니다.');
  }
}

/**
 * 플레이리스트 소유자가 아님 (원본 UnauthorizedPlaylistAccessException).
 * playlist 도메인과 동일하게 소유권 위반은 403 Forbidden 으로 매핑한다.
 */
export class UnauthorizedPlaylistAccessException extends ForbiddenException {
  constructor() {
    super(
      'UNAUTHORIZED_PLAYLIST_ACCESS',
      '플레이리스트에 접근할 권한이 없습니다.',
    );
  }
}

/** 드랍 삭제 권한 없음 (원본 InvalidDroppingDeleteRequestException) */
export class InvalidDroppingDeleteRequestException extends ForbiddenException {
  constructor() {
    super('INVALID_DROPPING_DELETE_REQUEST', '드랍을 삭제할 권한이 없습니다.');
  }
}
