import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'

import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/apiClient'

import type { DeleteGuardTarget } from './deleteProtection'
import type { Task, TaskObstacle } from '../GanttViewTypes'
import { getTaskObstaclesForTask, toStoreObstacleRecords } from './ganttViewUtils'
import {
  closeTaskObstacleRecord,
  createTaskObstacle,
  updateTaskObstacle,
} from './taskObstacleApi'

type SetProjectObstacles = (obstacles: ReturnType<typeof toStoreObstacleRecords>) => void

type DrawerBlockageInput = {
  description: string
  severity: string
  expectedResolutionDate: string
}

type QuickBlockageInput = {
  description: string
  severity: string
  expectedResolution?: string
}

type UseGanttObstacleActionsInput = {
  canEdit: boolean
  deleteGuardTarget: DeleteGuardTarget | null
  detailDrawerTask: Task | null
  editingObstacleExpectedResolutionDate: string
  editingObstacleResolutionNotes: string
  editingObstacleSeverity: string
  editingObstacleTitle: string
  newObstacleExpectedResolutionDate: string
  newObstacleResolutionNotes: string
  newObstacleSeverity: string
  newObstacleTitle: string
  obstacleTask: Task | null
  projectId?: string | null
  projectObstacles: TaskObstacle[]
  setDeleteGuardSecondarySubmitting: (submitting: boolean) => void
  setDeleteGuardTarget: Dispatch<SetStateAction<DeleteGuardTarget | null>>
  setEditingObstacleExpectedResolutionDate: (date: string) => void
  setEditingObstacleId: (obstacleId: string | null) => void
  setEditingObstacleResolutionNotes: (notes: string) => void
  setEditingObstacleSeverity: (severity: string) => void
  setEditingObstacleTitle: (title: string) => void
  setNewObstacleExpectedResolutionDate: (date: string) => void
  setNewObstacleResolutionNotes: (notes: string) => void
  setNewObstacleSeverity: (severity: string) => void
  setNewObstacleTitle: (title: string) => void
  setObstacleDialogOpen: (open: boolean) => void
  setObstacleTask: (task: Task | null) => void
  setObstaclesLoading: (loading: boolean) => void
  setProjectObstacles: SetProjectObstacles
  setTaskObstacles: Dispatch<SetStateAction<TaskObstacle[]>>
  taskObstacles: TaskObstacle[]
}

export function useGanttObstacleActions({
  canEdit,
  deleteGuardTarget,
  detailDrawerTask,
  editingObstacleExpectedResolutionDate,
  editingObstacleResolutionNotes,
  editingObstacleSeverity,
  editingObstacleTitle,
  newObstacleExpectedResolutionDate,
  newObstacleResolutionNotes,
  newObstacleSeverity,
  newObstacleTitle,
  obstacleTask,
  projectId,
  projectObstacles,
  setDeleteGuardSecondarySubmitting,
  setDeleteGuardTarget,
  setEditingObstacleExpectedResolutionDate,
  setEditingObstacleId,
  setEditingObstacleResolutionNotes,
  setEditingObstacleSeverity,
  setEditingObstacleTitle,
  setNewObstacleExpectedResolutionDate,
  setNewObstacleResolutionNotes,
  setNewObstacleSeverity,
  setNewObstacleTitle,
  setObstacleDialogOpen,
  setObstacleTask,
  setObstaclesLoading,
  setProjectObstacles,
  setTaskObstacles,
  taskObstacles,
}: UseGanttObstacleActionsInput) {
  useEffect(() => {
    if (!obstacleTask) return

    setTaskObstacles(getTaskObstaclesForTask(obstacleTask.id, projectObstacles))
  }, [obstacleTask, projectObstacles, setTaskObstacles])

  const resetNewObstacleForm = useCallback(() => {
    setNewObstacleTitle('')
    setNewObstacleSeverity('medium')
    setNewObstacleExpectedResolutionDate('')
    setNewObstacleResolutionNotes('')
  }, [
    setNewObstacleExpectedResolutionDate,
    setNewObstacleResolutionNotes,
    setNewObstacleSeverity,
    setNewObstacleTitle,
  ])

  const resetEditingObstacleForm = useCallback(() => {
    setEditingObstacleId(null)
    setEditingObstacleTitle('')
    setEditingObstacleSeverity('medium')
    setEditingObstacleExpectedResolutionDate('')
    setEditingObstacleResolutionNotes('')
  }, [
    setEditingObstacleExpectedResolutionDate,
    setEditingObstacleId,
    setEditingObstacleResolutionNotes,
    setEditingObstacleSeverity,
    setEditingObstacleTitle,
  ])

  const replaceObstacleInState = useCallback((obstacleId: string, nextObstacle: TaskObstacle) => {
    setProjectObstacles(
      toStoreObstacleRecords(projectObstacles.map((item) => (item.id === obstacleId ? { ...item, ...nextObstacle } : item))),
    )
    setTaskObstacles((prev) => prev.map((item) => (item.id === obstacleId ? nextObstacle : item)))
  }, [projectObstacles, setProjectObstacles, setTaskObstacles])

  const openObstacleDialog = useCallback(async (task: Task) => {
    setObstacleTask(task)
    setObstacleDialogOpen(true)
    setObstaclesLoading(true)
    resetNewObstacleForm()
    resetEditingObstacleForm()
    try {
      setTaskObstacles(projectObstacles.filter((obstacle) => obstacle.task_id === task.id) as TaskObstacle[])
    } catch {
      toast({ title: '加载障碍失败', variant: 'destructive' })
    } finally {
      setObstaclesLoading(false)
    }
  }, [
    projectObstacles,
    resetEditingObstacleForm,
    resetNewObstacleForm,
    setObstacleDialogOpen,
    setObstacleTask,
    setObstaclesLoading,
    setTaskObstacles,
  ])

  const handleAddObstacle = useCallback(async () => {
    if (!newObstacleTitle.trim() || !newObstacleExpectedResolutionDate || !obstacleTask || !canEdit) return
    try {
      const nextObstacle = await createTaskObstacle({
        task: obstacleTask,
        projectId: projectId ?? '',
        description: newObstacleTitle.trim(),
        severity: newObstacleSeverity,
        expectedResolutionDate: newObstacleExpectedResolutionDate,
        resolutionNotes: newObstacleResolutionNotes,
      })
      setProjectObstacles(toStoreObstacleRecords([nextObstacle, ...projectObstacles]))
      setTaskObstacles((prev) => [nextObstacle, ...prev])
      resetNewObstacleForm()
    } catch {
      toast({ title: '新增障碍记录失败', variant: 'destructive' })
    }
  }, [
    canEdit,
    newObstacleExpectedResolutionDate,
    newObstacleResolutionNotes,
    newObstacleSeverity,
    newObstacleTitle,
    obstacleTask,
    projectId,
    projectObstacles,
    resetNewObstacleForm,
    setProjectObstacles,
    setTaskObstacles,
  ])

  const handleResolveObstacle = useCallback(async (obstacle: TaskObstacle) => {
    if (!canEdit) return
    try {
      const nextObstacle = await updateTaskObstacle({
        obstacleId: obstacle.id,
        values: { status: '已解决' },
        fallback: { ...obstacle, status: '已解决' },
      })
      replaceObstacleInState(obstacle.id, nextObstacle)
      toast({ title: '障碍已标记为已解决' })
    } catch {
      toast({ title: '操作失败', variant: 'destructive' })
    }
  }, [canEdit, replaceObstacleInState])

  const handleCloseObstacleRecord = useCallback(async (obstacleId: string) => {
    const obstacle = taskObstacles.find((item) => item.id === obstacleId)
      ?? projectObstacles.find((item) => item.id === obstacleId)
    const closeEndpoint =
      deleteGuardTarget?.kind === 'obstacle' && deleteGuardTarget.id === obstacleId
        ? deleteGuardTarget.details?.close_action?.endpoint
        : null
    if (!obstacle) {
      setDeleteGuardTarget(null)
      return
    }
    if (String(obstacle.status ?? '').trim() === '已解决') {
      toast({ title: '阻碍已处于关闭状态', description: '当前阻碍已经是已解决状态。' })
      setDeleteGuardTarget(null)
      return
    }
    try {
      setDeleteGuardSecondarySubmitting(true)
      const nextObstacle = await closeTaskObstacleRecord({
        obstacleId,
        endpoint: closeEndpoint,
        fallback: { ...obstacle, status: '已解决' },
      })
      const resolvedObstacle = nextObstacle ?? { ...obstacle, status: '已解决' }
      setProjectObstacles(
        toStoreObstacleRecords(
          projectObstacles.map((item) => (item.id === obstacleId ? { ...item, ...resolvedObstacle } : item)),
        ),
      )
      setTaskObstacles((prev) => (
        prev.map((item) => (item.id === obstacleId ? { ...item, ...resolvedObstacle } : item))
      ))
      setDeleteGuardTarget(null)
      toast({ title: '已关闭此阻碍记录', description: '阻碍已转为已解决，留痕会继续保留。' })
    } catch (error) {
      toast({
        title: '关闭阻碍失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    } finally {
      setDeleteGuardSecondarySubmitting(false)
    }
  }, [
    deleteGuardTarget,
    projectObstacles,
    setDeleteGuardSecondarySubmitting,
    setDeleteGuardTarget,
    setProjectObstacles,
    setTaskObstacles,
    taskObstacles,
  ])

  const handleDeleteObstacle = useCallback((obstacleId: string) => {
    if (!canEdit) return
    const obstacle = taskObstacles.find((item) => item.id === obstacleId)
      ?? projectObstacles.find((item) => item.id === obstacleId)
    setDeleteGuardTarget({
      kind: 'obstacle',
      id: obstacleId,
      title: obstacle?.title || '未命名阻碍',
      blocked: false,
    })
  }, [canEdit, projectObstacles, setDeleteGuardTarget, taskObstacles])

  const handleSaveObstacleEdit = useCallback(async (obstacleId: string) => {
    if (!editingObstacleTitle.trim() || !editingObstacleExpectedResolutionDate || !canEdit) return
    try {
      const editedObstacleValues = {
        description: editingObstacleTitle.trim(),
        severity: editingObstacleSeverity || null,
        expected_resolution_date: editingObstacleExpectedResolutionDate,
        resolution_notes: editingObstacleResolutionNotes.trim() || null,
      }
      const nextObstacle = await updateTaskObstacle({
        obstacleId,
        values: editedObstacleValues,
        fallback: {
          ...taskObstacles.find((item) => item.id === obstacleId),
          ...editedObstacleValues,
        } as TaskObstacle,
      })
      replaceObstacleInState(obstacleId, nextObstacle)
      resetEditingObstacleForm()
      toast({ title: '障碍已更新' })
    } catch {
      toast({ title: '更新失败', variant: 'destructive' })
    }
  }, [
    canEdit,
    editingObstacleExpectedResolutionDate,
    editingObstacleResolutionNotes,
    editingObstacleSeverity,
    editingObstacleTitle,
    replaceObstacleInState,
    resetEditingObstacleForm,
    taskObstacles,
  ])

  const handleAddDrawerBlockage = useCallback(async (data: DrawerBlockageInput) => {
    if (!detailDrawerTask || !canEdit || !projectId) return
    try {
      const nextObstacle = await createTaskObstacle({
        task: detailDrawerTask,
        projectId,
        description: data.description,
        severity: data.severity,
        expectedResolutionDate: data.expectedResolutionDate,
      })
      setProjectObstacles(toStoreObstacleRecords([nextObstacle, ...projectObstacles]))
      setTaskObstacles((prev) => (
        obstacleTask?.id === detailDrawerTask.id ? [nextObstacle, ...prev] : prev
      ))
      toast({ title: '已登记阻碍' })
    } catch (error) {
      toast({
        title: '登记阻碍失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }, [
    canEdit,
    detailDrawerTask,
    obstacleTask?.id,
    projectId,
    projectObstacles,
    setProjectObstacles,
    setTaskObstacles,
  ])

  const handleQuickAddTaskObstacle = useCallback(async (task: Task, data: QuickBlockageInput) => {
    if (!task.id || !canEdit || !projectId) return
    try {
      const nextObstacle = await createTaskObstacle({
        task,
        projectId,
        description: data.description,
        severity: data.severity,
        expectedResolutionDate: data.expectedResolution,
      })
      setProjectObstacles(toStoreObstacleRecords([nextObstacle, ...projectObstacles]))
      setTaskObstacles((prev) => (
        obstacleTask?.id === task.id ? [nextObstacle, ...prev] : prev
      ))
      toast({ title: '已登记阻碍' })
    } catch (error) {
      toast({
        title: '登记阻碍失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
      throw error
    }
  }, [
    canEdit,
    obstacleTask?.id,
    projectId,
    projectObstacles,
    setProjectObstacles,
    setTaskObstacles,
  ])

  return {
    handleAddDrawerBlockage,
    handleAddObstacle,
    handleCloseObstacleRecord,
    handleDeleteObstacle,
    handleQuickAddTaskObstacle,
    handleResolveObstacle,
    handleSaveObstacleEdit,
    openObstacleDialog,
  }
}
