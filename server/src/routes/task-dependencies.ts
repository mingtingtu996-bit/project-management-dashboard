import { Router } from 'express'
import { authenticate, getAuthorizedRequestProjectId, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { supabase } from '../services/dbService.js'
import { replaceTaskDependencies } from '../services/taskStandardModelService.js'
import { evaluateTaskConstraint } from '../services/taskConstraintGovernanceService.js'
import type { ApiResponse } from '../types/index.js'
import type { TaskDependency } from '../types/db.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

function now() { return new Date().toISOString() }

// GET /api/tasks/:taskId/dependencies
router.get(
  '/',
  requireProjectMember(async (req) => {
    const { data } = await supabase.from('tasks').select('project_id').eq('id', req.params.taskId).maybeSingle()
    return (data as any)?.project_id ?? ''
  }),
  asyncHandler(async (req, res) => {
    const taskId = req.params.taskId
    const { data, error } = await supabase
      .from('task_dependencies')
      .select('*')
      .eq('task_id', taskId)
      .eq('status', 'active')
      .order('dependency_type')
    if (error) throw new Error(`Failed to list dependencies: ${error.message}`)
    res.json({ success: true, data: data ?? [], timestamp: now() } as ApiResponse<TaskDependency[]>)
  }),
)

// PUT /api/tasks/:taskId/dependencies - replace all dependencies
router.put(
  '/',
  requireProjectEditor(async (req) => {
    const { data } = await supabase.from('tasks').select('project_id').eq('id', req.params.taskId).maybeSingle()
    return (data as any)?.project_id ?? ''
  }),
  asyncHandler(async (req, res) => {
    const taskId = req.params.taskId
    const deps: Array<{ dependencyTaskId: string; dependencyType?: string; lagDays?: number; sourceType?: string }> = Array.isArray(req.body?.dependencies)
      ? req.body.dependencies.map((dependency: any) => ({ ...dependency, sourceType: 'manual' }))
      : []
    const projectId = getAuthorizedRequestProjectId(req)
    if (!projectId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Project edit scope is required' },
        timestamp: now(),
      } as ApiResponse)
    }

    try {
      const result = await replaceTaskDependencies(taskId, deps, {
        projectId,
        preserveCurrentTaskFacts: false,
      })
      res.json({ success: true, data: result, timestamp: now() } as ApiResponse<TaskDependency[]>)
    } catch (error: any) {
      const statusCode = Number(error?.statusCode ?? 500)
      return res.status(statusCode).json({
        success: false,
        error: {
          code: error?.code ?? 'TASK_DEPENDENCY_WRITE_FAILED',
          message: error?.message ?? 'Failed to write task dependencies',
        },
        timestamp: now(),
      } as ApiResponse)
    }
  }),
)

// DELETE /api/tasks/:taskId/dependencies/:depId
router.delete(
  '/:depId',
  requireProjectEditor(async (req) => {
    const { data } = await supabase.from('tasks').select('project_id').eq('id', req.params.taskId).maybeSingle()
    return (data as any)?.project_id ?? ''
  }),
  asyncHandler(async (req, res) => {
    const taskId = req.params.taskId
    const depId = req.params.depId
    const { data: task } = await supabase.from('tasks').select('project_id').eq('id', taskId).maybeSingle()
    const projectId = String((task as any)?.project_id ?? '').trim()
    if (!projectId) {
      return res.status(404).json({
        success: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
        timestamp: now(),
      } as ApiResponse)
    }
    // v1.4.8: deactivate instead of physical delete
    await supabase.from('task_dependencies').update({ status: 'inactive', updated_at: now() }).eq('id', depId).eq('task_id', taskId).eq('project_id', projectId)

    await evaluateTaskConstraint(taskId, { projectId, sourceEventType: 'task_dependency_deleted' })

    res.json({ success: true, timestamp: now() } as ApiResponse)
  }),
)

export default router
