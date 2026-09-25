import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { formErrorMessage } from '../../auth/form-error';
import {
  loginFormSchema,
  type LoginForm,
} from '../../auth/auth.schemas';
import { Button } from '../../components/ui/Button';
import { FormMessage } from '../../components/ui/FormMessage';
import { Screen } from '../../components/ui/Screen';
import { TextField } from '../../components/ui/TextField';
import { TextLink } from '../../components/ui/TextLink';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ message?: string }>();
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await login(values);
      router.replace('/');
    } catch (error) {
      setSubmitError(formErrorMessage(error));
    }
  });

  return (
    <Screen
      description="Use the account connected to your reminders."
      eyebrow="Smart Reminder"
      title="Welcome back"
    >
      <View className="gap-4">
        <FormMessage message={params.message ?? null} tone="success" />
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
              autoComplete="current-password"
              error={fieldState.error?.message}
              label="Password"
              onBlur={onBlur}
              onChangeText={onChange}
              onSubmitEditing={() => void submit()}
              returnKeyType="done"
              secureTextEntry
              textContentType="password"
              value={value}
            />
          )}
        />

        <TextLink
          label="Forgot password?"
          onPress={() => router.push('/(auth)/forgot-password')}
        />

        <Button
          label="Sign in"
          loading={isSubmitting}
          onPress={() => void submit()}
        />
      </View>

      <View className="mt-8 flex-row flex-wrap items-center justify-center gap-1">
        <Text className="font-inter text-sm text-muted-ink">
          New to Smart Reminder?
        </Text>
        <TextLink
          label="Create an account"
          onPress={() => router.push('/(auth)/register')}
        />
      </View>
    </Screen>
  );
}
