import { BusinessException } from '../../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

// 참고: UserNotFoundException 은 교차 참조되므로
// src/common/exceptions/not-found.exception.ts 로 통합되었다.

/** 탈퇴한 사용자 */
export class WithdrawnUserException extends BusinessException {
  constructor() {
    super('USER_WITHDRAWN', '탈퇴한 사용자입니다.', HttpStatus.FORBIDDEN);
  }
}
