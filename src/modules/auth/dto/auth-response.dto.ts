import { ApiProperty } from '@nestjs/swagger';

/** 로그인 응답 — 관용적 재설계: 토큰을 응답 body로 반환 */
export class LoginResponse {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;
}
