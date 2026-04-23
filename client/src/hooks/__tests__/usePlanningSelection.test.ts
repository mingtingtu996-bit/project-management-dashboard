import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { usePlanningSelection } from '../usePlanningSelection'

describe('usePlanningSelection', () => {
  function makeHook(selectedIds: string[], allIds: string[] = []) {
    const setSelectedIds = vi.fn()
    const { result, rerender } = renderHook(
      ({ sel, all }: { sel: string[]; all: string[] }) =>
        usePlanningSelection({ selectedIds: sel, setSelectedIds, allIds: all }),
      { initialProps: { sel: selectedIds, all: allIds } },
    )
    return { result, rerender, setSelectedIds }
  }

  it('reports correct selectedCount', () => {
    const { result } = makeHook(['a', 'b'])
    expect(result.current.selectedCount).toBe(2)
  })

  it('deduplicates duplicate selectedIds', () => {
    const { result } = makeHook(['a', 'a', 'b'])
    expect(result.current.selectedIds).toHaveLength(2)
    expect(result.current.selectedCount).toBe(2)
  })

  it('allSelected is true when every allId is selected', () => {
    const { result } = makeHook(['a', 'b'], ['a', 'b'])
    expect(result.current.allSelected).toBe(true)
  })

  it('allSelected is false when some allIds are not selected', () => {
    const { result } = makeHook(['a'], ['a', 'b'])
    expect(result.current.allSelected).toBe(false)
  })

  it('someSelected is true when at least one allId is selected', () => {
    const { result } = makeHook(['a'], ['a', 'b'])
    expect(result.current.someSelected).toBe(true)
  })

  it('batchVisible is true when at least one item is selected', () => {
    const { result } = makeHook(['x'])
    expect(result.current.batchVisible).toBe(true)
  })

  it('batchVisible is false when nothing is selected', () => {
    const { result } = makeHook([])
    expect(result.current.batchVisible).toBe(false)
  })

  it('toggleSelectedId adds an unselected id', () => {
    const { result, setSelectedIds } = makeHook(['a'], ['a', 'b'])
    act(() => {
      result.current.toggleSelectedId('b')
    })
    expect(setSelectedIds).toHaveBeenCalledWith(['a', 'b'])
  })

  it('toggleSelectedId removes an already-selected id', () => {
    const { result, setSelectedIds } = makeHook(['a', 'b'], ['a', 'b'])
    act(() => {
      result.current.toggleSelectedId('a')
    })
    expect(setSelectedIds).toHaveBeenCalledWith(['b'])
  })

  it('toggleAll(true) selects all ids', () => {
    const { result, setSelectedIds } = makeHook([], ['a', 'b', 'c'])
    act(() => {
      result.current.toggleAll(true)
    })
    expect(setSelectedIds).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('toggleAll(false) clears selection', () => {
    const { result, setSelectedIds } = makeHook(['a', 'b'], ['a', 'b'])
    act(() => {
      result.current.toggleAll(false)
    })
    expect(setSelectedIds).toHaveBeenCalledWith([])
  })

  it('clearSelection empties the selection', () => {
    const { result, setSelectedIds } = makeHook(['a', 'b'])
    act(() => {
      result.current.clearSelection()
    })
    expect(setSelectedIds).toHaveBeenCalledWith([])
  })
})
