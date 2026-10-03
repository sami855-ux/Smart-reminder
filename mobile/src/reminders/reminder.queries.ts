export const reminderCachePolicy = {
  staleTime: 2 * 60_000,
  gcTime: 30 * 60_000,
} as const;

export const reminderQueryKeys = {
  occurrences: (view: string, from: string, to: string) =>
    ['reminder-occurrences', view, from, to] as const,
  occurrenceLists: () => ['reminder-occurrences'] as const,
  details: () => ['reminder'] as const,
  detail: (reminderId: string) => ['reminder', reminderId] as const,
  explanation: (occurrenceId: string) => ['occurrence-explanation', occurrenceId] as const,
  explanations: () => ['occurrence-explanation'] as const,
  nudgePolicy: (reminderId: string) => ['nudge-policy', reminderId] as const,
  events: (reminderId: string) => ['reminder-events', reminderId] as const,
} as const;
