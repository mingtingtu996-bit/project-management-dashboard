#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultEnvFile = path.join(repoRoot, 'deploy', 'env', 'staging.env')
const defaultReleaseDir = path.join(
  repoRoot,
  'project-testing',
  'reports',
  'release-v1.4.24-20260702-125254',
)
const rolePattern = /^workbuddy_[a-z0-9_]*login$|^workbuddy_runtime_login$/

function parseArgs(argv) {
  const args = {
    envFile: defaultEnvFile,
    releaseDir: defaultReleaseDir,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--env-file') {
      args.envFile = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--release-dir') {
      args.releaseDir = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/build-runtime-login-sql-editor-repair-package.mjs [--env-file <env>] [--release-dir <dir>]')
      process.exit(0)
    }
  }
  return args
}

function repoRel(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/')
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) throw new Error(`env file not found: ${filePath}`)
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const separator = trimmed.indexOf('=')
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) env[key] = value
  }
  return env
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

function passwordFromConnectionString(value) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    return decodeURIComponent(parsed.password || '') || null
  } catch {
    return null
  }
}

function projectRefFromUrl(value) {
  if (!value) return null
  try {
    const parsed = new URL(value)
    const direct = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/)
    if (direct) return direct[1]
    const poolerUser = decodeURIComponent(parsed.username || '')
    const pooler = poolerUser.match(/^[^.]+\.([a-z0-9]+)$/i)
    return pooler?.[1] ?? null
  } catch {
    return null
  }
}

function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function quoteSqlIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`invalid SQL identifier: ${value}`)
  return value
}

function buildRepairSql({ roleName, rolePassword }) {
  const roleIdentifier = quoteSqlIdentifier(roleName)
  const roleLiteral = quoteSqlLiteral(roleName)
  const passwordLiteral = quoteSqlLiteral(rolePassword)

  return `-- WorkBuddy v1.4.24 runtime login role repair.
-- Execute this in Supabase SQL Editor for the staging project only.
-- This file contains a runtime DB password. Do not commit it or paste it into chat/logs.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${roleLiteral}) THEN
    EXECUTE format('CREATE ROLE %I LOGIN INHERIT NOBYPASSRLS PASSWORD %L', ${roleLiteral}, ${passwordLiteral});
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN INHERIT NOBYPASSRLS PASSWORD %L', ${roleLiteral}, ${passwordLiteral});
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'CREATE ROLE workbuddy_runtime NOLOGIN NOBYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE workbuddy_runtime WITH NOLOGIN NOBYPASSRLS';
  END IF;
END $$;

GRANT workbuddy_runtime TO ${roleIdentifier};
GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO ${roleIdentifier};
GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO ${roleIdentifier};

COMMIT;
`
}

function buildVerifySql(roleName) {
  const roleLiteral = quoteSqlLiteral(roleName)
  return `-- WorkBuddy v1.4.24 runtime login role verification.
-- Safe to execute after the repair SQL. This does not print passwords.

SELECT
  rolname,
  rolcanlogin,
  rolbypassrls,
  rolinherit
FROM pg_roles
WHERE rolname IN (${roleLiteral}, 'workbuddy_runtime')
ORDER BY rolname;

SELECT
  member.rolname AS member_role,
  parent.rolname AS granted_role
FROM pg_auth_members membership
JOIN pg_roles parent ON parent.oid = membership.roleid
JOIN pg_roles member ON member.oid = membership.member
WHERE member.rolname = ${roleLiteral}
  AND parent.rolname = 'workbuddy_runtime';

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  has_function_privilege(${roleLiteral}, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_active_company_member', 'is_active_project_member')
ORDER BY p.proname;
`
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = readEnvFile(args.envFile)
  const runtimeConnection = env.DB_CONNECTION_STRING || env.WORKBUDDY_RUNTIME_DATABASE_URL
  const roleName = env.WORKBUDDY_RUNTIME_LOGIN_ROLE || roleNameFromConnectionString(runtimeConnection) || 'workbuddy_runtime_login'
  const rolePassword =
    env.WORKBUDDY_RUNTIME_LOGIN_PASSWORD ||
    env.RUNTIME_DATABASE_PASSWORD ||
    passwordFromConnectionString(runtimeConnection)
  if (!rolePattern.test(roleName)) throw new Error(`unsafe runtime login role name: ${roleName}`)
  if (!rolePassword) throw new Error('missing runtime login password in env file')

  mkdirSync(args.releaseDir, { recursive: true })
  const repairSqlPath = path.join(args.releaseDir, 'runtime-login-role-repair.sql')
  const verifySqlPath = path.join(args.releaseDir, 'runtime-login-role-verify.sql')
  const packagePath = path.join(args.releaseDir, 'runtime-login-role-sql-editor-package.json')

  writeFileSync(repairSqlPath, buildRepairSql({ roleName, rolePassword }), 'utf8')
  writeFileSync(verifySqlPath, buildVerifySql(roleName), 'utf8')

  const packageJson = {
    schemaVersion: 'workbuddy-v1424-runtime-login-role-sql-editor-package/v1',
    generatedAt: new Date().toISOString(),
    status: 'sql-editor-repair-package-ready',
    safeToShare: true,
    secretsPrinted: false,
    containsSensitiveSqlFile: true,
    targetProjectRef:
      projectRefFromUrl(env.SUPABASE_URL) ||
      projectRefFromUrl(runtimeConnection) ||
      projectRefFromUrl(env.SUPABASE_MIGRATION_URL),
    targetRole: roleName,
    sourceEnvFile: repoRel(args.envFile),
    artifacts: {
      repairSql: repoRel(repairSqlPath),
      verifySql: repoRel(verifySqlPath),
    },
    operatorSteps: [
      'Open the Supabase staging project SQL Editor.',
      'Execute runtime-login-role-repair.sql inside the SQL Editor. Do not paste its content into chat or logs.',
      'Execute runtime-login-role-verify.sql and confirm workbuddy_runtime_login has LOGIN=true, BYPASSRLS=false, INHERIT=true, membership in workbuddy_runtime, and EXECUTE privilege on both membership helper functions.',
      'Restart the staging API so the new runtime login password is used.',
      'Rerun C18 L07 critical-path concurrency live diagnostic.',
    ],
    releaseImpact: [
      'This package does not execute database changes by itself.',
      'This package is sensitive operational material, not product closeout evidence.',
      'G5 remains deferred until repair is executed and live diagnostics pass.',
    ],
  }
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    status: packageJson.status,
    safeToShare: true,
    secretsPrinted: false,
    targetProjectRef: packageJson.targetProjectRef,
    targetRole: roleName,
    outputs: {
      package: repoRel(packagePath),
      repairSql: repoRel(repairSqlPath),
      verifySql: repoRel(verifySqlPath),
    },
  }, null, 2))
}

main()
