import { useState, useEffect, useCallback } from 'react'
import { useConflictDetection, ConflictItem, ResolutionStrategy, smartMerge, type VersionedEntity } from './useConflictDetection'
import { storageService } from '@/lib/storageService'

/**
 * 数据同步Hook配置
 */
interface UseDataSyncConfig {
  /** 自动同步间隔（毫秒） */
  autoSyncInterval?: number
  /** 冲突检测启用 */
  enableConflictDetection?: boolean
}

/**
 * 数据同步状态
 */
interface DataSyncState {
  isOnline: boolean
  isSyncing: boolean
  lastSyncTime: number | null
  pendingChanges: number
  conflicts: ConflictItem[]
}

/**
 * 数据同步Hook
 * 负责数据同步、冲突检测和解决
 */
export function useDataSync(config: UseDataSyncConfig = {}) {
  const { autoSyncInterval = 30000, enableConflictDetection = true } = config
  
  const [state, setState] = useState<DataSyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    pendingChanges: 0,
    conflicts: []
  })

  const {
    conflicts,
    hasConflicts,
    resolveConflict,
    clearConflicts,
    detectConflicts
  } = useConflictDetection()

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => setState(s => ({ ...s, isOnline: true }))
    const handleOffline = () => setState(s => ({ ...s, isOnline: false }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // 同步数据到服务器
  const syncToServer = useCallback(async () => {
    if (!state.isOnline || state.isSyncing) return

    setState(s => ({ ...s, isSyncing: true }))

    try {
      // 从存储服务获取待同步队列
      const syncQueue = storageService.getSyncQueue()
      
      for (const item of syncQueue) {
        try {
          // 执行同步
          await storageService.processSyncItem(item.id)
        } catch (error) {
          if (import.meta.env.DEV) console.error('Sync failed for item:', item.id, error)
        }
      }

      setState(s => ({
        ...s,
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingChanges: 0
      }))
    } catch (error) {
      if (import.meta.env.DEV) console.error('Sync error:', error)
      setState(s => ({ ...s, isSyncing: false }))
    }
  }, [state.isOnline, state.isSyncing])

  // 自动同步
  useEffect(() => {
    if (!autoSyncInterval || !state.isOnline) return

    const interval = setInterval(() => {
      syncToServer()
    }, autoSyncInterval)

    return () => clearInterval(interval)
  }, [autoSyncInterval, state.isOnline, syncToServer])

  // 检测冲突
  const checkForConflicts = useCallback(async <T extends VersionedEntity>(
    entityType: ConflictItem['entityType'],
    localData: T,
    serverData: T
  ): Promise<ConflictItem[]> => {
    if (!enableConflictDetection) return []

    const detectedConflicts = detectConflicts(entityType, localData, serverData)
    
    if (detectedConflicts.length > 0) {
      setState(s => ({
        ...s,
        conflicts: [...s.conflicts, ...detectedConflicts]
      }))
    }

    return detectedConflicts
  }, [enableConflictDetection, detectConflicts])

  // 解决冲突
  const handleResolveConflict = useCallback(async (
    entityId: string,
    strategy: ResolutionStrategy,
    mergedData?: unknown
  ) => {
    // 记录解决策略
    if (import.meta.env.DEV) console.log(`Resolving conflict for ${entityId} with strategy: ${strategy}`)

    if (strategy === 'merge' && mergedData) {
      // 应用合并后的数据
      storageService.applyMergedData(entityId, mergedData)
    } else if (strategy === 'keepLocal') {
      // 强制使用本地版本（增加版本号重试）
      storageService.forceUpdate(entityId)
    } else if (strategy === 'keepServer') {
      // 使用服务器版本
      storageService.applyServerData(entityId)
    }

    resolveConflict(entityId, strategy, mergedData)
    
    setState(s => ({
      ...s,
      conflicts: s.conflicts.filter(c => c.entityId !== entityId)
    }))
  }, [resolveConflict])

  // 手动触发同步
  const triggerSync = useCallback(async () => {
    await syncToServer()
  }, [syncToServer])

  return {
    // 状态
    isOnline: state.isOnline,
    isSyncing: state.isSyncing,
    lastSyncTime: state.lastSyncTime,
    pendingChanges: state.pendingChanges,
    conflicts: state.conflicts,
    hasConflicts,
    
    // 方法
    sync: triggerSync,
    checkForConflicts,
    resolveConflict: handleResolveConflict,
    clearConflicts: () => {
      clearConflicts()
      setState(s => ({ ...s, conflicts: [] }))
    }
  }
}

export default useDataSync
