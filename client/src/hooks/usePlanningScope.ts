import { useEffect, useMemo, useState } from 'react'

import type { ScopeBarOptions, ScopeBarSelection } from '@/components/planning/PlanningScopeBar'
import {
  getEngineeringObjectFeatureProfileFromObjects,
  isEmptyEngineeringObjectFeatureProfile,
} from '@/components/planning/engineeringObjectFeatureMetadata'
import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { ENGINEERING_OBJECT_SCOPE_OPTION_FIELDS } from '@/lib/engineeringObjectScope'

export const TASK_SCOPE_SELECTION_STORAGE_PREFIX = 'workbuddy:planning-scope-selection:task-list'

interface PlanningScopeObject {
  id: string
  objectType?: string | null
  objectName?: string | null
  objectCode?: string | null
  metadata?: Record<string, unknown>
}

function getLocalStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function normalizeUserId(userId?: string | null) {
  return String(userId ?? 'anonymous').trim() || 'anonymous'
}

export function getTaskScopeSelectionStorageKey(projectId?: string | null, userId?: string | null) {
  const normalizedProjectId = String(projectId ?? '').trim()
  if (!normalizedProjectId) return null
  return `${TASK_SCOPE_SELECTION_STORAGE_PREFIX}:${normalizeUserId(userId)}:${normalizedProjectId}`
}

export function readStoredTaskScopeSelection(
  storageKey: string | null | undefined,
  storage: Storage | null = getLocalStorage(),
): ScopeBarSelection {
  if (!storageKey) return {}
  const parsed = safeJsonParse<ScopeBarSelection | null>(
    safeStorageGet(storage, storageKey),
    null,
    'task scope selection',
  )
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
}

export function writeStoredTaskScopeSelection(
  storageKey: string | null | undefined,
  selection: ScopeBarSelection,
  storage: Storage | null = getLocalStorage(),
) {
  if (!storageKey) return false
  return safeStorageSet(storage, storageKey, JSON.stringify(selection))
}

export function getTaskScopePatchFromSelection(selection: ScopeBarSelection) {
  const buildingObjectId = selection.buildingObjectId || null
  const basementObjectId = selection.basementObjectId || null
  const floorObjectId = selection.floorObjectId || null
  const physicalZoneObjectId = selection.physicalZoneObjectId || null
  const functionalAreaObjectId = selection.functionalAreaObjectId || null
  const phaseObjectId = selection.phaseObjectId || null
  const sectionObjectId = selection.sectionObjectId || null
  const patch: Record<string, unknown> = {
    engineering_object_id: functionalAreaObjectId || physicalZoneObjectId || floorObjectId || basementObjectId || buildingObjectId || sectionObjectId || phaseObjectId || null,
    building_object_id: buildingObjectId,
    basement_object_id: basementObjectId,
    floor_object_id: floorObjectId,
    physical_zone_object_id: physicalZoneObjectId,
    functional_area_object_id: functionalAreaObjectId,
    phase_object_id: phaseObjectId,
    section_object_id: sectionObjectId,
  }
  return patch
}

function getSelectedScopeObjectIds(selection: ScopeBarSelection) {
  return [
    selection.phaseObjectId,
    selection.sectionObjectId,
    selection.buildingObjectId,
    selection.basementObjectId,
    selection.floorObjectId,
    selection.physicalZoneObjectId,
    selection.functionalAreaObjectId,
  ]
}

export function getTemplateScopePatchFromSelection(
  selection: ScopeBarSelection,
  objects: PlanningScopeObject[],
) {
  const patch = getTaskScopePatchFromSelection(selection)
  const profile = getEngineeringObjectFeatureProfileFromObjects(
    objects,
    getSelectedScopeObjectIds(selection),
  )
  if (isEmptyEngineeringObjectFeatureProfile(profile)) return patch
  if (profile.projectTypeCode) patch.project_type_code = profile.projectTypeCode
  if (profile.structureTypeCode) patch.structure_type_code = profile.structureTypeCode
  if ((profile.methodVariantCodes ?? []).length > 0) patch.method_variant_codes = profile.methodVariantCodes
  if ((profile.elementVariantCodes ?? []).length > 0) patch.element_variant_codes = profile.elementVariantCodes
  return patch
}

function toOption(object: PlanningScopeObject) {
  return { id: object.id, label: object.objectName ?? object.objectCode ?? object.id }
}

export function buildPlanningScopeOptions(objects: PlanningScopeObject[]): ScopeBarOptions {
  const options: ScopeBarOptions = {
    buildings: [],
    basements: [],
    floors: [],
    physicalZones: [],
    functionalAreas: [],
    phases: [],
    sections: [],
  }
  for (const object of objects) {
    const optionField = object.objectType
      ? ENGINEERING_OBJECT_SCOPE_OPTION_FIELDS[object.objectType as keyof typeof ENGINEERING_OBJECT_SCOPE_OPTION_FIELDS]
      : null
    if (!optionField) continue
    options[optionField].push(toOption(object))
  }
  return options
}

export function usePlanningScope({
  projectId,
  userId,
  objects,
  storage = getLocalStorage(),
}: {
  projectId: string | null | undefined
  userId?: string | null
  objects: PlanningScopeObject[]
  storage?: Storage | null
}) {
  const storageKey = useMemo(
    () => getTaskScopeSelectionStorageKey(projectId, userId),
    [projectId, userId],
  )
  const [selection, setSelection] = useState<ScopeBarSelection>(() => (
    readStoredTaskScopeSelection(storageKey, storage)
  ))
  const options = useMemo(() => buildPlanningScopeOptions(objects), [objects])
  const patch = useMemo(() => getTaskScopePatchFromSelection(selection), [selection])
  const templateScope = useMemo(() => getTemplateScopePatchFromSelection(selection, objects), [objects, selection])
  const hasSelection = Object.values(patch).some(Boolean)

  useEffect(() => {
    setSelection(readStoredTaskScopeSelection(storageKey, storage))
  }, [storage, storageKey])

  useEffect(() => {
    writeStoredTaskScopeSelection(storageKey, selection, storage)
  }, [selection, storage, storageKey])

  return {
    selection,
    setSelection,
    clearSelection: () => setSelection({}),
    options,
    patch,
    templateScope,
    hasSelection,
    storageKey,
  }
}
