export const RFC3339_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export const RFC3339_INSTANT_MESSAGE =
  'must be an RFC 3339 timestamp with a UTC offset or Z suffix';
