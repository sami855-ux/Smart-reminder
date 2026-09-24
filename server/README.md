# Smart Reminder API

NestJS authentication foundation for the Smart Reminder mobile MVP.

## Included

- NestJS 12 REST API under `/v1`
- PostgreSQL with Prisma ORM 7
- Email/password registration and login
- Argon2id password hashing
- Short-lived RS256 access JWTs
- Opaque refresh tokens stored only as SHA-256 hashes
- Atomic refresh-token rotation and session-family revocation on reuse
- Current-device and all-device logout
- Database validation of every authenticated access-token session
- Per-network and normalized-account rate limiting for authentication routes
- Strict DTO and environment validation
- Hashed IP address and user-agent security-event metadata
- Request IDs and a stable API error envelope
- Helmet security headers and explicit CORS allowlist
- Swagger documentation in non-production environments when enabled
- Liveness and PostgreSQL readiness endpoints
- Unit tests for configuration, Argon2id, token signing, refresh rotation, and reuse detection

This MVP server intentionally has no Redis, BullMQ worker, FCM, or APNs dependency. Reminder delivery is scheduled locally by the mobile application.

## Requirements

- Node.js 20.19 or newer
- pnpm 10 or newer
- PostgreSQL 17, or Docker with Compose

## Local setup

Install dependencies:

```sh
pnpm install
```

Start PostgreSQL:

```sh
docker compose up -d postgres
```

Create the local environment file:

```sh
cp .env.example .env
```

Generate an RSA access-token signing keypair. Never commit these files or their base64 values:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out jwt-private.pem
openssl rsa -pubout -in jwt-private.pem -out jwt-public.pem
base64 -w 0 jwt-private.pem
base64 -w 0 jwt-public.pem
openssl rand -base64 48
```

Place the first two base64 outputs in `JWT_ACCESS_PRIVATE_KEY_BASE64` and `JWT_ACCESS_PUBLIC_KEY_BASE64`. Place the random output in `AUTH_AUDIT_PEPPER`. On macOS, use `base64 < jwt-private.pem` and `base64 < jwt-public.pem`.

For verification and recovery email, configure `SMTP_URL`, `SMTP_FROM`, and `AUTH_PUBLIC_APP_URL`. SMTP is mandatory when `NODE_ENV=production`. Development can start without SMTP, but verification and password-reset messages will not be delivered and raw tokens are never printed to logs.

Apply the committed migration and start the API:

```sh
pnpm db:deploy
pnpm start:dev
```

The default endpoints are:

- API: `http://localhost:3000/v1`
- Swagger: `http://localhost:3000/docs`
- Liveness: `GET http://localhost:3000/v1/health/live`
- Readiness: `GET http://localhost:3000/v1/health/ready`

## Authentication endpoints

| Method | Path | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/register` | Public | Create an account and first session |
| `POST` | `/v1/auth/login` | Public | Create a device session |
| `POST` | `/v1/auth/email-verification/request` | Bearer access token | Send a replacement verification link |
| `POST` | `/v1/auth/email-verification/complete` | Verification token | Verify email ownership |
| `POST` | `/v1/auth/password-reset/request` | Public | Request recovery using an enumeration-safe response |
| `POST` | `/v1/auth/password-reset/complete` | Reset token | Replace the password and revoke all sessions |
| `POST` | `/v1/auth/refresh` | Refresh token | Rotate the refresh token and issue a new pair |
| `POST` | `/v1/auth/logout` | Bearer access token | Revoke the current session |
| `POST` | `/v1/auth/logout-all` | Bearer access token | Revoke every account session |
| `GET` | `/v1/auth/me` | Bearer access token | Return the authenticated identity |
| `GET` | `/v1/auth/export` | Bearer access token | Download versioned JSON account/reminder data |
| `DELETE` | `/v1/auth/account` | Bearer access token + password | Disable the account, revoke sessions, and schedule purge |

The mobile app should implement [the mobile authentication contract](../docs/MOBILE_AUTH_CONTRACT.md). A refresh response replaces the previous refresh token; clients must persist the replacement atomically and never reuse the consumed token.

The export format is JSON with `format: "smart-reminder-export"` and `version: 1`. It currently contains the account record and an empty `reminders` array because reminder persistence is the next server module. That array must be populated before reminders can exist in production.

## Verification

```sh
pnpm db:generate
pnpm exec prisma validate
pnpm typecheck
pnpm test
pnpm build
```

Database-backed endpoint verification additionally requires a running PostgreSQL instance and an applied migration.

## Remaining release validation

- Run the migrations and endpoint integration suite against PostgreSQL.
- Verify SMTP delivery and mobile deep links with the selected provider.
- Populate exports and account-deletion cancellation with reminder records when the reminder module is introduced.
- Configure the database provider's expired-backup deletion policy to 90 days or less.
- Use a shared throttler store before running more than one API replica; the MVP single-process configuration uses in-memory counters.
