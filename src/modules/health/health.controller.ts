import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness — 프로세스가 살아 있는지만 본다(외부 의존성 미확인).
   * 오케스트레이터의 재시작 판단용: 여기서 죽으면 컨테이너를 재시작한다.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '헬스 체크(liveness)' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Readiness — DB 연결까지 확인해 '요청을 받을 준비'가 됐는지 본다.
   * DB 불가 시 503 으로 응답해 로드밸런서/오케스트레이터가 트래픽을 빼도록 신호한다.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '레디니스 체크(DB 연결 포함)' })
  async readiness(): Promise<{ status: string; db: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
