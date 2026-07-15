import { useMemo } from 'react'

import type { Task, TaskCondition, TaskObstacle } from '../GanttViewTypes'
import {
  buildDataQualityRefreshKey,
  buildRelatedRiskIssueSummaryByTaskId,
} from './ganttViewUtils'

type RelatedRiskIssueRow = {
  task_id?: string | null
  taskId?: string | null
  project_id?: string | null
  projectId?: string | null
  status?: string | null
}

type UseGanttProjectCollectionsInput = {
  allConditions: TaskCondition[]
  allObstacles: TaskObstacle[]
  allTasks: Task[]
  issueRows: RelatedRiskIssueRow[]
  projectId?: string | null
  projectRisks: RelatedRiskIssueRow[]
}

export function useGanttProjectCollections({
  allConditions,
  allObstacles,
  allTasks,
  issueRows,
  projectId,
  projectRisks,
}: UseGanttProjectCollectionsInput) {
  const tasks = useMemo(
    () => (projectId ? allTasks.filter((task) => task.project_id === projectId) : []),
    [allTasks, projectId],
  )
  const projectTaskIds = useMemo(
    () => new Set(tasks.map((task) => task.id).filter((taskId): taskId is string => Boolean(taskId))),
    [tasks],
  )
  const projectConditions = useMemo<TaskCondition[]>(
    () =>
      allConditions.filter(
        (condition) => Boolean(condition.task_id) && projectTaskIds.has(condition.task_id as string),
      ) as TaskCondition[],
    [allConditions, projectTaskIds],
  )
  const projectObstacles = useMemo<TaskObstacle[]>(
    () =>
      allObstacles.filter(
        (obstacle) => Boolean(obstacle.task_id) && projectTaskIds.has(obstacle.task_id as string),
      ) as TaskObstacle[],
    [allObstacles, projectTaskIds],
  )
  const relatedRiskIssueSummaryByTaskId = useMemo(
    () => buildRelatedRiskIssueSummaryByTaskId({
      risks: projectRisks,
      issues: issueRows,
      projectTaskIds,
      projectId,
    }),
    [issueRows, projectId, projectRisks, projectTaskIds],
  )
  const relatedRiskIssueTaskIds = useMemo(
    () => new Set(relatedRiskIssueSummaryByTaskId.keys()),
    [relatedRiskIssueSummaryByTaskId],
  )
  const dataQualityRefreshKey = useMemo(() => {
    return buildDataQualityRefreshKey(tasks as Task[], projectConditions)
  }, [projectConditions, tasks])

  return {
    dataQualityRefreshKey,
    projectConditions,
    projectObstacles,
    projectTaskIds,
    relatedRiskIssueSummaryByTaskId,
    relatedRiskIssueTaskIds,
    tasks,
  }
}
