import { act } from 'react'
import { fireEvent, waitFor } from '@testing-library/react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Reports from '../Reports'
import { useStore } from '@/hooks/useStore'
import { DashboardApiService } from '@/services/dashboardApi'

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
      businessHealthScore: 82,
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
      summaryText: 'critical path summary',
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
  getAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test-token' })),
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
  root?.render(
    <MemoryRouter key={initialEntry} initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/projects/:id/reports" element={<Reports />} />
      </Routes>
    </MemoryRouter>,
  )
  await flush()
}

function readReportsSource() {
  const candidates = [
    join(process.cwd(), 'src/pages/Reports.tsx'),
    join(process.cwd(), 'client/src/pages/Reports.tsx'),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Try the next workspace root.
    }
  }

  throw new Error(`Unable to locate Reports.tsx in: ${candidates.join(', ')}`)
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
      if (url.startsWith(`/api/projects/${projectId}/metrics/trend?`)) {
        return {
          projectId,
          metric: 'overall_progress',
          from: '2026-04-01',
          to: '2026-04-30',
          groupBy: 'none',
          granularity: 'week',
          points: [
            { date: '2026-04-01', value: 60 },
            { date: '2026-04-08', value: 61 },
            { date: '2026-04-15', value: 64 },
          ],
        }
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
              reason: 'baseline switch requires review',
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
              reason: 'progress rollback after version switch',
              mapping_status: 'merged_into',
              merged_into: {
                group_id: 'group-1',
                target_item_id: 'row-3',
                title: '姹囧叆鑺傜偣C',
                item_ids: ['row-2'],
              },
            },
            {
              id: 'row-3',
              title: '鎵ц鑺傜偣C',
              mainline: 'execution',
              planned_progress: 90,
              actual_progress: 88,
              actual_date: '2026-04-15',
              deviation_days: 1,
              deviation_rate: 2,
              status: 'in_progress',
              source_task_id: 'task-1',
              reason: 'execution node',
              attribution: {
                cause_chain: [
                  {
                    cause_type: 'dependency_wait',
                    affected_task_id: 'task-1',
                    upstream_task_id: 'task-upstream-a',
                    impacted_owner: 'Owner B',
                    accountable_owner: 'Owner A',
                    responsibility_basis: 'upstream_dependency',
                    evidence_source: 'task_duration_forecasts.metadata.forecastSources.dependencyPropagation',
                    evidence_id: 'forecast-row-1',
                    impact_days: 4,
                    confidence: 'high',
                    evidence: {
                      wait_days: 4,
                    },
                  },
                ],
              },
              child_group: {
                group_id: 'group-2',
                parent_item_id: 'row-3',
                parent_title: '鎵ц鑺傜偣C',
                child_count: 2,
                last_completed_date: '2026-04-15',
                children: [
                  { id: 'row-3-a', title: '瀛愰」1', actual_date: '2026-04-15', status: 'completed' },
                  { id: 'row-3-b', title: '瀛愰」2', actual_date: null, status: 'in_progress' },
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
                  reason: 'baseline switch requires review',
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
                  reason: 'progress rollback after version switch',
                  mapping_status: 'merged_into',
                  merged_into: {
                    group_id: 'group-1',
                    target_item_id: 'row-3',
                    title: '姹囧叆鑺傜偣C',
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
                  title: '鎵ц鑺傜偣C',
                  mainline: 'execution',
                  planned_progress: 90,
                  actual_progress: 88,
                  actual_date: '2026-04-15',
                  deviation_days: 1,
                  deviation_rate: 2,
                  status: 'in_progress',
                  reason: 'execution node',
                  attribution: {
                    cause_chain: [
                      {
                        cause_type: 'dependency_wait',
                        affected_task_id: 'task-1',
                        upstream_task_id: 'task-upstream-a',
                        impacted_owner: 'Owner B',
                        accountable_owner: 'Owner A',
                        responsibility_basis: 'upstream_dependency',
                        evidence_source: 'task_duration_forecasts.metadata.forecastSources.dependencyPropagation',
                        evidence_id: 'forecast-row-1',
                        impact_days: 4,
                        confidence: 'high',
                        evidence: {
                          wait_days: 4,
                        },
                      },
                    ],
                  },
                  child_group: {
                    group_id: 'group-2',
                    parent_item_id: 'row-3',
                    parent_title: '鎵ц鑺傜偣C',
                    child_count: 2,
                    last_completed_date: '2026-04-15',
                    children: [
                      { id: 'row-3-a', title: '瀛愰」1', actual_date: '2026-04-15', status: 'completed' },
                      { id: 'row-3-b', title: '瀛愰」2', actual_date: null, status: 'in_progress' },
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
          responsibility_contribution: [
            {
              owner: 'Owner A',
              owner_id: 'unit-owner-a',
              count: 1,
              percentage: 100,
              task_ids: ['task-1'],
              causal_task_ids: ['task-upstream-a'],
              responsibility_role: 'accountable_subject',
              basis: 'upstream_dependency',
              impact_days: 4,
              weighted_count: 1,
              weighted_percentage: 100,
              evidence_sources: ['task_duration_forecasts.metadata.forecastSources.dependencyPropagation'],
              confidence: 0.92,
            },
          ],
          top_deviation_causes: [
            {
              reason: 'upstream_dependency',
              count: 1,
              percentage: 100,
            },
          ],
        }
      }

      if (url.startsWith('/api/issues/summary')) {
        return {
          project_id: projectId,
          total_issues: 2,
          active_issues: 1,
          status_counts: {
            open: 1,
            closed: 1,
          },
          severity_counts: {
            high: 1,
            medium: 1,
          },
          source_counts: [
            { key: 'manual', label: '浜哄伐褰曞叆', count: 1 },
            { key: 'system', label: '系统生成', count: 1 },
          ],
          trend: [
            { date: '2026-04-01', newIssues: 1, resolvedIssues: 0, activeIssues: 1 },
            { date: '2026-04-02', newIssues: 0, resolvedIssues: 1, activeIssues: 1 },
          ],
          recent_issues: [
            {
              id: 'issue-1',
              title: '问题A',
              description: '说明A',
              status: 'open',
              source_type: 'manual',
              created_at: '2026-04-01T08:00:00.000Z',
            },
          ],
        }
      }

      if (url === '/api/metrics/registry') {
        return [
          { key: 'overall_progress', label: '总体进度', description: '项目整体加权进度', frontendVisible: true },
          { key: 'health_score', label: '业务健康分', description: '项目业务健康评分', frontendVisible: true },
          { key: 'delay_days', label: '延期天数', description: '累计延期时间', frontendVisible: true },
          { key: 'schedule_deviation_days', label: '偏差天数', description: '实际完成相对计划完成的签名偏差', frontendVisible: true },
          { key: 'active_risk_count', label: '活跃风险数', description: '当前活跃风险数量', frontendVisible: true },
          { key: 'active_obstacle_count', label: '阻碍数', description: '当前活跃阻碍数量', frontendVisible: true },
          { key: 'active_delayed_tasks', label: '延期任务数', description: '自动识别的活跃延期任务数量', frontendVisible: true },
        ]
      }

      if (url === `/api/projects/${projectId}/reports/s-curve`) {
        return [
          { date: '2026-04-01', planned_cumulative: 45, actual_cumulative: 42 },
          { date: '2026-04-08', planned_cumulative: 58, actual_cumulative: 55 },
          { date: '2026-04-15', planned_cumulative: 70, actual_cumulative: 62 },
        ]
      }

      if (url === `/api/engineering-objects?projectId=${projectId}`) {
        return [
          {
            id: 'building-object-1',
            projectId,
            objectType: 'building',
            objectCode: 'BLD-001',
            objectName: '1#楼',
            parentId: null,
            path: 'building-object-1',
            level: 1,
            sortOrder: 1,
            status: 'active',
            metadata: {},
          },
          {
            id: 'section-object-a',
            projectId,
            objectType: 'section',
            objectCode: 'SEC-001',
            objectName: '一标段',
            parentId: null,
            path: 'section-object-a',
            level: 1,
            sortOrder: 1,
            status: 'active',
            metadata: {},
          },
          {
            id: 'physical-zone-south',
            projectId,
            objectType: 'physical_zone',
            objectCode: 'PZ-001',
            objectName: '南区',
            parentId: null,
            path: 'physical-zone-south',
            level: 1,
            sortOrder: 1,
            status: 'active',
            metadata: {},
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
          delay_days: 5,
          dueStatus: { status: 'overdue', label: '逾期', daysUntilDue: -5 },
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
          risk_source: 'supply chain',
          description: '关键材料还在路上',
        },
      ] as never,
      milestones: [] as never,
      conditions: [
        {
          id: 'cond-1',
          task_id: 'task-1',
          status: 'open',
          title: 'drawing not confirmed',
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

    await waitForText(container, ['REPORT'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-module-tabs"]')).toBeTruthy()
    expect(container.textContent).toContain('REPORT')
    expect(container.textContent).not.toContain('模块分析')
    expect(container.textContent).not.toContain('返回项目 Dashboard')
    expect(container.textContent).not.toContain('返回 Dashboard')
    expect(container.querySelector('[data-testid="analysis-entry-progress_deviation"]')).toBeTruthy()
    const acceptanceLink = container.querySelector('[data-testid="reports-acceptance-summary-link"]') as HTMLAnchorElement | null
    expect(acceptanceLink).toBeTruthy()
    const acceptanceUrl = new URL(acceptanceLink!.href)
    expect(acceptanceUrl.pathname).toBe('/projects/project-1/acceptance')
    expect(acceptanceUrl.searchParams.get('status')).toBe('passed')
    expect(acceptanceUrl.searchParams.get('phase')).toBe('all')
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-tabs"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-focus-hint"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-filter-chips"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-change_log"]')).toBeFalsy()
    expect(container.querySelector('[data-testid="reports-deviation-lock-card"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-delay-statistics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-delay-obstacle-correlation"]')).toBeTruthy()
    expect(container.textContent).toContain('pm-user')
    expect(container.textContent).toContain('pm-user')
    expect(container.querySelector('[data-testid="analysis-entry-change_log"]')).toBeFalsy()

    const baselineTab = findButton(container, '基线偏差')
    expect(baselineTab).toBeTruthy()
    await act(async () => {
      baselineTab?.click()
      await flush()
    })

    await waitForText(container, ['REPORT'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-dumbbell-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-dumbbell-chart"]')).toBeTruthy()

    const monthlyTab = findButton(container, '月度兑现偏差')
    expect(monthlyTab).toBeTruthy()
    await act(async () => {
      monthlyTab?.click()
      await flush()
    })

    await waitForText(container, ['REPORT'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-stacked-bar-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="monthly-stacked-bar-chart"]')).toBeTruthy()

    const executionTab = findButton(container, '执行偏差')
    expect(executionTab).toBeTruthy()
    await act(async () => {
      executionTab?.click()
      await flush()
    })

    await waitForText(container, ['REPORT'])
    expect(container.querySelector('[data-testid="deviation-shell"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="execution-scatter-chart"]')).toBeTruthy()

    const deviationRow = container.querySelector('[data-testid="deviation-detail-table"] tr[role="button"]') as HTMLTableRowElement | null
    expect(deviationRow).toBeTruthy()
    act(() => {
      deviationRow?.click()
    })

    await waitForText(document.body, ['查看对应 Gantt'])

    const ganttLink = document.body.querySelector('[data-testid="reports-open-gantt-from-deviation"]') as HTMLAnchorElement | null
    expect(ganttLink).toBeTruthy()
    const ganttUrl = new URL(ganttLink!.href)
    expect(ganttUrl.pathname).toBe('/projects/project-1/gantt')
    expect(ganttUrl.searchParams.get('view')).toBe('gantt')
    expect(ganttUrl.searchParams.get('highlight')).toBe('task-1')
  })

  it('keeps WBS content folded into the canonical progress analysis route', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=progress`)

    await waitForText(container, ['REPORT'])

    expect(container.querySelector("[data-testid='reports-module-tabs']")).toBeTruthy()
    expect(container.textContent).not.toContain('验收进度分析')
    expect(container.querySelector("[data-testid='reports-trend-panel']")).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-module-tabs"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-trend-panel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-critical-path-summary"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-progress_deviation"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-risk"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-change_log"]')).toBeFalsy()
  })

  it('keeps report module navigation visible when shared summary is unavailable', async () => {
    vi.mocked(DashboardApiService.getProjectSummary).mockResolvedValueOnce(null as never)

    await renderReports(root, `/projects/${projectId}/reports?view=progress`)
    await waitForText(container, ['当前项目暂无共享摘要数据'])

    expect(container.querySelector('[data-testid="reports-module-tabs"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-current-metrics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-trend-panel"]')).toBeTruthy()
  })

  it('keeps report module navigation visible while shared summary is still loading', async () => {
    vi.mocked(DashboardApiService.getProjectSummary).mockImplementationOnce(() => new Promise(() => {}) as never)

    await renderReports(root, `/projects/${projectId}/reports?view=progress`)
    await waitForText(container, ['先给结论'])

    expect(container.querySelector('[data-testid="reports-module-tabs"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-current-metrics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="reports-trend-panel"]')).toBeTruthy()
  })

  it('links report summaries and deviation rows to downstream project pages', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=progress`)

    await waitForText(container, ['REPORT'])

    const acceptanceLink = container.querySelector('[data-testid="reports-acceptance-summary-link"]') as HTMLAnchorElement | null
    expect(acceptanceLink).toBeTruthy()
    const acceptanceUrl = new URL(acceptanceLink!.href)
    expect(acceptanceUrl.pathname).toBe('/projects/project-1/acceptance')
    expect(acceptanceUrl.searchParams.get('status')).toBe('passed')
    expect(acceptanceUrl.searchParams.get('phase')).toBe('all')

    await renderReports(root, `/projects/${projectId}/reports?view=risk`)
    await waitForText(container, ['REPORT'])

    const riskLink = container.querySelector('[data-testid="reports-risk-drilldown-risk-1"]') as HTMLAnchorElement | null
    expect(riskLink).toBeTruthy()
    const riskUrl = new URL(riskLink!.href)
    expect(riskUrl.pathname).toBe('/projects/project-1/risks')
    expect(riskUrl.searchParams.get('status')).toBe('all')
    expect(riskUrl.searchParams.get('level')).toBe('high')

    const materialLink = container.querySelector('[data-testid="reports-material-specialty-link-unit-1-幕墙"]') as HTMLAnchorElement | null
    expect(materialLink).toBeTruthy()
    const materialUrl = new URL(materialLink!.href)
    expect(materialUrl.pathname).toBe('/projects/project-1/materials')
    expect(materialUrl.searchParams.get('specialty')).toBe('幕墙')

    await renderReports(root, `/projects/${projectId}/reports?view=execution`)
    await waitForText(container, ['REPORT'])

    const deviationRow = container.querySelector('[data-testid="deviation-detail-table"] tr[role="button"]') as HTMLTableRowElement | null
    expect(deviationRow).toBeTruthy()
    act(() => {
      deviationRow?.click()
    })

    await flush()

    const ganttLink = document.body.querySelector('[data-testid="reports-open-gantt-from-deviation"]') as HTMLAnchorElement | null
    expect(ganttLink).toBeTruthy()
    const ganttUrl = new URL(ganttLink!.href)
    expect(ganttUrl.pathname).toBe('/projects/project-1/gantt')
    expect(ganttUrl.searchParams.get('view')).toBe('gantt')
    expect(ganttUrl.searchParams.get('highlight')).toBe('task-1')
  })

  it('renders accountable-subject evidence for deviation responsibility conversations', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=execution`)

    await waitForText(container, ['Owner A'])

    const responsibilityPanel = container.querySelector('[data-testid="reports-responsibility-analysis"]')
    expect(responsibilityPanel?.textContent).toContain('致因责任主体')
    expect(responsibilityPanel?.textContent).toContain('上游依赖')
    expect(responsibilityPanel?.textContent).toContain('受影响任务 task-1')
    expect(responsibilityPanel?.textContent).toContain('上游致因任务 task-upstream-a')
    expect(responsibilityPanel?.textContent).toContain('主体ID unit-owner-a')
    expect(responsibilityPanel?.textContent).toContain('影响生产日 4')
    expect(responsibilityPanel?.textContent).toContain('权重贡献 1')
    expect(responsibilityPanel?.textContent).toContain('证据来源 task_duration_forecasts.metadata.forecastSources.dependencyPropagation')
    expect(responsibilityPanel?.textContent).not.toContain('upstream_dependency')

    const deviationRow = container.querySelector('[data-testid="deviation-detail-table"] tr[role="button"]') as HTMLTableRowElement | null
    expect(deviationRow).toBeTruthy()
    act(() => {
      deviationRow?.click()
    })

    await waitForText(document.body, ['责任证据链'])

    expect(document.body.textContent).toContain('致因责任主体 Owner A')
    expect(document.body.textContent).toContain('受影响主体 Owner B')
    expect(document.body.textContent).toContain('等待 4 个生产日')
    expect(document.body.textContent).toContain('证据来源 task_duration_forecasts.metadata.forecastSources.dependencyPropagation')
  })

  it('shows the current view markers directly from the chosen route', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=baseline`)

    await waitForText(container, ['REPORT'])

    expect(container.querySelector('[data-testid="baseline-dumbbell-chart"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-detail-table"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="baseline-switch-marker"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="deviation-version-note"]')).toBeTruthy()
    expect(container.querySelector("[data-testid='deviation-detail-table']")).toBeTruthy()
    expect(container.textContent).toContain('BASELINE')
  })

  it('keeps change log analysis out of ordinary report routes', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=change_log`)

    await waitForText(container, ['REPORT'])

    expect(container.querySelector('[data-testid="change-log-view"]')).toBeFalsy()
    expect(container.querySelector('[data-testid="analysis-entry-progress"]')).toBeTruthy()
    expect(container.textContent).toContain('REPORT')
    expect(container.querySelector('[data-testid="analysis-entry-change_log"]')).toBeFalsy()
    expect(container.textContent).not.toContain('task · planned_end_date')
    expect(container.textContent).not.toContain('变更记录占位')
  })

  it('keeps Reports out of the fixed data-quality governance entrance', () => {
    const source = readReportsSource()

    expect(source).not.toContain('DataQualityApiService')
    expect(source).not.toContain('DataConfidenceBreakdown')
    expect(source).not.toContain('/api/data-quality/project-summary')
    expect(source).not.toContain('dataQualitySummary')
  })

  it('uses backend-generated report exports instead of print or client-side XLSX assembly', () => {
    const source = readReportsSource()

    expect(source).toContain('/reports/export')
    expect(source).toContain('/reports/owner-monthly')
    expect(source).toContain('getAuthHeaders')
    expect(source).toContain('URL.createObjectURL')
    expect(source).toContain('业主月报 Excel')
    expect(source).toContain('业主月报 PDF')
    expect(source).not.toContain('window.print()')
    expect(source).not.toContain("import('@e965/xlsx')")
    expect(source).not.toContain('XLSX.writeFile')
  })

  it('does not fall back to retired scopeDimensions store state for report dimensions', () => {
    const source = readReportsSource()

    expect(source).not.toContain('state.scopeDimensions')
    expect(source).not.toContain('scopeDimensions')
  })

  it('downloads owner monthly reports from the backend export endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Blob(['%PDF-test']), {
      status: 200,
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''owner-monthly.pdf",
        'content-type': 'application/pdf',
      },
    }))
    const createObjectUrl = vi.fn(() => 'blob:report-export')
    const revokeObjectUrl = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })

    await renderReports(root, `/projects/${projectId}/reports?view=progress_deviation`)
    await waitForText(container, ['REPORT'])

    const exportButton = findButton(container, '导出')
    expect(exportButton).toBeTruthy()
    fireEvent.pointerDown(exportButton!, { button: 0, ctrlKey: false })

    await waitFor(() => {
      expect(document.body.textContent).toContain('业主月报 PDF')
    })
    const ownerMonthlyPdfItem = Array.from(document.body.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('业主月报 PDF')) as HTMLElement | undefined
    expect(ownerMonthlyPdfItem).toBeTruthy()

    fireEvent.click(ownerMonthlyPdfItem!)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`/api/projects/${projectId}/reports/owner-monthly?`),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      )
    })
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(requestedUrl).toContain('format=pdf')
    expect(requestedUrl).toContain('period=')
    expect(createObjectUrl).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:report-export')
    clickSpy.mockRestore()
    vi.unstubAllGlobals()
  })

  it('renders the risk analysis deep link with its own summary header and detail blocks', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=risk`)

    await waitForText(container, ['REPORT'])

    expect(container.querySelector('[data-testid="reports-current-metrics"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="analysis-entry-progress"]')).toBeTruthy()
    expect(container.textContent).toContain('REPORT')
    expect(container.querySelector("[data-testid='analysis-entry-progress']")).toBeTruthy()

    const riskLink = container.querySelector('[data-testid="reports-risk-drilldown-risk-1"]') as HTMLAnchorElement | null
    expect(riskLink).toBeTruthy()
    const riskUrl = new URL(riskLink!.href)
    expect(riskUrl.pathname).toBe('/projects/project-1/risks')
    expect(riskUrl.searchParams.get('status')).toBe('all')
    expect(riskUrl.searchParams.get('level')).toBe('high')

    const materialLink = container.querySelector('[data-testid="reports-material-specialty-link-unit-1-幕墙"]') as HTMLAnchorElement | null
    expect(materialLink).toBeTruthy()
    const materialUrl = new URL(materialLink!.href)
    expect(materialUrl.pathname).toBe('/projects/project-1/materials')
    expect(materialUrl.searchParams.get('specialty')).toBe('幕墙')
  })
  it('renders material arrival summary in the risk module', async () => {
    await renderReports(root, `/projects/${projectId}/reports?view=risk`)
    await waitForText(container, ['REPORT'])
    expect(container.querySelector('[data-testid="reports-material-arrival-summary"]')).toBeTruthy()
  })
})
