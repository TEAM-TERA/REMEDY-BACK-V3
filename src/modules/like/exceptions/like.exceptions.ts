import { NotFoundException } from '../../../common/exceptions/business.exception';

/**
 * dropping 을 찾을 수 없음 (원본 DroppingNotFoundException 이식).
 * like 도메인은 dropping 모듈과 결합하지 않고 PrismaService 로 직접 존재 여부를
 * 검증하므로, 토글/카운트 시 사용할 자체 예외를 like 도메인에 둔다.
 * 원본 ErrorCode.DROPPING_NOT_FOUND 와 동일한 코드를 사용한다.
 */
export class DroppingNotFoundException extends NotFoundException {
  constructor() {
    super('DROPPING_NOT_FOUND', '드롭을 찾을 수 없습니다.');
  }
}
