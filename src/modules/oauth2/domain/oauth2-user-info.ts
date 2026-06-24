import { OAuth2Provider } from '@prisma/client';

/**
 * provider userinfo 응답을 표준화한 도메인 모델 (원본 OAuth2UserInfo 인터페이스 이식).
 * 각 provider 클라이언트가 raw 응답을 파싱해 이 형태로 변환한다.
 */
export interface OAuth2UserInfo {
  provider: OAuth2Provider;
  /** provider 측 고유 식별자 */
  providerId: string;
  email: string | null;
  /** 표시 이름(닉네임/given_name 등) */
  name: string | null;
  profileImage: string | null;
  /** 생년월일 (없으면 null) */
  birthDate: Date | null;
  /** true: 남성, false: 여성, null: 제공 안 함 */
  gender: boolean | null;
}
