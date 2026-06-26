import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { YouTubeMatch, YouTubeMusicResolver } from './youtube-music.resolver';
import { MusicSourceUnavailableException } from '../exceptions/music-source.exceptions';
import { retryTransient } from './retry';

interface YouTubeSearchItem {
  id?: { videoId?: string };
}
interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

/**
 * YouTube Data API v3 기반 매칭 resolver.
 * - search.list 로 "아티스트 제목" 을 검색해 첫 영상 id 를 매칭으로 사용한다.
 * - 매칭 없음 → null(확정적 미지원). 키 미설정/쿼터/네트워크 오류 → 예외(확인 불가).
 *   호출측(SongService.ensureSongs)이 예외는 best-effort 로 흡수해 곡을 '미확인' 상태로 둔다.
 * - search.list 는 호출당 쿼터 100유닛(무료 일 10,000=하루 ~100회)이므로,
 *   곡당 1회(최초 캐시 시점)만 호출하고 결과를 영구 캐시한다.
 */
@Injectable()
export class YouTubeMusicResolverImpl extends YouTubeMusicResolver {
  private readonly logger = new Logger(YouTubeMusicResolverImpl.name);

  private static readonly SEARCH_URL =
    'https://www.googleapis.com/youtube/v3/search';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async resolve(track: {
    title: string;
    artist: string;
  }): Promise<YouTubeMatch | null> {
    const apiKey = this.config.get<string>('YOUTUBE_API_KEY');
    if (!apiKey) {
      // 키가 없으면 '확인 불가' → 예외로 알리고 호출측이 미확인 상태로 둔다.
      throw new MusicSourceUnavailableException();
    }

    const query = `${track.artist} ${track.title}`.trim();

    let data: YouTubeSearchResponse;
    try {
      // 일시적 오류(429 쿼터/5xx/네트워크/타임아웃)만 백오프 재시도, 그 외는 즉시 throw.
      const res = await retryTransient(
        () =>
          firstValueFrom(
            this.http.get<YouTubeSearchResponse>(
              YouTubeMusicResolverImpl.SEARCH_URL,
              {
                params: {
                  part: 'snippet',
                  q: query,
                  type: 'video',
                  videoCategoryId: '10', // Music
                  maxResults: 1,
                  key: apiKey,
                },
              },
            ),
          ),
        {
          onRetry: (attempt, delayMs) =>
            this.logger.warn(
              `YouTube 매칭 재시도 ${attempt} (${delayMs}ms): "${query}"`,
            ),
        },
      );
      data = res.data;
    } catch (error) {
      this.logger.warn(
        `YouTube 매칭 실패(쿼터/네트워크): "${query}"`,
        error instanceof Error ? error.message : undefined,
      );
      throw new MusicSourceUnavailableException();
    }

    const videoId = data.items?.[0]?.id?.videoId;
    return videoId ? { videoId } : null;
  }
}
