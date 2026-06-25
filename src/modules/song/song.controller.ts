import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: '제목+가수 통합 검색 (Spotify)' })
  @ApiOkResponse({ type: SongSearchListResponseDto })
  searchSongs(
    @Query() dto: SongSearchQueryDto,
  ): Promise<SongSearchListResponseDto> {
    return this.songService.searchSongs(dto.query);
  }

  /**
   * 특정 곡 단건 조회(로컬 캐시).
   * 곡은 드랍 생성 시 캐시되므로 캐시에 없으면 404.
   *
   * 참고: 원본의 DELETE /songs/:id 는 제거했다. songs 는 이제 외부 소스의 '참조 캐시'이고,
   * 드랍/투표/플레이리스트가 JSONB/배열로 songId 를 참조하지만 DB FK 가 없어,
   * 임의 삭제 시 해당 곡을 참조하는 드랍 상세·거리검색이 한꺼번에 깨진다(orphan).
   * 캐시 퍼지/리프레시는 참조 무결성을 고려한 별도 관리 작업으로 다룬다.
   */
  @Get(':id')
  @ApiOperation({ summary: '특정 곡 조회(캐시)' })
  @ApiOkResponse({ type: SongResponseDto })
  getSongById(@Param('id') id: string): Promise<SongResponseDto> {
    return this.songService.getSongById(id);
  }
}
