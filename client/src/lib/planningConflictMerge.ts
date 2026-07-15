export type PlanningConflictFieldDefinition = {
  key: string
  mergeGroup?: string | null
}

export type PlanningConflictFieldGroups = readonly (readonly string[])[]

export const PLANNING_CONFLICT_IGNORED_FIELDS = new Set([
  'id',
  'project_id',
  'version',
  'created_at',
  'updated_at',
  'updated_by',
])

function normalizeConflictValue(value: unknown) {
  return value === undefined ? null : value
}

export function isPlanningConflictValueEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeConflictValue(left)) === JSON.stringify(normalizeConflictValue(right))
}

function asConflictRecord(value: Record<string, unknown> | object | null | undefined) {
  return (value ?? {}) as Record<string, unknown>
}

export function buildPlanningConflictFieldGroups(
  fields: readonly PlanningConflictFieldDefinition[] | null | undefined,
): PlanningConflictFieldGroups {
  const groupsByMergeKey = new Map<string, string[]>()

  for (const field of fields ?? []) {
    const fieldKey = String(field.key ?? '').trim()
    const mergeGroup = String(field.mergeGroup ?? '').trim()
    if (!fieldKey || !mergeGroup || mergeGroup === 'readonly_derived') continue
    const group = groupsByMergeKey.get(mergeGroup) ?? []
    group.push(fieldKey)
    groupsByMergeKey.set(mergeGroup, group)
  }

  return [...groupsByMergeKey.values()].filter((group) => group.length > 0)
}

export function getPlanningConflictFieldGroup(
  field: string,
  fieldGroups?: PlanningConflictFieldGroups,
): readonly string[] {
  return fieldGroups?.find((group) => group.includes(field)) ?? [field]
}

export function canAutoMergePlanningUpdate(
  baseRecordInput: Record<string, unknown> | object,
  localPatchInput: Record<string, unknown> | object,
  serverRecordInput: Record<string, unknown> | object,
  options?: {
    fieldGroups?: PlanningConflictFieldGroups
  },
) {
  const baseRecord = asConflictRecord(baseRecordInput)
  const localPatch = asConflictRecord(localPatchInput)
  const serverRecord = asConflictRecord(serverRecordInput)

  const localChangedFields = Object.keys(localPatch).filter((field) => {
    if (PLANNING_CONFLICT_IGNORED_FIELDS.has(field)) return false
    return !isPlanningConflictValueEqual(baseRecord[field], localPatch[field])
  })

  return localChangedFields.every((field) => {
    const group = getPlanningConflictFieldGroup(field, options?.fieldGroups)
    const serverChangedSameGroup = group.some((groupField) => {
      return !isPlanningConflictValueEqual(baseRecord[groupField], serverRecord[groupField])
    })
    if (!serverChangedSameGroup) return true

    return group.every((groupField) => {
      if (!(groupField in localPatch)) return true
      return isPlanningConflictValueEqual(localPatch[groupField], serverRecord[groupField])
    })
  })
}

export interface PlanningItemsMergeResult<TItem> {
  items: TItem[]
  mergedCount: number
  conflictCount: number
  conflictLabels: string[]
}

function getPlanningItemKey(item: Record<string, unknown>) {
  const id = item.id
  return typeof id === 'string' && id.trim() ? id : null
}

function getPlanningItemLabel(item: Record<string, unknown>, fallback: string) {
  const title = item.title ?? item.name
  return typeof title === 'string' && title.trim() ? title.trim() : fallback
}

function buildPlanningItemPatch(
  baseItem: Record<string, unknown>,
  localItem: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields.reduce<Record<string, unknown>>((patch, field) => {
    if (!(field in localItem)) return patch
    if (isPlanningConflictValueEqual(baseItem[field], localItem[field])) return patch
    patch[field] = localItem[field]
    return patch
  }, {})
}

function hasPlanningRecordChanged(
  baseItem: Record<string, unknown>,
  nextItem: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields.some((field) => !isPlanningConflictValueEqual(baseItem[field], nextItem[field]))
}

export function mergePlanningItemsBeforeSave<TItem extends object>(
  baseItemsInput: TItem[],
  localItemsInput: TItem[],
  serverItemsInput: TItem[],
  options?: {
    fields?: readonly string[]
    fieldGroups?: PlanningConflictFieldGroups
  },
): PlanningItemsMergeResult<TItem> {
  const baseItems = baseItemsInput.map((item) => ({ ...item }))
  const localItems = localItemsInput.map((item) => ({ ...item }))
  const serverItems = serverItemsInput.map((item) => ({ ...item }))
  const fields = options?.fields ?? [
    ...new Set(
      [...baseItems, ...localItems, ...serverItems]
        .flatMap((item) => Object.keys(item as Record<string, unknown>))
        .filter((field) => !PLANNING_CONFLICT_IGNORED_FIELDS.has(field)),
    ),
  ]
  const baseById = new Map(baseItems.map((item) => [getPlanningItemKey(item as Record<string, unknown>), item]).filter((entry): entry is [string, TItem] => Boolean(entry[0])))
  const serverById = new Map(serverItems.map((item) => [getPlanningItemKey(item as Record<string, unknown>), item]).filter((entry): entry is [string, TItem] => Boolean(entry[0])))
  const localById = new Map(localItems.map((item) => [getPlanningItemKey(item as Record<string, unknown>), item]).filter((entry): entry is [string, TItem] => Boolean(entry[0])))
  const usedServerIds = new Set<string>()
  const conflictLabels: string[] = []
  let mergedCount = 0

  const items: TItem[] = localItems.map((localItem, index) => {
    const itemId = getPlanningItemKey(localItem as Record<string, unknown>)
    if (!itemId) return localItem as TItem

    const baseItem = baseById.get(itemId)
    const serverItem = serverById.get(itemId)
    if (!baseItem) return localItem as TItem
    if (!serverItem) {
      conflictLabels.push(getPlanningItemLabel(localItem as Record<string, unknown>, `Row ${index + 1}`))
      return localItem as TItem
    }

    usedServerIds.add(itemId)
    const localPatch = buildPlanningItemPatch(baseItem as Record<string, unknown>, localItem as Record<string, unknown>, fields)
    if (Object.keys(localPatch).length === 0) {
      return serverItem as TItem
    }

    if (!canAutoMergePlanningUpdate(
      baseItem as Record<string, unknown>,
      localPatch,
      serverItem as Record<string, unknown>,
      { fieldGroups: options?.fieldGroups },
    )) {
      conflictLabels.push(getPlanningItemLabel(localItem as Record<string, unknown>, `Row ${index + 1}`))
      return localItem as TItem
    }

    if (hasPlanningRecordChanged(baseItem as Record<string, unknown>, serverItem as Record<string, unknown>, fields)) {
      mergedCount += 1
    }
    return { ...serverItem, ...localPatch } as TItem
  })

  serverItems.forEach((serverItem, index) => {
    const itemId = getPlanningItemKey(serverItem as Record<string, unknown>)
    if (!itemId || usedServerIds.has(itemId) || localById.has(itemId)) return
    const baseItem = baseById.get(itemId)
    if (!baseItem) {
      items.push(serverItem as TItem)
      mergedCount += 1
      return
    }

    if (hasPlanningRecordChanged(baseItem as Record<string, unknown>, serverItem as Record<string, unknown>, fields)) {
      conflictLabels.push(getPlanningItemLabel(serverItem as Record<string, unknown>, `Server row ${index + 1}`))
    }
  })

  return {
    items,
    mergedCount,
    conflictCount: conflictLabels.length,
    conflictLabels,
  }
}
