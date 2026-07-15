import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

test('prepare-full-app-test-env prints the selected env file without leaking secrets', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'workbuddy-full-app-env-'))
  const envFile = join(tempDir, 'staging.env')

  writeFileSync(
    envFile,
    [
      'SUPABASE_URL=https://fixture.supabase.co',
      'SUPABASE_SERVICE_KEY=fixture-service-role-secret',
      'SUPABASE_ANON_KEY=fixture-anon-secret',
      '',
    ].join('\n'),
    'utf8',
  )

  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/prepare-full-app-test-env.mjs', '--env-file', envFile, '--print-config'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          BASE_URL: 'http://127.0.0.1:4175',
          API_BASE_URL: 'http://127.0.0.1:3106',
        },
      },
    )

    assert.equal(result.status, 0, result.stderr)
    const config = JSON.parse(result.stdout)

    assert.equal(config.envFile, envFile)
    assert.equal(config.baseUrl, 'http://127.0.0.1:4175')
    assert.equal(config.apiBaseUrl, 'http://127.0.0.1:3106')
    assert.equal(config.supabaseUrlConfigured, true)
    assert.equal(config.supabaseServiceKeyConfigured, true)
    assert.equal(result.stdout.includes('fixture-service-role-secret'), false)
    assert.equal(result.stdout.includes('fixture-anon-secret'), false)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('prepare-full-app-test-env creates tasks with an engineering object scope', () => {
  const source = spawnSync(process.execPath, ['-e', "console.log(require('fs').readFileSync('scripts/prepare-full-app-test-env.mjs','utf8'))"], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(source.status, 0, source.stderr)
  assert.match(source.stdout, /async function ensureFixtureEngineeringObject/)
  assert.match(source.stdout, /engineering_object_id: input\.engineeringObjectId/)
  assert.doesNotMatch(source.stdout, /assignee_unit: input\.assigneeUnit/)
  assert.match(source.stdout, /ensureStandardTasks\(ownerSession\.token, standardProject\.id, participantUnit\.id, standardEngineeringObject\.id\)/)
})

test('prepare-full-app-test-env records planning fixture failure without blocking manifest output', () => {
  const source = spawnSync(process.execPath, ['-e', "console.log(require('fs').readFileSync('scripts/prepare-full-app-test-env.mjs','utf8'))"], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(source.status, 0, source.stderr)
  assert.match(source.stdout, /const warnings = \[\]/)
  assert.match(source.stdout, /ensureBaselineAndMonthly/)
  assert.match(source.stdout, /warnings\.push\(\{ step: 'baseline-and-monthly'/)
  assert.match(source.stdout, /warnings,/)
})

test('prepare-full-app-test-env creates real company memberships for browser role gates', () => {
  const source = spawnSync(process.execPath, ['-e', "console.log(require('fs').readFileSync('scripts/prepare-full-app-test-env.mjs','utf8'))"], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(source.status, 0, source.stderr)
  assert.match(source.stdout, /async function ensureCompanyMembership/)
  assert.match(source.stdout, /company_members/)
  assert.match(source.stdout, /last_active_company_id/)
  assert.match(source.stdout, /ensureCompanyMembership\(standardProject\.company_id, adminSession, 'company_admin'\)/)
  assert.match(source.stdout, /ensureCompanyMembership\(standardProject\.company_id, ownerSession, 'regular'\)/)
  assert.match(source.stdout, /ensureCompanyMembership\(standardProject\.company_id, editorSession, 'regular'\)/)
  assert.match(source.stdout, /ensureCompanyMembership\(standardProject\.company_id, outsiderSession, 'regular'\)/)
})

test('prepare-full-app-test-env seeds a pending manual close risk for risk guard browser verification', () => {
  const source = spawnSync(process.execPath, ['-e', "console.log(require('fs').readFileSync('scripts/prepare-full-app-test-env.mjs','utf8'))"], {
    cwd: repoRoot,
    encoding: 'utf8',
  })

  assert.equal(source.status, 0, source.stderr)
  assert.match(source.stdout, /ensureStandardRisks/)
  assert.match(source.stdout, /pending_manual_close:\s*true/)
  assert.match(source.stdout, /标准项目-待人工关闭风险/)
})
