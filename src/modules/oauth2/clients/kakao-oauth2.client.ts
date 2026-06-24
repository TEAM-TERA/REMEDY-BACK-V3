import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OAuth2Provider } from '@prisma/client';
import { KakaoOAuth2Client } from './oauth2-client';
import { OAuth2UserInfo } from '../domain/oauth2-user-info';
import { OAuth2ProviderRequestFailedException } from '../exceptions/oauth2.exceptions';

/**
 * Kakao userinfo 클라이언트 (원본 KakaoAuthClient/KakaoAuthService + KakaoOAuth2UserInfo 이식).
 * - 엔드포인트: https://kapi.kakao.com/v2/user/me (원본 Feign 설정 그대로)
 * - 헤더: Authorization: Bearer {accessToken}, Content-Type: application/x-www-form-urlencoded
 */
@Injectable()
export class KakaoOAuth2ClientImpl extends KakaoOAuth2Client {
  private static readonly USER_INFO_URL = 'https://kapi.kakao.com/v2/user/me';

  constructor(private readonly http: HttpService) {
    super();
  }

  async getUserInfo(accessToken: string): Promise<OAuth2UserInfo> {
    const attributes = await this.fetch(accessToken);

    const kakaoAccount = this.asObject(attributes['kakao_account']);
    const properties = this.asObject(attributes['properties']);

    return {
      provider: OAuth2Provider.KAKAO,
      // 원본: String.valueOf(attributes.get("id"))
      providerId: this.toIdString(attributes['id']),
      email: this.asString(kakaoAccount?.['email']),
      name: this.asString(properties?.['nickname']),
      profileImage: this.asString(properties?.['profile_image']),
      birthDate: this.parseBirthDate(kakaoAccount),
      gender: this.parseGender(kakaoAccount),
    };
  }

  private async fetch(accessToken: string): Promise<Record<string, unknown>> {
    try {
      const res = await firstValueFrom(
        this.http.get<Record<string, unknown>>(
          KakaoOAuth2ClientImpl.USER_INFO_URL,
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
   * 생년월일 파싱 (원본 KakaoOAuth2UserInfo.getBirthDate 이식).
   * kakao_account.birthday: MMDD, kakao_account.birthyear: YYYY
   */
  private parseBirthDate(
    kakaoAccount: Record<string, unknown> | null,
  ): Date | null {
    if (!kakaoAccount) {
      return null;
    }
    const birthday = this.asString(kakaoAccount['birthday']); // MMDD
    const birthyear = this.asString(kakaoAccount['birthyear']); // YYYY
    if (
      birthday !== null &&
      birthyear !== null &&
      birthday.length === 4 &&
      birthyear.length === 4
    ) {
      const year = Number.parseInt(birthyear, 10);
      const month = Number.parseInt(birthday.substring(0, 2), 10);
      const day = Number.parseInt(birthday.substring(2, 4), 10);
      if (
        Number.isInteger(year) &&
        Number.isInteger(month) &&
        Number.isInteger(day)
      ) {
        // UTC 자정으로 생성 (Prisma @db.Date 매핑)
        return new Date(Date.UTC(year, month - 1, day));
      }
    }
    return null;
  }

  /**
   * 성별 파싱 (원본 KakaoOAuth2UserInfo.getGender 이식).
   * kakao_account.gender: "male" | "female" → true: 남성
   */
  private parseGender(
    kakaoAccount: Record<string, unknown> | null,
  ): boolean | null {
    if (!kakaoAccount) {
      return null;
    }
    const gender = this.asString(kakaoAccount['gender']);
    if (gender === null) {
      return null;
    }
    return gender.toLowerCase() === 'male';
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private toIdString(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    if (typeof value === 'string') {
      return value;
    }
    return '';
  }
}
