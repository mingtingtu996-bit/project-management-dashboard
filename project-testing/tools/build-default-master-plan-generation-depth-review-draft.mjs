#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_PROFILE_REPORT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'default-master-plan-profiles',
  'default-master-plan-profile-samples.json',
)
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'default-master-plan-profiles',
  'generation-depth-review-manifest.draft.json',
)

const ALLOWED_REMAINING_BLOCKERS = new Set([
  'runtime_seed_evidence_missing',
  'runtime_reference_days_evidence_missing',
  'active_standard_duration_seed_evidence_missing',
  'active_t2_rhythm_template_evidence_missing',
])

export function parseArgs(argv) {
  const args = {
    profileReport: DEFAULT_PROFILE_REPORT,
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile-report') {
      args.profileReport = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/build-default-master-plan-generation-depth-review-draft.mjs [--profile-report <json>] [--output <json>]')
      process.exit(0)
    }
  }
  return args
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return String(value ?? '').trim()
}

function hasOnlyAllowedProductionBlockers(blockers) {
  return readArray(blockers).every((blocker) => ALLOWED_REMAINING_BLOCKERS.has(text(blocker)))
}

export function buildGenerationDepthReviewDraft({ report, profileReportPath, profileReportSha256 }) {
  const record = readRecord(report)
  const businessTypes = readArray(record.businessTypes).map(readRecord)
  const failedBusinessTypes = readArray(record.failedBusinessTypes)
  const blockers = readArray(record.productionReadinessBlockers).map(text).filter(Boolean)
  const qualityBlockers = []

  if (businessTypes.length === 0) qualityBlockers.push('business_type_samples_required')
  if (failedBusinessTypes.length > 0) qualityBlockers.push('failed_business_types_must_be_empty')
  if (!hasOnlyAllowedProductionBlockers(blockers)) qualityBlockers.push('unexpected_production_readiness_blocker_present')

  for (const item of businessTypes) {
    const businessType = text(item.businessType)
    const gaps = readArray(item.gaps).map(text).filter(Boolean)
    const itemBlockers = readArray(item.productionReadinessBlockers).map(text).filter(Boolean)
    if (text(item.reviewStatus) !== 'candidate_master_plan_reviewable') {
      qualityBlockers.push(`${businessType}:review_status_not_candidate_reviewable`)
    }
    if (gaps.length > 0) qualityBlockers.push(`${businessType}:profile_gaps_present`)
    if (Number(item.profileRowCount ?? 0) < 6 || Number(item.profileRowCount ?? 0) > 12) {
      qualityBlockers.push(`${businessType}:profile_row_count_outside_6_12`)
    }
    if (item.profileDurationEvidenceReady !== true) qualityBlockers.push(`${businessType}:duration_evidence_missing`)
    if (item.profileDependencyEvidenceReady !== true) qualityBlockers.push(`${businessType}:dependency_evidence_missing`)
    if (Number(item.profileDependencyDateViolationCount ?? 0) !== 0) {
      qualityBlockers.push(`${businessType}:dependency_date_violation`)
    }
    if (!hasOnlyAllowedProductionBlockers(itemBlockers)) {
      qualityBlockers.push(`${businessType}:unexpected_production_readiness_blocker_present`)
    }
  }

  const businessTypeSummaries = businessTypes.map((item) => ({
    businessType: text(item.businessType),
    scheduleRowCount: Number(item.scheduleRowCount ?? 0),
    profileRowCount: Number(item.profileRowCount ?? 0),
    profilePhaseAnchorRowCount: Number(item.profilePhaseAnchorRowCount ?? 0),
    profileDurationEvidenceReady: item.profileDurationEvidenceReady === true,
    profileDependencyEvidenceReady: item.profileDependencyEvidenceReady === true,
    profileDependencyDateViolationCount: Number(item.profileDependencyDateViolationCount ?? 0),
    reviewStatus: text(item.reviewStatus),
    productionReadinessBlockers: readArray(item.productionReadinessBlockers).map(text).filter(Boolean),
    window: readRecord(item.window),
  }))

  return {
    schemaVersion: 'workbuddy-default-master-plan-offline-development-quality-review-draft/v1',
    source: 'build-default-master-plan-generation-depth-review-draft',
    generatedAt: new Date().toISOString(),
    status: qualityBlockers.length > 0 ? 'blocked' : 'ready_for_offline_model_review',
    requiredForRuntime: false,
    productionReadinessImpact: 'none',
    reviewTarget: {
      intendedUse: 'offline_development_quality_review_and_template_calibration',
      reviewerRole: 'construction_project_manager_simulation',
      reportSource: text(record.source) || 'generate-default-master-plan-profile-report',
      profileReportPath: profileReportPath ? repoRelative(profileReportPath) : null,
      profileReportSha256: profileReportSha256 || null,
      businessTypeCount: businessTypes.length,
      failedBusinessTypeCount: failedBusinessTypes.length,
    },
    reviewerInstructions: {
      requiredStatusToComplete: 'completed',
      allowedVerdicts: ['accepted', 'changes_required'],
      requiredMutationBoundary: 'offline_development_quality_review_only_no_runtime_write',
      note: 'An offline model acting as a construction project manager reviews missing work, duration, sequence, and specialty-chain defects. Findings drive template, rule, and regression updates; they are not runtime approval evidence.',
    },
    reviews: qualityBlockers.length > 0
      ? []
      : [
          {
            status: 'pending_model_review',
            reviewerRole: 'construction_project_manager_simulation',
            modelRef: '',
            reviewedAt: '',
            verdict: '',
            findings: [],
            recommendedTemplateChanges: [],
            businessTypes: businessTypeSummaries.map((item) => item.businessType),
            mutationBoundary: 'offline_development_quality_review_only_no_runtime_write',
            evidence: {
              profileReportPath: profileReportPath ? repoRelative(profileReportPath) : null,
              profileReportSha256: profileReportSha256 || null,
              reviewableBusinessTypeCount: businessTypeSummaries.length,
              profileDependencyDateViolationCount: businessTypeSummaries.reduce((sum, item) => sum + item.profileDependencyDateViolationCount, 0),
            },
          },
        ],
    businessTypes: businessTypeSummaries,
    qualityBlockers,
    mutationBoundary: {
      readsProfileReport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
    },
  }
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

export async function buildDraftFromFile(args) {
  const raw = await fs.readFile(args.profileReport, 'utf8')
  const report = JSON.parse(raw)
  const profileReportSha256 = await sha256File(args.profileReport)
  return buildGenerationDepthReviewDraft({
    report,
    profileReportPath: args.profileReport,
    profileReportSha256,
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const draft = await buildDraftFromFile(args)
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(draft, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: draft.status,
    output: repoRelative(args.output),
    businessTypeCount: draft.reviewTarget.businessTypeCount,
    qualityBlockers: draft.qualityBlockers,
    productionReady: false,
  }, null, 2))
  if (draft.status === 'blocked') process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
