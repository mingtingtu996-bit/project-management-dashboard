import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')
const migrationName = '169_v1419_warning_impact_signal_runtime_governance.sql'

function readMigration() {
  return readFileSync(resolve(migrationsRoot, migrationName), 'utf8')
}

describe('warning impact signal runtime governance migration', () => {
  it('creates runtime governance tables for coverage, threshold candidates, confirmations, and rule quality events', () => {
    expect(existsSync(resolve(migrationsRoot, migrationName))).toBe(true)

    const migration = readMigration()

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.warning_policy_configs')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.warning_coverage_snapshots')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.warning_threshold_candidates')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.warning_owner_confirmations')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.algorithm_seed_quality_events')
    expect(migration).toContain('idx_warning_policy_configs_active_project')
    expect(migration).toContain('idx_warning_owner_confirmations_pending')
    expect(migration).toContain('feedback_status TEXT')
    expect(migration).toContain('feedback_applied_at TIMESTAMPTZ')
    expect(migration).toContain('idx_warning_owner_confirmations_feedback_pending')
    expect(migration).toContain('idx_algorithm_seed_quality_events_rule')
  })
})
