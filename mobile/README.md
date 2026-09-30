# Smart Reminder mobile

Expo SDK 57 / React Native application for onboarding, authentication, and the
core reminder creation and time-management flow.

## Included

- Confirmation of the detected locale, IANA timezone, and 12-hour or 24-hour display
- Notification value explanation before the native permission request
- Optional notification permission that never blocks entry into the app
- Permission-denied warning with a link to system settings
- Permission reconciliation when the app starts or returns to the foreground
- Local persistence of onboarding completion and regional preferences
- Email/password registration and login against the NestJS `/v1/auth` API
- SecureStore refresh-token persistence with in-memory access tokens
- Single-flight refresh-token rotation and automatic authenticated-request retry
- Email verification and password-recovery deep links
- Current-device and all-device logout, JSON export, and account deletion
- Natural-language assistance with preserved drafts, visible ambiguities, and editable inferred fields
- Manual one-time, daily, weekly, and selected-weekday reminder creation
- Native date/time selection, optional series end date or occurrence count, and pre-save civil-time preview
- Upcoming/overdue occurrence lists with timezone-aware formatting and pull-to-refresh
- One UI-inspired reminder dashboard with Today, Scheduled, Overdue, and Completed views
- Reminder detail editing, completion, skipping, snoozing, deletion, history, and “Why now?” context
- One-occurrence or future-series rescheduling with optimistic concurrency
- 10-minute, 30-minute, and one-hour occurrence snooze actions
- Server-backed notification pause, quiet-hour, lock-screen privacy, and device controls
- Optional bounded follow-up nudges with local schedule reconciliation on app resume
- Complete and 10-minute snooze actions directly from interactive notifications
- Read-only account-timezone impact preview before changing display preferences
- Local notification scheduling and reminder deep links in Expo Go and app builds

The server remains authoritative. Mobile responses are schema-validated before entering UI state, and all mutation failures are presented through the app toast layer.

## API configuration

Copy `.env.example` to `.env` and set the API base URL:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/v1
```

`10.0.2.2` reaches the host machine from the Android emulator. Use
`http://localhost:3000/v1` for the iOS simulator or your computer's LAN address
for a physical device. Production builds must use an HTTPS URL.

The app registers the `smartreminder` URL scheme. For local verification and
password-reset emails, configure the API with:

```bash
AUTH_PUBLIC_APP_URL=smartreminder://
```

Use a verified HTTPS universal-link domain in production.

## Run

```bash
npm install --legacy-peer-deps
npm start
```

### Android notification testing

Authentication, onboarding, and server-backed reminder screens can run in Expo Go. On Android,
local notification permission and scheduling remain available in Expo Go. Android
remote push delivery requires a development build. Use the app's development build
to verify the full native path, including notification action buttons, foreground
presentation, deep links, and exact-alarm behavior:

```bash
npx expo run:android
```

The app reconciles the operating-system permission, registered device, and pending
local schedules at startup and whenever it returns to the foreground.

Use a physical Android and iOS device for final permission and system-settings verification.

## Verify

```bash
npm run lint
npm run typecheck
npx expo-doctor
```
