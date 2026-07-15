import { Router } from 'express'
import { authenticate, requireProjectMember } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validateIdParam } from '../middleware/validation.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { supabase } from '../services/dbService.js'

const router = Router()
const WEEKLY_DIGEST_CACHE_TTL_MS = Number(process.env.WEEKLY_DIGEST_CACHE_TTL_MS ?? 300_000)
const latestDigestCache = new Map<string, { expiresAt: number; promise: Promise<Record<string, unknown> | null> }>()

router.use(authenticate)

function normalizeDigestRow(row: Record<string, unknown> | null | undefined) {
  if (!row) return null
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  )
}

async function fetchLatestDigest(projectId: string) {
  try {
    const { rows } = await rawQuery(
      `
        SELECT *
        FROM public.weekly_digests
        WHERE project_id::text = $1
        ORDER BY week_start DESC NULLS LAST, generated_at DESC NULLS LAST
        LIMIT 1
      `,
      [projectId],
    )
    return normalizeDigestRow(rows[0] as Record<string, unknown> | undefined)
  } catch (error) {
    logger.warn('Direct weekly digest query failed, falling back to Supabase REST', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })

    const { data, error: fallbackError } = await supabase
      .from('weekly_digests')
      .select('*')
      .eq('project_id', projectId)
      .order('week_start', { ascending: false })
      .limit(1)
      .single()

    if (fallbackError && fallbackError.code !== 'PGRST116') {
      throw new Error(fallbackError.message)
    }

    return data ?? null
  }
}

function getLatestDigest(projectId: string) {
  const cached = latestDigestCache.get(projectId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise
  }

  const promise = fetchLatestDigest(projectId)
  latestDigestCache.set(projectId, {
    expiresAt: Date.now() + WEEKLY_DIGEST_CACHE_TTL_MS,
    promise,
  })

  promise.catch(() => {
    const current = latestDigestCache.get(projectId)
    if (current?.promise === promise) {
      latestDigestCache.delete(projectId)
    }
  })

  return promise
}

export async function warmWeeklyDigestCache(projectId: string) {
  return getLatestDigest(projectId)
}

// GET /api/projects/:id/weekly-digest/latest
router.get('/:id/weekly-digest/latest', validateIdParam, requireProjectMember((req) => req.params.id), asyncHandler(async (req, res) => {
  const { id: projectId } = req.params
  const data = await getLatestDigest(projectId)
  res.json({ success: true, data })
}))

export default router
