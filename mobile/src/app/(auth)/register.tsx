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
import { AuthScreen } from '../../components/auth/AuthScreen';
import { AuthIcon } from '../../components/ui/AuthIcon';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { TextLink } from '../../components/ui/TextLink';
import { useToast } from '../../components/ui/ToastProvider';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const { showToast } = useToast();
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
    try {
      await register({ email, password });
      router.replace('/(auth)/check-email');
    } catch (error) {
      showToast({
        title: 'Couldn’t create your account',
        message: formErrorMessage(error),
        tone: 'error',
      });
    }
  });

  return (
    <AuthScreen
      appearance="auth"
      description="Create an account to keep your reminders secure and available across your devices."
      footer={
        <View className="flex-row flex-wrap items-center justify-center gap-1">
          <Text className="font-inter text-sm text-auth-muted">
            Already have an account?
          </Text>
          <TextLink
            label="Sign in"
            onPress={() => router.replace('/(auth)/sign-in')}
            tone="auth"
          />
        </View>
      }
      onBack={() => router.back()}
      title="Create your account"
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
              autoComplete="new-password"
              error={fieldState.error?.message}
              icon="lock"
              label="Password"
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="Create a password"
              secureTextEntry
              textContentType="newPassword"
              tone="auth"
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
              icon="check"
              label="Confirm password"
              onBlur={onBlur}
              onChangeText={onChange}
              onSubmitEditing={() => void submit()}
              placeholder="Enter it again"
              returnKeyType="done"
              secureTextEntry
              textContentType="newPassword"
              tone="auth"
              value={value}
            />
          )}
        />

        <View className="flex-row items-start gap-3">
          <View className="mt-0.5">
            <AuthIcon name="shield" size={18} />
          </View>
          <Text className="flex-1 font-inter text-[13px] leading-5 text-auth-muted">
            Use 12 or more characters. Skip names and commonly used passwords.
          </Text>
        </View>

        <View className="mt-1">
          <Button
            label="Create account"
            loading={isSubmitting}
            onPress={() => void submit()}
            tone="auth"
          />
        </View>
      </View>
    </AuthScreen>
  );
}
