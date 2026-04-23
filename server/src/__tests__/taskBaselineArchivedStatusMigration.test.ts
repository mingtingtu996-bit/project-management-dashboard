import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('task baseline archived status migration', () => {
  it('extends task_baselines status constraint to include archived', () => {
    const migration = readFileSync(
      resolve(serverRoot, 'migrations', '090_allow_archived_task_baseline_status.sql'),
      'utf8',
    )

    expect(migration).toContain("ALTER TABLE public.task_baselines")
    expect(migration).toContain("'pending_realign', 'archived'")
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'")
  })

  it('keeps full migration snapshots aligned with archived baseline status', () => {
    const snapshotFiles = [
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
    ]

    for (const filename of snapshotFiles) {
      const migration = readFileSync(resolve(serverRoot, 'migrations', filename), 'utf8')
      expect(migration).toContain("CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived'))")
    }
  })
})
