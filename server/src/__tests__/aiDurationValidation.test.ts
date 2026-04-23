import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  estimateDuration: vi.fn(async (input: Record<string, unknown>) => ({
    task_id: input.task_id,
    estimated_duration: 12,
  })),
  correctDuration: vi.fn(async (input: Record<string, unknown>) => ({
    task_id: input.task_id,
    estimated_duration: input.corrected_duration,
  })),
  getConfidence: vi.fn(async (taskId: string) => ({
    task_id: taskId,
    confidence_level: 0.8,
    confidence_score: 80,
    estimated_duration: 9,
    factors: {},
  })),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/aiDurationService.js', () => ({
  AIDurationService: vi.fn().mockImplementation(() => ({
    estimateDuration: mocks.estimateDuration,
    correctDuration: mocks.correctDuration,
    getConfidence: mocks.getConfidence,
  })),
}))

const { default: aiDurationRouter } = await import('../routes/ai-duration.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/ai', aiDurationRouter)
  return app
}

describe('ai duration route validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects estimate requests missing project_id', async () => {
    const response = await request(buildApp())
      .post('/api/ai/estimate-duration')
      .send({
        task_id: 'task-1',
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(mocks.estimateDuration).not.toHaveBeenCalled()
  })

  it('rejects correction requests with non-positive duration', async () => {
    const response = await request(buildApp())
      .post('/api/ai/correct-duration')
      .send({
        task_id: 'task-1',
        corrected_duration: 0,
      })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error?.code).toBe('VALIDATION_ERROR')
    expect(mocks.correctDuration).not.toHaveBeenCalled()
  })
})
