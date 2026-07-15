#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const defaultEnvFile = 'deploy/env/staging.env'
const defaultManifestFile = '.tmp/full-app-test-env/manifest.json'
const defaultRefsEnvFile = '.tmp/v14241-controlled-staging/v14241-controlled-staging.refs.env'
const defaultFixtureRefsFile = '.tmp/v14241-controlled-staging/fixture-refs.sanitized.json'
const defaultReportFile = 'project-testing/reports/release-v1.4.24-20260702-125254/v14241-controlled-staging-refs-refresh.json'

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function parseEnv(text) {
  const env = {}
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const separator = line.indexOf('=')
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = value
  }
  return env
}

function requireValue(value, label) {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`Missing required value: ${label}`)
  return text
}

function rel(path) {
  const abs = resolve(path)
  const relativePath = relative(process.cwd(), abs)
  return relativePath.startsWith('..') ? abs.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

function projectRefFromSupabaseUrl(value) {
  try {
    return new URL(value).hostname.match(/^([^.]+)\.supabase\.co$/)?.[1] ?? null
  } catch {
    return null
  }
}

function assertNoSecretLikeText(value) {
  const text = JSON.stringify(value)
  if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|postgres(?:ql)?:\/\/|password\s*[=:]|service[_-]?role|StrongPass/i.test(text)) {
    throw new Error('refusing_to_write_v14241_refs_refresh_report_with_secret_like_text')
  }
}

async function readJson(path) {
  return JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''))
}

async function maybeSingle(query) {
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ?? null
}

async function selectLatestId(supabase, table, projectId) {
  const { data, error } = await supabase
    .from(table)
    .select('id, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1)
  if (error) return { id: '', queryError: error.message }
  return { id: data?.[0]?.id ?? '', queryError: null }
}

async function countRows(supabase, table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
  if (error) return { count: 0, error: error.message }
  return { count: count ?? 0, error: null }
}

function envLine(key, value) {
  return `${key}=${String(value ?? '').replace(/\r?\n/g, '')}`
}

function scenarioRef(scenarioId, name) {
  return `controlled-staging-ref://v14241/${scenarioId}/${name}`
}

async function main() {
  const envFile = resolve(argValue('--env-file', defaultEnvFile))
  const manifestFile = resolve(argValue('--manifest-file', defaultManifestFile))
  const refsEnvFile = resolve(argValue('--refs-env-file', defaultRefsEnvFile))
  const fixtureRefsFile = resolve(argValue('--fixture-refs-file', defaultFixtureRefsFile))
  const reportFile = resolve(argValue('--report', defaultReportFile))
  const apiBase = argValue('--api-base', 'http://127.0.0.1:3002')
  const clientBase = argValue('--client-base', 'http://127.0.0.1:5173')
  const deploymentVersion = argValue('--deployment-version', `controlled-staging-fullapp-${new Date().toISOString().slice(0, 10)}`)

  const env = parseEnv(await readFile(envFile, 'utf8'))
  const manifest = await readJson(manifestFile)
  const supabaseUrl = requireValue(env.SUPABASE_URL, 'SUPABASE_URL')
  const serviceKey = requireValue(env.SUPABASE_SERVICE_KEY, 'SUPABASE_SERVICE_KEY')
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const standardProjectId = requireValue(manifest.projects?.standard?.id, 'manifest.projects.standard.id')
  const largeProjectId = requireValue(manifest.projects?.large?.id, 'manifest.projects.large.id')
  const emptyProjectId = requireValue(manifest.projects?.empty?.id, 'manifest.projects.empty.id')

  const standardProject = await maybeSingle(
    supabase.from('projects').select('id, name, company_id').eq('id', standardProjectId),
  )
  const largeProject = await maybeSingle(
    supabase.from('projects').select('id, name, company_id').eq('id', largeProjectId),
  )
  const emptyProject = await maybeSingle(
    supabase.from('projects').select('id, name, company_id').eq('id', emptyProjectId),
  )
  if (!standardProject?.company_id) throw new Error('standard project not found in selected staging database')
  if (!largeProject?.id) throw new Error('large project not found in selected staging database')
  if (!emptyProject?.id) throw new Error('empty project not found in selected staging database')

  const accountUsernames = {
    companyAdmin: requireValue(manifest.accounts?.companyAdmin?.username, 'manifest.accounts.companyAdmin.username'),
    owner: requireValue(manifest.accounts?.owner?.username, 'manifest.accounts.owner.username'),
    editor: requireValue(manifest.accounts?.editor?.username, 'manifest.accounts.editor.username'),
    outsider: requireValue(manifest.accounts?.outsider?.username, 'manifest.accounts.outsider.username'),
  }
  const accountPasswords = {
    owner: requireValue(manifest.accounts?.owner?.password, 'manifest.accounts.owner.password'),
    editor: requireValue(manifest.accounts?.editor?.password, 'manifest.accounts.editor.password'),
    outsider: requireValue(manifest.accounts?.outsider?.password, 'manifest.accounts.outsider.password'),
  }
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, last_active_company_id')
    .in('username', Object.values(accountUsernames))
  if (usersError) throw usersError
  const usersByUsername = new Map((users ?? []).map((user) => [user.username, user]))
  for (const [key, username] of Object.entries(accountUsernames)) {
    if (!usersByUsername.has(username)) throw new Error(`missing full-app user for ${key}`)
  }

  const baseline = await selectLatestId(supabase, 'task_baselines', standardProjectId)
  const monthlyPlan = await selectLatestId(supabase, 'monthly_plans', standardProjectId)
  const taskCounts = {
    standard: await countRows(supabase, 'tasks', 'project_id', standardProjectId),
    large: await countRows(supabase, 'tasks', 'project_id', largeProjectId),
  }

  const roleMatrix = {
    companyAdmin: { username: accountUsernames.companyAdmin, userId: usersByUsername.get(accountUsernames.companyAdmin)?.id },
    owner: { username: accountUsernames.owner, userId: usersByUsername.get(accountUsernames.owner)?.id },
    editor: { username: accountUsernames.editor, userId: usersByUsername.get(accountUsernames.editor)?.id },
    outsider: { username: accountUsernames.outsider, userId: usersByUsername.get(accountUsernames.outsider)?.id },
  }
  const roleMatrixJson = JSON.stringify(roleMatrix)

  const refs = {
    V14241_STAGING_API_BASE_URL: apiBase,
    V14241_STAGING_CLIENT_BASE_URL: clientBase,
    V14241_STAGING_DEPLOYMENT_VERSION_REF: deploymentVersion,
    V14241_STAGING_WRITE_APPROVAL_REF: 'approval-ref://user-authorized-controlled-staging-fixture-write-2026-07-07',
    V14241_STAGING_CLEANUP_OWNER_REF: 'owner-ref://v14241/staging/cleanup-owner',
    V14241_STAGING_RETENTION_OWNER_REF: 'owner-ref://v14241/staging/retention-owner',
    V14241_STAGING_ANON_POLICY_REF: 'policy-ref://v14241/staging/anon-policy-readback-required',
    V14241_STAGING_TEST_USER_EMAIL_REF: accountUsernames.owner,
    V14241_STAGING_TEST_USER_PASSWORD_REF: accountPasswords.owner,
    V14241_STAGING_COMPANY_ADMIN_ACCOUNT_REF: accountUsernames.companyAdmin,
    V14241_STAGING_PROJECT_ADMIN_ACCOUNT_REF: accountUsernames.owner,
    V14241_STAGING_EDITOR_ACCOUNT_REF: accountUsernames.editor,
    V14241_STAGING_OUTSIDER_ACCOUNT_REF: accountUsernames.outsider,
    V14241_STAGING_PRIMARY_TESTER_REF: accountUsernames.owner,
    V14241_STAGING_OWNER_USERNAME: accountUsernames.owner,
    V14241_STAGING_OWNER_PASSWORD: accountPasswords.owner,
    V14241_STAGING_EDITOR_USERNAME: accountUsernames.editor,
    V14241_STAGING_EDITOR_PASSWORD: accountPasswords.editor,
    V14241_STAGING_OUTSIDER_USERNAME: accountUsernames.outsider,
    V14241_STAGING_OUTSIDER_PASSWORD: accountPasswords.outsider,
    V14241_STAGING_COMPANY_ID: standardProject.company_id,
    V14241_STAGING_PROJECT_ID: standardProjectId,
    V14241_STAGING_REAL_UAT_01_TARGET_REFS_DISPOSABLE_COMPANY_REF: scenarioRef('REAL-UAT-01', 'disposable-company'),
    V14241_STAGING_REAL_UAT_01_EXPECTED_EVIDENCE_REFS_AUDIT_REF: scenarioRef('REAL-UAT-01', 'audit-readback'),
    V14241_STAGING_REAL_UAT_02_TARGET_REFS_INVITATION_CHANNEL_REF: scenarioRef('REAL-UAT-02', 'api-invitation-channel'),
    V14241_STAGING_REAL_UAT_02_ACTOR_REFS_INVITER_REF: accountUsernames.owner,
    V14241_STAGING_REAL_UAT_02_ACTOR_REFS_INVITED_MEMBER_REF: accountUsernames.editor,
    V14241_STAGING_INVITED_USERNAME: accountUsernames.editor,
    V14241_STAGING_INVITED_PASSWORD: accountPasswords.editor,
    V14241_STAGING_REAL_UAT_03_TARGET_REFS_SECOND_COMPANY_REF: scenarioRef('REAL-UAT-03', 'foreign-company-not-provisioned'),
    V14241_STAGING_REAL_UAT_03_TARGET_REFS_SECOND_PROJECT_REF: emptyProjectId,
    V14241_STAGING_REAL_UAT_03_ACTOR_REFS_ROLE_MATRIX_ACCOUNT_REFS_REF: roleMatrixJson,
    V14241_STAGING_REAL_UAT_04_TARGET_REFS_BASELINE_REF: baseline.id,
    V14241_STAGING_REAL_UAT_04_TARGET_REFS_PUBLICATION_REF: scenarioRef('REAL-UAT-04', 'runtime-publication-evidence-required'),
    V14241_STAGING_REAL_UAT_04_ACTOR_REFS_PLAN_OWNER_REF: accountUsernames.owner,
    V14241_STAGING_REAL_UAT_04_ROLLBACK_REF: scenarioRef('REAL-UAT-04', 'rollback-evidence-required'),
    V14241_STAGING_REAL_UAT_05_TARGET_REFS_LARGE_PROJECT_REF: largeProjectId,
    V14241_STAGING_REAL_UAT_05_TARGET_REFS_CRITICAL_PATH_READBACK_REF: scenarioRef('REAL-UAT-05', 'critical-path-readback'),
    V14241_STAGING_REAL_UAT_05_EXPECTED_EVIDENCE_REFS_PERFORMANCE_THRESHOLD_REF: '2500',
    V14241_STAGING_REAL_UAT_06_TARGET_REFS_MONTHLY_PLAN_REF: monthlyPlan.id,
    V14241_STAGING_REAL_UAT_06_ACTOR_REFS_APPROVER_REF: accountUsernames.owner,
    V14241_STAGING_REAL_UAT_06_EXPECTED_EVIDENCE_REFS_STATE_MACHINE_REF: scenarioRef('REAL-UAT-06', 'state-machine-evidence-required'),
    V14241_STAGING_REAL_UAT_07_TARGET_REFS_DOCUMENT_PACKAGE_REF: scenarioRef('REAL-UAT-07', 'document-package-required'),
    V14241_STAGING_REAL_UAT_07_TARGET_REFS_STORAGE_BUCKET_REF: scenarioRef('REAL-UAT-07', 'storage-bucket-required'),
    V14241_STAGING_REAL_UAT_07_EXPECTED_EVIDENCE_REFS_RETENTION_POLICY_REF: scenarioRef('REAL-UAT-07', 'retention-policy-required'),
    V14241_STAGING_REAL_UAT_08_TARGET_REFS_MATERIAL_RISK_ISSUE_SEED_REF: standardProjectId,
    V14241_STAGING_REAL_UAT_08_ACTOR_REFS_RESPONSIBLE_USER_REF: accountUsernames.owner,
    V14241_STAGING_REAL_UAT_08_EXPECTED_EVIDENCE_REFS_NOTIFICATION_CHANNEL_REF: scenarioRef('REAL-UAT-08', 'notification-channel-required'),
    V14241_STAGING_REAL_UAT_09_TARGET_REFS_METRIC_REGISTRY_REF: 'metric-registry://controlled-staging/project-execution-summary',
    V14241_STAGING_REAL_UAT_09_TARGET_REFS_SNAPSHOT_REF: scenarioRef('REAL-UAT-09', 'snapshot-readback-required'),
    V14241_STAGING_REAL_UAT_09_EXPECTED_EVIDENCE_REFS_EXPORT_SAMPLE_REF: scenarioRef('REAL-UAT-09', 'export-sample-required'),
    V14241_STAGING_REAL_UAT_10_TARGET_REFS_IMPORT_FILE_SET_REF: scenarioRef('REAL-UAT-10', 'import-file-set-required'),
    V14241_STAGING_REAL_UAT_10_TARGET_REFS_EXPORT_VALIDATOR_REF: scenarioRef('REAL-UAT-10', 'export-validator-required'),
    V14241_STAGING_REAL_UAT_10_EXPECTED_EVIDENCE_REFS_PERMISSION_NEGATIVE_REF: scenarioRef('REAL-UAT-10', 'permission-negative-required'),
    V14241_STAGING_REAL_UAT_11_TARGET_REFS_LARGE_DATASET_REF: largeProjectId,
    V14241_STAGING_REAL_UAT_11_TARGET_REFS_LOAD_WINDOW_REF: scenarioRef('REAL-UAT-11', 'load-window-required'),
    V14241_STAGING_REAL_UAT_11_EXPECTED_EVIDENCE_REFS_QUERY_LOG_REF: scenarioRef('REAL-UAT-11', 'query-log-required'),
    V14241_STAGING_REAL_UAT_12_TARGET_REFS_SECURITY_WINDOW_REF: scenarioRef('REAL-UAT-12', 'security-window-required'),
    V14241_STAGING_REAL_UAT_12_TARGET_REFS_PAYLOAD_SET_REF: scenarioRef('REAL-UAT-12', 'payload-set-required'),
    V14241_STAGING_REAL_UAT_12_EXPECTED_EVIDENCE_REFS_HEADER_READBACK_REF: scenarioRef('REAL-UAT-12', 'header-readback-required'),
    V14241_STAGING_REAL_UAT_13_TARGET_REFS_RELEASE_VERSION_REF: deploymentVersion,
    V14241_STAGING_REAL_UAT_13_TARGET_REFS_HEALTHCHECK_URL_REF: `${apiBase.replace(/\/+$/, '')}/api/readyz`,
    V14241_STAGING_REAL_UAT_13_ROLLBACK_REF: scenarioRef('REAL-UAT-13', 'rollback-drill-required'),
    V14241_STAGING_REAL_UAT_14_TARGET_REFS_BACKUP_REF: scenarioRef('REAL-UAT-14', 'backup-required'),
    V14241_STAGING_REAL_UAT_14_TARGET_REFS_RESTORE_DRILL_DB_REF: scenarioRef('REAL-UAT-14', 'restore-drill-required'),
    V14241_STAGING_REAL_UAT_14_TARGET_REFS_MIGRATION_LEDGER_REF: scenarioRef('REAL-UAT-14', 'migration-ledger-required'),
    V14241_STAGING_REAL_UAT_14_TARGET_REFS_OLD_OBJECT_DISPOSITION_REF: scenarioRef('REAL-UAT-14', 'old-object-disposition-required'),
    V14241_STAGING_REAL_UAT_15_TARGET_REFS_ALERT_RECIPIENT_REF: scenarioRef('REAL-UAT-15', 'alert-recipient-required'),
    V14241_STAGING_REAL_UAT_15_TARGET_REFS_ON_CALL_SCHEDULE_REF: scenarioRef('REAL-UAT-15', 'on-call-schedule-required'),
    V14241_STAGING_REAL_UAT_15_TARGET_REFS_RUNBOOK_REF: scenarioRef('REAL-UAT-15', 'runbook-required'),
    V14241_STAGING_REAL_UAT_15_ACTOR_REFS_INCIDENT_COMMANDER_REF: 'owner-ref://v14241/staging/incident-commander',
    V14241_STAGING_REAL_UAT_16_TARGET_REFS_TICKET_REF: scenarioRef('REAL-UAT-16', 'support-ticket-required'),
    V14241_STAGING_REAL_UAT_16_TARGET_REFS_AUDIT_EXPORT_REF: scenarioRef('REAL-UAT-16', 'audit-export-required'),
    V14241_STAGING_REAL_UAT_16_TARGET_REFS_COMPENSATION_TOOL_REF: scenarioRef('REAL-UAT-16', 'compensation-tool-required'),
    V14241_STAGING_REAL_UAT_16_ACTOR_REFS_SUPPORT_ACCOUNT_REF: accountUsernames.companyAdmin,
  }

  const refsText = [
    '# Generated by refresh-v14241-controlled-staging-refs-from-fullapp.mjs',
    '# Contains local controlled-staging test credentials. Keep this file under .tmp and do not copy raw values into reports.',
    ...Object.entries(refs).map(([key, value]) => envLine(key, value)),
    '',
  ].join('\n')
  await mkdir(dirname(refsEnvFile), { recursive: true })
  await writeFile(refsEnvFile, refsText, 'utf8')

  const fixtureRefs = {
    generatedAt: new Date().toISOString(),
    environment: 'controlled-staging-local',
    sourceManifest: rel(manifestFile),
    refsEnvPath: rel(refsEnvFile),
    accountRefs: accountUsernames,
    userRefs: Object.fromEntries(Object.entries(accountUsernames).map(([key, username]) => [key, usersByUsername.get(username)?.id ?? null])),
    targetRefs: {
      companyId: standardProject.company_id,
      standardProjectId,
      emptyProjectId,
      largeProjectId,
      baselineId: baseline.id || null,
      monthlyPlanId: monthlyPlan.id || null,
    },
    counts: {
      standardTaskCount: taskCounts.standard.count,
      largeTaskCount: taskCounts.large.count,
    },
    fixtureActions: [
      'refreshed v14241 controlled staging refs from FULLAPP fixture in the current deploy/env/staging.env database',
      'kept raw credentials only in .tmp refs env and excluded them from release reports',
    ],
  }
  assertNoSecretLikeText(fixtureRefs)
  await mkdir(dirname(fixtureRefsFile), { recursive: true })
  await writeFile(fixtureRefsFile, `${JSON.stringify(fixtureRefs, null, 2)}\n`, 'utf8')

  const report = {
    schemaVersion: 'workbuddy/v14241-controlled-staging-refs-refresh/v1',
    generatedAt: new Date().toISOString(),
    status: taskCounts.large.count >= 2 && standardProject.company_id === largeProject.company_id ? 'pass' : 'blocked',
    environment: 'controlled-staging-local',
    projectRef: projectRefFromSupabaseUrl(supabaseUrl),
    sourceManifest: rel(manifestFile),
    refsEnvPath: rel(refsEnvFile),
    fixtureRefsPath: rel(fixtureRefsFile),
    rawSecretsWrittenToReport: false,
    refsEnvContainsLocalTestCredentials: true,
    targetRefs: fixtureRefs.targetRefs,
    projectCompanyConsistency: {
      standardAndLargeSameCompany: standardProject.company_id === largeProject.company_id,
      emptySameCompany: standardProject.company_id === emptyProject.company_id,
    },
    counts: fixtureRefs.counts,
    warnings: [
      baseline.id ? null : 'baseline_ref_missing_after_fullapp_prepare',
      monthlyPlan.id ? null : 'monthly_plan_ref_missing_after_fullapp_prepare',
      taskCounts.standard.error ? `standard_task_count_error:${taskCounts.standard.error}` : null,
      taskCounts.large.error ? `large_task_count_error:${taskCounts.large.error}` : null,
    ].filter(Boolean),
    mutationBoundary: 'File refresh only after controlled staging FULLAPP fixture preparation; no additional database writes, schema writes, publication writes, rollback writes, live writes, or production writes executed by this script.',
  }
  assertNoSecretLikeText(report)
  await mkdir(dirname(reportFile), { recursive: true })
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    status: report.status,
    refsEnvPath: rel(refsEnvFile),
    fixtureRefsPath: rel(fixtureRefsFile),
    report: rel(reportFile),
    largeTaskCount: taskCounts.large.count,
    warnings: report.warnings,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
