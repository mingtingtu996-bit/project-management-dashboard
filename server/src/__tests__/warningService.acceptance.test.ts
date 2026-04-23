import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

const state = vi.hoisted(() => {
  const acceptancePlans: Array<Record<string, unknown>> = []
  const selectCalls: string[] = []

  function buildQuery(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []

    const query = {
      select: vi.fn((columns?: string) => {
        if (table === 'acceptance_plans' && typeof columns === 'string') {
          selectCalls.push(columns)
        }
        return query
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') === String(value ?? ''))
        return query
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        const normalized = values.map((value) => String(value ?? ''))
        filters.push((row) => normalized.includes(String(row[column] ?? '')))
        return query
      }),
      gt: vi.fn(() => query),
      lt: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => {
        const rows = table === 'acceptance_plans'
          ? acceptancePlans.filter((row) => filters.every((filter) => filter(row)))
          : []
        return Promise.resolve(resolve({ data: rows, error: null }))
      },
    }

    return query
  }

  return {
    acceptancePlans,
    selectCalls,
    supabase: {
      from: vi.fn((table: string) => buildQuery(table)),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: state.supabase,
}))

vi.mock('../services/changeLogs.js', () => ({
  writeLog: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/upgradeChainService.js', () => ({
  acknowledgeWarningNotification: vi.fn(),
  syncAcceptanceExpiredIssues: vi.fn(async () => []),
  autoEscalateRisksToIssues: vi.fn(async () => []),
  autoEscalateWarnings: vi.fn(async () => []),
  confirmWarningAsRisk: vi.fn(),
  ensureObstacleEscalatedIssue: vi.fn(),
  markObstacleEscalatedIssuePendingManualClose: vi.fn(),
  muteWarningNotification: vi.fn(),
  syncConditionExpiredIssues: vi.fn(async () => []),
  syncWarningNotifications: vi.fn(async (warnings: any) => warnings),
}))

let WarningService: typeof import('../services/warningService.js').WarningService

beforeAll(async () => {
  ;({ WarningService } = await import('../services/warningService.js'))
})

describe('warningService acceptance warning scan', () => {
  beforeEach(() => {
    state.acceptancePlans.splice(0, state.acceptancePlans.length)
    state.selectCalls.splice(0, state.selectCalls.length)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-17T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('includes overdue and rectifying plans under the new acceptance status model', async () => {
    state.acceptancePlans.push(
      {
        id: 'plan-overdue',
        project_id: 'project-1',
        task_id: 'task-1',
        acceptance_name: '综合验收',
        acceptance_type: '综合验收',
        planned_date: '2026-04-10',
        status: 'submitted',
      },
      {
        id: 'plan-rectification',
        project_id: 'project-1',
        task_id: 'task-2',
        acceptance_name: '消防复验',
        acceptance_type: '消防验收',
        planned_date: '2026-04-18',
        status: 'rectifying',
      },
      {
        id: 'plan-complete',
        project_id: 'project-1',
        task_id: 'task-3',
        acceptance_name: '已备案验收',
        acceptance_type: '综合验收',
        planned_date: '2026-04-05',
        status: 'archived',
      },
    )

    const service = new WarningService()
    const warnings = await service.scanAcceptanceWarnings('project-1')

    expect(warnings).toHaveLength(2)
    expect(warnings.map((item) => item.title)).toEqual(
      expect.arrayContaining(['验收已逾期', '验收整改待处理']),
    )
    expect(warnings.map((item) => item.task_id)).toEqual(
      expect.arrayContaining(['task-1', 'task-2']),
    )
    expect(state.selectCalls.some((columns) => columns.includes('plan_name'))).toBe(false)
  })
})
