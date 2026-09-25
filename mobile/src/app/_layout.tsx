import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from '../components/ui/ToastProvider';
import { OnboardingProvider } from '../onboarding/onboarding-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <OnboardingProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </OnboardingProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
