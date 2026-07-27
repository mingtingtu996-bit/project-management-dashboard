import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

test('builds a SQL Editor runtime login repair package without printing secrets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-login-sql-package-'))
  const envFile = join(dir, 'staging.env')
  const releaseDir = join(dir, 'release')
  await writeFile(envFile, [
    'SUPABASE_URL=https://xemqmqpifsstkovbkatp.supabase.co',
    'SUPABASE_MIGRATION_URL=postgresql://postgres:migration-secret@db.xemqmqpifsstkovbkatp.supabase.co:5432/postgres',
    'DB_CONNECTION_STRING=postgresql://workbuddy_runtime_login:runtime-secret@db.xemqmqpifsstkovbkatp.supabase.co:5432/postgres?sslmode=require',
    'WORKBUDDY_RUNTIME_LOGIN_ROLE=workbuddy_runtime_login',
    'WORKBUDDY_RUNTIME_LOGIN_PASSWORD=runtime-secret',
    '',
  ].join('\n'), 'utf8')

  try {
    const result = spawnSync(process.execPath, [
      'project-testing/tools/build-runtime-login-sql-editor-repair-package.mjs',
      '--env-file',
      envFile,
      '--release-dir',
      releaseDir,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.doesNotMatch(result.stdout, /runtime-secret|migration-secret|postgresql:\/\//)

    const packageJson = JSON.parse(await readFile(join(releaseDir, 'runtime-login-role-sql-editor-package.json'), 'utf8'))
    const repairSql = await readFile(join(releaseDir, 'runtime-login-role-repair.sql'), 'utf8')
    const verifySql = await readFile(join(releaseDir, 'runtime-login-role-verify.sql'), 'utf8')

    assert.equal(packageJson.status, 'sql-editor-repair-package-ready')
    assert.equal(packageJson.safeToShare, true)
    assert.equal(packageJson.secretsPrinted, false)
    assert.equal(packageJson.containsSensitiveSqlFile, true)
    assert.equal(packageJson.targetProjectRef, 'xemqmqpifsstkovbkatp')
    assert.equal(packageJson.targetRole, 'workbuddy_runtime_login')
    assert.match(packageJson.artifacts.repairSql, /runtime-login-role-repair\.sql$/)
    assert.match(packageJson.artifacts.verifySql, /runtime-login-role-verify\.sql$/)
    assert.doesNotMatch(JSON.stringify(packageJson), /runtime-secret|migration-secret|postgresql:\/\//)

    assert.match(repairSql, /CREATE ROLE %I LOGIN INHERIT NOBYPASSRLS PASSWORD %L/)
    assert.match(repairSql, /ALTER ROLE %I WITH LOGIN INHERIT NOBYPASSRLS PASSWORD %L/)
    assert.match(repairSql, /GRANT workbuddy_runtime TO workbuddy_runtime_login/)
    assert.match(repairSql, /runtime-secret/)
    assert.match(verifySql, /rolbypassrls/)
    assert.match(verifySql, /has_function_privilege/)
    assert.doesNotMatch(verifySql, /runtime-secret|migration-secret/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('rejects unsafe runtime role names before writing SQL', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-login-sql-package-reject-'))
  const envFile = join(dir, 'staging.env')
  const releaseDir = join(dir, 'release')
  await writeFile(envFile, [
    'SUPABASE_MIGRATION_URL=postgresql://postgres:migration-secret@db.example.supabase.co:5432/postgres',
    'WORKBUDDY_RUNTIME_LOGIN_ROLE=workbuddy_runtime_login;drop role postgres',
    'WORKBUDDY_RUNTIME_LOGIN_PASSWORD=runtime-secret',
    '',
  ].join('\n'), 'utf8')

  try {
    const result = spawnSync(process.execPath, [
      'project-testing/tools/build-runtime-login-sql-editor-repair-package.mjs',
      '--env-file',
      envFile,
      '--release-dir',
      releaseDir,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unsafe runtime login role name/)
    assert.doesNotMatch(result.stderr, /runtime-secret|migration-secret/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
