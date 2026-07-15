import { describe, expect, it } from 'vitest'
import { createAlgorithmAssetCandidateEvent } from '../services/algorithmAssetCandidateEventAdapterService.js'
import { arbitrateAlgorithmAssetConflict } from '../services/algorithmAssetConflictService.js'

describe('algorithmAssetConflictService', () => {
  it('allows superseding a same-scope published rule only when candidate publish gate and rollback target are ready', () => {
    const candidate = createAlgorithmAssetCandidateEvent({
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

    const result = arbitrateAlgorithmAssetConflict({
      candidate,
      existingRules: [{
        assetKey: 'duration.context.rain_factor',
        stableCode: 'duration.context.rain_factor',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-rain-factor-v1',
        runtimeWriterKey: 'durationContextRuntimeWriter',
        consumerVerificationRef: 'consumer-duration-context-v1',
        impactMonitoringRef: 'monitor-rain-factor-v1',
        rollbackTarget: 'rain-factor-v1',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      result: 'supersede_with_rollback_target',
      runtimeRule: 'candidate_may_replace_same_scope_published_version',
      activeRuleContinues: false,
    }))
  })

  it('does not treat legacy published names as runtime baselines without unified publication evidence', () => {
    const candidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.weather_multiplier',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: 'company-a',
      candidatePayload: { factor: 1.12 },
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v2',
      },
    })

    const result = arbitrateAlgorithmAssetConflict({
      candidate,
      existingRules: [{
        assetKey: 'duration.context.weather_multiplier',
        stableCode: 'duration.context.weather_multiplier',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        rollbackTarget: 'legacy-weather-v1',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      result: 'shadow_compare_only',
      runtimeRule: 'candidate_blocked_from_runtime',
      activeRuleContinues: false,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'existing_published_rule_missing_unified_publication_evidence',
      'existing_published_rule_requires_legacy_audit_before_runtime_arbitration',
    ]))
  })

  it('keeps existing manual-anchor rules active and emits manual governance instead of overwrite', () => {
    const candidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'critical.path.manual.rule',
      sourceSystem: 'constructionDependencyRuleSystemService',
      assetType: 'rule',
      companyId: 'company-a',
      candidatePayload: { dependencyRule: 'A before B' },
      learningTarget: 'dependency_order',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'dependency-v3',
      },
    })

    const result = arbitrateAlgorithmAssetConflict({
      candidate,
      existingRules: [{
        assetKey: 'critical.path.manual.rule',
        stableCode: 'critical.path.manual.rule',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        publishAnchor: 'manual_review_required_before_publish',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-critical-path-v1',
        runtimeWriterKey: 'constructionDependencyRuleRuntimeWriter',
        consumerVerificationRef: 'consumer-dependency-rule-v1',
        impactMonitoringRef: 'monitor-critical-path-v1',
        rollbackTarget: 'critical-path-v1',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      result: 'manual_governance_required',
      runtimeRule: 'existing_active_or_published_rule_continues',
      activeRuleContinues: true,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'existing_rule_has_manual_publish_anchor',
    ]))
  })

  it('detects semantic conflicts when a candidate targets an existing stable code under a different asset key', () => {
    const candidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.weather_multiplier.candidate.v2',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: 'company-a',
      candidatePayload: {
        stableCode: 'duration.context.weather_multiplier',
        targetSurface: 'duration_context_runtime',
        factor: 1.12,
      },
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'weather-multiplier-v2',
      },
    })

    const result = arbitrateAlgorithmAssetConflict({
      candidate,
      existingRules: [{
        assetKey: 'legacy.weather.factor',
        stableCode: 'duration.context.weather_multiplier',
        semanticCode: 'duration.context.weather_multiplier',
        targetSurface: 'duration_context_runtime',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        publishAnchor: 'manual_review_required_before_publish',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-weather-v1',
        runtimeWriterKey: 'durationContextRuntimeWriter',
        consumerVerificationRef: 'consumer-weather-v1',
        impactMonitoringRef: 'monitor-weather-v1',
        rollbackTarget: 'weather-v1',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      result: 'manual_governance_required',
      runtimeRule: 'existing_active_or_published_rule_continues',
      activeRuleContinues: true,
    }))
    expect(result.conflictingRules).toHaveLength(1)
    expect(result.reasons).toEqual(expect.arrayContaining([
      'semantic_conflict_with_existing_stable_rule',
      'existing_rule_has_manual_publish_anchor',
    ]))
  })

  it('quarantines project candidates that try to replace company or system rules', () => {
    const candidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.site_pressure',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePayload: { factor: 1.15 },
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'site-pressure-v4',
      },
    })

    const result = arbitrateAlgorithmAssetConflict({
      candidate,
      existingRules: [{
        assetKey: 'duration.context.site_pressure',
        stableCode: 'duration.context.site_pressure',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-site-pressure-v3',
        runtimeWriterKey: 'durationContextRuntimeWriter',
        consumerVerificationRef: 'consumer-site-pressure-v3',
        impactMonitoringRef: 'monitor-site-pressure-v3',
        rollbackTarget: 'site-pressure-v3',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      result: 'quarantine_required',
      runtimeRule: 'candidate_blocked_from_runtime',
      activeRuleContinues: true,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'project_candidate_cannot_replace_company_or_system_rule',
    ]))
  })

  it('keeps LLM or review-only candidates in shadow comparison against existing published rules', () => {
    const candidate = createAlgorithmAssetCandidateEvent({
      assetKey: 'llm.generated.template_rule',
      sourceSystem: 'llmTemplateCandidateGenerator',
      assetType: 'template',
      companyId: 'company-a',
      generatedBy: 'llm',
      candidatePayload: { templateCode: 'LLM-TPL-1' },
      learningTarget: 'template_structure',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'template-v1',
      },
    })

    const result = arbitrateAlgorithmAssetConflict({
      candidate,
      existingRules: [{
        assetKey: 'llm.generated.template_rule',
        stableCode: 'llm.generated.template_rule',
        lifecycleStatus: 'published',
        scopeType: 'company',
        companyId: 'company-a',
        runtimePublicationStatus: 'runtime_published',
        releaseRecordId: 'release-template-v1',
        runtimeWriterKey: 'wbsTemplateRuntimeWriter',
        consumerVerificationRef: 'consumer-template-v1',
        impactMonitoringRef: 'monitor-template-v1',
        rollbackTarget: 'template-v1',
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      result: 'shadow_compare_only',
      runtimeRule: 'existing_active_or_published_rule_continues',
      activeRuleContinues: true,
    }))
    expect(result.reasons).toEqual(expect.arrayContaining([
      'candidate_governance_decision_cannot_write_runtime',
    ]))
  })
})
