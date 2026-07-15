import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function runRepair(args) {
  return spawnSync(process.execPath, ['project-testing/tools/run-staging-runtime-login-repair.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

test('blocks staging runtime login repair unless both write confirmations are present', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-login-repair-guard-'))
  try {
    const envFile = join(dir, 'staging.env')
    const output = join(dir, 'repair-execution.json')
    writeFileSync(envFile, [
      'SUPABASE_URL=https://xemqmqpifsstkovbkatp.supabase.co',
      'DB_CONNECTION_STRING=postgresql://workbuddy_runtime_login:runtime-secret@db.xemqmqpifsstkovbkatp.supabase.co:5432/postgres',
      'SUPABASE_MIGRATION_URL=postgresql://postgres:migration-secret@db.xemqmqpifsstkovbkatp.supabase.co:5432/postgres',
      'WORKBUDDY_RUNTIME_LOGIN_PASSWORD=runtime-secret',
    ].join('\n'), 'utf8')

    const result = runRepair(['--env-file', envFile, '--output', output])

    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stdout, /runtime-secret|migration-secret|postgresql:\/\/[^<]/)
    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.status, 'blocked')
    assert.equal(report.reasonCode, 'explicit_staging_write_confirmation_required')
    assert.equal(report.boundary.dbMutation, false)
    assert.equal(report.boundary.writesRolePassword, false)
    assert.equal(report.safeToShare, true)
    assert.equal(report.secretsPrinted, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('documents write boundary in the implementation source', async () => {
  const source = await readFile(join(repoRoot, 'project-testing/tools/run-staging-runtime-login-repair.mjs'), 'utf8')
  assert.match(source, /--allow-write/)
  assert.match(source, /--confirm-staging-runtime-login-repair/)
  assert.match(source, /writesApplicationData: false/)
  assert.match(source, /writesRolePassword: true/)
  assert.match(source, /spawnSync/)
  assert.match(source, /repair:runtime-db-login-role/)
  assert.match(source, /--workspace=server/)
  assert.doesNotMatch(source, /import\(scriptUrl\)/)
  assert.doesNotMatch(source, /console\.log\([^)]*process\.env/)
})
