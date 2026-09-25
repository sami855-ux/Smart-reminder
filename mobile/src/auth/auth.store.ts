import { create } from 'zustand';

import type { AuthUser } from './auth.schemas';

export type AuthStatus =
  | 'bootstrapping'
  | 'authenticated'
  | 'unauthenticated'
  | 'restoration-error';

type AuthState = {
  status: AuthStatus;
  accessToken: string | null;
  accessTokenExpiresAt: number | null;
  user: AuthUser | null;
  setSession: (input: {
    accessToken: string;
    expiresInSeconds: number;
    user: AuthUser;
  }) => void;
  updateUser: (user: AuthUser) => void;
  setStatus: (status: AuthStatus) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'bootstrapping',
  accessToken: null,
  accessTokenExpiresAt: null,
  user: null,
  setSession: ({ accessToken, expiresInSeconds, user }) =>
    set({
      status: 'authenticated',
      accessToken,
      accessTokenExpiresAt: Date.now() + expiresInSeconds * 1_000,
      user,
    }),
  updateUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clearSession: () =>
    set({
      status: 'unauthenticated',
      accessToken: null,
      accessTokenExpiresAt: null,
      user: null,
    }),
}));
