export type PlanItemKind =
  | 'work_task'
  | 'management_task'
  | 'inspection_task'
  | 'document_task'
  | 'commercial_task'
  | 'safety_control'
  | 'milestone'
  | 'linked_projection'

export type RelationRole =
  | 'workflow'
  | 'evidence'
  | 'inspection'
  | 'approval'
  | 'handover'
  | 'commercial'
  | 'prerequisite'
  | 'management'
  | 'projected_link'

export type ProgressMode = 'manual' | 'event_triggered' | 'upload_triggered' | 'binary' | 'inherited'

export type ScheduleParticipation = 'normal' | 'reference_only' | 'read_only_projection' | 'excluded'

export type RowProjectionMode =
  | 'schedule_row'
  | 'gate_marker'
  | 'inline_control'
  | 'linked_projection'

export type ScopeExpansionMode =
  | 'project'
  | 'building'
  | 'floor'
  | 'building_rhythm_series'
  | 'floor_anchor'
  | 'explicit_instances'
  | 'custom'
  | 'triggered_object'
  | 'referenced_work_or_project'
  | string

export type LinkedProjectionSource = {
  sourceType: 'milestone' | 'acceptance_plan' | 'pre_milestone' | string
  sourceId: string
  sourceLabel: string
  sourceRoute: string
}

export const PLAN_ITEM_KIND_OPTIONS: Array<{ value: PlanItemKind; label: string }> = [
  { value: 'work_task', label: '施工/准备任务' },
  { value: 'management_task', label: '管理动作' },
  { value: 'inspection_task', label: '检查/检测/验收' },
  { value: 'document_task', label: '资料动作' },
  { value: 'commercial_task', label: '商务动作' },
  { value: 'safety_control', label: '安全/危大管控' },
  { value: 'milestone', label: '里程碑' },
  { value: 'linked_projection', label: '联动投影' },
]

export const RELATION_ROLE_LABELS: Record<string, string> = {
  workflow: '流程',
  evidence: '证据',
  inspection: '检查',
  approval: '审批',
  handover: '移交',
  commercial: '商务',
  prerequisite: '前置条件',
  management: '管理',
  projected_link: '联动投影',
}

export const ROW_PROJECTION_LABELS: Record<RowProjectionMode, string> = {
  schedule_row: '主计划行',
  gate_marker: '门禁节点',
  inline_control: '行内控制项',
  linked_projection: '联动投影',
}

export const ROW_PROJECTION_OPTIONS: Array<{ value: RowProjectionMode; label: string }> = [
  { value: 'schedule_row', label: ROW_PROJECTION_LABELS.schedule_row },
  { value: 'gate_marker', label: ROW_PROJECTION_LABELS.gate_marker },
  { value: 'inline_control', label: ROW_PROJECTION_LABELS.inline_control },
  { value: 'linked_projection', label: ROW_PROJECTION_LABELS.linked_projection },
]

const PLAN_ITEM_KIND_SET = new Set<string>(PLAN_ITEM_KIND_OPTIONS.map((item) => item.value))
const RELATION_ROLE_SET = new Set<string>(Object.keys(RELATION_ROLE_LABELS))
const ROW_PROJECTION_SET = new Set<string>(ROW_PROJECTION_OPTIONS.map((item) => item.value))

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim()
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))]
}

export function normalizePlanItemKind(value: unknown): PlanItemKind | null {
  const normalized = normalizeString(value)
  return PLAN_ITEM_KIND_SET.has(normalized) ? normalized as PlanItemKind : null
}

export function normalizeRelationRole(value: unknown): RelationRole | null {
  const normalized = normalizeString(value)
  return RELATION_ROLE_SET.has(normalized) ? normalized as RelationRole : null
}

export function normalizeRowProjectionMode(value: unknown): RowProjectionMode | null {
  const normalized = normalizeString(value)
  return ROW_PROJECTION_SET.has(normalized) ? normalized as RowProjectionMode : null
}

export function getRowProjectionModeFromMetadata(metadataValue: unknown): RowProjectionMode {
  const metadata = readStandardTaskMetadata(metadataValue)
  return normalizeRowProjectionMode(metadata.rowProjectionMode ?? metadata.row_projection_mode)
    ?? 'schedule_row'
}

export function getRowProjectionLabel(mode?: string | null) {
  return ROW_PROJECTION_LABELS[normalizeRowProjectionMode(mode) ?? 'schedule_row']
}

export function mapRelationRoleToPlanItemKind(role?: unknown): PlanItemKind | null {
  switch (normalizeRelationRole(role)) {
    case 'workflow':
      return 'work_task'
    case 'evidence':
      return 'document_task'
    case 'inspection':
      return 'inspection_task'
    case 'commercial':
      return 'commercial_task'
    case 'approval':
      return 'safety_control'
    case 'handover':
      return 'milestone'
    case 'prerequisite':
    case 'management':
      return 'management_task'
    case 'projected_link':
      return 'linked_projection'
    default:
      return null
  }
}

export function readStandardTaskMetadata(value: unknown): Record<string, unknown> {
  return readRecord(value)
}

export function getPlanItemKindFromMetadata(
  metadataValue: unknown,
  fallback: { isMilestone?: boolean; relationRole?: unknown; packType?: unknown } = {},
): PlanItemKind {
  const metadata = readStandardTaskMetadata(metadataValue)
  return normalizePlanItemKind(metadata.planItemKind ?? metadata.plan_item_kind)
    ?? mapRelationRoleToPlanItemKind(metadata.relationRole ?? metadata.relation_role ?? fallback.relationRole)
    ?? (fallback.isMilestone ? 'milestone' : null)
    ?? (normalizeString(metadata.packType ?? metadata.pack_type ?? fallback.packType) === 'project_milestone' ? 'milestone' : null)
    ?? 'work_task'
}

export function getRelationRoleFromMetadata(metadataValue: unknown): RelationRole | null {
  const metadata = readStandardTaskMetadata(metadataValue)
  return normalizeRelationRole(metadata.relationRole ?? metadata.relation_role)
}

export function getProgressModeFromMetadata(metadataValue: unknown, planItemKind: PlanItemKind): ProgressMode {
  const metadata = readStandardTaskMetadata(metadataValue)
  const explicit = normalizeString(metadata.progressMode ?? metadata.progress_mode)
  if (['manual', 'event_triggered', 'upload_triggered', 'binary', 'inherited'].includes(explicit)) {
    return explicit as ProgressMode
  }
  if (planItemKind === 'inspection_task') return 'event_triggered'
  if (planItemKind === 'document_task') return 'upload_triggered'
  if (planItemKind === 'milestone') return 'binary'
  if (planItemKind === 'linked_projection') return 'inherited'
  return 'manual'
}

export function getPlanItemTagsFromMetadata(metadataValue: unknown): string[] {
  const metadata = readStandardTaskMetadata(metadataValue)
  return readStringArray(metadata.planItemTags ?? metadata.plan_item_tags)
}

export function getScheduleParticipationFromMetadata(metadataValue: unknown): ScheduleParticipation | undefined {
  const value = normalizeString(readStandardTaskMetadata(metadataValue).scheduleParticipation)
    || normalizeString(readStandardTaskMetadata(metadataValue).schedule_participation)
  if (['normal', 'reference_only', 'read_only_projection', 'excluded'].includes(value)) return value as ScheduleParticipation
  return undefined
}

export function getScopeExpansionModeFromMetadata(metadataValue: unknown): ScopeExpansionMode | undefined {
  const value = normalizeString(readStandardTaskMetadata(metadataValue).scopeExpansionMode)
    || normalizeString(readStandardTaskMetadata(metadataValue).scope_expansion_mode)
  return value || undefined
}

export function getLinkedProjectionSourceFromMetadata(metadataValue: unknown): LinkedProjectionSource | null {
  const metadata = readStandardTaskMetadata(metadataValue)
  const source = readRecord(metadata.linkedProjectionSource ?? metadata.linked_projection_source)
  const sourceId = normalizeString(source.sourceId ?? source.source_id)
  const sourceLabel = normalizeString(source.sourceLabel ?? source.source_label)
  const sourceRoute = normalizeString(source.sourceRoute ?? source.source_route)
  if (!sourceId && !sourceLabel && !sourceRoute) return null
  return {
    sourceType: normalizeString(source.sourceType ?? source.source_type) || 'linked_source',
    sourceId,
    sourceLabel,
    sourceRoute,
  }
}

export function getPlanItemKindLabel(kind?: string | null) {
  const normalized = normalizePlanItemKind(kind) ?? 'work_task'
  return PLAN_ITEM_KIND_OPTIONS.find((item) => item.value === normalized)?.label ?? normalized
}

export function isDefaultPlanItemKind(kind?: string | null) {
  return (normalizePlanItemKind(kind) ?? 'work_task') === 'work_task'
}
