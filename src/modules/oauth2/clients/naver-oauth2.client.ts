import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OAuth2Provider } from '@prisma/client';
import { NaverOAuth2Client } from './oauth2-client';
import { OAuth2UserInfo } from '../domain/oauth2-user-info';
import { OAuth2ProviderRequestFailedException } from '../exceptions/oauth2.exceptions';
import { asObject, asString, parseBirthDate } from './oauth2-parse.util';

/**
 * Naver userinfo 클라이언트 (원본 NaverAuthClient/NaverAuthService + NaverOAuth2UserInfo 이식).
 * - 엔드포인트: https://openapi.naver.com/v2/nid/me (원본 Feign 설정 그대로)
 * - 헤더: Authorization: Bearer {accessToken}, Content-Type: application/x-www-form-urlencoded
 * - 실제 사용자 정보는 응답의 "response" 객체 안에 존재한다.
 */
@Injectable()
export class NaverOAuth2ClientImpl extends NaverOAuth2Client {
  private static readonly USER_INFO_URL = 'https://openapi.naver.com/v2/nid/me';

  constructor(private readonly http: HttpService) {
    super();
  }

  async getUserInfo(accessToken: string): Promise<OAuth2UserInfo> {
    const attributes = await this.fetch(accessToken);
    const response = asObject(attributes['response']);

    return {
      provider: OAuth2Provider.NAVER,
      providerId: asString(response?.['id']) ?? '',
      email: asString(response?.['email']),
      name: asString(response?.['nickname']),
      profileImage: asString(response?.['profile_image']),
      birthDate: this.parseBirthDate(response),
      gender: this.parseGender(response),
    };
  }

  private async fetch(accessToken: string): Promise<Record<string, unknown>> {
    try {
      const res = await firstValueFrom(
        this.http.get<Record<string, unknown>>(
          NaverOAuth2ClientImpl.USER_INFO_URL,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );
      return res.data;
    } catch {
      throw new OAuth2ProviderRequestFailedException();
    }
  }

  /**
   * 생년월일 파싱 (원본 NaverOAuth2UserInfo.getBirthDate 이식).
   * response.birthday: MM-DD, response.birthyear: YYYY
   */
  private parseBirthDate(
    response: Record<string, unknown> | null,
  ): Date | null {
    if (!response) {
      return null;
    }
    // naver birthday 포맷은 MM-DD(5자리) — 공통 코어에 추출 규칙만 주입한다.
    return parseBirthDate(
      response['birthday'],
      response['birthyear'],
      (birthday) => {
        if (birthday.length !== 5) {
          return null;
        }
        const parts = birthday.split('-');
        if (parts.length !== 2) {
          return null;
        }
        return { month: parts[0], day: parts[1] };
      },
    );
  }

  /**
   * 성별 파싱 (원본 NaverOAuth2UserInfo.getGender 이식).
   * response.gender: "M" | "F" → true: 남성
   */
  private parseGender(
    response: Record<string, unknown> | null,
  ): boolean | null {
    if (!response) {
      return null;
    }
    const gender = asString(response['gender']);
    if (gender === null) {
      return null;
    }
    return gender.toUpperCase() === 'M';
  }
}
