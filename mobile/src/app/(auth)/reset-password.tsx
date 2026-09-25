import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import {
  actionTokenSchema,
  resetPasswordFormSchema,
  type ResetPasswordForm,
} from '../../auth/auth.schemas';
import { formErrorMessage } from '../../auth/form-error';
import { AuthScreen } from '../../components/auth/AuthScreen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useToast } from '../../components/ui/ToastProvider';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const { completePasswordReset } = useAuth();
  const { showToast } = useToast();
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
    try {
      await completePasswordReset(tokenResult.data, newPassword);
      router.replace({
        pathname: '/(auth)/sign-in',
        params: { message: 'Password updated. Sign in with your new password.' },
      });
    } catch (error) {
      showToast({
        title: 'Couldn’t update your password',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  });

  return (
    <AuthScreen
      description="Choose a new password for your Smart Reminder account."
      onBack={() => router.back()}
      title="Create a new password"
    >
      <View className="gap-5">
        {!tokenResult.success ? (
          <View className="rounded-2xl bg-urgent-soft p-4">
            <Text className="text-[17px] font-semibold text-ink">
              This link can’t be used
            </Text>
            <Text className="mt-1 text-[15px] font-normal leading-5 text-muted-ink/80">
              It may be incomplete or expired. Request a new password reset
              link and try again.
            </Text>
          </View>
        ) : null}

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
    </AuthScreen>
  );
}
