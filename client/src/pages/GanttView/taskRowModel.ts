import type { AcceptanceImpactItem } from '@/components/planning/AcceptanceImpactChip'
import { inclusiveDurationDays } from '@/lib/durationDays'
import type { Task, TaskCondition, TaskObstacle } from '../GanttViewTypes'

const HARD_CONDITION_TYPES = new Set(['preceding', 'design', 'drawing', 'certificate', 'certificate_ready'])

export type TaskConditionBreakdown = {
  hardTotal: number
  hardSatisfied: number
  softTotal: number
  softSatisfied: number
}

export function getTaskDurationLabel(start?: string | null, end?: string | null) {
  const duration = inclusiveDurationDays(start, end)
  return duration == null ? '-' : `${duration}天`
}

export function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function getWbsSemanticTitleClass(wbsNodeType?: string | null, fallbackDepth = 0) {
  switch (wbsNodeType) {
    case 'division':
      return 'text-base font-semibold text-slate-950'
    case 'sub_division':
      return 'text-sm font-semibold text-slate-900'
    case 'item_work':
      return 'text-sm font-medium text-slate-900'
    case 'process':
      return 'text-sm font-normal text-slate-800'
    case 'activity_step':
      return 'text-xs font-normal text-slate-700'
    default:
      return fallbackDepth <= 0
        ? 'text-sm font-semibold text-slate-950'
        : fallbackDepth === 1
          ? 'text-sm font-medium text-slate-900'
          : 'text-sm font-normal text-slate-800'
  }
}

export function normalizeDateInput(value?: string | null) {
  return value ? String(value).slice(0, 10) : ''
}

export function normalizeAcceptanceImpactItems(task: Task): AcceptanceImpactItem[] {
  if (!Array.isArray(task.acceptance_impact_summary)) return []
  return task.acceptance_impact_summary
    .map((item) => ({
      id: String(item.id ?? '').trim(),
      name: String(item.name ?? '').trim(),
      status: item.status == null ? undefined : String(item.status),
      statusLabel: item.statusLabel == null ? undefined : String(item.statusLabel),
    }))
    .filter((item) => item.id && item.name)
}

export function hasResponsibleUnit(task: Task) {
  return Boolean(
    task.participant_unit_id
    || task.participant_unit_name?.trim(),
  )
}

export function hasEngineeringScope(task: Task) {
  return Boolean(
    task.engineering_object_id
    || task.building_object_id
    || task.phase_object_id
    || task.section_object_id
    || task.basement_object_id
    || task.floor_object_id
    || task.physical_zone_object_id
    || task.functional_area_object_id,
  )
}

export function isConditionSatisfied(condition: TaskCondition) {
  if (condition.is_satisfied !== undefined && condition.is_satisfied !== null) {
    return Boolean(condition.is_satisfied)
  }
  const status = String((condition as { status?: string | null }).status ?? '').trim().toLowerCase()
  return ['completed', 'satisfied', 'confirmed', '已满足', '已确认'].includes(status)
}

export function isActiveTaskObstacle(obstacle: TaskObstacle) {
  if (obstacle.is_resolved !== undefined && obstacle.is_resolved !== null) {
    return !Boolean(obstacle.is_resolved)
  }
  const status = String(obstacle.status ?? '').trim().toLowerCase()
  return !['resolved', 'closed', '已解决', '已关闭'].includes(status)
}

export function isHardCondition(condition: TaskCondition) {
  return HARD_CONDITION_TYPES.has(String(condition.condition_type ?? '').trim().toLowerCase())
}

export function getPendingHardConditionCount(conditions: TaskCondition[]) {
  return conditions.filter((condition) => isHardCondition(condition) && !isConditionSatisfied(condition)).length
}

export function getTaskConditionBreakdown(
  conditions: TaskCondition[],
  fallback?: { satisfied: number; total: number },
): TaskConditionBreakdown {
  if (conditions.length === 0) {
    return {
      hardTotal: 0,
      hardSatisfied: 0,
      softTotal: fallback?.total ?? 0,
      softSatisfied: fallback?.satisfied ?? 0,
    }
  }

  return conditions.reduce<TaskConditionBreakdown>((summary, condition) => {
    const target = isHardCondition(condition) ? 'hard' : 'soft'
    const satisfied = isConditionSatisfied(condition)
    if (target === 'hard') {
      summary.hardTotal += 1
      if (satisfied) summary.hardSatisfied += 1
    } else {
      summary.softTotal += 1
      if (satisfied) summary.softSatisfied += 1
    }
    return summary
  }, {
    hardTotal: 0,
    hardSatisfied: 0,
    softTotal: 0,
    softSatisfied: 0,
  })
}

export function toInlineConditionItems(conditions: TaskCondition[]) {
  return conditions.map((condition) => ({
    id: condition.id,
    name: condition.name || condition.description || '未命名条件',
    type: isHardCondition(condition) ? 'hard' as const : 'soft' as const,
    isSatisfied: isConditionSatisfied(condition),
    satisfiedAt: condition.satisfied_at ?? undefined,
    sourceDescription: condition.description,
  }))
}

export function getTaskScopeObjectIds(task: Task) {
  return [
    task.phase_object_id,
    task.section_object_id,
    task.building_object_id,
    task.basement_object_id,
    task.floor_object_id,
    task.physical_zone_object_id,
    task.functional_area_object_id,
    task.engineering_object_id,
  ].map((value) => String(value ?? '').trim()).filter(Boolean)
}

export function getTaskScopeLabel(task: Task, labelsById?: Record<string, string>) {
  const labels = Array.from(new Set(getTaskScopeObjectIds(task)))
    .map((objectId) => labelsById?.[objectId] || objectId.slice(0, 8))
    .filter(Boolean)

  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, 2).join(' / ')}${labels.length > 2 ? ` +${labels.length - 2}` : ''}`
}
