import { auditBusinessTypeRegistry } from './businessTypeRegistryService.js'
import { auditSpatialSemanticDictionary } from './spatialSemanticDictionaryService.js'

export type BusinessSpatialWbsConsumerCoverageStatus =
  | 'non_live_consumer_coverage_ready'
  | 'consumer_coverage_gap'

export type BusinessSpatialWbsConsumerCoverageRow = {
  consumerKey: string
  ownerService: string
  sourceFields: string[]
  registryUsed: Array<'businessTypeRegistry' | 'spatialSemanticDictionary' | 'experienceTierRegistry' | 't2RhythmTemplateRegistry'>
  normalizationPath: string[]
  rejectsUnknown: boolean
  allowedLegacyCompatibility: string[]
  businessTypeAuditUsed: boolean
  spatialAuditUsed: boolean
  wbsConsumerCoverage: 'covered' | 'guard_only' | 'explicit_gap'
  status: BusinessSpatialWbsConsumerCoverageStatus
  evidenceRefs: string[]
  mutationBoundary: {
    readsRuntimeReader: false
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesRuntimePublications: false
  }
}

export type BusinessSpatialWbsConsumerCoverageMatrix = {
  matrixCode: 'c1902_c1903_business_spatial_wbs_consumer_coverage'
  status: BusinessSpatialWbsConsumerCoverageStatus
  summary: {
    rowCount: number
    readyRowCount: number
    gapRowCount: number
    businessTypeRegistryStatus: ReturnType<typeof auditBusinessTypeRegistry>['status']
    spatialSemanticDictionaryStatus: ReturnType<typeof auditSpatialSemanticDictionary>['status']
    canDeclareNonLiveConsumerCoverageClosed: boolean
  }
  rows: BusinessSpatialWbsConsumerCoverageRow[]
  liveOnlyBlockers: string[]
  boundaryPolicy: string[]
}

const NO_WRITE_MUTATION_BOUNDARY = {
  readsRuntimeReader: false,
  writesTaskDependencies: false,
  writesPlanDates: false,
  writesSeed: false,
  writesRuntimePublications: false,
} as const

const REQUIRED_CONSUMER_ROWS: BusinessSpatialWbsConsumerCoverageRow[] = [
  {
    consumerKey: 'projectFactsToTemplateService.businessTypeNormalization',
    ownerService: 'projectFactsToTemplateService',
    sourceFields: ['ProjectGenerationFacts.businessType', 'ProjectGenerationFacts.businessSubtype'],
    registryUsed: ['businessTypeRegistry'],
    normalizationPath: [
      'mapT2RhythmBusinessTypeCodeToFormalBusinessTypes',
      'residential/commercial compatibility -> general_civil',
      'getBusinessTypeRecommendation',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: ['residential', 'commercial'],
    businessTypeAuditUsed: true,
    spatialAuditUsed: false,
    wbsConsumerCoverage: 'covered',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/projectFactsToTemplateService.ts:normalizeGenerationBusinessFacts',
      'server/src/services/businessTypeRegistryService.ts:mapT2RhythmBusinessTypeCodeToFormalBusinessTypes',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    consumerKey: 'projectScenarioTaxonomyService.formalBusinessTypes',
    ownerService: 'projectScenarioTaxonomyService',
    sourceFields: ['businessTypeCode', 'recommendationPack.businessType'],
    registryUsed: ['businessTypeRegistry'],
    normalizationPath: [
      'PRODUCT_BUSINESS_TYPE_CODES imports FORMAL_BUSINESS_TYPE_CODES',
      'recommendation pack keys are checked by businessTypeRegistryGuard',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: [],
    businessTypeAuditUsed: true,
    spatialAuditUsed: false,
    wbsConsumerCoverage: 'covered',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/projectScenarioTaxonomyService.ts:PRODUCT_BUSINESS_TYPE_CODES',
      'server/src/__tests__/businessTypeRegistryGuard.test.ts',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    consumerKey: 't2DivisionRhythmTemplateRegistryService.businessAndPhaseCoverage',
    ownerService: 't2DivisionRhythmTemplateRegistryService',
    sourceFields: [
      'template.applicability.businessTypeCodes',
      'template.applicability.phaseWindows',
      'template.applicability.requiredScopeDimensions',
    ],
    registryUsed: ['businessTypeRegistry', 'spatialSemanticDictionary', 't2RhythmTemplateRegistry'],
    normalizationPath: [
      'auditT2DivisionRhythmTemplateRegistry.systemBusinessTypeCoverage',
      'businessTypeRegistryGuard scans T2 businessType literals',
      'spatialSemanticGuard scans T2 phaseWindow literals',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: ['residential', 'commercial'],
    businessTypeAuditUsed: true,
    spatialAuditUsed: true,
    wbsConsumerCoverage: 'covered',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/t2DivisionRhythmTemplateRegistryService.ts:auditT2DivisionRhythmTemplateRegistry',
      'server/src/__tests__/businessTypeRegistryGuard.test.ts',
      'server/src/__tests__/spatialSemanticGuard.test.ts',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    consumerKey: 'constructionScopeInferenceService.spatialSemantics',
    ownerService: 'constructionScopeInferenceService',
    sourceFields: ['system:*', 'workface:*', 'phaseWindow:*', 'positionBasis:*'],
    registryUsed: ['spatialSemanticDictionary'],
    normalizationPath: [
      'normalizeSpatialSemanticCode',
      'spatialSemanticGuard scans construction-scope inference literals',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: [],
    businessTypeAuditUsed: false,
    spatialAuditUsed: true,
    wbsConsumerCoverage: 'covered',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/constructionScopeInferenceService.ts',
      'server/src/services/spatialSemanticDictionaryService.ts:normalizeSpatialSemanticCode',
      'server/src/__tests__/spatialSemanticGuard.test.ts',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    consumerKey: 'wbsSeedSemanticGovernanceService.seedSemanticAudit',
    ownerService: 'wbsSeedSemanticGovernanceService',
    sourceFields: ['catalogGroup', 'categoryType', 'durationContributionMode', 'executionNature', 'businessTypeRegistryAudit'],
    registryUsed: ['businessTypeRegistry', 'spatialSemanticDictionary'],
    normalizationPath: [
      'collectWbsSeedSemanticGovernanceReport.businessTypeRegistryAudit',
      'spatial semantic dictionary is enforced by coverage matrix and guard before release claims',
      'candidate payload carries registry audit only and keeps runtime mutation boundary closed',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: ['legacy Chinese WBS template type labels stay compatibility-only'],
    businessTypeAuditUsed: true,
    spatialAuditUsed: true,
    wbsConsumerCoverage: 'guard_only',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/wbsSeedSemanticGovernanceService.ts:collectWbsSeedSemanticGovernanceReport',
      'server/src/services/wbsSeedSemanticGovernanceService.ts:persistWbsSeedSemanticGovernanceCandidateEvents',
      'server/src/__tests__/businessTypeRegistryGuard.test.ts',
      'server/src/__tests__/spatialSemanticGuard.test.ts',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    consumerKey: 'wbsTemplateGenerationService.businessSpatialInputs',
    ownerService: 'wbsTemplateGenerationService',
    sourceFields: ['businessType', 'scopeDimensions', 'phaseWindow', 'engineeringObjectType'],
    registryUsed: ['businessTypeRegistry', 'spatialSemanticDictionary'],
    normalizationPath: [
      'ProjectGenerationFacts -> projectFactsToTemplateService',
      'scope assignment metadata -> spatialSemanticDictionary audit',
      'generation consumer coverage is locked by this matrix before non-live closure',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: ['legacy WBS template type labels only through businessTypeRegistry compatibility mapping'],
    businessTypeAuditUsed: true,
    spatialAuditUsed: true,
    wbsConsumerCoverage: 'guard_only',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/wbsTemplateGenerationService.ts',
      'server/src/services/projectFactsToTemplateService.ts',
      'server/src/services/spatialSemanticDictionaryService.ts:auditSpatialSemanticDictionary',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
  {
    consumerKey: 'projectGenerationFactsConsumerRegistry.wbsAndTemplateConsumers',
    ownerService: 'projectGenerationFactsConsumerRegistry',
    sourceFields: ['projectGenerationFacts.consumerEdges', 'businessType', 'scale', 'scope', 'deliveryModel'],
    registryUsed: ['businessTypeRegistry', 'spatialSemanticDictionary'],
    normalizationPath: [
      'ProjectGenerationFacts consumer matrix',
      'business/spatial WBS coverage matrix row must exist before non-live closeout',
    ],
    rejectsUnknown: true,
    allowedLegacyCompatibility: [],
    businessTypeAuditUsed: true,
    spatialAuditUsed: true,
    wbsConsumerCoverage: 'covered',
    status: 'non_live_consumer_coverage_ready',
    evidenceRefs: [
      'server/src/services/projectGenerationFactsConsumerRegistry.ts',
      'server/src/__tests__/v14231NonLiveCloseoutContract.test.ts',
    ],
    mutationBoundary: NO_WRITE_MUTATION_BOUNDARY,
  },
]

export function buildBusinessSpatialWbsConsumerCoverageMatrix(): BusinessSpatialWbsConsumerCoverageMatrix {
  const businessTypeAudit = auditBusinessTypeRegistry()
  const spatialAudit = auditSpatialSemanticDictionary()
  const rows = REQUIRED_CONSUMER_ROWS.map((row) => ({
    ...row,
    sourceFields: [...row.sourceFields],
    registryUsed: [...row.registryUsed],
    normalizationPath: [...row.normalizationPath],
    allowedLegacyCompatibility: [...row.allowedLegacyCompatibility],
    evidenceRefs: [...row.evidenceRefs],
    mutationBoundary: { ...row.mutationBoundary },
  }))
  const gapRows = rows.filter((row) => row.status === 'consumer_coverage_gap')
  const canDeclareNonLiveConsumerCoverageClosed = businessTypeAudit.status === 'ready'
    && spatialAudit.status === 'ready'
    && gapRows.length === 0

  return {
    matrixCode: 'c1902_c1903_business_spatial_wbs_consumer_coverage',
    status: canDeclareNonLiveConsumerCoverageClosed
      ? 'non_live_consumer_coverage_ready'
      : 'consumer_coverage_gap',
    summary: {
      rowCount: rows.length,
      readyRowCount: rows.length - gapRows.length,
      gapRowCount: gapRows.length,
      businessTypeRegistryStatus: businessTypeAudit.status,
      spatialSemanticDictionaryStatus: spatialAudit.status,
      canDeclareNonLiveConsumerCoverageClosed,
    },
    rows,
    liveOnlyBlockers: [
      'runtime_reader_replay_not_proven',
      'live_wbs_generation_consumption_not_replayed',
      'l5_release_chain_not_closed',
      'e1_e5_runtime_evidence_not_archived',
    ],
    boundaryPolicy: [
      'matrix_is_read_only_non_live_contract',
      'guard_only_rows_must_not_be_claimed_as_live_runtime_consumption',
      'legacy_wbs_labels_are_compatibility_inputs_only',
      'no_task_dependency_plan_date_seed_or_runtime_publication_writes',
    ],
  }
}
