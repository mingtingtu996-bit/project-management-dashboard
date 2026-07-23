import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TaskSummary from '../TaskSummary'
import { clearApiClientRuntimeCache } from '@/lib/apiClient'

const permissionState = vi.hoisted(() => ({ canEdit: true }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
  }
})

vi.mock('@/hooks/useStore', () => ({
  useCurrentProject: () => ({
    id: 'project-1',
    name: '示例项目',
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canEdit: permissionState.canEdit, loading: false }),
}))

const mockedUseNavigate = vi.mocked(useNavigate)

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function productionDuration(value: unknown) {
  const numeric = value === null || value === undefined ? null : Number(value)
  return {
    value: Number.isFinite(numeric) ? numeric : null,
    unit: 'construction_production_day',
    calendarRef: 'work_calendar',
    calendarVersion: 'calendar-v1',
    timezone: 'Asia/Shanghai',
    asOf: '2026-07-13',
    availability: Number.isFinite(numeric) ? 'available' : 'unavailable',
    unavailableReason: Number.isFinite(numeric) ? null : 'duration_value_missing',
  }
}

function upgradeDurationContracts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(upgradeDurationContracts)
  if (!value || typeof value !== 'object') return value
  const row = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, upgradeDurationContracts(item)]),
  )
  if ('remainingDurationDays' in row) row.remainingDuration = productionDuration(row.remainingDurationDays)
  if ('targetGapDays' in row) row.targetGap = productionDuration(row.targetGapDays)
  if ('delayDays' in row) row.delay = productionDuration(row.delayDays)
  if ('delay_total_days' in row) row.delay_total = productionDuration(row.delay_total_days)
  if ('delay_days' in row) row.delay = productionDuration(row.delay_days)
  if ('max_delay_days' in row) row.max_delay = productionDuration(row.max_delay_days)
  if ('avg_delay_days' in row) row.avg_delay = productionDuration(row.avg_delay_days)
  return row
}

async function waitForSelector(container: HTMLElement, selector: string) {
  const deadline = Date.now() + 2500

  while (Date.now() < deadline) {
    await act(async () => {
      await flush()
    })

    if (container.querySelector(selector)) {
      return
    }
  }

  throw new Error(`Timed out waiting for selector: ${selector}`)
}

function jsonResponse(data: unknown) {
  const upgraded = upgradeDurationContracts(data)
  const body = JSON.stringify(upgraded)
  return {
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => upgraded,
  } as never
}

function jsonErrorResponse(status: number, data: unknown) {
  const body = JSON.stringify(data)
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => data,
  } as never
}

function scopedForecastResponse(projectId: string) {
  const group = {
    sourceId: null,
    sortOrder: 1,
    taskIds: [] as string[],
    taskCount: 0,
    completedTaskCount: 0,
    remainingTaskCount: 0,
    criticalTaskCount: 0,
    boundaryPredecessorCount: 0,
    unresolvedBoundaryPredecessorCount: 0,
    targetFinishDate: null,
    p20FinishDate: null,
    p50FinishDate: null,
    p80FinishDate: null,
    expectedFinishDate: null,
    remainingDurationDays: null,
    targetGapDays: null,
    delayDays: null,
    confidenceLevel: null,
    confidenceScore: null,
    forecastCoverageRate: 0,
    probabilityCoverageRate: 0,
    forecastState: 'in_progress',
    dataStatus: 'insufficient_data',
    degradationReasons: [] as string[],
    governingTaskIds: [] as string[],
  }
  return {
    success: true,
    data: {
      projectId,
      asOfDate: '2026-07-13',
      dimensions: {
        division: [{
          ...group,
          id: 'division-division-main',
          dimension: 'division',
          sourceId: 'division-main',
          name: '主体结构',
          taskIds: ['task-1', 'task-2', 'task-4'],
          taskCount: 3,
          remainingTaskCount: 3,
          criticalTaskCount: 1,
          boundaryPredecessorCount: 1,
          targetFinishDate: '2026-07-19',
          p20FinishDate: '2026-07-17',
          p50FinishDate: '2026-07-20',
          p80FinishDate: '2026-07-24',
          expectedFinishDate: '2026-07-20',
          remainingDurationDays: 8,
          targetGapDays: 1,
          delayDays: 1,
          confidenceLevel: 'medium',
          confidenceScore: 78,
          forecastCoverageRate: 1,
          probabilityCoverageRate: 0.67,
          dataStatus: 'degraded',
          degradationReasons: ['missing_probability_window'],
          governingTaskIds: ['task-1'],
        }],
        subdivision: [{
          ...group,
          id: 'subdivision-subdivision-structure',
          dimension: 'subdivision',
          sourceId: 'subdivision-structure',
          name: '结构施工',
          taskIds: ['task-1', 'task-2'],
          taskCount: 2,
          remainingTaskCount: 2,
          targetFinishDate: '2026-07-18',
          p20FinishDate: '2026-07-16',
          p50FinishDate: '2026-07-18',
          p80FinishDate: '2026-07-21',
          expectedFinishDate: '2026-07-18',
          remainingDurationDays: 6,
          targetGapDays: 0,
          delayDays: 0,
          confidenceLevel: 'high',
          confidenceScore: 91,
          forecastCoverageRate: 1,
          probabilityCoverageRate: 1,
          dataStatus: 'ready',
          governingTaskIds: ['task-2'],
        }],
        specialty: [{
          ...group,
          id: 'specialty-specialty-mep',
          dimension: 'specialty',
          sourceId: 'specialty-mep',
          name: '机电安装',
          taskIds: ['task-1', 'task-2'],
          taskCount: 2,
          remainingTaskCount: 2,
          degradationReasons: ['missing_usable_finish'],
        }],
      },
      summary: { groupCount: 3, readyCount: 1, degradedCount: 1, insufficientDataCount: 1 },
    },
  }
}

describe('TaskSummary page contract', () => {
  const projectId = 'project-1'
  const currentMonthKey = new Date().toISOString().slice(0, 7)
  const previousMonthKey = (() => {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return date.toISOString().slice(0, 7)
  })()
  const currentMonthDate = `${currentMonthKey}-05`
  let container: HTMLDivElement
  let root: Root | null = null
  const fetchMock = vi.fn()
  let forecastMode: 'success' | 'error' | 'pending' = 'success'
  let summaryMode: 'default' | 'empty' = 'default'
  let resolvePendingForecast: (() => void) | null = null
  let causeListModes: Record<string, 'success' | 'error' | 'pending'> = {}
  let confirmedTaskCauses: Record<string, Array<Record<string, unknown>>> = {}
  let taskDelayRecords: Array<{
    delay_days: number
    reason?: string | null
    recorded_at: string
  }> = []
  let pendingCauseRequests: Array<{
    projectId: string
    signal: AbortSignal | null | undefined
    resolve: (value: unknown) => void
  }> = []

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    Object.assign(HTMLElement.prototype, {
      hasPointerCapture: () => false,
      setPointerCapture: () => undefined,
      releasePointerCapture: () => undefined,
      scrollIntoView: () => undefined,
    })
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    clearApiClientRuntimeCache()
    forecastMode = 'success'
    summaryMode = 'default'
    resolvePendingForecast = null
    permissionState.canEdit = true
    causeListModes = { 'project-1': 'success' }
    confirmedTaskCauses = { 'project-1': [] }
    taskDelayRecords = [{
      delay_days: 2,
      reason: '材料到场延后',
      recorded_at: '2026-04-09',
    }]
    pendingCauseRequests = []

    mockedUseNavigate.mockReturnValue(vi.fn())

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === '/api/cause-attributions/taxonomy') {
        return jsonResponse({
          success: true,
          data: {
            version: 'v1.0.0',
            entries: [{
              code: 'material_shortage',
              label: 'Material shortage or late arrival',
              category: 'resource',
              linkedDeviationReasonTypes: [],
              priority: 90,
            }, {
              code: 'weather_impact',
              label: 'Weather impact',
              category: 'external',
              linkedDeviationReasonTypes: [],
              priority: 82,
            }],
          },
        })
      }

      const causeListMatch = url.match(/^\/api\/cause-attributions\/projects\/([^?]+)\?/)
      if (causeListMatch) {
        const requestedProjectId = decodeURIComponent(causeListMatch[1])
        const mode = causeListModes[requestedProjectId] ?? 'success'
        if (mode === 'error') {
          return jsonErrorResponse(503, {
            success: false,
            error: { code: 'CAUSE_LIST_UNAVAILABLE', message: '已确认延误原因暂不可用' },
          })
        }
        if (mode === 'pending') {
          return new Promise((resolve) => {
            pendingCauseRequests.push({
              projectId: requestedProjectId,
              signal: init?.signal,
              resolve,
            })
          })
        }
        return jsonResponse({ success: true, data: confirmedTaskCauses[requestedProjectId] ?? [] })
      }

      const causeConfirmMatch = url.match(/^\/api\/cause-attributions\/projects\/([^/]+)\/subjects\/task\/task-1\/confirm$/)
      if (causeConfirmMatch && init?.method === 'POST') {
        const requestedProjectId = decodeURIComponent(causeConfirmMatch[1])
        const confirmedTaskCause = {
          id: 'cause-1',
          subject_id: 'task-1',
          cause_code: 'material_shortage',
          cause_role: 'primary',
          event_type: 'delay',
          status: 'confirmed',
          raw_text: '材料到场延后',
        }
        confirmedTaskCauses[requestedProjectId] = [confirmedTaskCause]
        return jsonResponse({ success: true, data: confirmedTaskCause })
      }

      const summaryProjectMatch = url.match(/^\/api\/task-summaries\/projects\/([^/]+)\/task-summary$/)
      const requestedSummaryProjectId = summaryProjectMatch ? decodeURIComponent(summaryProjectMatch[1]) : null
      if (requestedSummaryProjectId && summaryMode === 'empty') {
        return jsonResponse({
          success: true,
          data: {
            stats: {
              total_completed: 0,
              on_time_count: 0,
              delayed_count: 0,
              completed_milestone_count: 0,
              avg_delay_days: 0,
            },
            groups: [],
            attribution_groups: [],
            attribution_totals: {},
            timeline_events: [],
          },
        })
      }

      if (requestedSummaryProjectId) {
        return jsonResponse({
          success: true,
          data: {
            stats: {
              total_completed: 6,
              on_time_count: 5,
              delayed_count: 1,
              completed_milestone_count: 2,
              avg_delay_days: 1.2,
            },
            groups: [
              {
                id: 'group-1',
                name: '里程碑 A',
                status: 'completed',
                completed_at: '2026-04-08',
                planned_end_date: '2026-04-08',
                tasks: [
                  {
                    id: 'task-1',
                    title: '关联任务 1',
                    assignee: '张三',
                    participant_unit_name: '总包单位',
                    specialty_type: '机电安装',
                    division_name: '主体结构',
                    subdivision_name: '结构施工',
                    building_name: '1#楼',
                    region_name: '东区',
                    planned_end_date: '2026-04-08',
                    completed_at: '2026-04-10',
                    status_label: 'on_time',
                    delay_total_days: 2,
                    delay_records: taskDelayRecords,
                  },
                ],
              },
              {
                id: 'group-2',
                name: '里程碑 B',
                status: 'completed',
                planned_end_date: '2026-04-10',
                tasks: [
                  {
                    id: 'task-2',
                    title: '关联任务 2',
                    assignee: '李四',
                    specialty_type: '机电安装',
                    division_name: '主体结构',
                    subdivision_name: '结构施工',
                    building_name: '1#楼',
                    region_name: '东区',
                    planned_end_date: '2026-04-10',
                    completed_at: '2026-04-10',
                    status_label: 'completed',
                    delay_total_days: 0,
                  },
                ],
              },
              {
                id: 'group-3',
                name: '里程碑 C',
                status: 'completed',
                planned_end_date: '2026-04-12',
                tasks: [
                  {
                    id: 'task-3',
                    title: '关联任务 3',
                    assignee: '王五',
                    specialty_type: '幕墙工程',
                    division_name: '围护结构',
                    subdivision_name: '幕墙安装',
                    building_name: '2#楼',
                    region_name: '西区',
                    planned_end_date: currentMonthDate,
                    completed_at: currentMonthDate,
                    status_label: 'completed',
                    delay_total_days: 0,
                  },
                ],
              },
              {
                id: 'group-4',
                name: '里程碑 D',
                status: 'completed',
                planned_end_date: '2026-04-15',
                tasks: [
                  {
                    id: 'task-4',
                    title: '关联任务 4',
                    assignee: '赵六',
                    specialty_type: '土建工程',
                    division_name: '主体结构',
                    subdivision_name: '混凝土工程',
                    building_name: '1#楼',
                    region_name: '东区',
                    planned_end_date: '2026-04-15',
                    completed_at: '2026-04-15',
                    status_label: 'completed',
                    delay_total_days: 0,
                  },
                ],
              },
            ],
            attribution_groups: [
              {
                id: 'division-division-main',
                dimension: 'division',
                dimensionLabel: '分部工程',
                value: '主体结构',
                source: 'wbs',
                sourceId: 'division-main',
                taskIds: ['task-1', 'task-2', 'task-4'],
                taskCount: 3,
                onTimeCount: 2,
                delayedCount: 1,
                recentCompletedAt: '2026-04-15',
                sortOrder: 1,
              },
              {
                id: 'division-division-envelope',
                dimension: 'division',
                dimensionLabel: '分部工程',
                value: '围护结构',
                source: 'wbs',
                sourceId: 'division-envelope',
                taskIds: ['task-3'],
                taskCount: 1,
                onTimeCount: 1,
                delayedCount: 0,
                recentCompletedAt: currentMonthDate,
                sortOrder: 2,
              },
              {
                id: 'subdivision-subdivision-structure',
                dimension: 'subdivision',
                dimensionLabel: '分项工程',
                value: '结构施工',
                source: 'wbs',
                sourceId: 'subdivision-structure',
                taskIds: ['task-1', 'task-2'],
                taskCount: 2,
                onTimeCount: 1,
                delayedCount: 1,
                recentCompletedAt: '2026-04-10',
                sortOrder: 1,
              },
              {
                id: 'specialty-specialty-mep',
                dimension: 'specialty',
                dimensionLabel: '专项工程',
                value: '机电安装',
                source: 'engineering_object',
                sourceId: 'specialty-mep',
                taskIds: ['task-1', 'task-2'],
                taskCount: 2,
                onTimeCount: 1,
                delayedCount: 1,
                recentCompletedAt: '2026-04-10',
                sortOrder: 1,
              },
              {
                id: 'building-building-1',
                dimension: 'building',
                dimensionLabel: '楼栋',
                value: '1#楼',
                source: 'engineering_object',
                sourceId: 'building-1',
                taskIds: ['task-1', 'task-2', 'task-4'],
                taskCount: 3,
                onTimeCount: 2,
                delayedCount: 1,
                recentCompletedAt: '2026-04-15',
                sortOrder: 1,
              },
              {
                id: 'region-east',
                dimension: 'region',
                dimensionLabel: '区域',
                value: '东区',
                source: 'engineering_object',
                sourceId: 'region-east',
                taskIds: ['task-1', 'task-2', 'task-4'],
                taskCount: 3,
                onTimeCount: 2,
                delayedCount: 1,
                recentCompletedAt: '2026-04-15',
                sortOrder: 1,
              },
              {
                id: 'participant_unit-unit-main',
                dimension: 'participant_unit',
                dimensionLabel: '责任单位',
                value: '总包单位',
                source: 'participant_unit',
                sourceId: 'unit-main',
                taskIds: ['task-1'],
                taskCount: 1,
                onTimeCount: 0,
                delayedCount: 1,
                recentCompletedAt: '2026-04-10',
                sortOrder: 1,
              },
              {
                id: 'assignee-user-zhang',
                dimension: 'assignee',
                dimensionLabel: '责任人',
                value: '张三',
                source: 'project_member',
                sourceId: 'user-zhang',
                taskIds: ['task-1'],
                taskCount: 1,
                onTimeCount: 0,
                delayedCount: 1,
                recentCompletedAt: '2026-04-10',
                sortOrder: 1,
              },
            ],
            attribution_totals: {
              division: {
                'division-division-main': {
                  total: 3,
                  completed: 3,
                  on_time: 2,
                  delayed: 1,
                  on_time_rate: 67,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 0,
                  recent_completed_at: '2026-04-15',
                  health_level: 'warning',
                },
                'division-division-envelope': {
                  total: 1,
                  completed: 1,
                  on_time: 1,
                  delayed: 0,
                  on_time_rate: 100,
                  completion_rate: 100,
                  max_delay_days: 0,
                  avg_delay_days: 0,
                  recent_completed_at: currentMonthDate,
                  health_level: 'healthy',
                },
              },
              subdivision: {
                'subdivision-subdivision-structure': {
                  total: 2,
                  completed: 2,
                  on_time: 1,
                  delayed: 1,
                  on_time_rate: 50,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 2,
                  recent_completed_at: '2026-04-10',
                  health_level: 'warning',
                },
              },
              specialty: {
                'specialty-specialty-mep': {
                  total: 2,
                  completed: 2,
                  on_time: 1,
                  delayed: 1,
                  on_time_rate: 50,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 2,
                  recent_completed_at: '2026-04-10',
                  health_level: 'warning',
                },
              },
              building: {
                'building-building-1': {
                  total: 3,
                  completed: 3,
                  on_time: 2,
                  delayed: 1,
                  on_time_rate: 67,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 2,
                  recent_completed_at: '2026-04-15',
                  health_level: 'warning',
                },
              },
              region: {
                'region-east': {
                  total: 3,
                  completed: 3,
                  on_time: 2,
                  delayed: 1,
                  on_time_rate: 67,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 2,
                  recent_completed_at: '2026-04-15',
                  health_level: 'warning',
                },
              },
              participant_unit: {
                'participant_unit-unit-main': {
                  total: 1,
                  completed: 1,
                  on_time: 0,
                  delayed: 1,
                  on_time_rate: 0,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 2,
                  recent_completed_at: '2026-04-10',
                  health_level: 'critical',
                },
              },
              assignee: {
                'assignee-user-zhang': {
                  total: 1,
                  completed: 1,
                  on_time: 0,
                  delayed: 1,
                  on_time_rate: 0,
                  completion_rate: 100,
                  max_delay_days: 2,
                  avg_delay_days: 2,
                  recent_completed_at: '2026-04-10',
                  health_level: 'critical',
                },
              },
            },
            timeline_events: [
              {
                id: 'evt-condition-1',
                kind: 'condition',
                title: '施工图会签完成',
                description: '开工条件由未满足调整为已满足',
                occurredAt: '2026-04-09T08:00:00.000Z',
                taskId: 'task-1',
                statusLabel: 'satisfied',
              },
              {
                id: 'evt-obstacle-1',
                kind: 'obstacle',
                title: '材料滞后解除',
                description: '阻碍由处理中调整为已解决',
                occurredAt: '2026-04-09T10:00:00.000Z',
                taskId: 'task-1',
                statusLabel: 'resolved',
              },
            ],
            timeline_ready: true,
          },
        })
      }

      const trendProjectMatch = url.match(/^\/api\/task-summaries\/projects\/([^/]+)\/task-summary\/trend$/)
      if (trendProjectMatch) {
        return jsonResponse({
          success: true,
          data: [
            { month: previousMonthKey, total: 2, on_time: 1, delayed: 1 },
            { month: currentMonthKey, total: 6, on_time: 5, delayed: 1 },
          ],
        })
      }

      const forecastProjectMatch = url.match(/^\/api\/task-summaries\/projects\/([^/]+)\/duration-forecasts$/)
      if (forecastProjectMatch) {
        const requestedForecastProjectId = decodeURIComponent(forecastProjectMatch[1])
        if (forecastMode === 'error') {
          return jsonErrorResponse(500, {
            success: false,
            error: { code: 'FORECAST_UNAVAILABLE', message: '工期预测读取失败' },
          })
        }
        if (forecastMode === 'pending') {
          return new Promise((resolve) => {
            resolvePendingForecast = () => resolve(jsonResponse(scopedForecastResponse(requestedForecastProjectId)))
          })
        }
        return jsonResponse(scopedForecastResponse(requestedForecastProjectId))
      }

      if (/^\/api\/task-summaries\/projects\/[^/]+\/daily-progress\?date=/.test(url)) {
        return jsonResponse({
          success: true,
          data: null,
        })
      }

      throw new Error(`Unexpected fetch url: ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    fetchMock.mockReset()

    act(() => {
      root?.unmount()
    })
    root = null
    container.remove()
    vi.unstubAllGlobals()
  })

  it('renders task summary KPI cards and the narrative summary list in-page', async () => {
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-page"]')
    await waitForSelector(container, '[data-testid="task-summary-header-actions"]')
    await waitForSelector(container, '[data-testid="task-summary-results-section"]')
    await waitForSelector(container, '[data-testid="task-summary-summary-list-section"]')
    await waitForSelector(container, '[data-testid="task-summary-export"]')
    await waitForSelector(container, '[data-testid="task-summary-scope-forecast-division-division-main"]')

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/task-summaries/projects/${projectId}/task-summary`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/task-summaries/projects/${projectId}/duration-forecasts`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/cause-attributions/projects/${projectId}?subjectType=task&status=confirmed&eventType=delay&causeRole=primary`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(container.textContent).toContain('预计完成')
    expect(container.textContent).toContain('2026-07-20')
    expect(container.textContent).toContain('数据降级')
    expect(container.textContent).toContain('完成任务')
    expect(container.textContent).toContain('按时完成率')
    expect(container.textContent).toContain('延期任务')
    expect(container.textContent).toContain('本月完成')
    expect(container.textContent).toContain('较上月')
    expect(container.textContent).not.toContain('结果摘要')
    expect(container.textContent).not.toContain('总任务数')
    expect(container.textContent).toContain('总结列表')
    expect(container.textContent).not.toContain('完成率 100%')
    expect(container.textContent).toContain('按时率 67 %')
    expect(container.textContent).not.toContain('SUMMARY')
    expect(container.textContent).not.toContain('返回任务管理')
    expect(container.querySelector('input[placeholder="搜索归属、任务、责任人..."]')).toBeTruthy()
    expect(container.querySelector('input[placeholder="搜索归属、任务、责任人..."]')?.className).toContain('h-8')
    expect(container.querySelector('[data-testid="task-summary-attribution-trigger"]')).toBeFalsy()
    expect(container.textContent).toContain('分部工程')
    expect(container.textContent).toContain('分项工程')
    expect(container.textContent).toContain('专项工程')
    expect(container.textContent).toContain('楼栋')
    expect(container.textContent).toContain('区域')
    expect(container.textContent).toContain('责任单位')
    expect(container.textContent).toContain('责任人')
    expect(container.textContent).toContain('主体结构')
    expect(container.textContent).toContain('围护结构')
    expect(container.textContent).toContain('涉及 2 个分部工程')
    expect(container.textContent).toContain('完成任务 4')
    expect(container.textContent).not.toContain('任务 4（完成 4）')
    expect(container.textContent).toContain('按时 3')
    expect(container.textContent).toContain('延期 1')
    expect(container.textContent).toContain('延期时长按归属项逐项展示')
    expect(container.textContent).not.toContain('展开更多')
    expect(container.textContent).not.toContain('关联任务 4')
    expect(container.textContent).not.toContain('查看')
    expect(container.textContent).not.toContain('所属上下文')
    expect(container.textContent).not.toContain('月度兑现')

    const attributionRow = container.querySelector('[data-testid="task-summary-attribution-row-division-division-main"]') as HTMLElement | null
    expect(attributionRow).toBeTruthy()

    await act(async () => {
      attributionRow?.click()
      await flush()
    })

    expect(container.textContent).toContain('归属完成复盘')
    expect(container.textContent).toContain('分部工程 · 主体结构')
    expect(container.textContent).toContain('归属完成过程')
    expect(container.textContent).toContain('开工条件形成')
    expect(container.textContent).toContain('阻碍演变')
    expect(container.textContent).toContain('完成收口')
    expect(container.textContent).toContain('所含任务明细台账')
    expect(container.textContent).toContain('P20 / P50 / P80')
    expect(container.textContent).toContain('2026-07-17 / 2026-07-20 / 2026-07-24')
    expect(container.textContent).toContain('预测覆盖')
    expect(container.textContent).toContain('关联任务 1')
    expect(container.textContent).toContain('关联任务 2')
    expect(container.textContent).toContain('关联任务 4')

    const taskRow = container.querySelector('[data-testid="task-summary-row-task-1"]') as HTMLTableRowElement | null
    expect(taskRow).toBeTruthy()
    expect(taskRow?.textContent).not.toContain('延期 2 天')
    expect(taskRow?.textContent).not.toContain('延期 2 个生产日')

    await act(async () => {
      taskRow?.click()
      await flush()
    })

    expect(container.textContent).toContain('完成结果')
    expect(container.textContent).toContain('变化摘要')
    expect(container.textContent).toContain('完成过程')
    expect(container.textContent).toContain('过程结论')
    expect(container.textContent).toContain('延期 2 个生产日')
    expect(container.textContent).toContain('开工条件')
    expect(container.textContent).toContain('阻碍处理')
    expect(container.textContent).toContain('并行')
    expect(container.textContent).toContain('延期说明')
    expect(container.textContent).toContain('satisfied')
    expect(container.textContent).toContain('resolved')

    expect(container.textContent).toContain('专项工程')

    const subdivisionTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((tab) => tab.textContent?.includes('分项工程'))
    expect(subdivisionTab).toBeTruthy()
    await act(async () => {
      subdivisionTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      await flush()
    })
    expect(container.textContent).toContain('2026-07-18')
    expect(container.textContent).toContain('数据就绪')

    const specialtyTab = Array.from(container.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find((tab) => tab.textContent?.includes('专项工程'))
    expect(specialtyTab).toBeTruthy()
    await act(async () => {
      specialtyTab?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
      await flush()
    })
    expect(container.textContent).toContain('数据不足')
  })

  it('keeps completion summaries usable while scoped forecasts are still loading', async () => {
    forecastMode = 'pending'
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-page"]')
    await waitForSelector(container, '[data-testid="task-summary-forecast-loading"]')
    expect(container.textContent).toContain('完成任务')
    expect(container.querySelector('[data-testid="task-summary-attribution-row-division-division-main"]')).toBeTruthy()

    await act(async () => {
      resolvePendingForecast?.()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-scope-forecast-division-division-main"]')
  })

  it('renders scoped forecasts when the completed-task summary is empty', async () => {
    summaryMode = 'empty'
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-page"]')
    await waitForSelector(container, '[data-testid="task-summary-scope-forecast-division-division-main"]')
    expect(container.textContent).toContain('2026-07-20')
    const forecastOnlyRow = container.querySelector('[data-testid="task-summary-attribution-row-division-division-main"]')
    expect(forecastOnlyRow?.textContent).toContain('0/3')
    expect(forecastOnlyRow?.textContent).not.toContain('0/0')
    expect(forecastOnlyRow?.textContent).toContain('尚无完成任务')
    expect(forecastOnlyRow?.textContent).not.toContain('全部按时完成')
  })

  it('isolates forecast failures and retries without clearing completion data', async () => {
    forecastMode = 'error'
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-page"]')
    await waitForSelector(container, '[data-testid="task-summary-forecast-error"]')
    expect(container.textContent).toContain('完成任务')
    expect(container.textContent).toContain('工期预测暂不可用')
    expect(container.querySelector('[data-testid="task-summary-attribution-row-division-division-main"]')).toBeTruthy()

    forecastMode = 'success'
    const retry = container.querySelector('[data-testid="task-summary-forecast-retry"]') as HTMLButtonElement | null
    await act(async () => {
      retry?.click()
      await flush()
    })

    await waitForSelector(container, '[data-testid="task-summary-scope-forecast-division-division-main"]')
    const forecastCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/duration-forecasts'))
    expect(forecastCalls).toHaveLength(2)
  })

  it('keeps raw delay text visible while showing the confirmed canonical label after task confirmation', async () => {
    const user = userEvent.setup()
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1-detail"]')

    const openConfirmation = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('确认延误原因'))
    expect(openConfirmation).toBeTruthy()
    await act(async () => {
      openConfirmation?.click()
      await flush()
    })

    const categorySelect = document.querySelector<HTMLElement>('[aria-label="延误原因分类"]')
    expect(categorySelect).toBeTruthy()
    if (categorySelect) await user.click(categorySelect)
    await waitForSelector(document.body, '[role="option"]')
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((item) => item.textContent?.includes('Material shortage or late arrival'))
    expect(option).toBeTruthy()
    if (option) await user.click(option)
    const confirmCause = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('确认原因'))
    expect(confirmCause).toBeTruthy()
    if (confirmCause) await user.click(confirmCause)
    await waitForSelector(container, '[data-testid="task-cause-confirmed-label-task-1"]')

    expect(container.textContent).toContain('Material shortage or late arrival')
    expect(container.textContent).toContain('材料到场延后')
    const confirmRequest = fetchMock.mock.calls.find(([url, init]) => (
      String(url).endsWith('/subjects/task/task-1/confirm') && init?.method === 'POST'
    ))
    expect(confirmRequest).toBeTruthy()
    expect(JSON.parse(String(confirmRequest?.[1]?.body))).toEqual(expect.objectContaining({
      rawText: '材料到场延后',
    }))
  })

  it('shows the delayed placeholder without exposing confirmation when no real reason exists', async () => {
    taskDelayRecords = [{
      delay_days: 1,
      reason: '   ',
      recorded_at: '2026-04-08',
    }, {
      delay_days: 1,
      recorded_at: '2026-04-09',
    }]

    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1-detail"]')

    expect(container.textContent).toContain('延期原因待补齐')
    expect(container.querySelector('[data-testid="task-cause-surface-loading-task-1"]')).toBeNull()
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('确认延误原因'))).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(fetchMock.mock.calls.filter(([url, init]) => (
      String(url).endsWith('/subjects/task/task-1/confirm') && init?.method === 'POST'
    ))).toHaveLength(0)
  })

  it('does not expose a confirmation command to read-only users while retaining the confirmed label', async () => {
    permissionState.canEdit = false
    confirmedTaskCauses['project-1'] = [{
      id: 'cause-new',
      subject_id: 'task-1',
      cause_code: 'material_shortage',
      cause_role: 'primary',
      event_type: 'delay',
      status: 'confirmed',
      raw_text: '材料到场延后',
      created_at: '2026-07-23T02:00:00.000Z',
    }, {
      id: 'cause-old',
      subject_id: 'task-1',
      cause_code: 'weather_impact',
      cause_role: 'primary',
      event_type: 'delay',
      status: 'confirmed',
      raw_text: '旧原因',
      created_at: '2026-07-22T02:00:00.000Z',
    }]
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1-detail"]')

    await waitForSelector(container, '[data-testid="task-cause-confirmed-label-task-1"]')
    expect(container.textContent).toContain('材料到场延后')
    expect(container.textContent).toContain('Material shortage or late arrival')
    expect(container.textContent).not.toContain('Weather impact')
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('确认延误原因'))).toBe(false)
  })

  it('fails closed while the confirmed-cause authority is loading', async () => {
    causeListModes['project-1'] = 'pending'
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
      await flush()
    })

    await waitForSelector(container, '[data-testid="task-cause-surface-loading-task-1"]')
    expect(container.textContent).toContain('延误原因确认状态加载中')
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('确认延误原因'))).toBe(false)
  })

  it('fails closed and shows an unavailable state when the cause authority errors', async () => {
    causeListModes['project-1'] = 'error'
    act(() => {
      root?.render(
        <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
          <Routes>
            <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
      await flush()
    })

    await waitForSelector(container, '[data-testid="task-cause-surface-error-task-1"]')
    expect(container.textContent).toContain('延误原因确认暂不可用')
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.includes('确认延误原因'))).toBe(false)
  })

  it('aborts a stale project request, closes its dialog, and ignores its late response', async () => {
    const renderProject = (nextProjectId: string) => {
      act(() => {
        root?.render(
          <MemoryRouter initialEntries={[`/projects/${projectId}/task-summary`]}>
            <Routes location={`/projects/${nextProjectId}/task-summary`}>
              <Route path="/projects/:id/task-summary" element={<TaskSummary />} />
            </Routes>
          </MemoryRouter>,
        )
      })
    }

    renderProject('project-1')
    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
      await flush()
    })
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
      await flush()
    })
    const openConfirmation = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('确认延误原因'))
    await act(async () => {
      openConfirmation?.click()
      await flush()
    })
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()

    causeListModes['project-1'] = 'pending'
    clearApiClientRuntimeCache()
    const refresh = container.querySelector<HTMLButtonElement>('[data-testid="task-summary-header-actions"] button')
    expect(refresh).toBeTruthy()
    await act(async () => {
      refresh?.click()
      await flush()
    })
    expect(pendingCauseRequests).toHaveLength(1)

    confirmedTaskCauses['project-2'] = [{
      id: 'cause-project-2',
      subject_id: 'task-1',
      cause_code: 'material_shortage',
      cause_role: 'primary',
      event_type: 'delay',
      status: 'confirmed',
      raw_text: 'project-2 raw',
      created_at: '2026-07-23T03:00:00.000Z',
    }]
    causeListModes['project-2'] = 'success'
    renderProject('project-2')

    await waitForSelector(container, '[data-testid="task-summary-page"]')
    await waitForSelector(container, '[data-testid="task-summary-attribution-row-division-division-main"]')
    if (!container.querySelector('[data-testid="task-summary-row-task-1"]')) {
      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="task-summary-attribution-row-division-division-main"]')?.click()
        await flush()
      })
    }
    await waitForSelector(container, '[data-testid="task-summary-row-task-1"]')
    if (!container.querySelector('[data-testid="task-summary-row-task-1-detail"]')) {
      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="task-summary-row-task-1"]')?.click()
        await flush()
      })
    }
    await waitForSelector(container, '[data-testid="task-cause-confirmed-label-task-1"]')
    expect(document.querySelector('[role="dialog"]')).toBeFalsy()
    expect(pendingCauseRequests[0].signal?.aborted).toBe(true)
    expect(container.textContent).toContain('Material shortage or late arrival')

    await act(async () => {
      pendingCauseRequests[0].resolve(jsonResponse({
        success: true,
        data: [{
          id: 'cause-stale-project-1',
          subject_id: 'task-1',
          cause_code: 'weather_impact',
          cause_role: 'primary',
          event_type: 'delay',
          status: 'confirmed',
          created_at: '2026-07-23T04:00:00.000Z',
        }],
      }))
      await flush()
    })

    expect(container.textContent).toContain('Material shortage or late arrival')
    expect(container.textContent).not.toContain('Weather impact')
  })
})
