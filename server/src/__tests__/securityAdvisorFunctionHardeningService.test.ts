import { Client } from 'pg'
import { describe, expect, it } from 'vitest'

import * as subject from '../services/securityAdvisorFunctionHardeningService.js'

type RoleReadback = {
  exists: boolean
  canExecute: boolean
  hasExplicitExecuteGrant: boolean
}

type FunctionReadback = {
  functionIdentity: string
  functionExists: boolean
  searchPathIsPublic: boolean
  publicCanExecute: boolean
  roles: Record<string, RoleReadback>
}

function getConnectionParameters(connectionString: string): { host: string; user: string } {
  const client = new Client({ connectionString }) as Client & {
    connectionParameters: { host: string; user: string }
  }
  return client.connectionParameters
}

function buildReadbacks(state: 'pending' | 'hardened'): FunctionReadback[] {
  const searchPathFunctions = subject.SECURITY_ADVISOR_SEARCH_PATH_FUNCTIONS.map((functionIdentity) => ({
    functionIdentity,
    functionExists: true,
    searchPathIsPublic: state === 'hardened',
    publicCanExecute: false,
    roles: {},
  }))
  const aclFunctions = subject.SECURITY_ADVISOR_RESTRICTED_FUNCTIONS.map((functionIdentity) => ({
    functionIdentity,
    functionExists: true,
    searchPathIsPublic: false,
    publicCanExecute: state === 'pending',
    roles: {
      anon: { exists: true, canExecute: state === 'pending', hasExplicitExecuteGrant: false },
      authenticated: { exists: true, canExecute: state === 'pending', hasExplicitExecuteGrant: false },
      service_role: { exists: true, canExecute: true, hasExplicitExecuteGrant: true },
      workbuddy_runtime: { exists: true, canExecute: true, hasExplicitExecuteGrant: true },
    },
  }))
  return [...searchPathFunctions, ...aclFunctions]
}

describe('security Advisor function hardening service', () => {
  it('binds the migration connection to the exact Supabase project', () => {
    const projectRef = 'aaaaaaaaaaaaaaaaaaaa'
    expect(subject.verifySecurityAdvisorFunctionHardeningTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        `postgresql://postgres.${projectRef}:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    })).toEqual({ projectRef })
    expect(subject.verifySecurityAdvisorFunctionHardeningTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    })).toEqual({ projectRef })

    expect(() => subject.verifySecurityAdvisorFunctionHardeningTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.bbbbbbbbbbbbbbbbbbbb:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
    })).toThrow(/target project mismatch/i)
    expect(() => subject.verifySecurityAdvisorFunctionHardeningTargetIdentity({
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL: 'postgresql://postgres:secret@database.internal:5432/postgres',
    })).toThrow(/migration project.*unresolved/i)
  })

  it('rejects connection query overrides while allowing sslmode=require', () => {
    const expectedProjectRef = 'aaaaaaaaaaaaaaaaaaaa'
    const otherProjectRef = 'bbbbbbbbbbbbbbbbbbbb'
    const directOverride =
      `postgresql://postgres:secret@db.${expectedProjectRef}.supabase.co:5432/postgres`
      + `?host=db.${otherProjectRef}.supabase.co`
    const poolerOverride =
      `postgresql://postgres.${expectedProjectRef}:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`
      + `?user=postgres.${otherProjectRef}`

    expect(getConnectionParameters(directOverride).host).toBe(`db.${otherProjectRef}.supabase.co`)
    expect(getConnectionParameters(poolerOverride).user).toBe(`postgres.${otherProjectRef}`)
    for (const migrationUrl of [directOverride, poolerOverride]) {
      expect(() => subject.verifySecurityAdvisorFunctionHardeningTargetIdentity({
        SUPABASE_URL: `https://${expectedProjectRef}.supabase.co`,
        SUPABASE_MIGRATION_URL: migrationUrl,
      })).toThrow(/connection query parameter.*not allowed/i)
    }

    expect(subject.verifySecurityAdvisorFunctionHardeningTargetIdentity({
      SUPABASE_URL: `https://${expectedProjectRef}.supabase.co`,
      SUPABASE_MIGRATION_URL:
        `postgresql://postgres:secret@db.${expectedProjectRef}.supabase.co:5432/postgres?sslmode=require`,
    })).toEqual({ projectRef: expectedProjectRef })
  })

  it('accepts only the exact eight-warning catalog state before migration 334', () => {
    expect(subject.verifySecurityAdvisorFunctionHardeningState(
      buildReadbacks('pending'),
      'pending',
    )).toEqual({
      state: 'pending',
      functionCount: 5,
      mutableSearchPathCount: 2,
      advisorExecuteExposureCount: 6,
      runtimeGrantCount: 6,
    })

    const partialSearchPath = buildReadbacks('pending')
    partialSearchPath[0].searchPathIsPublic = true
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      partialSearchPath,
      'pending',
    )).toThrow(/exactly two mutable search paths/i)

    const partialAcl = buildReadbacks('pending')
    partialAcl[2].roles.anon.canExecute = false
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      partialAcl,
      'pending',
    )).toThrow(/exactly six anon\/authenticated exposures/i)
  })

  it('requires hardened search paths, closed API exposure, and retained runtime grants', () => {
    expect(subject.verifySecurityAdvisorFunctionHardeningState(
      buildReadbacks('hardened'),
      'hardened',
    )).toEqual({
      state: 'hardened',
      functionCount: 5,
      mutableSearchPathCount: 0,
      advisorExecuteExposureCount: 0,
      runtimeGrantCount: 6,
    })

    const mutableSearchPath = buildReadbacks('hardened')
    mutableSearchPath[1].searchPathIsPublic = false
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      mutableSearchPath,
      'hardened',
    )).toThrow(/search_path remains mutable/i)

    const publicOpen = buildReadbacks('hardened')
    publicOpen[2].publicCanExecute = true
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      publicOpen,
      'hardened',
    )).toThrow(/PUBLIC execute remains/i)

    const runtimeGrantMissing = buildReadbacks('hardened')
    runtimeGrantMissing[3].roles.workbuddy_runtime.hasExplicitExecuteGrant = false
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      runtimeGrantMissing,
      'hardened',
    )).toThrow(/runtime execute grant is missing/i)

    const inheritedRuntimeGrant = buildReadbacks('hardened')
    inheritedRuntimeGrant[4].roles.service_role.hasExplicitExecuteGrant = false
    expect(inheritedRuntimeGrant[4].roles.service_role.canExecute).toBe(true)
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      inheritedRuntimeGrant,
      'hardened',
    )).toThrow(/runtime execute grant is missing/i)
  })

  it('binds pending and hardened states to the migration ledger phase', () => {
    expect(subject.verifySecurityAdvisorFunctionHardeningRemediationState(
      buildReadbacks('pending'),
      'pending',
      false,
    )).toMatchObject({ state: 'pending', migrationApplied: false })
    expect(subject.verifySecurityAdvisorFunctionHardeningRemediationState(
      buildReadbacks('hardened'),
      'hardened',
      true,
    )).toMatchObject({ state: 'hardened', migrationApplied: true })

    expect(() => subject.verifySecurityAdvisorFunctionHardeningRemediationState(
      buildReadbacks('pending'),
      'pending',
      true,
    )).toThrow(/ledger.*already applied/i)
    expect(() => subject.verifySecurityAdvisorFunctionHardeningRemediationState(
      buildReadbacks('hardened'),
      'hardened',
      false,
    )).toThrow(/ledger.*not applied/i)
  })

  it('fails closed when any required function or role is missing', () => {
    const missingFunction = buildReadbacks('hardened')
    missingFunction[4].functionExists = false
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      missingFunction,
      'hardened',
    )).toThrow(/required security Advisor function is missing/i)

    const missingApiRole = buildReadbacks('hardened')
    missingApiRole[2].roles.authenticated.exists = false
    expect(() => subject.verifySecurityAdvisorFunctionHardeningState(
      missingApiRole,
      'hardened',
    )).toThrow(/required Supabase API role is missing/i)
  })
})
