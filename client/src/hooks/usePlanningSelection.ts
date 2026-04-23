import { useCallback, useMemo } from 'react'

export interface UsePlanningSelectionOptions {
  selectedIds: Iterable<string>
  setSelectedIds: (ids: string[]) => void
  allIds?: Iterable<string>
}

export function usePlanningSelection({
  selectedIds,
  setSelectedIds,
  allIds = [],
}: UsePlanningSelectionOptions) {
  const selectedList = useMemo(() => Array.from(new Set(selectedIds)), [selectedIds])
  const selectedSet = useMemo(() => new Set(selectedList), [selectedList])
  const allList = useMemo(() => Array.from(new Set(allIds)), [allIds])

  const selectedCount = selectedList.length
  const allSelected = allList.length > 0 && allList.every((id) => selectedSet.has(id))
  const someSelected = allList.some((id) => selectedSet.has(id))

  const toggleSelectedId = useCallback(
    (id: string) => {
      setSelectedIds(selectedSet.has(id) ? selectedList.filter((item) => item !== id) : [...selectedList, id])
    },
    [selectedList, selectedSet, setSelectedIds],
  )

  const toggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? allList : [])
    },
    [allList, setSelectedIds],
  )

  const clearSelection = useCallback(() => {
    setSelectedIds([])
  }, [setSelectedIds])

  return {
    selectedIds: selectedList,
    selectedSet,
    selectedCount,
    allSelected,
    someSelected,
    batchVisible: selectedCount > 0,
    toggleSelectedId,
    toggleAll,
    clearSelection,
  }
}

export default usePlanningSelection
