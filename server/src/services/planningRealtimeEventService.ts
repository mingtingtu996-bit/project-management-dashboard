import { broadcastRealtimeEvent } from './realtimeServer.js'
import type { PlanningSurface } from '../types/planningTable.js'

type PlanningTableRealtimeSource =
  | 'task_list_commit'
  | 'baseline_commit'
  | 'monthly_plan_commit'
  | 'task_api'
  | 'import'
  | 'system'

export function broadcastProjectTasksChanged(params: {
  projectId: string
  changedTaskIds?: string[]
  deletedTaskIds?: string[]
  source?: Extract<PlanningTableRealtimeSource, 'task_list_commit' | 'task_api' | 'import' | 'system'>
  revision?: string | number
}) {
  const changedTaskIds = params.changedTaskIds ?? []
  const deletedTaskIds = params.deletedTaskIds ?? []
  if (!params.projectId || (changedTaskIds.length === 0 && deletedTaskIds.length === 0)) return 0

  return broadcastRealtimeEvent({
    type: 'project.tasks.changed',
    channel: 'project',
    projectId: params.projectId,
    entityType: 'task',
    ids: [...changedTaskIds, ...deletedTaskIds],
    payload: {
      changedTaskIds,
      deletedTaskIds,
      source: params.source ?? 'task_api',
      revision: params.revision ?? Date.now(),
    },
  })
}

export function broadcastTaskChanged(params: {
  projectId: string
  taskId: string
  changedFields?: string[]
  source?: Extract<PlanningTableRealtimeSource, 'task_list_commit' | 'task_api' | 'import' | 'system'>
  revision?: string | number
}) {
  if (!params.projectId || !params.taskId) return 0

  return broadcastRealtimeEvent({
    type: 'task.changed',
    channel: 'project',
    projectId: params.projectId,
    entityType: 'task',
    entityId: params.taskId,
    ids: [params.taskId],
    payload: {
      taskId: params.taskId,
      changedFields: params.changedFields ?? [],
      source: params.source ?? 'task_api',
      revision: params.revision ?? Date.now(),
    },
  })
}

export function broadcastPlanningTableChanged(params: {
  projectId: string
  surface: PlanningSurface
  resourceId?: string | null
  changedRowIds?: string[]
  deletedRowIds?: string[]
  source?: PlanningTableRealtimeSource
  revision?: string | number
}) {
  const changedRowIds = params.changedRowIds ?? []
  const deletedRowIds = params.deletedRowIds ?? []
  if (!params.projectId || (changedRowIds.length === 0 && deletedRowIds.length === 0)) return 0

  return broadcastRealtimeEvent({
    type: 'planning.table.changed',
    channel: 'project',
    projectId: params.projectId,
    entityType: params.surface,
    entityId: params.resourceId ?? null,
    ids: [...changedRowIds, ...deletedRowIds],
    payload: {
      surface: params.surface,
      resourceId: params.resourceId ?? null,
      changedRowIds,
      deletedRowIds,
      source: params.source ?? 'system',
      revision: params.revision ?? Date.now(),
    },
  })
}
