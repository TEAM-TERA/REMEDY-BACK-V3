import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 도메인 비즈니스 예외의 베이스 클래스.
 * 원본(Spring)의 BusinessBaseException + ErrorCode 구조를 NestJS 관용에 맞게 이식한다.
 * 각 도메인은 이 클래스를 상속해 의미 있는 예외(예: UserNotFoundException)를 정의한다.
 *
 * 응답 본문은 전역 예외 필터가 { statusCode, code, message, timestamp, path } 형태로 직렬화한다.
 */
export class BusinessException extends HttpException {
  /** 클라이언트가 분기에 사용할 수 있는 안정적인 에러 코드 (예: USER_NOT_FOUND) */
  readonly code: string;

  constructor(code: string, message: string, status: HttpStatus) {
    super({ code, message }, status);
    this.code = code;
  }
}

// ── 자주 쓰는 의미별 베이스 예외 ──────────────────────────────

export class NotFoundException extends BusinessException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

export class AlreadyExistsException extends BusinessException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.CONFLICT);
  }
}

export class InvalidRequestException extends BusinessException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}

export class UnauthorizedException extends BusinessException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class ForbiddenException extends BusinessException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}
