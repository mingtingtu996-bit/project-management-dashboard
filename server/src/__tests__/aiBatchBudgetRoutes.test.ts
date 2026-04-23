import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  estimateDuration: vi.fn(async (input: Record<string, unknown>) => ({
    task_id: input.task_id,
    estimated_duration: 10,
  })),
  predictDuration: vi.fn(async (taskId: string) => ({
    task_id: taskId,
    predicted_duration: 9,
  })),
  predictBatchDurations: vi.fn(async (taskIds: string[]) => taskIds.map((taskId) => ({
    task_id: taskId,
    predicted_duration: 12,
  }))),
  analyzeDelayRisk: vi.fn(async (taskId: string) => ({
    task_id: taskId,
    risk_level: 'medium',
  })),
  getProjectDurationInsight: vi.fn(async (projectId: string) => ({
    project_id: projectId,
    overview: 'ok',
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
    correctDuration: vi.fn(),
    getConfidence: vi.fn(),
  })),
}))

vi.mock('../services/schedulePredictor.js', () => ({
  SchedulePredictor: vi.fn().mockImplementation(() => ({
    predictDuration: mocks.predictDuration,
    predictBatchDurations: mocks.predictBatchDurations,
    analyzeDelayRisk: mocks.analyzeDelayRisk,
    getProjectDurationInsight: mocks.getProjectDurationInsight,
  })),
}))

function buildApp(path: string, router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use(path, router)
  return app
}

describe('AI batch route request budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects oversized duration estimate batches before synchronous execution fan-out', async () => {
    const { default: router } = await import('../routes/ai-duration.js')
    const response = await request(buildApp('/api/ai', router))
      .post('/api/ai/estimate-batch')
      .send({
        project_id: 'project-1',
        task_ids: Array.from({ length: 101 }, (_, index) => `task-${index + 1}`),
      })

    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('BATCH_ASYNC_REQUIRED')
    expect(response.body.error.details).toMatchObject({
      requested_count: 101,
      max_sync_items: 100,
    })
    expect(mocks.estimateDuration).not.toHaveBeenCalled()
  })

  it('rejects oversized schedule prediction batches before synchronous execution fan-out', async () => {
    const { default: router } = await import('../routes/aiSchedule.js')
    const response = await request(buildApp('/api/ai', router))
      .post('/api/ai/predict-batch-durations')
      .send({
        task_ids: Array.from({ length: 101 }, (_, index) => `task-${index + 1}`),
      })

    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('BATCH_ASYNC_REQUIRED')
    expect(response.body.error.details).toMatchObject({
      requested_count: 101,
      max_sync_items: 100,
    })
    expect(mocks.predictBatchDurations).not.toHaveBeenCalled()
  })

  it('rejects delay risk analysis when task_id is missing', async () => {
    const { default: router } = await import('../routes/aiSchedule.js')
    const response = await request(buildApp('/api/ai', router))
      .post('/api/ai/analyze-delay-risk')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.analyzeDelayRisk).not.toHaveBeenCalled()
  })

  it('rejects project duration insight requests without project_id', async () => {
    const { default: router } = await import('../routes/aiSchedule.js')
    const response = await request(buildApp('/api/ai', router))
      .get('/api/ai/project-duration-insight')

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.getProjectDurationInsight).not.toHaveBeenCalled()
  })
})
