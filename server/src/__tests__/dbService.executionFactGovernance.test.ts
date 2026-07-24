import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.DB_CONNECTION_STRING = 'postgresql://runtime-user:runtime-password@127.0.0.1:5432/workbuddy'
delete process.env.SUPABASE_RUNTIME_KEY

const state = vi.hoisted(() => {
  let transactionActive = false
  let risk: Record<string, any> | null = null
  let issue: Record<string, any> | null = null
  const transactionEvents: string[] = []
  const postCommitEffects: Array<() => Promise<void>> = []

  const applyUpdate = (row: Record<string, any>, sql: string, params: unknown[]) => {
    const setClause = sql.match(/set\s+(.+?)\s+where/is)?.[1] ?? ''
    const columns = [...setClause.matchAll(/([a-z_]+)\s*=\s*\$\d+/gi)].map((match) => match[1])
    columns.forEach((column, index) => {
      row[column] = params[index]
    })
  }

  const rawQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized.includes('create_issue_from_risk_atomic')) {
      if (!risk) return { rows: [{ result: null }], rowCount: 1 }
      if (!issue) {
        issue = {
          id: '22222222-2222-4222-8222-222222222222',
          project_id: risk.project_id,
          task_id: risk.task_id ?? null,
          title: String(params[2] ?? risk.title),
          source_type: String(params[1] ?? 'risk_converted'),
          source_entity_type: 'risk',
          source_entity_id: risk.id,
          severity: String(params[4] ?? 'medium'),
          priority: Number(params[5] ?? 30),
          status: 'open',
          version: 1,
          created_at: '2026-07-24T00:00:00.000Z',
          updated_at: '2026-07-24T00:00:00.000Z',
        }
      }
      risk = {
        ...risk,
        linked_issue_id: issue.id,
        status: 'closed',
        closed_reason: 'converted_to_issue',
        closed_at: '2026-07-24T00:00:00.000Z',
        updated_at: '2026-07-24T00:00:00.000Z',
      }
      return { rows: [{ result: issue.id }], rowCount: 1 }
    }
    if (normalized.startsWith('insert into risks')) {
      risk = {
        id: params[0], project_id: params[1], task_id: params[2], title: params[3],
        status: params[6], closure_result_code: params[24], closure_result_summary: params[25],
        closure_effectiveness: params[26], closure_evidence_refs: params[27],
        closure_cause_attribution_id: params[28], closed_by: params[29],
        closure_recorded_at: params[30], version: params[31], created_at: params[32], updated_at: params[33],
      }
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('insert into issues')) {
      issue = {
        id: params[0], project_id: params[1], task_id: params[2], title: params[3],
        source_type: params[5], severity: params[10], priority: params[11],
        status: params[13], closure_result_code: params[16], closure_result_summary: params[17],
        closure_effectiveness: params[18], closure_evidence_refs: params[19],
        closure_cause_attribution_id: params[20], closed_by: params[21],
        closure_recorded_at: params[22], version: params[23], created_at: params[24], updated_at: params[25],
      }
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('update risks set') && risk) {
      applyUpdate(risk, sql, params)
      return { rows: [{ id: risk.id }], rowCount: 1 }
    }
    if (normalized.startsWith('update issues set') && issue) {
      applyUpdate(issue, sql, params)
      return { rows: [{ id: issue.id }], rowCount: 1 }
    }
    if (normalized.startsWith('select * from risks') && String(params[0]) === String(risk?.id)) {
      return { rows: risk ? [{ ...risk }] : [], rowCount: risk ? 1 : 0 }
    }
    if (normalized.startsWith('select * from issues') && String(params[0]) === String(issue?.id)) {
      return { rows: issue ? [{ ...issue }] : [], rowCount: issue ? 1 : 0 }
    }
    if (normalized.includes('from issues') && normalized.includes('source_entity_type') && risk) {
      return { rows: issue ? [{ ...issue }] : [], rowCount: issue ? 1 : 0 }
    }
    if (normalized.includes('from change_logs')) return { rows: [], rowCount: 0 }
    return { rows: [], rowCount: 0 }
  })

  const withDatabaseTransaction = vi.fn(async <T>(work: () => Promise<T>) => {
    const parentActive = transactionActive
    if (!parentActive) transactionEvents.push('BEGIN')
    transactionActive = true
    try {
      const result = await work()
      if (!parentActive) {
        transactionEvents.push('COMMIT')
        const effects = postCommitEffects.splice(0, postCommitEffects.length)
        for (const effect of effects) await effect()
      }
      return result
    } catch (error) {
      if (!parentActive) {
        transactionEvents.push('ROLLBACK')
        postCommitEffects.splice(0, postCommitEffects.length)
      }
      throw error
    } finally {
      transactionActive = parentActive
    }
  })

  const recordChangedExecutionFacts = vi.fn(async () => {
    transactionEvents.push('FACTS')
    return []
  })

  const from = vi.fn((table: string) => {
    if (table === 'issues') {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          issue = { ...row }
          return { error: null }
        }),
      }
    }
    if (table === 'risks') {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          if (risk) Object.assign(risk, patch)
          const builder: any = {
            eq: vi.fn(() => builder),
            select: vi.fn(async () => ({ data: risk ? [{ id: risk.id }] : [], error: null })),
            then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
          }
          return builder
        }),
      }
    }
    throw new Error(`unexpected Supabase table ${table}`)
  })

  return {
    from,
    rawQuery,
    recordChangedExecutionFacts,
    transactionEvents,
    withDatabaseTransaction,
    isDatabaseTransactionActive: () => transactionActive,
    registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => {
      if (transactionActive) postCommitEffects.push(effect)
      else await effect()
    }),
    setRisk: (value: Record<string, any> | null) => { risk = value },
    setIssue: (value: Record<string, any> | null) => { issue = value },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: state.from, rpc: vi.fn() })),
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
  withDatabaseTransaction: state.withDatabaseTransaction,
  isDatabaseTransactionActive: state.isDatabaseTransactionActive,
  registerDatabasePostCommitEffect: state.registerDatabasePostCommitEffect,
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: state.recordChangedExecutionFacts,
}))

const {
  createIssue,
  createRisk,
  updateIssue,
  updateRisk,
} = await import('../services/dbService.js')

const structuredClosure = {
  status: 'closed',
  closure_result_code: 'resolved',
  closure_result_summary: 'Verified corrective work.',
  closure_effectiveness: 'resolved',
  closure_evidence_refs: ['inspection:1'],
  closure_cause_attribution_id: null,
  closed_by: '11111111-1111-4111-8111-111111111111',
  closure_recorded_at: '2026-07-24T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  state.transactionEvents.splice(0, state.transactionEvents.length)
  state.setRisk(null)
  state.setIssue(null)
  state.recordChangedExecutionFacts.mockImplementation(async () => {
    state.transactionEvents.push('FACTS')
    return []
  })
})

describe('risk and issue execution fact governance', () => {
  it('records a forced initial risk status before the create transaction commits', async () => {
    const created = await createRisk({
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Initial risk',
      status: 'identified',
      source_type: 'manual',
    } as any)

    expect(created.status).toBe('identified')
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'risk',
        entityId: created.id,
        sourceMutationId: `risk:${created.id}:version:1`,
        changes: [expect.objectContaining({ factType: 'risk.status', nextValue: 'identified', force: true })],
      }),
    )
    expect(state.transactionEvents).toEqual(['BEGIN', 'FACTS', 'COMMIT'])
  })

  it('records risk status and structured closure in the same update transaction', async () => {
    state.setRisk({
      id: '11111111-1111-4111-8111-111111111112',
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Closable risk', status: 'mitigating', pending_manual_close: false,
      version: 2, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
    })

    await updateRisk('11111111-1111-4111-8111-111111111112', structuredClosure as any, 2)

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'risk',
      sourceMutationId: 'risk:11111111-1111-4111-8111-111111111112:version:3',
      changes: expect.arrayContaining([
        expect.objectContaining({ factType: 'risk.status', previousValue: 'mitigating', nextValue: 'closed' }),
        expect.objectContaining({
          factType: 'risk.closure',
          nextValue: expect.objectContaining({ resultCode: 'resolved', resultSummary: 'Verified corrective work.' }),
        }),
      ]),
    }))
    expect(state.transactionEvents).toEqual(['BEGIN', 'FACTS', 'COMMIT'])
  })

  it('records a forced initial issue status before the create transaction commits', async () => {
    const created = await createIssue({
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Initial issue', status: 'open', source_type: 'manual', severity: 'medium',
    } as any)

    expect(created.status).toBe('open')
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'issue',
      entityId: created.id,
      sourceMutationId: `issue:${created.id}:version:1`,
      changes: [expect.objectContaining({ factType: 'issue.status', nextValue: 'open', force: true })],
    }))
    expect(state.transactionEvents).toEqual(['BEGIN', 'FACTS', 'COMMIT'])
  })

  it('records issue status and structured closure in the same update transaction', async () => {
    state.setIssue({
      id: '22222222-2222-4222-8222-222222222223',
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Closable issue', source_type: 'manual', severity: 'medium', priority: 30,
      status: 'resolved', pending_manual_close: false, version: 4,
      created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
    })

    await updateIssue('22222222-2222-4222-8222-222222222223', structuredClosure as any, 4)

    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'issue',
      sourceMutationId: 'issue:22222222-2222-4222-8222-222222222223:version:5',
      changes: expect.arrayContaining([
        expect.objectContaining({ factType: 'issue.status', previousValue: 'resolved', nextValue: 'closed' }),
        expect.objectContaining({ factType: 'issue.closure', nextValue: expect.objectContaining({ resultCode: 'resolved' }) }),
      ]),
    }))
    expect(state.transactionEvents).toEqual(['BEGIN', 'FACTS', 'COMMIT'])
  })

  it('records both sides of a risk-to-issue conversion before its transaction commits', async () => {
    state.setRisk({
      id: '11111111-1111-4111-8111-111111111113',
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Escalated risk', status: 'mitigating', pending_manual_close: false,
      version: 2, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
    })

    const created = await createIssue({
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Converted issue', status: 'open', source_type: 'risk_converted',
      source_entity_type: 'risk', source_entity_id: '11111111-1111-4111-8111-111111111113',
      severity: 'medium',
    } as any)

    expect(created.status).toBe('open')
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledTimes(2)
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'issue',
      changes: [expect.objectContaining({ factType: 'issue.status', force: true })],
    }))
    expect(state.recordChangedExecutionFacts).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'risk',
      sourceMutationId: `risk:11111111-1111-4111-8111-111111111113:conversion:${created.id}`,
      changes: expect.arrayContaining([
        expect.objectContaining({ factType: 'risk.status', nextValue: 'closed' }),
        expect.objectContaining({ factType: 'risk.closure' }),
      ]),
    }))
    expect(state.transactionEvents).toEqual(['BEGIN', 'FACTS', 'FACTS', 'COMMIT'])
  })

  it('rolls back the projection when execution fact persistence rejects', async () => {
    state.setIssue({
      id: '22222222-2222-4222-8222-222222222224',
      project_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Mutable issue', source_type: 'manual', severity: 'medium', priority: 30,
      status: 'open', pending_manual_close: false, version: 1,
      created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
    })
    state.recordChangedExecutionFacts.mockRejectedValueOnce(new Error('execution fact persistence failed'))

    await expect(updateIssue(
      '22222222-2222-4222-8222-222222222224',
      { status: 'investigating' },
      1,
    )).rejects.toThrow('execution fact persistence failed')

    expect(state.transactionEvents).toEqual(['BEGIN', 'ROLLBACK'])
  })
})
