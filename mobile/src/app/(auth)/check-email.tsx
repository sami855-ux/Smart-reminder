import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { AuthScreen } from '../../components/auth/AuthScreen';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastProvider';

export default function CheckEmailScreen() {
  const router = useRouter();
  const { user, requestEmailVerification } = useAuth();
  const { showToast } = useToast();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    try {
      await requestEmailVerification();
      showToast({
        title: 'Verification email sent',
        message: 'We sent a fresh link. Check your inbox and spam folder.',
        tone: 'success',
      });
    } catch (requestError) {
      showToast({
        title: 'Couldn’t resend the email',
        message: formErrorMessage(requestError),
        tone: 'error',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthScreen
      description="Open the verification link on this device. The link is one-time and expires for your security."
      onBack={() => router.back()}
      title="Check your inbox"
    >
      <View className="gap-4">
        <View className="rounded-2xl bg-paper px-4 py-3.5">
          <Text className="text-[13px] font-normal leading-5 text-muted-ink/70">
            Verification address
          </Text>
          <Text className="mt-1 text-[17px] font-medium text-ink">
            {user?.email ?? 'Your account email'}
          </Text>
        </View>
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
    </AuthScreen>
  );
}
