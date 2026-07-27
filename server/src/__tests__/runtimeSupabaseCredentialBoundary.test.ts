import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assertProductionApiCredentialBoundary } from '../services/runtimeCredentialBoundary.js'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('runtime Supabase credential boundary', () => {
  it('rejects service-role credentials in the production API process', () => {
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_SERVICE_KEY: 'service-role-secret',
      SUPABASE_RUNTIME_KEY: 'runtime-role-token',
    })).toThrow(/SUPABASE_SERVICE_KEY/)
  })

  it('requires a dedicated non-bypass runtime key in production', () => {
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_ANON_KEY: 'anon-key',
    })).toThrow(/SUPABASE_RUNTIME_KEY/)
    expect(() => assertProductionApiCredentialBoundary({
      NODE_ENV: 'production',
      SUPABASE_RUNTIME_KEY: 'runtime-role-token',
    })).not.toThrow()
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
