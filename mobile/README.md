# Smart Reminder mobile

Expo SDK 57 / React Native implementation of first-run onboarding and the
account authentication lifecycle.

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

The test-notification feature and reminder creation are intentionally outside this package's current scope.

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

Authentication and the rest of onboarding can run in Expo Go. On Android,
Smart Reminder treats the notification runtime as unavailable in Expo Go to
avoid loading Expo's unsupported push-token registration path. Use the app's
development build to verify the real notification permission flow:

```bash
npx expo run:android
```

The production app and development build continue to use the operating-system
notification permission and settings state.

Use a physical Android and iOS device for final permission and system-settings verification.

## Verify

```bash
npm run lint
npm run typecheck
npx expo-doctor
```
