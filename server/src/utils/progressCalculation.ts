export type ProgressTaskLike = {
  id?: string | null
  parent_id?: string | null
  progress?: number | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
}

export function getLeafTasks<T extends ProgressTaskLike>(tasks: T[]): T[] {
  const parentIds = new Set(tasks.map((task) => task.parent_id).filter(Boolean))
  const leafTasks = tasks.filter((task) => !parentIds.has(task.id ?? ''))
  return leafTasks.length > 0 ? leafTasks : tasks
}

export function calculateWeightedProgress(tasks: ProgressTaskLike[]): number {
  const leafTasks = getLeafTasks(tasks)
  if (leafTasks.length === 0) return 0

  let totalWeightedProgress = 0
  let totalWeight = 0

  for (const task of leafTasks) {
    const progress = Number(task.progress ?? 0)
    const startDate = task.planned_start_date || task.start_date
    const endDate = task.planned_end_date || task.end_date

    let weight = 1
    if (startDate && endDate) {
      const start = new Date(startDate).getTime()
      const end = new Date(endDate).getTime()

      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        weight = Math.max(1, Math.ceil((end - start) / 86400000))
      }
    }

    totalWeightedProgress += progress * weight
    totalWeight += weight
  }

  if (totalWeight === 0) return 0
  return Math.round(totalWeightedProgress / totalWeight)
}

export function calculateOverallProgress(tasks: ProgressTaskLike[]): number {
  return calculateWeightedProgress(tasks)
}
