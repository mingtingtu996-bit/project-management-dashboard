import { query as rawQuery } from '../database.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

export type AlgorithmAssetGovernanceDashboardEvidence = {
  companyId: string
  scopePolicy: 'company_scoped_backend_governance_summary'
  candidateEvents: {
    totalCount: number
    reviewRequiredCount: number
    quarantinedCount: number
    replayReadyCount: number
  }
  replayRuns: {
    totalCount: number
    passedCount: number
    blockedCount: number
    failedCount: number
  }
  sampleHealth: {
    totalCount: number
    acceptedCount: number
    weakCount: number
    rejectedCount: number
    benchmarkEligibleCount: number
  }
  boundaryPolicy: string[]
}

export type CollectAlgorithmAssetGovernanceDashboardEvidenceParams = {
  companyId?: string | null
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

function normalizeId(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function numberFromRow(row: Record<string, unknown> | undefined, key: string): number {
  const value = Number(row?.[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}

async function runDefaultDashboardEvidenceQueries(companyId: string): Promise<Array<Record<string, unknown>[]>> {
  const [candidateResult, replayResult, sampleResult] = await Promise.all([
    rawQuery(`
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE event_status = 'review_required')::int AS review_required_count,
        COUNT(*) FILTER (WHERE event_status = 'quarantined')::int AS quarantined_count,
        COUNT(*) FILTER (WHERE event_status = 'replay_ready')::int AS replay_ready_count
      FROM public.algorithm_asset_candidate_events
      WHERE company_id = $1
    `, [companyId]),
    rawQuery(`
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE run_status = 'passed')::int AS passed_count,
        COUNT(*) FILTER (WHERE run_status = 'blocked')::int AS blocked_count,
        COUNT(*) FILTER (WHERE run_status = 'failed')::int AS failed_count
      FROM public.algorithm_asset_replay_runs
      WHERE company_id = $1
    `, [companyId]),
    rawQuery(`
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE sample_status = 'accepted')::int AS accepted_count,
        COUNT(*) FILTER (WHERE sample_status = 'weak')::int AS weak_count,
        COUNT(*) FILTER (WHERE sample_status = 'rejected')::int AS rejected_count,
        COUNT(*) FILTER (WHERE learning_maturity = 'guarded_live_tuning')::int AS benchmark_eligible_count
      FROM public.algorithm_sample_health_events
      WHERE company_id = $1
    `, [companyId]),
  ])

  return [
    (candidateResult.rows ?? []) as Record<string, unknown>[],
    (replayResult.rows ?? []) as Record<string, unknown>[],
    (sampleResult.rows ?? []) as Record<string, unknown>[],
  ]
}

export async function collectAlgorithmAssetGovernanceDashboardEvidence(
  params: CollectAlgorithmAssetGovernanceDashboardEvidenceParams,
): Promise<AlgorithmAssetGovernanceDashboardEvidence> {
  const companyId = normalizeId(params.companyId)
  if (!companyId) {
    throw new Error('algorithm_asset_governance_dashboard_requires_company_id')
  }

  const [candidateRows, replayRows, sampleRows] = params.queryExec
    ? await Promise.all([
      params.queryExec<Record<string, unknown>>(`
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE event_status = 'review_required')::int AS review_required_count,
          COUNT(*) FILTER (WHERE event_status = 'quarantined')::int AS quarantined_count,
          COUNT(*) FILTER (WHERE event_status = 'replay_ready')::int AS replay_ready_count
        FROM public.algorithm_asset_candidate_events
        WHERE company_id = $1
      `, [companyId]),
      params.queryExec<Record<string, unknown>>(`
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE run_status = 'passed')::int AS passed_count,
          COUNT(*) FILTER (WHERE run_status = 'blocked')::int AS blocked_count,
          COUNT(*) FILTER (WHERE run_status = 'failed')::int AS failed_count
        FROM public.algorithm_asset_replay_runs
        WHERE company_id = $1
      `, [companyId]),
      params.queryExec<Record<string, unknown>>(`
        SELECT
          COUNT(*)::int AS total_count,
          COUNT(*) FILTER (WHERE sample_status = 'accepted')::int AS accepted_count,
          COUNT(*) FILTER (WHERE sample_status = 'weak')::int AS weak_count,
          COUNT(*) FILTER (WHERE sample_status = 'rejected')::int AS rejected_count,
          COUNT(*) FILTER (WHERE learning_maturity = 'guarded_live_tuning')::int AS benchmark_eligible_count
        FROM public.algorithm_sample_health_events
        WHERE company_id = $1
      `, [companyId]),
    ])
    : await runDefaultDashboardEvidenceQueries(companyId)

  const candidate = candidateRows[0]
  const replay = replayRows[0]
  const sample = sampleRows[0]

  return {
    companyId,
    scopePolicy: 'company_scoped_backend_governance_summary',
    candidateEvents: {
      totalCount: numberFromRow(candidate, 'total_count'),
      reviewRequiredCount: numberFromRow(candidate, 'review_required_count'),
      quarantinedCount: numberFromRow(candidate, 'quarantined_count'),
      replayReadyCount: numberFromRow(candidate, 'replay_ready_count'),
    },
    replayRuns: {
      totalCount: numberFromRow(replay, 'total_count'),
      passedCount: numberFromRow(replay, 'passed_count'),
      blockedCount: numberFromRow(replay, 'blocked_count'),
      failedCount: numberFromRow(replay, 'failed_count'),
    },
    sampleHealth: {
      totalCount: numberFromRow(sample, 'total_count'),
      acceptedCount: numberFromRow(sample, 'accepted_count'),
      weakCount: numberFromRow(sample, 'weak_count'),
      rejectedCount: numberFromRow(sample, 'rejected_count'),
      benchmarkEligibleCount: numberFromRow(sample, 'benchmark_eligible_count'),
    },
    boundaryPolicy: [
      'dashboard_evidence_filters_by_current_company_id',
      'system_observation_and_other_company_rows_are_excluded',
      'sample_health_summary_is_observable_without_runtime_write',
    ],
  }
}
