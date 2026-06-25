import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Status } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { WithdrawnUserException } from '../../user/exceptions/user.exceptions';

export interface JwtPayload {
  /** userId */
  sub: number;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      // 서명 알고리즘을 HS256 으로 고정해 alg-confusion(예: alg=none) 공격을 차단한다.
      algorithms: ['HS256'],
    });
  }

  /**
   * 토큰 검증 후 DB에서 사용자를 로드해 request.user 에 주입한다.
   * (원본 Spring의 AuthDetailsService 와 동등 — 컨트롤러는 전체 User 를 사용)
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      omit: { password: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid token: user not found');
    }
    // 탈퇴(soft-delete) 사용자는 유효 토큰이 남아 있어도 인증을 거부한다.
    if (user.status === Status.WITHDRAWAL) {
      throw new WithdrawnUserException();
    }

    return user;
  }
}
