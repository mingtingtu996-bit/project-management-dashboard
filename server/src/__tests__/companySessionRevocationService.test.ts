import { describe, expect, it, vi } from 'vitest'

import { isCompanySessionRevoked } from '../auth/companySession.js'

describe('company-scoped session revocation', () => {
  it('revokes only tokens issued at or before the company membership cutoff', async () => {
    const queryExec = vi.fn(async () => ({
      rows: [{ session_revoked_at: '2026-07-11T10:00:00.500Z' }],
      rowCount: 1,
    }))

    await expect(isCompanySessionRevoked({
      userId: 'user-1',
      companyId: 'company-a',
      tokenIssuedAtSeconds: Date.parse('2026-07-11T10:00:00.000Z') / 1000,
      queryExec,
    })).resolves.toBe(true)

    await expect(isCompanySessionRevoked({
      userId: 'user-1',
      companyId: 'company-b',
      tokenIssuedAtSeconds: Date.parse('2026-07-11T10:00:02.000Z') / 1000,
      queryExec,
    })).resolves.toBe(false)
  })

  it('fails closed when a scoped token has no trustworthy issue time', async () => {
    const queryExec = vi.fn()

    await expect(isCompanySessionRevoked({
      userId: 'user-1',
      companyId: 'company-a',
      tokenIssuedAtSeconds: undefined,
      queryExec,
    })).resolves.toBe(true)
    expect(queryExec).not.toHaveBeenCalled()
  })
})
