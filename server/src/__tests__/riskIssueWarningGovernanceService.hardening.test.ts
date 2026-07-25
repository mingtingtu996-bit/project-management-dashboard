import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const emit = vi.fn(async (_payload: Record<string, unknown>) => undefined)
  const createIssue = vi.fn(async (input: Record<string, unknown>) => ({ id: 'issue-from-condition', ...input }))
  const confirmWarningAsRiskOnChain = vi.fn(async () => ({ id: 'risk-from-chain' }))
  const convertRiskToIssueAtomic = vi.fn(async () => ({ id: 'issue-from-chain' }))
  const updateRows: Array<Record<string, unknown>> = []
  const queryLog: Array<{ table: string; method: string; args: unknown[] }> = []

  function makeQuery(table: string) {
    const query: Record<string, any> = {
      select: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'select', args })
        return query
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        queryLog.push({ table, method: 'update', args: [patch] })
        updateRows.push({ table, patch })
        return query
      }),
      insert: vi.fn((row: Record<string, unknown>) => {
        queryLog.push({ table, method: 'insert', args: [row] })
        return query
      }),
      eq: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'eq', args })
        return query
      }),
      in: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'in', args })
        return query
      }),
      is: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'is', args })
        return query
      }),
      lt: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'lt', args })
        return query
      }),
      match: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'match', args })
        return query
      }),
      limit: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'limit', args })
        return query
      }),
      or: vi.fn((...args: unknown[]) => {
        queryLog.push({ table, method: 'or', args })
        return query
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: null, error: null })),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
      catch: vi.fn(async () => undefined),
    }
    return query
  }

  return {
    emit,
    createIssue,
    confirmWarningAsRiskOnChain,
    convertRiskToIssueAtomic,
    updateRows,
    queryLog,
    from: vi.fn((table: string) => makeQuery(table)),
  }
})

vi.mock('../services/dbService.js', () => ({
  createIssue: mocks.createIssue,
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../services/notificationTouchpointService.js', () => ({
  notificationTouchpointService: {
    emit: mocks.emit,
  },
}))

vi.mock('../services/upgradeChainService.js', () => ({
  confirmWarningAsRisk: mocks.confirmWarningAsRiskOnChain,
  convertRiskToIssueAtomic: mocks.convertRiskToIssueAtomic,
}))

import {
  confirmWarningAsRisk,
  convertRiskToIssue,
  ensureIssueFromExpiredAcceptance,
  ensureIssueFromExpiredCondition,
  markSourceResolved,
  syncBusinessWarnings,
  upsertWarningsFromGovernanceSignals,
} from '../services/riskIssueWarningGovernanceService.js'

beforeEach(() => {
  mocks.emit.mockClear()
  mocks.createIssue.mockClear()
  mocks.confirmWarningAsRiskOnChain.mockClear()
  mocks.convertRiskToIssueAtomic.mockClear()
  mocks.updateRows.splice(0, mocks.updateRows.length)
  mocks.queryLog.splice(0, mocks.queryLog.length)
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => {
    const query: Record<string, any> = {
      select: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'select', args })
        return query
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        mocks.queryLog.push({ table, method: 'update', args: [patch] })
        mocks.updateRows.push({ table, patch })
        return query
      }),
      insert: vi.fn((row: Record<string, unknown>) => {
        mocks.queryLog.push({ table, method: 'insert', args: [row] })
        return query
      }),
      eq: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'eq', args })
        return query
      }),
      in: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'in', args })
        return query
      }),
      is: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'is', args })
        return query
      }),
      lt: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'lt', args })
        return query
      }),
      match: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'match', args })
        return query
      }),
      limit: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'limit', args })
        return query
      }),
      or: vi.fn((...args: unknown[]) => {
        mocks.queryLog.push({ table, method: 'or', args })
        return query
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({ data: null, error: null })),
      then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
      catch: vi.fn(async () => undefined),
    }
    return query
  })
})

describe('risk/issue/warning governance service hardening', () => {
  it('creates an expired-condition issue through the execution-fact governed write chain', async () => {
    await expect(ensureIssueFromExpiredCondition({
      id: 'condition-1',
      project_id: 'project-1',
      task_id: 'task-1',
      name: 'Site handover',
      description: 'The site handover condition expired.',
    })).resolves.toBe('issue-from-condition')

    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      task_id: 'task-1',
      source_type: 'condition_expired',
      source_entity_type: 'task_condition',
      source_entity_id: 'condition-1',
      status: 'open',
    }))
    expect(mocks.queryLog).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'issues', method: 'insert' }),
    ]))
  })

  it('creates an expired-acceptance issue through the execution-fact governed write chain', async () => {
    await expect(ensureIssueFromExpiredAcceptance({
      id: 'acceptance-1',
      project_id: 'project-1',
      acceptance_name: 'Fire acceptance',
      description: 'The acceptance plan expired.',
    })).resolves.toBe('issue-from-condition')

    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1',
      source_type: 'condition_expired',
      source_entity_type: 'acceptance_plan',
      source_entity_id: 'acceptance-1',
      status: 'open',
    }))
    expect(mocks.queryLog).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'issues', method: 'insert' }),
    ]))
  })

  it('creates warnings only from promoted deduped governance signals and persists attribution metadata', async () => {
    const result = await upsertWarningsFromGovernanceSignals([
      {
        sourceAlgorithm: 'algorithm_seed',
        sourceId: 'seed-delay-task-1',
        signalType: 'critical_path_delay',
        projectId: 'project-1',
        taskId: 'task-1',
        actionPolicy: 'candidate_only',
        evidence: [{ stableCode: 'seed.delay.pattern' }],
      },
      {
        sourceAlgorithm: 'duration_context',
        sourceId: 'forecast-task-1',
        signalType: 'critical_path_delay',
        projectId: 'project-1',
        taskId: 'task-1',
        actionPolicy: 'create_warning',
        severity: 'critical',
        evidence: [{ confirmedDelayDays: 12 }],
      },
    ])

    expect(result).toEqual({ warningsCreated: 1, skippedSignals: 0 })
    expect(mocks.emit).toHaveBeenCalledTimes(1)
    expect(mocks.emit.mock.calls[0][0]).toMatchObject({
      project_id: 'project-1',
      type: 'critical_path_delay',
      severity: 'critical',
      source_entity_type: 'warning',
      source_entity_id: 'task-1',
      metadata: {
        governanceSignal: {
          dedupeKey: 'project-1::critical_path_delay::task-1',
          promotionStatus: 'warning_allowed',
          attribution: {
            primarySourceAlgorithm: 'duration_context',
            sourceAlgorithms: ['duration_context', 'algorithm_seed'],
            sourceIds: ['forecast-task-1', 'seed-delay-task-1'],
            evidenceCount: 2,
          },
        },
      },
    })
  })

  it('does not create warnings from seed-only or missing-subject signals', async () => {
    const result = await upsertWarningsFromGovernanceSignals([
      {
        sourceAlgorithm: 'algorithm_seed',
        sourceId: 'site-capacity-seed',
        signalType: 'site_capacity_pressure',
        projectId: 'project-1',
        actionPolicy: 'candidate_only',
        evidence: [{ stableCode: 'site.capacity.pressure' }],
      },
      {
        sourceAlgorithm: 'data_quality',
        sourceId: 'dq-row-1',
        signalType: 'missing_owner',
        actionPolicy: 'create_warning',
        evidence: [{ ruleCode: 'TASK_OWNER_REQUIRED' }],
      },
    ])

    expect(result).toEqual({ warningsCreated: 0, skippedSignals: 2 })
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it('uses the governance signal gate when syncing condition and acceptance warnings', async () => {
    mocks.from.mockImplementation((table: string) => {
      const query: Record<string, any> = {
        select: vi.fn(() => query),
        update: vi.fn(() => query),
        insert: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        is: vi.fn(() => query),
        lt: vi.fn(() => query),
        match: vi.fn(() => query),
        limit: vi.fn(() => query),
        or: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        single: vi.fn(async () => ({ data: null, error: null })),
        catch: vi.fn(async () => undefined),
        then: vi.fn((resolve: any) => {
          if (table === 'task_conditions') {
            return resolve({
              data: [{
                id: 'condition-1',
                project_id: 'project-1',
                task_id: 'task-1',
                name: '设计交底',
                description: '条件已过期',
              }],
              error: null,
            })
          }
          if (table === 'acceptance_plans') {
            return resolve({
              data: [{
                id: 'acceptance-1',
                project_id: 'project-1',
                acceptance_name: '隐蔽验收',
                description: '验收已过期',
              }],
              error: null,
            })
          }
          return resolve({ data: [], error: null })
        }),
      }
      return query
    })

    const result = await syncBusinessWarnings('project-1')

    expect(result.warningsCreated).toBe(2)
    expect(mocks.emit).toHaveBeenCalledTimes(2)
    expect(mocks.emit.mock.calls.map((call) => {
      const payload = call[0] as { metadata: { governanceSignal: { sourceAlgorithm: string } } }
      return payload.metadata.governanceSignal.sourceAlgorithm
    })).toEqual([
      'execution_impact',
      'execution_impact',
    ])
  })

  it('delegates warning and risk escalation to the atomic upgrade chain', async () => {
    await expect(confirmWarningAsRisk('project-1', 'warning-1', 'user-1')).resolves.toBe('risk-from-chain')
    await expect(convertRiskToIssue('risk-1')).resolves.toBe('issue-from-chain')

    expect(mocks.confirmWarningAsRiskOnChain).toHaveBeenCalledWith('project-1', 'warning-1', 'user-1')
    expect(mocks.convertRiskToIssueAtomic).toHaveBeenCalledWith('risk-1', 'risk_converted')
  })

  it('resolves warnings by both raw source id and source hash so old signatures do not strand lifecycle records', async () => {
    await markSourceResolved('task_condition', 'condition-1', 'project-1')

    const warningSourceFilters = mocks.queryLog.filter((entry) => entry.table === 'notifications' && entry.method === 'or')
    expect(warningSourceFilters.map((entry) => entry.args[0])).toContain(
      'source_entity_id.eq.condition-1,source_hash.eq.task_condition:condition-1',
    )
    expect(mocks.queryLog).toEqual(
      expect.arrayContaining([
        { table: 'risks', method: 'eq', args: ['source_entity_type', 'task_condition'] },
        { table: 'issues', method: 'eq', args: ['source_entity_type', 'task_condition'] },
      ]),
    )
  })
})
