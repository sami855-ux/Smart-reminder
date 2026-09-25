import { useState } from 'react';
import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import {
  confirmPasswordFormSchema,
  type ConfirmPasswordForm,
} from '../auth/auth.schemas';
import { formErrorMessage } from '../auth/form-error';
import { shareAccountExport } from '../auth/share-account-export';
import { TextField } from '../components/ui/TextField';
import { ToastViewport, useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';

type BusyAction = 'verify' | 'refresh' | 'export' | 'logout' | 'logout-all';

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
  const { showToast } = useToast();
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
  } = useForm<ConfirmPasswordForm>({
    resolver: zodResolver(confirmPasswordFormSchema),
    defaultValues: { password: '' },
  });

  if (status !== 'authenticated' || !user) return <Redirect href="/" />;

  async function runAction(action: BusyAction, operation: () => Promise<void>) {
    setBusyAction(action);
    try {
      await operation();
    } catch (actionError) {
      showToast({
        title: actionErrorTitle(action),
        message: formErrorMessage(actionError),
        tone: 'error',
      });
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

  const prepareDeletion = handleSubmit(
    ({ password }) => {
      Alert.alert(
        'Delete your account?',
        'Your account will be disabled immediately and primary data scheduled for deletion. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete account',
            style: 'destructive',
            onPress: () => void performDeletion(password),
          },
        ],
      );
    },
    (validationErrors) => {
      showToast({
        title: 'Password required',
        message:
          validationErrors.password?.message ??
          'Enter your password before continuing.',
        tone: 'error',
      });
    },
  );

  async function performDeletion(password: string) {
    setDeleting(true);
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
      showToast({
        title: 'Couldn’t delete your account',
        message: formErrorMessage(deletionError),
        tone: 'error',
      });
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteOpen(false);
    reset();
  }

  return (
    <>
      <SafeAreaView className="flex-1 bg-canvas" edges={['top']}>
        <View className="h-12 flex-row items-center px-2">
          <Pressable
            accessibilityLabel="Back to Today"
            accessibilityRole="button"
            className="min-h-11 flex-row items-center px-2 active:opacity-60"
            onPress={() => router.back()}
          >
            <Text className="mr-1 text-[32px] font-light leading-9 text-intelligence">
              ‹
            </Text>
            <Text className="text-[17px] font-normal text-intelligence">Today</Text>
          </Pressable>
        </View>

        <ScrollView
          alwaysBounceVertical={false}
          className="flex-1"
          contentContainerClassName="pb-12"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[680px] self-center px-5">
            <Text
              accessibilityRole="header"
              className="text-[34px] font-bold leading-[41px] text-ink"
            >
              Account
            </Text>

            <View className="items-center pb-6 pt-7">
              <View className="size-20 items-center justify-center rounded-full bg-intelligence">
                <Text className="text-[30px] font-semibold uppercase text-white">
                  {user.email.slice(0, 1)}
                </Text>
              </View>
              <Text
                className="mt-4 max-w-full text-center text-[20px] font-semibold text-ink"
                numberOfLines={1}
              >
                {user.email}
              </Text>
              <View
                className={cn(
                  'mt-2 rounded-full px-3 py-1.5',
                  user.emailVerifiedAt ? 'bg-success-soft' : 'bg-urgent-soft',
                )}
              >
                <Text
                  className={cn(
                    'text-[13px] font-semibold',
                    user.emailVerifiedAt ? 'text-success' : 'text-urgent',
                  )}
                >
                  {user.emailVerifiedAt ? 'Email verified' : 'Email not verified'}
                </Text>
              </View>
            </View>

            <SectionLabel>ACCOUNT</SectionLabel>
            <SettingsGroup>
              {!user.emailVerifiedAt ? (
                <SettingsAction
                  description="Send a fresh verification link to your inbox"
                  loading={busyAction === 'verify'}
                  onPress={() =>
                    void runAction('verify', async () => {
                      await requestEmailVerification();
                      showToast({
                        title: 'Verification email sent',
                        message: 'Check your inbox and spam folder for the new link.',
                        tone: 'success',
                      });
                    })
                  }
                  title="Verify email address"
                />
              ) : null}
              <SettingsAction
                description="Check for the latest verification and security details"
                divider={!user.emailVerifiedAt}
                loading={busyAction === 'refresh'}
                onPress={() =>
                  void runAction('refresh', async () => {
                    await refreshUser();
                    showToast({
                      title: 'Account status updated',
                      message: 'Your latest account details are now shown.',
                      tone: 'success',
                    });
                  })
                }
                title="Refresh account status"
              />
            </SettingsGroup>

            <SectionLabel>DATA &amp; PRIVACY</SectionLabel>
            <SettingsGroup>
              <SettingsAction
                description="Download a portable copy of your account data"
                loading={busyAction === 'export'}
                onPress={() =>
                  void runAction('export', async () => {
                    const data = await exportAccountData();
                    await shareAccountExport(data);
                  })
                }
                title="Export account data"
              />
            </SettingsGroup>

            <SectionLabel>SESSIONS</SectionLabel>
            <SettingsGroup>
              <SettingsAction
                description="End only the session on this phone"
                loading={busyAction === 'logout'}
                onPress={() =>
                  void runAction('logout', async () => {
                    await logout();
                  })
                }
                title="Sign out on this device"
              />
              <SettingsAction
                description="Revoke access on every signed-in device"
                divider
                loading={busyAction === 'logout-all'}
                onPress={confirmLogoutAll}
                title="Sign out everywhere"
                tone="destructive"
              />
            </SettingsGroup>

            <SectionLabel>ACCOUNT CONTROL</SectionLabel>
            <SettingsGroup>
              <SettingsAction
                description="Disable your account and schedule its data for deletion"
                onPress={() => setDeleteOpen(true)}
                title="Delete account"
                tone="destructive"
              />
            </SettingsGroup>
            <Text className="px-4 pt-2 text-[13px] font-normal leading-[18px] text-muted-ink/60">
              Deleting your account signs you out everywhere and cannot be undone.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal
        animationType="slide"
        onRequestClose={closeDeleteModal}
        presentationStyle="fullScreen"
        visible={deleteOpen}
      >
        <SafeAreaView className="flex-1 bg-canvas">
          <ToastViewport />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            className="flex-1"
          >
            <View className="h-12 flex-row items-center justify-between border-b border-taupe/50 bg-paper px-4">
              <Pressable
                accessibilityLabel="Cancel account deletion"
                accessibilityRole="button"
                className="min-h-11 justify-center pr-3 active:opacity-60"
                disabled={deleting}
                onPress={closeDeleteModal}
              >
                <Text className="text-[17px] font-normal text-intelligence">Cancel</Text>
              </Pressable>
              <Text className="text-[17px] font-semibold text-ink">Delete account</Text>
              <View className="w-[62px]" />
            </View>

            <ScrollView
              contentContainerClassName="flex-grow px-5 pb-8 pt-10"
              keyboardShouldPersistTaps="handled"
            >
              <View className="w-full max-w-[520px] self-center">
                <View className="size-16 items-center justify-center rounded-full bg-urgent-soft">
                  <Text className="text-[30px] font-semibold text-urgent">!</Text>
                </View>
                <Text
                  accessibilityRole="header"
                  className="mt-6 text-[30px] font-bold leading-[36px] text-ink"
                >
                  This action is permanent
                </Text>
                <Text className="mt-3 text-[16px] font-normal leading-6 text-muted-ink/80">
                  Your account will be disabled immediately, every session will be
                  revoked, and your primary data will be scheduled for deletion.
                </Text>

                <View className="mt-8">
                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onBlur, onChange, value } }) => (
                      <TextField
                        autoCapitalize="none"
                        autoComplete="current-password"
                        label="Confirm with your password"
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
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: deleting, busy: deleting }}
                  className={cn(
                    'mt-5 min-h-[52px] items-center justify-center rounded-full bg-urgent px-6 active:opacity-70',
                    deleting && 'opacity-50',
                  )}
                  disabled={deleting}
                  onPress={() => void prepareDeletion()}
                >
                  {deleting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-[17px] font-semibold text-white">
                      Continue to delete account
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 ml-4 mt-5 text-[13px] font-medium text-muted-ink/60">
      {children}
    </Text>
  );
}

function SettingsGroup({ children }: { children: ReactNode }) {
  return <View className="overflow-hidden rounded-2xl bg-paper">{children}</View>;
}

function SettingsAction({
  title,
  description,
  onPress,
  divider = false,
  loading = false,
  tone = 'default',
}: {
  title: string;
  description: string;
  onPress: () => void;
  divider?: boolean;
  loading?: boolean;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      className={cn(
        'min-h-[68px] justify-center px-4 py-3 active:bg-canvas',
        divider && 'border-t border-taupe/50',
      )}
      disabled={loading}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-4">
        <View className="flex-1">
          <Text
            className={cn(
              'text-[16px] font-medium',
              tone === 'destructive' ? 'text-urgent' : 'text-ink',
            )}
          >
            {title}
          </Text>
          <Text className="mt-0.5 text-[13px] font-normal leading-[18px] text-muted-ink/60">
            {description}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color={tone === 'destructive' ? '#FF3B30' : '#007AFF'} />
        ) : (
          <Text
            className={cn(
              'text-[24px] font-light',
              tone === 'destructive' ? 'text-urgent' : 'text-subtle-ink',
            )}
          >
            ›
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function actionErrorTitle(action: BusyAction): string {
  switch (action) {
    case 'verify':
      return 'Couldn’t send the verification email';
    case 'refresh':
      return 'Couldn’t refresh your account';
    case 'export':
      return 'Couldn’t export your data';
    case 'logout':
      return 'Couldn’t sign you out';
    case 'logout-all':
      return 'Couldn’t sign out every device';
  }
}
