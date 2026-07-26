// Compatibility facade. Domain implementation lives in the acyclic WBS generation modules below.

export {
  CHINA_GB55032_TEMPLATE_CODE,
  CHINA_GB55032_TEMPLATE_ID,
  CHINA_GB55032_TEMPLATE_NAME,
  CHINA_GB55032_TEMPLATE_SOURCE_STANDARD,
  CHINA_GB55032_TEMPLATE_SOURCE_VERSION,
  WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
  WBS_TEMPLATE_GENERATION_SERVER_ROW_LIMIT,
  WBS_TEMPLATE_GENERATION_SPLIT_BY_PHASE_ENABLED,
  buildWbsTemplateGenerationConsumedArtifacts,
  recordWbsTemplateGenerationRuntimeConsumption,
} from './wbsTemplateGenerationFoundation.js'

export type {
  GeneratedAccelerationProposal,
  GeneratedAccelerationProposalAction,
  GeneratedCandidateNetworkEvaluation,
  GeneratedDurationAssetUtilizationSummary,
  GeneratedMasterPlanProfile,
  GeneratedPhaseWindow,
  GeneratedRowProjectionMode,
  GeneratedScheduleTrustGate,
  GeneratedTargetFeasibility,
  GeneratedTemplateBatch,
  GeneratedTemplateDependency,
  GeneratedTemplateDurationSuggestion,
  GeneratedTemplateGovernanceWarning,
  GeneratedTemplateProcessConstraintEffect,
  GeneratedTemplateProcessConstraintRoutingCandidate,
  GeneratedTemplateRow,
  RecordWbsTemplateGenerationRuntimeConsumptionInput,
  WbsTemplateCatalogGroupSelection,
  WbsTemplateCatalogItem,
  WbsTemplateCatalogNode,
  WbsTemplateCatalogResponse,
  WbsTemplateEvidenceSummary,
  WbsTemplateGenerationDepth,
  WbsTemplateGenerationRowLimitPolicy,
  WbsTemplateGenerationRuntimeArtifactPublication,
  WbsTemplateGenerationRuntimeEvidenceSummary,
  WbsTemplateScope,
  WbsTemplateSeedValidationResult,
} from './wbsTemplateGenerationFoundation.js'

export {
  loadWbsTemplateNodes,
} from './wbsTemplateScopeClassificationService.js'

export {
  applyProcessConstraintEffects,
  buildCandidateNetworkEvaluationForGeneratedRows,
  buildCandidateNetworkEvaluationFromGeneratedDependencies,
} from './wbsTemplateDependencyCandidateService.js'

export {
  buildTemplateGenerateCreateOperations,
  generateWbsTemplatePhaseChainRows,
  generateWbsTemplateRows,
  getWbsTemplateCatalogItem,
  listWbsTemplateCatalog,
  validateChinaGb50300Seed,
} from './wbsTemplateGenerationOrchestrator.js'
