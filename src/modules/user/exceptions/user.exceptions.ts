import {
  BusinessException,
  NotFoundException,
} from '../../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

/** 사용자를 찾을 수 없음 */
export class UserNotFoundException extends NotFoundException {
  constructor() {
    super('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  }
}

/** 탈퇴한 사용자 */
export class WithdrawnUserException extends BusinessException {
  constructor() {
    super('USER_WITHDRAWN', '탈퇴한 사용자입니다.', HttpStatus.FORBIDDEN);
  }
}
