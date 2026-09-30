# Smart Reminder

Smart Reminder is a mobile-first reminder product with an Expo application and a NestJS/PostgreSQL API. The MVP keeps PostgreSQL authoritative for accounts, reminders, schedules, occurrences, actions, preferences, and device reconciliation while each mobile installation schedules eligible notifications with the operating system.

## Repository layout

- `mobile/` — Expo SDK 57 application for Android and iOS
- `server/` — NestJS 12 API, Prisma 7, and PostgreSQL migrations
- `docs/MVP_REQUIREMENTS.md` — authoritative first-release scope
- `docs/req.md` — completed-product requirements beyond the MVP

## Backend capabilities

- Email/password registration, verification, recovery, rotating refresh sessions, logout, export, and deletion
- Manual and bounded natural-language reminder capture with preview-before-save
- One-time, daily, weekly, and selected-weekday schedules with timezone/DST semantics
- Stable occurrence queries for upcoming, overdue, completed, and combined views
- Idempotent complete, skip, snooze, reschedule, content-edit, and delete actions
- Immutable reminder history and deterministic “Why now?” explanations
- One bounded follow-up nudge per schedule revision
- Device installation reconciliation, quiet hours, lock-screen privacy, and global pause preferences
- Local-notification outcome reporting without claiming device display or delivery
- Generated OpenAPI contract at `server/docs/openapi.json`

## Local backend setup

Requirements: Node.js 20.19+, pnpm 10+, and PostgreSQL 17.

```sh
cd server
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:deploy
pnpm start:dev
```

The versioned API is served under `http://localhost:3000/v1`. In non-production environments, Swagger is available at `http://localhost:3000/docs` when enabled.

See [`server/README.md`](server/README.md) for key generation, email configuration, endpoint groups, verification commands, and release boundaries.

## Verification

```sh
cd server
pnpm exec prisma validate
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:generate
```

These checks validate source, unit behavior, the Prisma schema, build output, and the checked-in API contract. A releasable environment still requires applying migrations to its target PostgreSQL database, exercising the HTTP integration suite, verifying SMTP/deep links, and testing local notifications on physical Android and iOS devices.
