// v1.4.13: Unified attention summary hook
// Single source for Header red dot, Sidebar badge, Dashboard today-todo

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/apiClient'

export interface AttentionSummary {
  totalAttentionCount: number
  unreadNotificationCount: number
  todayTodoCount: number
  notificationTodayTodoCount?: number
  criticalCount: number
  warningCount: number
  attentionWarningCount?: number
  workspacePendingCount: number
  byTouchpointType?: Record<string, number>
}

const DEFAULT_SUMMARY: AttentionSummary = {
  totalAttentionCount: 0,
  unreadNotificationCount: 0,
  todayTodoCount: 0,
  criticalCount: 0,
  warningCount: 0,
  workspacePendingCount: 0,
  byTouchpointType: {},
}

export function useAttentionSummary(
  projectId?: string | null,
  companyId?: string | null,
  options?: { pollIntervalMs?: number },
) {
  const [summary, setSummary] = useState<AttentionSummary>(DEFAULT_SUMMARY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchSummary = useCallback(async () => {
    if (!projectId && !companyId) {
      setSummary(DEFAULT_SUMMARY)
      setLoaded(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (projectId) params.set('projectId', projectId)
      if (companyId) params.set('companyId', companyId)
      const data = await apiGet<AttentionSummary>(`/api/notifications/attention-summary?${params.toString()}`)
      if (mountedRef.current && data) {
        setSummary(data)
        setLoaded(true)
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load')
        setSummary(DEFAULT_SUMMARY)
        setLoaded(false)
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [projectId, companyId])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Polling support
  useEffect(() => {
    const interval = options?.pollIntervalMs
    if (!interval || interval <= 0) return
    const timer = setInterval(fetchSummary, interval)
    return () => clearInterval(timer)
  }, [fetchSummary, options?.pollIntervalMs])

  return {
    summary,
    loading,
    loaded,
    error,
    refetch: fetchSummary,
  }
}

export default useAttentionSummary
