import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { PasswordService } from '../src/modules/auth/password.service.js';

const DEFAULT_PASSWORD = 'SmartReminder123!';
const seedUsers = [
  {
    email: process.env['SEED_USER_ONE_EMAIL'] ?? 'demo.one@smartreminder.test',
    password: process.env['SEED_USER_ONE_PASSWORD'] ?? DEFAULT_PASSWORD,
  },
  {
    email: process.env['SEED_USER_TWO_EMAIL'] ?? 'demo.two@smartreminder.test',
    password: process.env['SEED_USER_TWO_PASSWORD'] ?? DEFAULT_PASSWORD,
  },
] as const;

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required to seed users.');
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Development user seeding is disabled in production.');
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: requiredDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });
  const passwords = new PasswordService();
  const verifiedAt = new Date();

  try {
    for (const seedUser of seedUsers) {
      const email = seedUser.email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      const passwordHash =
        existing && (await passwords.verify(existing.passwordHash, seedUser.password))
          ? existing.passwordHash
          : await passwords.hash(seedUser.password);

      await prisma.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          emailVerifiedAt: verifiedAt,
        },
        update: {
          passwordHash,
          status: 'ACTIVE',
          emailVerifiedAt: existing?.emailVerifiedAt ?? verifiedAt,
          deletedAt: null,
          deletionRequestedAt: null,
          purgeAfter: null,
        },
      });

      console.info(`Seeded development user: ${email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
