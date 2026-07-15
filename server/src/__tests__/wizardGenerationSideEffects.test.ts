import express from 'express'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  getClient: vi.fn(),
  txClientQuery: vi.fn(),
  txClientRelease: vi.fn(),
  getCurrentCompanyMembership: vi.fn(),
  ensureDefaultCompanyForUser: vi.fn(),
  getProjectPermissionLevel: vi.fn(),
  getRequestCompanyId: vi.fn(),
  generateWbsTemplateRows: vi.fn(),
  buildCandidateNetworkEvaluationFromGeneratedDependencies: vi.fn(),
  createTaskInMainChain: vi.fn(),
  createTasksInWizardBatch: vi.fn(),
  replaceTaskDependencies: vi.fn(),
  replaceWizardGeneratedTaskDependenciesBatch: vi.fn(),
  buildTemplateRecommendation: vi.fn(),
  materializeWizardScopeTree: vi.fn(),
  writeChangeLog: vi.fn(),
  clearProjectBootstrapCache: vi.fn(),
  recordConstructionOrganizationPlanNetworkRecommendationDecision: vi.fn(),
  recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation: vi.fn(),
  recordConstructionOrganizationPlanNetworkSavedOutcome: vi.fn(),
  recalculateProjectCriticalPath: vi.fn(),
  resolveConstructionCalendarContext: vi.fn(),
  executeProjectCreationUnderCommercialGuard: vi.fn(),
  commercialTransactionQuery: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'owner' }
    next()
  }),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: mocks.getRequestCompanyId,
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: mocks.getCurrentCompanyMembership,
  ensureDefaultCompanyForUser: mocks.ensureDefaultCompanyForUser,
  getProjectPermissionLevel: mocks.getProjectPermissionLevel,
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
  getClient: mocks.getClient,
}))

vi.mock('../services/wbsTemplateGenerationService.js', () => ({
  CHINA_GB55032_TEMPLATE_ID: 'china-gb55032-template',
  generateWbsTemplateRows: mocks.generateWbsTemplateRows,
  buildCandidateNetworkEvaluationFromGeneratedDependencies: mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies,
}))

vi.mock('../services/projectFactsToTemplateService.js', () => ({
  buildTemplateRecommendation: mocks.buildTemplateRecommendation,
}))

vi.mock('../services/engineeringObjectService.js', () => ({
  createEngineeringObject: vi.fn(),
  updateEngineeringObject: vi.fn(),
}))

vi.mock('../services/wizardScopeMaterializationService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/wizardScopeMaterializationService.js')>()
  return {
    ...actual,
    materializeWizardScopeTree: mocks.materializeWizardScopeTree,
  }
})

vi.mock('../services/taskWriteChainService.js', () => ({
  createTaskInMainChain: mocks.createTaskInMainChain,
  createTasksInWizardBatch: mocks.createTasksInWizardBatch,
}))

vi.mock('../services/taskStandardModelService.js', () => ({
  replaceTaskDependencies: mocks.replaceTaskDependencies,
  replaceWizardGeneratedTaskDependenciesBatch: mocks.replaceWizardGeneratedTaskDependenciesBatch,
}))

vi.mock('../services/changeAuditService.js', () => ({
  writeChangeLog: mocks.writeChangeLog,
}))

vi.mock('../services/projectBootstrapService.js', () => ({
  clearProjectBootstrapCache: mocks.clearProjectBootstrapCache,
}))

vi.mock('../services/constructionOrganizationPlanNetworkRuntimeEvidenceService.js', () => ({
  recordConstructionOrganizationPlanNetworkRecommendationDecision:
    mocks.recordConstructionOrganizationPlanNetworkRecommendationDecision,
  recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation:
    mocks.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation,
  recordConstructionOrganizationPlanNetworkSavedOutcome:
    mocks.recordConstructionOrganizationPlanNetworkSavedOutcome,
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  recalculateProjectCriticalPath: mocks.recalculateProjectCriticalPath,
}))

vi.mock('../services/constructionCalendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/constructionCalendar.js')>()
  return {
    ...actual,
    resolveConstructionCalendarContext: mocks.resolveConstructionCalendarContext,
  }
})

vi.mock('../services/commercialTransactionService.js', () => ({
  executeProjectCreationUnderCommercialGuard: mocks.executeProjectCreationUnderCommercialGuard,
}))

const { default: projectWizardRouter } = await import('../routes/projectWizard.js')
const { default: milestonePresetsRouter } = await import('../routes/milestonePresets.js')
const projectWizardSource = readFileSync(resolve(__dirname, '..', 'routes', 'projectWizard.ts'), 'utf8')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(projectWizardRouter)
  app.use(milestonePresetsRouter)
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error?.statusCode ?? 500).json({
      success: false,
      error: {
        code: error?.code ?? 'TEST_ERROR',
        message: error?.message ?? String(error),
        details: error?.details,
      },
    })
  })
  return app
}

function makeWizardPayload(overrides: Record<string, unknown> = {}) {
  return {
    step: 6,
    mode: 'starting_line',
    projectName: '鍖婚櫌鏀规墿寤洪」鐩?',
    location: '涓婃捣',
    businessType: 'hospital',
    detailLevel: 'standard',
    methodVariantCodes: ['cast_in_place_rebar'],
    projectFeatures: { operatingRoomCount: 6 },
    scopeTree: [{ id: 'phase-1', type: 'phase', name: '涓€鏈?' }],
    planScopeCaliber: 'full_project_master',
    deliveryStandard: 'full_fitout',
    terminalEvent: 'completion_acceptance',
    plannedStartDate: '2026-06-01',
    plannedEndDate: '2028-06-01',
    actualStartDate: '2026-05-10',
    onboardingSubstage: 'main_structure',
    onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance'],
    ...overrides,
  }
}

function inferInclusiveDateDurationDays(startDate: unknown, endDate: unknown): number | null {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') return null
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate)
  if (!startMatch || !endMatch) return null

  const startMs = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]))
  const endMs = Date.UTC(Number(endMatch[1]), Number(endMatch[2]) - 1, Number(endMatch[3]))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null

  return Math.floor((endMs - startMs) / 86_400_000) + 1
}

function withCandidatePlanQualityAssets<T extends Array<Record<string, any>>>(rows: T): T {
  return rows.map((row, index) => {
    const values = { ...(row.values ?? {}) }
    const metadata = { ...(values.standard_task_metadata ?? {}) }
    const durationAssetCalculation = { ...(metadata.durationAssetCalculation ?? {}) }
    const stableCode = `TEST-DURATION-ASSET-${index + 1}`
    const isMilestone = values.is_milestone === true
      || metadata.isAcceptanceMilestone === true
      || metadata.planItemKind === 'milestone'
      || values.wbs_node_type === 'milestone'
    const inferredDurationDays = inferInclusiveDateDurationDays(
      values.planned_start_date ?? values.start_date,
      values.planned_end_date ?? values.end_date,
    )
    const fallbackDurationDays = isMilestone ? 1 : (inferredDurationDays ?? 10)
    const p50Days = durationAssetCalculation.selectedDurationDays
      ?? durationAssetCalculation.baseSelectedDurationDays
      ?? fallbackDurationDays
    const p80Days = Math.max(p50Days, durationAssetCalculation.baseSelectedDurationDays ?? p50Days) + 2

    return {
      ...row,
      values: {
        ...values,
        row_projection_mode: values.row_projection_mode ?? 'schedule_row',
        is_executable: values.is_executable ?? true,
        is_wbs_summary: values.is_wbs_summary ?? false,
        duration_suggestion: values.duration_suggestion ?? {
          durationRiskRange: {
            p20Days: Math.max(1, p50Days - 2),
            p50Days,
            p80Days,
            source: 'standard_work_duration_seed+t2_division_rhythm_template',
          },
        },
        standard_task_metadata: {
          ...metadata,
          calendarBasis: metadata.calendarBasis ?? 'official_construction_calendar_seed',
          constructionCalendarWindowCount: metadata.constructionCalendarWindowCount ?? 1,
          durationAssetCalculation: {
            selectedDurationDays: p50Days,
            baseSelectedDurationDays: durationAssetCalculation.baseSelectedDurationDays ?? p50Days,
            standardWorkDurationSeedStableCode:
              durationAssetCalculation.standardWorkDurationSeedStableCode ?? stableCode,
            standardWorkDurationSeedResolverSource:
              durationAssetCalculation.standardWorkDurationSeedResolverSource ?? 'runtime_seed_registry',
            standardWorkDurationSeedResolverVersionId:
              durationAssetCalculation.standardWorkDurationSeedResolverVersionId ?? 'seed-runtime-v3',
            t2RhythmTemplateId:
              durationAssetCalculation.t2RhythmTemplateId ?? `t2-test-duration-asset-${index + 1}`,
            t2RhythmTemplateResolverSource:
              durationAssetCalculation.t2RhythmTemplateResolverSource ?? 'runtime_t2_registry',
            t2RhythmTemplateResolverVersionId:
              durationAssetCalculation.t2RhythmTemplateResolverVersionId ?? 't2-runtime-v2',
            runtimeReferenceDaysConsumed:
              durationAssetCalculation.runtimeReferenceDaysConsumed ?? true,
            runtimeReferenceDaysEvidenceLevel:
              durationAssetCalculation.runtimeReferenceDaysEvidenceLevel ?? 'runtime_calibrated_l2',
            runtimeReferenceDaysStableCode:
              durationAssetCalculation.runtimeReferenceDaysStableCode ?? stableCode,
            runtimeReferenceDaysP50Days:
              durationAssetCalculation.runtimeReferenceDaysP50Days ?? p50Days,
            runtimeReferenceDaysP80Days:
              durationAssetCalculation.runtimeReferenceDaysP80Days ?? p80Days,
            runtimeReferenceDaysSampleCount:
              durationAssetCalculation.runtimeReferenceDaysSampleCount ?? 3,
            runtimeReferenceDaysMutationBoundary:
              durationAssetCalculation.runtimeReferenceDaysMutationBoundary ?? 'candidate_only_no_business_fact_write',
            processSeasonalDurationAssetConsumed:
              durationAssetCalculation.processSeasonalDurationAssetConsumed ?? true,
            processSeasonalClimateSignal:
              durationAssetCalculation.processSeasonalClimateSignal ?? 'standard_season',
            processSeasonalImpactBand:
              durationAssetCalculation.processSeasonalImpactBand ?? 'normal_productivity',
            processSeasonalMultiplier:
              durationAssetCalculation.processSeasonalMultiplier ?? 1,
            processSeasonalMutationBoundary:
              durationAssetCalculation.processSeasonalMutationBoundary ?? 'candidate_only_no_seed_write',
            dependencyAssetConsumed:
              durationAssetCalculation.dependencyAssetConsumed ?? true,
            dependencyAssetType:
              durationAssetCalculation.dependencyAssetType ?? 'cross_item_workflow',
            dependencyAssetStableCode:
              durationAssetCalculation.dependencyAssetStableCode ?? `dep-test-duration-asset-${index + 1}`,
            dependencyAssetAutoApplyPolicy:
              durationAssetCalculation.dependencyAssetAutoApplyPolicy ?? 'confirmed_template_only',
            dependencyAssetStrength:
              durationAssetCalculation.dependencyAssetStrength ?? 'hard',
            dependencyAssetHandoffCategory:
              durationAssetCalculation.dependencyAssetHandoffCategory ?? 'test_candidate_sequence',
            dependencyAssetDependencyType:
              durationAssetCalculation.dependencyAssetDependencyType ?? 'FS',
            dependencyAssetLagDays:
              durationAssetCalculation.dependencyAssetLagDays ?? 0,
            dependencyAssetEvidenceSourceKeys:
              durationAssetCalculation.dependencyAssetEvidenceSourceKeys ?? [`dep-source-${index + 1}`],
            ...durationAssetCalculation,
          },
        },
      },
    }
  }) as unknown as T
}

function makeCandidatePlanQualityRows(rowId = 'candidate-quality-row') {
  return withCandidatePlanQualityAssets([{
    clientRowId: rowId,
    parentClientRowId: null,
    sortOrder: 1,
    predecessorClientRowIds: [],
    predecessorDependencies: [],
    values: {
      title: '候选质量门禁测试工序',
      wbs_node_type: 'process',
      is_wbs_summary: false,
      is_executable: true,
      row_projection_mode: 'schedule_row',
      start_date: '2026-06-01',
      end_date: '2026-06-10',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-10',
      progress: 0,
      status: 'todo',
      standard_task_metadata: { stableCode: rowId },
    },
  }])
}

function makeCandidateNetworkEvaluation(rowIds: string[], options: {
  projectedNetworkSpanDays?: number
  previewEdgeCount?: number
  unresolvedEdgeCount?: number
} = {}) {
  return {
    source: 'generated_wbs_row_candidate_network_cpm',
    networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
    projectedNetworkSpanDays: options.projectedNetworkSpanDays ?? Math.max(1, rowIds.length * 10),
    previewEdgeCount: options.previewEdgeCount ?? Math.max(0, rowIds.length - 1),
    processConstraintRoutingCandidateEdgeCount: 0,
    unresolvedEdgeCount: options.unresolvedEdgeCount ?? 0,
    criticalGeneratedRowIds: rowIds,
    materializationStatus: 'fully_mapped_read_only',
    rowSchedule: rowIds.map((rowId, index) => ({
      generatedRowId: rowId,
      startDay: index * 10,
      finishDay: index * 10 + 10,
      durationDays: 10,
      totalFloatDays: 0,
      isCritical: true,
    })),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  }
}

const PROJECT_ACTIVE_STATUS = '进行中'

function findCompletedProjectMetadataUpdateCall() {
  return mocks.rawQuery.mock.calls.find(([sql, params]) => (
    String(sql).includes('UPDATE projects')
    && String(sql).includes('default_wbs_generated = $5')
    && Array.isArray(params)
    && String(params[1]).includes('wizard_created_task_ids')
  ))
}

function readCompletedProjectMetadata() {
  const updateCall = findCompletedProjectMetadataUpdateCall()
  return JSON.parse(String(updateCall?.[1]?.[1] ?? '{}'))
}

function findCriticalPathRefreshMetadataUpdateCall() {
  return mocks.rawQuery.mock.calls.find(([sql, params]) => (
    String(sql).includes('UPDATE projects')
    && Array.isArray(params)
    && String(params[1] ?? '').includes('wizard_generation_critical_path_refresh')
  ))
}

function readCriticalPathRefreshMetadata() {
  const updateCall = findCriticalPathRefreshMetadataUpdateCall()
  return JSON.parse(String(updateCall?.[1]?.[1] ?? '{}'))
}

describe('v1.4.22.1 project wizard route side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rawQuery.mockReset()
    mocks.rawQuery.mockResolvedValue({ rows: [] })
    mocks.txClientQuery.mockReset()
    mocks.txClientRelease.mockReset()
    mocks.txClientQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase()
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        return { rowCount: 0, rows: [] }
      }
      return mocks.rawQuery(sql, params)
    })
    mocks.getClient.mockResolvedValue({
      query: mocks.txClientQuery,
      release: mocks.txClientRelease,
    })
    mocks.commercialTransactionQuery.mockImplementation(async (sql: string, params: unknown[] = []) => (
      mocks.rawQuery(sql, params)
    ))
    mocks.executeProjectCreationUnderCommercialGuard.mockImplementation(async ({ create }: {
      create: (client: { query: typeof mocks.commercialTransactionQuery }) => Promise<unknown>
    }) => create({ query: mocks.commercialTransactionQuery }))
    mocks.getRequestCompanyId.mockReturnValue('company-1')
    mocks.getCurrentCompanyMembership.mockResolvedValue({ companyId: 'company-1', role: 'company_admin' })
    mocks.ensureDefaultCompanyForUser.mockResolvedValue('company-1')
    mocks.getProjectPermissionLevel.mockResolvedValue('owner')
    mocks.resolveConstructionCalendarContext.mockResolvedValue({ basis: 'calendar_day', windows: [] })
    mocks.materializeWizardScopeTree.mockImplementation(async ({ scopeTree }: { scopeTree: unknown[] }) => ({
      objectIdByDraftId: {},
      enrichedScopeTree: scopeTree,
      materializedObjects: [],
      generationScope: {},
    }))
    mocks.buildTemplateRecommendation.mockReturnValue({
      matchedTemplates: ['china-gb55032-template'],
      triggeredItemPacks: ['hospital_core_pack'],
      triggeredDangerItems: ['deep_foundation'],
      triggeredMilestones: ['foundation_acceptance'],
      scopeAssignmentRules: [{ itemPackPattern: 'HOSPITAL', effect: 'assign_to_functional_area', priority: 10 }],
      expectedRowCount: { overview: 120, standard: 420, detailed: 1500 },
    })
    mocks.generateWbsTemplateRows.mockResolvedValue({
      rows: [
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '涓讳綋缁撴瀯鏂藉伐',
            row_projection_mode: 'schedule_row',
            is_executable: true,
            is_wbs_summary: false,
            status: 'in_progress',
            progress: 50,
            onboarding_stage_classification: 'history',
            is_historical: true,
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            duration_suggestion: {
              riskP20DurationDays: 8,
              riskP50DurationDays: 10,
              riskP80DurationDays: 14,
              durationRiskRange: {
                p20Days: 8,
                p50Days: 10,
                p80Days: 14,
                source: 'standard_work_duration_seed+t2_division_rhythm_template',
              },
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                standardWorkDurationSeedResolverVersionId: 'seed-runtime-v3',
                t2RhythmTemplateId: 't2-structure-main',
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                t2RhythmTemplateResolverVersionId: 't2-runtime-v2',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
                runtimeReferenceDaysStableCode: 'STD-STRUCTURE-MAIN',
                runtimeReferenceDaysP50Days: 10,
                runtimeReferenceDaysP80Days: 14,
                runtimeReferenceDaysSampleCount: 3,
                runtimeReferenceDaysMutationBoundary: 'candidate_only_no_business_fact_write',
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'rainy_season',
                processSeasonalImpactBand: 'earthwork_rain_sensitive',
                processSeasonalMultiplier: 1.2,
                processSeasonalMutationBoundary: 'candidate_only_no_seed_write',
                dependencyAssetConsumed: true,
                dependencyAssetType: 'cross_item_workflow',
                dependencyAssetStableCode: 'main_structure_to_masonry_infill',
                dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
                dependencyAssetStrength: 'hard',
                dependencyAssetHandoffCategory: 'structure_masonry_infill',
                dependencyAssetDependencyType: 'FS',
                dependencyAssetLagDays: 2,
                dependencyAssetEvidenceSourceKeys: ['dep-source-structure-main'],
              },
              projectOrganization: {
                scenarioSelection: {
                  source: 'construction_organization_scenario_selector',
                  recommendedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                  confidence: 'high',
                  recommendedPlanOption: {
                    optionId: 'plan-option-foundation-basement',
                    selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                    selectionReasons: ['pile_foundation_fact_present'],
                    excludedReasons: [{
                      scenarioId: 'tower_lane_early_release_after_core_basement',
                      reasons: ['starting_line_current_phase_past_foundation_or_basement'],
                    }],
                    projectOrganizationScheme: {
                      source: 'project_organization_policy_scheme_candidate',
                      evaluationRole: 'business_type_scheme_family_for_e1_e3_e5_candidate_evaluation',
                      policyId: 'project-organization-general-civil-multi-building-v1',
                      sourceVersion: 'v1.4.22-project-organization-20260620',
                      strategy: 'shared_basement_podium_then_multi_tower_lane_network',
                      schemeFamily: 'shared_works_then_multi_building_lane',
                      primaryInterfaceSequence: ['shared_basement_release', 'podium_interface', 'tower_lane_release'],
                      interfaceGateTags: ['shared_basement_gate', 'podium_gate', 'tower_lane_gate'],
                      laneRole: 'primary_building_lane',
                      lanePrefix: 'tower_lane',
                      networkPolicy: {
                        sharedWorksRelease: 'before_primary_lanes',
                        primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
                        interfaceGatePolicy: 'business_type_governed_gate_network',
                      },
                      confidence: 'high',
                      rationale: '姘戠敤寤虹瓚浠ュ叡浜湴涓嬪鍜屽妤兼爧杞﹂亾缁勭粐銆?',
                      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                      writesTaskDependencies: false,
                      writesPlanDates: false,
                      writesSeed: false,
                    },
                    evaluation: {
                      engineEvaluationSummary: {
                        projectOrganization: {
                          source: 'project_organization_policy_scheme_candidate',
                          schemeFamily: 'shared_works_then_multi_building_lane',
                          strategy: 'shared_basement_podium_then_multi_tower_lane_network',
                          interfaceGateTags: ['shared_basement_gate', 'podium_gate', 'tower_lane_gate'],
                        },
                      },
                    },
                  },
                  planOptions: [
                    {
                      optionId: 'plan-option-foundation-basement',
                      selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                      projectOrganizationScheme: {
                        source: 'project_organization_policy_scheme_candidate',
                        policyId: 'project-organization-general-civil-multi-building-v1',
                        sourceVersion: 'v1.4.22-project-organization-20260620',
                        strategy: 'shared_basement_podium_then_multi_tower_lane_network',
                        schemeFamily: 'shared_works_then_multi_building_lane',
                        primaryInterfaceSequence: ['shared_basement_release', 'podium_interface', 'tower_lane_release'],
                        interfaceGateTags: ['shared_basement_gate', 'podium_gate', 'tower_lane_gate'],
                        laneRole: 'primary_building_lane',
                        lanePrefix: 'tower_lane',
                        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                      },
                      useCaseEvaluations: {
                        newProjectPlanning: {
                          useCase: 'new_project_planning',
                          optionId: 'plan-option-foundation-basement',
                          optionScore: 87,
                          rankBasis: ['default_new_project_planning_option', 'uses_existing_wizard_project_facts'],
                          actionability: 'actionable_candidate',
                          recoveryFactorHint: 1.08,
                          e5RecoverableSpanDays: 5,
                          factCoverage: {
                            source: 'wizard_project_generation_fact_coverage',
                            usesExistingWizardFactsOnly: true,
                            consumedFactKeys: ['businessType', 'buildingCount'],
                            sidecarFactKeys: [],
                            missingFactKeys: [],
                            completenessScore: 1,
                            resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                          },
                          writesTaskDependencies: false,
                          writesPlanDates: false,
                          writesSeed: false,
                        },
                      },
                    },
                    { optionId: 'plan-option-tower-early' },
                  ],
                  planOptionComparisonPackage: {
                    source: 'construction_organization_plan_option_comparison_package',
                    totalOptionCount: 2,
                    recommendedOptionIdsByUseCase: {
                      newProjectPlanning: 'plan-option-foundation-basement',
                      startingLineOnboarding: 'plan-option-foundation-basement',
                      accelerationRecovery: 'plan-option-tower-early',
                    },
                    options: [
                      {
                        optionId: 'plan-option-foundation-basement',
                        isRecommendedFor: ['newProjectPlanning', 'startingLineOnboarding'],
                        nextGovernanceAction: 'manual_review_handoff',
                      },
                      {
                        optionId: 'plan-option-tower-early',
                        isRecommendedFor: ['accelerationRecovery'],
                        nextGovernanceAction: 'runtime_engine_evidence_required',
                      },
                    ],
                  },
                  organizationDecisionReport: {
                    source: 'construction_organization_decision_report',
                    reportRole: 'product_best_scheme_read_model',
                    optionCount: 2,
                    candidateCount: 3,
                    recommendedPlanOptionId: 'plan-option-foundation-basement',
                    recommendedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                    selectedByUseCase: {
                      newProjectPlanning: {
                        source: 'construction_organization_use_case_decision_report',
                        useCase: 'new_project_planning',
                        optionId: 'plan-option-foundation-basement',
                        selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                        actionability: 'actionable_candidate',
                        confidence: 'high',
                        decisionBasis: ['default_new_project_planning_option', 'uses_existing_wizard_project_facts'],
                        optionScore: 87,
                        virtualProjectDurationDays: 318,
                        e5RecoverableSpanDays: 5,
                        recoveryFactorHint: 1.08,
                        nextGovernanceAction: 'manual_review_handoff',
                        nextGovernanceReasons: ['ready_for_manual_review_handoff'],
                        excludedAlternatives: [],
                        factCoverage: null,
                        boundaryPolicy: {
                          recommendedBySystem: true,
                          candidateOnly: true,
                          resourcesAreSidecarSignals: true,
                          writesTaskDependencies: false,
                          writesPlanDates: false,
                          writesSeed: false,
                          writesCriticalPathFacts: false,
                          writesAccelerationDraft: false,
                        },
                      },
                      startingLineOnboarding: {
                        source: 'construction_organization_use_case_decision_report',
                        useCase: 'starting_line_onboarding',
                        optionId: 'plan-option-foundation-basement',
                        selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                        actionability: 'not_actionable_after_current_phase',
                        confidence: 'medium',
                        decisionBasis: ['starting_line_passed_milestones_present'],
                        optionScore: 82,
                        virtualProjectDurationDays: 318,
                        e5RecoverableSpanDays: 5,
                        recoveryFactorHint: 1.02,
                        nextGovernanceAction: 'evidence_only',
                        nextGovernanceReasons: ['starting_line_current_phase_past_foundation_or_basement'],
                        excludedAlternatives: [],
                        factCoverage: null,
                        boundaryPolicy: {
                          recommendedBySystem: true,
                          candidateOnly: true,
                          resourcesAreSidecarSignals: true,
                          writesTaskDependencies: false,
                          writesPlanDates: false,
                          writesSeed: false,
                          writesCriticalPathFacts: false,
                          writesAccelerationDraft: false,
                        },
                      },
                      accelerationRecovery: {
                        source: 'construction_organization_use_case_decision_report',
                        useCase: 'acceleration_recovery',
                        optionId: 'plan-option-tower-early',
                        selectedScenarioIds: ['pile_before_excavation', 'tower_lane_early_release_after_core_basement'],
                        actionability: 'actionable_candidate',
                        confidence: 'medium',
                        decisionBasis: ['e5_recoverable_span_priority', 'bounded_recovery_factor_only'],
                        optionScore: 91,
                        virtualProjectDurationDays: 291,
                        e5RecoverableSpanDays: 12,
                        recoveryFactorHint: 1.16,
                        nextGovernanceAction: 'runtime_engine_evidence_required',
                        nextGovernanceReasons: ['runtime_materialization_evidence_required'],
                        excludedAlternatives: [],
                        factCoverage: null,
                        boundaryPolicy: {
                          recommendedBySystem: true,
                          candidateOnly: true,
                          resourcesAreSidecarSignals: true,
                          writesTaskDependencies: false,
                          writesPlanDates: false,
                          writesSeed: false,
                          writesCriticalPathFacts: false,
                          writesAccelerationDraft: false,
                        },
                      },
                    },
                    decisionSignals: {
                      usesExistingWizardFactsOnly: true,
                      decisionFactKeys: ['businessType', 'buildingCount', 'scopeOrganizationFacts'],
                      contextFactKeys: ['mode', 'locationFacts'],
                      sidecarFactKeys: ['towerCraneCount'],
                      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                    },
                    engineEvidence: {
                      e1: 'virtual_work_package_duration_proxy_pending_generated_row_projection',
                      e3: 'combined_virtual_dependency_network_cpm_evaluated_not_persisted',
                      e5: 'bounded_recovery_factor_hint',
                    },
                    boundaryPolicy: {
                      candidateOnly: true,
                      readOnlyBestScheme: true,
                      runtimeMaterializationRequiresGovernance: true,
                      resourcesAreSidecarSignals: true,
                      writesTaskDependencies: false,
                      writesPlanDates: false,
                      writesSeed: false,
                      writesCriticalPathFacts: false,
                      writesAccelerationDraft: false,
                    },
                  },
                  scenarioRecommendations: {
                    newProjectPlanning: {
                      optionId: 'plan-option-foundation-basement',
                      selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                      recommendationBasis: ['default_new_project_planning_option', 'uses_existing_wizard_project_facts'],
                      actionability: 'actionable_candidate',
                      confidence: 'high',
                      recoveryFactorHint: 1.08,
                    },
                    startingLineOnboarding: {
                      optionId: 'plan-option-foundation-basement',
                      selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                      recommendationBasis: ['starting_line_passed_milestones_present', 'starting_line_current_phase_past_foundation_or_basement'],
                      currentSubstage: 'main_structure',
                      actionability: 'not_actionable_after_current_phase',
                      confidence: 'medium',
                      recoveryFactorHint: 1.02,
                    },
                    accelerationRecovery: {
                      optionId: 'plan-option-tower-early',
                      selectedScenarioIds: ['pile_before_excavation', 'tower_lane_early_release_after_core_basement'],
                      recommendationBasis: ['e5_recoverable_span_priority', 'bounded_recovery_factor_only'],
                      actionability: 'actionable_candidate',
                      confidence: 'medium',
                      recoveryFactorHint: 1.16,
                    },
                  },
                  factBasis: {
                    usesExistingWizardFactsOnly: true,
                    scopeOrganizationFacts: {
                      source: 'wizard_scope_objects',
                      buildingObjectCount: 2,
                      sharedBasementObjectCount: 1,
                      sharedBasementServiceTargetCount: 2,
                      serviceTargetKindCounts: { building: 2 },
                      sharedBasementServiceTargetKindCounts: { building: 2 },
                      organizationSignals: [
                        'multi_building_scope_objects',
                        'shared_basement_service_range',
                        'shared_basement_serves_multiple_buildings',
                      ],
                    },
                  },
                  boundaryPolicy: {
                    directSeedMutation: false,
                    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
                  },
                },
              },
            },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: 'row-1',
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'row-1', dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
          values: {
            title: '鎵嬫湳閮ㄦ満鐢甸鐣?',
            row_projection_mode: 'schedule_row',
            is_executable: true,
            is_wbs_summary: false,
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-15',
            duration_suggestion: {
              riskP20DurationDays: 3,
              riskP50DurationDays: 5,
              riskP80DurationDays: 7,
              durationRiskRange: {
                p20Days: 3,
                p50Days: 5,
                p80Days: 7,
                source: 'standard_work_duration_seed+t2_division_rhythm_template',
              },
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              durationAssetCalculation: {
                selectedDurationDays: 5,
                baseSelectedDurationDays: 5,
                standardWorkDurationSeedStableCode: 'STD-MEP-RESERVATION',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                standardWorkDurationSeedResolverVersionId: 'seed-runtime-v3',
                t2RhythmTemplateId: 't2-mep-reservation',
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                t2RhythmTemplateResolverVersionId: 't2-runtime-v2',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
                runtimeReferenceDaysStableCode: 'STD-MEP-RESERVATION',
                runtimeReferenceDaysP50Days: 5,
                runtimeReferenceDaysP80Days: 7,
                runtimeReferenceDaysSampleCount: 3,
                runtimeReferenceDaysMutationBoundary: 'candidate_only_no_business_fact_write',
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'standard_season',
                processSeasonalImpactBand: 'normal_productivity',
                processSeasonalMultiplier: 1,
                processSeasonalMutationBoundary: 'candidate_only_no_seed_write',
                dependencyAssetConsumed: true,
                dependencyAssetType: 'cross_item_workflow',
                dependencyAssetStableCode: 'main_structure_to_mep_reservation',
                dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
                dependencyAssetStrength: 'hard',
                dependencyAssetHandoffCategory: 'structure_mep_reservation',
                dependencyAssetDependencyType: 'FS',
                dependencyAssetLagDays: 0,
                dependencyAssetEvidenceSourceKeys: ['dep-source-mep-reservation'],
              },
            },
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        activeStandardWorkDurationSeedRowCount: 0,
        fallbackStandardWorkDurationSeedRowCount: 2,
        t2RhythmTemplateRowCount: 2,
        activeT2RhythmTemplateRowCount: 0,
        fallbackT2RhythmTemplateRowCount: 2,
        projectScaleQuantityProxyRowCount: 1,
        dependencyAssetConsumedRowCount: 1,
        dependencyTimingAssetConsumedRowCount: 1,
        criticalPathCandidateRowCount: 2,
        floatCalculatedRowCount: 2,
        featureTriggeredAcceptanceScheduleRowCount: 1,
        businessTypeSpecialtyDurationAssetRowCount: 1,
        businessTypeSpecificT2RhythmTemplateRowCount: 1,
        businessTypeAssetCoverage: [
          {
            businessType: 'school',
            profileScheduleRowCount: 2,
            specialtyDurationAssetRowCount: 1,
            specificT2RhythmTemplateRowCount: 1,
            rowsMissingSpecialtyDurationAssetCount: 1,
            rowsMissingSpecificT2RhythmTemplateCount: 1,
            activeStandardWorkDurationSeedRowCount: 0,
            fallbackStandardWorkDurationSeedRowCount: 2,
            activeT2RhythmTemplateRowCount: 0,
            fallbackT2RhythmTemplateRowCount: 2,
            productionWritePolicy: 'candidate_only_no_task_dependencies_write',
          },
        ],
        processSeasonalDurationAssetRowCount: 1,
        runtimeReferenceDaysRowCount: 0,
        constructionCalendarRowCount: 2,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        uniqueStandardWorkDurationSeedStableCodes: ['site_setup_temp_works'],
        uniqueT2RhythmTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        uniqueDependencyAssetStableCodes: ['wizard_mock_dependency_asset'],
        assetConsumptionSummary: {
          source: 'duration_asset_consumption_receipt_summary',
          totalCount: 2,
          effectiveAppliedCount: 2,
          advisoryUsedCount: 0,
          evidenceOnlyCount: 0,
          notApplicableCount: 0,
          blockedByConflictCount: 0,
          changedFieldCounts: {
            task_selection: 0,
            duration: 1,
            dates: 0,
            dependency: 1,
            overlap: 0,
            buffer: 0,
            confidence: 0,
          },
          effectiveStableCodes: ['STD-STRUCTURE-MAIN', 'wizard_mock_dependency_asset'],
        },
        effectiveAppliedAssetReceiptCount: 2,
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      durationAssetConsumptionReceipts: [
        {
          consumer: 'wizard_master_plan',
          assetType: 'standard_work_duration',
          stableCode: 'STD-STRUCTURE-MAIN',
          role: 'system_bootstrap',
          effectiveSource: 'system_bootstrap',
          versionId: null,
          publicationKey: null,
          status: 'effective_applied',
          changedFields: ['duration'],
          targetRowIds: ['row-1'],
          reasonCodes: ['system_standard_duration_authority_applied'],
          rollbackTarget: null,
        },
        {
          consumer: 'wizard_master_plan',
          assetType: 'construction_dependency_rule_system',
          stableCode: 'wizard_mock_dependency_asset',
          role: 'system_bootstrap',
          effectiveSource: 'system_bootstrap',
          versionId: null,
          publicationKey: null,
          status: 'effective_applied',
          changedFields: ['dependency'],
          targetRowIds: ['row-2'],
          reasonCodes: ['generated_dependency_changed_schedule_network'],
          rollbackTarget: null,
        },
      ],
      durationAssetConsumptionSummary: {
        source: 'duration_asset_consumption_receipt_summary',
        totalCount: 2,
        effectiveAppliedCount: 2,
        advisoryUsedCount: 0,
        evidenceOnlyCount: 0,
        notApplicableCount: 0,
        blockedByConflictCount: 0,
        changedFieldCounts: {
          task_selection: 0,
          duration: 1,
          dates: 0,
          dependency: 1,
          overlap: 0,
          buffer: 0,
          confidence: 0,
        },
        effectiveStableCodes: ['STD-STRUCTURE-MAIN', 'wizard_mock_dependency_asset'],
      },
      candidateNetworkEvaluation: {
        source: 'generated_wbs_row_candidate_network_cpm',
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        projectedNetworkSpanDays: 326,
        previewEdgeCount: 4,
        unresolvedEdgeCount: 0,
        criticalGeneratedRowIds: ['row-1', 'row-2'],
        materializationStatus: 'preview_only',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      onboardingSummary: { history: 4, in_progress: 2, future: 8 },
      targetFeasibility: {
        mode: 'compression_preview',
        targetEndDate: '2028-05-10',
        naturalEndDate: '2028-08-21',
        overshootDays: 103,
        recoverableDays: 103,
        unrecoverableDays: 0,
        verdict: 'compressible',
        strategies: [],
        accelerationProposal: {
          mode: 'preview_only',
          source: 'target_end_compression',
          targetEndDate: '2028-05-10',
          naturalEndDate: '2028-08-21',
          overshootDays: 103,
          totalRecoverDays: 103,
          remainingGapDays: 0,
          verdict: 'draft_recoverable',
          actions: [
            {
              type: 'fast_track',
              affectedRowIds: ['row-1', 'row-2'],
              recoverDays: 36,
              riskLevel: 'medium',
              explanation: '涓讳綋鍜屾満鐢靛彲鍋氱┛鎻掋€?',
              dependencyAdjustments: [{
                predecessorClientRowId: 'row-1',
                successorClientRowId: 'row-2',
                fromDependencyType: 'FS',
                toDependencyType: 'SS',
                lagDaysBefore: 0,
                lagDaysAfter: -7,
              }],
            },
            {
              type: 'crashing',
              affectedRowIds: ['row-2'],
              recoverDays: 12,
              riskLevel: 'medium',
              explanation: '澧炲姞璧勬簮鍘嬬缉鏈虹數棰勭暀宸ユ湡銆?',
              durationAdjustments: [{
                clientRowId: 'row-2',
                currentDurationDays: 15,
                proposedDurationDays: 12,
                minDurationDays: 10,
                recoverDays: 3,
                basis: 'resource_crash_preview',
              }],
            },
          ],
          protectedConstraints: [{
            clientRowId: 'row-1',
            title: '娣峰嚌鍦熷吇鎶?',
            reasonCode: 'curing_wait',
            durationDays: 7,
          }],
          rescheduleDraft: {
            mode: 'proposal_review',
            source: 'target_end_compression',
            writePolicy: 'requires_user_acceptance',
            taskDateAdjustments: [{
              clientRowId: 'row-2',
              title: '鎵嬫湳閮ㄦ満鐢甸鐣?',
              currentStartDate: '2026-06-11',
              currentEndDate: '2026-06-15',
              proposedStartDate: '2026-06-11',
              proposedEndDate: '2026-06-13',
              currentDurationDays: 15,
              proposedDurationDays: 12,
              recoverDays: 3,
              changedFields: ['planned_end_date'],
              visualDiff: {
                durationDeltaDays: -3,
                startDeltaDays: 0,
                endDeltaDays: -2,
                barDeltaKind: 'compressed',
              },
            }],
            dependencyAdjustments: [{
              predecessorClientRowId: 'row-1',
              successorClientRowId: 'row-2',
              fromDependencyType: 'FS',
              toDependencyType: 'SS',
              lagDaysBefore: 0,
              lagDaysAfter: -7,
            }],
            resourceAdjustments: [{
              clientRowId: 'row-2',
              currentDurationDays: 15,
              proposedDurationDays: 12,
              minDurationDays: 10,
              recoverDays: 3,
              basis: 'resource_crash_preview',
            }],
            operations: [{
              type: 'update',
              clientRowId: 'row-2',
              values: {
                planned_end_date: '2026-06-13',
              },
            }],
          },
        },
      },
    })
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockReset()
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockReturnValue(null)
    mocks.createTaskInMainChain.mockReset()
    mocks.createTasksInWizardBatch.mockReset()
    mocks.createTaskInMainChain
      .mockResolvedValueOnce({ task: { id: 'task-1', title: '涓讳綋缁撴瀯鏂藉伐' } })
      .mockResolvedValueOnce({ task: { id: 'task-2', title: '鎵嬫湳閮ㄦ満鐢甸鐣?' } })
    mocks.createTasksInWizardBatch.mockImplementation(async (items: Array<{ payload: Record<string, unknown> }>, actorId: string | null, options: Record<string, unknown>) => {
      const results = []
      for (const item of items) {
        results.push(await mocks.createTaskInMainChain(item.payload, actorId, options))
      }
      return results
    })
    mocks.replaceTaskDependencies.mockResolvedValue(undefined)
    mocks.replaceWizardGeneratedTaskDependenciesBatch.mockResolvedValue([])
    mocks.writeChangeLog.mockResolvedValue('change-1')
    mocks.recordConstructionOrganizationPlanNetworkRecommendationDecision.mockResolvedValue({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'recommendation_decision_recorded',
      recommendationKind: 'construction_organization_plan_network',
      recommendationKey: 'construction_organization_plan_network:plan-option-foundation-basement',
      actionType: 'adopted',
      decisionPersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
      boundaryPolicy: [],
    })
    mocks.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation.mockResolvedValue({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'runtime_consumer_observation_recorded',
      publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
      consumerKey: 'projectWizard',
      observationPersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
      boundaryPolicy: [],
    })
    mocks.recordConstructionOrganizationPlanNetworkSavedOutcome.mockResolvedValue({
      source: 'construction_organization_plan_network_runtime_evidence_service',
      status: 'saved_network_outcome_recorded',
      publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
      outcomeStatus: 'accepted',
      outcomePersisted: true,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
      reasons: [],
      boundaryPolicy: [],
    })
    mocks.recalculateProjectCriticalPath.mockResolvedValue({
      projectId: 'project-1',
      taskCount: 2,
      eligibleTaskCount: 2,
      criticalTaskIds: ['task-1', 'task-2'],
      projectDuration: 15,
      snapshot: {
        calculatedAt: '2026-06-24T00:00:00.000Z',
        calculationStatus: 'fresh',
        projectDurationDays: 15,
        autoTaskIds: ['task-1', 'task-2'],
        primaryChain: { taskIds: ['task-1', 'task-2'], displayLabel: '关键路径' },
        networkLineage: { criticalPathInputHash: 'hash-wizard-cpm' },
      },
    })
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('metadata = CASE WHEN metadata IS NULL THEN $2::jsonb ELSE metadata || $2::jsonb END')) {
        return { rowCount: 1, rows: [{ id: 'project-1' }] }
      }
      if (sql.includes('UPDATE task_conditions')) {
        return { rowCount: 1, rows: [{ id: 'condition-1' }] }
      }
      return { rowCount: 0, rows: [] }
    })
  })

  it('keeps wizard raw SQL fixed instead of reintroducing dynamic executeSQL wrappers', () => {
    expect(projectWizardSource).not.toMatch(/\bexecuteSQL(?:One)?\s*(?:<[^;]*?>)?\s*\(/)

    const rawQueryLiterals = [...projectWizardSource.matchAll(/rawQuery\s*(?:<[^;]*?>)?\s*\(\s*(`(?:\\`|[^`])*`|'(?:\\'|[^'])*')/gs)]
      .map((match) => match[1])
    const projectMetadataUpdates = rawQueryLiterals
      .filter((literal) => /UPDATE projects[\s\S]*SET metadata/i.test(literal))
      .join('\n')
    const dependencyDeletes = rawQueryLiterals
      .filter((literal) => /DELETE FROM task_dependencies/i.test(literal))
      .join('\n')

    expect(projectMetadataUpdates).not.toMatch(/\bCOALESCE\s*\(/i)
    expect(dependencyDeletes).not.toMatch(/\bWHERE\b[\s\S]*\bOR\b/i)
  })

  it('does not write the retired acceptance_plans.task_id column', () => {
    const acceptancePlanInsertColumns = [...projectWizardSource.matchAll(
      /INSERT\s+INTO\s+acceptance_plans\s*\(([^)]*)\)/gi,
    )].map((match) => match[1])

    expect(acceptancePlanInsertColumns.length).toBeGreaterThan(0)
    expect(acceptancePlanInsertColumns.every((columns) => !/\btask_id\b/i.test(columns))).toBe(true)
  })

  it('saves wizard drafts only for existing wizard_drafting projects', async () => {
    mocks.rawQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'project-1' }] })

    await request(buildApp())
      .patch('/api/projects/project-1/wizard/draft')
      .send({ step: 3, wizard_draft_payload: makeWizardPayload({ step: 3, mode: 'new' }) })
      .expect(200)

    const updateCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('CASE WHEN metadata IS NULL THEN $3::jsonb'))
    expect(updateCall).toBeTruthy()
    expect(String(updateCall?.[0])).not.toContain('SET status')
    expect(String(updateCall?.[0])).toContain('WHERE id = $1')
    expect(String(updateCall?.[0])).toContain('status = $2')
    expect(updateCall?.[1]?.[0]).toBe('project-1')
    expect(updateCall?.[1]?.[1]).toBe('wizard_drafting')
    expect(JSON.parse(String(updateCall?.[1]?.[2]))).toEqual(expect.objectContaining({
      wizard_draft_payload: expect.objectContaining({ step: 3, mode: 'new' }),
      wizard_draft_step: 3,
      wizard_draft_updated_at: expect.any(String),
    }))
  })

  it('rejects draft autosave for active projects instead of converting them to wizard_drafting', async () => {
    mocks.rawQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] })

    const response = await request(buildApp())
      .patch('/api/projects/project-1/wizard/draft')
      .send({ step: 3, wizard_draft_payload: makeWizardPayload({ step: 3, mode: 'new' }) })
      .expect(409)

    expect(response.body.error.code).toBe('WIZARD_DRAFT_SAVE_NOT_ALLOWED')
    const updateCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('CASE WHEN metadata IS NULL THEN $3::jsonb'))
    expect(updateCall).toBeTruthy()
    expect(String(updateCall?.[0])).not.toContain('SET status')
    expect(String(updateCall?.[0])).toContain('status = $2')
  })

  it('physically deletes wizard draft projects without depending on a deleted_at column', async () => {
    mocks.rawQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'project-1' }] })

    await request(buildApp())
      .delete('/api/projects/project-1/wizard/draft')
      .expect(204)

    const deleteCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM projects'))
    expect(deleteCall).toBeTruthy()
    expect(String(deleteCall?.[0])).toContain('WHERE id = $1')
    expect(String(deleteCall?.[0])).toContain('status = $2')
    expect(String(deleteCall?.[0])).not.toContain('deleted_at')
    expect(deleteCall?.[1]).toEqual(['project-1', 'wizard_drafting'])
  })

  it('rejects wizard draft delete while generation is running instead of deleting the project', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM projects') && String(sql).includes('WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'wizard_drafting',
            metadata: {
              wizard_generation_state: 'running',
              wizard_generation_attempt_id: 'attempt-1',
              wizard_generation_started_at: new Date().toISOString(),
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .delete('/api/projects/project-1/wizard/draft')
      .expect(409)

    expect(response.body.error.code).toBe('WIZARD_GENERATION_IN_PROGRESS')
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM projects'))).toBe(false)
  })

  it('recovers a stale queued wizard generation before allowing draft delete', async () => {
    let projectReads = 0
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (String(sql).includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        projectReads += 1
        return projectReads === 1
          ? {
              rowCount: 1,
              rows: [{
                id: 'project-1',
                company_id: 'company-1',
                status: 'wizard_drafting',
                default_wbs_generated: false,
                metadata: {
                  wizard_generation_state: 'queued',
                  wizard_generation_batch_id: 'batch-stale-queued',
                  wizard_generation_attempt_id: 'attempt-stale-queued',
                  wizard_generation_queued_at: '2026-01-01T00:00:00.000Z',
                },
              }],
            }
          : {
              rowCount: 1,
              rows: [{
                id: 'project-1',
                company_id: 'company-1',
                status: 'wizard_drafting',
                default_wbs_generated: false,
                metadata: {
                  wizard_generation_state: 'failed',
                  wizard_generation_attempt_id: 'attempt-stale-queued',
                },
              }],
            }
      }
      if (String(sql).includes('DELETE FROM acceptance_plans')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('DELETE FROM task_dependencies')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('DELETE FROM tasks')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('DELETE FROM engineering_objects')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('default_wbs_generated = $5')) return { rowCount: 1, rows: [{ id: 'project-1' }] }
      if (String(sql).includes('DELETE FROM projects WHERE id = $1 AND status = $2')) return { rowCount: 1, rows: [] }
      return { rowCount: 0, rows: [] }
    })

    await request(buildApp())
      .delete('/api/projects/project-1/wizard/draft')
      .expect(204)

    const resetProjectCall = mocks.rawQuery.mock.calls.find(([sql, callParams]) => (
      String(sql).includes('default_wbs_generated = $5')
      && Array.isArray(callParams)
      && String(callParams[1]).includes('WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED')
    ))
    const deleteDraftCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM projects WHERE id = $1 AND status = $2'))

    expect(resetProjectCall).toBeTruthy()
    expect(deleteDraftCall?.[1]).toEqual(['project-1', 'wizard_drafting'])
  })

  it('resolves current company when creating a wizard draft without an explicit companyId', async () => {
    mocks.getRequestCompanyId.mockReturnValueOnce(null)
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce(null)
    mocks.ensureDefaultCompanyForUser.mockResolvedValueOnce('fallback-company-1')

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        commit: false,
        wizardPayload: makeWizardPayload({ step: 1, mode: 'new' }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(mocks.ensureDefaultCompanyForUser).toHaveBeenCalledWith('user-1')
    expect(mocks.executeProjectCreationUnderCommercialGuard).toHaveBeenCalledWith({
      companyId: 'fallback-company-1',
      actorUserId: 'user-1',
      create: expect.any(Function),
    })

    const insertProjectCall = mocks.commercialTransactionQuery.mock.calls
      .find(([sql]) => String(sql).includes('INSERT INTO projects'))
    expect(insertProjectCall).toBeTruthy()
    expect(insertProjectCall?.[1]).toEqual(expect.arrayContaining([
      'fallback-company-1',
      'wizard_drafting',
    ]))
  })

  it('creates the wizard project owner membership in the same commercial transaction', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: false,
        wizardPayload: makeWizardPayload({ step: 1, mode: 'new' }),
      })
      .expect(201)

    const projectId = response.body.data.projectId
    const projectInsertIndex = mocks.commercialTransactionQuery.mock.calls
      .findIndex(([sql]) => String(sql).includes('INSERT INTO projects'))
    const membershipInsertIndex = mocks.commercialTransactionQuery.mock.calls
      .findIndex(([sql]) => String(sql).includes('INSERT INTO public.project_members'))
    const membershipInsertCall = mocks.commercialTransactionQuery.mock.calls[membershipInsertIndex]

    expect(projectInsertIndex).toBeGreaterThanOrEqual(0)
    expect(membershipInsertIndex).toBeGreaterThan(projectInsertIndex)
    expect(membershipInsertCall?.[1]).toEqual([
      expect.any(String),
      projectId,
      'user-1',
    ])
  })

  it('does not insert a new wizard project when the commercial guard rejects the company limit', async () => {
    mocks.executeProjectCreationUnderCommercialGuard.mockRejectedValueOnce(Object.assign(
      new Error('Active project limit reached'),
      {
        statusCode: 402,
        code: 'COMMERCIAL_PROJECT_LIMIT_REACHED',
      },
    ))

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: false,
        wizardPayload: makeWizardPayload({ step: 1, mode: 'new' }),
      })
      .expect(402)

    expect(response.body.error.code).toBe('COMMERCIAL_PROJECT_LIMIT_REACHED')
    expect(mocks.executeProjectCreationUnderCommercialGuard).toHaveBeenCalledWith({
      companyId: 'company-1',
      actorUserId: 'user-1',
      create: expect.any(Function),
    })
    expect(mocks.commercialTransactionQuery.mock.calls
      .some(([sql]) => String(sql).includes('INSERT INTO projects'))).toBe(false)
    expect(mocks.rawQuery.mock.calls
      .some(([sql]) => String(sql).includes('INSERT INTO projects'))).toBe(false)
  })

  it('updates an existing wizard project without charging the project creation guard again', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-existing',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {},
          }],
        }
      }
      if (String(sql).includes('UPDATE projects')) {
        return { rowCount: 1, rows: [{ id: 'project-existing' }] }
      }
      return { rowCount: 0, rows: [] }
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        projectId: 'project-existing',
        companyId: 'company-1',
        commit: false,
        wizardPayload: makeWizardPayload({ step: 2, mode: 'new' }),
      })
      .expect(200)

    expect(mocks.executeProjectCreationUnderCommercialGuard).not.toHaveBeenCalled()
    expect(mocks.rawQuery.mock.calls
      .some(([sql]) => String(sql).includes('UPDATE projects'))).toBe(true)
  })

  it('rejects company draft listing when the requested company is outside the actor membership scope', async () => {
    mocks.getCurrentCompanyMembership.mockResolvedValueOnce(null)

    const response = await request(buildApp())
      .get('/api/companies/company-foreign/project-drafts')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getCurrentCompanyMembership).toHaveBeenCalledWith('user-1', 'company-foreign')
    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('falls back when listing project drafts against a schema without projects.deleted_at', async () => {
    const missingDeletedAtError = Object.assign(new Error('column "deleted_at" does not exist'), {
      code: '42703',
    })
    mocks.rawQuery
      .mockRejectedValueOnce(missingDeletedAtError)
      .mockResolvedValueOnce({
        rows: [{
          id: 'draft-1',
          name: '草稿项目',
          status: 'wizard_drafting',
          wizard_draft_payload: { step: 1 },
          draft_step: '1',
          draft_updated_at: '2026-06-29T00:00:00.000Z',
          updated_at: '2026-06-29T00:00:00.000Z',
        }],
      })

    const response = await request(buildApp())
      .get('/api/companies/company-1/project-drafts')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(1)
    expect(mocks.rawQuery).toHaveBeenCalledTimes(2)
    expect(String(mocks.rawQuery.mock.calls[0]?.[0])).toContain('deleted_at IS NULL')
    expect(String(mocks.rawQuery.mock.calls[1]?.[0])).not.toContain('deleted_at IS NULL')
  })

  it('rejects wizard writes against an existing project outside the actor edit scope', async () => {
    mocks.getProjectPermissionLevel.mockResolvedValueOnce(null)

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        projectId: 'project-foreign',
        companyId: 'company-1',
        commit: false,
        wizardPayload: makeWizardPayload({ step: 1, mode: 'new' }),
      })
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(mocks.getProjectPermissionLevel).toHaveBeenCalledWith('user-1', 'project-foreign', 'company-1')
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO projects'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE projects'))).toBe(false)
  })

  it('rejects route-scoped wizard operations without project edit permission', async () => {
    mocks.getProjectPermissionLevel.mockResolvedValue(null)

    await request(buildApp())
      .post('/api/projects/project-foreign/wizard/preview')
      .send(makeWizardPayload({ step: 6, mode: 'new' }))
      .expect(403)

    await request(buildApp())
      .patch('/api/projects/project-foreign/wizard/draft')
      .send({ step: 3, wizard_draft_payload: makeWizardPayload({ step: 3, mode: 'new' }) })
      .expect(403)

    await request(buildApp())
      .delete('/api/projects/project-foreign/wizard/draft')
      .expect(403)

    await request(buildApp())
      .post('/api/projects/project-foreign/wizard/rollback')
      .expect(403)

    expect(mocks.getProjectPermissionLevel).toHaveBeenCalledWith('user-1', 'project-foreign', 'company-1')
    expect(mocks.rawQuery).not.toHaveBeenCalled()
    expect(mocks.resolveConstructionCalendarContext).not.toHaveBeenCalled()
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
  })

  it('rejects subtype-specific preview and commit before any project write when subtype is missing', async () => {
    const invalidPayload = makeWizardPayload({
      step: 6,
      mode: 'new',
      businessType: 'sports_culture',
      businessSubtype: undefined,
    })

    const previewResponse = await request(buildApp())
      .post('/api/projects/project-1/wizard/preview')
      .send(invalidPayload)
      .expect(422)

    expect(previewResponse.body.error.code).toBe('WIZARD_BUSINESS_SUBTYPE_REQUIRED')
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()

    const commitResponse = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        projectId: 'project-1',
        companyId: 'company-1',
        commit: true,
        wizardPayload: invalidPayload,
      })
      .expect(422)

    expect(commitResponse.body.error.code).toBe('WIZARD_BUSINESS_SUBTYPE_REQUIRED')
    expect(mocks.executeProjectCreationUnderCommercialGuard).not.toHaveBeenCalled()
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO projects'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE projects'))).toBe(false)
  })

  it('rejects master-plan commit before task writes when executable assembly is not ready', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      defaultPlanOutput: 'master_plan',
      masterPlanProfile: {
        layer: 'master_plan',
        rowCountRange: [70, 120],
      },
      rows: makeCandidatePlanQualityRows('blocked-executable-plan-row'),
      executableDefaultMasterPlanAssembly: {
        source: 'executable_default_master_plan_assembly',
        version: 'v1.4.23.1-executable-assembly-v1',
        status: 'executable_default_master_plan_blocked',
        businessType: 'hospital',
        assetAuthority: 'system_standard_seed',
        calibrationPolicy: 'optional_runtime_overlay',
        scheduleRowCount: 12,
        minimumScheduleRowCount: 80,
        maximumScheduleRowCount: 140,
        invalidDurationRowCount: 2,
        visibleDependencyCoverageRate: 0.75,
        missingExecutionPhases: ['commissioning'],
        readyForWizardCommit: false,
        commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies',
        mutationBoundary: 'assembly_only_no_db_write',
      },
      durationAssetUtilizationSummary: {
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_EXECUTABLE_DEFAULT_MASTER_PLAN_BLOCKED',
      message: 'Executable default master plan assembly blocked wizard task generation.',
      details: expect.objectContaining({
        status: 'executable_default_master_plan_blocked',
        readyForWizardCommit: false,
        scheduleRowCount: 12,
        minimumScheduleRowCount: 80,
        invalidDurationRowCount: 2,
        visibleDependencyCoverageRate: 0.75,
        missingExecutionPhases: ['commissioning'],
        mutationBoundary: 'assembly_gate_only_no_task_write',
      }),
    }))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects a claimed-ready master plan before writes when its visible dependency network is cyclic', async () => {
    const rows = makeCandidatePlanQualityRows('cycle-a')
    rows.push({
      ...makeCandidatePlanQualityRows('cycle-b')[0],
      sortOrder: 2,
    })
    rows[0].predecessorClientRowIds = ['cycle-b']
    rows[0].predecessorDependencies = [{
      clientRowId: 'cycle-b',
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'cyclic_master_plan_test',
      source: 'dependency_intent_template',
    }]
    rows[1].predecessorClientRowIds = ['cycle-a']
    rows[1].predecessorDependencies = [{
      clientRowId: 'cycle-a',
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'cyclic_master_plan_test',
      source: 'dependency_intent_template',
    }]
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      defaultPlanOutput: 'master_plan',
      masterPlanProfile: { layer: 'master_plan', rowCountRange: [2, 10] },
      rows,
      executableDefaultMasterPlanAssembly: {
        source: 'executable_default_master_plan_assembly',
        version: 'v1.4.23.1-executable-assembly-v1',
        status: 'executable_default_master_plan_ready',
        businessType: 'hospital',
        assetAuthority: 'system_standard_seed',
        calibrationPolicy: 'optional_runtime_overlay',
        scheduleRowCount: 2,
        invalidDurationRowCount: 0,
        visibleDependencyCoverageRate: 1,
        missingExecutionPhases: [],
        methodConflictCount: 0,
        durationAssetSemanticMismatchCount: 0,
        dependencyCycleRowCount: 0,
        networkComponentCount: 1,
        networkRootCount: 1,
        networkSinkCount: 1,
        readyForWizardCommit: true,
      },
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        t2RhythmTemplateRowCount: 2,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
      },
      candidateNetworkEvaluation: makeCandidateNetworkEvaluation(['cycle-a', 'cycle-b']),
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_EXECUTABLE_DEFAULT_MASTER_PLAN_BLOCKED',
      details: expect.objectContaining({
        computedDependencyCycleRowCount: 2,
        reasons: expect.arrayContaining(['dependency_cycle_detected']),
        mutationBoundary: 'assembly_gate_only_no_task_write',
      }),
    }))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects direct wizard commit before task writes when row-level plan quality is structurally invalid even without summary missing counts', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-12',
            duration_suggestion: {
              durationRiskRange: {
                p20Days: 8,
                p50Days: 10,
                p80Days: 14,
              },
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                t2RhythmTemplateId: 't2-structure-main',
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
                runtimeReferenceDaysStableCode: 'STD-STRUCTURE-MAIN',
                runtimeReferenceDaysSampleCount: 3,
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'rainy_season',
                processSeasonalImpactBand: 'earthwork_rain_sensitive',
                processSeasonalMultiplier: 1.2,
                dependencyAssetConsumed: true,
                dependencyAssetStableCode: 'main_structure_to_masonry_infill',
                dependencyAssetDependencyType: 'FS',
                dependencyAssetEvidenceSourceKeys: ['dep-source-structure-main'],
              },
            },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: 'row-1',
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'row-1', dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
          values: {
            title: '机电预留预埋',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-15',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 5,
                baseSelectedDurationDays: 5,
                standardWorkDurationSeedStableCode: 'STD-MASONRY-INFILL',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        runtimeReferenceDaysRowCount: 1,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
      details: expect.objectContaining({
        source: 'wizard_generation_duration_asset_quality_pre_write_validation',
        status: 'blocked_by_invalid_duration_asset_inputs',
        runtimeApprovalRequired: false,
        blockingRowCount: 1,
        mutationBoundary: 'plan_structure_validation_only_no_task_write',
      }),
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'row-2',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects source-only duration asset references before task writes', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'source-only-duration-asset-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '只有解析来源没有资产编码的主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            status: 'todo',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-12',
            duration_suggestion: {
              durationRiskRange: {
                p20Days: 8,
                p50Days: 10,
                p80Days: 14,
              },
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                standardWorkDurationSeedResolverVersionId: 'seed-runtime-v3',
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                t2RhythmTemplateResolverVersionId: 't2-runtime-v2',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysP50Days: 10,
                runtimeReferenceDaysP80Days: 14,
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'rainy_season',
                processSeasonalImpactBand: 'earthwork_rain_sensitive',
                processSeasonalMultiplier: 1.2,
                dependencyAssetConsumed: true,
                dependencyAssetStableCode: 'main_structure_to_masonry_infill',
                dependencyAssetDependencyType: 'FS',
                dependencyAssetEvidenceSourceKeys: ['dep-source-structure-main'],
              },
            },
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        runtimeReferenceDaysRowCount: 1,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blockingRowCount: 1,
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'source-only-duration-asset-row',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects invalid candidate duration days before task writes even when asset lineage is present', async () => {
    const rows = makeCandidatePlanQualityRows('invalid-candidate-duration-row')
    const invalidDurationMetadata = rows[0].values.standard_task_metadata as unknown as {
      durationAssetCalculation: {
        selectedDurationDays: number
        baseSelectedDurationDays: number
      }
    }
    invalidDurationMetadata.durationAssetCalculation.selectedDurationDays = 0
    invalidDurationMetadata.durationAssetCalculation.baseSelectedDurationDays = 10

    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows,
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blockingRowCount: 1,
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'invalid-candidate-duration-row',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
        missingQualityInputCodes: expect.arrayContaining(['candidate_duration_application']),
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects inverted candidate duration risk ranges before task writes', async () => {
    const rows = makeCandidatePlanQualityRows('inverted-risk-range-row')
    const firstRowValues = rows[0].values as Record<string, unknown>
    firstRowValues.duration_suggestion = {
      durationRiskRange: {
        p20Days: 18,
        p50Days: 12,
        p80Days: 10,
        source: 'standard_work_duration_seed+t2_division_rhythm_template',
      },
    }

    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows,
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'inverted-risk-range-row',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
        missingQualityInputCodes: expect.arrayContaining(['duration_risk_range']),
        durationRiskRangeStatus: 'duration_risk_range_invalid',
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects selected candidate durations outside the risk range before task writes', async () => {
    const rows = makeCandidatePlanQualityRows('duration-outside-risk-range-row')
    const firstRowValues = rows[0].values as Record<string, unknown>
    const metadata = firstRowValues.standard_task_metadata as Record<string, unknown>
    const durationAssetCalculation = metadata.durationAssetCalculation as Record<string, unknown>
    durationAssetCalculation.selectedDurationDays = 30
    durationAssetCalculation.baseSelectedDurationDays = 30
    firstRowValues.duration_suggestion = {
      durationRiskRange: {
        p20Days: 8,
        p50Days: 10,
        p80Days: 14,
        source: 'standard_work_duration_seed+t2_division_rhythm_template',
      },
    }

    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows,
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'duration-outside-risk-range-row',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
        missingQualityInputCodes: expect.arrayContaining(['duration_risk_range']),
        durationRiskRangeStatus: 'duration_risk_range_selected_duration_outside_range',
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('allows system fallback duration assets to generate the initial plan before runtime learning evidence exists', async () => {
    const rows = makeCandidatePlanQualityRows('system-fallback-duration-row')
    const calculation = (rows[0].values.standard_task_metadata as Record<string, any>).durationAssetCalculation
    calculation.standardWorkDurationSeedResolverSource = 'ts_seed_fallback'
    calculation.standardWorkDurationSeedResolverVersionId = null
    calculation.t2RhythmTemplateResolverSource = 'ts_seed_fallback'
    calculation.t2RhythmTemplateResolverVersionId = null
    calculation.runtimeReferenceDaysConsumed = false
    calculation.runtimeReferenceDaysEvidenceLevel = null
    calculation.runtimeReferenceDaysStableCode = null
    calculation.runtimeReferenceDaysP50Days = null
    calculation.runtimeReferenceDaysP80Days = null
    calculation.runtimeReferenceDaysSampleCount = null
    calculation.processSeasonalDurationAssetConsumed = false
    calculation.processSeasonalClimateSignal = null
    calculation.processSeasonalImpactBand = null
    calculation.processSeasonalMultiplier = null
    calculation.dependencyAssetConsumed = false
    calculation.dependencyAssetType = null
    calculation.dependencyAssetStableCode = null
    calculation.dependencyAssetEvidenceSourceKeys = []

    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      defaultPlanOutput: 'master_plan',
      masterPlanProfile: { layer: 'master_plan', rowCountRange: [1, 10] },
      rows,
      executableDefaultMasterPlanAssembly: {
        source: 'executable_default_master_plan_assembly',
        version: 'v1.4.23.1-executable-assembly-v1',
        status: 'executable_default_master_plan_ready',
        businessType: 'hospital',
        assetAuthority: 'system_standard_seed',
        calibrationPolicy: 'optional_runtime_overlay',
        scheduleRowCount: 1,
        invalidDurationRowCount: 0,
        visibleDependencyCoverageRate: 1,
        missingExecutionPhases: [],
        methodConflictCount: 0,
        durationAssetSemanticMismatchCount: 0,
        dependencyCycleRowCount: 0,
        networkComponentCount: 1,
        networkRootCount: 1,
        networkSinkCount: 1,
        readyForWizardCommit: true,
        commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      },
      durationAssetUtilizationSummary: {
        scheduleRowCount: 1,
        durationBearingScheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        systemStandardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 0,
        fallbackStandardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        systemStandardT2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 0,
        fallbackT2RhythmTemplateRowCount: 1,
        constructionCalendarRowCount: 1,
        durationRiskRangeRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        calibrationPolicy: 'optional_runtime_overlay',
      },
      candidateNetworkEvaluation: makeCandidateNetworkEvaluation(
        ['system-fallback-duration-row'],
        { projectedNetworkSpanDays: 10, previewEdgeCount: 0 },
      ),
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      blocksBaselinePublication: false,
    }))
    expect(response.body.data.generation.planQualityDiagnostics.candidateGapCodes)
      .not.toContain('runtime_reference_days_gap')
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledTimes(1)
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects invalid process seasonal multipliers before task writes', async () => {
    const rows = makeCandidatePlanQualityRows('invalid-seasonal-multiplier-row')
    const firstRowValues = rows[0].values as Record<string, unknown>
    const metadata = firstRowValues.standard_task_metadata as Record<string, unknown>
    const durationAssetCalculation = metadata.durationAssetCalculation as Record<string, unknown>
    durationAssetCalculation.processSeasonalDurationAssetConsumed = true
    durationAssetCalculation.processSeasonalMultiplier = 0

    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows,
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ mode: 'new' }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'invalid-seasonal-multiplier-row',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
        missingQualityInputCodes: expect.arrayContaining(['process_seasonal_adjustment']),
        processSeasonalAdjustmentStatus: 'process_seasonal_adjustment_invalid',
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('commits the natural plan and returns target-gap diagnostics without a PM approval gate', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: makeCandidatePlanQualityRows('target-scope-decision-row'),
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: {
        source: 'generated_wbs_row_candidate_network_cpm',
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        projectedNetworkSpanDays: 10,
        previewEdgeCount: 0,
        unresolvedEdgeCount: 0,
        criticalGeneratedRowIds: ['target-scope-decision-row'],
        materializationStatus: 'preview_only',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      targetFeasibility: {
        mode: 'compression_preview',
        targetEndDate: '2026-06-05',
        naturalEndDate: '2026-06-10',
        overshootDays: 5,
        recoverableDays: 0,
        unrecoverableDays: 5,
        verdict: 'requires_scope_change',
        strategies: [],
      },
      governanceWarnings: [],
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2026-06-05',
        }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.data.generation.targetFeasibility).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-05',
      naturalEndDate: '2026-06-10',
      overshootDays: 5,
      unrecoverableDays: 5,
      verdict: 'requires_scope_change',
    }))
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      targetAlignmentSnapshot: expect.objectContaining({
        targetEndDate: '2026-06-05',
        naturalEndDate: '2026-06-10',
        overshootDays: 5,
      }),
    }))
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledTimes(1)
  })

  it('rejects multi-row candidates without dependency network evidence before task writes', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'network-row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: { stableCode: 'network-row-1' },
          },
        },
        {
          clientRowId: 'network-row-2',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [],
          values: {
            title: '机电预留预埋',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-20',
            progress: 0,
            status: 'todo',
            standard_task_metadata: { stableCode: 'network-row-2' },
          },
        },
      ]),
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        t2RhythmTemplateRowCount: 0,
        rowsMissingDurationAssetCount: 0,
      },
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2026-06-30',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(422)

    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_CANDIDATE_NETWORK_EVIDENCE_REQUIRED',
      details: expect.objectContaining({
        source: 'wizard_generation_candidate_network_pre_write_gate',
        code: 'critical_path_sequence',
        scheduleStructureBlocking: true,
        runtimeApprovalRequired: false,
      }),
    }))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects single-row candidates with unresolved dependency edge evidence before task writes', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: makeCandidatePlanQualityRows('single-row-unresolved-edge'),
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: {
        ...makeCandidateNetworkEvaluation(['single-row-unresolved-edge'], {
          previewEdgeCount: 0,
          projectedNetworkSpanDays: 10,
        }),
        unresolvedEdgeCount: 1,
      },
      targetFeasibility: null,
      governanceWarnings: [],
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2026-06-30',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(422)

    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_CANDIDATE_NETWORK_EVIDENCE_REQUIRED',
      details: expect.objectContaining({
        source: 'wizard_generation_candidate_network_pre_write_gate',
        code: 'critical_path_sequence',
        scheduleRowCount: 1,
        unresolvedEdgeCount: 1,
        requiredEvidence: 'candidate_dependency_network_with_resolved_edges',
        planQualityAction: 'resolve_candidate_dependency_edges_before_task_generation',
        scheduleStructureBlocking: true,
        runtimeApprovalRequired: false,
      }),
    }))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects commits without a dated candidate acceptance anchor before task writes', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: makeCandidatePlanQualityRows('missing-acceptance-anchor-row'),
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 1,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 1,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 1,
        runtimeReferenceDaysConsumedRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: makeCandidateNetworkEvaluation(['missing-acceptance-anchor-row'], {
        previewEdgeCount: 0,
        projectedNetworkSpanDays: 10,
      }),
      targetFeasibility: null,
      governanceWarnings: [],
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          plannedEndDate: undefined,
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DATED_ACCEPTANCE_MILESTONE_REQUIRED',
      message: 'Wizard plan requires a dated completion acceptance milestone before task generation.',
      details: expect.objectContaining({
        source: 'wizard_generation_acceptance_milestone_pre_write_validation',
        code: 'dated_acceptance_milestone_missing',
        scheduleStructureBlocking: true,
        datedAcceptanceMilestoneCount: 0,
        requiredPlanInput: 'dated_completion_acceptance_milestone',
      }),
    }))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects starting-line future rows before task writes when candidate plan quality blocks', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'historical-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '已完成桩基验收',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            onboarding_stage_classification: 'history',
            is_historical: true,
            planned_start_date: '2026-05-01',
            planned_end_date: '2026-05-10',
            standard_task_metadata: {},
          },
        },
        {
          clientRowId: 'future-row-missing-duration-assets',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [],
          values: {
            title: '未来主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            onboarding_stage_classification: 'future',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            standard_task_metadata: {},
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        runtimeReferenceDaysRowCount: 1,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 1, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'starting_line',
          onboardingSubstage: 'main_structure',
        }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blockingRowCount: 1,
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'future-row-missing-duration-assets',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('rejects starting-line unclassified todo rows before task writes when candidate plan quality blocks', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'unclassified-todo-row-missing-duration-assets',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '未分类待排主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            standard_task_metadata: {},
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 0,
        dependencyAssetConsumedRowCount: 0,
        constructionCalendarRowCount: 0,
        processSeasonalDurationAssetRowCount: 0,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'starting_line',
          onboardingSubstage: 'main_structure',
        }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
      message: 'Wizard duration asset quality validation blocked task generation.',
    }))
    expect(response.body.error.details.blockingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'unclassified-todo-row-missing-duration-assets',
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
      }),
    ]))
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('commits wizard generation, creates tasks, writes passed milestones, clears draft metadata, and activates the project', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValueOnce({
      basis: 'official_construction_calendar_seed',
      windows: [{
        startDate: '2026-07-01',
        endDate: '2026-07-07',
        type: 'holiday_shutdown',
        reason: 'official_test_shutdown',
      }],
    })
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql)
      if (text.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {},
          }],
        }
      }
      if (text.includes('FROM public.algorithm_asset_candidate_events')) {
        const assetPattern = String(params[2] ?? '')
        if (assetPattern.startsWith('construction_organization.plan_option.')) {
          return {
            rowCount: 1,
            rows: [{
              id: 'runtime-plan-option-event',
              asset_key: 'construction_organization.plan_option.plan-option-foundation-basement',
              source_module: 'constructionOrganizationScenarioGovernanceService',
              company_id: 'company-1',
              project_id: 'project-1',
              event_status: 'runtime_published',
              runtime_effect: 'runtime_observed',
              created_at: '2026-06-24T00:00:00.000Z',
              updated_at: '2026-06-24T00:00:00.000Z',
              candidate_payload: {
                option: {
                  optionId: 'plan-option-foundation-basement',
                  businessType: 'hospital',
                  selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                  generatedRowProjection: {
                    materializationReviewPackage: {
                      source: 'construction_organization_candidate_materialization_review_package',
                      optionId: 'plan-option-foundation-basement',
                      status: 'ready_for_manual_review',
                      allowManualReview: true,
                      proposedDependencyEdgeCount: 1,
                      proposedDependencyEdges: [{
                        fromGeneratedRowId: 'row-1',
                        toGeneratedRowId: 'row-2',
                        dependencyType: 'FS',
                        lagDays: 0,
                        intent: 'hospital_runtime_evidence',
                        operation: 'propose_create_dependency',
                        writesTaskDependencies: false,
                      }],
                      blockedReasons: [],
                      writesTaskDependencies: false,
                      writesPlanDates: false,
                      writesCriticalPathFacts: false,
                    },
                  },
                  useCaseEvaluations: {
                    newProjectPlanning: {
                      optionScore: 87,
                      actionability: 'actionable_candidate',
                      writesTaskDependencies: false,
                      writesPlanDates: false,
                      writesSeed: false,
                    },
                    startingLineOnboarding: {
                      optionScore: 82,
                      actionability: 'evidence_only',
                      writesTaskDependencies: false,
                      writesPlanDates: false,
                      writesSeed: false,
                    },
                    accelerationRecovery: {
                      optionScore: 91,
                      actionability: 'actionable_candidate',
                      writesTaskDependencies: false,
                      writesPlanDates: false,
                      writesSeed: false,
                    },
                  },
                  runtimeEngineEvidence: {
                    publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
                  },
                  runtimeMaterializationEvidence: {
                    canClaimRuntimeMaterializationEvidence: true,
                  },
                },
              },
            }],
          }
        }
        if (assetPattern.startsWith('construction_organization.runtime_closeout_claim.')) {
          return {
            rowCount: 1,
            rows: [{
              id: 'runtime-closeout-event',
              asset_key: 'construction_organization.runtime_closeout_claim.plan-option-foundation-basement',
              source_module: 'constructionOrganizationScenarioGovernanceService',
              company_id: 'company-1',
              project_id: 'project-1',
              event_status: 'runtime_published',
              runtime_effect: 'runtime_observed',
              created_at: '2026-06-24T00:00:00.000Z',
              updated_at: '2026-06-24T00:00:00.000Z',
              candidate_payload: {
                draftNetworkKey: 'plan-option-foundation-basement',
                runtimeCloseoutClaim: {
                  source: 'construction_organization_plan_network_runtime_closeout_claim',
                  status: 'runtime_closeout_claim_ready',
                  canClaimRuntimeCloseout: true,
                  canMaterializeRuntime: false,
                  totalDraftCount: 1,
                  claimBasis: [
                    'release_exit_handoff_linked_for_every_draft',
                    'domain_writer_runtime_publication_linked_for_every_draft',
                    'runtime_consumer_observation_linked_for_every_draft',
                    'impact_monitoring_passed_for_every_draft',
                    'rollback_execution_verified_for_every_draft',
                    'saved_network_outcome_linked_for_every_draft',
                    'true_per_option_E1_E3_E5_runtime_evidence_linked_for_every_draft',
                    'site_adoption_of_runtime_recommended_option_linked',
                  ],
                  missingBeforeClaim: [],
                  mutationBoundary: {
                    writesTaskDependencies: false,
                    writesPlanDates: false,
                    writesSeed: false,
                    writesBaseline: false,
                    writesCriticalPathFacts: false,
                    writesAccelerationDraft: false,
                  },
                  boundaryPolicy: ['runtime_closeout_claim_is_a_read_only_audit_projection'],
                },
              },
            }],
          }
        }
        if (String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications')) {
          return {
            rowCount: 1,
            rows: [{
              publication_key: 'construction_org_plan_network_runtime:project-1:hospital-option',
              project_id: 'project-1',
              draft_network_key: 'plan-option-foundation-basement',
              release_handoff_candidate_event_id: 'runtime-release-handoff-1',
              runtime_publication_status: 'runtime_published',
              applied_dependency_count: 1,
              rollback_target: null,
              published_at: '2026-06-24T00:00:00.000Z',
            }],
          }
        }
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 1, rows: [{ id: 'project-1' }] }
    })
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockImplementationOnce((rows: any[]) => {
      expect(rows[0].values.planned_end_date).toBe('2026-06-12')
      return {
        source: 'generated_wbs_row_candidate_network_cpm',
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        projectedNetworkSpanDays: 17,
        previewEdgeCount: 1,
        processConstraintRoutingCandidateEdgeCount: 0,
        processConstraintRoutingRuleCodes: [],
        unresolvedEdgeCount: 0,
        criticalGeneratedRowIds: ['row-1', 'row-2'],
        criticalRowSummaries: [],
        materializationStatus: 'preview_only',
        rowSchedule: [
          { generatedRowId: 'row-1', startDay: 0, finishDay: 12, durationDays: 12, totalFloatDays: 0, isCritical: true },
          { generatedRowId: 'row-2', startDay: 12, finishDay: 17, durationDays: 5, totalFloatDays: 0, isCritical: true },
        ],
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })

    expect(response.status, JSON.stringify(response.body)).toBe(201)

    expect(response.body.success).toBe(true)
    const committedProjectId = response.body.data.projectId
    expect(response.body.data.status).toBe(PROJECT_ACTIVE_STATUS)
    expect(response.body.data.generation.durationAssetUtilizationSummary).toEqual(expect.objectContaining({
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: 2,
      standardWorkDurationSeedRowCount: 2,
      activeStandardWorkDurationSeedRowCount: 0,
      fallbackStandardWorkDurationSeedRowCount: 2,
      t2RhythmTemplateRowCount: 2,
      activeT2RhythmTemplateRowCount: 0,
      fallbackT2RhythmTemplateRowCount: 2,
      projectScaleQuantityProxyRowCount: 1,
      dependencyAssetConsumedRowCount: 1,
      dependencyTimingAssetConsumedRowCount: 1,
      criticalPathCandidateRowCount: 2,
      floatCalculatedRowCount: 2,
      featureTriggeredAcceptanceScheduleRowCount: 1,
      businessTypeSpecialtyDurationAssetRowCount: 1,
      businessTypeSpecificT2RhythmTemplateRowCount: 1,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }))
    expect(response.body.data.generation.durationAssetConsumptionReceipts).toEqual([
      expect.objectContaining({
        status: 'effective_applied',
        changedFields: ['duration'],
        stableCode: 'STD-STRUCTURE-MAIN',
      }),
      expect.objectContaining({
        status: 'effective_applied',
        changedFields: ['dependency'],
        stableCode: 'wizard_mock_dependency_asset',
      }),
    ])
    expect(response.body.data.generation.durationAssetConsumptionSummary).toEqual(expect.objectContaining({
      totalCount: 2,
      effectiveAppliedCount: 2,
    }))
    expect(response.body.data.generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      source: 'generated_wbs_rows_candidate_duration_asset_preview',
      evidenceLevel: 'candidate_duration_asset_preview_l1',
      mutationBoundary: 'preview_only_no_duration_runtime_write_no_task_write',
      planQualityReviewMode: 'offline_development_calibration',
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      blocksBaselinePublication: false,
      totalCount: 2,
      riskRangeCount: 2,
      dependencyAssetCount: 2,
      processSeasonalAdjustmentCount: 2,
      constructionCalendarCount: 2,
      candidateNetworkPlanDateApplicationCount: 1,
      durationAssetPlanDateApplicationCount: 1,
      writesDurationRuntime: false,
      writesTasks: false,
      uncoveredScheduleRowCount: 0,
    }))
    expect(response.body.data.generation.candidateDurationAssetPreview.durationAssetReviewRows).toEqual([
      expect.objectContaining({
        clientRowId: 'row-1',
        assetCoverageStatus: 'full_asset_coverage',
        presentAssetCodes: expect.arrayContaining([
          'standard_work_duration_seed',
          't2_rhythm_template',
          'runtime_reference_days',
          'duration_risk_range',
          'construction_calendar',
          'process_seasonal_adjustment',
          'dependency_sequence',
        ]),
        presentAssetSummaries: expect.arrayContaining([
          expect.objectContaining({
            code: 'standard_work_duration_seed',
            label: '标准工期 seed',
            reference: 'STD-STRUCTURE-MAIN',
            evidenceLevel: 'runtime_seed_registry / seed-runtime-v3',
            usageStatus: 'candidate_asset_used',
            consumptionPolicy: 'cold_start_baseline_asset',
          }),
          expect.objectContaining({
            code: 'runtime_reference_days',
            label: '运行参考工期',
            reference: 'STD-STRUCTURE-MAIN',
            evidenceLevel: 'runtime_calibrated_l2 / P50 10 / P80 14 / 样本 3',
            usageStatus: 'candidate_asset_used',
            consumptionPolicy: 'optional_published_learning_overlay',
          }),
          expect.objectContaining({
            code: 'dependency_sequence',
            label: '工序依赖',
            reference: 'main_structure_to_masonry_infill',
            evidenceLevel: 'hard / FS / lag 2 / dep-source-structure-main',
            usageStatus: 'candidate_asset_used',
          }),
        ]),
        missingAssetCodes: [],
      }),
      expect.objectContaining({
        clientRowId: 'row-2',
        assetCoverageStatus: 'full_asset_coverage',
        presentAssetCodes: expect.arrayContaining([
          'standard_work_duration_seed',
          't2_rhythm_template',
          'runtime_reference_days',
          'duration_risk_range',
          'construction_calendar',
          'process_seasonal_adjustment',
          'dependency_sequence',
        ]),
        presentAssetSummaries: expect.arrayContaining([
          expect.objectContaining({
            code: 'standard_work_duration_seed',
            label: '标准工期 seed',
            reference: 'STD-MEP-RESERVATION',
            evidenceLevel: 'runtime_seed_registry / seed-runtime-v3',
            usageStatus: 'candidate_asset_used',
            consumptionPolicy: 'cold_start_baseline_asset',
          }),
          expect.objectContaining({
            code: 'runtime_reference_days',
            label: '运行参考工期',
            reference: 'STD-MEP-RESERVATION',
            evidenceLevel: 'runtime_calibrated_l2 / P50 5 / P80 7 / 样本 3',
            usageStatus: 'candidate_asset_used',
            consumptionPolicy: 'optional_published_learning_overlay',
          }),
        ]),
        missingAssetCodes: [],
        qualityReviewAction: 'candidate_duration_assets_ready',
      }),
    ])
    expect(response.body.data.generation.candidateDurationAssetPreview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'row-1',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-12',
        riskP20DurationDays: 8,
        riskP50DurationDays: 10,
        riskP80DurationDays: 14,
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 1,
        processSeasonalDurationAssetConsumed: true,
        processSeasonalClimateSignal: 'rainy_season',
        processSeasonalImpactBand: 'earthwork_rain_sensitive',
        selectedDurationDays: 12,
        baseSelectedDurationDays: 10,
        standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
        standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
        standardWorkDurationSeedResolverVersionId: 'seed-runtime-v3',
        t2RhythmTemplateId: 't2-structure-main',
        t2RhythmTemplateResolverSource: 'runtime_t2_registry',
        t2RhythmTemplateResolverVersionId: 't2-runtime-v2',
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysStableCode: 'STD-STRUCTURE-MAIN',
        runtimeReferenceDaysP50Days: 10,
        runtimeReferenceDaysP80Days: 14,
        runtimeReferenceDaysSampleCount: 3,
        runtimeReferenceDaysMutationBoundary: 'candidate_only_no_business_fact_write',
        dependencyAssetConsumed: true,
        dependencyAssetType: 'cross_item_workflow',
        dependencyAssetStableCode: 'main_structure_to_masonry_infill',
        dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
        dependencyAssetStrength: 'hard',
        dependencyAssetHandoffCategory: 'structure_masonry_infill',
        dependencyAssetDependencyType: 'FS',
        dependencyAssetLagDays: 2,
        dependencyAssetEvidenceSourceKeys: ['dep-source-structure-main'],
        durationAssetPlanDateApplied: true,
        durationAssetPreviousPlannedStartDate: '2026-06-01',
        durationAssetPreviousPlannedEndDate: '2026-06-10',
        durationAssetPlannedStartDate: '2026-06-01',
        durationAssetPlannedEndDate: '2026-06-12',
        durationAssetSelectedDurationDays: 12,
        durationAssetPlanDateEvidenceLevel: 'candidate_duration_asset_applied_plan_dates_l1',
        durationAssetPlanDateMutationBoundary: 'wizard_generated_task_plan_date_write_only_no_duration_runtime_write_no_seed_write_no_production_claim',
        createdTaskId: 'task-1',
      }),
      expect.objectContaining({
        clientRowId: 'row-2',
        plannedStartDate: '2026-06-13',
        plannedEndDate: '2026-06-17',
        riskP20DurationDays: 3,
        riskP50DurationDays: 5,
        riskP80DurationDays: 7,
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 1,
        processSeasonalDurationAssetConsumed: true,
        processSeasonalClimateSignal: 'standard_season',
        processSeasonalImpactBand: 'normal_productivity',
        selectedDurationDays: 5,
        baseSelectedDurationDays: 5,
        standardWorkDurationSeedStableCode: 'STD-MEP-RESERVATION',
        standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
        standardWorkDurationSeedResolverVersionId: 'seed-runtime-v3',
        t2RhythmTemplateId: 't2-mep-reservation',
        t2RhythmTemplateResolverSource: 'runtime_t2_registry',
        t2RhythmTemplateResolverVersionId: 't2-runtime-v2',
        runtimeReferenceDaysConsumed: true,
        runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDaysStableCode: 'STD-MEP-RESERVATION',
        runtimeReferenceDaysP50Days: 5,
        runtimeReferenceDaysP80Days: 7,
        runtimeReferenceDaysSampleCount: 3,
        runtimeReferenceDaysMutationBoundary: 'candidate_only_no_business_fact_write',
        dependencyAssetConsumed: true,
        dependencyAssetType: 'cross_item_workflow',
        dependencyAssetStableCode: 'main_structure_to_mep_reservation',
        dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
        dependencyAssetStrength: 'hard',
        dependencyAssetHandoffCategory: 'structure_mep_reservation',
        dependencyAssetDependencyType: 'FS',
        dependencyAssetLagDays: 0,
        dependencyAssetEvidenceSourceKeys: ['dep-source-mep-reservation'],
        candidateNetworkPlanDateApplied: true,
        candidateNetworkPreviousPlannedStartDate: '2026-06-11',
        candidateNetworkPreviousPlannedEndDate: '2026-06-15',
        candidateNetworkPlannedStartDate: '2026-06-13',
        candidateNetworkPlannedEndDate: '2026-06-17',
        candidateNetworkStartDay: 12,
        candidateNetworkFinishDay: 17,
        candidateNetworkDurationDays: 5,
        candidateNetworkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        candidateNetworkPlanDateEvidenceLevel: 'candidate_network_plan_dates_applied_l1',
        candidateNetworkPlanDateMutationBoundary: 'wizard_generated_task_plan_date_write_only_no_dependency_runtime_write_no_seed_write_no_production_claim',
        createdTaskId: 'task-2',
      }),
    ]))
    expect(response.body.data.generation.candidateDurationAssetPreview.uncoveredScheduleRows).toEqual([])
    expect(response.body.data.generation.candidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
      projectedNetworkSpanDays: 17,
      previewEdgeCount: 1,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['row-1', 'row-2'],
      criticalTaskIds: ['task-1', 'task-2'],
      rowSchedule: expect.arrayContaining([
        expect.objectContaining({
          generatedRowId: 'row-2',
          startDay: 12,
          finishDay: 17,
          durationDays: 5,
        }),
      ]),
      durationAssetPlanDateNetworkRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_network_recalculation',
        previousProjectedNetworkSpanDays: 326,
        recalculatedProjectedNetworkSpanDays: 17,
      }),
      taskIdMappingStatus: 'materialized_task_ids_available',
      taskIdMappingMutationBoundary: 'candidate_network_task_id_mapping_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(response.body.data.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      source: 'wizard_generation_plan_quality_diagnostics',
      intendedUse: 'offline_development_quality_review_and_template_calibration',
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      blocksBaselinePublication: false,
      scheduleRowCount: 2,
      durationAssetCoveredRowCount: 2,
      projectedNetworkSpanDays: 17,
      previewDependencyCount: 1,
      unresolvedDependencyCount: 0,
      datedAcceptanceMilestoneCount: 1,
      materializedAcceptanceMilestoneCount: 1,
    }))
    expect(response.body.data.generation.candidateDurationAssetPreview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'row-1',
        selectedDurationDays: 12,
        durationAssetPlanDateApplied: true,
      }),
      expect.objectContaining({
        clientRowId: 'row-2',
        selectedDurationDays: 5,
        candidateNetworkPlanDateApplied: true,
      }),
    ]))
    expect(response.body.data.generation.criticalPathRefresh).toEqual(expect.objectContaining({
      source: 'project_wizard_post_commit_critical_path_refresh',
      status: 'refreshed',
      projectId: committedProjectId,
      taskCount: 2,
      eligibleTaskCount: 2,
      criticalTaskCount: 2,
      projectDurationDays: 15,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesRuntimeCriticalPathProjection: true,
      writesCriticalPathFacts: true,
    }))
    expect(response.body.data.generation.postCommitDerivations).toEqual(expect.objectContaining({
      source: 'wizard_post_commit_derivation_recovery',
      status: 'succeeded',
      operationId: expect.stringContaining(':wizard_post_commit_derivations'),
      stages: expect.objectContaining({
        critical_path: expect.objectContaining({ status: 'succeeded', attemptCount: 1 }),
        duration_evidence: expect.objectContaining({ status: 'succeeded', attemptCount: 1 }),
      }),
    }))
    expect(response.body.data.generation.candidateBaseline).toEqual(expect.objectContaining({
      baselineId: expect.any(String),
      sourceVersionLabel: 'managed_frontier_default_master_plan',
      status: 'draft',
      itemCount: 2,
      mappedTaskCount: 2,
      generationBatchId: expect.any(String),
    }))
    expect(mocks.recalculateProjectCriticalPath).toHaveBeenCalledWith(committedProjectId)
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'task_list',
      detailLevel: 'planning_skeleton',
      onboardingSubstage: 'main_structure',
      duplicatePolicy: 'preserve_historical_skip_future',
    }))
    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.runtimeConsumerObservationQueryExec).toEqual(expect.any(Function))
    expect(generationCall.runtimeArtifactPublications).toEqual([])
    expect(mocks.resolveConstructionCalendarContext).toHaveBeenCalledWith({ projectId: committedProjectId })
    expect(generationCall.operation).toEqual(expect.objectContaining({
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      includeActivitySteps: false,
    }))
    expect(generationCall.operation.clientContext).toEqual(expect.objectContaining({
      requestedDetailLevel: 'standard',
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      constructionCalendar: expect.objectContaining({
        basis: 'official_construction_calendar_seed',
        windows: expect.arrayContaining([
          expect.objectContaining({
            startDate: '2026-07-01',
            endDate: '2026-07-07',
          }),
        ]),
      }),
    }))
    expect(generationCall.operation.projectFacts).toEqual(expect.objectContaining({
      mode: 'starting_line',
      onboardingSubstage: 'main_structure',
      onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance'],
    }))
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledTimes(1)
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'row-1',
          payload: expect.objectContaining({ title: '涓讳綋缁撴瀯鏂藉伐' }),
        }),
        expect.objectContaining({
          clientRowId: 'row-2',
          parentClientRowId: 'row-1',
          payload: expect.objectContaining({ title: '鎵嬫湳閮ㄦ満鐢甸鐣?' }),
        }),
      ]),
      'user-1',
      expect.objectContaining({
        deferPostCreateEffects: true,
        postCreateEffectReason: 'project_wizard_batch_generation',
        trustPrevalidatedScope: true,
        skipStandardInference: true,
      }),
    )
    expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(2)
    expect(mocks.replaceTaskDependencies).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).toHaveBeenCalledWith(expect.objectContaining({
      projectId: expect.any(String),
      actorId: 'user-1',
      transactionClient: expect.objectContaining({
        query: mocks.txClientQuery,
        release: mocks.txClientRelease,
      }),
      dependencies: expect.arrayContaining([
        expect.objectContaining({ taskId: 'task-2', dependencyTaskId: 'task-1', dependencyType: 'FS' }),
      ]),
    }))

    const sqlTexts = mocks.rawQuery.mock.calls.map(([sql]) => String(sql))
    expect(sqlTexts.some((sql) => sql.includes('INSERT INTO projects'))).toBe(true)
    expect(sqlTexts.filter((sql) => sql.includes('INSERT INTO acceptance_plans'))).toHaveLength(3)
    expect(sqlTexts.some((sql) => sql.includes('UPDATE task_conditions') && sql.includes('is_satisfied = TRUE'))).toBe(true)
    const insertProjectCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO projects'))
    expect(insertProjectCall?.[1]).toEqual(expect.arrayContaining(['wizard_drafting']))
    expect(mocks.materializeWizardScopeTree).toHaveBeenCalledWith(expect.objectContaining({
      generationBatchId: expect.any(String),
      transactionClient: expect.objectContaining({
        query: mocks.txClientQuery,
        release: mocks.txClientRelease,
      }),
    }))
    expect(mocks.getClient).toHaveBeenCalledTimes(1)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledWith(
      expect.objectContaining({
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-12',
          start_date: '2026-06-01',
          end_date: '2026-06-12',
          standard_task_metadata: expect.objectContaining({
            wizardGenerated: true,
            wizardSource: 'project_wizard',
            wizardGenerationBatchId: expect.any(String),
            wizardGenerationAttemptId: expect.any(String),
            durationSuggestion: expect.objectContaining({
              riskP20DurationDays: 8,
              riskP50DurationDays: 10,
              riskP80DurationDays: 14,
              durationRiskRange: expect.objectContaining({
                p20Days: 8,
                p50Days: 10,
                p80Days: 14,
              }),
            }),
          }),
        }),
      'user-1',
      expect.objectContaining({
        deferPostCreateEffects: true,
        postCreateEffectReason: 'project_wizard_batch_generation',
      }),
    )
    expect(mocks.createTaskInMainChain).toHaveBeenCalledWith(
      expect.objectContaining({
        planned_start_date: '2026-06-13',
        planned_end_date: '2026-06-17',
        start_date: '2026-06-13',
        end_date: '2026-06-17',
        standard_task_metadata: expect.objectContaining({
          wizardCandidateNetworkPlanDateApplication: expect.objectContaining({
            source: 'wizard_candidate_network_plan_date_application',
            previousPlannedStartDate: '2026-06-11',
            previousPlannedEndDate: '2026-06-15',
            plannedStartDate: '2026-06-13',
            plannedEndDate: '2026-06-17',
            evidenceLevel: 'candidate_network_plan_dates_applied_l1',
          }),
        }),
      }),
      'user-1',
      expect.objectContaining({
        deferPostCreateEffects: true,
        postCreateEffectReason: 'project_wizard_batch_generation',
      }),
    )
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledWith(
      expect.any(Array),
      'user-1',
      expect.objectContaining({
        transactionClient: expect.objectContaining({
          query: mocks.txClientQuery,
          release: mocks.txClientRelease,
        }),
      }),
    )
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).toHaveBeenCalledWith(expect.objectContaining({
      transactionClient: expect.objectContaining({
        query: mocks.txClientQuery,
        release: mocks.txClientRelease,
      }),
    }))
    expect(mocks.txClientQuery).toHaveBeenCalledWith('BEGIN')
    expect(mocks.txClientQuery).toHaveBeenCalledWith('COMMIT')
    const baselineInsertIndex = mocks.txClientQuery.mock.calls.findIndex(([sql]) => (
      String(sql).includes('INSERT INTO "task_baselines"')
    ))
    const baselineItemsInsertIndex = mocks.txClientQuery.mock.calls.findIndex(([sql]) => (
      String(sql).includes('INSERT INTO "task_baseline_items"')
    ))
    const commitIndex = mocks.txClientQuery.mock.calls.findIndex(([sql]) => sql === 'COMMIT')
    const baselineItemsInsertCall = mocks.txClientQuery.mock.calls[baselineItemsInsertIndex]
    expect(baselineInsertIndex).toBeGreaterThanOrEqual(0)
    expect(baselineItemsInsertIndex).toBeGreaterThan(baselineInsertIndex)
    expect(commitIndex).toBeGreaterThan(baselineItemsInsertIndex)
    expect(baselineItemsInsertCall?.[1]).toEqual(expect.arrayContaining(['task-1', 'task-2']))
    expect(mocks.txClientRelease).toHaveBeenCalledTimes(1)
    const finalProjectUpdateCall = findCompletedProjectMetadataUpdateCall()
    expect(finalProjectUpdateCall).toBeTruthy()
    expect(finalProjectUpdateCall?.[1]).toEqual(expect.arrayContaining([PROJECT_ACTIVE_STATUS, true]))
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('wizard_passed_acceptance_plan_ids')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('wizard_generation_duration_asset_utilization_summary')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('wizard_generation_duration_asset_consumption_receipts')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('wizard_generation_duration_asset_consumption_summary')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('wizard_generated_baseline_ids')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('wizard_generation_candidate_baseline')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('constructionOrganizationScenario')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).toContain('constructionOrganizationScenarioSummary')
    expect(String(finalProjectUpdateCall?.[1]?.[1])).not.toContain('wizard_draft_payload')
    const finalProjectMetadata = readCompletedProjectMetadata()
    expect(finalProjectMetadata.wizard_generation_duration_asset_utilization_summary).toEqual(expect.objectContaining({
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: 2,
      standardWorkDurationSeedRowCount: 2,
      t2RhythmTemplateRowCount: 2,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }))
    expect(finalProjectMetadata.wizard_generation_duration_asset_consumption_receipts).toEqual([
      expect.objectContaining({
        status: 'effective_applied',
        changedFields: ['duration'],
        targetRowIds: ['task-1'],
      }),
      expect.objectContaining({
        status: 'effective_applied',
        changedFields: ['dependency'],
        targetRowIds: ['task-2'],
      }),
    ])
    expect(finalProjectMetadata.wizard_generation_duration_asset_consumption_summary).toEqual(expect.objectContaining({
      totalCount: 2,
      effectiveAppliedCount: 2,
    }))
    expect(finalProjectMetadata.wizard_generation_candidate_baseline).toEqual(expect.objectContaining({
      baselineId: expect.any(String),
      itemCount: 2,
      mappedTaskCount: 2,
    }))
    expect(finalProjectMetadata.wizard_generated_baseline_ids).toEqual([
      finalProjectMetadata.wizard_generation_candidate_baseline.baselineId,
    ])
    expect(finalProjectMetadata.wizard_generation_post_commit_derivations).toEqual(expect.objectContaining({
      status: 'pending',
      stages: expect.objectContaining({
        critical_path: expect.objectContaining({ status: 'pending', attemptCount: 0 }),
        duration_evidence: expect.objectContaining({ status: 'pending', attemptCount: 0 }),
      }),
    }))
    expect(finalProjectMetadata.wizard_generation_candidate_duration_asset_preview).toEqual(expect.objectContaining({
      source: 'generated_wbs_rows_candidate_duration_asset_preview',
      mutationBoundary: 'preview_only_no_duration_runtime_write_no_task_write',
      writesDurationRuntime: false,
      writesTasks: false,
    }))
    expect(finalProjectMetadata.wizard_generation_candidate_network_evaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      materializationStatus: 'preview_only',
      criticalTaskIds: ['task-1', 'task-2'],
      taskIdMappingStatus: 'materialized_task_ids_available',
      taskIdMappingMutationBoundary: 'candidate_network_task_id_mapping_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(finalProjectMetadata.wizard_generation_plan_quality_diagnostics).toEqual(expect.objectContaining({
      source: 'wizard_generation_plan_quality_diagnostics',
      intendedUse: 'offline_development_quality_review_and_template_calibration',
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      blocksBaselinePublication: false,
      scheduleRowCount: 2,
    }))
    const criticalPathRefreshMetadata = readCriticalPathRefreshMetadata()
    const criticalPathRefreshMetadataUpdateCall = findCriticalPathRefreshMetadataUpdateCall()
    expect(String(criticalPathRefreshMetadataUpdateCall?.[0])).toContain(
      "COALESCE(metadata, '{}'::jsonb) || $2::jsonb",
    )
    expect(criticalPathRefreshMetadata.wizard_generation_critical_path_refresh).toEqual(expect.objectContaining({
      source: 'project_wizard_post_commit_critical_path_refresh',
      status: 'refreshed',
      taskCount: 2,
      eligibleTaskCount: 2,
      criticalTaskCount: 2,
      projectDurationDays: 15,
      criticalPathInputHash: 'hash-wizard-cpm',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesRuntimeCriticalPathProjection: true,
      writesCriticalPathFacts: true,
    }))
    expect(criticalPathRefreshMetadata.wizard_generation_post_commit_derivations).toEqual(expect.objectContaining({
      status: 'succeeded',
      stages: expect.objectContaining({
        critical_path: expect.objectContaining({ status: 'succeeded', attemptCount: 1 }),
        duration_evidence: expect.objectContaining({ status: 'succeeded', attemptCount: 1 }),
      }),
    }))
    expect(finalProjectMetadata.constructionOrganizationScenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
        'shared_basement_first_then_tower',
      ]),
      projectLevelSnapshot: expect.objectContaining({
        source: 'project_wizard_commit',
        generationBatchId: expect.any(String),
        mode: 'starting_line',
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
      }),
    }))
    expect(finalProjectMetadata.constructionOrganizationScenarioSummary).toEqual(expect.objectContaining({
      source: 'project_wizard_commit_construction_organization_summary',
      recommendedPlanOptionId: 'plan-option-foundation-basement',
      recommendedScenarioIds: expect.arrayContaining(['pile_before_excavation']),
      planOptionCount: 2,
      planOptionComparisonPackage: expect.objectContaining({
        totalOptionCount: 2,
        recommendedOptionIdsByUseCase: expect.objectContaining({
          newProjectPlanning: 'plan-option-foundation-basement',
          accelerationRecovery: 'plan-option-tower-early',
        }),
        options: expect.arrayContaining([
          expect.objectContaining({
            optionId: 'plan-option-foundation-basement',
            nextGovernanceAction: 'manual_review_handoff',
          }),
        ]),
      }),
      organizationDecisionReport: expect.objectContaining({
        source: 'construction_organization_decision_report',
        reportRole: 'product_best_scheme_read_model',
        selectedByUseCase: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            optionId: 'plan-option-foundation-basement',
            decisionBasis: expect.arrayContaining(['uses_existing_wizard_project_facts']),
            boundaryPolicy: expect.objectContaining({
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesCriticalPathFacts: false,
              writesAccelerationDraft: false,
            }),
          }),
          startingLineOnboarding: expect.objectContaining({
            optionId: 'plan-option-foundation-basement',
            actionability: 'not_actionable_after_current_phase',
          }),
          accelerationRecovery: expect.objectContaining({
            optionId: 'plan-option-tower-early',
            e5RecoverableSpanDays: 12,
            recoveryFactorHint: 1.16,
          }),
        }),
        productCloseoutReadiness: expect.objectContaining({
          source: 'construction_organization_product_closeout_readiness_from_decision_report',
          status: 'candidate_recommendation_only_runtime_closeout_required',
          canDeclareConstructionOrganizationProductOutcomeCloseout: false,
          productOutcomeCloseoutProgress: expect.objectContaining({
            source: 'construction_organization_product_outcome_closeout_progress',
            supportedBusinessTypeCount: 11,
            runtimeOutcomeReadyBusinessTypeCount: 0,
            missingBusinessTypes: expect.arrayContaining(['hospital']),
            mutationBoundary: expect.objectContaining({
              writesTaskDependencies: false,
              writesPlanDates: false,
              writesAccelerationDraft: false,
            }),
          }),
          missingBeforeProductCloseout: expect.arrayContaining([
            'real_runtime_evidence_source_required',
            'runtime_use_case_coverage_required',
            'runtime_option_network_coverage_required',
            'site_adoption_of_runtime_recommended_option_required',
          ]),
        }),
        decisionSignals: expect.objectContaining({
          usesExistingWizardFactsOnly: true,
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        }),
        boundaryPolicy: expect.objectContaining({
          candidateOnly: true,
          readOnlyBestScheme: true,
          runtimeMaterializationRequiresGovernance: true,
        }),
      }),
      productOutcomeCloseoutProgress: expect.objectContaining({
        source: 'construction_organization_product_outcome_closeout_progress',
        supportedBusinessTypeCount: 11,
        runtimeOutcomeReadyBusinessTypeCount: 0,
      }),
      accelerationRecovery: expect.objectContaining({
        optionId: 'plan-option-tower-early',
        actionability: 'actionable_candidate',
        recommendationBasis: expect.arrayContaining([
          'e5_recoverable_span_priority',
          'bounded_recovery_factor_only',
        ]),
      }),
      scenarioRecommendations: expect.objectContaining({
        newProjectPlanning: expect.objectContaining({
          recommendationBasis: expect.arrayContaining([
            'default_new_project_planning_option',
            'uses_existing_wizard_project_facts',
          ]),
        }),
        startingLineOnboarding: expect.objectContaining({
          recommendationBasis: expect.arrayContaining([
            'starting_line_passed_milestones_present',
            'starting_line_current_phase_past_foundation_or_basement',
          ]),
          currentSubstage: 'main_structure',
        }),
      }),
      recommendedPlanOption: expect.objectContaining({
        optionId: 'plan-option-foundation-basement',
        selectedScenarioIds: expect.arrayContaining([
          'pile_before_excavation',
          'shared_basement_first_then_tower',
        ]),
        projectOrganizationScheme: expect.objectContaining({
          schemeFamily: 'shared_works_then_multi_building_lane',
          strategy: 'shared_basement_podium_then_multi_tower_lane_network',
          interfaceGateTags: expect.arrayContaining(['shared_basement_gate', 'tower_lane_gate']),
          writesTaskDependencies: false,
          writesPlanDates: false,
        }),
        selectionReasons: expect.arrayContaining([
          'pile_foundation_fact_present',
        ]),
        excludedReasons: expect.arrayContaining([
          expect.objectContaining({
            scenarioId: expect.any(String),
            reasons: expect.any(Array),
          }),
        ]),
      }),
      planOptions: expect.arrayContaining([
        expect.objectContaining({
          optionId: 'plan-option-foundation-basement',
          projectOrganizationScheme: expect.objectContaining({
            schemeFamily: 'shared_works_then_multi_building_lane',
          }),
          useCaseEvaluations: expect.objectContaining({
            newProjectPlanning: expect.objectContaining({
              rankBasis: expect.arrayContaining([
                'default_new_project_planning_option',
                'uses_existing_wizard_project_facts',
              ]),
            }),
          }),
        }),
      ]),
      scopeOrganizationFacts: expect.objectContaining({
        source: 'wizard_scope_objects',
        sharedBasementServiceTargetKindCounts: expect.objectContaining({ building: 2 }),
        organizationSignals: expect.arrayContaining(['shared_basement_serves_multiple_buildings']),
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(mocks.clearProjectBootstrapCache).toHaveBeenCalledWith(expect.any(String))
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('FROM public.construction_organization_plan_network_runtime_publications'))).toBe(true)
    expect(mocks.writeChangeLog).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'project_onboarding_committed',
      changeSource: 'algorithm_generated',
      metadata: expect.objectContaining({
        createdTaskCount: 2,
        passedMilestoneCount: 2,
        satisfiedConditionCount: 1,
        durationAssetUtilizationSummary: expect.objectContaining({
          source: 'default_master_plan_duration_asset_utilization_summary',
          productionWritePolicy: 'candidate_only_no_task_dependencies_write',
        }),
        criticalPathRefresh: expect.objectContaining({
          source: 'project_wizard_post_commit_critical_path_refresh',
          status: 'refreshed',
          writesTaskDependencies: false,
          writesPlanDates: false,
        }),
        constructionOrganizationScenarioSummary: expect.objectContaining({
          recommendedPlanOptionId: 'plan-option-foundation-basement',
        }),
      }),
    }))
    expect(mocks.recordConstructionOrganizationPlanNetworkRecommendationDecision).toHaveBeenCalledWith(expect.objectContaining({
      projectId: committedProjectId,
      companyId: 'company-1',
      actionType: 'adopted',
      optionId: 'plan-option-foundation-basement',
      draftNetworkKey: 'plan-option-foundation-basement',
      publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
      selectedScenarioIds: expect.arrayContaining(['pile_before_excavation']),
      decidedBy: 'user-1',
      decisionContext: expect.objectContaining({
        decisionSource: 'project_wizard_commit',
        useCase: 'startingLineOnboarding',
        businessType: 'hospital',
        projectId: committedProjectId,
        optionId: 'plan-option-foundation-basement',
        publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(mocks.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      observationContext: expect.objectContaining({
        decisionSource: 'project_wizard_commit',
        useCase: 'startingLineOnboarding',
        businessType: 'hospital',
        projectId: committedProjectId,
        optionId: 'plan-option-foundation-basement',
        publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
      sourceEvidenceRefs: expect.arrayContaining([
        expect.stringContaining(`project_wizard_commit:${committedProjectId}:`),
      ]),
    }))
    expect(mocks.recordConstructionOrganizationPlanNetworkSavedOutcome).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
      outcomeStatus: 'accepted',
      outcomeRef: expect.stringContaining(`project_wizard_commit:${committedProjectId}:`),
      companyId: 'company-1',
      projectId: committedProjectId,
      metadata: expect.objectContaining({
        decisionSource: 'project_wizard_commit',
        useCase: 'startingLineOnboarding',
        businessType: 'hospital',
        optionId: 'plan-option-foundation-basement',
        publicationKey: 'construction_org_plan_network_runtime:project-1:hospital-option',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
    }))
  })

  it('recomputes committed target alignment when duration assets shorten the generated natural end date', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      const text = String(sql)
      if (text.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {},
          }],
        }
      }
      if (
        text.includes('FROM public.algorithm_asset_candidate_events')
        || text.includes('FROM public.construction_organization_plan_network_runtime_publications')
      ) {
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 1, rows: [{ id: 'project-1' }] }
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            start_date: '2026-06-01',
            end_date: '2026-06-20',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 20,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'row-1', dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
          values: {
            title: '砌体插入施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            start_date: '2026-06-13',
            end_date: '2026-06-17',
            planned_start_date: '2026-06-13',
            planned_end_date: '2026-06-17',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 5,
                baseSelectedDurationDays: 5,
                standardWorkDurationSeedStableCode: 'STD-MASONRY-INFILL',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
      ]),
      candidateNetworkEvaluation: null,
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        t2RhythmTemplateRowCount: 0,
        rowsMissingDurationAssetCount: 0,
      },
      governanceWarnings: [],
      targetFeasibility: {
        mode: 'compression_preview',
        scenario: 'baseline_target_alignment',
        targetEndDate: '2026-06-18',
        naturalEndDate: '2026-06-20',
        overshootDays: 2,
        recoverableDays: 0,
        unrecoverableDays: 2,
        verdict: 'requires_scope_change',
        strategies: [],
      },
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockReturnValueOnce(
      makeCandidateNetworkEvaluation(['row-1', 'row-2'], {
        projectedNetworkSpanDays: 17,
        previewEdgeCount: 1,
      }),
    )

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        projectId: 'project-1',
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2026-06-18',
          onboardingPassedMilestones: [],
        }),
      })
      .expect(200)

    expect(response.body.data.generation.targetFeasibility).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-18',
      naturalEndDate: '2026-06-17',
      overshootDays: 0,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_target_recalculation',
        adjustedRowCount: 1,
        previousNaturalEndDate: '2026-06-20',
        recalculatedNaturalEndDate: '2026-06-17',
        previousOvershootDays: 2,
        recalculatedOvershootDays: 0,
        mutationBoundary: 'candidate_target_recalculation_only_no_plan_date_write_no_dependency_write_no_runtime_publication',
      }),
    }))

    const finalProjectMetadata = readCompletedProjectMetadata()
    expect(finalProjectMetadata.wizard_generation_target_feasibility).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-18',
      naturalEndDate: '2026-06-17',
      overshootDays: 0,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        previousNaturalEndDate: '2026-06-20',
        recalculatedNaturalEndDate: '2026-06-17',
      }),
    }))
    expect(finalProjectMetadata.wizard_generation_plan_quality_diagnostics.targetAlignmentSnapshot).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-18',
      naturalEndDate: '2026-06-17',
      overshootDays: 0,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        previousOvershootDays: 2,
        recalculatedOvershootDays: 0,
      }),
    }))
  })

  it('persists construction organization scenario from wizard facts when generated rows lack row-level projection metadata', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '妗╁熀鏂藉伐',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
      ]),
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain.mockResolvedValueOnce({ task: { id: 'task-1', title: '妗╁熀鏂藉伐' } })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'residential',
          methodVariantCodes: ['pile_foundation', 'vertical_retaining', 'no_horizontal_strut'],
          buildingCount: 3,
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2028-06-01',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.scope).toEqual(expect.objectContaining({
      buildingCount: 3,
    }))
    expect(generationCall.operation.projectFacts).toEqual(expect.objectContaining({
      buildingCount: 3,
      scopeOrganizationFacts: expect.objectContaining({
        buildingObjectCount: 3,
        organizationSignals: expect.arrayContaining([
          'explicit_building_count_fact',
          'multi_building_scope_objects',
        ]),
      }),
    }))

    const finalProjectMetadata = readCompletedProjectMetadata()
    expect(finalProjectMetadata.constructionOrganizationScenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
      ]),
      projectLevelSnapshot: expect.objectContaining({
        source: 'project_wizard_commit',
        mode: 'new',
        rowCarrierClientRowId: null,
        fallbackBasis: 'project_generation_facts_selector',
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
      }),
    }))
    expect(finalProjectMetadata.constructionOrganizationScenarioSummary).toEqual(expect.objectContaining({
      source: 'project_wizard_commit_construction_organization_summary',
      recommendedScenarioIds: expect.arrayContaining(['pile_before_excavation']),
      scopeOrganizationFacts: expect.objectContaining({
        buildingObjectCount: 3,
      }),
      projectOrganizationPolicy: expect.objectContaining({
        source: 'project_construction_organization_policy_seed',
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
    expect(mocks.recordConstructionOrganizationPlanNetworkRecommendationDecision).not.toHaveBeenCalled()
    expect(mocks.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation).not.toHaveBeenCalled()
    expect(mocks.recordConstructionOrganizationPlanNetworkSavedOutcome).not.toHaveBeenCalled()
  })

  it('materializes feature-triggered acceptance milestone rows into dated acceptance plans during wizard commit', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-gb55032-template', 'china-project-milestone-handover'],
      triggeredItemPacks: ['school_core_pack'],
      triggeredDangerItems: [],
      triggeredMilestones: ['completion_acceptance'],
      scopeAssignmentRules: [],
      expectedRowCount: { overview: 16, standard: 40, detailed: 120 },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'ordinary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-12-31',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
        {
          clientRowId: 'acceptance-row',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'ordinary-row', dependencyType: 'FS', lagDays: 0, source: 'milestone_sequence' }],
          values: {
            title: '竣工验收与交付移交',
            status: 'todo',
            progress: 0,
            planned_start_date: '2027-12-20',
            planned_end_date: '2027-12-20',
            execution_phase: 'acceptance_handover',
            execution_lane: 'school_handover',
            completion_rule: 'acceptance_passed',
            is_milestone: true,
            standard_task_metadata: {
              wizardGenerated: true,
              isAcceptanceMilestone: true,
              planItemKind: 'milestone',
              stableCode: 'MS-01-01-11',
            },
          },
        },
      ]),
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
      targetFeasibility: null,
    })
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockReturnValueOnce(
      makeCandidateNetworkEvaluation(['ordinary-row', 'acceptance-row'], {
        projectedNetworkSpanDays: 568,
        previewEdgeCount: 1,
      }),
    )
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain
      .mockResolvedValueOnce({ task: { id: 'ordinary-task', title: '主体结构施工' } })
      .mockResolvedValueOnce({ task: { id: 'acceptance-task', title: '竣工验收与交付移交' } })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'school',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2027-12-31',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    const acceptancePlanInserts = mocks.rawQuery.mock.calls.filter(([sql, params]) => (
      String(sql).includes('INSERT INTO acceptance_plans')
      && Array.isArray(params)
      && params.includes('竣工验收与交付移交')
    ))
    expect(acceptancePlanInserts).toHaveLength(1)
    expect(String(acceptancePlanInserts[0]?.[0])).not.toMatch(/\btask_id\b/i)
    expect(acceptancePlanInserts[0]?.[1]).toEqual([
      expect.any(String),
      expect.any(String),
      '竣工验收与交付移交',
      'completion',
      '2027-12-20',
      'draft',
      '[]',
      expect.stringContaining('[wizard_generation_batch_id:'),
      'user-1',
      expect.any(String),
      expect.any(String),
    ])
    const acceptancePlanId = String(acceptancePlanInserts[0]?.[1]?.[0])
    const acceptanceTaskLinkInsert = mocks.rawQuery.mock.calls.find(([sql, params]) => (
      String(sql).includes('INSERT INTO project_entity_links')
      && Array.isArray(params)
      && params[1] === acceptancePlanId
      && params[2] === 'acceptance-task'
    ))
    expect(acceptanceTaskLinkInsert).toBeTruthy()
    expect(String(acceptanceTaskLinkInsert?.[0])).toContain("'acceptance_plan'")
    expect(String(acceptanceTaskLinkInsert?.[0])).toContain("'task'")
    expect(String(acceptanceTaskLinkInsert?.[0])).toContain("'covers_task'")
    expect(String(acceptanceTaskLinkInsert?.[0])).toContain("'system_inferred'")
    expect(String(acceptanceTaskLinkInsert?.[0])).toContain("'active'")
    expect(JSON.parse(String(acceptanceTaskLinkInsert?.[1]?.[4]))).toEqual({
      wizardGeneration: {
        generationBatchId: expect.any(String),
        clientRowId: 'acceptance-row',
      },
    })
    expect(response.body.data.generation.candidateAcceptancePlanPreview).toEqual(expect.objectContaining({
      source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
      mutationBoundary: 'preview_only_no_acceptance_plan_write',
      totalCount: 1,
      datedCount: 1,
      featureTriggeredAcceptanceScheduleRowCount: 1,
      writesAcceptancePlans: false,
    }))
    expect(response.body.data.generation.candidateAcceptancePlanPreview.items).toEqual([
      expect.objectContaining({
        clientRowId: 'acceptance-row',
        title: '竣工验收与交付移交',
        acceptanceType: 'completion',
        plannedDate: '2027-12-20',
        featureTriggeredAcceptanceScheduleRow: true,
        acceptanceScheduleEvidence: 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write',
        executionPhase: 'acceptance_handover',
        executionLane: 'school_handover',
        sourceBasis: 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write',
        createdTaskId: 'acceptance-task',
        createdAcceptancePlanId: expect.any(String),
        materializationStatus: 'materialized_acceptance_plan_available',
        materializationEvidenceLevel: 'candidate_acceptance_plan_materialized_id_mapping_l1',
        materializationMutationBoundary: 'acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record',
      }),
    ])
    expect(response.body.data.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      acceptanceMilestoneCount: 1,
      datedAcceptanceMilestoneCount: 1,
      materializedAcceptanceMilestoneCount: 1,
    }))
    const finalProjectMetadata = readCompletedProjectMetadata()
    expect(finalProjectMetadata.wizard_generation_candidate_acceptance_plan_preview).toEqual(expect.objectContaining({
      source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
      mutationBoundary: 'preview_only_no_acceptance_plan_write',
      totalCount: 1,
      datedCount: 1,
      featureTriggeredAcceptanceScheduleRowCount: 1,
      writesAcceptancePlans: false,
    }))
    expect(finalProjectMetadata.wizard_generation_candidate_acceptance_plan_preview.items).toEqual([
      expect.objectContaining({
        clientRowId: 'acceptance-row',
        featureTriggeredAcceptanceScheduleRow: true,
        acceptanceScheduleEvidence: 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write',
        createdTaskId: 'acceptance-task',
        createdAcceptancePlanId: expect.any(String),
        materializationStatus: 'materialized_acceptance_plan_available',
      }),
    ])
    expect(response.body.data.generation.candidateAcceptancePlanPreview).toEqual(expect.objectContaining({
      featureTriggeredAcceptanceScheduleRowCount: 1,
    }))

  })

  it('does not block a structurally valid wizard commit on offline plan-quality diagnostics', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-gb55032-template', 'china-project-milestone-handover'],
      triggeredItemPacks: ['school_core_pack'],
      triggeredDangerItems: [],
      triggeredMilestones: ['completion_acceptance'],
      scopeAssignmentRules: [],
      expectedRowCount: { overview: 16, standard: 40, detailed: 120 },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'ordinary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-12-31',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
        {
          clientRowId: 'acceptance-row',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'ordinary-row', dependencyType: 'FS', lagDays: 0, source: 'milestone_sequence' }],
          values: {
            title: '竣工验收与交付移交',
            status: 'todo',
            progress: 0,
            planned_start_date: '2027-12-20',
            planned_end_date: '2027-12-20',
            execution_phase: 'acceptance_handover',
            execution_lane: 'school_handover',
            completion_rule: 'acceptance_passed',
            is_milestone: true,
            standard_task_metadata: {
              wizardGenerated: true,
              isAcceptanceMilestone: true,
              planItemKind: 'milestone',
              stableCode: 'MS-01-01-11',
            },
          },
        },
      ]),
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
      targetFeasibility: null,
    })
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockReturnValueOnce(
      makeCandidateNetworkEvaluation(['ordinary-row', 'acceptance-row'], {
        projectedNetworkSpanDays: 568,
        previewEdgeCount: 1,
        unresolvedEdgeCount: 0,
      }),
    )
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain
      .mockResolvedValueOnce({ task: { id: 'ordinary-task', title: '主体结构施工' } })
      .mockResolvedValueOnce({ task: { id: 'acceptance-task', title: '竣工验收与交付移交' } })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'school',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2027-12-31',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(response.body.data.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      blocksBaselinePublication: false,
      intendedUse: 'offline_development_quality_review_and_template_calibration',
    }))
    const transactionStatements = mocks.txClientQuery.mock.calls.map(([sql]) => String(sql).trim().toUpperCase())
    expect(transactionStatements).toContain('COMMIT')
    expect(transactionStatements).not.toContain('ROLLBACK')
    expect(findCompletedProjectMetadataUpdateCall()).toBeDefined()
  })

  it('materializes target-date acceptance fallback as a draft acceptance plan when no acceptance row is generated', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'ordinary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
      ]),
      durationAssetUtilizationSummary: null,
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain.mockResolvedValueOnce({ task: { id: 'ordinary-task', title: '主体结构施工' } })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'school',
          terminalEvent: 'completion_acceptance',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2027-12-31',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    const acceptancePlanInserts = mocks.rawQuery.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT INTO acceptance_plans')
    ))
    expect(acceptancePlanInserts).toHaveLength(1)
    expect(String(acceptancePlanInserts[0]?.[0])).not.toMatch(/\btask_id\b/i)
    const acceptancePlanInsertParams = acceptancePlanInserts[0]?.[1] as unknown[]
    expect(acceptancePlanInsertParams[1]).toEqual(expect.any(String))
    expect(acceptancePlanInsertParams[3]).toBe('completion_acceptance')
    expect(acceptancePlanInsertParams[4]).toBe('2027-12-31')
    expect(acceptancePlanInsertParams[5]).toBe('draft')
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO project_entity_links'))).toBe(false)
    expect(response.body.data.generation.candidateAcceptancePlanPreview).toEqual(expect.objectContaining({
      source: 'wizard_target_candidate_acceptance_plan_preview',
      fallbackFromProjectTarget: true,
      totalCount: 1,
      datedCount: 1,
      materializedCount: 1,
      materializationRequiredForPlanConsistency: true,
      materializationStatus: 'materialized_acceptance_plans_available',
    }))
    expect(response.body.data.generation.candidateAcceptancePlanPreview.items).toEqual([
      expect.objectContaining({
        clientRowId: 'wizard-target-completion-acceptance',
        acceptanceType: 'completion_acceptance',
        plannedDate: '2027-12-31',
        createdTaskId: null,
        createdAcceptancePlanId: expect.any(String),
        materializationStatus: 'materialized_acceptance_plan_available',
      }),
    ])
    expect(response.body.data.generation.candidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_date_window_fallback',
      networkBasis: 'generated_wbs_rows_plan_date_window_without_dependency_edges',
      projectedNetworkSpanDays: 10,
      previewEdgeCount: 0,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['ordinary-row'],
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(response.body.data.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      projectedNetworkSpanDays: 10,
      acceptanceMilestoneCount: 1,
      datedAcceptanceMilestoneCount: 1,
      materializedAcceptanceMilestoneCount: 1,
    }))
    expect(response.body.data.generation.planQualityDiagnostics.candidateGapCodes)
      .not.toContain('missing_dated_acceptance_milestone')

  })

  it('persists candidate-only construction organization plan option anchors during wizard commit before runtime publication exists', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '妗╁熀鏂藉伐',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
      ]),
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain.mockResolvedValueOnce({ task: { id: 'task-1', title: '妗╁熀鏂藉伐' } })
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      const text = String(sql)
      if (text.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {},
          }],
        }
      }
      if (text.includes('FROM public.algorithm_asset_candidate_events')) {
        return { rowCount: 0, rows: [] }
      }
      if (text.includes('INSERT INTO public.algorithm_asset_candidate_events')) {
        return { rowCount: 1, rows: [{ id: 'candidate-event-1' }] }
      }
      return { rowCount: 1, rows: [{ id: 'project-1' }] }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'residential',
          methodVariantCodes: ['pile_foundation', 'vertical_retaining', 'no_horizontal_strut'],
          buildingCount: 3,
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2028-06-01',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)
    const committedProjectId = response.body.data.projectId

    const candidateInsertCalls = mocks.rawQuery.mock.calls.filter(([sql, params]) => (
      String(sql).includes('INSERT INTO public.algorithm_asset_candidate_events')
      && Array.isArray(params)
      && String(params[0] ?? '').startsWith('construction_organization.plan_option.')
      && params[1] === 'constructionOrganizationScenarioGovernanceService'
    ))
    expect(candidateInsertCalls.length).toBeGreaterThan(0)
    expect(candidateInsertCalls[0]?.[1]).toEqual(expect.arrayContaining([
      expect.stringMatching(/^construction_organization\.plan_option\./),
      'constructionOrganizationScenarioGovernanceService',
      expect.any(String),
      'project',
      'company-1',
      committedProjectId,
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
    expect(mocks.recordConstructionOrganizationPlanNetworkRecommendationDecision).not.toHaveBeenCalled()
    expect(mocks.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation).not.toHaveBeenCalled()
    expect(mocks.recordConstructionOrganizationPlanNetworkSavedOutcome).not.toHaveBeenCalled()
  })

  it('records new project construction organization runtime evidence when a published plan option is available', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([{
        clientRowId: 'row-1',
        parentClientRowId: null,
        sortOrder: 1,
        predecessorDependencies: [],
        values: {
          title: '妗╁熀鏂藉伐',
          status: 'todo',
          progress: 0,
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-20',
          standard_task_metadata: {
            wizardGenerated: true,
          },
        },
      }]),
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain.mockResolvedValueOnce({ task: { id: 'task-1', title: '妗╁熀鏂藉伐' } })
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql)
      if (text.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {},
          }],
        }
      }
      if (text.includes('FROM public.algorithm_asset_candidate_events')) {
        return {
          rowCount: 1,
          rows: [{
            candidate_payload: {
              option: {
                optionId: 'construction_org_option:pile_before_excavation+shared_basement_first_then_tower',
                businessType: 'residential',
                selectedScenarioIds: ['pile_before_excavation', 'shared_basement_first_then_tower'],
                runtimeEngineEvidence: {
                  publicationKey: 'construction_org_plan_network_runtime:project-1:residential-option',
                },
              },
            },
          }],
        }
      }
      return { rowCount: 1, rows: [{ id: 'project-1' }] }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'residential',
          methodVariantCodes: ['pile_foundation', 'vertical_retaining', 'no_horizontal_strut'],
          buildingCount: 3,
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2028-06-01',
          actualStartDate: undefined,
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(mocks.recordConstructionOrganizationPlanNetworkRecommendationDecision).toHaveBeenCalledWith(expect.objectContaining({
      projectId: response.body.data.projectId,
      companyId: 'company-1',
      actionType: 'adopted',
      publicationKey: 'construction_org_plan_network_runtime:project-1:residential-option',
      decisionContext: expect.objectContaining({
        decisionSource: 'project_wizard_commit',
        useCase: 'newProjectPlanning',
        businessType: 'residential',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(mocks.recordConstructionOrganizationPlanNetworkRuntimeConsumerObservation).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'construction_org_plan_network_runtime:project-1:residential-option',
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      observationContext: expect.objectContaining({
        decisionSource: 'project_wizard_commit',
        useCase: 'newProjectPlanning',
        businessType: 'residential',
        projectId: response.body.data.projectId,
        publicationKey: 'construction_org_plan_network_runtime:project-1:residential-option',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesCriticalPathFacts: false,
        writesAccelerationDraft: false,
      }),
    }))
    expect(mocks.recordConstructionOrganizationPlanNetworkSavedOutcome).toHaveBeenCalledWith(expect.objectContaining({
      publicationKey: 'construction_org_plan_network_runtime:project-1:residential-option',
      outcomeStatus: 'accepted',
      projectId: response.body.data.projectId,
      metadata: expect.objectContaining({
        useCase: 'newProjectPlanning',
        businessType: 'residential',
      }),
    }))
  })

  it('queues wizard generation for async commits and exposes status without doing heavy work in the request', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        asyncGeneration: true,
        wizardPayload: makeWizardPayload(),
      })
      .expect(202)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: expect.any(String),
      status: 'wizard_drafting',
      generation: expect.objectContaining({
        state: 'queued',
        attemptId: expect.any(String),
      }),
    }))
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()

    const queuedProjectCall = mocks.rawQuery.mock.calls.find(([_sql, params]) => (
      Array.isArray(params)
      && String(params[1] ?? '').includes('"wizard_generation_state":"queued"')
    ))
    expect(queuedProjectCall).toBeTruthy()

    const queuedAttemptId = response.body.data.generation.attemptId
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: response.body.data.projectId,
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {
              wizard_generation_state: 'queued',
              wizard_generation_attempt_id: queuedAttemptId,
              wizard_generation_queued_at: response.body.data.generation.queuedAt,
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })
    const statusResponse = await request(buildApp())
      .get(`/api/projects/${response.body.data.projectId}/wizard/generation/${queuedAttemptId}`)
      .expect(200)

    expect(statusResponse.body.data).toEqual(expect.objectContaining({
      projectId: response.body.data.projectId,
      attemptId: queuedAttemptId,
      state: 'queued',
    }))
  })

  it('returns completed async wizard generation evidence from project metadata', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: '进行中',
            default_wbs_generated: true,
            metadata: {
              wizard_generation_state: 'completed',
              wizard_generation_attempt_id: 'attempt-1',
              wizard_generation_batch_id: 'batch-1',
              wizard_completed_at: '2026-06-19T12:00:00.000Z',
              wizard_generated_row_count: 2,
              wizard_created_task_ids: ['task-1', 'task-2'],
              wizard_generation_duration_asset_utilization_summary: {
                source: 'default_master_plan_duration_asset_utilization_summary',
                scheduleRowCount: 2,
              },
              wizard_generation_candidate_duration_asset_preview: {
                source: 'generated_wbs_rows_candidate_duration_asset_preview',
                totalCount: 1,
                writesTasks: false,
              },
              wizard_generation_candidate_network_evaluation: {
                source: 'generated_wbs_row_candidate_network_cpm',
                projectedNetworkSpanDays: 120,
                writesTaskDependencies: false,
              },
              wizard_generation_candidate_acceptance_plan_preview: {
                source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
                totalCount: 1,
                writesAcceptancePlans: false,
              },
              wizard_generation_candidate_baseline: {
                baselineId: '44444444-4444-4444-8444-444444444444',
                sourceVersionLabel: 'managed_frontier_default_master_plan',
                status: 'draft',
                itemCount: 2,
                mappedTaskCount: 2,
                generationBatchId: 'batch-1',
              },
              wizard_generation_critical_path_refresh: {
                source: 'project_wizard_post_commit_critical_path_refresh',
                status: 'refreshed',
                criticalTaskCount: 2,
                projectDurationDays: 120,
                writesTaskDependencies: false,
                writesPlanDates: false,
              },
              wizard_generation_post_commit_derivations: {
                source: 'wizard_post_commit_derivation_recovery',
                operationId: 'project-1:batch-1:wizard_post_commit_derivations',
                projectId: 'project-1',
                generationBatchId: 'batch-1',
                status: 'pending',
                createdAt: '2026-06-19T12:00:00.000Z',
                updatedAt: '2026-06-19T12:00:00.000Z',
                maxAttempts: 3,
                stages: {
                  critical_path: { status: 'pending', attemptCount: 1 },
                  duration_evidence: { status: 'succeeded', attemptCount: 1 },
                },
              },
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/generation/attempt-1')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: 'project-1',
      attemptId: 'attempt-1',
      state: 'completed',
      generationBatchId: 'batch-1',
      durationAssetUtilizationSummary: expect.objectContaining({
        scheduleRowCount: 2,
      }),
      candidateDurationAssetPreview: expect.objectContaining({
        totalCount: 1,
        writesTasks: false,
      }),
      candidateNetworkEvaluation: expect.objectContaining({
        projectedNetworkSpanDays: 120,
        writesTaskDependencies: false,
      }),
      candidateAcceptancePlanPreview: expect.objectContaining({
        totalCount: 1,
        writesAcceptancePlans: false,
      }),
      candidateBaseline: expect.objectContaining({
        baselineId: '44444444-4444-4444-8444-444444444444',
        status: 'draft',
        mappedTaskCount: 2,
      }),
      criticalPathRefresh: expect.objectContaining({
        source: 'project_wizard_post_commit_critical_path_refresh',
        criticalTaskCount: 2,
        writesTaskDependencies: false,
      }),
      postCommitDerivations: expect.objectContaining({
        source: 'wizard_post_commit_derivation_recovery',
        status: 'pending',
        generationBatchId: 'batch-1',
      }),
    }))
  })

  it('returns failed async wizard generation status from project metadata', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {
              wizard_generation_state: 'failed',
              wizard_generation_attempt_id: 'attempt-1',
              wizard_generation_failed_at: '2026-06-19T12:00:00.000Z',
              wizard_generation_last_error: 'task chain failed',
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/generation/attempt-1')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: 'project-1',
      attemptId: 'attempt-1',
      state: 'failed',
      error: 'task chain failed',
    }))
  })

  it('recovers a stale queued async wizard generation before returning status', async () => {
    let projectReads = 0
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (String(sql).includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        projectReads += 1
        return projectReads === 1
          ? {
              rowCount: 1,
              rows: [{
                id: 'project-1',
                company_id: 'company-1',
                status: 'wizard_drafting',
                default_wbs_generated: false,
                metadata: {
                  wizard_generation_state: 'queued',
                  wizard_generation_batch_id: 'batch-status-stale',
                  wizard_generation_attempt_id: 'attempt-status-stale',
                  wizard_generation_queued_at: '2026-01-01T00:00:00.000Z',
                },
              }],
            }
          : {
              rowCount: 1,
              rows: [{
                id: 'project-1',
                company_id: 'company-1',
                status: 'wizard_drafting',
                default_wbs_generated: false,
                metadata: {
                  wizard_generation_state: 'failed',
                  wizard_generation_attempt_id: 'attempt-status-stale',
                  wizard_generation_failed_at: '2026-06-25T00:00:00.000Z',
                  wizard_generation_last_error: 'Recovered a stale wizard generation attempt and reset the draft for a fresh retry.',
                  wizard_generation_last_error_code: 'WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED',
                },
              }],
            }
      }
      if (String(sql).includes('DELETE FROM acceptance_plans')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('DELETE FROM task_dependencies')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('DELETE FROM tasks')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('DELETE FROM engineering_objects')) return { rowCount: 0, rows: [] }
      if (String(sql).includes('default_wbs_generated = $5')) return { rowCount: 1, rows: [{ id: 'project-1' }] }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/generation/attempt-status-stale')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: 'project-1',
      attemptId: 'attempt-status-stale',
      state: 'failed',
      errorCode: 'WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED',
    }))
  })

  it('rejects duplicate wizard commit attempts before materializing scope or creating tasks', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('metadata = CASE WHEN metadata IS NULL THEN $2::jsonb ELSE metadata || $2::jsonb END')) {
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })
      .expect(409)

    expect(response.body.error.code).toBe('WIZARD_GENERATION_NOT_REENTRANT')
    expect(mocks.materializeWizardScopeTree).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('does not let a commit draft update overwrite a running wizard generation lock', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'wizard_drafting',
            company_id: 'company-1',
            default_wbs_generated: false,
            metadata: {
              wizard_generation_state: 'running',
              wizard_generation_batch_id: 'batch-running',
            },
          }],
        }
      }
      if (sql.includes('UPDATE projects')
        && sql.includes('metadata = $10::jsonb')
        && sql.includes('WHERE id = $1')) {
        expect(sql).toContain("metadata->>'wizard_generation_state'")
        expect(sql).toContain('wizard_completed_at')
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        projectId: 'project-1',
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })
      .expect(409)

    expect(response.body.error.code).toBe('WIZARD_GENERATION_NOT_REENTRANT')
    expect(mocks.materializeWizardScopeTree).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('recovers a stale running wizard generation attempt before retrying commit', async () => {
    let beginAttempts = 0

    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('metadata = CASE WHEN metadata IS NULL THEN $2::jsonb ELSE metadata || $2::jsonb END')) {
        beginAttempts += 1
        return beginAttempts === 1
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ id: 'project-1' }] }
      }
      if (sql.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {
              wizard_generation_state: 'running',
              wizard_generation_batch_id: 'batch-stale',
              wizard_generation_started_at: '2026-01-01T00:00:00.000Z',
              wizard_created_task_ids: ['task-stale-1'],
              wizard_materialized_object_ids: ['object-stale-1'],
              wizard_generated_acceptance_plan_ids: ['acceptance-generated-stale-1'],
              wizard_passed_acceptance_plan_ids: ['acceptance-stale-1'],
            },
          }],
        }
      }
      if (sql.includes('SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            status: 'wizard_drafting',
            default_wbs_generated: false,
            metadata: {},
          }],
        }
      }
      if (sql.includes('DELETE FROM acceptance_plans')) {
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('DELETE FROM project_entity_links')) {
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('DELETE FROM task_dependencies')) {
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('DELETE FROM tasks')) {
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('DELETE FROM engineering_objects')) {
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('UPDATE task_conditions')) {
        return { rowCount: 1, rows: [{ id: 'condition-1' }] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(beginAttempts).toBe(2)

    const deleteAcceptanceCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM acceptance_plans'))
    const deleteAcceptanceTaskLinksCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM project_entity_links'))
    const deleteTasksCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM tasks'))
    const deleteObjectsCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))
    const resetProjectCall = mocks.rawQuery.mock.calls.find(([sql, callParams]) => (
      String(sql).includes('default_wbs_generated = $5')
      && Array.isArray(callParams)
      && String(callParams[1]).includes('WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED')
    ))

    expect(deleteAcceptanceTaskLinksCall).toBeTruthy()
    expect(String(deleteAcceptanceTaskLinksCall?.[0])).toContain("source_entity_type = 'acceptance_plan'")
    expect(String(deleteAcceptanceTaskLinksCall?.[0])).toContain("target_entity_type = 'task'")
    expect(String(deleteAcceptanceTaskLinksCall?.[0])).toContain("relation_type = 'covers_task'")
    expect(mocks.rawQuery.mock.calls.indexOf(deleteAcceptanceTaskLinksCall!))
      .toBeLessThan(mocks.rawQuery.mock.calls.indexOf(deleteAcceptanceCall!))
    expect(deleteAcceptanceCall?.[1]).toEqual([
      expect.any(String),
      'batch-stale',
      ['acceptance-generated-stale-1', 'acceptance-stale-1'],
      '%[wizard_generation_batch_id:batch-stale]%',
    ])
    expect(deleteTasksCall?.[1]).toEqual([expect.any(String), 'batch-stale', ['task-stale-1']])
    expect(deleteObjectsCall?.[1]).toEqual([expect.any(String), 'batch-stale', ['object-stale-1']])
    expect(resetProjectCall).toBeTruthy()
  })

  it('compensates created tasks and engineering objects when wizard dependency writing fails mid-commit', async () => {
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: { 'phase-1': 'object-1' },
      enrichedScopeTree: [{ id: 'phase-1', type: 'phase', name: '涓€鏈?', objectId: 'object-1', children: [] }],
      materializedObjects: [
        { id: 'object-1' },
        { id: 'object-2' },
      ],
      generationScope: {},
    })
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain
      .mockResolvedValueOnce({ task: { id: 'task-1', title: '涓讳綋缁撴瀯鏂藉伐' } })
      .mockResolvedValueOnce({ task: { id: 'task-2', title: '鎵嬫湳閮ㄦ満鐢甸鐣?' } })
    mocks.replaceWizardGeneratedTaskDependenciesBatch.mockRejectedValueOnce(new Error('dependency write failed'))
    let generationBatchId = ''
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('metadata = CASE WHEN metadata IS NULL THEN $2::jsonb ELSE metadata || $2::jsonb END')) {
        const metadata = JSON.parse(String(params[1] ?? '{}'))
        generationBatchId = String(metadata.wizard_generation_batch_id ?? '')
        return { rowCount: 1, rows: [{ id: 'project-1' }] }
      }
      if (sql.includes('SELECT id, standard_task_metadata')) {
        return { rowCount: 2, rows: [
          { id: 'task-1', standard_task_metadata: { wizardGenerationBatchId: generationBatchId } },
          { id: 'task-2', standard_task_metadata: { wizardGenerationBatchId: generationBatchId } },
        ] }
      }
      if (sql.includes('SELECT id, metadata') && sql.includes('FROM engineering_objects')) {
        return { rowCount: 2, rows: [
          { id: 'object-1', metadata: { wizardGenerationBatchId: generationBatchId } },
          { id: 'object-2', metadata: { wizardGenerationBatchId: generationBatchId } },
        ] }
      }
      if (sql.includes('UPDATE task_conditions')) {
        return { rowCount: 1, rows: [{ id: 'condition-1' }] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })
      .expect(500)

    expect(response.body.error.message).toBe('dependency write failed')

    const deleteDependenciesCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))
    const deleteTasksCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM tasks'))
    const deleteObjectsCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))
    const resetProjectCall = mocks.rawQuery.mock.calls.find(([sql, params]) => (
      String(sql).includes('default_wbs_generated = $5')
      && Array.isArray(params)
      && params.includes('wizard_drafting')
      && String(params[1]).includes('wizard_generation_failed_at')
      && params[4] === false
    ))

    expect(deleteDependenciesCall?.[1]).toEqual(expect.arrayContaining([
      expect.any(String),
      ['task-1', 'task-2'],
    ]))
    expect(deleteTasksCall?.[1]).toEqual(expect.arrayContaining([
      expect.any(String),
      ['task-1', 'task-2'],
    ]))
    expect(deleteObjectsCall?.[1]).toEqual(expect.arrayContaining([
      expect.any(String),
      ['object-1', 'object-2'],
    ]))
    expect(resetProjectCall).toBeTruthy()
  })

  it('allows C-18.L09 diagnostic-only failure injection for disposable wizard drafts and still compensates artifacts', async () => {
    const previousFlag = process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION
    process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION = 'true'
    try {
      mocks.materializeWizardScopeTree.mockResolvedValueOnce({
        objectIdByDraftId: { 'phase-1': 'object-1' },
        enrichedScopeTree: [{ id: 'phase-1', type: 'phase', name: '涓€鏈?', objectId: 'object-1', children: [] }],
        materializedObjects: [{ id: 'object-1' }],
        generationScope: {},
      })
      mocks.createTaskInMainChain.mockReset()
      mocks.generateWbsTemplateRows.mockResolvedValueOnce({
        rows: [{
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '涓讳綋缁撴瀯鏂藉伐',
            status: 'in_progress',
            progress: 50,
            onboarding_stage_classification: 'history',
            is_historical: true,
            start_date: '2026-06-01',
            end_date: '2026-06-10',
          },
        }],
        governanceWarnings: [],
      })
      mocks.createTaskInMainChain.mockResolvedValueOnce({ task: { id: 'task-1', title: '涓讳綋缁撴瀯鏂藉伐' } })
      let generationBatchId = ''
      mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('metadata = CASE WHEN metadata IS NULL THEN $2::jsonb ELSE metadata || $2::jsonb END')) {
          const metadata = JSON.parse(String(params[1] ?? '{}'))
          generationBatchId = String(metadata.wizard_generation_batch_id ?? '')
          return { rowCount: 1, rows: [{ id: 'project-1' }] }
        }
        if (sql.includes('SELECT id, standard_task_metadata')) {
          return { rowCount: 1, rows: [{ id: 'task-1', standard_task_metadata: { wizardGenerationBatchId: generationBatchId } }] }
        }
        if (sql.includes('SELECT id, metadata') && sql.includes('FROM engineering_objects')) {
          return { rowCount: 1, rows: [{ id: 'object-1', metadata: { wizardGenerationBatchId: generationBatchId } }] }
        }
        return { rowCount: 0, rows: [] }
      })

      const response = await request(buildApp())
        .post('/api/projects/wizard')
        .set('x-workbuddy-diagnostic-run-id', 'c18-l09-run-1')
        .set('x-workbuddy-diagnostic-failure-stage', 'after_tasks')
        .send({
          companyId: 'company-1',
          commit: true,
          metadata: {
            createdForDiagnostic: 'C-18.L09',
            diagnosticRunId: 'c18-l09-run-1',
            disposable: true,
          },
          wizardPayload: makeWizardPayload(),
        })
        .expect(500)

      expect(response.body.error.code).toBe('WIZARD_DIAGNOSTIC_FAILURE_INJECTED')
      expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(1)
      expect(mocks.replaceTaskDependencies).not.toHaveBeenCalled()
      expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
      const deleteTasksCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM tasks'))
      const deleteObjectsCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))
      const resetProjectCall = mocks.rawQuery.mock.calls.find(([sql, params]) => (
        String(sql).includes('default_wbs_generated = $5')
        && Array.isArray(params)
        && params.includes('wizard_drafting')
        && String(params[1]).includes('WIZARD_DIAGNOSTIC_FAILURE_INJECTED')
      ))
      expect(deleteTasksCall?.[1]).toEqual(expect.arrayContaining([expect.any(String), ['task-1']]))
      expect(deleteObjectsCall?.[1]).toEqual(expect.arrayContaining([expect.any(String), ['object-1']]))
      expect(resetProjectCall).toBeTruthy()
    } finally {
      if (previousFlag === undefined) {
        delete process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION
      } else {
        process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION = previousFlag
      }
    }
  })

  it('enables WBS stage timing for C-18.L09 disposable wizard diagnostic commits', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        metadata: {
          createdForDiagnostic: 'C-18.L09',
          diagnosticRunId: 'c18-l09-stage-timing',
          disposable: true,
        },
        wizardPayload: makeWizardPayload(),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation).toEqual(expect.objectContaining({
      diagnosticStageTimings: true,
    }))
    expect(generationCall.operation.clientContext).toEqual(expect.objectContaining({
      diagnostic: 'C-18.L09',
      diagnosticRunId: 'c18-l09-stage-timing',
    }))
  })

  it('rejects C-18.L09 diagnostic failure injection before mutation when the server flag is disabled', async () => {
    const previousFlag = process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION
    delete process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION
    try {
      const response = await request(buildApp())
        .post('/api/projects/wizard')
        .set('x-workbuddy-diagnostic-run-id', 'c18-l09-run-1')
        .set('x-workbuddy-diagnostic-failure-stage', 'after_tasks')
        .send({
          companyId: 'company-1',
          commit: true,
          metadata: {
            createdForDiagnostic: 'C-18.L09',
            diagnosticRunId: 'c18-l09-run-1',
            disposable: true,
          },
          wizardPayload: makeWizardPayload(),
        })
        .expect(403)

      expect(response.body.error.code).toBe('WIZARD_DIAGNOSTIC_FAILURE_INJECTION_DISABLED')
      expect(mocks.rawQuery).not.toHaveBeenCalled()
      expect(mocks.materializeWizardScopeTree).not.toHaveBeenCalled()
      expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    } finally {
      if (previousFlag === undefined) {
        delete process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION
      } else {
        process.env.WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION = previousFlag
      }
    }
  })

  it('reads lightweight wizard artifact inventory without using the heavy project export path', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: '杩涜涓?',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_generation_state: 'completed',
              wizard_passed_acceptance_plan_ids: ['acceptance-1'],
            },
          }],
        }
      }
      if (sql.includes('SELECT id,') && sql.includes('FROM tasks') && sql.includes('standard_task_metadata')) {
        return {
          rowCount: 3,
          rows: [
            {
              id: 'task-1',
              title: '涓讳綋缁撴瀯鏂藉伐',
              building_object_id: 'building-1',
              basement_object_id: null,
              floor_object_id: 'floor-1',
              physical_zone_object_id: null,
              functional_area_object_id: null,
              standard_task_metadata: {
                wizardGenerationBatchId: 'batch-1',
                standardWorkCode: 'STD-001',
                scopePath: '涓€鏈?1鍙锋ゼ/1灞?',
                wizardScopeNodeId: 'node-1',
              },
            },
            {
              id: 'task-2',
              title: '涓讳綋缁撴瀯鏂藉伐',
              building_object_id: 'building-1',
              basement_object_id: null,
              floor_object_id: 'floor-1',
              physical_zone_object_id: null,
              functional_area_object_id: null,
              standard_task_metadata: {
                wizardGenerationBatchId: 'batch-1',
                standardWorkCode: 'STD-001',
                scopePath: '涓€鏈?1鍙锋ゼ/1灞?',
                wizardScopeNodeId: 'node-1',
              },
            },
            {
              id: 'task-3',
              title: '鏈虹數瀹夎',
              building_object_id: 'building-1',
              basement_object_id: null,
              floor_object_id: 'floor-1',
              physical_zone_object_id: null,
              functional_area_object_id: null,
              standard_task_metadata: {
                wizardGenerationBatchId: 'batch-1',
                standardWorkCode: 'STD-002',
                scopePath: '涓€鏈?1鍙锋ゼ/1灞?',
                wizardScopeNodeId: 'node-2',
              },
            },
          ],
        }
      }
      if (sql.includes('FROM task_dependencies td')) {
        return { rowCount: 1, rows: [{ count: 2 }] }
      }
      if (sql.includes('FROM acceptance_plans')) {
        return { rowCount: 1, rows: [{ count: 1 }] }
      }
      if (sql.includes('FROM engineering_objects')) {
        return { rowCount: 1, rows: [{ count: 4 }] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/artifact-inventory')
    expect(response.status).toBe(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: 'project-1',
      projectStatus: '杩涜涓?',
      wizardGenerationBatchId: 'batch-1',
      wizardGenerationState: 'completed',
      generatedTaskCount: 3,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 1,
      candidateBaselinesRemaining: 0,
      dependenciesRemaining: 2,
      acceptancePlansRemaining: 1,
      engineeringObjectsRemaining: 4,
    }))
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('/export'))).toBe(false)
  })

  it('reads wizard artifact inventory by metadata task ids instead of scanning task JSON batch fields', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT id, status, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: '杩涜涓?',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_generation_state: 'completed',
              wizard_generated_baseline_ids: ['44444444-4444-4444-8444-444444444444'],
              wizard_created_task_ids: ['task-1', 'task-2'],
              wizard_materialized_object_ids: ['object-1', 'object-2'],
              wizard_generated_acceptance_plan_ids: ['acceptance-generated-1'],
              wizard_passed_acceptance_plan_ids: ['acceptance-1'],
            },
          }],
        }
      }
      if (sql.includes('SELECT COUNT(*)::int AS count') && sql.includes('FROM tasks')) {
        expect(sql).toContain('id = ANY($2::uuid[])')
        expect(sql).not.toContain('WITH generated_tasks AS')
        expect(sql).not.toContain('id::text = ANY($2::text[])')
        expect(sql).toContain('standard_task_metadata')
        expect(sql).toContain('rowProjectionMode')
        expect(sql).toContain('scheduleParticipation')
        expect(sql).not.toContain('wizardGenerationBatchId')
        expect(params).toEqual(['project-1', ['task-1', 'task-2']])
        return {
          rowCount: 1,
          rows: [{
            count: 2,
            primary_schedule_count: 2,
            primary_schedule_executable_count: 1,
            primary_schedule_record_only_count: 1,
          }],
        }
      }
      if (sql.includes('SELECT COUNT(*)::int AS count') && sql.includes('FROM task_baselines')) {
        expect(sql).toContain('id = ANY($2::uuid[])')
        expect(params).toEqual(['project-1', ['44444444-4444-4444-8444-444444444444']])
        return {
          rowCount: 1,
          rows: [{
            count: 1,
            draft_count: 1,
            baseline_ids: ['44444444-4444-4444-8444-444444444444'],
            statuses: ['draft'],
          }],
        }
      }
      if (sql.includes('FROM task_baseline_items')) {
        expect(sql).toContain('baseline_version_id = ANY($2::uuid[])')
        expect(params).toEqual(['project-1', ['44444444-4444-4444-8444-444444444444']])
        return {
          rowCount: 1,
          rows: [{ item_count: 2, mapped_item_count: 2 }],
        }
      }
      if (sql.includes('FROM task_dependencies td')) {
        expect(sql).toContain('SELECT td.id::text AS id')
        expect(sql).toContain('td.task_id = ANY($2::uuid[])')
        expect(sql).toContain('td.dependency_task_id = ANY($2::uuid[])')
        expect(sql).not.toContain('td.task_id::text = ANY($2::text[])')
        expect(sql).not.toContain('td.dependency_task_id::text = ANY($2::text[])')
        expect(sql).not.toContain('EXISTS (')
        expect(params).toEqual(['project-1', ['task-1', 'task-2']])
        return { rowCount: 2, rows: [{ id: 'dependency-1' }, { id: 'dependency-2' }] }
      }
      if (sql.includes('FROM acceptance_plans')) {
        expect(params).toEqual(['project-1', ['acceptance-generated-1', 'acceptance-1']])
        return { rowCount: 1, rows: [{ count: 1 }] }
      }
      if (sql.includes('FROM engineering_objects')) {
        expect(sql).toContain('id = ANY($2::uuid[])')
        expect(sql).not.toContain('id::text = ANY($2::text[])')
        expect(sql).not.toContain("metadata, '{}'::jsonb)->>'wizardGenerationBatchId'")
        expect(sql).not.toContain("metadata, '{}'::jsonb)->>'wizard_generation_batch_id'")
        expect(params).toEqual(['project-1', ['object-1', 'object-2']])
        return { rowCount: 1, rows: [{ count: 2 }] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/artifact-inventory')
    expect(response.status).toBe(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      generatedTaskCount: 2,
      generatedPrimaryScheduleTaskCount: 2,
      generatedPrimaryScheduleExecutableTaskCount: 1,
      generatedPrimaryScheduleRecordOnlyTaskCount: 1,
      generatedNonPrimaryTaskCount: 0,
      generationBatchIds: ['batch-1'],
      candidateBaselinesRemaining: 1,
      candidateBaselineDraftCount: 1,
      candidateBaselineIds: ['44444444-4444-4444-8444-444444444444'],
      candidateBaselineStatuses: ['draft'],
      candidateBaselineItemCount: 2,
      candidateBaselineMappedItemCount: 2,
      candidateBaselineUnmappedItemCount: 0,
      dependenciesRemaining: 2,
      acceptancePlansRemaining: 1,
      engineeringObjectsRemaining: 2,
    }))
  })

  it('deduplicates wizard dependency inventory rows that span task id chunks', async () => {
    const taskIds = Array.from({ length: 51 }, (_, index) => `task-${index + 1}`)
    let dependencyChunkQueryCount = 0
    mocks.rawQuery.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('SELECT id, status, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'in_progress',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_generation_state: 'completed',
              wizard_created_task_ids: taskIds,
            },
          }],
        }
      }
      if (sql.includes('SELECT COUNT(*)::int AS count') && sql.includes('FROM tasks')) {
        const chunk = params[1] as string[]
        return {
          rowCount: 1,
          rows: [{
            count: chunk.length,
            primary_schedule_count: chunk.length,
            primary_schedule_executable_count: chunk.length,
            primary_schedule_record_only_count: 0,
          }],
        }
      }
      if (sql.includes('FROM task_dependencies td')) {
        dependencyChunkQueryCount += 1
        return dependencyChunkQueryCount === 1
          ? { rowCount: 2, rows: [{ id: 'dependency-cross-chunk' }, { id: 'dependency-first-chunk' }] }
          : { rowCount: 2, rows: [{ id: 'dependency-cross-chunk' }, { id: 'dependency-second-chunk' }] }
      }
      if (sql.includes('FROM acceptance_plans') || sql.includes('FROM engineering_objects')) {
        return { rowCount: 1, rows: [{ count: 0 }] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/artifact-inventory')
      .expect(200)

    expect(dependencyChunkQueryCount).toBe(2)
    expect(response.body.data).toEqual(expect.objectContaining({
      generatedTaskCount: 51,
      dependenciesRemaining: 3,
    }))
  })

  it('does not classify distinct WBS lineage rows as duplicated wizard tasks', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'in_progress',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_generation_state: 'completed',
            },
          }],
        }
      }
      if (sql.includes('SELECT id,') && sql.includes('FROM tasks') && sql.includes('standard_task_metadata')) {
        expect(sql).toContain('template_node_id')
        expect(sql).toContain('standard_work_code')
        expect(sql).toContain('standard_work_name')
        expect(sql).toContain('wbs_path')
        expect(sql).toContain('wbs_code')
        return {
          rowCount: 2,
          rows: [
            {
              id: 'task-1',
              template_node_id: 'template-node-1',
              standard_work_code: 'STD-001',
              standard_work_name: 'Concrete pour',
              wbs_path: 'Structure/Foundation',
              wbs_code: '1.1',
              title: 'Concrete pour',
              building_object_id: 'building-1',
              basement_object_id: null,
              floor_object_id: 'floor-1',
              physical_zone_object_id: null,
              functional_area_object_id: null,
              standard_task_metadata: {
                wizardGenerationBatchId: 'batch-1',
                standardWorkCode: 'STD-001',
                scopePath: 'Building 1/Floor 1',
                wizardScopeNodeId: 'node-1',
              },
            },
            {
              id: 'task-2',
              template_node_id: 'template-node-2',
              standard_work_code: 'STD-001',
              standard_work_name: 'Concrete pour',
              wbs_path: 'Structure/Podium',
              wbs_code: '1.2',
              title: 'Concrete pour',
              building_object_id: 'building-1',
              basement_object_id: null,
              floor_object_id: 'floor-1',
              physical_zone_object_id: null,
              functional_area_object_id: null,
              standard_task_metadata: {
                wizardGenerationBatchId: 'batch-1',
                standardWorkCode: 'STD-001',
                scopePath: 'Building 1/Floor 1',
                wizardScopeNodeId: 'node-1',
              },
            },
          ],
        }
      }
      if (sql.includes('FROM task_dependencies td')) {
        return { rowCount: 1, rows: [{ count: 0 }] }
      }
      if (sql.includes('FROM acceptance_plans')) {
        return { rowCount: 1, rows: [{ count: 0 }] }
      }
      if (sql.includes('FROM engineering_objects')) {
        return { rowCount: 1, rows: [{ count: 0 }] }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/artifact-inventory')
    expect(response.status).toBe(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      generatedTaskCount: 2,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
    }))
  })

  it('returns metadata-only wizard artifact inventory while generation is running without artifact ids', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'wizard_drafting',
            metadata: {
              wizard_generation_batch_id: 'batch-running',
              wizard_generation_state: 'running',
            },
          }],
        }
      }
      throw new Error(`unexpected heavy inventory query: ${sql}`)
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/artifact-inventory')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: 'project-1',
      projectStatus: 'wizard_drafting',
      wizardGenerationBatchId: 'batch-running',
      wizardGenerationState: 'running',
      generatedTaskCount: 0,
      generationBatchIds: ['batch-running'],
      duplicateGeneratedTaskSignatureCount: 0,
      dependenciesRemaining: 0,
      acceptancePlansRemaining: 0,
      engineeringObjectsRemaining: 0,
    }))
    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
  })

  it('returns metadata-only failed wizard artifact inventory without artifact ids after compensation', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, status, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'wizard_drafting',
            metadata: {
              wizard_generation_last_failed_batch_id: 'batch-failed',
              wizard_generation_state: 'failed',
              wizard_generation_last_error: 'Injected after dependencies',
              wizard_generation_last_error_code: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
            },
          }],
        }
      }
      throw new Error(`unexpected heavy inventory query: ${sql}`)
    })

    const response = await request(buildApp())
      .get('/api/projects/project-1/wizard/artifact-inventory')
      .expect(200)

    expect(response.body.data).toEqual(expect.objectContaining({
      projectId: 'project-1',
      wizardGenerationBatchId: 'batch-failed',
      wizardGenerationState: 'failed',
      wizardGenerationLastError: 'Injected after dependencies',
      wizardGenerationLastErrorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
      generatedTaskCount: 0,
      generationBatchIds: ['batch-failed'],
      duplicateGeneratedTaskSignatureCount: 0,
      dependenciesRemaining: 0,
      acceptancePlansRemaining: 0,
      engineeringObjectsRemaining: 0,
    }))
    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
  })

  it('physically deletes wizard-generated artifacts during rollback using batch-scoped SQL without preloading artifact rows', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_generated_baseline_ids: ['44444444-4444-4444-8444-444444444444'],
              wizard_generation_candidate_baseline: {
                baselineId: '44444444-4444-4444-8444-444444444444',
              },
              wizard_created_task_ids: ['task-1', 'task-2'],
              wizard_materialized_object_ids: ['object-1'],
              wizard_generated_acceptance_plan_ids: ['acceptance-generated-1'],
              wizard_passed_acceptance_plan_ids: ['acceptance-1'],
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    await request(buildApp())
      .post('/api/projects/project-1/wizard/rollback')
      .expect(200)

    const deleteBaselineCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM task_baselines'))
    const deleteAcceptanceSourceLinksCall = mocks.rawQuery.mock.calls.find(([sql]) => (
      String(sql).includes('DELETE FROM project_entity_links')
      && String(sql).includes('source_entity_id = ANY')
    ))
    const deleteAcceptanceTargetLinksCall = mocks.rawQuery.mock.calls.find(([sql]) => (
      String(sql).includes('DELETE FROM project_entity_links')
      && String(sql).includes('target_entity_id = ANY')
    ))
    const deleteAcceptanceCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM acceptance_plans'))
    const deleteDependenciesCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))
    const deleteTasksCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM tasks'))
    const deleteObjectsCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))
    const projectRollbackCall = mocks.rawQuery.mock.calls.find(([sql, params]) => (
      String(sql).includes('default_wbs_generated = $5')
      && Array.isArray(params)
      && params.includes('wizard_drafting')
      && params[4] === false
    ))

    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('SELECT id, standard_task_metadata'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('SELECT id, metadata') && String(sql).includes('FROM engineering_objects'))).toBe(false)
    const dependencyDeleteCalls = mocks.rawQuery.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))
    expect(dependencyDeleteCalls).toHaveLength(2)
    expect(deleteBaselineCall?.[0]).toContain("status = 'draft'")
    expect(deleteBaselineCall?.[1]).toEqual(['project-1', ['44444444-4444-4444-8444-444444444444']])
    expect(deleteAcceptanceSourceLinksCall?.[1]).toEqual(['project-1', ['acceptance-generated-1', 'acceptance-1']])
    expect(deleteAcceptanceTargetLinksCall?.[1]).toEqual(['project-1', ['task-1', 'task-2']])
    expect(mocks.rawQuery.mock.calls.indexOf(deleteAcceptanceSourceLinksCall!))
      .toBeLessThan(mocks.rawQuery.mock.calls.indexOf(deleteAcceptanceCall!))
    expect(mocks.rawQuery.mock.calls.indexOf(deleteAcceptanceTargetLinksCall!))
      .toBeLessThan(mocks.rawQuery.mock.calls.indexOf(deleteTasksCall!))
    expect(deleteAcceptanceCall?.[0]).toContain('id = ANY($2::uuid[])')
    expect(deleteAcceptanceCall?.[0]).not.toContain('notes LIKE')
    expect(deleteAcceptanceCall?.[1]).toEqual(['project-1', ['acceptance-generated-1', 'acceptance-1']])
    expect(deleteDependenciesCall?.[1]).toEqual(['project-1', ['task-1', 'task-2']])
    expect(deleteDependenciesCall?.[0]).toContain('task_id = ANY($2::uuid[])')
    expect(deleteDependenciesCall?.[0]).not.toContain('task_id::text = ANY($2::text[])')
    expect(deleteTasksCall?.[0]).toContain('id = ANY($2::uuid[])')
    expect(deleteTasksCall?.[0]).not.toContain('standard_task_metadata')
    expect(deleteTasksCall?.[1]).toEqual(['project-1', ['task-1', 'task-2']])
    expect(deleteObjectsCall?.[0]).toContain('id = ANY($2::uuid[])')
    expect(deleteObjectsCall?.[0]).not.toContain("metadata, '{}'::jsonb")
    expect(deleteObjectsCall?.[1]).toEqual(['project-1', ['object-1']])
    expect(projectRollbackCall).toBeTruthy()
    expect(String(projectRollbackCall?.[1]?.[1])).not.toContain('wizard_generated_baseline_ids')
    expect(String(projectRollbackCall?.[1]?.[1])).not.toContain('wizard_generation_candidate_baseline')
  })

  it('chunks precise wizard rollback artifact ids to keep cleanup SQL bounded', async () => {
    const makeUuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    const taskIds = Array.from({ length: 125 }, (_, index) => makeUuid(index + 1))
    const objectIds = Array.from({ length: 75 }, (_, index) => makeUuid(index + 1001))
    const acceptancePlanIds = Array.from({ length: 55 }, (_, index) => makeUuid(index + 2001))
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_created_task_ids: taskIds,
              wizard_materialized_object_ids: objectIds,
              wizard_passed_acceptance_plan_ids: acceptancePlanIds,
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    await request(buildApp())
      .post('/api/projects/project-1/wizard/rollback')
      .expect(200)

    const deleteAcceptanceCalls = mocks.rawQuery.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM acceptance_plans'))
    const deleteEntityLinkCalls = mocks.rawQuery.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM project_entity_links'))
    const deleteDependencyCalls = mocks.rawQuery.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))
    const deleteTaskCalls = mocks.rawQuery.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM tasks'))
    const deleteObjectCalls = mocks.rawQuery.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))

    expect(deleteAcceptanceCalls).toHaveLength(2)
    expect(deleteEntityLinkCalls).toHaveLength(5)
    expect(deleteDependencyCalls).toHaveLength(6)
    expect(deleteTaskCalls).toHaveLength(3)
    expect(deleteObjectCalls).toHaveLength(2)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('SET LOCAL statement_timeout'))).toBe(true)
    for (const [sql, params] of [
      ...deleteAcceptanceCalls,
      ...deleteEntityLinkCalls,
      ...deleteDependencyCalls,
      ...deleteTaskCalls,
      ...deleteObjectCalls,
    ]) {
      expect(String(sql)).not.toContain('standard_task_metadata')
      expect(String(sql)).not.toContain("metadata, '{}'::jsonb")
      expect(String(sql)).not.toContain('notes LIKE')
      expect(Array.isArray(params?.[1]) ? params[1].length : 0).toBeLessThanOrEqual(50)
    }
  })

  it('rejects wizard rollback after its generated candidate baseline has been adopted', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, metadata FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            metadata: {
              wizard_generation_batch_id: 'batch-1',
              wizard_generated_baseline_ids: ['44444444-4444-4444-8444-444444444444'],
              wizard_created_task_ids: ['task-1'],
            },
          }],
        }
      }
      if (sql.includes('SELECT id, status') && sql.includes('FROM task_baselines')) {
        return {
          rowCount: 1,
          rows: [{ id: '44444444-4444-4444-8444-444444444444', status: 'confirmed' }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .post('/api/projects/project-1/wizard/rollback')
      .expect(409)

    expect(response.body.error.code).toBe('WIZARD_BASELINE_ALREADY_ADOPTED')
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM task_baselines'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM tasks'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('default_wbs_generated = $5'))).toBe(false)
  })

  it('rejects rollback while wizard generation is running before deleting generated artifacts', async () => {
    mocks.rawQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM projects WHERE id = $1')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'project-1',
            status: 'wizard_drafting',
            metadata: {
              wizard_generation_state: 'running',
              wizard_generation_batch_id: 'batch-1',
              wizard_generation_started_at: new Date().toISOString(),
              wizard_created_task_ids: ['task-1'],
              wizard_materialized_object_ids: ['object-1'],
              wizard_passed_acceptance_plan_ids: ['acceptance-1'],
            },
          }],
        }
      }
      return { rowCount: 0, rows: [] }
    })

    const response = await request(buildApp())
      .post('/api/projects/project-1/wizard/rollback')
      .expect(409)

    expect(response.body.error.code).toBe('WIZARD_GENERATION_IN_PROGRESS')
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM acceptance_plans'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM tasks'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))).toBe(false)
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('default_wbs_generated = $5'))).toBe(false)
  })

  it('materializes wizard scope tree before generation and passes real engineering object scope arrays', async () => {
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: {
        node_phase_1: 'phase-real-1',
        node_section_1: 'section-real-1',
        node_building_1: 'building-real-1',
        node_building_2: 'building-real-2',
        node_basement_1: 'basement-real-1',
      },
      enrichedScopeTree: [
        {
          id: 'node_phase_1',
          objectId: 'phase-real-1',
          type: 'phase',
          name: 'Phase 1',
          children: [],
        },
      ],
      materializedObjects: [],
      generationScope: {
        phase_object_id: 'phase-real-1',
        section_object_id: 'section-real-1',
        building_object_id: 'building-real-1',
        basement_object_id: 'basement-real-1',
        phases: ['phase-real-1'],
        sections: ['section-real-1'],
        buildings: ['building-real-1', 'building-real-2'],
        basements: ['basement-real-1'],
        scope_objects: [
          {
            id: 'building-real-1',
            type: 'building',
            name: '1# Building',
            metadata: { wizardScopeNodeId: 'node_building_1', functionalUsage: 'residential_tower' },
          },
          {
            id: 'building-real-2',
            type: 'building',
            name: '2# Building',
            metadata: { wizardScopeNodeId: 'node_building_2', functionalUsage: 'residential_tower' },
          },
          {
            id: 'basement-real-1',
            type: 'basement',
            name: 'Basement 1',
            metadata: {
              wizardScopeNodeId: 'node_basement_1',
              basementLevelCount: 3,
              serviceTargetObjectIds: ['building-real-1', 'building-real-2'],
            },
          },
        ],
      },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          scopeTree: [
            {
              id: 'node_phase_1',
              type: 'phase',
              name: 'Phase 1',
              children: [
                {
                  id: 'node_section_1',
                  type: 'section',
                  name: 'Section 1',
                  children: [
                    {
                      id: 'node_building_1',
                      type: 'building',
                      name: '1# Building',
                      metadata: { functionalUsage: 'residential_tower', childrenComplete: true, decompositionMode: 'by_floor' },
                      children: [{ id: 'node_building_1_floor_1', type: 'floor', name: 'L1', metadata: { floorOrder: 1, floorUsage: 'standard' }, children: [] }],
                    },
                    {
                      id: 'node_building_2',
                      type: 'building',
                      name: '2# Building',
                      metadata: { functionalUsage: 'residential_tower', childrenComplete: true, decompositionMode: 'by_floor' },
                      children: [{ id: 'node_building_2_floor_1', type: 'floor', name: 'L1', metadata: { floorOrder: 1, floorUsage: 'standard' }, children: [] }],
                    },
                  ],
                },
              ],
            },
            {
              id: 'node_basement_1',
              type: 'basement',
              name: 'Basement 1',
              metadata: { basementLevelCount: 3, serviceTargetObjectIds: ['node_building_1', 'node_building_2'] },
              children: [],
            },
          ],
        }),
      })
      .expect(201)

    expect(mocks.materializeWizardScopeTree).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user-1',
      scopeTree: expect.any(Array),
    }))
    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.scope).toEqual(expect.objectContaining({
      phase_object_id: 'phase-real-1',
      section_object_id: 'section-real-1',
      building_object_id: 'building-real-1',
      basement_object_id: 'basement-real-1',
      buildings: ['building-real-1', 'building-real-2'],
      basements: ['basement-real-1'],
      scope_objects: expect.arrayContaining([
        expect.objectContaining({ id: 'building-real-1', type: 'building' }),
        expect.objectContaining({
          id: 'basement-real-1',
          type: 'basement',
          metadata: expect.objectContaining({
            serviceTargetObjectIds: ['building-real-1', 'building-real-2'],
          }),
        }),
      ]),
    }))
    expect(JSON.stringify(generationCall.operation.scope)).not.toContain('node_building_1')
    expect(JSON.stringify(generationCall.operation.scope)).not.toContain('node_basement_1')
  })

  it('passes scope-tree building-pattern facts into template generation', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['precast_concrete'],
          totalAreaM2: 139300,
          scopeTree: Array.from({ length: 24 }, (_, index) => ({
            id: `building-${index + 1}`,
            type: 'building',
            name: `${index + 1}#building`,
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: index % 2 === 0 ? 13 : 10,
              childrenComplete: true,
              decompositionMode: 'by_floor',
              methodVariantCodes: ['precast_concrete'],
            },
            children: Array.from({ length: index % 2 === 0 ? 13 : 10 }, (_, floorIndex) => ({
              id: `building-${index + 1}-floor-${floorIndex + 1}`,
              type: 'floor',
              name: `L${floorIndex + 1}`,
              metadata: {
                floorOrder: floorIndex + 1,
                floorUsage: 'standard',
              },
              children: [],
            })),
          })),
          projectFeatures: {
            prefabRate: 0.5,
          },
        }),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation).toEqual(expect.objectContaining({
      projectFacts: expect.objectContaining({
        totalAreaM2: 139300,
        buildingCount: 24,
        standardFloorCount: expect.any(Number),
        highestBuildingFloorCount: 13,
        basementLevelCount: null,
        foundationDepthM: null,
        prefabRate: 0.5,
        buildingPatternCodes: expect.arrayContaining([
          'multi_building_parallel_flow',
          'prefabricated_concrete_floor_cycle',
        ]),
        functionalUsageCodes: expect.arrayContaining(['浣忓畢妤?']),
      }),
      scope: expect.objectContaining({
        buildingPatternCodes: expect.arrayContaining(['multi_building_parallel_flow']),
        buildingCount: 24,
        highestBuildingFloorCount: 13,
      }),
    }))
  })

  it('normalizes functional areas and physical zones into canonical projectFacts only', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'hospital',
          projectFeatures: {
            hasCivilDefense: true,
          },
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '鍖绘妧妤?',
              metadata: {
                functionalUsage: '鍖绘妧妤?',
                standardFloorCount: 5,
                totalHeightM: 24,
                specialRoomType: 'MRI',
              },
              children: [
                {
                  id: 'floor-1',
                  type: 'floor',
                  name: 'L2',
                  metadata: { floorOrder: 2 },
                  children: [
                    {
                      id: 'area-1',
                      type: 'functional_area',
                      name: '鎵嬫湳涓績',
                      metadata: { functionalCategory: 'clean_zone', specialRoomType: 'operating_room' },
                      children: [],
                    },
                  ],
                },
              ],
            },
            {
              id: 'basement-1',
              type: 'basement',
              name: '鍦颁笅瀹?',
              metadata: {
                basementLevelCount: 2,
                foundationDepthM: 9,
                hasCivilDefense: true,
              },
              children: [
                {
                  id: 'zone-1',
                  type: 'physical_zone',
                  name: '浜洪槻鍖?',
                  metadata: { physicalCategory: '浜洪槻鍖?', areaM2: 8000 },
                  children: [],
                },
              ],
            },
          ],
        }),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.projectFacts).toEqual(expect.objectContaining({
      buildingCount: 1,
      standardFloorCount: 5,
      basementLevelCount: 2,
      foundationDepthM: 9,
      hasCivilDefense: true,
      functionalUsageCodes: ['鍖绘妧妤?'],
      functionalCategoryCodes: ['clean_zone'],
      specialRoomTypeCodes: ['operating_room'],
      physicalZoneTypeCodes: ['浜洪槻鍖?'],
    }))
    expect(generationCall.operation.projectFacts.projectFeatures).toEqual(expect.objectContaining({
      hasCivilDefense: true,
    }))
    expect(generationCall.operation.scope).not.toHaveProperty('zone_object_id')
  })

  it('normalizes special floor usage into canonical project facts and template generation scope', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_complex',
          methodVariantCodes: ['cast_in_situ'],
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: 'mixed-use tower',
              metadata: {
                functionalUsage: 'mixed_use',
                standardFloorCount: 26,
              },
              children: [
                {
                  id: 'tower-zone-1',
                  type: 'physical_zone',
                  name: 'tower zone',
                  metadata: {
                    structuralRole: 'tower',
                    childrenComplete: true,
                  },
                  children: [
                    {
                      id: 'floor-transfer',
                      type: 'floor',
                      name: 'L4 transfer floor',
                      metadata: { floorOrder: 4, floorUsage: 'transfer' },
                      children: [],
                    },
                    {
                      id: 'floor-refuge',
                      type: 'floor',
                      name: 'L13 refuge floor',
                      metadata: { floorOrder: 13, floorUsage: 'refuge' },
                      children: [],
                    },
                    {
                      id: 'floor-roof',
                      type: 'floor',
                      name: 'roof floor',
                      metadata: { floorOrder: 27, floorUsage: 'roof' },
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      })
      .expect(201)

    const facts = mocks.buildTemplateRecommendation.mock.calls.at(-1)?.[0] as any
    expect(facts.floorUsageCodes).toEqual(['transfer', 'refuge', 'roof'])
    expect(facts.projectFeatures).toEqual(expect.objectContaining({
      floorUsageCodes: ['transfer', 'refuge', 'roof'],
    }))

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.projectFacts).toEqual(expect.objectContaining({
      floorUsageCodes: ['transfer', 'refuge', 'roof'],
      highestBuildingFloorCount: 26,
    }))
    expect(generationCall.operation.scope).toEqual(expect.objectContaining({
      floorUsageCodes: ['transfer', 'refuge', 'roof'],
    }))
  })

  it('uses project-level feature facts for danger dimensions and basement-owned facts for basement scale', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['cast_in_situ'],
          totalAreaM2: 30000,
          projectFeatures: {
            deep_pit: 11,
            large_span: 36,
            supportHeightM: 8,
          },
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '1#妤?',
              metadata: {
                functionalUsage: '浣忓畢妤?',
                standardFloorCount: 22,
                standardFloorAreaM2: 1000,
                maxSpanM: 12,
                supportHeightM: 6,
                towerCraneCount: 2,
                constructionHoistCount: 3,
              },
              children: [
                { id: 'building-1-l1', type: 'floor', name: 'L1', metadata: { floorOrder: 1 }, children: [] },
                { id: 'building-1-l2', type: 'floor', name: 'L2', metadata: { floorOrder: 2 }, children: [] },
              ],
            },
            {
              id: 'basement-1',
              type: 'basement',
              name: '鍦颁笅瀹?',
              metadata: {
                basementLevelCount: 2,
                basementAreaM2: 8000,
                foundationDepthM: 9,
                hasCivilDefense: true,
              },
            },
            {
              id: 'outdoor-1',
              type: 'physical_zone',
              name: '瀹ゅ鎬诲钩涓€鍖?',
              metadata: {
                physicalCategory: '瀹ゅ閬撹矾',
                areaM2: 3000,
              },
            },
          ],
        }),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation).toEqual(expect.objectContaining({
      projectFacts: expect.objectContaining({
        totalAreaM2: 30000,
        aboveGroundAreaM2: 22000,
        buildingCount: 1,
        standardFloorCount: 22,
        highestBuildingFloorCount: 22,
        basementLevelCount: 2,
        basementAreaM2: 8000,
        foundationDepthM: 11,
        siteAreaM2: 3000,
        maxSpanM: 36,
        supportHeightM: 8,
        hasCivilDefense: true,
        towerCraneCount: 2,
        constructionHoistCount: 3,
      }),
      scope: expect.objectContaining({
        basement_object_id: 'basement-1',
        physical_zone_object_id: 'outdoor-1',
        basementAreaM2: 8000,
        foundationDepthM: 11,
        siteAreaM2: 3000,
        maxSpanM: 36,
        supportHeightM: 8,
        hasCivilDefense: true,
      }),
    }))
    expect(generationCall.operation.scope).not.toHaveProperty('zone_object_id')
  })

  it('promotes foundation scale selected in project features into canonical project facts', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          totalAreaM2: 30000,
          projectFeatures: {
            deep_pit: 12,
            basementLevelCount: 3,
            basementAreaM2: 9000,
            pile_foundation: true,
            foundation_dewatering: true,
            foundation_monitoring: true,
          },
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '1# building',
              metadata: {
                functionalUsage: 'residential',
                standardFloorCount: 18,
              },
              children: [],
            },
          ],
        }),
      })
      .expect(201)

    expect(mocks.buildTemplateRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      basementLevelCount: 3,
      basementAreaM2: 9000,
      foundationDepthM: 12,
      projectFeatures: expect.objectContaining({
        basementLevelCount: 3,
        basementAreaM2: 9000,
        foundationDepthM: 12,
        pile_foundation: true,
        foundation_dewatering: true,
        foundation_monitoring: true,
      }),
    }))

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation).toEqual(expect.objectContaining({
      projectFacts: expect.objectContaining({
        totalAreaM2: 30000,
        aboveGroundAreaM2: 21000,
        basementLevelCount: 3,
        basementAreaM2: 9000,
        foundationDepthM: 12,
      }),
      scope: expect.objectContaining({
        basementLevelCount: 3,
        basementAreaM2: 9000,
        foundationDepthM: 12,
      }),
    }))
  })

  it('uses canonical wizard feature facts', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['cast_in_situ'],
          projectFeatures: {
            prefabRate: 45,
            hasCivilDefense: true,
          },
        }),
      })
      .expect(201)

    expect(mocks.buildTemplateRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      prefabRate: 0.45,
      projectFeatures: expect.objectContaining({
        prefabRate: 0.45,
        hasCivilDefense: true,
      }),
    }))
    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation).toEqual(expect.objectContaining({
      projectFacts: expect.objectContaining({
        prefabRate: 0.45,
        projectFeatures: expect.objectContaining({
          prefabRate: 0.45,
          hasCivilDefense: true,
        }),
      }),
      scope: expect.objectContaining({
        prefabRate: 0.45,
      }),
    }))
  })

  it('passes delivery caliber, prefab system and external constraints as canonical project facts', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['precast_concrete'],
          prefabSystemCodes: ['pcf_facade_panel', 'integrated_bathroom'],
          planScopeCaliber: 'general_contract',
          deliveryStandard: 'mep_ready',
          terminalEvent: 'owner_handover',
          projectFeatures: {
            near_metro: 12,
            non_stop_operation: true,
          },
        }),
      })
      .expect(201)

    expect(mocks.buildTemplateRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      planScopeCaliber: 'general_contract',
      deliveryStandard: 'mep_ready',
      terminalEvent: 'owner_handover',
      prefabSystemCodes: ['pcf_facade_panel', 'integrated_bathroom'],
      externalInterfaceCodes: expect.arrayContaining(['metro_operation_interface']),
      hardConstraintCodes: expect.arrayContaining(['non_stop_operation']),
      elementVariantCodes: expect.arrayContaining(['pcf_facade_panel', 'integrated_bathroom']),
      projectFeatures: expect.objectContaining({
        near_metro: 12,
        non_stop_operation: true,
      }),
    }))

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.projectFacts).toEqual(expect.objectContaining({
      planScopeCaliber: 'general_contract',
      deliveryStandard: 'mep_ready',
      terminalEvent: 'owner_handover',
      prefabSystemCodes: ['pcf_facade_panel', 'integrated_bathroom'],
      externalInterfaceCodes: expect.arrayContaining(['metro_operation_interface']),
      hardConstraintCodes: expect.arrayContaining(['non_stop_operation']),
      elementVariantCodes: expect.arrayContaining(['pcf_facade_panel', 'integrated_bathroom']),
    }))
    expect(generationCall.operation.scope).toEqual(expect.objectContaining({
      planScopeCaliber: 'general_contract',
      deliveryStandard: 'mep_ready',
      terminalEvent: 'owner_handover',
      elementVariantCodes: expect.arrayContaining(['pcf_facade_panel', 'integrated_bathroom']),
    }))
  })

  it('splits recommended catalog ids from stable node codes before calling template generation', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: [
        'china-prefabricated-assembly',
        'PFB-01-01-09',
        'FND-06-01-02',
        'china-prefab-bathroom-specialty',
      ],
      triggeredItemPacks: [
        'china-prefabricated-assembly',
        'PFB-01-01-09',
        'FND-06-01-02',
        'china-prefab-bathroom-specialty',
      ],
      triggeredDangerItems: ['DANGER-01-01-42'],
      triggeredMilestones: [],
      scopeAssignmentRules: [],
      expectedRowCount: { overview: 120, standard: 420, detailed: 1500 },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['precast_concrete'],
          prefabSystemCodes: ['pcf_facade_panel'],
        }),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.templateIds).toEqual(expect.arrayContaining([
      'china-gb55032-template',
      'china-prefabricated-assembly',
      'china-foundation-pit-pile',
      'china-prefab-bathroom-specialty',
      'china-dangerous-subproject-control',
    ]))
    expect(generationCall.operation.templateIds).not.toEqual(expect.arrayContaining([
      'PFB-01-01-09',
      'FND-06-01-02',
      'DANGER-01-01-42',
    ]))
    expect(generationCall.operation.selectedNodesByTemplate).toEqual(expect.objectContaining({
      'china-prefabricated-assembly': ['PFB-01-01-09'],
      'china-foundation-pit-pile': ['FND-06-01-02'],
    }))
    expect(generationCall.operation.selectedNodesByTemplate).not.toHaveProperty('china-dangerous-subproject-control')
  })

  it('uses prefab system selections without feature-alias translation', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['precast_concrete'],
          prefabSystemCodes: ['pcf_facade_panel', 'alc_partition_panel', 'integrated_bathroom', 'integrated_kitchen'],
        }),
      })
      .expect(201)

    const facts = mocks.buildTemplateRecommendation.mock.calls.at(-1)?.[0] as any
    expect(facts.prefabSystemCodes).toEqual(['pcf_facade_panel', 'alc_partition_panel', 'integrated_bathroom', 'integrated_kitchen'])
    expect(facts.elementVariantCodes).toEqual(expect.arrayContaining([
      'pcf_facade_panel',
      'alc_partition_panel',
      'integrated_bathroom',
      'integrated_kitchen',
    ]))
  })

  it('materializes business-type default methods into project generation facts when the wizard leaves methods blank', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'data_center',
          methodVariantCodes: [],
        }),
      })
      .expect(201)

    const facts = mocks.buildTemplateRecommendation.mock.calls.at(-1)?.[0] as any
    expect(facts.methodVariantCodes).toEqual(['steel_frame'])
    expect(facts.structureTypeCode).toBe('steel_assembly')
  })

  it('uses canonical fact names from wizard feature and scope metadata inputs', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          methodVariantCodes: ['cast_in_situ'],
          totalAreaM2: 30000,
          projectFeatures: {
            hasCivilDefense: true,
            deep_pit: 11,
            large_span: 36,
            supportHeightM: 8,
          },
          scopeTree: [
            {
              id: 'canonical-building',
              type: 'building',
              name: 'canonical building',
              metadata: {
                standardFloorCount: 33,
                standardFloorAreaM2: 1000,
                maxSpanM: 24,
                supportHeightM: 9,
                towerCraneCount: 4,
                constructionHoistCount: 4,
                methodVariantCodes: ['precast_concrete'],
              },
              children: Array.from({ length: 33 }, (_, index) => ({
                id: `canonical-building-l${index + 1}`,
                type: 'floor',
                name: `L${index + 1}`,
                metadata: { floorOrder: index + 1 },
                children: [],
              })),
            },
            {
              id: 'canonical-basement',
              type: 'basement',
              name: 'canonical basement',
              metadata: {
                basementLevelCount: 2,
                basementAreaM2: 9000,
                foundationDepthM: 10,
                hasCivilDefense: true,
              },
            },
            {
              id: 'canonical-zone',
              type: 'physical_zone',
              name: 'canonical physical zone',
              metadata: {
                physicalCategory: 'basement',
                areaM2: 6000,
                foundationDepthM: 12,
              },
            },
          ],
        }),
      })
      .expect(201)

    const facts = mocks.buildTemplateRecommendation.mock.calls.at(-1)?.[0] as any
    expect(facts.standardFloorCount).toBe(33)
    expect(facts.highestBuildingFloorCount).toBe(33)
    expect(facts.aboveGroundAreaM2).toBe(21000)
    expect(facts.basementLevelCount).toBe(2)
    expect(facts.basementAreaM2).toBe(9000)
    expect(facts.foundationDepthM).toBe(11)
    expect(facts.maxSpanM).toBe(36)
    expect(facts.supportHeightM).toBe(8)
    expect(facts.towerCraneCount).toBe(4)
    expect(facts.constructionHoistCount).toBe(4)
    expect(facts.hasCivilDefense).toBe(true)
    expect(facts.methodVariantCodes).toEqual(['cast_in_situ', 'precast_concrete'])
  })

  it('saves company templates without writing removed geographic context facts', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: makeCandidatePlanQualityRows('company-template-candidate-row'),
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        saveAsCompanyTemplate: true,
        companyTemplateName: '浣忓畢蹇缓妯℃澘',
        wizardPayload: makeWizardPayload({
          step: 2,
          mode: 'new',
          saveAsCompanyTemplate: true,
        }),
      })
      .expect(201)

    const templateInsertCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO company_project_templates'))
    expect(templateInsertCall).toBeTruthy()
    expect(String(templateInsertCall?.[0])).not.toContain('geographic_context')
  })

  it('treats plannedEndDate as a project target constraint without compressing generated template dates', async () => {
    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'starting_line',
          actualStartDate: '2026-05-10',
          plannedEndDate: '2028-05-10',
        }),
      })
      .expect(201)

    const insertProjectCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO projects'))
    expect(insertProjectCall).toBeTruthy()
    expect(String(insertProjectCall?.[0])).toContain('planned_end_date')
    expect(String(insertProjectCall?.[0])).not.toContain('actual_end_date')
    expect(insertProjectCall?.[1]).toEqual(expect.arrayContaining([
      '2028-05-10',
      '2026-05-10',
    ]))

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({
        plannedStartDate: '2026-05-10',
        projectFacts: expect.objectContaining({
          plannedEndDate: '2028-05-10',
          projectFeatures: expect.objectContaining({
            plannedEndDate: '2028-05-10',
          }),
        }),
        clientContext: expect.objectContaining({
          projectTimelineStartDate: '2026-05-10',
          scheduleAnchorDate: '2026-05-10',
          projectPlannedEndDate: '2028-05-10',
          targetConstraintMode: 'compression_preview',
        }),
      }),
    }))
    const futureTaskPayload = mocks.createTaskInMainChain.mock.calls
      .map(([payload]) => payload as Record<string, unknown>)
      .find((payload) => payload.planned_start_date === '2026-06-11')

    expect(futureTaskPayload).toEqual(expect.objectContaining({
      planned_start_date: '2026-06-11',
      planned_end_date: '2026-06-15',
    }))
    expect(futureTaskPayload).not.toHaveProperty('actual_end_date')
  })

  it('returns target acceleration proposal mapped to created task ids for task-list review', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          plannedEndDate: '2028-05-10',
        }),
      })
      .expect(201)

    const proposal = response.body.data.generation.targetFeasibility.accelerationProposal
    expect(proposal.actions[0].affectedRowIds).toHaveLength(2)
    expect(proposal.actions[0].affectedRowIds).toEqual(expect.arrayContaining(['task-1', 'task-2']))
    expect(proposal.actions[0].dependencyAdjustments[0]).toEqual(expect.objectContaining({
      predecessorClientRowId: 'task-1',
      successorClientRowId: 'task-2',
    }))
    expect(proposal.actions[1].affectedRowIds).toEqual(['task-2'])
    expect(proposal.actions[1].durationAdjustments[0]).toEqual(expect.objectContaining({
      clientRowId: 'task-2',
    }))
    expect(proposal.protectedConstraints[0]).toEqual(expect.objectContaining({
      clientRowId: 'task-1',
    }))
    expect(proposal.rescheduleDraft.taskDateAdjustments[0]).toEqual(expect.objectContaining({
      clientRowId: 'task-2',
    }))
    expect(proposal.rescheduleDraft.dependencyAdjustments[0]).toEqual(expect.objectContaining({
      predecessorClientRowId: 'task-1',
      successorClientRowId: 'task-2',
    }))
    expect(proposal.rescheduleDraft.resourceAdjustments[0]).toEqual(expect.objectContaining({
      clientRowId: 'task-2',
    }))
    expect(proposal.rescheduleDraft.operations[0]).toEqual(expect.objectContaining({
      clientRowId: 'task-2',
    }))
    expect(response.body.data.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      status: 'offline_quality_review_recommended',
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      targetAlignmentSnapshot: expect.objectContaining({
        targetEndDate: '2028-05-10',
        naturalEndDate: '2028-08-21',
        overshootDays: 103,
        recoverableDays: 103,
        unrecoverableDays: 0,
        runtimeDecisionRequired: false,
      }),
    }))
    expect(response.body.data.generation.planQualityDiagnostics.candidateGapCodes)
      .toContain('target_duration_gap')

  })

  it('checks candidate plan quality against all generated rows instead of only the display sample', async () => {
    const buildGeneratedRow = (index: number, withDurationAssets: boolean) => ({
      clientRowId: `row-${index}`,
      parentClientRowId: index === 1 ? null : 'row-1',
      sortOrder: index,
      predecessorDependencies: index === 1
        ? []
        : [{ clientRowId: `row-${index - 1}`, dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
      values: {
        title: `测试工序 ${index}`,
        row_projection_mode: 'schedule_row',
        is_wbs_summary: false,
        is_executable: true,
        planned_start_date: `2026-06-${String(index).padStart(2, '0')}`,
        planned_end_date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        standard_task_metadata: withDurationAssets
          ? {
              durationAssetCalculation: {
                selectedDurationDays: 2,
                baseSelectedDurationDays: 2,
                standardWorkDurationSeedStableCode: `STD-ROW-${index}`,
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                t2RhythmApplicability: index === 1
                  ? 'not_applicable_one_off_activity'
                  : 'required_repetitive_or_workface_activity',
                t2RhythmTemplateId: index === 1 ? null : `t2-row-${index}`,
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
                runtimeReferenceDaysStableCode: `STD-ROW-${index}`,
                runtimeReferenceDaysSampleCount: 2,
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'rainy_season',
                processSeasonalImpactBand: 'earthwork_rain_sensitive',
                processSeasonalMultiplier: 1.1,
                dependencyAssetConsumed: true,
                dependencyAssetStableCode: `dep-row-${index}`,
                dependencyAssetDependencyType: 'FS',
                dependencyAssetEvidenceSourceKeys: [`dep-source-row-${index}`],
              },
              durationSuggestion: {
                durationRiskRange: {
                  p20Days: 1,
                  p50Days: 2,
                  p80Days: 3,
                },
              },
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
            }
          : {},
      },
    })

    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        buildGeneratedRow(1, true),
        buildGeneratedRow(2, true),
        buildGeneratedRow(3, true),
        buildGeneratedRow(4, true),
        buildGeneratedRow(5, true),
        buildGeneratedRow(6, false),
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 6,
        standardWorkDurationSeedRowCount: 5,
        activeStandardWorkDurationSeedRowCount: 0,
        fallbackStandardWorkDurationSeedRowCount: 5,
        t2RhythmTemplateRowCount: 5,
        activeT2RhythmTemplateRowCount: 0,
        fallbackT2RhythmTemplateRowCount: 5,
        runtimeReferenceDaysRowCount: 5,
        dependencyAssetConsumedRowCount: 5,
        constructionCalendarRowCount: 5,
        processSeasonalDurationAssetRowCount: 5,
        durationRiskRangeRowCount: 5,
        businessTypeSpecialtyDurationAssetRowCount: 5,
        businessTypeSpecificT2RhythmTemplateRowCount: 5,
        rowsMissingDurationAssetCount: 1,
        rowsMissingT2RhythmTemplateCount: 1,
        rowsMissingRuntimeReferenceDaysCount: 1,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 6 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    const generation = response.body.data.profile.generation
    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      scheduleRowCount: 6,
      durationAssetCoveredRowCount: 5,
      durationAssetReviewRowCount: 6,
      uncoveredDurationAssetRowCount: 1,
    }))
    expect(generation.planQualityDiagnostics.candidateGapCodes).toContain('duration_asset_coverage_gap')
    expect(generation.candidateDurationAssetPreview.durationAssetReviewRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientRowId: 'row-6' }),
    ]))

  })

  it('returns the complete executable default master plan in wizard preview without task writes', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'preview-plan-summary',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          executionPhase: 'startup_site_setup',
          executionLane: 'site_preparation',
          planItemKind: 'work_task',
          values: {
            title: '施工准备',
            standard_work_code: 'SCH-01',
            row_projection_mode: 'schedule_row',
            schedule_participation: 'primary_schedule',
            execution_phase: 'startup_site_setup',
            execution_lane: 'site_preparation',
            duration_contribution_mode: 'duration_bearing',
            duration_authority: 'system_standard_seed',
            duration_calibration_source: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
            duration_provenance: 'system_standard_asset_backed',
            smart_reference_days: 10,
            is_wbs_summary: true,
            is_executable: false,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_suggestion: {
              riskP20DurationDays: 8,
              riskP50DurationDays: 10,
              riskP80DurationDays: 12,
            },
            standard_task_metadata: {
              durationAssetMapping: {
                standardWorkDurationSeedStableCode: 'site_setup_temp_works',
                t2RhythmTemplateId: 't2-startup-site-setup-v1',
              },
            },
          },
        },
        {
          clientRowId: 'preview-plan-task',
          parentClientRowId: 'preview-plan-summary',
          sortOrder: 2,
          predecessorClientRowIds: ['preview-plan-summary'],
          predecessorDependencies: [{
            clientRowId: 'preview-plan-summary',
            dependencyType: 'FS',
            lagDays: 0,
            intentCode: 'executable_default_master_plan_phase_anchor',
            source: 'dependency_intent_template',
          }],
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          executionPhase: 'foundation_pit_pile',
          executionLane: 'foundation:tower_1',
          planItemKind: 'work_task',
          values: {
            title: '桩基施工（1#楼）',
            standard_work_code: 'SCH-02',
            wbs_node_type: 'sub_division',
            building_object_id: 'building-1',
            organization_lane: 'tower_1',
            row_projection_mode: 'schedule_row',
            schedule_participation: 'primary_schedule',
            execution_phase: 'foundation_pit_pile',
            execution_lane: 'foundation:tower_1',
            master_plan_visibility_class: 'primary_control',
            master_plan_visibility_policy_stable_code: 'executable-default-master-plan-promotion',
            duration_contribution_mode: 'duration_bearing',
            duration_authority: 'system_standard_seed',
            duration_calibration_source: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
            duration_provenance: 'system_standard_asset_backed',
            smart_reference_days: 30,
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-07-10',
            duration_suggestion: {
              riskP20DurationDays: 22,
              riskP50DurationDays: 30,
              riskP80DurationDays: 35,
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              durationAssetMapping: {
                standardWorkDurationSeedStableCode: 'bored_cast_in_place_pile_foundation',
                t2RhythmTemplateId: 't2-foundation-pit-pile-v1',
              },
              durationAssetCalculation: {
                selectedDurationDays: 30,
                baseSelectedDurationDays: 30,
                standardWorkDurationSeedStableCode: 'bored_cast_in_place_pile_foundation',
                standardWorkDurationSeedResolverSource: 'ts_seed_fallback',
                t2RhythmTemplateId: 't2-foundation-pit-pile-v1',
                t2RhythmTemplateResolverSource: 'ts_seed_fallback',
              },
            },
          },
        },
        {
          clientRowId: 'preview-record-only-milestone',
          parentClientRowId: null,
          sortOrder: 3,
          predecessorClientRowIds: ['preview-plan-task'],
          predecessorDependencies: [{
            clientRowId: 'preview-plan-task',
            dependencyType: 'FS',
            lagDays: 0,
            intentCode: 'contractual_closeout_milestone',
            source: 'dependency_intent_template',
          }],
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          executionPhase: 'acceptance_handover',
          executionLane: 'contractual_closeout',
          planItemKind: 'milestone',
          values: {
            title: '竣工验收完成',
            standard_work_code: 'SCH-M01',
            row_projection_mode: 'schedule_row',
            schedule_participation: 'primary_schedule',
            execution_phase: 'acceptance_handover',
            execution_lane: 'contractual_closeout',
            plan_item_kind: 'milestone',
            master_plan_visibility_class: 'commitment_milestone',
            duration_contribution_mode: 'record_only',
            duration_authority: 'system_standard_seed',
            duration_calibration_source: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
            duration_provenance: 'system_standard_asset_backed',
            smart_reference_days: 1,
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-07-10',
            planned_end_date: '2026-07-10',
          },
        },
        {
          clientRowId: 'preview-reference-only',
          parentClientRowId: null,
          sortOrder: 4,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          rowProjectionMode: 'linked_projection',
          scheduleParticipation: 'reference_only',
          values: {
            title: '参考资料项',
            row_projection_mode: 'linked_projection',
            schedule_participation: 'reference_only',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-01',
          },
        },
      ],
      executableDefaultMasterPlanAssembly: {
        source: 'executable_default_master_plan_assembly',
        version: 'v1.4.23.1-executable-assembly-v1',
        status: 'executable_default_master_plan_ready',
        businessType: 'school',
        assetAuthority: 'system_standard_seed',
        calibrationPolicy: 'optional_runtime_overlay',
        scheduleRowCount: 3,
        executableScheduleRowCount: 2,
        summaryScheduleRowCount: 1,
        visibleDependencyCount: 2,
        visibleDependencyCoverageRate: 1,
        readyForWizardCommit: true,
        commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies',
        mutationBoundary: 'assembly_only_no_db_write',
      },
      durationAssetUtilizationSummary: {
        scheduleRowCount: 3,
        durationBearingScheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
      },
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 3 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    const generation = response.body.data.profile.generation
    expect(generation.executableDefaultMasterPlanAssembly).toEqual(expect.objectContaining({
      status: 'executable_default_master_plan_ready',
      readyForWizardCommit: true,
      assetAuthority: 'system_standard_seed',
      calibrationPolicy: 'optional_runtime_overlay',
    }))
    expect(generation.executableDefaultMasterPlanPreview).toEqual(expect.objectContaining({
      source: 'wizard_executable_default_master_plan_preview',
      version: 'v1.4.23.1-executable-preview-v1',
      status: 'executable_default_master_plan_ready',
      scheduleRowCount: 3,
      executableRowCount: 2,
      summaryRowCount: 1,
      visibleDependencyCount: 2,
      projectStartDate: '2026-06-11',
      projectEndDate: '2026-07-10',
      previewOnly: true,
      mutationBoundary: 'preview_only_no_db_write',
    }))
    expect(generation.executableDefaultMasterPlanPreview.rows).toEqual([
      expect.objectContaining({
        clientRowId: 'preview-plan-summary',
        wbsCode: 'SCH-01',
        title: '施工准备',
        isWbsSummary: true,
        durationAuthority: 'system_standard_seed',
      }),
      expect.objectContaining({
        clientRowId: 'preview-plan-task',
        parentClientRowId: 'preview-plan-summary',
        wbsCode: 'SCH-02',
        title: '桩基施工（1#楼）',
        executionPhase: 'foundation_pit_pile',
        executionLane: 'foundation:tower_1',
        plannedStartDate: '2026-06-11',
        plannedEndDate: '2026-07-10',
        referenceDurationDays: 30,
        riskP20DurationDays: 22,
        riskP50DurationDays: 30,
        riskP80DurationDays: 35,
        predecessorClientRowIds: ['preview-plan-summary'],
        standardWorkDurationSeedStableCode: 'bored_cast_in_place_pile_foundation',
        t2RhythmTemplateId: 't2-foundation-pit-pile-v1',
        masterPlanVisibilityClass: 'primary_control',
        masterPlanVisibilityPolicyStableCode: 'executable-default-master-plan-promotion',
      }),
      expect.objectContaining({
        clientRowId: 'preview-record-only-milestone',
        wbsCode: 'SCH-M01',
        title: '竣工验收完成',
        planItemKind: 'milestone',
        durationContributionMode: 'record_only',
        isExecutable: true,
      }),
    ])
    expect(generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      totalCount: 1,
      requiredDurationAssetRowCount: 1,
      excludedSummaryScheduleRowCount: 1,
      excludedRecordOnlyScheduleRowCount: 1,
      uncoveredScheduleRowCount: 0,
    }))
    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      scheduleRowCount: 1,
      durationAssetCoveredRowCount: 1,
      uncoveredDurationAssetRowCount: 0,
    }))
    expect(generation.planQualityDiagnostics.candidateGapCodes).not.toContain('duration_asset_coverage_gap')
    expect(mocks.createTasksInWizardBatch).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('marks duration asset coverage as blocked when preview finds uncovered schedule rows even if summary misses the count', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'summary-missed-uncovered-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: 'summary 漏报的待排施工项',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            status: 'todo',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            standard_task_metadata: {},
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 0,
        standardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 0,
        dependencyAssetConsumedRowCount: 0,
        constructionCalendarRowCount: 0,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    const generation = response.body.data.profile.generation
    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      totalCount: 0,
      uncoveredScheduleRowCount: 1,
      durationAssetReviewRowCount: 1,
    }))
    expect(generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      scheduleRowCount: 1,
      durationAssetCoveredRowCount: 0,
      uncoveredDurationAssetRowCount: 1,
    }))
    expect(generation.planQualityDiagnostics.candidateGapCodes).toContain('duration_asset_coverage_gap')

  })

  it('keeps optional row assets visible without treating them as candidate duration gaps', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'partial-duration-asset-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '缺少依赖资产的候选施工项',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            status: 'todo',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_suggestion: {
              durationRiskRange: {
                p20Days: 8,
                p50Days: 10,
                p80Days: 14,
              },
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              durationAssetCalculation: {
                selectedDurationDays: 10,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedStableCode: 'STD-PARTIAL-ROW',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                t2RhythmTemplateId: 't2-partial-row',
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
                runtimeReferenceDaysStableCode: 'STD-PARTIAL-ROW',
                runtimeReferenceDaysSampleCount: 3,
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'standard_season',
                processSeasonalImpactBand: 'normal_productivity',
                processSeasonalMultiplier: 1,
              },
            },
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        runtimeReferenceDaysRowCount: 1,
        dependencyAssetConsumedRowCount: 0,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    const generation = response.body.data.profile.generation
    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      totalCount: 1,
      uncoveredScheduleRowCount: 0,
      durationAssetReviewRows: expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'partial-duration-asset-row',
          missingAssetCodes: expect.arrayContaining(['dependency_sequence']),
          candidateAssetCoverageStatus: 'candidate_asset_coverage_ready',
        }),
      ]),
    }))
    expect(generation.planQualityDiagnostics.candidateGapCodes).not.toContain('duration_asset_coverage_gap')

  })

  it('treats dependency timing rule evidence as candidate dependency sequence lineage', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'dependency-timing-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: 'Dependency timing backed task',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            status: 'todo',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            duration_suggestion: {
              durationRiskRange: {
                p20Days: 8,
                p50Days: 10,
                p80Days: 14,
              },
            },
            standard_task_metadata: {
              calendarBasis: 'official_construction_calendar_seed',
              constructionCalendarWindowCount: 1,
              businessTypeMasterPlan: {
                businessType: 'school',
                profileSourceType: 'business_type_master_plan_profile_v1',
                profileTemplateId: 'school_master_plan_profile_v1',
                profileTemplateGroup: 'school_master_plan',
                profilePackType: 'business_type_profile',
                mutationBoundary: 'candidate_only_no_task_dependencies_write',
              },
                durationAssetCalculation: {
                  selectedDurationDays: 10,
                  baseSelectedDurationDays: 10,
                  selectionRule: 'max_seed_t2_productivity_candidate_l1',
                  durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
                  durationMaturity: 'L1',
                  durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
                  durationTruthSource: 'candidate_plan_duration_days',
                  standardWorkDurationSeedP50Days: 8,
                  t2RhythmTemplateP50Days: 36,
                  realPlanSkeletonDurationDays: 30,
                  realPlanSkeletonFloorApplied: true,
                  maxNonSkeletonAssetDays: 36,
                  standardWorkDurationSeedStableCode: 'cast_in_place_formwork',
                  standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
                t2RhythmTemplateId: 't2-school-teaching-building-structure-rhythm-v1',
                t2RhythmTemplateResolverSource: 'runtime_t2_registry',
                runtimeReferenceDaysConsumed: true,
                runtimeReferenceDaysEvidenceLevel: 'runtime_calibrated_l2',
                runtimeReferenceDaysStableCode: 'cast_in_place_formwork',
                runtimeReferenceDaysSampleCount: 3,
                processSeasonalDurationAssetConsumed: true,
                processSeasonalClimateSignal: 'standard_season',
                processSeasonalImpactBand: 'normal_productivity',
                processSeasonalMultiplier: 1,
                quantityOrProductivity: {
                  source: 'project_scale_facts',
                  value: 5,
                  unit: 'startup_workface',
                  basis: 'building_count + basement_level_count',
                  productivityDerivedDurationDays: 16,
                },
                dependencyTimingAsset: {
                  consumed: true,
                  selectedLagDays: 4,
                },
                dependencyEvidence: {
                  ruleSource: 'construction_task_dependency_constraint_rule_system',
                  layerStack: 'cross_item_workflow + process_constraint',
                  productionWritePolicy: 'candidate_only_no_task_dependencies_write',
                  phaseAnchorDependencyCount: 1,
                  startAnchor: false,
                  anchorType: 'predecessor_anchor',
                },
                criticalPathEvidence: {
                  criticalPathCandidate: true,
                  totalFloatDays: 0,
                  earlyStartOffsetDays: 0,
                  earlyFinishOffsetDays: 10,
                  lateStartOffsetDays: 0,
                  lateFinishOffsetDays: 10,
                },
              },
            },
          },
        },
      ],
      durationAssetUtilizationSummary: {
        source: 'default_master_plan_duration_asset_utilization_summary',
        evidenceLevel: 'candidate_duration_asset_utilization_l1',
        mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        activeStandardWorkDurationSeedRowCount: 0,
        fallbackStandardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        activeT2RhythmTemplateRowCount: 0,
        fallbackT2RhythmTemplateRowCount: 1,
        runtimeReferenceDaysRowCount: 1,
        projectScaleQuantityProxyRowCount: 1,
        businessTypeProfileScheduleRowCount: 1,
        businessTypeSpecialtyDurationAssetRowCount: 1,
        businessTypeSpecificT2RhythmTemplateRowCount: 1,
        dependencyAssetConsumedRowCount: 0,
        dependencyTimingAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        durationRiskRangeRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    const generation = response.body.data.profile.generation
    expect(generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      totalCount: 1,
      dependencyAssetCount: 0,
      dependencySequenceEvidenceCount: 1,
      criticalPathCandidateCount: 1,
      floatCalculatedCount: 1,
      projectScaleQuantityProxyCount: 1,
      businessTypeSpecialtyDurationAssetCount: 1,
      businessTypeSpecificT2RhythmTemplateCount: 1,
      durationSelectionBasisCount: 1,
    }))
    expect(generation.candidateDurationAssetPreview.items).toEqual([
      expect.objectContaining({
        clientRowId: 'dependency-timing-row',
        dependencyAssetConsumed: false,
        dependencyTimingAssetConsumed: true,
        dependencyTimingSelectedLagDays: 4,
        dependencyRuleSource: 'construction_task_dependency_constraint_rule_system',
        dependencyLayerStack: 'cross_item_workflow + process_constraint',
        dependencyProductionWritePolicy: 'candidate_only_no_task_dependencies_write',
        phaseAnchorDependencyCount: 1,
        dependencyAnchorType: 'predecessor_anchor',
        criticalPathCandidate: true,
        totalFloatDays: 0,
        earlyStartOffsetDays: 0,
        earlyFinishOffsetDays: 10,
        lateStartOffsetDays: 0,
        lateFinishOffsetDays: 10,
        durationSelectionRule: 'max_seed_t2_productivity_candidate_l1',
        durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
        durationMaturity: 'L1',
        durationReviewGate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        durationTruthSource: 'candidate_plan_duration_days',
        standardWorkDurationSeedP50Days: 8,
        t2RhythmTemplateP50Days: 36,
        realPlanSkeletonDurationDays: 30,
        realPlanSkeletonFloorApplied: true,
        maxNonSkeletonAssetDays: 36,
        projectScaleQuantityProxyApplied: true,
        projectScaleQuantityProxySource: 'project_scale_facts',
        projectScaleQuantityProxyValue: 5,
        projectScaleQuantityProxyUnit: 'startup_workface',
        projectScaleQuantityProxyBasis: 'building_count + basement_level_count',
        productivityDerivedDurationDays: 16,
        businessType: 'school',
        businessTypeProfileSourceType: 'business_type_master_plan_profile_v1',
        businessTypeProfileTemplateId: 'school_master_plan_profile_v1',
        businessTypeProfileTemplateGroup: 'school_master_plan',
        businessTypeProfilePackType: 'business_type_profile',
        businessTypeSpecialtyDurationAssetApplied: true,
        businessTypeSpecificT2RhythmTemplateApplied: true,
      }),
    ])

    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.candidateDurationAssetPreview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'dependency-timing-row',
        dependencyTimingAssetConsumed: true,
        criticalPathCandidate: true,
        totalFloatDays: 0,
        businessTypeSpecialtyDurationAssetApplied: true,
        businessTypeSpecificT2RhythmTemplateApplied: true,
      }),
    ]))
    expect(generation.planQualityDiagnostics.candidateGapCodes).not.toContain('duration_asset_coverage_gap')

  })

  it('previews project profile with location facts and target feasibility without creating tasks', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        location: '涓婃捣娴︿笢',
        plannedEndDate: '2028-05-10',
      }))
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.profile.locationFacts).toEqual(expect.objectContaining({
      rawLocation: '涓婃捣娴︿笢',
      regionCode: expect.any(String),
      inferenceStatus: expect.any(String),
      climateSignals: expect.any(Array),
      weatherImpactBands: expect.any(Array),
      source: 'wizard_location_rule',
    }))
    expect(response.body.data.targetFeasibility).toEqual(expect.objectContaining({
      mode: 'compression_preview',
      overshootDays: 103,
      accelerationProposal: expect.objectContaining({
        source: 'target_end_compression',
      }),
    }))
    expect(response.body.data.profile.issues).toEqual(expect.any(Array))
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'wizard-preview',
      operation: expect.objectContaining({
        clientContext: expect.objectContaining({
          targetConstraintMode: 'compression_preview',
          locationFacts: expect.objectContaining({
            rawLocation: '涓婃捣娴︿笢',
          }),
        }),
        scope: expect.objectContaining({
          locationFacts: expect.objectContaining({
            rawLocation: '涓婃捣娴︿笢',
          }),
        }),
      }),
    }))
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceTaskDependencies).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('recomputes preview network span from duration-asset-adjusted rows before offline plan-quality review', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'row-1', dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
          values: {
            title: '砌体插入施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-11',
            planned_end_date: '2026-06-15',
            standard_task_metadata: {},
          },
        },
      ],
      candidateNetworkEvaluation: {
        source: 'generated_wbs_row_candidate_network_cpm',
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        projectedNetworkSpanDays: 15,
        previewEdgeCount: 1,
        unresolvedEdgeCount: 0,
        criticalGeneratedRowIds: ['row-1', 'row-2'],
        materializationStatus: 'fully_mapped_read_only',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        t2RhythmTemplateRowCount: 0,
        rowsMissingDurationAssetCount: 0,
      },
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })
    mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies.mockImplementationOnce((rows: any[]) => {
      expect(rows[0].values.planned_end_date).toBe('2026-06-12')
      return {
        source: 'generated_wbs_row_candidate_network_cpm',
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        projectedNetworkSpanDays: 17,
        previewEdgeCount: 1,
        unresolvedEdgeCount: 0,
        criticalGeneratedRowIds: ['row-1', 'row-2'],
        materializationStatus: 'fully_mapped_read_only',
        rowSchedule: [
          { generatedRowId: 'row-1', startDay: 0, finishDay: 12, durationDays: 12, totalFloatDays: 0, isCritical: true },
          { generatedRowId: 'row-2', startDay: 12, finishDay: 17, durationDays: 5, totalFloatDays: 0, isCritical: true },
        ],
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      }))
      .expect(200)

    expect(mocks.buildCandidateNetworkEvaluationFromGeneratedDependencies).toHaveBeenCalledTimes(1)
    expect(response.body.data.profile.generation.candidateNetworkEvaluation).toEqual(expect.objectContaining({
      projectedNetworkSpanDays: 17,
      previewEdgeCount: 1,
      rowSchedule: expect.arrayContaining([
        expect.objectContaining({
          generatedRowId: 'row-2',
          startDay: 12,
          finishDay: 17,
          durationDays: 5,
        }),
      ]),
      durationAssetPlanDateNetworkRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_network_recalculation',
        adjustedRowCount: 1,
        previousProjectedNetworkSpanDays: 15,
        recalculatedProjectedNetworkSpanDays: 17,
        mutationBoundary: 'candidate_network_recalculation_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
      }),
    }))
    expect(response.body.data.profile.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.profile.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      projectedNetworkSpanDays: 17,
    }))
  })

  it('flags unresolved candidate dependency edges before offline plan-quality review', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-12',
            standard_task_metadata: { stableCode: 'row-1' },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [],
          values: {
            title: '机电预留预埋',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-13',
            planned_end_date: '2026-06-17',
            standard_task_metadata: { stableCode: 'row-2' },
          },
        },
      ]),
      candidateNetworkEvaluation: {
        source: 'generated_wbs_row_candidate_network_cpm',
        networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
        projectedNetworkSpanDays: 17,
        previewEdgeCount: 1,
        unresolvedEdgeCount: 1,
        criticalGeneratedRowIds: ['row-1', 'row-2'],
        materializationStatus: 'preview_only_unresolved_edges',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      },
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 2,
        activeStandardWorkDurationSeedRowCount: 2,
        fallbackStandardWorkDurationSeedRowCount: 0,
        t2RhythmTemplateRowCount: 2,
        activeT2RhythmTemplateRowCount: 2,
        fallbackT2RhythmTemplateRowCount: 0,
        runtimeReferenceDaysRowCount: 2,
        runtimeReferenceDaysConsumedRowCount: 2,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
        dependencyAssetConsumedRowCount: 2,
        constructionCalendarRowCount: 2,
        processSeasonalDurationAssetRowCount: 2,
        durationRiskRangeRowCount: 2,
        productionWritePolicy: 'candidate_only_no_task_dependencies_write',
      },
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-30',
      }))
      .expect(200)

    const generation = response.body.data.profile.generation
    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      projectedNetworkSpanDays: 17,
      previewDependencyCount: 1,
      unresolvedDependencyCount: 1,
    }))
    expect(generation.planQualityDiagnostics.candidateGapCodes).toContain('unresolved_dependency_edges')

  })

  it('recomputes preview target alignment from duration-asset-adjusted rows before offline plan-quality review', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'row-1', dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
          values: {
            title: '砌体插入施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            planned_start_date: '2026-06-13',
            planned_end_date: '2026-06-17',
            standard_task_metadata: {},
          },
        },
      ],
      candidateNetworkEvaluation: null,
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 0,
        rowsMissingDurationAssetCount: 1,
      },
      governanceWarnings: [],
      targetFeasibility: {
        mode: 'compression_preview',
        scenario: 'baseline_target_alignment',
        targetEndDate: '2026-06-15',
        naturalEndDate: '2026-06-15',
        overshootDays: 0,
        recoverableDays: 0,
        unrecoverableDays: 0,
        verdict: 'fit',
        strategies: [],
      },
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-15',
      }))
      .expect(200)

    expect(response.body.data.targetFeasibility).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-15',
      naturalEndDate: '2026-06-17',
      overshootDays: 2,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_target_recalculation',
        adjustedRowCount: 1,
        previousNaturalEndDate: '2026-06-15',
        recalculatedNaturalEndDate: '2026-06-17',
        previousOvershootDays: 0,
        recalculatedOvershootDays: 2,
        mutationBoundary: 'candidate_target_recalculation_only_no_plan_date_write_no_dependency_write_no_runtime_publication',
      }),
    }))
    expect(response.body.data.profile.generation.planQualityDiagnostics.targetAlignmentSnapshot).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-15',
      naturalEndDate: '2026-06-17',
      overshootDays: 2,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_target_recalculation',
        adjustedRowCount: 1,
        previousNaturalEndDate: '2026-06-15',
        recalculatedNaturalEndDate: '2026-06-17',
        previousOvershootDays: 0,
        recalculatedOvershootDays: 2,
        mutationBoundary: 'candidate_target_recalculation_only_no_plan_date_write_no_dependency_write_no_runtime_publication',
      }),
    }))
  })

  it('recomputes preview target alignment when duration assets shorten the generated natural end date', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'row-1',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            start_date: '2026-06-01',
            end_date: '2026-06-20',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-20',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 20,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
        {
          clientRowId: 'row-2',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'row-1', dependencyType: 'FS', lagDays: 0, source: 'sibling_sequence' }],
          values: {
            title: '砌体插入施工',
            row_projection_mode: 'schedule_row',
            is_wbs_summary: false,
            is_executable: true,
            start_date: '2026-06-13',
            end_date: '2026-06-17',
            planned_start_date: '2026-06-13',
            planned_end_date: '2026-06-17',
            standard_task_metadata: {},
          },
        },
      ],
      candidateNetworkEvaluation: null,
      durationAssetUtilizationSummary: {
        scheduleRowCount: 2,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 0,
        rowsMissingDurationAssetCount: 1,
      },
      governanceWarnings: [],
      targetFeasibility: {
        mode: 'compression_preview',
        scenario: 'baseline_target_alignment',
        targetEndDate: '2026-06-18',
        naturalEndDate: '2026-06-20',
        overshootDays: 2,
        recoverableDays: 0,
        unrecoverableDays: 2,
        verdict: 'requires_scope_change',
        strategies: [],
      },
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-18',
      }))
      .expect(200)

    expect(response.body.data.targetFeasibility).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-18',
      naturalEndDate: '2026-06-17',
      overshootDays: 0,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_target_recalculation',
        adjustedRowCount: 1,
        previousNaturalEndDate: '2026-06-20',
        recalculatedNaturalEndDate: '2026-06-17',
        previousOvershootDays: 2,
        recalculatedOvershootDays: 0,
        mutationBoundary: 'candidate_target_recalculation_only_no_plan_date_write_no_dependency_write_no_runtime_publication',
      }),
    }))
    expect(response.body.data.profile.generation.planQualityDiagnostics.targetAlignmentSnapshot).toEqual(expect.objectContaining({
      targetEndDate: '2026-06-18',
      naturalEndDate: '2026-06-17',
      overshootDays: 0,
      durationAssetPlanDateTargetRecalculation: expect.objectContaining({
        source: 'wizard_duration_asset_plan_date_target_recalculation',
        adjustedRowCount: 1,
        previousNaturalEndDate: '2026-06-20',
        recalculatedNaturalEndDate: '2026-06-17',
        previousOvershootDays: 2,
        recalculatedOvershootDays: 0,
        mutationBoundary: 'candidate_target_recalculation_only_no_plan_date_write_no_dependency_write_no_runtime_publication',
      }),
    }))
  })

  it('previews commercial readiness for scale, method, scope, special features, and resource assumptions', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        totalAreaM2: 30000,
        methodVariantCodes: ['precast_concrete'],
        prefabSystemCodes: ['pcf_facade_panel'],
        projectFeatures: {
          prefabRate: 45,
          deep_pit: 11,
          large_span: 36,
          supportHeightM: 8,
        },
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 22,
              towerCraneCount: 2,
              constructionHoistCount: 2,
              childrenComplete: true,
            },
            children: [],
          },
          {
            id: 'basement-1',
            type: 'basement',
            name: '鍦颁笅瀹?',
            metadata: {
              basementLevelCount: 2,
              basementAreaM2: 8000,
              foundationDepthM: 9,
              childrenComplete: true,
            },
            children: [],
          },
          {
            id: 'outdoor-1',
            type: 'physical_zone',
            name: '瀹ゅ鎬诲钩',
            metadata: {
              physicalSpaceKind: 'outdoor_site',
              physicalCategory: 'outdoor_site_plan',
              areaM2: 3000,
              childrenComplete: true,
            },
            children: [],
          },
        ],
      }))
      .expect(200)

    expect(response.body.data.profile.commercialFactReadiness.summary).toEqual({
      readyCount: 5,
      warningCount: 0,
      blockingCount: 0,
      disabledCount: 0,
    })
    expect(response.body.data.profile.commercialFactReadiness.items).toEqual([
      expect.objectContaining({
        code: 'scale',
        status: 'ready',
        evidence: expect.arrayContaining([
          expect.stringContaining('30,000'),
          expect.stringContaining('22'),
          expect.stringContaining('2'),
        ]),
      }),
      expect.objectContaining({
        code: 'method',
        status: 'ready',
        evidence: expect.arrayContaining([
          expect.stringContaining('precast_concrete'),
          expect.stringContaining('45%'),
        ]),
      }),
      expect.objectContaining({
        code: 'scope',
        status: 'ready',
        evidence: expect.arrayContaining([
          expect.stringContaining('scope_objects'),
          expect.stringContaining('scope_combos'),
        ]),
      }),
      expect.objectContaining({
        code: 'special_feature',
        status: 'ready',
        evidence: expect.arrayContaining([
          expect.stringContaining('deep_pit'),
          expect.stringContaining('large_span'),
        ]),
      }),
      expect.objectContaining({
        code: 'resource_assumption',
        status: 'ready',
        action: null,
        evidence: expect.arrayContaining([
          expect.stringContaining('towerCraneCount=2'),
          expect.stringContaining('constructionHoistCount=2'),
        ]),
      }),
    ])
  })

  it('previews construction organization scenario from wizard project facts before task generation', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        location: '涓婃捣',
        totalAreaM2: 135000,
        basementAreaM2: 28000,
        siteAreaM2: 52000,
        methodVariantCodes: [
          'pile_foundation',
          'vertical_retaining_support',
          'no_horizontal_strut',
        ],
        projectFeatures: {
          deep_pit: 5,
          hasCivilDefense: true,
        },
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 26,
              childrenComplete: true,
            },
            children: [],
          },
          {
            id: 'building-2',
            type: 'building',
            name: '2#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 24,
              childrenComplete: true,
            },
            children: [],
          },
          {
            id: 'basement-shared',
            type: 'basement',
            name: '鏁翠綋鍦颁笅瀹?',
            metadata: {
              basementKind: 'shared',
              basementLevelCount: 2,
              basementAreaM2: 28000,
              foundationDepthM: 5,
              serviceTargetObjectIds: ['building-1', 'building-2'],
              childrenComplete: true,
            },
            children: [],
          },
          {
            id: 'outdoor-site',
            type: 'physical_zone',
            name: '瀹ゅ鎬诲钩',
            metadata: {
              physicalSpaceKind: 'outdoor_site',
              physicalCategory: 'outdoor_site_plan',
              areaM2: 5000,
              childrenComplete: true,
            },
            children: [],
          },
        ],
      }))
      .expect(200)

    const scenario = response.body.data.constructionOrganizationScenario
    expect(scenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
      ]),
      boundaryPolicy: expect.objectContaining({
        directSeedMutation: false,
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write',
      }),
      factBasis: expect.objectContaining({
        usesExistingWizardFactsOnly: true,
        buildingCount: 2,
        scopeOrganizationFacts: expect.objectContaining({
          source: 'wizard_scope_objects',
          buildingObjectCount: 2,
          sharedBasementObjectCount: 1,
          outdoorSiteObjectCount: 1,
          organizationSignals: expect.arrayContaining([
            'multi_building_scope_objects',
            'shared_basement_service_range',
            'outdoor_site_scope_present',
          ]),
        }),
        resourceRole: 'sidecar_feasibility_signal',
      }),
    }))
    expect(scenario.candidates.map((candidate: any) => candidate.scenarioId)).toEqual(expect.arrayContaining([
      'shared_basement_first_then_tower',
      'tower_lane_early_release_after_core_basement',
    ]))
    expect(scenario.recommendedPlanOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option',
      selectedScenarioIds: expect.arrayContaining(['pile_before_excavation']),
      evaluation: expect.objectContaining({
        useCaseEvaluations: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            actionability: 'actionable_candidate',
          }),
          accelerationRecovery: expect.objectContaining({
            actionability: 'actionable_candidate',
          }),
        }),
      }),
    }))
    expect(scenario.recommendedPlanOption.evaluation.useCaseEvaluations.newProjectPlanning.factCoverage).toEqual(expect.objectContaining({
      usesExistingWizardFactsOnly: true,
      consumedFactKeys: expect.arrayContaining([
        'methodVariantCodes',
        'buildingCount',
        'foundationDepthM',
        'locationFacts',
        'scopeOrganizationFacts',
      ]),
      missingFactKeys: expect.arrayContaining([
        'climateSignals',
      ]),
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    }))
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceTaskDependencies).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('uses route project and company scope for duration assets without writing project data', async () => {
    mocks.resolveConstructionCalendarContext.mockResolvedValueOnce({
      basis: 'official_construction_calendar_seed',
      windows: [{
        holidayCode: 'project_shutdown_2026',
        holidayName: 'Project shutdown',
        startDate: '2026-05-02',
        endDate: '2026-05-04',
        counts_as_construction_shutdown: true,
      }],
    })

    const response = await request(buildApp())
      .post('/api/projects/live-project-1/wizard/preview')
      .send(makeWizardPayload({
        projectId: 'live-project-1',
        mode: 'new',
      }))
      .expect(200)

    expect(response.body.data.profile.generation.durationAssetUtilizationSummary).toEqual(expect.objectContaining({
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: 2,
      standardWorkDurationSeedRowCount: 2,
      t2RhythmTemplateRowCount: 2,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }))
    expect(response.body.data.profile.generation.durationAssetConsumptionReceipts).toEqual([
      expect.objectContaining({ changedFields: ['duration'], status: 'effective_applied' }),
      expect.objectContaining({ changedFields: ['dependency'], status: 'effective_applied' }),
    ])
    expect(response.body.data.profile.generation.durationAssetConsumptionSummary).toEqual(expect.objectContaining({
      totalCount: 2,
      effectiveAppliedCount: 2,
    }))
    expect(response.body.data.profile.generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      source: 'generated_wbs_rows_candidate_duration_asset_preview',
      evidenceLevel: 'candidate_duration_asset_preview_l1',
      mutationBoundary: 'preview_only_no_duration_runtime_write_no_task_write',
      totalCount: 2,
      riskRangeCount: 2,
      dependencyAssetCount: 2,
      processSeasonalAdjustmentCount: 2,
      constructionCalendarCount: 2,
      writesDurationRuntime: false,
      writesTasks: false,
      uncoveredScheduleRowCount: 0,
    }))
    expect(response.body.data.profile.generation.candidateDurationAssetPreview.durationAssetReviewRows).toEqual([
      expect.objectContaining({
        clientRowId: 'row-1',
        assetCoverageStatus: 'full_asset_coverage',
        presentAssetCodes: expect.arrayContaining(['standard_work_duration_seed', 'runtime_reference_days', 'dependency_sequence']),
        missingAssetCodes: [],
      }),
      expect.objectContaining({
        clientRowId: 'row-2',
        assetCoverageStatus: 'full_asset_coverage',
        presentAssetCodes: expect.arrayContaining(['standard_work_duration_seed', 'runtime_reference_days', 'dependency_sequence']),
        missingAssetCodes: [],
        qualityReviewAction: 'candidate_duration_assets_ready',
      }),
    ])
    expect(response.body.data.profile.generation.candidateDurationAssetPreview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: 'row-1',
        title: '涓讳綋缁撴瀯鏂藉伐',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2026-06-12',
        riskP20DurationDays: 8,
        riskP50DurationDays: 10,
        riskP80DurationDays: 14,
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 1,
        processSeasonalDurationAssetConsumed: true,
        processSeasonalClimateSignal: 'rainy_season',
        processSeasonalImpactBand: 'earthwork_rain_sensitive',
        selectedDurationDays: 12,
        baseSelectedDurationDays: 10,
        dependencyAssetConsumed: true,
        dependencyAssetStableCode: 'main_structure_to_masonry_infill',
        dependencyAssetDependencyType: 'FS',
        dependencyAssetLagDays: 2,
      }),
      expect.objectContaining({
        clientRowId: 'row-2',
        title: '鎵嬫湳閮ㄦ満鐢甸鐣?',
        plannedStartDate: '2026-06-11',
        plannedEndDate: '2026-06-15',
        riskP50DurationDays: 5,
        calendarBasis: 'official_construction_calendar_seed',
        constructionCalendarWindowCount: 1,
        dependencyAssetConsumed: true,
        dependencyAssetStableCode: 'main_structure_to_mep_reservation',
        dependencyAssetDependencyType: 'FS',
        dependencyAssetLagDays: 0,
      }),
    ]))
    expect(response.body.data.profile.generation.candidateDurationAssetPreview.uncoveredScheduleRows).toEqual([])
    expect(response.body.data.profile.generation.candidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
      projectedNetworkSpanDays: 326,
      previewEdgeCount: 4,
      unresolvedEdgeCount: 0,
      criticalGeneratedRowIds: ['row-1', 'row-2'],
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    const generation = response.body.data.profile.generation
    expect(generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      source: 'wizard_generation_plan_quality_diagnostics',
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
      blocksBaselinePublication: false,
      scheduleRowCount: 2,
      durationAssetCoveredRowCount: 2,
      uncoveredDurationAssetRowCount: 0,
      projectedNetworkSpanDays: 326,
      previewDependencyCount: 4,
      unresolvedDependencyCount: 0,
    }))
    expect(generation.planQualityDiagnostics.candidateGapCodes).not.toContain('duration_asset_coverage_gap')
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'live-project-1',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: expect.objectContaining({
        clientContext: expect.objectContaining({
          companyId: 'company-1',
        }),
      }),
    }))
    expect(mocks.resolveConstructionCalendarContext).toHaveBeenCalledWith({
      projectId: 'live-project-1',
    })
    const previewGenerationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(previewGenerationCall.detailLevel).toBe('planning_skeleton')
    expect(previewGenerationCall.operation).toEqual(expect.objectContaining({
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      includeActivitySteps: false,
    }))
    expect(previewGenerationCall.operation.clientContext).toEqual(expect.objectContaining({
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [expect.objectContaining({
          holidayCode: 'project_shutdown_2026',
        })],
      },
    }))
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.replaceTaskDependencies).not.toHaveBeenCalled()
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).not.toHaveBeenCalled()
  })

  it('returns dated candidate acceptance plans in profile preview without writing acceptance rows', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'ordinary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-12-31',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
        {
          clientRowId: 'acceptance-row',
          parentClientRowId: null,
          sortOrder: 2,
          predecessorDependencies: [{ clientRowId: 'ordinary-row', dependencyType: 'FS', lagDays: 0, source: 'milestone_sequence' }],
          values: {
            title: '竣工验收与交付移交',
            status: 'todo',
            progress: 0,
            planned_start_date: '2027-12-20',
            planned_end_date: '2027-12-20',
            completion_rule: 'acceptance_passed',
            is_milestone: true,
            standard_task_metadata: {
              wizardGenerated: true,
              isAcceptanceMilestone: true,
              planItemKind: 'milestone',
              stableCode: 'MS-01-01-11',
            },
          },
        },
      ],
      durationAssetUtilizationSummary: null,
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 2 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    expect(response.body.data.profile.generation.candidateAcceptancePlanPreview).toEqual(expect.objectContaining({
      source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
      mutationBoundary: 'preview_only_no_acceptance_plan_write',
      totalCount: 1,
      datedCount: 1,
      writesAcceptancePlans: false,
    }))
    expect(response.body.data.profile.generation.candidateAcceptancePlanPreview.items).toEqual([
      expect.objectContaining({
        clientRowId: 'acceptance-row',
        title: '竣工验收与交付移交',
        acceptanceType: 'completion',
        plannedDate: '2027-12-20',
      }),
    ])
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO acceptance_plans'))).toBe(false)
  })

  it('derives a read-only target-date acceptance preview when generated rows have no acceptance milestone', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'ordinary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            status: 'todo',
            progress: 0,
            planned_start_date: '2026-06-01',
            planned_end_date: '2027-06-30',
            standard_task_metadata: {
              wizardGenerated: true,
            },
          },
        },
      ],
      durationAssetUtilizationSummary: null,
      candidateNetworkEvaluation: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'school',
        terminalEvent: 'completion_acceptance',
        plannedStartDate: '2026-06-01',
        plannedEndDate: '2027-12-31',
      }))
      .expect(200)

    expect(response.body.data.profile.generation.candidateAcceptancePlanPreview).toEqual(expect.objectContaining({
      source: 'wizard_target_candidate_acceptance_plan_preview',
      evidenceLevel: 'candidate_acceptance_plan_preview_l1',
      mutationBoundary: 'target_preview_only_no_acceptance_plan_write',
      totalCount: 1,
      datedCount: 1,
      writesAcceptancePlans: false,
      fallbackFromProjectTarget: true,
    }))
    expect(response.body.data.profile.generation.candidateAcceptancePlanPreview.items).toEqual([
      expect.objectContaining({
        clientRowId: 'wizard-target-completion-acceptance',
        title: '竣工验收与交付移交',
        acceptanceType: 'completion_acceptance',
        plannedDate: '2027-12-31',
        sourceBasis: 'wizard_planned_end_date_terminal_event',
      }),
    ])
    expect(response.body.data.profile.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.profile.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      acceptanceMilestoneCount: 1,
      datedAcceptanceMilestoneCount: 1,
    }))
    expect(response.body.data.profile.generation.planQualityDiagnostics.candidateGapCodes)
      .not.toContain('missing_dated_acceptance_milestone')
    expect(mocks.rawQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO acceptance_plans'))).toBe(false)
  })

  it('treats a declared building floor count as ready for WBS preview and commit without expanding all floors', async () => {
    const scopeTree = [
      {
        id: 'building-1',
        type: 'building',
        name: '1#妤?',
        metadata: {
          functionalUsage: '浣忓畢妤?',
          standardFloorCount: 26,
        },
        children: [],
      },
    ]

    await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        scopeTree,
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    mocks.generateWbsTemplateRows.mockClear()

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({ scopeTree }),
      })
      .expect(201)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      diagnosticDurationSuggestionMode: 'fast_template',
    }))
  })

  it('previews scope readiness issues before running template generation', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              childrenComplete: false,
            },
            children: [],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(response.body.data.profile.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        severity: 'blocking',
        message: expect.stringContaining('1#妤?'),
      }),
    ]))
  })

  it('previews WBS generation with explicit draft scope combos from scope tree lineage', async () => {
    await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        scopeTree: [
          {
            id: 'phase-1',
            type: 'phase',
            name: 'Phase 1',
            children: [
              {
                id: 'section-1',
                type: 'section',
                name: 'Section 1',
                children: [
                  {
                    id: 'building-1',
                    type: 'building',
                    name: '1# Building',
                    metadata: { functionalUsage: 'residential_tower', childrenComplete: true },
                    children: [
                      { id: 'building-1-l1', type: 'floor', name: 'L1', metadata: { floorOrder: 1, floorUsage: 'standard' }, children: [] },
                    ],
                  },
                ],
              },
              {
                id: 'section-2',
                type: 'section',
                name: 'Section 2',
                children: [
                  {
                    id: 'building-2',
                    type: 'building',
                    name: '2# Building',
                    metadata: { functionalUsage: 'residential_tower', childrenComplete: true },
                    children: [
                      { id: 'building-2-l1', type: 'floor', name: 'L1', metadata: { floorOrder: 1, floorUsage: 'standard' }, children: [] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.materializeWizardScopeTree).not.toHaveBeenCalled()
    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.scope).toEqual(expect.objectContaining({
      phases: ['phase-1'],
      sections: ['section-1', 'section-2'],
      buildings: ['building-1', 'building-2'],
      floors: ['building-1-l1', 'building-2-l1'],
      scope_combos: [
        {
          phase_object_id: 'phase-1',
          section_object_id: 'section-1',
          building_object_id: 'building-1',
          floor_object_id: 'building-1-l1',
        },
        {
          phase_object_id: 'phase-1',
          section_object_id: 'section-2',
          building_object_id: 'building-2',
          floor_object_id: 'building-2-l1',
        },
      ],
    }))
  })

  it('does not mix first scope-tree object ids into materialized scope combos', async () => {
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: {
        basement_1: 'basement-real-1',
        outdoor_1: 'outdoor-real-1',
      },
      enrichedScopeTree: [
        { id: 'basement_1', objectId: 'basement-real-1', type: 'basement', name: '鍦颁笅瀹?', metadata: { basementLevelCount: 1, childrenComplete: true }, children: [] },
        { id: 'outdoor_1', objectId: 'outdoor-real-1', type: 'physical_zone', name: '瀹ゅ鎬诲钩', metadata: { physicalSpaceKind: 'outdoor_site', childrenComplete: true }, children: [] },
      ],
      materializedObjects: [],
      generationScope: {
        basements: ['basement-real-1'],
        physical_zones: ['outdoor-real-1'],
        scope_objects: [
          { id: 'basement-real-1', type: 'basement', name: '鍦颁笅瀹?', parentId: null, metadata: { basementLevelCount: 1 } },
          { id: 'outdoor-real-1', type: 'physical_zone', name: '瀹ゅ鎬诲钩', parentId: null, metadata: { physicalSpaceKind: 'outdoor_site' } },
        ],
        scope_combos: [
          { basement_object_id: 'basement-real-1' },
        ],
      },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: makeCandidatePlanQualityRows('scope-combo-candidate-row'),
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'renovation',
          businessSubtype: 'renovation_energy',
          scopeTree: [
            { id: 'basement_1', type: 'basement', name: '鍦颁笅瀹?', metadata: { basementLevelCount: 1, childrenComplete: true }, children: [] },
            { id: 'outdoor_1', type: 'physical_zone', name: '瀹ゅ鎬诲钩', metadata: { physicalSpaceKind: 'outdoor_site', childrenComplete: true }, children: [] },
          ],
        }),
      })
      .expect(201)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.scope).toEqual(expect.objectContaining({
      scope_combos: [{ basement_object_id: 'basement-real-1' }],
      basements: ['basement-real-1'],
      physical_zones: ['outdoor-real-1'],
    }))
    expect(generationCall.operation.scope).not.toHaveProperty('basement_object_id')
    expect(generationCall.operation.scope).not.toHaveProperty('physical_zone_object_id')
    expect(generationCall.operation.scope.scope_combos[0]).not.toHaveProperty('physical_zone_object_id')
  })

  it('normalizes generated WBS hierarchy rows before omitting summary execution facts', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'summary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '鍦板熀涓庡熀纭€',
            wbs_node_type: 'sub_division',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: {},
          },
        },
        {
          clientRowId: 'summary-child-row',
          parentClientRowId: 'summary-row',
          sortOrder: 2,
          predecessorClientRowIds: ['summary-row'],
          predecessorDependencies: [{
            clientRowId: 'summary-row',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'dependency_intent_template',
          }],
          values: {
            title: '鍦板熀涓庡熀纭€鏂藉伐',
            wbs_node_type: 'sub_division',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: {},
          },
        },
      ]),
      governanceWarnings: [],
      candidateNetworkEvaluation: makeCandidateNetworkEvaluation(
        ['summary-row', 'summary-child-row'],
        { projectedNetworkSpanDays: 10, previewEdgeCount: 1 },
      ),
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })
    expect(response.status, JSON.stringify(response.body)).toBe(201)

    const createPayload = mocks.createTaskInMainChain.mock.calls[0]?.[0] as Record<string, unknown>
    expect(createPayload).toEqual(expect.objectContaining({
      title: '鍦板熀涓庡熀纭€',
      is_wbs_summary: true,
      is_executable: false,
    }))
    expect(createPayload).not.toHaveProperty('progress')
    expect(createPayload).not.toHaveProperty('status')
    expect(createPayload).not.toHaveProperty('actual_start')
    expect(createPayload).not.toHaveProperty('actual_end')
    const promotedLeafPayload = mocks.createTaskInMainChain.mock.calls[1]?.[0] as Record<string, unknown>
    expect(promotedLeafPayload).toEqual(expect.objectContaining({
      title: '鍦板熀涓庡熀纭€鏂藉伐',
      is_wbs_summary: false,
      is_executable: true,
      progress: 0,
      status: 'todo',
    }))
  })

  it('rolls WBS summary row dates up from duration-asset-adjusted child rows before commit', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'summary-row',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '主体结构',
            wbs_node_type: 'sub_division',
            is_wbs_summary: true,
            is_executable: false,
            row_projection_mode: 'schedule_row',
            duration_contribution_mode: 'record_only',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: {},
          },
        },
        {
          clientRowId: 'child-row',
          parentClientRowId: 'summary-row',
          sortOrder: 2,
          predecessorDependencies: [],
          values: {
            title: '主体结构施工',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: {
              durationAssetCalculation: {
                selectedDurationDays: 12,
                baseSelectedDurationDays: 10,
                standardWorkDurationSeedStableCode: 'STD-STRUCTURE-MAIN',
                standardWorkDurationSeedResolverSource: 'runtime_seed_registry',
              },
            },
          },
        },
      ]),
      durationAssetUtilizationSummary: {
        scheduleRowCount: 1,
        standardWorkDurationSeedRowCount: 1,
        t2RhythmTemplateRowCount: 1,
        runtimeReferenceDaysRowCount: 1,
        dependencyAssetConsumedRowCount: 1,
        constructionCalendarRowCount: 1,
        processSeasonalDurationAssetRowCount: 1,
        rowsMissingDurationAssetCount: 0,
        rowsMissingT2RhythmTemplateCount: 0,
        rowsMissingRuntimeReferenceDaysCount: 0,
      },
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })
    mocks.createTaskInMainChain.mockReset()
    mocks.createTaskInMainChain
      .mockResolvedValueOnce({ task: { id: 'summary-task', title: '主体结构' } })
      .mockResolvedValueOnce({ task: { id: 'child-task', title: '主体结构施工' } })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload(),
      })
      .expect(201)

    expect(response.body.data.generation.candidateDurationAssetPreview).toEqual(expect.objectContaining({
      summaryRollupRowCount: 1,
      summaryRollupRows: expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'summary-row',
          title: '主体结构',
          previousPlannedStartDate: '2026-06-01',
          previousPlannedEndDate: '2026-06-10',
          plannedStartDate: '2026-06-01',
          plannedEndDate: '2026-06-12',
          childRowCount: 1,
          evidenceLevel: 'candidate_duration_asset_summary_rollup_l1',
          applicationStatus: 'duration_asset_summary_rollup_applied_to_candidate_summary_row',
          mutationBoundary: 'wizard_generated_summary_plan_date_write_only_no_duration_runtime_write_no_seed_write_no_production_claim',
        }),
      ]),
    }))
    expect(response.body.data.generation).not.toHaveProperty('projectManagerReviewPackage')
    expect(response.body.data.generation.planQualityDiagnostics).toEqual(expect.objectContaining({
      runtimeApprovalRequired: false,
      blocksWizardCommit: false,
    }))

    const summaryPayload = mocks.createTaskInMainChain.mock.calls[0]?.[0] as Record<string, unknown>
    const childPayload = mocks.createTaskInMainChain.mock.calls[1]?.[0] as Record<string, unknown>
    expect(childPayload).toEqual(expect.objectContaining({
      title: '主体结构施工',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-12',
      start_date: '2026-06-01',
      end_date: '2026-06-12',
    }))
    expect(summaryPayload).toEqual(expect.objectContaining({
      title: '主体结构',
      planned_start_date: '2026-06-01',
      planned_end_date: '2026-06-12',
      start_date: '2026-06-01',
      end_date: '2026-06-12',
      standard_task_metadata: expect.objectContaining({
        wizardDurationAssetSummaryRollup: expect.objectContaining({
          source: 'wizard_duration_asset_summary_rollup',
          childRowCount: 1,
          previousPlannedEndDate: '2026-06-10',
          plannedEndDate: '2026-06-12',
          windowPolicy: 'minimum_window_expand_only',
          mutationBoundary: 'wizard_generated_summary_plan_date_write_only_no_duration_runtime_write_no_seed_write_no_production_claim',
        }),
      }),
    }))
    expect(summaryPayload).not.toHaveProperty('progress')
    expect(summaryPayload).not.toHaveProperty('status')
  })

  it('uses materialized generation scope as fallback before committing generated executable rows without object ids', async () => {
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: {
        basement_1: 'basement-real-1',
      },
      enrichedScopeTree: [
        { id: 'basement_1', objectId: 'basement-real-1', type: 'basement', name: '鍦颁笅瀹?', metadata: { basementLevelCount: 1, childrenComplete: true }, children: [] },
      ],
      materializedObjects: [],
      generationScope: {
        basements: ['basement-real-1'],
        scope_objects: [
          { id: 'basement-real-1', type: 'basement', name: '鍦颁笅瀹?', parentId: null, metadata: { basementLevelCount: 1 } },
        ],
        scope_combos: [
          { basement_object_id: 'basement-real-1' },
        ],
      },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'process-row-without-object-scope',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '鍦颁笅瀹ら槻姘存柦宸?',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            business_type: 'renovation',
            standard_task_metadata: {},
          },
        },
      ]),
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'renovation',
          businessSubtype: 'renovation_energy',
          scopeTree: [
            { id: 'basement_1', type: 'basement', name: '鍦颁笅瀹?', metadata: { basementLevelCount: 1, childrenComplete: true }, children: [] },
          ],
        }),
      })
      .expect(201)

    const createPayload = mocks.createTaskInMainChain.mock.calls[0]?.[0] as Record<string, unknown>
    expect(createPayload).toEqual(expect.objectContaining({
      title: '鍦颁笅瀹ら槻姘存柦宸?',
      basement_object_id: 'basement-real-1',
    }))
  })

  it('previews missing template scope assignment targets as WBS readiness issues', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [],
      governanceWarnings: [
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'OUT-02-01-01',
          details: {
            targetObjectType: 'physical_zone',
            missingObjectLabel: '瀹ゅ鎬诲钩',
          },
        },
      ],
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 26,
            },
            children: [],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(response.body.data.profile.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        severity: 'blocking',
        scopeName: '瀹ゅ鎬诲钩',
        source: 'template_scope_assignment',
        details: expect.objectContaining({
          targetObjectType: 'physical_zone',
          missingObjectLabel: '瀹ゅ鎬诲钩',
        }),
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeName: '瀹ゅ鎬诲钩',
        status: 'missing_required_scope',
        objectType: 'physical_zone',
        requiredByTemplates: expect.arrayContaining(['OUT-02-01-01']),
      }),
    ]))
  })

  it('does not preflight-block optional independent engineering zones from a full-template trigger', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-plumbing-heating-system'],
      triggeredItemPacks: ['china-plumbing-heating-system'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 40, standard: 120, detailed: 360 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'PLU-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'waste_room',
          },
          priority: 1,
        },
      ],
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 3,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(response.body.data.profile.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        details: expect.objectContaining({
          itemPackPattern: 'PLU-05-01-01',
        }),
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.summary.missingRequiredScopeCount).toBe(0)
    expect(response.body.data.profile.scopeTemplateCoverage.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'missing_required_scope',
        requiredByTemplates: expect.arrayContaining(['PLU-05-01-01']),
      }),
    ]))
  })

  it('still preflight-blocks optional independent engineering zones when their item pack is directly triggered', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-plumbing-heating-system'],
      triggeredItemPacks: ['PLU-05-01-01'],
      triggeredItemPackSources: {
        'PLU-05-01-01': ['explicit_user_selection'],
      },
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 40, standard: 120, detailed: 360 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'PLU-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'waste_room',
          },
          priority: 1,
        },
      ],
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 3,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(response.body.data.profile.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        severity: 'blocking',
        source: 'template_scope_assignment',
        details: expect.objectContaining({
          itemPackPattern: 'PLU-05-01-01',
          targetObjectType: 'physical_zone',
          matchMetadata: expect.objectContaining({
            physicalCategory: 'waste_room',
          }),
        }),
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'missing_required_scope',
        objectType: 'physical_zone',
        requiredByTemplates: expect.arrayContaining(['PLU-05-01-01']),
      }),
    ]))
  })

  it('filters generated full-template optional independent-zone warnings from preview coverage', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-plumbing-heating-system'],
      triggeredItemPacks: ['china-plumbing-heating-system'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 40, standard: 120, detailed: 360 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'PLU-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'waste_room',
          },
          priority: 1,
        },
      ],
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [],
      governanceWarnings: [
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'PLU-05-01-01',
          details: {
            itemPackPattern: 'PLU-05-01-01',
            effect: 'assign_to_scope_object',
            targetObjectType: 'physical_zone',
            matchMetadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'waste_room',
            },
            missingObjectLabel: '垃圾房',
            matchedRowCount: 4,
            matchedStableCodes: ['PLU-05-01-01'],
          },
        },
      ],
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 3,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(response.body.data.profile.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        details: expect.objectContaining({
          itemPackPattern: 'PLU-05-01-01',
        }),
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.summary.missingRequiredScopeCount).toBe(0)
  })

  it('does not block catalog-carried optional independent engineering zone item packs', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-electrical-system', 'china-plumbing-heating-system', 'china-cecs-fire-system'],
      triggeredItemPacks: [
        'china-electrical-system',
        'china-plumbing-heating-system',
        'china-cecs-fire-system',
        'ELE-05-01-01',
        'PLU-02-01-02',
        'FIR-05-01-02',
        'PLU-05-01-01',
      ],
      triggeredItemPackSources: {
        'ELE-05-01-01': ['template_catalog'],
        'PLU-02-01-02': ['template_catalog'],
        'FIR-05-01-02': ['template_catalog'],
        'PLU-05-01-01': ['template_catalog'],
      },
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 40, standard: 120, detailed: 360 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'switching_station',
          },
          priority: 1,
        },
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'substation',
          },
          priority: 1,
        },
        {
          itemPackPattern: 'PLU-02-01-02|FIR-05-01-02',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'fire_pump_room',
          },
          priority: 1,
        },
        {
          itemPackPattern: 'PLU-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'waste_room',
          },
          priority: 1,
        },
      ],
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [],
      governanceWarnings: [
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'ELE-05-01-01',
          details: {
            itemPackPattern: 'ELE-05-01-01',
            effect: 'assign_to_scope_object',
            targetObjectType: 'physical_zone',
            matchMetadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'switching_station',
            },
            missingObjectLabel: '开闭所',
          },
        },
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'ELE-05-01-01',
          details: {
            itemPackPattern: 'ELE-05-01-01',
            effect: 'assign_to_scope_object',
            targetObjectType: 'physical_zone',
            matchMetadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'substation',
            },
            missingObjectLabel: '变配电所',
          },
        },
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'PLU-02-01-02',
          details: {
            itemPackPattern: 'PLU-02-01-02|FIR-05-01-02',
            effect: 'assign_to_scope_object',
            targetObjectType: 'physical_zone',
            matchMetadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'fire_pump_room',
            },
            missingObjectLabel: '消防泵房',
          },
        },
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'PLU-05-01-01',
          details: {
            itemPackPattern: 'PLU-05-01-01',
            effect: 'assign_to_scope_object',
            targetObjectType: 'physical_zone',
            matchMetadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'waste_room',
            },
            missingObjectLabel: '垃圾房',
          },
        },
      ],
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 3,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(response.body.data.profile.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SCOPE_WBS_READINESS_MISSING' }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.summary.missingRequiredScopeCount).toBe(0)
    expect(response.body.data.profile.scopeTemplateCoverage.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'missing_required_scope' }),
    ]))
  })

  it('still blocks directly triggered independent engineering zones when no variant target exists', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-electrical-system'],
      triggeredItemPacks: ['ELE-05-01-01'],
      triggeredItemPackSources: {
        'ELE-05-01-01': ['explicit_user_selection'],
      },
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 40, standard: 120, detailed: 360 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'switching_station',
          },
          priority: 1,
        },
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'substation',
          },
          priority: 1,
        },
      ],
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 3,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(response.body.data.profile.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        details: expect.objectContaining({
          itemPackPattern: 'ELE-05-01-01',
          matchMetadata: expect.objectContaining({
            physicalSpaceKind: 'independent_engineering_zone',
          }),
        }),
      }),
    ]))
  })

  it('does not report sibling independent-zone variants that share the same item pack', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-electrical-system'],
      triggeredItemPacks: ['ELE-05-01-01'],
      triggeredItemPackSources: {
        'ELE-05-01-01': ['physical_scope'],
      },
      triggeredItemPackScopeTargets: {
        'ELE-05-01-01': ['switching_station'],
      },
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 40, standard: 120, detailed: 360 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'switching_station',
          },
          priority: 1,
        },
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'substation',
          },
          priority: 1,
        },
      ],
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 3,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(response.body.data.profile.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        details: expect.objectContaining({
          itemPackPattern: 'ELE-05-01-01',
          matchMetadata: expect.objectContaining({
            physicalCategory: 'switching_station',
          }),
        }),
      }),
    ]))
    expect(response.body.data.profile.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_WBS_READINESS_MISSING',
        details: expect.objectContaining({
          matchMetadata: expect.objectContaining({
            physicalCategory: 'substation',
          }),
        }),
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeName: '变配电所',
        status: 'missing_required_scope',
      }),
    ]))
  })

  it('previews which project spaces can be automatically scheduled and which need manual task supplements', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-gb55032-template', 'china-gb55032-2022-outdoor', 'china-electrical-system'],
      triggeredItemPacks: ['china-gb55032-template', 'china-gb55032-2022-outdoor', 'ELE-05-01-01'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 120, standard: 420, detailed: 1500 },
      scopeAssignmentRules: [
        { itemPackPattern: 'OUT-', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'outdoor_site' }, priority: 1 },
        { itemPackPattern: 'ELE-05-01-01', effect: 'assign_to_scope_object', targetObjectType: 'physical_zone', matchMetadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' }, priority: 1 },
      ],
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: '浣忓畢妤?',
              standardFloorCount: 26,
              childrenComplete: true,
            },
            children: [
              {
                id: 'floor-1',
                type: 'floor',
                name: 'L1',
                metadata: { floorOrder: 1 },
                children: [],
              },
            ],
          },
          {
            id: 'basement-1',
            type: 'basement',
            name: '鍦颁笅瀹?',
            metadata: { basementLevelCount: 2, childrenComplete: true },
            children: [],
          },
          {
            id: 'outdoor-1',
            type: 'physical_zone',
            name: '瀹ゅ鎬诲钩',
            metadata: { physicalSpaceKind: 'outdoor_site', physicalCategory: 'outdoor_site_plan', childrenComplete: true },
            children: [],
          },
          {
            id: 'switching-1',
            type: 'physical_zone',
            name: '寮€闂墍',
            metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station', childrenComplete: true },
            children: [],
          },
          {
            id: 'yard-1',
            type: 'physical_zone',
            name: '涓磋鍔犲伐鍖?',
            metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'temporary_yard', childrenComplete: true },
            children: [],
          },
        ],
      }))
      .expect(200)

    expect(response.body.data.profile.scopeTemplateCoverage.summary).toEqual(expect.objectContaining({
      autoSchedulableCount: expect.any(Number),
      manualTaskRequiredCount: 1,
      missingRequiredScopeCount: 0,
    }))
    expect(response.body.data.profile.scopeTemplateCoverage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeName: '1#妤?',
        status: 'auto_schedulable',
        objectType: 'building',
      }),
      expect.objectContaining({
        scopeName: '瀹ゅ鎬诲钩',
        status: 'auto_schedulable',
        objectType: 'physical_zone',
        matchedRulePatterns: expect.arrayContaining(['OUT-']),
      }),
      expect.objectContaining({
        scopeName: '寮€闂墍',
        status: 'auto_schedulable',
        matchedRulePatterns: expect.arrayContaining(['ELE-05-01-01']),
      }),
      expect.objectContaining({
        scopeName: '涓磋鍔犲伐鍖?',
        status: 'manual_task_required',
        objectType: 'physical_zone',
      }),
    ]))
  })

  it('previews supported TOD independent engineering zones as automatic WBS attachment targets', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-tod-upper-cover-specialty'],
      triggeredItemPacks: ['TOD-01-01-02', 'TOD-04-01-08', 'TOD-04-01-09'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      expectedRowCount: { overview: 80, standard: 180, detailed: 420 },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'TOD-01-01-02|TOD-04-01-08|TOD-04-01-09',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'railway_operation_zone',
          },
          priority: 1,
        },
      ],
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'tod_upper_cover',
        projectFeatures: {},
        scopeTree: [
          {
            id: 'phase-1',
            type: 'phase',
            name: '涓€鏈?',
            children: [
              {
                id: 'section-1',
                type: 'section',
                name: '涓€鏍囨',
                children: [
                  {
                    id: 'railway-zone-1',
                    type: 'physical_zone',
                    name: '杞ㄨ鍖?',
                    metadata: {
                      physicalSpaceKind: 'independent_engineering_zone',
                      physicalCategory: 'railway_operation_zone',
                      templateSupport: 'supported',
                      childrenComplete: true,
                    },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }))
      .expect(200)

    const generationCall = mocks.generateWbsTemplateRows.mock.calls.at(-1)?.[0] as any
    expect(generationCall.operation.scope.scope_objects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'railway-zone-1',
        type: 'physical_zone',
        name: '杞ㄨ鍖?',
        metadata: expect.objectContaining({
          physicalSpaceKind: 'independent_engineering_zone',
          physicalCategory: 'railway_operation_zone',
        }),
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scopeName: '杞ㄨ鍖?',
        status: 'auto_schedulable',
        matchedRulePatterns: ['TOD-01-01-02|TOD-04-01-08|TOD-04-01-09'],
      }),
    ]))
    expect(response.body.data.profile.scopeTemplateCoverage.summary).toEqual(expect.objectContaining({
      manualTaskRequiredCount: 0,
      missingRequiredScopeCount: 0,
    }))
    expect(response.body.data.profile.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SCOPE_WBS_READINESS_MISSING' }),
    ]))
  })

  it('keeps profile preview usable and flags incomplete WBS simulation when lightweight generation fails', async () => {
    mocks.generateWbsTemplateRows.mockRejectedValueOnce(new Error('preview generation timed out'))

    const response = await request(buildApp())
      .post('/api/projects/wizard/preview')
      .send(makeWizardPayload({
        mode: 'new',
        businessType: 'general_civil',
        businessSubtype: 'civil_residential',
        scopeTree: [
          {
            id: 'building-1',
            type: 'building',
            name: '1#妤?',
            metadata: {
              functionalUsage: 'residential_tower',
              standardFloorCount: 26,
              childrenComplete: true,
            },
            children: [],
          },
          {
            id: 'outdoor-1',
            type: 'physical_zone',
            name: '瀹ゅ鎬诲钩',
            metadata: {
              physicalSpaceKind: 'outdoor_site',
              physicalCategory: 'outdoor_site_plan',
              childrenComplete: true,
            },
            children: [],
          },
        ],
      }))
      .expect(200)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(response.body.data.targetFeasibility).toBeNull()
    expect(response.body.data.profile.scopeTemplateCoverage.summary.autoSchedulableCount).toBeGreaterThan(0)
    expect(response.body.data.profile.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'WBS_PREVIEW_UNAVAILABLE',
        severity: 'warning',
        source: 'wbs_preview',
        message: expect.stringContaining('preview generation timed out'),
      }),
    ]))
  })

  it('blocks committing WBS generation when the physical scope model is not configured enough for template assignment', async () => {
    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '1#妤?',
              metadata: {
                functionalUsage: '浣忓畢妤?',
                childrenComplete: false,
              },
              children: [],
            },
          ],
        }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'SCOPE_MODEL_NOT_READY_FOR_WBS',
      message: expect.stringContaining('1#妤?'),
    }))
    expect(response.body.error.details.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'BUILDING_NOT_CONFIGURED',
        source: 'scope_model',
        scopeName: '1#妤?',
        details: expect.objectContaining({
          objectType: 'building',
          childrenComplete: false,
        }),
      }),
    ]))
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('blocks committing generated rows when template scope assignment targets are missing', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: [
        {
          clientRowId: 'row-outdoor',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '瀹ゅ閬撹矾鏂藉伐',
            status: 'not_started',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
          },
        },
      ],
      governanceWarnings: [
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'error',
          nodeCode: 'OUT-02-01-01',
          message: 'Required outdoor site scope object was not found.',
          details: {
            targetObjectType: 'physical_zone',
            missingObjectLabel: '瀹ゅ鎬诲钩',
          },
        },
      ],
      targetFeasibility: null,
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '1#妤?',
              metadata: {
                functionalUsage: '浣忓畢妤?',
                childrenComplete: true,
                decompositionMode: 'by_floor',
              },
              children: [
                {
                  id: 'floor-1',
                  type: 'floor',
                  name: 'L1',
                  metadata: { floorOrder: 1, floorUsage: 'standard' },
                  children: [],
                },
              ],
            },
          ],
        }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'SCOPE_MODEL_NOT_READY_FOR_WBS',
      message: expect.stringContaining('瀹ゅ鎬诲钩'),
    }))
    expect(response.body.error.details.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TEMPLATE_SCOPE_TARGET_MISSING',
        source: 'template_scope_assignment',
        scopeName: '瀹ゅ鎬诲钩',
        details: expect.objectContaining({
          nodeCode: 'OUT-02-01-01',
          targetObjectType: 'physical_zone',
          missingObjectLabel: '瀹ゅ鎬诲钩',
        }),
      }),
    ]))
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('does not block commit on a full-template optional independent-zone warning', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-plumbing-heating-system'],
      triggeredItemPacks: ['china-plumbing-heating-system'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      scopeAssignmentRules: [
        {
          itemPackPattern: 'PLU-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'waste_room',
          },
          priority: 1,
        },
      ],
      expectedRowCount: { overview: 20, standard: 60, detailed: 180 },
    })
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: { 'building-1': 'building-real-1' },
      enrichedScopeTree: [
        {
          id: 'building-1',
          objectId: 'building-real-1',
          type: 'building',
          name: 'Building 1',
          metadata: { functionalUsage: 'residential', standardFloorCount: 3, childrenComplete: true },
          children: [
            {
              id: 'floor-1',
              objectId: 'floor-real-1',
              type: 'floor',
              name: 'L1',
              metadata: { floorOrder: 1, floorUsage: 'standard' },
              children: [],
            },
          ],
        },
      ],
      materializedObjects: [],
      generationScope: {
        buildings: ['building-real-1'],
        scope_objects: [
          {
            id: 'building-real-1',
            type: 'building',
            name: 'Building 1',
            metadata: { functionalUsage: 'residential', standardFloorCount: 3, childrenComplete: true },
          },
          {
            id: 'floor-real-1',
            type: 'floor',
            name: 'L1',
            parent_object_id: 'building-real-1',
            metadata: { floorOrder: 1, floorUsage: 'standard' },
          },
        ],
        scope_combos: [
          { building_object_id: 'building-real-1', floor_object_id: 'floor-real-1' },
        ],
      },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-plumbing-main',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: 'Plumbing main work',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: { stableCode: 'PLU-01-01-01' },
          },
        },
      ]),
      governanceWarnings: [
        {
          code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
          severity: 'warning',
          nodeCode: 'PLU-05-01-01',
          message: 'Optional waste room scope object was not found.',
          details: {
            itemPackPattern: 'PLU-05-01-01',
            effect: 'assign_to_scope_object',
            targetObjectType: 'physical_zone',
            matchMetadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'waste_room',
            },
            missingObjectLabel: 'waste room',
            matchedRowCount: 4,
            matchedStableCodes: ['PLU-05-01-01'],
          },
        },
      ],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          projectFeatures: {},
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: 'Building 1',
              metadata: {
                functionalUsage: 'residential',
                standardFloorCount: 3,
                childrenComplete: true,
              },
              children: [
                {
                  id: 'floor-1',
                  type: 'floor',
                  name: 'L1',
                  metadata: { floorOrder: 1, floorUsage: 'standard' },
                  children: [],
                },
              ],
            },
          ],
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(response.body.success).toBe(true)
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledTimes(1)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(1)
  })

  it('does not preflight-block a residential commit just because a triggered template also contains commercial building rules', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-jgj-tianjin-decoration'],
      triggeredItemPacks: ['china-jgj-tianjin-decoration'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      scopeAssignmentRules: [
        {
          itemPackPattern: 'DEC-05',
          effect: 'assign_to_matching_buildings',
          matchFunctionalUsage: '鍟嗕笟',
          priority: 2,
        },
        {
          itemPackPattern: 'facade',
          effect: 'assign_to_matching_buildings',
          matchFunctionalUsage: '鍐欏瓧妤?',
          priority: 2,
        },
      ],
      expectedRowCount: { overview: 20, standard: 60, detailed: 180 },
    })
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: { 'building-1': 'building-real-1' },
      enrichedScopeTree: [
        {
          id: 'building-1',
          objectId: 'building-real-1',
          type: 'building',
          name: '1#妤?',
          metadata: { functionalUsage: '浣忓畢妤?', standardFloorCount: 18, childrenComplete: true },
          children: [],
        },
      ],
      materializedObjects: [],
      generationScope: {
        buildings: ['building-real-1'],
        scope_objects: [
          {
            id: 'building-real-1',
            type: 'building',
            name: '1#妤?',
            metadata: { functionalUsage: '浣忓畢妤?', standardFloorCount: 18, childrenComplete: true },
          },
        ],
        scope_combos: [
          { building_object_id: 'building-real-1' },
        ],
      },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-residential-decoration',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: '浣忓畢瀹ゅ唴瑁呴グ',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: {},
          },
        },
      ]),
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          projectFeatures: {},
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '1#妤?',
              metadata: {
                functionalUsage: '浣忓畢妤?',
                standardFloorCount: 18,
                childrenComplete: true,
              },
              children: [],
            },
          ],
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(1)
  })

  it('does not preflight-block optional independent engineering zone variants once one target exists', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-electrical-system'],
      triggeredItemPacks: ['ELE-05-01-01'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      scopeAssignmentRules: [
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'switching_station',
          },
          priority: 1,
        },
        {
          itemPackPattern: 'ELE-05-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'substation',
          },
          priority: 1,
        },
      ],
      expectedRowCount: { overview: 20, standard: 60, detailed: 180 },
    })
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: { 'switching-draft-1': 'switching-real-1' },
      enrichedScopeTree: [
        {
          id: 'switching-draft-1',
          objectId: 'switching-real-1',
          type: 'physical_zone',
          name: 'Switching station',
          metadata: {
            physicalSpaceKind: 'independent_engineering_zone',
            physicalCategory: 'switching_station',
            childrenComplete: true,
          },
          children: [],
        },
      ],
      materializedObjects: [],
      generationScope: {
        scope_objects: [
          {
            id: 'switching-real-1',
            type: 'physical_zone',
            name: 'Switching station',
            metadata: {
              physicalSpaceKind: 'independent_engineering_zone',
              physicalCategory: 'switching_station',
              childrenComplete: true,
            },
          },
        ],
      },
    })
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      rows: withCandidatePlanQualityAssets([
        {
          clientRowId: 'row-electrical-switching',
          parentClientRowId: null,
          sortOrder: 1,
          predecessorDependencies: [],
          values: {
            title: 'Switching station electrical handover',
            wbs_node_type: 'process',
            is_wbs_summary: false,
            is_executable: true,
            row_projection_mode: 'schedule_row',
            physical_zone_object_id: 'switching-real-1',
            start_date: '2026-06-01',
            end_date: '2026-06-10',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-10',
            progress: 0,
            status: 'todo',
            standard_task_metadata: { stableCode: 'ELE-05-01-01-P10' },
          },
        },
      ]),
      governanceWarnings: [],
      targetFeasibility: null,
      onboardingSummary: { history: 0, in_progress: 0, future: 1 },
    })

    await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          mode: 'new',
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          projectFeatures: { independentEngineeringZones: 1 },
          scopeTree: [
            {
              id: 'switching-draft-1',
              type: 'physical_zone',
              name: 'Switching station',
              metadata: {
                physicalSpaceKind: 'independent_engineering_zone',
                physicalCategory: 'switching_station',
                childrenComplete: true,
              },
              children: [],
            },
          ],
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(201)

    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(1)
  })

  it('blocks committing before WBS generation when triggered template packs require missing scope targets', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-foundation-pit-pile'],
      triggeredItemPacks: ['china-waterproof-insulation', 'WPI-01-01-01'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      scopeAssignmentRules: [
        {
          itemPackPattern: 'WPI-01-01-0[14567]',
          effect: 'assign_to_scope_object',
          targetObjectType: 'basement',
          priority: 1,
        },
      ],
      expectedRowCount: { overview: 20, standard: 60, detailed: 180 },
    })
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: {},
      enrichedScopeTree: [],
      materializedObjects: [],
      generationScope: { scope_objects: [] },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'residential',
          businessSubtype: undefined,
          projectFeatures: {},
          totalAreaM2: 1200,
          basementLevelCount: 1,
          scopeTree: [],
          mode: 'new',
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(422)

    expect(response.body.success).toBe(false)
    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'SCOPE_MODEL_NOT_READY_FOR_WBS',
      message: expect.stringContaining('地下室'),
    }))
    expect(response.body.error.details.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TEMPLATE_SCOPE_TARGET_MISSING',
        details: expect.objectContaining({
          itemPackPattern: 'WPI-01-01-0[14567]',
          missingObjectLabel: '地下室',
        }),
      }),
    ]))
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('blocks committing before WBS generation when a triggered template contains nodes that require missing scope targets', async () => {
    mocks.buildTemplateRecommendation.mockReturnValueOnce({
      matchedTemplates: ['china-waterproof-insulation'],
      triggeredItemPacks: ['china-waterproof-insulation'],
      triggeredDangerItems: [],
      triggeredMilestones: [],
      scopeAssignmentRules: [
        {
          itemPackPattern: 'WPI-01-01-0[14567]',
          effect: 'assign_to_scope_object',
          targetObjectType: 'basement',
          priority: 1,
        },
      ],
      expectedRowCount: { overview: 20, standard: 60, detailed: 180 },
    })
    mocks.materializeWizardScopeTree.mockResolvedValueOnce({
      objectIdByDraftId: {},
      enrichedScopeTree: [
        {
          id: 'building-1',
          type: 'building',
          name: '鏃㈡湁寤虹瓚',
          metadata: { functionalUsage: '鏃㈡湁寤虹瓚', standardFloorCount: 3, childrenComplete: true },
          children: [],
        },
      ],
      materializedObjects: [],
      generationScope: {
        scope_objects: [
          {
            id: 'building-1',
            type: 'building',
            name: '鏃㈡湁寤虹瓚',
            metadata: { functionalUsage: '鏃㈡湁寤虹瓚', standardFloorCount: 3, childrenComplete: true },
          },
        ],
      },
    })

    const response = await request(buildApp())
      .post('/api/projects/wizard')
      .send({
        companyId: 'company-1',
        commit: true,
        wizardPayload: makeWizardPayload({
          businessType: 'renovation',
          businessSubtype: 'renovation_energy',
          projectFeatures: {},
          totalAreaM2: 1200,
          scopeTree: [
            {
              id: 'building-1',
              type: 'building',
              name: '鏃㈡湁寤虹瓚',
              metadata: {
                functionalUsage: '鏃㈡湁寤虹瓚',
                standardFloorCount: 3,
                childrenComplete: true,
              },
              children: [],
            },
          ],
          mode: 'new',
          onboardingSubstage: undefined,
          onboardingPassedMilestones: [],
        }),
      })
      .expect(422)

    expect(response.body.error).toEqual(expect.objectContaining({
      code: 'SCOPE_MODEL_NOT_READY_FOR_WBS',
      message: expect.stringContaining('地下室'),
    }))
    expect(response.body.error.details.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TEMPLATE_SCOPE_TARGET_MISSING',
        details: expect.objectContaining({
          itemPackPattern: 'WPI-01-01-0[14567]',
          triggeredByTemplateId: 'china-waterproof-insulation',
          missingObjectLabel: '地下室',
        }),
      }),
    ]))
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('keeps import results in wizard_required flow instead of directly creating tasks', async () => {
    const response = await request(buildApp())
      .post('/api/projects/import/excel')
      .send({
        fileType: 'xlsx',
        rows: [
          { title: '浠诲姟 A', start_date: '2026-06-01', unknown_field: 'x' },
          { start_date: '2026-06-02' },
        ],
      })
      .expect(200)

    expect(response.body.data).toMatchObject({
      fileType: 'xlsx',
      totalRows: 2,
      validRows: 1,
      nextStep: 'wizard_required',
    })
    expect(response.body.data.unmappedColumns).toContain('unknown_field')
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('returns Chinese milestone presets for wizard starting-line step', async () => {
    const response = await request(buildApp())
      .get('/api/milestone-presets?businessType=hospital&mainStage=decoration')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'cleanroom_acceptance', label: expect.any(String), required: true }),
      expect.objectContaining({ code: 'medical_gas_acceptance', label: expect.any(String), required: true }),
    ]))
  })
})
