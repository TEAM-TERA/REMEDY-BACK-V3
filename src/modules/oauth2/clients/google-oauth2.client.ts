import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OAuth2Provider } from '@prisma/client';
import { GoogleOAuth2Client } from './oauth2-client';
import { OAuth2UserInfo } from '../domain/oauth2-user-info';
import { OAuth2ProviderRequestFailedException } from '../exceptions/oauth2.exceptions';

/**
 * Google userinfo 클라이언트 (원본 GoogleAuthClient/GoogleAuthService + GoogleOAuth2UserInfo 이식).
 * - 엔드포인트: https://oauth2.googleapis.com/oauth2/v2/userinfo (원본 Feign 설정 그대로)
 * - Authorization: Bearer {accessToken}
 */
@Injectable()
export class GoogleOAuth2ClientImpl extends GoogleOAuth2Client {
  // 원본 GoogleAuthClient 의 url + path 그대로 사용
  private static readonly USER_INFO_URL =
    'https://oauth2.googleapis.com/oauth2/v2/userinfo';

  constructor(private readonly http: HttpService) {
    super();
  }

  async getUserInfo(accessToken: string): Promise<OAuth2UserInfo> {
    const attributes = await this.fetch(accessToken);

    // 원본 GoogleOAuth2UserInfo 파싱 규칙 이식
    // given_name(이름)을 우선 사용, 없으면 name(전체 이름) 사용
    const givenName = this.asString(attributes['given_name']);
    const name = givenName ?? this.asString(attributes['name']);

    return {
      provider: OAuth2Provider.GOOGLE,
      // 원본은 providerId 로 "sub" 를 읽는다 (OIDC userinfo 기준)
      providerId: this.asString(attributes['sub']) ?? '',
      email: this.asString(attributes['email']),
      name,
      profileImage: this.asString(attributes['picture']),
      // Google 은 기본 profile scope 에서 생년월일/성별을 제공하지 않음
      birthDate: null,
      gender: null,
    };
  }

  /** provider userinfo API 호출 (네트워크 실패/토큰 무효 → 도메인 예외) */
  private async fetch(accessToken: string): Promise<Record<string, unknown>> {
    try {
      const res = await firstValueFrom(
        this.http.get<Record<string, unknown>>(
          GoogleOAuth2ClientImpl.USER_INFO_URL,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      return res.data;
    } catch {
      throw new OAuth2ProviderRequestFailedException();
    }
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
