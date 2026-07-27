import { describe, expect, it } from 'vitest'
import { Client } from 'pg'

import * as subject from '../services/commercialTriggerRpcAclRemediationService.js'

type RoleReadback = {
  exists: boolean
  canExecute: boolean
}

type FunctionReadback = {
  functionIdentity: string
  functionExists: boolean
  publicCanExecute: boolean
  roles: Record<string, RoleReadback>
}

const functionIdentities = [
  'public.workbuddy_initialize_company_commercial()',
  'public.workbuddy_meter_company_projects()',
]

function getConnectionParameters(connectionString: string): { host: string; user: string } {
  const client = new Client({ connectionString }) as Client & {
    connectionParameters: { host: string; user: string }
  }
  return client.connectionParameters
}

function buildReadback(state: 'vulnerable' | 'hardened'): FunctionReadback[] {
  return functionIdentities.map((functionIdentity) => ({
    functionIdentity,
    functionExists: true,
    publicCanExecute: state === 'vulnerable',
    roles: {
      anon: { exists: true, canExecute: state === 'vulnerable' },
      authenticated: { exists: true, canExecute: state === 'vulnerable' },
      service_role: { exists: true, canExecute: true },
      workbuddy_runtime: { exists: true, canExecute: true },
      workbuddy_runtime_login: { exists: true, canExecute: true },
    },
  }))
}

describe('commercial trigger RPC ACL remediation service', () => {
  it('binds the remediation migration connection to the exact Supabase project', () => {
    const projectRef = 'aaaaaaaaaaaaaaaaaaaa'
    expect(subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        `postgresql://postgres.${projectRef}:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    })).toEqual({ projectRef })
    expect(subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    })).toEqual({ projectRef })

    expect(() => subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.bbbbbbbbbbbbbbbbbbbb:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
    })).toThrow(/target project mismatch/i)
    expect(() => subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL: 'postgresql://postgres:secret@database.internal:5432/postgres',
    })).toThrow(/migration project.*unresolved/i)
  })

  it('rejects direct and pooler query overrides that node-postgres treats as the effective target', () => {
    const expectedProjectRef = 'aaaaaaaaaaaaaaaaaaaa'
    const otherProjectRef = 'bbbbbbbbbbbbbbbbbbbb'
    const directOverride =
      `postgresql://postgres:secret@db.${expectedProjectRef}.supabase.co:5432/postgres`
      + `?host=db.${otherProjectRef}.supabase.co`
    const poolerOverride =
      `postgresql://postgres.${expectedProjectRef}:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
      + `?user=postgres.${otherProjectRef}`

    expect(getConnectionParameters(directOverride).host)
      .toBe(`db.${otherProjectRef}.supabase.co`)
    expect(getConnectionParameters(poolerOverride).user)
      .toBe(`postgres.${otherProjectRef}`)

    for (const migrationUrl of [directOverride, poolerOverride]) {
      expect(() => subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
        SUPABASE_URL: `https://${expectedProjectRef}.supabase.co`,
        SUPABASE_MIGRATION_URL: migrationUrl,
      })).toThrow(/connection query parameter.*not allowed/i)
    }
  })

  it('rejects identity and transport overrides while allowing the runner-normalized sslmode declaration', () => {
    const projectRef = 'aaaaaaaaaaaaaaaaaaaa'
    const baseUrl = `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`

    for (const query of [
      'hostaddr=203.0.113.25',
      'port=6543',
      'database=other',
      'password=other',
      'ssl=false',
      'sslcert=client.crt',
      'sslkey=client.key',
      'sslrootcert=root.crt',
      'options=-csearch_path%3Dother',
    ]) {
      expect(() => subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
        SUPABASE_URL: `https://${projectRef}.supabase.co`,
        SUPABASE_MIGRATION_URL: `${baseUrl}?${query}`,
      }), query).toThrow(/connection query parameter.*not allowed/i)
    }

    expect(subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL: `${baseUrl}?sslmode=require`,
    })).toEqual({ projectRef })
    for (const invalidSslMode of [
      'sslmode=disable',
      'sslmode=verify-full',
      'sslmode=require&sslmode=require',
    ]) {
      expect(() => subject.verifyCommercialTriggerRpcRemediationTargetIdentity({
        SUPABASE_URL: `https://${projectRef}.supabase.co`,
        SUPABASE_MIGRATION_URL: `${baseUrl}?${invalidSslMode}`,
      }), invalidSslMode).toThrow(/sslmode/i)
    }
  })

  it('accepts only the exact four-role Advisor exposure as the bootstrap precondition', () => {
    expect(subject.verifyCommercialTriggerRpcAclState(buildReadback('vulnerable'), 'vulnerable')).toEqual({
      state: 'vulnerable',
      functionCount: 2,
      advisorExposureCount: 4,
      runtimeGrantCount: 6,
    })

    const partial = buildReadback('vulnerable')
    partial[0].roles.anon.canExecute = false
    expect(() => subject.verifyCommercialTriggerRpcAclState(partial, 'vulnerable'))
      .toThrow(/exactly four anon\/authenticated exposures/i)
  })

  it('binds vulnerable and hardened ACL states to the migration ledger phase', () => {
    expect(subject.verifyCommercialTriggerRpcAclRemediationState(
      buildReadback('vulnerable'),
      'vulnerable',
      false,
    )).toMatchObject({ state: 'vulnerable', migrationApplied: false })
    expect(subject.verifyCommercialTriggerRpcAclRemediationState(
      buildReadback('hardened'),
      'hardened',
      true,
    )).toMatchObject({ state: 'hardened', migrationApplied: true })

    expect(() => subject.verifyCommercialTriggerRpcAclRemediationState(
      buildReadback('vulnerable'),
      'vulnerable',
      true,
    )).toThrow(/ledger.*already applied/i)
    expect(() => subject.verifyCommercialTriggerRpcAclRemediationState(
      buildReadback('hardened'),
      'hardened',
      false,
    )).toThrow(/ledger.*not applied/i)
  })

  it('requires both API roles and PUBLIC to be closed after migration 308', () => {
    expect(subject.verifyCommercialTriggerRpcAclState(buildReadback('hardened'), 'hardened')).toEqual({
      state: 'hardened',
      functionCount: 2,
      advisorExposureCount: 0,
      runtimeGrantCount: 6,
    })

    const publicOpen = buildReadback('hardened')
    publicOpen[1].publicCanExecute = true
    expect(() => subject.verifyCommercialTriggerRpcAclState(publicOpen, 'hardened'))
      .toThrow(/PUBLIC execute remains/i)

    const inheritedApiGrant = buildReadback('hardened')
    inheritedApiGrant[0].roles.authenticated.canExecute = true
    expect(() => subject.verifyCommercialTriggerRpcAclState(inheritedApiGrant, 'hardened'))
      .toThrow(/anon\/authenticated execute remains/i)
  })

  it('fails closed when a function is missing or an existing runtime role loses execute', () => {
    const missingFunction = buildReadback('hardened')
    missingFunction[0].functionExists = false
    expect(() => subject.verifyCommercialTriggerRpcAclState(missingFunction, 'hardened'))
      .toThrow(/required commercial trigger function is missing/i)

    const missingRuntimeGrant = buildReadback('hardened')
    missingRuntimeGrant[0].roles.workbuddy_runtime.canExecute = false
    expect(() => subject.verifyCommercialTriggerRpcAclState(missingRuntimeGrant, 'hardened'))
      .toThrow(/runtime execute grant is missing/i)
  })
})
