import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

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
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate GanttViewFilters.tsx in: ${candidates.join(', ')}`)
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

describe('GanttView source contracts', () => {
  it('keeps shared delay-request truth instead of task-local fetch truth', () => {
    const source = readGanttViewSource()

    expect(source.includes('const delayRequests = useStore((state) => state.delayRequests)')).toBe(true)
    expect(source.includes('const selectedTaskDelayRequests = useMemo(')).toBe(true)
    expect(source.includes('const [selectedTaskDelayRequests, setSelectedTaskDelayRequests]')).toBe(false)
    expect(source.includes('/api/delay-requests?taskId=')).toBe(false)
  })

  it('keeps admin-force satisfy wired to the corrected backend semantics', () => {
    const source = readGanttViewSource()

    expect(source.includes("satisfied_reason: 'admin_force'")).toBe(true)
    expect(source.includes("change_source: 'admin_force'")).toBe(true)
    expect(source.includes('satisfied_reason_note')).toBe(true)
    expect(source.includes('change_reason')).toBe(true)
    expect(source.includes('forceSatisfyReason')).toBe(true)
  })

  it('keeps project owner included in delay review permissions', () => {
    const source = readGanttViewSource()

    expect(source.includes('if (currentProject?.owner_id && currentProject.owner_id === currentUser.id) return true')).toBe(true)
    expect(source.includes('currentProject?.owner_id')).toBe(true)
  })

  it('keeps delete protection dialogs wired to close-action fallbacks', () => {
    const source = readGanttViewSource()

    expect(source.includes('gantt-delete-protection-dialog')).toBe(true)
    expect(source.includes('secondaryActionLabel={')).toBe(true)
    expect(source.includes('deleteGuardTarget.details?.close_action?.label')).toBe(true)
    expect(source.includes("buildDeleteProtectionState('task'")).toBe(true)
    expect(source.includes("buildDeleteProtectionState('obstacle'")).toBe(true)
    expect(source.includes('/api/tasks/${taskId}/close')).toBe(true)
    expect(source.includes('/api/task-obstacles/${obsId}/close')).toBe(true)
    expect(source.includes("deleteGuardTarget.kind === 'task' ? '删除任务失败' : '删除阻碍失败'")).toBe(true)
    expect(source.includes('deleteGuardTarget.blocked')).toBe(true)
    expect(source.includes('openTaskDeleteGuard')).toBe(true)
  })

  it('keeps batch delete routed through the guarded delete flow', () => {
    const source = readGanttViewSource()

    expect(source.includes('const handleBatchDelete = async () => {')).toBe(true)
    expect(source.includes("openConfirm('批量删除任务'")).toBe(true)
    expect(source.includes("buildDeleteProtectionState('task'")).toBe(true)
    expect(source.includes('其余任务命中删除保护')).toBe(true)
  })

  it('keeps batch complete optimistic with background sync fallback', () => {
    const source = readGanttViewSource()

    expect(source.includes('const syncBatchCompletionWrites = async (')).toBe(true)
    expect(source.includes('后台同步中。')).toBe(true)
    expect(source.includes('void syncBatchCompletionWrites(tasksToPersist, optimisticUpdatedAt)')).toBe(true)
    expect(source.indexOf('setSelectedIds(new Set())')).toBeLessThan(source.indexOf('void syncBatchCompletionWrites(tasksToPersist, optimisticUpdatedAt)'))
    expect(source.includes("title: '部分任务同步失败'")).toBe(true)
  })

  it('does not block gantt first paint on critical path summary loading', () => {
    const source = readGanttViewSource()

    expect(source.includes('if (loading) {')).toBe(true)
    expect(source.includes('if (loading || (criticalPathLoading && !criticalPathSummary)) {')).toBe(false)
  })

  it('keeps critical path delay derived from hook params instead of leaking an undefined options reference', () => {
    const source = readGanttCriticalPathHookSource()

    expect(source.includes('export function useGanttCriticalPath({ projectId, summaryDelayMs = 800 }: UseGanttCriticalPathOptions)')).toBe(true)
    expect(source.includes('}, [abortDialogRequest, abortSummaryRequest, loadCriticalPathSummary, summaryDelayMs])')).toBe(true)
    expect(source.includes('options.summaryDelayMs')).toBe(false)
  })

  it('keeps task title single-click focused on details instead of opening edit dialog', () => {
    const source = readGanttRowSectionsSource()

    expect(source.includes('title="单击查看详情，双击快速改名"')).toBe(true)
    expect(source.includes('title="单击打开编辑，双击快速改名"')).toBe(false)
    expect(source.includes('onSelectTask(task)')).toBe(true)
  })

  it('keeps gantt filters and stats aligned to the three-tier lag model', () => {
    const source = readGanttFiltersSource()

    expect(source.includes('laggedTaskCount')).toBe(true)
    expect(source.includes('受阻任务')).toBe(false)
    expect(source.includes('lagging_mild')).toBe(true)
    expect(source.includes('lagging_moderate')).toBe(true)
    expect(source.includes('lagging_severe')).toBe(true)
    expect(source.includes('SelectItem value="blocked"')).toBe(false)
    expect(source.includes('option value="blocked"')).toBe(false)
  })

  it('keeps the task detail drawer as the gantt progress entry point', () => {
    const source = readGanttPanelsSource()

    expect(source.includes('gantt-progress-entry-panel')).toBe(true)
    expect(source.includes('gantt-progress-save')).toBe(true)
    expect(source.includes('selectedTaskConditionSummary')).toBe(true)
    expect(source.includes('selectedTaskObstacleCount')).toBe(true)
    expect(source.includes('gantt-delay-request-panel')).toBe(true)
    expect(source.includes('delayPanelId')).toBe(true)
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
    const headerSource = readGanttViewHeaderSource()

    expect(source.includes('gantt_view_mode_')).toBe(true)
    expect(source.includes('timeline_projection')).toBe(true)
    expect(source.includes("const shouldReuseHydratedTasks = !options?.force && hydratedProjectId === id && viewMode === 'list'")).toBe(true)
    expect(source.includes('TaskTimelineView')).toBe(true)
    expect(headerSource.includes('gantt-switch-list-view')).toBe(true)
    expect(headerSource.includes('gantt-switch-timeline-view')).toBe(true)
  })

  it('only rehydrates timeline baseline ids from the URL after the baseline options are known valid', () => {
    const source = readGanttViewSource()

    expect(source.includes('const validBaselineOptionIds = useMemo(')).toBe(true)
    expect(source.includes('validBaselineOptionIds.has(nextBaselineVersionId)')).toBe(true)
    expect(source.includes('const loadBaselineOptions = useCallback(async (requestOptions?: { signal?: AbortSignal }) => {')).toBe(true)
    expect(source.includes('setBaselineOptions(nextOptions)')).toBe(true)
  })

  it('keeps gantt subscribed to project realtime mutations with forced refresh', () => {
    const source = readGanttViewSource()

    expect(source.includes('const lastRealtimeEvent = useStore((state) => state.lastRealtimeEvent)')).toBe(true)
    expect(source.includes("lastRealtimeEvent.channel !== 'project' || lastRealtimeEvent.projectId !== id")).toBe(true)
    expect(source.includes("['task', 'delay_request', 'task_condition', 'task_obstacle', 'milestone'].includes(entityType)")).toBe(true)
    expect(source.includes('const refreshGanttProjectData = useCallback(async (options?: {')).toBe(true)
    expect(source.includes("loadTasks({ signal: options?.signal, force: true })")).toBe(true)
    expect(source.includes('loadProjectConditions({ signal: options?.signal })')).toBe(true)
    expect(source.includes('loadProjectObstacles({ signal: options?.signal })')).toBe(true)
    expect(source.includes('loadDelayRequests({ signal: options?.signal })')).toBe(true)
    expect(source.includes('window.setInterval(refreshVisiblePage, 4000)')).toBe(true)
    expect(source.indexOf('const refreshGanttProjectData = useCallback(async (options?: {'))
      .toBeGreaterThan(source.indexOf('const loadProjectSummary = useCallback(async (options?: { signal?: AbortSignal }) => {'))
    expect(source.indexOf('const refreshGanttProjectData = useCallback(async (options?: {'))
      .toBeGreaterThan(source.indexOf('const loadDataQualitySummary = useCallback(async (options?: { signal?: AbortSignal }) => {'))
  })

  it('keeps delay review and form defaults aligned to planned end date truth', () => {
    const source = readGanttViewSource()

    expect(source.includes('const defaultDelayedDate = toDateValue(selectedTask.planned_end_date || selectedTask.end_date)')).toBe(true)
    expect(source.includes('delayedDate: taskChanged ? defaultDelayedDate : (previous.delayedDate || defaultDelayedDate)')).toBe(true)
    expect(source.includes("const currentDelayBaseDate = selectedTask?.planned_end_date || selectedTask?.end_date || ''")).toBe(true)
    expect(source.includes("const originalPlannedEndDate = selectedTask.planned_end_date || selectedTask.end_date || ''")).toBe(true)
    expect(source.includes('delayedDate: toDateValue(nextTask.planned_end_date || nextTask.end_date)')).toBe(true)
    expect(source.includes("action === 'approve'")).toBe(true)
    expect(source.includes('const taskResponse = await fetch')).toBe(true)
  })

  it('keeps completed status writes aligned with 100% progress truth', () => {
    const source = readGanttViewSource()

    expect(source.includes('const statusPayload: Record<string, unknown> = {')).toBe(true)
    expect(source.includes("if (normalizedStatus === 'completed') {")).toBe(true)
    expect(source.includes('statusPayload.progress = 100')).toBe(true)
    expect(source.includes("...(typeof updatedTask?.progress === 'number'")).toBe(true)
  })

  it('keeps shared confirm dialog render path available for batch delete and other global confirmations', () => {
    const source = readGanttViewSource()

    expect(source.includes('const shouldRenderGanttDialogs =')).toBe(true)
    expect(source.includes('|| confirmDialog.open')).toBe(true)
    expect(source.includes("openConfirm('批量删除任务'")).toBe(true)
  })

  it('shows the condition warning modal when the first progress update advances a task with unmet conditions', () => {
    const source = readGanttViewSource()

    expect(source.includes('const [conditionWarningTarget, setConditionWarningTarget] = useState')).toBe(true)
    expect(source.includes('const shouldWarnConditionAdvance = prevProgress === 0 && newProgress > 0 && pendingConditionCount > 0')).toBe(true)
    expect(source.includes('openConditionWarning(task, pendingConditionCount)')).toBe(true)
    expect(source.includes('openConditionWarning(editingTask, unmetEditingTaskConditions.length)')).toBe(true)
    expect(source.includes('<ConditionWarningModal')).toBe(true)
  })

  it('keeps sortable drag attributes on the drag handle so keyboard sorting stays reachable', () => {
    const source = readGanttComponentsSource()

    expect(source.includes('{...attributes}')).toBe(true)
    expect(source.includes('{...listeners}')).toBe(true)
    expect(source.includes('data-testid={`gantt-task-drag-handle-${id}`}')).toBe(true)
  })

  it('keeps conflict resolution available after a 409 save response', () => {
    const source = readGanttViewSource()

    expect(source).toMatch(/if \(res\.status === 409\) \{[\s\S]*setConflictOpen\(true\)[\s\S]*return/)
    expect(source.includes('} finally {')).toBe(true)
    expect(source.includes('setTaskSaving(false)')).toBe(true)
  })

  it('keeps material obstacles linked to the materials page with unit prefilter', () => {
    const source = readGanttDialogsSource()

    expect(source.includes("obstacle.obstacle_type === '材料'")).toBe(true)
    expect(source.includes('/materials?unit=${encodeURIComponent(props.obstacleTask.participant_unit_id)}')).toBe(true)
    expect(source.includes('查看相关材料')).toBe(true)
  })
})
