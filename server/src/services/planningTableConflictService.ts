import {
  PLANNING_FIELD_REGISTRY,
  type PlanningFieldDefinition,
} from './planningFieldRegistryService.js'
import type { PlanningTableConflict } from '../types/planningTable.js'

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
  fields: readonly Pick<PlanningFieldDefinition, 'key' | 'mergeGroup'>[] = PLANNING_FIELD_REGISTRY,
): PlanningConflictFieldGroups {
  const groupsByMergeKey = new Map<string, string[]>()

  for (const field of fields) {
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
  fieldGroups: PlanningConflictFieldGroups = buildPlanningConflictFieldGroups(),
): readonly string[] {
  return fieldGroups.find((group) => group.includes(field)) ?? [field]
}

function getPlanningRecordKey(item: Record<string, unknown>) {
  const id = item.id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function getPlanningRecordLabel(item: Record<string, unknown>, fallback: string) {
  const title = item.title ?? item.name
  return typeof title === 'string' && title.trim() ? title.trim() : fallback
}

function buildPlanningRecordPatch(
  baseRecord: Record<string, unknown>,
  localRecord: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields.reduce<Record<string, unknown>>((patch, field) => {
    if (!(field in localRecord)) return patch
    if (isPlanningConflictValueEqual(baseRecord[field], localRecord[field])) return patch
    patch[field] = localRecord[field]
    return patch
  }, {})
}

export function canAutoMergePlanningUpdate(
  baseRecordInput: Record<string, unknown> | object,
  localPatchInput: Record<string, unknown> | object,
  serverRecordInput: Record<string, unknown> | object,
  options: {
    fieldGroups?: PlanningConflictFieldGroups
  } = {},
) {
  const baseRecord = asConflictRecord(baseRecordInput)
  const localPatch = asConflictRecord(localPatchInput)
  const serverRecord = asConflictRecord(serverRecordInput)

  const localChangedFields = Object.keys(localPatch).filter((field) => {
    if (PLANNING_CONFLICT_IGNORED_FIELDS.has(field)) return false
    return !isPlanningConflictValueEqual(baseRecord[field], localPatch[field])
  })

  return localChangedFields.every((field) => {
    const group = getPlanningConflictFieldGroup(field, options.fieldGroups)
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

export function detectPlanningTableConflicts<TItem extends object>(
  baseItemsInput: TItem[],
  localItemsInput: TItem[],
  serverItemsInput: TItem[],
  options: {
    fields?: readonly string[]
    fieldGroups?: PlanningConflictFieldGroups
  } = {},
): PlanningTableConflict[] {
  const baseItems = baseItemsInput.map((item) => ({ ...item } as Record<string, unknown>))
  const localItems = localItemsInput.map((item) => ({ ...item } as Record<string, unknown>))
  const serverItems = serverItemsInput.map((item) => ({ ...item } as Record<string, unknown>))
  const fieldGroups = options.fieldGroups ?? buildPlanningConflictFieldGroups()
  const fields = options.fields ?? [
    ...new Set(
      [...baseItems, ...localItems, ...serverItems]
        .flatMap((item) => Object.keys(item))
        .filter((field) => !PLANNING_CONFLICT_IGNORED_FIELDS.has(field)),
    ),
  ]

  const baseById = new Map(baseItems.map((item) => [getPlanningRecordKey(item), item]).filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])))
  const serverById = new Map(serverItems.map((item) => [getPlanningRecordKey(item), item]).filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0])))
  const conflicts: PlanningTableConflict[] = []

  localItems.forEach((localItem, index) => {
    const rowId = getPlanningRecordKey(localItem)
    if (!rowId) return

    const baseItem = baseById.get(rowId)
    const serverItem = serverById.get(rowId)
    if (!baseItem) return
    if (!serverItem) {
      conflicts.push({
        rowId,
        label: getPlanningRecordLabel(localItem, `Row ${index + 1}`),
        fields: [],
        mergeGroups: [],
      })
      return
    }

    const localPatch = buildPlanningRecordPatch(baseItem, localItem, fields)
    if (Object.keys(localPatch).length === 0) return
    if (canAutoMergePlanningUpdate(baseItem, localPatch, serverItem, { fieldGroups })) return

    const conflictFields = Object.keys(localPatch).filter((field) => {
      const group = getPlanningConflictFieldGroup(field, fieldGroups)
      return group.some((groupField) => !isPlanningConflictValueEqual(baseItem[groupField], serverItem[groupField]))
    })
    const mergeGroups = [...new Set(conflictFields.map((field) => getPlanningConflictFieldGroup(field, fieldGroups).join('+')))]

    conflicts.push({
      rowId,
      label: getPlanningRecordLabel(localItem, `Row ${index + 1}`),
      fields: conflictFields,
      mergeGroups,
    })
  })

  return conflicts
}
