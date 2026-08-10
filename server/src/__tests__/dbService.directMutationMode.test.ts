import { beforeEach, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.DB_CONNECTION_STRING = 'postgresql://runtime-user:runtime-password@127.0.0.1:5432/workbuddy'
process.env.TASK_READ_DIRECT_FIRST = 'false'
delete process.env.SUPABASE_RUNTIME_KEY

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  rawQuery: vi.fn(),
  recordChangedExecutionFacts: vi.fn(async () => []),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
  isDatabaseTransactionActive: vi.fn(() => false),
  withDatabaseTransaction: vi.fn(async (work: () => Promise<unknown>) => work()),
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => effect()),
}))

vi.mock('../services/executionFactGovernanceService.js', () => ({
  recordChangedExecutionFacts: mocks.recordChangedExecutionFacts,
}))

const {
  createIssue,
  createRisk,
  deleteIssue,
  deleteRisk,
  executeSQL,
  getIssues,
  getRisks,
  getTask,
  getTasks,
  updateIssue,
  updateRisk,
} = await import('../services/dbService.js')

beforeEach(() => {
  mocks.from.mockClear()
  mocks.rpc.mockClear()
  mocks.rawQuery.mockReset()
  mocks.recordChangedExecutionFacts.mockClear()
})

it('uses the low-privilege database connection for mutations when no dedicated runtime REST key exists', async () => {
  mocks.rawQuery.mockResolvedValueOnce({ rows: [{ id: 'drawing-1' }] })

  const result = await executeSQL(
    'INSERT INTO construction_drawings (id, project_id, drawing_name) VALUES (?, ?, ?) RETURNING id',
    ['drawing-1', 'project-1', 'Controlled staging drawing'],
  )

  expect(result).toEqual([{ id: 'drawing-1' }])
  expect(mocks.rawQuery).toHaveBeenCalledWith(
    'INSERT INTO construction_drawings (id, project_id, drawing_name) VALUES ($1, $2, $3) RETURNING id',
    ['drawing-1', 'project-1', 'Controlled staging drawing'],
  )
  expect(mocks.from).not.toHaveBeenCalled()
})

it('uses the low-privilege database connection for reads so anonymous REST RLS cannot return false empty results', async () => {
  mocks.rawQuery.mockResolvedValueOnce({
    rows: [{ id: 'task-1', project_id: 'project-1' }],
  })

  const result = await executeSQL(
    'SELECT id, project_id FROM tasks WHERE id IN (?)',
    ['task-1'],
  )

  expect(result).toEqual([{ id: 'task-1', project_id: 'project-1' }])
  expect(mocks.rawQuery).toHaveBeenCalledWith(
    'SELECT id, project_id FROM tasks WHERE id IN ($1)',
    ['task-1'],
  )
  expect(mocks.from).not.toHaveBeenCalled()
})

it('creates and reads risks through the backend database role', async () => {
  mocks.rawQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'risk-1',
        project_id: 'project-1',
        title: 'Controlled staging risk',
        status: 'active',
        source_type: 'manual',
      }],
    })

  const result = await createRisk({
    project_id: 'project-1',
    title: 'Controlled staging risk',
    status: 'active',
    source_type: 'manual',
  } as any)

  expect(result).toMatchObject({ project_id: 'project-1', title: 'Controlled staging risk' })
  expect(String(mocks.rawQuery.mock.calls[0][0])).toContain('INSERT INTO risks')
  expect(mocks.rawQuery.mock.calls[0][1][27]).toBe('[]')
  expect(String(mocks.rawQuery.mock.calls[1][0])).toContain('SELECT * FROM risks WHERE id = $1 LIMIT 1')
  expect(mocks.from).not.toHaveBeenCalled()
})

it('serializes issue closure evidence as JSONB during direct creation', async () => {
  const createdIssue = {
    id: 'issue-1',
    project_id: 'project-1',
    title: 'Controlled staging issue',
    source_type: 'manual',
    severity: 'medium',
    priority: 30,
    status: 'open',
    version: 1,
    created_at: '2026-08-10T04:00:00.000Z',
    updated_at: '2026-08-10T04:00:00.000Z',
  }
  mocks.rawQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [createdIssue] })
    .mockResolvedValueOnce({ rows: [] })

  await expect(createIssue({
    project_id: 'project-1',
    title: 'Controlled staging issue',
    source_type: 'manual',
  } as any)).resolves.toMatchObject({ id: 'issue-1' })

  const insertCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO issues'))
  expect(insertCall?.[1][19]).toBe('[]')
})

it('serializes risk closure evidence as JSONB during direct updates', async () => {
  const oldRisk = {
    id: 'risk-1',
    project_id: 'project-1',
    title: 'Closable risk',
    status: 'mitigating',
    pending_manual_close: false,
    version: 1,
    created_at: '2026-08-09T04:00:00.000Z',
    updated_at: '2026-08-09T04:00:00.000Z',
  }
  const updatedRisk = {
    ...oldRisk,
    status: 'closed',
    closure_evidence_refs: ['inspection:risk-1'],
    version: 2,
    updated_at: '2026-08-10T04:00:00.000Z',
  }
  mocks.rawQuery.mockImplementation(async (sql: string) => {
    const normalized = sql.toLowerCase()
    if (normalized.includes('select * from risks') && normalized.includes('for update')) {
      return { rows: [oldRisk] }
    }
    if (normalized.includes('update risks set')) return { rows: [{ id: 'risk-1' }] }
    if (normalized.includes('select * from risks')) return { rows: [updatedRisk] }
    return { rows: [] }
  })

  await updateRisk('risk-1', {
    status: 'closed',
    closure_result_code: 'resolved',
    closure_result_summary: 'Verified corrective work.',
    closure_effectiveness: 'resolved',
    closure_evidence_refs: ['inspection:risk-1'],
    closure_recorded_at: '2026-08-10T04:00:00.000Z',
  } as any, 1)

  const updateCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE risks SET'))
  expect(updateCall?.[1]).toContain(JSON.stringify(['inspection:risk-1']))
  expect(updateCall?.[1]).not.toContainEqual(['inspection:risk-1'])
})

it('serializes issue closure evidence as JSONB during direct updates', async () => {
  const oldIssue = {
    id: 'issue-1',
    project_id: 'project-1',
    title: 'Closable issue',
    source_type: 'manual',
    severity: 'medium',
    priority: 30,
    status: 'resolved',
    pending_manual_close: false,
    version: 1,
    created_at: '2026-08-09T04:00:00.000Z',
    updated_at: '2026-08-09T04:00:00.000Z',
  }
  const updatedIssue = {
    ...oldIssue,
    status: 'closed',
    closure_evidence_refs: ['inspection:issue-1'],
    version: 2,
    updated_at: '2026-08-10T04:00:00.000Z',
  }
  mocks.rawQuery.mockImplementation(async (sql: string) => {
    const normalized = sql.toLowerCase()
    if (normalized.includes('select * from issues') && normalized.includes('for update')) {
      return { rows: [oldIssue] }
    }
    if (normalized.includes('update issues set')) return { rows: [{ id: 'issue-1' }] }
    if (normalized.includes('select * from issues')) return { rows: [updatedIssue] }
    return { rows: [] }
  })

  await updateIssue('issue-1', {
    status: 'closed',
    closure_result_code: 'resolved',
    closure_result_summary: 'Verified corrective work.',
    closure_effectiveness: 'resolved',
    closure_evidence_refs: ['inspection:issue-1'],
    closure_recorded_at: '2026-08-10T04:00:00.000Z',
  } as any, 1)

  const updateCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE issues SET'))
  expect(updateCall?.[1]).toContain(JSON.stringify(['inspection:issue-1']))
  expect(updateCall?.[1]).not.toContainEqual(['inspection:issue-1'])
})

it('deletes unlinked risks through the backend database role', async () => {
  mocks.rawQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'risk-1',
        project_id: 'project-1',
        title: 'Disposable risk',
        status: 'active',
        source_type: 'manual',
        linked_issue_id: null,
      }],
    })
    .mockResolvedValueOnce({ rows: [{ deleted: true }] })

  await deleteRisk('risk-1')

  expect(String(mocks.rawQuery.mock.calls[1][0])).toContain('delete_risk_with_source_backfill_atomic')
  expect(mocks.from).not.toHaveBeenCalled()
})

it('reads a task by id through the backend database role', async () => {
  mocks.rawQuery.mockResolvedValueOnce({
    rows: [{ id: 'task-1', project_id: 'project-1', title: 'Controlled staging task' }],
  })

  await expect(getTask('task-1')).resolves.toMatchObject({ id: 'task-1', project_id: 'project-1' })

  expect(mocks.rawQuery).toHaveBeenCalledWith('SELECT * FROM tasks WHERE id = $1 LIMIT 1', ['task-1'])
  expect(mocks.from).not.toHaveBeenCalled()
})

it('lists project tasks through the backend database role even when the REST preference flag is false', async () => {
  const restQuery = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  mocks.from.mockReturnValue(restQuery)
  mocks.rawQuery.mockResolvedValueOnce({
    rows: [{ id: 'task-1', project_id: 'project-1', title: 'Controlled staging task' }],
  })

  await expect(getTasks('project-1', { columns: ['id', 'project_id', 'title'] })).resolves.toEqual([
    expect.objectContaining({ id: 'task-1', project_id: 'project-1' }),
  ])

  expect(String(mocks.rawQuery.mock.calls[0][0])).toContain('FROM public.tasks WHERE project_id = $1')
  expect(mocks.rawQuery.mock.calls[0][1]).toEqual(['project-1'])
  expect(mocks.from).not.toHaveBeenCalled()
})

it('lists project risks through the backend database role', async () => {
  mocks.rawQuery.mockResolvedValueOnce({
    rows: [{ id: 'risk-1', project_id: 'project-1', category: 'progress' }],
  })

  await expect(getRisks('project-1')).resolves.toEqual([
    expect.objectContaining({ id: 'risk-1', project_id: 'project-1', risk_category: 'progress' }),
  ])

  expect(String(mocks.rawQuery.mock.calls[0][0])).toContain('FROM risks WHERE project_id = $1')
  expect(mocks.from).not.toHaveBeenCalled()
})

it('lists project issues and priority locks through the backend database role', async () => {
  mocks.rawQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'issue-1',
        project_id: 'project-1',
        source_type: 'manual',
        severity: 'medium',
        priority: 30,
        status: 'open',
        created_at: '2026-07-12T00:00:00.000Z',
      }],
    })
    .mockResolvedValueOnce({ rows: [] })

  await expect(getIssues('project-1')).resolves.toEqual([
    expect.objectContaining({ id: 'issue-1', project_id: 'project-1' }),
  ])

  expect(String(mocks.rawQuery.mock.calls[0][0])).toContain('FROM issues WHERE project_id = $1')
  expect(String(mocks.rawQuery.mock.calls[1][0])).toContain('FROM change_logs')
  expect(mocks.from).not.toHaveBeenCalled()
})

it('converts a risk to an issue through a direct named-argument RPC call', async () => {
  const previousRisk = {
    id: 'risk-1',
    project_id: 'project-1',
    task_id: 'task-1',
    title: 'Converted risk',
    status: 'active',
    linked_issue_id: null,
    version: 1,
    created_at: '2026-07-11T00:00:00.000Z',
    updated_at: '2026-07-11T00:00:00.000Z',
  }
  const createdIssue = {
    id: 'issue-1',
    project_id: 'project-1',
    task_id: 'task-1',
    source_type: 'risk_converted',
    severity: 'medium',
    priority: 30,
    status: 'open',
    version: 1,
    created_at: '2026-07-12T00:00:00.000Z',
    updated_at: '2026-07-12T00:00:00.000Z',
  }
  mocks.rawQuery
    .mockResolvedValueOnce({ rows: [previousRisk] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ result: 'issue-1' }] })
    .mockResolvedValueOnce({ rows: [createdIssue] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [{
        ...previousRisk,
        status: 'closed',
        linked_issue_id: 'issue-1',
        version: 2,
        updated_at: '2026-07-12T00:00:00.000Z',
      }],
    })

  await expect(createIssue({
    project_id: 'project-1',
    task_id: 'task-1',
    title: 'Converted risk issue',
    source_type: 'risk_converted',
    source_entity_type: 'risk',
    source_entity_id: 'risk-1',
    severity: 'medium',
  } as any)).resolves.toMatchObject({ id: 'issue-1', source_type: 'risk_converted' })

  const rpcCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('create_issue_from_risk_atomic'))
  expect(rpcCall).toBeDefined()
  expect(String(rpcCall?.[0])).toContain('"p_risk_id" => $1')
  expect(rpcCall?.[1]).toEqual([
    'risk-1',
    'risk_converted',
    'Converted risk issue',
    null,
    'medium',
    null,
  ])
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
})

it('updates issues with a direct optimistic-lock statement', async () => {
  const oldIssue = {
    id: 'issue-1',
    project_id: 'project-1',
    source_type: 'risk_converted',
    severity: 'high',
    priority: 80,
    pending_manual_close: false,
    status: 'open',
    version: 1,
    created_at: '2026-07-12T00:00:00.000Z',
  }
  mocks.rawQuery
    .mockResolvedValueOnce({ rows: [oldIssue] })
    .mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] })
    .mockResolvedValueOnce({ rows: [{ ...oldIssue, status: 'investigating', version: 2 }] })
    .mockResolvedValueOnce({ rows: [] })

  await expect(updateIssue('issue-1', { status: 'investigating' }, 1)).resolves.toMatchObject({
    id: 'issue-1',
    status: 'investigating',
    version: 2,
  })

  const updateCall = mocks.rawQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE issues SET'))
  expect(updateCall).toBeDefined()
  expect(String(updateCall?.[0])).toContain('version = $')
  expect(String(updateCall?.[0])).toContain('RETURNING id')
  expect(updateCall?.[1]).toEqual(expect.arrayContaining(['investigating', 2, 'issue-1', 'project-1', 1]))
  expect(mocks.from).not.toHaveBeenCalled()
})

it('deletes unprotected issues through the backend database role', async () => {
  mocks.rawQuery
    .mockResolvedValueOnce({
      rows: [{
        id: 'issue-1',
        project_id: 'project-1',
        source_type: 'manual',
        severity: 'medium',
        priority: 30,
        pending_manual_close: false,
        status: 'open',
        version: 1,
        created_at: '2026-07-12T00:00:00.000Z',
      }],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })

  await deleteIssue('issue-1')

  expect(String(mocks.rawQuery.mock.calls[2][0])).toContain('DELETE FROM issues WHERE id = $1 AND project_id = $2')
  expect(mocks.from).not.toHaveBeenCalled()
})
