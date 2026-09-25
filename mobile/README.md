# Smart Reminder mobile onboarding

Expo SDK 57 / React Native implementation of the first-run onboarding flow.

## Included

- Confirmation of the detected locale, IANA timezone, and 12-hour or 24-hour display
- Notification value explanation before the native permission request
- Optional notification permission that never blocks entry into the app
- Permission-denied warning with a link to system settings
- Permission reconciliation when the app starts or returns to the foreground
- Local persistence of onboarding completion and regional preferences

The test-notification feature and reminder creation are intentionally outside this package's current scope.

## Run

```bash
npm install --legacy-peer-deps
npm start
```

Use a physical Android and iOS device for final permission and system-settings verification.

## Verify

```bash
npm run lint
npm run typecheck
npx expo-doctor
```
