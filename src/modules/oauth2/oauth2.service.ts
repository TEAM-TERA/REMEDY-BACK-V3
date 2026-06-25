import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Provider, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import {
  GoogleOAuth2Client,
  KakaoOAuth2Client,
  NaverOAuth2Client,
} from './clients/oauth2-client';
import { OAuth2UserInfo } from './domain/oauth2-user-info';
import { OAuth2LoginResponseDto } from './dto/oauth2-login-response.dto';
import {
  OAuth2EmailConflictException,
  OAuth2InvalidUserInfoException,
} from './exceptions/oauth2.exceptions';

/** users.username VarChar(15) — provider 닉네임이 길 수 있으므로 안전하게 자른다 */
const MAX_USERNAME_LENGTH = 15;

/**
 * 소셜 로그인 처리 서비스 (원본 OAuth2AuthFacade 이식).
 * provider 클라이언트로 userinfo 를 받아 사용자 조회/생성 후 우리 서비스 JWT 를 발급한다.
 */
@Injectable()
export class OAuth2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly googleClient: GoogleOAuth2Client,
    private readonly kakaoClient: KakaoOAuth2Client,
    private readonly naverClient: NaverOAuth2Client,
  ) {}

  /** 원본 OAuth2AuthFacade.googleLogin 이식 */
  async googleLogin(accessToken: string): Promise<OAuth2LoginResponseDto> {
    const userInfo = await this.googleClient.getUserInfo(accessToken);
    return this.processOAuth2Login(userInfo);
  }

  /** 원본 OAuth2AuthFacade.kakaoLogin 이식 */
  async kakaoLogin(accessToken: string): Promise<OAuth2LoginResponseDto> {
    const userInfo = await this.kakaoClient.getUserInfo(accessToken);
    return this.processOAuth2Login(userInfo);
  }

  /** 원본 OAuth2AuthFacade.naverLogin 이식 */
  async naverLogin(accessToken: string): Promise<OAuth2LoginResponseDto> {
    const userInfo = await this.naverClient.getUserInfo(accessToken);
    return this.processOAuth2Login(userInfo);
  }

  /**
   * 원본 OAuth2AuthFacade.processOAuth2Login 이식.
   * provider+providerId 로 조회 → 없으면 email 로도 확인 → 없으면 신규 생성 → JWT 발급.
   */
  private async processOAuth2Login(
    userInfo: OAuth2UserInfo,
  ): Promise<OAuth2LoginResponseDto> {
    if (!userInfo.providerId) {
      // provider 응답에서 고유 식별자를 얻지 못함
      throw new OAuth2InvalidUserInfoException();
    }

    const user = await this.findOrCreateUser(userInfo);

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken };
  }

  /**
   * 사용자 조회/생성.
   * 1) provider+providerId 로 findFirst → 있으면 그대로 사용(계정 재방문)
   * 2) 없는데 동일 email 이 이미 존재하면:
   *    - 같은 provider 면 providerId 만 다른 동일인으로 보고 재사용
   *    - 다른 provider(LOCAL 포함)면 계정 탈취 방지를 위해 명시적 충돌 예외
   *      (provider 이메일은 검증을 보장할 수 없으므로 기존 계정에 자동 연결하지 않는다)
   * 3) 그 외 신규 생성. 동시 최초 로그인(P2002) 은 재조회로 흡수.
   */
  private async findOrCreateUser(userInfo: OAuth2UserInfo): Promise<User> {
    // providerId 는 processOAuth2Login 에서 non-null 보장됨 → 복합 unique 키로 조회
    const byProvider = await this.prisma.user.findUnique({
      where: {
        provider_providerId: {
          provider: userInfo.provider,
          providerId: userInfo.providerId,
        },
      },
    });
    if (byProvider) {
      return byProvider;
    }

    if (userInfo.email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: userInfo.email },
      });
      if (byEmail) {
        if (byEmail.provider === userInfo.provider) {
          return byEmail;
        }
        throw new OAuth2EmailConflictException();
      }
    }

    try {
      return await this.createUser(userInfo);
    } catch (error) {
      // 동시 최초 로그인으로 인한 unique 충돌 → 직전에 생성된 행을 재조회
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // (provider, providerId) 또는 email unique 충돌 모두 흡수 — 동시 생성된 행 재조회
        const created = await this.prisma.user.findUnique({
          where: {
            provider_providerId: {
              provider: userInfo.provider,
              providerId: userInfo.providerId,
            },
          },
        });
        if (created) {
          return created;
        }
        if (userInfo.email) {
          const byEmail = await this.prisma.user.findUnique({
            where: { email: userInfo.email },
          });
          if (byEmail) {
            return byEmail;
          }
        }
      }
      throw error;
    }
  }

  /** 원본 OAuth2AuthFacade.createUser + Oauth2Mapper.toUserEntity 이식 */
  private createUser(userInfo: OAuth2UserInfo): Promise<User> {
    return this.prisma.user.create({
      data: {
        username: this.resolveUsername(userInfo),
        email: this.resolveEmail(userInfo),
        // profileImage 는 스키마 default 가 있으므로 값이 있을 때만 지정
        ...(userInfo.profileImage
          ? { profileImage: userInfo.profileImage }
          : {}),
        birthDate: userInfo.birthDate,
        gender: userInfo.gender,
        provider: userInfo.provider,
        providerId: userInfo.providerId,
      },
    });
  }

  /** username 은 NOT NULL & VarChar(15) — 닉네임 없으면 provider 기반 대체값 사용 후 길이 제한 */
  private resolveUsername(userInfo: OAuth2UserInfo): string {
    const base =
      userInfo.name && userInfo.name.length > 0
        ? userInfo.name
        : this.providerLabel(userInfo.provider);
    return base.slice(0, MAX_USERNAME_LENGTH);
  }

  /** email 은 NOT NULL & unique — 미제공 시 providerId 기반 합성 이메일로 충돌 회피 */
  private resolveEmail(userInfo: OAuth2UserInfo): string {
    if (userInfo.email) {
      return userInfo.email;
    }
    const domain = userInfo.provider.toLowerCase();
    return `${userInfo.providerId}@${domain}.oauth.local`;
  }

  private providerLabel(provider: OAuth2Provider): string {
    switch (provider) {
      case OAuth2Provider.GOOGLE:
        return '구글사용자';
      case OAuth2Provider.KAKAO:
        return '카카오사용자';
      case OAuth2Provider.NAVER:
        return '네이버사용자';
      default:
        return '사용자';
    }
  }
}
