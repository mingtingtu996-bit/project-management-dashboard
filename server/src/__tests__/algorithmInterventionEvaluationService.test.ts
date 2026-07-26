import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import {
  collectAlgorithmInterventionEvaluationCandidates,
  evaluateAlgorithmInterventionOutcomes,
  persistAlgorithmInterventionEvaluation,
  runAlgorithmInterventionEvaluationSweep,
  type AlgorithmInterventionEvaluationCandidate,
  type AlgorithmInterventionEvaluationOutcome,
} from '../services/algorithmInterventionEvaluationService.js'

const EVALUATED_AT = '2026-07-08T00:00:00.000Z'

function outcome(
  outcomeId: string,
  outcomeAt: string,
  absoluteErrorDays: number,
  projectId: string,
): AlgorithmInterventionEvaluationOutcome {
  return {
    outcomeId,
    projectId,
    companyId: 'company-a',
    taskId: `task-${outcomeId}`,
    outcomeAt,
    absoluteErrorDays,
    baselineAbsoluteErrorDays: 999,
    overcompensated: null,
  }
}

function cohort(prefix: string, period: 'pre' | 'post', error: number, projectId: string) {
  const month = period === 'pre' ? '06' : '07'
  return Array.from({ length: 5 }, (_, index) => outcome(
    `${prefix}-${period}-${index + 1}`,
    `2026-${month}-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
    error,
    projectId,
  ))
}

function candidate(overrides: Record<string, unknown> = {}): AlgorithmInterventionEvaluationCandidate {
  const treatedPreOutcomes = cohort('treated', 'pre', 10, 'project-a')
  const treatedPostOutcomes = cohort('treated', 'post', 6, 'project-a')
  const controlPreOutcomes = cohort('control', 'pre', 10, 'project-b')
  const controlPostOutcomes = cohort('control', 'post', 9, 'project-b')
  return {
    sourcePublicationKey: 'learnable-parameter-runtime:duration-blend:company-a',
    assetKey: 'algorithm.learnable_parameter.runtime_publication',
    parameterKey: 'duration.benchmark_blend_weight',
    ownerAlgorithm: 'durationSuggestionService',
    scopeLevel: 'company',
    companyId: 'company-a',
    projectId: null,
    rollbackTarget: 'learnable-parameter-runtime:duration-blend:company-a:previous',
    interventionAt: '2026-07-01T00:00:00.000Z',
    proxyMetric: 'duration_forecast_absolute_error_days',
    observationStartedAt: '2026-07-01T00:00:00.000Z',
    prePeriodStart: '2026-06-01T00:00:00.000Z',
    prePeriodEnd: '2026-06-30T23:59:59.999Z',
    postPeriodStart: '2026-07-01T00:00:00.000Z',
    postPeriodEnd: '2026-07-07T23:59:59.999Z',
    controlCohortDefinition: {
      policy: 'scope_bound_unexposed_accuracy_outcomes',
      exclusions: ['publication_exposed_projects'],
    },
    treatedPreOutcomes,
    treatedPostOutcomes,
    controlPreOutcomes,
    controlPostOutcomes,
    // Retained only to prove the legacy post-row baseline field is not used as pre-period evidence.
    treatedOutcomes: treatedPostOutcomes,
    controlOutcomes: controlPostOutcomes,
    ...overrides,
  } as unknown as AlgorithmInterventionEvaluationCandidate
}

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateAlgorithmInterventionOutcomes(candidate(overrides), { evaluatedAt: EVALUATED_AT })
}

function createRecordingQueryExec(order?: string[]) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    order?.push('persist')
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('algorithmInterventionEvaluationService', () => {
  it('uses explicit treated/control pre and post cohorts for a supported difference-in-differences decision', () => {
    const evaluation = evaluate() as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>

    expect(evaluation).toEqual(expect.objectContaining({
      decision: 'benefit_detected',
      status: 'counterfactual_supported',
      causalEstimateStatus: 'observational_difference_in_differences',
      treatedPreSampleCount: 5,
      treatedPostSampleCount: 5,
      controlPreSampleCount: 5,
      controlPostSampleCount: 5,
      treatedBaselineMaeDays: 10,
      treatedPostMaeDays: 6,
      controlBaselineMaeDays: 10,
      controlPostMaeDays: 9,
      counterfactualEffectDays: 3,
      counterfactualEffectCi95LowerDays: 3,
      counterfactualEffectCi95UpperDays: 3,
      dataFreshnessStatus: 'fresh',
      sampleSufficiencyStatus: 'sufficient',
      rollbackReviewRecommended: false,
    }))
    expect(evaluation.evaluationWindowStart).toBe('2026-06-02T00:00:00.000Z')
    expect(evaluation.evaluationWindowEnd).toBe('2026-07-06T00:00:00.000Z')
    expect(evaluation.evidence).toEqual(expect.objectContaining({
      temporalAnchor: expect.objectContaining({
        observationStartedAt: '2026-07-01T00:00:00.000Z',
        proxyMetric: 'duration_forecast_absolute_error_days',
      }),
      cohortDefinition: expect.objectContaining({
        controlPolicy: 'scope_bound_unexposed_accuracy_outcomes',
        exclusions: ['publication_exposed_projects'],
      }),
      treatedPreOutcomeIds: expect.arrayContaining(['treated-pre-1']),
      treatedPostOutcomeIds: expect.arrayContaining(['treated-post-1']),
    }))
  })

  it('fails closed when any true pre or post cohort is below the minimum', () => {
    const evaluation = evaluate({
      treatedPreOutcomes: cohort('treated', 'pre', 10, 'project-a').slice(0, 3),
    }) as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>

    expect(evaluation).toEqual(expect.objectContaining({
      decision: 'insufficient_data',
      status: 'insufficient_evidence',
      causalEstimateStatus: 'not_estimable',
      treatedPreSampleCount: 3,
      counterfactualEffectDays: null,
      counterfactualEffectCi95LowerDays: null,
      counterfactualEffectCi95UpperDays: null,
      sampleSufficiencyStatus: 'insufficient',
      rollbackReviewRecommended: false,
    }))
    expect(evaluation.limitations).toEqual(expect.arrayContaining([
      'treated_pre_cohort_below_minimum',
    ]))
  })

  it('uses the confidence interval to distinguish no detectable effect from benefit or harm', () => {
    const evaluation = evaluate({
      treatedPostOutcomes: [5, 7, 9, 11, 13].map((error, index) => outcome(
        `treated-post-variable-${index + 1}`,
        `2026-07-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
        error,
        'project-a',
      )),
      controlPostOutcomes: cohort('control', 'post', 8, 'project-b'),
    }) as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>

    expect(evaluation.decision).toBe('no_detectable_effect')
    expect(Number(evaluation.counterfactualEffectCi95LowerDays)).toBeLessThanOrEqual(0)
    expect(Number(evaluation.counterfactualEffectCi95UpperDays)).toBeGreaterThanOrEqual(0)
  })

  it('does not claim counterfactual support for stale evidence or a contaminated control cohort', () => {
    const stale = evaluateAlgorithmInterventionOutcomes(candidate(), {
      evaluatedAt: '2026-07-20T00:00:00.000Z',
    }) as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>
    const contaminated = evaluate({
      controlPreOutcomes: cohort('control', 'pre', 10, 'project-a'),
      controlPostOutcomes: cohort('control', 'post', 9, 'project-a'),
    }) as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>

    expect(stale).toEqual(expect.objectContaining({
      decision: 'insufficient_data',
      status: 'insufficient_evidence',
      dataFreshnessStatus: 'stale',
      counterfactualEffectDays: null,
    }))
    expect(contaminated).toEqual(expect.objectContaining({
      decision: 'confounded',
      status: 'observational_estimate',
      causalEstimateStatus: 'observational_before_after',
      counterfactualEffectDays: null,
    }))
    expect(contaminated.limitations).toEqual(expect.arrayContaining(['control_cohort_overlaps_treatment']))
  })

  it('requires treatment and control post cohorts to be independently fresh', () => {
    const evaluation = evaluateAlgorithmInterventionOutcomes(candidate({
      treatedPostOutcomes: Array.from({ length: 5 }, (_, index) => outcome(
        `treated-post-old-${index + 1}`,
        `2026-07-01T0${index}:00:00.000Z`,
        6,
        'project-a',
      )),
    }), {
      evaluatedAt: '2026-07-10T00:00:00.000Z',
    }) as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>

    expect(evaluation).toEqual(expect.objectContaining({
      decision: 'insufficient_data',
      status: 'insufficient_evidence',
      dataFreshnessStatus: 'stale',
      counterfactualEffectDays: null,
    }))
    expect(evaluation.limitations).toEqual(expect.arrayContaining(['treated_post_evidence_stale']))
  })

  it('persists the explicit decision inputs and uncertainty without mutating runtime or business facts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const evaluation = evaluate() as ReturnType<typeof evaluateAlgorithmInterventionOutcomes> & Record<string, unknown>

    const result = await persistAlgorithmInterventionEvaluation({ queryExec, evaluation })

    expect(result).toEqual({ persisted: true, evaluationRef: evaluation.evaluationFingerprint })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('insert into public.algorithm_intervention_evaluations')
    expect(calls[0]?.sql).toContain('decision')
    expect(calls[0]?.sql).toContain('treated_pre_sample_count')
    expect(calls[0]?.sql).toContain('counterfactual_effect_ci95_lower_days')
    expect(calls[0]?.sql).toContain('rollback_target')
    expect(calls[0]?.sql).toContain('on conflict (evaluation_fingerprint) do nothing')
    expect(calls[0]?.sql).not.toContain('update public.algorithm_learnable_parameter_runtime_publications')
    expect(calls[0]?.sql).not.toContain('execution_fact_events')
    expect(calls[0]?.params).toEqual(expect.arrayContaining([
      evaluation.sourcePublicationKey,
      evaluation.parameterKey,
      evaluation.decision,
      evaluation.counterfactualEffectDays,
      evaluation.evaluationFingerprint,
    ]))
  })

  it('collects reproducible pre/post treatment and unexposed control cohorts with rollback authority', async () => {
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
          rollback_target: 'previous-publication',
          published_at: '2026-07-01T00:00:00.000Z',
        }] as T[]
      }
      if (calls.length === 2) {
        return [
          { outcome_period: 'pre', outcome_id: 'treated-pre', project_id: 'project-a', company_id: 'company-a', task_id: 'task-a', outcome_at: '2026-06-15T00:00:00.000Z', absolute_error_days: 10 },
          { outcome_period: 'post', outcome_id: 'treated-post', project_id: 'project-a', company_id: 'company-a', task_id: 'task-b', outcome_at: '2026-07-02T00:00:00.000Z', absolute_error_days: 8 },
        ] as T[]
      }
      return [
        { outcome_period: 'pre', outcome_id: 'control-pre', project_id: 'project-b', company_id: 'company-a', task_id: 'task-c', outcome_at: '2026-06-15T00:00:00.000Z', absolute_error_days: 10 },
        { outcome_period: 'post', outcome_id: 'control-post', project_id: 'project-b', company_id: 'company-a', task_id: 'task-d', outcome_at: '2026-07-02T00:00:00.000Z', absolute_error_days: 9 },
      ] as T[]
    }

    const candidates = await collectAlgorithmInterventionEvaluationCandidates(queryExec, {
      evaluatedAt: EVALUATED_AT,
    } as never)

    expect(candidates).toEqual([expect.objectContaining({
      sourcePublicationKey: 'learnable-parameter-runtime:duration-blend:company-a',
      rollbackTarget: 'previous-publication',
      proxyMetric: 'duration_forecast_absolute_error_days',
      observationStartedAt: '2026-07-01T00:00:00.000Z',
      treatedPreOutcomes: [expect.objectContaining({ outcomeId: 'treated-pre' })],
      treatedPostOutcomes: [expect.objectContaining({ outcomeId: 'treated-post' })],
      controlPreOutcomes: [expect.objectContaining({ outcomeId: 'control-pre' })],
      controlPostOutcomes: [expect.objectContaining({ outcomeId: 'control-post' })],
    })])
    expect(calls).toHaveLength(3)
    expect(calls[1]?.sql).toContain("'pre' as outcome_period")
    expect(calls[1]?.sql).toContain("'post' as outcome_period")
    expect(calls[1]?.sql).toContain('runtime_consumer_observations')
    expect(calls[1]?.sql).toContain('partition by outcome_period')
    expect(calls[1]?.sql).toContain('period_rank <= 500')
    expect(calls[2]?.sql).toContain('not exists')
    expect(calls[2]?.sql).toContain('publication.scope_level')
    expect(calls[2]?.sql).toContain('partition by outcome_period')
    expect(calls[2]?.sql).toContain('period_rank <= 500')
  })

  it('persists harm before invoking deterministic governed rollback', async () => {
    const order: string[] = []
    const { queryExec } = createRecordingQueryExec(order)
    const rollbackExecutor = vi.fn(async (input: Record<string, unknown>) => {
      order.push('rollback')
      return {
        status: 'rollback_executed',
        sourcePublicationKey: input.sourcePublicationKey,
        rollbackTarget: input.rollbackTarget,
        restoredRuntimePolicy: 'previous_parameter_value_retained',
        writesParameterRuntime: true,
        writesSeedRuntimeDirectly: false,
        reasons: [],
      }
    })

    const result = await runAlgorithmInterventionEvaluationSweep({
      queryExec,
      evaluatedAt: EVALUATED_AT,
      candidates: [candidate({
        treatedPostOutcomes: cohort('treated', 'post', 13, 'project-a'),
      })],
      rollbackExecutor,
    } as never)

    expect(order).toEqual(['persist', 'rollback'])
    expect(result).toEqual(expect.objectContaining({
      persisted: 1,
      harmDetected: 1,
      rollbackExecuted: 1,
      rollbackBlocked: 0,
      failed: 0,
    }))
    expect(rollbackExecutor).toHaveBeenCalledWith(expect.objectContaining({
      sourcePublicationKey: 'learnable-parameter-runtime:duration-blend:company-a',
      rollbackTarget: 'learnable-parameter-runtime:duration-blend:company-a:previous',
      reason: 'causal_intervention_harm_detected',
      idempotencyKey: expect.stringMatching(/^algorithm-intervention-rollback:[a-f0-9]{64}$/),
    }))
  })

  it('binds the evaluation and rollback idempotency fingerprint to the governed rollback target', () => {
    const first = evaluate({
      treatedPostOutcomes: cohort('treated', 'post', 13, 'project-a'),
    })
    const second = evaluate({
      treatedPostOutcomes: cohort('treated', 'post', 13, 'project-a'),
      rollbackTarget: 'learnable-parameter-runtime:duration-blend:company-a:older',
    })

    expect(first.evaluationFingerprint).not.toBe(second.evaluationFingerprint)
  })

  it('surfaces a blocked harmful rollback as a retryable sweep failure after idempotent persistence', async () => {
    const { calls, queryExec } = createRecordingQueryExec()
    const rollbackExecutor = vi.fn(async () => ({
      status: 'rollback_blocked',
      sourcePublicationKey: 'publication',
      rollbackTarget: null,
      restoredRuntimePolicy: 'previous_parameter_value_retained',
      writesParameterRuntime: false,
      writesSeedRuntimeDirectly: false,
      reasons: ['rollback_target_required'],
    }))

    const result = await runAlgorithmInterventionEvaluationSweep({
      queryExec,
      evaluatedAt: EVALUATED_AT,
      candidates: [candidate({
        treatedPostOutcomes: cohort('treated', 'post', 13, 'project-a'),
      })],
      rollbackExecutor,
    } as never)

    expect(calls).toHaveLength(1)
    expect(result).toEqual(expect.objectContaining({
      persisted: 1,
      harmDetected: 1,
      rollbackExecuted: 0,
      rollbackBlocked: 1,
      failed: 1,
    }))
  })

  it('ships the durable decision schema, uncertainty, authority references, and backend-only write guards', () => {
    const migration = readFileSync(new URL('../../migrations/329_algorithm_intervention_evaluations.sql', import.meta.url), 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.algorithm_intervention_evaluations')
    expect(migration).toContain("decision TEXT NOT NULL CHECK (decision IN ('insufficient_data','no_detectable_effect','benefit_detected','harm_detected','confounded'))")
    expect(migration).toContain('proxy_metric TEXT NOT NULL')
    expect(migration).toContain('observation_started_at TIMESTAMPTZ NOT NULL')
    expect(migration).toContain('treated_pre_sample_count INTEGER NOT NULL')
    expect(migration).toContain('control_post_sample_count INTEGER NOT NULL')
    expect(migration).toContain('counterfactual_effect_ci95_lower_days')
    expect(migration).toContain('data_freshness_status')
    expect(migration).toContain('sample_sufficiency_status')
    expect(migration).toContain('rollback_target TEXT NULL')
    expect(migration).toContain('evaluation_fingerprint TEXT NOT NULL')
    expect(migration).toContain('UNIQUE (evaluation_fingerprint)')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('TO workbuddy_runtime')
    expect(migration).not.toContain('GRANT INSERT ON TABLE public.algorithm_intervention_evaluations TO authenticated')
  })

  it('ships an idempotent rollback for the intervention evaluation table', () => {
    const rollback = readFileSync(new URL('../../migrations/rollback/329_algorithm_intervention_evaluations.sql', import.meta.url), 'utf8')

    expect(rollback).toContain('BEGIN;')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.algorithm_intervention_evaluations')
    expect(rollback).toContain("NOTIFY pgrst, 'reload schema'")
    expect(rollback).toContain('COMMIT;')
  })

  it('documents migration 329 after the occupied 327 and 328 identities', () => {
    const specification = readFileSync(new URL('../../../docs/superpowers/specs/2026-07-23-full-code-correctness-closeout-design.md', import.meta.url), 'utf8')

    expect(specification).toContain('`329_algorithm_intervention_evaluations.sql`')
    expect(specification).toContain('327_task_write_finalization_outbox.sql')
    expect(specification).toContain('328_duration_asset_platform_operator.sql')
    expect(specification).not.toContain('`327_algorithm_intervention_evaluations.sql`')
  })
})
