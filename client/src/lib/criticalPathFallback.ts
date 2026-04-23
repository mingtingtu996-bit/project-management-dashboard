import type { CriticalPathAnalysis, TaskNode } from './criticalPath'

function topologicalSort(tasks: TaskNode[], taskMap: Map<string, TaskNode>): string[] {
  const result: string[] = []
  const visited = new Set<string>()
  const temp = new Set<string>()

  function visit(taskId: string) {
    if (temp.has(taskId) || visited.has(taskId)) return

    temp.add(taskId)
    const task = taskMap.get(taskId)
    if (task) {
      for (const depId of task.dependencies) {
        if (taskMap.has(depId)) {
          visit(depId)
        }
      }
    }

    temp.delete(taskId)
    visited.add(taskId)
    result.push(taskId)
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id)
    }
  }

  return result
}

function buildAutoAnalysis(tasks: TaskNode[]): CriticalPathAnalysis {
  if (tasks.length === 0) {
    return {
      taskMap: new Map(),
      topologicalOrder: [],
      orderedTaskIds: [],
      autoTaskIds: [],
      earliestStart: new Map(),
      earliestFinish: new Map(),
      latestStart: new Map(),
      latestFinish: new Map(),
      float: new Map(),
      projectDurationDays: 0,
    }
  }

  const taskMap = new Map<string, TaskNode>()
  for (const task of tasks) {
    taskMap.set(task.id, task)
  }

  const successors = new Map<string, string[]>()
  for (const task of tasks) {
    if (!successors.has(task.id)) {
      successors.set(task.id, [])
    }
    for (const depId of task.dependencies) {
      if (!successors.has(depId)) {
        successors.set(depId, [])
      }
      successors.get(depId)!.push(task.id)
    }
  }

  const topologicalOrder = topologicalSort(tasks, taskMap)
  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()

  for (const taskId of topologicalOrder) {
    const task = taskMap.get(taskId)!
    if (task.dependencies.length === 0) {
      earliestStart.set(taskId, 0)
    } else {
      let maxFinish = 0
      for (const depId of task.dependencies) {
        maxFinish = Math.max(maxFinish, earliestFinish.get(depId) ?? 0)
      }
      earliestStart.set(taskId, maxFinish)
    }

    earliestFinish.set(taskId, (earliestStart.get(taskId) ?? 0) + task.duration - 1)
  }

  let projectDuration = 0
  for (const finish of earliestFinish.values()) {
    projectDuration = Math.max(projectDuration, finish)
  }
  projectDuration += 1

  const latestFinish = new Map<string, number>()
  const latestStart = new Map<string, number>()
  const reverseSorted = [...topologicalOrder].reverse()

  for (const taskId of reverseSorted) {
    const task = taskMap.get(taskId)!
    const taskSuccessors = successors.get(taskId) || []

    if (taskSuccessors.length === 0) {
      latestFinish.set(taskId, projectDuration - 1)
    } else {
      let minStart = projectDuration
      for (const successorId of taskSuccessors) {
        const successorStart = latestStart.get(successorId)
        if (successorStart !== undefined) {
          minStart = Math.min(minStart, successorStart)
        }
      }
      latestFinish.set(taskId, minStart - 1)
    }

    latestStart.set(taskId, (latestFinish.get(taskId) ?? projectDuration) - task.duration + 1)
  }

  const float = new Map<string, number>()
  for (const task of tasks) {
    const ls = latestStart.get(task.id) ?? 0
    const es = earliestStart.get(task.id) ?? 0
    float.set(task.id, ls - es)
  }

  const criticalSet = new Set<string>()
  for (const task of tasks) {
    if ((float.get(task.id) ?? 0) <= 0) {
      criticalSet.add(task.id)
    }
  }

  return {
    taskMap,
    topologicalOrder,
    orderedTaskIds: topologicalOrder,
    autoTaskIds: topologicalOrder.filter((taskId) => criticalSet.has(taskId)),
    earliestStart,
    earliestFinish,
    latestStart,
    latestFinish,
    float,
    projectDurationDays: projectDuration,
  }
}

export function calculateCriticalPathAnalysis(tasks: TaskNode[]): CriticalPathAnalysis {
  return buildAutoAnalysis(tasks)
}
