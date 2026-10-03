import '../../global.css';

import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from '../components/ui/ToastProvider';
import { DeviceSyncProvider } from '../device/DeviceSyncProvider';
import { OnboardingProvider } from '../onboarding/onboarding-context';
import { queryClient } from '../api/query-client';
import { useForegroundReminderAlarm } from '../platform/notifications/foreground-reminder-alarm';
import { useNotificationNavigation } from '../platform/notifications/notification-navigation';
import { ThemeProvider, useAppTheme } from '../theme/theme-context';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
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
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell() {
  const { colors, isDark } = useAppTheme();
  useNotificationNavigation();
  useForegroundReminderAlarm();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          animation: 'default',
          contentStyle: { backgroundColor: colors.canvas },
          headerShown: false,
        }}
      >
        <Stack.Screen
          name="create-reminder"
          options={{
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: colors.canvas },
            gestureEnabled: true,
            presentation: 'formSheet',
            sheetAllowedDetents: [0.92, 1],
            sheetCornerRadius: 28,
            sheetElevation: 24,
            sheetExpandsWhenScrolledToEdge: true,
            sheetGrabberVisible: false,
            sheetInitialDetentIndex: 0,
          }}
        />
        <Stack.Screen
          name="alarm/[occurrenceId]"
          options={{
            animation: 'fade',
            contentStyle: { backgroundColor: '#121510' },
            gestureEnabled: false,
            presentation: 'fullScreenModal',
          }}
        />
      </Stack>
    </>
  );
}
