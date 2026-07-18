import { describe, expect, it } from 'vitest'

import type { Task } from '../GanttViewTypes'
import { getTaskSequencingBasis, withTaskScheduleEvidence } from './taskScheduleEvidence'

describe('withTaskScheduleEvidence', () => {
  it('hydrates planning-row labels from wizard task metadata duration evidence', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      title: '教学楼主体结构',
      total_float_days: 0,
      free_float_days: 2,
      standard_task_metadata: {
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 2,
        durationSuggestion: {
          riskP20DurationDays: 198,
          riskP50DurationDays: 230,
          riskP80DurationDays: 276,
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

    const row = withTaskScheduleEvidence(task)

    expect(row.durationRiskRangeLabel).toBe('建议预留 46 天')
    expect(row.durationRiskRangeLabel).not.toMatch(/P20|P50|P80/)
    expect(row.criticalFloatLabel).toBe('总浮时 0 天 / 自由浮时 2 天')
    expect(row.durationAssetEvidenceLabel).toBe('施工日历 2 个窗口；运行样本 220 天；季节修正 雨季')
    expect(row.durationAssetEvidenceLabel).not.toMatch(/P20|P50|P80/)
    expect(row.durationSuggestion).toEqual(expect.objectContaining({
      riskP50DurationDays: 230,
    }))
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
