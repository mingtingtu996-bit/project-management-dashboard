import { describe, expect, it } from 'vitest'
import {
  WBS_TASK_STRUCTURE_PIPELINE_NAME,
  WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS,
  WBS_TASK_STRUCTURE_RULE_ASSETS,
  WBS_TASK_STRUCTURE_PIPELINE_STAGES,
  buildWbsTaskStructureGovernanceMetadata,
  buildWbsTaskStructureGovernanceProfile,
  diagnoseWbsTaskStructureRuleAssetInventory,
  getWbsRuleAssetGovernanceMetrics,
  mergeWbsTaskStructureGovernanceMetadata,
  getWbsTaskStructurePipelineStage,
} from '../services/wbsTaskStructureGovernancePipelineService.js'

describe('wbs task structure governance pipeline contract', () => {
  it('keeps parent plan rollup before final task code generation', () => {
    const stageNames = WBS_TASK_STRUCTURE_PIPELINE_STAGES.map((stage) => stage.stage)

    expect(stageNames).toEqual([
      'scope_resolution',
      'template_or_manual_structure_generation',
      'task_standard_inference',
      'wbs_semantic_inference',
      'wbs_plan_rollup',
      'task_code_generation',
      'lineage_and_snapshot',
      'downstream_governance_consumption',
    ])
    expect(stageNames.indexOf('wbs_plan_rollup')).toBeLessThan(stageNames.indexOf('task_code_generation'))
  })

  it('marks rollup as the edit/commit gate and task code as write-chain finalization', () => {
    expect(getWbsTaskStructurePipelineStage('wbs_plan_rollup')).toEqual(expect.objectContaining({
      service: 'wbsPlanRollupService',
      role: 'plan_rollup_gate',
      gate: 'edit_commit_gate',
    }))

    expect(getWbsTaskStructurePipelineStage('task_code_generation')).toEqual(expect.objectContaining({
      service: 'taskCodeGenerationService',
      role: 'identity_finalization',
      gate: 'write_chain_only',
    }))
  })

  it('builds generated-row metadata without treating downstream algorithms as structure writers', () => {
    expect(buildWbsTaskStructureGovernanceMetadata({
      source: 'template_generate',
      rollupApplied: true,
      taskCodeFinalized: false,
      lineageExpected: true,
    })).toEqual(expect.objectContaining({
      pipeline: WBS_TASK_STRUCTURE_PIPELINE_NAME,
      contractVersion: 'v1.4.22-wbs-task-structure-governance-assets-20260527',
      source: 'template_generate',
      rollupApplied: true,
      taskCodeFinalization: 'write_chain_only',
      downstreamAlgorithmsCanRewriteStructure: false,
      downstreamPolicy: 'consume_or_explain_only',
    }))
  })

  it('explicitly inventories WBS structure seed and code-consumed rule assets', () => {
    const assetsByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => [asset.key, asset]))

    expect(assetsByKey.get('chinaGb50300TemplateCatalog')).toEqual(expect.objectContaining({
      category: 'template_catalog',
      canRewriteStructure: true,
    }))
    expect(assetsByKey.get('domainWbsTemplateCatalogs')).toEqual(expect.objectContaining({
      category: 'template_catalog',
      canRewriteStructure: true,
    }))
    expect(assetsByKey.get('standard_work_duration_seed')).toEqual(expect.objectContaining({
      category: 'registry_seed',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('durationContributionMode')).toEqual(expect.objectContaining({
      category: 'code_consumed_rule_asset',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('v1475DependencyIntentTemplates')).toEqual(expect.objectContaining({
      category: 'code_consumed_rule_asset',
      canRewriteStructure: true,
    }))
    expect(assetsByKey.get('dataQualityService')).toEqual(expect.objectContaining({
      category: 'downstream_diagnostic',
      canRewriteStructure: false,
      downstreamOnly: true,
    }))
  })

  it('keeps service governance assets in the same WBS chain inventory', () => {
    const assetsByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => [asset.key, asset]))

    expect(assetsByKey.get('engineeringObjectService')).toEqual(expect.objectContaining({
      category: 'service_governance_asset',
      stage: 'scope_resolution',
    }))
    expect(assetsByKey.get('taskCodeRuleService')).toEqual(expect.objectContaining({
      category: 'code_consumed_rule_asset',
      stage: 'task_code_generation',
    }))
    expect(assetsByKey.get('dataLineageService')).toEqual(expect.objectContaining({
      category: 'service_governance_asset',
      stage: 'lineage_and_snapshot',
    }))
    expect(assetsByKey.get('planningSnapshotService')).toEqual(expect.objectContaining({
      category: 'service_governance_asset',
      stage: 'lineage_and_snapshot',
    }))
  })

  it('models the WBS rule asset system beyond the write chain', () => {
    const layersByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => [layer.key, layer]))

    expect(layersByKey.get('structure_seed_layer')).toEqual(expect.objectContaining({
      writesTaskStructure: true,
      assetKeys: expect.arrayContaining(['chinaGb50300TemplateCatalog', 'domainWbsTemplateCatalogs']),
    }))
    expect(layersByKey.get('duration_seed_layer')).toEqual(expect.objectContaining({
      writesTaskStructure: false,
      assetKeys: expect.arrayContaining(['standard_work_duration_seed', 'durationContributionMode']),
    }))
    expect(layersByKey.get('dependency_rule_layer')).toEqual(expect.objectContaining({
      writesTaskStructure: true,
      assetKeys: expect.arrayContaining([
        'workflow_dictionary',
        'standard_internal_flow',
        'v1475CrossItemWorkflowSeed',
        'v1475DependencyIntentTemplates',
        'v1474ProcessConstraintSeed',
      ]),
    }))
    expect(layersByKey.get('asset_governance_layer')).toEqual(expect.objectContaining({
      writesTaskStructure: false,
      extraAssets: expect.arrayContaining([
        expect.objectContaining({ key: 'algorithmSeedRegistry' }),
        expect.objectContaining({ key: 'algorithmSeedResolver' }),
        expect.objectContaining({ key: 'wbsTemplateSeedArchitectureGovernanceService' }),
      ]),
    }))
  })

  it('includes diagnostic and governance support assets in the WBS rule asset system', () => {
    const layersByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => [layer.key, layer]))

    expect(layersByKey.get('diagnostic_translation_layer')).toEqual(expect.objectContaining({
      writesTaskStructure: false,
      assetKeys: expect.arrayContaining(['dataQualityService', 'dataQualityRuleRegistry']),
    }))

    expect(layersByKey.get('asset_governance_layer')).toEqual(expect.objectContaining({
      extraAssets: expect.arrayContaining([
        expect.objectContaining({ key: 'algorithmSeedCandidateDiscoveryService' }),
        expect.objectContaining({ key: 'algorithmSeedAutoGovernanceService' }),
        expect.objectContaining({ key: 'algorithmSeedImportService' }),
        expect.objectContaining({ key: 'wbsSeedSemanticGovernanceService' }),
      ]),
    }))
  })

  it('explicitly includes upstream template selection, template enhancement and feedback assets', () => {
    const assetsByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => [asset.key, asset]))
    const layersByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => [layer.key, layer]))

    expect(assetsByKey.get('projectFactsToTemplateService')).toEqual(expect.objectContaining({
      runtimeRole: 'template_selector',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('projectTypeRecommendations')).toEqual(expect.objectContaining({
      category: 'code_consumed_rule_asset',
      runtimeRole: 'template_selector',
    }))
    expect(assetsByKey.get('projectScenarioTaxonomyService')).toEqual(expect.objectContaining({
      category: 'code_consumed_rule_asset',
      runtimeRole: 'scenario_taxonomy_resolver',
    }))
    expect(assetsByKey.get('buildingPatternExecutionResolver')).toEqual(expect.objectContaining({
      category: 'code_consumed_rule_asset',
      runtimeRole: 'building_pattern_execution_resolver',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('constructionOrganizationScenarioSelector')).toEqual(expect.objectContaining({
      category: 'service_governance_asset',
      role: expect.stringContaining('virtual_network'),
      runtimeRole: 'construction_organization_scenario_selector',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('projectFeatureToItemPackMap')).toEqual(expect.objectContaining({
      runtimeRole: 'template_selector',
    }))
    expect(assetsByKey.get('scopeAssignmentRulesService')).toEqual(expect.objectContaining({
      runtimeRole: 'scope_mapper',
    }))
    expect(assetsByKey.get('wbsTemplateProjectRecommendations')).toEqual(expect.objectContaining({
      runtimeRole: 'template_selector',
    }))
    expect(assetsByKey.get('wbsTemplateSemanticOverrides')).toEqual(expect.objectContaining({
      runtimeRole: 'semantic_classifier',
    }))
    expect(assetsByKey.get('wbsTemplateEvidenceRefEnrichment')).toEqual(expect.objectContaining({
      runtimeRole: 'traceability_recorder',
    }))
    expect(assetsByKey.get('durationSuggestionService')).toEqual(expect.objectContaining({
      runtimeRole: 'duration_parameter',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('wbsReferenceDaysInference')).toEqual(expect.objectContaining({
      runtimeRole: 'duration_parameter',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('wbsTemplateCandidateEventService')).toEqual(expect.objectContaining({
      runtimeRole: 'governance_only',
      canRewriteStructure: false,
    }))

    expect(layersByKey.get('structure_seed_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining([
        'projectFactsToTemplateService',
        'projectScenarioTaxonomyService',
        'buildingPatternExecutionResolver',
        'constructionOrganizationScenarioSelector',
        'projectTypeRecommendations',
        'projectFeatureToItemPackMap',
        'scopeAssignmentRulesService',
        'wbsTemplateProjectRecommendations',
      ]),
    }))
    expect(layersByKey.get('duration_seed_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['durationSuggestionService', 'wbsReferenceDaysInference', 'templateDurationGovernanceService']),
    }))
    expect(layersByKey.get('semantic_control_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['wbsTemplateSemanticOverrides', 'constructionScopeInferenceService']),
    }))
    expect(layersByKey.get('identity_traceability_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['wbsTemplateEvidenceRefEnrichment']),
    }))
    expect(layersByKey.get('asset_governance_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['wbsTemplateFeedback', 'wbsTemplateCandidateEventService', 'constructionOrganizationScenarioGovernanceService']),
      extraAssets: expect.arrayContaining([
        expect.objectContaining({ key: 'constructionDependencyRuleSystemService' }),
        expect.objectContaining({ key: 'wbsTemplateCatalogIndex' }),
        expect.objectContaining({ key: 'wbsReconciliationService' }),
        expect.objectContaining({ key: 'wbsTemplatePresets' }),
      ]),
    }))
  })

  it('includes boundary lineage, gate, constraint and coverage assets without granting structure write access', () => {
    const assetsByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => [asset.key, asset]))
    const layersByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => [layer.key, layer]))

    expect(assetsByKey.get('workEnvironment')).toEqual(expect.objectContaining({
      runtimeRole: 'semantic_classifier',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('planSnapshotSeedVersions')).toEqual(expect.objectContaining({
      runtimeRole: 'traceability_recorder',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('dataLineageGovernanceService')).toEqual(expect.objectContaining({
      runtimeRole: 'diagnostic_only',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('executionGateSeedService')).toEqual(expect.objectContaining({
      runtimeRole: 'execution_gate_deriver',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('taskConstraintGovernanceService')).toEqual(expect.objectContaining({
      runtimeRole: 'constraint_diagnostic',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('wbsTemplateRealProjectCoverageMatrix')).toEqual(expect.objectContaining({
      runtimeRole: 'governance_only',
      canRewriteStructure: false,
    }))

    expect(layersByKey.get('semantic_control_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['workEnvironment']),
    }))
    expect(layersByKey.get('identity_traceability_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['planSnapshotSeedVersions']),
    }))
    expect(layersByKey.get('diagnostic_translation_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['dataLineageGovernanceService', 'executionGateSeedService', 'taskConstraintGovernanceService']),
    }))
    expect(layersByKey.get('asset_governance_layer')).toEqual(expect.objectContaining({
      assetKeys: expect.arrayContaining(['wbsTemplateRealProjectCoverageMatrix']),
    }))
  })

  it('keeps WBS rule asset inventory and system layers consistent', () => {
    const assetKeys = new Set(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => asset.key))
    expect(assetKeys.size).toBe(WBS_TASK_STRUCTURE_RULE_ASSETS.length)

    const layerKeys = new Set(WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.map((layer) => layer.key))
    expect(layerKeys.size).toBe(WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.length)

    const layerAssetKeys = new Set(
      WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.flatMap((layer) => layer.assetKeys),
    )
    expect(layerAssetKeys.size).toBe(
      WBS_TASK_STRUCTURE_RULE_ASSET_SYSTEM_LAYERS.reduce((total, layer) => total + layer.assetKeys.length, 0),
    )

    const allowedRuntimeRoles = new Set([
      'structure_writer',
      'duration_parameter',
      'dependency_candidate',
      'dependency_rule',
      'semantic_classifier',
      'identity_finalizer',
      'traceability_recorder',
      'diagnostic_only',
      'governance_only',
      'template_selector',
      'scenario_taxonomy_resolver',
      'building_pattern_execution_resolver',
      'construction_organization_scenario_selector',
      'construction_organization_plan_option_candidate_event_adapter',
      'scope_mapper',
      'execution_gate_deriver',
      'constraint_diagnostic',
    ])

    for (const key of layerAssetKeys) {
      expect(assetKeys.has(key), `${key} must exist in WBS_TASK_STRUCTURE_RULE_ASSETS`).toBe(true)
    }

    for (const asset of WBS_TASK_STRUCTURE_RULE_ASSETS) {
      expect(asset.runtimeRole, `${asset.key} must declare runtimeRole`).toBeTruthy()
      expect(allowedRuntimeRoles.has(asset.runtimeRole), `${asset.key} runtimeRole must be supported`).toBe(true)
      if (!asset.downstreamOnly && asset.category !== 'service_governance_asset') {
        expect(layerAssetKeys.has(asset.key), `${asset.key} must belong to a rule asset system layer`).toBe(true)
      }
    }
  })

  it('separates structure writers from parameters, candidates, identity and diagnostics', () => {
    const assetsByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => [asset.key, asset]))

    expect(assetsByKey.get('chinaGb50300TemplateCatalog')).toEqual(expect.objectContaining({
      runtimeRole: 'structure_writer',
    }))
    expect(assetsByKey.get('standard_work_duration_seed')).toEqual(expect.objectContaining({
      runtimeRole: 'duration_parameter',
    }))
    expect(assetsByKey.get('workflow_dictionary')).toEqual(expect.objectContaining({
      runtimeRole: 'dependency_candidate',
      canRewriteStructure: false,
    }))
    expect(assetsByKey.get('taskCodeGenerationService')).toEqual(expect.objectContaining({
      runtimeRole: 'identity_finalizer',
    }))
    expect(assetsByKey.get('dataQualityRuleRegistry')).toEqual(expect.objectContaining({
      runtimeRole: 'diagnostic_only',
      downstreamOnly: true,
    }))
  })

  it('marks durationContributionMode as both a duration parameter and required write contract field', () => {
    const assetsByKey = new Map(WBS_TASK_STRUCTURE_RULE_ASSETS.map((asset) => [asset.key, asset]))

    expect(assetsByKey.get('durationContributionMode')).toEqual(expect.objectContaining({
      runtimeRole: 'duration_parameter',
      requiredWriteContract: true,
      writeContractField: 'duration_contribution_mode',
      hardGate: 'error_block_save',
      canRewriteStructure: false,
    }))
  })

  it('diagnoses likely WBS rule assets that are not explicitly registered', () => {
    const diagnostics = diagnoseWbsTaskStructureRuleAssetInventory([
      { key: 'standard_internal_flow', source: 'server/src/seeds/standardInternalFlowSeed.ts' },
      { key: 'unregistered_duration_seed', source: 'server/src/seeds/unregisteredDurationSeed.ts' },
      { key: 'ordinaryUtility', source: 'server/src/services/ordinaryUtility.ts' },
    ])

    expect(diagnostics).toEqual(expect.objectContaining({
      missingLikelyAssetCount: 1,
      missingLikelyAssets: [
        expect.objectContaining({
          key: 'unregistered_duration_seed',
          reason: 'likely_wbs_rule_asset_not_registered',
        }),
      ],
    }))
  })

  it('builds a compact metadata profile that can replace full rule asset payloads on task rows', () => {
    const profile = buildWbsTaskStructureGovernanceProfile()
    const metadata = buildWbsTaskStructureGovernanceMetadata({
      source: 'template_generate',
      rollupApplied: true,
      taskCodeFinalized: false,
      lineageExpected: true,
      compactProfile: true,
    })

    expect(profile).toEqual(expect.objectContaining({
      contractVersion: 'v1.4.22-wbs-task-structure-governance-assets-20260527',
      assetProfileHash: expect.stringMatching(/^wbs-assets-[a-f0-9]{12}$/),
      assetKeys: expect.arrayContaining(['durationContributionMode', 'workflow_dictionary', 'wbsPlanRollupService']),
      layerKeys: expect.arrayContaining(['duration_seed_layer', 'dependency_rule_layer']),
      requiredWriteContractFields: ['duration_contribution_mode'],
    }))
    expect(metadata.ruleAssets).toBeUndefined()
    expect(metadata.ruleAssetSystemLayers).toBeUndefined()
    expect(metadata.ruleAssetProfile).toEqual(expect.objectContaining({
      assetProfileHash: profile.assetProfileHash,
      requiredWriteContractFields: ['duration_contribution_mode'],
    }))
  })

  it('exposes workflow dictionary candidate governance metrics without promoting it to runtime dependency writes', () => {
    const metrics = getWbsRuleAssetGovernanceMetrics()

    expect(metrics.workflowDictionary).toEqual(expect.objectContaining({
      runtimeRole: 'dependency_candidate',
      canRewriteStructure: false,
      directRuntimeDependencyWritesAllowed: false,
      candidateGovernanceMetrics: expect.arrayContaining([
        'weak_keyword_match_ratio',
        'curated_internal_flow_promotion_rate',
        'unresolved_candidate_count',
      ]),
    }))
  })

  it('includes the explicit asset inventory in metadata while keeping data quality consume-only', () => {
    const metadata = buildWbsTaskStructureGovernanceMetadata({
      source: 'manual_task_write',
      rollupApplied: true,
      taskCodeFinalized: true,
      lineageExpected: true,
    })

    expect(metadata.ruleAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'standard_work_duration_seed', category: 'registry_seed', runtimeRole: 'duration_parameter' }),
      expect.objectContaining({ key: 'durationContributionMode', category: 'code_consumed_rule_asset', runtimeRole: 'duration_parameter' }),
      expect.objectContaining({ key: 'workflow_dictionary', runtimeRole: 'dependency_candidate', canRewriteStructure: false }),
      expect.objectContaining({ key: 'projectFactsToTemplateService', runtimeRole: 'template_selector', canRewriteStructure: false }),
      expect.objectContaining({ key: 'scopeAssignmentRulesService', runtimeRole: 'scope_mapper', canRewriteStructure: false }),
      expect.objectContaining({ key: 'planSnapshotSeedVersions', runtimeRole: 'traceability_recorder', canRewriteStructure: false }),
      expect.objectContaining({ key: 'executionGateSeedService', runtimeRole: 'execution_gate_deriver', canRewriteStructure: false }),
      expect.objectContaining({ key: 'taskConstraintGovernanceService', runtimeRole: 'constraint_diagnostic', canRewriteStructure: false }),
      expect.objectContaining({ key: 'wbsPlanRollupService', runtimeRole: 'structure_writer', canRewriteStructure: true }),
      expect.objectContaining({ key: 'wbsTemplateCandidateEventService', runtimeRole: 'governance_only', canRewriteStructure: false }),
      expect.objectContaining({ key: 'dataQualityService', category: 'downstream_diagnostic', runtimeRole: 'diagnostic_only', downstreamOnly: true }),
      expect.objectContaining({ key: 'dataQualityRuleRegistry', category: 'downstream_diagnostic', runtimeRole: 'diagnostic_only', downstreamOnly: true }),
    ]))
    expect(metadata.ruleAssetSystemLayers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'duration_seed_layer',
        assetKeys: expect.arrayContaining(['standard_work_duration_seed', 'durationContributionMode']),
      }),
      expect.objectContaining({
        key: 'dependency_rule_layer',
        assetKeys: expect.arrayContaining(['workflow_dictionary', 'standard_internal_flow', 'v1475CrossItemWorkflowSeed']),
      }),
    ]))
    expect(metadata.dataQualityRole).toBe('diagnose_and_recommend_only')
    expect(metadata.dataQualityCanBlockDirectly).toBe(false)
  })

  it('marks write-chain records as task-code-finalized without dropping prior rollup evidence', () => {
    const previous = buildWbsTaskStructureGovernanceMetadata({
      source: 'template_generate',
      rollupApplied: true,
      taskCodeFinalized: false,
      lineageExpected: true,
    })

    expect(mergeWbsTaskStructureGovernanceMetadata(previous, {
      source: 'template_generate',
      taskCodeFinalized: true,
    })).toEqual(expect.objectContaining({
      pipeline: WBS_TASK_STRUCTURE_PIPELINE_NAME,
      source: 'template_generate',
      rollupApplied: true,
      lineageExpected: true,
      taskCodeFinalized: true,
      taskCodeFinalization: 'write_chain_only',
    }))
  })
})
