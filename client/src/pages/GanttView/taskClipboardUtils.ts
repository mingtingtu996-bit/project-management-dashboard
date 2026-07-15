import type { EngineeringObject } from '@/services/engineeringObjectsApi'
import type { EngineeringObjectLookupOption } from '@/components/planning/lookups/EngineeringObjectLookup'
import type { PlanningTreeCellUpdate, PlanningTreeClipboardRow } from '@/components/planning/PlanningTreeView'
import { getTaskProgressReadOnlyReason, type Task } from '../GanttViewTypes'
import type { ParticipantUnitRecord } from './ParticipantUnitsDialog'
import type { TaskTableDraftPatches } from './taskDraftUtils'

type TaskClipboardDraftPatch = Record<string, unknown>

export function toDateValue(baseDate?: string | null): string {
  const basis = baseDate ? new Date(baseDate) : new Date()
  if (Number.isNaN(basis.getTime())) return ''
  return basis.toISOString().slice(0, 10)
}

export function normalizeClipboardDateValue(value?: string | null): string {
  const text = String(value ?? '').trim()
  if (!text || text === '-') return toDateValue()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const normalized = text.replace(/\//g, '-').replace(/\./g, '-')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return toDateValue()
  return parsed.toISOString().slice(0, 10)
}

export function normalizeClipboardProgressValue(value?: number | null): number {
  if (!Number.isFinite(Number(value))) return 0
  return Math.max(0, Math.min(100, Math.round(Number(value))))
}

function normalizePlanningLookupLabel(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export function findParticipantUnitForPlanningPaste(units: ParticipantUnitRecord[], label: unknown) {
  const normalized = normalizePlanningLookupLabel(label)
  if (!normalized) return null
  return units.find((unit) => {
    return normalizePlanningLookupLabel(unit.id) === normalized ||
      normalizePlanningLookupLabel(unit.unit_name) === normalized
  }) ?? null
}

export function findEngineeringObjectForPlanningPaste(objects: EngineeringObject[], label: unknown) {
  const normalized = normalizePlanningLookupLabel(label)
  if (!normalized) return null
  return objects.find((object) => {
    if (object.status === 'inactive') return false
    return normalizePlanningLookupLabel(object.id) === normalized ||
      normalizePlanningLookupLabel(object.objectName) === normalized ||
      normalizePlanningLookupLabel(object.objectCode) === normalized ||
      normalizePlanningLookupLabel(object.path) === normalized ||
      normalizePlanningLookupLabel(`${object.objectCode} ${object.objectName}`) === normalized
  }) ?? null
}

export function getTaskEngineeringObjectIds(task?: Task | null) {
  if (!task) return []
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

export function getDetailDrawerPredecessors(task: Task | null | undefined, taskMap: Map<string, Task>) {
  const predecessorIds = Array.isArray(task?.dependencies)
    ? task.dependencies.map((value) => String(value ?? '').trim()).filter(Boolean)
    : []
  return predecessorIds.map((taskId) => taskMap.get(taskId) ?? ({ id: taskId, title: `任务 ${taskId.slice(0, 8)}` } as Task))
}

export function getDetailDrawerScopeObjects(task: Task | null | undefined, engineeringObjects: EngineeringObject[]) {
  const objectById = new Map(engineeringObjects.map((object) => [object.id, object]))
  return Array.from(new Set(getTaskEngineeringObjectIds(task)))
    .map((objectId) => objectById.get(objectId) ?? {
      id: objectId,
      objectCode: objectId.slice(0, 8),
      objectName: '未加载范围对象',
      objectType: 'physical_zone',
      metadata: { unresolved_scope_object: true },
    })
}

export function getEngineeringObjectLookupOptions(engineeringObjects: EngineeringObject[]): EngineeringObjectLookupOption[] {
  return engineeringObjects.map((object) => ({
    id: object.id,
    objectName: object.objectName || object.objectCode || object.id,
    objectCode: object.objectCode,
    objectType: object.objectType,
  }))
}

export function getEngineeringObjectLabelsById(engineeringObjects: EngineeringObject[]) {
  return Object.fromEntries(
    engineeringObjects.map((object) => [
      object.id,
      object.objectName || object.objectCode || object.id,
    ]),
  )
}

export function buildTaskScopePatchFromEngineeringObject(objectId: string | null, object?: EngineeringObject | null) {
  const normalizedObjectId = objectId?.trim() || null
  const patch: Record<string, string | null> = {
    engineering_object_id: normalizedObjectId,
    phase_object_id: null,
    section_object_id: null,
    building_object_id: null,
    basement_object_id: null,
    floor_object_id: null,
    physical_zone_object_id: null,
    functional_area_object_id: null,
  }
  if (!normalizedObjectId) return patch

  switch (object?.objectType) {
    case 'building':
      patch.building_object_id = normalizedObjectId
      break
    case 'basement':
      patch.basement_object_id = normalizedObjectId
      break
    case 'floor':
      patch.floor_object_id = normalizedObjectId
      break
    case 'physical_zone':
      patch.physical_zone_object_id = normalizedObjectId
      break
    case 'functional_area':
      patch.functional_area_object_id = normalizedObjectId
      break
    case 'phase':
      patch.phase_object_id = normalizedObjectId
      break
    case 'section':
      patch.section_object_id = normalizedObjectId
      break
    default:
      break
  }

  return patch
}

export function buildPastedTaskDraftPatches({
  clipboardRows,
  anchorRowId,
  flatList,
  taskTableDraftRows,
  projectId,
  participantUnits,
  engineeringObjects,
  fallbackScopePatch,
}: {
  clipboardRows: PlanningTreeClipboardRow[]
  anchorRowId?: string | null
  flatList: Array<{ id: string; depth: number; parent_id?: string | null }>
  taskTableDraftRows: Task[]
  projectId: string
  participantUnits: ParticipantUnitRecord[]
  engineeringObjects: EngineeringObject[]
  fallbackScopePatch: Record<string, unknown>
}) {
  const nodeById = new Map(flatList.map((node) => [node.id, node]))
  const anchorNode = anchorRowId ? nodeById.get(anchorRowId) ?? null : null
  const anchorDepth = anchorNode ? anchorNode.depth + 1 : 1
  const lastIdByDepth = new Map<number, string>()

  if (anchorNode) {
    lastIdByDepth.set(anchorDepth, anchorNode.id)
    let parentId = anchorNode.parent_id ?? null
    while (parentId) {
      const parentNode = nodeById.get(parentId)
      if (!parentNode) break
      lastIdByDepth.set(parentNode.depth + 1, parentNode.id)
      parentId = parentNode.parent_id ?? null
    }
  }

  const siblingSortCache = new Map<string, number>()
  const nextSortOrder = (parentId: string | null) => {
    const key = parentId ?? '__root__'
    const current = siblingSortCache.get(key)
    if (typeof current === 'number') {
      const next = current + 1
      siblingSortCache.set(key, next)
      return next
    }
    const maxExisting = taskTableDraftRows
      .filter((task) => (task.parent_id ?? null) === parentId)
      .reduce((max, task) => Math.max(max, Number(task.sort_order ?? -1)), -1)
    const next = maxExisting + 1
    siblingSortCache.set(key, next)
    return next
  }

  const createdIds: string[] = []
  const createdDraftPatches: TaskTableDraftPatches = {}
  let skippedUnitCount = 0
  let skippedScopeCount = 0

  for (const [index, row] of clipboardRows.entries()) {
    const rowDepth = Math.max(1, Math.min(10, Number(row.depth ?? anchorDepth) || anchorDepth))
    const parentId = rowDepth > 1 ? lastIdByDepth.get(rowDepth - 1) ?? null : null
    let startDate = normalizeClipboardDateValue(row.plannedStartDate)
    let endDate = normalizeClipboardDateValue(row.plannedEndDate || row.plannedStartDate)
    if (new Date(endDate) < new Date(startDate)) {
      endDate = startDate
    }

    const progress = normalizeClipboardProgressValue(row.targetProgress)
    const matchedParticipantUnit = row.unitLabel
      ? findParticipantUnitForPlanningPaste(participantUnits, row.unitLabel)
      : null
    if (row.unitLabel?.trim() && !matchedParticipantUnit) skippedUnitCount += 1
    const matchedEngineeringObject = row.scopeLabel
      ? findEngineeringObjectForPlanningPaste(engineeringObjects, row.scopeLabel)
      : null
    if (row.scopeLabel?.trim() && !matchedEngineeringObject) skippedScopeCount += 1
    const scopePatch = matchedEngineeringObject
      ? buildTaskScopePatchFromEngineeringObject(matchedEngineeringObject.id, matchedEngineeringObject)
      : fallbackScopePatch
    const clientRowId = `paste-task-${Date.now()}-${index}`
    createdDraftPatches[clientRowId] = {
      __draftCreated: true,
      project_id: projectId,
      title: row.title || `施工任务 ${index + 1}`,
      status: progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'todo',
      priority: 'medium',
      start_date: startDate,
      end_date: endDate,
      planned_start_date: startDate,
      planned_end_date: endDate,
      progress,
      assignee: row.assigneeLabel || '',
      assignee_name: row.assigneeLabel || '',
      participant_unit_id: matchedParticipantUnit?.id ?? null,
      parent_id: parentId,
      sort_order: nextSortOrder(parentId),
      wbs_level: rowDepth - 1,
      is_milestone: Boolean(row.isMilestone),
      milestone_level: row.isMilestone ? 3 : undefined,
      dependencies: [],
      updated_at: new Date().toISOString(),
      ...scopePatch,
    }
    createdIds.push(clientRowId)
    lastIdByDepth.set(rowDepth, clientRowId)
    Array.from(lastIdByDepth.keys()).forEach((depth) => {
      if (depth > rowDepth) lastIdByDepth.delete(depth)
    })
  }

  return { createdIds, createdDraftPatches, skippedUnitCount, skippedScopeCount }
}

export function buildTaskFillDraftPatch(
  row: PlanningTreeClipboardRow,
  {
    participantUnits,
    engineeringObjects,
    rowCount,
  }: {
    participantUnits: ParticipantUnitRecord[]
    engineeringObjects: EngineeringObject[]
    rowCount: number
  },
) {
  const patch: TaskClipboardDraftPatch = {}
  if (row.title) patch.title = row.title
  if (row.plannedStartDate) {
    const startDate = normalizeClipboardDateValue(row.plannedStartDate)
    patch.start_date = startDate
    patch.planned_start_date = startDate
  }
  if (row.plannedEndDate) {
    const endDate = normalizeClipboardDateValue(row.plannedEndDate)
    patch.end_date = endDate
    patch.planned_end_date = endDate
  }
  if (row.targetProgress !== null && row.targetProgress !== undefined) {
    const progress = normalizeClipboardProgressValue(row.targetProgress)
    patch.progress = progress
    patch.status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'todo'
  }
  if (row.assigneeLabel !== null && row.assigneeLabel !== undefined) {
    patch.assignee_name = row.assigneeLabel || null
    patch.assignee = row.assigneeLabel || null
    patch.assignee_user_id = null
  }

  let skippedUnitCount = 0
  if (row.unitLabel !== null && row.unitLabel !== undefined) {
    const matchedParticipantUnit = findParticipantUnitForPlanningPaste(participantUnits, row.unitLabel)
    if (matchedParticipantUnit) {
      patch.participant_unit_id = matchedParticipantUnit.id
    } else if (row.unitLabel.trim()) {
      skippedUnitCount += rowCount
    } else {
      patch.participant_unit_id = null
    }
  }

  let skippedScopeCount = 0
  if (row.scopeLabel !== null && row.scopeLabel !== undefined) {
    const matchedEngineeringObject = findEngineeringObjectForPlanningPaste(engineeringObjects, row.scopeLabel)
    if (matchedEngineeringObject) {
      Object.assign(patch, buildTaskScopePatchFromEngineeringObject(matchedEngineeringObject.id, matchedEngineeringObject))
    } else if (row.scopeLabel.trim()) {
      skippedScopeCount += rowCount
    } else {
      Object.assign(patch, buildTaskScopePatchFromEngineeringObject(null))
    }
  }
  if (row.isMilestone !== undefined) {
    patch.is_milestone = row.isMilestone
    patch.milestone_level = row.isMilestone ? 3 : null
  }

  return { patch, skippedUnitCount, skippedScopeCount }
}

export function removeReadOnlyProgressDraftPatch(patch: TaskClipboardDraftPatch, task?: Task | null) {
  const nextPatch = { ...patch }
  if ('progress' in nextPatch && getTaskProgressReadOnlyReason(task?.progress_method)) {
    delete nextPatch.progress
    delete nextPatch.status
    return { patch: nextPatch, skippedProgress: true }
  }
  return { patch: nextPatch, skippedProgress: false }
}

export function buildTaskCellDraftPatch(
  rowUpdates: PlanningTreeCellUpdate[],
  task: Task | undefined,
  {
    participantUnits,
    engineeringObjects,
  }: {
    participantUnits: ParticipantUnitRecord[]
    engineeringObjects: EngineeringObject[]
  },
) {
  const patch: TaskClipboardDraftPatch = {}
  const progressReadOnlyReason = getTaskProgressReadOnlyReason(task?.progress_method)
  let skippedProgressCount = 0
  let skippedUnitCount = 0
  let skippedScopeCount = 0

  rowUpdates.forEach((update) => {
    const value = update.value.trim()
    if (update.field === 'title') {
      if (value) patch.title = value
    } else if (update.field === 'start') {
      const startDate = value ? normalizeClipboardDateValue(value) : null
      patch.start_date = startDate
      patch.planned_start_date = startDate
    } else if (update.field === 'end') {
      const endDate = value ? normalizeClipboardDateValue(value) : null
      patch.end_date = endDate
      patch.planned_end_date = endDate
    } else if (update.field === 'progress') {
      if (progressReadOnlyReason) {
        skippedProgressCount += 1
        return
      }
      const progress = normalizeClipboardProgressValue(Number.parseInt(value.replace('%', ''), 10))
      patch.progress = progress
      patch.status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'todo'
    } else if (update.field === 'assignee') {
      patch.assignee_name = value || null
      patch.assignee = value || null
      patch.assignee_user_id = null
    } else if (update.field === 'unit') {
      if (!value) {
        patch.participant_unit_id = null
        return
      }
      const matchedParticipantUnit = findParticipantUnitForPlanningPaste(participantUnits, value)
      if (!matchedParticipantUnit) {
        skippedUnitCount += 1
        return
      }
      patch.participant_unit_id = matchedParticipantUnit.id
    } else if (update.field === 'scope') {
      if (!value) {
        Object.assign(patch, buildTaskScopePatchFromEngineeringObject(null))
        return
      }
      const matchedEngineeringObject = findEngineeringObjectForPlanningPaste(engineeringObjects, value)
      if (!matchedEngineeringObject) {
        skippedScopeCount += 1
        return
      }
      Object.assign(patch, buildTaskScopePatchFromEngineeringObject(matchedEngineeringObject.id, matchedEngineeringObject))
    } else if (update.field === 'milestone') {
      const normalized = value.toLowerCase()
      const isMilestone = Boolean(value) && !['0', 'false', 'no', 'n'].includes(normalized)
      patch.is_milestone = isMilestone
      patch.milestone_level = isMilestone ? 3 : null
    }
  })

  return { patch, skippedProgressCount, skippedUnitCount, skippedScopeCount }
}
