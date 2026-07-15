import { describe, expect, it } from 'vitest'

import { buildPlanSnapshotSeedVersions } from '../services/planSnapshotSeedVersions.js'

describe('planSnapshotSeedVersions', () => {
  it('binds plan snapshots to the seed versions that can affect generated duration and calendar outcomes', () => {
    const versions = buildPlanSnapshotSeedVersions()
    const byType = new Map(versions.map((item) => [item.seedType, item]))

    expect(byType.get('work_calendar')).toEqual(expect.objectContaining({
      seedType: 'work_calendar',
      seedVersion: expect.any(String),
      seedScope: expect.any(String),
    }))
    expect(byType.get('process_seasonal_sensitivity')).toEqual(expect.objectContaining({
      seedType: 'process_seasonal_sensitivity',
      seedVersion: expect.any(String),
      seedScope: expect.any(String),
    }))
    expect(byType.get('standard_work_duration')).toEqual(expect.objectContaining({
      seedType: 'standard_work_duration',
      seedVersion: expect.any(String),
      seedScope: expect.any(String),
    }))
    expect(versions.every((item) => item.seedVersion.length > 0 && item.seedScope.length > 0)).toBe(true)
  })
})
