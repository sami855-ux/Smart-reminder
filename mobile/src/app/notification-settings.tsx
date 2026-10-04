import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import { Redirect, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { formErrorMessage } from '../auth/form-error';
import { OneUIHeader } from '../components/ui/OneUIHeader';
import { AlertDialog } from '../components/ui/AlertDialog';
import { AppleSwitch } from '../components/ui/AppleSwitch';
import { ListSkeleton } from '../components/ui/Skeleton';
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
  openExactAlarmSettings,
  openNotificationSettings,
  openNotificationSoundSettings,
} from '../platform/notifications/notification-permission';
import {
  getNotificationAlertPreferences,
  notificationAlertPreferencesQueryKey,
  updateNotificationAlertPreferences,
  type NotificationAlertPreferences,
} from '../platform/notifications/notification-alert-preferences';
import {
  presentReminderAlarmNow,
  prepareSelectedNotificationChannel,
  reconcileReminderNotifications,
} from '../platform/notifications/reminder-notification-scheduler';
import {
  getNotificationPreferences,
  notificationPreferencesQueryKey,
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
  const [deviceToRevoke, setDeviceToRevoke] = useState<string | null>(null);
  const [testAlarmPending, setTestAlarmPending] = useState(false);
  const preferences = useQuery({
    queryKey: notificationPreferencesQueryKey,
    queryFn: getNotificationPreferences,
    enabled: status === 'authenticated',
  });
  const alertPreferences = useQuery({
    queryKey: notificationAlertPreferencesQueryKey,
    queryFn: getNotificationAlertPreferences,
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
      queryClient.setQueryData(notificationPreferencesQueryKey, updated);
      await reconcileReminderNotifications({ force: true }).catch(() => undefined);
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
      setDeviceToRevoke(null);
      await devices.refetch();
      showToast({ title: 'Device revoked', message: 'Its pending mappings were cancelled.', tone: 'success' });
    },
    onError: (error) => {
      setDeviceToRevoke(null);
      showToast({ title: 'Couldn’t revoke the device', message: formErrorMessage(error), tone: 'error' });
    },
  });
  const updateAlertMutation = useMutation({
    mutationFn: (patch: Partial<NotificationAlertPreferences>) =>
      updateNotificationAlertPreferences(patch),
    onSuccess: async (updated) => {
      queryClient.setQueryData(notificationAlertPreferencesQueryKey, updated);
      await prepareSelectedNotificationChannel().catch(() => null);
      await reconcileReminderNotifications({ force: true }).catch(() => undefined);
      showToast({
        title: 'Alert behavior updated',
        message: 'Future reminder alerts on this device use your new choice.',
        tone: 'success',
      });
    },
    onError: (error) =>
      showToast({
        title: 'Couldn’t update alert behavior',
        message: formErrorMessage(error),
        tone: 'error',
      }),
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

  async function openSoundPicker() {
    try {
      const channelId = await prepareSelectedNotificationChannel();
      await openNotificationSoundSettings(channelId);
    } catch (error) {
      showToast({
        title: 'Couldn’t open sound settings',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  }

  async function testSoundAndVibration() {
    setTestAlarmPending(true);
    try {
      const result = await presentReminderAlarmNow(
        {
          title: 'Smart Reminder test',
          body: 'Sound and vibration are ready for your reminders.',
        },
        alertPreferences.data,
      );
      const soundIsSilent = alertPreferences.data?.sound === 'SILENT';
      showToast({
        title:
          result === 'presented'
            ? soundIsSilent
              ? 'Test vibration sent'
              : 'Test alert sent'
            : 'Test alert unavailable',
        message:
          result === 'presented'
            ? soundIsSilent
              ? 'Sound is set to Silent. Select Device sound above for an audible alarm.'
              : 'If it was silent, check Do Not Disturb, phone volume, and this app’s notification channel.'
            : 'Use a development build and confirm notification access in system settings.',
        tone: result === 'presented' ? 'success' : 'error',
      });
    } catch (error) {
      showToast({
        title: 'Couldn’t send the test alert',
        message: formErrorMessage(error),
        tone: 'error',
      });
    } finally {
      setTestAlarmPending(false);
    }
  }

  return (
    <>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'bottom']}>
      <ScrollView contentContainerClassName="pb-12" showsVerticalScrollIndicator={false}>
        <View className="w-full max-w-[680px] self-center">
          <OneUIHeader
            onBack={() => router.back()}
            subtitle="Choose how this phone gets your attention."
            title="Notifications"
          />
          <View className="px-5">
            <SectionTitle title="This device" />
            <View className="rounded-[20px] bg-paper p-4">
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
                  <Text className="text-[16px] font-inter-semibold text-foreground">
                    {alertsAllowed ? 'Alerts are allowed' : 'Alerts need attention'}
                  </Text>
                  <Text className="font-inter mt-1 text-[13px] text-muted-foreground">
                    System status: {state.notificationPermission.replaceAll('-', ' ')}
                  </Text>
                </View>
              </View>
              <View className="mt-4 flex-row gap-2">
                <Pressable
                  accessibilityRole="button"
                  className="min-h-11 flex-1 items-center justify-center rounded-[12px] bg-secondary-fill"
                  onPress={() => void refreshDevicePermission()}
                >
                  <Text className="text-[13px] font-inter-semibold text-foreground">Refresh status</Text>
                </Pressable>
                {!alertsAllowed ? (
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-11 flex-1 items-center justify-center rounded-[12px] bg-ink"
                    onPress={() => void openNotificationSettings()}
                  >
                    <Text className="font-inter-semibold text-[13px] text-kast-lime">Open settings</Text>
                  </Pressable>
                ) : null}
              </View>
              {alertsAllowed ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: testAlarmPending }}
                  className={cn(
                    'mt-2 min-h-11 flex-row items-center justify-center rounded-[12px] bg-ink',
                    testAlarmPending && 'opacity-50',
                  )}
                  disabled={testAlarmPending}
                  onPress={() => void testSoundAndVibration()}
                >
                  <SymbolIcon className="text-kast-lime" name="notification" size={16} />
                  <Text className="ml-2 font-inter-semibold text-[13px] text-kast-lime">
                    {testAlarmPending ? 'Sending test…' : 'Test sound & vibration'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {Platform.OS === 'android' ? (
              <>
                <SectionTitle title="Precise timing" />
                <View className="rounded-[18px] bg-paper p-4">
                  <View className="flex-row items-start">
                    <View className="size-10 items-center justify-center rounded-[12px] bg-warning-soft">
                      <SymbolIcon className="text-warning" name="clock" size={19} />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-[15px] font-inter-semibold text-foreground">
                        Alarms &amp; reminders access
                      </Text>
                      <Text className="font-inter mt-1 text-[12px] leading-[18px] text-muted-foreground">
                        {isRunningInExpoGo()
                          ? 'Expo Go does not install this app’s exact-alarm permission. Use a development build for reliable alerts while the app is closed.'
                          : 'Android may require this separate access before a reminder can fire at the exact selected minute.'}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    className="mt-4 min-h-11 items-center justify-center rounded-[12px] bg-secondary-fill"
                    onPress={() => void openExactAlarmSettings()}
                  >
                    <Text className="text-[13px] font-inter-semibold text-foreground">
                      Open precise-alarm settings
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            <SectionTitle title="Sound" />
            {alertPreferences.isPending ? (
              <LoadingCard />
            ) : alertPreferences.isError || !alertPreferences.data ? (
              <ErrorCard
                message={formErrorMessage(alertPreferences.error)}
                onRetry={() => void alertPreferences.refetch()}
              />
            ) : (
              <View className="overflow-hidden rounded-[18px] bg-paper">
                <ChoiceRow
                  description="Use the tone selected for Smart Reminder on this phone"
                  disabled={updateAlertMutation.isPending}
                  label="Device sound"
                  selected={alertPreferences.data.sound === 'DEFAULT'}
                  onPress={() => updateAlertMutation.mutate({ sound: 'DEFAULT' })}
                />
                <Divider />
                <ChoiceRow
                  description="Show the alert without playing a sound"
                  disabled={updateAlertMutation.isPending}
                  label="Silent"
                  selected={alertPreferences.data.sound === 'SILENT'}
                  onPress={() => updateAlertMutation.mutate({ sound: 'SILENT' })}
                />
                {Platform.OS === 'android' && alertPreferences.data.sound === 'DEFAULT' ? (
                  <>
                    <Divider />
                    <Pressable
                      accessibilityHint="Opens this reminder channel in Android settings"
                      accessibilityRole="button"
                      className="min-h-[60px] flex-row items-center px-4 active:bg-canvas"
                      onPress={() => void openSoundPicker()}
                    >
                      <View className="flex-1 pr-3">
                        <Text className="text-[15px] font-inter-semibold text-accent">
                          Choose sound on this phone
                        </Text>
                        <Text className="font-inter mt-1 text-[12px] leading-4 text-muted-foreground">
                          Opens Android settings for the active reminder channel
                        </Text>
                      </View>
                      <SymbolIcon className="text-accent" name="chevron" size={22} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            )}

            {alertPreferences.data ? (
              <>
                <SectionTitle title="Vibration" />
                {Platform.OS === 'android' ? (
                  <View className="overflow-hidden rounded-[18px] bg-paper">
                    {([
                      ['OFF', 'Off', 'Never vibrate for reminders'],
                      ['SHORT', 'Short', 'One brief vibration'],
                      ['STANDARD', 'Standard', 'Two clear pulses'],
                      ['STRONG', 'Strong', 'A longer alarm-style pattern'],
                    ] as const).map(([value, label, description], index) => (
                      <View key={value}>
                        {index > 0 ? <Divider /> : null}
                        <ChoiceRow
                          description={description}
                          disabled={updateAlertMutation.isPending}
                          label={label}
                          selected={alertPreferences.data?.vibration === value}
                          onPress={() => updateAlertMutation.mutate({ vibration: value })}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-[68px] flex-row items-center rounded-[18px] bg-paper px-4 py-3"
                    onPress={() => void openNotificationSettings()}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-[15px] font-inter-semibold text-foreground">System controlled</Text>
                      <Text className="font-inter mt-1 text-[12px] leading-4 text-muted-foreground">
                        Use your phone’s notification and haptic settings
                      </Text>
                    </View>
                    <SymbolIcon className="text-accent" name="chevron" size={22} />
                  </Pressable>
                )}

                <SectionTitle title="When a reminder is due" />
                <View className="overflow-hidden rounded-[18px] bg-paper">
                  <ChoiceRow
                    description="Show the clock-style action screen immediately while the app is open"
                    disabled={updateAlertMutation.isPending}
                    label="Alarm screen"
                    selected={alertPreferences.data.alertStyle === 'ALARM'}
                    onPress={() => updateAlertMutation.mutate({ alertStyle: 'ALARM' })}
                  />
                  <Divider />
                  <ChoiceRow
                    description="Stay on the current screen and show only the system alert"
                    disabled={updateAlertMutation.isPending}
                    label="Notification only"
                    selected={alertPreferences.data.alertStyle === 'NOTIFICATION'}
                    onPress={() => updateAlertMutation.mutate({ alertStyle: 'NOTIFICATION' })}
                  />
                </View>
                <Text className="font-inter mx-3 mt-2 text-[12px] leading-[18px] text-muted-foreground">
                  If the app is closed or the phone is locked, tap the high-priority notification to open the alarm screen. Android restricts automatic lock-screen takeovers to approved alarm apps.
                </Text>
              </>
            ) : null}

            <SectionTitle title="Delivery" />
            {preferences.isPending ? (
              <LoadingCard />
            ) : preferences.isError || !preferences.data ? (
              <ErrorCard message={formErrorMessage(preferences.error)} onRetry={() => void preferences.refetch()} />
            ) : (
              <View className="overflow-hidden rounded-[18px] bg-paper">
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
                  <Text className="font-inter border-t border-taupe/70 px-4 py-3 text-[13px] text-muted-foreground">
                    {preferences.data.quietHoursStart} – {preferences.data.quietHoursEnd} · {preferences.data.timezone}
                  </Text>
                ) : null}
              </View>
            )}

            {preferences.data ? (
              <>
                <SectionTitle title="Lock screen privacy" />
                <View className="overflow-hidden rounded-[18px] bg-paper">
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
                        <Text className="flex-1 text-[15px] font-inter-medium text-foreground">{label}</Text>
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
              <View className="overflow-hidden rounded-[18px] bg-paper">
                {(devices.data ?? []).map((device, index) => (
                  <View key={device.id}>
                    {index > 0 ? <Divider inset /> : null}
                    <View className="min-h-[76px] flex-row items-center px-4 py-3">
                      <View className="size-10 items-center justify-center rounded-[12px] bg-secondary-fill">
                        <Text className="text-[18px] font-inter-bold text-foreground">{device.platform === 'ANDROID' ? 'A' : 'i'}</Text>
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-[15px] font-inter-semibold text-foreground">
                          {device.id === currentInstallationId ? 'This device' : device.platform === 'ANDROID' ? 'Android device' : 'iOS device'}
                        </Text>
                        <Text className="font-inter mt-1 text-[12px] text-muted-foreground">
                          {device.permissionState.toLowerCase()} · app {device.appVersion}
                        </Text>
                      </View>
                      {device.id !== currentInstallationId && !device.revokedAt ? (
                        <Pressable
                          accessibilityRole="button"
                          className="min-h-10 justify-center rounded-[12px] bg-urgent-soft px-3"
                          disabled={revokeMutation.isPending}
                          onPress={() => setDeviceToRevoke(device.id)}
                        >
                          <Text className="text-[12px] font-inter-semibold text-urgent">Revoke</Text>
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
      <AlertDialog
        confirmLabel="Revoke device"
        loading={revokeMutation.isPending}
        message="This device will stop receiving reminder updates and will need to sign in again."
        title="Revoke this device?"
        tone="destructive"
        visible={deviceToRevoke !== null}
        onCancel={() => setDeviceToRevoke(null)}
        onConfirm={() => {
          if (deviceToRevoke) revokeMutation.mutate(deviceToRevoke);
        }}
      />
    </>
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
        <Text className="text-[15px] font-inter-semibold text-foreground">{label}</Text>
        <Text className="font-inter mt-1 text-[12px] leading-4 text-muted-foreground">{description}</Text>
      </View>
      <AppleSwitch
        disabled={disabled}
        label={label}
        onValueChange={onValueChange}
        value={value}
      />
    </View>
  );
}

function ChoiceRow({
  label,
  description,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      className="min-h-[68px] flex-row items-center px-4 py-3 active:bg-canvas"
      disabled={disabled}
      onPress={onPress}
    >
      <View className="flex-1 pr-4">
        <Text className="text-[15px] font-inter-semibold text-foreground">{label}</Text>
        <Text className="font-inter mt-1 text-[12px] leading-4 text-muted-foreground">{description}</Text>
      </View>
      <View
        className={cn(
          'size-6 items-center justify-center rounded-full border-2',
          selected ? 'border-intelligence' : 'border-taupe',
        )}
      >
        {selected ? <View className="size-3 rounded-full bg-intelligence" /> : null}
      </View>
    </Pressable>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="mb-2 ml-3 mt-7 font-inter-semibold text-[12px] text-muted-foreground">
      {title.toUpperCase()}
    </Text>
  );
}

function Divider({ inset = false }: { inset?: boolean }) {
  return <View className={cn('h-px bg-secondary-fill', inset ? 'ml-16' : 'ml-4')} />;
}

function LoadingCard() {
  return <ListSkeleton rows={2} />;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="rounded-[18px] bg-paper p-4">
      <Text className="font-inter text-[14px] leading-5 text-muted-foreground">{message}</Text>
      <Pressable className="mt-3 min-h-11 items-center justify-center rounded-[12px] bg-secondary-fill" onPress={onRetry}>
        <Text className="text-[13px] font-inter-semibold text-foreground">Try again</Text>
      </Pressable>
    </View>
  );
}
