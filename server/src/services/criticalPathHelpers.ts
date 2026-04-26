import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'

/**
 * CP11: 辅助方法 - 判断任务是否在关键路径上
 * 封装 snapshot 查询并带内存缓存（TTL 1 分钟）
 */

interface CacheEntry {
  taskIds: Set<string>
  timestamp: number
}

const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 1000 // 1 分钟

export async function isCriticalPathTask(projectId: string, taskId: string): Promise<boolean> {
  const taskIds = await getCriticalPathTaskIds(projectId)
  return taskIds.has(taskId)
}

export async function getCriticalPathTaskIds(projectId: string): Promise<Set<string>> {
  const now = Date.now()
  const cached = cache.get(projectId)

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.taskIds
  }

  const snapshot = await getProjectCriticalPathSnapshot(projectId)
  const taskIds = new Set(snapshot.displayTaskIds)

  cache.set(projectId, { taskIds, timestamp: now })

  return taskIds
}

export function clearCriticalPathCache(projectId?: string): void {
  if (projectId) {
    cache.delete(projectId)
  } else {
    cache.clear()
  }
}
