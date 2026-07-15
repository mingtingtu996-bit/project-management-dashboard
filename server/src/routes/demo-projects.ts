// v1.4.20: Demo projects API — read-only preview namespace
import { Router } from 'express'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { supabase } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

// workspace-isolation-global-read-approved: demo_projects is a system_seed read-only preview catalog, not tenant workspace data.
router.get('/', asyncHandler(async (req, res) => {
  const { data, error } = await (supabase as any)
    .from('demo_projects')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error

  res.json({
    success: true,
    data: data ?? [],
    timestamp: new Date().toISOString(),
  } satisfies ApiResponse)
}))

export default router
