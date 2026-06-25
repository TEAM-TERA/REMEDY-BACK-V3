import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OAuth2Service } from './oauth2.service';
import { OAuth2AuthRequestDto } from './dto/oauth2-auth-request.dto';
import { OAuth2LoginResponse } from './dto/oauth2-login-response.dto';

/**
 * 소셜 로그인 컨트롤러 (원본 OAuth2AuthController 이식).
 * base path 'oauth2' (글로벌 prefix /api/v1 자동 적용) → /api/v1/oauth2/{provider}
 */
@ApiTags('oauth2')
@Controller('oauth2')
export class OAuth2Controller {
  constructor(private readonly oauth2Service: OAuth2Service) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google 소셜 로그인 (JWT access token 발급)' })
  @ApiOkResponse({ type: OAuth2LoginResponse })
  googleLogin(@Body() dto: OAuth2AuthRequestDto): Promise<OAuth2LoginResponse> {
    return this.oauth2Service.googleLogin(dto.accessToken);
  }

  @Post('kakao')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kakao 소셜 로그인 (JWT access token 발급)' })
  @ApiOkResponse({ type: OAuth2LoginResponse })
  kakaoLogin(@Body() dto: OAuth2AuthRequestDto): Promise<OAuth2LoginResponse> {
    return this.oauth2Service.kakaoLogin(dto.accessToken);
  }

  @Post('naver')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Naver 소셜 로그인 (JWT access token 발급)' })
  @ApiOkResponse({ type: OAuth2LoginResponse })
  naverLogin(@Body() dto: OAuth2AuthRequestDto): Promise<OAuth2LoginResponse> {
    return this.oauth2Service.naverLogin(dto.accessToken);
  }
}
