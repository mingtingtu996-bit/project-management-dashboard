import { v4 as uuidv4 } from 'uuid'
import { executeSQL, executeSQLOne } from './dbService.js'
import type {
  AcceptanceCatalog,
  AcceptanceDependency,
  AcceptancePlan,
  AcceptanceRecord,
  AcceptanceRequirement,
  AcceptanceRequirementStatus,
} from '../types/db.js'
import {
  IN_PROGRESS_ACCEPTANCE_STATUSES,
  PASSED_ACCEPTANCE_STATUSES,
  normalizeAcceptanceStatus,
} from '../utils/acceptanceStatus.js'
import {
  ACCEPTANCE_CATALOG_COLUMNS,
  ACCEPTANCE_DEPENDENCY_COLUMNS,
  ACCEPTANCE_PLAN_COLUMNS,
  ACCEPTANCE_RECORD_COLUMNS,
  ACCEPTANCE_REQUIREMENT_COLUMNS,
} from './sqlColumns.js'
import { buildAcceptancePlanImpactSignals } from './executionImpactSignals.js'
import { signedDurationDayDelta } from '../utils/durationDays.js'

const ACCEPTANCE_CATALOG_SELECT = `SELECT ${ACCEPTANCE_CATALOG_COLUMNS} FROM acceptance_catalog`
const ACCEPTANCE_PLAN_SELECT = `SELECT ${ACCEPTANCE_PLAN_COLUMNS} FROM acceptance_plans`
const ACCEPTANCE_DEPENDENCY_SELECT = `SELECT ${ACCEPTANCE_DEPENDENCY_COLUMNS} FROM acceptance_dependencies`
const ACCEPTANCE_REQUIREMENT_SELECT = `SELECT ${ACCEPTANCE_REQUIREMENT_COLUMNS} FROM acceptance_requirements`
const ACCEPTANCE_RECORD_SELECT = `SELECT ${ACCEPTANCE_RECORD_COLUMNS} FROM acceptance_records`
const ACCEPTANCE_FLOW_SNAPSHOT_CACHE_TTL_MS = Number(process.env.ACCEPTANCE_FLOW_SNAPSHOT_CACHE_TTL_MS ?? 300_000)
const acceptanceFlowSnapshotCache = new Map<string, { expiresAt: number; value: AcceptanceFlowSnapshot }>()
const acceptanceFlowSnapshotInFlight = new Map<string, Promise<AcceptanceFlowSnapshot>>()

function now() {
  return new Date().toISOString()
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function toBoolean(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function makeAcceptanceFlowError(code: string, statusCode: number, message: string, details?: unknown) {
  const error = new Error(message) as Error & { code: string; statusCode: number; details?: unknown }
  error.code = code
  error.statusCode = statusCode
  if (details !== undefined) {
    error.details = details
  }
  return error
}

async function executeAcceptanceRequirementRows(projectId: string, scopedClause: string, params: unknown[]) {
  const normalizedProjectId = requireProjectId(projectId)
  const scopedParams = [normalizedProjectId, ...params]
  return executeSQL<AcceptanceRequirement>(
    `${ACCEPTANCE_REQUIREMENT_SELECT} WHERE project_id = ? ${scopedClause}`,
    scopedParams,
  )
}

async function executeAcceptanceRequirementRow(projectId: string, scopedClause: string, params: unknown[]) {
  const normalizedProjectId = requireProjectId(projectId)
  const scopedParams = [normalizedProjectId, ...params]
  return executeSQLOne<AcceptanceRequirement>(
    `${ACCEPTANCE_REQUIREMENT_SELECT} WHERE project_id = ? ${scopedClause}`,
    scopedParams,
  )
}

async function loadAcceptanceFlowSnapshotFresh(projectId: string): Promise<AcceptanceFlowSnapshot> {
  const [catalogs, plans, dependencies, requirements, records, taskLinks] = await Promise.all([
    executeSQL<AcceptanceCatalog>(`${ACCEPTANCE_CATALOG_SELECT} WHERE project_id = ? ORDER BY created_at ASC`, [projectId]),
    executeSQL<AcceptancePlan>(`${ACCEPTANCE_PLAN_SELECT} WHERE project_id = ? ORDER BY planned_date ASC, created_at ASC`, [projectId]),
    executeSQL<AcceptanceDependency>(`${ACCEPTANCE_DEPENDENCY_SELECT} WHERE project_id = ? ORDER BY created_at ASC`, [projectId]),
    executeAcceptanceRequirementRows(projectId, 'ORDER BY created_at ASC', []),
    executeSQL<AcceptanceRecord>(`${ACCEPTANCE_RECORD_SELECT} WHERE project_id = ? ORDER BY created_at ASC`, [projectId]),
    executeSQL<{ source_entity_id?: string | null; target_entity_id?: string | null }>(
      `SELECT source_entity_id, target_entity_id
         FROM project_entity_links
        WHERE project_id = ?
          AND source_entity_type = 'acceptance_plan'
          AND target_entity_type = 'task'
          AND relation_type = 'covers_task'
          AND status = 'active'
        ORDER BY created_at ASC, id ASC`,
      [projectId],
    ),
  ])

  const normalizedDependencies = (dependencies || []).map(normalizeAcceptanceDependencyRow)
  const normalizedRequirements = (requirements || []).map(normalizeAcceptanceRequirementRow)
  const coveredTaskIdsByPlan = new Map<string, string[]>()
  for (const link of taskLinks ?? []) {
    const planId = normalizeText(link.source_entity_id)
    const taskId = normalizeText(link.target_entity_id)
    if (!planId || !taskId) continue
    const taskIds = coveredTaskIdsByPlan.get(planId) ?? []
    if (!taskIds.includes(taskId)) taskIds.push(taskId)
    coveredTaskIdsByPlan.set(planId, taskIds)
  }
  const plansWithTaskLinks = (plans || []).map((plan) => ({
    ...plan,
    covered_task_ids: coveredTaskIdsByPlan.get(normalizeText(plan.id)) ?? [],
  }))
  const normalizedPlans = enrichAcceptancePlans(plansWithTaskLinks, normalizedDependencies, normalizedRequirements)

  return {
    catalogs: catalogs || [],
    plans: normalizedPlans,
    dependencies: normalizedDependencies,
    requirements: normalizedRequirements,
    records: records || [],
  }
}

export function clearAcceptanceFlowSnapshotCache(projectId?: string) {
  if (projectId) {
    acceptanceFlowSnapshotCache.delete(projectId)
    acceptanceFlowSnapshotInFlight.delete(projectId)
    return
  }

  acceptanceFlowSnapshotCache.clear()
  acceptanceFlowSnapshotInFlight.clear()
}

async function insertAcceptanceRequirement(projectId: string, payload: Record<string, unknown>) {
  const normalizedProjectId = requireProjectId(projectId)
  if (normalizeText(payload.project_id) !== normalizedProjectId) {
    throw makeAcceptanceFlowError('PROJECT_SCOPE_MISMATCH', 400, 'acceptance requirement project scope mismatch')
  }
  const insertRow = { ...payload, project_id: normalizedProjectId }
  await executeSQL(
    `INSERT INTO acceptance_requirements (${Object.keys(insertRow).join(', ')}) VALUES (${Object.keys(insertRow).map(() => '?').join(', ')})`,
    Object.values(insertRow),
  )
}

async function updateAcceptanceRequirementColumns(id: string, projectId: string, updateMap: Record<string, unknown>) {
  const fields = Object.keys(updateMap)
  if (fields.length === 0) return
  const values = fields.map((field) => updateMap[field])
  await executeSQL(
    `UPDATE acceptance_requirements SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND project_id = ?`,
    [...values, id, projectId],
  )
}

function requireProjectId(projectId: unknown) {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) {
    throw makeAcceptanceFlowError('MISSING_PROJECT_ID', 400, 'project_id 不能为空')
  }
  return normalizedProjectId
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return normalizeStringArray(parsed)
    } catch {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
    }
  }

  return []
}

function normalizeAcceptanceDependencyKind(value?: string | null) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'soft' || normalized === 'weak') return 'soft' as const
  return 'hard' as const
}

function normalizeAcceptanceRequirementStatus(value?: string | null): AcceptanceRequirementStatus {
  const normalized = normalizeText(value).toLowerCase()
  switch (normalized) {
    case 'met':
    case 'closed':
    case 'blocked':
    case 'open':
      return normalized
    case 'done':
    case 'satisfied':
    case 'complete':
    case 'completed':
      return 'met'
    case 'inactive':
    case 'disabled':
      return 'closed'
    default:
      return 'open'
  }
}

function calculateDaysToDue(plannedDate?: string | null) {
  const normalized = normalizeText(plannedDate)
  if (!normalized) return null

  return signedDurationDayDelta(toLocalDateKey(new Date()), normalized)
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
}

function normalizeAcceptanceRequirementShape(input: Partial<AcceptanceRequirement> & Record<string, unknown>) {
  const explicitRequired = input.is_required
  const explicitSatisfied = input.is_satisfied
  let status = normalizeAcceptanceRequirementStatus(input.status as string | null | undefined)
  let isRequired =
    explicitRequired === undefined || explicitRequired === null
      ? status !== 'closed'
      : toBoolean(explicitRequired)
  let isSatisfied =
    explicitSatisfied === undefined || explicitSatisfied === null
      ? status === 'met' || status === 'closed'
      : toBoolean(explicitSatisfied)

  if (!isRequired) {
    status = 'closed'
    isSatisfied = false
  } else if (status === 'closed') {
    status = isSatisfied ? 'met' : 'open'
  } else if (isSatisfied && status !== 'blocked') {
    status = 'met'
  } else if (!isSatisfied && status === 'met') {
    status = 'open'
  }

  return {
    status,
    is_required: isRequired,
    is_satisfied: isSatisfied,
  }
}

function isSatisfiedRequirementStatus(requirement: Pick<AcceptanceRequirement, 'status' | 'is_required' | 'is_satisfied'>) {
  const normalized = normalizeAcceptanceRequirementShape(requirement as Partial<AcceptanceRequirement> & Record<string, unknown>)
  return !normalized.is_required || normalized.is_satisfied
}

function normalizeAcceptanceDependencyRow(row: AcceptanceDependency): AcceptanceDependency {
  const dependencyKind = normalizeAcceptanceDependencyKind(row.dependency_kind ?? null)
  return {
    ...row,
    dependency_kind: dependencyKind,
  }
}

function normalizeAcceptanceRequirementRow(row: AcceptanceRequirement): AcceptanceRequirement {
  const normalized = normalizeAcceptanceRequirementShape(row as AcceptanceRequirement & Record<string, unknown>)
  return {
    ...row,
    status: normalized.status,
    is_required: normalized.is_required,
    is_satisfied: normalized.is_satisfied,
  }
}

function buildDerivedOverlayTags(input: {
  isBlocked: boolean
  upstreamUnfinishedCount: number
  requirementReadyPercent: number
  isOverdue: boolean
  daysToDue: number | null
  isCustom: boolean
}) {
  const tags: string[] = []
  if (input.isBlocked) tags.push('受阻')
  if (input.upstreamUnfinishedCount > 0) tags.push('前置未满足')
  if (input.requirementReadyPercent < 100) tags.push('资料缺失')
  if (input.isOverdue) {
    tags.push('逾期')
  } else if (typeof input.daysToDue === 'number' && input.daysToDue >= 0 && input.daysToDue <= 7) {
    tags.push('临期')
  }
  if (input.isCustom) tags.push('自定义')
  return tags
}

function enrichAcceptancePlans(
  plans: AcceptancePlan[],
  dependencies: AcceptanceDependency[],
  requirements: AcceptanceRequirement[],
) {
  const normalizedDependencies = dependencies.map(normalizeAcceptanceDependencyRow)
  const normalizedRequirements = requirements.map(normalizeAcceptanceRequirementRow)
  const planMap = new Map(plans.map((plan) => [normalizeText(plan.id), plan]))
  const dependenciesByTarget = new Map<string, AcceptanceDependency[]>()
  const dependenciesBySource = new Map<string, AcceptanceDependency[]>()
  const requirementsByPlan = new Map<string, AcceptanceRequirement[]>()

  for (const dependency of normalizedDependencies) {
    const sourcePlanId = normalizeText(dependency.source_plan_id)
    const targetPlanId = normalizeText(dependency.target_plan_id)
    if (!dependenciesByTarget.has(targetPlanId)) {
      dependenciesByTarget.set(targetPlanId, [])
    }
    dependenciesByTarget.get(targetPlanId)!.push(dependency)

    if (!dependenciesBySource.has(sourcePlanId)) {
      dependenciesBySource.set(sourcePlanId, [])
    }
    dependenciesBySource.get(sourcePlanId)!.push(dependency)
  }

  for (const requirement of normalizedRequirements) {
    const planId = normalizeText(requirement.plan_id)
    if (!requirementsByPlan.has(planId)) {
      requirementsByPlan.set(planId, [])
    }
    requirementsByPlan.get(planId)!.push(requirement)
  }

  return plans.map((plan) => {
    const planId = normalizeText(plan.id)
    const predecessorPlanIds = uniqueStrings([
      ...normalizeStringArray(plan.predecessor_plan_ids),
      ...(dependenciesByTarget.get(planId) || []).map((item) => item.source_plan_id),
    ])
    const successorPlanIds = uniqueStrings([
      ...normalizeStringArray(plan.successor_plan_ids),
      ...(dependenciesBySource.get(planId) || []).map((item) => item.target_plan_id),
    ])

    const planRequirements = requirementsByPlan.get(planId) || []
    const satisfiedRequirementCount = planRequirements.filter((item) => isSatisfiedRequirementStatus(item)).length
    const blockedRequirementCount = planRequirements.filter((item) => normalizeAcceptanceRequirementStatus(item.status) === 'blocked').length
    const requirementReadyPercent = planRequirements.length === 0
      ? 100
      : Math.round((satisfiedRequirementCount / planRequirements.length) * 100)

    const upstreamUnfinishedCount = predecessorPlanIds.filter((dependencyId) => {
      const dependencyPlan = planMap.get(normalizeText(dependencyId))
      return !dependencyPlan || !PASSED_ACCEPTANCE_STATUSES.includes(normalizeAcceptanceStatus(dependencyPlan.status))
    }).length

    const normalizedStatus = normalizeAcceptanceStatus(plan.status)
    const daysToDue = calculateDaysToDue(plan.planned_date)
    const isFinished = PASSED_ACCEPTANCE_STATUSES.includes(normalizedStatus)
    const isOverdue = !isFinished && typeof daysToDue === 'number' && daysToDue < 0
    const isBlocked = upstreamUnfinishedCount > 0 || blockedRequirementCount > 0
    const isCustom = Boolean(plan.is_custom) || Boolean(plan.type_id && normalizeText(plan.type_id).startsWith('custom_'))
    const existingBadges = [
      ...normalizeStringArray(plan.display_badges),
      ...normalizeStringArray(plan.overlay_tags),
    ]
    const overlayTags = uniqueStrings([
      ...existingBadges,
      ...buildDerivedOverlayTags({
        isBlocked,
        upstreamUnfinishedCount,
        requirementReadyPercent,
        isOverdue,
        daysToDue,
        isCustom,
      }),
    ])
    const gateHint = normalizeText((plan as unknown as Record<string, unknown>).gate_type ?? (plan as unknown as Record<string, unknown>).gate_hint)
      || normalizeText(plan.phase_code ?? plan.phase)

    return {
      ...plan,
      status: normalizedStatus,
      phase_code: normalizeText(plan.phase_code ?? plan.phase) || null,
      phase: normalizeText(plan.phase ?? plan.phase_code) || null,
      parallel_group_id: normalizeText(plan.parallel_group_id) || null,
      predecessor_plan_ids: predecessorPlanIds,
      successor_plan_ids: successorPlanIds,
      can_submit: upstreamUnfinishedCount === 0 && requirementReadyPercent >= 100,
      is_overdue: isOverdue,
      days_to_due: daysToDue,
      requirement_ready_percent: requirementReadyPercent,
      upstream_unfinished_count: upstreamUnfinishedCount,
      downstream_block_count: successorPlanIds.length,
      display_badges: overlayTags,
      overlay_tags: overlayTags,
      is_blocked: isBlocked,
      block_reason_summary: isBlocked
        ? uniqueStrings([
            upstreamUnfinishedCount > 0 ? `仍有 ${upstreamUnfinishedCount} 项前置未完成` : null,
            blockedRequirementCount > 0 ? `仍有 ${blockedRequirementCount} 项前置条件阻塞` : null,
          ]).join('；') || null
        : null,
      warning_level: isOverdue ? 'critical' : overlayTags.includes('临期') || isBlocked ? 'warning' : 'info',
      impact_signals: buildAcceptancePlanImpactSignals({
        planId,
        status: normalizedStatus,
        plannedDate: plan.planned_date,
        upstreamUnfinishedCount,
        blockedRequirementCount,
        requirementReadyPercent,
        isOverdue,
        gateHint,
      }),
      is_custom: isCustom,
    }
  })
}

export interface AcceptanceFlowFilters {
  task_id?: string | null
  building_id?: string | null
  scope_level?: string | null
  participant_unit_id?: string | null
  catalog_id?: string | null
  phase_code?: string | null
  statuses?: string[]
  overlay_tag?: string | null
  blocked_only?: boolean
}

export function filterAcceptanceFlowSnapshot(snapshot: AcceptanceFlowSnapshot, filters: AcceptanceFlowFilters = {}): AcceptanceFlowSnapshot {
  const normalizedStatuses = new Set((filters.statuses || []).map((status) => normalizeAcceptanceStatus(status)))
  const normalizedBuildingId = normalizeText(filters.building_id)
  const normalizedScopeLevel = normalizeText(filters.scope_level).toLowerCase()
  const normalizedParticipantUnitId = normalizeText(filters.participant_unit_id)
  const normalizedCatalogId = normalizeText(filters.catalog_id)
  const normalizedTaskId = normalizeText(filters.task_id)
  const normalizedPhaseCode = normalizeText(filters.phase_code)
  const normalizedOverlayTag = normalizeText(filters.overlay_tag)

  const visiblePlans = snapshot.plans.filter((plan) => {
    if (normalizedTaskId && !(plan.covered_task_ids ?? []).includes(normalizedTaskId)) return false
    if (normalizedBuildingId && normalizeText(plan.building_id) !== normalizedBuildingId) return false
    if (normalizedScopeLevel && normalizeText(plan.scope_level).toLowerCase() !== normalizedScopeLevel) return false
    if (normalizedParticipantUnitId && normalizeText(plan.participant_unit_id) !== normalizedParticipantUnitId) return false
    if (normalizedCatalogId && normalizeText(plan.catalog_id) !== normalizedCatalogId) return false
    if (normalizedPhaseCode && normalizeText(plan.phase_code ?? plan.phase) !== normalizedPhaseCode) return false
    if (normalizedStatuses.size > 0 && !normalizedStatuses.has(normalizeAcceptanceStatus(plan.status))) return false
    if (filters.blocked_only && !plan.is_blocked) return false
    if (normalizedOverlayTag && !normalizeStringArray(plan.overlay_tags).includes(normalizedOverlayTag)) return false
    return true
  })

  const visiblePlanIds = new Set(visiblePlans.map((plan) => normalizeText(plan.id)))
  return {
    ...snapshot,
    plans: visiblePlans,
    dependencies: snapshot.dependencies.filter((dependency) => (
      visiblePlanIds.has(normalizeText(dependency.source_plan_id))
      && visiblePlanIds.has(normalizeText(dependency.target_plan_id))
    )),
    requirements: snapshot.requirements.filter((requirement) => visiblePlanIds.has(normalizeText(requirement.plan_id))),
    records: snapshot.records.filter((record) => visiblePlanIds.has(normalizeText(record.plan_id))),
  }
}

function isCatalogForeignKeyViolation(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String((error as { message?: unknown })?.message ?? '')

  return (
    message.includes('foreign key') ||
    message.includes('23503') ||
    message.includes('fk_acceptance_plans_catalog_id') ||
    message.includes('acceptance_plans_catalog_id')
  )
}

async function loadAcceptanceDependencyGraph(projectId: string) {
  const normalizedProjectId = requireProjectId(projectId)
  const dependencies = await executeSQL<Pick<AcceptanceDependency, 'source_plan_id' | 'target_plan_id'>>(
    'SELECT source_plan_id, target_plan_id FROM acceptance_dependencies WHERE project_id = ?',
    [normalizedProjectId]
  )

  const adjacency = new Map<string, Set<string>>()
  const addEdge = (source: unknown, target: unknown) => {
    const normalizedSource = normalizeText(source)
    const normalizedTarget = normalizeText(target)
    if (!normalizedSource || !normalizedTarget) return
    if (!adjacency.has(normalizedSource)) {
      adjacency.set(normalizedSource, new Set<string>())
    }
    adjacency.get(normalizedSource)!.add(normalizedTarget)
  }

  for (const dependency of dependencies || []) {
    addEdge(dependency.source_plan_id, dependency.target_plan_id)
  }

  return adjacency
}

async function wouldCreateAcceptanceDependencyCycle(projectId: string, sourcePlanId: string, targetPlanId: string) {
  const normalizedSourcePlanId = normalizeText(sourcePlanId)
  const normalizedTargetPlanId = normalizeText(targetPlanId)
  if (!normalizedSourcePlanId || !normalizedTargetPlanId) return false
  if (normalizedSourcePlanId === normalizedTargetPlanId) return true

  const adjacency = await loadAcceptanceDependencyGraph(projectId)
  const visited = new Set<string>()
  const stack = [normalizedTargetPlanId]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === normalizedSourcePlanId) return true
    if (visited.has(current)) continue
    visited.add(current)

    const next = adjacency.get(current)
    if (!next) continue
    for (const child of next) {
      if (!visited.has(child)) stack.push(child)
    }
  }

  return false
}

export interface AcceptanceFlowSnapshot {
  catalogs: AcceptanceCatalog[]
  plans: AcceptancePlan[]
  dependencies: AcceptanceDependency[]
  requirements: AcceptanceRequirement[]
  records: AcceptanceRecord[]
}

export interface AcceptanceProjectSummary {
  totalCount: number
  passedCount: number
  inProgressCount: number
  notStartedCount: number
  blockedCount: number
  dueSoon30dCount: number
  keyMilestoneCount: number
  completionRate: number
}

export function buildAcceptanceProjectSummary(plans: AcceptancePlan[]): AcceptanceProjectSummary {
  const totalCount = plans.length
  const normalizedStatuses = plans.map((plan) => normalizeAcceptanceStatus(plan.status))
  const passedCount = normalizedStatuses.filter((status) => PASSED_ACCEPTANCE_STATUSES.includes(status)).length
  const inProgressCount = normalizedStatuses.filter((status) => IN_PROGRESS_ACCEPTANCE_STATUSES.includes(status)).length
  const notStartedCount = normalizedStatuses.filter((status) => status === 'draft').length
  const blockedCount = plans.filter((plan) => Boolean((plan as unknown as Record<string, unknown>).is_blocked)).length
  const dueSoon30dCount = plans.filter((plan) => {
    const status = normalizeAcceptanceStatus(plan.status)
    if (PASSED_ACCEPTANCE_STATUSES.includes(status)) return false
    const daysToDue = Number((plan as unknown as Record<string, unknown>).days_to_due)
    return Number.isFinite(daysToDue) && daysToDue >= 0 && daysToDue <= 30
  }).length
  const keyMilestoneCount = plans.filter((plan) => {
    const row = plan as unknown as Record<string, unknown>
    return Boolean((plan.covered_task_ids?.length ?? 0) > 0 || row.is_hard_prerequisite || row.is_system)
  }).length

  return {
    totalCount,
    passedCount,
    inProgressCount,
    notStartedCount,
    blockedCount,
    dueSoon30dCount,
    keyMilestoneCount,
    completionRate: totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0,
  }
}

export async function getAcceptanceFlowSnapshot(projectId: string): Promise<AcceptanceFlowSnapshot> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) {
    return { catalogs: [], plans: [], dependencies: [], requirements: [], records: [] }
  }

  const cached = acceptanceFlowSnapshotCache.get(normalizedProjectId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const pending = acceptanceFlowSnapshotInFlight.get(normalizedProjectId)
  if (pending) return pending

  const promise = loadAcceptanceFlowSnapshotFresh(normalizedProjectId)
    .then((snapshot) => {
      acceptanceFlowSnapshotCache.set(normalizedProjectId, {
        expiresAt: Date.now() + ACCEPTANCE_FLOW_SNAPSHOT_CACHE_TTL_MS,
        value: snapshot,
      })
      return snapshot
    })
    .finally(() => {
      acceptanceFlowSnapshotInFlight.delete(normalizedProjectId)
    })

  acceptanceFlowSnapshotInFlight.set(normalizedProjectId, promise)
  return promise
}

export async function listAcceptanceCatalog(projectId: string) {
  return executeSQL<AcceptanceCatalog>(`${ACCEPTANCE_CATALOG_SELECT} WHERE project_id = ? ORDER BY created_at ASC`, [normalizeText(projectId)])
}

export async function createAcceptanceCatalog(input: Partial<AcceptanceCatalog> & { project_id: string }) {
  const id = input.id || uuidv4()
  const projectId = requireProjectId(input.project_id)
  const payload: Record<string, unknown> = {
    id,
    project_id: projectId,
    catalog_code: input.catalog_code || `CAT-${id.slice(0, 8)}`,
    catalog_name: input.catalog_name,
    phase_code: input.phase_code || null,
    scope_level: input.scope_level || null,
    planned_finish_date: input.planned_finish_date || null,
    description: input.description || null,
    is_system: input.is_system ?? false,
    created_at: now(),
    updated_at: now(),
  }

  await executeSQL(
    `INSERT INTO acceptance_catalog (${Object.keys(payload).join(', ')}) VALUES (${Object.keys(payload).map(() => '?').join(', ')})`,
    Object.values(payload)
  )
  clearAcceptanceFlowSnapshotCache(projectId)
  return executeSQLOne<AcceptanceCatalog>(
    `${ACCEPTANCE_CATALOG_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, projectId],
  )
}

export async function updateAcceptanceCatalog(id: string, projectId: string, updates: Partial<AcceptanceCatalog>) {
  const normalizedProjectId = requireProjectId(projectId)
  const current = await executeSQLOne<AcceptanceCatalog>(
    `${ACCEPTANCE_CATALOG_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, normalizedProjectId],
  )
  if (!current) return null
  const hasChanges = [
    updates.catalog_code,
    updates.catalog_name,
    updates.phase_code,
    updates.scope_level,
    updates.planned_finish_date,
    updates.description,
    updates.is_system,
  ].some((value) => value !== undefined)
  if (!hasChanges) return current

  await executeSQL(
    `UPDATE acceptance_catalog
        SET catalog_code = ?,
            catalog_name = ?,
            phase_code = ?,
            scope_level = ?,
            planned_finish_date = ?,
            description = ?,
            is_system = ?,
            updated_at = ?
      WHERE id = ? AND project_id = ?`,
    [
      updates.catalog_code === undefined ? current.catalog_code ?? null : updates.catalog_code,
      updates.catalog_name === undefined ? current.catalog_name : updates.catalog_name,
      updates.phase_code === undefined ? current.phase_code ?? null : updates.phase_code,
      updates.scope_level === undefined ? current.scope_level ?? null : updates.scope_level,
      updates.planned_finish_date === undefined ? current.planned_finish_date ?? null : updates.planned_finish_date,
      updates.description === undefined ? current.description ?? null : updates.description,
      updates.is_system === undefined ? current.is_system ?? false : updates.is_system,
      now(),
      id,
      normalizedProjectId,
    ],
  )
  clearAcceptanceFlowSnapshotCache(normalizedProjectId)
  return executeSQLOne<AcceptanceCatalog>(`${ACCEPTANCE_CATALOG_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [id, normalizedProjectId])
}

export async function deleteAcceptanceCatalog(id: string, projectId: string) {
  const normalizedId = normalizeText(id)
  const normalizedProjectId = requireProjectId(projectId)
  const existing = await executeSQLOne<AcceptanceCatalog>(
    `${ACCEPTANCE_CATALOG_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [normalizedId, normalizedProjectId],
  )
  if (!existing) return
  const referencedPlan = await executeSQLOne<Pick<AcceptancePlan, 'id'>>(
    'SELECT id FROM acceptance_plans WHERE catalog_id = ? AND project_id = ? LIMIT 1',
    [normalizedId, normalizedProjectId]
  )

  if (referencedPlan) {
    throw makeAcceptanceFlowError(
      'CATALOG_IN_USE',
      422,
      '当前目录仍被验收计划引用，不能删除'
    )
  }

  try {
    await executeSQL('DELETE FROM acceptance_catalog WHERE id = ? AND project_id = ?', [normalizedId, normalizedProjectId])
    clearAcceptanceFlowSnapshotCache(normalizedProjectId)
  } catch (error) {
    if (isCatalogForeignKeyViolation(error)) {
      throw makeAcceptanceFlowError(
        'CATALOG_IN_USE',
        422,
        '当前目录仍被验收计划引用，不能删除'
      )
    }
    throw error
  }
}

export async function listAcceptanceDependencies(projectId: string, planId: string) {
  const normalizedProjectId = requireProjectId(projectId)
  const normalizedPlanId = normalizeText(planId)
  const [sourceDependencies, targetDependencies] = await Promise.all([
    executeSQL<AcceptanceDependency>(
      `${ACCEPTANCE_DEPENDENCY_SELECT} WHERE project_id = ? AND source_plan_id = ? ORDER BY created_at ASC`,
      [normalizedProjectId, normalizedPlanId],
    ),
    executeSQL<AcceptanceDependency>(
      `${ACCEPTANCE_DEPENDENCY_SELECT} WHERE project_id = ? AND target_plan_id = ? ORDER BY created_at ASC`,
      [normalizedProjectId, normalizedPlanId],
    ),
  ])

  const merged = [...sourceDependencies, ...targetDependencies]
  const deduped = merged.filter((row, index) => merged.findIndex((item) => item.id === row.id) === index)
  return deduped
    .map(normalizeAcceptanceDependencyRow)
    .sort((left, right) => normalizeText(left.created_at).localeCompare(normalizeText(right.created_at)))
}

export async function createAcceptanceDependency(input: Partial<AcceptanceDependency> & { source_plan_id: string; target_plan_id: string }) {
  const id = input.id || uuidv4()
  const sourcePlanId = normalizeText(input.source_plan_id)
  const targetPlanId = normalizeText(input.target_plan_id)
  const projectId = requireProjectId(input.project_id)
  const existing = await executeSQLOne<AcceptanceDependency>(
    `${ACCEPTANCE_DEPENDENCY_SELECT} WHERE project_id = ? AND source_plan_id = ? AND target_plan_id = ? LIMIT 1`,
    [projectId, sourcePlanId, targetPlanId]
  )

  if (existing) {
    clearAcceptanceFlowSnapshotCache(projectId)
    return normalizeAcceptanceDependencyRow(existing)
  }

  if (await wouldCreateAcceptanceDependencyCycle(projectId, sourcePlanId, targetPlanId)) {
    throw makeAcceptanceFlowError(
      'DEPENDENCY_CYCLE_DETECTED',
      422,
      '验收依赖不能形成循环'
    )
  }

  const dependencyKind = normalizeAcceptanceDependencyKind(input.dependency_kind ?? null)
  const payload = {
    id,
    project_id: projectId,
    source_plan_id: sourcePlanId,
    target_plan_id: targetPlanId,
    dependency_kind: dependencyKind,
    status: input.status || 'active',
    created_at: now(),
    updated_at: now(),
  }

  await executeSQL(
    `INSERT INTO acceptance_dependencies (${Object.keys(payload).join(', ')}) VALUES (${Object.keys(payload).map(() => '?').join(', ')})`,
    Object.values(payload)
  )
  clearAcceptanceFlowSnapshotCache(projectId)
  const created = await executeSQLOne<AcceptanceDependency>(
    `${ACCEPTANCE_DEPENDENCY_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, projectId],
  )
  return created ? normalizeAcceptanceDependencyRow(created) : null
}

export async function deleteAcceptanceDependency(projectId: string, id: string) {
  const normalizedProjectId = requireProjectId(projectId)
  const existing = await executeSQLOne<AcceptanceDependency>(
    `${ACCEPTANCE_DEPENDENCY_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, normalizedProjectId],
  )
  if (!existing) return
  await executeSQL('DELETE FROM acceptance_dependencies WHERE id = ? AND project_id = ?', [id, normalizedProjectId])
  clearAcceptanceFlowSnapshotCache(normalizedProjectId)
}

export async function listAcceptanceRequirements(projectId: string, planId: string) {
  const rows = await executeAcceptanceRequirementRows(projectId, 'AND plan_id = ? ORDER BY created_at ASC', [planId])
  return (rows || []).map(normalizeAcceptanceRequirementRow)
}

export async function createAcceptanceRequirement(input: Partial<AcceptanceRequirement> & { plan_id: string; requirement_type: string; source_entity_type: string; source_entity_id: string }) {
  const id = input.id || uuidv4()
  const projectId = requireProjectId(input.project_id)
  const normalized = normalizeAcceptanceRequirementShape(input as Partial<AcceptanceRequirement> & Record<string, unknown>)
  const payload = {
    id,
    project_id: projectId,
    plan_id: input.plan_id,
    requirement_type: input.requirement_type,
    source_entity_type: input.source_entity_type,
    source_entity_id: input.source_entity_id,
    drawing_package_id: input.drawing_package_id ?? null,
    description: input.description || null,
    status: normalized.status,
    is_required: normalized.is_required,
    is_satisfied: normalized.is_satisfied,
    created_at: now(),
    updated_at: now(),
  }

  await insertAcceptanceRequirement(projectId, payload)
  clearAcceptanceFlowSnapshotCache(projectId)
  const created = await executeAcceptanceRequirementRow(projectId, 'AND id = ? LIMIT 1', [id])
  return created ? normalizeAcceptanceRequirementRow(created) : null
}

export async function updateAcceptanceRequirement(projectId: string, id: string, updates: Partial<AcceptanceRequirement>) {
  const normalizedProjectId = requireProjectId(projectId)
  const current = await executeAcceptanceRequirementRow(normalizedProjectId, 'AND id = ? LIMIT 1', [id])
  if (!current) return null

  const nextShape = normalizeAcceptanceRequirementShape({
    ...(current as AcceptanceRequirement & Record<string, unknown>),
    ...(updates as AcceptanceRequirement & Record<string, unknown>),
  })

  const updateMap: Record<string, unknown> = {}
  const assign = (key: keyof AcceptanceRequirement, value: unknown) => {
    if (value === undefined) return
    updateMap[String(key)] = value
  }

  assign('requirement_type', updates.requirement_type)
  assign('source_entity_type', updates.source_entity_type)
  assign('source_entity_id', updates.source_entity_id)
  assign('drawing_package_id', updates.drawing_package_id)
  assign('description', updates.description)
  if (updates.status !== undefined || updates.is_required !== undefined || updates.is_satisfied !== undefined) {
    assign('status', nextShape.status)
    assign('is_required', nextShape.is_required)
    assign('is_satisfied', nextShape.is_satisfied)
  }
  assign('updated_at', now())

  if (Object.keys(updateMap).length === 0) return normalizeAcceptanceRequirementRow(current)

  await updateAcceptanceRequirementColumns(id, normalizedProjectId, updateMap)
  clearAcceptanceFlowSnapshotCache(normalizedProjectId)
  const updated = await executeAcceptanceRequirementRow(normalizedProjectId, 'AND id = ? LIMIT 1', [id])
  return updated ? normalizeAcceptanceRequirementRow(updated) : null
}

export async function syncAcceptanceRequirementsBySource(params: {
  projectId: string
  sourceEntityTypes: string[]
  sourceEntityId: string
  isSatisfied: boolean
}) {
  const projectId = requireProjectId(params.projectId)
  const sourceEntityId = normalizeText(params.sourceEntityId)
  const sourceEntityTypes = uniqueStrings(params.sourceEntityTypes)

  if (!sourceEntityId || sourceEntityTypes.length === 0) {
    return []
  }

  const requirements = await executeAcceptanceRequirementRows(projectId, 'ORDER BY created_at ASC', [])
  const matches = (requirements || [])
    .map(normalizeAcceptanceRequirementRow)
    .filter((requirement) =>
      sourceEntityTypes.includes(normalizeText(requirement.source_entity_type)) &&
      normalizeText(requirement.source_entity_id) === sourceEntityId,
    )

  const updatedRows: AcceptanceRequirement[] = []
  for (const requirement of matches) {
    if (!requirement.is_required) {
      updatedRows.push(requirement)
      continue
    }

    const nextStatus: AcceptanceRequirementStatus = params.isSatisfied ? 'met' : 'open'
    if (requirement.is_satisfied === params.isSatisfied && requirement.status === nextStatus) {
      updatedRows.push(requirement)
      continue
    }

    const updated = await updateAcceptanceRequirement(projectId, requirement.id, {
      status: nextStatus,
      is_satisfied: params.isSatisfied,
    })
    updatedRows.push(updated ?? requirement)
  }

  return updatedRows
}

export async function deleteAcceptanceRequirement(projectId: string, id: string) {
  const normalizedProjectId = requireProjectId(projectId)
  const normalizedId = normalizeText(id)
  const existing = await executeAcceptanceRequirementRow(normalizedProjectId, 'AND id = ? LIMIT 1', [normalizedId])
  if (!existing) return null

  await executeSQL('DELETE FROM acceptance_requirements WHERE id = ? AND project_id = ?', [normalizedId, normalizedProjectId])
  clearAcceptanceFlowSnapshotCache(normalizedProjectId)
  return normalizeAcceptanceRequirementRow(existing)
}

export async function listAcceptanceRecords(projectId: string, planId: string) {
  const normalizedProjectId = requireProjectId(projectId)
  return executeSQL<AcceptanceRecord>(
    `${ACCEPTANCE_RECORD_SELECT} WHERE project_id = ? AND plan_id = ? ORDER BY created_at ASC`,
    [normalizedProjectId, planId],
  )
}

export async function createAcceptanceRecord(input: Partial<AcceptanceRecord> & { plan_id: string; record_type: string; content: string }) {
  const id = input.id || uuidv4()
  const projectId = requireProjectId(input.project_id)
  const payload = {
    id,
    project_id: projectId,
    plan_id: input.plan_id,
    record_type: input.record_type,
    content: input.content,
    operator: input.operator || null,
    record_date: input.record_date || null,
    attachments: input.attachments ?? null,
    created_at: now(),
    updated_at: now(),
  }

  await executeSQL(
    `INSERT INTO acceptance_records (${Object.keys(payload).join(', ')}) VALUES (${Object.keys(payload).map(() => '?').join(', ')})`,
    Object.values(payload)
  )
  clearAcceptanceFlowSnapshotCache(projectId)
  return executeSQLOne<AcceptanceRecord>(
    `${ACCEPTANCE_RECORD_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [id, projectId],
  )
}

export async function updateAcceptanceRecord(projectId: string, id: string, updates: Partial<AcceptanceRecord>) {
  const normalizedProjectId = requireProjectId(projectId)
  const existing = await executeSQLOne<AcceptanceRecord>(
    `${ACCEPTANCE_RECORD_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [normalizeText(id), normalizedProjectId],
  )
  if (!existing) return null

  if (updates.project_id !== undefined && requireProjectId(updates.project_id) !== normalizedProjectId) {
    throw makeAcceptanceFlowError('PROJECT_ID_IMMUTABLE', 400, 'acceptance record project_id is immutable')
  }

  const nextPlanId = updates.plan_id === undefined ? existing.plan_id : normalizeText(updates.plan_id)
  const nextProjectId = updates.project_id === undefined
    ? (updates.plan_id === undefined ? existing.project_id : null)
    : requireProjectId(updates.project_id)

  if (updates.plan_id !== undefined && !nextProjectId) {
    throw makeAcceptanceFlowError('MISSING_PROJECT_ID', 400, '变更 plan_id 时必须同时提供 project_id')
  }

  const hasChanges = [
    updates.project_id,
    updates.plan_id,
    updates.record_type,
    updates.content,
    updates.operator,
    updates.record_date,
    updates.attachments,
  ].some((value) => value !== undefined)
  if (!hasChanges) return existing

  const existingProjectId = requireProjectId(existing.project_id)

  await executeSQL(
    `UPDATE acceptance_records
        SET project_id = ?,
            plan_id = ?,
            record_type = ?,
            content = ?,
            operator = ?,
            record_date = ?,
            attachments = ?,
            updated_at = ?
      WHERE id = ? AND project_id = ?`,
    [
      nextProjectId,
      nextPlanId,
      updates.record_type === undefined ? existing.record_type : updates.record_type,
      updates.content === undefined ? existing.content : updates.content,
      updates.operator === undefined ? existing.operator ?? null : updates.operator,
      updates.record_date === undefined ? existing.record_date ?? null : updates.record_date,
      updates.attachments === undefined ? existing.attachments ?? null : updates.attachments,
      now(),
      normalizeText(id),
      existingProjectId,
    ],
  )
  clearAcceptanceFlowSnapshotCache(existingProjectId)
  if (nextProjectId && nextProjectId !== existingProjectId) {
    clearAcceptanceFlowSnapshotCache(nextProjectId)
  }
  return executeSQLOne<AcceptanceRecord>(`${ACCEPTANCE_RECORD_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`, [normalizeText(id), existingProjectId])
}

export async function deleteAcceptanceRecord(projectId: string, id: string) {
  const normalizedProjectId = requireProjectId(projectId)
  const normalizedId = normalizeText(id)
  const existing = await executeSQLOne<AcceptanceRecord>(
    `${ACCEPTANCE_RECORD_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`,
    [normalizedId, normalizedProjectId],
  )
  if (!existing) return null

  await executeSQL('DELETE FROM acceptance_records WHERE id = ? AND project_id = ?', [normalizedId, normalizedProjectId])
  clearAcceptanceFlowSnapshotCache(normalizedProjectId)
  return existing
}
