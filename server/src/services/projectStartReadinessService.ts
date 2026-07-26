import {
  calendarDateText,
  isAuthoritativeConstructionCalendar,
  isConstructionProductionDay,
  parseConstructionCalendarDate,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import { businessDateKey } from './durationMetricService.js'
import { supabase } from './dbService.js'

export const PROJECT_START_READINESS_WINDOW_DAYS = 14

export type StartReadinessBlockerType =
  | 'material'
  | 'drawing'
  | 'certificate'
  | 'predecessor'
  | 'access'
  | 'labor_equipment'
  | 'approval'
  | 'other'

export type StartReadinessState = 'ready' | 'attention' | 'blocked'

export type StartReadinessMetricAvailability = 'ready' | 'insufficient_data' | 'source_unavailable'

export interface StartReadinessMetricValue {
  value: number | null
  unit: 'count' | 'percent' | 'calendar_date' | 'construction_production_day'
  availability: StartReadinessMetricAvailability
  unavailableReason?: string | null
}

export interface StartReadinessBlocker {
  blockerType: StartReadinessBlockerType
  severity: 'blocking' | 'attention'
  referenceType: string
  referenceId: string | null
  label: string
  nextAction?: string | null
  dueDate?: string | null
  sourceUpdatedAt?: string | null
}

export interface StartReadinessResponsibleParty {
  userId?: string | null
  userName?: string | null
  participantUnitId?: string | null
  participantUnitName?: string | null
  displayName?: string | null
}

export interface ProjectStartReadinessItem {
  taskId: string
  title: string
  plannedStartDate: string
  readinessState: StartReadinessState
  calendarIdentity: ProjectStartReadinessCalendarIdentity
  unmetConditionsByType: Partial<Record<StartReadinessBlockerType, StartReadinessBlocker[]>>
  blockingReferences: Partial<Record<StartReadinessBlockerType, StartReadinessBlocker[]>>
  responsibleParty: StartReadinessResponsibleParty | null
  nextAction: string | null
  freshness: {
    asOf: string
    evaluatedAt: string
    sourceUpdatedAt: string | null
  }
}

export interface ProjectStartReadinessCalendarIdentity {
  availability: 'available' | 'unavailable'
  calendarRef: string | null
  calendarVersion: string | null
  timezone: string | null
  unavailableReason?: string | null
}

export interface ProjectStartReadinessReadModel {
  project: {
    projectId: string
    companyId: string | null
    ownerId: string | null
  }
  window: {
    fromDate: string
    throughDate: string
    calendarDateCount: number
    timezone: string
    timezoneAvailability: 'available' | 'unavailable'
  }
  dateVisibility: {
    availability: 'available'
    unit: 'calendar_date'
  }
  calendarIdentity: ProjectStartReadinessCalendarIdentity
  productionDayMetrics: {
    availability: 'ready' | 'source_unavailable'
    productionDateCount: number | null
    taskCountOnProductionDates: number | null
    unit: 'construction_production_day'
    unavailableReason?: string | null
  }
  summary: {
    taskCount: number
    readyTaskCount: number
    blockedTaskCount: number
    attentionTaskCount: number
    blockerTaskCountByType: Partial<Record<StartReadinessBlockerType, number>>
  }
  metrics: Record<string, StartReadinessMetricValue>
  items: ProjectStartReadinessItem[]
  freshness: {
    asOf: string
    evaluatedAt: string
    sourceUpdatedAt: string | null
  }
}

export interface ProjectStartReadinessProject {
  id: string
  company_id?: string | null
  owner_id?: string | null
  metadata?: unknown
  updated_at?: string | null
}

export type ProjectStartReadinessRawRow = Record<string, unknown>

export interface ProjectStartReadinessWindowFacts {
  tasks: ProjectStartReadinessRawRow[]
  conditions: ProjectStartReadinessRawRow[]
  obstacles: ProjectStartReadinessRawRow[]
  dependencies: ProjectStartReadinessRawRow[]
  dependencyTasks: ProjectStartReadinessRawRow[]
  entityLinks: ProjectStartReadinessRawRow[]
  drawingPackages: ProjectStartReadinessRawRow[]
  drawings: ProjectStartReadinessRawRow[]
  certificateWorkItems: ProjectStartReadinessRawRow[]
  acceptancePlans: ProjectStartReadinessRawRow[]
  preMilestones: ProjectStartReadinessRawRow[]
  projectMaterials: ProjectStartReadinessRawRow[]
  participantUnits: ProjectStartReadinessRawRow[]
  users: ProjectStartReadinessRawRow[]
}

export interface ProjectStartReadinessDataSource {
  loadProject(input: { projectId: string; companyId?: string | null }): Promise<ProjectStartReadinessProject | null>
  loadWindowFacts(input: {
    projectId: string
    companyId?: string | null
    fromDate: string
    throughDate: string
  }): Promise<ProjectStartReadinessWindowFacts>
}

export class ProjectStartReadinessScopeError extends Error {
  constructor(projectId: string) {
    super(`Project start-readiness scope is unavailable: ${projectId}`)
    this.name = 'ProjectStartReadinessScopeError'
  }
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  const normalized = text(value)
  return normalized || null
}

function normalizedToken(value: unknown) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

const KNOWN_START_READINESS_SOURCE_TYPES = new Set([
  'project_material',
  'drawing_package',
  'construction_drawing',
  'certificate_work_item',
  'acceptance_plan',
  'pre_milestone',
])

function knownStartReadinessSourceType(value: unknown) {
  const normalized = normalizedToken(value)
  return KNOWN_START_READINESS_SOURCE_TYPES.has(normalized) ? normalized : null
}

function asBoolean(value: unknown) {
  if (value === true || value === 1) return true
  return ['true', '1', 'yes', 'y'].includes(normalizedToken(value))
}

function asNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isValidDateOnly(value: unknown): value is string {
  const normalized = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false
  const date = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && calendarDateText(date) === normalized
}

function addCalendarDays(dateTextValue: string, days: number) {
  const date = new Date(`${dateTextValue}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return calendarDateText(date)
}

function isValidTimezone(value: string | null) {
  if (!value) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

function readMetadataTimezone(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const metadata = value as Record<string, unknown>
  return nullableText(
    metadata.business_timezone
      ?? metadata.businessTimezone
      ?? metadata.construction_calendar_timezone
      ?? metadata.constructionCalendarTimezone
      ?? metadata.timezone,
  )
}

function resolveTimezone(project: ProjectStartReadinessProject, calendar: ConstructionCalendarContext) {
  const projectTimezone = readMetadataTimezone(project.metadata)
  const calendarTimezone = nullableText(calendar.timezone)
  const candidate = projectTimezone || calendarTimezone
  if (isValidTimezone(candidate)) {
    return { timezone: candidate as string, availability: 'available' as const }
  }
  return { timezone: candidate || 'UTC', availability: 'unavailable' as const }
}

function isCompletedTask(row: ProjectStartReadinessRawRow | undefined) {
  if (!row) return false
  const status = normalizedToken(row.status)
  return ['completed', 'done', 'closed', 'cancelled', 'archived', 'voided'].includes(status)
    || (asNumber(row.progress) ?? 0) >= 100
    || Boolean(nullableText(row.actual_end_date))
}

function isStartBlockingDependency(row: ProjectStartReadinessRawRow) {
  const sourceType = normalizedToken(row.source_type)
  return !sourceType || ['manual', 'current_task_fact', 'explicit', 'user', 'user_manual'].includes(sourceType)
}

function isOpenObstacle(row: ProjectStartReadinessRawRow) {
  if (asBoolean(row.is_resolved)) return false
  const status = normalizedToken(row.status)
  return !['resolved', 'closed', 'deleted', 'archived', 'cancelled'].includes(status)
}

function isHardCondition(row: ProjectStartReadinessRawRow) {
  if (row.required_for_start === false || normalizedToken(row.required_for_start) === 'false') return false
  const blockingLevel = normalizedToken(row.blocking_level)
  return blockingLevel === '' || blockingLevel === 'hard'
}

function mapConditionType(value: unknown, sourceType?: unknown): StartReadinessBlockerType {
  const token = `${normalizedToken(value)} ${normalizedToken(sourceType)}`
  if (token.includes('material') || token.includes('\u6750\u6599')) return 'material'
  if (token.includes('drawing') || token.includes('\u56fe\u7eb8')) return 'drawing'
  if (token.includes('certificate') || token.includes('permit') || token.includes('\u8bc1\u7167')) return 'certificate'
  if (token.includes('access') || token.includes('site') || token.includes('\u73af\u5883') || token.includes('\u573a\u5730')) return 'access'
  if (token.includes('labor') || token.includes('person') || token.includes('equipment') || token.includes('\u4eba\u5458') || token.includes('\u8bbe\u5907')) return 'labor_equipment'
  if (token.includes('approval') || token.includes('acceptance') || token.includes('procedure') || token.includes('\u624b\u7eed') || token.includes('\u5ba1\u6279')) return 'approval'
  return 'other'
}

function mapObstacleType(value: unknown): StartReadinessBlockerType {
  const token = normalizedToken(value)
  if (token.includes('material') || token.includes('\u6750\u6599')) return 'material'
  if (token.includes('drawing') || token.includes('design') || token.includes('\u8bbe\u8ba1') || token.includes('\u56fe\u7eb8')) return 'drawing'
  if (token.includes('access') || token.includes('environment') || token.includes('\u73af\u5883') || token.includes('\u573a\u5730')) return 'access'
  if (token.includes('labor') || token.includes('person') || token.includes('equipment') || token.includes('\u4eba\u5458') || token.includes('\u8bbe\u5907')) return 'labor_equipment'
  if (token.includes('approval') || token.includes('procedure') || token.includes('\u624b\u7eed') || token.includes('\u5ba1\u6279')) return 'approval'
  return 'other'
}

function sourceUpdatedAt(...values: unknown[]) {
  const timestamps = values
    .map(nullableText)
    .filter((value): value is string => Boolean(value))
    .filter((value) => Number.isFinite(new Date(value).getTime()))
  if (timestamps.length === 0) return null
  return timestamps.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null
}

function addBlocker(
  grouped: Partial<Record<StartReadinessBlockerType, StartReadinessBlocker[]>>,
  blocker: StartReadinessBlocker,
) {
  const list = grouped[blocker.blockerType] ?? []
  const key = `${blocker.referenceType}:${blocker.referenceId ?? ''}:${blocker.label}`
  if (!list.some((existing) => `${existing.referenceType}:${existing.referenceId ?? ''}:${existing.label}` === key)) {
    list.push(blocker)
  }
  grouped[blocker.blockerType] = list
}

function highestSeverity(blockers: Partial<Record<StartReadinessBlockerType, StartReadinessBlocker[]>>) {
  const values = Object.values(blockers).flatMap((items) => items ?? [])
  return values.some((item) => item.severity === 'blocking') ? 'blocked' as const : values.length > 0 ? 'attention' as const : 'ready' as const
}

function buildCalendarIdentity(calendar: ConstructionCalendarContext, timezone: { timezone: string; availability: 'available' | 'unavailable' }, reason?: string | null): ProjectStartReadinessCalendarIdentity {
  const authoritative = isAuthoritativeConstructionCalendar(calendar)
    && timezone.availability === 'available'
    && nullableText(calendar.timezone) === timezone.timezone
  return {
    availability: authoritative ? 'available' : 'unavailable',
    calendarRef: authoritative ? nullableText(calendar.calendarRef) : null,
    calendarVersion: authoritative ? nullableText(calendar.calendarVersion) : null,
    timezone: nullableText(calendar.timezone) || (timezone.availability === 'available' ? timezone.timezone : null),
    unavailableReason: authoritative ? null : reason || nullableText(calendar.unavailableReason) || 'construction_calendar_identity_missing',
  }
}

function buildMetric(value: number | null, unit: StartReadinessMetricValue['unit'], availability: StartReadinessMetricAvailability, unavailableReason?: string | null): StartReadinessMetricValue {
  return { value, unit, availability, unavailableReason: unavailableReason ?? null }
}

function unique<T>(values: T[]) {
  return [...new Set(values)]
}

function buildItem(
  task: ProjectStartReadinessRawRow,
  facts: ProjectStartReadinessWindowFacts,
  calendarIdentity: ProjectStartReadinessCalendarIdentity,
  asOf: string,
  evaluatedAt: string,
): ProjectStartReadinessItem {
  const taskId = text(task.id)
  const conditions = facts.conditions.filter((row) => text(row.task_id) === taskId && normalizedToken(row.status) !== 'deleted')
  const obstacles = facts.obstacles.filter((row) => text(row.task_id) === taskId && isOpenObstacle(row))
  const dependencies = facts.dependencies.filter((row) => text(row.task_id) === taskId && row.status !== 'inactive' && row.status !== 'archived')
  const predecessorById = new Map(facts.dependencyTasks.map((row) => [text(row.id), row]))
  const links = facts.entityLinks.filter((row) => text(row.target_entity_id) === taskId && text(row.target_entity_type) === 'task' && normalizedToken(row.status) === 'active')
  const conditionLinksById = new Map(
    facts.entityLinks
      .filter((row) => text(row.target_entity_type) === 'task_condition' && normalizedToken(row.status) === 'active')
      .map((row) => [text(row.target_entity_id), row]),
  )
  const packageById = new Map(facts.drawingPackages.map((row) => [text(row.id), row]))
  const drawingById = new Map(facts.drawings.map((row) => [text(row.id), row]))
  const certificateById = new Map(facts.certificateWorkItems.map((row) => [text(row.id), row]))
  const acceptanceById = new Map(facts.acceptancePlans.map((row) => [text(row.id), row]))
  const milestoneById = new Map(facts.preMilestones.map((row) => [text(row.id), row]))
  const materialById = new Map(facts.projectMaterials.map((row) => [text(row.id), row]))
  const sourceFor = (sourceType: unknown, sourceId: string | null) => {
    if (!sourceId) return undefined
    switch (normalizedToken(sourceType)) {
      case 'drawing_package': return packageById.get(sourceId)
      case 'construction_drawing': return drawingById.get(sourceId)
      case 'certificate_work_item': return certificateById.get(sourceId)
      case 'acceptance_plan': return acceptanceById.get(sourceId)
      case 'pre_milestone': return milestoneById.get(sourceId)
      case 'project_material': return materialById.get(sourceId)
      default: return undefined
    }
  }
  const conditionsByType: Partial<Record<StartReadinessBlockerType, StartReadinessBlocker[]>> = {}
  const blockingReferences: Partial<Record<StartReadinessBlockerType, StartReadinessBlocker[]>> = {}
  const allSourceTimes: unknown[] = [task.updated_at]
  const responsibleCondition = conditions.find((condition) => nullableText(condition.responsible_person) || nullableText(condition.participant_unit_id))

  for (const condition of conditions) {
    if (asBoolean(condition.is_satisfied)) continue
    const conditionLink = conditionLinksById.get(text(condition.id))
    const linkedSourceType = conditionLink?.source_entity_type
    const linkedSourceId = conditionLink?.source_entity_id
    const directEntityType = knownStartReadinessSourceType(condition.source_entity_type)
    const linkedEntityType = knownStartReadinessSourceType(linkedSourceType)
    const sourceRefType = knownStartReadinessSourceType(condition.source_type)
    const directEntityId = nullableText(condition.source_entity_id)
    const linkedEntityId = nullableText(linkedSourceId)
    const sourceRefId = nullableText(condition.source_ref_id)
    const referenceType = directEntityType && directEntityId
      ? directEntityType
      : linkedEntityType && linkedEntityId
        ? linkedEntityType
        : sourceRefType && sourceRefId
          ? sourceRefType
          : 'task_condition'
    const referenceId = directEntityType && directEntityId
      ? directEntityId
      : linkedEntityType && linkedEntityId
        ? linkedEntityId
        : sourceRefType && sourceRefId
          ? sourceRefId
          : nullableText(condition.id)
    const source = sourceFor(referenceType, referenceId)
    const blockerType = mapConditionType(
      condition.condition_type,
      directEntityType ?? linkedEntityType ?? sourceRefType,
    )
    const hard = isHardCondition(condition)
    const blocker: StartReadinessBlocker = {
      blockerType,
      severity: hard ? 'blocking' : 'attention',
      referenceType,
      referenceId,
      label: nullableText(condition.name) || nullableText(condition.description) || 'Unmet start condition',
      nextAction: nullableText(condition.description)
        || nullableText(source?.next_action)
        || nullableText(source?.block_reason)
        || null,
      dueDate: nullableText(condition.target_date ?? source?.next_action_due_date ?? source?.planned_finish_date ?? source?.expected_arrival_date)?.slice(0, 10) || null,
      sourceUpdatedAt: sourceUpdatedAt(condition.updated_at, conditionLink?.updated_at, source?.updated_at),
    }
    addBlocker(conditionsByType, blocker)
    if (hard) addBlocker(blockingReferences, blocker)
    allSourceTimes.push(condition.updated_at, conditionLink?.updated_at, source?.updated_at)
  }

  for (const dependency of dependencies) {
    if (dependency.required_for_start === false || normalizedToken(dependency.required_for_start) === 'false') continue
    if (!isStartBlockingDependency(dependency)) continue
    const predecessor = predecessorById.get(text(dependency.dependency_task_id))
    if (isCompletedTask(predecessor)) continue
    const blocker: StartReadinessBlocker = {
      blockerType: 'predecessor',
      severity: 'blocking',
      referenceType: 'task',
      referenceId: nullableText(dependency.dependency_task_id),
      label: nullableText(predecessor?.title) || 'Predecessor task is not complete',
      nextAction: 'Complete predecessor task',
      dueDate: nullableText(predecessor?.planned_end_date)?.slice(0, 10) || null,
      sourceUpdatedAt: sourceUpdatedAt(dependency.updated_at, predecessor?.updated_at),
    }
    addBlocker(conditionsByType, blocker)
    addBlocker(blockingReferences, blocker)
    allSourceTimes.push(dependency.updated_at, predecessor?.updated_at)
  }

  for (const obstacle of obstacles) {
    const blockerType = mapObstacleType(obstacle.obstacle_type)
    const level = normalizedToken(obstacle.blocking_level ?? obstacle.impact_level ?? obstacle.severity)
    const hard = normalizedToken(obstacle.blocking_scope) === 'start' || ['blocked', 'severe', 'critical'].includes(level)
    const blocker: StartReadinessBlocker = {
      blockerType,
      severity: hard ? 'blocking' : 'attention',
      referenceType: 'task_obstacle',
      referenceId: nullableText(obstacle.id),
      label: nullableText(obstacle.description) || 'Open task obstacle',
      nextAction: nullableText(obstacle.resolution) || 'Resolve task obstacle',
      dueDate: nullableText(obstacle.estimated_resolve_date)?.slice(0, 10) || null,
      sourceUpdatedAt: nullableText(obstacle.updated_at),
    }
    addBlocker(conditionsByType, blocker)
    if (hard) addBlocker(blockingReferences, blocker)
    allSourceTimes.push(obstacle.updated_at)
  }

  for (const link of links) {
    const sourceType = normalizedToken(link.source_entity_type)
    const sourceId = nullableText(link.source_entity_id)
    if (!sourceId) continue
    const source = sourceType === 'drawing_package'
      ? packageById.get(sourceId)
      : sourceType === 'construction_drawing'
        ? drawingById.get(sourceId)
        : sourceType === 'certificate_work_item'
          ? certificateById.get(sourceId)
          : sourceType === 'acceptance_plan'
            ? acceptanceById.get(sourceId)
            : sourceType === 'pre_milestone'
              ? milestoneById.get(sourceId)
              : undefined
    const relation = normalizedToken(link.relation_type)
    const sourceStatus = normalizedToken(source?.status)
    const sourceBlocked = asBoolean(source?.is_blocked)
    const isDrawing = sourceType === 'drawing_package' || sourceType === 'construction_drawing'
    const isCertificate = sourceType === 'certificate_work_item'
    const isAcceptance = sourceType === 'acceptance_plan'
    const isMilestone = sourceType === 'pre_milestone'
    const shouldBlock = relation === 'blocks_task_start'
      || (isDrawing && asBoolean(task.drawing_required) && !asBoolean(source?.is_ready_for_construction ?? source?.is_current_version))
      || (isCertificate && (sourceBlocked || !['approved', 'issued'].includes(sourceStatus)))
      || (isAcceptance && !['approved', 'passed', 'completed'].includes(sourceStatus))
      || (isMilestone && !['issued', 'obtained', 'completed'].includes(sourceStatus))
    if (!shouldBlock) continue
    const blockerType: StartReadinessBlockerType = isDrawing
      ? 'drawing'
      : isCertificate || isMilestone
        ? 'certificate'
        : isAcceptance
          ? 'approval'
          : 'other'
    const blocker: StartReadinessBlocker = {
      blockerType,
      severity: 'blocking',
      referenceType: sourceType || 'project_entity_link',
      referenceId: sourceId,
      label: nullableText(source?.package_name) || nullableText(source?.item_name) || nullableText(source?.acceptance_name) || nullableText(source?.milestone_name) || nullableText(link.display_snapshot && typeof link.display_snapshot === 'object' ? (link.display_snapshot as Record<string, unknown>).label : null) || 'Linked readiness reference is not ready',
      nextAction: nullableText(source?.next_action) || nullableText(source?.block_reason) || null,
      dueDate: nullableText(source?.next_action_due_date ?? source?.planned_finish_date ?? source?.planned_date)?.slice(0, 10) || null,
      sourceUpdatedAt: sourceUpdatedAt(link.updated_at, source?.updated_at),
    }
    addBlocker(conditionsByType, blocker)
    addBlocker(blockingReferences, blocker)
    allSourceTimes.push(link.updated_at, source?.updated_at)
  }

  const requiredFallbacks: Array<{ required: unknown; blockerType: StartReadinessBlockerType; satisfyingTypes: StartReadinessBlockerType[]; label: string }> = [
    { required: task.material_required, blockerType: 'material', satisfyingTypes: ['material'], label: 'Material readiness reference is missing' },
    { required: task.drawing_required, blockerType: 'drawing', satisfyingTypes: ['drawing'], label: 'Drawing readiness reference is missing' },
    { required: task.acceptance_required, blockerType: 'approval', satisfyingTypes: ['approval', 'certificate'], label: 'Approval readiness reference is missing' },
  ]
  for (const fallback of requiredFallbacks) {
    if (!asBoolean(fallback.required) || fallback.satisfyingTypes.some((type) => (conditionsByType[type]?.length ?? 0) > 0)) continue
    const blocker: StartReadinessBlocker = {
      blockerType: fallback.blockerType,
      severity: 'blocking',
      referenceType: 'task_requirement',
      referenceId: taskId,
      label: fallback.label,
      nextAction: 'Attach and confirm the required readiness reference',
      sourceUpdatedAt: nullableText(task.updated_at),
    }
    addBlocker(conditionsByType, blocker)
    addBlocker(blockingReferences, blocker)
  }

  const readinessState = highestSeverity(blockingReferences)
  const unitId = nullableText(task.participant_unit_id) || nullableText(responsibleCondition?.participant_unit_id)
  const unit = facts.participantUnits.find((row) => text(row.id) === unitId)
  const userId = nullableText(task.assignee_user_id) || nullableText(task.assignee_id)
  const user = facts.users.find((row) => text(row.id) === userId)
  const conditionPerson = nullableText(responsibleCondition?.responsible_person)
  const userName = nullableText(user?.username) || nullableText(user?.display_name) || nullableText(user?.email)
  const participantUnitName = nullableText(unit?.unit_name)
  const displayName = conditionPerson || userName || participantUnitName
  const responsibleParty = userId || unitId || conditionPerson
    ? { userId, userName, participantUnitId: unitId, participantUnitName, displayName }
    : null
  const blockers = Object.values(conditionsByType).flatMap((items) => items ?? [])
  const sourceTime = sourceUpdatedAt(...allSourceTimes)

  return {
    taskId,
    title: nullableText(task.title) || taskId,
    plannedStartDate: text(task.planned_start_date).slice(0, 10),
    readinessState,
    calendarIdentity,
    unmetConditionsByType: conditionsByType,
    blockingReferences,
    responsibleParty,
    nextAction: blockers.find((blocker) => blocker.nextAction)?.nextAction || null,
    freshness: {
      asOf,
      evaluatedAt,
      sourceUpdatedAt: sourceTime,
    },
  }
}

type StartReadinessProjectScopedTable =
  | 'construction_drawings'
  | 'drawing_packages'
  | 'certificate_work_items'
  | 'acceptance_plans'
  | 'pre_milestones'
  | 'project_materials'

async function readSupabaseRows<T extends object>(query: PromiseLike<{ data: unknown[] | null; error: { message?: string | null } | null }>) {
  const { data, error } = await query
  if (error) throw new Error(`project start-readiness query failed: ${error.message ?? 'unknown error'}`)
  return (Array.isArray(data) ? data : []) as T[]
}

async function readProjectScopedRows<T extends object>(
  table: 'construction_drawings' | 'drawing_packages' | 'certificate_work_items' | 'acceptance_plans' | 'pre_milestones' | 'project_materials',
  columns: string,
  projectId: string,
  ids: string[],
) {
  const normalizedIds = unique(ids.map(text).filter(Boolean))
  if (normalizedIds.length === 0) return [] as T[]
  return readSupabaseRows<T>(
    (supabase as any)
      .from(table satisfies StartReadinessProjectScopedTable)
      .select(columns)
      .eq('project_id', projectId)
      .in('id', normalizedIds),
  )
}

const defaultDataSource: ProjectStartReadinessDataSource = {
  async loadProject({ projectId, companyId }) {
    let query = (supabase as any)
      .from('projects')
      .select('id, company_id, owner_id, metadata, updated_at')
      .eq('id', projectId)
    if (companyId) query = query.eq('company_id', companyId)
    const rows = await readSupabaseRows<ProjectStartReadinessProject>(query)
    return rows[0] ?? null
  },

  async loadWindowFacts({ projectId, fromDate, throughDate }) {
    const tasks = await readSupabaseRows<ProjectStartReadinessRawRow>(
      (supabase as any)
        .from('tasks')
        .select('id, project_id, title, planned_start_date, planned_end_date, status, progress, actual_start_date, actual_end_date, assignee_user_id, assignee_id, participant_unit_id, drawing_required, material_required, acceptance_required, updated_at')
        .eq('project_id', projectId)
        .gte('planned_start_date', fromDate)
        .lte('planned_start_date', throughDate)
        .is('actual_start_date', null)
        .order('planned_start_date', { ascending: true })
        .order('id', { ascending: true }),
    )
    const taskIds = tasks.map((row) => text(row.id)).filter(Boolean)
    if (taskIds.length === 0) return {
      tasks,
      conditions: [],
      obstacles: [],
      dependencies: [],
      dependencyTasks: [],
      entityLinks: [],
      drawingPackages: [],
      drawings: [],
      certificateWorkItems: [],
      acceptancePlans: [],
      preMilestones: [],
      projectMaterials: [],
      participantUnits: [],
      users: [],
    }
    const [conditions, obstacles, dependencies] = await Promise.all([
      readSupabaseRows<ProjectStartReadinessRawRow>(
        (supabase as any).from('task_conditions').select('*').eq('project_id', projectId).in('task_id', taskIds),
      ),
      readSupabaseRows<ProjectStartReadinessRawRow>(
        (supabase as any).from('task_obstacles').select('*').eq('project_id', projectId).in('task_id', taskIds),
      ),
      readSupabaseRows<ProjectStartReadinessRawRow>(
        (supabase as any).from('task_dependencies').select('*').eq('project_id', projectId).in('task_id', taskIds).eq('status', 'active'),
      ),
    ])
    const dependencyIds = dependencies.map((row) => text(row.dependency_task_id)).filter(Boolean)
    const conditionIds = conditions.map((row) => text(row.id)).filter(Boolean)
    const taskLinksPromise = readSupabaseRows<ProjectStartReadinessRawRow>(
      (supabase as any)
        .from('project_entity_links')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'active')
        .eq('target_entity_type', 'task')
        .in('target_entity_id', taskIds),
    )
    const conditionLinksPromise = conditionIds.length === 0
      ? Promise.resolve([] as ProjectStartReadinessRawRow[])
      : readSupabaseRows<ProjectStartReadinessRawRow>(
          (supabase as any)
            .from('project_entity_links')
            .select('*')
            .eq('project_id', projectId)
            .eq('status', 'active')
            .eq('target_entity_type', 'task_condition')
            .in('target_entity_id', conditionIds),
        )
    const [taskLinks, conditionLinks] = await Promise.all([taskLinksPromise, conditionLinksPromise])
    const entityLinks = [...taskLinks, ...conditionLinks]
    const sourceIdsByType = (type: string) => unique([
      ...entityLinks
        .filter((row) => knownStartReadinessSourceType(row.source_entity_type) === type)
        .map((row) => text(row.source_entity_id)),
      ...conditions
        .filter((row) => knownStartReadinessSourceType(row.source_entity_type) === type)
        .map((row) => text(row.source_entity_id)),
      ...conditions
        .filter((row) => knownStartReadinessSourceType(row.source_type) === type)
        .map((row) => text(row.source_ref_id)),
    ].filter(Boolean))
    const [dependencyTasks, drawingPackages, drawings, certificateWorkItems, acceptancePlans, preMilestones, projectMaterials] = await Promise.all([
      dependencyIds.length === 0
        ? Promise.resolve([] as ProjectStartReadinessRawRow[])
        : readSupabaseRows<ProjectStartReadinessRawRow>(
            (supabase as any)
              .from('tasks')
              .select('id, title, status, progress, actual_end_date, planned_end_date, updated_at')
              .eq('project_id', projectId)
              .in('id', unique(dependencyIds)),
          ),
      readProjectScopedRows<ProjectStartReadinessRawRow>('drawing_packages', 'id, package_code, package_name, status, is_ready_for_construction, updated_at', projectId, sourceIdsByType('drawing_package')),
      readProjectScopedRows<ProjectStartReadinessRawRow>('construction_drawings', 'id, drawing_name, drawing_code, status, is_current_version, is_ready_for_construction, updated_at', projectId, sourceIdsByType('construction_drawing')),
      readProjectScopedRows<ProjectStartReadinessRawRow>('certificate_work_items', 'id, item_code, item_name, status, is_blocked, block_reason, next_action, next_action_due_date, updated_at', projectId, sourceIdsByType('certificate_work_item')),
      readProjectScopedRows<ProjectStartReadinessRawRow>('acceptance_plans', 'id, acceptance_name, status, planned_date, updated_at', projectId, sourceIdsByType('acceptance_plan')),
      readProjectScopedRows<ProjectStartReadinessRawRow>('pre_milestones', 'id, milestone_name, status, planned_date, updated_at', projectId, sourceIdsByType('pre_milestone')),
      readProjectScopedRows<ProjectStartReadinessRawRow>('project_materials', 'id, material_name, actual_arrival_date, expected_arrival_date, updated_at', projectId, unique([
        ...conditions.map((row) => text(row.source_ref_id)).filter(Boolean),
        ...sourceIdsByType('project_material'),
      ])),
    ])
    const participantUnitIds = unique([
      ...tasks.map((row) => text(row.participant_unit_id)),
      ...conditions.map((row) => text(row.participant_unit_id)),
    ].filter(Boolean))
    const userIds = unique(tasks.map((row) => text(row.assignee_user_id) || text(row.assignee_id)).filter(Boolean))
    const [participantUnits, users] = await Promise.all([
      participantUnitIds.length === 0
        ? Promise.resolve([] as ProjectStartReadinessRawRow[])
        : readSupabaseRows<ProjectStartReadinessRawRow>(
            (supabase as any).from('participant_units').select('id, unit_name').eq('project_id', projectId).in('id', participantUnitIds),
          ),
      userIds.length === 0
        ? Promise.resolve([] as ProjectStartReadinessRawRow[])
        : readSupabaseRows<ProjectStartReadinessRawRow>(
            (supabase as any).from('users').select('id, username, display_name, email').in('id', userIds),
          ),
    ])
    return {
      tasks,
      conditions,
      obstacles,
      dependencies,
      dependencyTasks,
      entityLinks,
      drawingPackages,
      drawings,
      certificateWorkItems,
      acceptancePlans,
      preMilestones,
      projectMaterials,
      participantUnits,
      users,
    }
  },
}

export interface GetProjectStartReadinessInput {
  projectId: string
  companyId?: string | null
  asOfDate?: string | null
  now?: Date
}

export interface GetProjectStartReadinessDependencies {
  dataSource?: ProjectStartReadinessDataSource
  resolveCalendar?: (input: { projectId: string }) => Promise<ConstructionCalendarContext>
}

export async function getProjectStartReadiness(
  input: GetProjectStartReadinessInput,
  dependencies: GetProjectStartReadinessDependencies = {},
): Promise<ProjectStartReadinessReadModel> {
  const projectId = text(input.projectId)
  if (!projectId) throw new ProjectStartReadinessScopeError(projectId)
  const companyId = nullableText(input.companyId)
  const dataSource = dependencies.dataSource ?? defaultDataSource
  const project = await dataSource.loadProject({ projectId, companyId })
  if (!project || text(project.id) !== projectId || (companyId && nullableText(project.company_id) !== companyId)) {
    throw new ProjectStartReadinessScopeError(projectId)
  }
  const resolveCalendar = dependencies.resolveCalendar ?? ((calendarInput: { projectId: string }) => resolveConstructionCalendarContext(calendarInput))
  const calendar = await resolveCalendar({ projectId })
  const timezone = resolveTimezone(project, calendar)
  const requestedAsOf = nullableText(input.asOfDate)
  const asOfDate = requestedAsOf
    ? requestedAsOf
    : businessDateKey(input.now ?? new Date(), timezone.timezone)
  if (!isValidDateOnly(asOfDate)) throw new Error('project start-readiness asOfDate must be YYYY-MM-DD')
  const throughDate = addCalendarDays(asOfDate, PROJECT_START_READINESS_WINDOW_DAYS - 1)
  const facts = await dataSource.loadWindowFacts({ projectId, companyId, fromDate: asOfDate, throughDate })
  const evaluatedAt = (input.now ?? new Date()).toISOString()
  const identityReason = timezone.availability === 'unavailable'
    ? 'project_business_timezone_unavailable'
    : nullableText(calendar.unavailableReason)
  const calendarIdentity = buildCalendarIdentity(calendar, timezone, identityReason)
  const calendarIdentityAvailable = calendarIdentity.availability === 'available'
  const dateKeys = Array.from({ length: PROJECT_START_READINESS_WINDOW_DAYS }, (_, index) => addCalendarDays(asOfDate, index))
  const items = facts.tasks
    .filter((task) => isValidDateOnly(text(task.planned_start_date).slice(0, 10)))
    .filter((task) => !isCompletedTask(task))
    .map((task) => buildItem(task, facts, calendarIdentity, asOfDate, evaluatedAt))
  const readyTaskCount = items.filter((item) => item.readinessState === 'ready').length
  const blockedTaskCount = items.filter((item) => item.readinessState === 'blocked').length
  const attentionTaskCount = items.filter((item) => item.readinessState === 'attention').length
  const blockerTaskCountByType: Partial<Record<StartReadinessBlockerType, number>> = {}
  for (const item of items) {
    for (const [type, blockers] of Object.entries(item.blockingReferences)) {
      if (!blockers || blockers.length === 0) continue
      blockerTaskCountByType[type as StartReadinessBlockerType] = (blockerTaskCountByType[type as StartReadinessBlockerType] ?? 0) + 1
    }
  }
  const productionDateKeys = calendarIdentityAvailable
    ? dateKeys.filter((dateKey) => isConstructionProductionDay(parseConstructionCalendarDate(dateKey)!, calendar))
    : []
  const taskCountOnProductionDates = calendarIdentityAvailable
    ? items.filter((item) => productionDateKeys.includes(item.plannedStartDate)).length
    : null
  const productionMetricAvailability: StartReadinessMetricAvailability = calendarIdentityAvailable ? 'ready' : 'source_unavailable'
  const productionUnavailableReason = calendarIdentityAvailable ? null : calendarIdentity.unavailableReason
  const taskCount = items.length
  const readyRate = taskCount > 0 ? Math.round((readyTaskCount / taskCount) * 10000) / 100 : null
  const metrics: Record<string, StartReadinessMetricValue> = {
    start_readiness_task_count_14d: buildMetric(taskCount, 'count', 'ready'),
    start_readiness_ready_task_count_14d: buildMetric(readyTaskCount, 'count', 'ready'),
    start_readiness_blocked_task_count_14d: buildMetric(blockedTaskCount, 'count', 'ready'),
    start_readiness_attention_task_count_14d: buildMetric(attentionTaskCount, 'count', 'ready'),
    start_readiness_ready_rate_14d: buildMetric(readyRate, 'percent', taskCount > 0 ? 'ready' : 'insufficient_data'),
    start_readiness_production_date_count_14d: buildMetric(calendarIdentityAvailable ? productionDateKeys.length : null, 'construction_production_day', productionMetricAvailability, productionUnavailableReason),
  }
  const sourceUpdatedAtValue = sourceUpdatedAt(
    project.updated_at,
    ...items.map((item) => item.freshness.sourceUpdatedAt),
  )
  const freshness = { asOf: asOfDate, evaluatedAt, sourceUpdatedAt: sourceUpdatedAtValue }
  return {
    project: { projectId, companyId: nullableText(project.company_id), ownerId: nullableText(project.owner_id) },
    window: {
      fromDate: asOfDate,
      throughDate,
      calendarDateCount: PROJECT_START_READINESS_WINDOW_DAYS,
      timezone: timezone.timezone,
      timezoneAvailability: timezone.availability,
    },
    dateVisibility: { availability: 'available', unit: 'calendar_date' },
    calendarIdentity,
    productionDayMetrics: {
      availability: calendarIdentityAvailable ? 'ready' : 'source_unavailable',
      productionDateCount: calendarIdentityAvailable ? productionDateKeys.length : null,
      taskCountOnProductionDates,
      unit: 'construction_production_day',
      unavailableReason: productionUnavailableReason,
    },
    summary: { taskCount, readyTaskCount, blockedTaskCount, attentionTaskCount, blockerTaskCountByType },
    metrics,
    items,
    freshness,
  }
}

export { defaultDataSource as projectStartReadinessDataSource }
