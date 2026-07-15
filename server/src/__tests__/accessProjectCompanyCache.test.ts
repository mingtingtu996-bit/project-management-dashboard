import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
}))

describe('project company id cache', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('deduplicates concurrent project company lookups for the same project', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001'
    const companyId = '00000000-0000-4000-8000-000000000002'
    mocks.query.mockResolvedValue({
      rows: [{ company_id: companyId }],
    })

    const { getProjectCompanyId, clearProjectCompanyIdCache } = await import('../auth/access.js')
    clearProjectCompanyIdCache()

    const results = await Promise.all([
      getProjectCompanyId(projectId),
      getProjectCompanyId(projectId),
      getProjectCompanyId(projectId),
    ])

    expect(results).toEqual([companyId, companyId, companyId])
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.query).toHaveBeenCalledWith(
      'SELECT company_id FROM public.projects WHERE id = $1 LIMIT 1',
      [projectId],
    )
  })

  it('can clear one cached project without flushing other projects', async () => {
    const projectA = '00000000-0000-4000-8000-000000000001'
    const projectB = '00000000-0000-4000-8000-000000000003'
    mocks.query
      .mockResolvedValueOnce({ rows: [{ company_id: '00000000-0000-4000-8000-000000000011' }] })
      .mockResolvedValueOnce({ rows: [{ company_id: '00000000-0000-4000-8000-000000000012' }] })
      .mockResolvedValueOnce({ rows: [{ company_id: '00000000-0000-4000-8000-000000000013' }] })

    const { getProjectCompanyId, clearProjectCompanyIdCache } = await import('../auth/access.js')
    clearProjectCompanyIdCache()

    await getProjectCompanyId(projectA)
    await getProjectCompanyId(projectB)
    clearProjectCompanyIdCache(projectA)

    await getProjectCompanyId(projectA)
    await getProjectCompanyId(projectB)

    expect(mocks.query).toHaveBeenCalledTimes(3)
  })

  it('does not query project company scope when the permission system is disabled', async () => {
    const previous = process.env.DISABLE_PERMISSION_SYSTEM
    process.env.DISABLE_PERMISSION_SYSTEM = 'true'
    try {
      const { getProjectCompanyId, clearProjectCompanyIdCache } = await import('../auth/access.js')
      clearProjectCompanyIdCache()

      await expect(getProjectCompanyId('00000000-0000-4000-8000-000000000001')).resolves.toBeNull()
      expect(mocks.query).not.toHaveBeenCalled()
    } finally {
      if (previous == null) {
        delete process.env.DISABLE_PERMISSION_SYSTEM
      } else {
        process.env.DISABLE_PERMISSION_SYSTEM = previous
      }
    }
  })
})

describe('visible project ids cache', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('deduplicates repeated visible project lookups for the same user, role, and company scope', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const companyId = '00000000-0000-4000-8000-000000000002'
    const projectA = '00000000-0000-4000-8000-000000000011'
    const projectB = '00000000-0000-4000-8000-000000000012'
    mocks.query
      .mockResolvedValueOnce({ rows: [{ company_id: companyId, role: 'company_admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: projectA }, { id: projectB }] })

    const { getVisibleProjectIds, clearVisibleProjectIdsCache } = await import('../auth/access.js')
    clearVisibleProjectIdsCache()

    await expect(getVisibleProjectIds(userId, 'company_admin', companyId)).resolves.toEqual([projectA, projectB])
    await expect(getVisibleProjectIds(userId, 'company_admin', companyId)).resolves.toEqual([projectA, projectB])

    expect(mocks.query).toHaveBeenCalledTimes(2)
  })

  it('does not share visible project cache entries across company scopes', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const companyA = '00000000-0000-4000-8000-000000000002'
    const companyB = '00000000-0000-4000-8000-000000000003'
    const projectA = '00000000-0000-4000-8000-000000000011'
    const projectB = '00000000-0000-4000-8000-000000000012'
    mocks.query
      .mockResolvedValueOnce({ rows: [{ company_id: companyA, role: 'company_admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: projectA }] })
      .mockResolvedValueOnce({ rows: [{ company_id: companyB, role: 'company_admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: projectB }] })

    const { getVisibleProjectIds, clearVisibleProjectIdsCache } = await import('../auth/access.js')
    clearVisibleProjectIdsCache()

    await expect(getVisibleProjectIds(userId, 'company_admin', companyA)).resolves.toEqual([projectA])
    await expect(getVisibleProjectIds(userId, 'company_admin', companyB)).resolves.toEqual([projectB])
    await expect(getVisibleProjectIds(userId, 'company_admin', companyA)).resolves.toEqual([projectA])

    expect(mocks.query).toHaveBeenCalledTimes(4)
  })
})
