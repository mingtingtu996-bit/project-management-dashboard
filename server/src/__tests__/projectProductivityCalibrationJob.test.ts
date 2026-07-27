import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activeProjectIds: ['project-1', 'project-2'] as string[],
  calibrationResults: [] as Array<{
    status: string
    evidenceSummary?: Record<string, any>
    parameterPayload?: Record<string, any>
  } | Error | null>,
  calls: [] as any[],
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: vi.fn(async (projectIds?: string[] | null) => {
    if (Array.isArray(projectIds)) return mocks.activeProjectIds.filter((projectId) => projectIds.includes(projectId))
    return mocks.activeProjectIds
  }),
}))

vi.mock('../services/projectProductivityCalibrationService.js', () => ({
  runProjectProductivityCalibration: vi.fn(async (input: any) => {
    mocks.calls.push(input)
    const next = mocks.calibrationResults.shift()
    if (next instanceof Error) throw next
    return next ?? { status: input.actionPolicy === 'shadow_run' ? 'shadow' : 'candidate' }
  }),
}))

const { runProjectProductivityCalibrationSweep } = await import('../jobs/projectProductivityCalibrationJob.js')

describe('projectProductivityCalibrationJob', () => {
  beforeEach(() => {
    mocks.activeProjectIds = ['project-1', 'project-2']
    mocks.calibrationResults = []
    mocks.calls = []
  })

  it('runs 30 day shadow backtests and 90 day governed calibration for every active project', async () => {
    mocks.calibrationResults = [
      { status: 'shadow' },
      { status: 'published' },
      { status: 'shadow' },
      { status: 'candidate' },
    ]

    const result = await runProjectProductivityCalibrationSweep({
      windowEndDate: '2026-04-30',
    })

    expect(result).toEqual({
      scanned: 2,
      shadowRuns: 2,
      candidates: 1,
      published: 1,
      auditReplayRuns: 0,
      thresholdCandidates: 0,
      auditWarnings: 0,
      skipped: 0,
      failed: 0,
    })
    expect(mocks.calls).toEqual([
      expect.objectContaining({ projectId: 'project-1', windowDays: 30, actionPolicy: 'shadow_run' }),
      expect.objectContaining({ projectId: 'project-1', windowDays: 90, actionPolicy: 'auto_publish' }),
      expect.objectContaining({ projectId: 'project-2', windowDays: 30, actionPolicy: 'shadow_run' }),
      expect.objectContaining({ projectId: 'project-2', windowDays: 90, actionPolicy: 'auto_publish' }),
    ])
  })

  it('keeps sweeping remaining projects when one project calibration fails', async () => {
    mocks.calibrationResults = [
      new Error('bad project'),
      { status: 'shadow' },
      { status: 'candidate' },
    ]

    const result = await runProjectProductivityCalibrationSweep({
      windowEndDate: '2026-04-30',
    })

    expect(result.scanned).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.shadowRuns).toBe(1)
    expect(result.candidates).toBe(1)
  })

  it('summarizes audit replay and threshold evolution outputs for backend governance', async () => {
    mocks.calibrationResults = [
      {
        status: 'shadow',
        evidenceSummary: {
          auditReplay: {
            attribution: { status: 'insufficient_observed_cases' },
            jsonContractValidation: { status: 'not_run_no_factor_summary_payload' },
          },
        },
      },
      {
        status: 'candidate',
        evidenceSummary: {
          auditReplay: {
            attribution: { status: 'insufficient_observed_cases' },
            jsonContractValidation: { status: 'not_run_no_factor_summary_payload' },
          },
          thresholdEvolutionCandidate: { status: 'candidate' },
        },
        parameterPayload: {
          thresholdEvolutionCandidate: { status: 'candidate' },
        },
      },
    ]
    mocks.activeProjectIds = ['project-1']

    const result = await runProjectProductivityCalibrationSweep({
      windowEndDate: '2026-04-30',
    })

    expect(result).toEqual(expect.objectContaining({
      scanned: 1,
      auditReplayRuns: 2,
      thresholdCandidates: 1,
      auditWarnings: 2,
    }))
  })
})
