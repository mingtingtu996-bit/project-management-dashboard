import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  analyzeDelayRisk: vi.fn(async (taskId: string): Promise<Record<string, unknown>> => ({
    task_id: taskId,
    risk_level: 'medium',
  })),
  forecastTaskDuration: vi.fn(async (taskId: string) => ({
    taskId,
    recommendedDurationDays: 10,
    conservativeDurationDays: 14,
    optimisticRemainingDays: 8,
    remainingDurationDays: 9,
    conservativeRemainingDays: 13,
    durationOutputCode: 'remaining_forecast',
    durationOutputSemanticFieldName: 'remainingForecastDays',
    remainingForecastDays: 9,
    forecastFinishDate: '2026-05-28',
    forecastDelayDays: 2,
    delayRiskIndex: 0.42,
    confidenceLevel: 'medium',
    confidenceScore: 66,
    forecastSource: 'remaining_duration_forecast',
    businessReason: 'Task progress is slower than plan.',
    dataMaturity: 'L1',
    topFactors: ['Progress is slower than plan.'],
    calculationContext: { debug: true },
    forecastSources: { unstartedOverdueRule: { debug: true } },
  })),
  forecastBatchTasks: vi.fn(async (taskIds: string[]) => taskIds.map((taskId) => ({
    taskId,
    recommendedDurationDays: 10,
    conservativeDurationDays: 14,
    remainingDurationDays: 9,
    durationOutputCode: 'remaining_forecast',
    durationOutputSemanticFieldName: 'remainingForecastDays',
    remainingForecastDays: 9,
    forecastFinishDate: '2026-05-28',
    forecastDelayDays: 2,
    confidenceLevel: 'medium',
    confidenceScore: 66,
    forecastSource: 'remaining_duration_forecast',
    businessReason: 'Task progress is slower than plan.',
    calculationContext: { debug: true },
    forecastSources: { candidates: [] },
  }))),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
  requireProjectMember: vi.fn(() => (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'regular' }
    next()
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../auth/access.js', () => ({
  getProjectPermissionLevel: vi.fn(async () => 'member'),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQLOne: vi.fn(async () => ({ project_id: 'project-1' })),
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}))

vi.mock('../services/manualDurationCorrectionService.js', () => ({
  ManualDurationCorrectionService: vi.fn().mockImplementation(() => ({
    correctDuration: vi.fn(),
  })),
}))

vi.mock('../services/taskDurationForecastService.js', () => ({
  forecastTaskDuration: mocks.forecastTaskDuration,
  forecastBatchTasks: mocks.forecastBatchTasks,
  analyzeTaskDelayRiskWithDurationForecast: mocks.analyzeDelayRisk,
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

  it('rejects oversized duration suggestion batches before synchronous execution fan-out', async () => {
    const { default: router } = await import('../routes/duration-suggestions.js')
    const response = await request(buildApp('/api/duration-suggestions', router))
      .post('/api/duration-suggestions/batch')
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
    expect(mocks.forecastBatchTasks).not.toHaveBeenCalled()
  })

  it('keeps canonical duration forecast batches behind the synchronous execution fan-out guard', async () => {
    const { default: router } = await import('../routes/duration-suggestions.js')
    const response = await request(buildApp('/api/duration-suggestions', router))
      .post('/api/duration-suggestions/current-batch')
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
    expect(mocks.forecastBatchTasks).not.toHaveBeenCalled()
  })

  it('rejects delay risk analysis when task_id is missing', async () => {
    const { default: router } = await import('../routes/duration-suggestions.js')
    const response = await request(buildApp('/api/duration-suggestions', router))
      .post('/api/duration-suggestions/delay-risk/task')
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(mocks.analyzeDelayRisk).not.toHaveBeenCalled()
  })

  it('returns governed remaining forecast fields from delay-risk nested duration forecast', async () => {
    mocks.analyzeDelayRisk.mockResolvedValueOnce({
      task_id: 'task-1',
      risk_level: 'medium',
      duration_forecast: {
        taskId: 'task-1',
        durationOutputCode: 'remaining_forecast',
        durationOutputSemanticFieldName: 'remainingForecastDays',
        remainingForecastDays: 9,
        remainingDurationDays: 99,
        optimisticRemainingDays: 88,
        conservativeRemainingDays: 111,
        calculationContext: { debug: true },
        forecastSources: { debug: true },
      },
    })

    const { default: router } = await import('../routes/duration-suggestions.js')
    const response = await request(buildApp('/api/duration-suggestions', router))
      .post('/api/duration-suggestions/delay-risk/task')
      .send({ task_id: 'task-1' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.duration_forecast).toMatchObject({
      taskId: 'task-1',
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: 9,
    })
    expect(response.body.data.duration_forecast).not.toHaveProperty('remainingDurationDays')
    expect(response.body.data.duration_forecast).not.toHaveProperty('remaining_duration_days')
    expect(response.body.data.duration_forecast).not.toHaveProperty('optimisticRemainingDays')
    expect(response.body.data.duration_forecast).not.toHaveProperty('conservativeRemainingDays')
    expect(response.body.data.duration_forecast.calculationContext).toBeUndefined()
    expect(response.body.data.duration_forecast.forecastSources).toBeUndefined()
  })

  it('returns governed remaining forecast fields from canonical task forecast route', async () => {
    const { default: router } = await import('../routes/duration-suggestions.js')
    const response = await request(buildApp('/api/duration-suggestions', router))
      .get('/api/duration-suggestions/tasks/task-1/duration-forecast')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      taskId: 'task-1',
      durationOutputCode: 'remaining_forecast',
      durationOutputSemanticFieldName: 'remainingForecastDays',
      remainingForecastDays: 9,
    })
    expect(response.body.data).not.toHaveProperty('duration_output_code')
    expect(response.body.data).not.toHaveProperty('duration_output_semantic_field_name')
    expect(response.body.data).not.toHaveProperty('remaining_forecast_days')
    expect(response.body.data).not.toHaveProperty('recommendedDurationDays')
    expect(response.body.data).not.toHaveProperty('recommended_duration_days')
    expect(response.body.data).not.toHaveProperty('remaining_days')
    expect(response.body.data).not.toHaveProperty('estimated_duration')
  })

  it('returns duration forecast business DTO without internal debug fields', async () => {
    const { default: router } = await import('../routes/duration-suggestions.js')
    const response = await request(buildApp('/api/duration-suggestions', router))
      .get('/api/duration-suggestions/tasks/task-1/duration-forecast')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      taskId: 'task-1',
      remainingForecastDays: 9,
      forecastFinishDate: '2026-05-28',
      businessReason: 'Task progress is slower than plan.',
    })
    expect(response.body.data).not.toHaveProperty('remainingDurationDays')
    expect(response.body.data).not.toHaveProperty('remaining_duration_days')
    expect(response.body.data.forecastSources).toBeUndefined()
    expect(response.body.data.forecast_sources).toBeUndefined()
    expect(response.body.data.calculationContext).toBeUndefined()
    expect(response.body.data.calculation_context).toBeUndefined()
  })
})
