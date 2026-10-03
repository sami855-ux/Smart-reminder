import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../auth/AuthProvider';

export default function OnboardingLayout() {
  const { status } = useAuth();

  if (status !== 'authenticated') return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        animation: 'default',
        gestureEnabled: false,
        headerShown: false,
      }}
    />
  );
}
