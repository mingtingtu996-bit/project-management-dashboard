// v1.4.22.1 §7.7.3: groupMode toggle — persisted to sessionStorage per project
import { useState, useCallback } from 'react'

export type GroupMode = 'execution' | 'spatial'

const STORAGE_PREFIX = 'gantt_view_mode_'

export function useGroupMode(projectId: string | undefined) {
  const [groupMode, setGroupModeState] = useState<GroupMode>(() => {
    if (!projectId) return 'execution'
    try {
      const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${projectId}:groupMode`)
      return stored === 'spatial' ? 'spatial' : 'execution'
    } catch { return 'execution' }
  })

  const setGroupMode = useCallback((mode: GroupMode) => {
    setGroupModeState(mode)
    if (projectId) {
      try { sessionStorage.setItem(`${STORAGE_PREFIX}${projectId}:groupMode`, mode) } catch { /* ignore */ }
    }
  }, [projectId])

  return { groupMode, setGroupMode }
}
