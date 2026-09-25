import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import {
  confirmPasswordFormSchema,
  type ConfirmPasswordForm,
} from '../auth/auth.schemas';
import { formErrorMessage } from '../auth/form-error';
import { shareAccountExport } from '../auth/share-account-export';
import { Button } from '../components/ui/Button';
import { FormMessage } from '../components/ui/FormMessage';
import { Screen } from '../components/ui/Screen';
import { TextField } from '../components/ui/TextField';
import { cn } from '../lib/cn';

export default function AccountScreen() {
  const router = useRouter();
  const {
    status,
    user,
    logout,
    logoutAll,
    requestEmailVerification,
    refreshUser,
    exportAccountData,
    deleteAccount,
  } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    'verify' | 'refresh' | 'export' | 'logout' | 'logout-all' | null
  >(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConfirmPasswordForm>({
    resolver: zodResolver(confirmPasswordFormSchema),
    defaultValues: { password: '' },
  });

  if (status !== 'authenticated' || !user) return <Redirect href="/" />;

  async function runAction(
    action: NonNullable<typeof busyAction>,
    operation: () => Promise<void>,
  ) {
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      await operation();
    } catch (actionError) {
      setError(formErrorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  function confirmLogoutAll() {
    Alert.alert(
      'Sign out everywhere?',
      'Every Smart Reminder session will be revoked, including this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out everywhere',
          style: 'destructive',
          onPress: () =>
            void runAction('logout-all', async () => {
              await logoutAll();
            }),
        },
      ],
    );
  }

  const prepareDeletion = handleSubmit(({ password }) => {
    Alert.alert(
      'Delete your account?',
      'Your account will be disabled immediately and primary data scheduled for deletion. This cannot be undone in the MVP.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => void performDeletion(password),
        },
      ],
    );
  });

  async function performDeletion(password: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const purgeAfter = await deleteAccount(password);
      setDeleteOpen(false);
      reset();
      router.replace({
        pathname: '/(auth)/sign-in',
        params: {
          message: `Account deletion scheduled. Primary data is due to be purged by ${new Date(
            purgeAfter,
          ).toLocaleDateString()}.`,
        },
      });
    } catch (deletionError) {
      setDeleteError(formErrorMessage(deletionError));
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteError(null);
    reset();
  }

  return (
    <>
      <Screen
        description="Manage your identity, sessions, data export, and account lifecycle."
        eyebrow="Account and security"
        title="Your account"
      >
        <View className="gap-4">
          <FormMessage message={message} tone="success" />
          <FormMessage message={error} />

          <View className="overflow-hidden rounded-2xl border border-taupe/50 bg-paper">
            <AccountRow label="Email" value={user.email} />
            <AccountRow
              label="Verification"
              value={user.emailVerifiedAt ? 'Verified' : 'Not verified'}
              valueTone={user.emailVerifiedAt ? 'success' : 'urgent'}
            />
          </View>

          {!user.emailVerifiedAt ? (
            <Button
              label="Resend verification email"
              loading={busyAction === 'verify'}
              onPress={() =>
                void runAction('verify', async () => {
                  await requestEmailVerification();
                  setMessage('A fresh verification link has been requested.');
                })
              }
              variant="secondary"
            />
          ) : null}

          <Button
            label="Refresh account status"
            loading={busyAction === 'refresh'}
            onPress={() =>
              void runAction('refresh', async () => {
                await refreshUser();
                setMessage('Account status is up to date.');
              })
            }
            variant="secondary"
          />

          <View className="mt-2">
            <Text className="mb-3 font-inter-semibold text-lg text-ink">
              Data and sessions
            </Text>
            <View className="gap-2.5">
              <Button
                label="Export my data"
                loading={busyAction === 'export'}
                onPress={() =>
                  void runAction('export', async () => {
                    const data = await exportAccountData();
                    await shareAccountExport(data);
                  })
                }
                variant="secondary"
              />
              <Button
                label="Sign out on this device"
                loading={busyAction === 'logout'}
                onPress={() =>
                  void runAction('logout', async () => {
                    await logout();
                  })
                }
                variant="secondary"
              />
              <Button
                label="Sign out on all devices"
                loading={busyAction === 'logout-all'}
                onPress={confirmLogoutAll}
                variant="text"
              />
            </View>
          </View>

          <View className="mt-4 border-t border-taupe/50 pt-5">
            <Text className="font-inter-semibold text-lg text-ink">
              Delete account
            </Text>
            <Text className="mt-1 font-inter text-sm leading-5 text-muted-ink">
              This disables the account immediately and revokes every session.
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mt-3 min-h-[50px] items-center justify-center rounded-xl border border-urgent active:opacity-70"
              onPress={() => setDeleteOpen(true)}
            >
              <Text className="font-inter-semibold text-[15px] text-urgent">
                Delete my account
              </Text>
            </Pressable>
          </View>
        </View>
      </Screen>

      <Modal
        animationType="fade"
        onRequestClose={closeDeleteModal}
        transparent
        visible={deleteOpen}
      >
        <SafeAreaView
          accessibilityViewIsModal
          className="flex-1 justify-end bg-ink/50"
        >
          <View className="rounded-t-3xl bg-canvas px-6 pb-6 pt-5">
            <View className="mb-5 flex-row items-start justify-between gap-4">
              <View className="flex-1">
                <Text accessibilityRole="header" className="font-inter-semibold text-2xl text-ink">
                  Confirm account deletion
                </Text>
                <Text className="mt-2 font-inter text-sm leading-5 text-muted-ink">
                  Enter your password. You’ll receive one final confirmation
                  before anything changes.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close account deletion"
                accessibilityRole="button"
                className="size-11 items-center justify-center active:opacity-70"
                disabled={deleting}
                onPress={closeDeleteModal}
              >
                <Text className="font-inter text-2xl text-ink">×</Text>
              </Pressable>
            </View>

            <View className="gap-4">
              <FormMessage message={deleteError} />
              <Controller
                control={control}
                name="password"
                render={({ field: { onBlur, onChange, value } }) => (
                  <TextField
                    autoCapitalize="none"
                    autoComplete="current-password"
                    error={errors.password?.message}
                    label="Password"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    onSubmitEditing={() => void prepareDeletion()}
                    returnKeyType="done"
                    secureTextEntry
                    textContentType="password"
                    value={value}
                  />
                )}
              />
              <Button
                label="Review account deletion"
                loading={deleting}
                onPress={() => void prepareDeletion()}
              />
              <Button
                disabled={deleting}
                label="Cancel"
                onPress={closeDeleteModal}
                variant="text"
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function AccountRow({
  label,
  value,
  valueTone = 'default',
}: {
  label: string;
  value: string;
  valueTone?: 'default' | 'success' | 'urgent';
}) {
  const toneClass =
    valueTone === 'success'
      ? 'text-success'
      : valueTone === 'urgent'
        ? 'text-urgent'
        : 'text-ink';

  return (
    <View className="min-h-[56px] flex-row items-center justify-between border-b border-taupe/30 px-5 py-3">
      <Text className="font-inter text-sm text-muted-ink">{label}</Text>
      <Text
        className={cn(
          'ml-5 flex-1 text-right font-inter-medium text-sm',
          toneClass,
        )}
      >
        {value}
      </Text>
    </View>
  );
}
