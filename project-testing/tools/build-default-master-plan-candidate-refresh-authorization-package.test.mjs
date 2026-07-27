import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  buildDefaultMasterPlanCandidateRefreshAuthorizationPackage,
  parseArgs,
} from './build-default-master-plan-candidate-refresh-authorization-package.mjs'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs')

test('builds a no-write candidate refresh authorization package from handoff and preflight', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-auth-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const executionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'candidate-refresh-authorization-package.json')
  const templatePath = path.join(root, 'candidate-refresh-authorization.operator-fill-template.json')
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')

  await writeJson(handoffPath, {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    status: 'blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'runtime.default_master_plan.project-1',
    environment: 'staging',
    candidateRefreshExecution: {
      executionGatePlan: {
        status: 'blocked',
        requiredStepIds: ['set_candidate_refresh_execution_unlock'],
        blockedStepIds: ['rerun_candidate_refresh_execution_after_gate'],
      },
    },
  })
  await writeJson(preflightPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    status: 'ready_for_execute',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    refreshPackageRef: `candidate_refresh_package:${path.relative(process.cwd(), refreshPackagePath).replaceAll('\\', '/')}#sha256=${'a'.repeat(64)}`,
    mayExecuteCandidateRefresh: true,
    blockers: [],
    executionPlan: {
      mode: 'execute',
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-04',
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH',
      unlockPresent: true,
      allowedCommand: 'node project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs --mode execute --allow-refresh',
    },
  })
  await writeJson(executionPath, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution/v1',
    status: 'candidate_refresh_execution_blocked',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    businessType: 'school',
    executionControl: {
      executionAllowed: false,
      environment: 'staging',
      mode: 'dry-run',
    },
    blockers: [
      'candidate_refresh_execution_unlock_required',
      'candidate_refresh_execution_allow_refresh_required',
    ],
    executionGatePlan: {
      status: 'blocked',
      noAutoExecution: true,
      requiredStepIds: [
        'set_candidate_refresh_execution_unlock',
        'run_candidate_refresh_in_execute_mode_with_allow_flag',
      ],
      blockedStepIds: ['rerun_candidate_refresh_execution_after_gate'],
      orderedSteps: [{
        id: 'set_candidate_refresh_execution_unlock',
        status: 'required',
        blockerCodes: ['candidate_refresh_execution_unlock_required'],
      }],
    },
    dbRepairPlan: {
      status: 'not_required_before_db_execution',
      requiredStepIds: [],
      blockedStepIds: [],
      orderedSteps: [],
    },
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshAuthorizationPackage({
      handoff: handoffPath,
      preflight: preflightPath,
      execution: executionPath,
      output: outputPath,
      templateOutput: templatePath,
      now: new Date('2026-07-07T15:00:00.000Z'),
    })
    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    const template = JSON.parse(await readFile(templatePath, 'utf8'))
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')

    assert.equal(report.status, 'authorization_package_ready')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.packageReadinessBlockers, [])
    assert.equal(report.mutationBoundary.packageOnly, true)
    assert.equal(report.mutationBoundary.doesNotMutateDatabase, true)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
    assert.equal(report.nextCommands.executeCandidateRefresh.includes('--allow-refresh'), true)
    assert.equal(report.nextCommands.executeCandidateRefresh.includes('--mode execute'), true)
    assert.equal(report.nextCommands.executeCandidateRefresh.includes('--preflight'), true)
    assert.equal(report.nextCommands.executeCandidateRefresh.includes('--authorization-package'), true)
    assert.equal(report.nextCommands.executeCandidateRefresh.includes('--operator-approval-ref'), true)
    assert.equal(report.executionGatePlan.requiredStepIds.includes('set_candidate_refresh_execution_unlock'), true)
    assert.equal(written.operatorTemplateRef.endsWith('candidate-refresh-authorization.operator-fill-template.json'), true)
    assert.equal(template.templateOnly, true)
    assert.equal(template.requiredUnlock.variable, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH')
    assert.equal(template.execution.allowRefresh, true)
    assert.equal(template.execution.command.includes('--preflight'), true)
    assert.equal(template.execution.command.includes('--authorization-package'), true)
    assert.match(markdown, /authorization_package_ready/)
    assert.match(markdown, /executeCandidateRefresh/)
    assert.match(markdown, /doesNotMutateDatabase: true/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks authorization package until preflight is ready and approval fields exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-auth-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const executionPath = path.join(root, 'candidate-refresh-execution.json')
  const outputPath = path.join(root, 'candidate-refresh-authorization-package.json')
  const templatePath = path.join(root, 'candidate-refresh-authorization.operator-fill-template.json')

  await writeJson(handoffPath, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
  })
  await writeJson(preflightPath, {
    status: 'blocked',
    mayExecuteCandidateRefresh: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    executionPlan: {
      environment: 'staging',
    },
  })
  await writeJson(executionPath, {
    status: 'candidate_refresh_execution_blocked',
    blockers: ['candidate_refresh_operator_approval_required'],
  })

  try {
    const report = await buildDefaultMasterPlanCandidateRefreshAuthorizationPackage({
      handoff: handoffPath,
      preflight: preflightPath,
      execution: executionPath,
      output: outputPath,
      templateOutput: templatePath,
      now: new Date('2026-07-07T15:05:00.000Z'),
    })

    assert.equal(report.status, 'authorization_package_blocked')
    assert.deepEqual(report.packageReadinessBlockers, [
      'candidate_refresh_preflight_not_ready_for_execute',
      'candidate_refresh_operator_approval_ref_required',
      'candidate_refresh_refreshed_by_required',
    ])
    assert.equal(report.mutationBoundary.commandsExecuted, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('refuses to write secret-like candidate refresh authorization output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-auth-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const outputPath = path.join(root, 'candidate-refresh-authorization-package.json')

  await writeJson(handoffPath, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
  })
  await writeJson(preflightPath, {
    status: 'ready_for_execute',
    mayExecuteCandidateRefresh: true,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    refreshPackageRef: `candidate_refresh_package:${path.relative(process.cwd(), path.join(root, 'candidate-refresh-package.json')).replaceAll('\\', '/')}#sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
    executionPlan: {
      environment: 'staging',
      refreshedBy: '11111111-1111-4111-8111-111111111111',
      operatorApprovalRef: 'postgresql://user:password@example/db',
    },
  })

  try {
    await assert.rejects(
      buildDefaultMasterPlanCandidateRefreshAuthorizationPackage({
        handoff: handoffPath,
        preflight: preflightPath,
        output: outputPath,
        now: new Date('2026-07-07T15:10:00.000Z'),
      }),
      /refusing_to_write_candidate_refresh_authorization_package_with_secret_like_text/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses CLI args and writes CLI summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-refresh-auth-'))
  const handoffPath = path.join(root, 'operator-handoff.json')
  const preflightPath = path.join(root, 'candidate-refresh-execution-preflight.json')
  const outputPath = path.join(root, 'candidate-refresh-authorization-package.json')
  const templatePath = path.join(root, 'candidate-refresh-authorization.operator-fill-template.json')

  await writeJson(handoffPath, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
  })
  await writeJson(preflightPath, {
    status: 'blocked',
    mayExecuteCandidateRefresh: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
  })

  try {
    const parsed = parseArgs([
      '--handoff',
      handoffPath,
      '--preflight',
      preflightPath,
      '--output',
      outputPath,
      '--template-output',
      templatePath,
    ])
    assert.equal(parsed.handoff, path.resolve(handoffPath))
    assert.equal(parsed.templateOutput, path.resolve(templatePath))

    const { stdout } = await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--handoff',
      handoffPath,
      '--preflight',
      preflightPath,
      '--output',
      outputPath,
      '--template-output',
      templatePath,
    ], { cwd: path.resolve('.') })
    const summary = JSON.parse(stdout)
    assert.equal(summary.status, 'authorization_package_blocked')
    assert.equal(summary.productionReady, false)
    assert.equal(summary.output.endsWith('candidate-refresh-authorization-package.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
