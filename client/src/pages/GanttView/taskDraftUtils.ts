import type { PlanningTableOperation } from '@/components/planning/PlanningCommitModel'
import { getTaskProgressReadOnlyReason, type Task } from '../GanttViewTypes'

export type TaskTableDraftPatch = Partial<Task> & {
  __draftCreated?: boolean
  __draftDeleted?: boolean
  __templateGenerateOperation?: PlanningTableOperation
  __templateGenerateRowValues?: Record<string, unknown>
  __templateGeneratePredecessorClientRowIds?: string[]
  predecessor_dependencies?: unknown[]
}

export type TaskTableDraftPatches = Record<string, TaskTableDraftPatch>

export type BatchTaskUpdatePayload = {
  status?: string | null
  assignee_name?: string | null
  assignee_user_id?: string | null
  participant_unit_id?: string | null
  progress?: number | null
  engineering_object_id?: string | null
  phase_object_id?: string | null
  section_object_id?: string | null
  building_object_id?: string | null
  basement_object_id?: string | null
  floor_object_id?: string | null
  physical_zone_object_id?: string | null
  functional_area_object_id?: string | null
  dateShiftDays?: number | null
}

export function cloneTaskTableDraftPatches(patches: TaskTableDraftPatches): TaskTableDraftPatches {
  return Object.fromEntries(
    Object.entries(patches).map(([taskId, patch]) => [taskId, { ...patch }]),
  )
}

export function stripTaskTableDraftMeta(patch: TaskTableDraftPatch): Partial<Task> {
  const {
    __draftCreated,
    __draftDeleted,
    __templateGenerateOperation,
    __templateGenerateRowValues,
    __templateGeneratePredecessorClientRowIds,
    ...values
  } = patch
  void __draftCreated
  void __draftDeleted
  void __templateGenerateOperation
  void __templateGenerateRowValues
  void __templateGeneratePredecessorClientRowIds
  return values
}

export function buildTaskTableDraftDeletedIds(patches: TaskTableDraftPatches): Set<string> {
  return new Set(
    Object.entries(patches)
      .filter(([, patch]) => patch.__draftDeleted)
      .map(([taskId]) => taskId),
  )
}

export function buildTaskTableDraftRows({
  tasks,
  draftPatches,
  deletedIds,
  projectId,
}: {
  tasks: Task[]
  draftPatches: TaskTableDraftPatches
  deletedIds: Set<string>
  projectId?: string | null
}): Task[] {
  const baseRows = tasks
    .filter((task) => !deletedIds.has(task.id))
    .map((task) => ({
      ...task,
      ...stripTaskTableDraftMeta(draftPatches[task.id] ?? {}),
    } as Task))
  const createdRows = Object.entries(draftPatches)
    .filter(([, patch]) => patch.__draftCreated && !patch.__draftDeleted)
    .map(([taskId, patch]) => ({
      ...stripTaskTableDraftMeta(patch),
      id: taskId,
      project_id: projectId,
    } as Task))

  return [...baseRows, ...createdRows]
}

export function getTemplateGenerateOperationKey(operation?: PlanningTableOperation | null) {
  const record = (operation ?? {}) as Record<string, unknown>
  return String(record.generationBatchId ?? record.generation_batch_id ?? record.templateId ?? record.template_id ?? '').trim()
}

export function buildTemplateGeneratedRowUpdateValues(patch: TaskTableDraftPatch) {
  const values = { ...stripTaskTableDraftMeta(patch) } as Record<string, unknown>
  const original = patch.__templateGenerateRowValues ?? {}
  delete values.id
  delete values.project_id
  delete values.dependencies
  delete values.predecessor_dependencies
  delete values.parent_id
  delete values.sort_order

  return Object.fromEntries(
    Object.entries(values).filter(([field, value]) => (
      JSON.stringify(normalizeTaskDraftCompareValue(value))
        !== JSON.stringify(normalizeTaskDraftCompareValue(original[field]))
    )),
  )
}

export function haveTemplateGeneratedDependenciesChanged(patch: TaskTableDraftPatch) {
  const current = normalizeTaskDraftDependencyIds(patch.dependencies)
  if (current === null) return false
  const original = patch.__templateGeneratePredecessorClientRowIds ?? []
  return JSON.stringify(current) !== JSON.stringify(original)
}

export function buildTaskTableDraftOperations(
  patches: TaskTableDraftPatches,
  tasks: Task[],
): { operations: PlanningTableOperation[]; skippedProgressCount: number } {
  let skippedProgressCount = 0
  const emittedTemplateGenerateOperations = new Set<string>()
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const operations = Object.entries(patches)
    .filter(([, patch]) => Object.keys(patch).length > 0)
    .flatMap<PlanningTableOperation>(([taskId, patch]) => {
      const predecessorTaskIds = normalizeTaskDraftDependencyIds(patch.dependencies)
      if (patch.__draftCreated) {
        const templateGenerateOperation = patch.__templateGenerateOperation
        if (templateGenerateOperation) {
          const templateOperations: PlanningTableOperation[] = []
          const operationKey = getTemplateGenerateOperationKey(templateGenerateOperation)
          if (operationKey && !emittedTemplateGenerateOperations.has(operationKey)) {
            emittedTemplateGenerateOperations.add(operationKey)
            templateOperations.push(templateGenerateOperation)
          }

          if (patch.__draftDeleted) {
            templateOperations.push({
              type: 'delete_row' as const,
              rowId: taskId,
            } satisfies PlanningTableOperation)
            return templateOperations
          }

          const changedValues = buildTemplateGeneratedRowUpdateValues(patch)
          if (Object.keys(changedValues).length > 0) {
            templateOperations.push({
              type: 'update_row' as const,
              rowId: taskId,
              values: changedValues,
            })
          }

          const hasMoveParent = patch.parent_id !== patch.__templateGenerateRowValues?.parent_id
          const hasMoveSortOrder = patch.sort_order !== patch.__templateGenerateRowValues?.sort_order
          if (hasMoveParent || hasMoveSortOrder) {
            templateOperations.push({
              type: 'move_row' as const,
              rowId: taskId,
              parentId: (patch.parent_id as string | null | undefined) ?? null,
              sortOrder: Number(patch.sort_order ?? 0),
            })
          }

          if (haveTemplateGeneratedDependenciesChanged(patch)) {
            templateOperations.push({
              type: 'set_predecessors' as const,
              rowId: taskId,
              predecessorTaskIds: predecessorTaskIds ?? [],
            })
          }

          return templateOperations
        }

        if (patch.__draftDeleted) return []
        const values: Record<string, unknown> = { ...stripTaskTableDraftMeta(patch) }
        delete values.id
        delete values.project_id
        delete values.dependencies
        const createOperations: PlanningTableOperation[] = [{
          type: 'create_row' as const,
          clientRowId: taskId,
          parentId: (values.parent_id as string | null | undefined) ?? null,
          sortOrder: Number(values.sort_order ?? 0),
          values,
        }]
        if (predecessorTaskIds && predecessorTaskIds.length > 0) {
          createOperations.push({
            type: 'set_predecessors' as const,
            rowId: taskId,
            predecessorTaskIds,
          })
        }
        return createOperations
      }

      if (patch.__draftDeleted) {
        return [{
          type: 'delete_row' as const,
          rowId: taskId,
        } satisfies PlanningTableOperation]
      }

      const values: Record<string, unknown> = { ...patch }
      delete values.__draftDeleted
      delete values.dependencies
      const hasMoveParent = Object.prototype.hasOwnProperty.call(values, 'parent_id')
      const hasMoveSortOrder = Object.prototype.hasOwnProperty.call(values, 'sort_order')
      const moveParentId = hasMoveParent ? (values.parent_id as string | null | undefined) ?? null : undefined
      const moveSortOrder = hasMoveSortOrder ? Number(values.sort_order ?? 0) : undefined
      delete values.parent_id
      delete values.sort_order

      const task = taskMap.get(taskId)
      if ('progress' in values && getTaskProgressReadOnlyReason(task?.progress_method)) {
        delete values.progress
        skippedProgressCount += 1
      }

      const updateOperations: PlanningTableOperation[] = []
      if (Object.keys(values).length > 0) {
        updateOperations.push({
          type: 'update_row' as const,
          rowId: taskId,
          values,
        })
      }
      if (hasMoveParent || hasMoveSortOrder) {
        updateOperations.push({
          type: 'move_row' as const,
          rowId: taskId,
          parentId: moveParentId,
          sortOrder: moveSortOrder,
        })
      }
      if (predecessorTaskIds) {
        updateOperations.push({
          type: 'set_predecessors' as const,
          rowId: taskId,
          predecessorTaskIds,
        })
      }
      return updateOperations
    })

  return { operations, skippedProgressCount }
}

function normalizeTaskDraftCompareValue(value: unknown) {
  if (value === undefined || value === '') return null
  return value
}

export function normalizeTaskDraftDependencyIds(value: unknown): string[] | null {
  if (value === undefined) return null
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

export function hasTaskTableDraftPatches(patches: TaskTableDraftPatches) {
  return Object.values(patches).some((patch) => Object.keys(patch).length > 0)
}

export function areTaskTableDraftPatchesEqual(left: TaskTableDraftPatches, right: TaskTableDraftPatches) {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function compactTaskTableDraftPatches(patches: TaskTableDraftPatches, tasks: Task[]): TaskTableDraftPatches {
  const taskMap = new Map(tasks.map((task) => [task.id, task]))
  const compacted: TaskTableDraftPatches = {}

  for (const [taskId, patch] of Object.entries(patches)) {
    const baseTask = taskMap.get(taskId)
    if (patch.__draftCreated) {
      if (!patch.__draftDeleted) compacted[taskId] = { ...patch }
      continue
    }
    if (patch.__draftDeleted) {
      if (baseTask) compacted[taskId] = { __draftDeleted: true }
      continue
    }

    const nextPatch: TaskTableDraftPatch = {}
    for (const [field, value] of Object.entries(patch)) {
      if (field === '__draftDeleted') continue
      const baseValue = baseTask ? (baseTask as unknown as Record<string, unknown>)[field] : undefined
      if (normalizeTaskDraftCompareValue(baseValue) !== normalizeTaskDraftCompareValue(value)) {
        ;(nextPatch as Record<string, unknown>)[field] = value
      }
    }
    if (Object.keys(nextPatch).length > 0) compacted[taskId] = nextPatch
  }

  return compacted
}

export function buildFirstTaskDraftPatch({
  scopePatch,
  taskTableDraftRows,
}: {
  scopePatch: Record<string, unknown>
  taskTableDraftRows: Task[]
}) {
  const title = '新任务'
  const today = new Date().toISOString().slice(0, 10)
  const rootSortOrder = taskTableDraftRows
    .filter((task) => !task.parent_id)
    .reduce((max, task) => Math.max(max, Number(task.sort_order ?? -1)), -1) + 1
  const clientRowId = `empty-first-task-${Date.now()}`
  const patch = {
    __draftCreated: true,
    title,
    status: 'todo',
    priority: 'medium',
    start_date: today,
    end_date: today,
    planned_start_date: today,
    planned_end_date: today,
    progress: 0,
    parent_id: null,
    sort_order: rootSortOrder,
    ...scopePatch,
  } as TaskTableDraftPatch

  return { clientRowId, title, patch }
}

export function buildTaskRowDeletionPlan({
  rowIds,
  taskTableDraftRows,
  flatList,
}: {
  rowIds: string[]
  taskTableDraftRows: Task[]
  flatList: Array<{ id: string; depth: number }>
}) {
  const idsToDelete = new Set(rowIds)
  let changed = true
  while (changed) {
    changed = false
    for (const task of taskTableDraftRows) {
      if (task.parent_id && idsToDelete.has(task.parent_id) && !idsToDelete.has(task.id)) {
        idsToDelete.add(task.id)
        changed = true
      }
    }
  }

  const orderedNodes = flatList
    .filter((node) => idsToDelete.has(node.id))
    .sort((left, right) => right.depth - left.depth)

  return { idsToDelete, orderedNodes }
}

export function buildBatchTaskDraftPatches({
  current,
  selectedIds,
  tasks,
  payload,
}: {
  current: TaskTableDraftPatches
  selectedIds: Iterable<string>
  tasks: Task[]
  payload: BatchTaskUpdatePayload
}) {
  const next = cloneTaskTableDraftPatches(current)
  let changedCount = 0
  let skippedProgressCount = 0

  Array.from(selectedIds).forEach((taskId) => {
    const task = tasks.find((item) => item.id === taskId)
    const progressReadOnlyReason = getTaskProgressReadOnlyReason(task?.progress_method)
    const draft = current[taskId] ?? {}
    const patch: Record<string, unknown> = {}
    if (payload.status !== undefined && payload.status !== null) {
      const status = normalizeBatchEditableStatus(payload.status)
      patch.status = status
      if (status === 'completed' && !progressReadOnlyReason) patch.progress = 100
    }
    if (payload.assignee_name !== undefined) {
      patch.assignee_name = payload.assignee_name || undefined
      patch.assignee = payload.assignee_name || undefined
    }
    if (payload.assignee_user_id !== undefined) {
      patch.assignee_user_id = payload.assignee_user_id || null
    }
    if (payload.participant_unit_id !== undefined) {
      patch.participant_unit_id = payload.participant_unit_id || null
    }
    if (payload.progress !== undefined && payload.progress !== null) {
      if (progressReadOnlyReason) {
        skippedProgressCount += 1
      } else {
        const progress = normalizeBatchProgressValue(payload.progress)
        patch.progress = progress
        patch.status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'todo'
      }
    }
    if (payload.engineering_object_id !== undefined) {
      patch.engineering_object_id = payload.engineering_object_id || null
    }
    if (payload.building_object_id !== undefined) {
      patch.building_object_id = payload.building_object_id || null
    }
    if (payload.basement_object_id !== undefined) {
      patch.basement_object_id = payload.basement_object_id || null
    }
    if (payload.floor_object_id !== undefined) {
      patch.floor_object_id = payload.floor_object_id || null
    }
    if (payload.physical_zone_object_id !== undefined) {
      patch.physical_zone_object_id = payload.physical_zone_object_id || null
    }
    if (payload.functional_area_object_id !== undefined) {
      patch.functional_area_object_id = payload.functional_area_object_id || null
    }
    if (payload.phase_object_id !== undefined) {
      patch.phase_object_id = payload.phase_object_id || null
    }
    if (payload.section_object_id !== undefined) {
      patch.section_object_id = payload.section_object_id || null
    }
    if (payload.dateShiftDays && task) {
      const startDate = shiftTaskDraftDate(
        (draft.start_date ?? draft.planned_start_date ?? task.start_date ?? task.planned_start_date ?? null) as string | null,
        payload.dateShiftDays,
      )
      const endDate = shiftTaskDraftDate(
        (draft.end_date ?? draft.planned_end_date ?? task.end_date ?? task.planned_end_date ?? null) as string | null,
        payload.dateShiftDays,
      )
      patch.start_date = startDate
      patch.planned_start_date = startDate
      patch.end_date = endDate
      patch.planned_end_date = endDate
    }
    if (Object.keys(patch).length === 0) return
    next[taskId] = { ...(next[taskId] ?? {}), ...(patch as TaskTableDraftPatch) }
    changedCount += 1
  })

  return { nextPatches: next, changedCount, skippedProgressCount }
}

export function buildBatchCompleteDraftPatches({
  current,
  selectedIds,
  tasks,
}: {
  current: TaskTableDraftPatches
  selectedIds: Iterable<string>
  tasks: Task[]
}) {
  const next = cloneTaskTableDraftPatches(current)
  let alreadyDone = 0
  let changedCount = 0

  for (const taskId of selectedIds) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) continue
    if (task.status === 'completed') {
      alreadyDone += 1
      continue
    }
    const progressReadOnlyReason = getTaskProgressReadOnlyReason(task.progress_method)
    next[task.id] = {
      ...(next[task.id] ?? {}),
      status: 'completed',
      ...(progressReadOnlyReason ? {} : { progress: 100 }),
    }
    changedCount += 1
  }

  return { nextPatches: next, changedCount, alreadyDone }
}

export function buildDragSortDraftPatches({
  current,
  flatList,
  taskTableDraftRows,
  activeId,
  overId,
}: {
  current: TaskTableDraftPatches
  flatList: Task[]
  taskTableDraftRows: Task[]
  activeId: string
  overId: string
}) {
  const activeIdx = flatList.findIndex((node) => node.id === activeId)
  const overIdx = flatList.findIndex((node) => node.id === overId)
  if (activeIdx === -1 || overIdx === -1) return null

  const activeNode = flatList[activeIdx]
  const overNode = flatList[overIdx]
  const isCrossLevel = activeNode.parent_id !== overNode.parent_id
  if (isCrossLevel && isTaskDescendant(taskTableDraftRows, overNode.id, activeNode.id)) {
    return { blocked: true as const }
  }

  const newParentId = overNode.parent_id
  const targetSiblings = taskTableDraftRows.filter((task) => (task.parent_id || null) === (newParentId || null) && task.id !== activeNode.id)
  const overPos = targetSiblings.findIndex((task) => task.id === overNode.id)
  const insertAt = overPos === -1 ? targetSiblings.length : overPos
  const reordered = [...targetSiblings]
  reordered.splice(insertAt, 0, activeNode)

  const next = cloneTaskTableDraftPatches(current)
  reordered.forEach((task, index) => {
    if (!task.id) return
    next[task.id] = {
      ...(next[task.id] ?? {}),
      parent_id: newParentId,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }
  })
  return { blocked: false as const, nextPatches: next, isCrossLevel }
}

function isTaskDescendant(tasks: Task[], nodeId: string, potentialAncestorId: string): boolean {
  const node = tasks.find((task) => task.id === nodeId)
  if (!node || !node.parent_id) return false
  if (node.parent_id === potentialAncestorId) return true
  return isTaskDescendant(tasks, node.parent_id, potentialAncestorId)
}

function shiftTaskDraftDate(value: string | null | undefined, days: number) {
  if (!days || !value) return value ?? null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function normalizeBatchProgressValue(value?: number | null): number {
  if (!Number.isFinite(Number(value))) return 0
  return Math.max(0, Math.min(100, Math.round(Number(value))))
}

function normalizeBatchEditableStatus(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim()
  if (
    normalized === 'blocked'
    || normalized === '受阻'
    || normalized === 'lagging_mild'
    || normalized === 'lagging_moderate'
    || normalized === 'lagging_severe'
  ) return 'in_progress'
  return normalized || 'todo'
}

export function mapTaskDraftPatchToCellKeys(patch: Partial<Task>) {
  const keys = new Set<string>()
  if ((patch as TaskTableDraftPatch).__draftCreated) keys.add('title')
  if ((patch as TaskTableDraftPatch).__draftDeleted) keys.add('title')
  if (patch.title !== undefined) keys.add('title')
  if (patch.start_date !== undefined || patch.planned_start_date !== undefined) keys.add('start')
  if (patch.end_date !== undefined || patch.planned_end_date !== undefined) keys.add('end')
  if (patch.progress !== undefined || patch.status !== undefined) keys.add('progress')
  if (patch.assignee !== undefined || patch.assignee_name !== undefined || patch.assignee_user_id !== undefined) {
    keys.add('assignee')
  }
  if (patch.participant_unit_id !== undefined || patch.participant_unit_name !== undefined) {
    keys.add('unit')
  }
  if (
    patch.engineering_object_id !== undefined ||
    patch.building_object_id !== undefined ||
    patch.basement_object_id !== undefined ||
    patch.floor_object_id !== undefined ||
    patch.physical_zone_object_id !== undefined ||
    patch.functional_area_object_id !== undefined ||
    patch.phase_object_id !== undefined ||
    patch.section_object_id !== undefined
  ) {
    keys.add('scope')
  }
  if (patch.is_milestone !== undefined || patch.milestone_level !== undefined) keys.add('milestone')
  return keys
}
