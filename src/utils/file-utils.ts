export interface RetryOptions {
  maxRetries?: number
  delayMs?: number
  /** Called once, before the first retry, with the attempt number (0-based). */
  onRetry?: (attempt: number, maxRetries: number) => void
}

/** Retry a file operation when the underlying file is busy / locked. */
export const FileUtils = {
  async withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const { maxRetries = 3, delayMs = 500, onRetry } = options
    let lastError: Error = new Error('Unknown error occurred')

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error

        const isFileBusyError =
          error instanceof Error &&
          (error.message.includes('EBUSY') ||
            error.message.includes('busy') ||
            error.message.includes('locked'))

        if (!isFileBusyError || attempt === maxRetries) break

        if (attempt === 0) onRetry?.(attempt, maxRetries)

        await new Promise(resolve => window.setTimeout(resolve, delayMs))
      }
    }

    throw lastError
  },
}
