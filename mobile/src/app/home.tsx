import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '../components/ui/Button';
import { PermissionWarning } from '../components/ui/PermissionWarning';
import { Screen } from '../components/ui/Screen';
import { useAuth } from '../auth/AuthProvider';
import { formatPreferenceExample } from '../onboarding/device-preferences';
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
    <Screen
      description="Your regional preferences and notification access are ready."
      eyebrow="Setup complete"
      title="Welcome to Smart Reminder"
    >
      {!permissionAllowed ? (
        <PermissionWarning
          onOpenSettings={() => void openNotificationSettings()}
          state={state.notificationPermission}
        />
      ) : (
        <View
          accessibilityRole="alert"
          className="border-l-2 border-success bg-paper px-4 py-3.5"
        >
          <Text className="font-inter-semibold text-[15px] text-ink">
            Notifications enabled
          </Text>
          <Text className="mt-1 font-inter text-sm leading-5 text-muted-ink">
            Smart Reminder is allowed to show alerts on this device.
          </Text>
        </View>
      )}

      <View className="mt-5 overflow-hidden rounded-2xl border border-taupe/50 bg-paper">
        <View className="px-5 pb-2 pt-5">
          <Text className="font-inter-semibold text-lg text-ink">
            Your preferences
          </Text>
        </View>
        <PreferenceRow label="Locale" value={state.preferences.locale} />
        <PreferenceRow label="Timezone" mono value={state.preferences.timezone} />
        <PreferenceRow
          label="Time display"
          mono
          value={state.preferences.timeFormat}
        />
        <View className="m-4 border-l-2 border-ink bg-canvas px-4 py-3">
          <Text className="font-inter-medium text-xs text-muted-ink">Example</Text>
          <Text className="mt-1 font-mono-medium text-[15px] leading-6 text-ink">
            {formatPreferenceExample(state.preferences)}
          </Text>
        </View>
      </View>

      <View className="mt-4">
        <Button
          label="Check notification access again"
          loading={checking}
          onPress={() => void checkAgain()}
          variant="secondary"
        />
      </View>

      <View className="mt-3">
        <Button
          label="Account and security"
          onPress={() => router.push('/account')}
          variant="text"
        />
      </View>

      <Text className="mt-4 text-center font-inter text-xs leading-[18px] text-muted-ink">
        Reminder creation is intentionally outside this onboarding build.
      </Text>
    </Screen>
  );
}

function PreferenceRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="min-h-[52px] flex-row items-center justify-between border-b border-taupe/30 px-5 py-3">
      <Text className="font-inter text-sm text-muted-ink">{label}</Text>
      <Text
        className={
          mono
            ? 'ml-5 flex-1 text-right font-mono-medium text-[13px] text-ink'
            : 'ml-5 flex-1 text-right font-inter-medium text-sm text-ink'
        }
      >
        {value}
      </Text>
    </View>
  );
}
