import { NotFoundException } from '../../../common/exceptions/business.exception';

/** 곡을 찾을 수 없음 (원본 SongNotFoundException 이식) */
export class SongNotFoundException extends NotFoundException {
  constructor() {
    super('SONG_NOT_FOUND', '곡을 찾을 수 없습니다.');
  }
}
