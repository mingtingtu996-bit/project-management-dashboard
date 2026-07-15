import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  engineeringObjectRows: [] as Array<Record<string, unknown>>,
  insertErrors: [] as Array<null | {
    code?: string
    message?: string
    details?: string
    constraint?: string
  }>,
  insertedPayloads: [] as Array<Record<string, unknown>>,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../database.js', () => ({
  query: vi.fn(),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

function createEngineeringObjectsQuery() {
  const query: Record<string, any> = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve({ data: mocks.engineeringObjectRows, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: mocks.insertedPayloads[0] ?? null, error: null })),
    insert: vi.fn((payload: Record<string, unknown>) => {
      mocks.insertedPayloads.push(payload)
      const error = mocks.insertErrors.shift() ?? null
      return Promise.resolve({ error })
    }),
  }
  return query
}

describe('createEngineeringObject unique conflict handling', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.from.mockReset()
    mocks.engineeringObjectRows = []
    mocks.insertErrors = []
    mocks.insertedPayloads = []
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'engineering_objects') {
        throw new Error(`unexpected table ${table}`)
      }
      return createEngineeringObjectsQuery()
    })
  })

  it('does not retry name unique conflicts as if they were code conflicts', async () => {
    const { createEngineeringObject } = await import('../services/engineeringObjectService.js')
    mocks.insertErrors = [{
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_engineering_objects_root_active_name"',
      details: 'Key (project_id, object_name)=(project-1, Tower A) already exists.',
    }]

    await expect(createEngineeringObject({
      projectId: 'project-1',
      objectType: 'building',
      objectName: 'Tower A',
    })).rejects.toThrow(/Duplicate object name/)

    expect(mocks.insertedPayloads).toHaveLength(1)
  })

  it('still retries object code unique conflicts with a fresh generated code', async () => {
    const { createEngineeringObject } = await import('../services/engineeringObjectService.js')
    mocks.engineeringObjectRows = [{ object_code: 'BD-001' }]
    mocks.insertErrors = [{
      code: '23505',
      message: 'duplicate key value violates unique constraint "engineering_objects_project_id_object_type_object_code_key"',
      details: 'Key (project_id, object_type, object_code)=(project-1, building, BD-002) already exists.',
    }, null]

    const result = await createEngineeringObject({
      projectId: 'project-1',
      objectType: 'building',
      objectName: 'Tower B',
    })

    expect(result.object_name).toBe('Tower B')
    expect(mocks.insertedPayloads).toHaveLength(2)
  })
})
