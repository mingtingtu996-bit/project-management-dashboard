import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'

export type MonthlyPlanFulfillmentTrendItem = {
  month: string
  committedCount: number
  fulfilledCount: number
  rate: number
}

export type MonthlyPlanStatusSummary = {
  confirmedCount: number
  closedCount: number
  pendingCloseoutCount: number
  temporaryWithoutBaselineCount: number
}

export type MonthlyPlanConfirmationReadiness = {
  score: number
  recommendation: 'direct_confirmable' | 'manual_review_required'
  factors: {
    dataCompletenessScore: number
    e2ConfidenceScore: number
    capacityLoadScore: number
    unresolvedBlockerScore: number
    manualOverrideScore: number
    historicalFulfillmentScore: number
  }
  signals: {
    itemCount: number
    lowConfidenceItemCount: number
    backupItemCount: number
    conditionalItemCount: number
    manualOverrideItemCount: number
    historicalPenaltyItemCount: number
    capacityDemandDays: number
    capacityAllocatedDays: number
    capacityOverloadRate: number
  }
  reviewReasons: string[]
}

function normalizeCount(value: unknown) {
  const count = Number(value ?? 0)
  return Number.isFinite(count) ? count : 0
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readAlgorithmContext(item: { generation_metadata?: unknown }) {
  const metadata = readRecord(item.generation_metadata)
  return {
    ...metadata,
    ...readRecord(metadata.algorithm_context),
  }
}

function hasManualOverride(value: unknown) {
  return Object.values(readRecord(value)).some(Boolean)
}

function ratio(count: number, total: number) {
  return total > 0 ? count / total : 0
}

export function evaluateMonthlyPlanConfirmationReadiness(
  items: Array<{
    commitment_status?: string | null
    manual_override_fields?: unknown
    generation_metadata?: unknown
  }>,
): MonthlyPlanConfirmationReadiness {
  const activeItems = items.filter((item) => String(item.commitment_status ?? 'planned') !== 'cancelled')
  const itemCount = activeItems.length
  if (itemCount === 0) {
    return {
      score: 100,
      recommendation: 'direct_confirmable',
      factors: {
        dataCompletenessScore: 100,
        e2ConfidenceScore: 100,
        capacityLoadScore: 100,
        unresolvedBlockerScore: 100,
        manualOverrideScore: 100,
        historicalFulfillmentScore: 100,
      },
      signals: {
        itemCount: 0,
        lowConfidenceItemCount: 0,
        backupItemCount: 0,
        conditionalItemCount: 0,
        manualOverrideItemCount: 0,
        historicalPenaltyItemCount: 0,
        capacityDemandDays: 0,
        capacityAllocatedDays: 0,
        capacityOverloadRate: 0,
      },
      reviewReasons: [],
    }
  }

  let lowConfidenceItemCount = 0
  let e2LowConfidenceItemCount = 0
  let backupItemCount = 0
  let conditionalItemCount = 0
  let manualOverrideItemCount = 0
  let historicalPenaltyItemCount = 0
  let capacityDemandDays = 0
  let capacityAllocatedDays = 0

  for (const item of activeItems) {
    const metadata = readRecord(item.generation_metadata)
    const context = readAlgorithmContext(item)
    if (String(metadata.confidence ?? '').toLowerCase() === 'low') lowConfidenceItemCount += 1
    if (String(context.e2_confidence_level ?? '').toLowerCase() === 'low') e2LowConfidenceItemCount += 1
    const readiness = String(context.monthly_readiness_pool ?? '').toLowerCase()
    if (readiness === 'backup') backupItemCount += 1
    if (readiness === 'conditional') conditionalItemCount += 1
    if (hasManualOverride(item.manual_override_fields)) manualOverrideItemCount += 1
    if (context.carryover_aging_penalty_applied === true) historicalPenaltyItemCount += 1
    capacityDemandDays += Math.max(0, Number(context.monthly_capacity_demand_days ?? 0) || 0)
    capacityAllocatedDays += Math.max(0, Number(context.monthly_capacity_allocated_days ?? 0) || 0)
  }

  const capacityOverloadRate = capacityDemandDays > 0
    ? Math.max(0, (capacityDemandDays - capacityAllocatedDays) / capacityDemandDays)
    : 0
  const dataCompletenessScore = clampScore(100 - ratio(lowConfidenceItemCount, itemCount) * 100)
  const e2ConfidenceScore = clampScore(100 - ratio(e2LowConfidenceItemCount, itemCount) * 100)
  const capacityLoadScore = clampScore(100 - capacityOverloadRate * 85)
  const unresolvedBlockerScore = clampScore(100 - (ratio(backupItemCount, itemCount) * 100) - (ratio(conditionalItemCount, itemCount) * 30))
  const manualOverrideScore = clampScore(100 - ratio(manualOverrideItemCount, itemCount) * 100)
  const historicalFulfillmentScore = clampScore(100 - ratio(historicalPenaltyItemCount, itemCount) * 60 - ratio(conditionalItemCount + backupItemCount, itemCount) * 30)

  const score = clampScore(
    dataCompletenessScore * 0.2
    + e2ConfidenceScore * 0.2
    + capacityLoadScore * 0.2
    + unresolvedBlockerScore * 0.2
    + manualOverrideScore * 0.1
    + historicalFulfillmentScore * 0.1,
  )
  const reviewReasons: string[] = []
  if (lowConfidenceItemCount > 0 || e2LowConfidenceItemCount > 0) reviewReasons.push('monthly_plan_has_low_confidence_items')
  if (backupItemCount > 0) reviewReasons.push('monthly_plan_contains_backup_readiness_items')
  if (conditionalItemCount > 0) reviewReasons.push('monthly_plan_contains_conditional_readiness_items')
  if (capacityOverloadRate > 0.15) reviewReasons.push('monthly_plan_capacity_overloaded')
  if (manualOverrideItemCount > 0) reviewReasons.push('monthly_plan_has_manual_overrides')
  if (historicalPenaltyItemCount > 0) reviewReasons.push('monthly_plan_has_aging_carryover_penalty')

  return {
    score,
    recommendation: score >= 80 && reviewReasons.length === 0 ? 'direct_confirmable' : 'manual_review_required',
    factors: {
      dataCompletenessScore,
      e2ConfidenceScore,
      capacityLoadScore,
      unresolvedBlockerScore,
      manualOverrideScore,
      historicalFulfillmentScore,
    },
    signals: {
      itemCount,
      lowConfidenceItemCount,
      backupItemCount,
      conditionalItemCount,
      manualOverrideItemCount,
      historicalPenaltyItemCount,
      capacityDemandDays,
      capacityAllocatedDays,
      capacityOverloadRate: Number(capacityOverloadRate.toFixed(3)),
    },
    reviewReasons,
  }
}

function normalizeTrendRow(row: Record<string, unknown>): MonthlyPlanFulfillmentTrendItem {
  const committedCount = normalizeCount(row.committed_count)
  const fulfilledCount = normalizeCount(row.fulfilled_count)
  return {
    month: String(row.month ?? ''),
    committedCount,
    fulfilledCount,
    rate: committedCount > 0 ? Math.round((fulfilledCount / committedCount) * 100) : 0,
  }
}

function isFulfilledTask(task?: { status?: string | null; progress?: number | null } | null) {
  if (!task) return false
  const status = String(task.status ?? '').trim().toLowerCase()
  const progress = Number(task.progress ?? 0)
  return ['completed', 'done', 'finished'].includes(status) || progress >= 100
}

async function loadFulfillmentTrendViaRest(projectId: string, months: number): Promise<MonthlyPlanFulfillmentTrendItem[]> {
  const { data: plansData, error: plansError } = await supabase
    .from('monthly_plans')
    .select('id, month, status')
    .eq('project_id', projectId)
    .in('status', ['confirmed', 'closed'])
    .order('month', { ascending: false })
    .limit(months)

  if (plansError) throw plansError

  const plans = (plansData ?? []) as Array<{ id: string; month: string; status: string }>
  if (plans.length === 0) return []

  const planIds = plans.map((plan) => plan.id)
  const { data: itemsData, error: itemsError } = await supabase
    .from('monthly_plan_items')
    .select('monthly_plan_version_id, source_task_id, commitment_status')
    .eq('project_id', projectId)
    .in('monthly_plan_version_id', planIds)

  if (itemsError) throw itemsError

  const items = (itemsData ?? []) as Array<{
    monthly_plan_version_id: string
    source_task_id: string | null
    commitment_status: string | null
  }>
  const taskIds = [...new Set(items.map((item) => item.source_task_id).filter(Boolean))] as string[]
  const { data: tasksData, error: tasksError } = taskIds.length > 0
    ? await supabase.from('tasks').select('id, status, progress').eq('project_id', projectId).in('id', taskIds)
    : { data: [], error: null }

  if (tasksError) throw tasksError

  const taskStatusMap = new Map(
    (tasksData ?? []).map((task: { id: string; status: string; progress: number | null }) => [
      task.id,
      { status: task.status, progress: task.progress },
    ]),
  )

  return plans.map((plan) => {
    const planItems = items.filter(
      (item) =>
        item.monthly_plan_version_id === plan.id &&
        item.commitment_status !== 'cancelled' &&
        item.commitment_status !== null,
    )
    const committedCount = planItems.length
    const fulfilledCount = planItems.filter((item) => (
      item.source_task_id ? isFulfilledTask(taskStatusMap.get(item.source_task_id)) : false
    )).length

    return {
      month: plan.month,
      committedCount,
      fulfilledCount,
      rate: committedCount > 0 ? Math.round((fulfilledCount / committedCount) * 100) : 0,
    }
  }).reverse()
}

export async function getMonthlyPlanFulfillmentTrend(
  projectId: string,
  months: number,
): Promise<MonthlyPlanFulfillmentTrendItem[]> {
  try {
    const { rows } = await rawQuery(
      `
        WITH latest_plans AS (
          SELECT id, month
          FROM public.monthly_plans
          WHERE project_id::text = $1
            AND status = ANY($2::text[])
          ORDER BY month DESC
          LIMIT $3
        ),
        eligible_items AS (
          SELECT monthly_plan_version_id, source_task_id
          FROM public.monthly_plan_items
          WHERE project_id::text = $1
            AND monthly_plan_version_id IN (SELECT id FROM latest_plans)
            AND commitment_status IS NOT NULL
            AND commitment_status <> 'cancelled'
        )
        SELECT
          latest_plans.month,
          COUNT(eligible_items.monthly_plan_version_id)::int AS committed_count,
          COUNT(eligible_items.monthly_plan_version_id) FILTER (
            WHERE LOWER(TRIM(COALESCE(tasks.status, ''))) = ANY($4::text[])
               OR COALESCE(tasks.progress, 0) >= 100
          )::int AS fulfilled_count
        FROM latest_plans
        LEFT JOIN eligible_items
          ON eligible_items.monthly_plan_version_id = latest_plans.id
        LEFT JOIN public.tasks
          ON tasks.project_id::text = $1
         AND tasks.id = eligible_items.source_task_id
        GROUP BY latest_plans.month
        ORDER BY latest_plans.month ASC
      `,
      [projectId, ['confirmed', 'closed'], months, ['completed', 'done', 'finished']],
    )

    return (rows as Array<Record<string, unknown>>).map(normalizeTrendRow)
  } catch (error) {
    logger.warn('[monthlyPlanSummaryService] direct fulfillment trend query failed, falling back to Supabase REST', {
      projectId,
      months,
      error: error instanceof Error ? error.message : String(error),
    })
    return loadFulfillmentTrendViaRest(projectId, months)
  }
}

export async function getMonthlyPlanStatusSummary(projectId: string): Promise<MonthlyPlanStatusSummary> {
  try {
    const { rows } = await rawQuery(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_count,
          COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
          COALESCE(SUM(COALESCE(pending_closeout_count, 0)), 0)::int AS pending_closeout_count,
          COUNT(*) FILTER (
            WHERE source_mode = 'schedule'
              AND baseline_version_id IS NULL
          )::int AS temporary_without_baseline_count
        FROM public.monthly_plans
        WHERE project_id::text = $1
      `,
      [projectId],
    )
    const row = (rows[0] ?? {}) as Record<string, unknown>
    return {
      confirmedCount: normalizeCount(row.confirmed_count),
      closedCount: normalizeCount(row.closed_count),
      pendingCloseoutCount: normalizeCount(row.pending_closeout_count),
      temporaryWithoutBaselineCount: normalizeCount(row.temporary_without_baseline_count),
    }
  } catch (error) {
    logger.warn('[monthlyPlanSummaryService] direct status summary query failed, using zero fallback', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      confirmedCount: 0,
      closedCount: 0,
      pendingCloseoutCount: 0,
      temporaryWithoutBaselineCount: 0,
    }
  }
}

export async function getMonthlyPlanPendingCloseoutCounts(planIds: string[]) {
  if (planIds.length === 0) return new Map<string, number>()

  try {
    const result = await rawQuery(
      `SELECT monthly_plan_version_id, COUNT(*)::int AS pending_count
         FROM public.monthly_plan_items
        WHERE monthly_plan_version_id = ANY($1::uuid[])
          AND COALESCE(commitment_status, 'planned') = 'planned'
        GROUP BY monthly_plan_version_id`,
      [planIds],
    )
    return new Map(
      (result.rows as Array<{ monthly_plan_version_id: string; pending_count?: number | string | null }>)
        .map((row) => [String(row.monthly_plan_version_id), normalizeCount(row.pending_count)] as const),
    )
  } catch (error) {
    logger.warn('[monthlyPlanSummaryService] direct pending closeout count query failed, falling back to Supabase REST', {
      planCount: planIds.length,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const { data, error } = await supabase
    .from('monthly_plan_items')
    .select('monthly_plan_version_id,commitment_status')
    .in('monthly_plan_version_id', planIds)

  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ monthly_plan_version_id: string; commitment_status?: string | null }>) {
    if (String(row.commitment_status ?? 'planned') !== 'planned') continue
    counts.set(row.monthly_plan_version_id, (counts.get(row.monthly_plan_version_id) ?? 0) + 1)
  }

  return counts
}

export function countMonthlyPlanPendingCloseoutItems(items: Array<{ commitment_status?: string | null }>) {
  return items.filter((item) => String(item.commitment_status ?? 'planned') === 'planned').length
}
