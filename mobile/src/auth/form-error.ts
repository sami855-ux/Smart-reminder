import { toApiError } from '../api/errors';

export function formErrorMessage(error: unknown): string {
  const apiError = toApiError(error);
  return apiError.requestId
    ? `${apiError.message} Reference: ${apiError.requestId}`
    : apiError.message;
}
