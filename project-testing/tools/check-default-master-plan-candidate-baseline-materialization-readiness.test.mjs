import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  checkDefaultMasterPlanCandidateBaselineMaterializationReadiness,
  parseArgs,
} from './check-default-master-plan-candidate-baseline-materialization-readiness.mjs'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs')

test('blocks candidate baseline materialization readiness until unlock and human operator fields exist', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialization-readiness-'))
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'candidate-baseline-materialization-readiness-seal.json')

  await writeJson(refreshPackagePath, refreshPackageFixture())
  await writeJson(materializationPath, materializationFixture({
    refreshPackagePath,
    refreshPackageSha256: await sha256File(refreshPackagePath),
    executionControl: {
      mode: 'dry-run',
      environment: 'staging',
      allowMaterialization: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: false,
      operatorApprovalRef: '',
      materializedBy: '',
    },
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateBaselineMaterializationReadiness({
      refreshPackage: refreshPackagePath,
      materialization: materializationPath,
      output: outputPath,
      env: {},
      now: new Date('2026-07-08T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.materializationCommandReady, false)
    assert.equal(report.unlock.present, false)
    assert.equal(report.executionControl.executeReady, false)
    assert.equal(report.blockers.includes('candidate_baseline_materialization_unlock_not_present'), true)
    assert.equal(report.blockers.includes('candidate_baseline_materialization_operator_approval_ref_required'), true)
    assert.equal(report.blockers.includes('candidate_baseline_materialized_by_required'), true)
    assert.equal(report.mutationBoundary.doesNotConnectDatabase, true)
    assert.equal(report.mutationBoundary.commandsExecuted, 0)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.status, 'blocked')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /candidate_baseline_materialization_unlock_not_present/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passes candidate baseline materialization readiness when command, package, report, unlock, approval, and actor align', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialization-readiness-'))
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'candidate-baseline-materialization-readiness-seal.json')

  await writeJson(refreshPackagePath, refreshPackageFixture())
  await writeJson(materializationPath, materializationFixture({
    refreshPackagePath,
    refreshPackageSha256: await sha256File(refreshPackagePath),
    executionControl: {
      mode: 'dry-run',
      environment: 'staging',
      allowMaterialization: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: false,
      operatorApprovalRef: '',
      materializedBy: '',
    },
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateBaselineMaterializationReadiness({
      refreshPackage: refreshPackagePath,
      materialization: materializationPath,
      output: outputPath,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-08',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      allowMaterialization: true,
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
      now: new Date('2026-07-08T02:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_candidate_baseline_materialization')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.materializationCommandReady, true)
    assert.equal(report.unlock.present, true)
    assert.equal(report.executionControl.executeReady, true)
    assert.equal(report.executionControl.operatorMustRunManually, true)
    assert.equal(report.nextCommands.executeCandidateBaselineMaterialization.includes('--mode execute'), true)
    assert.equal(report.nextCommands.executeCandidateBaselineMaterialization.includes('--allow-materialization'), true)
    assert.equal(report.mutationBoundary.doesNotConnectDatabase, true)
    assert.equal(report.mutationBoundary.writesCandidateBaselines, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate baseline materialization readiness when refresh package contains hard blockers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialization-readiness-'))
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'candidate-baseline-materialization-readiness-seal.json')

  await writeJson(refreshPackagePath, {
    ...refreshPackageFixture(),
    blockers: ['candidate_export_hygiene_blocked'],
  })
  await writeJson(materializationPath, materializationFixture({
    refreshPackagePath,
    packageHardBlockers: ['candidate_export_hygiene_blocked'],
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateBaselineMaterializationReadiness({
      refreshPackage: refreshPackagePath,
      materialization: materializationPath,
      output: outputPath,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-08',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      allowMaterialization: true,
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
      now: new Date('2026-07-08T02:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.materializationCommandReady, true)
  assert.equal(report.blockers.includes('candidate_baseline_materialization_refresh_package_has_unresolved_hard_blockers'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks candidate baseline materialization readiness when materialization references a stale refresh package hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialization-readiness-'))
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'candidate-baseline-materialization-readiness-seal.json')

  await writeJson(refreshPackagePath, refreshPackageFixture())
  await writeJson(materializationPath, materializationFixture({
    refreshPackagePath,
    refreshPackageSha256: '0'.repeat(64),
    executionControl: {
      mode: 'execute',
      environment: 'staging',
      allowMaterialization: true,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: true,
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-08',
      materializedBy: '11111111-1111-4111-8111-111111111111',
    },
  }))

  try {
    const report = await checkDefaultMasterPlanCandidateBaselineMaterializationReadiness({
      refreshPackage: refreshPackagePath,
      materialization: materializationPath,
      output: outputPath,
      environment: 'staging',
      operatorApprovalRef: 'pm-approval:baseline-school:2026-07-08',
      materializedBy: '11111111-1111-4111-8111-111111111111',
      mode: 'execute',
      allowMaterialization: true,
      env: {
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '1',
      },
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.blockers.includes('candidate_baseline_materialization_refresh_package_ref_mismatch'), true)
    assert.equal(report.executionControl.executeReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses CLI args and writes a JSON CLI summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-candidate-baseline-materialization-readiness-cli-'))
  const refreshPackagePath = path.join(root, 'candidate-refresh-package.json')
  const materializationPath = path.join(root, 'candidate-baseline-materialization.json')
  const outputPath = path.join(root, 'candidate-baseline-materialization-readiness-seal.json')

  await writeJson(refreshPackagePath, refreshPackageFixture())
  await writeJson(materializationPath, materializationFixture({ refreshPackagePath }))

  try {
    const parsed = parseArgs([
      '--refresh-package',
      refreshPackagePath,
      '--materialization',
      materializationPath,
      '--output',
      outputPath,
      '--operator-approval-ref',
      'pm-approval:baseline-school:2026-07-08',
      '--materialized-by',
      '11111111-1111-4111-8111-111111111111',
      '--mode',
      'execute',
      '--allow-materialization',
    ])
    assert.equal(parsed.refreshPackage, path.resolve(refreshPackagePath))
    assert.equal(parsed.materialization, path.resolve(materializationPath))
    assert.equal(parsed.output, path.resolve(outputPath))
    assert.equal(parsed.allowMaterialization, true)

    const { stdout } = await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--refresh-package',
      refreshPackagePath,
      '--materialization',
      materializationPath,
      '--output',
      outputPath,
    ], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION: '',
      },
    })
    const summary = JSON.parse(stdout)
    assert.equal(summary.status, 'blocked')
    assert.equal(summary.output.endsWith('candidate-baseline-materialization-readiness-seal.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function refreshPackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    status: 'refresh_required',
    productionReady: false,
    refreshRequired: true,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
    },
    blockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
    ],
    targetReplacementRows: [
      {
        id: 'row-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        startDate: '2026-07-01',
        endDate: '2026-08-05',
      },
    ],
  }
}

function materializationFixture({
  refreshPackagePath,
  refreshPackageSha256 = 'a'.repeat(64),
  executionControl = {},
  packageHardBlockers = [],
} = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization/v1',
    status: 'candidate_baseline_materialization_dry_run',
    productionReady: false,
    baselineId: 'baseline-school',
    projectId: 'project-school',
    businessType: 'school',
    evidence: {
      refreshPackageRef: `candidate_refresh_package:${repoRelativeForTest(refreshPackagePath)}#sha256=${refreshPackageSha256}`,
    },
    executionControl: {
      executionAllowed: false,
      mode: 'dry-run',
      environment: 'staging',
      allowMaterialization: false,
      requiredUnlock: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
      unlockPresent: false,
      operatorApprovalRef: '',
      materializedBy: '',
      ...executionControl,
    },
    packageBlockers: [
      'selected_candidate_export_profile_shape_mismatch',
      'candidate_baseline_refresh_required_before_runtime_publication',
      ...packageHardBlockers,
    ],
    packageHardBlockers,
    materializationPlan: {
      targetReplacementRowCount: 1,
      wouldInsertCandidateBaseline: true,
      wouldInsertCandidateBaselineItems: true,
      diff: {
        missingTargetRowCount: 1,
      },
    },
    blockers: [
      'candidate_baseline_materialization_execute_mode_required',
      'candidate_baseline_materialization_allow_flag_required',
      'candidate_baseline_materialization_unlock_required',
    ],
    mutationBoundary: {
      writesCandidateBaselines: false,
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
    },
  }
}

function repoRelativeForTest(filePath) {
  return path.relative(path.resolve('.'), path.resolve(filePath)).replaceAll('\\', '/')
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath, 'utf8')).digest('hex')
}
