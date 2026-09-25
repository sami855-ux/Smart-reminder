import * as SecureStore from 'expo-secure-store';

const REFRESH_TOKEN_KEY = 'smart-reminder.refresh-token.v1';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'smart-reminder.auth',
};

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, OPTIONS);
}

export async function setRefreshToken(refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, OPTIONS);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, OPTIONS);
}
