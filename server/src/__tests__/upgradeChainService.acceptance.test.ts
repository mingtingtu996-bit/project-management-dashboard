import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

const state = vi.hoisted(() => {
  const acceptancePlans: Array<Record<string, unknown>> = []
  const issues: Array<Record<string, unknown>> = []
  const selectCalls: string[] = []
  const createIssue = vi.fn(async (input: Record<string, unknown>) => ({
    id: `issue-${issues.length + 1}`,
    created_at: '2026-04-17T00:00:00.000Z',
    updated_at: '2026-04-17T00:00:00.000Z',
    ...input,
  }))

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
      lt: vi.fn((column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? '') < String(value ?? ''))
        return query
      }),
      order: vi.fn(() => query),
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => {
        const source = table === 'acceptance_plans' ? acceptancePlans : issues
        return Promise.resolve(resolve({
          data: source.filter((row) => filters.every((filter) => filter(row))),
          error: null,
        }))
      },
    }

    return query
  }

  return {
    acceptancePlans,
    issues,
    selectCalls,
    createIssue,
    supabase: {
      from: vi.fn((table: string) => buildQuery(table)),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  createIssue: state.createIssue,
  getIssue: vi.fn(),
  getRisk: vi.fn(),
  supabase: state.supabase,
  updateIssue: vi.fn(),
  updateRisk: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { syncAcceptanceExpiredIssues } from '../services/upgradeChainService.js'

describe('upgradeChainService acceptance expired sync', () => {
  beforeEach(() => {
    state.acceptancePlans.splice(0, state.acceptancePlans.length)
    state.issues.splice(0, state.issues.length)
    state.selectCalls.splice(0, state.selectCalls.length)
    vi.clearAllMocks()
  })

  it('creates issue records for overdue acceptance plans using acceptance_plan soft links', async () => {
    state.acceptancePlans.push({
      id: 'plan-1',
      project_id: 'project-1',
      task_id: 'task-1',
      acceptance_name: '消防专项验收',
      acceptance_type: '消防验收',
      planned_date: '2026-04-10',
      status: 'submitted',
    })

    const created = await syncAcceptanceExpiredIssues('project-1')

    expect(created).toHaveLength(1)
    expect(state.createIssue).toHaveBeenCalledTimes(1)
    expect(state.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      task_id: 'task-1',
      title: '验收已逾期：消防专项验收',
      source_type: 'condition_expired',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'plan-1',
      status: 'open',
    }))
    expect(state.selectCalls.some((columns) => columns.includes('plan_name'))).toBe(false)
  })

  it('skips plans that already have an open acceptance-linked issue', async () => {
    state.acceptancePlans.push({
      id: 'plan-1',
      project_id: 'project-1',
      task_id: 'task-1',
      acceptance_name: '消防专项验收',
      acceptance_type: '消防验收',
      planned_date: '2026-04-10',
      status: 'rectification',
    })
    state.issues.push({
      id: 'issue-existing',
      project_id: 'project-1',
      status: 'open',
      source_type: 'condition_expired',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'plan-1',
    })

    const created = await syncAcceptanceExpiredIssues('project-1')

    expect(created).toHaveLength(0)
    expect(state.createIssue).not.toHaveBeenCalled()
  })
})
