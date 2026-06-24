import { ApiProperty } from '@nestjs/swagger';

/**
 * 소셜 로그인 응답 (원본 OAuth2LoginResponse 이식).
 * 원본과 동일하게 우리 서비스의 JWT accessToken 만 반환한다.
 */
export class OAuth2LoginResponseDto {
  @ApiProperty({ description: '우리 서비스 JWT access token' })
  accessToken!: string;
}
