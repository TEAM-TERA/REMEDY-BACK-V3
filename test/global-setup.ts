import { execSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

/**
 * E2E 글로벌 셋업: 테스트 DB(.env.test)에 마이그레이션을 적용한다.
 * 사전 조건: `docker compose up -d db-test` (PostGIS, pg_trgm 포함 이미지)
 */
export default function globalSetup(): void {
  loadEnv({ path: resolve(process.cwd(), '.env.test') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL (.env.test) is not set');
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
