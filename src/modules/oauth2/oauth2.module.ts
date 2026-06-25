import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { OAuth2Controller } from './oauth2.controller';
import { OAuth2Service } from './oauth2.service';
import {
  GoogleOAuth2Client,
  KakaoOAuth2Client,
  NaverOAuth2Client,
} from './clients/oauth2-client';
import { GoogleOAuth2ClientImpl } from './clients/google-oauth2.client';
import { KakaoOAuth2ClientImpl } from './clients/kakao-oauth2.client';
import { NaverOAuth2ClientImpl } from './clients/naver-oauth2.client';

/**
 * OAuth2(소셜 로그인) 모듈.
 * - AuthModule 을 import 해 JwtService(JwtModule export) 사용.
 * - HttpModule 로 provider userinfo API 호출(HttpService) 주입.
 * - provider 클라이언트는 추상 토큰(GoogleOAuth2Client 등)에 구현체를 바인딩 →
 *   E2E 에서 .overrideProvider(GoogleOAuth2Client) 로 가짜 구현 주입 가능.
 */
@Module({
  // provider userinfo 호출에 타임아웃(3s)·리다이렉트 차단(SSRF 보조 방어) 적용
  imports: [
    AuthModule,
    HttpModule.register({ timeout: 3000, maxRedirects: 0 }),
  ],
  controllers: [OAuth2Controller],
  providers: [
    OAuth2Service,
    { provide: GoogleOAuth2Client, useClass: GoogleOAuth2ClientImpl },
    { provide: KakaoOAuth2Client, useClass: KakaoOAuth2ClientImpl },
    { provide: NaverOAuth2Client, useClass: NaverOAuth2ClientImpl },
  ],
  exports: [OAuth2Service],
})
export class OAuth2Module {}
