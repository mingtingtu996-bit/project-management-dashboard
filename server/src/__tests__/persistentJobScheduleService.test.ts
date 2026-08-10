import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  calculateDueWallClockSlots,
  calculateNextWallClockSlot,
  evaluatePersistentJobScheduleHealth,
  getRegisteredPersistentJobNames,
  PersistentJobCatchUpCoordinator,
  runPersistentScheduledSlot,
  type PersistentScheduledSlotExecutionContext,
  type ScheduledJobSlotClaim,
  type ScheduledJobSlotStore,
  PersistentWallClockJobTimer,
} from '../services/persistentJobScheduleService.js'

import { readFileSync } from 'node:fs'

const expectedPersistentJobNames = [
  'acceptanceTemplatePolicyAutoPublishJob',
  'algorithmAssetLearnableParameterImpactMonitoringJob',
  'algorithmSeedCandidateDiscoveryJob',
  'certificateTemplatePolicyAutoPublishJob',
  'conditionAlertJob',
  'constructionDependencyReplayCalibrationJob',
  'constructionOrganizationPlanNetworkRuntimeEvidenceJob',
  'criticalPathRefreshJob',
  'dailyTaskDurationForecastJob',
  'dataQualityJob',
  'dataRetentionJob',
  'defaultMasterPlanVisibilityLearningJob',
  'deletionRetentionCleanupJob',
  'drawingPackageExperienceIterationJob',
  'durationContextPolicyLearningJob',
  'durationLearningRuntimeEvidenceOutboxDrainJob',
  'durationLiveLearningProductionClaimAuditJob',
  'forecastResidualOverlayProductionJob',
  'materialArrivalReminderJob',
  'notificationLifecycleJob',
  'notificationReconciliationJob',
  'officialHolidayCalendarJob',
  'operationalNotificationJob',
  'planningDraftLockTimeoutJob',
  'planningGovernanceJob',
  'planningReplayCalibrationJob',
  'policyTemplateReleaseImpactMonitoringJob',
  'projectClimateProfileJob',
  'projectDailySnapshotJob',
  'projectProductivityCalibrationJob',
  'projectWeatherForecastJob',
  'responsibilityAlertJob',
  'riskStatisticsJob',
  'standardWorkDurationSeedReplayJob',
  'taskWriteFinalizationOutboxJob',
  'templateDurationGovernanceJob',
  'warningImpactSignalGovernanceJob',
  'weeklyDigestJob',
  'wizardGenerationRecoveryJob',
].sort()

class MemorySlotStore implements ScheduledJobSlotStore {
  private rows = new Map<string, {
    status: 'running' | 'succeeded' | 'failed'
    token: string
    claimedAt: number
  }>()
  claims: Array<{ jobName: string; scheduledFor: string }> = []
  heartbeatCalls = 0
  rejectHeartbeats = false
  executionFenceCalls = 0

  async assertReady() {}

  async claim(input: {
    jobName: string
    scheduledFor: Date
    ownerId: string
    claimToken: string
    staleAfterMs: number
  }): Promise<ScheduledJobSlotClaim> {
    const key = `${input.jobName}:${input.scheduledFor.toISOString()}`
    const current = this.rows.get(key)
    if (current?.status === 'succeeded') {
      return { claimed: false, reason: current.status }
    }
    if (current?.status === 'running' && Date.now() - current.claimedAt < input.staleAfterMs) {
      return { claimed: false, reason: current.status }
    }
    this.rows.set(key, {
      status: 'running',
      token: input.claimToken,
      claimedAt: Date.now(),
    })
    this.claims.push({ jobName: input.jobName, scheduledFor: input.scheduledFor.toISOString() })
    return { claimed: true, claimToken: input.claimToken }
  }

  async heartbeat(input: { jobName: string; scheduledFor: Date; claimToken: string }) {
    this.heartbeatCalls += 1
    if (this.rejectHeartbeats) return false
    const key = `${input.jobName}:${input.scheduledFor.toISOString()}`
    const current = this.rows.get(key)
    if (!current || current.token !== input.claimToken || current.status !== 'running') return false
    this.rows.set(key, { ...current, claimedAt: Date.now() })
    return true
  }

  async succeed(input: { jobName: string; scheduledFor: Date; claimToken: string }) {
    const key = `${input.jobName}:${input.scheduledFor.toISOString()}`
    const current = this.rows.get(key)
    if (!current || current.token !== input.claimToken || current.status !== 'running') return false
    this.rows.set(key, { ...current, status: 'succeeded' })
    return true
  }

  async fail(input: { jobName: string; scheduledFor: Date; claimToken: string; error: unknown }) {
    const key = `${input.jobName}:${input.scheduledFor.toISOString()}`
    const current = this.rows.get(key)
    if (!current || current.token !== input.claimToken || current.status !== 'running') return false
    this.rows.set(key, { ...current, status: 'failed' })
    return true
  }

  async runWithExecutionFence<T>(
    _input: { jobName: string; scheduledFor: Date; claimToken: string },
    runner: (context: { signal: AbortSignal; assertActive: () => void }) => Promise<T>,
  ) {
    this.executionFenceCalls += 1
    const controller = new AbortController()
    return {
      acquired: true as const,
      value: await runner({
        signal: controller.signal,
        assertActive: () => undefined,
      }),
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('persistent job schedule service', () => {
  it('serializes startup catch-up by default to protect the shared database pool', () => {
    const source = readFileSync(
      new URL('../services/persistentJobScheduleService.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('const DEFAULT_CATCH_UP_CONCURRENCY = 1')
  })

  it('aligns minute-interval and monthly schedules to stable wall-clock slots', () => {
    expect(calculateNextWallClockSlot(
      new Date(2026, 6, 13, 10, 6, 12, 0),
      { kind: 'minute_interval', intervalMinutes: 5 },
    )).toEqual(new Date(2026, 6, 13, 10, 10, 0, 0))

    expect(calculateNextWallClockSlot(
      new Date(2026, 6, 13, 10, 0, 0, 0),
      { kind: 'monthly', dayOfMonth: 1, hour: 4, minute: 15 },
    )).toEqual(new Date(2026, 7, 1, 4, 15, 0, 0))
  })

  it('returns bounded most-recent daily catch-up slots', () => {
    const slots = calculateDueWallClockSlots(
      new Date(2026, 6, 13, 10, 0, 0, 0),
      { kind: 'daily', hour: 8, minute: 30 },
      { limit: 2, maxAgeMs: 3 * 24 * 60 * 60 * 1_000 },
    )

    expect(slots).toEqual([
      new Date(2026, 6, 12, 8, 30, 0, 0),
      new Date(2026, 6, 13, 8, 30, 0, 0),
    ])
  })

  it('runs a missed slot once across restarts and then runs the next wall-clock slot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const store = new MemorySlotStore()
    const execute = vi.fn().mockResolvedValue(undefined)
    const options = {
      jobName: 'testJob',
      schedule: { kind: 'hourly' as const, minute: 0 },
      execute,
      store,
      catchUp: { limit: 1, maxAgeMs: 2 * 60 * 60 * 1_000 },
    }

    const first = new PersistentWallClockJobTimer(options)
    expect(first.start()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(store.claims[0]?.scheduledFor).toBe(new Date(2026, 6, 13, 10, 0, 0, 0).toISOString())
    first.stop()

    const restarted = new PersistentWallClockJobTimer(options)
    restarted.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(execute).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(55 * 60 * 1_000)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(store.claims.at(-1)?.scheduledFor).toBe(new Date(2026, 6, 13, 11, 0, 0, 0).toISOString())
    restarted.stop()
  })

  it('marks a failed slot retryable instead of treating it as completed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const store = new MemorySlotStore()
    const onError = vi.fn()
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(undefined)
    const options = {
      jobName: 'retryJob',
      schedule: { kind: 'hourly' as const, minute: 0 },
      execute,
      store,
      onError,
      catchUp: { limit: 1, maxAgeMs: 2 * 60 * 60 * 1_000 },
    }

    const first = new PersistentWallClockJobTimer(options)
    first.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledTimes(1)
    first.stop()

    const restarted = new PersistentWallClockJobTimer(options)
    restarted.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(store.claims).toHaveLength(2)
    restarted.stop()
  })

  it('exposes the currently scheduled future slot for job status APIs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const timer = new PersistentWallClockJobTimer({
      jobName: 'statusJob',
      schedule: { kind: 'hourly', minute: 20 },
      execute: vi.fn().mockResolvedValue(undefined),
      store: new MemorySlotStore(),
      catchUp: { limit: 1, maxAgeMs: 1 },
    })

    expect(timer.getStatus()).toEqual({ isScheduled: false, nextRun: null })
    timer.start()
    expect(getRegisteredPersistentJobNames()).toContain('statusJob')
    expect(timer.getStatus()).toEqual({
      isScheduled: true,
      nextRun: new Date(2026, 6, 13, 10, 20, 0, 0),
    })
    timer.stop()
    expect(getRegisteredPersistentJobNames()).not.toContain('statusJob')
    expect(timer.getStatus()).toEqual({ isScheduled: false, nextRun: null })
  })

  it('reports latest failed and stale running persistent job slots', async () => {
    const queryExec = vi.fn(async () => ({
      rows: [{
        latest_failed_jobs: ['dataQualityJob'],
        stale_running_jobs: ['projectDailySnapshotJob'],
      }],
    }))

    const result = await evaluatePersistentJobScheduleHealth({
      jobNames: ['projectDailySnapshotJob', 'dataQualityJob'],
      staleAfterMs: 15 * 60 * 1_000,
      queryExec,
      catchUpStatus: { concurrency: 2, active: 1, queued: 3 },
    })

    expect(queryExec).toHaveBeenCalledWith(
      expect.stringContaining('public.scheduled_job_slots'),
      [['dataQualityJob', 'projectDailySnapshotJob'], 15 * 60 * 1_000, null],
    )
    expect(result).toEqual({
      healthy: false,
      registeredJobCount: 2,
      latestFailedJobs: ['dataQualityJob'],
      staleRunningJobs: ['projectDailySnapshotJob'],
      catchUp: { concurrency: 2, active: 1, queued: 3 },
    })
  })

  it('only treats the latest slot for each job as stale', async () => {
    const queryExec = vi.fn(async (_query: string, _params: unknown[]) => ({
      rows: [{ latest_failed_jobs: [], stale_running_jobs: [] }],
    }))

    await evaluatePersistentJobScheduleHealth({
      jobNames: ['projectDailySnapshotJob'],
      queryExec,
    })

    const queryText = String(queryExec.mock.calls[0]?.[0] ?? '')
    expect(queryText).toMatch(/latest_slots[\s\S]*claimed_at/u)
    expect(queryText).toMatch(/stale_running[\s\S]*FROM latest_slots/u)
  })

  it('limits readiness failures to slots claimed after the worker health epoch', async () => {
    const queryExec = vi.fn(async (_query: string, _params: unknown[]) => ({
      rows: [{ latest_failed_jobs: [], stale_running_jobs: [] }],
    }))
    const notBefore = new Date('2026-08-03T11:00:00.000Z')

    await evaluatePersistentJobScheduleHealth({
      jobNames: ['projectDailySnapshotJob'],
      notBefore,
      queryExec,
    })

    const [queryText, queryParams] = queryExec.mock.calls[0] ?? []
    expect(String(queryText)).toMatch(/claimed_at >= \$3::timestamptz/u)
    expect(queryParams).toEqual([['projectDailySnapshotJob'], 30 * 60 * 1_000, notBefore.toISOString()])
  })

  it('uses the declared persistent registry when an API process has not started local timers', async () => {
    expect(getRegisteredPersistentJobNames()).toEqual([])
    const queryExec = vi.fn(async () => ({
      rows: [{ latest_failed_jobs: [], stale_running_jobs: [] }],
    }))

    const result = await evaluatePersistentJobScheduleHealth({
      queryExec,
      catchUpStatus: { concurrency: 1, active: 0, queued: 0 },
    })

    expect(queryExec).toHaveBeenCalledWith(
      expect.stringContaining('public.scheduled_job_slots'),
      [expectedPersistentJobNames, 30 * 60 * 1_000, null],
    )
    expect(result).toMatchObject({
      healthy: true,
      registeredJobCount: 39,
    })
  })

  it('allows only one worker to claim and execute the same scheduled slot', async () => {
    const store = new MemorySlotStore()
    let markStarted: (() => void) | null = null
    let releaseExecution: (() => void) | null = null
    const executionStarted = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const execute = vi.fn(async () => {
      markStarted?.()
      await new Promise<void>((resolve) => {
        releaseExecution = resolve
      })
    })
    const scheduledFor = new Date(2026, 6, 13, 10, 0, 0, 0)
    const first = runPersistentScheduledSlot(
      {
        jobName: 'criticalPathRefreshJob',
        scheduledFor,
        ownerId: 'worker-a',
        staleAfterMs: 30 * 60 * 1_000,
        isCatchUp: true,
      },
      execute,
      store,
    )
    await executionStarted

    const duplicate = await runPersistentScheduledSlot(
      {
        jobName: 'criticalPathRefreshJob',
        scheduledFor,
        ownerId: 'worker-b',
        staleAfterMs: 30 * 60 * 1_000,
        isCatchUp: true,
      },
      execute,
      store,
    )

    expect(duplicate).toEqual({ executed: false, reason: 'running' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(store.claims).toHaveLength(1)

    releaseExecution?.()
    await expect(first).resolves.toMatchObject({ executed: true })
  })

  it('renews a long-running slot so a second worker cannot reclaim it after the stale window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 0, 0, 0))
    const store = new MemorySlotStore()
    let markStarted: (() => void) | null = null
    let releaseExecution: (() => void) | null = null
    const executionStarted = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const execute = vi.fn()
      .mockImplementationOnce(async () => {
        markStarted?.()
        await new Promise<void>((resolve) => {
          releaseExecution = resolve
        })
      })
      .mockResolvedValue(undefined)
    const scheduledFor = new Date(2026, 6, 13, 10, 0, 0, 0)
    const input = {
      jobName: 'longRunningJob',
      scheduledFor,
      staleAfterMs: 90,
      isCatchUp: true,
    }
    const first = runPersistentScheduledSlot(
      { ...input, ownerId: 'worker-a' },
      execute,
      store,
    )
    const firstOutcome = first.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    )
    await executionStarted

    await vi.advanceTimersByTimeAsync(120)
    const duplicate = await runPersistentScheduledSlot(
      { ...input, ownerId: 'worker-b' },
      execute,
      store,
    )
    releaseExecution?.()
    const outcome = await firstOutcome

    expect(duplicate).toEqual({ executed: false, reason: 'running' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(store.heartbeatCalls).toBeGreaterThan(0)
    expect(outcome.error).toBeNull()
    expect(outcome.value).toMatchObject({ executed: true })

    const heartbeatCallsAfterSuccess = store.heartbeatCalls
    await vi.advanceTimersByTimeAsync(180)
    expect(store.heartbeatCalls).toBe(heartbeatCallsAfterSuccess)
  })

  it('aborts the stale worker before a reclaimed slot enters its mutation boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 0, 0, 0))
    const store = new MemorySlotStore()
    let markStarted: (() => void) | null = null
    let releaseUnsignaledExecution: (() => void) | null = null
    let firstWorkerActive = true
    let firstSignal: AbortSignal | null = null
    let secondWorkerObservedFirstActive: boolean | null = null
    let executionCount = 0
    const executionStarted = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const execute = vi.fn(async (details: PersistentScheduledSlotExecutionContext) => {
      executionCount += 1
      if (executionCount === 1) {
        firstSignal = details.signal ?? null
        markStarted?.()
        try {
          if (firstSignal) {
            await new Promise<void>((_resolve, reject) => {
              firstSignal?.addEventListener('abort', () => reject(firstSignal?.reason), { once: true })
            })
          } else {
            await new Promise<void>((resolve) => {
              releaseUnsignaledExecution = resolve
            })
          }
        } finally {
          firstWorkerActive = false
        }
        return
      }
      secondWorkerObservedFirstActive = firstWorkerActive
    })
    const scheduledFor = new Date(2026, 6, 13, 10, 0, 0, 0)
    const input = {
      jobName: 'leaseLossJob',
      scheduledFor,
      staleAfterMs: 90,
      isCatchUp: true,
    }

    const first = runPersistentScheduledSlot(
      { ...input, ownerId: 'worker-a' },
      execute,
      store,
    )
    const firstOutcome = first.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    )
    await executionStarted
    store.rejectHeartbeats = true

    await vi.advanceTimersByTimeAsync(120)
    const second = await runPersistentScheduledSlot(
      { ...input, ownerId: 'worker-b' },
      execute,
      store,
    )
    releaseUnsignaledExecution?.()
    await firstOutcome

    expect(second).toMatchObject({ executed: true })
    expect(firstSignal).toBeInstanceOf(AbortSignal)
    expect(firstSignal?.aborted).toBe(true)
    expect(secondWorkerObservedFirstActive).toBe(false)
    expect(store.executionFenceCalls).toBe(2)
  })

  it('stops renewing a slot after the execution fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 0, 0, 0))
    const store = new MemorySlotStore()
    let rejectExecution: ((error: Error) => void) | null = null
    const execution = runPersistentScheduledSlot(
      {
        jobName: 'failedHeartbeatJob',
        scheduledFor: new Date(2026, 6, 13, 10, 0, 0, 0),
        ownerId: 'worker-a',
        staleAfterMs: 90,
        isCatchUp: true,
      },
      () => new Promise<void>((_resolve, reject) => {
        rejectExecution = reject
      }),
      store,
    )

    await vi.advanceTimersByTimeAsync(60)
    rejectExecution?.(new Error('controlled failure'))
    await expect(execution).rejects.toThrow('controlled failure')
    expect(store.heartbeatCalls).toBeGreaterThan(0)

    const heartbeatCallsAfterFailure = store.heartbeatCalls
    await vi.advanceTimersByTimeAsync(180)
    expect(store.heartbeatCalls).toBe(heartbeatCallsAfterFailure)
  })

  it('keeps renewing an active slot after stop until execution settles', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const store = new MemorySlotStore()
    let markStarted: (() => void) | null = null
    let releaseExecution: (() => void) | null = null
    const executionStarted = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const execute = vi.fn()
      .mockImplementationOnce(async () => {
        markStarted?.()
        await new Promise<void>((resolve) => {
          releaseExecution = resolve
        })
      })
      .mockResolvedValue(undefined)
    const onError = vi.fn()
    const scheduledFor = new Date(2026, 6, 13, 10, 0, 0, 0)
    const timer = new PersistentWallClockJobTimer({
      jobName: 'stoppedHeartbeatJob',
      schedule: { kind: 'hourly', minute: 0 },
      execute,
      store,
      staleAfterMs: 90,
      catchUp: { limit: 1, maxAgeMs: 2 * 60 * 60 * 1_000 },
      onError,
    })

    timer.start()
    await vi.advanceTimersByTimeAsync(0)
    await executionStarted

    timer.stop()
    const heartbeatCallsAtStop = store.heartbeatCalls
    await vi.advanceTimersByTimeAsync(120)
    const duplicate = await runPersistentScheduledSlot(
      {
        jobName: 'stoppedHeartbeatJob',
        scheduledFor,
        ownerId: 'worker-b',
        staleAfterMs: 90,
        isCatchUp: true,
      },
      execute,
      store,
    )
    const heartbeatCallsBeforeSettle = store.heartbeatCalls

    releaseExecution?.()
    await vi.advanceTimersByTimeAsync(0)
    const heartbeatCallsAfterSettle = store.heartbeatCalls
    await vi.advanceTimersByTimeAsync(180)

    expect(duplicate).toEqual({ executed: false, reason: 'running' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(heartbeatCallsBeforeSettle).toBeGreaterThan(heartbeatCallsAtStop)
    expect(onError).not.toHaveBeenCalled()
    expect(store.heartbeatCalls).toBe(heartbeatCallsAfterSettle)
  })

  it('bounds catch-up concurrency across different jobs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const coordinator = new PersistentJobCatchUpCoordinator(1)
    const store = new MemorySlotStore()
    const releases: Array<() => void> = []
    let active = 0
    let maxActive = 0
    const execute = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
    })
    const buildTimer = (jobName: string) => new PersistentWallClockJobTimer({
      jobName,
      schedule: { kind: 'hourly', minute: 0 },
      execute,
      store,
      catchUpCoordinator: coordinator,
      catchUp: { limit: 1, maxAgeMs: 2 * 60 * 60 * 1_000 },
    })

    const first = buildTimer('firstJob')
    const second = buildTimer('secondJob')
    first.start()
    second.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordinator.getStatus()).toEqual({ concurrency: 1, active: 1, queued: 1 })

    releases.shift()?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)

    releases.shift()?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(coordinator.getStatus()).toEqual({ concurrency: 1, active: 0, queued: 0 })
    first.stop()
    second.stop()
  })

  it('bounds normal wall-clock concurrency across different jobs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 59, 59, 0))
    const coordinator = new PersistentJobCatchUpCoordinator(1)
    const store = new MemorySlotStore()
    const releases: Array<() => void> = []
    let active = 0
    let maxActive = 0
    const execute = vi.fn(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
    })
    const buildTimer = (jobName: string) => new PersistentWallClockJobTimer({
      jobName,
      schedule: { kind: 'hourly', minute: 0 },
      execute,
      store,
      catchUpCoordinator: coordinator,
      catchUp: { limit: 1, maxAgeMs: 1 },
    })

    const first = buildTimer('firstNormalJob')
    const second = buildTimer('secondNormalJob')
    first.start()
    second.start()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(coordinator.getStatus()).toEqual({ concurrency: 1, active: 1, queued: 1 })

    releases.shift()?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)

    releases.shift()?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(coordinator.getStatus()).toEqual({ concurrency: 1, active: 0, queued: 0 })
    first.stop()
    second.stop()
  })

  it('does not start a queued catch-up after its timer is stopped', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 10, 5, 0, 0))
    const coordinator = new PersistentJobCatchUpCoordinator(1)
    const store = new MemorySlotStore()
    let releaseFirst: (() => void) | null = null
    const firstExecute = vi.fn(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const secondExecute = vi.fn().mockResolvedValue(undefined)
    const buildTimer = (jobName: string, execute: () => Promise<void>) => new PersistentWallClockJobTimer({
      jobName,
      schedule: { kind: 'hourly', minute: 0 },
      execute,
      store,
      catchUpCoordinator: coordinator,
      catchUp: { limit: 1, maxAgeMs: 2 * 60 * 60 * 1_000 },
    })

    const first = buildTimer('blockingJob', firstExecute)
    const second = buildTimer('stoppedJob', secondExecute)
    first.start()
    second.start()
    await vi.advanceTimersByTimeAsync(0)
    second.stop()

    releaseFirst?.()
    await vi.advanceTimersByTimeAsync(0)

    expect(secondExecute).not.toHaveBeenCalled()
    expect(store.claims.map((claim) => claim.jobName)).toEqual(['blockingJob'])
    first.stop()
  })
})
