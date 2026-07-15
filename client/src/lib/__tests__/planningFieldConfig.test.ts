import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getPlanningFieldConfigStorageKey,
  readPlanningFieldConfigExtraColumns,
} from '@/lib/planningFieldConfig'

function makeRealStorage(): Storage {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach((key) => delete store[key]) },
    get length() { return Object.keys(store).length },
    key: (index: number) => Object.keys(store)[index] ?? null,
  }
}

describe('planning field config storage', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: makeRealStorage(),
    })
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage)
    }
  })

  it('builds a user/project/surface scoped storage key', () => {
    expect(getPlanningFieldConfigStorageKey('project-1', 'task_list', 'user-1')).toBe(
      'workbuddy_planning_field_config:user-1:project-1:task_list',
    )
    expect(getPlanningFieldConfigStorageKey('', 'baseline', 'user-1')).toBeNull()
  })

  it('reads valid extra columns for the current registry version', () => {
    const key = getPlanningFieldConfigStorageKey('project-1', 'baseline', 'user-1')
    expect(key).toBeTruthy()
    localStorage.setItem(
      key!,
      JSON.stringify({
        registryVersion: 'v1.4.7.6',
        extraColumns: ['critical', 'duration_risk', 'float', 'duration_asset_evidence', 'notes', 'invalid', 'actions'],
      }),
    )

    expect(readPlanningFieldConfigExtraColumns(key, 'v1.4.7.6')).toEqual([
      'critical',
      'duration_risk',
      'float',
      'duration_asset_evidence',
      'notes',
      'actions',
    ])
  })

  it('ignores stale registry snapshots', () => {
    const key = getPlanningFieldConfigStorageKey('project-1', 'monthly_plan', 'user-1')
    localStorage.setItem(
      key!,
      JSON.stringify({
        registryVersion: 'v1.4.7',
        extraColumns: ['critical'],
      }),
    )

    expect(readPlanningFieldConfigExtraColumns(key, 'v1.4.7.6')).toEqual([])
  })
})
