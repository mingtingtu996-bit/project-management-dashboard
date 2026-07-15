#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_STAGING_SUPABASE_PROJECT_REF } from './default-master-plan-env-target.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_ENVIRONMENT_REPORT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-environment.json')
const DEFAULT_COVERAGE_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-coverage-package.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-gate.json')
const LOCAL_IMPORT_UNLOCK_ENV = 'WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT'
const REMOTE_IMPORT_UNLOCK_ENV = 'WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT'
const LOCAL_DURATION_ASSET_IMPORT_UNLOCK_ENV = 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'
const REMOTE_DURATION_ASSET_IMPORT_UNLOCK_ENV = 'WORKBUDDY_ALLOW_REMOTE_DURATION_ASSET_SEED_SMOKE_IMPORT'
const STANDARD_DURATION_SEED_TYPE = 'standard_work_duration'
const T2_RHYTHM_TEMPLATE_SEED_TYPE = 't2_division_rhythm_template'

export function parseArgs(argv) {
  const args = {
    environmentReport: DEFAULT_ENVIRONMENT_REPORT,
    coveragePackage: DEFAULT_COVERAGE_PACKAGE,
    output: DEFAULT_OUTPUT,
    operatorApprovalRef: null,
    failOnBlocked: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--environment-report') {
      args.environmentReport = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--coverage-package') {
      args.coveragePackage = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--operator-approval-ref') {
      args.operatorApprovalRef = String(argv[index + 1] ?? '').trim() || null
      index += 1
      continue
    }
    if (arg === '--fail-on-blocked') {
      args.failOnBlocked = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/build-default-master-plan-runtime-seed-import-gate.mjs [--environment-report <json>] [--coverage-package <json>] [--output <json>] [--operator-approval-ref <ref>] [--fail-on-blocked]')
      process.exit(0)
    }
  }

  return args
}

function text(value) {
  return String(value ?? '').trim()
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values) {
  return [...new Set(readArray(values).map(text).filter(Boolean))]
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function shellArg(value) {
  const normalized = text(value)
  return /^[A-Za-z0-9_./:\\-]+$/.test(normalized) ? normalized : JSON.stringify(normalized)
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function envEnabled(env, name) {
  return text(env?.[name]) === '1'
}

function summarizeEvidenceRef(filePath, sha256, record) {
  return {
    path: filePath ? repoRelative(filePath) : null,
    sha256: sha256 || null,
    schemaVersion: text(record.schemaVersion) || null,
    status: text(record.status) || null,
    source: text(record.source) || null,
  }
}

function buildLocalGate({
  environmentReport,
  localUnlocked,
  localUnlockEnv = LOCAL_IMPORT_UNLOCK_ENV,
  localUnlockBlocker = 'local_standard_duration_seed_import_unlock_required',
}) {
  const environmentBlockers = uniqueStrings(environmentReport.environmentBlockers)
  const localTcp = readRecord(environmentReport.localSupabaseTcp)
  const blockers = [
    ...environmentBlockers,
    localTcp.reachable === true ? null : 'local_supabase_must_be_reachable_before_seed_import',
    localUnlocked ? null : localUnlockBlocker,
  ].filter(Boolean)
  return {
    targetClass: 'local_supabase',
    importMode: 'local_active_seed_smoke_import',
    unlocked: localUnlocked,
    blockers: uniqueStrings(blockers),
    manualActions: [
      localTcp.reachable === true ? null : 'start local Supabase and rerun runtime seed environment evidence',
      localUnlocked ? null : `${localUnlockEnv}=1`,
    ].filter(Boolean),
  }
}

function buildRemoteGate({
  environmentReport,
  localUnlocked,
  remoteUnlocked,
  operatorApprovalRef,
  localUnlockEnv = LOCAL_IMPORT_UNLOCK_ENV,
  remoteUnlockEnv = REMOTE_IMPORT_UNLOCK_ENV,
  localUnlockBlocker = 'standard_duration_seed_import_unlock_required',
  remoteUnlockBlocker = 'remote_standard_duration_seed_import_unlock_required',
}) {
  const environmentBlockers = uniqueStrings(environmentReport.environmentBlockers)
  const blockers = [
    ...environmentBlockers,
    localUnlocked ? null : localUnlockBlocker,
    remoteUnlocked ? null : remoteUnlockBlocker,
    operatorApprovalRef ? null : 'remote_seed_import_operator_approval_required',
  ].filter(Boolean)
  return {
    targetClass: 'remote_supabase',
    importMode: 'remote_active_seed_smoke_import',
    unlocked: localUnlocked && remoteUnlocked && Boolean(operatorApprovalRef),
    operatorApprovalRef,
    blockers: uniqueStrings(blockers),
    manualActions: [
      localUnlocked ? null : `${localUnlockEnv}=1`,
      remoteUnlocked ? null : `${remoteUnlockEnv}=1`,
      operatorApprovalRef ? null : 'provide --operator-approval-ref for remote seed import',
    ].filter(Boolean),
  }
}

function summarizeActivationCandidatePackage(coveragePackage) {
  const activationPackage = readRecord(coveragePackage.runtimeActivationCandidatePackage)
  const sourceBlockers = uniqueStrings(activationPackage.blockers)
  const activationCandidates = readArray(activationPackage.activationCandidates)
    .map((candidate) => {
      const record = readRecord(candidate)
      const missingStableCodes = uniqueStrings(record.missingRequiredStableCodes)
      return {
        seedType: text(record.seedType),
        status: text(record.status) || null,
        requiredRecordCount: Number(record.requiredRecordCount ?? 0),
        missingRequiredStableCodeCount: missingStableCodes.length,
        missingRequiredStableCodes: missingStableCodes,
      }
    })
    .filter((candidate) => candidate.seedType)
  const readyCandidates = activationCandidates.filter((candidate) => (
    candidate.status === 'ready_for_activation'
    &&
    candidate.requiredRecordCount > 0
    && candidate.missingRequiredStableCodeCount === 0
  ))
  const seedTypesReadyForActivation = uniqueStrings([
    ...readArray(activationPackage.seedTypesReadyForActivation),
    ...readyCandidates.map((candidate) => candidate.seedType),
  ])
  const requestedSeedTypes = uniqueStrings([
    ...seedTypesReadyForActivation,
    ...activationCandidates.map((candidate) => candidate.seedType),
  ])
  const includesStandard = requestedSeedTypes.includes(STANDARD_DURATION_SEED_TYPE)
  const includesT2 = requestedSeedTypes.includes(T2_RHYTHM_TEMPLATE_SEED_TYPE)
  const usesDurationAssetActivation = includesStandard && includesT2
  const packageProvided = Object.keys(activationPackage).length > 0
  const activationStatus = text(activationPackage.status)
  const readyForActivation = packageProvided
    && ['ready_for_governed_seed_activation', 'partial_seed_activation_ready'].includes(activationStatus)
    && sourceBlockers.length === 0
    && readyCandidates.length > 0
    && seedTypesReadyForActivation.length > 0
    && activationCandidates.every((candidate) => (
      candidate.status === 'ready_for_activation'
      && candidate.missingRequiredStableCodeCount === 0
    ))
  return {
    packageProvided,
    status: activationStatus || null,
    seedTypesReadyForActivation,
    activationCandidates,
    readyForActivation,
    usesDurationAssetActivation,
    blockers: sourceBlockers,
  }
}

function summarizeGovernancePreflight(coveragePackage) {
  const record = readRecord(coveragePackage.governancePreflight)
  const sourceBlockers = uniqueStrings(record.blockers)
  const requiredSeedTypes = [STANDARD_DURATION_SEED_TYPE, T2_RHYTHM_TEMPLATE_SEED_TYPE]
  const seedTypesReadyForImport = uniqueStrings(record.seedTypesReadyForImport)
  const requiredSeedTypesPresent = requiredSeedTypes.every((seedType) => seedTypesReadyForImport.includes(seedType))
  const readyForGovernedImport = text(record.status) === 'runtime_seed_governance_preflight_ready'
    && record.readyForGovernedImport === true
    && requiredSeedTypesPresent
    && sourceBlockers.length === 0
  return {
    status: text(record.status) || 'not_provided',
    readyForGovernedImport,
    requiredSeedTypes,
    seedTypesReadyForImport,
    blockers: uniqueStrings([
      ...sourceBlockers,
      Object.keys(record).length > 0 && !requiredSeedTypesPresent
        ? 'runtime_seed_governance_required_seed_types_missing'
        : null,
      Object.keys(record).length > 0 ? null : 'runtime_seed_governance_preflight_required',
      Object.keys(record).length === 0 || readyForGovernedImport
        ? null
        : 'runtime_seed_governance_preflight_not_ready',
    ]),
  }
}

export function buildRuntimeSeedImportGate({
  environmentReport,
  coveragePackage,
  environmentReportPath = null,
  coveragePackagePath = null,
  environmentReportSha256 = null,
  coveragePackageSha256 = null,
  env = process.env,
  operatorApprovalRef = null,
  expectedStagingProjectRef = DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  generatedAt = new Date().toISOString(),
}) {
  const environment = readRecord(environmentReport)
  const coverage = readRecord(coveragePackage)
  const target = readRecord(environment.currentRuntimeTarget)
  const coverageSummary = readRecord(coverage.coverage)
  const importReadiness = readRecord(coverage.importReadiness)
  const activation = summarizeActivationCandidatePackage(coverage)
  const governancePreflight = summarizeGovernancePreflight(coverage)
  const targetClass = text(target.targetClass) || 'unknown'
  const targetFingerprint = text(target.targetFingerprint)
  const targetEnvFileRef = text(target.envFileRef)
  const targetEnvFileSha256 = text(target.envFileSha256)
  const localUnlockEnv = activation.usesDurationAssetActivation ? LOCAL_DURATION_ASSET_IMPORT_UNLOCK_ENV : LOCAL_IMPORT_UNLOCK_ENV
  const remoteUnlockEnv = activation.usesDurationAssetActivation ? REMOTE_DURATION_ASSET_IMPORT_UNLOCK_ENV : REMOTE_IMPORT_UNLOCK_ENV
  const localUnlockBlocker = activation.usesDurationAssetActivation
    ? 'local_duration_asset_seed_import_unlock_required'
    : 'local_standard_duration_seed_import_unlock_required'
  const remoteLocalUnlockBlocker = activation.usesDurationAssetActivation
    ? 'duration_asset_seed_import_unlock_required'
    : 'standard_duration_seed_import_unlock_required'
  const remoteUnlockBlocker = activation.usesDurationAssetActivation
    ? 'remote_duration_asset_seed_import_unlock_required'
    : 'remote_standard_duration_seed_import_unlock_required'
  const localUnlocked = envEnabled(env, localUnlockEnv)
  const remoteUnlocked = envEnabled(env, remoteUnlockEnv)
  const runtimeSeedImportRequired = importReadiness.runtimeSeedImportRequired !== false
  const runtimeSeedEvidenceAlreadyReady = importReadiness.runtimeSeedEvidenceAlreadyReady === true
  const importCommandBase = activation.usesDurationAssetActivation
    ? 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke'
    : 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-standard-duration-seed-smoke'
  const allowedCommand = [
    importCommandBase,
    targetEnvFileRef ? `--env-file ${shellArg(targetEnvFileRef)}` : null,
    targetEnvFileSha256 ? `--expected-env-file-sha256 ${targetEnvFileSha256}` : null,
    targetFingerprint ? `--expected-target-fingerprint ${targetFingerprint}` : null,
  ].filter(Boolean).join(' ')

  if (!runtimeSeedImportRequired || text(coverage.status) === 'runtime_seed_evidence_ready_no_import_required') {
    const blockers = uniqueStrings(governancePreflight.blockers)
    const governanceReady = blockers.length === 0 && governancePreflight.readyForGovernedImport
    return {
      schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
      source: 'build-default-master-plan-runtime-seed-import-gate',
      generatedAt,
      status: governanceReady ? 'runtime_seed_import_not_required' : 'runtime_seed_import_blocked',
      evidence: {
        environmentReport: summarizeEvidenceRef(environmentReportPath, environmentReportSha256, environment),
        coveragePackage: summarizeEvidenceRef(coveragePackagePath, coveragePackageSha256, coverage),
      },
      target: {
        targetClass,
        source: text(target.source) || null,
        supabaseUrlPresent: target.supabaseUrlPresent === true,
        supabaseUrlOrigin: targetClass === 'remote_supabase' ? null : text(target.supabaseUrlOrigin) || null,
        supabaseUrlOriginRedacted: targetClass === 'remote_supabase',
        host: targetClass === 'remote_supabase' ? null : text(target.host) || null,
        port: targetClass === 'remote_supabase' ? null : target.port ?? null,
        supabaseProjectRef: text(target.supabaseProjectRef) || null,
        targetFingerprint: targetFingerprint || null,
        envFileRef: targetEnvFileRef || null,
        envFileSha256: targetEnvFileSha256 || null,
      },
      coverage: {
        requiredStableCodeCount: readArray(coverageSummary.requiredStableCodes).length,
        coveredStableCodeCount: Number(coverageSummary.coveredStableCodeCount ?? 0),
        missingStableCodeCount: Number(coverageSummary.missingStableCodeCount ?? 0),
        missingStableCodes: uniqueStrings(coverageSummary.missingStableCodes),
        seedVersion: text(readRecord(coverage.standardWorkDurationSeedSource).seedVersion) || null,
      },
      governancePreflight,
      importGate: {
        importAllowed: false,
        importRequired: false,
        runtimeSeedEvidenceAlreadyReady: true,
        importMode: 'not_required_runtime_seed_evidence_ready',
        localUnlockEnv,
        remoteUnlockEnv,
        localUnlockPresent: localUnlocked,
        remoteUnlockPresent: remoteUnlocked,
        operatorApprovalRef,
        allowedCommand: null,
        requiredPostImportCommands: [],
      },
      blockers,
      manualActions: governanceReady ? [] : ['resolve runtime seed governance blockers even though no import is required'],
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
    }
  }
  const standardCoverageComplete = Number(coverageSummary.missingStableCodeCount ?? 0) === 0
    && Number(coverageSummary.requiredStableCodes?.length ?? coverageSummary.requiredStableCodeCount ?? 0) > 0
    && Number(coverageSummary.coveredStableCodeCount ?? 0) >= Number(coverageSummary.requiredStableCodes?.length ?? 0)
  const staticCoverageComplete = activation.packageProvided
    ? activation.activationCandidates.length > 0
      && activation.activationCandidates.every((candidate) => candidate.missingRequiredStableCodeCount === 0)
    : standardCoverageComplete
  const coverageBlockers = [
    staticCoverageComplete ? null : 'runtime_seed_ts_coverage_must_be_complete',
    text(coverage.status) === 'ts_seed_coverage_complete_runtime_import_still_required' ? null : 'runtime_seed_coverage_package_not_ready',
    activation.packageProvided && !activation.readyForActivation
      ? 'runtime_seed_activation_package_not_ready'
      : null,
    activation.packageProvided && ![
      STANDARD_DURATION_SEED_TYPE,
      T2_RHYTHM_TEMPLATE_SEED_TYPE,
    ].every((seedType) => activation.seedTypesReadyForActivation.includes(seedType))
      ? 'runtime_seed_governance_required_seed_types_missing'
      : null,
  ].filter(Boolean)
  const targetBindingBlockers = [
    targetFingerprint ? null : 'runtime_seed_target_fingerprint_required',
    targetClass !== 'remote_supabase' || targetEnvFileRef ? null : 'runtime_seed_remote_target_env_file_required',
    targetClass !== 'remote_supabase' || targetEnvFileSha256 ? null : 'runtime_seed_remote_target_env_file_hash_required',
    targetClass !== 'remote_supabase' || text(target.supabaseProjectRef) === text(expectedStagingProjectRef)
      ? null
      : 'runtime_seed_remote_target_not_approved_staging_project',
  ].filter(Boolean)

  const targetGate = targetClass === 'remote_supabase'
    ? buildRemoteGate({
        environmentReport: environment,
        localUnlocked,
        remoteUnlocked,
        operatorApprovalRef,
        localUnlockEnv,
        remoteUnlockEnv,
        localUnlockBlocker: remoteLocalUnlockBlocker,
        remoteUnlockBlocker,
      })
    : targetClass === 'local_supabase'
      ? buildLocalGate({
          environmentReport: environment,
          localUnlocked,
          localUnlockEnv,
          localUnlockBlocker,
        })
      : {
          targetClass,
          importMode: 'unknown',
          unlocked: false,
          blockers: ['runtime_seed_target_class_unknown'],
          manualActions: ['provide a classified local or remote Supabase target'],
        }

  const blockers = uniqueStrings([
    ...governancePreflight.blockers,
    ...activation.blockers,
    ...coverageBlockers,
    ...targetBindingBlockers,
    ...targetGate.blockers,
  ])
  const importAllowed = blockers.length === 0
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-gate/v1',
    source: 'build-default-master-plan-runtime-seed-import-gate',
    generatedAt,
    status: importAllowed ? 'runtime_seed_import_allowed' : 'runtime_seed_import_blocked',
    evidence: {
      environmentReport: summarizeEvidenceRef(environmentReportPath, environmentReportSha256, environment),
      coveragePackage: summarizeEvidenceRef(coveragePackagePath, coveragePackageSha256, coverage),
    },
    target: {
      targetClass,
      source: text(target.source) || null,
      supabaseUrlPresent: target.supabaseUrlPresent === true,
      supabaseUrlOrigin: targetClass === 'remote_supabase' ? null : text(target.supabaseUrlOrigin) || null,
      supabaseUrlOriginRedacted: targetClass === 'remote_supabase',
      host: targetClass === 'remote_supabase' ? null : text(target.host) || null,
      port: targetClass === 'remote_supabase' ? null : target.port ?? null,
      supabaseProjectRef: text(target.supabaseProjectRef) || null,
      targetFingerprint: targetFingerprint || null,
      envFileRef: targetEnvFileRef || null,
      envFileSha256: targetEnvFileSha256 || null,
    },
    coverage: {
      requiredStableCodeCount: readArray(coverageSummary.requiredStableCodes).length,
      coveredStableCodeCount: Number(coverageSummary.coveredStableCodeCount ?? 0),
      missingStableCodeCount: Number(coverageSummary.missingStableCodeCount ?? 0),
      missingStableCodes: uniqueStrings(coverageSummary.missingStableCodes),
      seedVersion: text(readRecord(coverage.standardWorkDurationSeedSource).seedVersion) || null,
    },
    activation,
    governancePreflight,
    importGate: {
      importAllowed,
      importRequired: true,
      runtimeSeedEvidenceAlreadyReady,
      importMode: targetGate.importMode,
      localUnlockEnv,
      remoteUnlockEnv,
      localUnlockPresent: localUnlocked,
      remoteUnlockPresent: remoteUnlocked,
      operatorApprovalRef,
      allowedCommand: importAllowed ? allowedCommand : null,
      requiredPostImportCommands: [
        'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs',
        'npm.cmd run evidence:default-master-plan:runtime-seed-preflight',
        'npm.cmd run evidence:default-master-plan:runtime-seed-env',
        'npm.cmd run evidence:default-master-plan:runtime-seed-import-gate',
        'npm.cmd run evidence:default-master-plan:runtime-seed-post-import',
      ],
    },
    blockers,
    manualActions: uniqueStrings([
      ...readArray(targetGate.manualActions),
      ...coverageBlockers.map((item) => item === 'runtime_seed_ts_coverage_must_be_complete'
        ? 'add missing stable codes to standardWorkDurationSeed.ts through normal seed review'
        : null),
    ]),
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
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [environmentReport, coveragePackage, environmentReportSha256, coveragePackageSha256] = await Promise.all([
    readJson(args.environmentReport),
    readJson(args.coveragePackage),
    sha256File(args.environmentReport),
    sha256File(args.coveragePackage),
  ])
  const gate = buildRuntimeSeedImportGate({
    environmentReport,
    coveragePackage,
    environmentReportPath: args.environmentReport,
    coveragePackagePath: args.coveragePackage,
    environmentReportSha256,
    coveragePackageSha256,
    operatorApprovalRef: args.operatorApprovalRef,
  })
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(gate, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: gate.status,
    output: repoRelative(args.output),
    targetClass: gate.target.targetClass,
    importAllowed: gate.importGate.importAllowed,
    coverage: gate.coverage,
    blockers: gate.blockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnBlocked && gate.status === 'runtime_seed_import_blocked') process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
