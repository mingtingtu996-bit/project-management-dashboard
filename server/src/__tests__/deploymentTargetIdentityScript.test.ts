import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')
const scriptPath = resolve(workspaceRoot, 'scripts', 'check-deployment-target-identity.mjs')

function advisor(projectRef: string, environment = 'staging') {
  return JSON.stringify({
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'management_api',
    exportedAt: new Date().toISOString(),
    projectRef,
    environment,
    securityIssueCount: 0,
    issueCount: 0,
    artifactPath: 'runtime-evidence/advisor.json',
    operator: 'deployment-contract-test',
  })
}

function runIdentityCheck(migrationUrl: string, projectRef = 'stagingref', environment = 'staging') {
  return spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DEPLOY_TARGET: 'staging',
      SUPABASE_URL: 'https://stagingref.supabase.co',
      SUPABASE_MIGRATION_URL: migrationUrl,
      SUPABASE_ADVISOR_EXPORT_JSON: advisor(projectRef, environment),
    },
  })
}

describe('deployment target database identity preflight', () => {
  it('accepts matching direct and session-pooler Supabase database identities', () => {
    const direct = runIdentityCheck(
      'postgresql://postgres:secret@db.stagingref.supabase.co:5432/postgres',
    )
    expect(direct.status, direct.stderr).toBe(0)
    expect(direct.stdout).toContain('Deployment target database identity verified')

    const pooler = runIdentityCheck(
      'postgresql://postgres.stagingref:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    )
    expect(pooler.status, pooler.stderr).toBe(0)
    expect(pooler.stdout).toContain('Deployment target database identity verified')
  })

  it('fails closed when runtime, migration, or advisor targets differ', () => {
    expect(runIdentityCheck(
      'postgresql://postgres.productionref:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    ).status).not.toBe(0)
    expect(runIdentityCheck(
      'postgresql://postgres.stagingref:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
      'productionref',
    ).status).not.toBe(0)
    expect(runIdentityCheck(
      'postgresql://postgres.stagingref:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
      'stagingref',
      'production',
    ).status).not.toBe(0)
  })
})
