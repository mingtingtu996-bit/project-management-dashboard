import { Router } from 'express'
import { z } from 'zod'

import { logger } from '../middleware/logger.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { validate } from '../middleware/validation.js'

const router = Router()

const clientErrorBodySchema = z.object({
  source: z.string().trim().optional(),
  message: z.string().trim().min(1),
  stack: z.string().optional().nullable(),
  componentStack: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  happenedAt: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough()

router.post('/', validate(clientErrorBodySchema), asyncHandler(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const source = typeof body.source === 'string' ? body.source : 'unknown'
  const message = typeof body.message === 'string' ? body.message.slice(0, 1000) : 'Unknown client runtime error'
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 6000) : undefined
  const componentStack = typeof body.componentStack === 'string' ? body.componentStack.slice(0, 6000) : undefined
  const url = typeof body.url === 'string' ? body.url.slice(0, 1000) : undefined
  const userAgent = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 1000) : undefined
  const happenedAt = typeof body.happenedAt === 'string' ? body.happenedAt : new Date().toISOString()
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {}

  logger.error('Client runtime error reported', {
    source,
    message,
    stack,
    componentStack,
    url,
    userAgent,
    happenedAt,
    metadata,
  })

  res.status(202).json({
    success: true,
    data: {
      accepted: true,
    },
  })
}))

export default router
