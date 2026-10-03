import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import { AuthScreen } from '../../components/auth/AuthScreen';
import { AuthIcon } from '../../components/ui/AuthIcon';
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
      appearance="auth"
      description="Open the secure link we sent to your email address to finish setting up your account."
      onBack={() => router.back()}
      title="Check your inbox"
    >
      <View className="gap-5">
        <View className="flex-row items-center gap-3 border-b border-auth-line pb-4">
          <View className="size-11 items-center justify-center rounded-xl bg-auth-surface">
            <AuthIcon name="mail" size={21} />
          </View>
          <View className="flex-1">
            <Text className="font-inter text-[13px] leading-5 text-auth-muted">
              Verification address
            </Text>
            <Text className="mt-1 font-inter-medium text-[16px] text-auth-ink">
              {user?.email ?? 'Your account email'}
            </Text>
          </View>
        </View>
        <Button
          label="Resend verification email"
          loading={sending}
          icon={<AuthIcon color="#121510" name="mail" size={19} />}
          onPress={() => void resend()}
          tone="auth"
          variant="secondary"
        />
        <Button
          label="Continue to setup"
          onPress={() => router.replace('/')}
          tone="auth"
        />
      </View>
    </AuthScreen>
  );
}
