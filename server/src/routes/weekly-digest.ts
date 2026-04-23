import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validateIdParam } from '../middleware/validation.js'
import { supabase } from '../services/dbService.js'

const router = Router()

router.use(authenticate)

// GET /api/projects/:id/weekly-digest/latest
router.get('/:id/weekly-digest/latest', validateIdParam, asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const { data, error } = await supabase
    .from('weekly_digests')
    .select('*')
    .eq('project_id', projectId)
    .order('week_start', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message)
  }

  res.json({ success: true, data: data ?? null })
}))

export default router
