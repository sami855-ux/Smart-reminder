import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { Skeleton } from '../components/ui/Skeleton';
import { useOnboarding } from '../onboarding/onboarding-context';

export default function IndexScreen() {
  const { hydrated, state } = useOnboarding();
  const { status, restorationMessage, retryRestoration, logout } = useAuth();

  if (!hydrated || status === 'bootstrapping') {
    return (
      <View
        accessibilityLabel="Loading Smart Reminder"
        accessibilityRole="progressbar"
        className="flex-1 bg-canvas px-6 pt-24"
      >
        <View className="w-full max-w-[520px] self-center">
          <Skeleton className="size-12 rounded-[14px]" />
          <Skeleton className="mt-10 h-9 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
          <Skeleton className="mt-10 h-14 w-full rounded-[14px]" />
          <Skeleton className="mt-4 h-14 w-full rounded-[14px]" />
        </View>
      </View>
    );
  }

  if (status === 'restoration-error') {
    return (
      <Screen
        description={
          restorationMessage ??
          'We could not securely restore your session. Check your connection and try again.'
        }
        eyebrow="Connection needed"
        title="Couldn’t restore your session"
      >
        <View className="gap-2.5">
          <Button
            label="Try again"
            onPress={() => void retryRestoration()}
          />
          <Button
            label="Sign in with another account"
            onPress={() => void logout()}
            variant="text"
          />
        </View>
      </Screen>
    );
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Redirect
      href={state.completed ? '/home' : '/(onboarding)/preferences'}
    />
  );
}
