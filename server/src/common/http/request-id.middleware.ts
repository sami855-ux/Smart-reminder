import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

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
  next();
}
