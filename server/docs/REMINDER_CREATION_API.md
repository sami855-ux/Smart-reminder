# Reminder Creation API

This server slice implements the reminder-creation and time/recurrence requirements in sections 8.1, 8.2, and 9 of `docs/MVP_REQUIREMENTS.md`. All routes require an access token and use the global `/v1` prefix. Swagger remains the canonical executable contract at `/docs` outside production.

## Routes

### `POST /v1/reminders/preview`

Validates normalized content and resolves the civil-time schedule without writing data.

```json
{
  "title": "Call John",
  "contextNote": "Discuss the revised proposal.",
  "schedule": {
    "type": "SELECTED_WEEKDAYS",
    "localDate": "2026-09-28",
    "localTime": "09:00",
    "timezone": "Africa/Addis_Ababa",
    "weekdays": [1, 3, 5]
  }
}
```

The response includes the original local date and time, IANA timezone, recurrence summary, resolved UTC instant and offset, the first occurrence, and any DST-gap adjustment. A past first occurrence is rejected and never advanced silently.

### `POST /v1/reminders`

Persists a confirmed structured reminder. The request body has the same fields as preview plus `"confirmed": true` and `"confirmedResolvedAt"`, copied from the preview's resolved first-occurrence instant. Creation returns `409` if the server's resolution no longer matches that confirmed instant. The `Idempotency-Key` header is required and must contain 8–128 letters, numbers, `.`, `_`, `:`, or `-`.

The reminder, schedule revision, first occurrence, immutable creation event, and idempotency record commit atomically. Replaying the same key and normalized payload returns the original reminder with `idempotency.replayed: true`. Reusing the key with different content returns `409 CONFLICT`.

### `POST /v1/parse-reminder`

Parses a draft but cannot persist, delete, contact, send, or reschedule anything.

```json
{
  "text": "Remind me tomorrow at 9 to call John.",
  "referenceInstant": "2026-09-26T07:00:00.000Z",
  "locale": "en-US",
  "timezone": "Africa/Addis_Ababa",
  "timeFormat": "12-hour"
}
```

The schema-bounded response includes:

- the preserved original draft and manual-form availability;
- editable structured title, local date, local time, timezone, and recurrence;
- confidence per field and an `inferredFields` list for client highlighting;
- blocking ambiguities and supported alternatives;
- visible unsupported-clause warnings;
- a resolved preview when the proposal is unambiguous and future-facing;
- `requiresConfirmation: true` and `created: false` in every result.

The deterministic grammar supports ISO and English month-name dates, today/tomorrow, named and next weekdays, 12-hour and 24-hour times, minute/hour/day relative durations, daily, weekly, and selected-weekday recurrence. A bare hour under a 12-hour preference returns AM and PM alternatives. Location, device-state, and external-integration clauses remain in the draft and are returned as warnings. Non-exact dayparts such as “morning,” “afternoon,” “evening,” and “night” produce a blocking `DAYPART_EXACT_TIME_REQUIRED` ambiguity until the user selects an exact time.

## Civil time and recurrence routes

Every timestamp accepted or returned by these routes is an RFC 3339 instant with a `Z` suffix or explicit UTC offset. Schedule inputs remain civil values: `localDate` uses `YYYY-MM-DD`, `localTime` uses 24-hour `HH:mm`, and `timezone` is an IANA identifier.

### `POST /v1/reminders/timezone-preview`

Accepts `{ "proposedTimezone": "America/New_York" }` and returns a read-only view of each active schedule's next instant in the proposed account timezone. Its policy is `PRESERVE_SCHEDULE_TIMEZONE`; it reports `persisted: false`, `scheduleTimezoneChanges: false`, and `confirmedInstantChanges: false`. It never rewrites a schedule.

### `POST /v1/reminders/:reminderId/materialize-occurrences`

Idempotently extends the current schedule's rolling occurrence horizon. Each occurrence is stored separately with its own sequence, original and effective RFC 3339 instants, local civil values, schedule revision, and lifecycle state. Database uniqueness on `(schedule_id, sequence)` and `(schedule_id, occurrence_key)` makes retries safe.

### `PATCH /v1/reminders/:reminderId/schedule`

Requires an `Idempotency-Key` and an optimistic-concurrency payload:

```json
{
  "occurrenceId": "50000000-0000-4000-8000-000000000001",
  "scope": "THIS_AND_FUTURE",
  "expectedReminderRevision": 1,
  "expectedEffectiveScheduledAt": "2026-09-28T06:00:00.000Z",
  "schedule": {
    "type": "DAILY",
    "localDate": "2026-09-28",
    "localTime": "10:00",
    "timezone": "Africa/Addis_Ababa",
    "occurrenceCount": 30
  }
}
```

`THIS_OCCURRENCE` changes only the selected occurrence's effective instant. `THIS_AND_FUTURE` cancels the old revision's selected and future scheduled occurrences, preserves historical occurrences, and creates a linked schedule revision with newly materialized occurrences. Stale reminder or occurrence versions return `409`.

### `POST /v1/reminder-occurrences/:occurrenceId/snooze`

Requires an `Idempotency-Key`, a snooze `until` instant between 5 minutes and 30 days ahead, the expected schedule revision, and the selected occurrence's expected effective instant. Only that occurrence changes; its original instant and all later series occurrences remain unchanged.

## Schedule values

`type` is one of:

- `ONE_TIME`
- `DAILY`
- `WEEKLY`
- `SELECTED_WEEKDAYS`

Weekdays use `0` for Sunday through `6` for Saturday and are accepted only for `SELECTED_WEEKDAYS`.

Every recurring schedule has a required `localDate` start. It may be open-ended or provide exactly one finite bound: an inclusive `endDate` or an `occurrenceCount` from 1 through 500. A bounded one-time schedule and simultaneous end/count bounds are rejected.

Civil-time resolution uses the schedule's IANA timezone. A nonexistent local time moves forward by the full DST gap and the preview exposes the adjustment, resulting instant, and UTC offset. An ambiguous repeated time resolves to the earlier instant/offset. Recurring occurrences resolve their original wall-clock time independently on each local date, so UTC instants adjust across offset transitions.

## Requirement traceability

| Requirement | Server evidence |
| --- | --- |
| MVP-CAP-001–002 | Reminder and exactly one nested time schedule DTO; optional context note; atomic Prisma models |
| MVP-CAP-003 | NFC normalization and Unicode code-point validators for 1–120 title and 0–2,000 note |
| MVP-CAP-004 | Four bounded schedule enum values and selected-weekday validation |
| MVP-CAP-005 | Preview response contains resolved local/UTC details, recurrence summary, offset, and first occurrence |
| MVP-CAP-006 | Schedule service rejects past first occurrences; DST changes are explicit adjustments |
| MVP-CAP-007 | User-scoped idempotency record, request hash, unique constraints, and replay/conflict tests |
| MVP-NLP-001–004 | Parse route/request context and schema-validated structured response |
| MVP-NLP-005 | `inferredFields` identifies values that the mobile client must visually distinguish and keep editable |
| MVP-NLP-006, 012 | Missing exact fields or multiple time interpretations return blocking ambiguities and alternatives |
| MVP-NLP-007, 013 | Unsupported clauses remain in the draft and are returned in bounded warnings |
| MVP-NLP-008 | Parser failure returns the preserved draft and manual-form fallback |
| MVP-NLP-009 | Zod validates and bounds every parser response before it leaves the service |
| MVP-NLP-010 | Parser has no persistence dependency and every response requires confirmation with `created: false` |
| MVP-NLP-011 | Fixed grammar and conformance cases cover the required date, time, duration, and recurrence forms |
| MVP-NLP-014 | Conformance tests fix reference instant, locale, timezone, preference, and expected result |
| MVP-TIME-001 | Schedule stores original local date/time, IANA timezone, resolved UTC instant, and UTC offset |
| MVP-TIME-002 | Instant request fields require full RFC 3339 offsets; response instants use ISO/RFC 3339 serialization |
| MVP-TIME-003 | Create requires `confirmedResolvedAt` and rejects a resolution that differs from the confirmed preview |
| MVP-TIME-004 | Each recurring local date is resolved independently at the schedule's wall-clock time and IANA timezone |
| MVP-TIME-005 | Read-only timezone-impact endpoint preserves schedule timezone and confirmed instants |
| MVP-TIME-006 | Deterministic gap-forward/earlier-offset resolution, explicit preview adjustment, instant, and offset |
| MVP-TIME-007 | Non-exact dayparts return a blocking parser ambiguity and cannot produce a preview |
| MVP-TIME-008–009 | Required start date; optional mutually exclusive end/count bound; daily, weekly, and selected-weekday rules |
| MVP-TIME-010 | Independently persisted occurrence rows with sequence, times, schedule revision, and lifecycle |
| MVP-TIME-011 | Explicit edit scope; future edits create linked revisions, cancel superseded future rows, and retain history |
| MVP-TIME-012 | Snooze atomically updates only the selected occurrence and preserves its original instant |

MVP-CAP-003–005, MVP-NLP-005/008, MVP-TIME-005, and the confirmation UI for MVP-TIME-006/011 also require corresponding mobile form, preview, highlighting, draft-storage, fallback, timezone-impact, and edit-scope behavior. The endpoints expose the required server contract, but server tests do not constitute mobile UI completion.
