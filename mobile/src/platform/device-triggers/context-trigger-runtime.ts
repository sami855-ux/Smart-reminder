import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { getInstallationId } from '../../device/device-installation';
import {
  listContextTriggers,
  reportContextTriggerEvent,
} from '../../reminders/reminder.api';
import type { ContextTrigger } from '../../reminders/reminder.schemas';
import { loadNotificationsModule } from '../notifications/notification-runtime';

const GEOFENCE_TASK = 'smart-reminder-context-geofence-v1';
const LOCATION_QUEUE_KEY = 'smart-reminder:context-location-events:v1';
let lastNetworkName: string | null | undefined;
let runtimeTriggers: ContextTrigger[] = [];

type PendingLocationEvent = {
  triggerId: string;
  eventKey: string;
  occurredAt: string;
};

function eventKey(prefix: string, stablePart: string) {
  return `${prefix}:${stablePart.replace(/[^A-Za-z0-9._:-]/gu, '-').slice(0, 96)}`;
}

async function readPendingLocationEvents(): Promise<PendingLocationEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingLocationEvent[]).slice(-100) : [];
  } catch {
    return [];
  }
}

async function queueLocationEvent(event: PendingLocationEvent) {
  const pending = await readPendingLocationEvents();
  const deduplicated = pending.filter((item) => item.eventKey !== event.eventKey);
  await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify([...deduplicated, event].slice(-100)));
}

async function presentGenericContextAlert(kind: 'location' | 'wifi') {
  const notifications = await loadNotificationsModule();
  if (!notifications) return;
  await notifications.scheduleNotificationAsync({
    content: {
      title: kind === 'location' ? 'Location reminder' : 'Wi-Fi reminder',
      body:
        kind === 'location'
          ? 'A saved arrival or departure reminder is ready.'
          : 'A reminder for this Wi-Fi network is ready.',
      data: { source: 'context-trigger' },
    },
    trigger: null,
  });
}

if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
  TaskManager.defineTask<{ eventType: Location.GeofencingEventType; region: Location.LocationRegion }>(
    GEOFENCE_TASK,
    async ({ data, error, executionInfo }) => {
      if (error || !data?.region?.identifier) return;
      const direction =
        data.eventType === Location.GeofencingEventType.Enter ? 'enter' : 'exit';
      const triggerId = data.region.identifier;
      const occurredAt = new Date().toISOString();
      const pending = {
        triggerId,
        eventKey: eventKey('location', `${executionInfo.eventId}:${direction}`),
        occurredAt,
      };
      let shouldAlert = true;
      try {
        const installationId = await getInstallationId();
        const result = await reportContextTriggerEvent({ ...pending, installationId });
        shouldAlert = result.outcome === 'FIRED';
      } catch {
        await queueLocationEvent(pending);
      }
      if (shouldAlert) await presentGenericContextAlert('location').catch(() => undefined);
    },
  );
}

async function flushLocationQueue() {
  const pending = await readPendingLocationEvents();
  if (!pending.length) return;
  const installationId = await getInstallationId();
  const remaining: PendingLocationEvent[] = [];
  for (const item of pending) {
    try {
      await reportContextTriggerEvent({ ...item, installationId });
    } catch {
      remaining.push(item);
    }
  }
  await AsyncStorage.setItem(LOCATION_QUEUE_KEY, JSON.stringify(remaining));
}

async function reconcileGeofences(triggers: ContextTrigger[]) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  const locationTriggers = triggers.filter(
    (trigger) =>
      trigger.lifecycle === 'ACTIVE' &&
      trigger.location &&
      (trigger.type === 'LOCATION_ARRIVE' || trigger.type === 'LOCATION_LEAVE'),
  );
  if (!locationTriggers.length) {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
    return;
  }
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  if (foreground.status !== 'granted' || background.status !== 'granted') return;
  const limit = Platform.OS === 'ios' ? 20 : 100;
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    locationTriggers.slice(0, limit).map((trigger) => ({
      identifier: trigger.id,
      latitude: trigger.location!.latitude,
      longitude: trigger.location!.longitude,
      radius: trigger.location!.radiusMeters,
      notifyOnEnter: trigger.type === 'LOCATION_ARRIVE',
      notifyOnExit: trigger.type === 'LOCATION_LEAVE',
    })),
  );
}

function wifiSsid(state: NetInfoState): string | null {
  if (state.type !== 'wifi' || !state.isConnected || !state.details) return null;
  const ssid = 'ssid' in state.details ? state.details.ssid : null;
  return typeof ssid === 'string' && ssid.length ? ssid.normalize('NFC') : null;
}

async function evaluateWifiState(state: NetInfoState, triggers: ContextTrigger[]) {
  const current = wifiSsid(state);
  const previous = lastNetworkName;
  lastNetworkName = current;
  if (!current || previous === undefined || previous === current) return;
  const installationId = await getInstallationId();
  const occurredAt = new Date().toISOString();
  await Promise.allSettled(
    triggers
      .filter((trigger) => trigger.type === 'WIFI_CONNECT' && trigger.lifecycle === 'ACTIVE')
      .map(async (trigger) => {
        const result = await reportContextTriggerEvent({
          triggerId: trigger.id,
          installationId,
          occurredAt,
          networkName: current,
          eventKey: eventKey('wifi', `${trigger.id}:${occurredAt}`),
        });
        if (result.outcome === 'FIRED') await presentGenericContextAlert('wifi');
      }),
  );
}

export async function requestLocationTriggerPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return { foreground: false, background: false };
  const background = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: background.status === 'granted' };
}

export async function currentLocationForTrigger() {
  const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: location.coords.latitude, longitude: location.coords.longitude };
}

export async function refreshContextTriggerRuntime() {
  const next = await listContextTriggers();
  runtimeTriggers = next;
  await Promise.all([reconcileGeofences(next), flushLocationQueue()]);
  await evaluateWifiState(await NetInfo.fetch(), next);
  return next;
}

export function useContextTriggerRuntime() {
  const { status } = useAuth();

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    if (status === 'unauthenticated') {
      lastNetworkName = undefined;
      runtimeTriggers = [];
      void AsyncStorage.removeItem(LOCATION_QUEUE_KEY);
      void Location.hasStartedGeofencingAsync(GEOFENCE_TASK)
        .then((started) => (started ? Location.stopGeofencingAsync(GEOFENCE_TASK) : undefined))
        .catch(() => undefined);
      return;
    }
    if (status !== 'authenticated') return;
    let disposed = false;

    NetInfo.configure({ shouldFetchWiFiSSID: true });
    const sync = async () => {
      const next = await refreshContextTriggerRuntime();
      if (disposed) return;
      runtimeTriggers = next;
    };
    void sync().catch(() => undefined);
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      void evaluateWifiState(state, runtimeTriggers).catch(() => undefined);
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync().catch(() => undefined);
    });
    return () => {
      disposed = true;
      unsubscribeNetwork();
      appState.remove();
    };
  }, [status]);
}
