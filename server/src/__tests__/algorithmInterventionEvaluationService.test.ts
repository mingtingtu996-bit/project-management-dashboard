import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  collectAlgorithmInterventionEvaluationCandidates,
  evaluateAlgorithmInterventionOutcomes,
  persistAlgorithmInterventionEvaluation,
  runAlgorithmInterventionEvaluationSweep,
  type AlgorithmInterventionEvaluationCandidate,
  type AlgorithmInterventionEvaluationOutcome,
} from '../services/algorithmInterventionEvaluationService.js'

function outcome(
  outcomeId: string,
  outcomeAt: string,
  absoluteErrorDays: number,
  baselineAbsoluteErrorDays = 10,
): AlgorithmInterventionEvaluationOutcome {
  return {
    outcomeId,
    projectId: 'project-a',
    companyId: 'company-a',
    taskId: `task-${outcomeId}`,
    outcomeAt,
    absoluteErrorDays,
    baselineAbsoluteErrorDays,
    overcompensated: absoluteErrorDays > baselineAbsoluteErrorDays,
  }
}

function candidate(overrides: Partial<AlgorithmInterventionEvaluationCandidate> = {}): AlgorithmInterventionEvaluationCandidate {
  return {
    sourcePublicationKey: 'learnable-parameter-runtime:duration-blend:company-a',
    assetKey: 'algorithm.learnable_parameter.runtime_publication',
    parameterKey: 'duration.benchmark_blend_weight',
    ownerAlgorithm: 'durationSuggestionService',
    scopeLevel: 'company',
    companyId: 'company-a',
    projectId: null,
    interventionAt: '2026-07-01T00:00:00.000Z',
    treatedOutcomes: [
      outcome('treated-stale', '2026-06-30T23:59:59.000Z', 1),
      outcome('treated-1', '2026-07-02T00:00:00.000Z', 8),
      outcome('treated-2', '2026-07-03T00:00:00.000Z', 8),
      outcome('treated-3', '2026-07-04T00:00:00.000Z', 8),
      outcome('treated-4', '2026-07-05T00:00:00.000Z', 4),
      outcome('treated-5', '2026-07-06T00:00:00.000Z', 4),
      outcome('treated-6', '2026-07-07T00:00:00.000Z', 4),
    ],
    controlOutcomes: [
      outcome('control-1', '2026-07-02T00:00:00.000Z', 9),
      outcome('control-2', '2026-07-03T00:00:00.000Z', 9),
      outcome('control-3', '2026-07-04T00:00:00.000Z', 9),
      outcome('control-4', '2026-07-05T00:00:00.000Z', 9),
      outcome('control-5', '2026-07-06T00:00:00.000Z', 9),
      outcome('control-6', '2026-07-07T00:00:00.000Z', 9),
    ],
    ...overrides,
  }
}

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('algorithmInterventionEvaluationService', () => {
  it('uses the publication timestamp, matched controls, and post-intervention error slope without claiming a randomized causal result', () => {
    const evaluation = evaluateAlgorithmInterventionOutcomes(candidate())

    expect(evaluation).toEqual(expect.objectContaining({
      status: 'counterfactual_supported',
      causalEstimateStatus: 'observational_difference_in_differences',
      treatmentSampleCount: 6,
      controlSampleCount: 6,
      treatedBaselineMaeDays: 10,
      treatedPostMaeDays: 6,
      controlBaselineMaeDays: 10,
      controlPostMaeDays: 9,
      counterfactualEffectDays: 3,
      postInterventionErrorRateInflectionDays: -4,
      rollbackReviewRecommended: false,
    }))
    expect(evaluation.evaluationWindowStart).toBe('2026-07-02T00:00:00.000Z')
    expect(evaluation.evidence.temporalAnchor).toEqual(expect.objectContaining({
      interventionAt: '2026-07-01T00:00:00.000Z',
      source: 'runtime_publication_timestamp',
    }))
    expect(evaluation.limitations).toEqual(expect.arrayContaining([
      'observational_evaluation_not_randomized_causal_proof',
    ]))
  })

  it('fails closed to insufficient evidence when the treated cohort cannot support an estimate', () => {
    const evaluation = evaluateAlgorithmInterventionOutcomes(candidate({
      treatedOutcomes: [
        outcome('treated-1', '2026-07-02T00:00:00.000Z', 8),
        outcome('treated-2', '2026-07-03T00:00:00.000Z', 8),
        outcome('treated-3', '2026-07-04T00:00:00.000Z', 8),
      ],
    }))

    expect(evaluation).toEqual(expect.objectContaining({
      status: 'insufficient_evidence',
      causalEstimateStatus: 'not_estimable',
      treatmentSampleCount: 3,
      counterfactualEffectDays: null,
      rollbackReviewRecommended: false,
    }))
    expect(evaluation.limitations).toEqual(expect.arrayContaining([
      'treated_cohort_below_minimum',
    ]))
  })

  it('uses the full observed range across treatment and control cohorts for its evidence window', () => {
    const evaluation = evaluateAlgorithmInterventionOutcomes(candidate({
      controlOutcomes: [
        outcome('control-1', '2026-07-02T00:00:00.000Z', 9),
        outcome('control-2', '2026-07-02T01:00:00.000Z', 9),
        outcome('control-3', '2026-07-02T02:00:00.000Z', 9),
        outcome('control-4', '2026-07-02T03:00:00.000Z', 9),
        outcome('control-5', '2026-07-02T04:00:00.000Z', 9),
        outcome('control-6', '2026-07-02T05:00:00.000Z', 9),
      ],
    }))

    expect(evaluation.evaluationWindowStart).toBe('2026-07-02T00:00:00.000Z')
    expect(evaluation.evaluationWindowEnd).toBe('2026-07-07T00:00:00.000Z')
  })

  it('recommends rollback review when the matched observational estimate regresses', () => {
    const evaluation = evaluateAlgorithmInterventionOutcomes(candidate({
      treatedOutcomes: [
        outcome('treated-1', '2026-07-02T00:00:00.000Z', 12),
        outcome('treated-2', '2026-07-03T00:00:00.000Z', 12),
        outcome('treated-3', '2026-07-04T00:00:00.000Z', 12),
        outcome('treated-4', '2026-07-05T00:00:00.000Z', 12),
        outcome('treated-5', '2026-07-06T00:00:00.000Z', 12),
      ],
      controlOutcomes: [
        outcome('control-1', '2026-07-02T00:00:00.000Z', 9),
        outcome('control-2', '2026-07-03T00:00:00.000Z', 9),
        outcome('control-3', '2026-07-04T00:00:00.000Z', 9),
        outcome('control-4', '2026-07-05T00:00:00.000Z', 9),
        outcome('control-5', '2026-07-06T00:00:00.000Z', 9),
      ],
    }))

    expect(evaluation).toEqual(expect.objectContaining({
      status: 'counterfactual_supported',
      counterfactualEffectDays: -3,
      rollbackReviewRecommended: true,
    }))
  })

  it('persists an idempotent evidence record without mutating parameter runtime or business fact tables', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const evaluation = evaluateAlgorithmInterventionOutcomes(candidate())

    const result = await persistAlgorithmInterventionEvaluation({ queryExec, evaluation })

    expect(result).toEqual({ persisted: true, evaluationRef: evaluation.evaluationFingerprint })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('insert into public.algorithm_intervention_evaluations')
    expect(calls[0]?.sql).toContain('on conflict (evaluation_fingerprint) do nothing')
    expect(calls[0]?.sql).not.toContain('algorithm_learnable_parameter_runtime_publications')
    expect(calls[0]?.sql).not.toContain('execution_fact_events')
    expect(calls[0]?.params).toEqual(expect.arrayContaining([
      evaluation.sourcePublicationKey,
      evaluation.parameterKey,
      evaluation.status,
      evaluation.counterfactualEffectDays,
      evaluation.evaluationFingerprint,
    ]))
  })

  it('collects treated observations and scope-bound unexposed controls from the accuracy evidence source', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (calls.length === 1) {
        return [{
          publication_key: 'learnable-parameter-runtime:duration-blend:company-a',
          asset_key: 'algorithm.learnable_parameter.runtime_publication',
          parameter_key: 'duration.benchmark_blend_weight',
          owner_algorithm: 'durationSuggestionService',
          scope_level: 'company',
          company_id: 'company-a',
          project_id: null,
          published_at: '2026-07-01T00:00:00.000Z',
        }] as T[]
      }
      if (calls.length === 2) {
        return [{
          outcome_id: 'treated-1', project_id: 'project-a', company_id: 'company-a', task_id: 'task-a',
          outcome_at: '2026-07-02T00:00:00.000Z', baseline_absolute_error_days: 10,
          absolute_error_days: 8, overcompensated: false,
        }] as T[]
      }
      return [{
        outcome_id: 'control-1', project_id: 'project-b', company_id: 'company-a', task_id: 'task-b',
        outcome_at: '2026-07-02T00:00:00.000Z', baseline_absolute_error_days: 10,
        absolute_error_days: 9, overcompensated: false,
      }] as T[]
    }

    const candidates = await collectAlgorithmInterventionEvaluationCandidates(queryExec)

    expect(candidates).toEqual([expect.objectContaining({
      sourcePublicationKey: 'learnable-parameter-runtime:duration-blend:company-a',
      treatedOutcomes: [expect.objectContaining({ outcomeId: 'treated-1' })],
      controlOutcomes: [expect.objectContaining({ outcomeId: 'control-1' })],
    })])
    expect(calls).toHaveLength(3)
    expect(calls[1]?.sql).toContain('runtime_consumer_observations')
    expect(calls[1]?.sql).toContain('duration_algorithm_accuracy_events')
    expect(calls[2]?.sql).toContain('not exists')
    expect(calls[2]?.sql).toContain('publication.scope_level')
  })

  it('persists every completed evaluation and reports a failed candidate to the scheduled wrapper', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await runAlgorithmInterventionEvaluationSweep({
      queryExec,
      candidates: [candidate(), {
        ...candidate({ sourcePublicationKey: 'bad-publication', parameterKey: '' }),
      }],
    })

    expect(result).toEqual(expect.objectContaining({
      total: 2,
      persisted: 1,
      counterfactualSupported: 1,
      failed: 1,
      evaluationRefs: [expect.any(String)],
    }))
    expect(calls).toHaveLength(1)
  })

  it('ships the durable table with scope, evidence, and backend-only write guards', () => {
    const migration = readFileSync(new URL('../../migrations/329_algorithm_intervention_evaluations.sql', import.meta.url), 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.algorithm_intervention_evaluations')
    expect(migration).toContain('evaluation_fingerprint TEXT NOT NULL')
    expect(migration).toContain('UNIQUE (evaluation_fingerprint)')
    expect(migration).toContain('counterfactual_effect_days')
    expect(migration).toContain('post_intervention_error_rate_inflection_days')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('TO workbuddy_runtime')
    expect(migration).not.toContain('GRANT INSERT ON TABLE public.algorithm_intervention_evaluations TO authenticated')
  })
})
