import { useMemo } from 'react'

import { getPlanningFieldConfigStorageKey } from '@/lib/planningFieldConfig'
import { usePlanningScope } from '@/hooks/usePlanningScope'
import { getEngineeringObjectFeatureProfileFromObjects } from '@/components/planning/engineeringObjectFeatureMetadata'
import type { EngineeringObject } from '@/services/engineeringObjectsApi'

import { getTemplateGenerateScopeLabel } from './ganttViewUtils'

type UseGanttScopePreferencesInput = {
  engineeringObjects: EngineeringObject[]
  projectId?: string
  userId?: string
}

export function useGanttScopePreferences({
  engineeringObjects,
  projectId,
  userId,
}: UseGanttScopePreferencesInput) {
  const taskFieldConfigStorageKey = useMemo(
    () => getPlanningFieldConfigStorageKey(projectId, 'task_list', userId),
    [projectId, userId],
  )

  const taskScope = usePlanningScope({
    projectId,
    userId,
    objects: engineeringObjects,
  })
  const scopeSelection = taskScope.selection
  const setScopeSelection = taskScope.setSelection
  const scopeBarOptions = taskScope.options
  const templateGenerateScope = taskScope.templateScope
  const templateGenerateScopeLabel = useMemo(() => {
    const featureProfile = getEngineeringObjectFeatureProfileFromObjects(engineeringObjects, [
      scopeSelection.phaseObjectId,
      scopeSelection.sectionObjectId,
      scopeSelection.buildingObjectId,
      scopeSelection.basementObjectId,
      scopeSelection.floorObjectId,
      scopeSelection.physicalZoneObjectId,
      scopeSelection.functionalAreaObjectId,
    ])
    return getTemplateGenerateScopeLabel(scopeSelection, featureProfile)
  }, [engineeringObjects, scopeSelection])

  return {
    scopeBarOptions,
    scopeSelection,
    setScopeSelection,
    taskFieldConfigStorageKey,
    taskScope,
    templateGenerateScope,
    templateGenerateScopeLabel,
  }
}
