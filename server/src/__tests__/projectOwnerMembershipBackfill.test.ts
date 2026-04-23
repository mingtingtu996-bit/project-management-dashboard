import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = path.resolve(__dirname, '..', '..')

describe('project owner membership reconciliation', () => {
  it('backfills owner rows into project_members for existing projects', () => {
    const migration = readFileSync(
      path.resolve(serverRoot, 'migrations', '101_backfill_project_owner_members.sql'),
      'utf8',
    )

    expect(migration).toContain('UPDATE public.project_members AS pm')
    expect(migration).toContain("permission_level = 'owner'")
    expect(migration).toContain('INSERT INTO public.project_members')
    expect(migration).toContain('AND NOT EXISTS (')
  })

  it('keeps project creation on the owner membership write path', () => {
    const source = readFileSync(path.resolve(serverRoot, 'src', 'services', 'dbService.ts'), 'utf8')

    expect(source).toContain("from('project_members')")
    expect(source).toContain("permission_level: 'owner'")
    expect(source).not.toContain("role: 'owner'")
  })
})
