import { describe, expect, it } from 'vitest'

import {
  buildAlgorithmAssetExplanationChain,
  summarizeAlgorithmAssetExplanationChain,
} from '../services/algorithmAssetExplanationChainService.js'

describe('algorithmAssetExplanationChainService', () => {
  it('builds a versioned governance explanation chain without replacing the business reason', () => {
    const chain = buildAlgorithmAssetExplanationChain({
      assetKey: 'duration.benchmark_blend_weight',
      sourceSystem: 'algorithmAssetLearnableParameterSuggestionService',
      scope: { type: 'company', id: 'company-a' },
      targetSurface: 'company_override',
      consumerKey: 'durationSuggestionService.company_benchmark_blend',
      businessReason: '标准工期样本足够，采用公司基准融合权重。',
      governanceRequest: {
        assetKey: 'duration.benchmark_blend_weight',
        sourceSystem: 'algorithmAssetLearnableParameterSuggestionService',
        publishAnchor: 'guarded_runtime_auto_publish',
        automationMaturity: 'auto_canary',
        learningMaturity: 'guarded_live_tuning',
        learningTarget: 'candidate_weight',
        requestedRuntimeEffect: 'bounded_calibration',
        evidence: {
          replayPassed: true,
          conflictFree: true,
          rollbackTarget: 'algorithm_learnable_parameter_runtime_publications:duration.benchmark_blend_weight:v3',
        },
      },
      steps: [
        {
          code: 'sample_health',
          source: 'algorithmAssetSampleHealthService',
          summary: 'accepted=42 weak=3 rejected=2',
          evidenceRef: 'algorithm_sample_health_events:company-a:duration',
        },
      ],
    })

    expect(chain).toEqual(expect.objectContaining({
      version: 'v1.4.22.3-algorithm-asset-explanation-chain-v1',
      assetKey: 'duration.benchmark_blend_weight',
      sourceSystem: 'algorithmAssetLearnableParameterSuggestionService',
      businessReason: '标准工期样本足够，采用公司基准融合权重。',
      businessReasonPreservationPolicy: 'preserve_existing_business_reason_do_not_replace',
      runtimeMutationPolicy: 'explain_chain_only_not_runtime_writer',
    }))
    expect(chain.governance).toEqual(expect.objectContaining({
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'candidate_weight',
      decisionStatus: 'canary_allowed',
      runtimeAction: 'write_canary_version',
      canWriteRuntime: false,
    }))
    expect(chain.steps).toEqual([
      expect.objectContaining({
        order: 1,
        code: 'sample_health',
        source: 'algorithmAssetSampleHealthService',
      }),
    ])
    expect(chain.boundaryPolicy).toEqual(expect.arrayContaining([
      'business_reason_is_preserved_not_rewritten',
      'explanation_chain_is_governance_metadata_not_runtime_writer',
      'runtime_write_still_requires_release_exit_domain_writer_consumer_monitoring_and_rollback',
    ]))
  })

  it('summarizes missing governance fields as review evidence instead of inferring publish rights', () => {
    const summary = summarizeAlgorithmAssetExplanationChain(buildAlgorithmAssetExplanationChain({
      assetKey: 'legacy.published_profile',
      sourceSystem: 'legacyProfileImport',
      scope: { type: 'unknown' },
      businessReason: null,
      governanceRequest: {
        assetKey: 'legacy.published_profile',
        sourceSystem: 'legacyProfileImport',
        requestedRuntimeEffect: 'direct_effect_request',
      },
      steps: [],
    }))

    expect(summary).toEqual(expect.objectContaining({
      assetKey: 'legacy.published_profile',
      decisionStatus: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      businessReasonPreserved: false,
    }))
    expect(summary.governanceReasons).toEqual(expect.arrayContaining([
      'missing_publish_anchor_defaults_to_candidate_only',
      'missing_automation_maturity_defaults_to_manual_required',
      'missing_learning_maturity_defaults_to_shadow_report_only',
      'missing_learning_target_defaults_to_governance_report',
    ]))
  })
})
