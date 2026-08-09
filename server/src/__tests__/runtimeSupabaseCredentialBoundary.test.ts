import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assertProductionApiCredentialBoundary } from '../services/runtimeCredentialBoundary.js'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function buildRuntimeJwt(role: string, exp = Math.floor(Date.now() / 1000) + 3600) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, exp, iss: 'supabase' })}.${Buffer.from('test-signature').toString('base64url')}`
}

describe('runtime Supabase credential boundary', () => {
  it('rejects service-role credentials in the production API process', () => {
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_SERVICE_KEY: 'service-role-secret',
      SUPABASE_RUNTIME_KEY: buildRuntimeJwt('workbuddy_runtime'),
    })).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('requires a dedicated non-bypass runtime key in production', () => {
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_ANON_KEY: 'anon-key',
    })).toThrow(/SUPABASE_RUNTIME_KEY/)
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_RUNTIME_KEY: buildRuntimeJwt('workbuddy_runtime'),
    })).not.toThrow()
  })

  it.each(['anon', 'authenticated', 'service_role', 'workbuddy_runtime_login'])(
    'rejects the %s PostgREST role for the backend runtime key',
    (role) => {
      expect(() => assertProductionApiCredentialBoundary({
        NODE_ENV: 'production',
        SUPABASE_RUNTIME_KEY: buildRuntimeJwt(role),
      })).toThrow(/workbuddy_runtime/)
    },
  )

  it('rejects malformed and expired backend runtime JWTs', () => {
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_RUNTIME_KEY: 'not-a-jwt',
    })).toThrow(/JWT/)
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_RUNTIME_KEY: buildRuntimeJwt('workbuddy_runtime', Math.floor(Date.now() / 1000) - 1),
    })).toThrow(/expired/)
  })

  it('rejects invalid compact JWT header and signature segments before reading claims', () => {
    const [, payload] = buildRuntimeJwt('workbuddy_runtime').split('.')

    for (const runtimeKey of [
      `!.${payload}.signature`,
      `header.${payload}.!`,
    ]) {
      expect(() => assertProductionApiCredentialBoundary({
        NODE_ENV: 'production',
        SUPABASE_RUNTIME_KEY: runtimeKey,
      })).toThrow(/compact JWT/)
    }
  })

  it('keeps service-role keys out of general runtime clients and deployment examples', () => {
    const dbService = readFileSync(resolve(workspaceRoot, 'server/src/services/dbService.ts'), 'utf8')
    const registerRoute = readFileSync(resolve(workspaceRoot, 'server/src/routes/auth-register.ts'), 'utf8')
    const healthRoute = readFileSync(resolve(workspaceRoot, 'server/src/routes/health-score.ts'), 'utf8')
    const envExample = readFileSync(resolve(workspaceRoot, 'deploy/env/server.production.example'), 'utf8')
    const deployScript = readFileSync(resolve(workspaceRoot, 'scripts/deploy-lighthouse-server.sh'), 'utf8')

    expect(dbService).not.toContain('process.env.SUPABASE_SERVICE_KEY')
    expect(registerRoute).not.toContain('SUPABASE_SERVICE_KEY')
    expect(healthRoute).not.toContain('SUPABASE_SERVICE_KEY')
    expect(envExample).not.toMatch(/^SUPABASE_SERVICE_KEY=/m)
    expect(envExample).toMatch(/^SUPABASE_RUNTIME_KEY=/m)
    expect(deployScript).toContain('SUPABASE_SERVICE_KEY is forbidden in the API runtime env file')
  })
})
