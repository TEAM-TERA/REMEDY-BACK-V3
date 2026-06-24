import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// 각 테스트 워커 프로세스에서 .env.test 를 로드
loadEnv({ path: resolve(process.cwd(), '.env.test') });
