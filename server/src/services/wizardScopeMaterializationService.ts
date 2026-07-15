import {
  ENGINEERING_OBJECT_SCOPE_ARRAY_KEYS,
  ENGINEERING_OBJECT_SCOPE_ID_KEYS,
  ENGINEERING_OBJECT_TYPES,
  type EngineeringObject,
  type EngineeringObjectType,
} from '../types/db.js'
import { createEngineeringObject, updateEngineeringObject } from './engineeringObjectService.js'

type TransactionClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>
  release?: () => void
}

const SUPPORTED_SCOPE_TYPES = new Set<EngineeringObjectType>(ENGINEERING_OBJECT_TYPES)
const SCOPE_FIELD_BY_TYPE: Record<EngineeringObjectType, string> = ENGINEERING_OBJECT_SCOPE_ID_KEYS

type ScopeTreeNodeRecord = Record<string, unknown> & {
  children?: unknown[]
}

export type MaterializedScopeObject = {
  id: string
  type: EngineeringObjectType
  name: string
  parentId: string | null
  metadata: Record<string, unknown>
}

export type WizardScopeMaterializationResult = {
  objectIdByDraftId: Record<string, string>
  enrichedScopeTree: unknown[]
  materializedObjects: EngineeringObject[]
  generationScope: Record<string, unknown>
}

type ScopeGenerationObject = Pick<EngineeringObject,
  'id' | 'object_type' | 'object_name' | 'parent_id' | 'metadata'
>

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function normalizeId(value: unknown) {
  return readText(value).toLowerCase().replace(/\s+/g, '_')
}

function readScopeNodeType(value: unknown): EngineeringObjectType | null {
  const text = readText(value)
  return SUPPORTED_SCOPE_TYPES.has(text as EngineeringObjectType) ? text as EngineeringObjectType : null
}

function readDraftNodeId(node: Record<string, unknown>) {
  return readText(node.id, node.nodeId, node.node_id)
}

function resolveDraftScopeObjectId(node: Record<string, unknown>, objectType: EngineeringObjectType, index: number) {
  const explicitId = readText(node.objectId, node.object_id, node.id, node.nodeId, node.node_id)
  return explicitId || `draft-${objectType}-${index + 1}`
}

const SCOPE_ORGANIZATION_METADATA_KEYS = [
  'serviceTargetObjectIds',
  'service_target_object_ids',
  'serviceTargetNames',
  'service_target_names',
  'serviceTargetKinds',
  'service_target_kinds',
  'servedByScopeObjectIds',
  'served_by_scope_object_ids',
  'servedByScopeNames',
  'served_by_scope_names',
  'servedByScopeKinds',
  'served_by_scope_kinds',
  'physicalSpaceKind',
  'physical_space_kind',
  'physicalCategory',
  'physical_category',
  'structuralRole',
  'structural_role',
  'sharedScopeCandidate',
  'shared_scope_candidate',
  'basementKind',
  'basement_kind',
] as const

function readScopeNodeMetadata(node: Record<string, unknown>) {
  const metadata = { ...readRecord(node.metadata) }
  for (const key of SCOPE_ORGANIZATION_METADATA_KEYS) {
    if (metadata[key] !== undefined || node[key] === undefined) continue
    metadata[key] = node[key]
  }
  return metadata
}

function remapIdArray(value: unknown, idMap: Map<string, string>) {
  return readArray(value)
    .map((item) => readText(item))
    .filter(Boolean)
    .map((id) => idMap.get(id) ?? id)
}

function remapScopeReferenceMetadata(metadata: Record<string, unknown>, idMap: Map<string, string>) {
  const next = { ...metadata }
  for (const key of [
    'serviceTargetObjectIds',
    'service_target_object_ids',
    'servedByScopeObjectIds',
    'served_by_scope_object_ids',
  ]) {
    if (Array.isArray(next[key])) {
      next[key] = remapIdArray(next[key], idMap)
    }
  }
  return next
}

function buildObjectMetadata(params: {
  node: ScopeTreeNodeRecord
  draftId: string
  actorId?: string | null
  idMap: Map<string, string>
  generationBatchId?: string | null
}) {
  const metadata = remapScopeReferenceMetadata(readScopeNodeMetadata(params.node), params.idMap)
  return {
    ...metadata,
    ...(params.draftId ? { wizardScopeNodeId: params.draftId } : {}),
    ...(params.actorId ? { wizardMaterializedBy: params.actorId } : {}),
    ...(params.generationBatchId ? { wizardGenerationBatchId: params.generationBatchId } : {}),
    wizardScopeSource: 'project_wizard_scope_tree',
  }
}

function buildScopeObject(object: ScopeGenerationObject): MaterializedScopeObject {
  return {
    id: object.id,
    type: object.object_type,
    name: object.object_name,
    parentId: object.parent_id ?? null,
    metadata: readRecord(object.metadata),
  }
}

function readScopeObjectPhysicalSpaceKind(object: ScopeGenerationObject) {
  const metadata = readRecord(object.metadata)
  return normalizeId(metadata.physicalSpaceKind ?? metadata.physical_space_kind)
}

function readScopeObjectStructuralRole(object: ScopeGenerationObject) {
  const metadata = readRecord(object.metadata)
  return normalizeId(metadata.structuralRole ?? metadata.structural_role)
}

function isSharedPodiumScopeObject(object: ScopeGenerationObject) {
  if (object.object_type !== 'physical_zone') return false
  const metadata = readRecord(object.metadata)
  return readScopeObjectPhysicalSpaceKind(object) === 'shared_podium'
    || readScopeObjectStructuralRole(object) === 'podium'
    || metadata.sharedScopeCandidate === true
    || metadata.shared_scope_candidate === true
}

function isInternalTowerScopeObject(object: ScopeGenerationObject) {
  return object.object_type === 'physical_zone'
    && readScopeObjectStructuralRole(object) === 'tower'
    && !isSharedPodiumScopeObject(object)
}

function isSuppressedComboScopeObject(object: ScopeGenerationObject) {
  return object.object_type === 'physical_zone'
    && (
      readScopeObjectPhysicalSpaceKind(object) === 'horizontal_work_zone'
      || isInternalTowerScopeObject(object)
    )
}

function isStandardScopeComboAnchor(object: ScopeGenerationObject) {
  return object.object_type === 'building'
    || object.object_type === 'basement'
    || object.object_type === 'floor'
    || isSharedPodiumScopeObject(object)
}

function findStandardScopeComboAnchor(
  leaf: ScopeGenerationObject,
  byId: Map<string, ScopeGenerationObject>,
) {
  if (isSuppressedComboScopeObject(leaf)) return null

  let current: ScopeGenerationObject | undefined = leaf
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (isStandardScopeComboAnchor(current)) return current
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return null
}

function buildScopeCombos(objects: ScopeGenerationObject[]) {
  const byId = new Map(objects.map((object) => [object.id, object]))
  const childCounts = new Map<string, number>()
  for (const object of objects) {
    if (!object.parent_id) continue
    childCounts.set(object.parent_id, (childCounts.get(object.parent_id) ?? 0) + 1)
  }

  return objects
    .filter((object) => (childCounts.get(object.id) ?? 0) === 0)
    .map((leaf) => {
      const anchor = findStandardScopeComboAnchor(leaf, byId)
      if (!anchor) return null
      const combo: Record<string, unknown> = {}
      let current: ScopeGenerationObject | undefined = anchor
      const visited = new Set<string>()
      while (current && !visited.has(current.id)) {
        visited.add(current.id)
        if (!isSuppressedComboScopeObject(current)) {
          const field = SCOPE_FIELD_BY_TYPE[current.object_type]
          if (field && !combo[field]) combo[field] = current.id
        }
        current = current.parent_id ? byId.get(current.parent_id) : undefined
      }
      return combo
    })
    .filter((combo): combo is Record<string, unknown> => Boolean(combo) && Object.keys(combo).length > 0)
}

function buildGenerationScope(objects: ScopeGenerationObject[]) {
  const generationScope: Record<string, unknown> = {
    scope_objects: objects.map(buildScopeObject),
  }
  const directScopeIds: Record<string, string> = {}

  for (const object of objects) {
    const arrayKey = ENGINEERING_OBJECT_SCOPE_ARRAY_KEYS[object.object_type]
    const idKey = ENGINEERING_OBJECT_SCOPE_ID_KEYS[object.object_type]
    const list = Array.isArray(generationScope[arrayKey]) ? generationScope[arrayKey] as string[] : []
    list.push(object.id)
    generationScope[arrayKey] = list
    if (!directScopeIds[idKey]) directScopeIds[idKey] = object.id
  }

  const scopeCombos = buildScopeCombos(objects)
  if (scopeCombos.length > 0) generationScope.scope_combos = scopeCombos
  if (scopeCombos.length === 0) Object.assign(generationScope, directScopeIds)

  return generationScope
}

export function buildDraftWizardGenerationScope(scopeTree: unknown[]) {
  const draftIdToObjectId = new Map<string, string>()
  let objectIndex = 0

  const collectIds = (nodeInput: unknown) => {
    const node = readRecord(nodeInput) as ScopeTreeNodeRecord
    const objectType = readScopeNodeType(node.type)
    const objectName = readText(node.name, node.objectName, node.object_name)
    if (!objectType || !objectName) return

    const draftId = readDraftNodeId(node)
    const objectId = resolveDraftScopeObjectId(node, objectType, objectIndex)
    objectIndex += 1
    if (draftId) draftIdToObjectId.set(draftId, objectId)

    for (const child of readArray(node.children)) collectIds(child)
  }

  for (const node of readArray(scopeTree)) collectIds(node)

  const objects: ScopeGenerationObject[] = []
  const buildObjects = (nodeInput: unknown, parentId: string | null) => {
    const node = readRecord(nodeInput) as ScopeTreeNodeRecord
    const objectType = readScopeNodeType(node.type)
    const objectName = readText(node.name, node.objectName, node.object_name)
    if (!objectType || !objectName) return

    const draftId = readDraftNodeId(node)
    const objectId = draftId ? draftIdToObjectId.get(draftId) : ''
    const id = objectId || resolveDraftScopeObjectId(node, objectType, objects.length)
    objects.push({
      id,
      object_type: objectType,
      object_name: objectName,
      parent_id: parentId,
      metadata: {
        ...remapScopeReferenceMetadata(readScopeNodeMetadata(node), draftIdToObjectId),
        wizardScopeSource: 'project_wizard_preview_scope_tree',
      },
    })

    for (const child of readArray(node.children)) buildObjects(child, id)
  }

  for (const node of readArray(scopeTree)) buildObjects(node, null)

  return buildGenerationScope(objects)
}

export async function materializeWizardScopeTree(params: {
  projectId: string
  scopeTree: unknown[]
  actorId?: string | null
  generationBatchId?: string | null
  transactionClient?: TransactionClientLike | null
}): Promise<WizardScopeMaterializationResult> {
  const objectIdByDraftId: Record<string, string> = {}
  const idMap = new Map<string, string>()
  const materializedObjects: EngineeringObject[] = []

  const materializeNode = async (
    nodeInput: unknown,
    parentId: string | null,
    sortOrder: number,
  ): Promise<unknown | null> => {
    const node = readRecord(nodeInput) as ScopeTreeNodeRecord
    const objectType = readScopeNodeType(node.type)
    const objectName = readText(node.name, node.objectName, node.object_name)
    if (!objectType || !objectName) return null

    const draftId = readDraftNodeId(node)
    const created = await createEngineeringObject({
      projectId: params.projectId,
      objectType,
      objectName,
      parentId,
      sortOrder,
      transactionClient: params.transactionClient,
      metadata: buildObjectMetadata({
        node,
        draftId,
        actorId: params.actorId,
        idMap,
        generationBatchId: params.generationBatchId,
      }),
    })

    if (draftId) {
      objectIdByDraftId[draftId] = created.id
      idMap.set(draftId, created.id)
    }
    materializedObjects.push(created)

    const children = readArray(node.children)
    const enrichedChildren: unknown[] = []
    for (const [childIndex, child] of children.entries()) {
      const enrichedChild = await materializeNode(child, created.id, childIndex)
      if (enrichedChild) enrichedChildren.push(enrichedChild)
    }

    const enrichedMetadata = remapScopeReferenceMetadata(readRecord(created.metadata), idMap)
    return {
      ...node,
      objectId: created.id,
      object_id: created.id,
      parentId,
      parent_id: parentId,
      metadata: enrichedMetadata,
      children: enrichedChildren,
    }
  }

  const enrichedScopeTree: unknown[] = []
  for (const [index, node] of readArray(params.scopeTree).entries()) {
    const enrichedNode = await materializeNode(node, null, index)
    if (enrichedNode) enrichedScopeTree.push(enrichedNode)
  }

  for (const object of materializedObjects) {
    const remappedMetadata = remapScopeReferenceMetadata(readRecord(object.metadata), idMap)
    if (JSON.stringify(remappedMetadata) !== JSON.stringify(readRecord(object.metadata))) {
      await updateEngineeringObject(object.id, {
        projectId: params.projectId,
        metadata: remappedMetadata,
        transactionClient: params.transactionClient,
      })
      object.metadata = remappedMetadata
    }
  }

  const remappedScopeTree = remapEnrichedScopeTree(enrichedScopeTree, idMap)

  return {
    objectIdByDraftId,
    enrichedScopeTree: remappedScopeTree,
    materializedObjects,
    generationScope: buildGenerationScope(materializedObjects),
  }
}

function remapEnrichedScopeTree(nodes: unknown[], idMap: Map<string, string>): unknown[] {
  return nodes.map((nodeInput) => {
    const node = readRecord(nodeInput)
    return {
      ...node,
      metadata: remapScopeReferenceMetadata(readRecord(node.metadata), idMap),
      children: remapEnrichedScopeTree(readArray(node.children), idMap),
    }
  })
}
