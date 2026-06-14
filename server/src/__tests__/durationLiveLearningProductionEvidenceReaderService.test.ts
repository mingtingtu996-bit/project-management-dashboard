import { describe, expect, it } from 'vitest'

import {
  buildDurationLiveLearningCompletionAudit,
} from '../services/durationLiveLearningCompletionAuditService.js'
import type {
  DurationLiveLearningAssetKey,
  DurationLiveLearningEvidence,
  DurationLiveLearningEvidenceOverride,
} from '../services/durationLiveLearningClosureService.js'

const readyEvidence: DurationLiveLearningEvidence = {
  assetClassificationRegistered: true,
  predictionEventRecorded: true,
  actualOutcomeEventRecorded: true,
  tieredLearningPolicyRegistered: true,
  enabledLearningScopes: ['system', 'industry_baseline', 'company', 'project'],
  runtimeConsumerUsesPublishedArtifact: true,
  releaseExitApproved: true,
  impactMonitoringReady: true,
  rollbackTargetReady: true,
  accuracyMetricsAvailable: true,
}

const learnableAssetKeys: DurationLiveLearningAssetKey[] = [
  'base_duration_benchmark',
  'duration_cold_start_baseline',
  'forecast_residual_overlay',
  'forecast_confidence_weight',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
]

function buildReadyCompletionAudit() {
  const evidenceOverrides: DurationLiveLearningEvidenceOverride[] = learnableAssetKeys.map((assetKey) => ({
    assetKey,
    evidence: assetKey === 'forecast_residual_overlay' || assetKey === 'forecast_confidence_weight'
      ? {
          ...readyEvidence,
          enabledLearningScopes: ['company', 'project'],
          scopeExceptionApproved: true,
        }
      : readyEvidence,
  }))
  return buildDurationLiveLearningCompletionAudit({ evidenceOverrides })
}

function rowsForSql(sql: string) {
  const normalized = sql.toLowerCase()
  if (normalized.includes('from public.duration_experience_samples')) {
    return learnableAssetKeys.map((assetKey) => ({
      id: `sample-${assetKey}`,
      sample_status: 'active',
      included_in_benchmark: true,
      actual_duration: 8,
      completed_at: '2026-06-01T00:00:00.000Z',
      metadata: { liveLearningAssetKey: assetKey },
    }))
  }
  if (normalized.includes('from public.algorithm_learnable_parameter_runtime_publications')) {
    return learnableAssetKeys.map((assetKey) => ({
      publication_key: `publication-${assetKey}`,
      asset_key: assetKey,
      publication_status: 'published',
      impact_monitoring: { status: 'monitoring_armed' },
      rollback_execution: { status: 'rollback_verified' },
      writes_seed_runtime_directly: false,
      target_runtime_table: 'algorithm_learnable_parameter_runtime_publications',
    }))
  }
  if (normalized.includes('from public.duration_algorithm_accuracy_events')) {
    return learnableAssetKeys.map((assetKey) => ({
      id: `accuracy-${assetKey}`,
      absolute_error_days: 1,
      prediction_context: { assetKey },
      actual_context: { accuracyGateStatus: 'accuracy_passed' },
    }))
  }
  if (normalized.includes('from public.runtime_consumer_observations')) {
    return learnableAssetKeys.map((assetKey) => ({
      id: `consumer-${assetKey}`,
      asset_key: assetKey,
      publication_key: `publication-${assetKey}`,
      observation_status: 'observed',
      writes_runtime_directly: false,
      writes_fact_directly: false,
    }))
  }
  if (normalized.includes('from public.wbs_template_runtime_publications')) return []
  if (normalized.includes('from public.wbs_template_runtime_events')) return []
  if (normalized.includes('from public.construction_dependency_rule_runtime_publications')) return []
  if (normalized.includes('from public.construction_dependency_rule_runtime_events')) return []
  if (normalized.includes('from public.algorithm_learnable_parameter_release_events')) return []
  throw new Error(`unexpected query: ${sql}`)
}

describe('durationLiveLearningProductionEvidenceReaderService', () => {
  it('builds the production claim audit from canonical read-only source queries', async () => {
    const {
      buildDurationLiveLearningProductionClaimAuditFromDb,
    } = await import('../services/durationLiveLearningProductionEvidenceReaderService.js')
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return rowsForSql(sql) as T[]
    }

    const audit = await buildDurationLiveLearningProductionClaimAuditFromDb({
      completionAudit: buildReadyCompletionAudit(),
      queryExec,
      maxRowsPerSourceTable: 200,
    })

    expect(audit.status).toBe('duration_live_learning_production_claim_ready')
    expect(audit.sourceQuery.sourceTables).toEqual([
      'duration_experience_samples',
      'algorithm_learnable_parameter_runtime_publications',
      'algorithm_learnable_parameter_release_events',
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events',
      'duration_algorithm_accuracy_events',
      'runtime_consumer_observations',
    ])
    expect(audit.evidenceRowCollection.rejectedRows).toEqual([])
    expect(audit.evidenceCollection.rejectedRecords).toEqual([])

    const joinedSql = calls.map((call) => call.sql.toLowerCase()).join('\n')
    expect(joinedSql).toContain('from public.duration_experience_samples')
    expect(joinedSql).toContain('from public.algorithm_learnable_parameter_runtime_publications')
    expect(joinedSql).toContain('from public.algorithm_learnable_parameter_release_events')
    expect(joinedSql).toContain('from public.wbs_template_runtime_publications')
    expect(joinedSql).toContain('from public.wbs_template_runtime_events')
    expect(joinedSql).toContain('from public.construction_dependency_rule_runtime_publications')
    expect(joinedSql).toContain('from public.construction_dependency_rule_runtime_events')
    expect(joinedSql).toContain('from public.duration_algorithm_accuracy_events')
    expect(joinedSql).toContain('from public.runtime_consumer_observations')
    expect(joinedSql).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/)
    expect(joinedSql).not.toContain('algorithm_seed_versions')
    expect(joinedSql).not.toContain('standard_work_duration')
    expect(joinedSql).not.toContain('task_baseline_items')
    expect(joinedSql).not.toContain('monthly_plan_items')
  })
})
