import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

describe('project health migration cleanup', () => {
  it('keeps the canonical clean migration from recreating the old SQL health scorer', () => {
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(cleanMigration).not.toContain('CREATE OR REPLACE FUNCTION calculate_project_health_score')
    expect(cleanMigration).not.toContain('CREATE OR REPLACE FUNCTION update_project_health_on_change')
    expect(cleanMigration).not.toContain('EXECUTE FUNCTION update_project_health_on_change')
    expect(cleanMigration).not.toContain('CREATE TABLE IF NOT EXISTS project_health_details')
    expect(cleanMigration).not.toContain("CHECK (health_status IN ('优秀', '良好', '警告', '危险'))")
  })

  it('keeps initialization snapshots from recreating legacy health artifacts', () => {
    const initSnapshots = [
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
    ]

    for (const snapshotName of initSnapshots) {
      const snapshot = readMigration(snapshotName)

      expect(snapshot, snapshotName).not.toContain('CREATE OR REPLACE FUNCTION calculate_project_health_score')
      expect(snapshot, snapshotName).not.toContain('CREATE OR REPLACE FUNCTION update_project_health_on_change')
      expect(snapshot, snapshotName).not.toContain('EXECUTE FUNCTION update_project_health_on_change')
      expect(snapshot, snapshotName).not.toContain('CREATE TABLE IF NOT EXISTS project_health_details')
    }
  })

  it('adds an incremental guard migration that removes legacy health SQL artifacts from existing databases', () => {
    const cleanupName = '165_project_health_algorithm_signal_cleanup.sql'
    const cleanupPath = resolve(migrationsRoot, cleanupName)

    expect(existsSync(cleanupPath)).toBe(true)

    const cleanup = readMigration(cleanupName)
    expect(cleanup).toContain('DROP TRIGGER IF EXISTS trigger_update_health_tasks ON public.tasks')
    expect(cleanup).toContain('DROP FUNCTION IF EXISTS public.calculate_project_health_score(UUID) CASCADE')
    expect(cleanup).toContain('DROP FUNCTION IF EXISTS public.update_project_health_on_change() CASCADE')
    expect(cleanup).toContain('DROP TABLE IF EXISTS public.project_health_details CASCADE')
  })
})
