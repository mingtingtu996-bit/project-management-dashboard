import { readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

const mocks = vi.hoisted(() => ({
  listActiveProjectIds: vi.fn(async (projectIds?: string[] | null) => projectIds ?? ['project-1']),
  executeSQL: vi.fn(),
  persistPlanningReplayCalibrationReport: vi.fn(async (params: any) => ({
    persistedGroupCount: params.report.groups.length,
    persistedReplayResultCount: params.report.groups.reduce((sum: number, group: any) => sum + group.replay.rows.length, 0),
    failedGroupCount: 0,
    failures: [],
  })),
  runJobWithRetry: vi.fn(async (
    _context: unknown,
    run: (attempt: number, context: { signal: AbortSignal; deadlineAt: string }) => Promise<unknown>,
  ) => {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return {
          attempts: attempt,
          value: await run(attempt, {
            signal: new AbortController().signal,
            deadlineAt: '2026-07-21T00:10:00.000Z',
          }),
        }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }),
  runWithJobLease: vi.fn(async (
    _options: unknown,
    runner: (context: {
      jobName: string
      fenceToken: string
      generation: number
      signal: AbortSignal
      assertActive: () => void
    }) => Promise<unknown>,
  ) => {
    const controller = new AbortController()
    return {
      acquired: true as const,
      value: await runner({
        jobName: 'planningReplayCalibrationJob',
        fenceToken: 'test-fence',
        generation: 1,
        signal: controller.signal,
        assertActive: () => undefined,
      }),
    }
  }),
}))

vi.mock('../services/activeProjectService.js', () => ({
  listActiveProjectIds: mocks.listActiveProjectIds,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
}))

vi.mock('../services/jobRuntime.js', () => ({
  runJobWithRetry: mocks.runJobWithRetry,
  runWithJobLease: mocks.runWithJobLease,
}))

vi.mock('../services/planningReplayCalibrationService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/planningReplayCalibrationService.js')>()
  return {
    ...actual,
    persistPlanningReplayCalibrationReport: mocks.persistPlanningReplayCalibrationReport,
  }
})

const {
  PlanningReplayCalibrationJob,
  runPlanningReplayCalibrationSweep,
} = await import('../jobs/planningReplayCalibrationJob.js')

describe('planningReplayCalibrationJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runJobWithRetry.mockImplementation(async (
      _context: unknown,
      run: (attempt: number, context: { signal: AbortSignal; deadlineAt: string }) => Promise<unknown>,
    ) => {
      let lastError: unknown = null
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return {
            attempts: attempt,
            value: await run(attempt, {
              signal: new AbortController().signal,
              deadlineAt: '2026-07-21T00:10:00.000Z',
            }),
          }
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    })
    mocks.runWithJobLease.mockImplementation(async (_options, runner) => {
      const controller = new AbortController()
      return {
        acquired: true as const,
        value: await runner({
          jobName: 'planningReplayCalibrationJob',
          fenceToken: 'test-fence',
          generation: 1,
          signal: controller.signal,
          assertActive: () => undefined,
        }),
      }
    })
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/\bJOIN\b|\bCOALESCE\s*\(/i.test(sql)) {
        throw new Error(`complex SQL is not allowed in planning replay sample collection: ${sql}`)
      }
      if (sql.includes('FROM task_baselines')) {
        return [{ id: 'baseline-version-1', status: 'confirmed' }]
      }
      if (sql.includes('FROM task_baseline_items')) {
        return [{
          id: 'baseline-item-1',
          project_id: params[0],
          baseline_version_id: 'baseline-version-1',
          source_task_id: 'task-1',
          standard_work_code: 'STD-STRUCT-001',
          standard_work_name: '结构施工',
          engineering_category_id: 'category-1',
          planned_start_date: '2026-01-01',
          planned_end_date: '2026-01-05',
          generation_metadata: { algorithm_context: { replay_prediction_days: 6 } },
        }]
      }
      if (sql.includes('FROM tasks')) {
        return [{
          id: 'task-1',
          actual_start_date: '2026-01-02',
          actual_end_date: '2026-01-07',
          updated_at: '2026-01-07T08:00:00.000Z',
        }]
      }
      if (sql.includes('FROM monthly_plans')) {
        return [{
          id: 'monthly-plan-1',
          status: 'closed',
          closeout_at: '2026-02-28T10:00:00.000Z',
          confirmed_at: '2026-02-01T10:00:00.000Z',
          updated_at: '2026-02-28T10:00:00.000Z',
        }]
      }
      if (sql.includes('FROM monthly_plan_items')) {
        return [{
          id: 'monthly-item-1',
          project_id: params[0],
          monthly_plan_version_id: 'monthly-plan-1',
          standard_work_code: 'STD-STRUCT-001',
          standard_work_name: '结构施工',
          engineering_category_id: 'category-1',
          current_progress: 75,
          target_progress: 80,
          generation_metadata: { replay_prediction_days: 75 },
        }]
      }
      return []
    })
  })

  it('runs the shared planning replay calibration machine from a production sweep entrypoint', async () => {
    const result = await runPlanningReplayCalibrationSweep({
      projectIds: ['project-1'],
      minAcceptedSamplesPerProcess: 2,
      sampleProvider: async (projectId) => [
        {
          sampleId: `${projectId}:baseline-1`,
          companyId: 'company-a',
          projectId,
          surface: 'baseline_generation',
          standardWorkCode: 'STD-STRUCT-001',
          originalPrediction: 10,
          actual: 12,
          replayPrediction: 11,
        },
        {
          sampleId: `${projectId}:monthly-1`,
          companyId: 'company-a',
          projectId,
          surface: 'monthly_plan_generation',
          standardWorkCode: 'STD-STRUCT-001',
          originalPrediction: 8,
          actual: 9,
          replayPrediction: 8.5,
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      completedReports: 1,
      failedReports: 0,
      sampleCount: 2,
      readyGroupCount: 1,
      persistedGroupCount: 1,
      persistedReplayResultCount: 2,
      factWritesBlocked: 1,
    }))
    expect(mocks.persistPlanningReplayCalibrationReport).toHaveBeenCalledWith(expect.objectContaining({
      runKey: expect.stringContaining('planning-replay-'),
      report: expect.objectContaining({
        status: 'planning_replay_calibration_ready',
      }),
    }))
  })

  it('collects default planning replay samples from simple table reads', async () => {
    const result = await runPlanningReplayCalibrationSweep({
      projectIds: ['project-1'],
      minAcceptedSamplesPerProcess: 2,
      writeReports: false,
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      completedReports: 1,
      failedReports: 0,
      sampleCount: 2,
      blockedGroupCount: 1,
    }))
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM task_baselines'),
      ['project-1'],
    )
    expect(mocks.executeSQL).toHaveBeenCalledWith(
      expect.stringContaining('FROM monthly_plan_items'),
      expect.arrayContaining(['project-1', 'monthly-plan-1']),
    )
  })

  it('does not backfill missing actual start dates from planned starts when collecting baseline replay samples', async () => {
    mocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (/\bJOIN\b|\bCOALESCE\s*\(/i.test(sql)) {
        throw new Error(`complex SQL is not allowed in planning replay sample collection: ${sql}`)
      }
      if (sql.includes('FROM task_baselines')) {
        return [{ id: 'baseline-version-1', status: 'confirmed' }]
      }
      if (sql.includes('FROM task_baseline_items')) {
        return [{
          id: 'baseline-item-1',
          project_id: params[0],
          baseline_version_id: 'baseline-version-1',
          source_task_id: 'task-1',
          standard_work_code: 'STD-STRUCT-001',
          standard_work_name: '结构施工',
          engineering_category_id: 'category-1',
          planned_start_date: '2026-01-01',
          planned_end_date: '2026-01-05',
          generation_metadata: { algorithm_context: { replay_prediction_days: 6 } },
        }]
      }
      if (sql.includes('FROM tasks')) {
        return [{
          id: 'task-1',
          actual_start_date: null,
          actual_end_date: '2026-01-07',
          updated_at: '2026-01-07T08:00:00.000Z',
        }]
      }
      if (sql.includes('FROM monthly_plans')) return []
      if (sql.includes('FROM monthly_plan_items')) return []
      return []
    })

    const result = await runPlanningReplayCalibrationSweep({
      projectIds: ['project-1'],
      minAcceptedSamplesPerProcess: 1,
      writeReports: false,
    })

    expect(result).toEqual(expect.objectContaining({
      scannedProjects: 1,
      completedReports: 1,
      failedReports: 0,
      sampleCount: 0,
    }))
  })

  it('is wired into scheduler and admin jobs route so the shared loop is not test-only', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')
    const jobSource = readServerFile('src', 'jobs', 'planningReplayCalibrationJob.ts')

    expect(schedulerSource).toContain("import { planningReplayCalibrationJob } from './jobs/planningReplayCalibrationJob.js'")
    expect(schedulerSource).toContain('planningReplayCalibrationJob.start()')
    expect(schedulerSource).toContain('planningReplayCalibrationJob.stop()')
    expect(schedulerSource).toContain('Planning replay calibration job started (daily 06:45)')

    expect(jobsRouteSource).toContain("name: 'planningReplayCalibrationJob'")
    expect(jobsRouteSource).toContain("schedule: '45 6 * * *'")
    expect(jobsRouteSource).toContain("case 'planningReplayCalibrationJob'")
    expect(jobsRouteSource).toContain('result: await planningReplayCalibrationJob.executeNow(projectScope)')

    expect(jobSource).toContain('getStatus()')
    expect(jobSource).toContain('executeNow(projectIds?: string[] | null)')
  })

  it('prevents a second job instance from entering the sweep while the distributed lease is held', async () => {
    const completeResult = {
      scannedProjects: 1,
      completedReports: 1,
      failedReports: 0,
      sampleCount: 2,
      readyGroupCount: 1,
      blockedGroupCount: 0,
      rejectedSampleCount: 0,
      persistedGroupCount: 1,
      persistedReplayResultCount: 2,
      persistenceFailedGroupCount: 0,
      factWritesBlocked: 1,
      seedWritesBlocked: 1,
    }
    let releaseFirstSweep = () => undefined
    const firstSweepGate = new Promise<void>((resolve) => {
      releaseFirstSweep = resolve
    })
    let sweepCallCount = 0
    const sweep = vi.fn(async () => {
      sweepCallCount += 1
      if (sweepCallCount === 1) await firstSweepGate
      return completeResult
    })
    let leaseHeld = false
    const leaseRunner = vi.fn(async (_options, runner) => {
      if (leaseHeld) return { acquired: false as const, reason: 'lease_not_acquired' as const }
      leaseHeld = true
      const controller = new AbortController()
      try {
        return {
          acquired: true as const,
          value: await runner({
            jobName: 'planningReplayCalibrationJob',
            fenceToken: 'shared-fence',
            generation: 1,
            signal: controller.signal,
            assertActive: () => undefined,
          }),
        }
      } finally {
        leaseHeld = false
      }
    })
    const withTransaction = async <T>(work: () => Promise<T>) => await work()
    const firstJob = new PlanningReplayCalibrationJob({ sweep, withTransaction, leaseRunner })
    const secondJob = new PlanningReplayCalibrationJob({ sweep, withTransaction, leaseRunner })

    const firstRun = firstJob.executeNow(['project-1'])
    await vi.waitFor(() => expect(sweep).toHaveBeenCalledTimes(1))
    const secondResult = await secondJob.executeNow(['project-1'])
    releaseFirstSweep()
    await expect(firstRun).resolves.toEqual(completeResult)

    expect(secondResult).toEqual({ skipped: true, reason: 'lease_not_acquired' })
    expect(sweep).toHaveBeenCalledTimes(1)
  })

  it('does not collect planning replay samples through JOIN or COALESCE executeSQL literals', () => {
    const jobSource = readServerFile('src', 'jobs', 'planningReplayCalibrationJob.ts')

    expect(jobSource).not.toMatch(/executeSQL<any>\(`[\s\S]*\bJOIN\b[\s\S]*`\s*,/i)
    expect(jobSource).not.toMatch(/executeSQL<any>\(`[\s\S]*\bCOALESCE\s*\(/i)
  })

  it('retries a partial sweep only after rolling back its successful project writes', async () => {
    const committedWrites: string[] = []
    let transactionCallCount = 0
    const withTransaction = async <T>(work: () => Promise<T>): Promise<T> => {
      transactionCallCount += 1
      const savepoint = committedWrites.length
      try {
        return await work()
      } catch (error) {
        committedWrites.splice(savepoint)
        throw error
      }
    }
    const completeResult = {
      scannedProjects: 2,
      completedReports: 2,
      failedReports: 0,
      sampleCount: 4,
      readyGroupCount: 2,
      blockedGroupCount: 0,
      rejectedSampleCount: 0,
      persistedGroupCount: 2,
      persistedReplayResultCount: 4,
      persistenceFailedGroupCount: 0,
      factWritesBlocked: 2,
      seedWritesBlocked: 2,
    }
    const sweep = vi.fn()
      .mockImplementationOnce(async () => {
        committedWrites.push('project-1-report')
        return {
          ...completeResult,
          completedReports: 1,
          failedReports: 1,
          persistedGroupCount: 1,
          persistedReplayResultCount: 2,
        }
      })
      .mockImplementationOnce(async () => {
        committedWrites.push('project-1-report', 'project-2-report')
        return completeResult
      })
    const job = new PlanningReplayCalibrationJob({ sweep, withTransaction })

    await expect(job.executeNow(['project-1', 'project-2'])).resolves.toEqual(completeResult)

    expect(sweep).toHaveBeenCalledTimes(2)
    expect(transactionCallCount).toBe(2)
    expect(committedWrites).toEqual(['project-1-report', 'project-2-report'])
  })
})
