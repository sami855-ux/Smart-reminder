import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import {
  getNotificationPermission,
  requestNotificationPermission,
} from '../platform/notifications/notification-permission';
import {
  createInitialOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
} from './onboarding-storage';
import type {
  NotificationPermissionState,
  OnboardingPreferences,
  OnboardingState,
} from './types';

type OnboardingContextValue = {
  hydrated: boolean;
  state: OnboardingState;
  savePreferences: (preferences: OnboardingPreferences) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  reconcilePermission: () => Promise<NotificationPermissionState>;
  askForPermission: () => Promise<NotificationPermissionState>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<OnboardingState>(
    createInitialOnboardingState,
  );
  const stateRef = useRef(state);

  const persist = useCallback(async (next: OnboardingState) => {
    stateRef.current = next;
    setState(next);
    await saveOnboardingState(next);
  }, []);

  const applyPermissionSnapshot = useCallback(
    async (
      snapshot: Awaited<ReturnType<typeof getNotificationPermission>>,
    ) => {
      await persist({
        ...stateRef.current,
        notificationPermission: snapshot.state,
        permissionCheckedAt: snapshot.checkedAt,
      });

      return snapshot.state;
    },
    [persist],
  );

  const reconcilePermission = useCallback(async () => {
    const snapshot = await getNotificationPermission();
    return applyPermissionSnapshot(snapshot);
  }, [applyPermissionSnapshot]);

  const askForPermission = useCallback(async () => {
    const snapshot = await requestNotificationPermission();
    return applyPermissionSnapshot(snapshot);
  }, [applyPermissionSnapshot]);

  const savePreferences = useCallback(
    async (preferences: OnboardingPreferences) => {
      await persist({ ...stateRef.current, preferences });
    },
    [persist],
  );

  const finishOnboarding = useCallback(async () => {
    await persist({ ...stateRef.current, completed: true });
  }, [persist]);

  useEffect(() => {
    let active = true;

    void loadOnboardingState().then(async (stored) => {
      if (!active) return;
      stateRef.current = stored;
      setState(stored);
      setHydrated(true);

      const snapshot = await getNotificationPermission();
      if (!active) return;
      const next = {
          ...stateRef.current,
          notificationPermission: snapshot.state,
          permissionCheckedAt: snapshot.checkedAt,
      };
      stateRef.current = next;
      setState(next);
      void saveOnboardingState(next);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void reconcilePermission();
      }
    });

    return () => subscription.remove();
  }, [reconcilePermission]);

  const value = useMemo(
    () => ({
      hydrated,
      state,
      savePreferences,
      finishOnboarding,
      reconcilePermission,
      askForPermission,
    }),
    [
      hydrated,
      state,
      savePreferences,
      finishOnboarding,
      reconcilePermission,
      askForPermission,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext);
  if (!value) {
    throw new Error('useOnboarding must be used inside OnboardingProvider');
  }
  return value;
}
