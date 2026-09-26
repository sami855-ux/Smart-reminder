import '../../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from '../components/ui/ToastProvider';
import { OnboardingProvider } from '../onboarding/onboarding-context';
import { queryClient } from '../api/query-client';
import { useNotificationNavigation } from '../platform/notifications/notification-navigation';

export default function RootLayout() {
  useNotificationNavigation();

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <OnboardingProvider>
            <AuthProvider>
              <StatusBar style="dark" />
              <Stack screenOptions={{ headerShown: false }} />
            </AuthProvider>
          </OnboardingProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
