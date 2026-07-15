import { describe, expect, it } from 'vitest'
import {
  backfillConstructionOrganizationPrecisionReplayCandidates,
} from '../services/constructionOrganizationPrecisionReplayCandidateBackfillService.js'
import {
  CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES,
} from '../services/constructionOrganizationPrecisionReplayMatrixService.js'

const companyId = '10000000-0000-4000-8000-000000000001'

function createQueryRecorder(existingAssetKeys: string[] = []) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('SELECT asset_key') && sql.includes('FROM public.algorithm_asset_candidate_events')) {
      return existingAssetKeys.map((asset_key) => ({ asset_key })) as T[]
    }
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: `precision-candidate-${calls.length}` }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('constructionOrganizationPrecisionReplayCandidateBackfillService', () => {
  it('dry-runs candidate-only anchors for every supported business type without runtime writes', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const result = await backfillConstructionOrganizationPrecisionReplayCandidates({
      companyId,
      dryRun: true,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_precision_replay_candidate_backfill_service',
      mode: 'dry_run',
      supportedBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      backfillableBusinessTypeCount: CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length,
      backfilledBusinessTypeCount: 0,
    }))
    expect(result.businessTypes.map((row) => row.businessType).sort()).toEqual(
      [...CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES].sort(),
    )
    expect(result.candidateEventCount).toBeGreaterThanOrEqual(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length * 2,
    )
    expect(result.businessTypes.every((row) =>
      row.status === 'precision_replay_candidate_backfill_ready'
        && row.runtimeEffectPolicy === 'candidate_only'
        && row.mutationBoundary.writesTaskDependencies === false
        && row.mutationBoundary.writesPlanDates === false
        && row.mutationBoundary.writesCriticalPathFacts === false,
    )).toBe(true)
    expect(calls.some((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))).toBe(false)
  })

  it('applies company-scoped precision replay candidate anchors while preserving candidate-only boundaries', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const result = await backfillConstructionOrganizationPrecisionReplayCandidates({
      companyId,
      dryRun: false,
      queryExec,
    })

    expect(result.mode).toBe('apply')
    expect(result.backfilledBusinessTypeCount).toBe(CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length)
    expect(result.candidateEventCount).toBeGreaterThanOrEqual(
      CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length * 2,
    )

    const inserts = calls.filter((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))
    expect(inserts.length).toBe(result.candidateEventCount)
    expect(inserts[0]?.params).toEqual(expect.arrayContaining([
      expect.stringMatching(/^construction_organization\.plan_option\./),
      'constructionOrganizationScenarioGovernanceService',
      'company',
      companyId,
      null,
      'candidate_weight',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
      expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        factBasis: expect.objectContaining({
          businessType: expect.any(String),
        }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
      }),
      expect.any(Object),
      'candidate_only',
    ]))
    const insertedBusinessTypes = new Set(inserts.map((call) => {
      const payload = call.params.find((param) =>
        typeof param === 'object'
        && param
        && (param as Record<string, unknown>).source === 'construction_organization_scenario_selector'
      ) as Record<string, unknown>
      return (payload.factBasis as Record<string, unknown>)?.businessType
    }))
    expect([...insertedBusinessTypes].sort()).toEqual(
      [...CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES].sort(),
    )
    const writeSql = inserts.map((call) => call.sql.toLowerCase()).join('\n')
    expect(writeSql).toContain('algorithm_asset_candidate_events')
    expect(writeSql).not.toContain('task_dependencies')
    expect(writeSql).not.toContain('construction_organization_plan_network_runtime_publications')
    expect(writeSql).not.toContain('tasks ')
  })

  it('skips already anchored precision replay business types by option asset key', async () => {
    const first = await backfillConstructionOrganizationPrecisionReplayCandidates({
      companyId,
      dryRun: true,
      queryExec: createQueryRecorder().queryExec,
    })
    const existingAssetKeys = first.businessTypes[0]?.assetKeys ?? []
    const { calls, queryExec } = createQueryRecorder(existingAssetKeys)

    const result = await backfillConstructionOrganizationPrecisionReplayCandidates({
      companyId,
      dryRun: false,
      queryExec,
    })

    expect(result.businessTypes[0]).toEqual(expect.objectContaining({
      status: 'already_has_precision_replay_candidate_anchor',
      candidateEventCount: 0,
    }))
    expect(result.backfilledBusinessTypeCount).toBe(CONSTRUCTION_ORGANIZATION_PRECISION_REPLAY_BUSINESS_TYPES.length - 1)
    const insertedBusinessTypes = calls
      .filter((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))
      .map((call) => {
        const payload = call.params.find((param) =>
          typeof param === 'object'
          && param
          && (param as Record<string, unknown>).source === 'construction_organization_scenario_selector'
        ) as Record<string, unknown>
        return (payload.factBasis as Record<string, unknown>)?.businessType
      })
    expect(insertedBusinessTypes).not.toContain(first.businessTypes[0]?.businessType)
  })
})
