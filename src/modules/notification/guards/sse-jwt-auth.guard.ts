import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/strategies/jwt.strategy';

/**
 * SSE 전용 인증 가드.
 *
 * 브라우저 EventSource 는 커스텀 헤더(Authorization)를 보낼 수 없으므로,
 * 구독 엔드포인트에 한해 access token 을 쿼리 파라미터(`?token=`)로 받는다.
 * 검증 성공 시 일반 JwtStrategy 와 동일하게 request.user 에 사용자를 주입한다.
 *
 * 보안 주의: 토큰이 URL 로 전달되므로 서버 액세스 로그/프록시 로그에 남을 수 있다.
 * 이 가드는 구독 엔드포인트에만 적용하고, 그 외 API 는 기존 Bearer 헤더 방식을 유지한다.
 */
@Injectable()
export class SseJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.query?.token;

    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException(
        'SSE 구독에는 token 쿼리 파라미터가 필요합니다.',
      );
    }

    let payload: JwtPayload;
    try {
      // 알고리즘을 HS256 으로 고정해 alg-confusion(예: alg=none) 공격을 차단한다.
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      omit: { password: true },
    });
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    // CurrentUser 데코레이터가 읽는 위치에 주입(passport JwtStrategy 와 동일)
    (request as Request & { user: AuthUser }).user = user;
    return true;
  }
}
