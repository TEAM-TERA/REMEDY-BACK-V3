import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * 환경 변수 스키마.
 * 필수: DATABASE_URL, JWT_SECRET
 * 선택(미설정 시 해당 기능 호출 시점에 검증): AWS S3, OAuth2 provider 자격증명
 */
class EnvironmentVariables {
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters long' })
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN: string = '1d';

  @IsInt()
  PORT: number = 3000;

  // ── AWS S3 (프로필/앨범 이미지 업로드) ──
  @IsOptional()
  @IsString()
  AWS_S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  AWS_S3_REGION?: string;

  @IsOptional()
  @IsString()
  AWS_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  AWS_SECRET_KEY?: string;

  // ── OAuth2 (google/kakao/naver) ──
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  KAKAO_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  KAKAO_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  NAVER_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  NAVER_CLIENT_SECRET?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
