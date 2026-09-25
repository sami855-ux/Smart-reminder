import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDevicePreferences } from './device-preferences';
import type { OnboardingState } from './types';

const STORAGE_KEY = '@smart-reminder/onboarding/v1';

export function createInitialOnboardingState(): OnboardingState {
  return {
    completed: false,
    preferences: getDevicePreferences(),
    notificationPermission: 'unknown',
    permissionCheckedAt: null,
  };
}

export async function loadOnboardingState(): Promise<OnboardingState> {
  const initial = createInitialOnboardingState();

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return initial;
    }

    const parsed = JSON.parse(stored) as Partial<OnboardingState>;
    return {
      ...initial,
      ...parsed,
      preferences: {
        ...initial.preferences,
        ...parsed.preferences,
      },
    };
  } catch {
    return initial;
  }
}

export async function saveOnboardingState(state: OnboardingState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearOnboardingState(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
