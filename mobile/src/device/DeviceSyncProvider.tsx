import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { useOnboarding } from '../onboarding/onboarding-context';
import { notificationPermissionAllowsAlerts } from '../platform/notifications/notification-permission';
import { reconcileReminderNotifications } from '../platform/notifications/reminder-notification-scheduler';
import {
  getProfilePreferences,
  updateProfilePreferences,
} from '../preferences/preferences.api';
import { syncCurrentDevice } from './device-installation';

const FOREGROUND_SYNC_COOLDOWN_MS = 5 * 60_000;

export function DeviceSyncProvider({ children }: PropsWithChildren) {
  const { status, user } = useAuth();
  const { hydrated, state } = useOnboarding();
  const lastSignature = useRef<string | null>(null);
  const lastSyncAt = useRef(0);
  const syncTask = useRef<Promise<void> | null>(null);

  const syncDeviceAndReminders = useCallback((force = false) => {
    if (syncTask.current) return syncTask.current;
    if (!force && Date.now() - lastSyncAt.current < FOREGROUND_SYNC_COOLDOWN_MS) {
      return Promise.resolve();
    }

    const task = (async () => {
      await syncCurrentDevice({
        permission: state.notificationPermission,
        locale: state.preferences.locale,
        timezone: state.preferences.timezone,
      });
      if (notificationPermissionAllowsAlerts(state.notificationPermission)) {
        await reconcileReminderNotifications({ force });
      }
    })();
    syncTask.current = task;
    void task
      .then(() => {
        lastSyncAt.current = Date.now();
      })
      .catch(() => undefined)
      .finally(() => {
        if (syncTask.current === task) syncTask.current = null;
      });
    return task;
  }, [state.notificationPermission, state.preferences.locale, state.preferences.timezone]);

  useEffect(() => {
    if (!hydrated || status !== 'authenticated' || !user || !state.completed) return;
    const signature = [
      user.id,
      state.preferences.locale,
      state.preferences.timezone,
      state.preferences.timeFormat,
      state.notificationPermission,
    ].join('|');
    if (lastSignature.current === signature) return;
    lastSignature.current = signature;

    void Promise.allSettled([
      syncDeviceAndReminders(true),
      syncProfile(state.preferences),
    ]).then((results) => {
      if (results.some((result) => result.status === 'rejected')) {
        lastSignature.current = null;
      }
    });
  }, [hydrated, state, status, syncDeviceAndReminders, user]);

  useEffect(() => {
    if (!hydrated || status !== 'authenticated' || !user || !state.completed) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncDeviceAndReminders().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [hydrated, state.completed, status, syncDeviceAndReminders, user]);

  return children;
}

async function syncProfile(preferences: {
  locale: string;
  timezone: string;
  timeFormat: '12-hour' | '24-hour';
}) {
  const remote = await getProfilePreferences();
  const timeFormat = preferences.timeFormat === '12-hour' ? 'H12' : 'H24';
  if (
    remote.locale === preferences.locale &&
    remote.timezone === preferences.timezone &&
    remote.timeFormat === timeFormat
  ) {
    return remote;
  }
  return updateProfilePreferences({
    expectedRevision: remote.revision,
    locale: preferences.locale,
    timezone: preferences.timezone,
    timeFormat,
  });
}
