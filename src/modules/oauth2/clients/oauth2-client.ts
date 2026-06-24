import { OAuth2UserInfo } from '../domain/oauth2-user-info';

/**
 * provider별 userinfo 호출 추상화.
 * - 구현체(Google/Kakao/Naver)는 provider accessToken 으로 실제 userinfo API 를 호출하고
 *   응답을 표준 OAuth2UserInfo 로 변환한다.
 * - 추상 클래스를 DI 토큰으로 사용하므로 E2E 에서 overrideProvider 로 가짜 구현 주입이 가능하다.
 */
export abstract class OAuth2Client {
  abstract getUserInfo(accessToken: string): Promise<OAuth2UserInfo>;
}

/** Google userinfo 클라이언트 토큰 */
export abstract class GoogleOAuth2Client extends OAuth2Client {}

/** Kakao userinfo 클라이언트 토큰 */
export abstract class KakaoOAuth2Client extends OAuth2Client {}

/** Naver userinfo 클라이언트 토큰 */
export abstract class NaverOAuth2Client extends OAuth2Client {}
