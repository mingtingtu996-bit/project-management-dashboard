import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  checkDefaultMasterPlanRuntimeSeedImportReadiness,
  parseArgs,
} from './check-default-master-plan-runtime-seed-import-readiness.mjs'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs')

test('blocks runtime seed import readiness when gate, explicit flags, operator, or unlock are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-seed-import-readiness-'))
  const importGatePath = path.join(root, 'runtime-seed-import-gate.json')
  const executionPath = path.join(root, 'runtime-seed-import-execution.json')
  const outputPath = path.join(root, 'runtime-seed-import-readiness-seal.json')

  await writeJson(importGatePath, runtimeSeedImportGateFixture({
    status: 'runtime_seed_import_blocked',
    importGate: {
      importAllowed: false,
      importRequired: true,
      importMode: 'local_active_seed_smoke_import',
      localUnlockEnv: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
      remoteUnlockEnv: 'WORKBUDDY_ALLOW_REMOTE_DURATION_ASSET_SEED_SMOKE_IMPORT',
      localUnlockPresent: false,
      remoteUnlockPresent: false,
      allowedCommand: null,
    },
    blockers: [
      'local_supabase_must_be_reachable_before_seed_import',
      'local_duration_asset_seed_import_unlock_required',
    ],
  }))
  await writeJson(executionPath, runtimeSeedImportExecutionFixture())

  try {
    const report = await checkDefaultMasterPlanRuntimeSeedImportReadiness({
      importGate: importGatePath,
      execution: executionPath,
      output: outputPath,
      env: {},
      now: new Date('2026-07-08T03:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.importCommandReady, false)
    assert.equal(report.executionControl.executeReady, false)
    assert.equal(report.unlock.present, false)
    assert.equal(report.blockers.includes('runtime_seed_import_gate_not_allowed'), true)
    assert.equal(report.blockers.includes('runtime_seed_import_execution_allow_import_required'), true)
    assert.equal(report.blockers.includes('runtime_seed_import_seed_smoke_user_id_required'), true)
    assert.equal(report.blockers.includes('runtime_seed_import_unlock_not_present'), true)
    assert.equal(report.mutationBoundary.commandsExecuted, 0)
    assert.equal(report.mutationBoundary.doesNotConnectDatabase, true)
    assert.equal(report.mutationBoundary.doesNotRunRuntimeSeedImport, true)
    assert.equal(report.mutationBoundary.writesAlgorithmSeedRecords, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)

    const written = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(written.status, 'blocked')
    const markdown = await readFile(outputPath.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /runtime_seed_import_gate_not_allowed/)
    assert.match(markdown, /doesNotConnectDatabase: yes/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passes runtime seed import readiness when gate, flags, unlock, operator, and execution evidence align', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-seed-import-readiness-'))
  const importGatePath = path.join(root, 'runtime-seed-import-gate.json')
  const executionPath = path.join(root, 'runtime-seed-import-execution.json')
  const outputPath = path.join(root, 'runtime-seed-import-readiness-seal.json')
  const allowedCommand = 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke'

  await writeJson(importGatePath, runtimeSeedImportGateFixture({
    status: 'runtime_seed_import_allowed',
    importGate: {
      importAllowed: true,
      importRequired: true,
      importMode: 'local_active_seed_smoke_import',
      localUnlockEnv: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
      remoteUnlockEnv: 'WORKBUDDY_ALLOW_REMOTE_DURATION_ASSET_SEED_SMOKE_IMPORT',
      localUnlockPresent: true,
      remoteUnlockPresent: false,
      allowedCommand,
    },
    blockers: [],
  }))
  await writeJson(executionPath, runtimeSeedImportExecutionFixture({
    importGate: {
      status: 'runtime_seed_import_allowed',
      importAllowed: true,
      importMode: 'local_active_seed_smoke_import',
      blockers: [],
      manualActions: [],
    },
    executionControl: {
      executionAllowed: false,
      allowImportFlagPresent: false,
      seedSmokeUserId: null,
      requiredExplicitFlags: ['--allow-import', '--seed-smoke-user-id'],
      governedImportCommand: allowedCommand,
    },
  }))

  try {
    const report = await checkDefaultMasterPlanRuntimeSeedImportReadiness({
      importGate: importGatePath,
      execution: executionPath,
      output: outputPath,
      allowImport: true,
      seedSmokeUserId: '11111111-1111-4111-8111-111111111111',
      env: {
        WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT: '1',
      },
      now: new Date('2026-07-08T03:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_runtime_seed_import_execution')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.importCommandReady, true)
    assert.equal(report.unlock.variable, 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT')
    assert.equal(report.unlock.present, true)
    assert.equal(report.executionControl.executeReady, true)
    assert.equal(report.executionControl.operatorMustRunManually, true)
    assert.equal(report.nextCommands.executeRuntimeSeedImport.includes('--execution'), false)
    assert.equal(report.nextCommands.executeRuntimeSeedImport.includes('--post-import-verification'), true)
    assert.equal(report.nextCommands.executeRuntimeSeedImport.includes('--allow-import'), true)
    assert.equal(report.nextCommands.executeRuntimeSeedImport.includes('--seed-smoke-user-id 11111111-1111-4111-8111-111111111111'), true)
    assert.equal(report.mutationBoundary.commandsExecuted, 0)
    assert.equal(report.mutationBoundary.doesNotRunRuntimeSeedImport, true)
    assert.equal(report.mutationBoundary.writesAlgorithmSeedVersions, false)
    assert.equal(report.mutationBoundary.writesAlgorithmSeedRecords, false)
    assert.equal(report.mutationBoundary.writesAlgorithmSeedImportLogs, false)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime seed import readiness for automation-like seed smoke operators', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-seed-import-readiness-'))
  const importGatePath = path.join(root, 'runtime-seed-import-gate.json')
  const executionPath = path.join(root, 'runtime-seed-import-execution.json')
  const outputPath = path.join(root, 'runtime-seed-import-readiness-seal.json')

  await writeJson(importGatePath, runtimeSeedImportGateFixture({
    status: 'runtime_seed_import_allowed',
    importGate: {
      importAllowed: true,
      importRequired: true,
      importMode: 'local_active_seed_smoke_import',
      localUnlockEnv: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
      localUnlockPresent: true,
      allowedCommand: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke',
    },
    blockers: [],
  }))
  await writeJson(executionPath, runtimeSeedImportExecutionFixture())

  try {
    const report = await checkDefaultMasterPlanRuntimeSeedImportReadiness({
      importGate: importGatePath,
      execution: executionPath,
      output: outputPath,
      allowImport: true,
      seedSmokeUserId: 'codex-runtime-seed-operator',
      env: {
        WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT: '1',
      },
      now: new Date('2026-07-08T03:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.importCommandReady, true)
    assert.equal(report.blockers.includes('human_runtime_seed_import_actor_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses CLI args and writes a JSON CLI summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-seed-import-readiness-cli-'))
  const importGatePath = path.join(root, 'runtime-seed-import-gate.json')
  const executionPath = path.join(root, 'runtime-seed-import-execution.json')
  const outputPath = path.join(root, 'runtime-seed-import-readiness-seal.json')

  await writeJson(importGatePath, runtimeSeedImportGateFixture())
  await writeJson(executionPath, runtimeSeedImportExecutionFixture())

  try {
    const parsed = parseArgs([
      '--import-gate',
      importGatePath,
      '--execution',
      executionPath,
      '--output',
      outputPath,
      '--allow-import',
      '--seed-smoke-user-id',
      '11111111-1111-4111-8111-111111111111',
    ])
    assert.equal(parsed.importGate, path.resolve(importGatePath))
    assert.equal(parsed.execution, path.resolve(executionPath))
    assert.equal(parsed.output, path.resolve(outputPath))
    assert.equal(parsed.allowImport, true)
    assert.equal(parsed.seedSmokeUserId, '11111111-1111-4111-8111-111111111111')

    const { stdout } = await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--import-gate',
      importGatePath,
      '--execution',
      executionPath,
      '--output',
      outputPath,
    ], {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT: '',
      },
    })
    const summary = JSON.parse(stdout)
    assert.equal(summary.status, 'blocked')
    assert.equal(summary.output.endsWith('runtime-seed-import-readiness-seal.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function runtimeSeedImportGateFixture(overrides = {}) {
  const importGate = {
    importAllowed: false,
    importRequired: true,
    importMode: 'local_active_seed_smoke_import',
    localUnlockEnv: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
    remoteUnlockEnv: 'WORKBUDDY_ALLOW_REMOTE_DURATION_ASSET_SEED_SMOKE_IMPORT',
    localUnlockPresent: false,
    remoteUnlockPresent: false,
    allowedCommand: null,
    ...overrides.importGate,
  }
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
    source: 'build-default-master-plan-runtime-seed-import-gate',
    generatedAt: '2026-07-08T02:00:00.000Z',
    status: 'runtime_seed_import_blocked',
    target: {
      targetClass: 'local_supabase',
      host: '127.0.0.1',
      port: 54321,
    },
    coverage: {
      requiredStableCodeCount: 19,
      coveredStableCodeCount: 19,
      missingStableCodeCount: 0,
      missingStableCodes: [],
    },
    activation: {
      status: 'ready_for_governed_seed_activation',
      readyForActivation: true,
      usesDurationAssetActivation: true,
    },
    importGate,
    blockers: ['local_duration_asset_seed_import_unlock_required'],
    manualActions: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1'],
    productionReady: false,
    mutationBoundary: {
      readsRuntimeSeedEnvironmentReport: true,
      readsRuntimeSeedCoveragePackage: true,
      readsEnvUnlockFlags: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
    ...overrides,
    importGate,
  }
}

function runtimeSeedImportExecutionFixture(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-execution/v1',
    source: 'run-default-master-plan-runtime-seed-import-execution',
    generatedAt: '2026-07-08T02:00:00.000Z',
    status: 'runtime_seed_import_execution_blocked',
    importGate: {
      status: 'runtime_seed_import_blocked',
      importAllowed: false,
      importMode: 'local_active_seed_smoke_import',
      blockers: ['local_duration_asset_seed_import_unlock_required'],
      manualActions: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1'],
    },
    executionControl: {
      executionAllowed: false,
      allowImportFlagPresent: false,
      seedSmokeUserId: null,
      requiredExplicitFlags: ['--allow-import', '--seed-smoke-user-id'],
      governedImportCommand: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke',
    },
    steps: [],
    blockers: [
      'runtime_seed_import_gate_not_allowed',
      'runtime_seed_import_execution_allow_import_required',
      'runtime_seed_import_seed_smoke_user_id_required',
    ],
    productionReady: false,
    mutationBoundary: {
      readsRuntimeSeedImportGate: true,
      writesEvidenceReportsOnly: true,
      mayWriteAlgorithmSeedVersionsOnlyWhenExecutionAllowed: true,
      mayWriteAlgorithmSeedRecordsOnlyWhenExecutionAllowed: true,
      mayWriteAlgorithmSeedImportLogsOnlyWhenExecutionAllowed: true,
      writesProductionTablesOutsideAlgorithmSeedImport: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
      executesRuntimeSeedImport: false,
    },
    ...overrides,
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
