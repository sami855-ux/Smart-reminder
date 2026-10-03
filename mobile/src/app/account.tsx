import { useState } from 'react';
import type { ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
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
import { AlertDialog } from '../components/ui/AlertDialog';
import { AppleSwitch } from '../components/ui/AppleSwitch';
import { AuthIcon } from '../components/ui/AuthIcon';
import { OneUIHeader } from '../components/ui/OneUIHeader';
import { SymbolIcon, type SymbolName } from '../components/ui/SymbolIcon';
import { TextField } from '../components/ui/TextField';
import { ToastViewport, useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/cn';
import { useAppTheme } from '../theme/theme-context';

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
  const { colors, isDark, setMode } = useAppTheme();
  const { showToast } = useToast();
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [logoutAllDialogOpen, setLogoutAllDialogOpen] = useState(false);
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
    setLogoutAllDialogOpen(true);
  }

  const prepareDeletion = handleSubmit(
    ({ password }) => {
      setDeletePassword(password);
      setDeleteOpen(false);
      setTimeout(() => setDeleteConfirmOpen(true), 220);
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
      setDeleteConfirmOpen(false);
      setDeleteOpen(true);
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
        <ScrollView
          alwaysBounceVertical={false}
          className="flex-1"
          contentContainerClassName="pb-12"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[680px] self-center">
            <OneUIHeader
              onBack={() => router.back()}
              subtitle="Account, preferences, privacy, and active sessions."
              title="Settings"
            />

            <View className="px-5">
              <View className="flex-row items-center rounded-[20px] bg-paper p-4">
                <View className="size-14 items-center justify-center rounded-[18px] bg-ink">
                  <Text className="font-inter-bold text-[22px] uppercase text-kast-lime">
                  {user.email.slice(0, 1)}
                  </Text>
                </View>
                <View className="ml-4 min-w-0 flex-1">
                  <Text className="font-inter-semibold text-[17px] text-foreground" numberOfLines={1}>
                    {user.email}
                  </Text>
                  <View className="mt-1.5 flex-row items-center">
                    <View
                      className={cn(
                        'mr-2 size-2 rounded-full',
                        user.emailVerifiedAt ? 'bg-success' : 'bg-warning',
                      )}
                    />
                    <Text
                      className={cn(
                        'font-inter-medium text-[13px]',
                        user.emailVerifiedAt ? 'text-success' : 'text-warning',
                      )}
                    >
                      {user.emailVerifiedAt ? 'Verified account' : 'Verification needed'}
                    </Text>
                  </View>
                </View>
              </View>

            <SectionLabel>ACCOUNT</SectionLabel>
            <SettingsGroup>
              {!user.emailVerifiedAt ? (
                <SettingsAction
                  description="Send a fresh verification link to your inbox"
                  icon="check"
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
                icon="person"
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

            <SectionLabel>PREFERENCES</SectionLabel>
            <SettingsGroup>
              <AppearanceToggle
                iconColor={colors.accent}
                isDark={isDark}
                onValueChange={(enabled) => setMode(enabled ? 'dark' : 'light')}
              />
              <SettingsAction
                description="Manage quiet hours, privacy, permission, and signed-in devices"
                divider
                icon="notification"
                onPress={() => router.push('/notification-settings')}
                title="Notifications and devices"
              />
              <SettingsAction
                description="Preview the impact before changing how reminder times display"
                divider
                icon="clock"
                onPress={() => router.push('/timezone-settings')}
                title="Timezone and schedule impact"
              />
            </SettingsGroup>

            <SectionLabel>DATA &amp; PRIVACY</SectionLabel>
            <SettingsGroup>
              <SettingsAction
                description="Download a portable copy of your account data"
                icon="history"
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
                icon="back"
                loading={busyAction === 'logout'}
                onPress={() => setLogoutDialogOpen(true)}
                title="Sign out on this device"
              />
              <SettingsAction
                description="Revoke access on every signed-in device"
                divider
                icon="settings"
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
                icon="delete"
                onPress={() => setDeleteOpen(true)}
                title="Delete account"
                tone="destructive"
              />
            </SettingsGroup>
            <Text className="px-4 pt-2 text-[13px] font-inter leading-[18px] text-muted-foreground/60">
              Deleting your account signs you out everywhere and cannot be undone.
            </Text>
            </View>
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
                <Text className="text-[17px] font-inter text-accent">Cancel</Text>
              </Pressable>
              <Text className="text-[17px] font-inter-semibold text-foreground">Delete account</Text>
              <View className="w-[62px]" />
            </View>

            <ScrollView
              contentContainerClassName="flex-grow px-5 pb-8 pt-10"
              keyboardShouldPersistTaps="handled"
            >
              <View className="w-full max-w-[520px] self-center">
                <View className="size-16 items-center justify-center rounded-full bg-urgent-soft">
                  <Text className="text-[30px] font-inter-semibold text-urgent">!</Text>
                </View>
                <Text
                  accessibilityRole="header"
                  className="mt-6 text-[30px] font-inter-bold leading-[36px] text-foreground"
                >
                  This action is permanent
                </Text>
                <Text className="mt-3 text-[16px] font-inter leading-6 text-muted-foreground/80">
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
                    <Text className="text-[17px] font-inter-semibold text-white">
                      Continue to delete account
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <AlertDialog
        confirmLabel="Sign out"
        loading={busyAction === 'logout'}
        message="You’ll need to sign in again on this phone. Your reminders and account stay intact."
        title="Sign out on this device?"
        visible={logoutDialogOpen}
        onCancel={() => setLogoutDialogOpen(false)}
        onConfirm={() =>
          void runAction('logout', async () => {
            await logout();
            setLogoutDialogOpen(false);
          })
        }
      />

      <AlertDialog
        confirmLabel="Sign out everywhere"
        loading={busyAction === 'logout-all'}
        message="Every Smart Reminder session will be revoked, including this device."
        title="Sign out everywhere?"
        tone="destructive"
        visible={logoutAllDialogOpen}
        onCancel={() => setLogoutAllDialogOpen(false)}
        onConfirm={() =>
          void runAction('logout-all', async () => {
            await logoutAll();
            setLogoutAllDialogOpen(false);
          })
        }
      />

      <AlertDialog
        confirmLabel="Delete account"
        loading={deleting}
        message="Your account will be disabled immediately and primary data scheduled for deletion. This cannot be undone."
        title="Delete your account?"
        tone="destructive"
        visible={deleteConfirmOpen}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setDeleteOpen(true);
        }}
        onConfirm={() => void performDeletion(deletePassword)}
      />
    </>
  );
}

function AppearanceToggle({
  iconColor,
  isDark,
  onValueChange,
}: {
  iconColor: string;
  isDark: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-[76px] flex-row items-center px-4 py-3">
      <View className="size-10 items-center justify-center rounded-[12px] bg-secondary-fill">
        <AuthIcon color={iconColor} name={isDark ? 'moon' : 'sun'} size={19} />
      </View>
      <View className="ml-4 flex-1 pr-3">
        <Text className="text-[16px] font-inter-medium text-foreground">Dark appearance</Text>
        <Text className="mt-0.5 text-[13px] font-inter leading-[18px] text-muted-foreground/60">
          {isDark ? 'Dark theme is active' : 'Light theme is active'}
        </Text>
      </View>
      <AppleSwitch
        label="Use dark appearance"
        value={isDark}
        onValueChange={onValueChange}
      />
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 ml-3 mt-7 font-inter-semibold text-[12px] text-muted-foreground">
      {children}
    </Text>
  );
}

function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <View className="overflow-hidden rounded-[18px] bg-paper">
      {children}
    </View>
  );
}

function SettingsAction({
  title,
  description,
  onPress,
  icon,
  divider = false,
  loading = false,
  tone = 'default',
}: {
  title: string;
  description: string;
  onPress: () => void;
  icon: SymbolName;
  divider?: boolean;
  loading?: boolean;
  tone?: 'default' | 'destructive';
}) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      className={cn(
        'min-h-[72px] justify-center px-4 py-3 active:bg-canvas',
        divider && 'border-t border-secondary-fill',
      )}
      disabled={loading}
      onPress={onPress}
    >
      <View className="flex-row items-center gap-4">
        <View
          className={cn(
            'size-10 items-center justify-center rounded-[12px]',
            tone === 'destructive' ? 'bg-urgent-soft' : 'bg-secondary-fill',
          )}
        >
          <SymbolIcon
            className={tone === 'destructive' ? 'text-urgent' : 'text-foreground'}
            name={icon}
            size={19}
          />
        </View>
        <View className="flex-1">
          <Text
            className={cn(
              'text-[16px] font-inter-medium',
              tone === 'destructive' ? 'text-urgent' : 'text-foreground',
            )}
          >
            {title}
          </Text>
          <Text className="mt-0.5 text-[13px] font-inter leading-[18px] text-muted-foreground/60">
            {description}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color={tone === 'destructive' ? '#B94A42' : colors.accent} />
        ) : (
          <SymbolIcon
            className={tone === 'destructive' ? 'text-urgent' : 'text-subtle-foreground'}
            name="chevron"
            size={22}
          />
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
