import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'migrations/291_commercial_atomicity_and_entitlements.sql')
const rlsReconciliationPath = resolve(process.cwd(), 'migrations/296_v14231_commercial_metering_private_rls_helper.sql')
const sql = readFileSync(migrationPath, 'utf8')

describe('commercial atomicity and entitlement migration', () => {
  it('defines the authoritative free, starter, pro and group tier vocabulary', () => {
    expect(sql).toContain("plan_tier IN ('free', 'starter', 'pro', 'group')")
    expect(sql).toContain("WHEN 'starter' THEN 2")
    expect(sql).toContain("WHEN 'pro' THEN 5")
  })

  it('creates a platform-only commercial operator role that tenants cannot self-assign', () => {
    expect(sql).toContain('platform_role')
    expect(sql).toContain("commercial_operator")
    expect(sql).toContain("DEFAULT 'none'")
  })

  it('initializes commercial state on company creation and records durable project metering', () => {
    expect(sql).toContain('workbuddy_initialize_company_commercial')
    expect(sql).toContain('AFTER INSERT ON public.companies')
    expect(sql).toContain('company_commercial_metering')
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.projects')
  })

  it('handles DELETE trigger rows without reading NEW and returns the correct trigger record', () => {
    expect(sql).toMatch(/IF TG_OP = 'DELETE' THEN[\s\S]*affected_company_id := OLD\.company_id/)
    expect(sql).toMatch(/IF TG_OP = 'DELETE' THEN[\s\S]*RETURN OLD;[\s\S]*END IF;[\s\S]*RETURN NEW;/)
    expect(sql).not.toContain('COALESCE(NEW.company_id, OLD.company_id)')
    expect(sql).not.toContain('RETURN COALESCE(NEW, OLD)')
  })

  it('reconciles commercial metering reads to the private membership helper after the public RPC lockdown', () => {
    const reconciliation = readFileSync(rlsReconciliationPath, 'utf8')
    expect(reconciliation).toContain('DROP POLICY IF EXISTS company_commercial_metering_select_policy')
    expect(reconciliation).toContain('workbuddy_private.is_active_company_member')
    expect(reconciliation).not.toContain('public.is_active_company_member')
  })
})
