import { describe, expect, it } from 'vitest'

import {
  getHealthCardDisplay,
  getHealthDimensionDisplay,
  getHealthProgressDisplay,
  getHealthTrendDisplay,
} from '../healthDisplay'

describe('healthDisplay', () => {
  it('maps health score buckets to stable card styles', () => {
    expect(getHealthCardDisplay(85)).toEqual({
      label: '健康',
      badgeClass: 'bg-emerald-50 text-emerald-600',
      textClass: 'text-emerald-600',
    })
    expect(getHealthCardDisplay(65)).toEqual({
      label: '亚健康',
      badgeClass: 'bg-blue-50 text-blue-600',
      textClass: 'text-blue-600',
    })
    expect(getHealthCardDisplay(45)).toEqual({
      label: '预警',
      badgeClass: 'bg-amber-50 text-amber-600',
      textClass: 'text-amber-600',
    })
    expect(getHealthCardDisplay(20)).toEqual({
      label: '危险',
      badgeClass: 'bg-red-50 text-red-600',
      textClass: 'text-red-600',
    })
  })

  it('maps trend labels and tones', () => {
    expect(getHealthTrendDisplay('up')).toEqual({ label: '上升', textClass: 'text-emerald-600' })
    expect(getHealthTrendDisplay('down')).toEqual({ label: '下降', textClass: 'text-red-500' })
    expect(getHealthTrendDisplay('stable')).toEqual({ label: '持平', textClass: 'text-gray-400' })
  })

  it('maps dimension and progress tones', () => {
    expect(getHealthDimensionDisplay(true, true)).toEqual({
      barClass: 'bg-gray-300',
      textClass: 'text-gray-400',
    })
    expect(getHealthDimensionDisplay(false, true)).toEqual({
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
    })
    expect(getHealthProgressDisplay(88)).toEqual({
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600',
    })
  })
})
