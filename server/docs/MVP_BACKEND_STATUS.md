# MVP backend status

Last reviewed: 2026-09-30

This document tracks the backend portion of `docs/MVP_REQUIREMENTS.md`. Mobile-only behavior—secure local storage, offline draft handling, operating-system notification scheduling, notification actions, and device accessibility—must be verified separately in the Expo application and on physical devices.

## Implemented server contracts

| Requirement family | Backend evidence |
| --- | --- |
| Authentication and data controls | `src/modules/auth`, rotating sessions, verification/reset tokens, populated versioned export, account disable/revocation, and 30-day purge |
| Capture and time semantics | Reminder preview/create, bounded parser, civil-time/DST resolution, recurrence materialization, and schedule revisions in `src/modules/reminders` |
| Lifecycle and actions | Idempotent complete, skip, snooze, reschedule, content edit, delete, stale-state conflicts, and finite-series archival |
| Read models and history | Stable occurrence filters for upcoming/overdue/completed/all, reminder detail, cursor event history, and deterministic occurrence explanations |
| Bounded nudge | One validated 5–1,440 minute policy per schedule revision with invalidation on replacement/deletion |
| Preferences and devices | Account locale/time format, notification timezone/quiet hours/privacy/pause, installation reconciliation/revocation, and revision checks |
| Local notification observability | Idempotent per-occurrence/device/revision/nudge-step outcome reports for requested, locally scheduled, failed, cancelled, opened, and acted-on states |
| Security and ownership | Session-derived identity, ownership-scoped queries, strict DTO validation, serializable state-changing transactions, request IDs, sanitized versioned errors, and single-process account/network throttles |
| Contract and operations | Prisma migration `20260930090000_mvp_backend_completion`, generated `docs/openapi.json`, API Dockerfile, PostgreSQL CI migration gate, liveness/readiness probes, account/reminder purge jobs |

## Verification commands

```sh
pnpm exec prisma validate
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:generate
git diff --check
```

## Release evidence still required

- Apply all migrations to an isolated or staging PostgreSQL database and run database-backed HTTP/concurrency tests.
- Verify the selected SMTP provider and verified HTTPS app links for verification/reset flows.
- Configure a shared throttler store before running multiple API replicas.
- Run purge work through a durable scheduler with alerting before relying on multi-replica in-process timers.
- Configure and verify provider backup deletion within 90 days.
- Run dependency audit with registry access.
- Verify Android/iOS local scheduling, deep links, reconciliation, notification actions, and account/device cleanup on physical devices.

Source/build checks do not establish these external integration or production-readiness claims.
