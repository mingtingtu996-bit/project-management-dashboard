import { authFetch } from '../lib/apiClient'
import { safeJsonParse } from '@/lib/browserStorage'
import type {
  AcceptanceDependencyKind,
  AcceptanceDocument,
  AcceptanceLinkedIssue,
  AcceptanceLinkedRisk,
  AcceptanceLinkedWarning,
  AcceptanceOverlayTag,
  AcceptancePlan,
  AcceptanceRequirementStatus,
  AcceptancePlanDependencyRecord,
  AcceptancePlanRelationBundle,
  AcceptanceProjectSummary,
  AcceptanceRecordEntry,
  AcceptanceRequirementRecord,
  AcceptanceStatus,
  AcceptanceType,
} from '@/types/acceptance'
import {
  normalizeAcceptanceDependencyKind,
  normalizeAcceptanceStatus,
} from '@/types/acceptance'

const API_BASE = '/api'

type UnknownRecord = Record<string, unknown>

type AcceptancePlanRow = {
  id: string
  project_id: string
  task_id?: string | null
  milestone_id?: string | null
  catalog_id?: string | null
  type_id?: string | null
  type_name?: string | null
  type_color?: string | null
  acceptance_type?: string | null
  plan_name?: string | null
  acceptance_name?: string | null
  name?: string | null
  description?: string | null
  planned_date?: string | null
  actual_date?: string | null
  building_id?: string | null
  scope_level?: string | null
  participant_unit_id?: string | null
  status?: string | null
  phase?: string | null
  phase_code?: string | null
  phase_order?: number | null
  sort_order?: number | null
  parallel_group_id?: string | null
  predecessor_plan_ids?: string[] | string | null
  successor_plan_ids?: string[] | string | null
  requirement_ready_percent?: number | null
  upstream_unfinished_count?: number | null
  downstream_block_count?: number | null
  can_submit?: boolean | null
  is_overdue?: boolean | null
  days_to_due?: number | null
  display_badges?: string[] | string | null
  overlay_tags?: string[] | string | null
  is_blocked?: boolean | null
  block_reason_summary?: string | null
  warning_level?: string | null
  is_custom?: boolean | null
  documents?: unknown[] | string | null
  is_system?: boolean | null
  created_at?: string
  updated_at?: string
  created_by?: string | null
  responsible_user_id?: string | null
}

type AcceptancePlanFilters = {
  taskId?: string | null
  buildingId?: string | null
  scopeLevel?: string | null
  participantUnitId?: string | null
  catalogId?: string | null
  phaseCode?: string | null
  status?: AcceptanceStatus | AcceptanceStatus[] | null
  overlayTag?: string | null
  blockedOnly?: boolean
}

type AcceptanceFlowSnapshotRow = {
  catalogs: UnknownRecord[]
  plans: AcceptancePlanRow[]
  dependencies: UnknownRecord[]
  requirements: UnknownRecord[]
  records: UnknownRecord[]
}

type AcceptanceProjectSummaryRow = Partial<AcceptanceProjectSummary>

type AcceptanceCatalogRow = {
  id: string
  project_id: string
  catalog_code?: string | null
  catalog_name?: string | null
  phase_code?: string | null
  scope_level?: string | null
  category?: string | null
  planned_finish_date?: string | null
  description?: string | null
  is_system?: boolean | null
  created_at?: string
  updated_at?: string
}

type AcceptanceRequirementMutation = {
  requirement_type: string
  source_entity_type: string
  source_entity_id: string
  drawing_package_id?: string | null
  description?: string | null
  status?: string | null
  is_required?: boolean
  is_satisfied?: boolean
}

type AcceptanceRecordMutation = {
  record_type: string
  content: string
  operator?: string | null
  record_date?: string | null
  attachments?: unknown[] | null
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    return safeJsonParse(trimmed, fallback, 'acceptance api payload')
  }
  return value as T
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJson<unknown[]>(value, [])
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

function parseDocuments(value: unknown) {
  const parsed = parseJson<unknown[]>(value, [])
  if (!Array.isArray(parsed)) return []

  return parsed.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    if (!name || !url) return []

    const uploadedAt =
      typeof row.uploaded_at === 'string' && row.uploaded_at.trim()
        ? row.uploaded_at
        : new Date(0).toISOString()

    return [{
      id:
        typeof row.id === 'string' && row.id.trim()
          ? row.id
          : `document-${index}`,
      name,
      url,
      file_type: typeof row.file_type === 'string' ? row.file_type : undefined,
      uploaded_at: uploadedAt,
      uploaded_by: typeof row.uploaded_by === 'string' ? row.uploaded_by : undefined,
    } satisfies AcceptanceDocument]
  })
}

function parseNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function parseBooleanLike(value: unknown, fallback = false) {
  if (value === true || value === 1 || value === '1') return true
  if (value === false || value === 0 || value === '0') return false
  return fallback
}

function normalizeOverlayBadges(input: string[]): AcceptanceOverlayTag[] {
  return [...new Set(input.filter(Boolean))]
}

function deriveDaysToDue(plannedDate?: string | null) {
  if (!plannedDate) return null
  const planned = new Date(`${plannedDate}T00:00:00Z`)
  if (Number.isNaN(planned.getTime())) return null
  const today = new Date()
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Math.floor((planned.getTime() - current) / (24 * 60 * 60 * 1000))
}

function buildDerivedOverlayBadges(input: {
  isOverdue: boolean
  daysToDue: number | null
  isBlocked: boolean
  upstreamUnfinishedCount: number
  requirementReadyPercent: number
  isCustom: boolean
}) {
  const badges: AcceptanceOverlayTag[] = []

  if (input.isBlocked) badges.push('受阻')
  if (input.upstreamUnfinishedCount > 0) badges.push('前置未满足')
  if (input.requirementReadyPercent < 100) badges.push('资料缺失')
  if (input.isOverdue) {
    badges.push('逾期')
  } else if (input.daysToDue != null && input.daysToDue >= 0 && input.daysToDue <= 7) {
    badges.push('临期')
  }
  if (input.isCustom) badges.push('自定义')

  return badges
}

const CUSTOM_TYPE_COLOR_PALETTE = [
  '#2563eb',
  '#ea580c',
  '#16a34a',
  '#dc2626',
  '#0891b2',
  '#7c3aed',
  '#ca8a04',
  '#4f46e5',
] as const

function pickCustomTypeColor(seed: string) {
  const normalized = seed.trim()
  if (!normalized) return CUSTOM_TYPE_COLOR_PALETTE[0]

  let hash = 0
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0
  }
  return CUSTOM_TYPE_COLOR_PALETTE[hash % CUSTOM_TYPE_COLOR_PALETTE.length]
}

function mapCatalogToType(row: AcceptanceCatalogRow): AcceptanceType {
  const raw = row as UnknownRecord
  const name = String(row.catalog_name ?? row.catalog_code ?? '自定义类型').trim() || '自定义类型'
  const shortName = String(row.catalog_code ?? '').trim() || name.slice(0, 4)
  const color = typeof raw.color === 'string' && raw.color.trim()
    ? raw.color
    : pickCustomTypeColor(String(row.id ?? row.catalog_code ?? name))
  const icon = typeof raw.icon === 'string' && raw.icon.trim()
    ? raw.icon
    : shortName.slice(0, 2) || '验'

  return {
    id: String(row.id),
    name,
    shortName,
    color,
    icon,
    isSystem: Boolean(row.is_system),
    description: row.description ?? undefined,
    defaultDependsOn: parseStringArray(raw.default_depends_on ?? raw.defaultDependsOn),
    sortOrder: parseNumber(raw.sort_order, 99),
    phaseCode: row.phase_code ?? undefined,
    scopeLevel: row.scope_level ?? row.category ?? undefined,
    plannedFinishDate: row.planned_finish_date ?? undefined,
    category: row.category ?? row.scope_level ?? undefined,
  }
}

function mapDbToPlan(row: AcceptancePlanRow): AcceptancePlan {
  const raw = row as UnknownRecord
  const typeId = String(row.type_id ?? row.acceptance_type ?? row.type_name ?? '')
  const typeName = String(row.type_name ?? row.acceptance_type ?? row.plan_name ?? row.acceptance_name ?? '')
  const acceptanceName = String(row.acceptance_name ?? row.plan_name ?? row.name ?? '').trim()
  const phaseOrder = Number(row.phase_order ?? row.sort_order ?? 0)
  const predecessorPlanIds = parseStringArray(row.predecessor_plan_ids)
  const successorPlanIds = parseStringArray(row.successor_plan_ids)
  const requirementReadyPercent = parseNumber(row.requirement_ready_percent, 100)
  const upstreamUnfinishedCount = parseNumber(row.upstream_unfinished_count, predecessorPlanIds.length)
  const downstreamBlockCount = parseNumber(row.downstream_block_count, 0)
  const daysToDue = row.days_to_due != null ? parseNullableNumber(row.days_to_due) : deriveDaysToDue(row.planned_date)
  const isOverdue = typeof row.is_overdue === 'boolean'
    ? row.is_overdue
    : typeof daysToDue === 'number' && daysToDue < 0 && !['passed', 'archived'].includes(normalizeAcceptanceStatus(String(row.status ?? 'draft')))
  const isBlocked = typeof row.is_blocked === 'boolean'
    ? row.is_blocked
    : upstreamUnfinishedCount > 0
  const isCustom = Boolean(row.is_custom) || (!row.is_system && Boolean(row.catalog_id))
  const displayBadges = normalizeOverlayBadges([
    ...parseStringArray(row.display_badges),
    ...parseStringArray(row.overlay_tags),
    ...buildDerivedOverlayBadges({
      isOverdue,
      daysToDue,
      isBlocked,
      upstreamUnfinishedCount,
      requirementReadyPercent,
      isCustom,
    }),
  ])

  return {
    id: String(row.id),
    project_id: String(row.project_id),
    milestone_id: row.task_id ?? row.milestone_id ?? null,
    catalog_id: row.catalog_id ?? null,
    type_id: typeId,
    type_name: typeName,
    type_color: String(row.type_color ?? 'bg-slate-500'),
    acceptance_type: row.acceptance_type ?? row.type_name ?? null,
    acceptance_name: row.acceptance_name ?? row.plan_name ?? null,
    name: acceptanceName || typeName || String(row.id),
    description: row.description ?? null,
    planned_date: row.planned_date ?? null,
    actual_date: row.actual_date ?? null,
    building_id: row.building_id ?? null,
    scope_level: row.scope_level ?? null,
    participant_unit_id: row.participant_unit_id ?? null,
    status: normalizeAcceptanceStatus(String(row.status ?? 'draft')),
    phase_code: row.phase_code ?? row.phase ?? null,
    phase_order: Number.isFinite(phaseOrder) ? phaseOrder : 0,
    sort_order: Number.isFinite(Number(row.sort_order ?? phaseOrder)) ? Number(row.sort_order ?? phaseOrder) : 0,
    parallel_group_id: row.parallel_group_id ?? null,
    predecessor_plan_ids: predecessorPlanIds,
    successor_plan_ids: successorPlanIds,
    can_submit: row.can_submit ?? (upstreamUnfinishedCount === 0 && requirementReadyPercent >= 100),
    is_overdue: isOverdue,
    days_to_due: daysToDue,
    requirement_ready_percent: requirementReadyPercent,
    upstream_unfinished_count: upstreamUnfinishedCount,
    downstream_block_count: downstreamBlockCount,
    display_badges: displayBadges,
    overlay_tags: displayBadges,
    is_blocked: isBlocked,
    block_reason_summary: row.block_reason_summary ?? null,
    warning_level: row.warning_level ?? (isOverdue ? 'critical' : displayBadges.includes('临期') ? 'warning' : 'info'),
    is_custom: isCustom,
    responsible_user_id: row.responsible_user_id ?? null,
    documents: parseDocuments(row.documents),
    nodes: undefined,
    is_system: Boolean(row.is_system),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? row.created_at ?? ''),
    created_by: row.created_by ?? null,
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}

const FRESH_ACCEPTANCE_READ_OPTIONS = {
  headers: { 'Content-Type': 'application/json' },
  cache: 'no-store' as RequestCache,
}

function buildPlanWriteBody(plan: Partial<AcceptancePlan>): Record<string, unknown> {
  return compactObject({
    project_id: plan.project_id,
    task_id: plan.milestone_id,
    catalog_id: plan.catalog_id,
    type_id: plan.type_id,
    type_name: plan.type_name,
    acceptance_type: plan.acceptance_type ?? plan.type_name,
    acceptance_name: plan.acceptance_name ?? plan.name,
    description: plan.description,
    planned_date: plan.planned_date,
    actual_date: plan.actual_date,
    building_id: plan.building_id,
    scope_level: plan.scope_level,
    participant_unit_id: plan.participant_unit_id,
    status: plan.status ? normalizeAcceptanceStatus(plan.status) : undefined,
    phase: plan.phase_code,
    phase_order: plan.phase_order,
    sort_order: plan.sort_order,
    parallel_group_id: plan.parallel_group_id,
    documents: plan.documents,
    created_by: plan.created_by,
  })
}

function buildPlanQuery(projectId: string, filters?: AcceptancePlanFilters) {
  const params = new URLSearchParams()
  params.set('projectId', projectId)

  if (filters?.taskId) params.set('taskId', filters.taskId)
  if (filters?.buildingId) params.set('buildingId', filters.buildingId)
  if (filters?.scopeLevel) params.set('scopeLevel', filters.scopeLevel)
  if (filters?.participantUnitId) params.set('participantUnitId', filters.participantUnitId)
  if (filters?.catalogId) params.set('catalogId', filters.catalogId)
  if (filters?.phaseCode) params.set('phaseCode', filters.phaseCode)
  if (filters?.overlayTag) params.set('overlayTag', filters.overlayTag)
  if (filters?.blockedOnly) params.set('blockedOnly', 'true')

  const statuses = Array.isArray(filters?.status)
    ? filters?.status
    : filters?.status
      ? [filters.status]
      : []
  if (statuses.length > 0) {
    params.set('status', statuses.map((status) => normalizeAcceptanceStatus(status)).join(','))
  }

  return params.toString()
}

function mapRequirement(row: UnknownRecord): AcceptanceRequirementRecord {
  const status = row.status == null ? null : String(row.status).trim().toLowerCase() as AcceptanceRequirementStatus
  const isRequired = row.is_required == null ? status !== 'closed' : parseBooleanLike(row.is_required, status !== 'closed')
  const isSatisfied = row.is_satisfied == null ? status === 'met' || status === 'closed' : parseBooleanLike(row.is_satisfied, status === 'met' || status === 'closed')
  return {
    id: String(row.id ?? ''),
    plan_id: String(row.plan_id ?? ''),
    requirement_type: String(row.requirement_type ?? ''),
    source_entity_type: String(row.source_entity_type ?? ''),
    source_entity_id: String(row.source_entity_id ?? ''),
    drawing_package_id: row.drawing_package_id ? String(row.drawing_package_id) : undefined,
    description: row.description == null ? null : String(row.description),
    status,
    is_required: isRequired,
    is_satisfied: isSatisfied,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapDependency(row: UnknownRecord): AcceptancePlanDependencyRecord {
  const dependencyKind = normalizeAcceptanceDependencyKind(String(row.dependency_kind ?? 'hard'))
  return {
    id: String(row.id ?? ''),
    project_id: String(row.project_id ?? ''),
    source_plan_id: String(row.source_plan_id ?? ''),
    target_plan_id: String(row.target_plan_id ?? ''),
    dependency_kind: dependencyKind,
    status: row.status == null ? null : String(row.status),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapRecord(row: UnknownRecord): AcceptanceRecordEntry {
  return {
    id: String(row.id ?? ''),
    plan_id: String(row.plan_id ?? ''),
    record_type: String(row.record_type ?? ''),
    content: String(row.content ?? ''),
    operator: row.operator == null ? null : String(row.operator),
    record_date: row.record_date == null ? null : String(row.record_date),
    attachments: Array.isArray(row.attachments) ? row.attachments : parseJson<unknown[] | null>(row.attachments, null),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapWarning(row: UnknownRecord): AcceptanceLinkedWarning {
  return {
    id: String(row.id ?? ''),
    task_id: row.task_id ? String(row.task_id) : undefined,
    warning_signature: row.warning_signature ? String(row.warning_signature) : undefined,
    warning_type: String(row.warning_type ?? ''),
    warning_level: (row.warning_level || 'info') as AcceptanceLinkedWarning['warning_level'],
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    is_acknowledged: Boolean(row.is_acknowledged),
    status: row.status == null ? null : String(row.status),
    source_entity_type: row.source_entity_type == null ? null : String(row.source_entity_type),
    source_entity_id: row.source_entity_id == null ? null : String(row.source_entity_id),
    created_at: row.created_at ? String(row.created_at) : undefined,
  }
}

function mapIssue(row: UnknownRecord): AcceptanceLinkedIssue {
  return {
    id: String(row.id ?? ''),
    task_id: row.task_id == null ? null : String(row.task_id),
    title: String(row.title ?? ''),
    description: row.description == null ? null : String(row.description),
    severity: (row.severity || 'medium') as AcceptanceLinkedIssue['severity'],
    status: (row.status || 'open') as AcceptanceLinkedIssue['status'],
    source_type: String(row.source_type ?? 'manual'),
    source_id: row.source_id == null ? null : String(row.source_id),
    source_entity_type: row.source_entity_type == null ? null : String(row.source_entity_type),
    source_entity_id: row.source_entity_id == null ? null : String(row.source_entity_id),
    chain_id: row.chain_id == null ? null : String(row.chain_id),
    pending_manual_close: Boolean(row.pending_manual_close),
    closed_reason: row.closed_reason == null ? null : String(row.closed_reason),
    closed_at: row.closed_at == null ? null : String(row.closed_at),
    version: typeof row.version === 'number' ? row.version : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function mapRisk(row: UnknownRecord): AcceptanceLinkedRisk {
  return {
    id: String(row.id ?? ''),
    task_id: row.task_id == null ? null : String(row.task_id),
    title: String(row.title ?? ''),
    description: row.description == null ? undefined : String(row.description),
    level: row.level == null ? String(row.severity ?? 'medium') : String(row.level),
    status: row.status == null ? 'identified' : String(row.status),
    source_type: row.source_type == null ? 'manual' : String(row.source_type),
    source_id: row.source_id == null ? null : String(row.source_id),
    source_entity_type: row.source_entity_type == null ? null : String(row.source_entity_type),
    source_entity_id: row.source_entity_id == null ? null : String(row.source_entity_id),
    chain_id: row.chain_id == null ? null : String(row.chain_id),
    linked_issue_id: row.linked_issue_id == null ? null : String(row.linked_issue_id),
    pending_manual_close: Boolean(row.pending_manual_close),
    closed_reason: row.closed_reason == null ? null : String(row.closed_reason),
    closed_at: row.closed_at == null ? null : String(row.closed_at),
    version: typeof row.version === 'number' ? row.version : undefined,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export const acceptanceApi = {
  async getPlans(projectId: string, filters?: AcceptancePlanFilters): Promise<AcceptancePlan[]> {
    const query = buildPlanQuery(projectId, filters)
    const data = await authFetch<AcceptancePlanRow[]>(
      `${API_BASE}/acceptance-plans?${query}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )

    return (data || []).map(mapDbToPlan)
  },

  async getFlowSnapshot(projectId: string, filters?: AcceptancePlanFilters) {
    const query = buildPlanQuery(projectId, filters)
    const data = await authFetch<AcceptanceFlowSnapshotRow>(
      `${API_BASE}/acceptance-plans/flow-snapshot?${query}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )

    return {
      catalogs: data?.catalogs || [],
      plans: (data?.plans || []).map(mapDbToPlan),
      dependencies: (data?.dependencies || []).map(mapDependency),
      requirements: (data?.requirements || []).map(mapRequirement),
      records: (data?.records || []).map(mapRecord),
    }
  },

  async getProjectSummary(projectId: string): Promise<AcceptanceProjectSummary> {
    const data = await authFetch<AcceptanceProjectSummaryRow>(
      `${API_BASE}/projects/${encodeURIComponent(projectId)}/acceptance-summary`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )

    return {
      totalCount: parseNumber(data?.totalCount, 0),
      passedCount: parseNumber(data?.passedCount, 0),
      inProgressCount: parseNumber(data?.inProgressCount, 0),
      notStartedCount: parseNumber(data?.notStartedCount, 0),
      blockedCount: parseNumber(data?.blockedCount, 0),
      dueSoon30dCount: parseNumber(data?.dueSoon30dCount, 0),
      keyMilestoneCount: parseNumber(data?.keyMilestoneCount, 0),
      completionRate: parseNumber(data?.completionRate, 0),
    }
  },

  async getPlan(planId: string): Promise<AcceptancePlan> {
    const data = await authFetch<AcceptancePlanRow>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return mapDbToPlan(data)
  },

  async createPlan(plan: Partial<AcceptancePlan>): Promise<AcceptancePlan> {
    const data = await authFetch<AcceptancePlanRow>(`${API_BASE}/acceptance-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPlanWriteBody(plan)),
    })
    return mapDbToPlan(data)
  },

  async updatePlan(planId: string, updates: Partial<AcceptancePlan>): Promise<AcceptancePlan> {
    const data = await authFetch<AcceptancePlanRow>(
      `${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPlanWriteBody(updates)),
      },
    )
    return mapDbToPlan(data)
  },

  async updateStatus(planId: string, status: AcceptanceStatus, actualDate?: string | null): Promise<void> {
    const normalizedStatus = normalizeAcceptanceStatus(status)
    const payload = compactObject({
      status: normalizedStatus,
      actual_date:
        actualDate !== undefined
          ? actualDate
          : normalizedStatus === 'passed'
            ? new Date().toISOString().split('T')[0]
            : undefined,
    })

    await authFetch<AcceptancePlanRow>(`${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },

  async deletePlan(planId: string): Promise<void> {
    await authFetch(`${API_BASE}/acceptance-plans/${encodeURIComponent(planId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async getCustomTypes(projectId: string): Promise<AcceptanceType[]> {
    const data = await authFetch<AcceptanceCatalogRow[]>(
      `${API_BASE}/acceptance-catalog?projectId=${encodeURIComponent(projectId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapCatalogToType)
  },

  async createCustomType(type: Partial<AcceptanceType>, projectId: string): Promise<AcceptanceType> {
    const data = await authFetch<AcceptanceCatalogRow>(`${API_BASE}/acceptance-catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        catalog_code: (type.shortName || type.name || '自定义').slice(0, 12),
        catalog_name: type.name || '自定义类型',
        phase_code: type.phaseCode ?? null,
        scope_level: type.scopeLevel ?? type.category ?? null,
        category: type.category ?? type.scopeLevel ?? null,
        planned_finish_date: type.plannedFinishDate ?? null,
        description: type.description ?? null,
        is_system: false,
      }),
    })

    const mapped = mapCatalogToType(data)
    return {
      ...mapped,
      color: type.color || mapped.color,
      icon: type.icon || mapped.icon,
      defaultDependsOn: type.defaultDependsOn ?? mapped.defaultDependsOn,
      sortOrder: type.sortOrder ?? mapped.sortOrder,
      phaseCode: type.phaseCode ?? mapped.phaseCode,
      scopeLevel: type.scopeLevel ?? type.category ?? mapped.scopeLevel,
      plannedFinishDate: type.plannedFinishDate ?? mapped.plannedFinishDate,
      category: type.category ?? type.scopeLevel ?? mapped.category,
    }
  },

  async deleteCustomType(typeId: string): Promise<void> {
    await authFetch(`${API_BASE}/acceptance-catalog/${encodeURIComponent(typeId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
  },
  async addDependency(projectId: string, planId: string, dependsOnId: string): Promise<void> {
    await authFetch(`${API_BASE}/acceptance-dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        source_plan_id: dependsOnId,
        target_plan_id: planId,
        dependency_kind: 'hard' as AcceptanceDependencyKind,
      }),
    })
  },

  async removeDependency(planId: string, dependsOnId: string): Promise<void> {
    const dependencies = await this.getPlanDependencies(planId)
    const dependency = dependencies.find(
      (item) => item.source_plan_id === dependsOnId && item.target_plan_id === planId,
    )
    if (!dependency) return

    await authFetch(`${API_BASE}/acceptance-dependencies/${encodeURIComponent(dependency.id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async createDefaultPlans(projectId: string): Promise<AcceptancePlan[]> {
    return this.getPlans(projectId)
  },

  async getPlanRequirements(planId: string): Promise<AcceptanceRequirementRecord[]> {
    const data = await authFetch<UnknownRecord[]>(
      `${API_BASE}/acceptance-requirements?planId=${encodeURIComponent(planId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapRequirement)
  },

  async createPlanRequirement(projectId: string, planId: string, input: AcceptanceRequirementMutation) {
    const data = await authFetch<UnknownRecord>(`${API_BASE}/acceptance-requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        plan_id: planId,
        ...input,
      }),
    })
    return mapRequirement(data)
  },

  async updatePlanRequirement(requirementId: string, updates: Partial<AcceptanceRequirementMutation>) {
    const data = await authFetch<UnknownRecord>(
      `${API_BASE}/acceptance-requirements/${encodeURIComponent(requirementId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    )
    return mapRequirement(data)
  },

  async getPlanDependencies(planId: string): Promise<AcceptancePlanDependencyRecord[]> {
    const data = await authFetch<UnknownRecord[]>(
      `${API_BASE}/acceptance-dependencies?planId=${encodeURIComponent(planId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapDependency)
  },

  async getPlanRecords(planId: string): Promise<AcceptanceRecordEntry[]> {
    const data = await authFetch<UnknownRecord[]>(
      `${API_BASE}/acceptance-records?planId=${encodeURIComponent(planId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapRecord)
  },

  async createPlanRecord(projectId: string, planId: string, input: AcceptanceRecordMutation) {
    const data = await authFetch<UnknownRecord>(`${API_BASE}/acceptance-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        plan_id: planId,
        ...input,
      }),
    })
    return mapRecord(data)
  },

  async updatePlanRecord(recordId: string, updates: Partial<AcceptanceRecordMutation>) {
    const data = await authFetch<UnknownRecord>(
      `${API_BASE}/acceptance-records/${encodeURIComponent(recordId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    )
    return mapRecord(data)
  },

  async getProjectWarnings(projectId: string): Promise<AcceptanceLinkedWarning[]> {
    const data = await authFetch<UnknownRecord[]>(
      `${API_BASE}/warnings?projectId=${encodeURIComponent(projectId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapWarning)
  },

  async getProjectIssues(projectId: string): Promise<AcceptanceLinkedIssue[]> {
    const data = await authFetch<UnknownRecord[]>(
      `${API_BASE}/issues?projectId=${encodeURIComponent(projectId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapIssue)
  },

  async getProjectRisks(projectId: string): Promise<AcceptanceLinkedRisk[]> {
    const data = await authFetch<UnknownRecord[]>(
      `${API_BASE}/risks?projectId=${encodeURIComponent(projectId)}`,
      FRESH_ACCEPTANCE_READ_OPTIONS,
    )
    return (data || []).map(mapRisk)
  },

  async getPlanRelationBundle(projectId: string | null | undefined, planId: string): Promise<AcceptancePlanRelationBundle> {
    if (!projectId) {
      return {
        requirements: [],
        dependencies: [],
        records: [],
        linkedWarnings: [],
        linkedIssues: [],
        linkedRisks: [],
      }
    }

    const [requirements, dependencies, records, linkedWarnings, linkedIssues, linkedRisks] = await Promise.all([
      this.getPlanRequirements(planId),
      this.getPlanDependencies(planId),
      this.getPlanRecords(planId),
      this.getProjectWarnings(projectId),
      this.getProjectIssues(projectId),
      this.getProjectRisks(projectId),
    ])

    return {
      requirements,
      dependencies,
      records,
      linkedWarnings,
      linkedIssues,
      linkedRisks,
    }
  },
}
