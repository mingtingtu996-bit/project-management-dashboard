import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  RESPONSIBILITY_INSIGHT_SCOPE,
  RESPONSIBILITY_HEALTH_RULES,
  buildAlertReasons,
  calculateResponsibilityRiskPressure,
  isResponsibilityQualityBucket,
  resolveResponsibilityWatchStatus,
  shouldBroadcastResponsibilityAlert,
  type ResponsibilitySubjectInsightRow,
} from '../services/responsibilityInsightService.js'

function buildRow(overrides: Partial<ResponsibilitySubjectInsightRow>): ResponsibilitySubjectInsightRow {
  return {
    key: 'unit:unit-1',
    label: '总包单位',
    dimension: 'unit',
    insight_basis: RESPONSIBILITY_INSIGHT_SCOPE.taskOwnershipBasis,
    causal_attribution_policy: RESPONSIBILITY_INSIGHT_SCOPE.causalAttributionPolicy,
    causal_attribution_source: RESPONSIBILITY_INSIGHT_SCOPE.causalAttributionSource,
    subject_user_id: null,
    subject_unit_id: 'unit-1',
    primary_unit_key: null,
    primary_unit_label: null,
    total_tasks: 4,
    completed_count: 2,
    on_time_count: 2,
    delayed_count: 0,
    active_delayed_count: 0,
    current_in_hand_count: 2,
    open_risk_count: 0,
    open_obstacle_count: 0,
    risk_pressure: 0,
    key_commitment_gap_count: 0,
    on_time_rate: 100,
    current_week_completed_count: 2,
    current_week_on_time_rate: 100,
    previous_week_completed_count: 2,
    previous_week_on_time_rate: 100,
    trend_delta: 0,
    trend_direction: 'flat',
    alert_reasons: [],
    state_level: 'healthy',
    watch_status: null,
    watch_id: null,
    alert_state_id: null,
    last_message_id: null,
    suggest_recovery_confirmation: false,
    tasks: [],
    ...overrides,
  }
}

describe('resolveResponsibilityWatchStatus', () => {
  it('keeps cleared watches cleared during the same abnormal cycle', () => {
    expect(
      resolveResponsibilityWatchStatus({
        rowStateLevel: 'abnormal',
        currentStatus: 'cleared',
        previousAlertLevel: 'abnormal',
      }),
    ).toEqual({
      watchStatus: 'cleared',
      suggestRecoveryConfirmation: false,
    })
  })

  it('re-activates a cleared watch when the subject becomes abnormal again after recovery', () => {
    expect(
      resolveResponsibilityWatchStatus({
        rowStateLevel: 'abnormal',
        currentStatus: 'cleared',
        previousAlertLevel: 'healthy',
      }),
    ).toEqual({
      watchStatus: 'active',
      suggestRecoveryConfirmation: false,
    })
  })

  it('suggests recovery confirmation when an active watch becomes healthy', () => {
    expect(
      resolveResponsibilityWatchStatus({
        rowStateLevel: 'healthy',
        currentStatus: 'active',
        previousAlertLevel: 'abnormal',
      }),
    ).toEqual({
      watchStatus: 'suggested_to_clear',
      suggestRecoveryConfirmation: true,
    })
  })
})

describe('responsibility health rules', () => {
  it('declares responsibility insight as execution-performance insight, not causal attribution', () => {
    expect(RESPONSIBILITY_INSIGHT_SCOPE).toMatchObject({
      model: 'execution_performance_insight',
      taskOwnershipBasis: 'tasks.execution_owner_fields',
      causalAttributionPolicy: 'excluded_use_progress_deviation_service',
      causalAttributionSource: 'progressDeviationService.responsibility_contribution',
    })
  })

  it('keeps direct responsibility insight SQL on fixed query branches', () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL('..', import.meta.url)), 'services', 'responsibilityInsightService.ts'),
      'utf8',
    )

    expect(source).not.toContain('responsibilityDirectRows')
    expect(source).not.toContain('rawQuery(sql')
    expect(source).not.toContain('rawQuery(\n    sql')
    expect(source).toContain('rawQuery(')
  })

  it('does not expose updated_at as a responsibility actual finish date', () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL('..', import.meta.url)), 'services', 'responsibilityInsightService.ts'),
      'utf8',
    )

    expect(source).not.toContain('return dateOnly(task.actual_end_date ?? task.updated_at)')
  })

  it('keeps responsibility thresholds in a single exported rule asset', () => {
    expect(RESPONSIBILITY_HEALTH_RULES).toMatchObject({
      lowOnTimeRateThreshold: 60,
      lowOnTimeStreakThreshold: 2,
      activeDelayedTaskThreshold: 3,
      keyCommitmentGapThreshold: 2,
      criticalActiveDelayedTaskThreshold: 5,
      criticalCurrentWeekOnTimeRateThreshold: 40,
    })
  })

  it('does not turn unassigned or unresolved responsibility unit buckets into formal abnormal subjects', () => {
    const unresolved = buildRow({
      key: 'unresolved_unit',
      label: '未关联责任单位：旧文本单位',
      subject_unit_id: null,
      active_delayed_count: 4,
      key_commitment_gap_count: 3,
      current_week_completed_count: 3,
      current_week_on_time_rate: 0,
    })

    expect(isResponsibilityQualityBucket(unresolved)).toBe(true)
    expect(buildAlertReasons(unresolved, 3)).toEqual([])
  })

  it('uses execution facts and critical commitments when building alert reasons', () => {
    const row = buildRow({
      active_delayed_count: 3,
      key_commitment_gap_count: 2,
      current_week_completed_count: 3,
      current_week_on_time_rate: 30,
    })

    expect(buildAlertReasons(row, 2)).toEqual([
      '按时完成率连续 2 个统计周期低于 60%',
      '当前延期任务 3 项',
      '重点承诺缺口 2 项',
    ])
    expect(shouldBroadcastResponsibilityAlert(row)).toBe(true)
  })

  it('persists explain-only pressure policy in the responsibility rule asset', () => {
    expect(RESPONSIBILITY_HEALTH_RULES.source).toBe('v1410_responsibility_health_rule_seed')
    expect(RESPONSIBILITY_HEALTH_RULES.explainOnlyPressureSignals).toEqual([
      'site_capacity_pressure',
      'resource_conflict',
    ])
    expect(RESPONSIBILITY_HEALTH_RULES.riskPressurePolicy).toBe('explain_only_requires_execution_fact')
  })

  it('weights risk pressure by severity, duration, and key commitment impact without changing alert reasons', () => {
    const pressure = calculateResponsibilityRiskPressure({
      openRiskCount: 2,
      openObstacleCount: 2,
      riskSeverityWeights: ['critical', 'low'],
      obstacleSeverityWeights: ['high', 'low'],
      criticalPathPressureCount: 1,
      milestonePressureCount: 1,
      longestOpenDays: 15,
    })

    expect(pressure).toBe(12.5)
    expect(buildAlertReasons(buildRow({ risk_pressure: pressure }), 0)).toEqual([])
  })
})
