import { NotFoundException } from '../../../common/exceptions/business.exception';

/** 알림이 없거나 본인 소유가 아님 (정보 노출 방지를 위해 NotFound 로 통일) */
export class NotificationNotFoundException extends NotFoundException {
  constructor() {
    super('NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
  }
}
