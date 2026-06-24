import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SongListResponseDto, SongResponseDto } from './dto/song-response.dto';
import {
  SongSearchListResponseDto,
  SongSearchQueryDto,
} from './dto/song-search.dto';
import { SongService } from './song.service';

/**
 * 곡 컨트롤러 (원본 SongController 이식)
 * 전역 prefix(/api/v1)는 main.ts 에서 적용되므로 base path 는 'songs' 만 둔다.
 * 원본과 동일하게 인증 가드는 붙이지 않는다(공개 API).
 */
@ApiTags('songs')
@Controller('songs')
export class SongController {
  constructor(private readonly songService: SongService) {}

  /** 전체 곡 목록 조회 (원본 getAllSongs) */
  @Get()
  @ApiOperation({ summary: '전체 곡 목록 조회' })
  @ApiOkResponse({ type: SongListResponseDto })
  getAllSongs(): Promise<SongListResponseDto> {
    return this.songService.getAllSongs();
  }

  /**
   * 제목+가수 통합 검색 (원본 searchSongs)
   * 검색 라우트는 ':id' 보다 먼저 선언해 'search' 가 id 로 해석되지 않게 한다.
   */
  @Get('search')
  @ApiOperation({ summary: '제목+가수 통합 검색 (pg_trgm)' })
  @ApiOkResponse({ type: SongSearchListResponseDto })
  searchSongs(
    @Query() dto: SongSearchQueryDto,
  ): Promise<SongSearchListResponseDto> {
    return this.songService.searchSongs(dto.query);
  }

  /** 특정 곡 단건 조회 (원본 getSongById) */
  @Get(':id')
  @ApiOperation({ summary: '특정 곡 조회' })
  @ApiOkResponse({ type: SongResponseDto })
  getSongById(@Param('id') id: string): Promise<SongResponseDto> {
    return this.songService.getSongById(id);
  }

  /** 특정 곡 삭제 (원본 deleteSong) — 204 No Content */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '특정 곡 삭제' })
  @ApiNoContentResponse()
  deleteSong(@Param('id') id: string): Promise<void> {
    return this.songService.deleteSong(id);
  }
}
