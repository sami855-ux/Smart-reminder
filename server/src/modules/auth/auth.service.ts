import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma, User } from '../../generated/prisma/client.js';
import type { AuthPrincipal } from '../../common/auth/auth-principal.js';
import type { RequestMetadata } from '../../common/security/request-metadata.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { AuthEmailService } from './auth-email.service.js';

type SessionBundle = {
  user: User;
  sessionId: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

type RefreshOutcome =
  | { status: 'ok'; bundle: SessionBundle }
  | { status: 'invalid' }
  | { status: 'reuse' };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly email: AuthEmailService,
  ) {}

  async register(dto: RegisterDto, metadata: RequestMetadata): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(dto.email);
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, passwordHash },
        });
        const session = await this.createSession(tx, user, dto.deviceName, metadata);
        await tx.authSecurityEvent.create({
          data: {
            userId: user.id,
            sessionId: session.sessionId,
            type: 'REGISTERED',
            ...metadata,
          },
        });
        const verification = this.tokens.createActionToken(user.id);
        await tx.authActionToken.create({
          data: {
            userId: user.id,
            type: 'EMAIL_VERIFICATION',
            tokenHash: verification.hash,
            expiresAt: this.tokens.emailVerificationExpiresAt(),
          },
        });
        return { session, verificationToken: verification.plainText };
      });
      try {
        await this.email.sendVerification(email, result.verificationToken);
      } catch {
        // Account creation remains successful; the authenticated resend endpoint can retry delivery.
      }
      return this.toAuthResponse(result.session);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('An account cannot be created with these details.');
      }
      throw error;
    }
  }

  async requestEmailVerification(principal: AuthPrincipal): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, status: 'ACTIVE', deletedAt: null },
    });
    if (!user || user.emailVerifiedAt) return;

    const token = this.tokens.createActionToken(user.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.authActionToken.updateMany({
        where: { userId: user.id, type: 'EMAIL_VERIFICATION', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.authActionToken.create({
        data: {
          userId: user.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: token.hash,
          expiresAt: this.tokens.emailVerificationExpiresAt(),
        },
      });
      await tx.authSecurityEvent.create({
        data: { userId: user.id, sessionId: principal.sessionId, type: 'EMAIL_VERIFICATION_REQUESTED' },
      });
    });
    await this.email.sendVerification(user.email, token.plainText);
  }

  async verifyEmail(token: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.authActionToken.findUnique({
        where: { tokenHash: this.tokens.hashActionToken(token) },
      });
      if (!stored || stored.type !== 'EMAIL_VERIFICATION' || stored.usedAt || stored.expiresAt <= now) {
        return false;
      }
      const updated = await tx.authActionToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (updated.count !== 1) return false;
      await tx.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: now } });
      await tx.authActionToken.updateMany({
        where: { userId: stored.userId, type: 'EMAIL_VERIFICATION', usedAt: null },
        data: { usedAt: now },
      });
      await tx.authSecurityEvent.create({ data: { userId: stored.userId, type: 'EMAIL_VERIFIED' } });
      return true;
    });
    if (!claimed) throw new BadRequestException('The verification token is invalid or expired.');
  }

  async requestPasswordReset(emailInput: string, metadata: RequestMetadata): Promise<void> {
    const email = this.normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifiedAt || user.status !== 'ACTIVE' || user.deletedAt) {
      await this.passwords.consumeEquivalentWork('password-reset-equivalent-work');
      return;
    }

    const token = this.tokens.createActionToken(user.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.authActionToken.updateMany({
        where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.authActionToken.create({
        data: {
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: token.hash,
          expiresAt: this.tokens.passwordResetExpiresAt(),
        },
      });
      await tx.authSecurityEvent.create({
        data: { userId: user.id, type: 'PASSWORD_RESET_REQUESTED', ...metadata },
      });
    });
    try {
      await this.email.sendPasswordReset(user.email, token.plainText);
    } catch {
      // Preserve the same response for known and unknown addresses.
    }
  }

  async completePasswordReset(token: string, newPassword: string, metadata: RequestMetadata): Promise<void> {
    const now = new Date();
    const passwordHash = await this.passwords.hash(newPassword);
    const completed = await this.prisma.$transaction(async (tx) => {
      const stored = await tx.authActionToken.findUnique({
        where: { tokenHash: this.tokens.hashActionToken(token) },
        include: { user: true },
      });
      if (!stored || stored.type !== 'PASSWORD_RESET' || stored.usedAt || stored.expiresAt <= now ||
          !stored.user.emailVerifiedAt || stored.user.status !== 'ACTIVE' || stored.user.deletedAt) return false;
      const claimed = await tx.authActionToken.updateMany({
        where: { id: stored.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: stored.userId }, data: { passwordHash } });
      const sessions = await tx.authSession.findMany({ where: { userId: stored.userId }, select: { id: true } });
      const sessionIds = sessions.map(({ id }) => id);
      await tx.authSession.updateMany({
        where: { id: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'PASSWORD_CHANGED' },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null }, data: { revokedAt: now },
      });
      await tx.authActionToken.updateMany({
        where: { userId: stored.userId, type: 'PASSWORD_RESET', usedAt: null }, data: { usedAt: now },
      });
      await tx.authSecurityEvent.create({
        data: { userId: stored.userId, type: 'PASSWORD_RESET_COMPLETED', ...metadata },
      });
      return true;
    });
    if (!completed) throw new BadRequestException('The password reset token is invalid or expired.');
  }

  async exportData(principal: AuthPrincipal): Promise<Record<string, unknown>> {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('Authentication is required.');
    const reminders = await this.prisma.reminder.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        schedules: { orderBy: { revision: 'asc' } },
        occurrences: { orderBy: { originalScheduledAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    await this.prisma.authSecurityEvent.create({
      data: { userId: user.id, sessionId: principal.sessionId, type: 'DATA_EXPORTED' },
    });
    return {
      format: 'smart-reminder-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      reminders: reminders.map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        contextNote: reminder.contextNote,
        lifecycle: reminder.lifecycle,
        revision: reminder.revision,
        createdAt: reminder.createdAt.toISOString(),
        updatedAt: reminder.updatedAt.toISOString(),
        deletedAt: reminder.deletedAt?.toISOString() ?? null,
        schedules: reminder.schedules.map((schedule) => ({
          id: schedule.id,
          type: schedule.type,
          localStartDate: schedule.localStartDate.trim(),
          localStartTime: schedule.localStartTime.trim(),
          timezone: schedule.timezone,
          recurrenceWeekdays: schedule.recurrenceWeekdays,
          endLocalDate: schedule.endLocalDate?.trim() ?? null,
          occurrenceCount: schedule.occurrenceCount,
          resolvedStartAt: schedule.resolvedStartAt.toISOString(),
          utcOffsetMinutes: schedule.resolvedUtcOffsetMin,
          revision: schedule.revision,
          materializedThrough: schedule.materializedThrough.toISOString(),
        })),
        occurrences: reminder.occurrences.map((occurrence) => ({
          id: occurrence.id,
          scheduleId: occurrence.scheduleId,
          scheduleRevision: occurrence.scheduleRevision,
          sequence: occurrence.sequence,
          lifecycle: occurrence.lifecycle,
          localDate: occurrence.localDate.trim(),
          localTime: occurrence.localTime.trim(),
          originalScheduledAt: occurrence.originalScheduledAt.toISOString(),
          effectiveScheduledAt: occurrence.effectiveScheduledAt.toISOString(),
        })),
        events: reminder.events.map((event) => ({
          id: event.id,
          occurrenceId: event.occurrenceId,
          actorType: event.actorType,
          type: event.type,
          metadata: event.metadata,
          createdAt: event.createdAt.toISOString(),
        })),
      })),
    };
  }

  async deleteAccount(principal: AuthPrincipal, password: string, metadata: RequestMetadata): Promise<Date> {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, status: 'ACTIVE', deletedAt: null },
    });
    if (!user || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Authentication could not be confirmed.');
    }
    const now = new Date();
    const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { status: 'DELETION_PENDING', deletedAt: now, deletionRequestedAt: now, purgeAfter },
      });
      const sessions = await tx.authSession.findMany({ where: { userId: user.id }, select: { id: true } });
      const sessionIds = sessions.map(({ id }) => id);
      await tx.authSession.updateMany({
        where: { id: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'ACCOUNT_DISABLED' },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null }, data: { revokedAt: now },
      });
      await tx.authActionToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.schedule.updateMany({
        where: { reminder: { userId: user.id } },
        data: { nextEvaluationAt: null },
      });
      await tx.reminderOccurrence.updateMany({
        where: { reminder: { userId: user.id }, lifecycle: 'SCHEDULED' },
        data: { lifecycle: 'CANCELLED', cancelledAt: now },
      });
      await tx.reminder.updateMany({
        where: { userId: user.id, lifecycle: 'ACTIVE' },
        data: { lifecycle: 'CANCELLED', deletedAt: now },
      });
      await tx.authSecurityEvent.create({
        data: { userId: user.id, sessionId: principal.sessionId, type: 'ACCOUNT_DELETION_REQUESTED', ...metadata },
      });
    });
    return purgeAfter;
  }

  async login(dto: LoginDto, metadata: RequestMetadata): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    const passwordMatches = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : (await this.passwords.consumeEquivalentWork(dto.password), false);

    if (!user || !passwordMatches || user.status !== 'ACTIVE' || user.deletedAt) {
      await this.prisma.authSecurityEvent.create({
        data: {
          type: 'LOGIN_FAILED',
          ...(user ? { userId: user.id } : {}),
          ...metadata,
        },
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const bundle = await this.prisma.$transaction(async (tx) => {
      const session = await this.createSession(tx, user, dto.deviceName, metadata);
      await tx.authSecurityEvent.create({
        data: {
          userId: user.id,
          sessionId: session.sessionId,
          type: 'LOGIN_SUCCEEDED',
          ...metadata,
        },
      });
      return session;
    });

    return this.toAuthResponse(bundle);
  }

  async refresh(refreshToken: string, metadata: RequestMetadata): Promise<AuthResponseDto> {
    const now = new Date();
    const nextExpiresAt = this.tokens.refreshTokenExpiresAt(now);
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);

    const outcome = await this.prisma.$transaction<RefreshOutcome>(async (tx) => {
      const stored = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { session: { include: { user: true } } },
      });

      if (!stored) {
        return { status: 'invalid' };
      }

      const session = stored.session;
      const tokenWasUsed = stored.usedAt !== null || stored.revokedAt !== null;
      if (tokenWasUsed) {
        await this.revokeSessionFamily(tx, session.id, 'TOKEN_REUSE', now);
        await tx.authSecurityEvent.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            type: 'TOKEN_REUSE_DETECTED',
            ...metadata,
          },
        });
        return { status: 'reuse' };
      }

      if (
        stored.expiresAt <= now ||
        session.expiresAt <= now ||
        session.revokedAt !== null ||
        session.user.status !== 'ACTIVE' ||
        session.user.deletedAt !== null
      ) {
        const reason =
          session.user.status === 'ACTIVE' && session.user.deletedAt === null
            ? 'EXPIRED'
            : 'ACCOUNT_DISABLED';
        await this.revokeSessionFamily(tx, session.id, reason, now);
        return { status: 'invalid' };
      }

      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, usedAt: null, revokedAt: null },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) {
        await this.revokeSessionFamily(tx, session.id, 'TOKEN_REUSE', now);
        await tx.authSecurityEvent.create({
          data: {
            userId: session.userId,
            sessionId: session.id,
            type: 'TOKEN_REUSE_DETECTED',
            ...metadata,
          },
        });
        return { status: 'reuse' };
      }

      const nextToken = this.tokens.createRefreshToken(session.userId);
      const replacement = await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: nextToken.hash,
          expiresAt: nextExpiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { replacedByTokenId: replacement.id },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
      await tx.authSecurityEvent.create({
        data: {
          userId: session.userId,
          sessionId: session.id,
          type: 'TOKEN_REFRESHED',
          ...metadata,
        },
      });

      return {
        status: 'ok',
        bundle: {
          user: session.user,
          sessionId: session.id,
          refreshToken: nextToken.plainText,
          refreshTokenExpiresAt: nextExpiresAt,
        },
      };
    });

    if (outcome.status !== 'ok') {
      throw new UnauthorizedException('The refresh session is invalid or expired.');
    }

    return this.toAuthResponse(outcome.bundle);
  }

  async logout(principal: AuthPrincipal, metadata: RequestMetadata): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.revokeSessionFamily(tx, principal.sessionId, 'LOGOUT', now);
      await tx.authSecurityEvent.create({
        data: {
          userId: principal.userId,
          sessionId: principal.sessionId,
          type: 'LOGOUT',
          ...metadata,
        },
      });
    });
  }

  async logoutAll(principal: AuthPrincipal, metadata: RequestMetadata): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const sessions = await tx.authSession.findMany({
        where: { userId: principal.userId, revokedAt: null },
        select: { id: true },
      });
      const sessionIds = sessions.map((session) => session.id);

      await tx.authSession.updateMany({
        where: { id: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now, revocationReason: 'LOGOUT_ALL' },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.authSecurityEvent.create({
        data: {
          userId: principal.userId,
          sessionId: principal.sessionId,
          type: 'LOGOUT_ALL',
          metadata: { revokedSessionCount: sessionIds.length },
          ...metadata,
        },
      });
    });
  }

  async me(principal: AuthPrincipal): Promise<AuthUserDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: principal.userId, status: 'ACTIVE', deletedAt: null },
    });
    if (!user) {
      throw new UnauthorizedException('Authentication is required.');
    }
    return this.toUserDto(user);
  }

  private async createSession(
    tx: Prisma.TransactionClient,
    user: User,
    deviceName: string | undefined,
    _metadata: RequestMetadata,
  ): Promise<SessionBundle> {
    const refresh = this.tokens.createRefreshToken(user.id);
    const expiresAt = this.tokens.refreshTokenExpiresAt();
    const session = await tx.authSession.create({
      data: {
        userId: user.id,
        expiresAt,
        ...(deviceName ? { deviceName: deviceName.trim() } : {}),
      },
    });
    await tx.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: refresh.hash,
        expiresAt,
      },
    });

    return {
      user,
      sessionId: session.id,
      refreshToken: refresh.plainText,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  private async revokeSessionFamily(
    tx: Prisma.TransactionClient,
    sessionId: string,
    reason:
      | 'LOGOUT'
      | 'LOGOUT_ALL'
      | 'TOKEN_REUSE'
      | 'PASSWORD_CHANGED'
      | 'ACCOUNT_DISABLED'
      | 'EXPIRED',
    at: Date,
  ): Promise<void> {
    await tx.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: at, revocationReason: reason },
    });
    await tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  private async toAuthResponse(bundle: SessionBundle): Promise<AuthResponseDto> {
    return {
      accessToken: await this.tokens.signAccessToken(bundle.user.id, bundle.sessionId),
      refreshToken: bundle.refreshToken,
      accessTokenExpiresInSeconds: this.tokens.accessTokenExpiresInSeconds(),
      refreshTokenExpiresAt: bundle.refreshTokenExpiresAt.toISOString(),
      user: this.toUserDto(bundle.user),
    };
  }

  private toUserDto(user: User): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
