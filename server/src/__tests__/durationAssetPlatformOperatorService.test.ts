import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  executeSQL: vi.fn(),
}))

vi.mock('../services/dbService.js', () => ({ executeSQL: mocks.executeSQL }))

const { isDurationAssetGovernanceOperator } = await import('../services/durationAssetPlatformOperatorService.js')

describe('duration asset platform operator service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requires the dedicated platform role and never consults legacy global_role', async () => {
    mocks.executeSQL.mockResolvedValueOnce([{ is_operator: true }])

    await expect(isDurationAssetGovernanceOperator('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')).resolves.toBe(true)

    const [sql, params] = mocks.executeSQL.mock.calls[0]
    expect(sql).toContain("platform_role = 'duration_governance_operator'")
    expect(sql).not.toContain('global_role')
    expect(sql).not.toContain('company_members')
    expect(params).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'])
  })

  it('fails closed without a user id or matching role', async () => {
    await expect(isDurationAssetGovernanceOperator(null)).resolves.toBe(false)
    expect(mocks.executeSQL).not.toHaveBeenCalled()

    await expect(isDurationAssetGovernanceOperator('not-a-uuid')).resolves.toBe(false)
    expect(mocks.executeSQL).not.toHaveBeenCalled()

    mocks.executeSQL.mockResolvedValueOnce([{ is_operator: false }])
    await expect(isDurationAssetGovernanceOperator('company-admin-1')).resolves.toBe(false)
  })
})
