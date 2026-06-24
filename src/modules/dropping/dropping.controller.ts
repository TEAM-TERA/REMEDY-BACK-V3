import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DroppingService } from './dropping.service';
import { DroppingCreateRequest } from './dto/dropping-create.request';
import {
  DroppingSearchListResponse,
  MusicDroppingResponse,
  PlaylistDroppingResponse,
  VoteDroppingResponse,
} from './dto/dropping-response.dto';
import { DroppingSearchQuery, VoteRequest } from './dto/vote.request';

/**
 * dropping 컨트롤러 (원본 DroppingController 이식).
 * 전역 prefix(/api/v1)는 main.ts 에서 적용되므로 base path 는 'droppings' 만 둔다.
 * 모든 엔드포인트는 인증 필요(JwtAuthGuard).
 * 라우트 파라미터는 Express 5 호환을 위해 카멜케이스(:droppingId)로 둔다.
 */
@ApiTags('droppings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('droppings')
export class DroppingController {
  constructor(private readonly droppingService: DroppingService) {}

  /** 드랍 생성 (원본 createDropping) — 201 */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '드랍 생성 (타입별 payload)' })
  @ApiCreatedResponse({ description: '생성 성공' })
  createDropping(
    @CurrentUser() user: AuthUser,
    @Body() request: DroppingCreateRequest,
  ): Promise<void> {
    return this.droppingService.createDropping(user.id, request);
  }

  /** 거리기반 검색 (원본 searchDroppings) — distance 는 km */
  @Get()
  @ApiOperation({ summary: '거리기반 드랍 검색 (distance: km)' })
  @ApiOkResponse({ type: DroppingSearchListResponse })
  searchDroppings(
    @CurrentUser() user: AuthUser,
    @Query() query: DroppingSearchQuery,
  ): Promise<DroppingSearchListResponse> {
    return this.droppingService.searchDroppings(
      user.id,
      query.longitude,
      query.latitude,
      query.distance,
    );
  }

  /** 단건 조회 (원본 getDropping) — 타입별 상세 */
  @Get(':droppingId')
  @ApiOperation({ summary: '드랍 단건 조회 (타입별 상세)' })
  getDropping(
    @Param('droppingId') droppingId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<
    MusicDroppingResponse | VoteDroppingResponse | PlaylistDroppingResponse
  > {
    return this.droppingService.getDropping(droppingId, user.id);
  }

  /** soft delete (원본 deleteDropping) — 204 */
  @Delete(':droppingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '드랍 삭제 (soft delete, 소유자만)' })
  @ApiNoContentResponse({ description: '삭제 성공' })
  deleteDropping(
    @Param('droppingId') droppingId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.droppingService.deleteDropping(droppingId, user.id);
  }

  /** 투표 (원본 vote) — 200 */
  @Post(':droppingId/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '드랍 투표' })
  @ApiOkResponse({ description: '투표 성공' })
  vote(
    @Param('droppingId') droppingId: string,
    @CurrentUser() user: AuthUser,
    @Body() request: VoteRequest,
  ): Promise<void> {
    return this.droppingService.vote(droppingId, user.id, request.songId);
  }

  /** 투표 취소 (원본 cancelVote) — 204 */
  @Delete(':droppingId/vote')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '드랍 투표 취소' })
  @ApiNoContentResponse({ description: '취소 성공' })
  cancelVote(
    @Param('droppingId') droppingId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.droppingService.cancelVote(droppingId, user.id);
  }
}
