import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) =>
        failureCount < 2 && error instanceof ApiError && error.retryable,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
