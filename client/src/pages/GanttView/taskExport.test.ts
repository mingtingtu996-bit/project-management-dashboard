import { describe, expect, it } from 'vitest'

import type { Task } from '../GanttViewTypes'
import { buildTaskExportData } from './taskExport'

describe('Gantt task export duration evidence', () => {
  it('exports plain-language duration risk, CPM float days, and duration asset evidence', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      wbs_code: '1.2',
      title: '雨季基坑施工',
      start_date: '2026-07-01',
      end_date: '2026-12-23',
      is_critical: true,
      total_float_days: 0,
      free_float_days: 3,
      duration_risk_p20_days: 150,
      duration_risk_p50_days: 176,
      duration_risk_p80_days: 210,
      standard_task_metadata: {
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 2,
        durationAssetCalculation: {
          runtimeReferenceDaysConsumed: true,
          runtimeReferenceDaysP50Days: 160,
          processSeasonalDurationAssetConsumed: true,
          processSeasonalClimateSignal: 'rainy_season',
        },
      },
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
    } satisfies Task

    const rows = buildTaskExportData([task], {}, 'all', [], new Set(['task-1']))
    const headers = rows[0]
    const exported = rows[1]

    expect(headers).toEqual(expect.arrayContaining([
      '工期风险',
      '总浮时(天)',
      '自由浮时(天)',
      '工期资产依据',
    ]))
    expect(exported[headers.indexOf('工期风险')]).toBe('建议预留 34 天')
    expect(exported[headers.indexOf('总浮时(天)')]).toBe('0')
    expect(exported[headers.indexOf('自由浮时(天)')]).toBe('3')
    expect(exported[headers.indexOf('工期资产依据')]).toBe('施工日历 2 个窗口；运行样本 160 天；季节修正 雨季')
    expect(headers.join(' ')).not.toMatch(/P20|P50|P80/)
    expect(exported.join(' ')).not.toMatch(/P20|P50|P80/)
  })

  it('exports selected schedule evidence when exporting visible task-list columns', () => {
    const task = {
      id: 'task-1',
      project_id: 'project-1',
      wbs_code: '1.2',
      title: '雨季基坑施工',
      start_date: '2026-07-01',
      end_date: '2026-12-23',
      total_float_days: 0,
      free_float_days: 3,
      duration_risk_p20_days: 150,
      duration_risk_p50_days: 176,
      duration_risk_p80_days: 210,
      standard_task_metadata: {
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 2,
        durationAssetCalculation: {
          runtimeReferenceDaysConsumed: true,
          runtimeReferenceDaysP50Days: 160,
          processSeasonalDurationAssetConsumed: true,
          processSeasonalClimateSignal: 'rainy_season',
        },
      },
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
    } satisfies Task

    const rows = buildTaskExportData(
      [task],
      {},
      'visible',
      ['duration_risk', 'float', 'duration_asset_evidence'],
    )
    const headers = rows[0]
    const exported = rows[1]

    expect(headers).toEqual(expect.arrayContaining([
      '工期风险',
      '总浮时(天)',
      '自由浮时(天)',
      '工期资产依据',
    ]))
    expect(exported[headers.indexOf('工期风险')]).toBe('建议预留 34 天')
    expect(exported[headers.indexOf('总浮时(天)')]).toBe('0')
    expect(exported[headers.indexOf('自由浮时(天)')]).toBe('3')
    expect(exported[headers.indexOf('工期资产依据')]).toBe('施工日历 2 个窗口；运行样本 160 天；季节修正 雨季')
    expect(headers.join(' ')).not.toMatch(/P20|P50|P80/)
    expect(exported.join(' ')).not.toMatch(/P20|P50|P80/)
  })

  it('exports a plain-language reserve from wizard task metadata', () => {
    const task = {
      id: 'task-2',
      project_id: 'project-1',
      title: '教学楼主体结构',
      start_date: '2026-07-01',
      end_date: '2027-02-15',
      standard_task_metadata: {
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
      },
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
    } satisfies Task

    const rows = buildTaskExportData([task], {}, 'visible', ['duration_risk'])
    const headers = rows[0]
    const exported = rows[1]

    expect(headers).toContain('工期风险')
    expect(exported[headers.indexOf('工期风险')]).toBe('建议预留 46 天')
    expect(exported.join(' ')).not.toMatch(/P20|P50|P80/)
  })
})
