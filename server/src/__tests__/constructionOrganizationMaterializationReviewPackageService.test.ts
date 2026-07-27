import { describe, expect, it } from 'vitest'
import { listConstructionOrganizationMaterializationReviewPackages } from '../services/constructionOrganizationMaterializationReviewPackageService.js'

function createQueryRecorder(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    if (sql.includes('FROM public.algorithm_asset_candidate_events')) return rows as T[]
    return [] as T[]
  }
  return { calls, queryExec }
}

function buildCandidatePayload(status: string, edgeCount: number, options: {
  optionId?: string
  selectedScenarioIds?: string[]
} = {}) {
  const optionId = options.optionId ?? `option-${status}`
  const selectedScenarioIds = options.selectedScenarioIds ?? ['pile_before_excavation', 'shared_basement_first_then_tower']
  return {
    source: 'construction_organization_scenario_selector',
    option: {
      optionId,
      selectedScenarioIds,
      useCaseEvaluations: {
        newProjectPlanning: {
          useCase: 'new_project_planning',
          factCoverage: {
            consumedFactKeys: ['scopeOrganizationFacts', 'methodVariantCodes'],
            sidecarFactKeys: ['towerCraneCount'],
          },
        },
      },
      generatedRowProjection: {
        candidateDependencyPreview: {
          source: 'construction_organization_candidate_dependency_preview',
          materializationReadiness: {
            readiness: status === 'ready_for_manual_review'
              ? 'ready_for_manual_materialization_preview'
              : 'evidence_only',
          },
          previewEdgeCount: edgeCount,
          unresolvedEdgeCount: 0,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        },
        materializationDecision: {
          decision: status === 'ready_for_manual_review'
            ? 'ready_for_manual_materialization'
            : 'evidence_only',
          allowManualMaterialization: status === 'ready_for_manual_review',
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        },
        materializationReviewPackage: {
          source: 'construction_organization_candidate_materialization_review_package',
          packageBasis: 'manual_review_package_from_generated_row_preview_edges',
          optionId,
          status,
          allowManualReview: status === 'ready_for_manual_review',
          proposedDependencyEdgeCount: edgeCount,
          blockedReasons: status === 'ready_for_manual_review' ? [] : ['evidence_only_candidate'],
          proposedDependencyEdges: Array.from({ length: edgeCount }, (_, index) => ({
            operation: 'propose_create_dependency',
            fromGeneratedRowIds: [`from-${index}`],
            toGeneratedRowIds: [`to-${index}`],
            dependencyType: 'FS',
            lagDays: 0,
            writesTaskDependencies: false,
          })),
          reviewRequired: true,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        },
      },
    },
  }
}

describe('constructionOrganizationMaterializationReviewPackageService', () => {
  it('reads manual materialization review packages from governed candidate events without runtime writes', async () => {
    const { calls, queryExec } = createQueryRecorder([
      {
        id: 'event-ready',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload('ready_for_manual_review', 2),
        created_at: '2026-06-21T12:00:00.000Z',
        updated_at: '2026-06-21T12:00:00.000Z',
      },
      {
        id: 'event-evidence',
        asset_key: 'construction_organization.plan_option.option-evidence',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload('evidence_only', 0),
        created_at: '2026-06-21T11:00:00.000Z',
        updated_at: '2026-06-21T11:00:00.000Z',
      },
      {
        id: 'event-no-package',
        asset_key: 'construction_organization.plan_option.option-no-package',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: {
          option: {
            optionId: 'option-no-package',
          },
        },
      },
    ])

    const report = await listConstructionOrganizationMaterializationReviewPackages({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      limit: 20,
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      source: 'construction_organization_materialization_review_package_read_model',
      totalCandidateEventRows: 3,
      totalReviewPackageItems: 2,
      readyForManualReviewCount: 1,
      evidenceOnlyCount: 1,
      proposedDependencyEdgeCount: 2,
      skippedMissingPackageCount: 1,
    }))
    expect(report.items[0]).toEqual(expect.objectContaining({
      candidateEventId: 'event-ready',
      assetKey: 'construction_organization.plan_option.option-ready',
      optionId: 'option-ready_for_manual_review',
      selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
      reviewPackage: expect.objectContaining({
        status: 'ready_for_manual_review',
        allowManualReview: true,
        proposedDependencyEdgeCount: 2,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'read_only_projection_from_algorithm_asset_candidate_events',
      'manual_review_package_is_not_runtime_approval',
      'no_task_dependencies_write',
    ]))

    expect(calls[0].sql).toContain('FROM public.algorithm_asset_candidate_events')
    expect(calls[0].params).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      'construction_organization.plan_option.%',
      'constructionOrganizationScenarioGovernanceService',
      20,
    ])
    expect(calls[0].sql).toContain('AND project_id = $2::uuid')
    expect(calls[0].sql).not.toContain('OR project_id')
    const writeSql = calls
      .map((call) => call.sql.toLowerCase())
      .filter((sql) => /\b(insert\s+into|update\s+|delete\s+from)\b/.test(sql))
      .join('\n')
    expect(writeSql).toBe('')
    expect(calls.map((call) => call.sql.toLowerCase()).join('\n')).not.toContain('task_dependencies')
  })

  it('keeps only the latest active review package per project option network while preserving distinct same-option networks', async () => {
    const { queryExec } = createQueryRecorder([
      {
        id: 'event-old',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload('ready_for_manual_review', 2, {
          optionId: 'option-shared',
          selectedScenarioIds: ['network-a'],
        }),
        created_at: '2026-06-21T10:00:00.000Z',
        updated_at: '2026-06-21T10:00:00.000Z',
      },
      {
        id: 'event-new',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload('ready_for_manual_review', 2, {
          optionId: 'option-shared',
          selectedScenarioIds: ['network-a'],
        }),
        created_at: '2026-06-21T12:00:00.000Z',
        updated_at: '2026-06-21T12:00:00.000Z',
      },
      {
        id: 'event-same-option-other-network',
        asset_key: 'construction_organization.plan_option.option-ready',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload('ready_for_manual_review', 1, {
          optionId: 'option-shared',
          selectedScenarioIds: ['network-b'],
        }),
        created_at: '2026-06-21T11:30:00.000Z',
        updated_at: '2026-06-21T11:30:00.000Z',
      },
      {
        id: 'event-other-option',
        asset_key: 'construction_organization.plan_option.option-evidence',
        source_module: 'constructionOrganizationScenarioGovernanceService',
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        event_status: 'review_required',
        runtime_effect: 'candidate_only',
        candidate_payload: buildCandidatePayload('evidence_only', 3),
        created_at: '2026-06-21T11:00:00.000Z',
        updated_at: '2026-06-21T11:00:00.000Z',
      },
    ])

    const report = await listConstructionOrganizationMaterializationReviewPackages({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      limit: 20,
      queryExec,
    })

    expect(report).toEqual(expect.objectContaining({
      totalCandidateEventRows: 4,
      totalReviewPackageItems: 3,
      readyForManualReviewCount: 2,
      evidenceOnlyCount: 1,
      proposedDependencyEdgeCount: 6,
      skippedMissingPackageCount: 0,
    }))
    expect(report.items.map((item) => item.candidateEventId)).toEqual([
      'event-new',
      'event-same-option-other-network',
      'event-other-option',
    ])
    expect(report.boundaryPolicy).toEqual(expect.arrayContaining([
      'active_read_model_uses_latest_review_package_per_project_option_network',
    ]))
  })

  it('keeps company-wide reads available without a project-scoped OR predicate', async () => {
    const { calls, queryExec } = createQueryRecorder([])

    await listConstructionOrganizationMaterializationReviewPackages({
      companyId: '10000000-0000-4000-8000-000000000001',
      limit: 20,
      queryExec,
    })

    expect(calls[0].sql).toContain('WHERE company_id = $1::uuid')
    expect(calls[0].sql).not.toContain('OR project_id')
    expect(calls[0].sql).not.toContain('project_id = $2::uuid')
    expect(calls[0].params).toEqual([
      '10000000-0000-4000-8000-000000000001',
      'construction_organization.plan_option.%',
      'constructionOrganizationScenarioGovernanceService',
      20,
    ])
  })

  it('requires company scope before exposing governance review packages', async () => {
    await expect(listConstructionOrganizationMaterializationReviewPackages({
      queryExec: async () => [],
    })).rejects.toThrow('construction_organization_materialization_review_requires_company_id')
  })
})
