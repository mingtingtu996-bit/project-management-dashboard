import { Router } from 'express'

import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

router.get('/', asyncHandler(async (req, res) => {
  const projectId = String(req.query.projectId || '').trim()
  const entityType = String(req.query.entityType || '').trim()
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500)

  if (!projectId) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'MISSING_PROJECT_ID', message: 'projectId is required' },
      timestamp: new Date().toISOString(),
    }
    return res.status(400).json(response)
  }

  logger.info('Fetching change logs', { projectId, entityType: entityType || null, limit })

  let query = supabase
    .from('change_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (entityType) {
    query = query.eq('entity_type', entityType)
  }

  const { data, error } = await query

  if (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'CHANGE_LOG_QUERY_FAILED',
        message: 'Failed to fetch change logs',
        details: error.message,
      },
      timestamp: new Date().toISOString(),
    }
    return res.status(500).json(response)
  }

  const response: ApiResponse<any[]> = {
    success: true,
    data: data ?? [],
    timestamp: new Date().toISOString(),
  }
  return res.json(response)
}))

export default router
