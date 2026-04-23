// Risks API 路由

import { Router } from 'express'
import { SupabaseService } from '../services/supabaseService.js'
import { confirmRiskPendingManualClose, keepRiskProcessing } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate, validateIdParam, riskSchema, riskUpdateSchema } from '../middleware/validation.js'
import { authenticate, requireProjectEditor, requireProjectMember } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { isProtectedRisk } from '../services/upgradeChainService.js'
import type { ApiResponse } from '../types/index.js'
import type { Risk } from '../types/db.js'
import { getVisibleProjectIds } from '../auth/access.js'

const router = Router()
const supabase = new SupabaseService()

function parseExpectedVersion(input: unknown) {
  if (input === undefined || input === null || input === '') return undefined
  const version = Number(input)
  return Number.isInteger(version) && version > 0 ? version : null
}

router.use(authenticate)

function buildUpgradeChainProtectedResponse(risk: Risk): ApiResponse {
  return {
    success: false,
    error: {
      code: 'UPGRADE_CHAIN_PROTECTED',
      message: 'This record is linked to an upgrade chain. Close it instead of deleting it.',
      details: {
        entity_type: 'risk',
        entity_id: risk.id,
        source_type: risk.source_type ?? null,
        source_id: risk.source_id ?? null,
        chain_id: risk.chain_id ?? null,
        linked_issue_id: risk.linked_issue_id ?? null,
        closed_reason: risk.closed_reason ?? null,
        closed_at: risk.closed_at ?? null,
      },
    },
    timestamp: new Date().toISOString(),
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId as string | undefined
  logger.info('Fetching risks', { projectId })

  let risks = await supabase.getRisks(projectId)

  if (!projectId && req.user?.id) {
    const visibleProjectIds = await getVisibleProjectIds(req.user.id, req.user.globalRole)
    if (visibleProjectIds) {
      const visibleProjectIdSet = new Set(visibleProjectIds)
      risks = risks.filter((risk) => visibleProjectIdSet.has(risk.project_id))
    }
  }

  const response: ApiResponse<Risk[]> = {
    success: true,
    data: risks,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.get('/:id', validateIdParam, requireProjectMember(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Fetching risk', { id })

  const risk = await supabase.getRisk(id)

  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/', requireProjectEditor(req => req.body.project_id), validate(riskSchema), asyncHandler(async (req, res) => {
  logger.info('Creating risk', req.body)

  const risk = await supabase.createRisk({
    ...req.body,
    version: 1,
  })

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.status(201).json(response)
}))

router.put('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), validate(riskUpdateSchema), asyncHandler(async (req, res) => {
  const { id } = req.params
  const { version, ...updates } = req.body

  logger.info('Updating risk', { id, version })

  const risk = await supabase.updateRisk(id, updates, version)

  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/confirm-close', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }
  logger.info('Confirming risk pending manual close', { id, version })

  const risk = await confirmRiskPendingManualClose(id, version)
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.post('/:id/keep-processing', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  const version = parseExpectedVersion(req.body?.version)
  if (version === null) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' },
      timestamp: new Date().toISOString(),
    })
  }
  logger.info('Keeping risk in processing', { id, version })

  const risk = await keepRiskProcessing(id, version)
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  const response: ApiResponse<Risk> = {
    success: true,
    data: risk,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

router.delete('/:id', validateIdParam, requireProjectEditor(async (req) => {
  const risk = await supabase.getRisk(req.params.id)
  return risk?.project_id
}), asyncHandler(async (req, res) => {
  const { id } = req.params
  logger.info('Deleting risk', { id })

  const risk = await supabase.getRisk(id)
  if (!risk) {
    const response: ApiResponse = {
      success: false,
      error: { code: 'RISK_NOT_FOUND', message: 'Risk not found' },
      timestamp: new Date().toISOString(),
    }
    return res.status(404).json(response)
  }

  if (isProtectedRisk(risk)) {
    return res.status(422).json(buildUpgradeChainProtectedResponse(risk))
  }

  await supabase.deleteRisk(id)

  const response: ApiResponse = {
    success: true,
    timestamp: new Date().toISOString(),
  }
  res.json(response)
}))

export default router
