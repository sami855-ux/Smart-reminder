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
      description="Confirm this one-time link to finish verifying your account."
      onBack={() => router.back()}
      title="Confirm your email"
    >
      <View className="gap-4">
        {!tokenResult.success ? (
          <View className="rounded-2xl bg-urgent-soft p-4">
            <Text className="text-[17px] font-semibold text-ink">
              This link can’t be used
            </Text>
            <Text className="mt-1 text-[15px] font-normal leading-5 text-muted-ink/80">
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
          />
        ) : (
          <Button
            label="Return to Smart Reminder"
            onPress={() => router.replace('/')}
          />
        )}
      </View>
    </AuthScreen>
  );
}
