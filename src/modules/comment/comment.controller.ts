import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommentService } from './comment.service';
import {
  CommentUpdateRequest,
  CreateCommentRequest,
} from './dto/comment-request.dto';
import {
  CommentCountResponse,
  CommentResponse,
} from './dto/comment-response.dto';

@ApiTags('comments')
@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  /** 댓글 작성 (원본 createComment) — 인증 필요, 201 */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '댓글 작성' })
  @ApiCreatedResponse({ description: '작성 성공' })
  createComment(
    @CurrentUser() user: AuthUser,
    @Body() request: CreateCommentRequest,
  ): Promise<void> {
    return this.commentService.createComment(user.id, request);
  }

  /** 특정 드랍핑의 댓글 목록 조회 (원본 getCommentsByDropping) */
  @Get('droppings/:droppingId')
  @ApiOperation({ summary: '드랍핑 댓글 목록 조회' })
  @ApiOkResponse({ type: [CommentResponse] })
  getCommentsByDropping(
    @Param('droppingId') droppingId: string,
  ): Promise<CommentResponse[]> {
    return this.commentService.getCommentsByDropping(droppingId);
  }

  /** 댓글 수정 (원본 updateComment) — 인증 필요, 본인만, 200 */
  @Put(':commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '댓글 수정' })
  updateComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: AuthUser,
    @Body() request: CommentUpdateRequest,
  ): Promise<void> {
    return this.commentService.updateComment(user.id, commentId, request);
  }

  /** 댓글 삭제 (원본 deleteComment) — 인증 필요, 본인만, 200(원본 ok()) */
  @Delete(':commentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '댓글 삭제' })
  deleteComment(
    @Param('commentId', ParseIntPipe) commentId: number,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.commentService.deleteComment(user.id, commentId);
  }

  /** 특정 드랍핑의 댓글 수 (원본 getCommentCount) */
  @Get('count/:droppingId')
  @ApiOperation({ summary: '드랍핑 댓글 수 조회' })
  @ApiOkResponse({ type: CommentCountResponse })
  async getCommentCount(
    @Param('droppingId') droppingId: string,
  ): Promise<CommentCountResponse> {
    const count = await this.commentService.countByDroppingId(droppingId);
    return { count };
  }
}
