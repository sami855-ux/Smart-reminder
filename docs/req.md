# Smart Reminder Mobile — Completed Product Requirements

## Document Control

- **Status:** Target completed-product specification
- **Version:** 2.0
- **Last updated:** 2026-09-24
- **Product:** Smart Reminder
- **User-facing clients:** Android and iOS mobile applications only
- **First-release scope:** [MVP Requirements](MVP_REQUIREMENTS.md)

This document defines the completed Smart Reminder product. Every capability in the release matrix is a product commitment unless a later product decision explicitly changes this specification. The MVP document defines the smaller first build; deferral from the MVP does not remove a feature from the completed product.

## 1. Requirement Language and Traceability

- **MUST** indicates a completed-product requirement.
- **SHOULD** indicates expected behavior that may vary only because of a documented platform or provider constraint.
- **MAY** indicates optional enhancement.

Primary testable requirements use stable identifiers. Nested acceptance statements inherit the closest requirement or section identifier. Implementation status MUST be tracked separately as:

- Not started
- In progress
- Implemented
- Verified in a test environment
- Verified on supported Android devices
- Verified on supported iOS devices
- Blocked by a documented external constraint

Traceability MUST map each requirement identifier to its data model, API or device contract, implementation, automated test, runtime verification evidence, environment, date, and known limitation.

## 2. Product Vision

Smart Reminder is a personal mobile reminder and follow-through application designed to help users remember and complete things, not merely display a notification at a fixed time.

The completed product combines:

- Fast manual and natural-language capture
- Time, recurrence, location, device, inactivity, and integration triggers
- Behavioral smart scheduling and calendar-conflict detection
- Context-preserving reminders
- Arbitrary follow-up workflows
- Multi-step escalation policies
- AI summaries and recommendations
- Mobile calendar and agenda views
- Multi-channel notification delivery
- Offline-first mutation and deterministic conflict handling
- Secure, revocable external integrations

The core product statement is:

> Smart Reminder helps users remember things when they actually matter, with enough context and persistence to act.

## 3. Product Goals

The completed product MUST enable a user to:

1. Capture a reminder in seconds.
2. Use either a structured form or natural language.
3. Understand the exact schedule before saving.
4. Use one-time and simple or advanced recurrence.
5. Trigger reminders from time, place, device context, inactivity, another reminder, or a verified integration event.
6. Complete, snooze, reschedule, skip, pause, cancel, archive, or delete as appropriate.
7. Create conditional multi-step follow-up workflows.
8. Configure bounded multi-channel escalation.
9. Receive explainable smart-time and conflict-aware suggestions.
10. Preserve useful context and history.
11. Work offline and reconcile safely across mobile devices.
12. Search and organize a large reminder history.
13. Control notifications, permissions, AI processing, integrations, privacy, and data retention.
14. Receive honest capability and delivery status instead of false guarantees.

## 4. Product and Platform Boundary

### 4.1 Mobile-only user experience

- PROD-PLAT-001: Smart Reminder MUST provide user-facing Android and iOS applications.
- PROD-PLAT-002: No end-user web or desktop application is in scope for this specification; every end-user workflow MUST be delivered through Android or iOS.
- PROD-PLAT-003: The product MUST provide the backend APIs, databases, workers, and provider connections required for durable scheduling, cross-device state, remote delivery, synchronization, AI, and integrations. Operational consoles MAY exist for authorized support.
- PROD-PLAT-004: All end-user capabilities in this document MUST be accessible from mobile unless an operating system or external provider makes a capability unavailable.

### 4.2 Capability-aware behavior

- PROD-PLAT-005: The app MUST maintain a runtime capability matrix for permissions, background execution, sensors, provider availability, and supported trigger types.
- PROD-PLAT-006: A feature MUST NOT appear enabled when the current device or OS cannot provide its required signal.
- PROD-PLAT-007: When a requested capability is unavailable, the app MUST explain why and offer a supported alternative where possible.
- PROD-PLAT-008: The product MUST NOT claim guaranteed background detection or notification display when the operating system or provider does not guarantee it.
- PROD-PLAT-009: Platform-specific behavior and minimum supported OS versions MUST be documented and runtime-tested.

## 5. Target Users

### 5.1 Primary users

Individuals and solo professionals who manage appointments, deadlines, routines, calls, documents, and follow-ups.

### 5.2 Secondary users

- Students managing study plans, exams, and application deadlines
- Freelancers managing proposals and client follow-ups
- Managers, recruiters, and sales professionals tracking response-dependent work
- Users building location- or device-context routines

The product is personal rather than collaborative. Team assignment and enterprise administration are outside the completed-product scope unless added by a later requirements decision.

## 6. Product Principles

1. **Fast:** common reminder creation takes seconds.
2. **Explicit:** the user sees exactly what will trigger and what will happen.
3. **Reliable:** durable state survives crashes, retries, provider failures, and reconnection.
4. **Contextual:** reminders retain enough information to remain meaningful.
5. **Persistent but respectful:** escalation is bounded, visible, and controlled.
6. **Explainable:** smart behavior and trigger reasons are inspectable.
7. **Private:** sensitive content, location, device context, and integration data are minimized.
8. **Offline-capable:** loss of connectivity does not silently lose user intent.
9. **Accessible:** every primary flow works with native accessibility services.
10. **User-controlled:** AI and automation assist but do not silently perform consequential actions.

## 7. Product Non-Goals

The completed product is not:

- A team project-management system
- An enterprise workforce administration platform
- A full replacement for a user's calendar
- A social network
- A safety-critical emergency-alert service
- A system that autonomously sends messages, contacts people, or performs financial transactions without confirmation
- A guarantee that a third-party provider or mobile operating system displayed a notification

## 8. Delivery Phases

The order below controls scope, not whether a feature belongs in the completed product.

| Capability | MVP | Release 2 | Release 3 / Completed |
| --- | --- | --- | --- |
| Account lifecycle and mobile onboarding | Required | Enhanced | Required |
| Manual and natural-language capture | Required | Enhanced | Required |
| One-time, daily, weekly recurrence | Required | Required | Required |
| One bounded unfinished nudge | Required | Required | Superseded by policies |
| Push and in-app delivery | Required | Required | Required |
| Local-device offline notification | Deferred | Partial | Required |
| Location arrival/departure triggers | Deferred | Required | Required |
| Monthly, yearly, and custom recurrence | Deferred | Required | Required |
| Mobile day/week/month calendar views | Deferred | Required | Required |
| Categories, tags, priority, and advanced search | Deferred | Required | Required |
| External calendar connection and conflict detection | Deferred | Required | Required |
| Email reminder delivery | Deferred | Required | Required |
| Basic linked follow-ups | Deferred | Required | Required |
| Bluetooth, Wi-Fi, and device triggers | Deferred | Optional preview | Required |
| Inactivity triggers | Deferred | Optional preview | Required |
| Arbitrary conditional follow-up chains | Deferred | Partial | Required |
| Multi-step escalation policies | Deferred | Partial | Required |
| Behavioral smart scheduling | Deferred | Partial | Required |
| AI summarization and behavioral recommendations | Deferred | Partial | Required |
| SMS, WhatsApp, and Telegram delivery | Deferred | Partial | Required |
| Offline writes and advanced conflict resolution | Deferred | Partial | Required |
| General external integrations | Deferred | Partial | Required |

The completed product is achieved only when every “Required” completed-column capability has passed its acceptance, security, privacy, accessibility, and supported-device verification.

## 9. Core Domain Model

### 9.1 Reminder

A Reminder is user-owned content and intent. It contains a title, optional context, organizational metadata, and one or more schedules or workflow relationships.

There is no separate Task entity. Completion and skip behavior apply to Reminder Occurrences.

### 9.2 Schedule

A Schedule defines how future occurrences are produced. It records its time basis, timezone where applicable, recurrence, trigger configuration, revision, and active state.

### 9.3 Reminder Occurrence

A Reminder Occurrence is one actionable instance generated from a reminder and schedule or workflow step. Each occurrence has its own effective time, lifecycle, notification state, and action history.

### 9.4 Trigger

A Trigger is an evaluable condition that can create or activate an occurrence. Trigger types include:

- Absolute time
- Relative elapsed time
- Recurrence rule
- Location arrival or departure
- Bluetooth connection or disconnection
- Wi-Fi connection or disconnection
- Supported device event
- Defined inactivity
- Completion or other event from a reminder
- Manual outcome
- Verified external integration event

### 9.5 Follow-up Workflow

A Follow-up Workflow is a versioned, validated, acyclic graph of reminder, delay, condition, branch, and terminal steps.

### 9.6 Escalation Policy

An Escalation Policy is an ordered set of notification steps with delays, channels, stop conditions, quiet-hours behavior, and a bounded maximum.

### 9.7 Notification and Delivery Attempt

A Notification describes intended user communication. A Delivery Attempt records one channel/provider/device submission and its observable result.

### 9.8 Reminder Event

A Reminder Event is an immutable audit record of a user, system, device, workflow, integration, or provider action.

### 9.9 Device and Integration Connection

A Device Registration represents a mobile installation and its capabilities. An Integration Connection represents a user-authorized external provider and its scoped credentials.

## 10. Lifecycle Requirements

### 10.1 Series lifecycle

Allowed reminder-series states:

```text
ACTIVE
PAUSED
CANCELLED
ARCHIVED
```

- PROD-LIFE-001: State transitions MUST be explicitly validated.
- PROD-LIFE-002: Pausing a series MUST make future occurrences ineligible for new dispatch until resumed.
- PROD-LIFE-003: Cancelling MUST preserve history while preventing future occurrences.
- PROD-LIFE-004: Archiving MUST remove a reminder from active views without erasing its history. An active finite series MUST archive automatically only after its final occurrence reaches a terminal state and no future occurrence remains; a user who wants to stop a series with future occurrences MUST cancel it.
- PROD-LIFE-010: Valid series transitions are `ACTIVE ↔ PAUSED`, `ACTIVE/PAUSED → CANCELLED`, `ACTIVE → ARCHIVED` only when no future occurrence remains, and `CANCELLED → ARCHIVED`. Cancelled and archived series do not resume; restoring one MUST create a new active revision.

### 10.2 Occurrence lifecycle

Allowed occurrence states:

```text
SCHEDULED
COMPLETED
SKIPPED
CANCELLED
EXPIRED
```

- PROD-LIFE-005: Due, overdue, and snoozed MUST be derived presentation states, not conflicting durable lifecycle values.
- PROD-LIFE-006: Snooze MUST preserve the original due time and record a new effective time.
- PROD-LIFE-007: Terminal transitions MUST be idempotent.
- PROD-LIFE-008: Competing device actions MUST return the authoritative current state.
- PROD-LIFE-009: Completing or skipping one recurring occurrence MUST NOT silently terminate its series.
- PROD-LIFE-011: Valid occurrence transitions are `SCHEDULED → COMPLETED/SKIPPED/CANCELLED/EXPIRED`. A user MAY explicitly complete an occurrence early; terminal occurrences MUST not be silently reopened.
- PROD-LIFE-012: Cancelling or deleting a series MUST cancel all nonterminal future occurrences and make their pending delivery or escalation work ineligible.
- PROD-LIFE-013: Unless a reminder or workflow defines a different useful-life policy, an incomplete occurrence becomes `EXPIRED` 30 days after its effective due time. Expiration MUST retain history and MUST NOT delete content.

### 10.3 Trigger and workflow lifecycle

- PROD-LIFE-014: Trigger states MUST include active, paused, unavailable, fired where one-shot, and cancelled.
- PROD-LIFE-015: Workflow states MUST include draft, active, paused, completed, cancelled, and failed.
- PROD-LIFE-016: A trigger becoming unavailable because of permission, device, OS, or provider state MUST be visible and actionable.

## 11. Account, Identity, and Data Controls

- PROD-AUTH-001: Users MUST be able to register, verify identity, log in, refresh a session, log out of one or all devices, recover access, and delete the account.
- PROD-AUTH-002: The product MUST support secure password authentication and MAY support Apple, Google, or other approved identity providers.
- PROD-AUTH-003: Access, refresh, and inactivity expiration MUST be independently defined.
- PROD-AUTH-004: Refresh credentials MUST rotate; detected reuse MUST revoke the affected credential family.
- PROD-AUTH-005: The user MUST be able to view and revoke registered devices and integration connections.
- PROD-AUTH-006: The user MUST be able to export reminders, schedules, workflows, events, preferences, and integration metadata in documented formats.
- PROD-AUTH-007: Account deletion MUST immediately disable server-side schedules, remote delivery, workflows, sessions, devices, and queued work. Reachable devices MUST cancel local work immediately; offline devices MUST cancel and purge local work at their next trusted contact.
- PROD-AUTH-008: Account discovery, verification, and recovery responses MUST resist enumeration and abuse.

## 12. Reminder Capture

### 12.1 Manual capture

- PROD-CAP-001: The user MUST be able to create a reminder with a title, context, one or more supported triggers, recurrence, organization, and notification behavior.
- PROD-CAP-002: The app MUST provide a compact default form and progressively disclose advanced fields.
- PROD-CAP-003: Every trigger MUST provide a human-readable preview before activation.
- PROD-CAP-004: Unsupported or unavailable trigger combinations MUST be rejected with a corrective explanation.
- PROD-CAP-005: Duplicate submissions MUST be idempotent.
- PROD-CAP-006: Multiple independent triggers use `ANY` semantics by default and each may create an occurrence. Users MAY create an `ALL` condition group with an explicit evaluation window; the UI MUST show that composition before activation.
- PROD-CAP-007: Trigger events that represent the same logical activation MUST share a deduplication key and cooldown so simultaneous signals do not create duplicate occurrences.
- PROD-CAP-008: A fallback time trigger MUST be identified as a fallback and MUST not silently operate as another independent trigger.

### 12.2 Natural-language capture

- PROD-NLP-001: Natural-language capture MUST support the product's enabled time, recurrence, location, device, inactivity, workflow, and integration vocabulary.
- PROD-NLP-002: Parsing MUST use the original text, reference instant, locale, IANA timezone, user preferences, and available capability set.
- PROD-NLP-003: Structured output MUST include proposed fields, confidence by field, ambiguity, warnings, unsupported clauses, and alternatives.
- PROD-NLP-004: The app MUST show an editable structured preview before creation.
- PROD-NLP-005: Ambiguous or unsupported input MUST not silently create a different reminder.
- PROD-NLP-006: Manual creation MUST remain available when AI is disabled, unavailable, or rate-limited.
- PROD-NLP-007: The parser MUST distinguish “when Wi-Fi connects” from “at a time,” “after completion” from “after creation,” and wall-clock time from elapsed duration.

## 13. Time-Based and Recurring Scheduling

- PROD-TIME-001: The product MUST support absolute date/time and relative elapsed-duration reminders.
- PROD-TIME-002: Civil-time schedules MUST store the original local value, IANA timezone, time basis, and resolved UTC instant.
- PROD-TIME-003: Relative durations MUST preserve their reference event and elapsed-duration semantics.
- PROD-REC-001: Recurrence MUST support daily, weekly, monthly, and yearly frequency; interval; selected weekdays; positive or negative month days; selected months; nth or last weekday; count or inclusive-until limits; and included or excluded exception dates.
- PROD-REC-002: Recurrence MUST support start, count, until, exclusions, included exceptions, and pause/resume.
- PROD-REC-003: The implementation SHOULD use a validated recurrence representation equivalent to `DTSTART + TZID + RRULE + EXDATE/RDATE`.
- PROD-REC-004: Users MUST be able to edit one occurrence, this and future occurrences, or the whole series where valid.
- PROD-REC-005: The UI MUST preview the next occurrences before saving an advanced rule.
- PROD-REC-006: Leap day, short month, DST gap/fold, timezone change, and missed-occurrence policies MUST be explicit and tested.

## 14. Context and Organization

- PROD-ORG-001: Reminders MUST support an optional context note and source links.
- PROD-ORG-002: Users MUST be able to create, edit, merge, and delete personal categories.
- PROD-ORG-003: Reminders MUST support tags.
- PROD-ORG-004: Priority values MUST be `LOW`, `NORMAL`, `HIGH`, and `URGENT`.
- PROD-ORG-005: Priority MUST affect behavior only through user-visible, configurable rules.
- PROD-ORG-006: Advanced search MUST support text, category, tag, priority, lifecycle, trigger type, date range, workflow, channel, and completion state.
- PROD-ORG-007: Search MUST be scoped to the authenticated user and MUST work against synchronized local data when offline.
- PROD-ORG-008: Search ranking and filters MUST not silently hide overdue or conflict-state reminders.

## 15. Location Triggers

- PROD-LOC-001: Users MUST be able to save a named location with a geofence center and radius.
- PROD-LOC-002: A reminder MUST support arrival and departure triggers.
- PROD-LOC-003: Location permission MUST be requested contextually and separately from notification permission.
- PROD-LOC-004: The app MUST disclose foreground/background permission state, battery implications, and platform capability.
- PROD-LOC-005: Geofence events MUST use debounce, dwell, cooldown, and duplicate-suppression rules.
- PROD-LOC-006: The user MUST be able to inspect the location, radius, trigger direction, last evaluation, and “Why now?” evidence.
- PROD-LOC-007: Revoked permission or disabled location services MUST mark the trigger unavailable and notify the user without deleting it.
- PROD-LOC-008: Precise coordinates MUST be collected only when required, protected at rest, excluded from ordinary logs and analytics, and removed on deletion.

## 16. Bluetooth, Wi-Fi, and Device Triggers

### 16.1 Shared device-trigger contract

- PROD-DEV-001: Every device trigger MUST name its signal, owning device, required permission, evaluation owner, cooldown, and supported foreground/background modes.
- PROD-DEV-002: Only allowlisted operating-system signals MAY be used.
- PROD-DEV-003: Trigger creation MUST query live device capability and MUST not promise an unavailable background mode.
- PROD-DEV-004: A device event MUST include a deduplication key and bounded timestamp skew policy.
- PROD-DEV-005: Repeated connect/disconnect flapping MUST be debounced.

### 16.2 Bluetooth

- PROD-BT-001: Users MUST be able to select a permitted Bluetooth device and trigger on connect or disconnect where the OS exposes the event.
- PROD-BT-002: Device identifiers MUST be protected and displayed with a user-recognizable label.
- PROD-BT-003: Bluetooth permission denial, disabled radio state, or unsupported background observation MUST produce an unavailable state and fallback guidance.

### 16.3 Wi-Fi

- PROD-WIFI-001: Users MUST be able to select a permitted Wi-Fi network and trigger on connect or disconnect where the OS exposes the event.
- PROD-WIFI-002: Network identifiers MUST be treated as sensitive context and MUST not enter ordinary logs or analytics.
- PROD-WIFI-003: Location or nearby-device permissions indirectly required by an OS MUST be explained before request.
- PROD-WIFI-004: The app MUST distinguish an unknown network state from a confirmed disconnect.

### 16.4 Other device events

- PROD-DEVICE-001: The completed product MUST support an explicitly documented device-signal catalog containing, at minimum, charging connection/disconnection, battery-threshold, app-open, and supported headset/accessory events where the operating system exposes them.
- PROD-DEVICE-002: Each catalog entry MUST have platform capability, permission, battery, background, privacy, and verification requirements.
- PROD-DEVICE-003: Adding a new device-signal type MUST not bypass the shared trigger validation and audit contract.

## 17. Inactivity Triggers

- PROD-INACT-001: Users MUST be able to create an inactivity trigger by selecting its monitored subject, source, qualifying activity events, reset events, duration, and evaluation cadence.
- PROD-INACT-002: “I have not worked on this” MUST never be inferred without a selected, measurable source.
- PROD-INACT-003: Inactivity MUST support Smart Reminder activity as a source and MAY use an authorized external integration when that integration defines qualifying events and freshness.
- PROD-INACT-004: Stale, disconnected, or delayed external data MUST not be treated as proof of inactivity without a visible warning.
- PROD-INACT-005: The user MUST see the last qualifying activity and the calculation behind “Why now?”
- PROD-INACT-006: Inactivity evaluation MUST be idempotent and rate-limited.

## 18. Follow-Up Workflows

- PROD-FLOW-001: Users MUST be able to create arbitrary user-defined follow-up chains within published safety and resource limits.
- PROD-FLOW-002: Workflow steps MUST support reminders, delays, manual outcome waits, verified integration-event waits, conditions, branches, and terminal outcomes.
- PROD-FLOW-003: Workflows MUST be acyclic; activation MUST reject loops, unreachable nodes, invalid references, and missing terminal behavior.
- PROD-FLOW-004: A delay MUST state which event starts its clock.
- PROD-FLOW-005: A condition such as “if the client did not respond” MUST identify a manual outcome or verified integration source; absence of an integration event alone MUST not be misrepresented as proof.
- PROD-FLOW-006: Users MUST be able to preview, activate, pause, resume, version, edit, duplicate, and cancel workflows.
- PROD-FLOW-007: Editing an active workflow MUST state whether existing runs keep the old version or migrate.
- PROD-FLOW-008: Cancellation and completion propagation MUST be explicit per edge and step.
- PROD-FLOW-009: Each workflow run and step MUST expose status, input evidence, due time, output, retry state, and history.
- PROD-FLOW-010: Resource limits MUST prevent accidental infinite waiting, notification spam, or uncontrolled workflow growth without preventing flexible branching.

## 19. Multi-Step Escalation

- PROD-ESC-001: Users MUST be able to attach a bounded escalation policy to eligible reminders or workflow steps.
- PROD-ESC-002: Each step MUST define delay or time, channel, message/privacy template, and stop condition.
- PROD-ESC-003: Completion, skip, cancellation, deletion, or a configured acknowledgement MUST stop remaining eligible steps.
- PROD-ESC-004: Quiet hours, channel opt-in, cost, provider limits, and operating-system restrictions MUST be applied to every step.
- PROD-ESC-005: The app MUST preview the escalation timeline and maximum number of notifications before activation.
- PROD-ESC-006: An escalation MUST have service-enforced maximum steps, minimum interval, daily cap, and total lifetime.
- PROD-ESC-007: Failed-channel fallback MUST be explicit; a provider-accepted message MUST not automatically trigger fallback as though delivery failed.
- PROD-ESC-008: Users MUST be able to pause or cancel escalation independently when product semantics allow it.

## 20. Behavioral Smart Scheduling

- PROD-SMART-001: With explicit opt-in, the completed product MUST support learning from completion, snooze, user-confirmed or operating-system-reported dismissal, quiet-hour, calendar, and selected context history. Missing telemetry MUST NOT be inferred as dismissal.
- PROD-SMART-002: Smart scheduling MUST offer suggestions; it MUST not silently change an existing deadline or trigger.
- PROD-SMART-003: Every suggestion MUST explain its principal reason, such as observed completion time or a calendar conflict.
- PROD-SMART-004: The user MUST be able to accept, edit, reject, dismiss future suggestions of a type, or disable behavioral processing.
- PROD-SMART-005: Rejected suggestions MUST not be repeatedly shown without materially new evidence.
- PROD-SMART-006: Sensitive content MUST not be required where timestamps and action outcomes are sufficient.
- PROD-SMART-007: Users MUST be able to delete behavioral history independently where technically and legally supported.
- PROD-SMART-008: Recommendation quality, correction rate, and outcome impact MUST be measured without placing reminder content in analytics.

## 21. Calendar Connections and Conflict Detection

- PROD-CAL-001: Users MUST be able to authorize supported external calendars with least-privilege scopes.
- PROD-CAL-002: The product MUST distinguish read-only availability access from permission to create or edit external events.
- PROD-CAL-003: Conflict detection MUST consider selected calendars, event visibility, travel buffers if configured, and data freshness.
- PROD-CAL-004: Private calendar content SHOULD be reduced to busy/free data when titles and details are unnecessary.
- PROD-CAL-005: A conflict MUST produce an explanation and alternatives; it MUST not silently reschedule.
- PROD-CAL-006: Disconnected, stale, rate-limited, or partially synchronized calendars MUST be visibly marked.
- PROD-CAL-007: The user MUST be able to exclude calendars and recurring event classes from suggestions.
- PROD-CAL-008: Disconnecting a calendar MUST revoke credentials and define what happens to reminders derived from its events.

## 22. AI Summarization and Recommendations

- PROD-AI-001: The completed product MUST support AI-assisted parsing, context/history summarization, suggestions for time, recurrence, priority, category, workflow, or escalation, and pattern explanations.
- PROD-AI-002: Summaries MUST cite the user-owned events or connected sources they summarize inside the product experience.
- PROD-AI-003: Generated facts not supported by source data MUST be presented as uncertain or omitted.
- PROD-AI-004: AI output MUST be schema-validated, bounded, and treated as untrusted.
- PROD-AI-005: AI MUST NOT silently delete, complete, reschedule, contact a person, send a message, connect an account, or perform an external action.
- PROD-AI-006: Consequential suggestions MUST require explicit confirmation showing the exact change.
- PROD-AI-007: Users MUST be able to disable optional AI processing while retaining manual features.
- PROD-AI-008: Provider, region, content sent, retention, and training-use policy MUST be disclosed.
- PROD-AI-009: Model/prompt versions and evaluation results MUST be recorded for supported parse and recommendation behaviors.
- PROD-AI-010: AI failure MUST degrade to deterministic/manual behavior rather than block core reminder actions.

## 23. Mobile Agenda, Calendar, and Search Views

- PROD-VIEW-001: Home MUST show Today, Upcoming, Overdue, active workflows, and a quick-create action.
- PROD-VIEW-002: The app MUST provide Day, Week, and Month calendar views.
- PROD-VIEW-003: Calendar cells MUST show enough information to identify conflicts and reminder density without exposing hidden content.
- PROD-VIEW-004: Every calendar view MUST have an accessible agenda/list alternative.
- PROD-VIEW-005: Calendar navigation MUST clearly show the display timezone and any reminder scheduled in another timezone.
- PROD-VIEW-006: Search and filters MUST be reachable from mobile navigation and preserve user-selected filter state.
- PROD-VIEW-007: Loading, empty, error, offline/stale, permission-limited, no-results, and conflict states MUST be designed for all primary views.
- PROD-VIEW-008: Reminder detail MUST show content, trigger evidence, schedule, workflow/escalation context, next occurrences, delivery state, “Why now?”, and history.

## 24. Notification Channels

### 24.1 Required completed-product channels

The completed product MUST support:

- Local device notification
- Push notification
- In-app notification
- Email
- SMS
- WhatsApp
- Telegram

### 24.2 Channel contract

- PROD-CHAN-001: Every external destination MUST be verified or explicitly authorized before reminder delivery.
- PROD-CHAN-002: Marketing consent MUST remain separate from transactional reminder consent.
- PROD-CHAN-003: Channel templates MUST support locale, timezone, privacy mode, safe truncation, and deep links where available.
- PROD-CHAN-004: Users MUST see channel availability, verification, opt-in, rate-limit, provider, and recent failure state.
- PROD-CHAN-005: Paid or metered channels MUST disclose applicable cost or plan limits before activation.
- PROD-CHAN-006: SMS and messaging channels MUST implement required opt-out and consent controls for the user's jurisdiction and provider.
- PROD-CHAN-007: WhatsApp, Telegram, SMS, and email delivery MUST use supported official provider interfaces rather than browser-side secrets or unofficial automation.
- PROD-CHAN-008: Channel credentials and tokens MUST remain server-side and protected.
- PROD-CHAN-009: Delivery state MUST distinguish queued, submitted, accepted, delivered where reported, failed, expired, opened where reported, and acted on.
- PROD-CHAN-010: The product MUST not infer delivery or reading when a channel does not report it.
- PROD-CHAN-011: Local-device and remote-push attempts MUST be distinguishable and MUST follow the notification-ownership and deduplication contract.

## 25. Notification Preferences

- PROD-PREF-001: Users MUST control enabled channels, destination, quiet hours, global pause, lock-screen privacy, default nudge/escalation, and summary behavior.
- PROD-PREF-002: Quiet hours MUST support windows crossing midnight and a selected timezone behavior.
- PROD-PREF-003: Users MUST be able to configure whether a permitted urgent escalation may bypass app quiet hours; OS focus/DND limitations MUST remain explicit.
- PROD-PREF-004: Disabling a channel MUST not delete reminder intent.
- PROD-PREF-005: Permission revocation at OS or provider level MUST reconcile to app state.
- PROD-PREF-006: Sound and vibration settings MUST defer to operating-system control where the app cannot guarantee behavior.

## 26. Offline Creation and Conflict Resolution

- PROD-OFF-001: Users MUST be able to create, edit, complete, snooze, reschedule, skip, pause, cancel, and delete supported records while offline.
- PROD-OFF-002: Offline mutations MUST use client-generated UUIDs, stable idempotency keys, device identity, base record version, client timestamp, and monotonic per-device sequence.
- PROD-OFF-003: The client MUST persist an encrypted durable outbox and visibly distinguish pending, synchronized, failed, and conflicted mutations.
- PROD-OFF-004: The server MUST provide cursor-based delta synchronization and tombstones for deletions.
- PROD-OFF-005: Encrypted local state is authoritative only for a device's provisional unsynchronized mutations. The server is authoritative after reconciliation and always authoritative for security, subscription limits, provider state, and final synchronization order.
- PROD-OFF-006: Non-overlapping field edits MAY merge automatically.
- PROD-OFF-007: Conflicting edits to the same semantic field MUST not use silent last-write-wins; the user MUST receive a conflict-resolution view.
- PROD-OFF-008: A valid completion or skip MUST take precedence over a stale snooze, reschedule, or content-only edit to that occurrence. When completion and skip compete at the same base revision, the first valid server-accepted terminal action wins and the other becomes a visible conflict.
- PROD-OFF-009: Deletion MUST win over stale updates unless the user explicitly restores a recoverable record.
- PROD-OFF-010: Concurrent recurrence-rule or workflow-graph edits MUST require explicit resolution.
- PROD-OFF-011: Replayed create mutations MUST not produce duplicate reminders, occurrences, workflows, or delivery jobs.
- PROD-OFF-012: Conflict resolution MUST preserve both source versions and an audit event.
- PROD-OFF-013: The app MUST show the last synchronization time and whether displayed data may be stale.
### 26.1 Offline notification ownership

- PROD-OFF-014: Every occurrence/device pair MUST have one declared notification owner and schedule revision.
- PROD-OFF-015: When local-notification permission and OS capability are available, a supported time-based reminder created offline MUST schedule a local OS notification until authoritative synchronization transfers or reconciles ownership. Otherwise it MUST remain visibly blocked rather than appear protected.
- PROD-OFF-016: Synchronization MUST transfer or reconcile ownership before scheduling an equivalent remote attempt.
- PROD-OFF-017: Local and remote attempts MUST share a logical deduplication identity where platform APIs permit.
- PROD-OFF-018: Under a network partition, duplicate display may be impossible to eliminate; actions and server-side effects MUST remain idempotent and the limitation MUST be documented.
- PROD-OFF-019: Offline natural-language capture MUST use an explicitly supported on-device parser or remain pending until connectivity returns; manual offline creation MUST remain available.
- PROD-OFF-020: Email, SMS, WhatsApp, Telegram, server AI, calendar refresh, and external integration work created offline MUST be shown as pending and MUST not be represented as executed before server acknowledgement.
- PROD-OFF-021: Logout or account switching MUST cancel that account's pending local notifications, unregister or detach the device token, and wipe or cryptographically isolate cached data.
- PROD-OFF-022: Series cancellation or deletion wins over unsynchronized child edits and future-occurrence actions, while retaining a recoverable conflict record during the deletion-retention window.
- PROD-OFF-023: Pause blocks new server-side occurrences after acceptance; an offline device MUST cancel provisional future work when it receives the pause.
- PROD-OFF-024: Causal ordering MUST use authenticated device sequence, base revision, and server acceptance order; an untrusted client wall clock MUST not decide a conflict.
- PROD-OFF-025: Before reporting an offline complete, skip, snooze, reschedule, pause, cancel, or delete as locally successful, the device MUST atomically cancel or replace every affected provisional local notification on that device.

## 27. External Integrations

- PROD-INT-001: The completed product MUST provide a versioned integration framework for calendars, communication services, productivity tools, CRM/task tools, and automation services.
- PROD-INT-002: Connections MUST use official authorization mechanisms and minimum scopes.
- PROD-INT-003: Credentials MUST be encrypted, revocable, rotated where supported, and excluded from logs.
- PROD-INT-004: Incoming webhooks MUST be authenticated, replay-protected, deduplicated, and schema-validated.
- PROD-INT-005: Polling integrations MUST respect provider rate limits and expose freshness.
- PROD-INT-006: The product MUST define the source of truth and conflict behavior for every synchronized field.
- PROD-INT-007: Disconnecting MUST revoke access where supported and explain retained local data and dependent triggers/workflows.
- PROD-INT-008: Provider outages, permission loss, and schema changes MUST pause or degrade dependent behavior visibly.
- PROD-INT-009: Actions with external consequences MUST show an exact preview and require confirmation unless the user has explicitly authorized a narrowly defined automation.
- PROD-INT-010: A provider-specific adapter MUST not weaken the common authorization, audit, idempotency, privacy, and deletion requirements.
- PROD-INT-011: The completed-product baseline provider matrix MUST include Apple device calendars, Google Calendar, Microsoft Outlook Calendar, Gmail and Outlook Mail for explicitly authorized response signals, Todoist as a task/productivity provider, and generic signed inbound and outbound webhooks.
- PROD-INT-012: Mobile authorization MUST use a secure system authorization session and Authorization Code with PKCE where supported; provider client secrets MUST remain on the server.

## 28. History and “Why Now?”

- PROD-HIST-001: The system MUST record immutable events for reminder, occurrence, schedule, trigger, workflow, escalation, notification, device, integration, and sync changes.
- PROD-HIST-002: Events MUST record actor type, authenticated user where relevant, device/integration reference, request/idempotency reference, timestamp, and bounded metadata.
- PROD-HIST-003: Users MUST be able to inspect relevant history and filter it by reminder, occurrence, action, channel, and date.
- PROD-WHY-001: Every nontrivial trigger MUST provide a deterministic “Why now?” explanation.
- PROD-WHY-002: Explanation examples include schedule and timezone, geofence event, selected Bluetooth/Wi-Fi signal, measured inactivity, workflow predecessor, calendar conflict, and escalation step.
- PROD-WHY-003: AI-generated explanatory prose MUST not replace the underlying deterministic evidence.

## 29. Conceptual Data Model

The completed model MUST include at least:

- User
- Session
- DeviceRegistration
- NotificationPreference
- Reminder
- ReminderContext
- Category
- Tag
- ReminderTag
- Schedule
- RecurrenceRule
- ReminderOccurrence
- TriggerDefinition
- TriggerEvaluation
- SavedLocation
- DeviceSignalReference
- FollowUpWorkflow
- WorkflowVersion
- WorkflowNode
- WorkflowEdge
- WorkflowRun
- EscalationPolicy
- EscalationStep
- Notification
- DeliveryAttempt
- ReminderEvent
- IntegrationConnection
- IntegrationEvent
- SyncCursor
- SyncMutation
- SyncConflict
- AIProcessingRecord with content-minimized metadata

Exact physical schemas belong in the technical design. The domain distinctions and ownership boundaries in this document are mandatory.

## 30. API and Device Contract

- PROD-API-001: A generated, versioned OpenAPI document MUST be the canonical server contract.
- PROD-API-002: Native device capabilities MUST have versioned client interfaces and a documented Android/iOS capability matrix.
- PROD-API-003: The API MUST cover auth/account, devices, reminders, schedules, occurrences/actions, triggers, workflows, escalations, organization/search, views, notifications/preferences, integrations, sync/conflicts, events/history, parsing, AI suggestions, export, and deletion.
- PROD-API-004: Authenticated APIs MUST derive user identity from the session and MUST not trust a client-selected owner ID.
- PROD-API-005: Mutations MUST accept idempotency keys and resource revisions.
- PROD-API-006: Collections MUST support stable cursor pagination.
- PROD-API-007: Errors MUST use a versioned shape with stable code, safe message, request ID, field details, retryability, and conflict metadata where applicable.
- PROD-API-008: Timestamps MUST use RFC 3339 and civil schedules MUST include IANA timezone data.
- PROD-API-009: Unknown trigger, workflow, sync-operation, or provider-event types MUST be rejected rather than treated as success.
- PROD-API-010: Provider callbacks MUST be authenticated and MUST not expose server credentials to mobile clients.

## 31. Background Processing and Reliability

- PROD-REL-001: The primary database MUST be authoritative for synchronized schedules, workflow state, and notification intent. Encrypted device state remains provisional authority only for unsynchronized offline mutations as defined by PROD-OFF-005.
- PROD-REL-002: Domain mutation, audit event, and durable scheduling intent MUST commit atomically through an outbox or equivalent.
- PROD-REL-003: Workers MUST use leases or visibility timeouts and recover abandoned jobs.
- PROD-REL-004: Processing MUST be at-least-once; all state effects MUST be idempotent.
- PROD-REL-005: Deduplication keys MUST include the logical occurrence or workflow step, channel/device, escalation step, trigger event, and schedule/workflow revision as relevant.
- PROD-REL-006: Workers MUST recheck owner, lifecycle, revision, quiet hours, permission, and policy immediately before dispatch.
- PROD-REL-007: Retries MUST be bounded, use backoff and jitter, and end in an observable dead-letter state.
- PROD-REL-008: Reconciliation MUST find missing jobs, expired leases, stuck workflows, invalid device tokens, stale integrations, and unexpanded recurrence.
- PROD-REL-009: Queue state MUST be rebuildable from authoritative state.
- PROD-REL-010: Catch-up after downtime MUST use channel TTL, staleness, priority, and rate limits and MUST avoid notification storms.
- PROD-REL-011: Provider acceptance MUST not be recorded as device delivery.
- PROD-REL-012: The service MUST publish dispatch-latency, recovery, availability, RPO, and RTO objectives and measure them in production-like and production environments.
- PROD-REL-013: Alerts MUST cover scheduling lag, trigger-evaluation lag, dispatch lag, retry exhaustion, dead-letter growth, recurrence failures, invalid-token spikes, integration staleness, and sync conflicts.

Queue technology is an architecture decision. Redis or another broker MUST NOT be the only authoritative copy of a future schedule.

## 32. Time and Timezone Rules

- PROD-TZ-001: IANA timezone identifiers MUST be used; numeric offsets alone are insufficient for civil schedules.
- PROD-TZ-002: Every schedule MUST declare fixed-instant, wall-clock, elapsed-duration, event-relative, or context-event time basis.
- PROD-TZ-003: Parsing MUST record reference instant, locale, timezone, and parser version.
- PROD-TZ-004: Travel behavior MUST be configurable and previewed: retain original zone, preserve absolute instant, or follow current zone where supported.
- PROD-TZ-005: Recurring wall-clock schedules MUST define DST gap and fold behavior.
- PROD-TZ-006: Monthly rules MUST define behavior when the requested day does not exist.
- PROD-TZ-007: Leap day, leap second handling where relevant to dependencies, clock skew, tzdb update, and device-clock tampering policies MUST be documented.
- PROD-TZ-008: Quiet hours MUST declare which timezone they follow.
- PROD-TZ-009: Outage catch-up MUST distinguish a still-useful overdue reminder from an expired occurrence.

## 33. Security Requirements

- PROD-SEC-001: Every user-owned query and mutation MUST enforce ownership across all domain records.
- PROD-SEC-002: Passwords MUST use an established adaptive hash; secrets and provider tokens MUST use managed secret storage and appropriate encryption.
- PROD-SEC-003: Transport encryption MUST be required for client, service, provider, and administrative connections.
- PROD-SEC-004: Access, refresh, verification, reset, action, and webhook credentials MUST be scoped, expiring, replay-resistant, and redacted.
- PROD-SEC-005: Auth, parsing, notification, integration, sync, and search endpoints MUST use risk-appropriate rate and resource limits.
- PROD-SEC-006: All client, AI, device-signal, and provider input MUST be schema-validated and bounded.
- PROD-SEC-007: Reminder text, coordinates, network/device identifiers, tokens, message destinations, and integration payloads MUST not appear in ordinary logs.
- PROD-SEC-008: Mobile credentials and offline data MUST use platform-provided secure storage and encrypted local persistence appropriate to sensitivity.
- PROD-SEC-009: Deep links and notification actions MUST resist tampering, replay, and cross-account access.
- PROD-SEC-010: Webhook signatures, timestamp windows, nonce/replay defense, and provider source validation MUST be tested.
- PROD-SEC-011: Administrative access MUST be separately authenticated, authorized, audited, and unavailable from ordinary user sessions.
- PROD-SEC-012: Dependency, secret, static, and dynamic security checks MUST be part of release gates.

## 34. Privacy Requirements

- PROD-PRIV-001: The app MUST request notification, location, Bluetooth/nearby-device, calendar, contacts if ever used, and related permissions only when their feature is invoked.
- PROD-PRIV-002: Users MUST be able to deny or revoke optional permissions without losing unrelated reminder functionality.
- PROD-PRIV-003: Collection of coordinates, device/network identifiers, calendar details, behavior history, message destinations, and AI content MUST be minimized.
- PROD-PRIV-004: Lock-screen privacy MUST support full, title-only, and generic modes.
- PROD-PRIV-005: AI and external providers MUST be disclosed with purpose, data sent, region where known, retention, training-use controls, and deletion propagation.
- PROD-PRIV-006: Users MUST be able to export and delete their data and disconnect each integration.
- PROD-PRIV-007: Account deletion MUST make future server and provider actions ineligible before purge, cancel local actions on reachable devices immediately, and require offline devices to cancel and purge them at the next trusted contact.
- PROD-PRIV-008: Analytics MUST use pseudonymous identifiers and MUST exclude reminder content, exact location, network/device identifiers, and message bodies.
- PROD-PRIV-009: Retention periods MUST be defined separately for active data, deleted content, backups, audit/security records, provider data, and failed deliveries.
- PROD-PRIV-010: End-to-end encryption, if introduced, MUST explicitly reconcile server-side parsing, search, workflows, integrations, and notification rendering rather than claiming incompatible protections.

## 35. Accessibility and Localization

- PROD-ACC-001: All primary flows MUST support VoiceOver and TalkBack.
- PROD-ACC-002: The app MUST support dynamic text, logical focus, meaningful reading order, accessible names, platform-size touch targets, sufficient contrast, and reduced motion.
- PROD-ACC-003: Meaning MUST not depend on color, sound, gesture, map, or calendar grid alone.
- PROD-ACC-004: Calendar and map experiences MUST provide accessible list/text alternatives.
- PROD-ACC-005: Parser results, permission changes, conflicts, validation errors, synchronization state, and action results MUST be announced appropriately.
- PROD-ACC-006: Notification actions MUST use meaningful localized labels rather than symbols alone.
- PROD-LOCN-001: User-facing text, templates, date/time formats, pluralization, week start, calendar display, and parser locale MUST be localizable.
- PROD-LOCN-002: Stored schedule semantics MUST remain stable when display locale changes.

## 36. Performance and Operational Requirements

- PROD-NFR-001: Product SLOs MUST be defined for API availability, mutation latency, synchronization latency, trigger evaluation, notification submission, and integration freshness.
- PROD-NFR-002: Cached mobile startup and agenda display SHOULD remain useful during degraded connectivity.
- PROD-NFR-003: Battery and background-resource budgets MUST be measured for location and device triggers on supported OS versions.
- PROD-NFR-004: Search and calendar views MUST define response targets for realistic user histories.
- PROD-NFR-005: Backups MUST be encrypted and restoration MUST be tested.
- PROD-NFR-006: Schema, recurrence, workflow, and sync migrations MUST be backward-compatible with supported app versions or require an explicit upgrade path.
- PROD-NFR-007: Feature flags and provider kill switches MUST safely disable a failing trigger, model, integration, or channel without corrupting reminder intent.
- PROD-NFR-008: Observability MUST avoid sensitive content while retaining request, job, trigger, workflow, and provider correlation.

## 37. Success Metrics

The product MUST define denominators, windows, exclusions, and occurrence-versus-series semantics for:

- Median reminder creation time
- Natural-language use, failure, ambiguity, and correction rate
- Reminder completion rate
- Completion within 15 minutes and 24 hours
- Snooze and repeated-snooze rate
- Missed/expired occurrence rate
- Follow-up workflow completion and abandonment rate
- Escalation stop and opt-out rate
- Smart-suggestion acceptance, correction, and outcome lift
- Calendar-conflict suggestion usefulness
- Trigger evaluation latency and false/duplicate trigger reports
- Notification submission latency and duplicate-attempt rate
- Provider rejection, invalid destination, and reported delivery rate
- Offline mutation success, sync latency, and conflict rate
- Integration freshness and failure rate
- Crash-free sessions
- Daily, weekly, and monthly active users
- Day-7 and Day-30 retention

Reminder content and exact context MUST not be included in analytics events.

## 38. Completed-Product Acceptance

The completed product is not considered complete until:

1. Every required capability in Section 8 is implemented or documented as unavailable only on a platform that cannot expose the required capability.
2. The MVP release gates continue to pass.
3. Advanced recurrence passes timezone, DST, leap-year, month-end, edit-scope, and exception testing.
4. Location, Bluetooth, Wi-Fi, device, and inactivity triggers pass physical supported-device foreground/background, permission, reboot, battery, duplicate, and unavailable-state tests.
5. Follow-up graphs pass cycle, branch, version, cancellation, retry, and external-signal tests.
6. Escalation passes stop, cap, quiet-hours, channel-fallback, cost, and anti-spam tests.
7. Smart scheduling and AI pass consent, explanation, correction, opt-out, privacy, and no-silent-action tests.
8. Calendar conflict detection passes permission, stale-data, busy/free privacy, multi-calendar, and timezone tests.
9. Mobile Day, Week, Month, agenda, map where used, and search flows pass VoiceOver and TalkBack testing.
10. Email, SMS, WhatsApp, and Telegram pass destination verification, consent, provider failure, opt-out, localization, and delivery-state tests.
11. Offline creation and actions pass replay, reordering, tombstone, merge, semantic-conflict, device-loss, and notification-ownership tests.
12. External integrations pass authorization, least-scope, webhook replay, polling freshness, disconnect, deletion, provider-outage, and rate-limit tests.
13. Account export and deletion propagate through devices, schedules, queues, AI processors, messaging providers, and integrations under documented retention rules.
14. Production-like worker crash, queue loss, database failover, restore, provider outage, and catch-up exercises meet published SLO/RPO/RTO targets.
15. The generated OpenAPI and mobile capability matrix match the deployed system.

## 39. Example Completed-Product Journey

A freelancer enters:

> Remind me tomorrow at 9 AM to send the proposal to John. If I mark it sent and there is no response after three days, remind me again. Escalate once by email the next morning.

The app:

1. Parses the title, exact time, timezone, completion-relative delay, manual or connected response source, and escalation step.
2. Shows an editable timeline and identifies any calendar conflict.
3. Explains which steps require a connected communication source and which depend on manual input.
4. Creates nothing until the user confirms.
5. Sends the initial reminder through the selected permitted channel.
6. Starts the three-day follow-up clock only after the “sent” outcome.
7. Stops the remaining workflow if the user records a response or a verified integration reports one.
8. Sends the email escalation only if the policy remains eligible and quiet-hours, consent, destination, and provider rules allow it.
9. Preserves a deterministic history and “Why now?” explanation for every step.

This journey demonstrates the completed-product promise without claiming that the application can infer a response when no manual or integrated response signal exists.
