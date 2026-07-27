import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  gt: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  lt: ReturnType<typeof vi.fn>
  lte: ReturnType<typeof vi.fn>
  not: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  then: Promise<{ data: unknown[]; error: null; count?: number | null }>['then']
  catch: Promise<{ data: unknown[]; error: null; count?: number | null }>['catch']
  finally: Promise<{ data: unknown[]; error: null; count?: number | null }>['finally']
}

type MockQueryResult = {
  data: unknown[]
  error: { message: string } | null
  count?: number | null
}

const mocks = vi.hoisted(() => {
  const builders: QueryBuilder[] = []
  const rawQuery = vi.fn()
  let nextSelectResult: Promise<MockQueryResult> | null = null

  function createBuilder(): QueryBuilder {
    const result = nextSelectResult ?? Promise.resolve({ data: [], error: null })
    nextSelectResult = null
    const builder = {} as QueryBuilder

    builder.select = vi.fn(() => builder)
    builder.insert = vi.fn(() => builder)
    builder.update = vi.fn(() => builder)
    builder.delete = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.gt = vi.fn(() => builder)
    builder.gte = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    builder.lt = vi.fn(() => builder)
    builder.lte = vi.fn(() => builder)
    builder.not = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.range = vi.fn(() => builder)
    builder.then = result.then.bind(result)
    builder.catch = result.catch.bind(result)
    builder.finally = result.finally.bind(result)

    builders.push(builder)
    return builder
  }

  return {
    builders,
    from: vi.fn(() => createBuilder()),
    rawQuery,
    setNextSelectResult(result: Promise<MockQueryResult>) {
      nextSelectResult = result
    },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
    rpc: vi.fn(),
  })),
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
  isDatabaseTransactionActive: vi.fn(() => false),
}))

const { executeSQL } = await import('../services/dbService.js')

describe('executeSQL LIMIT parsing', () => {
  beforeEach(() => {
    mocks.builders.length = 0
    mocks.from.mockClear()
    mocks.rawQuery.mockReset()
    mocks.rawQuery.mockResolvedValue({ rows: [] })
  })

  it('supports literal LIMIT values', async () => {
    await executeSQL('SELECT * FROM tasks WHERE id = ? LIMIT 1', ['task-1'])

    expect(mocks.from).toHaveBeenCalledWith('tasks')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('id', 'task-1')
    expect(mocks.builders[0]?.limit).toHaveBeenCalledWith(1)
    expect(mocks.builders[0]?.range).not.toHaveBeenCalled()
  })

  it('supports literal LIMIT with OFFSET values', async () => {
    await executeSQL('SELECT * FROM tasks LIMIT 10 OFFSET 20')

    expect(mocks.from).toHaveBeenCalledWith('tasks')
    expect(mocks.builders[0]?.limit).not.toHaveBeenCalled()
    expect(mocks.builders[0]?.range).toHaveBeenCalledWith(20, 29)
  })

  it('supports placeholder LIMIT with placeholder OFFSET values', async () => {
    await executeSQL('SELECT * FROM tasks WHERE project_id = ? LIMIT ? OFFSET ?', ['project-1', 5, 15])

    expect(mocks.from).toHaveBeenCalledWith('tasks')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mocks.builders[0]?.range).toHaveBeenCalledWith(15, 19)
  })

  it('rejects legacy JSON_CONTAINS filters explicitly', async () => {
    await expect(
      executeSQL(
        'SELECT * FROM notifications WHERE JSON_CONTAINS(recipients, JSON_QUOTE(?))',
        ['user-1'],
      ),
    ).rejects.toThrow('JSON_CONTAINS is not supported')
  })

  it('supports AND with IN filters explicitly', async () => {
    await executeSQL(
      'SELECT * FROM project_members WHERE project_id = ? AND user_id = ? AND permission_level IN (?, ?, ?) LIMIT 1',
      ['project-1', 'user-1', 'owner', 'editor', 'admin'],
    )

    expect(mocks.from).toHaveBeenCalledWith('project_members')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mocks.builders[0]?.in).toHaveBeenCalledWith('permission_level', ['owner', 'editor', 'admin'])
  })

  it('supports ordered snapshot lookup with less-than-or-equal filter', async () => {
    await executeSQL(
      'SELECT * FROM project_daily_snapshot WHERE project_id = ? AND snapshot_date <= ? ORDER BY snapshot_date DESC LIMIT 1',
      ['project-1', '2026-04-06'],
    )

    expect(mocks.from).toHaveBeenCalledWith('project_daily_snapshot')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mocks.builders[0]?.lte).toHaveBeenCalledWith('snapshot_date', '2026-04-06')
    expect(mocks.builders[0]?.order).toHaveBeenCalledWith('snapshot_date', { ascending: false })
    expect(mocks.builders[0]?.limit).toHaveBeenCalledWith(1)
  })

  it('parses schema-qualified SELECT table names without querying the schema as a table', async () => {
    await executeSQL('SELECT * FROM public.pre_milestones WHERE project_id = ?', ['project-1'])

    expect(mocks.from).toHaveBeenCalledWith('pre_milestones')
    expect(mocks.from).not.toHaveBeenCalledWith('public')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('project_id', 'project-1')
  })

  it('treats WHERE 1 = 0 as an empty guarded result without hitting the database', async () => {
    const rows = await executeSQL('SELECT id, name FROM projects WHERE 1 = 0 ORDER BY created_at ASC')

    expect(rows).toEqual([])
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects OR filters explicitly', async () => {
    await expect(
      executeSQL('SELECT * FROM drawing_review_rules WHERE project_id = ? OR project_id IS NULL', ['project-1']),
    ).rejects.toThrow('OR is not supported')
  })

  it('rejects JOIN queries explicitly', async () => {
    await expect(
      executeSQL('SELECT dv.*, cd.drawing_name FROM drawing_versions dv LEFT JOIN construction_drawings cd ON cd.id = dv.drawing_id WHERE dv.project_id = ?', ['project-1']),
    ).rejects.toThrow('JOIN is not supported')
  })

  it('rejects LIKE filters explicitly', async () => {
    await expect(
      executeSQL('SELECT * FROM tasks WHERE title LIKE ?', ['%主体%']),
    ).rejects.toThrow('LIKE is not supported')
  })

  it('rejects unsupported update expressions explicitly', async () => {
    await expect(
      executeSQL(
        'UPDATE drawing_versions SET created_by = COALESCE(?, created_by) WHERE id = ?',
        ['user-1', 'version-1'],
      ),
    ).rejects.toThrow('Unsupported expression')
  })

  it('returns affected UPDATE rows so guarded status writes can detect stale state', async () => {
    const updatedRow = { id: 'plan-1', status: 'submitted' }
    mocks.setNextSelectResult(Promise.resolve({ data: [updatedRow], error: null }))

    const rows = await executeSQL(
      'UPDATE acceptance_plans SET status = ?, actual_date = ? WHERE id = ? AND project_id = ? AND status = ?',
      ['submitted', null, 'plan-1', 'project-1', 'preparing'],
    )

    expect(rows).toEqual([updatedRow])
    expect(mocks.builders[0]?.update).toHaveBeenCalledWith({ status: 'submitted', actual_date: null })
    expect(mocks.builders[0]?.select).toHaveBeenCalledWith('*')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('id', 'plan-1')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('status', 'preparing')
  })

  it('supports UPDATE RETURNING columns for guarded status writes', async () => {
    const updatedRow = { id: 'plan-1' }
    mocks.setNextSelectResult(Promise.resolve({ data: [updatedRow], error: null }))

    const rows = await executeSQL(
      'UPDATE acceptance_plans SET status = ?, actual_date = ? WHERE id = ? AND project_id = ? AND status = ? RETURNING id',
      ['submitted', null, 'plan-1', 'project-1', 'preparing'],
    )

    expect(rows).toEqual([updatedRow])
    expect(mocks.builders[0]?.update).toHaveBeenCalledWith({ status: 'submitted', actual_date: null })
    expect(mocks.builders[0]?.select).toHaveBeenCalledWith('id')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('id', 'plan-1')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mocks.builders[0]?.eq).toHaveBeenCalledWith('status', 'preparing')
  })

  it('supports schema-qualified INSERT statements used by governance candidate writers', async () => {
    mocks.setNextSelectResult(Promise.resolve({ data: [{ id: 'event-1' }], error: null }))

    const rows = await executeSQL(
      'INSERT INTO public.algorithm_asset_candidate_events (id, source, status) VALUES (?, ?, ?) RETURNING id',
      ['event-1', 'construction_organization_plan_network_manual_review_handoff', 'candidate'],
    )

    expect(rows).toEqual([{ id: 'event-1' }])
    expect(mocks.from).toHaveBeenCalledWith('algorithm_asset_candidate_events')
    expect(mocks.builders[0]?.insert).toHaveBeenCalledWith({
      id: 'event-1',
      source: 'construction_organization_plan_network_manual_review_handoff',
      status: 'candidate',
    })
    expect(mocks.builders[0]?.select).toHaveBeenCalledWith('id')
  })

  it('does not replay an INSERT through direct SQL when the REST outcome is unknown', async () => {
    mocks.setNextSelectResult(Promise.reject(new Error('dbService.executeSQL INSERT algorithm_asset_candidate_events timed out after 4000ms')))

    await expect(executeSQL(
      'INSERT INTO public.algorithm_asset_candidate_events (id, source, status) VALUES (?, ?, ?) RETURNING id',
      ['event-direct-1', 'construction_organization_plan_network_manual_review_handoff', 'candidate'],
    )).rejects.toMatchObject({
      code: 'MUTATION_OUTCOME_UNKNOWN',
      statusCode: 503,
    })

    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('does not replay an INSERT through direct SQL when REST returns an error object', async () => {
    mocks.setNextSelectResult(Promise.resolve({ data: [], error: { message: 'Invalid API key' } }))

    await expect(executeSQL(
      'INSERT INTO acceptance_plans (id, project_id, status) VALUES (?, ?, ?)',
      ['plan-direct-1', 'project-1', 'draft'],
    )).rejects.toThrow('[executeSQL INSERT] Invalid API key')

    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('does not replay an UPDATE through direct SQL when REST returns an error object', async () => {
    mocks.setNextSelectResult(Promise.resolve({ data: [], error: { message: 'Invalid API key' } }))

    await expect(executeSQL(
      'UPDATE acceptance_plans SET status = ?, actual_date = ? WHERE id = ? AND project_id = ? AND status = ?',
      ['preparing', null, 'plan-1', 'project-1', 'draft'],
    )).rejects.toThrow('[executeSQL UPDATE] Invalid API key')

    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('does not replay a DELETE through direct SQL when REST returns an error object', async () => {
    mocks.setNextSelectResult(Promise.resolve({ data: [], error: { message: 'Invalid API key' } }))

    await expect(executeSQL(
      'DELETE FROM acceptance_plans WHERE id = ? AND project_id = ?',
      ['plan-1', 'project-1'],
    )).rejects.toThrow('[executeSQL DELETE] Invalid API key')

    expect(mocks.rawQuery).not.toHaveBeenCalled()
  })

  it('falls back to direct SQL when a SELECT is blocked by the Supabase REST circuit', async () => {
    mocks.setNextSelectResult(Promise.reject(new Error('dbService.executeSQL SELECT task_dependencies skipped because Supabase REST circuit is open for 12924ms')))
    mocks.rawQuery.mockResolvedValue({
      rows: [
        {
          task_id: 'task-2',
          dependency_task_id: 'task-1',
          dependency_type: 'FS',
          lag_days: 0,
          source_type: 'manual',
        },
      ],
    })

    const rows = await executeSQL(
      'SELECT task_id, dependency_task_id, dependency_type, lag_days, source_type FROM task_dependencies WHERE project_id = ? AND status = ? AND task_id IN (?, ?) ORDER BY created_at ASC, id ASC',
      ['project-1', 'active', 'task-2', 'task-3'],
    )

    expect(rows).toEqual([
      {
        task_id: 'task-2',
        dependency_task_id: 'task-1',
        dependency_type: 'FS',
        lag_days: 0,
        source_type: 'manual',
      },
    ])
    expect(mocks.rawQuery).toHaveBeenCalledWith(
      'SELECT task_id, dependency_task_id, dependency_type, lag_days, source_type FROM task_dependencies WHERE project_id = $1 AND status = $2 AND task_id IN ($3, $4) ORDER BY created_at ASC, id ASC',
      ['project-1', 'active', 'task-2', 'task-3'],
    )
  })
})
