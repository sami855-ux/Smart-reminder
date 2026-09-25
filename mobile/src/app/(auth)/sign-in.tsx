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
      description="Use your email and password to continue to your reminders."
      footer={
        <View className="flex-row flex-wrap items-center justify-center gap-1">
          <Text className="text-sm font-normal text-muted-ink">New here?</Text>
          <TextLink
            label="Create an account"
            onPress={() => router.push('/(auth)/register')}
          />
        </View>
      }
      title="Sign in"
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
              placeholder="Enter your password"
              returnKeyType="done"
              secureTextEntry
              textContentType="password"
              value={value}
            />
          )}
        />

        <View className="items-end">
          <TextLink
            label="Forgot password?"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
        </View>

        <View className="mt-1">
          <Button
            label="Sign in"
            loading={isSubmitting}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </AuthScreen>
  );
}
