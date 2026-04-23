export const REQUEST_TIMEOUT_BUDGETS = {
  fastReadMs: 2_000,
  boardReadMs: 3_000,
  notificationReadMs: 5_000,
  batchWriteMs: 5_000,
} as const

export const MAX_SYNC_BATCH_ITEMS = 100

interface RequestBudgetError extends Error {
  code?: string
  statusCode?: number
  details?: Record<string, unknown>
}

export interface RequestBudgetOptions {
  operation: string
  timeoutMs: number
}

export interface SyncBatchLimitOptions {
  operation: string
  maxSyncItems?: number
}

export function buildSyncBatchLimitError(
  count: number,
  options: SyncBatchLimitOptions,
): RequestBudgetError {
  const maxSyncItems = options.maxSyncItems ?? MAX_SYNC_BATCH_ITEMS
  const error = new Error(
    `${options.operation} 同步批量上限为 ${maxSyncItems} 条，当前请求 ${count} 条，请拆批后重试。`,
  ) as RequestBudgetError
  error.code = 'BATCH_ASYNC_REQUIRED'
  error.statusCode = 413
  error.details = {
    operation: options.operation,
    requested_count: count,
    max_sync_items: maxSyncItems,
    strategy: 'reject_sync',
  }
  return error
}

export function assertSyncBatchAllowed(
  count: number,
  options: SyncBatchLimitOptions,
): void {
  if (count > (options.maxSyncItems ?? MAX_SYNC_BATCH_ITEMS)) {
    throw buildSyncBatchLimitError(count, options)
  }
}

function buildRequestBudgetExceededError(
  options: RequestBudgetOptions,
): RequestBudgetError {
  const error = new Error(
    `${options.operation} 超出 ${options.timeoutMs}ms 服务端执行预算，请缩小范围后重试。`,
  ) as RequestBudgetError
  error.code = 'REQUEST_BUDGET_EXCEEDED'
  error.statusCode = 504
  error.details = {
    operation: options.operation,
    timeout_ms: options.timeoutMs,
    strategy: 'timeout_guard',
  }
  return error
}

export async function runWithRequestBudget<T>(
  options: RequestBudgetOptions,
  runner: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null

  try {
    return await Promise.race([
      runner(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(buildRequestBudgetExceededError(options))
        }, options.timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
