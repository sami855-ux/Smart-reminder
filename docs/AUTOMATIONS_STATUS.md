# Reminder automation status

This repository now contains a bounded, device-assisted implementation of checklists, completion workflows, location triggers, and Wi-Fi-connect triggers. It is intentionally narrower than the completed-product specification in `req.md`.

## Implemented behavior

- Reminder checklists can be added during creation or edited later. They are stored as templates, and every scheduled occurrence receives its own snapshot and checked state.
- A completion workflow can be authored directly in Add Reminder or added later from reminder details. It contains up to 20 ordered follow-up steps. Completing the source occurrence creates the next one-time reminder; skipping it does not advance the chain. A step can require either completion of the previous step or completion of every checklist item on that occurrence.
- Workflows and context triggers can be paused and resumed with optimistic concurrency and audited, idempotent mutations. Pausing a workflow prevents new runs; a run that already started continues.
- A location trigger can monitor arrival at or departure from a saved geofence. Coordinates are encrypted at rest by the server.
- A Wi-Fi trigger can match a connection to a configured network. The server stores a keyed fingerprint rather than the raw network name.
- Trigger reports and all new mutations are idempotent. Cooldowns suppress repeated device events.
- Triggered reminders are new one-time copies of the reminder used as the trigger template.

## Platform and delivery boundaries

- Location and Wi-Fi signals are observed by the mobile device, not by the NestJS server.
- Background location requires a native development or production build, permissions, and real-device validation. Expo Go is not sufficient.
- Wi-Fi matching is best-effort while the app is active or returns to the foreground. iOS does not provide reliable arbitrary background Wi-Fi change delivery.
- Follow-up reminders are scheduled locally when the completion response reaches the app. This slice does not add a remote-push worker, transactional outbox, or closed-app server reconciliation.
- Workflows are sequential and bounded. Arbitrary branching graphs, workflow editing/version migration, active-run cancellation, retries, and abandonment handling remain completed-product work.

## Required deployment setup

- Set `CONTEXT_DATA_KEY_BASE64` to a securely generated 32-byte base64 key. Treat it as persistent secret material; add a decrypt-and-re-encrypt migration before rotating it.
- Apply the Prisma migration before deploying the updated server.
- Produce native Android and iOS builds with the permissions declared in `mobile/app.json`.
- Validate arrival, departure, Wi-Fi foreground/resume, permission denial, reboot, duplicate delivery, and battery-restriction paths on supported physical devices.
