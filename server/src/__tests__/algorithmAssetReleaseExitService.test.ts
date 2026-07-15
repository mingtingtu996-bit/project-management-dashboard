import { describe, expect, it } from 'vitest'

import { createAlgorithmAssetCandidateEvent } from '../services/algorithmAssetCandidateEventAdapterService.js'
import { buildAlgorithmAssetReleaseExitPackage } from '../services/algorithmAssetReleaseExitService.js'

const companyCandidate = createAlgorithmAssetCandidateEvent({
  assetKey: 'duration.context.rain_factor',
  sourceSystem: 'durationContextPolicyLearningService',
  assetType: 'calibration',
  companyId: 'company-a',
  candidatePayload: { factor: 1.08 },
  learningTarget: 'context_factor',
  learningMaturity: 'guarded_live_tuning',
  publishAnchor: 'guarded_runtime_auto_publish',
  automationMaturity: 'auto_publish',
  requestedRuntimeEffect: 'bounded_calibration',
  evidence: {
    replayPassed: true,
    conflictFree: true,
    rollbackTarget: 'rain-factor-v1',
  },
})

describe('algorithmAssetReleaseExitService', () => {
  it('builds a release package only when publish gate, rollback target, conflict arbitration and adapter are explicit', () => {
    const result = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent: companyCandidate,
      conflictResult: 'supersede_with_rollback_target',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      platformPolicy: {
        impactMonitoringReady: true,
      },
      releaseAdapter: {
        adapterKey: 'durationContextPolicyCompanyOverrideReleaseAdapter',
        targetSurface: 'company_override',
        supportsRollback: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'release_package_ready',
      releaseAction: 'handoff_to_domain_release_adapter',
      canHandoffToRuntimeAdapter: true,
      writesRuntimeDirectly: false,
      targetSurface: 'company_override',
    }))
    expect(result.releasePackage).toEqual(expect.objectContaining({
      assetKey: 'duration.context.rain_factor',
      scopeType: 'company',
      rollbackTarget: 'rain-factor-v1',
      adapterKey: 'durationContextPolicyCompanyOverrideReleaseAdapter',
      targetSurface: 'company_override',
    }))
  })

  it('builds a canary package only when the canary gate release adapter monitoring and rollback target are explicit', () => {
    const canaryCandidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.weather_multiplier',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: 'company-a',
      candidatePayload: { factor: 1.04 },
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v3',
      },
    })

    const result = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent: canaryCandidate,
      conflictResult: 'no_conflict_publish_allowed',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      platformPolicy: {
        impactMonitoringReady: true,
      },
      releaseAdapter: {
        adapterKey: 'durationContextPolicyCompanyCanaryAdapter',
        targetSurface: 'company_override',
        supportsRollback: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'canary_package_ready',
      releaseAction: 'handoff_to_domain_canary_adapter',
      canHandoffToRuntimeAdapter: true,
      writesRuntimeDirectly: false,
      targetSurface: 'company_override',
    }))
    expect(result.releasePackage).toEqual(expect.objectContaining({
      assetKey: 'duration.context.weather_multiplier',
      scopeType: 'company',
      rollbackTarget: 'weather-multiplier-v3',
      adapterKey: 'durationContextPolicyCompanyCanaryAdapter',
      targetSurface: 'company_override',
    }))
  })

  it('blocks non-system release handoff when impact monitoring is not explicit', () => {
    const result = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent: companyCandidate,
      conflictResult: 'supersede_with_rollback_target',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      releaseAdapter: {
        adapterKey: 'durationContextPolicyCompanyOverrideReleaseAdapter',
        targetSurface: 'company_override',
        supportsRollback: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'review_required',
      releaseAction: 'review_package_only',
      canHandoffToRuntimeAdapter: false,
      writesRuntimeDirectly: false,
      targetSurface: 'company_override',
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'impact_monitoring_required',
    ]))
    expect(result.releasePackage).toBeNull()
  })

  it('blocks publish-ready candidates when no explicit domain release adapter exists', () => {
    const result = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent: companyCandidate,
      conflictResult: 'supersede_with_rollback_target',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'review_required',
      releaseAction: 'review_package_only',
      canHandoffToRuntimeAdapter: false,
      writesRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'release_adapter_required',
    ]))
    expect(result.releasePackage).toBeNull()
  })

  it('keeps manual-anchor conflicts out of release packages even after replay passes', () => {
    const result = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent: companyCandidate,
      conflictResult: 'manual_governance_required',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'existing_published_rule_continues',
      },
      releaseAdapter: {
        adapterKey: 'durationContextPolicyCompanyOverrideReleaseAdapter',
        targetSurface: 'company_override',
        supportsRollback: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'manual_governance_required',
      releaseAction: 'review_package_only',
      canHandoffToRuntimeAdapter: false,
      writesRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'manual_anchor_or_existing_rule_blocks_release_exit',
    ]))
  })

  it('does not treat system-curated publish decisions as system published without platform policy and monitoring', () => {
    const systemCandidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'system.duration.shared_baseline',
      sourceSystem: 'algorithmAssetColdStartBaselineService',
      assetType: 'calibration',
      companyId: 'platform-company-scope',
      learningTarget: 'base_duration',
      learningMaturity: 'system_curated_learning',
      publishAnchor: 'system_curated_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        crossCompanyReplayPassed: true,
        anchorUpgradeStrategy: 'system-curated-baseline-v1',
        rollbackTarget: 'shared-baseline-v1',
      },
    })

    const result = buildAlgorithmAssetReleaseExitPackage({
      candidateEvent: systemCandidate,
      conflictResult: 'no_conflict_publish_allowed',
      replaySummary: {
        replayPassed: true,
        runtimeImpact: 'publish_gate_evidence',
      },
      releaseAdapter: {
        adapterKey: 'systemSeedReleaseAdapter',
        targetSurface: 'system_seed',
        supportsRollback: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'platform_exception_review',
      releaseAction: 'review_package_only',
      canHandoffToRuntimeAdapter: false,
      writesRuntimeDirectly: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'system_auto_publish_policy_required',
      'impact_monitoring_required',
      'platform_release_exit_required',
    ]))
  })
})
