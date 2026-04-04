export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface RetryOutcome<T> {
  value: T;
  retries: number;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig,
  onRetry?: (error: Error, attempt: number, delayMs: number) => void | Promise<void>,
): Promise<RetryOutcome<T>> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const value = await operation();
      return { value, retries: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= config.maxRetries) {
        break;
      }

      const delayMs = Math.min(
        config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelayMs,
      );

      if (onRetry) {
        await onRetry(lastError, attempt + 1, delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('Retry failed without an explicit error.');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
