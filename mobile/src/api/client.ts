import {
  create,
  isAxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { z } from 'zod';

import { authResponseSchema, type AuthResponse } from '../auth/auth.schemas';
import { useAuthStore } from '../auth/auth.store';
import { clearLocalSession } from '../auth/session-cleanup';
import { getRefreshToken, setRefreshToken } from '../auth/token-storage';
import { env } from '../config/env';
import { ApiError, toApiError } from './errors';

const REQUEST_TIMEOUT_MS = 15_000;
const EXPIRY_LEEWAY_MS = 30_000;

export const publicApiClient = create({
  baseURL: env.apiUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

export const apiClient = create({
  baseURL: env.apiUrl,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

let refreshPromise: Promise<string> | null = null;

function parseResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(
      'The server returned an unexpected response.',
      'INVALID_API_RESPONSE',
      null,
      null,
      false,
    );
  }
  return parsed.data;
}

async function rotateRefreshToken(commitSession: boolean): Promise<AuthResponse> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new ApiError(
      'Your session has ended. Sign in again.',
      'SESSION_MISSING',
      401,
      null,
      false,
    );
  }

  try {
    const response = await publicApiClient.post('/auth/refresh', { refreshToken });
    const session = parseResponse(authResponseSchema, response.data);

    try {
      await setRefreshToken(session.refreshToken);
    } catch {
      await clearLocalSession();
      throw new ApiError(
        'Your secure session could not be saved. Sign in again.',
        'SECURE_STORAGE_FAILED',
        null,
        null,
        false,
      );
    }

    if (commitSession) {
      useAuthStore.getState().setSession({
        accessToken: session.accessToken,
        expiresInSeconds: session.accessTokenExpiresInSeconds,
        user: session.user,
      });
    }

    return session;
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status === 401 || apiError.code === 'SESSION_MISSING') {
      await clearLocalSession();
    }
    throw apiError;
  }
}

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = rotateRefreshToken(true)
      .then((session) => session.accessToken)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function currentAccessToken(): Promise<string> {
  const state = useAuthStore.getState();
  if (
    state.accessToken &&
    state.accessTokenExpiresAt &&
    state.accessTokenExpiresAt > Date.now() + EXPIRY_LEEWAY_MS
  ) {
    return state.accessToken;
  }
  return refreshAccessToken();
}

apiClient.interceptors.request.use(async (config) => {
  const token = await currentAccessToken();
  config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || !error.config) {
      return Promise.reject(toApiError(error));
    }

    const config = error.config as RetryableRequestConfig;
    if (error.response?.status !== 401 || config._authRetried) {
      return Promise.reject(toApiError(error));
    }

    config._authRetried = true;
    try {
      const token = await refreshAccessToken();
      config.headers.set('Authorization', `Bearer ${token}`);
      return await apiClient.request(config);
    } catch (refreshError) {
      return Promise.reject(toApiError(refreshError));
    }
  },
);

export async function acceptAuthResponse(data: unknown): Promise<AuthResponse> {
  const session = parseResponse(authResponseSchema, data);
  try {
    await setRefreshToken(session.refreshToken);
  } catch {
    await clearLocalSession();
    throw new ApiError(
      'Your secure session could not be saved. Please try signing in again.',
      'SECURE_STORAGE_FAILED',
      null,
      null,
      false,
    );
  }

  useAuthStore.getState().setSession({
    accessToken: session.accessToken,
    expiresInSeconds: session.accessTokenExpiresInSeconds,
    user: session.user,
  });
  return session;
}

export async function restoreSession(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    await clearLocalSession();
    return;
  }

  try {
    const session = await rotateRefreshToken(false);
    const meResponse = await publicApiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const user = parseResponse(
      authResponseSchema.shape.user,
      meResponse.data,
    );
    useAuthStore.getState().setSession({
      accessToken: session.accessToken,
      expiresInSeconds: session.accessTokenExpiresInSeconds,
      user,
    });
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.status !== 401 && apiError.code !== 'SESSION_MISSING') {
      useAuthStore.getState().setStatus('restoration-error');
    }
    throw apiError;
  }
}

export async function requestWithAccessToken<T>(
  config: AxiosRequestConfig,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await apiClient.request(config);
  return parseResponse(schema, response.data);
}
