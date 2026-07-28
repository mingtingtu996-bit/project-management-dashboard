import { randomUUID } from 'crypto'
import { logger } from '../middleware/logger.js'
import {
executeDurationLearningRuntimePublicationQuery,
listApplicableDurationLearningRuntimePublications,
resolveDurationLearningRuntimePublication,type DurationLearningRuntimePublicationQueryExec
} from './durationLearningRuntimePublicationService.js'
import type { PlanningSurface,PlanningTableOperation } from '../types/planningTable.js'
import { TASK_PLAN_DRILLDOWN_ROW_LIMIT } from './taskPlanDrilldownPolicyService.js'
import {
buildTaskPlanRhythmDrilldownRows,
type TaskPlanDrilldownParentContext,
type TaskPlanRhythmDrilldownResult,
} from './taskPlanDrilldownRhythmService.js'
import {
CHINA_GB55032_TEMPLATE_CATALOG,
flattenChinaTemplateCatalog
} from '../seeds/chinaGb50300TemplateCatalog.js'
import {
WBS_TEMPLATE_PROJECT_TYPE_CODES,type WbsTemplateCatalogGroup
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
DEPENDENCY_INTENT_REFERENCE_FIELDS,
inferV1475ReferenceCatalogGroupFromCode,
isV1475ConstructionMainlineReference,
inspectV1475DependencyIntentTemplates,
resolveV1475ReferenceCatalogGroup,
type V1475DependencyRelationRole
} from '../seeds/v1475DependencyIntentTemplates.js'
import {
isDurationBearingContributionMode,
normalizeDurationContributionMode
} from '../seeds/durationContributionMode.js'
import {
readDeclaredControlRoles
} from '../seeds/controlRoles.js'
import {
normalizeExecutionNature
} from '../seeds/executionNature.js'
import {
inclusivePlanDuration as daysInclusive
} from './wbsPlanRollupService.js'
import {
resolveDefaultMasterPlanVisibilityPolicy,type AlgorithmSeedResolveContext
} from './algorithmSeedResolver.js'
import { buildProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { persistProjectGenerationFactsSnapshot } from './projectGenerationFactsStoreService.js'
import {
recordWbsTemplateGenerationConsumedArtifacts
} from './durationRuntimeConsumerObservationAdapterService.js'
import type {
DurationRuntimeConsumerObservationQueryExec
} from './durationRuntimeConsumerObservationService.js'
import {
assembleExecutableDefaultMasterPlanRows,finalizeExecutableDefaultMasterPlanScheduleNetwork,
refreshExecutableDefaultMasterPlanAssemblySummary,type ExecutableDefaultMasterPlanAssemblySummary
} from './defaultMasterPlanExecutableAssemblyService.js'
import {
applyDefaultMasterPlanVisibilityPolicy,
type DefaultMasterPlanVisibilitySummary,
} from './defaultMasterPlanVisibilityService.js'
import {
buildDefaultMasterPlanAssetConsumption
} from './defaultMasterPlanAssetConsumptionService.js'
import type {
DurationAssetConsumptionReceipt,
DurationAssetConsumptionSummary,
} from './durationAssetConsumptionReceiptService.js'

import {
BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID,
BUILT_IN_WBS_TEMPLATE_CATALOGS,
CHINA_GB55032_TEMPLATE_ID,
WBS_TEMPLATE_CATALOG_GROUPS,
WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
buildTemplateCatalogNotFoundError,
buildWbsTemplateGenerationConsumedArtifacts,
flattenCatalogNodes,
getBuiltInTemplateCatalog,
getCatalogApplicableScope,
getCatalogDomainScope,
getCatalogGenerationPolicy,
getCatalogPackType,
getCatalogSourceStandards,
getCatalogStableCodePrefix,
getCatalogTemplateGroup,
getCatalogTriggerKeywords,
getFlattenedCatalogNodes,
getSerializedBuiltInTemplateNodes,
mergeMethodVariantCodesFromFacts,
normalizeDurationLearningProjectId,
normalizeId,
normalizeText,
readArray,
readCodeArray,
readNumberFromSources,
readOperationConstructionCalendar,
readOperationGeneratedMasterPlanProfile,
readOperationProjectFacts,
readRecord,
readStringArray,
resolveGenerationConstructionCalendar,
sanitizeGeneratedConstructionCalendarContext,
uniqueStringArray,
} from './wbsTemplateGenerationFoundation.js'
import type {
BuiltInWbsTemplateCatalog,
GeneratedCandidateNetworkEvaluation,
GeneratedDurationAssetUtilizationSummary,
GeneratedMasterPlanProfile,
GeneratedPhaseWindow,
GeneratedScheduleTrustGate,
GeneratedTargetFeasibility,
GeneratedTemplateBatch,
GeneratedTemplateGovernanceWarning,
GeneratedTemplateRow,
PreviousInternalFlowSibling,
TemplateNode,
WbsTemplateCatalogItem,
WbsTemplateCatalogResponse,
WbsTemplateDetailLevel,
WbsTemplateDurationSuggestionMode,
WbsTemplateEvidenceSummary,
WbsTemplateGenerationDepth,
WbsTemplateGenerationRowLimitPolicy,
WbsTemplateGenerationRuntimeArtifactPublication,
WbsTemplatePhaseReleasePolicy,
WbsTemplateScope,
WbsTemplateSeedValidationResult,
} from './wbsTemplateGenerationFoundation.js'
import {
applyDurationLearningPublicationToTemplateNodes,
buildWbsDurationLearningRuntimeArtifactPublication,
getCatalogGroupSelectionMode,
hasAnyScope,
hasExplicitSelectedNodesForTemplate,
isProjectScopeMode,
loadWbsTemplateNodes,
readGenerationDepth,
readGenerationStartDate,
readSelectedNodeIdsForTemplate,
readTemplateIds,
resolveProjectCompanyIdForDurationLearning,
selectAutoTriggeredDangerNodes,
selectTemplateNodes,
} from './wbsTemplateScopeClassificationService.js'
import {
applyMasterPlanProfilePreflightRowLimit,
assertGeneratedRowBudget,
buildGenerationScopeContexts,
buildScopeStartDateByIndex,
collectCoreReplacementCodes,
countGeneratedRowsForNode,
} from './wbsTemplateDurationAssemblyService.js'
import {
assertExplicitScopeCardinalityBudget,
assertSimpleScopeCardinalityBudget,
buildGenerationBatches,
countGeneratedMainPlanRowsForNode,
countRowProjectionModes,
} from './wbsTemplateOutputProjectionService.js'
import {
applyCrossItemWorkflowRules,
applyDependencyIntentTemplates,
applyDurationLearningDependencyPublications,
applyGeneratedDependencySchedule,
applyGeneratedExecutionPhaseSchedule,
applyGeneratedPhaseChainDependencies,
applyGeneratedPhaseChainSchedule,
applyGeneratedRowPlanRollups,
applyGeneratedRowTaskStructureGovernance,
applyProcessConstraintEffects,
applyScopeAssignmentRules,
applyScopeObjectLineage,
applyStartingLineOnboardingClassification,
applyTaskPlanDrilldownFrontier,
attachConstructionOrganizationGeneratedRowProjection,
buildCandidateNetworkEvaluationForGeneratedRows,
buildCandidateNetworkEvaluationFromGeneratedDependencies,
buildExplicitPhaseReleasePolicyMap,
buildGeneratedPhaseWindows,
buildGeneratedRowsForNode,
buildGenerationDepthScheduleTrustGate,
buildGenerationDepthTrustGovernanceWarning,
buildTargetEndGovernanceWarning,
collectGeneratedTemplateGovernanceWarnings,
collectScopeAssignmentMissingTargetWarnings,
comparePlanDates,
computePhaseReleaseStartDate,
evaluateTargetEndFeasibility,
pruneGeneratedDependencyConflicts,
pruneGeneratedDependencyCycles,
pruneGeneratedHierarchySelfDependencies,
readGeneratedRowPlanEnd,
readRowStableCode,
readScopeAssignmentRulesFromOperation,
readScopeCombos,
readTargetConstraintContext,
rebuildGeneratedDependencyNetwork,
resolvePhaseReleasePolicy,
restorePackageRhythmWindowRows,
rowIsSuppressedByCoreReplacement,
sanitizeGeneratedRowValuesForCreate,
sanitizeGeneratedTemplateRowsForPublicOutput,
scalePhaseReleasePolicyByProjectFacts,
stabilizeGeneratedDependencyAndRollupSchedule,
suppressCoreRowsReplacedBySpecialty,
suppressRowsForAbsentOptionalMatchingBuildingUsage,
} from './wbsTemplateDependencyCandidateService.js'
import {
buildDefaultMasterPlanSeedResolveContext,
buildDurationSuggestionMap,
normalizeGeneratedPlanDurationFields,
} from './wbsTemplateAssetStrategyService.js'
import {
RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
applyBusinessTypeMasterPlanProfileRows,
applyResidentialMasterPlanOrganizationHierarchy,
applyResidentialMasterPlanV2Rows,
readDefaultMasterPlanBusinessType,
} from './wbsTemplateCloseoutChainService.js'
import {
applyGeneratedMasterPlanProfileLimit,
buildDurationAssetUtilizationSummary,
compactGeneratedMasterPlanInferredBuildingLanes,
sortGeneratedRowsBySchedule,
} from './wbsTemplateAuditFormattingService.js'



export function buildBuiltInTemplateCatalogItem(
  catalog: BuiltInWbsTemplateCatalog,
  options: { includeNodes?: boolean } = {},
): WbsTemplateCatalogItem {
  return {
    id: catalog.templateId,
    name: catalog.templateName,
    source: 'builtin_seed',
    nodeCount: getFlattenedCatalogNodes(catalog).length,
    packType: getCatalogPackType(catalog),
    templateGroup: getCatalogTemplateGroup(catalog),
    generationPolicy: getCatalogGenerationPolicy(catalog),
    triggerKeywords: getCatalogTriggerKeywords(catalog),
    domainScope: getCatalogDomainScope(catalog),
    applicableScope: getCatalogApplicableScope(catalog),
    sourceStandards: getCatalogSourceStandards(catalog),
    sourceStandard: catalog.sourceStandard,
    sourceVersion: catalog.sourceVersion,
    evidenceSummary: buildEvidenceSummaryFromCatalog(catalog),
    nodes: options.includeNodes ? getSerializedBuiltInTemplateNodes(catalog) : undefined,
  }
}



export function buildEvidenceSummaryFromCatalog(catalog: BuiltInWbsTemplateCatalog): WbsTemplateEvidenceSummary {
  const cached = BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID.get(catalog.templateId)
  if (cached) return cached

  if (catalog.templateId === CHINA_GB55032_TEMPLATE_ID) {
    const validation = validateChinaGb50300Seed({ strict: true })
    const summary: WbsTemplateEvidenceSummary = {
      domainScope: '房屋建筑工程标准主干',
      evidenceStatus: validation.ok ? 'verified' : 'needs_review',
      reviewNeededCount: validation.reviewNeededCount,
      webVerifiedFalseCount: validation.webVerifiedFalseCount,
      divisionCount: validation.divisionCount,
      subDivisionCount: validation.subDivisionCount,
      itemWorkCount: validation.itemWorkCount,
      processCount: validation.processCount,
      activityStepCount: validation.activityStepCount,
      disciplineProcessCount: validation.disciplineProcessCount,
      genericFallbackProcessCount: validation.genericFallbackProcessCount,
      disciplineActivityStepCount: validation.disciplineActivityStepCount,
      genericActivityStepCount: validation.genericActivityStepCount,
      uniqueProcessNameCount: validation.uniqueProcessNameCount,
      uniqueActivityStepNameCount: validation.uniqueActivityStepNameCount,
    }
    BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID.set(catalog.templateId, summary)
    return summary
  }

  const nodes = getFlattenedCatalogNodes(catalog)
  const reviewNeededCount = nodes.filter((node) => node.reviewNeeded).length
  const webVerifiedFalseCount = nodes.filter((node) => node.webVerified === false).length
  const processNodes = nodes.filter((node) => node.categoryType === 'process')
  const activityStepNodes = nodes.filter((node) => node.categoryType === 'activity_step')
  const uniqueProcessNames = new Set(processNodes.map((node) => node.name))
  const uniqueActivityStepNames = new Set(activityStepNodes.map((node) => node.name))

  const summary: WbsTemplateEvidenceSummary = {
    domainScope: getCatalogDomainScope(catalog),
    evidenceStatus: reviewNeededCount === 0 && webVerifiedFalseCount === 0 ? 'verified' : 'needs_review',
    reviewNeededCount,
    webVerifiedFalseCount,
    divisionCount: nodes.filter((node) => node.categoryType === 'division').length,
    subDivisionCount: nodes.filter((node) => node.categoryType === 'sub_division').length,
    itemWorkCount: nodes.filter((node) => node.categoryType === 'item_work').length,
    processCount: processNodes.length,
    activityStepCount: activityStepNodes.length,
    disciplineProcessCount: processNodes.filter((node) => readRecord(node.metadata).processPackLevel !== 'generic_fallback').length,
    genericFallbackProcessCount: processNodes.filter((node) => readRecord(node.metadata).processPackLevel === 'generic_fallback').length,
    disciplineActivityStepCount: activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource !== 'generic_checklist').length,
    genericActivityStepCount: activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource === 'generic_checklist').length,
    uniqueProcessNameCount: uniqueProcessNames.size,
    uniqueActivityStepNameCount: uniqueActivityStepNames.size,
  }
  BUILT_IN_TEMPLATE_EVIDENCE_SUMMARY_BY_ID.set(catalog.templateId, summary)
  return summary
}



export async function generateWbsTemplateRowsInternal(params: {
  projectId: string
  operation: PlanningTableOperation
  surface: PlanningSurface
  // v1.4.22.1: wizard integration extensions
  detailLevel?: WbsTemplateDetailLevel
  onboardingSubstage?: string | null
  onboardingBatchId?: string | null
  scopeAssignmentRules?: Array<{
    itemPackPattern: string
    effect: string
    functionalAreaCategory?: string
    matchFunctionalUsage?: string
    targetObjectType?: string
    target_object_type?: string
    matchMetadata?: Record<string, unknown>
    match_metadata?: Record<string, unknown>
    matchObjectName?: string
    match_object_name?: string
    priority: number
  }> | null
  duplicatePolicy?: 'preserve_historical_skip_future'
  diagnosticDurationSuggestionMode?: WbsTemplateDurationSuggestionMode
  runtimePublicationQueryExec?: DurationLearningRuntimePublicationQueryExec | null
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly WbsTemplateGenerationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
  runtimeEvidenceMode?: 'record' | 'no_write'
  algorithmSeedSourcePolicy?: AlgorithmSeedResolveContext['sourcePolicy']
  runtimePublicationResolution?: 'enabled' | 'disabled'
}): Promise<{
  generationBatchId: string
  templateId: string
  templateIds: string[]
  generationDepth: WbsTemplateGenerationDepth
  defaultPlanOutput?: 'master_plan'
  masterPlanProfile?: GeneratedMasterPlanProfile | null
  durationAssetUtilizationSummary?: GeneratedDurationAssetUtilizationSummary
  durationAssetConsumptionReceipts?: DurationAssetConsumptionReceipt[]
  durationAssetConsumptionSummary?: DurationAssetConsumptionSummary
  candidateNetworkEvaluation?: GeneratedCandidateNetworkEvaluation | null
  executableDefaultMasterPlanAssembly?: ExecutableDefaultMasterPlanAssemblySummary
  masterPlanVisibilitySummary?: DefaultMasterPlanVisibilitySummary
  rows: GeneratedTemplateRow[]
  scopeCombos: WbsTemplateScope[]
  rowLimit: number
  rowLimitPolicy: WbsTemplateGenerationRowLimitPolicy
  splitByPhaseApplied: boolean
  generationBatches: GeneratedTemplateBatch[]
  suppressedCoreQualityCodes: string[]
  governanceWarnings: GeneratedTemplateGovernanceWarning[]
  scheduleTrustGate: GeneratedScheduleTrustGate
  targetFeasibility?: GeneratedTargetFeasibility
  phaseWindows: GeneratedPhaseWindow[]
  // v1.4.22.1: onboarding classification summary
  onboardingSummary?: { history: number; in_progress: number; future: number }
}> {
  if (params.surface === 'monthly_plan') {
    throw Object.assign(new Error('月度计划不能直接从分部分项模板生成，只能从任务列表或基线继承'), {
      statusCode: 400,
      code: 'TEMPLATE_GENERATE_NOT_ALLOWED_ON_MONTHLY_PLAN',
    })
  }

  const operation = params.operation
  const diagnosticStageTimings = operation.diagnosticStageTimings === true || operation.diagnostic_stage_timings === true
  const diagnosticTimingStart = Date.now()
  let diagnosticTimingLast = diagnosticTimingStart
  const logDiagnosticStageTiming = (stage: string, details: Record<string, unknown> = {}) => {
    if (!diagnosticStageTimings) return
    const now = Date.now()
    console.error(JSON.stringify({
      source: 'wbs_template_generation_stage_timing',
      generationBatchId: normalizeText(operation.generationBatchId ?? operation.generation_batch_id) || null,
      stage,
      elapsedMs: now - diagnosticTimingStart,
      deltaMs: now - diagnosticTimingLast,
      ...details,
    }))
    diagnosticTimingLast = now
  }
  const templateIds = readTemplateIds(operation)
  const projectFacts = readOperationProjectFacts(operation)
  const masterPlanProfile = readOperationGeneratedMasterPlanProfile(operation, projectFacts)
  if (templateIds.length === 0) {
    throw Object.assign(new Error('template_generate 必须携带 templateId'), {
      statusCode: 400,
      code: 'TEMPLATE_ID_REQUIRED',
    })
  }

  const durationLearningProjectId = normalizeDurationLearningProjectId(params.projectId)
  const durationLearningQueryExec = params.runtimePublicationResolution === 'disabled'
    ? null
    : params.runtimePublicationQueryExec
      ?? params.runtimeConsumerObservationQueryExec
      ?? (process.env.NODE_ENV === 'test' ? null : executeDurationLearningRuntimePublicationQuery)
  const durationLearningCompanyId = await resolveProjectCompanyIdForDurationLearning({
    projectId: durationLearningProjectId,
    projectFacts,
    queryExec: durationLearningQueryExec,
  })
  const durationLearningIndustryKey = normalizeId(
    projectFacts.industryKey
      ?? projectFacts.industry_key
      ?? projectFacts.businessType
      ?? projectFacts.business_type
      ?? projectFacts.projectTypeCode
      ?? projectFacts.project_type_code,
  )
  const learnedRuntimeArtifactPublications = params.runtimeArtifactPublications as WbsTemplateGenerationRuntimeArtifactPublication[] | null | undefined
  const templateSelections: Array<{ templateId: string; selectedNodes: TemplateNode[] }> = []
  for (const templateId of templateIds) {
    if (masterPlanProfile && !hasExplicitSelectedNodesForTemplate(operation, templateId)) continue
    const roots = await loadWbsTemplateNodes(templateId)
    const selectedNodeIds = readSelectedNodeIdsForTemplate(operation, templateId)
    const catalog = getBuiltInTemplateCatalog(templateId)
    let selectedNodes = selectedNodeIds.length === 0
      && catalog
      && getCatalogPackType(catalog) === 'danger_control'
      && getCatalogGroupSelectionMode(operation, 'danger_control') === 'auto_by_trigger'
      ? selectAutoTriggeredDangerNodes(roots, operation)
      : selectTemplateNodes(roots, selectedNodeIds)
    if (selectedNodes.length === 0) {
      throw Object.assign(new Error('所选模板节点不存在或已停用'), {
        statusCode: 404,
        code: 'TEMPLATE_NODE_NOT_FOUND',
      })
    }
    if (durationLearningQueryExec) {
      for (const assetKey of ['special_work_duration_seed', 'wbs_reference_days'] as const) {
        const resolution = await resolveDurationLearningRuntimePublication({
          queryExec: durationLearningQueryExec,
          assetKey,
          artifactKey: templateId,
          companyId: durationLearningCompanyId,
          projectId: durationLearningProjectId,
          industryKey: durationLearningIndustryKey,
        })
        const applied = applyDurationLearningPublicationToTemplateNodes({
          nodes: selectedNodes,
          assetKey,
          resolution,
        })
        selectedNodes = applied.nodes
        const consumedPublication = buildWbsDurationLearningRuntimeArtifactPublication(
          assetKey,
          resolution,
          templateId,
          applied.appliedNodeCount,
        )
        if (consumedPublication && learnedRuntimeArtifactPublications) {
          learnedRuntimeArtifactPublications.push(consumedPublication)
        }
      }
    }
    templateSelections.push({ templateId, selectedNodes })
  }
  logDiagnosticStageTiming('template_selections_loaded', {
    templateCount: templateSelections.length,
    selectedRootCount: templateSelections.reduce((sum, selection) => sum + selection.selectedNodes.length, 0),
  })

  const projectGenerationFactsSnapshot = buildProjectGenerationFactsSnapshot(projectFacts)
  await persistProjectGenerationFactsSnapshot({
    projectId: params.projectId,
    facts: projectGenerationFactsSnapshot,
    source: 'wbs_template_generation',
  }).catch((error) => {
    logger.warn('[wbsTemplateGenerationService] failed to persist project generation facts snapshot', {
      projectId: params.projectId,
      error,
    })
  })
  const generationBatchId = normalizeText(operation.generationBatchId) || randomUUID()
  const attachUnderRowId = normalizeId(operation.attachUnderRowId)
  const startDate = readGenerationStartDate(operation)
  const constructionCalendar = await resolveGenerationConstructionCalendar({
    operation,
    projectId: params.projectId,
    masterPlanProfile,
  })
  const generationDepth = readGenerationDepth({
    ...operation,
    detailLevel: operation.detailLevel ?? operation.detail_level ?? params.detailLevel,
  })
  const durationSuggestionMode: WbsTemplateDurationSuggestionMode = params.diagnosticDurationSuggestionMode ?? 'full'
  const templateSelectionsWithIndex = templateSelections.map((selection, templateIndex) => ({ ...selection, templateIndex }))
  assertExplicitScopeCardinalityBudget({
    generationBatchId,
    templateIds,
    templateSelections: templateSelectionsWithIndex,
    operation,
    generationDepth,
  })
  const scopeCombos = readScopeCombos(operation.scope, projectFacts)
  if (params.algorithmSeedSourcePolicy) {
    for (const scope of scopeCombos) {
      scope.algorithm_seed_source_policy = params.algorithmSeedSourcePolicy
    }
  }
  logDiagnosticStageTiming('scope_combos_read', {
    scopeComboCount: scopeCombos.length,
  })
  const selectedTemplateIdsForBranch = uniqueStringArray(templateIds.map((templateId) => normalizeText(templateId).toLowerCase()).filter(Boolean))
  for (const scope of scopeCombos) {
    scope.selected_template_ids = uniqueStringArray([
      ...(scope.selected_template_ids ?? []),
      ...selectedTemplateIdsForBranch,
    ])
  }
  if (params.surface === 'task_list' && !scopeCombos.some(hasAnyScope) && !isProjectScopeMode(operation.scope)) {
    throw Object.assign(new Error('Task-list template generation requires at least one engineering object scope.'), {
      statusCode: 400,
      code: 'SCOPE_OBJECT_REQUIRED',
    })
  }

  const replacementCodes = collectCoreReplacementCodes(templateSelections.flatMap((selection) => selection.selectedNodes), scopeCombos)
  assertSimpleScopeCardinalityBudget({
    generationBatchId,
    templateIds,
    templateSelections: templateSelectionsWithIndex,
    scopeCombos,
    generationDepth,
    replacementCodes,
  })
  const generationScopeContexts = buildGenerationScopeContexts(templateSelectionsWithIndex, scopeCombos)
  const generationScopeCombos = generationScopeContexts.map((context) => context.scope)
  logDiagnosticStageTiming('scope_contexts_built', {
    scopeComboCount: scopeCombos.length,
    generationScopeContextCount: generationScopeContexts.length,
  })
  const learnedDependencyRuntimePublications = durationLearningQueryExec
    ? await listApplicableDurationLearningRuntimePublications({
        queryExec: durationLearningQueryExec,
        assetKey: 'dependency_rule_candidate',
        companyId: durationLearningCompanyId,
        projectId: durationLearningProjectId,
        industryKey: durationLearningIndustryKey,
      })
    : []
  const scopeStartDateByIndex = buildScopeStartDateByIndex({
    selectedNodes: templateSelections.flatMap((selection) => selection.selectedNodes),
    scopeCombos: generationScopeCombos,
    startDate,
  })
  const totalRowCountsByScope = generationScopeContexts.map((context) => context.templateSelections.reduce((templateCount, selection) => (
    templateCount + selection.selectedNodes.reduce((sum, node) => (
      sum + countGeneratedRowsForNode(node, generationDepth, context.scope, replacementCodes)
    ), 0)
  ), 0))
  const mainPlanRowCountsByScope = generationScopeContexts.map((context) => context.templateSelections.reduce((templateCount, selection) => (
    templateCount + selection.selectedNodes.reduce((sum, node) => (
      sum + countGeneratedMainPlanRowsForNode(node, generationDepth, context.scope, replacementCodes)
    ), 0)
  ), 0))
  const generatedRowCount = totalRowCountsByScope.reduce((sum, count) => sum + count, 0)
  const generatedMainPlanRowCount = mainPlanRowCountsByScope.reduce((sum, count) => sum + count, 0)
  const preflightMainPlanRowCountsByScope = masterPlanProfile
    ? mainPlanRowCountsByScope.map((count) => applyMasterPlanProfilePreflightRowLimit(count, masterPlanProfile))
    : mainPlanRowCountsByScope
  const preflightMainPlanRowCount = applyMasterPlanProfilePreflightRowLimit(generatedMainPlanRowCount, masterPlanProfile)
  logDiagnosticStageTiming('row_counts_estimated', {
    generatedRowCount,
    generatedMainPlanRowCount,
    preflightMainPlanRowCount,
  })
  const preflightBatchPlan = buildGenerationBatches({
    generationBatchId,
    templateIds,
    scopeCombos: generationScopeCombos,
    rowCountsByScope: preflightMainPlanRowCountsByScope,
    totalRowCountsByScope,
    rows: [],
  })
  assertGeneratedRowBudget({
    generatedMainPlanRowCount: preflightMainPlanRowCount,
    generatedRowCount,
    generationBatches: preflightBatchPlan.generationBatches,
  })
  const suggestionByNodeKey = await buildDurationSuggestionMap({
    projectId: params.projectId,
    selectedNodes: templateSelections.flatMap((selection) => selection.selectedNodes),
    scopeCombos: generationScopeCombos,
    scopeContexts: generationScopeContexts.map((context) => ({
      scope: context.scope,
      selectedNodes: context.templateSelections.flatMap((selection) => selection.selectedNodes),
    })),
    generationDepth,
    durationSuggestionMode,
    runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
    runtimeEvidenceMode: params.runtimeEvidenceMode,
    plannedStartDate: startDate,
    scopeStartDateByIndex,
    onStageTiming: logDiagnosticStageTiming,
  })
  logDiagnosticStageTiming('duration_suggestions_built', {
    durationSuggestionMode,
    suggestionCount: suggestionByNodeKey.size,
  })
  let rows: GeneratedTemplateRow[] = []
  const sortCursor = { value: Number(operation.sortOrder ?? 0) || 0 }

  generationScopeContexts.forEach(({ scope, templateSelections: contextSelections }, scopeIndex) => {
    const predecessorByParent = new Map<string, PreviousInternalFlowSibling[]>()
    contextSelections.forEach((selection) => {
      selection.selectedNodes.forEach((node) => {
        const scopedBatchId = [
          generationBatchId,
          templateSelections.length > 1 ? `template-${selection.templateIndex + 1}` : null,
          generationScopeCombos.length > 1 ? `scope-${scopeIndex + 1}` : null,
        ].filter(Boolean).join(':')
        buildGeneratedRowsForNode({
          node,
          scope,
          parentClientRowId: null,
          parentRowId: attachUnderRowId,
          attachUnderRowId,
          batchId: scopedBatchId,
          sortCursor,
          startDate: scopeStartDateByIndex.get(scopeIndex) ?? startDate,
          generationDepth,
          scopeIndex,
          suggestionByNodeKey,
          constructionCalendar,
          predecessorByParent,
          rows,
        })
      })
    })
  })
  logDiagnosticStageTiming('rows_built', {
    rowCount: rows.length,
  })

  const suppressedCoreQualityCodes = uniqueStringArray(
    rows
      .filter((row) => rowIsSuppressedByCoreReplacement(row, replacementCodes))
      .map((row) => readRowStableCode(row)),
  )
  rows = suppressCoreRowsReplacedBySpecialty(rows, replacementCodes)
  rows = suppressRowsForAbsentOptionalMatchingBuildingUsage(rows, params.scopeAssignmentRules, operation)
  rows = applyScopeAssignmentRules(rows, params.scopeAssignmentRules, operation)
  applyScopeObjectLineage(rows, operation)
  logDiagnosticStageTiming('rows_post_processed', {
    rowCount: rows.length,
  })

  const batchPlan = buildGenerationBatches({
    generationBatchId,
    templateIds,
    scopeCombos: generationScopeCombos,
    rowCountsByScope: mainPlanRowCountsByScope,
    totalRowCountsByScope,
    rows,
  })
  const rowProjectionCounts = countRowProjectionModes(rows)
  const mainPlanRowCount = rowProjectionCounts.schedule_row
  logDiagnosticStageTiming('batch_plan_built', {
    mainPlanRowCount,
    rowLimitPolicy: batchPlan.rowLimitPolicy,
  })

  applyCrossItemWorkflowRules(rows)
  logDiagnosticStageTiming('cross_item_workflow_applied')
  applyDependencyIntentTemplates(rows)
  logDiagnosticStageTiming('dependency_intents_applied')
  const consumedLearnedDependencyPublications = applyDurationLearningDependencyPublications(
    rows,
    learnedDependencyRuntimePublications,
  )
  if (learnedRuntimeArtifactPublications) {
    learnedRuntimeArtifactPublications.push(...consumedLearnedDependencyPublications)
  }
  logDiagnosticStageTiming('duration_learning_dependency_publications_applied', {
    publicationCount: consumedLearnedDependencyPublications.length,
  })
  pruneGeneratedHierarchySelfDependencies(rows)
  logDiagnosticStageTiming('dependency_hierarchy_self_dependencies_pruned_first')
  pruneGeneratedDependencyConflicts(rows)
  logDiagnosticStageTiming('dependency_conflicts_pruned_first')
  pruneGeneratedDependencyCycles(rows)
  logDiagnosticStageTiming('dependency_cycles_pruned_first')
  applyGeneratedPhaseChainDependencies(
    rows,
    generationScopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )
  logDiagnosticStageTiming('phase_chain_dependencies_applied')
  pruneGeneratedHierarchySelfDependencies(rows)
  logDiagnosticStageTiming('dependency_hierarchy_self_dependencies_pruned_second')
  pruneGeneratedDependencyConflicts(rows)
  logDiagnosticStageTiming('dependency_conflicts_pruned_second')
  pruneGeneratedDependencyCycles(rows)
  logDiagnosticStageTiming('dependency_cycles_pruned_second')
  applyGeneratedPhaseChainSchedule(rows, generationScopeCombos)
  logDiagnosticStageTiming('phase_chain_schedule_applied')
  applyGeneratedExecutionPhaseSchedule(rows, operation)
  logDiagnosticStageTiming('execution_phase_schedule_applied')
  const dependencyScheduleWarnings: GeneratedTemplateGovernanceWarning[] = []
  const dependencyScheduleWarning = applyGeneratedDependencySchedule(rows, constructionCalendar)
  if (dependencyScheduleWarning) dependencyScheduleWarnings.push(dependencyScheduleWarning)
  logDiagnosticStageTiming('dependency_schedule_applied')
  applyProcessConstraintEffects(rows)
  logDiagnosticStageTiming('process_constraints_applied')
  applyGeneratedRowPlanRollups(rows)
  logDiagnosticStageTiming('plan_rollups_applied_first')
  restorePackageRhythmWindowRows(rows)
  logDiagnosticStageTiming('package_rhythm_windows_restored')
  applyGeneratedRowPlanRollups(rows)
  logDiagnosticStageTiming('plan_rollups_applied_second')
  applyGeneratedRowTaskStructureGovernance(rows)
  logDiagnosticStageTiming('task_structure_governance_applied')
  applyStartingLineOnboardingClassification({
    rows,
    onboardingSubstage: params.onboardingSubstage,
    projectFacts,
  })
  logDiagnosticStageTiming('starting_line_onboarding_classification_applied')
  attachConstructionOrganizationGeneratedRowProjection(rows, {
    alignCandidateNetworkDates: !masterPlanProfile,
  })
  logDiagnosticStageTiming('construction_organization_projection_attached')
  const residentialMasterPlanV2Applied = await applyResidentialMasterPlanV2Rows({
    rows,
    scopeCombos: generationScopeCombos,
    operation,
    projectFacts,
    masterPlanProfile,
    projectId: params.projectId,
    generationBatchId,
    startDate,
    constructionCalendar,
    algorithmSeedSourcePolicy: params.algorithmSeedSourcePolicy,
  })
  logDiagnosticStageTiming('residential_master_plan_v2_applied', residentialMasterPlanV2Applied ?? {
    source: 'residential_master_plan_v2',
    applied: false,
  })
  const businessTypeMasterPlanProfileApplied = await applyBusinessTypeMasterPlanProfileRows({
    rows,
    operation,
    projectFacts,
    masterPlanProfile,
    projectId: params.projectId,
    generationBatchId,
    startDate,
    constructionCalendar,
    onStageTiming: logDiagnosticStageTiming,
    algorithmSeedSourcePolicy: params.algorithmSeedSourcePolicy,
  })
  logDiagnosticStageTiming('business_type_master_plan_profile_applied', businessTypeMasterPlanProfileApplied ?? {
    source: 'managed_frontier_default_master_plan',
    profileSource: 'business_type_master_plan_profile_v1',
    applied: false,
  })
  const postProfileDependencyScheduleWarning = applyGeneratedDependencySchedule(rows, constructionCalendar)
  if (postProfileDependencyScheduleWarning) dependencyScheduleWarnings.push(postProfileDependencyScheduleWarning)
  logDiagnosticStageTiming('post_profile_dependency_schedule_applied')
  applyGeneratedRowPlanRollups(rows)
  logDiagnosticStageTiming('post_profile_plan_rollups_applied')
  const targetFeasibility = evaluateTargetEndFeasibility(rows, operation, constructionCalendar)
  const targetEndWarning = buildTargetEndGovernanceWarning(targetFeasibility)
  let governanceWarnings = [
    ...collectGeneratedTemplateGovernanceWarnings(rows),
    ...collectScopeAssignmentMissingTargetWarnings(rows, params.scopeAssignmentRules, operation),
    ...dependencyScheduleWarnings,
    ...(targetEndWarning ? [targetEndWarning] : []),
  ]
  const phaseWindows = buildGeneratedPhaseWindows(
    rows,
    generationScopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )
  logDiagnosticStageTiming('phase_windows_built')

  // v1.4.7.3 §13.1: write lineage for each generated row
  for (const row of rows) {
    row.values = {
      ...(row.values as Record<string, unknown>),
      source_template_id: row.values.source_template_id ?? row.values.template_id ?? templateIds[0],
      generation_batch_id: generationBatchId,
    }
  }

  normalizeGeneratedPlanDurationFields(rows)
  const masterPlanCompactionWarning = compactGeneratedMasterPlanInferredBuildingLanes(rows, masterPlanProfile)
  if (masterPlanCompactionWarning) governanceWarnings = [...governanceWarnings, masterPlanCompactionWarning]
  const masterPlanVisibilitySummary = masterPlanProfile
      ? applyDefaultMasterPlanVisibilityPolicy({
        rows,
        businessType: readDefaultMasterPlanBusinessType(operation, projectFacts),
        businessSubtype: normalizeText(
          readRecord(operation.scope).business_subtype
            ?? readRecord(operation.scope).businessSubtype
            ?? projectFacts.businessSubtype
            ?? projectFacts.business_subtype,
        ),
        policyRecords: await resolveDefaultMasterPlanVisibilityPolicy(buildDefaultMasterPlanSeedResolveContext({
          projectId: params.projectId,
          operation,
          projectFacts,
          algorithmSeedSourcePolicy: params.algorithmSeedSourcePolicy,
        })),
      })
    : undefined
  logDiagnosticStageTiming('default_master_plan_visibility_policy_applied', masterPlanVisibilitySummary ?? {
    source: 'default_master_plan_visibility_policy',
    applied: false,
  })
  const executableDefaultMasterPlanAssembly = masterPlanProfile
    ? assembleExecutableDefaultMasterPlanRows({
        rows,
        businessType: readDefaultMasterPlanBusinessType(operation, projectFacts),
        businessSubtype: normalizeText(
          readRecord(operation.scope).business_subtype
            ?? readRecord(operation.scope).businessSubtype
            ?? projectFacts.businessSubtype
            ?? projectFacts.business_subtype,
        ),
        methodVariantCodes: mergeMethodVariantCodesFromFacts(readRecord(operation.scope), projectFacts),
        basementLevelCount: readNumberFromSources(
          [readRecord(operation.scope), projectFacts],
          ['basement_level_count', 'basementLevelCount'],
        ),
        masterPlanProfile,
      })
    : undefined
  if (executableDefaultMasterPlanAssembly) {
    const executableAssemblyDependencyWarning = applyGeneratedDependencySchedule(rows, constructionCalendar)
    if (executableAssemblyDependencyWarning) {
      governanceWarnings = [...governanceWarnings, executableAssemblyDependencyWarning]
    }
    applyGeneratedRowPlanRollups(rows)
    const postScheduleNetworkFinalization = finalizeExecutableDefaultMasterPlanScheduleNetwork(rows)
    executableDefaultMasterPlanAssembly.primaryNetworkBridgeDependencyCount += (
      postScheduleNetworkFinalization.primaryNetworkBridgeDependencyCount
    )
    executableDefaultMasterPlanAssembly.primaryControlSpineDependencyCount += (
      postScheduleNetworkFinalization.primaryControlSpineDependencyCount
    )
    if (
      postScheduleNetworkFinalization.primaryNetworkBridgeDependencyCount > 0
      || postScheduleNetworkFinalization.primaryControlSpineDependencyCount > 0
    ) {
      const finalizedExecutableAssemblyDependencyWarning = applyGeneratedDependencySchedule(rows, constructionCalendar)
      if (finalizedExecutableAssemblyDependencyWarning) {
        governanceWarnings = [...governanceWarnings, finalizedExecutableAssemblyDependencyWarning]
      }
    }
    const finalScheduleStabilization = stabilizeGeneratedDependencyAndRollupSchedule(rows, constructionCalendar)
    if (finalScheduleStabilization.warnings.length > 0) {
      governanceWarnings = [...governanceWarnings, ...finalScheduleStabilization.warnings]
    }
  }
  const residentialMasterPlanHierarchyApplied = executableDefaultMasterPlanAssembly && residentialMasterPlanV2Applied
    ? applyResidentialMasterPlanOrganizationHierarchy({
        rows,
        generationBatchId,
        assembly: executableDefaultMasterPlanAssembly,
      })
    : null
  logDiagnosticStageTiming('residential_master_plan_organization_hierarchy_applied', residentialMasterPlanHierarchyApplied ?? {
    source: RESIDENTIAL_MASTER_PLAN_HIERARCHY_SOURCE,
    applied: false,
  })
  sortGeneratedRowsBySchedule(rows)
  const masterPlanLimitWarning = applyGeneratedMasterPlanProfileLimit(rows, masterPlanProfile)
  if (masterPlanLimitWarning) governanceWarnings = [...governanceWarnings, masterPlanLimitWarning]
  if (executableDefaultMasterPlanAssembly) {
    refreshExecutableDefaultMasterPlanAssemblySummary(rows, executableDefaultMasterPlanAssembly)
  }
  if (attachUnderRowId) {
    rows = applyTaskPlanDrilldownFrontier({
      rows,
      operation,
      attachUnderRowId,
      selectedTemplateNodeIds: templateSelections.flatMap((selection) => (
        selection.selectedNodes.map((node) => node.id)
      )),
      generationBatchId,
    })
  }
  const effectiveRowLimit = attachUnderRowId
    ? TASK_PLAN_DRILLDOWN_ROW_LIMIT
    : WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET
  const finalRowProjectionCounts = countRowProjectionModes(rows)
  if (attachUnderRowId && finalRowProjectionCounts.schedule_row > TASK_PLAN_DRILLDOWN_ROW_LIMIT) {
    throw Object.assign(
      new Error(`Task-plan drilldown exceeds the ${TASK_PLAN_DRILLDOWN_ROW_LIMIT}-row operation limit.`),
      {
        statusCode: 413,
        code: 'TASK_PLAN_DRILLDOWN_ROW_LIMIT_EXCEEDED',
        details: {
          generatedScheduleRowCount: finalRowProjectionCounts.schedule_row,
          rowLimit: TASK_PLAN_DRILLDOWN_ROW_LIMIT,
          attachUnderRowId,
          mutationBoundary: 'rejected_before_task_or_dependency_write',
        },
      },
    )
  }
  const effectiveBatchPlan = buildGenerationBatches({
    generationBatchId,
    templateIds,
    scopeCombos: generationScopeCombos,
    rowCountsByScope: mainPlanRowCountsByScope,
    totalRowCountsByScope,
    rows,
  })
  const effectiveGenerationBatches = attachUnderRowId
    ? effectiveBatchPlan.generationBatches.map((batch) => ({
        ...batch,
        rowLimit: TASK_PLAN_DRILLDOWN_ROW_LIMIT,
        rowLimitExceeded: (batch.rowProjectionCounts?.schedule_row ?? batch.rowCount) > TASK_PLAN_DRILLDOWN_ROW_LIMIT,
      }))
    : effectiveBatchPlan.generationBatches
  const scheduleTrustGate = buildGenerationDepthScheduleTrustGate(rows, generationDepth)
  const scheduleTrustWarning = buildGenerationDepthTrustGovernanceWarning(scheduleTrustGate)
  if (scheduleTrustWarning) governanceWarnings = [...governanceWarnings, scheduleTrustWarning]
  const durationAssetConsumption = masterPlanProfile
    ? buildDefaultMasterPlanAssetConsumption(rows)
    : undefined
  const durationAssetUtilizationSummary = masterPlanProfile && durationAssetConsumption
    ? buildDurationAssetUtilizationSummary(rows, durationAssetConsumption)
    : undefined
  const candidateNetworkEvaluation = masterPlanProfile
    ? executableDefaultMasterPlanAssembly
      ? buildCandidateNetworkEvaluationFromGeneratedDependencies(rows)
      : buildCandidateNetworkEvaluationForGeneratedRows(rows)
    : null

  // v1.4.22.1: onboarding classification summary from row values
  const onboardingSummary = params.onboardingSubstage
    ? { history: rows.filter(r => (r.values.onboarding_stage_classification as string) === 'history').length,
        in_progress: rows.filter(r => (r.values.onboarding_stage_classification as string) === 'in_progress').length,
        future: rows.filter(r => !r.values.onboarding_stage_classification || (r.values.onboarding_stage_classification as string) === 'future').length }
    : undefined

  return {
    generationBatchId,
    templateId: templateIds[0],
    templateIds,
    generationDepth,
    ...(masterPlanProfile ? { defaultPlanOutput: 'master_plan' as const, masterPlanProfile } : {}),
    ...(durationAssetUtilizationSummary ? { durationAssetUtilizationSummary } : {}),
    ...(durationAssetConsumption ? {
      durationAssetConsumptionReceipts: durationAssetConsumption.receipts,
      durationAssetConsumptionSummary: durationAssetConsumption.summary,
    } : {}),
    ...(candidateNetworkEvaluation ? { candidateNetworkEvaluation } : {}),
    ...(executableDefaultMasterPlanAssembly ? { executableDefaultMasterPlanAssembly } : {}),
    ...(masterPlanVisibilitySummary ? { masterPlanVisibilitySummary } : {}),
    ...(masterPlanProfile && constructionCalendar ? { constructionCalendar: sanitizeGeneratedConstructionCalendarContext(constructionCalendar) } : {}),
    rows,
    scopeCombos: generationScopeCombos,
    rowLimit: effectiveRowLimit,
    rowLimitPolicy: effectiveBatchPlan.rowLimitPolicy,
    splitByPhaseApplied: effectiveBatchPlan.splitByPhaseApplied,
    generationBatches: effectiveGenerationBatches,
    suppressedCoreQualityCodes,
    governanceWarnings,
    scheduleTrustGate,
    targetFeasibility,
    phaseWindows,
    onboardingSummary,
  }
}



export async function buildTaskPlanRhythmGeneratedResult(
  params: Parameters<typeof generateWbsTemplateRowsInternal>[0],
): Promise<(Awaited<ReturnType<typeof generateWbsTemplateRowsInternal>> & {
  taskPlanRhythmAssetSummary: TaskPlanRhythmDrilldownResult['assetSummary']
  taskPlanRhythmParentWindowFit: TaskPlanRhythmDrilldownResult['parentWindowFit']
  durationAssetConsumptionReceipts: DurationAssetConsumptionReceipt[]
  durationAssetConsumptionSummary: DurationAssetConsumptionSummary
}) | null> {
  const operation = params.operation
  const drilldownMode = normalizeText(operation.drilldownMode ?? operation.drilldown_mode).toLowerCase()
  const attachUnderRowId = normalizeId(operation.attachUnderRowId)
  const nextLevel = normalizeText(
    operation.drilldownGenerationLevel ?? operation.drilldown_generation_level,
  )
  if (
    params.surface !== 'task_list'
    || drilldownMode !== 'selected_children'
    || !attachUnderRowId
    || (nextLevel !== 'process_detail' && nextLevel !== 'activity_step')
  ) {
    return null
  }

  const parentContextRecord = readRecord(
    operation.drilldownParentContext ?? operation.drilldown_parent_context,
  )
  const parentContext = parentContextRecord as unknown as TaskPlanDrilldownParentContext
  const templateIds = readTemplateIds(operation)
  if (!parentContext.t2RhythmTemplateId || !templateIds.includes(parentContext.t2RhythmTemplateId)) return null

  const projectFacts = readOperationProjectFacts(operation)
  const scopeCombos = readScopeCombos(operation.scope, projectFacts)
  if (scopeCombos.length !== 1) {
    throw Object.assign(new Error('A selected-task rhythm drilldown must resolve to exactly one parent scope.'), {
      statusCode: 422,
      code: 'TASK_PLAN_DRILLDOWN_SCOPE_CARDINALITY_INVALID',
      details: {
        scopeCount: scopeCombos.length,
        mutationBoundary: 'rejected_before_task_or_dependency_write',
      },
    })
  }

  const generationBatchId = normalizeText(operation.generationBatchId) || randomUUID()
  const generated = await buildTaskPlanRhythmDrilldownRows({
    parentContext,
    nextLevel,
    generationBatchId,
    attachUnderRowId,
    projectId: params.projectId,
    companyId: normalizeText(operation.companyId ?? operation.company_id) || null,
    scope: scopeCombos[0] as Record<string, unknown>,
    constructionCalendar: readOperationConstructionCalendar(operation),
  })
  if (!generated) return null
  if (generated.parentWindowFit.decision === 'blocked_by_minimum_rhythm_conflict') {
    throw Object.assign(new Error('Parent task window cannot satisfy the governed T2 minimum rhythm.'), {
      statusCode: 422,
      code: 'TASK_PLAN_DRILLDOWN_PARENT_WINDOW_CONFLICT',
      details: {
        ...generated.parentWindowFit,
        assetConsumptionReceipts: generated.assetConsumptionReceipts,
        mutationBoundary: 'rejected_before_task_or_dependency_write',
      },
    })
  }

  const rows = generated.rows as GeneratedTemplateRow[]
  const projectionCounts = countRowProjectionModes(rows)
  if (projectionCounts.schedule_row > TASK_PLAN_DRILLDOWN_ROW_LIMIT) {
    throw Object.assign(
      new Error(`Task-plan drilldown exceeds the ${TASK_PLAN_DRILLDOWN_ROW_LIMIT}-row operation limit.`),
      {
        statusCode: 413,
        code: 'TASK_PLAN_DRILLDOWN_ROW_LIMIT_EXCEEDED',
        details: {
          rowLimit: TASK_PLAN_DRILLDOWN_ROW_LIMIT,
          scheduleRowCount: projectionCounts.schedule_row,
          generatedRowCount: rows.length,
          sourceParentTaskId: attachUnderRowId,
          mutationBoundary: 'rejected_before_task_or_dependency_write',
        },
      },
    )
  }

  pruneGeneratedHierarchySelfDependencies(rows)
  pruneGeneratedDependencyConflicts(rows)
  pruneGeneratedDependencyCycles(rows)
  const dependencyScheduleWarning = applyGeneratedDependencySchedule(rows, generated.constructionCalendar)
  applyProcessConstraintEffects(rows)
  applyGeneratedRowPlanRollups(rows)
  applyGeneratedRowTaskStructureGovernance(rows)
  normalizeGeneratedPlanDurationFields(rows)
  const scheduleTrustGate = buildGenerationDepthScheduleTrustGate(rows, generated.generationDepth)
  const trustWarning = buildGenerationDepthTrustGovernanceWarning(scheduleTrustGate)
  const targetFeasibility = evaluateTargetEndFeasibility(rows, operation, generated.constructionCalendar)
  const phaseIds = uniqueStringArray(
    scopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )
  const phaseWindows = buildGeneratedPhaseWindows(rows, phaseIds)
  return {
    generationBatchId,
    templateId: generated.templateId,
    templateIds: [generated.templateId],
    generationDepth: generated.generationDepth,
    rows,
    scopeCombos,
    rowLimit: TASK_PLAN_DRILLDOWN_ROW_LIMIT,
    rowLimitPolicy: 'single_batch',
    splitByPhaseApplied: false,
    generationBatches: [{
      batchId: generationBatchId,
      phaseObjectId: phaseIds[0] ?? null,
      scopeIndexes: [0],
      rowCount: rows.length,
      totalRowCount: rows.length,
      rowProjectionCounts: projectionCounts,
      templateIds: [generated.templateId],
      rowLimit: TASK_PLAN_DRILLDOWN_ROW_LIMIT,
      rowLimitExceeded: false,
    }],
    suppressedCoreQualityCodes: [],
    governanceWarnings: [
      ...(dependencyScheduleWarning ? [dependencyScheduleWarning] : []),
      ...(trustWarning ? [trustWarning] : []),
    ],
    scheduleTrustGate,
    targetFeasibility,
    phaseWindows,
    taskPlanRhythmAssetSummary: generated.assetSummary,
    taskPlanRhythmParentWindowFit: generated.parentWindowFit,
    durationAssetConsumptionReceipts: generated.assetConsumptionReceipts,
    durationAssetConsumptionSummary: generated.assetConsumptionSummary,
  }
}



export async function generateWbsTemplateRows(
  params: Parameters<typeof generateWbsTemplateRowsInternal>[0],
): Promise<Awaited<ReturnType<typeof generateWbsTemplateRowsInternal>>> {
  const runtimeArtifactPublications = [...(params.runtimeArtifactPublications ?? [])]
  const effectiveParams = {
    ...params,
    runtimeArtifactPublications,
    runtimeEvidenceMode: params.runtimeEvidenceMode ?? 'no_write' as const,
  }
  const generated = await buildTaskPlanRhythmGeneratedResult(effectiveParams)
    ?? await generateWbsTemplateRowsInternal(effectiveParams)
  const publicGenerated = {
    ...generated,
    rows: sanitizeGeneratedTemplateRowsForPublicOutput(generated.rows),
  }

  if (params.runtimeEvidenceMode === 'record' && params.runtimeConsumerObservationQueryExec) {
    const templateIds = uniqueStringArray([
      normalizeText(generated.templateId),
      ...generated.templateIds.map(normalizeText),
    ].filter(Boolean))
    try {
      await recordWbsTemplateGenerationConsumedArtifacts({
        queryExec: params.runtimeConsumerObservationQueryExec,
        observedAt: normalizeText(params.runtimeConsumerObservedAt) || undefined,
        callContext: {
          projectId: normalizeText(params.projectId) || null,
          generationBatchId: normalizeText(generated.generationBatchId) || null,
          templateId: templateIds[0] ?? null,
          templateIds,
          generationDepth: generated.generationDepth,
          rowCount: generated.rows.length,
        },
        sourceEvidenceRefs: [
          [
            'wbs_template_generation',
            normalizeText(params.projectId) || 'no_project',
            normalizeText(generated.generationBatchId) || 'no_batch',
            templateIds.join('+') || 'no_template',
          ].join(':'),
        ],
        artifacts: buildWbsTemplateGenerationConsumedArtifacts({
          generation: generated,
          runtimeArtifactPublications,
          projectId: params.projectId,
        }),
      })
    } catch (error) {
      if (params.runtimeConsumerErrorHandler) {
        params.runtimeConsumerErrorHandler(error)
      } else {
        logger.warn('[wbsTemplateGenerationService] failed to record WBS template runtime consumer evidence', {
          projectId: params.projectId,
          generationBatchId: generated.generationBatchId,
          templateIds,
          error,
        })
      }
    }
  }

  return publicGenerated
}



export async function generateWbsTemplatePhaseChainRows(params: {
  projectId: string
  surface: PlanningSurface
  operations: PlanningTableOperation[]
  chainMode?: 'sequential' | 'none'
  detailLevel?: WbsTemplateDetailLevel
  diagnosticDurationSuggestionMode?: WbsTemplateDurationSuggestionMode
  phaseReleasePolicies?: Record<string, unknown> | Array<Record<string, unknown>> | null
  runtimeEvidenceMode?: 'record' | 'no_write'
}): Promise<{
  generationBatchId: string
  templateId: string
  templateIds: string[]
  generationDepth: WbsTemplateGenerationDepth
  defaultPlanOutput?: 'master_plan'
  masterPlanProfile?: GeneratedMasterPlanProfile | null
  durationAssetUtilizationSummary?: GeneratedDurationAssetUtilizationSummary
  durationAssetConsumptionReceipts?: DurationAssetConsumptionReceipt[]
  durationAssetConsumptionSummary?: DurationAssetConsumptionSummary
  candidateNetworkEvaluation?: GeneratedCandidateNetworkEvaluation | null
  rows: GeneratedTemplateRow[]
  scopeCombos: WbsTemplateScope[]
  rowLimit: number
  rowLimitPolicy: WbsTemplateGenerationRowLimitPolicy
  splitByPhaseApplied: boolean
  generationBatches: GeneratedTemplateBatch[]
  suppressedCoreQualityCodes: string[]
  governanceWarnings: GeneratedTemplateGovernanceWarning[]
  scheduleTrustGate: GeneratedScheduleTrustGate
  targetFeasibility?: GeneratedTargetFeasibility
  phaseWindows: GeneratedPhaseWindow[]
}> {
  const operations = params.operations.filter((operation) => normalizeText(operation.type ?? operation.op) === 'template_generate')
  if (operations.length === 0) {
    throw Object.assign(new Error('phase chain generation requires at least one template_generate operation'), {
      statusCode: 400,
      code: 'TEMPLATE_PHASE_CHAIN_OPERATION_REQUIRED',
    })
  }

  const chainMode = params.chainMode ?? 'sequential'
  const phaseResults: Awaited<ReturnType<typeof generateWbsTemplateRowsInternal>>[] = []
  const releasePolicyByPhaseId = new Map<string, WbsTemplatePhaseReleasePolicy>()
  const criticalChainPhaseIds: string[] = []
  const explicitReleasePolicies = buildExplicitPhaseReleasePolicyMap(params.phaseReleasePolicies)
  let projectStartDate: string | null = null
  let previousPhaseStart: string | null = null
  let previousPhaseEnd: string | null = null
  let previousPhaseDurationDays = 0
  for (const [index, operation] of operations.entries()) {
    const requestedStartDate = readGenerationStartDate(operation)
    projectStartDate = projectStartDate ?? requestedStartDate
    const releasePolicy = scalePhaseReleasePolicyByProjectFacts(
      resolvePhaseReleasePolicy(operation, index, explicitReleasePolicies),
      operation,
    )
    const operationStartDate = chainMode === 'sequential' && index > 0
      ? computePhaseReleaseStartDate({
        projectStartDate,
        previousStartDate: previousPhaseStart,
        previousEndDate: previousPhaseEnd,
        previousDurationDays: previousPhaseDurationDays,
        policy: releasePolicy,
      })
      : requestedStartDate
    const generated = await generateWbsTemplateRowsInternal({
      projectId: params.projectId,
      surface: params.surface,
      operation: {
        ...operation,
        generationBatchId: normalizeText(operation.generationBatchId) || `phase-chain:${index + 1}`,
        plannedStartDate: operationStartDate,
        startDate: operationStartDate,
      },
      detailLevel: params.detailLevel,
      diagnosticDurationSuggestionMode: params.diagnosticDurationSuggestionMode,
      runtimeEvidenceMode: params.runtimeEvidenceMode ?? 'no_write',
      scopeAssignmentRules: readScopeAssignmentRulesFromOperation(operation),
    })
    phaseResults.push(generated)
    const phaseIds = uniqueStringArray(generated.scopeCombos.map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean))
    for (const phaseId of phaseIds) releasePolicyByPhaseId.set(phaseId, releasePolicy)
    if (chainMode === 'sequential' && releasePolicy.mode !== 'parallel_group') {
      const latestEnd = generated.rows
        .map(readGeneratedRowPlanEnd)
        .filter((date): date is string => Boolean(date))
        .sort(comparePlanDates)
        .at(-1)
      previousPhaseStart = operationStartDate
      previousPhaseEnd = latestEnd ?? operationStartDate
      previousPhaseDurationDays = daysInclusive(previousPhaseStart, previousPhaseEnd)
      criticalChainPhaseIds.push(...phaseIds)
    }
  }

  const rows = phaseResults.flatMap((result) => result.rows)
  const chainConstructionCalendar = await resolveGenerationConstructionCalendar({
    operation: operations[0],
    projectId: params.projectId,
    masterPlanProfile: phaseResults.find((result) => result.masterPlanProfile)?.masterPlanProfile ?? null,
  })
  applyGeneratedPhaseChainDependencies(
    rows,
    chainMode === 'sequential'
      ? criticalChainPhaseIds
      : [],
    releasePolicyByPhaseId,
  )
  rebuildGeneratedDependencyNetwork(rows, chainConstructionCalendar)
  applyProcessConstraintEffects(rows)
  const targetOperation = operations.find((operation) => readTargetConstraintContext(operation).targetEndDate) ?? operations[0]
  applyGeneratedRowPlanRollups(rows)
  applyGeneratedRowTaskStructureGovernance(rows)
  attachConstructionOrganizationGeneratedRowProjection(rows, {
    alignCandidateNetworkDates: !phaseResults.some((result) => result.masterPlanProfile)
      && !operations.some((phaseOperation) => readOperationGeneratedMasterPlanProfile(phaseOperation)),
  })
  const targetFeasibility = targetOperation
    ? evaluateTargetEndFeasibility(rows, targetOperation, chainConstructionCalendar)
    : undefined
  const targetEndWarning = buildTargetEndGovernanceWarning(targetFeasibility)
  let governanceWarnings = [
    ...phaseResults.flatMap((result) => result.governanceWarnings.filter((warning) => warning.code !== 'TARGET_END_OVERSHOOT')),
    ...collectGeneratedTemplateGovernanceWarnings(rows),
    ...operations.flatMap((phaseOperation) => (
      collectScopeAssignmentMissingTargetWarnings(rows, readScopeAssignmentRulesFromOperation(phaseOperation), phaseOperation)
    )),
    ...(targetEndWarning ? [targetEndWarning] : []),
  ]
  const scheduleTrustGate = buildGenerationDepthScheduleTrustGate(
    rows,
    phaseResults[0]?.generationDepth ?? 'item_work',
  )
  const scheduleTrustWarning = buildGenerationDepthTrustGovernanceWarning(scheduleTrustGate)
  if (scheduleTrustWarning) governanceWarnings = [...governanceWarnings, scheduleTrustWarning]
  const phaseWindows = buildGeneratedPhaseWindows(
    rows,
    chainMode === 'sequential'
      ? criticalChainPhaseIds
      : phaseResults.flatMap((result) => result.scopeCombos).map((scope) => normalizeText(scope.phase_object_id)).filter(Boolean),
  )

  const generationBatchId = normalizeText(operations[0]?.generationBatchId) || phaseResults[0]?.generationBatchId || randomUUID()
  const templateIds = uniqueStringArray(phaseResults.flatMap((result) => result.templateIds))
  const scopeCombos = phaseResults.flatMap((result) => result.scopeCombos)
  const generationBatches = phaseResults.flatMap((result, phaseIndex) => result.generationBatches.map((batch) => ({
    ...batch,
    batchId: `${generationBatchId}:phase-chain-${phaseIndex + 1}:${batch.batchId}`,
  })))
  const masterPlanProfile = phaseResults.find((result) => result.masterPlanProfile)?.masterPlanProfile
    ?? operations.map((operation) => readOperationGeneratedMasterPlanProfile(operation)).find((profile): profile is GeneratedMasterPlanProfile => Boolean(profile))
    ?? null
  normalizeGeneratedPlanDurationFields(rows)
  sortGeneratedRowsBySchedule(rows)
  const masterPlanLimitWarning = applyGeneratedMasterPlanProfileLimit(rows, masterPlanProfile)
  if (masterPlanLimitWarning) governanceWarnings = [...governanceWarnings, masterPlanLimitWarning]
  const durationAssetConsumption = masterPlanProfile
    ? buildDefaultMasterPlanAssetConsumption(rows)
    : undefined
  const durationAssetUtilizationSummary = masterPlanProfile && durationAssetConsumption
    ? buildDurationAssetUtilizationSummary(rows, durationAssetConsumption)
    : undefined
  const candidateNetworkEvaluation = masterPlanProfile
    ? buildCandidateNetworkEvaluationForGeneratedRows(rows)
    : null
  return {
    generationBatchId,
    templateId: templateIds[0] ?? phaseResults[0]?.templateId ?? '',
    templateIds,
    generationDepth: phaseResults[0]?.generationDepth ?? 'item_work',
    ...(masterPlanProfile ? { defaultPlanOutput: 'master_plan' as const, masterPlanProfile } : {}),
    ...(durationAssetUtilizationSummary ? { durationAssetUtilizationSummary } : {}),
    ...(durationAssetConsumption ? {
      durationAssetConsumptionReceipts: durationAssetConsumption.receipts,
      durationAssetConsumptionSummary: durationAssetConsumption.summary,
    } : {}),
    ...(candidateNetworkEvaluation ? { candidateNetworkEvaluation } : {}),
    rows: sanitizeGeneratedTemplateRowsForPublicOutput(rows),
    scopeCombos,
    rowLimit: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    rowLimitPolicy: generationBatches.length > 1 ? 'split_by_phase' : 'single_batch',
    splitByPhaseApplied: generationBatches.length > 1 || phaseResults.some((result) => result.splitByPhaseApplied),
    generationBatches,
    suppressedCoreQualityCodes: uniqueStringArray(phaseResults.flatMap((result) => result.suppressedCoreQualityCodes)),
    governanceWarnings,
    scheduleTrustGate,
    targetFeasibility,
    phaseWindows,
  }
}



export async function listWbsTemplateCatalog(options: { includeNodes?: boolean; projectIds?: string[] | null; companyId?: string | null } = {}): Promise<WbsTemplateCatalogResponse> {
  const includeNodes = Boolean(options.includeNodes)
  void options.projectIds
  void options.companyId

  const mainBuiltInNodes = includeNodes
    ? getSerializedBuiltInTemplateNodes(CHINA_GB55032_TEMPLATE_CATALOG)
    : undefined
  const mainBuiltInEvidenceSummary = buildEvidenceSummaryFromCatalog(CHINA_GB55032_TEMPLATE_CATALOG)
  const builtInTemplates = BUILT_IN_WBS_TEMPLATE_CATALOGS.map((catalog) => (
    buildBuiltInTemplateCatalogItem(catalog, {
      includeNodes: includeNodes && catalog.templateId !== CHINA_GB55032_TEMPLATE_ID,
    })
  ))

  return {
    builtIn: {
      templateId: CHINA_GB55032_TEMPLATE_CATALOG.templateId,
      templateCode: CHINA_GB55032_TEMPLATE_CATALOG.templateCode,
      templateName: CHINA_GB55032_TEMPLATE_CATALOG.templateName,
      sourceStandard: CHINA_GB55032_TEMPLATE_CATALOG.sourceStandard,
      sourceVersion: CHINA_GB55032_TEMPLATE_CATALOG.sourceVersion,
      divisionCount: CHINA_GB55032_TEMPLATE_CATALOG.divisions.length,
      nodeCount: flattenChinaTemplateCatalog().length,
      packType: getCatalogPackType(CHINA_GB55032_TEMPLATE_CATALOG),
      templateGroup: getCatalogTemplateGroup(CHINA_GB55032_TEMPLATE_CATALOG),
      generationPolicy: getCatalogGenerationPolicy(CHINA_GB55032_TEMPLATE_CATALOG),
      evidenceSummary: mainBuiltInEvidenceSummary,
      nodes: mainBuiltInNodes,
    },
    templates: builtInTemplates,
  }
}



export async function getWbsTemplateCatalogItem(templateId: string): Promise<WbsTemplateCatalogItem> {
  const catalog = getBuiltInTemplateCatalog(templateId)
  if (catalog) return buildBuiltInTemplateCatalogItem(catalog, { includeNodes: true })

  throw buildTemplateCatalogNotFoundError(templateId)
}



export function validateChinaGb50300Seed(options: { strict?: boolean } = {}): WbsTemplateSeedValidationResult {
  const nodes = flattenChinaTemplateCatalog()
  const issues: WbsTemplateSeedValidationResult['issues'] = []
  const catalogGroupCounts = Object.fromEntries(
    WBS_TEMPLATE_CATALOG_GROUPS.map((group) => [
      group,
      BUILT_IN_WBS_TEMPLATE_CATALOGS.filter((catalog) => getCatalogPackType(catalog) === group).length,
    ]),
  ) as Record<WbsTemplateCatalogGroup, number>

  const divisionCount = nodes.filter((node) => node.categoryType === 'division').length
  const subDivisionCount = nodes.filter((node) => node.categoryType === 'sub_division').length
  const itemWorkCount = nodes.filter((node) => node.categoryType === 'item_work').length
  const processCount = nodes.filter((node) => node.categoryType === 'process').length
  const activityStepCount = nodes.filter((node) => node.categoryType === 'activity_step').length
  const reviewNeededCount = nodes.filter((node) => node.reviewNeeded).length
  const webVerifiedFalseCount = nodes.filter((node) => node.webVerified === false).length
  const processNodes = nodes.filter((node) => node.categoryType === 'process')
  const activityStepNodes = nodes.filter((node) => node.categoryType === 'activity_step')
  const disciplineProcessCount = processNodes.filter((node) => readRecord(node.metadata).processPackLevel === 'discipline_package').length
  const genericFallbackProcessCount = processNodes.filter((node) => readRecord(node.metadata).processPackLevel === 'generic_fallback').length
  const disciplineActivityStepCount = activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource === 'discipline_activity_step_pack').length
  const genericActivityStepCount = activityStepNodes.filter((node) => readRecord(node.metadata).activityStepSource === 'generic_checklist').length
  const uniqueProcessNameCount = new Set(processNodes.map((node) => node.name)).size
  const uniqueActivityStepNameCount = new Set(activityStepNodes.map((node) => node.name)).size

  if (divisionCount !== 10) {
    issues.push({ code: 'DIVISION_COUNT_INVALID', severity: 'error', message: 'The national standard catalog must contain exactly 10 divisions.' })
  }

  if (genericFallbackProcessCount > 0 || genericActivityStepCount > 0) {
    issues.push({
      code: 'GENERIC_FALLBACK_REMAINS',
      severity: 'error',
      message: 'The formal built-in seed must not retain generic fallback processes or generic checklist activity steps.',
    })
  }

  const allCatalogNodes = BUILT_IN_WBS_TEMPLATE_CATALOGS.flatMap((catalog) => flattenCatalogNodes(catalog.divisions).map((node) => ({
    catalog,
    node,
  })))
  const stableCodeCounts = new Map<string, number>()
  allCatalogNodes.forEach(({ node }) => {
    const code = normalizeText(node.stableCode)
    if (code) stableCodeCounts.set(code, (stableCodeCounts.get(code) ?? 0) + 1)
  })
  for (const [stableCode, count] of stableCodeCounts) {
    if (count > 1) {
      issues.push({
        code: 'CATALOG_STABLE_CODE_DUPLICATED',
        severity: 'error',
        nodeCode: stableCode,
        message: '7 ? Catalog Group ? stableCode ??????',
      })
    }
  }

  for (const catalog of BUILT_IN_WBS_TEMPLATE_CATALOGS) {
    const group = getCatalogPackType(catalog)
    if (!WBS_TEMPLATE_CATALOG_GROUPS.includes(group)) {
      issues.push({
        code: 'CATALOG_GROUP_INVALID',
        severity: 'error',
        nodeCode: catalog.templateId,
        message: 'packType ???? 7 ??? Catalog Group',
      })
    }
    if (group !== 'core_quality' && getCatalogStableCodePrefix(catalog) === 'CQ') {
      issues.push({
        code: 'CATALOG_PREFIX_CONFLICT',
        severity: 'error',
        nodeCode: catalog.templateId,
        message: '? core_quality ?????? core_quality stableCode ??',
      })
    }
  }

  const dangerProcesses = allCatalogNodes
    .filter(({ catalog, node }) => getCatalogPackType(catalog) === 'danger_control' && node.categoryType === 'process')
  for (const { node } of dangerProcesses) {
    const conditions = readArray(readRecord(node.metadata).triggerConditions)
    if (conditions.length === 0 || conditions.some((condition) => {
      const record = readRecord(condition)
      return !normalizeText(record.sourceField) || !normalizeText(record.operator)
    })) {
      issues.push({
        code: 'DANGER_TRIGGER_CONDITION_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '危大工程工序必须声明可由工程对象 metadata 或工程特征派生的 triggerConditions',
      })
    }
  }

  const milestoneProcesses = allCatalogNodes
    .filter(({ catalog, node }) => getCatalogPackType(catalog) === 'project_milestone' && node.categoryType === 'process')
  for (const projectType of WBS_TEMPLATE_PROJECT_TYPE_CODES) {
    const covered = milestoneProcesses.some(({ node }) => readCodeArray(readRecord(node.metadata).applicableProjectTypes).includes(projectType))
    if (!covered) {
      issues.push({
        code: 'PROJECT_TYPE_MILESTONE_COVERAGE_MISSING',
        severity: 'error',
        nodeCode: projectType,
        message: '???????????????? project_milestone ????',
      })
    }
  }

  for (const group of WBS_TEMPLATE_CATALOG_GROUPS) {
    if ((catalogGroupCounts[group] ?? 0) <= 0) {
      issues.push({
        code: 'CATALOG_GROUP_MISSING',
        severity: 'error',
        nodeCode: group,
        message: 'Top-level Catalog Group must have at least one registered catalog',
      })
    }
  }

  const stableCodesByGroup = new Map<WbsTemplateCatalogGroup, Set<string>>()
  for (const group of WBS_TEMPLATE_CATALOG_GROUPS) stableCodesByGroup.set(group, new Set())
  for (const { catalog, node } of allCatalogNodes) {
    stableCodesByGroup.get(getCatalogPackType(catalog))?.add(normalizeText(node.stableCode))
  }

  const referenceFields = DEPENDENCY_INTENT_REFERENCE_FIELDS

  for (const { catalog, node } of allCatalogNodes) {
    const metadata = readRecord(node.metadata)
    const referencedCodes = referenceFields.flatMap(({ field, group }) => (
      readStringArray(metadata[field]).map((code) => ({ field, group, code }))
    ))
    if (
      getCatalogPackType(catalog) === 'project_milestone'
      && node.categoryType === 'process'
      && (
        metadata.isAcceptanceMilestone === true
        || normalizeText(metadata.relationRole) === 'inspection'
        || /验收|acceptance/i.test(node.name)
      )
      && !referencedCodes.some((reference) => reference.group === 'core_quality' || reference.group === 'specialty')
    ) {
      issues.push({
        code: 'SPECIAL_ACCEPTANCE_EXECUTION_REFERENCE_MISSING',
        severity: 'warn',
        nodeCode: node.stableCode,
        message: 'Specialty or acceptance project_milestone has no physical-work stableCode reference. Add the reference for physical acceptance, or keep it as governance-only for external approval/filing.',
        details: {
          relationRole: metadata.relationRole ?? null,
          isAcceptanceMilestone: metadata.isAcceptanceMilestone ?? false,
        },
      })
    }
    if (referencedCodes.length === 0) continue

    const fromCatalogGroup = getCatalogPackType(catalog)
    const rawRelationRole = normalizeText(metadata.relationRole)
    const relationRole = ([
      'workflow',
      'evidence',
      'inspection',
      'approval',
      'handover',
      'commercial',
      'prerequisite',
      'management',
      'projected_link',
    ].includes(rawRelationRole) ? rawRelationRole : 'workflow') as V1475DependencyRelationRole
    const dependencyIntentResolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup,
      fromReferencedCode: node.stableCode,
      metadata,
    })
    const hasBusinessConstraintReferences = referencedCodes.some((reference) => (
      !isV1475ConstructionMainlineReference(relationRole, fromCatalogGroup, reference.group, node.stableCode, reference.code)
    ))
    if (node.categoryType === 'process' && hasBusinessConstraintReferences && dependencyIntentResolution.intents.length === 0) {
      issues.push({
        code: 'DEPENDENCY_INTENT_TEMPLATE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Referenced process nodes must emit dependencyIntentTemplates only for cross-business-domain constraints',
        details: {
          relationRole,
          auditSummary: dependencyIntentResolution.summary,
          rejectedAuditTraces: dependencyIntentResolution.audit
            .filter((item) => item.decision === 'rejected')
            .slice(0, 5)
            .map((item) => ({
              matchedReferenceField: item.matchedReferenceField,
              reasonCode: item.reasonCode,
              confidenceLevel: item.confidenceLevel,
              confidenceScore: item.confidenceScore,
              auditTrace: item.auditTrace,
            })),
        },
      })
    }
    for (const reference of referencedCodes) {
      const resolvedReferenceGroup = resolveV1475ReferenceCatalogGroup({
        declaredGroup: reference.group,
        field: reference.field,
        code: reference.code,
      })
      const inferredGroup = inferV1475ReferenceCatalogGroupFromCode(reference.code)
      if (resolvedReferenceGroup.normalized) {
        issues.push({
          code: 'CATALOG_REFERENCE_FIELD_GROUP_MISMATCH',
          severity: 'error',
          nodeCode: node.stableCode,
          message: `${reference.field} references ${reference.code}, but stableCode prefix belongs to ${resolvedReferenceGroup.group}`,
          details: {
            referenceField: reference.field,
            declaredGroup: reference.group,
            inferredGroup,
            effectiveGroup: resolvedReferenceGroup.group,
            referenceCode: reference.code,
          },
        })
      }
      if (!stableCodesByGroup.get(resolvedReferenceGroup.group)?.has(reference.code)) {
        issues.push({
          code: 'CATALOG_REFERENCE_NOT_FOUND',
          severity: 'error',
          nodeCode: node.stableCode,
          message: `${reference.field} references missing ${resolvedReferenceGroup.group} code ${reference.code}`,
          details: {
            declaredGroup: reference.group,
            effectiveGroup: resolvedReferenceGroup.group,
          },
        })
      }
    }
  }

  for (const { catalog, node } of allCatalogNodes) {
    const group = getCatalogPackType(catalog)
    if (!['site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support'].includes(group)) continue
    const evidenceSources = readArray(readRecord(node.metadata).evidenceSources)
    const catalogSourceStandards = getCatalogSourceStandards(catalog)
    if (evidenceSources.length === 0 && catalogSourceStandards.length === 0 && !node.sourceStandard) {
      issues.push({
        code: 'CATALOG_GROUP_EVIDENCE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Supplemental Catalog Group nodes must keep evidence sources for auditability',
      })
    }
  }

  for (const { node } of allCatalogNodes) {
    if (!['process', 'activity_step'].includes(node.categoryType)) continue
    const metadata = readRecord(node.metadata)
    if (!normalizeExecutionNature(metadata.executionNature ?? metadata.execution_nature)) {
      issues.push({
        code: 'EXECUTION_NATURE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '工序和作业步骤必须声明 executionNature，用于区分真实物理施工、技术准备、检测验收、监测等待、资料记录、管理动作和移交节点',
      })
    }
    if (!readDeclaredControlRoles(metadata)) {
      issues.push({
        code: 'CONTROL_ROLES_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Process and activity-step nodes must declare the six cross-cutting control roles: quality, safety, acceptance, document, commercial and management.',
      })
    }
  }

  for (const node of nodes) {
    if (!node.stableCode || !node.name || !node.sourceStandard || !node.sourceVersion || !node.sourceClauseRef) {
      issues.push({
        code: 'NODE_REQUIRED_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Template node is missing stable code, name, or source metadata.',
      })
    }
    if (node.expectedChildCount !== undefined && (node.children ?? []).length !== node.expectedChildCount) {
      issues.push({
        code: 'EXPECTED_CHILD_COUNT_MISMATCH',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Template node declared child count does not match actual child count.',
      })
    }
    if (node.categoryType === 'item_work' && !(node.children ?? []).some((child) => child.categoryType === 'process')) {
      issues.push({
        code: 'ITEM_WORK_PROCESS_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Every item_work node must contain at least one process.',
      })
    }
    if (node.categoryType === 'item_work' && (node.children ?? []).filter((child) => child.categoryType === 'process').length < 3) {
      issues.push({
        code: 'ITEM_WORK_PROCESS_COUNT_TOO_LOW',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '????????????? 3 ??????',
      })
    }
    const metadata = readRecord(node.metadata)
    const evidenceSources = readArray(metadata.evidenceSources)
    if (!metadata.verificationStatus || !metadata.evidenceLevel || evidenceSources.length === 0) {
      issues.push({
        code: 'NODE_EVIDENCE_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '??????????? verificationStatus?evidenceLevel ? evidenceSources',
      })
    }
    if ((node.categoryType === 'process' || node.categoryType === 'activity_step') && ['GB55032-2022', 'GB50300-2013'].includes(node.sourceStandard)) {
      issues.push({
        code: 'EXECUTION_NODE_SOURCE_STANDARD_INVALID',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Process and activity-step nodes must not claim GB source text directly; they must land as enterprise-method evidence.',
      })
    }
    if (node.categoryType === 'item_work' && readArray(metadata.qualityStandardCodes).length === 0) {
      issues.push({
        code: 'ITEM_WORK_QUALITY_STANDARD_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '每个分项工程必须绑定质量验收标准代码',
      })
    }
    if (node.categoryType === 'process' && (readArray(metadata.preconditionTemplates).length === 0 || readArray(metadata.acceptanceCheckpoints).length === 0 || !metadata.resourceProfile)) {
      issues.push({
        code: 'PROCESS_COMMERCIAL_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '每个工序必须具备开工条件、验收检查点和资源画像元数据',
      })
    }
    if (node.categoryType === 'process' && (metadata.processSource !== 'enterprise_method' || !['discipline_package', 'generic_fallback'].includes(String(metadata.processPackLevel ?? '')) || !metadata.confidence)) {
      issues.push({
        code: 'PROCESS_PACK_GOVERNANCE_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Every process must declare processSource, processPackLevel and confidence to distinguish specialty process packs from fallback processes.',
      })
    }
    if (node.categoryType === 'activity_step' && !['discipline_activity_step_pack', 'generic_checklist'].includes(String(metadata.activityStepSource ?? ''))) {
      issues.push({
        code: 'ACTIVITY_STEP_SOURCE_METADATA_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Every activity step must declare activityStepSource to identify specialty steps versus generic checklist steps.',
      })
    }
    if ((node.categoryType === 'process' || node.categoryType === 'activity_step') && !normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)) {
      issues.push({
        code: 'DURATION_CONTRIBUTION_MODE_MISSING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '工序和作业步骤必须声明 durationContributionMode，用于区分施工承载、检查、等待、资料和移交动作',
      })
    }
    const activityStepChildren = (node.children ?? []).filter((child) => child.categoryType === 'activity_step')
    const durationContributionMode = normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)
    const minimumActivityStepCount = isDurationBearingContributionMode(durationContributionMode) ? 2 : 1
    if (node.categoryType === 'process' && activityStepChildren.length < minimumActivityStepCount) {
      issues.push({
        code: 'PROCESS_ACTIVITY_STEP_COUNT_TOO_LOW',
        severity: 'error',
        nodeCode: node.stableCode,
        message: 'Process activity_step split must match durationContributionMode: duration-bearing construction processes need at least 2 steps; inspection, waiting, document and handover actions need at least 1 step.',
      })
    }
    if (options.strict && (node.reviewNeeded || node.webVerified === false)) {
      issues.push({
        code: 'NODE_REVIEW_PENDING',
        severity: 'error',
        nodeCode: node.stableCode,
        message: '正式验收模式下 seed 节点不能有 reviewNeeded 与 webVerified=false',
      })
    } else if (node.reviewNeeded || node.webVerified === false) {
      issues.push({
        code: 'NODE_REVIEW_PENDING',
        severity: 'warn',
        nodeCode: node.stableCode,
        message: '该节点需要后续标准原文校对，开发阶段允许作为 warn',
      })
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    divisionCount,
    subDivisionCount,
    itemWorkCount,
    processCount,
    activityStepCount,
    reviewNeededCount,
    webVerifiedFalseCount,
    disciplineProcessCount,
    genericFallbackProcessCount,
    disciplineActivityStepCount,
    genericActivityStepCount,
    uniqueProcessNameCount,
    uniqueActivityStepNameCount,
    catalogGroupCounts,
    issues,
  }
}



export function buildTemplateGenerateCreateOperations(rows: GeneratedTemplateRow[]) {
  const operations: PlanningTableOperation[] = []
  for (const row of rows) {
    operations.push({
      type: 'create_row',
      clientRowId: row.clientRowId,
      tempId: row.clientRowId,
      parentId: row.parentClientRowId ?? row.parentRowId,
      sortOrder: row.sortOrder,
      values: sanitizeGeneratedRowValuesForCreate(row.values),
    })
  }
  for (const row of rows) {
    if (row.predecessorDependencies.length === 0) continue
    operations.push({
      type: 'set_predecessors',
      rowId: row.clientRowId,
      predecessorTaskIds: row.predecessorClientRowIds,
      predecessorDependencies: row.predecessorDependencies,
    })
  }
  return operations
}
