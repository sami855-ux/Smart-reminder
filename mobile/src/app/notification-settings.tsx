import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { formErrorMessage } from '../auth/form-error';
import { OneUIHeader } from '../components/ui/OneUIHeader';
import { SymbolIcon } from '../components/ui/SymbolIcon';
import { useToast } from '../components/ui/ToastProvider';
import {
  listDeviceInstallations,
  revokeDeviceInstallation,
} from '../device/device.api';
import { getInstallationId, syncCurrentDevice } from '../device/device-installation';
import { cn } from '../lib/cn';
import { useOnboarding } from '../onboarding/onboarding-context';
import {
  notificationPermissionAllowsAlerts,
  openNotificationSettings,
} from '../platform/notifications/notification-permission';
import { reconcileReminderNotifications } from '../platform/notifications/reminder-notification-scheduler';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '../preferences/preferences.api';

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const { state, reconcilePermission } = useOnboarding();
  const { showToast } = useToast();
  const [currentInstallationId, setCurrentInstallationId] = useState<string | null>(null);
  const preferences = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: getNotificationPreferences,
    enabled: status === 'authenticated',
  });
  const devices = useQuery({
    queryKey: ['device-installations'],
    queryFn: async () => {
      const [installationId, installations] = await Promise.all([
        getInstallationId(),
        listDeviceInstallations(),
      ]);
      setCurrentInstallationId(installationId);
      return installations;
    },
    enabled: status === 'authenticated',
  });
  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<NotificationPreferences>) => {
      if (!preferences.data) throw new Error('Notification preferences are unavailable.');
      return updateNotificationPreferences({
        expectedRevision: preferences.data.revision,
        ...(patch.quietHoursStart !== undefined
          ? { quietHoursStart: patch.quietHoursStart }
          : {}),
        ...(patch.quietHoursEnd !== undefined ? { quietHoursEnd: patch.quietHoursEnd } : {}),
        ...(patch.lockScreenPrivacy
          ? { lockScreenPrivacy: patch.lockScreenPrivacy }
          : {}),
        ...(patch.globallyPaused !== undefined
          ? { globallyPaused: patch.globallyPaused }
          : {}),
      });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(['notification-preferences'], updated);
      await reconcileReminderNotifications().catch(() => undefined);
      showToast({
        title: 'Notification settings updated',
        message: 'Your account preference revision is now current.',
        tone: 'success',
      });
    },
    onError: (error) => {
      showToast({
        title: 'Couldn’t update notification settings',
        message: formErrorMessage(error),
        tone: 'error',
      });
      void preferences.refetch();
    },
  });
  const revokeMutation = useMutation({
    mutationFn: revokeDeviceInstallation,
    onSuccess: async () => {
      await devices.refetch();
      showToast({ title: 'Device revoked', message: 'Its pending mappings were cancelled.', tone: 'success' });
    },
    onError: (error) =>
      showToast({ title: 'Couldn’t revoke the device', message: formErrorMessage(error), tone: 'error' }),
  });

  if (status !== 'authenticated') return <Redirect href="/" />;

  const alertsAllowed = notificationPermissionAllowsAlerts(state.notificationPermission);

  async function refreshDevicePermission() {
    const permission = await reconcilePermission();
    try {
      await syncCurrentDevice({
        permission,
        locale: state.preferences.locale,
        timezone: state.preferences.timezone,
      });
      await devices.refetch();
    } catch (error) {
      showToast({
        title: 'Device sync needs attention',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="pb-12" showsVerticalScrollIndicator={false}>
        <View className="w-full max-w-[680px] self-center">
          <OneUIHeader
            onBack={() => router.back()}
            subtitle="Control device permission, quiet hours, privacy, and signed-in installations."
            title="Notifications"
          />
          <View className="px-5">
            <SectionTitle title="This device" />
            <View className="rounded-[24px] bg-paper p-4">
              <View className="flex-row items-center">
                <View
                  className={cn(
                    'size-11 items-center justify-center rounded-full',
                    alertsAllowed ? 'bg-success-soft' : 'bg-warning-soft',
                  )}
                >
                  <SymbolIcon
                    className={alertsAllowed ? 'text-success' : 'text-warning'}
                    name="notification"
                    size={20}
                  />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[16px] font-semibold text-ink">
                    {alertsAllowed ? 'Alerts are allowed' : 'Alerts need attention'}
                  </Text>
                  <Text className="mt-1 text-[13px] text-muted-ink">
                    System status: {state.notificationPermission.replaceAll('-', ' ')}
                  </Text>
                </View>
              </View>
              <View className="mt-4 flex-row gap-2">
                <Pressable
                  accessibilityRole="button"
                  className="min-h-11 flex-1 items-center justify-center rounded-full bg-secondary-fill"
                  onPress={() => void refreshDevicePermission()}
                >
                  <Text className="text-[13px] font-semibold text-ink">Refresh status</Text>
                </Pressable>
                {!alertsAllowed ? (
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-11 flex-1 items-center justify-center rounded-full bg-intelligence"
                    onPress={() => void openNotificationSettings()}
                  >
                    <Text className="text-[13px] font-semibold text-white">Open settings</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <SectionTitle title="Delivery" />
            {preferences.isPending ? (
              <LoadingCard />
            ) : preferences.isError || !preferences.data ? (
              <ErrorCard message={formErrorMessage(preferences.error)} onRetry={() => void preferences.refetch()} />
            ) : (
              <View className="overflow-hidden rounded-[24px] bg-paper">
                <ToggleRow
                  description="Keep reminders saved while stopping account-level alerts"
                  disabled={updateMutation.isPending}
                  label="Pause all reminders"
                  value={preferences.data.globallyPaused}
                  onValueChange={(globallyPaused) => updateMutation.mutate({ globallyPaused })}
                />
                <Divider />
                <ToggleRow
                  description="Silence the default window from 10:00 PM to 7:00 AM"
                  disabled={updateMutation.isPending}
                  label="Quiet hours"
                  value={preferences.data.quietHoursStart !== null}
                  onValueChange={(enabled) =>
                    updateMutation.mutate({
                      quietHoursStart: enabled ? '22:00' : null,
                      quietHoursEnd: enabled ? '07:00' : null,
                    })
                  }
                />
                {preferences.data.quietHoursStart ? (
                  <Text className="border-t border-taupe/70 px-4 py-3 text-[13px] text-muted-ink">
                    {preferences.data.quietHoursStart} – {preferences.data.quietHoursEnd} · {preferences.data.timezone}
                  </Text>
                ) : null}
              </View>
            )}

            {preferences.data ? (
              <>
                <SectionTitle title="Lock screen privacy" />
                <View className="overflow-hidden rounded-[24px] bg-paper">
                  {([
                    ['FULL', 'Show title and note'],
                    ['TITLE_ONLY', 'Show title only'],
                    ['PRIVATE', 'Hide reminder details'],
                  ] as const).map(([value, label], index) => (
                    <View key={value}>
                      {index > 0 ? <Divider /> : null}
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected: preferences.data?.lockScreenPrivacy === value }}
                        className="min-h-[58px] flex-row items-center px-4 active:bg-canvas"
                        disabled={updateMutation.isPending}
                        onPress={() => updateMutation.mutate({ lockScreenPrivacy: value })}
                      >
                        <Text className="flex-1 text-[15px] font-medium text-ink">{label}</Text>
                        <View
                          className={cn(
                            'size-6 items-center justify-center rounded-full border-2',
                            preferences.data?.lockScreenPrivacy === value
                              ? 'border-intelligence'
                              : 'border-taupe',
                          )}
                        >
                          {preferences.data?.lockScreenPrivacy === value ? (
                            <View className="size-3 rounded-full bg-intelligence" />
                          ) : null}
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <SectionTitle title="Devices" />
            {devices.isPending ? (
              <LoadingCard />
            ) : devices.isError ? (
              <ErrorCard message={formErrorMessage(devices.error)} onRetry={() => void devices.refetch()} />
            ) : (
              <View className="overflow-hidden rounded-[24px] bg-paper">
                {(devices.data ?? []).map((device, index) => (
                  <View key={device.id}>
                    {index > 0 ? <Divider inset /> : null}
                    <View className="min-h-[76px] flex-row items-center px-4 py-3">
                      <View className="size-10 items-center justify-center rounded-full bg-secondary-fill">
                        <Text className="text-[18px] font-bold text-ink">{device.platform === 'ANDROID' ? 'A' : 'i'}</Text>
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-[15px] font-semibold text-ink">
                          {device.id === currentInstallationId ? 'This device' : device.platform === 'ANDROID' ? 'Android device' : 'iOS device'}
                        </Text>
                        <Text className="mt-1 text-[12px] text-muted-ink">
                          {device.permissionState.toLowerCase()} · app {device.appVersion}
                        </Text>
                      </View>
                      {device.id !== currentInstallationId && !device.revokedAt ? (
                        <Pressable
                          accessibilityRole="button"
                          className="min-h-10 justify-center rounded-full bg-urgent-soft px-3"
                          disabled={revokeMutation.isPending}
                          onPress={() => revokeMutation.mutate(device.id)}
                        >
                          <Text className="text-[12px] font-semibold text-urgent">Revoke</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-[78px] flex-row items-center px-4 py-3">
      <View className="flex-1 pr-4">
        <Text className="text-[15px] font-semibold text-ink">{label}</Text>
        <Text className="mt-1 text-[12px] leading-4 text-muted-ink">{description}</Text>
      </View>
      <Switch
        disabled={disabled}
        onValueChange={onValueChange}
        thumbColor="#FFFFFF"
        trackColor={{ false: '#DADCE2', true: '#2764E7' }}
        value={value}
      />
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text className="mb-3 ml-1 mt-7 text-[20px] font-bold text-ink">{title}</Text>;
}

function Divider({ inset = false }: { inset?: boolean }) {
  return <View className={cn('h-px bg-taupe/70', inset ? 'ml-16' : 'ml-4')} />;
}

function LoadingCard() {
  return (
    <View className="items-center rounded-[24px] bg-paper py-8">
      <ActivityIndicator color="#2764E7" />
    </View>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="rounded-[24px] bg-paper p-4">
      <Text className="text-[14px] leading-5 text-muted-ink">{message}</Text>
      <Pressable className="mt-3 min-h-11 items-center justify-center rounded-full bg-secondary-fill" onPress={onRetry}>
        <Text className="text-[13px] font-semibold text-ink">Try again</Text>
      </Pressable>
    </View>
  );
}
