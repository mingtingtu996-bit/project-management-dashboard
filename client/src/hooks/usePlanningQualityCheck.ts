import { useCallback, useRef, useState } from 'react'

import { DataQualityApiService } from '@/services/dataQualityApi'

export interface QualityCheckItem {
  id: string
  taskId?: string | null
  taskTitle: string
  ruleCode: string
  severity: 'info' | 'warning' | 'critical'
  summary: string
  recommendation: string
}

export interface QualityCheckResult {
  count: number
  summary: string
  items: QualityCheckItem[]
}

export interface UsePlanningQualityCheckOptions {
  projectId: string | null | undefined
  onBlock?: (result: QualityCheckResult) => void
}

export function usePlanningQualityCheck({ projectId, onBlock }: UsePlanningQualityCheckOptions) {
  const [checking, setChecking] = useState(false)
  const [lastResult, setLastResult] = useState<QualityCheckResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const runCheck = useCallback(async (draft: Record<string, unknown>) => {
    if (!projectId) return { blocked: false, result: null }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setChecking(true)
    try {
      const result = await DataQualityApiService.liveCheckTaskDraft(projectId, draft, null, { signal: controller.signal })
      if (!result) return { blocked: false, result: null }
      setLastResult(result)

      const hasCritical = result.items.some((item) => item.severity === 'critical')
      if (hasCritical) {
        onBlock?.(result)
        return { blocked: true, result }
      }
      return { blocked: false, result }
    } catch {
      return { blocked: false, result: null }
    } finally {
      setChecking(false)
    }
  }, [projectId, onBlock])

  const dismiss = useCallback(() => setLastResult(null), [])

  return { checking, lastResult, runCheck, dismiss }
}
