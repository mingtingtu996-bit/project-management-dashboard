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
  'runtime-seed-evidence-preflight.json',
)

const RUNTIME_SEED_SOURCES = new Set(['project_override', 'company_override', 'active_seed'])
const RUNTIME_T2_SOURCES = new Set(['project_override', 'company_override', 'active_seed'])

export function parseArgs(argv) {
  const args = {
    profileReport: DEFAULT_PROFILE_REPORT,
    output: DEFAULT_OUTPUT,
    failOnBlocker: false,
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
    if (arg === '--fail-on-blocker') {
      args.failOnBlocker = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/build-default-master-plan-runtime-seed-evidence-preflight.mjs [--profile-report <json>] [--output <json>] [--fail-on-blocker]')
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

function countBy(items, selector) {
  const counts = {}
  for (const item of items) {
    const key = text(selector(item)) || 'missing'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function uniqueSorted(items) {
  return [...new Set(items.map(text).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function rowUsesRuntimeSeed(row) {
  return RUNTIME_SEED_SOURCES.has(text(row.standardWorkDurationSeedResolverSource))
}

function rowUsesRuntimeReferenceDays(row) {
  return row.runtimeReferenceDaysConsumed === true || row.runtime_reference_days_consumed === true
}

function rowUsesRuntimeT2(row) {
  return RUNTIME_T2_SOURCES.has(text(row.t2RhythmTemplateResolverSource ?? row.t2_rhythm_template_resolver_source))
}

function buildBusinessTypeSeedSummary(item) {
  const profileRows = readArray(item.profileRows).map(readRecord)
  const runtimeSeedRows = profileRows.filter(rowUsesRuntimeSeed)
  const fallbackRows = profileRows.filter((row) => !rowUsesRuntimeSeed(row))
  const runtimeT2Rows = profileRows.filter(rowUsesRuntimeT2)
  const fallbackT2Rows = profileRows.filter((row) => !rowUsesRuntimeT2(row))
  const runtimeReferenceRows = profileRows.filter(rowUsesRuntimeReferenceDays)
  const runtimeReferenceMissingRows = profileRows.filter((row) => !rowUsesRuntimeReferenceDays(row))
  const missingStableCodes = uniqueSorted(fallbackRows.map((row) => row.durationAssetStableCode))
  const missingT2TemplateIds = uniqueSorted(fallbackT2Rows.map((row) => row.t2RhythmTemplateId ?? row.t2_rhythm_template_id))
  const profileRowCount = Number(item.profileRowCount ?? profileRows.length)
  const runtimeSeedEvidenceReady = profileRows.length > 0 && runtimeSeedRows.length === profileRows.length
  const runtimeT2EvidenceReady = profileRows.length > 0 && runtimeT2Rows.length === profileRows.length
  const runtimeReferenceDaysEvidenceReady = profileRows.length > 0 && runtimeReferenceRows.length === profileRows.length
  return {
    businessType: text(item.businessType),
    profileRowCount,
    runtimeSeedEvidenceReady,
    runtimeSeedRowCount: runtimeSeedRows.length,
    fallbackOrMissingSeedRowCount: fallbackRows.length,
    runtimeT2EvidenceReady,
    runtimeT2RowCount: runtimeT2Rows.length,
    fallbackOrMissingT2RowCount: fallbackT2Rows.length,
    runtimeReferenceDaysEvidenceReady,
    runtimeReferenceDaysConsumedRowCount: runtimeReferenceRows.length,
    runtimeReferenceDaysMissingRowCount: runtimeReferenceMissingRows.length,
    seedResolverSourceCounts: readRecord(item.seedResolverSourceCounts) && Object.keys(readRecord(item.seedResolverSourceCounts)).length > 0
      ? readRecord(item.seedResolverSourceCounts)
      : countBy(profileRows, (row) => row.standardWorkDurationSeedResolverSource),
    requiredRuntimeSeedStableCodes: missingStableCodes,
    requiredT2RhythmTemplateIds: missingT2TemplateIds,
    requiredRuntimeReferenceStableCodes: uniqueSorted(runtimeReferenceMissingRows.map((row) => row.code || row.durationAssetStableCode)),
    sampleFallbackRows: fallbackRows.slice(0, 8).map((row) => ({
      code: text(row.code),
      title: text(row.title),
      durationAssetStableCode: text(row.durationAssetStableCode),
      resolverSource: text(row.standardWorkDurationSeedResolverSource) || 'missing',
      resolverVersionId: text(row.standardWorkDurationSeedResolverVersionId) || null,
    })),
    sampleFallbackT2Rows: fallbackT2Rows.slice(0, 8).map((row) => ({
      code: text(row.code),
      title: text(row.title),
      t2RhythmTemplateId: text(row.t2RhythmTemplateId ?? row.t2_rhythm_template_id),
      resolverSource: text(row.t2RhythmTemplateResolverSource ?? row.t2_rhythm_template_resolver_source) || 'missing',
      resolverVersionId: text(row.t2RhythmTemplateResolverVersionId ?? row.t2_rhythm_template_resolver_version_id) || null,
    })),
  }
}

export function buildRuntimeSeedEvidencePreflight({ report, profileReportPath, profileReportSha256 }) {
  const record = readRecord(report)
  const businessTypes = readArray(record.businessTypes).map(readRecord)
  const summaries = businessTypes.map(buildBusinessTypeSeedSummary)
  const missingBusinessTypes = summaries
    .filter((item) => !item.runtimeSeedEvidenceReady)
    .map((item) => item.businessType)
  const missingRuntimeT2BusinessTypes = summaries
    .filter((item) => !item.runtimeT2EvidenceReady)
    .map((item) => item.businessType)
  const missingRuntimeReferenceBusinessTypes = summaries
    .filter((item) => !item.runtimeReferenceDaysEvidenceReady)
    .map((item) => item.businessType)
  const requiredStableCodes = uniqueSorted(summaries.flatMap((item) => item.requiredRuntimeSeedStableCodes))
  const requiredT2RhythmTemplateIds = uniqueSorted(summaries.flatMap((item) => item.requiredT2RhythmTemplateIds))
  const requiredRuntimeReferenceStableCodes = uniqueSorted(summaries.flatMap((item) => item.requiredRuntimeReferenceStableCodes))
  const seedSmokeImport = readRecord(record.seedSmokeImport)
  const seedSmokePreflightBlockers = [
    text(seedSmokeImport.status) === 'preflight_failed' ? 'standard_duration_seed_preflight_failed' : null,
    text(seedSmokeImport.blockedReason) || null,
  ].filter(Boolean)
  const blockers = [
    businessTypes.length > 0 ? null : 'profile_report_business_types_required',
    missingBusinessTypes.length === 0 ? null : 'runtime_seed_evidence_missing',
    missingRuntimeT2BusinessTypes.length === 0 ? null : 'active_t2_rhythm_template_evidence_missing',
    missingRuntimeReferenceBusinessTypes.length === 0 ? null : 'runtime_reference_days_evidence_missing',
  ].filter(Boolean)

  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-preflight/v1',
    source: 'build-default-master-plan-runtime-seed-evidence-preflight',
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? 'runtime_seed_evidence_ready' : 'blocked',
    profileReport: {
      path: profileReportPath ? repoRelative(profileReportPath) : null,
      sha256: profileReportSha256 || null,
      source: text(record.source),
      businessTypeCount: businessTypes.length,
    },
    runtimeSeedEvidence: {
      readyBusinessTypeCount: summaries.length - missingBusinessTypes.length,
      missingBusinessTypeCount: missingBusinessTypes.length,
      missingBusinessTypes,
      requiredRuntimeSeedStableCodes: requiredStableCodes,
      recommendedRuntimeSeedStableCodes: requiredStableCodes,
      resolverSourcesAcceptedAsRuntime: [...RUNTIME_SEED_SOURCES],
    },
    runtimeT2Evidence: {
      readyBusinessTypeCount: summaries.length - missingRuntimeT2BusinessTypes.length,
      missingBusinessTypeCount: missingRuntimeT2BusinessTypes.length,
      missingBusinessTypes: missingRuntimeT2BusinessTypes,
      requiredT2RhythmTemplateIds,
      recommendedT2RhythmTemplateIds: requiredT2RhythmTemplateIds,
      resolverSourcesAcceptedAsRuntime: [...RUNTIME_T2_SOURCES],
    },
    runtimeReferenceDaysEvidence: {
      readyBusinessTypeCount: summaries.length - missingRuntimeReferenceBusinessTypes.length,
      missingBusinessTypeCount: missingRuntimeReferenceBusinessTypes.length,
      missingBusinessTypes: missingRuntimeReferenceBusinessTypes,
      requiredRuntimeReferenceStableCodes,
      evidenceLevelRequired: 'runtime_calibrated_l2',
    },
    seedSmokeImport: {
      status: text(seedSmokeImport.status) || 'not_requested',
      mode: text(seedSmokeImport.mode) || 'not_requested',
      targetClass: text(seedSmokeImport.targetClass) || 'unknown',
      blockedReason: text(seedSmokeImport.blockedReason) || null,
      requiredEnv: text(seedSmokeImport.requiredEnv) || null,
      preflightError: readRecord(seedSmokeImport.preflightError),
      blockers: seedSmokePreflightBlockers,
      mutationBoundary: readRecord(seedSmokeImport.mutationBoundary),
    },
    nextActions: {
      readOnlyPreflightCommand: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --preflight-standard-duration-seed-smoke',
      localImportCommand: 'set WORKBUDDY_ALLOW_STANDARD_DURATION_SEED_SMOKE_IMPORT=1 && npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-standard-duration-seed-smoke',
      remoteImportAdditionalUnlock: 'WORKBUDDY_ALLOW_REMOTE_STANDARD_DURATION_SEED_SMOKE_IMPORT=1',
      rerunEvidenceCommand: 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs',
      note: 'Import command is intentionally gated. Do not use it against remote Supabase without explicit remote unlock and operator approval.',
    },
    businessTypes: summaries,
    blockers,
    productionReady: false,
    mutationBoundary: {
      readsProfileReport: true,
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

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

export async function buildPreflightFromFile(args) {
  const raw = await fs.readFile(args.profileReport, 'utf8')
  const report = JSON.parse(raw)
  const profileReportSha256 = await sha256File(args.profileReport)
  return buildRuntimeSeedEvidencePreflight({
    report,
    profileReportPath: args.profileReport,
    profileReportSha256,
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const preflight = await buildPreflightFromFile(args)
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(preflight, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: preflight.status,
    output: repoRelative(args.output),
    missingBusinessTypeCount: preflight.runtimeSeedEvidence.missingBusinessTypeCount,
    requiredRuntimeSeedStableCodeCount: preflight.runtimeSeedEvidence.requiredRuntimeSeedStableCodes.length,
    blockers: preflight.blockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnBlocker && preflight.status === 'blocked') process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
