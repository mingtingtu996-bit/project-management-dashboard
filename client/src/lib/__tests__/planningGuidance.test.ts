import { describe, expect, it } from 'vitest'

import {
  dismissPlanningGuidance,
  getPlanningGuidanceStorageKey,
  getPlanningGuidanceStorageKeys,
  markPlanningGuidanceSeen,
  readPlanningGuidanceSnapshot,
  recordPlanningGuidanceCompletion,
  resetPlanningGuidanceForUser,
  shouldShowPlanningGuidance,
} from '@/lib/planningGuidance'

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

describe('planning guidance storage', () => {
  it('builds user and surface scoped keys without project scope', () => {
    expect(getPlanningGuidanceStorageKey('user-1', 'baseline', 'start_edit')).toBe(
      'workbuddy_planning_guidance:user-1:baseline:start_edit',
    )
    expect(getPlanningGuidanceStorageKey(null, 'task_list', 'paste')).toBe(
      'workbuddy_planning_guidance:anonymous:task_list:paste',
    )

    expect(getPlanningGuidanceStorageKeys('user-1', 'monthly_plan')).toEqual({
      start_edit: 'workbuddy_planning_guidance:user-1:monthly_plan:start_edit',
      paste: 'workbuddy_planning_guidance:user-1:monthly_plan:paste',
      undo: 'workbuddy_planning_guidance:user-1:monthly_plan:undo',
      field_config: 'workbuddy_planning_guidance:user-1:monthly_plan:field_config',
    })
  })

  it('marks a guide as seen and hides it after manual dismissal', () => {
    const storage = makeRealStorage()
    const key = getPlanningGuidanceStorageKey('user-1', 'baseline', 'field_config')
    const now = new Date('2026-01-01T00:00:00.000Z')

    expect(shouldShowPlanningGuidance(key, { now, storage })).toBe(true)
    expect(markPlanningGuidanceSeen(key, { now, storage })).toBe(true)
    expect(readPlanningGuidanceSnapshot(key, storage)).toEqual({
      first_seen_at: now.toISOString(),
      completed_count: 0,
    })

    expect(dismissPlanningGuidance(key, { now, storage })).toBe(true)
    expect(shouldShowPlanningGuidance(key, { now, storage })).toBe(false)
  })

  it('auto hides guidance after thirty days from first seen', () => {
    const storage = makeRealStorage()
    const key = getPlanningGuidanceStorageKey('user-1', 'task_list', 'paste')
    const firstSeen = new Date('2026-01-01T00:00:00.000Z')

    markPlanningGuidanceSeen(key, { now: firstSeen, storage })

    expect(shouldShowPlanningGuidance(key, {
      now: new Date('2026-01-30T23:59:59.000Z'),
      storage,
    })).toBe(true)
    expect(shouldShowPlanningGuidance(key, {
      now: new Date('2026-01-31T00:00:00.000Z'),
      storage,
    })).toBe(false)
  })

  it('auto dismisses guidance after five valid completions', () => {
    const storage = makeRealStorage()
    const key = getPlanningGuidanceStorageKey('user-1', 'baseline', 'undo')
    const now = new Date('2026-01-01T00:00:00.000Z')

    for (let index = 0; index < 4; index += 1) {
      recordPlanningGuidanceCompletion(key, { now, storage })
    }

    expect(readPlanningGuidanceSnapshot(key, storage)?.completed_count).toBe(4)
    expect(shouldShowPlanningGuidance(key, { now, storage })).toBe(true)

    recordPlanningGuidanceCompletion(key, { now, storage })

    const snapshot = readPlanningGuidanceSnapshot(key, storage)
    expect(snapshot?.completed_count).toBe(5)
    expect(snapshot?.dismissed_at).toBe(now.toISOString())
    expect(shouldShowPlanningGuidance(key, { now, storage })).toBe(false)
  })

  it('resets guidance for a single user and optional surface', () => {
    const storage = makeRealStorage()
    const baselineKey = getPlanningGuidanceStorageKey('user-1', 'baseline', 'start_edit')
    const monthlyKey = getPlanningGuidanceStorageKey('user-1', 'monthly_plan', 'paste')
    const otherUserKey = getPlanningGuidanceStorageKey('user-2', 'baseline', 'start_edit')

    markPlanningGuidanceSeen(baselineKey, { storage })
    markPlanningGuidanceSeen(monthlyKey, { storage })
    markPlanningGuidanceSeen(otherUserKey, { storage })

    expect(resetPlanningGuidanceForUser('user-1', 'baseline', storage)).toBe(1)
    expect(storage.getItem(baselineKey)).toBeNull()
    expect(storage.getItem(monthlyKey)).not.toBeNull()
    expect(storage.getItem(otherUserKey)).not.toBeNull()

    expect(resetPlanningGuidanceForUser('user-1', undefined, storage)).toBe(1)
    expect(storage.getItem(monthlyKey)).toBeNull()
    expect(storage.getItem(otherUserKey)).not.toBeNull()
  })
})
