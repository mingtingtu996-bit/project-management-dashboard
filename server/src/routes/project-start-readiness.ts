import { Router } from 'express'
import { z } from 'zod'

import { getRequestCompanyId } from '../auth/companyContext.js'
import {
  authenticate,
  getAuthorizedRequestProjectId,
  requireProjectMember,
} from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'
import {
  getProjectStartReadiness,
  ProjectStartReadinessScopeError,
} from '../services/projectStartReadinessService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

const projectIdParamSchema = z.object({
  projectId: z.string().trim().min(1),
})

const calendarDateQuerySchema = z.string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, { message: 'Must be a valid calendar date' })

export const startReadinessQuerySchema = z.object({
  asOfDate: calendarDateQuerySchema.optional(),
  as_of_date: calendarDateQuerySchema.optional(),
}).passthrough()

router.get(
  '/:projectId/start-readiness',
  validate(projectIdParamSchema, 'params'),
  validate(startReadinessQuerySchema, 'query'),
  requireProjectMember((req) => req.params.projectId),
  asyncHandler(async (req, res) => {
    const projectId = String(req.params.projectId ?? '').trim()
    if (!getAuthorizedRequestProjectId(req, projectId)) {
      return res.status(403).json({
        success: false,
        error: { code: 'PROJECT_SCOPE_FORBIDDEN', message: 'Project scope is not authorized' },
        timestamp: new Date().toISOString(),
      })
    }

    try {
      const result = await getProjectStartReadiness({
        projectId,
        companyId: getRequestCompanyId(req) ?? req.user?.currentCompanyId ?? null,
        asOfDate: String(req.query.asOfDate ?? req.query.as_of_date ?? '').trim() || null,
      })
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      }
      return res.json(response)
    } catch (error) {
      if (error instanceof ProjectStartReadinessScopeError) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROJECT_NOT_FOUND', message: 'Project is not available in the authorized scope' },
          timestamp: new Date().toISOString(),
        })
      }
      throw error
    }
  }),
)

export default router
