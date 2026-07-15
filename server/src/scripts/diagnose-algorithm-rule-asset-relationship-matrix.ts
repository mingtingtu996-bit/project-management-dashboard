import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  listAlgorithmCatalogEntries,
  listAlgorithmSeedCatalogEntries,
} from '../services/algorithmCatalogService.js'
import {
  listAlgorithmRuleAssets,
} from '../services/algorithmRuleAssetInventoryService.js'
import {
  ALGORITHM_SEED_REGISTRY,
  listAlgorithmSeedTypes,
} from '../services/algorithmSeedRegistry.js'
import {
  getProjectGenerationFactConsumerMatrix,
} from '../services/projectGenerationFactsConsumerRegistry.js'
import {
  evaluateV14AssetAdmissionAutomation,
} from '../services/v14AssetAdmissionAutomationService.js'

export type AlgorithmRuleAssetRelationshipNodeKind =
  | 'main_algorithm'
  | 'rule_asset'
  | 'seed_catalog'
  | 'project_fact'
  | 'consumer'
  | 'source_file'
  | 'governance_system'
  | 'owner'
  | 'algorithm_input_source'
  | 'algorithm_output_field'
  | 'seed_rule_type'
  | 'auto_discovered_asset'

export type AlgorithmRuleAssetRelationshipRelation =
  | 'implemented_in'
  | 'governed_by'
  | 'owned_by'
  | 'consumed_by'
  | 'uses_input_source'
  | 'emits_output_field'
  | 'catalogs_rule_asset'
  | 'seed_upstream_rule_type'
  | 'seed_downstream_rule_type'
  | 'admission_discovered_source'

export type AlgorithmRuleAssetRelationshipNode = {
  id: string
  kind: AlgorithmRuleAssetRelationshipNodeKind
  label: string
  evidenceRefs: string[]
  metadata?: Record<string, unknown>
}

export type AlgorithmRuleAssetRelationshipEdge = {
  id: string
  from: string
  to: string
  relation: AlgorithmRuleAssetRelationshipRelation
  evidenceRefs: string[]
  metadata?: Record<string, unknown>
}

export type AlgorithmRuleAssetRelationshipMatrix = {
  matrixCode: 'v14231_algorithm_rule_asset_relationship_matrix'
  status: 'pass' | 'block'
  generatedAt: string
  summary: {
    nodeCount: number
    edgeCount: number
    mainAlgorithmCount: number
    ruleAssetCount: number
    seedCatalogCount: number
    projectFactCount: number
    autoDiscoveredAssetCount: number
  }
  gaps: {
    duplicateNodeIds: string[]
    duplicateEdgeIds: string[]
    seedTypesWithoutRuleAsset: string[]
    seedTypesWithoutSeedCatalogEntry: string[]
    projectFactsWithoutConsumerEdge: string[]
    ruleAssetConsumersWithoutEdge: string[]
    autoDiscoveredAssetsMissingRegistration: string[]
    runtimeBoundaryViolations: string[]
  }
  nodes: AlgorithmRuleAssetRelationshipNode[]
  edges: AlgorithmRuleAssetRelationshipEdge[]
  nodesById: Record<string, AlgorithmRuleAssetRelationshipNode>
  edgesById: Record<string, AlgorithmRuleAssetRelationshipEdge>
  runtimeBoundary: {
    writesRuntime: false
    writesSeeds: false
    writesTaskDependencies: false
    writesPlanDates: false
    declaresProductionReady: false
  }
  boundaryPolicy: string[]
}

function uniqueStrings(values: readonly unknown[] | undefined) {
  if (!values) return []
  return Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)))
}

function pushNode(
  nodesById: Map<string, AlgorithmRuleAssetRelationshipNode>,
  duplicateNodeIds: Set<string>,
  node: AlgorithmRuleAssetRelationshipNode,
) {
  const existing = nodesById.get(node.id)
  if (existing) {
    nodesById.set(node.id, {
      ...existing,
      evidenceRefs: uniqueStrings([...existing.evidenceRefs, ...node.evidenceRefs]),
      metadata: {
        ...(existing.metadata ?? {}),
        ...(node.metadata ?? {}),
      },
    })
    return
  }
  nodesById.set(node.id, {
    ...node,
    evidenceRefs: uniqueStrings(node.evidenceRefs),
  })
}

function pushEdge(
  edgesById: Map<string, AlgorithmRuleAssetRelationshipEdge>,
  duplicateEdgeIds: Set<string>,
  edge: Omit<AlgorithmRuleAssetRelationshipEdge, 'id'>,
) {
  const id = `${edge.from}->${edge.to}:${edge.relation}`
  const existing = edgesById.get(id)
  if (existing) {
    edgesById.set(id, {
      ...existing,
      evidenceRefs: uniqueStrings([...existing.evidenceRefs, ...edge.evidenceRefs]),
      metadata: mergeEdgeMetadata(existing.metadata, edge.metadata),
    })
    return
  }
  edgesById.set(id, {
    ...edge,
    id,
    evidenceRefs: uniqueStrings(edge.evidenceRefs),
  })
}

function mergeEdgeMetadata(
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
) {
  if (!left) return right
  if (!right) return left
  const consumerGroups = uniqueStrings([
    left.consumerGroup,
    ...(Array.isArray(left.consumerGroups) ? left.consumerGroups : []),
    right.consumerGroup,
    ...(Array.isArray(right.consumerGroups) ? right.consumerGroups : []),
  ])
  return {
    ...left,
    ...right,
    ...(consumerGroups.length > 0 ? { consumerGroups } : {}),
  }
}

function nodeId(kind: AlgorithmRuleAssetRelationshipNodeKind, value: string) {
  return `${kind}:${value}`
}

function addSourceEdge(
  nodesById: Map<string, AlgorithmRuleAssetRelationshipNode>,
  duplicateNodeIds: Set<string>,
  edgesById: Map<string, AlgorithmRuleAssetRelationshipEdge>,
  duplicateEdgeIds: Set<string>,
  from: string,
  sourcePath: string,
  evidenceRef: string,
) {
  const sourceId = nodeId('source_file', sourcePath)
  pushNode(nodesById, duplicateNodeIds, {
    id: sourceId,
    kind: 'source_file',
    label: sourcePath,
    evidenceRefs: [evidenceRef],
  })
  pushEdge(edgesById, duplicateEdgeIds, {
    from,
    to: sourceId,
    relation: 'implemented_in',
    evidenceRefs: [evidenceRef],
  })
}

function addConsumerEdge(
  nodesById: Map<string, AlgorithmRuleAssetRelationshipNode>,
  duplicateNodeIds: Set<string>,
  edgesById: Map<string, AlgorithmRuleAssetRelationshipEdge>,
  duplicateEdgeIds: Set<string>,
  from: string,
  consumer: string,
  evidenceRef: string,
  metadata: Record<string, unknown> = {},
) {
  const consumerId = nodeId('consumer', consumer)
  pushNode(nodesById, duplicateNodeIds, {
    id: consumerId,
    kind: 'consumer',
    label: consumer,
    evidenceRefs: [evidenceRef],
  })
  pushEdge(edgesById, duplicateEdgeIds, {
    from,
    to: consumerId,
    relation: 'consumed_by',
    evidenceRefs: [evidenceRef],
    metadata,
  })
}

function buildRecord<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

export function buildAlgorithmRuleAssetRelationshipMatrix(
  now = new Date(),
): AlgorithmRuleAssetRelationshipMatrix {
  const nodesById = new Map<string, AlgorithmRuleAssetRelationshipNode>()
  const edgesById = new Map<string, AlgorithmRuleAssetRelationshipEdge>()
  const duplicateNodeIds = new Set<string>()
  const duplicateEdgeIds = new Set<string>()

  const algorithms = listAlgorithmCatalogEntries()
  const ruleAssets = listAlgorithmRuleAssets()
  const seedCatalog = listAlgorithmSeedCatalogEntries()
  const seedTypes = listAlgorithmSeedTypes()
  const factMatrix = getProjectGenerationFactConsumerMatrix()
  const admissionReport = evaluateV14AssetAdmissionAutomation()

  const ruleAssetKeys = new Set(ruleAssets.map((asset) => asset.key))
  const seedCatalogKeys = new Set(seedCatalog.map((seed) => seed.seedKey))

  for (const algorithm of algorithms) {
    const algorithmId = nodeId('main_algorithm', algorithm.algorithmKey)
    pushNode(nodesById, duplicateNodeIds, {
      id: algorithmId,
      kind: 'main_algorithm',
      label: algorithm.displayName,
      evidenceRefs: ['algorithmCatalogService'],
      metadata: {
        domain: algorithm.domain,
        ownerChapter: algorithm.ownerChapter,
        status: algorithm.status,
        ordinaryUserVisible: algorithm.ordinaryUserVisible,
        runtimeEffect: algorithm.runtimeEffect,
      },
    })
    addSourceEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, algorithmId, algorithm.implementationPath, 'algorithmCatalogService')

    for (const inputSource of algorithm.inputSources) {
      const inputId = nodeId('algorithm_input_source', inputSource)
      pushNode(nodesById, duplicateNodeIds, {
        id: inputId,
        kind: 'algorithm_input_source',
        label: inputSource,
        evidenceRefs: ['algorithmCatalogService'],
      })
      pushEdge(edgesById, duplicateEdgeIds, {
        from: algorithmId,
        to: inputId,
        relation: 'uses_input_source',
        evidenceRefs: ['algorithmCatalogService'],
      })
    }

    for (const outputField of algorithm.outputFields) {
      const outputId = nodeId('algorithm_output_field', outputField)
      pushNode(nodesById, duplicateNodeIds, {
        id: outputId,
        kind: 'algorithm_output_field',
        label: outputField,
        evidenceRefs: ['algorithmCatalogService'],
      })
      pushEdge(edgesById, duplicateEdgeIds, {
        from: algorithmId,
        to: outputId,
        relation: 'emits_output_field',
        evidenceRefs: ['algorithmCatalogService'],
      })
    }

    for (const consumer of algorithm.consumers) {
      addConsumerEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, algorithmId, consumer, 'algorithmCatalogService')
    }
  }

  for (const asset of ruleAssets) {
    const assetId = nodeId('rule_asset', asset.key)
    pushNode(nodesById, duplicateNodeIds, {
      id: assetId,
      kind: 'rule_asset',
      label: asset.name,
      evidenceRefs: ['algorithmRuleAssetInventoryService'],
      metadata: {
        lifecycleType: asset.lifecycleType,
        governanceSystem: asset.governanceSystem,
        ownerService: asset.ownerService,
        recommendation: asset.recommendation,
        learningTarget: asset.learningTarget,
        learningMaturity: asset.learningMaturity,
        publishAnchor: asset.publishAnchor,
        automationMaturity: asset.automationMaturity,
      },
    })
    addSourceEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, assetId, asset.source, 'algorithmRuleAssetInventoryService')

    const governanceId = nodeId('governance_system', asset.governanceSystem)
    pushNode(nodesById, duplicateNodeIds, {
      id: governanceId,
      kind: 'governance_system',
      label: asset.governanceSystem,
      evidenceRefs: ['algorithmRuleAssetInventoryService'],
    })
    pushEdge(edgesById, duplicateEdgeIds, {
      from: assetId,
      to: governanceId,
      relation: 'governed_by',
      evidenceRefs: ['algorithmRuleAssetInventoryService'],
    })

    const ownerId = nodeId('owner', asset.ownerService)
    pushNode(nodesById, duplicateNodeIds, {
      id: ownerId,
      kind: 'owner',
      label: asset.ownerService,
      evidenceRefs: ['algorithmRuleAssetInventoryService'],
    })
    pushEdge(edgesById, duplicateEdgeIds, {
      from: assetId,
      to: ownerId,
      relation: 'owned_by',
      evidenceRefs: ['algorithmRuleAssetInventoryService'],
    })

    for (const consumer of asset.consumers) {
      addConsumerEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, assetId, consumer, 'algorithmRuleAssetInventoryService')
    }
  }

  for (const seed of seedCatalog) {
    const seedId = nodeId('seed_catalog', seed.seedKey)
    pushNode(nodesById, duplicateNodeIds, {
      id: seedId,
      kind: 'seed_catalog',
      label: seed.seedKey,
      evidenceRefs: ['algorithmCatalogService'],
      metadata: {
        seedType: seed.seedType,
        seedVersion: seed.seedVersion,
        registryStatus: seed.registryStatus,
        lifecycleStatus: seed.lifecycleStatus,
        runtimeEffect: seed.runtimeEffect,
      },
    })
    addSourceEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, seedId, seed.seedFile, 'algorithmCatalogService')

    if (ruleAssetKeys.has(seed.seedKey)) {
      pushEdge(edgesById, duplicateEdgeIds, {
        from: seedId,
        to: nodeId('rule_asset', seed.seedKey),
        relation: 'catalogs_rule_asset',
        evidenceRefs: ['algorithmCatalogService', 'algorithmRuleAssetInventoryService'],
      })
    }
  }

  for (const seed of ALGORITHM_SEED_REGISTRY) {
    const seedId = nodeId('seed_catalog', seed.seedType)
    for (const upstreamRuleType of seed.meta.upstreamRuleTypes ?? []) {
      const ruleTypeId = nodeId('seed_rule_type', upstreamRuleType)
      pushNode(nodesById, duplicateNodeIds, {
        id: ruleTypeId,
        kind: 'seed_rule_type',
        label: upstreamRuleType,
        evidenceRefs: ['algorithmSeedRegistry'],
      })
      pushEdge(edgesById, duplicateEdgeIds, {
        from: seedId,
        to: ruleTypeId,
        relation: 'seed_upstream_rule_type',
        evidenceRefs: ['algorithmSeedRegistry'],
      })
    }
    for (const downstreamRuleType of seed.meta.downstreamRuleTypes ?? []) {
      const ruleTypeId = nodeId('seed_rule_type', downstreamRuleType)
      pushNode(nodesById, duplicateNodeIds, {
        id: ruleTypeId,
        kind: 'seed_rule_type',
        label: downstreamRuleType,
        evidenceRefs: ['algorithmSeedRegistry'],
      })
      pushEdge(edgesById, duplicateEdgeIds, {
        from: seedId,
        to: ruleTypeId,
        relation: 'seed_downstream_rule_type',
        evidenceRefs: ['algorithmSeedRegistry'],
      })
    }
  }

  for (const [factKey, entry] of Object.entries(factMatrix)) {
    const factId = nodeId('project_fact', factKey)
    pushNode(nodesById, duplicateNodeIds, {
      id: factId,
      kind: 'project_fact',
      label: entry.label,
      evidenceRefs: ['projectGenerationFactsConsumerRegistry'],
      metadata: {
        field: entry.field,
        purpose: entry.purpose,
        boundaryPolicy: entry.boundaryPolicy,
      },
    })

    for (const [group, consumers] of Object.entries(entry.consumers)) {
      for (const consumer of consumers) {
        addConsumerEdge(
          nodesById,
          duplicateNodeIds,
          edgesById,
          duplicateEdgeIds,
          factId,
          consumer,
          'projectGenerationFactsConsumerRegistry',
          { consumerGroup: group },
        )
      }
    }
  }

  for (const asset of admissionReport.assets) {
    const assetId = nodeId('auto_discovered_asset', asset.assetKey)
    pushNode(nodesById, duplicateNodeIds, {
      id: assetId,
      kind: 'auto_discovered_asset',
      label: asset.assetKey,
      evidenceRefs: ['v14AssetAdmissionAutomationService'],
      metadata: {
        assetType: asset.assetType,
        discoveryStatus: asset.discoveryStatus,
        governanceStatus: asset.governanceStatus,
        runtimeEffect: asset.runtimeEffect,
        scopePolicy: asset.scopePolicy,
        durationRelated: asset.durationRelated,
        learningTarget: asset.learningTarget,
        learningMaturity: asset.learningMaturity,
        publishAnchor: asset.publishAnchor,
        automationMaturity: asset.automationMaturity,
      },
    })
    addSourceEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, assetId, asset.sourcePath, 'v14AssetAdmissionAutomationService')
    pushEdge(edgesById, duplicateEdgeIds, {
      from: assetId,
      to: nodeId('source_file', asset.sourcePath),
      relation: 'admission_discovered_source',
      evidenceRefs: ['v14AssetAdmissionAutomationService'],
    })
    for (const consumer of asset.consumers) {
      addConsumerEdge(nodesById, duplicateNodeIds, edgesById, duplicateEdgeIds, assetId, consumer, 'v14AssetAdmissionAutomationService')
    }
  }

  const nodes = Array.from(nodesById.values()).sort((a, b) => a.id.localeCompare(b.id))
  const edges = Array.from(edgesById.values()).sort((a, b) => a.id.localeCompare(b.id))
  const projectFactsWithoutConsumerEdge = Object.keys(factMatrix)
    .filter((factKey) => !edgesByIdHasFrom(edgesById, nodeId('project_fact', factKey), 'consumed_by'))
    .sort()
  const ruleAssetConsumersWithoutEdge = ruleAssets
    .flatMap((asset) => asset.consumers.map((consumer) => ({
      assetKey: asset.key,
      consumer,
      edgeId: `${nodeId('rule_asset', asset.key)}->${nodeId('consumer', consumer)}:consumed_by`,
    })))
    .filter((item) => !edgesById.has(item.edgeId))
    .map((item) => `${item.assetKey}:${item.consumer}`)
    .sort()
  const runtimeBoundary = {
    writesRuntime: false,
    writesSeeds: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    declaresProductionReady: false,
  } as const
  const gaps = {
    duplicateNodeIds: [...duplicateNodeIds].sort(),
    duplicateEdgeIds: [...duplicateEdgeIds].sort(),
    seedTypesWithoutRuleAsset: seedTypes.filter((seedType) => !ruleAssetKeys.has(seedType)).sort(),
    seedTypesWithoutSeedCatalogEntry: seedTypes.filter((seedType) => !seedCatalogKeys.has(seedType)).sort(),
    projectFactsWithoutConsumerEdge,
    ruleAssetConsumersWithoutEdge,
    autoDiscoveredAssetsMissingRegistration: admissionReport.assets
      .filter((asset) => asset.discoveryStatus !== 'registered' || asset.governanceStatus !== 'confirmed')
      .map((asset) => asset.assetKey)
      .sort(),
    runtimeBoundaryViolations: Object.entries(runtimeBoundary)
      .filter(([, value]) => value !== false)
      .map(([key]) => key)
      .sort(),
  }
  const status = Object.values(gaps).some((items) => items.length > 0) || admissionReport.status !== 'pass'
    ? 'block'
    : 'pass'

  return {
    matrixCode: 'v14231_algorithm_rule_asset_relationship_matrix',
    status,
    generatedAt: now.toISOString(),
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      mainAlgorithmCount: algorithms.length,
      ruleAssetCount: ruleAssets.length,
      seedCatalogCount: seedCatalog.length,
      projectFactCount: Object.keys(factMatrix).length,
      autoDiscoveredAssetCount: admissionReport.assets.length,
    },
    gaps,
    nodes,
    edges,
    nodesById: buildRecord(nodes),
    edgesById: buildRecord(edges),
    runtimeBoundary,
    boundaryPolicy: [
      'relationship_matrix_is_read_only_current_code_evidence',
      'matrix_does_not_publish_runtime_assets',
      'matrix_does_not_grant_production_ready_status',
      'matrix_must_not_write_seed_task_dependency_plan_date_or_baseline_tables',
      'live_database_closeout_still_requires_separate_runtime_evidence',
    ],
  }
}

function edgesByIdHasFrom(
  edgesById: Map<string, AlgorithmRuleAssetRelationshipEdge>,
  from: string,
  relation: AlgorithmRuleAssetRelationshipRelation,
) {
  return Array.from(edgesById.values()).some((edge) => edge.from === from && edge.relation === relation)
}

function readArgValue(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index < 0) return null
  return process.argv[index + 1] ?? null
}

function main() {
  const matrix = buildAlgorithmRuleAssetRelationshipMatrix()
  const outputFile = readArgValue('--output-file')
  if (outputFile) {
    mkdirSync(dirname(outputFile), { recursive: true })
    writeFileSync(outputFile, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify({
    matrixCode: matrix.matrixCode,
    status: matrix.status,
    summary: matrix.summary,
    gaps: matrix.gaps,
    runtimeBoundary: matrix.runtimeBoundary,
    outputFile: outputFile ?? null,
  }, null, 2))
}

if (process.argv[1]?.endsWith('diagnose-algorithm-rule-asset-relationship-matrix.ts')) {
  main()
}
