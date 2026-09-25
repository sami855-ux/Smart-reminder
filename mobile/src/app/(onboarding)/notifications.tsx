import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Button } from '../../components/ui/Button';
import { PermissionWarning } from '../../components/ui/PermissionWarning';
import { Screen } from '../../components/ui/Screen';
import { useOnboarding } from '../../onboarding/onboarding-context';
import {
  notificationPermissionAllowsAlerts,
  openNotificationSettings,
} from '../../platform/notifications/notification-permission';

export default function NotificationsScreen() {
  const router = useRouter();
  const { state, askForPermission, finishOnboarding } = useOnboarding();
  const [requesting, setRequesting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const permission = state.notificationPermission;
  const allowed = notificationPermissionAllowsAlerts(permission);
  const settingsRequired =
    permission === 'blocked' || permission === 'unavailable';

  async function requestPermission() {
    setRequesting(true);
    try {
      await askForPermission();
    } finally {
      setRequesting(false);
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      await finishOnboarding();
      router.replace('/home');
    } finally {
      setFinishing(false);
    }
  }

  const footer = allowed ? (
    <Button
      label="Continue to Smart Reminder"
      loading={finishing}
      onPress={() => void finish()}
    />
  ) : settingsRequired ? (
    <>
      <Button
        accessibilityHint="Opens this app's notification controls in system settings"
        label="Open system settings"
        onPress={() => void openNotificationSettings()}
      />
      <Button
        label="Continue without notifications"
        loading={finishing}
        onPress={() => void finish()}
        variant="text"
      />
    </>
  ) : (
    <>
      <Button
        accessibilityHint="Shows the operating system notification permission prompt"
        label="Enable notifications"
        loading={requesting}
        onPress={() => void requestPermission()}
      />
      <Button
        label="Not now"
        loading={finishing}
        onPress={() => void finish()}
        variant="text"
      />
    </>
  );

  return (
    <Screen
      description="Get an alert at the scheduled time, even when Smart Reminder is closed. Notification access remains optional."
      eyebrow="Step 2 of 2"
      footer={footer}
      title="Stay on time"
    >
      <View className="mb-5 overflow-hidden rounded-3xl bg-intelligence-soft p-4">
        <Text className="mb-3 font-semibold text-xs text-intelligence-dark">
          NOTIFICATION PREVIEW
        </Text>
        <View className="flex-row">
        <View className="w-[72px] items-start pt-4">
          <Text className="font-semibold text-[15px] text-intelligence-dark">09:00</Text>
          <Text className="mt-1 font-normal text-xs text-muted-ink">AM</Text>
        </View>
        <View className="mr-4 items-center">
          <View className="size-2.5 rounded-full bg-intelligence" />
          <View className="w-px flex-1 bg-taupe" />
        </View>
        <View className="flex-1 rounded-2xl border border-taupe bg-paper p-4">
          <Text className="font-semibold text-[15px] text-ink">
            Smart Reminder
          </Text>
          <Text className="mt-1 font-normal text-sm leading-5 text-muted-ink">
            Your next reminder is ready when you need it.
          </Text>
          <Text className="mt-3 font-normal text-xs text-muted-ink">now</Text>
        </View>
        </View>
      </View>

      <View className="overflow-hidden rounded-3xl border border-taupe bg-paper">
        <Benefit
          detail="Receive alerts while Smart Reminder is in the background."
          number="01"
          title="Timely"
        />
        <View className="ml-[68px] h-px bg-taupe" />
        <Benefit
          detail="Change notification access at any time in system settings."
          number="02"
          title="Under your control"
        />
        <View className="ml-[68px] h-px bg-taupe" />
        <Benefit
          detail="Choosing Not now never blocks access to the app."
          number="03"
          title="Always optional"
        />
      </View>

      {allowed ? (
        <View
          accessibilityRole="alert"
          className="mt-4 rounded-2xl border border-success/20 bg-success-soft px-4 py-3.5"
        >
          <Text className="font-semibold text-[15px] text-ink">
            Notifications are enabled
          </Text>
          <Text className="mt-1 font-normal text-sm leading-5 text-muted-ink">
            This device currently allows Smart Reminder to show alerts.
          </Text>
        </View>
      ) : permission === 'denied' || settingsRequired ? (
        <View className="mt-4">
          <PermissionWarning
            onOpenSettings={() => void openNotificationSettings()}
            state={permission}
          />
        </View>
      ) : (
        <Text className="mx-2 mt-4 text-center font-normal text-[13px] leading-5 text-muted-ink">
          The system permission prompt appears only after you tap Enable
          notifications.
        </Text>
      )}
    </Screen>
  );
}

function Benefit({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <View className="flex-row gap-4 p-4">
      <View className="size-9 items-center justify-center rounded-xl bg-intelligence-soft">
        <Text className="font-semibold text-xs text-intelligence-dark">{number}</Text>
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-[15px] text-ink">{title}</Text>
        <Text className="mt-1 font-normal text-sm leading-5 text-muted-ink">
          {detail}
        </Text>
      </View>
    </View>
  );
}
