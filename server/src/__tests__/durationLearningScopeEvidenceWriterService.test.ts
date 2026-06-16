import { describe, expect, it } from 'vitest'

import {
  writeDurationLearningScopeEvidence,
  type DurationLearningScopeEvidenceWriteInput,
} from '../services/durationLearningScopeEvidenceWriterService.js'

function createQueryRecorder() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  return {
    calls,
    queryExec: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      return []
    },
  }
}

function tablesTouched(calls: Array<{ sql: string }>) {
  return calls
    .map((call) => call.sql.toLowerCase())
    .flatMap((sql) => {
      const tables: string[] = []
      if (sql.includes('duration_experience_samples')) tables.push('duration_experience_samples')
      if (sql.includes('duration_plan_network_outcomes')) tables.push('duration_plan_network_outcomes')
      if (sql.includes('tasks')) tables.push('tasks')
      if (sql.includes('baselines')) tables.push('baselines')
      if (sql.includes('monthly')) tables.push('monthly')
      if (sql.includes('runtime_publications')) tables.push('runtime_publications')
      return tables
    })
}

function metadataParam(call: { params: unknown[] }) {
  const raw = call.params.find((param) => typeof param === 'string' && param.startsWith('{'))
  return JSON.parse(String(raw)) as Record<string, unknown>
}

describe('durationLearningScopeEvidenceWriterService', () => {
  it('writes explicit upper-scope duration and plan-network evidence without touching fact or runtime writer tables', async () => {
    const recorder = createQueryRecorder()
    const input: DurationLearningScopeEvidenceWriteInput = {
      queryExec: recorder.queryExec,
      observedAt: '2026-06-16T09:00:00.000Z',
      durationOutcomeEvidence: [
        {
          evidenceId: '11111111-1111-4111-8111-111111111111',
          assetKey: 'base_duration_benchmark',
          learningScope: 'company',
          companyId: '22222222-2222-4222-8222-222222222222',
          representativeDurationDays: 8,
          sourceSampleCount: 12,
          publicationKey: 'duration_benchmark_runtime:base-v2',
          metadata: { aggregateWindow: '2026-Q2' },
        },
        {
          evidenceId: '33333333-3333-4333-8333-333333333333',
          assetKey: 'standard_work_duration_seed',
          learningScope: 'global',
          representativeDurationDays: 6,
          sourceSampleCount: 40,
          publicationKey: 'algorithm_seed_versions:seed-global-v2',
        },
      ],
      planNetworkEvidence: [
        {
          evidenceId: 'network-dependency-industry-1',
          assetKey: 'dependency_rule_candidate',
          learningScope: 'industry',
          outcomeRef: 'network_outcomes:dependency_rule_candidate:industry:accepted',
          sourceOutcomeCount: 18,
          publicationKey: 'dependency_rule_runtime:dep-v2',
          metadata: { source: 'cross-company dependency replay' },
        },
      ],
    }

    const result = await writeDurationLearningScopeEvidence(input)

    expect(result.status).toBe('learning_scope_evidence_written')
    expect(result.writtenRows).toEqual([
      expect.objectContaining({
        evidenceId: '11111111-1111-4111-8111-111111111111',
        sourceTable: 'duration_experience_samples',
        learningScope: 'company',
        learningScopeSource: 'company_aggregate_evidence_job',
      }),
      expect.objectContaining({
        evidenceId: '33333333-3333-4333-8333-333333333333',
        sourceTable: 'duration_experience_samples',
        learningScope: 'global',
        learningScopeSource: 'global_shared_baseline_job',
      }),
      expect.objectContaining({
        evidenceId: 'network-dependency-industry-1',
        sourceTable: 'duration_plan_network_outcomes',
        learningScope: 'industry',
        learningScopeSource: 'plan_network_industry_baseline_job',
      }),
    ])
    expect(result.rejectedRows).toEqual([])
    expect(tablesTouched(recorder.calls)).toEqual([
      'duration_experience_samples',
      'duration_experience_samples',
      'duration_plan_network_outcomes',
    ])
    expect(metadataParam(recorder.calls[0])).toEqual(expect.objectContaining({
      assetKey: 'base_duration_benchmark',
      learningScope: 'company',
      learningScopeSource: 'company_aggregate_evidence_job',
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    }))
    expect(metadataParam(recorder.calls[1])).toEqual(expect.objectContaining({
      assetKey: 'standard_work_duration_seed',
      learningScope: 'global',
      learningScopeSource: 'global_shared_baseline_job',
      writesRuntimeDirectly: false,
      writesFactDirectly: false,
    }))
    expect(recorder.calls[2].params).toEqual(expect.arrayContaining([
      'dependency_rule_candidate',
      'industry',
      'plan_network_industry_baseline_job',
    ]))
    expect(recorder.calls[2].sql.toLowerCase()).toContain('writes_runtime_directly')
    expect(recorder.calls[2].sql.toLowerCase()).toContain('writes_fact_directly')
  })

  it('rejects project-scope aggregate rows and fact-locked assets', async () => {
    const recorder = createQueryRecorder()

    const result = await writeDurationLearningScopeEvidence({
      queryExec: recorder.queryExec,
      durationOutcomeEvidence: [
        {
          evidenceId: '44444444-4444-4444-8444-444444444444',
          assetKey: 'actual_duration_outcome',
          learningScope: 'company',
          representativeDurationDays: 5,
          sourceSampleCount: 5,
        },
        {
          evidenceId: '55555555-5555-4555-8555-555555555555',
          assetKey: 'base_duration_benchmark',
          learningScope: 'project',
          representativeDurationDays: 7,
          sourceSampleCount: 1,
        },
      ],
      planNetworkEvidence: [
        {
          evidenceId: 'network-project-1',
          assetKey: 'critical_path_rule_candidate',
          learningScope: 'project',
          outcomeRef: 'network_outcomes:critical_path_rule_candidate:project:accepted',
          sourceOutcomeCount: 1,
        },
      ],
    })

    expect(result.status).toBe('learning_scope_evidence_rejected')
    expect(result.writtenRows).toEqual([])
    expect(result.rejectedRows).toEqual([
      expect.objectContaining({
        evidenceId: '44444444-4444-4444-8444-444444444444',
        reason: 'asset_not_upper_scope_duration_outcome_learnable',
      }),
      expect.objectContaining({
        evidenceId: '55555555-5555-4555-8555-555555555555',
        reason: 'upper_scope_aggregate_writer_cannot_write_project_scope',
      }),
      expect.objectContaining({
        evidenceId: 'network-project-1',
        reason: 'upper_scope_aggregate_writer_cannot_write_project_scope',
      }),
    ])
    expect(recorder.calls).toEqual([])
  })
})
