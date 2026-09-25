import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { restoreSession } from '../api/client';
import { toApiError } from '../api/errors';
import * as authApi from './auth.api';
import type { AccountExport, AuthUser } from './auth.schemas';
import { useAuthStore, type AuthStatus } from './auth.store';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  restorationMessage: string | null;
  retryRestoration: () => Promise<void>;
  login: typeof authApi.login;
  register: typeof authApi.register;
  logout: typeof authApi.logout;
  logoutAll: typeof authApi.logoutAll;
  requestEmailVerification: typeof authApi.requestEmailVerification;
  refreshUser: typeof authApi.getMe;
  verifyEmail: typeof authApi.verifyEmail;
  requestPasswordReset: typeof authApi.requestPasswordReset;
  completePasswordReset: typeof authApi.completePasswordReset;
  exportAccountData: () => Promise<AccountExport>;
  deleteAccount: typeof authApi.deleteAccount;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const [restorationMessage, setRestorationMessage] = useState<string | null>(null);

  const retryRestoration = useCallback(async () => {
    useAuthStore.getState().setStatus('bootstrapping');
    setRestorationMessage(null);
    try {
      await restoreSession();
    } catch (error) {
      const apiError = toApiError(error);
      if (useAuthStore.getState().status === 'restoration-error') {
        setRestorationMessage(apiError.message);
      }
    }
  }, [setRestorationMessage]);

  useEffect(() => {
    const timeout = setTimeout(() => void retryRestoration(), 0);
    return () => clearTimeout(timeout);
  }, [retryRestoration]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      restorationMessage,
      retryRestoration,
      login: authApi.login,
      register: authApi.register,
      logout: authApi.logout,
      logoutAll: authApi.logoutAll,
      requestEmailVerification: authApi.requestEmailVerification,
      refreshUser: authApi.getMe,
      verifyEmail: authApi.verifyEmail,
      requestPasswordReset: authApi.requestPasswordReset,
      completePasswordReset: authApi.completePasswordReset,
      exportAccountData: authApi.exportAccountData,
      deleteAccount: authApi.deleteAccount,
    }),
    [restorationMessage, retryRestoration, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
