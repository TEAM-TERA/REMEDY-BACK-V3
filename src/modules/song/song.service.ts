import { Injectable, Logger } from '@nestjs/common';
import { Song } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SpotifyMusicClient } from '../music-source/clients/spotify-music.client';
import { YouTubeMusicResolver } from '../music-source/clients/youtube-music.resolver';
import { MusicTrack } from '../music-source/music-track';
import { buildPlayLinks } from '../music-source/play-links';
import { SongListResponseDto, SongResponseDto } from './dto/song-response.dto';
import {
  SongSearchListResponseDto,
  SongSearchResponseDto,
} from './dto/song-search.dto';
import { SongNotFoundException } from './exceptions/song.exceptions';

/** YouTube 매칭 resolve 결과 (checked=false 면 '확인 불가'로 미확정) */
interface YouTubeResolution {
  videoId: string | null;
  checked: boolean;
}

/**
 * 곡 도메인 서비스.
 *
 * 외부 음원 소스 연동 모델:
 * - 검색·식별 마스터 = Spotify. 검색은 Spotify Web API 프록시.
 * - 로컬 `songs` 테이블은 '참조된 곡 캐시'. 드랍/플레이리스트에서 참조되는 순간
 *   ensureSongs 로 Spotify 메타를 fetch+upsert 하고, 그 시점에 YouTube Music 매칭을
 *   1회 resolve 해 캐시한다(곡당 1회, 쿼터 절약).
 * - 재생 링크는 곡당 plat별로 계산(buildPlayLinks): Spotify 항상 가능, YouTube 는 매칭 시.
 */
@Injectable()
export class SongService {
  private readonly logger = new Logger(SongService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spotify: SpotifyMusicClient,
    private readonly youtube: YouTubeMusicResolver,
  ) {}

  /** 통합 검색 — Spotify 프록시. 결과는 캐시하지 않는다(드랍 시점에 ensureSongs 가 캐시). */
  async searchSongs(query: string): Promise<SongSearchListResponseDto> {
    const tracks = await this.spotify.search(query);
    return {
      songSearchResponses: tracks.map((t) => this.toSearchResponse(t)),
    };
  }

  /**
   * 단건 조회(로컬 캐시). 곡은 드랍 생성 시 ensureSongs 로 캐시되므로,
   * 여기서는 부수효과(외부 fetch/쓰기) 없이 캐시만 조회한다(없으면 SONG_NOT_FOUND).
   */
  async getSongById(id: string): Promise<SongResponseDto> {
    const song = await this.prisma.song.findUnique({ where: { id } });
    if (!song) {
      throw new SongNotFoundException();
    }
    return this.toSongResponse(song);
  }

  /** 캐시된 전체 곡 목록 (결정적 정렬: title) */
  async getAllSongs(): Promise<SongListResponseDto> {
    const songs = await this.prisma.song.findMany({
      orderBy: { title: 'asc' },
    });
    return { songResponses: songs.map((song) => this.toSongResponse(song)) };
  }

  // ── 캐시 보장(ensure) ─────────────────────────────────────────

  /**
   * songId 목록의 곡이 로컬 캐시에 존재하도록 보장하고 Map 으로 반환한다.
   * - 캐시에 있으면 그대로 사용(외부 호출 없음).
   * - 없으면 Spotify 에서 일괄 fetch → 각 곡 YouTube 매칭 resolve(best-effort) → upsert.
   * - Spotify 에도 없는 id 가 하나라도 있으면 SONG_NOT_FOUND.
   */
  async ensureSongs(ids: string[]): Promise<Map<string, Song>> {
    const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) {
      return new Map();
    }

    const existing = await this.prisma.song.findMany({
      where: { id: { in: uniqueIds } },
    });
    const map = new Map(existing.map((song) => [song.id, song]));

    const missing = uniqueIds.filter((id) => !map.has(id));
    if (missing.length === 0) {
      return map;
    }

    const tracks = await this.spotify.getTracks(missing);
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    // 요청한 곡 중 Spotify 에서 못 찾은 게 있으면 잘못된 songId
    for (const id of missing) {
      if (!trackMap.has(id)) {
        throw new SongNotFoundException();
      }
    }

    // 곡별 YT resolve + upsert 를 병렬로(VOTE/PLAYLIST 다곡 시 순차 외부호출 N+1 제거)
    const created = await Promise.all(
      missing.map(async (id) => {
        const track = trackMap.get(id)!;
        const yt = await this.resolveYouTube(track);
        return this.upsertSong(track, yt);
      }),
    );
    for (const song of created) {
      map.set(song.id, song);
    }

    return map;
  }

  /** YouTube 매칭 resolve (best-effort: 실패 시 '미확인'으로 둠) */
  private async resolveYouTube(track: MusicTrack): Promise<YouTubeResolution> {
    try {
      const match = await this.youtube.resolve({
        title: track.title,
        artist: track.artist,
      });
      return { videoId: match?.videoId ?? null, checked: true };
    } catch {
      // 키 미설정/쿼터/네트워크 → 확인 불가. 곡 생성은 막지 않고 미확인 상태로 캐시.
      this.logger.warn(`YouTube 매칭 확인 불가 → 미확인 처리: ${track.title}`);
      return { videoId: null, checked: false };
    }
  }

  /**
   * Spotify track + YT 매칭을 songs 캐시에 upsert(동시 생성 race 대비).
   * 충돌(이미 존재) 시 update 는 메타데이터만 갱신하고 YT 캐시(youtubeVideoId/Checked)는
   * 건드리지 않는다 — 동시 ensure 에서 한쪽 resolve 실패가 이미 확정된 매칭을 퇴행시키지 않도록.
   */
  private upsertSong(track: MusicTrack, yt: YouTubeResolution): Promise<Song> {
    const metadata = {
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      albumImagePath: track.albumImagePath,
    };
    return this.prisma.song.upsert({
      where: { id: track.id },
      create: {
        id: track.id,
        ...metadata,
        youtubeVideoId: yt.videoId,
        youtubeChecked: yt.checked,
      },
      update: metadata,
    });
  }

  // ── 매핑 ──────────────────────────────────────────────────────

  private toSongResponse(song: Song): SongResponseDto {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      albumImagePath: song.albumImagePath,
      playLinks: buildPlayLinks(song),
    };
  }

  private toSearchResponse(track: MusicTrack): SongSearchResponseDto {
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumImagePath: track.albumImagePath,
    };
  }
}
