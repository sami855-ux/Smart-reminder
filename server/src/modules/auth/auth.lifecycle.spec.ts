import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../database/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { AuthEmailService } from './auth-email.service.js';
import type { PasswordService } from './password.service.js';
import type { TokenService } from './token.service.js';

describe('AuthService account lifecycle', () => {
  const userId = '10000000-0000-4000-8000-000000000001';
  const tokenId = '20000000-0000-4000-8000-000000000001';

  it('atomically consumes an email-verification token', async () => {
    const tx = {
      authActionToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: tokenId,
          userId,
          type: 'EMAIL_VERIFICATION',
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
      authSecurityEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = createService(tx);

    await expect(service.verifyEmail('valid-action-token')).resolves.toBeUndefined();
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(tx.authSecurityEvent.create).toHaveBeenCalledWith({
      data: { userId, type: 'EMAIL_VERIFIED' },
    });
  });

  it('rejects an expired verification token without changing the user', async () => {
    const tx = {
      authActionToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: tokenId,
          userId,
          type: 'EMAIL_VERIFICATION',
          usedAt: null,
          expiresAt: new Date(Date.now() - 60_000),
        }),
      },
      user: { update: vi.fn() },
    };
    const service = createService(tx);

    await expect(service.verifyEmail('expired-action-token')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  function createService(tx: object): AuthService {
    const prisma = {
      $transaction: vi.fn(async (callback: (client: object) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    return new AuthService(
      prisma,
      {} as PasswordService,
      { hashActionToken: vi.fn().mockReturnValue('hashed-token') } as unknown as TokenService,
      {} as AuthEmailService,
    );
  }
});
