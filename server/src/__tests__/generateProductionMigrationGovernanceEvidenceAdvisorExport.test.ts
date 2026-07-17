import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  areRuntimeAndMigrationDatabaseUrlsSeparated,
  readVerifiedAdvisorExport,
  type AdvisorUiOrApiExportEvidence,
} from '../scripts/generate-production-migration-governance-evidence.js'

const tempRoots: string[] = []

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'advisor-export-evidence-'))
  tempRoots.push(root)
  return root
}

function writeAdvisorExport(input: unknown) {
  const root = createTempRoot()
  const file = join(root, 'advisor-export.json')
  writeFileSync(file, `${JSON.stringify(input, null, 2)}\n`, 'utf8')
  return file
}

function validAdvisorExport(overrides: Partial<AdvisorUiOrApiExportEvidence> = {}): AdvisorUiOrApiExportEvidence {
  return {
    schemaVersion: 'workbuddy-supabase-advisor-ui-or-api-export/v1',
    source: 'management_api',
    exportedAt: new Date().toISOString(),
    projectRef: 'xemqmqpifsstkovbkatp',
    environment: 'staging',
    securityIssueCount: 0,
    issueCount: 1051,
    artifactPath: 'project-testing/reports/release-v1.4.24-20260702-125254/supabase-advisor-management-api-export.json',
    operator: 'v1424-g2-advisor-export',
    ...overrides,
  }
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('Advisor UI/API export evidence', () => {
  it('requires runtime and migration URLs to target the same project with different database roles', () => {
    expect(areRuntimeAndMigrationDatabaseUrlsSeparated({
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.stagingref:migration-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
      RUNTIME_DATABASE_URL:
        'postgresql://workbuddy_runtime_login.stagingref:runtime-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    })).toBe(true)

    expect(areRuntimeAndMigrationDatabaseUrlsSeparated({
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.stagingref:migration-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    })).toBe(false)
    expect(areRuntimeAndMigrationDatabaseUrlsSeparated({
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.stagingref:migration-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
      RUNTIME_DATABASE_URL:
        'postgresql://postgres.stagingref:runtime-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    })).toBe(false)
    expect(areRuntimeAndMigrationDatabaseUrlsSeparated({
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.stagingref:migration-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
      RUNTIME_DATABASE_URL:
        'postgresql://workbuddy_runtime_login.productionref:runtime-secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
    })).toBe(false)
  })

  it('accepts a current Supabase Management API export with zero security issues', async () => {
    const file = writeAdvisorExport(validAdvisorExport())

    const result = await readVerifiedAdvisorExport(file)

    expect(result).toEqual(expect.objectContaining({
      source: 'management_api',
      securityIssueCount: 0,
      pass: true,
      artifactPath: expect.stringContaining('supabase-advisor-management-api-export.json'),
    }))
  })

  it('rejects Supabase CLI advisor evidence as a closeout export source', async () => {
    const file = writeAdvisorExport({
      ...validAdvisorExport(),
      schemaVersion: 'workbuddy-supabase-db-advisors-evidence/v1',
      source: 'cli',
      boundary: {
        advisorCliRescan: true,
        advisorUiOrApiExport: false,
      },
    })

    await expect(readVerifiedAdvisorExport(file)).rejects.toThrow(
      /Advisor export must come from Supabase Dashboard UI or Management API/,
    )
  })

  it('rejects UI/API exports with security issues still present', async () => {
    const file = writeAdvisorExport(validAdvisorExport({
      source: 'dashboard_ui',
      securityIssueCount: 1,
    }))

    await expect(readVerifiedAdvisorExport(file)).rejects.toThrow(
      /Advisor export still has security issues/,
    )
  })

  it('rejects stale advisor exports when building current release evidence', async () => {
    const file = writeAdvisorExport(validAdvisorExport({
      exportedAt: '2026-07-10T00:00:00.000Z',
    }))

    await expect(readVerifiedAdvisorExport(file, {
      now: new Date('2026-07-12T00:00:00.000Z'),
      maxAgeMs: 24 * 60 * 60 * 1000,
      expectedEnvironment: 'staging',
    })).rejects.toThrow(/Advisor export is stale/)
  })

  it('rejects advisor exports from a different deployment environment', async () => {
    const file = writeAdvisorExport(validAdvisorExport({ environment: 'staging' }))

    await expect(readVerifiedAdvisorExport(file, {
      now: new Date(),
      maxAgeMs: 24 * 60 * 60 * 1000,
      expectedEnvironment: 'production',
    })).rejects.toThrow(/Advisor export environment does not match production/)
  })
})
