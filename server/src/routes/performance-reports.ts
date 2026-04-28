import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/errorHandler.js'
import { logger } from '../middleware/logger.js'
import { validate } from '../middleware/validation.js'

const router = Router()

const performanceReportBodySchema = z.object({
  source: z.enum(['navigation', 'route', 'web_vital', 'long_task', 'api']),
  name: z.string().trim().min(1).max(120),
  value: z.number().refine(Number.isFinite),
  unit: z.enum(['ms', 'score', 'count']).default('ms'),
  route: z.string().trim().max(1000).optional().nullable(),
  url: z.string().trim().max(1000).optional().nullable(),
  userAgent: z.string().trim().max(1000).optional().nullable(),
  occurredAt: z.string().trim().max(80).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough()

const SLOW_NAVIGATION_MS = Number(process.env.CLIENT_SLOW_NAVIGATION_MS ?? 2500)
const SLOW_ROUTE_SETTLED_MS = Number(process.env.CLIENT_SLOW_ROUTE_SETTLED_MS ?? 250)
const SLOW_API_MS = Number(process.env.CLIENT_SLOW_API_MS ?? 1200)
const SLOW_LCP_MS = Number(process.env.CLIENT_SLOW_LCP_MS ?? 2500)
const CLS_THRESHOLD = Number(process.env.CLIENT_CLS_THRESHOLD ?? 0.1)

function trimText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function compactMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value).slice(0, 24)) {
    const normalizedKey = key.slice(0, 80)
    if (typeof entry === 'string') {
      result[normalizedKey] = entry.slice(0, 500)
      continue
    }
    if (typeof entry === 'number' || typeof entry === 'boolean' || entry == null) {
      result[normalizedKey] = entry
      continue
    }

    try {
      result[normalizedKey] = JSON.stringify(entry).slice(0, 500)
    } catch {
      result[normalizedKey] = '[unserializable]'
    }
  }

  return result
}

function isThresholdExceeded(params: {
  source: string
  name: string
  value: number
  metadata: Record<string, unknown>
}) {
  if (params.source === 'api') {
    return params.value >= SLOW_API_MS || Number(params.metadata.statusCode ?? 200) >= 400 || Boolean(params.metadata.errorCode)
  }
  if (params.source === 'navigation') return params.value >= SLOW_NAVIGATION_MS
  if (params.source === 'route') return params.value >= SLOW_ROUTE_SETTLED_MS
  if (params.source === 'long_task') return true
  if (params.name === 'largest_contentful_paint') return params.value >= SLOW_LCP_MS
  if (params.name === 'cumulative_layout_shift') return params.value >= CLS_THRESHOLD
  return false
}

router.post('/', validate(performanceReportBodySchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof performanceReportBodySchema>
  const metadata = compactMetadata(body.metadata)
  const context = {
    source: body.source,
    name: body.name,
    value: body.value,
    unit: body.unit,
    route: trimText(body.route, 1000),
    url: trimText(body.url, 1000),
    userAgent: trimText(body.userAgent, 1000),
    occurredAt: trimText(body.occurredAt, 80) ?? new Date().toISOString(),
    metadata,
    requestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
  }

  logger.info('Client performance evidence reported', context)

  if (isThresholdExceeded({ source: body.source, name: body.name, value: body.value, metadata })) {
    logger.warn('Client performance threshold exceeded', context)
  }

  res.status(202).json({
    success: true,
    data: {
      accepted: true,
    },
  })
}))

export default router

