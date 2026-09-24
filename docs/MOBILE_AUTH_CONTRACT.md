# Smart Reminder Mobile Authentication Contract

This contract covers the mobile-owned parts of `MVP-AUTH-008` and `MVP-AUTH-010`. It becomes executable when the Expo mobile package is created.

## Credential storage

- Keep the access token in application memory only.
- Store the refresh token with `expo-secure-store`; never use AsyncStorage, Zustand persistence, logs, analytics, crash reports, or notification payloads for credentials.
- Persist a rotated refresh token before discarding the previous response. If secure persistence fails, clear local credentials and require login rather than reusing the previous token.
- Protect concurrent refresh calls with a single-flight lock. One consumed refresh credential must never be replayed.
- On app start, load only the refresh token, obtain a new access token, then fetch `/v1/auth/me` as the authoritative identity.

## Logout and account deletion

Before local sign-out, the installation must:

1. Cancel every pending local notification belonging to the current account.
2. Delete the account's occurrence-to-notification mapping.
3. Clear the refresh token from SecureStore and the access token from memory.
4. Clear or cryptographically isolate cached reminder data.

For normal logout, call `/v1/auth/logout` before the local cleanup when online. For account deletion, call `DELETE /v1/auth/account` with password confirmation. A successful deletion response contains `cancelLocalNotifications: true` and `localSignOutRequired: true`; perform the cleanup immediately and do not call an authenticated endpoint afterward.

Another installation learns about logout-all or deletion when its next authenticated request receives `401`. It must then perform the same local notification and credential cleanup.

## Verification and recovery deep links

- Route `verify-email?token=...` to `POST /v1/auth/email-verification/complete`.
- Route `reset-password?token=...` to a new-password form and then `POST /v1/auth/password-reset/complete`.
- Never log or persist either one-time token after completion.
- Always show the same password-reset request confirmation regardless of whether the address exists.
