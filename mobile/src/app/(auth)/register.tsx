import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import {
  registerFormSchema,
  type RegisterForm,
} from '../../auth/auth.schemas';
import { formErrorMessage } from '../../auth/form-error';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';
import { TextLink } from '../../components/ui/TextLink';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
    mode: 'onBlur',
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    try {
      await register({ email, password });
      router.replace('/(auth)/check-email');
    } catch (error) {
      setSubmitError(formErrorMessage(error));
    }
  });

  return (
    <Screen
      description="Create one secure account for your reminder preferences and future devices."
      eyebrow="Create account"
      title="Start with the essentials"
    >
      <View className="gap-4">
        <FormMessage message={submitError} />

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
              returnKeyType="next"
              textContentType="emailAddress"
              value={value}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onBlur, onChange, value }, fieldState }) => (
            <TextField
              autoCapitalize="none"
              autoComplete="new-password"
              error={fieldState.error?.message}
              label="Password"
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
              label="Confirm password"
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

        <Text className="font-inter text-[13px] leading-5 text-muted-ink">
          Use at least 12 characters. Your password is sent only to the Smart
          Reminder API over HTTPS and is never stored by the app.
        </Text>

        <Button
          label="Create account"
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>

      <View className="mt-8 flex-row flex-wrap items-center justify-center gap-1">
        <Text className="font-inter text-sm text-muted-ink">
          Already have an account?
        </Text>
        <TextLink
          label="Sign in"
          onPress={() => router.replace('/(auth)/sign-in')}
        />
      </View>
    </Screen>
  );
}
