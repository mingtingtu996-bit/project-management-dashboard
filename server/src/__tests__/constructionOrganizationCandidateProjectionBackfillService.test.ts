import { describe, expect, it } from 'vitest'
import {
  backfillConstructionOrganizationCandidateProjections,
} from '../services/constructionOrganizationCandidateProjectionBackfillService.js'
import {
  selectConstructionOrganizationScenario,
} from '../services/constructionOrganizationScenarioSelector.js'
import {
  projectConstructionOrganizationSelectionToGeneratedRows,
} from '../services/constructionOrganizationPlanOptionProjectionService.js'

const companyId = '10000000-0000-4000-8000-000000000001'
const projectId = '00000000-0000-4000-8000-000000000001'

function buildScenario() {
  return selectConstructionOrganizationScenario({
    businessType: 'general_civil',
    projectTypeCode: 'residential',
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    buildingCount: 1,
    basementLevelCount: 1,
    basementAreaM2: 8000,
    foundationDepthM: 4,
    climateSignals: [],
    weatherImpactBands: [],
  })
}

function createQueryRecorder() {
  const scenario = buildScenario()
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('FROM public.projects')) {
      return [{
        id: projectId,
        metadata: {
          constructionOrganizationScenario: scenario,
          wizard_generation_batch_id: 'batch-1',
        },
      }] as T[]
    }
    if (sql.includes('FROM public.tasks')) {
      return [
        {
          id: 'task-foundation',
          title: '桩基施工',
          standard_work_code: '01-02',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-20',
          duration_contribution_mode: 'duration_bearing',
          standard_task_metadata: {
            stableCode: '01-02',
            executionPhase: 'foundation_pit_pile',
            rowProjectionMode: 'schedule_row',
            durationContributionMode: 'duration_bearing',
            durationSuggestion: {
              recommendedDurationDays: 18,
              planReferenceDays: 20,
              contextualReferenceDays: 19,
            },
          },
        },
        {
          id: 'task-earthwork',
          title: '土方开挖',
          standard_work_code: '01-05',
          planned_start_date: '2026-06-21',
          planned_end_date: '2026-07-05',
          duration_contribution_mode: 'duration_bearing',
          standard_task_metadata: {
            stableCode: '01-05',
            executionPhase: 'foundation_pit_pile',
            rowProjectionMode: 'schedule_row',
            durationContributionMode: 'duration_bearing',
            durationSuggestion: {
              recommendedDurationDays: 14,
              planReferenceDays: 15,
              contextualReferenceDays: 15,
            },
          },
        },
        {
          id: 'task-basement',
          title: '地下室结构',
          standard_work_code: '01-07',
          planned_start_date: '2026-07-06',
          planned_end_date: '2026-09-15',
          duration_contribution_mode: 'duration_bearing',
          standard_task_metadata: {
            stableCode: '01-07',
            executionPhase: 'basement_structure',
            rowProjectionMode: 'schedule_row',
            durationContributionMode: 'duration_bearing',
            durationSuggestion: {
              recommendedDurationDays: 68,
              planReferenceDays: 72,
              contextualReferenceDays: 70,
            },
          },
        },
        {
          id: 'task-tower',
          title: '主体结构',
          standard_work_code: '02-01',
          planned_start_date: '2026-09-16',
          planned_end_date: '2027-03-01',
          duration_contribution_mode: 'duration_bearing',
          standard_task_metadata: {
            stableCode: '02-01',
            executionPhase: 'superstructure_rhythm',
            rowProjectionMode: 'schedule_row',
            durationContributionMode: 'duration_bearing',
            durationSuggestion: {
              recommendedDurationDays: 160,
              planReferenceDays: 167,
              contextualReferenceDays: 164,
            },
          },
        },
        {
          id: 'task-handoff',
          title: '竣工验收',
          standard_work_code: 'ACCEPT-01',
          planned_start_date: '2027-03-02',
          planned_end_date: '2027-03-10',
          duration_contribution_mode: 'duration_bearing',
          standard_task_metadata: {
            stableCode: 'ACCEPT-01',
            executionPhase: 'acceptance_handover',
            rowProjectionMode: 'schedule_row',
            durationContributionMode: 'duration_bearing',
            durationSuggestion: {
              recommendedDurationDays: 8,
              planReferenceDays: 9,
              contextualReferenceDays: 9,
            },
          },
        },
      ] as T[]
    }
    if (sql.includes('FROM public.algorithm_asset_candidate_events')) {
      return [{
        id: 'candidate-1',
        asset_key: `construction_organization.plan_option.${scenario.planOptions[0].optionId}`,
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: companyId,
        project_id: projectId,
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {
          source: 'construction_organization_scenario_selector',
          option: {
            optionId: scenario.planOptions[0].optionId,
            selectedScenarioIds: scenario.planOptions[0].selectedScenarioIds,
            generatedRowProjection: null,
          },
        },
      }] as T[]
    }
    if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
      return [{ id: 'candidate-projected-1' }] as T[]
    }
    return [] as T[]
  }
  return { calls, queryExec, scenario }
}

function createQueryRecorderWithoutDurationMetadata() {
  const base = createQueryRecorder()
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const rows = await base.queryExec<T>(sql, params)
    if (!sql.includes('FROM public.tasks')) return rows
    return rows.map((row) => {
      const record = row as Record<string, unknown>
      return {
        ...record,
        standard_task_metadata: {
          stableCode: (record.standard_task_metadata as any)?.stableCode,
          executionPhase: (record.standard_task_metadata as any)?.executionPhase,
          rowProjectionMode: (record.standard_task_metadata as any)?.rowProjectionMode,
          durationContributionMode: (record.standard_task_metadata as any)?.durationContributionMode,
        },
      }
    }) as T[]
  }
  return { ...base, queryExec }
}

describe('constructionOrganizationCandidateProjectionBackfillService', () => {
  it('upgrades historical construction organization candidates with generated-row review packages without runtime writes', async () => {
    const { calls, queryExec, scenario } = createQueryRecorder()

    const result = await backfillConstructionOrganizationCandidateProjections({
      companyId,
      projectId,
      dryRun: false,
      queryExec,
    })

    expect(result).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_projection_backfill_service',
      mode: 'apply',
      scannedProjectCount: 1,
      upgradedProjectCount: 1,
      upgradedCandidateEventCount: 1,
    }))
    expect(result.projects[0]).toEqual(expect.objectContaining({
      status: 'projection_candidate_backfilled',
      projectedCandidateEventCount: 1,
      runtimeEffectPolicy: 'candidate_only',
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesBaseline: false,
        writesSeed: false,
        writesTaskFacts: false,
        writesAccelerationDraft: false,
        writesCriticalPathFacts: false,
      }),
    }))

    const insert = calls.find((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))
    expect(insert?.params).toEqual(expect.arrayContaining([
      `construction_organization.plan_option.${scenario.planOptions[0].optionId}`,
      'constructionOrganizationScenarioGovernanceService',
      'project',
      companyId,
      projectId,
      'candidate_weight',
      'governed_candidate',
      'manual_governance_required',
      'auto_review_package',
      'review_required',
    ]))
    const payload = insert?.params.find((param) =>
      typeof param === 'object'
      && param
      && (param as Record<string, unknown>).source === 'construction_organization_scenario_selector',
    ) as Record<string, unknown>
    const option = payload.option as Record<string, unknown>
    const projection = option.generatedRowProjection as Record<string, unknown>
    const reviewPackage = projection.materializationReviewPackage as Record<string, unknown>
    const referenceEvidence = projection.generatedRowReferenceDurationEvidence as Record<string, unknown>
    expect(reviewPackage).toEqual(expect.objectContaining({
      source: 'construction_organization_candidate_materialization_review_package',
      reviewRequired: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(referenceEvidence).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_reference_duration_projection',
      matchedReferenceRowCount: expect.any(Number),
      totalPlanReferenceDays: expect.any(Number),
      totalContextualReferenceDays: expect.any(Number),
      totalRecommendedDurationDays: expect.any(Number),
      writesReferenceDuration: false,
      writesPlanDates: false,
      writesSeed: false,
    }))
    expect(referenceEvidence.matchedReferenceRowCount as number).toBeGreaterThan(0)
    expect(referenceEvidence.totalPlanReferenceDays as number).toBeGreaterThan(0)
    expect(calls.find((call) => call.sql.includes('FROM public.tasks'))?.sql).toContain('standard_task_metadata')
    expect(calls.find((call) => call.sql.includes('FROM public.tasks'))?.sql).not.toContain('NULL::jsonb AS standard_task_metadata')
    expect(String(JSON.stringify(reviewPackage))).toContain('task-')
    expect(result.boundaryPolicy).toEqual(expect.arrayContaining([
      'candidate_projection_backfill_does_not_claim_runtime_closeout',
      'does_not_write_task_dependencies_or_plan_dates',
    ]))
  })

  it('can explicitly reproject existing candidate review packages without runtime writes', async () => {
    const { calls, queryExec } = createQueryRecorder()

    const first = await backfillConstructionOrganizationCandidateProjections({
      companyId,
      projectId,
      dryRun: true,
      queryExec,
    })
    expect(first.projects[0]).toEqual(expect.objectContaining({
      status: 'projection_candidate_backfill_ready',
      projectedCandidateEventCount: 1,
    }))

    const second = await backfillConstructionOrganizationCandidateProjections({
      companyId,
      projectId,
      dryRun: true,
      forceReproject: false,
      queryExec,
    })
    expect(second.projects[0]).toEqual(expect.objectContaining({
      status: 'projection_candidate_backfill_ready',
    }))

    const forced = await backfillConstructionOrganizationCandidateProjections({
      companyId,
      projectId,
      dryRun: true,
      forceReproject: true,
      queryExec,
    })

    expect(forced.projects[0]).toEqual(expect.objectContaining({
      status: 'projection_candidate_backfill_ready',
      reason: 'force_reproject_existing_projection_candidates',
      projectedCandidateEventCount: 1,
      runtimeEffectPolicy: 'candidate_only',
    }))
    expect(forced.boundaryPolicy).toEqual(expect.arrayContaining([
      'force_reproject_is_explicit_and_candidate_only',
      'does_not_write_task_dependencies_or_plan_dates',
    ]))
    expect(calls.filter((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))).toHaveLength(0)
  })

  it('reprojects legacy violation review packages that predate date conflict evidence', async () => {
    const base = createQueryRecorder()
    const generatedRows = [
      {
        id: 'task-foundation',
        title: '桩基施工',
        stableCode: '01-02',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-10',
        plannedEndDate: '2026-06-20',
        smartReferenceDays: 10,
        durationSuggestion: {
          recommendedDurationDays: 10,
          planReferenceDays: 10,
          contextualReferenceDays: 10,
        },
      },
      {
        id: 'task-earthwork',
        title: '土方开挖',
        stableCode: '01-05',
        executionPhase: 'foundation_pit_pile',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-09',
        smartReferenceDays: 9,
        durationSuggestion: {
          recommendedDurationDays: 9,
          planReferenceDays: 9,
          contextualReferenceDays: 9,
        },
      },
      {
        id: 'task-basement',
        title: '地下室结构',
        stableCode: '01-07',
        executionPhase: 'basement_structure',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-06-21',
        plannedEndDate: '2026-07-20',
        smartReferenceDays: 30,
        durationSuggestion: {
          recommendedDurationDays: 30,
          planReferenceDays: 30,
          contextualReferenceDays: 30,
        },
      },
      {
        id: 'task-tower',
        title: '主体结构',
        stableCode: '02-01',
        executionPhase: 'superstructure_rhythm',
        rowProjectionMode: 'schedule_row',
        durationContributionMode: 'duration_bearing',
        plannedStartDate: '2026-07-21',
        plannedEndDate: '2026-12-31',
        smartReferenceDays: 160,
        durationSuggestion: {
          recommendedDurationDays: 160,
          planReferenceDays: 160,
          contextualReferenceDays: 160,
        },
      },
    ]
    const legacyProjectedScenario = projectConstructionOrganizationSelectionToGeneratedRows(base.scenario, generatedRows)
    const legacyOption = legacyProjectedScenario.planOptions.find((option) =>
      option.evaluation.generatedRowProjection?.materializationReviewPackage?.status === 'blocked_by_violations',
    )
    if (!legacyOption) throw new Error('Expected a violation-blocked projected option fixture')
    const legacyProjection = legacyOption.evaluation.generatedRowProjection
    const legacyReviewPackage = {
      ...legacyProjection?.materializationReviewPackage,
      conflictEvidence: [],
    }

    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('FROM public.projects')) {
        return [{
          id: projectId,
          metadata: {
            constructionOrganizationScenario: base.scenario,
          },
        }] as T[]
      }
      if (sql.includes('FROM public.tasks')) {
        return generatedRows.map((row) => ({
          id: row.id,
          title: row.title,
          standard_work_code: row.stableCode,
          planned_start_date: row.plannedStartDate,
          planned_end_date: row.plannedEndDate,
          duration_contribution_mode: row.durationContributionMode,
          standard_task_metadata: {
            stableCode: row.stableCode,
            executionPhase: row.executionPhase,
            rowProjectionMode: row.rowProjectionMode,
            durationContributionMode: row.durationContributionMode,
            smartReferenceDays: row.smartReferenceDays,
            durationSuggestion: row.durationSuggestion,
          },
        })) as T[]
      }
      if (sql.includes('FROM public.algorithm_asset_candidate_events')) {
        return [{
          id: 'legacy-candidate-without-conflict-evidence',
          asset_key: `construction_organization.plan_option.${legacyOption.optionId}`,
          source_module: 'constructionOrganizationScenarioGovernanceService',
          company_id: companyId,
          project_id: projectId,
          event_status: 'review_required',
          runtime_effect: 'candidate_only',
          candidate_payload: {
            source: 'construction_organization_scenario_selector',
            option: {
              optionId: legacyOption.optionId,
              selectedScenarioIds: legacyOption.selectedScenarioIds,
              generatedRowProjection: {
                ...legacyProjection,
                materializationReviewPackage: legacyReviewPackage,
              },
            },
          },
        }] as T[]
      }
      if (sql.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return [{ id: 'candidate-reprojected-with-conflict-evidence' }] as T[]
      }
      return [] as T[]
    }

    const result = await backfillConstructionOrganizationCandidateProjections({
      companyId,
      projectId,
      dryRun: false,
      queryExec,
    })

    expect(result.projects[0]).toEqual(expect.objectContaining({
      status: 'projection_candidate_backfilled',
      reason: 'legacy_projection_missing_date_conflict_evidence',
      projectedCandidateEventCount: 1,
    }))
    const insert = calls.find((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))
    const payload = insert?.params.find((param) =>
      typeof param === 'object'
      && param
      && (param as Record<string, unknown>).source === 'construction_organization_scenario_selector',
    ) as Record<string, unknown>
    const projectedOption = payload.option as Record<string, unknown>
    const projection = projectedOption.generatedRowProjection as Record<string, unknown>
    const reviewPackage = projection.materializationReviewPackage as Record<string, unknown>
    expect(reviewPackage).toEqual(expect.objectContaining({
      status: 'blocked_by_violations',
      writesTaskDependencies: false,
      writesPlanDates: false,
    }))
    expect(reviewPackage.conflictEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromGeneratedRowId: expect.any(String),
        toGeneratedRowId: expect.any(String),
        reason: expect.any(String),
        fromWindow: expect.objectContaining({
          plannedStartDate: expect.any(String),
          plannedEndDate: expect.any(String),
        }),
        toWindow: expect.objectContaining({
          plannedStartDate: expect.any(String),
          plannedEndDate: expect.any(String),
        }),
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    ]))
  })

  it('uses generated row planned windows as read-only E1 evidence when duration metadata is absent', async () => {
    const { calls, queryExec } = createQueryRecorderWithoutDurationMetadata()

    const result = await backfillConstructionOrganizationCandidateProjections({
      companyId,
      projectId,
      dryRun: false,
      queryExec,
    })

    expect(result.projects[0]).toEqual(expect.objectContaining({
      status: 'projection_candidate_backfilled',
      projectedCandidateEventCount: 1,
    }))
    const insert = calls.find((call) => call.sql.includes('INSERT INTO public.algorithm_asset_candidate_events'))
    const payload = insert?.params.find((param) =>
      typeof param === 'object'
      && param
      && (param as Record<string, unknown>).source === 'construction_organization_scenario_selector',
    ) as Record<string, unknown>
    const projection = (payload.option as Record<string, unknown>).generatedRowProjection as Record<string, unknown>
    const referenceEvidence = projection.generatedRowReferenceDurationEvidence as Record<string, unknown>

    expect(referenceEvidence).toEqual(expect.objectContaining({
      matchedReferenceRowCount: expect.any(Number),
      totalPlanReferenceDays: expect.any(Number),
      writesReferenceDuration: false,
      writesPlanDates: false,
      writesSeed: false,
    }))
    expect(referenceEvidence.matchedReferenceRowCount as number).toBeGreaterThan(0)
    expect(referenceEvidence.totalPlanReferenceDays as number).toBeGreaterThan(0)
    expect(String(JSON.stringify(referenceEvidence))).toContain('generated_row_planned_window_fallback')
  })
})
