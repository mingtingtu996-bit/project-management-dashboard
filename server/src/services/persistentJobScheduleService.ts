import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

import { query } from '../database.js'
import {
  calculateNextDailyRun,
  calculateNextHourlyIntervalRun,
  calculateNextHourlyMinuteRun,
  calculateNextWeeklyRun,
  WallClockJobTimer,
} from './wallClockScheduleService.js'

export type WallClockSchedule =
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'hourly'; minute: number }
  | { kind: 'hourly_interval'; intervalHours: number; minute: number }
  | { kind: 'minute_interval'; intervalMinutes: number }
  | { kind: 'monthly'; dayOfMonth: number; hour: number; minute: number }
  | { kind: 'weekly'; dayOfWeek: number; hour: number; minute: number }

export type ScheduledJobSlotClaim =
  | { claimed: true; claimToken: string }
  | { claimed: false; reason: 'succeeded' | 'running' | 'not_claimed' }

type SlotIdentity = {
  jobName: string
  scheduledFor: Date
  claimToken: string
}

export interface ScheduledJobSlotStore {
  assertReady(): Promise<void>
  claim(input: SlotIdentity & { ownerId: string; staleAfterMs: number }): Promise<ScheduledJobSlotClaim>
  succeed(input: SlotIdentity): Promise<boolean>
  fail(input: SlotIdentity & { error: unknown }): Promise<boolean>
}

type CatchUpOptions = {
  limit: number
  maxAgeMs: number
}

type PersistentWallClockJobTimerOptions = {
  jobName: string
  schedule: WallClockSchedule
  execute: (details: { scheduledFor: Date; isCatchUp: boolean }) => Promise<unknown>
  store?: ScheduledJobSlotStore
  catchUpCoordinator?: PersistentJobCatchUpCoordinator
  ownerId?: string
  staleAfterMs?: number
  catchUp?: CatchUpOptions
  onScheduled?: (details: { now: Date; nextRun: Date; delayMs: number }) => void
  onError?: (error: unknown) => void
}

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1_000
const DEFAULT_CATCH_UP: CatchUpOptions = {
  limit: 1,
  maxAgeMs: 36 * 60 * 60 * 1_000,
}
const DEFAULT_CATCH_UP_CONCURRENCY = 1
const registeredPersistentJobNames = new Set<string>()

export const PERSISTENT_SCHEDULED_JOB_NAMES = Object.freeze([
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
  'templateDurationGovernanceJob',
  'warningImpactSignalGovernanceJob',
  'weeklyDigestJob',
  'wizardGenerationRecoveryJob',
] as const)

function normalizePositiveInteger(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export class PersistentJobCatchUpCoordinator {
  private active = 0
  private readonly queue: Array<() => void> = []
  readonly concurrency: number

  constructor(concurrency = DEFAULT_CATCH_UP_CONCURRENCY) {
    this.concurrency = normalizePositiveInteger(concurrency, DEFAULT_CATCH_UP_CONCURRENCY)
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await operation()
    } finally {
      this.release()
    }
  }

  getStatus() {
    return {
      concurrency: this.concurrency,
      active: this.active,
      queued: this.queue.length,
    }
  }

  private async acquire() {
    if (this.active < this.concurrency) {
      this.active += 1
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
  }

  private release() {
    const next = this.queue.shift()
    if (next) {
      next()
      return
    }
    this.active = Math.max(0, this.active - 1)
  }
}

const defaultCatchUpCoordinator = new PersistentJobCatchUpCoordinator(
  Number(process.env.SCHEDULER_CATCH_UP_CONCURRENCY),
)

export function getPersistentJobCatchUpStatus() {
  return defaultCatchUpCoordinator.getStatus()
}

export function getRegisteredPersistentJobNames() {
  return [...registeredPersistentJobNames].sort()
}

export function getPersistentScheduledJobNames() {
  return [...PERSISTENT_SCHEDULED_JOB_NAMES]
}

type PersistentJobScheduleHealthOptions = {
  jobNames?: string[]
  staleAfterMs?: number
  queryExec?: typeof query
  catchUpStatus?: ReturnType<PersistentJobCatchUpCoordinator['getStatus']>
}

function normalizeJobNameArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean))]
    .sort()
}

export async function evaluatePersistentJobScheduleHealth(
  options: PersistentJobScheduleHealthOptions = {},
) {
  const jobNames = normalizeJobNameArray(options.jobNames ?? getPersistentScheduledJobNames())
  const catchUp = options.catchUpStatus ?? getPersistentJobCatchUpStatus()
  if (jobNames.length === 0) {
    return {
      healthy: false,
      registeredJobCount: 0,
      latestFailedJobs: [] as string[],
      staleRunningJobs: [] as string[],
      catchUp,
    }
  }

  const staleAfterMs = normalizePositiveInteger(options.staleAfterMs ?? 0, DEFAULT_STALE_AFTER_MS)
  const queryExec = options.queryExec ?? query
  const result = await queryExec(
    `WITH latest_slots AS (
       SELECT DISTINCT ON (job_name)
              job_name,
              status
         FROM public.scheduled_job_slots
        WHERE job_name = ANY($1::text[])
        ORDER BY job_name, scheduled_for DESC
     ), latest_failed AS (
       SELECT job_name
         FROM latest_slots
        WHERE status = 'failed'
     ), stale_running AS (
       SELECT DISTINCT job_name
         FROM public.scheduled_job_slots
        WHERE job_name = ANY($1::text[])
          AND status = 'running'
          AND claimed_at < NOW() - ($2::double precision * INTERVAL '1 millisecond')
     )
     SELECT COALESCE(
              (SELECT array_agg(job_name ORDER BY job_name) FROM latest_failed),
              ARRAY[]::text[]
            ) AS latest_failed_jobs,
            COALESCE(
              (SELECT array_agg(job_name ORDER BY job_name) FROM stale_running),
              ARRAY[]::text[]
            ) AS stale_running_jobs`,
    [jobNames, staleAfterMs],
  )
  const latestFailedJobs = normalizeJobNameArray(result.rows?.[0]?.latest_failed_jobs)
  const staleRunningJobs = normalizeJobNameArray(result.rows?.[0]?.stale_running_jobs)

  return {
    healthy: latestFailedJobs.length === 0 && staleRunningJobs.length === 0,
    registeredJobCount: jobNames.length,
    latestFailedJobs,
    staleRunningJobs,
    catchUp,
  }
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function setMonthlySlot(
  candidate: Date,
  dayOfMonth: number,
  hour: number,
  minute: number,
) {
  candidate.setDate(1)
  candidate.setHours(hour, minute, 0, 0)
  candidate.setDate(Math.min(
    normalizePositiveInteger(dayOfMonth, 1),
    daysInMonth(candidate.getFullYear(), candidate.getMonth()),
  ))
  return candidate
}

export function calculateNextWallClockSlot(now: Date, schedule: WallClockSchedule) {
  switch (schedule.kind) {
    case 'daily':
      return calculateNextDailyRun(now, schedule.hour, schedule.minute)
    case 'hourly':
      return calculateNextHourlyMinuteRun(now, schedule.minute)
    case 'hourly_interval':
      return calculateNextHourlyIntervalRun(now, schedule.intervalHours, schedule.minute)
    case 'minute_interval': {
      const interval = Math.min(60, normalizePositiveInteger(schedule.intervalMinutes, 1))
      const candidate = new Date(now)
      candidate.setSeconds(0, 0)
      if (candidate <= now) candidate.setMinutes(candidate.getMinutes() + 1)
      while (candidate.getMinutes() % interval !== 0) {
        candidate.setMinutes(candidate.getMinutes() + 1)
      }
      return candidate
    }
    case 'monthly': {
      const candidate = setMonthlySlot(
        new Date(now),
        schedule.dayOfMonth,
        schedule.hour,
        schedule.minute,
      )
      if (candidate <= now) {
        candidate.setDate(1)
        candidate.setMonth(candidate.getMonth() + 1)
        setMonthlySlot(candidate, schedule.dayOfMonth, schedule.hour, schedule.minute)
      }
      return candidate
    }
    case 'weekly':
      return calculateNextWeeklyRun(now, schedule.dayOfWeek, schedule.hour, schedule.minute)
  }
}

function calculateLatestDueWallClockSlot(now: Date, schedule: WallClockSchedule) {
  const candidate = new Date(now)
  switch (schedule.kind) {
    case 'daily':
      candidate.setHours(schedule.hour, schedule.minute, 0, 0)
      if (candidate > now) candidate.setDate(candidate.getDate() - 1)
      return candidate
    case 'hourly':
      candidate.setMinutes(schedule.minute, 0, 0)
      if (candidate > now) candidate.setHours(candidate.getHours() - 1)
      return candidate
    case 'hourly_interval': {
      const interval = normalizePositiveInteger(schedule.intervalHours, 1)
      candidate.setMinutes(schedule.minute, 0, 0)
      if (candidate > now) candidate.setHours(candidate.getHours() - 1)
      while (candidate.getHours() % interval !== 0) {
        candidate.setHours(candidate.getHours() - 1)
      }
      return candidate
    }
    case 'minute_interval': {
      const interval = Math.min(60, normalizePositiveInteger(schedule.intervalMinutes, 1))
      candidate.setSeconds(0, 0)
      if (candidate > now) candidate.setMinutes(candidate.getMinutes() - 1)
      while (candidate.getMinutes() % interval !== 0) {
        candidate.setMinutes(candidate.getMinutes() - 1)
      }
      return candidate
    }
    case 'monthly': {
      setMonthlySlot(candidate, schedule.dayOfMonth, schedule.hour, schedule.minute)
      if (candidate > now) {
        candidate.setDate(1)
        candidate.setMonth(candidate.getMonth() - 1)
        setMonthlySlot(candidate, schedule.dayOfMonth, schedule.hour, schedule.minute)
      }
      return candidate
    }
    case 'weekly': {
      candidate.setHours(schedule.hour, schedule.minute, 0, 0)
      const daysSinceTarget = (candidate.getDay() - schedule.dayOfWeek + 7) % 7
      candidate.setDate(candidate.getDate() - daysSinceTarget)
      if (candidate > now) candidate.setDate(candidate.getDate() - 7)
      return candidate
    }
  }
}

function previousWallClockSlot(slot: Date, schedule: WallClockSchedule) {
  const previous = new Date(slot)
  switch (schedule.kind) {
    case 'daily':
      previous.setDate(previous.getDate() - 1)
      break
    case 'hourly':
      previous.setHours(previous.getHours() - 1)
      break
    case 'hourly_interval':
      previous.setHours(previous.getHours() - normalizePositiveInteger(schedule.intervalHours, 1))
      break
    case 'minute_interval':
      previous.setMinutes(previous.getMinutes() - Math.min(60, normalizePositiveInteger(schedule.intervalMinutes, 1)))
      break
    case 'monthly':
      previous.setDate(1)
      previous.setMonth(previous.getMonth() - 1)
      setMonthlySlot(previous, schedule.dayOfMonth, schedule.hour, schedule.minute)
      break
    case 'weekly':
      previous.setDate(previous.getDate() - 7)
      break
  }
  return previous
}

export function calculateDueWallClockSlots(
  now: Date,
  schedule: WallClockSchedule,
  catchUp: CatchUpOptions,
) {
  const limit = normalizePositiveInteger(catchUp.limit, 1)
  const maxAgeMs = normalizePositiveInteger(catchUp.maxAgeMs, DEFAULT_CATCH_UP.maxAgeMs)
  const slots: Date[] = []
  let slot = calculateLatestDueWallClockSlot(now, schedule)

  while (slots.length < limit && now.getTime() - slot.getTime() <= maxAgeMs) {
    slots.push(slot)
    slot = previousWallClockSlot(slot, schedule)
  }

  return slots.reverse()
}

export class DatabaseScheduledJobSlotStore implements ScheduledJobSlotStore {
  // workspace-isolation-system-boundary-approved: readiness inspects only system scheduler tables and pg_catalog metadata; it does not read tenant business rows.
  async assertReady() {
    const result = await query(`
      WITH guarded_tables(table_name) AS (
        VALUES
          ('notifications'),
          ('notification_user_states'),
          ('risks'),
          ('issues'),
          ('warning_acknowledgments'),
          ('change_logs')
      ), existing_guarded_tables AS (
        SELECT table_name
          FROM guarded_tables
         WHERE to_regclass('public.' || table_name) IS NOT NULL
      ), installed_guards AS (
        SELECT cls.relname AS table_name
          FROM pg_catalog.pg_trigger AS trigger
          JOIN pg_catalog.pg_class AS cls ON cls.oid = trigger.tgrelid
          JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = cls.relnamespace
         WHERE namespace.nspname = 'public'
           AND trigger.tgname = 'enforce_job_lease_fence'
           AND trigger.tgfoid = to_regprocedure('public.enforce_job_lease_fence_from_request()')
           AND NOT trigger.tgisinternal
      )
      SELECT to_regclass('public.scheduled_job_slots') IS NOT NULL
               AND to_regclass('public.job_lease_fences') IS NOT NULL
               AND to_regprocedure('public.assert_job_lease_fence(text,uuid,bigint)') IS NOT NULL
               AND to_regprocedure('public.enforce_job_lease_fence_from_request()') IS NOT NULL
               AND NOT EXISTS (
                 SELECT table_name FROM existing_guarded_tables
                 EXCEPT
                 SELECT table_name FROM installed_guards
               ) AS ready
    `)
    if (result.rows?.[0]?.ready !== true) {
      throw new Error('Persistent job schedule or job lease write fence is not ready')
    }
  }

  async claim(input: SlotIdentity & { ownerId: string; staleAfterMs: number }): Promise<ScheduledJobSlotClaim> {
    const result = await query(
      `INSERT INTO public.scheduled_job_slots (
         job_name,
         scheduled_for,
         status,
         claim_owner,
         claim_token,
         claimed_at,
         attempt_count,
         updated_at
       ) VALUES ($1, $2, 'running', $3, $4, NOW(), 1, NOW())
       ON CONFLICT (job_name, scheduled_for) DO UPDATE
         SET status = 'running',
             claim_owner = EXCLUDED.claim_owner,
             claim_token = EXCLUDED.claim_token,
             claimed_at = NOW(),
             completed_at = NULL,
             attempt_count = public.scheduled_job_slots.attempt_count + 1,
             last_error = NULL,
             updated_at = NOW()
       WHERE public.scheduled_job_slots.status = 'failed'
          OR (
            public.scheduled_job_slots.status = 'running'
            AND public.scheduled_job_slots.claimed_at < NOW() - ($5::double precision * INTERVAL '1 millisecond')
          )
       RETURNING claim_token`,
      [
        input.jobName,
        input.scheduledFor.toISOString(),
        input.ownerId,
        input.claimToken,
        normalizePositiveInteger(input.staleAfterMs, DEFAULT_STALE_AFTER_MS),
      ],
    )

    if (result.rowCount === 1) {
      return { claimed: true, claimToken: input.claimToken }
    }

    const existing = await query(
      `SELECT status
         FROM public.scheduled_job_slots
        WHERE job_name = $1
          AND scheduled_for = $2`,
      [input.jobName, input.scheduledFor.toISOString()],
    )
    const status = String(existing.rows[0]?.status ?? '')
    return {
      claimed: false,
      reason: status === 'succeeded' || status === 'running' ? status : 'not_claimed',
    }
  }

  async succeed(input: SlotIdentity) {
    const result = await query(
      `UPDATE public.scheduled_job_slots
          SET status = 'succeeded',
              completed_at = NOW(),
              updated_at = NOW(),
              last_error = NULL
        WHERE job_name = $1
          AND scheduled_for = $2
          AND claim_token = $3
          AND status = 'running'`,
      [input.jobName, input.scheduledFor.toISOString(), input.claimToken],
    )
    return result.rowCount === 1
  }

  async fail(input: SlotIdentity & { error: unknown }) {
    const result = await query(
      `UPDATE public.scheduled_job_slots
          SET status = 'failed',
              completed_at = NOW(),
              updated_at = NOW(),
              last_error = $4
        WHERE job_name = $1
          AND scheduled_for = $2
          AND claim_token = $3
          AND status = 'running'`,
      [
        input.jobName,
        input.scheduledFor.toISOString(),
        input.claimToken,
        input.error instanceof Error ? input.error.message : String(input.error),
      ],
    )
    return result.rowCount === 1
  }
}

const databaseSlotStore = new DatabaseScheduledJobSlotStore()

export async function assertPersistentJobScheduleReady(
  store: ScheduledJobSlotStore = databaseSlotStore,
) {
  await store.assertReady()
}

export async function runPersistentScheduledSlot(
  input: {
    jobName: string
    scheduledFor: Date
    ownerId: string
    staleAfterMs: number
    isCatchUp: boolean
  },
  execute: (details: { scheduledFor: Date; isCatchUp: boolean }) => Promise<unknown>,
  store: ScheduledJobSlotStore = databaseSlotStore,
) {
  const claimToken = randomUUID()
  const claim = await store.claim({ ...input, claimToken })
  if (claim.claimed === false) return { executed: false as const, reason: claim.reason }

  try {
    const value = await execute({
      scheduledFor: input.scheduledFor,
      isCatchUp: input.isCatchUp,
    })
    const completed = await store.succeed({ ...input, claimToken })
    if (!completed) {
      throw new Error(`Scheduled job slot completion fence rejected: ${input.jobName}`)
    }
    return { executed: true as const, value }
  } catch (error) {
    const failed = await store.fail({ ...input, claimToken, error })
    if (!failed) {
      throw new AggregateError(
        [error],
        `Scheduled job slot failure fence rejected: ${input.jobName}`,
      )
    }
    throw error
  }
}

export class PersistentWallClockJobTimer {
  private readonly store: ScheduledJobSlotStore
  private readonly catchUpCoordinator: PersistentJobCatchUpCoordinator
  private readonly ownerId: string
  private readonly staleAfterMs: number
  private readonly catchUp: CatchUpOptions
  private readonly timer: WallClockJobTimer
  private executionQueue: Promise<void> = Promise.resolve()
  private nextScheduledSlot: Date | null = null
  private isScheduled = false

  constructor(private readonly options: PersistentWallClockJobTimerOptions) {
    this.store = options.store ?? databaseSlotStore
    this.catchUpCoordinator = options.catchUpCoordinator ?? defaultCatchUpCoordinator
    this.ownerId = options.ownerId ?? `${hostname()}:${process.pid}`
    this.staleAfterMs = normalizePositiveInteger(options.staleAfterMs ?? 0, DEFAULT_STALE_AFTER_MS)
    this.catchUp = options.catchUp ?? DEFAULT_CATCH_UP
    this.timer = new WallClockJobTimer({
      calculateNext: (now) => {
        this.nextScheduledSlot = calculateNextWallClockSlot(now, options.schedule)
        return this.nextScheduledSlot
      },
      execute: async () => {
        const scheduledFor = this.nextScheduledSlot
        if (!scheduledFor) throw new Error(`Missing scheduled slot for ${options.jobName}`)
        await this.enqueue(scheduledFor, false)
      },
      onScheduled: (details) => {
        this.nextScheduledSlot = details.nextRun
        options.onScheduled?.(details)
      },
      onError: options.onError,
    })
  }

  start() {
    if (!this.timer.start()) return false
    this.isScheduled = true
    registeredPersistentJobNames.add(this.options.jobName)

    const now = new Date()
    for (const scheduledFor of calculateDueWallClockSlots(now, this.options.schedule, this.catchUp)) {
      void this.enqueue(scheduledFor, true).catch((error) => this.options.onError?.(error))
    }
    return true
  }

  stop() {
    const stopped = this.timer.stop()
    if (stopped) {
      this.isScheduled = false
      this.nextScheduledSlot = null
      registeredPersistentJobNames.delete(this.options.jobName)
    }
    return stopped
  }

  getStatus() {
    return {
      isScheduled: this.isScheduled,
      nextRun: this.nextScheduledSlot ? new Date(this.nextScheduledSlot) : null,
    }
  }

  private enqueue(scheduledFor: Date, isCatchUp: boolean) {
    const operation = this.executionQueue.then(async () => {
      const runSlot = async () => {
        if (isCatchUp && !this.isScheduled) return
        await this.store.assertReady()
        await runPersistentScheduledSlot(
          {
            jobName: this.options.jobName,
            scheduledFor,
            ownerId: this.ownerId,
            staleAfterMs: this.staleAfterMs,
            isCatchUp,
          },
          this.options.execute,
          this.store,
        )
      }

      if (isCatchUp) {
        await this.catchUpCoordinator.run(runSlot)
        return
      }
      await runSlot()
    })
    this.executionQueue = operation.catch(() => undefined)
    return operation
  }
}
