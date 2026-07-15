import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'))
const migrationPath = resolve(serverRoot, 'migrations', '260_v14232_commercial_foundation.sql')

function readMigration() {
  return readFileSync(migrationPath, 'utf8')
}

describe('v1.4.23.2-B commercial foundation migration', () => {
  it('creates isolated commercial state, audit, order, and payment event tables', () => {
    const sql = readMigration()

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.company_commercial\s*\(/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.company_commercial_audit\s*\(/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.company_commercial_orders\s*\(/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.company_commercial_payment_events\s*\(/i)
    expect(sql).toContain("billing_enabled BOOLEAN NOT NULL DEFAULT FALSE")
    expect(sql).toContain("onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    expect(sql).toContain("CHECK (plan_tier IN ('free', 'pro', 'enterprise'))")
    expect(sql).toContain("CHECK (commercial_state IN ('trial', 'active', 'suspended', 'expired', 'archived'))")
    expect(sql).toContain("'commercial_payment_event_applied'")
    expect(sql).toContain('uq_company_commercial_payment_provider_event')
    expect(sql).toContain('WHERE provider_event_id IS NOT NULL')
  })

  it('backfills existing companies with billing off and safe active-project limits', () => {
    const sql = readMigration()

    expect(sql).toMatch(/WITH active_counts AS/i)
    expect(sql).toMatch(/GREATEST\(\s*1,\s*COUNT\(p\.id\)/i)
    expect(sql).toMatch(/billing_enabled,[\s\S]*?FALSE/i)
    expect(sql).toContain('v14232_commercial_foundation_backfill')
    expect(sql).toContain('billing_default_off_existing_company_safe_quota')
  })

  it('enforces RLS, FORCE RLS, and backend runtime policies on commercial tables', () => {
    const sql = readMigration()
    for (const table of [
      'company_commercial',
      'company_commercial_audit',
      'company_commercial_orders',
      'company_commercial_payment_events',
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
      expect(sql).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
      expect(sql).toContain(`CREATE POLICY ${table}_backend_runtime_policy ON public.${table}`)
    }
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.company_commercial TO workbuddy_runtime/i)
  })
})
