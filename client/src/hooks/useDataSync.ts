import { useCallback, useEffect, useState } from 'react'

import { storageService } from '@/lib/storageService'

import {
  type ConflictItem,
  type ResolutionStrategy,
  type VersionedEntity,
  useConflictDetection,
} from './useConflictDetection'

interface UseDataSyncConfig {
  autoSyncInterval?: number
  enableConflictDetection?: boolean
}

interface DataSyncState {
  isOnline: boolean
  isSyncing: boolean
  isTabVisible: boolean
  lastSyncTime: number | null
  pendingChanges: number
  conflicts: ConflictItem[]
}

export function useDataSync(config: UseDataSyncConfig = {}) {
  const { autoSyncInterval = 30000, enableConflictDetection = true } = config

  const [state, setState] = useState<DataSyncState>({
    isOnline: navigator.onLine,
    isSyncing: false,
    isTabVisible: typeof document === 'undefined' ? true : !document.hidden,
    lastSyncTime: null,
    pendingChanges: storageService.getPendingSyncCount(),
    conflicts: [],
  })

  const {
    hasConflicts,
    resolveConflict,
    clearConflicts,
    detectConflicts,
  } = useConflictDetection()

  useEffect(() => {
    const handleOnline = () => {
      setState((current) => ({ ...current, isOnline: true }))
    }

    const handleOffline = () => {
      setState((current) => ({ ...current, isOnline: false }))
    }

    const handleVisibilityChange = () => {
      setState((current) => ({
        ...current,
        isTabVisible: typeof document === 'undefined' ? true : !document.hidden,
      }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const syncToServer = useCallback(async () => {
    if (!state.isOnline || !state.isTabVisible || state.isSyncing) {
      return
    }

    setState((current) => ({ ...current, isSyncing: true }))

    try {
      const syncQueue = storageService.getSyncQueue()

      for (const item of syncQueue) {
        try {
          await storageService.processSyncItem(item.id)
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('Sync failed for item:', item.id, error)
          }
        }
      }

      setState((current) => ({
        ...current,
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingChanges: storageService.getPendingSyncCount(),
      }))
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Sync error:', error)
      }

      setState((current) => ({ ...current, isSyncing: false }))
    }
  }, [state.isOnline, state.isSyncing, state.isTabVisible])

  useEffect(() => {
    if (!autoSyncInterval || !state.isOnline || !state.isTabVisible) {
      return
    }

    const interval = window.setInterval(() => {
      void syncToServer()
    }, autoSyncInterval)

    return () => window.clearInterval(interval)
  }, [autoSyncInterval, state.isOnline, state.isTabVisible, syncToServer])

  useEffect(() => {
    if (state.isOnline && state.isTabVisible) {
      void syncToServer()
    }
  }, [state.isOnline, state.isTabVisible, syncToServer])

  const checkForConflicts = useCallback(
    async <T extends VersionedEntity>(
      entityType: ConflictItem['entityType'],
      localData: T,
      serverData: T,
    ): Promise<ConflictItem[]> => {
      if (!enableConflictDetection) return []

      const detectedConflicts = detectConflicts(entityType, localData, serverData)

      if (detectedConflicts.length > 0) {
        setState((current) => ({
          ...current,
          conflicts: [...current.conflicts, ...detectedConflicts],
        }))
      }

      return detectedConflicts
    },
    [detectConflicts, enableConflictDetection],
  )

  const handleResolveConflict = useCallback(
    async (entityId: string, strategy: ResolutionStrategy, mergedData?: unknown) => {
      if (import.meta.env.DEV) {
        console.log(`Resolving conflict for ${entityId} with strategy: ${strategy}`)
      }

      if (strategy === 'merge' && mergedData) {
        storageService.applyMergedData(entityId, mergedData)
      } else if (strategy === 'keepLocal') {
        storageService.forceUpdate(entityId)
      } else if (strategy === 'keepServer') {
        storageService.applyServerData(entityId)
      }

      resolveConflict(entityId, strategy, mergedData)

      setState((current) => ({
        ...current,
        conflicts: current.conflicts.filter((item) => item.entityId !== entityId),
      }))
    },
    [resolveConflict],
  )

  const triggerSync = useCallback(async () => {
    await syncToServer()
  }, [syncToServer])

  return {
    isOnline: state.isOnline,
    isSyncing: state.isSyncing,
    isTabVisible: state.isTabVisible,
    lastSyncTime: state.lastSyncTime,
    pendingChanges: state.pendingChanges,
    conflicts: state.conflicts,
    hasConflicts,
    sync: triggerSync,
    checkForConflicts,
    resolveConflict: handleResolveConflict,
    clearConflicts: () => {
      clearConflicts()
      setState((current) => ({ ...current, conflicts: [] }))
    },
  }
}

export default useDataSync
