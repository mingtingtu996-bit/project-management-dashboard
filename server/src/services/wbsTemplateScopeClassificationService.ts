import {
type DurationLearningRuntimeAssetKey,
type DurationLearningRuntimePublicationQueryExec,
type ResolveDurationLearningRuntimePublicationResult
} from './durationLearningRuntimePublicationService.js'
import type { PlanningTableOperation } from '../types/planningTable.js'
import {
type WbsTemplateCatalogGroup,type WbsTemplateTriggerCondition
} from '../seeds/domainWbsTemplateCatalogs.js'
import {
resolveWbsGenerationDepthPolicy,
type WbsGenerationDepthPolicy,
} from '../seeds/wbsGenerationDepthPolicySeed.js'

import {
BUILT_IN_WBS_TEMPLATE_CATALOGS,
GENERATION_DEPTH_RANK,
OVERVIEW_PROCESS_DETAIL_ITEM_PACK_CODES,
TEMPLATE_NODE_RANK,
WBS_TEMPLATE_CATALOG_GROUPS,
buildTemplateCatalogNotFoundError,
flattenCatalogNodes,
flattenNodes,
getBuiltInTemplateCatalog,
getBuiltInTemplateNodeRoots,
getCatalogGenerationPolicy,
getCatalogPackType,
isBuiltInChinaTemplateId,
isExplicitSelectedNodeInScope,
isTruthy,
normalizeDate,
normalizeId,
normalizeText,
pickPersistableScopeValues,
readArray,
readCodeArray,
readOperationProjectFacts,
readPositiveNumber,
readRecord,
shouldPromoteManagedFrontierMaterializeDepth,
uniqueStringArray,
} from './wbsTemplateGenerationFoundation.js'
import type {
BuiltInWbsTemplateCatalog,
TemplateNode,
WbsTemplateCatalogGroupSelection,
WbsTemplateFloorSequenceInput,
WbsTemplateGenerationDepth,
WbsTemplateGenerationRuntimeArtifactPublication,
WbsTemplateScope,
} from './wbsTemplateGenerationFoundation.js'



export function readEffectiveManagedFrontierMaterializeDepth(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
  policy: WbsGenerationDepthPolicy,
): WbsTemplateGenerationDepth {
  const materializeDepth = normalizeText(policy.materializeDepth) as WbsTemplateGenerationDepth
  if (!isManagedFrontierGeneration(generationDepth)) return materializeDepth
  if (shouldPromoteManagedFrontierMaterializeDepth(node, scope)) return materializeDepth
  return readGenerationDepthRank(materializeDepth) > readGenerationDepthRank(generationDepth)
    ? generationDepth
    : materializeDepth
}



export async function loadWbsTemplateNodes(templateId: string): Promise<TemplateNode[]> {
  if (isBuiltInChinaTemplateId(templateId)) {
    const catalog = getBuiltInTemplateCatalog(templateId)
    if (catalog) return getBuiltInTemplateNodeRoots(catalog)
  }

  throw buildTemplateCatalogNotFoundError(templateId)
}



export function selectTemplateNodes(roots: TemplateNode[], selectedNodeIds: string[]) {
  const all = flattenNodes(roots)
  const selected = new Set(selectedNodeIds.map(normalizeText).filter(Boolean))
  if (selected.size === 0) return roots
  return all.filter((node) => (
    selected.has(node.id)
    || selected.has(node.stableCode)
    || selected.has(node.standardWorkCode ?? '')
  ))
}



export function cloneTemplateNode(node: TemplateNode): TemplateNode {
  return {
    ...node,
    metadata: { ...node.metadata },
    children: node.children.map(cloneTemplateNode),
  }
}



export function readDurationLearningNodeIdentity(value: Record<string, unknown>) {
  return normalizeText(
    value.sourceId
      ?? value.source_id
      ?? value.stableCode
      ?? value.stable_code
      ?? value.standardWorkCode
      ?? value.standard_work_code
      ?? value.path,
  )
}



export function readDurationLearningNodeDays(
  assetKey: Extract<DurationLearningRuntimeAssetKey, 'wbs_reference_days' | 'special_work_duration_seed'>,
  value: Record<string, unknown>,
) {
  const candidates = assetKey === 'wbs_reference_days'
    ? [
        value.referenceDays,
        value.reference_days,
        value.suggestedReferenceDays,
        value.suggested_reference_days,
      ]
    : [
        value.p50Days,
        value.p50_days,
        value.baseDurationDays,
        value.base_duration_days,
        value.referenceDays,
        value.reference_days,
      ]
  for (const candidate of candidates) {
    const days = readPositiveNumber(candidate)
    if (days) return days
  }
  return null
}



export function durationLearningNodeMatches(
  node: TemplateNode,
  identity: string,
  ancestorStableCodes: readonly string[],
) {
  const normalizedIdentity = normalizeText(identity).toLowerCase()
  if (!normalizedIdentity) return false
  const directIdentities = [
    node.id,
    node.stableCode,
    node.standardWorkCode,
    readRecord(node.metadata).sourceId,
    readRecord(node.metadata).source_id,
  ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean)
  if (directIdentities.includes(normalizedIdentity)) return true

  const pathSegments = normalizedIdentity.split(/[/>|]/).map((value) => value.trim()).filter(Boolean)
  if (pathSegments.length === 0) return false
  const stablePath = [...ancestorStableCodes, node.stableCode]
    .map((value) => normalizeText(value).toLowerCase())
    .filter(Boolean)
  return pathSegments.length <= stablePath.length
    && pathSegments.every((segment, index) => segment === stablePath[stablePath.length - pathSegments.length + index])
}



export function applyDurationLearningPublicationToTemplateNodes(input: {
  nodes: readonly TemplateNode[]
  assetKey: Extract<DurationLearningRuntimeAssetKey, 'wbs_reference_days' | 'special_work_duration_seed'>
  resolution: ResolveDurationLearningRuntimePublicationResult
}) {
  if (!input.resolution.runtimeConsumable || !input.resolution.publication) {
    return { nodes: input.nodes.map(cloneTemplateNode), appliedNodeCount: 0 }
  }
  const payload = input.resolution.publication.runtimePayload
  const rawEntries = readArray(payload.nodes).length > 0
    ? readArray(payload.nodes)
    : [payload]
  const entries = rawEntries
    .map(readRecord)
    .map((entry) => ({
      entry,
      identity: readDurationLearningNodeIdentity(entry),
      days: readDurationLearningNodeDays(input.assetKey, entry),
    }))
    .filter((entry) => Boolean(entry.identity && entry.days))
  let appliedNodeCount = 0

  const visit = (node: TemplateNode, ancestorStableCodes: readonly string[]): TemplateNode => {
    const clone = cloneTemplateNode(node)
    const matched = entries.find((entry) => durationLearningNodeMatches(node, entry.identity, ancestorStableCodes))
    if (matched?.days) {
      appliedNodeCount += 1
      clone.defaultDurationDays = matched.days
      const durationDayBasis = normalizeText(
        matched.entry.durationDayBasis
          ?? matched.entry.duration_day_basis
          ?? payload.durationDayBasis
          ?? payload.duration_day_basis,
      ) || 'construction_production_day'
      const existingConsumptions = readArray(clone.metadata.durationLearningConsumptions)
        .map(readRecord)
        .filter((consumption) => normalizeText(consumption.publicationKey))
      const currentConsumption = {
        assetKey: input.assetKey,
        publicationKey: input.resolution.publicationKey,
        publicationStage: input.resolution.publication.publicationStage,
        artifactKey: input.resolution.publication.artifactKey,
        selectionBasis: input.resolution.selectionBasis,
        durationDayBasis,
        appliedDurationDays: matched.days,
      }
      const durationLearningConsumptions = [
        ...existingConsumptions.filter((consumption) => !(
          normalizeText(consumption.assetKey) === input.assetKey
          && normalizeText(consumption.publicationKey) === input.resolution.publicationKey
          && normalizeText(consumption.artifactKey) === input.resolution.publication?.artifactKey
        )),
        currentConsumption,
      ]
      clone.metadata = {
        ...clone.metadata,
        durationLearningPublicationKey: input.resolution.publicationKey,
        durationLearningPublicationStage: input.resolution.publication.publicationStage,
        durationLearningSelectionBasis: input.resolution.selectionBasis,
        durationLearningAssetKey: input.assetKey,
        durationDayBasis,
        durationLearningConsumptions,
      }
    }
    clone.children = node.children.map((child) => visit(child, [...ancestorStableCodes, node.stableCode]))
    return clone
  }

  return {
    nodes: input.nodes.map((node) => visit(node, [])),
    appliedNodeCount,
  }
}



export function buildWbsDurationLearningRuntimeArtifactPublication(
  assetKey: Extract<DurationLearningRuntimeAssetKey, 'wbs_reference_days' | 'special_work_duration_seed'>,
  resolution: ResolveDurationLearningRuntimePublicationResult,
  templateId: string,
  appliedNodeCount: number,
): WbsTemplateGenerationRuntimeArtifactPublication | null {
  if (!resolution.runtimeConsumable || !resolution.publication || !resolution.publicationKey || appliedNodeCount <= 0) return null
  return {
    assetKey,
    publicationKey: resolution.publicationKey,
    publicationStatus: resolution.publication.publicationStage === 'canary' ? 'canary' : 'published',
    sourceEvidenceRefs: [`duration_learning_runtime_publications:${resolution.publicationKey}`],
    observationContext: {
      templateId,
      artifactKey: resolution.publication.artifactKey,
      scopeLevel: resolution.publication.scopeLevel,
      companyId: resolution.publication.companyId,
      projectId: resolution.publication.projectId,
      industryKey: resolution.publication.industryKey,
      appliedNodeCount,
      selectionBasis: resolution.selectionBasis,
      durationDayBasis: 'construction_production_day',
    },
  }
}



export async function resolveProjectCompanyIdForDurationLearning(input: {
  projectId: string | null
  projectFacts: Record<string, unknown>
  queryExec: DurationLearningRuntimePublicationQueryExec | null
}) {
  const explicitCompanyId = normalizeId(input.projectFacts.companyId ?? input.projectFacts.company_id)
  if (explicitCompanyId || !input.queryExec || !input.projectId) return explicitCompanyId
  const rows = await input.queryExec<Record<string, unknown>>(
    `select company_id
       from public.projects
      where id = $1::uuid
      limit 1`,
    [input.projectId],
  )
  return normalizeId(rows[0]?.company_id ?? rows[0]?.companyId)
}



export function hasExplicitSelectedNodesForTemplate(operation: PlanningTableOperation, templateId: string) {
  const selectedNodesByTemplate = readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)
  const selectedForTemplate = selectedNodesByTemplate[templateId]
  return Array.isArray(selectedForTemplate) && readArray(selectedForTemplate).some((id) => Boolean(normalizeText(id)))
}



export function readCatalogGroupSelections(operation: PlanningTableOperation) {
  return readRecord(operation.groupSelections ?? operation.group_selections)
}



export function readCatalogGroupSelectionMode(value: unknown): WbsTemplateCatalogGroupSelection | null {
  if (value === true) return 'all'
  if (value === false || value == null) return null
  const record = readRecord(value)
  const raw = record.mode ?? record.selection ?? value
  const mode = normalizeText(raw).toLowerCase()
  if ([
    'all',
    'default_selected',
    'triggered',
    'explicit',
    'auto_by_trigger',
    'by_project_type',
    'by_branch',
    'none',
  ].includes(mode)) {
    return mode as WbsTemplateCatalogGroupSelection
  }
  return null
}



export function readSpecialtyCatalogIds(operation: PlanningTableOperation) {
  return readArray(operation.specialtyCatalogIds ?? operation.specialty_catalog_ids)
    .map(normalizeText)
    .filter(Boolean)
}



export function toSnakeCaseKey(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}



export function readNestedValue(source: Record<string, unknown>, path: string) {
  const parts = path.split('.').map((part) => part.trim()).filter(Boolean)
  let current: unknown = source
  for (const part of parts) {
    const record = readRecord(current)
    if (part in record) {
      current = record[part]
      continue
    }
    const snake = toSnakeCaseKey(part)
    if (snake in record) {
      current = record[snake]
      continue
    }
    return undefined
  }
  return current
}



export function readTriggerConditionValue(scope: Record<string, unknown>, sourceField: string) {
  const direct = scope[sourceField]
  if (direct !== undefined) return direct

  const paths = [
    sourceField,
    sourceField.replace(/^engineeringObject\.metadata\./, 'metadata.'),
    sourceField.replace(/^engineeringObject\.metadata\./, ''),
    sourceField.replace(/^engineeringObject\./, ''),
    sourceField.replace(/^scope\./, ''),
    sourceField.replace(/^metadata\./, ''),
  ]
  for (const path of paths) {
    const value = readNestedValue(scope, path)
    if (value !== undefined) return value
  }
  const lastKey = sourceField.split('.').filter(Boolean).pop() ?? ''
  return scope[lastKey] ?? scope[toSnakeCaseKey(lastKey)] ?? readRecord(scope.metadata)[lastKey] ?? readRecord(scope.metadata)[toSnakeCaseKey(lastKey)]
}



export function compareTriggerValue(actual: unknown, condition: WbsTemplateTriggerCondition) {
  const operator = condition.operator
  if (operator === 'exists') return actual !== undefined && actual !== null && normalizeText(actual) !== ''
  if (operator === 'includes') {
    const expected = normalizeText(condition.value).toLowerCase()
    if (!expected) return false
    if (Array.isArray(actual)) return actual.map((item) => normalizeText(item).toLowerCase()).includes(expected)
    return normalizeText(actual).toLowerCase().split(/[,\s]+/).includes(expected)
  }
  if (operator === '=') {
    if (typeof condition.value === 'boolean') return isTruthy(actual) === condition.value
    return normalizeText(actual).toLowerCase() === normalizeText(condition.value).toLowerCase()
  }
  const actualNumber = Number(actual)
  const expectedNumber = Number(condition.value)
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false
  if (operator === '>=') return actualNumber >= expectedNumber
  if (operator === '>') return actualNumber > expectedNumber
  if (operator === '<=') return actualNumber <= expectedNumber
  if (operator === '<') return actualNumber < expectedNumber
  return false
}



export function catalogMatchesTriggerConditions(catalog: BuiltInWbsTemplateCatalog, operation: PlanningTableOperation) {
  const scope = {
    ...readRecord(operation.scope),
    ...readOperationProjectFacts(operation),
  }
  const nodes = flattenCatalogNodes(catalog.divisions)
  return nodes.some((node) => {
    const conditions = readArray(readRecord(node.metadata).triggerConditions) as WbsTemplateTriggerCondition[]
    return conditions.some((condition) => (
      condition
      && typeof condition === 'object'
      && normalizeText(condition.sourceField)
      && compareTriggerValue(readTriggerConditionValue(scope, condition.sourceField), condition)
    ))
  })
}



export function catalogMatchesProjectType(catalog: BuiltInWbsTemplateCatalog, operation: PlanningTableOperation) {
  const scope = readRecord(operation.scope)
  const projectFacts = readOperationProjectFacts(operation)
  const projectTypeCode = normalizeText(scope.project_type_code ?? scope.projectTypeCode ?? projectFacts.projectTypeCode).toLowerCase()
  if (!projectTypeCode) return true
  const nodes = flattenCatalogNodes(catalog.divisions)
  return nodes.some((node) => {
    const applicable = readCodeArray(readRecord(node.metadata).applicableProjectTypes)
    return applicable.length === 0 || applicable.includes(projectTypeCode)
  })
}



export function resolveCatalogGroupTemplateIds(operation: PlanningTableOperation) {
  const selections = readCatalogGroupSelections(operation)
  const selectedIds: string[] = []
  for (const group of WBS_TEMPLATE_CATALOG_GROUPS) {
    const mode = readCatalogGroupSelectionMode(selections[group])
    if (!mode || mode === 'none') continue
    for (const catalog of BUILT_IN_WBS_TEMPLATE_CATALOGS) {
      if (getCatalogPackType(catalog) !== group) continue
      const policy = getCatalogGenerationPolicy(catalog)
      if (mode === 'default_selected' && policy !== 'default_selected') continue
      if (mode === 'triggered' && policy !== 'triggered') continue
      if (mode === 'explicit' && policy !== 'explicit') continue
      if (mode === 'auto_by_trigger' && !catalogMatchesTriggerConditions(catalog, operation)) continue
      if (mode === 'by_project_type' && !catalogMatchesProjectType(catalog, operation)) continue
      selectedIds.push(catalog.templateId)
    }
  }
  return selectedIds
}



export function getCatalogGroupSelectionMode(operation: PlanningTableOperation, group: WbsTemplateCatalogGroup) {
  return readCatalogGroupSelectionMode(readCatalogGroupSelections(operation)[group])
}



export function readTemplateIds(operation: PlanningTableOperation): string[] {
  const primaryId = normalizeText(operation.primaryCatalogId ?? operation.primary_catalog_id ?? operation.templateId ?? operation.template_id)
  const explicitIds = readArray(operation.templateIds ?? operation.template_ids)
    .map(normalizeText)
    .filter(Boolean)
  const groupIds = resolveCatalogGroupTemplateIds(operation)
  const specialtyIds = readSpecialtyCatalogIds(operation)
  const selectedNodesByTemplate = readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)
  const templateIdsWithSelectedNodes = Object.entries(selectedNodesByTemplate)
    .filter(([, selectedNodeIds]) => readArray(selectedNodeIds).some((id) => Boolean(normalizeText(id))))
    .map(([templateId]) => normalizeText(templateId))
    .filter(Boolean)
  const fallbackSelectedNodeIds = readArray(operation.selectedNodeIds ?? operation.selected_node_ids)
    .map(normalizeText)
    .filter(Boolean)
  const hasPrimarySelectedNodes = primaryId && templateIdsWithSelectedNodes.includes(primaryId)
  const selectedPrimaryTemplate = hasPrimarySelectedNodes || (primaryId && fallbackSelectedNodeIds.length > 0)
    ? [primaryId]
    : []
  const selectedNonPrimaryTemplates = templateIdsWithSelectedNodes.filter((templateId) => templateId !== primaryId)
  const selectedIds = uniqueStringArray([
    ...explicitIds,
    ...selectedPrimaryTemplate,
    ...groupIds,
    ...specialtyIds,
    ...selectedNonPrimaryTemplates,
  ])
  if (selectedIds.length > 0) return selectedIds
  return uniqueStringArray([primaryId])
}



export function readSelectedNodeIdsForTemplate(operation: PlanningTableOperation, templateId: string) {
  const selectedNodesByTemplate = readRecord(operation.selectedNodesByTemplate ?? operation.selected_nodes_by_template)
  const selectedForTemplate = selectedNodesByTemplate[templateId]
  if (Array.isArray(selectedForTemplate)) {
    return readArray(selectedForTemplate)
      .map(normalizeText)
      .filter(Boolean)
  }
  const primaryTemplateId = normalizeText(operation.primaryCatalogId ?? operation.primary_catalog_id ?? operation.templateId ?? operation.template_id)
  const fallbackSelectedNodeIds = templateId === primaryTemplateId
    ? (operation.selectedNodeIds ?? operation.selected_node_ids)
    : []
  return readArray(fallbackSelectedNodeIds)
    .map(normalizeText)
    .filter(Boolean)
}



export function nodeMatchesTriggerConditions(node: TemplateNode, operation: PlanningTableOperation) {
  const scope = {
    ...readRecord(operation.scope),
    ...readOperationProjectFacts(operation),
  }
  const conditions = readArray(readRecord(node.metadata).triggerConditions) as WbsTemplateTriggerCondition[]
  return conditions.some((condition) => (
    condition
    && typeof condition === 'object'
    && normalizeText(condition.sourceField)
    && compareTriggerValue(readTriggerConditionValue(scope, condition.sourceField), condition)
  ))
}



export function nodeOrDescendantMatchesTrigger(node: TemplateNode, operation: PlanningTableOperation): boolean {
  return nodeMatchesTriggerConditions(node, operation)
    || node.children.some((child) => nodeOrDescendantMatchesTrigger(child, operation))
}



export function selectAutoTriggeredDangerNodes(roots: TemplateNode[], operation: PlanningTableOperation) {
  const all = flattenNodes(roots)
  const itemWorks = all.filter((node) => node.categoryType === 'item_work' && nodeOrDescendantMatchesTrigger(node, operation))
  if (itemWorks.length > 0) return itemWorks

  const processes = all.filter((node) => node.categoryType === 'process' && nodeMatchesTriggerConditions(node, operation))
  return processes.length > 0 ? processes : roots
}



export type ScopeComboRuntimeObject = {
  id: string
  type: string
  name: string
  parentId: string | null
  metadata: Record<string, unknown>
}



export function readScopeObjectsForComboExpansion(scope: Record<string, unknown>): ScopeComboRuntimeObject[] {
  return readArray(scope.scope_objects ?? scope.scopeObjects)
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
        parentId: normalizeText(record.parentId ?? record.parent_id) || null,
        metadata: readRecord(record.metadata),
      }
    })
    .filter((item): item is ScopeComboRuntimeObject => Boolean(item))
}



export function readScopeObjectPhysicalSpaceKind(object: ScopeComboRuntimeObject) {
  return normalizeId(object.metadata.physicalSpaceKind ?? object.metadata.physical_space_kind)
}



export function readScopeObjectStructuralRole(object: ScopeComboRuntimeObject) {
  return normalizeId(object.metadata.structuralRole ?? object.metadata.structural_role)
}



export function isSharedPodiumScopeObject(object: ScopeComboRuntimeObject) {
  if (object.type !== 'physical_zone') return false
  return readScopeObjectPhysicalSpaceKind(object) === 'shared_podium'
    || readScopeObjectStructuralRole(object) === 'podium'
    || object.metadata.sharedScopeCandidate === true
    || object.metadata.shared_scope_candidate === true
}



export function isInternalTowerScopeObject(object: ScopeComboRuntimeObject) {
  return object.type === 'physical_zone'
    && readScopeObjectStructuralRole(object) === 'tower'
    && !isSharedPodiumScopeObject(object)
}



export function isSuppressedPhysicalScopeObject(object: ScopeComboRuntimeObject) {
  return object.type === 'physical_zone'
    && (
      readScopeObjectPhysicalSpaceKind(object) === 'horizontal_work_zone'
      || isInternalTowerScopeObject(object)
    )
}



export function isStandardScopeComboAnchor(object: ScopeComboRuntimeObject) {
  return object.type === 'building'
    || object.type === 'basement'
    || object.type === 'floor'
    || (
      object.type === 'physical_zone'
      && readScopeObjectPhysicalSpaceKind(object) === 'independent_engineering_zone'
    )
    || isSharedPodiumScopeObject(object)
}



export function findStandardScopeComboAnchor(
  leaf: ScopeComboRuntimeObject,
  byId: Map<string, ScopeComboRuntimeObject>,
) {
  if (isSuppressedPhysicalScopeObject(leaf)) return null

  let current: ScopeComboRuntimeObject | undefined = leaf
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (isStandardScopeComboAnchor(current)) return current
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return null
}



export function buildScopeObjectComboKey(values: Partial<WbsTemplateScope>) {
  return JSON.stringify({
    engineering_object_id: values.engineering_object_id ?? null,
    phase_object_id: values.phase_object_id ?? null,
    section_object_id: values.section_object_id ?? null,
    building_object_id: values.building_object_id ?? null,
    floor_object_id: values.floor_object_id ?? null,
    basement_object_id: values.basement_object_id ?? null,
    physical_zone_object_id: values.physical_zone_object_id ?? null,
    functional_area_object_id: values.functional_area_object_id ?? null,
  })
}



export function countUniqueComboBuildings(combos: Array<Partial<WbsTemplateScope>>) {
  return uniqueStringArray(combos.map((combo) => normalizeText(combo.building_object_id)).filter(Boolean)).length
}



export function isFloorSeriesScope(scope: WbsTemplateScope) {
  return normalizeId(scope.scope_expansion_mode) === 'building_rhythm_series'
    && Array.isArray(scope.floor_series)
    && scope.floor_series.length > 1
}



export function isRhythmExpansionEligibleNode(node: TemplateNode) {
  const metadata = readRecord(node.metadata)
  const explicitScopeMode = normalizeId(metadata.scopeExpansionMode ?? metadata.scope_expansion_mode)
  if (explicitScopeMode === 'explicit_instances' || explicitScopeMode === 'floor_full_expand') return false
  return node.categoryType === 'item_work' && metadata.rhythmExpansionEligible === true
}



export function inferNodeOrganizationRole(node: TemplateNode): 'shared_works' | 'building_lane' | 'both' {
  const metadata = readRecord(node.metadata)
  const explicit = normalizeId(metadata.projectOrganizationRole ?? metadata.project_organization_role)
  if (explicit === 'shared_works' || explicit === 'building_lane' || explicit === 'both') return explicit
  const code = normalizeText(node.stableCode).toUpperCase()
  const haystack = [
    code,
    node.name,
    node.standardWorkName,
    metadata.executionPhase,
    metadata.executionLane,
    metadata.templateGroup,
    metadata.packType,
  ].map((item) => normalizeText(item).toLowerCase()).join(' ')

  if (/^(01|1|FND|WPI|OUT|MUN|SITE|TMP|SAF|QA|DOC)(-|$)/.test(code)
    || haystack.includes('foundation')
    || haystack.includes('basement')
    || haystack.includes('outdoor')
    || haystack.includes('site_preparation')) {
    return 'shared_works'
  }
  if (/^(02|2|03|3|04|4|05|5|06|6|07|7|08|8|BDT|DEC|FAC|MEP|HVA|HVAC|ELE|PLU|FIR|ELV|INT)(-|$)/.test(code)
    || haystack.includes('superstructure')
    || haystack.includes('finishing')
    || haystack.includes('facade')
    || haystack.includes('mep')) {
    return 'building_lane'
  }
  return 'both'
}



export function scopeCanGenerateNodeForProjectOrganization(scope: WbsTemplateScope, node: TemplateNode) {
  const laneRole = normalizeId(scope.organization_lane_role)
  if (!laneRole) return true
  const role = inferNodeOrganizationRole(node)
  if (role === 'both') return true
  if (role === 'building_lane' && laneRole !== 'shared_works') return true
  return laneRole === role
}



export function isExplicitFloorInstanceScope(scope: WbsTemplateScope) {
  const mode = normalizeId(scope.scope_expansion_mode)
  return mode === 'explicit_instances' || mode === 'floor_full_expand'
}



export function buildFloorSeriesItemFromScope(scope: WbsTemplateScope): WbsTemplateFloorSequenceInput {
  return {
    floorObjectId: scope.floor_object_id ?? null,
    label: scope.floor_sequence_label
      ?? scope.floor_object_id
      ?? (scope.floor_sequence_number ? `F${scope.floor_sequence_number}` : null),
    levelNumber: scope.floor_sequence_level_number ?? null,
    isBasement: scope.floor_sequence_is_basement ?? false,
  }
}



export function buildNonFloorScopeKey(scope: WbsTemplateScope) {
  return JSON.stringify({
    engineering_object_id: scope.engineering_object_id ?? null,
    phase_object_id: scope.phase_object_id ?? null,
    section_object_id: scope.section_object_id ?? null,
    building_object_id: scope.building_object_id ?? null,
    basement_object_id: scope.basement_object_id ?? null,
    physical_zone_object_id: scope.physical_zone_object_id ?? null,
    functional_area_object_id: scope.functional_area_object_id ?? null,
    business_type: scope.business_type ?? null,
    business_subtype: scope.business_subtype ?? null,
    recommendation_packs: scope.recommendation_packs ?? [],
    project_type_code: scope.project_type_code ?? null,
    structure_type_code: scope.structure_type_code ?? null,
    method_variant_codes: scope.method_variant_codes ?? [],
    element_variant_codes: scope.element_variant_codes ?? [],
    building_pattern_codes: scope.building_pattern_codes ?? [],
    functional_usage_codes: scope.functional_usage_codes ?? [],
    floor_usage_codes: scope.floor_usage_codes ?? [],
    functional_category_codes: scope.functional_category_codes ?? [],
    special_room_type_codes: scope.special_room_type_codes ?? [],
    physical_zone_type_codes: scope.physical_zone_type_codes ?? [],
    climate_signal: scope.climate_signal ?? null,
    monthly_climate_signal: scope.monthly_climate_signal ?? null,
    weather_impact_bands: scope.weather_impact_bands ?? [],
    total_area_m2: scope.total_area_m2 ?? null,
    building_count: scope.building_count ?? null,
    standard_floor_count: scope.standard_floor_count ?? null,
    highest_building_floor_count: scope.highest_building_floor_count ?? null,
    basement_level_count: scope.basement_level_count ?? null,
    basement_area_m2: scope.basement_area_m2 ?? null,
    foundation_depth_m: scope.foundation_depth_m ?? null,
    prefab_rate: scope.prefab_rate ?? null,
    max_span_m: scope.max_span_m ?? null,
    support_height_m: scope.support_height_m ?? null,
    hasCivilDefense: scope.hasCivilDefense ?? null,
    tower_crane_count: scope.tower_crane_count ?? null,
    construction_hoist_count: scope.construction_hoist_count ?? null,
    selected_template_ids: scope.selected_template_ids ?? [],
  })
}



export function buildScopeContextKey(scope: WbsTemplateScope) {
  return JSON.stringify({
    ...pickPersistableScopeValues(scope),
    floor_series: Array.isArray(scope.floor_series)
      ? scope.floor_series.map((floor) => ({
        floorObjectId: normalizeId(floor.floorObjectId ?? floor.floor_object_id ?? floor.id) || null,
        label: normalizeText(floor.label ?? floor.floorLabel ?? floor.floor_label ?? floor.name ?? floor.object_name),
        levelNumber: floor.levelNumber ?? floor.level_number ?? null,
        isBasement: floor.isBasement === true || floor.is_basement === true,
      }))
      : [],
  })
}



export function hasAnyScope(scope: WbsTemplateScope) {
  return Object.values(scope).some((value) => typeof value === 'string' && value.trim().length > 0)
}



export function isProjectScopeMode(scopeInput: unknown) {
  const scope = readRecord(scopeInput)
  const mode = normalizeText(scope.scopeExpansionMode ?? scope.scope_expansion_mode).toLowerCase()
  return mode === 'project' || mode === 'entire_project'
}



export function readGenerationStartDate(operation: PlanningTableOperation, fallback?: string | null) {
  return normalizeDate(
    operation.plannedStartDate
    ?? operation.startDate
    ?? operation.anchorDate
    ?? readRecord(operation.clientContext).plannedStartDate
    ?? fallback,
  ) ?? new Date().toISOString().slice(0, 10)
}



export function readGenerationDepth(operation: PlanningTableOperation): WbsTemplateGenerationDepth {
  const clientContext = readRecord(operation.clientContext)
  const rawDepth = normalizeText(
    operation.generationDepth
    ?? operation.generation_depth
    ?? clientContext.generationDepth
    ?? clientContext.generation_depth,
  ).toLowerCase()
  const rawDetailLevel = normalizeText(
    operation.detailLevel
    ?? operation.detail_level
    ?? clientContext.detailLevel
    ?? clientContext.detail_level,
  ).toLowerCase()
  if (rawDepth === 'division') return 'division'
  if (rawDepth === 'sub_division' || rawDepth === 'subdivision' || rawDepth === 'managed_frontier' || rawDepth === 'planning_skeleton') return 'sub_division'
  if (rawDepth === 'activity_step' || rawDepth === 'activity_steps') return 'activity_step'
  if (rawDepth === 'detailed') return 'activity_step'
  if (rawDepth === 'process') return 'process'
  if (rawDepth === 'standard') return 'process'
  if (rawDepth === 'item_work' || rawDepth === 'item_work_only' || rawDepth === 'itempack' || rawDepth === 'item_pack' || rawDepth === 'overview') return 'item_work'

  if (rawDetailLevel === 'planning_skeleton' || rawDetailLevel === 'managed_frontier') return 'sub_division'
  if (rawDetailLevel === 'detailed') return 'activity_step'
  if (rawDetailLevel === 'standard') return 'process'
  if (rawDetailLevel === 'overview') return 'item_work'

  const rawIncludeActivitySteps = operation.includeActivitySteps
    ?? operation.include_activity_steps
    ?? clientContext.includeActivitySteps
    ?? clientContext.include_activity_steps
  return rawIncludeActivitySteps === true || rawIncludeActivitySteps === 'true'
    ? 'activity_step'
    : 'item_work'
}



export function isWithinGenerationDepth(node: TemplateNode, generationDepth: WbsTemplateGenerationDepth) {
  return (TEMPLATE_NODE_RANK[node.categoryType] ?? TEMPLATE_NODE_RANK.custom) <= GENERATION_DEPTH_RANK[generationDepth]
}



export function isGenerationDepthFrontierNode(node: TemplateNode, generationDepth: WbsTemplateGenerationDepth) {
  return (TEMPLATE_NODE_RANK[node.categoryType] ?? TEMPLATE_NODE_RANK.custom) === GENERATION_DEPTH_RANK[generationDepth]
}



export function isManagedFrontierGeneration(generationDepth: WbsTemplateGenerationDepth) {
  return generationDepth === 'sub_division'
}



export function readTemplateNodeRank(node: TemplateNode) {
  return TEMPLATE_NODE_RANK[node.categoryType] ?? TEMPLATE_NODE_RANK.custom
}



export function readGenerationDepthRank(depth: WbsTemplateGenerationDepth) {
  return GENERATION_DEPTH_RANK[depth] ?? GENERATION_DEPTH_RANK.item_work
}



export function shouldAutoExpandOverviewItemPackToProcess(node: TemplateNode, generationDepth: WbsTemplateGenerationDepth, scope: WbsTemplateScope) {
  if (generationDepth !== 'item_work' || node.categoryType !== 'item_work') return false
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return false

  const metadata = readRecord(node.metadata)
  const explicit = normalizeText(metadata.overviewExpansionDepth ?? metadata.overview_expansion_depth).toLowerCase()
  if (explicit === 'process' || explicit === 'dynamic_process') return true
  if (explicit === 'item_work' || explicit === 'none') return false

  return OVERVIEW_PROCESS_DETAIL_ITEM_PACK_CODES.has(node.stableCode)
}



export function getChildGenerationDepth(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
): WbsTemplateGenerationDepth {
  if (isManagedFrontierGeneration(generationDepth)) {
    const policy = resolveGenerationDepthPolicyForNode(node)
    const materializeDepth = readEffectiveManagedFrontierMaterializeDepth(node, generationDepth, scope, policy)
    if (
      GENERATION_DEPTH_RANK[materializeDepth]
      && GENERATION_DEPTH_RANK[materializeDepth] > readTemplateNodeRank(node)
    ) {
      return materializeDepth
    }
  }
  return shouldAutoExpandOverviewItemPackToProcess(node, generationDepth, scope)
    ? 'process'
    : generationDepth
}



export function resolveGenerationDepthPolicyForNode(node: TemplateNode): WbsGenerationDepthPolicy {
  return resolveWbsGenerationDepthPolicy({
    stableCode: node.stableCode,
    categoryType: node.categoryType,
    templateId: node.templateId,
    name: node.standardWorkName ?? node.name,
    metadata: node.metadata,
  })
}



export function shouldMaterializeNodeInGeneration(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
) {
  const isExplicitSelectedNode = isExplicitSelectedNodeInScope(node, scope)
  if (!isManagedFrontierGeneration(generationDepth)) {
    return isGenerationDepthFrontierNode(node, generationDepth)
      || (isExplicitSelectedNode && readGenerationDepthRank(generationDepth) > readTemplateNodeRank(node))
      || (node.categoryType === 'item_work' && readGenerationDepthRank(generationDepth) > readTemplateNodeRank(node))
      || node.categoryType === 'process'
      || node.categoryType === 'activity_step'
      || node.categoryType === 'custom'
      || node.children.length === 0
  }
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return true
  if (node.categoryType === 'custom') return true
  const policy = resolveGenerationDepthPolicyForNode(node)
  const nodeRank = readTemplateNodeRank(node)
  const materializeDepth = readEffectiveManagedFrontierMaterializeDepth(node, generationDepth, scope, policy)
  const materializeRank = readGenerationDepthRank(materializeDepth)
  return nodeRank >= materializeRank || node.children.length === 0
}



export function shouldStopChildTraversalAfterMaterializingNode(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
) {
  if (!isManagedFrontierGeneration(generationDepth)) return false
  const isExplicitSelectedNode = isExplicitSelectedNodeInScope(node, scope)
  return !isExplicitSelectedNode && shouldMaterializeNodeInGeneration(node, generationDepth, scope)
}



export function shouldTraverseNodeChildrenInGeneration(
  node: TemplateNode,
  generationDepth: WbsTemplateGenerationDepth,
  scope: WbsTemplateScope,
) {
  if (node.children.length === 0) return false
  if (isFloorSeriesScope(scope) && isRhythmExpansionEligibleNode(node)) return false
  if (shouldStopChildTraversalAfterMaterializingNode(node, generationDepth, scope)) return false

  const childGenerationDepth = getChildGenerationDepth(node, generationDepth, scope)
  return readGenerationDepthRank(childGenerationDepth) > readTemplateNodeRank(node)
}



export function isDurationSuggestionNode(node: TemplateNode) {
  return node.categoryType === 'division'
    || node.categoryType === 'sub_division'
    || node.categoryType === 'item_work'
    || node.categoryType === 'process'
    || node.categoryType === 'activity_step'
}
