import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { apiGet } from '@/lib/apiClient'
import {
  useCurrentProject,
  useSetConditions,
  useSetCurrentProject,
  useSetMilestones,
  useSetObstacles,
  useSetRisks,
  useSetTasks,
} from '@/hooks/useStore'
import { projectDb, type Project } from '@/lib/localDb'
import { toPersistedProject } from '@/lib/projectPersistence'
import { toast } from '@/hooks/use-toast'

type ApiTask = Record<string, any>
type ApiRisk = Record<string, any>
type ApiCondition = Record<string, any>
type ApiObstacle = Record<string, any>

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeTask(task: ApiTask) {
  return {
    ...task,
    title: task.title || task.name || '',
    name: task.name || task.title || '',
    start_date: task.start_date || task.planned_start_date || null,
    end_date: task.end_date || task.planned_end_date || null,
    planned_start_date: task.planned_start_date || task.start_date || null,
    planned_end_date: task.planned_end_date || task.end_date || null,
    assignee: task.assignee || task.assignee_name || '',
    assignee_name: task.assignee_name || task.assignee || '',
    assignee_unit: task.assignee_unit || task.responsible_unit || '',
    responsible_unit: task.responsible_unit || task.assignee_unit || '',
    progress: Number(task.progress ?? 0),
  }
}

function normalizeRisk(risk: ApiRisk) {
  return {
    ...risk,
    title: risk.title || risk.name || '',
    description: risk.description || '',
    status: risk.status || 'identified',
  }
}

function normalizeConditionStatus(condition: ApiCondition): string {
  if (condition.is_satisfied === true || condition.is_satisfied === 1) {
    return '已确认'
  }

  const rawStatus = String(condition.status || '').trim()
  if (['已确认', '已满足', 'confirmed', 'satisfied', 'completed'].includes(rawStatus)) {
    return '已确认'
  }

  return '未满足'
}

function normalizeCondition(condition: ApiCondition) {
  const conditionName = condition.condition_name || condition.name || ''

  return {
    ...condition,
    condition_name: conditionName,
    name: conditionName,
    description: condition.description || '',
    status: normalizeConditionStatus(condition),
    is_satisfied:
      condition.is_satisfied === true ||
      condition.is_satisfied === 1 ||
      normalizeConditionStatus(condition) === '已确认',
  }
}

function normalizeObstacleStatus(obstacle: ApiObstacle): string {
  if (obstacle.is_resolved === true || obstacle.is_resolved === 1) {
    return '已解决'
  }

  const rawStatus = String(obstacle.status || '').trim()
  if (['已解决', '无法解决', 'resolved', 'closed'].includes(rawStatus)) {
    return rawStatus === '无法解决' ? '无法解决' : '已解决'
  }

  if (['处理中', '待处理', 'processing', 'pending', 'active'].includes(rawStatus)) {
    return rawStatus === '待处理' ? '待处理' : '处理中'
  }

  return '处理中'
}

function normalizeObstacle(obstacle: ApiObstacle) {
  const title = obstacle.title || obstacle.description || ''

  return {
    ...obstacle,
    title,
    description: obstacle.description || title,
    status: normalizeObstacleStatus(obstacle),
    is_resolved:
      obstacle.is_resolved === true ||
      obstacle.is_resolved === 1 ||
      ['已解决', '无法解决'].includes(normalizeObstacleStatus(obstacle)),
  }
}

function toMilestone(task: ApiTask) {
  const title = task.title || task.name || ''
  return {
    id: task.id,
    project_id: task.project_id,
    title,
    name: title,
    description: task.description || '',
    target_date: task.planned_end_date || task.end_date || '',
    planned_end_date: task.planned_end_date || task.end_date || '',
    status: task.status || 'pending',
    completed_at: task.actual_end_date || task.completed_at || undefined,
    created_at: task.created_at || new Date().toISOString(),
    updated_at: task.updated_at || new Date().toISOString(),
  }
}

async function fetchAndCacheProject(id: string): Promise<Project | null> {
  try {
    const project = await apiGet<Project>(`/api/projects/${id}`)
    if (!project?.id) return null

    const persistedProject = toPersistedProject(project)
    projectDb.upsert(persistedProject)
    return persistedProject
  } catch {
    return null
  }
}

export function useProjectInit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentProject = useCurrentProject()
  const setCurrentProject = useSetCurrentProject()
  const setTasks = useSetTasks()
  const setRisks = useSetRisks()
  const setMilestones = useSetMilestones()
  const setConditions = useSetConditions()
  const setObstacles = useSetObstacles()

  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!id) return

    let cancelled = false

    const loadProject = async () => {
      setIsLoading(true)

      try {
        const project = await fetchAndCacheProject(id)

        if (cancelled) return

        if (!project) {
          toast({
            title: '项目不存在',
            description: '无法找到该项目，已返回公司驾驶舱',
            variant: 'destructive',
          })
          navigate('/company', { replace: true })
          return
        }

        setCurrentProject(project as any)

        const [tasksResult, risksResult, conditionsResult, obstaclesResult] = await Promise.allSettled([
          apiGet<ApiTask[]>(`/api/tasks?projectId=${encodeURIComponent(id)}`),
          apiGet<ApiRisk[]>(`/api/risks?projectId=${encodeURIComponent(id)}`),
          apiGet<ApiCondition[]>(`/api/task-conditions?projectId=${encodeURIComponent(id)}`),
          apiGet<ApiObstacle[]>(`/api/task-obstacles?projectId=${encodeURIComponent(id)}`),
        ])

        if (cancelled) return

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

        const milestonesData = tasksData.filter((task) => task.is_milestone).map(toMilestone)

        setTasks(tasksData as any)
        setRisks(risksData as any)
        setMilestones(milestonesData as any)
        setConditions(conditionsData as any)
        setObstacles(obstaclesData as any)

        if (import.meta.env.DEV) {
          console.log('[useProjectInit] initialized project from unified backend data', {
            projectId: id,
            tasks: tasksData.length,
            risks: risksData.length,
            milestones: milestonesData.length,
            conditions: conditionsData.length,
            obstacles: obstaclesData.length,
          })
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[useProjectInit] failed to initialize project', error)
          toast({
            title: '加载失败',
            description: '无法加载项目数据，请刷新重试',
            variant: 'destructive',
          })
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      cancelled = true
    }
  }, [
    id,
    navigate,
    setConditions,
    setCurrentProject,
    setMilestones,
    setObstacles,
    setRisks,
    setTasks,
  ])

  return {
    projectId: id,
    isLoaded: !!currentProject && currentProject.id === id,
    isLoading,
  }
}
