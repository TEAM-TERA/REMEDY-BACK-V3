import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import type { User } from '@prisma/client';

/** 인증된 사용자(비밀번호 제외). JwtStrategy.validate 가 주입한다. */
export type AuthUser = Omit<User, 'password'>;

/**
 * 컨트롤러에서 현재 인증된 사용자를 주입받는 데코레이터.
 * 원본 Spring의 @AuthenticationPrincipal AuthDetails 와 동등.
 * 사용: `me(@CurrentUser() user: AuthUser)`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthUser;
  },
);
