import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Screen } from '../../components/ui/Screen';

export default function CheckEmailScreen() {
  const router = useRouter();
  const { user, requestEmailVerification } = useAuth();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      await requestEmailVerification();
      setMessage('A fresh verification link has been requested.');
    } catch (requestError) {
      setError(formErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen
      description="Open the verification link on this device. The link is one-time and expires for your security."
      eyebrow="Verify your email"
      title="Check your inbox"
    >
      <View className="gap-4">
        <View className="border-l-2 border-ink bg-paper px-4 py-3.5">
          <Text className="font-inter text-sm leading-5 text-muted-ink">
            Verification address
          </Text>
          <Text className="mt-1 font-inter-medium text-[15px] text-ink">
            {user?.email ?? 'Your account email'}
          </Text>
        </View>
        <FormMessage message={message} tone="success" />
        <FormMessage message={error} />
        <Button
          label="Resend verification email"
          loading={sending}
          onPress={() => void resend()}
          variant="secondary"
        />
        <Button
          label="Continue to setup"
          onPress={() => router.replace('/')}
        />
      </View>
    </Screen>
  );
}
