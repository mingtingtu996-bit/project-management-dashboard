import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allowedProjectId: '00000000-0000-4000-8000-000000000001',
  projectSequence: 1,
  authorizedProjectIds: [] as string[],
  buildRuntimeScopedDurationForecast: vi.fn(),
}))

vi.mock('../services/scopedDurationForecastRuntimeService.js', () => ({
  buildRuntimeScopedDurationForecast: mocks.buildRuntimeScopedDurationForecast,
  isValidScopedDurationForecastDate: (value: unknown) => {
    const text = String(value ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
    const parsed = new Date(`${text}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'member-1' }
    next()
  }),
  getAuthorizedRequestProjectId: vi.fn((req: any) => req.params.id ?? req.params.projectId),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn((resolveProjectId: (req: any) => string | undefined) => {
    return (req: any, res: any, next: () => void) => {
      const projectId = resolveProjectId(req)
      mocks.authorizedProjectIds.push(String(projectId ?? ''))
      if (projectId !== mocks.allowedProjectId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'project membership required' },
        })
      }
      next()
    }
  }),
}))

import taskSummariesRouter from '../routes/task-summaries.js'

function response(projectId = '00000000-0000-4000-8000-000000000001', asOfDate = '2026-07-13') {
  return {
    projectId,
    asOfDate,
    dimensions: { division: [], subdivision: [], specialty: [] },
    summary: { groupCount: 0, readyCount: 0, degradedCount: 0, insufficientDataCount: 0 },
  }
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/task-summaries', taskSummariesRouter)
  return app
}

describe('task scoped duration forecast route', () => {
  beforeEach(() => {
    mocks.projectSequence += 1
    mocks.allowedProjectId = `00000000-0000-4000-8000-${String(mocks.projectSequence).padStart(12, '0')}`
    mocks.authorizedProjectIds.length = 0
    mocks.buildRuntimeScopedDurationForecast.mockReset()
    mocks.buildRuntimeScopedDurationForecast.mockImplementation(async (projectId: string, options: any) => {
      return response(projectId, options.asOfDate ?? '2026-07-13')
    })
  })

  it('authorizes the route project, validates as-of date, and caches the read response by project/date', async () => {
    const path = `/api/task-summaries/projects/${mocks.allowedProjectId}/duration-forecasts?as_of_date=2026-07-13`

    const first = await supertest(buildApp()).get(path)
    const second = await supertest(buildApp()).get(path)

    expect(first.status).toBe(200)
    expect(first.body).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ projectId: mocks.allowedProjectId, asOfDate: '2026-07-13' }),
    }))
    expect(second.status).toBe(200)
    expect(mocks.authorizedProjectIds).toEqual([mocks.allowedProjectId, mocks.allowedProjectId])
    expect(mocks.buildRuntimeScopedDurationForecast).toHaveBeenCalledTimes(1)
    expect(mocks.buildRuntimeScopedDurationForecast).toHaveBeenCalledWith(
      mocks.allowedProjectId,
      { asOfDate: '2026-07-13' },
    )
  })

  it('returns 400 for an invalid as-of date before reading forecast data', async () => {
    const result = await supertest(buildApp())
      .get(`/api/task-summaries/projects/${mocks.allowedProjectId}/duration-forecasts?as_of_date=07%2F13%2F2026`)

    expect(result.status).toBe(400)
    expect(mocks.buildRuntimeScopedDurationForecast).not.toHaveBeenCalled()
  })

  it('rejects a different project before reading any project data', async () => {
    const result = await supertest(buildApp())
      .get('/api/task-summaries/projects/00000000-0000-4000-8000-999999999999/duration-forecasts')

    expect(result.status).toBe(403)
    expect(mocks.authorizedProjectIds).toEqual(['00000000-0000-4000-8000-999999999999'])
    expect(mocks.buildRuntimeScopedDurationForecast).not.toHaveBeenCalled()
  })
})
