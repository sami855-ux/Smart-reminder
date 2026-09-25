import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import {
  forgotPasswordFormSchema,
  type ForgotPasswordForm,
} from '../../auth/auth.schemas';
import { formErrorMessage } from '../../auth/form-error';
import { AuthScreen } from '../../components/auth/AuthScreen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { TextLink } from '../../components/ui/TextLink';
import { useToast } from '../../components/ui/ToastProvider';

const GENERIC_CONFIRMATION =
  'If an eligible account exists for that address, password-reset instructions are on the way.';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const { showToast } = useToast();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });

  const submit = handleSubmit(async ({ email }) => {
    try {
      await requestPasswordReset(email);
      showToast({
        title: 'Check your inbox',
        message: GENERIC_CONFIRMATION,
        tone: 'success',
      });
    } catch (error) {
      showToast({
        title: 'Couldn’t send the email',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  });

  return (
    <AuthScreen
      description="Enter the email address connected to your account. We’ll send a secure reset link if the account is eligible."
      footer={
        <View className="items-center">
          <TextLink
            label="Back to sign in"
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        </View>
      }
      onBack={() => router.back()}
      title="Reset your password"
    >
      <View className="gap-5">
        <Controller
          control={control}
          name="email"
          render={({ field: { onBlur, onChange, value }, fieldState }) => (
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              error={fieldState.error?.message}
              keyboardType="email-address"
              label="Email address"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="name@example.com"
              onSubmitEditing={() => void submit()}
              returnKeyType="send"
              textContentType="emailAddress"
              value={value}
            />
          )}
        />
        <View className="mt-1">
          <Button
            label="Send reset link"
            loading={isSubmitting}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </AuthScreen>
  );
}
