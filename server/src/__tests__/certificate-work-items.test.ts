import express from 'express'
import supertest from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => {
  const rpc = vi.fn()
  const workItems: Array<Record<string, any>> = []
  const dependencies: Array<Record<string, any>> = []
  const preMilestones: Array<Record<string, any>> = []

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized === 'select * from certificate_work_items where id = ? and project_id = ? limit 1') {
      return workItems.find((item) => item.id === params[0] && item.project_id === params[1]) ?? null
    }

    if (normalized === 'select * from certificate_work_items where id = ? limit 1') {
      return workItems.find((item) => item.id === params[0]) ?? null
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized === 'select * from certificate_dependencies where project_id = ? and predecessor_type = ? and successor_type = ?') {
      return dependencies.filter(
        (dependency) =>
          dependency.project_id === params[0] &&
          dependency.predecessor_type === params[1] &&
          dependency.successor_type === params[2],
      )
    }

    if (normalized === 'select * from certificate_work_items where project_id = ? order by sort_order asc') {
      return workItems
        .filter((item) => item.project_id === params[0])
        .slice()
        .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    }

    if (normalized.startsWith('select id from pre_milestones where project_id = ? and id in (')) {
      const projectId = String(params[0] ?? '')
      const ids = new Set(params.slice(1).map((value) => String(value)))
      return preMilestones.filter((row) => row.project_id === projectId && ids.has(String(row.id)))
    }

    if (normalized.startsWith('select * from certificate_work_items where project_id = ? and id in (')) {
      const ids = new Set(params.slice(1).map((value) => String(value)))
      return workItems
        .filter((item) => item.project_id === params[0] && ids.has(String(item.id)))
        .slice()
        .sort((left, right) => String(left.created_at ?? '').localeCompare(String(right.created_at ?? '')))
    }

    if (normalized.startsWith('update certificate_work_items set ') && normalized.endsWith(' where id = ? and project_id = ?')) {
      const targetId = params[params.length - 2]
      const targetProjectId = params[params.length - 1]
      const target = workItems.find((item) => item.id === targetId && item.project_id === targetProjectId)
      if (target) {
        const clauseList = normalized
          .slice('update certificate_work_items set '.length, normalized.lastIndexOf(' where id = ? and project_id = ?'))
          .split(',')
          .map((clause) => clause.trim())
        clauseList.forEach((clause, index) => {
          const [field] = clause.split('=').map((part) => part.trim())
          target[field] = params[index]
        })
      }
      return []
    }

    if (normalized === 'delete from certificate_dependencies where project_id = ? and predecessor_type = ? and successor_type = ? and successor_id = ?') {
      for (let index = dependencies.length - 1; index >= 0; index -= 1) {
        const dependency = dependencies[index]
        if (
          dependency.project_id === params[0] &&
          dependency.predecessor_type === params[1] &&
          dependency.successor_type === params[2] &&
          dependency.successor_id === params[3]
        ) {
          dependencies.splice(index, 1)
        }
      }
      return []
    }

    if (normalized === 'delete from certificate_dependencies where project_id = ? and successor_type = ? and successor_id = ?') {
      for (let index = dependencies.length - 1; index >= 0; index -= 1) {
        const dependency = dependencies[index]
        if (
          dependency.project_id === params[0] &&
          dependency.successor_type === params[1] &&
          dependency.successor_id === params[2]
        ) {
          dependencies.splice(index, 1)
        }
      }
      return []
    }

    if (normalized.startsWith('insert into certificate_dependencies')) {
      dependencies.push({
        id: params[0],
        project_id: params[1],
        predecessor_type: params[2],
        predecessor_id: params[3],
        successor_type: params[4],
        successor_id: params[5],
        dependency_kind: params[6],
        notes: params[7],
        created_at: params[8],
      })
      return []
    }

    if (normalized === 'delete from certificate_work_items where id = ? and project_id = ?') {
      const index = workItems.findIndex((item) => item.id === params[0] && item.project_id === params[1])
      if (index >= 0) workItems.splice(index, 1)
      return []
    }

    return []
  })

  return {
    rpc,
    executeSQL,
    executeSQLOne,
    workItems,
    dependencies,
    preMilestones,
    supabase: {
      rpc,
    },
  }
})

function joinedSql(calls: [unknown, ...unknown[]][]) {
  return calls.map(([sql]) => String(sql).toLowerCase()).join('\n')
}

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
  supabase: state.supabase,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async (projectId: string) => (projectId ? 'company-1' : null)),
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  enforceRetentionOrBlock: vi.fn(async () => ({ blocked: false, reason: null, result: null })),
  buildRetentionBlockedApiError: vi.fn((reason: string, result: Record<string, unknown>) => ({
    code: 'RETENTION_REJECTED',
    message: reason,
    details: result,
  })),
  buildRetentionBlockedHttpStatus: vi.fn((result: Record<string, unknown>) => (
    result.requiresUserConfirmation ? 409 : 422
  )),
}))

const { default: certificateWorkItemsRouter } = await import('../routes/certificate-work-items.js')

const serverRoot = fileURLToPath(new URL('../..', import.meta.url))

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/certificate-work-items', certificateWorkItemsRouter)
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'internal error'
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    })
  })
  return app
}

describe('certificate work items route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.workItems.splice(0, state.workItems.length)
    state.dependencies.splice(0, state.dependencies.length)
    state.preMilestones.splice(0, state.preMilestones.length)
    state.preMilestones.push(
      { id: 'cert-a', project_id: 'project-1' },
      { id: 'cert-b', project_id: 'project-1' },
      { id: 'cert-c', project_id: 'project-1' },
      { id: 'cert-old', project_id: 'project-1' },
    )
  })

  it('documents the atomic transaction function in the migration', () => {
    const migration = readServerFile('migrations', '071_create_atomic_certificate_work_item.sql')

    expect(migration).toContain('CREATE OR REPLACE FUNCTION create_certificate_work_item_atomic')
    expect(migration).toContain('FOREACH v_certificate_id IN ARRAY p_certificate_ids')
    expect(migration).toContain('certificate_approvals')
  })

  it('creates a work item by delegating the full write to the atomic RPC', async () => {
    state.rpc.mockImplementation(async (_fnName: string, payload: Record<string, any>) => ({
      data: {
        id: payload.p_id,
        project_id: payload.p_project_id,
        item_code: payload.p_item_code,
        item_name: payload.p_item_name,
        item_stage: payload.p_item_stage,
        status: payload.p_status,
        planned_finish_date: payload.p_planned_finish_date,
        actual_finish_date: payload.p_actual_finish_date,
        approving_authority: payload.p_approving_authority,
        is_shared: payload.p_is_shared,
        next_action: payload.p_next_action,
        next_action_due_date: payload.p_next_action_due_date,
        is_blocked: payload.p_is_blocked,
        block_reason: payload.p_block_reason,
        sort_order: payload.p_sort_order,
        notes: payload.p_notes,
        latest_record_at: payload.p_latest_record_at,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      error: null,
    }))

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-work-items').send({
      item_name: '共享资料收集',
      item_stage: '资料准备',
      status: 'internal_review',
      certificate_ids: ['cert-a', 'cert-b'],
    })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      project_id: 'project-1',
      item_name: '共享资料收集',
      item_stage: '资料准备',
      status: 'internal_review',
      is_shared: true,
    })
    expect(state.rpc).toHaveBeenCalledTimes(1)
    expect(state.rpc).toHaveBeenCalledWith(
      'create_certificate_work_item_atomic',
      expect.objectContaining({
        p_project_id: 'project-1',
        p_item_name: '共享资料收集',
        p_item_stage: '资料准备',
        p_status: 'internal_review',
        p_certificate_ids: ['cert-a', 'cert-b'],
      })
    )
  })

  it('supports bulk import through the same atomic RPC contract', async () => {
    state.rpc.mockImplementation(async (_fnName: string, payload: Record<string, any>) => ({
      data: {
        id: payload.p_id,
        project_id: payload.p_project_id,
        item_code: payload.p_item_code,
        item_name: payload.p_item_name,
        item_stage: payload.p_item_stage,
        status: payload.p_status,
        planned_finish_date: payload.p_planned_finish_date,
        actual_finish_date: payload.p_actual_finish_date,
        approving_authority: payload.p_approving_authority,
        is_shared: payload.p_is_shared,
        next_action: payload.p_next_action,
        next_action_due_date: payload.p_next_action_due_date,
        is_blocked: payload.p_is_blocked,
        block_reason: payload.p_block_reason,
        sort_order: payload.p_sort_order,
        notes: payload.p_notes,
        latest_record_at: payload.p_latest_record_at,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      error: null,
    }))

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-work-items/bulk-import').send({
      items: [
        {
          item_name: '共享资料收集',
          item_stage: '资料准备',
          status: 'pending',
          certificate_ids: ['cert-a', 'cert-b'],
        },
        {
          item_name: '会签盖章',
          item_stage: '审批办理',
          status: 'in_progress',
          certificate_ids: ['cert-c'],
        },
      ],
    })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(2)
    expect(response.body.data[0]).toMatchObject({
      project_id: 'project-1',
      item_name: '共享资料收集',
      is_shared: true,
    })
    expect(response.body.data[1]).toMatchObject({
      project_id: 'project-1',
      item_name: '会签盖章',
      is_shared: false,
    })
    expect(state.rpc).toHaveBeenCalledTimes(2)
  })

  it('rejects certificate links outside the current project', async () => {
    state.preMilestones.push({ id: 'cert-other', project_id: 'project-other' })

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-work-items').send({
      item_name: 'cross certificate',
      item_stage: '资料准备',
      certificate_ids: ['cert-other'],
    })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CERTIFICATE_PROJECT_MISMATCH')
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('rejects bulk import requests larger than the sync ceiling', async () => {
    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-work-items/bulk-import').send({
      items: Array.from({ length: 101 }, (_, index) => ({
        item_name: `事项-${index + 1}`,
        item_stage: '资料准备',
      })),
    })

    expect(response.status).toBe(413)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('BATCH_ASYNC_REQUIRED')
    expect(response.body.error.details).toMatchObject({
      requested_count: 101,
      max_sync_items: 100,
      strategy: 'reject_sync',
    })
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('fails fast when the atomic RPC returns an error', async () => {
    state.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc failed' },
    })

    const request = supertest(buildApp())
    const response = await request.post('/api/projects/project-1/certificate-work-items').send({
      item_name: '共享资料收集',
      item_stage: '资料准备',
      certificate_ids: ['cert-a'],
    })

    expect(response.status).toBe(500)
    expect(response.body.error.message).toBe('rpc failed')
  })

  it('replaces linked certificate ids on single-item patch', async () => {
    state.workItems.push({
      id: 'item-1',
      project_id: 'project-1',
      item_code: 'WI-1',
      item_name: '共享资料收集',
      item_stage: '资料准备',
      status: 'pending',
      sort_order: 1,
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    })
    state.dependencies.push({
      id: 'dep-old',
      project_id: 'project-1',
      predecessor_type: 'certificate',
      predecessor_id: 'cert-old',
      successor_type: 'work_item',
      successor_id: 'item-1',
      dependency_kind: 'soft',
      created_at: '2026-04-15T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request
      .patch('/api/projects/project-1/certificate-work-items/item-1')
      .send({
        status: 'internal_review',
        certificate_ids: ['cert-a', 'cert-b'],
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'item-1',
      status: 'internal_review',
      certificate_ids: ['cert-a', 'cert-b'],
    })
    expect(state.dependencies.map((dependency) => dependency.predecessor_id)).toEqual(['cert-a', 'cert-b'])
    expect(state.workItems.find((item) => item.id === 'item-1')).toMatchObject({
      certificate_ids: ['cert-a', 'cert-b'],
      is_shared: true,
    })
    expect(joinedSql(state.executeSQL.mock.calls as [unknown, ...unknown[]][])).toContain('certificate_ids = ?')
  })

  it('records certificate work item completion as sample health evidence without publishing runtime assets', async () => {
    state.workItems.push({
      id: 'item-1',
      project_id: 'project-1',
      item_code: 'CERT-WI-1',
      item_name: 'Construction permit materials',
      item_stage: 'external_submission',
      status: 'internal_review',
      actual_finish_date: null,
      sort_order: 1,
      created_at: '2026-04-15T00:00:00.000Z',
      updated_at: '2026-04-15T00:00:00.000Z',
    })

    const request = supertest(buildApp())
    const response = await request
      .patch('/api/projects/project-1/certificate-work-items/item-1')
      .send({
        status: 'completed',
        actual_finish_date: '2026-05-20',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    const sampleHealthInserts = state.executeSQL.mock.calls.filter(([sql]) =>
      String(sql).toLowerCase().includes('insert into public.algorithm_sample_health_events')
    )
    expect(sampleHealthInserts).toHaveLength(1)
    expect(sampleHealthInserts[0]?.[1]).toEqual(expect.arrayContaining([
      'certificate_milestone:item-1',
      'business_completion.sample_health',
      'businessCompletionSampleHealthAdapterService',
      'company-1',
      'project-1',
      'governance_report',
      expect.objectContaining({
        workCode: 'certificate_milestone:CERT-WI-1',
        benchmarkEligible: false,
        candidateEvidenceEligible: true,
        domain: 'certificate_milestone',
        businessCode: 'CERT-WI-1',
        nonDurationBusinessCompletionSample: true,
        certificateId: 'item-1',
        certificateWorkItemId: 'item-1',
        milestoneCode: 'CERT-WI-1',
        sourceRoute: 'certificate-work-items.patch',
      }),
    ]))

    const sqlText = joinedSql(state.executeSQL.mock.calls as [unknown, ...unknown[]][])
    expect(sqlText).not.toContain('standard_work_duration')
    expect(sqlText).not.toContain('algorithm_seed_records')
    expect(sqlText).not.toContain('algorithm_seed_overrides')
    expect(sqlText).not.toContain('algorithm_learnable_parameter_runtime_publications')
    expect(sqlText).not.toContain('policy_template_entity_runtime_publications')
  })

  it('supports batch patch for ledger maintenance', async () => {
    state.workItems.push(
      {
        id: 'item-1',
        project_id: 'project-1',
        item_name: '共享资料收集',
        item_stage: '资料准备',
        status: 'pending',
        next_action: null,
        sort_order: 1,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'item-2',
        project_id: 'project-1',
        item_name: '会签盖章',
        item_stage: '审批办理',
        status: 'pending',
        next_action: null,
        sort_order: 2,
        created_at: '2026-04-15T00:10:00.000Z',
        updated_at: '2026-04-15T00:10:00.000Z',
      },
    )

    const request = supertest(buildApp())
    const response = await request
      .patch('/api/projects/project-1/certificate-work-items/batch')
      .send({
        ids: ['item-1', 'item-2'],
        updates: {
          status: 'internal_review',
          next_action: '统一补齐送审材料',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(2)
    expect(response.body.data[0]).toMatchObject({
      id: 'item-1',
      status: 'internal_review',
      next_action: '统一补齐送审材料',
    })
    expect(state.workItems.every((item) => item.status === 'internal_review')).toBe(true)
  })

  it('records batch certificate work item completions as sample health evidence', async () => {
    state.workItems.push(
      {
        id: 'item-1',
        project_id: 'project-1',
        item_code: 'CERT-WI-1',
        item_name: 'Construction permit materials',
        item_stage: 'external_submission',
        status: 'pending',
        actual_finish_date: null,
        sort_order: 1,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'item-2',
        project_id: 'project-1',
        item_code: 'CERT-WI-2',
        item_name: 'Fire review opinion',
        item_stage: 'external_submission',
        status: 'pending',
        actual_finish_date: null,
        sort_order: 2,
        created_at: '2026-04-15T00:10:00.000Z',
        updated_at: '2026-04-15T00:10:00.000Z',
      },
    )

    const request = supertest(buildApp())
    const response = await request
      .patch('/api/projects/project-1/certificate-work-items/batch')
      .send({
        ids: ['item-1', 'item-2'],
        updates: {
          status: 'issued',
          actual_finish_date: '2026-05-21',
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    const sampleHealthInserts = state.executeSQL.mock.calls.filter(([sql]) =>
      String(sql).toLowerCase().includes('insert into public.algorithm_sample_health_events')
    )
    expect(sampleHealthInserts).toHaveLength(2)
    const insertedParams = sampleHealthInserts.map((call) => call[1])
    expect(insertedParams).toEqual(expect.arrayContaining([
      expect.arrayContaining([
        'certificate_milestone:item-1',
        expect.objectContaining({
          domain: 'certificate_milestone',
          certificateWorkItemId: 'item-1',
          sourceRoute: 'certificate-work-items.batch-patch',
          benchmarkEligible: false,
        }),
      ]),
      expect.arrayContaining([
        'certificate_milestone:item-2',
        expect.objectContaining({
          domain: 'certificate_milestone',
          certificateWorkItemId: 'item-2',
          sourceRoute: 'certificate-work-items.batch-patch',
          benchmarkEligible: false,
        }),
      ]),
    ]))
  })

  it('supports batch delete for ledger maintenance', async () => {
    state.workItems.push(
      {
        id: 'item-1',
        project_id: 'project-1',
        item_name: '共享资料收集',
        item_stage: '资料准备',
        status: 'pending',
        sort_order: 1,
        created_at: '2026-04-15T00:00:00.000Z',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'item-2',
        project_id: 'project-1',
        item_name: '会签盖章',
        item_stage: '审批办理',
        status: 'pending',
        sort_order: 2,
        created_at: '2026-04-15T00:10:00.000Z',
        updated_at: '2026-04-15T00:10:00.000Z',
      },
    )
    state.dependencies.push(
      {
        id: 'dep-1',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-a',
        successor_type: 'work_item',
        successor_id: 'item-1',
        dependency_kind: 'soft',
        created_at: '2026-04-15T00:00:00.000Z',
      },
      {
        id: 'dep-2',
        project_id: 'project-1',
        predecessor_type: 'certificate',
        predecessor_id: 'cert-b',
        successor_type: 'work_item',
        successor_id: 'item-2',
        dependency_kind: 'soft',
        created_at: '2026-04-15T00:10:00.000Z',
      },
    )

    const request = supertest(buildApp())
    const response = await request
      .delete('/api/projects/project-1/certificate-work-items/batch')
      .send({ ids: ['item-1', 'item-2'] })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.deleted_ids).toEqual(['item-1', 'item-2'])
    expect(state.workItems).toHaveLength(0)
    expect(state.dependencies).toHaveLength(0)
  })
})
