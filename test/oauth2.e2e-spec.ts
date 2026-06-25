import { INestApplication } from '@nestjs/common';
import { OAuth2Provider } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { GoogleOAuth2Client } from '../src/modules/oauth2/clients/oauth2-client';
import { OAuth2UserInfo } from '../src/modules/oauth2/domain/oauth2-user-info';
import { createTestApp, truncateAll } from './utils/test-app';

/**
 * OAuth2(소셜 로그인) E2E.
 *
 * Google provider 클라이언트를 목으로 override 한다.
 * 전역 설정(prefix/ValidationPipe/예외필터)은 test/utils/test-app.ts(=main.ts)와 동일하게 적용.
 *
 * 실제 네트워크 호출은 하지 않는다(provider 클라이언트가 고정 OAuth2UserInfo 반환).
 */
describe('OAuth2 E2E (google)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const api = (path: string): string => `/api/v1${path}`;

  // 목 provider 가 반환할 고정 사용자 정보
  const fakeUserInfo: OAuth2UserInfo = {
    provider: OAuth2Provider.GOOGLE,
    providerId: 'google-oauth-id-12345',
    email: 'oauth-user@example.com',
    name: '구글유저',
    profileImage: 'https://example.com/google.png',
    birthDate: null,
    gender: null,
  };

  // 호출 횟수 추적용 목 클라이언트 (재호출 시 동일 정보 반환 → 기존 user 재사용 검증)
  const googleClientMock = {
    getUserInfo: jest.fn(
      (): Promise<OAuth2UserInfo> => Promise.resolve(fakeUserInfo),
    ),
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(GoogleOAuth2Client).useValue(googleClientMock),
    );

    prisma = app.get(PrismaService);
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /oauth2/google → 200 + accessToken (신규 user 생성)', async () => {
    const res = await request(app.getHttpServer())
      .post(api('/oauth2/google'))
      .send({ accessToken: 'provider-access-token' })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(0);

    // DB 에 신규 사용자가 생성되었는지 확인
    const user = await prisma.user.findFirst({
      where: {
        provider: OAuth2Provider.GOOGLE,
        providerId: fakeUserInfo.providerId,
      },
    });
    expect(user).not.toBeNull();
    expect(user?.email).toBe(fakeUserInfo.email);
    expect(user?.username).toBe('구글유저');
    expect(user?.provider).toBe(OAuth2Provider.GOOGLE);

    const count = await prisma.user.count();
    expect(count).toBe(1);
  });

  it('POST /oauth2/google 재호출 → 200 + 기존 user 재사용 (생성 안 함)', async () => {
    const before = await prisma.user.findFirstOrThrow({
      where: {
        provider: OAuth2Provider.GOOGLE,
        providerId: fakeUserInfo.providerId,
      },
    });

    const res = await request(app.getHttpServer())
      .post(api('/oauth2/google'))
      .send({ accessToken: 'provider-access-token-2' })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');

    // 사용자 수가 늘지 않고 동일 id 재사용
    const count = await prisma.user.count();
    expect(count).toBe(1);

    const after = await prisma.user.findFirstOrThrow({
      where: {
        provider: OAuth2Provider.GOOGLE,
        providerId: fakeUserInfo.providerId,
      },
    });
    expect(after.id).toBe(before.id);

    // provider 클라이언트가 두 번 호출됨 (실제 userinfo 호출부가 목으로 동작)
    expect(googleClientMock.getUserInfo).toHaveBeenCalledTimes(2);
  });

  it('accessToken 누락 → 400 (ValidationPipe)', async () => {
    await request(app.getHttpServer())
      .post(api('/oauth2/google'))
      .send({})
      .expect(400);
  });
});
