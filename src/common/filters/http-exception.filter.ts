import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: unknown;
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: unknown;
  } {
    // 도메인 비즈니스 예외: 안정적인 code 포함
    if (exception instanceof BusinessException) {
      const payload = exception.getResponse() as {
        code: string;
        message: unknown;
      };
      return {
        status: exception.getStatus(),
        code: payload.code,
        message: payload.message,
      };
    }

    // 일반 HttpException (ValidationPipe, NotFound 라우트 등)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as { message?: unknown }).message ?? res);
      return { status, code: this.statusToCode(status), message };
    }

    // 알 수 없는 예외
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
    };
  }

  private statusToCode(status: number): string {
    return HttpStatus[status] ?? `HTTP_${status}`;
  }
}
