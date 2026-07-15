import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  buildProjectSummary: vi.fn(),
  syncProjectDataQuality: vi.fn(),
  getProjectSettings: vi.fn(),
  updateProjectSettings: vi.fn(),
  previewTaskLiveCheck: vi.fn(),
  supabaseFrom: vi.fn(),
  evaluateV14AssetAdmissionAutomationForTypes: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
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

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
}))

vi.mock('../services/v14AssetAdmissionAutomationService.js', () => ({
  evaluateV14AssetAdmissionAutomationForTypes: mocks.evaluateV14AssetAdmissionAutomationForTypes,
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
    mocks.supabaseFrom.mockReset()
    const taskQuery: any = {
      select: vi.fn(() => taskQuery),
      eq: vi.fn(() => taskQuery),
      maybeSingle: vi.fn(async () => ({ data: { id: 'task-1' }, error: null })),
    }
    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === 'tasks') return taskQuery
      return undefined
    })
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
    mocks.evaluateV14AssetAdmissionAutomationForTypes.mockReturnValue({
      status: 'pass',
      summary: {
        totalDiscoveredCount: 6,
        registeredCount: 6,
        autoDiscoveredCount: 0,
        reviewRequiredCount: 0,
        blockerCount: 0,
        handRegistrationMissingCount: 0,
        dataAdmissionAssetCount: 6,
        metricAdmissionAssetCount: 0,
        ruleSeedAssetCount: 0,
      },
      blockers: [],
      reviewItems: [],
      assets: [
        {
          assetKey: 'dataQualityRuleRegistry',
          assetType: 'data_admission_asset',
          sourcePath: 'server/src/services/dataQualityRuleRegistry.ts',
        },
        {
          assetKey: 'dataLineageService',
          assetType: 'data_admission_asset',
          sourcePath: 'server/src/services/dataLineageService.ts',
        },
      ],
      boundaryPolicy: ['auto_discovery_is_the_default_for_new_v14_assets'],
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

  it('serves data admission automation diagnostics without requiring manual registration first', async () => {
    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router)).get('/api/data-quality/admission-automation')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.evaluateV14AssetAdmissionAutomationForTypes).toHaveBeenCalledWith(['data_admission_asset'])
    expect(response.body.data.summary.handRegistrationMissingCount).toBe(0)
    expect(response.body.data.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetKey: 'dataQualityRuleRegistry', assetType: 'data_admission_asset' }),
      expect.objectContaining({ assetKey: 'dataLineageService', assetType: 'data_admission_asset' }),
    ]))
  })

  it('returns a degraded project summary when backend reads are temporarily unavailable', async () => {
    mocks.buildProjectSummary.mockRejectedValueOnce(
      new Error('Error: Query read timeout at C:\\Users\\jjj64\\WorkBuddy\\server\\database.ts:120:17'),
    )

    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .get('/api/data-quality/project-summary')
      .query({ projectId: 'project-1', month: '2026-05' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      projectId: 'project-1',
      month: '2026-05',
      confidence: {
        score: 0,
        flag: 'low',
      },
      prompt: {
        count: 0,
        items: [],
      },
      findings: [],
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

  it('rejects live-check when the task is outside the project', async () => {
    const taskQuery: any = {
      select: vi.fn(() => taskQuery),
      eq: vi.fn(() => taskQuery),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    }
    mocks.supabaseFrom.mockReturnValueOnce(taskQuery)

    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .post('/api/data-quality/live-check')
      .send({
        projectId: 'project-1',
        taskId: 'task-other',
        draft: { title: '跨项目任务', progress: 10 },
      })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('TASK_PROJECT_MISMATCH')
    expect(mocks.previewTaskLiveCheck).not.toHaveBeenCalled()
  })

  it('recomputes the persisted project data-quality snapshot explicitly', async () => {
    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .post('/api/data-quality/recompute-snapshot')
      .send({ projectId: 'project-1', month: '2026-04' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(mocks.syncProjectDataQuality).toHaveBeenCalledWith('project-1', '2026-04')
  })

  it('resolves active findings when their source entity is deleted', async () => {
    const query: any = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      select: vi.fn(async () => ({
        data: [{ id: 'finding-1', entity_type: 'task', entity_id: 'task-1', resolved_type: 'source_deleted' }],
        error: null,
      })),
    }
    mocks.supabaseFrom.mockReturnValue(query)

    const { default: router } = await import('../routes/data-quality.js')
    const response = await request(buildApp(router))
      .post('/api/data-quality/resolve-source-deleted')
      .send({ projectId: 'project-1', entityType: 'task', entityId: 'task-1' })

    expect(response.status).toBe(200)
    expect(response.body.data.resolvedCount).toBe(1)
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('data_quality_findings')
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'resolved',
      resolved_type: 'source_deleted',
    }))
    expect(query.eq).toHaveBeenCalledWith('entity_type', 'task')
    expect(query.eq).toHaveBeenCalledWith('entity_id', 'task-1')
  })
})
