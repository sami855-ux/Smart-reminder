import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import {
  actionTokenSchema,
  resetPasswordFormSchema,
  type ResetPasswordForm,
} from '../../auth/auth.schemas';
import { formErrorMessage } from '../../auth/form-error';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { completePasswordReset } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;
  const tokenResult = actionTokenSchema.safeParse(tokenValue);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
    mode: 'onBlur',
  });

  const submit = handleSubmit(async ({ newPassword }) => {
    if (!tokenResult.success) return;
    setSubmitError(null);
    try {
      await completePasswordReset(tokenResult.data, newPassword);
      router.replace({
        pathname: '/(auth)/sign-in',
        params: { message: 'Password updated. Sign in with your new password.' },
      });
    } catch (error) {
      setSubmitError(formErrorMessage(error));
    }
  });

  return (
    <Screen
      description="Choose a new password for your Smart Reminder account."
      eyebrow="Secure recovery"
      title="Create a new password"
    >
      <View className="gap-4">
        <FormMessage
          message={
            tokenResult.success
              ? submitError
              : 'This password-reset link is invalid or incomplete. Request a new link.'
          }
        />

        {tokenResult.success ? (
          <>
            <Controller
              control={control}
              name="newPassword"
              render={({ field: { onBlur, onChange, value }, fieldState }) => (
                <TextField
                  autoCapitalize="none"
                  autoComplete="new-password"
                  error={fieldState.error?.message}
                  label="New password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  secureTextEntry
                  textContentType="newPassword"
                  value={value}
                />
              )}
            />
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onBlur, onChange, value }, fieldState }) => (
                <TextField
                  autoCapitalize="none"
                  autoComplete="new-password"
                  error={fieldState.error?.message}
                  label="Confirm new password"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  onSubmitEditing={() => void submit()}
                  returnKeyType="done"
                  secureTextEntry
                  textContentType="newPassword"
                  value={value}
                />
              )}
            />
            <Button
              label="Update password"
              loading={isSubmitting}
              onPress={() => void submit()}
            />
          </>
        ) : (
          <Button
            label="Request a new link"
            onPress={() => router.replace('/(auth)/forgot-password')}
          />
        )}
      </View>
    </Screen>
  );
}
