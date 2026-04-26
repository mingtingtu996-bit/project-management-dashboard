import { useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import {
  buildCriticalPathSummaryModel,
  createCriticalPathOverride,
  deleteCriticalPathOverride,
  fetchCriticalPathSnapshot,
  listCriticalPathOverrides,
  refreshCriticalPathSnapshot,
  type CriticalPathOverrideInput,
  type CriticalPathOverrideRecord,
  type CriticalPathSummaryModel,
} from '@/lib/criticalPath'

interface UseGanttCriticalPathOptions {
  projectId?: string | null
  summaryDelayMs?: number
}

export function useGanttCriticalPath({ projectId, summaryDelayMs = 800 }: UseGanttCriticalPathOptions) {
  const [criticalPathSummary, setCriticalPathSummary] = useState<CriticalPathSummaryModel | null>(null)
  const [criticalPathDialogOpen, setCriticalPathDialogOpen] = useState(false)
  const [criticalPathSummaryLoading, setCriticalPathSummaryLoading] = useState(false)
  const [criticalPathDialogLoading, setCriticalPathDialogLoading] = useState(false)
  const [criticalPathActionLoading, setCriticalPathActionLoading] = useState(false)
  const [criticalPathError, setCriticalPathError] = useState<string | null>(null)
  const [criticalPathOverrides, setCriticalPathOverrides] = useState<CriticalPathOverrideRecord[]>([])
  const [criticalPathFocusTaskId, setCriticalPathFocusTaskId] = useState<string | null>(null)
  const summaryAbortRef = useRef<AbortController | null>(null)
  const dialogAbortRef = useRef<AbortController | null>(null)

  const abortSummaryRequest = useCallback(() => {
    summaryAbortRef.current?.abort()
    summaryAbortRef.current = null
  }, [])

  const abortDialogRequest = useCallback(() => {
    dialogAbortRef.current?.abort()
    dialogAbortRef.current = null
  }, [])

  const loadCriticalPathSummary = useCallback(async (options?: { refresh?: boolean }) => {
    if (!projectId) {
      abortSummaryRequest()
      setCriticalPathSummary(null)
      setCriticalPathOverrides([])
      setCriticalPathError(null)
      return null
    }

    abortSummaryRequest()
    const controller = new AbortController()
    summaryAbortRef.current = controller

    setCriticalPathSummaryLoading(true)
    try {
      const [snapshot, overrides] = await Promise.all([
        options?.refresh
          ? refreshCriticalPathSnapshot(projectId, { signal: controller.signal })
          : fetchCriticalPathSnapshot(projectId, { signal: controller.signal }),
        listCriticalPathOverrides(projectId, { signal: controller.signal }),
      ])
      if (controller.signal.aborted) return null

      const nextSummary = buildCriticalPathSummaryModel(snapshot)
      setCriticalPathSummary(nextSummary)
      setCriticalPathOverrides(overrides)
      setCriticalPathError(null)
      return nextSummary
    } catch (error) {
      if (isAbortError(error)) return null

      const message = getApiErrorMessage(error, '加载关键路径失败')
      console.error('加载关键路径失败:', error)
      setCriticalPathError(message)
      return null
    } finally {
      if (summaryAbortRef.current === controller) {
        summaryAbortRef.current = null
      }
      if (!controller.signal.aborted) {
        setCriticalPathSummaryLoading(false)
      }
    }
  }, [abortSummaryRequest, projectId])

  const loadCriticalPathDialogData = useCallback(async (options?: { refresh?: boolean }) => {
    if (!projectId) {
      abortDialogRequest()
      setCriticalPathSummary(null)
      setCriticalPathOverrides([])
      setCriticalPathError(null)
      return null
    }

    abortDialogRequest()
    const controller = new AbortController()
    dialogAbortRef.current = controller

    setCriticalPathDialogLoading(true)
    try {
      const [snapshot, overrides] = await Promise.all([
        options?.refresh
          ? refreshCriticalPathSnapshot(projectId, { signal: controller.signal })
          : fetchCriticalPathSnapshot(projectId, { signal: controller.signal }),
        listCriticalPathOverrides(projectId, { signal: controller.signal }),
      ])
      if (controller.signal.aborted) return null

      const nextSummary = buildCriticalPathSummaryModel(snapshot)
      setCriticalPathSummary(nextSummary)
      setCriticalPathOverrides(overrides)
      setCriticalPathError(null)
      return { snapshot, overrides, summary: nextSummary }
    } catch (error) {
      if (isAbortError(error)) return null

      const message = getApiErrorMessage(error, '加载关键路径失败')
      console.error('加载关键路径弹窗数据失败:', error)
      setCriticalPathError(message)
      return null
    } finally {
      if (dialogAbortRef.current === controller) {
        dialogAbortRef.current = null
      }
      if (!controller.signal.aborted) {
        setCriticalPathDialogLoading(false)
      }
    }
  }, [abortDialogRequest, projectId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCriticalPathSummary()
    }, summaryDelayMs)

    return () => {
      window.clearTimeout(timer)
      abortSummaryRequest()
      abortDialogRequest()
    }
  }, [abortDialogRequest, abortSummaryRequest, loadCriticalPathSummary, summaryDelayMs])

  const handleOpenCriticalPathDialog = useCallback((taskId?: string | null) => {
    setCriticalPathFocusTaskId(taskId ?? null)
    setCriticalPathDialogOpen(true)
    void loadCriticalPathDialogData()
  }, [loadCriticalPathDialogData])

  const handleRefreshCriticalPath = useCallback(async () => {
    const result = await loadCriticalPathDialogData({ refresh: true })
    if (result) {
      toast({ title: '关键路径快照已刷新' })
    } else if (!criticalPathError) {
      return
    } else {
      toast({
        title: '关键路径刷新失败',
        description: criticalPathError ?? '请稍后重试',
        variant: 'destructive',
      })
    }
  }, [criticalPathError, loadCriticalPathDialogData])

  const handleCreateCriticalPathOverride = useCallback(async (input: CriticalPathOverrideInput) => {
    if (!projectId) return

    setCriticalPathActionLoading(true)
    try {
      await createCriticalPathOverride(projectId, input)
      await loadCriticalPathDialogData({ refresh: true })
      toast({ title: input.mode === 'manual_attention' ? '已设为关注任务' : '插链规则已保存' })
    } catch (error) {
      if (isAbortError(error)) return

      const title = input.mode === 'manual_attention' ? '设置关注任务失败' : '保存插链失败'
      toast({
        title,
        description: getApiErrorMessage(error, title),
        variant: 'destructive',
      })
    } finally {
      setCriticalPathActionLoading(false)
    }
  }, [loadCriticalPathDialogData, projectId])

  const handleDeleteCriticalPathOverride = useCallback(async (taskOrOverrideId: string, mode?: 'manual_attention' | 'manual_insert') => {
    if (!projectId) return

    setCriticalPathActionLoading(true)
    try {
      const overrides = criticalPathOverrides.length > 0
        ? criticalPathOverrides
        : await listCriticalPathOverrides(projectId)
      const matchedOverride =
        overrides.find((override) => override.id === taskOrOverrideId)
        ?? (mode
          ? overrides.find((override) => override.task_id === taskOrOverrideId && override.mode === mode)
          : overrides.find((override) => override.task_id === taskOrOverrideId) ?? null)

      if (!matchedOverride) {
        throw new Error('未找到对应的关键路径覆盖')
      }

      await deleteCriticalPathOverride(projectId, matchedOverride.id)
      await loadCriticalPathDialogData({ refresh: true })
      toast({ title: '已删除关键路径覆盖' })
    } catch (error) {
      if (isAbortError(error)) return

      toast({
        title: '删除关键路径覆盖失败',
        description: getApiErrorMessage(error, '请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setCriticalPathActionLoading(false)
    }
  }, [criticalPathOverrides, loadCriticalPathDialogData, projectId])

  return {
    criticalPathSummary,
    criticalPathDialogOpen,
    setCriticalPathDialogOpen,
    criticalPathLoading: criticalPathSummaryLoading,
    criticalPathDialogLoading,
    criticalPathActionLoading,
    criticalPathError,
    criticalPathOverrides,
    criticalPathFocusTaskId,
    setCriticalPathFocusTaskId,
    handleOpenCriticalPathDialog,
    handleRefreshCriticalPath,
    handleCreateCriticalPathOverride,
    handleDeleteCriticalPathOverride,
  }
}
