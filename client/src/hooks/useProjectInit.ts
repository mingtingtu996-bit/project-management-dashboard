import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { ApiClientError, apiGet, getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  type IssueRecord,
  type TaskProgressSnapshotRecord,
  type WarningRecord,
  useCurrentProject,
  useSetChangeLogs,
  useHydratedProjectId,
  useSetConditions,
  useSetCurrentProject,
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
import { prefetchProjectTasks } from '@/lib/projectTaskPrefetch'
import type {
  Milestone,
  Project as StoreProject,
  Risk,
  Task,
  TaskCondition,
  TaskObstacle,
} from '@/lib/supabase'

type ApiTask = Partial<Task> & Record<string, unknown> & {
  assignee_id?: string | null
  assignee_name?: string | null
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
    start_date: task.start_date ?? task.planned_start_date ?? null,
    end_date: task.end_date ?? task.planned_end_date ?? null,
    planned_start_date: task.planned_start_date ?? task.start_date ?? null,
    planned_end_date: task.planned_end_date ?? task.end_date ?? null,
    assignee: task.assignee_name ?? '',
    assignee_user_id: task.assignee_user_id ?? task.assignee_id ?? null,
    assignee_name: task.assignee_name ?? '',
    participant_unit_name: task.participant_unit_name ?? null,
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
  return {
    ...task,
    title: task.title ?? '',
    is_milestone: true,
  }
}

type ProjectFetchResult =
  | { kind: 'found'; project: StoreProject; source: 'api' }
  | { kind: 'not_found' }
  | { kind: 'error'; error: unknown }

type ProjectBootstrapPayload = {
  project?: StoreProject | null
  tasks?: ApiTask[] | null
  risks?: ApiRisk[] | null
  conditions?: ApiCondition[] | null
  obstacles?: ApiObstacle[] | null
  warnings?: ApiWarning[] | null
  issues?: ApiIssue[] | null
  taskProgressSnapshots?: ApiTaskProgressSnapshot[] | null
}

type ProjectBootstrapFetchResult =
  | { kind: 'found'; payload: ProjectBootstrapPayload; project: StoreProject; source: 'bootstrap' }
  | { kind: 'not_found' }
  | { kind: 'error'; error: unknown }

type NormalizedProjectSlices = {
  tasksData: Task[]
  risksData: Risk[]
  milestonesData: Milestone[]
  conditionsData: TaskCondition[]
  obstaclesData: TaskObstacle[]
  warningsData: WarningRecord[]
  issuesData: IssueRecord[]
  taskProgressSnapshotsData: TaskProgressSnapshotRecord[]
}

export type ProjectInitStatus = 'idle' | 'loading' | 'project_ready' | 'loaded' | 'not_found' | 'error'

async function fetchProject(id: string, signal: AbortSignal): Promise<ProjectFetchResult> {
  try {
    const project = await apiGet<StoreProject>(`/api/projects/${id}`, { signal })
    if (!project?.id) {
      return { kind: 'error', error: new Error('项目数据无效') }
    }

    const projectWithId: StoreProject & { id: string } = {
      ...project,
      id: project.id,
    }
    return { kind: 'found', project: projectWithId, source: 'api' }
  } catch (error) {
    if (isAbortError(error)) throw error

    if (error instanceof ApiClientError && error.status === 404) {
      return { kind: 'not_found' }
    }

    return { kind: 'error', error }
  }
}

type UseProjectInitOptions = {
  mode?: 'full' | 'materials' | 'gantt' | 'project_shell'
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
      const hasSameProject = currentProject?.id === id
      setStatus(hasSameProject ? 'project_ready' : 'loading')
      setErrorMessage(null)
      if (!hasSameProject) {
        setHydratedProjectId(null)
      }

      if (mode === 'materials') {
        setCurrentProject({ id } as StoreProject)
        setHydratedProjectId(id)
        setStatus('loaded')
        return
      }

      if (mode === 'project_shell') {
        setCurrentProject({ id } as StoreProject)
        setHydratedProjectId(id)
        setStatus('loaded')
        return
      }

      if (!currentProject || currentProject.id !== id) {
        setCurrentProject({ id } as StoreProject)
        setStatus('project_ready')
      }

      try {
        if (mode !== 'gantt') {
          const bootstrapResult = await fetchProjectBootstrap(id, controller.signal)

          if (bootstrapResult.kind === 'not_found') {
            setCurrentProject(null)
            setStatus('not_found')
            return
          }

          if (bootstrapResult.kind === 'found') {
            setCurrentProject(bootstrapResult.project)
            setStatus('project_ready')
            setSharedSliceStatus('warnings', { loading: true, error: null })
            setSharedSliceStatus('issueRows', { loading: true, error: null })
            setSharedSliceStatus('problemRows', { loading: true, error: null })
            setSharedSliceStatus('taskProgressSnapshots', { loading: true, error: null })

            const {
              tasksData,
              risksData,
              milestonesData,
              conditionsData,
              obstaclesData,
              warningsData,
              issuesData,
              taskProgressSnapshotsData,
            } = normalizeProjectSlices(bootstrapResult.payload)

            if (controller.signal.aborted) return

            setTasks(tasksData)
            setRisks(risksData)
            setMilestones(milestonesData)
            setConditions(conditionsData)
            setObstacles(obstaclesData)
            setWarnings(warningsData)
            setIssueRows(issuesData)
            setProblemRows(obstaclesData)
            setChangeLogs([])
            setTaskProgressSnapshots(taskProgressSnapshotsData)
            setSharedSliceStatus('warnings', { loading: false, error: null })
            setSharedSliceStatus('issueRows', { loading: false, error: null })
            setSharedSliceStatus('problemRows', { loading: false, error: null })
            setSharedSliceStatus('taskProgressSnapshots', { loading: false, error: null })
            setHydratedProjectId(id)
            setStatus('loaded')

            if (import.meta.env.DEV) {
              console.log('[useProjectInit] initialized project from bootstrap payload', {
                projectId: id,
                source: bootstrapResult.source,
                tasks: tasksData.length,
                risks: risksData.length,
                milestones: milestonesData.length,
                conditions: conditionsData.length,
                obstacles: obstaclesData.length,
                warnings: warningsData.length,
                issues: issuesData.length,
                changeLogs: 0,
                taskProgressSnapshots: taskProgressSnapshotsData.length,
              })
            }
            return
          }

          setCurrentProject(null)
          setStatus('error')
          setErrorMessage(getApiErrorMessage(bootstrapResult.error, '无法加载项目初始化数据，请稍后重试。'))
          return
        }

        const projectResult = await fetchProject(id, controller.signal)

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
          void prefetchProjectTasks(id, { signal: controller.signal, includeAcceptanceImpact: false })
            .catch((error) => {
              if (isAbortError(error)) return
              if (import.meta.env.DEV) {
                console.warn('[useProjectInit] gantt task prefetch failed', error)
              }
            })
          return
        }

      } catch (error) {
        if (isAbortError(error)) return

        console.error('[useProjectInit] failed to initialize project', error)
        setSharedSliceStatus('warnings', { loading: false, error: null })
        setSharedSliceStatus('issueRows', { loading: false, error: null })
        setSharedSliceStatus('problemRows', { loading: false, error: null })
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

async function fetchProjectBootstrap(id: string, signal: AbortSignal): Promise<ProjectBootstrapFetchResult> {
  try {
    const payload = await apiGet<ProjectBootstrapPayload>(
      `/api/projects/${id}/bootstrap?changeLogLimit=100`,
      { signal },
    )

    if (!payload?.project?.id) {
      return { kind: 'error', error: new Error('项目初始化数据无效') }
    }

    const projectWithId: StoreProject & { id: string } = {
      ...payload.project,
      id: payload.project.id,
    }

    return {
      kind: 'found',
      payload,
      project: projectWithId,
      source: 'bootstrap',
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    if (error instanceof ApiClientError && error.status === 404) {
      return { kind: 'not_found' }
    }
    return { kind: 'error', error }
  }
}

function normalizeProjectSlices(payload: ProjectBootstrapPayload): NormalizedProjectSlices {
  const tasksData = normalizeArray(payload.tasks).map(normalizeTask)
  const risksData = normalizeArray(payload.risks).map(normalizeRisk)
  const conditionsData = normalizeArray(payload.conditions).map(normalizeCondition)
  const obstaclesData = normalizeArray(payload.obstacles).map(normalizeObstacle)
  const milestonesData = tasksData.filter((task) => Boolean(task.is_milestone)).map(toMilestone)
  const warningsData = normalizeArray(payload.warnings).map(normalizeWarning)
  const issuesData = normalizeArray(payload.issues).map(normalizeIssue)
  const taskProgressSnapshotsData = normalizeArray(payload.taskProgressSnapshots).map(normalizeTaskProgressSnapshot)

  return {
    tasksData,
    risksData,
    milestonesData,
    conditionsData,
    obstaclesData,
    warningsData,
    issuesData,
    taskProgressSnapshotsData,
  }
}
