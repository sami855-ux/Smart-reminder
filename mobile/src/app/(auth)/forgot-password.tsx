import { useState } from 'react';
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
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';
import { TextLink } from '../../components/ui/TextLink';

const GENERIC_CONFIRMATION =
  'If an eligible account exists for that address, password-reset instructions are on the way.';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
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
    setSubmitError(null);
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(formErrorMessage(error));
    }
  });

  return (
    <Screen
      description="Enter your email and we’ll send recovery instructions when the account is eligible."
      eyebrow="Account recovery"
      title="Reset your password"
    >
      <View className="gap-4">
        <FormMessage
          message={submitted ? GENERIC_CONFIRMATION : submitError}
          tone={submitted ? 'success' : 'error'}
        />

        {!submitted ? (
          <>
            <Controller
              control={control}
              name="email"
              render={({ field: { onBlur, onChange, value }, fieldState }) => (
                <TextField
                  autoCapitalize="none"
                  autoComplete="email"
                  error={fieldState.error?.message}
                  keyboardType="email-address"
                  label="Email"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  onSubmitEditing={() => void submit()}
                  returnKeyType="send"
                  textContentType="emailAddress"
                  value={value}
                />
              )}
            />
            <Button
              label="Send recovery instructions"
              loading={isSubmitting}
              onPress={() => void submit()}
            />
          </>
        ) : null}

        <TextLink
          label="Back to sign in"
          onPress={() => router.replace('/(auth)/sign-in')}
        />
      </View>
    </Screen>
  );
}
