# Smart Reminder Mobile — Technology Stack and Project Structure

## Document Control

- **Status:** Architecture baseline
- **Version:** 1.1
- **Last updated:** 2026-09-24
- **Supported clients:** Android and iOS mobile applications
- **First-release scope:** [MVP Requirements](MVP_REQUIREMENTS.md)
- **Completed-product scope:** [Completed Product Requirements](req.md)

This document defines the implementation stack, code ownership boundaries, project structure, and deployment shape for Smart Reminder. It does not add product scope. Where a capability is listed here but deferred by the MVP requirements, the implementation belongs to a later release.

## 1. Architecture Summary

Smart Reminder is a mobile-only product. The MVP uses device-scheduled local notifications and a request-driven NestJS API; it has no always-on background worker.

```text
Android / iOS app
├── Local UI, cached reads, secure credentials
├── Local notification scheduler and reconciler
└── HTTPS REST API
          │
          ▼
    NestJS API
    ├── PostgreSQL — authoritative product data
    └── OpenAI API — natural-language parsing

Post-MVP additions
└── Transactional outbox → Redis + BullMQ → NestJS worker
    ├── FCM / APNs remote push
    ├── Workflows and escalations
    └── External channels and integrations
```

The MVP backend is one request-driven API process:

- **API process:** authentication, REST endpoints, validation, natural-language parsing, synchronous occurrence calculation, and application logic.

PostgreSQL is the server source of truth. Each mobile installation fetches eligible occurrences and reconciles them into operating-system local notifications. Redis, BullMQ, an always-on worker, FCM, and APNs are deferred until remote delivery or other completed-product background work is implemented.

## 2. Selected Technology Stack

### 2.1 Mobile

| Concern | Technology | Responsibility |
| --- | --- | --- |
| App framework | React Native | Native Android and iOS UI |
| Runtime/tooling | Expo SDK 57 | Native modules, builds, updates, and development tooling |
| Navigation | Expo Router | File-based routing, deep links, and route groups |
| Language | TypeScript | Strictly typed mobile and server code |
| Styling | NativeWind | Shared design tokens and native component styling |
| Server state | TanStack Query | Fetching, caching, invalidation, mutation state, and online synchronization |
| Client UI state | Zustand | Small transient cross-screen UI state |
| Forms | React Hook Form | Performant form state and field errors |
| Validation | Zod | Runtime validation for forms, configuration, and external data |
| Secret storage | `expo-secure-store` | Refresh tokens and small device credentials |
| Connectivity | `@react-native-community/netinfo` | Online/offline status and retry decisions |

TypeScript `strict` mode MUST remain enabled. Expo-managed dependencies MUST be installed with `npx expo install` and checked with `npx expo install --check` so native versions remain compatible with Expo SDK 57.

### 2.2 Notifications

| Concern | Technology | Responsibility |
| --- | --- | --- |
| Mobile notification API | `expo-notifications` | Permission state, local scheduling, cancellation, actions, and notification responses |
| MVP delivery | OS local notifications through `expo-notifications` | Device-owned scheduled reminders without an always-on server worker |
| Post-MVP Android delivery | Firebase Cloud Messaging (FCM) | Server-triggered Android push notifications |
| Post-MVP iOS delivery | Apple Push Notification service (APNs) | Server-triggered iOS push notifications |
| Post-MVP orchestration | BullMQ worker | Remote delivery, workflows, escalation, retries, and reconciliation |

The MVP uses **local scheduled and in-app notifications only**. The app schedules notifications after server acceptance and reconciles them on login, synchronization, foreground, successful mutations, permission/timezone changes, and upgrade. Because the MVP has no remote push, another backgrounded device may retain a stale notification until that app next contacts the server; the product must disclose this limitation.

### 2.3 Backend

| Concern | Technology | Responsibility |
| --- | --- | --- |
| API framework | NestJS | Versioned REST API, modules, guards, validation, and OpenAPI |
| Database | PostgreSQL | Authoritative users, reminders, schedules, occurrences, sessions, events, and deliveries |
| ORM and migrations | Prisma | Typed data access and schema migrations |
| API description | NestJS Swagger / OpenAPI | Canonical mobile/server contract |
| Testing | Jest, Supertest, and Testcontainers | Unit, integration, contract, and API tests |
| Post-MVP queue infrastructure | Redis | BullMQ coordination and disposable execution state |
| Post-MVP background jobs | BullMQ + `@nestjs/bullmq` | Remote delivery, workflows, integrations, and bounded retries |

### 2.4 AI

- Use the official OpenAI JavaScript/TypeScript SDK from the NestJS server only.
- Use the Responses API with Structured Outputs for natural-language reminder parsing.
- Validate every model result with a server-side Zod schema and deterministic scheduling rules.
- Return a preview for explicit user confirmation; model output MUST NOT directly create or modify a reminder.
- Keep the model name configurable through `OPENAI_REMINDER_PARSER_MODEL` rather than hard-coding it.
- Keep `OPENAI_API_KEY` in server-side secret storage. It MUST never be included in the mobile bundle, an `EXPO_PUBLIC_*` variable, logs, or source control.

See the official OpenAI guidance for [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) and [production API-key handling](https://developers.openai.com/api/docs/guides/production-best-practices).

### 2.5 Authentication

- Short-lived signed JWT access tokens.
- Random, rotating refresh tokens backed by server-side session records.
- Only a cryptographic hash of each refresh token is stored in PostgreSQL.
- The mobile access token remains in memory where practical.
- The mobile refresh token is stored with `expo-secure-store`.
- Refresh-token reuse revokes the affected token family.
- Current-device logout and all-device logout are supported independently.
- Passwords are hashed with Argon2id using reviewed parameters.

`expo-secure-store` is for small secrets. It MUST NOT be used as a reminder database, query cache, offline outbox, or conflict store.

## 3. Repository Structure

Use a pnpm workspace. A build orchestrator may be added when CI complexity warrants it; it is not required for the first build.

```text
smart-reminder/
├── mobile/                           # Expo / React Native application
├── server/                           # NestJS API; worker added post-MVP
├── packages/
│   ├── api-client/                   # Generated from server OpenAPI; do not hand-edit
│   ├── eslint-config/                # Shared lint rules
│   └── typescript-config/            # Shared strict TypeScript bases
├── infra/
│   ├── compose.yaml                  # Local PostgreSQL for the MVP
│   └── README.md
├── .github/
│   └── workflows/                    # CI checks and builds
├── .env.example                      # Names and safe examples only; no secrets
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── docs/
│   ├── TECH_STACK.md
│   ├── MVP_REQUIREMENTS.md
│   └── req.md
```

Do not share Prisma entities with the mobile application. The mobile contract is generated from versioned OpenAPI schemas in `packages/api-client`.

## 4. Mobile Application Structure

### 4.1 Folder tree

```text
mobile/
├── app/                              # Expo Router entry points only
│   ├── _layout.tsx                   # Root providers and navigation guards
│   ├── +not-found.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   ├── register.tsx
│   │   ├── verify-email.tsx
│   │   └── forgot-password.tsx
│   ├── (onboarding)/
│   │   ├── _layout.tsx
│   │   ├── preferences.tsx
│   │   └── notifications.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx                 # Home: today, upcoming, overdue
│   │   ├── create.tsx
│   │   ├── completed.tsx
│   │   └── settings.tsx
│   ├── reminders/
│   │   ├── [reminderId].tsx
│   │   └── [reminderId]/edit.tsx
│   ├── occurrences/[occurrenceId].tsx
│   ├── calendar.tsx                  # Post-MVP
│   ├── search.tsx                    # Post-MVP
│   └── conflicts/[conflictId].tsx    # Completed product
├── src/
│   ├── api/
│   │   ├── client.ts                 # Base URL, headers, timeout, request ID
│   │   ├── auth.ts                   # Access-token injection and refresh mutex
│   │   ├── errors.ts                 # Versioned API error mapping
│   │   └── query-client.ts
│   ├── components/
│   │   └── ui/                       # Accessible shared primitives
│   ├── features/
│   │   ├── auth/
│   │   ├── onboarding/
│   │   ├── reminder-create/
│   │   ├── reminders/
│   │   ├── occurrences/
│   │   ├── completed/
│   │   ├── history/
│   │   ├── notification-preferences/
│   │   ├── settings/
│   │   ├── calendar/                 # Post-MVP
│   │   ├── search/                   # Post-MVP
│   │   ├── workflows/                # Post-MVP
│   │   ├── integrations/             # Post-MVP
│   │   └── sync/                     # Completed product
│   ├── platform/
│   │   ├── notifications/
│   │   │   ├── local-notification.adapter.ts
│   │   │   ├── expo-local-notification.adapter.ts
│   │   │   ├── notification-actions.ts
│   │   │   ├── notification-response.ts
│   │   │   └── notification-reconciler.ts
│   │   ├── secure-storage/
│   │   │   ├── secure-storage.adapter.ts
│   │   │   └── expo-secure-store.adapter.ts
│   │   ├── device-triggers/          # Post-MVP capability adapters
│   │   │   ├── capability-registry.ts
│   │   │   ├── location/
│   │   │   ├── bluetooth/
│   │   │   ├── wifi/
│   │   │   └── inactivity/
│   │   └── calendar/                 # Post-MVP OS calendar adapter
│   ├── offline/
│   │   ├── cache/
│   │   ├── drafts/
│   │   ├── outbox/                   # Completed product
│   │   ├── sync/                     # Completed product
│   │   └── conflicts/                # Completed product
│   ├── providers/AppProviders.tsx
│   ├── state/ui.store.ts
│   ├── config/
│   ├── hooks/
│   ├── lib/
│   ├── theme/
│   └── types/
├── assets/
├── tests/
│   ├── contract/
│   ├── integration/
│   ├── device/
│   ├── e2e/
│   └── fixtures/
├── app.config.ts
├── eas.json
├── global.css
├── nativewind-env.d.ts
├── tailwind.config.js
└── tsconfig.json
```

### 4.2 Feature shape

Create only the folders a feature needs:

```text
src/features/reminders/
├── api/
│   ├── reminder.queries.ts
│   └── reminder.mutations.ts
├── components/
├── hooks/
├── schemas/
├── screens/
├── __tests__/
├── types.ts
└── index.ts
```

Expo Router files MUST remain thin. They may validate route parameters, apply a navigation guard, configure presentation, and render a feature screen. Business rules, API calls, forms, and notification behavior belong under `src/`.

### 4.3 State ownership

| State or behavior | Owner |
| --- | --- |
| Reminders, occurrences, profile, history, and server preferences | TanStack Query |
| Active form values and validation errors | React Hook Form + Zod |
| Temporary filters, sheet state, and non-durable UI preferences | Zustand |
| Refresh token and small device credentials | `expo-secure-store` |
| Cached reads and unsent drafts | Dedicated persistence adapter under `src/offline` |
| Completed-product mutation outbox and conflicts | Encrypted durable local database behind `src/offline` |
| Local OS scheduling and notification permission | Notification platform adapter |
| Authoritative synchronized schedule, occurrence, and lifecycle state | NestJS + PostgreSQL |

Server data MUST NOT be copied into Zustand. Form state MUST NOT be duplicated in Zustand unless a documented multi-screen draft requires it.

### 4.4 API client rules

`src/api/client.ts` is the only low-level HTTP entry point. It MUST:

- Use the versioned API base URL.
- Attach the in-memory access token.
- Coordinate a single refresh operation when concurrent calls receive `401`.
- Map the versioned server error body into typed errors.
- Carry and expose request IDs for diagnostics.
- Support cancellation and timeouts.
- Retry only safe requests or mutations carrying an idempotency key.

Features own their TanStack Query keys, queries, mutations, and invalidation behavior. Generated OpenAPI code stays isolated in `packages/api-client`.

## 5. Notification Architecture

### 5.1 MVP local ownership

In the MVP, every eligible occurrence/device pair is owned by the mobile installation, which schedules the operating-system notification. There is no remote delivery owner and no server-side dispatch job.

Every local scheduling record carries:

- Occurrence ID
- Logical notification ID
- Schedule revision
- Device installation ID
- Operating-system notification ID

Completing, skipping, snoozing, rescheduling, pausing, cancelling, deleting, logging out, or switching accounts MUST cancel or replace affected local notifications on the current installation. Other installations reconcile when they next contact the server.

### 5.2 Mobile adapter

Feature code MUST NOT call `expo-notifications` directly. Use an adapter equivalent to:

```ts
export interface LocalNotificationAdapter {
  getPermissionStatus(): Promise<NotificationPermissionStatus>;
  requestPermission(): Promise<NotificationPermissionStatus>;
  schedule(input: LocalNotificationRequest): Promise<string>;
  cancel(platformNotificationId: string): Promise<void>;
  reconcile(desired: LocalNotificationRequest[]): Promise<void>;
  registerActions(): Promise<void>;
  subscribeToResponses(
    listener: (response: NotificationResponse) => void,
  ): () => void;
}
```

The local persistence layer maps logical notification IDs to platform notification IDs. Lock-screen payloads follow the user's privacy preference and MUST NOT expose hidden reminder content.

### 5.3 Reconciliation triggers and horizon

The mobile app reconciles its local schedule after:

- Login and account restoration
- Successful reminder synchronization
- App foreground and pull-to-refresh
- Successful create, edit, snooze, complete, skip, pause, cancel, or delete
- Notification permission or timezone change
- Application upgrade

The reconciler compares authoritative occurrences with its protected logical-to-platform mapping, cancels stale revisions, schedules missing eligible notifications, and records failures without exposing reminder content. It uses operating-system repeating triggers only where they preserve the confirmed recurrence semantics; otherwise it schedules a documented bounded future horizon and replenishes it on later app contact.

A successful scheduling API call proves only that the operating system accepted the request. It does not prove display or reading. If scheduling fails or the future horizon cannot be protected, the UI marks notification delivery as degraded.

### 5.4 Remote push — post-MVP

- The app obtains and refreshes its push token through the mobile notification adapter.
- The backend stores token type, platform, application environment, device registration, and revocation state explicitly.
- FCM and APNs SDKs live behind server provider adapters.
- Provider acceptance is recorded separately from delivery, display, open, and action state.
- Invalid-token responses revoke the affected device registration.
- A notification response deep-links to an Expo Router route, refreshes authoritative occurrence state, and only then applies a user action.

Expo push tokens and native FCM/APNs tokens are different types. Do not mix them in one untyped field or send a token to the wrong provider.

Remote push MUST NOT be enabled alongside local delivery for the same occurrence/device pair until the completed-product ownership and deduplication contract is implemented.

### 5.5 Device validation

Expo Go is not sufficient proof for background delivery, notification actions, location, Bluetooth, Wi-Fi, or all native permission behavior. Validate these with development builds and physical Android and iOS devices.

## 6. Backend Application Structure

```text
server/
├── src/
│   ├── api/
│   │   ├── main.ts
│   │   └── api.module.ts
│   ├── bootstrap/
│   │   ├── validation.ts
│   │   ├── openapi.ts
│   │   ├── security.ts
│   │   └── raw-body.ts
│   ├── config/
│   │   ├── configuration.ts
│   │   └── env.schema.ts
│   ├── common/
│   │   ├── auth/
│   │   ├── crypto/
│   │   ├── errors/
│   │   ├── idempotency/
│   │   ├── pagination/
│   │   ├── request-context/
│   │   ├── time/
│   │   └── validation/
│   ├── database/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── transaction.service.ts
│   ├── observability/
│   │   ├── logging/
│   │   ├── metrics/
│   │   └── tracing/
│   └── modules/
│       ├── auth/
│       ├── users/
│       ├── devices/
│       ├── reminders/                # Reminder, schedule, occurrence, event
│       ├── notification-preferences/
│       ├── notifications/
│       ├── parsing/                  # Natural-language parser and OpenAI adapter
│       ├── audit/
│       ├── data-rights/
│       ├── triggers/                 # Post-MVP
│       ├── workflows/                # Post-MVP
│       ├── escalations/               # Post-MVP
│       ├── integrations/             # Post-MVP
│       ├── sync/                     # Completed product
│       └── search/                   # Post-MVP
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── openapi/
│   └── openapi.json
├── test/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   ├── contract/
│   ├── recurrence/
│   ├── security/
│   ├── fixtures/
│   └── factories/
├── Dockerfile
├── nest-cli.json
├── package.json
└── tsconfig.json
```

Complex domain modules use this internal shape:

```text
modules/reminders/
├── domain/                            # Entities, values, policies, and ports
├── application/                       # Commands, queries, and use cases
├── api/                               # Controllers and DTO mapping
├── infrastructure/                    # Prisma repositories and adapters
└── reminders.module.ts
```

Keep the MVP as one request-driven modular monolith. When remote delivery or another background feature enters scope, add the following folders without splitting the domain into microservices:

```text
server/src/
├── worker/
│   ├── main.ts
│   └── worker.module.ts
└── queues/
    ├── queue.module.ts
    ├── queue-names.ts
    ├── job-options.ts
    ├── job-payloads.ts
    └── producers/

modules/<module>/workers/              # BullMQ processors owned by a module
```

The later API and worker processes may scale independently while continuing to share the same modular codebase.

## 7. Database and Local-Scheduling Reliability

### 7.1 MVP source-of-truth rules

- PostgreSQL stores accepted reminder intent, schedules, occurrences, sessions, device installations, immutable events, and logical notification state.
- Reminder mutations and their immutable events commit in one PostgreSQL transaction.
- The API returns authoritative eligible occurrences and schedule revisions; it does not create a BullMQ job for them.
- Each mobile installation maintains a protected mapping from the logical notification ID to the operating-system notification ID.
- The mapping is rebuildable from authoritative API state after reinstall, corruption, or reconciliation failure.
- JavaScript timers are not used to wait for reminder due times; the operating system owns scheduled wake-up and display.

### 7.2 MVP reconciliation rules

The mobile reconciler MUST:

- Be idempotent when run repeatedly with unchanged state.
- Re-read lifecycle, schedule revision, quiet hours, global pause, permission, and timezone before scheduling.
- Cancel stale or ineligible notifications before scheduling replacements where the platform allows.
- Bound retries and surface degraded protection instead of silently failing.
- Avoid notification bursts when overdue occurrences are discovered.
- Preserve a deterministic logical key across cancellation and replacement.
- Treat another device's local schedule as unreachable until that app next contacts the server.

### 7.3 Post-MVP queue architecture

Redis, BullMQ, a transactional outbox, and a separately deployable NestJS worker are added only when server-triggered push, integrations, workflows, escalation, or other asynchronous delivery enters scope. At that point:

- PostgreSQL remains authoritative and queue loss must not erase reminder intent.
- Domain mutation, immutable event, and outbox record commit atomically.
- Workers assume at-least-once execution and re-read authoritative state before effects.
- PostgreSQL uniqueness constraints provide durable deduplication.
- Retries are bounded with backoff, jitter, dead-letter state, and reconciliation.
- Job payloads contain identifiers and revisions, not full reminder bodies or provider secrets.

Reserved post-MVP queue names are:

```text
outbox
occurrence-expansion
notification-delivery
trigger-evaluation
workflow
escalation
integration
ai
maintenance
dead-letter
```

## 8. OpenAI Parsing Boundary

Natural-language parsing is an assistance flow, not an autonomous action.

1. The mobile app sends the original text, reference instant, locale, IANA timezone, and time-format preference to the NestJS parser endpoint.
2. The server applies length limits, rate limits, authentication, and content-minimized logging.
3. The OpenAI adapter requests a strict structured result.
4. Zod validates the result at runtime.
5. Deterministic code validates supported grammar, time, recurrence, DST gaps/folds, bounds, and alternatives.
6. The server returns a typed preview containing confidence, ambiguities, warnings, and supported alternatives.
7. The mobile app lets the user edit and explicitly confirm the result.
8. Confirmation uses the normal idempotent reminder-creation endpoint.

Provider failure, timeout, rate limiting, invalid structure, or low-confidence ambiguity preserves the draft and falls back to manual creation. Ordinary logs MUST NOT store raw prompts, reminder content, access tokens, or model output.

Keep OpenAI-specific DTOs and SDK calls inside `modules/parsing/infrastructure/openai`. Domain and controller code depend on a parser port so the provider or model can be changed without rewriting reminder creation.

## 9. API Contract

- Expose versioned REST endpoints under `/v1`.
- Generate `server/openapi/openapi.json` from the NestJS application.
- Generate the mobile TypeScript client into `packages/api-client`.
- Never import NestJS DTOs or Prisma types into the mobile app.
- Require idempotency keys for create and action mutations.
- Require a resource revision or ETag for concurrent updates.
- Use cursor pagination for growing collections.
- Use RFC 3339 timestamps and IANA timezone identifiers.
- Preserve original civil date/time plus resolved UTC instant where the requirements demand it.
- Version REST contracts for the MVP. Version queue jobs, domain events, and provider webhooks separately when those post-MVP components are added.

Use one stable error shape:

```ts
type ApiError = {
  code: string;
  message: string;
  requestId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string[]>;
  conflict?: {
    currentRevision: number;
    currentState?: string;
  };
};
```

## 10. Offline Storage Strategy

### MVP

- TanStack Query provides the online server-state cache.
- A persistence adapter may retain the last successful read for the required stale/offline view.
- Failed offline submissions remain visibly unsent drafts and are not presented as active reminders.
- The server remains authoritative for all accepted mutations.

### Completed product

Full offline mutation and conflict support requires an encrypted durable local database behind `src/offline`. The concrete database should be selected only after confirming Expo SDK 57 development-build support, encryption/key handling, migration behavior, and Android/iOS background constraints.

The completed implementation must persist:

- Cached entities and server cursor
- Client-generated IDs
- Mutation outbox with idempotency keys
- Device sequence and base revision
- Tombstones
- Conflict records and both source versions
- Logical-to-platform notification mappings

Do not build this system with Zustand, AsyncStorage, or `expo-secure-store` as the database.

## 11. Device Trigger Boundaries

Location, Bluetooth, Wi-Fi, inactivity, charging, battery, app-open, and accessory signals are mobile platform capabilities. The NestJS server cannot continuously observe them by itself.

Every adapter in `src/platform/device-triggers` reports one of:

- `available`
- `permission-required`
- `restricted`
- `unsupported`

The UI MUST not present a restricted or unsupported trigger as active. Device events sent to the server are authenticated, idempotent, minimally disclosed, and tied to a capability snapshot. Android and iOS implementations may differ while preserving one domain contract.

These triggers are post-MVP according to the requirements. They require development builds, native configuration, real-device tests, battery-impact testing, and documented OS limitations before release.

## 12. Environment Configuration

### 12.1 Mobile environment

Only non-secret values may use Expo public variables:

```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://localhost:3000/v1
```

An `EXPO_PUBLIC_*` value is compiled into the mobile application and MUST be treated as public. Do not place JWT signing keys, refresh tokens, OpenAI keys, database URLs, or future Redis/FCM/APNs credentials there.

### 12.2 Server environment

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/smart_reminder

JWT_ACCESS_PRIVATE_KEY=
JWT_ACCESS_PUBLIC_KEY=
JWT_ACCESS_TTL=
REFRESH_TOKEN_TTL=

OPENAI_API_KEY=
OPENAI_REMINDER_PARSER_MODEL=
```

Post-MVP remote delivery adds server-only variables such as:

```dotenv
REDIS_URL=redis://localhost:6379
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_BUNDLE_ID=
APNS_PRIVATE_KEY=
```

The checked-in `.env.example` contains names and safe examples only. Deployment secrets belong in the hosting platform's secret manager. Environment variables are validated at startup; a missing required variable fails the affected process before it accepts work.

## 13. Testing Strategy

### 13.1 Mobile

- Unit tests for Zod schemas, formatters, state transitions, and adapters.
- React Native Testing Library tests for screens and accessible interaction states.
- Contract tests against the generated OpenAPI client.
- Integration tests for authentication refresh, Query invalidation, draft recovery, and notification reconciliation.
- E2E tests for registration, reminder creation, parse preview, confirmation, notification action, snooze, and completion.
- Physical-device tests for permissions, foreground/background/killed-app behavior, actions, deep links, timezone changes, and revoked capabilities.

### 13.2 Server

- Unit tests for domain policies and deterministic time logic.
- Integration tests with a real PostgreSQL container.
- Supertest API tests for authentication, authorization, validation, idempotency, and concurrency.
- Recurrence tests across IANA timezones, DST gaps/folds, leap years, and month boundaries.
- OpenAI parser conformance tests with fixed input context and schema-valid fixtures; CI must not depend on live model responses.

MVP device tests MUST cover local scheduling replay, stale-revision replacement, permission denial/revocation, quiet hours, timezone change, scheduling-horizon replenishment, logout cleanup, and killed-app display. Worker replay and FCM/APNs provider tests are post-MVP gates when those components enter scope.

An Expo export, TypeScript build, or emulator test is useful evidence but does not prove physical-device notification delivery, background trigger behavior, provider callbacks, database migrations, or production readiness.

## 14. Build and Deployment

### Mobile

- Use EAS development builds for native-module development and device testing.
- Maintain separate development, preview, and production profiles in `eas.json`.
- Configure Android package IDs, iOS bundle IDs, local-notification permissions, notification categories, and deep links explicitly. Push credentials are added only with post-MVP remote delivery.
- Treat over-the-air updates as application code updates, not a mechanism for changing native capabilities.

### Server

- Produce one NestJS API container for the MVP; there is no worker deployment.
- Run Prisma migrations as a controlled deployment step, not independently from every application replica.
- Expose API liveness and readiness endpoints.
- Readiness checks verify required API dependencies without modifying data.
- Back up PostgreSQL and test restoration.
- When post-MVP background work is added, the same image MAY expose a separate worker command so API and worker processes can scale independently.

### Continuous integration

Every change should run, as applicable:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter mobile expo-doctor
pnpm --filter mobile exec expo install --check
pnpm --filter server test:e2e
pnpm --filter server openapi:check
```

Exact package scripts are established when the workspace is scaffolded. CI also checks that generated OpenAPI output and the generated mobile client are current.

## 15. Security and Privacy Baseline

- All traffic uses TLS outside local development.
- Mobile authentication derives user identity from the validated access token, never a request-body user ID.
- Login, refresh, recovery, parsing, notification-action, and webhook endpoints are rate-limited.
- Webhooks preserve the raw body for signature verification and reject stale or replayed signatures.
- Provider credentials live only in server-side adapters.
- Logs exclude passwords, tokens, notification destinations, reminder content, coordinates, network identifiers, and integration credentials.
- Sensitive columns such as provider tokens are encrypted or equivalently protected at rest.
- Notification previews respect the configured lock-screen privacy mode.
- Account deletion immediately disables server schedules, revokes sessions, and requires the current installation to cancel its local notifications before local sign-out. Other installations clean up on their next authenticated contact.
- Dependency, container, and secret scanning run in CI.

## 16. Architecture Invariants

The following rules are non-negotiable unless this document and the requirements are deliberately revised:

1. The product has Android and iOS clients only; there is no end-user web app.
2. Expo Router routes remain thin and feature logic stays under `src/features`.
3. TanStack Query owns server state; Zustand does not become a second server cache.
4. SecureStore holds small secrets, not reminder records or offline synchronization state.
5. PostgreSQL is authoritative after synchronization.
6. The MVP has no Redis, BullMQ, always-on worker, FCM, or APNs dependency.
7. JavaScript timers are not reminder schedulers; the operating-system local notification API owns delivery timing.
8. Each MVP occurrence/device pair has one local notification identity and one schedule revision.
9. Local reconciliation is idempotent and rebuildable from authoritative API state.
10. The OpenAI API is called only by the server and its output is untrusted until validated.
11. AI parsing always ends at an editable confirmation preview.
12. Prisma and backend framework types never cross into the mobile application.
13. Secrets never use `EXPO_PUBLIC_*` and never enter source control.
14. Platform capability limitations are visible; unsupported triggers are never presented as active.
15. Operating-system scheduling acknowledgement is not reported as confirmed display or reading.

## 17. Recommended Implementation Order

1. Create the pnpm workspace and strict shared TypeScript configuration.
2. Scaffold the Expo SDK 57 mobile application and thin Expo Router route groups.
3. Scaffold the request-driven NestJS API.
4. Add local PostgreSQL infrastructure.
5. Define Prisma schema, migration workflow, health checks, and environment validation.
6. Implement authentication, rotating refresh sessions, secure mobile storage, and refresh coordination.
7. Define versioned error handling, OpenAPI generation, and generated mobile client workflow.
8. Implement reminders, schedules, occurrences, events, and deterministic recurrence behavior.
9. Add TanStack Query features and the manual reminder form.
10. Add the server-side OpenAI parser, schema validation, preview, and confirmation flow.
11. Add the local-notification adapter, protected notification mapping, reconciliation, scheduling horizon, and degraded-delivery UI.
12. Complete MVP security, accessibility, contract, recurrence, reconciliation, and real-device notification tests.
13. Add Redis, BullMQ, an outbox, a worker process, FCM/APNs, and remote notification ownership only when server-triggered push enters scope.
14. Add the remaining post-MVP modules only in the order defined by [req.md](req.md).

The first releasable build is complete only when the acceptance gates in [MVP_REQUIREMENTS.md](MVP_REQUIREMENTS.md) pass. A successful build or generated folder structure alone is not release evidence.
