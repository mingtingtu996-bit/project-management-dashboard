import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    policyVersions: [] as Row[],
    runtimeValue: null as Row | null,
    runtimeValueCalls: [] as Row[],
  }

  function createBuilder(table: string) {
    const rows = table === 'duration_context_policy_versions' ? state.policyVersions : []
    const filters: Array<{ column: string; value: unknown }> = []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: undefined,
    }
    builder.then = (resolve: any) => {
      const data = rows.filter((row) => filters.every((filter) => row[filter.column] === filter.value))
      return Promise.resolve({ data, error: null }).then(resolve)
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

vi.mock('../services/algorithmAssetLearnableParameterRuntimeConsumptionService.js', () => ({
  loadAlgorithmAssetLearnableParameterRuntimeValue: vi.fn(async (input: Row) => {
    mocks.state.runtimeValueCalls.push(input)
    return mocks.state.runtimeValue ?? {
      status: 'runtime_parameter_not_found',
      runtimeConsumable: false,
      parameterKey: input.parameterKey,
      runtimeValue: null,
      consumptionMode: input.consumptionMode ?? 'stable',
      publicationKey: null,
      publicationStatus: null,
      scopeLevel: null,
      companyId: null,
      projectId: null,
      rollbackTarget: null,
      reasons: ['runtime_parameter_publication_not_found'],
      writesSeedRuntimeDirectly: false,
    }
  }),
}))

const {
  previewDurationContextPolicySelection,
  resolveDurationContextPolicyRuntimeSelection,
} = await import('../services/durationContextPolicySelectorService.js')

describe('durationContextPolicySelectorService', () => {
  beforeEach(() => {
    mocks.state.policyVersions = [
      {
        id: 'version-1',
        model_family: 'contextual_bandit_v1',
        model_version: 'contextual_bandit_v1',
        source_candidate_id: 'candidate-1',
        version_status: 'canary',
        activation_mode: 'review_required_canary',
        runtime_mutation_policy: 'none_version_registry_only',
        runtime_auto_publish_eligible: false,
        rollback_policy: 'manual_rollback_required_before_runtime_disablement',
        project_id: 'project-1',
        state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        action_key: 'publish_low_risk_calibration_threshold',
        canary_scope: {
          projectIds: ['project-1'],
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          trafficPercent: 10,
        },
        approved_at: '2026-05-31T10:00:00.000Z',
        expires_at: '2026-07-01T00:00:00.000Z',
        replay_case_count: 42,
        average_projected_reward_delta: 0.12,
        guardrails: ['low_risk_canary_review_required'],
      },
      {
        id: 'version-expired',
        model_family: 'contextual_bandit_v1',
        model_version: 'contextual_bandit_v1',
        source_candidate_id: 'candidate-old',
        version_status: 'canary',
        activation_mode: 'review_required_canary',
        runtime_mutation_policy: 'none_version_registry_only',
        runtime_auto_publish_eligible: false,
        rollback_policy: 'manual_rollback_required_before_runtime_disablement',
        project_id: 'project-1',
        state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        action_key: 'publish_low_risk_calibration_threshold',
        canary_scope: {
          projectIds: ['project-1'],
          startDate: '2026-05-01',
          endDate: '2026-05-15',
          trafficPercent: 10,
        },
        approved_at: '2026-05-01T10:00:00.000Z',
        expires_at: '2026-05-16T00:00:00.000Z',
        replay_case_count: 40,
        average_projected_reward_delta: 0.11,
        guardrails: [],
      },
    ]
    mocks.state.runtimeValue = null
    mocks.state.runtimeValueCalls = []
    mocks.from.mockClear()
  })

  it('previews the matching canary version without changing runtime policy or P', async () => {
    const result = await previewDurationContextPolicySelection({
      projectId: 'project-1',
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      asOfDate: '2026-06-15',
    })

    expect(result).toEqual(expect.objectContaining({
      selectorCode: 'duration_context_policy_readonly_selector',
      runtimeMutationPolicy: 'none_selector_explain_only',
      wouldApply: true,
      blockedCount: 1,
    }))
    expect(result.wouldApplyPolicyVersion).toEqual(expect.objectContaining({
      id: 'version-1',
      status: 'canary',
      activationMode: 'review_required_canary',
      runtimeAutoPublishEligible: false,
      actionKey: 'publish_low_risk_calibration_threshold',
    }))
    expect(result.explain).toEqual(expect.objectContaining({
      runtimePChanged: false,
      selectionMode: 'preview_only',
    }))
  })

  it('previews auto-publish-gate canary versions as registry-only and does not apply runtime policy', async () => {
    mocks.state.policyVersions[0].activation_mode = 'auto_publish_gate_canary'

    const result = await previewDurationContextPolicySelection({
      projectId: 'project-1',
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      asOfDate: '2026-06-15',
    })

    expect(result.wouldApply).toBe(true)
    expect(result.wouldApplyPolicyVersion).toEqual(expect.objectContaining({
      id: 'version-1',
      activationMode: 'auto_publish_gate_canary',
      runtimeMutationPolicy: 'none_version_registry_only',
      runtimeAutoPublishEligible: false,
    }))
    expect(result.explain).toEqual(expect.objectContaining({
      runtimePChanged: false,
      durationContextFactorsChanged: false,
      productionBoundary: 'deterministic_duration_context_rules_remain_authoritative',
    }))
  })

  it('blocks selection outside canary scope or for rolled-back versions', async () => {
    mocks.state.policyVersions[0].version_status = 'rolled_back'

    const result = await previewDurationContextPolicySelection({
      projectId: 'project-1',
      stateBucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      asOfDate: '2026-06-15',
    })

    expect(result.wouldApply).toBe(false)
    expect(result.wouldApplyPolicyVersion).toBeNull()
    expect(result.blockedReasons).toEqual(expect.arrayContaining([
      'version_status_not_canary',
      'version_expired_or_outside_scope_date',
    ]))
  })

  it('uses a consumable stable runtime publication and otherwise keeps the deterministic value', async () => {
    mocks.state.runtimeValue = {
      status: 'runtime_parameter_consumable',
      runtimeConsumable: true,
      parameterKey: 'duration.benchmark_blend_weight',
      runtimeValue: 0.62,
      consumptionMode: 'stable',
      publicationKey: 'publication-stable-1',
      publicationStatus: 'published',
      scopeLevel: 'company',
      companyId: 'company-1',
      projectId: null,
      rollbackTarget: 'duration.benchmark_blend_weight.default',
      reasons: [],
      writesSeedRuntimeDirectly: false,
    }

    const selected = await resolveDurationContextPolicyRuntimeSelection({
      parameterKey: 'duration.benchmark_blend_weight',
      deterministicValue: 0.55,
      companyId: 'company-1',
    })

    expect(selected).toEqual(expect.objectContaining({
      selectedValue: 0.62,
      deterministicValue: 0.55,
      effectiveSource: 'stable_runtime_publication',
      runtimeApplied: true,
      publicationKey: 'publication-stable-1',
    }))
    expect(mocks.state.runtimeValueCalls[0]).toEqual(expect.objectContaining({
      consumptionMode: 'stable',
    }))

    mocks.state.runtimeValue = null
    const fallback = await resolveDurationContextPolicyRuntimeSelection({
      parameterKey: 'duration.benchmark_blend_weight',
      deterministicValue: 0.55,
      companyId: 'company-1',
    })
    expect(fallback).toEqual(expect.objectContaining({
      selectedValue: 0.55,
      effectiveSource: 'deterministic_current_factor',
      runtimeApplied: false,
      reasonCodes: ['runtime_parameter_publication_not_found'],
    }))
  })

  it('requires an explicit consumer/scope/stop-condition boundary for canary selection', async () => {
    const blocked = await resolveDurationContextPolicyRuntimeSelection({
      parameterKey: 'duration.p50_p75_blend_ratio',
      deterministicValue: 0.5,
      companyId: 'company-1',
      consumptionMode: 'canary',
    })
    expect(blocked).toEqual(expect.objectContaining({
      selectedValue: 0.5,
      runtimeApplied: false,
      reasonCodes: ['explicit_canary_runtime_boundary_required'],
    }))
    expect(mocks.state.runtimeValueCalls).toHaveLength(0)

    mocks.state.runtimeValue = {
      status: 'runtime_parameter_consumable',
      runtimeConsumable: true,
      parameterKey: 'duration.p50_p75_blend_ratio',
      runtimeValue: 0.56,
      consumptionMode: 'canary',
      publicationKey: 'publication-canary-1',
      publicationStatus: 'canary',
      scopeLevel: 'company',
      companyId: 'company-1',
      projectId: null,
      rollbackTarget: 'duration.p50_p75_blend_ratio.default',
      reasons: [],
      writesSeedRuntimeDirectly: false,
    }
    const selected = await resolveDurationContextPolicyRuntimeSelection({
      parameterKey: 'duration.p50_p75_blend_ratio',
      deterministicValue: 0.5,
      companyId: 'company-1',
      consumptionMode: 'canary',
      canaryRuntimeBoundary: {
        consumerKey: 'durationSuggestionService.company_benchmark_p50_p75_blend',
        scopeBoundary: 'company',
        stopConditionKeys: ['mae_regression', 'overcompensation'],
        monitoringWindowHours: 72,
      },
    })
    expect(selected).toEqual(expect.objectContaining({
      selectedValue: 0.56,
      effectiveSource: 'canary_runtime_publication',
      runtimeApplied: true,
    }))
  })
})
