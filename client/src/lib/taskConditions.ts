export type TaskConditionLike = {
  id?: string
  task_id?: string
  title?: string | null
  name?: string | null
  condition_name?: string | null
  status?: string | null
  is_satisfied?: boolean | null
}

export type ConditionSummary = {
  total: number
  satisfied: number
}

export function groupConditionsByTaskId(conditions: TaskConditionLike[]): Record<string, TaskConditionLike[]> {
  return conditions.reduce<Record<string, TaskConditionLike[]>>((acc, condition) => {
    const taskId = condition.task_id
    if (!taskId) return acc
    if (!acc[taskId]) acc[taskId] = []
    acc[taskId].push(condition)
    return acc
  }, {})
}

export function isConditionSatisfied(condition: TaskConditionLike): boolean {
  return condition.is_satisfied === true || condition.status === 'completed'
}

export function summarizeConditions(conditions: TaskConditionLike[]): ConditionSummary {
  return {
    total: conditions.length,
    satisfied: conditions.filter(isConditionSatisfied).length,
  }
}

export function buildConditionSummaryMap(
  conditionsByTaskId: Record<string, TaskConditionLike[]>,
): Record<string, ConditionSummary> {
  return Object.fromEntries(
    Object.entries(conditionsByTaskId).map(([taskId, conditions]) => [taskId, summarizeConditions(conditions)]),
  )
}

export function selectConditionPreview(
  allConditions: TaskConditionLike[],
  taskId?: string | null,
  limit = 6,
): TaskConditionLike[] {
  const scoped = taskId ? allConditions.filter((condition) => condition.task_id === taskId) : []
  if (scoped.length > 0) return scoped.slice(0, limit)

  const satisfied = allConditions.filter(isConditionSatisfied).slice(0, 1)
  const unsatisfied = allConditions.filter((condition) => !isConditionSatisfied(condition)).slice(0, Math.max(limit - satisfied.length, 0))
  return [...satisfied, ...unsatisfied].slice(0, limit)
}

export function selectConditionsForTask(
  allConditions: TaskConditionLike[],
  taskId?: string | null,
  limit = 999,
): TaskConditionLike[] {
  if (!taskId) return []
  return allConditions.filter((condition) => condition.task_id === taskId).slice(0, limit)
}
