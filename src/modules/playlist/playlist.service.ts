import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Playlist, Song } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PlaylistCreateRequest,
  PlaylistSongAddRequest,
  PlaylistUpdateRequest,
} from './dto/playlist-request.dto';
import {
  PlaylistDetailResponse,
  PlaylistListResponse,
  PlaylistResponse,
  PlaylistSongResponse,
} from './dto/playlist-response.dto';
import {
  SongAlreadyInPlaylistException,
  SongNotInPlaylistException,
  UnauthorizedPlaylistAccessException,
} from './exceptions/playlist.exceptions';
import {
  PlaylistNotFoundException,
  SongNotFoundException,
} from '../../common/exceptions/not-found.exception';
import { orThrow, assertOwnership } from '../../common/utils/guard';
import { runSerializable } from '../../common/utils/transaction';
import { SongService } from '../song/song.service';

@Injectable()
export class PlaylistService {
  private readonly logger = new Logger(PlaylistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly songService: SongService,
  ) {}

  /** 플레이리스트 생성 (원본 createPlaylist) */
  async createPlaylist(
    userId: number,
    request: PlaylistCreateRequest,
  ): Promise<void> {
    // 원본은 User 존재 여부를 검증하나, 인증 가드를 통과한 user 는 DB 상 존재가 보장되므로 생략
    await this.prisma.playlist.create({
      data: { name: request.name, userId, songIds: [] },
    });
  }

  /**
   * 플레이리스트 상세 조회 (원본 getPlaylist).
   * songIds 를 songs 테이블에서 직접 조회해 곡 정보로 해석하며, songIds 순서를 유지한다.
   * 참조된 곡 중 하나라도 존재하지 않으면 SongNotFoundException (원본 동작과 동일).
   */
  async getPlaylist(playlistId: string): Promise<PlaylistDetailResponse> {
    const playlist = await this.findPlaylistOrThrow(playlistId);

    const songs = await this.resolveSongs(playlist.songIds);

    return {
      id: playlist.id,
      name: playlist.name,
      songs,
    };
  }

  /** 내 플레이리스트 목록 조회 (원본 getMyPlaylists) */
  async getMyPlaylists(userId: number): Promise<PlaylistListResponse> {
    const playlists = await this.prisma.playlist.findMany({
      where: { userId },
    });

    const albumImageMap = await this.createAlbumImageMap(playlists);

    const responses: PlaylistResponse[] = playlists.map((playlist) =>
      this.createPlaylistResponse(playlist, albumImageMap),
    );

    return { playlists: responses };
  }

  /** 플레이리스트 이름 수정 (원본 updatePlaylist, 소유자 검증) */
  async updatePlaylist(
    playlistId: string,
    userId: number,
    request: PlaylistUpdateRequest,
  ): Promise<void> {
    const playlist = await this.findPlaylistOrThrow(playlistId);
    this.validatePlaylistOwner(playlist, userId);

    // 원본 Playlist.update: 공백/빈 이름이면 기존 이름 유지(갱신 생략)
    const name = request.name?.trim();
    if (!name) return;

    await this.prisma.playlist.update({
      where: { id: playlistId },
      data: { name },
    });
  }

  /** 플레이리스트 삭제 (원본 deletePlaylist, 소유자 검증) */
  async deletePlaylist(playlistId: string, userId: number): Promise<void> {
    const playlist = await this.findPlaylistOrThrow(playlistId);
    this.validatePlaylistOwner(playlist, userId);

    await this.prisma.playlist.delete({ where: { id: playlistId } });
  }

  /**
   * 곡 추가 (원본 addSongToPlaylist).
   * 소유자 검증 → 곡 존재 검증 → 중복 검증 후 추가. 추가되는 곡 순서는 요청 순서를 유지한다.
   *
   * songIds 는 text[] 배열이라 DB 유니크 제약이 없다. read(findUnique)→검증→write(update) 를
   * Serializable 트랜잭션으로 원자화해, 동시 요청이 같은 songIds 를 읽고 각자 검증을 통과한 뒤
   * 곡을 중복 입력하거나 lost update 를 일으키는 경쟁 조건을 차단한다.
   * 검증 순서/던지는 예외(PlaylistNotFound→Unauthorized→SongNotFound→SongAlreadyInPlaylist)는 보존한다.
   */
  async addSongToPlaylist(
    playlistId: string,
    userId: number,
    request: PlaylistSongAddRequest,
  ): Promise<void> {
    await runSerializable(
      this.prisma,
      async (tx) => {
        const playlist = orThrow(
          await tx.playlist.findUnique({ where: { id: playlistId } }),
          () => new PlaylistNotFoundException(),
        );
        this.validatePlaylistOwner(playlist, userId);

        const requestedSongIds = request.songIds;
        await this.validateSongsExist(requestedSongIds, tx);
        this.validateNoDuplicateSongs(playlist, requestedSongIds);

        // 선행 검증(validateSongsExist: 요청 내 중복 거절, validateNoDuplicateSongs: 기존과 중복 거절)을
        // 통과했으므로 요청 곡은 모두 신규이며 서로 유일하다 → 기존 순서 뒤에 그대로 덧붙인다.
        const merged = [...playlist.songIds, ...requestedSongIds];

        await tx.playlist.update({
          where: { id: playlistId },
          data: { songIds: merged },
        });
      },
      {
        onRetry: (attempt) =>
          this.logger.warn(
            `플레이리스트 곡 추가 직렬화 충돌 재시도 ${attempt} - playlistId=${playlistId}`,
          ),
      },
    );
  }

  /**
   * 곡 제거 (원본 removeSongFromPlaylist, 소유자 검증).
   * read→검증→write 를 Serializable 트랜잭션으로 원자화해 동시 제거의 lost update 를 방지한다.
   * 검증 순서/던지는 예외(PlaylistNotFound→Unauthorized→SongNotInPlaylist)는 보존한다.
   */
  async removeSongFromPlaylist(
    playlistId: string,
    songId: string,
    userId: number,
  ): Promise<void> {
    await runSerializable(
      this.prisma,
      async (tx) => {
        const playlist = orThrow(
          await tx.playlist.findUnique({ where: { id: playlistId } }),
          () => new PlaylistNotFoundException(),
        );
        this.validatePlaylistOwner(playlist, userId);

        if (!playlist.songIds.includes(songId)) {
          throw new SongNotInPlaylistException();
        }

        const remaining = playlist.songIds.filter((id) => id !== songId);

        await tx.playlist.update({
          where: { id: playlistId },
          data: { songIds: remaining },
        });
      },
      {
        onRetry: (attempt) =>
          this.logger.warn(
            `플레이리스트 곡 제거 직렬화 충돌 재시도 ${attempt} - playlistId=${playlistId}`,
          ),
      },
    );
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────

  /** 플레이리스트 조회 후 없으면 예외 */
  private async findPlaylistOrThrow(playlistId: string): Promise<Playlist> {
    return orThrow(
      await this.prisma.playlist.findUnique({ where: { id: playlistId } }),
      () => new PlaylistNotFoundException(),
    );
  }

  /** 소유자 검증 (원본 validatePlaylistOwner) */
  private validatePlaylistOwner(playlist: Playlist, userId: number): void {
    assertOwnership(
      playlist.userId,
      userId,
      () => new UnauthorizedPlaylistAccessException(),
    );
  }

  /**
   * songIds 를 곡 정보로 해석 (순서 유지).
   * 하나라도 존재하지 않으면 SongNotFoundException (원본 getPlaylist 동작).
   */
  private async resolveSongs(
    songIds: string[],
  ): Promise<PlaylistSongResponse[]> {
    // 누락 시 loadSongMap 이 이미 SongNotFoundException 을 던지므로 get 은 non-null.
    const songMap = await this.songService.loadSongMap(songIds);
    return songIds.map((id) => this.toSongResponse(songMap.get(id)!));
  }

  /**
   * 곡 존재 검증 (원본 validateSongsExist).
   * 원본은 존재 곡 수 != 요청 곡 수 이면 거절하므로, 요청 내 중복 id 도 거절된다(원본 동작 유지).
   */
  private async validateSongsExist(
    songIds: string[],
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const count = await client.song.count({
      where: { id: { in: songIds } },
    });
    if (count !== songIds.length) {
      throw new SongNotFoundException();
    }
  }

  /** 중복 곡 검증 (원본 validateNoDuplicateSongs) */
  private validateNoDuplicateSongs(
    playlist: Playlist,
    songIds: string[],
  ): void {
    const existing = new Set(playlist.songIds);
    const hasDuplicate = songIds.some((songId) => existing.has(songId));
    if (hasDuplicate) {
      throw new SongAlreadyInPlaylistException();
    }
  }

  /** 목록용: 각 플레이리스트의 첫 곡 → 앨범 이미지 맵 생성 (원본 createAlbumImageMap) */
  private async createAlbumImageMap(
    playlists: Playlist[],
  ): Promise<Map<string, string>> {
    const firstSongIds = [
      ...new Set(
        playlists
          .filter((playlist) => playlist.songIds.length > 0)
          .map((playlist) => playlist.songIds[0]),
      ),
    ];

    if (firstSongIds.length === 0) return new Map();

    const songs = await this.prisma.song.findMany({
      where: { id: { in: firstSongIds } },
    });

    return new Map(songs.map((song) => [song.id, song.albumImagePath]));
  }

  /** 목록 항목 변환 (원본 createPlaylistResponse) */
  private createPlaylistResponse(
    playlist: Playlist,
    albumImageMap: Map<string, string>,
  ): PlaylistResponse {
    let albumImageUrl: string | null = null;
    if (playlist.songIds.length > 0) {
      albumImageUrl = albumImageMap.get(playlist.songIds[0]) ?? null;
    }
    return {
      id: playlist.id,
      name: playlist.name,
      albumImageUrl,
    };
  }

  /** Song → PlaylistSongResponse 변환 (원본 SongMapper.toSongResponse) */
  private toSongResponse(song: Song): PlaylistSongResponse {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      albumImagePath: song.albumImagePath,
    };
  }
}
