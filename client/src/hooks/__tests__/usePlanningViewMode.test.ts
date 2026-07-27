import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getPlanningViewModeStorageKey,
  usePlanningViewMode,
} from '../usePlanningViewMode'
import type { PlanningRowMode } from '@/components/planning/PlanningTreeView'

function makeRealStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key])
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

describe('usePlanningViewMode', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeRealStorage()
  })

  afterEach(() => {
    storage.clear()
  })

  it('builds a user/project/surface scoped storage key', () => {
    expect(getPlanningViewModeStorageKey('project-1', 'baseline', 'user-1')).toBe(
      'workbuddy_planning_view_mode:user-1:project-1:baseline',
    )
    expect(getPlanningViewModeStorageKey('', 'monthly_plan', 'user-1')).toBeNull()
  })

  it('restores a saved read-mode preference', () => {
    const key = getPlanningViewModeStorageKey('project-1', 'baseline', 'user-1')
    storage.setItem(key!, 'detail')

    const { result } = renderHook(() => usePlanningViewMode({
      projectId: 'project-1',
      surface: 'baseline',
      userId: 'user-1',
      storage,
    }))

    expect(result.current.viewMode).toBe('detail')
  })

  it('persists user changes made in read mode', () => {
    const key = getPlanningViewModeStorageKey('project-1', 'monthly_plan', 'user-1')
    const { result } = renderHook(() => usePlanningViewMode({
      projectId: 'project-1',
      surface: 'monthly_plan',
      userId: 'user-1',
      storage,
    }))

    act(() => {
      result.current.setViewMode('list')
    })

    expect(result.current.viewMode).toBe('list')
    expect(storage.getItem(key!)).toBe('list')
  })

  it('switches edit mode to list and restores the saved read preference afterwards', () => {
    const key = getPlanningViewModeStorageKey('project-1', 'baseline', 'user-1')
    storage.setItem(key!, 'detail')

    const { result, rerender } = renderHook(
      ({ rowMode }: { rowMode: PlanningRowMode }) => usePlanningViewMode({
        projectId: 'project-1',
        surface: 'baseline',
        userId: 'user-1',
        rowMode,
        storage,
      }),
      { initialProps: { rowMode: 'read' } },
    )

    expect(result.current.viewMode).toBe('detail')

    rerender({ rowMode: 'edit' })
    expect(result.current.viewMode).toBe('list')
    expect(storage.getItem(key!)).toBe('detail')

    rerender({ rowMode: 'read' })
    expect(result.current.viewMode).toBe('detail')
  })
})
