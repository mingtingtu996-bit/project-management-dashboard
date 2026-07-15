import {
  getPlanItemKindFromMetadata,
  getPlanItemTagsFromMetadata,
  getRowProjectionModeFromMetadata,
  type RowProjectionMode,
} from '@/lib/planItemSemantics'

import type { Task, WBSNode } from '../GanttViewTypes'
import { getTaskWbsNodeType } from '../GanttViewTypes'

type TaskLike = Task | WBSNode

const STRUCTURAL_WBS_NODE_TYPES = new Set(['division', 'sub_division'])
const ITEM_PACK_WBS_NODE_TYPES = new Set(['item_work', 'custom'])
const PROCESS_WBS_NODE_TYPES = new Set(['process', 'activity_step'])
const KEY_GATE_TAGS = new Set(['关键节点', '危大', '专项验收', '竣工验收', '移交', '备案'])
const KEY_SAFETY_CONTROL_ROLES = new Set(['special_plan_control', 'safety_acceptance', 'operation_permit'])

function readMetadata(task: Pick<Task, 'standard_task_metadata'> | null | undefined): Record<string, unknown> {
  const metadata = task?.standard_task_metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : {}
}

function readTaskRecord(task: TaskLike): Record<string, unknown> {
  return task as unknown as Record<string, unknown>
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeSortText(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readMetadataString(metadata: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return normalizeText(metadata[camelKey] ?? metadata[snakeKey])
}

export function getTaskRowProjectionMode(task: TaskLike): RowProjectionMode {
  return getRowProjectionModeFromMetadata(readMetadata(task))
}

export function getTaskExecutionSortKey(task: TaskLike): number | null {
  const metadata = readMetadata(task)
  return readNumber(metadata.executionSortKey ?? metadata.execution_sort_key)
    ?? readNumber(readTaskRecord(task).execution_sort_key)
}

function getTaskStartSortKey(task: TaskLike) {
  return normalizeSortText(task.start_date ?? task.planned_start_date)
}

function getTaskSpatialSortKey(task: TaskLike, labelsById?: Record<string, string>) {
  const objectIds = [
    task.building_object_id,
    task.basement_object_id,
    task.floor_object_id,
    task.physical_zone_object_id,
    task.functional_area_object_id,
    task.engineering_object_id,
  ].map((value) => normalizeText(value)).filter(Boolean)

  if (objectIds.length === 0) return 'zzzzzz'
  return objectIds
    .map((objectId) => normalizeSortText(labelsById?.[objectId] || objectId))
    .join('/')
}

export function isKeyGateMarker(task: TaskLike): boolean {
  const metadata = readMetadata(task)
  const planItemKind = getPlanItemKindFromMetadata(metadata, {
    isMilestone: Boolean(task.is_milestone),
    relationRole: metadata.relationRole ?? metadata.relation_role,
    packType: metadata.packType ?? metadata.pack_type ?? readTaskRecord(task).pack_type,
  })
  const tags = getPlanItemTagsFromMetadata(metadata)
  const durationMode = readMetadataString(metadata, 'durationContributionMode', 'duration_contribution_mode')
  const safetyRole = readMetadataString(metadata, 'safetyControlRole', 'safety_control_role')

  return Boolean(
    task.is_milestone
    || planItemKind === 'milestone'
    || tags.some((tag) => KEY_GATE_TAGS.has(tag))
    || KEY_SAFETY_CONTROL_ROLES.has(safetyRole)
    || durationMode === 'handover_marker'
    || metadata.isAcceptanceMilestone === true
    || metadata.is_acceptance_milestone === true,
  )
}

function isStructuralSummaryRow(task: TaskLike): boolean {
  const wbsType = getTaskWbsNodeType(task)
  if (!wbsType) return false
  if (STRUCTURAL_WBS_NODE_TYPES.has(wbsType)) return true
  if (ITEM_PACK_WBS_NODE_TYPES.has(wbsType) && (task as WBSNode).children?.length > 0 && task.is_executable !== true) return true
  return false
}

export function shouldShowTaskInMainExecutionList(task: TaskLike): boolean {
  if (!task?.id) return false
  const metadata = readMetadata(task)
  const planItemKind = getPlanItemKindFromMetadata(metadata, {
    isMilestone: Boolean(task.is_milestone),
    relationRole: metadata.relationRole ?? metadata.relation_role,
    packType: metadata.packType ?? metadata.pack_type ?? readTaskRecord(task).pack_type,
  })
  if (planItemKind === 'linked_projection') return false

  const projectionMode = getTaskRowProjectionMode(task)

  if (projectionMode === 'linked_projection' || projectionMode === 'inline_control') return false
  if (projectionMode === 'gate_marker') return isKeyGateMarker(task)
  if (isStructuralSummaryRow(task)) return false

  return true
}

export function getTaskExecutionDisplayDepth(task: TaskLike): number {
  const wbsType = getTaskWbsNodeType(task)
  if (wbsType === 'activity_step') return 3
  if (wbsType === 'process') return 2
  if (wbsType === 'item_work' || wbsType === 'custom') return 1
  if (task.is_milestone || getTaskRowProjectionMode(task) === 'gate_marker') return 1
  return Math.max(1, Math.min(3, Number((task as WBSNode).depth ?? 0) + 1))
}

export function compareTasksByExecutionOrder(
  left: TaskLike,
  right: TaskLike,
  labelsById?: Record<string, string>,
) {
  const leftExecutionSortKey = getTaskExecutionSortKey(left)
  const rightExecutionSortKey = getTaskExecutionSortKey(right)
  if (leftExecutionSortKey !== null || rightExecutionSortKey !== null) {
    if (leftExecutionSortKey === null) return 1
    if (rightExecutionSortKey === null) return -1
    if (leftExecutionSortKey !== rightExecutionSortKey) return leftExecutionSortKey - rightExecutionSortKey
  }

  const leftStart = getTaskStartSortKey(left)
  const rightStart = getTaskStartSortKey(right)
  if (leftStart !== rightStart) return leftStart.localeCompare(rightStart)

  const leftScope = getTaskSpatialSortKey(left, labelsById)
  const rightScope = getTaskSpatialSortKey(right, labelsById)
  if (leftScope !== rightScope) return leftScope.localeCompare(rightScope, 'zh-Hans-CN')

  const leftWbs = normalizeSortText(left.wbs_code)
  const rightWbs = normalizeSortText(right.wbs_code)
  if (leftWbs !== rightWbs) return leftWbs.localeCompare(rightWbs, undefined, { numeric: true })

  return normalizeSortText(left.title).localeCompare(
    normalizeSortText(right.title),
    'zh-Hans-CN',
    { numeric: true },
  )
}
