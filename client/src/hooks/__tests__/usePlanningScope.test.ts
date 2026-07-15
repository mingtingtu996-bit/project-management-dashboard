import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getTaskScopePatchFromSelection,
  getTaskScopeSelectionStorageKey,
  readStoredTaskScopeSelection,
  usePlanningScope,
} from '../usePlanningScope'

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

describe('usePlanningScope', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeRealStorage()
  })

  afterEach(() => {
    storage.clear()
  })

  it('builds a user/project scoped task-list storage key', () => {
    expect(getTaskScopeSelectionStorageKey('project-1', 'user-1')).toBe(
      'workbuddy:planning-scope-selection:task-list:user-1:project-1',
    )
    expect(getTaskScopeSelectionStorageKey('', 'user-1')).toBeNull()
  })

  it('reads stored task scope selection safely', () => {
    const key = getTaskScopeSelectionStorageKey('project-1', 'user-1')
    storage.setItem(key!, JSON.stringify({ buildingObjectId: 'building-1', buildingLabel: '1#' }))

    expect(readStoredTaskScopeSelection(key, storage)).toEqual({
      buildingObjectId: 'building-1',
      buildingLabel: '1#',
    })
  })

  it('builds a 7-dimension task scope patch and picks the most specific object', () => {
    expect(getTaskScopePatchFromSelection({
      phaseObjectId: 'phase-1',
      sectionObjectId: 'section-1',
      buildingObjectId: 'building-1',
      basementObjectId: 'basement-1',
      floorObjectId: 'floor-2',
      physicalZoneObjectId: 'zone-3',
      functionalAreaObjectId: 'fa-1',
    })).toEqual({
      engineering_object_id: 'fa-1',
      phase_object_id: 'phase-1',
      section_object_id: 'section-1',
      building_object_id: 'building-1',
      basement_object_id: 'basement-1',
      floor_object_id: 'floor-2',
      physical_zone_object_id: 'zone-3',
      functional_area_object_id: 'fa-1',
    })
  })

  it('persists selection changes and builds 7-type scope options', () => {
    const key = getTaskScopeSelectionStorageKey('project-1', 'user-1')
    const { result } = renderHook(() => usePlanningScope({
      projectId: 'project-1',
      userId: 'user-1',
      storage,
      objects: [
        { id: 'phase-1', objectType: 'phase', objectName: '一期' },
        { id: 'section-1', objectType: 'section', objectName: 'A标段' },
        { id: 'building-1', objectType: 'building', objectName: '1#楼' },
        { id: 'basement-1', objectType: 'basement', objectName: '地下室' },
        { id: 'floor-2', objectType: 'floor', objectName: '2F' },
        { id: 'zone-1', objectType: 'physical_zone', objectName: '屋面' },
        { id: 'fa-1', objectType: 'functional_area', objectName: '手术部' },
      ],
    }))

    expect(result.current.options.phases).toEqual([{ id: 'phase-1', label: '一期' }])
    expect(result.current.options.sections).toEqual([{ id: 'section-1', label: 'A标段' }])
    expect(result.current.options.buildings).toEqual([{ id: 'building-1', label: '1#楼' }])
    expect(result.current.options.basements).toEqual([{ id: 'basement-1', label: '地下室' }])
    expect(result.current.options.floors).toEqual([{ id: 'floor-2', label: '2F' }])
    expect(result.current.options.physicalZones).toEqual([{ id: 'zone-1', label: '屋面' }])
    expect(result.current.options.functionalAreas).toEqual([{ id: 'fa-1', label: '手术部' }])

    act(() => {
      result.current.setSelection({ buildingObjectId: 'building-1', buildingLabel: '1#楼' })
    })

    expect(result.current.hasSelection).toBe(true)
    expect(storage.getItem(key!)).toContain('building-1')

    act(() => {
      result.current.clearSelection()
    })

    expect(result.current.hasSelection).toBe(false)
  })
})
