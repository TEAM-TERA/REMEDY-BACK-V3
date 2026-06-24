import {
  BusinessException,
  UnauthorizedException,
} from '../../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

/**
 * OAuth2 도메인 예외.
 * 원본(Spring)에는 별도 OAuth2 예외가 없으나, provider userinfo 호출 실패/필수 필드 누락 등을
 * 의미 있는 도메인 예외로 표현하기 위해 베이스(BusinessException 계열)를 상속한다.
 */

/** provider(구글/카카오/네이버) userinfo API 호출 실패 (토큰 만료/무효 등) */
export class OAuth2ProviderRequestFailedException extends UnauthorizedException {
  constructor() {
    super(
      'OAUTH2_PROVIDER_REQUEST_FAILED',
      '소셜 로그인 제공자 인증에 실패했습니다.',
    );
  }
}

/** provider userinfo 응답에서 필수 식별 정보(providerId)를 얻지 못함 */
export class OAuth2InvalidUserInfoException extends BusinessException {
  constructor() {
    super(
      'OAUTH2_INVALID_USER_INFO',
      '소셜 로그인 사용자 정보를 확인할 수 없습니다.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * 동일 이메일이 다른 제공자(LOCAL 또는 타 소셜)로 이미 가입된 경우.
 * 검증되지 않은 provider 이메일로 기존 계정에 로그인되는 계정 탈취를 막기 위해 명시적으로 거절한다.
 */
export class OAuth2EmailConflictException extends BusinessException {
  constructor() {
    super(
      'OAUTH2_EMAIL_CONFLICT',
      '해당 이메일은 다른 로그인 방식으로 이미 가입되어 있습니다.',
      HttpStatus.CONFLICT,
    );
  }
}
