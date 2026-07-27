import { afterEach, describe, expect, it, vi } from 'vitest'

import { createProject, supabase, updateProject } from '../services/dbService.js'

function createProjectInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Schema guarded project',
    status: '未开始',
    company_id: 'company-1',
    owner_id: 'user-1',
    created_by: 'user-1',
    ...overrides,
  } as never
}

function createOptimisticSchemaErrorChain() {
  const chain = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => ({
      data: null,
      error: {
        code: '42703',
        message: 'column "version" of relation "projects" does not exist',
      },
    })),
  }
  chain.eq.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  return chain
}

describe('dbService project schema drift fail-closed behavior', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not strip a missing project column and retry creation', async () => {
    const insert = vi.fn(async () => ({
      data: null,
      error: {
        code: '42703',
        message: 'column "company_id" of relation "projects" does not exist',
      },
    }))
    vi.spyOn(supabase, 'from').mockReturnValue({ insert } as never)

    const error = await createProject(createProjectInput()).catch((caught) => caught)

    expect(error).toMatchObject({
      code: 'PROJECT_SCHEMA_INCOMPATIBLE',
      statusCode: 503,
    })
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: 'company-1' }))
  })

  it.each([
    ['company_id', { company_id: null }],
    ['owner_id', { owner_id: null }],
  ])('rejects a new project with no %s before any database write', async (_field, overrides) => {
    const from = vi.spyOn(supabase, 'from')

    await expect(createProject(createProjectInput(overrides))).rejects.toMatchObject({
      code: 'PROJECT_OWNERSHIP_REQUIRED',
      statusCode: 400,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('does not retry a versioned update without the version predicate', async () => {
    const update = vi.fn(() => createOptimisticSchemaErrorChain())
    vi.spyOn(supabase, 'from').mockReturnValue({ update } as never)

    const error = await updateProject('project-1', { name: 'Updated' }, 3).catch((caught) => caught)

    expect(error).toMatchObject({
      code: 'PROJECT_SCHEMA_INCOMPATIBLE',
      statusCode: 503,
    })
    expect(update).toHaveBeenCalledTimes(1)
  })
})
