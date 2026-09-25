import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { actionTokenSchema } from '../../auth/auth.schemas';
import { formErrorMessage } from '../../auth/form-error';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Screen } from '../../components/ui/Screen';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { verifyEmail } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;
  const tokenResult = actionTokenSchema.safeParse(tokenValue);

  async function verify() {
    if (!tokenResult.success) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyEmail(tokenResult.data);
      router.replace({
        pathname: '/',
        params: {},
      });
    } catch (requestError) {
      setError(formErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen
      description="Confirm this one-time link to finish verifying your account."
      eyebrow="Email verification"
      title="Confirm your email"
    >
      <View className="gap-4">
        <FormMessage
          message={
            tokenResult.success
              ? error
              : 'This verification link is invalid or incomplete. Request a new one from your account.'
          }
        />
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
    </Screen>
  );
}
