import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../migrations/307_v14231_learning_asset_private_rls_helper_reconciliation.sql', import.meta.url),
  'utf8',
)
const rollback = readFileSync(
  new URL('../../migrations/rollback/307_v14231_learning_asset_private_rls_helper_reconciliation.sql', import.meta.url),
  'utf8',
)

describe('learning asset private RLS helper reconciliation migration', () => {
  it('keeps authenticated learning-asset policies on the private membership helper', () => {
    expect(migration).toContain('workbuddy_private.is_active_company_member')
    expect(migration).not.toMatch(/AND public\.is_active_company_member/)
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC')
    expect(migration).toContain("ARRAY['anon', 'authenticated']")
    expect(migration).toContain('duration_experience_samples_auth_read_policy')
    expect(migration).toContain('duration_experience_samples_auth_write_policy')
    expect(migration).toContain('project_productivity_calibration_select_member')
    expect(migration).toContain('duration_context_policy_canary_candidate_select_member')
    expect(migration).toContain('duration_context_policy_version_select_member')
    expect(migration).not.toContain('SECURITY DEFINER')
    expect(migration).not.toContain('BYPASSRLS')
  })

  it('provides an explicit emergency rollback to the prior public-helper policy shape', () => {
    expect(rollback).toContain('GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO authenticated')
    expect(rollback).toContain('public.is_active_company_member')
    expect(rollback).toContain('duration_experience_samples_auth_write_policy')
  })
})
