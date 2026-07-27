import { describe, expect, it } from 'vitest'

import { generateTemporaryPassword, validatePasswordStrength } from '../auth/password.js'

describe('authentication password security', () => {
  it('generates a temporary password that satisfies the normal password policy', () => {
    const password = generateTemporaryPassword()

    expect(password).toHaveLength(16)
    expect(validatePasswordStrength(password)).toEqual({ valid: true, errors: [] })
    expect(password).toMatch(/[A-Z]/)
    expect(password).toMatch(/[a-z]/)
    expect(password).toMatch(/[0-9]/)
    expect(password).toMatch(/[^A-Za-z0-9]/)
  })

  it('does not generate a deterministic sequence when Math.random is replaced', () => {
    const originalRandom = Math.random
    Math.random = () => 0
    try {
      const first = generateTemporaryPassword()
      const second = generateTemporaryPassword()
      expect(first).not.toBe(second)
    } finally {
      Math.random = originalRandom
    }
  })
})
