import { describe, expect, it } from 'vitest'
import {
  createAlgorithmAssetCandidateEvent,
  createAndPersistAlgorithmAssetCandidateEvent,
} from '../services/algorithmAssetCandidateEventAdapterService.js'

describe('algorithmAssetCandidateEventAdapterService', () => {
  it('normalizes scoped learning candidates into governance protocol decisions', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.rain_factor',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: 'company-a',
      projectId: 'project-a1',
      candidatePayload: { factor: 1.08 },
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'rain-factor-v1',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      assetKey: 'duration.context.rain_factor',
      scopeType: 'project',
      companyId: 'company-a',
      projectId: 'project-a1',
      lifecycleStatus: 'canary_ready',
      runtimeEffectPolicy: 'bounded_calibration',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_canary',
      learningMaturity: 'guarded_live_tuning',
      learningTarget: 'context_factor',
    }))
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'canary_allowed',
      canWriteRuntime: true,
      runtimeAction: 'write_canary_version',
    }))
  })

  it('keeps no-scope runtime candidates as system observations instead of company runtime rules', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.unknown_scope_factor',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      candidatePayload: { factor: 1.12 },
      learningTarget: 'context_factor',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'unknown-scope-v1',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      scopeType: 'system_observation',
      lifecycleStatus: 'review_required',
      runtimeEffectPolicy: 'candidate_only',
    }))
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'review_required',
      canWriteRuntime: false,
      runtimeAction: 'candidate_only',
    }))
    expect(event.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'missing_scope_defaults_to_system_observation',
    ]))
  })

  it('requires an explicit system release scope before no-company candidates can keep publish anchors', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'certificate.policy_update.province_profile:guangdong',
      sourceSystem: 'certificateTemplatePolicyReleaseAdapter',
      assetType: 'template',
      allowSystemReleaseScope: true,
      candidatePayload: { profileVersion: 'cert-v1-policy-auto-20260901' },
      learningTarget: 'template_structure',
      learningMaturity: 'system_curated_learning',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        sourceHealthPassed: true,
        conflictFree: true,
        rollbackTarget: 'certificate-template-seed:v1',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      scopeType: 'system',
      lifecycleStatus: 'published_ready',
      runtimeEffectPolicy: 'bounded_calibration',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
    }))
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'publish_allowed',
      canWriteRuntime: true,
      runtimeAction: 'write_published_version',
    }))
    expect(event.governanceDecision.reasons).not.toContain('missing_scope_defaults_to_system_observation')
  })

  it('routes llm generated candidate payloads to review even when replay evidence exists', () => {
    const event = createAlgorithmAssetCandidateEvent({
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

    expect(event.lifecycleStatus).toBe('review_required')
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'review_required',
      canWriteRuntime: false,
    }))
    expect(event.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'llm_generated_payload_requires_candidate_or_quarantine',
    ]))
  })

  it('quarantines candidate events that contain deleted range-tree compatibility fields', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'legacy.zone.template_candidate',
      sourceSystem: 'wbsTemplateCandidateEventService',
      assetType: 'template',
      companyId: 'company-a',
      candidatePayload: {
        zone_object_id: 'old-zone-1',
        scope_dimensions: [{ type: 'zone', value: 'A区' }],
      },
      learningTarget: 'template_structure',
      learningMaturity: 'guarded_live_tuning',
      publishAnchor: 'guarded_runtime_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'template-v2',
      },
    })

    expect(event.lifecycleStatus).toBe('quarantined')
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'quarantine_required',
      runtimeAction: 'quarantine',
      canWriteRuntime: false,
    }))
  })

  it('keeps legacy local publication status markers in review instead of published-ready', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'certificate.template.published_profile.legacy',
      sourceSystem: 'certificateTemplatePolicyUpdateService',
      assetType: 'template',
      companyId: 'company-a',
      candidatePayload: {
        localStatus: 'published',
        profileStatus: 'published profile',
        defaultProfile: true,
      },
      learningTarget: 'template_structure',
      learningMaturity: 'system_curated_learning',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        sourceHealthPassed: true,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'certificate-template-profile-v1',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      lifecycleStatus: 'review_required',
      runtimeEffectPolicy: 'candidate_only',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
    }))
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
    }))
    expect(event.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'legacy_local_publication_status_detected',
      'legacy_local_publication_status_requires_unified_publication_evidence',
    ]))
  })

  it('keeps legacy boolean default or active markers in review instead of published-ready', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'wbs.template.default_profile.legacy',
      sourceSystem: 'wbsTemplateFeedbackGovernance',
      assetType: 'template',
      companyId: 'company-a',
      candidatePayload: {
        defaultProfile: true,
        activeRule: true,
      },
      learningTarget: 'template_structure',
      learningMaturity: 'system_curated_learning',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
      requestedRuntimeEffect: 'bounded_calibration',
      evidence: {
        sourceHealthPassed: true,
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'wbs-template-default-profile-v1',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      lifecycleStatus: 'review_required',
      runtimeEffectPolicy: 'candidate_only',
      publishAnchor: 'trusted_source_auto_publish',
      automationMaturity: 'auto_publish',
    }))
    expect(event.governanceDecision).toEqual(expect.objectContaining({
      status: 'review_required',
      runtimeAction: 'candidate_only',
      canWriteRuntime: false,
    }))
    expect(event.governanceDecision.reasons).toEqual(expect.arrayContaining([
      'legacy_local_publication_status_detected',
      'legacy_local_publication_status_requires_unified_publication_evidence',
    ]))
  })

  it('maps legacy manual publish policy strings into manual governance unlock packages', () => {
    const event = createAlgorithmAssetCandidateEvent({
      assetKey: 'critical.path.manual.rule',
      sourceSystem: 'constructionDependencyRuleSystemService',
      assetType: 'rule',
      companyId: 'company-a',
      candidatePayload: { dependencyRule: 'A before B' },
      learningTarget: 'dependency_order',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_review_required_before_publish',
      automationMaturity: 'auto_shadow',
      requestedRuntimeEffect: 'direct_effect_request',
      evidence: {
        replayPassed: true,
        conflictFree: true,
        rollbackTarget: 'dependency-v3',
      },
    })

    expect(event).toEqual(expect.objectContaining({
      publishAnchor: 'manual_governance_required',
      lifecycleStatus: 'review_required',
    }))
    expect(event.governanceDecision.unlockCriteria).toEqual(expect.arrayContaining([
      'register_anchor_upgrade_strategy',
      'collect_cross_project_or_cross_company_replay',
      'versioned_governance_audit_required',
    ]))
  })

  it('keeps multi-source self-learning intake candidate-only by default across rule asset surfaces', () => {
    const sources = [
      {
        assetKey: 'algorithm.seed.duration_candidate',
        sourceSystem: 'algorithmSeedCandidateDiscoveryService',
        assetType: 'seed' as const,
        learningTarget: 'base_duration' as const,
      },
      {
        assetKey: 'wbs.template.feedback_candidate',
        sourceSystem: 'wbsTemplateCandidateEventService',
        assetType: 'template' as const,
        learningTarget: 'template_structure' as const,
      },
      {
        assetKey: 'certificate.template.policy_candidate',
        sourceSystem: 'certificateTemplatePolicyUpdateService',
        assetType: 'template' as const,
        learningTarget: 'template_structure' as const,
      },
      {
        assetKey: 'acceptance.template.policy_candidate',
        sourceSystem: 'acceptanceTemplatePolicyUpdateService',
        assetType: 'template' as const,
        learningTarget: 'template_structure' as const,
      },
      {
        assetKey: 'weather.forecast.impact_candidate',
        sourceSystem: 'weatherForecastImpactService',
        assetType: 'calibration' as const,
        learningTarget: 'context_factor' as const,
      },
      {
        assetKey: 'duration.context.factor_candidate',
        sourceSystem: 'durationContextPolicyLearningService',
        assetType: 'calibration' as const,
        learningTarget: 'context_factor' as const,
      },
      {
        assetKey: 'risk.issue.warning_candidate',
        sourceSystem: 'riskIssueWarningGovernanceSignalService',
        assetType: 'signal' as const,
        learningTarget: 'risk_warning' as const,
      },
      {
        assetKey: 'project.health.explanation_candidate',
        sourceSystem: 'projectHealthDeviationSummaryService',
        assetType: 'rule' as const,
        learningTarget: 'governance_report' as const,
      },
      {
        assetKey: 'metric.registry.caliber_candidate',
        sourceSystem: 'metricRegistryService',
        assetType: 'rule' as const,
        learningTarget: 'metric_caliber' as const,
      },
    ]

    for (const source of sources) {
      const event = createAlgorithmAssetCandidateEvent({
        ...source,
        companyId: 'company-a',
        candidatePayload: { proposedValue: 'candidate-only-default' },
        requestedRuntimeEffect: 'direct_effect_request',
      })

      expect(event, source.sourceSystem).toEqual(expect.objectContaining({
        scopeType: 'company',
        runtimeEffectPolicy: 'candidate_only',
        lifecycleStatus: 'review_required',
        publishAnchor: 'candidate_only',
        automationMaturity: 'manual_required',
      }))
      expect(event.governanceDecision, source.sourceSystem).toEqual(expect.objectContaining({
        runtimeAction: 'candidate_only',
        canWriteRuntime: false,
      }))
      expect(event.governanceDecision.reasons, source.sourceSystem).toEqual(expect.arrayContaining([
        'missing_publish_anchor_defaults_to_candidate_only',
        'missing_automation_maturity_defaults_to_manual_required',
      ]))
    }
  })

  it('preserves each learning maturity class on candidate events without collapsing them', () => {
    const maturityCases = [
      'frozen_constant',
      'shadow_report_only',
      'governed_candidate',
      'guarded_live_tuning',
      'system_curated_learning',
    ] as const

    const events = maturityCases.map((learningMaturity) => createAlgorithmAssetCandidateEvent({
      assetKey: `learning.maturity.${learningMaturity}`,
      sourceSystem: 'algorithmAssetLearningMaturityTestHarness',
      assetType: 'rule',
      companyId: 'company-a',
      candidatePayload: { learningMaturity },
      learningTarget: 'governance_report',
      learningMaturity,
      publishAnchor: 'candidate_only',
      automationMaturity: 'manual_required',
      requestedRuntimeEffect: 'candidate_only',
    }))

    expect(events.map((event) => event.learningMaturity)).toEqual([...maturityCases])
    for (const event of events) {
      expect(event).toEqual(expect.objectContaining({
        lifecycleStatus: 'review_required',
        runtimeEffectPolicy: 'candidate_only',
        publishAnchor: 'candidate_only',
        automationMaturity: 'manual_required',
      }))
      expect(event.governanceDecision.canWriteRuntime).toBe(false)
    }
  })

  it('can persist normalized candidate events through the unified governance persistence contract', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return [{ id: 'candidate-row-id' }] as T[]
      }
      return [] as T[]
    }

    const result = await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: 'duration.context.persisted_factor',
      sourceSystem: 'durationContextPolicyLearningService',
      assetType: 'calibration',
      companyId: 'company-a',
      candidatePayload: { factor: 1.05 },
      learningTarget: 'context_factor',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'manual_review_required_before_publish',
      automationMaturity: 'auto_review_package',
      requestedRuntimeEffect: 'bounded_calibration',
      queryExec,
    })

    expect(result.event).toEqual(expect.objectContaining({
      assetKey: 'duration.context.persisted_factor',
      scopeType: 'company',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
    }))
    expect(result.persistence).toEqual({
      persisted: true,
      candidateEventId: 'candidate-row-id',
    })
    const sql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(sql).toContain('insert into public.algorithm_asset_candidate_events')
    expect(sql).not.toContain('algorithm_seed_records')
    expect(sql).not.toContain('task_dependencies')
  })
})
