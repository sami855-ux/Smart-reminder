import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SLOW_REQUEST_MS = 750;
const performanceLogger = new Logger('HttpPerformance');

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.header('x-request-id');
  const requestId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  const startedAt = process.hrtime.bigint();
  response.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const measurement = JSON.stringify({
      requestId,
      method: request.method,
      path: request.originalUrl.split('?')[0],
      statusCode: response.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
    });
    if (durationMs >= SLOW_REQUEST_MS) {
      performanceLogger.warn(measurement);
    } else {
      performanceLogger.debug(measurement);
    }
  });
  next();
}
