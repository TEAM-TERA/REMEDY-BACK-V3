import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 소셜 로그인 요청 DTO (원본 GoogleAuthRequest/KakaoAuthRequest/NaverAuthRequest 이식).
 * 세 provider 모두 동일하게 클라이언트 SDK 에서 받은 provider accessToken 만 전달한다.
 */
export class OAuth2AuthRequestDto {
  @ApiProperty({
    description: 'provider(SDK)에서 발급받은 access token',
    example: 'ya29.a0Af...',
  })
  @IsString()
  @IsNotEmpty({ message: 'accessToken을 입력해주세요.' })
  accessToken!: string;
}
