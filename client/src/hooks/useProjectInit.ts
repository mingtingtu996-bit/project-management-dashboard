import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { ApiClientError, apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  type ChangeLogEntry,
  type DelayRequestRecord,
  type IssueRecord,
  type TaskProgressSnapshotRecord,
  type WarningRecord,
  useCurrentProject,
  useSetChangeLogs,
  useHydratedProjectId,
  useSetConditions,
  useSetCurrentProject,
  useSetDelayRequests,
  useSetHydratedProjectId,
  useSetIssueRows,
  useSetMilestones,
  useSetObstacles,
  useSetProblemRows,
  useSetRisks,
  useSetSharedSliceStatus,
  useSetTasks,
  useSetTaskProgressSnapshots,
  useSetWarnings,
} from '@/hooks/useStore'
import { projectDb, type Project as LocalProject } from '@/lib/localDb'
import { toPersistedProject } from '@/lib/projectPersistence'
import { prefetchProjectTasks } from '@/lib/projectTaskPrefetch'
import type {
  Milestone,
  Project as StoreProject,
  Risk,
  Task,
  TaskCondition,
  TaskObstacle,
} from '@/lib/supabase'
import { buildProjectTaskProgressSnapshot } from '@/lib/taskBusinessStatus'

type ApiTask = Partial<Task> & Record<string, unknown> & {
  assignee_id?: string | null
  assignee_name?: string | null
  assignee_unit?: string | null
  responsible_unit?: string | null
  progress?: number | string | null
  is_milestone?: boolean | null
}
type ApiRisk = Partial<Risk> & Record<string, unknown>
type ApiCondition = Partial<TaskCondition> &
  Record<string, unknown> & {
    is_satisfied?: boolean | number | null
  }
type ApiObstacle = Partial<TaskObstacle> &
  Record<string, unknown> & {
    is_resolved?: boolean | number | null
  }
type ApiWarning = Partial<WarningRecord> & Record<string, unknown>
type ApiIssue = Partial<IssueRecord> &
  Record<string, unknown> & {
    pending_manual_close?: boolean | number | null
    source_type?: string | null
    source_entity_type?: string | null
    task_id?: string | null
    chain_id?: string | null
    created_at?: string | null
    version?: number | null
  }
type ApiDelayRequest = Partial<DelayRequestRecord> & Record<string, unknown>
type ApiChangeLog = Partial<ChangeLogEntry> & Record<string, unknown>
type ApiTaskProgressSnapshot = Partial<TaskProgressSnapshotRecord> & Record<string, unknown>

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function truthyLike(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function normalizeTask(task: ApiTask): Task {
  return {
    ...task,
    title: task.title ?? '',
    name: task.title ?? '',
    start_date: task.start_date ?? task.planned_start_date ?? null,
    end_date: task.end_date ?? task.planned_end_date ?? null,
    planned_start_date: task.planned_start_date ?? task.start_date ?? null,
    planned_end_date: task.planned_end_date ?? task.end_date ?? null,
    assignee: task.assignee_name ?? '',
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    assignee_name: task.assignee_name ?? '',
    assignee_unit: task.assignee_unit ?? '',
    responsible_unit: task.responsible_unit ?? '',
    progress: Number(task.progress ?? 0),
  }
}

function normalizeRisk(risk: ApiRisk): Risk {
  return {
    ...risk,
    title: risk.title ?? '',
    description: risk.description ?? '',
    status: risk.status ?? 'identified',
  }
}

function normalizeConditionStatus(condition: ApiCondition): TaskCondition['status'] {
  if (truthyLike(condition.is_satisfied)) {
    return '已确认'
  }

  const rawStatus = String(condition.status || '').trim()
  if (['已确认', '已满足', 'confirmed', 'satisfied', 'completed'].includes(rawStatus)) {
    return '已确认'
  }

  return '未满足'
}

function normalizeCondition(condition: ApiCondition): TaskCondition {
  const conditionName = condition.condition_name ?? ''

  return {
    ...condition,
    condition_name: conditionName,
    name: conditionName,
    description: condition.description ?? '',
    status: normalizeConditionStatus(condition),
    is_satisfied:
      truthyLike(condition.is_satisfied) ||
      normalizeConditionStatus(condition) === '已确认',
  }
}

function normalizeObstacleStatus(obstacle: ApiObstacle): TaskObstacle['status'] {
  if (truthyLike(obstacle.is_resolved)) {
    return '已解决'
  }

  const rawStatus = String(obstacle.status || '').trim()
  if (['已解决', 'resolved', 'closed'].includes(rawStatus)) {
    return '已解决'
  }

  if (['待处理', 'pending'].includes(rawStatus)) return '待处理'
  if (['处理中', 'processing', 'active'].includes(rawStatus)) return '处理中'

  return '处理中'
}

function normalizeObstacle(obstacle: ApiObstacle): TaskObstacle {
  const title = obstacle.title ?? ''

  return {
    ...obstacle,
    title,
    description: obstacle.description ?? '',
    status: normalizeObstacleStatus(obstacle),
    is_resolved:
      truthyLike(obstacle.is_resolved) ||
      normalizeObstacleStatus(obstacle) === '已解决',
  }
}

function normalizeWarning(item: ApiWarning): WarningRecord {
  return {
    ...item,
    id: String(item.id ?? ''),
    project_id: item.project_id ? String(item.project_id) : undefined,
    task_id: item.task_id ? String(item.task_id) : undefined,
    source_type: item.source_type ? String(item.source_type) : undefined,
    warning_signature: item.warning_signature ? String(item.warning_signature) : undefined,
    warning_type: String(item.warning_type ?? 'system'),
    warning_level: (String(item.warning_level ?? 'info').trim().toLowerCase() as 'info' | 'warning' | 'critical') || 'info',
    title: String(item.title ?? ''),
    description: String(item.description ?? ''),
    is_acknowledged: Boolean(item.is_acknowledged),
    created_at: item.created_at ? String(item.created_at) : undefined,
    updated_at: item.updated_at ? String(item.updated_at) : undefined,
    status: item.status ? String(item.status) : null,
    chain_id: item.chain_id ? String(item.chain_id) : null,
    first_seen_at: item.first_seen_at ? String(item.first_seen_at) : null,
    acknowledged_at: item.acknowledged_at ? String(item.acknowledged_at) : null,
    muted_until: item.muted_until ? String(item.muted_until) : null,
    escalated_to_risk_id: item.escalated_to_risk_id ? String(item.escalated_to_risk_id) : null,
    escalated_at: item.escalated_at ? String(item.escalated_at) : null,
    is_escalated: Boolean(item.is_escalated),
    resolved_at: item.resolved_at ? String(item.resolved_at) : null,
    resolved_source: item.resolved_source ? String(item.resolved_source) : null,
  }
}

function normalizeIssue(item: ApiIssue): IssueRecord {
  return {
    ...item,
    id: String(item.id ?? ''),
    title: String(item.title ?? item.description ?? '未命名问题'),
    description: item.description ? String(item.description) : undefined,
    severity: (String(item.severity ?? 'medium').trim().toLowerCase() as 'critical' | 'high' | 'medium' | 'low') || 'medium',
    status: (String(item.status ?? 'open').trim().toLowerCase() as 'open' | 'investigating' | 'resolved' | 'closed') || 'open',
    pendingManualClose: Boolean(item.pending_manual_close),
    version: typeof item.version === 'number' ? item.version : undefined,
    sourceType: String(item.source_type ?? 'manual'),
    sourceLabel: '',
    category: item.source_entity_type ? String(item.source_entity_type) : undefined,
    taskId: item.task_id ? String(item.task_id) : undefined,
    chainId: item.chain_id ? String(item.chain_id) : null,
    createdAt: item.created_at ? String(item.created_at) : undefined,
    source: 'issues',
  }
}

function normalizeDelayRequest(row: ApiDelayRequest): DelayRequestRecord {
  return {
    ...row,
    id: String(row.id ?? ''),
    task_id: row.task_id ? String(row.task_id) : undefined,
    project_id: row.project_id ? String(row.project_id) : null,
    baseline_version_id: row.baseline_version_id ? String(row.baseline_version_id) : null,
    original_date: row.original_date ? String(row.original_date) : null,
    delayed_date: row.delayed_date ? String(row.delayed_date) : null,
    delay_days: Number(row.delay_days ?? 0),
    reason: row.reason ? String(row.reason) : null,
    delay_reason: row.delay_reason ? String(row.delay_reason) : null,
    status: (String(row.status ?? 'pending').trim().toLowerCase() as 'pending' | 'approved' | 'rejected' | 'withdrawn') || 'pending',
    requested_by: row.requested_by ? String(row.requested_by) : null,
    requested_at: row.requested_at ? String(row.requested_at) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    withdrawn_at: row.withdrawn_at ? String(row.withdrawn_at) : null,
    chain_id: row.chain_id ? String(row.chain_id) : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }
}

function normalizeChangeLog(row: ApiChangeLog): ChangeLogEntry {
  return {
    ...row,
    id: String(row.id ?? ''),
    project_id: row.project_id ? String(row.project_id) : null,
    entity_type: String(row.entity_type ?? ''),
    entity_id: String(row.entity_id ?? ''),
    field_name: String(row.field_name ?? ''),
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? null,
    change_reason: row.change_reason ? String(row.change_reason) : null,
    changed_by: row.changed_by ? String(row.changed_by) : null,
    change_source: row.change_source ? String(row.change_source) : null,
    changed_at: row.changed_at ? String(row.changed_at) : null,
  }
}

function normalizeTaskProgressSnapshot(row: ApiTaskProgressSnapshot): TaskProgressSnapshotRecord {
  return {
    ...row,
    id: String(row.id ?? ''),
    task_id: row.task_id ? String(row.task_id) : undefined,
    project_id: row.project_id ? String(row.project_id) : undefined,
    recorded_at: row.recorded_at ? String(row.recorded_at) : null,
    progress: typeof row.progress === 'number' ? row.progress : Number(row.progress ?? 0),
    status: row.status ? String(row.status) : null,
    condition_count: typeof row.condition_count === 'number' ? row.condition_count : Number(row.condition_count ?? 0),
    satisfied_condition_count:
      typeof row.satisfied_condition_count === 'number'
        ? row.satisfied_condition_count
        : Number(row.satisfied_condition_count ?? 0),
    active_obstacle_count:
      typeof row.active_obstacle_count === 'number'
        ? row.active_obstacle_count
        : Number(row.active_obstacle_count ?? 0),
    risk_count: typeof row.risk_count === 'number' ? row.risk_count : Number(row.risk_count ?? 0),
    issue_count: typeof row.issue_count === 'number' ? row.issue_count : Number(row.issue_count ?? 0),
    payload: typeof row.payload === 'object' && row.payload !== null ? row.payload : null,
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
  }
}

function toMilestone(task: Task): Milestone {
  const title = task.title ?? ''
  return {
    id: task.id,
    project_id: task.project_id,
    title,
    name: title,
    description: task.description ?? '',
    target_date: task.planned_end_date ?? task.end_date ?? '',
    planned_end_date: task.planned_end_date ?? task.end_date ?? '',
    status: task.status ?? 'pending',
    completed_at: task.actual_end_date ?? undefined,
    created_at: task.created_at ?? new Date().toISOString(),
    updated_at: task.updated_at ?? new Date().toISOString(),
  }
}

function cacheProject(project: StoreProject & { id: string }): StoreProject {
  const persistedProject = toPersistedProject(project)
  projectDb.upsert(persistedProject)
  return persistedProject
}

type ProjectFetchResult =
  | { kind: 'found'; project: StoreProject; source: 'api' | 'cache' }
  | { kind: 'not_found' }
  | { kind: 'error'; error: unknown }

export type ProjectInitStatus = 'idle' | 'loading' | 'project_ready' | 'loaded' | 'not_found' | 'error'

async function fetchAndCacheProject(id: string, signal: AbortSignal): Promise<ProjectFetchResult> {
  const cachedProject = projectDb.getById(id) ?? null

  try {
    const project = await apiGet<StoreProject>(`/api/projects/${id}`, { signal })
    if (!project?.id) {
      return cachedProject
        ? { kind: 'found', project: cachedProject, source: 'cache' }
        : { kind: 'error', error: new Error('项目数据无效') }
    }

    const projectWithId: StoreProject & { id: string } = {
      ...project,
      id: project.id,
    }
    return { kind: 'found', project: cacheProject(projectWithId), source: 'api' }
  } catch (error) {
    if (isAbortError(error)) throw error

    if (error instanceof ApiClientError && error.status === 404) {
      return { kind: 'not_found' }
    }

    if (cachedProject) {
      return { kind: 'found', project: cachedProject, source: 'cache' }
    }

    return { kind: 'error', error }
  }
}

type UseProjectInitOptions = {
  mode?: 'full' | 'materials' | 'gantt'
}

export function useProjectInit(options: UseProjectInitOptions = {}) {
  const { id } = useParams<{ id: string }>()
  const currentProject = useCurrentProject()
  const hydratedProjectId = useHydratedProjectId()
  const setCurrentProject = useSetCurrentProject()
  const setHydratedProjectId = useSetHydratedProjectId()
  const setTasks = useSetTasks()
  const setRisks = useSetRisks()
  const setMilestones = useSetMilestones()
  const setConditions = useSetConditions()
  const setObstacles = useSetObstacles()
  const setWarnings = useSetWarnings()
  const setIssueRows = useSetIssueRows()
  const setProblemRows = useSetProblemRows()
  const setDelayRequests = useSetDelayRequests()
  const setChangeLogs = useSetChangeLogs()
  const setTaskProgressSnapshots = useSetTaskProgressSnapshots()
  const setSharedSliceStatus = useSetSharedSliceStatus()

  const [status, setStatus] = useState<ProjectInitStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const mode = options.mode ?? 'full'

  const retry = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!id) return

    const controller = new AbortController()

    const loadProject = async () => {
      setStatus('loading')
      setErrorMessage(null)
      setHydratedProjectId(null)

      if (mode === 'materials') {
        const cachedProject = projectDb.getById(id)
        setCurrentProject(
          cachedProject
            ? cachedProject
            : ({
                id,
              } as StoreProject),
        )
        setHydratedProjectId(id)
        setStatus('loaded')
        return
      }

      if (!currentProject || currentProject.id !== id) {
        setCurrentProject({ id } as StoreProject)
        setStatus('project_ready')
      }

      if (mode === 'gantt') {
        void prefetchProjectTasks(id, { signal: controller.signal })
          .then((tasks) => {
            if (controller.signal.aborted) return
            setTasks(tasks)
            setHydratedProjectId(id)
          })
          .catch((error) => {
            if (isAbortError(error)) return
            if (import.meta.env.DEV) {
              console.warn('[useProjectInit] gantt task prefetch failed', error)
            }
          })
      }

      try {
        const projectResult = await fetchAndCacheProject(id, controller.signal)

        if (projectResult.kind === 'not_found') {
          setCurrentProject(null)
          setStatus('not_found')
          return
        }

        if (projectResult.kind === 'error') {
          setCurrentProject(null)
          setStatus('error')
          setErrorMessage(getApiErrorMessage(projectResult.error, '无法加载项目数据，请稍后重试。'))
          return
        }

        setCurrentProject(projectResult.project)
        setStatus('project_ready')

        if (mode === 'gantt') {
          return
        }

        setSharedSliceStatus('warnings', { loading: true, error: null })
        setSharedSliceStatus('issueRows', { loading: true, error: null })
        setSharedSliceStatus('problemRows', { loading: true, error: null })
        setSharedSliceStatus('delayRequests', { loading: true, error: null })
        setSharedSliceStatus('changeLogs', { loading: true, error: null })
        setSharedSliceStatus('taskProgressSnapshots', { loading: true, error: null })

        const [
          tasksResult,
          risksResult,
          conditionsResult,
          obstaclesResult,
          warningsResult,
          issuesResult,
          delayRequestsResult,
          changeLogsResult,
          taskProgressSnapshotsResult,
        ] = await Promise.allSettled([
          apiGet<ApiTask[]>(`/api/tasks?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
          apiGet<ApiRisk[]>(`/api/risks?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
          apiGet<ApiCondition[]>(`/api/task-conditions?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
          apiGet<ApiObstacle[]>(`/api/task-obstacles?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
          apiGet<ApiWarning[]>(`/api/warnings?projectId=${encodeURIComponent(id)}&includeResolved=1`, { signal: controller.signal }),
          apiGet<ApiIssue[]>(`/api/issues?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
          apiGet<ApiDelayRequest[]>(`/api/delay-requests?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
          apiGet<ApiChangeLog[]>(`/api/change-logs?projectId=${encodeURIComponent(id)}&limit=100`, { signal: controller.signal }),
          apiGet<ApiTaskProgressSnapshot[]>(`/api/tasks/progress-snapshots?projectId=${encodeURIComponent(id)}`, { signal: controller.signal }),
        ])

        if (controller.signal.aborted) return

        const tasksData =
          tasksResult.status === 'fulfilled'
            ? normalizeArray(tasksResult.value).map(normalizeTask)
            : []
        const risksData =
          risksResult.status === 'fulfilled'
            ? normalizeArray(risksResult.value).map(normalizeRisk)
            : []
        const conditionsData =
          conditionsResult.status === 'fulfilled'
            ? normalizeArray(conditionsResult.value).map(normalizeCondition)
            : []
        const obstaclesData =
          obstaclesResult.status === 'fulfilled'
            ? normalizeArray(obstaclesResult.value).map(normalizeObstacle)
            : []

        const milestonesData = tasksData.filter((task) => Boolean(task.is_milestone)).map(toMilestone)
        const warningsData =
          warningsResult.status === 'fulfilled'
            ? normalizeArray(warningsResult.value).map(normalizeWarning)
            : []
        const issuesData =
          issuesResult.status === 'fulfilled'
            ? normalizeArray(issuesResult.value).map(normalizeIssue)
            : []
        const delayRequestsData =
          delayRequestsResult.status === 'fulfilled'
            ? normalizeArray(delayRequestsResult.value).map(normalizeDelayRequest)
            : []
        const changeLogsData =
          changeLogsResult.status === 'fulfilled'
            ? normalizeArray(changeLogsResult.value).map(normalizeChangeLog)
            : []
        const taskProgressSnapshotsData: TaskProgressSnapshotRecord[] =
          taskProgressSnapshotsResult.status === 'fulfilled'
            ? normalizeArray(taskProgressSnapshotsResult.value).map(normalizeTaskProgressSnapshot)
            : tasksData
                .filter((task): task is Task & { id: string } => Boolean(task.id))
                .map((task) => {
                  const snapshot = buildProjectTaskProgressSnapshot(
                    [task],
                    conditionsData.filter((condition) => condition.task_id === task.id),
                    obstaclesData.filter((obstacle) => obstacle.task_id === task.id),
                  )
                  return {
                    id: `local-${task.id}`,
                    task_id: task.id,
                    project_id: id,
                    recorded_at: task.updated_at ?? task.created_at ?? new Date().toISOString(),
                    progress: Number(task.progress ?? 0),
                    status: String(task.status ?? 'todo'),
                    condition_count: snapshot.taskConditionMap[task.id]?.total ?? 0,
                    satisfied_condition_count: snapshot.taskConditionMap[task.id]?.satisfied ?? 0,
                    active_obstacle_count: snapshot.obstacleCountMap[task.id] ?? 0,
                    risk_count: 0,
                    issue_count: 0,
                    payload: null,
                    created_at: task.created_at ?? null,
                    updated_at: task.updated_at ?? null,
                  }
                })

        setTasks(tasksData)
        setRisks(risksData)
        setMilestones(milestonesData)
        setConditions(conditionsData)
        setObstacles(obstaclesData)
        setWarnings(warningsData)
        setIssueRows(issuesData)
        setProblemRows(obstaclesData)
        setDelayRequests(delayRequestsData)
        setChangeLogs(changeLogsData)
        setTaskProgressSnapshots(taskProgressSnapshotsData)
        setSharedSliceStatus('warnings', {
          loading: false,
          error: warningsResult.status === 'rejected' ? getApiErrorMessage(warningsResult.reason, '预警数据加载失败') : null,
        })
        setSharedSliceStatus('issueRows', {
          loading: false,
          error: issuesResult.status === 'rejected' ? getApiErrorMessage(issuesResult.reason, '问题数据加载失败') : null,
        })
        setSharedSliceStatus('problemRows', {
          loading: false,
          error: obstaclesResult.status === 'rejected' ? getApiErrorMessage(obstaclesResult.reason, '阻碍数据加载失败') : null,
        })
        setSharedSliceStatus('delayRequests', {
          loading: false,
          error: delayRequestsResult.status === 'rejected' ? getApiErrorMessage(delayRequestsResult.reason, '延期申请数据加载失败') : null,
        })
        setSharedSliceStatus('changeLogs', {
          loading: false,
          error: changeLogsResult.status === 'rejected' ? getApiErrorMessage(changeLogsResult.reason, '变更记录加载失败') : null,
        })
        setSharedSliceStatus('taskProgressSnapshots', {
          loading: false,
          error:
            taskProgressSnapshotsResult.status === 'rejected'
              ? getApiErrorMessage(taskProgressSnapshotsResult.reason, '进度快照加载失败，已使用当前任务态回填')
              : null,
        })
        setHydratedProjectId(id)
        setStatus('loaded')

        if (import.meta.env.DEV) {
          console.log('[useProjectInit] initialized project from unified backend data', {
            projectId: id,
            source: projectResult.source,
            tasks: tasksData.length,
            risks: risksData.length,
            milestones: milestonesData.length,
            conditions: conditionsData.length,
            obstacles: obstaclesData.length,
            warnings: warningsData.length,
            issues: issuesData.length,
            delayRequests: delayRequestsData.length,
            changeLogs: changeLogsData.length,
            taskProgressSnapshots: taskProgressSnapshotsData.length,
          })
        }
      } catch (error) {
        if (isAbortError(error)) return

        console.error('[useProjectInit] failed to initialize project', error)
        setSharedSliceStatus('warnings', { loading: false, error: null })
        setSharedSliceStatus('issueRows', { loading: false, error: null })
        setSharedSliceStatus('problemRows', { loading: false, error: null })
        setSharedSliceStatus('delayRequests', { loading: false, error: null })
        setSharedSliceStatus('changeLogs', { loading: false, error: null })
        setSharedSliceStatus('taskProgressSnapshots', { loading: false, error: null })
        setCurrentProject(null)
        setStatus('error')
        setErrorMessage(getApiErrorMessage(error, '无法加载项目数据，请稍后重试。'))
      }
    }

    void loadProject()

    return () => {
      controller.abort()
    }
  }, [
    id,
    mode,
    reloadToken,
    setConditions,
    setCurrentProject,
    setChangeLogs,
    setDelayRequests,
    setHydratedProjectId,
    setIssueRows,
    setMilestones,
    setObstacles,
    setProblemRows,
    setRisks,
    setSharedSliceStatus,
    setTasks,
    setTaskProgressSnapshots,
    setWarnings,
  ])

  return {
    projectId: id,
    status,
    errorMessage,
    isLoaded:
      (status === 'project_ready' || status === 'loaded')
      && !!currentProject
      && currentProject.id === id,
    isHydrated: status === 'loaded' && !!currentProject && currentProject.id === id && hydratedProjectId === id,
    isLoading: status === 'loading',
    retry,
  }
}
