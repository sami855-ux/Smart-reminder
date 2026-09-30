import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ValidationResponse = {
  code?: string;
  message?: string | string[];
  error?: string;
  details?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const normalized = this.normalizeExceptionResponse(exceptionResponse, status);

    if (status >= 500) {
      this.logger.error(
        `Unhandled request failure requestId=${request.requestId} method=${request.method} path=${request.path}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      version: 1,
      code: normalized.code,
      message: normalized.message,
      requestId: request.requestId,
      retryable: status === 429 || status >= 500,
      ...(normalized.fieldErrors ? { fieldErrors: normalized.fieldErrors } : {}),
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
    });
  }

  private normalizeExceptionResponse(
    value: string | object | undefined,
    status: number,
  ): {
    code: string;
    message: string;
    fieldErrors?: Record<string, string[]>;
    details?: unknown;
  } {
    if (typeof value === 'string') {
      return { code: this.codeForStatus(status), message: value };
    }

    const body = (value ?? {}) as ValidationResponse;
    if (Array.isArray(body.message)) {
      return {
        code: 'VALIDATION_FAILED',
        message: 'The request contains invalid fields.',
        fieldErrors: { request: body.message },
      };
    }

    return {
      code:
        typeof body.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/u.test(body.code)
          ? body.code
          : this.codeForStatus(status),
      message:
        typeof body.message === 'string'
          ? body.message
          : status >= 500
            ? 'An unexpected error occurred.'
            : 'The request could not be completed.',
      ...(body.details !== undefined ? { details: body.details } : {}),
    };
  }

  private codeForStatus(status: number): string {
    const knownCodes: Partial<Record<number, string>> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      429: 'RATE_LIMITED',
    };

    return knownCodes[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
  }
}
