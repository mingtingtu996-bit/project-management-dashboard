#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_PROFILE_REPORT = path.join(DEFAULT_REPORT_ROOT, 'default-master-plan-profile-samples.json')
const DEFAULT_PREFLIGHT_REPORT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-evidence-preflight.json')
const DEFAULT_COVERAGE_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-coverage-package.json')
const DEFAULT_IMPORT_GATE = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-gate.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-post-import-verification.json')

const RUNTIME_SEED_SOURCES = new Set(['project_override', 'company_override', 'active_seed'])
const RUNTIME_T2_SOURCES = new Set(['project_override', 'company_override', 'active_seed'])

export function parseArgs(argv) {
  const args = {
    profileReport: DEFAULT_PROFILE_REPORT,
    runtimeSeedPreflight: DEFAULT_PREFLIGHT_REPORT,
    coveragePackage: DEFAULT_COVERAGE_PACKAGE,
    importGate: DEFAULT_IMPORT_GATE,
    seedSmokeImportEvidence: null,
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
    if (arg === '--runtime-seed-preflight') {
      args.runtimeSeedPreflight = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--coverage-package') {
      args.coveragePackage = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--import-gate') {
      args.importGate = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--seed-smoke-import-evidence') {
      args.seedSmokeImportEvidence = path.resolve(argv[index + 1] ?? '')
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
      console.log('Usage: node project-testing/tools/check-default-master-plan-runtime-seed-post-import.mjs [--profile-report <json>] [--runtime-seed-preflight <json>] [--coverage-package <json>] [--import-gate <json>] [--output <json>] [--fail-on-blocker]')
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

function uniqueSorted(values) {
  return uniqueStrings(values).sort((left, right) => left.localeCompare(right))
}

function repoRelative(filePath) {
  return filePath ? path.relative(REPO_ROOT, filePath).replace(/\\/g, '/') : null
}

function sha256Text(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function readJsonWithHash(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return {
    path: filePath,
    sha256: sha256Text(raw),
    json: JSON.parse(raw),
  }
}

function countBy(items, selector) {
  const counts = {}
  for (const item of items) {
    const key = text(selector(item)) || 'missing'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

function sourceIsRuntime(row) {
  return RUNTIME_SEED_SOURCES.has(text(row.standardWorkDurationSeedResolverSource))
}

function t2SourceIsRuntime(row) {
  return RUNTIME_T2_SOURCES.has(text(row.t2RhythmTemplateResolverSource ?? row.t2_rhythm_template_resolver_source))
}

function businessTypeProfileRows(businessTypeRecord) {
  return readArray(businessTypeRecord.profileRows).map(readRecord)
}

function flattenProfileRows(profileReport) {
  const businessTypes = readArray(readRecord(profileReport).businessTypes).map(readRecord)
  return businessTypes.flatMap((businessTypeRecord) => businessTypeProfileRows(businessTypeRecord).map((row) => ({
    ...row,
    businessType: text(row.businessType) || text(businessTypeRecord.businessType),
  })))
}

function summarizeBusinessType(businessTypeRecord) {
  const businessType = text(businessTypeRecord.businessType)
  const rows = businessTypeProfileRows(businessTypeRecord)
  const runtimeRows = rows.filter(sourceIsRuntime)
  const fallbackRows = rows.filter((row) => !sourceIsRuntime(row))
  const runtimeT2Rows = rows.filter(t2SourceIsRuntime)
  const fallbackT2Rows = rows.filter((row) => !t2SourceIsRuntime(row))
  return {
    businessType,
    profileRowCount: rows.length,
    runtimeSeedRowCount: runtimeRows.length,
    fallbackOrMissingSeedRowCount: fallbackRows.length,
    runtimeT2RowCount: runtimeT2Rows.length,
    fallbackOrMissingT2RowCount: fallbackT2Rows.length,
    runtimeStableCodes: uniqueSorted(runtimeRows.map((row) => row.durationAssetStableCode)),
    fallbackStableCodes: uniqueSorted(fallbackRows.map((row) => row.durationAssetStableCode)),
    runtimeT2TemplateIds: uniqueSorted(runtimeT2Rows.map((row) => row.t2RhythmTemplateId ?? row.t2_rhythm_template_id)),
    fallbackT2TemplateIds: uniqueSorted(fallbackT2Rows.map((row) => row.t2RhythmTemplateId ?? row.t2_rhythm_template_id)),
    seedResolverSourceCounts: countBy(rows, (row) => row.standardWorkDurationSeedResolverSource),
    t2ResolverSourceCounts: countBy(rows, (row) => row.t2RhythmTemplateResolverSource ?? row.t2_rhythm_template_resolver_source),
    status: rows.length > 0 && fallbackRows.length === 0
      ? fallbackT2Rows.length === 0
        ? 'runtime_seed_and_t2_rows_all_runtime'
        : 'runtime_seed_rows_runtime_t2_rows_not_all_runtime'
      : 'runtime_seed_rows_not_all_runtime',
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

function sourceRef(key, loaded) {
  const record = readRecord(loaded?.json)
  return {
    key,
    path: repoRelative(loaded?.path),
    sha256: loaded?.sha256 ?? null,
    schemaVersion: text(record.schemaVersion) || null,
    source: text(record.source) || null,
    status: text(record.status) || null,
  }
}

function coverageIsComplete(coveragePackage) {
  const coverage = readRecord(readRecord(coveragePackage).coverage)
  const requiredStableCodes = readArray(coverage.requiredStableCodes)
  return requiredStableCodes.length > 0
    && Number(coverage.missingStableCodeCount ?? 0) === 0
    && Number(coverage.coveredStableCodeCount ?? 0) >= requiredStableCodes.length
    && text(readRecord(coveragePackage).status) === 'ts_seed_coverage_complete_runtime_import_still_required'
}

function preflightIsReady(preflight) {
  const evidence = readRecord(readRecord(preflight).runtimeSeedEvidence)
  return text(readRecord(preflight).status) === 'runtime_seed_evidence_ready'
    && Number(evidence.missingBusinessTypeCount ?? 0) === 0
}

function importControlEvidenceReady(profileReport, importGate) {
  const seedSmokeImport = readRecord(readRecord(profileReport).seedSmokeImport)
  const gate = readRecord(readRecord(importGate).importGate)
  return text(seedSmokeImport.status) === 'imported'
    || gate.importAllowed === true
}

function importedSeedReceiptIsReady(seedSmokeImportEvidence) {
  const seedSmokeImport = readRecord(readRecord(seedSmokeImportEvidence).seedSmokeImport)
  const seedTypes = new Set(readArray(seedSmokeImport.seedTypes).map(text))
  return text(seedSmokeImport.status) === 'imported'
    && seedSmokeImport.allowed === true
    && text(seedSmokeImport.mode) === 'import_active_seed'
    && seedTypes.has('standard_work_duration')
    && seedTypes.has('t2_division_rhythm_template')
    && ['local_supabase', 'remote_supabase'].includes(text(seedSmokeImport.targetClass))
}

export function buildRuntimeSeedPostImportVerification({
  profileReport,
  runtimeSeedPreflight,
  coveragePackage,
  importGate,
  seedSmokeImportEvidence = null,
  loadedRefs = {},
  generatedAt = new Date().toISOString(),
}) {
  const profile = readRecord(profileReport)
  const businessTypes = readArray(profile.businessTypes).map(readRecord)
  const profileRows = flattenProfileRows(profile)
  const runtimeRows = profileRows.filter(sourceIsRuntime)
  const fallbackRows = profileRows.filter((row) => !sourceIsRuntime(row))
  const runtimeT2Rows = profileRows.filter(t2SourceIsRuntime)
  const fallbackT2Rows = profileRows.filter((row) => !t2SourceIsRuntime(row))
  const coverage = readRecord(readRecord(coveragePackage).coverage)
  const requiredStableCodes = uniqueSorted(coverage.requiredStableCodes)
  const runtimeStableCodes = uniqueSorted(runtimeRows.map((row) => row.durationAssetStableCode))
  const missingRuntimeStableCodes = requiredStableCodes.filter((stableCode) => !runtimeStableCodes.includes(stableCode))
  const businessTypeSummaries = businessTypes.map(summarizeBusinessType)
  const coverageComplete = coverageIsComplete(coveragePackage)
  const preflightReady = preflightIsReady(runtimeSeedPreflight)
  const importReceiptReady = importedSeedReceiptIsReady(seedSmokeImportEvidence)
  const importEvidenceReady = preflightReady || importReceiptReady
  const allProfileRowsRuntime = profileRows.length > 0 && fallbackRows.length === 0
  const allProfileT2RowsRuntime = profileRows.length > 0 && fallbackT2Rows.length === 0
  const importControlReady = importControlEvidenceReady(profileReport, importGate)
  const blockers = [
    profileRows.length > 0 ? null : 'profile_report_profile_rows_required',
    coverageComplete ? null : 'runtime_seed_coverage_package_not_complete',
    importEvidenceReady ? null : 'runtime_seed_preflight_or_import_receipt_not_ready',
    allProfileRowsRuntime ? null : 'runtime_seed_post_import_profile_rows_not_all_runtime',
    allProfileT2RowsRuntime ? null : 'runtime_t2_post_import_profile_rows_not_all_runtime',
    missingRuntimeStableCodes.length === 0 ? null : 'runtime_seed_required_stable_codes_not_consumed_by_profile',
    importControlReady ? null : 'runtime_seed_import_control_evidence_missing',
  ].filter(Boolean)

  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-post-import-verification/v1',
    source: 'check-default-master-plan-runtime-seed-post-import',
    generatedAt,
    status: blockers.length === 0
      ? 'runtime_seed_post_import_verified'
      : 'runtime_seed_post_import_blocked',
    sources: {
      profileReport: sourceRef('profileReport', loadedRefs.profileReport),
      runtimeSeedPreflight: sourceRef('runtimeSeedPreflight', loadedRefs.runtimeSeedPreflight),
      coveragePackage: sourceRef('coveragePackage', loadedRefs.coveragePackage),
      importGate: sourceRef('importGate', loadedRefs.importGate),
      seedSmokeImportEvidence: sourceRef('seedSmokeImportEvidence', loadedRefs.seedSmokeImportEvidence),
    },
    runtimeSeedEvidence: {
      businessTypeCount: businessTypes.length,
      profileRowCount: profileRows.length,
      runtimeSeedRowCount: runtimeRows.length,
      fallbackOrMissingSeedRowCount: fallbackRows.length,
      resolverSourcesAcceptedAsRuntime: [...RUNTIME_SEED_SOURCES],
      resolverSourceCounts: countBy(profileRows, (row) => row.standardWorkDurationSeedResolverSource),
      requiredStableCodeCount: requiredStableCodes.length,
      requiredStableCodes,
      runtimeStableCodeCount: runtimeStableCodes.length,
      runtimeStableCodes,
      missingRuntimeStableCodeCount: missingRuntimeStableCodes.length,
      missingRuntimeStableCodes,
      allProfileRowsRuntime,
      importControlEvidenceReady: importControlReady,
      preflightReady,
      importReceiptReady,
      importEvidenceReady,
      coverageComplete,
    },
    runtimeT2Evidence: {
      profileRowCount: profileRows.length,
      runtimeT2RowCount: runtimeT2Rows.length,
      fallbackOrMissingT2RowCount: fallbackT2Rows.length,
      resolverSourcesAcceptedAsRuntime: [...RUNTIME_T2_SOURCES],
      resolverSourceCounts: countBy(profileRows, (row) => row.t2RhythmTemplateResolverSource ?? row.t2_rhythm_template_resolver_source),
      runtimeT2TemplateIds: uniqueSorted(runtimeT2Rows.map((row) => row.t2RhythmTemplateId ?? row.t2_rhythm_template_id)),
      fallbackT2TemplateIds: uniqueSorted(fallbackT2Rows.map((row) => row.t2RhythmTemplateId ?? row.t2_rhythm_template_id)),
      allProfileT2RowsRuntime,
    },
    businessTypes: businessTypeSummaries,
    sampleFallbackRows: fallbackRows.slice(0, 20).map((row) => ({
      businessType: text(row.businessType),
      code: text(row.code),
      title: text(row.title),
      durationAssetStableCode: text(row.durationAssetStableCode),
      resolverSource: text(row.standardWorkDurationSeedResolverSource) || 'missing',
      resolverVersionId: text(row.standardWorkDurationSeedResolverVersionId) || null,
    })),
    sampleFallbackT2Rows: fallbackT2Rows.slice(0, 20).map((row) => ({
      businessType: text(row.businessType),
      code: text(row.code),
      title: text(row.title),
      t2RhythmTemplateId: text(row.t2RhythmTemplateId ?? row.t2_rhythm_template_id),
      resolverSource: text(row.t2RhythmTemplateResolverSource ?? row.t2_rhythm_template_resolver_source) || 'missing',
      resolverVersionId: text(row.t2RhythmTemplateResolverVersionId ?? row.t2_rhythm_template_resolver_version_id) || null,
    })),
    blockers: uniqueStrings(blockers),
    nextActions: blockers.length === 0
      ? [
          'Proceed to duration sample calibration, dependency writer, runtime publication, and post-publish smoke/rollback evidence gates.',
        ]
      : [
          'Run the allowed standard duration seed import command from runtime-seed-import-gate.json.',
          'Regenerate default-master-plan profile report after import.',
          'Provide a verified runtime seed preflight or an imported seed receipt, then rerun this post-import verification.',
        ],
    productionReady: false,
    mutationBoundary: {
      readsProfileReport: true,
      readsRuntimeSeedPreflight: true,
      readsRuntimeSeedCoveragePackage: true,
      readsRuntimeSeedImportGate: true,
      readsSeedSmokeImportEvidence: true,
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [profileReport, runtimeSeedPreflight, coveragePackage, importGate, seedSmokeImportEvidence] = await Promise.all([
    readJsonWithHash(args.profileReport),
    readJsonWithHash(args.runtimeSeedPreflight),
    readJsonWithHash(args.coveragePackage),
    readJsonWithHash(args.importGate),
    args.seedSmokeImportEvidence ? readJsonWithHash(args.seedSmokeImportEvidence) : Promise.resolve(null),
  ])
  const verification = buildRuntimeSeedPostImportVerification({
    profileReport: profileReport.json,
    runtimeSeedPreflight: runtimeSeedPreflight.json,
    coveragePackage: coveragePackage.json,
    importGate: importGate.json,
    seedSmokeImportEvidence: seedSmokeImportEvidence?.json ?? null,
    loadedRefs: {
      profileReport,
      runtimeSeedPreflight,
      coveragePackage,
      importGate,
      seedSmokeImportEvidence,
    },
  })
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(verification, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: verification.status,
    output: repoRelative(args.output),
    profileRowCount: verification.runtimeSeedEvidence.profileRowCount,
    runtimeSeedRowCount: verification.runtimeSeedEvidence.runtimeSeedRowCount,
    fallbackOrMissingSeedRowCount: verification.runtimeSeedEvidence.fallbackOrMissingSeedRowCount,
    missingRuntimeStableCodeCount: verification.runtimeSeedEvidence.missingRuntimeStableCodeCount,
    blockers: verification.blockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnBlocker && verification.status !== 'runtime_seed_post_import_verified') process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
