import { describe, expect, it } from 'vitest'
import {
  buildSyncBatchLimitError,
  runWithRequestBudget,
} from '../services/requestBudgetService.js'

describe('requestBudgetService', () => {
  it('rejects sync batches over the configured ceiling with explicit downgrade metadata', () => {
    const error = buildSyncBatchLimitError(101, {
      operation: 'demo.batch',
    })

    expect(error.code).toBe('BATCH_ASYNC_REQUIRED')
    expect(error.statusCode).toBe(413)
    expect(error.details).toMatchObject({
      operation: 'demo.batch',
      requested_count: 101,
      max_sync_items: 100,
      strategy: 'reject_sync',
    })
  })

  it('fails a request when the server-side execution budget is exceeded', async () => {
    await expect(
      runWithRequestBudget(
        {
          operation: 'demo.timeout',
          timeoutMs: 5,
        },
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))
          return 'ok'
        },
      ),
    ).rejects.toMatchObject({
      code: 'REQUEST_BUDGET_EXCEEDED',
      statusCode: 504,
      details: expect.objectContaining({
        operation: 'demo.timeout',
        timeout_ms: 5,
      }),
    })
  })

  it('observes late runner failures after the request budget has already timed out', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    try {
      await expect(
        runWithRequestBudget(
          {
            operation: 'demo.late_failure',
            timeoutMs: 5,
          },
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
            throw new Error('late database timeout')
          },
        ),
      ).rejects.toMatchObject({
        code: 'REQUEST_BUDGET_EXCEEDED',
      })

      await new Promise((resolve) => setTimeout(resolve, 40))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
