import {
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/business.exception';

/** 댓글을 찾을 수 없음 (원본 CommentNotFoundException → COMMENT_NOT_FOUND) */
export class CommentNotFoundException extends NotFoundException {
  constructor() {
    super('COMMENT_NOT_FOUND', '댓글을 찾을 수 없습니다.');
  }
}

/**
 * 댓글 소유자가 아님 (원본 CommentAccessDeniedException → COMMENT_ACCESS_DENIED).
 * 원본은 BusinessBaseException(COMMENT_ACCESS_DENIED)이나,
 * 본 프로젝트 컨벤션상 소유권 위반은 403 Forbidden 으로 매핑한다(playlist 와 동일).
 */
export class CommentAccessDeniedException extends ForbiddenException {
  constructor() {
    super('COMMENT_ACCESS_DENIED', '댓글에 접근할 권한이 없습니다.');
  }
}

/**
 * 드랍핑을 찾을 수 없음 (원본 dropping 도메인 DroppingNotFoundException).
 * dropping 모듈이 아직 없으므로 comment 도메인 내부에서 정의해 재사용한다.
 */
export class DroppingNotFoundException extends NotFoundException {
  constructor() {
    super('DROPPING_NOT_FOUND', '드랍핑을 찾을 수 없습니다.');
  }
}
