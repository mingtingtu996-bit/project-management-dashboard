import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Reports from '../Reports'
import { useStore } from '@/hooks/useStore'

const apiClientMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/services/dashboardApi', () => ({
  DashboardApiService: {
    getProjectSummary: vi.fn(async () => ({
      overallProgress: 64,
      completedTaskCount: 81,
      totalTasks: 120,
      inProgressTaskCount: 12,
      delayedTaskCount: 3,
      completedMilestones: 2,
      totalMilestones: 5,
      milestoneProgress: 40,
      healthScore: 82,
      healthStatus: '健康',
      activeRiskCount: 4,
      riskCount: 7,
      pendingConditionCount: 3,
      activeObstacleCount: 2,
      pendingConditionTaskCount: 2,
      activeObstacleTaskCount: 2,
      milestoneOverview: { split_count: 0, merged_count: 0, pending_mapping_count: 0, upcoming_count: 0, overdue_count: 0 },
    })),
    getProjectCriticalPathSummary: vi.fn(async () => ({
      summaryText: '关键路径 3 项，工期 12 天，备选 1 条，关注 1 项，插链 1 项',
      primaryTaskCount: 3,
      alternateChainCount: 1,
      manualAttentionCount: 1,
      manualInsertedCount: 1,
      displayTaskCount: 4,
      projectDurationDays: 12,
      snapshot: {
        projectId: 'project-1',
        autoTaskIds: ['task-1', 'task-2'],
        manualAttentionTaskIds: ['task-1'],
        manualInsertedTaskIds: ['task-2'],
        primaryChain: null,
        alternateChains: [],
        displayTaskIds: ['task-1', 'task-2', 'task-3', 'task-4'],
        edges: [],
        tasks: [],
        projectDurationDays: 12,
      } as never,
    })),
  },
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: apiClientMock.apiGet,
  getApiErrorMessage: (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback),
}))

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function waitForText(container: HTMLElement, expected: string[]) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    const text = container.textContent || ''
    if (expected.every((item) => text.includes(item))) {
      return
    }
  }

  throw new Error(`Timed out waiting for: ${expected.join(', ')}`)
}

function findButton(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(label),
  ) as HTMLButtonElement | undefined
}

async function renderReports(root: Root | null, initialEntry: string) {
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/projects/:id/reports" element={<Reports />} />
        </Routes>
      </MemoryRouter>,
    )
    await flush()
    await flush()
  })
}

function dataQualitySummaryResponse(projectId: string) {
  return {
    projectId,
    month: '2026-04',
    confidence: {
      score: 84,
      flag: 'medium' as const,
      note: '数据质量存在波动，建议结合现场复核',
      timelinessScore: 83,
      anomalyScore: 80,
      consistencyScore: 86,
      coverageScore: 88,
      jumpinessScore: 82,
      activeFindingCount: 3,
      trendWarningCount: 1,
      anomalyFindingCount: 1,
      crossCheckFindingCount: 1,
    },
    prompt: {
      count: 1,
      summary: '存在 1 条需要重点复核的数据质量异常',
      items: [
        {
          id: 'finding-1',
          taskId: 'task-1',
          taskTitle: '主体施工',
          ruleCode: 'PROGRESS_TIME_MISMATCH',
          severity: 'warning' as const,
          summary: '进度与时间发生轻微错位',
          recommendation: '复核最新进度填报时间',
        },
      ],
    },
    ownerDigest: {
      shouldNotify: false,
      severity: 'warning' as const,
      scopeLabel: '主体施工',
      findingCount: 3,
      summary: '建议复核主体施工的数据填报',
    },
    findings: [],
  }
}

describe('Reports story coverage', () => {
  const projectId = 'project-1'
  const projectName = '示例项目'
  let container: HTMLDivElement
  let root: Root | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    apiClientMock.apiGet.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/data-quality/project-summary?')) {
        return dataQualitySummaryResponse(projectId)
      }

      if (url.startsWith(`/api/projects/${projectId}/materials/summary`)) {
        return {
          overview: {
            totalExpectedCount: 6,
            onTimeCount: 4,
            arrivalRate: 67,
          },
          byUnit: [
            {
              participantUnitId: 'unit-1',
              participantUnitName: '幕墙单位',
              specialtyTypes: ['幕墙'],
              totalExpectedCount: 4,
              onTimeCount: 3,
              arrivalRate: 75,
            },
          ],
          monthlyTrend: [
            { month: '2026-01', totalExpectedCount: 1, onTimeCount: 1, arrivalRate: 100 },
            { month: '2026-02', totalExpectedCount: 1, onTimeCount: 0, arrivalRate: 0 },
            { month: '2026-03', totalExpectedCount: 2, onTimeCount: 1, arrivalRate: 50 },
            { month: '2026-04', totalExpectedCount: 2, onTimeCount: 2, arrivalRate: 100 },
            { month: '2026-05', totalExpectedCount: 0, onTimeCount: 0, arrivalRate: 0 },
            { month: '2026-06', totalExpectedCount: 0, onTimeCount: 0, arrivalRate: 0 },
          ],
        }
      }

      if (url.startsWith('/api/task-baselines')) {
        return [
          {
            id: 'baseline-v7',
            project_id: projectId,
            version: 7,
            status: 'confirmed',
            title: 'v7',
            confirmed_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 'baseline-v8',
            project_id: projectId,
            version: 8,
            status: 'confirmed',
            title: 'v8',
            confirmed_at: '2026-04-15T00:00:00.000Z',
            updated_at: '2026-04-15T00:00:00.000Z',
          },
        ]
      }

      if (url.startsWith('/api/progress-deviation/lock?')) {
        return {
          lock: {
            id: 'lock-1',
            project_id: projectId,
            baseline_version_id: 'baseline-v8',
            resource_id: 'project-1:baseline-v8',
            locked_by: 'pm-user',
            locked_at: '2026-04-15T09:00:00.000Z',
            lock_expires_at: '2026-04-15T09:30:00.000Z',
            is_locked: true,
          },
        }
      }

      if (url.startsWith('/api/progress-deviation')) {
        return {
          project_id: projectId,
          baseline_version_id: 'baseline-v8',
          monthly_plan_version_id: null,
          summary: {
            total_items: 4,
            deviated_items: 3,
            carryover_items: 1,
            unresolved_items: 1,
            baseline_items: 2,
            monthly_plan_items: 1,
            execution_items: 1,
          },
          rows: [
            {
              id: 'row-1',
              title: '基线任务A',
              mainline: 'baseline',
              planned_progress: 60,
              actual_progress: 52,
              actual_date: '2026-04-13',
              deviation_days: 3,
              deviation_rate: 12,
              status: 'delayed',
              reason: '基线版本切换后需要重新确认',
              mapping_status: 'mapping_pending',
            },
            {
              id: 'row-2',
              title: '月度兑现B',
              mainline: 'monthly_plan',
              planned_progress: 80,
              actual_progress: 74,
              actual_date: '2026-04-14',
              deviation_days: -2,
              deviation_rate: -8,
              status: 'in_progress',
              reason: '版本切换后进度回补',
              mapping_status: 'merged_into',
              merged_into: {
                group_id: 'group-1',
                target_item_id: 'row-3',
                title: '汇入节点C',
                item_ids: ['row-2'],
              },
            },
            {
              id: 'row-3',
              title: '执行节点C',
              mainline: 'execution',
              planned_progress: 90,
              actual_progress: 88,
              actual_date: '2026-04-15',
              deviation_days: 1,
              deviation_rate: 2,
              status: 'in_progress',
              reason: '执行中节点',
              child_group: {
                group_id: 'group-2',
                parent_item_id: 'row-3',
                parent_title: '执行节点C',
                child_count: 2,
                last_completed_date: '2026-04-15',
                children: [
                  { id: 'row-3-a', title: '子项1', actual_date: '2026-04-15', status: 'completed' },
                  { id: 'row-3-b', title: '子项2', actual_date: null, status: 'in_progress' },
                ],
              },
            },
          ],
          mainlines: [
            {
              key: 'baseline',
              label: '基线偏差',
              summary: { total_items: 1, deviated_items: 1, delayed_items: 1, unresolved_items: 1 },
              rows: [
                {
                  id: 'row-1',
                  title: '基线任务A',
                  mainline: 'baseline',
                  planned_progress: 60,
                  actual_progress: 52,
                  actual_date: '2026-04-13',
                  deviation_days: 3,
                  deviation_rate: 12,
                  status: 'delayed',
                  reason: '基线版本切换后需要重新确认',
                  mapping_status: 'mapping_pending',
                },
              ],
            },
            {
              key: 'monthly_plan',
              label: '月度完成情况',
              summary: { total_items: 1, deviated_items: 1, delayed_items: 0, unresolved_items: 0 },
              rows: [
                {
                  id: 'row-2',
                  title: '月度兑现B',
                  mainline: 'monthly_plan',
                  planned_progress: 80,
                  actual_progress: 74,
                  actual_date: '2026-04-14',
                  deviation_days: -2,
                  deviation_rate: -8,
                  status: 'in_progress',
                  reason: '版本切换后进度回补',
                  mapping_status: 'merged_into',
                  merged_into: {
                    group_id: 'group-1',
                    target_item_id: 'row-3',
                    title: '汇入节点C',
                    item_ids: ['row-2'],
                  },
                },
              ],
            },
            {
              key: 'execution',
              label: '执行偏差',
              summary: { total_items: 2, deviated_items: 1, delayed_items: 0, unresolved_items: 0 },
              rows: [
                {
                  id: 'row-3',
                  title: '执行节点C',
                  mainline: 'execution',
                  planned_progress: 90,
                  actual_progress: 88,
                  actual_date: '2026-04-15',
                  deviation_days: 1,
                  deviation_rate: 2,
                  status: 'in_progress',
                  reason: '执行中节点',
                  child_group: {
                    group_id: 'group-2',
                    parent_item_id: 'row-3',
                    parent_title: '执行节点C',
                    child_count: 2,
                    last_completed_date: '2026-04-15',
                    children: [
                      { id: 'row-3-a', title: '子项1', actual_date: '2026-04-15', status: 'completed' },
                      { id: 'row-3-b', title: '子项2', actual_date: null, status: 'in_progress' },
                    ],
                  },
                },
              ],
            },
          ],
          trend_events: [
            {
              event_type: 'baseline_version_switch',
              marker_type: 'vertical_line',
              switch_date: '2026-04-15',
              from_version: 'v7',
              to_version: 'v8',
              explanation: '2026-04-15 before v7 / after v8',
            },
          ],
        }
      }

      if (url.startsWith('/api/change-logs')) {
        return [
          {
            id: 'log-1',
            project_id: projectId,
            entity_type: 'task',
            entity_id: 'task-1',
            field_name: 'planned_end_date',
            old_value: '2026-04-10',
            new_value: '2026-04-13',
            change_reason: '顺延施工窗口',
            change_source: 'manual_adjusted',
            changed_at: '2026-04-12T10:00:00.000Z',
          },
          {
            id: 'log-2',
            project_id: projectId,
            entity_type: 'delay_request',
            entity_id: 'delay-1',
            field_name: 'status',
            old_value: 'pending',
            new_value: 'approved',
            change_reason: '延期审批通过',
            change_source: 'approval',
            changed_at: '2026-04-13T10:00:00.000Z',
          },
          {
            id: 'log-3',
            project_id: projectId,
            entity_type: 'task_condition',
            entity_id: 'condition-1',
            field_name: 'is_satisfied',
            old_value: '0',
            new_value: '1',
            change_reason: '任务开工自动闭合',
            change_source: 'system_auto',
            changed_at: '2026-04-14T10:00:00.000Z',
          },
        ]
      }

      throw new Error(`Unexpected apiGet url: ${url}`)
    })

    useStore.setState({
      currentProject: {
        id: projectId,
        name: projectName,
      } as never,
      projects: [] as never,
      tasks: [
        {
          id: 'task-1',
          project_id: projectId,
          title: '主体施工',
          status: 'in_progress',
          planned_end_date: '2026-04-10',
          progress: 58,
          is_milestone: false,
        },
        {
          id: 'task-2',
          project_id: projectId,
          title: '节点验收',
          status: 'completed',
          planned_end_date: '2026-04-05',
          progress: 100,
          is_milestone: true,
        },
      ] as never,
      risks: [
        {
          id: 'risk-1',
          project_id: projectId,
          title: '材料到货延迟',
          level: 'high',
          status: 'active',
          risk_source: '供应链',
          description: '关键材料还在路上',
        },
      ] as never,
      milestones: [] as never,
      conditions: [
        {
          id: 'cond-1',
          task_id: 'task-1',
          status: 'open',
          title: '图纸未确认',
        },
      ] as never,
      obstacles: [
        {
          id: 'obs-1',
          task_id: 'task-1',
          severity: 'high',
          status: 'active',
          title: '现场协调受阻',
        },
      ] as never,
    })
  })

  afterEach(() => {
    apiClientMock.apiGet.mockReset()
    useStore.setState({ currentProject: null } as never)
    useStore.setState({
      projects: [] as never,
      tasks: [] as never,
      risks: [] as never,
      milestones: [] as never,
      conditions: [] as never,
      obstacles: [] as never,
    })

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
  })

  it('keeps the shell stable while switching all three deviation views', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=execution`)

    await waitForText(container, ['进度偏差分析', '版本切换说明', '下钻明细区'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-module-tabs"]')).toBeTruthy()
    expect(container.textContent).toContain('返回项目总览')
    expect(container.textContent).not.toContain('模块分析')
    expect(container.textContent).not.toContain('返回项目 Dashboard')
    expect(container.textContent).not.toContain('返回 Dashboard')
    expect(container.querySelector('[data-testid="analysis-entry-progress_deviation"]')).toBeTruthy()
    expect(container.textContent).toContain('责任归因分析')
    expect(container.querySelector('[data-testid="deviation-tabs"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-focus-hint"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-filter-chips"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-change_log"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-deviation-lock-card"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-delay-statistics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-delay-obstacle-correlation"]')).toBeTruthy()
    expect(container.textContent).toContain('版本锁状态')
    expect(container.textContent).toContain('pm-user')
    expect(container.textContent).toContain('变更记录分析')

    const baselineTab = findButton(container, '基线偏差')
    expect(baselineTab).toBeTruthy()
    await act(async () => {
      baselineTab?.click()
      await flush()
    })

    await waitForText(container, ['基线偏差', 'mapping_pending', '版本切换说明'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.textContent).toContain('mapping_pending')

    const monthlyTab = findButton(container, '月度完成情况')
    expect(monthlyTab).toBeTruthy()
    await act(async () => {
      monthlyTab?.click()
      await flush()
    })

    await waitForText(container, ['月度完成情况', 'merged_into', '版本切换说明'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.textContent).toContain('merged_into')

    const executionTab = findButton(container, '执行偏差')
    expect(executionTab).toBeTruthy()
    await act(async () => {
      executionTab?.click()
      await flush()
    })

    await waitForText(container, ['执行偏差', 'child_group', '版本切换说明'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.textContent).toContain('child_group')
  })

  it('maps legacy license, acceptance and wbs routes into progress analysis', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=wbs`)

    await waitForText(container, ['项目进度总览分析', '工期偏差与执行判断', '关键路径摘要'])

    expect(container.textContent).not.toContain('前期证照状态分析')
    expect(container.textContent).not.toContain('验收进度分析')
    expect(container.textContent).not.toContain('WBS完成度分析')
    expect(container.querySelector('[data-testid="reports-module-tabs"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-critical-path-summary"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-progress_deviation"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-risk"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-change_log"]')).toBeTruthy()
  })

  it('shows the current view markers directly from the chosen route', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=baseline`)

    await waitForText(container, ['基线偏差', 'mapping_pending', '版本切换说明'])

    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.textContent).toContain('mapping_pending')
    expect(container.textContent).toContain('版本切换说明')
  })

  it('exposes the change log analysis entry with real project-level records', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=change_log`)

    await waitForText(container, ['变更记录分析', '顺延施工窗口', 'manual_adjusted'])

    expect(container.querySelector('[data-testid="change-log-view"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-progress"]')).toBeTruthy()
    expect(container.textContent).toContain('范围/结构相关')
    expect(container.textContent).toContain('计划调整相关')
    expect(container.textContent).toContain('执行/异常相关')
    expect(container.textContent).not.toContain('变更记录占位')
  })

  it('renders the risk analysis deep link with its own summary header and detail blocks', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=risk`)

    await waitForText(container, ['风险与问题分析', '返回风险与问题', '风险压力结构', '重点风险与问题清单'])

    expect(container.querySelector('[data-testid="reports-current-metrics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-progress"]')).toBeTruthy()
    expect(container.textContent).toContain('处置建议')
    expect(container.textContent).toContain('当前优先关注')
  })
  it('renders material arrival summary in the risk module', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=risk`)
    expect(container.querySelector('[data-testid="reports-material-arrival-summary"]')).toBeTruthy()
  })
})
