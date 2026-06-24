import { Injectable } from '@nestjs/common';
import { Prisma, Song } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SongListResponseDto, SongResponseDto } from './dto/song-response.dto';
import {
  SongSearchListResponseDto,
  SongSearchResponseDto,
} from './dto/song-search.dto';
import { SongNotFoundException } from './exceptions/song.exceptions';

/**
 * 곡 도메인 서비스 (원본 SongService 이식)
 *
 * 원본은 Elasticsearch(nori 형태소 분석기) 기반 통합 검색을 사용했으나,
 * 여기서는 Postgres + pg_trgm(트라이그램) 으로 대체한다.
 * - 부분 일치: ILIKE '%query%'
 * - 정렬: similarity() 유사도 내림차순
 */
@Injectable()
export class SongService {
  constructor(private readonly prisma: PrismaService) {}

  /** ID로 곡 단건 조회 (원본 getSongById) */
  async getSongById(id: string): Promise<SongResponseDto> {
    const song = await this.prisma.song.findUnique({ where: { id } });
    if (!song) {
      throw new SongNotFoundException();
    }
    return this.toSongResponse(song);
  }

  /** 전체 곡 목록 조회 (원본 getAllSongs) — 결정적 정렬(title) */
  async getAllSongs(): Promise<SongListResponseDto> {
    const songs = await this.prisma.song.findMany({
      orderBy: { title: 'asc' },
    });
    return {
      songResponses: songs.map((song) => this.toSongResponse(song)),
    };
  }

  /**
   * 제목+가수 통합 검색 (원본 searchSongs)
   *
   * title 또는 artist 가 검색어를 부분 포함(ILIKE '%query%')하는 곡을 찾고,
   * title/artist 의 트라이그램 유사도(greatest) 내림차순으로 정렬한다.
   * pg_trgm GIN 인덱스가 ILIKE 부분 일치를 가속한다.
   *
   * SQL 인젝션 방지를 위해 $queryRaw 의 파라미터 바인딩($1)을 사용한다.
   */
  async searchSongs(query: string): Promise<SongSearchListResponseDto> {
    const trimmed = query.trim();
    // 빈 검색어는 빈 결과 반환 (원본 fallback 동작과 동등)
    if (trimmed.length === 0) {
      return { songSearchResponses: [] };
    }

    const pattern = `%${trimmed}%`;

    // 파라미터 바인딩으로 안전하게 쿼리 구성.
    // similarity(title, query) 와 similarity(artist, query) 중 큰 값으로 정렬.
    const songs = await this.prisma.$queryRaw<Song[]>(Prisma.sql`
      SELECT id, title, artist, duration, album_image_path AS "albumImagePath"
      FROM songs
      WHERE title ILIKE ${pattern} OR artist ILIKE ${pattern}
      ORDER BY GREATEST(
                 similarity(title, ${trimmed}),
                 similarity(artist, ${trimmed})
               ) DESC,
               title ASC
      LIMIT 20
    `);

    return {
      songSearchResponses: songs.map((song) => this.toSongSearchResponse(song)),
    };
  }

  /** 곡 삭제 (원본 deleteSong) — 존재하지 않으면 예외. 단일 delete + P2025 변환으로 원자적 처리 */
  async deleteSong(id: string): Promise<void> {
    try {
      await this.prisma.song.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new SongNotFoundException();
      }
      throw error;
    }
  }

  /** Song 엔티티 → SongResponseDto 매핑 (원본 SongMapper.toSongResponse) */
  private toSongResponse(song: Song): SongResponseDto {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      albumImagePath: song.albumImagePath,
    };
  }

  /** Song 엔티티 → SongSearchResponseDto 매핑 (원본 SongMapper.toSongSearchResponse) */
  private toSongSearchResponse(song: Song): SongSearchResponseDto {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      albumImagePath: song.albumImagePath,
    };
  }
}
