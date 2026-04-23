import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('098_reconcile_live_drawing_package_model', () => {
  it('creates the normalized drawing package tables for live environments', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../migrations/098_reconcile_live_drawing_package_model.sql',
    )
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.drawing_packages')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.drawing_package_items')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.drawing_versions')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.drawing_review_rules')
    expect(migration).toContain('ALTER TABLE public.construction_drawings')
    expect(migration).toContain("NOTIFY pgrst, 'reload schema';")
  })
})
