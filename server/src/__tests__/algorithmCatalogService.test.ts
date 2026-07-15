import { describe, expect, it } from 'vitest'

import {
  getAlgorithmGovernanceCatalogDiagnostics,
  listAlgorithmCaliberVersions,
  listAlgorithmCatalogEntries,
  listAlgorithmSeedCatalogEntries,
} from '../services/algorithmCatalogService.js'
import { listAlgorithmRuleAssets } from '../services/algorithmRuleAssetInventoryService.js'
import { listAlgorithmSeedTypes } from '../services/algorithmSeedRegistry.js'

describe('algorithmCatalogService', () => {
  it('registers the v1.4.22 main algorithm catalog without exposing technical fields to ordinary users', () => {
    const algorithms = listAlgorithmCatalogEntries()

    expect(algorithms).toHaveLength(35)
    expect(new Set(algorithms.map((algorithm) => algorithm.algorithmKey)).size).toBe(35)
    expect(algorithms.map((algorithm) => algorithm.algorithmKey)).toEqual(expect.arrayContaining([
      'baselineGenerationService',
      'monthlyPlanGenerationService',
      'planningReplayCalibrationService',
      'durationSuggestionService',
      'taskDurationForecastService',
      'projectCriticalPathService',
      'projectRemainingDurationForecastService',
      'scheduleAccelerationService',
      'projectHealthService',
      'algorithmSeedResolver',
      'algorithmSeedImportService',
    ]))
    expect(algorithms.every((algorithm) => algorithm.ordinaryUserVisible === false)).toBe(true)
    expect(algorithms.every((algorithm) => algorithm.implementationPath.startsWith('server/src/services/'))).toBe(true)
  })

  it('publishes a current caliber version for every registered algorithm', () => {
    const algorithms = listAlgorithmCatalogEntries()
    const versions = listAlgorithmCaliberVersions()

    expect(versions).toHaveLength(algorithms.length)
    expect(new Set(versions.map((version) => version.algorithmKey))).toEqual(
      new Set(algorithms.map((algorithm) => algorithm.algorithmKey)),
    )
    expect(versions.every((version) => version.inputSources.length > 0)).toBe(true)
    expect(versions.every((version) => version.outputFields.length > 0)).toBe(true)
    expect(versions.every((version) => version.consumerScope.length > 0)).toBe(true)
  })

  it('derives seed catalog entries from registry seeds and catalog-only rule assets', () => {
    const seedCatalog = listAlgorithmSeedCatalogEntries()
    const seedCatalogByKey = new Map(seedCatalog.map((entry) => [entry.seedKey, entry]))

    for (const seedType of listAlgorithmSeedTypes()) {
      expect(seedCatalogByKey.get(seedType), `${seedType} must be in algorithm_seed_catalog`).toEqual(expect.objectContaining({
        seedKey: seedType,
        seedType,
        registryStatus: 'registry_seed',
      }))
    }

    for (const asset of listAlgorithmRuleAssets().filter((item) => item.lifecycleType !== 'algorithm_seed')) {
      expect(seedCatalogByKey.get(asset.key), `${asset.key} must be catalog_only`).toEqual(expect.objectContaining({
        seedKey: asset.key,
        registryStatus: 'catalog_only',
      }))
    }
    expect(seedCatalogByKey.get('algorithm_seed_upgrade_candidates')).toEqual(expect.objectContaining({
      registryStatus: 'catalog_only',
      lifecycleStatus: 'candidate_only',
    }))
    expect(seedCatalogByKey.get('algorithm_seed_overrides')).toEqual(expect.objectContaining({
      registryStatus: 'catalog_only',
      runtimeEffect: 'scoped_runtime_override',
    }))
  })

  it('publishes catalog-only entries for full-repo discovered phase 1-3 governance assets', () => {
    const seedCatalogByKey = new Map(listAlgorithmSeedCatalogEntries().map((entry) => [entry.seedKey, entry]))

    expect(seedCatalogByKey.get('acceptanceTimelineTemplateSeed')).toEqual(expect.objectContaining({
      registryStatus: 'catalog_only',
      seedFile: 'server/src/seeds/acceptanceTimelineTemplateSeed.ts',
      lifecycleStatus: 'candidate_only',
    }))
    expect(seedCatalogByKey.get('durationContextPolicyLearningService')).toEqual(expect.objectContaining({
      registryStatus: 'catalog_only',
      seedFile: 'server/src/services/durationContextPolicyLearningService.ts',
      lifecycleStatus: 'governance_only',
    }))
    expect(seedCatalogByKey.get('algorithmSeedCandidateDiscoveryJob')).toEqual(expect.objectContaining({
      registryStatus: 'catalog_only',
      seedFile: 'server/src/jobs/algorithmSeedCandidateDiscoveryJob.ts',
      lifecycleStatus: 'governance_only',
    }))
  })

  it('reports a passing catalog diagnostic for current code facts', () => {
    const diagnostics = getAlgorithmGovernanceCatalogDiagnostics()

    expect(diagnostics.status).toBe('pass')
    expect(diagnostics.summary).toEqual(expect.objectContaining({
      expectedMainAlgorithmCount: 35,
      algorithmCatalogCount: 35,
      registrySeedTypeCount: listAlgorithmSeedTypes().length,
      ordinaryUserVisibleAlgorithmCount: 0,
    }))
    expect(diagnostics.gaps).toEqual(expect.objectContaining({
      duplicateAlgorithmKeys: [],
      duplicateSeedKeys: [],
      missingAlgorithmImplementationPaths: [],
      missingRegistrySeedCatalogEntries: [],
      nonRegistryRuleAssetsMissingCatalogEntries: [],
      ordinaryUserVisibleAlgorithmKeys: [],
    }))
    expect(diagnostics.boundaryPolicy).toEqual(expect.arrayContaining([
      'ordinary_business_frontend_must_not_read_algorithm_catalog_directly',
      'non_registry_rule_assets_are_catalog_only_until_promoted_by_governance',
    ]))
  })
})
