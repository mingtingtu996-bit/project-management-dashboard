import { useCallback, useMemo, useState } from 'react'

import { useDebounce } from '@/hooks/useDebounce'
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage'

import { normalizeGanttFilterStatus } from './ganttViewUtils'

const TASK_LIST_SEARCH_DEBOUNCE_MS = 100

type UseGanttFiltersInput = {
  projectId?: string
  milestoneFilterId?: string
}

export function useGanttFilters({ projectId, milestoneFilterId }: UseGanttFiltersInput) {
  const [searchText, setSearchText] = useState('')
  const debouncedSearchText = useDebounce(searchText, TASK_LIST_SEARCH_DEBOUNCE_MS)
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    return normalizeGanttFilterStatus(safeStorageGet(localStorage, `gantt_filter_status_${projectId}`))
  })
  const [filterPriority, setFilterPriority] = useState<string>(() => {
    return safeStorageGet(localStorage, `gantt_filter_priority_${projectId}`) || 'all'
  })
  const [filterCritical, setFilterCritical] = useState<boolean>(() => {
    return safeStorageGet(localStorage, `gantt_filter_critical_${projectId}`) === 'true'
  })
  const [showFilterBar, setShowFilterBar] = useState(false)
  const [filterSpecialty, setFilterSpecialty] = useState<string>(() => {
    return safeStorageGet(localStorage, `gantt_filter_specialty_${projectId}`) || 'all'
  })
  const [filterBuilding, setFilterBuilding] = useState<string>('all')
  const [showRiskIssueOnly, setShowRiskIssueOnly] = useState(false)

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (debouncedSearchText) count += 1
    if (filterStatus !== 'all') count += 1
    if (filterPriority !== 'all') count += 1
    if (filterCritical) count += 1
    if (filterSpecialty !== 'all') count += 1
    if (filterBuilding !== 'all') count += 1
    if (milestoneFilterId) count += 1
    if (showRiskIssueOnly) count += 1
    return count
  }, [
    debouncedSearchText,
    filterBuilding,
    filterCritical,
    filterPriority,
    filterSpecialty,
    filterStatus,
    milestoneFilterId,
    showRiskIssueOnly,
  ])

  const clearAllFilters = useCallback(() => {
    setSearchText('')
    setFilterStatus('all')
    setFilterPriority('all')
    setFilterCritical(false)
    setFilterSpecialty('all')
    setFilterBuilding('all')
    setShowRiskIssueOnly(false)
    safeStorageRemove(localStorage, `gantt_filter_status_${projectId}`)
    safeStorageRemove(localStorage, `gantt_filter_priority_${projectId}`)
    safeStorageRemove(localStorage, `gantt_filter_critical_${projectId}`)
    safeStorageRemove(localStorage, `gantt_filter_specialty_${projectId}`)
  }, [projectId])

  const toggleCriticalFilter = useCallback(() => {
    setFilterCritical((value) => {
      safeStorageSet(localStorage, `gantt_filter_critical_${projectId}`, String(!value))
      return !value
    })
  }, [projectId])

  return {
    activeFilterCount,
    clearAllFilters,
    debouncedSearchText,
    filterBuilding,
    filterCritical,
    filterPriority,
    filterSpecialty,
    filterStatus,
    searchText,
    setFilterBuilding,
    setFilterPriority,
    setFilterSpecialty,
    setFilterStatus,
    setSearchText,
    setShowFilterBar,
    setShowRiskIssueOnly,
    showFilterBar,
    showRiskIssueOnly,
    toggleCriticalFilter,
  }
}
