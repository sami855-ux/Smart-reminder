import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthPrincipal, AccessTokenPayload } from '../../../common/auth/auth-principal.js';
import type { Environment } from '../../../config/env.schema.js';
import { decodeBase64Pem } from '../../../config/env.schema.js';
import { PrismaService } from '../../../database/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<Environment, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: decodeBase64Pem(
        config.get('JWT_ACCESS_PUBLIC_KEY_BASE64', { infer: true }),
      ),
      algorithms: ['RS256'],
      issuer: config.get('JWT_ISSUER', { infer: true }),
      audience: config.get('JWT_AUDIENCE', { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthPrincipal> {
    if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const now = new Date();
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { id: true, userId: true },
    });

    if (!session) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return { userId: session.userId, sessionId: session.id };
  }
}
