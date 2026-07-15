import type { EngineeringObject } from '@/services/engineeringObjectsApi'
import { EngineeringObjectsDialog } from './EngineeringObjectsDialog'

export const OPEN_ENGINEERING_OBJECTS_DIALOG_EVENT = 'workbuddy:open-engineering-objects-dialog'

export function EngineeringObjectsDialogBridge({
  projectId,
  open,
  onOpenChange,
  engineeringObjects,
  engineeringObjectsLoaded,
  engineeringObjectsLoading,
  setEngineeringObjects,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  engineeringObjects: EngineeringObject[]
  engineeringObjectsLoaded: boolean
  engineeringObjectsLoading: boolean
  setEngineeringObjects: (objects: EngineeringObject[]) => void
}) {
  return (
    <EngineeringObjectsDialog
      projectId={projectId}
      open={open}
      onOpenChange={onOpenChange}
      initialObjects={engineeringObjects}
      initialObjectsLoaded={engineeringObjectsLoaded || engineeringObjects.length > 0}
      initialObjectsLoading={engineeringObjectsLoading}
      onObjectsChange={setEngineeringObjects}
    />
  )
}
