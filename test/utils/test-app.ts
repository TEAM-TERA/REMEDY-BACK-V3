import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * main.ts 와 동일한 전역 설정(prefix, ValidationPipe, 예외필터)으로 테스트 앱을 부팅한다.
 * customize 콜백으로 provider override(예: 외부 음원 소스 mock 주입)를 적용할 수 있다.
 */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (customize ? customize(builder) : builder).compile();

  const app = moduleRef.createNestApplication();
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

  await app.init();
  return app;
}

/**
 * 사용자 객체로 회원가입(201) 후 로그인(200)하여 accessToken 을 반환한다.
 * 경로는 전역 prefix(`/api/v1`)를 포함한다.
 */
export async function registerAndLogin(
  app: INestApplication,
  user: { email: string; password: string; [key: string]: unknown },
): Promise<string> {
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(user)
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);
  return login.body.accessToken as string;
}

/** 모든 테이블 데이터 초기화 (FK 안전하게 TRUNCATE ... CASCADE) */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "notifications","likes","comments","droppings","playlists","songs","users" RESTART IDENTITY CASCADE;',
  );
}
