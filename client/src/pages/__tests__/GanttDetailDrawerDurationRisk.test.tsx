import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GanttDetailDrawer } from '../GanttView/GanttDetailDrawer'
import type { Task } from '../GanttViewTypes'

vi.mock('@/services/durationSuggestionsApi', () => ({
  getTaskDurationForecast: vi.fn(async () => null),
}))

vi.mock('@/hooks/useDurationForecastRefreshKey', () => ({
  useDurationForecastRefreshKey: vi.fn(() => 0),
}))

const noop = () => {}

function renderDrawer(task: Task) {
  return render(
    <GanttDetailDrawer
      acceptanceItems={[]}
      blockages={[]}
      canEdit={false}
      conditions={[]}
      conditionRecords={[]}
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
    })

    expect(screen.getByText('工期风险')).toBeInTheDocument()
    expect(screen.getByText('建议预留 45 天')).toBeInTheDocument()
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
    expect(screen.getByText('建议预留 46 天')).toBeInTheDocument()
    expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
  })

  it('surfaces CPM float days from task read DTOs in the task detail drawer', () => {
    renderDrawer({
      id: 'task-2',
      project_id: 'project-1',
      title: '机电联合调试',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
      is_critical: true,
      total_float_days: 0,
      free_float_days: 3,
    } as Task & { total_float_days: number; free_float_days: number })

    expect(screen.getByText('关键路径浮时')).toBeInTheDocument()
    expect(screen.getByText('总浮时 0 天')).toBeInTheDocument()
    expect(screen.getByText('自由浮时 3 天')).toBeInTheDocument()
  })

  it('surfaces calendar, runtime sample, and seasonal duration asset evidence from generated task metadata', () => {
    renderDrawer({
      id: 'task-3',
      project_id: 'project-1',
      title: '雨季基坑施工',
      created_at: '2026-07-07T00:00:00.000Z',
      updated_at: '2026-07-07T00:00:00.000Z',
      standard_task_metadata: {
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 2,
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
    expect(screen.getByText('运行样本 160 天')).toBeInTheDocument()
    expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
    expect(screen.getByText('季节修正 雨季')).toBeInTheDocument()
  })
})
