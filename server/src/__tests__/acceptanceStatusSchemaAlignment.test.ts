import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = path.resolve(__dirname, '..', '..')

describe('acceptance status schema alignment', () => {
  it('keeps the live reconciliation migration on the canonical acceptance status model', () => {
    const migration = readFileSync(
      path.resolve(serverRoot, 'migrations', '100_align_acceptance_status_model.sql'),
      'utf8',
    )

    expect(migration).toContain("WHEN 'not_started' THEN 'draft'")
    expect(migration).toContain("WHEN 'in_acceptance' THEN 'inspecting'")
    expect(migration).toContain("WHEN 'rectification' THEN 'rectifying'")
    expect(migration).toContain("WHEN 'recorded' THEN 'archived'")
    expect(migration).toContain("'ready_to_submit'")
    expect(migration).toContain("'rectifying'")
    expect(migration).toContain("'archived'")
  })

  it('keeps the full snapshots on the canonical acceptance constraint set', () => {
    const snapshotFiles = [
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
    ]

    for (const filename of snapshotFiles) {
      const snapshot = readFileSync(path.resolve(serverRoot, 'migrations', filename), 'utf8')
      expect(snapshot).toContain("'draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'")
      expect(snapshot).not.toContain("'not_started', 'preparing', 'submitted', 'in_acceptance', 'rectification', 'passed', 'recorded'")
    }
  })
})
