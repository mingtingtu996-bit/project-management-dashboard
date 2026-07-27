import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'

const DEFAULT_WARMUP_DELAY_MS = 2_500
const DEFAULT_WARMUP_PROJECT_LIMIT = 1
const DEFAULT_WARMUP_TASK_LIMIT = 50

export type ReadModelWarmupAdapters = {
  listActiveProjectIds?: () => Promise<string[]>
  warmAcceptanceFlowSnapshot?: (projectId: string) => Promise<unknown>
  warmCurrentDurationForecastBatchCache?: (taskIds: string[], projectId: string) => Promise<unknown>
  warmDashboardProjectSummaryCache?: (projectId: string) => Promise<unknown>
  warmDashboardTodayProgressCache?: (projectId: string) => Promise<unknown>
  warmDataQualityProjectSummaryCache?: (projectId: string, month?: string | null) => Promise<unknown>
  warmDrawingBoardCache?: (projectId: string) => Promise<unknown>
  warmPreMilestoneBoardCache?: (projectId: string) => Promise<unknown>
  warmProjectListCache?: (input: {
    userId: string
    globalRole: 'company_admin' | 'regular'
    requestedCompanyId: string | null
    currentCompanyId: string | null
  }) => Promise<unknown>
  warmReminderSettingsCache?: (userId: string | undefined, projectId?: string, companyId?: string | null) => Promise<unknown>
  warmResponsibilityCache?: (projectId: string) => Promise<unknown>
  warmRiskListCache?: (projectId?: string | null) => Promise<unknown>
  warmWeeklyDigestCache?: (projectId: string) => Promise<unknown>
}

let warmupAdapters: ReadModelWarmupAdapters = {}

export function registerReadModelWarmupAdapters(adapters: ReadModelWarmupAdapters) {
  warmupAdapters = { ...warmupAdapters, ...adapters }
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function readExplicitWarmupProjectIds() {
  const values = [
    process.env.READ_MODEL_WARMUP_PROJECT_IDS,
    process.env.PROJECT_ID,
  ]
  return values
    .flatMap((value) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

// workspace-isolation-system-job-approved: startup read-model warmup enumerates ids only and never returns cross-company data to a request.
async function resolveWarmupProjectIds(limit: number) {
  const explicitProjectIds = readExplicitWarmupProjectIds()
  let projectIds: string[] = []
  try {
    const result = await rawQuery(
      `SELECT id::text AS id, status
         FROM public.projects
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT $1`,
      [Math.max(limit * 4, limit)],
    )
    projectIds = result.rows
      .map((row) => String((row as { id?: string }).id ?? '').trim())
      .filter(Boolean)
  } catch (error) {
    logger.warn('[read-model-warmup] direct active project lookup failed; trying the registered business adapter', { error })
    projectIds = await warmupAdapters.listActiveProjectIds?.().catch((fallbackError) => {
      logger.warn('[read-model-warmup] failed to list active projects', { error: fallbackError })
      return []
    }) ?? []
  }
  return [...new Set([...explicitProjectIds, ...projectIds])].slice(0, limit)
}

async function listProjectTaskIds(projectId: string, limit: number) {
  if (limit <= 0) return []

  try {
    const result = await rawQuery(
      `SELECT id::text AS id
         FROM public.tasks
        WHERE project_id::text = $1
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT $2`,
      [projectId, limit],
    )
    return result.rows.map((row) => String((row as { id?: string }).id ?? '').trim()).filter(Boolean)
  } catch (error) {
    logger.warn('[read-model-warmup] direct task id lookup failed; skipping task-scoped warmups', { projectId, error })
    return []
  }
}

async function withWarmup(name: string, task: () => Promise<unknown>) {
  const startedAt = Date.now()
  try {
    await task()
    return { name, ok: true, ms: Date.now() - startedAt }
  } catch (error) {
    logger.warn('[read-model-warmup] cache warmup item failed', { name, error })
    return { name, ok: false, ms: Date.now() - startedAt }
  }
}

async function warmProjectReadModels(projectId: string, taskLimit: number) {
  const taskIds = await listProjectTaskIds(projectId, taskLimit)
  const jobs: Array<[string, () => Promise<unknown>]> = []

  if (warmupAdapters.warmAcceptanceFlowSnapshot) {
    jobs.push(['acceptance.flow-snapshot', () => warmupAdapters.warmAcceptanceFlowSnapshot!(projectId)])
  }

  if (warmupAdapters.warmDashboardProjectSummaryCache) {
    jobs.push(['dashboard.project-summary', () => warmupAdapters.warmDashboardProjectSummaryCache!(projectId)])
  }
  if (warmupAdapters.warmDashboardTodayProgressCache) {
    jobs.push(['dashboard.today-progress', () => warmupAdapters.warmDashboardTodayProgressCache!(projectId)])
  }
  if (warmupAdapters.warmDataQualityProjectSummaryCache) {
    jobs.push(['data-quality.project-summary', () => warmupAdapters.warmDataQualityProjectSummaryCache!(projectId)])
  }
  if (warmupAdapters.warmDrawingBoardCache) {
    jobs.push(['drawings.board', () => warmupAdapters.warmDrawingBoardCache!(projectId)])
  }
  if (warmupAdapters.warmPreMilestoneBoardCache) {
    jobs.push(['pre-milestones.board', () => warmupAdapters.warmPreMilestoneBoardCache!(projectId)])
  }
  if (warmupAdapters.warmResponsibilityCache) {
    jobs.push(['responsibility', () => warmupAdapters.warmResponsibilityCache!(projectId)])
  }
  if (warmupAdapters.warmRiskListCache) {
    jobs.push(['risks.list', () => warmupAdapters.warmRiskListCache!(projectId)])
  }
  if (warmupAdapters.warmWeeklyDigestCache) {
    jobs.push(['weekly-digest.latest', () => warmupAdapters.warmWeeklyDigestCache!(projectId)])
  }

  if (taskIds.length > 0 && warmupAdapters.warmCurrentDurationForecastBatchCache) {
    jobs.push(['duration-suggestions.current-batch', () => warmupAdapters.warmCurrentDurationForecastBatchCache!(taskIds, projectId)])
  }

  const results = []
  for (const [name, task] of jobs) {
    results.push(await withWarmup(name, task))
  }
  logger.info('[read-model-warmup] project complete', {
    projectId,
    taskCount: taskIds.length,
    results,
  })
  return results
}

export async function runReadModelWarmup() {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return
  if (process.env.READ_MODEL_WARMUP_ENABLED === 'false') {
    logger.info('[read-model-warmup] skipped by READ_MODEL_WARMUP_ENABLED=false')
    return
  }

  const projectLimit = readPositiveIntegerEnv('READ_MODEL_WARMUP_PROJECT_LIMIT', DEFAULT_WARMUP_PROJECT_LIMIT)
  const taskLimit = readPositiveIntegerEnv('READ_MODEL_WARMUP_TASK_LIMIT', DEFAULT_WARMUP_TASK_LIMIT)
  const projectIds = await resolveWarmupProjectIds(projectLimit)
  if (projectIds.length === 0) {
    logger.info('[read-model-warmup] skipped because no active projects were found')
    return
  }

  const devUserId = String(process.env.DEV_USER_ID ?? '').trim()
  const devCompanyId = String(process.env.DEV_COMPANY_ID ?? '').trim()
  if (devUserId && (warmupAdapters.warmProjectListCache || warmupAdapters.warmReminderSettingsCache)) {
    const devJobs: Array<Promise<unknown>> = []
    if (warmupAdapters.warmProjectListCache) {
      devJobs.push(withWarmup('projects.list', () => warmupAdapters.warmProjectListCache!({
        userId: devUserId,
        globalRole: process.env.DEV_GLOBAL_ROLE === 'company_admin' ? 'company_admin' : 'regular',
        requestedCompanyId: devCompanyId || null,
        currentCompanyId: devCompanyId || null,
      })))
    }
    if (warmupAdapters.warmReminderSettingsCache) {
      devJobs.push(withWarmup('reminders.settings', () => warmupAdapters.warmReminderSettingsCache!(devUserId, undefined, devCompanyId || undefined)))
    }
    await Promise.all([
      ...devJobs,
    ])
  }

  const startedAt = Date.now()
  logger.info('[read-model-warmup] starting', { projectCount: projectIds.length, taskLimit })
  for (const projectId of projectIds) {
    await warmProjectReadModels(projectId, taskLimit)
  }
  logger.info('[read-model-warmup] finished', {
    projectCount: projectIds.length,
    ms: Date.now() - startedAt,
  })
}

export function scheduleReadModelWarmup() {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return
  if (process.env.READ_MODEL_WARMUP_ENABLED === 'false') return

  const delayMs = readPositiveIntegerEnv('READ_MODEL_WARMUP_DELAY_MS', DEFAULT_WARMUP_DELAY_MS)
  setTimeout(() => {
    runReadModelWarmup().catch((error) => {
      logger.warn('[read-model-warmup] failed', { error })
    })
  }, delayMs)
}
