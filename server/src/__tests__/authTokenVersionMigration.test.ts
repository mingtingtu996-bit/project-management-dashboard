import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : 'server')

describe('auth token version migration', () => {
  it('adds a user token-version revocation column with a non-negative constraint', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations', '219_v14231_user_auth_token_version.sql'),
      'utf8',
    )

    expect(migration).toMatch(/ALTER TABLE public\.users\s+ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0/i)
    expect(migration).toMatch(/users_auth_token_version_non_negative/i)
    expect(migration).toMatch(/CHECK \(auth_token_version >= 0\)/i)
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS idx_users_auth_token_version/i)
  })
})
