import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { supabase } from '../services/dbService.js'
import {
  ensureStatusDictionaryBootstrapped,
  normalizeStatus,
  getStatusLabel,
  getVisualTone,
  getActiveDictionaryVersion,
} from '../services/statusDictionaryService.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
router.use(authenticate)

// GET /api/status-dictionary/domains
router.get('/domains', asyncHandler(async (_req, res) => {
  const { data } = await supabase.from('status_domains').select('*').order('domain_key')
  res.json({ success: true, data: data ?? [], timestamp: new Date().toISOString() } as ApiResponse)
}))

// GET /api/status-dictionary/domains/:domainKey/values
router.get('/domains/:domainKey/values', asyncHandler(async (req, res) => {
  const { data } = await supabase
    .from('status_values')
    .select('*')
    .eq('domain_key', req.params.domainKey)
    .eq('is_active', true)
    .order('sort_order')
  res.json({ success: true, data: data ?? [], timestamp: new Date().toISOString() } as ApiResponse)
}))

// GET /api/status-dictionary/domains/:domainKey/transitions
router.get('/domains/:domainKey/transitions', asyncHandler(async (req, res) => {
  const { data } = await supabase
    .from('status_transitions')
    .select('*')
    .eq('domain_key', req.params.domainKey)
    .eq('is_active', true)
  res.json({ success: true, data: data ?? [], timestamp: new Date().toISOString() } as ApiResponse)
}))

// POST /api/status-dictionary/bootstrap
router.post('/bootstrap', asyncHandler(async (_req, res) => {
  const data = await ensureStatusDictionaryBootstrapped()
  res.json({ success: true, data, timestamp: new Date().toISOString() } as ApiResponse)
}))

// POST /api/status-dictionary/normalize
router.post('/normalize', asyncHandler(async (req, res) => {
  const domainKey = String(req.body?.domainKey ?? '').trim()
  const rawStatus = req.body?.rawStatus
  if (!domainKey) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'domainKey is required' }, timestamp: new Date().toISOString() })

  const normalized = await normalizeStatus(domainKey, rawStatus)
  const label = getStatusLabel(domainKey, normalized)
  const tone = getVisualTone(domainKey, normalized)

  res.json({
    success: true,
    data: {
      domainKey,
      statusKey: normalized,
      statusLabel: label,
      visualTone: tone,
      semanticTone: tone,
      statusKind: 'lifecycle',
      dictionaryVersion: getActiveDictionaryVersion(),
    },
    timestamp: new Date().toISOString(),
  } as ApiResponse)
}))

export default router
