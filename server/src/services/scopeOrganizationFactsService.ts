export type ScopeOrganizationObjectInput = {
  id?: unknown
  objectId?: unknown
  object_id?: unknown
  type?: unknown
  objectType?: unknown
  object_type?: unknown
  metadata?: unknown
  [key: string]: unknown
}

export const SCOPE_ORGANIZATION_METADATA_KEYS = [
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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readCodeArray(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value]
  return [...new Set(rawValues
    .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
    .map((item) => normalizeId(item))
    .filter(Boolean))]
}

function readKindArray(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value]
  return rawValues
    .flatMap((item) => typeof item === 'string' ? item.split(/[,\s]+/) : [item])
    .map((item) => normalizeId(item))
    .filter(Boolean)
}

function uniqueStringArray(values: string[]) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

export function readScopeOrganizationMetadata(record: Record<string, unknown>) {
  const metadata = { ...readRecord(record.metadata) }
  for (const key of SCOPE_ORGANIZATION_METADATA_KEYS) {
    if (metadata[key] !== undefined || record[key] === undefined) continue
    metadata[key] = record[key]
  }
  return metadata
}

function readScopeObjectReferenceIds(record: Record<string, unknown>, camelKey: string, snakeKey: string) {
  return readArray(record[camelKey] ?? record[snakeKey])
    .map((value) => normalizeText(value))
    .filter(Boolean)
}

function readScopeObjectReferenceKinds(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  referenceIds: string[],
  objectTypeById: Map<string, string>,
) {
  const explicitKinds = readKindArray(record[camelKey] ?? record[snakeKey])
  if (explicitKinds.length > 0) return explicitKinds
  return referenceIds
    .map((id) => objectTypeById.get(id) ?? '')
    .map((kind) => normalizeId(kind))
    .filter(Boolean)
}

function incrementKindCounts(target: Record<string, number>, kinds: string[]) {
  for (const kind of kinds) {
    const normalized = normalizeId(kind)
    if (!normalized) continue
    target[normalized] = (target[normalized] ?? 0) + 1
  }
}

export function buildScopeOrganizationFactsFromObjects(
  objectInputs: unknown,
  options: {
    explicitFacts?: unknown
    source?: string
  } = {},
): Record<string, unknown> {
  const explicit = readRecord(options.explicitFacts)
  const objects = readArray(objectInputs)
    .map((item) => {
      const record = readRecord(item)
      const id = normalizeText(record.id ?? record.objectId ?? record.object_id)
      const type = normalizeId(record.type ?? record.objectType ?? record.object_type)
      if (!id || !type) return null
      return {
        id,
        type,
        metadata: readScopeOrganizationMetadata(record),
      }
    })
    .filter((item): item is { id: string, type: string, metadata: Record<string, unknown> } => Boolean(item))

  if (objects.length === 0 && Object.keys(explicit).length > 0) return explicit
  if (objects.length === 0) return {}

  const objectTypeById = new Map(objects.map((object) => [object.id, object.type]))
  let serviceRelationCount = 0
  let servedRelationCount = 0
  let sharedBasementServiceTargetCount = 0
  let sharedScopeServiceTargetCount = 0
  const serviceTargetKindCounts: Record<string, number> = {}
  const servedByScopeKindCounts: Record<string, number> = {}
  const sharedBasementServiceTargetKindCounts: Record<string, number> = {}
  const sharedScopeServiceTargetKindCounts: Record<string, number> = {}
  const organizationSignals: string[] = []

  const buildingObjectCount = objects.filter((object) => object.type === 'building').length
  const basementObjects = objects.filter((object) => object.type === 'basement')
  const sharedBasementObjects = basementObjects.filter((object) => {
    const basementKind = normalizeId(object.metadata.basementKind ?? object.metadata.basement_kind)
    const serviceTargets = readScopeObjectReferenceIds(object.metadata, 'serviceTargetObjectIds', 'service_target_object_ids')
    return Boolean(basementKind && basementKind.includes('common'))
      || Boolean(basementKind && basementKind.includes('shared'))
      || serviceTargets.length >= 2
  })
  const physicalZoneObjects = objects.filter((object) => object.type === 'physical_zone')
  const sharedPodiumObjects = physicalZoneObjects.filter((object) => {
    const physicalSpaceKind = normalizeId(object.metadata.physicalSpaceKind ?? object.metadata.physical_space_kind)
    const structuralRole = normalizeId(object.metadata.structuralRole ?? object.metadata.structural_role)
    return physicalSpaceKind === 'shared_podium'
      || structuralRole === 'podium'
      || object.metadata.sharedScopeCandidate === true
      || object.metadata.shared_scope_candidate === true
  })
  const outdoorSiteObjects = physicalZoneObjects.filter((object) => {
    const physicalSpaceKind = normalizeId(object.metadata.physicalSpaceKind ?? object.metadata.physical_space_kind)
    const physicalCategory = normalizeId(object.metadata.physicalCategory ?? object.metadata.physical_category)
    return physicalSpaceKind === 'outdoor_site' || Boolean(physicalCategory && physicalCategory.includes('outdoor_site'))
  })

  for (const object of objects) {
    const serviceTargets = readScopeObjectReferenceIds(object.metadata, 'serviceTargetObjectIds', 'service_target_object_ids')
    const servedBy = readScopeObjectReferenceIds(object.metadata, 'servedByScopeObjectIds', 'served_by_scope_object_ids')
    const serviceTargetKinds = readScopeObjectReferenceKinds(
      object.metadata,
      'serviceTargetKinds',
      'service_target_kinds',
      serviceTargets,
      objectTypeById,
    )
    const servedByKinds = readScopeObjectReferenceKinds(
      object.metadata,
      'servedByScopeKinds',
      'served_by_scope_kinds',
      servedBy,
      objectTypeById,
    )
    serviceRelationCount += serviceTargets.length
    servedRelationCount += servedBy.length
    incrementKindCounts(serviceTargetKindCounts, serviceTargetKinds)
    incrementKindCounts(servedByScopeKindCounts, servedByKinds)
    const isSharedBasement = sharedBasementObjects.some((candidate) => candidate.id === object.id)
    const isSharedScope = isSharedBasement || sharedPodiumObjects.some((candidate) => candidate.id === object.id)
    if (isSharedBasement) sharedBasementServiceTargetCount += serviceTargets.length
    if (isSharedScope) sharedScopeServiceTargetCount += serviceTargets.length
    if (isSharedBasement) incrementKindCounts(sharedBasementServiceTargetKindCounts, serviceTargetKinds)
    if (isSharedScope) incrementKindCounts(sharedScopeServiceTargetKindCounts, serviceTargetKinds)
  }

  if (buildingObjectCount >= 2) organizationSignals.push('multi_building_scope_objects')
  if (sharedBasementServiceTargetCount >= 2) organizationSignals.push('shared_basement_service_range')
  if (sharedPodiumObjects.length > 0) organizationSignals.push('shared_podium_service_range')
  if (outdoorSiteObjects.length > 0) organizationSignals.push('outdoor_site_scope_present')
  if (servedRelationCount > 0) organizationSignals.push('served_by_scope_relation_present')
  if ((sharedBasementServiceTargetKindCounts.building ?? 0) >= 2) organizationSignals.push('shared_basement_serves_multiple_buildings')
  if ((sharedScopeServiceTargetKindCounts.independent_engineering_zone ?? 0) > 0) organizationSignals.push('shared_scope_serves_independent_engineering_zone')

  return {
    ...explicit,
    source: explicit.source ?? options.source ?? 'scope_objects',
    scopeObjectCount: objects.length,
    buildingObjectCount,
    basementObjectCount: basementObjects.length,
    sharedBasementObjectCount: sharedBasementObjects.length,
    sharedPodiumObjectCount: sharedPodiumObjects.length,
    outdoorSiteObjectCount: outdoorSiteObjects.length,
    serviceRelationCount,
    servedRelationCount,
    sharedBasementServiceTargetCount,
    sharedScopeServiceTargetCount,
    serviceTargetKindCounts,
    servedByScopeKindCounts,
    sharedBasementServiceTargetKindCounts,
    sharedScopeServiceTargetKindCounts,
    organizationSignals: uniqueStringArray([
      ...readCodeArray(explicit.organizationSignals ?? explicit.organization_signals),
      ...organizationSignals,
    ]),
  }
}
