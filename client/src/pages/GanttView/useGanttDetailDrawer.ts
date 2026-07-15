import { useCallback, useEffect, useMemo, useState } from 'react'

import type { DrawerSection } from '@/components/planning/PlanningDetailDrawer'
import type { EngineeringObjectLookupOption } from '@/components/planning/lookups/EngineeringObjectLookup'
import type { EngineeringObject } from '@/services/engineeringObjectsApi'

import type { Task, TaskCondition, TaskObstacle } from '../GanttViewTypes'
import {
  findGanttTaskById,
  getRelatedRiskIssueCount,
  getTaskAcceptanceImpactItems,
  getTaskConditionsForTask,
  getTaskObstaclesForTask,
  toDrawerBlockageRecord,
  toDrawerConditionRecord,
  type RelatedRiskIssueSummary,
} from './ganttViewUtils'
import {
  buildTaskScopePatchFromEngineeringObject,
  getDetailDrawerPredecessors,
  getDetailDrawerScopeObjects,
  getEngineeringObjectLookupOptions,
  getTaskEngineeringObjectIds,
} from './taskClipboardUtils'

type UseGanttDetailDrawerInput = {
  canEdit: boolean
  engineeringObjects: EngineeringObject[]
  filteredFlatList: Task[]
  flatList: Task[]
  handleInlineTaskPatchSave: (taskId: string, patch: Record<string, unknown>) => Promise<void>
  onOpenDetailDrawer?: () => void
  projectConditions: TaskCondition[]
  projectObstacles: TaskObstacle[]
  relatedRiskIssueSummaryByTaskId: Map<string, RelatedRiskIssueSummary>
  taskMap: Map<string, Task>
  tasks: Task[]
}

export function useGanttDetailDrawer({
  canEdit,
  engineeringObjects,
  filteredFlatList,
  flatList,
  handleInlineTaskPatchSave,
  onOpenDetailDrawer,
  projectConditions,
  projectObstacles,
  relatedRiskIssueSummaryByTaskId,
  taskMap,
  tasks,
}: UseGanttDetailDrawerInput) {
  const [detailDrawerTaskId, setDetailDrawerTaskId] = useState<string | null>(null)
  const [detailDrawerSection, setDetailDrawerSection] = useState<DrawerSection>('basic')

  const detailDrawerTask = useMemo(() => {
    return findGanttTaskById(detailDrawerTaskId, flatList, tasks)
  }, [detailDrawerTaskId, flatList, tasks])

  const detailDrawerTaskIndex = useMemo(() => {
    if (!detailDrawerTaskId) return -1
    return filteredFlatList.findIndex((task) => task.id === detailDrawerTaskId)
  }, [detailDrawerTaskId, filteredFlatList])

  const openPlanningDetailDrawer = useCallback((task: Task, section: DrawerSection = 'basic') => {
    onOpenDetailDrawer?.()
    setDetailDrawerTaskId(task.id)
    setDetailDrawerSection(section)
  }, [onOpenDetailDrawer])

  const closePlanningDetailDrawer = useCallback(() => {
    setDetailDrawerTaskId(null)
    setDetailDrawerSection('basic')
  }, [])

  const switchPlanningDetailDrawerTask = useCallback((direction: 'previous' | 'next') => {
    if (detailDrawerTaskIndex < 0) return
    const nextIndex = direction === 'previous' ? detailDrawerTaskIndex - 1 : detailDrawerTaskIndex + 1
    const nextTask = filteredFlatList[nextIndex]
    if (nextTask) setDetailDrawerTaskId(nextTask.id)
  }, [detailDrawerTaskIndex, filteredFlatList])

  const detailDrawerAcceptanceItems = getTaskAcceptanceImpactItems(detailDrawerTask)
  const detailDrawerConditions = useMemo(
    () => getTaskConditionsForTask(detailDrawerTask?.id, projectConditions),
    [detailDrawerTask, projectConditions],
  )
  const detailDrawerConditionRecords = useMemo(
    () => detailDrawerConditions.map(toDrawerConditionRecord),
    [detailDrawerConditions],
  )
  const detailDrawerObstacles = useMemo(
    () => getTaskObstaclesForTask(detailDrawerTask?.id, projectObstacles),
    [detailDrawerTask, projectObstacles],
  )
  const detailDrawerBlockageRecords = useMemo(
    () => detailDrawerObstacles.map(toDrawerBlockageRecord),
    [detailDrawerObstacles],
  )
  const detailDrawerPredecessors = useMemo(() => {
    return getDetailDrawerPredecessors(detailDrawerTask, taskMap)
  }, [detailDrawerTask, taskMap])
  const detailDrawerScopeObjects = useMemo(() => {
    return getDetailDrawerScopeObjects(detailDrawerTask, engineeringObjects)
  }, [detailDrawerTask, engineeringObjects])
  const detailDrawerPrimaryObjectId = String(detailDrawerTask?.engineering_object_id ?? '').trim()
    || getTaskEngineeringObjectIds(detailDrawerTask)[0]
    || null
  const [detailScopeDraftObjectId, setDetailScopeDraftObjectId] = useState<string | null>(detailDrawerPrimaryObjectId)
  useEffect(() => {
    setDetailScopeDraftObjectId(detailDrawerPrimaryObjectId)
  }, [detailDrawerPrimaryObjectId, detailDrawerTask?.id])

  const engineeringObjectLookupOptions = useMemo<EngineeringObjectLookupOption[]>(
    () => getEngineeringObjectLookupOptions(engineeringObjects),
    [engineeringObjects],
  )
  const detailScopeDirty = detailScopeDraftObjectId !== detailDrawerPrimaryObjectId
  const handleSaveDetailDrawerScopeObject = useCallback(async () => {
    if (!detailDrawerTask?.id || !canEdit) return
    const selectedObject = engineeringObjects.find((object) => object.id === detailScopeDraftObjectId) ?? null
    await handleInlineTaskPatchSave(
      detailDrawerTask.id,
      buildTaskScopePatchFromEngineeringObject(detailScopeDraftObjectId, selectedObject),
    )
  }, [canEdit, detailDrawerTask?.id, detailScopeDraftObjectId, engineeringObjects, handleInlineTaskPatchSave])

  const detailDrawerRelatedRiskIssueSummary = detailDrawerTask?.id
    ? relatedRiskIssueSummaryByTaskId.get(detailDrawerTask.id) ?? null
    : null
  const detailDrawerRelatedRiskIssueCount = getRelatedRiskIssueCount(detailDrawerRelatedRiskIssueSummary)

  return {
    closePlanningDetailDrawer,
    detailDrawerAcceptanceItems,
    detailDrawerBlockageRecords,
    detailDrawerConditionRecords,
    detailDrawerConditions,
    detailDrawerObstacles,
    detailDrawerPredecessors,
    detailDrawerRelatedRiskIssueCount,
    detailDrawerRelatedRiskIssueSummary,
    detailDrawerPrimaryObjectId,
    detailDrawerScopeObjects,
    detailDrawerSection,
    detailDrawerTask,
    detailDrawerTaskId,
    detailDrawerTaskIndex,
    detailScopeDirty,
    detailScopeDraftObjectId,
    engineeringObjectLookupOptions,
    handleSaveDetailDrawerScopeObject,
    openPlanningDetailDrawer,
    setDetailDrawerSection,
    setDetailDrawerTaskId,
    setDetailScopeDraftObjectId,
    switchPlanningDetailDrawerTask,
  }
}
