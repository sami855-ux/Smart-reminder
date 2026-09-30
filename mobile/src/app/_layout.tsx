import '../../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from '../components/ui/ToastProvider';
import { DeviceSyncProvider } from '../device/DeviceSyncProvider';
import { OnboardingProvider } from '../onboarding/onboarding-context';
import { queryClient } from '../api/query-client';
import { useNotificationNavigation } from '../platform/notifications/notification-navigation';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <OnboardingProvider>
            <AuthProvider>
              <DeviceSyncProvider>
                <AppShell />
              </DeviceSyncProvider>
            </AuthProvider>
          </OnboardingProvider>
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  useNotificationNavigation();

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#F7F7F8' },
          headerShown: false,
        }}
      />
    </>
  );
}
