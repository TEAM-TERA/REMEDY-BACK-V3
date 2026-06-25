import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OAuth2Provider } from '@prisma/client';
import { KakaoOAuth2Client } from './oauth2-client';
import { OAuth2UserInfo } from '../domain/oauth2-user-info';
import { OAuth2ProviderRequestFailedException } from '../exceptions/oauth2.exceptions';
import { asObject, asString, parseBirthDate } from './oauth2-parse.util';

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

    const kakaoAccount = asObject(attributes['kakao_account']);
    const properties = asObject(attributes['properties']);

    return {
      provider: OAuth2Provider.KAKAO,
      // 원본: String.valueOf(attributes.get("id"))
      providerId: this.toIdString(attributes['id']),
      email: asString(kakaoAccount?.['email']),
      name: asString(properties?.['nickname']),
      profileImage: asString(properties?.['profile_image']),
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
    // kakao birthday 포맷은 MMDD(4자리) — 공통 코어에 추출 규칙만 주입한다.
    return parseBirthDate(
      kakaoAccount['birthday'],
      kakaoAccount['birthyear'],
      (birthday) =>
        birthday.length === 4
          ? {
              month: birthday.substring(0, 2),
              day: birthday.substring(2, 4),
            }
          : null,
    );
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
    const gender = asString(kakaoAccount['gender']);
    if (gender === null) {
      return null;
    }
    return gender.toLowerCase() === 'male';
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
