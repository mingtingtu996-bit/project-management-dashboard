import { describe, expect, it } from 'vitest'
import {
  backfillConstructionOrganizationCandidateAnchors,
} from '../services/constructionOrganizationCandidateAnchorBackfillService.js'
import {
  selectConstructionOrganizationScenario,
} from '../services/constructionOrganizationScenarioSelector.js'

function createQueryRecorder(projectRows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('FROM public.projects')) return projectRows as T[]
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: `candidate-event-${calls.length}` }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

function createQueryRecorderWithExistingAnchors(
  projectRows: Array<Record<string, unknown>>,
  existingAssetKeys: string[],
) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('FROM public.projects')) return projectRows as T[]
    if (sql.includes('SELECT asset_key') && sql.includes('FROM public.algorithm_asset_candidate_events')) {
      return existingAssetKeys.map((asset_key) => ({ asset_key })) as T[]
    }
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: `candidate-event-${calls.length}` }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec }
}

describe('constructionOrganizationCandidateAnchorBackfillService', () => {
  it('dry-runs existing project construction organization candidate anchors without runtime or plan writes', async () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      buildingCount: 3,
      basementLevelCount: 1,
      basementAreaM2: 12000,
    })
    const { calls, queryExec } = createQueryRecorder([{
      id: '00000000-0000-4000-8000-000000000001',
      metadata: {
        constructionOrganizationScenario: selection,
      },
    }])

    const result = await backfillConstructionOrganizationCandidateAnchors({
      companyId: '10000000-0000-4000-8000-000000000001',
      dryRun: true,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_anchor_backfill_service',
      mode: 'dry_run',
      scannedProjectCount: 1,
      backfillableProjectCount: 1,
      backfilledProjectCount: 0,
      candidateEventCount: selection.planOptions.length,
    }))
    expect(result.projects[0]).toEqual(expect.objectContaining({
      projectId: '00000000-0000-4000-8000-000000000001',
      status: 'candidate_anchor_backfill_ready',
      candidateEventCount: selection.planOptions.length,
      runtimeEffectPolicy: 'candidate_only',
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect(calls.some((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))).toBe(false)
  })

  it('applies candidate-only anchor events from saved project facts when scenario metadata is missing', async () => {
    const { calls, queryExec } = createQueryRecorder([{
      id: '00000000-0000-4000-8000-000000000002',
      metadata: {
        projectGenerationFacts: {
          businessType: 'industrial',
          projectTypeCode: 'industrial',
          methodVariantCodes: ['steel_structure'],
          buildingCount: 2,
          totalAreaM2: 52000,
        },
      },
    }])

    const result = await backfillConstructionOrganizationCandidateAnchors({
      companyId: '10000000-0000-4000-8000-000000000001',
      dryRun: false,
      queryExec,
    })

    const candidateInsertCalls = calls.filter((call) =>
      call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'),
    )
    expect(result).toEqual(expect.objectContaining({
      mode: 'apply',
      scannedProjectCount: 1,
      backfillableProjectCount: 1,
      backfilledProjectCount: 1,
      skippedProjectCount: 0,
    }))
    expect(candidateInsertCalls.length).toBeGreaterThan(0)
    expect(candidateInsertCalls[0]?.params).toEqual(expect.arrayContaining([
      expect.stringMatching(/^construction_organization\.plan_option\./),
      'constructionOrganizationScenarioGovernanceService',
      expect.any(String),
      'project',
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      'candidate_weight',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
      expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
      }),
      expect.any(Object),
      'candidate_only',
    ]))

    const writeSql = calls
      .map((call) => call.sql.toLowerCase())
      .filter((sql) => sql.includes('insert') || sql.includes('update') || sql.includes('delete'))
      .join('\n')
    expect(writeSql).toContain('algorithm_asset_candidate_events')
    expect(writeSql).not.toContain('task_dependencies')
    expect(writeSql).not.toContain('algorithm_seed')
    expect(writeSql).not.toContain('critical_path')
    expect(writeSql).not.toContain('baseline')
  })

  it('skips projects that already have matching construction organization candidate anchors', async () => {
    const selection = selectConstructionOrganizationScenario({
      businessType: 'general_civil',
      projectTypeCode: 'residential',
      methodVariantCodes: ['pile_foundation'],
      buildingCount: 2,
    })
    const existingAssetKeys = selection.planOptions.map((option) =>
      `construction_organization.plan_option.${option.optionId}`,
    )
    const { calls, queryExec } = createQueryRecorderWithExistingAnchors([{
      id: '00000000-0000-4000-8000-000000000003',
      metadata: { constructionOrganizationScenario: selection },
    }], existingAssetKeys)

    const result = await backfillConstructionOrganizationCandidateAnchors({
      companyId: '10000000-0000-4000-8000-000000000001',
      dryRun: false,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      mode: 'apply',
      scannedProjectCount: 1,
      backfillableProjectCount: 0,
      backfilledProjectCount: 0,
      skippedProjectCount: 0,
      candidateEventCount: 0,
    }))
    expect(result.projects[0]).toEqual(expect.objectContaining({
      status: 'already_has_candidate_anchor',
      assetKeys: existingAssetKeys,
      runtimeEffectPolicy: 'candidate_only',
    }))
    expect(calls.some((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))).toBe(false)
  })
})
