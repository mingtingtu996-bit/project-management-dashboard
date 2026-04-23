import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const executeSQL = vi.fn(async (_sql?: string, _params?: unknown[]) => [])
  const executeSQLOne = vi.fn(async (_sql?: string, _params?: unknown[]) => null)
  const getIssues = vi.fn(async (..._args: unknown[]) => [])
  const getRisks = vi.fn(async (..._args: unknown[]) => [])
  const createIssue = vi.fn(async (..._args: unknown[]) => null)
  const createRisk = vi.fn(async (..._args: unknown[]) => null)
  const createTask = vi.fn(async (..._args: unknown[]) => null)
  const syncAcceptanceRequirementsBySource = vi.fn(async () => [])
  const warningServiceInstance = {
    scanPreMilestoneWarnings: vi.fn(async () => []),
  }

  return {
    executeSQL,
    executeSQLOne,
    getIssues,
    getRisks,
    createIssue,
    createRisk,
    createTask,
    syncAcceptanceRequirementsBySource,
    warningServiceInstance,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (req: any, _res: any, next: any) => {
    req.user = req.user ?? { id: 'user-1' }
    next()
  }),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: state.logger,
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: vi.fn().mockImplementation(() => state.warningServiceInstance),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
  getIssues: state.getIssues,
  getRisks: state.getRisks,
  createIssue: state.createIssue,
  createRisk: state.createRisk,
  createTask: state.createTask,
}))

vi.mock('../services/acceptanceFlowService.js', () => ({
  syncAcceptanceRequirementsBySource: state.syncAcceptanceRequirementsBySource,
}))

const { default: preMilestonesRouter } = await import('../routes/pre-milestones.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/pre-milestones', preMilestonesRouter)
  app.use('/api/projects/:projectId/pre-milestones', preMilestonesRouter)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'internal error'
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    })
  })
  return app
}

describe('pre milestones detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves synthetic certificate ids to the matching persisted certificate', async () => {
    state.executeSQL.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC')) {
        return [
          {
            id: 'uuid-land',
            project_id: 'project-1',
            milestone_type: 'land_certificate',
            milestone_name: '土地证',
            status: 'preparing_documents',
            updated_at: '2026-04-16T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM pre_milestone_conditions WHERE pre_milestone_id = ?')) {
        expect(params).toEqual(['uuid-land'])
        return []
      }
      return []
    })

    const request = supertest(buildApp())
    const response = await request.get('/api/pre-milestones/certificate-land_certificate/detail?projectId=project-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.certificate).toMatchObject({
      id: 'uuid-land',
      certificate_type: 'land_certificate',
      certificate_name: '土地证',
    })
    expect(state.executeSQLOne).not.toHaveBeenCalled()
  })

  it('returns a virtual placeholder detail when the selected certificate has no persisted row yet', async () => {
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC')) {
        return []
      }
      return []
    })

    const request = supertest(buildApp())
    const response = await request.get('/api/pre-milestones/certificate-land_certificate/detail?projectId=project-1')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.certificate).toMatchObject({
      id: 'certificate-land_certificate',
      certificate_type: 'land_certificate',
      certificate_name: '土地证',
    })
    expect(state.executeSQLOne).not.toHaveBeenCalled()
  })

  it('supports the project-prefixed board contract while keeping old query-based compatibility', async () => {
    state.executeSQL.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC')) {
        expect(params).toEqual(['project-1'])
        return [
          {
            id: 'uuid-land',
            project_id: 'project-1',
            milestone_type: 'land_certificate',
            milestone_name: '土地证',
            status: 'internal_review',
            updated_at: '2026-04-16T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM certificate_work_items WHERE project_id = ?')) return []
      if (sql.includes('FROM certificate_dependencies WHERE project_id = ?')) return []
      return []
    })

    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/pre-milestones/board')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.certificates[0]).toMatchObject({
      id: 'uuid-land',
      certificate_type: 'land_certificate',
    })
  })

  it('creates WBS task nodes from the fallback construction template when no default template exists', async () => {
    let createdTaskCounter = 0
    state.createTask.mockImplementation(async (task: Record<string, unknown>) => ({
      id: `task-${++createdTaskCounter}`,
      ...task,
      created_at: '2026-04-21T00:00:00.000Z',
      updated_at: '2026-04-21T00:00:00.000Z',
      version: 1,
    }))
    state.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) {
        return {
          id: 'pm-1',
          project_id: 'project-1',
          milestone_type: '施工许可证',
          milestone_name: '施工许可证',
        }
      }
      if (sql.includes('FROM projects')) {
        return {
          id: 'project-1',
          name: '测试项目',
          current_phase: 'construction',
          default_wbs_generated: false,
        }
      }
      return null
    })

    const request = supertest(buildApp())
    const response = await request.post('/api/pre-milestones/pm-1/generate-wbs').send({})

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      project_id: 'project-1',
      nodes_generated: 5,
      task_nodes_generated: 5,
    })
    expect(state.createTask).toHaveBeenCalledTimes(5)
    expect(state.createTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        project_id: 'project-1',
        title: '地基与基础',
        wbs_level: 1,
        wbs_code: 'WBS-001',
        parent_id: null,
      }),
      expect.objectContaining({ skipSnapshotWrite: true }),
    )
  })

  it('creates readable parent-child WBS task nodes when generating from a stored template', async () => {
    let createdTaskCounter = 0
    state.createTask.mockImplementation(async (task: Record<string, unknown>) => ({
      id: `task-${++createdTaskCounter}`,
      ...task,
      created_at: '2026-04-21T00:00:00.000Z',
      updated_at: '2026-04-21T00:00:00.000Z',
      version: 1,
    }))
    state.executeSQLOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) {
        return {
          id: 'pm-1',
          project_id: 'project-1',
          milestone_type: '施工许可证',
          milestone_name: '施工许可证',
        }
      }
      if (sql.includes('FROM projects')) {
        return {
          id: 'project-1',
          name: '测试项目',
          current_phase: 'construction',
          default_wbs_generated: false,
        }
      }
      if (sql.includes('FROM wbs_templates')) {
        return {
          template_name: '默认施工模板',
          wbs_nodes: [
            { node_name: '主体结构', level: 1, sort_order: 1, wbs_code: '1', wbs_path: '1' },
            { node_name: '结构施工', level: 2, sort_order: 2, wbs_code: '1.1', wbs_path: '1.1' },
          ],
        }
      }
      return null
    })

    const request = supertest(buildApp())
    const response = await request.post('/api/pre-milestones/pm-1/generate-wbs').send({})

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      project_id: 'project-1',
      nodes_generated: 2,
      task_nodes_generated: 2,
      template_name: '默认施工模板',
    })
    expect(state.createTask).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        project_id: 'project-1',
        title: '主体结构',
        wbs_level: 1,
        wbs_code: '1',
        parent_id: null,
      }),
      expect.objectContaining({ skipSnapshotWrite: true }),
    )
    expect(state.createTask).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        project_id: 'project-1',
        title: '结构施工',
        wbs_level: 2,
        wbs_code: '1.1',
        parent_id: 'task-1',
      }),
      expect.objectContaining({ skipSnapshotWrite: true }),
    )
  })

  it('normalizes legacy document_no fields to certificate_no on direct reads', async () => {
    state.executeSQLOne.mockResolvedValue({
      id: 'uuid-land',
      project_id: 'project-1',
      milestone_type: '土地证',
      milestone_name: '土地证',
      status: '已取得',
      document_no: 'CERT-001',
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request.get('/api/pre-milestones/uuid-land')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'uuid-land',
      certificate_no: 'CERT-001',
    })
    expect(response.body.data.document_no).toBeUndefined()
  })

  it('accepts certificate_no on writes while keeping certificate_no as the only persisted truth', async () => {
    state.executeSQLOne
      .mockResolvedValueOnce({
        id: 'uuid-land',
        project_id: 'project-1',
        milestone_type: '土地证',
        milestone_name: '土地证',
        status: '办理中',
        document_no: null,
        issue_date: null,
        created_at: '2026-04-16T00:00:00.000Z',
        updated_at: '2026-04-16T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'uuid-land',
        project_id: 'project-1',
        milestone_type: '土地证',
        milestone_name: '土地证',
        status: '已取得',
        document_no: 'CERT-002',
        issue_date: '2026-04-16',
        created_at: '2026-04-16T00:00:00.000Z',
        updated_at: '2026-04-16T01:00:00.000Z',
      })

    const request = supertest(buildApp())
    const response = await request
      .put('/api/pre-milestones/uuid-land')
      .send({
        status: '已取得',
        certificate_no: 'CERT-002',
        issue_date: '2026-04-16',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'uuid-land',
      certificate_no: 'CERT-002',
    })
    expect(response.body.data.document_no).toBeUndefined()
    const [updateSql, updateParams] = state.executeSQL.mock.calls[0] ?? []
    expect(String(updateSql)).toContain('UPDATE pre_milestones SET')
    expect(String(updateSql)).toContain('certificate_no = ?')
    expect(String(updateSql)).not.toContain('document_no = ?')
    expect(updateParams).toEqual(expect.arrayContaining(['CERT-002']))
  })

  it('rejects legacy document_no write aliases after contract cleanup', async () => {
    const request = supertest(buildApp())
    const createResponse = await request
      .post('/api/pre-milestones')
      .send({
        project_id: 'project-1',
        certificate_type: 'construction_permit',
        certificate_name: '施工许可证',
        status: 'preparing_documents',
        document_no: 'CP-LEGACY-001',
      })

    expect(createResponse.status).toBe(400)
    expect(createResponse.body.error.code).toBe('VALIDATION_ERROR')
    expect(String(createResponse.body.error.message)).toContain('certificate_no')

    const updateResponse = await request
      .put('/api/pre-milestones/uuid-land')
      .send({ document_no: 'CP-LEGACY-002' })

    expect(updateResponse.status).toBe(400)
    expect(updateResponse.body.error.code).toBe('VALIDATION_ERROR')
    expect(String(updateResponse.body.error.message)).toContain('certificate_no')
  })

  it('accepts the official certificate status set and physical fields on create', async () => {
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'uuid-construction',
      project_id: 'project-1',
      milestone_type: 'construction_permit',
      milestone_name: '施工许可证',
      certificate_type: 'construction_permit',
      certificate_name: '施工许可证',
      status: 'preparing_documents',
      current_stage: '资料准备',
      certificate_no: 'CP-001',
      document_no: 'CP-001',
      planned_finish_date: '2026-05-01',
      actual_finish_date: null,
      approving_authority: '住建局',
      latest_record_at: '2026-04-16T00:00:00.000Z',
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request
      .post('/api/pre-milestones')
      .send({
        project_id: 'project-1',
        certificate_type: 'construction_permit',
        certificate_name: '施工许可证',
        status: 'preparing_documents',
        current_stage: '资料准备',
        certificate_no: 'CP-001',
        planned_finish_date: '2026-05-01',
        approving_authority: '住建局',
      })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      certificate_type: 'construction_permit',
      status: 'preparing_documents',
      current_stage: '资料准备',
      certificate_no: 'CP-001',
      planned_finish_date: '2026-05-01',
    })
    expect(response.body.data.document_no).toBeUndefined()
    const [insertSql, insertParams] = state.executeSQL.mock.calls[0] ?? []
    expect(String(insertSql)).toContain('INSERT INTO pre_milestones')
    expect(String(insertSql)).toContain('certificate_no')
    expect(String(insertSql)).not.toContain('document_no')
    expect(insertParams).toEqual(expect.arrayContaining([
      'construction_permit',
      '施工许可证',
      'preparing_documents',
      'CP-001',
      '资料准备',
    ]))
  })

  it('rejects issued transitions without the required certificate number and issue date', async () => {
    state.executeSQLOne.mockResolvedValueOnce({
      id: 'uuid-land',
      project_id: 'project-1',
      milestone_type: 'land_certificate',
      milestone_name: '土地证',
      certificate_type: 'land_certificate',
      certificate_name: '土地证',
      status: 'approved',
      current_stage: '外部报批',
      certificate_no: null,
      document_no: null,
      issue_date: null,
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request
      .put('/api/pre-milestones/uuid-land')
      .send({
        status: 'issued',
      })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'STATUS_TRANSITION_ERROR',
      },
    })
    expect(String(response.body.error.message)).toContain('证件编号')
    expect(String(response.body.error.message)).toContain('发证日期')
  })

  it('syncs linked acceptance requirements when a certificate transitions to issued', async () => {
    state.executeSQLOne
      .mockResolvedValueOnce({
        id: 'uuid-land',
        project_id: 'project-1',
        milestone_type: 'land_certificate',
        milestone_name: '鍦熷湴璇?',
        certificate_type: 'land_certificate',
        certificate_name: '鍦熷湴璇?',
        status: 'approved',
        current_stage: '澶栭儴鎶ユ壒',
        certificate_no: 'LAND-001',
        issue_date: '2026-04-16',
        created_at: '2026-04-16T00:00:00.000Z',
        updated_at: '2026-04-16T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'uuid-land',
        project_id: 'project-1',
        milestone_type: 'land_certificate',
        milestone_name: '鍦熷湴璇?',
        certificate_type: 'land_certificate',
        certificate_name: '鍦熷湴璇?',
        status: 'issued',
        current_stage: '鎵瑰棰嗚瘉',
        certificate_no: 'LAND-001',
        issue_date: '2026-04-16',
        created_at: '2026-04-16T00:00:00.000Z',
        updated_at: '2026-04-16T00:00:00.000Z',
      })

    const request = supertest(buildApp())
    const response = await request
      .put('/api/pre-milestones/uuid-land')
      .send({
        status: 'issued',
        certificate_no: 'LAND-001',
        issue_date: '2026-04-16',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(state.syncAcceptanceRequirementsBySource).toHaveBeenCalledWith({
      projectId: 'project-1',
      sourceEntityTypes: ['pre_milestone', 'certificate'],
      sourceEntityId: 'uuid-land',
      isSatisfied: true,
    })
  })

  it('maps satisfied certificate conditions into dedicated condition_satisfied records', async () => {
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC')) {
        return [
          {
            id: 'uuid-land',
            project_id: 'project-1',
            milestone_type: 'land_certificate',
            milestone_name: '土地证',
            status: 'internal_review',
            updated_at: '2026-04-16T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM pre_milestone_conditions WHERE pre_milestone_id = ?')) {
        return [
          {
            id: 'condition-1',
            pre_milestone_id: 'uuid-land',
            condition_name: '立项批复已齐备',
            status: '已满足',
            updated_at: '2026-04-16T00:00:00.000Z',
            completed_by: 'user-1',
          },
        ]
      }
      if (sql.includes('FROM certificate_work_items WHERE project_id = ?')) return []
      if (sql.includes('FROM certificate_dependencies WHERE project_id = ?')) return []
      return []
    })

    const request = supertest(buildApp())
    const response = await request.get('/api/projects/project-1/pre-milestones/uuid-land/detail')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'condition-1',
          record_type: 'condition_satisfied',
          to_status: '已满足',
        }),
      ]),
    )
  })

  it('escalates a linked work item into the shared issues chain without creating a certificate-only sidecar chain', async () => {
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC')) {
        return [
          {
            id: 'uuid-land',
            project_id: 'project-1',
            milestone_type: 'land_certificate',
            milestone_name: '土地证',
            status: 'supplement_required',
            updated_at: '2026-04-16T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM certificate_work_items WHERE project_id = ?')) {
        return [
          {
            id: 'work-1',
            project_id: 'project-1',
            item_name: '共享资料收集',
            item_stage: '资料准备',
            status: 'internal_review',
            created_at: '2026-04-16T00:00:00.000Z',
            updated_at: '2026-04-16T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM certificate_dependencies WHERE project_id = ?')) {
        return [
          {
            id: 'dep-1',
            project_id: 'project-1',
            predecessor_type: 'certificate',
            predecessor_id: 'uuid-land',
            successor_type: 'work_item',
            successor_id: 'work-1',
            dependency_kind: 'hard',
            created_at: '2026-04-16T00:00:00.000Z',
          },
        ]
      }
      return []
    })
    state.createIssue.mockImplementation(async (payload: any) => ({
      id: 'issue-1',
      ...payload,
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    }))

    const request = supertest(buildApp())
    const response = await request
      .post('/api/pre-milestones/certificate-land_certificate/escalate-issue?projectId=project-1')
      .send({ work_item_id: 'work-1' })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(state.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        task_id: null,
        source_type: 'manual',
        source_entity_type: 'certificate_work_item',
        source_entity_id: 'work-1',
        title: '前期证照卡点问题：共享资料收集',
      }),
    )
    expect(response.body.data).toMatchObject({
      id: 'issue-1',
      source_type: 'manual',
      source_entity_type: 'certificate_work_item',
      source_entity_id: 'work-1',
    })
  })

  it('escalates a certificate card point into the shared risks chain using the certificate type as the soft-link anchor', async () => {
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones WHERE project_id = ? ORDER BY created_at ASC')) {
        return []
      }
      if (sql.includes('FROM certificate_work_items WHERE project_id = ?')) {
        return []
      }
      if (sql.includes('FROM certificate_dependencies WHERE project_id = ?')) {
        return []
      }
      return []
    })
    state.createRisk.mockImplementation(async (payload: any) => ({
      id: 'risk-1',
      ...payload,
      created_at: '2026-04-16T00:00:00.000Z',
      updated_at: '2026-04-16T00:00:00.000Z',
    }))

    const request = supertest(buildApp())
    const response = await request
      .post('/api/pre-milestones/certificate-land_use_planning_permit/escalate-risk?projectId=project-1')
      .send({})

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(state.createRisk).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: 'project-1',
        task_id: null,
        source_type: 'manual',
        source_entity_type: 'pre_milestone',
        source_entity_id: 'land_use_planning_permit',
        title: '前期证照长期卡点风险：用地规划许可证',
      }),
    )
    expect(response.body.data).toMatchObject({
      id: 'risk-1',
      source_type: 'manual',
      source_entity_type: 'pre_milestone',
      source_entity_id: 'land_use_planning_permit',
    })
  })
})
