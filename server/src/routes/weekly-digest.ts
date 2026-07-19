import { Router } from 'express'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validateIdParam } from '../middleware/validation.js'
import {
  getLatestWeeklyDigestReadModel,
  warmLatestWeeklyDigestReadModel,
} from '../services/weeklyDigestReadModelService.js'

const router = Router()
router.use(authenticate)

export async function warmWeeklyDigestCache(projectId: string) {
  return warmLatestWeeklyDigestReadModel(projectId)
}

// GET /api/projects/:id/weekly-digest/latest
router.get('/:id/weekly-digest/latest', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const data = await getLatestWeeklyDigestReadModel(projectId)
  res.json({ success: true, data })
}))

export default router
