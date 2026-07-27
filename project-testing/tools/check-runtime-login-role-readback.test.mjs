import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  evaluateRuntimeLoginReadback,
  normalizeSqlEditorPayload,
  runtimePgClientConfig,
} from './check-runtime-login-role-readback.mjs'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

function runVerifier(args) {
  return spawnSync(process.execPath, ['project-testing/tools/check-runtime-login-role-readback.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

function validVerifyPayload(extra = {}) {
  return {
    roleRows: [
      {
        rolname: 'workbuddy_runtime',
        rolcanlogin: false,
        rolbypassrls: false,
        rolinherit: true,
      },
      {
        rolname: 'workbuddy_runtime_login',
        rolcanlogin: true,
        rolbypassrls: false,
        rolinherit: true,
      },
    ],
    membershipRows: [
      {
        member_role: 'workbuddy_runtime_login',
        granted_role: 'workbuddy_runtime',
      },
    ],
    functionPrivilegeRows: [
      {
        schema_name: 'public',
        function_name: 'is_active_company_member',
        can_execute: true,
      },
      {
        schema_name: 'public',
        function_name: 'is_active_project_member',
        can_execute: true,
      },
    ],
    ...extra,
  }
}

test('evaluates SQL Editor verify output as structural pass but keeps password auth unverified', () => {
  const payload = normalizeSqlEditorPayload(validVerifyPayload())
  const report = evaluateRuntimeLoginReadback({
    targetRole: 'workbuddy_runtime_login',
    ...payload,
  })

  assert.equal(report.status, 'structural-pass-password-unverified')
  assert.equal(report.structuralPass, true)
  assert.equal(report.checks.targetRole.canLogin, true)
  assert.equal(report.checks.targetRole.bypassRls, false)
  assert.equal(report.checks.membership.present, true)
  assert.equal(report.checks.functionPrivileges.is_active_company_member.canExecute, true)
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.passwordAuthBlockers, ['runtime_password_auth_smoke_missing'])
})

test('requires all runtime login role structure checks', () => {
  const payload = normalizeSqlEditorPayload({
    ...validVerifyPayload(),
    membershipRows: [],
    functionPrivilegeRows: [
      {
        schema_name: 'public',
        function_name: 'is_active_company_member',
        can_execute: true,
      },
    ],
  })
  const report = evaluateRuntimeLoginReadback({
    targetRole: 'workbuddy_runtime_login',
    ...payload,
  })

  assert.equal(report.status, 'fail')
  assert.ok(report.structuralBlockers.includes('runtime_group_membership_missing'))
  assert.ok(report.structuralBlockers.includes('function_execute_missing:is_active_project_member'))
})

test('passes only when structure and runtime password auth smoke both pass', () => {
  const payload = normalizeSqlEditorPayload(validVerifyPayload({
    runtimeConnectionSmoke: {
      status: 'pass',
      connected: true,
      currentUser: 'workbuddy_runtime_login',
    },
  }))
  const report = evaluateRuntimeLoginReadback({
    targetRole: 'workbuddy_runtime_login',
    ...payload,
  })

  assert.equal(report.status, 'pass')
  assert.equal(report.passwordAuthStatus, 'pass')
  assert.deepEqual(report.blockers, [])
})

test('keeps runtime password failure even when privileged catalog structure is valid', () => {
  const payload = normalizeSqlEditorPayload({
    ...validVerifyPayload(),
    runtimeConnectionSmoke: {
      status: 'fail',
      connected: false,
      errorCode: '28P01',
      safeErrorSummary: 'password authentication failed for user "workbuddy_runtime_login"',
    },
  })
  const report = evaluateRuntimeLoginReadback({
    targetRole: 'workbuddy_runtime_login',
    ...payload,
  })

  assert.equal(report.status, 'structural-pass-password-auth-fail')
  assert.equal(report.structuralPass, true)
  assert.deepEqual(report.structuralBlockers, [])
  assert.deepEqual(report.passwordAuthBlockers, ['runtime_password_auth_smoke_failed'])
  assert.equal(report.checks.passwordAuth.errorCode, '28P01')
})

test('does not report missing roles when DB catalog cannot be read', () => {
  const payload = normalizeSqlEditorPayload({
    roleRows: [],
    membershipRows: [],
    functionPrivilegeRows: [],
    catalogReadStatus: 'failed',
    runtimeConnectionSmoke: {
      status: 'fail',
      connected: false,
      errorCode: 'SELF_SIGNED_CERT_IN_CHAIN',
      safeErrorSummary: 'self-signed certificate in certificate chain',
    },
  })
  const report = evaluateRuntimeLoginReadback({
    targetRole: 'workbuddy_runtime_login',
    ...payload,
  })

  assert.equal(report.status, 'fail')
  assert.deepEqual(report.structuralBlockers, ['runtime_catalog_read_failed'])
  assert.equal(report.checks.catalogRead.status, 'failed')
  assert.equal(report.checks.passwordAuth.status, 'fail')
  assert.ok(report.passwordAuthBlockers.includes('runtime_password_auth_smoke_failed'))
  assert.equal(report.structuralBlockers.includes('target_role_missing'), false)
  assert.equal(report.structuralBlockers.includes('runtime_group_role_missing'), false)
})

test('normalizes runtime pg client config so sslmode does not override explicit verifier SSL policy', () => {
  const config = runtimePgClientConfig(
    'postgresql://workbuddy_runtime_login:secret@db.example.supabase.co:5432/postgres?sslmode=require&application_name=test',
    1234,
  )

  assert.equal(config.connectionString.includes('sslmode='), false)
  assert.equal(config.connectionString.includes('application_name=test'), true)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.connectionTimeoutMillis, 1234)
})

test('writes missing-input report without secrets when no verify result or DB read is supplied', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-login-readback-missing-'))
  try {
    const releaseDir = join(dir, 'release')
    const output = join(releaseDir, 'runtime-login-role-readback.json')
    const result = runVerifier(['--release-dir', releaseDir, '--output', output])

    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stdout, /postgresql:\/\/|runtime-secret|service_role/)
    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.status, 'missing-input')
    assert.equal(report.safeToShare, true)
    assert.equal(report.secretsPrinted, false)
    assert.equal(report.closesRuntimeLoginPrerequisite, false)
    assert.ok(report.blockers.includes('runtime_login_readback_input_missing'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('writes structural-pass-password-unverified report from SQL Editor result', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-login-readback-sql-'))
  try {
    const releaseDir = join(dir, 'release')
    const output = join(releaseDir, 'runtime-login-role-readback.json')
    const verifyResult = join(dir, 'verify-result.json')
    writeFileSync(verifyResult, `${JSON.stringify(validVerifyPayload(), null, 2)}\n`, 'utf8')

    const result = runVerifier(['--release-dir', releaseDir, '--verify-result', verifyResult, '--output', output])

    assert.equal(result.status, 1)
    assert.doesNotMatch(result.stdout, /runtime-secret|postgresql:\/\/[^<]/)
    const report = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(report.status, 'structural-pass-password-unverified')
    assert.equal(report.sources[0].kind, 'sql-editor-verify-result')
    assert.equal(report.closesRuntimeLoginPrerequisite, false)
    assert.deepEqual(report.structuralBlockers, [])
    assert.deepEqual(report.passwordAuthBlockers, ['runtime_password_auth_smoke_missing'])
    assert.match(report.releaseImpact.join('\n'), /does not close G5 by itself/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
