import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildMilestoneOverview,
  deriveMonthlyCloseStatus,
  summarizeUnreadWarningSignals,
  summarizePlanningGovernanceStates,
  summarizeSupplementaryProjectData,
} from '../services/projectExecutionSummaryService.js'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('summarizeSupplementaryProjectData', () => {
  it('counts certificate, acceptance and drawing summaries by project consistently', () => {
    const result = summarizeSupplementaryProjectData({
      preMilestones: [
        { id: 'pm-1', project_id: 'p-1', status: '待申请' },
        { id: 'pm-2', project_id: 'p-1', status: '办理中' },
        { id: 'pm-3', project_id: 'p-1', status: '已取得' },
        { id: 'pm-4', project_id: 'p-1', status: '需延期' },
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
        { id: 'dw-2', project_id: 'p-1', status: '已出图', review_status: '已通过' },
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

describe('buildMilestoneOverview', () => {
  it('exposes milestone list and stats from the shared project summary source', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const result = buildMilestoneOverview([
      {
        id: 'm-1',
        title: '主体封顶',
        description: '结构施工关键节点',
        is_milestone: true,
        status: 'completed',
        progress: 100,
        planned_end_date: '2026-04-01',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'm-2',
        title: '地下室施工',
        description: '正在推进',
        is_milestone: true,
        status: 'in_progress',
        progress: 60,
        planned_end_date: futureDate,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 't-1',
        title: '普通任务',
        description: '不应进入里程碑统计',
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
    expect(result.items.map((item) => item.name)).toEqual(['地下室施工', '主体封顶'])
    expect(result.items[0]?.status).toBe('soon')
    expect(result.items[1]?.status).toBe('completed')
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
      closeoutForceUnlockCount: 0,
      reorderReminderCount: 0,
      reorderEscalationCount: 0,
      reorderSummaryCount: 1,
      adHocReminderCount: 0,
      dashboardCloseoutOverdue: true,
      dashboardForceUnlockAvailable: false,
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
        title: '一般预警',
        content: '需要跟进',
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
        content: '主体施工已中断',
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
        content: '不应被统计',
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

describe('projects summary query shape', () => {
  it('keeps all-project dashboard summaries on narrow unordered queries', () => {
    const source = readServerFile('src', 'services', 'projectExecutionSummaryService.ts')

    expect(source).toContain('async function loadSummaryTasks()')
    expect(source).toContain('SELECT id, project_id, parent_id, title, description, status, progress, is_milestone')
    expect(source).toContain('loadSummaryTasks(),')
    expect(source).not.toContain('getTasks(),')
  })
})
