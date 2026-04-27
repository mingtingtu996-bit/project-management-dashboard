import { describe, expect, it } from 'vitest'

import {
  METRIC_REGISTRY,
  METRIC_REGISTRY_KEYS,
  getMetricRegistryEntry,
  isRegisteredMetric,
  listMetricRegistry,
} from '../analytics/metricRegistry.js'

describe('metric registry', () => {
  it('exposes the BI whitelist with at least six metrics', () => {
    expect(METRIC_REGISTRY_KEYS.length).toBeGreaterThanOrEqual(6)
    expect(METRIC_REGISTRY).toHaveProperty('health_score')
    expect(METRIC_REGISTRY).toHaveProperty('overall_progress')
    expect(METRIC_REGISTRY).toHaveProperty('delay_days')
    expect(METRIC_REGISTRY).toHaveProperty('active_risk_count')
    expect(METRIC_REGISTRY).toHaveProperty('active_obstacle_count')
    expect(METRIC_REGISTRY).toHaveProperty('active_delay_requests')
  })

  it('keeps the required registry shape on every entry', () => {
    for (const entry of listMetricRegistry()) {
      expect(entry.key).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(entry.source).toBeTruthy()
      expect(entry.defaultGranularity).toMatch(/^(day|week|month)$/)
      expect(entry.supportedGroupBy.length).toBeGreaterThan(0)
    }
  })

  it('validates registered metric keys', () => {
    expect(isRegisteredMetric('health_score')).toBe(true)
    expect(getMetricRegistryEntry('health_score')?.label).toBe('健康度')
    expect(isRegisteredMetric('unknown_metric')).toBe(false)
    expect(getMetricRegistryEntry('unknown_metric')).toBeUndefined()
  })
})
