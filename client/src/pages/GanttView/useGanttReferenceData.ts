import { useCallback, useEffect, useState } from 'react'

import { toast } from '@/hooks/use-toast'
import { useParticipantUnits, useStore } from '@/hooks/useStore'
import { isAbortError } from '@/lib/apiClient'

import { listParticipantUnits } from './participantUnitApi'
import { sortParticipantUnits } from './participantUnitUtils'
import {
  listProjectMembers,
  type GanttProjectMember,
} from './ganttProjectDataApi'

type UseGanttReferenceDataInput = {
  projectId?: string
  dialogOpen: boolean
  conditionDialogOpen: boolean
  participantUnitsOpen: boolean
  engineeringObjectsRequired?: boolean
}

export function useGanttReferenceData({
  projectId,
  dialogOpen,
  conditionDialogOpen,
  participantUnitsOpen,
  engineeringObjectsRequired = false,
}: UseGanttReferenceDataInput) {
  const participantUnits = useParticipantUnits()
  const engineeringObjects = useStore((state) => state.engineeringObjects)
  const fetchEngineeringObjects = useStore((state) => state.fetchEngineeringObjects)
  const setEngineeringObjects = useStore((state) => state.setEngineeringObjects)
  const setParticipantUnits = useStore((state) => state.setParticipantUnits)

  const [participantUnitsLoading, setParticipantUnitsLoading] = useState(false)
  const [participantUnitsLoaded, setParticipantUnitsLoaded] = useState(false)
  const [engineeringObjectsLoading, setEngineeringObjectsLoading] = useState(false)
  const [engineeringObjectsLoaded, setEngineeringObjectsLoaded] = useState(false)
  const [projectMembers, setProjectMembers] = useState<GanttProjectMember[]>([])

  const loadParticipantUnits = useCallback(async (options?: { signal?: AbortSignal }) => {
    if (!projectId) {
      setParticipantUnits([])
      setParticipantUnitsLoaded(false)
      return
    }

    setParticipantUnitsLoading(true)
    try {
      const data = await listParticipantUnits(projectId, options?.signal)
      if (!options?.signal?.aborted) {
        setParticipantUnits(sortParticipantUnits(data ?? []))
        setParticipantUnitsLoaded(true)
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error('[GanttView] load participant units failed:', error)
        toast({ title: '加载参建单位失败，请重试', variant: 'destructive' })
      }
    } finally {
      if (!options?.signal?.aborted) {
        setParticipantUnitsLoading(false)
      }
    }
  }, [projectId, setParticipantUnits])

  const loadEngineeringObjects = useCallback(async () => {
    if (!projectId) {
      setEngineeringObjectsLoaded(false)
      return
    }

    setEngineeringObjectsLoading(true)
    try {
      await fetchEngineeringObjects(projectId)
      setEngineeringObjectsLoaded(true)
    } catch (error) {
      console.error('[GanttView] load engineering objects failed:', error)
      toast({ title: '加载工程对象失败，请重试', variant: 'destructive' })
    } finally {
      setEngineeringObjectsLoading(false)
    }
  }, [fetchEngineeringObjects, projectId])

  const ensureParticipantUnitsForLookup = useCallback(() => {
    if (!projectId || participantUnitsLoaded || participantUnitsLoading) return
    void loadParticipantUnits()
  }, [loadParticipantUnits, participantUnitsLoaded, participantUnitsLoading, projectId])

  useEffect(() => {
    if (!projectId) {
      setProjectMembers([])
      return
    }
    if (!dialogOpen && !conditionDialogOpen) {
      return
    }

    const controller = new AbortController()
    void listProjectMembers(projectId, controller.signal)
      .then(setProjectMembers)
      .catch((error) => {
        if (!isAbortError(error)) {
          console.warn('[GanttView] load project members failed', error)
          toast({ variant: 'destructive', title: '加载项目成员失败' })
        }
      })

    return () => controller.abort()
  }, [conditionDialogOpen, dialogOpen, projectId])

  useEffect(() => {
    if (!projectId) {
      setParticipantUnits([])
      setParticipantUnitsLoaded(false)
      setEngineeringObjectsLoaded(false)
      return
    }

    setParticipantUnitsLoaded(false)
    setEngineeringObjectsLoaded(false)
  }, [projectId, setParticipantUnits])

  useEffect(() => {
    if (!projectId) {
      return
    }
    if (!dialogOpen && !participantUnitsOpen) {
      return
    }
    if (participantUnitsLoaded || participantUnitsLoading) {
      return
    }

    const controller = new AbortController()
    void loadParticipantUnits({ signal: controller.signal })

    return () => {
      controller.abort()
    }
  }, [
    dialogOpen,
    loadParticipantUnits,
    participantUnitsLoaded,
    participantUnitsLoading,
    participantUnitsOpen,
    projectId,
  ])

  useEffect(() => {
    if (!projectId || (!dialogOpen && !engineeringObjectsRequired)) {
      return
    }
    if (engineeringObjectsLoaded || engineeringObjectsLoading) {
      return
    }

    void loadEngineeringObjects()
  }, [
    dialogOpen,
    engineeringObjectsRequired,
    engineeringObjectsLoaded,
    engineeringObjectsLoading,
    loadEngineeringObjects,
    projectId,
  ])

  return {
    engineeringObjects,
    engineeringObjectsLoaded,
    engineeringObjectsLoading,
    ensureParticipantUnitsForLookup,
    loadParticipantUnits,
    participantUnits,
    participantUnitsLoaded,
    participantUnitsLoading,
    projectMembers,
    setEngineeringObjects,
    setParticipantUnits,
  }
}
