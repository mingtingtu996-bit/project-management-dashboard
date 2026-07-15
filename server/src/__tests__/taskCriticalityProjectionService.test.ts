import { describe, expect, it } from 'vitest'

import {
  isLiveCriticalOrNearCriticalTask,
  resolveLiveTaskCriticalityProjection,
} from '../services/taskCriticalityProjectionService.js'

describe('taskCriticalityProjectionService', () => {
  it('does not treat baseline criticality as live critical-path membership', () => {
    const projection = resolveLiveTaskCriticalityProjection({
      baseline_is_critical: true,
      is_critical: false,
      total_float_days: 8,
      free_float_days: 4,
      criticality_weight: 1.5,
    })

    expect(projection.isCritical).toBe(false)
    expect(projection.isNearCritical).toBe(false)
    expect(projection.basis).toBe('float_days')
    expect(resolveLiveTaskCriticalityProjection({ baseline_is_critical: true }).basis).toBe('not_critical_path')
    expect(isLiveCriticalOrNearCriticalTask({ baseline_is_critical: true })).toBe(false)
  })

  it('uses E3 live projection fields for current criticality', () => {
    expect(resolveLiveTaskCriticalityProjection({ is_critical: true }).isCritical).toBe(true)
    expect(resolveLiveTaskCriticalityProjection({ total_float_days: 0 }).isCritical).toBe(true)
    expect(resolveLiveTaskCriticalityProjection({ free_float_days: 1 }).isNearCritical).toBe(true)
  })
})
