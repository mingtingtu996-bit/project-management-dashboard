#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultMasterPlanRowSourceSignals,
  defaultMasterPlanCandidateQualityBlockers,
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_PROFILE_REPORT = path.join(DEFAULT_PROFILE_REPORT_ROOT, 'default-master-plan-profile-samples.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'operator-handoff.json')
const REVIEW_EVIDENCE_FILE = 'pm-review-evidence.json'
const REVIEW_PACKAGE_FILE = 'pm-review-package.json'
const REVIEW_RECORD_PREFLIGHT_FILE = 'pm-review-record-preflight.json'
const CANDIDATE_EXPORT_HYGIENE_FILE = 'candidate-export-hygiene.json'
const CANDIDATE_REFRESH_PACKAGE_FILE = 'candidate-refresh-package.json'
const DURATION_ASSET_UTILIZATION_REPORT_FILE = 'duration-asset-utilization-report.json'
const CANDIDATE_REFRESH_EXECUTION_PREFLIGHT_FILE = 'candidate-refresh-execution-preflight.json'
const CANDIDATE_REFRESH_EXECUTION_FILE = 'candidate-refresh-execution.json'
const CANDIDATE_REFRESH_AUTHORIZATION_PACKAGE_FILE = 'candidate-refresh-authorization-package.json'
const CANDIDATE_REFRESH_AUTHORIZATION_TEMPLATE_FILE = 'candidate-refresh-authorization.operator-fill-template.json'
const CANDIDATE_REFRESH_EXECUTION_READINESS_SEAL_FILE = 'candidate-refresh-execution-readiness-seal.json'
const CANDIDATE_BASELINE_MATERIALIZATION_FILE = 'candidate-baseline-materialization.json'
const CANDIDATE_BASELINE_MATERIALIZATION_READINESS_SEAL_FILE = 'candidate-baseline-materialization-readiness-seal.json'
const RUNTIME_SEED_EVIDENCE_PIPELINE_FILE = 'runtime-seed-evidence-pipeline.json'
const RUNTIME_SEED_IMPORT_GATE_FILE = 'runtime-seed-import-gate.json'
const RUNTIME_SEED_IMPORT_EXECUTION_FILE = 'runtime-seed-import-execution.json'
const RUNTIME_SEED_IMPORT_READINESS_SEAL_FILE = 'runtime-seed-import-readiness-seal.json'
const RUNTIME_CANDIDATE_ALIGNMENT_PREFLIGHT_FILE = 'runtime-candidate-alignment-preflight.json'
const RUNTIME_TASK_ALIGNMENT_REFRESH_PACKAGE_FILE = 'runtime-task-alignment-refresh-package.json'
const RUNTIME_TASK_ALIGNMENT_REVIEW_EVIDENCE_FILE = 'runtime-task-alignment-review-evidence.json'
const RUNTIME_TASK_ALIGNMENT_REVIEW_DECISIONS_FILE = 'runtime-task-alignment-review-decisions.json'
const DEFAULT_RUNTIME_SEED_IMPORT_EXECUTION = path.join(DEFAULT_PROFILE_REPORT_ROOT, RUNTIME_SEED_IMPORT_EXECUTION_FILE)
const DURATION_SAMPLE_COLLECTION_PACKAGE_FILE = 'duration-sample-collection-package.json'
const DURATION_SAMPLE_COVERAGE_EVIDENCE_FILE = 'duration-sample-coverage-evidence.json'
const DURATION_CALIBRATION_EVIDENCE_FILE = 'duration-calibration-evidence.json'
const RUNTIME_MATERIAL_PACKAGE_FILE = 'runtime-material-package.json'
const REAL_PRODUCTION_OUTCOME_PACKAGE_FILE = 'real-production-outcome-package.json'
const STAGING_AUTHORIZATION_FILE = path.join('staging-runtime', 'staging-authorization.json')
const DEFAULT_DURATION_SAMPLES_EXPORT = 'project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json'
const DEFAULT_RAW_COMPLETED_TASKS_EXPORT = 'project-testing/reports/default-master-plan-production-readiness/source-exports/raw-completed-tasks.json'
const DEFAULT_COMPLETED_TASK_EXPORT = 'project-testing/reports/default-master-plan-production-readiness/source-exports/completed-task-export.json'
const COMPLETED_TASK_EXPORT_REPORT_FILE = path.join('source-exports', 'completed-task-export.report.json')
const SOURCE_EXPORTS_MANIFEST_FILE = path.join('source-exports', 'source-exports-manifest.json')
const DEFAULT_REAL_DURATION_SAMPLE_MATERIAL = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json'
const DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_TEMPLATE = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.template.json'
const DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit.json'
const DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT_PREFLIGHT = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json'
const DEFAULT_REAL_EVIDENCE_GAP_SUMMARY = 'project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.json'
const DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_PREFLIGHT = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material-preflight.json'
const CANONICAL_REPORT_FILES = {
  discovery: 'candidate-discovery.json',
  readiness: 'readiness.json',
  evidenceBundle: 'evidence-bundle.json',
  durationGapPlan: 'duration-sample-gap-plan-school.json',
}
const EVIDENCE_ARG_FLAGS = [
  ['durationSampleCoverageEvidence', '--duration-sample-coverage-evidence'],
  ['durationCalibrationEvidence', '--duration-calibration-evidence'],
  ['dependencyWriterEvidence', '--dependency-writer-evidence'],
  ['runtimePublicationEvidence', '--runtime-publication-evidence'],
  ['postPublishSmokeRollbackEvidence', '--post-publish-smoke-rollback-evidence'],
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateBaseline: '',
    durationGapPlan: '',
    discovery: '',
    readiness: '',
    evidenceBundle: '',
    output: DEFAULT_OUTPUT,
    environment: 'staging',
    exportedBy: '',
    publicationKey: '',
    reviewEvidence: '',
    durationCalibrationEvidence: '',
    reviewPackage: '',
    reviewRecordPreflight: '',
    candidateHygiene: '',
    candidateRefreshPackage: '',
    durationAssetUtilization: '',
    candidateRefreshExecution: '',
    candidateRefreshAuthorizationPackage: '',
    candidateBaselineMaterialization: '',
    runtimeSeedEvidencePipeline: '',
    runtimeSeedImportExecution: '',
    completedTaskExportReport: '',
    runtimeCandidateAlignmentPreflight: '',
    runtimeTaskAlignmentRefreshPackage: '',
    runtimeTaskAlignmentReviewEvidence: '',
    durationSampleCollectionPackage: '',
    durationSampleCoverageEvidence: '',
    runtimeMaterialPackage: '',
    realProductionOutcomePackage: '',
    stagingAuthorization: '',
    writerResult: '',
    criticalPathReadback: '',
    apiReadSmoke: '',
    uiConsumptionSmoke: '',
    rollbackVerification: '',
    realProductionOutcome: '',
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--candidate-baseline') {
      options.candidateBaseline = path.resolve(nextValue())
    } else if (arg === '--duration-gap-plan') {
      options.durationGapPlan = path.resolve(nextValue())
    } else if (arg === '--discovery') {
      options.discovery = path.resolve(nextValue())
    } else if (arg === '--readiness') {
      options.readiness = path.resolve(nextValue())
    } else if (arg === '--evidence-bundle') {
      options.evidenceBundle = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--publication-key') {
      options.publicationKey = nextValue()
    } else if (arg === '--review-evidence') {
      options.reviewEvidence = path.resolve(nextValue())
    } else if (arg === '--duration-calibration-evidence') {
      options.durationCalibrationEvidence = path.resolve(nextValue())
    } else if (arg === '--review-package') {
      options.reviewPackage = path.resolve(nextValue())
    } else if (arg === '--review-record-preflight') {
      options.reviewRecordPreflight = path.resolve(nextValue())
    } else if (arg === '--candidate-hygiene') {
      options.candidateHygiene = path.resolve(nextValue())
    } else if (arg === '--candidate-refresh-package') {
      options.candidateRefreshPackage = path.resolve(nextValue())
    } else if (arg === '--duration-asset-utilization') {
      options.durationAssetUtilization = path.resolve(nextValue())
    } else if (arg === '--candidate-refresh-execution') {
      options.candidateRefreshExecution = path.resolve(nextValue())
    } else if (arg === '--candidate-refresh-authorization-package') {
      options.candidateRefreshAuthorizationPackage = path.resolve(nextValue())
    } else if (arg === '--candidate-baseline-materialization') {
      options.candidateBaselineMaterialization = path.resolve(nextValue())
    } else if (arg === '--runtime-seed-evidence-pipeline') {
      options.runtimeSeedEvidencePipeline = path.resolve(nextValue())
    } else if (arg === '--runtime-seed-import-execution') {
      options.runtimeSeedImportExecution = path.resolve(nextValue())
    } else if (arg === '--completed-task-export-report') {
      options.completedTaskExportReport = path.resolve(nextValue())
    } else if (arg === '--runtime-candidate-alignment-preflight') {
      options.runtimeCandidateAlignmentPreflight = path.resolve(nextValue())
    } else if (arg === '--runtime-task-alignment-refresh-package') {
      options.runtimeTaskAlignmentRefreshPackage = path.resolve(nextValue())
    } else if (arg === '--runtime-task-alignment-review-evidence') {
      options.runtimeTaskAlignmentReviewEvidence = path.resolve(nextValue())
    } else if (arg === '--duration-sample-collection-package') {
      options.durationSampleCollectionPackage = path.resolve(nextValue())
    } else if (arg === '--duration-sample-coverage-evidence') {
      options.durationSampleCoverageEvidence = path.resolve(nextValue())
    } else if (arg === '--runtime-material-package') {
      options.runtimeMaterialPackage = path.resolve(nextValue())
    } else if (arg === '--real-production-outcome-package') {
      options.realProductionOutcomePackage = path.resolve(nextValue())
    } else if (arg === '--staging-authorization') {
      options.stagingAuthorization = path.resolve(nextValue())
    } else if (arg === '--writer-result') {
      options.writerResult = nextValue()
    } else if (arg === '--critical-path-readback') {
      options.criticalPathReadback = nextValue()
    } else if (arg === '--api-read-smoke') {
      options.apiReadSmoke = nextValue()
    } else if (arg === '--ui-consumption-smoke') {
      options.uiConsumptionSmoke = nextValue()
    } else if (arg === '--rollback-verification') {
      options.rollbackVerification = nextValue()
    } else if (arg === '--real-production-outcome') {
      options.realProductionOutcome = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanProductionOperatorHandoff({
  candidateBaseline,
  durationGapPlan,
  discovery,
  readiness,
  evidenceBundle,
  output = DEFAULT_OUTPUT,
  environment = 'staging',
  exportedBy = '',
  publicationKey = '',
  reviewEvidence = '',
  durationCalibrationEvidence = '',
  reviewPackage = '',
  reviewRecordPreflight = '',
  candidateHygiene = '',
  candidateRefreshPackage = '',
  durationAssetUtilization = '',
  candidateRefreshExecution = '',
  candidateRefreshAuthorizationPackage = '',
  candidateBaselineMaterialization = '',
  runtimeSeedEvidencePipeline = '',
  runtimeSeedImportExecution = '',
  completedTaskExportReport = '',
  runtimeCandidateAlignmentPreflight = '',
  runtimeTaskAlignmentRefreshPackage = '',
  runtimeTaskAlignmentReviewEvidence = '',
  durationSampleCollectionPackage = '',
  durationSampleCoverageEvidence: durationSampleCoverageEvidencePath = '',
  runtimeMaterialPackage = '',
  realProductionOutcomePackage = '',
  stagingAuthorization = '',
  writerResult = '',
  criticalPathReadback = '',
  apiReadSmoke = '',
  uiConsumptionSmoke = '',
  rollbackVerification = '',
  realProductionOutcome = '',
  now = new Date(),
} = {}) {
  const paths = await resolveOperatorHandoffArtifactPaths({
    candidateBaseline,
    durationGapPlan,
    discovery,
    readiness,
    evidenceBundle,
    output,
    reviewEvidence,
    reviewPackage,
    reviewRecordPreflight,
    candidateHygiene,
    candidateRefreshPackage,
    durationAssetUtilization,
    durationCalibrationEvidence,
    candidateRefreshExecution,
    candidateRefreshAuthorizationPackage,
    candidateBaselineMaterialization,
    runtimeSeedEvidencePipeline,
    runtimeSeedImportExecution,
    completedTaskExportReport,
    runtimeCandidateAlignmentPreflight,
    runtimeTaskAlignmentRefreshPackage,
    runtimeTaskAlignmentReviewEvidence,
    durationSampleCollectionPackage,
    durationSampleCoverageEvidence: durationSampleCoverageEvidencePath,
    runtimeMaterialPackage,
    realProductionOutcomePackage,
    stagingAuthorization,
  })
  const payloads = {
    candidateBaseline: await readJsonIfPresent(paths.candidateBaseline),
    durationGapPlan: await readJsonIfPresent(paths.durationGapPlan),
    discovery: await readJsonIfPresent(paths.discovery),
    readiness: await readJsonIfPresent(paths.readiness),
    evidenceBundle: await readJsonIfPresent(paths.evidenceBundle),
    reviewEvidence: await readJsonIfPresent(paths.reviewEvidence),
    reviewPackage: await readJsonIfPresent(paths.reviewPackage),
    reviewRecordPreflight: await readJsonIfPresent(paths.reviewRecordPreflight),
    candidateHygiene: await readJsonIfPresent(paths.candidateHygiene),
    candidateRefreshPackage: await readJsonIfPresent(paths.candidateRefreshPackage),
    durationAssetUtilization: await readJsonIfPresent(paths.durationAssetUtilization),
    durationCalibrationEvidence: await readJsonIfPresent(paths.durationCalibrationEvidence),
    candidateRefreshExecutionPreflight: await readJsonIfPresent(paths.candidateRefreshExecutionPreflight),
    candidateRefreshExecution: await readJsonIfPresent(paths.candidateRefreshExecution),
    candidateRefreshAuthorizationPackage: await readJsonIfPresent(paths.candidateRefreshAuthorizationPackage),
    candidateBaselineMaterialization: await readJsonIfPresent(paths.candidateBaselineMaterialization),
    runtimeSeedEvidencePipeline: await readJsonIfPresent(paths.runtimeSeedEvidencePipeline),
    runtimeSeedImportExecution: await readJsonIfPresent(paths.runtimeSeedImportExecution),
    completedTaskExportReport: await readJsonIfPresent(paths.completedTaskExportReport),
    runtimeCandidateAlignmentPreflight: await readJsonIfPresent(paths.runtimeCandidateAlignmentPreflight),
    runtimeTaskAlignmentRefreshPackage: await readJsonIfPresent(paths.runtimeTaskAlignmentRefreshPackage),
    runtimeTaskAlignmentReviewEvidence: await readJsonIfPresent(paths.runtimeTaskAlignmentReviewEvidence),
    durationSampleCollectionPackage: await readJsonIfPresent(paths.durationSampleCollectionPackage),
    durationSampleCoverageEvidence: await readJsonIfPresent(paths.durationSampleCoverageEvidence),
    runtimeMaterialPackage: await readJsonIfPresent(paths.runtimeMaterialPackage),
    realProductionOutcomePackage: await readJsonIfPresent(paths.realProductionOutcomePackage),
    stagingAuthorization: await readJsonIfPresent(paths.stagingAuthorization),
  }
  paths.sourceManifest = selectOperatorHandoffSourceManifestPath({
    canonicalPath: paths.sourceManifest,
    bundlePath: resolveArtifactPath(payloads.evidenceBundle.sourceManifest?.path),
  })
  payloads.sourceManifest = await readJsonIfPresent(paths.sourceManifest)
  const baselineId = firstText(
    payloads.candidateBaseline.baselineId,
    payloads.candidateBaseline.baseline_id,
    payloads.discovery.recommendedCandidate?.baselineId,
    payloads.readiness.baselineId,
    payloads.durationGapPlan.baselineId,
    payloads.candidateRefreshPackage.baselineId,
    payloads.candidateRefreshAuthorizationPackage.baselineId,
    payloads.candidateBaselineMaterialization.baselineId,
    payloads.durationSampleCollectionPackage.baselineId,
    payloads.runtimeTaskAlignmentRefreshPackage.baselineId,
    payloads.runtimeTaskAlignmentReviewEvidence.baselineId,
    payloads.runtimeMaterialPackage.baselineId,
  )
  const projectId = firstText(
    payloads.candidateBaseline.projectId,
    payloads.candidateBaseline.project_id,
    payloads.discovery.recommendedCandidate?.projectId,
    payloads.readiness.projectId,
    payloads.durationGapPlan.projectId,
    payloads.candidateRefreshPackage.projectId,
    payloads.candidateRefreshAuthorizationPackage.projectId,
    payloads.candidateBaselineMaterialization.projectId,
    payloads.durationSampleCollectionPackage.projectId,
    payloads.runtimeTaskAlignmentRefreshPackage.projectId,
    payloads.runtimeTaskAlignmentReviewEvidence.projectId,
    payloads.runtimeMaterialPackage.projectId,
  )

  const identitySources = [
    identityRecord('candidateBaseline', payloads.candidateBaseline),
    identityRecord('durationGapPlan', payloads.durationGapPlan),
    identityRecord('candidateRefreshPackage', payloads.candidateRefreshPackage),
    identityRecord('durationAssetUtilization', payloads.durationAssetUtilization),
    identityRecord('candidateRefreshExecutionPreflight', payloads.candidateRefreshExecutionPreflight),
    identityRecord('candidateRefreshExecution', payloads.candidateRefreshExecution),
    identityRecord('candidateRefreshAuthorizationPackage', payloads.candidateRefreshAuthorizationPackage),
    identityRecord('candidateBaselineMaterialization', payloads.candidateBaselineMaterialization),
    identityRecord('durationSampleCollectionPackage', payloads.durationSampleCollectionPackage),
    identityRecord('runtimeMaterialPackage', payloads.runtimeMaterialPackage),
    identityRecord('completedTaskExportReport', payloads.completedTaskExportReport),
    identityRecord('runtimeCandidateAlignmentPreflight', payloads.runtimeCandidateAlignmentPreflight),
    identityRecord('runtimeTaskAlignmentRefreshPackage', payloads.runtimeTaskAlignmentRefreshPackage),
    identityRecord('runtimeTaskAlignmentReviewEvidence', payloads.runtimeTaskAlignmentReviewEvidence),
    identityRecord('discovery', payloads.discovery.recommendedCandidate ?? payloads.discovery),
    identityRecord('readiness', payloads.readiness),
  ].filter((item) => item.baselineId || item.projectId)
  const identityMismatches = identitySources.filter((item) => {
    return (item.baselineId && baselineId && item.baselineId !== baselineId)
      || (item.projectId && projectId && item.projectId !== projectId)
  })
  const identityConsistency = {
    baselineId,
    projectId,
    matches: identityMismatches.length === 0,
    sources: identitySources,
    mismatches: identityMismatches,
  }
  const readinessGates = Array.isArray(payloads.readiness.gates) ? payloads.readiness.gates : []
  const rawBlockedGateIds = readinessGates
    .filter((gate) => text(gate.status) === 'blocked')
    .map((gate) => text(gate.id))
    .filter(Boolean)
  const blockedGateIds = rawBlockedGateIds.filter((blocker) => !isLegacyRuntimePmReviewBlocker(blocker))
  const productionReadinessBlockers = arrayOfText(payloads.readiness.productionReadinessBlockers)
    .filter((blocker) => !isLegacyRuntimePmReviewBlocker(blocker))
  const reviewPackageSourceBlockers = packageSourceBlockers(
    payloads.reviewPackage,
    'offline_development_quality_review_package',
  )
  const durationBlockers = arrayOfText(payloads.durationGapPlan.blockers)
  const durationSampleCollectionSourceBlockers = packageSourceBlockers(
    payloads.durationSampleCollectionPackage,
    'duration_sample_collection_package',
  )
  const durationSampleCoverageEvidence = summarizeDurationSampleCoverageEvidence(
    payloads.durationSampleCoverageEvidence,
    paths.durationSampleCoverageEvidence,
    {
      collectionPackage: payloads.durationSampleCollectionPackage,
      collectionPackagePath: paths.durationSampleCollectionPackage,
      collectionPackageHash: paths.durationSampleCollectionPackage
        ? await sha256File(paths.durationSampleCollectionPackage).catch(() => '')
        : '',
    },
  )
  const durationCalibrationEvidenceSummary = summarizeDurationCalibrationEvidence(
    payloads.durationCalibrationEvidence,
    paths.durationCalibrationEvidence,
    {
      baselineId,
      projectId,
    },
  )
  const rawDurationSampleCollectionBlockers = arrayOfText(payloads.durationSampleCollectionPackage.blockers)
  const effectiveDurationSampleCollectionPayloadBlockers = durationSampleCoverageEvidence.verified === true
    ? rawDurationSampleCollectionBlockers.filter((blocker) => !durationSampleCollectionBlockerClosedByCoverage(blocker))
    : rawDurationSampleCollectionBlockers
  const durationSampleCollectionBlockers = unique([
    ...effectiveDurationSampleCollectionPayloadBlockers,
    ...durationSampleCollectionSourceBlockers,
    ...durationSampleCoverageEvidence.blockers,
  ])
  const runtimeMaterialSourceBlockers = packageSourceBlockers(
    payloads.runtimeMaterialPackage,
    'runtime_material_package',
  )
  const runtimeMaterialBlockers = unique([
    ...arrayOfText(payloads.runtimeMaterialPackage.blockers),
    ...runtimeMaterialSourceBlockers,
  ])
  const realProductionOutcomePackageSourceBlockers = packageSourceBlockers(
    payloads.realProductionOutcomePackage,
    'real_production_outcome_package',
  )
  const realProductionOutcomePackageBlockers = unique([
    ...arrayOfText(payloads.realProductionOutcomePackage.blockers),
    ...realProductionOutcomePackageSourceBlockers,
  ])
  const candidateQuality = candidateBaselineOperatorHandoffQuality(payloads.candidateBaseline)
  const candidateQualityBlockers = candidateQuality.blockers.map((blocker) => {
    if (blocker === 'retired_or_low_information_default_master_plan_source') {
      return 'candidate_baseline_contains_retired_or_low_information_sources'
    }
    if (blocker === 'unsupported_default_master_plan_source_label') {
      return 'candidate_baseline_source_version_label_unsupported'
    }
    if (blocker === 'candidate_baseline_export_already_blocked') {
      return 'candidate_baseline_not_eligible_for_operator_handoff'
    }
    return blocker
  })
  const candidateHygieneBlockers = summarizeCandidateHygieneBlockers(
    payloads.candidateHygiene,
    {
      baselineId,
      projectId,
    },
  )
  const candidateRefreshPackageBlockers = summarizeCandidateRefreshPackageBlockers(
    payloads.candidateRefreshPackage,
    {
      baselineId,
      projectId,
    },
  )
  const offlineReviewRefreshFindings = summarizePmReviewRefreshBlockers(
    payloads.reviewEvidence,
    payloads.candidateRefreshPackage,
  )
  const offlineReviewRecordPreflightFindings = summarizeReviewRecordPreflightBlockers(
    payloads.reviewRecordPreflight,
  )
  const offlineDevelopmentQualityReview = summarizeOfflineDevelopmentQualityReview({
    reviewEvidence: payloads.reviewEvidence,
    reviewPackage: payloads.reviewPackage,
    reviewPackagePath: paths.reviewPackage,
    reviewRecordPreflight: payloads.reviewRecordPreflight,
    reviewRecordPreflightPath: paths.reviewRecordPreflight,
    reviewRecordPreflightFindings: offlineReviewRecordPreflightFindings,
    reviewRefreshFindings: offlineReviewRefreshFindings,
    reviewPackageSourceFindings: reviewPackageSourceBlockers,
  })
  const durationAssetUtilizationBlockers = summarizeDurationAssetUtilizationBlockers(
    payloads.durationAssetUtilization,
    {
      baselineId,
      projectId,
    },
  )
  const runtimeSeedEvidencePipelineBlockers = summarizeRuntimeSeedEvidencePipelineBlockers(
    payloads.runtimeSeedEvidencePipeline,
  )
  const runtimeSeedImportExecutionBlockers = summarizeRuntimeSeedImportExecutionBlockers(
    payloads.runtimeSeedImportExecution,
  )
  const completedTaskExportBlockers = summarizeCompletedTaskExportBlockers(
    payloads.completedTaskExportReport,
    {
      baselineId,
      projectId,
    },
  )
  const runtimeCandidateAlignmentPreflightBlockers = summarizeRuntimeCandidateAlignmentPreflightBlockers(
    payloads.runtimeCandidateAlignmentPreflight,
    {
      baselineId,
      projectId,
    },
  )
  const runtimeTaskAlignmentReviewEvidenceBlockers = summarizeRuntimeTaskAlignmentReviewEvidenceBlockers(
    payloads.runtimeTaskAlignmentReviewEvidence,
    {
      baselineId,
      projectId,
    },
    payloads.runtimeTaskAlignmentRefreshPackage,
  )
  const runtimeTaskAlignmentRefreshPackageBlockers = summarizeRuntimeTaskAlignmentRefreshPackageBlockers(
    payloads.runtimeTaskAlignmentRefreshPackage,
    {
      baselineId,
      projectId,
    },
    {
      runtimeTaskAlignmentReviewAccepted: runtimeTaskAlignmentReviewEvidenceBlockers.length === 0
        && text(payloads.runtimeTaskAlignmentReviewEvidence.status) === 'accepted_for_runtime_alignment_review',
    },
  )
  const candidateRefreshExecutionPreflightBlockers = summarizeCandidateRefreshExecutionPreflightBlockers(
    payloads.candidateRefreshExecutionPreflight,
    {
      baselineId,
      projectId,
    },
  )
  const candidateRefreshPackageCurrent = candidateRefreshPackageAlreadyCurrent(payloads.candidateRefreshPackage)
  const candidateRefreshAlreadyCurrent = candidateRefreshPackageCurrent
    && candidateRefreshExecutionPreflightAlreadyCurrent(payloads.candidateRefreshExecutionPreflight)
    && candidateRefreshExecutionPreflightBlockers.length === 0
  const candidateRefreshExecutionEvidenceRefBlockers = candidateRefreshAlreadyCurrent
    ? []
    : await candidateRefreshExecutionCurrentEvidenceRefBlockers(
        payloads.candidateRefreshExecution,
        {
          refreshPackagePath: paths.candidateRefreshPackage,
          preflightPath: paths.candidateRefreshExecutionPreflight,
        },
      )
  const candidateRefreshExecutionBlockers = candidateRefreshAlreadyCurrent
    ? []
    : candidateRefreshExecutionEvidenceRefBlockers.length > 0
      ? candidateRefreshExecutionEvidenceRefBlockers
      : summarizeCandidateRefreshExecutionBlockers(
          payloads.candidateRefreshExecution,
          {
            baselineId,
            projectId,
          },
        )
  const candidateRefreshAuthorizationPackageBlockers = summarizeCandidateRefreshAuthorizationPackageBlockers(
    payloads.candidateRefreshAuthorizationPackage,
    {
      baselineId,
      projectId,
    },
  )
  const candidateRefreshDependentDeferredBy = unique([
    ...candidateRefreshExecutionPreflightBlockers,
    ...candidateRefreshExecutionBlockers,
  ].filter(isCandidateRefreshActiveBlocker))
  const candidateRefreshDependentDeferred = candidateRefreshDependentDeferredBy.length > 0
  const currentDurationAssetUtilizationBlockers = candidateRefreshDependentDeferred
    ? []
    : durationAssetUtilizationBlockers
  const currentCompletedTaskExportBlockers = candidateRefreshDependentDeferred
    ? []
    : completedTaskExportBlockers
  const currentRuntimeCandidateAlignmentPreflightBlockers = candidateRefreshDependentDeferred
    ? []
    : runtimeCandidateAlignmentPreflightBlockers
  const currentRuntimeTaskAlignmentRefreshPackageBlockers = candidateRefreshDependentDeferred
    ? []
    : runtimeTaskAlignmentRefreshPackageBlockers
  const currentRuntimeTaskAlignmentReviewEvidenceBlockers = candidateRefreshDependentDeferred
    ? []
    : runtimeTaskAlignmentReviewEvidenceBlockers
  const currentDurationBlockers = candidateRefreshDependentDeferred
    ? []
    : durationBlockers
  const currentDurationCalibrationEvidenceBlockers = candidateRefreshDependentDeferred
    ? []
    : durationCalibrationEvidenceSummary.blockers
  const currentDurationSampleCollectionBlockers = candidateRefreshDependentDeferred
    ? []
    : durationSampleCollectionBlockers
  const runtimeSeedBlockers = unique([
    ...runtimeSeedEvidencePipelineBlockers,
    ...runtimeSeedImportExecutionBlockers,
  ])
  const runtimeSeedRootBlockers = runtimeSeedBlockers.filter(isRuntimeSeedImportRootBlocker)
  const runtimeSeedImportDependentBlockers = runtimeSeedBlockers.filter(isRuntimeSeedImportDependentBlocker)
  const runtimeSeedImportDependentDeferred = runtimeSeedRootBlockers.length > 0
    && runtimeSeedImportDependentBlockers.length > 0
  const currentRuntimeSeedEvidencePipelineBlockers = runtimeSeedImportDependentDeferred
    ? runtimeSeedEvidencePipelineBlockers.filter((blocker) => !isRuntimeSeedImportDependentBlocker(blocker))
    : runtimeSeedEvidencePipelineBlockers
  const currentRuntimeSeedImportExecutionBlockers = runtimeSeedImportDependentDeferred
    ? runtimeSeedImportExecutionBlockers.filter((blocker) => !isRuntimeSeedImportDependentBlocker(blocker))
    : runtimeSeedImportExecutionBlockers
  const currentBlockedGateIds = candidateRefreshDependentDeferred
    ? blockedGateIds.filter((gateId) => !isCandidateRefreshDependentReadinessGate(gateId))
    : blockedGateIds
  const deferredCandidateRefreshDependentBlockedGateIds = candidateRefreshDependentDeferred
    ? blockedGateIds.filter(isCandidateRefreshDependentReadinessGate)
    : []
  const deferredCurrentBlockers = {
    candidateRefreshDependent: candidateRefreshDependentDeferred
      ? {
          deferredBy: candidateRefreshDependentDeferredBy,
          blockers: unique([
            ...durationAssetUtilizationBlockers,
            ...completedTaskExportBlockers,
            ...runtimeCandidateAlignmentPreflightBlockers,
            ...runtimeTaskAlignmentRefreshPackageBlockers,
            ...runtimeTaskAlignmentReviewEvidenceBlockers,
            ...durationBlockers,
            ...durationCalibrationEvidenceSummary.blockers,
            ...durationSampleCollectionBlockers,
            ...deferredCandidateRefreshDependentBlockedGateIds,
          ]),
        }
      : {
          deferredBy: [],
          blockers: [],
        },
    runtimeSeedImportDependent: runtimeSeedImportDependentDeferred
      ? {
          deferredBy: runtimeSeedRootBlockers,
          blockers: runtimeSeedImportDependentBlockers,
        }
      : {
          deferredBy: [],
          blockers: [],
        },
  }
  const candidateBaselineMaterializationBlockers = candidateRefreshPackageCurrent
    ? []
    : summarizeCandidateBaselineMaterializationBlockers(
        payloads.candidateBaselineMaterialization,
        {
          baselineId,
          projectId,
        },
      )
  const discoveryBlockers = arrayOfText(
    payloads.discovery.recommendedCandidate?.evidenceReadiness?.blockers
      ?? payloads.discovery.nextAction?.blockedBy
      ?? payloads.discovery.blockers,
  ).filter((blocker) => !isLegacyRuntimePmReviewBlocker(blocker))
  const rawBundleMissing = arrayOfText(payloads.evidenceBundle.missingEvidenceTypes)
  const bundleMissing = rawBundleMissing.filter((type) => text(type) !== 'reviewEvidence')
  const currentBlockers = unique([
    ...(!paths.candidateBaseline ? ['candidate_baseline_export_required'] : []),
    ...(!paths.readiness ? ['readiness_report_required'] : []),
    ...(!identityConsistency.matches ? ['handoff_identity_mismatch'] : []),
    ...discoveryBlockers,
    ...candidateQualityBlockers,
    ...candidateHygieneBlockers,
    ...candidateRefreshPackageBlockers,
    ...currentDurationAssetUtilizationBlockers,
    ...currentRuntimeSeedEvidencePipelineBlockers,
    ...currentRuntimeSeedImportExecutionBlockers,
    ...currentCompletedTaskExportBlockers,
    ...currentRuntimeCandidateAlignmentPreflightBlockers,
    ...currentRuntimeTaskAlignmentRefreshPackageBlockers,
    ...currentRuntimeTaskAlignmentReviewEvidenceBlockers,
    ...candidateRefreshExecutionPreflightBlockers,
    ...candidateRefreshExecutionBlockers,
    ...candidateRefreshAuthorizationPackageBlockers,
    ...candidateBaselineMaterializationBlockers,
    ...currentDurationBlockers,
    ...currentDurationCalibrationEvidenceBlockers,
    ...currentDurationSampleCollectionBlockers,
    ...runtimeMaterialBlockers,
    ...realProductionOutcomePackageBlockers,
    ...productionReadinessBlockers,
    ...currentBlockedGateIds,
  ])
  const legacyPmOnlyReadinessBlock = payloads.readiness.productionReady !== true
    && rawBlockedGateIds.length > 0
    && blockedGateIds.length === 0
    && arrayOfText(payloads.readiness.productionReadinessBlockers)
      .every((blocker) => isLegacyRuntimePmReviewBlocker(blocker))
  const runtimeReadinessReady = Boolean(payloads.readiness.productionReady) || legacyPmOnlyReadinessBlock
  const productionReady = runtimeReadinessReady && currentBlockers.length === 0
  const environmentText = firstText(environment, payloads.sourceManifest.environment, 'staging')
  const exportedByText = firstText(exportedBy, payloads.sourceManifest.exportedBy, '<operator>')
  const publicationKeyText = firstText(publicationKey, payloads.sourceManifest.publicationKey, '<publication-key>')
  const fiveEvidenceArgs = buildFiveEvidenceArgs(payloads.evidenceBundle, paths.sourceManifest)
  const sourceExportPipelineCommand = buildSourceExportPipelineCommand(payloads.sourceManifest, {
    baselineId,
    projectId,
    publicationKey: publicationKeyText,
    environment: environmentText,
  })
  const durationSamplesPath = text(payloads.sourceManifest.sourceExports?.durationSamples?.path)
  const rawCompletedTasksExport = readRecord(payloads.sourceManifest.sourceExports?.rawCompletedTasks)
  const rawCompletedTasksPath = text(rawCompletedTasksExport.path)
  const rawCompletedTasksSourceName = firstText(
    rawCompletedTasksExport.source,
    rawCompletedTasksExport.sourceName,
    rawCompletedTasksExport.source_name,
  )
  const rawCompletedTasksEvidenceRef = sourceExportRecordEvidenceRef('raw_completed_tasks', rawCompletedTasksExport)
  const completedTaskExportEvidenceRef = await localEvidenceRef(
    'completed_task_export',
    await existingFile(path.join(path.dirname(paths.sourceManifest || paths.output), 'completed-task-export.json')),
  )
  const runtimeSeedEvidencePipelineSummary = summarizeRuntimeSeedEvidencePipeline(
    payloads.runtimeSeedEvidencePipeline,
    paths.runtimeSeedEvidencePipeline,
    runtimeSeedEvidencePipelineBlockers,
  )
  const actionSequence = buildActionSequence({
    baselineId,
    projectId,
    environment: environmentText,
    exportedBy: exportedByText,
    publicationKey: publicationKeyText,
    fiveEvidenceArgs,
    sourceExportPipelineCommand,
    durationSamplesPath,
    rawCompletedTasksPath,
    rawCompletedTasksSourceName,
    rawCompletedTasksEvidenceRef,
    completedTaskExportEvidenceRef,
    handoffOutputPath: paths.output,
    candidateDiscoveryPath: paths.discovery,
    candidateHygienePath: paths.candidateHygiene,
    candidateRefreshPackagePath: paths.candidateRefreshPackage,
    durationAssetUtilizationPath: paths.durationAssetUtilization,
    runtimeSeedEvidencePipelinePath: paths.runtimeSeedEvidencePipeline,
    runtimeSeedRepairPlan: runtimeSeedEvidencePipelineSummary.environment?.repairPlan,
    runtimeSeedImportExecutionPath: paths.runtimeSeedImportExecution,
    candidateRefreshAuthorizationPackagePath: paths.candidateRefreshAuthorizationPackage,
    runtimeCandidateAlignmentPreflightPath: paths.runtimeCandidateAlignmentPreflight,
    runtimeTaskAlignmentRefreshPackagePath: paths.runtimeTaskAlignmentRefreshPackage,
    runtimeTaskAlignmentReviewEvidencePath: paths.runtimeTaskAlignmentReviewEvidence,
    candidateBaselineMaterializationPath: paths.candidateBaselineMaterialization,
    candidateBaselineMaterializationPayload: payloads.candidateBaselineMaterialization,
    durationSampleCollectionPackage: payloads.durationSampleCollectionPackage,
    durationSampleCollectionPackagePath: paths.durationSampleCollectionPackage,
    durationSampleCoverageEvidencePath: paths.durationSampleCoverageEvidence,
    runtimeMaterialPackagePath: paths.runtimeMaterialPackage,
    realProductionOutcomePackagePath: paths.realProductionOutcomePackage,
    writerResult: firstText(writerResult, sourceExportInputPath(payloads.sourceManifest, 'writerResult')),
    criticalPathReadback: firstText(criticalPathReadback, sourceExportInputPath(payloads.sourceManifest, 'criticalPathReadback')),
    apiReadSmoke: firstText(apiReadSmoke, sourceExportInputPath(payloads.sourceManifest, 'apiReadSmoke')),
    uiConsumptionSmoke: firstText(uiConsumptionSmoke, sourceExportInputPath(payloads.sourceManifest, 'uiConsumptionSmoke')),
    rollbackVerification: firstText(rollbackVerification, sourceExportInputPath(payloads.sourceManifest, 'rollbackVerification')),
    existingSourceExports: {
      reviewExport: sourceExportOutputPath(payloads.sourceManifest, 'reviewExport'),
      durationSamples: sourceExportOutputPath(payloads.sourceManifest, 'durationSamples'),
      rawCompletedTasks: sourceExportOutputPath(payloads.sourceManifest, 'rawCompletedTasks'),
      taskDependencies: sourceExportOutputPath(payloads.sourceManifest, 'taskDependencies'),
      runtimePublications: sourceExportOutputPath(payloads.sourceManifest, 'runtimePublications'),
    },
    realProductionOutcome,
    candidateBaselinePath: paths.candidateBaseline,
    durationGapPlanPath: paths.durationGapPlan,
  })

  const handoff = {
    schemaVersion: 'workbuddy-default-master-plan-production-operator-handoff/v1',
    contractRevision: 'runtime_pm_review_removed_2026-07-14',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-production-operator-handoff',
    status: productionReady ? 'production_ready_handoff_complete' : 'blocked',
    productionReady,
    baselineId,
    projectId,
    publicationKey: publicationKeyText,
    environment: environmentText,
    exportedBy: exportedByText,
    currentEvidenceLevel: text(payloads.readiness.currentEvidenceLevel),
    requiredEvidenceLevel: text(payloads.readiness.requiredEvidenceLevel),
    productionReadinessBlockers,
    candidate: {
      sourceVersionLabel: text(payloads.candidateBaseline.sourceVersionLabel ?? payloads.candidateBaseline.source_version_label),
      rowCount: readNumber(payloads.candidateBaseline.rowCount ?? payloads.candidateBaseline.row_count ?? payloads.candidateBaseline.rows?.length),
      rowsMissingReferenceDuration: readNumber(payloads.candidateBaseline.quality?.rowsMissingReferenceDuration),
      rowsWritingTasks: readNumber(payloads.candidateBaseline.quality?.rowsWritingTasks),
      rowsWritingTaskDependencies: readNumber(payloads.candidateBaseline.quality?.rowsWritingTaskDependencies),
      productionCandidateEligible: candidateQuality.productionCandidateEligible,
      blockedSourceLabels: candidateQuality.sourceGuard.retiredOrLowInformationLabels,
      unsupportedSourceVersionLabels: candidateQuality.sourceGuard.unsupportedDefaultPlanLabels,
      artifact: repoRelative(paths.candidateBaseline),
    },
    candidateHygiene: {
      status: text(payloads.candidateHygiene.status) || 'not_generated',
      productionReady: payloads.candidateHygiene.productionReady === true,
      blockers: candidateHygieneBlockers,
      profileComparison: readRecord(payloads.candidateHygiene.profileComparison),
      artifact: repoRelative(paths.candidateHygiene),
    },
    candidateRefreshPackage: summarizeCandidateRefreshPackage(
      payloads.candidateRefreshPackage,
      paths.candidateRefreshPackage,
    ),
    durationAssetUtilization: summarizeDurationAssetUtilization(
      payloads.durationAssetUtilization,
      paths.durationAssetUtilization,
      durationAssetUtilizationBlockers,
    ),
    runtimeSeedEvidencePipeline: runtimeSeedEvidencePipelineSummary,
    runtimeSeedImportExecution: summarizeRuntimeSeedImportExecution(
      payloads.runtimeSeedImportExecution,
      paths.runtimeSeedImportExecution,
      runtimeSeedImportExecutionBlockers,
    ),
    completedTaskExport: summarizeCompletedTaskExport(
      payloads.completedTaskExportReport,
      paths.completedTaskExportReport,
      completedTaskExportBlockers,
    ),
    runtimeCandidateAlignmentPreflight: summarizeRuntimeCandidateAlignmentPreflight(
      payloads.runtimeCandidateAlignmentPreflight,
      paths.runtimeCandidateAlignmentPreflight,
      runtimeCandidateAlignmentPreflightBlockers,
    ),
    runtimeTaskAlignmentRefreshPackage: summarizeRuntimeTaskAlignmentRefreshPackage(
      payloads.runtimeTaskAlignmentRefreshPackage,
      paths.runtimeTaskAlignmentRefreshPackage,
      runtimeTaskAlignmentRefreshPackageBlockers,
    ),
    runtimeTaskAlignmentReviewEvidence: summarizeRuntimeTaskAlignmentReviewEvidence(
      payloads.runtimeTaskAlignmentReviewEvidence,
      paths.runtimeTaskAlignmentReviewEvidence,
      runtimeTaskAlignmentReviewEvidenceBlockers,
    ),
    candidateRefreshExecutionPreflight: summarizeCandidateRefreshExecutionPreflight(
      payloads.candidateRefreshExecutionPreflight,
      paths.candidateRefreshExecutionPreflight,
      candidateRefreshExecutionPreflightBlockers,
    ),
    candidateRefreshExecution: summarizeCandidateRefreshExecution(
      payloads.candidateRefreshExecution,
      paths.candidateRefreshExecution,
      candidateRefreshExecutionBlockers,
    ),
    candidateRefreshAuthorizationPackage: summarizeCandidateRefreshAuthorizationPackage(
      payloads.candidateRefreshAuthorizationPackage,
      paths.candidateRefreshAuthorizationPackage,
      candidateRefreshAuthorizationPackageBlockers,
    ),
    candidateBaselineMaterialization: summarizeCandidateBaselineMaterialization(
      payloads.candidateBaselineMaterialization,
      paths.candidateBaselineMaterialization,
      candidateBaselineMaterializationBlockers,
    ),
    durationGap: {
      status: text(payloads.durationGapPlan.status),
      missingStableCodeCount: readNumber(payloads.durationGapPlan.summary?.missingStableCodeCount),
      coveredStableCodeCount: readNumber(payloads.durationGapPlan.summary?.coveredStableCodeCount),
      blockers: durationBlockers,
      artifact: repoRelative(paths.durationGapPlan),
    },
    readiness: {
      status: text(payloads.readiness.status),
      productionReady: runtimeReadinessReady,
      reportedProductionReady: Boolean(payloads.readiness.productionReady),
      legacyPmOnlyBlockIgnored: legacyPmOnlyReadinessBlock,
      blockedGateCount: blockedGateIds.length,
      blockedGateIds,
      artifact: repoRelative(paths.readiness),
    },
    evidenceBundle: {
      status: text(payloads.evidenceBundle.status),
      productionReady: Boolean(payloads.evidenceBundle.productionReady),
      missingEvidenceTypes: bundleMissing,
      optionalOfflineEvidenceTypes: rawBundleMissing.filter((type) => text(type) === 'reviewEvidence'),
      artifact: repoRelative(paths.evidenceBundle),
    },
    offlineDevelopmentQualityReview,
    durationSampleCollectionPackage: {
      status: text(payloads.durationSampleCollectionPackage.status) || 'not_generated',
      requiredStableCodeCount: readNumber(payloads.durationSampleCollectionPackage.requiredStableCodeCount),
      totalRequiredAcceptedSampleCount: readNumber(payloads.durationSampleCollectionPackage.totalRequiredAcceptedSampleCount),
      rawBlockers: rawDurationSampleCollectionBlockers,
      blockers: durationSampleCollectionBlockers,
      artifact: repoRelative(paths.durationSampleCollectionPackage),
    },
    durationSampleCoverageEvidence,
    durationCalibrationEvidence: durationCalibrationEvidenceSummary,
    runtimeMaterialPackage: {
      status: text(payloads.runtimeMaterialPackage.status) || 'not_generated',
      requiredMaterialCount: readNumber(payloads.runtimeMaterialPackage.requiredMaterialCount),
      blockers: runtimeMaterialBlockers,
      artifact: repoRelative(paths.runtimeMaterialPackage),
    },
    realProductionOutcomePackage: {
      status: text(payloads.realProductionOutcomePackage.status) || 'not_generated',
      targetEnvironment: text(payloads.realProductionOutcomePackage.targetEnvironment),
      blockers: realProductionOutcomePackageBlockers,
      artifact: repoRelative(paths.realProductionOutcomePackage),
    },
    stagingAuthorization: {
      status: text(payloads.stagingAuthorization.status) || (paths.stagingAuthorization ? 'unreadable' : 'not_found'),
      environment: text(payloads.stagingAuthorization.environment),
      authorizedBy: text(payloads.stagingAuthorization.authorizedBy),
      authorizedByUserId: text(payloads.stagingAuthorization.authorizedByUserId),
      authorizationDecision: text(payloads.stagingAuthorization.authorizationDecision),
      allowedOperations: arrayOfText(payloads.stagingAuthorization.allowedOperations),
      productionReady: payloads.stagingAuthorization.productionReady === true,
      artifact: repoRelative(paths.stagingAuthorization),
    },
    identityConsistency,
    currentBlockers,
    deferredCurrentBlockers,
    actionSequence,
    artifacts: Object.fromEntries(Object.entries(paths)
      .filter(([key]) => key !== 'output' && key !== 'reviewPackage' && key !== 'reviewRecordPreflight' && key !== 'durationSampleCollectionPackage' && key !== 'runtimeMaterialPackage' && key !== 'realProductionOutcomePackage')
      .map(([key, value]) => [key, repoRelative(value)])),
    mutationBoundary: {
      readsLocalReports: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(paths.output), { recursive: true })
  await writeFile(paths.output, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(paths.output), renderMarkdown(handoff), 'utf8')
  return handoff
}

function buildActionSequence({
  baselineId,
  projectId,
  environment,
  exportedBy,
  publicationKey,
  fiveEvidenceArgs,
  sourceExportPipelineCommand,
  durationSamplesPath,
  rawCompletedTasksPath,
  rawCompletedTasksSourceName,
  rawCompletedTasksEvidenceRef,
  completedTaskExportEvidenceRef,
  handoffOutputPath,
  candidateDiscoveryPath,
  candidateHygienePath,
  candidateRefreshPackagePath,
  durationAssetUtilizationPath,
  runtimeSeedEvidencePipelinePath,
  runtimeSeedRepairPlan,
  runtimeSeedImportExecutionPath,
  candidateRefreshAuthorizationPackagePath,
  runtimeCandidateAlignmentPreflightPath,
  runtimeTaskAlignmentRefreshPackagePath,
  runtimeTaskAlignmentReviewEvidencePath,
  candidateBaselineMaterializationPath,
  candidateBaselineMaterializationPayload = {},
  durationSampleCollectionPackage,
  durationSampleCollectionPackagePath,
  durationSampleCoverageEvidencePath,
  runtimeMaterialPackagePath,
  realProductionOutcomePackagePath,
  writerResult,
  criticalPathReadback,
  apiReadSmoke,
  uiConsumptionSmoke,
  rollbackVerification,
  existingSourceExports = {},
  realProductionOutcome,
  candidateBaselinePath,
  durationGapPlanPath,
}) {
  const bid = baselineId || '<baseline-id>'
  const pid = projectId || '<project-id>'
  const resolvedDurationSamplesPath = text(durationSamplesPath) || DEFAULT_DURATION_SAMPLES_EXPORT
  const resolvedRawCompletedTasksPath = text(rawCompletedTasksPath) || DEFAULT_RAW_COMPLETED_TASKS_EXPORT
  const resolvedRawCompletedTasksSourceName = text(rawCompletedTasksSourceName) || '<raw-completed-task-source-name>'
  const resolvedRawCompletedTasksEvidenceRef = text(rawCompletedTasksEvidenceRef) || '<operator-reviewed-raw-task-evidence-ref>'
  const resolvedDurationSampleOperatorReviewRef = text(completedTaskExportEvidenceRef)
    || text(rawCompletedTasksEvidenceRef)
    || '<duration-sample-source-review-ref>'
  const resolvedCompletedTaskExportEvidenceRef = text(completedTaskExportEvidenceRef) || '<operator-reviewed-evidence-ref>'
  const fiveEvidenceArgText = commandFromArgs(fiveEvidenceArgs)
  const sourceFilePaths = {
    writerResult: text(writerResult) || '<dependency-writer-result.json>',
    criticalPathReadback: text(criticalPathReadback) || '<critical-path-readback.json>',
    apiReadSmoke: text(apiReadSmoke) || '<api-read-smoke.json>',
    uiConsumptionSmoke: text(uiConsumptionSmoke) || '<ui-consumption-smoke.json>',
    rollbackVerification: text(rollbackVerification) || '<rollback-verification.json>',
    realProductionOutcome: text(realProductionOutcome) || '<real-production-outcome.json>',
  }
  const existingSourceExportArgText = commandFromArgs([
    ['--review-export', existingSourceExports.reviewExport],
    ['--duration-samples', existingSourceExports.durationSamples],
    ['--raw-completed-tasks', existingSourceExports.rawCompletedTasks],
    ['--task-dependencies', existingSourceExports.taskDependencies],
    ['--runtime-publications', existingSourceExports.runtimePublications],
  ].flatMap(([flag, value]) => text(value) ? [flag, value] : []))
  const durationExistingSourceExportArgText = commandFromArgs([
    ['--duration-samples', existingSourceExports.durationSamples],
    ['--raw-completed-tasks', existingSourceExports.rawCompletedTasks],
  ].flatMap(([flag, value]) => text(value) ? [flag, value] : []))
  const productionReadyEnvironment = ['production', 'live'].includes(text(environment).toLowerCase())
  const realProductionOutcomeArg = text(realProductionOutcome) || productionReadyEnvironment
    ? ` --real-production-outcome ${sourceFilePaths.realProductionOutcome}`
    : ''
  const candidateRefreshPackageArg = candidateRefreshPackagePath
    ? ` --candidate-refresh-package ${repoRelative(candidateRefreshPackagePath)}`
    : ''
  const runtimeSeedEvidencePipelineArg = runtimeSeedEvidencePipelinePath
    ? ` --runtime-seed-evidence-pipeline ${repoRelative(runtimeSeedEvidencePipelinePath)}`
    : ''
  const durationSampleCollectionScopeArgs = buildDurationSampleCollectionScopeArgs(durationSampleCollectionPackage)
  const actions = []
  if (candidateRefreshPackagePath) {
    const candidateDiscoveryArg = text(candidateDiscoveryPath)
      ? ` --candidate-discovery ${repoRelative(candidateDiscoveryPath)}`
      : ''
    const candidateExportArg = text(candidateBaselinePath)
      ? ` --candidate-export ${repoRelative(candidateBaselinePath)}`
      : ''
    actions.push({
      id: 'candidate_refresh_package',
      gate: 'candidate_baseline_refresh_preflight',
      intent: 'Build a no-write package that compares the selected candidate baseline against the current default master-plan profile before any runtime publication.',
      command: `npm run evidence:default-master-plan:candidate-refresh-package --${candidateExportArg} --profile-report ${repoRelative(DEFAULT_PROFILE_REPORT)} --hygiene ${repoRelative(candidateHygienePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-export-hygiene.json'} --output ${repoRelative(candidateRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json'}`,
      noWriteBoundary: 'Reads the candidate baseline export when present, profile report, and hygiene report, then writes refresh package files only; does not write candidate baselines, task_baseline_items, tasks, task_dependencies, duration samples, runtime publication, rollback, or production tables.',
    })
    actions.push({
      id: 'duration_asset_utilization',
      gate: 'duration_reference_days_evidence_review',
      intent: 'Build a per-row trace showing which standard duration seed, T2 rhythm template, runtime reference days, productivity proxy, and dependency evidence each candidate row used.',
      command: `npm run evidence:default-master-plan:duration-asset-utilization -- --candidate-refresh-package ${repoRelative(candidateRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json'} --output ${repoRelative(durationAssetUtilizationPath || path.join(path.dirname(candidateRefreshPackagePath), DURATION_ASSET_UTILIZATION_REPORT_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json'}`,
      noWriteBoundary: 'Reads the candidate refresh package and writes per-row duration asset utilization reports only; does not write candidate baselines, task_baseline_items, tasks, task_dependencies, duration samples, runtime publication, rollback, or production tables.',
    })
    actions.push({
      id: 'candidate_refresh_execution_preflight',
      gate: 'candidate_baseline_refresh_execution_gate',
      intent: 'Check unlock, human approval, actor identity, environment, and package safety before any guarded candidate-baseline refresh writer can run.',
      command: `npm run evidence:default-master-plan:candidate-refresh-preflight -- --refresh-package ${repoRelative(candidateRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json'}${candidateDiscoveryArg} --output ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_PREFLIGHT_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json'} --environment ${environment}`,
      noWriteBoundary: 'Reads the candidate refresh package and environment unlock flags, then writes a preflight report only; does not write candidate baselines, task_baseline_items, tasks, task_dependencies, duration samples, runtime publication, rollback, or production tables.',
    })
    actions.push({
      id: 'candidate_refresh_authorization_package',
      gate: 'candidate_baseline_refresh_execution_gate',
      intent: 'Build a no-write operator authorization package that binds the preflight-approved refresh command, unlock variable, approval reference, and human actor before any candidate refresh execution.',
      command: `node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs --handoff ${repoRelative(handoffOutputPath) || 'project-testing/reports/default-master-plan-production-readiness/operator-handoff.json'} --preflight ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_PREFLIGHT_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json'} --execution ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution.json'} --output ${repoRelative(candidateRefreshAuthorizationPackagePath || path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_AUTHORIZATION_PACKAGE_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization-package.json'} --template-output ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_AUTHORIZATION_TEMPLATE_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization.operator-fill-template.json'}`,
      noWriteBoundary: 'Reads operator handoff, candidate refresh preflight, and candidate refresh execution reports, then writes local authorization package/template files only; does not execute candidate refresh, write task_baseline_items, write tasks, write task_dependencies, publish runtime, run smoke, or rollback.',
    })
    actions.push({
      id: 'candidate_refresh_execution_readiness_seal',
      gate: 'candidate_baseline_refresh_execution_gate',
      intent: 'Check the authorization package, preflight binding, sealed execute command, and explicit unlock environment variable immediately before a human operator runs candidate refresh execution.',
      command: `node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs --authorization-package ${repoRelative(candidateRefreshAuthorizationPackagePath || path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_AUTHORIZATION_PACKAGE_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization-package.json'} --preflight ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_PREFLIGHT_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json'} --output ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_READINESS_SEAL_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-readiness-seal.json'}`,
      noWriteBoundary: 'Reads candidate refresh authorization and preflight reports, checks the unlock environment variable, and writes a readiness seal only; does not run candidate refresh, connect to the database, write task_baseline_items, write tasks, write task_dependencies, publish runtime, run smoke, or rollback.',
    })
    const materializationControl = readRecord(candidateBaselineMaterializationPayload.executionControl ?? candidateBaselineMaterializationPayload.execution_control)
    const materializationMode = text(materializationControl.mode)
    const materializationOperatorApprovalRef = text(materializationControl.operatorApprovalRef ?? materializationControl.operator_approval_ref)
    const materializedBy = text(materializationControl.materializedBy ?? materializationControl.materialized_by)
    const materializationAllowsWrite = materializationControl.allowMaterialization === true || materializationControl.allow_materialization === true
    const materializationCommandParts = [
      `npm run evidence:default-master-plan:candidate-baseline-materialization -- --refresh-package ${repoRelative(candidateRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json'}`,
      `--output ${repoRelative(candidateBaselineMaterializationPath || path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_BASELINE_MATERIALIZATION_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization.json'}`,
      `--environment ${environment}`,
      materializationOperatorApprovalRef ? `--operator-approval-ref ${materializationOperatorApprovalRef}` : '',
      materializedBy ? `--materialized-by ${materializedBy}` : '',
      materializationMode ? `--mode ${materializationMode}` : '',
      materializationAllowsWrite ? '--allow-materialization' : '',
    ].filter(Boolean)
    actions.push({
      id: 'candidate_baseline_materialization',
      gate: 'candidate_baseline_materialization_gate',
      intent: 'Prepare a guarded candidate-only baseline materialization path when staging discovery cannot find the target candidate baseline before refresh execution.',
      command: materializationCommandParts.join(' '),
      noWriteBoundary: 'Default command is blocked/dry-run and writes report files only. Execute mode may write only a candidate task_baselines row and candidate task_baseline_items for local/staging after explicit unlock, human approval, and --allow-materialization; it must not write tasks, task_dependencies, duration samples, runtime publication, rollback, or production tables outside the candidate baseline tables.',
    })
    actions.push({
      id: 'candidate_baseline_materialization_readiness_seal',
      gate: 'candidate_baseline_materialization_gate',
      intent: 'Check the refresh package, dry-run materialization report, sealed execute arguments, and explicit unlock environment variable immediately before a human operator runs candidate baseline materialization.',
      command: `node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs --refresh-package ${repoRelative(candidateRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json'} --materialization ${repoRelative(candidateBaselineMaterializationPath || path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_BASELINE_MATERIALIZATION_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization.json'} --output ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_BASELINE_MATERIALIZATION_READINESS_SEAL_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-baseline-materialization-readiness-seal.json'}`,
      noWriteBoundary: 'Reads the candidate refresh package and candidate baseline materialization report, checks the unlock environment variable, and writes a readiness seal only; does not run candidate baseline materialization, connect to the database, write task_baselines, write task_baseline_items, write tasks, write task_dependencies, publish runtime, run smoke, or rollback.',
    })
    actions.push({
      id: 'candidate_refresh_execution',
      gate: 'candidate_baseline_refresh_execution_gate',
      intent: 'Run the guarded candidate-baseline item refresh writer. The generated handoff command omits execute unlock flags by default, so it writes an execution report only until a human operator supplies the preflight-approved execute boundary.',
      command: `npm run evidence:default-master-plan:candidate-refresh-execution -- --refresh-package ${repoRelative(candidateRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-package.json'} --preflight ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_PREFLIGHT_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution-preflight.json'} --authorization-package ${repoRelative(candidateRefreshAuthorizationPackagePath || path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_AUTHORIZATION_PACKAGE_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-authorization-package.json'} --output ${repoRelative(path.join(path.dirname(candidateRefreshPackagePath), CANDIDATE_REFRESH_EXECUTION_FILE)) || 'project-testing/reports/default-master-plan-production-readiness/candidate-refresh-execution.json'} --environment ${environment}`,
      noWriteBoundary: 'Default command is blocked/dry-run and writes report files only. Execute mode may write only candidate task_baseline_items for the selected candidate baseline; it must not write candidate baseline versions, tasks, task_dependencies, duration samples, runtime publication, rollback, or production tables.',
    })
  }
  actions.push(
    {
      id: 'duration_sample_gap_refresh',
      gate: 'runtime_duration_calibration_evidence',
      intent: 'Refresh the per-stableCode accepted duration sample coverage matrix after real samples are exported.',
      command: `npm run evidence:default-master-plan:duration-gaps -- --candidate-baseline ${repoRelative(candidateBaselinePath) || '<candidate-baseline.json>'}${candidateRefreshPackageArg} --samples ${shellArg(resolvedDurationSamplesPath)} --output ${repoRelative(durationGapPlanPath) || '<duration-sample-gap-plan.json>'}`,
      noWriteBoundary: 'Read-only gap planning; does not write samples or production state.',
    },
    {
      id: 'duration_sample_collection_package',
      gate: 'runtime_duration_calibration_evidence',
      intent: 'Build a no-write collection package listing the accepted completed-task duration samples still required by stableCode.',
      command: `npm run evidence:default-master-plan:duration-sample-package -- --duration-gap-plan ${repoRelative(durationGapPlanPath) || '<duration-sample-gap-plan.json>'} --profile-report ${repoRelative(DEFAULT_PROFILE_REPORT)} --duration-asset-utilization-report ${repoRelative(durationAssetUtilizationPath) || 'project-testing/reports/default-master-plan-production-readiness/duration-asset-utilization-report.json'}${durationSampleCollectionScopeArgs} --baseline-id ${bid} --project-id ${pid} --output ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --environment ${environment} --exported-by ${exportedBy}`,
      noWriteBoundary: 'Reads the duration gap plan, profile reference-day gap report, and duration asset utilization report, then writes collection package files only; does not write duration_experience_samples, tasks, dependencies, or runtime publication.',
    },
    ...(runtimeSeedEvidencePipelinePath
      ? [{
          id: 'runtime_seed_evidence_pipeline',
          gate: 'runtime_seed_and_reference_days_evidence',
          intent: 'Refresh the read-only runtime seed activation and runtime reference-days evidence pipeline before any runtime publication or dependency writer step is treated as ready.',
          command: `npm run evidence:default-master-plan:runtime-seed-pipeline -- --output ${repoRelative(runtimeSeedEvidencePipelinePath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-seed-evidence-pipeline.json'}`,
          repairPlan: normalizeRuntimeSeedRepairPlan(runtimeSeedRepairPlan),
          noWriteBoundary: 'Runs read-only evidence/preflight scripts and writes runtime seed evidence reports only; does not write algorithm seed versions, algorithm seed records, duration samples, tasks, task_dependencies, baselines, runtime publication, rollback, or production tables.',
        }]
      : []),
    ...(runtimeSeedImportExecutionPath
      ? [
          {
            id: 'runtime_seed_import_readiness_seal',
            gate: 'runtime_seed_and_reference_days_evidence',
            intent: 'Check runtime seed import gate, dry-run execution report, explicit unlock environment variable, and operator arguments before any human runs the governed import.',
            command: `node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs --import-gate ${repoRelative(path.join(path.dirname(runtimeSeedImportExecutionPath), RUNTIME_SEED_IMPORT_GATE_FILE)) || 'project-testing/reports/default-master-plan-profiles/runtime-seed-import-gate.json'} --execution ${repoRelative(runtimeSeedImportExecutionPath) || 'project-testing/reports/default-master-plan-profiles/runtime-seed-import-execution.json'} --output ${repoRelative(path.join(path.dirname(runtimeSeedImportExecutionPath), RUNTIME_SEED_IMPORT_READINESS_SEAL_FILE)) || 'project-testing/reports/default-master-plan-profiles/runtime-seed-import-readiness-seal.json'}`,
            noWriteBoundary: 'Reads runtime seed import gate and execution reports, checks environment unlocks, then writes a readiness seal only; does not connect to the database, run runtime seed import, write algorithm seed tables, write tasks, write task_dependencies, publish runtime, run smoke, or rollback.',
          },
          {
            id: 'runtime_seed_import_execution',
            gate: 'runtime_seed_and_reference_days_evidence',
            intent: 'Run the governed runtime seed import execution wrapper in evidence-only mode first; execute import only after import gate, explicit unlock flags, operator id, and post-import verification are ready.',
            command: `npm run evidence:default-master-plan:runtime-seed-import-execution -- --output ${repoRelative(runtimeSeedImportExecutionPath) || 'project-testing/reports/default-master-plan-profiles/runtime-seed-import-execution.json'}`,
            noWriteBoundary: 'Default command writes execution evidence only and omits --allow-import and --seed-smoke-user-id; execute mode may write only governed algorithm seed import records after explicit approval and must not write tasks, task_dependencies, baselines, duration samples, runtime publication, rollback, or other production tables.',
          },
        ]
      : []),
    {
      id: 'duration_source_export_collect',
      gate: 'source_export_collection',
      intent: 'Collect duration samples and completed-task source rows before runtime publication evidence exists.',
      command: `npm run evidence:default-master-plan:export-sources -- --phase duration --baseline-id ${bid} --project-id ${pid} --environment ${environment} --exported-by ${exportedBy}${durationExistingSourceExportArgText ? ` ${durationExistingSourceExportArgText}` : ''}`,
      noWriteBoundary: 'Read-only DB/source export collector for duration samples and completed tasks; does not collect offline quality-review artifacts, execute dependency writer, publish runtime, run smoke, or rollback.',
    },
    {
      id: 'real_duration_sample_material_template',
      gate: 'duration_sample_collection_package',
      intent: 'Build an operator-fill template for real completed-task duration sample material before source export.',
      command: `npm run evidence:default-master-plan:real-duration-sample-template -- --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --real-evidence-gap-summary ${DEFAULT_REAL_EVIDENCE_GAP_SUMMARY} --collection-kit-output ${DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT} --output ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_TEMPLATE} --prepared-by ${exportedBy}`,
      noWriteBoundary: 'Builds a local template only; does not write duration_experience_samples, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'real_duration_sample_collection_kit_preflight',
      gate: 'duration_sample_collection_package',
      intent: 'Validate the operator-filled real duration sample collection kit before it can be converted into real duration sample material.',
      command: `node project-testing/tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs --collection-kit ${DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT} --output ${DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT_PREFLIGHT} --checked-by ${exportedBy}`,
      noWriteBoundary: 'Reads the real duration sample collection kit and writes a preflight report only; does not write duration_experience_samples, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'real_duration_sample_material_from_collection_kit_preflight',
      gate: 'duration_sample_collection_package',
      intent: 'Convert a ready operator-filled collection-kit preflight into real duration sample material before material preflight and source export.',
      command: `node project-testing/tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --collection-kit-preflight ${DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT_PREFLIGHT} --output ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL} --prepared-by ${exportedBy}`,
      noWriteBoundary: 'Reads the duration sample collection package and collection-kit preflight, then writes local real-duration sample material/report files only; does not write duration_experience_samples, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'completed_task_export',
      gate: 'duration_sample_collection_package',
      intent: 'Normalize the read-only raw completed-task source export into the completed-task export consumed by real duration sample material generation.',
      command: `npm run evidence:default-master-plan:completed-task-export -- --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --raw-tasks ${shellArg(resolvedRawCompletedTasksPath)} --output ${DEFAULT_COMPLETED_TASK_EXPORT} --source-name ${shellArg(resolvedRawCompletedTasksSourceName)} --evidence-ref ${shellArg(resolvedRawCompletedTasksEvidenceRef)} --operator-review-ref ${shellArg(resolvedDurationSampleOperatorReviewRef)} --exported-by ${exportedBy}`,
      noWriteBoundary: 'Reads the duration sample collection package and raw completed-task export, then writes local completed-task export/report files only; does not write tasks, duration_experience_samples, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'runtime_candidate_alignment_preflight',
      gate: 'duration_sample_collection_package',
      intent: 'Compare current runtime completed tasks against the candidate master-plan rows by stableCode, title, and actual date range before accepting completed-task duration samples.',
      command: `npm run evidence:default-master-plan:runtime-candidate-alignment -- --candidate-baseline ${repoRelative(candidateBaselinePath) || '<candidate-baseline.json>'} --raw-tasks ${shellArg(resolvedRawCompletedTasksPath)} --output ${repoRelative(runtimeCandidateAlignmentPreflightPath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-candidate-alignment-preflight.json'}`,
      noWriteBoundary: 'Reads the candidate baseline export and raw completed-task export, then writes a local alignment preflight report only; does not write tasks, duration_experience_samples, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'runtime_task_alignment_refresh_package',
      gate: 'duration_sample_collection_package',
      intent: 'Build a no-write operator review package that turns runtime/candidate stableCode, title, and actual-date drift into explicit refresh or evidence-collection actions.',
      command: `npm run evidence:default-master-plan:runtime-task-alignment-refresh-package -- --runtime-candidate-alignment-preflight ${repoRelative(runtimeCandidateAlignmentPreflightPath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-candidate-alignment-preflight.json'} --output ${repoRelative(runtimeTaskAlignmentRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-task-alignment-refresh-package.json'} --prepared-by ${exportedBy}`,
      noWriteBoundary: 'Reads the runtime-candidate alignment preflight report and writes an operator review package only; does not write tasks, duration_experience_samples, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'runtime_task_alignment_review_evidence',
      gate: 'duration_sample_collection_package',
      intent: 'Record human review decisions for runtime task alignment refresh actions before any completed-task duration sample material is accepted.',
      command: `npm run evidence:default-master-plan:runtime-task-alignment-review-evidence -- --runtime-task-alignment-refresh-package ${repoRelative(runtimeTaskAlignmentRefreshPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-task-alignment-refresh-package.json'} --review-decisions project-testing/reports/default-master-plan-production-readiness/${RUNTIME_TASK_ALIGNMENT_REVIEW_DECISIONS_FILE} --output ${repoRelative(runtimeTaskAlignmentReviewEvidencePath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-task-alignment-review-evidence.json'} --reviewed-by ${exportedBy} --review-notes runtime-task-alignment-reviewed-for-duration-sample-evidence-chain`,
      noWriteBoundary: 'Reads the runtime task alignment refresh package and operator review decisions, then writes review evidence only; does not write tasks, duration_experience_samples, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'real_duration_sample_material_from_task_export',
      gate: 'duration_sample_collection_package',
      intent: 'Convert operator-reviewed completed-task export rows into real duration sample material before preflight and source export.',
      command: `npm run evidence:default-master-plan:real-duration-sample-from-task-export -- --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --completed-task-export ${DEFAULT_COMPLETED_TASK_EXPORT} --output ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL} --source-name completed_task_export --evidence-ref ${shellArg(resolvedCompletedTaskExportEvidenceRef)} --operator-review-ref ${shellArg(resolvedDurationSampleOperatorReviewRef)} --prepared-by ${exportedBy}`,
      noWriteBoundary: 'Reads the collection package and completed-task export, then writes local real-duration sample material/report files only; does not write duration_experience_samples, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'real_duration_sample_material_preflight',
      gate: 'duration_sample_collection_package',
      intent: 'Validate operator-filled real duration sample material before converting it into a source export consumed by coverage and calibration checks.',
      command: `npm run evidence:default-master-plan:real-duration-sample-preflight -- --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --sample-material ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL} --output ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_PREFLIGHT} --checked-by ${exportedBy}`,
      noWriteBoundary: 'Reads the duration sample collection package and operator-supplied material, then writes a preflight report only; does not write source exports, duration_experience_samples, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'real_duration_sample_source_export',
      gate: 'duration_sample_collection_package',
      intent: 'Convert operator-verified real completed-task duration sample material into the same source-export file consumed by coverage and calibration checks.',
      command: `npm run evidence:default-master-plan:real-duration-sample-export -- --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --sample-material ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL} --material-preflight ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_PREFLIGHT} --output ${shellArg(resolvedDurationSamplesPath)} --environment ${environment} --exported-by ${exportedBy}`,
      noWriteBoundary: 'Reads the duration sample collection package and operator-supplied real-duration material, then writes local source-export/report files only; does not write duration_experience_samples, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    },
    {
      id: 'duration_sample_coverage',
      gate: 'duration_sample_collection_package',
      intent: 'Verify that every requested stableCode in the collection package is covered by accepted completed-task duration samples.',
      command: `npm run evidence:default-master-plan:duration-sample-coverage -- --collection-package ${repoRelative(durationSampleCollectionPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --samples ${shellArg(resolvedDurationSamplesPath)} --output ${repoRelative(durationSampleCoverageEvidencePath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json'}`,
      noWriteBoundary: 'Reads the duration sample collection package and source-exported duration samples, then writes local coverage evidence only; does not write duration_experience_samples, tasks, dependencies, or runtime publication.',
    },
    {
      id: 'runtime_material_package',
      gate: 'source_export_collection',
      intent: 'Build a no-write package listing the runtime publication, writer, readback, smoke, and rollback materials required before full source export.',
      command: `npm run evidence:default-master-plan:runtime-material-package -- --handoff ${repoRelative(handoffOutputPath) || 'project-testing/reports/default-master-plan-production-readiness/operator-handoff.json'} --output ${repoRelative(runtimeMaterialPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json'} --environment ${environment} --exported-by ${exportedBy}`,
      noWriteBoundary: 'Reads the operator handoff and writes runtime material package files only; does not execute writer, publish runtime, run smoke, or rollback.',
    },
    {
      id: 'real_production_outcome_package',
      gate: 'real_production_outcome_material',
      intent: 'Build a no-write package for the production/live real outcome JSON contract before full source export.',
      command: `npm run evidence:default-master-plan:real-outcome-package -- --handoff ${repoRelative(handoffOutputPath) || 'project-testing/reports/default-master-plan-production-readiness/operator-handoff.json'} --runtime-material-package ${repoRelative(runtimeMaterialPackagePath) || 'project-testing/reports/default-master-plan-production-readiness/runtime-material-package.json'} --output ${repoRelative(realProductionOutcomePackagePath) || 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome-package.json'} --target-environment production --exported-by ${exportedBy}`,
      noWriteBoundary: 'Reads handoff/runtime material package and writes real production outcome package files only; does not execute writer, publish runtime, run smoke, or rollback.',
    },
    {
      id: 'source_export_collect',
      gate: 'source_export_collection',
      intent: productionReadyEnvironment
        ? 'Collect production/live source exports and post-execute/readback/smoke files for the same baseline/project/publication chain.'
        : 'Collect supporting non-production source exports only; this cannot close production-ready by itself.',
      command: `npm run evidence:default-master-plan:export-sources -- --baseline-id ${bid} --project-id ${pid} --publication-key ${publicationKey} --environment ${environment} --exported-by ${exportedBy}${existingSourceExportArgText ? ` ${existingSourceExportArgText}` : ''} --writer-result ${sourceFilePaths.writerResult} --critical-path-readback ${sourceFilePaths.criticalPathReadback} --api-read-smoke ${sourceFilePaths.apiReadSmoke} --ui-consumption-smoke ${sourceFilePaths.uiConsumptionSmoke} --rollback-verification ${sourceFilePaths.rollbackVerification}${realProductionOutcomeArg}`,
      noWriteBoundary: 'Read-only DB/source export collector; does not execute dependency writer, publish runtime, run smoke, or rollback.',
    },
    {
      id: 'production_evidence_pipeline',
      gate: 'five_evidence_builders',
      intent: productionReadyEnvironment
        ? 'Build duration calibration, dependency writer, publication, and smoke/rollback evidence from production/live source exports.'
        : 'Build supporting non-production evidence from source exports; readiness must remain productionReady=false until production/live outcome material exists.',
      command: sourceExportPipelineCommand || `node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs --baseline-id ${bid} --project-id ${pid} --publication-key ${publicationKey} <source-export-pipeline-args>`,
      noWriteBoundary: productionReadyEnvironment
        ? 'Invokes evidence builders only; builders are read-only normalization over production/live source exports.'
        : 'Invokes evidence builders only; non-production output is supporting evidence and must not be treated as production-ready.',
    },
    {
      id: 'evidence_bundle',
      gate: 'production_evidence_bundle',
      intent: 'Hash and bundle the five evidence files plus readiness output.',
      command: `node project-testing/tools/build-default-master-plan-production-evidence-bundle.mjs --output-root project-testing/reports/default-master-plan-production-readiness ${fiveEvidenceArgText || '<five-evidence-args>'}`,
      noWriteBoundary: 'Read-only evidence bundling; does not create evidence or mutate runtime.',
    },
    {
      id: 'readiness_check',
      gate: 'production_readiness',
      intent: 'Run the final production-readiness total gate checker after the runtime evidence gates.',
      command: `node project-testing/tools/check-default-master-plan-production-readiness.mjs ${fiveEvidenceArgText || '<five-evidence-args>'}${runtimeSeedEvidencePipelineArg}`,
      noWriteBoundary: 'Read-only checker.',
    },
    {
      id: 'lineage_audit',
      gate: 'runtime_evidence_lineage_consistency',
      intent: 'Confirm duration calibration, dependency writer, publication, and smoke evidence identify the same baseline/project/publication/release/rollback chain.',
      command: 'Inspect readiness.json gate runtime_evidence_lineage_consistency; it must be pass before production-ready.',
      noWriteBoundary: 'Audit only.',
    },
  )
  return actions
}

function buildDurationSampleCollectionScopeArgs(collectionPackage) {
  const record = readRecord(collectionPackage)
  const targetBusinessTypes = arrayOfText(record.targetBusinessTypes ?? record.target_business_types)
  const profileScope = text(record.profileScope ?? record.profile_scope)
  if (targetBusinessTypes.length > 0) {
    return ` --business-type ${shellArg(targetBusinessTypes.join(','))} --profile-scope ${profileScope === 'all' ? 'all' : 'target'}`
  }
  return ' --profile-scope all --profile-only'
}

function sourceExportRecordEvidenceRef(defaultSource, record) {
  const sourceRecord = readRecord(record)
  const sourcePath = text(sourceRecord.path)
  const sha256 = text(sourceRecord.sha256)
  if (!sourcePath || !sha256) return ''
  const source = firstText(sourceRecord.source, sourceRecord.sourceName, sourceRecord.source_name, defaultSource)
  return `${source}:${repoRelative(resolveArtifactPath(sourcePath)) || sourcePath}#sha256=${sha256}`
}

async function localEvidenceRef(kind, filePath) {
  const normalizedPath = text(filePath)
  if (!normalizedPath) return ''
  const existingPath = await existingFile(normalizedPath)
  if (!existingPath) return ''
  return `${kind}:${repoRelative(existingPath)}#sha256=${await sha256File(existingPath)}`
}

async function readJsonIfPresent(filePath) {
  if (!filePath) return {}
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

async function resolveOperatorHandoffArtifactPaths({
  candidateBaseline,
  durationGapPlan,
  discovery,
  readiness,
  evidenceBundle,
  output,
  reviewEvidence,
  reviewPackage,
  reviewRecordPreflight,
  candidateHygiene,
  candidateRefreshPackage,
  durationAssetUtilization,
  durationCalibrationEvidence,
  candidateRefreshExecution,
  candidateRefreshAuthorizationPackage,
  candidateBaselineMaterialization,
  runtimeSeedEvidencePipeline,
  runtimeSeedImportExecution,
  completedTaskExportReport,
  runtimeCandidateAlignmentPreflight,
  runtimeTaskAlignmentRefreshPackage,
  runtimeTaskAlignmentReviewEvidence,
  durationSampleCollectionPackage,
  durationSampleCoverageEvidence,
  runtimeMaterialPackage,
  realProductionOutcomePackage,
  stagingAuthorization,
}) {
  const outputPath = path.resolve(output || DEFAULT_OUTPUT)
  const reportRoot = path.dirname(outputPath)
  const discoveryPath = discovery
    ? path.resolve(discovery)
    : await existingFile(path.join(reportRoot, CANONICAL_REPORT_FILES.discovery))
  const readinessPath = readiness
    ? path.resolve(readiness)
    : await existingFile(path.join(reportRoot, CANONICAL_REPORT_FILES.readiness))
  const evidenceBundlePath = evidenceBundle
    ? path.resolve(evidenceBundle)
    : await existingFile(path.join(reportRoot, CANONICAL_REPORT_FILES.evidenceBundle))
  const durationGapPath = durationGapPlan
    ? path.resolve(durationGapPlan)
    : await findDurationGapPlanPath(reportRoot)
  const readinessPayload = await readJsonIfPresent(readinessPath)
  const discoveryPayload = await readJsonIfPresent(discoveryPath)
  const preferredBaselineId = firstText(
    readinessPayload.baselineId,
    readinessPayload.baseline_id,
    discoveryPayload.recommendedCandidate?.baselineId,
    discoveryPayload.recommendedCandidate?.baseline_id,
  )
  const candidateBaselinePath = candidateBaseline
    ? path.resolve(candidateBaseline)
    : await findCandidateBaselinePath(reportRoot, preferredBaselineId)

  return {
    candidateBaseline: candidateBaselinePath,
    durationGapPlan: durationGapPath,
    discovery: discoveryPath,
    readiness: readinessPath,
    evidenceBundle: evidenceBundlePath,
    output: outputPath,
    reviewEvidence: reviewEvidence ? path.resolve(reviewEvidence) : path.join(reportRoot, REVIEW_EVIDENCE_FILE),
    reviewPackage: reviewPackage ? path.resolve(reviewPackage) : path.join(reportRoot, REVIEW_PACKAGE_FILE),
    reviewRecordPreflight: reviewRecordPreflight ? path.resolve(reviewRecordPreflight) : path.join(reportRoot, REVIEW_RECORD_PREFLIGHT_FILE),
    candidateHygiene: candidateHygiene ? path.resolve(candidateHygiene) : await existingFile(path.join(reportRoot, CANDIDATE_EXPORT_HYGIENE_FILE)),
    candidateRefreshPackage: candidateRefreshPackage ? path.resolve(candidateRefreshPackage) : await existingFile(path.join(reportRoot, CANDIDATE_REFRESH_PACKAGE_FILE)),
    durationAssetUtilization: durationAssetUtilization ? path.resolve(durationAssetUtilization) : await existingFile(path.join(reportRoot, DURATION_ASSET_UTILIZATION_REPORT_FILE)),
    durationCalibrationEvidence: durationCalibrationEvidence ? path.resolve(durationCalibrationEvidence) : await existingFile(path.join(reportRoot, DURATION_CALIBRATION_EVIDENCE_FILE)),
    candidateRefreshExecutionPreflight: path.join(reportRoot, CANDIDATE_REFRESH_EXECUTION_PREFLIGHT_FILE),
    candidateRefreshExecution: candidateRefreshExecution ? path.resolve(candidateRefreshExecution) : await existingFile(path.join(reportRoot, CANDIDATE_REFRESH_EXECUTION_FILE)),
    candidateRefreshAuthorizationPackage: candidateRefreshAuthorizationPackage ? path.resolve(candidateRefreshAuthorizationPackage) : path.join(reportRoot, CANDIDATE_REFRESH_AUTHORIZATION_PACKAGE_FILE),
    candidateBaselineMaterialization: candidateBaselineMaterialization ? path.resolve(candidateBaselineMaterialization) : await existingFile(path.join(reportRoot, CANDIDATE_BASELINE_MATERIALIZATION_FILE)),
    runtimeSeedEvidencePipeline: runtimeSeedEvidencePipeline ? path.resolve(runtimeSeedEvidencePipeline) : await existingFile(path.join(reportRoot, RUNTIME_SEED_EVIDENCE_PIPELINE_FILE)),
    runtimeSeedImportExecution: runtimeSeedImportExecution
      ? path.resolve(runtimeSeedImportExecution)
      : await existingFile(path.join(reportRoot, RUNTIME_SEED_IMPORT_EXECUTION_FILE))
        || (samePath(reportRoot, DEFAULT_OUTPUT_ROOT) ? await existingFile(DEFAULT_RUNTIME_SEED_IMPORT_EXECUTION) : ''),
    completedTaskExportReport: completedTaskExportReport ? path.resolve(completedTaskExportReport) : await existingFile(path.join(reportRoot, COMPLETED_TASK_EXPORT_REPORT_FILE)),
    sourceManifest: await existingFile(path.join(reportRoot, SOURCE_EXPORTS_MANIFEST_FILE)),
    runtimeCandidateAlignmentPreflight: runtimeCandidateAlignmentPreflight ? path.resolve(runtimeCandidateAlignmentPreflight) : await existingFile(path.join(reportRoot, RUNTIME_CANDIDATE_ALIGNMENT_PREFLIGHT_FILE)),
    runtimeTaskAlignmentRefreshPackage: runtimeTaskAlignmentRefreshPackage ? path.resolve(runtimeTaskAlignmentRefreshPackage) : await existingFile(path.join(reportRoot, RUNTIME_TASK_ALIGNMENT_REFRESH_PACKAGE_FILE)),
    runtimeTaskAlignmentReviewEvidence: runtimeTaskAlignmentReviewEvidence ? path.resolve(runtimeTaskAlignmentReviewEvidence) : await existingFile(path.join(reportRoot, RUNTIME_TASK_ALIGNMENT_REVIEW_EVIDENCE_FILE)),
    durationSampleCollectionPackage: durationSampleCollectionPackage ? path.resolve(durationSampleCollectionPackage) : path.join(reportRoot, DURATION_SAMPLE_COLLECTION_PACKAGE_FILE),
    durationSampleCoverageEvidence: durationSampleCoverageEvidence ? path.resolve(durationSampleCoverageEvidence) : path.join(reportRoot, DURATION_SAMPLE_COVERAGE_EVIDENCE_FILE),
    runtimeMaterialPackage: runtimeMaterialPackage ? path.resolve(runtimeMaterialPackage) : path.join(reportRoot, RUNTIME_MATERIAL_PACKAGE_FILE),
    realProductionOutcomePackage: realProductionOutcomePackage ? path.resolve(realProductionOutcomePackage) : path.join(reportRoot, REAL_PRODUCTION_OUTCOME_PACKAGE_FILE),
    stagingAuthorization: stagingAuthorization ? path.resolve(stagingAuthorization) : await existingFile(path.join(reportRoot, STAGING_AUTHORIZATION_FILE)),
  }
}

async function existingFile(filePath) {
  try {
    const result = await stat(filePath)
    return result.isFile() ? path.resolve(filePath) : ''
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

async function findCandidateBaselinePath(reportRoot, baselineId) {
  const normalizedBaselineId = text(baselineId)
  if (normalizedBaselineId) {
    const exactPath = await existingFile(path.join(reportRoot, `candidate-baseline-${normalizedBaselineId}-school-items.json`))
    if (exactPath && await candidateBaselineExportEligible(exactPath)) return exactPath
  }
  const candidates = await reportFiles(reportRoot, /^candidate-baseline-.+-school-items\.json$/)
  const matching = normalizedBaselineId
    ? await firstEligibleCandidatePath(candidates.filter((candidate) => path.basename(candidate.filePath).includes(normalizedBaselineId)))
    : null
  return matching ?? await firstEligibleCandidatePath(candidates) ?? ''
}

async function findDurationGapPlanPath(reportRoot) {
  const canonicalPath = await existingFile(path.join(reportRoot, CANONICAL_REPORT_FILES.durationGapPlan))
  if (canonicalPath) return canonicalPath
  const candidates = await reportFiles(reportRoot, /^duration-sample-gap-plan.*\.json$/)
  return candidates[0]?.filePath ?? ''
}

async function reportFiles(reportRoot, pattern) {
  let entries = []
  try {
    entries = await readdir(reportRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(reportRoot, entry.name)
      const info = await stat(filePath)
      return { filePath, mtimeMs: info.mtimeMs }
    }))
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.filePath.localeCompare(right.filePath))
}

async function firstEligibleCandidatePath(candidates) {
  for (const candidate of candidates) {
    if (await candidateBaselineExportEligible(candidate.filePath)) return candidate.filePath
  }
  return ''
}

async function candidateBaselineExportEligible(filePath) {
  const payload = await readJsonIfPresent(filePath)
  const quality = candidateBaselineOperatorHandoffQuality(payload)
  return quality.productionCandidateEligible
}

function candidateBaselineOperatorHandoffQuality(payload) {
  const baseQuality = defaultMasterPlanCandidateQualityBlockers({
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    sourceVersionLabel: text(payload.sourceVersionLabel ?? payload.source_version_label),
    status: text(payload.status),
  })
  const payloadSourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(payload))
  const blockers = unique([
    ...baseQuality.blockers,
    ...payloadSourceGuard.blockers,
  ])
  return {
    ...baseQuality,
    blockers,
    productionCandidateEligible: blockers.length === 0,
    sourceGuard: {
      blockers: unique([
        ...baseQuality.sourceGuard.blockers,
        ...payloadSourceGuard.blockers,
      ]),
      labels: unique([
        ...baseQuality.sourceGuard.labels,
        ...payloadSourceGuard.labels,
      ]),
      unsupportedDefaultPlanLabels: unique([
        ...baseQuality.sourceGuard.unsupportedDefaultPlanLabels,
        ...payloadSourceGuard.unsupportedDefaultPlanLabels,
      ]),
      retiredOrLowInformationLabels: unique([
        ...baseQuality.sourceGuard.retiredOrLowInformationLabels,
        ...payloadSourceGuard.retiredOrLowInformationLabels,
      ]),
    },
  }
}

function packageSourceBlockers(payload, prefix) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const rows = Array.isArray(payload.rows) ? payload.rows : []
  return defaultMasterPlanSourceBlockers([
    ...defaultMasterPlanStructuredSourceSignals(payload),
    ...rows.flatMap(defaultMasterPlanRowSourceSignals),
  ]).blockers.map((blocker) => `${prefix}_${blocker}`)
}

function summarizeCandidateHygieneBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const blockers = arrayOfText(payload.blockers)
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'candidate_export_hygiene_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'candidate_export_hygiene_identity_mismatch' : null,
  ]
  return unique([
    ...blockers,
    status === 'blocked' && blockers.length === 0 ? 'candidate_export_hygiene_blocked' : null,
    ...identityBlockers,
  ])
}

function summarizeCandidateRefreshPackageBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const blockers = arrayOfText(payload.blockers)
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'candidate_refresh_package_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'candidate_refresh_package_identity_mismatch' : null,
  ]
  return unique([
    ...blockers,
    status === 'blocked' && blockers.length === 0 ? 'candidate_refresh_package_blocked' : null,
    status === 'refresh_required' && !blockers.includes('candidate_baseline_refresh_required_before_runtime_publication')
      ? 'candidate_baseline_refresh_required_before_runtime_publication'
      : null,
    ...identityBlockers,
  ])
}

function summarizeCandidateRefreshPackage(payload, artifactPath) {
  const diff = readRecord(payload.diff ?? payload.diffSummary ?? payload.diff_summary)
  const operationPlan = readRecord(payload.operationPlan ?? payload.operation_plan)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    refreshRequired: payload.refreshRequired === true
      || payload.refresh_required === true
      || text(payload.status) === 'refresh_required',
    missingTargetRowCount: readNumber(
      payload.missingTargetRowCount
        ?? payload.missing_target_row_count
        ?? payload.diffSummary?.missingTargetRowCount
        ?? payload.diff_summary?.missing_target_row_count
        ?? readArrayLength(diff.missingTargetRows ?? diff.missing_target_rows),
    ),
    codeChangedRowCount: readNumber(
      payload.codeChangedRowCount
        ?? payload.code_changed_row_count
        ?? payload.diffSummary?.codeChangedRowCount
        ?? payload.diff_summary?.code_changed_row_count
        ?? readArrayLength(diff.codeChangedRows ?? diff.code_changed_rows),
    ),
    operationMode: text(operationPlan.mode),
    executeAllowed: operationPlan.executeAllowed === true || operationPlan.execute_allowed === true,
    requiredUnlock: text(operationPlan.requiredUnlock ?? operationPlan.required_unlock),
    blockers: summarizeCandidateRefreshPackageBlockers(payload, {
      baselineId: text(payload.baselineId ?? payload.baseline_id),
      projectId: text(payload.projectId ?? payload.project_id),
    }),
    artifact: repoRelative(artifactPath),
  }
}

function summarizePmReviewRefreshBlockers(reviewEvidence, candidateRefreshPackage) {
  if (!hasPmReviewRecord(reviewEvidence)) return []
  if (!candidateRefreshRequiresReplacement(candidateRefreshPackage)) return []
  return ['pm_review_required_after_candidate_refresh']
}

function summarizeReviewRecordPreflightBlockers(reviewRecordPreflight) {
  if (!reviewRecordPreflight || typeof reviewRecordPreflight !== 'object') return []
  if (text(reviewRecordPreflight.status) !== 'blocked') return []
  return arrayOfText(reviewRecordPreflight.blockers)
    .map((blocker) => `pm_review_record_preflight_${blocker}`)
}

function summarizeReviewNotesQuality(reviewPackage) {
  const quality = readRecord(
    reviewPackage?.reviewNotesQuality
      ?? reviewPackage?.review_notes_quality,
  )
  const status = text(quality.status)
  const suggestedReviewNotes = text(
    quality.suggestedReviewNotes
      ?? quality.suggested_review_notes,
  )
  const statedItemCount = readNumber(
    quality.statedItemCount
      ?? quality.stated_item_count,
  )
  const actualReviewedItemCount = readNumber(
    quality.actualReviewedItemCount
      ?? quality.actual_reviewed_item_count,
  )
  const blockers = arrayOfText(quality.blockers)
  if (!status && !suggestedReviewNotes && statedItemCount === 0 && actualReviewedItemCount === 0 && blockers.length === 0) {
    return {}
  }
  return {
    status: status || 'not_evaluated',
    statedItemCount,
    actualReviewedItemCount,
    suggestedReviewNotes,
    blockers,
  }
}

function summarizeOfflineDevelopmentQualityReview({
  reviewEvidence,
  reviewPackage,
  reviewPackagePath,
  reviewRecordPreflight,
  reviewRecordPreflightPath,
  reviewRecordPreflightFindings,
  reviewRefreshFindings,
  reviewPackageSourceFindings,
}) {
  const packagePayload = readRecord(reviewPackage)
  const preflightPayload = readRecord(reviewRecordPreflight)
  const rawReviewEvidencePayload = readRecord(reviewEvidence)
  const evidence = Object.keys(readRecord(preflightPayload.reviewEvidence ?? preflightPayload.review_evidence)).length > 0
    ? readRecord(preflightPayload.reviewEvidence ?? preflightPayload.review_evidence)
    : readRecord(rawReviewEvidencePayload.candidate_governance_review ?? rawReviewEvidencePayload.candidateGovernanceReview)
  const rawPreflightBlockers = arrayOfText(preflightPayload.blockers)
  const qualityFindings = unique([
    ...arrayOfText(packagePayload.blockers),
    ...arrayOfText(reviewPackageSourceFindings),
    ...arrayOfText(reviewRefreshFindings),
    ...arrayOfText(reviewRecordPreflightFindings),
  ])
  const missingCurrentReviewedItemIds = arrayOfText(
    evidence.missingCurrentReviewedItemIds
      ?? evidence.missing_current_reviewed_item_ids,
  )
  const extraEvidenceReviewedItemIds = arrayOfText(
    evidence.extraEvidenceReviewedItemIds
      ?? evidence.extra_evidence_reviewed_item_ids,
  )
  const reviewedItemIds = arrayOfText(
    evidence.reviewedItemIds
      ?? evidence.reviewed_item_ids,
  )
  const currentPackageReviewedItemIds = arrayOfText(
    evidence.currentPackageReviewedItemIds
      ?? evidence.current_package_reviewed_item_ids
      ?? packagePayload.reviewedItemIds
      ?? packagePayload.reviewed_item_ids,
  )
  const staleForCurrentPackage = evidence.staleForCurrentPackage === true
    || evidence.stale_for_current_package === true
  const reviewEvidencePresent = evidence.present === true || reviewedItemIds.length > 0
  const reviewEvidenceStatus = !reviewEvidencePresent
    ? 'missing'
    : staleForCurrentPackage
      ? 'stale'
      : rawPreflightBlockers.includes('review_evidence_reviewed_item_count_mismatch')
        || rawPreflightBlockers.includes('review_evidence_reviewed_item_ids_mismatch')
        ? 'mismatch'
        : 'current'
  const reviewProvided = Object.keys(packagePayload).length > 0
    || Object.keys(preflightPayload).length > 0
    || Object.keys(rawReviewEvidencePayload).length > 0
    || reviewEvidencePresent
  return {
    status: reviewProvided ? 'available_for_offline_calibration' : 'not_provided',
    requiredForRuntime: false,
    intendedUse: 'offline_development_quality_review_and_template_calibration',
    qualityFindings,
    reviewPackage: {
      status: text(packagePayload.status) || 'not_generated',
      reviewedItemCount: readNumber(packagePayload.reviewedItemCount ?? packagePayload.reviewed_item_count),
      reviewedItemIdsSample: sampleTextList(packagePayload.reviewedItemIds ?? packagePayload.reviewed_item_ids),
      reviewNotesQuality: summarizeReviewNotesQuality(packagePayload),
      artifact: repoRelative(reviewPackagePath),
    },
    reviewEvidence: {
      status: reviewEvidenceStatus,
      present: reviewEvidencePresent,
      staleForCurrentPackage,
      reviewedItemCount: readNumber(evidence.reviewedItemCount ?? evidence.reviewed_item_count),
      currentPackageReviewedItemCount: readNumber(
        evidence.currentPackageReviewedItemCount
          ?? evidence.current_package_reviewed_item_count
          ?? packagePayload.reviewedItemCount
          ?? packagePayload.reviewed_item_count,
      ),
      reviewedItemIdsSample: sampleTextList(reviewedItemIds),
      currentPackageReviewedItemIdsSample: sampleTextList(currentPackageReviewedItemIds),
      missingCurrentReviewedItemCount: missingCurrentReviewedItemIds.length,
      missingCurrentReviewedItemIdsSample: sampleTextList(missingCurrentReviewedItemIds),
      extraEvidenceReviewedItemCount: extraEvidenceReviewedItemIds.length,
      extraEvidenceReviewedItemIdsSample: sampleTextList(extraEvidenceReviewedItemIds),
      reviewedBy: text(evidence.reviewedBy ?? evidence.reviewed_by),
      reviewedAt: text(evidence.reviewedAt ?? evidence.reviewed_at),
    },
    reviewRecordPreflight: {
      status: text(preflightPayload.status) || 'not_generated',
      mayExecuteReviewRecord: preflightPayload.mayExecuteReviewRecord === true
        || preflightPayload.may_execute_review_record === true,
      blockers: rawPreflightBlockers,
      artifact: repoRelative(reviewRecordPreflightPath),
    },
  }
}

function hasPmReviewRecord(reviewEvidence) {
  const review = readRecord(reviewEvidence?.candidate_governance_review ?? reviewEvidence?.candidateGovernanceReview)
  return Boolean(
    firstText(
      review.reviewed_by,
      review.reviewedBy,
      reviewEvidence?.change_log?.changed_by,
      reviewEvidence?.changeLog?.changedBy,
    )
    || firstText(review.review_notes, review.reviewNotes, review.change_summary, review.changeSummary)
  )
}

function candidateRefreshRequiresReplacement(payload) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return false
  const refreshRequired = payload.refreshRequired === true
    || payload.refresh_required === true
    || text(payload.status) === 'refresh_required'
  if (!refreshRequired) return false
  const targetReplacementRows = Array.isArray(payload.targetReplacementRows)
    ? payload.targetReplacementRows
    : Array.isArray(payload.target_replacement_rows)
      ? payload.target_replacement_rows
      : []
  const operationPlan = readRecord(payload.operationPlan ?? payload.operation_plan)
  const targetProfile = readRecord(payload.targetProfile ?? payload.target_profile)
  const currentCandidate = readRecord(payload.currentCandidate ?? payload.current_candidate)
  const targetRowCount = readNumber(
    targetProfile.targetRowCount
      ?? targetProfile.target_row_count
      ?? targetProfile.scheduleRowCount
      ?? targetProfile.schedule_row_count
      ?? payload.targetRowCount
      ?? payload.target_row_count,
  )
  const currentRowCount = readNumber(
    currentCandidate.rowCount
      ?? currentCandidate.row_count
      ?? payload.currentCandidateRowCount
      ?? payload.current_candidate_row_count,
  )
  return targetReplacementRows.length > 0
    || text(operationPlan.mode).includes('replace')
    || (targetRowCount > 0 && currentRowCount > 0 && targetRowCount !== currentRowCount)
}
function candidateRefreshPackageAlreadyCurrent(payload) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return false
  return text(payload.status) === 'no_refresh_required'
    && (payload.refreshRequired === false || payload.refresh_required === false)
}

function candidateRefreshExecutionPreflightAlreadyCurrent(payload) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return false
  return text(payload.status) === 'already_current'
    && (payload.alreadyCurrent === true || payload.already_current === true)
    && !(payload.mayExecuteCandidateRefresh === true || payload.may_execute_candidate_refresh === true)
}


function summarizeDurationAssetUtilizationBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const blockers = arrayOfText(payload.blockers).map((blocker) => `duration_asset_utilization_${blocker}`)
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'duration_asset_utilization_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'duration_asset_utilization_identity_mismatch' : null,
  ]
  const writeBoundaryBlockers = [
    mutationBoundary.writesTasks === true ? 'duration_asset_utilization_writes_tasks' : null,
    mutationBoundary.writesTaskDependencies === true ? 'duration_asset_utilization_writes_task_dependencies' : null,
    mutationBoundary.writesRuntimePublication === true ? 'duration_asset_utilization_writes_runtime_publication' : null,
  ]
  return unique([
    ...blockers,
    status === 'blocked' && blockers.length === 0 ? 'duration_asset_utilization_blocked' : null,
    ...identityBlockers,
    ...writeBoundaryBlockers,
  ].filter(Boolean))
}

function summarizeDurationAssetUtilization(payload, artifactPath, prefixedBlockers = []) {
  const assetCoverage = readRecord(payload.assetCoverage ?? payload.asset_coverage)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    rowCount: readNumber(payload.rowCount ?? payload.row_count),
    rowsWithStandardWorkSeedCount: readNumber(assetCoverage.rowsWithStandardWorkSeedCount ?? assetCoverage.rows_with_standard_work_seed_count),
    rowsWithActiveStandardWorkSeedCount: readNumber(assetCoverage.rowsWithActiveStandardWorkSeedCount ?? assetCoverage.rows_with_active_standard_work_seed_count),
    rowsWithFallbackStandardWorkSeedCount: readNumber(assetCoverage.rowsWithFallbackStandardWorkSeedCount ?? assetCoverage.rows_with_fallback_standard_work_seed_count),
    rowsWithT2RhythmTemplateCount: readNumber(assetCoverage.rowsWithT2RhythmTemplateCount ?? assetCoverage.rows_with_t2_rhythm_template_count),
    rowsWithActiveT2RhythmTemplateCount: readNumber(assetCoverage.rowsWithActiveT2RhythmTemplateCount ?? assetCoverage.rows_with_active_t2_rhythm_template_count),
    rowsWithFallbackT2RhythmTemplateCount: readNumber(assetCoverage.rowsWithFallbackT2RhythmTemplateCount ?? assetCoverage.rows_with_fallback_t2_rhythm_template_count),
    rowsWithRuntimeReferenceDaysCount: readNumber(assetCoverage.rowsWithRuntimeReferenceDaysCount ?? assetCoverage.rows_with_runtime_reference_days_count),
    rowsMissingRuntimeReferenceDaysCount: readNumber(assetCoverage.rowsMissingRuntimeReferenceDaysCount ?? assetCoverage.rows_missing_runtime_reference_days_count),
    rowsWithQuantityOrProductivityCount: readNumber(assetCoverage.rowsWithQuantityOrProductivityCount ?? assetCoverage.rows_with_quantity_or_productivity_count),
    rowsWithDependencyEvidenceCount: readNumber(assetCoverage.rowsWithDependencyEvidenceCount ?? assetCoverage.rows_with_dependency_evidence_count),
    rowsWithDependencyAssetCount: readNumber(assetCoverage.rowsWithDependencyAssetCount ?? assetCoverage.rows_with_dependency_asset_count),
    rowsWithDependencyTimingAssetCount: readNumber(assetCoverage.rowsWithDependencyTimingAssetCount ?? assetCoverage.rows_with_dependency_timing_asset_count),
    rowsWithProcessSeasonalDurationAssetCount: readNumber(assetCoverage.rowsWithProcessSeasonalDurationAssetCount ?? assetCoverage.rows_with_process_seasonal_duration_asset_count),
    rowsWithConstructionCalendarCount: readNumber(assetCoverage.rowsWithConstructionCalendarCount ?? assetCoverage.rows_with_construction_calendar_count),
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^duration_asset_utilization_/, ''))
      : arrayOfText(payload.blockers),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeRuntimeSeedEvidencePipelineBlockers(payload) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const status = text(payload.status)
  const summary = readRecord(payload.summary)
  const preflight = readRecord(summary.preflight)
  const coverage = readRecord(summary.coverage)
  const importGate = readRecord(summary.importGate ?? summary.import_gate)
  const runtimeReferenceDays = readRecord(preflight.runtimeReferenceDays ?? preflight.runtime_reference_days)
  const rootBlockers = arrayOfText(payload.blockers).map((blocker) => `runtime_seed_pipeline_${blocker}`)
  const importGateBlockers = arrayOfText(importGate.blockers).map((blocker) => `runtime_seed_pipeline_${blocker}`)
  return unique([
    status && status !== 'runtime_seed_import_not_required'
      ? `runtime_seed_pipeline_status_${status}`
      : null,
    readNumber(preflight.missingBusinessTypeCount ?? preflight.missing_business_type_count) > 0
      ? 'runtime_seed_pipeline_runtime_seed_business_type_evidence_missing'
      : null,
    readNumber(runtimeReferenceDays.missingBusinessTypeCount ?? runtimeReferenceDays.missing_business_type_count) > 0
      ? 'runtime_seed_pipeline_runtime_reference_days_evidence_missing'
      : null,
    readNumber(coverage.missingStableCodeCount ?? coverage.missing_stable_code_count) > 0
      ? 'runtime_seed_pipeline_stable_code_coverage_incomplete'
      : null,
    (importGate.importRequired ?? importGate.import_required) !== false
      ? 'runtime_seed_pipeline_runtime_seed_import_required'
      : null,
    ...rootBlockers,
    ...importGateBlockers,
  ].filter(Boolean))
}

function summarizeRuntimeSeedEvidencePipeline(payload, artifactPath, prefixedBlockers = []) {
  const summary = readRecord(payload.summary)
  const preflight = readRecord(summary.preflight)
  const environment = readRecord(summary.environment)
  const repairPlan = normalizeRuntimeSeedRepairPlan(environment.repairPlan ?? environment.repair_plan)
  const coverage = readRecord(summary.coverage)
  const importGate = readRecord(summary.importGate ?? summary.import_gate)
  const runtimeReferenceDays = readRecord(preflight.runtimeReferenceDays ?? preflight.runtime_reference_days)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    runtimeSeed: {
      readyBusinessTypeCount: readNumber(preflight.readyBusinessTypeCount ?? preflight.ready_business_type_count),
      missingBusinessTypeCount: readNumber(preflight.missingBusinessTypeCount ?? preflight.missing_business_type_count),
      requiredRuntimeSeedStableCodeCount: readNumber(preflight.requiredRuntimeSeedStableCodeCount ?? preflight.required_runtime_seed_stable_code_count),
    },
    runtimeReferenceDays: {
      readyBusinessTypeCount: readNumber(runtimeReferenceDays.readyBusinessTypeCount ?? runtimeReferenceDays.ready_business_type_count),
      missingBusinessTypeCount: readNumber(runtimeReferenceDays.missingBusinessTypeCount ?? runtimeReferenceDays.missing_business_type_count),
      missingBusinessTypes: arrayOfText(runtimeReferenceDays.missingBusinessTypes ?? runtimeReferenceDays.missing_business_types),
      requiredRuntimeReferenceStableCodes: arrayOfText(runtimeReferenceDays.requiredRuntimeReferenceStableCodes ?? runtimeReferenceDays.required_runtime_reference_stable_codes),
      requiredRuntimeReferenceStableCodeCount: readNumber(runtimeReferenceDays.requiredRuntimeReferenceStableCodeCount ?? runtimeReferenceDays.required_runtime_reference_stable_code_count),
      evidenceLevelRequired: text(runtimeReferenceDays.evidenceLevelRequired ?? runtimeReferenceDays.evidence_level_required),
    },
    environment: {
      status: text(environment.status),
      targetClass: text(environment.targetClass ?? environment.target_class),
      localSupabaseReachable: environment.localSupabaseReachable === true || environment.local_supabase_reachable === true,
      environmentBlockers: arrayOfText(environment.environmentBlockers ?? environment.environment_blockers),
      upstreamEvidenceBlockers: arrayOfText(environment.upstreamEvidenceBlockers ?? environment.upstream_evidence_blockers),
      repairPlan,
    },
    coverage: {
      requiredStableCodeCount: readNumber(coverage.requiredStableCodeCount ?? coverage.required_stable_code_count),
      coveredStableCodeCount: readNumber(coverage.coveredStableCodeCount ?? coverage.covered_stable_code_count),
      missingStableCodeCount: readNumber(coverage.missingStableCodeCount ?? coverage.missing_stable_code_count),
      missingStableCodes: arrayOfText(coverage.missingStableCodes ?? coverage.missing_stable_codes),
    },
    importGate: {
      status: text(importGate.status),
      importRequired: (importGate.importRequired ?? importGate.import_required) !== false,
      runtimeSeedEvidenceAlreadyReady: importGate.runtimeSeedEvidenceAlreadyReady === true || importGate.runtime_seed_evidence_already_ready === true,
      importMode: text(importGate.importMode ?? importGate.import_mode),
    },
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^runtime_seed_pipeline_/, ''))
      : arrayOfText(payload.blockers),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeRuntimeSeedImportExecutionBlockers(payload) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const status = text(payload.status)
  const importGate = readRecord(payload.importGate ?? payload.import_gate)
  const postImportVerification = readRecord(payload.postImportVerification ?? payload.post_import_verification)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const rootBlockers = arrayOfText(payload.blockers).map((blocker) => `runtime_seed_import_execution_${blocker}`)
  const importGateBlockers = arrayOfText(importGate.blockers).map((blocker) => `runtime_seed_import_execution_${blocker}`)
  const postImportBlockers = arrayOfText(postImportVerification.blockers).map((blocker) => `runtime_seed_import_execution_${blocker}`)
  return unique([
    status && status !== 'runtime_seed_import_execution_completed'
      ? `runtime_seed_import_execution_status_${status}`
      : null,
    importGate.importAllowed === false || importGate.import_allowed === false
      ? 'runtime_seed_import_execution_import_gate_not_allowed'
      : null,
    text(postImportVerification.status) && text(postImportVerification.status) !== 'runtime_seed_post_import_verified'
      ? `runtime_seed_import_execution_post_import_status_${text(postImportVerification.status)}`
      : null,
    postImportVerification.activeStandardWorkDurationSeedReady === false || postImportVerification.active_standard_work_duration_seed_ready === false
      ? 'runtime_seed_import_execution_active_standard_work_seed_not_ready'
      : null,
    postImportVerification.activeT2RhythmTemplateReady === false || postImportVerification.active_t2_rhythm_template_ready === false
      ? 'runtime_seed_import_execution_active_t2_rhythm_template_not_ready'
      : null,
    mutationBoundary.writesProductionTablesOutsideAlgorithmSeedImport === true || mutationBoundary.writes_production_tables_outside_algorithm_seed_import === true
      ? 'runtime_seed_import_execution_write_boundary_violation'
      : null,
    mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true
      ? 'runtime_seed_import_execution_writes_tasks'
      : null,
    mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true
      ? 'runtime_seed_import_execution_writes_task_dependencies'
      : null,
    mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true
      ? 'runtime_seed_import_execution_writes_runtime_publication'
      : null,
    ...rootBlockers,
    ...importGateBlockers,
    ...postImportBlockers,
  ].filter(Boolean))
}

function summarizeRuntimeSeedImportExecution(payload, artifactPath, prefixedBlockers = []) {
  const importGate = readRecord(payload.importGate ?? payload.import_gate)
  const postImportVerification = readRecord(payload.postImportVerification ?? payload.post_import_verification)
  const runtimeSeedEvidence = readRecord(postImportVerification.runtimeSeedEvidence ?? postImportVerification.runtime_seed_evidence)
  const runtimeT2Evidence = readRecord(postImportVerification.runtimeT2Evidence ?? postImportVerification.runtime_t2_evidence)
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    importGate: {
      status: text(importGate.status),
      importAllowed: importGate.importAllowed === true || importGate.import_allowed === true,
      importMode: text(importGate.importMode ?? importGate.import_mode),
      blockers: arrayOfText(importGate.blockers),
      manualActions: arrayOfText(importGate.manualActions ?? importGate.manual_actions),
    },
    postImportVerification: {
      provided: postImportVerification.provided === true,
      status: text(postImportVerification.status),
      verified: postImportVerification.verified === true,
      activeStandardWorkDurationSeedReady: postImportVerification.activeStandardWorkDurationSeedReady === true
        || postImportVerification.active_standard_work_duration_seed_ready === true,
      activeT2RhythmTemplateReady: postImportVerification.activeT2RhythmTemplateReady === true
        || postImportVerification.active_t2_rhythm_template_ready === true,
      blockers: arrayOfText(postImportVerification.blockers),
      runtimeSeedEvidence: {
        profileRowCount: readNumber(runtimeSeedEvidence.profileRowCount ?? runtimeSeedEvidence.profile_row_count),
        runtimeSeedRowCount: readNumber(runtimeSeedEvidence.runtimeSeedRowCount ?? runtimeSeedEvidence.runtime_seed_row_count),
        fallbackOrMissingSeedRowCount: readNumber(runtimeSeedEvidence.fallbackOrMissingSeedRowCount ?? runtimeSeedEvidence.fallback_or_missing_seed_row_count),
        allProfileRowsRuntime: runtimeSeedEvidence.allProfileRowsRuntime === true || runtimeSeedEvidence.all_profile_rows_runtime === true,
      },
      runtimeT2Evidence: {
        profileRowCount: readNumber(runtimeT2Evidence.profileRowCount ?? runtimeT2Evidence.profile_row_count),
        runtimeT2RowCount: readNumber(runtimeT2Evidence.runtimeT2RowCount ?? runtimeT2Evidence.runtime_t2_row_count),
        fallbackOrMissingT2RowCount: readNumber(runtimeT2Evidence.fallbackOrMissingT2RowCount ?? runtimeT2Evidence.fallback_or_missing_t2_row_count),
        allProfileT2RowsRuntime: runtimeT2Evidence.allProfileT2RowsRuntime === true || runtimeT2Evidence.all_profile_t2_rows_runtime === true,
      },
    },
    executionControl: {
      executionAllowed: executionControl.executionAllowed === true || executionControl.execution_allowed === true,
      allowImportFlagPresent: executionControl.allowImportFlagPresent === true || executionControl.allow_import_flag_present === true,
      seedSmokeUserId: text(executionControl.seedSmokeUserId ?? executionControl.seed_smoke_user_id),
      governedImportCommand: text(executionControl.governedImportCommand ?? executionControl.governed_import_command),
    },
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^runtime_seed_import_execution_/, ''))
      : arrayOfText(payload.blockers),
    nextActions: arrayOfText(payload.nextActions ?? payload.next_actions),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeCompletedTaskExportBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const rootBlockers = arrayOfText(payload.blockers).map((blocker) => `completed_task_export_${blocker}`)
  return unique([
    status && status !== 'completed_task_export_ready'
      ? `completed_task_export_status_${status}`
      : null,
    baselineId && identity.baselineId && baselineId !== identity.baselineId
      ? 'completed_task_export_identity_mismatch'
      : null,
    projectId && identity.projectId && projectId !== identity.projectId
      ? 'completed_task_export_identity_mismatch'
      : null,
    mutationBoundary.writesProductionTables === true ? 'completed_task_export_writes_production_tables' : null,
    mutationBoundary.writesTasks === true ? 'completed_task_export_writes_tasks' : null,
    mutationBoundary.writesTaskDependencies === true ? 'completed_task_export_writes_task_dependencies' : null,
    mutationBoundary.writesDurationSamples === true ? 'completed_task_export_writes_duration_samples' : null,
    mutationBoundary.writesRuntimePublication === true ? 'completed_task_export_writes_runtime_publication' : null,
    ...rootBlockers,
  ].filter(Boolean))
}

function summarizeCompletedTaskExport(payload, artifactPath, prefixedBlockers = []) {
  const summary = readRecord(payload.summary)
  const invalidTasks = Array.isArray(payload.invalidTasks) ? payload.invalidTasks : []
  const invalidTaskExamples = invalidTasks.slice(0, 5).map((task) => ({
    id: text(task.id),
    stableCode: text(task.stableCode ?? task.stable_code),
    title: text(task.title),
    expectedTitle: text(task.expectedTitle ?? task.expected_title),
    matchingRequestedStableCodeByTitle: text(task.matchingRequestedStableCodeByTitle ?? task.matching_requested_stable_code_by_title),
    recommendedAction: text(task.recommendedAction ?? task.recommended_action),
    blockers: arrayOfText(task.blockers),
  }))
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    requiredStableCodeCount: readNumber(summary.requiredStableCodeCount ?? summary.required_stable_code_count),
    rawTaskCount: readNumber(summary.rawTaskCount ?? summary.raw_task_count),
    exportedTaskCount: readNumber(summary.exportedTaskCount ?? summary.exported_task_count),
    candidateTaskCount: readNumber(summary.candidateTaskCount ?? summary.candidate_task_count),
    invalidTaskCount: readNumber(summary.invalidTaskCount ?? summary.invalid_task_count),
    titleMismatchCount: readNumber(summary.titleMismatchCount ?? summary.title_mismatch_count),
    titleMatchedDifferentStableCodeCount: readNumber(summary.titleMatchedDifferentStableCodeCount ?? summary.title_matched_different_stable_code_count),
    missingStableCodeCount: readNumber(summary.missingStableCodeCount ?? summary.missing_stable_code_count),
    missingStableCodes: arrayOfText(summary.missingStableCodes ?? summary.missing_stable_codes),
    invalidTaskExamples,
    recommendedNextAction: firstText(...invalidTaskExamples.map((task) => task.recommendedAction)),
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^completed_task_export_/, ''))
      : arrayOfText(payload.blockers),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeRuntimeCandidateAlignmentPreflightBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const rootBlockers = arrayOfText(payload.blockers).map((blocker) => `runtime_candidate_alignment_${blocker}`)
  return unique([
    status && status !== 'pass'
      ? `runtime_candidate_alignment_status_${status}`
      : null,
    baselineId && identity.baselineId && baselineId !== identity.baselineId
      ? 'runtime_candidate_alignment_identity_mismatch'
      : null,
    projectId && identity.projectId && projectId !== identity.projectId
      ? 'runtime_candidate_alignment_identity_mismatch'
      : null,
    mutationBoundary.writesProductionTables === true ? 'runtime_candidate_alignment_writes_production_tables' : null,
    mutationBoundary.writesTasks === true ? 'runtime_candidate_alignment_writes_tasks' : null,
    mutationBoundary.writesTaskDependencies === true ? 'runtime_candidate_alignment_writes_task_dependencies' : null,
    mutationBoundary.writesDurationSamples === true ? 'runtime_candidate_alignment_writes_duration_samples' : null,
    mutationBoundary.writesRuntimePublication === true ? 'runtime_candidate_alignment_writes_runtime_publication' : null,
    ...rootBlockers,
  ].filter(Boolean))
}

function summarizeRuntimeCandidateAlignmentPreflight(payload, artifactPath, prefixedBlockers = []) {
  const summary = readRecord(payload.summary)
  const rows = Array.isArray(payload.rows) ? payload.rows : []
  const driftExamples = rows
    .filter((row) => arrayOfText(row.blockers).length > 0)
    .slice(0, 5)
    .map((row) => ({
      stableCode: text(row.stableCode ?? row.stable_code),
      candidateTitle: text(row.candidateTitle ?? row.candidate_title),
      runtimeTaskId: text(row.runtimeTaskId ?? row.runtime_task_id),
      runtimeTitle: text(row.runtimeTitle ?? row.runtime_title),
      alignmentStatus: text(row.alignmentStatus ?? row.alignment_status),
      matchingCandidateStableCodeByRuntimeTitle: text(row.matchingCandidateStableCodeByRuntimeTitle ?? row.matching_candidate_stable_code_by_runtime_title),
      recommendedAction: text(row.recommendedAction ?? row.recommended_action),
      blockers: arrayOfText(row.blockers),
    }))
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    candidateRowCount: readNumber(summary.candidateRowCount ?? summary.candidate_row_count),
    runtimeTaskCount: readNumber(summary.runtimeTaskCount ?? summary.runtime_task_count),
    matchedStableCodeCount: readNumber(summary.matchedStableCodeCount ?? summary.matched_stable_code_count),
    missingRuntimeTaskCount: readNumber(summary.missingRuntimeTaskCount ?? summary.missing_runtime_task_count),
    titleMismatchCount: readNumber(summary.titleMismatchCount ?? summary.title_mismatch_count),
    titleMatchedDifferentStableCodeCount: readNumber(summary.titleMatchedDifferentStableCodeCount ?? summary.title_matched_different_stable_code_count),
    rowsWithActualDateRangeCount: readNumber(summary.rowsWithActualDateRangeCount ?? summary.rows_with_actual_date_range_count),
    rowsMissingActualDateRangeCount: readNumber(summary.rowsMissingActualDateRangeCount ?? summary.rows_missing_actual_date_range_count),
    projectMismatchCount: readNumber(summary.projectMismatchCount ?? summary.project_mismatch_count),
    driftExamples,
    recommendedNextAction: firstText(...driftExamples.map((row) => row.recommendedAction)),
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^runtime_candidate_alignment_/, ''))
      : arrayOfText(payload.blockers),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeRuntimeTaskAlignmentRefreshPackageBlockers(payload, identity, {
  runtimeTaskAlignmentReviewAccepted = false,
} = {}) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const rootBlockers = arrayOfText(payload.blockers).map((blocker) => `runtime_task_alignment_refresh_package_${blocker}`)
  return unique([
    status && !runtimeTaskAlignmentReviewAccepted && ![
      'runtime_task_alignment_refresh_ready',
      'runtime_task_alignment_refresh_not_required',
      'pass',
    ].includes(status)
      ? `runtime_task_alignment_refresh_package_status_${status}`
      : null,
    baselineId && identity.baselineId && baselineId !== identity.baselineId
      ? 'runtime_task_alignment_refresh_package_identity_mismatch'
      : null,
    projectId && identity.projectId && projectId !== identity.projectId
      ? 'runtime_task_alignment_refresh_package_identity_mismatch'
      : null,
    !runtimeTaskAlignmentReviewAccepted && (executionControl.executeAllowed ?? executionControl.execute_allowed) === false
      ? 'runtime_task_alignment_refresh_package_execute_not_allowed'
      : null,
    mutationBoundary.writesProductionTables === true ? 'runtime_task_alignment_refresh_package_writes_production_tables' : null,
    mutationBoundary.writesTasks === true ? 'runtime_task_alignment_refresh_package_writes_tasks' : null,
    mutationBoundary.writesTaskDependencies === true ? 'runtime_task_alignment_refresh_package_writes_task_dependencies' : null,
    mutationBoundary.writesDurationSamples === true ? 'runtime_task_alignment_refresh_package_writes_duration_samples' : null,
    mutationBoundary.writesRuntimePublication === true ? 'runtime_task_alignment_refresh_package_writes_runtime_publication' : null,
    ...(runtimeTaskAlignmentReviewAccepted ? [] : rootBlockers),
  ].filter(Boolean))
}

function summarizeRuntimeTaskAlignmentReviewEvidenceBlockers(payload, identity, refreshPackage) {
  const refreshSummary = readRecord(refreshPackage?.summary)
  const refreshActionCount = readNumber(refreshSummary.actionCount ?? refreshSummary.action_count)
  const refreshStatus = text(refreshPackage?.status)
  const refreshRequiresReview = refreshActionCount > 0
    || refreshStatus === 'runtime_task_alignment_refresh_review_required'
    || arrayOfText(refreshPackage?.blockers).includes('runtime_task_alignment_operator_review_required')
  if (!refreshRequiresReview && (!payload || Object.keys(payload).length === 0)) return []
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    return refreshRequiresReview ? ['runtime_task_alignment_review_evidence_required'] : []
  }
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const summary = readRecord(payload.summary)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  return unique([
    status !== 'accepted_for_runtime_alignment_review'
      ? `runtime_task_alignment_review_evidence_status_${status || 'missing'}`
      : null,
    baselineId && identity.baselineId && baselineId !== identity.baselineId
      ? 'runtime_task_alignment_review_evidence_identity_mismatch'
      : null,
    projectId && identity.projectId && projectId !== identity.projectId
      ? 'runtime_task_alignment_review_evidence_identity_mismatch'
      : null,
    refreshActionCount > 0 && readNumber(summary.actionCount ?? summary.action_count) !== refreshActionCount
      ? 'runtime_task_alignment_review_evidence_action_count_mismatch'
      : null,
    refreshActionCount > 0 && readNumber(summary.reviewedActionCount ?? summary.reviewed_action_count) !== refreshActionCount
      ? 'runtime_task_alignment_review_evidence_reviewed_action_count_mismatch'
      : null,
    mutationBoundary.writesProductionTables === true ? 'runtime_task_alignment_review_evidence_writes_production_tables' : null,
    mutationBoundary.writesTasks === true ? 'runtime_task_alignment_review_evidence_writes_tasks' : null,
    mutationBoundary.writesTaskDependencies === true ? 'runtime_task_alignment_review_evidence_writes_task_dependencies' : null,
    mutationBoundary.writesDurationSamples === true ? 'runtime_task_alignment_review_evidence_writes_duration_samples' : null,
    mutationBoundary.writesRuntimePublication === true ? 'runtime_task_alignment_review_evidence_writes_runtime_publication' : null,
    ...arrayOfText(payload.blockers).map((blocker) => `runtime_task_alignment_review_evidence_${blocker}`),
  ].filter(Boolean))
}

function summarizeRuntimeTaskAlignmentRefreshPackage(payload, artifactPath, prefixedBlockers = []) {
  const summary = readRecord(payload.summary)
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  const actions = Array.isArray(payload.actions) ? payload.actions : []
  const actionExamples = actions.slice(0, 5).map((action) => ({
    stableCode: text(action.stableCode ?? action.stable_code),
    candidateTitle: text(action.candidateTitle ?? action.candidate_title),
    runtimeTaskId: text(action.runtimeTaskId ?? action.runtime_task_id),
    runtimeTitle: text(action.runtimeTitle ?? action.runtime_title),
    actionKind: text(action.actionKind ?? action.action_kind),
    proposedStableCode: text(action.proposedStableCode ?? action.proposed_stable_code),
    recommendedOperatorAction: text(action.recommendedOperatorAction ?? action.recommended_operator_action),
    blockers: arrayOfText(action.blockers),
  }))
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    preparedBy: text(payload.preparedBy ?? payload.prepared_by),
    inputCandidateRowCount: readNumber(summary.inputCandidateRowCount ?? summary.input_candidate_row_count),
    inputRuntimeTaskCount: readNumber(summary.inputRuntimeTaskCount ?? summary.input_runtime_task_count),
    actionCount: readNumber(summary.actionCount ?? summary.action_count),
    stableCodeRefreshReviewActionCount: readNumber(summary.stableCodeRefreshReviewActionCount ?? summary.stable_code_refresh_review_action_count),
    missingRuntimeTaskActionCount: readNumber(summary.missingRuntimeTaskActionCount ?? summary.missing_runtime_task_action_count),
    actualDateRangeCollectionActionCount: readNumber(summary.actualDateRangeCollectionActionCount ?? summary.actual_date_range_collection_action_count),
    collisionReviewActionCount: readNumber(summary.collisionReviewActionCount ?? summary.collision_review_action_count),
    executeAllowed: executionControl.executeAllowed === true || executionControl.execute_allowed === true,
    recommendedMode: text(executionControl.recommendedMode ?? executionControl.recommended_mode),
    actionExamples,
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^runtime_task_alignment_refresh_package_/, ''))
      : arrayOfText(payload.blockers),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeRuntimeTaskAlignmentReviewEvidence(payload, artifactPath, prefixedBlockers = []) {
  const summary = readRecord(payload.summary)
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    reviewedBy: text(payload.reviewedBy ?? payload.reviewed_by),
    actionCount: readNumber(summary.actionCount ?? summary.action_count),
    reviewedActionCount: readNumber(summary.reviewedActionCount ?? summary.reviewed_action_count),
    unreviewedActionCount: readNumber(summary.unreviewedActionCount ?? summary.unreviewed_action_count),
    acceptedStableCodeRefreshCount: readNumber(summary.acceptedStableCodeRefreshCount ?? summary.accepted_stable_code_refresh_count),
    confirmedScopeGapCount: readNumber(summary.confirmedScopeGapCount ?? summary.confirmed_scope_gap_count),
    acceptedActualDateRangeEvidenceCount: readNumber(summary.acceptedActualDateRangeEvidenceCount ?? summary.accepted_actual_date_range_evidence_count),
    collisionReviewedCount: readNumber(summary.collisionReviewedCount ?? summary.collision_reviewed_count),
    rejectedActionCount: readNumber(summary.rejectedActionCount ?? summary.rejected_action_count),
    executeAllowed: executionControl.executeAllowed === true || executionControl.execute_allowed === true,
    rawBlockers: arrayOfText(payload.blockers),
    blockers: prefixedBlockers.length > 0
      ? prefixedBlockers.map((blocker) => blocker.replace(/^runtime_task_alignment_review_evidence_/, ''))
      : arrayOfText(payload.blockers),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeCandidateRefreshExecutionPreflightBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const blockers = arrayOfText(payload.blockers)
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'candidate_refresh_execution_preflight_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'candidate_refresh_execution_preflight_identity_mismatch' : null,
  ]
  return unique([
    ...blockers,
    status === 'blocked' && blockers.length === 0 ? 'candidate_refresh_execution_preflight_blocked' : null,
    ...identityBlockers,
  ])
}

function summarizeCandidateRefreshExecutionPreflight(payload, artifactPath, blockers = []) {
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    mayExecuteCandidateRefresh: payload.mayExecuteCandidateRefresh === true || payload.may_execute_candidate_refresh === true,
    alreadyCurrent: payload.alreadyCurrent === true || payload.already_current === true,
    blockers: blockers.length > 0
      ? blockers
      : summarizeCandidateRefreshExecutionPreflightBlockers(payload, {
          baselineId: text(payload.baselineId ?? payload.baseline_id),
          projectId: text(payload.projectId ?? payload.project_id),
        }),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeCandidateRefreshExecutionBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const blockers = arrayOfText(payload.blockers)
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'candidate_refresh_execution_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'candidate_refresh_execution_identity_mismatch' : null,
  ]
  return unique([
    ...blockers,
    status === 'candidate_refresh_execution_failed' && blockers.length === 0 ? 'candidate_refresh_execution_failed' : null,
    ...identityBlockers,
  ])
}

async function candidateRefreshExecutionCurrentEvidenceRefBlockers(payload, {
  refreshPackagePath = '',
  preflightPath = '',
} = {}) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  if (!candidateRefreshExecutionEvidenceRefsAreBinding(payload)) return []
  const evidence = readRecord(payload.evidence)
  return unique([
    ...await artifactRefMismatchBlockers({
      actualRef: text(evidence.refreshPackageRef ?? evidence.refresh_package_ref),
      expectedKind: 'candidate_refresh_package',
      expectedPath: refreshPackagePath,
      blocker: 'candidate_refresh_execution_refresh_package_ref_mismatch',
    }),
    ...await artifactRefMismatchBlockers({
      actualRef: text(evidence.preflightRef ?? evidence.preflight_ref),
      expectedKind: 'candidate_refresh_execution_preflight',
      expectedPath: preflightPath,
      blocker: 'candidate_refresh_execution_preflight_ref_mismatch',
    }),
  ])
}

function candidateRefreshExecutionEvidenceRefsAreBinding(payload) {
  const status = text(payload.status)
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  const transaction = readRecord(payload.transaction)
  const rawQueryLog = transaction.queryLog ?? transaction.query_log
  const queryLogLength = Array.isArray(rawQueryLog) ? rawQueryLog.length : 0
  const executionAllowed = executionControl.executionAllowed === true || executionControl.execution_allowed === true
  const transactionTouched = transaction.attempted === true
    || transaction.committed === true
    || transaction.rolledBack === true
    || queryLogLength > 0
  const rowMutationRecorded = readNumber(payload.deletedRowCount ?? payload.deleted_row_count) > 0
    || readNumber(payload.insertedRowCount ?? payload.inserted_row_count) > 0
  return executionAllowed
    || transactionTouched
    || rowMutationRecorded
    || status === 'candidate_refresh_execution_completed'
    || status === 'candidate_refresh_execution_failed'
}

async function artifactRefMismatchBlockers({
  actualRef = '',
  expectedKind = '',
  expectedPath = '',
  blocker = '',
} = {}) {
  if (!actualRef || !expectedKind || !expectedPath || !blocker) return []
  const expectedRelativePath = repoRelative(expectedPath)
  if (!expectedRelativePath) return [blocker]
  const expectedPrefix = `${expectedKind}:${expectedRelativePath}#sha256=`
  if (!actualRef.startsWith(expectedPrefix)) return [blocker]
  const expectedHash = await sha256File(expectedPath).catch(() => '')
  if (expectedHash && !actualRef.endsWith(expectedHash)) return [blocker]
  return []
}

function summarizeCandidateRefreshExecution(payload, artifactPath, blockers = null) {
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    executionAllowed: executionControl.executionAllowed === true || executionControl.execution_allowed === true,
    mode: text(executionControl.mode),
    environment: text(executionControl.environment),
    deletedRowCount: readNumber(payload.deletedRowCount ?? payload.deleted_row_count),
    insertedRowCount: readNumber(payload.insertedRowCount ?? payload.inserted_row_count),
    errorCode: text(payload.errorCode ?? payload.error_code),
    errorMessage: text(payload.errorMessage ?? payload.error_message),
    target: summarizeCandidateRefreshExecutionTarget(payload.target),
    dbRepairPlan: normalizeCandidateRefreshDbRepairPlan(payload.dbRepairPlan ?? payload.db_repair_plan),
    executionGatePlan: normalizeCandidateRefreshExecutionGatePlan(payload.executionGatePlan ?? payload.execution_gate_plan),
    nextActions: arrayOfText(payload.nextActions ?? payload.next_actions),
    blockers: Array.isArray(blockers)
      ? blockers
      : summarizeCandidateRefreshExecutionBlockers(payload, {
          baselineId: text(payload.baselineId ?? payload.baseline_id),
          projectId: text(payload.projectId ?? payload.project_id),
        }),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeCandidateRefreshAuthorizationPackageBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'candidate_refresh_authorization_package_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'candidate_refresh_authorization_package_identity_mismatch' : null,
  ]
  return unique([
    ...arrayOfText(payload.packageReadinessBlockers ?? payload.package_readiness_blockers),
    status === 'authorization_package_blocked' ? 'candidate_refresh_authorization_package_blocked' : null,
    mutationBoundary.doesNotMutateDatabase === false ? 'candidate_refresh_authorization_package_no_write_boundary_failed' : null,
    ...identityBlockers,
  ])
}

function summarizeCandidateRefreshAuthorizationPackage(payload, artifactPath, blockers = []) {
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  const nextCommands = readRecord(payload.nextCommands ?? payload.next_commands)
  const operatorFillTemplate = readRecord(payload.operatorFillTemplate ?? payload.operator_fill_template)
  const execution = readRecord(operatorFillTemplate.execution)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    preflightReady: payload.preflightReady === true || payload.preflight_ready === true,
    executionStatus: text(payload.executionStatus ?? payload.execution_status),
    executionCompleted: payload.executionCompleted === true || payload.execution_completed === true,
    packageOnly: mutationBoundary.packageOnly === true || mutationBoundary.package_only === true,
    doesNotMutateDatabase: mutationBoundary.doesNotMutateDatabase === true || mutationBoundary.does_not_mutate_database === true,
    operatorTemplateRef: text(payload.operatorTemplateRef ?? payload.operator_template_ref),
    executeCandidateRefreshCommand: text(nextCommands.executeCandidateRefresh ?? nextCommands.execute_candidate_refresh ?? execution.command),
    packageReadinessBlockers: arrayOfText(payload.packageReadinessBlockers ?? payload.package_readiness_blockers),
    executionBlockers: arrayOfText(payload.executionBlockers ?? payload.execution_blockers),
    blockers,
    artifact: repoRelative(artifactPath),
  }
}

function normalizeCandidateRefreshExecutionGatePlan(gatePlan) {
  const record = readRecord(gatePlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  return {
    status: text(record.status),
    noAutoExecution: record.noAutoExecution === true || record.no_auto_execution === true,
    requiredStepIds: arrayOfText(record.requiredStepIds ?? record.required_step_ids),
    blockedStepIds: arrayOfText(record.blockedStepIds ?? record.blocked_step_ids),
    orderedStepCount: readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length),
    orderedSteps,
  }
}

function normalizeCandidateRefreshDbRepairPlan(repairPlan) {
  const record = readRecord(repairPlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeCandidateRefreshDbRepairStep(step))
    : []
  return {
    status: text(record.status),
    failureClass: text(record.failureClass ?? record.failure_class),
    noAutoCredentialRotation: record.noAutoCredentialRotation === true || record.no_auto_credential_rotation === true,
    requiredStepIds: arrayOfText(record.requiredStepIds ?? record.required_step_ids),
    blockedStepIds: arrayOfText(record.blockedStepIds ?? record.blocked_step_ids),
    orderedStepCount: readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length),
    orderedSteps,
  }
}

function normalizeCandidateRefreshDbRepairStep(step) {
  const normalized = normalizeRepairStep(step)
  if (normalized.id !== 'confirm_candidate_refresh_target_identity') return normalized
  return {
    ...normalized,
    commands: unique([
      'npm.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness',
      ...normalized.commands,
    ]),
  }
}

function summarizeCandidateRefreshExecutionTarget(targetPayload) {
  const target = readRecord(targetPayload)
  const summary = {
    envFileRef: text(target.envFileRef ?? target.env_file_ref),
    envFileReadable: target.envFileReadable === true || target.env_file_readable === true,
    envFileSha256: text(target.envFileSha256 ?? target.env_file_sha256),
    connectionSource: text(target.connectionSource ?? target.connection_source),
    databaseHost: text(target.databaseHost ?? target.database_host),
    databasePort: text(target.databasePort ?? target.database_port),
    databaseName: text(target.databaseName ?? target.database_name),
    databaseUser: text(target.databaseUser ?? target.database_user),
    supabaseProjectRef: text(target.supabaseProjectRef ?? target.supabase_project_ref),
    hasPassword: target.hasPassword === true || target.has_password === true,
    sslmode: text(target.sslmode),
    parseError: text(target.parseError ?? target.parse_error),
  }
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value === true || (typeof value === 'string' && value)),
  )
}

function summarizeCandidateBaselineMaterializationBlockers(payload, identity) {
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) return []
  const blockers = arrayOfText(payload.blockers)
  const status = text(payload.status)
  const baselineId = text(payload.baselineId ?? payload.baseline_id)
  const projectId = text(payload.projectId ?? payload.project_id)
  const identityBlockers = [
    baselineId && identity.baselineId && baselineId !== identity.baselineId ? 'candidate_baseline_materialization_identity_mismatch' : null,
    projectId && identity.projectId && projectId !== identity.projectId ? 'candidate_baseline_materialization_identity_mismatch' : null,
  ]
  return unique([
    ...blockers,
    status === 'candidate_baseline_materialization_failed' && blockers.length === 0 ? 'candidate_baseline_materialization_failed' : null,
    status === 'candidate_baseline_materialization_blocked' && blockers.length === 0 ? 'candidate_baseline_materialization_blocked' : null,
    ...identityBlockers,
  ])
}

function summarizeCandidateBaselineMaterialization(payload, artifactPath, blockers = null) {
  const executionControl = readRecord(payload.executionControl ?? payload.execution_control)
  const materializationPlan = readRecord(payload.materializationPlan ?? payload.materialization_plan)
  const diff = readRecord(materializationPlan.diff)
  return {
    status: text(payload.status) || 'not_generated',
    productionReady: payload.productionReady === true,
    executionAllowed: executionControl.executionAllowed === true || executionControl.execution_allowed === true,
    allowMaterialization: executionControl.allowMaterialization === true || executionControl.allow_materialization === true,
    unlockPresent: executionControl.unlockPresent === true || executionControl.unlock_present === true,
    requiredUnlock: text(executionControl.requiredUnlock ?? executionControl.required_unlock),
    mode: text(executionControl.mode),
    environment: text(executionControl.environment),
    targetReplacementRowCount: readNumber(
      materializationPlan.targetReplacementRowCount
        ?? materializationPlan.target_replacement_row_count,
    ),
    missingTargetRowCount: readNumber(
      diff.missingTargetRowCount
        ?? diff.missing_target_row_count,
    ),
    wouldInsertCandidateBaseline: materializationPlan.wouldInsertCandidateBaseline === true
      || materializationPlan.would_insert_candidate_baseline === true,
    wouldInsertCandidateBaselineItems: materializationPlan.wouldInsertCandidateBaselineItems === true
      || materializationPlan.would_insert_candidate_baseline_items === true,
    insertedBaselineCount: readNumber(payload.insertedBaselineCount ?? payload.inserted_baseline_count),
    insertedItemCount: readNumber(payload.insertedItemCount ?? payload.inserted_item_count),
    errorCode: text(payload.errorCode ?? payload.error_code),
    errorMessage: text(payload.errorMessage ?? payload.error_message),
    blockers: Array.isArray(blockers)
      ? blockers
      : summarizeCandidateBaselineMaterializationBlockers(payload, {
          baselineId: text(payload.baselineId ?? payload.baseline_id),
          projectId: text(payload.projectId ?? payload.project_id),
        }),
    artifact: repoRelative(artifactPath),
  }
}

function summarizeDurationSampleCoverageEvidence(
  payload,
  artifactPath,
  { collectionPackage = {}, collectionPackagePath = '', collectionPackageHash = '' } = {},
) {
  const summary = payload?.summary && typeof payload.summary === 'object' && !Array.isArray(payload.summary)
    ? payload.summary
    : {}
  const payloadBlockers = arrayOfText(payload?.blockers)
  const status = text(payload?.status) || 'not_generated'
  const evidenceLevel = text(payload?.evidenceLevel ?? payload?.evidence_level)
  const staleBlockers = durationSampleCoverageStalenessBlockers(payload, {
    collectionPackage,
    collectionPackagePath,
    collectionPackageHash,
  })
  const blockers = unique([
    ...payloadBlockers.filter((blocker) => !durationEvidenceBlockerMirrorsCollectionPackage(blocker)),
    ...staleBlockers,
  ])
  const missingStableCodeCount = readNumber(summary.missingStableCodeCount ?? summary.missing_stable_code_count)
  const coveredStableCodeCount = readNumber(summary.coveredStableCodeCount ?? summary.covered_stable_code_count)
  const requiredStableCodeCount = readNumber(summary.requiredStableCodeCount ?? summary.required_stable_code_count)
  const invalidSamples = summarizeInvalidDurationSamples(payload?.invalidSamples ?? payload?.invalid_samples)
  const invalidSampleCount = readNumber(summary.invalidSampleCount ?? summary.invalid_sample_count) || invalidSamples.count
  const verified = status === 'covered'
    && evidenceLevel === 'sample_collection_coverage_verified_l2'
    && missingStableCodeCount === 0
    && requiredStableCodeCount > 0
    && coveredStableCodeCount >= requiredStableCodeCount
    && blockers.length === 0
  return {
    status,
    evidenceLevel,
    verified,
    requiredStableCodeCount,
    coveredStableCodeCount,
    missingStableCodeCount,
    invalidSampleCount,
    invalidSampleBlockerCounts: invalidSamples.blockerCounts,
    invalidSampleExamples: invalidSamples.examples,
    blockers,
    artifact: repoRelative(artifactPath),
  }
}

function durationEvidenceBlockerMirrorsCollectionPackage(blocker) {
  return text(blocker).startsWith('duration_sample_collection_package_')
}

function summarizeInvalidDurationSamples(value) {
  const samples = Array.isArray(value) ? value : []
  const blockerCounts = new Map()
  const firstSeenIndex = new Map()
  for (const sample of samples) {
    for (const blocker of arrayOfText(sample?.blockers)) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1)
      if (!firstSeenIndex.has(blocker)) firstSeenIndex.set(blocker, firstSeenIndex.size)
    }
  }
  const orderedBlockers = [...blockerCounts.entries()]
    .sort((left, right) => {
      const countDiff = right[1] - left[1]
      if (countDiff !== 0) return countDiff
      return (firstSeenIndex.get(left[0]) ?? 0) - (firstSeenIndex.get(right[0]) ?? 0)
    })
  return {
    count: samples.length,
    blockerCounts: Object.fromEntries(orderedBlockers),
    examples: samples.slice(0, 5).map((sample) => ({
      id: text(sample?.id),
      stableCode: text(sample?.stableCode ?? sample?.stable_code ?? sample?.standardWorkCode ?? sample?.standard_work_code),
      title: text(sample?.title ?? sample?.name),
      blockers: arrayOfText(sample?.blockers),
    })),
  }
}

function summarizeDurationCalibrationEvidence(payload, artifactPath, identity = {}) {
  const status = text(payload?.status) || 'not_generated'
  const evidenceLevel = text(payload?.evidenceLevel ?? payload?.evidence_level)
  const mutationBoundary = readRecord(payload?.mutationBoundary ?? payload?.mutation_boundary)
  const blockers = unique([
    ...arrayOfText(payload?.blockers).filter((blocker) => !durationEvidenceBlockerMirrorsCollectionPackage(blocker)),
    identity.baselineId && text(payload?.baselineId ?? payload?.baseline_id) && identity.baselineId !== text(payload?.baselineId ?? payload?.baseline_id)
      ? 'duration_calibration_identity_mismatch'
      : null,
    identity.projectId && text(payload?.projectId ?? payload?.project_id) && identity.projectId !== text(payload?.projectId ?? payload?.project_id)
      ? 'duration_calibration_identity_mismatch'
      : null,
    mutationBoundary.writesProductionTables === true ? 'duration_calibration_writes_production_tables' : null,
    mutationBoundary.writesDurationSamples === true ? 'duration_calibration_writes_duration_samples' : null,
    mutationBoundary.writesRuntimePublication === true ? 'duration_calibration_writes_runtime_publication' : null,
    status === 'blocked' && arrayOfText(payload?.blockers).length === 0 ? 'duration_calibration_blocked' : null,
  ].filter(Boolean))
  return {
    status,
    evidenceLevel,
    acceptedRealDurationSampleCount: readNumber(payload?.acceptedRealDurationSampleCount ?? payload?.accepted_real_duration_sample_count),
    calibratedReferenceDayCount: readNumber(payload?.calibratedReferenceDayCount ?? payload?.calibrated_reference_day_count),
    calibrationDeltaCount: readNumber(payload?.calibrationDeltaCount ?? payload?.calibration_delta_count),
    blockers,
    artifact: repoRelative(artifactPath),
  }
}

function durationSampleCoverageStalenessBlockers(payload, {
  collectionPackage = {},
  collectionPackagePath = '',
  collectionPackageHash = '',
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const blockers = []
  const expectedCollectionPackagePath = repoRelative(collectionPackagePath)
  const collectionPackageRef = text(payload.collectionPackageRef ?? payload.collection_package_ref)
  if (collectionPackageRef && expectedCollectionPackagePath) {
    const expectedPrefix = `duration_sample_collection_package:${expectedCollectionPackagePath}#sha256=`
    if (!collectionPackageRef.startsWith(expectedPrefix)) {
      blockers.push('duration_sample_coverage_collection_package_ref_mismatch')
    } else if (collectionPackageHash && !collectionPackageRef.endsWith(collectionPackageHash)) {
      blockers.push('duration_sample_coverage_collection_package_ref_mismatch')
    }
  }
  const requestedCodes = stableCodesFromSampleRequests(collectionPackage)
  const coveredCodes = stableCodesFromCoverageRows(payload)
  if (requestedCodes.length > 0 && coveredCodes.length > 0) {
    const missingCodes = requestedCodes.filter((code) => !coveredCodes.includes(code))
    const unexpectedCodes = coveredCodes.filter((code) => !requestedCodes.includes(code))
    if (missingCodes.length > 0 || unexpectedCodes.length > 0) {
      blockers.push('duration_sample_coverage_requested_stable_codes_mismatch')
    }
  }
  return unique(blockers)
}

function stableCodesFromSampleRequests(payload) {
  const requests = Array.isArray(payload?.sampleRequests)
    ? payload.sampleRequests
    : Array.isArray(payload?.sample_requests)
      ? payload.sample_requests
      : []
  return unique(requests.map((row) => text(row.stableCode ?? row.stable_code ?? row.standardWorkCode ?? row.standard_work_code))).sort()
}

function stableCodesFromCoverageRows(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  return unique(rows.map((row) => text(row.stableCode ?? row.stable_code ?? row.standardWorkCode ?? row.standard_work_code))).sort()
}

function durationSampleCollectionBlockerClosedByCoverage(blocker) {
  return [
    'accepted_real_duration_samples_required',
    'duration_sample_coverage_incomplete',
  ].includes(text(blocker))
}

function buildFiveEvidenceArgs(evidenceBundle, sourceManifestPath) {
  const evidenceFiles = Array.isArray(evidenceBundle.evidenceFiles)
    ? evidenceBundle.evidenceFiles
    : []
  const evidencePathByType = new Map(evidenceFiles
    .map((item) => [text(item.type), text(item.path)])
    .filter(([, filePath]) => filePath))
  const args = []
  for (const [type, flag] of EVIDENCE_ARG_FLAGS) {
    const filePath = evidencePathByType.get(type)
    if (filePath) args.push(flag, filePath)
  }
  if (sourceManifestPath) args.push('--source-manifest', pathForCommand(sourceManifestPath))
  return args
}

function buildSourceExportPipelineCommand(sourceManifest, identity = {}) {
  if (!Array.isArray(sourceManifest.pipelineArgs) || sourceManifest.pipelineArgs.length === 0) return ''
  const args = [...sourceManifest.pipelineArgs]
  setFlagValue(args, '--baseline-id', identity.baselineId)
  setFlagValue(args, '--project-id', identity.projectId)
  setFlagValue(args, '--publication-key', identity.publicationKey)
  setFlagValue(args, '--environment', identity.environment)
  return commandFromArgs(args)
}

function sourceExportInputPath(sourceManifest, key) {
  const sourceExport = sourceManifest?.sourceExports?.[key]
  return pathForCommand(firstText(sourceExport?.sourcePath, sourceExport?.source_path))
}

function sourceExportOutputPath(sourceManifest, key) {
  const sourceExport = sourceManifest?.sourceExports?.[key]
  return pathForCommand(firstText(sourceExport?.path, sourceExport?.outputPath, sourceExport?.output_path))
}

function normalizeRepairStep(step) {
  const record = readRecord(step)
  return {
    id: text(record.id),
    status: text(record.status),
    blockerCodes: arrayOfText(record.blockerCodes ?? record.blocker_codes),
    title: text(record.title),
    commands: arrayOfText(record.commands),
    verificationCommands: arrayOfText(record.verificationCommands ?? record.verification_commands),
    notes: arrayOfText(record.notes),
  }
}

function normalizeRuntimeSeedRepairPlan(repairPlan) {
  const record = readRecord(repairPlan)
  const orderedSteps = Array.isArray(record.orderedSteps ?? record.ordered_steps)
    ? (record.orderedSteps ?? record.ordered_steps).map((step) => normalizeRepairStep(step))
    : []
  return {
    status: text(record.status),
    targetClass: text(record.targetClass ?? record.target_class),
    noAutoInstall: record.noAutoInstall === true || record.no_auto_install === true,
    requiredStepIds: arrayOfText(record.requiredStepIds ?? record.required_step_ids),
    blockedStepIds: arrayOfText(record.blockedStepIds ?? record.blocked_step_ids),
    orderedStepCount: readNumber(record.orderedStepCount ?? record.ordered_step_count ?? orderedSteps.length),
    orderedSteps,
    manualActions: arrayOfText(record.manualActions ?? record.manual_actions),
    mutationBoundary: readRecord(record.mutationBoundary ?? record.mutation_boundary),
  }
}

function commandFromArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return ''
  return args.map((arg) => shellArg(arg)).join(' ')
}

function setFlagValue(args, flag, value) {
  const normalizedValue = text(value)
  if (!normalizedValue) return
  const index = args.indexOf(flag)
  if (index >= 0) {
    args[index + 1] = normalizedValue
  } else {
    args.push(flag, normalizedValue)
  }
}

function identityRecord(source, payload) {
  return {
    source,
    baselineId: text(payload.baselineId ?? payload.baseline_id),
    projectId: text(payload.projectId ?? payload.project_id),
  }
}

function renderMarkdown(handoff) {
  const lines = [
    '# Default Master Plan Production Operator Handoff',
    '',
    `- status: ${handoff.status}`,
    `- productionReady: ${handoff.productionReady}`,
    `- baselineId: ${handoff.baselineId}`,
    `- projectId: ${handoff.projectId}`,
    `- publicationKey: ${handoff.publicationKey}`,
    `- stagingAuthorization: ${handoff.stagingAuthorization.status}${handoff.stagingAuthorization.authorizationDecision ? ` (${handoff.stagingAuthorization.authorizationDecision})` : ''}`,
    `- currentBlockers: ${handoff.currentBlockers.length > 0 ? handoff.currentBlockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesProductionTables=false, writesTasks=false, writesTaskDependencies=false, writesDurationSamples=false, invokesRuntimeWriters=false, writesRuntimePublication=false`,
  ]
  const invalidSampleCount = readNumber(handoff.durationSampleCoverageEvidence?.invalidSampleCount)
  if (invalidSampleCount > 0) {
    lines.push(
      '',
      '## Invalid Duration Samples',
      '',
      `- invalidSampleCount: ${invalidSampleCount}`,
    )
    const blockerCounts = readRecord(handoff.durationSampleCoverageEvidence?.invalidSampleBlockerCounts)
    for (const [blocker, count] of Object.entries(blockerCounts)) {
      lines.push(`- ${blocker}: ${count}`)
    }
    const examples = Array.isArray(handoff.durationSampleCoverageEvidence?.invalidSampleExamples)
      ? handoff.durationSampleCoverageEvidence.invalidSampleExamples
      : []
    if (examples.length > 0) {
      lines.push('', '| sampleId | stableCode | blockers |', '|---|---|---|')
      for (const sample of examples) {
        lines.push(`| ${escapeTable(sample.id)} | ${escapeTable(sample.stableCode)} | ${escapeTable(arrayOfText(sample.blockers).join(', '))} |`)
      }
    }
  }
  const candidateRefreshPreflight = readRecord(handoff.candidateRefreshExecutionPreflight)
  const candidateRefreshExecution = readRecord(handoff.candidateRefreshExecution)
  const candidateRefreshAuthorizationPackage = readRecord(handoff.candidateRefreshAuthorizationPackage)
  const deferredCandidateRefreshDependent = readRecord(handoff.deferredCurrentBlockers?.candidateRefreshDependent)
  const deferredCandidateRefreshDependentBlockers = arrayOfText(deferredCandidateRefreshDependent.blockers)
  const deferredCandidateRefreshDependentBy = arrayOfText(deferredCandidateRefreshDependent.deferredBy)
  const deferredRuntimeSeedImportDependent = readRecord(handoff.deferredCurrentBlockers?.runtimeSeedImportDependent)
  const deferredRuntimeSeedImportDependentBlockers = arrayOfText(deferredRuntimeSeedImportDependent.blockers)
  const deferredRuntimeSeedImportDependentBy = arrayOfText(deferredRuntimeSeedImportDependent.deferredBy)
  const candidateRefreshExecutionTarget = readRecord(candidateRefreshExecution.target)
  const candidateRefreshDbRepairPlan = normalizeCandidateRefreshDbRepairPlan(candidateRefreshExecution.dbRepairPlan)
  const candidateRefreshExecutionGatePlan = normalizeCandidateRefreshExecutionGatePlan(candidateRefreshExecution.executionGatePlan)
  const candidateRefreshDbRepairSteps = Array.isArray(candidateRefreshDbRepairPlan.orderedSteps)
    ? candidateRefreshDbRepairPlan.orderedSteps
    : []
  const candidateRefreshExecutionNextActions = arrayOfText(candidateRefreshExecution.nextActions)
  const candidateRefreshPreflightBlockers = arrayOfText(candidateRefreshPreflight.blockers)
  const candidateRefreshExecutionBlockers = arrayOfText(candidateRefreshExecution.blockers)
  const candidateRefreshAuthorizationPackageBlockers = arrayOfText(candidateRefreshAuthorizationPackage.blockers)
  const runtimeSeedRepairPlan = normalizeRuntimeSeedRepairPlan(handoff.runtimeSeedEvidencePipeline?.environment?.repairPlan)
  const runtimeSeedRepairSteps = Array.isArray(runtimeSeedRepairPlan.orderedSteps)
    ? runtimeSeedRepairPlan.orderedSteps
    : []
  const hasCandidateRefreshGate = text(candidateRefreshPreflight.status)
    || text(candidateRefreshExecution.status)
    || text(candidateRefreshAuthorizationPackage.status)
    || candidateRefreshPreflightBlockers.length > 0
    || candidateRefreshExecutionBlockers.length > 0
    || candidateRefreshAuthorizationPackageBlockers.length > 0
  if (hasCandidateRefreshGate) {
    lines.push(
      '',
      '## Candidate Refresh Gate',
      '',
      `- candidateRefreshExecutionPreflight: ${text(candidateRefreshPreflight.status) || 'not_generated'}`,
      `- mayExecuteCandidateRefresh: ${candidateRefreshPreflight.mayExecuteCandidateRefresh === true}`,
      `- preflightBlockers: ${candidateRefreshPreflightBlockers.length > 0 ? candidateRefreshPreflightBlockers.join(', ') : 'none'}`,
      `- candidateRefreshExecution: ${text(candidateRefreshExecution.status) || 'not_generated'}`,
      `- executionBlockers: ${candidateRefreshExecutionBlockers.length > 0 ? candidateRefreshExecutionBlockers.join(', ') : 'none'}`,
      `- candidateRefreshAuthorizationPackage: ${text(candidateRefreshAuthorizationPackage.status) || 'not_generated'}`,
      `- authorizationPackageOnly: ${candidateRefreshAuthorizationPackage.packageOnly === true}`,
      `- authorizationDoesNotMutateDatabase: ${candidateRefreshAuthorizationPackage.doesNotMutateDatabase === true}`,
      `- authorizationBlockers: ${candidateRefreshAuthorizationPackageBlockers.length > 0 ? candidateRefreshAuthorizationPackageBlockers.join(', ') : 'none'}`,
    )
    if (Object.keys(candidateRefreshExecutionTarget).length > 0) {
      lines.push(
        `- executionTargetEnvFile: ${text(candidateRefreshExecutionTarget.envFileRef) || 'not_recorded'}`,
        `- executionTargetSupabaseProjectRef: ${text(candidateRefreshExecutionTarget.supabaseProjectRef) || 'not_recorded'}`,
        `- executionTargetDatabaseHost: ${text(candidateRefreshExecutionTarget.databaseHost) || 'not_recorded'}`,
        `- executionTargetConnectionSource: ${text(candidateRefreshExecutionTarget.connectionSource) || 'not_recorded'}`,
      )
    }
    if (
      text(candidateRefreshDbRepairPlan.status)
      || candidateRefreshDbRepairPlan.requiredStepIds.length > 0
      || candidateRefreshDbRepairPlan.blockedStepIds.length > 0
    ) {
      lines.push(
        `- dbRepairPlanStatus: ${text(candidateRefreshDbRepairPlan.status) || 'unknown'}`,
        `- dbRepairPlanFailureClass: ${text(candidateRefreshDbRepairPlan.failureClass) || 'unknown'}`,
        `- dbRepairPlanNoAutoCredentialRotation: ${candidateRefreshDbRepairPlan.noAutoCredentialRotation}`,
        `- dbRepairPlanRequiredStepIds: ${candidateRefreshDbRepairPlan.requiredStepIds.length > 0 ? candidateRefreshDbRepairPlan.requiredStepIds.join(', ') : 'none'}`,
        `- dbRepairPlanBlockedStepIds: ${candidateRefreshDbRepairPlan.blockedStepIds.length > 0 ? candidateRefreshDbRepairPlan.blockedStepIds.join(', ') : 'none'}`,
      )
      if (candidateRefreshDbRepairSteps.length > 0) {
        lines.push('', '| dbRepairStepId | status | blockerCodes | commandCount | verificationCount |')
        lines.push('|---|---|---|---|---|')
        for (const step of candidateRefreshDbRepairSteps) {
          lines.push([
            escapeTable(step.id),
            escapeTable(step.status),
            escapeTable(arrayOfText(step.blockerCodes).join(', ')),
            String(arrayOfText(step.commands).length),
            String(arrayOfText(step.verificationCommands).length),
          ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
          for (const command of arrayOfText(step.commands)) {
            lines.push(`- db_repair_step_command: ${step.id} | ${command}`)
          }
          for (const command of arrayOfText(step.verificationCommands)) {
            lines.push(`- db_repair_step_verification: ${step.id} | ${command}`)
          }
        }
      }
    }
    if (
      text(candidateRefreshExecutionGatePlan.status)
      || candidateRefreshExecutionGatePlan.requiredStepIds.length > 0
      || candidateRefreshExecutionGatePlan.blockedStepIds.length > 0
    ) {
      lines.push(
        `- executionGatePlanStatus: ${text(candidateRefreshExecutionGatePlan.status) || 'unknown'}`,
        `- executionGatePlanNoAutoExecution: ${candidateRefreshExecutionGatePlan.noAutoExecution}`,
        `- executionGatePlanRequiredStepIds: ${candidateRefreshExecutionGatePlan.requiredStepIds.length > 0 ? candidateRefreshExecutionGatePlan.requiredStepIds.join(', ') : 'none'}`,
        `- executionGatePlanBlockedStepIds: ${candidateRefreshExecutionGatePlan.blockedStepIds.length > 0 ? candidateRefreshExecutionGatePlan.blockedStepIds.join(', ') : 'none'}`,
      )
    }
    if (candidateRefreshExecutionNextActions.length > 0) {
      lines.push(`- executionNextActions: ${candidateRefreshExecutionNextActions.join(' | ')}`)
    }
  }
  if (
    text(runtimeSeedRepairPlan.status)
    || runtimeSeedRepairPlan.requiredStepIds.length > 0
    || runtimeSeedRepairPlan.blockedStepIds.length > 0
    || runtimeSeedRepairSteps.length > 0
  ) {
    lines.push(
      '',
      '## Runtime Seed Repair Plan',
      '',
      `- status: ${text(runtimeSeedRepairPlan.status) || 'unknown'}`,
      `- targetClass: ${text(runtimeSeedRepairPlan.targetClass) || 'unknown'}`,
      `- noAutoInstall: ${runtimeSeedRepairPlan.noAutoInstall}`,
      `- requiredStepIds: ${runtimeSeedRepairPlan.requiredStepIds.length > 0 ? runtimeSeedRepairPlan.requiredStepIds.join(', ') : 'none'}`,
      `- blockedStepIds: ${runtimeSeedRepairPlan.blockedStepIds.length > 0 ? runtimeSeedRepairPlan.blockedStepIds.join(', ') : 'none'}`,
    )
    if (runtimeSeedRepairSteps.length > 0) {
      lines.push('', '| stepId | status | blockerCodes | commandCount | verificationCount |')
      lines.push('|---|---|---|---|---|')
      for (const step of runtimeSeedRepairSteps) {
        lines.push([
          escapeTable(step.id),
          escapeTable(step.status),
          escapeTable(arrayOfText(step.blockerCodes).join(', ')),
          String(arrayOfText(step.commands).length),
          String(arrayOfText(step.verificationCommands).length),
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
      }
    }
  }
  if (
    deferredCandidateRefreshDependentBlockers.length > 0
    || deferredCandidateRefreshDependentBy.length > 0
    || deferredRuntimeSeedImportDependentBlockers.length > 0
    || deferredRuntimeSeedImportDependentBy.length > 0
  ) {
    lines.push(
      '',
      '## Deferred Current Blockers',
      '',
      `- candidateRefreshDependentDeferredBy: ${deferredCandidateRefreshDependentBy.length > 0 ? deferredCandidateRefreshDependentBy.join(', ') : 'none'}`,
      `- candidateRefreshDependentBlockers: ${deferredCandidateRefreshDependentBlockers.length > 0 ? deferredCandidateRefreshDependentBlockers.join(', ') : 'none'}`,
      `- runtimeSeedImportDependentDeferredBy: ${deferredRuntimeSeedImportDependentBy.length > 0 ? deferredRuntimeSeedImportDependentBy.join(', ') : 'none'}`,
      `- runtimeSeedImportDependentBlockers: ${deferredRuntimeSeedImportDependentBlockers.length > 0 ? deferredRuntimeSeedImportDependentBlockers.join(', ') : 'none'}`,
    )
  }
  const candidateBaselineMaterialization = readRecord(handoff.candidateBaselineMaterialization)
  const candidateBaselineMaterializationBlockers = arrayOfText(candidateBaselineMaterialization.blockers)
  const hasMaterializationGate = text(candidateBaselineMaterialization.status)
    || candidateBaselineMaterializationBlockers.length > 0
  if (hasMaterializationGate) {
    lines.push(
      '',
      '## Candidate Baseline Materialization Gate',
      '',
      `- status: ${text(candidateBaselineMaterialization.status) || 'not_generated'}`,
      `- executionAllowed: ${candidateBaselineMaterialization.executionAllowed === true}`,
      `- allowMaterialization: ${candidateBaselineMaterialization.allowMaterialization === true}`,
      `- unlockPresent: ${candidateBaselineMaterialization.unlockPresent === true}`,
      `- requiredUnlock: ${text(candidateBaselineMaterialization.requiredUnlock) || 'none'}`,
      `- mode: ${text(candidateBaselineMaterialization.mode) || 'not_set'}`,
      `- environment: ${text(candidateBaselineMaterialization.environment) || 'not_set'}`,
      `- targetReplacementRowCount: ${readNumber(candidateBaselineMaterialization.targetReplacementRowCount)}`,
      `- missingTargetRowCount: ${readNumber(candidateBaselineMaterialization.missingTargetRowCount)}`,
      `- insertedBaselineCount: ${readNumber(candidateBaselineMaterialization.insertedBaselineCount)}`,
      `- insertedItemCount: ${readNumber(candidateBaselineMaterialization.insertedItemCount)}`,
      `- blockers: ${candidateBaselineMaterializationBlockers.length > 0 ? candidateBaselineMaterializationBlockers.join(', ') : 'none'}`,
    )
  }
  const runtimeSeedImportExecution = readRecord(handoff.runtimeSeedImportExecution)
  const runtimeSeedImportExecutionBlockers = arrayOfText(runtimeSeedImportExecution.blockers)
  const runtimeSeedImportGate = readRecord(runtimeSeedImportExecution.importGate)
  const runtimeSeedPostImportVerification = readRecord(runtimeSeedImportExecution.postImportVerification)
  const runtimeSeedPostImportSeedEvidence = readRecord(runtimeSeedPostImportVerification.runtimeSeedEvidence)
  const runtimeSeedPostImportT2Evidence = readRecord(runtimeSeedPostImportVerification.runtimeT2Evidence)
  const hasRuntimeSeedImportExecutionGate = text(runtimeSeedImportExecution.status)
    || runtimeSeedImportExecutionBlockers.length > 0
    || arrayOfText(runtimeSeedImportGate.blockers).length > 0
    || arrayOfText(runtimeSeedPostImportVerification.blockers).length > 0
  if (hasRuntimeSeedImportExecutionGate) {
    lines.push(
      '',
      '## Runtime Seed Import Execution',
      '',
      `- status: ${text(runtimeSeedImportExecution.status) || 'not_generated'}`,
      `- importGate: ${text(runtimeSeedImportGate.status) || 'not_generated'}`,
      `- importAllowed: ${runtimeSeedImportGate.importAllowed === true}`,
      `- postImportVerification: ${text(runtimeSeedPostImportVerification.status) || 'not_generated'}`,
      `- activeStandardWorkDurationSeedReady: ${runtimeSeedPostImportVerification.activeStandardWorkDurationSeedReady === true}`,
      `- activeT2RhythmTemplateReady: ${runtimeSeedPostImportVerification.activeT2RhythmTemplateReady === true}`,
      `- fallbackOrMissingSeedRowCount: ${readNumber(runtimeSeedPostImportSeedEvidence.fallbackOrMissingSeedRowCount)}`,
      `- fallbackOrMissingT2RowCount: ${readNumber(runtimeSeedPostImportT2Evidence.fallbackOrMissingT2RowCount)}`,
      `- importGateBlockers: ${arrayOfText(runtimeSeedImportGate.blockers).length > 0 ? arrayOfText(runtimeSeedImportGate.blockers).join(', ') : 'none'}`,
      `- postImportBlockers: ${arrayOfText(runtimeSeedPostImportVerification.blockers).length > 0 ? arrayOfText(runtimeSeedPostImportVerification.blockers).join(', ') : 'none'}`,
      `- blockers: ${runtimeSeedImportExecutionBlockers.length > 0 ? runtimeSeedImportExecutionBlockers.join(', ') : 'none'}`,
    )
  }
  const durationAssetUtilization = readRecord(handoff.durationAssetUtilization)
  const durationAssetUtilizationBlockers = arrayOfText(durationAssetUtilization.blockers)
  const hasDurationAssetUtilization = text(durationAssetUtilization.status)
    && text(durationAssetUtilization.status) !== 'not_generated'
  if (hasDurationAssetUtilization) {
    const rowCount = readNumber(durationAssetUtilization.rowCount)
    lines.push(
      '',
      '## Duration Asset Utilization',
      '',
      `- status: ${text(durationAssetUtilization.status)}`,
      `- rowCount: ${rowCount}`,
      `- standardWorkDurationSeedRows: ${readNumber(durationAssetUtilization.rowsWithStandardWorkSeedCount)}/${rowCount}`,
      `- activeStandardWorkDurationSeedRows: ${readNumber(durationAssetUtilization.rowsWithActiveStandardWorkSeedCount)}/${rowCount}`,
      `- fallbackStandardWorkDurationSeedRows: ${readNumber(durationAssetUtilization.rowsWithFallbackStandardWorkSeedCount)}/${rowCount}`,
      `- t2RhythmTemplateRows: ${readNumber(durationAssetUtilization.rowsWithT2RhythmTemplateCount)}/${rowCount}`,
      `- activeT2RhythmTemplateRows: ${readNumber(durationAssetUtilization.rowsWithActiveT2RhythmTemplateCount)}/${rowCount}`,
      `- fallbackT2RhythmTemplateRows: ${readNumber(durationAssetUtilization.rowsWithFallbackT2RhythmTemplateCount)}/${rowCount}`,
      `- runtimeReferenceDaysRows: ${readNumber(durationAssetUtilization.rowsWithRuntimeReferenceDaysCount)}/${rowCount}`,
      `- missingRuntimeReferenceDaysRows: ${readNumber(durationAssetUtilization.rowsMissingRuntimeReferenceDaysCount)}/${rowCount}`,
      `- quantityOrProductivityRows: ${readNumber(durationAssetUtilization.rowsWithQuantityOrProductivityCount)}/${rowCount}`,
      `- dependencyEvidenceRows: ${readNumber(durationAssetUtilization.rowsWithDependencyEvidenceCount)}/${rowCount}`,
      `- dependencyAssetRows: ${readNumber(durationAssetUtilization.rowsWithDependencyAssetCount)}/${rowCount}`,
      `- dependencyTimingAssetRows: ${readNumber(durationAssetUtilization.rowsWithDependencyTimingAssetCount)}/${rowCount}`,
      `- processSeasonalDurationAssetRows: ${readNumber(durationAssetUtilization.rowsWithProcessSeasonalDurationAssetCount)}/${rowCount}`,
      `- constructionCalendarRows: ${readNumber(durationAssetUtilization.rowsWithConstructionCalendarCount)}/${rowCount}`,
      `- blockers: ${durationAssetUtilizationBlockers.length > 0 ? durationAssetUtilizationBlockers.join(', ') : 'none'}`,
    )
  }
  const completedTaskExport = readRecord(handoff.completedTaskExport)
  const completedTaskExportBlockers = arrayOfText(completedTaskExport.blockers)
  const completedTaskExportInvalidExamples = Array.isArray(completedTaskExport.invalidTaskExamples)
    ? completedTaskExport.invalidTaskExamples
    : []
  const hasCompletedTaskExportGate = text(completedTaskExport.status)
    && text(completedTaskExport.status) !== 'not_generated'
  if (hasCompletedTaskExportGate) {
    lines.push(
      '',
      '## Completed Task Export Alignment',
      '',
      `- status: ${text(completedTaskExport.status)}`,
      `- requiredStableCodeCount: ${readNumber(completedTaskExport.requiredStableCodeCount)}`,
      `- rawTaskCount: ${readNumber(completedTaskExport.rawTaskCount)}`,
      `- exportedTaskCount: ${readNumber(completedTaskExport.exportedTaskCount)}`,
      `- invalidTaskCount: ${readNumber(completedTaskExport.invalidTaskCount)}`,
      `- titleMismatchCount: ${readNumber(completedTaskExport.titleMismatchCount)}`,
      `- titleMatchedDifferentStableCodeCount: ${readNumber(completedTaskExport.titleMatchedDifferentStableCodeCount)}`,
      `- missingStableCodeCount: ${readNumber(completedTaskExport.missingStableCodeCount)}`,
      `- missingStableCodes: ${arrayOfText(completedTaskExport.missingStableCodes).length > 0 ? arrayOfText(completedTaskExport.missingStableCodes).join(', ') : 'none'}`,
      `- recommendedNextAction: ${text(completedTaskExport.recommendedNextAction) || 'none'}`,
      `- blockers: ${completedTaskExportBlockers.length > 0 ? completedTaskExportBlockers.join(', ') : 'none'}`,
    )
    if (completedTaskExportInvalidExamples.length > 0) {
      lines.push('', '| taskId | stableCode | title | expectedTitle | matchingCodeByTitle | action | blockers |', '|---|---|---|---|---|---|---|')
      for (const task of completedTaskExportInvalidExamples) {
        lines.push(`| ${escapeTable(task.id)} | ${escapeTable(task.stableCode)} | ${escapeTable(task.title)} | ${escapeTable(task.expectedTitle)} | ${escapeTable(task.matchingRequestedStableCodeByTitle)} | ${escapeTable(task.recommendedAction)} | ${escapeTable(arrayOfText(task.blockers).join(', '))} |`)
      }
    }
  }
  const runtimeCandidateAlignmentPreflight = readRecord(handoff.runtimeCandidateAlignmentPreflight)
  const runtimeCandidateAlignmentBlockers = arrayOfText(runtimeCandidateAlignmentPreflight.blockers)
  const runtimeCandidateAlignmentExamples = Array.isArray(runtimeCandidateAlignmentPreflight.driftExamples)
    ? runtimeCandidateAlignmentPreflight.driftExamples
    : []
  const hasRuntimeCandidateAlignment = text(runtimeCandidateAlignmentPreflight.status)
    && text(runtimeCandidateAlignmentPreflight.status) !== 'not_generated'
  if (hasRuntimeCandidateAlignment) {
    lines.push(
      '',
      '## Runtime Candidate Alignment Preflight',
      '',
      `- status: ${text(runtimeCandidateAlignmentPreflight.status)}`,
      `- candidateRowCount: ${readNumber(runtimeCandidateAlignmentPreflight.candidateRowCount)}`,
      `- runtimeTaskCount: ${readNumber(runtimeCandidateAlignmentPreflight.runtimeTaskCount)}`,
      `- matchedStableCodeCount: ${readNumber(runtimeCandidateAlignmentPreflight.matchedStableCodeCount)}`,
      `- missingRuntimeTaskCount: ${readNumber(runtimeCandidateAlignmentPreflight.missingRuntimeTaskCount)}`,
      `- titleMismatchCount: ${readNumber(runtimeCandidateAlignmentPreflight.titleMismatchCount)}`,
      `- titleMatchedDifferentStableCodeCount: ${readNumber(runtimeCandidateAlignmentPreflight.titleMatchedDifferentStableCodeCount)}`,
      `- rowsWithActualDateRangeCount: ${readNumber(runtimeCandidateAlignmentPreflight.rowsWithActualDateRangeCount)}`,
      `- rowsMissingActualDateRangeCount: ${readNumber(runtimeCandidateAlignmentPreflight.rowsMissingActualDateRangeCount)}`,
      `- recommendedNextAction: ${text(runtimeCandidateAlignmentPreflight.recommendedNextAction) || 'none'}`,
      `- blockers: ${runtimeCandidateAlignmentBlockers.length > 0 ? runtimeCandidateAlignmentBlockers.join(', ') : 'none'}`,
    )
    if (runtimeCandidateAlignmentExamples.length > 0) {
      lines.push('', '| stableCode | candidateTitle | runtimeTaskId | runtimeTitle | status | matchingCodeByTitle | action | blockers |', '|---|---|---|---|---|---|---|---|')
      for (const row of runtimeCandidateAlignmentExamples) {
        lines.push(`| ${escapeTable(row.stableCode)} | ${escapeTable(row.candidateTitle)} | ${escapeTable(row.runtimeTaskId)} | ${escapeTable(row.runtimeTitle)} | ${escapeTable(row.alignmentStatus)} | ${escapeTable(row.matchingCandidateStableCodeByRuntimeTitle)} | ${escapeTable(row.recommendedAction)} | ${escapeTable(arrayOfText(row.blockers).join(', '))} |`)
      }
    }
  }
  const runtimeTaskAlignmentRefreshPackage = readRecord(handoff.runtimeTaskAlignmentRefreshPackage)
  const runtimeTaskAlignmentRefreshPackageBlockers = arrayOfText(runtimeTaskAlignmentRefreshPackage.blockers)
  const runtimeTaskAlignmentRefreshPackageActions = Array.isArray(runtimeTaskAlignmentRefreshPackage.actionExamples)
    ? runtimeTaskAlignmentRefreshPackage.actionExamples
    : []
  const hasRuntimeTaskAlignmentRefreshPackage = text(runtimeTaskAlignmentRefreshPackage.status)
    && text(runtimeTaskAlignmentRefreshPackage.status) !== 'not_generated'
  if (hasRuntimeTaskAlignmentRefreshPackage) {
    lines.push(
      '',
      '## Runtime Task Alignment Refresh Package',
      '',
      `- status: ${text(runtimeTaskAlignmentRefreshPackage.status)}`,
      `- inputCandidateRowCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.inputCandidateRowCount)}`,
      `- inputRuntimeTaskCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.inputRuntimeTaskCount)}`,
      `- actionCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.actionCount)}`,
      `- stableCodeRefreshReviewActionCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.stableCodeRefreshReviewActionCount)}`,
      `- missingRuntimeTaskActionCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.missingRuntimeTaskActionCount)}`,
      `- actualDateRangeCollectionActionCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.actualDateRangeCollectionActionCount)}`,
      `- collisionReviewActionCount: ${readNumber(runtimeTaskAlignmentRefreshPackage.collisionReviewActionCount)}`,
      `- executeAllowed: ${runtimeTaskAlignmentRefreshPackage.executeAllowed === true}`,
      `- recommendedMode: ${text(runtimeTaskAlignmentRefreshPackage.recommendedMode) || 'none'}`,
      `- blockers: ${runtimeTaskAlignmentRefreshPackageBlockers.length > 0 ? runtimeTaskAlignmentRefreshPackageBlockers.join(', ') : 'none'}`,
    )
    if (runtimeTaskAlignmentRefreshPackageActions.length > 0) {
      lines.push('', '| stableCode | candidateTitle | runtimeTaskId | runtimeTitle | actionKind | proposedStableCode | operatorAction | blockers |', '|---|---|---|---|---|---|---|---|')
      for (const action of runtimeTaskAlignmentRefreshPackageActions) {
        lines.push(`| ${escapeTable(action.stableCode)} | ${escapeTable(action.candidateTitle)} | ${escapeTable(action.runtimeTaskId)} | ${escapeTable(action.runtimeTitle)} | ${escapeTable(action.actionKind)} | ${escapeTable(action.proposedStableCode)} | ${escapeTable(action.recommendedOperatorAction)} | ${escapeTable(arrayOfText(action.blockers).join(', '))} |`)
      }
    }
  }
  const runtimeTaskAlignmentReviewEvidence = readRecord(handoff.runtimeTaskAlignmentReviewEvidence)
  const runtimeTaskAlignmentReviewEvidenceBlockers = arrayOfText(runtimeTaskAlignmentReviewEvidence.blockers)
  const hasRuntimeTaskAlignmentReviewEvidence = text(runtimeTaskAlignmentReviewEvidence.status)
    && text(runtimeTaskAlignmentReviewEvidence.status) !== 'not_generated'
  if (hasRuntimeTaskAlignmentReviewEvidence) {
    lines.push(
      '',
      '## Runtime Task Alignment Review Evidence',
      '',
      `- status: ${text(runtimeTaskAlignmentReviewEvidence.status)}`,
      `- reviewedBy: ${text(runtimeTaskAlignmentReviewEvidence.reviewedBy) || 'missing'}`,
      `- actionCount: ${readNumber(runtimeTaskAlignmentReviewEvidence.actionCount)}`,
      `- reviewedActionCount: ${readNumber(runtimeTaskAlignmentReviewEvidence.reviewedActionCount)}`,
      `- acceptedStableCodeRefreshCount: ${readNumber(runtimeTaskAlignmentReviewEvidence.acceptedStableCodeRefreshCount)}`,
      `- confirmedScopeGapCount: ${readNumber(runtimeTaskAlignmentReviewEvidence.confirmedScopeGapCount)}`,
      `- acceptedActualDateRangeEvidenceCount: ${readNumber(runtimeTaskAlignmentReviewEvidence.acceptedActualDateRangeEvidenceCount)}`,
      `- collisionReviewedCount: ${readNumber(runtimeTaskAlignmentReviewEvidence.collisionReviewedCount)}`,
      `- executeAllowed: ${runtimeTaskAlignmentReviewEvidence.executeAllowed === true}`,
      `- blockers: ${runtimeTaskAlignmentReviewEvidenceBlockers.length > 0 ? runtimeTaskAlignmentReviewEvidenceBlockers.join(', ') : 'none'}`,
    )
  }
  const offlineQualityReview = readRecord(handoff.offlineDevelopmentQualityReview)
  const offlineReviewPackage = readRecord(offlineQualityReview.reviewPackage)
  const offlineReviewEvidence = readRecord(offlineQualityReview.reviewEvidence)
  const offlineReviewPreflight = readRecord(offlineQualityReview.reviewRecordPreflight)
  const reviewNotesQuality = readRecord(offlineReviewPackage.reviewNotesQuality)
  const offlineReviewFindings = arrayOfText(offlineQualityReview.qualityFindings)
  const offlineReviewMissingIds = arrayOfText(offlineReviewEvidence.missingCurrentReviewedItemIdsSample)
  const offlineReviewExtraIds = arrayOfText(offlineReviewEvidence.extraEvidenceReviewedItemIdsSample)
  const reviewNotesQualityStatus = text(reviewNotesQuality.status)
  const suggestedReviewNotes = text(reviewNotesQuality.suggestedReviewNotes)
  const hasOfflineQualityReview = text(offlineQualityReview.status)
    || text(offlineReviewEvidence.status)
    || text(offlineReviewPreflight.status)
    || reviewNotesQualityStatus
    || suggestedReviewNotes
    || offlineReviewFindings.length > 0
  if (hasOfflineQualityReview) {
    lines.push(
      '',
      '## Offline Development Quality Review',
      '',
      `- status: ${text(offlineQualityReview.status) || 'not_provided'}`,
      `- requiredForRuntime: ${offlineQualityReview.requiredForRuntime === true}`,
      `- intendedUse: ${text(offlineQualityReview.intendedUse)}`,
      `- reviewPackage: ${readNumber(offlineReviewPackage.reviewedItemCount)} rows`,
      `- reviewEvidence: ${text(offlineReviewEvidence.status) || 'missing'}`,
      `- reviewEvidenceReviewedItemCount: ${readNumber(offlineReviewEvidence.reviewedItemCount)}`,
      `- currentPackageReviewedItemCount: ${readNumber(offlineReviewEvidence.currentPackageReviewedItemCount)}`,
      `- missingCurrentReviewedItemCount: ${readNumber(offlineReviewEvidence.missingCurrentReviewedItemCount)}`,
      `- extraEvidenceReviewedItemCount: ${readNumber(offlineReviewEvidence.extraEvidenceReviewedItemCount)}`,
      `- legacyPreflightFindings: ${arrayOfText(offlineReviewPreflight.blockers).length > 0 ? arrayOfText(offlineReviewPreflight.blockers).join(', ') : 'none'}`,
    )
    if (reviewNotesQualityStatus || suggestedReviewNotes) {
      lines.push(
        '',
        '### Review Notes Quality',
        '',
        `- status: ${reviewNotesQualityStatus || 'not_evaluated'}`,
        `- statedItemCount: ${readNumber(reviewNotesQuality.statedItemCount)}`,
        `- actualReviewedItemCount: ${readNumber(reviewNotesQuality.actualReviewedItemCount)}`,
      )
      if (suggestedReviewNotes) {
        lines.push(`- suggestedReviewNotes: ${suggestedReviewNotes}`)
      }
    }
    if (offlineReviewMissingIds.length > 0) {
      lines.push(`- missingCurrentReviewedItemIdsSample: ${offlineReviewMissingIds.join(', ')}`)
    }
    if (offlineReviewExtraIds.length > 0) {
      lines.push(`- extraEvidenceReviewedItemIdsSample: ${offlineReviewExtraIds.join(', ')}`)
    }
    if (offlineReviewFindings.length > 0) {
      lines.push(`- qualityFindings: ${offlineReviewFindings.join(', ')}`)
    }
  }
  lines.push(
    '',
    '## Action Sequence',
    '',
    '| # | id | gate | command |',
    '|---:|---|---|---|',
  )
  handoff.actionSequence.forEach((action, index) => {
    lines.push(`| ${index + 1} | ${escapeTable(action.id)} | ${escapeTable(action.gate)} | ${escapeTable(action.command)} |`)
  })
  lines.push('', '## Artifacts', '', '| key | path |', '|---|---|')
  for (const [key, value] of Object.entries(handoff.artifacts)) {
    lines.push(`| ${escapeTable(key)} | ${escapeTable(value)} |`)
  }
  return `${lines.join('\n')}\n`
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function arrayOfText(value) {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(Boolean)
}

function isLegacyRuntimePmReviewBlocker(value) {
  const blocker = text(value).toLowerCase()
  return blocker === 'project_manager_review_required'
    || blocker === 'project_manager_review_evidence'
    || blocker === 'candidate_default_master_plan_review_missing'
    || blocker === 'project_manager_review_required_after_candidate_refresh'
    || blocker.startsWith('pm_review_')
    || blocker.startsWith('project_manager_review_')
    || blocker.startsWith('candidate_governance_review_')
    || blocker.startsWith('review_notes_')
}

function sampleTextList(value, limit = 10) {
  return arrayOfText(value).slice(0, limit)
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArrayLength(value) {
  return Array.isArray(value) ? value.length : 0
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function isCandidateRefreshActiveBlocker(blocker) {
  const normalized = text(blocker)
  return normalized === 'candidate_baseline_refresh_required_before_runtime_publication'
    || normalized === 'candidate_refresh_db_connection_failed'
    || normalized === 'candidate_refresh_db_execution_failed'
    || normalized === 'candidate_refresh_target_baseline_not_found'
    || normalized === 'candidate_refresh_execution_failed'
    || normalized === 'candidate_refresh_unlock_required'
    || normalized === 'candidate_refresh_operator_approval_required'
    || normalized.startsWith('candidate_refresh_execution_')
}

function isCandidateRefreshDependentReadinessGate(gateId) {
  return [
    'duration_sample_collection_package',
    'runtime_duration_calibration_evidence',
    'runtime_evidence_lineage_consistency',
  ].includes(text(gateId))
}

function isRuntimeSeedImportRootBlocker(blocker) {
  const normalized = text(blocker)
  if (!normalized) return false
  if (normalized.includes('local_supabase')) return true
  if (normalized.includes('supabase_cli_missing')) return true
  if (normalized.includes('docker_cli_missing')) return true
  if (normalized.includes('local_duration_asset_seed_import_unlock_required')) return true
  return [
    'runtime_seed_pipeline_status_runtime_seed_import_blocked',
    'runtime_seed_pipeline_runtime_seed_import_required',
    'runtime_seed_pipeline_runtime_seed_preflight_not_ready',
    'runtime_seed_import_execution_status_runtime_seed_import_execution_blocked',
    'runtime_seed_import_execution_import_gate_not_allowed',
    'runtime_seed_import_execution_runtime_seed_import_gate_not_allowed',
    'runtime_seed_import_execution_runtime_seed_import_execution_allow_import_required',
    'runtime_seed_import_execution_runtime_seed_import_seed_smoke_user_id_required',
  ].includes(normalized)
}

function isRuntimeSeedImportDependentBlocker(blocker) {
  const normalized = text(blocker)
  if (!normalized) return false
  return [
    'runtime_seed_pipeline_runtime_seed_business_type_evidence_missing',
    'runtime_seed_pipeline_runtime_reference_days_evidence_missing',
    'runtime_seed_pipeline_stable_code_coverage_incomplete',
    'runtime_seed_pipeline_runtime_seed_post_import_profile_rows_not_all_runtime',
    'runtime_seed_pipeline_runtime_t2_post_import_profile_rows_not_all_runtime',
    'runtime_seed_pipeline_runtime_seed_required_stable_codes_not_consumed_by_profile',
    'runtime_seed_pipeline_runtime_seed_import_control_evidence_missing',
    'runtime_seed_pipeline_runtime_seed_post_import_verification_not_verified',
    'runtime_seed_pipeline_runtime_seed_post_import_active_standard_work_seed_not_ready',
    'runtime_seed_pipeline_runtime_seed_post_import_active_t2_rhythm_template_not_ready',
    'runtime_seed_import_execution_post_import_status_not_provided',
    'runtime_seed_import_execution_post_import_status_runtime_seed_post_import_blocked',
    'runtime_seed_import_execution_active_standard_work_seed_not_ready',
    'runtime_seed_import_execution_active_t2_rhythm_template_not_ready',
    'runtime_seed_import_execution_runtime_seed_post_import_profile_rows_not_all_runtime',
    'runtime_seed_import_execution_runtime_t2_post_import_profile_rows_not_all_runtime',
    'runtime_seed_import_execution_runtime_seed_post_import_verification_file_required',
  ].includes(normalized)
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function sha256File(filePath) {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function selectOperatorHandoffSourceManifestPath({ canonicalPath = '', bundlePath = '' } = {}) {
  return text(canonicalPath) || text(bundlePath)
}

function resolveArtifactPath(filePath) {
  const normalized = text(filePath)
  if (!normalized) return ''
  return path.isAbsolute(normalized) ? normalized : path.resolve(REPO_ROOT, normalized)
}

function pathForCommand(filePath) {
  const normalized = text(filePath)
  if (!normalized) return ''
  if (path.isAbsolute(normalized)) return repoRelative(normalized).startsWith('..') ? normalized.replace(/\\\\/g, '/') : repoRelative(normalized)
  return normalized.replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function shellArg(value) {
  const normalized = text(value)
  if (!normalized) return '""'
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(normalized)) return normalized
  return `"${normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/build-default-master-plan-production-operator-handoff.mjs --candidate-baseline <json> --duration-gap-plan <json> --discovery <json> --readiness <json> --evidence-bundle <json> [--publication-key <key>] [--review-evidence <json>] [--review-package <json>] [--review-record-preflight <json>] [--candidate-hygiene <json>] [--candidate-refresh-package <json>] [--duration-asset-utilization <json>] [--runtime-seed-evidence-pipeline <json>] [--candidate-refresh-execution <json>] [--candidate-refresh-authorization-package <json>] [--candidate-baseline-materialization <json>] [--duration-sample-collection-package <json>] [--duration-sample-coverage-evidence <json>] [--runtime-material-package <json>] [--staging-authorization <json>] [--environment staging] [--exported-by <actor>] [--writer-result <json>] [--critical-path-readback <json>] [--api-read-smoke <json>] [--ui-consumption-smoke <json>] [--rollback-verification <json>] [--output <json>]`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const handoff = await buildDefaultMasterPlanProductionOperatorHandoff(options)
    console.log(JSON.stringify({
      status: handoff.status,
      productionReady: handoff.productionReady,
      baselineId: handoff.baselineId,
      projectId: handoff.projectId,
      currentBlockers: handoff.currentBlockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
