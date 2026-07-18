import { query } from '../database.js'
import type { Risk, Task, TaskObstacle } from '../types/db.js'

export type ResponsibilityInsightTaskFact = Task & {
  assignee_id?: string | null
  assignee_user_id?: string | null
  participant_unit_name?: string | null
}

export type ResponsibilityInsightRiskFact = Pick<Risk, 'id' | 'task_id' | 'status'>
  & Partial<Pick<Risk, 'level' | 'created_at' | 'updated_at'>>

export type ResponsibilityInsightObstacleFact = Pick<TaskObstacle, 'id' | 'task_id' | 'status'>
  & Partial<Pick<TaskObstacle, 'severity' | 'created_at' | 'severity_escalated_at'>>

export type ResponsibilityInsightFacts = {
  participantUnitNameMap: Map<string, string>
  tasks: ResponsibilityInsightTaskFact[]
  risks: ResponsibilityInsightRiskFact[]
  obstacles: ResponsibilityInsightObstacleFact[]
}

export type ResponsibilityInsightFactQueryExec = (
  sql: string,
  params: unknown[],
) => Promise<{ rows?: unknown[] }>

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function readResponsibilityInsightFacts(
  projectId: string,
  queryExec: ResponsibilityInsightFactQueryExec = query,
): Promise<ResponsibilityInsightFacts> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) {
    throw new Error('RESPONSIBILITY_PROJECT_ID_REQUIRED')
  }

  const [unitResult, taskResult, riskResult, obstacleResult] = await Promise.all([
    queryExec(
      `SELECT id, unit_name
       FROM public.participant_units
       WHERE project_id = $1
       ORDER BY unit_name ASC`,
      [normalizedProjectId],
    ),
    queryExec(
      `SELECT *
       FROM public.tasks
       WHERE project_id = $1`,
      [normalizedProjectId],
    ),
    queryExec(
      `SELECT id, task_id, status, project_id, level, created_at, updated_at
       FROM public.risks
       WHERE project_id = $1`,
      [normalizedProjectId],
    ),
    queryExec(
      `SELECT o.id, o.task_id, o.status, o.severity, o.created_at, o.severity_escalated_at
       FROM public.task_obstacles o
       INNER JOIN public.tasks t ON t.id = o.task_id
       WHERE t.project_id = $1`,
      [normalizedProjectId],
    ),
  ])

  const participantUnitNameMap = new Map(
    ((unitResult.rows ?? []) as Array<{ id?: unknown; unit_name?: unknown }>)
      .map((row) => [normalizeText(row.id), normalizeText(row.unit_name)] as const)
      .filter(([id, name]) => Boolean(id && name)),
  )

  return {
    participantUnitNameMap,
    tasks: (taskResult.rows ?? []) as ResponsibilityInsightTaskFact[],
    risks: (riskResult.rows ?? []) as ResponsibilityInsightRiskFact[],
    obstacles: (obstacleResult.rows ?? []) as ResponsibilityInsightObstacleFact[],
  }
}
