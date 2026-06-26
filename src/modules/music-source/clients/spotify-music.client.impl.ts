import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SpotifyMusicClient } from './spotify-music.client';
import { MusicTrack } from '../music-track';
import { MusicSourceUnavailableException } from '../exceptions/music-source.exceptions';
import { retryTransient } from './retry';

/** Spotify track 객체(필요 필드만) */
interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: Array<{ url?: string }> };
}

interface SpotifySearchResponse {
  tracks?: { items?: Array<SpotifyTrack | null> };
}

interface SpotifyTracksResponse {
  tracks?: Array<SpotifyTrack | null>;
}

interface SpotifyTokenResponse {
  access_token?: string;
  expires_in?: number;
}

/**
 * Spotify Web API 클라이언트(Client Credentials 플로우).
 * - 앱 단위 토큰(공개 카탈로그 읽기 전용, 사용자 로그인 불필요)을 발급·캐시한다.
 * - 검색 GET /v1/search, 트랙 일괄조회 GET /v1/tracks 를 호출해 MusicTrack 으로 정규화한다.
 * - 자격증명 미설정/업스트림 오류는 MusicSourceUnavailableException(502) 로 변환한다.
 */
@Injectable()
export class SpotifyMusicClientImpl
  extends SpotifyMusicClient
  implements OnModuleInit
{
  private readonly logger = new Logger(SpotifyMusicClientImpl.name);

  private static readonly TOKEN_URL = 'https://accounts.spotify.com/api/token';
  private static readonly API_BASE = 'https://api.spotify.com/v1';
  /** /v1/tracks 는 한 번에 최대 50개 */
  private static readonly TRACKS_BATCH = 50;
  private static readonly DEFAULT_SEARCH_LIMIT = 20;

  /** 발급받은 토큰 캐시(만료 60s 전 갱신) */
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  /** Spotify 는 검색·식별의 하드 의존 → 자격증명 미설정 시 부팅 시점에 경고로 가시화 */
  onModuleInit(): void {
    const hasCreds =
      !!this.config.get<string>('SPOTIFY_CLIENT_ID') &&
      !!this.config.get<string>('SPOTIFY_CLIENT_SECRET');
    if (!hasCreds) {
      this.logger.warn(
        'SPOTIFY_CLIENT_ID/SECRET 미설정 — 곡 검색/드랍 곡 fetch 가 502 로 실패합니다.',
      );
    }
  }

  async search(
    query: string,
    limit = SpotifyMusicClientImpl.DEFAULT_SEARCH_LIMIT,
  ): Promise<MusicTrack[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }

    const token = await this.getAccessToken();
    const data = await this.get<SpotifySearchResponse>(
      `${SpotifyMusicClientImpl.API_BASE}/search`,
      token,
      { q: trimmed, type: 'track', limit },
    );

    const items = data.tracks?.items ?? [];
    return items
      .filter((t): t is SpotifyTrack => t != null)
      .map((t) => this.toTrack(t));
  }

  async getTracks(trackIds: string[]): Promise<MusicTrack[]> {
    const uniqueIds = [...new Set(trackIds.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const token = await this.getAccessToken();
    const results: MusicTrack[] = [];

    // 50개씩 끊어서 일괄 조회
    for (
      let i = 0;
      i < uniqueIds.length;
      i += SpotifyMusicClientImpl.TRACKS_BATCH
    ) {
      const batch = uniqueIds.slice(i, i + SpotifyMusicClientImpl.TRACKS_BATCH);
      const data = await this.get<SpotifyTracksResponse>(
        `${SpotifyMusicClientImpl.API_BASE}/tracks`,
        token,
        { ids: batch.join(',') },
      );
      for (const track of data.tracks ?? []) {
        if (track != null) {
          results.push(this.toTrack(track));
        }
      }
    }

    return results;
  }

  /** Client Credentials 토큰 발급(캐시 유효 시 재사용) */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.value;
    }

    const clientId = this.config.get<string>('SPOTIFY_CLIENT_ID');
    const clientSecret = this.config.get<string>('SPOTIFY_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      this.logger.error('SPOTIFY_CLIENT_ID/SECRET 미설정');
      throw new MusicSourceUnavailableException();
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({ grant_type: 'client_credentials' });

    try {
      // 일시적 오류(429/5xx/네트워크/타임아웃)만 백오프 재시도, 그 외는 즉시 throw.
      const res = await retryTransient(
        () =>
          firstValueFrom(
            this.http.post<SpotifyTokenResponse>(
              SpotifyMusicClientImpl.TOKEN_URL,
              body.toString(),
              {
                headers: {
                  Authorization: `Basic ${basic}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
              },
            ),
          ),
        {
          onRetry: (attempt, delayMs) =>
            this.logger.warn(`Spotify 토큰 재시도 ${attempt} (${delayMs}ms)`),
        },
      );
      const accessToken = res.data.access_token;
      const expiresIn = res.data.expires_in ?? 3600;
      if (!accessToken) {
        throw new MusicSourceUnavailableException();
      }
      this.cachedToken = {
        value: accessToken,
        expiresAt: now + (expiresIn - 60) * 1000,
      };
      return accessToken;
    } catch (error) {
      if (error instanceof MusicSourceUnavailableException) {
        throw error;
      }
      this.logger.error(
        'Spotify 토큰 발급 실패',
        error instanceof Error ? error.stack : undefined,
      );
      throw new MusicSourceUnavailableException();
    }
  }

  /** Bearer 토큰으로 GET 호출(업스트림 오류 → 502) */
  private async get<T>(
    url: string,
    token: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    try {
      // 일시적 오류(429/5xx/네트워크/타임아웃)만 백오프 재시도, 그 외는 즉시 throw.
      const res = await retryTransient(
        () =>
          firstValueFrom(
            this.http.get<T>(url, {
              headers: { Authorization: `Bearer ${token}` },
              params,
            }),
          ),
        {
          onRetry: (attempt, delayMs) =>
            this.logger.warn(
              `Spotify API 재시도 ${attempt} (${delayMs}ms): ${url}`,
            ),
        },
      );
      return res.data;
    } catch (error) {
      this.logger.error(
        `Spotify API 호출 실패: ${url}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new MusicSourceUnavailableException();
    }
  }

  /** Spotify track → 표준 MusicTrack 정규화 */
  private toTrack(track: SpotifyTrack): MusicTrack {
    const artist =
      (track.artists ?? [])
        .map((a) => a.name)
        .filter((name): name is string => !!name && name.length > 0)
        .join(', ') || 'Unknown Artist';

    return {
      id: track.id,
      title: track.name,
      artist,
      album: track.album?.name ?? null,
      duration: Math.round((track.duration_ms ?? 0) / 1000),
      albumImagePath: track.album?.images?.[0]?.url ?? '',
    };
  }
}
