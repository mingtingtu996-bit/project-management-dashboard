import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationPath = resolve(serverRoot, 'migrations/158_delete_acceptance_timeline_candidate_seed.sql')

describe('duration forecast profile migration compatibility', () => {
  it('adds updated_at before the acceptance timeline seed cleanup updates the profile row', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    const addColumn = 'ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()'
    const updateProfile = 'UPDATE public.duration_forecast_model_profiles'

    expect(sql).toContain(addColumn)
    expect(sql.indexOf(addColumn)).toBeLessThan(sql.indexOf(updateProfile))
  })
})
