import { useEffect } from 'react';
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
import { AuthScreen } from '../../components/auth/AuthScreen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { TextLink } from '../../components/ui/TextLink';
import { useToast } from '../../components/ui/ToastProvider';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ message?: string }>();
  const { login } = useAuth();
  const { showToast } = useToast();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!params.message) return;
    showToast({
      title: 'Account updated',
      message: params.message,
      tone: 'success',
    });
  }, [params.message, showToast]);

  const submit = handleSubmit(async (values) => {
    try {
      await login(values);
      router.replace('/');
    } catch (error) {
      showToast({
        title: 'Couldn’t sign you in',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  });

  return (
    <AuthScreen
      appearance="auth"
      description="Sign in to access your reminders and keep your schedule up to date."
      footer={
        <View className="flex-row flex-wrap items-center justify-center gap-1">
          <Text className="font-inter text-sm text-auth-muted">New here?</Text>
          <TextLink
            label="Create an account"
            onPress={() => router.push('/(auth)/register')}
            tone="auth"
          />
        </View>
      }
      title="Welcome back"
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
              icon="mail"
              keyboardType="email-address"
              label="Email address"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="name@example.com"
              returnKeyType="next"
              textContentType="emailAddress"
              tone="auth"
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
              icon="lock"
              label="Password"
              onBlur={onBlur}
              onChangeText={onChange}
              onSubmitEditing={() => void submit()}
              placeholder="Enter your password"
              returnKeyType="done"
              secureTextEntry
              textContentType="password"
              tone="auth"
              value={value}
            />
          )}
        />

        <View className="items-end">
          <TextLink
            label="Forgot password?"
            onPress={() => router.push('/(auth)/forgot-password')}
            tone="auth"
          />
        </View>

        <View className="mt-1">
          <Button
            label="Sign in"
            loading={isSubmitting}
            onPress={() => void submit()}
            tone="auth"
          />
        </View>
      </View>
    </AuthScreen>
  );
}
