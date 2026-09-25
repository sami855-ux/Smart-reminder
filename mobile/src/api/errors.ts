import { isAxiosError } from 'axios';

import { apiErrorEnvelopeSchema } from '../auth/auth.schemas';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number | null,
    public readonly requestId: string | null,
    public readonly retryable: boolean,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (!isAxiosError(error)) {
    return new ApiError(
      'Something went wrong. Please try again.',
      'UNEXPECTED_ERROR',
      null,
      null,
      false,
    );
  }

  const envelope = apiErrorEnvelopeSchema.safeParse(error.response?.data);
  if (envelope.success) {
    return new ApiError(
      envelope.data.message,
      envelope.data.code,
      error.response?.status ?? null,
      envelope.data.requestId ?? null,
      envelope.data.retryable ?? false,
      envelope.data.fieldErrors,
    );
  }

  if (!error.response) {
    return new ApiError(
      'Unable to reach Smart Reminder. Check your connection and try again.',
      'NETWORK_ERROR',
      null,
      null,
      true,
    );
  }

  return new ApiError(
    'The server returned an unexpected response.',
    'INVALID_API_RESPONSE',
    error.response.status,
    null,
    error.response.status >= 500,
  );
}
