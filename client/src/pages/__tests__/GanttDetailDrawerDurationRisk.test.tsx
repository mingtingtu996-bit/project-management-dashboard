import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GanttDetailDrawer } from '../GanttView/GanttDetailDrawer'
import type { Task } from '../GanttViewTypes'
import type { CriticalTaskNetworkSchedule } from '@/lib/criticalPath'
import { getTaskDurationForecast, type TaskDurationForecast } from '@/services/durationSuggestionsApi'

vi.mock('@/services/durationSuggestionsApi', () => ({
  getTaskDurationForecast: vi.fn(async () => null),
}))

vi.mock('@/hooks/useDurationForecastRefreshKey', () => ({
  useDurationForecastRefreshKey: vi.fn(() => 0),
}))

const noop = () => {}

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

function schedule(availability: 'available' | 'unavailable' = 'available'): CriticalTaskNetworkSchedule {
  return {
    taskId: 'task-2',
    earliestStartOffsetDays: 0,
    earliestFinishOffsetDays: 10,
    latestStartOffsetDays: 0,
    latestFinishOffsetDays: 10,
    floatDays: 999,
    float: productionMetric(0, availability),
    freeFloatDays: 999,
    freeFloat: productionMetric(3, availability),
    durationDays: 999,
    duration: productionMetric(10, availability),
    isAutoCritical: true,
  }
}

function renderDrawer(task: Task, criticalSchedule?: CriticalTaskNetworkSchedule | null) {
  return render(
    <GanttDetailDrawer
      acceptanceItems={[]}
      blockages={[]}
      canEdit={false}
      conditions={[]}
      conditionRecords={[]}
      criticalSchedule={criticalSchedule}
      detailScopeDirty={false}
      detailScopeDraftObjectId={null}
      engineeringObjectLookupOptions={[]}
      engineeringObjectsLoading={false}
      hasNext={false}
      hasPrevious={false}
      navigate={vi.fn()}
      onAddBlockage={noop}
      onClose={noop}
      onDeleteCondition={noop}
      onNextTask={noop}
      onOpenConditionDialog={noop}
      onOpenEngineeringObjects={noop}
      onPreviousTask={noop}
      onResolveObstacle={noop}
      onSaveScopeObject={noop}
      onScopeDraftObjectChange={noop}
      onSectionChange={noop}
      onSelectTask={noop}
      onToggleCondition={noop}
      obstacles={[]}
      predecessors={[]}
      primaryScopeObjectId={null}
      projectId="project-1"
      relatedRiskIssueCount={0}
      relatedRiskIssueSummary={null}
      scopeObjects={[]}
      section="basic"
      task={task}
    />,
  )
}

describe('GanttDetailDrawer duration risk range', () => {
  it('shows unavailable production-day delay without presenting it as no deviation', async () => {
    const unavailableMetric = productionMetric(null, 'unavailable')
    vi.mocked(getTaskDurationForecast).mockResolvedValueOnce({
      taskId: 'task-unavailable-delay',
      remainingForecastDays: null,
      remainingDuration: unavailableMetric,
      conservativeDurationDays: null,
      forecastFinishDate: null,
      forecastDelay: unavailableMetric,
      forecastDelayDays: null,
      probabilityDurationMetrics: {
        p20RemainingDuration: unavailableMetric,
        p50RemainingDuration: unavailableMetric,
        p80RemainingDuration: unavailableMetric,
      },
      confidenceLevel: 'unavailable',
      confidenceScore: 0,
      forecastSource: 'unavailable',
      businessReason: 'Construction calendar identity is unavailable.',
    } satisfies TaskDurationForecast)

    renderDrawer({
      id: 'task-unavailable-delay',
      project_id: 'project-1',
      title: 'Unavailable delay task',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
    })

    expect(await screen.findAllByText('生产日口径不可用')).not.toHaveLength(0)
    expect(screen.queryByText('无明显偏差')).not.toBeInTheDocument()
  })

  it('presents generated duration uncertainty as a plain-language reserve from task read DTOs', () => {
    renderDrawer({
      id: 'task-1',
      project_id: 'project-1',
      title: '主体结构施工',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
      duration_risk_p20_days: 210,
      duration_risk_p50_days: 240,
      duration_risk_p80_days: 285,
      duration_risk_range: {
        durationRiskDistribution: {
          p20Duration: productionMetric(220),
          p50Duration: productionMetric(240),
          p80Duration: productionMetric(245),
          reserveDuration: productionMetric(5),
          source: 'duration_benchmarks',
          scope: 'company',
          sampleCount: 24,
          generatedAt: '2026-07-01T08:00:00.000Z',
          sourceAsOf: '2026-06-30T23:59:59.000Z',
          availability: 'available',
          unavailableReason: null,
        },
      },
    })

    expect(screen.getByText('工期风险')).toBeInTheDocument()
    expect(screen.getByText('建议预留 5 个生产日')).toBeInTheDocument()
    expect(screen.queryByText('建议预留 45 天')).not.toBeInTheDocument()
    expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
  })

  it('presents generated duration uncertainty without percentile terminology from wizard task metadata', () => {
    renderDrawer({
      id: 'task-1b',
      project_id: 'project-1',
      title: '教学楼主体结构',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
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
    })

    expect(screen.getByText('工期风险')).toBeInTheDocument()
    expect(screen.getByText('生产日口径不可用')).toBeInTheDocument()
    expect(screen.queryByText('建议预留 46 天')).not.toBeInTheDocument()
    expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
  })

  it('surfaces typed CPM float facts without consuming task legacy numerics', () => {
    renderDrawer({
      id: 'task-2',
      project_id: 'project-1',
      title: '机电联合调试',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
      is_critical: true,
      total_float_days: 999,
      free_float_days: 999,
    } as Task & { total_float_days: number; free_float_days: number }, schedule())

    expect(screen.getByText('关键路径浮时')).toBeInTheDocument()
    expect(screen.getByText('总浮时 0 个生产日')).toBeInTheDocument()
    expect(screen.getByText('自由浮时 3 个生产日')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('999')
  })

  it('keeps CPM float values unavailable when calendar identity is missing', () => {
    renderDrawer({
      id: 'task-2',
      project_id: 'project-1',
      title: '机电联合调试',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
      is_critical: true,
      total_float_days: 999,
      free_float_days: 999,
    } as Task & { total_float_days: number; free_float_days: number }, schedule('unavailable'))

    expect(screen.getByText('总浮时 生产日口径不可用')).toBeInTheDocument()
    expect(screen.getByText('自由浮时 生产日口径不可用')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('999')
  })

  it('fails closed for a runtime sample that has no typed production-day distribution', () => {
    renderDrawer({
      id: 'task-3',
      project_id: 'project-1',
      title: '雨季基坑施工',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
      standard_task_metadata: {
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 2,
        durationSuggestion: {
          durationRiskDistribution: {
            p20Duration: productionMetric(150),
            p50Duration: productionMetric(160),
            p80Duration: productionMetric(176),
            reserveDuration: productionMetric(16),
            source: 'system_standard_duration_asset',
            scope: 'system',
            sampleCount: null,
            generatedAt: '2026-07-01T08:00:00.000Z',
            sourceAsOf: '2026-06-30T23:59:59.000Z',
            availability: 'available',
            unavailableReason: null,
          },
        },
        durationAssetCalculation: {
          selectedDurationDays: 176,
          runtimeReferenceDaysConsumed: true,
          runtimeReferenceDaysP50Days: 160,
          processSeasonalDurationAssetConsumed: true,
          processSeasonalClimateSignal: 'rainy_season',
        },
      },
    })

    expect(screen.getByText('工期资产依据')).toBeInTheDocument()
    expect(screen.getByText('施工日历 2 个窗口')).toBeInTheDocument()
    expect(screen.getByText('运行样本 生产日口径不可用')).toBeInTheDocument()
    expect(screen.queryByText('运行样本 160 天')).not.toBeInTheDocument()
    expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
    expect(screen.getByText('季节修正 雨季')).toBeInTheDocument()
  })
})
