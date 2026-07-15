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
} = await import('../services/dbService.js')

beforeEach(() => {
  mocks.from.mockClear()
  mocks.rpc.mockClear()
  mocks.rawQuery.mockReset()
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
  expect(String(mocks.rawQuery.mock.calls[1][0])).toContain('SELECT * FROM risks WHERE id = $1 LIMIT 1')
  expect(mocks.from).not.toHaveBeenCalled()
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
  mocks.rawQuery
    .mockResolvedValueOnce({ rows: [{ result: 'issue-1' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: 'issue-1',
        project_id: 'project-1',
        task_id: 'task-1',
        source_type: 'risk_converted',
        severity: 'medium',
        priority: 30,
        status: 'open',
        created_at: '2026-07-12T00:00:00.000Z',
      }],
    })
    .mockResolvedValueOnce({ rows: [] })

  await expect(createIssue({
    project_id: 'project-1',
    task_id: 'task-1',
    title: 'Converted risk issue',
    source_type: 'risk_converted',
    source_entity_type: 'risk',
    source_entity_id: 'risk-1',
    severity: 'medium',
  } as any)).resolves.toMatchObject({ id: 'issue-1', source_type: 'risk_converted' })

  expect(String(mocks.rawQuery.mock.calls[0][0])).toContain('create_issue_from_risk_atomic')
  expect(String(mocks.rawQuery.mock.calls[0][0])).toContain('"p_risk_id" => $1')
  expect(mocks.rawQuery.mock.calls[0][1]).toEqual([
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
    .mockResolvedValueOnce({ rows: [] })
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
