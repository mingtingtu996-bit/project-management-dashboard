import { describe, expect, it } from 'vitest'
import { evaluateAlgorithmSeedCandidate } from '../services/algorithmSeedAutoGovernanceService.js'
import { buildAlgorithmSeedCandidateQuality } from '../services/algorithmSeedLearningService.js'
import { validateAlgorithmSeedRuntimePayload } from '../services/algorithmSeedValidationService.js'

const validDurationPayload = {
  stableCode: 'process_duration:02-01-03-P07',
  standardWorkCodes: ['02-01-03-P07'],
  standardCatalogCodePrefixes: ['02-01-03-P07'],
  defaultDaysP50: 6,
  durationContributionMode: 'duration_bearing',
  baseDaysEligible: true,
  sourceStandard: 'duration_experience_samples',
  sourceVersion: 'project_history',
  sourceClauseRef: 'duration_experience_samples.closed_loop',
  evidenceSourceKeys: ['duration_experience_samples:closed_loop'],
  evidenceQuality: {
    source_type: 'runtime_sample',
    source_doc: 'duration_experience_samples',
    source_url: null,
    evidence_source_keys: ['duration_experience_samples:closed_loop'],
    last_review_date: '2026-05-27',
    applicable_region_scope: 'project',
  },
  seedRuleId: 'duration:02-01-03-P07',
  ruleVersion: 1,
  isActive: true,
  webVerified: true,
  reviewNeeded: false,
}

describe('algorithm seed governance quality contracts', () => {
  it('classifies runtime payload validation issues by governance action', () => {
    const validation = validateAlgorithmSeedRuntimePayload('standard_work_duration', {
      stableCode: 'invalid-duration',
      defaultDaysP50: 6,
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
    }, { stableCode: 'invalid-duration', strict: true })

    expect(validation.ok).toBe(false)
    expect(validation.issueSummary).toEqual(expect.objectContaining({
      errorCount: expect.any(Number),
      quarantineCount: expect.any(Number),
      reviewCount: expect.any(Number),
      warningCount: expect.any(Number),
    }))
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'RECORD_EVIDENCE_INCOMPLETE',
        governanceAction: 'quarantine',
      }),
      expect.objectContaining({
        code: 'MISSING_SOURCE_REFERENCE',
        governanceAction: 'quarantine',
      }),
    ]))
  })

  it('computes candidate quality from sample, conflict, and replay evidence', () => {
    const quality = buildAlgorithmSeedCandidateQuality({
      seedType: 'standard_work_duration',
      candidatePayload: validDurationPayload,
      sampleCount: 12,
      variance: 0.12,
      confidenceLevel: 'high',
      evidenceSummary: {
        replayTruePositiveRate: 0.82,
        replayFalsePositiveRate: 0.08,
        conflictCount: 1,
        crossProjects: 2,
      },
    })

    expect(quality).toEqual(expect.objectContaining({
      sampleQualityScore: expect.any(Number),
      conflictScore: expect.any(Number),
      replayEvidenceScore: expect.any(Number),
      overallQualityScore: expect.any(Number),
      qualityLevel: expect.stringMatching(/high|medium|low/),
    }))
    expect(quality.overallQualityScore).toBeGreaterThan(70)
  })

  it('includes policy and quality audit data in auto-governance decisions', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-1',
      seed_type: 'standard_internal_flow',
      stable_code: 'flow:mock',
      candidate_payload: {
        stableCode: 'flow:mock',
        standardWorkCodes: ['02-01-03-P07'],
        sourceStandard: 'execution_history',
        sourceVersion: 'project_history',
        sourceClauseRef: 'paired_execution',
        evidenceSourceKeys: ['paired_execution'],
        evidenceQuality: {
          source_type: 'runtime_sample',
          source_doc: 'paired_execution',
          source_url: null,
          evidence_source_keys: ['paired_execution'],
          last_review_date: '2026-05-27',
          applicable_region_scope: 'project',
        },
        seedRuleId: 'flow:mock',
        ruleVersion: 1,
        isActive: true,
        webVerified: true,
        reviewNeeded: false,
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 30,
      variance: 0.1,
      confidence_level: 'high',
      evidence_summary: { replayTruePositiveRate: 0.9, replayFalsePositiveRate: 0.04 },
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('candidate_only')
    expect(decision.audit.policy).toEqual(expect.objectContaining({
      candidateOnly: true,
      autoPublishEnabled: false,
      promotionBoundary: 'curated_seed_or_enterprise_standard_library',
    }))
    expect(decision.audit.candidateQuality).toEqual(expect.objectContaining({
      overallQualityScore: expect.any(Number),
      replayEvidenceScore: expect.any(Number),
    }))
  })

  it('uses validation governance actions as auto-publish release gates', () => {
    const decision = evaluateAlgorithmSeedCandidate({
      id: 'candidate-validation-gate',
      seed_type: 'standard_work_duration',
      stable_code: 'process_duration:02-01-03-P07',
      candidate_payload: {
        stableCode: 'process_duration:02-01-03-P07',
        standardWorkCodes: ['02-01-03-P07'],
        defaultDaysP50: 6,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
      },
      candidate_source: 'project_history',
      project_id: 'project-1',
      company_id: 'company-1',
      sample_count: 50,
      variance: 0.05,
      confidence_level: 'high',
      evidence_summary: {
        replayTruePositiveRate: 0.92,
        replayFalsePositiveRate: 0.02,
      },
      action_policy: 'auto_govern',
    })

    expect(decision.status).toBe('quarantined')
    expect(decision.shouldPublish).toBe(false)
    expect(decision.quarantineReason).toBe('validation_quarantine_required')
    expect(decision.audit.validationGate).toEqual(expect.objectContaining({
      ok: false,
      releaseGate: 'quarantine',
      issueSummary: expect.objectContaining({
        quarantineCount: expect.any(Number),
      }),
    }))
  })

  it('stores replay evaluation evidence in candidate quality audit', () => {
    const quality = buildAlgorithmSeedCandidateQuality({
      seedType: 'risk_issue_warning_rule',
      candidatePayload: {
        stableCode: 'risk_issue_warning:test',
        sourceStandard: 'warning_replay',
        sourceVersion: 'history',
        sourceClauseRef: 'warning_replay.closed_loop',
        evidenceSourceKeys: ['warning_replay.closed_loop'],
      },
      sampleCount: 20,
      variance: 0.4,
      confidenceLevel: 'medium',
      evidenceSummary: {
        replayTruePositiveRate: 0.76,
        replayFalsePositiveRate: 0.05,
        replayWindowDays: 90,
        replayCaseCount: 60,
        conflictCount: 0,
      },
    })

    expect(quality.factors).toEqual(expect.objectContaining({
      replayTruePositiveRate: 0.76,
      replayFalsePositiveRate: 0.05,
      replayWindowDays: 90,
      replayCaseCount: 60,
      qualityWeights: expect.objectContaining({
        replay: 0.55,
      }),
    }))
  })
})
