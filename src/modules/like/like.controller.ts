import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LikeRequest } from './dto/like-request.dto';
import { LikeCountResponse, LikeToggleResponse } from './dto/like-response.dto';
import { LikeService } from './like.service';

@ApiTags('likes')
@Controller('likes')
export class LikeController {
  constructor(private readonly likeService: LikeService) {}

  /** 좋아요 토글 (원본 LikeController.toggleLike) — 이미 있으면 취소, 없으면 생성 */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '좋아요 토글' })
  @ApiOkResponse({ type: LikeToggleResponse })
  toggleLike(
    @CurrentUser() user: AuthUser,
    @Body() request: LikeRequest,
  ): Promise<LikeToggleResponse> {
    return this.likeService.toggleLike(user.id, request.droppingId);
  }

  /** 내가 누른 좋아요 수 (원본 getLikeCountByUser) */
  @Get('count/user')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 좋아요 개수 조회' })
  @ApiOkResponse({ type: LikeCountResponse })
  getLikeCountByUser(
    @CurrentUser() user: AuthUser,
  ): Promise<LikeCountResponse> {
    return this.likeService.getLikeCountByUser(user.id);
  }

  /**
   * 특정 dropping 좋아요 수 (원본 getLikeCountByDropping).
   * 라우트 파라미터는 카멜케이스 `:droppingId` 를 사용한다(하이픈 금지).
   */
  @Get('count/dropping/:droppingId')
  @ApiOperation({ summary: '특정 드롭 좋아요 개수 조회' })
  @ApiOkResponse({ type: LikeCountResponse })
  getLikeCountByDropping(
    @Param('droppingId') droppingId: string,
  ): Promise<LikeCountResponse> {
    return this.likeService.getLikeCountByDropping(droppingId);
  }
}
