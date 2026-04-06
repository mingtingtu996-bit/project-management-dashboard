/**
 * 离线数据缓存模块
 * @deprecated 此模块已废弃，功能已合并到 storageService.ts
 * 
 * 迁移指南:
 * - offlineCache.addOperation() -> storageService.addOperation()
 * - offlineCache.sync() -> storageService.syncPendingOps()
 * - offlineCache.getSyncStatus() -> storageService.getSyncStatus()
 * - offlineCache.manualSync() -> storageService.manualSync()
 * - offlineCache.clearPendingOps() -> storageService.clearPendingOps()
 * - offlineCache.getPendingCount() -> storageService.getPendingCount()
 * - offlineCache.subscribe() -> storageService.subscribe()
 * - useOfflineStatus() -> useStorageStatus() (从 storageService 导入)
 * 
 * 请直接导入 storageService 使用:
 * import { storageService } from './storageService'
 */

import { useState, useEffect } from 'react'
import { storageService, type SyncStatus } from './storageService'

// 重新导出类型以保持兼容性
export interface PendingOperation {
  id: string
  type: 'create' | 'update' | 'delete'
  table: string
  data: any
  timestamp: number
}

// 兼容层：直接转发到 storageService
class OfflineCacheCompat {
  addOperation(type: PendingOperation['type'], table: string, data: any): string {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.addOperation()')
    return storageService.addOperation(type, table, data)
  }

  async sync(): Promise<{ success: number; failed: number }> {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.syncPendingOps()')
    return storageService.syncPendingOps()
  }

  getSyncStatus(): SyncStatus {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.getSyncStatus()')
    return storageService.getSyncStatus()
  }

  async manualSync(): Promise<{ success: number; failed: number }> {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.manualSync()')
    return storageService.manualSync()
  }

  clearPendingOps() {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.clearPendingOps()')
    storageService.clearPendingOps()
  }

  getPendingCount(): number {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.getPendingCount()')
    return storageService.getPendingCount()
  }

  subscribe(listener: (status: SyncStatus) => void): () => void {
    console.warn('[OfflineCache] 已废弃，请使用 storageService.subscribe()')
    return storageService.subscribe(listener)
  }

  destroy(): void {
    console.warn('[OfflineCache] 已废弃，无需调用 destroy()')
  }
}

// 导出兼容实例
export const offlineCache = new OfflineCacheCompat()

/**
 * React Hook: 离线状态
 * @deprecated 请使用 storageService.subscribe() 或从 storageService 导入的 useStorageStatus()
 */
export function useOfflineStatus() {
  const [status, setStatus] = useState<SyncStatus>(storageService.getSyncStatus())

  useEffect(() => {
    console.warn('[useOfflineStatus] 已废弃，请使用 storageService.subscribe()')
    return storageService.subscribe(setStatus)
  }, [])

  return status
}

/**
 * React Hook: 存储状态（推荐）
 * 从 storageService 获取同步状态
 */
export function useStorageStatus() {
  const [status, setStatus] = useState<SyncStatus>(storageService.getSyncStatus())

  useEffect(() => {
    return storageService.subscribe(setStatus)
  }, [])

  return status
}

// 默认导出
export default offlineCache
