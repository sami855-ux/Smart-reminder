import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { PermissionWarning } from '../components/ui/PermissionWarning';
import { useOnboarding } from '../onboarding/onboarding-context';
import {
  notificationPermissionAllowsAlerts,
  openNotificationSettings,
} from '../platform/notifications/notification-permission';

export default function HomeScreen() {
  const router = useRouter();
  const { status, user } = useAuth();
  const { state, reconcilePermission } = useOnboarding();
  const [checking, setChecking] = useState(false);
  const permissionAllowed = notificationPermissionAllowsAlerts(
    state.notificationPermission,
  );
  const dateLabel = useMemo(
    () => formatToday(state.preferences.locale),
    [state.preferences.locale],
  );

  if (status !== 'authenticated' || !user) return <Redirect href="/" />;

  async function checkAgain() {
    setChecking(true);
    try {
      await reconcilePermission();
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="pb-12"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-[680px] self-center px-5">
          <View className="flex-row items-start justify-between pb-5 pt-2">
            <View className="flex-1 pr-4">
              <Text className="text-[15px] font-medium text-subtle-ink">
                {dateLabel}
              </Text>
              <Text
                accessibilityRole="header"
                className="mt-0.5 text-[34px] font-bold leading-[41px] tracking-[-0.8px] text-ink"
              >
                Today
              </Text>
            </View>

            <Pressable
              accessibilityHint="Opens your account and security settings"
              accessibilityLabel="Account and settings"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-intelligence-soft active:opacity-60"
              onPress={() => router.push('/account')}
            >
              <Text className="text-[17px] font-semibold uppercase text-intelligence">
                {user.email.slice(0, 1)}
              </Text>
            </Pressable>
          </View>

          {!permissionAllowed ? (
            <View className="mb-4">
              <PermissionWarning
                onOpenSettings={() => void openNotificationSettings()}
                state={state.notificationPermission}
              />
            </View>
          ) : null}

          <View className="items-center rounded-[24px] bg-paper px-7 py-10">
            <View className="size-16 items-center justify-center rounded-full bg-success-soft">
              <Text className="text-[28px] font-medium text-success">✓</Text>
            </View>
            <Text className="mt-5 text-center text-[22px] font-semibold tracking-[-0.3px] text-ink">
              No reminders today
            </Text>
            <Text className="mt-2 max-w-[300px] text-center text-[15px] font-normal leading-[22px] text-muted-ink/70">
              Your schedule is clear. Upcoming reminders will appear here.
            </Text>
          </View>

          <Text className="mb-2 ml-4 mt-7 text-[13px] font-medium text-muted-ink/60">
            APP STATUS
          </Text>
          <View className="overflow-hidden rounded-2xl bg-paper">
            <StatusRow
              detail={permissionAllowed ? 'On' : 'Needs attention'}
              detailTone={permissionAllowed ? 'positive' : 'warning'}
              label="Notifications"
            />
            <View className="ml-4 h-px bg-taupe/50" />
            <StatusRow detail={state.preferences.timezone} label="Time zone" />
          </View>

          <View className="mt-4">
            <Button
              label="Refresh notification status"
              loading={checking}
              onPress={() => void checkAgain()}
              variant="secondary"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusRow({
  label,
  detail,
  detailTone = 'default',
}: {
  label: string;
  detail: string;
  detailTone?: 'default' | 'positive' | 'warning';
}) {
  return (
    <View className="min-h-[54px] flex-row items-center px-4 py-3">
      <Text className="flex-1 text-[16px] font-normal text-ink">{label}</Text>
      <Text
        className={
          detailTone === 'positive'
            ? 'ml-4 text-[15px] font-medium text-success'
            : detailTone === 'warning'
              ? 'ml-4 text-[15px] font-medium text-urgent'
              : 'ml-4 max-w-[62%] text-right text-[14px] font-normal text-muted-ink/70'
        }
        numberOfLines={1}
      >
        {detail}
      </Text>
    </View>
  );
}

function formatToday(locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  }
}
