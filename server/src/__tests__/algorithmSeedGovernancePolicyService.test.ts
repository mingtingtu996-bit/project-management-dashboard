import { describe, expect, it } from 'vitest'
import {
  getAlgorithmSeedGovernanceCapabilityMatrix,
  getAlgorithmSeedGovernancePolicy,
  isAlgorithmSeedCandidateOnly,
} from '../services/algorithmSeedGovernancePolicyService.js'
import { listAlgorithmSeedTypes } from '../services/algorithmSeedRegistry.js'

describe('algorithmSeedGovernancePolicyService', () => {
  it('declares lifecycle capabilities for every algorithm seed type', () => {
    const matrix = getAlgorithmSeedGovernanceCapabilityMatrix()

    expect(Object.keys(matrix).sort()).toEqual([...listAlgorithmSeedTypes()].sort())
    expect(matrix.standard_work_duration).toEqual(expect.objectContaining({
      resolver: true,
      validation: true,
      learning: true,
      autoGovernance: true,
      import: true,
      rollback: true,
      candidateOnly: false,
    }))
    expect(matrix.standard_internal_flow).toEqual(expect.objectContaining({
      resolver: true,
      validation: true,
      learning: true,
      autoGovernance: true,
      import: true,
      rollback: true,
      candidateOnly: true,
    }))
  })

  it('externalizes auto-governance thresholds and candidate-only policy per seed', () => {
    expect(isAlgorithmSeedCandidateOnly('standard_internal_flow')).toBe(true)
    expect(isAlgorithmSeedCandidateOnly('standard_work_duration')).toBe(false)

    expect(getAlgorithmSeedGovernancePolicy('standard_work_duration')).toEqual(expect.objectContaining({
      seedType: 'standard_work_duration',
      candidateOnly: false,
      autoPublishEnabled: true,
      thresholds: expect.objectContaining({
        project: expect.objectContaining({ minSamples: 5, minConfidence: 0.75 }),
        company: expect.objectContaining({ minSamples: 20, minCrossProjects: 3 }),
        global: expect.objectContaining({ minSamples: 100, minCrossCompanies: 3 }),
      }),
    }))
    expect(getAlgorithmSeedGovernancePolicy('risk_issue_warning_rule')).toEqual(expect.objectContaining({
      seedType: 'risk_issue_warning_rule',
      candidateOnly: true,
      autoPublishEnabled: false,
      promotionBoundary: 'curated_seed_or_enterprise_standard_library',
    }))
  })

  it('declares consumer contracts and seed-specific candidate quality weights', () => {
    expect(getAlgorithmSeedGovernancePolicy('standard_work_duration')).toEqual(expect.objectContaining({
      consumerContract: expect.objectContaining({
        allowedConsumers: expect.arrayContaining(['durationContextService', 'taskDurationForecastService']),
        forbiddenConsumers: expect.arrayContaining(['warningService']),
        runtimeAuthority: 'duration_baseline_context',
      }),
      qualityWeights: expect.objectContaining({
        sample: 0.55,
        conflict: 0.15,
        replay: 0.30,
      }),
    }))

    expect(getAlgorithmSeedGovernancePolicy('risk_issue_warning_rule')).toEqual(expect.objectContaining({
      consumerContract: expect.objectContaining({
        allowedConsumers: expect.arrayContaining(['warningService', 'warningImpactSignalService']),
        forbiddenConsumers: expect.arrayContaining(['durationContextService']),
        runtimeAuthority: 'warning_threshold_policy_only',
      }),
      qualityWeights: expect.objectContaining({
        sample: 0.20,
        conflict: 0.25,
        replay: 0.55,
      }),
    }))
  })

  it('keeps workflow and process seed consumer contracts aligned with duration context runtime consumers', () => {
    expect(getAlgorithmSeedGovernancePolicy('cross_item_workflow')).toEqual(expect.objectContaining({
      consumerContract: expect.objectContaining({
        allowedConsumers: expect.arrayContaining([
          'durationContextService',
          'taskDurationForecastService',
          'constructionDependencyRuleSystemService',
        ]),
        forbiddenConsumers: expect.arrayContaining(['warningService']),
        runtimeAuthority: 'dependency_gate_signal',
      }),
    }))

    expect(getAlgorithmSeedGovernancePolicy('process_constraint')).toEqual(expect.objectContaining({
      consumerContract: expect.objectContaining({
        allowedConsumers: expect.arrayContaining([
          'durationContextService',
          'taskDurationForecastService',
          'constructionDependencyRuleSystemService',
        ]),
        forbiddenConsumers: expect.arrayContaining(['warningService']),
        runtimeAuthority: 'dependency_gate_signal',
      }),
    }))

    expect(getAlgorithmSeedGovernancePolicy('building_pattern')).toEqual(expect.objectContaining({
      consumerContract: expect.objectContaining({
        allowedConsumers: expect.arrayContaining([
          'buildingPatternScheduleTrustService',
          'durationContextService',
          'baselineGenerationService',
        ]),
        forbiddenConsumers: expect.arrayContaining([
          'constructionDependencyRuleSystemService',
          'taskDependencyGenerationService',
        ]),
        runtimeAuthority: 'controlled_schedule_rhythm_context',
      }),
    }))
  })

  it('registers earliest_start_rule as a forecast-only external readiness seed consumer contract', () => {
    expect(getAlgorithmSeedGovernancePolicy('earliest_start_rule')).toEqual(expect.objectContaining({
      consumerContract: expect.objectContaining({
        allowedConsumers: expect.arrayContaining([
          'taskDurationForecastService',
          'durationContextGovernanceService',
        ]),
        forbiddenConsumers: expect.arrayContaining([
          'warningService',
          'baselineGenerationService',
        ]),
        runtimeAuthority: 'forecast_only_bridge',
      }),
    }))
  })
})
