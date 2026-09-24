import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from './auth-principal.js';

type AuthenticatedRequest = Request & { user: AuthPrincipal };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPrincipal => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  },
);
