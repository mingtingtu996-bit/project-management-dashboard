import { useCallback, useMemo, useState } from 'react'

import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'

import type { Task } from '../GanttViewTypes'
import {
  assignWBSCode,
  buildWBSTree,
  flattenTree,
} from '../GanttViewTypes'

type UseGanttTreeStateInput = {
  projectId?: string | null
  tasks: Task[]
}

export function useGanttTreeState({
  projectId,
  tasks,
}: UseGanttTreeStateInput) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const saved = safeStorageGet(localStorage, `gantt_collapsed_${projectId}`)
    return new Set(safeJsonParse<string[]>(saved, [], `gantt collapsed ${projectId ?? 'unknown'}`))
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchUpdating, setBatchUpdating] = useState(false)

  const wbsTree = useMemo(() => {
    const tree = buildWBSTree(tasks)
    assignWBSCode(tree)
    return tree
  }, [tasks])

  const flatList = useMemo(() => flattenTree(wbsTree, collapsed), [wbsTree, collapsed])
  const allSelected = flatList.length > 0 && flatList.every((node) => selectedIds.has(node.id))
  const someSelected = flatList.some((node) => selectedIds.has(node.id))

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      safeStorageSet(localStorage, `gantt_collapsed_${projectId}`, JSON.stringify([...next]))
      return next
    })
  }, [projectId])

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(flatList.map((node) => node.id)))
    }
  }, [allSelected, flatList])

  const toggleSelect = useCallback((nodeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  return {
    allSelected,
    batchUpdating,
    collapsed,
    flatList,
    selectedIds,
    setBatchUpdating,
    setSelectedIds,
    someSelected,
    toggleCollapse,
    toggleSelect,
    toggleSelectAll,
    wbsTree,
  }
}
