// v1.4.22.1 §4.3 + §14: Company project template CRUD
import { Router } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { getCurrentCompanyMembership } from '../auth/access.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()
const now = () => new Date().toISOString()

async function requireCompanyMembership(req: any, companyId: string) {
  const userId = String(req.user?.id ?? '').trim()
  const membership = userId ? await getCurrentCompanyMembership(userId, companyId) : null
  if (membership?.companyId !== companyId) {
    throw Object.assign(new Error('You do not have permission to access project templates for this company.'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    })
  }
  return membership
}

async function requireCompanyAdmin(req: any, companyId: string) {
  const membership = await requireCompanyMembership(req, companyId)
  if (membership.role !== 'company_admin') {
    throw Object.assign(new Error('Only company administrators can mutate project templates for this company.'), {
      statusCode: 403,
      code: 'FORBIDDEN',
    })
  }
  return membership
}

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  sourceProjectId: z.string().optional(),
  businessType: z.string(),
  businessSubtype: z.string().optional(),
  methodVariantCodes: z.array(z.string()).default([]),
  projectFeatures: z.record(z.unknown()).default({}),
  scopeTreeSnapshot: z.array(z.unknown()).default([]),
  defaultDetailLevel: z.enum(['overview', 'standard', 'detailed']).default('overview'),
  snapshot: z.record(z.unknown()),
})

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  isDefault: z.boolean().optional(),
  snapshot: z.record(z.unknown()).optional(),
})

// GET /api/companies/:cid/project-templates
router.get('/api/companies/:cid/project-templates', authenticate, asyncHandler(async (req, res) => {
  const { cid } = req.params
  const ts = now()
  await requireCompanyMembership(req, cid)
  const templates = await executeSQL(
    `SELECT id, name, description, source_project_id, business_type, business_subtype,
            default_detail_level, usage_count, is_default, created_at, updated_at
     FROM company_project_templates
     WHERE company_id = $1 AND deleted_at IS NULL
     ORDER BY is_default DESC, usage_count DESC, updated_at DESC`,
    [cid],
  )
  res.json({ success: true, data: templates, timestamp: ts } as ApiResponse)
}))

// POST /api/companies/:cid/project-templates
router.post('/api/companies/:cid/project-templates', authenticate, asyncHandler(async (req, res) => {
  const { cid } = req.params
  const body = createTemplateSchema.parse(req.body)
  const userId = (req as any).user?.id ?? null
  const id = uuidv4()
  const ts = now()
  await requireCompanyAdmin(req, cid)

  await executeSQL(
    `INSERT INTO company_project_templates (id, company_id, name, description, source_project_id,
     business_type, business_subtype, method_variant_codes,
     project_features, scope_tree_snapshot, default_detail_level, snapshot,
     version_history, usage_count, is_default, created_at, created_by, updated_at, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,false,$13,$14,$15,$16)`,
    [id, cid, body.name, body.description ?? null, body.sourceProjectId ?? null,
     body.businessType, body.businessSubtype ?? null,
     JSON.stringify(body.methodVariantCodes),
     JSON.stringify(body.projectFeatures), JSON.stringify(body.scopeTreeSnapshot),
     body.defaultDetailLevel, JSON.stringify(body.snapshot), JSON.stringify([]),
     ts, userId, ts, userId],
  )

  logger.info('Company template created', { templateId: id, companyId: cid })
  res.status(201).json({ success: true, data: { id }, timestamp: ts } as ApiResponse)
}))

// PATCH /api/companies/:cid/project-templates/:tid
router.patch('/api/companies/:cid/project-templates/:tid', authenticate, asyncHandler(async (req, res) => {
  const { cid, tid } = req.params
  const body = updateTemplateSchema.parse(req.body)
  const ts = now()
  await requireCompanyAdmin(req, cid)

  const existing = await executeSQLOne(
    `SELECT snapshot, version_history FROM company_project_templates WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
    [tid, cid],
  ) as any

  if (!existing) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '模板不存在' }, timestamp: ts } as ApiResponse)
  }

  // Push current snapshot to version history (keep last 5)
  let history: unknown[] = []
  try { history = typeof existing.version_history === 'string' ? JSON.parse(existing.version_history) : (existing.version_history ?? []) } catch { history = [] }
  if (body.snapshot) {
    const currentSnapshot = typeof existing.snapshot === 'string' ? JSON.parse(existing.snapshot) : existing.snapshot
    history = [{ snapshot: currentSnapshot, archivedAt: ts }, ...history].slice(0, 5)
  }

  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (body.name !== undefined) { updates.push(`name = $${idx++}`); values.push(body.name) }
  if (body.description !== undefined) { updates.push(`description = $${idx++}`); values.push(body.description) }
  if (body.isDefault !== undefined) { updates.push(`is_default = $${idx++}`); values.push(body.isDefault) }
  if (body.snapshot !== undefined) { updates.push(`snapshot = $${idx++}`); values.push(JSON.stringify(body.snapshot)) }
  updates.push(`version_history = $${idx++}`); values.push(JSON.stringify(history))
  updates.push(`updated_at = $${idx++}`); values.push(ts)
  values.push(tid, cid)

  await executeSQL(
    `UPDATE company_project_templates SET ${updates.join(', ')} WHERE id = $${idx++} AND company_id = $${idx++}`,
    values,
  )

  res.json({ success: true, data: { id: tid, updated: true }, timestamp: ts } as ApiResponse)
}))

// DELETE /api/companies/:cid/project-templates/:tid (soft delete)
router.delete('/api/companies/:cid/project-templates/:tid', authenticate, asyncHandler(async (req, res) => {
  const { cid, tid } = req.params
  const ts = now()
  await requireCompanyAdmin(req, cid)
  await executeSQL(
    `UPDATE company_project_templates SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND company_id = $3`,
    [ts, tid, cid],
  )
  res.json({ success: true, data: { id: tid, deleted: true }, timestamp: ts } as ApiResponse)
}))

// POST /api/companies/:cid/project-templates/:tid/use — Increment usage count
router.post('/api/companies/:cid/project-templates/:tid/use', authenticate, asyncHandler(async (req, res) => {
  const { cid, tid } = req.params
  const ts = now()
  await requireCompanyMembership(req, cid)
  const row = await executeSQLOne(
    `UPDATE company_project_templates SET usage_count = usage_count + 1, updated_at = $1
     WHERE id = $2 AND company_id = $3 AND deleted_at IS NULL
     RETURNING id, name, usage_count, snapshot`,
    [ts, tid, cid],
  ) as any

  if (!row) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '模板不存在' }, timestamp: ts } as ApiResponse)
  }

  res.json({
    success: true,
    data: {
      id: row.id,
      name: row.name,
      usageCount: row.usage_count,
      snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
    },
    timestamp: ts,
  } as ApiResponse)
}))

export default router
