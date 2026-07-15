import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { classifySupabaseTarget } from './check-default-master-plan-runtime-seed-environment.mjs'

process.env.LOG_LEVEL ||= 'error'
process.env.SUPABASE_URL ||= 'http://127.0.0.1:54321'
process.env.SUPABASE_ANON_KEY ||= 'local-default-master-plan-report-key'
process.env.SUPABASE_SERVICE_KEY ||= process.env.SUPABASE_ANON_KEY

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_DURATION_CALIBRATION_EVIDENCE_PATH = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'default-master-plan-production-readiness',
  'duration-calibration-evidence.json',
)
const STANDARD_DURATION_SEED_SMOKE_ENV = 'WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT'
const REMOTE_STANDARD_DURATION_SEED_SMOKE_ENV = 'WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT'
const DURATION_ASSET_SEED_SMOKE_ENV = 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'
const REMOTE_DURATION_ASSET_SEED_SMOKE_ENV = 'WORKBUDDY_ALLOW_REMOTE_DURATION_ASSET_SEED_SMOKE_IMPORT'
const STANDARD_DURATION_SEED_TYPE = 'standard_work_duration'
const T2_RHYTHM_TEMPLATE_SEED_TYPE = 't2_division_rhythm_template'
const DURATION_ASSET_SEED_TYPES = [
  STANDARD_DURATION_SEED_TYPE,
  T2_RHYTHM_TEMPLATE_SEED_TYPE,
]
const NON_RESIDENTIAL_BUSINESS_TYPES = [
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
]
const DEDICATED_ONLY_BUSINESS_TYPES = new Set([
  'renovation',
  'modular_building',
])
const LEGACY_CANDIDATE_DURATION_CALIBRATION_SOURCE = 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
const LEGACY_CANDIDATE_DURATION_TRUTH_SOURCE = 'asset_backed_candidate_master_plan'
const SYSTEM_STANDARD_DURATION_CALIBRATION_SOURCE = 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules'
const SYSTEM_STANDARD_DURATION_TRUTH_SOURCE = 'system_standard_executable_master_plan'
const DEFAULT_MASTER_PLAN_DEPENDENCY_RULE_SOURCE = 'construction_task_dependency_constraint_rule_system'
const DEFAULT_MASTER_PLAN_DEPENDENCY_WRITE_POLICY = 'wizard_commit_transactional_tasks_and_dependencies'
const DEFAULT_MASTER_PLAN_DEPENDENCY_PREVIEW_BOUNDARY = 'preview_no_write_wizard_commit_transactional'
const TSX_BOOTSTRAP_ENV = 'WORKBUDDY_PROFILE_REPORT_TSX_BOOTSTRAPPED'
const WINDOWS_LOCAL_TSX_COMMAND = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx.cmd')
const POSIX_LOCAL_TSX_COMMAND = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx')
const LOCAL_TSX_CLI_MODULE = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')

function isTsxRuntime() {
  return process.execArgv.some((arg) => (
    /(?:^|[\\/])tsx[\\/](?:dist[\\/])?(?:loader\.mjs|preflight\.cjs)$/i.test(String(arg))
    || /(?:^|[\\/])tsx[\\/]/i.test(String(arg))
  ))
}

function isDirectEntrypoint() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

function traceProfileReport(stage, details = {}) {
  if (process.env.WORKBUDDY_PROFILE_REPORT_TRACE !== '1') return
  console.error(JSON.stringify({ source: 'default-master-plan-profile-report-trace', stage, ...details }))
}

function localTsxCommand() {
  return process.platform === 'win32' ? WINDOWS_LOCAL_TSX_COMMAND : POSIX_LOCAL_TSX_COMMAND
}

function runViaTsxAndExit() {
  const result = spawnSync(process.execPath, [LOCAL_TSX_CLI_MODULE, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      [TSX_BOOTSTRAP_ENV]: '1',
    },
    shell: false,
  })
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

export const probes = [
  {
    businessType: 'general_civil',
    projectTypeCode: 'residential',
    structureTypeCode: 'frame_shear',
    functionalUsageCodes: ['residential'],
    functionalCategoryCodes: ['residential'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'hotel',
    projectTypeCode: 'hotel',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['hotel'],
    functionalCategoryCodes: ['hotel'],
    specialRoomTypeCodes: ['guestroom', 'lobby', 'kitchen'],
    physicalZoneTypeCodes: ['tower', 'basement', 'podium', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'hospital',
    projectTypeCode: 'hospital',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['hospital'],
    functionalCategoryCodes: ['cleanroom'],
    specialRoomTypeCodes: ['cleanroom', 'operating_room'],
    physicalZoneTypeCodes: ['tower', 'basement'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'school',
    projectTypeCode: 'school',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['school'],
    functionalCategoryCodes: ['education'],
    specialRoomTypeCodes: ['classroom', 'laboratory'],
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'playground'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'industrial',
    projectTypeCode: 'industrial',
    structureTypeCode: 'steel_frame',
    functionalUsageCodes: ['industrial'],
    functionalCategoryCodes: ['factory'],
    specialRoomTypeCodes: ['workshop', 'equipment_foundation'],
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'logistics_yard'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'industrial_superflat_floor'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'data_center',
    projectTypeCode: 'data_center',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['data_center'],
    functionalCategoryCodes: ['data_center'],
    specialRoomTypeCodes: ['computer_room', 'battery_room'],
    physicalZoneTypeCodes: ['tower', 'basement'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'transportation_hub',
    projectTypeCode: 'transportation_hub',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['transportation_hub'],
    functionalCategoryCodes: ['transportation'],
    specialRoomTypeCodes: ['concourse', 'platform_interface'],
    physicalZoneTypeCodes: ['tower', 'basement', 'metro_interface', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: ['non_stop_operation'],
  },
  {
    businessType: 'sports_culture',
    projectTypeCode: 'sports_culture',
    structureTypeCode: 'large_span_steel',
    functionalUsageCodes: ['sports_culture'],
    functionalCategoryCodes: ['large_span_public'],
    specialRoomTypeCodes: ['arena', 'auditorium'],
    physicalZoneTypeCodes: ['large_span_hall', 'basement', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'large_span_roof'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'tod_upper_cover',
    projectTypeCode: 'tod_upper_cover',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['tod_upper_cover'],
    functionalCategoryCodes: ['tod'],
    specialRoomTypeCodes: ['podium', 'metro_interface'],
    physicalZoneTypeCodes: ['tower', 'basement', 'metro_interface', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: ['non_stop_operation'],
  },
  {
    businessType: 'renovation',
    projectTypeCode: 'renovation',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['renovation'],
    functionalCategoryCodes: ['renovation'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['renovation_zone', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
    buildingPatternCodes: ['cluster'],
    hardConstraintCodes: ['occupied_renovation'],
  },
  {
    businessType: 'modular_building',
    projectTypeCode: 'modular_building',
    structureTypeCode: 'modular',
    functionalUsageCodes: ['modular_building'],
    functionalCategoryCodes: ['modular_building'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['tower', 'outdoor_site'],
    methodVariantCodes: ['modular_prefab', 'pile_foundation'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
]

export function parseArgs(argv) {
  const parsed = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    requireProductionReady: false,
    projectId: null,
    companyId: null,
    importActiveStandardDurationSeedSmoke: false,
    importActiveT2RhythmTemplateSeedSmoke: false,
    preflightStandardDurationSeedSmoke: false,
    preflightT2RhythmTemplateSeedSmoke: false,
    durationAssetSeedSmokeSeedTypes: [],
    seedSmokeUserId: 'default-master-plan-profile-report',
    generationDepthReviewManifestPath: null,
    durationCalibrationEvidencePath: DEFAULT_DURATION_CALIBRATION_EVIDENCE_PATH,
    businessTypes: [],
    envFile: null,
    expectedEnvFileSha256: null,
    expectedTargetFingerprint: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output-root') {
      parsed.outputRoot = path.resolve(argv[index + 1])
      index += 1
      continue
    }
    if (arg === '--project-id') {
      parsed.projectId = String(argv[index + 1] ?? '').trim() || null
      index += 1
      continue
    }
    if (arg === '--env-file') {
      parsed.envFile = path.resolve(argv[index + 1])
      index += 1
      continue
    }
    if (arg === '--expected-env-file-sha256') {
      parsed.expectedEnvFileSha256 = String(argv[index + 1] ?? '').trim() || null
      index += 1
      continue
    }
    if (arg === '--expected-target-fingerprint') {
      parsed.expectedTargetFingerprint = String(argv[index + 1] ?? '').trim() || null
      index += 1
      continue
    }
    if (arg === '--company-id') {
      parsed.companyId = String(argv[index + 1] ?? '').trim() || null
      index += 1
      continue
    }
    if (arg === '--import-active-standard-duration-seed-smoke') {
      parsed.importActiveStandardDurationSeedSmoke = true
      parsed.durationAssetSeedSmokeSeedTypes = uniqueText([
        ...parsed.durationAssetSeedSmokeSeedTypes,
        STANDARD_DURATION_SEED_TYPE,
      ])
      continue
    }
    if (arg === '--import-active-duration-asset-seeds-smoke') {
      parsed.importActiveStandardDurationSeedSmoke = true
      parsed.importActiveT2RhythmTemplateSeedSmoke = true
      parsed.durationAssetSeedSmokeSeedTypes = [...DURATION_ASSET_SEED_TYPES]
      continue
    }
    if (arg === '--preflight-standard-duration-seed-smoke') {
      parsed.preflightStandardDurationSeedSmoke = true
      parsed.durationAssetSeedSmokeSeedTypes = uniqueText([
        ...parsed.durationAssetSeedSmokeSeedTypes,
        STANDARD_DURATION_SEED_TYPE,
      ])
      continue
    }
    if (arg === '--preflight-duration-asset-seeds-smoke') {
      parsed.preflightStandardDurationSeedSmoke = true
      parsed.preflightT2RhythmTemplateSeedSmoke = true
      parsed.durationAssetSeedSmokeSeedTypes = [...DURATION_ASSET_SEED_TYPES]
      continue
    }
    if (arg === '--seed-smoke-user-id') {
      parsed.seedSmokeUserId = String(argv[index + 1] ?? '').trim() || parsed.seedSmokeUserId
      index += 1
      continue
    }
    if (arg === '--generation-depth-review-manifest') {
      parsed.generationDepthReviewManifestPath = path.resolve(argv[index + 1])
      index += 1
      continue
    }
    if (arg === '--duration-calibration-evidence') {
      parsed.durationCalibrationEvidencePath = path.resolve(argv[index + 1])
      index += 1
      continue
    }
    if (arg === '--business-type') {
      const selected = String(argv[index + 1] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      parsed.businessTypes = uniqueText([...parsed.businessTypes, ...selected])
      index += 1
      continue
    }
    if (arg === '--no-duration-calibration-evidence') {
      parsed.durationCalibrationEvidencePath = null
      continue
    }
    if (arg === '--require-production-ready') {
      parsed.requireProductionReady = true
      continue
    }
    if (arg === '--help') {
      console.log('Usage: npx tsx project-testing/tools/generate-default-master-plan-profile-report.mjs [--output-root <dir>] [--project-id <uuid>] [--company-id <uuid>] [--business-type <code[,code]>] [--require-production-ready] [--generation-depth-review-manifest <json>] [--duration-calibration-evidence <json>] [--no-duration-calibration-evidence] [--preflight-standard-duration-seed-smoke] [--preflight-duration-asset-seeds-smoke] [--import-active-standard-duration-seed-smoke] [--import-active-duration-asset-seeds-smoke] [--seed-smoke-user-id <id>] [--env-file <env>] [--expected-env-file-sha256 <sha256>] [--expected-target-fingerprint <sha256>]')
      process.exit(0)
    }
  }
  if (parsed.durationAssetSeedSmokeSeedTypes.length === 0) {
    parsed.durationAssetSeedSmokeSeedTypes = parsed.importActiveStandardDurationSeedSmoke || parsed.preflightStandardDurationSeedSmoke
      ? [STANDARD_DURATION_SEED_TYPE]
      : []
  }
  return parsed
}

export async function bindRuntimeSeedImportTarget(args, env = process.env) {
  if (args.envFile) {
    const raw = await fs.readFile(args.envFile, 'utf8')
    const actualEnvFileSha256 = createHash('sha256').update(raw).digest('hex')
    if (!args.expectedEnvFileSha256 || actualEnvFileSha256 !== args.expectedEnvFileSha256) {
      const error = new Error('Runtime seed env-file hash does not match the approved import gate')
      error.code = 'RUNTIME_SEED_ENV_FILE_HASH_MISMATCH'
      throw error
    }
    Object.assign(env, dotenv.parse(raw))
  } else if (args.expectedEnvFileSha256) {
    const error = new Error('Runtime seed import gate requires an explicit env file')
    error.code = 'RUNTIME_SEED_ENV_FILE_REQUIRED'
    throw error
  }

  const target = classifySupabaseTarget(env.SUPABASE_URL)
  if (!args.expectedTargetFingerprint || target.targetFingerprint !== args.expectedTargetFingerprint) {
    const error = new Error('Runtime seed target fingerprint does not match the approved import gate')
    error.code = 'RUNTIME_SEED_TARGET_FINGERPRINT_MISMATCH'
    throw error
  }
  return {
    envFileRef: args.envFile ? repoRelativePath(args.envFile) : null,
    envFileSha256: args.expectedEnvFileSha256,
    targetClass: target.targetClass,
    supabaseProjectRef: target.supabaseProjectRef,
    targetFingerprint: target.targetFingerprint,
  }
}

function normalizeRuntimeReferenceDayRecord(item) {
  const record = readRecord(item)
  const stableCode = String(record.stableCode ?? record.stable_code ?? '').trim()
  const p50Days = Number(record.p50Days ?? record.p50_days)
  if (!stableCode || !Number.isFinite(p50Days) || p50Days <= 0) return null
  const p80Days = Number(record.p80Days ?? record.p80_days)
  const sampleCount = Number(record.sampleCount ?? record.sample_count)
  const sourceSampleIds = Array.isArray(record.sourceSampleIds)
    ? record.sourceSampleIds.map((value) => String(value ?? '').trim()).filter(Boolean)
    : Array.isArray(record.source_sample_ids)
      ? record.source_sample_ids.map((value) => String(value ?? '').trim()).filter(Boolean)
      : []
  return {
    stableCode,
    p50Days,
    p80Days: Number.isFinite(p80Days) && p80Days > 0 ? p80Days : null,
    sampleCount: Number.isFinite(sampleCount) && sampleCount > 0 ? sampleCount : null,
    source: String(record.source ?? 'accepted_real_project_outcome').trim() || 'accepted_real_project_outcome',
    sourceSampleIds,
  }
}

function stripUtf8Bom(raw) {
  return String(raw ?? '').replace(/^\uFEFF/, '')
}

async function readJsonFile(filePath) {
  return JSON.parse(stripUtf8Bom(await fs.readFile(filePath, 'utf8')))
}

export async function readRuntimeCalibrationEvidenceInput(evidencePath) {
  if (!evidencePath) return null
  let parsed
  try {
    parsed = await readJsonFile(evidencePath)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
  const evidence = readRecord(parsed)
  if (evidence.status !== 'runtime_calibrated') return null
  if (evidence.evidenceLevel !== 'runtime_calibrated_l2') return null
  const runtimeReferenceDays = (Array.isArray(evidence.runtimeReferenceDays) ? evidence.runtimeReferenceDays : [])
    .map(normalizeRuntimeReferenceDayRecord)
    .filter(Boolean)
  if (runtimeReferenceDays.length === 0) return null
  return {
    status: 'runtime_calibrated',
    evidenceLevel: 'runtime_calibrated_l2',
    runtimeReferenceDays,
    mutationBoundary: {
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedVersions: false,
    },
  }
}

export function buildStandardDurationSeedSmokeImportPlan(args, env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL ?? '').trim()
  const targetClass = classifySeedSmokeTarget(supabaseUrl)
  const seedTypes = normalizeSeedSmokeSeedTypes(args)
  const importRequested = Boolean(args.importActiveStandardDurationSeedSmoke || args.importActiveT2RhythmTemplateSeedSmoke)
  const preflightRequested = Boolean(args.preflightStandardDurationSeedSmoke || args.preflightT2RhythmTemplateSeedSmoke)
  const preflightOnly = Boolean(preflightRequested && !importRequested)
  const primarySeedType = seedTypes[0] ?? STANDARD_DURATION_SEED_TYPE
  const preflightOperations = seedTypes.map((seedType) => `previewAlgorithmSeedImport:${seedType}`)
  const mutationBoundaryFor = (allowed) => ({
    writesAlgorithmSeedVersions: allowed,
    writesAlgorithmSeedRecords: allowed,
    writesAlgorithmSeedImportLogs: allowed,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  })
  if (!importRequested && !preflightRequested) {
    return {
      enabled: false,
      allowed: false,
      mode: 'not_requested',
      seedType: STANDARD_DURATION_SEED_TYPE,
      seedTypes: [],
      targetClass,
      supabaseUrl: supabaseUrl || null,
      preflightOperation: null,
      preflightOperations: [],
      mutationBoundary: mutationBoundaryFor(false),
    }
  }

  if (preflightOnly) {
    return {
      enabled: true,
      allowed: true,
      mode: 'preflight_only',
      seedType: primarySeedType,
      seedTypes,
      targetClass,
      supabaseUrl: supabaseUrl || null,
      preflightOperation: preflightOperations[0] ?? null,
      preflightOperations,
      requiredEnv: null,
      blockedReason: null,
      mutationBoundary: mutationBoundaryFor(false),
    }
  }

  const standardOnly = seedTypes.length === 1 && seedTypes[0] === STANDARD_DURATION_SEED_TYPE
  const localUnlockEnv = standardOnly ? STANDARD_DURATION_SEED_SMOKE_ENV : DURATION_ASSET_SEED_SMOKE_ENV
  const remoteUnlockEnv = standardOnly ? REMOTE_STANDARD_DURATION_SEED_SMOKE_ENV : REMOTE_DURATION_ASSET_SEED_SMOKE_ENV
  const localBlockedReason = standardOnly
    ? 'standard_duration_seed_smoke_env_unlock_required'
    : 'duration_asset_seed_smoke_env_unlock_required'
  const remoteBlockedReason = standardOnly
    ? 'remote_standard_duration_seed_smoke_env_unlock_required'
    : 'remote_duration_asset_seed_smoke_env_unlock_required'
  const unlocked = String(env[localUnlockEnv] ?? '').trim() === '1'
  const remoteUnlocked = String(env[remoteUnlockEnv] ?? '').trim() === '1'
  const remoteBlocked = unlocked && targetClass === 'remote_supabase' && !remoteUnlocked
  const allowed = unlocked && !remoteBlocked
  return {
    enabled: true,
    allowed,
    mode: 'import_active_seed',
    seedType: primarySeedType,
    seedTypes,
    targetClass,
    supabaseUrl: supabaseUrl || null,
    preflightOperation: preflightOperations[0] ?? null,
    preflightOperations,
    requiredEnv: !unlocked
      ? `${localUnlockEnv}=1`
      : remoteBlocked
        ? `${remoteUnlockEnv}=1`
        : null,
    blockedReason: !unlocked
      ? localBlockedReason
      : remoteBlocked
        ? remoteBlockedReason
        : null,
    mutationBoundary: mutationBoundaryFor(allowed),
  }
}

function normalizeSeedSmokeSeedTypes(args) {
  const explicit = Array.isArray(args.durationAssetSeedSmokeSeedTypes)
    ? args.durationAssetSeedSmokeSeedTypes
    : []
  const inferred = [
    args.importActiveStandardDurationSeedSmoke || args.preflightStandardDurationSeedSmoke ? STANDARD_DURATION_SEED_TYPE : null,
    args.importActiveT2RhythmTemplateSeedSmoke || args.preflightT2RhythmTemplateSeedSmoke ? T2_RHYTHM_TEMPLATE_SEED_TYPE : null,
  ].filter(Boolean)
  const seedTypes = uniqueText([...explicit, ...inferred])
    .filter((seedType) => DURATION_ASSET_SEED_TYPES.includes(seedType))
  return seedTypes.length > 0 ? seedTypes : []
}

function classifySeedSmokeTarget(supabaseUrl) {
  const normalized = String(supabaseUrl ?? '').trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (
    normalized.startsWith('http://127.0.0.1')
    || normalized.startsWith('http://localhost')
    || normalized.startsWith('http://[::1]')
  ) return 'local_supabase'
  if (normalized.startsWith('https://') || normalized.startsWith('http://')) return 'remote_supabase'
  return 'unknown'
}

export function normalizeSeedSmokePreflightError(error) {
  const record = error && typeof error === 'object' ? error : null
  const code = record?.code == null ? null : String(record.code)
  const details = record?.details && typeof record.details === 'object'
    ? record.details
    : record
      ? { ...record }
      : undefined
  const message = record?.message
    ? String(record.message)
    : error instanceof Error
      ? error.message
      : record
        ? safeJsonStringify(record)
        : String(error)
  return {
    code,
    message,
    ...(details ? { details } : {}),
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function runStandardDurationSeedSmokeImport(args) {
  const plan = buildStandardDurationSeedSmokeImportPlan(args)
  if (!plan.enabled) return { ...plan, status: 'not_requested' }
  if (!plan.allowed) {
    const error = new Error(`Refusing duration seed smoke import without ${plan.requiredEnv}`)
    error.code = 'STANDARD_DURATION_SEED_SMOKE_IMPORT_LOCKED'
    error.details = plan
    throw error
  }
  const { importV1474AlgorithmSeeds, previewAlgorithmSeedImport } = await import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'algorithmSeedImportService.ts')).href)
  const seedTypes = plan.seedTypes?.length ? plan.seedTypes : [plan.seedType || STANDARD_DURATION_SEED_TYPE]
  const preflightResults = []
  try {
    for (const seedType of seedTypes) {
      preflightResults.push(await previewAlgorithmSeedImport({
        strict: true,
        seedType,
      }))
    }
  } catch (error) {
    const failed = {
      ...plan,
      status: 'preflight_failed',
      preflightError: normalizeSeedSmokePreflightError(error),
    }
    if (plan.mode === 'preflight_only') return failed
    const wrapped = new Error('Standard duration seed smoke import preflight failed')
    wrapped.code = 'STANDARD_DURATION_SEED_SMOKE_PREFLIGHT_FAILED'
    wrapped.details = failed
    throw wrapped
  }
  if (plan.mode === 'preflight_only') {
    return {
      ...plan,
      status: 'preflight_checked',
      preflight: preflightResults[0] ?? null,
      preflights: preflightResults,
    }
  }
  const importResults = []
  for (const seedType of seedTypes) {
    importResults.push(await importV1474AlgorithmSeeds({
      strict: true,
      seedType,
      userId: args.seedSmokeUserId,
    }))
  }
  return {
    ...plan,
    status: 'imported',
    preflight: preflightResults[0] ?? null,
    preflights: preflightResults,
    importResults,
    summaries: importResults.flatMap((result) => result.summaries ?? []),
  }
}

function buildReportProjectId(args, businessType) {
  return args.projectId || `wizard-preview:default-master-plan-profile-report:${businessType}`
}

function buildDefaultMasterPlanProbeClimateProfile(probe) {
  const exposedSiteBusinessTypes = new Set([
    'hotel',
    'hospital',
    'school',
    'industrial',
    'data_center',
    'transportation_hub',
    'sports_culture',
    'tod_upper_cover',
    'modular_building',
  ])
  const isExposedSite = exposedSiteBusinessTypes.has(probe.businessType)
  const climateSignals = isExposedSite ? ['rainy_season'] : []
  const weatherImpactBands = isExposedSite
    ? ['earthwork_rain_sensitive', 'outdoor_utility_rain_sensitive']
    : []
  const profile = {
    climateSignals,
    weatherImpactBands,
    monthlyClimateSignal: climateSignals[0] ?? null,
    rainySeasonMonths: isExposedSite ? [6, 7, 8, 9] : [],
    floodSeasonMonths: isExposedSite ? [6, 7, 8] : [],
    highTempMonths: isExposedSite ? [7, 8] : [],
    coldWeatherMonths: [],
  }
  return {
    ...profile,
    locationFacts: {
      climateRegionCode: isExposedSite ? 'yangtze_delta' : null,
      climateSignals: profile.climateSignals,
      weatherImpactBands: profile.weatherImpactBands,
    },
  }
}

export function buildDefaultMasterPlanProbeFacts(probe) {
  const isRenovation = probe.businessType === 'renovation'
  const climateProfile = buildDefaultMasterPlanProbeClimateProfile(probe)
  return {
    businessType: probe.businessType,
    businessSubtype: probe.businessType,
    projectTypeCode: probe.projectTypeCode,
    structureTypeCode: probe.structureTypeCode,
    methodVariantCodes: probe.methodVariantCodes,
    buildingPatternCodes: probe.buildingPatternCodes,
    functionalUsageCodes: probe.functionalUsageCodes,
    functionalCategoryCodes: probe.functionalCategoryCodes,
    specialRoomTypeCodes: probe.specialRoomTypeCodes,
    physicalZoneTypeCodes: probe.physicalZoneTypeCodes,
    hardConstraintCodes: probe.hardConstraintCodes,
    projectFeatures: {
      foundationFormCodes: isRenovation ? [] : ['bored_pile', 'diaphragm_wall'],
    },
    detailLevel: 'standard',
    buildingCount: isRenovation ? 1 : 3,
    standardFloorCount: isRenovation ? 5 : 24,
    highestBuildingFloorCount: isRenovation ? 5 : 32,
    basementLevelCount: isRenovation ? 0 : 2,
    foundationDepthM: isRenovation ? 0 : 5,
    totalAreaM2: isRenovation ? 18000 : 120000,
    ...climateProfile,
  }
}

function durationDays(row) {
  const start = new Date(`${String(row.values.planned_start_date).slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${String(row.values.planned_end_date).slice(0, 10)}T00:00:00Z`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

function readDateCell(row, key) {
  const value = String(row.values[key] ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function addCalendarDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function readRowCode(row) {
  const values = readRecord(row?.values)
  return String(values.standard_work_code ?? values.template_node_id ?? row?.clientRowId ?? '')
}

function readRowTitle(row) {
  return String(row.values.title ?? row.values.name ?? '')
}

function collectProfileDependencyDateViolations(scheduleRows, profileRows) {
  const rowByClientId = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
  const violations = []
  for (const row of profileRows) {
    const rowStart = readDateCell(row, 'planned_start_date')
    const rowEnd = readDateCell(row, 'planned_end_date')
    for (const dependency of row.predecessorDependencies ?? []) {
      if (dependency.intentCode === 'business_type_profile_phase_anchor') continue
      const predecessor = rowByClientId.get(dependency.clientRowId)
      if (!predecessor) {
        violations.push({
          code: readRowCode(row),
          title: readRowTitle(row),
          predecessorCode: String(dependency.clientRowId ?? ''),
          dependencyType: String(dependency.dependencyType ?? ''),
          reason: 'missing_predecessor_row',
        })
        continue
      }
      const predecessorStart = readDateCell(predecessor, 'planned_start_date')
      const predecessorEnd = readDateCell(predecessor, 'planned_end_date')
      if (!rowStart || !rowEnd || !predecessorStart || !predecessorEnd) {
        violations.push({
          code: readRowCode(row),
          title: readRowTitle(row),
          predecessorCode: readRowCode(predecessor),
          dependencyType: String(dependency.dependencyType ?? ''),
          reason: 'missing_dependency_date',
        })
        continue
      }
      const dependencyType = String(dependency.dependencyType ?? 'FS').toUpperCase()
      const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Number(dependency.lagDays) : 0
      const expectedDate = dependencyType === 'SS'
        ? addCalendarDays(predecessorStart, lagDays)
        : dependencyType === 'FF'
          ? addCalendarDays(predecessorEnd, lagDays)
          : dependencyType === 'SF'
            ? addCalendarDays(predecessorStart, lagDays)
            : addCalendarDays(predecessorEnd, lagDays)
      const actualDate = dependencyType === 'FF' || dependencyType === 'SF' ? rowEnd : rowStart
      if (actualDate < expectedDate) {
        violations.push({
          code: readRowCode(row),
          title: readRowTitle(row),
          predecessorCode: readRowCode(predecessor),
          predecessorTitle: readRowTitle(predecessor),
          dependencyType,
          lagDays,
          expectedDate,
          actualDate,
          reason: 'dependency_date_constraint_not_satisfied',
        })
      }
    }
  }
  return violations
}

export function collectDependencyClosureRows(scheduleRows, selectedRows) {
  const rows = Array.isArray(scheduleRows) ? scheduleRows.filter(Boolean) : []
  const rowByClientRowId = new Map(rows
    .map((row) => [String(row?.clientRowId ?? '').trim(), row])
    .filter(([clientRowId]) => clientRowId))
  const rowsByStandardWorkCode = new Map()
  for (const row of rows) {
    const standardWorkCode = readRowCode(row).trim()
    if (!standardWorkCode) continue
    if (!rowsByStandardWorkCode.has(standardWorkCode)) rowsByStandardWorkCode.set(standardWorkCode, [])
    rowsByStandardWorkCode.get(standardWorkCode).push(row)
  }
  const selectedClientRowIds = new Set((Array.isArray(selectedRows) ? selectedRows : [])
    .map((row) => String(row?.clientRowId ?? '').trim())
    .filter(Boolean))
  const closureClientRowIds = new Set()
  const missingPredecessorClientRowIds = new Set()
  const resolvedPredecessorAliases = new Map()
  const queue = [...selectedClientRowIds]

  while (queue.length > 0) {
    const currentClientRowId = queue.shift()
    const current = rowByClientRowId.get(currentClientRowId)
    if (!current) continue
    for (const dependency of current.predecessorDependencies ?? []) {
      const predecessorClientRowId = String(dependency?.clientRowId ?? '').trim()
      if (!predecessorClientRowId || selectedClientRowIds.has(predecessorClientRowId)) continue
      let predecessor = rowByClientRowId.get(predecessorClientRowId)
      if (!predecessor) {
        const standardWorkCode = standardWorkCodeFromClientRowId(predecessorClientRowId)
        const candidates = standardWorkCode ? (rowsByStandardWorkCode.get(standardWorkCode) ?? []) : []
        if (candidates.length === 1) {
          predecessor = candidates[0]
          const resolvedClientRowId = String(predecessor.clientRowId ?? '').trim()
          resolvedPredecessorAliases.set(predecessorClientRowId, {
            requestedClientRowId: predecessorClientRowId,
            resolvedClientRowId,
            standardWorkCode,
          })
        }
      }
      if (!predecessor) {
        missingPredecessorClientRowIds.add(predecessorClientRowId)
        continue
      }
      if (closureClientRowIds.has(predecessorClientRowId)) continue
      const resolvedClientRowId = String(predecessor.clientRowId ?? '').trim()
      if (!resolvedClientRowId || closureClientRowIds.has(resolvedClientRowId)) continue
      closureClientRowIds.add(resolvedClientRowId)
      queue.push(resolvedClientRowId)
    }
  }

  return {
    rows: rows.filter((row) => closureClientRowIds.has(String(row?.clientRowId ?? '').trim())),
    missingPredecessorClientRowIds: [...missingPredecessorClientRowIds].sort(),
    resolvedPredecessorAliases: [...resolvedPredecessorAliases.values()]
      .sort((left, right) => left.requestedClientRowId.localeCompare(right.requestedClientRowId)),
  }
}

function standardWorkCodeFromClientRowId(clientRowId) {
  const segments = String(clientRowId ?? '').trim().split(':').filter(Boolean)
  return segments.length >= 2 ? segments.at(-2) : ''
}

function applyResolvedPredecessorAliases(row, aliasByRequestedClientRowId) {
  const predecessorDependencies = Array.isArray(row?.predecessorDependencies)
    ? row.predecessorDependencies
    : []
  let changed = false
  const resolvedDependencies = predecessorDependencies.map((dependency) => {
    const requestedClientRowId = String(dependency?.clientRowId ?? '').trim()
    const resolved = aliasByRequestedClientRowId.get(requestedClientRowId)
    if (!resolved) return dependency
    changed = true
    return {
      ...dependency,
      clientRowId: resolved.resolvedClientRowId,
      dependencyAliasResolution: {
        requestedClientRowId,
        resolvedClientRowId: resolved.resolvedClientRowId,
        standardWorkCode: resolved.standardWorkCode,
      },
    }
  })
  return changed
    ? { ...row, predecessorDependencies: resolvedDependencies }
    : row
}

export function buildCandidateCriticalPathEvidence(scheduleRows) {
  const rows = Array.isArray(scheduleRows) ? scheduleRows.filter(Boolean) : []
  const mutationBoundary = {
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
    writesProductionTables: false,
  }
  const nodes = rows.map((row, index) => {
    const clientRowId = String(row.clientRowId ?? row.values?.template_node_id ?? `candidate-row-${index + 1}`)
    return {
      row,
      index,
      clientRowId,
      code: readRowCode(row),
      title: readRowTitle(row),
      durationDays: readCandidateCpmDurationDays(row),
    }
  })
  const nodeById = new Map(nodes.map((node) => [node.clientRowId, node]))
  const predecessors = new Map(nodes.map((node) => [node.clientRowId, []]))
  const successors = new Map(nodes.map((node) => [node.clientRowId, []]))
  const blockers = []
  let dependencyEdgeCount = 0
  let externalAnchorDependencyCount = 0

  for (const node of nodes) {
    for (const dependency of readArray(node.row.predecessorDependencies)) {
      const predecessorId = String(dependency.clientRowId ?? '').trim()
      if (!predecessorId) continue
      if (!nodeById.has(predecessorId)) {
        if (isExternalCandidateCpmAnchor(predecessorId, dependency)) {
          externalAnchorDependencyCount += 1
          continue
        }
        blockers.push(`missing_predecessor_row:${node.code}:${predecessorId}`)
        continue
      }
      const dependencyType = normalizeCandidateCpmDependencyType(dependency.dependencyType)
      const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Number(dependency.lagDays) : 0
      const edge = {
        from: predecessorId,
        to: node.clientRowId,
        dependencyType,
        lagDays,
      }
      predecessors.get(node.clientRowId).push(edge)
      successors.get(predecessorId).push(edge)
      dependencyEdgeCount += 1
    }
  }

  const sortedIds = topologicalCandidateCpmNodeIds(nodes, predecessors, successors)
  if (sortedIds.length !== nodes.length) {
    blockers.push('candidate_cpm_dependency_cycle_or_unresolved_order')
  }

  const earlyStart = new Map()
  const earlyFinish = new Map()
  for (const nodeId of sortedIds) {
    const node = nodeById.get(nodeId)
    let startOffset = 0
    for (const edge of predecessors.get(nodeId) ?? []) {
      const predecessor = nodeById.get(edge.from)
      if (!predecessor) continue
      const predecessorEarlyStart = earlyStart.get(edge.from) ?? 0
      const predecessorEarlyFinish = earlyFinish.get(edge.from) ?? predecessor.durationDays
      startOffset = Math.max(
        startOffset,
        candidateCpmSuccessorStartConstraint({
          dependencyType: edge.dependencyType,
          lagDays: edge.lagDays,
          predecessorEarlyStart,
          predecessorEarlyFinish,
          successorDurationDays: node.durationDays,
        }),
      )
    }
    earlyStart.set(nodeId, Math.max(0, startOffset))
    earlyFinish.set(nodeId, Math.max(0, startOffset) + node.durationDays)
  }

  const projectDurationDays = sortedIds.reduce((max, nodeId) => Math.max(max, earlyFinish.get(nodeId) ?? 0), 0)
  const lateFinish = new Map(nodes.map((node) => [node.clientRowId, projectDurationDays]))
  const lateStart = new Map(nodes.map((node) => [node.clientRowId, projectDurationDays - node.durationDays]))

  for (const nodeId of [...sortedIds].reverse()) {
    const node = nodeById.get(nodeId)
    let latestFinish = lateFinish.get(nodeId) ?? projectDurationDays
    for (const edge of successors.get(nodeId) ?? []) {
      const successor = nodeById.get(edge.to)
      if (!successor) continue
      const successorEarlyStart = earlyStart.get(edge.to) ?? 0
      const successorEarlyFinish = earlyFinish.get(edge.to) ?? successor.durationDays
      latestFinish = Math.min(
        latestFinish,
        candidateCpmPredecessorLateFinishConstraint({
          dependencyType: edge.dependencyType,
          lagDays: edge.lagDays,
          predecessorDurationDays: node.durationDays,
          successorEarlyStart,
          successorEarlyFinish,
        }),
      )
    }
    lateFinish.set(nodeId, latestFinish)
    lateStart.set(nodeId, latestFinish - node.durationDays)
  }

  const evidenceRows = nodes.map((node) => {
    const es = earlyStart.get(node.clientRowId) ?? 0
    const ef = earlyFinish.get(node.clientRowId) ?? node.durationDays
    const ls = lateStart.get(node.clientRowId) ?? es
    const lf = lateFinish.get(node.clientRowId) ?? ef
    const totalFloatDays = Math.max(0, Math.round(ls - es))
    return {
      clientRowId: node.clientRowId,
      code: node.code,
      title: node.title,
      durationDays: node.durationDays,
      earlyStartOffsetDays: Math.round(es),
      earlyFinishOffsetDays: Math.round(ef),
      lateStartOffsetDays: Math.round(ls),
      lateFinishOffsetDays: Math.round(lf),
      totalFloatDays,
      criticalPathCandidate: blockers.length === 0 && totalFloatDays <= 0,
    }
  })

  return {
    source: 'candidate_default_master_plan_no_write_cpm',
    status: blockers.length === 0 ? 'candidate_cpm_evidence_ready' : 'candidate_cpm_evidence_blocked',
    scheduleRowCount: nodes.length,
    dependencyEdgeCount,
    externalAnchorDependencyCount,
    projectDurationDays,
    floatCalculatedRowCount: blockers.length === 0 ? evidenceRows.length : 0,
    criticalPathRowCount: evidenceRows.filter((row) => row.criticalPathCandidate).length,
    blockers,
    mutationBoundary,
    rows: evidenceRows,
  }
}

function isExternalCandidateCpmAnchor(predecessorId, dependency) {
  const id = String(predecessorId ?? '')
  const intentCode = String(dependency?.intentCode ?? '').toLowerCase()
  return id.includes(':template-')
    || id.includes(':scope-')
    || intentCode.includes('phase_anchor')
    || intentCode.includes('external_anchor')
    || intentCode.includes('linked_projection')
}
function readCandidateCpmDurationDays(row) {
  const start = readDateCell(row, 'planned_start_date')
  const end = readDateCell(row, 'planned_end_date')
  if (start && end) {
    const startTime = new Date(`${start}T00:00:00Z`).getTime()
    const endTime = new Date(`${end}T00:00:00Z`).getTime()
    const dateDuration = Math.round((endTime - startTime) / 86_400_000) + 1
    if (Number.isFinite(dateDuration) && dateDuration > 0) return dateDuration
  }
  const calculation = readRecord(row.values?.duration_asset_calculation)
  const candidates = [
    row.values?.smart_reference_days,
    calculation.selectedDurationDays,
    row.durationDays,
    row.selectedDurationDays,
  ]
  const duration = candidates.map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0)
  return Math.max(1, Math.round(duration ?? 1))
}

function normalizeCandidateCpmDependencyType(value) {
  const normalized = String(value ?? 'FS').trim().toUpperCase()
  return ['FS', 'SS', 'FF', 'SF'].includes(normalized) ? normalized : 'FS'
}

function topologicalCandidateCpmNodeIds(nodes, predecessors, successors) {
  const inDegree = new Map(nodes.map((node) => [node.clientRowId, predecessors.get(node.clientRowId)?.length ?? 0]))
  const nodeOrder = new Map(nodes.map((node) => [node.clientRowId, node.index]))
  const queue = nodes
    .filter((node) => (inDegree.get(node.clientRowId) ?? 0) === 0)
    .map((node) => node.clientRowId)
    .sort((left, right) => (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0))
  const sorted = []
  while (queue.length > 0) {
    const nodeId = queue.shift()
    sorted.push(nodeId)
    for (const edge of successors.get(nodeId) ?? []) {
      const nextDegree = (inDegree.get(edge.to) ?? 0) - 1
      inDegree.set(edge.to, nextDegree)
      if (nextDegree === 0) {
        queue.push(edge.to)
        queue.sort((left, right) => (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0))
      }
    }
  }
  return sorted
}

function candidateCpmSuccessorStartConstraint({
  dependencyType,
  lagDays,
  predecessorEarlyStart,
  predecessorEarlyFinish,
  successorDurationDays,
}) {
  if (dependencyType === 'SS') return predecessorEarlyStart + lagDays
  if (dependencyType === 'FF') return predecessorEarlyFinish + lagDays - successorDurationDays
  if (dependencyType === 'SF') return predecessorEarlyStart + lagDays - successorDurationDays
  return predecessorEarlyFinish + lagDays
}

function candidateCpmPredecessorLateFinishConstraint({
  dependencyType,
  lagDays,
  predecessorDurationDays,
  successorEarlyStart,
  successorEarlyFinish,
}) {
  if (dependencyType === 'SS') return successorEarlyStart - lagDays + predecessorDurationDays
  if (dependencyType === 'FF') return successorEarlyFinish - lagDays
  if (dependencyType === 'SF') return successorEarlyFinish - lagDays + predecessorDurationDays
  return successorEarlyStart - lagDays
}
function minDate(rows, key) {
  const values = rows
    .map((row) => String(row.values[key] ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
  return values[0] ?? null
}

function maxDate(rows, key) {
  const values = rows
    .map((row) => String(row.values[key] ?? '').slice(0, 10))
    .filter(Boolean)
    .sort()
  return values.at(-1) ?? null
}

function groupedCount(rows, readKey) {
  return rows.reduce((acc, row) => {
    const key = String(readKey(row) ?? 'unknown')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
}

function uniqueText(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function readDurationSuggestion(row) {
  const suggestion = row.values.duration_suggestion
  return suggestion && typeof suggestion === 'object' ? suggestion : {}
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeReportConstructionCalendar(value) {
  const record = readRecord(value)
  const windows = readArray(record.windows)
    .map((window) => {
      const item = readRecord(window)
      return {
        stableCode: String(item.stableCode ?? item.stable_code ?? item.holidayCode ?? item.holiday_code ?? '').trim(),
        holidayName: String(item.holidayName ?? item.holiday_name ?? item.name ?? '').trim(),
        startDate: String(item.startDate ?? item.start_date ?? '').slice(0, 10),
        endDate: String(item.endDate ?? item.end_date ?? '').slice(0, 10),
        countsAsConstructionShutdown: item.countsAsConstructionShutdown === true
          || item.counts_as_construction_shutdown === true,
      }
    })
    .filter((window) => window.startDate || window.endDate || window.stableCode || window.holidayName)

  return {
    basis: String(record.basis ?? '').trim(),
    windows,
  }
}

function countOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function readOptionalPositiveInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function normalizeDurationRiskRange(value, fallback = {}) {
  const record = readRecord(value)
  const p20Days = readOptionalPositiveInteger(
    record.p20Days ?? record.p20_days ?? fallback.p20Days ?? fallback.riskP20DurationDays,
  )
  const p50Days = readOptionalPositiveInteger(
    record.p50Days ?? record.p50_days ?? fallback.p50Days ?? fallback.riskP50DurationDays,
  )
  const p80Days = readOptionalPositiveInteger(
    record.p80Days ?? record.p80_days ?? fallback.p80Days ?? fallback.riskP80DurationDays,
  )
  if (!p20Days || !p50Days || !p80Days) return null

  return {
    p20Days,
    p50Days,
    p80Days,
    uncertaintyBandDays: readOptionalPositiveInteger(record.uncertaintyBandDays ?? record.uncertainty_band_days)
      ?? Math.max(0, p80Days - p20Days),
  }
}

function readDurationAssetCalculation(row) {
  const metadata = readRecord(row.values.standard_task_metadata)
  return readRecord(
    row.values.duration_asset_calculation
      ?? metadata.durationAssetCalculation
      ?? readRecord(row.values.duration_asset_mapping).durationAssetCalculation
      ?? readRecord(metadata.durationAssetMapping).durationAssetCalculation,
  )
}

function formatCalculationCell(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  return String(value).replace(/\|/g, '/')
}

export function formatGeneratorDurationAssetUtilizationSummary(summary) {
  const record = readRecord(summary)
  if (Object.keys(record).length === 0) return '未提供'
  return [
    `scheduleRowCount=${formatCalculationCell(record.scheduleRowCount)}`,
    `standardWorkDurationSeedRowCount=${formatCalculationCell(record.standardWorkDurationSeedRowCount)}`,
    `t2ApplicableDurationBearingScheduleRowCount=${formatCalculationCell(record.t2ApplicableDurationBearingScheduleRowCount)}`,
    `t2NotApplicableDurationBearingScheduleRowCount=${formatCalculationCell(record.t2NotApplicableDurationBearingScheduleRowCount)}`,
    `t2RhythmTemplateRowCount=${formatCalculationCell(record.t2RhythmTemplateRowCount)}`,
    `projectScaleQuantityProxyRowCount=${formatCalculationCell(record.projectScaleQuantityProxyRowCount)}`,
    `dependencyAssetConsumedRowCount=${formatCalculationCell(record.dependencyAssetConsumedRowCount)}`,
    `dependencyTimingAssetConsumedRowCount=${formatCalculationCell(record.dependencyTimingAssetConsumedRowCount)}`,
    `runtimeReferenceDaysRowCount=${formatCalculationCell(record.runtimeReferenceDaysRowCount)}`,
    `runtimeReferenceDaysConsumedRowCount=${formatCalculationCell(record.runtimeReferenceDaysConsumedRowCount)}`,
    `rowsMissingRuntimeReferenceDaysCount=${formatCalculationCell(record.rowsMissingRuntimeReferenceDaysCount)}`,
    `processSeasonalDurationAssetRowCount=${formatCalculationCell(record.processSeasonalDurationAssetRowCount)}`,
    `featureTriggeredAcceptanceScheduleRowCount=${formatCalculationCell(record.featureTriggeredAcceptanceScheduleRowCount)}`,
    `constructionCalendarRowCount=${formatCalculationCell(record.constructionCalendarRowCount)}`,
    `durationRiskRangeRowCount=${formatCalculationCell(record.durationRiskRangeRowCount)}`,
    `durationRiskP20MinDays=${formatCalculationCell(record.durationRiskP20MinDays)}`,
    `durationRiskP50MedianDays=${formatCalculationCell(record.durationRiskP50MedianDays)}`,
    `durationRiskP80MaxDays=${formatCalculationCell(record.durationRiskP80MaxDays)}`,
    `businessTypeProfileScheduleRowCount=${formatCalculationCell(record.businessTypeProfileScheduleRowCount)}`,
    `businessTypeSpecialtyDurationAssetRowCount=${formatCalculationCell(record.businessTypeSpecialtyDurationAssetRowCount)}`,
    `businessTypeSpecificT2RhythmTemplateRowCount=${formatCalculationCell(record.businessTypeSpecificT2RhythmTemplateRowCount)}`,
    `missingSeed=${formatCalculationCell(record.rowsMissingDurationAssetCount)}`,
    `missingT2=${formatCalculationCell(record.rowsMissingT2RhythmTemplateCount)}`,
    `businessTypeMissingSeed=${formatCalculationCell(record.businessTypeRowsMissingSpecialtyDurationAssetCount)}`,
    `businessTypeMissingT2=${formatCalculationCell(record.businessTypeRowsMissingSpecificT2RhythmTemplateCount)}`,
  ].join(', ')
}

function summarizeBusinessTypeSpecialtyAssetCoverage(generatorDurationAssetUtilizationSummary) {
  const summary = readRecord(generatorDurationAssetUtilizationSummary)
  const profileScheduleRowCount = countOrZero(summary.businessTypeProfileScheduleRowCount)
  const specialtyDurationAssetRowCount = countOrZero(summary.businessTypeSpecialtyDurationAssetRowCount)
  const specificT2RhythmTemplateRowCount = countOrZero(summary.businessTypeSpecificT2RhythmTemplateRowCount)
  const t2ApplicableProfileScheduleRowCount = readArray(summary.businessTypeAssetCoverage)
    .reduce((sum, item) => sum + countOrZero(readRecord(item).t2ApplicableProfileScheduleRowCount), 0)
  const t2NotApplicableProfileScheduleRowCount = readArray(summary.businessTypeAssetCoverage)
    .reduce((sum, item) => sum + countOrZero(readRecord(item).t2NotApplicableProfileScheduleRowCount), 0)
  const rowsMissingSpecialtyDurationAssetCount = countOrZero(summary.businessTypeRowsMissingSpecialtyDurationAssetCount)
  const rowsMissingSpecificT2RhythmTemplateCount = countOrZero(summary.businessTypeRowsMissingSpecificT2RhythmTemplateCount)
  const status = Object.keys(summary).length === 0
    ? 'not_reported'
    : profileScheduleRowCount <= 0
      ? 'not_applicable'
      : rowsMissingSpecialtyDurationAssetCount > 0 || rowsMissingSpecificT2RhythmTemplateCount > 0
        ? 'has_gaps'
        : 'covered'

  return {
    source: 'generator_duration_asset_utilization_summary',
    status,
    profileScheduleRowCount,
    t2ApplicableProfileScheduleRowCount,
    t2NotApplicableProfileScheduleRowCount,
    specialtyDurationAssetRowCount,
    specificT2RhythmTemplateRowCount,
    rowsMissingSpecialtyDurationAssetCount,
    rowsMissingSpecificT2RhythmTemplateCount,
    profileBusinessTypeCodes: uniqueText(readArray(summary.businessTypeProfileBusinessTypeCodes)),
    specialtyDurationAssetBusinessTypeCodes: uniqueText(readArray(summary.businessTypeSpecialtyDurationAssetBusinessTypeCodes)),
    specificT2RhythmBusinessTypeCodes: uniqueText(readArray(summary.businessTypeSpecificT2RhythmBusinessTypeCodes)),
  }
}

function summarizeBusinessTypeAssetCoverage(generatorDurationAssetUtilizationSummary) {
  const summary = readRecord(generatorDurationAssetUtilizationSummary)
  return readArray(summary.businessTypeAssetCoverage ?? summary.business_type_asset_coverage)
    .map((item) => normalizeBusinessTypeAssetCoverage(item))
    .filter((item) => item.businessType)
    .sort((left, right) => left.businessType.localeCompare(right.businessType))
}

function buildGeneratorDurationAssetUtilizationSummaryForReport(
  summary,
  {
    runtimeReferenceDaysConsumedRowCount,
    baseRuntimeReferenceDayGapRows,
    profileRuntimeReferenceDayGapRows,
    featureTriggeredAcceptanceScheduleRowCount,
  },
) {
  const record = readRecord(summary)
  if (Object.keys(record).length === 0) return record
  return {
    ...record,
    runtimeReferenceDaysConsumedRowCount,
    rowsMissingRuntimeReferenceDaysCount: baseRuntimeReferenceDayGapRows.length + profileRuntimeReferenceDayGapRows.length,
    featureTriggeredAcceptanceScheduleRowCount,
  }
}

function normalizeBusinessTypeAssetCoverage(item) {
  const record = readRecord(item)
  const profileScheduleRowCount = countOrZero(record.profileScheduleRowCount ?? record.profile_schedule_row_count)
  const rowsMissingSpecialtyDurationAssetCount = countOrZero(
    record.rowsMissingSpecialtyDurationAssetCount ?? record.rows_missing_specialty_duration_asset_count,
  )
  const rowsMissingSpecificT2RhythmTemplateCount = countOrZero(
    record.rowsMissingSpecificT2RhythmTemplateCount ?? record.rows_missing_specific_t2_rhythm_template_count,
  )
  const status = profileScheduleRowCount <= 0
    ? 'not_applicable'
    : rowsMissingSpecialtyDurationAssetCount > 0 || rowsMissingSpecificT2RhythmTemplateCount > 0
      ? 'has_gaps'
      : 'covered'

  return {
    source: 'generator_duration_asset_utilization_summary',
    status,
    businessType: String(record.businessType ?? record.business_type ?? '').trim(),
    profileScheduleRowCount,
    t2ApplicableProfileScheduleRowCount: countOrZero(
      record.t2ApplicableProfileScheduleRowCount ?? record.t2_applicable_profile_schedule_row_count,
    ),
    t2NotApplicableProfileScheduleRowCount: countOrZero(
      record.t2NotApplicableProfileScheduleRowCount ?? record.t2_not_applicable_profile_schedule_row_count,
    ),
    specialtyDurationAssetRowCount: countOrZero(
      record.specialtyDurationAssetRowCount ?? record.specialty_duration_asset_row_count,
    ),
    specificT2RhythmTemplateRowCount: countOrZero(
      record.specificT2RhythmTemplateRowCount ?? record.specific_t2_rhythm_template_row_count,
    ),
    rowsMissingSpecialtyDurationAssetCount,
    rowsMissingSpecificT2RhythmTemplateCount,
    activeStandardWorkDurationSeedRowCount: countOrZero(
      record.activeStandardWorkDurationSeedRowCount ?? record.active_standard_work_duration_seed_row_count,
    ),
    fallbackStandardWorkDurationSeedRowCount: countOrZero(
      record.fallbackStandardWorkDurationSeedRowCount ?? record.fallback_standard_work_duration_seed_row_count,
    ),
    activeT2RhythmTemplateRowCount: countOrZero(
      record.activeT2RhythmTemplateRowCount ?? record.active_t2_rhythm_template_row_count,
    ),
    fallbackT2RhythmTemplateRowCount: countOrZero(
      record.fallbackT2RhythmTemplateRowCount ?? record.fallback_t2_rhythm_template_row_count,
    ),
    uniqueStandardWorkDurationSeedStableCodes: uniqueText(readArray(
      record.uniqueStandardWorkDurationSeedStableCodes ?? record.unique_standard_work_duration_seed_stable_codes,
    )),
    uniqueT2RhythmTemplateIds: uniqueText(readArray(
      record.uniqueT2RhythmTemplateIds ?? record.unique_t2_rhythm_template_ids,
    )),
    productionWritePolicy: String(record.productionWritePolicy ?? record.production_write_policy ?? DEFAULT_MASTER_PLAN_DEPENDENCY_WRITE_POLICY).trim(),
  }
}

function formatBusinessTypeSpecialtyAssetCoverage(coverage) {
  const record = readRecord(coverage)
  if (Object.keys(record).length === 0) return '未提供'
  return [
    `status=${formatCalculationCell(record.status)}`,
    `profile=${formatCalculationCell(record.profileScheduleRowCount)}`,
    `业态专属seed=${formatCalculationCell(record.specialtyDurationAssetRowCount)}`,
    `业态T2=${formatCalculationCell(record.specificT2RhythmTemplateRowCount)}`,
    `缺seed=${formatCalculationCell(record.rowsMissingSpecialtyDurationAssetCount)}`,
    `缺T2=${formatCalculationCell(record.rowsMissingSpecificT2RhythmTemplateCount)}`,
    `profileCodes=${readArray(record.profileBusinessTypeCodes).join(',') || '-'}`,
    `seedCodes=${readArray(record.specialtyDurationAssetBusinessTypeCodes).join(',') || '-'}`,
    `t2Codes=${readArray(record.specificT2RhythmBusinessTypeCodes).join(',') || '-'}`,
  ].join(', ')
}

function formatBusinessTypeAssetCoverageList(coverageList) {
  const items = readArray(coverageList)
  if (items.length === 0) return '未提供'
  return items.map((item) => formatBusinessTypeAssetCoverage(item)).join(' | ')
}

function formatBusinessTypeAssetCoverage(coverage) {
  const record = readRecord(coverage)
  if (Object.keys(record).length === 0) return '未提供'
  return [
    `${formatCalculationCell(record.businessType)}: status=${formatCalculationCell(record.status)}`,
    `profile=${formatCalculationCell(record.profileScheduleRowCount)}`,
    `业态专属seed=${formatCalculationCell(record.specialtyDurationAssetRowCount)}`,
    `业态T2=${formatCalculationCell(record.specificT2RhythmTemplateRowCount)}`,
    `缺seed=${formatCalculationCell(record.rowsMissingSpecialtyDurationAssetCount)}`,
    `缺T2=${formatCalculationCell(record.rowsMissingSpecificT2RhythmTemplateCount)}`,
    `activeSeed=${formatCalculationCell(record.activeStandardWorkDurationSeedRowCount)}`,
    `fallbackSeed=${formatCalculationCell(record.fallbackStandardWorkDurationSeedRowCount)}`,
    `activeT2=${formatCalculationCell(record.activeT2RhythmTemplateRowCount)}`,
    `fallbackT2=${formatCalculationCell(record.fallbackT2RhythmTemplateRowCount)}`,
    `seedCodes=${readArray(record.uniqueStandardWorkDurationSeedStableCodes).join(',') || '-'}`,
    `t2Ids=${readArray(record.uniqueT2RhythmTemplateIds).join(',') || '-'}`,
    `writePolicy=${formatCalculationCell(record.productionWritePolicy)}`,
  ].join(', ')
}

function readDependencyRuleEvidence(row) {
  const dependencies = Array.isArray(row.predecessorDependencies) ? row.predecessorDependencies : []
  const anchorEvidence = dependencies.find((dependency) => (
    dependency?.intentCode === 'business_type_profile_phase_anchor'
    && dependency?.dependencyRuleEvidence
  ))?.dependencyRuleEvidence
  const firstEvidence = dependencies.find((dependency) => dependency?.dependencyRuleEvidence)?.dependencyRuleEvidence
  return readRecord(anchorEvidence ?? firstEvidence)
}

export function hasCandidateDependencyRuleEvidence(row) {
  const evidence = readDependencyRuleEvidence(row)
  return evidence.source === DEFAULT_MASTER_PLAN_DEPENDENCY_RULE_SOURCE
    && evidence.productionWritePolicy === DEFAULT_MASTER_PLAN_DEPENDENCY_WRITE_POLICY
    && evidence.mutationBoundary === DEFAULT_MASTER_PLAN_DEPENDENCY_PREVIEW_BOUNDARY
}

export function evaluateProfileDependencyEvidence(profileRows, { allowsUnanchoredStart = false } = {}) {
  const rows = Array.isArray(profileRows) ? profileRows : []
  const rowsWithoutDependencies = rows.filter((row) => (
    !Array.isArray(row?.predecessorDependencies) || row.predecessorDependencies.length === 0
  ))
  const rowsWithDependencies = rows.filter((row) => !rowsWithoutDependencies.includes(row))
  const unanchoredStartIsValid = allowsUnanchoredStart
    && rowsWithoutDependencies.length === 1
    && rowsWithoutDependencies[0] === rows[0]
  const requiredRowCount = rows.length - (allowsUnanchoredStart ? 1 : 0)
  const evidenceRowCount = rows.filter(hasCandidateDependencyRuleEvidence).length

  return {
    evidenceRowCount,
    requiredRowCount,
    unanchoredStartRowCount: rowsWithoutDependencies.length,
    ready: rows.length > 0
      && (allowsUnanchoredStart ? unanchoredStartIsValid : rowsWithoutDependencies.length === 0)
      && rowsWithDependencies.length === requiredRowCount
      && rowsWithDependencies.every(hasCandidateDependencyRuleEvidence),
  }
}

export function hasProfileDurationEvidence(row) {
  const values = readRecord(row?.values)
  const suggestion = readDurationSuggestion(row)
  const blockedBy = Array.isArray(suggestion.dataUpgradeBlockedBy) ? suggestion.dataUpgradeBlockedBy : []
  const calibrationSource = String(values.duration_calibration_source ?? suggestion.durationCalibrationSource ?? '').trim()
  const evidenceSource = String(values.duration_evidence_source ?? '').trim()
  const maturity = String(values.duration_evidence_maturity ?? suggestion.dataMaturity ?? '').trim()
  const truthSource = String(values.duration_truth_source ?? suggestion.planDurationTruthSource ?? '').trim()
  const reviewGate = String(values.duration_review_gate ?? '').trim()
  const candidateGateRequired = reviewGate === 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'
    || blockedBy.includes('GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')

  const isLegacyCandidateEvidence = calibrationSource === LEGACY_CANDIDATE_DURATION_CALIBRATION_SOURCE
    && evidenceSource === 'candidate_default_master_plan_baseline'
    && truthSource === LEGACY_CANDIDATE_DURATION_TRUTH_SOURCE
    && candidateGateRequired
  const isSystemStandardEvidence = [
    SYSTEM_STANDARD_DURATION_CALIBRATION_SOURCE,
    'standard_work_duration_seed',
  ].includes(calibrationSource)
    && evidenceSource === 'system_standard_default_master_plan'
    && truthSource === SYSTEM_STANDARD_DURATION_TRUTH_SOURCE
    && values.duration_review_required !== true
    && !candidateGateRequired

  return maturity === 'L1' && (isLegacyCandidateEvidence || isSystemStandardEvidence)
}

function readBusinessTypeMasterPlanLineage(row) {
  const metadata = readRecord(row.values.standard_task_metadata)
  return readRecord(metadata.businessTypeMasterPlan)
}

function readProfileSourceType(row) {
  return String(row.values.profile_source_type ?? readBusinessTypeMasterPlanLineage(row).profileSourceType ?? '').trim()
}

function isBusinessTypeProfileRow(row) {
  return readProfileSourceType(row) === 'business_type_master_plan_profile_v1'
}

function isBusinessTypeBaseRow(row) {
  return readProfileSourceType(row) === 'business_type_base_master_plan_profile_v1'
}

function isFeatureTriggeredAcceptanceScheduleRow(row) {
  const executionPhase = String(row.values.execution_phase ?? row.executionPhase ?? '').trim()
  const title = String(row.values.title ?? row.values.name ?? '').trim()
  if (!['commissioning', 'acceptance_handover'].includes(executionPhase)) return false
  return /验收|移交|联调|调试|开业|投产|运营|acceptance|handover|commissioning|opening|trial|load/i.test(title)
}

function normalizeAuditablePredecessorDependencies(value) {
  return readArray(value)
    .map((dependency) => readRecord(dependency))
    .map((dependency) => ({
      clientRowId: String(
        dependency.clientRowId
          ?? dependency.client_row_id
          ?? dependency.predecessorClientRowId
          ?? dependency.predecessor_client_row_id
          ?? '',
      ).trim(),
      dependencyType: String(dependency.dependencyType ?? dependency.dependency_type ?? 'FS').trim().toUpperCase() || 'FS',
      lagDays: Number.isFinite(Number(dependency.lagDays ?? dependency.lag_days))
        ? Number(dependency.lagDays ?? dependency.lag_days)
        : 0,
      intentCode: String(dependency.intentCode ?? dependency.intent_code ?? dependency.intent ?? '').trim(),
    }))
    .filter((dependency) => dependency.clientRowId)
}

export function buildAuditableDurationAssetRow(row, criticalPathByClientRowId = new Map()) {
  const durationAssetCalculation = readDurationAssetCalculation(row)
  const quantityProxy = readRecord(durationAssetCalculation.quantityProxy)
  const dependencyRuleEvidence = readDependencyRuleEvidence(row)
  const dependencyRuleLayerStack = Array.isArray(dependencyRuleEvidence.layerStack)
    ? dependencyRuleEvidence.layerStack.join(' + ')
    : ''
  const durationSuggestion = readDurationSuggestion(row)
  const durationRiskRange = normalizeDurationRiskRange(durationSuggestion.durationRiskRange, durationSuggestion)
  const metadata = readRecord(row.values.standard_task_metadata)
  const candidateCriticalPathRow = readRecord(criticalPathByClientRowId.get(String(row.clientRowId ?? '')))
  const featureTriggeredAcceptanceScheduleRow = isFeatureTriggeredAcceptanceScheduleRow(row)
  const durationReviewRequired = row.values.duration_review_required
  return {
    durationAssetStableCode: String(row.values.duration_asset_mapping?.standardWorkDurationSeedStableCode ?? row.values.standard_task_metadata?.durationAssetMapping?.standardWorkDurationSeedStableCode ?? ''),
    t2RhythmTemplateId: String(row.values.duration_asset_mapping?.t2RhythmTemplateId ?? row.values.standard_task_metadata?.durationAssetMapping?.t2RhythmTemplateId ?? ''),
    t2RhythmApplicability: String(
      durationAssetCalculation.t2RhythmApplicability
        ?? row.values.standard_task_metadata?.durationAssetMapping?.t2RhythmApplicability
        ?? '',
    ),
    selectedDurationDays: durationAssetCalculation.selectedDurationDays ?? null,
    standardWorkDurationSeedResolverSource: String(durationAssetCalculation.standardWorkDurationSeedResolverSource ?? ''),
    standardWorkDurationSeedResolverVersionId: String(durationAssetCalculation.standardWorkDurationSeedResolverVersionId ?? ''),
    standardWorkDurationSeedP50Days: durationAssetCalculation.standardWorkDurationSeedP50Days ?? null,
    t2RhythmTemplateResolverSource: String(durationAssetCalculation.t2RhythmTemplateResolverSource ?? ''),
    t2RhythmTemplateResolverVersionId: String(durationAssetCalculation.t2RhythmTemplateResolverVersionId ?? ''),
    t2RhythmTemplateP50Days: durationAssetCalculation.t2RhythmTemplateP50Days ?? null,
    riskP20DurationDays: durationRiskRange?.p20Days ?? null,
    riskP50DurationDays: durationRiskRange?.p50Days ?? null,
    riskP80DurationDays: durationRiskRange?.p80Days ?? null,
    durationRiskRange,
    runtimeReferenceDaysConsumed: durationAssetCalculation.runtimeReferenceDaysConsumed === true,
    runtimeReferenceDaysEvidenceLevel: durationAssetCalculation.runtimeReferenceDaysEvidenceLevel ?? null,
    runtimeReferenceDaysP50Days: durationAssetCalculation.runtimeReferenceDaysP50Days ?? null,
    runtimeReferenceDaysP80Days: durationAssetCalculation.runtimeReferenceDaysP80Days ?? null,
    runtimeReferenceDaysSampleCount: durationAssetCalculation.runtimeReferenceDaysSampleCount ?? null,
    runtimeReferenceDaysSource: durationAssetCalculation.runtimeReferenceDaysSource ?? null,
    quantityProxySource: String(quantityProxy.source ?? ''),
    quantityProxyValue: quantityProxy.value ?? null,
    quantityProxyUnit: String(quantityProxy.unit ?? ''),
    quantityProxyBasis: String(quantityProxy.basis ?? ''),
    standardWorkDurationSeedProductivityP50PerDay: durationAssetCalculation.standardWorkDurationSeedProductivityP50PerDay ?? null,
    productivityDerivedDurationDays: durationAssetCalculation.productivityDerivedDurationDays ?? null,
    realPlanSkeletonDurationDays: durationAssetCalculation.realPlanSkeletonDurationDays ?? null,
    realPlanSkeletonFloorApplied: durationAssetCalculation.realPlanSkeletonFloorApplied === true,
    maxNonSkeletonAssetDays: durationAssetCalculation.maxNonSkeletonAssetDays ?? null,
    selectionRule: String(durationAssetCalculation.selectionRule ?? ''),
    dependencyRuleSource: String(dependencyRuleEvidence.source ?? ''),
    dependencyAssetConsumed: dependencyRuleEvidence.dependencyAssetConsumed === true,
    dependencyAssetStableCode: String(dependencyRuleEvidence.dependencyAssetStableCode ?? ''),
    dependencyTimingAssetConsumed: dependencyRuleEvidence.dependencyTimingAssetConsumed === true,
    dependencyTimingSelectedLagDays: dependencyRuleEvidence.dependencyTimingSelectedLagDays ?? null,
    dependencyRuleLayerStack,
    dependencyProductionWritePolicy: String(dependencyRuleEvidence.productionWritePolicy ?? ''),
    processSeasonalDurationAssetConsumed: durationAssetCalculation.processSeasonalDurationAssetConsumed === true,
    processSeasonalMultiplier: durationAssetCalculation.processSeasonalMultiplier ?? null,
    processSeasonalSource: String(durationAssetCalculation.processSeasonalSource ?? ''),
    featureTriggeredAcceptanceScheduleRow,
    acceptanceScheduleEvidence: featureTriggeredAcceptanceScheduleRow
      ? 'feature_triggered_acceptance_schedule_row:dated_candidate_schedule_row_no_production_write'
      : '',
    calendarBasis: String(row.values.calendar_basis ?? metadata.calendarBasis ?? ''),
    constructionCalendarWindowCount: row.values.construction_calendar_window_count ?? metadata.constructionCalendarWindowCount ?? null,
    durationCalibrationSource: String(row.values.duration_calibration_source ?? durationSuggestion.durationCalibrationSource ?? ''),
    durationMaturity: String(row.values.duration_evidence_maturity ?? durationSuggestion.dataMaturity ?? ''),
    durationReviewGate: String(row.values.duration_review_gate ?? (durationSuggestion.dataUpgradeBlockedBy ?? []).join(', ') ?? ''),
    durationReviewRequired: typeof durationReviewRequired === 'boolean' ? durationReviewRequired : null,
    durationTruthSource: String(row.values.duration_truth_source ?? durationSuggestion.planDurationTruthSource ?? ''),
    phaseAnchorDependencyCount: (row.predecessorDependencies ?? []).filter((dependency) => (
      dependency.intentCode === 'business_type_profile_phase_anchor'
    )).length,
    totalFloatDays: candidateCriticalPathRow.totalFloatDays ?? null,
    criticalPathCandidate: candidateCriticalPathRow.criticalPathCandidate === true,
    earlyStartOffsetDays: candidateCriticalPathRow.earlyStartOffsetDays ?? null,
    earlyFinishOffsetDays: candidateCriticalPathRow.earlyFinishOffsetDays ?? null,
    lateStartOffsetDays: candidateCriticalPathRow.lateStartOffsetDays ?? null,
    lateFinishOffsetDays: candidateCriticalPathRow.lateFinishOffsetDays ?? null,
    clientRowId: String(row.clientRowId ?? row.client_row_id ?? '').trim(),
    predecessorDependencies: normalizeAuditablePredecessorDependencies(row.predecessorDependencies),
    code: String(row.values.standard_work_code ?? row.values.template_node_id ?? ''),
    title: String(row.values.title ?? row.values.name ?? ''),
    executionPhase: String(row.values.execution_phase ?? row.executionPhase ?? ''),
    executionLane: String(row.values.execution_lane ?? row.executionLane ?? ''),
    executionNature: String(row.values.execution_nature ?? metadata.executionNature ?? ''),
    startDate: String(row.values.planned_start_date ?? '').slice(0, 10),
    endDate: String(row.values.planned_end_date ?? '').slice(0, 10),
    durationDays: durationDays(row),
    businessType: String(row.values.business_type ?? ''),
  }
}

export function buildRuntimeReferenceDayGapRows(rows, { rowGroup = 'profile' } = {}) {
  return rows
    .filter((row) => row.runtimeReferenceDaysConsumed !== true)
    .map((row) => {
      const requiredRuntimeReferenceStableCode = String(row.code || row.durationAssetStableCode || '').trim()
      const title = String(row.title || '').trim()
      return {
        rowGroup,
        businessType: String(row.businessType || '').trim(),
        code: String(row.code || '').trim(),
        title,
        executionPhase: String(row.executionPhase || '').trim(),
        executionLane: String(row.executionLane || '').trim(),
        requiredRuntimeReferenceStableCode,
        durationAssetStableCode: String(row.durationAssetStableCode || '').trim(),
        selectedDurationDays: row.selectedDurationDays ?? null,
        t2RhythmTemplateId: String(row.t2RhythmTemplateId || '').trim(),
        selectionRule: String(row.selectionRule || '').trim(),
        sampleCollectionRequirement: requiredRuntimeReferenceStableCode
          ? `Collect accepted real completed-project duration sample(s) for ${requiredRuntimeReferenceStableCode}${title ? ` (${title})` : ''}.`
          : 'Collect accepted real completed-project duration sample(s) after assigning a stable reference code.',
        mutationBoundary: 'candidate_gap_planning_only_no_business_fact_write',
      }
    })
}

export function collectDurationAssetSemanticGaps(rows) {
  return rows.flatMap((row) => {
    const gaps = []
    const t2RhythmRequired = String(row.t2RhythmApplicability || '').trim() !== 'not_applicable_one_off_activity'
    if (t2RhythmRequired && !String(row.t2RhythmTemplateId || '').trim()) {
      gaps.push(buildDurationAssetSemanticGap(row, 't2_required_template_missing'))
    }
    if (t2RhythmRequired && hasT2BusinessTypeMismatch(row, row.t2RhythmTemplateId)) {
      gaps.push(buildDurationAssetSemanticGap(row, 't2_business_type_mismatch'))
    }
    if (t2RhythmRequired && hasT2PhaseMismatch(row, row.t2RhythmTemplateId)) {
      gaps.push(buildDurationAssetSemanticGap(row, 't2_phase_mismatch'))
    }
    if (hasDurationAssetPhaseMismatch(row, row.durationAssetStableCode)) {
      gaps.push(buildDurationAssetSemanticGap(row, 'duration_asset_phase_mismatch'))
    }
    return gaps
  })
}

function buildDurationAssetSemanticGap(row, gap) {
  return {
    gap,
    businessType: String(row.businessType || '').trim(),
    code: String(row.code || '').trim(),
    title: String(row.title || '').trim(),
    executionPhase: String(row.executionPhase || '').trim(),
    executionLane: String(row.executionLane || '').trim(),
    durationAssetStableCode: String(row.durationAssetStableCode || '').trim(),
    t2RhythmTemplateId: String(row.t2RhythmTemplateId || '').trim(),
    t2RhythmApplicability: String(row.t2RhythmApplicability || '').trim(),
    mutationBoundary: 'candidate_semantic_audit_only_no_business_fact_write',
  }
}

function hasT2BusinessTypeMismatch(row, templateId) {
  const businessType = String(row.businessType || '').trim()
  const id = String(templateId || '').trim().toLowerCase()
  if (!businessType || !id) return false
  if (businessType === 'residential') return false
  if (id.includes(`t2-${businessType}-`)) return false
  if (id.includes('standard-library')) return false
  return id.includes('t2-residential-')
}

function hasT2PhaseMismatch(row, templateId) {
  const executionPhase = String(row.executionPhase || '').trim()
  const id = String(templateId || '').trim().toLowerCase()
  if (!executionPhase || !id) return false
  if (executionPhase === 'startup_site_setup') return !/(startup|site|foundation|basement|readiness|decanting|cutover|factory|lot|assembly)/i.test(id)
  if (executionPhase === 'foundation_pit_pile') return !/(foundation|basement|pile|pit)/i.test(id)
  if (executionPhase === 'basement_structure') return !/(basement|foundation)/i.test(id)
  if (executionPhase === 'superstructure_rhythm') return !/(structure|tower|floor|superstructure|plant|longspan|assembly|transfer|shell|readiness|renovation|retrofit|decanting|cutover|occupied)/i.test(id)
  if (executionPhase === 'secondary_structure_fitout_roughin') return !/(secondary|fitout|decoration|room|campus|occupied|assembly)/i.test(id)
  if (executionPhase === 'envelope_roof_facade') return !/(envelope|facade|roof|plant|longspan|campus|utility|interface|transfer|system)/i.test(id)
  if (executionPhase === 'mep_roughin') return !/(mep|system|utility|power|cooling|commissioning|equipment|campus|assembly)/i.test(id)
  if (executionPhase === 'elevator_installation') return !/(elevator|vertical|structure|mep|commissioning|floor|equipment|shell|readiness|factory|lot|assembly)/i.test(id)
  if (executionPhase === 'interior_fitout_terminal') return !/(fitout|decoration|room|interior|podium|campus|occupied|white|cutover|power|cooling|commissioning|readiness|assembly)/i.test(id)
  if (executionPhase === 'outdoor_municipal_landscape') return !/(outdoor|municipal|landscape|campus|utility|site)/i.test(id)
  if (executionPhase === 'commissioning') return !/(commissioning|handover|opening|trial|load|system|equipment|cutover|factory|lot|assembly|site)/i.test(id)
  if (executionPhase === 'acceptance_handover') return !/(handover|commissioning|opening|trial|load|acceptance|transfer|campus|cutover|factory|lot|assembly|site)/i.test(id)
  return false
}

function hasDurationAssetPhaseMismatch(row, stableCode) {
  const executionPhase = String(row.executionPhase || '').trim()
  const code = String(stableCode || '').trim().toLowerCase()
  if (!executionPhase || !code) return false
  if (executionPhase === 'acceptance_handover') {
    return !/(commissioning|handover|acceptance|closeout|elevator_traction_final_acceptance)/i.test(code)
  }
  if (executionPhase === 'commissioning') {
    return !/(commissioning|system|test|trial|intelligent_data_center_commissioning)/i.test(code)
  }
  if (executionPhase === 'foundation_pit_pile') {
    return !/(foundation|pile|pit|earthwork|cushion|blinding|support)/i.test(code)
  }
  if (executionPhase === 'basement_structure') {
    return !/(basement|concrete|waterproof|backfill|structure)/i.test(code)
  }
  if (executionPhase === 'superstructure_rhythm') {
    return !/(formwork|concrete|steel|structure|hoisting|roof|finish|renovation|retrofit|public|expert_domain_renovation_retrofit)/i.test(code)
  }
  if (executionPhase === 'mep_roughin') {
    return !/(mep|plumbing|pipe|power|air|hvac|system|equipment|intelligent)/i.test(code)
  }
  return false
}

function hasProfilePhaseAnchor(row) {
  return (row.predecessorDependencies ?? []).some((dependency) => (
    dependency.intentCode === 'business_type_profile_phase_anchor'
  )) || Boolean(row.values.profile_phase_anchor_dependency)
}

function isDedicatedOnlyProfileSummary(summary) {
  const scheduleRowCount = Number(summary.reviewScheduleRowCount ?? summary.scheduleRowCount ?? 0)
  const baseRowCount = Number(summary.baseRowCount ?? 0)
  const profileRowCount = Number(summary.profileRowCount ?? 0)
  return DEDICATED_ONLY_BUSINESS_TYPES.has(summary.businessType)
    && baseRowCount === 0
    && scheduleRowCount === profileRowCount
    && profileRowCount >= 6
    && profileRowCount <= 12
}

export function classifyReview(summary) {
  const gaps = []
  const reviewScheduleRowCount = Number(summary.reviewScheduleRowCount ?? summary.scheduleRowCount ?? 0)
  if (!isDedicatedOnlyProfileSummary(summary) && (reviewScheduleRowCount < 15 || reviewScheduleRowCount > 60)) gaps.push('row_count_outside_15_60')
  if (summary.profileRowCount < 6 || summary.profileRowCount > 12) gaps.push('profile_row_count_outside_6_12')
  if (!summary.profileDurationEvidenceReady) gaps.push('profile_duration_evidence_missing')
  if (!summary.profilePhaseAnchorsReady) gaps.push('profile_phase_anchor_missing')
  if (!summary.profileDependencyEvidenceReady) gaps.push('profile_dependency_evidence_missing')
  if (!summary.profileDependencyDatesReady) gaps.push('profile_dependency_date_violation')
  if ((summary.durationAssetSemanticGaps ?? []).length > 0) gaps.push('duration_asset_semantic_mismatch')
  if (summary.dangerChecklistInSchedule) gaps.push('danger_checklist_leaked_to_schedule')
  if (!summary.hasFoundationOrStartupSignal) gaps.push('foundation_or_startup_signal_missing')
  if (!summary.hasStructureSignal) gaps.push('structure_signal_missing')
  if (!summary.hasMepOrFitoutSignal) gaps.push('mep_fitout_domain_signal_missing')
  if (!summary.hasAcceptanceSignal) gaps.push('acceptance_signal_missing')
  if (hasGenerationDepthFallbackWarning(summary.governanceWarnings)) gaps.push('generation_depth_policy_fallback')
  const productionReadinessBlockers = collectProductionReadinessBlockers(summary, gaps)
  return {
    reviewStatus: gaps.length === 0 ? 'candidate_master_plan_reviewable' : 'needs_profile_review',
    gaps,
    productionReadinessStatus: productionReadinessBlockers.length === 0
      ? 'production_readiness_ready'
      : 'production_readiness_blocked',
    productionReadinessBlockers,
  }
}

function hasGenerationDepthFallbackWarning(governanceWarnings) {
  if (!Array.isArray(governanceWarnings)) return false
  return governanceWarnings.some((warning) => {
    if (warning?.code !== 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED') return false
    const details = warning.details && typeof warning.details === 'object' ? warning.details : {}
    const reviewReasons = Array.isArray(details.reviewReasons) ? details.reviewReasons : []
    return Number(details.fallbackPolicyRowCount ?? 0) > 0
      || reviewReasons.includes('generation_depth_policy_fallback')
  })
}

function hasCompletedOfflineDevelopmentQualityReview(summary) {
  const evidence = readRecord(summary.generationDepthReviewEvidence)
  const businessTypes = Array.isArray(evidence.businessTypes)
    ? evidence.businessTypes.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
  const businessType = String(summary.businessType ?? '').trim()
  const appliesToBusinessType = businessTypes.length === 0
    || businessTypes.includes('*')
    || businessTypes.includes(businessType)
  return evidence.status === 'completed'
    && Boolean(String(evidence.modelRef ?? evidence.model_ref ?? '').trim())
    && Boolean(String(evidence.reviewedAt ?? '').trim())
    && ['accepted', 'changes_required'].includes(String(evidence.verdict ?? '').trim())
    && evidence.mutationBoundary === 'offline_development_quality_review_only_no_runtime_write'
    && appliesToBusinessType
}

function collectProductionReadinessBlockers(summary, candidateGaps) {
  const blockers = []
  if (candidateGaps.length > 0) blockers.push('candidate_profile_review_gaps_present')
  if (!summary.profileRuntimeSeedEvidenceReady) blockers.push('runtime_seed_evidence_missing')
  if (summary.profileRuntimeReferenceDaysEvidenceReady === false) blockers.push('runtime_reference_days_evidence_missing')
  const activeAssetCoverage = summarizeActiveBusinessTypeAssetCoverage(summary)
  if (activeAssetCoverage.requiresActiveStandardWorkDurationSeed) {
    blockers.push('active_standard_duration_seed_evidence_missing')
  }
  if (activeAssetCoverage.requiresActiveT2RhythmTemplate) {
    blockers.push('active_t2_rhythm_template_evidence_missing')
  }
  return blockers
}

function summarizeActiveBusinessTypeAssetCoverage(summary) {
  const businessType = String(summary.businessType ?? '').trim()
  const coverageRows = readArray(summary.businessTypeAssetCoverage)
    .map((item) => normalizeBusinessTypeAssetCoverage(item))
    .filter((item) => item.profileScheduleRowCount > 0)
    .filter((item) => !businessType || item.businessType === businessType)
  return {
    requiresActiveStandardWorkDurationSeed: coverageRows.some((item) => (
      item.activeStandardWorkDurationSeedRowCount <= 0
    )),
    requiresActiveT2RhythmTemplate: coverageRows.some((item) => (
      item.activeT2RhythmTemplateRowCount <= 0
    )),
  }
}

async function readGenerationDepthReviewManifest(manifestPath) {
  if (!manifestPath) return null
  const parsed = await readJsonFile(manifestPath)
  return readRecord(parsed)
}

function selectGenerationDepthReviewEvidenceForBusinessType(manifest, businessType) {
  const record = readRecord(manifest)
  if (!record || Object.keys(record).length === 0) return null
  const reviews = Array.isArray(record.reviews) ? record.reviews : []
  const matchedReview = reviews
    .map(readRecord)
    .find((review) => {
      const businessTypes = Array.isArray(review.businessTypes)
        ? review.businessTypes.map((item) => String(item ?? '').trim())
        : []
      return businessTypes.length === 0 || businessTypes.includes('*') || businessTypes.includes(businessType)
    })
  return matchedReview ?? record
}

function buildMarkdown(report) {
  const lines = [
    '# 非住宅默认主计划 Profile 样例输出评审',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '生成口径：`defaultPlanOutput=master_plan`，`detailLevel=planning_skeleton`，`generationDepth=managed_frontier`，`diagnosticDurationSuggestionMode=fast_template`。非住宅行级 `source_type` 统一为 `managed_frontier_default_master_plan`；`business_type_master_plan_profile_v1` 仅作为 `profile_source_type / businessTypeMasterPlan.profileSourceType` lineage。',
    '',
    '边界：本报告只评估候选默认主计划样例；不写生产 `tasks`、`task_dependencies`、confirmed baseline、月计划、critical path、生产 seed 或 runtime publication。',
    '',
    '## 总结',
    '',
    `- 覆盖业态：${report.businessTypeCount} 个非住宅正式业态`,
    `- 全部 reviewable：${report.allReviewable ? '是' : '否'}`,
    `- 生产就绪：${report.allProductionReady ? '是' : '否'}；阻断项：${report.productionReadinessBlockers.length ? report.productionReadinessBlockers.join(', ') : '-'}`,
    `- 离线开发质量审查：${report.offlineDevelopmentQualityReviewManifestPath ? report.offlineDevelopmentQualityReviewManifestPath : '未提供'}；完成业态数：${report.offlineDevelopmentQualityReviewCompletedCount ?? 0}；不参与运行时门禁。`,
    '- 结论：当前输出达到主计划候选草稿可审阅级别。离线模型以项目经理视角检查缺项、工期、顺序和专业链并反馈模板与规则；产品运行时只保留普通预览、编辑、确认、基线和修订。',
    '- 工法选择守卫：样例通过 `foundationMethodCandidates.selected=true` 将已选基础/基坑工法传入 WBS 生成端；未选互斥工法不得因为模板目录或噪声 `method_variant_codes` 进入默认主计划。',
    '- 工期资产口径：profile 行可使用当前 `standard_work_duration_seed+t2_rhythm_template+system_schedule_rules` / `system_standard_executable_master_plan`，或兼容旧版 `real_plan_evidence` / `asset_backed_candidate_master_plan`；两者都只证明 L1 主计划输入，不证明 runtime 校准或生产发布。旧版 candidate 标签仍必须带 `GENERATION_DEPTH_TRUST_REVIEW_REQUIRED`。',
    '- runtime reference days 口径：报告分别统计通用 base 行、业态 profile 行和总 schedule 工期资产行的 reference-day 消费情况；该统计只证明候选生成读到了校准输入，不关闭 runtime seed、依赖 writer 或生产发布门。',
    '- seed 来源口径：profile 行必须暴露 `standardWorkDurationSeedResolverSource`，用于区分 project/company override、active seed 与 TS fallback；fallback 可审阅但不能代表真实运行发布。',
    '- 依赖锚点口径：profile 行至少要有候选 `business_type_profile_phase_anchor`，把行业专项行锚到既有 managed-frontier 主计划骨架；这不是生产 `task_dependencies`。',
    '- 五层依赖证据：profile 行的候选依赖边必须暴露 construction dependency rule system 的 layer stack 与写入边界；`candidate_only_no_task_dependencies_write` 只允许作为复核证据，不关闭生产依赖 writer。',
    '- 非住宅主表口径：`schedule_row` 只保留通用现场阶段骨架和业态专项行；标准分部分项模板行降级为 `linked_projection` 证据，避免土钉墙、墙地砖、人防、电梯分项等散碎条目污染默认主计划主表。',
    '',
    '| 业态 | schedule 行 | base 行 | profile 行 | runtime ref | 语义错配 | 锚点行 | 起止 | 工期资产 | 候选评审 | 生产就绪 | 阻断项 | 缺口 |',
    '|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|',
  ]

  for (const item of report.businessTypes) {
    lines.push(`| ${item.businessType} | ${item.scheduleRowCount} | ${item.baseRowCount ?? 0} | ${item.profileRowCount} | ${item.runtimeReferenceDaysConsumedCount ?? 0}/${item.durationAssetRowCount ?? item.profileRowCount} | ${item.durationAssetSemanticGapCount ?? 0} | ${item.profilePhaseAnchorRowCount} | ${item.window.start ?? '-'} -> ${item.window.end ?? '-'} | ${item.profileDurationEvidenceReady ? 'candidate asset-backed L1' : 'missing'} | ${item.reviewStatus} | ${item.productionReadinessStatus} | ${item.productionReadinessBlockers.length ? item.productionReadinessBlockers.join(', ') : '-'} | ${item.gaps.length ? item.gaps.join(', ') : '-'} |`)
  }

  lines.push('', '## Profile 行明细', '')
  for (const item of report.businessTypes) {
    lines.push(`### ${item.businessType}`, '')
    lines.push(`- 阶段覆盖：${Object.keys(item.phaseCounts).join(', ')}`)
    lines.push(`- 工期资产：${item.profileDurationEvidenceReady ? 'profile 行均为 system-standard 或兼容 legacy candidate 的 L1 工期资产；runtime 校准与生产发布仍需独立证据' : 'profile 行缺少可识别的 L1 工期资产标识，需修复后再评审'}`)
    lines.push(`- 工期资产利用总账：${formatGeneratorDurationAssetUtilizationSummary(item.generatorDurationAssetUtilizationSummary)}`)
    lines.push(`- candidateCriticalPathEvidence：status=${item.candidateCriticalPathEvidence?.status ?? 'missing'}；criticalPathRows=${item.candidateCriticalPathEvidence?.criticalPathRowCount ?? 0}；floatCalculated=${item.candidateCriticalPathEvidence?.floatCalculatedRowCount ?? 0}/${item.candidateCriticalPathEvidence?.scheduleRowCount ?? 0}；totalFloat 输出字段已随行暴露；写入边界=${JSON.stringify(item.candidateCriticalPathEvidence?.mutationBoundary ?? {})}`)
    lines.push(`- 业态专属资产覆盖：${formatBusinessTypeSpecialtyAssetCoverage(item.businessTypeSpecialtyAssetCoverage)}`)
    lines.push(`- 业态资产覆盖明细：${formatBusinessTypeAssetCoverageList(item.businessTypeAssetCoverage)}`)
    lines.push(`- 资产语义审计：错配 ${item.durationAssetSemanticGapCount ?? 0} 条；${(item.durationAssetSemanticGapRows ?? []).map((gap) => `${gap.code}:${gap.gap}`).join(', ') || '无'}`)
    lines.push(`- runtime reference days：base ${item.baseRuntimeReferenceDaysConsumedCount ?? 0}/${item.baseRowCount ?? 0}，profile ${item.profileRuntimeReferenceDaysConsumedCount ?? 0}/${item.profileRowCount}，total ${item.runtimeReferenceDaysConsumedCount ?? 0}/${item.durationAssetRowCount ?? item.profileRowCount}；缺口 ${item.runtimeReferenceDaysMissingCount ?? 0} 条，仅作为候选工期输入消费证据。`)
    if ((item.profileMissingRuntimeReferenceStableCodes ?? []).length > 0) {
      lines.push(`- profile reference-day 采样缺口：${item.profileMissingRuntimeReferenceStableCodes.join(', ')}`)
    }
    lines.push(`- 验收移交计划化证据：featureTriggeredAcceptanceScheduleRowCount=${item.featureTriggeredAcceptanceScheduleRowCount ?? 0}；这些行必须是带开始/完成日期的候选 schedule_row，只作为主计划验收/联调/移交控制行，不写生产任务。`)
    lines.push(`- seed 来源分布：${Object.entries(item.seedResolverSourceCounts).map(([source, count]) => `${source}=${count}`).join(', ') || 'missing'}；运行 seed：${item.profileRuntimeSeedEvidenceReady ? '有 project/company/active seed 证据' : '无，仅 fallback 或缺失'}`)
    lines.push(`- 依赖证据：${item.profileDependencyEvidenceRowCount ?? 0}/${item.profileDependencyEvidenceRequiredRowCount ?? item.profileRowCount} 条需前置的 profile 行带候选依赖规则证据；无前置起始行 ${item.profileUnanchoredStartRowCount ?? 0} 条；${item.profilePhaseAnchorRowCount} 条 profile 行带候选 phase anchor；均只作为 dependency intent，不写生产依赖。`)
    lines.push(`- 依赖日期：profile 内部顺序依赖日期${item.profileDependencyDatesReady ? '一致' : '存在错位'}；错位数 ${item.profileDependencyDateViolationCount ?? 0}。`)
    lines.push(`- 生产就绪阻断：${item.productionReadinessBlockers.length ? item.productionReadinessBlockers.join(', ') : '-'}`)
    lines.push(`- 工程判断：${item.engineeringAssessment}`)
    lines.push('')
    lines.push('| 编码 | 名称 | 阶段 | 泳道 | 开始 | 完成 | 工期 | selected | seed | seed 来源 | seed 版本ID | seed P50 | T2 | T2 来源 | T2 版本ID | T2 P50 | risk P20 | risk P50 | risk P80 | totalFloat | criticalPath | 规模代理 | 生产率推导 | 真实骨架 | 骨架兜底 | 非骨架最大 | 选择规则 | 成熟度 | 复核门 | 候选锚点 | 五层依赖 | 写入边界 |')
    lines.push('|---|---|---|---|---|---|---:|---:|---|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---|---|---:|---|---|---|---:|---|---|')
    for (const row of item.profileRows) {
      const quantityProxyText = [
        row.quantityProxySource,
        row.quantityProxyValue == null ? null : `${row.quantityProxyValue}${row.quantityProxyUnit ? ` ${row.quantityProxyUnit}` : ''}`,
      ].filter(Boolean).join(' / ')
      lines.push(`| ${row.code} | ${row.title} | ${row.executionPhase} | ${row.executionLane} | ${row.startDate} | ${row.endDate} | ${row.durationDays} | ${formatCalculationCell(row.selectedDurationDays)} | ${row.durationAssetStableCode || '-'} | ${formatCalculationCell(row.standardWorkDurationSeedResolverSource)} | ${formatCalculationCell(row.standardWorkDurationSeedResolverVersionId)} | ${formatCalculationCell(row.standardWorkDurationSeedP50Days)} | ${row.t2RhythmTemplateId || '-'} | ${formatCalculationCell(row.t2RhythmTemplateResolverSource)} | ${formatCalculationCell(row.t2RhythmTemplateResolverVersionId)} | ${formatCalculationCell(row.t2RhythmTemplateP50Days)} | ${formatCalculationCell(row.riskP20DurationDays)} | ${formatCalculationCell(row.riskP50DurationDays)} | ${formatCalculationCell(row.riskP80DurationDays)} | ${formatCalculationCell(row.totalFloatDays)} | ${row.criticalPathCandidate ? 'yes' : 'no'} | ${formatCalculationCell(quantityProxyText)} | ${formatCalculationCell(row.productivityDerivedDurationDays)} | ${formatCalculationCell(row.realPlanSkeletonDurationDays)} | ${row.realPlanSkeletonFloorApplied ? 'yes' : 'no'} | ${formatCalculationCell(row.maxNonSkeletonAssetDays)} | ${formatCalculationCell(row.selectionRule)} | ${row.durationMaturity} | ${row.durationReviewGate} | ${row.phaseAnchorDependencyCount} | ${formatCalculationCell(row.dependencyRuleLayerStack)} | ${formatCalculationCell(row.dependencyProductionWritePolicy)} |`)
    }
    lines.push('')
  }

  lines.push('## 评审口径', '')
  lines.push('- 可审阅候选：非住宅通用主表行数在 15-60；`renovation`、`modular_building` 这类 dedicated-only 业态允许只有 6-12 条 profile 主控行且 `baseRowCount=0`，不得为了凑行数混入新建通用 base 行；无危大 checklist 泄漏；具备施工准备/基础、结构、机电/装修/行业系统、验收移交信号；profile 行显式标记 `business_type`。')
  lines.push('- 工期候选资产：profile 行必须明确为 system-standard 或 legacy candidate 的 L1 资产，不得显示为已发布 runtime 或真实历史样本；只有 legacy candidate 标签缺少 `GENERATION_DEPTH_TRUST_REVIEW_REQUIRED` 时不得判为可审阅。')
  lines.push('- 候选依赖锚点：profile 行必须连接到主计划骨架，但只能作为 dependency intent，不得自动写入 `task_dependencies`。')
  lines.push('- 不足以直接生产：没有真实项目资源、标段、楼层/区域拆分、专项方案选型、真实日历、审图/报批条件和运行发布证据。')
  return `${lines.join('\n')}\n`
}

function repoRelativePath(value) {
  return path.relative(REPO_ROOT, path.resolve(value)).replace(/\\/g, '/')
}

export function buildReportRunSummary(report, options) {
  const failedBusinessTypes = report.businessTypes
    .filter((item) => item.reviewStatus !== 'candidate_master_plan_reviewable')
    .map((item) => ({ businessType: item.businessType, gaps: item.gaps }))
  const productionBlockedBusinessTypes = report.businessTypes
    .filter((item) => item.productionReadinessStatus !== 'production_readiness_ready')
    .map((item) => ({
      businessType: item.businessType,
      blockers: item.productionReadinessBlockers ?? [],
    }))
  const candidateReady = failedBusinessTypes.length === 0
  const productionReady = productionBlockedBusinessTypes.length === 0
  const requireProductionReady = Boolean(options.requireProductionReady)
  const seedImportCompleted = report.seedSmokeImport?.status === 'imported'
  const seedImportCompletedWithCandidateReviewGaps = seedImportCompleted && !requireProductionReady && !candidateReady
  const status = candidateReady && (!requireProductionReady || productionReady)
    ? 'pass'
    : seedImportCompletedWithCandidateReviewGaps
      ? 'seed_import_completed_with_candidate_review_gaps'
      : 'fail'
  return {
    status,
    executionSucceeded: status !== 'fail',
    requireProductionReady,
    outputRoot: repoRelativePath(options.outputRoot),
    jsonPath: repoRelativePath(options.jsonPath),
    markdownPath: repoRelativePath(options.markdownPath),
    businessTypeCount: report.businessTypeCount,
    seedSmokeImport: report.seedSmokeImport
      ? {
        status: report.seedSmokeImport.status ?? null,
        mode: report.seedSmokeImport.mode ?? null,
        targetClass: report.seedSmokeImport.targetClass ?? null,
      }
      : null,
    failedBusinessTypes,
    productionReadinessStatus: productionReady ? 'production_readiness_ready' : 'production_readiness_blocked',
    productionReadinessBlockers: report.productionReadinessBlockers ?? [],
    productionBlockedBusinessTypes,
  }
}

async function main(argv = process.argv.slice(2)) {
  traceProfileReport('main_started')
  const args = parseArgs(argv)
  if (args.envFile || args.expectedEnvFileSha256 || args.expectedTargetFingerprint) {
    await bindRuntimeSeedImportTarget(args)
  }
  const seedSmokeImport = await runStandardDurationSeedSmokeImport(args)
  traceProfileReport('seed_smoke_ready')
  const generationDepthReviewManifest = await readGenerationDepthReviewManifest(args.generationDepthReviewManifestPath)
  const runtimeCalibrationEvidenceInput = await readRuntimeCalibrationEvidenceInput(args.durationCalibrationEvidencePath)
  traceProfileReport('local_evidence_ready')
  const [
    { generateWbsTemplateRows },
    { buildTemplateRecommendation },
    { buildWizardTemplateSelection },
  ] = await Promise.all([
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'wbsTemplateGenerationService.ts')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'projectFactsToTemplateService.ts')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'services', 'wizardTemplateSelectionService.ts')).href),
  ])
  traceProfileReport('generation_modules_loaded')

  const selectedBusinessTypes = new Set((args.businessTypes ?? []).map((item) => String(item ?? '').trim()).filter(Boolean))
  const selectedProbes = selectedBusinessTypes.size > 0
    ? probes.filter((probe) => selectedBusinessTypes.has(probe.businessType))
    : probes

  const results = []
  for (const probe of selectedProbes) {
  if (!NON_RESIDENTIAL_BUSINESS_TYPES.includes(probe.businessType)) continue
  const facts = buildDefaultMasterPlanProbeFacts(probe)
  const recommendation = buildTemplateRecommendation(facts)
  const templateSelection = buildWizardTemplateSelection(recommendation)
  const reportProjectId = buildReportProjectId(args, probe.businessType)
  traceProfileReport('business_type_generation_started', { businessType: probe.businessType })
  const generated = await generateWbsTemplateRows({
    projectId: reportProjectId,
    surface: 'task_list',
    detailLevel: 'planning_skeleton',
    diagnosticDurationSuggestionMode: 'fast_template',
    algorithmSeedSourcePolicy: 'built_in_only',
    operation: {
      type: 'template_generate',
      diagnosticStageTimings: process.env.WORKBUDDY_PROFILE_REPORT_TRACE === '1',
      generationBatchId: `report-default-master-plan-profile-${probe.businessType}`,
      templateIds: templateSelection.templateIds,
      selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
      selectedNodeIds: [],
      plannedStartDate: '2026-07-01',
      constructionCalendar: { basis: 'calendar_day', windows: [] },
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      includeActivitySteps: false,
      projectFacts: {
        ...facts,
        companyId: args.companyId,
        defaultPlanOutput: 'master_plan',
        masterPlanProfile: recommendation.masterPlanProfile,
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
        defaultMasterPlanRuntimeReferenceDays: runtimeCalibrationEvidenceInput,
      },
      clientContext: {
        defaultPlanOutput: 'master_plan',
        planOutputLayer: 'master_plan',
        masterPlanProfile: recommendation.masterPlanProfile,
        companyId: args.companyId,
        climateSignals: facts.climateSignals,
        weatherImpactBands: facts.weatherImpactBands,
        monthlyClimateSignal: facts.monthlyClimateSignal,
        rainySeasonMonths: facts.rainySeasonMonths,
        floodSeasonMonths: facts.floodSeasonMonths,
        highTempMonths: facts.highTempMonths,
        coldWeatherMonths: facts.coldWeatherMonths,
        locationFacts: facts.locationFacts,
        defaultMasterPlanRuntimeReferenceDays: runtimeCalibrationEvidenceInput,
      },
      scope: {
        scopeExpansionMode: 'project',
        company_id: args.companyId,
        business_type: probe.businessType,
        project_type_code: probe.projectTypeCode,
        structure_type_code: probe.structureTypeCode,
        method_variant_codes: probe.methodVariantCodes,
        buildingPatternCodes: probe.buildingPatternCodes,
        functionalUsageCodes: probe.functionalUsageCodes,
        functionalCategoryCodes: probe.functionalCategoryCodes,
        specialRoomTypeCodes: probe.specialRoomTypeCodes,
        physicalZoneTypeCodes: probe.physicalZoneTypeCodes,
        hardConstraintCodes: probe.hardConstraintCodes,
        planScopeCaliber: 'full_project',
        deliveryStandard: 'completion_acceptance',
        terminalEvent: 'joint_acceptance',
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
        building_count: facts.buildingCount,
        standard_floor_count: facts.standardFloorCount,
        highest_building_floor_count: facts.highestBuildingFloorCount,
        basement_level_count: facts.basementLevelCount,
        foundation_depth_m: facts.foundationDepthM,
        total_area_m2: facts.totalAreaM2,
        climate_signals: facts.climateSignals,
        weather_impact_bands: facts.weatherImpactBands,
        monthly_climate_signal: facts.monthlyClimateSignal,
        rainy_season_months: facts.rainySeasonMonths,
        flood_season_months: facts.floodSeasonMonths,
        high_temp_months: facts.highTempMonths,
        cold_weather_months: facts.coldWeatherMonths,
        location_facts: facts.locationFacts,
        project_features: {
          ...facts.projectFeatures,
          foundationMethodCandidates: recommendation.foundationMethodCandidates,
        },
        defaultMasterPlanRuntimeReferenceDays: runtimeCalibrationEvidenceInput,
      },
    },
  })
  traceProfileReport('business_type_generation_completed', { businessType: probe.businessType, rowCount: generated.rows.length })
  const generatorDurationAssetUtilizationSummary = readRecord(generated.durationAssetUtilizationSummary)
  const businessTypeSpecialtyAssetCoverage = summarizeBusinessTypeSpecialtyAssetCoverage(
    generatorDurationAssetUtilizationSummary,
  )
  const businessTypeAssetCoverage = summarizeBusinessTypeAssetCoverage(
    generatorDurationAssetUtilizationSummary,
  )
  const rawScheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
  const selectedReviewRows = rawScheduleRows.filter((row) => (
    isBusinessTypeBaseRow(row) || isBusinessTypeProfileRow(row)
  ))
  const dependencyAnchorClosure = collectDependencyClosureRows(rawScheduleRows, selectedReviewRows)
  const aliasByRequestedClientRowId = new Map(dependencyAnchorClosure.resolvedPredecessorAliases
    .map((resolution) => [resolution.requestedClientRowId, resolution]))
  const scheduleRows = rawScheduleRows.map((row) => (
    applyResolvedPredecessorAliases(row, aliasByRequestedClientRowId)
  ))
  const rowByClientRowId = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
  const baseRowsRaw = scheduleRows.filter(isBusinessTypeBaseRow)
  const profileRowsRaw = scheduleRows.filter(isBusinessTypeProfileRow)
  const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
  const stageText = scheduleRows.map((row) => [
    row.values.standard_work_code,
    row.values.title,
    row.values.execution_phase,
    row.values.execution_lane,
  ].join(' ')).join(' | ')
  const profileDurationEvidenceReady = profileRowsRaw.length > 0 && profileRowsRaw.every(hasProfileDurationEvidence)
  const profilePhaseAnchorRowCount = profileRowsRaw.filter(hasProfilePhaseAnchor).length
  const profilePhaseAnchorsReady = (DEDICATED_ONLY_BUSINESS_TYPES.has(probe.businessType) && baseRowsRaw.length === 0)
    || profilePhaseAnchorRowCount > 0
  const profileDependencyEvidence = evaluateProfileDependencyEvidence(profileRowsRaw, {
    allowsUnanchoredStart: DEDICATED_ONLY_BUSINESS_TYPES.has(probe.businessType) && baseRowsRaw.length === 0,
  })
  const profileDependencyEvidenceRowCount = profileDependencyEvidence.evidenceRowCount
  const profileDependencyEvidenceRequiredRowCount = profileDependencyEvidence.requiredRowCount
  const profileUnanchoredStartRowCount = profileDependencyEvidence.unanchoredStartRowCount
  const profileDependencyEvidenceReady = profileDependencyEvidence.ready
  const profileDependencyDateViolations = collectProfileDependencyDateViolations(scheduleRows, profileRowsRaw)
  const profileDependencyDateViolationCount = profileDependencyDateViolations.length
  const profileDependencyDatesReady = profileDependencyDateViolationCount === 0
  const generationDepthReviewEvidence = selectGenerationDepthReviewEvidenceForBusinessType(
    generationDepthReviewManifest,
    probe.businessType,
  )
  const candidateCriticalPathEvidence = buildCandidateCriticalPathEvidence(scheduleRows)
  const criticalPathByClientRowId = new Map(candidateCriticalPathEvidence.rows.map((row) => [row.clientRowId, row]))
  const baseRows = baseRowsRaw.map((row) => buildAuditableDurationAssetRow(row, criticalPathByClientRowId))
  const profileRows = profileRowsRaw.map((row) => buildAuditableDurationAssetRow(row, criticalPathByClientRowId))
  const dependencyAnchorRows = dependencyAnchorClosure.rows
    .map((row) => rowByClientRowId.get(row.clientRowId) ?? row)
    .map((row) => buildAuditableDurationAssetRow(row, criticalPathByClientRowId))
  const durationAssetRows = [...baseRows, ...profileRows]
  const durationAssetSemanticGaps = collectDurationAssetSemanticGaps(durationAssetRows)
  const summaryBase = {
    businessType: probe.businessType,
    generationDepth: generated.generationDepth,
    defaultPlanOutput: generated.defaultPlanOutput,
    scheduleRowCount: scheduleRows.length,
    reviewScheduleRowCount: durationAssetRows.length,
    linkedProjectionRowCount: generated.rows.filter((row) => row.rowProjectionMode === 'linked_projection').length,
    profileRowCount: profileRowsRaw.length,
    dependencyAnchorRowCount: dependencyAnchorRows.length,
    dependencyAnchorMissingPredecessorClientRowIds: dependencyAnchorClosure.missingPredecessorClientRowIds,
    dependencyAnchorResolvedPredecessorAliases: dependencyAnchorClosure.resolvedPredecessorAliases,
    profileDurationEvidenceReady,
    profilePhaseAnchorRowCount,
    profilePhaseAnchorsReady,
    profileDependencyEvidenceRowCount,
    profileDependencyEvidenceRequiredRowCount,
    profileUnanchoredStartRowCount,
    profileDependencyEvidenceReady,
    profileDependencyDateViolationCount,
    profileDependencyDatesReady,
    profileDependencyDateViolations,
    durationAssetSemanticGaps,
    constructionCalendar: normalizeReportConstructionCalendar(generated.constructionCalendar),
    candidateCriticalPathEvidence,
    generatorDurationAssetUtilizationSummary,
    businessTypeSpecialtyAssetCoverage,
    businessTypeAssetCoverage,
    dangerChecklistInSchedule: titles.some((title) => /危大工程识别与清单确认/.test(title)),
    hasFoundationOrStartupSignal: /foundation|pile|pit|earthwork|startup|地下|基础|基坑|土方|拆改|模块基础/i.test(stageText),
    hasStructureSignal: /structure|steel|主体|结构|钢结构|模块|屋盖/i.test(stageText),
    hasMepOrFitoutSignal: /MEP|fitout|facade|机电|安装|装饰|装修|洁净|客房|医技|数据|工艺|医疗气体|精密空调/i.test(stageText),
    hasAcceptanceSignal: /acceptance|handover|竣工|验收|移交|投产|试运营|开学|运营/i.test(stageText),
    generationDepthReviewEvidence,
  }
  const seedResolverSourceCounts = groupedCount(profileRows, (row) => (
    row.standardWorkDurationSeedResolverSource || 'missing'
  ))
  const allSeedResolverSourceCounts = groupedCount(durationAssetRows, (row) => (
    row.standardWorkDurationSeedResolverSource || 'missing'
  ))
  const profileRuntimeSeedEvidenceReady = profileRows.some((row) => (
    ['project_override', 'company_override', 'active_seed'].includes(row.standardWorkDurationSeedResolverSource)
  ))
  const baseRuntimeReferenceDaysConsumedCount = baseRows.filter((row) => row.runtimeReferenceDaysConsumed).length
  const profileRuntimeReferenceDaysConsumedCount = profileRows.filter((row) => row.runtimeReferenceDaysConsumed).length
  const runtimeReferenceDaysConsumedCount = durationAssetRows.filter((row) => row.runtimeReferenceDaysConsumed).length
  const baseRuntimeReferenceDayGapRows = buildRuntimeReferenceDayGapRows(baseRows, { rowGroup: 'base' })
  const profileRuntimeReferenceDayGapRows = buildRuntimeReferenceDayGapRows(profileRows, { rowGroup: 'profile' })
  const runtimeReferenceDayGapRows = [...baseRuntimeReferenceDayGapRows, ...profileRuntimeReferenceDayGapRows]
  const featureTriggeredAcceptanceScheduleRowCount = durationAssetRows
    .filter((row) => row.featureTriggeredAcceptanceScheduleRow === true).length
  const profileRuntimeReferenceDaysEvidenceReady = profileRows.length > 0
    && profileRuntimeReferenceDaysConsumedCount === profileRows.length
  const generatorDurationAssetUtilizationSummaryForReport = buildGeneratorDurationAssetUtilizationSummaryForReport(
    generatorDurationAssetUtilizationSummary,
    {
      runtimeReferenceDaysConsumedRowCount: runtimeReferenceDaysConsumedCount,
      baseRuntimeReferenceDayGapRows,
      profileRuntimeReferenceDayGapRows,
      featureTriggeredAcceptanceScheduleRowCount,
    },
  )
  summaryBase.generatorDurationAssetUtilizationSummary = generatorDurationAssetUtilizationSummaryForReport
  const review = classifyReview({
    ...summaryBase,
    profileRuntimeSeedEvidenceReady,
    baseRuntimeReferenceDaysConsumedCount,
    profileRuntimeReferenceDaysConsumedCount,
    runtimeReferenceDaysConsumedCount,
    featureTriggeredAcceptanceScheduleRowCount,
    baseRuntimeReferenceDaysMissingCount: baseRuntimeReferenceDayGapRows.length,
    profileRuntimeReferenceDaysMissingCount: profileRuntimeReferenceDayGapRows.length,
    runtimeReferenceDaysMissingCount: runtimeReferenceDayGapRows.length,
    profileRuntimeReferenceDaysEvidenceReady,
    governanceWarnings: generated.governanceWarnings ?? [],
  })
  results.push({
    ...summaryBase,
    ...review,
    durationCalibrationCounts: groupedCount(scheduleRows, (row) => row.values.duration_calibration_source ?? readDurationSuggestion(row).durationCalibrationSource),
    durationMaturityCounts: groupedCount(scheduleRows, (row) => row.values.duration_evidence_maturity ?? readDurationSuggestion(row).dataMaturity),
    durationTruthSourceCounts: groupedCount(scheduleRows, (row) => row.values.duration_truth_source ?? readDurationSuggestion(row).planDurationTruthSource),
    window: {
      start: minDate(scheduleRows, 'planned_start_date'),
      end: maxDate(scheduleRows, 'planned_end_date'),
    },
    phaseCounts: groupedCount(scheduleRows, (row) => row.values.execution_phase ?? row.executionPhase),
    baseRowCount: baseRows.length,
    baseRows,
    profileRows,
    dependencyAnchorRows,
    durationAssetRowCount: durationAssetRows.length,
    seedResolverSourceCounts,
    allSeedResolverSourceCounts,
    profileRuntimeSeedEvidenceReady,
    baseRuntimeReferenceDaysConsumedCount,
    profileRuntimeReferenceDaysConsumedCount,
    runtimeReferenceDaysConsumedCount,
    featureTriggeredAcceptanceScheduleRowCount,
    baseRuntimeReferenceDaysMissingCount: baseRuntimeReferenceDayGapRows.length,
    profileRuntimeReferenceDaysMissingCount: profileRuntimeReferenceDayGapRows.length,
    runtimeReferenceDaysMissingCount: runtimeReferenceDayGapRows.length,
    durationAssetSemanticGapCount: durationAssetSemanticGaps.length,
    durationAssetSemanticGapRows: durationAssetSemanticGaps,
    missingRuntimeReferenceStableCodes: uniqueText(runtimeReferenceDayGapRows.map((row) => row.requiredRuntimeReferenceStableCode)),
    profileMissingRuntimeReferenceStableCodes: uniqueText(profileRuntimeReferenceDayGapRows.map((row) => row.requiredRuntimeReferenceStableCode)),
    baseRuntimeReferenceDayGapRows,
    profileRuntimeReferenceDayGapRows,
    profileRuntimeReferenceDaysEvidenceReady,
    offlineDevelopmentQualityReviewCompleted: hasCompletedOfflineDevelopmentQualityReview({
      ...summaryBase,
      governanceWarnings: generated.governanceWarnings ?? [],
    }),
    engineeringAssessment: review.gaps.length === 0
      ? '可作为默认主计划候选草稿进入普通预览、编辑和确认；离线质量审查结果仅用于继续校准模板与规则。'
      : '当前样例仍需补 profile 或生成策略，不能作为主计划候选草稿。',
    governanceWarnings: generated.governanceWarnings ?? [],
  })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'generate-default-master-plan-profile-report',
    mutationBoundary: {
      writesProductionTables: false,
      writesAlgorithmSeedVersions: Boolean(seedSmokeImport.mutationBoundary?.writesAlgorithmSeedVersions),
      writesAlgorithmSeedRecords: Boolean(seedSmokeImport.mutationBoundary?.writesAlgorithmSeedRecords),
      writesAlgorithmSeedImportLogs: Boolean(seedSmokeImport.mutationBoundary?.writesAlgorithmSeedImportLogs),
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
    seedSmokeImport,
    durationCalibrationEvidence: runtimeCalibrationEvidenceInput
      ? {
        path: args.durationCalibrationEvidencePath ? repoRelativePath(args.durationCalibrationEvidencePath) : null,
        status: runtimeCalibrationEvidenceInput.status,
        evidenceLevel: runtimeCalibrationEvidenceInput.evidenceLevel,
        runtimeReferenceDayCount: runtimeCalibrationEvidenceInput.runtimeReferenceDays.length,
        mutationBoundary: runtimeCalibrationEvidenceInput.mutationBoundary,
      }
      : null,
    offlineDevelopmentQualityReviewManifestPath: args.generationDepthReviewManifestPath
      ? repoRelativePath(args.generationDepthReviewManifestPath)
      : null,
    businessTypeCount: results.length,
    selectedBusinessTypes: [...selectedBusinessTypes],
    allReviewable: results.every((item) => item.reviewStatus === 'candidate_master_plan_reviewable'),
    allProductionReady: results.every((item) => item.productionReadinessStatus === 'production_readiness_ready'),
    productionReadinessBlockers: [...new Set(results.flatMap((item) => item.productionReadinessBlockers))],
    offlineDevelopmentQualityReviewCompletedCount: results.filter((item) => item.offlineDevelopmentQualityReviewCompleted).length,
    businessTypes: results,
  }

  await fs.mkdir(args.outputRoot, { recursive: true })
  const jsonPath = path.join(args.outputRoot, 'default-master-plan-profile-samples.json')
  const mdPath = path.join(args.outputRoot, 'default-master-plan-profile-samples.md')
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await fs.writeFile(mdPath, buildMarkdown(report), 'utf8')
  traceProfileReport('report_files_written', { businessTypeCount: results.length })

  const runSummary = buildReportRunSummary(report, {
    outputRoot: args.outputRoot,
    jsonPath,
    markdownPath: mdPath,
    requireProductionReady: args.requireProductionReady,
  })
  console.log(JSON.stringify(runSummary, null, 2))

  if (runSummary.executionSucceeded !== true) {
    process.exitCode = 1
  }
}

async function closeProfileReportRuntimeResources() {
  traceProfileReport('runtime_resource_close_started')
  const databaseModule = await import(
    pathToFileURL(path.join(REPO_ROOT, 'server', 'src', 'database.ts')).href
  )
  if (typeof databaseModule.closeDatabasePool === 'function') {
    await databaseModule.closeDatabasePool()
  }
  traceProfileReport('runtime_resource_close_completed')
}

if (isDirectEntrypoint()) {
  if (!isTsxRuntime() && process.env[TSX_BOOTSTRAP_ENV] !== '1') {
    runViaTsxAndExit()
  }
  try {
    await main()
  } finally {
    await closeProfileReportRuntimeResources()
  }
}
