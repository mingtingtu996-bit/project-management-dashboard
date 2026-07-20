import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'

import type { HealthIssue } from '@/components/planning/PlanningHealthBanner'
import type { CriticalPathOverrideRecord, CriticalPathSummaryModel } from '@/lib/criticalPath'
import type { ProjectTaskProgressSnapshot } from '@/lib/taskBusinessStatus'

import type { Task, WBSNode } from '../GanttViewTypes'
import { getDependencyChain } from '../GanttViewTypes'
import {
  buildCriticalPathOverrideFlags,
  buildGanttProjectStats,
  buildGanttTaskMap,
  filterGanttTasks,
  findGanttTaskById,
  formatGanttCriticalPathSummary,
  getCriticalPathSourceType as getCriticalPathSourceTypeFromTask,
  getGanttBusinessStatusDisplay,
  getTaskBuildingNodeIds,
  getTaskBuildingOptions,
  getTaskSpecialtyOptions,
  type RelatedRiskIssueSummary,
} from './ganttViewUtils'

type UseGanttDerivedViewStateInput = {
  criticalPathOverrides: CriticalPathOverrideRecord[]
  criticalPathSummary: CriticalPathSummaryModel | null
  debouncedSearchText: string
  editingTask: Task | null
  filterBuilding: string
  filterCritical: boolean
  filterPriority: string
  filterSpecialty: string
  filterStatus: string
  flatList: WBSNode[]
  hoveredTaskId: string | null
  milestoneFilterId: string
  relatedRiskIssueSummaryByTaskId: Map<string, RelatedRiskIssueSummary>
  relatedRiskIssueTaskIds: Set<string>
  selectedTask: Task | null
  setShowFilterBar: Dispatch<SetStateAction<boolean>>
  setShowRiskIssueOnly: Dispatch<SetStateAction<boolean>>
  showRiskIssueOnly: boolean
  taskProgressSnapshot: ProjectTaskProgressSnapshot
  taskTableDraftRows: Task[]
  tasks: Task[]
  wbsTree: WBSNode[]
}

export function useGanttDerivedViewState({
  criticalPathOverrides,
  criticalPathSummary,
  debouncedSearchText,
  editingTask,
  filterBuilding,
  filterCritical,
  filterPriority,
  filterSpecialty,
  filterStatus,
  flatList,
  hoveredTaskId,
  milestoneFilterId,
  relatedRiskIssueSummaryByTaskId,
  relatedRiskIssueTaskIds,
  selectedTask,
  setShowFilterBar,
  setShowRiskIssueOnly,
  showRiskIssueOnly,
  taskProgressSnapshot,
  taskTableDraftRows,
  tasks,
  wbsTree,
}: UseGanttDerivedViewStateInput) {
  const selectedTaskView = useMemo(() => {
    if (!selectedTask?.id) return null
    return findGanttTaskById(selectedTask.id, taskTableDraftRows, [selectedTask])
  }, [selectedTask, taskTableDraftRows])

  const taskMap = useMemo(() => buildGanttTaskMap(tasks), [tasks])
  const dependencyChainIds = useMemo(() => {
    if (!hoveredTaskId) return new Set<string>()
    return getDependencyChain(hoveredTaskId, taskMap)
  }, [hoveredTaskId, taskMap])

  const specialtyOptions = useMemo(() => getTaskSpecialtyOptions(tasks), [tasks])
  const buildingOptions = useMemo(() => getTaskBuildingOptions(wbsTree), [wbsTree])
  const buildingNodeIds = useMemo<Set<string>>(
    () => getTaskBuildingNodeIds(wbsTree, filterBuilding),
    [filterBuilding, wbsTree],
  )

  const criticalPathSnapshot = criticalPathSummary?.snapshot ?? null
  const criticalPathTaskMap = useMemo(
    () => new Map((criticalPathSnapshot?.tasks ?? []).map((task) => [task.taskId, task])),
    [criticalPathSnapshot],
  )
  const criticalPathNetworkScheduleMap = useMemo(
    () => new Map((criticalPathSnapshot?.networkSchedule ?? []).map((task) => [task.taskId, task])),
    [criticalPathSnapshot],
  )
  const getCriticalPathSourceType = useCallback((taskId: string) => {
    return getCriticalPathSourceTypeFromTask(criticalPathTaskMap.get(taskId))
  }, [criticalPathTaskMap])
  const criticalPathDisplayTaskIds = useMemo(
    () => new Set(criticalPathSnapshot?.displayTaskIds ?? []),
    [criticalPathSnapshot],
  )
  const criticalPathOverrideFlags = useMemo(
    () => {
      if (criticalPathOverrides.length > 0) {
        return buildCriticalPathOverrideFlags(criticalPathOverrides)
      }

      const snapshotOverrides = [
        ...(criticalPathSnapshot?.manualAttentionTaskIds ?? []).map((taskId) => ({
          task_id: taskId,
          mode: 'manual_attention',
        })),
        ...(criticalPathSnapshot?.manualInsertedTaskIds ?? []).map((taskId) => ({
          task_id: taskId,
          mode: 'manual_insert',
        })),
      ]
      return buildCriticalPathOverrideFlags(snapshotOverrides)
    },
    [criticalPathOverrides, criticalPathSnapshot],
  )

  const filteredFlatList = useMemo(() => {
    return filterGanttTasks({
      flatList,
      searchText: debouncedSearchText,
      filterStatus,
      filterPriority,
      filterCritical,
      filterSpecialty,
      filterBuilding,
      milestoneFilterId,
      showRiskIssueOnly,
      relatedRiskIssueTaskIds,
      buildingNodeIds,
      criticalPathDisplayTaskIds,
    })
  }, [
    buildingNodeIds,
    criticalPathDisplayTaskIds,
    debouncedSearchText,
    filterBuilding,
    filterCritical,
    filterPriority,
    filterSpecialty,
    filterStatus,
    flatList,
    milestoneFilterId,
    relatedRiskIssueTaskIds,
    showRiskIssueOnly,
  ])

  const handleLocateRelatedRiskIssueTasks = useCallback(() => {
    setShowRiskIssueOnly(true)
    setShowFilterBar(true)
    const firstTaskId = Array.from(relatedRiskIssueTaskIds)[0]
    if (!firstTaskId || typeof window === 'undefined') return
    window.setTimeout(() => {
      document.getElementById(`gantt-task-row-${firstTaskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }, [relatedRiskIssueTaskIds, setShowFilterBar, setShowRiskIssueOnly])

  const planningHealthIssues = useMemo<HealthIssue[]>(() => {
    if (relatedRiskIssueSummaryByTaskId.size === 0) return []

    return [{
      id: 'related-risk-issue-tasks',
      message: `${relatedRiskIssueSummaryByTaskId.size} 个任务存在相关风险问题`,
      severity: 'warning',
      count: relatedRiskIssueSummaryByTaskId.size,
      rowIds: Array.from(relatedRiskIssueSummaryByTaskId.keys()),
      onLocate: handleLocateRelatedRiskIssueTasks,
    }]
  }, [handleLocateRelatedRiskIssueTasks, relatedRiskIssueSummaryByTaskId])

  const milestoneOptions = useMemo(
    () => tasks.filter((task) => task.is_milestone && task.id !== editingTask?.id),
    [editingTask?.id, tasks],
  )

  const criticalPathSummaryText = useMemo(() => {
    return formatGanttCriticalPathSummary(criticalPathSummary)
  }, [criticalPathSummary])

  const projectStats = useMemo(() => {
    return buildGanttProjectStats(taskProgressSnapshot, criticalPathSummaryText)
  }, [criticalPathSummaryText, taskProgressSnapshot])

  const getBusinessStatus = useCallback((task: Task) => (
    getGanttBusinessStatusDisplay(task, taskProgressSnapshot)
  ), [taskProgressSnapshot])

  const isOnCriticalPath = useCallback((taskId: string): boolean => (
    criticalPathDisplayTaskIds.has(taskId)
  ), [criticalPathDisplayTaskIds])

  const getCriticalPathTask = useCallback((taskId: string) => (
    criticalPathTaskMap.get(taskId) ?? null
  ), [criticalPathTaskMap])

  const selectedCriticalPathTask = selectedTask?.id ? getCriticalPathTask(selectedTask.id) : null
  const selectedCriticalPathSchedule = selectedTask?.id
    ? criticalPathNetworkScheduleMap.get(selectedTask.id) ?? null
    : null

  return {
    buildingOptions,
    criticalPathDisplayTaskIds,
    criticalPathNetworkScheduleMap,
    criticalPathOverrideFlags,
    criticalPathSnapshot,
    criticalPathSummaryText,
    criticalPathTaskMap,
    dependencyChainIds,
    filteredFlatList,
    getBusinessStatus,
    getCriticalPathSourceType,
    getCriticalPathTask,
    isOnCriticalPath,
    milestoneOptions,
    planningHealthIssues,
    projectStats,
    selectedCriticalPathTask,
    selectedCriticalPathSchedule,
    selectedTaskView,
    specialtyOptions,
    taskMap,
  }
}
