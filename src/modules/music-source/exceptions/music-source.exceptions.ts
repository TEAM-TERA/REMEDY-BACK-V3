import { BusinessException } from '../../../common/exceptions/business.exception';
import { HttpStatus } from '@nestjs/common';

/**
 * 외부 음원 소스(Spotify) 호출 실패/미설정.
 * 네트워크 오류·자격증명 미설정·업스트림 오류 등 우리가 제어할 수 없는 상황.
 * 502 로 매핑해 클라이언트가 일시적 장애로 인지하게 한다.
 */
export class MusicSourceUnavailableException extends BusinessException {
  constructor() {
    super(
      'MUSIC_SOURCE_UNAVAILABLE',
      '음원 소스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
      HttpStatus.BAD_GATEWAY,
    );
  }
}
