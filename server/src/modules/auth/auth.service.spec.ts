import { UnauthorizedException } from '@nestjs/common';
import type { User } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import type { TokenService } from './token.service.js';
import type { AuthEmailService } from './auth-email.service.js';

describe('AuthService refresh rotation', () => {
  const now = new Date('2026-09-24T18:00:00.000Z');
  const expiresAt = new Date('2026-10-24T18:00:00.000Z');
  const user: User = {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'user@example.com',
    passwordHash: 'not-used',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletionRequestedAt: null,
    purgeAfter: null,
  };

  function setup(usedAt: Date | null) {
    const tx = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: '30000000-0000-4000-8000-000000000001',
          usedAt,
          revokedAt: null,
          expiresAt,
          session: {
            id: '20000000-0000-4000-8000-000000000001',
            userId: user.id,
            expiresAt,
            revokedAt: null,
            user,
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({
          id: '30000000-0000-4000-8000-000000000002',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      authSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      authSecurityEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const tokens = {
      createRefreshToken: vi.fn().mockReturnValue({
        plainText: 'new-refresh-token',
        hash: 'new-refresh-token-hash',
      }),
      refreshTokenExpiresAt: vi.fn().mockReturnValue(expiresAt),
      hashRefreshToken: vi.fn().mockReturnValue('old-refresh-token-hash'),
      signAccessToken: vi.fn().mockResolvedValue('signed-access-token'),
      accessTokenExpiresInSeconds: vi.fn().mockReturnValue(900),
    } as unknown as TokenService;
    const service = new AuthService(
      prisma,
      {} as PasswordService,
      tokens,
      {} as AuthEmailService,
    );

    return { service, tokens, tx };
  }

  it('atomically consumes the current refresh token and issues its replacement', async () => {
    const { service, tx } = setup(null);

    const response = await service.refresh('old-refresh-token', {});

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: '30000000-0000-4000-8000-000000000001',
        usedAt: null,
        revokedAt: null,
      },
      data: { usedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        sessionId: '20000000-0000-4000-8000-000000000001',
        tokenHash: 'new-refresh-token-hash',
        expiresAt,
      },
    });
    expect(response).toMatchObject({
      accessToken: 'signed-access-token',
      refreshToken: 'new-refresh-token',
      accessTokenExpiresInSeconds: 900,
      user: { id: user.id, email: user.email },
    });
  });

  it('revokes the complete session family when a consumed token is replayed', async () => {
    const { service, tx } = setup(now);

    await expect(service.refresh('replayed-refresh-token', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: '20000000-0000-4000-8000-000000000001',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
        revocationReason: 'TOKEN_REUSE',
      },
    });
    expect(tx.authSecurityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'TOKEN_REUSE_DETECTED' }),
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });
});
