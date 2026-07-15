import {
  CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE,
  CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_LAYERS,
  CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION,
  type ConstructionDependencyRuleLayerKey,
} from './constructionDependencyRuleSystemService.js'

export type ConstructionDependencyRuleEvidence = {
  source: typeof CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE
  version: typeof CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION
  evidenceLevel: 'system_standard_dependency_l1'
  relationLayerKey: ConstructionDependencyRuleLayerKey
  layerStack: ConstructionDependencyRuleLayerKey[]
  layerSummaries: Array<{
    order: number
    key: ConstructionDependencyRuleLayerKey
    name: string
    technicalSources: string[]
    primaryRuntimeOutputs: string[]
  }>
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  intentCode: string
  createsProductionTaskDependency: true
  productionWritePolicy: string
  mutationBoundary: string
}

function uniqueLayerKeys(values: ConstructionDependencyRuleLayerKey[]) {
  return Array.from(new Set(values))
}

export function buildConstructionDependencyRuleEvidence(input: {
  relationLayerKey: ConstructionDependencyRuleLayerKey
  dependencyType: ConstructionDependencyRuleEvidence['dependencyType']
  lagDays: number
  intentCode: string
  layerStack?: ConstructionDependencyRuleLayerKey[]
  productionWritePolicy: string
  mutationBoundary: string
}): ConstructionDependencyRuleEvidence {
  const layerStack = uniqueLayerKeys(input.layerStack ?? [input.relationLayerKey])
  return {
    source: CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE,
    version: CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION,
    evidenceLevel: 'system_standard_dependency_l1',
    relationLayerKey: input.relationLayerKey,
    layerStack,
    layerSummaries: layerStack.flatMap((key) => {
      const layer = CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_LAYERS.find((item) => item.key === key)
      return layer
        ? [{
            order: layer.order,
            key: layer.key,
            name: layer.name,
            technicalSources: layer.technicalSources,
            primaryRuntimeOutputs: layer.primaryRuntimeOutputs,
          }]
        : []
    }),
    dependencyType: input.dependencyType,
    lagDays: input.lagDays,
    intentCode: input.intentCode,
    createsProductionTaskDependency: true,
    productionWritePolicy: input.productionWritePolicy,
    mutationBoundary: input.mutationBoundary,
  }
}
