import { describe, expect, it } from 'vitest'

import { listAlgorithmSeedTypes } from '../services/algorithmSeedRegistry.js'
import {
  buildAlgorithmRuleAssetRelationshipMatrix,
} from '../scripts/diagnose-algorithm-rule-asset-relationship-matrix.js'

describe('algorithm rule asset relationship matrix', () => {
  it('builds a read-only current-code matrix across algorithms seeds rule assets facts and admission scan', () => {
    const matrix = buildAlgorithmRuleAssetRelationshipMatrix()

    expect(matrix.matrixCode).toBe('v14231_algorithm_rule_asset_relationship_matrix')
    expect(matrix.status).toBe('pass')
    expect(matrix.gaps).toEqual({
      duplicateNodeIds: [],
      duplicateEdgeIds: [],
      seedTypesWithoutRuleAsset: [],
      seedTypesWithoutSeedCatalogEntry: [],
      projectFactsWithoutConsumerEdge: [],
      ruleAssetConsumersWithoutEdge: [],
      autoDiscoveredAssetsMissingRegistration: [],
      runtimeBoundaryViolations: [],
    })
    expect(matrix.runtimeBoundary).toEqual({
      writesRuntime: false,
      writesSeeds: false,
      writesTaskDependencies: false,
      writesPlanDates: false,
      declaresProductionReady: false,
    })
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'relationship_matrix_is_read_only_current_code_evidence',
      'matrix_does_not_publish_runtime_assets',
      'matrix_does_not_grant_production_ready_status',
    ]))

    for (const seedType of listAlgorithmSeedTypes()) {
      expect(matrix.nodesById[`rule_asset:${seedType}`], `${seedType} rule asset node`).toEqual(expect.objectContaining({
        kind: 'rule_asset',
      }))
      expect(matrix.nodesById[`seed_catalog:${seedType}`], `${seedType} seed catalog node`).toEqual(expect.objectContaining({
        kind: 'seed_catalog',
      }))
      expect(matrix.edgesById[`seed_catalog:${seedType}->rule_asset:${seedType}:catalogs_rule_asset`]).toEqual(expect.objectContaining({
        relation: 'catalogs_rule_asset',
      }))
    }

    expect(matrix.edgesById['project_fact:businessType->consumer:wbsTemplateGenerationService:consumed_by']).toEqual(expect.objectContaining({
      relation: 'consumed_by',
      evidenceRefs: expect.arrayContaining(['projectGenerationFactsConsumerRegistry']),
    }))
    expect(matrix.edgesById['rule_asset:projectGenerationFacts->consumer:wbsTemplateGenerationService:consumed_by']).toEqual(expect.objectContaining({
      relation: 'consumed_by',
      evidenceRefs: expect.arrayContaining(['algorithmRuleAssetInventoryService']),
    }))
    expect(matrix.edgesById['main_algorithm:durationSuggestionService->consumer:PlanningTreeTable:consumed_by']).toEqual(expect.objectContaining({
      relation: 'consumed_by',
      evidenceRefs: expect.arrayContaining(['algorithmCatalogService']),
    }))
    expect(matrix.edgesById['auto_discovered_asset:durationContextPolicyLearningService->source_file:server/src/services/durationContextPolicyLearningService.ts:implemented_in']).toEqual(expect.objectContaining({
      relation: 'implemented_in',
      evidenceRefs: expect.arrayContaining(['v14AssetAdmissionAutomationService']),
    }))
  })
})
