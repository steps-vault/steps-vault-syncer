const MIN_RETRY_AFTER_SECONDS = 1;
const MAX_RETRY_AFTER_SECONDS = 600;
const DEFAULT_RETRY_AFTER_SECONDS = 5;

/**
 * When to ask a service again: its `retryAfterSeconds`, kept within 1 to 600 so a broken service can neither make
 * Sync hammer it nor wait forever.
 */
export function getRetryAfterSeconds(answer: unknown): number {
  const seconds = typeof answer === 'object' && answer !== null && 'retryAfterSeconds' in answer ? answer.retryAfterSeconds : undefined;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(MIN_RETRY_AFTER_SECONDS, seconds));
}
