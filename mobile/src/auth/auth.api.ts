import { Platform } from 'react-native';

import {
  acceptAuthResponse,
  apiClient,
  publicApiClient,
  requestWithAccessToken,
} from '../api/client';
import { toApiError } from '../api/errors';
import {
  accountDeletionResponseSchema,
  actionTokenSchema,
  authUserSchema,
  exportResponseSchema,
  type AccountExport,
  type AuthUser,
} from './auth.schemas';
import { useAuthStore } from './auth.store';
import { clearLocalSession } from './session-cleanup';

const deviceName = `Smart Reminder ${Platform.OS} device`;

export async function login(input: {
  email: string;
  password: string;
}): Promise<void> {
  try {
    const response = await publicApiClient.post('/auth/login', {
      ...input,
      deviceName,
    });
    await acceptAuthResponse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function register(input: {
  email: string;
  password: string;
}): Promise<void> {
  try {
    const response = await publicApiClient.post('/auth/register', {
      ...input,
      deviceName,
    });
    await acceptAuthResponse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getMe(): Promise<AuthUser> {
  const user = await requestWithAccessToken(
    { method: 'GET', url: '/auth/me' },
    authUserSchema,
  );
  useAuthStore.getState().updateUser(user);
  return user;
}

export async function requestEmailVerification(): Promise<void> {
  try {
    await apiClient.post('/auth/email-verification/request');
  } catch (error) {
    throw toApiError(error);
  }
}

export async function verifyEmail(tokenInput: string): Promise<void> {
  const token = actionTokenSchema.parse(tokenInput);
  try {
    await publicApiClient.post('/auth/email-verification/complete', { token });
    if (useAuthStore.getState().status === 'authenticated') {
      await getMe();
    }
  } catch (error) {
    throw toApiError(error);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await publicApiClient.post('/auth/password-reset/request', { email });
  } catch (error) {
    throw toApiError(error);
  }
}

export async function completePasswordReset(
  tokenInput: string,
  newPassword: string,
): Promise<void> {
  const token = actionTokenSchema.parse(tokenInput);
  try {
    await publicApiClient.post('/auth/password-reset/complete', {
      token,
      newPassword,
    });
    await clearLocalSession();
  } catch (error) {
    throw toApiError(error);
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Local sign-out must still complete if the API is temporarily unreachable.
  } finally {
    await clearLocalSession();
  }
}

export async function logoutAll(): Promise<void> {
  try {
    await apiClient.post('/auth/logout-all');
  } catch (error) {
    throw toApiError(error);
  }
  await clearLocalSession();
}

export async function exportAccountData(): Promise<AccountExport> {
  try {
    return await requestWithAccessToken(
      { method: 'GET', url: '/auth/export' },
      exportResponseSchema,
    );
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteAccount(password: string): Promise<string> {
  try {
    const response = await apiClient.delete('/auth/account', {
      data: { password },
    });
    let deletion: ReturnType<typeof accountDeletionResponseSchema.parse>;
    try {
      deletion = accountDeletionResponseSchema.parse(response.data);
    } finally {
      await clearLocalSession();
    }
    return deletion.purgeAfter;
  } catch (error) {
    throw toApiError(error);
  }
}
