import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  // bufferLogs: 부팅 초기 로그도 pino 로 흘려보내기 위해 버퍼링 후 useLogger 로 전환.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // SIGTERM/SIGINT 시 onModuleDestroy 훅을 호출해 DB 연결·SSE 스트림을 정리하고
  // 진행 중 요청을 마무리한 뒤 종료한다(배포/재시작 시 무중단 종료).
  app.enableShutdownHooks();

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const configService = app.get(ConfigService);

  // CORS_ORIGINS(쉼표 구분)가 설정되면 화이트리스트, 미설정(로컬/개발)이면 전체 허용
  const corsOrigins = configService.get<string>('CORS_ORIGINS');
  app.enableCors({
    origin: corsOrigins ? corsOrigins.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Remedy API')
    .setDescription('Remedy backend service API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // ConfigService 는 원본 process.env 문자열을 반환하므로 명시적으로 숫자 변환
  const port = Number(configService.get('PORT')) || 3000;

  await app.listen(port);
}

void bootstrap();
