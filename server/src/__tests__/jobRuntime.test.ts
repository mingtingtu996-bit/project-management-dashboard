import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMock = vi.fn()

vi.mock('../database.js', () => ({
  query: queryMock,
}))

describe('jobRuntime', () => {
  beforeEach(() => {
    vi.resetModules()
    queryMock.mockReset()
    queryMock.mockResolvedValue({ rowCount: 1 })
  })

  it('retries a failed job and returns the recovered result', async () => {
    const { runJobWithRetry } = await import('../services/jobRuntime.js')
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ ok: true })

    const result = await runJobWithRetry(
      {
        jobName: 'demoJob',
        triggeredBy: 'scheduler',
        maxAttempts: 3,
        baseDelayMs: 0,
      },
      runner,
    )

    expect(result).toEqual({
      attempts: 2,
      value: { ok: true },
    })
    expect(runner).toHaveBeenCalledTimes(2)
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('records a failure row after exhausting retries', async () => {
    const { runJobWithRetry } = await import('../services/jobRuntime.js')
    const runner = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(
      runJobWithRetry(
        {
          jobName: 'demoJob',
          triggeredBy: 'manual',
          jobId: 'job-1',
          maxAttempts: 3,
          baseDelayMs: 0,
        },
        runner,
      ),
    ).rejects.toThrow('boom')

    expect(runner).toHaveBeenCalledTimes(3)
    expect(queryMock).toHaveBeenCalled()
    expect(queryMock.mock.calls.at(-1)?.[0]).toContain('INSERT INTO public.job_failures')
    expect(queryMock.mock.calls.at(-1)?.[1]?.slice(0, 5)).toEqual([
      'demoJob',
      'job-1',
      'manual',
      3,
      'boom',
    ])
  })
})
