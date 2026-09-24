import { createHash } from 'node:crypto';
import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

type RateLimitRequest = Request & {
  user?: { userId?: string };
  body?: { email?: unknown; refreshToken?: unknown; token?: unknown };
};

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\./i;

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override generateKey(
    context: ExecutionContext,
    networkTracker: string,
    throttlerName: string,
  ): string {
    if (throttlerName !== 'account') {
      return super.generateKey(context, networkTracker, throttlerName);
    }

    const request = context.switchToHttp().getRequest<RateLimitRequest>();
    const rawEmail = request.body?.email;
    const opaqueToken = request.body?.refreshToken ?? request.body?.token;
    const accountIdentity =
      request.user?.userId ??
      this.accountIdFromBearer(request) ??
      (typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : undefined) ??
      (typeof opaqueToken === 'string' ? this.accountIdFromOpaqueToken(opaqueToken) : undefined) ??
      networkTracker;
    const privateAccountKey = createHash('sha256').update(accountIdentity).digest('hex');

    return super.generateKey(context, privateAccountKey, throttlerName);
  }

  private accountIdFromOpaqueToken(token: string): string | undefined {
    const match = UUID_PREFIX.exec(token);
    return match?.[0].slice(0, -1).toLowerCase();
  }

  private accountIdFromBearer(request: Request): string | undefined {
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) return undefined;
    const payloadPart = authorization.slice(7).split('.')[1];
    if (!payloadPart) return undefined;
    try {
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { sub?: unknown };
      return typeof payload.sub === 'string' ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }
}
