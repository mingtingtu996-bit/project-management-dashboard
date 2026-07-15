import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Filter = { op: 'eq'; column: string; value: any }

function migrationPath(fileName: string) {
  const cwd = process.cwd().replace(/\\/g, '/')
  const repoRoot = cwd.endsWith('/server') ? resolve(process.cwd(), '..') : process.cwd()
  return resolve(repoRoot, 'server/migrations', fileName)
}

const mocks = vi.hoisted(() => {
  const state = {
    policyDecisions: [] as Row[],
    policyParameters: [] as Row[],
  }

  function rowsFor(table: string) {
    if (table === 'duration_context_policy_decisions') return state.policyDecisions
    if (table === 'duration_context_policy_parameters') return state.policyParameters
    return []
  }

  function applyFilters(rows: Row[], filters: Filter[]) {
    return filters.reduce((result, filter) => {
      if (filter.op === 'eq') return result.filter((row) => row[filter.column] === filter.value)
      return result
    }, rows)
  }

  function createBuilder(table: string) {
    const filters: Filter[] = []
    let limitCount: number | null = null
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn((count: number) => {
        limitCount = count
        return builder
      }),
      insert: vi.fn((payload: Row | Row[]) => {
        const rows = rowsFor(table)
        const payloadRows = Array.isArray(payload) ? payload : [payload]
        const inserted = payloadRows.map((item) => {
          const row = { id: item.id ?? `${table}-${rows.length + 1}`, ...item }
          rows.push(row)
          return row
        })
        return {
          select: vi.fn(() => Promise.resolve({ data: inserted, error: null })),
        }
      }),
      upsert: vi.fn((payload: Row | Row[], options?: { onConflict?: string }) => {
        const rows = rowsFor(table)
        const payloadRows = Array.isArray(payload) ? payload : [payload]
        const conflictColumns = String(options?.onConflict ?? '')
          .split(',')
          .map((column) => column.trim())
          .filter(Boolean)
        const persisted = payloadRows.map((item) => {
          const existing = conflictColumns.length > 0
            ? rows.find((row) => conflictColumns.every((column) => row[column] === item[column]))
            : undefined
          if (existing) {
            Object.assign(existing, item, { updated_at: item.updated_at ?? existing.updated_at })
            return existing
          }
          const row = { id: item.id ?? `${table}-${rows.length + 1}`, ...item }
          rows.push(row)
          return row
        })
        return {
          select: vi.fn(() => Promise.resolve({ data: persisted, error: null })),
        }
      }),
      then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const rows = applyFilters(rowsFor(table), filters)
        return Promise.resolve({
          data: limitCount == null ? rows : rows.slice(0, limitCount),
          error: null,
        }).then(resolve, reject)
      }),
    }
    return builder
  }

  return {
    state,
    from: vi.fn((table: string) => createBuilder(table)),
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const {
  buildDurationContextPolicyStateBucket,
  learnDurationContextPolicyParameters,
} = await import('../services/durationContextPolicyParameterLearningService.js')

function decisionRow(input: {
  id: string
  companyId?: string
  projectId?: string
  actionKey: string
  reward: number
  stateBucket?: string | null
  maturityTier?: string
  scheduleState?: string | null
  highRiskFactorCount?: number
  hardConstraintActive?: boolean
  experienceTier?: 'T1' | 'T2' | 'T3' | string | null
}) {
  return {
    id: input.id,
    company_id: input.companyId ?? 'company-1',
    project_id: input.projectId ?? 'project-1',
    model_family: 'contextual_bandit_v1',
    model_version: 'contextual_bandit_v1',
    reward_status: 'evaluated',
    decision_status: 'reward_evaluated',
    state_vector: {
      maturityTier: input.maturityTier ?? 'mature_90d',
      scheduleState: input.scheduleState ?? 'accelerating',
      highRiskFactorCount: input.highRiskFactorCount ?? 0,
      mediumRiskFactorCount: 0,
      lowRiskFactorCount: 1,
      hardConstraintActive: input.hardConstraintActive ?? false,
      experienceTier: input.experienceTier ?? null,
      pressureScore: 0.2,
      compensationScore: 0.08,
      stateBucket: input.stateBucket,
    },
    recommended_action: {
      actionKey: input.actionKey,
      runtimePolicy: 'candidate_only',
      runtimeAutoPublishEligible: false,
    },
    reward_payload: {
      totalReward: input.reward,
    },
  }
}

describe('durationContextPolicyParameterLearningService', () => {
  beforeEach(() => {
    mocks.state.policyDecisions = []
    mocks.state.policyParameters = []
    mocks.from.mockClear()
  })

  it('builds stable state buckets from maturity, risk, schedule state and hard constraints', () => {
    const bucket = buildDurationContextPolicyStateBucket({
      maturityTier: 'mature_90d',
      scheduleState: 'accelerating',
      highRiskFactorCount: 0,
      mediumRiskFactorCount: 1,
      lowRiskFactorCount: 2,
      hardConstraintActive: false,
    })

    expect(bucket).toBe('mature_90d|risk:medium|schedule:accelerating|hard:0|experience:T3')
  })

  it('learns candidate action weights from evaluated delayed rewards without runtime mutation', async () => {
    mocks.state.policyDecisions = [
      decisionRow({ id: 'd1', actionKey: 'publish_low_risk_calibration_threshold', reward: 0.24 }),
      decisionRow({ id: 'd2', actionKey: 'publish_low_risk_calibration_threshold', reward: 0.16 }),
      decisionRow({ id: 'd3', actionKey: 'keep_rule_baseline', reward: -0.04 }),
      decisionRow({ id: 'd4', actionKey: 'keep_rule_baseline', reward: -0.02 }),
      decisionRow({ id: 'd5', actionKey: 'hold_high_risk_candidate_for_review', reward: 0.5, highRiskFactorCount: 1 }),
    ]

    const result = await learnDurationContextPolicyParameters({
      minSamples: 2,
      persist: true,
    })

    expect(result).toEqual(expect.objectContaining({
      modelFamily: 'contextual_bandit_v1',
      learningMode: 'offline_parameter_candidate_only',
      runtimeMutationPolicy: 'none_candidate_parameters_only',
      policyParameterBucketValidation: 'duration_context_policy_state_bucket_tier_aware',
      evaluatedDecisionCount: 5,
      rejectedStateBucketDecisionCount: 0,
      candidateParameterCount: 2,
      persistedParameterCount: 2,
    }))
    expect(result.parameters[0]).toEqual(expect.objectContaining({
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      actionKey: 'publish_low_risk_calibration_threshold',
      sampleCount: 2,
      averageReward: 0.2,
      learnedWeight: expect.any(Number),
    }))
    expect(result.parameters[0].learnedWeight).toBeGreaterThan(result.parameters[1].learnedWeight)
    expect(mocks.state.policyParameters).toHaveLength(2)
    expect(mocks.state.policyParameters[0]).toEqual(expect.objectContaining({
      model_family: 'contextual_bandit_v1',
      parameter_status: 'candidate',
      runtime_mutation_policy: 'none_candidate_parameters_only',
      state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      action_key: 'publish_low_risk_calibration_threshold',
    }))
  })

  it('groups evaluated policy decisions by unified T3 state bucket and rejects cross-tier bucket drift', async () => {
    mocks.state.policyDecisions = [
      decisionRow({
        id: 't3-d1',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.24,
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      }),
      decisionRow({
        id: 't3-d2',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.16,
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      }),
      decisionRow({
        id: 't1-drift',
      actionKey: 'publish_low_risk_calibration_threshold',
      reward: 0.8,
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T1',
      }),
      decisionRow({
        id: 'legacy-bucket',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.7,
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      }),
    ]

    const result = await learnDurationContextPolicyParameters({
      minSamples: 2,
      persist: true,
    })

    expect(result).toEqual(expect.objectContaining({
      policyParameterBucketValidation: 'duration_context_policy_state_bucket_tier_aware',
      evaluatedDecisionCount: 4,
      rejectedStateBucketDecisionCount: 2,
      rejectedStateBucketReasonCounts: expect.objectContaining({
        experience_tier_mismatch: 1,
        experience_tier_missing_or_invalid: 1,
      }),
      candidateParameterCount: 1,
      persistedParameterCount: 1,
    }))
    expect(result.parameters[0]).toEqual(expect.objectContaining({
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      sampleCount: 2,
      averageReward: 0.2,
    }))
    expect(mocks.state.policyParameters).toHaveLength(1)
    expect(mocks.state.policyParameters[0]).toEqual(expect.objectContaining({
      state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      sample_count: 2,
    }))
  })

  it('groups evaluated policy decisions by the explicit state-vector experience tier', async () => {
    mocks.state.policyDecisions = [
      decisionRow({
        id: 't1-d1',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.24,
        experienceTier: 'T1',
      }),
      decisionRow({
        id: 't1-d2',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.16,
        experienceTier: 'T1',
      }),
      decisionRow({
        id: 't1-mismatch',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.7,
        experienceTier: 'T1',
        stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      }),
    ]

    const result = await learnDurationContextPolicyParameters({
      minSamples: 2,
      persist: true,
    })

    expect(result).toEqual(expect.objectContaining({
      policyParameterBucketValidation: 'duration_context_policy_state_bucket_tier_aware',
      evaluatedDecisionCount: 3,
      rejectedStateBucketDecisionCount: 1,
      rejectedStateBucketReasonCounts: expect.objectContaining({
        experience_tier_mismatch: 1,
      }),
      candidateParameterCount: 1,
      persistedParameterCount: 1,
    }))
    expect(result.parameters[0]).toEqual(expect.objectContaining({
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T1',
      sampleCount: 2,
      averageReward: 0.2,
    }))
    expect(mocks.state.policyParameters[0]).toEqual(expect.objectContaining({
      state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T1',
      sample_count: 2,
    }))
  })

  it('does not publish high-risk parameter candidates even when reward is positive', async () => {
    mocks.state.policyDecisions = [
      decisionRow({ id: 'd1', actionKey: 'hold_high_risk_candidate_for_review', reward: 0.5, highRiskFactorCount: 2 }),
      decisionRow({ id: 'd2', actionKey: 'hold_high_risk_candidate_for_review', reward: 0.4, highRiskFactorCount: 2 }),
    ]

    const result = await learnDurationContextPolicyParameters({
      minSamples: 2,
      persist: true,
    })

    expect(result.parameters[0]).toEqual(expect.objectContaining({
      actionKey: 'hold_high_risk_candidate_for_review',
      runtimeAutoPublishEligible: false,
      parameterStatus: 'candidate',
      guardrails: expect.arrayContaining(['manual_runtime_promotion_required']),
    }))
    expect(mocks.state.policyParameters[0]).toEqual(expect.objectContaining({
      parameter_status: 'candidate',
      runtime_auto_publish_eligible: false,
    }))
  })

  it('upserts learned parameters by model, project, bucket, action and status instead of accumulating duplicates', async () => {
    mocks.state.policyDecisions = [
      decisionRow({ id: 'd1', projectId: 'project-1', actionKey: 'publish_low_risk_calibration_threshold', reward: 0.24 }),
      decisionRow({ id: 'd2', projectId: 'project-1', actionKey: 'publish_low_risk_calibration_threshold', reward: 0.16 }),
    ]

    await learnDurationContextPolicyParameters({ projectIds: ['project-1'], minSamples: 2, persist: true })
    mocks.state.policyDecisions = [
      decisionRow({ id: 'd3', projectId: 'project-1', actionKey: 'publish_low_risk_calibration_threshold', reward: 0.4 }),
      decisionRow({ id: 'd4', projectId: 'project-1', actionKey: 'publish_low_risk_calibration_threshold', reward: 0.2 }),
    ]
    const result = await learnDurationContextPolicyParameters({ projectIds: ['project-1'], minSamples: 2, persist: true })

    expect(result.persistedParameterCount).toBe(1)
    expect(mocks.state.policyParameters).toHaveLength(1)
    expect(mocks.state.policyParameters[0]).toEqual(expect.objectContaining({
      project_id: 'project-1',
      state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0|experience:T3',
      action_key: 'publish_low_risk_calibration_threshold',
      sample_count: 2,
      average_reward: 0.3,
    }))
  })

  it('keeps learned parameters isolated by company even when project and state bucket labels collide', async () => {
    mocks.state.policyDecisions = [
      decisionRow({
        id: 'company-a-d1',
        companyId: 'company-a',
        projectId: 'project-1',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.24,
      }),
      decisionRow({
        id: 'company-a-d2',
        companyId: 'company-a',
        projectId: 'project-1',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: 0.16,
      }),
      decisionRow({
        id: 'company-b-d1',
        companyId: 'company-b',
        projectId: 'project-1',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: -0.4,
      }),
      decisionRow({
        id: 'company-b-d2',
        companyId: 'company-b',
        projectId: 'project-1',
        actionKey: 'publish_low_risk_calibration_threshold',
        reward: -0.2,
      }),
    ]

    const result = await learnDurationContextPolicyParameters({ minSamples: 2, persist: true })

    expect(result.candidateParameterCount).toBe(2)
    expect(result.parameters.map((parameter) => parameter.companyId).sort()).toEqual(['company-a', 'company-b'])
    expect(mocks.state.policyParameters).toHaveLength(2)
    expect(mocks.state.policyParameters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        company_id: 'company-a',
        project_id: 'project-1',
        sample_count: 2,
        average_reward: 0.2,
      }),
      expect.objectContaining({
        company_id: 'company-b',
        project_id: 'project-1',
        sample_count: 2,
        average_reward: -0.3,
      }),
    ]))
  })

  it('ships a database unique key matching the learned parameter upsert identity', () => {
    const dedupeMigration = readFileSync(
      migrationPath('220_v14231_duration_context_policy_parameter_unique_key.sql'),
      'utf8',
    )
    const companyScopeMigration = readFileSync(
      migrationPath('222_v14231_duration_context_policy_company_scope.sql'),
      'utf8',
    )
    const migration = `${dedupeMigration}\n${companyScopeMigration}`

    expect(migration).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_duration_context_policy_parameters_current_key/i)
    expect(companyScopeMigration).toContain('ADD COLUMN IF NOT EXISTS company_id')
    expect(migration).toContain('COALESCE(company_id')
    expect(migration).toContain('COALESCE(project_id')
    expect(migration).toMatch(/parameter_status/i)
    expect(migration).toMatch(/state_bucket/i)
    expect(migration).toMatch(/action_key/i)
  })
})
