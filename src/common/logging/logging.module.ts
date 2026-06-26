import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { stdSerializers } from 'pino';

/**
 * 구조화 로깅(JSON) + 요청 로깅 + 상관관계 ID 를 한 곳에서 설정한다(nestjs-pino).
 *
 * - 모든 HTTP 요청을 자동으로 1줄 JSON 으로 남기고(method/url/status/응답시간),
 *   기존 `new Logger(...)` 호출도 main.ts 의 useLogger 로 이 pino 인스턴스를 거친다.
 * - 요청마다 reqId 를 부여하고 모든 로그에 엮어 한 요청의 흐름을 추적할 수 있게 한다.
 * - 민감정보 차단: Authorization/Cookie 헤더 제거, SSE 의 ?token=<JWT> 쿼리 마스킹.
 * - 헬스 프로브는 로그 노이즈가 커 자동 요청 로깅에서 제외.
 * - 개발은 pino-pretty 로 가독성, 프로덕션은 JSON 그대로(로그 수집기 친화).
 */
const HEALTH_PATHS = ['/api/v1/health', '/api/v1/health/ready'];

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const level =
          config.get<string>('LOG_LEVEL') ?? (isProd ? 'info' : 'debug');
        return {
          pinoHttp: {
            level,
            // 요청별 상관관계 ID: 들어온 x-request-id 가 있으면 재사용, 없으면 생성.
            // 응답 헤더로도 돌려줘 클라이언트/프록시 로그와 엮을 수 있게 한다.
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const incoming = req.headers['x-request-id'];
              const id =
                (Array.isArray(incoming) ? incoming[0] : incoming) ??
                randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            // 민감정보 차단: Authorization/Cookie 헤더는 통째로 제거.
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie'],
              remove: true,
            },
            serializers: {
              // SSE 구독은 ?token=<JWT> 쿼리로 인증한다 → URL 에서 토큰 마스킹(로그 유출 방지).
              req(req: IncomingMessage) {
                const serialized = stdSerializers.req(req);
                if (typeof serialized.url === 'string') {
                  serialized.url = serialized.url.replace(
                    /([?&]token=)[^&]*/i,
                    '$1[REDACTED]',
                  );
                }
                return serialized;
              },
            },
            // 헬스 프로브(주기적 호출)는 자동 요청 로깅에서 제외해 노이즈를 줄인다.
            autoLogging: {
              ignore: (req: IncomingMessage) =>
                HEALTH_PATHS.includes((req.url ?? '').split('?')[0]),
            },
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
          },
        };
      },
    }),
  ],
})
export class LoggingModule {}
