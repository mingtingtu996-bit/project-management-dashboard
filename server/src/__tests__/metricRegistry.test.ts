import { describe, expect, it } from 'vitest'

import {
  getFrontendVisibleMetrics,
  getMetricDefinition,
  getMetricRegistryEntry,
  isRegisteredMetric,
  listMetricRegistry,
} from '../services/metricRegistryService.js'

describe('metric registry', () => {
  it('exposes the BI whitelist with at least six metrics', () => {
    const metricKeys = listMetricRegistry().map((entry) => entry.key)
    expect(metricKeys.length).toBeGreaterThanOrEqual(6)
    expect(metricKeys).toEqual(expect.arrayContaining([
      'health_score',
      'overall_progress',
      'delay_days',
      'schedule_deviation_days',
      'active_risk_count',
      'active_obstacle_count',
      'active_delayed_tasks',
      'responsibility_coverage_rate',
    ]))
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
    expect(getMetricRegistryEntry('health_score')?.label).toBe('业务健康分')
    expect(getMetricRegistryEntry('responsibility_coverage_rate')?.source).toBe('responsibilityInsightService')
    expect(isRegisteredMetric('unknown_metric')).toBe(false)
    expect(getMetricRegistryEntry('unknown_metric')).toBeUndefined()
  })

  it('exposes frontend-visible metrics from the authoritative registry', () => {
    expect(getFrontendVisibleMetrics().every((metric) => metric.frontendVisible)).toBe(true)
  })

  it('registers v1.4.7 planning governance metrics through the unified registry', () => {
    const requiredPlanningMetrics = {
      generated_plan_duration_readiness_rate: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
      dependency_topology_non_trivial_rate: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
      responsible_unit_resolution_rate: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
      precondition_attachment_rate: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
      baseline_deviation_rate: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
      monthly_plan_fulfillment_rate: { source: 'projectExecutionSummaryService', granularity: 'month', snapshotPolicy: 'monthly' },
      monthly_plan_confirmed_count: { source: 'projectExecutionSummaryService', granularity: 'month', snapshotPolicy: 'monthly' },
      monthly_plan_closed_count: { source: 'projectExecutionSummaryService', granularity: 'month', snapshotPolicy: 'monthly' },
      monthly_plan_pending_closeout_count: { source: 'projectExecutionSummaryService', granularity: 'month', snapshotPolicy: 'monthly' },
      planning_alignment_status: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
      temporary_without_baseline_count: { source: 'projectExecutionSummaryService', granularity: 'month', snapshotPolicy: 'monthly' },
      planning_pending_realign_count: { source: 'projectExecutionSummaryService', granularity: 'day', snapshotPolicy: 'daily' },
    }

    for (const [metricKey, expected] of Object.entries(requiredPlanningMetrics)) {
      const definition = getMetricDefinition(metricKey)
      const registryEntry = getMetricRegistryEntry(metricKey)
      expect(definition?.snapshotPolicy).toBe(expected.snapshotPolicy)
      expect(registryEntry).toMatchObject({
        key: metricKey,
        source: expected.source,
        defaultGranularity: expected.granularity,
      })
    }
  })

  it('splits schedule deviation from overdue delay exposure metrics', () => {
    expect(getMetricRegistryEntry('delay_days')).toMatchObject({
      key: 'delay_days',
      source: 'projectExecutionSummaryService',
      dataType: 'duration_days',
    })
    expect(getMetricRegistryEntry('schedule_deviation_days')).toMatchObject({
      key: 'schedule_deviation_days',
      source: 'progressDeviationService',
      dataType: 'duration_days',
    })
  })

  it('registers productivity compensation metrics through the unified registry', () => {
    const requiredCompensationMetrics = {
      productivity_base_p: { dataType: 'percentage', unit: 'P' },
      productivity_compensation_uplift: { dataType: 'percentage', unit: 'P' },
      productivity_adjusted_p: { dataType: 'percentage', unit: 'P' },
      productivity_compensation_duration_multiplier: { dataType: 'number', unit: 'x' },
      productivity_compensation_maturity_days: { dataType: 'duration_days', unit: 'days' },
      productivity_compensation_maturity_tier: { dataType: 'flag', unit: undefined },
    }

    for (const [metricKey, expected] of Object.entries(requiredCompensationMetrics)) {
      const definition = getMetricDefinition(metricKey)
      const registryEntry = getMetricRegistryEntry(metricKey)
      expect(definition).toMatchObject({
        metricKey,
        source: 'projectProductivityCompensationService',
        dataType: expected.dataType,
        defaultGranularity: 'monthly',
        supportedGroupBy: ['project'],
        frontendVisible: true,
        snapshotPolicy: 'none',
      })
      expect(definition?.unit).toBe(expected.unit)
      expect(registryEntry).toMatchObject({
        key: metricKey,
        source: 'projectProductivityCompensationService',
        defaultGranularity: 'month',
        supportedGroupBy: ['none'],
      })
    }
    expect(getMetricDefinition('productivity_compensation_adjusted_productivity')?.metricKey).toBe('productivity_adjusted_p')
    expect(getMetricDefinition('productivity_compensation_factor')?.metricKey).toBe('productivity_compensation_duration_multiplier')
  })

  it('registers monthly productivity distribution metrics for large-project acceleration signal visibility', () => {
    const requiredDistributionMetrics = {
      productivity_monthly_average_p: { dataType: 'percentage', snapshotPolicy: 'daily' },
      productivity_monthly_max_p: { dataType: 'percentage', snapshotPolicy: 'daily' },
      productivity_monthly_min_p: { dataType: 'percentage', snapshotPolicy: 'daily' },
      productivity_monthly_p90: { dataType: 'percentage', snapshotPolicy: 'daily' },
      productivity_acceleration_case_ratio: { dataType: 'percentage', snapshotPolicy: 'daily' },
      productivity_monthly_case_count: { dataType: 'count', snapshotPolicy: 'daily' },
      productivity_sample_maturity_score: { dataType: 'number', snapshotPolicy: 'daily', frontendVisible: false },
      productivity_critical_path_sample_count: { dataType: 'count', snapshotPolicy: 'daily', frontendVisible: false },
      productivity_building_acceleration_case_ratio: { dataType: 'percentage', snapshotPolicy: 'daily', frontendVisible: false },
      productivity_specialty_acceleration_case_ratio: { dataType: 'percentage', snapshotPolicy: 'daily', frontendVisible: false },
      productivity_critical_path_acceleration_case_ratio: { dataType: 'percentage', snapshotPolicy: 'daily', frontendVisible: false },
    }

    for (const [metricKey, expected] of Object.entries(requiredDistributionMetrics)) {
      const definition = getMetricDefinition(metricKey)
      const registryEntry = getMetricRegistryEntry(metricKey)
      expect(definition).toMatchObject({
        metricKey,
        source: 'projectExecutionSummaryService',
        dataType: expected.dataType,
        defaultGranularity: 'daily',
        supportedGroupBy: metricKey.includes('building')
          ? ['building']
          : metricKey.includes('specialty')
            ? ['specialty']
            : ['project'],
        frontendVisible: 'frontendVisible' in expected ? expected.frontendVisible : true,
        snapshotPolicy: expected.snapshotPolicy,
      })
      expect(registryEntry).toMatchObject({
        key: metricKey,
        source: 'projectExecutionSummaryService',
        defaultGranularity: 'day',
      })
    }
  })

  it('registers the six task-summary period metrics with the service-owned source', () => {
    const metricKeys = [
      'task_summary_progress_change',
      'task_summary_tasks_updated',
      'task_summary_tasks_progressed',
      'task_summary_tasks_completed',
      'task_summary_delayed_count',
      'task_summary_on_time_rate',
    ]

    for (const metricKey of metricKeys) {
      expect(getMetricDefinition(metricKey)).toEqual(expect.objectContaining({
        metricKey,
        source: 'taskSummaryService',
        defaultGranularity: 'daily',
        supportedGroupBy: ['project'],
      }))
    }
  })

  it('registers the 14-day start-readiness summary metrics with their authoritative source', () => {
    const requiredMetrics = [
      'start_readiness_task_count_14d',
      'start_readiness_ready_task_count_14d',
      'start_readiness_blocked_task_count_14d',
      'start_readiness_attention_task_count_14d',
      'start_readiness_ready_rate_14d',
      'start_readiness_production_date_count_14d',
    ]

    for (const metricKey of requiredMetrics) {
      expect(getMetricDefinition(metricKey)).toEqual(expect.objectContaining({
        metricKey,
        source: 'projectStartReadinessService',
        defaultGranularity: 'daily',
        supportedGroupBy: ['project'],
      }))
    }
  })
})
