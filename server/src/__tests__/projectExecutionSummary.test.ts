import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildKeyNodeSummary,
  buildMilestoneKpiComparisons,
  buildMilestoneOverview,
  buildProjectKpiComparisons,
  calculateBaselineDeviationRate,
  calculateDelayMetrics,
  calculateMonthlyProductivityDistribution,
  calculatePlanPhaseCount,
  deriveMonthlyCloseStatus,
  summarizeUnreadWarningSignals,
  summarizePlanningGovernanceStates,
  summarizeSupplementaryProjectData,
} from '../services/projectExecutionSummaryService.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')

const SHUTDOWN_CALENDAR: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [{
    holidayCode: 'spring-festival-shutdown',
    holidayName: 'Spring Festival shutdown',
    startDate: '2026-02-11',
    endDate: '2026-02-24',
    counts_as_construction_shutdown: true,
  }],
}

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('summarizeSupplementaryProjectData', () => {
  it('counts certificate, acceptance and drawing summaries by project consistently', () => {
    const result = summarizeSupplementaryProjectData({
      preMilestones: [
        { id: 'pm-1', project_id: 'p-1', status: 'approved' },
        { id: 'pm-2', project_id: 'p-1', status: 'pending' },
        { id: 'pm-3', project_id: 'p-1', status: 'preparing_documents' },
        { id: 'pm-4', project_id: 'p-1', status: 'expired' },
      ],
      acceptancePlans: [
        { id: 'ap-1', project_id: 'p-1', status: 'not_started' },
        { id: 'ap-2', project_id: 'p-1', status: 'in_acceptance' },
        { id: 'ap-3', project_id: 'p-1', status: 'passed' },
        { id: 'ap-4', project_id: 'p-1', status: 'rectification' },
        { id: 'ap-5', project_id: 'p-1', status: 'rectification' },
      ],
      constructionDrawings: [
        { id: 'dw-1', project_id: 'p-1', status: '编制中', review_status: '未提交' },
        { id: 'dw-2', project_id: 'p-1', status: 'issued', review_status: 'passed' },
        { id: 'dw-3', project_id: 'p-1', status: '审图中', review_status: '审查中' },
      ],
    })

    expect(result).toEqual({
      preMilestoneCount: 4,
      completedPreMilestoneCount: 1,
      activePreMilestoneCount: 2,
      overduePreMilestoneCount: 1,
      acceptancePlanCount: 5,
      passedAcceptancePlanCount: 1,
      inProgressAcceptancePlanCount: 1,
      failedAcceptancePlanCount: 2,
      constructionDrawingCount: 3,
      issuedConstructionDrawingCount: 1,
      reviewingConstructionDrawingCount: 2,
    })
  })
})

describe('calculatePlanPhaseCount', () => {
  it('counts plan phases from v1.4 task phase fields without frontend aggregation', () => {
    const result = calculatePlanPhaseCount([
      {
        id: 'phase-summary-1',
        title: '地下结构阶段',
        wbs_node_type: 'phase',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'task-1',
        title: '土方开挖',
        phase_object_id: 'phase-basement',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'task-2',
        title: '地下室底板',
        phase_object_id: 'phase-basement',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'task-3',
        title: '主体结构',
        phase_object_id: 'phase-main',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    ] as any)

    expect(result).toBe(3)
  })
})

describe('buildMilestoneOverview', () => {
  it('exposes milestone list and stats from the shared project summary source', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const result = buildMilestoneOverview([
      {
        id: 'm-1',
        title: 'main roof',
        description: 'key structural milestone',
        is_milestone: true,
        status: 'completed',
        progress: 100,
        planned_end_date: '2026-04-01',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'm-2',
        title: 'basement construction',
        description: 'in progress',
        is_milestone: true,
        status: 'in_progress',
        progress: 60,
        planned_end_date: futureDate,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 't-1',
        title: 'regular task',
        description: 'should not enter milestone stats',
        is_milestone: false,
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-04-08',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
    ] as any)

    expect(result.stats).toEqual({
      total: 2,
      pending: 1,
      completed: 1,
      overdue: 0,
      upcomingSoon: 1,
      completionRate: 50,
    })
    expect(result.items.map((item) => item.name)).toEqual(['basement construction', 'main roof'])
    expect(result.items[0]?.status).toBe('soon')
    expect(result.items[1]?.status).toBe('completed')
  })

  it('keeps plan shifts and future windows as Gregorian calendar days while production variances fail closed without calendar identity', () => {
    const tasks = [
      {
        id: 'm-overdue',
        title: 'Overdue milestone',
        is_milestone: true,
        status: 'in_progress',
        progress: 30,
        baseline_item_id: 'baseline-item-1',
        baseline_end: '2026-04-05',
        planned_end_date: '2026-04-10',
      },
      {
        id: 'm-completed',
        title: 'Completed milestone',
        is_milestone: true,
        status: 'completed',
        progress: 100,
        baseline_item_id: 'baseline-item-2',
        baseline_end: '2026-04-05',
        planned_end_date: '2026-04-10',
        actual_end_date: '2026-04-15',
      },
    ] as any
    const asOf = new Date('2026-04-15T08:00:00.000Z')
    const identifiedCalendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'site_shutdown',
        startDate: '2026-04-11',
        endDate: '2026-04-13',
        counts_as_construction_shutdown: true,
      }],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v2',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    }
    const missingCalendar: ConstructionCalendarContext = {
      basis: 'calendar_day',
      windows: [],
      calendarRef: null,
      calendarVersion: null,
      timezone: 'Asia/Shanghai',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    }

    const available = buildMilestoneOverview(tasks, asOf, identifiedCalendar)
    const unavailable = buildMilestoneOverview(tasks, asOf, missingCalendar)
    const availableOverdue = available.items.find((item) => item.id === 'm-overdue')
    const unavailableOverdue = unavailable.items.find((item) => item.id === 'm-overdue')
    const availableCompleted = available.items.find((item) => item.id === 'm-completed')
    const unavailableCompleted = unavailable.items.find((item) => item.id === 'm-completed')

    expect(availableOverdue?.planDateShift).toMatchObject({
      value: 5,
      unit: 'calendar_day',
      calendarRef: 'gregorian',
      calendarVersion: 'ISO-8601',
      availability: 'available',
    })
    expect(unavailableOverdue?.planDateShift).toEqual(availableOverdue?.planDateShift)
    expect(availableOverdue?.futureDueWindow).toMatchObject({ value: -5, unit: 'calendar_day', availability: 'available' })
    expect(unavailableOverdue?.futureDueWindow).toEqual(availableOverdue?.futureDueWindow)
    expect(availableOverdue?.actualOverdue).toMatchObject({
      value: 2,
      unit: 'construction_production_day',
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v2',
      availability: 'available',
    })
    expect(unavailableOverdue?.actualOverdue).toMatchObject({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
      unavailableReason: 'construction_calendar_identity_missing',
    })
    expect(availableCompleted?.actualScheduleVariance).toMatchObject({
      value: 2,
      unit: 'construction_production_day',
      availability: 'available',
    })
    expect(unavailableCompleted?.actualScheduleVariance).toMatchObject({
      value: null,
      unit: 'construction_production_day',
      availability: 'unavailable',
    })
  })

  it('uses the construction-calendar business date for lifecycle and the 30-day due window', () => {
    const asOf = new Date('2026-04-09T16:30:00.000Z')
    const calendar: ConstructionCalendarContext = {
      basis: 'official_construction_calendar_seed',
      windows: [],
      calendarRef: 'work_calendar',
      calendarVersion: 'calendar-v2',
      timezone: 'Asia/Shanghai',
      availability: 'available',
      unavailableReason: null,
    }

    const overdue = buildMilestoneOverview([{
      id: 'm-business-overdue',
      title: 'Business-day overdue milestone',
      is_milestone: true,
      status: 'in_progress',
      progress: 20,
      planned_end_date: '2026-04-09',
    }] as any, asOf, calendar)
    const dueWindow = buildMilestoneOverview([{
      id: 'm-business-window',
      title: 'Business-day 30-day milestone',
      is_milestone: true,
      status: 'in_progress',
      progress: 20,
      planned_end_date: '2026-05-10',
    }] as any, asOf, calendar)

    expect(overdue.items[0]).toEqual(expect.objectContaining({
      status: 'overdue',
      futureDueWindow: expect.objectContaining({ value: -1, asOf: '2026-04-10' }),
    }))
    expect(dueWindow.items[0]?.futureDueWindow).toEqual(expect.objectContaining({
      value: 30,
      asOf: '2026-04-10',
    }))
    expect(dueWindow.summaryStats?.dueSoon30dCount).toBe(1)
  })

  it('publishes milestone baseline relation labels without health chip counts', () => {
    const result = buildMilestoneOverview([
      {
        id: 'm-plan',
        title: '主体结构封顶',
        description: '计划映射待确',
        is_milestone: true,
        status: 'in_progress',
        progress: 40,
        baseline_item_id: 'removed-baseline-item',
        baseline_end: '2026-08-13',
        planned_end_date: '2026-08-13',
        milestone_mapping_pending: true,
        milestone_non_base_labels: ['待补映射'],
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'm-data',
        title: '竣工验收',
        description: '缺少当前计划',
        is_milestone: true,
        status: 'completed',
        progress: 80,
        baseline_end: '2026-10-01',
        planned_end_date: null,
        actual_end_date: null,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'm-normal',
        title: '样板验收',
        description: '姝ｅ父鑺傜偣',
        is_milestone: true,
        status: 'in_progress',
        progress: 20,
        baseline_item_id: 'baseline-item',
        baseline_end: '2026-07-01',
        planned_end_date: '2026-07-01',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-24T00:00:00.000Z',
      },
    ] as any)

    const planItem = result.items.find((item) => item.id === 'm-plan')
    const dataItem = result.items.find((item) => item.id === 'm-data')
    const normalItem = result.items.find((item) => item.id === 'm-normal')
    expect(planItem?.mapping_pending).toBe(true)
    expect(planItem?.planned_date).toBeNull()
    expect(planItem?.non_base_labels?.length).toBeGreaterThan(0)
    expect(dataItem?.planned_date).toBeNull()
    expect(dataItem?.non_base_labels?.length).toBeGreaterThan(0)
    expect(normalItem?.non_base_labels).toEqual([])
    expect('healthSummary' in result).toBe(false)
  })

  it('keeps planning date gaps out of the data incomplete bucket', () => {
    const result = buildMilestoneOverview([
      {
        id: 'm-plan-gap',
        title: '幕墙封闭',
        description: '缺少计划日期',
        is_milestone: true,
        status: 'in_progress',
        progress: 30,
        baseline_item_id: 'baseline-item',
        baseline_end: null,
        planned_end_date: null,
        actual_end_date: null,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-24T00:00:00.000Z',
      },
    ] as any)

    expect(result.items[0]?.non_base_labels).toContain('缺基线日期')
    expect(result.items[0]?.non_base_labels).toContain('缺当前计划')
    expect(result.items[0]?.non_base_labels).not.toContain('数据不完整')
    expect('healthSummary' in result).toBe(false)
  })
})

describe('buildKeyNodeSummary', () => {
  it('dedupes key nodes while keeping source and status counts independent', () => {
    const result = buildKeyNodeSummary([
      {
        id: 'milestone-critical',
        project_id: 'p-1',
        title: 'Milestone on critical path',
        status: 'in_progress',
        is_milestone: true,
        is_critical: true,
        baseline_item_id: 'baseline-1',
        baseline_end: '2026-04-20',
        planned_end_date: '2026-04-25',
        monthly_plan_item_id: 'monthly-1',
      },
      {
        id: 'baseline-only',
        project_id: 'p-1',
        title: 'Baseline control node',
        status: 'completed',
        is_milestone: false,
        baseline_item_id: 'baseline-2',
        baseline_is_critical: true,
        baseline_end: '2026-04-10',
        planned_end_date: '2026-04-10',
        actual_end_date: '2026-04-12',
      },
      {
        id: 'regular',
        project_id: 'p-1',
        title: 'Regular task',
        status: 'in_progress',
        is_milestone: false,
        planned_end_date: '2026-04-30',
      },
    ] as any, {
      criticalTaskIds: new Set(['milestone-critical']),
      pendingConditions: [{ id: 'condition-1', task_id: 'milestone-critical', status: 'pending' }] as any,
      activeObstacles: [],
      asOf: new Date('2026-04-18T00:00:00.000Z'),
    })

    expect(result).toEqual({
      total: 2,
      milestoneCount: 1,
      criticalPathCount: 1,
      monthlyControlCount: 1,
      baselineControlCount: 2,
      dueSoonCount: 2,
      shiftedCount: 2,
      blockedCount: 1,
      highRiskCount: 1,
    })
  })
})

describe('summarizePlanningGovernanceStates', () => {
  it('collapses governance states into dashboard-consumable signals', () => {
    const result = summarizePlanningGovernanceStates([
      {
        id: 'state-1',
        project_id: 'p-1',
        state_key: 'p-1:monthly_plan:m-1:closeout_overdue_signal',
        category: 'closeout',
        kind: 'closeout_overdue_signal',
        status: 'active',
        severity: 'critical',
        title: 'closeout overdue',
        detail: 'dashboard signal',
        dashboard_signal: true,
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      } as any,
      {
        id: 'state-2',
        project_id: 'p-1',
        state_key: 'p-1:passive_reorder:7:reorder_summary',
        category: 'reorder',
        kind: 'reorder_summary',
        status: 'resolved',
        severity: 'critical',
        title: 'reorder summary',
        detail: 'summary generated',
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      } as any,
    ])

    expect(result).toEqual({
      activeCount: 1,
      closeoutOverdueSignalCount: 1,
      closeoutOwnerAttentionCount: 0,
      reorderReminderCount: 0,
      reorderEscalationCount: 0,
      reorderSummaryCount: 1,
      adHocReminderCount: 0,
      dashboardCloseoutOverdue: true,
      dashboardCloseoutOwnerAttentionRequired: false,
      hasActiveGovernanceSignal: true,
    })
  })
})

describe('deriveMonthlyCloseStatus', () => {
  it('marks the current month as overdue when closeout governance signals are active', () => {
    const result = deriveMonthlyCloseStatus(
      [
        {
          id: 'plan-1',
          project_id: 'p-1',
          status: 'confirmed',
          month: '2026-04',
          closeout_at: null,
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      ] as any,
      [
        {
          id: 'state-1',
          project_id: 'p-1',
          state_key: 'state-1',
          category: 'closeout',
          kind: 'closeout_overdue_signal',
          status: 'active',
          severity: 'critical',
          title: 'closeout overdue',
          detail: 'overdue',
          payload: { overdue_days: 6 },
          created_at: '2026-04-06T00:00:00.000Z',
          updated_at: '2026-04-06T00:00:00.000Z',
        } as any,
      ],
      new Date('2026-04-18T00:00:00.000Z'),
    )

    expect(result).toBe('已超期')
  })

  it('falls back to not started when the current month has no plan', () => {
    const result = deriveMonthlyCloseStatus([], [], new Date('2026-04-18T00:00:00.000Z'))
    expect(result).toBe('未开始')
  })
})

describe('summarizeUnreadWarningSignals', () => {
  it('returns unread count and the highest severity summary', () => {
    const result = summarizeUnreadWarningSignals([
      {
        id: 'notification-1',
        project_id: 'p-1',
        severity: 'warning',
        level: 'warning',
        title: '一般预',
        content: '需要跟',
        status: 'unread',
        is_read: false,
        created_at: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'notification-2',
        project_id: 'p-1',
        severity: 'critical',
        level: 'critical',
        title: '关键路径任务受阻',
        content: 'critical task is blocked',
        status: 'unread',
        is_read: false,
        created_at: '2026-04-11T00:00:00.000Z',
      },
      {
        id: 'notification-3',
        project_id: 'p-1',
        severity: 'info',
        level: 'info',
        title: '已读提示',
        content: 'should not be counted',
        status: 'read',
        is_read: true,
        created_at: '2026-04-12T00:00:00.000Z',
      },
    ] as any)

    expect(result).toEqual({
      unreadWarningCount: 2,
      highestWarningLevel: 'critical',
      highestWarningSummary: '关键路径任务受阻',
    })
  })
})

describe('buildProjectKpiComparisons', () => {
  it('computes Dashboard primary KPI weekly deltas from snapshot values', () => {
    const result = buildProjectKpiComparisons(
      { progress: 35, deviation: 5, risks: 2, todos: 4 },
      {
        snapshot_date: '2026-04-22',
        overall_progress: 31,
        delay_days: 2,
        active_risk_count: 5,
        today_todo_count: 1,
      },
    )

    expect(result.weekly.progress).toMatchObject({ current: 35, previous: 31, delta: 4, status: 'ready' })
    expect(result.weekly.deviation).toMatchObject({ current: 5, previous: 2, delta: 3, status: 'ready' })
    expect(result.weekly.risks).toMatchObject({ current: 2, previous: 5, delta: -3, status: 'ready' })
    expect(result.weekly.todos).toMatchObject({ current: 4, previous: 1, delta: 3, status: 'ready' })
  })

  it('marks KPI comparison as insufficient when history is unavailable', () => {
    const result = buildProjectKpiComparisons(
      { progress: 35, deviation: 5, risks: 2, todos: 4 },
      null,
    )

    expect(result.weekly.progress).toMatchObject({ previous: null, delta: null, status: 'insufficient_history' })
    expect(result.weekly.todos).toMatchObject({ previous: null, delta: null, status: 'insufficient_history' })
  })
})

describe('buildMilestoneKpiComparisons', () => {
  it('computes milestone KPI monthly deltas from snapshot values', () => {
    const result = buildMilestoneKpiComparisons(
      {
        shiftedCount: 3,
        baselineOnTimeCount: 6,
        dueSoon30dCount: 2,
        highRiskCount: 1,
      },
      {
        snapshot_date: '2026-04-05',
        shifted_milestone_count: 1,
        milestone_baseline_on_time_count: 4,
        milestone_due_soon_30d_count: 5,
        milestone_high_risk_count: 1,
      },
    )

    expect(result.monthly.shifted).toMatchObject({ current: 3, previous: 1, delta: 2, periodLabel: '较上月', status: 'ready' })
    expect(result.monthly.baselineOnTime).toMatchObject({ current: 6, previous: 4, delta: 2, periodLabel: '较上月', status: 'ready' })
    expect(result.monthly.dueSoon30d).toMatchObject({ current: 2, previous: 5, delta: -3, periodLabel: '较上月', status: 'ready' })
    expect(result.monthly.highRisk).toMatchObject({ current: 1, previous: 1, delta: 0, periodLabel: '较上月', status: 'ready' })
  })

  it('marks milestone monthly comparisons as insufficient when history is unavailable', () => {
    const result = buildMilestoneKpiComparisons(
      {
        shiftedCount: 3,
        baselineOnTimeCount: 6,
        dueSoon30dCount: 2,
        highRiskCount: 1,
      },
      null,
    )

    expect(result.monthly.shifted).toMatchObject({ previous: null, delta: null, periodLabel: '较上月', status: 'insufficient_history' })
    expect(result.monthly.highRisk).toMatchObject({ previous: null, delta: null, periodLabel: '较上月', status: 'insufficient_history' })
  })
})

describe('projects summary query shape', () => {
  it('keeps all-project dashboard summaries on narrow unordered queries', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(source).toContain('async function loadSummaryTasks(projectIds?: string[] | null, systemJob = false): Promise<Task[]>')
    expect(source).toContain('SELECT id, project_id, parent_id, title, description, status, progress, is_milestone')
    expect(source).toContain('planned_start_date, planned_end_date, start_date, end_date, actual_end_date')
    expect(source).toContain('loadSummaryTasks(scopedProjectIds, options.systemJob === true),')
    expect(source).toContain('return attachCurrentBaselineProjectionToTasks(rows)')
    expect(source).not.toContain('baseline_start, baseline_end')
    expect(source).not.toContain('getTasks(),')
  })

  it('keeps production summary direct SQL on fixed branches', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(source).not.toContain('sqlByKind')
    expect(source).not.toContain('rawQuery(sqlByKind')
    expect(source).toContain("case 'summaryProjectsAll':")
    expect(source).toContain('SELECT id, name, company_id, status')
    expect(source).toContain("case 'summaryConstructionDrawingsAll':")
    expect(source).toContain('SELECT id, project_id, status, review_status FROM construction_drawings')
  })

  it('evaluates milestone lifecycle and due-soon counts from the supplied asOf date', () => {
    const result = buildMilestoneOverview([
      {
        id: 'm-soon',
        title: 'soon milestone',
        is_milestone: true,
        status: 'in_progress',
        progress: 20,
        planned_end_date: '2026-04-25',
      },
      {
        id: 'm-future',
        title: 'future milestone',
        is_milestone: true,
        status: 'in_progress',
        progress: 10,
        planned_end_date: '2026-06-30',
      },
    ] as any, new Date('2026-04-18T00:00:00.000Z'))

    expect(result.items.find((item) => item.id === 'm-soon')?.status).toBe('soon')
    expect(result.summaryStats?.dueSoon30dCount).toBe(1)
  })

  it('keeps post-access task filtering without a range compatibility branch', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')
    const removedRangeFlag = ['include', 'Historical'].join('')
    const removedHelperName = ['appendTask', 'HistoricalScope'].join('')

    expect(source).not.toContain("COALESCE((standard_task_metadata->>'is_historical')::boolean, false)")
    expect(source).not.toContain("standard_task_metadata->>'is_historical'")
    expect(source).toContain('function isHistoricalTask(task: Task): boolean')
    expect(source).toContain('const scopedTasks = tasks.filter((task) => !isHistoricalTask(task))')
    expect(source).not.toContain(removedRangeFlag)
    expect(source).not.toContain(removedHelperName)
    expect(source).not.toContain('COALESCE(is_historical, false)')
    expect(source).not.toContain('is_executable, is_historical, standard_task_metadata')
  })

  it('exposes dashboard summary fields needed by task-list KPI cards', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(source).toContain("import { getTaskLagLevel } from './taskLagStatusService.js'")
    expect(source).toContain('overdueTaskCount: number')
    expect(source).toContain('laggedTaskCount: number')
    expect(source).toContain('const laggedTaskCount = leafTasks.filter((task) => getTaskLagLevel(task) !== null).length')
    expect(source).toContain('overdueTaskCount: delayedTaskCount')
    expect(source).toContain('laggedTaskCount,')
  })

  it('publishes monthly plan KPI counters from the project execution summary outlet', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(source).toContain('monthlyPlanConfirmedCount: number')
    expect(source).toContain('monthlyPlanClosedCount: number')
    expect(source).toContain('monthlyPlanPendingCloseoutCount: number')
    expect(source).toContain('monthlyPlanConfirmedCount: statusSummary.confirmedCount')
    expect(source).toContain('monthlyPlanClosedCount: statusSummary.closedCount')
    expect(source).toContain('monthlyPlanPendingCloseoutCount: statusSummary.pendingCloseoutCount')
    expect(source).toContain('monthlyPlanConfirmedCount,')
    expect(source).toContain('monthlyPlanClosedCount,')
    expect(source).toContain('monthlyPlanPendingCloseoutCount,')
  })
})

describe('asOf-sensitive project summary metrics', () => {
  it('calculates open-task delay days from the supplied asOf date', () => {
    const result = calculateDelayMetrics([
      {
        id: 'task-overdue',
        status: 'in_progress',
        planned_end_date: '2026-04-10',
      },
    ] as any, new Date('2026-04-18T00:00:00.000Z'))

    expect(result).toMatchObject({
      delayedTaskCount: 1,
      delayDays: 8,
      delayCount: 1,
    })
  })

  it('calculates open-task delay days in construction production days when a calendar is supplied', () => {
    const result = calculateDelayMetrics([
      {
        id: 'task-overdue-through-shutdown',
        status: 'in_progress',
        planned_end_date: '2026-02-10',
      },
    ] as any, new Date('2026-03-01T00:00:00.000Z'), SHUTDOWN_CALENDAR)

    expect(result).toMatchObject({
      delayedTaskCount: 1,
      delayDays: 5,
      delayCount: 1,
    })
  })

  it('keeps baseline deviation tied to the supplied asOf date', () => {
    const result = calculateBaselineDeviationRate([
      {
        id: 'task-baseline',
        status: 'in_progress',
        baseline_item_id: 'baseline-1',
        baseline_end: '2026-04-10',
      },
    ] as any, new Date('2026-04-18T00:00:00.000Z'))

    expect(result).toBe(100)
  })

  it('uses the unified touchpoint summary as the Dashboard today-todo source', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(source).toContain("import { buildAttentionSummary } from './todoTouchpointService.js'")
    expect(source).toContain(': await buildAttentionSummary(project.id')
    expect(source).toContain('const todayTodoCount = attentionSummary.todayTodoCount')
    expect(source).toContain('projectTodayActionCount: todayTodoCount')
    expect(source).not.toContain('function countTodayTodoSignals')
  })
})

describe('calculateMonthlyProductivityDistribution', () => {
  it('keeps acceleration tail signals visible when the monthly average is diluted by a large task set', () => {
    const tasks = [
      ...Array.from({ length: 1200 }, (_, index) => ({
        id: `normal-${index}`,
        status: 'in_progress',
        progress: 50,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
      })),
      ...Array.from({ length: 80 }, (_, index) => ({
        id: `accelerating-${index}`,
        status: 'completed',
        progress: 100,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-20',
      })),
    ]

    const result = calculateMonthlyProductivityDistribution(tasks as any, new Date('2026-05-31T00:00:00.000Z'))

    expect(result).toEqual(expect.objectContaining({
      monthlyProductivityCaseCount: 1280,
      accelerationCaseRatio: expect.any(Number),
      monthlyMaxP: expect.any(Number),
      monthlyP90: expect.any(Number),
      sampleMaturity: 'high',
      representativeness: expect.objectContaining({
        sampleCount: 1280,
        maturity: 'high',
        criticalPathSampleCount: 0,
      }),
    }))
    expect(result.monthlyAverageP ?? 0).toBeLessThan(1)
    expect(result.monthlyMaxP ?? 0).toBeGreaterThan(1)
    expect(result.accelerationCaseRatio ?? 0).toBeGreaterThan(0.05)
  })

  it('keeps scope-level acceleration visible by building, specialty and critical path', () => {
    const tasks = [
      ...Array.from({ length: 20 }, (_, index) => ({
        id: `b1-normal-${index}`,
        status: 'in_progress',
        progress: 50,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
        building_object_id: 'B1',
        engineering_category_id: 'civil',
        is_critical: false,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `b2-fast-${index}`,
        status: 'completed',
        progress: 100,
        planned_start_date: '2026-05-01',
        planned_end_date: '2026-05-30',
        actual_start_date: '2026-05-01',
        actual_end_date: '2026-05-18',
        building_object_id: 'B2',
        engineering_category_id: 'mep',
        is_critical: true,
      })),
    ]

    const result = calculateMonthlyProductivityDistribution(tasks as any, new Date('2026-05-31T00:00:00.000Z'))

    expect(result.scopeDistributions?.byBuilding.B2.monthlyMaxP).toBeGreaterThan(1)
    expect(result.scopeDistributions?.bySpecialty.mep.accelerationCaseRatio).toBe(1)
    expect(result.scopeDistributions?.criticalPath.monthlyMaxP).toBeGreaterThan(1)
    expect(result.scopeDistributions?.criticalPath.representativeness?.sampleCount).toBe(6)
    expect(result.scopeDistributions?.criticalPath.sampleMaturity).toBe('low')
    expect(result.scopeDistributions?.byBuilding.B1.monthlyMaxP).toBeLessThan(1)
  })
})
