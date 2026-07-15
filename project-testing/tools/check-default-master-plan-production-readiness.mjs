#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProductionReadinessQualification } from './default-master-plan-evidence-boundary.mjs'
import { validateRealProductionOutcomeEvidence } from './default-master-plan-real-outcome-evidence.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles', 'default-master-plan-profile-samples.json')
const DEFAULT_RESIDENTIAL_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'current-default-master-plan-wbs-residential.md')
const DEFAULT_RUNTIME_EVIDENCE_FILES = {
  reviewEvidence: 'pm-review-evidence.json',
  runtimeSeedEvidencePipeline: 'runtime-seed-evidence-pipeline.json',
  durationSampleCollectionPackage: 'duration-sample-collection-package.json',
  durationSampleCoverageEvidence: 'duration-sample-coverage-evidence.json',
  durationCalibrationEvidence: 'duration-calibration-evidence.json',
  dependencyWriterEvidence: 'dependency-writer-evidence.json',
  runtimePublicationEvidence: 'runtime-publication-evidence.json',
  postPublishSmokeRollbackEvidence: 'post-publish-smoke-rollback-evidence.json',
}
const DEFAULT_SOURCE_MANIFEST = path.join('source-exports', 'source-exports-manifest.json')
const ALL_BUSINESS_TYPES = [
  'general_civil_residential',
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
const SOURCE_EXPORT_REF_KEY_BY_TYPE = {
  candidate_default_master_plan_review_export: 'reviewExport',
  duration_experience_samples_export: 'durationSamples',
  task_dependencies_export: 'taskDependencies',
  wbs_template_runtime_publications_export: 'runtimePublications',
  api_read_smoke_export: 'apiReadSmoke',
  ui_consumption_smoke_export: 'uiConsumptionSmoke',
  critical_path_readback_export: 'criticalPathReadback',
  rollback_verification_export: 'rollbackVerification',
}
const DURATION_SAMPLE_SOURCE_KINDS = new Set([
  'database_table',
  'operator_supplied_real_duration_sample_material',
  'blocked_real_duration_sample_material',
])
const SOURCE_EXPORT_RECORD_CONTRACTS = {
  durationSamples: {
    source: 'duration_experience_samples',
    kind: 'database_table',
    table: 'public.duration_experience_samples',
    pipelineFlag: '--duration-samples',
  },
  taskDependencies: {
    source: 'task_dependencies',
    kind: 'database_table',
    table: 'public.task_dependencies',
    pipelineFlag: '--task-dependencies',
  },
  runtimePublications: {
    source: 'wbs_template_runtime_publications',
    kind: 'database_table',
    table: 'public.wbs_template_runtime_publications',
    pipelineFlag: '--runtime-publications',
  },
  apiReadSmoke: {
    source: 'api_read_smoke',
    kind: 'source_file',
    pipelineFlag: '--api-read-smoke',
  },
  uiConsumptionSmoke: {
    source: 'ui_consumption_smoke',
    kind: 'source_file',
    pipelineFlag: '--ui-consumption-smoke',
  },
  criticalPathReadback: {
    source: 'critical_path_readback',
    kind: 'source_file',
    pipelineFlag: '--critical-path-readback',
  },
  rollbackVerification: {
    source: 'rollback_verification',
    kind: 'source_file',
    pipelineFlag: '--rollback-verification',
  },
}
const OPTIONAL_SOURCE_EXPORT_RECORD_CONTRACTS = {
  realProductionOutcome: {
    source: 'real_production_outcome',
    kind: 'source_file',
    pipelineFlag: '--real-production-outcome',
  },
}

function parseArgs(argv) {
  const args = {
    outputRoot: DEFAULT_OUTPUT_ROOT,
    profileReport: DEFAULT_PROFILE_REPORT,
    residentialReport: DEFAULT_RESIDENTIAL_REPORT,
    reviewEvidence: null,
    runtimeSeedEvidencePipeline: null,
    durationSampleCollectionPackage: null,
    durationSampleCoverageEvidence: null,
    durationCalibrationEvidence: null,
    dependencyWriterEvidence: null,
    runtimePublicationEvidence: null,
    postPublishSmokeRollbackEvidence: null,
    sourceManifest: null,
    failOnNotReady: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output-root') {
      args.outputRoot = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--profile-report') {
      args.profileReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--residential-report') {
      args.residentialReport = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--review-evidence') {
      args.reviewEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-seed-evidence-pipeline') {
      args.runtimeSeedEvidencePipeline = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-collection-package') {
      args.durationSampleCollectionPackage = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-sample-coverage-evidence') {
      args.durationSampleCoverageEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--duration-calibration-evidence') {
      args.durationCalibrationEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--dependency-writer-evidence') {
      args.dependencyWriterEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--runtime-publication-evidence') {
      args.runtimePublicationEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--post-publish-smoke-rollback-evidence') {
      args.postPublishSmokeRollbackEvidence = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--source-manifest') {
      args.sourceManifest = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--fail-on-not-ready') {
      args.failOnNotReady = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/check-default-master-plan-production-readiness.mjs [--output-root <dir>] [--profile-report <json>] [--residential-report <md>] [--review-evidence <json>] [--runtime-seed-evidence-pipeline <json>] [--duration-sample-collection-package <json>] [--duration-sample-coverage-evidence <json>] [--duration-calibration-evidence <json>] [--dependency-writer-evidence <json>] [--runtime-publication-evidence <json>] [--post-publish-smoke-rollback-evidence <json>] [--source-manifest <json>] [--fail-on-not-ready]`)
      process.exit(0)
    }
  }
  return args
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function applyDefaultRuntimeEvidencePaths(args) {
  for (const [key, fileName] of Object.entries(DEFAULT_RUNTIME_EVIDENCE_FILES)) {
    if (args[key]) continue
    const defaultPath = path.join(args.outputRoot, fileName)
    if (await fileExists(defaultPath)) {
      args[key] = defaultPath
    }
  }
  if (!args.sourceManifest) {
    const defaultPath = path.join(args.outputRoot, DEFAULT_SOURCE_MANIFEST)
    if (await fileExists(defaultPath)) {
      args.sourceManifest = defaultPath
    }
  }
  return args
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function parseResidentialSummary(markdown, sourcePath) {
  const rowMatch = markdown.match(/-\s*[^:\n]*[:：]\s*(\d+)\s*[^0-9\n]*schedule_row/i)
    ?? markdown.match(/-\s*[^:\n]*[:：]\s*(\d+)\s*条/)
  const scheduleRowCount = rowMatch ? Number(rowMatch[1]) : 0
  const hasResidentialMode = markdown.includes('residential_master_plan_v2')
  const hasAssetBackedMode = markdown.includes('asset_backed_default_master_plan')
    || markdown.includes('asset_backed_candidate_master_plan')
    || markdown.includes('standard_work_duration_seed+t2_rhythm_template+real_plan_evidence')
  const hasCandidateBoundary = markdown.includes('candidate') || markdown.includes('候选')
  const hasNoProductionWriteBoundary = [
    'tasks',
    'task_dependencies',
    'runtime publication',
  ].every((marker) => markdown.includes(marker))
  return {
    businessType: 'general_civil_residential',
    generationMode: hasAssetBackedMode
      ? 'asset_backed_default_master_plan'
      : hasResidentialMode
        ? 'residential_master_plan_v2'
        : 'missing',
    scheduleRowCount,
    profileRowCount: null,
    profilePhaseAnchorRowCount: null,
    reviewStatus: scheduleRowCount >= 30 && scheduleRowCount <= 180 && hasResidentialMode
      ? 'candidate_master_plan_reviewable'
      : 'candidate_shape_missing',
    shapeGaps: [
      scheduleRowCount >= 30 && scheduleRowCount <= 180 ? null : 'row_count_outside_30_180',
      hasResidentialMode ? null : 'missing_residential_master_plan_v2_marker',
      hasCandidateBoundary ? null : 'missing_candidate_boundary_marker',
      hasNoProductionWriteBoundary ? null : 'missing_no_production_write_boundary',
    ].filter(Boolean),
    evidenceLevel: markdown.includes('asset_backed_candidate_master_plan') || markdown.includes('standard_work_duration_seed+t2_rhythm_template+real_plan_evidence')
      ? 'candidate_asset_backed_l1'
      : markdown.includes('L1')
        ? 'candidate_cold_start_l1'
        : 'unknown',
    sourceEvidencePath: repoRelative(sourcePath),
  }
}

function normalizeNonResidentialSummary(item, sourcePath) {
  const scheduleRowCount = Number(item.scheduleRowCount ?? 0)
  const baseRowCount = Number(item.baseRowCount ?? 0)
  const profileRowCount = Number(item.profileRowCount ?? 0)
  const hasDedicatedOnlyCandidateShape = DEDICATED_ONLY_BUSINESS_TYPES.has(item.businessType)
    && baseRowCount === 0
    && scheduleRowCount === profileRowCount
    && profileRowCount >= 6
    && profileRowCount <= 12
  const hasStandardCandidateShape = scheduleRowCount >= 15 && scheduleRowCount <= 60
  const hasCandidateShape = hasStandardCandidateShape || hasDedicatedOnlyCandidateShape
  const profileGaps = Array.isArray(item.gaps)
    ? item.gaps.filter((gap) => !(hasDedicatedOnlyCandidateShape && gap === 'row_count_outside_15_60'))
    : []
  const reviewStatus = item.reviewStatus === 'needs_profile_review' && hasCandidateShape && profileGaps.length === 0
    ? 'candidate_master_plan_reviewable'
    : item.reviewStatus ?? (hasCandidateShape ? 'candidate_master_plan_reviewable' : 'candidate_shape_missing')
  return {
    businessType: item.businessType,
    generationMode: 'managed_frontier_default_master_plan',
    scheduleRowCount,
    baseRowCount,
    profileRowCount,
    profilePhaseAnchorRowCount: Number(item.profilePhaseAnchorRowCount ?? 0),
    reviewStatus,
    shapeGaps: [
      hasCandidateShape ? null : 'row_count_outside_15_60',
      ...profileGaps,
    ].filter(Boolean),
    evidenceLevel: item.profileDurationEvidenceReady ? 'candidate_asset_backed_l1' : 'unknown',
    sourceEvidencePath: repoRelative(sourcePath),
  }
}

async function readReviewEvidence(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `review evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readDurationCalibrationEvidence(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `duration calibration evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readRuntimeSeedEvidencePipeline(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `runtime seed evidence pipeline file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readDurationSampleCollectionPackage(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `duration sample collection package file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readDurationSampleCoverageEvidence(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `duration sample coverage evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readDependencyWriterEvidence(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `dependency writer evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readRuntimePublicationEvidence(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `runtime publication evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readPostPublishSmokeRollbackEvidence(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `post-publish smoke rollback evidence file not found: ${filePath}`,
      }
    }
    throw error
  }
}

async function readSourceManifest(filePath) {
  if (!filePath) return null
  try {
    return await readJson(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        __readError: `source manifest file not found: ${filePath}`,
      }
    }
    throw error
  }
}

function readReviewRecord(rawEvidence) {
  if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) return {}
  const candidates = [
    rawEvidence.candidate_governance_review,
    rawEvidence.candidateGovernanceReview,
    rawEvidence.review,
    rawEvidence,
  ]
  return candidates.find((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate)) ?? {}
}

function readChangeLogRecord(rawEvidence) {
  if (!rawEvidence || typeof rawEvidence !== 'object' || Array.isArray(rawEvidence)) return {}
  const candidate = rawEvidence.change_log ?? rawEvidence.changeLog
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {}
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : []
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function readBoolean(value) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true'
}

function supportedDefaultMasterPlanSourceLabel(value) {
  const label = String(value ?? '').trim()
  return label === 'residential_master_plan_v2'
    || label === 'managed_frontier_default_master_plan'
    || label === 'asset_backed_default_master_plan'
}

function defaultMasterPlanSourceBlockers(generationMode, sourceVersionLabel) {
  if (supportedDefaultMasterPlanSourceLabel(generationMode) || supportedDefaultMasterPlanSourceLabel(sourceVersionLabel)) return []
  if (!String(generationMode ?? '').trim() && !String(sourceVersionLabel ?? '').trim()) {
    return ['candidate_default_master_plan_source_version_label_required']
  }
  return ['candidate_default_master_plan_source_version_label_unsupported']
}

function defaultMasterPlanGenerationModeBlockers(generationMode) {
  if (supportedDefaultMasterPlanSourceLabel(generationMode)) return []
  return [String(generationMode ?? '').trim()
    ? 'default_master_plan_generation_mode_unsupported'
    : 'default_master_plan_generation_mode_required']
}

function normalizeStatus(value) {
  return String(value ?? '').trim()
}

function readEvidenceRef(record) {
  return String(record.evidence_ref ?? record.evidenceRef ?? record.sourceEvidenceRef ?? record.source_evidence_ref ?? '').trim()
}

function parseSourceExportEvidenceRef(value) {
  const ref = String(value ?? '').trim()
  const match = ref.match(/^([^:#]+):([^#]+)#sha256=([a-f0-9]{64})$/i)
  if (!match) return null
  const [, type, sourcePath, sha256] = match
  const manifestKey = SOURCE_EXPORT_REF_KEY_BY_TYPE[type]
  if (!manifestKey) return null
  return {
    ref,
    type,
    manifestKey,
    path: sourcePath.trim(),
    sha256: sha256.toLowerCase(),
  }
}

function readMutationBoundary(record) {
  return readObject(record.mutationBoundary ?? record.mutation_boundary)
}

function readMutationBoundaryFlag(boundary, camelName) {
  const snakeName = camelName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
  return readBoolean(boundary[camelName] ?? boundary[snakeName])
}

function mutationBoundaryBlockers(evidenceId, rawEvidence, requiredReadFlags) {
  const boundary = readMutationBoundary(rawEvidence)
  if (Object.keys(boundary).length === 0) {
    return [`${evidenceId}_mutation_boundary_required`]
  }

  const writeFlags = [
    'writesProductionTables',
    'writesTasks',
    'writesTaskDependencies',
    'writesRuntimePublication',
    'writesSeeds',
    'writesBaselines',
    'writesDurationSamples',
    'performsRollback',
  ]

  return [
    ...requiredReadFlags.map((flag) => (
      readMutationBoundaryFlag(boundary, flag) ? null : `${evidenceId}_${flag}_required`
    )),
    ...writeFlags.map((flag) => (
      readMutationBoundaryFlag(boundary, flag) ? `${evidenceId}_${flag}_must_be_false` : null
    )),
  ].filter(Boolean)
}

function readBaselineId(record) {
  return String(record.baselineId ?? record.baseline_id ?? '').trim()
}

function readProjectId(record) {
  return String(record.projectId ?? record.project_id ?? '').trim()
}

function readPublicationKey(record) {
  return String(record.publicationKey ?? record.publication_key ?? '').trim()
}

function hasPassingStatus(value) {
  return ['pass', 'passed', 'completed', 'readback_passed'].includes(normalizeStatus(value))
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
}

function identityMismatchBlocker(code, values) {
  const uniqueValues = uniqueNonEmpty(values)
  return uniqueValues.length > 1 ? `${code}:${uniqueValues.join('!=')}` : null
}

function smokeIdentityBlockers(kind, record, expected) {
  const baselineId = readBaselineId(record)
  const projectId = readProjectId(record)
  const publicationKey = readPublicationKey(record)
  return [
    baselineId ? null : `${kind}_baseline_id_required`,
    projectId ? null : `${kind}_project_id_required`,
    publicationKey ? null : `${kind}_publication_key_required`,
    baselineId && baselineId !== expected.baselineId ? `${kind}_baseline_id_mismatch` : null,
    projectId && projectId !== expected.projectId ? `${kind}_project_id_mismatch` : null,
    publicationKey && publicationKey !== expected.publicationKey ? `${kind}_publication_key_mismatch` : null,
  ].filter(Boolean)
}

function evaluateOfflineDevelopmentQualityReview(rawEvidence, sourcePath) {
  if (!rawEvidence) {
    return {
      status: 'not_provided',
      requiredForRuntime: false,
      intendedUse: 'offline_development_quality_review_and_template_calibration',
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'unavailable',
      requiredForRuntime: false,
      intendedUse: 'offline_development_quality_review_and_template_calibration',
      issues: [rawEvidence.__readError],
    }
  }

  return {
    status: 'available',
    requiredForRuntime: false,
    intendedUse: 'offline_development_quality_review_and_template_calibration',
    sourceEvidencePath: repoRelative(sourcePath),
    legacyRuntimeApprovalContractIgnored: true,
  }
}

function evaluateDurationCalibrationEvidence(rawEvidence, sourcePath) {
  if (!rawEvidence) {
    return {
      status: 'blocked',
      blockers: ['Current evidence level is candidate L1; missing accepted real duration samples, calibration deltas, and runtime-calibrated reference days.'],
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'blocked',
      blockers: [rawEvidence.__readError],
    }
  }

  const root = readObject(rawEvidence)
  const runtimeReferenceDays = Array.isArray(root.runtimeReferenceDays)
    ? root.runtimeReferenceDays
    : Array.isArray(root.runtime_reference_days)
      ? root.runtime_reference_days
      : []
  const calibrationDeltas = Array.isArray(root.calibrationDeltas)
    ? root.calibrationDeltas
    : Array.isArray(root.calibration_deltas)
      ? root.calibration_deltas
      : []
  const acceptedSampleCount = readNumber(root.acceptedRealDurationSampleCount ?? root.accepted_real_duration_sample_count ?? root.acceptedSampleCount ?? root.accepted_sample_count)
  const calibratedReferenceDayCount = readNumber(root.calibratedReferenceDayCount ?? root.calibrated_reference_day_count ?? root.runtimeReferenceDayCount ?? root.runtime_reference_day_count)
  const calibrationDeltaCount = readNumber(root.calibrationDeltaCount ?? root.calibration_delta_count) || calibrationDeltas.length
  const evidenceLevel = String(root.evidenceLevel ?? root.evidence_level ?? '').trim()
  const status = String(root.status ?? '').trim()
  const source = String(root.source ?? '').trim()
  const sourceEvidenceRef = String(root.sourceEvidenceRef ?? root.source_evidence_ref ?? '').trim()
  const coverageEvidenceRef = String(root.coverageEvidenceRef ?? root.coverage_evidence_ref ?? '').trim()
  const invalidRuntimeReferenceDays = runtimeReferenceDays.filter((item) => {
    const record = readObject(item)
    return !String(record.stableCode ?? record.stable_code ?? '').trim()
      || readNumber(record.p50Days ?? record.p50_days ?? record.referenceDays ?? record.reference_days) <= 0
      || String(record.source ?? record.source_type ?? '').trim() !== 'accepted_real_project_outcome'
  })
  const runtimeReferenceDaysWithoutSourceSamples = runtimeReferenceDays.filter((item) => {
    const record = readObject(item)
    const sourceSampleIds = Array.isArray(record.sourceSampleIds)
      ? record.sourceSampleIds
      : Array.isArray(record.source_sample_ids)
        ? record.source_sample_ids
        : []
    return sourceSampleIds.map((value) => String(value ?? '').trim()).filter(Boolean).length === 0
  })
  const invalidCalibrationDeltas = calibrationDeltas.filter((item) => {
    const record = readObject(item)
    return !String(record.stableCode ?? record.stable_code ?? '').trim()
      || readNumber(record.calibratedDays ?? record.calibrated_days) <= 0
  })
  const missing = [
    String(root.baselineId ?? root.baseline_id ?? '').trim() ? null : 'baseline_id_required',
    String(root.projectId ?? root.project_id ?? '').trim() ? null : 'project_id_required',
    status === 'runtime_calibrated' ? null : 'runtime_duration_calibration_status_required',
    evidenceLevel === 'runtime_calibrated_l2' ? null : 'runtime_calibrated_l2_evidence_level_required',
    source === 'runtime_duration_calibration' ? null : 'runtime_duration_calibration_source_required',
    acceptedSampleCount > 0 ? null : 'accepted_real_duration_sample_count_required',
    calibratedReferenceDayCount > 0 ? null : 'calibrated_reference_day_count_required',
    calibrationDeltaCount > 0 ? null : 'calibration_delta_count_required',
    runtimeReferenceDays.length > 0 ? null : 'runtime_reference_days_required',
    calibrationDeltas.length > 0 ? null : 'calibration_deltas_required',
    invalidRuntimeReferenceDays.length === 0 ? null : 'runtime_reference_days_must_use_accepted_real_project_outcome',
    runtimeReferenceDaysWithoutSourceSamples.length === 0 ? null : 'runtime_reference_days_must_include_source_sample_ids',
    invalidCalibrationDeltas.length === 0 ? null : 'calibration_deltas_must_include_calibrated_days',
    String(root.calibratedBy ?? root.calibrated_by ?? '').trim() ? null : 'calibrated_by_required',
    String(root.calibratedAt ?? root.calibrated_at ?? '').trim() ? null : 'calibrated_at_required',
    sourceEvidenceRef ? null : 'source_evidence_ref_required',
    sourceEvidenceRef.startsWith('duration_experience_samples_export:') && sourceEvidenceRef.includes('#sha256=')
      ? null
      : 'duration_experience_samples_export_hash_required',
    coverageEvidenceRef.startsWith('duration_sample_coverage_evidence:') && coverageEvidenceRef.includes('#sha256=')
      ? null
      : 'duration_sample_coverage_evidence_hash_required',
    ...mutationBoundaryBlockers('runtime_duration_calibration_evidence', rawEvidence, [
      'readsDurationExperienceSamplesExport',
      'readsDurationSampleCoverageEvidence',
    ]),
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      status: 'blocked',
      blockers: missing,
    }
  }

  return {
    status: 'pass',
    evidence: {
      sourceEvidencePath: repoRelative(sourcePath),
      baselineId: root.baselineId ?? root.baseline_id,
      projectId: root.projectId ?? root.project_id,
      evidenceLevel,
      acceptedRealDurationSampleCount: acceptedSampleCount,
      calibratedReferenceDayCount,
      calibrationDeltaCount,
      calibratedBy: root.calibratedBy ?? root.calibrated_by,
      calibratedAt: root.calibratedAt ?? root.calibrated_at,
      sourceEvidenceRef,
      coverageEvidenceRef,
      productionReady: false,
    },
  }
}

function evaluateRuntimeSeedEvidencePipeline(rawEvidence, sourcePath) {
  if (!rawEvidence) {
    return {
      status: 'not_provided',
      blockers: [],
      evidence: {
        status: 'not_provided',
        sourceEvidencePath: null,
        productionReady: false,
      },
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'blocked',
      blockers: [rawEvidence.__readError],
      evidence: {
        status: 'read_error',
        sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
        productionReady: false,
      },
    }
  }

  const root = readObject(rawEvidence)
  const summary = readObject(root.summary)
  const preflight = readObject(summary.preflight)
  const runtimeReferenceDays = readObject(preflight.runtimeReferenceDays ?? preflight.runtime_reference_days)
  const coverage = readObject(summary.coverage)
  const importGate = readObject(summary.importGate ?? summary.import_gate)
  const status = normalizeStatus(root.status)
  const rootBlockers = normalizeStringArray(root.blockers)
  const preflightBlockers = normalizeStringArray(preflight.blockers)
  const importGateBlockers = normalizeStringArray(importGate.blockers)
  const missingRuntimeSeedBusinessTypeCount = readNumber(preflight.missingBusinessTypeCount ?? preflight.missing_business_type_count)
  const missingRuntimeReferenceBusinessTypeCount = readNumber(runtimeReferenceDays.missingBusinessTypeCount ?? runtimeReferenceDays.missing_business_type_count)
  const missingStableCodeCount = readNumber(coverage.missingStableCodeCount ?? coverage.missing_stable_code_count)
  const importRequired = importGate.importRequired ?? importGate.import_required
  const importGateStatus = normalizeStatus(importGate.status)
  const runtimeSeedEvidenceAlreadyReady = readBoolean(importGate.runtimeSeedEvidenceAlreadyReady ?? importGate.runtime_seed_evidence_already_ready)
  const mutationBoundary = readMutationBoundary(root)
  const missing = uniqueNonEmpty([
    status === 'runtime_seed_import_not_required' ? null : `runtime_seed_evidence_pipeline_status_${status || 'required'}`,
    missingRuntimeSeedBusinessTypeCount === 0 ? null : 'runtime_seed_evidence_missing_for_some_business_types',
    missingRuntimeReferenceBusinessTypeCount === 0 ? null : 'runtime_reference_days_evidence_missing',
    missingStableCodeCount === 0 ? null : 'runtime_seed_stable_code_coverage_incomplete',
    importRequired === false ? null : 'runtime_seed_import_must_be_not_required_after_activation',
    importGateStatus === 'runtime_seed_import_not_required' ? null : 'runtime_seed_import_gate_not_closed',
    runtimeSeedEvidenceAlreadyReady ? null : 'runtime_seed_evidence_already_ready_required',
    readMutationBoundaryFlag(mutationBoundary, 'writesEvidenceReportsOnly') ? null : 'runtime_seed_evidence_pipeline_writesEvidenceReportsOnly_required',
    ...rootBlockers,
    ...preflightBlockers,
    ...importGateBlockers,
    ...mutationBoundaryBlockers('runtime_seed_evidence_pipeline', rawEvidence, [
      'runsReadOnlyEvidenceScripts',
      'readsRuntimeSeedReports',
    ]),
  ])

  const evidence = {
    status,
    sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
    runtimeSeed: {
      readyBusinessTypeCount: readNumber(preflight.readyBusinessTypeCount ?? preflight.ready_business_type_count),
      missingBusinessTypeCount: missingRuntimeSeedBusinessTypeCount,
      requiredRuntimeSeedStableCodeCount: readNumber(preflight.requiredRuntimeSeedStableCodeCount ?? preflight.required_runtime_seed_stable_code_count),
    },
    runtimeReferenceDays: {
      readyBusinessTypeCount: readNumber(runtimeReferenceDays.readyBusinessTypeCount ?? runtimeReferenceDays.ready_business_type_count),
      missingBusinessTypeCount: missingRuntimeReferenceBusinessTypeCount,
      missingBusinessTypes: normalizeStringArray(runtimeReferenceDays.missingBusinessTypes ?? runtimeReferenceDays.missing_business_types),
      requiredRuntimeReferenceStableCodes: normalizeStringArray(runtimeReferenceDays.requiredRuntimeReferenceStableCodes ?? runtimeReferenceDays.required_runtime_reference_stable_codes),
      requiredRuntimeReferenceStableCodeCount: readNumber(runtimeReferenceDays.requiredRuntimeReferenceStableCodeCount ?? runtimeReferenceDays.required_runtime_reference_stable_code_count),
      evidenceLevelRequired: normalizeStatus(runtimeReferenceDays.evidenceLevelRequired ?? runtimeReferenceDays.evidence_level_required) || null,
    },
    coverage: {
      requiredStableCodeCount: readNumber(coverage.requiredStableCodeCount ?? coverage.required_stable_code_count),
      coveredStableCodeCount: readNumber(coverage.coveredStableCodeCount ?? coverage.covered_stable_code_count),
      missingStableCodeCount,
      missingStableCodes: normalizeStringArray(coverage.missingStableCodes ?? coverage.missing_stable_codes),
    },
    importGate: {
      status: importGateStatus,
      importRequired: importRequired !== false,
      runtimeSeedEvidenceAlreadyReady,
      importMode: normalizeStatus(importGate.importMode ?? importGate.import_mode) || null,
    },
    reports: readObject(root.reports),
    productionReady: false,
  }

  if (missing.length > 0) {
    return {
      status: 'blocked',
      blockers: missing,
      evidence,
    }
  }

  return {
    status: 'pass',
    evidence,
  }
}

function evaluateDurationSampleCoverageEvidence(rawEvidence, sourcePath, rawPackage) {
  if (!rawEvidence) {
    return {
      status: 'not_provided',
      blockers: [],
      evidence: {
        status: 'not_provided',
        sourceEvidencePath: null,
        productionReady: false,
      },
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'blocked',
      blockers: [rawEvidence.__readError],
    }
  }

  const root = readObject(rawEvidence)
  const packageRoot = readObject(rawPackage)
  const summary = readObject(root.summary)
  const rows = Array.isArray(root.rows) ? root.rows : []
  const status = String(root.status ?? '').trim()
  const evidenceLevel = String(root.evidenceLevel ?? root.evidence_level ?? '').trim()
  const blockers = normalizeStringArray(root.blockers)
  const baselineId = readBaselineId(root)
  const projectId = readProjectId(root)
  const packageBaselineId = readBaselineId(packageRoot)
  const packageProjectId = readProjectId(packageRoot)
  const requiredStableCodeCount = readNumber(summary.requiredStableCodeCount ?? summary.required_stable_code_count)
  const totalRequiredAcceptedSampleCount = readNumber(summary.totalRequiredAcceptedSampleCount ?? summary.total_required_accepted_sample_count)
  const coveredStableCodeCount = readNumber(summary.coveredStableCodeCount ?? summary.covered_stable_code_count)
  const missingStableCodeCount = readNumber(summary.missingStableCodeCount ?? summary.missing_stable_code_count)
  const acceptedMatchedSampleCount = readNumber(summary.acceptedMatchedSampleCount ?? summary.accepted_matched_sample_count)
  const packageRequiredStableCodeCount = readNumber(packageRoot.requiredStableCodeCount ?? packageRoot.required_stable_code_count)
  const packageTotalRequiredAcceptedSampleCount = readNumber(packageRoot.totalRequiredAcceptedSampleCount ?? packageRoot.total_required_accepted_sample_count)
  const collectionPackageRef = String(root.collectionPackageRef ?? root.collection_package_ref ?? '').trim()
  const sourceEvidenceRef = String(root.sourceEvidenceRef ?? root.source_evidence_ref ?? '').trim()
  const uncoveredRows = rows.filter((row) => String(readObject(row).coverageStatus ?? readObject(row).coverage_status ?? '').trim() !== 'covered')
  const rowsWithoutSourceSamples = rows.filter((row) => {
    const record = readObject(row)
    const sourceSampleIds = Array.isArray(record.acceptedSampleIds)
      ? record.acceptedSampleIds
      : Array.isArray(record.accepted_sample_ids)
        ? record.accepted_sample_ids
        : []
    return sourceSampleIds.map((value) => String(value ?? '').trim()).filter(Boolean).length === 0
  })
  const missing = [
    status === 'covered' ? null : 'duration_sample_coverage_status_must_be_covered',
    evidenceLevel === 'sample_collection_coverage_verified_l2' ? null : 'duration_sample_coverage_verified_l2_required',
    baselineId ? null : 'duration_sample_coverage_baseline_id_required',
    projectId ? null : 'duration_sample_coverage_project_id_required',
    packageBaselineId && baselineId && packageBaselineId !== baselineId ? 'duration_sample_coverage_baseline_id_mismatch' : null,
    packageProjectId && projectId && packageProjectId !== projectId ? 'duration_sample_coverage_project_id_mismatch' : null,
    collectionPackageRef.startsWith('duration_sample_collection_package:') && collectionPackageRef.includes('#sha256=')
      ? null
      : 'duration_sample_collection_package_hash_ref_required',
    sourceEvidenceRef.startsWith('duration_experience_samples_export:') && sourceEvidenceRef.includes('#sha256=')
      ? null
      : 'duration_sample_coverage_duration_samples_export_hash_required',
    missingStableCodeCount === 0 ? null : 'accepted_real_duration_sample_coverage_incomplete',
    requiredStableCodeCount >= packageRequiredStableCodeCount ? null : 'duration_sample_coverage_required_stable_code_count_incomplete',
    totalRequiredAcceptedSampleCount >= packageTotalRequiredAcceptedSampleCount ? null : 'duration_sample_coverage_required_sample_count_incomplete',
    coveredStableCodeCount >= requiredStableCodeCount ? null : 'duration_sample_coverage_covered_count_incomplete',
    acceptedMatchedSampleCount >= totalRequiredAcceptedSampleCount ? null : 'duration_sample_coverage_accepted_sample_count_incomplete',
    uncoveredRows.length === 0 ? null : 'duration_sample_coverage_rows_must_be_covered',
    rowsWithoutSourceSamples.length === 0 ? null : 'duration_sample_coverage_rows_must_include_accepted_sample_ids',
    ...blockers,
    ...mutationBoundaryBlockers('duration_sample_coverage_evidence', rawEvidence, [
      'readsDurationSampleCollectionPackage',
      'readsDurationExperienceSamplesExport',
    ]),
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      status: 'blocked',
      blockers: uniqueNonEmpty(missing),
      evidence: {
        status,
        sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
        baselineId,
        projectId,
        requiredStableCodeCount,
        totalRequiredAcceptedSampleCount,
        coveredStableCodeCount,
        missingStableCodeCount,
        acceptedMatchedSampleCount,
        productionReady: false,
      },
    }
  }

  return {
    status: 'pass',
    evidence: {
      status,
      sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
      baselineId,
      projectId,
      coverageEvidenceStatus: status,
      evidenceLevel,
      requiredStableCodeCount,
      totalRequiredAcceptedSampleCount,
      coveredStableCodeCount,
      missingStableCodeCount,
      acceptedMatchedSampleCount,
      collectionPackageRef,
      sourceEvidenceRef,
      productionReady: false,
    },
  }
}

function evaluateDurationSampleCollectionPackage(rawPackage, sourcePath, durationSampleCoverageEvidence) {
  if (!rawPackage) {
    return {
      status: 'pass',
      evidence: {
        status: 'not_provided',
        sourceEvidencePath: null,
        requiredStableCodeCount: 0,
        totalRequiredAcceptedSampleCount: 0,
        productionReady: false,
      },
    }
  }
  if (rawPackage.__readError) {
    return {
      status: 'blocked',
      blockers: [rawPackage.__readError],
    }
  }

  const root = readObject(rawPackage)
  const status = String(root.status ?? '').trim()
  const blockers = normalizeStringArray(root.blockers)
  const requiredStableCodeCount = readNumber(root.requiredStableCodeCount ?? root.required_stable_code_count)
  const totalRequiredAcceptedSampleCount = readNumber(root.totalRequiredAcceptedSampleCount ?? root.total_required_accepted_sample_count)
  const profileRuntimeReferenceSampleRequestCount = readNumber(root.profileRuntimeReferenceSampleRequestCount ?? root.profile_runtime_reference_sample_request_count)
  const mutationBlockers = mutationBoundaryBlockers('duration_sample_collection_package', rawPackage, [])
  const coverageEvidencePass = durationSampleCoverageEvidence?.status === 'pass'
  const nonSampleBlockers = blockers.filter((blocker) => !isDurationSampleCoverageClosableBlocker(blocker))
  const sampleCoverageClosableBlockers = coverageEvidencePass
    ? []
    : blockers.filter(isDurationSampleCoverageClosableBlocker)
  if (coverageEvidencePass && requiredStableCodeCount > 0 && nonSampleBlockers.length === 0 && mutationBlockers.length === 0) {
    return {
      status: 'pass',
      evidence: {
        status,
        sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
        requiredStableCodeCount,
        totalRequiredAcceptedSampleCount,
        profileRuntimeReferenceSampleRequestCount,
        coverageEvidenceStatus: durationSampleCoverageEvidence.evidence.coverageEvidenceStatus,
        coverageEvidencePath: durationSampleCoverageEvidence.evidence.sourceEvidencePath,
        coveredStableCodeCount: durationSampleCoverageEvidence.evidence.coveredStableCodeCount,
        acceptedMatchedSampleCount: durationSampleCoverageEvidence.evidence.acceptedMatchedSampleCount,
        productionReady: false,
      },
    }
  }
  const missing = [
    status ? null : 'duration_sample_collection_package_status_required',
    status === 'covered' ? null : null,
    ...nonSampleBlockers,
    ...sampleCoverageClosableBlockers,
    durationSampleCoverageEvidence?.status === 'blocked'
      ? `duration_sample_coverage_evidence_blocked:${durationSampleCoverageEvidence.blockers.join(',')}`
      : null,
    ...mutationBlockers,
  ].filter(Boolean)

  if (status !== 'covered' || requiredStableCodeCount > 0 || totalRequiredAcceptedSampleCount > 0 || missing.length > 0) {
    return {
      status: 'blocked',
      blockers: uniqueNonEmpty([
        ...missing,
        !coverageEvidencePass && (status === 'samples_required' || requiredStableCodeCount > 0 || totalRequiredAcceptedSampleCount > 0)
          ? 'accepted_real_duration_samples_required'
          : null,
        status && !['covered', 'samples_required', 'blocked'].includes(status)
          ? 'duration_sample_collection_package_status_unsupported'
          : null,
        status === 'blocked' && blockers.length === 0
          ? 'duration_sample_collection_package_blocked_without_reason'
          : null,
      ].filter(Boolean)),
      evidence: {
        status,
        sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
        requiredStableCodeCount,
        totalRequiredAcceptedSampleCount,
        profileRuntimeReferenceSampleRequestCount,
        productionReady: false,
      },
    }
  }

  return {
    status: 'pass',
    evidence: {
      status,
      sourceEvidencePath: sourcePath ? repoRelative(sourcePath) : null,
      requiredStableCodeCount,
      totalRequiredAcceptedSampleCount,
      profileRuntimeReferenceSampleRequestCount,
      productionReady: false,
    },
  }
}

function isDurationSampleCoverageClosableBlocker(blocker) {
  return [
    'accepted_real_duration_samples_required',
    'accepted_real_duration_sample_coverage_incomplete',
    'runtime_reference_days_missing_for_some_rows',
    'duration_asset_utilization_report_runtime_reference_days_missing_for_some_rows',
  ].includes(String(blocker ?? '').trim())
}

function readDependencyWriterRecord(rawEvidence) {
  const record = readObject(rawEvidence)
  const candidates = [
    record.domain_writer_result,
    record.domainWriterResult,
    record.writer_result,
    record.writerResult,
    record,
  ]
  return readObject(candidates.find((candidate) => Object.keys(readObject(candidate)).length > 0))
}

function evaluateDependencyWriterEvidence(rawEvidence, sourcePath) {
  if (!rawEvidence) {
    return {
      status: 'blocked',
      blockers: ['Missing real dependency writer evidence with mapped runtime tasks, inserted task_dependencies, release lineage, and critical-path readback.'],
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'blocked',
      blockers: [rawEvidence.__readError],
    }
  }

  const root = readObject(rawEvidence)
  const candidatePlan = readObject(root.candidate_default_master_plan ?? root.candidateDefaultMasterPlan)
  const taskMapping = readObject(root.task_mapping ?? root.taskMapping)
  const writerResult = readDependencyWriterRecord(rawEvidence)
  const criticalPath = readObject(root.critical_path_recalculation ?? root.criticalPathRecalculation)
  const appliedDependencies = Array.isArray(writerResult.appliedDependencies)
    ? writerResult.appliedDependencies
    : Array.isArray(writerResult.applied_dependencies)
      ? writerResult.applied_dependencies
      : []
  const unresolvedGeneratedRowIds = normalizeStringArray(taskMapping.unresolved_generated_row_ids ?? taskMapping.unresolvedGeneratedRowIds)
  const unresolvedExternalDependencyCount = Math.max(
    normalizeStringArray(writerResult.unresolvedExternalDependencies ?? writerResult.unresolved_external_dependencies).length,
    readNumber(writerResult.unresolvedExternalDependencyCount ?? writerResult.unresolved_external_dependency_count),
  )
  const generationMode = String(candidatePlan.generation_mode ?? candidatePlan.generationMode ?? '').trim()
  const sourceVersionLabel = String(candidatePlan.source_version_label ?? candidatePlan.sourceVersionLabel ?? '').trim()
  const insertedDependencyCount = readNumber(writerResult.insertedDependencyCount ?? writerResult.inserted_dependency_count)
  const mappedGeneratedRowCount = readNumber(taskMapping.mapped_generated_row_count ?? taskMapping.mappedGeneratedRowCount)
  const mappedTaskCount = readNumber(taskMapping.mapped_task_count ?? taskMapping.mappedTaskCount)
  const criticalPathStatus = String(criticalPath.status ?? '').trim()
  const criticalPathEvidenceRef = String(criticalPath.evidence_ref ?? criticalPath.evidenceRef ?? '').trim()
  const executionMode = String(root.execution_mode ?? root.executionMode ?? '').trim()
  const sourceEvidenceRef = String(root.sourceEvidenceRef ?? root.source_evidence_ref ?? '').trim()
  const invalidAppliedDependencies = appliedDependencies.filter((dependency) => {
    const record = readObject(dependency)
    return String(record.sourceType ?? record.source_type ?? '').trim() !== 'construction_organization_plan_network'
      || !String(record.taskId ?? record.task_id ?? '').trim()
      || !String(record.dependencyTaskId ?? record.dependency_task_id ?? '').trim()
  })
  const missing = [
    String(root.baselineId ?? root.baseline_id ?? '').trim() ? null : 'baseline_id_required',
    String(root.projectId ?? root.project_id ?? '').trim() ? null : 'project_id_required',
    ...defaultMasterPlanSourceBlockers(generationMode, sourceVersionLabel),
    ['runtime_task_mapping_verified', 'mapped'].includes(String(taskMapping.status ?? '').trim()) ? null : 'runtime_task_mapping_verified_required',
    mappedGeneratedRowCount > 0 ? null : 'mapped_generated_row_count_required',
    mappedTaskCount > 0 ? null : 'mapped_task_count_required',
    unresolvedGeneratedRowIds.length === 0 ? null : `unresolved_generated_row_ids:${unresolvedGeneratedRowIds.join(',')}`,
    unresolvedExternalDependencyCount === 0 ? null : 'unresolved_external_dependency_anchors_present',
    executionMode === 'execute' ? null : 'dependency_writer_execute_mode_required',
    writerResult.source === 'construction_organization_plan_network_domain_writer' ? null : 'construction_organization_plan_network_domain_writer_required',
    writerResult.status === 'runtime_apply_ready' ? null : 'domain_writer_runtime_apply_ready_required',
    readBoolean(writerResult.writesTaskDependencies ?? writerResult.writes_task_dependencies) ? null : 'domain_writer_must_write_task_dependencies',
    readBoolean(writerResult.writesPlanDates ?? writerResult.writes_plan_dates) ? 'domain_writer_must_not_write_plan_dates_for_dependency_gate' : null,
    readBoolean(writerResult.writesSeed ?? writerResult.writes_seed) ? 'domain_writer_must_not_write_seed' : null,
    readBoolean(writerResult.writesBaseline ?? writerResult.writes_baseline) ? 'domain_writer_must_not_write_baseline' : null,
    insertedDependencyCount > 0 ? null : 'inserted_dependency_count_required',
    readBoolean(writerResult.releaseRecordPersisted ?? writerResult.release_record_persisted) ? null : 'release_record_persisted_required',
    String(writerResult.releaseHandoffCandidateEventId ?? writerResult.release_handoff_candidate_event_id ?? '').trim() ? null : 'release_handoff_candidate_event_id_required',
    String(writerResult.releaseRecordTarget ?? writerResult.release_record_target ?? '').trim() ? null : 'release_record_target_required',
    String(writerResult.rollbackTarget ?? writerResult.rollback_target ?? '').trim() ? null : 'rollback_target_required',
    appliedDependencies.length >= insertedDependencyCount ? null : 'applied_dependencies_must_cover_inserted_count',
    invalidAppliedDependencies.length === 0 ? null : 'applied_dependencies_must_reference_task_ids_and_construction_org_source',
    sourceEvidenceRef ? null : 'source_evidence_ref_required',
    sourceEvidenceRef.startsWith('task_dependencies_export:') && sourceEvidenceRef.includes('#sha256=')
      ? null
      : 'task_dependencies_export_hash_required',
    ['completed', 'readback_passed'].includes(criticalPathStatus) ? null : 'critical_path_recalculation_or_readback_required',
    criticalPathEvidenceRef ? null : 'critical_path_evidence_ref_required',
    ...mutationBoundaryBlockers('production_dependency_writer_evidence', rawEvidence, [
      'readsWriterResult',
      'readsTaskDependenciesExport',
      'readsCriticalPathReadback',
    ]),
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      status: 'blocked',
      blockers: missing,
    }
  }

  return {
    status: 'pass',
    evidence: {
      sourceEvidencePath: repoRelative(sourcePath),
      baselineId: root.baselineId ?? root.baseline_id,
      projectId: root.projectId ?? root.project_id,
      executionMode,
      sourceEvidenceRef,
      generationMode: generationMode || sourceVersionLabel || null,
      taskMapping: {
        status: taskMapping.status,
        mappedGeneratedRowCount,
        mappedTaskCount,
      },
      domainWriter: {
        source: writerResult.source,
        status: writerResult.status,
        draftNetworkKey: writerResult.draftNetworkKey ?? writerResult.draft_network_key ?? null,
        releaseHandoffCandidateEventId: writerResult.releaseHandoffCandidateEventId ?? writerResult.release_handoff_candidate_event_id ?? null,
        releaseRecordTarget: writerResult.releaseRecordTarget ?? writerResult.release_record_target ?? null,
        rollbackTarget: writerResult.rollbackTarget ?? writerResult.rollback_target ?? null,
        insertedDependencyCount,
        skippedDependencyCount: readNumber(writerResult.skippedDependencyCount ?? writerResult.skipped_dependency_count),
        unresolvedExternalDependencyCount,
        releaseRecordPersisted: true,
      },
      criticalPathRecalculation: {
        status: criticalPathStatus,
        evidenceRef: criticalPathEvidenceRef,
      },
      productionReady: false,
    },
  }
}

function evaluateRuntimePublicationEvidence(rawEvidence, sourcePath) {
  if (!rawEvidence) {
    return {
      status: 'blocked',
      blockers: ['Missing real runtime publication record for the accepted master-plan asset.'],
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'blocked',
      blockers: [rawEvidence.__readError],
    }
  }

  const root = readObject(rawEvidence)
  const publication = readObject(root.publication ?? root.runtime_publication ?? root.runtimePublication ?? root)
  const lineage = readObject(root.releaseLineage ?? root.release_lineage)
  const upstreamBlockers = normalizeStringArray(root.blockers)
  const upstreamStatus = String(root.status ?? '').trim()
  const publicationStatus = String(publication.status ?? publication.runtimePublicationStatus ?? publication.runtime_publication_status ?? '').trim()
  const publicationKey = String(publication.publicationKey ?? publication.publication_key ?? '').trim()
  const assetKind = String(publication.assetKind ?? publication.asset_kind ?? '').trim()
  const generationMode = String(publication.generationMode ?? publication.generation_mode ?? '').trim()
  const acceptedBaselineId = String(publication.acceptedBaselineId ?? publication.accepted_baseline_id ?? '').trim()
  const dependencyWriterReleaseRecordTarget = String(publication.dependencyWriterReleaseRecordTarget ?? publication.dependency_writer_release_record_target ?? '').trim()
  const runtimeAssetKey = String(publication.runtimeAssetKey ?? publication.runtime_asset_key ?? '').trim()
  const rollbackTarget = String(publication.rollbackTarget ?? publication.rollback_target ?? '').trim()
  const baselineId = String(root.baselineId ?? root.baseline_id ?? '').trim()
  const projectId = String(root.projectId ?? root.project_id ?? '').trim()
  const sourceEvidenceRef = String(root.sourceEvidenceRef ?? root.source_evidence_ref ?? '').trim()
  const missing = [
    upstreamStatus && upstreamStatus !== 'runtime_published' ? `runtime_publication_evidence_status_${upstreamStatus}` : null,
    ...upstreamBlockers,
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    sourceEvidenceRef.startsWith('wbs_template_runtime_publications_export:') && sourceEvidenceRef.includes('#sha256=')
      ? null
      : 'runtime_publication_export_hash_required',
    publication.source === 'default_master_plan_runtime_publication' ? null : 'default_master_plan_runtime_publication_source_required',
    publicationStatus === 'runtime_published' ? null : 'runtime_publication_status_required',
    publicationKey ? null : 'publication_key_required',
    assetKind === 'default_master_plan' ? null : 'runtime_publication_asset_kind_default_master_plan_required',
    ...defaultMasterPlanGenerationModeBlockers(generationMode),
    acceptedBaselineId ? null : 'accepted_baseline_id_required',
    acceptedBaselineId && baselineId && acceptedBaselineId === baselineId ? null : 'accepted_baseline_id_must_match_root_baseline_id',
    dependencyWriterReleaseRecordTarget ? null : 'dependency_writer_release_record_target_required',
    runtimeAssetKey ? null : 'runtime_asset_key_required',
    rollbackTarget ? null : 'rollback_target_required',
    String(publication.publishedBy ?? publication.published_by ?? '').trim() ? null : 'published_by_required',
    String(publication.publishedAt ?? publication.published_at ?? '').trim() ? null : 'published_at_required',
    String(lineage.durationCalibrationEvidenceRef ?? lineage.duration_calibration_evidence_ref ?? '').trim() ? null : 'duration_calibration_lineage_required',
    String(lineage.dependencyWriterEvidenceRef ?? lineage.dependency_writer_evidence_ref ?? '').trim() ? null : 'dependency_writer_lineage_required',
    ...mutationBoundaryBlockers('runtime_publication_evidence', rawEvidence, ['readsRuntimePublicationExport']),
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      status: 'blocked',
      blockers: missing,
    }
  }

  return {
    status: 'pass',
    evidence: {
      sourceEvidencePath: repoRelative(sourcePath),
      baselineId: root.baselineId ?? root.baseline_id,
      projectId: root.projectId ?? root.project_id,
      sourceEvidenceRef,
      runtimePublicationEvidenceRef: sourceEvidenceRef,
      publicationKey,
      assetKind,
      generationMode,
      acceptedBaselineId,
      dependencyWriterReleaseRecordTarget,
      runtimeAssetKey,
      rollbackTarget,
      publishedBy: publication.publishedBy ?? publication.published_by,
      publishedAt: publication.publishedAt ?? publication.published_at,
      productionReady: false,
    },
  }
}

function evaluatePostPublishSmokeRollbackEvidence(rawEvidence, sourcePath) {
  if (!rawEvidence) {
    return {
      status: 'blocked',
      blockers: ['Missing post-publish read smoke, UI consumption smoke, critical-path readback, and rollback evidence.'],
    }
  }
  if (rawEvidence.__readError) {
    return {
      status: 'blocked',
      blockers: [rawEvidence.__readError],
    }
  }

  const root = readObject(rawEvidence)
  const apiReadSmoke = readObject(root.apiReadSmoke ?? root.api_read_smoke)
  const uiConsumptionSmoke = readObject(root.uiConsumptionSmoke ?? root.ui_consumption_smoke)
  const criticalPathReadback = readObject(root.criticalPathReadback ?? root.critical_path_readback)
  const rollbackVerification = readObject(root.rollbackVerification ?? root.rollback_verification)
  const realProductionOutcomeEvidence = readObject(root.realProductionOutcomeEvidence ?? root.real_production_outcome_evidence)
  const baselineId = String(root.baselineId ?? root.baseline_id ?? '').trim()
  const projectId = String(root.projectId ?? root.project_id ?? '').trim()
  const publicationKey = String(root.publicationKey ?? root.publication_key ?? '').trim()
  const expectedIdentity = { baselineId, projectId, publicationKey }
  const missing = [
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    publicationKey ? null : 'publication_key_required',
    ['staging', 'production', 'live'].includes(String(root.environment ?? '').trim()) ? null : 'real_environment_required',
    String(root.testedAt ?? root.tested_at ?? '').trim() ? null : 'tested_at_required',
    hasPassingStatus(apiReadSmoke.status) ? null : 'api_read_smoke_pass_required',
    readEvidenceRef(apiReadSmoke) ? null : 'api_read_smoke_evidence_ref_required',
    ...smokeIdentityBlockers('api_read_smoke', apiReadSmoke, expectedIdentity),
    hasPassingStatus(uiConsumptionSmoke.status) ? null : 'ui_consumption_smoke_pass_required',
    readEvidenceRef(uiConsumptionSmoke) ? null : 'ui_consumption_smoke_evidence_ref_required',
    ...smokeIdentityBlockers('ui_consumption_smoke', uiConsumptionSmoke, expectedIdentity),
    hasPassingStatus(criticalPathReadback.status) ? null : 'critical_path_readback_pass_required',
    readEvidenceRef(criticalPathReadback) ? null : 'critical_path_readback_evidence_ref_required',
    ...smokeIdentityBlockers('critical_path_readback', criticalPathReadback, expectedIdentity),
    hasPassingStatus(rollbackVerification.status) ? null : 'rollback_verification_pass_required',
    String(rollbackVerification.rollbackTarget ?? rollbackVerification.rollback_target ?? '').trim() ? null : 'rollback_target_required',
    readEvidenceRef(rollbackVerification) ? null : 'rollback_verification_evidence_ref_required',
    ...smokeIdentityBlockers('rollback_verification', rollbackVerification, expectedIdentity),
    ...realProductionOutcomeEmbeddedBlockers(realProductionOutcomeEvidence, root),
    ...mutationBoundaryBlockers('post_publish_smoke_and_rollback_evidence', rawEvidence, ['readsSmokeEvidenceFiles']),
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      status: 'blocked',
      blockers: missing,
    }
  }

  return {
    status: 'pass',
    evidence: {
      sourceEvidencePath: repoRelative(sourcePath),
      baselineId: root.baselineId ?? root.baseline_id,
      projectId: root.projectId ?? root.project_id,
      publicationKey: root.publicationKey ?? root.publication_key,
      environment: root.environment,
      testedAt: root.testedAt ?? root.tested_at,
      apiReadSmokeEvidenceRef: readEvidenceRef(apiReadSmoke),
      uiConsumptionSmokeEvidenceRef: readEvidenceRef(uiConsumptionSmoke),
      criticalPathReadbackEvidenceRef: readEvidenceRef(criticalPathReadback),
      rollbackTarget: rollbackVerification.rollbackTarget ?? rollbackVerification.rollback_target,
      rollbackEvidenceRef: readEvidenceRef(rollbackVerification),
      ...(Object.keys(realProductionOutcomeEvidence).length > 0 ? { realProductionOutcomeEvidence } : {}),
      productionReady: false,
    },
  }
}

function realProductionOutcomeEmbeddedBlockers(realProductionOutcomeEvidence, root) {
  if (Object.keys(realProductionOutcomeEvidence).length === 0) return []
  return validateRealProductionOutcomeEvidence(realProductionOutcomeEvidence, {
    targetEnvironment: String(root.environment ?? '').trim(),
    baselineId: String(root.baselineId ?? root.baseline_id ?? '').trim(),
    projectId: String(root.projectId ?? root.project_id ?? '').trim(),
    publicationKey: String(root.publicationKey ?? root.publication_key ?? '').trim(),
  })
}

function evaluateRuntimeEvidenceLineageConsistency({
  durationCalibrationEvidence,
  dependencyWriterEvidence,
  runtimePublicationEvidence,
  postPublishSmokeRollbackEvidence,
}) {
  const requiredEvidence = [
    ['runtime_duration_calibration_evidence', durationCalibrationEvidence],
    ['production_dependency_writer_evidence', dependencyWriterEvidence],
    ['runtime_publication_evidence', runtimePublicationEvidence],
    ['post_publish_smoke_and_rollback_evidence', postPublishSmokeRollbackEvidence],
  ]
  const blockedEvidenceIds = requiredEvidence
    .filter(([, result]) => result.status !== 'pass')
    .map(([id]) => id)

  if (blockedEvidenceIds.length > 0) {
    return {
      status: 'blocked',
      blockers: [`runtime_lineage_requires_passed_evidence_gates:${blockedEvidenceIds.join(',')}`],
    }
  }

  const duration = readObject(durationCalibrationEvidence.evidence)
  const dependency = readObject(dependencyWriterEvidence.evidence)
  const publication = readObject(runtimePublicationEvidence.evidence)
  const smoke = readObject(postPublishSmokeRollbackEvidence.evidence)
  const dependencyDomainWriter = readObject(dependency.domainWriter)

  const blockers = [
    identityMismatchBlocker('baseline_id_mismatch', [
      duration.baselineId,
      dependency.baselineId,
      publication.baselineId,
      publication.acceptedBaselineId,
      smoke.baselineId,
    ]),
    identityMismatchBlocker('project_id_mismatch', [
      duration.projectId,
      dependency.projectId,
      publication.projectId,
      smoke.projectId,
    ]),
    identityMismatchBlocker('publication_key_mismatch', [
      publication.publicationKey,
      smoke.publicationKey,
    ]),
    identityMismatchBlocker('dependency_writer_release_target_mismatch', [
      dependencyDomainWriter.releaseRecordTarget,
      publication.dependencyWriterReleaseRecordTarget,
    ]),
    identityMismatchBlocker('rollback_target_mismatch', [
      dependencyDomainWriter.rollbackTarget,
      publication.rollbackTarget,
      smoke.rollbackTarget,
    ]),
  ].filter(Boolean)

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      blockers,
    }
  }

  return {
    status: 'pass',
    evidence: {
      baselineId: publication.baselineId,
      projectId: publication.projectId,
      publicationKey: publication.publicationKey,
      environment: smoke.environment,
      dependencyWriterReleaseRecordTarget: publication.dependencyWriterReleaseRecordTarget,
      rollbackTarget: publication.rollbackTarget,
      productionReady: false,
    },
  }
}

function collectSourceExportEvidenceRefs(evidenceResults) {
  const refs = []
  for (const [evidenceId, result] of Object.entries(evidenceResults)) {
    if (!result || result.status !== 'pass') continue
    const evidence = readObject(result.evidence)
    for (const [field, value] of Object.entries(evidence)) {
      if (!field.endsWith('EvidenceRef')) continue
      const parsed = parseSourceExportEvidenceRef(value)
      if (parsed) refs.push({ evidenceId, field, ...parsed })
    }
  }
  return refs
}

function sourceExportManifestRecordBlockers(sourceManifest, evidenceResults) {
  const refs = collectSourceExportEvidenceRefs(evidenceResults)
  if (refs.length === 0) {
    return ['source_export_manifest_evidence_refs_required']
  }

  const exports = readObject(sourceManifest.sourceExports)
  const blockers = []
  const smokeRollbackEvidence = readObject(readObject(evidenceResults.postPublishSmokeRollbackEvidence).evidence)
  if (
    Object.keys(readObject(smokeRollbackEvidence.realProductionOutcomeEvidence ?? smokeRollbackEvidence.real_production_outcome_evidence)).length > 0
    && Object.keys(readObject(exports.realProductionOutcome)).length === 0
  ) {
    blockers.push('source_export_manifest_real_production_outcome_record_required')
  }
  for (const ref of refs) {
    const record = readObject(exports[ref.manifestKey])
    const manifestPath = String(record.path ?? '').trim()
    const manifestHash = String(record.sha256 ?? '').trim().toLowerCase()
    if (!manifestPath) {
      blockers.push(`source_export_manifest_missing_record_for_evidence_ref:${ref.manifestKey}`)
      continue
    }
    if (path.resolve(REPO_ROOT, manifestPath) !== path.resolve(REPO_ROOT, ref.path)) {
      blockers.push(`source_export_manifest_path_mismatch_for_evidence_ref:${ref.manifestKey}`)
    }
    if (!/^[a-f0-9]{64}$/i.test(manifestHash)) {
      blockers.push(`source_export_manifest_sha256_required_for_evidence_ref:${ref.manifestKey}`)
    } else if (manifestHash !== ref.sha256) {
      blockers.push(`source_export_manifest_sha256_mismatch_for_evidence_ref:${ref.manifestKey}`)
    }
    if (Array.isArray(record.blockers) && record.blockers.length > 0) {
      blockers.push(`source_export_manifest_record_blocked_for_evidence_ref:${ref.manifestKey}`)
    }
    blockers.push(...sourceExportManifestRecordContractBlockers(ref.manifestKey, record))
  }
  for (const [manifestKey, contract] of Object.entries(OPTIONAL_SOURCE_EXPORT_RECORD_CONTRACTS)) {
    const record = readObject(exports[manifestKey])
    if (Object.keys(record).length === 0) continue
    const manifestPath = String(record.path ?? '').trim()
    const manifestHash = String(record.sha256 ?? '').trim().toLowerCase()
    const rowCount = Number(record.rowCount ?? record.row_count ?? 0)
    if (!manifestPath) blockers.push(`source_export_manifest_path_required:${manifestKey}`)
    if (!/^[a-f0-9]{64}$/i.test(manifestHash)) blockers.push(`source_export_manifest_sha256_required:${manifestKey}`)
    if (!Number.isFinite(rowCount) || rowCount <= 0) blockers.push(`source_export_manifest_row_count_required:${manifestKey}`)
    if (Array.isArray(record.blockers) && record.blockers.length > 0) {
      blockers.push(`source_export_manifest_record_blocked:${manifestKey}`)
    }
    blockers.push(...sourceExportManifestRecordContractBlockers(manifestKey, record, contract))
    if (manifestKey === 'realProductionOutcome') {
      blockers.push(...sourceExportManifestRealProductionOutcomeBlockers(record, sourceManifest, evidenceResults))
    }
  }
  return blockers
}

function sourceExportManifestRealProductionOutcomeBlockers(record, sourceManifest, evidenceResults = {}) {
  const evidence = readObject(record.realProductionOutcomeEvidence ?? record.real_production_outcome_evidence)
  if (Object.keys(evidence).length === 0) {
    return ['source_export_manifest_real_production_outcome_evidence_required']
  }
  return [
    ...realProductionOutcomeRecordRefBlockers(record, evidence),
    ...realProductionOutcomeMaterialRefBlockers(evidence, evidenceResults),
    ...validateRealProductionOutcomeEvidence(evidence, {
    targetEnvironment: String(sourceManifest.environment ?? '').trim(),
    baselineId: String(sourceManifest.baselineId ?? sourceManifest.baseline_id ?? '').trim(),
    projectId: String(sourceManifest.projectId ?? sourceManifest.project_id ?? '').trim(),
    publicationKey: String(sourceManifest.publicationKey ?? sourceManifest.publication_key ?? '').trim(),
    requireSourceExportEvidenceRef: true,
    }),
  ]
}

function realProductionOutcomeMaterialRefBlockers(evidence, evidenceResults = {}) {
  const runtimePublication = readObject(readObject(evidenceResults.runtimePublicationEvidence).evidence)
  const smokeRollback = readObject(readObject(evidenceResults.postPublishSmokeRollbackEvidence).evidence)
  const expectedRefs = [
    [
      'runtime_publication',
      String(evidence.runtimePublicationEvidenceRef ?? evidence.runtime_publication_evidence_ref ?? '').trim(),
      String(runtimePublication.sourceEvidenceRef ?? runtimePublication.source_evidence_ref ?? '').trim(),
    ],
    [
      'api_read_smoke',
      String(evidence.apiReadSmokeEvidenceRef ?? evidence.api_read_smoke_evidence_ref ?? '').trim(),
      String(smokeRollback.apiReadSmokeEvidenceRef ?? smokeRollback.api_read_smoke_evidence_ref ?? '').trim(),
    ],
    [
      'ui_consumption_smoke',
      String(evidence.uiConsumptionSmokeEvidenceRef ?? evidence.ui_consumption_smoke_evidence_ref ?? '').trim(),
      String(smokeRollback.uiConsumptionSmokeEvidenceRef ?? smokeRollback.ui_consumption_smoke_evidence_ref ?? '').trim(),
    ],
    [
      'critical_path_readback',
      String(evidence.criticalPathReadbackEvidenceRef ?? evidence.critical_path_readback_evidence_ref ?? '').trim(),
      String(smokeRollback.criticalPathReadbackEvidenceRef ?? smokeRollback.critical_path_readback_evidence_ref ?? '').trim(),
    ],
    [
      'rollback',
      String(evidence.rollbackEvidenceRef ?? evidence.rollback_evidence_ref ?? '').trim(),
      String(smokeRollback.rollbackEvidenceRef ?? smokeRollback.rollback_evidence_ref ?? '').trim(),
    ],
  ]
  return expectedRefs.flatMap(([kind, actual, expected]) => {
    if (!expected) return [`real_production_outcome_${kind}_evidence_ref_source_required`]
    return actual === expected ? [] : [`real_production_outcome_${kind}_evidence_ref_mismatch`]
  })
}

function parseAuditablePathShaRef(value) {
  const ref = String(value ?? '').trim()
  const sourceExportMatch = ref.match(/^([a-z0-9_-]+(?:_[a-z0-9_-]+)*_export):(.+)#sha256=([a-f0-9]{64})$/i)
  if (sourceExportMatch) {
    return {
      prefix: sourceExportMatch[1],
      path: sourceExportMatch[2].trim(),
      sha256: sourceExportMatch[3].toLowerCase(),
    }
  }
  const match = ref.match(/^(.+)#sha256=([a-f0-9]{64})$/i)
  if (!match) return null
  return {
    prefix: null,
    path: match[1].trim(),
    sha256: match[2].toLowerCase(),
  }
}

function realProductionOutcomeRecordRefBlockers(record, evidence) {
  const sourcePath = String(record.sourcePath ?? record.source_path ?? '').trim()
  const sourceHash = String(record.sourceSha256 ?? record.source_sha256 ?? '').trim().toLowerCase()
  const evidenceRef = String(evidence.evidenceRef ?? evidence.evidence_ref ?? evidence.sourceEvidenceRef ?? evidence.source_evidence_ref ?? evidence.ref ?? '').trim()
  const parsedRef = parseAuditablePathShaRef(evidenceRef)
  const blockers = [
    sourcePath ? null : 'source_export_manifest_real_production_outcome_source_path_required',
    /^[a-f0-9]{64}$/i.test(sourceHash)
      ? null
      : 'source_export_manifest_real_production_outcome_source_sha256_required',
  ].filter(Boolean)
  if (!parsedRef) return blockers
  return [
    ...blockers,
    sourcePath && path.resolve(REPO_ROOT, sourcePath) !== path.resolve(REPO_ROOT, parsedRef.path)
      ? 'source_export_manifest_real_production_outcome_evidence_ref_source_path_mismatch'
      : null,
    sourceHash && /^[a-f0-9]{64}$/i.test(sourceHash) && sourceHash !== parsedRef.sha256
      ? 'source_export_manifest_real_production_outcome_evidence_ref_source_sha256_mismatch'
      : null,
  ].filter(Boolean)
}

function sourceExportManifestRecordContractBlockers(manifestKey, record, explicitContract = null) {
  const contract = explicitContract ?? SOURCE_EXPORT_RECORD_CONTRACTS[manifestKey]
  if (!contract) return []
  const source = String(record.source ?? '').trim()
  const kind = String(record.kind ?? '').trim()
  const table = String(record.table ?? '').trim()
  const rowCount = Number(record.rowCount ?? record.row_count ?? 0)
  const blockedDurationSampleRecord = manifestKey === 'durationSamples'
    && (kind === 'blocked_real_duration_sample_material'
      || (Array.isArray(record.blockers) && record.blockers.includes('blocked_real_duration_sample_material')))
  return [
    source === contract.source ? null : `source_export_manifest_source_mismatch_for_evidence_ref:${manifestKey}`,
    sourceExportManifestRecordKindMatches(manifestKey, kind, contract) ? null : `source_export_manifest_kind_mismatch_for_evidence_ref:${manifestKey}`,
    contract.table && table !== contract.table ? `source_export_manifest_table_mismatch_for_evidence_ref:${manifestKey}` : null,
    (!Number.isFinite(rowCount) || rowCount <= 0) && !blockedDurationSampleRecord ? `source_export_manifest_row_count_required_for_evidence_ref:${manifestKey}` : null,
  ].filter(Boolean)
}

function sourceExportManifestRecordKindMatches(manifestKey, kind, contract) {
  if (manifestKey !== 'durationSamples') return kind === contract.kind
  return DURATION_SAMPLE_SOURCE_KINDS.has(kind)
}

function sourceExportManifestIdentityBlockers(sourceManifest, runtimeEvidenceLineageConsistency) {
  if (!runtimeEvidenceLineageConsistency || runtimeEvidenceLineageConsistency.status !== 'pass') {
    return []
  }
  const expected = readObject(runtimeEvidenceLineageConsistency.evidence)
  const manifestBaselineId = String(sourceManifest.baselineId ?? sourceManifest.baseline_id ?? '').trim()
  const manifestProjectId = String(sourceManifest.projectId ?? sourceManifest.project_id ?? '').trim()
  const manifestPublicationKey = String(sourceManifest.publicationKey ?? sourceManifest.publication_key ?? '').trim()
  const manifestEnvironment = String(sourceManifest.environment ?? '').trim()
  return [
    manifestBaselineId ? null : 'source_export_manifest_baseline_id_required',
    manifestProjectId ? null : 'source_export_manifest_project_id_required',
    manifestPublicationKey ? null : 'source_export_manifest_publication_key_required',
    manifestEnvironment ? null : 'source_export_manifest_environment_required',
    manifestBaselineId && manifestBaselineId !== expected.baselineId ? 'source_export_manifest_baseline_id_mismatch' : null,
    manifestProjectId && manifestProjectId !== expected.projectId ? 'source_export_manifest_project_id_mismatch' : null,
    manifestPublicationKey && manifestPublicationKey !== expected.publicationKey ? 'source_export_manifest_publication_key_mismatch' : null,
    manifestEnvironment && manifestEnvironment !== expected.environment ? 'source_export_manifest_environment_mismatch' : null,
  ].filter(Boolean)
}

function sourceExportManifestBoundaryBlockers(sourceManifest) {
  const boundary = readMutationBoundary(sourceManifest)
  if (Object.keys(boundary).length === 0) {
    return ['source_export_manifest_mutation_boundary_required']
  }

  const readFlags = ['readsDatabase', 'readsSourceFiles']
  const writeFlags = [
    'writesProductionTables',
    'writesTasks',
    'writesTaskDependencies',
    'invokesRuntimeWriters',
    'writesRuntimePublication',
    'performsRollback',
  ]
  return [
    ...readFlags.map((flag) => (
      readMutationBoundaryFlag(boundary, flag) ? null : `source_export_manifest_${flag}_required`
    )),
    ...writeFlags.map((flag) => (
      readMutationBoundaryFlag(boundary, flag) ? `source_export_manifest_${flag}_must_be_false` : null
    )),
  ].filter(Boolean)
}

function sourceExportManifestRootBlockers(sourceManifest) {
  const blockers = []
  if (Array.isArray(sourceManifest.blockers) && sourceManifest.blockers.length > 0) {
    blockers.push('source_export_manifest_blockers_not_empty')
  }
  return blockers
}

function sourceExportManifestHasExplicitBlockers(sourceManifest) {
  if (String(sourceManifest.status ?? '').trim() !== 'blocked') return false
  if (Array.isArray(sourceManifest.blockers) && sourceManifest.blockers.length > 0) return true
  const exports = readObject(sourceManifest.sourceExports)
  return Object.entries(exports).some(([manifestKey, record]) => {
    if (manifestKey === 'reviewExport') return false
    const sourceRecord = readObject(record)
    return Array.isArray(sourceRecord.blockers) && sourceRecord.blockers.length > 0
  })
}

function sourceExportManifestDirectRecordBlockers(sourceManifest) {
  const exports = readObject(sourceManifest.sourceExports)
  const blockers = []
  for (const [manifestKey, record] of Object.entries(exports)) {
    if (manifestKey === 'reviewExport') continue
    const sourceRecord = readObject(record)
    if (Array.isArray(sourceRecord.blockers) && sourceRecord.blockers.length > 0) {
      blockers.push(`source_export_manifest_record_blocked:${manifestKey}`)
    }
  }
  return blockers
}

function sourceExportManifestPipelineArgBlockers(sourceManifest, sourcePath) {
  const args = Array.isArray(sourceManifest.pipelineArgs) ? sourceManifest.pipelineArgs.map((arg) => String(arg)) : []
  if (args.length === 0) return ['source_export_manifest_pipeline_args_required']

  const expectedFlagPaths = new Map()
  expectedFlagPaths.set('--source-manifest', repoRelative(sourcePath))
  const exports = readObject(sourceManifest.sourceExports)
  const contracts = {
    ...SOURCE_EXPORT_RECORD_CONTRACTS,
    ...Object.fromEntries(Object.entries(OPTIONAL_SOURCE_EXPORT_RECORD_CONTRACTS).filter(([key]) => Object.keys(readObject(exports[key])).length > 0)),
  }
  for (const [key, contract] of Object.entries(contracts)) {
    const exportPath = String(readObject(exports[key]).path ?? '').trim()
    if (exportPath) expectedFlagPaths.set(contract.pipelineFlag, exportPath)
  }

  const blockers = []
  for (const [flag, expectedPath] of expectedFlagPaths) {
    const flagIndex = args.indexOf(flag)
    if (flagIndex === -1) {
      blockers.push(`source_export_manifest_pipeline_arg_missing:${flag}`)
      continue
    }
    const actualPath = String(args[flagIndex + 1] ?? '').trim()
    if (!actualPath || path.resolve(REPO_ROOT, actualPath) !== path.resolve(REPO_ROOT, expectedPath)) {
      blockers.push(`source_export_manifest_pipeline_arg_path_mismatch:${flag}`)
    }
  }
  return blockers
}

function evaluateRuntimeSourceExportProvenance(sourceManifest, sourcePath, evidenceArgs, evidenceResults, runtimeEvidenceLineageConsistency) {
  const hasRuntimeEvidence = [
    evidenceArgs.durationCalibrationEvidence,
    evidenceArgs.dependencyWriterEvidence,
    evidenceArgs.runtimePublicationEvidence,
    evidenceArgs.postPublishSmokeRollbackEvidence,
  ].some(Boolean)
  if (!hasRuntimeEvidence) {
    return {
      status: 'blocked',
      blockers: ['runtime_evidence_files_required_before_source_export_provenance'],
    }
  }
  const root = readObject(sourceManifest)
  const exportSessionId = String(root.exportSessionId ?? root.export_session_id ?? '').trim()
  const explicitSourceManifestBlockers = sourceExportManifestHasExplicitBlockers(root)
  const blockers = [
    sourcePath ? null : 'source_export_manifest_required',
    root.__readError ? root.__readError : null,
    root.schemaVersion === 'workbuddy-default-master-plan-production-source-exports/v1'
      ? null
      : 'source_export_manifest_schema_version_invalid',
    String(root.status ?? '').trim() === 'exported' || explicitSourceManifestBlockers
      ? null
      : 'source_export_manifest_not_exported',
    exportSessionId ? null : 'source_export_manifest_session_id_required',
  ].filter(Boolean)
  if (sourcePath && !root.__readError) {
    blockers.push(...sourceExportManifestBoundaryBlockers(root))
    blockers.push(...sourceExportManifestRootBlockers(root))
    blockers.push(...sourceExportManifestPipelineArgBlockers(root, sourcePath))
  }
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      blockers: uniqueNonEmpty([
        ...blockers,
        ...sourceExportManifestDirectRecordBlockers(root),
      ]),
    }
  }
  blockers.push(...sourceExportManifestIdentityBlockers(root, runtimeEvidenceLineageConsistency))
  blockers.push(...sourceExportManifestRecordBlockers(root, evidenceResults))
  if (blockers.length > 0) {
    return {
      status: 'blocked',
      blockers,
    }
  }
  return {
    status: 'pass',
    evidence: {
      sourceEvidencePath: repoRelative(sourcePath),
      exportSessionId,
      productionReady: false,
    },
  }
}

async function checkLegacySerialRemoval() {
  const legacyRemovalGuardTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'wbsTemplateLegacySerialPathRemoval.test.ts')
  const behaviorGuardTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'wbsTemplatesApply.test.ts')
  const scenarioSelectorPath = path.join(REPO_ROOT, 'server', 'src', 'services', 'constructionOrganizationScenarioSelectorEngine.ts')
  const networkDraftPath = path.join(REPO_ROOT, 'server', 'src', 'services', 'constructionOrganizationPlanNetworkDraftService.ts')
  const networkDomainWriterPath = path.join(REPO_ROOT, 'server', 'src', 'services', 'constructionOrganizationPlanNetworkDomainWriter.ts')
  const frontendRuleAssetApiPath = path.join(REPO_ROOT, 'client', 'src', 'services', 'ruleAssetGovernanceWorkbenchApi.ts')
  const scenarioSelectorTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'constructionOrganizationScenarioSelector.test.ts')
  const networkDraftTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'constructionOrganizationPlanNetworkDraftService.test.ts')
  const networkDomainWriterTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'constructionOrganizationPlanNetworkDomainWriter.test.ts')
  const frontendRuleAssetApiTestPath = path.join(REPO_ROOT, 'client', 'src', 'services', '__tests__', 'ruleAssetGovernanceWorkbenchApi.test.ts')
  const evidenceSourceGuardPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'default-master-plan-source-guard.mjs')
  const evidenceSourceGuardTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'default-master-plan-source-guard.test.mjs')
  const evidenceSourceManifestCheckerPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'check-default-master-plan-evidence-sources.mjs')
  const evidenceSourceManifestCheckerTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'check-default-master-plan-evidence-sources.test.mjs')
  const candidateExportHygienePath = path.join(REPO_ROOT, 'project-testing', 'tools', 'check-default-master-plan-candidate-export-hygiene.mjs')
  const candidateExportHygieneTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'check-default-master-plan-candidate-export-hygiene.test.mjs')
  const candidateDiscoveryPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'discover-default-master-plan-production-candidates.mjs')
  const candidateDiscoveryTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'discover-default-master-plan-production-candidates.test.mjs')
  const dependencyWriterEvidenceBuilderPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-dependency-writer-evidence.mjs')
  const dependencyWriterEvidenceBuilderTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-dependency-writer-evidence.test.mjs')
  const sourceExportMetadataPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'default-master-plan-source-export-metadata.mjs')
  const sourceExportMetadataTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'default-master-plan-source-export-metadata.test.mjs')
  const productionEvidencePipelinePath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-production-evidence-pipeline.mjs')
  const productionEvidencePipelineTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-production-evidence-pipeline.test.mjs')
  const productionSourceExporterPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'export-default-master-plan-production-sources.mjs')
  const productionSourceExporterTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'export-default-master-plan-production-sources.test.mjs')
  const durationSampleGapPlannerPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'plan-default-master-plan-duration-sample-gaps.mjs')
  const durationSampleGapPlannerTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'plan-default-master-plan-duration-sample-gaps.test.mjs')
  const durationSampleCollectionPackagePath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-duration-sample-collection-package.mjs')
  const durationSampleCollectionPackageTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-duration-sample-collection-package.test.mjs')
  const runtimeMaterialPackagePath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-runtime-material-package.mjs')
  const runtimeMaterialPackageTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-runtime-material-package.test.mjs')
  const realProductionOutcomePackagePath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-real-production-outcome-package.mjs')
  const realProductionOutcomePackageTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-real-production-outcome-package.test.mjs')
  const operatorHandoffBuilderPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-production-operator-handoff.mjs')
  const operatorHandoffBuilderTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-production-operator-handoff.test.mjs')
  const operatorHandoffPreflightPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'check-default-master-plan-operator-handoff-preflight.mjs')
  const operatorHandoffPreflightTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'check-default-master-plan-operator-handoff-preflight.test.mjs')
  const durationCalibrationBuilderTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-duration-calibration-evidence.test.mjs')
  const runtimePublicationBuilderPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-runtime-publication-evidence.mjs')
  const runtimePublicationBuilderTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-runtime-publication-evidence.test.mjs')
  const postPublishSmokeBuilderTestPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'build-default-master-plan-post-publish-smoke-rollback-evidence.test.mjs')
  const serverDependencyWriterEvidenceFlowPath = path.join(REPO_ROOT, 'server', 'src', 'services', 'defaultMasterPlanDependencyWriterEvidenceFlowService.ts')
  const serverDependencyWriterEvidenceFlowTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'defaultMasterPlanDependencyWriterEvidenceFlow.test.ts')
  const serverRuntimePublicationServicePath = path.join(REPO_ROOT, 'server', 'src', 'services', 'wbsTemplateRuntimePublicationService.ts')
  const serverRuntimePublicationServiceTestPath = path.join(REPO_ROOT, 'server', 'src', '__tests__', 'wbsTemplateRuntimePublicationService.test.ts')
  const entryTemplateInstallerPath = path.join(REPO_ROOT, 'project-testing', 'tools', 'ensure-default-master-plan-entry-templates.mjs')
  const [
    planningBootstrap,
    wbsTemplateRoute,
    taskBaselineRoute,
    templateInlineExpand,
    wbsTemplateGenerationApi,
    legacyRemovalGuardTest,
    behaviorGuardTest,
    scenarioSelector,
    networkDraft,
    networkDomainWriter,
    frontendRuleAssetApi,
    scenarioSelectorTest,
    networkDraftTest,
    networkDomainWriterTest,
    frontendRuleAssetApiTest,
    evidenceSourceGuard,
    evidenceSourceGuardTest,
    evidenceSourceManifestChecker,
    evidenceSourceManifestCheckerTest,
    candidateExportHygiene,
    candidateExportHygieneTest,
    candidateDiscovery,
    candidateDiscoveryTest,
    dependencyWriterEvidenceBuilder,
    dependencyWriterEvidenceBuilderTest,
    sourceExportMetadata,
    sourceExportMetadataTest,
    productionEvidencePipeline,
    productionEvidencePipelineTest,
    productionSourceExporter,
    productionSourceExporterTest,
    durationSampleGapPlanner,
    durationSampleGapPlannerTest,
    durationSampleCollectionPackage,
    durationSampleCollectionPackageTest,
    runtimeMaterialPackage,
    runtimeMaterialPackageTest,
    realProductionOutcomePackage,
    realProductionOutcomePackageTest,
    operatorHandoffBuilder,
    operatorHandoffBuilderTest,
    operatorHandoffPreflight,
    operatorHandoffPreflightTest,
    durationCalibrationBuilderTest,
    runtimePublicationBuilder,
    runtimePublicationBuilderTest,
    postPublishSmokeBuilderTest,
    serverDependencyWriterEvidenceFlow,
    serverDependencyWriterEvidenceFlowTest,
    serverRuntimePublicationService,
    serverRuntimePublicationServiceTest,
    entryTemplateInstaller,
  ] = await Promise.all([
    fs.readFile(path.join(REPO_ROOT, 'server', 'src', 'services', 'planningBootstrap.ts'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'server', 'src', 'routes', 'wbs-templates.ts'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'server', 'src', 'routes', 'task-baselines.ts'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'client', 'src', 'components', 'planning', 'TemplateInlineExpand.tsx'), 'utf8'),
    fs.readFile(path.join(REPO_ROOT, 'client', 'src', 'services', 'wbsTemplateGenerationApi.ts'), 'utf8'),
    fs.readFile(legacyRemovalGuardTestPath, 'utf8'),
    fs.readFile(behaviorGuardTestPath, 'utf8'),
    fs.readFile(scenarioSelectorPath, 'utf8'),
    fs.readFile(networkDraftPath, 'utf8'),
    fs.readFile(networkDomainWriterPath, 'utf8'),
    fs.readFile(frontendRuleAssetApiPath, 'utf8'),
    fs.readFile(scenarioSelectorTestPath, 'utf8'),
    fs.readFile(networkDraftTestPath, 'utf8'),
    fs.readFile(networkDomainWriterTestPath, 'utf8'),
    fs.readFile(frontendRuleAssetApiTestPath, 'utf8'),
    fs.readFile(evidenceSourceGuardPath, 'utf8'),
    fs.readFile(evidenceSourceGuardTestPath, 'utf8'),
    fs.readFile(evidenceSourceManifestCheckerPath, 'utf8'),
    fs.readFile(evidenceSourceManifestCheckerTestPath, 'utf8'),
    fs.readFile(candidateExportHygienePath, 'utf8'),
    fs.readFile(candidateExportHygieneTestPath, 'utf8'),
    fs.readFile(candidateDiscoveryPath, 'utf8'),
    fs.readFile(candidateDiscoveryTestPath, 'utf8'),
    fs.readFile(dependencyWriterEvidenceBuilderPath, 'utf8'),
    fs.readFile(dependencyWriterEvidenceBuilderTestPath, 'utf8'),
    fs.readFile(sourceExportMetadataPath, 'utf8'),
    fs.readFile(sourceExportMetadataTestPath, 'utf8'),
    fs.readFile(productionEvidencePipelinePath, 'utf8'),
    fs.readFile(productionEvidencePipelineTestPath, 'utf8'),
    fs.readFile(productionSourceExporterPath, 'utf8'),
    fs.readFile(productionSourceExporterTestPath, 'utf8'),
    fs.readFile(durationSampleGapPlannerPath, 'utf8'),
    fs.readFile(durationSampleGapPlannerTestPath, 'utf8'),
    fs.readFile(durationSampleCollectionPackagePath, 'utf8'),
    fs.readFile(durationSampleCollectionPackageTestPath, 'utf8'),
    fs.readFile(runtimeMaterialPackagePath, 'utf8'),
    fs.readFile(runtimeMaterialPackageTestPath, 'utf8'),
    fs.readFile(realProductionOutcomePackagePath, 'utf8'),
    fs.readFile(realProductionOutcomePackageTestPath, 'utf8'),
    fs.readFile(operatorHandoffBuilderPath, 'utf8'),
    fs.readFile(operatorHandoffBuilderTestPath, 'utf8'),
    fs.readFile(operatorHandoffPreflightPath, 'utf8'),
    fs.readFile(operatorHandoffPreflightTestPath, 'utf8'),
    fs.readFile(durationCalibrationBuilderTestPath, 'utf8'),
    fs.readFile(runtimePublicationBuilderPath, 'utf8'),
    fs.readFile(runtimePublicationBuilderTestPath, 'utf8'),
    fs.readFile(postPublishSmokeBuilderTestPath, 'utf8'),
    fs.readFile(serverDependencyWriterEvidenceFlowPath, 'utf8'),
    fs.readFile(serverDependencyWriterEvidenceFlowTestPath, 'utf8'),
    fs.readFile(serverRuntimePublicationServicePath, 'utf8'),
    fs.readFile(serverRuntimePublicationServiceTestPath, 'utf8'),
    fs.readFile(entryTemplateInstallerPath, 'utf8'),
  ])
  const fromTemplateStart = wbsTemplateRoute.indexOf("router.post('/bootstrap/from-template'")
  const fromTemplateEnd = wbsTemplateRoute.indexOf("router.get('/export-json'")
  const fromTemplateBlock = fromTemplateStart >= 0 && fromTemplateEnd > fromTemplateStart
    ? wbsTemplateRoute.slice(fromTemplateStart, fromTemplateEnd)
    : ''
  const profileResolverStart = wbsTemplateRoute.indexOf('function resolveDefaultMasterPlanBootstrapProfile')
  const profileResolverEnd = wbsTemplateRoute.indexOf('function uniqueNormalizedStrings', profileResolverStart)
  const profileResolverBlock = profileResolverStart >= 0 && profileResolverEnd > profileResolverStart
    ? wbsTemplateRoute.slice(profileResolverStart, profileResolverEnd)
    : ''
  const explicitEntryGateStart = wbsTemplateRoute.indexOf('function isExplicitDefaultMasterPlanEntryTemplate')
  const explicitEntryGateEnd = wbsTemplateRoute.indexOf('function sanitizeWbsTemplatePayload', explicitEntryGateStart)
  const explicitEntryGateBlock = explicitEntryGateStart >= 0 && explicitEntryGateEnd > explicitEntryGateStart
    ? wbsTemplateRoute.slice(explicitEntryGateStart, explicitEntryGateEnd)
    : ''
  const guardTestEvidence = buildLegacySerialRemovalGuardTestEvidence(legacyRemovalGuardTest, legacyRemovalGuardTestPath)
  const guardTestGaps = Object.entries(guardTestEvidence.coverage)
    .filter(([, covered]) => !covered)
    .map(([coverageKey]) => `legacy_serial_removal_guard_test_missing_${coverageKey}`)
  const behaviorGuardTestEvidence = buildLegacyDirectFailureBehaviorGuardTestEvidence(behaviorGuardTest, behaviorGuardTestPath)
  const behaviorGuardTestGaps = Object.entries(behaviorGuardTestEvidence.coverage)
    .filter(([, covered]) => !covered)
    .map(([coverageKey]) => `legacy_direct_failure_behavior_guard_test_missing_${coverageKey}`)
  const manualComparisonGuardEvidence = buildManualComparisonGuardEvidence({
    scenarioSelector,
    scenarioSelectorPath,
    networkDraft,
    networkDraftPath,
    networkDomainWriter,
    networkDomainWriterPath,
    frontendRuleAssetApi,
    frontendRuleAssetApiPath,
    scenarioSelectorTest,
    scenarioSelectorTestPath,
    networkDraftTest,
    networkDraftTestPath,
    networkDomainWriterTest,
    networkDomainWriterTestPath,
    frontendRuleAssetApiTest,
    frontendRuleAssetApiTestPath,
    evidenceSourceGuard,
    evidenceSourceGuardPath,
    evidenceSourceGuardTest,
    evidenceSourceGuardTestPath,
    evidenceSourceManifestChecker,
    evidenceSourceManifestCheckerPath,
    evidenceSourceManifestCheckerTest,
    evidenceSourceManifestCheckerTestPath,
    candidateExportHygiene,
    candidateExportHygienePath,
    candidateExportHygieneTest,
    candidateExportHygieneTestPath,
    candidateDiscovery,
    candidateDiscoveryPath,
    candidateDiscoveryTest,
    candidateDiscoveryTestPath,
    dependencyWriterEvidenceBuilder,
    dependencyWriterEvidenceBuilderPath,
    dependencyWriterEvidenceBuilderTest,
    dependencyWriterEvidenceBuilderTestPath,
    sourceExportMetadata,
    sourceExportMetadataPath,
    sourceExportMetadataTest,
    sourceExportMetadataTestPath,
    productionEvidencePipeline,
    productionEvidencePipelinePath,
    productionEvidencePipelineTest,
    productionEvidencePipelineTestPath,
    productionSourceExporter,
    productionSourceExporterPath,
    productionSourceExporterTest,
    productionSourceExporterTestPath,
    durationSampleGapPlanner,
    durationSampleGapPlannerPath,
    durationSampleGapPlannerTest,
    durationSampleGapPlannerTestPath,
    durationSampleCollectionPackage,
    durationSampleCollectionPackagePath,
    durationSampleCollectionPackageTest,
    durationSampleCollectionPackageTestPath,
    runtimeMaterialPackage,
    runtimeMaterialPackagePath,
    runtimeMaterialPackageTest,
    runtimeMaterialPackageTestPath,
    realProductionOutcomePackage,
    realProductionOutcomePackagePath,
    realProductionOutcomePackageTest,
    realProductionOutcomePackageTestPath,
    operatorHandoffBuilder,
    operatorHandoffBuilderPath,
    operatorHandoffBuilderTest,
    operatorHandoffBuilderTestPath,
    operatorHandoffPreflight,
    operatorHandoffPreflightPath,
    operatorHandoffPreflightTest,
    operatorHandoffPreflightTestPath,
    durationCalibrationBuilderTest,
    durationCalibrationBuilderTestPath,
    runtimePublicationBuilder,
    runtimePublicationBuilderPath,
    runtimePublicationBuilderTest,
    runtimePublicationBuilderTestPath,
    postPublishSmokeBuilderTest,
    postPublishSmokeBuilderTestPath,
    serverDependencyWriterEvidenceFlow,
    serverDependencyWriterEvidenceFlowPath,
    serverDependencyWriterEvidenceFlowTest,
    serverDependencyWriterEvidenceFlowTestPath,
    serverRuntimePublicationService,
    serverRuntimePublicationServicePath,
    serverRuntimePublicationServiceTest,
    serverRuntimePublicationServiceTestPath,
  })
  const manualComparisonGuardGaps = Object.entries(manualComparisonGuardEvidence.coverage)
    .filter(([, covered]) => !covered)
    .map(([coverageKey]) => `manual_comparison_guard_missing_${coverageKey}`)
  const gaps = [
    planningBootstrap.includes('handleTemplateGenerate') ? 'planningBootstrap_handleTemplateGenerate_still_present' : null,
    planningBootstrap.includes('template.wbs_nodes ?? []') ? 'planningBootstrap_direct_template_node_expansion_still_present' : null,
    planningBootstrap.includes('buildBaselineItemsFromTemplateNodes') ? 'planningBootstrap_old_serial_materializer_name_still_present' : null,
    planningBootstrap.includes('buildBaselineItemsFromPlanningBootstrapNodes') ? 'planningBootstrap_retired_baseline_materializer_still_present' : null,
    planningBootstrap.includes('buildTemplateNodesFromTasks') ? 'planningBootstrap_task_reverse_nodes_still_present' : null,
    planningBootstrap.includes('buildProjectBootstrapNodes') ? 'planningBootstrap_project_reverse_nodes_still_present' : null,
    planningBootstrap.includes('buildTemplateSeedFromProject') ? 'planningBootstrap_completed_project_template_seed_still_present' : null,
    planningBootstrap.includes('buildBaselineSeedFromProject') ? 'planningBootstrap_ongoing_project_baseline_seed_still_present' : null,
    wbsTemplateRoute.includes('buildBaselineItemsFromTemplateNodes') ? 'wbs_route_old_serial_materializer_name_still_present' : null,
    fromTemplateBlock.includes('buildBaselineItemsFromTemplateNodes') ? 'from_template_still_calls_serial_baseline_materializer' : null,
    fromTemplateBlock.includes('legacy_template_serial_fallback') ? 'from_template_still_mentions_legacy_template_serial_fallback' : null,
    fromTemplateBlock.includes('legacy_fallback') ? 'from_template_still_returns_legacy_fallback' : null,
    fromTemplateBlock.includes('fallback_policy') ? 'from_template_still_returns_fallback_policy' : null,
    fromTemplateBlock.includes('controlledDegradation') ? 'from_template_still_returns_controlled_degradation' : null,
    fromTemplateBlock.includes('fallbackApplied') ? 'from_template_still_returns_fallback_applied' : null,
    fromTemplateBlock.includes('handoffGenerationMode') ? 'from_template_still_returns_handoff_generation_mode' : null,
    wbsTemplateRoute.includes('/bootstrap/from-completed-project') ? 'wbs_route_reverse_completed_project_bootstrap_still_present' : null,
    wbsTemplateRoute.includes('/bootstrap/from-ongoing-project') ? 'wbs_route_ongoing_project_bootstrap_still_present' : null,
    wbsTemplateRoute.includes('completed_project_to_template') ? 'wbs_route_reverse_template_path_still_present' : null,
    wbsTemplateRoute.includes('ongoing_project_to_baseline') ? 'wbs_route_ongoing_baseline_path_still_present' : null,
    taskBaselineRoute.includes('/bootstrap/from-schedule') ? 'task_baseline_from_schedule_bootstrap_still_present' : null,
    taskBaselineRoute.includes('ongoing_project_to_baseline') ? 'task_baseline_ongoing_path_still_present' : null,
    templateInlineExpand.includes('completed_project_to_template') ? 'embedded_template_reverse_action_still_present' : null,
    templateInlineExpand.includes('ongoing_project_to_baseline') ? 'embedded_template_ongoing_action_still_present' : null,
    templateInlineExpand.includes('/api/task-baselines/bootstrap/from-schedule') ? 'embedded_template_from_schedule_call_still_present' : null,
    templateInlineExpand.includes('/bootstrap/from-completed-project') ? 'embedded_template_from_completed_call_still_present' : null,
    templateInlineExpand.includes('data-testid="template-inline-expand"') ? null : 'embedded_template_surface_missing',
    wbsTemplateGenerationApi.includes('/api/wbs-templates') ? 'embedded_template_legacy_api_still_present' : null,
    wbsTemplateGenerationApi.includes('/api/planning/wbs-templates/generate-preview') ? null : 'embedded_template_missing_canonical_preview_endpoint',
    profileResolverBlock.includes('templateLooksLikeDefaultMasterPlan') ? 'default_master_plan_profile_still_uses_name_heuristic' : null,
    profileResolverBlock.includes('isExplicitDefaultMasterPlanEntryTemplate(template)') ? null : 'default_master_plan_profile_missing_explicit_entry_gate',
    explicitEntryGateBlock.includes('isSystemWbsTemplateScope(template)') ? null : 'default_master_plan_entry_gate_missing_system_scope_check',
    explicitEntryGateBlock.includes('standard_catalog_code') ? null : 'default_master_plan_entry_gate_missing_standard_code_check',
    explicitEntryGateBlock.includes('EXPLICIT_DEFAULT_MASTER_PLAN_ENTRY_CODES')
      ? null
      : 'default_master_plan_entry_gate_missing_explicit_entry_code_whitelist',
    explicitEntryGateBlock.includes('isPublishedWbsTemplateRow(template)')
      && wbsTemplateRoute.includes('function isPublishedWbsTemplateRow')
      && wbsTemplateRoute.includes("const status = normalizeTemplateScope(template.status ?? template.lifecycle_status)")
      && wbsTemplateRoute.includes("const statusAllowsGeneration = !status || status === 'published' || status === 'active'")
      && wbsTemplateRoute.includes('return isActive && statusAllowsGeneration && !isDraft')
      ? null
      : 'default_master_plan_entry_gate_missing_published_row_check',
    entryTemplateInstaller.includes('is_default: true')
      || entryTemplateInstaller.includes('is_construction_default: true')
      ? 'default_master_plan_entry_installer_marks_entries_as_draft'
      : null,
    explicitEntryGateBlock.includes("includes('default_master_plan')")
      || explicitEntryGateBlock.includes('includes("default_master_plan")')
      || explicitEntryGateBlock.includes("includes('master_plan_entry')")
      || explicitEntryGateBlock.includes('includes("master_plan_entry")')
      ? 'default_master_plan_entry_gate_still_allows_generic_code_contains_match'
      : null,
    fromTemplateBlock.includes('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED') ? null : 'from_template_missing_direct_failure_code',
    fromTemplateBlock.includes('directFailure: true') ? null : 'from_template_missing_direct_failure_marker',
    fromTemplateBlock.includes('legacyFallbackRemoved: true') ? null : 'from_template_missing_legacy_fallback_removal_marker',
    fromTemplateBlock.includes('managedFallbackRemoved: true') ? null : 'from_template_missing_managed_fallback_removal_marker',
    ...guardTestGaps,
    ...behaviorGuardTestGaps,
    ...manualComparisonGuardGaps,
  ].filter(Boolean)
  return {
    status: gaps.length === 0 ? 'pass' : 'fail',
    gaps,
    guardTestEvidence,
    behaviorGuardTestEvidence,
    manualComparisonGuardEvidence,
  }
}

function buildLegacySerialRemovalGuardTestEvidence(source, sourcePath) {
  const containsAll = (...needles) => needles.every((needle) => source.includes(needle))
  return {
    sourcePath: repoRelative(sourcePath),
    coverage: {
      planningBootstrapSerialMaterializerRemoved: containsAll(
        "expect(source).not.toContain('handleTemplateGenerate')",
        "expect(source).not.toContain('template.wbs_nodes ?? []')",
        "expect(source).not.toContain('buildBaselineItemsFromTemplateNodes')",
      ),
      wbsRouteSerialMaterializerRemoved: containsAll(
        "removes the old serial-template materializer name from WBS routes",
        "new URL('../routes/wbs-templates.ts', import.meta.url)",
        "expect(source).not.toContain('buildBaselineItemsFromTemplateNodes')",
      ),
      fromTemplateDirectFailureMarkers: containsAll(
        "router.post('/bootstrap/from-template'",
        "expect(fromTemplateBlock).toContain('buildDefaultMasterPlanBaselineDraft')",
        "expect(fromTemplateBlock).toContain('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')",
        "expect(fromTemplateBlock).toContain('directFailure: true')",
        "expect(fromTemplateBlock).toContain('legacyFallbackRemoved: true')",
        "expect(fromTemplateBlock).toContain('managedFallbackRemoved: true')",
        "expect(fromTemplateBlock).not.toContain('legacy_template_serial_fallback')",
        "expect(fromTemplateBlock).not.toContain('controlledDegradation')",
        "expect(fromTemplateBlock).not.toContain('fallbackApplied')",
        "expect(fromTemplateBlock).not.toContain('handoffGenerationMode')",
      ),
      reverseBootstrapRoutesRemoved: containsAll(
        'removes reverse-template and manual schedule bootstrap routes from reachable server surfaces',
        "expect(wbsTemplateRoute).not.toContain('/bootstrap/from-completed-project')",
        "expect(wbsTemplateRoute).not.toContain('/bootstrap/from-ongoing-project')",
        "expect(taskBaselineRoute).not.toContain('/bootstrap/from-schedule')",
      ),
      embeddedTemplateSurfaceRetained: containsAll(
        'retires the standalone WBS template page and keeps generation embedded',
        "new URL('../../../client/src/components/planning/TemplateInlineExpand.tsx', import.meta.url)",
        "expect(embeddedSource).toContain('data-testid=\"template-inline-expand\"')",
      ),
      embeddedTemplateCanonicalEndpointOnly: containsAll(
        'retires the standalone WBS template page and keeps generation embedded',
        "new URL('../../../client/src/services/wbsTemplateGenerationApi.ts', import.meta.url)",
        "expect(apiSource).toContain('/api/planning/wbs-templates/generate-preview')",
        "expect(apiSource).not.toContain('/api/wbs-templates')",
      ),
      legacyImportSanitizerRetiredEndpointCoverageRemoved: containsAll(
        'keeps legacy scope sanitizer coverage off retired bootstrap endpoints',
        "new URL('./wbsTemplateImportLegacyScopeSanitizer.test.ts', import.meta.url)",
        "expect(source).not.toContain('/bootstrap/from-completed-project')",
        "expect(source).not.toContain('/bootstrap/from-ongoing-project')",
        "expect(source).not.toContain('/api/task-baselines/bootstrap/from-schedule')",
      ),
      explicitEntryPublishedRowGate: containsAll(
        'requires published explicit default master-plan entry templates before generating candidate drafts',
        "expect(source).toContain('function isPublishedWbsTemplateRow')",
        "expect(source).toContain(\"const status = normalizeTemplateScope(template.status ?? template.lifecycle_status)\")",
        "expect(source).toContain(\"const statusAllowsGeneration = !status || status === 'published' || status === 'active'\")",
        "expect(source).toContain('return isActive && statusAllowsGeneration && !isDraft')",
        "expect(source).toContain('if (!isPublishedWbsTemplateRow(template)) return false')",
      ),
    },
  }
}

function buildLegacyDirectFailureBehaviorGuardTestEvidence(source, sourcePath) {
  const containsAll = (...needles) => needles.every((needle) => source.includes(needle))
  return {
    sourcePath: repoRelative(sourcePath),
    coverage: {
      lowInformationLegacyTemplateDirectFailure: containsAll(
        'fails directly for low-information legacy templates instead of accepting a managed fallback',
        "template_id: 'template-legacy-simple'",
        "expect(response.status).toBe(422)",
        "expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')",
        'directFailure: true',
        'legacyFallbackRemoved: true',
        'managedFallbackRemoved: true',
      ),
      conflictingLegacyTemplateDirectFailure: containsAll(
        'fails directly when a legacy template conflicts with the project business type',
        "template_id: 'template-conflicting-hospital'",
        "expect(response.status).toBe(422)",
        "expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')",
        'directFailure: true',
        'legacyFallbackRemoved: true',
        'managedFallbackRemoved: true',
      ),
      draftExplicitEntryDirectFailure: containsAll(
        'fails directly for draft explicit default master-plan entries instead of treating low-information drafts as managed fallbacks',
        "template_id: 'template-draft-default-entry'",
        "expect(response.status).toBe(422)",
        "expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')",
        'directFailure: true',
        'legacyFallbackRemoved: true',
        'managedFallbackRemoved: true',
      ),
      statusDraftExplicitEntryDirectFailure: containsAll(
        'fails directly for status draft explicit default master-plan entries even when legacy draft flags are false',
        "template_id: 'template-draft-status-default-entry'",
        "expect(response.status).toBe(422)",
        "expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')",
        'directFailure: true',
        'legacyFallbackRemoved: true',
        'managedFallbackRemoved: true',
      ),
      noControlledDegradationMarkers: containsAll(
        'controlledDegradation: expect.anything()',
        'fallbackApplied: expect.anything()',
        'handoffGenerationMode: expect.anything()',
        'expect(response.body.error.details).not.toEqual(expect.objectContaining({',
      ),
      noGenerationOrBaselineWritesOnDirectFailure: containsAll(
        'expect(mocks.generatedRowCalls).toHaveLength(0)',
        'expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)',
        'expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)',
      ),
    },
  }
}

function buildManualComparisonGuardEvidence({
  scenarioSelector,
  scenarioSelectorPath,
  networkDraft,
  networkDraftPath,
  networkDomainWriter,
  networkDomainWriterPath,
  frontendRuleAssetApi,
  frontendRuleAssetApiPath,
  scenarioSelectorTest,
  scenarioSelectorTestPath,
  networkDraftTest,
  networkDraftTestPath,
  networkDomainWriterTest,
  networkDomainWriterTestPath,
  frontendRuleAssetApiTest,
  frontendRuleAssetApiTestPath,
  evidenceSourceGuard,
  evidenceSourceGuardPath,
  evidenceSourceGuardTest,
  evidenceSourceGuardTestPath,
  evidenceSourceManifestChecker,
  evidenceSourceManifestCheckerPath,
  evidenceSourceManifestCheckerTest,
  evidenceSourceManifestCheckerTestPath,
  candidateExportHygiene,
  candidateExportHygienePath,
  candidateExportHygieneTest,
  candidateExportHygieneTestPath,
  candidateDiscovery,
  candidateDiscoveryPath,
  candidateDiscoveryTest,
  candidateDiscoveryTestPath,
  dependencyWriterEvidenceBuilder,
  dependencyWriterEvidenceBuilderPath,
  dependencyWriterEvidenceBuilderTest,
  dependencyWriterEvidenceBuilderTestPath,
  sourceExportMetadata,
  sourceExportMetadataPath,
  sourceExportMetadataTest,
  sourceExportMetadataTestPath,
  productionEvidencePipeline,
  productionEvidencePipelinePath,
  productionEvidencePipelineTest,
  productionEvidencePipelineTestPath,
  productionSourceExporter,
  productionSourceExporterPath,
  productionSourceExporterTest,
  productionSourceExporterTestPath,
  durationSampleGapPlanner,
  durationSampleGapPlannerPath,
  durationSampleGapPlannerTest,
  durationSampleGapPlannerTestPath,
  durationSampleCollectionPackage,
  durationSampleCollectionPackagePath,
  durationSampleCollectionPackageTest,
  durationSampleCollectionPackageTestPath,
  runtimeMaterialPackage,
  runtimeMaterialPackagePath,
  runtimeMaterialPackageTest,
  runtimeMaterialPackageTestPath,
  realProductionOutcomePackage,
  realProductionOutcomePackagePath,
  realProductionOutcomePackageTest,
  realProductionOutcomePackageTestPath,
  operatorHandoffBuilder,
  operatorHandoffBuilderPath,
  operatorHandoffBuilderTest,
  operatorHandoffBuilderTestPath,
  operatorHandoffPreflight,
  operatorHandoffPreflightPath,
  operatorHandoffPreflightTest,
  operatorHandoffPreflightTestPath,
  durationCalibrationBuilderTest,
  durationCalibrationBuilderTestPath,
  runtimePublicationBuilder,
  runtimePublicationBuilderPath,
  runtimePublicationBuilderTest,
  runtimePublicationBuilderTestPath,
  postPublishSmokeBuilderTest,
  postPublishSmokeBuilderTestPath,
  serverDependencyWriterEvidenceFlow,
  serverDependencyWriterEvidenceFlowPath,
  serverDependencyWriterEvidenceFlowTest,
  serverDependencyWriterEvidenceFlowTestPath,
  serverRuntimePublicationService,
  serverRuntimePublicationServicePath,
  serverRuntimePublicationServiceTest,
  serverRuntimePublicationServiceTestPath,
}) {
  const containsAll = (source, ...needles) => needles.every((needle) => source.includes(needle))
  return {
    sourcePaths: {
      scenarioSelector: repoRelative(scenarioSelectorPath),
      networkDraft: repoRelative(networkDraftPath),
      networkDomainWriter: repoRelative(networkDomainWriterPath),
      frontendRuleAssetApi: repoRelative(frontendRuleAssetApiPath),
      scenarioSelectorTest: repoRelative(scenarioSelectorTestPath),
      networkDraftTest: repoRelative(networkDraftTestPath),
      networkDomainWriterTest: repoRelative(networkDomainWriterTestPath),
      frontendRuleAssetApiTest: repoRelative(frontendRuleAssetApiTestPath),
      evidenceSourceGuard: repoRelative(evidenceSourceGuardPath),
      evidenceSourceGuardTest: repoRelative(evidenceSourceGuardTestPath),
      evidenceSourceManifestChecker: repoRelative(evidenceSourceManifestCheckerPath),
      evidenceSourceManifestCheckerTest: repoRelative(evidenceSourceManifestCheckerTestPath),
      candidateExportHygiene: repoRelative(candidateExportHygienePath),
      candidateExportHygieneTest: repoRelative(candidateExportHygieneTestPath),
      candidateDiscovery: repoRelative(candidateDiscoveryPath),
      candidateDiscoveryTest: repoRelative(candidateDiscoveryTestPath),
      dependencyWriterEvidenceBuilder: repoRelative(dependencyWriterEvidenceBuilderPath),
      dependencyWriterEvidenceBuilderTest: repoRelative(dependencyWriterEvidenceBuilderTestPath),
      sourceExportMetadata: repoRelative(sourceExportMetadataPath),
      sourceExportMetadataTest: repoRelative(sourceExportMetadataTestPath),
      productionEvidencePipeline: repoRelative(productionEvidencePipelinePath),
      productionEvidencePipelineTest: repoRelative(productionEvidencePipelineTestPath),
      productionSourceExporter: repoRelative(productionSourceExporterPath),
      productionSourceExporterTest: repoRelative(productionSourceExporterTestPath),
      durationSampleGapPlanner: repoRelative(durationSampleGapPlannerPath),
      durationSampleGapPlannerTest: repoRelative(durationSampleGapPlannerTestPath),
      durationSampleCollectionPackage: repoRelative(durationSampleCollectionPackagePath),
      durationSampleCollectionPackageTest: repoRelative(durationSampleCollectionPackageTestPath),
      runtimeMaterialPackage: repoRelative(runtimeMaterialPackagePath),
      runtimeMaterialPackageTest: repoRelative(runtimeMaterialPackageTestPath),
      operatorHandoffBuilder: repoRelative(operatorHandoffBuilderPath),
      operatorHandoffBuilderTest: repoRelative(operatorHandoffBuilderTestPath),
      operatorHandoffPreflight: repoRelative(operatorHandoffPreflightPath),
      operatorHandoffPreflightTest: repoRelative(operatorHandoffPreflightTestPath),
      durationCalibrationBuilderTest: repoRelative(durationCalibrationBuilderTestPath),
      runtimePublicationBuilderTest: repoRelative(runtimePublicationBuilderTestPath),
      postPublishSmokeBuilderTest: repoRelative(postPublishSmokeBuilderTestPath),
      serverDependencyWriterEvidenceFlow: repoRelative(serverDependencyWriterEvidenceFlowPath),
      serverDependencyWriterEvidenceFlowTest: repoRelative(serverDependencyWriterEvidenceFlowTestPath),
    },
    coverage: {
      scenarioOptionComparisonPackageReadOnly: containsAll(
        scenarioSelector,
        "source: 'construction_organization_plan_option_comparison_package'",
        'canAutoMaterializeSelectedOption: false',
        "'candidate_only'",
        "'writes_task_dependencies_false'",
        "'writes_plan_dates_false'",
        "'requires_domain_writer_release_exit_before_materialization'",
      ),
      networkOptionComparisonPackageReadOnly: containsAll(
        networkDraft,
        "source: 'construction_organization_plan_network_option_comparison_package'",
        'canAutoMaterializeSelectedOption: false',
        "'option_comparison_package_is_read_only'",
        "'does_not_select_runtime_materialization_automatically'",
        "'does_not_write_task_dependencies_or_plan_dates'",
      ),
      scenarioOptionComparisonGuardTestCoverage: containsAll(
        scenarioSelectorTest,
        "source: 'construction_organization_plan_option_comparison_package'",
        'canAutoMaterializeSelectedOption: false',
        'writesTaskDependencies: false',
        'writesPlanDates: false',
        'writesSeed: false',
        'writesCriticalPathFacts: false',
        'writesAccelerationDraft: false',
      ),
      networkOptionComparisonGuardTestCoverage: containsAll(
        networkDraftTest,
        "source: 'construction_organization_plan_network_option_comparison_package'",
        'canAutoMaterializeSelectedOption: false',
        'writesTaskDependencies: false',
        'writesPlanDates: false',
      ),
      networkDomainWriterComparisonSourceBoundary: containsAll(
        networkDomainWriter,
        'function runtimeSourceBoundaryReasons',
        "'option_comparison_package_cannot_materialize_runtime'",
        "'manual_comparison_source_cannot_materialize_runtime'",
        'collectDraftSourceMarkers(draft)',
        'reasons.push(...runtimeSourceBoundaryReasons(draft))',
      ),
      networkDomainWriterComparisonGuardTestCoverage: containsAll(
        networkDomainWriterTest,
        'blocks option-comparison and manual-comparison packages even when a caller bypasses draft service gates',
        "source: 'construction_organization_plan_network_option_comparison_package'",
        "'option_comparison_package_cannot_materialize_runtime'",
        "'manual_comparison_source_cannot_materialize_runtime'",
        'expect(calls).toEqual([])',
      ),
      frontendDoesNotSynthesizeMissingOptionComparisonPackage: containsAll(
        frontendRuleAssetApi,
        'function buildMissingBackendOptionComparisonPackage',
        "'backend_option_comparison_package_missing_direct_failure'",
        "'frontend_does_not_synthesize_option_comparison_package'",
        "'backend_option_comparison_package_required'",
      ) && !frontendRuleAssetApi.includes('frontend_fallback_from_draft_read_model'),
      frontendMissingOptionComparisonPackageGuardTestCoverage: containsAll(
        frontendRuleAssetApiTest,
        'does not synthesize a frontend option-comparison package when the backend package is missing',
        "'backend_option_comparison_package_missing_direct_failure'",
        "'frontend_does_not_synthesize_option_comparison_package'",
        "'backend_option_comparison_package_required'",
        "expect(report.optionComparisonPackage.options).toHaveLength(0)",
      ),
      evidenceSourceGuardBlocksOptionComparisonSources: containsAll(
        evidenceSourceGuard,
        '/option[_-]?comparison/i',
        '/plan[_-]?option[_-]?comparison/i',
        'retired_or_low_information_default_master_plan_source',
      ),
      evidenceSourceGuardOptionComparisonTestCoverage: containsAll(
        evidenceSourceGuardTest,
        'treats construction organization option-comparison packages as read-only non-production sources',
        'construction_organization_plan_option_comparison_package',
        'construction_organization_plan_network_option_comparison_package',
        'retired_or_low_information_default_master_plan_source',
      ),
      evidenceSourceGuardNestedLineageCoverage: containsAll(
        evidenceSourceGuard,
        'defaultMasterPlanStructuredSourceSignals',
            "normalizedKey.includes('source')",
            "normalizedKey.includes('lineage')",
            "normalizedKey.includes('origin')",
            "normalizedKey.includes('template')",
      ) && containsAll(
        evidenceSourceGuardTest,
        'blocks retired sources hidden in source metadata, lineage, and template aliases',
        'templateSource',
        'originSource',
        'runtimeLineage',
        'sourceMetadata',
      ),
      evidenceSourceGuardGovernanceFieldCoverage: containsAll(
        evidenceSourceGuard,
        "normalizedKey.includes('basis')",
        "normalizedKey.includes('policy')",
        "normalizedKey.includes('reason')",
        "normalizedKey.includes('evidence')",
        "normalizedKey.includes('kind')",
        "normalizedKey.includes('type')",
        "normalizedKey.includes('status')",
        "normalizedKey.includes('review')",
        "normalizedKey.includes('handoff')",
        "normalizedKey.includes('proof')",
      ) && containsAll(
        evidenceSourceGuardTest,
        'blocks retired sources hidden in governance basis policy reason and evidence fields',
        'comparisonBasis',
        'boundaryPolicy',
        'decisionReasons',
        'reviewProof',
        'handoffEvidence',
      ),
      evidenceSourceManifestGovernanceFieldCoverage: containsAll(
        evidenceSourceManifestChecker,
        'function manifestRecordDefaultMasterPlanLabelBlockers',
        '...defaultMasterPlanStructuredSourceSignals(sourceRecord)',
        'SUPPORTED_SOURCE_MANIFEST_STRUCTURAL_DEFAULT_MASTER_PLAN_LABELS',
      ) && containsAll(
        evidenceSourceManifestCheckerTest,
        'blocks a source manifest record that hides retired sources in governance fields',
        'comparisonBasis',
        'boundaryPolicy',
        'reviewProof',
        'legacy_template_reverse_inference',
      ),
      candidateExportHygieneRootSourceGuardCoverage: containsAll(
        candidateExportHygiene,
        'defaultMasterPlanStructuredSourceSignals(payload)',
        'rootSourceGuard.blockers',
      ) && containsAll(
        candidateExportHygieneTest,
        'blocks candidate export hygiene when the selected candidate root hides retired source lineage',
        'comparisonBasis',
        'boundaryPolicy',
        'legacy_template_reverse_inference',
      ),
      serverDependencyWriterEvidenceFlowGovernanceFieldCoverage: containsAll(
        serverDependencyWriterEvidenceFlow,
        "normalizedKey.includes('basis')",
        "normalizedKey.includes('policy')",
        "normalizedKey.includes('reason')",
        "normalizedKey.includes('evidence')",
        "normalizedKey.includes('kind')",
        "normalizedKey.includes('type')",
        "normalizedKey.includes('status')",
        "normalizedKey.includes('review')",
        "normalizedKey.includes('handoff')",
        "normalizedKey.includes('proof')",
      ) && containsAll(
        serverDependencyWriterEvidenceFlowTest,
        'blocks default master-plan evidence when governance basis policy reason and evidence fields hide retired sources',
        'comparisonBasis',
        'boundaryPolicy',
        'decisionReasons',
        'reviewProof',
        'handoffEvidence',
      ),
      dependencyWriterEvidenceRootPayloadGovernanceFieldCoverage: containsAll(
        dependencyWriterEvidenceBuilder,
        'function extractDefaultMasterPlanSourceLabels',
        '...defaultMasterPlanStructuredSourceSignals(record)',
      ) && containsAll(
        dependencyWriterEvidenceBuilderTest,
        'blocks dependency writer evidence when writer result root hides retired sources in governance fields',
        'comparisonBasis',
        'boundaryPolicy',
        'reviewProof',
        'legacy_template_reverse_inference',
      ),
      sourceExportMetadataScansPayloadRowsForNestedSourceLineage: containsAll(
        sourceExportMetadata,
        'sourceExportPayloadSourceSignals',
        'sourceExportPayloadRows',
        'sourceExportPayloadRowSourceSignals',
        'SOURCE_EXPORT_ROW_ARRAY_KEYS',
        '...defaultMasterPlanStructuredSourceSignals(sourceSignalRecord)',
        'generationMetadata: record.generationMetadata',
        'sourceMetadata: record.sourceMetadata',
        "'samples'",
        "'task_dependencies'",
      ) && containsAll(
        durationCalibrationBuilderTest,
        'blocks duration calibration evidence when accepted samples hide retired source lineage',
        'duration_samples_retired_or_low_information_default_master_plan_source',
      ) && containsAll(
        postPublishSmokeBuilderTest,
        'blocks post-publish smoke rollback evidence when smoke files hide retired source lineage',
        'api_read_smoke_retired_or_low_information_default_master_plan_source',
      ),
      sourceExportMetadataGovernanceFieldCoverage: containsAll(
        sourceExportMetadataTest,
        'blocks source export rows that hide retired sources in governance fields',
        'comparisonBasis',
        'boundaryPolicy',
        'decisionReasons',
        'reviewProof',
        'handoffEvidence',
      ),
      sourceExportMetadataStagingRuntimeWriterBoundary: containsAll(
        sourceExportMetadata,
        'default_master_plan_staging_runtime_writer',
        'sourceExportSourceGuardBlockers',
      ) && containsAll(
        sourceExportMetadataTest,
        'allows staging runtime writer markers as supporting source export evidence',
        'default_master_plan_staging_runtime_writer',
        'duration_samples_unsupported_default_master_plan_source_label',
      ),
      productionPipelineRootPayloadGovernanceFieldCoverage: containsAll(
        productionEvidencePipeline,
        'function extractDefaultMasterPlanSourceLabels',
        '...defaultMasterPlanStructuredSourceSignals(writerRoot)',
      ) && containsAll(
        productionEvidencePipelineTest,
        'blocks source exports whose root payload hides retired sources in governance fields',
        'comparisonBasis',
        'boundaryPolicy',
        'reviewProof',
        'legacy_template_reverse_inference',
      ),
      productionSourceExporterRootPayloadGovernanceFieldCoverage: containsAll(
        productionSourceExporter,
        'function extractDefaultMasterPlanSourceLabels',
        '...defaultMasterPlanStructuredSourceSignals(record)',
      ) && containsAll(
        productionSourceExporterTest,
        'blocks source exports before DB access when writer result root hides retired sources in governance fields',
        'comparisonBasis',
        'boundaryPolicy',
        'reviewProof',
        'legacy_template_reverse_inference',
      ),
      runtimePublicationServiceDefaultMasterPlanLearningGateCoverage: containsAll(
        serverRuntimePublicationService,
        'DefaultMasterPlanRuntimeLineage',
        'defaultMasterPlanPublicationControlReasons',
        'duration_calibration_evidence_ref_required',
        'dependency_writer_evidence_ref_required',
        'defaultMasterPlanProjectScopeReasons',
        'project_scope_required_for_default_master_plan',
        'default_master_plan_project_id_mismatch',
      ) && containsAll(
        serverRuntimePublicationServiceTest,
        'persists default master-plan runtime publications without runtime PM approval evidence',
        'blocks default master-plan runtime publication when learned-asset publication controls are missing',
        'blocks default master-plan runtime publication when lineage project does not match the publication scope',
        'keeps default master-plan runtime publications non-consumable without a project scope',
      ),
      sourceExportMetadataScansRuntimePublicationAliases: containsAll(
        sourceExportMetadata,
        'SOURCE_EXPORT_ROW_ARRAY_KEYS',
        "'runtime_publications'",
        "'runtimePublications'",
      ) && containsAll(
        runtimePublicationBuilderTest,
        'blocks runtime publication evidence when camelCase runtimePublications rows hide retired source lineage',
        'runtime_publications_retired_or_low_information_default_master_plan_source',
      ),
      sourceExportMetadataIgnoresExportMetadataSourceNames: containsAll(
        sourceExportMetadata,
        'sourceExportPayloadRootSourceSignals',
        'delete payloadRoot.export_metadata',
        'delete payloadRoot.exportMetadata',
      ) && containsAll(
        sourceExportMetadataTest,
        'allows source export metadata source names without treating them as generation sources',
        'wbs_template_runtime_publications',
      ),
      runtimePublicationEvidenceAssetKindGuardCoverage: containsAll(
        runtimePublicationBuilder,
        'function rowAssetKind',
        'runtime_publication_asset_kind_default_master_plan_required',
      ) && containsAll(
        runtimePublicationBuilderTest,
        'blocks runtime publication evidence when the exported row asset kind is not default master-plan',
        'runtime_publication_asset_kind_default_master_plan_required',
      ),
      durationSampleGapPlannerCandidateBaselineSourceGuardCoverage: containsAll(
        durationSampleGapPlanner,
        'function candidateBaselineDefaultMasterPlanSourceBlockers',
        'defaultMasterPlanStructuredSourceSignals(payload)',
        'candidate_baseline_${blocker}',
      ) && containsAll(
        durationSampleGapPlannerTest,
        'blocks duration sample gap planning when the candidate baseline hides retired source lineage',
        'comparisonBasis',
        'boundaryPolicy',
        'legacy_template_reverse_inference',
      ),
      durationSampleCollectionGapPlanSourceGuardCoverage: containsAll(
        durationSampleCollectionPackage,
        'defaultMasterPlanStructuredSourceSignals(gapPlan)',
        'duration_gap_plan_${blocker}',
      ) && containsAll(
        durationSampleCollectionPackageTest,
        'blocks collection package when the duration gap plan root hides retired source lineage',
        'comparisonBasis',
        'boundaryPolicy',
        'legacy_template_reverse_inference',
      ),
      durationSampleCollectionProfileReportSourceGuardCoverage: containsAll(
        durationSampleCollectionPackage,
        'profileReportGovernanceSourceSignals(profileReportPayload)',
        'profile_report_${blocker}',
        'sourceGuards',
      ) && containsAll(
        durationSampleCollectionPackageTest,
        'blocks collection package when the profile report root hides retired source lineage',
        'does not treat profile review statuses as default master-plan source labels',
        'profile_report_retired_or_low_information_default_master_plan_source',
        'candidate_master_plan_reviewable',
        'ts_seed_fallback',
      ),
      runtimeMaterialPackageHandoffSourceGuardCoverage: containsAll(
        runtimeMaterialPackage,
        'defaultMasterPlanStructuredSourceSignals(handoffPayload)',
        'operator_handoff_${blocker}',
      ) && containsAll(
        runtimeMaterialPackageTest,
        'blocks runtime material package when the operator handoff root hides retired source lineage',
        'comparisonBasis',
        'boundaryPolicy',
        'legacy_template_reverse_inference',
      ),
      realProductionOutcomePackageRootSourceGuardCoverage: containsAll(
        realProductionOutcomePackage,
        'defaultMasterPlanStructuredSourceSignals(handoffPayload)',
        'defaultMasterPlanStructuredSourceSignals(runtimeMaterialPayload)',
        'operator_handoff_${blocker}',
        'runtime_material_package_${blocker}',
      ) && containsAll(
        realProductionOutcomePackageTest,
        'blocks real production outcome package when handoff root hides retired source lineage',
        'blocks real production outcome package when runtime material root hides retired source lineage',
        'comparisonBasis',
        'boundaryPolicy',
        'legacy_template_reverse_inference',
      ),
      operatorHandoffCandidateBaselineRootSourceGuardCoverage: containsAll(
        operatorHandoffBuilder,
        'function candidateBaselineOperatorHandoffQuality',
        'defaultMasterPlanStructuredSourceSignals(payload)',
        'payloadSourceGuard.blockers',
      ) && containsAll(
        operatorHandoffBuilderTest,
        'blocks operator handoff when candidate baseline root hides retired source lineage',
        'comparisonBasis',
        'boundaryPolicy',
        'legacy_template_reverse_inference',
      ),
      operatorHandoffSupportingPackageSourceGuardCoverage: containsAll(
        operatorHandoffBuilder,
        'function packageSourceBlockers',
        'defaultMasterPlanStructuredSourceSignals(payload)',
        'rows.flatMap(defaultMasterPlanRowSourceSignals)',
        'offline_development_quality_review_package',
        'duration_sample_collection_package',
        'runtime_material_package',
        'real_production_outcome_package',
      ) && containsAll(
        operatorHandoffBuilderTest,
        'keeps retired lineage in offline review package as a non-runtime quality finding',
        'blocks operator handoff when existing duration sample collection package hides retired source lineage',
        'blocks operator handoff when existing runtime material package hides retired source lineage',
        'blocks operator handoff when existing real production outcome package hides retired source lineage',
        'manual_comparison_scenario',
        'legacy_template_reverse_inference',
      ),
      operatorHandoffPreflightDurationSampleProfileReportContractCoverage: containsAll(
        operatorHandoffPreflight,
        'durationSampleCollectionPackageCommand',
        "['--profile-report', 'profile_report']",
        'duration_sample_collection_package',
      ) && containsAll(
        operatorHandoffPreflightTest,
        'blocks duration sample collection package build when profile report binding is missing',
        'duration_sample_collection_package_profile_report_missing',
        '--profile-report project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json',
      ),
      candidateDiscoveryScansBaselineItemSourceMetadata: containsAll(
        candidateDiscovery,
        'async function candidateItemSourceGuard',
        'SELECT generation_metadata',
        'summarizeCandidateItemSourceRow',
        'defaultMasterPlanCandidateQualityBlockers',
      ) && containsAll(
        candidateDiscoveryTest,
        'fails closed when baseline items hide option-comparison package markers',
        'construction_organization_plan_option_comparison_package',
        'construction_organization_plan_network_option_comparison_package',
      ),
      candidateDiscoveryProfileLineageNormalizationCoverage: containsAll(
        candidateDiscovery,
        'ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS',
        'MANAGED_FRONTIER_SOURCE_LABEL',
        'profileSourceType',
      ) && containsAll(
        candidateDiscoveryTest,
        'does not disqualify managed-frontier baselines whose item source is allowed profile lineage',
        'business_type_base_master_plan_profile_v1',
        'business_type_master_plan_profile_v1',
      ),
    },
  }
}

function buildGateResults({
  businessTypes,
  legacySerialRemoval,
  runtimeSourceExportProvenance,
  runtimeSeedEvidencePipeline,
  durationSampleCollectionPackage,
  durationCalibrationEvidence,
  dependencyWriterEvidence,
  runtimePublicationEvidence,
  postPublishSmokeRollbackEvidence,
  runtimeEvidenceLineageConsistency,
}) {
  const businessTypeCodes = new Set(businessTypes.map((item) => item.businessType))
  const missingBusinessTypes = ALL_BUSINESS_TYPES.filter((code) => !businessTypeCodes.has(code))
  const shapeGaps = businessTypes.flatMap((item) => item.shapeGaps.map((gap) => ({
    businessType: item.businessType,
    gap,
  })))
  const allReviewable = missingBusinessTypes.length === 0
    && shapeGaps.length === 0
    && businessTypes.every((item) => item.reviewStatus === 'candidate_master_plan_reviewable')
  return [
    {
      id: 'legacy_serial_template_path_removed',
      tier: 'local_static',
      status: legacySerialRemoval.status,
      evidence: legacySerialRemoval,
      productionReadyRequirement: 'No low-info template draft, old-template reverse derivation, or manual comparison path may fall back to serial template expansion or managed default-plan handoff; old scenarios must fail directly unless an explicit default master-plan entry template is selected.',
    },
    {
      id: 'candidate_master_plan_shape_11_business_types',
      tier: 'local_static',
      status: allReviewable ? 'pass' : 'fail',
      evidence: {
        expectedBusinessTypes: ALL_BUSINESS_TYPES,
        observedBusinessTypes: [...businessTypeCodes],
        missingBusinessTypes,
        shapeGaps,
      },
      productionReadyRequirement: 'All 11 business types must produce bounded, field-reviewable candidate master-plan rows before production promotion can be considered.',
    },
    runtimeSourceExportProvenance.status === 'pass'
      ? {
          id: 'runtime_source_export_provenance',
          tier: 'runtime_source_export',
          status: 'pass',
          evidence: runtimeSourceExportProvenance.evidence,
          productionReadyRequirement: 'Runtime evidence must be backed by a source export manifest with a single export session and immutable source records.',
        }
      : {
          id: 'runtime_source_export_provenance',
          tier: 'runtime_source_export',
          status: 'blocked',
          blockers: runtimeSourceExportProvenance.blockers,
          productionReadyRequirement: 'Runtime evidence must be backed by a source export manifest with a single export session and immutable source records.',
        },
    runtimeSeedEvidencePipeline.status === 'not_provided'
      ? null
      : runtimeSeedEvidencePipeline.status === 'pass'
        ? {
            id: 'runtime_seed_and_reference_days_evidence',
            tier: 'runtime_evidence',
            status: 'pass',
            evidence: runtimeSeedEvidencePipeline.evidence,
            productionReadyRequirement: 'Active runtime standard duration and T2 seed evidence plus runtime-calibrated reference days must be closed before runtime calibration or publication can be trusted.',
          }
        : {
            id: 'runtime_seed_and_reference_days_evidence',
            tier: 'runtime_evidence',
            status: 'blocked',
            blockers: runtimeSeedEvidencePipeline.blockers,
            evidence: runtimeSeedEvidencePipeline.evidence,
            productionReadyRequirement: 'Active runtime standard duration and T2 seed evidence plus runtime-calibrated reference days must be closed before runtime calibration or publication can be trusted.',
          },
    durationSampleCollectionPackage.status === 'pass'
      ? {
          id: 'duration_sample_collection_package',
          tier: 'runtime_evidence',
          status: 'pass',
          evidence: durationSampleCollectionPackage.evidence,
          productionReadyRequirement: 'Known duration sample collection gaps must be cleared before runtime calibration can be treated as complete.',
        }
      : {
          id: 'duration_sample_collection_package',
          tier: 'runtime_evidence',
          status: 'blocked',
          blockers: durationSampleCollectionPackage.blockers,
          evidence: durationSampleCollectionPackage.evidence,
          productionReadyRequirement: 'Known duration sample collection gaps must be cleared before runtime calibration can be treated as complete.',
        },
    durationCalibrationEvidence.status === 'pass'
      ? {
          id: 'runtime_duration_calibration_evidence',
          tier: 'runtime_evidence',
          status: 'pass',
          evidence: durationCalibrationEvidence.evidence,
          productionReadyRequirement: 'Reference days must be calibrated from accepted real project outcomes, not only cold-start seeds.',
        }
      : {
          id: 'runtime_duration_calibration_evidence',
          tier: 'runtime_evidence',
          status: 'blocked',
          blockers: durationCalibrationEvidence.blockers,
          productionReadyRequirement: 'Reference days must be calibrated from accepted real project outcomes, not only cold-start seeds.',
        },
    dependencyWriterEvidence.status === 'pass'
      ? {
          id: 'production_dependency_writer_evidence',
          tier: 'runtime_writer',
          status: 'pass',
          evidence: dependencyWriterEvidence.evidence,
          productionReadyRequirement: 'Production dependencies must be written by a controlled domain writer with rollback-safe lineage and critical-path readback.',
        }
      : {
          id: 'production_dependency_writer_evidence',
          tier: 'runtime_writer',
          status: 'blocked',
          blockers: dependencyWriterEvidence.blockers,
          productionReadyRequirement: 'Production dependencies must be written by a controlled domain writer with rollback-safe lineage and critical-path readback.',
        },
    runtimePublicationEvidence.status === 'pass'
      ? {
          id: 'runtime_publication_evidence',
          tier: 'runtime_publication',
          status: 'pass',
          evidence: runtimePublicationEvidence.evidence,
          productionReadyRequirement: 'The plan asset must be published through the governed runtime publication layer.',
        }
      : {
          id: 'runtime_publication_evidence',
          tier: 'runtime_publication',
          status: 'blocked',
          blockers: runtimePublicationEvidence.blockers,
          productionReadyRequirement: 'The plan asset must be published through the governed runtime publication layer.',
        },
    postPublishSmokeRollbackEvidence.status === 'pass'
      ? {
          id: 'post_publish_smoke_and_rollback_evidence',
          tier: 'live_or_staging_smoke',
          status: 'pass',
          evidence: postPublishSmokeRollbackEvidence.evidence,
          productionReadyRequirement: 'A published plan must be readable and revertible in a real target environment before production-ready can be claimed.',
        }
      : {
          id: 'post_publish_smoke_and_rollback_evidence',
          tier: 'live_or_staging_smoke',
          status: 'blocked',
          blockers: postPublishSmokeRollbackEvidence.blockers,
          productionReadyRequirement: 'A published plan must be readable and revertible in a real target environment before production-ready can be claimed.',
        },
    runtimeEvidenceLineageConsistency.status === 'pass'
      ? {
          id: 'runtime_evidence_lineage_consistency',
          tier: 'runtime_lineage',
          status: 'pass',
          evidence: runtimeEvidenceLineageConsistency.evidence,
          productionReadyRequirement: 'Duration calibration, dependency writer, runtime publication, and smoke evidence must describe the same baseline, project, publication, release target, and rollback target.',
        }
      : {
          id: 'runtime_evidence_lineage_consistency',
          tier: 'runtime_lineage',
          status: 'blocked',
          blockers: runtimeEvidenceLineageConsistency.blockers,
          productionReadyRequirement: 'Duration calibration, dependency writer, runtime publication, and smoke evidence must describe the same baseline, project, publication, release target, and rollback target.',
        },
  ].filter(Boolean)
}

function buildProductionReadinessGate({ productionReady, productionReadinessBlockers, evidenceQualification }) {
  return {
    id: 'production_readiness',
    tier: 'production_or_live_outcome',
    status: productionReady ? 'pass' : 'blocked',
    ...(productionReady
      ? {
          evidence: {
            status: evidenceQualification.status,
            productionReadyAllowed: evidenceQualification.productionReadyAllowed,
          },
        }
      : {
          blockers: productionReadinessBlockers,
        }),
    productionReadyRequirement: 'The runtime evidence chain must come from production/live outcome evidence, not staging controlled replay or non-production material.',
  }
}

function buildGateSummary(gates) {
  const total = Array.isArray(gates) ? gates.length : 0
  const pass = gates.filter((gate) => gate.status === 'pass').length
  const blocked = gates.filter((gate) => gate.status === 'blocked').length
  const fail = gates.filter((gate) => gate.status === 'fail').length
  return {
    total,
    pass,
    blocked,
    fail,
    completionRate: total > 0
      ? Number(((pass / total) * 100).toFixed(1))
      : 0,
  }
}

function buildMarkdown(report) {
  const lines = []
  lines.push('# Default Master Plan Production Readiness')
  lines.push('')
  lines.push(`Generated: ${report.generatedAt}`)
  lines.push('')
  lines.push(`Status: ${report.status}`)
  lines.push(`Production ready: ${report.productionReady ? 'yes' : 'no'}`)
  lines.push(`Runtime evidence chain passed: ${report.runtimeEvidenceChainPassed ? 'yes' : 'no'}`)
  lines.push(`Current level: ${report.currentEvidenceLevel}`)
  lines.push(`Required level: ${report.requiredEvidenceLevel}`)
  if (report.gateSummary) {
    lines.push(`Gate completion: ${report.gateSummary.pass}/${report.gateSummary.total} (${report.gateSummary.completionRate}%)`)
    lines.push(`Gate blockers: blocked=${report.gateSummary.blocked}, fail=${report.gateSummary.fail}`)
  }
  if (Array.isArray(report.productionReadinessBlockers) && report.productionReadinessBlockers.length > 0) {
    lines.push(`Production readiness blockers: ${report.productionReadinessBlockers.join(', ')}`)
  }
  lines.push('')
  lines.push('## Gate Summary')
  lines.push('')
  lines.push('| Gate | Tier | Status |')
  lines.push('|---|---|---|')
  for (const gate of report.gates) {
    lines.push(`| ${gate.id} | ${gate.tier} | ${gate.status} |`)
  }
  lines.push('')
  lines.push('## Business Type Shape Evidence')
  lines.push('')
  lines.push('| Business type | Mode | Schedule rows | Review status | Evidence level |')
  lines.push('|---|---|---:|---|---|')
  for (const item of report.businessTypes) {
    lines.push(`| ${item.businessType} | ${item.generationMode} | ${item.scheduleRowCount} | ${item.reviewStatus} | ${item.evidenceLevel} |`)
  }
  lines.push('')
  lines.push('## Blockers')
  lines.push('')
  for (const gate of report.gates.filter((item) => item.status === 'blocked' || item.status === 'fail')) {
    lines.push(`- ${gate.id}: ${(gate.blockers ?? gate.evidence?.gaps ?? []).join('; ') || gate.productionReadyRequirement}`)
  }
  for (const blocker of report.productionReadinessBlockers ?? []) {
    lines.push(`- production_readiness: ${blocker}`)
  }
  lines.push('')
  lines.push('Mutation boundary: this checker reads local reports and source files only. It does not write production tasks, task_dependencies, confirmed baselines, monthly plans, critical path facts, production seeds, or runtime publications.')
  lines.push('')
  return `${lines.join('\n')}\n`
}

const args = await applyDefaultRuntimeEvidencePaths(parseArgs(process.argv.slice(2)))
const [
  profileReport,
  residentialMarkdown,
  legacySerialRemoval,
  rawReviewEvidence,
  rawRuntimeSeedEvidencePipeline,
  rawDurationSampleCollectionPackage,
  rawDurationSampleCoverageEvidence,
  rawDurationCalibrationEvidence,
  rawDependencyWriterEvidence,
  rawRuntimePublicationEvidence,
  rawPostPublishSmokeRollbackEvidence,
  rawSourceManifest,
] = await Promise.all([
  readJson(args.profileReport),
  readTextIfExists(args.residentialReport),
  checkLegacySerialRemoval(),
  readReviewEvidence(args.reviewEvidence),
  readRuntimeSeedEvidencePipeline(args.runtimeSeedEvidencePipeline),
  readDurationSampleCollectionPackage(args.durationSampleCollectionPackage),
  readDurationSampleCoverageEvidence(args.durationSampleCoverageEvidence),
  readDurationCalibrationEvidence(args.durationCalibrationEvidence),
  readDependencyWriterEvidence(args.dependencyWriterEvidence),
  readRuntimePublicationEvidence(args.runtimePublicationEvidence),
  readPostPublishSmokeRollbackEvidence(args.postPublishSmokeRollbackEvidence),
  readSourceManifest(args.sourceManifest),
])

const businessTypes = [
  parseResidentialSummary(residentialMarkdown, args.residentialReport),
  ...(Array.isArray(profileReport.businessTypes)
    ? profileReport.businessTypes.map((item) => normalizeNonResidentialSummary(item, args.profileReport))
    : []),
]
const offlineDevelopmentQualityReview = evaluateOfflineDevelopmentQualityReview(rawReviewEvidence, args.reviewEvidence)
const runtimeSeedEvidencePipeline = evaluateRuntimeSeedEvidencePipeline(rawRuntimeSeedEvidencePipeline, args.runtimeSeedEvidencePipeline)
const durationSampleCoverageEvidence = evaluateDurationSampleCoverageEvidence(
  rawDurationSampleCoverageEvidence,
  args.durationSampleCoverageEvidence,
  rawDurationSampleCollectionPackage,
)
const durationSampleCollectionPackage = evaluateDurationSampleCollectionPackage(
  rawDurationSampleCollectionPackage,
  args.durationSampleCollectionPackage,
  durationSampleCoverageEvidence,
)
const durationCalibrationEvidence = evaluateDurationCalibrationEvidence(rawDurationCalibrationEvidence, args.durationCalibrationEvidence)
const dependencyWriterEvidence = evaluateDependencyWriterEvidence(rawDependencyWriterEvidence, args.dependencyWriterEvidence)
const runtimePublicationEvidence = evaluateRuntimePublicationEvidence(rawRuntimePublicationEvidence, args.runtimePublicationEvidence)
const postPublishSmokeRollbackEvidence = evaluatePostPublishSmokeRollbackEvidence(rawPostPublishSmokeRollbackEvidence, args.postPublishSmokeRollbackEvidence)
const runtimeEvidenceLineageConsistency = evaluateRuntimeEvidenceLineageConsistency({
  durationCalibrationEvidence,
  dependencyWriterEvidence,
  runtimePublicationEvidence,
  postPublishSmokeRollbackEvidence,
})
const runtimeSourceExportProvenance = evaluateRuntimeSourceExportProvenance(rawSourceManifest, args.sourceManifest, args, {
  durationCalibrationEvidence,
  dependencyWriterEvidence,
  runtimePublicationEvidence,
  postPublishSmokeRollbackEvidence,
}, runtimeEvidenceLineageConsistency)
const evidenceGates = buildGateResults({
  businessTypes,
  legacySerialRemoval,
  runtimeSourceExportProvenance,
  runtimeSeedEvidencePipeline,
  durationSampleCollectionPackage,
  durationCalibrationEvidence,
  dependencyWriterEvidence,
  runtimePublicationEvidence,
  postPublishSmokeRollbackEvidence,
  runtimeEvidenceLineageConsistency,
})
const evidenceFailingGateCount = evidenceGates.filter((gate) => gate.status === 'fail').length
const evidenceBlockedGateCount = evidenceGates.filter((gate) => gate.status === 'blocked').length
const runtimeEvidenceChainPassed = evidenceFailingGateCount === 0 && evidenceBlockedGateCount === 0
const productionReadinessQualification = buildProductionReadinessQualification([
  { label: 'runtimeSeedEvidencePipeline', value: rawRuntimeSeedEvidencePipeline },
  { label: 'durationSampleCollectionPackage', value: rawDurationSampleCollectionPackage },
  { label: 'durationSampleCoverageEvidence', value: rawDurationSampleCoverageEvidence },
  { label: 'durationCalibrationEvidence', value: rawDurationCalibrationEvidence },
  { label: 'dependencyWriterEvidence', value: rawDependencyWriterEvidence },
  { label: 'runtimePublicationEvidence', value: rawRuntimePublicationEvidence },
  { label: 'postPublishSmokeRollbackEvidence', value: rawPostPublishSmokeRollbackEvidence },
  { label: 'sourceManifest', value: rawSourceManifest },
])
const productionReadinessBlockers = runtimeEvidenceChainPassed
  ? productionReadinessQualification.blockers
  : []
const productionReady = runtimeEvidenceChainPassed && productionReadinessBlockers.length === 0
const productionReadinessGate = buildProductionReadinessGate({
  productionReady,
  productionReadinessBlockers,
  evidenceQualification: productionReadinessQualification,
})
const candidateEvidenceLevel = businessTypes.some((item) => item.evidenceLevel === 'candidate_asset_backed_l1')
  ? 'candidate_asset_backed_l1'
  : 'candidate_cold_start_l1'
const gates = [
  ...evidenceGates,
  ...(runtimeEvidenceChainPassed ? [productionReadinessGate] : []),
]
const gateSummary = buildGateSummary(gates)
const failingGateCount = gateSummary.fail
const blockedGateCount = gateSummary.blocked
const reportStatus = failingGateCount > 0
  ? 'fail'
  : evidenceBlockedGateCount > 0
    ? 'blocked'
    : productionReadinessBlockers.length > 0
      ? 'staging_runtime_chain_passed'
      : 'pass'
const report = {
  schemaVersion: 'workbuddy-default-master-plan-production-readiness/v1',
  generatedAt: new Date().toISOString(),
  source: 'check-default-master-plan-production-readiness',
  status: reportStatus,
  productionReady,
  runtimeEvidenceChainPassed,
  productionReadinessBlockers,
  evidenceQualification: productionReadinessQualification,
  currentEvidenceLevel: productionReady
    ? 'runtime_published_and_rollback_verified'
    : runtimeEvidenceChainPassed && productionReadinessBlockers.length > 0
      ? 'staging_controlled_replay_runtime_chain'
      : candidateEvidenceLevel,
  requiredEvidenceLevel: 'runtime_published_and_rollback_verified',
  offlineDevelopmentQualityReview,
  mutationBoundary: {
    readsLocalReports: true,
    readsSourceFiles: true,
    writesProductionTables: false,
    writesTasks: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
  },
  inputs: {
    profileReport: repoRelative(args.profileReport),
    residentialReport: repoRelative(args.residentialReport),
    ...(args.reviewEvidence ? { offlineDevelopmentQualityReview: repoRelative(args.reviewEvidence) } : {}),
    ...(args.runtimeSeedEvidencePipeline ? { runtimeSeedEvidencePipeline: repoRelative(args.runtimeSeedEvidencePipeline) } : {}),
    ...(args.durationSampleCollectionPackage ? { durationSampleCollectionPackage: repoRelative(args.durationSampleCollectionPackage) } : {}),
    ...(args.durationSampleCoverageEvidence ? { durationSampleCoverageEvidence: repoRelative(args.durationSampleCoverageEvidence) } : {}),
    ...(args.durationCalibrationEvidence ? { durationCalibrationEvidence: repoRelative(args.durationCalibrationEvidence) } : {}),
    ...(args.dependencyWriterEvidence ? { dependencyWriterEvidence: repoRelative(args.dependencyWriterEvidence) } : {}),
    ...(args.runtimePublicationEvidence ? { runtimePublicationEvidence: repoRelative(args.runtimePublicationEvidence) } : {}),
    ...(args.postPublishSmokeRollbackEvidence ? { postPublishSmokeRollbackEvidence: repoRelative(args.postPublishSmokeRollbackEvidence) } : {}),
    ...(args.sourceManifest ? { sourceManifest: repoRelative(args.sourceManifest) } : {}),
  },
  businessTypeCount: businessTypes.length,
  businessTypes,
  gateSummary,
  gates,
}

await fs.mkdir(args.outputRoot, { recursive: true })
const jsonPath = path.join(args.outputRoot, 'readiness.json')
const mdPath = path.join(args.outputRoot, 'readiness.md')
await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
await fs.writeFile(mdPath, buildMarkdown(report), 'utf8')

console.log(JSON.stringify({
  status: report.status,
  productionReady: report.productionReady,
  outputRoot: repoRelative(args.outputRoot),
  jsonPath: repoRelative(jsonPath),
  markdownPath: repoRelative(mdPath),
  businessTypeCount: report.businessTypeCount,
  gateSummary,
  completionRate: gateSummary.completionRate,
  failingGateCount,
  blockedGateCount,
}, null, 2))

if (failingGateCount > 0 || (args.failOnNotReady && report.status !== 'pass')) {
  process.exitCode = 1
}
