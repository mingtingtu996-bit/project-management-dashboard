// v1.4.22.1 §14: Project wizard endpoints — create, draft, preview, rollback, import
import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { ensureDefaultCompanyForUser, getCurrentCompanyMembership, getProjectPermissionLevel } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { getClient, query as rawQuery } from '../database.js'
import { createTasksInWizardBatch } from '../services/taskWriteChainService.js'
import { executeProjectCreationUnderCommercialGuard } from '../services/commercialTransactionService.js'
import { createDurationRuntimeConsumerObservationQueryExec } from '../services/durationRuntimeConsumerObservationService.js'
import { recordAcceptancePlanExecutionFacts } from '../services/acceptancePlanExecutionFactService.js'
import { normalizeDurationRiskDistributionDto } from '../services/durationMetricService.js'
import { deriveWbsFlags, type WbsNodeType } from '../services/wbsSemanticService.js'
import { replaceWizardGeneratedTaskDependenciesBatch } from '../services/taskStandardModelService.js'
import {
  CHINA_GB55032_TEMPLATE_ID,
  buildCandidateNetworkEvaluationFromGeneratedDependencies,
  generateWbsTemplateRows,
  recordWbsTemplateGenerationRuntimeConsumption,
  type GeneratedTemplateDependency,
  type GeneratedTemplateRow,
  type GeneratedTargetFeasibility,
  type WbsTemplateGenerationRuntimeArtifactPublication,
} from '../services/wbsTemplateGenerationService.js'
import {
  persistDurationLearningRuntimeConsumptions,
} from '../services/durationLearningRuntimeConsumptionService.js'
import {
  buildSpecialWorkDurationCandidateNodes,
} from '../services/wbsTemplateCandidateEventService.js'
import {
  buildGeneratedDurationPredictionOutboxEvents,
  buildWbsCandidateOutboxEvent,
  enqueueDurationLearningRuntimeEvidenceBatch,
} from '../services/durationLearningRuntimeEvidenceOutboxService.js'
import {
  analyzeExecutableDefaultMasterPlanNetwork,
  analyzeExecutableDefaultMasterPlanSchedulePropagation,
  countExecutableDefaultMasterPlanMethodConflicts,
  isExecutableDurationAssetSemanticallyCompatible,
} from '../services/defaultMasterPlanExecutableAssemblyService.js'
import {
  resolveNextWizardGeneratedSortOrder,
  summarizeWizardDurationAssetCandidates,
  summarizeWizardExecutablePreviewRows,
} from '../services/wizardGenerationSummaryService.js'
import {
  buildTemplateRecommendation,
  type DetailLevel,
  type ProjectGenerationFacts,
  type TemplateRecommendation,
  type TriggeredItemPackSource,
} from '../services/projectFactsToTemplateService.js'
import {
  buildWizardTemplateSelection,
  findWizardStableCodeMatchingTemplateId,
  type WizardTemplateSelection,
} from '../services/wizardTemplateSelectionService.js'
import {
  buildDraftWizardGenerationScope,
  materializeWizardScopeTree,
} from '../services/wizardScopeMaterializationService.js'
import {
  createWizardCandidateBaselineDraft,
  type WizardCandidateBaselineDraft,
} from '../services/wizardCandidateBaselineService.js'
import { buildScopeOrganizationFactsFromObjects } from '../services/scopeOrganizationFactsService.js'
import {
  assertScopeGenerationReadiness,
  evaluateGeneratedTemplateScopeReadiness,
  evaluateScopeGenerationReadiness,
  type ScopeGenerationReadinessIssue,
} from '../services/scopeGenerationReadinessService.js'
import { evaluateScopeTemplateCoverage } from '../services/scopeTemplateCoverageService.js'
import {
  businessTypeRequiresSubtype,
  getBusinessTypeRecommendation,
  isBusinessSubtypeForType,
} from '../services/projectTypeRecommendations.js'
import { FEATURE_TO_ITEM_PACK_MAP } from '../services/projectFeatureToItemPackMap.js'
import { writeChangeLog } from '../services/changeAuditService.js'
import { buildProjectGenerationFactsSnapshot } from '../services/projectGenerationFactsSnapshotService.js'
import {
  buildConstructionOrganizationSelectorInputFromProjectFacts,
  ensureConstructionOrganizationDecisionReportProductCloseoutReadiness,
  selectConstructionOrganizationScenario,
  type ConstructionOrganizationScenarioSelection,
} from '../services/constructionOrganizationScenarioSelector.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutProgressForProject,
  type ConstructionOrganizationProductOutcomeCloseoutProgress,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildWizardCriticalPathRefreshSummary,
  createPendingWizardPostCommitDerivationState,
  recordWizardConstructionOrganizationRuntimeEvidence,
  refreshWizardCriticalPathAfterCommit,
  runWizardPostCommitDerivations,
  type WizardPostCommitDerivationState,
} from '../services/wizardPostCommitDerivationRecoveryService.js'
import {
  addConstructionProductionDays,
  parseConstructionCalendarDate,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from '../services/constructionCalendar.js'
import {
  evaluateBaselineTargetAlignment,
  type ScheduleAccelerationMode,
  type ScheduleAccelerationRow,
} from '../services/scheduleAccelerationService.js'
import { PLANNING_FIELD_REGISTRY_VERSION } from '../services/planningFieldRegistryService.js'
import {
  persistConstructionOrganizationScenarioCandidateEvents,
  type PersistConstructionOrganizationScenarioCandidateEventsResult,
} from '../services/constructionOrganizationScenarioGovernanceService.js'
import { clearProjectBootstrapCache } from '../services/projectBootstrapService.js'
import {
  ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES,
  ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES,
  TASK_SCOPE_OBJECT_ID_KEY_BY_OBJECT_TYPE,
  TASK_SCOPE_OBJECT_ID_KEYS,
  getEngineeringObjectDefaultAreaAccountingMode,
  getEngineeringObjectDefaultCoverageRole,
} from '../types/db.js'
import type { ApiResponse } from '../types/index.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import { orderedInclusiveDurationDays } from '../utils/durationDays.js'
import { isUnconfirmedHeuristicDependency } from '../services/dependencyAuthorityService.js'

const router = Router()

type TransactionClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
  release?: () => void
}

type WizardQueryExec = <T = Record<string, unknown>>(sql: string, queryParams?: unknown[]) => Promise<T[]>

const now = () => new Date().toISOString()
const PROJECT_DRAFT_STATUS = 'wizard_drafting'
const WIZARD_GENERATION_STATE_QUEUED = 'queued'
const WIZARD_GENERATION_STATE_RUNNING = 'running'
const WIZARD_GENERATION_STATE_COMPLETED = 'completed'
const WIZARD_GENERATION_STATE_FAILED = 'failed'
const WIZARD_GENERATION_STALE_WINDOW_MS = 15 * 60 * 1000
const PROJECT_ACTIVE_STATUS = '进行中'
const PROJECT_DEFAULT_NAME = '未命名项目'
const WIZARD_DIAGNOSTIC_FAILURE_INJECTION_FLAG = 'WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION'
const WIZARD_DIAGNOSTIC_C18_L09 = 'C-18.L09'
const WIZARD_DIAGNOSTIC_FAILURE_STAGES = new Set([
  'after_engineering_objects',
  'after_tasks',
  'after_dependencies_or_acceptance_plans',
])
const WIZARD_SCOPE_OBJECT_FIELDS = TASK_SCOPE_OBJECT_ID_KEYS
const WIZARD_SCOPE_OBJECT_FIELD_BY_TYPE = TASK_SCOPE_OBJECT_ID_KEY_BY_OBJECT_TYPE

const detailLevelSchema = z.enum(['overview', 'standard', 'detailed'])
const wizardModeSchema = z.enum(['new', 'starting_line']).default('new')
const planScopeCaliberSchema = z.enum([
  'full_project_master',
  'general_contract',
  'civil_structure_package',
  'specialty_package',
  'continuation_start_line',
])
const deliveryStandardSchema = z.enum([
  'rough',
  'mep_ready',
  'public_area_fitout',
  'full_fitout',
  'hotel_opening',
  'production_ready',
])
const terminalEventSchema = z.enum([
  'contract_completion',
  'completion_acceptance',
  'owner_handover',
  'trial_opening',
  'production_validation',
])

const wizardPayloadSchema = z.object({
  step: z.number().int().min(0).max(6).optional(),
  mode: wizardModeSchema.optional(),
  projectName: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
  actualStartDate: z.string().optional(),
  planScopeCaliber: planScopeCaliberSchema.optional(),
  deliveryStandard: deliveryStandardSchema.optional(),
  terminalEvent: terminalEventSchema.optional(),
  totalAreaM2: z.number().positive().optional(),
  aboveGroundAreaM2: z.number().positive().optional(),
  basementAreaM2: z.number().positive().optional(),
  siteAreaM2: z.number().positive().optional(),
  businessType: z.string().trim().min(1).default('general_civil'),
  businessSubtype: z.string().trim().optional(),
  methodVariantCodes: z.array(z.string()).default([]),
  prefabSystemCodes: z.array(z.string()).default([]),
  projectFeatures: z.record(z.union([z.number(), z.boolean(), z.array(z.string())])).default({}),
  towerCraneCount: z.number().positive().optional(),
  constructionHoistCount: z.number().positive().optional(),
  buildingCount: z.number().int().min(1).optional(),
  detailLevel: detailLevelSchema.default('overview'),
  scopeTree: z.array(z.unknown()).default([]),
  onboardingSubstage: z.string().trim().optional(),
  onboardingPhaseProgress: z.record(z.unknown()).optional(),
  onboardingPassedMilestones: z.array(z.string()).default([]),
  saveAsCompanyTemplate: z.boolean().default(false),
  companyTemplateName: z.string().trim().max(200).optional(),
})

const wizardCreateSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  newProjectId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  companyId: z.string().trim().min(1).optional(),
  status: z.enum(['未开始', PROJECT_DRAFT_STATUS, PROJECT_ACTIVE_STATUS]).optional(),
  location: z.string().trim().max(200).optional(),
  total_area: z.number().positive().optional(),
  planned_start_date: z.string().optional(),
  planned_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  wizardPayload: wizardPayloadSchema.optional(),
  commit: z.boolean().default(false),
  asyncGeneration: z.boolean().optional(),
  saveAsCompanyTemplate: z.boolean().optional(),
  companyTemplateName: z.string().trim().max(200).optional(),
}).refine((value) => !(value.projectId && value.newProjectId), {
  message: 'projectId and newProjectId cannot be provided together',
  path: ['newProjectId'],
})

const wizardDraftSchema = z.object({
  step: z.number().int().min(0).max(6),
  wizard_draft_payload: wizardPayloadSchema,
})

const previewSchema = wizardPayloadSchema.extend({
  projectId: z.string().trim().min(1).optional(),
})

function assertWizardGenerationBusinessSubtype(payload: z.infer<typeof wizardPayloadSchema>) {
  if (!businessTypeRequiresSubtype(payload.businessType)) return
  if (isBusinessSubtypeForType(payload.businessType, payload.businessSubtype)) return
  throw Object.assign(new Error('Please select a concrete subtype that matches the project business type.'), {
    statusCode: 422,
    code: 'WIZARD_BUSINESS_SUBTYPE_REQUIRED',
    details: {
      businessType: payload.businessType,
      businessSubtype: payload.businessSubtype ?? null,
      mutationBoundary: 'rejected_before_project_task_or_dependency_write',
    },
  })
}

const importSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  fileType: z.enum(['xlsx', 'xls', 'csv', 'ms_project_xml']),
  rows: z.array(z.record(z.unknown())).max(5000),
})

type GeneratedTaskRecord = {
  id: string
  title?: string
  onboardingStageClassification?: string | null
  isHistorical?: boolean
}

function mapCreatedTaskId(id: unknown, idByClientRowId: Map<string, string>) {
  const text = String(id ?? '').trim()
  return text ? idByClientRowId.get(text) ?? text : text
}

function mapTargetFeasibilityToTaskIds(
  feasibility: GeneratedTargetFeasibility | null | undefined,
  idByClientRowId: Map<string, string>,
): GeneratedTargetFeasibility | null {
  if (!feasibility) return null
  const rescheduleDraft = feasibility.accelerationProposal?.rescheduleDraft
    ? {
      ...feasibility.accelerationProposal.rescheduleDraft,
      taskDateAdjustments: feasibility.accelerationProposal.rescheduleDraft.taskDateAdjustments.map((adjustment) => ({
        ...adjustment,
        clientRowId: mapCreatedTaskId(adjustment.clientRowId, idByClientRowId),
      })),
      dependencyAdjustments: feasibility.accelerationProposal.rescheduleDraft.dependencyAdjustments.map((adjustment) => ({
        ...adjustment,
        predecessorClientRowId: mapCreatedTaskId(adjustment.predecessorClientRowId, idByClientRowId),
        successorClientRowId: mapCreatedTaskId(adjustment.successorClientRowId, idByClientRowId),
      })),
      resourceAdjustments: feasibility.accelerationProposal.rescheduleDraft.resourceAdjustments.map((adjustment) => ({
        ...adjustment,
        clientRowId: mapCreatedTaskId(adjustment.clientRowId, idByClientRowId),
      })),
      operations: feasibility.accelerationProposal.rescheduleDraft.operations.map((operation) => {
        const taskId = mapCreatedTaskId(operation.rowId || operation.clientRowId, idByClientRowId)
        return operation.type === 'set_predecessors'
          ? {
              ...operation,
              rowId: taskId,
              clientRowId: taskId,
              predecessorTaskIds: operation.predecessorTaskIds.map((id) => mapCreatedTaskId(id, idByClientRowId)),
              predecessorDependencies: operation.predecessorDependencies.map((dependency) => ({
                ...dependency,
                dependencyTaskId: mapCreatedTaskId(dependency.dependencyTaskId, idByClientRowId),
              })),
            }
          : {
              ...operation,
              rowId: taskId,
              clientRowId: taskId,
            }
      }),
    }
    : undefined
  const accelerationProposal = feasibility.accelerationProposal
    ? {
      ...feasibility.accelerationProposal,
      ...(rescheduleDraft ? { rescheduleDraft } : {}),
      actions: feasibility.accelerationProposal.actions.map((action) => {
        const base = {
          ...action,
          affectedRowIds: action.affectedRowIds.map((id) => mapCreatedTaskId(id, idByClientRowId)),
        }
        if (action.type === 'fast_track') {
          return {
            ...base,
            dependencyAdjustments: action.dependencyAdjustments.map((adjustment) => ({
              ...adjustment,
              predecessorClientRowId: mapCreatedTaskId(adjustment.predecessorClientRowId, idByClientRowId),
              successorClientRowId: mapCreatedTaskId(adjustment.successorClientRowId, idByClientRowId),
            })),
          }
        }
        if (action.type === 'crashing') {
          return {
            ...base,
            durationAdjustments: action.durationAdjustments.map((adjustment) => ({
              ...adjustment,
              clientRowId: mapCreatedTaskId(adjustment.clientRowId, idByClientRowId),
            })),
          }
        }
        return base
      }),
      protectedConstraints: feasibility.accelerationProposal.protectedConstraints.map((constraint) => ({
        ...constraint,
        clientRowId: mapCreatedTaskId(constraint.clientRowId, idByClientRowId),
      })),
    }
    : null

  return {
    ...feasibility,
    strategies: feasibility.strategies.map((strategy) => ({
      ...strategy,
      affectedRowIds: strategy.affectedRowIds.map((id) => mapCreatedTaskId(id, idByClientRowId)),
    })),
    accelerationProposal,
  }
}

function mapWizardCandidateNetworkEvaluationToTaskIds(
  candidateNetworkEvaluation: unknown,
  idByClientRowId: Map<string, string>,
) {
  const evaluation = readRecord(candidateNetworkEvaluation)
  if (Object.keys(evaluation).length === 0) return candidateNetworkEvaluation

  const criticalGeneratedRowIds = readStringArray(evaluation.criticalGeneratedRowIds)
  if (criticalGeneratedRowIds.length === 0) return candidateNetworkEvaluation

  const criticalTaskIds = criticalGeneratedRowIds
    .map((generatedRowId) => idByClientRowId.get(generatedRowId))
    .filter((taskId): taskId is string => Boolean(taskId))
  if (criticalTaskIds.length === 0) return candidateNetworkEvaluation

  const missingGeneratedRowIds = criticalGeneratedRowIds.filter((generatedRowId) => !idByClientRowId.has(generatedRowId))
  return {
    ...evaluation,
    criticalTaskIds,
    taskIdMappingStatus: missingGeneratedRowIds.length === 0
      ? 'materialized_task_ids_available'
      : 'materialized_task_ids_partial',
    ...(missingGeneratedRowIds.length > 0 ? { taskIdMappingMissingGeneratedRowIds: missingGeneratedRowIds } : {}),
    taskIdMappingEvidenceLevel: 'candidate_network_materialized_task_id_mapping_l1',
    taskIdMappingMutationBoundary: 'candidate_network_task_id_mapping_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readStringArray(value: unknown): string[] {
  return readArray(value).map((item) => normalizeText(item)).filter(Boolean)
}

function readGeneratedRowConstructionOrganizationScenario(row: GeneratedTemplateRow): Record<string, unknown> | null {
  const metadata = readRecord(row.values?.standard_task_metadata)
  const projectOrganization = readRecord(metadata.projectOrganization)
  const scenarioSelection = readRecord(projectOrganization.scenarioSelection)
  return scenarioSelection.source === 'construction_organization_scenario_selector'
    ? scenarioSelection
    : null
}

function extractConstructionOrganizationScenarioSnapshot(params: {
  rows: GeneratedTemplateRow[]
  generationBatchId: string
  capturedAt: string
  mode?: string | null
  fallbackScenario?: Record<string, unknown> | null
}) {
  for (const row of params.rows) {
    const scenarioSelection = readGeneratedRowConstructionOrganizationScenario(row)
    if (!scenarioSelection) continue
    return {
      ...scenarioSelection,
      projectLevelSnapshot: {
        source: 'project_wizard_commit',
        generationBatchId: params.generationBatchId,
        capturedAt: params.capturedAt,
        mode: normalizeText(params.mode) || 'new',
        rowCarrierClientRowId: row.clientRowId,
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesBaseline: false,
          writesSeed: false,
          writesTaskFacts: false,
          writesAccelerationDraft: false,
          writesCriticalPathFacts: false,
        },
      },
    }
  }
  const fallbackScenario = readRecord(params.fallbackScenario)
  if (fallbackScenario.source === 'construction_organization_scenario_selector') {
    return {
      ...fallbackScenario,
      projectLevelSnapshot: {
        source: 'project_wizard_commit',
        generationBatchId: params.generationBatchId,
        capturedAt: params.capturedAt,
        mode: normalizeText(params.mode) || 'new',
        rowCarrierClientRowId: null,
        fallbackBasis: 'project_generation_facts_selector',
        mutationBoundary: {
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesBaseline: false,
          writesSeed: false,
          writesTaskFacts: false,
          writesAccelerationDraft: false,
          writesCriticalPathFacts: false,
        },
      },
    }
  }
  return null
}

function summarizeConstructionOrganizationUseCaseRecommendation(value: unknown) {
  const recommendation = readRecord(value)
  if (Object.keys(recommendation).length === 0) return null
  return {
    optionId: normalizeText(recommendation.optionId) || null,
    selectedScenarioIds: readStringArray(recommendation.selectedScenarioIds),
    recommendationBasis: readStringArray(recommendation.recommendationBasis),
    actionability: normalizeText(recommendation.actionability) || null,
    confidence: normalizeText(recommendation.confidence) || null,
    recoveryFactorHint: readNumber(recommendation.recoveryFactorHint),
    currentSubstage: normalizeText(recommendation.currentSubstage) || null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function summarizeConstructionOrganizationFactCoverage(value: unknown) {
  const coverage = readRecord(value)
  if (Object.keys(coverage).length === 0) return null
  return {
    source: normalizeText(coverage.source) || null,
    usesExistingWizardFactsOnly: coverage.usesExistingWizardFactsOnly === true,
    decisionFactKeys: readStringArray(coverage.decisionFactKeys),
    contextFactKeys: readStringArray(coverage.contextFactKeys),
    consumedFactKeys: readStringArray(coverage.consumedFactKeys),
    sidecarFactKeys: readStringArray(coverage.sidecarFactKeys),
    missingFactKeys: readStringArray(coverage.missingFactKeys),
    completenessScore: readNumber(coverage.completenessScore),
    resourcePolicy: normalizeText(coverage.resourcePolicy) || null,
  }
}

function summarizeConstructionOrganizationProjectPolicy(value: unknown) {
  const policy = readRecord(value)
  if (Object.keys(policy).length === 0) return null
  return {
    source: normalizeText(policy.source) || null,
    policyId: normalizeText(policy.policyId) || null,
    sourceVersion: normalizeText(policy.sourceVersion) || null,
    strategy: normalizeText(policy.strategy) || null,
    schemeFamily: normalizeText(policy.schemeFamily) || null,
    primaryInterfaceSequence: readStringArray(policy.primaryInterfaceSequence),
    interfaceGateTags: readStringArray(policy.interfaceGateTags),
    laneRole: normalizeText(policy.laneRole) || null,
    lanePrefix: normalizeText(policy.lanePrefix) || null,
    networkPolicy: readRecord(policy.networkPolicy),
    confidence: normalizeText(policy.confidence) || null,
    rationale: normalizeText(policy.rationale) || null,
    resourcePolicy: normalizeText(policy.resourcePolicy) || null,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function summarizeConstructionOrganizationUseCaseEvaluations(value: unknown) {
  const evaluations = readRecord(value)
  const entries = Object.entries(evaluations)
    .map(([key, raw]) => {
      const evaluation = readRecord(raw)
      if (Object.keys(evaluation).length === 0) return null
      const summary: Record<string, unknown> = {
        useCase: normalizeText(evaluation.useCase) || null,
        optionId: normalizeText(evaluation.optionId) || null,
        optionScore: readNumber(evaluation.optionScore),
        rankBasis: readStringArray(evaluation.rankBasis),
        actionability: normalizeText(evaluation.actionability) || null,
        currentSubstage: normalizeText(evaluation.currentSubstage) || null,
        recoveryFactorHint: readNumber(evaluation.recoveryFactorHint),
        e5RecoverableSpanDays: readNumber(evaluation.e5RecoverableSpanDays),
        factCoverage: summarizeConstructionOrganizationFactCoverage(evaluation.factCoverage),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }
      return [key, summary] as [string, Record<string, unknown>]
    })
    .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry))
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function summarizeConstructionOrganizationExcludedReasons(value: unknown) {
  return readArray(value)
    .map((item) => {
      const record = readRecord(item)
      const scenarioId = normalizeText(record.scenarioId)
      const reasons = readStringArray(record.reasons)
      if (!scenarioId || reasons.length === 0) return null
      return { scenarioId, reasons }
    })
    .filter((item): item is { scenarioId: string; reasons: string[] } => Boolean(item))
    .slice(0, 8)
}

function summarizeConstructionOrganizationPlanOption(value: unknown) {
  const option = readRecord(value)
  if (Object.keys(option).length === 0) return null
  const evaluation = readRecord(option.evaluation)
  const engineEvaluationSummary = readRecord(evaluation.engineEvaluationSummary ?? option.engineEvaluationSummary)
  return {
    optionId: normalizeText(option.optionId) || null,
    selectedScenarioIds: readStringArray(option.selectedScenarioIds),
    confidence: normalizeText(option.confidence) || null,
    score: readNumber(option.score ?? option.optionScore ?? option.compositeScore),
    projectOrganizationScheme: summarizeConstructionOrganizationProjectPolicy(
      option.projectOrganizationScheme ?? engineEvaluationSummary.projectOrganization,
    ),
    selectionReasons: readStringArray(option.selectionReasons),
    excludedReasons: summarizeConstructionOrganizationExcludedReasons(option.excludedReasons),
    useCaseEvaluations: summarizeConstructionOrganizationUseCaseEvaluations(
      option.useCaseEvaluations ?? evaluation.useCaseEvaluations,
    ),
    boundaryPolicy: readRecord(option.boundaryPolicy),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
  }
}

function hasPersistableConstructionOrganizationScenarioShape(value: unknown) {
  const scenario = readRecord(value)
  if (scenario.source !== 'construction_organization_scenario_selector') return false
  const recommendedPlanOption = readRecord(scenario.recommendedPlanOption)
  if (!normalizeText(recommendedPlanOption.optionId)) return false
  const planOptions = readArray(scenario.planOptions)
  return planOptions.some((rawOption) => {
    const option = readRecord(rawOption)
    const evaluation = readRecord(option.evaluation)
    const networkEvaluation = readRecord(evaluation.networkEvaluation)
    const engineEvaluationSummary = readRecord(evaluation.engineEvaluationSummary)
    return Boolean(
      normalizeText(option.optionId)
      && Object.keys(networkEvaluation).length > 0
      && Object.keys(engineEvaluationSummary).length > 0,
    )
  })
}

async function persistWizardConstructionOrganizationCandidateAnchors(params: {
  projectId: string
  companyId?: string | null
  scenario: Record<string, unknown> | null
  queryExec?: WizardQueryExec
}) {
  if (!hasPersistableConstructionOrganizationScenarioShape(params.scenario)) {
    return null
  }
  const queryExec = params.queryExec ?? (async <T = Record<string, unknown>>(sql: string, queryParams?: unknown[]) => {
    // database-query-dynamic-approved: construction-organization governance service owns SQL shape; wizard supplies DB execution only.
    const result = await rawQuery(sql, queryParams as any[] | undefined)
    return (result.rows ?? []) as T[]
  })
  try {
    return await persistConstructionOrganizationScenarioCandidateEvents({
      companyId: params.companyId,
      projectId: params.projectId,
      selection: params.scenario as unknown as ConstructionOrganizationScenarioSelection,
      queryExec,
    })
  } catch (error) {
    logger.warn('project wizard construction organization candidate anchor persistence failed', {
      projectId: params.projectId,
      companyId: params.companyId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function buildConstructionOrganizationScenarioProjectSummary(params: {
  scenario: Record<string, unknown> | null
  generationBatchId: string
  capturedAt: string
  mode?: string | null
  productOutcomeCloseoutProgress?: ConstructionOrganizationProductOutcomeCloseoutProgress | null
}) {
  if (!params.scenario) return null
  const recommendedPlanOption = readRecord(params.scenario.recommendedPlanOption)
  const planOptionComparisonPackage = readRecord(params.scenario.planOptionComparisonPackage)
  const planOptions = readArray(params.scenario.planOptions)
    .map(summarizeConstructionOrganizationPlanOption)
    .filter((item): item is NonNullable<ReturnType<typeof summarizeConstructionOrganizationPlanOption>> => Boolean(item))
    .slice(0, 8)
  const scenarioRecommendations = readRecord(params.scenario.scenarioRecommendations)
  const summarizedRecommendations = {
    newProjectPlanning: summarizeConstructionOrganizationUseCaseRecommendation(scenarioRecommendations.newProjectPlanning),
    startingLineOnboarding: summarizeConstructionOrganizationUseCaseRecommendation(scenarioRecommendations.startingLineOnboarding),
    accelerationRecovery: summarizeConstructionOrganizationUseCaseRecommendation(scenarioRecommendations.accelerationRecovery),
  }
  const factBasis = readRecord(params.scenario.factBasis)
  const scopeOrganizationFacts = readRecord(factBasis.scopeOrganizationFacts)
  const projectOrganizationPolicy = summarizeConstructionOrganizationProjectPolicy(factBasis.projectOrganizationPolicy)
  const organizationDecisionReport = Object.keys(readRecord(params.scenario.organizationDecisionReport)).length > 0
    ? ensureConstructionOrganizationDecisionReportProductCloseoutReadiness(
        readRecord(params.scenario.organizationDecisionReport),
      )
    : null
  if (organizationDecisionReport && params.productOutcomeCloseoutProgress) {
    const readiness = readRecord(organizationDecisionReport.productCloseoutReadiness)
    organizationDecisionReport.productCloseoutReadiness = {
      ...readiness,
      productOutcomeCloseoutProgress: params.productOutcomeCloseoutProgress,
    }
    organizationDecisionReport.productOutcomeCloseoutProgress = params.productOutcomeCloseoutProgress
  }
  return {
    source: 'project_wizard_commit_construction_organization_summary',
    generationBatchId: params.generationBatchId,
    capturedAt: params.capturedAt,
    mode: normalizeText(params.mode) || 'new',
    recommendedPlanOptionId: normalizeText(recommendedPlanOption.optionId) || null,
    recommendedScenarioIds: readStringArray(params.scenario.recommendedScenarioIds),
    confidence: normalizeText(params.scenario.confidence) || null,
    planOptionCount: readArray(params.scenario.planOptions).length,
    planOptionComparisonPackage: Object.keys(planOptionComparisonPackage).length > 0
      ? planOptionComparisonPackage
      : null,
    organizationDecisionReport,
    ...(params.productOutcomeCloseoutProgress
      ? { productOutcomeCloseoutProgress: params.productOutcomeCloseoutProgress }
      : {}),
    recommendedPlanOption: summarizeConstructionOrganizationPlanOption(recommendedPlanOption),
    planOptions,
    scenarioRecommendations: summarizedRecommendations,
    newProjectPlanning: summarizedRecommendations.newProjectPlanning,
    startingLineOnboarding: summarizedRecommendations.startingLineOnboarding,
    accelerationRecovery: summarizedRecommendations.accelerationRecovery,
    projectOrganizationPolicy,
    scopeOrganizationFacts: {
      source: normalizeText(scopeOrganizationFacts.source) || null,
      organizationSignals: readStringArray(scopeOrganizationFacts.organizationSignals),
      buildingObjectCount: readNumber(scopeOrganizationFacts.buildingObjectCount),
      sharedBasementObjectCount: readNumber(scopeOrganizationFacts.sharedBasementObjectCount),
      sharedPodiumObjectCount: readNumber(scopeOrganizationFacts.sharedPodiumObjectCount),
      outdoorSiteObjectCount: readNumber(scopeOrganizationFacts.outdoorSiteObjectCount),
      sharedBasementServiceTargetCount: readNumber(scopeOrganizationFacts.sharedBasementServiceTargetCount),
      sharedScopeServiceTargetCount: readNumber(scopeOrganizationFacts.sharedScopeServiceTargetCount),
      serviceTargetKindCounts: readRecord(scopeOrganizationFacts.serviceTargetKindCounts),
      sharedBasementServiceTargetKindCounts: readRecord(scopeOrganizationFacts.sharedBasementServiceTargetKindCounts),
      sharedScopeServiceTargetKindCounts: readRecord(scopeOrganizationFacts.sharedScopeServiceTargetKindCounts),
    },
    boundaryPolicy: readRecord(params.scenario.boundaryPolicy),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesBaseline: false,
      writesSeed: false,
      writesTaskFacts: false,
      writesAccelerationDraft: false,
      writesCriticalPathFacts: false,
    },
  }
}

function mergeRecords(...records: Array<Record<string, unknown> | null | undefined>) {
  return records.reduce<Record<string, unknown>>((merged, record) => {
    if (!record) return merged
    return { ...merged, ...record }
  }, {})
}

function omitRecordKeys(record: Record<string, unknown>, keys: string[]) {
  const next = { ...record }
  for (const key of keys) {
    delete next[key]
  }
  return next
}

async function readProjectMetadata(projectId: string, transactionClient?: TransactionClientLike | null) {
  const result = transactionClient
    ? await transactionClient.query(
      'SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1',
      [projectId],
    )
    : await rawQuery(
    'SELECT id, company_id, status, default_wbs_generated, metadata FROM projects WHERE id = $1',
    [projectId],
    )
  const project = (result.rows[0] as Record<string, unknown> | undefined) ?? null
  return {
    project,
    metadata: readRecord(project?.metadata),
  }
}

async function buildWizardConstructionOrganizationProductOutcomeProgress(params: {
  companyId?: string | null
  projectId: string
}): Promise<ConstructionOrganizationProductOutcomeCloseoutProgress | null> {
  const companyId = normalizeText(params.companyId)
  if (!companyId) return null
  try {
    const snapshot = await buildConstructionOrganizationProductOutcomeCloseoutProgressForProject({
      companyId,
      projectId: params.projectId,
      limit: 2000,
      maxLimit: 2000,
    })
    return snapshot.progress
  } catch (error) {
    logger.warn('project wizard construction organization product closeout progress projection failed', {
      projectId: params.projectId,
      companyId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function updateProjectMetadata(params: {
  projectId: string
  metadata: Record<string, unknown>
  updatedAt: string
  status?: string
  defaultWbsGenerated?: boolean
  requiredStatus?: string
  transactionClient?: TransactionClientLike | null
  statementTimeoutMs?: number | null
  mergeMetadata?: boolean
}) {
  const metadataJson = JSON.stringify(params.metadata)
  const exec = async (sql: string, queryParams: unknown[]) => {
    if (params.transactionClient) return params.transactionClient.query(sql, queryParams)
    if (params.statementTimeoutMs && params.statementTimeoutMs > 0) {
      const client = await getClient()
      try {
        await client.query('BEGIN')
        await client.query(buildLocalStatementTimeoutSql(params.statementTimeoutMs))
        const result = await client.query(sql, queryParams)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    }
    // database-query-dynamic-approved: project wizard metadata updater owns only fixed project UPDATE SQL templates; runtime values are bound parameters.
    return rawQuery(sql, queryParams as any[])
  }
  if (params.status !== undefined && params.defaultWbsGenerated !== undefined) {
    const result = await exec(
      `UPDATE projects
       SET metadata = $2::jsonb,
           updated_at = $3,
           status = $4,
           default_wbs_generated = $5
      WHERE id = $1
      RETURNING id`,
      [params.projectId, metadataJson, params.updatedAt, params.status, params.defaultWbsGenerated],
    )
    clearProjectBootstrapCache(params.projectId)
    return result.rows as Record<string, unknown>[]
  }
  if (params.requiredStatus !== undefined) {
    const result = await exec(
      `UPDATE projects
       SET metadata = $2::jsonb,
           updated_at = $3
      WHERE id = $1 AND status = $4
      RETURNING id`,
      [params.projectId, metadataJson, params.updatedAt, params.requiredStatus],
    )
    clearProjectBootstrapCache(params.projectId)
    return result.rows as Record<string, unknown>[]
  }
  if (params.mergeMetadata) {
    const result = await exec(
      `UPDATE projects
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = $3
       WHERE id = $1
       RETURNING id`,
      [params.projectId, metadataJson, params.updatedAt],
    )
    clearProjectBootstrapCache(params.projectId)
    return result.rows as Record<string, unknown>[]
  }
  const result = await exec(
    `UPDATE projects
     SET metadata = $2::jsonb,
         updated_at = $3
     WHERE id = $1
     RETURNING id`,
    [params.projectId, metadataJson, params.updatedAt],
  )
  clearProjectBootstrapCache(params.projectId)
  return result.rows as Record<string, unknown>[]
}

async function resolveWizardProjectCompanyId(userId?: string | null, requestedCompanyId?: string | null) {
  const userIdText = String(userId ?? '').trim()
  if (!userIdText) return requestedCompanyId ?? null

  const membership = await getCurrentCompanyMembership(userIdText, requestedCompanyId)
  if (membership?.companyId) return membership.companyId

  return ensureDefaultCompanyForUser(userIdText)
}

function forbiddenError(message = 'You do not have permission to edit this project.') {
  return Object.assign(new Error(message), {
    statusCode: 403,
    code: 'FORBIDDEN',
  })
}

async function assertWizardProjectEditor(params: {
  actorId?: string | null
  projectId?: string | null
  companyId?: string | null
}) {
  const actorId = normalizeText(params.actorId)
  const projectId = normalizeText(params.projectId)
  if (!projectId) return
  if (!actorId) throw forbiddenError('Current identity is not allowed to edit this project.')

  const permissionLevel = await getProjectPermissionLevel(actorId, projectId, params.companyId ?? null)
  if (permissionLevel !== 'owner' && permissionLevel !== 'editor') {
    throw forbiddenError()
  }
}

function normalizeDate(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, 10) : null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRate01(value: unknown): number | null {
  const parsed = readNumber(value)
  if (parsed === null) return null
  if (parsed > 1) return parsed / 100
  return parsed
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((item) => normalizeText(item)).filter(Boolean))]
}

function readDefaultMethodVariantCodes(businessType: unknown) {
  const code = normalizeId(businessType) as ProjectGenerationFacts['businessType']
  try {
    return [...(getBusinessTypeRecommendation(code)?.defaultMethods ?? [])]
  } catch {
    return []
  }
}

function uniqueIds(values: unknown[]) {
  return uniqueStrings(values).map(normalizeId).filter(Boolean)
}

function withDefinedFact(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === null || value === undefined) return
  if (Array.isArray(value) && value.length === 0) return
  target[key] = value
}

const CANONICAL_PROJECT_FEATURE_CODES = new Set(Object.keys(FEATURE_TO_ITEM_PACK_MAP))

function sanitizeWizardProjectFeatures(features: Record<string, number | boolean | string[]> = {}) {
  const sanitized: Record<string, number | boolean | string[]> = {}
  for (const [key, value] of Object.entries(features)) {
    if (!CANONICAL_PROJECT_FEATURE_CODES.has(key) && key !== 'foundationFormCodes') continue
    sanitized[key] = value
  }
  return sanitized
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 1) return true
  if (value === 0) return false
  return null
}

function anyTrue(values: unknown[]) {
  return values.some((value) => readBoolean(value) === true)
}

function featureIsPresent(features: Record<string, number | boolean | string[]>, key: string) {
  const value = features[key]
  if (typeof value === 'boolean') return value
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function deriveElementVariantCodes(params: {
  prefabSystemCodes: string[]
  methodVariantCodes: string[]
}) {
  const featureDrivenCodes = [
    params.methodVariantCodes.map(normalizeId).includes('modular_mic') ? 'factory_integrated_module' : null,
  ]
  return uniqueStrings([
    ...params.prefabSystemCodes,
    ...featureDrivenCodes,
  ])
}

function deriveExternalInterfaceCodes(features: Record<string, number | boolean | string[]>) {
  return uniqueStrings([
    featureIsPresent(features, 'near_metro') ? 'metro_operation_interface' : null,
    featureIsPresent(features, 'non_stop_operation') ? 'metro_operation_interface' : null,
    featureIsPresent(features, 'near_heritage') ? 'heritage_protection_interface' : null,
    featureIsPresent(features, 'near_high_voltage') ? 'high_voltage_protection_interface' : null,
  ])
}

function deriveHardConstraintCodes(features: Record<string, number | boolean | string[]>, terminalEvent?: string) {
  return uniqueStrings([
    featureIsPresent(features, 'non_stop_operation') ? 'non_stop_operation' : null,
    featureIsPresent(features, 'occupied_renovation') ? 'occupied_renovation' : null,
    terminalEvent === 'trial_opening' ? 'hard_date_opening' : null,
    terminalEvent === 'production_validation' ? 'production_validation_gate' : null,
  ])
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? '').trim()
  if (['todo', 'pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(status)) return status
  return 'todo'
}

function normalizePriority(value: unknown) {
  const priority = String(value ?? '').trim()
  if (['low', 'medium', 'high', 'critical'].includes(priority)) return priority
  return 'medium'
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function isTruthyFlag(value: unknown) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true'
}

function countScopeBuildings(scopeTree: unknown[]) {
  const visit = (node: unknown): number => {
    const record = readRecord(node)
    const children: unknown[] = Array.isArray(record.children) ? record.children : []
    return (record.type === 'building' ? 1 : 0) + children.reduce<number>((sum, child) => sum + visit(child), 0)
  }
  return Math.max(1, scopeTree.reduce<number>((sum, node) => sum + visit(node), 0))
}

function flattenScopeNodes(scopeTree: unknown[]): Record<string, unknown>[] {
  const visit = (node: unknown): Record<string, unknown>[] => {
    const record = readRecord(node)
    if (Object.keys(record).length === 0) return []
    return [record, ...readArray(record.children).flatMap(visit)]
  }
  return scopeTree.flatMap(visit)
}

function readNodeMetadata(node: Record<string, unknown>) {
  return readRecord(node.metadata)
}

function readNodeChildren(node: Record<string, unknown>) {
  return readArray(node.children).map((child) => readRecord(child))
}

function countChildNodes(node: Record<string, unknown>, type: string): number {
  return readNodeChildren(node).reduce<number>((sum, child) => (
    sum + (normalizeId(child.type) === type ? 1 : 0) + countChildNodes(child, type)
  ), 0)
}

function countDescendantFloorNodes(node: Record<string, unknown>): number {
  return countChildNodes(node, 'floor')
}

function readFloorCountForBuilding(node: Record<string, unknown>): number | null {
  const standardFloorCount = readNumber(readNodeMetadata(node).standardFloorCount)
  if (standardFloorCount !== null && standardFloorCount > 0) return Math.floor(standardFloorCount)

  const descendantFloorCount = countDescendantFloorNodes(node)
  return descendantFloorCount > 0 ? descendantFloorCount : null
}

function readPositiveMax(values: unknown[]): number | null {
  const candidates = values
    .map(readNumber)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
  return candidates.length > 0 ? Math.max(...candidates) : null
}

type ScopeCoverageDiagnostic = {
  code: 'SCOPE_AREA_UNDER_COVERED' | 'SCOPE_AREA_OVER_COVERED' | 'SCOPE_SIBLING_DUPLICATE' | 'SCOPE_DECOMPOSITION_AXIS_MIXED'
  severity: 'info' | 'warning' | 'blocking'
  message: string
  expectedAreaM2?: number | null
  accountedAreaM2?: number | null
  deltaAreaM2?: number | null
  coverageRatio?: number | null
  nodeNames?: string[]
}

const DECOMPOSITION_CHILD_MODES: Record<string, string | undefined> = ENGINEERING_OBJECT_DECOMPOSITION_CHILD_MODES

const DECOMPOSITION_PARENT_TYPES = new Set<string>(ENGINEERING_OBJECT_PERSISTED_DECOMPOSITION_PARENT_TYPES)

function readCoverageRole(node: Record<string, unknown>) {
  const type = normalizeId(node.type)
  const metadata = readNodeMetadata(node)
  return normalizeId(metadata.coverageRole || getEngineeringObjectDefaultCoverageRole(type as any))
}

function readAreaAccountingMode(node: Record<string, unknown>) {
  const type = normalizeId(node.type)
  const metadata = readNodeMetadata(node)
  return normalizeId(metadata.areaAccountingMode || getEngineeringObjectDefaultAreaAccountingMode(type as any))
}

function readPartitionMode(node: Record<string, unknown>) {
  const metadata = readNodeMetadata(node)
  return normalizeId(metadata.partitionMode) || 'trigger_tag'
}

function isCountedScopeNode(node: Record<string, unknown>) {
  const type = normalizeId(node.type)
  const partitionMode = readPartitionMode(node)
  if (type === 'functional_area' && partitionMode === 'spatial_partition') return true
  const coverageRole = readCoverageRole(node)
  const areaAccountingMode = readAreaAccountingMode(node)
  return coverageRole !== 'overlay_trigger' && areaAccountingMode !== 'not_counted'
}

function readLedgerAreaM2(node: Record<string, unknown>): number | null {
  const type = normalizeId(node.type)
  const metadata = readNodeMetadata(node)
  if (type === 'building') {
    return readNumber(metadata.areaM2)
  }
  if (type === 'basement') {
    return readNumber(metadata.basementAreaM2) ?? readNumber(metadata.areaM2)
  }
  if (type === 'floor') {
    return readNumber(metadata.areaM2)
  }
  if (type === 'physical_zone') {
    return readNumber(metadata.areaM2)
  }
  return null
}

function normalizeScopeNodeName(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function buildScopeCoverageDiagnostics(payload: z.infer<typeof wizardPayloadSchema>, facts: ProjectGenerationFacts): ScopeCoverageDiagnostic[] {
  const nodes = flattenScopeNodes(payload.scopeTree)
  const diagnostics: ScopeCoverageDiagnostic[] = []

  const mixedAxisNodes = nodes.filter((node) => {
    const type = normalizeId(node.type)
    if (!DECOMPOSITION_PARENT_TYPES.has(type)) return false
    const modes = new Set(readNodeChildren(node)
      .map((child) => DECOMPOSITION_CHILD_MODES[normalizeId(child.type)])
      .filter(Boolean))
    return modes.size > 1
  })
  if (mixedAxisNodes.length > 0) {
    diagnostics.push({
      code: 'SCOPE_DECOMPOSITION_AXIS_MIXED',
      severity: 'warning',
      message: '同一实体空间不应同时直接按楼层和施工分区拆分；请统一为按楼层，或先建施工分区再在分区下生成楼层。',
      nodeNames: mixedAxisNodes.map((node) => normalizeText(node.name)).filter(Boolean).slice(0, 8),
    })
  }

  const siblingBuckets = new Map<string, string[]>()
  for (const node of nodes) {
    const type = normalizeId(node.type)
    if (!['building', 'basement', 'floor', 'physical_zone'].includes(type)) continue
    if (!isCountedScopeNode(node)) continue
    const nameKey = normalizeScopeNodeName(node.name)
    if (!nameKey) continue
    const bucketKey = `${normalizeText(node.parentId) || 'root'}:${type}:${nameKey}`
    const bucket = siblingBuckets.get(bucketKey) ?? []
    bucket.push(normalizeText(node.name))
    siblingBuckets.set(bucketKey, bucket)
  }
  const duplicateNames = [...siblingBuckets.values()]
    .filter((names) => names.length > 1)
    .flatMap((names) => names)
  if (duplicateNames.length > 0) {
    diagnostics.push({
      code: 'SCOPE_SIBLING_DUPLICATE',
      severity: 'warning',
      message: '同一层级存在重复实体范围，可能导致同一片空间重复生成任务或重复计量。',
      nodeNames: duplicateNames.slice(0, 8),
    })
  }

  const expectedAreaM2 = readNumber(payload.totalAreaM2) ?? readNumber(facts.totalAreaM2)
  // eslint-disable-next-line -- route-level-aggregation-approved
  const accountedAreaM2 = nodes.reduce((sum, node) => {
    const type = normalizeId(node.type)
    if (!['building', 'basement', 'physical_zone'].includes(type)) return sum
    if (!isCountedScopeNode(node)) return sum
    const area = readLedgerAreaM2(node)
    return area && area > 0 ? sum + area : sum
  }, 0)

  if (expectedAreaM2 && expectedAreaM2 > 0 && accountedAreaM2 > 0) {
    const coverageRatio = Number((accountedAreaM2 / expectedAreaM2).toFixed(4))
    const deltaAreaM2 = Math.round(accountedAreaM2 - expectedAreaM2)
    if (coverageRatio < 0.95) {
      diagnostics.push({
        code: 'SCOPE_AREA_UNDER_COVERED',
        severity: 'info',
        message: '范围树中已计入面积明显小于项目总建筑面积，可能存在单体、地下室或工程区域漏填。',
        expectedAreaM2: Math.round(expectedAreaM2),
        accountedAreaM2: Math.round(accountedAreaM2),
        deltaAreaM2,
        coverageRatio,
      })
    } else if (coverageRatio > 1.05) {
      diagnostics.push({
        code: 'SCOPE_AREA_OVER_COVERED',
        severity: 'info',
        message: '范围树中已计入面积明显大于项目总建筑面积，可能存在重复范围或室外区域误计入建筑面积。',
        expectedAreaM2: Math.round(expectedAreaM2),
        accountedAreaM2: Math.round(accountedAreaM2),
        deltaAreaM2,
        coverageRatio,
      })
    }
  }

  return diagnostics
}

function positiveNumbers(values: unknown[]) {
  return values
    .map(readNumber)
    .filter((value): value is number => value !== null && value > 0)
}

function nonNegativeNumbers(values: unknown[]) {
  return values
    .map(readNumber)
    .filter((value): value is number => value !== null && value >= 0)
}

function sumValues(values: number[]) {
  // eslint-disable-next-line -- route-level-aggregation-approved
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null
}

const LOCATION_FACT_RULES: Array<{
  province: string
  cityKeywords: string[]
  regionCode: string
  climateZone: string
  climateSignals: string[]
  weatherImpactBands: string[]
}> = [
  {
    province: '上海',
    cityKeywords: ['上海'],
    regionCode: 'east_china_hot_summer_cold_winter',
    climateZone: '夏热冬冷地区',
    climateSignals: ['rainy_season', 'summer_heat'],
    weatherImpactBands: ['rain_partial_work', 'summer_heat_work_hour_shift'],
  },
  {
    province: '北京',
    cityKeywords: ['北京'],
    regionCode: 'north_china_cold',
    climateZone: '寒冷地区',
    climateSignals: ['winter_low_temp', 'summer_heat'],
    weatherImpactBands: ['winter_wet_trade', 'summer_heat_work_hour_shift'],
  },
  {
    province: '天津',
    cityKeywords: ['天津'],
    regionCode: 'north_china_cold',
    climateZone: '寒冷地区',
    climateSignals: ['winter_low_temp', 'summer_heat'],
    weatherImpactBands: ['winter_wet_trade', 'summer_heat_work_hour_shift'],
  },
  {
    province: '广东',
    cityKeywords: ['广州', '深圳', '佛山', '东莞', '珠海', '广东'],
    regionCode: 'south_china_hot_summer_warm_winter',
    climateZone: '夏热冬暖地区',
    climateSignals: ['rainy_season', 'summer_heat', 'typhoon_season'],
    weatherImpactBands: ['rain_partial_work', 'summer_heat_work_hour_shift', 'typhoon_shutdown_risk'],
  },
  {
    province: '浙江',
    cityKeywords: ['杭州', '宁波', '温州', '绍兴', '浙江'],
    regionCode: 'east_china_hot_summer_cold_winter',
    climateZone: '夏热冬冷地区',
    climateSignals: ['rainy_season', 'summer_heat'],
    weatherImpactBands: ['rain_partial_work', 'summer_heat_work_hour_shift'],
  },
  {
    province: '江苏',
    cityKeywords: ['南京', '苏州', '无锡', '常州', '江苏'],
    regionCode: 'east_china_hot_summer_cold_winter',
    climateZone: '夏热冬冷地区',
    climateSignals: ['rainy_season', 'summer_heat'],
    weatherImpactBands: ['rain_partial_work', 'summer_heat_work_hour_shift'],
  },
  {
    province: '四川',
    cityKeywords: ['成都', '绵阳', '四川'],
    regionCode: 'southwest_hot_summer_cold_winter',
    climateZone: '夏热冬冷地区',
    climateSignals: ['rainy_season', 'persistent_humidity'],
    weatherImpactBands: ['rain_partial_work', 'humidity_finish_risk'],
  },
  {
    province: '重庆',
    cityKeywords: ['重庆'],
    regionCode: 'southwest_hot_summer_cold_winter',
    climateZone: '夏热冬冷地区',
    climateSignals: ['rainy_season', 'summer_heat', 'persistent_humidity'],
    weatherImpactBands: ['rain_partial_work', 'summer_heat_work_hour_shift', 'humidity_finish_risk'],
  },
]

function buildWizardLocationFacts(location: unknown) {
  const rawLocation = normalizeText(location)
  if (!rawLocation) {
    return {
      rawLocation: null,
      province: null,
      city: null,
      regionCode: null,
      climateZone: null,
      climateSignals: [],
      weatherImpactBands: [],
      inferenceStatus: 'missing',
      source: 'wizard_location_rule',
    }
  }
  const rule = LOCATION_FACT_RULES.find((item) => item.cityKeywords.some((keyword) => rawLocation.includes(keyword)))
  const city = rule?.cityKeywords.find((keyword) => rawLocation.includes(keyword)) ?? rawLocation
  return {
    rawLocation,
    province: rule?.province ?? null,
    city,
    regionCode: rule?.regionCode ?? 'unknown_region',
    climateZone: rule?.climateZone ?? null,
    climateSignals: rule?.climateSignals ?? [],
    weatherImpactBands: rule?.weatherImpactBands ?? [],
    inferenceStatus: rule ? 'matched' : 'unmatched',
    source: 'wizard_location_rule',
  }
}

function buildWizardScaleFacts(payload: z.infer<typeof wizardPayloadSchema>) {
  const nodes = flattenScopeNodes(payload.scopeTree)
  const buildingNodes = nodes.filter((node) => normalizeId(node.type) === 'building')
  const basementNodes = nodes.filter((node) => normalizeId(node.type) === 'basement')
  const floorNodes = nodes.filter((node) => normalizeId(node.type) === 'floor')
  const physicalZoneNodes = nodes.filter((node) => normalizeId(node.type) === 'physical_zone')
  const buildingMetas = buildingNodes.map(readNodeMetadata)
  const basementMetas = basementNodes.map(readNodeMetadata)
  const floorMetas = floorNodes.map(readNodeMetadata)
  const physicalZoneMetas = physicalZoneNodes.map(readNodeMetadata)
  const projectFeatures = sanitizeWizardProjectFeatures(payload.projectFeatures ?? {})
  const floorCounts = positiveNumbers(buildingNodes.map(readFloorCountForBuilding))
  const basementDepths = nonNegativeNumbers([
    projectFeatures.deep_pit,
    ...basementMetas.map((metadata) => metadata.foundationDepthM),
  ])
  const scopedBasementCounts = nonNegativeNumbers([
    ...basementMetas.map((metadata) => metadata.basementLevelCount),
  ])
  const featureBasementCounts = nonNegativeNumbers([
    projectFeatures.basementLevelCount,
  ])
  const scopedBasementAreaM2 = sumValues(positiveNumbers([
    ...basementMetas.map((metadata) => metadata.basementAreaM2),
    ...physicalZoneMetas
      .filter((metadata) => normalizeId(metadata.physicalCategory).includes('地下'))
      .map((metadata) => metadata.areaM2),
  ]))
  const featureBasementAreaM2 = readPositiveMax([projectFeatures.basementAreaM2])
  const physicalZoneAreaM2 = sumValues(positiveNumbers(physicalZoneMetas.map((metadata) => metadata.areaM2)))
  const explicitMethodVariantCodes = uniqueStrings([
    ...payload.methodVariantCodes,
    ...buildingMetas.flatMap((metadata) => readArray(metadata.methodVariantCodes)),
  ]) as ProjectGenerationFacts['methodVariantCodes']
  const methodVariantCodes = (
    explicitMethodVariantCodes.length > 0
      ? explicitMethodVariantCodes
      : readDefaultMethodVariantCodes(payload.businessType)
  ) as ProjectGenerationFacts['methodVariantCodes']
  const prefabSystemCodes = uniqueStrings(payload.prefabSystemCodes)
  const elementVariantCodes = deriveElementVariantCodes({
    prefabSystemCodes,
    methodVariantCodes,
  })
  const externalInterfaceCodes = deriveExternalInterfaceCodes(projectFeatures)
  const hardConstraintCodes = deriveHardConstraintCodes(projectFeatures, payload.terminalEvent)
  const normalizedMethods = new Set(methodVariantCodes.map(normalizeId))
  const prefabRate = normalizeRate01(projectFeatures.prefabRate)
  const maxSpanValues = positiveNumbers([projectFeatures.large_span])
  const supportHeightValues = positiveNumbers([projectFeatures.supportHeightM])
  const maxSpanM = maxSpanValues.length > 0 ? Math.max(...maxSpanValues) : null
  const supportHeightM = supportHeightValues.length > 0 ? Math.max(...supportHeightValues) : null
  const hasCivilDefense = anyTrue([
    projectFeatures.hasCivilDefense,
    ...basementMetas.map((metadata) => metadata.hasCivilDefense),
  ])
  const buildingCount = Math.max(1, buildingNodes.length || payload.buildingCount || countScopeBuildings(payload.scopeTree))
  const highestBuildingFloorCount = floorCounts.length > 0 ? Math.max(...floorCounts) : null
  const standardFloorCount = floorCounts.length > 0
    // eslint-disable-next-line -- route-level-aggregation-approved
    ? Math.round(floorCounts.reduce((sum, value) => sum + value, 0) / floorCounts.length)
    : null
  const foundationDepthM = basementDepths.length > 0 ? Math.max(...basementDepths) : null
  const basementLevelCount = scopedBasementCounts.length > 0
    ? Math.max(...scopedBasementCounts)
    : featureBasementCounts.length > 0
      ? Math.max(...featureBasementCounts)
      : foundationDepthM !== null
        ? Math.max(0, Math.round(foundationDepthM / 4.5))
        : null
  const selectedBasementAreaM2 = payload.basementAreaM2
    ?? scopedBasementAreaM2
    ?? featureBasementAreaM2
  const aboveGroundAreaM2 = payload.aboveGroundAreaM2
    ?? (payload.totalAreaM2 && selectedBasementAreaM2 && payload.totalAreaM2 > selectedBasementAreaM2
      ? Math.round(payload.totalAreaM2 - selectedBasementAreaM2)
      : null)
  const basementAreaM2 = selectedBasementAreaM2
    ?? (payload.totalAreaM2 && aboveGroundAreaM2 && payload.totalAreaM2 > aboveGroundAreaM2
      ? Math.round(payload.totalAreaM2 - aboveGroundAreaM2)
      : null)
  const siteAreaM2 = payload.siteAreaM2
    ?? physicalZoneAreaM2
  const towerCraneCount = readPositiveMax([
    payload.towerCraneCount,
    projectFeatures.towerCraneCount,
    projectFeatures.tower_crane_count,
    ...buildingMetas.map((metadata) => metadata.towerCraneCount ?? metadata.tower_crane_count),
    ...physicalZoneMetas.map((metadata) => metadata.towerCraneCount ?? metadata.tower_crane_count),
  ])
  const constructionHoistCount = readPositiveMax([
    payload.constructionHoistCount,
    projectFeatures.constructionHoistCount,
    projectFeatures.construction_hoist_count,
    ...buildingMetas.map((metadata) => metadata.constructionHoistCount ?? metadata.construction_hoist_count),
    ...physicalZoneMetas.map((metadata) => metadata.constructionHoistCount ?? metadata.construction_hoist_count),
  ])
  const functionalAreaMetas = nodes
    .filter((node) => normalizeId(node.type) === 'functional_area')
    .map(readNodeMetadata)
  const functionalUsageCodes = uniqueIds(buildingMetas.map((metadata) => metadata.functionalUsage))
  const floorUsageCodes = uniqueIds(floorMetas.map((metadata) => metadata.floorUsage))
  const functionalCategoryCodes = uniqueIds(functionalAreaMetas.map((metadata) => metadata.functionalCategory))
  const specialRoomTypeCodes = uniqueIds(functionalAreaMetas.map((metadata) => metadata.specialRoomType))
  const physicalZoneTypeCodes = uniqueIds(physicalZoneMetas.map((metadata) => metadata.physicalCategory))
  const structureTypeCode = normalizedMethods.has('modular_mic')
    ? 'factory_integrated_module'
    : normalizedMethods.has('steel_frame')
      ? 'steel_assembly'
      : normalizedMethods.has('precast_concrete')
        ? 'prefabricated_concrete'
        : highestBuildingFloorCount !== null && highestBuildingFloorCount <= 13
          ? 'frame'
          : 'shear_wall'
  const buildingPatternCodes = uniqueStrings([
    buildingCount >= 6 && highestBuildingFloorCount !== null && highestBuildingFloorCount <= 13 && (basementLevelCount ?? 0) <= 1
      ? 'multi_building_parallel_flow'
      : null,
    highestBuildingFloorCount !== null && highestBuildingFloorCount >= 18
      ? 'high_rise_core_and_floor_cycle'
      : null,
    normalizedMethods.has('precast_concrete') || (prefabRate !== null && prefabRate >= 0.2)
      ? 'prefabricated_concrete_floor_cycle'
      : null,
    normalizedMethods.has('precast_concrete') || (prefabRate !== null && prefabRate >= 0.2)
      ? 'prefabricated_factory_coordination_flow'
      : null,
    normalizedMethods.has('steel_frame')
      ? 'steel_structure_bay_zone_flow'
      : null,
    normalizedMethods.has('modular_mic')
      ? 'mic_module_factory_site_flow'
      : null,
    externalInterfaceCodes.includes('metro_operation_interface')
      ? 'operating_rail_interface_constraint_flow'
      : null,
    hardConstraintCodes.includes('non_stop_operation')
      ? 'non_stop_operation_workface_isolation_flow'
      : null,
    hardConstraintCodes.includes('occupied_renovation')
      ? 'occupied_renovation_decanting_flow'
      : null,
  ])

  return {
    methodVariantCodes,
    prefabSystemCodes,
    elementVariantCodes,
    externalInterfaceCodes,
    hardConstraintCodes,
    structureTypeCode,
    buildingCount,
    aboveGroundAreaM2,
    standardFloorCount,
    highestBuildingFloorCount,
    basementLevelCount,
    basementAreaM2,
    foundationDepthM,
    prefabRate,
    maxSpanM,
    supportHeightM,
    hasCivilDefense,
    siteAreaM2,
    towerCraneCount,
    constructionHoistCount,
    buildingPatternCodes,
    functionalUsageCodes,
    floorUsageCodes,
    functionalCategoryCodes,
    specialRoomTypeCodes,
    physicalZoneTypeCodes,
  }
}

function mergeWizardExplicitOrganizationFacts(params: {
  scopeOrganizationFacts: Record<string, unknown>
  buildingCount: number
}) {
  const facts = readRecord(params.scopeOrganizationFacts)
  const currentBuildingCount = readNumber(facts.buildingObjectCount) ?? 0
  if (currentBuildingCount > 0 || params.buildingCount <= 1) return facts
  const organizationSignals = readStringArray(facts.organizationSignals)
  return {
    ...facts,
    source: normalizeText(facts.source) || 'wizard_scope_objects',
    buildingObjectCount: params.buildingCount,
    organizationSignals: [
      ...organizationSignals,
      'explicit_building_count_fact',
      ...(params.buildingCount >= 2 ? ['multi_building_scope_objects'] : []),
    ],
  }
}

function readScopeObjectId(scopeTree: unknown[], type: string): string | null {
  const visit = (node: unknown): string | null => {
    const record = readRecord(node)
    if (record.type === type) {
      const id = firstText(record.objectId, record.object_id, record.id)
      if (id && !id.startsWith('node_')) return id
    }
    const children = Array.isArray(record.children) ? record.children : []
    for (const child of children) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  for (const node of scopeTree) {
    const found = visit(node)
    if (found) return found
  }
  return null
}

function buildProjectGenerationFacts(payload: z.infer<typeof wizardPayloadSchema>): ProjectGenerationFacts {
  const scopeFacts = buildWizardScaleFacts(payload)
  const locationFacts = buildWizardLocationFacts(payload.location)
  const generationScope = buildDraftWizardGenerationScope(payload.scopeTree)
  const scopeOrganizationFacts = buildScopeOrganizationFactsFromObjects(
    readArray(readRecord(generationScope).scope_objects),
    { source: 'wizard_scope_objects' },
  )
  const projectFeatures: Record<string, number | boolean | string | string[]> = sanitizeWizardProjectFeatures(payload.projectFeatures ?? {})
  withDefinedFact(projectFeatures, 'planScopeCaliber', payload.planScopeCaliber)
  withDefinedFact(projectFeatures, 'deliveryStandard', payload.deliveryStandard)
  withDefinedFact(projectFeatures, 'terminalEvent', payload.terminalEvent)
  withDefinedFact(projectFeatures, 'prefabSystemCodes', scopeFacts.prefabSystemCodes)
  withDefinedFact(projectFeatures, 'elementVariantCodes', scopeFacts.elementVariantCodes)
  withDefinedFact(projectFeatures, 'externalInterfaceCodes', scopeFacts.externalInterfaceCodes)
  withDefinedFact(projectFeatures, 'hardConstraintCodes', scopeFacts.hardConstraintCodes)
  withDefinedFact(projectFeatures, 'structureTypeCode', scopeFacts.structureTypeCode)
  withDefinedFact(projectFeatures, 'aboveGroundAreaM2', scopeFacts.aboveGroundAreaM2)
  withDefinedFact(projectFeatures, 'standardFloorCount', scopeFacts.standardFloorCount)
  withDefinedFact(projectFeatures, 'highestBuildingFloorCount', scopeFacts.highestBuildingFloorCount)
  withDefinedFact(projectFeatures, 'basementLevelCount', scopeFacts.basementLevelCount)
  withDefinedFact(projectFeatures, 'basementAreaM2', scopeFacts.basementAreaM2)
  withDefinedFact(projectFeatures, 'foundationDepthM', scopeFacts.foundationDepthM)
  withDefinedFact(projectFeatures, 'prefabRate', scopeFacts.prefabRate)
  withDefinedFact(projectFeatures, 'maxSpanM', scopeFacts.maxSpanM)
  withDefinedFact(projectFeatures, 'supportHeightM', scopeFacts.supportHeightM)
  withDefinedFact(projectFeatures, 'hasCivilDefense', scopeFacts.hasCivilDefense)
  withDefinedFact(projectFeatures, 'siteAreaM2', scopeFacts.siteAreaM2)
  withDefinedFact(projectFeatures, 'towerCraneCount', scopeFacts.towerCraneCount)
  withDefinedFact(projectFeatures, 'constructionHoistCount', scopeFacts.constructionHoistCount)
  withDefinedFact(projectFeatures, 'buildingPatternCodes', scopeFacts.buildingPatternCodes)
  withDefinedFact(projectFeatures, 'functionalUsageCodes', scopeFacts.functionalUsageCodes)
  withDefinedFact(projectFeatures, 'floorUsageCodes', scopeFacts.floorUsageCodes)
  withDefinedFact(projectFeatures, 'functionalCategoryCodes', scopeFacts.functionalCategoryCodes)
  withDefinedFact(projectFeatures, 'specialRoomTypeCodes', scopeFacts.specialRoomTypeCodes)
  withDefinedFact(projectFeatures, 'physicalZoneTypeCodes', scopeFacts.physicalZoneTypeCodes)
  withDefinedFact(projectFeatures, 'plannedEndDate', payload.plannedEndDate)
  withDefinedFact(projectFeatures, 'locationFacts', locationFacts)
  withDefinedFact(projectFeatures, 'climateSignals', locationFacts.climateSignals)
  withDefinedFact(projectFeatures, 'weatherImpactBands', locationFacts.weatherImpactBands)
  const projectScopeOrganizationFacts = mergeWizardExplicitOrganizationFacts({
    scopeOrganizationFacts,
    buildingCount: scopeFacts.buildingCount,
  })
  withDefinedFact(projectFeatures, 'scopeOrganizationFacts', projectScopeOrganizationFacts)
  return {
    businessType: payload.businessType as ProjectGenerationFacts['businessType'],
    businessSubtype: payload.businessSubtype as ProjectGenerationFacts['businessSubtype'],
    methodVariantCodes: scopeFacts.methodVariantCodes,
    planScopeCaliber: payload.planScopeCaliber ?? null,
    deliveryStandard: payload.deliveryStandard ?? null,
    terminalEvent: payload.terminalEvent ?? null,
    prefabSystemCodes: scopeFacts.prefabSystemCodes,
    elementVariantCodes: scopeFacts.elementVariantCodes,
    externalInterfaceCodes: scopeFacts.externalInterfaceCodes,
    hardConstraintCodes: scopeFacts.hardConstraintCodes,
    projectFeatures: projectFeatures as ProjectGenerationFacts['projectFeatures'],
    detailLevel: payload.detailLevel,
    plannedEndDate: payload.plannedEndDate ?? null,
    buildingCount: scopeFacts.buildingCount,
    totalAreaM2: payload.totalAreaM2 ?? null,
    aboveGroundAreaM2: scopeFacts.aboveGroundAreaM2,
    structureTypeCode: scopeFacts.structureTypeCode,
    standardFloorCount: scopeFacts.standardFloorCount,
    highestBuildingFloorCount: scopeFacts.highestBuildingFloorCount,
    basementLevelCount: scopeFacts.basementLevelCount,
    basementAreaM2: scopeFacts.basementAreaM2,
    foundationDepthM: scopeFacts.foundationDepthM,
    prefabRate: scopeFacts.prefabRate,
    maxSpanM: scopeFacts.maxSpanM,
    supportHeightM: scopeFacts.supportHeightM,
    hasCivilDefense: scopeFacts.hasCivilDefense,
    siteAreaM2: scopeFacts.siteAreaM2,
    towerCraneCount: scopeFacts.towerCraneCount,
    constructionHoistCount: scopeFacts.constructionHoistCount,
    buildingPatternCodes: scopeFacts.buildingPatternCodes,
    functionalUsageCodes: scopeFacts.functionalUsageCodes,
    floorUsageCodes: scopeFacts.floorUsageCodes,
    functionalCategoryCodes: scopeFacts.functionalCategoryCodes,
    specialRoomTypeCodes: scopeFacts.specialRoomTypeCodes,
    physicalZoneTypeCodes: scopeFacts.physicalZoneTypeCodes,
    climateSignals: Array.isArray(locationFacts.climateSignals) ? locationFacts.climateSignals : [],
    weatherImpactBands: Array.isArray(locationFacts.weatherImpactBands) ? locationFacts.weatherImpactBands : [],
    locationFacts,
    scopeOrganizationFacts: projectScopeOrganizationFacts,
    onboardingMode: payload.mode === 'starting_line' ? 'starting_line' : null,
    onboardingSubstage: payload.mode === 'starting_line' ? payload.onboardingSubstage ?? null : null,
    onboardingPhaseProgress: payload.mode === 'starting_line' ? payload.onboardingPhaseProgress ?? {} : {},
    onboardingPassedMilestones: payload.mode === 'starting_line' ? payload.onboardingPassedMilestones ?? [] : [],
    scopeTree: payload.scopeTree,
  }
}

function buildPublicWizardRecommendation(recommendation: TemplateRecommendation) {
  const { triggeredItemPackSources: _internalSources, ...publicRecommendation } = recommendation
  return publicRecommendation
}

function mergeWizardMetadata(
  existing: Record<string, unknown>,
  payload: z.infer<typeof wizardPayloadSchema>,
  extra: Record<string, unknown> = {},
) {
  const locationFacts = buildWizardLocationFacts(payload.location)
  return {
    ...existing,
    ...extra,
    projectGenerationFacts: buildProjectGenerationFactsSnapshot(buildProjectGenerationFacts(payload)),
    wizard_payload_snapshot: payload,
    wizard_mode: payload.mode ?? 'new',
    wizard_detail_level: payload.detailLevel,
    wizard_business_type: payload.businessType,
    wizard_business_subtype: payload.businessSubtype ?? null,
    wizard_scope_tree_snapshot: payload.scopeTree,
    wizard_location_facts: locationFacts,
    is_historical: payload.mode === 'starting_line',
  }
}

function stripWizardDraftTrace(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripWizardDraftTrace)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== 'wizardScopeNodeId' && key !== 'wizardMaterializedBy')
      .map(([key, child]) => [key, stripWizardDraftTrace(child)]),
  )
}

function sanitizeMaterializedGenerationScope(scope: Record<string, unknown> | null | undefined) {
  if (!scope) return {}
  return stripWizardDraftTrace(scope) as Record<string, unknown>
}

function hasMaterializedGenerationScope(scope: Record<string, unknown> | null | undefined) {
  const record = readRecord(scope)
  return readArray(record.scope_combos ?? record.scopeCombos).length > 0
    || readArray(record.scope_objects ?? record.scopeObjects).length > 0
}

function hasWizardScopeObjectId(values: Record<string, unknown>) {
  return WIZARD_SCOPE_OBJECT_FIELDS.some((field) => normalizeText(values[field]))
}

function readScopeFallbackFromScopeObject(scopeObject: unknown): Record<string, unknown> | null {
  const record = readRecord(scopeObject)
  const id = normalizeText(record.id ?? record.objectId ?? record.object_id)
  const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
  const field = WIZARD_SCOPE_OBJECT_FIELD_BY_TYPE[type]
  return id && field ? { [field]: id } : null
}

function buildGeneratedTaskScopeFallback(generationScope: Record<string, unknown> | null | undefined) {
  const scope = readRecord(generationScope)
  for (const comboInput of readArray(scope.scope_combos ?? scope.scopeCombos)) {
    const combo = readRecord(comboInput)
    const fallback: Record<string, unknown> = {}
    for (const field of WIZARD_SCOPE_OBJECT_FIELDS) {
      const value = normalizeText(combo[field])
      if (value) fallback[field] = value
    }
    if (hasWizardScopeObjectId(fallback)) return fallback
  }

  for (const objectInput of readArray(scope.scope_objects ?? scope.scopeObjects)) {
    const fallback = readScopeFallbackFromScopeObject(objectInput)
    if (fallback) return fallback
  }

  return {}
}

function applyGeneratedTaskScopeFallback(values: Record<string, unknown>, fallback: Record<string, unknown>) {
  if (hasWizardScopeObjectId(values)) return values
  if (!hasWizardScopeObjectId(fallback)) return values
  return {
    ...values,
    ...fallback,
    standard_task_metadata: {
      ...readRecord(values.standard_task_metadata),
      wizardScopeFallbackApplied: true,
      wizardScopeFallbackSource: 'materialized_generation_scope',
    },
  }
}

function readWizardDiagnosticContext(metadata: Record<string, unknown> | null | undefined) {
  const record = readRecord(metadata)
  const diagnostic = normalizeText(record.createdForDiagnostic)
  const diagnosticRunId = normalizeText(record.diagnosticRunId)
  const disposable = record.disposable === true || normalizeText(record.disposable).toLowerCase() === 'true'
  if (diagnostic !== WIZARD_DIAGNOSTIC_C18_L09 || !diagnosticRunId || !disposable) return null
  return {
    diagnostic,
    diagnosticRunId,
  }
}

const WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL = 'planning_skeleton'
const WIZARD_MANAGED_FRONTIER_GENERATION_DEPTH = 'managed_frontier'

function readWizardMasterPlanProfile(recommendation: ReturnType<typeof buildTemplateRecommendation>) {
  const profile = readRecord((recommendation as unknown as Record<string, unknown>).masterPlanProfile)
  const rawRange = Array.isArray(profile.rowCountRange) ? profile.rowCountRange : []
  const lower = typeof rawRange[0] === 'number' && Number.isFinite(rawRange[0]) ? rawRange[0] : 80
  const upper = typeof rawRange[1] === 'number' && Number.isFinite(rawRange[1]) ? rawRange[1] : 180
  return {
    layer: 'master_plan' as const,
    detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL,
    generationDepth: WIZARD_MANAGED_FRONTIER_GENERATION_DEPTH,
    rowCountRange: [lower, Math.max(lower, upper)] as [number, number],
    rowProjectionMode: 'schedule_row' as const,
    supportLayerPolicy: {
      gateMarkers: 'supporting_evidence_not_default_gantt_rows' as const,
      inlineControls: 'embedded_under_schedule_rows' as const,
      linkedProjections: 'review_reference_not_default_gantt_rows' as const,
    },
    mutationBoundary: {
      writesProductionDependencies: false as const,
      writesProductionDates: false as const,
      writesCriticalPathFacts: false as const,
    },
  }
}

function buildWizardOperation(params: {
  payload: z.infer<typeof wizardPayloadSchema>
  recommendation: ReturnType<typeof buildTemplateRecommendation>
  generationBatchId: string
  generationScope?: Record<string, unknown> | null
  diagnosticContext?: { diagnostic: string; diagnosticRunId: string } | null
}): PlanningTableOperation {
  const payload = params.payload
  const diagnosticContext = params.diagnosticContext ?? null
  const projectTimelineStartDate = payload.mode === 'starting_line'
    ? payload.actualStartDate ?? payload.plannedStartDate ?? now().slice(0, 10)
    : payload.plannedStartDate ?? now().slice(0, 10)
  const scheduleAnchorDate = payload.mode === 'starting_line'
    ? payload.actualStartDate ?? payload.plannedStartDate ?? now().slice(0, 10)
    : payload.plannedStartDate ?? now().slice(0, 10)
  const projectFacts = buildProjectGenerationFacts(payload)
  const locationFacts = readRecord(projectFacts.locationFacts)
  const templateSelection = buildWizardTemplateSelection(params.recommendation)
  const templateIds = templateSelection.templateIds
  const masterPlanProfile = readWizardMasterPlanProfile(params.recommendation)
  const defaultPlanOutput = (params.recommendation as unknown as Record<string, unknown>).defaultPlanOutput === 'master_plan'
    ? 'master_plan'
    : masterPlanProfile.layer
  const fallbackDirectScope = hasMaterializedGenerationScope(params.generationScope)
    ? {}
    : {
        phase_object_id: readScopeObjectId(payload.scopeTree, 'phase'),
        section_object_id: readScopeObjectId(payload.scopeTree, 'section'),
        building_object_id: readScopeObjectId(payload.scopeTree, 'building'),
        basement_object_id: readScopeObjectId(payload.scopeTree, 'basement'),
        floor_object_id: readScopeObjectId(payload.scopeTree, 'floor'),
        physical_zone_object_id: readScopeObjectId(payload.scopeTree, 'physical_zone'),
        functional_area_object_id: readScopeObjectId(payload.scopeTree, 'functional_area'),
      }

  return {
    type: 'template_generate',
    generationBatchId: params.generationBatchId,
    templateId: CHINA_GB55032_TEMPLATE_ID,
    templateIds,
    selectedNodeIds: [],
    selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
    scope: {
      scopeExpansionMode: 'project',
      projectTypeCode: payload.businessType,
      structureTypeCode: projectFacts.structureTypeCode,
      methodVariantCodes: projectFacts.methodVariantCodes,
      buildingPatternCodes: projectFacts.buildingPatternCodes,
      totalAreaM2: projectFacts.totalAreaM2,
      aboveGroundAreaM2: projectFacts.aboveGroundAreaM2,
      buildingCount: projectFacts.buildingCount,
      standardFloorCount: projectFacts.standardFloorCount,
      highestBuildingFloorCount: projectFacts.highestBuildingFloorCount,
      basementLevelCount: projectFacts.basementLevelCount,
      basementAreaM2: projectFacts.basementAreaM2,
      foundationDepthM: projectFacts.foundationDepthM,
      prefabRate: projectFacts.prefabRate,
      maxSpanM: projectFacts.maxSpanM,
      supportHeightM: projectFacts.supportHeightM,
      hasCivilDefense: projectFacts.hasCivilDefense,
      siteAreaM2: projectFacts.siteAreaM2,
      towerCraneCount: projectFacts.towerCraneCount,
      constructionHoistCount: projectFacts.constructionHoistCount,
      functionalUsageCodes: projectFacts.functionalUsageCodes,
      floorUsageCodes: projectFacts.floorUsageCodes,
      functionalCategoryCodes: projectFacts.functionalCategoryCodes,
      specialRoomTypeCodes: projectFacts.specialRoomTypeCodes,
      physicalZoneTypeCodes: projectFacts.physicalZoneTypeCodes,
      onboardingMode: projectFacts.onboardingMode,
      onboardingSubstage: projectFacts.onboardingSubstage,
      onboardingPassedMilestones: projectFacts.onboardingPassedMilestones,
      onboardingPhaseProgress: projectFacts.onboardingPhaseProgress,
      planScopeCaliber: projectFacts.planScopeCaliber,
      deliveryStandard: projectFacts.deliveryStandard,
      terminalEvent: projectFacts.terminalEvent,
      prefabSystemCodes: projectFacts.prefabSystemCodes,
      elementVariantCodes: projectFacts.elementVariantCodes,
      externalInterfaceCodes: projectFacts.externalInterfaceCodes,
      hardConstraintCodes: projectFacts.hardConstraintCodes,
      locationFacts,
      climate_signal: Array.isArray(locationFacts.climateSignals) ? locationFacts.climateSignals[0] : null,
      monthly_climate_signal: Array.isArray(locationFacts.climateSignals) ? locationFacts.climateSignals[0] : null,
      weather_impact_bands: Array.isArray(locationFacts.weatherImpactBands) ? locationFacts.weatherImpactBands : [],
      ...fallbackDirectScope,
      ...sanitizeMaterializedGenerationScope(params.generationScope),
    },
    projectFacts: {
      ...(projectFacts as unknown as Record<string, unknown>),
      mode: payload.mode ?? 'new',
      defaultPlanOutput,
      masterPlanProfile,
      actualStartDate: payload.actualStartDate ?? null,
      onboardingSubstage: payload.mode === 'starting_line' ? payload.onboardingSubstage ?? null : null,
      onboardingPhaseProgress: payload.mode === 'starting_line' ? payload.onboardingPhaseProgress ?? {} : {},
      onboardingPassedMilestones: payload.mode === 'starting_line' ? payload.onboardingPassedMilestones ?? [] : [],
    },
    plannedStartDate: scheduleAnchorDate,
    detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL,
    generationDepth: WIZARD_MANAGED_FRONTIER_GENERATION_DEPTH,
    includeActivitySteps: false,
    ...(diagnosticContext ? { diagnosticStageTimings: true } : {}),
    sortOrder: 0,
    clientContext: {
      fieldRegistryVersion: PLANNING_FIELD_REGISTRY_VERSION,
      source: 'project_wizard',
      defaultPlanOutput,
      planOutputLayer: masterPlanProfile.layer,
      masterPlanProfile,
      requestedDetailLevel: payload.detailLevel,
      detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL,
      generationDepth: WIZARD_MANAGED_FRONTIER_GENERATION_DEPTH,
      includeActivitySteps: false,
      projectTimelineStartDate,
      scheduleAnchorDate,
      projectPlannedEndDate: payload.plannedEndDate ?? null,
      targetConstraintMode: 'compression_preview',
      locationFacts,
      ...(diagnosticContext ? diagnosticContext : {}),
    },
  }
}

function buildWizardProfileConfirmationIssues(params: {
  payload: z.infer<typeof wizardPayloadSchema>
  facts: ProjectGenerationFacts
}) {
  const issues: Array<{ code: string; severity: 'info' | 'warning'; message: string }> = []
  const facts = params.facts
  if (!params.payload.location) {
    issues.push({
      code: 'LOCATION_MISSING',
      severity: 'warning',
      message: '项目地点未填写，冬雨季、气候窗口和地域工效规则暂不能参与判断。',
    })
  } else if (readRecord(facts.locationFacts).inferenceStatus === 'unmatched') {
    issues.push({
      code: 'LOCATION_UNMATCHED',
      severity: 'info',
      message: '项目地点已记录，但暂未匹配到明确气候分区；后续可由项目管理员补充区域规则。',
    })
  }
  if (!params.payload.plannedEndDate) {
    issues.push({
      code: 'TARGET_END_MISSING',
      severity: 'info',
      message: '未填写目标竣工日期，本次只生成自然排期，不做目标工期校准。',
    })
  }
  if ((facts.totalAreaM2 ?? 0) > 0 && facts.buildingCount <= 1 && (facts.highestBuildingFloorCount ?? 0) <= 6 && Number(facts.totalAreaM2) >= 80000) {
    issues.push({
      code: 'SCALE_MISMATCH',
      severity: 'warning',
      message: '总建筑面积较大，但范围树中单体和层数偏少，请确认工程范围是否漏填。',
    })
  }
  if (facts.businessType === 'hospital' && !(facts.specialRoomTypeCodes?.length || facts.functionalCategoryCodes?.length)) {
    issues.push({
      code: 'HOSPITAL_FEATURE_CONFIRMATION',
      severity: 'info',
      message: '医院项目暂未识别到手术部、ICU、洁净区等特殊空间，如项目包含这些空间，请在范围树或特征中补充。',
    })
  }
  return issues
}

type CommercialFactReadinessStatus = 'ready' | 'warning' | 'blocking' | 'disabled'
type CommercialFactReadinessCode = 'scale' | 'method' | 'scope' | 'special_feature' | 'resource_assumption'

interface CommercialFactReadinessItem {
  code: CommercialFactReadinessCode
  label: string
  status: CommercialFactReadinessStatus
  title: string
  detail: string
  action: string | null
  evidence: string[]
}

function formatFactNumber(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return `${new Intl.NumberFormat('zh-CN').format(value)}${suffix}`
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return `${Math.round(value * 100)}%`
}

function buildCommercialFactReadiness(params: {
  facts: ProjectGenerationFacts
  generationScope: Record<string, unknown>
  scopeCoverageDiagnostics: ScopeCoverageDiagnostic[]
  scopeTemplateCoverage: ReturnType<typeof evaluateScopeTemplateCoverage>
  wbsReadinessIssues: ReturnType<typeof mapScopeReadinessIssuesToProfileIssues>
}) {
  const facts = params.facts
  const generationScope = readRecord(params.generationScope)
  const scopeObjects = readArray(generationScope.scope_objects)
  const scopeCombos = readArray(generationScope.scope_combos)
  const selectedFeatureKeys = Object.keys(facts.projectFeatures ?? {})
    .filter((key) => {
      const value = readRecord(facts.projectFeatures)[key]
      if (typeof value === 'boolean') return value
      if (typeof value === 'number') return Number.isFinite(value) && value > 0
      return Array.isArray(value) ? value.length > 0 : Boolean(value)
    })
  const inferredFeatureCodes = uniqueStrings([
    ...(facts.functionalUsageCodes ?? []),
    ...(facts.floorUsageCodes ?? []),
    ...(facts.functionalCategoryCodes ?? []),
    ...(facts.specialRoomTypeCodes ?? []),
    ...(facts.physicalZoneTypeCodes ?? []),
    ...(facts.externalInterfaceCodes ?? []),
    ...(facts.hardConstraintCodes ?? []),
  ])

  const scaleEvidence = [
    formatFactNumber(facts.totalAreaM2, ' m²') ? `总建筑面积 ${formatFactNumber(facts.totalAreaM2, ' m²')}` : null,
    `单体数量 ${facts.buildingCount} 栋`,
    formatFactNumber(facts.highestBuildingFloorCount, ' 层') ? `最高层数 ${formatFactNumber(facts.highestBuildingFloorCount, ' 层')}` : null,
    formatFactNumber(facts.basementLevelCount, ' 层') ? `地下层数 ${formatFactNumber(facts.basementLevelCount, ' 层')}` : null,
    formatFactNumber(facts.basementAreaM2, ' m²') ? `地下建筑面积 ${formatFactNumber(facts.basementAreaM2, ' m²')}` : null,
  ].filter((item): item is string => Boolean(item))
  const scaleReady = facts.buildingCount > 0
    && (facts.totalAreaM2 ?? 0) > 0
    && ((facts.highestBuildingFloorCount ?? 0) > 0 || (facts.standardFloorCount ?? 0) > 0)
  const scaleItem: CommercialFactReadinessItem = {
    code: 'scale',
    label: '规模体量事实',
    status: scaleReady ? 'ready' : 'warning',
    title: scaleReady ? '规模体量可用于模板生成' : '规模体量可用但建议补齐',
    detail: scaleReady
      ? '总建筑面积、楼栋数、层数和地下室事实已经汇总为生成器可消费口径。'
      : '生成器已尽量从范围树推断体量，但总面积、层数或地下室事实还不完整。',
    action: scaleReady ? null : '回到规模体量补齐总面积、楼栋层数、地下室层数或地库面积。',
    evidence: scaleEvidence,
  }

  const prefabRateText = formatPercent(facts.prefabRate)
  const methodNeedsPrefabRate = (facts.methodVariantCodes ?? []).some((code) => normalizeId(code).includes('precast'))
  const methodReady = (facts.methodVariantCodes ?? []).length > 0 && (!methodNeedsPrefabRate || prefabRateText !== null)
  const methodItem: CommercialFactReadinessItem = {
    code: 'method',
    label: '工法/工业化事实',
    status: methodReady ? 'ready' : 'warning',
    title: methodReady ? '工法画像可用于模板选择' : '工法画像需要补充关键参数',
    detail: methodReady
      ? '工法、构件体系和工业化参数已进入模板推荐与工期事实。'
      : '已识别装配式工法，但装配率缺失，PC 工厂段、吊装节拍和专项验收只能按默认值估算。',
    action: methodReady ? null : '在工程特征中补充装配率或调整工法选择。',
    evidence: [
      `工法 ${(facts.methodVariantCodes ?? []).join('、') || '未识别'}`,
      ...(facts.prefabSystemCodes?.length ? [`构件体系 ${facts.prefabSystemCodes.join('、')}`] : []),
      ...(prefabRateText ? [`装配率 ${prefabRateText}`] : []),
      ...(facts.buildingPatternCodes?.length ? [`building_pattern ${facts.buildingPatternCodes.join('、')}`] : []),
    ],
  }

  const hasBlockingScope = params.wbsReadinessIssues.length > 0 || params.scopeTemplateCoverage.summary.missingRequiredScopeCount > 0
  const hasWarningScope = params.scopeCoverageDiagnostics.some((item) => item.severity === 'warning')
  const scopeStatus: CommercialFactReadinessStatus = hasBlockingScope ? 'blocking' : hasWarningScope ? 'warning' : 'ready'
  const scopeItem: CommercialFactReadinessItem = {
    code: 'scope',
    label: '范围/空间结构事实',
    status: scopeStatus,
    title: hasBlockingScope
      ? '空间结构还不能安全生成 WBS'
      : hasWarningScope
        ? '空间结构可生成但有补充项'
        : '空间结构可用于任务挂接',
    detail: hasBlockingScope
      ? '已有模板需要的工程空间缺失，系统会阻断生成以避免任务挂错位置。'
      : hasWarningScope
        ? '工程对象已物化为生成范围，部分空间生成后需要人工补充专项任务或复核面积。'
        : '工程对象、scope_objects 和 scope_combos 已形成，标准工序与专项工序可按空间挂接。',
    action: hasBlockingScope ? '回到规模体量补齐缺失工程空间。' : null,
    evidence: [
      `scope_objects ${scopeObjects.length} 个`,
      `scope_combos ${scopeCombos.length} 组`,
      `可自动挂接 ${params.scopeTemplateCoverage.summary.autoSchedulableCount} 项`,
      `生成后补充 ${params.scopeTemplateCoverage.summary.manualTaskRequiredCount} 项`,
      `缺少空间 ${params.scopeTemplateCoverage.summary.missingRequiredScopeCount} 项`,
    ],
  }

  const needsSpecialFeatureConfirmation = (
    (facts.businessType === 'hospital' && !(facts.specialRoomTypeCodes?.length || facts.functionalCategoryCodes?.length))
    || (facts.businessType === 'data_center' && selectedFeatureKeys.length === 0 && inferredFeatureCodes.length === 0)
    || (facts.businessType === 'industrial' && selectedFeatureKeys.length === 0 && inferredFeatureCodes.length === 0)
  )
  const specialItem: CommercialFactReadinessItem = {
    code: 'special_feature',
    label: '专项工程特征事实',
    status: needsSpecialFeatureConfirmation ? 'warning' : 'ready',
    title: needsSpecialFeatureConfirmation ? '专项工程特征建议补充确认' : '专项特征可用于专项工序触发',
    detail: needsSpecialFeatureConfirmation
      ? '当前业态通常需要特殊房间、洁净等级、机柜密度或工艺约束，缺失时专项模板只能按通用规则触发。'
      : '已选特征、范围树推断特征和外部约束已进入专项工序触发依据；没有识别到需要阻断生成的专项缺口。',
    action: needsSpecialFeatureConfirmation ? '在工程特征或空间结构中补充专项空间、工艺参数或约束条件。' : null,
    evidence: [
      ...(selectedFeatureKeys.length ? selectedFeatureKeys : ['未选择专项数值特征']),
      ...(inferredFeatureCodes.length ? inferredFeatureCodes : ['未识别额外专项空间']),
    ],
  }

  const resourceDisabled = facts.towerCraneCount === null && facts.constructionHoistCount === null
  const resourceItem: CommercialFactReadinessItem = {
    code: 'resource_assumption',
    label: '资源配置假设事实',
    status: resourceDisabled ? 'disabled' : 'ready',
    title: resourceDisabled ? '资源配置假设当前不参与工期估算' : '显式资源事实已记录',
    detail: resourceDisabled
      ? '当前向导没有可靠来源或可审计公式，不伪造塔吊或施工电梯数量；本次工期估算不读取资源配置假设。'
      : '塔吊、施工电梯等配置只作为旁路可行性信号进入项目事实、施工组织解释和赶工上下文，不反向决定计划骨架。',
    action: null,
    evidence: [
      `towerCraneCount=${facts.towerCraneCount ?? 'null'}`,
      `constructionHoistCount=${facts.constructionHoistCount ?? 'null'}`,
    ],
  }

  const items = [scaleItem, methodItem, scopeItem, specialItem, resourceItem]
  return {
    summary: {
      // eslint-disable-next-line -- route-level-aggregation-approved
      readyCount: items.filter((item) => item.status === 'ready').length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      warningCount: items.filter((item) => item.status === 'warning').length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      blockingCount: items.filter((item) => item.status === 'blocking').length,
      // eslint-disable-next-line -- route-level-aggregation-approved
      disabledCount: items.filter((item) => item.status === 'disabled').length,
    },
    items,
  }
}

function mapScopeReadinessIssuesToProfileIssues(issues: ScopeGenerationReadinessIssue[]) {
  return issues.map((issue) => ({
    code: 'SCOPE_WBS_READINESS_MISSING',
    severity: 'blocking' as const,
    title: issue.title ?? issue.scopeName ?? '范围体量缺少必要信息',
    message: [issue.message, issue.action].filter(Boolean).join(' '),
    action: issue.action,
    impact: issue.impact,
    scopeName: issue.scopeName,
    source: issue.source,
    details: issue.details,
  }))
}

function textMatchesRulePattern(value: unknown, pattern: unknown) {
  const normalizedValue = normalizeText(value)
  const normalizedPattern = normalizeText(pattern)
  if (!normalizedValue || !normalizedPattern) return false
  if (normalizedPattern === '.*' || normalizedPattern === '*') return true
  if (
    normalizedValue === normalizedPattern
    || normalizedValue.startsWith(normalizedPattern)
    || normalizedValue.includes(normalizedPattern)
  ) {
    return true
  }
  try {
    return new RegExp(normalizedPattern, 'i').test(normalizedValue)
  } catch {
    return false
  }
}

function scopeObjectMatchesMetadata(object: Record<string, unknown>, expectedMetadata: Record<string, unknown>) {
  const metadata = readRecord(object.metadata)
  const entries = Object.entries(expectedMetadata).filter(([, expected]) => normalizeText(expected))
  if (entries.length === 0) return true
  return entries.every(([key, expected]) => {
    const value = metadata[key]
    const normalizedValue = normalizeText(value)
    const normalizedExpected = normalizeText(expected)
    return Boolean(normalizedValue && normalizedExpected) && (
      normalizedValue === normalizedExpected
      || normalizeId(normalizedValue) === normalizeId(normalizedExpected)
      || normalizedValue.includes(normalizedExpected)
      || normalizedExpected.includes(normalizedValue)
    )
  })
}

function readGenerationScopeObjects(generationScope: unknown) {
  return readArray(readRecord(generationScope).scope_objects ?? readRecord(generationScope).scopeObjects)
    .map((item) => {
      const record = readRecord(item)
      const id = normalizeText(record.id ?? record.objectId ?? record.object_id)
      const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
      const name = normalizeText(record.name ?? record.objectName ?? record.object_name)
      if (!id || !type) return null
      return {
        id,
        type,
        name,
        metadata: readRecord(record.metadata),
      }
    })
    .filter((item): item is { id: string; type: string; name: string; metadata: Record<string, unknown> } => Boolean(item))
}

type ScopePreflightRecommendation = Pick<
  TemplateRecommendation,
  | 'matchedTemplates'
  | 'triggeredItemPacks'
  | 'triggeredDangerItems'
  | 'triggeredMilestones'
  | 'scopeAssignmentRules'
> & Partial<Pick<TemplateRecommendation, 'triggeredItemPackSources' | 'triggeredItemPackScopeTargets'>>

function readTriggeredTemplateKeys(recommendation: ScopePreflightRecommendation) {
  return uniqueStrings([
    ...recommendation.matchedTemplates,
    ...recommendation.triggeredItemPacks,
    ...recommendation.triggeredDangerItems,
    ...recommendation.triggeredMilestones,
  ])
}

const BLOCKING_ITEM_PACK_TRIGGER_SOURCES = new Set<TriggeredItemPackSource>([
  'explicit_user_selection',
  'physical_scope',
  'project_feature',
  'method',
  'prefab_system',
  'external_interface',
  'hard_constraint',
  'delivery_standard',
  'terminal_event',
  'floor_usage',
])

function readItemPackTriggerSourcesForKey(recommendation: ScopePreflightRecommendation, key: unknown) {
  const normalizedKey = normalizeText(key).toLowerCase()
  if (!normalizedKey) return []
  const sourceEntries = Object.entries(readRecord(recommendation.triggeredItemPackSources))
  const matched = sourceEntries.find(([sourceKey]) => normalizeText(sourceKey).toLowerCase() === normalizedKey)
  if (!matched) return []
  const sources = readArray(matched[1])
    .map((source) => normalizeId(source))
    .filter(Boolean)
  return sources
}

function readItemPackTriggerSourcesForRule(
  recommendation: ScopePreflightRecommendation,
  itemPackPattern: unknown,
) {
  const pattern = normalizeText(itemPackPattern)
  if (!pattern) return []
  const patternParts = pattern
    .split('|')
    .map((part) => normalizeText(part))
    .filter(Boolean)
  const directItemPackKeys = recommendation.triggeredItemPacks
    .filter((key) => (
      textMatchesRulePattern(key, pattern)
      || patternParts.some((part) => textMatchesRulePattern(key, part))
    ))
  return uniqueStrings(directItemPackKeys.flatMap((key) => readItemPackTriggerSourcesForKey(recommendation, key)))
}

function readPhysicalCategoryFromScopeRule(rule: Record<string, unknown>) {
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  return normalizeId(matchMetadata.physicalCategory ?? matchMetadata.physical_category)
}

function readTriggeredScopeTargetsForKey(recommendation: ScopePreflightRecommendation, key: unknown) {
  const normalizedKey = normalizeText(key).toLowerCase()
  if (!normalizedKey) return []
  const targetEntries = Object.entries(readRecord(recommendation.triggeredItemPackScopeTargets))
  const matched = targetEntries.find(([targetKey]) => normalizeText(targetKey).toLowerCase() === normalizedKey)
  if (!matched) return []
  return readArray(matched[1])
    .map((target) => normalizeId(target))
    .filter(Boolean)
}

function independentEngineeringZoneTriggerMatchesRule(
  recommendation: ScopePreflightRecommendation,
  itemPackPattern: unknown,
  rule: Record<string, unknown>,
) {
  const expectedPhysicalCategory = readPhysicalCategoryFromScopeRule(rule)
  if (!expectedPhysicalCategory) return true
  const pattern = normalizeText(itemPackPattern)
  if (!pattern) return true
  const patternParts = pattern
    .split('|')
    .map((part) => normalizeText(part))
    .filter(Boolean)
  const directItemPackKeys = recommendation.triggeredItemPacks
    .filter((key) => (
      textMatchesRulePattern(key, pattern)
      || patternParts.some((part) => textMatchesRulePattern(key, part))
    ))
  const scopeTargets = uniqueStrings(directItemPackKeys.flatMap((key) => readTriggeredScopeTargetsForKey(recommendation, key)))
  return scopeTargets.length === 0 || scopeTargets.includes(expectedPhysicalCategory)
}

function hasBlockingIndependentEngineeringZoneItemPackSource(
  recommendation: ScopePreflightRecommendation,
  itemPackPattern: unknown,
  rule?: Record<string, unknown>,
) {
  const sources = readItemPackTriggerSourcesForRule(recommendation, itemPackPattern)
  return sources.some((source) => BLOCKING_ITEM_PACK_TRIGGER_SOURCES.has(source as TriggeredItemPackSource))
    && (!rule || independentEngineeringZoneTriggerMatchesRule(recommendation, itemPackPattern, rule))
}

function findTriggeredTemplateIdForRule(triggeredKeys: string[], itemPackPattern: unknown) {
  return findWizardStableCodeMatchingTemplateId(triggeredKeys, itemPackPattern, textMatchesRulePattern)
}

function isIndependentEngineeringZoneScopeRule(rule: Record<string, unknown>) {
  const effect = normalizeText(rule.effect)
  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const physicalSpaceKind = normalizeId(matchMetadata.physicalSpaceKind ?? matchMetadata.physical_space_kind)
  return effect === 'assign_to_scope_object'
    && targetType === 'physical_zone'
    && physicalSpaceKind === 'independent_engineering_zone'
}

function canPreflightScopeRuleFromTriggeredTemplate(rule: Record<string, unknown>) {
  if (isIndependentEngineeringZoneScopeRule(rule)) return false
  return normalizeText(rule.effect) !== 'assign_to_matching_buildings'
}

function shouldKeepTemplateScopeWarning(
  warning: Record<string, unknown>,
  recommendation: ScopePreflightRecommendation,
) {
  if (normalizeText(warning.code) !== 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND') return true
  const details = readRecord(warning.details)
  if (!isIndependentEngineeringZoneScopeRule(details)) return true
  const itemPackPattern = normalizeText(details.itemPackPattern ?? details.item_pack_pattern ?? warning.nodeCode ?? warning.node_code)
  if (!itemPackPattern) return true
  return hasBlockingIndependentEngineeringZoneItemPackSource(recommendation, itemPackPattern, details)
}

function readScopeAssignmentMissingObjectLabel(rule: Record<string, unknown>) {
  const effect = normalizeText(rule.effect)
  if (effect === 'assign_to_functional_area') return '功能区域'
  if (effect === 'assign_to_matching_buildings' || effect === 'assign_to_all_buildings') return '楼栋'

  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const physicalSpaceKind = normalizeId(matchMetadata.physicalSpaceKind ?? matchMetadata.physical_space_kind)
  const physicalCategory = normalizeId(matchMetadata.physicalCategory ?? matchMetadata.physical_category)
  const floorUsage = normalizeId(matchMetadata.floorUsage ?? matchMetadata.floor_usage)
  if (targetType === 'basement') return '地下室'
  if (targetType === 'floor') {
    if (floorUsage === 'refuge') return '避难层'
    if (floorUsage === 'ground_pilotis') return '架空层'
    if (floorUsage === 'mechanical') return '设备层'
    if (floorUsage === 'transfer') return '转换层'
    return '特殊楼层'
  }
  if (targetType === 'physical_zone') {
    if (physicalSpaceKind === 'outdoor_site') return '室外总平'
    if (physicalSpaceKind === 'independent_engineering_zone') {
      const categoryLabel = normalizeText(matchMetadata.physicalCategoryLabel ?? matchMetadata.physical_category_label)
      if (categoryLabel) return categoryLabel
      const knownLabels: Record<string, string> = {
        switching_station: '开闭所',
        fire_pump_room: '消防泵房',
        heat_exchange_station: '换热站',
        waste_room: '垃圾房',
        liquid_oxygen_station: '液氧站',
        sewage_treatment_station: '污水处理站',
        medical_waste_holding: '医疗废物暂存间',
        hyperbaric_oxygen_chamber: '高压氧舱',
        substation: '变配电所',
        generator_yard: '柴油发电机区',
        cooling_plant: '冷站',
        transfer_passage: '换乘通道',
        traffic_connection_zone: '交通接驳区',
      }
      return knownLabels[physicalCategory] ?? '独立工程区'
    }
    return '工程区域'
  }
  if (targetType === 'functional_area') return '功能区域'
  return '对应空间'
}

function findScopeAssignmentTargets(generationScope: unknown, rule: Record<string, unknown>) {
  const objects = readGenerationScopeObjects(generationScope)
  const effect = normalizeText(rule.effect)
  if (effect === 'assign_to_all_buildings') return objects.filter((object) => object.type === 'building')
  if (effect === 'assign_to_matching_buildings') {
    const expectedUsage = normalizeText(rule.matchFunctionalUsage ?? rule.match_functional_usage)
    return objects.filter((object) => (
      object.type === 'building'
      && Boolean(expectedUsage)
      && scopeObjectMatchesMetadata(object, {
        functionalUsage: expectedUsage,
      })
    ))
  }
  if (effect === 'assign_to_functional_area') {
    const expectedCategory = normalizeText(rule.functionalAreaCategory ?? rule.functional_area_category)
    return objects.filter((object) => (
      object.type === 'functional_area'
      && Boolean(expectedCategory)
      && (
        scopeObjectMatchesMetadata(object, { functionalCategory: expectedCategory })
        || scopeObjectMatchesMetadata(object, { category: expectedCategory })
        || scopeObjectMatchesMetadata(object, { specialRoomType: expectedCategory })
      )
    ))
  }
  if (effect !== 'assign_to_scope_object') return []

  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  const matchObjectName = normalizeText(rule.matchObjectName ?? rule.match_object_name)
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  return objects.filter((object) => (
    object.type === targetType
    && (!matchObjectName || textMatchesRulePattern(object.name, matchObjectName))
    && scopeObjectMatchesMetadata(object, matchMetadata)
  ))
}

function isScopeAssignmentRulePreflightable(rule: Record<string, unknown>) {
  const effect = normalizeText(rule.effect)
  if (effect === 'assign_to_all_buildings') return true
  if (effect === 'assign_to_matching_buildings') {
    return Boolean(normalizeText(rule.matchFunctionalUsage ?? rule.match_functional_usage))
  }
  if (effect === 'assign_to_functional_area') {
    return Boolean(normalizeText(rule.functionalAreaCategory ?? rule.functional_area_category))
  }
  if (effect === 'assign_to_scope_object') {
    return Boolean(normalizeText(rule.targetObjectType ?? rule.target_object_type))
  }
  return false
}

function buildScopeAssignmentTargetPresenceGroupKey(
  rule: Record<string, unknown>,
  options: { allowIndependentEngineeringZoneVariantCoverage?: boolean } = {},
) {
  const matchMetadata = readRecord(rule.matchMetadata ?? rule.match_metadata)
  const effect = normalizeId(rule.effect)
  const targetType = normalizeId(rule.targetObjectType ?? rule.target_object_type)
  const physicalSpaceKind = normalizeId(matchMetadata.physicalSpaceKind ?? matchMetadata.physical_space_kind)
  if (
    options.allowIndependentEngineeringZoneVariantCoverage
    && effect === 'assign_to_scope_object'
    && targetType === 'physical_zone'
    && physicalSpaceKind === 'independent_engineering_zone'
  ) {
    return [
      normalizeText(rule.itemPackPattern ?? rule.item_pack_pattern),
      effect,
      targetType,
      physicalSpaceKind,
      normalizeText(rule.matchObjectName ?? rule.match_object_name),
    ].join('|')
  }

  return [
    normalizeText(rule.itemPackPattern ?? rule.item_pack_pattern),
    effect,
    targetType,
    normalizeText(rule.matchFunctionalUsage ?? rule.match_functional_usage),
    normalizeText(rule.functionalAreaCategory ?? rule.functional_area_category),
    normalizeText(rule.matchObjectName ?? rule.match_object_name),
    JSON.stringify(Object.fromEntries(Object.entries(matchMetadata).sort(([left], [right]) => left.localeCompare(right)))),
  ].join('|')
}

function evaluateTriggeredTemplateScopeReadiness(params: {
  recommendation: ScopePreflightRecommendation
  generationScope: unknown
  allowIndependentEngineeringZoneVariantCoverage?: boolean
}): ReturnType<typeof evaluateGeneratedTemplateScopeReadiness> {
  const triggeredKeys = readTriggeredTemplateKeys(params.recommendation)
  if (triggeredKeys.length === 0) return { ready: true, issues: [] }

  const triggeredRules = params.recommendation.scopeAssignmentRules
    .map((rule) => ({
      rule,
      triggeredByTemplateId: findTriggeredTemplateIdForRule(triggeredKeys, rule.itemPackPattern),
      directlyTriggered: triggeredKeys.some((key) => textMatchesRulePattern(key, rule.itemPackPattern)),
      blockingIndependentEngineeringZoneItemPack: isIndependentEngineeringZoneScopeRule(rule as unknown as Record<string, unknown>)
        ? hasBlockingIndependentEngineeringZoneItemPackSource(params.recommendation, rule.itemPackPattern, rule as unknown as Record<string, unknown>)
        : false,
    }))
    .filter(({ rule, triggeredByTemplateId, directlyTriggered, blockingIndependentEngineeringZoneItemPack }) => {
      const ruleRecord = rule as unknown as Record<string, unknown>
      if (isIndependentEngineeringZoneScopeRule(ruleRecord)) {
        return directlyTriggered && blockingIndependentEngineeringZoneItemPack
      }
      return directlyTriggered || (
        Boolean(triggeredByTemplateId)
        && canPreflightScopeRuleFromTriggeredTemplate(ruleRecord)
      )
    })
    .filter(({ rule }) => isScopeAssignmentRulePreflightable(rule as unknown as Record<string, unknown>))

  const targetPresenceGroups = new Set(
    triggeredRules
      .filter(({ rule }) => findScopeAssignmentTargets(params.generationScope, rule as unknown as Record<string, unknown>).length > 0)
    .map(({ rule }) => buildScopeAssignmentTargetPresenceGroupKey(
      rule as unknown as Record<string, unknown>,
      {
        allowIndependentEngineeringZoneVariantCoverage: params.allowIndependentEngineeringZoneVariantCoverage,
      },
    )),
  )

  // eslint-disable-next-line -- route-level-aggregation-approved; wizard preflight builds blocking warning list before service readiness evaluation
  const warnings = triggeredRules
    .filter(({ rule }) => findScopeAssignmentTargets(params.generationScope, rule as unknown as Record<string, unknown>).length === 0)
    .filter(({ rule }) => !targetPresenceGroups.has(buildScopeAssignmentTargetPresenceGroupKey(
      rule as unknown as Record<string, unknown>,
      {
        allowIndependentEngineeringZoneVariantCoverage: params.allowIndependentEngineeringZoneVariantCoverage,
      },
    )))
    .map(({ rule, triggeredByTemplateId, directlyTriggered }) => {
      const ruleRecord = rule as unknown as Record<string, unknown>
      const missingObjectLabel = readScopeAssignmentMissingObjectLabel(ruleRecord)
      return {
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        severity: 'error',
        nodeCode: normalizeText(rule.itemPackPattern),
        message: `Triggered template pack ${rule.itemPackPattern} requires ${missingObjectLabel}, but the project scope does not contain it.`,
        details: {
          itemPackPattern: rule.itemPackPattern,
          effect: rule.effect,
          targetObjectType: rule.targetObjectType ?? null,
          matchMetadata: readRecord(ruleRecord.matchMetadata ?? ruleRecord.match_metadata),
          matchObjectName: normalizeText(ruleRecord.matchObjectName ?? ruleRecord.match_object_name) || null,
          missingObjectLabel,
          matchedRowCount: 0,
          matchedStableCodes: [],
          preflight: true,
          directlyTriggered,
          triggeredByTemplateId: triggeredByTemplateId ?? null,
        },
      }
    })

  return evaluateGeneratedTemplateScopeReadiness({ governanceWarnings: warnings })
}

function mapTemplateScopeReadinessIssuesToGovernanceWarnings(issues: ScopeGenerationReadinessIssue[]) {
  return issues
    .filter((issue) => issue.source === 'template_scope_assignment')
    .map((issue) => {
      const details = readRecord(issue.details)
      return {
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        severity: 'error',
        nodeCode: normalizeText(details.nodeCode ?? details.node_code ?? details.itemPackPattern ?? details.item_pack_pattern),
        details,
      }
    })
}

function buildExecutableDefaultMasterPlanPreview(
  rows: GeneratedTemplateRow[],
  assemblyInput: unknown,
) {
  const assembly = readRecord(assemblyInput)
  if (Object.keys(assembly).length === 0) return null
  const scheduleRows = rows.filter((row) => {
    const values = readRecord(row.values)
    const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
    return normalizeText(row.rowProjectionMode ?? values.row_projection_mode ?? metadata.rowProjectionMode) === 'schedule_row'
  })
  const scheduleIds = new Set(scheduleRows.map((row) => row.clientRowId))
  const previewRows = scheduleRows.map((row) => {
    const values = readRecord(row.values)
    const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
    const durationSuggestion = readRecord(
      values.duration_suggestion
        ?? values.durationSuggestion
        ?? metadata.durationSuggestion,
    )
    const durationAssetMapping = readRecord(
      metadata.durationAssetMapping
        ?? values.duration_asset_mapping,
    )
    const durationAssetCalculation = readRecord(
      metadata.durationAssetCalculation
        ?? values.duration_asset_calculation,
    )
    const visibilityDecision = readRecord(
      metadata.masterPlanVisibilityDecision
        ?? metadata.master_plan_visibility_decision,
    )
    const predecessors = (row.predecessorDependencies ?? [])
      .filter((dependency) => scheduleIds.has(normalizeText(dependency.clientRowId)))
      .map((dependency) => ({
        clientRowId: normalizeText(dependency.clientRowId),
        dependencyType: normalizeDependencyType(dependency.dependencyType),
        lagDays: readNumber(dependency.lagDays) ?? 0,
        intentCode: normalizeText(dependency.intentCode) || null,
        predecessorStableCode: normalizeText(dependency.predecessorStableCode) || null,
      }))
    return {
      clientRowId: row.clientRowId,
      parentClientRowId: row.parentClientRowId ?? null,
      sortOrder: row.sortOrder,
      wbsCode: firstText(values.standard_work_code, metadata.stableCode, values.template_node_id) || row.clientRowId,
      title: firstText(values.title, values.name, values.standard_work_name),
      rowProjectionMode: 'schedule_row',
      scheduleParticipation: normalizeText(
        row.scheduleParticipation ?? values.schedule_participation ?? metadata.scheduleParticipation,
      ) || 'primary_schedule',
      isWbsSummary: values.is_wbs_summary === true || normalizeText(values.is_wbs_summary).toLowerCase() === 'true',
      isExecutable: values.is_executable === true || normalizeText(values.is_executable).toLowerCase() === 'true',
      planItemKind: normalizeText(row.planItemKind ?? values.plan_item_kind ?? metadata.planItemKind) || null,
      durationContributionMode: normalizeText(values.duration_contribution_mode ?? metadata.durationContributionMode) || null,
      executionPhase: normalizeText(row.executionPhase ?? values.execution_phase ?? metadata.executionPhase) || null,
      executionLane: normalizeText(row.executionLane ?? values.execution_lane ?? metadata.executionLane) || null,
      organizationLane: normalizeText(values.organization_lane) || null,
      buildingObjectId: normalizeText(values.building_object_id) || null,
      buildingSequenceNumber: readNumber(values.building_sequence_number),
      plannedStartDate: normalizeDate(values.planned_start_date ?? values.start_date),
      plannedEndDate: normalizeDate(values.planned_end_date ?? values.end_date),
      referenceDurationDays: readNumber(
        values.smart_reference_days
          ?? durationSuggestion.planReferenceDays
          ?? durationSuggestion.riskP50DurationDays,
      ),
      durationAuthority: normalizeText(values.duration_authority) || null,
      durationCalibrationSource: normalizeText(
        values.duration_calibration_source ?? durationSuggestion.durationCalibrationSource,
      ) || null,
      durationProvenance: normalizeText(values.duration_provenance ?? durationSuggestion.durationProvenance) || null,
      masterPlanVisibilityClass: normalizeText(
        values.master_plan_visibility_class ?? visibilityDecision.visibilityClass ?? visibilityDecision.visibility_class,
      ) || null,
      masterPlanVisibilityPolicyStableCode: normalizeText(
        values.master_plan_visibility_policy_stable_code
          ?? visibilityDecision.policyStableCode
          ?? visibilityDecision.policy_stable_code,
      ) || null,
      riskP20DurationDays: readNumber(durationSuggestion.riskP20DurationDays),
      riskP50DurationDays: readNumber(durationSuggestion.riskP50DurationDays),
      riskP80DurationDays: readNumber(durationSuggestion.riskP80DurationDays),
      predecessorClientRowIds: predecessors.map((dependency) => dependency.clientRowId),
      predecessors,
      standardWorkDurationSeedStableCode: normalizeText(
        durationAssetMapping.standardWorkDurationSeedStableCode
          ?? durationAssetCalculation.standardWorkDurationSeedStableCode,
      ) || null,
      t2RhythmTemplateId: normalizeText(
        durationAssetMapping.t2RhythmTemplateId
          ?? durationAssetCalculation.t2RhythmTemplateId,
      ) || null,
      durationAssetMapping,
      durationAssetCalculation,
    }
  })
  const previewSummary = summarizeWizardExecutablePreviewRows(previewRows)

  return {
    source: 'wizard_executable_default_master_plan_preview',
    version: 'v1.4.23.1-executable-preview-v1',
    status: normalizeText(assembly.status) || 'executable_default_master_plan_blocked',
    businessType: normalizeText(assembly.businessType) || null,
    assetAuthority: normalizeText(assembly.assetAuthority) || null,
    calibrationPolicy: normalizeText(assembly.calibrationPolicy) || 'optional_runtime_overlay',
    readyForWizardCommit: assembly.readyForWizardCommit === true,
    scheduleRowCount: previewSummary.scheduleRowCount,
    executableRowCount: previewSummary.executableRowCount,
    summaryRowCount: previewSummary.summaryRowCount,
    visibleDependencyCount: previewSummary.visibleDependencyCount,
    dependencyCycleRowCount: readNumber(assembly.dependencyCycleRowCount) ?? 0,
    schedulePropagationCycleRowCount: readNumber(assembly.schedulePropagationCycleRowCount) ?? 0,
    networkComponentCount: readNumber(assembly.networkComponentCount) ?? null,
    networkRootCount: readNumber(assembly.networkRootCount) ?? null,
    networkSinkCount: readNumber(assembly.networkSinkCount) ?? null,
    methodConflictCount: readNumber(assembly.methodConflictCount) ?? 0,
    durationAssetSemanticMismatchCount: readNumber(assembly.durationAssetSemanticMismatchCount) ?? 0,
    projectStartDate: previewSummary.projectStartDate,
    projectEndDate: previewSummary.projectEndDate,
    phaseCount: new Set(previewRows.map((row) => row.executionPhase).filter(Boolean)).size,
    previewOnly: true,
    commitPolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'preview_only_no_db_write',
    rows: previewRows,
  }
}

async function buildWizardProfilePreview(
  body: z.infer<typeof previewSchema>,
  options: {
    constructionCalendar?: ConstructionCalendarContext | null
    projectId?: string | null
    companyId?: string | null
  } = {},
) {
  const facts = buildProjectGenerationFacts({
    ...body,
    buildingCount: undefined,
  } as z.infer<typeof wizardPayloadSchema>)
  facts.buildingCount = body.buildingCount ?? facts.buildingCount
  const recommendation = buildTemplateRecommendation(facts)
  const masterPlanProfile = readWizardMasterPlanProfile(recommendation)
  const defaultPlanOutput = (recommendation as unknown as Record<string, unknown>).defaultPlanOutput === 'master_plan'
    ? 'master_plan'
    : masterPlanProfile.layer
  const constructionOrganizationScenario = selectConstructionOrganizationScenario(
    buildConstructionOrganizationSelectorInputFromProjectFacts(facts, {
      projectTypeCode: facts.businessType,
      onboardingMode: body.mode ?? null,
      onboardingSubstage: body.mode === 'starting_line' ? body.onboardingSubstage ?? null : null,
      onboardingPhaseProgress: body.mode === 'starting_line' ? body.onboardingPhaseProgress ?? {} : {},
      onboardingPassedMilestones: body.mode === 'starting_line' ? body.onboardingPassedMilestones ?? [] : [],
    }),
  )
  const selectedEstimate = recommendation.expectedRowCount[body.detailLevel as DetailLevel]
  const generationBatchId = `wizard-preview-${uuidv4()}`
  const generationScope = buildDraftWizardGenerationScope(body.scopeTree)
  const operation = buildWizardOperation({
    payload: body,
    recommendation,
    generationBatchId,
    generationScope,
  })
  const previewOperation: PlanningTableOperation = {
    ...operation,
    detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL,
    generationDepth: WIZARD_MANAGED_FRONTIER_GENERATION_DEPTH,
    includeActivitySteps: false,
    projectFacts: {
      ...readRecord(operation.projectFacts),
      ...(options.companyId ? { companyId: options.companyId } : {}),
    },
    clientContext: {
      ...readRecord(operation.clientContext),
      detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL,
      generationDepth: WIZARD_MANAGED_FRONTIER_GENERATION_DEPTH,
      includeActivitySteps: false,
      ...(options.constructionCalendar ? { constructionCalendar: options.constructionCalendar } : {}),
      ...(options.companyId ? { companyId: options.companyId } : {}),
    },
  }
  let targetFeasibility: GeneratedTargetFeasibility | null = null
  let generatedGovernanceWarnings: unknown[] = []
  let durationAssetUtilizationSummary: unknown = null
  let durationAssetConsumptionReceipts: unknown[] = []
  let durationAssetConsumptionSummary: unknown = null
  let candidateDurationAssetPreview: unknown = null
  let candidateNetworkEvaluation: unknown = null
  let candidateAcceptancePlanPreview: unknown = null
  let planQualityDiagnostics: unknown = null
  let executableDefaultMasterPlanAssembly: unknown = null
  let executableDefaultMasterPlanPreview: unknown = null
  const previewGenerationIssues: Array<Record<string, unknown>> = []
  const wbsReadinessIssues = mapScopeReadinessIssuesToProfileIssues(
    evaluateScopeGenerationReadiness({ scopeTree: body.scopeTree }).issues,
  )
  const triggeredTemplateScopeReadiness = evaluateTriggeredTemplateScopeReadiness({
    recommendation,
    generationScope,
    allowIndependentEngineeringZoneVariantCoverage: true,
  })
  const triggeredTemplateScopeIssues = triggeredTemplateScopeReadiness.issues
  wbsReadinessIssues.push(...mapScopeReadinessIssuesToProfileIssues(triggeredTemplateScopeIssues))
  const preflightGovernanceWarnings = mapTemplateScopeReadinessIssuesToGovernanceWarnings(triggeredTemplateScopeIssues)
  if (wbsReadinessIssues.length === 0) {
    try {
      const generated = await generateWbsTemplateRows({
        projectId: options.projectId ?? 'wizard-preview',
        surface: 'task_list',
        runtimeEvidenceMode: 'no_write',
        operation: previewOperation,
        detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL as never,
        onboardingSubstage: body.mode === 'starting_line' ? body.onboardingSubstage ?? null : null,
        onboardingBatchId: generationBatchId,
        scopeAssignmentRules: recommendation.scopeAssignmentRules,
        diagnosticDurationSuggestionMode: 'fast_template',
        duplicatePolicy: body.mode === 'starting_line' ? 'preserve_historical_skip_future' : undefined,
      })
      const durationAssetAdjustedRows = applyWizardDurationAssetPlanDatesToRows(
        generated.rows,
        options.constructionCalendar ?? null,
      )
      candidateNetworkEvaluation = buildWizardCandidateNetworkEvaluationFromAdjustedRows(
        durationAssetAdjustedRows,
        generated.candidateNetworkEvaluation ?? null,
      )
      const generatedRows = applyWizardCandidateNetworkPlanDatesToRows(
        durationAssetAdjustedRows,
        candidateNetworkEvaluation,
      )
      executableDefaultMasterPlanAssembly = generated.executableDefaultMasterPlanAssembly ?? null
      executableDefaultMasterPlanPreview = buildExecutableDefaultMasterPlanPreview(
        generatedRows,
        executableDefaultMasterPlanAssembly,
      )
      targetFeasibility = buildWizardTargetFeasibilityFromAdjustedRows(
        generatedRows,
        generated.rows,
        generated.targetFeasibility ?? null,
        body.plannedEndDate,
      )
      durationAssetUtilizationSummary = generated.durationAssetUtilizationSummary ?? null
      durationAssetConsumptionReceipts = Array.isArray(generated.durationAssetConsumptionReceipts)
        ? generated.durationAssetConsumptionReceipts
        : []
      durationAssetConsumptionSummary = generated.durationAssetConsumptionSummary ?? null
      candidateDurationAssetPreview = buildCandidateDurationAssetPreview(generatedRows)
      candidateAcceptancePlanPreview = buildCandidateAcceptancePlanPreview(generatedRows, {
        plannedEndDate: body.plannedEndDate,
        terminalEvent: body.terminalEvent,
      })
      planQualityDiagnostics = buildWizardPlanQualityDiagnostics({
        targetFeasibility,
        durationAssetUtilizationSummary,
        candidateDurationAssetPreview,
        candidateNetworkEvaluation,
        candidateAcceptancePlanPreview,
      })
      generatedGovernanceWarnings = Array.isArray(generated.governanceWarnings)
        ? generated.governanceWarnings
          .map(readRecord)
          .filter((warning) => shouldKeepTemplateScopeWarning(warning, recommendation))
        : []
      wbsReadinessIssues.push(...mapScopeReadinessIssuesToProfileIssues(
        evaluateGeneratedTemplateScopeReadiness({
          governanceWarnings: generatedGovernanceWarnings,
        }).issues,
      ))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn('[projectWizard] profile preview generation failed', {
        error: reason,
      })
      previewGenerationIssues.push({
        code: 'WBS_PREVIEW_UNAVAILABLE',
        severity: 'warning' as const,
        title: 'WBS 试算暂未完成',
        message: `项目空间模型已保留，但本次 WBS 试算没有完成：${reason}`,
        action: '可以先检查范围体量和模板选择后重新试算；正式生成仍会执行完整校验，缺少挂接对象时会阻断生成。',
        impact: '本次预览中的任务挂接检查只包含空间模型和已知规则匹配，未包含生成器运行后才能发现的缺范围预警。',
        source: 'wbs_preview',
        details: {
          reason,
        },
      })
    }
  }
  const scopeCoverageDiagnostics = buildScopeCoverageDiagnostics(body, facts)
  const scopeTemplateCoverage = evaluateScopeTemplateCoverage({
    generationScope,
    scopeAssignmentRules: recommendation.scopeAssignmentRules,
    governanceWarnings: [
      ...preflightGovernanceWarnings,
      ...generatedGovernanceWarnings,
    ],
  })
  const commercialFactReadiness = buildCommercialFactReadiness({
    facts,
    generationScope,
    scopeCoverageDiagnostics,
    scopeTemplateCoverage,
    wbsReadinessIssues,
  })
  if (candidateDurationAssetPreview && candidateNetworkEvaluation && candidateAcceptancePlanPreview) {
    planQualityDiagnostics = buildWizardPlanQualityDiagnostics({
      targetFeasibility,
      durationAssetUtilizationSummary,
      candidateDurationAssetPreview,
      candidateNetworkEvaluation,
      candidateAcceptancePlanPreview,
      commercialFactReadiness,
    })
  }
  const issues = [
    ...buildWizardProfileConfirmationIssues({ payload: body, facts }),
    ...wbsReadinessIssues,
    ...previewGenerationIssues,
    ...scopeCoverageDiagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
    })),
  ]
  return {
    recommendation,
    estimatedRowCount: selectedEstimate,
    targetFeasibility,
    constructionOrganizationScenario,
    profile: {
      identity: {
        projectName: body.projectName ?? null,
        businessType: body.businessType,
        businessSubtype: body.businessSubtype ?? null,
        planScopeCaliber: body.planScopeCaliber ?? null,
        deliveryStandard: body.deliveryStandard ?? null,
        terminalEvent: body.terminalEvent ?? null,
        mode: body.mode ?? 'new',
      },
      locationFacts: facts.locationFacts ?? null,
      scale: {
        totalAreaM2: facts.totalAreaM2 ?? null,
        aboveGroundAreaM2: facts.aboveGroundAreaM2 ?? null,
        basementAreaM2: facts.basementAreaM2 ?? null,
        siteAreaM2: facts.siteAreaM2 ?? null,
        buildingCount: facts.buildingCount,
        highestBuildingFloorCount: facts.highestBuildingFloorCount ?? null,
        standardFloorCount: facts.standardFloorCount ?? null,
        basementLevelCount: facts.basementLevelCount ?? null,
        foundationDepthM: facts.foundationDepthM ?? null,
      },
      methods: {
        methodVariantCodes: facts.methodVariantCodes,
        prefabSystemCodes: facts.prefabSystemCodes ?? [],
        elementVariantCodes: facts.elementVariantCodes ?? [],
        buildingPatternCodes: facts.buildingPatternCodes ?? [],
        foundationMethodCandidates: recommendation.foundationMethodCandidates ?? [],
      },
      features: {
        userSelected: sanitizeWizardProjectFeatures(body.projectFeatures ?? {}),
        inferred: {
          functionalUsageCodes: facts.functionalUsageCodes ?? [],
          floorUsageCodes: facts.floorUsageCodes ?? [],
          functionalCategoryCodes: facts.functionalCategoryCodes ?? [],
          specialRoomTypeCodes: facts.specialRoomTypeCodes ?? [],
          physicalZoneTypeCodes: facts.physicalZoneTypeCodes ?? [],
          externalInterfaceCodes: facts.externalInterfaceCodes ?? [],
          hardConstraintCodes: facts.hardConstraintCodes ?? [],
        },
      },
      commercialFactReadiness,
      generation: {
        detailLevel: body.detailLevel,
        estimatedRowCount: selectedEstimate,
        defaultPlanOutput,
        masterPlanProfile,
        durationAssetUtilizationSummary,
        durationAssetConsumptionReceipts,
        durationAssetConsumptionSummary,
        candidateDurationAssetPreview,
        candidateNetworkEvaluation,
        candidateAcceptancePlanPreview,
        planQualityDiagnostics,
        executableDefaultMasterPlanAssembly,
        executableDefaultMasterPlanPreview,
        templateCount: recommendation.matchedTemplates.length,
        milestoneCount: recommendation.triggeredMilestones.length,
      },
      scopeCoverageDiagnostics,
      scopeTemplateCoverage,
      issues,
    },
    previewSummary: {
      businessType: body.businessType,
      detailLevel: body.detailLevel,
      buildingCount: facts.buildingCount,
      templateCount: recommendation.matchedTemplates.length,
      milestoneCount: recommendation.triggeredMilestones.length,
    },
  }
}

function buildGeneratedTaskPayload(
  projectId: string,
  row: GeneratedTemplateRow,
  parentId: string | null,
  actorId?: string | null,
  context?: {
    generationBatchId?: string | null
    generationAttemptId?: string | null
    scopeFallback?: Record<string, unknown>
    hasChildren?: boolean
  },
) {
  const values = applyGeneratedTaskScopeFallback(row.values ?? {}, context?.scopeFallback ?? {})
  const metadata = readRecord(values.standard_task_metadata)
  const rowDurationSuggestion = readRecord(values.duration_suggestion ?? values.durationSuggestion)
  const title = firstText(values.title, values.name, values.standard_work_name)
  const startDate = normalizeDate(values.start_date ?? values.planned_start_date) ?? now().slice(0, 10)
  const endDate = normalizeDate(values.end_date ?? values.planned_end_date) ?? startDate
  const wbsSemantics = readWizardGeneratedRowWbsSemantics(row, context?.hasChildren === true)
  const isWbsSummary = wbsSemantics.isWbsSummary
  const isExecutable = wbsSemantics.isExecutable
  if (!title) {
    throw Object.assign(new Error('模板生成任务必须包含任务名称'), {
      statusCode: 400,
      code: 'TEMPLATE_GENERATE_REQUIRED_FIELDS_MISSING',
    })
  }

  const payload: Record<string, unknown> = {
    ...values,
    project_id: projectId,
    title,
    parent_id: parentId,
    sort_order: row.sortOrder,
    is_wbs_summary: isWbsSummary,
    is_executable: isExecutable,
    start_date: startDate,
    end_date: endDate,
    planned_start_date: startDate,
    planned_end_date: endDate,
    progress: Number(values.progress ?? 0) || 0,
    status: normalizeStatus(values.status),
    priority: normalizePriority(values.priority),
    task_source: 'template',
    created_by: actorId ?? null,
    standard_task_metadata: {
      ...metadata,
      ...(Object.keys(rowDurationSuggestion).length > 0 ? { durationSuggestion: rowDurationSuggestion } : {}),
      wizardGenerated: true,
      wizardSource: 'project_wizard',
      ...(context?.generationBatchId ? { wizardGenerationBatchId: context.generationBatchId } : {}),
      ...(context?.generationAttemptId ? { wizardGenerationAttemptId: context.generationAttemptId } : {}),
    },
  }
  delete payload.duration_suggestion
  delete payload.durationSuggestion
  if (isWbsSummary || !isExecutable) {
    delete payload.progress
    delete payload.status
    delete payload.actual_start
    delete payload.actual_end
    delete payload.actual_start_date
    delete payload.actual_end_date
    delete payload.completed_at
    delete payload.first_progress_at
  }
  return payload
}

function normalizeDependencyType(value: unknown): GeneratedTemplateDependency['dependencyType'] {
  const type = String(value ?? '').trim().toUpperCase()
  if (type === 'SS' || type === 'FF' || type === 'SF') return type
  return 'FS'
}

function mapDependencySourceType(source: GeneratedTemplateDependency['source'] | string | null | undefined) {
  if (source === 'sibling_sequence' || source === 'internal_flow') return 'template_internal_flow'
  if (source === 'cross_item_workflow') return 'template_cross_item_workflow'
  if (source === 'dependency_intent_template') return 'template_dependency_intent'
  if (source === 'duration_learning_runtime_publication') return 'duration_learning_runtime_publication'
  return 'template_generated'
}

function generatedDependencyMetadata(dependency: GeneratedTemplateDependency) {
  const raw = dependency as GeneratedTemplateDependency & Record<string, unknown>
  const evidence = readRecord(raw.dependencyRuleEvidence)
  const publicationKey = normalizeText(raw.publicationKey ?? raw.publication_key) || null
  const publicationStage = normalizeText(raw.publicationStage ?? raw.publication_stage) || null
  const selectionBasis = normalizeText(raw.selectionBasis ?? raw.selection_basis) || null
  const artifactKey = normalizeText(raw.artifactKey ?? raw.artifact_key) || null
  return {
    source: normalizeText(raw.source) || 'generated_dependency_network',
    intentCode: normalizeText(raw.intentCode) || null,
    predecessorStableCode: normalizeText(raw.predecessorStableCode) || null,
    sequencingBasis: normalizeText(raw.sequencingBasis) || null,
    governanceGapCode: normalizeText(raw.governanceGapCode) || null,
    dependencyRuleEvidence: Object.keys(evidence).length > 0 ? evidence : null,
    publicationKey,
    publicationStage,
    selectionBasis,
    artifactKey,
    learningPolicy: normalizeText(raw.sequencingBasis)
      ? 'candidate_only_until_dependency_rule_replay_publication'
      : publicationKey
        ? 'published_duration_learning_runtime_dependency'
        : 'published_or_template_generated_dependency',
  }
}

function buildDependencyWrites(row: GeneratedTemplateRow, idByClientRowId: Map<string, string>) {
  const taskId = idByClientRowId.get(row.clientRowId)
  if (!taskId) return []
  return row.predecessorDependencies
    .filter((dependency) => !isUnconfirmedHeuristicDependency(dependency))
    .map((dependency) => {
      const dependencyTaskId = idByClientRowId.get(dependency.clientRowId)
      if (!dependencyTaskId) return null
      return {
        taskId,
        dependencyTaskId,
        dependencyType: normalizeDependencyType(dependency.dependencyType),
        lagDays: Number(dependency.lagDays ?? 0) || 0,
        sourceType: mapDependencySourceType(dependency.source),
        metadata: generatedDependencyMetadata(dependency),
      }
    })
    .filter((item): item is {
      taskId: string
      dependencyTaskId: string
      dependencyType: GeneratedTemplateDependency['dependencyType']
      lagDays: number
      sourceType: string
      metadata: ReturnType<typeof generatedDependencyMetadata>
    } => Boolean(item))
}

async function recordWizardAcceptancePlanFacts(input: {
  projectId: string
  planId: string
  previous?: Record<string, any> | null
  next: Record<string, any>
  sourceMutationId: string
  observedAt: string
  actorUserId?: string | null
  forceInitial?: boolean
  transactionClient: TransactionClientLike
}) {
  await recordAcceptancePlanExecutionFacts({
    projectId: input.projectId,
    planId: input.planId,
    previous: input.previous ?? null,
    next: input.next,
    sourceMutationId: input.sourceMutationId,
    observedAt: input.observedAt,
    actorUserId: input.actorUserId ?? null,
    forceInitial: input.forceInitial,
    sourceModule: 'projectWizard',
    queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const result = await input.transactionClient.query(sql, params)
      return (result.rows ?? []) as T[]
    },
    isTransactionActive: () => true,
  })
}

async function writePassedMilestones(params: {
  projectId: string
  payload: z.infer<typeof wizardPayloadSchema>
  actorId?: string | null
  generationBatchId?: string | null
  transactionClient?: TransactionClientLike | null
}) {
  const { projectId, payload, actorId, generationBatchId } = params
  const milestones = payload.mode === 'starting_line' ? payload.onboardingPassedMilestones : []
  if (milestones.length === 0) return { count: 0, ids: [] as string[] }

  const ts = now()
  let count = 0
  const ids: string[] = []
  for (const code of milestones) {
    if (!params.transactionClient) {
      throw new Error('Wizard acceptance plan facts require a transaction client')
    }
    const id = uuidv4()
    const exec = params.transactionClient
      ? params.transactionClient.query.bind(params.transactionClient)
      : rawQuery
    await exec(
      `INSERT INTO acceptance_plans (id, project_id, acceptance_name, acceptance_type, planned_date, actual_date, status, documents, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        projectId,
        code,
        '其他',
        normalizeDate(payload.actualStartDate) ?? ts.slice(0, 10),
        normalizeDate(payload.actualStartDate) ?? ts.slice(0, 10),
        'passed',
        JSON.stringify([]),
        `由项目快速建模向导起跑线接入自动写入${generationBatchId ? `\n[wizard_generation_batch_id:${generationBatchId}]` : ''}`,
        actorId ?? null,
        ts,
        ts,
      ],
    )
    await recordWizardAcceptancePlanFacts({
      projectId,
      planId: id,
      next: {
        status: 'passed',
        actual_date: normalizeDate(payload.actualStartDate) ?? ts.slice(0, 10),
      },
      sourceMutationId: `wizard:acceptance-plan:${id}:create`,
      observedAt: ts,
      actorUserId: actorId,
      forceInitial: true,
      transactionClient: params.transactionClient,
    })
    // eslint-disable-next-line -- route-level-aggregation-approved
    count += 1
    ids.push(id)
  }
  return { count, ids }
}

const WIZARD_WBS_NODE_TYPES = new Set<WbsNodeType>([
  'division',
  'sub_division',
  'item_work',
  'process',
  'activity_step',
  'custom',
])

function readWizardGeneratedRowWbsSemantics(row: GeneratedTemplateRow, hasChildren = false) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  const normalizedNodeType = normalizeId(
    values.wbs_node_type
      ?? values.wbsNodeType
      ?? values.category_type
      ?? values.categoryType,
  )
  const wbsNodeType = WIZARD_WBS_NODE_TYPES.has(normalizedNodeType as WbsNodeType)
    ? normalizedNodeType as WbsNodeType
    : null
  const derived = deriveWbsFlags(wbsNodeType, hasChildren)
  const explicitSummaryValue = values.is_wbs_summary
    ?? values.isWbsSummary
    ?? metadata.isWbsSummary
    ?? metadata.is_wbs_summary
  const explicitExecutableValue = values.is_executable
    ?? values.isExecutable
    ?? metadata.isExecutable
    ?? metadata.is_executable
  const hasExplicitSummary = explicitSummaryValue !== undefined && explicitSummaryValue !== null
  const hasExplicitExecutable = explicitExecutableValue !== undefined && explicitExecutableValue !== null
  const explicitSummary = hasExplicitSummary && isTruthyFlag(explicitSummaryValue)
  const explicitExecutable = hasExplicitExecutable && isTruthyFlag(explicitExecutableValue)
  const explicitExecutableLeaf = explicitExecutable && !hasChildren
  const isWbsSummary = hasChildren
    || explicitSummary
    || (!hasExplicitSummary && !explicitExecutableLeaf && derived.is_wbs_summary)
  return {
    isWbsSummary,
    isExecutable: !isWbsSummary && (hasExplicitExecutable ? explicitExecutable : derived.is_executable),
  }
}

function isWizardGeneratedExecutableRow(row: GeneratedTemplateRow) {
  return readWizardGeneratedRowWbsSemantics(row).isExecutable
}

function readWizardGeneratedRowProjectionMode(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return normalizeId(
    row.rowProjectionMode
      ?? values.row_projection_mode
      ?? values.rowProjectionMode
      ?? metadata.rowProjectionMode
      ?? metadata.row_projection_mode,
  )
}

function readWizardGeneratedRowScheduleParticipation(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return normalizeId(
    row.scheduleParticipation
      ?? values.schedule_participation
      ?? values.scheduleParticipation
      ?? metadata.scheduleParticipation
      ?? metadata.schedule_participation,
  )
}

function readWizardGeneratedRowDurationContributionMode(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return normalizeId(
    values.duration_contribution_mode
      ?? values.durationContributionMode
      ?? metadata.durationContributionMode
      ?? metadata.duration_contribution_mode,
  )
}

function isWizardGeneratedExplicitSummaryRow(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return isTruthyFlag(
    values.is_wbs_summary
      ?? values.isWbsSummary
      ?? metadata.isWbsSummary
      ?? metadata.is_wbs_summary,
  )
}

function isWizardGeneratedExplicitExecutableRow(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return isTruthyFlag(
    values.is_executable
      ?? values.isExecutable
      ?? metadata.isExecutable
      ?? metadata.is_executable,
  )
}

function isWizardCandidateScheduleQualityRow(row: GeneratedTemplateRow) {
  return readWizardGeneratedRowProjectionMode(row) === 'schedule_row'
    && readWizardGeneratedRowScheduleParticipation(row) !== 'reference_only'
    && readWizardGeneratedRowDurationContributionMode(row) !== 'record_only'
    && !isWizardGeneratedExplicitSummaryRow(row)
    && (isWizardGeneratedExplicitExecutableRow(row) || isWizardGeneratedExecutableRow(row))
}

function readWizardGeneratedRowTitle(row: GeneratedTemplateRow, fallback = '模板计划行') {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return firstText(
    values.title,
    values.name,
    values.standard_work_name,
    metadata.title,
    metadata.standardWorkName,
    metadata.standard_work_name,
    fallback,
  )
}

function readWizardDurationSuggestion(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return readRecord(row.durationSuggestion ?? values.duration_suggestion ?? values.durationSuggestion ?? metadata.durationSuggestion)
}

function readWizardDurationRiskRange(row: GeneratedTemplateRow) {
  const suggestion = readWizardDurationSuggestion(row)
  const range = readRecord(suggestion.durationRiskRange ?? suggestion.duration_risk_range)
  const durationRiskDistribution = normalizeDurationRiskDistributionDto(
    suggestion.durationRiskDistribution
      ?? suggestion.duration_risk_distribution
      ?? range.durationRiskDistribution
      ?? range.duration_risk_distribution,
  )
  const p20 = readNumber(suggestion.riskP20DurationDays ?? suggestion.risk_p20_duration_days ?? range.p20Days ?? range.p20_days)
  const p50 = readNumber(suggestion.riskP50DurationDays ?? suggestion.risk_p50_duration_days ?? range.p50Days ?? range.p50_days)
  const p80 = readNumber(suggestion.riskP80DurationDays ?? suggestion.risk_p80_duration_days ?? range.p80Days ?? range.p80_days)
  if (p20 === null && p50 === null && p80 === null && !durationRiskDistribution) return null
  return { p20, p50, p80, durationRiskDistribution }
}

function readWizardDurationAssetCalculation(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return readRecord(
    metadata.durationAssetCalculation
      ?? metadata.duration_asset_calculation
      ?? values.duration_asset_calculation
      ?? values.durationAssetCalculation,
  )
}

function readWizardConstructionCalendarEvidence(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  const calendarBasis = firstText(values.calendar_basis, values.calendarBasis, metadata.calendarBasis, metadata.calendar_basis)
  const constructionCalendarWindowCount = readNumber(
    values.construction_calendar_window_count
      ?? values.constructionCalendarWindowCount
      ?? metadata.constructionCalendarWindowCount
      ?? metadata.construction_calendar_window_count,
  ) ?? 0
  const calendarRef = firstText(
    values.construction_calendar_ref,
    values.constructionCalendarRef,
    metadata.constructionCalendarRef,
    metadata.construction_calendar_ref,
  )
  const calendarVersion = firstText(
    values.construction_calendar_version,
    values.constructionCalendarVersion,
    metadata.constructionCalendarVersion,
    metadata.construction_calendar_version,
  )
  const timezone = firstText(
    values.construction_calendar_timezone,
    values.constructionCalendarTimezone,
    metadata.constructionCalendarTimezone,
    metadata.construction_calendar_timezone,
  )
  const availability = firstText(
    values.construction_calendar_availability,
    values.constructionCalendarAvailability,
    metadata.constructionCalendarAvailability,
    metadata.construction_calendar_availability,
  )
  const consumed = calendarBasis === 'official_construction_calendar_seed'
    && constructionCalendarWindowCount > 0
    && Boolean(calendarRef && calendarVersion && timezone)
    && availability === 'available'
  return {
    consumed,
    calendarBasis: consumed ? calendarBasis : 'calendar_day',
    constructionCalendarWindowCount: consumed ? constructionCalendarWindowCount : 0,
  }
}

function buildWizardDurationAssetAppliedPlanEndDate(
  plannedStartDate: unknown,
  selectedDurationDays: unknown,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const startDate = normalizeDate(plannedStartDate)
  const selectedDays = readNumber(selectedDurationDays)
  if (!startDate || selectedDays === null || selectedDays <= 0) return null

  const parsedStart = parseConstructionCalendarDate(startDate)
  if (parsedStart) {
    return addConstructionProductionDays(parsedStart, Math.max(1, Math.ceil(selectedDays)), constructionCalendar)
  }

  const fallbackStart = Date.parse(`${startDate}T00:00:00.000Z`)
  if (!Number.isFinite(fallbackStart)) return null
  const fallbackEnd = new Date(fallbackStart)
  fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + Math.max(1, Math.ceil(selectedDays)) - 1)
  return fallbackEnd.toISOString().slice(0, 10)
}

function applyWizardDurationAssetPlanDatesToRow(
  row: GeneratedTemplateRow,
  constructionCalendar?: ConstructionCalendarContext | null,
): GeneratedTemplateRow {
  if (!isWizardGeneratedExecutableRow(row)) return row
  const values = readRecord(row.values)
  const calculation = readWizardDurationAssetCalculation(row)
  const selectedDurationDays = readNumber(calculation.selectedDurationDays ?? calculation.selected_duration_days)
  if (selectedDurationDays === null || selectedDurationDays <= 0) return row

  const plannedStartDate = normalizeDate(values.planned_start_date ?? values.start_date)
  const plannedEndDate = buildWizardDurationAssetAppliedPlanEndDate(
    plannedStartDate,
    selectedDurationDays,
    constructionCalendar,
  )
  if (!plannedStartDate || !plannedEndDate) return row

  const currentPlannedEndDate = normalizeDate(values.planned_end_date ?? values.end_date)
  if (currentPlannedEndDate === plannedEndDate) return row

  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return {
    ...row,
    values: {
      ...values,
      start_date: plannedStartDate,
      end_date: plannedEndDate,
      planned_start_date: plannedStartDate,
      planned_end_date: plannedEndDate,
      standard_task_metadata: {
        ...metadata,
        wizardDurationAssetPlanDateApplication: {
          source: 'wizard_duration_asset_plan_date_application',
          selectedDurationDays,
          previousPlannedStartDate: plannedStartDate,
          previousPlannedEndDate: currentPlannedEndDate,
          plannedStartDate,
          plannedEndDate,
          evidenceLevel: 'candidate_duration_asset_applied_plan_dates_l1',
          mutationBoundary: 'wizard_generated_task_plan_date_write_only_no_duration_runtime_write_no_seed_write_no_production_claim',
        },
      },
    },
  }
}

function readWizardGeneratedRowPlanStart(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  return normalizeDate(values.planned_start_date ?? values.start_date)
}

function readWizardGeneratedRowPlanEnd(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  return normalizeDate(values.planned_end_date ?? values.end_date)
}

function buildWizardSummaryRollupWindow(childRows: GeneratedTemplateRow[]) {
  const starts: string[] = []
  const ends: string[] = []
  for (const childRow of childRows) {
    const start = readWizardGeneratedRowPlanStart(childRow)
    const end = readWizardGeneratedRowPlanEnd(childRow)
    if (!start || !end) continue
    starts.push(start)
    ends.push(end)
  }
  if (starts.length === 0 || ends.length === 0) return null
  starts.sort()
  ends.sort()
  return {
    plannedStartDate: starts[0],
    plannedEndDate: ends[ends.length - 1],
    childRowCount: starts.length,
  }
}

function applyWizardSummaryRollupPlanDatesToRow(row: GeneratedTemplateRow, childRows: GeneratedTemplateRow[]) {
  if (isWizardGeneratedExecutableRow(row) || childRows.length === 0) return row
  const window = buildWizardSummaryRollupWindow(childRows)
  if (!window) return row

  const values = readRecord(row.values)
  const previousPlannedStartDate = normalizeDate(values.planned_start_date ?? values.start_date)
  const previousPlannedEndDate = normalizeDate(values.planned_end_date ?? values.end_date)
  const plannedStartDate = [previousPlannedStartDate, window.plannedStartDate].filter(Boolean).sort()[0] ?? null
  const plannedEndDate = [previousPlannedEndDate, window.plannedEndDate].filter(Boolean).sort().at(-1) ?? null
  if (!plannedStartDate || !plannedEndDate) return row
  if (previousPlannedStartDate === plannedStartDate && previousPlannedEndDate === plannedEndDate) {
    return row
  }

  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return {
    ...row,
    values: {
      ...values,
      start_date: plannedStartDate,
      end_date: plannedEndDate,
      planned_start_date: plannedStartDate,
      planned_end_date: plannedEndDate,
      standard_task_metadata: {
        ...metadata,
        wizardDurationAssetSummaryRollup: {
          source: 'wizard_duration_asset_summary_rollup',
          childRowCount: window.childRowCount,
          previousPlannedStartDate,
          previousPlannedEndDate,
          plannedStartDate,
          plannedEndDate,
          windowPolicy: 'minimum_window_expand_only',
          evidenceLevel: 'candidate_duration_asset_summary_rollup_l1',
          mutationBoundary: 'wizard_generated_summary_plan_date_write_only_no_duration_runtime_write_no_seed_write_no_production_claim',
        },
      },
    },
  }
}

function applyWizardSummaryRollupPlanDatesToRows(rows: GeneratedTemplateRow[]) {
  const rowByClientRowId = new Map(rows.map((row) => [row.clientRowId, row]))
  const childIdsByParentClientRowId = new Map<string, string[]>()
  for (const row of rows) {
    const parentClientRowId = String(row.parentClientRowId ?? '').trim()
    if (!parentClientRowId) continue
    const childIds = childIdsByParentClientRowId.get(parentClientRowId) ?? []
    childIds.push(row.clientRowId)
    childIdsByParentClientRowId.set(parentClientRowId, childIds)
  }

  const visited = new Set<string>()
  const visiting = new Set<string>()
  const rollup = (clientRowId: string): GeneratedTemplateRow | null => {
    const row = rowByClientRowId.get(clientRowId)
    if (!row) return null
    if (visited.has(clientRowId)) return row
    if (visiting.has(clientRowId)) return row
    visiting.add(clientRowId)
    const childRows = (childIdsByParentClientRowId.get(clientRowId) ?? [])
      .map((childClientRowId) => rollup(childClientRowId))
      .filter((childRow): childRow is GeneratedTemplateRow => Boolean(childRow))
    const rolledRow = applyWizardSummaryRollupPlanDatesToRow(row, childRows)
    rowByClientRowId.set(clientRowId, rolledRow)
    visiting.delete(clientRowId)
    visited.add(clientRowId)
    return rolledRow
  }

  for (const row of rows) {
    rollup(row.clientRowId)
  }

  return rows.map((row) => rowByClientRowId.get(row.clientRowId) ?? row)
}

function applyWizardDurationAssetPlanDatesToRows(
  rows: GeneratedTemplateRow[],
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const rowsWithAppliedDurationAssets = rows.map((row) => applyWizardDurationAssetPlanDatesToRow(row, constructionCalendar))
  return applyWizardSummaryRollupPlanDatesToRows(rowsWithAppliedDurationAssets)
}

function hasWizardDurationAssetPlanDateApplication(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return Boolean(metadata.wizardDurationAssetPlanDateApplication)
}

function calculateWizardPlanWindowStartDay(projectStartDate: string, rowStartDate: string) {
  const inclusiveDays = calculateInclusiveCalendarSpanDays(projectStartDate, rowStartDate)
  return inclusiveDays === null ? null : Math.max(0, inclusiveDays - 1)
}

function addCalendarDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildWizardCandidateNetworkDateWindowFallback(rows: GeneratedTemplateRow[]) {
  const scheduleRows = rows
    .filter(isWizardGeneratedExecutableRow)
    .map((row) => {
      const plannedStartDate = readWizardGeneratedRowPlanStart(row)
      const plannedEndDate = readWizardGeneratedRowPlanEnd(row)
      const durationDays = calculateInclusiveCalendarSpanDays(plannedStartDate, plannedEndDate)
      return plannedStartDate && plannedEndDate && durationDays !== null
        ? { row, plannedStartDate, plannedEndDate, durationDays }
        : null
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (scheduleRows.length !== 1) return null

  const projectStart = scheduleRows
    .map((item) => item.plannedStartDate)
    .sort()[0]
  if (!projectStart) return null

  const initialSchedule = scheduleRows
    .map((item) => {
      const startDay = calculateWizardPlanWindowStartDay(projectStart, item.plannedStartDate)
      if (startDay === null) return null
      const finishDay = startDay + item.durationDays
      return {
        generatedRowId: item.row.clientRowId,
        startDay,
        finishDay,
        durationDays: item.durationDays,
        plannedStartDate: item.plannedStartDate,
        plannedEndDate: item.plannedEndDate,
        title: readWizardGeneratedRowTitle(item.row, item.row.clientRowId),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  if (initialSchedule.length === 0) return null

  const projectedNetworkSpanDays = Math.max(1, ...initialSchedule.map((item) => item.finishDay))
  const rowSchedule = initialSchedule
    .map((item) => {
      const totalFloatDays = Math.max(0, projectedNetworkSpanDays - item.finishDay)
      return {
        generatedRowId: item.generatedRowId,
        startDay: item.startDay,
        finishDay: item.finishDay,
        durationDays: item.durationDays,
        totalFloatDays,
        isCritical: totalFloatDays <= 0,
      }
    })
    .sort((left, right) => (
      left.startDay - right.startDay
      || left.finishDay - right.finishDay
      || left.generatedRowId.localeCompare(right.generatedRowId)
    ))
  const criticalGeneratedRowIds = rowSchedule
    .filter((node) => node.isCritical)
    .map((node) => node.generatedRowId)
  const detailByGeneratedRowId = new Map(initialSchedule.map((item) => [item.generatedRowId, item]))
  const criticalRowSummaries = rowSchedule
    .filter((node) => node.isCritical)
    .map((node) => {
      const detail = detailByGeneratedRowId.get(node.generatedRowId)
      return {
        generatedRowId: node.generatedRowId,
        title: detail?.title ?? node.generatedRowId,
        plannedStartDate: addCalendarDays(projectStart, node.startDay) ?? detail?.plannedStartDate ?? null,
        plannedEndDate: addCalendarDays(projectStart, Math.max(node.startDay, node.finishDay - 1))
          ?? detail?.plannedEndDate
          ?? null,
        startDay: node.startDay,
        finishDay: node.finishDay,
        durationDays: node.durationDays,
        totalFloatDays: node.totalFloatDays,
      }
    })

  return {
    source: 'generated_wbs_row_candidate_network_date_window_fallback',
    networkBasis: 'generated_wbs_rows_plan_date_window_without_dependency_edges',
    evidenceLevel: 'candidate_network_date_window_fallback_l1',
    projectedNetworkSpanDays,
    previewEdgeCount: 0,
    processConstraintRoutingCandidateEdgeCount: 0,
    processConstraintRoutingRuleCodes: [],
    unresolvedEdgeCount: 0,
    criticalGeneratedRowIds,
    criticalRowSummaries,
    materializationStatus: 'date_window_read_only',
    rowSchedule,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    mutationBoundary: 'candidate_network_date_window_fallback_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
  }
}

function countWizardCandidateNetworkExecutableScheduleRows(rows: GeneratedTemplateRow[]) {
  return rows
    .filter(isWizardCandidateScheduleQualityRow)
    .filter((row) => readWizardGeneratedRowPlanStart(row) && readWizardGeneratedRowPlanEnd(row))
    .length
}

function hasWizardCandidateNetworkEvidenceForTaskWrite(candidateNetworkEvaluation: unknown, scheduleRowCount: number) {
  const unresolvedEdgeCount = readEvidenceCountValue(candidateNetworkEvaluation, 'unresolvedEdgeCount')
  if (unresolvedEdgeCount > 0) return false

  if (scheduleRowCount <= 1) {
    return readEvidenceCountValue(candidateNetworkEvaluation, 'projectedNetworkSpanDays') > 0
      && countWizardCriticalGeneratedRows(candidateNetworkEvaluation) > 0
  }

  const previewEdgeCount = readEvidenceCountValue(candidateNetworkEvaluation, 'previewEdgeCount')
  const processConstraintRoutingCandidateEdgeCount = readEvidenceCountValue(
    candidateNetworkEvaluation,
    'processConstraintRoutingCandidateEdgeCount',
  )
  const criticalRowCount = countWizardCriticalGeneratedRows(candidateNetworkEvaluation)
  return previewEdgeCount > 0
    && criticalRowCount > 0
    && readEvidenceCountValue(candidateNetworkEvaluation, 'projectedNetworkSpanDays') > 0
    && unresolvedEdgeCount <= 0
    && processConstraintRoutingCandidateEdgeCount >= 0
}

function assertWizardCandidateNetworkEvidenceBeforeTaskWrite(params: {
  rows: GeneratedTemplateRow[]
  candidateNetworkEvaluation: unknown
}) {
  const scheduleRowCount = countWizardCandidateNetworkExecutableScheduleRows(params.rows)
  if (scheduleRowCount === 0) return
  if (hasWizardCandidateNetworkEvidenceForTaskWrite(params.candidateNetworkEvaluation, scheduleRowCount)) return

  throw Object.assign(new Error('Wizard candidate network evidence is required before task generation.'), {
    statusCode: 422,
    code: 'WIZARD_CANDIDATE_NETWORK_EVIDENCE_REQUIRED',
    details: {
      source: 'wizard_generation_candidate_network_pre_write_gate',
      code: 'critical_path_sequence',
      validationScope: 'generated_plan_network',
      requiredEvidence: readEvidenceCountValue(params.candidateNetworkEvaluation, 'unresolvedEdgeCount') > 0
        ? 'candidate_dependency_network_with_resolved_edges'
        : scheduleRowCount <= 1
          ? 'single_row_date_window_or_candidate_network_evidence'
          : 'candidate_dependency_network_with_preview_edges',
      planQualityAction: readEvidenceCountValue(params.candidateNetworkEvaluation, 'unresolvedEdgeCount') > 0
        ? 'resolve_candidate_dependency_edges_before_task_generation'
        : 'supply_candidate_dependency_sequence_before_task_generation',
      scheduleStructureBlocking: true,
      runtimeApprovalRequired: false,
      scheduleRowCount,
      projectedNetworkSpanDays: readEvidenceCountValue(params.candidateNetworkEvaluation, 'projectedNetworkSpanDays'),
      previewEdgeCount: readEvidenceCountValue(params.candidateNetworkEvaluation, 'previewEdgeCount'),
      processConstraintRoutingCandidateEdgeCount: readEvidenceCountValue(
        params.candidateNetworkEvaluation,
        'processConstraintRoutingCandidateEdgeCount',
      ),
      unresolvedEdgeCount: readEvidenceCountValue(params.candidateNetworkEvaluation, 'unresolvedEdgeCount'),
      criticalRowCount: countWizardCriticalGeneratedRows(params.candidateNetworkEvaluation),
      mutationBoundary: 'plan_structure_validation_only_no_task_write_no_dependency_write_no_plan_date_write_no_critical_path_fact_write_no_runtime_approval_record',
    },
  })
}

function buildWizardCandidateNetworkEvaluationFromAdjustedRows(
  rows: GeneratedTemplateRow[],
  previousCandidateNetworkEvaluation: unknown,
) {
  const adjustedRowCount = rows.filter(hasWizardDurationAssetPlanDateApplication).length
  const recalculated = buildCandidateNetworkEvaluationFromGeneratedDependencies(rows)
  if (!recalculated) {
    return previousCandidateNetworkEvaluation
      ?? buildWizardCandidateNetworkDateWindowFallback(rows)
      ?? null
  }
  if (adjustedRowCount <= 0) return previousCandidateNetworkEvaluation ?? recalculated

  const previous = readRecord(previousCandidateNetworkEvaluation)
  const previousProjectedNetworkSpanDays = readNumber(previous.projectedNetworkSpanDays)
  const recalculatedProjectedNetworkSpanDays = readNumber(recalculated.projectedNetworkSpanDays)
  return {
    ...recalculated,
    durationAssetPlanDateNetworkRecalculation: {
      source: 'wizard_duration_asset_plan_date_network_recalculation',
      adjustedRowCount,
      previousProjectedNetworkSpanDays,
      recalculatedProjectedNetworkSpanDays,
      evidenceLevel: 'candidate_duration_asset_network_recalculated_l1',
      mutationBoundary: 'candidate_network_recalculation_only_no_task_dependency_write_no_plan_date_write_no_runtime_publication',
    },
  }
}

function readWizardCandidateNetworkRowSchedule(candidateNetworkEvaluation: unknown) {
  return readArray(readRecord(candidateNetworkEvaluation).rowSchedule)
    .map((item) => {
      const record = readRecord(item)
      const generatedRowId = firstText(record.generatedRowId, record.generated_row_id)
      const startDay = readNumber(record.startDay ?? record.start_day)
      const finishDay = readNumber(record.finishDay ?? record.finish_day)
      const durationDays = readNumber(record.durationDays ?? record.duration_days)
      return generatedRowId && startDay !== null && finishDay !== null && durationDays !== null
        ? {
            generatedRowId,
            startDay: Math.max(0, Math.round(startDay)),
            finishDay: Math.max(1, Math.round(finishDay)),
            durationDays: Math.max(1, Math.round(durationDays)),
          }
        : null
    })
    .filter((item): item is {
      generatedRowId: string
      startDay: number
      finishDay: number
      durationDays: number
    } => Boolean(item))
}

function applyWizardCandidateNetworkPlanDatesToRows(
  rows: GeneratedTemplateRow[],
  candidateNetworkEvaluation: unknown,
) {
  const rowSchedule = readWizardCandidateNetworkRowSchedule(candidateNetworkEvaluation)
  if (rowSchedule.length === 0) return rows

  const hasDurationAssetAdjustedRows = rows.some(hasWizardDurationAssetPlanDateApplication)
  const networkRecalculation = readRecord(
    readRecord(candidateNetworkEvaluation).durationAssetPlanDateNetworkRecalculation,
  )
  if (hasDurationAssetAdjustedRows && Object.keys(networkRecalculation).length === 0) {
    return rows
  }

  const projectStart = rows
    .filter(isWizardGeneratedExecutableRow)
    .map(readWizardGeneratedRowPlanStart)
    .filter((date): date is string => Boolean(date))
    .sort()[0]
  if (!projectStart) return rows

  const scheduleByGeneratedRowId = new Map(rowSchedule.map((schedule) => [schedule.generatedRowId, schedule]))
  let appliedRowCount = 0
  const appliedRows = rows.map((row) => {
    if (!isWizardGeneratedExecutableRow(row)) return row
    const schedule = scheduleByGeneratedRowId.get(row.clientRowId)
    if (!schedule || schedule.finishDay <= schedule.startDay) return row

    const currentStartDate = readWizardGeneratedRowPlanStart(row)
    const currentEndDate = readWizardGeneratedRowPlanEnd(row)
    const currentDurationDays = calculateInclusiveCalendarSpanDays(currentStartDate, currentEndDate)
    if (currentDurationDays !== null && currentDurationDays !== schedule.durationDays) {
      return row
    }

    const plannedStartDate = addCalendarDays(projectStart, schedule.startDay)
    const plannedEndDate = addCalendarDays(projectStart, schedule.finishDay - 1)
    if (!plannedStartDate || !plannedEndDate) return row
    if (currentStartDate === plannedStartDate && currentEndDate === plannedEndDate) return row

    appliedRowCount += 1
    const values = readRecord(row.values)
    const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
    return {
      ...row,
      values: {
        ...values,
        start_date: plannedStartDate,
        end_date: plannedEndDate,
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
        standard_task_metadata: {
          ...metadata,
          wizardCandidateNetworkPlanDateApplication: {
            source: 'wizard_candidate_network_plan_date_application',
            previousPlannedStartDate: currentStartDate,
            previousPlannedEndDate: currentEndDate,
            plannedStartDate,
            plannedEndDate,
            startDay: schedule.startDay,
            finishDay: schedule.finishDay,
            durationDays: schedule.durationDays,
            networkBasis: firstText(readRecord(candidateNetworkEvaluation).networkBasis),
            evidenceLevel: 'candidate_network_plan_dates_applied_l1',
            mutationBoundary: 'wizard_generated_task_plan_date_write_only_no_dependency_runtime_write_no_seed_write_no_production_claim',
          },
        },
      },
    }
  })

  return appliedRowCount > 0 ? applyWizardSummaryRollupPlanDatesToRows(appliedRows) : rows
}

function readWizardGeneratedRowsLatestPlanEnd(rows: GeneratedTemplateRow[]) {
  const ends = rows
    .map(readWizardGeneratedRowPlanEnd)
    .filter((date): date is string => Boolean(date))
    .sort()
  return ends.at(-1) ?? null
}

function readWizardTargetFeasibilityMode(value: unknown): ScheduleAccelerationMode {
  const mode = firstText(
    readRecord(value).mode,
    readRecord(value).targetConstraintMode,
    readRecord(value).target_constraint_mode,
  )
  if (mode === 'compression_preview' || mode === 'reverse_cpm' || mode === 'compare_only') return mode
  return 'compare_only'
}

function buildWizardTargetFeasibilityFromAdjustedRows(
  rows: GeneratedTemplateRow[],
  originalRows: GeneratedTemplateRow[],
  previousTargetFeasibility: unknown,
  fallbackTargetEndDate?: unknown,
): GeneratedTargetFeasibility | null {
  const adjustedRowCount = rows.filter(hasWizardDurationAssetPlanDateApplication).length
  const previous = readRecord(previousTargetFeasibility)
  if (adjustedRowCount <= 0) return Object.keys(previous).length > 0
    ? previousTargetFeasibility as GeneratedTargetFeasibility
    : null

  const targetEndDate = normalizeDate(previous.targetEndDate ?? previous.target_end_date ?? fallbackTargetEndDate)
  if (!targetEndDate) return Object.keys(previous).length > 0
    ? previousTargetFeasibility as GeneratedTargetFeasibility
    : null

  const previousNaturalEndDate = normalizeDate(previous.naturalEndDate ?? previous.natural_end_date)
  const adjustedLatestPlanEndDate = readWizardGeneratedRowsLatestPlanEnd(rows)
  const originalLatestPlanEndDate = readWizardGeneratedRowsLatestPlanEnd(originalRows)
  const previousMatchesOriginalNaturalEnd = Boolean(
    previousNaturalEndDate
    && originalLatestPlanEndDate
    && previousNaturalEndDate === originalLatestPlanEndDate,
  )
  if (
    previousNaturalEndDate
    && adjustedLatestPlanEndDate
    && adjustedLatestPlanEndDate <= previousNaturalEndDate
    && !previousMatchesOriginalNaturalEnd
  ) {
    return previousTargetFeasibility as GeneratedTargetFeasibility
  }

  const recalculated = evaluateBaselineTargetAlignment({
    rows: rows as ScheduleAccelerationRow[],
    targetEndDate,
    mode: readWizardTargetFeasibilityMode(previous),
  })
  if (!recalculated) return Object.keys(previous).length > 0
    ? previousTargetFeasibility as GeneratedTargetFeasibility
    : null

  const previousOvershootDays = readNumber(previous.overshootDays ?? previous.overshoot_days)
  const recalculatedWithEvidence = {
    ...recalculated,
    durationAssetPlanDateTargetRecalculation: {
      source: 'wizard_duration_asset_plan_date_target_recalculation',
      adjustedRowCount,
      previousNaturalEndDate,
      recalculatedNaturalEndDate: normalizeDate(recalculated.naturalEndDate),
      previousOvershootDays,
      recalculatedOvershootDays: readNumber(recalculated.overshootDays),
      evidenceLevel: 'candidate_duration_asset_target_recalculated_l1',
      mutationBoundary: 'candidate_target_recalculation_only_no_plan_date_write_no_dependency_write_no_runtime_publication',
    },
  }
  return recalculatedWithEvidence as GeneratedTargetFeasibility
}

function buildCandidateDurationAssetUncoveredScheduleRow(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  return {
    clientRowId: row.clientRowId,
    title: readWizardGeneratedRowTitle(row),
    plannedStartDate: normalizeDate(values.planned_start_date ?? values.start_date),
    plannedEndDate: normalizeDate(values.planned_end_date ?? values.end_date),
    sourceRowSortOrder: row.sortOrder,
    missingInputCode: 'duration_asset_lineage',
    qualityReviewAction: 'supply_duration_asset_for_row_before_task_generation',
  }
}

const WIZARD_DURATION_ASSET_REVIEW_CODES = [
  'standard_work_duration_seed',
  't2_rhythm_template',
  'runtime_reference_days',
  'duration_risk_range',
  'construction_calendar',
  'process_seasonal_adjustment',
  'dependency_sequence',
] as const

const WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES = [
  'standard_work_duration_seed',
  't2_rhythm_template',
  'duration_risk_range',
  'construction_calendar',
] as const

const WIZARD_T2_RHYTHM_NOT_APPLICABLE_STATUS = 'not_applicable_one_off_activity'

const WIZARD_DURATION_ASSET_REVIEW_LABELS: Record<string, string> = {
  standard_work_duration_seed: '标准工期 seed',
  t2_rhythm_template: 'T2 节奏模板',
  runtime_reference_days: '运行参考工期',
  duration_risk_range: '工期风险区间',
  construction_calendar: '施工日历',
  process_seasonal_adjustment: '工序季节修正',
  dependency_sequence: '工序依赖',
  project_scale_quantity_proxy: '项目规模/工程量代理',
  business_type_specialty_duration_asset: '业态专属工期资产',
  business_type_specific_t2_rhythm_template: '业态专属 T2 节奏',
  critical_path_candidate: 'critical path candidate',
  float_calculation: 'float calculation',
  duration_selection_basis: 'duration selection basis',
}

const WIZARD_DURATION_ASSET_CONSUMPTION_POLICY: Record<string, string> = {
  standard_work_duration_seed: 'cold_start_baseline_asset',
  t2_rhythm_template: 'cold_start_baseline_asset',
  runtime_reference_days: 'optional_published_learning_overlay',
  duration_risk_range: 'cold_start_baseline_or_published_learning_overlay',
  construction_calendar: 'candidate_plan_calendar_input',
  process_seasonal_adjustment: 'candidate_plan_adjustment_input',
  dependency_sequence: 'candidate_plan_dependency_input',
  project_scale_quantity_proxy: 'candidate_plan_quantity_input',
  business_type_specialty_duration_asset: 'candidate_plan_business_type_input',
  business_type_specific_t2_rhythm_template: 'candidate_plan_business_type_rhythm_input',
  critical_path_candidate: 'candidate_plan_network_output',
  float_calculation: 'candidate_plan_network_output',
  duration_selection_basis: 'candidate_plan_duration_output',
}

function buildWizardDurationAssetCoverageStatus(presentAssetCodes: string[], missingAssetCodes: string[]) {
  if (presentAssetCodes.length === 0) return 'missing_duration_asset_lineage'
  if (missingAssetCodes.length === 0) return 'full_asset_coverage'
  return 'partial_duration_asset_coverage'
}

function buildWizardCandidateRequiredDurationAssetCodes(t2RhythmApplicability: unknown) {
  const t2IsNotApplicable = firstText(t2RhythmApplicability) === WIZARD_T2_RHYTHM_NOT_APPLICABLE_STATUS
  return WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES
    .filter((code) => code !== 't2_rhythm_template' || !t2IsNotApplicable)
}

function buildWizardCandidateDurationAssetCoverageStatus(
  presentAssetCodes: string[],
  candidateRequiredAssetCodes: readonly string[] = WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES,
) {
  return candidateRequiredAssetCodes.every((code) => presentAssetCodes.includes(code))
    ? 'candidate_asset_coverage_ready'
    : 'candidate_required_duration_asset_missing'
}

function joinWizardDurationAssetEvidenceParts(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' / ')
}

function readWizardCriticalPathEvidenceFromSources(...sources: unknown[]) {
  for (const source of sources) {
    const record = readRecord(source)
    if (Object.keys(record).length === 0) continue
    const criticalPathCandidateValue = record.criticalPathCandidate ?? record.critical_path_candidate
    const totalFloatDays = readNumber(record.totalFloatDays ?? record.total_float_days)
    const earlyStartOffsetDays = readNumber(record.earlyStartOffsetDays ?? record.early_start_offset_days)
    const earlyFinishOffsetDays = readNumber(record.earlyFinishOffsetDays ?? record.early_finish_offset_days)
    const lateStartOffsetDays = readNumber(record.lateStartOffsetDays ?? record.late_start_offset_days)
    const lateFinishOffsetDays = readNumber(record.lateFinishOffsetDays ?? record.late_finish_offset_days)
    const hasCriticalPathCandidateValue = criticalPathCandidateValue !== undefined && criticalPathCandidateValue !== null
    const criticalPathCandidate = hasCriticalPathCandidateValue
      ? isTruthyFlag(criticalPathCandidateValue)
      : null
    const hasFloatEvidence = totalFloatDays !== null
      || earlyStartOffsetDays !== null
      || earlyFinishOffsetDays !== null
      || lateStartOffsetDays !== null
      || lateFinishOffsetDays !== null
    const hasEvidence = hasCriticalPathCandidateValue || hasFloatEvidence
    if (!hasEvidence) continue
    return {
      hasEvidence,
      criticalPathCandidate,
      totalFloatDays,
      earlyStartOffsetDays,
      earlyFinishOffsetDays,
      lateStartOffsetDays,
      lateFinishOffsetDays,
    }
  }
  return {
    hasEvidence: false,
    criticalPathCandidate: null,
    totalFloatDays: null,
    earlyStartOffsetDays: null,
    earlyFinishOffsetDays: null,
    lateStartOffsetDays: null,
    lateFinishOffsetDays: null,
  }
}

function formatWizardCriticalPathEvidenceLevel(
  evidence: ReturnType<typeof readWizardCriticalPathEvidenceFromSources>,
) {
  return joinWizardDurationAssetEvidenceParts([
    evidence.criticalPathCandidate === null
      ? null
      : evidence.criticalPathCandidate
        ? 'critical yes'
        : 'critical no',
    evidence.totalFloatDays == null ? null : `float ${evidence.totalFloatDays} days`,
    evidence.earlyStartOffsetDays == null ? null : `ES ${evidence.earlyStartOffsetDays}`,
    evidence.earlyFinishOffsetDays == null ? null : `EF ${evidence.earlyFinishOffsetDays}`,
    evidence.lateStartOffsetDays == null ? null : `LS ${evidence.lateStartOffsetDays}`,
    evidence.lateFinishOffsetDays == null ? null : `LF ${evidence.lateFinishOffsetDays}`,
  ])
}

type WizardDurationSelectionBasisEvidence = {
  hasEvidence: boolean
  durationSelectionRule: string | null
  durationCalibrationSource: string | null
  durationMaturity: string | null
  durationReviewGate: string | null
  durationTruthSource: string | null
  standardWorkDurationSeedP50Days: number | null
  t2RhythmTemplateP50Days: number | null
  realPlanSkeletonDurationDays: number | null
  realPlanSkeletonFloorApplied: boolean | null
  maxNonSkeletonAssetDays: number | null
}

function hasExplicitValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function readWizardDurationSelectionBasisEvidenceFromSources(
  ...sources: unknown[]
): WizardDurationSelectionBasisEvidence {
  const evidence: WizardDurationSelectionBasisEvidence = {
    hasEvidence: false,
    durationSelectionRule: null,
    durationCalibrationSource: null,
    durationMaturity: null,
    durationReviewGate: null,
    durationTruthSource: null,
    standardWorkDurationSeedP50Days: null,
    t2RhythmTemplateP50Days: null,
    realPlanSkeletonDurationDays: null,
    realPlanSkeletonFloorApplied: null,
    maxNonSkeletonAssetDays: null,
  }

  for (const source of sources) {
    const record = readRecord(source)
    if (Object.keys(record).length === 0) continue

    evidence.durationSelectionRule ||= firstText(
      record.durationSelectionRule,
      record.duration_selection_rule,
      record.selectionRule,
      record.selection_rule,
    ) || null
    evidence.durationCalibrationSource ||= firstText(
      record.durationCalibrationSource,
      record.duration_calibration_source,
      record.calibrationSource,
      record.calibration_source,
    ) || null
    evidence.durationMaturity ||= firstText(
      record.durationMaturity,
      record.duration_maturity,
      record.dataMaturity,
      record.data_maturity,
      record.maturity,
    ) || null
    evidence.durationReviewGate ||= firstText(
      record.durationReviewGate,
      record.duration_review_gate,
      record.dataUpgradeBlockedBy,
      record.data_upgrade_blocked_by,
      record.reviewGate,
      record.review_gate,
    ) || null
    evidence.durationTruthSource ||= firstText(
      record.durationTruthSource,
      record.duration_truth_source,
      record.planDurationTruthSource,
      record.plan_duration_truth_source,
      record.truthSource,
      record.truth_source,
    ) || null
    if (evidence.standardWorkDurationSeedP50Days === null) {
      evidence.standardWorkDurationSeedP50Days = readNumber(
        record.standardWorkDurationSeedP50Days
          ?? record.standard_work_duration_seed_p50_days,
      )
    }
    if (evidence.t2RhythmTemplateP50Days === null) {
      evidence.t2RhythmTemplateP50Days = readNumber(
        record.t2RhythmTemplateP50Days
          ?? record.t2_rhythm_template_p50_days,
      )
    }
    if (evidence.realPlanSkeletonDurationDays === null) {
      evidence.realPlanSkeletonDurationDays = readNumber(
        record.realPlanSkeletonDurationDays
          ?? record.real_plan_skeleton_duration_days,
      )
    }
    if (evidence.realPlanSkeletonFloorApplied === null) {
      const floorApplied = record.realPlanSkeletonFloorApplied
        ?? record.real_plan_skeleton_floor_applied
      if (hasExplicitValue(floorApplied)) {
        evidence.realPlanSkeletonFloorApplied = isTruthyFlag(floorApplied)
      }
    }
    if (evidence.maxNonSkeletonAssetDays === null) {
      evidence.maxNonSkeletonAssetDays = readNumber(
        record.maxNonSkeletonAssetDays
          ?? record.max_non_skeleton_asset_days,
      )
    }
  }

  evidence.hasEvidence = Boolean(
    evidence.durationSelectionRule
      || evidence.durationCalibrationSource
      || evidence.durationMaturity
      || evidence.durationReviewGate
      || evidence.durationTruthSource
      || evidence.standardWorkDurationSeedP50Days !== null
      || evidence.t2RhythmTemplateP50Days !== null
      || evidence.realPlanSkeletonDurationDays !== null
      || evidence.realPlanSkeletonFloorApplied !== null
      || evidence.maxNonSkeletonAssetDays !== null,
  )
  return evidence
}

function formatWizardDurationSelectionBasisEvidenceLevel(
  evidence: WizardDurationSelectionBasisEvidence,
) {
  return joinWizardDurationAssetEvidenceParts([
    evidence.durationSelectionRule ? `rule ${evidence.durationSelectionRule}` : null,
    evidence.durationCalibrationSource ? `calibration ${evidence.durationCalibrationSource}` : null,
    evidence.durationMaturity ? `maturity ${evidence.durationMaturity}` : null,
    evidence.durationReviewGate ? `gate ${evidence.durationReviewGate}` : null,
    evidence.durationTruthSource ? `truth ${evidence.durationTruthSource}` : null,
    evidence.standardWorkDurationSeedP50Days == null
      ? null
      : `seed P50 ${evidence.standardWorkDurationSeedP50Days}`,
    evidence.t2RhythmTemplateP50Days == null
      ? null
      : `T2 P50 ${evidence.t2RhythmTemplateP50Days}`,
    evidence.realPlanSkeletonDurationDays == null
      ? null
      : `skeleton ${evidence.realPlanSkeletonDurationDays} days`,
    evidence.realPlanSkeletonFloorApplied == null
      ? null
      : `skeleton_floor ${evidence.realPlanSkeletonFloorApplied ? 'yes' : 'no'}`,
    evidence.maxNonSkeletonAssetDays == null
      ? null
      : `max non-skeleton ${evidence.maxNonSkeletonAssetDays} days`,
  ])
}

function buildWizardDurationAssetReviewSummary(
  code: string,
  candidate: Record<string, unknown> | null,
  usageStatus: 'candidate_asset_used' | 'missing_from_candidate_row',
) {
  const label = WIZARD_DURATION_ASSET_REVIEW_LABELS[code] ?? code
  const consumptionPolicy = WIZARD_DURATION_ASSET_CONSUMPTION_POLICY[code]
    ?? 'candidate_plan_optional_input'
  if (!candidate || usageStatus === 'missing_from_candidate_row') {
    return {
      code,
      label,
      usageStatus,
      consumptionPolicy: code === 'runtime_reference_days'
        ? 'optional_learning_overlay_not_available'
        : WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES.includes(
            code as (typeof WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES)[number],
          )
          ? 'required_candidate_plan_input_missing'
          : 'optional_candidate_plan_input_not_available',
    }
  }

  if (code === 'standard_work_duration_seed') {
    const reference = firstText(
      candidate.standardWorkDurationSeedStableCode,
      candidate.standard_work_duration_seed_stable_code,
    ) || null
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.standardWorkDurationSeedResolverSource, candidate.standard_work_duration_seed_resolver_source),
      firstText(candidate.standardWorkDurationSeedResolverVersionId, candidate.standard_work_duration_seed_resolver_version_id),
    ])
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 't2_rhythm_template') {
    const reference = firstText(candidate.t2RhythmTemplateId, candidate.t2_rhythm_template_id) || null
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.t2RhythmTemplateResolverSource, candidate.t2_rhythm_template_resolver_source),
      firstText(candidate.t2RhythmTemplateResolverVersionId, candidate.t2_rhythm_template_resolver_version_id),
    ])
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'runtime_reference_days') {
    const reference = firstText(
      candidate.runtimeReferenceDaysStableCode,
      candidate.runtime_reference_days_stable_code,
    ) || null
    const distribution = normalizeDurationRiskDistributionDto(
      candidate.runtimeReferenceDaysDurationRiskDistribution
        ?? candidate.runtime_reference_days_duration_risk_distribution,
    )
    const p50 = distribution?.availability === 'available' ? distribution.p50Duration.value : null
    const p80 = distribution?.availability === 'available' ? distribution.p80Duration.value : null
    const sampleCount = distribution?.availability === 'available' ? distribution.sampleCount : null
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.runtimeReferenceDaysEvidenceLevel, candidate.runtime_reference_days_evidence_level),
      p50 == null ? null : `P50 ${p50}`,
      p80 == null ? null : `P80 ${p80}`,
      sampleCount == null ? null : `样本 ${sampleCount}`,
    ])
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'duration_risk_range') {
    const p20 = readNumber(candidate.riskP20DurationDays ?? candidate.risk_p20_duration_days)
    const p50 = readNumber(candidate.riskP50DurationDays ?? candidate.risk_p50_duration_days)
    const p80 = readNumber(candidate.riskP80DurationDays ?? candidate.risk_p80_duration_days)
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      p20 == null ? null : `P20 ${p20}`,
      p50 == null ? null : `P50 ${p50}`,
      p80 == null ? null : `P80 ${p80}`,
    ])
    return { code, label, reference: null, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'construction_calendar') {
    const windowCount = readNumber(candidate.constructionCalendarWindowCount ?? candidate.construction_calendar_window_count)
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.calendarBasis, candidate.calendar_basis),
      windowCount == null ? null : `${windowCount} 窗口`,
    ])
    return { code, label, reference: null, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'process_seasonal_adjustment') {
    const multiplier = readNumber(candidate.processSeasonalMultiplier ?? candidate.process_seasonal_multiplier)
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.processSeasonalClimateSignal, candidate.process_seasonal_climate_signal),
      firstText(candidate.processSeasonalImpactBand, candidate.process_seasonal_impact_band),
      multiplier == null ? null : `x${multiplier}`,
    ])
    return { code, label, reference: null, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'project_scale_quantity_proxy') {
    const source = firstText(
      candidate.projectScaleQuantityProxySource,
      candidate.project_scale_quantity_proxy_source,
      candidate.quantityOrProductivitySource,
      candidate.quantity_or_productivity_source,
    ) || null
    const value = readNumber(
      candidate.projectScaleQuantityProxyValue
        ?? candidate.project_scale_quantity_proxy_value
        ?? candidate.quantityOrProductivityValue
        ?? candidate.quantity_or_productivity_value,
    )
    const unit = firstText(
      candidate.projectScaleQuantityProxyUnit,
      candidate.project_scale_quantity_proxy_unit,
      candidate.quantityOrProductivityUnit,
      candidate.quantity_or_productivity_unit,
    )
    const basis = firstText(
      candidate.projectScaleQuantityProxyBasis,
      candidate.project_scale_quantity_proxy_basis,
      candidate.quantityOrProductivityBasis,
      candidate.quantity_or_productivity_basis,
    )
    const productivityDerivedDurationDays = readNumber(
      candidate.productivityDerivedDurationDays
        ?? candidate.productivity_derived_duration_days,
    )
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      source,
      value == null ? null : `quantity ${value}`,
      unit,
      productivityDerivedDurationDays == null ? null : `productivity duration ${productivityDerivedDurationDays} days`,
      basis,
    ])
    return { code, label, reference: source, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'business_type_specialty_duration_asset') {
    const reference = firstText(candidate.businessType, candidate.business_type) || null
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.businessTypeProfileSourceType, candidate.business_type_profile_source_type),
      firstText(candidate.businessTypeProfileTemplateId, candidate.business_type_profile_template_id),
      firstText(candidate.standardWorkDurationSeedStableCode, candidate.standard_work_duration_seed_stable_code),
      firstText(candidate.standardWorkDurationSeedResolverSource, candidate.standard_work_duration_seed_resolver_source),
    ])
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'business_type_specific_t2_rhythm_template') {
    const reference = firstText(candidate.t2RhythmTemplateId, candidate.t2_rhythm_template_id) || null
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.businessType, candidate.business_type),
      firstText(candidate.businessTypeProfileSourceType, candidate.business_type_profile_source_type),
      firstText(candidate.t2RhythmTemplateResolverSource, candidate.t2_rhythm_template_resolver_source),
      firstText(candidate.businessTypeProfileTemplateGroup, candidate.business_type_profile_template_group),
    ])
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'critical_path_candidate') {
    const evidence = readWizardCriticalPathEvidenceFromSources(
      candidate.criticalPathEvidence,
      candidate.critical_path_evidence,
      candidate,
    )
    const reference = evidence.criticalPathCandidate === true
      ? 'critical_path_candidate'
      : evidence.criticalPathCandidate === false
        ? 'not_critical_candidate'
        : null
    const evidenceLevel = formatWizardCriticalPathEvidenceLevel(evidence)
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'float_calculation') {
    const evidence = readWizardCriticalPathEvidenceFromSources(
      candidate.criticalPathEvidence,
      candidate.critical_path_evidence,
      candidate,
    )
    const reference = evidence.totalFloatDays == null ? 'float_offsets' : 'total_float'
    const evidenceLevel = formatWizardCriticalPathEvidenceLevel(evidence)
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'duration_selection_basis') {
    const evidence = readWizardDurationSelectionBasisEvidenceFromSources(
      candidate.durationSelection,
      candidate.duration_selection,
      candidate,
    )
    const reference = evidence.durationSelectionRule || evidence.durationTruthSource || null
    const evidenceLevel = formatWizardDurationSelectionBasisEvidenceLevel(evidence)
    return { code, label, reference, evidenceLevel, usageStatus, consumptionPolicy }
  }

  if (code === 'dependency_sequence') {
    const reference = firstText(candidate.dependencyAssetStableCode, candidate.dependency_asset_stable_code) || null
    const evidenceSourceKeys = readStringArray(
      candidate.dependencyAssetEvidenceSourceKeys ?? candidate.dependency_asset_evidence_source_keys,
    )
    const dependencyRuleSource = firstText(candidate.dependencyRuleSource, candidate.dependency_rule_source)
    const dependencyLayerStack = firstText(candidate.dependencyLayerStack, candidate.dependency_layer_stack)
    const dependencyProductionWritePolicy = firstText(
      candidate.dependencyProductionWritePolicy,
      candidate.dependency_production_write_policy,
    )
    const dependencyTimingAssetConsumed = isTruthyFlag(
      candidate.dependencyTimingAssetConsumed ?? candidate.dependency_timing_asset_consumed,
    )
    const dependencyTimingSelectedLagDays = readNumber(
      candidate.dependencyTimingSelectedLagDays ?? candidate.dependency_timing_selected_lag_days,
    )
    const phaseAnchorDependencyCount = readNumber(
      candidate.phaseAnchorDependencyCount ?? candidate.phase_anchor_dependency_count,
    )
    const dependencyStartAnchor = isTruthyFlag(candidate.dependencyStartAnchor ?? candidate.dependency_start_anchor)
    const dependencyAnchorType = firstText(candidate.dependencyAnchorType, candidate.dependency_anchor_type)
    const evidenceLevel = joinWizardDurationAssetEvidenceParts([
      firstText(candidate.dependencyAssetStrength, candidate.dependency_asset_strength),
      firstText(candidate.dependencyAssetDependencyType, candidate.dependency_asset_dependency_type),
      readNumber(candidate.dependencyAssetLagDays ?? candidate.dependency_asset_lag_days) == null
        ? null
        : `lag ${readNumber(candidate.dependencyAssetLagDays ?? candidate.dependency_asset_lag_days)}`,
      dependencyTimingSelectedLagDays == null ? null : `timing lag ${dependencyTimingSelectedLagDays}`,
      dependencyTimingAssetConsumed ? 'dependency_timing_asset' : null,
      dependencyRuleSource,
      dependencyLayerStack,
      dependencyProductionWritePolicy,
      phaseAnchorDependencyCount == null ? null : `anchors ${phaseAnchorDependencyCount}`,
      dependencyStartAnchor ? 'start_anchor' : null,
      dependencyAnchorType,
      evidenceSourceKeys.join('、'),
    ])
    return {
      code,
      label,
      reference: reference || dependencyRuleSource || (dependencyTimingAssetConsumed ? 'dependency_timing_asset' : null),
      evidenceLevel,
      usageStatus,
      consumptionPolicy,
    }
  }

  return { code, label, reference: null, evidenceLevel: null, usageStatus, consumptionPolicy }
}

function buildWizardDurationAssetReviewRowFromCandidate(candidate: Record<string, unknown>, index: number) {
  const presentAssetCodes: string[] = []
  const t2RhythmApplicability = firstText(
    candidate.t2RhythmApplicability,
    candidate.t2_rhythm_applicability,
  ) || 'required_repetitive_or_workface_activity'
  const candidateRequiredAssetCodes = buildWizardCandidateRequiredDurationAssetCodes(t2RhythmApplicability)
  const nonApplicableCandidateAssetCodes = t2RhythmApplicability === WIZARD_T2_RHYTHM_NOT_APPLICABLE_STATUS
    ? ['t2_rhythm_template']
    : []
  if (firstText(candidate.standardWorkDurationSeedStableCode, candidate.standard_work_duration_seed_stable_code)) {
    pushUniqueText(presentAssetCodes, 'standard_work_duration_seed')
  }
  if (firstText(candidate.t2RhythmTemplateId, candidate.t2_rhythm_template_id)) {
    pushUniqueText(presentAssetCodes, 't2_rhythm_template')
  }
  const runtimeReferenceDaysStableCode = firstText(
    candidate.runtimeReferenceDaysStableCode,
    candidate.runtime_reference_days_stable_code,
  )
  const runtimeReferenceDaysEvidenceLevel = firstText(
    candidate.runtimeReferenceDaysEvidenceLevel,
    candidate.runtime_reference_days_evidence_level,
  )
  const runtimeReferenceDaysSampleCount = readNumber(
    candidate.runtimeReferenceDaysSampleCount
      ?? candidate.runtime_reference_days_sample_count,
  )
  if (runtimeReferenceDaysStableCode
    && runtimeReferenceDaysEvidenceLevel
    && (runtimeReferenceDaysSampleCount ?? 0) > 0) {
    pushUniqueText(presentAssetCodes, 'runtime_reference_days')
  }
  if (readNumber(candidate.riskP20DurationDays ?? candidate.risk_p20_duration_days) !== null
    || readNumber(candidate.riskP50DurationDays ?? candidate.risk_p50_duration_days) !== null
    || readNumber(candidate.riskP80DurationDays ?? candidate.risk_p80_duration_days) !== null) {
    pushUniqueText(presentAssetCodes, 'duration_risk_range')
  }
  const calendarBasis = firstText(candidate.calendarBasis, candidate.calendar_basis)
  const constructionCalendarWindowCount = readNumber(
    candidate.constructionCalendarWindowCount
      ?? candidate.construction_calendar_window_count,
  ) ?? 0
  if ((calendarBasis && calendarBasis !== 'calendar_day') || constructionCalendarWindowCount > 0) {
    pushUniqueText(presentAssetCodes, 'construction_calendar')
  }
  if (isTruthyFlag(candidate.processSeasonalDurationAssetConsumed ?? candidate.process_seasonal_duration_asset_consumed)) {
    pushUniqueText(presentAssetCodes, 'process_seasonal_adjustment')
  }
  const hasProjectScaleQuantityProxyEvidence = Boolean(
    isTruthyFlag(candidate.projectScaleQuantityProxyApplied ?? candidate.project_scale_quantity_proxy_applied)
      || isTruthyFlag(candidate.projectScaleQuantityProxyConsumed ?? candidate.project_scale_quantity_proxy_consumed)
      || firstText(candidate.projectScaleQuantityProxySource, candidate.project_scale_quantity_proxy_source)
      || readNumber(candidate.projectScaleQuantityProxyValue ?? candidate.project_scale_quantity_proxy_value) !== null
      || firstText(candidate.projectScaleQuantityProxyUnit, candidate.project_scale_quantity_proxy_unit)
      || firstText(candidate.projectScaleQuantityProxyBasis, candidate.project_scale_quantity_proxy_basis)
      || readNumber(candidate.productivityDerivedDurationDays ?? candidate.productivity_derived_duration_days) !== null
  )
  if (hasProjectScaleQuantityProxyEvidence) {
    pushUniqueText(presentAssetCodes, 'project_scale_quantity_proxy')
  }
  const businessTypeProfileSourceType = firstText(
    candidate.businessTypeProfileSourceType,
    candidate.business_type_profile_source_type,
  )
  const businessType = firstText(candidate.businessType, candidate.business_type)
  const t2RhythmTemplateIdForBusinessType = firstText(candidate.t2RhythmTemplateId, candidate.t2_rhythm_template_id)
  const normalizedBusinessTypeForT2 = businessType?.replace(/_/g, '-')
  const businessTypeSpecialtyDurationAssetApplied = isTruthyFlag(
    candidate.businessTypeSpecialtyDurationAssetApplied
      ?? candidate.business_type_specialty_duration_asset_applied,
  ) || Boolean(
    businessType
      && businessTypeProfileSourceType === 'business_type_master_plan_profile_v1'
      && firstText(candidate.standardWorkDurationSeedStableCode, candidate.standard_work_duration_seed_stable_code),
  )
  const businessTypeSpecificT2RhythmTemplateApplied = isTruthyFlag(
    candidate.businessTypeSpecificT2RhythmTemplateApplied
      ?? candidate.business_type_specific_t2_rhythm_template_applied,
  ) || Boolean(
    businessType
      && businessTypeProfileSourceType === 'business_type_master_plan_profile_v1'
      && t2RhythmTemplateIdForBusinessType
      && (
        t2RhythmTemplateIdForBusinessType.includes(`t2-${businessType}-`)
          || (normalizedBusinessTypeForT2 && t2RhythmTemplateIdForBusinessType.includes(`t2-${normalizedBusinessTypeForT2}-`))
      ),
  )
  if (businessTypeSpecialtyDurationAssetApplied) {
    pushUniqueText(presentAssetCodes, 'business_type_specialty_duration_asset')
  }
  if (businessTypeSpecificT2RhythmTemplateApplied) {
    pushUniqueText(presentAssetCodes, 'business_type_specific_t2_rhythm_template')
  }
  const criticalPathEvidence = readWizardCriticalPathEvidenceFromSources(
    candidate.criticalPathEvidence,
    candidate.critical_path_evidence,
    candidate,
  )
  if (criticalPathEvidence.criticalPathCandidate === true) {
    pushUniqueText(presentAssetCodes, 'critical_path_candidate')
  }
  if (criticalPathEvidence.totalFloatDays !== null
    || criticalPathEvidence.earlyStartOffsetDays !== null
    || criticalPathEvidence.earlyFinishOffsetDays !== null
    || criticalPathEvidence.lateStartOffsetDays !== null
    || criticalPathEvidence.lateFinishOffsetDays !== null) {
    pushUniqueText(presentAssetCodes, 'float_calculation')
  }
  const durationSelectionBasisEvidence = readWizardDurationSelectionBasisEvidenceFromSources(
    candidate.durationSelection,
    candidate.duration_selection,
    candidate,
  )
  if (durationSelectionBasisEvidence.hasEvidence) {
    pushUniqueText(presentAssetCodes, 'duration_selection_basis')
  }
  if (isTruthyFlag(candidate.dependencyAssetConsumed ?? candidate.dependency_asset_consumed)
    || firstText(candidate.dependencyAssetStableCode, candidate.dependency_asset_stable_code)
    || firstText(candidate.dependencyAssetType, candidate.dependency_asset_type)
    || readStringArray(candidate.dependencyAssetEvidenceSourceKeys ?? candidate.dependency_asset_evidence_source_keys).length > 0
    || isTruthyFlag(candidate.dependencyTimingAssetConsumed ?? candidate.dependency_timing_asset_consumed)
    || readNumber(candidate.dependencyTimingSelectedLagDays ?? candidate.dependency_timing_selected_lag_days) !== null
    || firstText(candidate.dependencyRuleSource, candidate.dependency_rule_source)
    || firstText(candidate.dependencyLayerStack, candidate.dependency_layer_stack)
    || readNumber(candidate.phaseAnchorDependencyCount ?? candidate.phase_anchor_dependency_count) !== null
    || isTruthyFlag(candidate.dependencyStartAnchor ?? candidate.dependency_start_anchor)
    || firstText(candidate.dependencyAnchorType, candidate.dependency_anchor_type)) {
    pushUniqueText(presentAssetCodes, 'dependency_sequence')
  }
  const missingAssetCodes = WIZARD_DURATION_ASSET_REVIEW_CODES.filter((code) => (
    !presentAssetCodes.includes(code) && !nonApplicableCandidateAssetCodes.includes(code)
  ))
  const clientRowId = firstText(candidate.clientRowId, candidate.client_row_id) || `candidate_row_${index + 1}`
  const presentAssetSummaries = presentAssetCodes.map((code) => (
    buildWizardDurationAssetReviewSummary(code, candidate, 'candidate_asset_used')
  ))
  const missingAssetSummaries = missingAssetCodes.map((code) => (
    buildWizardDurationAssetReviewSummary(code, null, 'missing_from_candidate_row')
  ))
  return {
    clientRowId,
    title: firstText(candidate.title) || clientRowId,
    plannedStartDate: normalizeDate(candidate.plannedStartDate ?? candidate.planned_start_date),
    plannedEndDate: normalizeDate(candidate.plannedEndDate ?? candidate.planned_end_date),
    sourceRowSortOrder: readNumber(candidate.sourceRowSortOrder ?? candidate.source_row_sort_order),
    requiredAssetCodes: [...WIZARD_DURATION_ASSET_REVIEW_CODES],
    candidateRequiredAssetCodes,
    missingCandidateRequiredAssetCodes: candidateRequiredAssetCodes
      .filter((code) => !presentAssetCodes.includes(code)),
    candidateAssetCoverageStatus: buildWizardCandidateDurationAssetCoverageStatus(
      presentAssetCodes,
      candidateRequiredAssetCodes,
    ),
    nonApplicableCandidateAssetCodes,
    t2RhythmApplicability,
    presentAssetCodes,
    presentAssetSummaries,
    missingAssetCodes,
    missingAssetSummaries,
    assetCoverageStatus: buildWizardDurationAssetCoverageStatus(presentAssetCodes, missingAssetCodes),
    qualityReviewAction: missingAssetCodes.length > 0
      ? 'inspect_optional_asset_gaps_during_offline_quality_calibration'
      : 'candidate_duration_assets_ready',
    mutationBoundary: 'candidate_duration_asset_row_review_only_no_duration_runtime_write_no_task_write',
  }
}

function buildWizardDurationAssetReviewRowFromUncoveredRow(row: Record<string, unknown>, index: number) {
  const clientRowId = firstText(row.clientRowId, row.client_row_id) || `uncovered_row_${index + 1}`
  return {
    clientRowId,
    title: firstText(row.title) || clientRowId,
    plannedStartDate: normalizeDate(row.plannedStartDate ?? row.planned_start_date),
    plannedEndDate: normalizeDate(row.plannedEndDate ?? row.planned_end_date),
    sourceRowSortOrder: readNumber(row.sourceRowSortOrder ?? row.source_row_sort_order),
    requiredAssetCodes: [...WIZARD_DURATION_ASSET_REVIEW_CODES],
    candidateRequiredAssetCodes: [...WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES],
    missingCandidateRequiredAssetCodes: [...WIZARD_CANDIDATE_REQUIRED_DURATION_ASSET_CODES],
    candidateAssetCoverageStatus: 'candidate_required_duration_asset_missing',
    nonApplicableCandidateAssetCodes: [],
    t2RhythmApplicability: 'required_repetitive_or_workface_activity',
    presentAssetCodes: [],
    presentAssetSummaries: [],
    missingAssetCodes: [...WIZARD_DURATION_ASSET_REVIEW_CODES],
    missingAssetSummaries: WIZARD_DURATION_ASSET_REVIEW_CODES.map((code) => (
      buildWizardDurationAssetReviewSummary(code, null, 'missing_from_candidate_row')
    )),
    assetCoverageStatus: 'missing_duration_asset_lineage',
    qualityReviewAction: 'supply_required_duration_assets_before_task_generation',
    mutationBoundary: 'candidate_duration_asset_row_review_only_no_duration_runtime_write_no_task_write',
  }
}

function buildCandidateDurationAssetSummaryRollupRows(rows: GeneratedTemplateRow[]) {
  return rows
    .map((row) => {
      const values = readRecord(row.values)
      const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
      const summaryRollup = readRecord(
        metadata.wizardDurationAssetSummaryRollup
          ?? metadata.wizard_duration_asset_summary_rollup
          ?? values.wizardDurationAssetSummaryRollup
          ?? values.wizard_duration_asset_summary_rollup,
      )
      if (Object.keys(summaryRollup).length === 0) return null
      return {
        clientRowId: row.clientRowId,
        title: readWizardGeneratedRowTitle(row),
        previousPlannedStartDate: normalizeDate(
          summaryRollup.previousPlannedStartDate
            ?? summaryRollup.previous_planned_start_date,
        ),
        previousPlannedEndDate: normalizeDate(
          summaryRollup.previousPlannedEndDate
            ?? summaryRollup.previous_planned_end_date,
        ),
        plannedStartDate: normalizeDate(
          summaryRollup.plannedStartDate
            ?? summaryRollup.planned_start_date
            ?? values.planned_start_date
            ?? values.start_date,
        ),
        plannedEndDate: normalizeDate(
          summaryRollup.plannedEndDate
            ?? summaryRollup.planned_end_date
            ?? values.planned_end_date
            ?? values.end_date,
        ),
        childRowCount: readNumber(summaryRollup.childRowCount ?? summaryRollup.child_row_count),
        source: firstText(summaryRollup.source) || 'wizard_duration_asset_summary_rollup',
        evidenceLevel: firstText(summaryRollup.evidenceLevel, summaryRollup.evidence_level)
          || 'candidate_duration_asset_summary_rollup_l1',
        mutationBoundary: firstText(summaryRollup.mutationBoundary, summaryRollup.mutation_boundary)
          || 'wizard_generated_summary_plan_date_write_only_no_duration_runtime_write_no_seed_write_no_production_claim',
        applicationStatus: 'duration_asset_summary_rollup_applied_to_candidate_summary_row',
        sourceRowSortOrder: row.sortOrder,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => (left.sourceRowSortOrder ?? 0) - (right.sourceRowSortOrder ?? 0))
}

function buildCandidateDurationAssetPreview(rows: GeneratedTemplateRow[], idByClientRowId?: Map<string, string>) {
  const sourceScheduleRows = rows.filter((row) => readWizardGeneratedRowProjectionMode(row) === 'schedule_row')
  const scheduleQualityRows = rows.filter(isWizardCandidateScheduleQualityRow)
  const excludedSummaryScheduleRowCount = sourceScheduleRows
    .filter(isWizardGeneratedExplicitSummaryRow)
    .length
  const excludedRecordOnlyScheduleRowCount = sourceScheduleRows
    .filter((row) => (
      !isWizardGeneratedExplicitSummaryRow(row)
      && readWizardGeneratedRowDurationContributionMode(row) === 'record_only'
    ))
    .length
  const excludedNonExecutableScheduleRowCount = Math.max(
    0,
    sourceScheduleRows.length
      - scheduleQualityRows.length
      - excludedSummaryScheduleRowCount
      - excludedRecordOnlyScheduleRowCount,
  )
  const candidates = scheduleQualityRows
    .map((row) => {
      const values = readRecord(row.values)
      const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
      const durationAssetPlanDateApplication = readRecord(
        metadata.wizardDurationAssetPlanDateApplication
          ?? metadata.wizard_duration_asset_plan_date_application
          ?? values.wizardDurationAssetPlanDateApplication
          ?? values.wizard_duration_asset_plan_date_application,
      )
      const durationAssetPlanDateApplied = Object.keys(durationAssetPlanDateApplication).length > 0
      const durationAssetPreviousPlannedStartDate = normalizeDate(
        durationAssetPlanDateApplication.previousPlannedStartDate
          ?? durationAssetPlanDateApplication.previous_planned_start_date,
      )
      const durationAssetPreviousPlannedEndDate = normalizeDate(
        durationAssetPlanDateApplication.previousPlannedEndDate
          ?? durationAssetPlanDateApplication.previous_planned_end_date,
      )
      const durationAssetPlannedStartDate = normalizeDate(
        durationAssetPlanDateApplication.plannedStartDate
          ?? durationAssetPlanDateApplication.planned_start_date,
      )
      const durationAssetPlannedEndDate = normalizeDate(
        durationAssetPlanDateApplication.plannedEndDate
          ?? durationAssetPlanDateApplication.planned_end_date,
      )
      const durationAssetSelectedDurationDays = readNumber(
        durationAssetPlanDateApplication.selectedDurationDays
          ?? durationAssetPlanDateApplication.selected_duration_days,
      )
      const durationAssetPlanDateEvidenceLevel = firstText(
        durationAssetPlanDateApplication.evidenceLevel,
        durationAssetPlanDateApplication.evidence_level,
      ) || null
      const durationAssetPlanDateMutationBoundary = firstText(
        durationAssetPlanDateApplication.mutationBoundary,
        durationAssetPlanDateApplication.mutation_boundary,
      ) || null
      const candidateNetworkPlanDateApplication = readRecord(
        metadata.wizardCandidateNetworkPlanDateApplication
          ?? metadata.wizard_candidate_network_plan_date_application
          ?? values.wizardCandidateNetworkPlanDateApplication
          ?? values.wizard_candidate_network_plan_date_application,
      )
      const candidateNetworkPlanDateApplied = Object.keys(candidateNetworkPlanDateApplication).length > 0
      const candidateNetworkPreviousPlannedStartDate = normalizeDate(
        candidateNetworkPlanDateApplication.previousPlannedStartDate
          ?? candidateNetworkPlanDateApplication.previous_planned_start_date,
      )
      const candidateNetworkPreviousPlannedEndDate = normalizeDate(
        candidateNetworkPlanDateApplication.previousPlannedEndDate
          ?? candidateNetworkPlanDateApplication.previous_planned_end_date,
      )
      const candidateNetworkPlannedStartDate = normalizeDate(
        candidateNetworkPlanDateApplication.plannedStartDate
          ?? candidateNetworkPlanDateApplication.planned_start_date,
      )
      const candidateNetworkPlannedEndDate = normalizeDate(
        candidateNetworkPlanDateApplication.plannedEndDate
          ?? candidateNetworkPlanDateApplication.planned_end_date,
      )
      const candidateNetworkStartDay = readNumber(
        candidateNetworkPlanDateApplication.startDay
          ?? candidateNetworkPlanDateApplication.start_day,
      )
      const candidateNetworkFinishDay = readNumber(
        candidateNetworkPlanDateApplication.finishDay
          ?? candidateNetworkPlanDateApplication.finish_day,
      )
      const candidateNetworkDurationDays = readNumber(
        candidateNetworkPlanDateApplication.durationDays
          ?? candidateNetworkPlanDateApplication.duration_days,
      )
      const candidateNetworkBasis = firstText(
        candidateNetworkPlanDateApplication.networkBasis,
        candidateNetworkPlanDateApplication.network_basis,
      ) || null
      const candidateNetworkPlanDateEvidenceLevel = firstText(
        candidateNetworkPlanDateApplication.evidenceLevel,
        candidateNetworkPlanDateApplication.evidence_level,
      ) || null
      const candidateNetworkPlanDateMutationBoundary = firstText(
        candidateNetworkPlanDateApplication.mutationBoundary,
        candidateNetworkPlanDateApplication.mutation_boundary,
      ) || null
      const businessTypeMasterPlan = readRecord(
        metadata.businessTypeMasterPlan
          ?? metadata.business_type_master_plan
          ?? values.businessTypeMasterPlan
          ?? values.business_type_master_plan,
      )
      const calculation = readWizardDurationAssetCalculation(row)
      const riskRange = readWizardDurationRiskRange(row)
      const calendar = readWizardConstructionCalendarEvidence(row)
      const processSeasonalDurationAssetConsumed = isTruthyFlag(
        calculation.processSeasonalDurationAssetConsumed
          ?? calculation.process_seasonal_duration_asset_consumed,
      )
      const standardWorkDurationSeedStableCode = firstText(
        calculation.standardWorkDurationSeedStableCode,
        calculation.standard_work_duration_seed_stable_code,
      ) || null
      const standardWorkDurationSeedResolverSource = firstText(
        calculation.standardWorkDurationSeedResolverSource,
        calculation.standard_work_duration_seed_resolver_source,
      ) || null
      const standardWorkDurationSeedResolverVersionId = firstText(
        calculation.standardWorkDurationSeedResolverVersionId,
        calculation.standard_work_duration_seed_resolver_version_id,
      ) || null
      const t2RhythmTemplateId = firstText(calculation.t2RhythmTemplateId, calculation.t2_rhythm_template_id) || null
      const t2RhythmTemplateResolverSource = firstText(
        calculation.t2RhythmTemplateResolverSource,
        calculation.t2_rhythm_template_resolver_source,
      ) || null
      const t2RhythmTemplateResolverVersionId = firstText(
        calculation.t2RhythmTemplateResolverVersionId,
        calculation.t2_rhythm_template_resolver_version_id,
      ) || null
      const t2RhythmApplicability = firstText(
        calculation.t2RhythmApplicability,
        calculation.t2_rhythm_applicability,
      ) || 'required_repetitive_or_workface_activity'
      const businessType = firstText(
        businessTypeMasterPlan.businessType,
        businessTypeMasterPlan.business_type,
        values.business_type,
        values.businessType,
        calculation.businessType,
        calculation.business_type,
      ) || null
      const businessTypeProfileSourceType = firstText(
        values.profile_source_type,
        values.profileSourceType,
        businessTypeMasterPlan.profileSourceType,
        businessTypeMasterPlan.profile_source_type,
      ) || null
      const businessTypeProfileTemplateId = firstText(
        businessTypeMasterPlan.profileTemplateId,
        businessTypeMasterPlan.profile_template_id,
      ) || null
      const businessTypeProfileTemplateGroup = firstText(
        businessTypeMasterPlan.profileTemplateGroup,
        businessTypeMasterPlan.profile_template_group,
      ) || null
      const businessTypeProfilePackType = firstText(
        businessTypeMasterPlan.profilePackType,
        businessTypeMasterPlan.profile_pack_type,
      ) || null
      const businessTypeProfileMutationBoundary = firstText(
        businessTypeMasterPlan.mutationBoundary,
        businessTypeMasterPlan.mutation_boundary,
      ) || null
      const normalizedBusinessTypeForT2 = businessType?.replace(/_/g, '-')
      const isBusinessTypeProfileRow = businessTypeProfileSourceType === 'business_type_master_plan_profile_v1'
      const businessTypeSpecialtyDurationAssetApplied = Boolean(
        isBusinessTypeProfileRow
          && businessType
          && standardWorkDurationSeedStableCode,
      )
      const businessTypeSpecificT2RhythmTemplateApplied = Boolean(
        isBusinessTypeProfileRow
          && businessType
          && t2RhythmTemplateId
          && (
            t2RhythmTemplateId.includes(`t2-${businessType}-`)
              || (normalizedBusinessTypeForT2 && t2RhythmTemplateId.includes(`t2-${normalizedBusinessTypeForT2}-`))
          ),
      )
      const runtimeReferenceDaysConsumed = isTruthyFlag(
        calculation.runtimeReferenceDaysConsumed
          ?? calculation.runtime_reference_days_consumed,
      )
      const runtimeReferenceDaysEvidenceLevel = firstText(
        calculation.runtimeReferenceDaysEvidenceLevel,
        calculation.runtime_reference_days_evidence_level,
      ) || null
      const runtimeReferenceDaysStableCode = firstText(
        calculation.runtimeReferenceDaysStableCode,
        calculation.runtime_reference_days_stable_code,
      ) || null
      const runtimeReferenceDaysP50Days = readNumber(
        calculation.runtimeReferenceDaysP50Days
          ?? calculation.runtime_reference_days_p50_days,
      )
      const runtimeReferenceDaysP80Days = readNumber(
        calculation.runtimeReferenceDaysP80Days
          ?? calculation.runtime_reference_days_p80_days,
      )
      const runtimeReferenceDaysSampleCount = readNumber(
        calculation.runtimeReferenceDaysSampleCount
          ?? calculation.runtime_reference_days_sample_count,
      )
      const runtimeReferenceDaysDurationRiskDistribution = normalizeDurationRiskDistributionDto(
        calculation.runtimeReferenceDaysDurationRiskDistribution
          ?? calculation.runtime_reference_days_duration_risk_distribution,
      )
      const runtimeReferenceDaysMutationBoundary = firstText(
        calculation.runtimeReferenceDaysMutationBoundary,
        calculation.runtime_reference_days_mutation_boundary,
      ) || null
      const dependencyAssetConsumed = isTruthyFlag(
        calculation.dependencyAssetConsumed
          ?? calculation.dependency_asset_consumed,
      )
      const dependencyAssetType = firstText(
        calculation.dependencyAssetType,
        calculation.dependency_asset_type,
      ) || null
      const dependencyAssetStableCode = firstText(
        calculation.dependencyAssetStableCode,
        calculation.dependency_asset_stable_code,
      ) || null
      const dependencyAssetAutoApplyPolicy = firstText(
        calculation.dependencyAssetAutoApplyPolicy,
        calculation.dependency_asset_auto_apply_policy,
      ) || null
      const dependencyAssetStrength = firstText(
        calculation.dependencyAssetStrength,
        calculation.dependency_asset_strength,
      ) || null
      const dependencyAssetHandoffCategory = firstText(
        calculation.dependencyAssetHandoffCategory,
        calculation.dependency_asset_handoff_category,
      ) || null
      const dependencyAssetDependencyType = firstText(
        calculation.dependencyAssetDependencyType,
        calculation.dependency_asset_dependency_type,
      ) || null
      const dependencyAssetLagDays = readNumber(
        calculation.dependencyAssetLagDays
          ?? calculation.dependency_asset_lag_days,
      )
      const dependencyAssetEvidenceSourceKeys = readStringArray(
        calculation.dependencyAssetEvidenceSourceKeys
          ?? calculation.dependency_asset_evidence_source_keys,
      )
      const dependencyEvidence = readRecord(calculation.dependencyEvidence ?? calculation.dependency_evidence)
      const dependencyTimingAsset = readRecord(
        calculation.dependencyTimingAsset ?? calculation.dependency_timing_asset,
      )
      const dependencyTimingAssetConsumed = isTruthyFlag(
        calculation.dependencyTimingAssetConsumed
          ?? calculation.dependency_timing_asset_consumed
          ?? dependencyTimingAsset.consumed,
      )
      const dependencyTimingSelectedLagDays = readNumber(
        calculation.dependencyTimingSelectedLagDays
          ?? calculation.dependency_timing_selected_lag_days
          ?? dependencyTimingAsset.selectedLagDays
          ?? dependencyTimingAsset.selected_lag_days,
      )
      const dependencyRuleSource = firstText(
        calculation.dependencyRuleSource,
        calculation.dependency_rule_source,
        dependencyEvidence.ruleSource,
        dependencyEvidence.rule_source,
      ) || null
      const dependencyLayerStack = firstText(
        calculation.dependencyLayerStack,
        calculation.dependency_layer_stack,
        dependencyEvidence.layerStack,
        dependencyEvidence.layer_stack,
      ) || null
      const dependencyProductionWritePolicy = firstText(
        calculation.dependencyProductionWritePolicy,
        calculation.dependency_production_write_policy,
        dependencyEvidence.productionWritePolicy,
        dependencyEvidence.production_write_policy,
      ) || null
      const phaseAnchorDependencyCount = readNumber(
        calculation.phaseAnchorDependencyCount
          ?? calculation.phase_anchor_dependency_count
          ?? dependencyEvidence.phaseAnchorDependencyCount
          ?? dependencyEvidence.phase_anchor_dependency_count,
      )
      const dependencyStartAnchor = isTruthyFlag(
        calculation.dependencyStartAnchor
          ?? calculation.dependency_start_anchor
          ?? dependencyEvidence.startAnchor
          ?? dependencyEvidence.start_anchor,
      )
      const dependencyAnchorType = firstText(
        calculation.dependencyAnchorType,
        calculation.dependency_anchor_type,
        dependencyEvidence.anchorType,
        dependencyEvidence.anchor_type,
      ) || null
      const durationSelection = readRecord(
        calculation.durationSelection
          ?? calculation.duration_selection
          ?? values.durationSelection
          ?? values.duration_selection
          ?? metadata.durationSelection
          ?? metadata.duration_selection,
      )
      const durationSelectionBasisEvidence = readWizardDurationSelectionBasisEvidenceFromSources(
        calculation,
        durationSelection,
        values,
        metadata,
      )
      const criticalPathEvidence = readWizardCriticalPathEvidenceFromSources(
        calculation.criticalPathEvidence,
        calculation.critical_path_evidence,
        durationSelection.criticalPathEvidence,
        durationSelection.critical_path_evidence,
        values.criticalPathEvidence,
        values.critical_path_evidence,
        metadata.criticalPathEvidence,
        metadata.critical_path_evidence,
        calculation,
      )
      const quantityOrProductivity = readRecord(
        calculation.quantityOrProductivity
          ?? calculation.quantity_or_productivity
          ?? calculation.quantityProxy
          ?? calculation.quantity_proxy,
      )
      const projectScaleQuantityProxySource = firstText(
        calculation.projectScaleQuantityProxySource,
        calculation.project_scale_quantity_proxy_source,
        calculation.quantityOrProductivitySource,
        calculation.quantity_or_productivity_source,
        quantityOrProductivity.source,
      ) || null
      const projectScaleQuantityProxyValue = readNumber(
        calculation.projectScaleQuantityProxyValue
          ?? calculation.project_scale_quantity_proxy_value
          ?? calculation.quantityOrProductivityValue
          ?? calculation.quantity_or_productivity_value
          ?? quantityOrProductivity.value,
      )
      const projectScaleQuantityProxyUnit = firstText(
        calculation.projectScaleQuantityProxyUnit,
        calculation.project_scale_quantity_proxy_unit,
        calculation.quantityOrProductivityUnit,
        calculation.quantity_or_productivity_unit,
        quantityOrProductivity.unit,
      ) || null
      const projectScaleQuantityProxyBasis = firstText(
        calculation.projectScaleQuantityProxyBasis,
        calculation.project_scale_quantity_proxy_basis,
        calculation.quantityOrProductivityBasis,
        calculation.quantity_or_productivity_basis,
        quantityOrProductivity.basis,
      ) || null
      const productivityDerivedDurationDays = readNumber(
        calculation.productivityDerivedDurationDays
          ?? calculation.productivity_derived_duration_days
          ?? quantityOrProductivity.productivityDerivedDurationDays
          ?? quantityOrProductivity.productivity_derived_duration_days,
      )
      const projectScaleQuantityProxyApplied = Boolean(
        isTruthyFlag(
          calculation.projectScaleQuantityProxyApplied
            ?? calculation.project_scale_quantity_proxy_applied
            ?? calculation.projectScaleQuantityProxyConsumed
            ?? calculation.project_scale_quantity_proxy_consumed,
        )
          || projectScaleQuantityProxySource
          || projectScaleQuantityProxyValue !== null
          || projectScaleQuantityProxyUnit
          || projectScaleQuantityProxyBasis
          || productivityDerivedDurationDays !== null,
      )
      const hasStandardWorkDurationSeedReference = Boolean(standardWorkDurationSeedStableCode)
      const hasT2RhythmTemplateReference = Boolean(t2RhythmTemplateId)
      const hasRuntimeReferenceDaysEvidence = Boolean(
        runtimeReferenceDaysStableCode
          && runtimeReferenceDaysEvidenceLevel
          && (runtimeReferenceDaysSampleCount ?? 0) > 0,
      )
      const hasLineageEvidence = Boolean(
        hasStandardWorkDurationSeedReference
          || hasT2RhythmTemplateReference
          || hasRuntimeReferenceDaysEvidence,
      )
      const hasDependencyEvidence = Boolean(
        dependencyAssetConsumed
          || dependencyAssetStableCode
          || dependencyAssetType
          || dependencyAssetEvidenceSourceKeys.length > 0
          || dependencyTimingAssetConsumed
          || dependencyTimingSelectedLagDays !== null
          || dependencyRuleSource
          || dependencyLayerStack
          || dependencyProductionWritePolicy
          || phaseAnchorDependencyCount !== null
          || dependencyStartAnchor
          || dependencyAnchorType,
      )
      const hasEvidence = Boolean(
        riskRange
          || calendar.consumed
          || processSeasonalDurationAssetConsumed
          || hasLineageEvidence
          || hasDependencyEvidence
          || criticalPathEvidence.hasEvidence
          || durationSelectionBasisEvidence.hasEvidence
          || projectScaleQuantityProxyApplied
          || durationAssetPlanDateApplied
          || candidateNetworkPlanDateApplied,
      )
      if (!hasEvidence) return null
      const createdTaskId = idByClientRowId?.get(row.clientRowId) ?? null
      return {
        clientRowId: row.clientRowId,
        createdTaskId,
        title: readWizardGeneratedRowTitle(row),
        plannedStartDate: normalizeDate(values.planned_start_date ?? values.start_date),
        plannedEndDate: normalizeDate(values.planned_end_date ?? values.end_date),
        riskP20DurationDays: riskRange?.p20 ?? null,
        riskP50DurationDays: riskRange?.p50 ?? null,
        riskP80DurationDays: riskRange?.p80 ?? null,
        durationRiskDistribution: riskRange?.durationRiskDistribution ?? null,
        calendarBasis: calendar.calendarBasis,
        constructionCalendarWindowCount: calendar.constructionCalendarWindowCount,
        processSeasonalDurationAssetConsumed,
        processSeasonalClimateSignal: firstText(calculation.processSeasonalClimateSignal, calculation.process_seasonal_climate_signal) || null,
        processSeasonalImpactBand: firstText(calculation.processSeasonalImpactBand, calculation.process_seasonal_impact_band) || null,
        processSeasonalMultiplier: readNumber(calculation.processSeasonalMultiplier ?? calculation.process_seasonal_multiplier),
        selectedDurationDays: readNumber(calculation.selectedDurationDays ?? calculation.selected_duration_days),
        baseSelectedDurationDays: readNumber(calculation.baseSelectedDurationDays ?? calculation.base_selected_duration_days),
        standardWorkDurationSeedStableCode,
        standardWorkDurationSeedResolverSource,
        standardWorkDurationSeedResolverVersionId,
        t2RhythmTemplateId,
        t2RhythmTemplateResolverSource,
        t2RhythmTemplateResolverVersionId,
        t2RhythmApplicability,
        runtimeReferenceDaysConsumed,
        runtimeReferenceDaysEvidenceLevel,
        runtimeReferenceDaysStableCode,
        runtimeReferenceDaysP50Days,
        runtimeReferenceDaysP80Days,
        runtimeReferenceDaysSampleCount,
        runtimeReferenceDaysDurationRiskDistribution,
        runtimeReferenceDaysMutationBoundary,
        dependencyAssetConsumed,
        dependencyAssetType,
        dependencyAssetStableCode,
        dependencyAssetAutoApplyPolicy,
        dependencyAssetStrength,
        dependencyAssetHandoffCategory,
        dependencyAssetDependencyType,
        dependencyAssetLagDays,
        dependencyAssetEvidenceSourceKeys,
        dependencyTimingAssetConsumed,
        dependencyTimingSelectedLagDays,
        dependencyRuleSource,
        dependencyLayerStack,
        dependencyProductionWritePolicy,
        phaseAnchorDependencyCount,
        dependencyStartAnchor,
        dependencyAnchorType,
        criticalPathCandidate: criticalPathEvidence.criticalPathCandidate,
        totalFloatDays: criticalPathEvidence.totalFloatDays,
        earlyStartOffsetDays: criticalPathEvidence.earlyStartOffsetDays,
        earlyFinishOffsetDays: criticalPathEvidence.earlyFinishOffsetDays,
        lateStartOffsetDays: criticalPathEvidence.lateStartOffsetDays,
        lateFinishOffsetDays: criticalPathEvidence.lateFinishOffsetDays,
        durationSelectionRule: durationSelectionBasisEvidence.durationSelectionRule,
        durationCalibrationSource: durationSelectionBasisEvidence.durationCalibrationSource,
        durationMaturity: durationSelectionBasisEvidence.durationMaturity,
        durationReviewGate: durationSelectionBasisEvidence.durationReviewGate,
        durationTruthSource: durationSelectionBasisEvidence.durationTruthSource,
        standardWorkDurationSeedP50Days: durationSelectionBasisEvidence.standardWorkDurationSeedP50Days,
        t2RhythmTemplateP50Days: durationSelectionBasisEvidence.t2RhythmTemplateP50Days,
        realPlanSkeletonDurationDays: durationSelectionBasisEvidence.realPlanSkeletonDurationDays,
        realPlanSkeletonFloorApplied: durationSelectionBasisEvidence.realPlanSkeletonFloorApplied,
        maxNonSkeletonAssetDays: durationSelectionBasisEvidence.maxNonSkeletonAssetDays,
        projectScaleQuantityProxyApplied,
        projectScaleQuantityProxySource,
        projectScaleQuantityProxyValue,
        projectScaleQuantityProxyUnit,
        projectScaleQuantityProxyBasis,
        productivityDerivedDurationDays,
        durationAssetPlanDateApplied,
        durationAssetPreviousPlannedStartDate,
        durationAssetPreviousPlannedEndDate,
        durationAssetPlannedStartDate,
        durationAssetPlannedEndDate,
        durationAssetSelectedDurationDays,
        durationAssetPlanDateEvidenceLevel,
        durationAssetPlanDateMutationBoundary,
        candidateNetworkPlanDateApplied,
        candidateNetworkPreviousPlannedStartDate,
        candidateNetworkPreviousPlannedEndDate,
        candidateNetworkPlannedStartDate,
        candidateNetworkPlannedEndDate,
        candidateNetworkStartDay,
        candidateNetworkFinishDay,
        candidateNetworkDurationDays,
        candidateNetworkBasis,
        candidateNetworkPlanDateEvidenceLevel,
        candidateNetworkPlanDateMutationBoundary,
        businessType,
        businessTypeProfileSourceType,
        businessTypeProfileTemplateId,
        businessTypeProfileTemplateGroup,
        businessTypeProfilePackType,
        businessTypeProfileMutationBoundary,
        businessTypeSpecialtyDurationAssetApplied,
        businessTypeSpecificT2RhythmTemplateApplied,
        sourceRowSortOrder: row.sortOrder,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => (left.sourceRowSortOrder ?? 0) - (right.sourceRowSortOrder ?? 0))

  const coveredClientRowIds = new Set(candidates.map((candidate) => candidate.clientRowId))
  const uncoveredScheduleRows = scheduleQualityRows
    .filter((row) => !coveredClientRowIds.has(row.clientRowId))
    .map(buildCandidateDurationAssetUncoveredScheduleRow)
    .sort((left, right) => (left.sourceRowSortOrder ?? 0) - (right.sourceRowSortOrder ?? 0))
  const durationAssetReviewRows = [
    ...candidates.map((candidate, index) => buildWizardDurationAssetReviewRowFromCandidate(candidate, index)),
    ...uncoveredScheduleRows.map((row, index) => buildWizardDurationAssetReviewRowFromUncoveredRow(row, index)),
  ].sort((left, right) => (left.sourceRowSortOrder ?? 0) - (right.sourceRowSortOrder ?? 0))
  const summaryRollupRows = buildCandidateDurationAssetSummaryRollupRows(rows)

  if (candidates.length === 0 && uncoveredScheduleRows.length === 0 && summaryRollupRows.length === 0) return null
  const candidateSummary = summarizeWizardDurationAssetCandidates(candidates)

  return {
    source: 'generated_wbs_rows_candidate_duration_asset_preview',
    evidenceLevel: 'candidate_duration_asset_preview_l1',
    mutationBoundary: 'preview_only_no_duration_runtime_write_no_task_write',
    planQualityReviewMode: 'offline_development_calibration',
    runtimeApprovalRequired: false,
    blocksWizardCommit: false,
    blocksBaselinePublication: false,
    sourceScheduleRowCount: sourceScheduleRows.length,
    requiredDurationAssetRowCount: scheduleQualityRows.length,
    excludedScheduleRowCount: Math.max(0, sourceScheduleRows.length - scheduleQualityRows.length),
    excludedSummaryScheduleRowCount,
    excludedRecordOnlyScheduleRowCount,
    excludedNonExecutableScheduleRowCount,
    totalCount: candidates.length,
    uncoveredScheduleRowCount: uncoveredScheduleRows.length,
    uncoveredScheduleRows,
    durationAssetReviewRowCount: durationAssetReviewRows.length,
    durationAssetReviewRows,
    summaryRollupRowCount: summaryRollupRows.length,
    summaryRollupRows,
    ...candidateSummary,
    writesDurationRuntime: false,
    writesTasks: false,
    items: candidates,
  }
}

function readEvidenceCountValue(evidence: unknown, ...keys: string[]) {
  const record = readRecord(evidence)
  for (const key of keys) {
    const value = readNumber(record[key])
    if (value !== null) return value
  }
  return 0
}

function readEvidenceItems(evidence: unknown, key = 'items') {
  const value = readRecord(evidence)[key]
  if (!Array.isArray(value)) return []
  return value
    .map(readRecord)
    .filter((item) => Object.keys(item).length > 0)
}

function pushUniqueText(target: string[], value: string) {
  if (!target.includes(value)) target.push(value)
}

function countWizardCriticalGeneratedRows(candidateNetworkEvaluation: unknown) {
  return readStringArray(readRecord(candidateNetworkEvaluation).criticalGeneratedRowIds).length
}

function calculateInclusiveCalendarSpanDays(startDate: unknown, endDate: unknown) {
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  if (!start || !end) return null
  return orderedInclusiveDurationDays(start, end)
}

function buildWizardDurationAssetApplicationStatus(selectedDurationDays: number | null, baseSelectedDurationDays: number | null) {
  if (selectedDurationDays !== null && selectedDurationDays <= 0) {
    return 'duration_asset_application_invalid_candidate_duration'
  }
  if (selectedDurationDays !== null && baseSelectedDurationDays !== null && selectedDurationDays !== baseSelectedDurationDays) {
    return 'duration_asset_adjusted_candidate_duration'
  }
  if (selectedDurationDays !== null) return 'duration_asset_applied_candidate_duration'
  return 'duration_asset_application_missing'
}

function isWizardCandidateDurationApplicationReady(durationApplicationStatus: string) {
  return durationApplicationStatus === 'duration_asset_adjusted_candidate_duration'
    || durationApplicationStatus === 'duration_asset_applied_candidate_duration'
}

function buildWizardCandidateDurationWindowStatus(applicationRow?: Record<string, unknown>) {
  if (!applicationRow) return 'candidate_duration_window_missing'
  const plannedStartDate = normalizeDate(applicationRow.plannedStartDate ?? applicationRow.planned_start_date)
  const plannedEndDate = normalizeDate(applicationRow.plannedEndDate ?? applicationRow.planned_end_date)
  const plannedCalendarSpanDays = readNumber(
    applicationRow.plannedCalendarSpanDays ?? applicationRow.planned_calendar_span_days,
  )
  if (!plannedStartDate || !plannedEndDate) return 'candidate_duration_window_dates_missing'
  if (plannedCalendarSpanDays === null || plannedCalendarSpanDays <= 0) {
    return 'candidate_duration_window_invalid'
  }
  return 'candidate_duration_window_ready'
}

function buildWizardDurationRiskRangeStatus(
  p20: number | null,
  p50: number | null,
  p80: number | null,
  selectedDurationDays?: number | null,
) {
  if (p20 === null && p50 === null && p80 === null) return 'duration_risk_range_missing'
  if (p20 === null || p50 === null || p80 === null) return 'duration_risk_range_incomplete'
  if (p20 <= 0 || p50 <= 0 || p80 <= 0) return 'duration_risk_range_invalid'
  if (p20 > p50 || p50 > p80) return 'duration_risk_range_invalid'
  if (
    selectedDurationDays !== null
    && selectedDurationDays !== undefined
    && selectedDurationDays > 0
    && (selectedDurationDays < p20 || selectedDurationDays > p80)
  ) {
    return 'duration_risk_range_selected_duration_outside_range'
  }
  return 'duration_risk_range_ready'
}

function buildWizardProcessSeasonalAdjustmentStatus(appliedAssetCodes: string[], multiplier: number | null) {
  if (!appliedAssetCodes.includes('process_seasonal_adjustment')) return 'process_seasonal_adjustment_missing'
  if (multiplier === null) return 'process_seasonal_adjustment_incomplete'
  if (multiplier <= 0) return 'process_seasonal_adjustment_invalid'
  return 'process_seasonal_adjustment_ready'
}

function isWizardCandidateProcessSeasonalAdjustmentReady(status: string) {
  return status === 'process_seasonal_adjustment_ready'
    || status === 'process_seasonal_adjustment_missing'
}

function getWizardGeneratedRowOnboardingStageClassification(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return normalizeId(
    values.onboarding_stage_classification
      ?? values.onboardingStageClassification
      ?? metadata.onboardingStageClassification
      ?? metadata.onboarding_stage_classification,
  )
}

function isWizardStartingLineCandidateQualityGateRow(row: GeneratedTemplateRow) {
  if (!isWizardGeneratedExecutableRow(row)) return false
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  if (isTruthyFlag(values.is_historical ?? values.isHistorical ?? metadata.isHistorical ?? metadata.is_historical)) {
    return false
  }

  const classification = getWizardGeneratedRowOnboardingStageClassification(row)
  if (['history', 'historical', 'in_progress', 'inprogress', 'current'].includes(classification)) return false
  if (['future', 'planned', 'todo', 'candidate', 'candidate_future'].includes(classification)) return true

  const status = normalizeId(values.status ?? values.task_status ?? metadata.status ?? metadata.taskStatus)
  return ['todo', 'planned', 'not_started', 'notstarted', 'pending'].includes(status)
}

function selectWizardCandidatePlanQualityGateRows(
  payload: z.infer<typeof wizardPayloadSchema>,
  generatedRows: GeneratedTemplateRow[],
) {
  if (payload.mode !== 'starting_line') return generatedRows
  return generatedRows.filter(isWizardStartingLineCandidateQualityGateRow)
}

function assertExecutableDefaultMasterPlanAssemblyBeforeTaskWrite(params: {
  defaultPlanOutput: unknown
  assembly: unknown
  generatedRows: GeneratedTemplateRow[]
}) {
  const assembly = readRecord(params.assembly)
  const isMasterPlan = normalizeText(params.defaultPlanOutput) === 'master_plan'
    || Object.keys(assembly).length > 0
  if (!isMasterPlan) return

  const scheduleRows = params.generatedRows.filter((row) => {
    const values = readRecord(row.values)
    const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
    return normalizeText(row.rowProjectionMode ?? values.row_projection_mode ?? metadata.rowProjectionMode) === 'schedule_row'
  })
  const scheduleRowCount = scheduleRows.length
  const scheduleStartDates = scheduleRows
    .map((row) => normalizeDate(readRecord(row.values).planned_start_date ?? readRecord(row.values).start_date))
    .filter((value): value is string => Boolean(value))
    .sort()
  const scheduleEndDates = scheduleRows
    .map((row) => normalizeDate(readRecord(row.values).planned_end_date ?? readRecord(row.values).end_date))
    .filter((value): value is string => Boolean(value))
    .sort()
  const scheduleSpanDays = calculateInclusiveCalendarSpanDays(
    scheduleStartDates[0],
    scheduleEndDates.at(-1),
  )
  const primaryNetwork = analyzeExecutableDefaultMasterPlanNetwork(scheduleRows)
  const schedulePropagationNetwork = analyzeExecutableDefaultMasterPlanSchedulePropagation(scheduleRows)
  const computedMethodConflictCount = countExecutableDefaultMasterPlanMethodConflicts(scheduleRows)
  const computedDurationSemanticMismatchCount = scheduleRows.filter((row) => {
    const values = readRecord(row.values)
    const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
    const durationContributionMode = normalizeText(
      values.duration_contribution_mode ?? metadata.durationContributionMode,
    )
    return durationContributionMode === 'duration_bearing'
      && !isExecutableDurationAssetSemanticallyCompatible(row)
  }).length
  const missingExecutionPhases = readArray(assembly.missingExecutionPhases).map(normalizeText).filter(Boolean)
  const reasons = [
    Object.keys(assembly).length === 0 ? 'assembly_summary_missing' : '',
    normalizeText(assembly.status) !== 'executable_default_master_plan_ready' ? 'assembly_status_not_ready' : '',
    assembly.readyForWizardCommit !== true ? 'wizard_commit_readiness_not_confirmed' : '',
    normalizeText(assembly.assetAuthority) !== 'system_standard_seed' ? 'system_standard_asset_authority_missing' : '',
    readNumber(assembly.scheduleRowCount) !== scheduleRowCount ? 'schedule_row_count_mismatch' : '',
    (readNumber(assembly.invalidDurationRowCount) ?? 0) > 0 ? 'invalid_duration_rows_present' : '',
    (readNumber(assembly.visibleDependencyCoverageRate) ?? 0) < 0.9 ? 'visible_dependency_coverage_below_90_percent' : '',
    missingExecutionPhases.length > 0 ? 'execution_phase_coverage_incomplete' : '',
    (readNumber(assembly.methodConflictCount) ?? computedMethodConflictCount) > 0
      || computedMethodConflictCount > 0
      ? 'mutually_exclusive_method_conflict'
      : '',
    (readNumber(assembly.durationAssetSemanticMismatchCount) ?? computedDurationSemanticMismatchCount) > 0
      || computedDurationSemanticMismatchCount > 0
      ? 'duration_asset_semantic_mismatch'
      : '',
    (readNumber(assembly.dependencyCycleRowCount) ?? primaryNetwork.cycleRowIds.length) > 0
      || !primaryNetwork.acyclic
      ? 'dependency_cycle_detected'
      : '',
    primaryNetwork.componentCount !== 1 ? 'primary_schedule_network_disconnected' : '',
    primaryNetwork.rootIds.length !== 1 ? 'primary_schedule_root_not_unique' : '',
    primaryNetwork.sinkIds.length !== 1 ? 'primary_schedule_terminal_not_unique' : '',
    (readNumber(assembly.schedulePropagationCycleRowCount) ?? schedulePropagationNetwork.cycleRowIds.length) > 0
      || !schedulePropagationNetwork.acyclic
      ? 'schedule_propagation_cycle_detected'
      : '',
    !scheduleSpanDays || scheduleSpanDays > 3650 ? 'schedule_span_exceeds_10_year_safety_cap' : '',
  ].filter(Boolean)
  if (reasons.length === 0) return

  throw Object.assign(new Error('Executable default master plan assembly blocked wizard task generation.'), {
    statusCode: 422,
    code: 'WIZARD_EXECUTABLE_DEFAULT_MASTER_PLAN_BLOCKED',
    details: {
      source: 'wizard_executable_default_master_plan_pre_write_gate',
      status: normalizeText(assembly.status) || 'executable_default_master_plan_blocked',
      readyForWizardCommit: assembly.readyForWizardCommit === true,
      businessType: normalizeText(assembly.businessType) || null,
      assetAuthority: normalizeText(assembly.assetAuthority) || null,
      calibrationPolicy: normalizeText(assembly.calibrationPolicy) || null,
      scheduleRowCount: readNumber(assembly.scheduleRowCount) ?? scheduleRowCount,
      actualScheduleRowCount: scheduleRowCount,
      minimumScheduleRowCount: readNumber(assembly.minimumScheduleRowCount),
      maximumScheduleRowCount: readNumber(assembly.maximumScheduleRowCount),
      invalidDurationRowCount: readNumber(assembly.invalidDurationRowCount) ?? 0,
      visibleDependencyCoverageRate: readNumber(assembly.visibleDependencyCoverageRate) ?? 0,
      missingExecutionPhases,
      methodConflictCount: readNumber(assembly.methodConflictCount) ?? computedMethodConflictCount,
      computedMethodConflictCount,
      durationAssetSemanticMismatchCount: readNumber(assembly.durationAssetSemanticMismatchCount)
        ?? computedDurationSemanticMismatchCount,
      computedDurationSemanticMismatchCount,
      dependencyCycleRowCount: readNumber(assembly.dependencyCycleRowCount) ?? primaryNetwork.cycleRowIds.length,
      computedDependencyCycleRowCount: primaryNetwork.cycleRowIds.length,
      schedulePropagationCycleRowCount: readNumber(assembly.schedulePropagationCycleRowCount)
        ?? schedulePropagationNetwork.cycleRowIds.length,
      computedSchedulePropagationCycleRowCount: schedulePropagationNetwork.cycleRowIds.length,
      networkComponentCount: primaryNetwork.componentCount,
      networkRootCount: primaryNetwork.rootIds.length,
      networkSinkCount: primaryNetwork.sinkIds.length,
      scheduleSpanDays,
      scheduleSpanSafetyCapDays: 3650,
      reasons,
      commitPolicy: normalizeText(assembly.commitPolicy) || null,
      mutationBoundary: 'assembly_gate_only_no_task_write',
    },
  })
}

function assertWizardDurationAssetQualityBeforeTaskWrite(params: {
  payload: z.infer<typeof wizardPayloadSchema>
  generatedRows: GeneratedTemplateRow[]
}) {
  const qualityGateRows = selectWizardCandidatePlanQualityGateRows(params.payload, params.generatedRows)
  if (qualityGateRows.length === 0) return

  const candidateDurationAssetPreview = buildCandidateDurationAssetPreview(qualityGateRows)
  const preview = readRecord(candidateDurationAssetPreview)
  const candidateItemsByRowId = new Map(
    readEvidenceItems(preview)
      .map((item) => [firstText(item.clientRowId, item.client_row_id), item] as const)
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])),
  )
  const blockingRows = readEvidenceItems(preview, 'durationAssetReviewRows')
    .map((reviewRow) => {
      const clientRowId = firstText(reviewRow.clientRowId, reviewRow.client_row_id)
      const item = candidateItemsByRowId.get(clientRowId) ?? {}
      const selectedDurationDays = readNumber(item.selectedDurationDays ?? item.selected_duration_days)
      const baseSelectedDurationDays = readNumber(
        item.baseSelectedDurationDays ?? item.base_selected_duration_days,
      )
      const plannedStartDate = normalizeDate(
        item.plannedStartDate ?? item.planned_start_date ?? reviewRow.plannedStartDate ?? reviewRow.planned_start_date,
      )
      const plannedEndDate = normalizeDate(
        item.plannedEndDate ?? item.planned_end_date ?? reviewRow.plannedEndDate ?? reviewRow.planned_end_date,
      )
      const durationApplicationStatus = buildWizardDurationAssetApplicationStatus(
        selectedDurationDays,
        baseSelectedDurationDays,
      )
      const candidateDurationWindowStatus = buildWizardCandidateDurationWindowStatus({
        plannedStartDate,
        plannedEndDate,
        plannedCalendarSpanDays: calculateInclusiveCalendarSpanDays(plannedStartDate, plannedEndDate),
      })
      const durationRiskRangeStatus = buildWizardDurationRiskRangeStatus(
        readNumber(item.riskP20DurationDays ?? item.risk_p20_duration_days),
        readNumber(item.riskP50DurationDays ?? item.risk_p50_duration_days),
        readNumber(item.riskP80DurationDays ?? item.risk_p80_duration_days),
        selectedDurationDays,
      )
      const processSeasonalAdjustmentStatus = buildWizardProcessSeasonalAdjustmentStatus(
        readStringArray(reviewRow.presentAssetCodes ?? reviewRow.present_asset_codes),
        readNumber(item.processSeasonalMultiplier ?? item.process_seasonal_multiplier),
      )
      const missingQualityInputCodes = [
        ...readStringArray(
          reviewRow.missingCandidateRequiredAssetCodes
            ?? reviewRow.missing_candidate_required_asset_codes,
        ),
      ]
      if (!isWizardCandidateDurationApplicationReady(durationApplicationStatus)
        || candidateDurationWindowStatus !== 'candidate_duration_window_ready') {
        pushUniqueText(missingQualityInputCodes, 'candidate_duration_application')
      }
      if (durationRiskRangeStatus !== 'duration_risk_range_ready') {
        pushUniqueText(missingQualityInputCodes, 'duration_risk_range')
      }
      if (!isWizardCandidateProcessSeasonalAdjustmentReady(processSeasonalAdjustmentStatus)) {
        pushUniqueText(missingQualityInputCodes, 'process_seasonal_adjustment')
      }
      if (missingQualityInputCodes.length === 0) return null

      return {
        clientRowId,
        title: firstText(reviewRow.title),
        validationScope: 'generated_plan_row',
        scheduleStructureBlocking: true,
        runtimeApprovalRequired: false,
        missingQualityInputCodes,
        durationApplicationStatus,
        candidateDurationWindowStatus,
        durationRiskRangeStatus,
        processSeasonalAdjustmentStatus,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
  if (blockingRows.length === 0) return

  throw Object.assign(new Error('Wizard duration asset quality validation blocked task generation.'), {
    statusCode: 422,
    code: 'WIZARD_DURATION_ASSET_QUALITY_BLOCKED',
    details: {
      source: 'wizard_generation_duration_asset_quality_pre_write_validation',
      status: 'blocked_by_invalid_duration_asset_inputs',
      runtimeApprovalRequired: false,
      blockingRowCount: blockingRows.length,
      blockingRows,
      mutationBoundary: 'plan_structure_validation_only_no_task_write',
    },
  })
}

function assertWizardDatedAcceptanceMilestoneBeforeTaskWrite(params: {
  rows: GeneratedTemplateRow[]
  plannedEndDate?: unknown
  terminalEvent?: unknown
}) {
  const candidateAcceptancePlanPreview = buildCandidateAcceptancePlanPreview(params.rows, {
    plannedEndDate: params.plannedEndDate,
    terminalEvent: params.terminalEvent,
  })
  const datedAcceptanceMilestoneCount = readEvidenceCountValue(candidateAcceptancePlanPreview, 'datedCount')
  if (datedAcceptanceMilestoneCount > 0) return

  throw Object.assign(new Error('Wizard plan requires a dated completion acceptance milestone before task generation.'), {
    statusCode: 422,
    code: 'WIZARD_DATED_ACCEPTANCE_MILESTONE_REQUIRED',
    details: {
      source: 'wizard_generation_acceptance_milestone_pre_write_validation',
      code: 'dated_acceptance_milestone_missing',
      requiredPlanInput: 'dated_completion_acceptance_milestone',
      scheduleStructureBlocking: true,
      datedAcceptanceMilestoneCount,
      candidateAcceptancePlanPreview,
      mutationBoundary: 'plan_structure_validation_only_no_task_write_no_acceptance_plan_write',
    },
  })
}

function buildWizardPlanQualityDiagnostics(params: {
  targetFeasibility: unknown
  durationAssetUtilizationSummary: unknown
  candidateDurationAssetPreview: unknown
  candidateNetworkEvaluation: unknown
  candidateAcceptancePlanPreview: unknown
  commercialFactReadiness?: unknown
}) {
  const durationSummary = readRecord(params.durationAssetUtilizationSummary)
  const durationPreview = readRecord(params.candidateDurationAssetPreview)
  const network = readRecord(params.candidateNetworkEvaluation)
  const acceptancePlan = readRecord(params.candidateAcceptancePlanPreview)
  const feasibility = readRecord(params.targetFeasibility)
  const commercialFactReadiness = readRecord(params.commercialFactReadiness)
  const requiredDurationAssetRowCount = readEvidenceCountValue(durationPreview, 'requiredDurationAssetRowCount')
  const scheduleRowCount = requiredDurationAssetRowCount > 0
    ? requiredDurationAssetRowCount
    : readEvidenceCountValue(durationSummary, 'scheduleRowCount')
  const durationAssetCoveredRowCount = readEvidenceCountValue(durationPreview, 'totalCount')
  const durationAssetReviewRowCount = readEvidenceCountValue(durationPreview, 'durationAssetReviewRowCount')
  const uncoveredDurationAssetRowCount = readEvidenceCountValue(durationPreview, 'uncoveredScheduleRowCount')
  const rowsMissingRuntimeReferenceDaysCount = readEvidenceCountValue(
    durationSummary,
    'rowsMissingRuntimeReferenceDaysCount',
  )
  const projectedNetworkSpanDays = readEvidenceCountValue(network, 'projectedNetworkSpanDays')
  const previewDependencyCount = readEvidenceCountValue(network, 'previewEdgeCount')
  const unresolvedDependencyCount = readEvidenceCountValue(network, 'unresolvedEdgeCount')
  const datedAcceptanceMilestoneCount = readEvidenceCountValue(acceptancePlan, 'datedCount', 'totalCount')
  const acceptanceMilestoneCount = readEvidenceCountValue(acceptancePlan, 'totalCount')
  const materializedAcceptanceMilestoneCount = readEvidenceCountValue(acceptancePlan, 'materializedCount')
  const targetEndDate = normalizeDate(feasibility.targetEndDate ?? feasibility.target_end_date)
  const naturalEndDate = normalizeDate(feasibility.naturalEndDate ?? feasibility.natural_end_date)
  const overshootDays = readNumber(feasibility.overshootDays ?? feasibility.overshoot_days) ?? 0
  const recoverableDays = readNumber(feasibility.recoverableDays ?? feasibility.recoverable_days) ?? 0
  const unrecoverableDays = readNumber(feasibility.unrecoverableDays ?? feasibility.unrecoverable_days) ?? 0
  const candidateGapCodes: string[] = []

  if (uncoveredDurationAssetRowCount > 0 || (scheduleRowCount > 0 && durationAssetCoveredRowCount < scheduleRowCount)) {
    candidateGapCodes.push('duration_asset_coverage_gap')
  }
  if (unresolvedDependencyCount > 0) {
    candidateGapCodes.push('unresolved_dependency_edges')
  } else if (scheduleRowCount > 1 && previewDependencyCount <= 0) {
    candidateGapCodes.push('missing_dependency_network')
  }
  if (scheduleRowCount > 1 && projectedNetworkSpanDays <= 0) {
    candidateGapCodes.push('missing_projected_network_span')
  }
  if (datedAcceptanceMilestoneCount <= 0) {
    candidateGapCodes.push('missing_dated_acceptance_milestone')
  }
  if (overshootDays > 0) {
    candidateGapCodes.push('target_duration_gap')
  }

  const targetAlignmentSnapshot = {
    status: overshootDays > 0 ? 'target_gap_for_offline_quality_review' : 'target_aligned',
    targetEndDate,
    naturalEndDate,
    overshootDays,
    recoverableDays,
    unrecoverableDays,
    verdict: firstText(feasibility.verdict) || null,
    ...(Object.keys(readRecord(feasibility.durationAssetPlanDateTargetRecalculation)).length > 0
      ? { durationAssetPlanDateTargetRecalculation: readRecord(feasibility.durationAssetPlanDateTargetRecalculation) }
      : {}),
    runtimeDecisionRequired: false,
    blocksWizardCommit: false,
  }

  return {
    source: 'wizard_generation_plan_quality_diagnostics',
    status: candidateGapCodes.length === 0 ? 'ready_for_plan_preview' : 'offline_quality_review_recommended',
    intendedUse: 'offline_development_quality_review_and_template_calibration',
    runtimeApprovalRequired: false,
    blocksWizardCommit: false,
    blocksBaselinePublication: false,
    candidateGapCodes: Array.from(new Set(candidateGapCodes)),
    scheduleRowCount,
    durationAssetCoveredRowCount,
    durationAssetReviewRowCount,
    uncoveredDurationAssetRowCount,
    rowsMissingRuntimeReferenceDaysCount,
    projectedNetworkSpanDays,
    previewDependencyCount,
    unresolvedDependencyCount,
    acceptanceMilestoneCount,
    datedAcceptanceMilestoneCount,
    materializedAcceptanceMilestoneCount,
    commercialFactReadinessStatus: firstText(commercialFactReadiness.status) || null,
    targetAlignmentSnapshot,
    mutationBoundary: 'diagnostics_only_no_runtime_approval_no_plan_write_no_production_claim',
  }
}

function readWizardFeatureTriggeredAcceptanceScheduleEvidence(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  const title = readWizardGeneratedRowTitle(row, '')
  const executionPhase = firstText(
    values.execution_phase,
    values.executionPhase,
    metadata.executionPhase,
    metadata.execution_phase,
    (row as Record<string, unknown>).executionPhase,
    (row as Record<string, unknown>).execution_phase,
  ) || null
  const executionLane = firstText(
    values.execution_lane,
    values.executionLane,
    metadata.executionLane,
    metadata.execution_lane,
    (row as Record<string, unknown>).executionLane,
    (row as Record<string, unknown>).execution_lane,
  ) || null
  const acceptanceScheduleEvidence = firstText(
    values.acceptanceScheduleEvidence,
    values.acceptance_schedule_evidence,
    metadata.acceptanceScheduleEvidence,
    metadata.acceptance_schedule_evidence,
    (row as Record<string, unknown>).acceptanceScheduleEvidence,
    (row as Record<string, unknown>).acceptance_schedule_evidence,
  ) || null
  const explicitFeatureTriggered = isTruthyFlag(
    values.featureTriggeredAcceptanceScheduleRow
      ?? values.feature_triggered_acceptance_schedule_row
      ?? metadata.featureTriggeredAcceptanceScheduleRow
      ?? metadata.feature_triggered_acceptance_schedule_row
      ?? (row as Record<string, unknown>).featureTriggeredAcceptanceScheduleRow
      ?? (row as Record<string, unknown>).feature_triggered_acceptance_schedule_row,
  )
  const phaseTriggered = ['commissioning', 'acceptance_handover'].includes(String(executionPhase ?? '').trim())
  const titleTriggered = /验收|移交|联调|调试|开业|投产|运营|acceptance|handover|commissioning|opening|trial|load/i.test(title)
  const featureTriggeredAcceptanceScheduleRow = Boolean(
    explicitFeatureTriggered
      || acceptanceScheduleEvidence
      || (phaseTriggered && titleTriggered),
  )
  return {
    featureTriggeredAcceptanceScheduleRow,
    acceptanceScheduleEvidence: featureTriggeredAcceptanceScheduleRow
      ? acceptanceScheduleEvidence
        || 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write'
      : null,
    executionPhase,
    executionLane,
  }
}

function isWizardGeneratedMajorAcceptanceRow(row: GeneratedTemplateRow) {
  if (!isWizardGeneratedExecutableRow(row)) return false
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  const title = readWizardGeneratedRowTitle(row, '')
  const nodeType = normalizeId(values.wbs_node_type ?? values.category_type ?? metadata.nodeType ?? metadata.planItemKind)
  const completionRule = normalizeId(values.completion_rule ?? values.completionRule ?? metadata.completionRule)
  const planItemKind = normalizeId(values.plan_item_kind ?? values.planItemKind ?? metadata.planItemKind)
  const acceptanceSignal = [
    title,
    values.standard_work_code,
    values.template_node_id,
    metadata.stableCode,
    metadata.standardWorkCode,
  ].map((item) => normalizeText(item)).join(' ')

  if (completionRule === 'acceptance_passed') return true
  if (isTruthyFlag(metadata.isAcceptanceMilestone ?? metadata.is_acceptance_milestone)) return true
  if (readWizardFeatureTriggeredAcceptanceScheduleEvidence(row).featureTriggeredAcceptanceScheduleRow) return true
  if (planItemKind === 'milestone' && /验收|竣工|移交|开学|开业|投产|acceptance|handover|opening|commissioning/i.test(acceptanceSignal)) return true
  if (nodeType === 'milestone' && /验收|竣工|移交|acceptance|handover/i.test(acceptanceSignal)) return true
  return false
}

function inferWizardGeneratedAcceptanceType(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  const text = [
    values.title,
    values.name,
    values.standard_work_name,
    values.standard_work_code,
    values.template_node_id,
    metadata.stableCode,
    metadata.standardWorkCode,
  ].map((item) => normalizeText(item)).join(' ').toLowerCase()
  if (/消防|fire/.test(text)) return 'fire_acceptance'
  if (/环保|environment|voc|emission/.test(text)) return 'environment_acceptance'
  if (/规划|planning/.test(text)) return 'planning_acceptance'
  if (/节能|energy/.test(text)) return 'energy_acceptance'
  if (/人防|civil_defense/.test(text)) return 'civil_defense_acceptance'
  if (/电梯|elevator/.test(text)) return 'elevator_acceptance'
  if (/竣工|completion|handover|移交/.test(text)) return 'completion'
  return 'template_major_acceptance'
}

function buildWizardGeneratedAcceptancePlanName(row: GeneratedTemplateRow) {
  const values = readRecord(row.values)
  const metadata = readRecord(values.standard_task_metadata ?? values.standardTaskMetadata)
  return firstText(
    values.title,
    values.name,
    values.standard_work_name,
    metadata.title,
    metadata.standardWorkName,
    '模板验收计划',
  )
}

function buildWizardTargetAcceptancePlanTitle(terminalEvent: unknown) {
  const normalized = normalizeText(terminalEvent) || 'completion_acceptance'
  if (normalized === 'owner_handover') return '业主移交'
  if (normalized === 'trial_opening') return '试运营开放'
  if (normalized === 'production_validation') return '投产验证'
  if (normalized === 'contract_completion') return '合同竣工节点'
  return '竣工验收与交付移交'
}

function buildWizardTargetAcceptancePlanPreview(params: {
  plannedEndDate?: unknown
  terminalEvent?: unknown
  sourceRowSortOrder?: number | null
}) {
  const plannedDate = normalizeDate(params.plannedEndDate)
  if (!plannedDate) return null

  const terminalEvent = normalizeText(params.terminalEvent) || 'completion_acceptance'
  const item = {
    clientRowId: `wizard-target-${terminalEvent.replace(/_/g, '-')}`,
    title: buildWizardTargetAcceptancePlanTitle(terminalEvent),
    acceptanceType: terminalEvent,
    plannedDate,
    plannedStartDate: plannedDate,
    plannedEndDate: plannedDate,
    sourceRowSortOrder: params.sourceRowSortOrder ?? null,
    sourceBasis: 'wizard_planned_end_date_terminal_event',
  }

  return {
    source: 'wizard_target_candidate_acceptance_plan_preview',
    evidenceLevel: 'candidate_acceptance_plan_preview_l1',
    mutationBoundary: 'target_preview_only_no_acceptance_plan_write',
    totalCount: 1,
    datedCount: 1,
    writesAcceptancePlans: false,
    fallbackFromProjectTarget: true,
    items: [item],
  }
}

type WizardAcceptancePlanMaterialization = {
  clientRowId: string
  taskId?: string | null
  acceptancePlanId: string
}

function buildWizardAcceptancePlanMaterializationFields(materialization?: WizardAcceptancePlanMaterialization) {
  if (!materialization) return {}
  return {
    createdTaskId: materialization.taskId ?? null,
    createdAcceptancePlanId: materialization.acceptancePlanId,
    materializationStatus: 'materialized_acceptance_plan_available',
    materializationEvidenceLevel: 'candidate_acceptance_plan_materialized_id_mapping_l1',
    materializationMutationBoundary: 'acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record',
  }
}

function buildCandidateAcceptancePlanPreview(
  rows: GeneratedTemplateRow[],
  options: {
    plannedEndDate?: unknown
    terminalEvent?: unknown
    materializations?: WizardAcceptancePlanMaterialization[]
    materializationRequiredForPlanConsistency?: boolean
  } = {},
) {
  const materializationRequiredForPlanConsistency =
    options.materializationRequiredForPlanConsistency === true
  const materializationByClientRowId = new Map(
    (options.materializations ?? [])
      .filter((item) => item.clientRowId && item.acceptancePlanId)
      .map((item) => [item.clientRowId, item]),
  )
  const candidates = rows
    .filter(isWizardGeneratedMajorAcceptanceRow)
    .map((row) => {
      const values = readRecord(row.values)
      const title = buildWizardGeneratedAcceptancePlanName(row)
      const featureTriggeredAcceptance = readWizardFeatureTriggeredAcceptanceScheduleEvidence(row)
      const plannedDate = normalizeDate(
        values.planned_end_date
          ?? values.end_date
          ?? values.planned_start_date
          ?? values.start_date,
      )
      const materialization = materializationByClientRowId.get(row.clientRowId)
      return {
        clientRowId: row.clientRowId,
        title,
        acceptanceType: inferWizardGeneratedAcceptanceType(row),
        plannedDate,
        plannedStartDate: normalizeDate(values.planned_start_date ?? values.start_date),
        plannedEndDate: normalizeDate(values.planned_end_date ?? values.end_date),
        featureTriggeredAcceptanceScheduleRow: featureTriggeredAcceptance.featureTriggeredAcceptanceScheduleRow,
        acceptanceScheduleEvidence: featureTriggeredAcceptance.acceptanceScheduleEvidence,
        executionPhase: featureTriggeredAcceptance.executionPhase,
        executionLane: featureTriggeredAcceptance.executionLane,
        sourceBasis: featureTriggeredAcceptance.acceptanceScheduleEvidence,
        sourceRowSortOrder: row.sortOrder,
        ...buildWizardAcceptancePlanMaterializationFields(materialization),
      }
    })

  if (candidates.length === 0) {
    const targetPreview = buildWizardTargetAcceptancePlanPreview({
      plannedEndDate: options.plannedEndDate,
      terminalEvent: options.terminalEvent,
      sourceRowSortOrder: resolveNextWizardGeneratedSortOrder(rows),
    })
    if (!targetPreview) return targetPreview

    const targetItems = readEvidenceItems(targetPreview).map((item) => {
      const clientRowId = firstText(item.clientRowId, item.client_row_id) || ''
      const materialization = materializationByClientRowId.get(clientRowId)
      return {
        ...item,
        ...buildWizardAcceptancePlanMaterializationFields(materialization),
        ...(!materialization && materializationRequiredForPlanConsistency ? {
          materializationStatus: 'materialized_acceptance_plans_missing',
          materializationEvidenceLevel: 'candidate_acceptance_plan_materialized_id_mapping_l1',
          materializationMutationBoundary: 'acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record',
        } : {}),
      }
    })
    const materializedCount = targetItems.filter((item) => {
      const itemRecord = readRecord(item)
      return Boolean(firstText(
        itemRecord.createdAcceptancePlanId,
        itemRecord.created_acceptance_plan_id,
        itemRecord.acceptancePlanId,
      ))
    }).length
    const materializationStatus = materializedCount === 0
      ? materializationRequiredForPlanConsistency
        ? 'materialized_acceptance_plans_missing'
        : 'preview_only'
      : materializedCount === targetItems.length
        ? 'materialized_acceptance_plans_available'
        : 'materialized_acceptance_plans_partial'

    return materializationRequiredForPlanConsistency || materializedCount > 0
      ? {
          ...targetPreview,
          materializedCount,
          materializationRequiredForPlanConsistency: true,
          materializationStatus,
          materializationEvidenceLevel: 'candidate_acceptance_plan_materialized_id_mapping_l1',
          materializationMutationBoundary: 'acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record',
          items: targetItems,
        }
      : {
          ...targetPreview,
          items: targetItems,
        }
  }

  const materializedCount = candidates.filter((candidate) => (
    Boolean(firstText(candidate.createdAcceptancePlanId))
  )).length
  const materializationStatus = materializedCount === 0
    ? materializationRequiredForPlanConsistency
      ? 'materialized_acceptance_plans_missing'
      : 'preview_only'
    : materializedCount === candidates.length
      ? 'materialized_acceptance_plans_available'
      : 'materialized_acceptance_plans_partial'

  return {
    source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
    evidenceLevel: 'candidate_acceptance_plan_preview_l1',
    mutationBoundary: 'preview_only_no_acceptance_plan_write',
    totalCount: candidates.length,
    datedCount: candidates.filter((candidate) => Boolean(candidate.plannedDate)).length,
    featureTriggeredAcceptanceScheduleRowCount: candidates.filter((candidate) => (
      candidate.featureTriggeredAcceptanceScheduleRow === true
    )).length,
    materializedCount,
    materializationRequiredForPlanConsistency,
    materializationStatus,
    ...(materializedCount > 0 || materializationRequiredForPlanConsistency ? {
      materializationEvidenceLevel: 'candidate_acceptance_plan_materialized_id_mapping_l1',
      materializationMutationBoundary: 'acceptance_plan_id_mapping_only_no_additional_acceptance_plan_write_no_runtime_approval_record',
    } : {}),
    writesAcceptancePlans: false,
    items: candidates,
  }
}

async function writeWizardGeneratedAcceptancePlans(params: {
  projectId: string
  rows: GeneratedTemplateRow[]
  idByClientRowId: Map<string, string>
  actorId?: string | null
  generationBatchId?: string | null
  plannedEndDate?: unknown
  terminalEvent?: unknown
  transactionClient: TransactionClientLike
}) {
  const ts = now()
  const ids: string[] = []
  const materializations: WizardAcceptancePlanMaterialization[] = []
  let generatedMajorAcceptanceRowCount = 0
  for (const row of params.rows) {
    if (!isWizardGeneratedMajorAcceptanceRow(row)) continue
    generatedMajorAcceptanceRowCount += 1
    const taskId = params.idByClientRowId.get(row.clientRowId)
    if (!taskId) continue
    const values = readRecord(row.values)
    const planName = buildWizardGeneratedAcceptancePlanName(row)
    const plannedDate = normalizeDate(
      values.planned_end_date
        ?? values.end_date
        ?? values.planned_start_date
        ?? values.start_date,
    )
    if (!planName || !plannedDate) continue
    const id = uuidv4()
    await params.transactionClient.query(
      `INSERT INTO acceptance_plans (
         id, project_id, acceptance_name, acceptance_type,
         planned_date, status, documents, notes, created_by, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        params.projectId,
        planName,
        inferWizardGeneratedAcceptanceType(row),
        plannedDate,
        'draft',
        JSON.stringify([]),
        `由项目快速建模向导根据特征触发验收里程碑自动挂接${params.generationBatchId ? `\n[wizard_generation_batch_id:${params.generationBatchId}]` : ''}`,
        params.actorId ?? null,
        ts,
        ts,
      ],
    )
    await params.transactionClient.query(
      `INSERT INTO project_entity_links (
         project_id, source_entity_type, source_entity_id,
         target_entity_type, target_entity_id, relation_type,
         relation_strength, status, display_snapshot, metadata, created_at, updated_at
       )
       VALUES (
         $1, 'acceptance_plan', $2,
         'task', $3, 'covers_task',
         'system_inferred', 'active', $4::jsonb, $5::jsonb, $6, $7
       )`,
      [
        params.projectId,
        id,
        taskId,
        JSON.stringify({ acceptanceName: planName }),
        JSON.stringify({
          wizardGeneration: {
            generationBatchId: params.generationBatchId ?? null,
            clientRowId: row.clientRowId,
          },
        }),
        ts,
        ts,
      ],
    )
    await recordWizardAcceptancePlanFacts({
      projectId: params.projectId,
      planId: id,
      next: { status: 'draft', actual_date: null },
      sourceMutationId: `wizard:acceptance-plan:${id}:create`,
      observedAt: ts,
      actorUserId: params.actorId,
      forceInitial: true,
      transactionClient: params.transactionClient,
    })
    ids.push(id)
    materializations.push({
      clientRowId: row.clientRowId,
      taskId,
      acceptancePlanId: id,
    })
  }

  if (generatedMajorAcceptanceRowCount === 0) {
    const targetPreview = buildWizardTargetAcceptancePlanPreview({
      plannedEndDate: params.plannedEndDate,
      terminalEvent: params.terminalEvent,
      sourceRowSortOrder: resolveNextWizardGeneratedSortOrder(params.rows),
    })
    const targetItem = readEvidenceItems(targetPreview).at(0)
    const clientRowId = firstText(targetItem?.clientRowId, targetItem?.client_row_id)
    const plannedDate = normalizeDate(targetItem?.plannedDate ?? targetItem?.planned_date)
    const planName = firstText(targetItem?.title, targetItem?.name, targetItem?.acceptanceName, targetItem?.acceptance_name)
    if (clientRowId && planName && plannedDate) {
      const id = uuidv4()
      await params.transactionClient.query(
        `INSERT INTO acceptance_plans (
           id, project_id, acceptance_name, acceptance_type,
           planned_date, status, documents, notes, created_by, created_at, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          params.projectId,
          planName,
          firstText(targetItem?.acceptanceType, targetItem?.acceptance_type) || 'completion_acceptance',
          plannedDate,
          'draft',
          JSON.stringify([]),
          `Created by project wizard from project planned end date terminal event fallback${params.generationBatchId ? `\n[wizard_generation_batch_id:${params.generationBatchId}]` : ''}`,
          params.actorId ?? null,
          ts,
          ts,
        ],
      )
      await recordWizardAcceptancePlanFacts({
        projectId: params.projectId,
        planId: id,
        next: { status: 'draft', actual_date: null },
        sourceMutationId: `wizard:acceptance-plan:${id}:create`,
        observedAt: ts,
        actorUserId: params.actorId,
        forceInitial: true,
        transactionClient: params.transactionClient,
      })
      ids.push(id)
      materializations.push({
        clientRowId,
        taskId: null,
        acceptancePlanId: id,
      })
    }
  }
  return { count: ids.length, ids, materializations }
}

async function markHistoricalTaskConditionsSatisfied(params: {
  projectId: string
  tasks: GeneratedTaskRecord[]
  actorId?: string | null
  transactionClient?: TransactionClientLike | null
}) {
  const historicalTaskIds = params.tasks
    .filter((task) => task.isHistorical || task.onboardingStageClassification === 'history')
    .map((task) => task.id)
    .filter(Boolean)
  if (historicalTaskIds.length === 0) return 0

  const ts = now()
  const result = params.transactionClient
    ? await params.transactionClient.query(
      `UPDATE task_conditions
       SET is_satisfied = TRUE,
           satisfied_reason = COALESCE(satisfied_reason, $3),
           satisfied_reason_note = COALESCE(satisfied_reason_note, $4),
           confirmed_by = COALESCE(confirmed_by, $5),
           confirmed_at = COALESCE(confirmed_at, $6),
           updated_at = $6
       WHERE project_id = $1
         AND task_id::text = ANY($2::text[])
         AND COALESCE(is_satisfied, FALSE) = FALSE
       RETURNING id`,
      [
        params.projectId,
        historicalTaskIds,
        'wizard_starting_line_history',
        '起跑线历史任务由项目快速建模向导自动确认开工条件已满足',
        params.actorId ?? null,
        ts,
      ],
    )
    : await rawQuery(
    `UPDATE task_conditions
     SET is_satisfied = TRUE,
         satisfied_reason = COALESCE(satisfied_reason, $3),
         satisfied_reason_note = COALESCE(satisfied_reason_note, $4),
         confirmed_by = COALESCE(confirmed_by, $5),
         confirmed_at = COALESCE(confirmed_at, $6),
         updated_at = $6
     WHERE project_id = $1
       AND task_id::text = ANY($2::text[])
       AND COALESCE(is_satisfied, FALSE) = FALSE
     RETURNING id`,
    [
      params.projectId,
      historicalTaskIds,
      'wizard_starting_line_history',
      '起跑线历史任务由项目快速建模向导自动确认开工条件已满足',
      params.actorId ?? null,
      ts,
    ],
    )
  return result.rowCount ?? result.rows?.length ?? 0
}

async function saveCompanyTemplateIfRequested(params: {
  companyId: string | null
  projectId: string
  payload: z.infer<typeof wizardPayloadSchema>
  actorId?: string | null
  name?: string
}) {
  if (!params.companyId) return null
  if (!params.payload.saveAsCompanyTemplate && !params.name) return null
  const id = uuidv4()
  const ts = now()
  const name = params.name || params.payload.companyTemplateName || `${params.payload.projectName ?? '项目'}模板`
  await rawQuery(
    `INSERT INTO company_project_templates (id, company_id, name, description, source_project_id,
     business_type, business_subtype, method_variant_codes,
     project_features, scope_tree_snapshot, default_detail_level, snapshot,
     version_history, usage_count, is_default, created_at, created_by, updated_at, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,false,$13,$14,$15,$16)
     ON CONFLICT DO NOTHING`,
    [
      id,
      params.companyId,
      name,
      '由项目快速建模向导保存',
      params.projectId,
      params.payload.businessType,
      params.payload.businessSubtype ?? null,
      JSON.stringify(params.payload.methodVariantCodes),
      JSON.stringify(params.payload.projectFeatures),
      JSON.stringify(params.payload.scopeTree),
      params.payload.detailLevel,
      JSON.stringify(params.payload),
      JSON.stringify([]),
      ts,
      params.actorId ?? null,
      ts,
      params.actorId ?? null,
    ],
  )
  return id
}

async function createOrUpdateWizardProject(params: {
  projectId?: string
  newProjectId?: string
  companyId: string | null
  actorId?: string | null
  body: z.infer<typeof wizardCreateSchema>
  payload: z.infer<typeof wizardPayloadSchema>
  commit: boolean
}) {
  const ts = now()
  const projectId = params.projectId ?? params.newProjectId ?? uuidv4()
  const existing = params.projectId
    ? (await readProjectMetadata(params.projectId)).project
    : null
  const existingMetadata = readRecord(existing?.metadata)
  const plannedStartDate = params.body.planned_start_date ?? params.payload.plannedStartDate ?? null
  const plannedEndDate = params.body.planned_end_date ?? params.payload.plannedEndDate ?? null
  const actualStartDate = params.body.actual_start_date ?? params.payload.actualStartDate ?? null
  const metadata = mergeWizardMetadata(existingMetadata, params.payload, {
    ...(params.body.metadata ?? {}),
    wizard_draft_payload: params.payload,
    wizard_draft_step: params.payload.step ?? 0,
    wizard_draft_updated_at: ts,
  })
  const status = PROJECT_DRAFT_STATUS

  if (existing) {
    const existingStatus = normalizeText(existing.status)
    if (params.commit && existingStatus && existingStatus !== PROJECT_DRAFT_STATUS) {
      throw Object.assign(new Error('Wizard commit is only allowed for wizard draft projects.'), {
        statusCode: 409,
        code: 'WIZARD_COMMIT_NOT_ALLOWED',
      })
    }
    const updateResult = await rawQuery(
      `UPDATE projects
       SET name = $2, company_id = $3, status = $4, location = $5,
           total_area = $6, planned_start_date = $7, planned_end_date = $8, actual_start_date = $9, metadata = $10::jsonb, updated_at = $11
       WHERE id = $1
         AND (
           $12::boolean IS NOT TRUE
           OR (
             (metadata->>'wizard_generation_state') IS DISTINCT FROM $13
             AND metadata->>'wizard_completed_at' IS NULL
           )
         )
       RETURNING id`,
      [
        projectId,
        params.body.name ?? params.payload.projectName ?? PROJECT_DEFAULT_NAME,
        normalizeText(existing.company_id) || params.companyId,
        status,
        params.body.location ?? params.payload.location ?? null,
        params.body.total_area ?? params.payload.totalAreaM2 ?? null,
        plannedStartDate,
        plannedEndDate,
        actualStartDate,
        JSON.stringify(metadata),
        ts,
        params.commit,
        WIZARD_GENERATION_STATE_RUNNING,
      ],
    )
    if (params.commit && updateResult.rows.length === 0) {
      throw Object.assign(new Error('Wizard generation is already running or has been committed.'), {
        statusCode: 409,
        code: 'WIZARD_GENERATION_NOT_REENTRANT',
      })
    }
  } else {
    await executeProjectCreationUnderCommercialGuard({
      companyId: normalizeText(params.companyId),
      actorUserId: params.actorId,
      create: async (transactionClient) => {
        const ownerId = normalizeText(params.actorId)
        if (!ownerId) {
          throw Object.assign(new Error('Wizard project creation requires an authenticated owner.'), {
            statusCode: 401,
            code: 'WIZARD_PROJECT_OWNER_REQUIRED',
          })
        }
        const insertResult = await transactionClient.query(
          `INSERT INTO projects (id, name, company_id, status, location, total_area, planned_start_date, planned_end_date, actual_start_date, metadata, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            projectId,
            params.body.name ?? params.payload.projectName ?? PROJECT_DEFAULT_NAME,
            params.companyId,
            status,
            params.body.location ?? params.payload.location ?? null,
            params.body.total_area ?? params.payload.totalAreaM2 ?? null,
            plannedStartDate,
            plannedEndDate,
            actualStartDate,
            JSON.stringify(metadata),
            ts,
            ts,
          ],
        )
        await transactionClient.query(
          `INSERT INTO public.project_members (
             id, project_id, user_id, permission_level, joined_at, is_active, last_activity
           ) VALUES ($1, $2, $3, 'owner', NOW(), TRUE, NOW())
          `,
          [uuidv4(), projectId, ownerId],
        )
        return insertResult
      },
    })
  }

  return { projectId, metadata, status, ts }
}

type WizardGenerationCleanupTarget = {
  projectId: string
  generationBatchId?: string | null
  generatedBaselineIds?: string[]
  createdTaskIds?: string[]
  materializedObjectIds?: string[]
  generatedAcceptancePlanIds?: string[]
  passedAcceptancePlanIds?: string[]
  includeGenerationBatchFallback?: boolean
}

type WizardArtifactInventory = {
  projectId: string | null
  projectStatus: string | null
  wizardGenerationBatchId: string | null
  wizardGenerationState: string | null
  wizardGenerationLastError: string | null
  wizardGenerationLastErrorCode: string | null
  generatedTaskCount: number
  generatedPrimaryScheduleTaskCount: number
  generatedPrimaryScheduleExecutableTaskCount: number
  generatedPrimaryScheduleRecordOnlyTaskCount: number
  generatedNonPrimaryTaskCount: number
  generationBatchIds: string[]
  duplicateGeneratedTaskSignatureCount: number
  candidateBaselinesRemaining: number
  candidateBaselineDraftCount: number
  candidateBaselineIds: string[]
  candidateBaselineStatuses: string[]
  candidateBaselineItemCount: number
  candidateBaselineMappedItemCount: number
  candidateBaselineUnmappedItemCount: number
  dependenciesRemaining: number
  acceptancePlansRemaining: number
  engineeringObjectsRemaining: number
}

const WIZARD_ARTIFACT_CLEANUP_ID_CHUNK_SIZE = 50
const WIZARD_ROLLBACK_METADATA_UPDATE_TIMEOUT_MS = readPositiveIntegerEnv(
  'WIZARD_ROLLBACK_METADATA_UPDATE_TIMEOUT_MS',
  15_000,
)

function mergeWizardAcceptancePlanIds(params: {
  generatedAcceptancePlanIds?: string[]
  passedAcceptancePlanIds?: string[]
}) {
  return [...new Set([
    ...(params.generatedAcceptancePlanIds ?? []),
    ...(params.passedAcceptancePlanIds ?? []),
  ])].filter(Boolean)
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

function buildLocalStatementTimeoutSql(timeoutMs: number) {
  const safeTimeoutMs = Math.max(1, Math.trunc(timeoutMs))
  return `SET LOCAL statement_timeout = '${safeTimeoutMs}ms'`
}

function chunkWizardArtifactIds(ids: string[]) {
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += WIZARD_ARTIFACT_CLEANUP_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + WIZARD_ARTIFACT_CLEANUP_ID_CHUNK_SIZE))
  }
  return chunks
}

async function countWizardRowsByIdChunks(
  sql: string,
  projectId: string,
  ids: string[],
) {
  let count = 0
  for (const idChunk of chunkWizardArtifactIds(ids)) {
    // database-query-dynamic-approved: wizard stale-artifact cleanup owns only fixed count SQL templates; ids remain bound parameters.
    const result = await rawQuery(sql, [projectId, idChunk])
    count += Number(result.rows[0]?.count ?? 0)
  }
  return count
}

async function countDistinctWizardRowsByIdChunks(
  sql: string,
  projectId: string,
  ids: string[],
) {
  const rowIds = new Set<string>()
  for (const idChunk of chunkWizardArtifactIds(ids)) {
    // database-query-dynamic-approved: wizard inventory owns only fixed id-read SQL templates; ids remain bound parameters.
    const result = await rawQuery(sql, [projectId, idChunk])
    for (const row of result.rows as Array<{ id?: string | null }>) {
      const rowId = normalizeText(row.id)
      if (rowId) rowIds.add(rowId)
    }
  }
  return rowIds.size
}

async function summarizeWizardTasksByIdChunks(projectId: string, ids: string[]) {
  const summary = {
    generatedTaskCount: 0,
    generatedPrimaryScheduleTaskCount: 0,
    generatedPrimaryScheduleExecutableTaskCount: 0,
    generatedPrimaryScheduleRecordOnlyTaskCount: 0,
  }
  for (const idChunk of chunkWizardArtifactIds(ids)) {
    const result = await rawQuery(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (
                WHERE COALESCE(
                  NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'rowProjectionMode', ''),
                  NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'row_projection_mode', '')
                ) = 'schedule_row'
                  AND COALESCE(
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'scheduleParticipation', ''),
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'schedule_participation', ''),
                    'primary_schedule'
                  ) = 'primary_schedule'
              )::int AS primary_schedule_count,
              COUNT(*) FILTER (
                WHERE COALESCE(
                  NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'rowProjectionMode', ''),
                  NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'row_projection_mode', '')
                ) = 'schedule_row'
                  AND COALESCE(
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'scheduleParticipation', ''),
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'schedule_participation', ''),
                    'primary_schedule'
                  ) = 'primary_schedule'
                  AND is_executable = TRUE
              )::int AS primary_schedule_executable_count,
              COUNT(*) FILTER (
                WHERE COALESCE(
                  NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'rowProjectionMode', ''),
                  NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'row_projection_mode', '')
                ) = 'schedule_row'
                  AND COALESCE(
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'scheduleParticipation', ''),
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'schedule_participation', ''),
                    'primary_schedule'
                  ) = 'primary_schedule'
                  AND COALESCE(
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'durationContributionMode', ''),
                    NULLIF(COALESCE(standard_task_metadata, '{}'::jsonb)->>'duration_contribution_mode', '')
                  ) = 'record_only'
              )::int AS primary_schedule_record_only_count
         FROM tasks
        WHERE project_id = $1
          AND id = ANY($2::uuid[])`,
      [projectId, idChunk],
    )
    const row = readRecord(result.rows[0])
    summary.generatedTaskCount += Number(row.count ?? 0)
    summary.generatedPrimaryScheduleTaskCount += Number(row.primary_schedule_count ?? 0)
    summary.generatedPrimaryScheduleExecutableTaskCount += Number(row.primary_schedule_executable_count ?? 0)
    summary.generatedPrimaryScheduleRecordOnlyTaskCount += Number(row.primary_schedule_record_only_count ?? 0)
  }
  return summary
}

function isWizardPrimaryScheduleTaskRow(task: Record<string, unknown>) {
  const metadata = readRecord(task.standard_task_metadata)
  const projectionMode = normalizeText(metadata.rowProjectionMode ?? metadata.row_projection_mode)
  const participation = normalizeText(
    metadata.scheduleParticipation ?? metadata.schedule_participation,
  ) || 'primary_schedule'
  return projectionMode === 'schedule_row' && participation === 'primary_schedule'
}

type WizardGenerationState =
  | typeof WIZARD_GENERATION_STATE_QUEUED
  | typeof WIZARD_GENERATION_STATE_RUNNING
  | typeof WIZARD_GENERATION_STATE_COMPLETED
  | typeof WIZARD_GENERATION_STATE_FAILED

type QueuedWizardGeneration = {
  projectId: string
  payload: z.infer<typeof wizardPayloadSchema>
  actorId?: string | null
  companyId?: string | null
  attemptId: string
  saveAsCompanyTemplate?: boolean
  companyTemplateName?: string | null
}

type WizardDiagnosticFailureInjection = {
  diagnosticRunId: string
  failureStage: string
}

function serializeWizardGenerationError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function wizardDiagnosticError(message: string, statusCode: number, code: string, details?: Record<string, unknown>) {
  return Object.assign(new Error(message), {
    statusCode,
    code,
    details,
  })
}

function readWizardDiagnosticFailureInjection(req: any, metadata: Record<string, unknown>): WizardDiagnosticFailureInjection | null {
  const diagnosticRunId = normalizeText(req.get?.('x-workbuddy-diagnostic-run-id'))
  const failureStage = normalizeText(req.get?.('x-workbuddy-diagnostic-failure-stage'))
  if (!diagnosticRunId && !failureStage) return null

  if (process.env[WIZARD_DIAGNOSTIC_FAILURE_INJECTION_FLAG] !== 'true') {
    throw wizardDiagnosticError(
      'Wizard diagnostic failure injection is disabled.',
      403,
      'WIZARD_DIAGNOSTIC_FAILURE_INJECTION_DISABLED',
    )
  }
  if (!diagnosticRunId || !failureStage || !WIZARD_DIAGNOSTIC_FAILURE_STAGES.has(failureStage)) {
    throw wizardDiagnosticError(
      'Wizard diagnostic failure injection request is invalid.',
      400,
      'WIZARD_DIAGNOSTIC_FAILURE_INJECTION_INVALID_REQUEST',
      {
        allowedStages: [...WIZARD_DIAGNOSTIC_FAILURE_STAGES],
      },
    )
  }

  const metadataDiagnostic = normalizeText(metadata.createdForDiagnostic)
  const metadataRunId = normalizeText(metadata.diagnosticRunId)
  const disposable = metadata.disposable === true || normalizeText(metadata.disposable).toLowerCase() === 'true'
  if (metadataDiagnostic !== WIZARD_DIAGNOSTIC_C18_L09 || metadataRunId !== diagnosticRunId || !disposable) {
    throw wizardDiagnosticError(
      'Wizard diagnostic failure injection is only allowed for C-18.L09 disposable wizard drafts.',
      403,
      'WIZARD_DIAGNOSTIC_FAILURE_INJECTION_NOT_ALLOWED',
      {
        requiredDiagnostic: WIZARD_DIAGNOSTIC_C18_L09,
        diagnosticRunIdMatches: Boolean(metadataRunId && metadataRunId === diagnosticRunId),
        disposable,
      },
    )
  }

  return {
    diagnosticRunId,
    failureStage,
  }
}

function injectWizardDiagnosticFailureIfRequested(params: {
  injection?: WizardDiagnosticFailureInjection | null
  stage: string
}) {
  if (!params.injection || params.injection.failureStage !== params.stage) return
  throw wizardDiagnosticError(
    `Wizard diagnostic failure injected at ${params.stage}.`,
    500,
    'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
    {
      diagnostic: WIZARD_DIAGNOSTIC_C18_L09,
      diagnosticRunId: params.injection.diagnosticRunId,
      failureStage: params.stage,
    },
  )
}

function logWizardGenerationStageTiming(params: {
  projectId: string
  generationBatchId: string
  stage: string
  startedAt: number
  previousAt: number
  extra?: Record<string, unknown>
}) {
  const nowMs = Date.now()
  logger.info('Wizard generation stage timing', {
    source: 'wizard_generation_stage_timing',
    projectId: params.projectId,
    generationBatchId: params.generationBatchId,
    stage: params.stage,
    elapsedMs: nowMs - params.startedAt,
    deltaMs: nowMs - params.previousAt,
    ...(params.extra ?? {}),
  })
  return nowMs
}

async function setWizardGenerationQueued(params: {
  projectId: string
  attemptId: string
}) {
  const ts = now()
  const { metadata } = await readProjectMetadata(params.projectId)
  await updateProjectMetadata({
    projectId: params.projectId,
    updatedAt: ts,
    metadata: mergeRecords(metadata, {
      wizard_generation_state: WIZARD_GENERATION_STATE_QUEUED,
      wizard_generation_attempt_id: params.attemptId,
      wizard_generation_queued_at: ts,
    }),
  })
}

function mapWizardGenerationMetadata(project: Record<string, unknown> | null, requestedAttemptId?: string | null) {
  const metadata = readRecord(project?.metadata)
  const attemptId = normalizeText(metadata.wizard_generation_attempt_id)
    || normalizeText(metadata.wizard_generation_last_attempt_id)
    || normalizeText(requestedAttemptId)
  const state = normalizeText(metadata.wizard_generation_state) || (metadata.wizard_completed_at ? WIZARD_GENERATION_STATE_COMPLETED : '')
  const readMetadataEvidence = (value: unknown) => {
    const record = readRecord(value)
    return Object.keys(record).length > 0 ? record : null
  }
  return {
    projectId: normalizeText(project?.id),
    attemptId,
    state: (state || WIZARD_GENERATION_STATE_FAILED) as WizardGenerationState,
    generationBatchId: normalizeText(metadata.wizard_generation_batch_id || metadata.wizard_generation_last_failed_batch_id) || null,
    queuedAt: normalizeText(metadata.wizard_generation_queued_at) || null,
    startedAt: normalizeText(metadata.wizard_generation_started_at) || null,
    completedAt: normalizeText(metadata.wizard_completed_at) || null,
    failedAt: normalizeText(metadata.wizard_generation_failed_at) || null,
    error: normalizeText(metadata.wizard_generation_last_error) || null,
    errorCode: normalizeText(metadata.wizard_generation_last_error_code) || null,
    generatedRowCount: Number(metadata.wizard_generated_row_count ?? 0) || null,
    createdTaskCount: readStringArray(metadata.wizard_created_task_ids).length || null,
    targetFeasibility: metadata.wizard_generation_target_feasibility ?? null,
    durationAssetUtilizationSummary: readMetadataEvidence(metadata.wizard_generation_duration_asset_utilization_summary),
    candidateDurationAssetPreview: readMetadataEvidence(metadata.wizard_generation_candidate_duration_asset_preview),
    candidateNetworkEvaluation: readMetadataEvidence(metadata.wizard_generation_candidate_network_evaluation),
    candidateAcceptancePlanPreview: readMetadataEvidence(metadata.wizard_generation_candidate_acceptance_plan_preview),
    candidateBaseline: readMetadataEvidence(metadata.wizard_generation_candidate_baseline),
    planQualityDiagnostics: readMetadataEvidence(metadata.wizard_generation_plan_quality_diagnostics),
    criticalPathRefresh: readMetadataEvidence(metadata.wizard_generation_critical_path_refresh),
    postCommitDerivations: readMetadataEvidence(metadata.wizard_generation_post_commit_derivations),
  }
}

function parseWizardGenerationTimestamp(value: unknown) {
  const text = normalizeText(value)
  if (!text) return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

function getWizardGenerationRecoveryCandidate(project: Record<string, unknown> | null) {
  if (!project) return null
  const metadata = readRecord(project.metadata)
  const state = normalizeText(metadata.wizard_generation_state)
  if (state !== WIZARD_GENERATION_STATE_RUNNING && state !== WIZARD_GENERATION_STATE_QUEUED) return null
  if (normalizeText(project.status) !== PROJECT_DRAFT_STATUS) return null
  if (project.default_wbs_generated === true) return null
  if (normalizeText(metadata.wizard_completed_at)) return null

  const attemptTimestampField = state === WIZARD_GENERATION_STATE_QUEUED
    ? 'wizard_generation_queued_at'
    : 'wizard_generation_started_at'
  const attemptTimestamp = normalizeText(metadata[attemptTimestampField]) || null
  const attemptTimestampMs = parseWizardGenerationTimestamp(attemptTimestamp)
  const stale = attemptTimestampMs == null || (Date.now() - attemptTimestampMs) >= WIZARD_GENERATION_STALE_WINDOW_MS
  if (!stale) return null

  return {
    metadata,
    state,
    generationBatchId: normalizeText(metadata.wizard_generation_batch_id || metadata.wizard_generation_last_failed_batch_id) || null,
    recoveryReason: attemptTimestampMs == null
      ? state === WIZARD_GENERATION_STATE_QUEUED
        ? 'missing_queued_at'
        : 'missing_started_at'
      : state === WIZARD_GENERATION_STATE_QUEUED
        ? 'stale_queued_attempt'
        : 'stale_running_attempt',
    attemptTimestamp,
  }
}

async function recoverStaleWizardGenerationAttempt(
  projectId: string,
  projectSnapshot?: Record<string, unknown> | null,
) {
  const project = projectSnapshot ?? (await readProjectMetadata(projectId)).project
  const candidate = getWizardGenerationRecoveryCandidate(project)
  if (!candidate) return false

  await cleanupWizardGenerationArtifacts({
    projectId,
    generationBatchId: candidate.generationBatchId,
    generatedBaselineIds: readStringArray(candidate.metadata.wizard_generated_baseline_ids),
    createdTaskIds: readStringArray(candidate.metadata.wizard_created_task_ids),
    materializedObjectIds: readStringArray(candidate.metadata.wizard_materialized_object_ids),
    generatedAcceptancePlanIds: readStringArray(candidate.metadata.wizard_generated_acceptance_plan_ids),
    passedAcceptancePlanIds: readStringArray(candidate.metadata.wizard_passed_acceptance_plan_ids),
    includeGenerationBatchFallback: true,
  })

  await resetWizardGenerationAttempt({
    projectId,
    generationBatchId: candidate.generationBatchId,
    error: {
      code: 'WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED',
      details: {
        staleState: candidate.state,
        recoveryReason: candidate.recoveryReason,
        staleAttemptTimestamp: candidate.attemptTimestamp,
      },
      message: 'Recovered a stale wizard generation attempt and reset the draft for a fresh retry.',
    },
  })

  logger.warn('[projectWizard] recovered stale wizard generation attempt before retrying commit', {
    projectId,
    staleState: candidate.state,
    generationBatchId: candidate.generationBatchId,
    recoveryReason: candidate.recoveryReason,
    attemptTimestamp: candidate.attemptTimestamp,
  })
  return true
}

async function readProjectMetadataWithStaleWizardRecovery(projectId: string) {
  const snapshot = await readProjectMetadata(projectId)
  const recovered = await recoverStaleWizardGenerationAttempt(projectId, snapshot.project)
  if (!recovered) return snapshot
  return readProjectMetadata(projectId)
}

async function beginWizardGenerationAttempt(params: {
  projectId: string
  generationBatchId: string
  attemptId: string
}) {
  const tryBeginAttempt = async () => {
    const ts = now()
    return rawQuery(
      `UPDATE projects
       SET metadata = CASE WHEN metadata IS NULL THEN $2::jsonb ELSE metadata || $2::jsonb END,
           updated_at = $3
       WHERE id = $1
         AND status = $4
         AND default_wbs_generated IS NOT TRUE
         AND (metadata->>'wizard_generation_state') IS DISTINCT FROM $5
         AND metadata->>'wizard_completed_at' IS NULL
       RETURNING id`,
      [
        params.projectId,
        JSON.stringify({
          wizard_generation_state: WIZARD_GENERATION_STATE_RUNNING,
          wizard_generation_batch_id: params.generationBatchId,
          wizard_generation_attempt_id: params.attemptId,
          wizard_generation_started_at: ts,
        }),
        ts,
        PROJECT_DRAFT_STATUS,
        WIZARD_GENERATION_STATE_RUNNING,
      ],
    )
  }

  let result = await tryBeginAttempt()
  if (result.rows.length > 0) return

  const recovered = await recoverStaleWizardGenerationAttempt(params.projectId)
  if (recovered) {
    result = await tryBeginAttempt()
    if (result.rows.length > 0) return
  }

  throw Object.assign(new Error('Wizard generation is already running or has been committed.'), {
    statusCode: 409,
    code: 'WIZARD_GENERATION_NOT_REENTRANT',
  })
}

async function resetWizardGenerationAttempt(params: {
  projectId: string
  generationBatchId?: string | null
  error?: unknown
}) {
  const ts = now()
  const { metadata } = await readProjectMetadata(params.projectId)
  const errorRecord = readRecord(params.error)
  const errorCode = normalizeText(errorRecord.code)
  const errorDetails = readRecord(errorRecord.details)
  await updateProjectMetadata({
    projectId: params.projectId,
    updatedAt: ts,
    status: PROJECT_DRAFT_STATUS,
    defaultWbsGenerated: false,
    metadata: mergeRecords(omitRecordKeys(metadata, [
      'wizard_generation_state',
      'wizard_generation_attempt_id',
      'wizard_generation_started_at',
      'wizard_generation_queued_at',
      'wizard_generated_baseline_ids',
      'wizard_generation_candidate_baseline',
      'wizard_created_task_ids',
      'wizard_materialized_object_ids',
      'wizard_generated_acceptance_plan_ids',
      'wizard_passed_acceptance_plan_ids',
    ]), {
        wizard_generation_state: WIZARD_GENERATION_STATE_FAILED,
        wizard_generation_failed_at: ts,
        ...(params.generationBatchId ? { wizard_generation_last_failed_batch_id: params.generationBatchId } : {}),
        ...(params.error instanceof Error ? { wizard_generation_last_error: params.error.message } : {}),
        ...(errorCode ? { wizard_generation_last_error_code: errorCode } : {}),
        ...(Object.keys(errorDetails).length > 0 ? { wizard_generation_last_error_details: errorDetails } : {}),
      }),
  })
}

async function cleanupWizardGenerationArtifacts(target: WizardGenerationCleanupTarget) {
  const baselineIds = [...new Set(target.generatedBaselineIds ?? [])].filter(Boolean)
  const taskIds = [...new Set(target.createdTaskIds ?? [])].filter(Boolean)
  const objectIds = [...new Set(target.materializedObjectIds ?? [])].filter(Boolean)
  const acceptancePlanIds = mergeWizardAcceptancePlanIds({
    generatedAcceptancePlanIds: target.generatedAcceptancePlanIds,
    passedAcceptancePlanIds: target.passedAcceptancePlanIds,
  })
  const generationBatchId = normalizeText(target.generationBatchId)
  const acceptanceNotePattern = generationBatchId ? `%[wizard_generation_batch_id:${generationBatchId}]%` : ''

  if (baselineIds.length > 0) {
    for (const baselineIdChunk of chunkWizardArtifactIds(baselineIds)) {
      await rawQuery(
        `DELETE FROM task_baselines
         WHERE project_id = $1
           AND id = ANY($2::uuid[])
           AND status = 'draft'`,
        [target.projectId, baselineIdChunk],
      )
    }
  } else if (generationBatchId && target.includeGenerationBatchFallback) {
    await rawQuery(
      `DELETE FROM task_baselines
       WHERE project_id = $1
         AND status = 'draft'
         AND COALESCE(governance_metadata, '{}'::jsonb)->'wizardGeneration'->>'generationBatchId' = $2`,
      [target.projectId, generationBatchId],
    )
  }

  if (baselineIds.length > 0) {
    await assertWizardGeneratedBaselinesRemainRollbackable(target.projectId, baselineIds)
  }

  if (generationBatchId && target.includeGenerationBatchFallback) {
    await rawQuery(
      `DELETE FROM project_entity_links link
       WHERE link.project_id = $1
         AND link.source_entity_type = 'acceptance_plan'
         AND link.target_entity_type = 'task'
         AND link.relation_type = 'covers_task'
         AND (
           COALESCE(link.metadata, '{}'::jsonb)->'wizardGeneration'->>'generationBatchId' = $2
           OR EXISTS (
             SELECT 1
               FROM acceptance_plans plan
              WHERE plan.project_id = link.project_id
                AND plan.id::text = link.source_entity_id
                AND plan.notes LIKE $3
           )
           OR EXISTS (
             SELECT 1
               FROM tasks task
              WHERE task.project_id = link.project_id
                AND task.id::text = link.target_entity_id
                AND (
                  COALESCE(task.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
                  OR COALESCE(task.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
                )
           )
         )`,
      [target.projectId, generationBatchId, acceptanceNotePattern],
    )
  }

  for (const acceptancePlanIdChunk of chunkWizardArtifactIds(acceptancePlanIds)) {
    await rawQuery(
      `DELETE FROM project_entity_links
       WHERE project_id = $1
         AND source_entity_type = 'acceptance_plan'
         AND source_entity_id = ANY($2::text[])
         AND target_entity_type = 'task'
         AND relation_type = 'covers_task'`,
      [target.projectId, acceptancePlanIdChunk],
    )
  }

  for (const taskIdChunk of chunkWizardArtifactIds(taskIds)) {
    await rawQuery(
      `DELETE FROM project_entity_links
       WHERE project_id = $1
         AND source_entity_type = 'acceptance_plan'
         AND target_entity_type = 'task'
         AND target_entity_id = ANY($2::text[])
         AND relation_type = 'covers_task'`,
      [target.projectId, taskIdChunk],
    )
  }

  if (acceptancePlanIds.length > 0) {
    for (const acceptancePlanIdChunk of chunkWizardArtifactIds(acceptancePlanIds)) {
      if (target.includeGenerationBatchFallback && generationBatchId) {
        await rawQuery(
          `DELETE FROM acceptance_plans
           WHERE project_id = $1
             AND (
               id = ANY($3::uuid[])
               OR ($2::text <> '' AND notes LIKE $4)
             )`,
          [target.projectId, generationBatchId, acceptancePlanIdChunk, acceptanceNotePattern],
        )
      } else {
        await rawQuery(
          `DELETE FROM acceptance_plans
           WHERE project_id = $1
             AND id = ANY($2::uuid[])`,
          [target.projectId, acceptancePlanIdChunk],
        )
      }
    }
  } else if (generationBatchId) {
    await rawQuery(
      `DELETE FROM acceptance_plans
       WHERE project_id = $1
         AND notes LIKE $2`,
      [target.projectId, acceptanceNotePattern],
    )
  }

  if (taskIds.length > 0 || generationBatchId) {
    if (taskIds.length > 0) {
      for (const taskIdChunk of chunkWizardArtifactIds(taskIds)) {
        if (target.includeGenerationBatchFallback && generationBatchId) {
          await rawQuery(
            `DELETE FROM task_dependencies
             WHERE project_id = $1
               AND $2::text = $2::text
               AND task_id = ANY($3::uuid[])`,
            [target.projectId, generationBatchId, taskIdChunk],
          )
          await rawQuery(
            `DELETE FROM task_dependencies
             WHERE project_id = $1
               AND $2::text = $2::text
               AND dependency_task_id = ANY($3::uuid[])`,
            [target.projectId, generationBatchId, taskIdChunk],
          )
          await rawQuery(
            `DELETE FROM tasks
             WHERE project_id = $1
               AND $2::text = $2::text
               AND id = ANY($3::uuid[])`,
            [target.projectId, generationBatchId, taskIdChunk],
          )
        } else {
          await rawQuery(
            `DELETE FROM task_dependencies
             WHERE project_id = $1
               AND task_id = ANY($2::uuid[])`,
            [target.projectId, taskIdChunk],
          )
          await rawQuery(
            `DELETE FROM task_dependencies
             WHERE project_id = $1
               AND dependency_task_id = ANY($2::uuid[])`,
            [target.projectId, taskIdChunk],
          )
          await rawQuery(
            `DELETE FROM tasks
             WHERE project_id = $1
               AND id = ANY($2::uuid[])`,
            [target.projectId, taskIdChunk],
          )
        }
      }
      if (target.includeGenerationBatchFallback && generationBatchId) {
        await rawQuery(
          `DELETE FROM task_dependencies td
           WHERE td.project_id = $1
             AND EXISTS (
               SELECT 1
                 FROM tasks t
                WHERE t.project_id = td.project_id
                  AND t.id = td.task_id
                  AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
             )`,
          [target.projectId, generationBatchId],
        )
        await rawQuery(
          `DELETE FROM task_dependencies td
           WHERE td.project_id = $1
             AND EXISTS (
               SELECT 1
                 FROM tasks t
                WHERE t.project_id = td.project_id
                  AND t.id = td.dependency_task_id
                  AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
             )`,
          [target.projectId, generationBatchId],
        )
        await rawQuery(
          `DELETE FROM task_dependencies td
           WHERE td.project_id = $1
             AND EXISTS (
               SELECT 1
                 FROM tasks t
                WHERE t.project_id = td.project_id
                  AND t.id = td.task_id
                  AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
             )`,
          [target.projectId, generationBatchId],
        )
        await rawQuery(
          `DELETE FROM task_dependencies td
           WHERE td.project_id = $1
             AND EXISTS (
                SELECT 1
                  FROM tasks t
                 WHERE t.project_id = td.project_id
                   AND t.id = td.dependency_task_id
                   AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
             )`,
          [target.projectId, generationBatchId],
        )
        await rawQuery(
          `DELETE FROM tasks
           WHERE project_id = $1
             AND COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2`,
          [target.projectId, generationBatchId],
        )
        await rawQuery(
          `DELETE FROM tasks
           WHERE project_id = $1
             AND COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2`,
          [target.projectId, generationBatchId],
        )
      }
    } else if (generationBatchId) {
      await rawQuery(
        `DELETE FROM task_dependencies td
         WHERE td.project_id = $1
           AND EXISTS (
             SELECT 1
               FROM tasks t
              WHERE t.project_id = td.project_id
                AND t.id = td.task_id
                AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
           )`,
        [target.projectId, generationBatchId],
      )
      await rawQuery(
        `DELETE FROM task_dependencies td
         WHERE td.project_id = $1
           AND EXISTS (
             SELECT 1
               FROM tasks t
              WHERE t.project_id = td.project_id
                AND t.id = td.dependency_task_id
                AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
           )`,
        [target.projectId, generationBatchId],
      )
      await rawQuery(
        `DELETE FROM task_dependencies td
         WHERE td.project_id = $1
           AND EXISTS (
             SELECT 1
               FROM tasks t
              WHERE t.project_id = td.project_id
                AND t.id = td.task_id
                AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
           )`,
        [target.projectId, generationBatchId],
      )
      await rawQuery(
        `DELETE FROM task_dependencies td
         WHERE td.project_id = $1
           AND EXISTS (
              SELECT 1
                FROM tasks t
               WHERE t.project_id = td.project_id
                 AND t.id = td.dependency_task_id
                 AND COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
            )`,
        [target.projectId, generationBatchId],
      )
      await rawQuery(
        `DELETE FROM tasks
         WHERE project_id = $1
           AND (
             COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
             OR COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
           )`,
        [target.projectId, generationBatchId],
      )
    }
  }

  if (objectIds.length > 0) {
    for (const objectIdChunk of chunkWizardArtifactIds(objectIds)) {
      if (target.includeGenerationBatchFallback && generationBatchId) {
        await rawQuery(
          `DELETE FROM engineering_objects
           WHERE project_id = $1
             AND $2::text = $2::text
             AND id = ANY($3::uuid[])`,
          [target.projectId, generationBatchId, objectIdChunk],
        )
      } else {
        await rawQuery(
          `DELETE FROM engineering_objects
           WHERE project_id = $1
             AND id = ANY($2::uuid[])`,
          [target.projectId, objectIdChunk],
        )
      }
    }
    if (target.includeGenerationBatchFallback && generationBatchId) {
      await rawQuery(
        `DELETE FROM engineering_objects
         WHERE project_id = $1
           AND COALESCE(metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2`,
        [target.projectId, generationBatchId],
      )
      await rawQuery(
        `DELETE FROM engineering_objects
         WHERE project_id = $1
           AND COALESCE(metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2`,
        [target.projectId, generationBatchId],
      )
    }
  } else if (generationBatchId) {
    await rawQuery(
      `DELETE FROM engineering_objects
       WHERE project_id = $1
         AND (
           COALESCE(metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
           OR COALESCE(metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
         )`,
      [target.projectId, generationBatchId],
    )
  }
}

function buildGeneratedTaskSignature(task: Record<string, unknown>) {
  const metadata = readRecord(task.standard_task_metadata)
  return [
    normalizeText(task.template_node_id),
    normalizeText(task.standard_work_code),
    normalizeText(task.standard_work_name),
    normalizeText(task.wbs_path),
    normalizeText(task.wbs_code),
    normalizeText(task.title),
    normalizeText(task.building_object_id),
    normalizeText(task.basement_object_id),
    normalizeText(task.floor_object_id),
    normalizeText(task.physical_zone_object_id),
    normalizeText(task.functional_area_object_id),
    normalizeText(metadata.standardWorkCode ?? metadata.standard_work_code),
    normalizeText(metadata.scopePath ?? metadata.scope_path),
    normalizeText(metadata.wizardScopeNodeId ?? metadata.wizard_scope_node_id),
  ].join('|')
}

function countDuplicateGeneratedTaskSignatures(tasks: Record<string, unknown>[]) {
  const seen = new Set<string>()
  let duplicateCount = 0
  for (const task of tasks) {
    const signature = buildGeneratedTaskSignature(task)
    if (!signature.replace(/\|/g, '').trim()) continue
    if (seen.has(signature)) {
      duplicateCount += 1
    } else {
      seen.add(signature)
    }
  }
  return duplicateCount
}

async function readWizardArtifactInventory(projectId: string): Promise<WizardArtifactInventory | null> {
  const projectResult = await rawQuery(
    'SELECT id, status, metadata FROM projects WHERE id = $1',
    [projectId],
  )
  const project = (projectResult.rows[0] as Record<string, unknown> | undefined) ?? null
  if (!project) return null

  const metadata = readRecord(project.metadata)
  const generationBatchId = normalizeText(metadata.wizard_generation_batch_id || metadata.wizard_generation_last_failed_batch_id)
  const generatedBaselineIds = readStringArray(metadata.wizard_generated_baseline_ids)
  const createdTaskIds = readStringArray(metadata.wizard_created_task_ids)
  const materializedObjectIds = readStringArray(metadata.wizard_materialized_object_ids)
  const generatedAcceptancePlanIds = readStringArray(metadata.wizard_generated_acceptance_plan_ids)
  const passedAcceptancePlanIds = readStringArray(metadata.wizard_passed_acceptance_plan_ids)
  const acceptancePlanIds = mergeWizardAcceptancePlanIds({
    generatedAcceptancePlanIds,
    passedAcceptancePlanIds,
  })
  const wizardGenerationState = normalizeText(metadata.wizard_generation_state) || null
  const wizardGenerationLastError = normalizeText(metadata.wizard_generation_last_error) || null
  const wizardGenerationLastErrorCode = normalizeText(metadata.wizard_generation_last_error_code) || null
  const hasPreciseArtifactIds = generatedBaselineIds.length > 0
    || createdTaskIds.length > 0
    || materializedObjectIds.length > 0
    || acceptancePlanIds.length > 0
  if (!hasPreciseArtifactIds && ['queued', 'running', 'failed'].includes(normalizeText(wizardGenerationState))) {
    return {
      projectId: normalizeText(project.id) || null,
      projectStatus: normalizeText(project.status) || null,
      wizardGenerationBatchId: generationBatchId || null,
      wizardGenerationState,
      wizardGenerationLastError,
      wizardGenerationLastErrorCode,
      generatedTaskCount: 0,
      generatedPrimaryScheduleTaskCount: 0,
      generatedPrimaryScheduleExecutableTaskCount: 0,
      generatedPrimaryScheduleRecordOnlyTaskCount: 0,
      generatedNonPrimaryTaskCount: 0,
      generationBatchIds: generationBatchId ? [generationBatchId] : [],
      duplicateGeneratedTaskSignatureCount: 0,
      candidateBaselinesRemaining: 0,
      candidateBaselineDraftCount: 0,
      candidateBaselineIds: [],
      candidateBaselineStatuses: [],
      candidateBaselineItemCount: 0,
      candidateBaselineMappedItemCount: 0,
      candidateBaselineUnmappedItemCount: 0,
      dependenciesRemaining: 0,
      acceptancePlansRemaining: 0,
      engineeringObjectsRemaining: 0,
    }
  }
  let generatedTaskCount = 0
  let generatedPrimaryScheduleTaskCount = 0
  let generatedPrimaryScheduleExecutableTaskCount = 0
  let generatedPrimaryScheduleRecordOnlyTaskCount = 0
  let generationBatchIds: string[] = []
  let duplicateGeneratedTaskSignatureCount = 0
  if (createdTaskIds.length > 0) {
    const taskSummary = await summarizeWizardTasksByIdChunks(projectId, createdTaskIds)
    generatedTaskCount = taskSummary.generatedTaskCount
    generatedPrimaryScheduleTaskCount = taskSummary.generatedPrimaryScheduleTaskCount
    generatedPrimaryScheduleExecutableTaskCount = taskSummary.generatedPrimaryScheduleExecutableTaskCount
    generatedPrimaryScheduleRecordOnlyTaskCount = taskSummary.generatedPrimaryScheduleRecordOnlyTaskCount
    generationBatchIds = generationBatchId ? [generationBatchId] : []
    duplicateGeneratedTaskSignatureCount = 0
  } else {
    const taskResult = await rawQuery(
      `SELECT id, template_node_id, standard_work_code, standard_work_name, wbs_path, wbs_code,
              title, building_object_id, basement_object_id, floor_object_id,
              physical_zone_object_id, functional_area_object_id, is_executable, standard_task_metadata
         FROM tasks
        WHERE project_id = $1
          AND (
            (
              $2::text <> ''
              AND (
                COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
                OR COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
              )
            )
            OR (
              $2::text = ''
              AND (
                COALESCE(standard_task_metadata, '{}'::jsonb) ? 'wizardGenerationBatchId'
                OR COALESCE(standard_task_metadata, '{}'::jsonb) ? 'wizard_generation_batch_id'
              )
            )
          )`,
      [projectId, generationBatchId],
    )
    const taskRows = taskResult.rows as Record<string, unknown>[]
    const batchIdSet = new Set<string>()
    for (const task of taskRows) {
      const taskMetadata = readRecord(task.standard_task_metadata)
      const batchId = normalizeText(taskMetadata.wizardGenerationBatchId ?? taskMetadata.wizard_generation_batch_id)
      if (batchId) batchIdSet.add(batchId)
    }
    generatedTaskCount = taskRows.length
    const primaryScheduleTaskRows = taskRows.filter(isWizardPrimaryScheduleTaskRow)
    generatedPrimaryScheduleTaskCount = primaryScheduleTaskRows.length
    generatedPrimaryScheduleExecutableTaskCount = primaryScheduleTaskRows
      .filter((task) => isTruthyFlag(task.is_executable))
      .length
    generatedPrimaryScheduleRecordOnlyTaskCount = primaryScheduleTaskRows
      .filter((task) => {
        const taskMetadata = readRecord(task.standard_task_metadata)
        return normalizeText(
          taskMetadata.durationContributionMode ?? taskMetadata.duration_contribution_mode,
        ) === 'record_only'
      })
      .length
    generationBatchIds = [...batchIdSet]
    duplicateGeneratedTaskSignatureCount = countDuplicateGeneratedTaskSignatures(taskRows)
  }

  const candidateBaselineResult = generatedBaselineIds.length > 0
    ? await rawQuery(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count,
              COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[]) AS baseline_ids,
              COALESCE(array_agg(DISTINCT status), ARRAY[]::varchar[]) AS statuses
         FROM task_baselines
        WHERE project_id = $1
          AND id = ANY($2::uuid[])`,
      [projectId, generatedBaselineIds],
    )
    : generationBatchId
    ? await rawQuery(
      `SELECT COUNT(*)::int AS count,
              COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count,
              COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[]) AS baseline_ids,
              COALESCE(array_agg(DISTINCT status), ARRAY[]::varchar[]) AS statuses
         FROM task_baselines
        WHERE project_id = $1
          AND COALESCE(governance_metadata, '{}'::jsonb)->'wizardGeneration'->>'generationBatchId' = $2`,
      [projectId, generationBatchId],
    )
    : null
  const candidateBaselineSummary = readRecord(candidateBaselineResult?.rows[0])
  const candidateBaselinesRemaining = Number(candidateBaselineSummary.count ?? 0)
  const candidateBaselineDraftCount = Number(candidateBaselineSummary.draft_count ?? 0)
  const candidateBaselineIds = readStringArray(candidateBaselineSummary.baseline_ids)
  const candidateBaselineStatuses = readStringArray(candidateBaselineSummary.statuses)
  const candidateBaselineItemResult = candidateBaselineIds.length > 0
    ? await rawQuery(
      `SELECT COUNT(*)::int AS item_count,
              COUNT(*) FILTER (
                WHERE source_task_id IS NOT NULL
                  AND mapping_status = 'mapped'
              )::int AS mapped_item_count
         FROM task_baseline_items
        WHERE project_id = $1
          AND baseline_version_id = ANY($2::uuid[])`,
      [projectId, candidateBaselineIds],
    )
    : null
  const candidateBaselineItemSummary = readRecord(candidateBaselineItemResult?.rows[0])
  const candidateBaselineItemCount = Number(candidateBaselineItemSummary.item_count ?? 0)
  const candidateBaselineMappedItemCount = Number(candidateBaselineItemSummary.mapped_item_count ?? 0)

  const dependenciesRemaining = createdTaskIds.length > 0
    ? await countDistinctWizardRowsByIdChunks(
      `SELECT td.id::text AS id
         FROM task_dependencies td
        WHERE td.project_id = $1
          AND (
            td.task_id = ANY($2::uuid[])
            OR td.dependency_task_id = ANY($2::uuid[])
          )`,
      projectId,
      createdTaskIds,
    )
    : generationBatchId
    ? await rawQuery(
      `SELECT COUNT(*)::int AS count
         FROM task_dependencies td
        WHERE td.project_id = $1
          AND EXISTS (
            SELECT 1
              FROM tasks t
             WHERE t.project_id = td.project_id
               AND (t.id = td.task_id OR t.id = td.dependency_task_id)
               AND (
                 COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
                 OR COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
               )
          )`,
      [projectId, generationBatchId],
    )
    : 0

  const acceptanceNotePattern = generationBatchId ? `%[wizard_generation_batch_id:${generationBatchId}]%` : ''
  const acceptancePlansRemaining = acceptancePlanIds.length > 0
    ? await countWizardRowsByIdChunks(
      `SELECT COUNT(*)::int AS count
         FROM acceptance_plans
        WHERE project_id = $1
          AND id = ANY($2::uuid[])`,
      projectId,
      acceptancePlanIds,
    )
    : generationBatchId
    ? await rawQuery(
      `SELECT COUNT(*)::int AS count
         FROM acceptance_plans
        WHERE project_id = $1
          AND notes LIKE $2`,
      [projectId, acceptanceNotePattern],
    )
    : 0

  const engineeringObjectsRemaining = materializedObjectIds.length > 0
    ? await countWizardRowsByIdChunks(
      `SELECT COUNT(*)::int AS count
         FROM engineering_objects
        WHERE project_id = $1
          AND id = ANY($2::uuid[])`,
      projectId,
      materializedObjectIds,
    )
    : generationBatchId
    ? await rawQuery(
      `SELECT COUNT(*)::int AS count
         FROM engineering_objects
        WHERE project_id = $1
          AND (
            COALESCE(metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
            OR COALESCE(metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
          )`,
      [projectId, generationBatchId],
    )
    : 0

  return {
    projectId: normalizeText(project.id) || null,
    projectStatus: normalizeText(project.status) || null,
    wizardGenerationBatchId: generationBatchId || null,
    wizardGenerationState,
    wizardGenerationLastError,
    wizardGenerationLastErrorCode,
    generatedTaskCount,
    generatedPrimaryScheduleTaskCount,
    generatedPrimaryScheduleExecutableTaskCount,
    generatedPrimaryScheduleRecordOnlyTaskCount,
    generatedNonPrimaryTaskCount: Math.max(0, generatedTaskCount - generatedPrimaryScheduleTaskCount),
    generationBatchIds,
    duplicateGeneratedTaskSignatureCount,
    candidateBaselinesRemaining,
    candidateBaselineDraftCount,
    candidateBaselineIds,
    candidateBaselineStatuses,
    candidateBaselineItemCount,
    candidateBaselineMappedItemCount,
    candidateBaselineUnmappedItemCount: Math.max(0, candidateBaselineItemCount - candidateBaselineMappedItemCount),
    dependenciesRemaining: typeof dependenciesRemaining === 'number'
      ? dependenciesRemaining
      : Number(dependenciesRemaining.rows[0]?.count ?? 0),
    acceptancePlansRemaining: typeof acceptancePlansRemaining === 'number'
      ? acceptancePlansRemaining
      : Number(acceptancePlansRemaining.rows[0]?.count ?? 0),
    engineeringObjectsRemaining: typeof engineeringObjectsRemaining === 'number'
      ? engineeringObjectsRemaining
      : Number(engineeringObjectsRemaining.rows[0]?.count ?? 0),
  }
}

async function rollbackWizardGeneratedArtifacts(projectId: string) {
  const result = await rawQuery(
    'SELECT id, metadata FROM projects WHERE id = $1',
    [projectId],
  )
  const project = (result.rows[0] as Record<string, unknown> | undefined) ?? null
  const metadata = readRecord(project?.metadata)
  const generationBatchId = normalizeText(metadata.wizard_generation_batch_id || metadata.wizard_generation_last_failed_batch_id)
  const generatedBaselineIds = readStringArray(metadata.wizard_generated_baseline_ids)
  await assertWizardGeneratedBaselinesRemainRollbackable(projectId, generatedBaselineIds)
  await cleanupWizardGenerationArtifacts({
    projectId,
    generationBatchId,
    generatedBaselineIds,
    createdTaskIds: readStringArray(metadata.wizard_created_task_ids),
    materializedObjectIds: readStringArray(metadata.wizard_materialized_object_ids),
    generatedAcceptancePlanIds: readStringArray(metadata.wizard_generated_acceptance_plan_ids),
    passedAcceptancePlanIds: readStringArray(metadata.wizard_passed_acceptance_plan_ids),
  })
}

async function assertWizardGeneratedBaselinesRemainRollbackable(projectId: string, baselineIds: string[]) {
  if (baselineIds.length === 0) return
  const result = await rawQuery(
    `SELECT id, status
       FROM task_baselines
      WHERE project_id = $1
        AND id = ANY($2::uuid[])`,
    [projectId, baselineIds],
  )
  const adoptedBaselines = (result.rows as Record<string, unknown>[]).filter((row) => normalizeText(row.status) !== 'draft')
  if (adoptedBaselines.length === 0) return
  throw Object.assign(new Error('Wizard rollback is not allowed after its candidate baseline has been adopted.'), {
    statusCode: 409,
    code: 'WIZARD_BASELINE_ALREADY_ADOPTED',
    details: {
      baselineIds: adoptedBaselines.map((row) => normalizeText(row.id)).filter(Boolean),
      statuses: [...new Set(adoptedBaselines.map((row) => normalizeText(row.status)).filter(Boolean))],
    },
  })
}

function wizardGenerationInProgressError() {
  return Object.assign(new Error('Wizard generation is in progress. Wait for the generation attempt to finish before deleting or rolling back the draft.'), {
    statusCode: 409,
    code: 'WIZARD_GENERATION_IN_PROGRESS',
  })
}

function assertWizardGenerationNotInProgress(metadata: Record<string, unknown>) {
  const state = normalizeText(metadata.wizard_generation_state)
  if (state === WIZARD_GENERATION_STATE_RUNNING || state === WIZARD_GENERATION_STATE_QUEUED) {
    throw wizardGenerationInProgressError()
  }
}

async function commitWizardGeneration(params: {
  projectId: string
  companyId?: string | null
  payload: z.infer<typeof wizardPayloadSchema>
  actorId?: string | null
  generationAttemptId?: string | null
  diagnosticFailureInjection?: WizardDiagnosticFailureInjection | null
  diagnosticMetadata?: Record<string, unknown> | null
}) {
  assertScopeGenerationReadiness(evaluateScopeGenerationReadiness({
    scopeTree: params.payload.scopeTree,
  }))
  const generationBatchId = uuidv4()
  const generationAttemptId = normalizeText(params.generationAttemptId) || uuidv4()
  const createdTasks: GeneratedTaskRecord[] = []
  const materializedObjectIds: string[] = []
  let generatedAcceptancePlanResult: Awaited<ReturnType<typeof writeWizardGeneratedAcceptancePlans>> = {
    count: 0,
    ids: [],
    materializations: [],
  }
  let passedMilestoneResult: Awaited<ReturnType<typeof writePassedMilestones>> = { count: 0, ids: [] }
  let candidateBaseline: WizardCandidateBaselineDraft | null = null
  let transactionCommitted = false
  const durationLearningProjectCompanyId = normalizeText(params.companyId) || null
  if (!durationLearningProjectCompanyId) {
    throw Object.assign(new Error('Wizard duration learning consumption requires project company scope.'), {
      code: 'WIZARD_DURATION_LEARNING_COMPANY_SCOPE_REQUIRED',
    })
  }
  const generationStartedAt = Date.now()
  let previousStageAt = generationStartedAt
  await beginWizardGenerationAttempt({
    projectId: params.projectId,
    generationBatchId,
    attemptId: generationAttemptId,
  })
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'generation_attempt_started',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
  })

  const transactionClient = await getClient()
  try {
  await transactionClient.query('BEGIN')
  const scopeMaterialization = await materializeWizardScopeTree({
    projectId: params.projectId,
    scopeTree: params.payload.scopeTree,
    actorId: params.actorId,
    generationBatchId,
    transactionClient,
  })
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'scope_materialized',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: { materializedObjectCount: scopeMaterialization.materializedObjects.length },
  })
  materializedObjectIds.push(...scopeMaterialization.materializedObjects.map((object) => object.id).filter(Boolean))
  injectWizardDiagnosticFailureIfRequested({
    injection: params.diagnosticFailureInjection,
    stage: 'after_engineering_objects',
  })
  const materializedPayload = {
    ...params.payload,
    scopeTree: scopeMaterialization.enrichedScopeTree,
  }
  const recommendation = buildTemplateRecommendation(buildProjectGenerationFacts(materializedPayload))
  const operation = buildWizardOperation({
    payload: materializedPayload,
    recommendation,
    generationBatchId,
    generationScope: scopeMaterialization.generationScope,
    diagnosticContext: readWizardDiagnosticContext(params.diagnosticMetadata),
  })
  assertScopeGenerationReadiness(evaluateTriggeredTemplateScopeReadiness({
    recommendation,
    generationScope: scopeMaterialization.generationScope,
    allowIndependentEngineeringZoneVariantCoverage: true,
  }))
  const constructionCalendar = await resolveConstructionCalendarContext({ projectId: params.projectId })
  const operationWithCalendar: PlanningTableOperation = {
    ...operation,
    clientContext: {
      ...readRecord(operation.clientContext),
      constructionCalendar,
    },
  }
  const durationLearningRuntimeQueryExec = async <T = Record<string, unknown>>(
    sql: string,
    queryParams?: unknown[],
  ): Promise<T[]> => {
    const result = await transactionClient.query(sql, queryParams)
    return (result.rows ?? []) as T[]
  }
  const durationRuntimeConsumerObservationQueryExec = createDurationRuntimeConsumerObservationQueryExec(
    durationLearningRuntimeQueryExec,
  )
  const runtimeArtifactPublications: WbsTemplateGenerationRuntimeArtifactPublication[] = []
  const generated = await generateWbsTemplateRows({
    projectId: params.projectId,
    surface: 'task_list',
    runtimeEvidenceMode: 'no_write',
    operation: operationWithCalendar,
    detailLevel: WIZARD_MANAGED_FRONTIER_DETAIL_LEVEL as never,
    onboardingSubstage: materializedPayload.onboardingSubstage ?? null,
    onboardingBatchId: generationBatchId,
    scopeAssignmentRules: recommendation.scopeAssignmentRules,
    diagnosticDurationSuggestionMode: 'fast_template',
    duplicatePolicy: materializedPayload.mode === 'starting_line' ? 'preserve_historical_skip_future' : undefined,
    runtimePublicationQueryExec: durationLearningRuntimeQueryExec,
    runtimeArtifactPublications,
  })
  const durationAssetAdjustedRows = applyWizardDurationAssetPlanDatesToRows(generated.rows, constructionCalendar)
  const candidateNetworkEvaluationBeforeTaskWrite = buildWizardCandidateNetworkEvaluationFromAdjustedRows(
    durationAssetAdjustedRows,
    generated.candidateNetworkEvaluation ?? null,
  )
  const generatedRows = applyWizardCandidateNetworkPlanDatesToRows(
    durationAssetAdjustedRows,
    candidateNetworkEvaluationBeforeTaskWrite,
  )
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'wbs_rows_generated',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: { generatedRowCount: generatedRows.length },
  })
  const commitGovernanceWarnings = Array.isArray(generated.governanceWarnings)
    ? generated.governanceWarnings
      .map(readRecord)
      .filter((warning) => shouldKeepTemplateScopeWarning(warning, recommendation))
    : []
  assertScopeGenerationReadiness(evaluateGeneratedTemplateScopeReadiness({
    governanceWarnings: commitGovernanceWarnings,
  }))
  assertExecutableDefaultMasterPlanAssemblyBeforeTaskWrite({
    defaultPlanOutput: generated.defaultPlanOutput,
    assembly: generated.executableDefaultMasterPlanAssembly,
    generatedRows,
  })
  assertWizardDurationAssetQualityBeforeTaskWrite({
    payload: materializedPayload,
    generatedRows,
  })
  const candidateTargetFeasibility = buildWizardTargetFeasibilityFromAdjustedRows(
    generatedRows,
    generated.rows,
    generated.targetFeasibility ?? null,
    materializedPayload.plannedEndDate,
  )
  assertWizardCandidateNetworkEvidenceBeforeTaskWrite({
    rows: generatedRows,
    candidateNetworkEvaluation: candidateNetworkEvaluationBeforeTaskWrite,
  })
  assertWizardDatedAcceptanceMilestoneBeforeTaskWrite({
    rows: generatedRows,
    plannedEndDate: materializedPayload.plannedEndDate,
    terminalEvent: materializedPayload.terminalEvent,
  })

  const idByClientRowId = new Map<string, string>()
  const generatedParentClientRowIds = new Set(
    generatedRows.map((row) => normalizeText(row.parentClientRowId)).filter(Boolean),
  )
  const taskCreateItems: Array<{
    clientRowId: string
    parentClientRowId?: string | null
    payload: ReturnType<typeof buildGeneratedTaskPayload>
  }> = []
  for (const row of generatedRows) {
    const parentId = row.parentClientRowId ? idByClientRowId.get(row.parentClientRowId) ?? null : null
    const createPayload = buildGeneratedTaskPayload(params.projectId, row, parentId, params.actorId, {
      generationBatchId,
      generationAttemptId,
      scopeFallback: buildGeneratedTaskScopeFallback(scopeMaterialization.generationScope),
      hasChildren: generatedParentClientRowIds.has(row.clientRowId),
    })
    taskCreateItems.push({
      clientRowId: row.clientRowId,
      parentClientRowId: row.parentClientRowId ?? null,
      payload: createPayload as any,
    })
  }
  const createdTaskResults = await createTasksInWizardBatch(taskCreateItems as any, params.actorId, {
    deferPostCreateEffects: true,
    postCreateEffectReason: 'project_wizard_batch_generation',
    trustPrevalidatedScope: true,
    skipStandardInference: true,
    transactionClient,
  })
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'tasks_created',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: { taskCount: createdTaskResults.length },
  })
  for (let index = 0; index < generatedRows.length; index += 1) {
    const row = generatedRows[index]
    const result = createdTaskResults[index]
    const taskId = result.task.id
    idByClientRowId.set(row.clientRowId, taskId)
    createdTasks.push({
      id: taskId,
      title: result.task.title,
      onboardingStageClassification: String(row.values?.onboarding_stage_classification ?? '').trim() || null,
      isHistorical: row.values?.is_historical === true || row.values?.is_historical === 'true',
    })
  }
  const generatedDependencies = generatedRows.flatMap((row) => buildDependencyWrites(row, idByClientRowId))
  if (generatedDependencies.length > 0) {
    await replaceWizardGeneratedTaskDependenciesBatch({
      projectId: params.projectId,
      dependencies: generatedDependencies,
      actorId: params.actorId,
      transactionClient,
    })
  }
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'dependencies_written',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: { dependencyCount: generatedDependencies.length },
  })
  await recordWbsTemplateGenerationRuntimeConsumption({
    queryExec: durationRuntimeConsumerObservationQueryExec,
    projectId: params.projectId,
    generation: generated,
    runtimeArtifactPublications,
    inputTaskIds: [...idByClientRowId.values()],
    inputSubjectIdByClientRowId: idByClientRowId,
    subjectType: 'task',
  })
  await persistDurationLearningRuntimeConsumptions({
    queryExec: durationLearningRuntimeQueryExec,
    build: {
      companyId: durationLearningProjectCompanyId,
      projectId: params.projectId,
      consumerKey: 'projectWizard',
      consumerSurface: 'project_wizard_commit',
      generationBatchId,
      templateIds: generated.templateIds,
      rows: generatedRows,
      runtimeArtifactPublications,
      subjectType: 'task',
      subjectIdByClientRowId: idByClientRowId,
    },
  })
  const generatedTaskIds = Array.from(idByClientRowId.values())
  const durationLearningEvidenceEvents = buildGeneratedDurationPredictionOutboxEvents({
    companyId: durationLearningProjectCompanyId,
    projectId: params.projectId,
    generationBatchId,
    rows: generatedRows,
    runtimeArtifactPublications,
    subjectType: 'task',
    subjectIdByClientRowId: idByClientRowId,
  })
  const wbsCandidateAnchorTaskId = generatedTaskIds[0]
  if (wbsCandidateAnchorTaskId) {
    durationLearningEvidenceEvents.push(buildWbsCandidateOutboxEvent({
      companyId: durationLearningProjectCompanyId,
      projectId: params.projectId,
      subjectType: 'task',
      subjectId: wbsCandidateAnchorTaskId,
      runtimeArtifactPublications,
      candidate: {
        companyId: durationLearningProjectCompanyId,
        projectId: params.projectId,
        surface: 'task_list',
        generationBatchId,
        templateId: generated.templateId,
        selectedNodeIds: readStringArray(operation.selectedNodeIds),
        scope: readRecord(operation.scope),
        generatedRowCount: generated.rows.length,
        retainedRowCount: generatedRows.length,
        rejectedRowCount: Math.max(0, generated.rows.length - generatedRows.length),
        generatedEntityIds: generatedTaskIds,
        durationCandidateNodes: buildSpecialWorkDurationCandidateNodes(generatedRows),
        actorId: params.actorId,
        metadata: {
          generationDepth: generated.generationDepth,
          source: 'project_wizard_commit',
          durationAssetUtilizationSummary: generated.durationAssetUtilizationSummary ?? null,
        },
        scheduleTrustGate: generated.scheduleTrustGate,
      },
    }))
  }
  await enqueueDurationLearningRuntimeEvidenceBatch({
    queryExec: durationLearningRuntimeQueryExec,
    events: durationLearningEvidenceEvents,
  })
  injectWizardDiagnosticFailureIfRequested({
    injection: params.diagnosticFailureInjection,
    stage: 'after_tasks',
  })

  generatedAcceptancePlanResult = await writeWizardGeneratedAcceptancePlans({
    projectId: params.projectId,
    rows: generatedRows,
    idByClientRowId,
    actorId: params.actorId,
    generationBatchId,
    plannedEndDate: materializedPayload.plannedEndDate,
    terminalEvent: materializedPayload.terminalEvent,
    transactionClient,
  })
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'generated_acceptance_plans_written',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: { generatedAcceptancePlanCount: generatedAcceptancePlanResult.count },
  })
  passedMilestoneResult = await writePassedMilestones({
    projectId: params.projectId,
    payload: materializedPayload,
    actorId: params.actorId,
    generationBatchId,
    transactionClient,
  })
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'passed_milestones_written',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: {
      generatedAcceptancePlanCount: generatedAcceptancePlanResult.count,
      passedMilestoneCount: passedMilestoneResult.count,
    },
  })
  injectWizardDiagnosticFailureIfRequested({
    injection: params.diagnosticFailureInjection,
    stage: 'after_dependencies_or_acceptance_plans',
  })
  const passedMilestoneCount = passedMilestoneResult.count
  const targetFeasibility = mapTargetFeasibilityToTaskIds(candidateTargetFeasibility, idByClientRowId)
  const durationAssetUtilizationSummary = generated.durationAssetUtilizationSummary ?? null
  const durationAssetConsumptionReceipts = Array.isArray(generated.durationAssetConsumptionReceipts)
    ? generated.durationAssetConsumptionReceipts.map((receipt) => ({
        ...receipt,
        targetRowIds: Array.isArray(receipt.targetRowIds)
          ? receipt.targetRowIds.map((rowId) => idByClientRowId.get(rowId) ?? rowId)
          : [],
      }))
    : []
  const durationAssetConsumptionSummary = generated.durationAssetConsumptionSummary ?? null
  const executableDefaultMasterPlanAssembly = generated.executableDefaultMasterPlanAssembly ?? null
  const candidateDurationAssetPreview = buildCandidateDurationAssetPreview(generatedRows, idByClientRowId)
  const candidateNetworkEvaluation = mapWizardCandidateNetworkEvaluationToTaskIds(
    candidateNetworkEvaluationBeforeTaskWrite,
    idByClientRowId,
  )
  const candidateAcceptancePlanPreview = buildCandidateAcceptancePlanPreview(generatedRows, {
    plannedEndDate: materializedPayload.plannedEndDate,
    terminalEvent: materializedPayload.terminalEvent,
    materializations: generatedAcceptancePlanResult.materializations,
    materializationRequiredForPlanConsistency: true,
  })
  const commercialProjectGenerationFacts = buildProjectGenerationFacts(materializedPayload)
  const projectGenerationFacts = buildProjectGenerationFactsSnapshot(commercialProjectGenerationFacts)
  const constructionAssumptionScopeCoverageDiagnostics = buildScopeCoverageDiagnostics(
    materializedPayload,
    commercialProjectGenerationFacts,
  )
  const constructionAssumptionScopeTemplateCoverage = evaluateScopeTemplateCoverage({
    generationScope: scopeMaterialization.generationScope,
    scopeAssignmentRules: recommendation.scopeAssignmentRules,
    governanceWarnings: commitGovernanceWarnings,
  })
  const commercialFactReadiness = buildCommercialFactReadiness({
    facts: commercialProjectGenerationFacts,
    generationScope: scopeMaterialization.generationScope,
    scopeCoverageDiagnostics: constructionAssumptionScopeCoverageDiagnostics,
    scopeTemplateCoverage: constructionAssumptionScopeTemplateCoverage,
    wbsReadinessIssues: [],
  })
  const planQualityDiagnostics = buildWizardPlanQualityDiagnostics({
    targetFeasibility,
    durationAssetUtilizationSummary,
    candidateDurationAssetPreview,
    candidateNetworkEvaluation,
    candidateAcceptancePlanPreview,
    commercialFactReadiness,
  })
  const ts = now()
  candidateBaseline = await createWizardCandidateBaselineDraft({
    transactionClient,
    projectId: params.projectId,
    projectName: materializedPayload.projectName,
    businessType: recommendation.businessType,
    generationBatchId,
    rows: generatedRows,
    sourceTaskIdByClientRowId: idByClientRowId,
    durationAssetUtilizationSummary,
    candidateNetworkEvaluation,
    capturedAt: ts,
  })
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'candidate_baseline_written',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: {
      baselineId: candidateBaseline.baselineId,
      baselineItemCount: candidateBaseline.itemCount,
    },
  })
  const satisfiedConditionCount = materializedPayload.mode === 'starting_line'
    ? await markHistoricalTaskConditionsSatisfied({
      projectId: params.projectId,
      tasks: createdTasks,
      actorId: params.actorId,
      transactionClient,
    })
    : 0
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'historical_conditions_satisfied',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
    extra: { satisfiedConditionCount },
  })
  const pendingPostCommitDerivations = createPendingWizardPostCommitDerivationState({
    projectId: params.projectId,
    generationBatchId,
    createdAt: ts,
  })
  const constructionOrganizationScenarioFromFacts = selectConstructionOrganizationScenario(
    buildConstructionOrganizationSelectorInputFromProjectFacts(projectGenerationFacts, {
      projectTypeCode: projectGenerationFacts.businessType,
      onboardingMode: materializedPayload.mode ?? null,
      onboardingSubstage: materializedPayload.mode === 'starting_line' ? materializedPayload.onboardingSubstage ?? null : null,
      onboardingPhaseProgress: materializedPayload.mode === 'starting_line' ? materializedPayload.onboardingPhaseProgress ?? {} : {},
      onboardingPassedMilestones: materializedPayload.mode === 'starting_line' ? materializedPayload.onboardingPassedMilestones ?? [] : [],
    }),
  )
  const constructionOrganizationScenario = extractConstructionOrganizationScenarioSnapshot({
    rows: generatedRows,
    generationBatchId,
    capturedAt: ts,
    mode: materializedPayload.mode ?? 'new',
    fallbackScenario: constructionOrganizationScenarioFromFacts,
  })
  const { project, metadata } = await readProjectMetadata(params.projectId, transactionClient)
  const constructionOrganizationProductOutcomeCloseoutProgress =
    await buildWizardConstructionOrganizationProductOutcomeProgress({
      companyId: project?.company_id as string | null | undefined,
      projectId: params.projectId,
    })
  const constructionOrganizationScenarioSummary = buildConstructionOrganizationScenarioProjectSummary({
    scenario: constructionOrganizationScenario,
    generationBatchId,
    capturedAt: ts,
    mode: materializedPayload.mode ?? 'new',
    productOutcomeCloseoutProgress: constructionOrganizationProductOutcomeCloseoutProgress,
  })
  const constructionOrganizationCandidateAnchorPersistence =
    await persistWizardConstructionOrganizationCandidateAnchors({
      projectId: params.projectId,
      companyId: project?.company_id as string | null | undefined,
      scenario: constructionOrganizationScenario,
      queryExec: async <T = Record<string, unknown>>(sql: string, queryParams?: unknown[]) => {
        const result = await transactionClient.query(sql, queryParams)
        return (result.rows ?? []) as T[]
      },
    })
  await updateProjectMetadata({
    projectId: params.projectId,
    updatedAt: ts,
    status: PROJECT_ACTIVE_STATUS,
    defaultWbsGenerated: true,
    transactionClient,
    metadata: mergeRecords(omitRecordKeys(metadata, [
      'wizard_draft_payload',
      'wizard_draft_step',
      'wizard_draft_updated_at',
      'wizard_generation_failed_at',
      'wizard_generation_last_failed_batch_id',
      'wizard_generation_last_error',
      'wizard_generation_last_error_code',
      'wizard_generation_last_error_details',
    ]), {
        wizard_completed_at: ts,
        wizard_generation_batch_id: generationBatchId,
        wizard_generation_state: WIZARD_GENERATION_STATE_COMPLETED,
        wizard_generation_attempt_id: generationAttemptId,
        wizard_generation_actor_id: params.actorId ?? null,
        wizard_generated_row_count: generatedRows.length,
        wizard_generation_target_feasibility: targetFeasibility,
        wizard_generation_duration_asset_utilization_summary: durationAssetUtilizationSummary,
        wizard_generation_duration_asset_consumption_receipts: durationAssetConsumptionReceipts,
        wizard_generation_duration_asset_consumption_summary: durationAssetConsumptionSummary,
        wizard_generation_post_commit_derivations: pendingPostCommitDerivations,
        wizard_generation_executable_default_master_plan_assembly: executableDefaultMasterPlanAssembly,
        wizard_generation_candidate_duration_asset_preview: candidateDurationAssetPreview,
        wizard_generation_candidate_network_evaluation: candidateNetworkEvaluation,
        wizard_generation_candidate_acceptance_plan_preview: candidateAcceptancePlanPreview,
        wizard_generation_candidate_baseline: candidateBaseline,
        wizard_generation_plan_quality_diagnostics: planQualityDiagnostics,
        wizard_generated_baseline_ids: [candidateBaseline.baselineId],
        wizard_created_task_ids: createdTasks.map((task) => task.id),
        wizard_materialized_object_ids: materializedObjectIds,
        wizard_generated_acceptance_plan_ids: generatedAcceptancePlanResult.ids,
        wizard_passed_acceptance_plan_ids: passedMilestoneResult.ids,
        projectGenerationFacts,
        ...(constructionOrganizationScenario
          ? { constructionOrganizationScenario }
          : {}),
        ...(constructionOrganizationScenarioSummary
          ? { constructionOrganizationScenarioSummary }
          : {}),
        ...(constructionOrganizationCandidateAnchorPersistence
          ? {
              constructionOrganizationCandidateAnchorPersistence: {
                source: 'project_wizard_commit_construction_organization_candidate_anchor_persistence',
                generationBatchId,
                capturedAt: ts,
                persistedEventCount: constructionOrganizationCandidateAnchorPersistence.persistedEventCount,
                eventKeys: constructionOrganizationCandidateAnchorPersistence.events.map((event) => event.eventKey),
                assetKeys: constructionOrganizationCandidateAnchorPersistence.events.map((event) => event.assetKey),
                runtimeEffectPolicy: 'candidate_only',
                mutationBoundary: {
                  writesTaskDependencies: false,
                  writesPlanDates: false,
                  writesBaseline: false,
                  writesSeed: false,
                  writesTaskFacts: false,
                  writesAccelerationDraft: false,
                  writesCriticalPathFacts: false,
                },
                boundaryPolicy: [
                  'candidate_anchor_presence_does_not_claim_runtime_closeout',
                  'runtime_publication_and_site_adoption_still_required',
                  'does_not_write_task_dependencies_or_plan_dates',
                ],
              },
            }
          : {}),
      }),
  })
  await transactionClient.query('COMMIT')
  transactionCommitted = true
  let criticalPathRefresh: ReturnType<typeof buildWizardCriticalPathRefreshSummary> | null = null
  let postCommitDerivations: WizardPostCommitDerivationState = pendingPostCommitDerivations
  try {
    postCommitDerivations = await runWizardPostCommitDerivations({
      state: postCommitDerivations,
      persistState: async (nextState) => {
        await updateProjectMetadata({
          projectId: params.projectId,
          updatedAt: now(),
          metadata: {
            wizard_generation_post_commit_derivations: nextState,
          },
          mergeMetadata: true,
        })
      },
      derivations: {
        critical_path: async () => {
          const summary = await refreshWizardCriticalPathAfterCommit({
            projectId: params.projectId,
            generationBatchId,
          })
          criticalPathRefresh = summary
          if (summary.status === 'failed') {
            throw new Error(normalizeText(summary.error) || 'critical path refresh failed')
          }
          return summary
        },
        duration_evidence: async () => await recordWizardConstructionOrganizationRuntimeEvidence({
          projectId: params.projectId,
          companyId: project?.company_id as string | null | undefined,
          scenario: constructionOrganizationScenario,
          summary: constructionOrganizationScenarioSummary,
          mode: materializedPayload.mode ?? 'new',
          generationBatchId,
          capturedAt: ts,
          actorId: params.actorId ?? null,
        }),
      },
    })
  } catch (error) {
    logger.warn('project wizard post-commit derivation recovery state write failed', {
      projectId: params.projectId,
      generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  try {
    await updateProjectMetadata({
      projectId: params.projectId,
      updatedAt: now(),
      metadata: {
        wizard_generation_post_commit_derivations: postCommitDerivations,
        ...(criticalPathRefresh
          ? { wizard_generation_critical_path_refresh: criticalPathRefresh }
          : {}),
      },
      mergeMetadata: true,
    })
  } catch (error) {
    logger.warn('project wizard post-commit derivation metadata write failed', {
      projectId: params.projectId,
      generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'project_metadata_completed',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
  })
  try {
    await writeChangeLog({
      projectId: params.projectId,
      entityType: 'project',
      entityId: params.projectId,
      actionType: params.payload.mode === 'starting_line' ? 'project_onboarding_committed' : 'project_wizard_committed',
      actionGroup: 'auto',
      fieldName: 'wizard_generation',
      oldValue: null,
      newValue: generationBatchId,
      changeSource: 'algorithm_generated',
      changedBy: params.actorId ?? null,
      metadata: {
        mode: materializedPayload.mode ?? 'new',
        generatedRowCount: generatedRows.length,
        createdTaskCount: createdTasks.length,
        generatedAcceptancePlanCount: generatedAcceptancePlanResult.count,
        passedMilestoneCount,
        satisfiedConditionCount,
        targetFeasibility,
        durationAssetUtilizationSummary,
        durationAssetConsumptionReceipts,
        durationAssetConsumptionSummary,
        executableDefaultMasterPlanAssembly,
        candidateDurationAssetPreview,
        candidateNetworkEvaluation,
        candidateAcceptancePlanPreview,
        candidateBaseline,
        planQualityDiagnostics,
        criticalPathRefresh,
        postCommitDerivations,
        materializedScopeObjectCount: scopeMaterialization.materializedObjects.length,
        constructionOrganizationScenarioSummary,
        ...(constructionOrganizationCandidateAnchorPersistence
          ? {
              constructionOrganizationCandidateAnchorPersistence: {
                persistedEventCount: constructionOrganizationCandidateAnchorPersistence.persistedEventCount,
                assetKeys: constructionOrganizationCandidateAnchorPersistence.events.map((event) => event.assetKey),
                runtimeEffectPolicy: 'candidate_only',
              },
            }
          : {}),
      },
      visibility: 'governance',
    })
  } catch (error) {
    logger.warn('project wizard post-commit change log write failed', {
      projectId: params.projectId,
      generationBatchId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  previousStageAt = logWizardGenerationStageTiming({
    projectId: params.projectId,
    generationBatchId,
    stage: 'change_log_written',
    startedAt: generationStartedAt,
    previousAt: previousStageAt,
  })

  return {
    generationBatchId,
    recommendation,
    generatedRowCount: generatedRows.length,
    createdTaskCount: createdTasks.length,
    createdTasks,
    onboardingSummary: generated.onboardingSummary,
    targetFeasibility,
    durationAssetUtilizationSummary,
    durationAssetConsumptionReceipts,
    durationAssetConsumptionSummary,
    executableDefaultMasterPlanAssembly,
    candidateDurationAssetPreview,
    candidateNetworkEvaluation,
    candidateAcceptancePlanPreview,
    candidateBaseline,
    planQualityDiagnostics,
    criticalPathRefresh,
    postCommitDerivations,
    generatedAcceptancePlanCount: generatedAcceptancePlanResult.count,
    passedMilestoneCount,
    satisfiedConditionCount,
  }
  } catch (error) {
    if (!transactionCommitted) {
      await transactionClient.query('ROLLBACK').catch(() => {})
      await cleanupWizardGenerationArtifacts({
        projectId: params.projectId,
        generationBatchId,
        generatedBaselineIds: candidateBaseline ? [candidateBaseline.baselineId] : [],
        createdTaskIds: createdTasks.map((task) => task.id),
        materializedObjectIds,
        generatedAcceptancePlanIds: generatedAcceptancePlanResult.ids,
        passedAcceptancePlanIds: passedMilestoneResult.ids,
      })
      await resetWizardGenerationAttempt({
        projectId: params.projectId,
        generationBatchId,
        error,
      })
    }
    throw error
  } finally {
    transactionClient.release?.()
  }
}

async function runQueuedWizardGeneration(job: QueuedWizardGeneration) {
  try {
    const generation = await commitWizardGeneration({
      projectId: job.projectId,
      companyId: job.companyId,
      payload: job.payload,
      actorId: job.actorId,
      generationAttemptId: job.attemptId,
    })
    await saveCompanyTemplateIfRequested({
      companyId: job.companyId,
      projectId: job.projectId,
      payload: {
        ...job.payload,
        saveAsCompanyTemplate: job.saveAsCompanyTemplate ?? job.payload.saveAsCompanyTemplate,
      },
      actorId: job.actorId,
      name: job.companyTemplateName ?? undefined,
    })
    logger.info('[projectWizard] async generation completed', {
      projectId: job.projectId,
      attemptId: job.attemptId,
      generatedRowCount: generation.generatedRowCount,
      createdTaskCount: generation.createdTaskCount,
    })
  } catch (error) {
    logger.error('[projectWizard] async generation failed', {
      projectId: job.projectId,
      attemptId: job.attemptId,
      error: serializeWizardGenerationError(error),
    })
  }
}

function enqueueWizardGeneration(job: QueuedWizardGeneration) {
  if (process.env.NODE_ENV === 'test') return
  queueMicrotask(() => {
    void runQueuedWizardGeneration(job)
  })
}

async function handleDraftSave(req: any, res: any) {
  const { id } = req.params
  const body = wizardDraftSchema.parse(req.body)
  const ts = now()
  await assertWizardProjectEditor({
    actorId: req.user?.id,
    projectId: id,
    companyId: getRequestCompanyId(req) || req.user?.currentCompanyId || null,
  })

  const updateResult = await rawQuery(
    `UPDATE projects
     SET metadata = CASE WHEN metadata IS NULL THEN $3::jsonb ELSE metadata || $3::jsonb END,
         updated_at = $4
     WHERE id = $1 AND status = $2
     RETURNING id`,
    [
      id,
      PROJECT_DRAFT_STATUS,
      JSON.stringify({
      wizard_draft_payload: body.wizard_draft_payload,
      wizard_draft_step: body.step,
      wizard_draft_updated_at: ts,
    }),
      ts,
    ],
  )
  const updatedRows = updateResult.rows as Record<string, unknown>[]
  if (updatedRows.length === 0) {
    throw Object.assign(new Error('Wizard draft autosave is only allowed for wizard draft projects.'), {
      statusCode: 409,
      code: 'WIZARD_DRAFT_SAVE_NOT_ALLOWED',
    })
  }

  res.json({ success: true, data: { id, lastSaved: ts, step: body.step }, timestamp: ts } as ApiResponse)
}

async function handleDraftDelete(req: any, res: any) {
  const { id } = req.params
  await assertWizardProjectEditor({
    actorId: req.user?.id,
    projectId: id,
    companyId: getRequestCompanyId(req) || req.user?.currentCompanyId || null,
  })
  const { metadata } = await readProjectMetadataWithStaleWizardRecovery(id)
  assertWizardGenerationNotInProgress(metadata)
  await rawQuery(
    `DELETE FROM projects WHERE id = $1 AND status = $2`,
    [id, PROJECT_DRAFT_STATUS],
  )
  res.status(204).send()
}

async function handleWizardPreview(req: any, res: any) {
  const body = previewSchema.parse(req.body)
  assertWizardGenerationBusinessSubtype(body)
  const routeProjectId = normalizeText(req.params?.id)
  const companyId = getRequestCompanyId(req) || req.user?.currentCompanyId || null
  const ts = now()
  if (routeProjectId) {
    await assertWizardProjectEditor({
      actorId: req.user?.id,
      projectId: routeProjectId,
      companyId,
    })
  }
  const constructionCalendar = routeProjectId
    ? await resolveConstructionCalendarContext({ projectId: routeProjectId })
    : null
  const preview = await buildWizardProfilePreview(
    routeProjectId ? { ...body, projectId: routeProjectId } : body,
    {
      constructionCalendar,
      projectId: routeProjectId || null,
      companyId,
    },
  )

  res.json({
    success: true,
    data: preview,
    timestamp: ts,
  } as ApiResponse)
}

async function handleImport(req: any, res: any) {
  const body = importSchema.parse(req.body)
  const ts = now()
  const warnings: string[] = []
  const unmappedColumns = new Set<string>()
  const invalidRows: { row: number; reason: string }[] = []
  const knownColumns = new Set(['title', 'name', '任务名', '任务名称', 'wbs_name', 'activity_name', 'start_date', 'end_date', 'planned_start_date', 'planned_end_date', 'duration', 'progress', 'assignee'])

  body.rows.forEach((row, index) => {
    const hasTitle = ['title', 'name', '任务名', '任务名称', 'wbs_name', 'activity_name'].some((key) => {
      const value = row[key]
      return value !== undefined && value !== null && String(value).trim() !== ''
    })
    if (!hasTitle) invalidRows.push({ row: index + 1, reason: '缺少任务名称字段' })
    Object.keys(row).forEach((key) => {
      if (!knownColumns.has(key)) unmappedColumns.add(key)
    })
  })
  if (invalidRows.length > 0) warnings.push(`${invalidRows.length} 行缺少名称，将在向导确认后跳过`)
  if (unmappedColumns.size > 0) warnings.push('存在未映射列，请在向导中补齐业态、工法与工程特征')

  res.json({
    success: true,
    data: {
      projectId: body.projectId ?? null,
      fileType: body.fileType,
      totalRows: body.rows.length,
      validRows: body.rows.length - invalidRows.length,
      invalidRows: invalidRows.slice(0, 100),
      unmappedColumns: [...unmappedColumns],
      warnings,
      nextStep: 'wizard_required',
    },
    timestamp: ts,
  } as ApiResponse)
}

router.post('/api/projects/wizard', authenticate, asyncHandler(async (req, res) => {
  const body = wizardCreateSchema.parse(req.body)
  const payload = wizardPayloadSchema.parse({
    ...(body.metadata ?? {}),
    ...(body.wizardPayload ?? {}),
    projectName: body.wizardPayload?.projectName ?? body.name ?? body.metadata?.projectName,
    location: body.wizardPayload?.location ?? body.location ?? body.metadata?.location,
    totalAreaM2: body.wizardPayload?.totalAreaM2 ?? body.total_area ?? body.metadata?.totalAreaM2,
    plannedStartDate: body.wizardPayload?.plannedStartDate ?? body.planned_start_date ?? body.metadata?.plannedStartDate,
    plannedEndDate: body.wizardPayload?.plannedEndDate ?? body.planned_end_date ?? body.metadata?.plannedEndDate,
    actualStartDate: body.wizardPayload?.actualStartDate ?? body.actual_start_date ?? body.metadata?.actualStartDate,
    saveAsCompanyTemplate: body.saveAsCompanyTemplate ?? body.wizardPayload?.saveAsCompanyTemplate,
    companyTemplateName: body.companyTemplateName ?? body.wizardPayload?.companyTemplateName,
  })
  if (body.commit) assertWizardGenerationBusinessSubtype(payload)
  const diagnosticFailureInjection = readWizardDiagnosticFailureInjection(req, body.metadata ?? {})
  if (diagnosticFailureInjection && body.asyncGeneration) {
    throw wizardDiagnosticError(
      'Wizard diagnostic failure injection requires synchronous commit evidence.',
      400,
      'WIZARD_DIAGNOSTIC_FAILURE_INJECTION_ASYNC_NOT_ALLOWED',
    )
  }
  const actorId = (req as any).user?.id ?? null
  const companyId = await resolveWizardProjectCompanyId(
    actorId,
    body.companyId || getRequestCompanyId(req) || (req as any).user?.currentCompanyId || null,
  )
  await assertWizardProjectEditor({
    actorId,
    projectId: body.projectId,
    companyId,
  })
  const created = await createOrUpdateWizardProject({
    projectId: body.projectId,
    newProjectId: body.newProjectId,
    companyId,
    actorId,
    body,
    payload,
    commit: body.commit,
  })

  let generation: Awaited<ReturnType<typeof commitWizardGeneration>> | null = null
  if (body.commit) {
    if (body.asyncGeneration) {
      const attemptId = uuidv4()
      await setWizardGenerationQueued({
        projectId: created.projectId,
        attemptId,
      })
      enqueueWizardGeneration({
        projectId: created.projectId,
        payload,
        actorId,
        companyId,
        attemptId,
        saveAsCompanyTemplate: body.saveAsCompanyTemplate ?? payload.saveAsCompanyTemplate,
        companyTemplateName: body.companyTemplateName ?? payload.companyTemplateName ?? null,
      })
      logger.info('Wizard project generation queued', { projectId: created.projectId, companyId, actorId, attemptId })
      res.status(202).json({
        success: true,
        data: {
          id: created.projectId,
          projectId: created.projectId,
          status: created.status,
          generation: {
            state: WIZARD_GENERATION_STATE_QUEUED,
            attemptId,
            queuedAt: now(),
          },
        },
        timestamp: now(),
      } as ApiResponse)
      return
    }
    generation = await commitWizardGeneration({
      projectId: created.projectId,
      companyId,
      payload,
      actorId,
      diagnosticFailureInjection,
      diagnosticMetadata: created.metadata,
    })
    await saveCompanyTemplateIfRequested({
      companyId,
      projectId: created.projectId,
      payload,
      actorId,
      name: body.companyTemplateName,
    })
  }

  logger.info('Wizard project saved', { projectId: created.projectId, companyId, actorId, committed: body.commit })
  res.status(body.projectId ? 200 : 201).json({
    success: true,
    data: {
      id: created.projectId,
      projectId: created.projectId,
      status: body.commit ? PROJECT_ACTIVE_STATUS : created.status,
      generation,
    },
    timestamp: created.ts,
  } as ApiResponse)
}))

router.patch('/api/projects/:id/wizard/draft', authenticate, asyncHandler(handleDraftSave))
router.patch('/api/projects/:id/wizard-draft', authenticate, asyncHandler(handleDraftSave))

router.delete('/api/projects/:id/wizard/draft', authenticate, asyncHandler(handleDraftDelete))
router.delete('/api/projects/:id/wizard-draft', authenticate, asyncHandler(handleDraftDelete))

router.post('/api/projects/:id/wizard/preview', authenticate, asyncHandler(handleWizardPreview))
router.post('/api/projects/wizard/preview', authenticate, asyncHandler(handleWizardPreview))

router.get('/api/projects/:id/wizard/generation/:attemptId', authenticate, asyncHandler(async (req, res) => {
  const { id, attemptId } = req.params
  await assertWizardProjectEditor({
    actorId: (req as any).user?.id ?? null,
    projectId: id,
    companyId: getRequestCompanyId(req) || (req as any).user?.currentCompanyId || null,
  })
  const { project } = await readProjectMetadataWithStaleWizardRecovery(id)
  if (!project) {
    res.status(404).json({
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' },
      timestamp: now(),
    } as ApiResponse)
    return
  }
  const status = mapWizardGenerationMetadata(project, attemptId)
  if (status.attemptId && normalizeText(attemptId) && status.attemptId !== normalizeText(attemptId)) {
    res.status(404).json({
      success: false,
      error: { code: 'WIZARD_GENERATION_ATTEMPT_NOT_FOUND', message: 'Wizard generation attempt not found.' },
      timestamp: now(),
    } as ApiResponse)
    return
  }
  res.json({
    success: true,
    data: status,
    timestamp: now(),
  } as ApiResponse)
}))

router.get('/api/projects/:id/wizard/artifact-inventory', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params
  await assertWizardProjectEditor({
    actorId: req.user?.id,
    projectId: id,
    companyId: getRequestCompanyId(req) || req.user?.currentCompanyId || null,
  })
  const inventory = await readWizardArtifactInventory(id)
  if (!inventory) {
    res.status(404).json({
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found.' },
      timestamp: now(),
    } as ApiResponse)
    return
  }
  res.json({
    success: true,
    data: inventory,
    timestamp: now(),
  } as ApiResponse)
}))

router.post('/api/projects/:id/wizard/rollback', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params
  const ts = now()
  await assertWizardProjectEditor({
    actorId: req.user?.id,
    projectId: id,
    companyId: getRequestCompanyId(req) || req.user?.currentCompanyId || null,
  })
  const { metadata } = await readProjectMetadataWithStaleWizardRecovery(id)
  assertWizardGenerationNotInProgress(metadata)
  await rollbackWizardGeneratedArtifacts(id)
  await updateProjectMetadata({
    projectId: id,
    updatedAt: ts,
    status: PROJECT_DRAFT_STATUS,
    defaultWbsGenerated: false,
    metadata: omitRecordKeys(metadata, [
      'wizard_completed_at',
      'wizard_generation_batch_id',
      'wizard_generation_state',
      'wizard_generation_attempt_id',
      'wizard_generation_started_at',
      'wizard_generated_baseline_ids',
      'wizard_generation_candidate_baseline',
      'wizard_created_task_ids',
      'wizard_materialized_object_ids',
      'wizard_generated_acceptance_plan_ids',
      'wizard_passed_acceptance_plan_ids',
    ]),
    statementTimeoutMs: WIZARD_ROLLBACK_METADATA_UPDATE_TIMEOUT_MS,
  })
  res.json({ success: true, data: { id, rolledBack: true }, timestamp: ts } as ApiResponse)
}))

router.post('/api/projects/import/excel', authenticate, asyncHandler(handleImport))
router.post('/api/projects/wizard/import', authenticate, asyncHandler(handleImport))

router.get('/api/companies/:cid/project-drafts', authenticate, asyncHandler(async (req, res) => {
  const { cid } = req.params
  const ts = now()
  const actorId = req.user?.id ?? null
  const membership = actorId ? await getCurrentCompanyMembership(actorId, cid) : null
  if (membership?.companyId !== cid) {
    throw forbiddenError('You do not have permission to list wizard drafts for this company.')
  }
  const selectDraftSql = `SELECT id, name, status,
          metadata->'wizard_draft_payload' AS wizard_draft_payload,
          metadata->>'wizard_draft_step' AS draft_step,
          metadata->>'wizard_draft_updated_at' AS draft_updated_at,
          updated_at
   FROM projects
   WHERE company_id = $1 AND status = $2 AND deleted_at IS NULL
   ORDER BY updated_at DESC LIMIT 50`
  // database-query-dynamic-approved: project draft listing owns only fixed SELECT projects templates; runtime values are bound parameters.
  let draftResult
  try {
    draftResult = await rawQuery(selectDraftSql, [cid, PROJECT_DRAFT_STATUS])
  } catch (error) {
    const queryError = error as { code?: unknown; message?: unknown }
    const isMissingDeletedAtColumn = String(queryError.code ?? '') === '42703'
      && /\bdeleted_at\b/i.test(String(queryError.message ?? ''))
    if (!isMissingDeletedAtColumn) throw error

    const legacyDraftSql = `SELECT id, name, status,
            metadata->'wizard_draft_payload' AS wizard_draft_payload,
            metadata->>'wizard_draft_step' AS draft_step,
            metadata->>'wizard_draft_updated_at' AS draft_updated_at,
            updated_at
     FROM projects
     WHERE company_id = $1 AND status = $2
     ORDER BY updated_at DESC LIMIT 50`
    // database-query-dynamic-approved: legacy project draft listing owns only this fixed SELECT template; runtime values are bound parameters.
    draftResult = await rawQuery(legacyDraftSql, [cid, PROJECT_DRAFT_STATUS])
  }
  const drafts = draftResult.rows
  res.json({ success: true, data: drafts, timestamp: ts } as ApiResponse)
}))

export default router
