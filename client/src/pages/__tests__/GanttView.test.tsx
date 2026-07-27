import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function normalizeSource(source: string) {
  return source.replace(/\r\n/g, '\n')
}

function readGanttViewSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttView.tsx in: ${candidates.join(', ')}`)
}

function readProjectRemainingForecastApiSource() {
  const candidates = [
    join(process.cwd(), 'src/services/projectRemainingForecastApi.ts'),
    join(process.cwd(), 'client/src/services/projectRemainingForecastApi.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate projectRemainingForecastApi.ts in: ${candidates.join(', ')}`)
}

function readPlanningModelingWorkbenchDialogSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/PlanningModelingWorkbenchDialog.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/PlanningModelingWorkbenchDialog.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate PlanningModelingWorkbenchDialog.tsx in: ${candidates.join(', ')}`)
}

function readTaskDraftUtilsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/taskDraftUtils.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/taskDraftUtils.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate taskDraftUtils.ts in: ${candidates.join(', ')}`)
}

function readGanttTaskTableActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttTaskTableActions.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttTaskTableActions.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttTaskTableActions.ts in: ${candidates.join(', ')}`)
}

function readGanttTaskCommitActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttTaskCommitActions.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttTaskCommitActions.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttTaskCommitActions.tsx in: ${candidates.join(', ')}`)
}

function readGanttTaskDialogActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttTaskDialogActions.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttTaskDialogActions.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttTaskDialogActions.ts in: ${candidates.join(', ')}`)
}

function readGanttViewPreferencesSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttViewPreferences.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttViewPreferences.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttViewPreferences.ts in: ${candidates.join(', ')}`)
}

function readGanttBusinessActionSlotsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttBusinessActionSlots.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttBusinessActionSlots.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttBusinessActionSlots.tsx in: ${candidates.join(', ')}`)
}

function readTaskListBusinessActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/TaskListBusinessActions.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/TaskListBusinessActions.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate TaskListBusinessActions.tsx in: ${candidates.join(', ')}`)
}

function readGanttAuxiliaryDialogsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/GanttAuxiliaryDialogs.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/GanttAuxiliaryDialogs.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttAuxiliaryDialogs.tsx in: ${candidates.join(', ')}`)
}

function readGanttViewRowsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewRows.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewRows.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewRows.tsx in: ${candidates.join(', ')}`)
}

function readTargetAccelerationReviewPanelSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/TargetAccelerationReviewPanel.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/TargetAccelerationReviewPanel.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate TargetAccelerationReviewPanel.tsx in: ${candidates.join(', ')}`)
}

function readGanttWorkspaceChromeSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/GanttWorkspaceChrome.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/GanttWorkspaceChrome.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttWorkspaceChrome.tsx in: ${candidates.join(', ')}`)
}

function readGanttTaskPlanningTreeAdapterSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/GanttTaskPlanningTreeAdapter.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/GanttTaskPlanningTreeAdapter.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttTaskPlanningTreeAdapter.tsx in: ${candidates.join(', ')}`)
}

function readGanttDeleteGuardActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttDeleteGuardActions.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttDeleteGuardActions.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttDeleteGuardActions.ts in: ${candidates.join(', ')}`)
}

function readGanttConditionActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttConditionActions.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttConditionActions.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttConditionActions.ts in: ${candidates.join(', ')}`)
}

function readGanttViewUtilsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/ganttViewUtils.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/ganttViewUtils.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate ganttViewUtils.ts in: ${candidates.join(', ')}`)
}

function readTaskClipboardUtilsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/taskClipboardUtils.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/taskClipboardUtils.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate taskClipboardUtils.ts in: ${candidates.join(', ')}`)
}

function readGanttDetailDrawerSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttDetailDrawer.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttDetailDrawer.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttDetailDrawer.ts in: ${candidates.join(', ')}`)
}

function readGanttDetailDrawerComponentSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/GanttDetailDrawer.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/GanttDetailDrawer.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttDetailDrawer.tsx in: ${candidates.join(', ')}`)
}

function readGanttDeleteProtectionDialogSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/GanttDeleteProtectionDialog.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/GanttDeleteProtectionDialog.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttDeleteProtectionDialog.tsx in: ${candidates.join(', ')}`)
}

function readTaskObstacleApiSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/taskObstacleApi.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/taskObstacleApi.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate taskObstacleApi.ts in: ${candidates.join(', ')}`)
}

function readGanttObstacleActionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttObstacleActions.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttObstacleActions.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttObstacleActions.ts in: ${candidates.join(', ')}`)
}

function readGanttProjectDataApiSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/ganttProjectDataApi.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/ganttProjectDataApi.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate ganttProjectDataApi.ts in: ${candidates.join(', ')}`)
}

function readGanttProjectDataHookSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/useGanttProjectData.ts'),
    join(process.cwd(), 'client/src/pages/GanttView/useGanttProjectData.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return normalizeSource(readFileSync(candidate, 'utf8'))
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttProjectData.ts in: ${candidates.join(', ')}`)
}

function readGanttRowSectionsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewRowSections.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewRowSections.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewRowSections.tsx in: ${candidates.join(', ')}`)
}

function readGanttDialogsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewDialogs.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewDialogs.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewDialogs.tsx in: ${candidates.join(', ')}`)
}

function readGanttFiltersSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewFilters.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewFilters.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8').replace(/\r\n/g, '\n')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewFilters.tsx in: ${candidates.join(', ')}`)
}

function readMetricCardSource() {
  const candidates = [
    join(process.cwd(), 'src/components/ui/metric-card.tsx'),
    join(process.cwd(), 'client/src/components/ui/metric-card.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return normalizeSource(readFileSync(candidate, 'utf8'))
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate metric-card.tsx in: ${candidates.join(', ')}`)
}

function readGanttRowsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewRows.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewRows.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewRows.tsx in: ${candidates.join(', ')}`)
}

function readGanttTaskRowInlinePartsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttView/GanttTaskRowInlineParts.tsx'),
    join(process.cwd(), 'client/src/pages/GanttView/GanttTaskRowInlineParts.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttTaskRowInlineParts.tsx in: ${candidates.join(', ')}`)
}

function readGanttPanelsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewPanels.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewPanels.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewPanels.tsx in: ${candidates.join(', ')}`)
}

function readQuickBlockageFormSource() {
  const candidates = [
    join(process.cwd(), 'src/components/planning/PlanningInlinePopover.tsx'),
    join(process.cwd(), 'client/src/components/planning/PlanningInlinePopover.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate PlanningInlinePopover.tsx in: ${candidates.join(', ')}`)
}

function readGanttComponentsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewComponents.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewComponents.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewComponents.tsx in: ${candidates.join(', ')}`)
}

function readGanttViewHeaderSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/GanttViewHeader.tsx'),
    join(process.cwd(), 'client/src/pages/GanttViewHeader.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewHeader.tsx in: ${candidates.join(', ')}`)
}

function readGanttCriticalPathHookSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/useGanttCriticalPath.ts'),
    join(process.cwd(), 'client/src/pages/useGanttCriticalPath.ts'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate useGanttCriticalPath.ts in: ${candidates.join(', ')}`)
}

function readPlanningTreeSource() {
  const candidates = [
    join(process.cwd(), 'src/components/planning/PlanningTreeView.tsx'),
    join(process.cwd(), 'client/src/components/planning/PlanningTreeView.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate PlanningTreeView.tsx in: ${candidates.join(', ')}`)
}

describe('GanttView source contracts', () => {
  it('keeps delay request approval flow removed from gantt', () => {
    const source = readGanttViewSource()

    expect(source.includes('delayRequests')).toBe(false)
    expect(source.includes('/api/delay-requests')).toBe(false)
    expect(source.includes('handleSubmitDelayRequest')).toBe(false)
  })

  it('keeps admin-force satisfy removed from the ordinary gantt frontend', () => {
    const source = readGanttViewSource()

    expect(source.includes("satisfied_reason: 'admin_force'")).toBe(false)
    expect(source.includes("change_source: 'admin_force'")).toBe(false)
  })

  it('keeps delete protection dialogs wired to obstacle close-action fallbacks', () => {
    const source = readGanttViewSource()
    const deleteGuardActionsSource = readGanttDeleteGuardActionsSource()
    const deleteDialogSource = readGanttDeleteProtectionDialogSource()
    const obstacleActionsSource = readGanttObstacleActionsSource()
    const taskObstacleApiSource = readTaskObstacleApiSource()

    expect(deleteDialogSource.includes('gantt-delete-protection-dialog')).toBe(true)
    expect(deleteDialogSource.includes('secondaryActionLabel={')).toBe(true)
    expect(deleteDialogSource.includes('target.details?.close_action?.label')).toBe(true)
    expect(deleteGuardActionsSource.includes("buildCommitDeleteProtectionPayload(deleteResult, '删除任务失败')")).toBe(true)
    expect(deleteGuardActionsSource).toMatch(/buildDeleteProtectionState\(\s*'obstacle'/)
    expect(source.includes('/api/tasks/${taskId}/close')).toBe(false)
    expect(obstacleActionsSource.includes('closeTaskObstacleRecord({')).toBe(true)
    expect(obstacleActionsSource.includes('/api/task-obstacles/${obsId}/close')).toBe(false)
    expect(taskObstacleApiSource.includes('/api/task-obstacles/${obstacleId}/close')).toBe(true)
    expect(deleteGuardActionsSource.includes("deleteGuardTarget.kind === 'task' ? '删除任务失败' : '删除阻碍失败'")).toBe(true)
    expect(deleteDialogSource.includes('target.blocked')).toBe(true)
    expect(source.includes('onDeleteTask={(taskId) => handleDeleteTaskRows([taskId])}')).toBe(true)
  })

  it('confirms retention decisions from guarded task deletes instead of locally removing retained rows', () => {
    const source = readGanttViewSource()
    const deleteGuardActionsSource = readGanttDeleteGuardActionsSource()
    const deleteDialogSource = readGanttDeleteProtectionDialogSource()

    expect(source.includes('useGanttDeleteGuardActions({')).toBe(true)
    expect(deleteGuardActionsSource.includes("getRetentionApiUserMessage(error, '请刷新后重试。')")).toBe(true)
    expect(deleteDialogSource.includes("from '@/lib/retentionError'")).toBe(true)
    expect(deleteDialogSource.includes('buildRetentionDecisionDialogModel')).toBe(true)
    expect(deleteDialogSource.includes('buildRetentionDecisionPayload')).toBe(true)
    expect(deleteGuardActionsSource.includes('getDeleteProtectionDecisionToken')).toBe(true)
    expect(deleteGuardActionsSource.includes('isRetentionConfirmationDetails')).toBe(true)
    expect(deleteGuardActionsSource.includes("apiPost('/api/deletion-retention/confirm'")).toBe(true)
    expect(deleteGuardActionsSource.includes('refreshGanttProjectData({ includeSummary: true })')).toBe(true)
    expect(deleteDialogSource.includes('requiresRetentionConfirmation')).toBe(true)
  })

  it('keeps batch delete staged in the task-table draft before guarded save', () => {
    const source = readGanttViewSource()
    const actionsSource = readGanttTaskTableActionsSource()
    const draftUtilsSource = readTaskDraftUtilsSource()

    expect(source.includes('useGanttTaskTableActions({')).toBe(true)
    expect(actionsSource.includes('const handleBatchDelete = useCallback(async () => {')).toBe(true)
    expect(actionsSource.includes('!taskTableEditing')).toBe(true)
    expect(actionsSource.includes('handleDeleteTaskRows(Array.from(selectedIds))')).toBe(true)
    expect(actionsSource.includes('__draftDeleted: true')).toBe(true)
    expect(draftUtilsSource.includes("type: 'delete_row' as const")).toBe(true)
    expect(actionsSource.includes('保存编辑前可撤销或取消。')).toBe(true)
    expect(source.includes("openConfirm('批量删除任务'")).toBe(false)
  })

  it('keeps batch complete staged in the task-table draft before save', () => {
    const source = readGanttViewSource()
    const actionsSource = readGanttTaskTableActionsSource()
    const draftUtilsSource = readTaskDraftUtilsSource()

    expect(source.includes('useGanttTaskTableActions({')).toBe(true)
    expect(actionsSource.includes('const handleBatchComplete = useCallback(async () => {')).toBe(true)
    expect(actionsSource.includes('!taskTableEditing')).toBe(true)
    expect(actionsSource.includes('recordTaskTableDraftPatches((current) =>')).toBe(true)
    expect(draftUtilsSource.includes("status: 'completed'")).toBe(true)
    expect(actionsSource.includes('已暂存完成 ${changedCount} 个任务')).toBe(true)
    expect(source.includes('const syncBatchCompletionWrites = async (')).toBe(false)
    expect(source.includes('后台同步中。')).toBe(false)
  })

  it('does not block gantt first paint on critical path summary loading', () => {
    const source = readGanttViewSource()

    expect(source.includes('if (loading) {')).toBe(true)
    expect(source.includes('if (loading || (criticalPathLoading && !criticalPathSummary)) {')).toBe(false)
  })

  it('keeps the current task surface visible while refreshing the same project', () => {
    const source = readGanttProjectDataHookSource()
    const ganttSource = readGanttViewSource()

    expect(source.includes('const loadedProjectIdRef = useRef<string | null>(null)')).toBe(true)
    expect(source.includes('const hasLoadedTasksRef = useRef(false)')).toBe(true)
    expect(source.includes('hasCachedProjectTasks?: boolean')).toBe(true)
    expect(source.includes('const [loading, setLoading] = useState(() => !hasCachedProjectTasks)')).toBe(true)
    expect(source.includes('const isInitialProjectLoad = loadedProjectIdRef.current !== projectId || !hasLoadedTasksRef.current')).toBe(true)
    expect(source.includes('const canRenderCachedTasks = isInitialProjectLoad && hasCachedProjectTasks')).toBe(true)
    expect(source.includes('if (isInitialProjectLoad && !canRenderCachedTasks) {')).toBe(true)
    expect(source.includes('setLoading(true)')).toBe(true)
    expect(source.includes('setLoading(false)\n      setRefreshingTaskList(true)')).toBe(true)
    expect(source.includes('loadTasks({ signal: controller.signal, allowStaleOnError: canRenderCachedTasks })')).toBe(true)
    expect(ganttSource.includes('hasCachedProjectTasks: tasks.length > 0')).toBe(true)
    expect(source.includes('loadedProjectIdRef.current = projectId')).toBe(true)
    expect(source.includes('hasLoadedTasksRef.current = true')).toBe(true)
  })

  it('bounds task-list fetches so a slow backend cannot hold the page on skeleton forever', () => {
    const source = readGanttProjectDataApiSource()

    expect(source.includes('const GANTT_TASKS_REQUEST_TIMEOUT_MS = 12_000')).toBe(true)
    expect(source.includes('function createTimedSignal(parentSignal?: AbortSignal)')).toBe(true)
    expect(source.includes('timedOut = true')).toBe(true)
    expect(source.includes('withRequestContext({ signal: timedRequest.signal })')).toBe(true)
    expect(source.includes('if (!response.ok || json?.success === false) {')).toBe(true)
    expect(source.includes("throw new Error('任务列表加载超时，请稍后重试')")).toBe(true)
    expect(source.includes('timedRequest.cleanup()')).toBe(true)
  })

  it('treats expected backend read timeouts as degraded task-list state instead of red console errors', () => {
    const source = readGanttProjectDataHookSource()

    expect(source.includes('function isExpectedBackendReadUnavailable(error: unknown): boolean')).toBe(true)
    expect(source.includes("message.includes('任务列表加载超时') || message.includes('timed out after')")).toBe(true)
    expect(source.includes('console.warn(`[GanttView] task list unavailable: ${message}`)')).toBe(true)
    expect(source.includes("console.error('加载甘特任务失败:', error)")).toBe(true)
    expect(source.includes('if (loading || pageLoadError) {')).toBe(true)
    expect(source.includes('if (pageLoadError) setDataQualitySummary(null)')).toBe(true)
    expect(source.includes('}, [dataQualityRefreshKey, loadDataQualitySummary, loading, pageLoadError, projectId])')).toBe(true)
  })

  it('surfaces critical path changes returned by task-list commits', () => {
    const source = readGanttTaskCommitActionsSource()

    expect(source.includes('const notifyCriticalPathChange = useCallback')).toBe(true)
    expect(source.includes('criticalPathChangeSummary')).toBe(true)
    expect(source.includes('ToastAction altText="查看关键路径"')).toBe(true)
    expect(source.includes('onOpenCriticalPathDialog(focusTaskId)')).toBe(true)
  })

  it('keeps critical path delay derived from hook params instead of leaking an undefined options reference', () => {
    const source = readGanttCriticalPathHookSource()
    const ganttSource = readGanttViewSource()

    expect(source.includes('export function useGanttCriticalPath({ projectId, summaryDelayMs = 800 }: UseGanttCriticalPathOptions)')).toBe(true)
    expect(source.includes('}, [abortDialogRequest, abortSummaryRequest, loadCriticalPathSummary, summaryDelayMs])')).toBe(true)
    expect(ganttSource.includes('useGanttCriticalPath({ projectId: loading || pageLoadError ? null : id, summaryDelayMs: 6_000 })')).toBe(true)
    expect(source.includes('function isExpectedBackendReadUnavailable(error: unknown): boolean')).toBe(true)
    expect(source.includes("console.warn(`[GanttView] critical path unavailable: ${message}`)")).toBe(true)
    expect(source.includes("console.warn(`[GanttView] critical path dialog unavailable: ${message}`)")).toBe(true)
    expect(source.includes('options.summaryDelayMs')).toBe(false)
  })

  it('keeps task title single-click focused on details instead of opening edit dialog', () => {
    const source = readGanttRowSectionsSource()
    const rowsSource = readGanttViewRowsSource()

    expect(source.includes('单击查看详情，双击快速改名')).toBe(true)
    expect(source.includes('title="单击查看详情，双击快速改名')).toBe(false)
    expect(source.includes('title="单击打开编辑，双击快速改名')).toBe(false)
    expect(source.includes('onSelectTask(task)')).toBe(true)
    expect(rowsSource.includes('data-testid="gantt-task-title-inline-edit-trigger"')).toBe(true)
    expect(rowsSource.includes("'flex min-w-0 flex-1 overflow-hidden text-left hover:text-blue-700'")).toBe(true)
    expect(rowsSource.includes('<span className="block min-w-0 flex-1 truncate">{taskTitle}</span>')).toBe(true)
  })

  it('keeps gantt filters and stats aligned to the three-tier lag model', () => {
    const source = readGanttFiltersSource()
    const utilsSource = readGanttViewUtilsSource()

    expect(source.includes('laggedTaskCount')).toBe(false)
    expect(source.includes('activeObstacleTaskCount')).toBe(true)
    expect(source.includes('受阻任务')).toBe(false)
    expect(source.includes('lagging_mild')).toBe(true)
    expect(source.includes('lagging_moderate')).toBe(true)
    expect(source.includes('lagging_severe')).toBe(true)
    expect(utilsSource.includes('activeObstacleCount')).toBe(true)
    expect(utilsSource.includes('laggedTaskCount')).toBe(true)
    expect(source.includes('SelectItem value="blocked"')).toBe(false)
    expect(source.includes('option value="blocked"')).toBe(false)
  })

  it('keeps task-list KPI cards aligned to the dashboard summary source', () => {
    const source = readGanttViewSource()
    const filtersSource = readGanttFiltersSource()
    const metricCardSource = readMetricCardSource()

    expect(source.includes('const dashboardAlignedProjectStats = useMemo<ProjectStatsData>')).toBe(false)
    expect(source.includes('function hasReadySummaryCount(summary: { totalTasks?: unknown } | null | undefined, visibleTaskCount: number): boolean')).toBe(true)
    expect(source.includes('const hasDashboardSummaryMetrics = hasReadySummaryCount(projectSummary, tasks.length)')).toBe(true)
    expect(source.includes('metrics={!pageLoadError ? <TaskListMetricCards summary={projectSummary} summaryPending={!hasDashboardSummaryMetrics} /> : undefined}')).toBe(true)
    expect(source.includes('criticalPathSummaryText={criticalPathSummaryText}')).toBe(true)
    expect(source.includes('projectStats={dashboardAlignedProjectStats}')).toBe(false)
    expect(source.includes('<GanttMetricCards projectStats={dashboardAlignedProjectStats} summaryPending={!projectSummary} />')).toBe(false)
    expect(source.includes('summaryPending ? null : projectStats.totalTasks')).toBe(false)
    expect(source.includes('projectStats={projectStats}')).toBe(false)
    expect(filtersSource.includes('import type { ProjectSummary }')).toBe(true)
    expect(filtersSource.includes('summary?.totalTasks')).toBe(true)
    expect(filtersSource.includes('summary?.leafTaskCount ?? summary?.totalTasks')).toBe(true)
    expect(filtersSource.includes('summary?.completedTaskCount')).toBe(false)
    expect(filtersSource.includes('summary?.inProgressTaskCount')).toBe(true)
    expect(filtersSource.includes('summary?.overdueTaskCount ?? summary?.delayedTaskCount')).toBe(false)
    expect(filtersSource.includes('summary?.laggedTaskCount')).toBe(false)
    expect(filtersSource.includes('summary?.monthlyProductivityDistribution?.monthlyAverageP')).toBe(true)
    expect(filtersSource.includes('getConstructionEfficiencyMetric')).toBe(true)
    expect(filtersSource.includes("eyebrow: 'EFFICIENCY'")).toBe(true)
    expect(filtersSource.includes("label: '施工效率'")).toBe(true)
    expect(filtersSource.includes('summary?.pendingConditionTaskCount')).toBe(true)
    expect(filtersSource.includes('summary?.activeObstacleTaskCount')).toBe(true)
    expect(filtersSource.includes("eyebrow: 'DELAYED'")).toBe(false)
    expect(filtersSource.includes("label: '延期'")).toBe(false)
    expect(filtersSource.includes("eyebrow: 'BLOCKED'")).toBe(true)
    expect(filtersSource.includes('projectStats.overdueTask + projectStats.laggedTaskCount + projectStats.pendingStartTasks + projectStats.activeObstacleCount')).toBe(false)
    expect(filtersSource.includes('summaryPending ? null : projectStats.totalTasks')).toBe(false)
    expect(filtersSource.includes('availability={card.availability ?? metricAvailability}')).toBe(true)
    expect(filtersSource.includes('density="compact"')).toBe(true)
    expect(filtersSource.includes('animateValue={false}')).toBe(true)
    expect(metricCardSource.includes('const metricValue = animateValue ? countValue : numericValue')).toBe(true)
    expect(metricCardSource.includes('numericValue !== null\n        ? metricValue')).toBe(true)
  })

  it('keeps visible task-list labels free of mojibake fallbacks', () => {
    const source = readGanttViewSource()

    expect(source.includes("document.title = '任务列表 | WorkBuddy'")).toBe(true)
    expect(source.includes("|| '当前项目'")).toBe(true)
    expect(source.includes("{ label: '任务列表' }")).toBe(true)
    expect(source.includes('提示：可使用鼠标滚轮缩放时间轴，拖拽平移。')).toBe(true)
    expect(source.includes('褰撳墠')).toBe(false)
    expect(source.includes('鎻愮ず')).toBe(false)
  })

  it('supports milestone-scoped task filtering from the milestone page', () => {
    const source = readGanttViewSource()
    const workspaceChromeSource = readGanttWorkspaceChromeSource()
    const rowsSource = readGanttRowsSource()
    const utilsSource = readGanttViewUtilsSource()

    expect(source.includes("searchParams.get('milestoneId')")).toBe(true)
    expect(utilsSource.includes('isTaskLinkedToMilestone(task, milestoneFilterId)')).toBe(true)
    expect(source.includes('<GanttWorkspaceChrome')).toBe(true)
    expect(workspaceChromeSource.includes('关联节点：{milestoneFilterLabel}')).toBe(true)
    expect(workspaceChromeSource.includes('返回里程碑')).toBe(true)
    expect(source.includes("emptyFilterTitle={milestoneFilterId ? '该节点暂无关联任务' : undefined}")).toBe(true)
    expect(rowsSource.includes("title={props.emptyFilterTitle || '没有匹配的任务'}")).toBe(true)
  })

  it('keeps the task detail drawer as the gantt progress entry point', () => {
    const source = readGanttPanelsSource()
    const ganttSource = readGanttViewSource()
    const quickBlockageFormSource = readQuickBlockageFormSource()
    const obstacleApiSource = readTaskObstacleApiSource()

    expect(source.includes('gantt-progress-entry-panel')).toBe(true)
    expect(source.includes('gantt-progress-save')).toBe(true)
    expect(source.includes('暂存进度')).toBe(true)
    expect(source.includes('保存进度')).toBe(false)
    expect(source.includes('gantt-progress-health-feedback')).toBe(true)
    expect(source.includes('查看 Dashboard')).toBe(true)
    expect(source.includes('本页不前端计算健康分')).toBe(true)
    expect(source.includes('gantt-progress-quick-obstacle')).toBe(true)
    expect(source.includes('gantt-progress-quick-obstacle-toggle')).toBe(true)
    expect(source.includes('<QuickBlockageForm')).toBe(true)
    expect(ganttSource.includes('onQuickAddObstacle={handleQuickAddTaskObstacle}')).toBe(true)
    expect(quickBlockageFormSource.includes('disabled={!description.trim()}')).toBe(true)
    expect(quickBlockageFormSource.includes('expectedResolution: expectedResolution.trim()')).toBe(true)
    expect(obstacleApiSource.includes('normalizeObstacleSeverityForApi')).toBe(true)
    expect(obstacleApiSource.includes("expected_resolution_date: expectedResolutionDate?.trim() || null")).toBe(true)
    expect(source.includes('selectedTaskConditionSummary')).toBe(true)
    expect(source.includes('selectedTaskObstacleCount')).toBe(true)
    expect(source.includes('gantt-delay-request-panel')).toBe(false)
    expect(source.includes('delayPanelId')).toBe(false)
    expect(source.includes('onSaveProgress')).toBe(true)
  })

  it('keeps gantt task forms free of the legacy blocked status choice', () => {
    const source = readGanttDialogsSource()

    expect(source.includes('SelectItem value="blocked"')).toBe(false)
    expect(source.includes('SelectItem value="todo"')).toBe(true)
    expect(source.includes('SelectItem value="completed"')).toBe(true)
  })

  it('keeps row status badges and progress coloring tied to lag levels', () => {
    const source = readGanttRowSectionsSource()

    expect(source.includes('getTaskLagLevel')).toBe(true)
    expect(source.includes('gantt-task-status-')).toBe(true)
    expect(source.includes('StatusBadge')).toBe(false)
    expect(source.includes('row-block-task')).toBe(false)
    expect(source.includes('row-unblock-task')).toBe(false)
    expect(source.includes('lagLevel === \'severe\'')).toBe(true)
    expect(source.includes('lagLevel === \'moderate\'')).toBe(true)
    expect(source.includes('lagLevel === \'mild\'')).toBe(true)
  })

  it('keeps list and timeline view state on the shared gantt page', () => {
    const source = readGanttViewSource()
    const viewPreferencesSource = readGanttViewPreferencesSource()
    const utilsSource = readGanttViewUtilsSource()
    const projectDataApiSource = readGanttProjectDataApiSource()
    const projectDataHookSource = readGanttProjectDataHookSource()
    const headerSource = readGanttViewHeaderSource()
    const businessActionSlotsSource = readGanttBusinessActionSlotsSource()

    expect(viewPreferencesSource.includes('gantt_view_mode_')).toBe(true)
    expect(projectDataApiSource.includes('timeline_projection')).toBe(true)
    expect(projectDataApiSource.includes("new URLSearchParams({ projectId, surface: 'task_list' })")).toBe(true)
    expect(utilsSource.includes("if (value === 'timeline') return 'gantt'")).toBe(true)
    expect(projectDataHookSource.includes('shouldReuseHydratedTasks')).toBe(false)
    expect(projectDataHookSource.includes('useHydratedProjectId')).toBe(false)
    expect(source.includes('TaskTimelineView')).toBe(true)
    expect(source.includes("import { GanttChart } from '@/components/planning/GanttChart'")).toBe(true)
    expect(source.includes('<GanttChart')).toBe(true)
    expect(businessActionSlotsSource.includes("import { TaskListBusinessActions, TaskListEditBusinessActions } from './TaskListBusinessActions'")).toBe(true)
    expect(source.includes('useGanttBusinessActionSlots({')).toBe(true)
    expect(source.includes('readBusinessActionsSlot={taskListBusinessActions}')).toBe(true)
    expect(source.includes('editBusinessActionsSlot={taskListEditBusinessActions}')).toBe(true)
    expect(source.includes('VITE_GANTT_LEGACY_VIEW')).toBe(false)
    expect(source.includes('legacySharedToolbar')).toBe(false)
    expect(headerSource.includes('gantt-switch-list-view')).toBe(false)
    expect(headerSource.includes('gantt-switch-timeline-view')).toBe(false)
  })

  it('only rehydrates timeline baseline ids from the URL after the baseline options are known valid', () => {
    const source = readGanttViewSource()
    const viewPreferencesSource = readGanttViewPreferencesSource()
    const projectDataHookSource = readGanttProjectDataHookSource()

    expect(source.includes('useGanttTimelineBaselinePreference({')).toBe(true)
    expect(viewPreferencesSource.includes('getNextTimelineBaselineVersionId({')).toBe(true)
    expect(projectDataHookSource.includes('const loadBaselineOptions = useCallback(async (requestOptions?: { signal?: AbortSignal }) => {')).toBe(true)
    expect(projectDataHookSource.includes('setBaselineOptions(nextOptions)')).toBe(true)
  })

  it('keeps gantt subscribed to project realtime mutations with forced refresh', () => {
    const source = readGanttProjectDataHookSource()

    expect(source.includes('const lastRealtimeEvent = useStore((state) => state.lastRealtimeEvent)')).toBe(true)
    expect(source.includes("lastRealtimeEvent.channel !== 'project' || lastRealtimeEvent.projectId !== projectId")).toBe(true)
    expect(source.includes("['task', 'task_list', 'task_condition', 'task_obstacle', 'milestone'].includes(entityType)")).toBe(true)
    expect(source.includes('const refreshGanttProjectData = useCallback(async (options?: RefreshGanttProjectDataOptions) => {')).toBe(true)
    expect(source.includes("loadTasks({ signal: options?.signal, force: true, allowStaleOnError: true })")).toBe(true)
    expect(source.includes('loadProjectConditions({ signal: options?.signal })')).toBe(true)
    expect(source.includes('loadProjectObstacles({ signal: options?.signal })')).toBe(true)
    expect(source.includes('loadDelayRequests({ signal: options?.signal })')).toBe(false)
    expect(source.includes('const GANTT_VISIBLE_REFRESH_INTERVAL_MS = 120_000')).toBe(true)
    expect(source.includes('const GANTT_DATA_QUALITY_SUMMARY_DELAY_MS = 8_000')).toBe(true)
    expect(source.includes('const GANTT_BASELINE_OPTIONS_DELAY_MS = 5_000')).toBe(true)
    expect(source.includes('window.setInterval(refreshVisiblePage, GANTT_VISIBLE_REFRESH_INTERVAL_MS)')).toBe(true)
    expect(source.includes("document.addEventListener('visibilitychange', handleVisibilityChange)")).toBe(true)
    expect(source.indexOf('const refreshGanttProjectData = useCallback(async (options?: RefreshGanttProjectDataOptions) => {'))
      .toBeGreaterThan(source.indexOf('const loadProjectSummary = useCallback(async (options?: { signal?: AbortSignal }) => {'))
    expect(source.indexOf('const refreshGanttProjectData = useCallback(async (options?: RefreshGanttProjectDataOptions) => {'))
      .toBeGreaterThan(source.indexOf('const loadDataQualitySummary = useCallback(async (options?: { signal?: AbortSignal }) => {'))
  })

  it('keeps completed status writes aligned with 100% progress truth', () => {
    const source = readGanttViewSource()
    const actionsSource = readGanttTaskTableActionsSource()
    const rowsSource = readGanttRowsSource()

    expect(actionsSource.includes('const statusPayload: Record<string, unknown> = {')).toBe(true)
    expect(actionsSource.includes("if (normalizedStatus === 'completed' && !progressReadOnlyReason) {")).toBe(true)
    expect(actionsSource.includes('statusPayload.progress = 100')).toBe(true)
    expect(actionsSource.includes('enqueueTaskTableDraftPatch(taskId, statusPayload as Partial<Task>)')).toBe(true)
    expect(actionsSource.includes('状态已加入表格编辑')).toBe(true)
    expect(source.includes('onStatusChange={handleStatusChange}')).toBe(true)
    expect(source.includes('gantt-complete-task-confirm-dialog')).toBe(false)
    expect(source.includes('handleRequestTaskCompletion')).toBe(false)
    expect(rowsSource.includes("event.currentTarget.value = '99'")).toBe(false)
    expect(rowsSource.includes('props.onRequestComplete(task.id)')).toBe(false)
    expect(rowsSource.includes('TaskProgressCell')).toBe(true)
    expect(rowsSource.includes('onSave={props.onSaveProgress}')).toBe(true)
    expect(rowsSource.includes('onBlur')).toBe(false)
  })

  it('keeps the task list on shared table cells instead of hidden row menus', () => {
    const source = readGanttViewSource()
    const rowsSource = readGanttRowsSource()
    const taskPlanningTreeAdapterSource = readGanttTaskPlanningTreeAdapterSource()
    const filtersSource = readGanttFiltersSource()
    const detailDrawerSource = readGanttDetailDrawerSource()
    const detailDrawerComponentSource = readGanttDetailDrawerComponentSource()
    const inlinePartsSource = readGanttTaskRowInlinePartsSource()
    const treeSource = readPlanningTreeSource()

    expect(rowsSource.includes('startCell:')).toBe(true)
    expect(rowsSource.includes('endCell:')).toBe(true)
    expect(rowsSource.includes('assigneeCell:')).toBe(true)
    expect(rowsSource.includes('unitCell:')).toBe(true)
    expect(rowsSource.includes('onSaveTaskPatch')).toBe(true)
    expect(rowsSource.includes('ParticipantUnitLookup')).toBe(true)
    expect(rowsSource.includes('onSave={(unitId) => props.onSaveTaskPatch(task.id, { participant_unit_id: unitId })}')).toBe(true)
    expect(source.includes('onLoadParticipantUnits={ensureParticipantUnitsForLookup}')).toBe(true)
    expect(source.includes('onOpenParticipantUnits={openParticipantUnitsDialog}')).toBe(true)
    expect(detailDrawerComponentSource.includes('EngineeringObjectLookup')).toBe(true)
    expect(detailDrawerSource.includes('buildTaskScopePatchFromEngineeringObject')).toBe(true)
    expect(detailDrawerComponentSource.includes('onSaveScopeObject')).toBe(true)
    expect(rowsSource.includes('const tableEditAllowed = Boolean(props.canEdit && props.taskDraftEditing)')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('rowMode={props.taskDraftEditing ? \'edit\' : \'read\'}')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('onStartEdit={props.onStartTaskDraft}')).toBe(true)
    expect(treeSource.includes('data-testid="planning-start-edit"')).toBe(true)
    expect(inlinePartsSource.includes('const isReadOnly = Boolean(readOnlyReason || readOnly)')).toBe(true)
    expect(rowsSource.includes('if (tableEditAllowed) props.onStartInlineTitleEdit(task)')).toBe(true)
    expect(rowsSource.includes('disabled={!tableEditAllowed}')).toBe(true)
    expect(treeSource.includes("{ key: 'assignee', label: '责任人'")).toBe(true)
    expect(treeSource.includes("{ key: 'unit', label: '责任单位'")).toBe(true)
    expect(filtersSource.includes('状态变更')).toBe(false)
  })

  it('stages shared task-table edits with undo and redo before commit', () => {
    const source = readGanttViewSource()
    const commitActionsSource = readGanttTaskCommitActionsSource()
    const rowsSource = readGanttRowsSource()
    const taskPlanningTreeAdapterSource = readGanttTaskPlanningTreeAdapterSource()
    const draftUtilsSource = readTaskDraftUtilsSource()

    expect(source.includes('taskTableDraftPatches')).toBe(true)
    expect(source.includes('enqueueTaskTableDraftPatch')).toBe(true)
    expect(source.includes('handleSaveTaskTableDraft')).toBe(true)
    expect(source.includes('handleStartTaskTableDraft')).toBe(true)
    expect(commitActionsSource.includes('setTaskTableEditing(false)')).toBe(true)
    expect(commitActionsSource.includes('resetTaskTableDraftPatches')).toBe(true)
    expect(source.includes('handleUndoTaskTableDraft')).toBe(true)
    expect(source.includes('handleRedoTaskTableDraft')).toBe(true)
    expect(source.includes('onSaveTaskDraft={handleSaveTaskTableDraft}')).toBe(true)
    expect(source.includes('onStartTaskDraft={handleStartTaskTableDraft}')).toBe(true)
    expect(source.includes('onUndoTaskDraft={handleUndoTaskTableDraft}')).toBe(true)
    expect(source.includes('onRedoTaskDraft={handleRedoTaskTableDraft}')).toBe(true)
    expect(draftUtilsSource.includes("type: 'update_row' as const")).toBe(true)
    expect(rowsSource.includes('taskDraftPatches?.[node.id]')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('data-testid="gantt-task-draft-count"')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('onSave={props.onSaveTaskDraft}')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('onUndo={props.onUndoTaskDraft}')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('data-testid="gantt-save-task-draft"')).toBe(false)
    expect(taskPlanningTreeAdapterSource.includes('data-testid="gantt-undo-task-draft"')).toBe(false)
    expect(taskPlanningTreeAdapterSource.includes('dirtyCellMap={props.taskDraftDirtyCellMap}')).toBe(true)
    expect(taskPlanningTreeAdapterSource.includes('canUndo={props.canUndoTaskDraft}')).toBe(true)
  })

  it('keeps task-list editing as the only visible large workspace entry', () => {
    const treeSource = readPlanningTreeSource()

    expect(treeSource.includes('planning-large-view-dialog')).toBe(true)
    expect(treeSource.includes('planning-large-view-trigger')).toBe(false)
    expect(treeSource.includes('计划表工作台')).toBe(true)
    expect(treeSource.includes('closeLabel="退出计划表工作台"')).toBe(true)
    expect(treeSource.includes('renderTableBody({ largeView: true })')).toBe(true)
    expect(treeSource.includes('useLargeViewEditWorkspace')).toBe(true)
    expect(treeSource.includes('setLargeViewOpen(true)')).toBe(true)
    expect(treeSource.includes('renderEditModeToolbar({ largeView: true })')).toBe(true)
    expect(treeSource.includes('任务列表将在计划表工作台中打开')).toBe(true)
    expect(treeSource.includes('Maximize2')).toBe(false)
    expect(treeSource.includes('planning-unsaved-edit-guard')).toBe(true)
    expect(treeSource.includes('保存并退出')).toBe(true)
    expect(treeSource.includes('放弃更改')).toBe(true)
    expect(treeSource.includes('继续编辑')).toBe(true)
  })

  it('keeps task-list generation and template actions grouped away from the main toolbar', () => {
    const source = readGanttViewSource()
    const actionsSource = readTaskListBusinessActionsSource()
    const businessActionSlotsSource = readGanttBusinessActionSlotsSource()
    const auxiliaryDialogsSource = readGanttAuxiliaryDialogsSource()
    const rowsSource = readGanttViewRowsSource()

    expect(source.includes('handleOpenTaskListWizard')).toBe(true)
    expect(source.includes("openModelingWorkbench(task ? 'expand' : 'generate', task?.id)")).toBe(true)
    expect(source.includes("nextSearch.set('taskPlanTaskId', taskId)")).toBe(true)
    expect(source.includes('handleOpenTemplateAdjustWizard')).toBe(true)
    expect(source.includes("openModelingWorkbench('adjust')")).toBe(true)
    expect(source.includes('/projects/new')).toBe(false)
    expect(source.includes('modelingWorkbench')).toBe(true)
    expect(source.includes('PlanningModelingWorkbenchDialog')).toBe(true)
    expect(source.includes('onOpenTaskListWizard: handleOpenTaskListWizard')).toBe(true)
    expect(source.includes('onOpenReconcile: handleOpenTemplateAdjustWizard')).toBe(true)
    expect(source.includes('onGenerateTasks={handleOpenTaskListWizard}')).toBe(true)
    expect(source.includes('onGenerateTasks={() => setTemplateGenerateOpen(true)}')).toBe(false)
    expect(source.includes('templateGenerateProps')).toBe(false)
    expect(source.includes('setTemplateGenerateOpen')).toBe(false)
    expect(rowsSource.includes('LazyWbsTemplateGenerateInlinePanel')).toBe(false)
    expect(rowsSource.includes('WbsTemplateGenerateDialog')).toBe(false)
    expect(rowsSource.includes('props.onGenerateTasks?.(task)')).toBe(true)
    expect(auxiliaryDialogsSource.includes('LazyWbsTemplateGenerateDialog')).toBe(false)
    expect(businessActionSlotsSource.includes('onOpenTaskListWizard: () => void')).toBe(true)
    expect(businessActionSlotsSource.includes('onGenerateTasks={onOpenTaskListWizard}')).toBe(true)
    expect(businessActionSlotsSource.includes('setTemplateGenerateOpen')).toBe(false)
    expect(businessActionSlotsSource.includes('openTemplateGenerate')).toBe(false)
    expect(actionsSource.includes('data-testid="gantt-generation-template-menu"')).toBe(true)
    expect(actionsSource.includes('生成与模板')).toBe(true)
    expect(actionsSource.includes('智能生成任务')).toBe(true)
    expect(actionsSource.includes('导入计划文件')).toBe(true)
    expect(actionsSource.includes('工程对象')).toBe(true)
    expect(actionsSource.includes('范围维度')).toBe(false)
    expect(actionsSource.includes('data-testid="gantt-open-engineering-objects"')).toBe(true)
    expect(actionsSource.includes('data-testid="gantt-open-scope-dimensions"')).toBe(false)
    expect(actionsSource.includes('重新调整模板')).toBe(true)
    expect(actionsSource.includes('另存为公司模板')).toBe(true)
    expect(actionsSource.includes('data-testid="gantt-critical-path-summary-chip"')).toBe(true)
    expect(actionsSource.includes('data-testid="gantt-open-task-filters"')).toBe(true)
    expect(actionsSource.includes('data-testid="gantt-task-list-light-more"')).toBe(true)
    expect(actionsSource.includes('gantt-open-critical-path-dialog')).toBe(false)
  })

  it('keeps Gantt engineering-object orchestration off retired scope-dimension names', () => {
    const source = readGanttViewSource()
    const actionsSource = readTaskListBusinessActionsSource()
    const businessActionSlotsSource = readGanttBusinessActionSlotsSource()
    const detailDrawerSource = readGanttDetailDrawerComponentSource()
    const auxiliaryDialogsSource = readGanttAuxiliaryDialogsSource()

    expect(source.includes('engineeringObjectsOpen')).toBe(true)
    expect(source.includes('setEngineeringObjectsOpen')).toBe(true)
    expect(source.includes('handleOpenEngineeringObjects')).toBe(true)
    expect(source.includes('scopeDimensionsOpen')).toBe(false)
    expect(source.includes('setScopeDimensionsOpen')).toBe(false)
    expect(source.includes('handleOpenScopeDimensions')).toBe(false)
    expect(source.includes('onOpenScopeDimensions')).toBe(false)
    expect(actionsSource.includes('onOpenEngineeringObjects')).toBe(true)
    expect(actionsSource.includes('onOpenScopeDimensions')).toBe(false)
    expect(businessActionSlotsSource.includes('handleOpenEngineeringObjects')).toBe(true)
    expect(businessActionSlotsSource.includes('setEngineeringObjectsOpen')).toBe(true)
    expect(businessActionSlotsSource.includes('handleOpenScopeDimensions')).toBe(false)
    expect(businessActionSlotsSource.includes('setScopeDimensionsOpen')).toBe(false)
    expect(detailDrawerSource.includes('onOpenEngineeringObjects')).toBe(true)
    expect(detailDrawerSource.includes('onOpenScopeDimensions')).toBe(false)
    expect(auxiliaryDialogsSource.includes('engineeringObjectsBridgeProps')).toBe(true)
    expect(auxiliaryDialogsSource.includes('EngineeringObjectsDialogBridge')).toBe(true)
    expect(auxiliaryDialogsSource.includes('EngineeringObjectsDialogBridge')).toBe(true)
    expect(auxiliaryDialogsSource.includes('ScopeDimensionsDialogBridge')).toBe(false)
    expect(auxiliaryDialogsSource.includes("import('./EngineeringObjectsDialogBridge')")).toBe(true)
    expect(auxiliaryDialogsSource.includes("import('./ScopeDimensionsDialogBridge')")).toBe(false)
    expect(auxiliaryDialogsSource.includes('scopeBridgeProps')).toBe(false)
  })

  it('short-circuits the heavy task workspace while the modeling workbench is open', () => {
    const source = readGanttViewSource()
    const workbenchSource = readPlanningModelingWorkbenchDialogSource()

    expect(source.includes('function readModelingWorkbenchMode')).toBe(true)
    expect(source.includes('if (modelingWorkbenchMode)')).toBe(true)
    expect(source.includes('return <GanttViewContent />')).toBe(true)
    expect(source.indexOf('if (modelingWorkbenchMode)')).toBeLessThan(source.indexOf('function GanttViewContent()'))
    expect(source.indexOf('function GanttViewContent()')).toBeLessThan(source.indexOf('<GanttTaskRows'))
    expect(workbenchSource.includes("from '@/components/ui/dialog'")).toBe(false)
    expect(workbenchSource.includes('<Dialog')).toBe(false)
    expect(workbenchSource.includes('DialogContent')).toBe(false)
    expect(workbenchSource.includes('translate-x')).toBe(false)
    expect(workbenchSource.includes('data-[state=open]:zoom-in')).toBe(false)
  })

  it('shows wizard target acceleration review inside the generated task list', () => {
    const source = readGanttViewSource()
    const rowsSource = readGanttViewRowsSource()
    const panelSource = readTargetAccelerationReviewPanelSource()

    expect(source.includes('TargetAccelerationReviewPanel')).toBe(true)
    expect(source.includes('workbuddy:wizard-acceleration:')).toBe(true)
    expect(source.includes('targetFeasibility={wizardTargetFeasibility}')).toBe(true)
    expect(rowsSource.includes('accelerationTaskBadge')).toBe(true)
    expect(rowsSource.includes('getAccelerationTaskClassName')).toBe(true)
    expect(panelSource.includes('目标工期偏紧')).toBe(true)
    expect(panelSource.includes('当前进度存在按期风险')).toBe(true)
    expect(panelSource.includes('工期压缩预案')).toBe(true)
    expect(panelSource.includes('系统如何判断可追回时间')).toBe(true)
    expect(panelSource.includes('提前穿插')).toBe(true)
    expect(panelSource.includes('增加资源')).toBe(true)
    expect(panelSource.includes('交付决策')).toBe(true)
    expect(panelSource.includes('这些时间不建议压缩')).toBe(true)
    expect(panelSource.includes('剩余缺口')).toBe(false)
    expect(panelSource.includes('硬约束')).toBe(true)
  })

  it('shows operational wizard generation evidence without PM approval UI', () => {
    const source = readGanttViewSource()

    expect(source.includes('workbuddy:wizard-generation-evidence:')).toBe(true)
    expect(source.includes("searchParams.get('wizard_evidence') === 'true'")).toBe(true)
    expect(source.includes('生成证据已接入')).toBe(true)
    expect(source.includes('候选工期资产')).toBe(true)
    expect(source.includes('runtime seed')).toBe(true)
    expect(source.includes('fallback seed')).toBe(true)
    expect(source.includes('runtime T2')).toBe(true)
    expect(source.includes('已发布学习校准')).toBe(true)
    expect(source.includes('当前计划已使用系统冷启动资产；已发布学习校准仅作为可选覆盖，不影响计划使用。')).toBe(true)
    expect(source.includes('候选资产覆盖不等于生产可用')).toBe(false)
    expect(source.includes('候选工期依据明细')).toBe(true)
    expect(source.includes('formatWizardDurationAssetPreviewDependencyLineage')).toBe(true)
    expect(source.includes('normalizeDurationRiskDistribution')).toBe(true)
    expect(source.includes('const referenceDays = item.runtimeReferenceDaysP50Days')).toBe(false)
    expect(source.includes('候选关键路径')).toBe(true)
    expect(source.includes('候选验收计划')).toBe(true)
    expect(source.includes('只读证据，不写入任务、依赖或工期 runtime')).toBe(true)
    expect(source.includes('planQualityDiagnostics')).toBe(true)
    expect(source.includes('projectManagerReviewPackage')).toBe(false)
    expect(source.includes('项目经理审查清单')).toBe(false)
    expect(source.includes('candidate_project_manager_review_required')).toBe(false)
  })

  it('rehydrates post-commit wizard generation evidence from project metadata after the handoff URL is gone', () => {
    const source = readGanttViewSource()

    expect(source.includes('readWizardGenerationEvidenceFromProjectMetadata')).toBe(true)
    expect(source.includes('currentProject?.metadata')).toBe(true)
    expect(source.includes('wizard_generation_candidate_duration_asset_preview')).toBe(true)
    expect(source.includes('wizard_generation_candidate_network_evaluation')).toBe(true)
    expect(source.includes('wizard_generation_candidate_acceptance_plan_preview')).toBe(true)
    expect(source.includes('wizard_generation_plan_quality_diagnostics')).toBe(true)
    expect(source.includes('wizard_generation_project_manager_review_package')).toBe(false)
    expect(source.includes('wizard_generation_critical_path_refresh')).toBe(true)
    expect(source.includes('真实关键路径刷新')).toBe(true)
  })

  it('lets the Gantt remaining forecast card request runtime schedule acceleration evaluation', () => {
    const source = readGanttViewSource()
    const apiSource = readProjectRemainingForecastApiSource()

    expect(apiSource.includes('/schedule-acceleration/evaluate')).toBe(true)
    expect(source.includes('evaluateProjectScheduleAcceleration')).toBe(true)
    expect(source.includes('handleEvaluateRuntimeScheduleAcceleration')).toBe(true)
    expect(source.includes('evaluatingRuntimeAcceleration')).toBe(true)
    expect(source.includes('setWizardTargetFeasibility(result.targetFeasibility)')).toBe(true)
    expect(source.includes('onOpenAcceleration={handleEvaluateRuntimeScheduleAcceleration}')).toBe(true)
  })

  it('lets users accept target acceleration reschedule drafts through governed task-list commits', () => {
    const source = readGanttViewSource()
    const panelSource = readTargetAccelerationReviewPanelSource()

    expect(source.includes('buildAccelerationRescheduleCommitOperations')).toBe(true)
    expect(source.includes('handleAcceptAccelerationRescheduleDraft')).toBe(true)
    expect(source.includes("draft.writePolicy !== 'requires_user_acceptance'")).toBe(true)
    expect(source.includes('return draft.operations as PlanningTableOperation[]')).toBe(true)
    expect(source.includes('commitTaskListOperations(operations, accelerationRecommendation)')).toBe(true)
    expect(source.includes('applyCommittedTaskRows(committed.rows)')).toBe(true)
    expect(source.includes("if (!committed.requestId) throw new Error('Task commit request identity is missing.')")).toBe(true)
    expect(source.includes('recordScheduleAccelerationRecommendationAdoption(')).toBe(true)
    expect(source).toMatch(/id,\r?\n\s+accelerationRecommendation,\r?\n\s+committed\.requestId,/)
    expect(source.includes('onAcceptRescheduleDraft={handleAcceptAccelerationRescheduleDraft}')).toBe(true)
    expect(source.includes('acceptingRescheduleDraft={acceptingAccelerationDraft}')).toBe(true)
    expect(panelSource.includes('采纳重排草案')).toBe(true)
    expect(panelSource.includes('重排差异预览')).toBe(true)
  })

  it('keeps pasted responsible units governed by participant-unit lookup ids', () => {
    const actionsSource = readGanttTaskTableActionsSource()
    const clipboardUtilsSource = readTaskClipboardUtilsSource()

    expect(clipboardUtilsSource.includes('findParticipantUnitForPlanningPaste')).toBe(true)
    expect(clipboardUtilsSource.includes('patch.participant_unit_id = matchedParticipantUnit.id')).toBe(true)
    expect(clipboardUtilsSource.includes('patch.responsible_unit = matchedParticipantUnit.unit_name')).toBe(false)
    expect(actionsSource.includes('已跳过 ${skippedUnitCount} 个未匹配责任单位')).toBe(true)
    expect(actionsSource.includes('participantUnits, taskTableEditing, tasks]')).toBe(true)
  })

  it('keeps pasted engineering objects governed by engineering-object lookup ids', () => {
    const source = readGanttViewSource()
    const treeSource = readPlanningTreeSource()
    const draftUtilsSource = readTaskDraftUtilsSource()
    const detailDrawerComponentSource = readGanttDetailDrawerComponentSource()
    const clipboardUtilsSource = readTaskClipboardUtilsSource()

    expect(treeSource.includes("{ key: 'scope', label: '工程对象'")).toBe(true)
    expect(clipboardUtilsSource.includes('findEngineeringObjectForPlanningPaste')).toBe(true)
    expect(clipboardUtilsSource.includes('buildTaskScopePatchFromEngineeringObject(matchedEngineeringObject.id, matchedEngineeringObject)')).toBe(true)
    expect(detailDrawerComponentSource.includes('onSaveScopeObject')).toBe(true)
    expect(draftUtilsSource.includes("patch.engineering_object_id !== undefined")).toBe(true)
  })

  it('keeps shared confirm dialog render path available for global confirmations', () => {
    const source = readGanttViewSource()
    const conditionActionsSource = readGanttConditionActionsSource()

    expect(source.includes('const shouldRenderGanttDialogs =')).toBe(true)
    expect(source.includes('|| confirmDialog.open')).toBe(true)
    expect(conditionActionsSource.includes('openConfirm(')).toBe(true)
  })

  it('shows the condition warning modal when the first progress update advances a task with unmet conditions', () => {
    const source = readGanttViewSource()
    const auxiliaryDialogsSource = readGanttAuxiliaryDialogsSource()
    const actionsSource = readGanttTaskTableActionsSource()
    const dialogActionsSource = readGanttTaskDialogActionsSource()

    expect(source.includes('const [conditionWarningTarget, setConditionWarningTarget] = useState')).toBe(true)
    expect(actionsSource.includes('const shouldWarnConditionAdvance = prevProgress === 0 && newProgress > 0 && pendingConditionCount > 0')).toBe(true)
    expect(actionsSource.includes('openConditionWarning(task, pendingConditionCount)')).toBe(true)
    expect(dialogActionsSource.includes('openConditionWarning(editingTask, unmetEditingTaskConditions.length)')).toBe(true)
    expect(source.includes('<GanttAuxiliaryDialogs')).toBe(true)
    expect(auxiliaryDialogsSource.includes('LazyConditionWarningModal')).toBe(true)
    expect(auxiliaryDialogsSource.includes('{conditionWarningProps.open ? <LazyConditionWarningModal {...conditionWarningProps} /> : null}')).toBe(true)
  })

  it('keeps sortable drag attributes on the drag handle so keyboard sorting stays reachable', () => {
    const source = readGanttComponentsSource()

    expect(source.includes('{...attributes}')).toBe(true)
    expect(source.includes('{...listeners}')).toBe(true)
    expect(source.includes('data-testid={`gantt-task-drag-handle-${id}`}')).toBe(true)
  })

  it('keeps task save routed through the shared commit model', () => {
    const source = readGanttViewSource()
    const commitActionsSource = readGanttTaskCommitActionsSource()
    const dialogActionsSource = readGanttTaskDialogActionsSource()
    const draftUtilsSource = readTaskDraftUtilsSource()

    expect(draftUtilsSource.includes("type: 'update_row'")).toBe(true)
    expect(draftUtilsSource.includes("type: 'create_row'")).toBe(true)
    expect(draftUtilsSource.includes("type: 'set_predecessors'")).toBe(true)
    expect(commitActionsSource.includes('const committed: CommitTaskListResult = await commitTaskListOperations(operations)')).toBe(true)
    expect(source.includes("usePlanningFieldRegistry(id, 'task_list')")).toBe(true)
    expect(commitActionsSource.includes('fieldRegistryVersion: resolvedFieldRegistryVersion')).toBe(true)
    expect(commitActionsSource.includes('applyCommittedTaskRows(committed.rows)')).toBe(true)
    expect(dialogActionsSource.includes('} finally {')).toBe(true)
    expect(dialogActionsSource.includes('setTaskSaving(false)')).toBe(true)
  })

  it('keeps material obstacles linked to the materials page with unit prefilter', () => {
    const source = readGanttDialogsSource()

    expect(source.includes("obstacle.obstacle_type === '材料'")).toBe(true)
    expect(source.includes('/materials?unit=${encodeURIComponent(props.obstacleTask.participant_unit_id)}')).toBe(true)
    expect(source.includes('查看相关材料')).toBe(true)
  })

  it('keeps condition creation on the shared new-condition form', () => {
    const source = readGanttDialogsSource()

    expect(source.includes('NewConditionForm')).toBe(true)
    expect(source.includes('onSubmit={props.handleAddConditionValue}')).toBe(true)
    expect(source.includes('选择前置任务（可多选）')).toBe(true)
  })
})
