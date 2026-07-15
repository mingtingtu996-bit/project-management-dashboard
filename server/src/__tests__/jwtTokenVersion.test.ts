import jwt from 'jsonwebtoken'
import { describe, expect, it } from 'vitest'

import { generateToken } from '../auth/jwt.js'

describe('JWT token version payload', () => {
  it('includes the current user token version for session revocation checks', () => {
    const token = generateToken({
      id: '00000000-0000-4000-8000-000000000001',
      username: 'alice',
      display_name: 'Alice',
      globalRole: 'regular',
      tokenVersion: 7,
    })

    const decoded = jwt.decode(token) as Record<string, unknown>

    expect(decoded.tokenVersion).toBe(7)
  })
})
