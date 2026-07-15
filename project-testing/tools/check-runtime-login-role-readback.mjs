#!/usr/bin/env node

import { constants } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pg from 'pg'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = path.join(
  repoRoot,
  'project-testing',
  'reports',
  'release-v1.4.24-20260702-125254',
)
const defaultEnvFile = path.join(repoRoot, 'deploy', 'env', 'staging.env')
const runtimeGroupRole = 'workbuddy_runtime'
const requiredFunctions = ['is_active_company_member', 'is_active_project_member']

const { Client } = pg

function repoRel(filePath) {
  return path.relative(repoRoot, path.resolve(filePath)).replace(/\\/g, '/')
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    releaseDir: defaultReleaseDir,
    output: '',
    envFile: defaultEnvFile,
    verifyResult: '',
    targetRole: '',
    allowDbRead: false,
    allowPrivilegedCatalogRead: false,
    connectionTimeoutMillis: 8000,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--release-dir') {
      options.releaseDir = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--verify-result' || arg === '--sql-editor-result') {
      options.verifyResult = path.resolve(nextValue())
    } else if (arg === '--target-role') {
      options.targetRole = nextValue().trim()
    } else if (arg === '--allow-db-read') {
      options.allowDbRead = true
    } else if (arg === '--allow-privileged-catalog-read') {
      options.allowPrivilegedCatalogRead = true
    } else if (arg === '--connection-timeout-ms') {
      options.connectionTimeoutMillis = Number(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!options.output) {
    options.output = path.join(options.releaseDir, 'runtime-login-role-readback.json')
  }
  return options
}

async function fileExists(filePath) {
  return access(filePath, constants.R_OK).then(() => true).catch(() => false)
}

async function readJson(filePath, fallback = null) {
  if (!filePath || !(await fileExists(filePath))) return fallback
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function parseEnvFile(text) {
  const env = {}
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const separator = trimmed.indexOf('=')
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) env[key] = value
  }
  return env
}

async function readEnvValues(envFile) {
  if (!(await fileExists(envFile))) return {}
  return parseEnvFile(await readFile(envFile, 'utf8'))
}

function roleNameFromConnectionString(value) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return decodeURIComponent(parsed.username || '').split('.')[0] || null
  } catch {
    return null
  }
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value ?? '').trim().toLowerCase()
  if (['true', 't', 'yes', 'y', '1'].includes(text)) return true
  if (['false', 'f', 'no', 'n', '0'].includes(text)) return false
  return null
}

function normalizeRowArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.rows)) return value.rows
  if (Array.isArray(value?.data)) return value.data
  return []
}

function resultSetRows(payload, index) {
  const sets = payload?.resultSets ?? payload?.results ?? payload?.statements
  if (!Array.isArray(sets)) return []
  return normalizeRowArray(sets[index])
}

function normalizeSqlEditorPayload(payload) {
  if (!payload) {
    return {
      roleRows: [],
      membershipRows: [],
      functionPrivilegeRows: [],
      catalogReadStatus: 'missing',
      connectionSmoke: null,
    }
  }
  const roleRows = normalizeRowArray(payload.roleRows ?? payload.roles ?? payload.pgRoles).length > 0
    ? normalizeRowArray(payload.roleRows ?? payload.roles ?? payload.pgRoles)
    : resultSetRows(payload, 0)
  const membershipRows = normalizeRowArray(payload.membershipRows ?? payload.memberships ?? payload.roleMemberships).length > 0
    ? normalizeRowArray(payload.membershipRows ?? payload.memberships ?? payload.roleMemberships)
    : resultSetRows(payload, 1)
  const functionPrivilegeRows = normalizeRowArray(payload.functionPrivilegeRows ?? payload.functionPrivileges ?? payload.functions).length > 0
    ? normalizeRowArray(payload.functionPrivilegeRows ?? payload.functionPrivileges ?? payload.functions)
    : resultSetRows(payload, 2)
  const hasCatalogRows = roleRows.length > 0 || membershipRows.length > 0 || functionPrivilegeRows.length > 0
  const catalogReadStatus = String(payload.catalogReadStatus ?? payload.catalog_read_status ?? '').trim() ||
    (hasCatalogRows ? 'read' : payload.connectionSmoke?.connected === false || payload.runtimeConnectionSmoke?.connected === false ? 'failed' : 'read')
  return {
    roleRows,
    membershipRows,
    functionPrivilegeRows,
    catalogReadStatus,
    connectionSmoke: payload.runtimeConnectionSmoke ?? payload.connectionSmoke ?? null,
  }
}

function rowName(row, keys) {
  for (const key of keys) {
    const value = row?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function roleMap(roleRows) {
  const map = new Map()
  for (const row of roleRows) {
    const name = rowName(row, ['rolname', 'roleName', 'role_name', 'name'])
    if (name) map.set(name, row)
  }
  return map
}

function functionPrivilegeMap(rows) {
  const map = new Map()
  for (const row of rows) {
    const name = rowName(row, ['function_name', 'functionName', 'proname', 'name'])
    if (!name) continue
    map.set(name, {
      schemaName: rowName(row, ['schema_name', 'schemaName', 'nspname']) || 'public',
      canExecute: normalizeBoolean(row.can_execute ?? row.canExecute ?? row.execute ?? row.has_execute),
    })
  }
  return map
}

function hasRuntimeMembership(rows, targetRole) {
  return rows.some((row) => {
    const member = rowName(row, ['member_role', 'memberRole', 'member', 'rolname'])
    const granted = rowName(row, ['granted_role', 'grantedRole', 'parent', 'roleid', 'role'])
    const explicitMember = normalizeBoolean(row.is_member ?? row.isMember ?? row.member_of_runtime)
    return (
      member === targetRole &&
      (granted === runtimeGroupRole || explicitMember === true)
    )
  })
}

function evaluateRuntimeLoginReadback({
  targetRole,
  roleRows,
  membershipRows,
  functionPrivilegeRows,
  catalogReadStatus,
  connectionSmoke,
}) {
  const roles = roleMap(roleRows)
  const target = roles.get(targetRole)
  const runtime = roles.get(runtimeGroupRole)
  const functions = functionPrivilegeMap(functionPrivilegeRows)
  const structuralBlockers = []
  const canAssessCatalog = !catalogReadStatus || catalogReadStatus === 'read'

  if (!canAssessCatalog) {
    structuralBlockers.push(`runtime_catalog_read_${catalogReadStatus}`)
  } else if (!target) {
    structuralBlockers.push('target_role_missing')
  } else {
    if (normalizeBoolean(target.rolcanlogin ?? target.canLogin ?? target.can_login) !== true) {
      structuralBlockers.push('target_role_login_false')
    }
    if (normalizeBoolean(target.rolbypassrls ?? target.bypassRls ?? target.bypass_rls) !== false) {
      structuralBlockers.push('target_role_bypassrls_not_false')
    }
    if (normalizeBoolean(target.rolinherit ?? target.inherit) !== true) {
      structuralBlockers.push('target_role_inherit_false')
    }
  }

  if (!canAssessCatalog) {
    // Already captured above. Do not turn a connection failure into false role-missing findings.
  } else if (!runtime) {
    structuralBlockers.push('runtime_group_role_missing')
  } else {
    if (normalizeBoolean(runtime.rolcanlogin ?? runtime.canLogin ?? runtime.can_login) === true) {
      structuralBlockers.push('runtime_group_role_can_login_true')
    }
    if (normalizeBoolean(runtime.rolbypassrls ?? runtime.bypassRls ?? runtime.bypass_rls) !== false) {
      structuralBlockers.push('runtime_group_role_bypassrls_not_false')
    }
  }

  const memberOfRuntime = hasRuntimeMembership(membershipRows, targetRole)
  if (canAssessCatalog && !memberOfRuntime) structuralBlockers.push('runtime_group_membership_missing')

  const functionChecks = Object.fromEntries(requiredFunctions.map((functionName) => {
    const entry = functions.get(functionName)
    const canExecute = entry?.canExecute === true
    if (canAssessCatalog && !canExecute) structuralBlockers.push(`function_execute_missing:${functionName}`)
    return [
      functionName,
      {
        schemaName: entry?.schemaName ?? 'public',
        canExecute,
      },
    ]
  }))

  const smokeStatus = String(connectionSmoke?.status ?? '').trim().toLowerCase()
  const smokeConnected = normalizeBoolean(connectionSmoke?.connected) === true
  const smokeCurrentUser = rowName(connectionSmoke, ['currentUser', 'current_user', 'user'])
  const passwordAuthPass =
    smokeStatus === 'pass' ||
    (smokeConnected && (!smokeCurrentUser || smokeCurrentUser === targetRole))
  const passwordAuthFail =
    smokeStatus === 'fail' ||
    normalizeBoolean(connectionSmoke?.connected) === false ||
    Boolean(connectionSmoke?.safeErrorSummary || connectionSmoke?.errorCode)
  const passwordAuthStatus = passwordAuthPass ? 'pass' : passwordAuthFail ? 'fail' : 'unverified'
  const passwordAuthBlockers = passwordAuthStatus === 'pass'
    ? []
    : passwordAuthStatus === 'fail'
      ? ['runtime_password_auth_smoke_failed']
      : ['runtime_password_auth_smoke_missing']

  const structuralPass = structuralBlockers.length === 0
  const status = !structuralPass
    ? 'fail'
    : passwordAuthStatus === 'pass'
      ? 'pass'
      : passwordAuthStatus === 'fail'
        ? 'structural-pass-password-auth-fail'
        : 'structural-pass-password-unverified'

  return {
    status,
    structuralPass,
    passwordAuthStatus,
    checks: {
      catalogRead: {
        status: catalogReadStatus ?? 'read',
      },
      targetRole: {
        roleName: targetRole,
        present: Boolean(target),
        canLogin: normalizeBoolean(target?.rolcanlogin ?? target?.canLogin ?? target?.can_login),
        bypassRls: normalizeBoolean(target?.rolbypassrls ?? target?.bypassRls ?? target?.bypass_rls),
        inherit: normalizeBoolean(target?.rolinherit ?? target?.inherit),
      },
      runtimeGroupRole: {
        roleName: runtimeGroupRole,
        present: Boolean(runtime),
        canLogin: normalizeBoolean(runtime?.rolcanlogin ?? runtime?.canLogin ?? runtime?.can_login),
        bypassRls: normalizeBoolean(runtime?.rolbypassrls ?? runtime?.bypassRls ?? runtime?.bypass_rls),
      },
      membership: {
        memberRole: targetRole,
        grantedRole: runtimeGroupRole,
        present: memberOfRuntime,
      },
      functionPrivileges: functionChecks,
      passwordAuth: {
        status: passwordAuthStatus,
        currentUser: smokeCurrentUser || null,
        safeErrorSummary: connectionSmoke?.safeErrorSummary ?? null,
        errorCode: connectionSmoke?.errorCode ?? null,
      },
    },
    structuralBlockers,
    passwordAuthBlockers,
    blockers: [...structuralBlockers, ...passwordAuthBlockers],
  }
}

function redactConnectionString(value) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const auth = parsed.username || parsed.password ? '<redacted-user>:<redacted-password>@' : ''
    const query = parsed.search ? parsed.search : ''
    return `${parsed.protocol}//${auth}${parsed.host}${parsed.pathname}${query}`
  } catch {
    return 'postgresql://<redacted>'
  }
}

function connectionStringFromEnv(env) {
  return env.DB_CONNECTION_STRING || env.WORKBUDDY_RUNTIME_DATABASE_URL || ''
}

function privilegedConnectionStringFromEnv(env) {
  return env.SUPABASE_MIGRATION_URL || env.DIRECT_DATABASE_URL || env.DATABASE_URL || ''
}

function runtimePgClientConfig(connectionString, connectionTimeoutMillis) {
  try {
    const parsed = new URL(connectionString)
    // pg-connection-string currently treats sslmode=require like verify-full and can
    // reject Supabase certificates before the runtime login check runs. Keep this
    // verifier read-only and control TLS behavior explicitly through pg's ssl option.
    parsed.searchParams.delete('sslmode')
    parsed.searchParams.delete('sslcert')
    parsed.searchParams.delete('sslkey')
    parsed.searchParams.delete('sslrootcert')
    return {
      connectionString: parsed.toString(),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis,
    }
  } catch {
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis,
    }
  }
}

async function queryRuntimeLoginReadback({ envFile, targetRole, connectionTimeoutMillis }) {
  const env = await readEnvValues(envFile)
  const connectionString = connectionStringFromEnv(env)
  if (!connectionString) {
    return {
      source: {
        envFile: repoRel(envFile),
        connectionStringRedacted: null,
      },
      payload: normalizeSqlEditorPayload(null),
      connectionSmoke: {
        status: 'fail',
        connected: false,
        errorCode: 'runtime_connection_string_missing',
        safeErrorSummary: 'DB_CONNECTION_STRING or WORKBUDDY_RUNTIME_DATABASE_URL is missing from the env file',
      },
    }
  }

  const client = new Client(runtimePgClientConfig(connectionString, connectionTimeoutMillis))
  try {
    await client.connect()
    await client.query('SET statement_timeout = 8000')
    const roleResult = await client.query(
      `SELECT rolname, rolcanlogin, rolbypassrls, rolinherit
         FROM pg_roles
        WHERE rolname IN ($1, $2)
        ORDER BY rolname`,
      [targetRole, runtimeGroupRole],
    )
    const currentResult = await client.query(
      `SELECT current_user AS current_user,
              pg_has_role(current_user, $1, 'member') AS member_of_runtime`,
      [runtimeGroupRole],
    )
    const functionResult = await client.query(
      `SELECT n.nspname AS schema_name,
              p.proname AS function_name,
              has_function_privilege(current_user, p.oid, 'EXECUTE') AS can_execute
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($1)
        ORDER BY p.proname`,
      [requiredFunctions],
    )
    const currentUser = currentResult.rows[0]?.current_user ?? null
    const memberOfRuntime = normalizeBoolean(currentResult.rows[0]?.member_of_runtime) === true
    return {
      source: {
        envFile: repoRel(envFile),
        connectionStringRedacted: redactConnectionString(connectionString),
      },
      payload: {
        roleRows: roleResult.rows,
        membershipRows: memberOfRuntime
          ? [{ member_role: targetRole, granted_role: runtimeGroupRole, is_member: true }]
          : [],
        functionPrivilegeRows: functionResult.rows,
        catalogReadStatus: 'read',
        connectionSmoke: {
          status: currentUser === targetRole ? 'pass' : 'fail',
          connected: true,
          currentUser,
          errorCode: currentUser === targetRole ? null : 'runtime_current_user_mismatch',
          safeErrorSummary: currentUser === targetRole ? null : `connected as ${currentUser ?? 'unknown'} instead of ${targetRole}`,
        },
      },
    }
  } catch (error) {
    return {
      source: {
        envFile: repoRel(envFile),
        connectionStringRedacted: redactConnectionString(connectionString),
      },
      payload: {
        roleRows: [],
        membershipRows: [],
        functionPrivilegeRows: [],
        catalogReadStatus: 'failed',
        connectionSmoke: {
          status: 'fail',
          connected: false,
          errorCode: error?.code ?? 'runtime_connection_failed',
          safeErrorSummary: String(error?.message ?? error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://<redacted>').slice(0, 240),
        },
      },
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function queryPrivilegedCatalogReadback({ envFile, targetRole, connectionTimeoutMillis }) {
  const env = await readEnvValues(envFile)
  const connectionString = privilegedConnectionStringFromEnv(env)
  if (!connectionString) {
    return {
      source: {
        envFile: repoRel(envFile),
        connectionStringRedacted: null,
      },
      payload: {
        roleRows: [],
        membershipRows: [],
        functionPrivilegeRows: [],
        catalogReadStatus: 'failed',
        connectionSmoke: {
          status: 'fail',
          connected: false,
          errorCode: 'privileged_connection_string_missing',
          safeErrorSummary: 'SUPABASE_MIGRATION_URL, DIRECT_DATABASE_URL, or DATABASE_URL is missing from the env file',
        },
      },
    }
  }

  const client = new Client(runtimePgClientConfig(connectionString, connectionTimeoutMillis))
  try {
    await client.connect()
    await client.query('SET statement_timeout = 8000')
    const roleResult = await client.query(
      `SELECT rolname, rolcanlogin, rolbypassrls, rolinherit
         FROM pg_roles
        WHERE rolname IN ($1, $2)
        ORDER BY rolname`,
      [targetRole, runtimeGroupRole],
    )
    const membershipResult = await client.query(
      `SELECT member.rolname AS member_role,
              parent.rolname AS granted_role
         FROM pg_auth_members membership
         JOIN pg_roles parent ON parent.oid = membership.roleid
         JOIN pg_roles member ON member.oid = membership.member
        WHERE member.rolname = $1
          AND parent.rolname = $2`,
      [targetRole, runtimeGroupRole],
    )
    const functionResult = await client.query(
      `SELECT n.nspname AS schema_name,
              p.proname AS function_name,
              has_function_privilege($1, p.oid, 'EXECUTE') AS can_execute
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = ANY($2)
        ORDER BY p.proname`,
      [targetRole, requiredFunctions],
    )

    return {
      source: {
        envFile: repoRel(envFile),
        connectionStringRedacted: redactConnectionString(connectionString),
      },
      payload: {
        roleRows: roleResult.rows,
        membershipRows: membershipResult.rows,
        functionPrivilegeRows: functionResult.rows,
        catalogReadStatus: 'read',
        connectionSmoke: null,
      },
    }
  } catch (error) {
    return {
      source: {
        envFile: repoRel(envFile),
        connectionStringRedacted: redactConnectionString(connectionString),
      },
      payload: {
        roleRows: [],
        membershipRows: [],
        functionPrivilegeRows: [],
        catalogReadStatus: 'failed',
        connectionSmoke: null,
      },
    }
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function buildRuntimeLoginRoleReadback(options) {
  const releaseDir = path.resolve(options.releaseDir)
  const packageJson = await readJson(path.join(releaseDir, 'runtime-login-role-sql-editor-package.json'), null)
  const envValues = await readEnvValues(options.envFile)
  const runtimeConnection = connectionStringFromEnv(envValues)
  const targetRole =
    options.targetRole ||
    packageJson?.targetRole ||
    envValues.WORKBUDDY_RUNTIME_LOGIN_ROLE ||
    roleNameFromConnectionString(runtimeConnection) ||
    'workbuddy_runtime_login'

  const sources = []
  const payloads = []

  if (options.verifyResult) {
    const manualPayload = await readJson(options.verifyResult, null)
    payloads.push(normalizeSqlEditorPayload(manualPayload))
    sources.push({
      kind: 'sql-editor-verify-result',
      artifact: repoRel(options.verifyResult),
      dbMutation: false,
      liveMutation: false,
    })
  }

  if (options.allowDbRead) {
    const dbReadback = await queryRuntimeLoginReadback({
      envFile: options.envFile,
      targetRole,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
    })
    payloads.push(dbReadback.payload)
    sources.push({
      kind: 'runtime-db-readback',
      envFile: dbReadback.source.envFile,
      connectionStringRedacted: dbReadback.source.connectionStringRedacted,
      dbMutation: false,
      liveMutation: false,
    })
  }

  if (options.allowPrivilegedCatalogRead) {
    const privilegedReadback = await queryPrivilegedCatalogReadback({
      envFile: options.envFile,
      targetRole,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
    })
    payloads.push(privilegedReadback.payload)
    sources.push({
      kind: 'privileged-catalog-readback',
      envFile: privilegedReadback.source.envFile,
      connectionStringRedacted: privilegedReadback.source.connectionStringRedacted,
      dbMutation: false,
      liveMutation: false,
    })
  }

  const combined = payloads.reduce((acc, payload) => ({
    roleRows: [...acc.roleRows, ...normalizeRowArray(payload.roleRows)],
    membershipRows: [...acc.membershipRows, ...normalizeRowArray(payload.membershipRows)],
    functionPrivilegeRows: [...acc.functionPrivilegeRows, ...normalizeRowArray(payload.functionPrivilegeRows)],
    catalogReadStatus: payload.catalogReadStatus === 'read'
      ? 'read'
      : acc.catalogReadStatus === 'read'
        ? 'read'
        : payload.catalogReadStatus ?? acc.catalogReadStatus,
    connectionSmoke: payload.connectionSmoke ?? acc.connectionSmoke,
  }), {
    roleRows: [],
    membershipRows: [],
    functionPrivilegeRows: [],
    catalogReadStatus: null,
    connectionSmoke: null,
  })

  const hasInput = sources.length > 0
  const evaluation = hasInput
    ? evaluateRuntimeLoginReadback({ targetRole, ...combined })
    : {
        status: 'missing-input',
        structuralPass: false,
        passwordAuthStatus: 'unverified',
        checks: {
          catalogRead: { status: 'missing' },
          targetRole: { roleName: targetRole, present: false, canLogin: null, bypassRls: null, inherit: null },
          runtimeGroupRole: { roleName: runtimeGroupRole, present: false, canLogin: null, bypassRls: null },
          membership: { memberRole: targetRole, grantedRole: runtimeGroupRole, present: false },
          functionPrivileges: Object.fromEntries(requiredFunctions.map((functionName) => [
            functionName,
            { schemaName: 'public', canExecute: false },
          ])),
          passwordAuth: { status: 'unverified', currentUser: null, safeErrorSummary: null, errorCode: null },
        },
        structuralBlockers: ['runtime_login_readback_input_missing'],
        passwordAuthBlockers: ['runtime_password_auth_smoke_missing'],
        blockers: ['runtime_login_readback_input_missing', 'runtime_password_auth_smoke_missing'],
      }

  const status = evaluation.status
  const closesRuntimeLoginPrerequisite = status === 'pass'
  const nextActions = []
  if (!hasInput) {
    nextActions.push('execute runtime-login-role-verify.sql in Supabase SQL Editor and save the role/membership/function result rows as JSON, then rerun this verifier with --verify-result')
    nextActions.push('or rerun this verifier with --allow-db-read after DB_CONNECTION_STRING points to the repaired runtime login role')
  } else if (status === 'structural-pass-password-unverified') {
    nextActions.push('runtime role structure is correct, but password authentication is still unverified; run --allow-db-read or rerun C18 L07 diagnostics after API restart')
  } else if (status === 'structural-pass-password-auth-fail') {
    nextActions.push('role structure is correct but runtime password authentication still fails; rerun the repair SQL with the current runtime password and restart the API')
  } else if (status === 'fail') {
    nextActions.push('rerun runtime-login-role-repair.sql in Supabase SQL Editor, then rerun runtime-login-role-verify.sql and this verifier')
  } else {
    nextActions.push('rerun C18 L07 critical-path concurrency live diagnostic and archive the pass evidence')
  }

  return {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-readback/v1',
    generatedAt: (options.now ?? new Date()).toISOString(),
    status,
    safeToShare: true,
    secretsPrinted: false,
    targetRole,
    runtimeGroupRole,
    sourceEnvFile: (await fileExists(options.envFile)) ? repoRel(options.envFile) : null,
    sources,
    checks: evaluation.checks,
    structuralBlockers: evaluation.structuralBlockers,
    passwordAuthBlockers: evaluation.passwordAuthBlockers,
    blockers: evaluation.blockers,
    closesRuntimeLoginPrerequisite,
    releaseImpact: [
      'This is runtime login prerequisite evidence only.',
      'It does not close G5 by itself; C18 live diagnostics and the remaining live/DB closeout gates must still pass.',
      status === 'pass'
        ? 'Runtime login role readback can be used to justify rerunning C18 L07 after API restart.'
        : 'G5 remains deferred until runtime login readback and C18 diagnostics pass.',
    ],
    boundary: {
      liveMutation: false,
      dbMutation: false,
      readOnly: true,
      closesG5: false,
    },
    nextActions,
  }
}

async function writeRuntimeLoginRoleReadback(options) {
  const report = await buildRuntimeLoginRoleReadback(options)
  await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
  await writeFile(path.resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/check-runtime-login-role-readback.mjs [--release-dir <dir>] [--output <json>] [--verify-result <json>] [--env-file <env>] [--target-role <role>] [--allow-db-read] [--allow-privileged-catalog-read]`)
}

function isMainModule(importMetaUrl = import.meta.url, argv1 = process.argv[1]) {
  if (!argv1) return false
  return fileURLToPath(importMetaUrl) === path.resolve(argv1)
}

if (isMainModule()) {
  try {
    const options = parseArgs()
    const report = await writeRuntimeLoginRoleReadback(options)
    console.log(JSON.stringify({
      status: report.status,
      targetRole: report.targetRole,
      sourceCount: report.sources.length,
      structuralBlockers: report.structuralBlockers,
      passwordAuthBlockers: report.passwordAuthBlockers,
      closesRuntimeLoginPrerequisite: report.closesRuntimeLoginPrerequisite,
      output: repoRel(options.output),
    }, null, 2))
    process.exitCode = report.status === 'pass' ? 0 : 1
  } catch (error) {
    console.error(JSON.stringify({
      status: 'fail',
      reason: error instanceof Error ? error.message : String(error),
    }, null, 2))
    process.exitCode = 1
  }
}

export {
  buildRuntimeLoginRoleReadback,
  evaluateRuntimeLoginReadback,
  normalizeSqlEditorPayload,
  parseArgs,
  privilegedConnectionStringFromEnv,
  queryPrivilegedCatalogReadback,
  runtimePgClientConfig,
  writeRuntimeLoginRoleReadback,
}
