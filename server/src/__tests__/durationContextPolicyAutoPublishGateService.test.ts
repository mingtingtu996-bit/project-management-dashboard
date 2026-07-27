import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    canaryCandidates: [] as Row[],
    policyVersions: [] as Row[],
    failNextVersionInsert: false,
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  }

  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      state.queries.push({ sql, params })
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (
        normalized === 'begin'
        || normalized === 'commit'
        || normalized === 'rollback'
        || normalized.startsWith('savepoint ')
        || normalized.startsWith('rollback to savepoint ')
      ) {
        return { rows: [], rowCount: 0 }
      }
      if (normalized.startsWith('select * from duration_context_policy_canary_candidates where id =')) {
        const row = state.canaryCandidates.find((item) => item.id === params[0]) ?? null
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
      }
      if (normalized.startsWith('select * from duration_context_policy_versions where id =')) {
        const row = state.policyVersions.find((item) => item.id === params[0]) ?? null
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
      }
      if (normalized.startsWith('select * from duration_context_policy_versions where model_family =')) {
        const row = state.policyVersions.find((item) => (
          item.model_family === params[0]
          && item.state_bucket === params[1]
          && item.action_key === params[2]
          && (item.company_id ?? null) === (params[3] ?? null)
          && (item.project_id ?? null) === (params[4] ?? null)
          && ['canary', 'published'].includes(item.version_status)
        )) ?? null
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
      }
      if (normalized.startsWith('insert into "duration_context_policy_canary_candidates"')) {
        const row = {
          id: `duration_context_policy_canary_candidates-${state.canaryCandidates.length + 1}`,
        } as Row
        const match = sql.match(/\(([^)]+)\)\s+values/i)
        const columns = match?.[1]?.split(',').map((column) => column.replace(/"/g, '').trim()) ?? []
        columns.forEach((column, index) => {
          row[column] = params[index] ?? null
        })
        state.canaryCandidates.push(row)
        return { rows: [row], rowCount: 1 }
      }
      if (normalized.startsWith('insert into "duration_context_policy_versions"')) {
        if (state.failNextVersionInsert) {
          state.failNextVersionInsert = false
          throw new Error('version insert failed')
        }
        const row = {
          id: `duration_context_policy_versions-${state.policyVersions.length + 1}`,
        } as Row
        const match = sql.match(/\(([^)]+)\)\s+values/i)
        const columns = match?.[1]?.split(',').map((column) => column.replace(/"/g, '').trim()) ?? []
        columns.forEach((column, index) => {
          row[column] = params[index] ?? null
        })
        state.policyVersions.push(row)
        return { rows: [row], rowCount: 1 }
      }
      if (normalized.startsWith('update duration_context_policy_canary_candidates')) {
        const candidateId = String(params[5] ?? '')
        const row = state.canaryCandidates.find((item) => item.id === candidateId) ?? null
        if (row) {
          row.candidate_status = params[0]
          row.runtime_auto_publish_eligible = params[1]
          row.requires_review = params[2]
          row.review_metadata = params[3]
          row.updated_at = params[4]
        }
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 }
      }
      throw new Error(`unexpected query: ${sql}`)
    }),
    release: vi.fn(),
  }

  return {
    state,
    getClient: vi.fn(async () => client),
    client,
  }
})

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

const {
  autoPublishDurationContextPolicyCandidates,
  buildDurationContextPolicyAutoPublishDecision,
  classifyDurationLearningAssetReleasePolicy,
} = await import('../services/durationContextPolicyAutoPublishGateService.js')

const passingEvidence = {
  enabledLearningScopes: ['global', 'industry_baseline', 'company', 'project'],
  scopeSampleCounts: {
    global: 80,
    industry: 40,
    company: 12,
    project: 6,
  },
  sampleCount: 80,
  uniqueChangeKeys: Array.from({ length: 20 }, (_, index) => `change-${index + 1}`),
  taskIds: Array.from({ length: 10 }, (_, index) => `task-${index + 1}`),
  projectIds: ['10000000-0000-4000-8000-000000000111'],
  companyIds: ['20000000-0000-4000-8000-000000000222'],
  realOutcomeCount: 10,
  observationWindowDays: 14,
  maeBefore: 0.18,
  maeAfter: 0.11,
  conflictRate: 0.02,
  overcompensationRate: 0.03,
  rollbackReady: true,
  tenantScopeValid: true,
}

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readMigration(filename: string) {
  return readFileSync(resolve(serverRoot, 'migrations', filename), 'utf8')
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    modelFamily: 'contextual_bandit_v1' as const,
    status: 'candidate' as const,
    experienceTier: 'T3' as const,
    experienceAssetType: 'project_efficiency_model' as const,
    reuseScope: 'project' as const,
    factSource: 'hybrid' as const,
    companyId: '20000000-0000-4000-8000-000000000222',
    projectId: '10000000-0000-4000-8000-000000000111',
    stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
    actionKey: 'publish_low_risk_calibration_threshold' as const,
    requiresReview: true as const,
    runtimeAutoPublishEligible: false as const,
    replayCaseCount: 42,
    averageProjectedRewardDelta: 0.12,
    sourceDecisionIds: ['decision-1', 'decision-2'],
    guardrails: ['low_risk_canary_review_required'],
    autoPublishEvidence: passingEvidence,
    ...overrides,
  }
}

describe('durationContextPolicyAutoPublishGateService', () => {
  beforeEach(() => {
    mocks.state.canaryCandidates = []
    mocks.state.policyVersions = []
    mocks.state.failNextVersionInsert = false
    mocks.state.queries = []
    mocks.client.query.mockClear()
    mocks.client.release.mockClear()
    mocks.getClient.mockResolvedValue(mocks.client)
  })

  it('auto-publishes a low-risk canary version when scope samples and MAE gates pass', async () => {
    const result = await autoPublishDurationContextPolicyCandidates({
      asOfDate: '2026-06-17',
      candidates: [candidate()],
      persist: true,
    })

    expect(result).toEqual(expect.objectContaining({
      gateCode: 'duration_context_policy_auto_publish_gate',
      humanReviewPolicy: 'zero_human_review_when_gate_passes',
      runtimeMutationPolicy: 'canary_version_registry_only_when_gate_passes',
      candidateCount: 1,
      autoPublishedVersionCount: 1,
      manualReviewCandidateCount: 0,
      blockedCandidateCount: 0,
    }))
    expect(result.decisions[0]).toEqual(expect.objectContaining({
      promotionDecision: 'auto_publish_canary',
      runtimeConsumptionStatus: 'canary_auto_published',
      autoCanaryPublicationAllowed: true,
      reasonCodes: [],
      assetReleasePolicy: expect.objectContaining({
        assetRiskTier: 'low',
        releaseGovernanceMode: 'auto_canary_with_observation_window',
        observationWindowDays: 14,
      }),
    }))
    expect(mocks.state.canaryCandidates).toHaveLength(1)
    expect(mocks.state.canaryCandidates[0]).toEqual(expect.objectContaining({
      company_id: '20000000-0000-4000-8000-000000000222',
      candidate_status: 'approved_for_canary',
      runtime_auto_publish_eligible: true,
      requires_review: false,
    }))
    expect(mocks.state.policyVersions).toHaveLength(1)
    expect(mocks.state.policyVersions[0]).toEqual(expect.objectContaining({
      company_id: '20000000-0000-4000-8000-000000000222',
      source_candidate_id: 'duration_context_policy_canary_candidates-1',
      version_status: 'canary',
      runtime_mutation_policy: 'none_version_registry_only',
      approval_reason: 'auto_publish_gate_passed_zero_human_review',
    }))
    expect(mocks.state.policyVersions[0].canary_scope).toEqual(expect.objectContaining({
      publicationScope: 'project',
      projectIds: ['10000000-0000-4000-8000-000000000111'],
      observationWindowDays: 14,
      rollbackPolicy: 'auto_rollback_on_mae_bias_overcompensation_or_coverage_regression',
    }))
  })

  it('reuses deterministic candidate and version rows for the same learning operation stage', async () => {
    const input = {
      asOfDate: '2026-06-17',
      candidates: [candidate()],
      persist: true,
      operationId: 'duration-context-policy-learning:2026-06-17:abc',
      idempotencyStage: 'decision_persistence',
    }

    await autoPublishDurationContextPolicyCandidates(input)
    await autoPublishDurationContextPolicyCandidates(input)

    expect(mocks.state.canaryCandidates).toHaveLength(1)
    expect(mocks.state.policyVersions).toHaveLength(1)
    expect(mocks.state.canaryCandidates[0].review_metadata).toEqual(expect.objectContaining({
      learningOperationId: input.operationId,
      learningStageKey: input.idempotencyStage,
    }))
    expect(mocks.state.canaryCandidates[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(mocks.state.policyVersions[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ships a scope-level active canary uniqueness migration for policy versions', () => {
    const migration = readMigration('244_v14231_duration_context_policy_versions_active_scope_key.sql')

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS company_id')
    expect(migration).toContain('uq_duration_context_policy_versions_active_scope_action')
    expect(migration).toContain("WHERE version_status IN ('canary', 'published')")
    expect(migration).toContain('COALESCE(company_id')
    expect(migration).toContain('COALESCE(project_id')
    expect(migration).not.toContain('COALESCE(c.project_id, v.project_id)')
    expect(migration).toContain('SELECT p.company_id')
    expect(migration).toContain('WHERE p.id = c.project_id')
    expect(migration).toContain('WHERE p.id = v.project_id')
    expect(migration).toContain('state_bucket')
    expect(migration).toContain('action_key')
  })

  it('keeps insufficient evidence collecting without creating a manual-review backlog', async () => {
    const decision = buildDurationContextPolicyAutoPublishDecision({
      asOfDate: '2026-06-17',
      candidate: candidate({
        autoPublishEvidence: {
          ...passingEvidence,
          uniqueChangeKeys: ['change-1'],
          taskIds: ['task-1'],
        },
      }),
    })

    expect(decision).toEqual(expect.objectContaining({
      promotionDecision: 'hold_as_candidate_for_more_evidence',
      runtimeConsumptionStatus: 'candidate_only',
      autoCanaryPublicationAllowed: false,
      effectivePublicationScope: 'project',
      reasonCodes: expect.arrayContaining(['valid_change_count_below_project_canary_floor']),
      automationPolicyDecision: expect.objectContaining({
        stage: 'collecting',
        manualReviewRequired: false,
      }),
    }))

    const result = await autoPublishDurationContextPolicyCandidates({
      asOfDate: '2026-06-17',
      candidates: [decision.candidate],
      persist: false,
    })
    expect(result).toEqual(expect.objectContaining({
      evidencePendingCandidateCount: 1,
      manualReviewCandidateCount: 0,
    }))
  })

  it('blocks automatic publication when replay MAE regresses', () => {
    const decision = buildDurationContextPolicyAutoPublishDecision({
      asOfDate: '2026-06-17',
      candidate: candidate({
        autoPublishEvidence: {
          ...passingEvidence,
          maeBefore: 0.12,
          maeAfter: 0.18,
        },
      }),
    })

    expect(decision).toEqual(expect.objectContaining({
      promotionDecision: 'block_and_retain_previous',
      runtimeConsumptionStatus: 'blocked_retain_previous',
      autoCanaryPublicationAllowed: false,
      reasonCodes: expect.arrayContaining(['mae_regression_detected']),
    }))
  })

  it('does not leave an approved orphan candidate when canary version persistence fails', async () => {
    mocks.state.failNextVersionInsert = true

    await expect(autoPublishDurationContextPolicyCandidates({
      asOfDate: '2026-06-17',
      candidates: [candidate()],
      persist: true,
    })).rejects.toThrow('version insert failed')

    expect(mocks.state.policyVersions).toHaveLength(0)
    expect(mocks.state.canaryCandidates).toHaveLength(1)
    expect(mocks.state.canaryCandidates[0]).toEqual(expect.objectContaining({
      candidate_status: 'rejected',
      runtime_auto_publish_eligible: false,
      requires_review: true,
    }))
    expect(mocks.state.canaryCandidates[0].review_metadata).toEqual(expect.objectContaining({
      autoPublishGateDecision: 'auto_publish_canary_failed_version_persistence',
      autoPublishGateReasonCodes: expect.arrayContaining(['version_persistence_failed']),
    }))
    expect(mocks.state.queries.some((entry) => /savepoint duration_context_policy_auto_publish_version_insert/i.test(entry.sql))).toBe(true)
  })

  it('classifies numeric assets for automatic canary while reserving manual review for structural or hard-guardrail changes', () => {
    expect(classifyDurationLearningAssetReleasePolicy({
      assetType: 'forecast_residual_overlay',
      scopeLevel: 'project',
      stateBucket: 'mature_90d|risk:low|schedule:stable|hard:0',
      guardrails: [],
    })).toEqual(expect.objectContaining({
      assetRiskTier: 'low',
      releaseGovernanceMode: 'auto_canary_with_observation_window',
      observationWindowDays: 14,
      rollbackPolicy: 'auto_rollback_on_mae_bias_overcompensation_or_coverage_regression',
      reasonCodes: expect.arrayContaining(['low_radius_project_or_company_forecast_asset']),
    }))

    expect(classifyDurationLearningAssetReleasePolicy({
      assetType: 'base_duration_benchmark',
      scopeLevel: 'company',
      stateBucket: 'mature_90d|risk:low|schedule:stable|hard:0',
      guardrails: [],
    })).toEqual(expect.objectContaining({
      assetRiskTier: 'high',
      releaseGovernanceMode: 'auto_canary_with_observation_window',
      observationWindowDays: 30,
      rollbackPolicy: 'auto_rollback_on_mae_bias_overcompensation_or_coverage_regression',
      reasonCodes: expect.arrayContaining(['high_impact_schedule_network_asset']),
    }))

    expect(classifyDurationLearningAssetReleasePolicy({
      assetType: 'critical_path_rule_candidate',
      scopeLevel: 'project',
      stateBucket: 'mature_90d|risk:low|schedule:stable|hard:0',
      guardrails: [],
    })).toEqual(expect.objectContaining({
      assetRiskTier: 'high',
      releaseGovernanceMode: 'auto_canary_with_observation_window',
      reasonCodes: expect.arrayContaining(['high_impact_schedule_network_asset']),
    }))

    expect(classifyDurationLearningAssetReleasePolicy({
      assetType: 'base_duration_benchmark',
      scopeLevel: 'company',
      stateBucket: 'mature_90d|risk:low|schedule:stable|hard:0',
      guardrails: ['structural_mutation'],
    })).toEqual(expect.objectContaining({
      releaseGovernanceMode: 'batch_manual_approval_required',
      reasonCodes: expect.arrayContaining(['structural_or_hard_guardrail_present']),
    }))
  })
})
