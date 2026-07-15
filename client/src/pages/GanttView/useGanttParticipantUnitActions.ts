import { useCallback, type Dispatch, type SetStateAction } from 'react'

import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/apiClient'

import type { ParticipantUnitDraft, ParticipantUnitRecord } from './ParticipantUnitsDialog'
import {
  createEmptyParticipantUnitDraft,
  sortParticipantUnits,
  toParticipantUnitDraft,
} from './participantUnitUtils'
import {
  deleteParticipantUnitRecord,
  saveParticipantUnitDraft,
} from './participantUnitApi'

type UseGanttParticipantUnitActionsInput = {
  canEdit: boolean
  loadTasks: () => Promise<unknown> | void
  participantUnitDraft: ParticipantUnitDraft
  participantUnits: ParticipantUnitRecord[]
  projectId?: string | null
  setParticipantUnitDraft: Dispatch<SetStateAction<ParticipantUnitDraft>>
  setParticipantUnitSaving: (saving: boolean) => void
  setParticipantUnits: (units: ParticipantUnitRecord[]) => void
  setParticipantUnitsOpen: (open: boolean) => void
}

export function useGanttParticipantUnitActions({
  canEdit,
  loadTasks,
  participantUnitDraft,
  participantUnits,
  projectId,
  setParticipantUnitDraft,
  setParticipantUnitSaving,
  setParticipantUnits,
  setParticipantUnitsOpen,
}: UseGanttParticipantUnitActionsInput) {
  const resetParticipantUnitDraft = useCallback(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(projectId))
  }, [projectId, setParticipantUnitDraft])

  const openParticipantUnitsDialog = useCallback(() => {
    resetParticipantUnitDraft()
    setParticipantUnitsOpen(true)
  }, [resetParticipantUnitDraft, setParticipantUnitsOpen])

  const handleParticipantUnitsOpenChange = useCallback((open: boolean) => {
    setParticipantUnitsOpen(open)
    if (!open) resetParticipantUnitDraft()
  }, [resetParticipantUnitDraft, setParticipantUnitsOpen])

  const handleParticipantUnitCreateNew = useCallback(() => {
    resetParticipantUnitDraft()
  }, [resetParticipantUnitDraft])

  const handleParticipantUnitEdit = useCallback((unit: ParticipantUnitRecord) => {
    setParticipantUnitDraft(toParticipantUnitDraft(unit, projectId))
  }, [projectId, setParticipantUnitDraft])

  const handleParticipantUnitSubmit = useCallback(async () => {
    if (!projectId || !canEdit) return

    if (!participantUnitDraft.unit_name.trim()) {
      toast({ title: '请先填写单位名称', variant: 'destructive' })
      return
    }

    setParticipantUnitSaving(true)
    try {
      const savedUnit = await saveParticipantUnitDraft(participantUnitDraft, projectId)
      if (savedUnit.created) {
        setParticipantUnits(sortParticipantUnits([...participantUnits, savedUnit.record]))
        toast({ title: '参建单位已创建', description: savedUnit.record.unit_name })
      } else {
        setParticipantUnits(sortParticipantUnits(
          participantUnits.map((unit) => (unit.id === savedUnit.record.id ? savedUnit.record : unit)),
        ))
        toast({ title: '参建单位已更新', description: savedUnit.record.unit_name })
      }

      resetParticipantUnitDraft()
      void loadTasks()
    } catch (error) {
      toast({
        title: '参建单位保存失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setParticipantUnitSaving(false)
    }
  }, [
    canEdit,
    loadTasks,
    participantUnitDraft,
    participantUnits,
    projectId,
    resetParticipantUnitDraft,
    setParticipantUnitSaving,
    setParticipantUnits,
  ])

  const handleParticipantUnitDelete = useCallback(async (unit: ParticipantUnitRecord) => {
    if (!canEdit) return
    setParticipantUnitSaving(true)
    try {
      await deleteParticipantUnitRecord(unit.id)
      setParticipantUnits(participantUnits.filter((item) => item.id !== unit.id))
      setParticipantUnitDraft((current) => (
        current.id === unit.id ? createEmptyParticipantUnitDraft(projectId) : current
      ))
      toast({ title: '参建单位已删除', description: unit.unit_name })
      void loadTasks()
    } catch (error) {
      toast({
        title: '参建单位删除失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setParticipantUnitSaving(false)
    }
  }, [
    canEdit,
    loadTasks,
    participantUnits,
    projectId,
    setParticipantUnitDraft,
    setParticipantUnitSaving,
    setParticipantUnits,
  ])

  return {
    handleParticipantUnitCreateNew,
    handleParticipantUnitDelete,
    handleParticipantUnitEdit,
    handleParticipantUnitSubmit,
    handleParticipantUnitsOpenChange,
    openParticipantUnitsDialog,
  }
}
