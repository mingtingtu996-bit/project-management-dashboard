import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildProjectSummary: vi.fn(),
  syncProjectDataQuality: vi.fn(),
  getProjectSettings: vi.fn(),
  updateProjectSettings: vi.fn(),
  previewTaskLiveCheck: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/dataQualityService.js', () => ({
  dataQualityService: {
    buildProjectSummary: mocks.buildProjectSummary,
    syncProjectDataQuality: mocks.syncProjectDataQuality,
    getProjectSettings: mocks.getProjectSettings,
    updateProjectSettings: mocks.updateProjectSettings,
    previewTaskLiveCheck: mocks.previewTaskLiveCheck,
  },
}))

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/data-quality', router)
  return app
}

describe('data-quality routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getProjectSettings.mockResolvedValue({
      projectId: 'project-1',
      weights: {
        timeliness: 0.3,
        anomaly: 0.25,
        consistency: 0.2,
        jumpiness: 0.1,
        coverage: 0.15,
      },
      updatedAt: '2026-04-18T00:00:00.000Z',
      updatedBy: 'owner-1',
      isDefault: false,
    })
    mocks.updateProjectSettings.mockImplementation(async (projectId: string, weights: Record<string, number>, updatedBy: string) => ({
      projectId,
      weights,
      updatedAt: '2026-04-18T00:00:00.000Z',
      updatedBy,
      isDefault: false,
    }))
    mocks.buildProjectSummary.mockResolvedValue({
      projectId: 'project-1',
      month: '2026-04',
      confidence: { score: 88 },
      prompt: { count: 0, summary: '', items: [] },
      ownerDigest: { shouldNotify: false, severity: 'info', scopeLabel: null, findingCount: 0, summary: '' },
      findings: [],
    })
    mocks.syncProjectDataQuality.mockResolvedValue({
      projectId: 'project-1',
      month: '2026-04',
      confidence: { score: 88 },
      prompt: { count: 0, summary: '', items: [] },
      ownerDigest: { shouldNotify: false, severity: 'info', scopeLabel: null, findingCount: 0, summary: '' },
      findings: [],
    })
    mocks.previewTaskLiveCheck.mockResolvedValue({
      count: 1,
      summary: '当前有 1 条任务存在数据矛盾需要确认。',
      items: [
        {
          id: 'task-1',
          taskTitle: '结构施工',
          ruleCode: 'DEPENDENCY_INCONSISTENT',
          severity: 'warning',
          summary: '前置任务尚未完成，但当前任务已开始。',
          recommendation: '请先确认前置任务状态。',
        },
      ],
    })
  })

  it('returns project-level data-quality settings', async () => {
    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router)).get('/api/data-quality/settings').query({ projectId: 'project-1' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.getProjectSettings).toHaveBeenCalledWith('project-1')
    expect(response.body.data).toMatchObject({
      projectId: 'project-1',
      isDefault: false,
      weights: {
        timeliness: 0.3,
      },
    })
  })

  it('updates project-level data-quality settings for owners', async () => {
    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .put('/api/data-quality/settings')
      .send({
        projectId: 'project-1',
        weights: {
          timeliness: 0.4,
          anomaly: 0.2,
          consistency: 0.2,
          jumpiness: 0.05,
          coverage: 0.15,
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.updateProjectSettings).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ timeliness: 0.4, jumpiness: 0.05 }),
      'owner-1',
    )
  })

  it('rejects settings update when weights are missing', async () => {
    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .put('/api/data-quality/settings')
      .send({ projectId: 'project-1' })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'MISSING_WEIGHTS' },
    })
  })

  it('returns live cross-check prompts for the current task draft', async () => {
    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .post('/api/data-quality/live-check')
      .send({
        projectId: 'project-1',
        taskId: 'task-1',
        draft: {
          title: '结构施工',
          status: 'in_progress',
          progress: 35,
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.previewTaskLiveCheck).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ title: '结构施工', progress: 35 }),
      'task-1',
    )
    expect(response.body.data).toMatchObject({
      count: 1,
      items: [expect.objectContaining({ ruleCode: 'DEPENDENCY_INCONSISTENT' })],
    })
  })
})
