import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { actionTokenSchema } from '../../auth/auth.schemas';
import { formErrorMessage } from '../../auth/form-error';
import { AuthScreen } from '../../components/auth/AuthScreen';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastProvider';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { verifyEmail } = useAuth();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;
  const tokenResult = actionTokenSchema.safeParse(tokenValue);

  async function verify() {
    if (!tokenResult.success) return;
    setSubmitting(true);
    try {
      await verifyEmail(tokenResult.data);
      router.replace({
        pathname: '/',
        params: {},
      });
    } catch (requestError) {
      showToast({
        title: 'Couldn’t verify your email',
        message: formErrorMessage(requestError),
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      appearance="auth"
      description="Confirm this one-time link to finish securing your Smart Reminder account."
      onBack={() => router.back()}
      title="Verify your email"
    >
      <View className="gap-5">
        {!tokenResult.success ? (
          <View className="border-l-2 border-urgent pl-4">
            <Text className="font-inter-semibold text-[16px] text-auth-ink">
              This link can’t be used
            </Text>
            <Text className="mt-1 font-inter text-[14px] leading-5 text-auth-muted">
              It may be incomplete or expired. Request a new verification link
              from your account.
            </Text>
          </View>
        ) : null}
        {tokenResult.success ? (
          <Button
            label="Verify email"
            loading={submitting}
            onPress={() => void verify()}
            tone="auth"
          />
        ) : (
          <Button
            label="Return to Smart Reminder"
            onPress={() => router.replace('/')}
            tone="auth"
          />
        )}
      </View>
    </AuthScreen>
  );
}
