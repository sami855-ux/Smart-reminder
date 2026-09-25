import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { Screen } from '../components/ui/Screen';
import { useOnboarding } from '../onboarding/onboarding-context';

export default function IndexScreen() {
  const { hydrated, state } = useOnboarding();
  const { status, restorationMessage, retryRestoration, logout } = useAuth();

  if (!hydrated || status === 'bootstrapping') {
    return (
      <View
        accessibilityLabel="Loading Smart Reminder"
        className="flex-1 items-center justify-center bg-canvas"
      >
        <ActivityIndicator color="#007AFF" size="large" />
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
