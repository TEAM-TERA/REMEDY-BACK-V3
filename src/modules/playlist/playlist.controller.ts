import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
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
import {
  PlaylistCreateRequest,
  PlaylistSongAddRequest,
  PlaylistUpdateRequest,
} from './dto/playlist-request.dto';
import {
  PlaylistDetailResponse,
  PlaylistListResponse,
} from './dto/playlist-response.dto';
import { PlaylistService } from './playlist.service';

@ApiTags('playlists')
@Controller('playlists')
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '플레이리스트 생성' })
  @ApiCreatedResponse({ description: '생성 성공' })
  createPlaylist(
    @CurrentUser() user: AuthUser,
    @Body() request: PlaylistCreateRequest,
  ): Promise<void> {
    return this.playlistService.createPlaylist(user.id, request);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 플레이리스트 목록 조회' })
  @ApiOkResponse({ type: PlaylistListResponse })
  getMyPlaylists(@CurrentUser() user: AuthUser): Promise<PlaylistListResponse> {
    return this.playlistService.getMyPlaylists(user.id);
  }

  @Get(':playlistId')
  @ApiOperation({ summary: '플레이리스트 상세 조회 (곡 정보 포함)' })
  @ApiOkResponse({ type: PlaylistDetailResponse })
  getPlaylist(
    @Param('playlistId') playlistId: string,
  ): Promise<PlaylistDetailResponse> {
    return this.playlistService.getPlaylist(playlistId);
  }

  @Put(':playlistId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '플레이리스트 이름 수정' })
  updatePlaylist(
    @Param('playlistId') playlistId: string,
    @CurrentUser() user: AuthUser,
    @Body() request: PlaylistUpdateRequest,
  ): Promise<void> {
    return this.playlistService.updatePlaylist(playlistId, user.id, request);
  }

  @Delete(':playlistId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '플레이리스트 삭제' })
  @ApiNoContentResponse({ description: '삭제 성공' })
  deletePlaylist(
    @Param('playlistId') playlistId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.playlistService.deletePlaylist(playlistId, user.id);
  }

  @Post(':playlistId/songs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '플레이리스트에 곡 추가' })
  @ApiCreatedResponse({ description: '추가 성공' })
  addSongToPlaylist(
    @Param('playlistId') playlistId: string,
    @CurrentUser() user: AuthUser,
    @Body() request: PlaylistSongAddRequest,
  ): Promise<void> {
    return this.playlistService.addSongToPlaylist(playlistId, user.id, request);
  }

  @Delete(':playlistId/songs/:songId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '플레이리스트에서 곡 제거' })
  @ApiNoContentResponse({ description: '제거 성공' })
  removeSongFromPlaylist(
    @Param('playlistId') playlistId: string,
    @Param('songId') songId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.playlistService.removeSongFromPlaylist(
      playlistId,
      songId,
      user.id,
    );
  }
}
