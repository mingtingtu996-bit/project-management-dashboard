import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const createClient = vi.fn()
  const generateDailySnapshot = vi.fn()
  const runJobWithRetry = vi.fn()
  const executionLogInsert = vi.fn()
  return {
    createClient,
    generateDailySnapshot,
    runJobWithRetry,
    executionLogInsert,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('../services/riskStatisticsService.js', () => ({
  riskStatisticsService: {
    generateDailySnapshot: mocks.generateDailySnapshot,
  },
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: mocks.runJobWithRetry,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { riskStatisticsJob } from '../jobs/riskStatisticsJob.js'

function resolvedBuilder(result: unknown) {
  const builder: Record<string, any> = {}
  for (const method of ['select', 'insert']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      if (method === 'insert') mocks.executionLogInsert(...args)
      return builder
    })
  }
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (
    Promise.resolve(result).then(resolve, reject)
  )
  return builder
}

describe('risk statistics job failure propagation', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'test-key'
    mocks.createClient.mockReset()
    mocks.generateDailySnapshot.mockReset()
    mocks.runJobWithRetry.mockReset()
    mocks.executionLogInsert.mockReset()

    mocks.createClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'projects') {
          return resolvedBuilder({
            data: [
              { id: 'project-1', name: 'One', status: 'active' },
              { id: 'project-2', name: 'Two', status: 'active' },
            ],
            error: null,
          })
        }
        if (table === 'job_execution_logs') {
          return resolvedBuilder({ data: null, error: null })
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    })
    mocks.runJobWithRetry.mockImplementation(async (_context, work: () => Promise<unknown>) => ({
      attempts: 1,
      value: await work(),
    }))
    mocks.generateDailySnapshot.mockImplementation(async (projectId: string) => {
      if (projectId === 'project-2') throw new Error('snapshot write unavailable')
      return { id: 'snapshot-1' }
    })
  })

  it('marks the run failed so the retry wrapper can observe any project failure', async () => {
    await expect(riskStatisticsJob.executeNow()).resolves.toEqual({
      success: 0,
      failed: 0,
      total: 0,
    })

    expect(mocks.runJobWithRetry).toHaveBeenCalledTimes(1)
    expect(mocks.executionLogInsert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      error_message: expect.stringContaining('1 of 2'),
    }))
  })
})
