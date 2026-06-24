import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  MarkAllReadResponse,
  NotificationListResponse,
  UnreadCountResponse,
} from './dto/notification-response.dto';
import { NotificationQuery } from './dto/notification-query.dto';
import { SseJwtAuthGuard } from './guards/sse-jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 실시간 알림 구독(SSE). 브라우저 EventSource 용으로 access token 을 쿼리로 받는다.
   * 예) new EventSource('/api/v1/notifications/subscribe?token=<accessToken>')
   * 연결 직후 `connect` 이벤트, 이후 like-created/comment-created/dropping-created,
   * 30초마다 `ping` heartbeat 가 흐른다.
   */
  @Sse('subscribe')
  @UseGuards(SseJwtAuthGuard)
  @ApiOperation({ summary: '실시간 알림 구독(SSE)' })
  @ApiQuery({ name: 'token', required: true, description: 'access token' })
  subscribe(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.notificationService.subscribe(user.id);
  }

  /** 내 알림 목록(최신순) */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 알림 목록 조회(cursor 페이지네이션)' })
  @ApiOkResponse({ type: NotificationListResponse })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: NotificationQuery,
  ): Promise<NotificationListResponse> {
    return this.notificationService.list(user.id, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /** 안 읽은 알림 개수 */
  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '안 읽은 알림 개수' })
  @ApiOkResponse({ type: UnreadCountResponse })
  getUnreadCount(@CurrentUser() user: AuthUser): Promise<UnreadCountResponse> {
    return this.notificationService.getUnreadCount(user.id);
  }

  /** 전체 읽음 처리 */
  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '알림 전체 읽음 처리' })
  @ApiOkResponse({ type: MarkAllReadResponse })
  markAllAsRead(@CurrentUser() user: AuthUser): Promise<MarkAllReadResponse> {
    return this.notificationService.markAllAsRead(user.id);
  }

  /**
   * 단건 읽음 처리. 라우트 파라미터는 카멜케이스(`:notificationId`)를 사용한다(하이픈 금지).
   */
  @Patch(':notificationId/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '알림 단건 읽음 처리' })
  markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('notificationId') notificationId: string,
  ): Promise<void> {
    return this.notificationService.markAsRead(user.id, notificationId);
  }
}
