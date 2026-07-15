import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('persistent job schedule migration contract', () => {
  it('creates a fenced runtime-only scheduled slot ledger', () => {
    const migration = readFileSync(
      resolve(workspaceRoot, 'server/migrations/297_persistent_scheduled_job_slots.sql'),
      'utf8',
    )

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.scheduled_job_slots')
    expect(migration).toContain('UNIQUE (job_name, scheduled_for)')
    expect(migration).toContain("CHECK (status IN ('running', 'succeeded', 'failed'))")
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('scheduled_job_slots_runtime_policy')
    expect(migration).toContain('TO workbuddy_runtime')
  })
})
