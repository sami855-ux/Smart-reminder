import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useOnboarding } from '../onboarding/onboarding-context';

export default function IndexScreen() {
  const { hydrated, state } = useOnboarding();

  if (!hydrated) {
    return (
      <View
        accessibilityLabel="Loading Smart Reminder"
        className="flex-1 items-center justify-center bg-canvas"
      >
        <ActivityIndicator color="#1C1D21" size="large" />
      </View>
    );
  }

  return (
    <Redirect
      href={state.completed ? '/home' : '/(onboarding)/preferences'}
    />
  );
}
