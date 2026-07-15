import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, any>>,
  queries: [] as Array<{
    table: string
    operation: 'select' | 'update'
    filters: Array<[string, unknown]>
    payload?: Record<string, unknown>
  }>,
}))

function buildQuery(table: string) {
  let operation: 'select' | 'update' = 'select'
  let payload: Record<string, unknown> | undefined
  const filters: Array<[string, unknown]> = []

  const matchingRows = () => {
    if (table !== 'engineering_objects') return []
    return mocks.rows.filter((row) => filters.every(([field, value]) => row[field] === value))
  }

  const recordQuery = () => {
    mocks.queries.push({ table, operation, filters: [...filters], payload })
  }

  const resolve = () => {
    recordQuery()
    if (operation === 'update') {
      for (const row of matchingRows()) Object.assign(row, payload)
      return { data: null, error: null }
    }
    return { data: matchingRows(), error: null }
  }

  const query: Record<string, any> = {
    select: vi.fn(() => query),
    update: vi.fn((nextPayload: Record<string, unknown>) => {
      operation = 'update'
      payload = nextPayload
      return query
    }),
    eq: vi.fn((field: string, value: unknown) => {
      filters.push([field, value])
      return query
    }),
    limit: vi.fn(async () => resolve()),
    maybeSingle: vi.fn(async () => {
      recordQuery()
      return { data: matchingRows()[0] ?? null, error: null }
    }),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => (
      Promise.resolve(resolve()).then(onFulfilled, onRejected)
    ),
  }

  return query
}

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn((table: string) => buildQuery(table)),
  },
}))

vi.mock('../database.js', () => ({ query: vi.fn() }))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const {
  clearEngineeringObjectReadCache,
  deleteEngineeringObject,
  updateEngineeringObject,
} = await import('../services/engineeringObjectService.js')

function engineeringObject(id: string, projectId: string) {
  return {
    id,
    project_id: projectId,
    object_type: 'building',
    object_code: `BD-${id}`,
    object_name: id,
    parent_id: null,
    path: `/${id}`,
    level: 1,
    sort_order: 0,
    status: 'active',
    source_type: 'manual',
    metadata: {},
    created_at: '2026-07-11T00:00:00.000Z',
    updated_at: '2026-07-11T00:00:00.000Z',
  }
}

describe('engineering object tenant isolation', () => {
  beforeEach(() => {
    mocks.rows = [
      engineeringObject('object-owned', 'project-1'),
      engineeringObject('object-foreign', 'project-2'),
    ]
    mocks.queries = []
    clearEngineeringObjectReadCache()
  })

  it('does not update an object outside the requested project', async () => {
    await expect(updateEngineeringObject('object-foreign', {
      projectId: 'project-1',
      objectName: 'changed',
    })).rejects.toThrow('Engineering object not found')

    expect(mocks.rows.find((row) => row.id === 'object-foreign')?.object_name).toBe('object-foreign')
  })

  it('does not delete an object outside the requested project', async () => {
    await expect(deleteEngineeringObject('project-1', 'object-foreign'))
      .rejects.toThrow('Engineering object not found')

    expect(mocks.rows.find((row) => row.id === 'object-foreign')?.status).toBe('active')
    expect(mocks.queries[0]?.filters).toEqual(expect.arrayContaining([
      ['id', 'object-foreign'],
      ['project_id', 'project-1'],
    ]))
  })

  it('scopes every delete reference check to the requested project', async () => {
    await deleteEngineeringObject('project-1', 'object-owned')

    const referenceReads = mocks.queries.filter((query) => (
      query.operation === 'select'
      && ['tasks', 'acceptance_plans', 'engineering_objects'].includes(query.table)
      && !query.filters.some(([field]) => field === 'id')
    ))

    expect(referenceReads.length).toBeGreaterThan(0)
    for (const query of referenceReads) {
      expect(query.filters).toContainEqual(['project_id', 'project-1'])
    }
  })
})
