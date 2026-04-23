import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
process.env.SUPABASE_SERVICE_KEY = 'test-service-key'

type QueryBuilder = {
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  not: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  then: Promise<{ data: unknown[]; error: null }>['then']
  catch: Promise<{ data: unknown[]; error: null }>['catch']
  finally: Promise<{ data: unknown[]; error: null }>['finally']
}

const mocks = vi.hoisted(() => {
  const builders: QueryBuilder[] = []

  function createBuilder(): QueryBuilder {
    const result = Promise.resolve({ data: [], error: null })
    const builder = {} as QueryBuilder

    builder.select = vi.fn(() => builder)
    builder.update = vi.fn(() => builder)
    builder.delete = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
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
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
    rpc: vi.fn(),
  })),
}))

const { executeSQL } = await import('../services/dbService.js')

describe('executeSQL LIMIT parsing', () => {
  beforeEach(() => {
    mocks.builders.length = 0
    mocks.from.mockClear()
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
      executeSQL('SELECT * FROM standard_processes WHERE name LIKE ?', ['%主体%']),
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
})
