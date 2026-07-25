import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

const state = vi.hoisted(() => {
  const acceptancePlans: Array<Record<string, unknown>> = []
  const projectEntityLinks: Array<Record<string, unknown>> = []
  const issues: Array<Record<string, unknown>> = []
  const risks: Array<Record<string, unknown>> = []
  const selectCalls: string[] = []
  const createIssue = vi.fn(async (input: Record<string, unknown>) => {
    const created = {
      id: `issue-${issues.length + 1}`,
      created_at: '2026-04-17T00:00:00.000Z',
      updated_at: '2026-04-17T00:00:00.000Z',
      ...input,
    }
    issues.push(created)
    return created
  })
  const getRisk = vi.fn(async (riskId: string) => risks.find((risk) => risk.id === riskId) ?? null)
  const getIssue = vi.fn(async (issueId: string) => issues.find((issue) => issue.id === issueId) ?? null)
  const rpc = vi.fn(async () => {
    const created = {
      id: `rpc-issue-${issues.length + 1}`,
      project_id: 'project-1',
      source_type: 'risk_converted',
      source_entity_type: 'risk',
      source_entity_id: 'risk-1',
      status: 'open',
    }
    issues.push(created)
    return { data: created.id, error: null }
  })

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
      single: vi.fn(async () => {
        const source = table === 'acceptance_plans'
          ? acceptancePlans
          : table === 'project_entity_links'
            ? projectEntityLinks
            : issues
        const row = source.find((candidate) => filters.every((filter) => filter(candidate)))
        return row
          ? { data: row, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'not found' } }
      }),
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => {
        const source = table === 'acceptance_plans'
          ? acceptancePlans
          : table === 'project_entity_links'
            ? projectEntityLinks
            : issues
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
    projectEntityLinks,
    issues,
    risks,
    selectCalls,
    createIssue,
    getIssue,
    getRisk,
    supabase: {
      from: vi.fn((table: string) => buildQuery(table)),
      rpc,
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  createIssue: state.createIssue,
  getIssue: state.getIssue,
  getRisk: state.getRisk,
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

import { convertRiskToIssueAtomic, syncAcceptanceExpiredIssues } from '../services/upgradeChainService.js'

describe('upgradeChainService acceptance expired sync', () => {
  beforeEach(() => {
    state.acceptancePlans.splice(0, state.acceptancePlans.length)
    state.projectEntityLinks.splice(0, state.projectEntityLinks.length)
    state.issues.splice(0, state.issues.length)
    state.risks.splice(0, state.risks.length)
    state.selectCalls.splice(0, state.selectCalls.length)
    vi.clearAllMocks()
  })

  it('creates issue records for overdue acceptance plans using acceptance_plan soft links', async () => {
    state.acceptancePlans.push({
      id: 'plan-1',
      project_id: 'project-1',
      acceptance_name: '消防专项验收',
      acceptance_type: '消防验收',
      planned_date: '2026-04-10',
      status: 'submitted',
    })
    state.projectEntityLinks.push({
      project_id: 'project-1',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'plan-1',
      target_entity_type: 'task',
      target_entity_id: 'task-1',
      relation_type: 'covers_task',
      status: 'active',
    })

    const created = await syncAcceptanceExpiredIssues('project-1')

    expect(created).toHaveLength(1)
    expect(state.createIssue).toHaveBeenCalledTimes(1)
    expect(state.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      title: '验收已逾期：消防专项验收',
      source_type: 'condition_expired',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'plan-1',
      status: 'open',
    }))
    expect(state.selectCalls.some((columns) => columns.includes('plan_name'))).toBe(false)
  })

  it('routes risk conversion through the execution-fact governed issue write chain', async () => {
    state.risks.push({
      id: 'risk-1',
      project_id: 'project-1',
      task_id: 'task-1',
      title: 'Escalated risk',
      description: 'Escalated risk details',
      level: 'high',
      chain_id: 'chain-1',
      created_at: '2026-04-10T00:00:00.000Z',
    })

    const created = await convertRiskToIssueAtomic('risk-1', 'risk_converted')

    expect(created).toMatchObject({
      project_id: 'project-1',
      source_type: 'risk_converted',
      source_entity_type: 'risk',
      source_entity_id: 'risk-1',
      status: 'open',
    })
    expect(state.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      source_entity_id: 'risk-1',
    }))
    expect(state.supabase.rpc).not.toHaveBeenCalled()
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
