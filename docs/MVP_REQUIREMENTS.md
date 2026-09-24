# Smart Reminder Mobile — MVP Requirements

## Document Control

- **Status:** Draft build scope
- **Version:** 1.0
- **Last updated:** 2026-09-24
- **Product:** Smart Reminder
- **Client scope:** Android and iOS mobile applications only
- **Related specification:** [Completed Product Requirements](req.md)

This document is the authoritative scope for the first releasable version of Smart Reminder. The completed-product specification remains authoritative for post-MVP capabilities.

## 1. Requirement Language

- **MUST** indicates a release-blocking requirement.
- **SHOULD** indicates an important requirement that may be deferred only through a documented product decision.
- **MAY** indicates optional behavior.

Every implemented requirement MUST be traceable to its schema or storage model, API contract, implementation, automated test, verification environment, evidence date, and current status.

## 2. Product Definition

Smart Reminder is a mobile reminder application that helps users capture an intention quickly, receive a useful reminder at the correct time, and act without losing context.

### 2.1 MVP hypothesis

Fast natural-language capture plus a bounded follow-up nudge will improve completion of reminders that users would otherwise ignore.

### 2.2 Primary user

The primary MVP user is an individual professional, freelancer, or student managing personal tasks and follow-ups.

### 2.3 Product principles

1. **Fast:** a common reminder can be created in seconds.
2. **Clear:** the exact schedule is shown before creation.
3. **Reliable:** accepted schedules survive worker restarts and are processed idempotently.
4. **Contextual:** a reminder can retain a short note explaining what it concerns.
5. **Persistent but respectful:** an optional bounded nudge helps without creating notification spam.
6. **User-controlled:** parsing and suggestions never silently change a schedule.

## 3. Platform and System Boundary

### 3.1 Supported clients

- MVP-PLAT-001: The product MUST provide mobile applications for Android and iOS.
- MVP-PLAT-002: No end-user web application or PWA is in scope; every MVP end-user workflow MUST be delivered through Android or iOS.
- MVP-PLAT-003: Backend APIs, databases, workers, notification providers, and operational tooling are part of the system even though the user-facing product is mobile-only.
- MVP-PLAT-004: Platform-specific limitations MUST be disclosed in the UI; unsupported behavior MUST NOT be presented as active.

### 3.2 Connectivity boundary

- MVP-PLAT-005: The server is authoritative for accounts, reminders, schedules, occurrences, actions, and remote notification dispatch.
- MVP-PLAT-006: The app MUST show the last successfully cached reminder list when temporarily offline.
- MVP-PLAT-007: Offline create, edit, delete, complete, snooze, and conflict resolution are not MVP capabilities.
- MVP-PLAT-008: When an offline write is attempted, the app MUST preserve entered form data locally, explain that a connection is required, and allow retry after reconnection.

## 4. MVP Scope

The MVP includes:

1. Account registration, verification, login, logout, recovery, session refresh, export, and deletion.
2. First-run timezone, locale, notification-permission, and privacy setup.
3. Manual and natural-language reminder creation.
4. Mandatory structured preview before a parsed reminder is saved.
5. One-time reminders.
6. Daily, weekly, and selected-weekday recurrence.
7. Today, Upcoming, Overdue, and Recent Completed lists.
8. Complete, snooze, reschedule, edit, skip occurrence, and delete actions.
9. Push and in-app notifications.
10. Quiet hours and lock-screen privacy controls.
11. One optional follow-up nudge while an occurrence remains incomplete.
12. Reminder event history and a deterministic “Why now?” explanation.
13. Cross-device online synchronization with idempotent actions.

## 5. Explicit MVP Non-Goals

The following capabilities are required by the completed product but are not part of the MVP:

- Location arrival and departure triggers
- Bluetooth, Wi-Fi, charging, headset, and other device triggers
- Inactivity triggers
- Behavioral smart scheduling
- External-calendar conflict detection
- Arbitrary conditional follow-up chains
- Multi-step escalation policies
- AI context summarization and behavioral recommendations
- Monthly, yearly, last-weekday, and other advanced recurrence
- Day, week, and month calendar grids
- Categories, tags, priority, and advanced search
- Email, SMS, WhatsApp, and Telegram reminder delivery
- Offline mutations and advanced conflict resolution
- External calendar, messaging, task, CRM, or automation integrations

These features MUST remain in [req.md](req.md) and MUST NOT be treated as cancelled.

## 6. Account and Session Requirements

- MVP-AUTH-001: A user MUST be able to register with an email address and password.
- MVP-AUTH-002: Email ownership MUST be verified before multi-channel or account-recovery features can use the address.
- MVP-AUTH-003: Login and recovery responses MUST not reveal whether an account exists.
- MVP-AUTH-004: A user MUST be able to log in, log out of the current device, and log out of all devices.
- MVP-AUTH-005: A user MUST be able to request and complete password reset using a one-time, expiring token.
- MVP-AUTH-006: Access and refresh/session expiration MUST be defined independently.
- MVP-AUTH-007: Refresh/session credentials MUST rotate on use; reuse of an invalidated credential MUST revoke the affected session family.
- MVP-AUTH-008: The application MUST securely persist mobile credentials using platform-provided secure storage.
- MVP-AUTH-009: A user MUST be able to export their reminder data in a documented machine-readable format.
- MVP-AUTH-010: Account deletion MUST immediately disable schedules, revoke sessions and device tokens, and cancel queued work. Primary user content MUST be purged within 30 days and expired backups within 90 days; any legally required exception MUST be documented and content-minimized.
- MVP-AUTH-011: Authentication endpoints MUST use per-account and per-network rate limits.

## 7. Onboarding and Permissions

- MVP-ONB-001: First run MUST confirm the user's locale, IANA timezone, and preferred 12-hour or 24-hour display.
- MVP-ONB-002: Notification permission MUST be requested only after the app explains its value.
- MVP-ONB-003: Denying or revoking notification permission MUST NOT prevent reminder creation.
- MVP-ONB-004: When push is unavailable, the app MUST show an in-app warning and instructions for opening system settings.
- MVP-ONB-005: The user SHOULD be able to send a test notification after enabling permission.
- MVP-ONB-006: Permission state shown by the app MUST be reconciled with the operating-system state.

## 8. Reminder Creation

### 8.1 Manual creation

- MVP-CAP-001: An MVP reminder MUST contain a title and exactly one time-based schedule, which may generate recurring occurrences.
- MVP-CAP-002: The product MUST allow an optional context note.
- MVP-CAP-003: A normalized title MUST contain 1–120 Unicode characters and a context note 0–2,000 Unicode characters; both client and server MUST enforce the limits.
- MVP-CAP-004: The creation form MUST support one-time, daily, weekly, and selected-weekday schedules.
- MVP-CAP-005: The user MUST see the resolved local date, time, timezone, recurrence summary, and first occurrence before saving.
- MVP-CAP-006: A schedule in the past MUST be rejected or explicitly moved by the user; it MUST NOT be silently changed.
- MVP-CAP-007: Duplicate create submissions MUST produce one reminder when the same idempotency key is replayed.

### 8.2 Natural-language creation

- MVP-NLP-001: The user MUST be able to enter common phrases such as “Remind me tomorrow at 9 to call John.”
- MVP-NLP-002: Natural-language parsing is input assistance, not the source of truth.
- MVP-NLP-003: The parse request MUST include the original text, reference instant, locale, IANA timezone, and 12-hour or 24-hour preference.
- MVP-NLP-004: The parse response MUST contain a structured title, local date and time, timezone, recurrence, confidence by field, ambiguity flags, warnings, and supported alternatives.
- MVP-NLP-005: Inferred fields MUST be visually distinguishable and editable.
- MVP-NLP-006: Ambiguous input MUST cause a clarification or present alternatives; it MUST create nothing until confirmed.
- MVP-NLP-007: Unsupported location, device, or integration phrases MUST be recognized and explained as unavailable in the MVP.
- MVP-NLP-008: Parser timeout, model failure, rate limiting, or disabled AI MUST preserve the draft and provide the manual form.
- MVP-NLP-009: All parser output MUST be schema-validated and bounded before persistence.
- MVP-NLP-010: No parser or model response may delete, send, contact, reschedule, or create a reminder without explicit confirmation.
- MVP-NLP-011: The supported grammar MUST cover exact dates, today/tomorrow, named or next weekdays, 12-hour and 24-hour times, relative durations in minutes/hours/days, daily recurrence, weekly recurrence, and selected weekdays.
- MVP-NLP-012: Input is ambiguous when it lacks an exact time required by the schedule or has more than one materially different valid interpretation; ambiguous input MUST require user selection rather than an arbitrary confidence threshold.
- MVP-NLP-013: Unsupported clauses MUST remain visible in the preview as warnings and MUST not be silently discarded.
- MVP-NLP-014: Parser conformance tests MUST fix the reference instant, locale, timezone, and expected structured result.

## 9. Time and Recurrence Semantics

- MVP-TIME-001: Civil-time schedules MUST store the original local date/time, IANA timezone identifier, and resolved UTC instant.
- MVP-TIME-002: API timestamps MUST use RFC 3339.
- MVP-TIME-003: One-time reminders created from a local date/time MUST retain the instant confirmed by the user.
- MVP-TIME-004: Recurring reminders MUST preserve their wall-clock time in the schedule's IANA timezone.
- MVP-TIME-005: The app MUST preview the effect of changing the account timezone on existing schedules; it MUST not silently rewrite them.
- MVP-TIME-006: A nonexistent DST local time MUST move forward by the gap. An ambiguous repeated time MUST use the earlier offset. The selected instant and offset MUST be shown before confirmation.
- MVP-TIME-007: “Morning,” “afternoon,” “evening,” and other non-exact dayparts MUST require the user to select an exact time in the MVP.
- MVP-TIME-008: A recurring series MUST have a start date and MAY have an end date or occurrence count.
- MVP-TIME-009: The MVP MUST support daily, weekly, and selected-weekday recurrence.
- MVP-TIME-010: Each recurring occurrence MUST have its own scheduled time and state.
- MVP-TIME-011: Editing a recurring reminder MUST ask whether the change applies only to the selected occurrence or to the selected and all future occurrences. A future-series edit MUST create a new schedule revision while preserving historical occurrences.
- MVP-TIME-012: Snoozing one occurrence MUST NOT silently move later occurrences.

## 10. Lifecycle and Actions

### 10.1 Lifecycle model

- MVP-LIFE-001: Reminder-series lifecycle values MUST be `ACTIVE`, `CANCELLED`, and `ARCHIVED`.
- MVP-LIFE-002: Occurrence lifecycle values MUST be `SCHEDULED`, `COMPLETED`, `SKIPPED`, and `CANCELLED`.
- MVP-LIFE-003: “Due” and “Overdue” MUST be derived presentation states based on current time and the effective scheduled time.
- MVP-LIFE-004: Snooze MUST be modeled as an event that changes the effective scheduled time, not as the only durable lifecycle status.
- MVP-LIFE-005: Every state-changing request MUST be idempotent.
- MVP-LIFE-006: Invalid state transitions MUST return a stable conflict error and the latest occurrence state.
- MVP-LIFE-007: A one-time or finite series with no future occurrence MUST become `ARCHIVED` after its final occurrence reaches a terminal state.
- MVP-LIFE-008: Valid series transitions are `ACTIVE → CANCELLED` on deletion and `ACTIVE → ARCHIVED` when no future occurrence remains. MVP terminal series states MUST NOT be reopened.
- MVP-LIFE-009: Valid occurrence transitions are `SCHEDULED → COMPLETED` when due/overdue, `SCHEDULED → SKIPPED` for a recurring occurrence, and `SCHEDULED → CANCELLED` when its reminder or schedule revision is cancelled. Terminal occurrences MUST NOT be reopened in the MVP.

### 10.2 User actions

- MVP-ACT-001: The user MUST be able to complete a due or overdue occurrence.
- MVP-ACT-002: The user MUST be able to snooze for 10 minutes, 30 minutes, 1 hour, tomorrow at 9:00 AM in the schedule timezone, or a custom time between 5 minutes and 30 days in the future.
- MVP-ACT-003: The user MUST be able to reschedule a one-time reminder or eligible occurrence.
- MVP-ACT-004: The user MUST be able to skip one recurring occurrence without cancelling its series.
- MVP-ACT-005: The user MUST be able to edit reminder content and schedule.
- MVP-ACT-006: Deleting a reminder MUST cancel its series immediately, make stale scheduled jobs ineligible to dispatch, and purge primary reminder content within 30 days.
- MVP-ACT-007: The mobile UI MUST require explicit confirmation before reminder deletion. Restore-after-confirmation is not an MVP capability.
- MVP-ACT-008: If two devices act on the same occurrence, the first valid terminal transition MUST win and later stale requests MUST return the current state without duplicating effects.

## 11. Bounded Follow-Up Nudge

- MVP-NUDGE-001: The product MUST allow a user to optionally enable exactly one additional nudge when an occurrence remains incomplete.
- MVP-NUDGE-002: The nudge MUST be off by default.
- MVP-NUDGE-003: The user MUST choose 15 minutes, 30 minutes, 1 hour, or a custom interval from 5 minutes through 24 hours.
- MVP-NUDGE-004: Completion, skip, deletion, cancellation, snooze, or reschedule MUST invalidate a stale nudge.
- MVP-NUDGE-005: A nudge due during quiet hours MUST follow the quiet-hours policy.
- MVP-NUDGE-006: The MVP MUST NOT create unbounded repeated notifications or arbitrary follow-up chains.
- MVP-NUDGE-007: The nudge is relative to the first eligible notification for the current effective schedule revision. Snooze or reschedule cancels the old nudge and may create one nudge for the new revision.

## 12. Mobile Information Architecture

The primary navigation MUST contain:

1. **Home:** Today, Upcoming, and Overdue.
2. **Create:** manual and natural-language capture.
3. **Completed:** recent completed and skipped occurrences.
4. **Settings:** account, timezone, notifications, privacy, and data controls.

- MVP-UI-001: Home MUST provide a prominent quick-create control.
- MVP-UI-002: Each list MUST provide loading, empty, error, offline/stale, and retry states.
- MVP-UI-003: Lists MUST use the user's locale and time format while preserving the schedule timezone where relevant.
- MVP-UI-004: Reminder detail MUST show content, effective schedule, recurrence, nudge, event history, and “Why now?”
- MVP-UI-005: Recurring reminders MUST show the next occurrence.
- MVP-UI-006: Destructive actions MUST clearly distinguish deleting a reminder from skipping one occurrence.

## 13. Notification Requirements

### 13.1 Channels

- MVP-NOT-001: MVP delivery channels are push and in-app only.
- MVP-NOT-002: Every active mobile installation MUST register a server-issued device registration linked to the authenticated account.
- MVP-NOT-003: Push tokens MUST be encrypted or equivalently protected at rest and MUST never appear in application logs.
- MVP-NOT-004: Logout, account deletion, provider invalid-token responses, and explicit device removal MUST revoke the affected registration.

### 13.2 Behavior

- MVP-NOT-005: Notifications MUST support deep links to the relevant reminder occurrence.
- MVP-NOT-006: Where the operating system permits, notification actions SHOULD include Done and Snooze.
- MVP-NOT-007: Notification actions MUST be authenticated or exchanged through a narrowly scoped, expiring action credential.
- MVP-NOT-008: A stale notification action MUST be idempotent and MUST display the current state after the app opens.
- MVP-NOT-009: Completing, skipping, snoozing, rescheduling, cancelling, or deleting MUST make earlier schedule revisions ineligible for dispatch.
- MVP-NOT-010: The product MUST distinguish queued, submitted, provider-accepted, provider-rejected, device-received/displayed when reported, opened, acted-on, failed, and expired states.
- MVP-NOT-011: The product MUST NOT label provider acceptance as confirmed device delivery.

### 13.3 Preferences

- MVP-PREF-001: The user MUST be able to define quiet hours that may cross midnight and MUST select their IANA timezone; the account timezone is the default.
- MVP-PREF-002: A notification due during quiet hours MUST be delayed until quiet hours end; multiple delayed notifications SHOULD be summarized where supported.
- MVP-PREF-003: The app MUST offer lock-screen previews of full content, title only, or a generic private message.
- MVP-PREF-004: Sound, vibration, and operating-system focus modes MUST be described as device-controlled when the app cannot override them.
- MVP-PREF-005: The user MUST be able to pause all reminder notifications without deleting reminders.
- MVP-PREF-006: Resuming a global pause MUST show one in-app summary of due/overdue occurrences and MUST NOT emit an individual push backlog.

### 13.4 Online cross-device synchronization

- MVP-SYNC-001: Every active registered device is eligible for push unless the user revokes it.
- MVP-SYNC-002: The app MUST refresh authoritative state on login, foreground, pull-to-refresh, a successful mutation, and a synchronization push.
- MVP-SYNC-003: Under normal online conditions, an accepted state change SHOULD become visible on another active device within 10 seconds.
- MVP-SYNC-004: A terminal action on one device MUST suppress undispatched attempts for other devices immediately at the server and cancel already scheduled reachable-device attempts on a best-effort basis.
- MVP-SYNC-005: A notification already displayed on another or offline device may remain visible; opening or acting on it MUST reconcile to the authoritative state without repeating effects.
- MVP-SYNC-006: The MVP MUST NOT present cached state as current when its last synchronization time is unknown.

## 14. History and Explainability

- MVP-HIST-001: The system MUST record immutable events for create, update, schedule change, notification attempt, snooze, completion, skip, cancel, and delete.
- MVP-HIST-002: Event metadata MUST avoid secrets and unnecessary reminder content.
- MVP-HIST-003: “Why now?” MUST be available for every notification and occurrence detail.
- MVP-HIST-004: The explanation MUST be deterministic, for example “Scheduled for Monday at 9:00 AM in Africa/Addis_Ababa” or “One follow-up nudge was requested.”
- MVP-HIST-005: Completed and skipped occurrences MUST remain visible in the mobile history for 90 days unless the user deletes the reminder or account sooner.

## 15. Conceptual Data Model

### User

- ID
- Email and verification state
- Password hash or managed-auth subject
- Locale and IANA timezone
- Session and deletion state
- Created and updated timestamps

### DeviceRegistration

- ID and user ID
- Platform and app version
- Protected push token
- Permission/capability state
- Locale, timezone, and last-seen time
- Revoked timestamp

### Reminder

- ID and user ID
- Title and optional context note
- Series lifecycle and revision
- Created, updated, and deleted timestamps

### Schedule

- ID and reminder ID
- Schedule type
- Original local start
- IANA timezone
- Recurrence rule within the MVP subset
- End date or occurrence count
- Current revision, optional superseded-schedule reference, and next evaluation time

### ReminderOccurrence

- ID, reminder ID, schedule ID, schedule revision, and stable recurrence-occurrence key
- Original and effective scheduled instants
- Lifecycle state
- Completed, skipped, or cancelled timestamp

### NudgePolicy

- Reminder ID and schedule revision
- Enabled state
- Interval from 5 minutes through 24 hours
- Notification-relative anchor
- Invalidated timestamp and reason

### ReminderEvent

- ID, reminder ID, optional occurrence ID
- Actor type and actor/device ID
- Event type and bounded metadata
- Idempotency key and timestamp

### NotificationAttempt

- ID, occurrence ID, device ID, and schedule revision
- Channel and nudge step
- Stable deduplication key
- Queued, submitted, provider-accepted/rejected, device-received/displayed where reported, failed, expired, opened, and acted timestamps
- Provider reference, bounded retry count, and sanitized error

### NotificationPreference

- User ID
- Quiet-hours window and timezone
- Lock-screen privacy setting
- Global pause state

## 16. API Contract Requirements

- MVP-API-001: A generated OpenAPI document MUST be the canonical server contract.
- MVP-API-002: The API MUST cover authentication, profile/data controls, device registration, reminders, schedules, occurrences/actions, events, preferences, and parsing.
- MVP-API-003: Authenticated endpoints MUST derive the user identity from the session; clients MUST NOT select `user_id`.
- MVP-API-004: Create and action endpoints MUST support idempotency keys.
- MVP-API-005: Mutable resources MUST expose a revision or ETag for optimistic concurrency.
- MVP-API-006: Collection endpoints MUST use stable cursor pagination and documented filters.
- MVP-API-007: Errors MUST use one versioned shape containing a stable code, human-readable message, request ID, and optional field details.
- MVP-API-008: The server MUST reject unknown fields where accepting them could change scheduling or authorization semantics.
- MVP-API-009: Request bodies, titles, notes, recurrence values, and custom snooze durations MUST have documented bounds.

Minimum resource groups:

```text
/auth
/me
/devices
/reminders
/reminder-occurrences
/reminder-events
/notification-preferences
/parse-reminder
```

Exact paths and payloads belong in the generated OpenAPI contract.

## 17. Background Processing and Reliability

- MVP-REL-001: The primary database MUST be the authoritative source for schedules and state.
- MVP-REL-002: Reminder mutation and durable scheduling intent MUST be committed atomically through a transactional outbox or equivalent pattern.
- MVP-REL-003: Workers MUST use leases or visibility timeouts so abandoned jobs can be recovered.
- MVP-REL-004: Processing MUST be at-least-once and all internal effects MUST be idempotent.
- MVP-REL-005: A stable deduplication key MUST include occurrence, channel, device, nudge step, and schedule revision.
- MVP-REL-006: A worker MUST recheck occurrence state and schedule revision immediately before dispatch.
- MVP-REL-007: Retries MUST be bounded, use backoff and jitter, and end in a queryable dead-letter state.
- MVP-REL-008: A reconciliation process MUST detect missing jobs, expired leases, and occurrences left without a terminal processing outcome.
- MVP-REL-009: Queue state MUST be rebuildable from authoritative database state.
- MVP-REL-010: Downtime recovery MUST follow a documented catch-up policy; stale occurrences MUST not generate an uncontrolled burst.
- MVP-REL-011: At least 99% of eligible due occurrences SHOULD be submitted to the configured notification provider within 60 seconds, measured monthly and excluding documented provider outages and invalid or disabled device tokens.
- MVP-REL-012: A single worker crash MUST NOT lose an accepted schedule.
- MVP-REL-013: Operational alerts MUST cover scheduling lag, dispatch lag, retry exhaustion, dead-letter growth, invalid-token spikes, and recurrence expansion failures.
- MVP-REL-014: After downtime, each still-incomplete occurrence delayed by no more than 24 hours MUST receive exactly one late push when push remains eligible. Older occurrences remain visible as overdue but MUST NOT generate an individual push backlog.

## 18. Security and Privacy

- MVP-SEC-001: Every user-owned query and mutation MUST enforce ownership for reminders, schedules, occurrences, events, devices, and notification attempts.
- MVP-SEC-002: Passwords MUST be processed using an established adaptive password-hashing algorithm.
- MVP-SEC-003: Transport encryption MUST be required for client, provider, and administrative connections.
- MVP-SEC-004: Reset, verification, refresh, and notification-action credentials MUST be one-time or replay-resistant, scoped, expiring, and protected at rest.
- MVP-SEC-005: Reminder text, notification tokens, credentials, and full parse input MUST not be written to ordinary logs or analytics.
- MVP-SEC-006: AI or parser output MUST be treated as untrusted input.
- MVP-SEC-007: Users MUST be told when reminder content is sent to an external AI provider and MUST be able to use manual creation without doing so.
- MVP-SEC-008: External AI providers MUST be configured for the minimum supported retention and no training on user content where provider controls allow it.
- MVP-SEC-009: Analytics MUST use pseudonymous identifiers and MUST not include reminder titles or notes.
- MVP-SEC-010: The application MUST provide lock-screen privacy controls before showing sensitive reminder content.
- MVP-SEC-011: Account deletion and export behavior MUST be documented, testable, and propagated to relevant processors.
- MVP-SEC-012: Security-sensitive errors MUST be sanitized while remaining diagnosable through request IDs.
- MVP-SEC-013: Cached reminders, saved drafts, and synchronization metadata MUST use encrypted local persistence and be excluded from unprotected device backups.
- MVP-SEC-014: Logout, account switching, device revocation, and account deletion MUST wipe or cryptographically isolate cached user data and saved drafts on the affected device at its next trusted contact.

## 19. Accessibility and Localization

- MVP-ACC-001: All flows MUST support native screen readers, logical focus order, accessible names, and dynamic text.
- MVP-ACC-002: Meaning MUST NOT depend on color, sound, gesture, or iconography alone.
- MVP-ACC-003: Interactive targets MUST follow platform accessibility-size guidance.
- MVP-ACC-004: Text and controls MUST meet applicable AA contrast expectations.
- MVP-ACC-005: Animations MUST honor reduced-motion settings.
- MVP-ACC-006: Date/time content MUST be announced unambiguously with timezone when relevant.
- MVP-ACC-007: Parser success, ambiguity, validation failure, creation success, and action results MUST be announced to assistive technology.
- MVP-ACC-008: English is the initial content language; architecture MUST allow additional locales without changing stored schedule semantics.

## 20. Analytics and Success Measures

Analytics MUST record product events without reminder content.

Required measures:

- Median time from opening Create to confirmed reminder
- Manual versus natural-language creation rate
- Parse failure and parse-correction rate for supported phrases
- Notification permission opt-in rate
- Eligible occurrence submission latency
- Provider rejection and invalid-token rate
- Duplicate notification-attempt rate
- Percentage of occurrences acted on within 15 minutes and 24 hours
- Completion rate with and without the optional nudge
- Snooze rate
- Daily and weekly active users
- Day-7 retention

Each metric MUST define its denominator, exclusion rules, attribution window, and whether recurring series or individual occurrences are counted.

## 21. Acceptance Scenarios

### MVP-AC-001 — Confirm natural-language schedule

Given a user whose timezone is `Africa/Addis_Ababa`, when they enter “Remind me tomorrow at 9 to call John,” the app shows the exact date, 9:00 AM, timezone, title, and recurrence before saving.

### MVP-AC-002 — Resolve ambiguity

Given input without an exact required time or with multiple materially different valid interpretations, the app asks a clarification or shows alternatives and creates nothing until the user confirms.

### MVP-AC-003 — Manual fallback

Given the parser is unavailable or AI processing is disabled, the draft remains available and the user can create the same supported reminder through the manual form.

### MVP-AC-004 — Permission denied

Given push permission is denied, creating a reminder still succeeds, the due occurrence appears in-app, and the app explains that background push is unavailable.

### MVP-AC-005 — Stale dispatch invalidation

Given an occurrence has been snoozed, rescheduled, completed, skipped, or deleted, a queued job for an older schedule revision cannot send.

### MVP-AC-006 — Worker replay

Given the same worker job is executed more than once, one logical notification attempt and one effective action result are recorded for its deduplication key.

### MVP-AC-007 — Recurring occurrence action

Given a weekly series, completing or skipping today's occurrence does not complete, skip, or move the next occurrence.

### MVP-AC-008 — Concurrent devices

Given two devices act on the same occurrence, duplicate taps are harmless and a stale conflicting action receives the authoritative current state.

### MVP-AC-009 — Quiet hours

Given an occurrence becomes due during quiet hours, it is visible as due in the app and its push notification is delayed until quiet hours end without creating multiple delayed copies.

### MVP-AC-010 — Account deletion

Given account deletion is confirmed, sessions and devices are revoked and pending schedules become ineligible before the deletion request returns success.

### MVP-AC-011 — Accessibility

Registration, onboarding, create/preview, Home, reminder detail, settings, and notification-action flows MUST pass automated accessibility checks plus manual VoiceOver and TalkBack verification.

### MVP-AC-012 — DST gap and overlap

Given a schedule time falls in a DST gap or repeated hour, the app applies the rule in MVP-TIME-006, shows the exact resolved instant before confirmation, and creates one occurrence.

### MVP-AC-013 — Future-series edit

Given a recurring reminder with history, editing the selected and future occurrences creates a new schedule revision, preserves historical occurrence identity, and invalidates future jobs from the superseded revision.

### MVP-AC-014 — Snooze and nudge

Given an occurrence has a pending nudge, snoozing or rescheduling invalidates that nudge and allows at most one new nudge for the new effective schedule revision.

### MVP-AC-015 — Offline draft boundary

Given the device is offline, a creation attempt is stored only as an encrypted unsent draft, is labelled unsent, and cannot appear as an active reminder until server confirmation.

### MVP-AC-016 — Cross-device action

Given two online registered devices receive the same occurrence, completing it on one suppresses undispatched attempts and causes a stale notification action on the other to show the completed authoritative state.

### MVP-AC-017 — Global pause

Given notifications were globally paused while occurrences became due, resuming shows the overdue occurrences and does not emit an individual push for every paused occurrence.

### MVP-AC-018 — Cache cleanup

Given logout, account switching, device revocation, or account deletion, cached data and saved drafts are wiped or cryptographically isolated and cannot be read by the next account.

### MVP-AC-019 — Supported grammar and warning

Given input containing a supported time clause plus an unsupported location or device clause, the preview retains the unsupported text as a warning and creates nothing until the user explicitly removes or changes it.

### MVP-AC-020 — Late recovery

Given worker downtime, an eligible incomplete occurrence no more than 24 hours late receives at most one late push, while older occurrences appear overdue without a notification burst.

## 22. MVP-to-Completed-Product Traceability

| MVP requirement family | Completed-product family |
| --- | --- |
| MVP-PLAT | PROD-PLAT |
| MVP-AUTH | PROD-AUTH |
| MVP-ONB | PROD-PREF, PROD-PRIV |
| MVP-CAP, MVP-NLP | PROD-CAP, PROD-NLP |
| MVP-TIME | PROD-TIME, PROD-REC, PROD-TZ |
| MVP-LIFE, MVP-ACT | PROD-LIFE |
| MVP-NUDGE | PROD-ESC |
| MVP-UI | PROD-VIEW |
| MVP-NOT, MVP-PREF | PROD-CHAN, PROD-PREF |
| MVP-SYNC | PROD-OFF, PROD-API |
| MVP-HIST | PROD-HIST, PROD-WHY |
| MVP-API | PROD-API |
| MVP-REL | PROD-REL |
| MVP-SEC | PROD-SEC, PROD-PRIV |
| MVP-ACC | PROD-ACC, PROD-LOCN |

## 23. Release Gates

The MVP is releasable only when:

1. Every `MVP-*` requirement is mapped to implementation and evidence.
2. The generated API contract matches the deployed API.
3. Unit, integration, recurrence/timezone, worker crash/replay, concurrency, and notification-provider tests pass.
4. Supported Android and iOS versions pass the critical journey matrix.
5. Notification dispatch SLO instrumentation and alerts are live.
6. Account deletion, export, permission denial, parser failure, and worker recovery have been exercised in a production-like environment.
7. Security and privacy review has no unresolved release-blocking finding.
8. Accessibility verification covers both VoiceOver and TalkBack.
9. Known provider or operating-system limitations are documented in release notes and user-facing help.
