import { describe, expect, it } from 'vitest'
import {
  evaluateAlgorithmAssetGovernanceRequest,
  normalizeAlgorithmAssetGovernanceRequest,
} from '../services/algorithmAssetGovernanceProtocolService.js'

describe('algorithmAssetGovernanceProtocolService', () => {
  it('defaults missing governance fields to conservative candidate-only review', () => {
    const normalized = normalizeAlgorithmAssetGovernanceRequest({
      assetKey: 'durationContextPolicyLearningService',
      sourceSystem: 'durationContextPolicyLearningJob',
      requestedRuntimeEffect: 'direct_effect_request',
    })

    expect(normalized).toEqual(expect.objectContaining({
      publishAnchor: 'candidate_only',
      automationMaturity: 'manual_required',
      learningMaturity: 'shadow_report_only',
      learningTarget: 'governance_report',
    }))

    const decision = evaluateAlgorithmAssetGovernanceRequest(normalized)

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'missing_publish_anchor_defaults_to_candidate_only',
      'missing_automation_maturity_defaults_to_manual_required',
    ]))
  })

  it('keeps manual anchors as runtime blockers and emits unlock criteria instead of publishing', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'criticalPathDependencyRule',
      sourceSystem: 'constructionDependencyRuleSystemService',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_shadow',
      learningMaturity: 'governed_candidate',
      learningTarget: 'dependency_order',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'dependency-rule-v4',
        singleCandidateOnly: true,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'manual_governance_required',
      runtimeAction: 'shadow_compare_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.unlockCriteria).toEqual(expect.arrayContaining([
      'register_anchor_upgrade_strategy',
      'collect_cross_project_or_cross_company_replay',
      'versioned_governance_audit_required',
    ]))
  })

  it('allows trusted-source auto publish only when maturity and source health evidence are explicit', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'certificateTemplatePolicyUpdateService',
      sourceSystem: 'certificateTemplatePolicyUpdateService',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        sourceHealthPassed: true,
        rollbackTarget: 'certificate-policy-v12',
        conflictFree: true,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'publish_allowed',
      runtimeAction: 'write_published_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
    }))
  })

  it('keeps trusted-source requests in review until source health evidence is present', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'certificateTemplatePolicyUpdateService',
      sourceSystem: 'certificateTemplatePolicyUpdateService',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        rollbackTarget: 'certificate-policy-v12',
        conflictFree: true,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'review_package_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'publish_gate_evidence_incomplete',
    ]))
  })

  it('routes guarded runtime candidates through canary and stable replay-backed maturity gates', () => {
    const canaryDecision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'duration.context.weather_multiplier',
      sourceSystem: 'durationContextService',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'context_factor',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v3',
      },
    })

    expect(canaryDecision).toEqual(expect.objectContaining({
      status: 'canary_allowed',
      runtimeAction: 'write_canary_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
    }))

    const stableDecision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'duration.context.weather_multiplier',
      sourceSystem: 'durationContextService',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'context_factor',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v3',
      },
    })

    expect(stableDecision).toEqual(expect.objectContaining({
      status: 'publish_allowed',
      runtimeAction: 'write_published_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
    }))

    const missingReplayDecision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'duration.context.weather_multiplier',
      sourceSystem: 'durationContextService',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'context_factor',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v3',
      },
    })

    expect(missingReplayDecision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'review_package_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(missingReplayDecision.reasons).toEqual(expect.arrayContaining([
      'publish_gate_evidence_incomplete',
    ]))
  })

  it('keeps no-auto manual queues blocked even when automated governance evidence is otherwise complete', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'criticalPathDependencyRule',
      sourceSystem: 'constructionDependencyRuleSystemService',
      publishAnchor: 'no_unattended_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'dependency_order',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        sourceHealthPassed: true,
        conflictFree: true,
        crossCompanyReplayPassed: true,
        rollbackTarget: 'dependency-rule-v5',
        anchorUpgradeEvaluation: {
          status: 'upgrade_candidate_ready',
          canGenerateVersionedUpgrade: true,
          canModifyPublishAnchor: false,
          canWriteRuntime: false,
          reasons: [],
          unlockCriteria: [],
          versionedUpgrade: {
            assetKey: 'criticalPathDependencyRule',
            strategyKey: 'dependency-rule-auto-publish',
            strategyVersion: 'v2',
            fromPublishAnchor: 'manual_governance_required',
            toPublishAnchor: 'guarded_runtime_auto_publish',
            fromAutomationMaturity: 'manual_required',
            toAutomationMaturity: 'auto_publish',
            rollbackTarget: 'dependency-rule-v5',
            auditRecordId: 'audit-dependency-rule-v5',
            impactScope: {
              projectCount: 18,
              companyCount: 4,
              scenarioCount: 9,
            },
          },
        },
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'manual_governance_required',
      runtimeAction: 'shadow_compare_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'legacy_publish_anchor_no_unattended_runtime_auto_publish_mapped_to_manual_governance_required',
    ]))
  })

  it('does not infer auto-publish rights from LLM or auto-governance naming', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'llmGeneratedDurationMultiplier',
      sourceSystem: 'llmAutoGovernancePublisher',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'context_factor',
      requestedRuntimeEffect: 'direct_effect_request',
      generatedBy: 'llm',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'duration-context-v2',
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'llm_generated_payload_requires_candidate_or_quarantine',
      'missing_publish_anchor_defaults_to_candidate_only',
    ]))
  })

  it('treats legacy local publication status markers as review-only evidence instead of publish permission', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'certificate.template.published_profile.legacy',
      sourceSystem: 'certificateTemplatePolicyUpdateService',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'bounded_calibration',
      candidatePayload: {
        localStatus: 'auto_published',
        profileStatus: 'published profile',
        defaultProfile: true,
      },
      evidence: {
        sourceHealthPassed: true,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'certificate-template-profile-v1',
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'legacy_local_publication_status_detected',
      'legacy_local_publication_status_requires_unified_publication_evidence',
    ]))
  })

  it('treats legacy boolean default or active markers as review-only publication evidence', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'wbs.template.default_profile.legacy',
      sourceSystem: 'wbsTemplateFeedbackGovernance',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'bounded_calibration',
      candidatePayload: {
        defaultProfile: true,
        isActive: true,
      },
      evidence: {
        sourceHealthPassed: true,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'wbs-template-default-profile-v1',
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'legacy_local_publication_status_detected',
      'legacy_local_publication_status_requires_unified_publication_evidence',
    ]))
  })

  it('requires anchor upgrade strategy before changing manual-required assets to auto-publish', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'riskIssueWarningRule',
      sourceSystem: 'warningImpactSignalService',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'risk_warning',
      requestedRuntimeEffect: 'direct_effect_request',
      requestAnchorUpgrade: true,
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'risk-warning-v9',
        crossCompanyReplayPassed: true,
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'manual_governance_required',
      runtimeAction: 'review_package_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'anchor_upgrade_strategy_required',
    ]))
  })

  it('does not accept a bare anchorUpgradeStrategy string as system publish evidence', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'system.duration.shared_baseline',
      sourceSystem: 'algorithmAssetColdStartBaselineService',
      publishAnchor: 'system_curated_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'base_duration',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        crossCompanyReplayPassed: true,
        anchorUpgradeStrategy: 'system-curated-baseline-v1',
        rollbackTarget: 'shared-baseline-v1',
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'review_package_only',
      canWriteRuntime: false,
      canModifyPublishAnchor: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'anchor_upgrade_strategy_evaluation_required',
    ]))
  })

  it('accepts system curated publish evidence only after a versioned anchor upgrade evaluation is ready', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'system.duration.shared_baseline',
      sourceSystem: 'algorithmAssetColdStartBaselineService',
      publishAnchor: 'system_curated_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'system_curated_learning',
      learningTarget: 'base_duration',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        crossCompanyReplayPassed: true,
        rollbackTarget: 'shared-baseline-v1',
        anchorUpgradeEvaluation: {
          status: 'upgrade_candidate_ready',
          canGenerateVersionedUpgrade: true,
          canModifyPublishAnchor: false,
          canWriteRuntime: false,
          reasons: [],
          unlockCriteria: [],
          versionedUpgrade: {
            assetKey: 'system.duration.shared_baseline',
            strategyKey: 'shared-baseline-system-curation',
            strategyVersion: 'v2',
            fromPublishAnchor: 'manual_governance_required',
            toPublishAnchor: 'system_curated_publish',
            fromAutomationMaturity: 'manual_required',
            toAutomationMaturity: 'auto_publish',
            rollbackTarget: 'shared-baseline-v1',
            auditRecordId: 'audit-shared-baseline-v2',
            impactScope: {
              projectCount: 24,
              companyCount: 6,
              scenarioCount: 12,
            },
          },
        },
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'publish_allowed',
      runtimeAction: 'write_published_version',
      canWriteRuntime: true,
      canModifyPublishAnchor: false,
    }))
  })

  it('quarantines candidates that reintroduce deleted legacy scope object fields', () => {
    const decision = evaluateAlgorithmAssetGovernanceRequest({
      assetKey: 'legacyScopeOverrideCandidate',
      sourceSystem: 'legacyScopeAdapter',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'template_structure',
      requestedRuntimeEffect: 'direct_effect_request',
      candidatePayload: {
        zone_object_id: 'legacy-zone-1',
        scope_dimensions: [{ type: 'zone', value: 'A区' }],
      },
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'template-structure-v3',
      },
    })

    expect(decision).toEqual(expect.objectContaining({
      status: 'quarantine_required',
      runtimeAction: 'quarantine',
      canWriteRuntime: false,
    }))
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'legacy_scope_object_field_detected',
    ]))
  })
})
