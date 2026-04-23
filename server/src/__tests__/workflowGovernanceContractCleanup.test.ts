import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('workflow governance contract cleanup', () => {
  it('locks the mainline migration and full snapshots to the unified certificate and acceptance fields', () => {
    const mainlineMigration = readServerFile('migrations', '093a_mainline_c_drawings_licenses_hardening.sql')
    const cleanupMigration = readServerFile('migrations', '095_unify_governance_contract_fields.sql')
    const snapshotFiles = [
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
    ]
    const snapshots = snapshotFiles.map((name) => ({ name, source: readServerFile('migrations', name) }))

    expect(mainlineMigration).toContain("certificate_no = COALESCE(NULLIF(certificate_no, ''), NULLIF(document_no, ''))")
    expect(mainlineMigration).not.toContain("document_no = COALESCE(NULLIF(document_no, ''), NULLIF(certificate_no, ''))")

    expect(cleanupMigration).toContain('DROP COLUMN document_no')
    expect(cleanupMigration).toContain('dependency_kind')
    expect(cleanupMigration).toContain('is_required BOOLEAN NOT NULL DEFAULT TRUE')
    expect(cleanupMigration).toContain('is_satisfied BOOLEAN NOT NULL DEFAULT FALSE')

    for (const snapshot of snapshots) {
      expect(snapshot.source, snapshot.name).not.toContain('document_no TEXT')
      expect(snapshot.source, snapshot.name).not.toContain('dependency_type TEXT NOT NULL DEFAULT \'strong\'')
      expect(snapshot.source, snapshot.name).not.toContain('dependency_type VARCHAR(20)')
      expect(snapshot.source, snapshot.name).toContain("dependency_kind TEXT NOT NULL DEFAULT 'hard'")
      expect(snapshot.source, snapshot.name).toContain('is_required BOOLEAN NOT NULL DEFAULT TRUE')
      expect(snapshot.source, snapshot.name).toContain('is_satisfied BOOLEAN NOT NULL DEFAULT FALSE')
    }
  })

  it('keeps governance scene notifications on the planning-governance chain and syncs them from the notification center', () => {
    const governanceService = readServerFile('src', 'services', 'planningGovernanceService.ts')
    const notificationsRoute = readServerFile('src', 'routes', 'notifications.ts')

    expect(governanceService).toContain('mapping_orphan_pointer')
    expect(governanceService).toContain("return 'planning_mapping_orphan'")
    expect(governanceService).toContain('milestone_blocked')
    expect(governanceService).toContain('milestone_missing_data')
    expect(governanceService).toContain('milestone_needs_attention')
    expect(governanceService).toContain('persistProjectGovernanceNotifications')

    expect(notificationsRoute).toContain('planningGovernanceService.persistProjectGovernanceNotifications(projectId)')
  })
})
