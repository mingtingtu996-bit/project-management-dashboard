import type { Task } from '../types/db.js'
import { getProjectCompanyId } from '../auth/access.js'
import { query as databaseQuery, withDatabaseTransaction } from '../database.js'
import { calendarDaysToMilliseconds } from '../utils/durationDays.js'
import {
  collectDurationExperienceSampleFromTask,
  type DurationExperienceCollectionOptions,
} from './durationExperienceService.js'

export type DurationExperienceReconciliationSourceType =
  | 'task_completion'
  | 'structured_cause_confirmation'

export type DurationExperienceRebuildGeneration = {
  id: string
  generationToken: string
}

type DurationExperienceQueueTransitionStatus = 'pending' | 'retrying'

export type DurationExperienceReconciliationQueueItem = {
  id: string
  companyId: string
  projectId: string
  taskId: string
  actorId: string | null
  trigger: string
  sourceType: DurationExperienceReconciliationSourceType
  generationToken: string
  attemptCount: number
  maxAttempts: number
  task: Task
}

export interface DurationExperienceReconciliationStore {
  enqueue(record: {
    companyId: string
    projectId: string
    taskId: string
    actorId: string | null
    trigger: string
    sourceType: DurationExperienceReconciliationSourceType
    lastError: string | null
    maxAttempts: number
  }): Promise<DurationExperienceRebuildGeneration | null>
  registerMissingCompletedTasks(input: { projectIds: string[]; maxAttempts: number }): Promise<number>
  listDue(input: { projectIds: string[]; limit: number }): Promise<DurationExperienceReconciliationQueueItem[]>
  markCompleted(id: string, input: {
    generationToken: string
    expectedStatus: DurationExperienceQueueTransitionStatus
  }): Promise<boolean>
  markDeferred(id: string, input: {
    generationToken: string
    expectedStatus: 'retrying'
    reason: string
    nextAttemptAt: string
  }): Promise<boolean>
  markFailed(id: string, input: {
    generationToken: string
    expectedStatus: 'retrying'
    error: string
    attemptCount: number
    deadLetter: boolean
    nextAttemptAt: string | null
  }): Promise<boolean>
}

type QueryExecutor = (text: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number | null }>
type WithTransaction = <T>(work: () => Promise<T>) => Promise<T>

export type DurationExperienceTaskLockInput = DurationExperienceCollectionOptions & {
  companyId?: string | null
  projectId: string
  taskId: string
}

type DurationExperienceTaskLockDependencies = {
  queryExec?: QueryExecutor
  withTransaction?: WithTransaction
  collectSample?: typeof collectDurationExperienceSampleFromTask
  resolveCompanyId?: typeof getProjectCompanyId
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? 'unknown error')).slice(0, 2000)
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function isReconciliationSourceType(value: string): value is DurationExperienceReconciliationSourceType {
  return value === 'task_completion' || value === 'structured_cause_confirmation'
}

function mapQueueGeneration(value: unknown): DurationExperienceRebuildGeneration | null {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const id = normalizeText(record.id)
  const generationToken = normalizeText(record.generation_token ?? record.generationToken)
  return id && generationToken ? { id, generationToken } : null
}

function transitionApplied(result: { rows?: unknown[]; rowCount?: number | null }) {
  return (result.rowCount ?? result.rows?.length ?? 0) === 1
}

function retryAt(attemptCount: number) {
  const delayMs = Math.min(calendarDaysToMilliseconds(1), 5 * 60 * 1000 * (2 ** Math.max(0, attemptCount - 1)))
  return new Date(Date.now() + delayMs).toISOString()
}

function createDatabaseDurationExperienceReconciliationStore(
  queryExec: QueryExecutor = databaseQuery as QueryExecutor,
): DurationExperienceReconciliationStore {
  return {
    async enqueue(record) {
      const result = await queryExec(
        `insert into public.duration_experience_collection_queue (
           company_id, project_id, task_id, actor_id, trigger, source_type,
           status, attempt_count, max_attempts, next_attempt_at, last_error,
           created_at, updated_at
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
           'pending', 0, $7, clock_timestamp(), $8, clock_timestamp(), clock_timestamp()
         )
         on conflict (company_id, task_id, source_type) do update
           set actor_id = coalesce(excluded.actor_id, duration_experience_collection_queue.actor_id),
               trigger = excluded.trigger,
               status = case
                 when excluded.source_type = 'structured_cause_confirmation' then 'pending'
                 when duration_experience_collection_queue.status = 'dead_letter' then 'dead_letter'
                 else 'pending'
               end,
               attempt_count = case
                 when excluded.source_type = 'structured_cause_confirmation' then 0
                 else duration_experience_collection_queue.attempt_count
               end,
               max_attempts = case
                 when excluded.source_type = 'structured_cause_confirmation' then excluded.max_attempts
                 else duration_experience_collection_queue.max_attempts
               end,
               next_attempt_at = case
                 when excluded.source_type = 'structured_cause_confirmation' then clock_timestamp()
                 when duration_experience_collection_queue.status = 'dead_letter' then duration_experience_collection_queue.next_attempt_at
                 else clock_timestamp()
               end,
               last_error = case
                 when excluded.source_type = 'structured_cause_confirmation' then null
                 else excluded.last_error
               end,
               completed_at = case
                 when excluded.source_type = 'structured_cause_confirmation' then null
                 else duration_experience_collection_queue.completed_at
               end,
               dead_lettered_at = case
                 when excluded.source_type = 'structured_cause_confirmation' then null
                 else duration_experience_collection_queue.dead_lettered_at
               end,
               updated_at = GREATEST(
                 clock_timestamp(),
                 duration_experience_collection_queue.updated_at + interval '1 microsecond'
               )
         returning id, updated_at::text as generation_token`,
        [record.companyId, record.projectId, record.taskId, record.actorId, record.trigger, record.sourceType, record.maxAttempts, record.lastError],
      )
      return mapQueueGeneration(result.rows?.[0])
    },

    async registerMissingCompletedTasks(input) {
      if (input.projectIds.length === 0) return 0
      const result = await queryExec(
        `insert into public.duration_experience_collection_queue (
           company_id, project_id, task_id, actor_id, trigger, source_type,
           status, attempt_count, max_attempts, next_attempt_at, last_error,
           created_at, updated_at
         )
         select p.company_id, t.project_id, t.id, null, 'missing_completed_sample_scan', 'task_completion',
                'pending', 0, $2, clock_timestamp(),
                'completed task has no active duration experience sample', clock_timestamp(), clock_timestamp()
           from public.tasks t
           join public.projects p on p.id = t.project_id
      left join public.duration_experience_samples s
             on s.task_id = t.id
            and s.source_type = 'task_completion'
            and s.sample_status = 'active'
          where t.project_id = any($1::uuid[])
            and (
              lower(coalesce(t.status, '')) in ('completed', 'done', 'closed')
              or coalesce(t.status, '') in (U&'\\5DF2\\5B8C\\6210', U&'\\5DF2\\5173\\95ED')
              or coalesce(t.progress, 0) >= 100
              or t.actual_end_date is not null
            )
            and s.id is null
         on conflict (company_id, task_id, source_type) do update
           set status = case
                 when duration_experience_collection_queue.status = 'dead_letter' then 'dead_letter'
                 else 'pending'
               end,
               next_attempt_at = case
                 when duration_experience_collection_queue.status = 'dead_letter' then duration_experience_collection_queue.next_attempt_at
                 else least(coalesce(duration_experience_collection_queue.next_attempt_at, now()), now())
               end,
               updated_at = GREATEST(
                 clock_timestamp(),
                 duration_experience_collection_queue.updated_at + interval '1 microsecond'
               )
         returning id`,
        [input.projectIds, input.maxAttempts],
      )
      return result.rowCount ?? result.rows?.length ?? 0
    },

    async listDue(input) {
      if (input.projectIds.length === 0) return []
      const result = await queryExec(
        `with due as (
           select q.id
             from public.duration_experience_collection_queue q
            where q.project_id = any($1::uuid[])
              and q.source_type in ('task_completion', 'structured_cause_confirmation')
              and q.status in ('pending', 'retrying', 'waiting_for_facts')
              and q.next_attempt_at <= now()
            order by q.next_attempt_at asc, q.created_at asc
            for update skip locked
            limit $2
         )
         update public.duration_experience_collection_queue q
            set status = 'retrying',
                next_attempt_at = now() + interval '15 minutes',
                updated_at = GREATEST(clock_timestamp(), q.updated_at + interval '1 microsecond')
           from due, public.tasks t
          where q.id = due.id
            and t.id = q.task_id
            and t.project_id = q.project_id
         returning q.id,
                   q.company_id,
                   q.project_id,
                   q.task_id,
                   q.actor_id,
                   q.trigger,
                   q.source_type,
                   q.updated_at::text AS generation_token,
                   q.attempt_count,
                   q.max_attempts,
                   to_jsonb(t) as task`,
        [input.projectIds, input.limit],
      )
      return (result.rows ?? []).map((row) => {
        const record = row as Record<string, unknown>
        const sourceType = normalizeText(record.source_type)
        if (!isReconciliationSourceType(sourceType)) return null
        return {
          id: normalizeText(record.id),
          companyId: normalizeText(record.company_id),
          projectId: normalizeText(record.project_id),
          taskId: normalizeText(record.task_id),
          actorId: normalizeText(record.actor_id) || null,
          trigger: normalizeText(record.trigger) || 'duration_experience_reconciliation',
          sourceType,
          generationToken: normalizeText(record.generation_token),
          attemptCount: Math.max(0, Number(record.attempt_count) || 0),
          maxAttempts: positiveInteger(record.max_attempts, 5),
          task: record.task as Task,
        } satisfies DurationExperienceReconciliationQueueItem
      }).filter((row): row is DurationExperienceReconciliationQueueItem => Boolean(
        row?.id && row.companyId && row.projectId && row.taskId && row.generationToken && row.task,
      ))
    },

    async markCompleted(id, input) {
      const result = await queryExec(
        `update public.duration_experience_collection_queue
            set status = 'completed', completed_at = clock_timestamp(), next_attempt_at = null,
                last_error = null,
                updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
          where id = $1::uuid
            and updated_at = $2::timestamptz
            and status = $3
          returning id`,
        [id, input.generationToken, input.expectedStatus],
      )
      return transitionApplied(result)
    },

    async markDeferred(id, input) {
      const result = await queryExec(
        `update public.duration_experience_collection_queue
            set status = 'waiting_for_facts', next_attempt_at = $4::timestamptz,
                last_error = $5,
                updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
          where id = $1::uuid
            and updated_at = $2::timestamptz
            and status = $3
          returning id`,
        [id, input.generationToken, input.expectedStatus, input.nextAttemptAt, input.reason],
      )
      return transitionApplied(result)
    },

    async markFailed(id, input) {
      const result = await queryExec(
        `update public.duration_experience_collection_queue
            set status = $4,
                attempt_count = $5,
                next_attempt_at = $6::timestamptz,
                last_error = $7,
                dead_lettered_at = case when $4 = 'dead_letter' then clock_timestamp() else null end,
                updated_at = GREATEST(clock_timestamp(), updated_at + interval '1 microsecond')
          where id = $1::uuid
            and updated_at = $2::timestamptz
            and status = $3
          returning id`,
        [
          id,
          input.generationToken,
          input.expectedStatus,
          input.deadLetter ? 'dead_letter' : 'retrying',
          input.attemptCount,
          input.nextAttemptAt,
          input.error,
        ],
      )
      return transitionApplied(result)
    },
  }
}

const databaseStore = createDatabaseDurationExperienceReconciliationStore()

export async function collectDurationExperienceSampleWithTaskLock(
  input: DurationExperienceTaskLockInput,
  dependencies: DurationExperienceTaskLockDependencies = {},
): Promise<boolean> {
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId)
  if (!projectId || !taskId) {
    throw new Error('Task-locked duration experience collection requires exact project and task identity.')
  }

  const queryExec = dependencies.queryExec ?? (databaseQuery as QueryExecutor)
  const withTransaction = dependencies.withTransaction ?? withDatabaseTransaction
  const collectSample = dependencies.collectSample ?? collectDurationExperienceSampleFromTask
  const resolveCompanyId = dependencies.resolveCompanyId ?? getProjectCompanyId

  return withTransaction(async () => {
    const companyId = normalizeText(input.companyId) || normalizeText(await resolveCompanyId(projectId))
    if (!companyId) {
      throw new Error('Task-locked duration experience collection requires exact tenant ownership.')
    }
    const result = await queryExec(
      `SELECT task.*
         FROM public.tasks task
         JOIN public.projects project ON project.id = task.project_id
        WHERE task.id = $1
          AND task.project_id = $2
          AND project.company_id = $3
        FOR NO KEY UPDATE OF task`,
      [taskId, projectId, companyId],
    )
    const task = result.rows?.[0] as Task | undefined
    if (!task) {
      throw new Error('Task-locked duration experience collection task was not found in the requested tenant scope.')
    }
    return collectSample(task, {
      previousTask: input.previousTask,
      actorId: normalizeText(input.actorId) || null,
      trigger: normalizeText(input.trigger) || 'task_completion',
    })
  })
}

export async function enqueueDurationExperienceCollectionFailure(input: {
  companyId?: string | null
  projectId: string
  taskId: string
  actorId?: string | null
  trigger?: string | null
  error: unknown
  maxAttempts?: number | null
}, dependencies: {
  store?: DurationExperienceReconciliationStore
  resolveCompanyId?: typeof getProjectCompanyId
} = {}) {
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId)
  if (!projectId || !taskId) throw new Error('Duration experience reconciliation requires project and task identity.')
  const companyId = normalizeText(input.companyId)
    || normalizeText(await (dependencies.resolveCompanyId ?? getProjectCompanyId)(projectId))
  if (!companyId) throw new Error('Duration experience reconciliation tenant ownership could not be resolved.')
  const record = {
    companyId,
    projectId,
    taskId,
    actorId: normalizeText(input.actorId) || null,
    trigger: normalizeText(input.trigger) || 'task_completion',
    sourceType: 'task_completion' as const,
    lastError: errorMessage(input.error),
    maxAttempts: positiveInteger(input.maxAttempts, 5),
  }
  await (dependencies.store ?? databaseStore).enqueue(record)
  return record
}

export async function enqueueDurationExperienceRebuild(input: {
  companyId: string
  projectId: string
  taskId: string
  actorId: string
  trigger: 'structured_cause_user_confirmation'
  maxAttempts?: number | null
}, dependencies: {
  store?: DurationExperienceReconciliationStore
  queryExec?: QueryExecutor
} = {}) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId)
  const actorId = normalizeText(input.actorId)
  if (!companyId || !projectId || !taskId || !actorId) {
    throw new Error('Structured cause duration rebuild requires exact tenant, project, task, and actor identity.')
  }
  const store = dependencies.store
    ?? (dependencies.queryExec ? createDatabaseDurationExperienceReconciliationStore(dependencies.queryExec) : databaseStore)
  const queued = await store.enqueue({
    companyId,
    projectId,
    taskId,
    actorId,
    trigger: input.trigger,
    sourceType: 'structured_cause_confirmation',
    lastError: null,
    maxAttempts: Math.min(20, positiveInteger(input.maxAttempts, 5)),
  })
  if (!queued) throw new Error('Structured cause duration rebuild queue readback required.')
  return queued
}

export async function completeDurationExperienceRebuild(
  generation: DurationExperienceRebuildGeneration,
  dependencies: {
    store?: DurationExperienceReconciliationStore
    queryExec?: QueryExecutor
  } = {},
) {
  const queueId = normalizeText(generation.id)
  const generationToken = normalizeText(generation.generationToken)
  if (!queueId || !generationToken) {
    throw new Error('Structured cause duration rebuild queue generation is required.')
  }
  const store = dependencies.store
    ?? (dependencies.queryExec ? createDatabaseDurationExperienceReconciliationStore(dependencies.queryExec) : databaseStore)
  return store.markCompleted(queueId, { generationToken, expectedStatus: 'pending' })
}

export async function reconcileDurationExperienceSamples(input: {
  projectIds?: readonly string[] | null
  limit?: number | null
  maxAttempts?: number | null
} = {}, dependencies: {
  store?: DurationExperienceReconciliationStore
  collectSample?: typeof collectDurationExperienceSampleFromTask
  queryExec?: QueryExecutor
  withTransaction?: WithTransaction
  resolveCompanyId?: typeof getProjectCompanyId
} = {}) {
  const projectIds = [...new Set((input.projectIds ?? []).map(normalizeText).filter(Boolean))]
  const limit = Math.min(500, positiveInteger(input.limit, 100))
  const maxAttempts = Math.min(20, positiveInteger(input.maxAttempts, 5))
  const store = dependencies.store ?? databaseStore
  const discovered = await store.registerMissingCompletedTasks({ projectIds, maxAttempts })
  const items = await store.listDue({ projectIds, limit })
  const summary = {
    discovered,
    scanned: items.length,
    recovered: 0,
    deferred: 0,
    retrying: 0,
    deadLettered: 0,
  }

  for (const item of items) {
    try {
      const collected = await collectDurationExperienceSampleWithTaskLock({
        companyId: item.companyId,
        projectId: item.projectId,
        taskId: item.taskId,
        actorId: item.actorId,
        trigger: item.trigger,
      }, {
        queryExec: dependencies.queryExec,
        withTransaction: dependencies.withTransaction,
        collectSample: dependencies.collectSample,
        resolveCompanyId: dependencies.resolveCompanyId,
      })
      if (!collected) {
        const applied = await store.markDeferred(item.id, {
          generationToken: item.generationToken,
          expectedStatus: 'retrying',
          reason: 'completed_task_duration_facts_not_collectable',
          nextAttemptAt: new Date(Date.now() + calendarDaysToMilliseconds(1)).toISOString(),
        })
        if (applied) summary.deferred += 1
        continue
      }
      const applied = await store.markCompleted(item.id, {
        generationToken: item.generationToken,
        expectedStatus: 'retrying',
      })
      if (applied) summary.recovered += 1
    } catch (error) {
      const attemptCount = item.attemptCount + 1
      const itemMaxAttempts = positiveInteger(item.maxAttempts, maxAttempts)
      const deadLetter = attemptCount >= itemMaxAttempts
      const applied = await store.markFailed(item.id, {
        generationToken: item.generationToken,
        expectedStatus: 'retrying',
        error: errorMessage(error),
        attemptCount,
        deadLetter,
        nextAttemptAt: deadLetter ? null : retryAt(attemptCount),
      })
      if (applied) {
        if (deadLetter) summary.deadLettered += 1
        else summary.retrying += 1
      }
    }
  }

  return summary
}

export async function rebuildDurationExperienceSampleForTask(input: {
  companyId: string
  projectId: string
  taskId: string
  actorId?: string | null
  trigger?: string | null
}, dependencies: {
  queryExec?: QueryExecutor
  withTransaction?: WithTransaction
  collectSample?: typeof collectDurationExperienceSampleFromTask
  resolveCompanyId?: typeof getProjectCompanyId
} = {}) {
  const companyId = normalizeText(input.companyId)
  const projectId = normalizeText(input.projectId)
  const taskId = normalizeText(input.taskId)
  if (!companyId || !projectId || !taskId) {
    throw new Error('Duration experience sample rebuild requires exact tenant, project, and task identity.')
  }

  return collectDurationExperienceSampleWithTaskLock({
    companyId,
    projectId,
    taskId,
    actorId: normalizeText(input.actorId) || null,
    trigger: normalizeText(input.trigger) || 'structured_cause_user_confirmation',
  }, dependencies)
}

export { createDatabaseDurationExperienceReconciliationStore }
