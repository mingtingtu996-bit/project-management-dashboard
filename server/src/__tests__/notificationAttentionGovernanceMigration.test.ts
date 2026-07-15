import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd().endsWith('server') ? resolve(process.cwd(), '..') : process.cwd()

function readMigration() {
  return readFileSync(resolve(root, 'server/migrations/167_v1413_notification_attention_governance.sql'), 'utf8')
}

function readStateDueMigration() {
  return readFileSync(resolve(root, 'server/migrations/168_v1413_notification_attention_state_due_and_reconcile.sql'), 'utf8')
}

describe('notification attention governance migration', () => {
  it('enforces active dedupe by scope and touchpoint without collapsing separate touchpoints', () => {
    const migration = readMigration()

    expect(migration).toContain('DROP INDEX IF EXISTS uq_notifications_active_project_dedupe')
    expect(migration).toContain('DROP INDEX IF EXISTS uq_notifications_active_system_dedupe')
    expect(migration).toContain('uq_notifications_active_touchpoint_dedupe')
    expect(migration).toContain('COALESCE(company_id::text')
    expect(migration).toContain('COALESCE(project_id::text')
    expect(migration).toContain('scope_type')
    expect(migration).toContain('touchpoint_type')
    expect(migration).toContain("WHERE lifecycle_status = 'active'")
    expect(migration).toContain('dedupe_key IS NOT NULL')
  })

  it('adds action due, expiry-aware indexes, and reconciliation bookkeeping for attention governance', () => {
    const migration = readStateDueMigration()

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS action_due_at')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS reconciled_at')
    expect(migration).toContain('idx_notifications_attention_project_action_due')
    expect(migration).toContain('COALESCE(action_due_at, created_at)')
    expect(migration).toContain('idx_notifications_attention_active_expiry')
    expect(migration).toContain('idx_notification_user_states_visible_attention')
  })
})
