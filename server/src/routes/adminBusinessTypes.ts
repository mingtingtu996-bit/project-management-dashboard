// v1.4.22.1 §10.8 + §14: Admin endpoints for custom business types + system example projects
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { getCurrentCompanyMembership } from '../auth/access.js'
import { getRequestCompanyId } from '../auth/companyContext.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import { logger } from '../middleware/logger.js'
import type { ApiResponse } from '../types/index.js'
import { query as rawQuery } from '../database.js'

const router = Router()
const now = () => new Date().toISOString()

function readProjectMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) }
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {}
    } catch {
      return {}
    }
  }

  return {}
}

async function requireCurrentCompanyAdmin(req: any, res: any): Promise<string | null> {
  const membership = req.user?.id
    ? await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
    : null
  if (membership?.companyId && membership.role === 'company_admin') return membership.companyId

  res.status(403).json({
    success: false,
    error: { code: 'FORBIDDEN', message: 'Only company administrators can access business type administration.' },
    timestamp: now(),
  } as ApiResponse)
  return null
}

// GET /api/admin/custom-business-types — Aggregate custom business types within current company.
router.get('/api/admin/custom-business-types', authenticate, asyncHandler(async (req, res) => {
  const ts = now()
  const companyId = await requireCurrentCompanyAdmin(req, res)
  if (!companyId) return
  const result = await rawQuery(
    `SELECT metadata->>'custom_business_name' as name,
            metadata->>'parent_business_type' as parent_type,
            COUNT(*)::int as usage_count
     FROM projects
     WHERE company_id = $1
       AND metadata->>'custom_business_type' = 'true'
       AND deleted_at IS NULL
     GROUP BY metadata->>'custom_business_name', metadata->>'parent_business_type'
     ORDER BY usage_count DESC, name ASC`,
    [companyId],
  )
  const rows = (result.rows ?? []).map((row: any) => ({
    name: row.name ?? null,
    parent_type: row.parent_type ?? null,
    usage_count: Number(row.usage_count ?? 0),
  }))
  res.json({ success: true, data: rows, timestamp: ts } as ApiResponse)
}))

// POST /api/admin/custom-business-types/:slug/promote — Promote to formal candidate
router.post('/api/admin/custom-business-types/:slug/promote', authenticate, asyncHandler(async (req, res) => {
  const companyId = await requireCurrentCompanyAdmin(req, res)
  if (!companyId) return
  const { slug } = req.params
  const body = z.object({ formalCode: z.string().min(1), label: z.string().min(1) }).parse(req.body)
  const ts = now()
  const userId = (req as any).user?.id ?? null

  logger.info('Custom business type promoted', { slug, formalCode: body.formalCode, userId, companyId })

  res.json({
    success: true,
    data: { slug, companyId, formalCode: body.formalCode, label: body.label, status: 'promoted_candidate', auditRef: `admin_promote_${slug}_${ts}` },
    timestamp: ts,
  } as ApiResponse)
}))

// route-auth-public-approved: system examples are public onboarding catalog data.
// workspace-isolation-global-read-approved: only reads projects explicitly flagged metadata.is_system_example=true for public demo catalog.
// GET /api/system/example-projects
router.get('/api/system/example-projects', asyncHandler(async (req, res) => {
  const ts = now()
  const result = await rawQuery(
    `SELECT id, name, metadata->>'business_type' as business_type,
            total_area, location,
            metadata->>'description' as description
     FROM projects
     WHERE metadata->>'is_system_example' = $1 AND deleted_at IS NULL
     ORDER BY metadata->>'sort_order' ASC, name ASC
     LIMIT $2`,
    ['true', 20],
  )
  const rows = (result.rows ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    business_type: row.business_type ?? null,
    total_area: row.total_area ?? null,
    location: row.location ?? null,
    description: row.description ?? null,
  }))
  res.json({ success: true, data: rows, timestamp: ts } as ApiResponse)
}))

// POST /api/admin/system/example-projects
router.post('/api/admin/system/example-projects', authenticate, asyncHandler(async (req, res) => {
  const companyId = await requireCurrentCompanyAdmin(req, res)
  if (!companyId) return
  const body = z.object({
    projectId: z.string().min(1),
    description: z.string().optional(),
    sortOrder: z.number().int().default(0),
  }).parse(req.body)
  const ts = now()
  const project = await executeSQLOne<{ id: string; company_id?: string | null; metadata?: unknown }>(
    'SELECT id, company_id, metadata FROM projects WHERE id = ? AND company_id = ? LIMIT 1',
    [body.projectId, companyId],
  )

  if (!project) {
    res.status(404).json({
      success: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
      timestamp: ts,
    } as ApiResponse)
    return
  }

  const metadata = {
    ...readProjectMetadata(project.metadata),
    is_system_example: true,
    ...(body.description !== undefined ? { description: body.description } : {}),
    sort_order: body.sortOrder,
  }

  await executeSQL(
    'UPDATE projects SET metadata = ?, updated_at = ? WHERE id = ? AND company_id = ?',
    [JSON.stringify(metadata), ts, body.projectId, companyId],
  )

  logger.info('System example project set', { projectId: body.projectId, companyId })
  res.json({ success: true, data: { projectId: body.projectId, isSystemExample: true }, timestamp: ts } as ApiResponse)
}))

export default router
