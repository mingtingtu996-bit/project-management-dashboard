import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadTaskStructuredCauseEvidence: vi.fn(),
  persistStructuredCauseCandidates: vi.fn(),
  listStructuredCauseAttributions: vi.fn(),
  getStructuredCauseAttributionQualityMetrics: vi.fn(),
  confirmStructuredCauseAttribution: vi.fn(),
  recordUserConfirmedStructuredCauseAttribution: vi.fn(),
  rejectStructuredCauseAttribution: vi.fn(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1' }
    next()
  },
  requireProjectEditor: () => (_req: any, _res: any, next: any) => next(),
  requireProjectMember: () => (_req: any, _res: any, next: any) => next(),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: () => 'company-1',
}))

vi.mock('../services/structuredCauseAttributionService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/structuredCauseAttributionService.js')>()
  return {
    ...actual,
    loadTaskStructuredCauseEvidence: mocks.loadTaskStructuredCauseEvidence,
    persistStructuredCauseCandidates: mocks.persistStructuredCauseCandidates,
    listStructuredCauseAttributions: mocks.listStructuredCauseAttributions,
    getStructuredCauseAttributionQualityMetrics: mocks.getStructuredCauseAttributionQualityMetrics,
    confirmStructuredCauseAttribution: mocks.confirmStructuredCauseAttribution,
    recordUserConfirmedStructuredCauseAttribution: mocks.recordUserConfirmedStructuredCauseAttribution,
    rejectStructuredCauseAttribution: mocks.rejectStructuredCauseAttribution,
  }
})

import causeAttributionRoutes from '../routes/cause-attributions.js'
import { STRUCTURED_CAUSE_TAXONOMY, STRUCTURED_CAUSE_TAXONOMY_VERSION } from '../services/structuredCauseAttributionService.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/cause-attributions', causeAttributionRoutes)
  return app
}

describe('cause attribution routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadTaskStructuredCauseEvidence.mockResolvedValue([
      { sourceType: 'task_obstacle', sourceId: 'obstacle-1', attributes: { obstacleType: 'material' } },
    ])
    mocks.persistStructuredCauseCandidates.mockResolvedValue([{ id: 'cause-1', status: 'candidate' }])
    mocks.listStructuredCauseAttributions.mockResolvedValue([{ id: 'cause-1' }])
    mocks.getStructuredCauseAttributionQualityMetrics.mockResolvedValue({
      companyId: 'company-1',
      projectId: 'project-1',
      otherRate: { metricKey: 'structured_cause_other_rate', value: 10 },
      prefillModificationRate: { metricKey: 'structured_cause_prefill_modification_rate', value: 15 },
      revisionSignals: [],
    })
    mocks.confirmStructuredCauseAttribution.mockResolvedValue({ id: 'cause-1', status: 'confirmed' })
    mocks.recordUserConfirmedStructuredCauseAttribution.mockResolvedValue({ id: 'cause-user-1', status: 'confirmed' })
    mocks.rejectStructuredCauseAttribution.mockResolvedValue({ id: 'cause-1', status: 'rejected' })
  })

  it('returns the exact canonical structured-cause taxonomy authority', async () => {
    const response = await supertest(buildApp())
      .get('/api/cause-attributions/taxonomy')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({
      version: STRUCTURED_CAUSE_TAXONOMY_VERSION,
      entries: STRUCTURED_CAUSE_TAXONOMY,
    })
    expect(response.body.data.entries).toHaveLength(14)
  })

  it('infers from server-loaded facts and persists under request tenant scope', async () => {
    const response = await supertest(buildApp())
      .post('/api/cause-attributions/projects/project-1/tasks/task-1/infer')
      .send({
        eventType: 'delay',
        impactDays: 8,
        windowStart: '2026-04-01',
        windowEnd: '2026-04-20',
        rawText: '材料晚到',
        companyId: 'untrusted-client-company',
      })

    expect(response.status).toBe(201)
    expect(mocks.loadTaskStructuredCauseEvidence).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      taskId: 'task-1',
    }))
    expect(mocks.persistStructuredCauseCandidates).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'task',
      subjectId: 'task-1',
      evidence: [expect.objectContaining({ sourceId: 'obstacle-1' })],
    }))
  })

  it('exposes tenant-scoped list, confirmation, and rejection commands', async () => {
    const listResponse = await supertest(buildApp())
      .get('/api/cause-attributions/projects/project-1?subjectType=task&subjectId=task-1')
    const confirmResponse = await supertest(buildApp())
      .post('/api/cause-attributions/projects/project-1/cause-1/confirm')
      .send({
        responsibilityClass: 'contractor_attributable',
        responsibilityBasis: 'user_confirmed_contract_boundary',
      })
    const rejectResponse = await supertest(buildApp())
      .post('/api/cause-attributions/projects/project-1/cause-1/reject')
      .send({ rejectionReason: 'Evidence does not overlap the delay window' })

    expect(listResponse.status).toBe(200)
    expect(confirmResponse.status).toBe(200)
    expect(rejectResponse.status).toBe(200)
    expect(mocks.confirmStructuredCauseAttribution).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      actorId: 'user-1',
      responsibilityClass: 'contractor_attributable',
    }))
    expect(mocks.rejectStructuredCauseAttribution).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      actorId: 'user-1',
    }))
  })

  it('exposes project-scoped cause-quality metrics to project members', async () => {
    const response = await supertest(buildApp())
      .get('/api/cause-attributions/projects/project-1/quality-metrics')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
    }))
    expect(mocks.getStructuredCauseAttributionQualityMetrics).toHaveBeenCalledWith({
      companyId: 'company-1',
      projectId: 'project-1',
    })
  })

  it('creates a user-confirmed controlled cause for a project-scoped risk', async () => {
    const response = await supertest(buildApp())
      .post('/api/cause-attributions/projects/project-1/subjects/risk/risk-1/confirm')
      .send({
        causeCode: 'material_shortage',
        causeRole: 'primary',
        rawText: 'Material delivery recovered after supplier replacement.',
        responsibilityClass: 'contractor_attributable',
        responsibilityBasis: 'Confirmed by the project editor.',
        companyId: 'untrusted-client-company',
      })

    expect(response.status).toBe(201)
    expect(mocks.recordUserConfirmedStructuredCauseAttribution).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      projectId: 'project-1',
      subjectType: 'risk',
      subjectId: 'risk-1',
      eventType: 'closure',
      causeCode: 'material_shortage',
      actorId: 'user-1',
    }))
  })
})
