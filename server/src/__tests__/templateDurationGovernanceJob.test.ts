import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runTemplateDurationGovernance: vi.fn(async ({ companyId }: { companyId?: string }) => ({
    companyId: companyId ?? null,
    includedSampleCount: 3,
    promotedBenchmarkCount: 2,
  })),
  runJobWithRetry: vi.fn(async (context: unknown, runner: () => Promise<unknown>) => ({
    attempts: 1,
    context,
    value: await runner(),
  })),
}))

vi.mock('../services/templateDurationGovernanceService.js', () => ({
  runTemplateDurationGovernance: mocks.runTemplateDurationGovernance,
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: mocks.runJobWithRetry,
}))

const { TemplateDurationGovernanceJob } = await import('../jobs/templateDurationGovernanceJob.js')

describe('templateDurationGovernanceJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is wired into scheduler and admin jobs route', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    const jobsRouteSource = readFileSync(new URL('../routes/jobs.ts', import.meta.url), 'utf8')

    expect(schedulerSource).toContain(
      "import { templateDurationGovernanceJob } from './jobs/templateDurationGovernanceJob.js'",
    )
    expect(schedulerSource).toContain('templateDurationGovernanceJob.start()')
    expect(schedulerSource).toContain('templateDurationGovernanceJob.stop()')
    expect(schedulerSource).toContain('Template duration governance job started (daily 06:10)')

    expect(jobsRouteSource).toContain(
      "import { templateDurationGovernanceJob } from '../jobs/templateDurationGovernanceJob.js'",
    )
    expect(jobsRouteSource).toContain("name: 'templateDurationGovernanceJob'")
    expect(jobsRouteSource).toContain("schedule: '10 6 * * *'")
    expect(jobsRouteSource).toContain("case 'templateDurationGovernanceJob'")
    expect(jobsRouteSource).toContain('result: await templateDurationGovernanceJob.executeNow(companyId ?? null)')
  })

  it('delegates manual execution to runJobWithRetry and template duration governance service', async () => {
    const job = new TemplateDurationGovernanceJob()

    const result = await job.executeNow('company-42')

    expect(mocks.runJobWithRetry).toHaveBeenCalledTimes(1)
    expect(mocks.runJobWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: 'templateDurationGovernanceJob',
        triggeredBy: 'manual',
        jobId: expect.any(String),
      }),
      expect.any(Function),
    )
    expect(mocks.runTemplateDurationGovernance).toHaveBeenCalledTimes(1)
    expect(mocks.runTemplateDurationGovernance).toHaveBeenCalledWith({
      companyId: 'company-42',
    })
    expect(result).toEqual({
      companyId: 'company-42',
      includedSampleCount: 3,
      promotedBenchmarkCount: 2,
    })
  })

  it('exposes stable initial status and updates lastRun after execution', async () => {
    const job = new TemplateDurationGovernanceJob()

    expect(job.getStatus()).toEqual({
      isRunning: false,
      isScheduled: false,
      lastRun: null,
      nextRun: null,
    })

    await job.executeNow('company-7')

    expect(job.getStatus()).toEqual(
      expect.objectContaining({
        isRunning: false,
        isScheduled: false,
        lastRun: expect.any(String),
        nextRun: null,
      }),
    )
  })
})
