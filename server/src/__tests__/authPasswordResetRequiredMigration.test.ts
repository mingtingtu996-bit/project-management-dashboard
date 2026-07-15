import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('password reset required migration', () => {
  it('adds a durable first-login rotation flag without rewriting existing users', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'migrations', '280_auth_password_reset_required.sql'),
      'utf8',
    )

    expect(migration).toMatch(/ALTER TABLE public\.users[\s\S]*ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false/i)
    expect(migration).toMatch(/COMMENT ON COLUMN public\.users\.password_reset_required/i)
    expect(migration).not.toMatch(/UPDATE public\.users/i)
  })
})
