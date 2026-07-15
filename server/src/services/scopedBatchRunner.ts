export type ScopedBatchFailure = {
  scopeId: string
  attempts: number
  errorMessage: string
}

export class ScopedBatchOperationError extends Error {
  readonly code = 'SCOPED_BATCH_PARTIAL_FAILURE' as const

  constructor(
    operationName: string,
    public readonly failures: ScopedBatchFailure[],
    public readonly successfulScopeIds: string[],
  ) {
    super(`${operationName} failed for ${failures.length} scoped item(s)`)
    this.name = 'ScopedBatchOperationError'
  }
}

type ScopedBatchOptions<T> = {
  operationName: string
  scopeIds: string[]
  operation: (scopeId: string, attempt: number) => Promise<T>
  maxAttempts?: number
  baseDelayMs?: number
}

function readNonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
}

function readPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function sleep(ms: number) {
  if (ms <= 0) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}

export function isScopedBatchOperationError(error: unknown): error is ScopedBatchOperationError {
  return error instanceof ScopedBatchOperationError
    || Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'SCOPED_BATCH_PARTIAL_FAILURE')
}

export async function runScopedBatch<T>(options: ScopedBatchOptions<T>) {
  const scopeIds = [...new Set(options.scopeIds.map((scopeId) => String(scopeId ?? '').trim()).filter(Boolean))]
  const maxAttempts = readPositiveInteger(options.maxAttempts, 3)
  const baseDelayMs = readNonNegativeInteger(options.baseDelayMs, 250)
  const settled = await Promise.all(scopeIds.map(async (scopeId) => {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return {
          status: 'fulfilled' as const,
          scopeId,
          value: await options.operation(scopeId, attempt),
        }
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          await sleep(baseDelayMs * Math.pow(2, attempt - 1))
        }
      }
    }

    return {
      status: 'rejected' as const,
      scopeId,
      failure: {
        scopeId,
        attempts: maxAttempts,
        errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
      },
    }
  }))

  const successful = settled.filter((item) => item.status === 'fulfilled')
  const failures = settled
    .filter((item) => item.status === 'rejected')
    .map((item) => item.failure)
  const successfulScopeIds = successful.map((item) => item.scopeId)
  if (failures.length > 0) {
    throw new ScopedBatchOperationError(options.operationName, failures, successfulScopeIds)
  }

  return {
    values: successful.map((item) => item.value),
    successfulScopeIds,
  }
}
