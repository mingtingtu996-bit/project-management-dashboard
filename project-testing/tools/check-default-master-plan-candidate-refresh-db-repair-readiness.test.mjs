import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  checkDefaultMasterPlanCandidateRefreshDbRepairReadiness,
  parseArgs,
} from './check-default-master-plan-candidate-refresh-db-repair-readiness.mjs'

test('parseArgs accepts explicit execution, env, and output paths', () => {
  const args = parseArgs([
    '--execution',
    'tmp/candidate-refresh-execution.json',
    '--env-file',
    'tmp/server.env',
    '--output',
    'tmp/candidate-refresh-db-repair-readiness.json',
    '--markdown',
    'tmp/candidate-refresh-db-repair-readiness.md',
    '--json',
  ])

  assert.equal(args.execution.endsWith(path.join('tmp', 'candidate-refresh-execution.json')), true)
  assert.equal(args.envFile.endsWith(path.join('tmp', 'server.env')), true)
  assert.equal(args.output.endsWith(path.join('tmp', 'candidate-refresh-db-repair-readiness.json')), true)
  assert.equal(args.markdown.endsWith(path.join('tmp', 'candidate-refresh-db-repair-readiness.md')), true)
  assert.equal(args.json, true)
})

test('blocks rerun when current env fingerprint is the same failed authentication target', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-db-repair-same-'))
  const envPath = path.join(root, 'server.env')
  const executionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'candidate-refresh-db-repair-readiness.json')
  const markdownPath = path.join(root, 'candidate-refresh-db-repair-readiness.md')

  try {
    const envText = envTextForPassword('old-password')
    await writeFile(envPath, envText, 'utf8')
    await writeExecutionReport(executionPath, envText, {
      status: 'candidate_refresh_execution_failed',
      failureClass: 'authentication_failed',
      errorCode: '28P01',
    })

    const report = await checkDefaultMasterPlanCandidateRefreshDbRepairReadiness({
      argv: [
        '--execution',
        executionPath,
        '--env-file',
        envPath,
        '--output',
        outputPath,
        '--markdown',
        markdownPath,
      ],
      now: new Date('2026-07-08T12:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-candidate-refresh-db-repair-readiness/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.currentEnvChangedSinceFailedExecution, false)
    assert.equal(report.summary.sameSupabaseProjectRef, true)
    assert.equal(report.summary.mayRerunCandidateRefreshExecution, false)
    assert.equal(report.blockers.includes('candidate_refresh_db_credentials_unchanged_since_authentication_failure'), true)
    assert.equal(report.evidenceBoundary.canCloseProductionReadinessGates, false)
    assert.equal(report.mutationBoundary.doesNotConnectDatabase, true)

    const persisted = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(persisted.status, 'blocked')
    const markdown = await readFile(markdownPath, 'utf8')
    assert.match(markdown, /status: blocked/)
    assert.match(markdown, /does_not_connect_database: yes/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows rerun readiness when env fingerprint changes but target identity remains the same', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-db-repair-changed-'))
  const envPath = path.join(root, 'server.env')
  const executionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'candidate-refresh-db-repair-readiness.json')
  const markdownPath = path.join(root, 'candidate-refresh-db-repair-readiness.md')

  try {
    const failedEnvText = envTextForPassword('old-password')
    const repairedEnvText = envTextForPassword('new-password')
    await writeFile(envPath, repairedEnvText, 'utf8')
    await writeExecutionReport(executionPath, failedEnvText, {
      status: 'candidate_refresh_execution_failed',
      failureClass: 'authentication_failed',
      errorCode: '28P01',
    })

    const report = await checkDefaultMasterPlanCandidateRefreshDbRepairReadiness({
      argv: [
        '--execution',
        executionPath,
        '--env-file',
        envPath,
        '--output',
        outputPath,
        '--markdown',
        markdownPath,
      ],
      now: new Date('2026-07-08T12:01:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_candidate_refresh_rerun')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.currentEnvChangedSinceFailedExecution, true)
    assert.equal(report.summary.sameSupabaseProjectRef, true)
    assert.equal(report.summary.sameDatabaseHost, true)
    assert.equal(report.summary.mayRerunCandidateRefreshExecution, true)
    assert.deepEqual(report.blockers, [])
    assert.match(report.nextCommands.rerunCandidateRefreshExecution, /candidate-refresh-execution/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not treat a comment-only env edit as credential repair', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-db-repair-comment-'))
  const envPath = path.join(root, 'server.env')
  const executionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'candidate-refresh-db-repair-readiness.json')
  const markdownPath = path.join(root, 'candidate-refresh-db-repair-readiness.md')

  try {
    const failedEnvText = envTextForPassword('old-password')
    await writeFile(envPath, `${failedEnvText}# unrelated comment\n`, 'utf8')
    await writeExecutionReport(executionPath, failedEnvText)

    const report = await checkDefaultMasterPlanCandidateRefreshDbRepairReadiness({
      argv: ['--execution', executionPath, '--env-file', envPath, '--output', outputPath, '--markdown', markdownPath],
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.summary.currentEnvChangedSinceFailedExecution, true)
    assert.equal(report.summary.connectionCredentialChangedSinceFailedExecution, false)
    assert.equal(report.blockers.includes('candidate_refresh_db_credentials_unchanged_since_authentication_failure'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('requires target reconfirmation when repaired env points at a different project ref', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-db-repair-different-'))
  const envPath = path.join(root, 'server.env')
  const executionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'candidate-refresh-db-repair-readiness.json')
  const markdownPath = path.join(root, 'candidate-refresh-db-repair-readiness.md')

  try {
    const failedEnvText = envTextForPassword('old-password', 'wwdrkjnbvcbfytwnnyvs')
    const differentEnvText = envTextForPassword('new-password', 'differentprojectref')
    await writeFile(envPath, differentEnvText, 'utf8')
    await writeExecutionReport(executionPath, failedEnvText, {
      status: 'candidate_refresh_execution_failed',
      failureClass: 'authentication_failed',
      errorCode: '28P01',
    })

    const report = await checkDefaultMasterPlanCandidateRefreshDbRepairReadiness({
      argv: [
        '--execution',
        executionPath,
        '--env-file',
        envPath,
        '--output',
        outputPath,
        '--markdown',
        markdownPath,
      ],
      now: new Date('2026-07-08T12:02:00.000Z'),
    })

    assert.equal(report.status, 'target_reconfirmation_required')
    assert.equal(report.summary.currentEnvChangedSinceFailedExecution, true)
    assert.equal(report.summary.sameSupabaseProjectRef, false)
    assert.equal(report.summary.mayRerunCandidateRefreshExecution, false)
    assert.equal(report.blockers.includes('candidate_refresh_target_identity_changed_reconfirm_discovery_before_rerun'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeExecutionReport(filePath, envText, overrides = {}) {
  const target = targetForEnvText(envText)
  await writeFile(filePath, `${JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: overrides.status ?? 'candidate_refresh_execution_failed',
    productionReady: false,
    baselineId: 'baseline-id',
    projectId: 'project-id',
    businessType: 'school',
    failureClass: overrides.failureClass ?? 'authentication_failed',
    errorCode: overrides.errorCode ?? '28P01',
    target,
    executionControl: {
      executionAllowed: true,
      executionCommand: 'npm.cmd run evidence:default-master-plan:candidate-refresh-execution',
    },
    nextActions: [
      'Fix or rotate the database credentials in server/.env for SUPABASE_MIGRATION_URL, then rerun candidate refresh execution with the same approval boundary.',
    ],
  }, null, 2)}\n`, 'utf8')
}

function envTextForPassword(password, projectRef = 'wwdrkjnbvcbfytwnnyvs') {
  return `SUPABASE_MIGRATION_URL=postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres\nPGSSLMODE=require\n`
}

function targetForEnvText(envText) {
  const match = envText.match(/SUPABASE_MIGRATION_URL=(.+)/)
  const url = new URL(match[1])
  return {
    envFileRef: 'server/.env',
    envFileReadable: true,
    envFileSha256: createHash('sha256').update(envText).digest('hex'),
    connectionCredentialSha256: createHash('sha256').update(match[1]).digest('hex'),
    connectionSource: 'SUPABASE_MIGRATION_URL',
    databaseHost: url.hostname,
    databasePort: url.port || '5432',
    databaseName: url.pathname.replace(/^\//, ''),
    databaseUser: decodeURIComponent(url.username),
    supabaseProjectRef: url.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1] ?? null,
    hasPassword: Boolean(url.password),
    sslmode: null,
    parseError: null,
  }
}
