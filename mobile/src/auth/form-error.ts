import { toApiError } from '../api/errors';

export function formErrorMessage(error: unknown): string {
  const apiError = toApiError(error);
  return apiError.requestId
    ? `${apiError.message}\nReference ID: ${apiError.requestId}`
    : apiError.message;
}
