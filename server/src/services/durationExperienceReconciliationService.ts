import type { Task } from '../types/db.js'
import { getProjectCompanyId } from '../auth/access.js'
import { query as databaseQuery } from '../database.js'
import { calendarDaysToMilliseconds } from '../utils/durationDays.js'
import { collectDurationExperienceSampleFromTask } from './durationExperienceService.js'

export type DurationExperienceReconciliationQueueItem = {
  id: string
  companyId: string
  projectId: string
  taskId: string
  actorId: string | null
  trigger: string
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
    sourceType: 'task_completion'
    lastError: string
    maxAttempts: number
  }): Promise<unknown>
  registerMissingCompletedTasks(input: { projectIds: string[]; maxAttempts: number }): Promise<number>
  listDue(input: { projectIds: string[]; limit: number }): Promise<DurationExperienceReconciliationQueueItem[]>
  markCompleted(id: string): Promise<void>
  markDeferred(id: string, input: { reason: string; nextAttemptAt: string }): Promise<void>
  markFailed(id: string, input: {
    error: string
    attemptCount: number
    deadLetter: boolean
    nextAttemptAt: string | null
  }): Promise<void>
}

type QueryExecutor = (text: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number | null }>

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
         ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, 'pending', 0, $7, now(), $8, now(), now())
         on conflict (company_id, task_id, source_type) do update
           set actor_id = coalesce(excluded.actor_id, duration_experience_collection_queue.actor_id),
               trigger = excluded.trigger,
               status = case
                 when duration_experience_collection_queue.status = 'dead_letter' then 'dead_letter'
                 else 'pending'
               end,
               next_attempt_at = case
                 when duration_experience_collection_queue.status = 'dead_letter' then duration_experience_collection_queue.next_attempt_at
                 else now()
               end,
               last_error = excluded.last_error,
               updated_at = now()
         returning *`,
        [record.companyId, record.projectId, record.taskId, record.actorId, record.trigger, record.sourceType, record.maxAttempts, record.lastError],
      )
      return result.rows?.[0] ?? null
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
                'pending', 0, $2, now(), 'completed task has no active duration experience sample', now(), now()
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
               updated_at = now()
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
              and q.status in ('pending', 'retrying', 'waiting_for_facts')
              and q.next_attempt_at <= now()
            order by q.next_attempt_at asc, q.created_at asc
            for update skip locked
            limit $2
         )
         update public.duration_experience_collection_queue q
            set status = 'retrying',
                next_attempt_at = now() + interval '15 minutes',
                updated_at = now()
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
                   q.attempt_count,
                   q.max_attempts,
                   to_jsonb(t) as task`,
        [input.projectIds, input.limit],
      )
      return (result.rows ?? []).map((row) => {
        const record = row as Record<string, unknown>
        return {
          id: normalizeText(record.id),
          companyId: normalizeText(record.company_id),
          projectId: normalizeText(record.project_id),
          taskId: normalizeText(record.task_id),
          actorId: normalizeText(record.actor_id) || null,
          trigger: normalizeText(record.trigger) || 'duration_experience_reconciliation',
          attemptCount: Math.max(0, Number(record.attempt_count) || 0),
          maxAttempts: positiveInteger(record.max_attempts, 5),
          task: record.task as Task,
        }
      }).filter((row) => row.id && row.companyId && row.projectId && row.taskId && row.task)
    },

    async markCompleted(id) {
      await queryExec(
        `update public.duration_experience_collection_queue
            set status = 'completed', completed_at = now(), next_attempt_at = null,
                last_error = null, updated_at = now()
          where id = $1::uuid`,
        [id],
      )
    },

    async markDeferred(id, input) {
      await queryExec(
        `update public.duration_experience_collection_queue
            set status = 'waiting_for_facts', next_attempt_at = $2::timestamptz,
                last_error = $3, updated_at = now()
          where id = $1::uuid`,
        [id, input.nextAttemptAt, input.reason],
      )
    },

    async markFailed(id, input) {
      await queryExec(
        `update public.duration_experience_collection_queue
            set status = $2,
                attempt_count = $3,
                next_attempt_at = $4::timestamptz,
                last_error = $5,
                dead_lettered_at = case when $2 = 'dead_letter' then now() else null end,
                updated_at = now()
          where id = $1::uuid`,
        [id, input.deadLetter ? 'dead_letter' : 'retrying', input.attemptCount, input.nextAttemptAt, input.error],
      )
    },
  }
}

const databaseStore = createDatabaseDurationExperienceReconciliationStore()

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

export async function reconcileDurationExperienceSamples(input: {
  projectIds?: readonly string[] | null
  limit?: number | null
  maxAttempts?: number | null
} = {}, dependencies: {
  store?: DurationExperienceReconciliationStore
  collectSample?: typeof collectDurationExperienceSampleFromTask
} = {}) {
  const projectIds = [...new Set((input.projectIds ?? []).map(normalizeText).filter(Boolean))]
  const limit = Math.min(500, positiveInteger(input.limit, 100))
  const maxAttempts = Math.min(20, positiveInteger(input.maxAttempts, 5))
  const store = dependencies.store ?? databaseStore
  const collectSample = dependencies.collectSample ?? collectDurationExperienceSampleFromTask
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
      const collected = await collectSample(item.task, {
        actorId: item.actorId,
        trigger: 'duration_experience_reconciliation',
      })
      if (!collected) {
        summary.deferred += 1
        await store.markDeferred(item.id, {
          reason: 'completed_task_duration_facts_not_collectable',
          nextAttemptAt: new Date(Date.now() + calendarDaysToMilliseconds(1)).toISOString(),
        })
        continue
      }
      summary.recovered += 1
      await store.markCompleted(item.id)
    } catch (error) {
      const attemptCount = item.attemptCount + 1
      const itemMaxAttempts = positiveInteger(item.maxAttempts, maxAttempts)
      const deadLetter = attemptCount >= itemMaxAttempts
      if (deadLetter) summary.deadLettered += 1
      else summary.retrying += 1
      await store.markFailed(item.id, {
        error: errorMessage(error),
        attemptCount,
        deadLetter,
        nextAttemptAt: deadLetter ? null : retryAt(attemptCount),
      })
    }
  }

  return summary
}

export { createDatabaseDurationExperienceReconciliationStore }
