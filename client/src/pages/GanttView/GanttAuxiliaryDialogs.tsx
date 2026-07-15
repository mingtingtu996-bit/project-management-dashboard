import { lazy, Suspense, useEffect, type ComponentProps } from 'react'

import type { ConditionWarningModal } from '@/components/ConditionWarningModal'
import type { PlanningExportDialog } from '@/components/planning/PlanningExportDialog'

import type { GanttDeleteProtectionDialog } from './GanttDeleteProtectionDialog'
import type { ParticipantUnitsDialog } from './ParticipantUnitsDialog'
import type { EngineeringObjectsDialogBridge } from './EngineeringObjectsDialogBridge'

const LazyConditionWarningModal = lazy(() =>
  import('@/components/ConditionWarningModal').then((module) => ({ default: module.ConditionWarningModal })),
)
const LazyPlanningExportDialog = lazy(() =>
  import('@/components/planning/PlanningExportDialog').then((module) => ({ default: module.PlanningExportDialog })),
)
const LazyGanttDeleteProtectionDialog = lazy(() =>
  import('./GanttDeleteProtectionDialog').then((module) => ({ default: module.GanttDeleteProtectionDialog })),
)
const LazyParticipantUnitsDialog = lazy(() =>
  import('./ParticipantUnitsDialog').then((module) => ({ default: module.ParticipantUnitsDialog })),
)
const loadEngineeringObjectsDialogBridge = () =>
  import('./EngineeringObjectsDialogBridge').then((module) => ({ default: module.EngineeringObjectsDialogBridge }))

const LazyEngineeringObjectsDialogBridge = lazy(loadEngineeringObjectsDialogBridge)

type GanttAuxiliaryDialogsProps = {
  conditionWarningProps: ComponentProps<typeof ConditionWarningModal>
  deleteProtectionProps: ComponentProps<typeof GanttDeleteProtectionDialog>
  exportDialogProps: ComponentProps<typeof PlanningExportDialog>
  participantUnitsProps: ComponentProps<typeof ParticipantUnitsDialog>
  engineeringObjectsBridgeProps: ComponentProps<typeof EngineeringObjectsDialogBridge>
}

export function GanttAuxiliaryDialogs({
  conditionWarningProps,
  deleteProtectionProps,
  exportDialogProps,
  participantUnitsProps,
  engineeringObjectsBridgeProps,
}: GanttAuxiliaryDialogsProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadEngineeringObjectsDialogBridge()
    }, 800)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <Suspense fallback={null}>
      {exportDialogProps.open ? <LazyPlanningExportDialog {...exportDialogProps} /> : null}
      {participantUnitsProps.open ? <LazyParticipantUnitsDialog {...participantUnitsProps} /> : null}
      <LazyEngineeringObjectsDialogBridge {...engineeringObjectsBridgeProps} />
      {deleteProtectionProps.target ? <LazyGanttDeleteProtectionDialog {...deleteProtectionProps} /> : null}
      {conditionWarningProps.open ? <LazyConditionWarningModal {...conditionWarningProps} /> : null}
    </Suspense>
  )
}
