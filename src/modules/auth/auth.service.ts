import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Provider, Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { LoginResponseDto } from './dto/auth-response.dto';
import type { JwtPayload } from './strategies/jwt.strategy';
import {
  EmailAlreadyExistsWithOAuth2Exception,
  InvalidPasswordException,
  OAuth2UserCannotUsePasswordLoginException,
  UserAlreadyExistsException,
} from './exceptions/auth.exceptions';
import { UserNotFoundException } from '../user/exceptions/user.exceptions';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** 로컬 회원가입 (원본 AuthService.signup 이식) */
  async signup(dto: SignupDto): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      if (existing.provider !== OAuth2Provider.LOCAL) {
        throw new EmailAlreadyExistsWithOAuth2Exception();
      }
      throw new UserAlreadyExistsException();
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    await this.prisma.user.create({
      data: {
        username: dto.username,
        password: passwordHash,
        email: dto.email,
        birthDate: dto.birthDate,
        gender: dto.gender,
        provider: OAuth2Provider.LOCAL,
      },
    });
  }

  /** 로컬 로그인 (원본 AuthService.login 이식 — 토큰을 body로 반환) */
  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UserNotFoundException();
    }

    if (user.provider !== OAuth2Provider.LOCAL) {
      throw new OAuth2UserCannotUsePasswordLoginException();
    }

    const passwordMatches =
      user.password !== null &&
      (await bcrypt.compare(dto.password, user.password));
    if (!passwordMatches) {
      throw new InvalidPasswordException();
    }

    // 탈퇴 상태면 재활성화 후 로그인 허용 (원본 동작)
    if (user.status === Status.WITHDRAWAL) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: Status.JOIN, withdrawalDate: null },
      });
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken };
  }
}
