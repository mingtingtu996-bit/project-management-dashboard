import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationPath = resolve(serverRoot, 'migrations/173_v14221_project_metadata_column.sql')

describe('v1.4.22.1 project wizard metadata migration', () => {
  it('adds the projects.metadata column used by wizard draft persistence', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE IF EXISTS public.projects')
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb")
    expect(sql).toContain('NOTIFY pgrst')
  })
})
