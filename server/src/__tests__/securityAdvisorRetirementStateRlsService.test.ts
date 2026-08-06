import { describe, expect, it } from 'vitest'

import * as subject from '../services/securityAdvisorRetirementStateRlsService.js'

function buildReadback(overrides: Partial<subject.SecurityAdvisorRetirementStateRlsReadback> = {}) {
  return {
    tableExists: true,
    rlsEnabled: true,
    forceRls: true,
    policyExists: true,
    policyName: subject.SECURITY_ADVISOR_RETIREMENT_STATE_RLS_POLICY_NAME,
    usingExpression: '(false)',
    withCheckExpression: '(false)',
    ...overrides,
  }
}

describe('retirement-state RLS readback', () => {
  it('accepts only the exact explicit deny-all policy state', () => {
    expect(subject.verifySecurityAdvisorRetirementStateRls(
      buildReadback(),
      'hardened',
      true,
    )).toMatchObject({
      state: 'hardened',
      migrationApplied: true,
    })

    for (const overrides of [
      { tableExists: false },
      { rlsEnabled: false },
      { forceRls: false },
      { policyExists: false },
      { usingExpression: '(true)' },
      { withCheckExpression: '(true)' },
    ]) {
      expect(() => subject.verifySecurityAdvisorRetirementStateRls(
        buildReadback(overrides),
        'hardened',
        true,
      )).toThrow()
    }
  })

  it('fails closed when the migration ledger does not match the readback state', () => {
    expect(() => subject.verifySecurityAdvisorRetirementStateRls(
      buildReadback(),
      'hardened',
      false,
    )).toThrow(/ledger/i)
  })
})
