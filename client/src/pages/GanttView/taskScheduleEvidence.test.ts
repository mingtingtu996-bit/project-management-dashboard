import { describe, expect, it } from 'vitest'

import type { Task } from '../GanttViewTypes'
import type { CriticalTaskNetworkSchedule } from '@/lib/criticalPath'
import { getTaskSequencingBasis, withTaskScheduleEvidence } from './taskScheduleEvidence'

function productionMetric(value: number | null, availability: 'available' | 'unavailable' = 'available') {
  return {
    value: availability === 'available' ? value : null,
    unit: 'construction_production_day' as const,
    calendarRef: availability === 'available' ? 'work_calendar' : null,
    calendarVersion: availability === 'available' ? 'calendar-v1' : null,
    timezone: 'Asia/Shanghai',
    asOf: '2026-06-30',
    availability,
    unavailableReason: availability === 'available' ? null : 'construction_calendar_identity_missing',
  }
}

function networkSchedule(floatValue: number | null, freeFloatValue: number | null, availability: 'available' | 'unavailable' = 'available'): CriticalTaskNetworkSchedule {
  return {
    taskId: 'task-1',
    earliestStartOffsetDays: 0,
    earliestFinishOffsetDays: 10,
    latestStartOffsetDays: 0,
    latestFinishOffsetDays: 10,
    floatDays: 999,
    float: productionMetric(floatValue, availability),
    freeFloatDays: 999,
    freeFloat: productionMetric(freeFloatValue, availability),
    durationDays: 999,
    duration: productionMetric(10, availability),
    isAutoCritical: true,
  }
}

describe('withTaskScheduleEvidence', () => {
  it('hydrates planning-row labels from wizard task metadata duration evidence', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '教学楼主体结构',
      total_float_days: 999,
      free_float_days: 999,
      standard_task_metadata: {
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 2,
        durationSuggestion: {
          riskP20DurationDays: 198,
          riskP50DurationDays: 230,
          riskP80DurationDays: 276,
          durationRiskDistribution: {
            p20Duration: productionMetric(200),
            p50Duration: productionMetric(230),
            p80Duration: productionMetric(242),
            reserveDuration: productionMetric(12),
            source: 'duration_benchmarks',
            scope: 'company',
            sampleCount: 24,
            generatedAt: '2026-07-01T08:00:00.000Z',
            sourceAsOf: '2026-06-30T23:59:59.000Z',
            availability: 'available',
            unavailableReason: null,
          },
          durationRiskRange: {
            p20Days: 198,
            p50Days: 230,
            p80Days: 276,
          },
        },
        durationAssetCalculation: {
          runtimeReferenceDaysConsumed: true,
          runtimeReferenceDaysP50Days: 220,
          processSeasonalDurationAssetConsumed: true,
          processSeasonalClimateSignal: 'rainy_season',
        },
      },
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
    } satisfies Task

    const row = withTaskScheduleEvidence(task, networkSchedule(0, 2))

    expect(row.durationRiskRangeLabel).toBe('建议预留 12 个生产日')
    expect(row.durationRiskRangeLabel).not.toMatch(/P20|P50|P80/)
    expect(row.criticalFloatLabel).toBe('总浮时 0 个生产日 / 自由浮时 2 个生产日')
    expect(row.criticalFloatLabel).not.toContain('999')
    expect(row.durationAssetEvidenceLabel).toBe('施工日历 2 个窗口；运行样本 230 个生产日；季节修正 雨季')
    expect(row.durationAssetEvidenceLabel).not.toMatch(/P20|P50|P80/)
    expect(row.durationSuggestion).toEqual(expect.objectContaining({
      riskP50DurationDays: 230,
    }))
  })

  it('keeps CPM float evidence fail-closed when typed calendar identity is unavailable', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '教学楼主体结构',
      is_critical: true,
      total_float_days: 999,
      free_float_days: 999,
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
    } satisfies Task

    const row = withTaskScheduleEvidence(task, networkSchedule(null, null, 'unavailable'))

    expect(row.criticalFloatLabel).toBe('总浮时 生产日口径不可用 / 自由浮时 生产日口径不可用')
    expect(row.criticalFloatLabel).not.toContain('999')
  })

  it('surfaces heuristic sequencing lineage from persisted wizard metadata', () => {
    const task = {
      id: 'task-heuristic-sequencing',
      project_id: 'project-1',
      title: 'Facade follow-up work',
      standard_task_metadata: {
        sequencingBasis: 'heuristic_stagger',
        sequencingGovernanceGapCode: 'master_plan_dependency_rule_gap',
      },
      created_at: '2026-07-18T00:00:00.000Z',
      updated_at: '2026-07-18T00:00:00.000Z',
    } satisfies Task

    expect(getTaskSequencingBasis(task)).toBe('heuristic_stagger')
    expect(withTaskScheduleEvidence(task)).toEqual(expect.objectContaining({
      sequencingBasis: 'heuristic_stagger',
    }))
  })
})
