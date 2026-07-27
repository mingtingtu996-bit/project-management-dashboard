import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  checkDefaultMasterPlanCandidateRefreshExecutionReadiness,
  parseArgs,
} from './check-default-master-plan-candidate-refresh-execution-readiness.mjs'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs')

test('blocks candidate refresh execution readiness until the explicit unlock is present', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-readiness-'))
  const authorizationPackagePath = path.join(root, 'candidate-refresh-authorization-package.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const outputPath = path.join(root, 'candidate-refresh-execution-readiness-seal.json')

  await writeJson(preflightPath, preflightFixture())
  await writeJson(authorizationPackagePath, authorizationPackageFixture({
    authorizationPackagePath,
    preflightPath,
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionReadiness({
      authorizationPackage: authorizationPackagePath,
      preflight: preflightPath,
      output: outputPath,
      env: {},
      now: new Date('2026-07-08T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.executionCommandReady, true)
    assert.equal(report.unlock.present, false)
    assert.equal(report.blockers.includes('candidate_refresh_execution_unlock_not_present'), true)
    assert.equal(report.executionControl.executeReady, false)
    assert.equal(report.mutationBoundary.doesNotConnectDatabase, true)
    assert.equal(report.mutationBoundary.commandsExecuted, 0)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.status, 'blocked')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate_refresh_execution_unlock_not_present/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passes candidate refresh execution readiness when command, preflight, authorization, and unlock align', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-readiness-'))
  const authorizationPackagePath = path.join(root, 'candidate-refresh-authorization-package.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const outputPath = path.join(root, 'candidate-refresh-execution-readiness-seal.json')

  await writeJson(preflightPath, preflightFixture())
  await writeJson(authorizationPackagePath, authorizationPackageFixture({
    authorizationPackagePath,
    preflightPath,
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionReadiness({
      authorizationPackage: authorizationPackagePath,
      preflight: preflightPath,
      output: outputPath,
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      now: new Date('2026-07-08T01:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_candidate_refresh_execution')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.unlock.present, true)
    assert.equal(report.executionCommandReady, true)
    assert.equal(report.executionControl.executeReady, true)
    assert.equal(report.executionControl.operatorMustRunManually, true)
    assert.equal(report.mutationBoundary.doesNotConnectDatabase, true)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate refresh execution readiness when the sealed command omits the preflight binding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-readiness-'))
  const authorizationPackagePath = path.join(root, 'candidate-refresh-authorization-package.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const outputPath = path.join(root, 'candidate-refresh-execution-readiness-seal.json')

  await writeJson(preflightPath, preflightFixture())
  await writeJson(authorizationPackagePath, authorizationPackageFixture({
    authorizationPackagePath,
    preflightPath,
    commandOverrides: {
      includePreflight: false,
    },
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionReadiness({
      authorizationPackage: authorizationPackagePath,
      preflight: preflightPath,
      output: outputPath,
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '1',
      },
      now: new Date('2026-07-08T01:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.executionCommandReady, false)
    assert.equal(report.blockers.includes('candidate_refresh_execution_command_preflight_flag_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses CLI args and writes a JSON CLI summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-readiness-cli-'))
  const authorizationPackagePath = path.join(root, 'candidate-refresh-authorization-package.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const outputPath = path.join(root, 'candidate-refresh-execution-readiness-seal.json')

  await writeJson(preflightPath, preflightFixture())
  await writeJson(authorizationPackagePath, authorizationPackageFixture({
    authorizationPackagePath,
    preflightPath,
  }))

  try {
    const parsed = parseArgs([
      '--authorization-package',
      authorizationPackagePath,
      '--preflight',
      preflightPath,
      '--output',
      outputPath,
    ])
    assert.equal(parsed.authorizationPackage, path.resolve(authorizationPackagePath))
    assert.equal(parsed.preflight, path.resolve(preflightPath))
    assert.equal(parsed.output, path.resolve(outputPath))

    const { stdout } = await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--authorization-package',
      authorizationPackagePath,
      '--preflight',
      preflightPath,
      '--output',
      outputPath,
    ], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH: '',
      },
    })
    const summary = JSON.parse(stdout)
    assert.equal(summary.status, 'blocked')
    assert.equal(summary.output.endsWith('candidate-refresh-execution-readiness-seal.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function preflightFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'ready_for_execute',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    mayExecuteCandidateRefresh: true,
    blockers: [],
    executionPlan: {
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-08',
    },
  }
}

function authorizationPackageFixture({
  authorizationPackagePath,
  preflightPath,
  commandOverrides = {},
}) {
  const command = buildExecuteCommand({
    authorizationPackagePath,
    preflightPath,
    includePreflight: commandOverrides.includePreflight !== false,
  })
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-authorization-package/v1',
    status: 'authorization_package_ready',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    environment: 'staging',
    preflightReady: true,
    preflightRef: `candidate_refresh_execution_preflight:${repoRelativeForTest(preflightPath)}#sha256=${'a'.repeat(64)}`,
    executionStatus: 'candidate_refresh_execution_blocked',
    packageReadinessBlockers: [],
    executionBlockers: [
      'candidate_refresh_execution_unlock_required',
    ],
    nextCommands: {
      executeCandidateRefresh: command,
    },
    mutationBoundary: {
      packageOnly: true,
      doesNotMutateDatabase: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  }
}

function buildExecuteCommand({
  authorizationPackagePath,
  preflightPath,
  includePreflight,
}) {
  const parts = [
    'node',
    'project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs',
    '--refresh-package',
    'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json',
  ]
  if (includePreflight) {
    parts.push('--preflight', repoRelativeForTest(preflightPath))
  }
  parts.push(
    '--authorization-package',
    repoRelativeForTest(authorizationPackagePath),
    '--readiness-seal',
    repoRelativeForTest(path.join(path.dirname(authorizationPackagePath), 'candidate-refresh-execution-readiness-seal.json')),
    '--environment',
    'staging',
    '--refreshed-by',
    '11111111-1111-4111-8111-111111111111',
    '--operator-approval-ref',
    'pm-approval:baseline-school:2026-07-08',
    '--mode',
    'execute',
    '--allow-refresh',
  )
  return parts.join(' ')
}

function repoRelativeForTest(filePath) {
  return path.relative(path.resolve('.'), path.resolve(filePath)).replaceAll('\\', '/')
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
