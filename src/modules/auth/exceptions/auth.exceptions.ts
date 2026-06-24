import {
  AlreadyExistsException,
  BusinessException,
  InvalidRequestException,
} from '../../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

/** 이미 가입된 이메일 (LOCAL) */
export class UserAlreadyExistsException extends AlreadyExistsException {
  constructor() {
    super('USER_ALREADY_EXISTS', '이미 가입된 사용자입니다.');
  }
}

/** 동일 이메일이 OAuth2 계정으로 이미 존재 */
export class EmailAlreadyExistsWithOAuth2Exception extends BusinessException {
  constructor() {
    super(
      'EMAIL_ALREADY_EXISTS_WITH_OAUTH2',
      '해당 이메일은 소셜 로그인으로 이미 가입되어 있습니다.',
      HttpStatus.CONFLICT,
    );
  }
}

/** OAuth2 사용자가 비밀번호 로그인 시도 */
export class OAuth2UserCannotUsePasswordLoginException extends InvalidRequestException {
  constructor() {
    super(
      'OAUTH2_USER_CANNOT_USE_PASSWORD_LOGIN',
      '소셜 로그인 사용자는 비밀번호 로그인을 사용할 수 없습니다.',
    );
  }
}

/** 비밀번호 불일치 */
export class InvalidPasswordException extends InvalidRequestException {
  constructor() {
    super('INVALID_PASSWORD', '비밀번호가 올바르지 않습니다.');
  }
}
