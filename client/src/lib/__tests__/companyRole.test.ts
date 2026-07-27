import { describe, expect, it } from 'vitest'

import { resolveCurrentCompanyRole } from '../companyRole'

describe('resolveCurrentCompanyRole', () => {
  it('uses only the resolved current-company role', () => {
    expect(resolveCurrentCompanyRole('regular')).toBe('regular')
    expect(resolveCurrentCompanyRole('company_admin')).toBe('company_admin')
  })

  it('treats explicit null current company role as no admin access', () => {
    expect(resolveCurrentCompanyRole(null)).toBe('regular')
  })

  it('fails closed when currentCompanyRole is absent', () => {
    expect(resolveCurrentCompanyRole(undefined)).toBe('regular')
  })
})
