import { Router } from 'express'

import { authenticate, requireProjectOwner } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

router.use(authenticate)

// v1.4.14: change-logs API restricted to owner/admin for backend review only
// Safe fields only — no governance/internal fields returned to any consumer
const CHANGE_LOG_SAFE_FIELDS = [
  'id', 'project_id', 'entity_type', 'entity_id',
  'field_name', 'old_value', 'new_value',
  'change_reason', 'changed_by', 'changed_at',
]

router.get('/', requireProjectOwner((req) => String(req.query.projectId ?? '').trim()), asyncHandler(async (req, res) => {
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

  logger.info('Fetching change logs (owner/admin review)', { projectId, entityType: entityType || null, limit })

  let query = supabase
    .from('change_logs')
    .select(CHANGE_LOG_SAFE_FIELDS.join(','))
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

  // v1.4.14: strip governance fields from response
  const safeRows = (data ?? []).map((row: any) => {
    const safe: Record<string, unknown> = {}
    for (const field of CHANGE_LOG_SAFE_FIELDS) {
      if (row[field] !== undefined) safe[field] = row[field]
    }
    return safe
  })

  const response: ApiResponse<any[]> = {
    success: true,
    data: safeRows,
    timestamp: new Date().toISOString(),
  }
  return res.json(response)
}))

export default router
