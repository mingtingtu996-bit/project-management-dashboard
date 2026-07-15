import { describe, expect, it } from 'vitest'

import {
  publishStandardWorkDurationSeedVersion,
  rollbackStandardWorkDurationSeedVersion,
  type StandardWorkDurationSeedPublicationQueryExec,
} from '../services/standardWorkDurationSeedPublicationService.js'
import type {
  StandardWorkDurationSeedPublicationReadiness,
} from '../services/standardWorkDurationSeedReplayCandidateBridgeService.js'

const readyPublication: StandardWorkDurationSeedPublicationReadiness = {
  status: 'standard_work_seed_publication_ready',
  liveLearningEvidence: {
    assetClassificationRegistered: true,
    predictionEventRecorded: true,
    actualOutcomeEventRecorded: true,
    tieredLearningPolicyRegistered: true,
    enabledLearningScopes: ['global', 'industry', 'company', 'project'],
    runtimeConsumerUsesPublishedArtifact: true,
    trustedReplayOrReviewCandidatePresent: true,
    approvedReplayCandidateRecorded: true,
    seedReplayReportOnly: true,
    seedWritePolicyPreserved: true,
    seedPublicationWriterReady: true,
    seedVersionLineageRecorded: true,
    releaseExitApproved: true,
    impactMonitoringReady: true,
    rollbackTargetReady: true,
    accuracyMetricsAvailable: true,
  },
  seedVersionLineage: {
    seedType: 'standard_work_duration',
    seedVersionId: 'seed-version-standard-work-duration-v2',
    runtimePublicationKey: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
    rollbackTarget: 'algorithm_seed_versions:seed-version-standard-work-duration-v1',
    replayReportCode: 'standard_work_duration_seed_p50_replay',
    governanceReportCode: 'standard_work_duration_seed_replay_governance',
    approvedCandidateIds: ['candidate-standard-duration-1'],
    sourceSampleIds: ['duration-sample-1', 'duration-sample-2'],
  },
  missingReasons: [],
}

const approvedCandidatePayload = {
  stableCode: 'process_duration:cast_in_place_concrete',
  seedRuleId: 'process_duration:cast_in_place_concrete',
  ruleVersion: 2,
  isActive: true,
  standardWorkCodes: ['02-01-03-P07'],
  keywords: ['02-01-03-P07', 'cast in place concrete'],
  defaultDays: 9,
  defaultDaysP50: 9,
  durationContributionMode: 'duration_bearing',
  baseDaysEligible: true,
  fixedDays: 2,
  variableDays: 7,
  scaleBasis: 'workface',
  confidence: 'medium',
  benchmarkBasis: 'Replay median actual duration from completed benchmark samples.',
  sourceStandard: 'enterprise_duration_replay',
  sourceVersion: 'v1.4.22.5-standard-work-duration-seed-publication',
  sourceClauseRef: 'duration_experience_samples.actual_duration',
  evidenceSourceKeys: ['duration_experience_samples:duration-sample-1'],
  evidenceQuality: {
    source_type: 'enterprise_practice',
    source_doc: 'duration_experience_samples',
    source_url: null,
    evidence_source_keys: ['duration_experience_samples:duration-sample-1'],
    applicable_region_scope: 'company',
  },
  webVerified: false,
  reviewNeeded: false,
}

describe('standardWorkDurationSeedPublicationService', () => {
  it('publishes an approved standard-work duration seed version without mutating tasks, baselines, monthly plans, or progress facts', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec: StandardWorkDurationSeedPublicationQueryExec = async (sql, params) => {
      calls.push({ sql, params })
      return []
    }

    const result = await publishStandardWorkDurationSeedVersion({
      readiness: readyPublication,
      seedVersion: 'v1.4.22.5-standard-work-duration-live-v2',
      approvedCandidates: [{
        id: 'candidate-standard-duration-1',
        approvalStatus: 'approved',
        candidatePayload: approvedCandidatePayload,
      }],
      queryExec,
      publishedBy: '99999999-9999-4999-8999-999999999999',
      executedAt: '2026-06-16T06:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'standard_work_duration_seed_published',
      publicationKey: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
      rollbackTarget: 'algorithm_seed_versions:seed-version-standard-work-duration-v1',
      writesAlgorithmSeedVersions: true,
      writesAlgorithmSeedRecords: true,
      writesTasksOrBaselinesDirectly: false,
      writesMonthlyPlansDirectly: false,
      writesProgressFactsDirectly: false,
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain('insert into public.algorithm_seed_versions')
    expect(joinedSql).toContain('insert into public.algorithm_seed_records')
    expect(joinedSql).toContain('insert into public.algorithm_seed_import_logs')
    expect(joinedSql).toContain('update public.algorithm_seed_versions')
    expect(joinedSql).not.toContain('insert into public.tasks')
    expect(joinedSql).not.toContain('update public.tasks')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('monthly_plan')
    expect(joinedSql).not.toContain('project_daily_snapshot')
    expect(joinedSql).not.toContain('duration_experience_samples')
    expect(calls.find((call) => call.sql.toLowerCase().includes('insert into public.algorithm_seed_records'))?.params?.[0]).toEqual([
      expect.objectContaining({
        seed_version_id: 'seed-version-standard-work-duration-v2',
        seed_type: 'standard_work_duration',
        stable_code: 'process_duration:cast_in_place_concrete',
        source_clause_ref: 'duration_experience_samples.actual_duration',
      }),
    ])
  })

  it('blocks publication when readiness is not ready, the candidate is not approved, or the publication key does not match the seed version', async () => {
    const queryExec: StandardWorkDurationSeedPublicationQueryExec = async () => {
      throw new Error('queryExec should not run for blocked publication')
    }

    await expect(publishStandardWorkDurationSeedVersion({
      readiness: {
        ...readyPublication,
        status: 'standard_work_seed_publication_not_ready',
        missingReasons: ['runtime_consumer_publication_required'],
      },
      seedVersion: 'v1.4.22.5-standard-work-duration-live-v2',
      approvedCandidates: [{
        id: 'candidate-standard-duration-1',
        approvalStatus: 'approved',
        candidatePayload: approvedCandidatePayload,
      }],
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      reasons: ['runtime_consumer_publication_required'],
    }))

    await expect(publishStandardWorkDurationSeedVersion({
      readiness: readyPublication,
      seedVersion: 'v1.4.22.5-standard-work-duration-live-v2',
      approvedCandidates: [{
        id: 'candidate-standard-duration-1',
        approvalStatus: 'pending',
        candidatePayload: approvedCandidatePayload,
      }],
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      reasons: ['approved_candidate_review_required'],
    }))

    await expect(publishStandardWorkDurationSeedVersion({
      readiness: {
        ...readyPublication,
        seedVersionLineage: {
          ...readyPublication.seedVersionLineage,
          runtimePublicationKey: 'algorithm_seed_versions:different-version',
        },
      },
      seedVersion: 'v1.4.22.5-standard-work-duration-live-v2',
      approvedCandidates: [{
        id: 'candidate-standard-duration-1',
        approvalStatus: 'approved',
        candidatePayload: approvedCandidatePayload,
      }],
      queryExec,
    })).resolves.toEqual(expect.objectContaining({
      status: 'blocked',
      reasons: ['runtime_publication_key_must_match_seed_version_id'],
    }))
  })

  it('rolls back only the standard-work duration seed version pointer and leaves facts untouched', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryExec: StandardWorkDurationSeedPublicationQueryExec = async (sql, params) => {
      calls.push({ sql, params })
      return []
    }

    const result = await rollbackStandardWorkDurationSeedVersion({
      queryExec,
      sourcePublicationKey: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
      rollbackTarget: 'algorithm_seed_versions:seed-version-standard-work-duration-v1',
      reason: 'impact_monitoring_regression',
      executedAt: '2026-06-16T07:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'standard_work_duration_seed_rollback_executed',
      sourcePublicationKey: 'algorithm_seed_versions:seed-version-standard-work-duration-v2',
      rollbackTarget: 'algorithm_seed_versions:seed-version-standard-work-duration-v1',
      restoredRuntimePolicy: 'previous_standard_work_duration_seed_version_restored',
      writesAlgorithmSeedVersions: true,
      writesTasksOrBaselinesDirectly: false,
      writesMonthlyPlansDirectly: false,
      writesProgressFactsDirectly: false,
      reasons: [],
    }))
    const joinedSql = calls.map((call) => call.sql).join('\n').toLowerCase()
    expect(joinedSql).toContain("set status = 'deprecated'")
    expect(joinedSql).toContain("set status = 'active'")
    expect(joinedSql).toContain('insert into public.algorithm_seed_import_logs')
    expect(joinedSql).not.toContain('algorithm_seed_records')
    expect(joinedSql).not.toContain('tasks')
    expect(joinedSql).not.toContain('task_baselines')
    expect(joinedSql).not.toContain('monthly_plan')
    expect(joinedSql).not.toContain('project_daily_snapshot')
  })
})
