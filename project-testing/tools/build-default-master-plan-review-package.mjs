#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultMasterPlanCandidateQualityBlockers,
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/pm-review-package.json')
const CANDIDATE_REFRESH_PACKAGE_FILE = 'candidate-refresh-package.json'
const CANDIDATE_DISCOVERY_FILE = 'candidate-discovery.json'
const REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]
const MANAGED_FRONTIER_SOURCE_LABEL = 'managed_frontier_default_master_plan'
const ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS = new Set([
  'business_type_base_master_plan_profile_v1',
  'business_type_master_plan_profile_v1',
])
const ALLOWED_REVIEW_SURFACE_SOURCE_LABELS = new Set([
  ...ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS,
  'candidate_refresh_package_from_profile_report',
])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateBaseline: '',
    candidateRefreshPackage: '',
    output: DEFAULT_OUTPUT,
    environment: 'staging',
    exportedBy: '',
    reviewedByPlaceholder: '<human-project-manager-user-id>',
    reviewedBy: '',
    reviewNotes: '',
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
    } else if (arg === '--candidate-refresh-package') {
      options.candidateRefreshPackage = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--reviewed-by-placeholder') {
      options.reviewedByPlaceholder = nextValue()
    } else if (arg === '--reviewed-by') {
      options.reviewedBy = nextValue()
    } else if (arg === '--review-notes') {
      options.reviewNotes = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanReviewPackage({
  candidateBaseline,
  candidateRefreshPackage = '',
  output = DEFAULT_OUTPUT,
  environment = 'staging',
  reviewedBy = '',
  reviewNotes = '',
  exportedBy = '',
  reviewedByPlaceholder = '<human-project-manager-user-id>',
  now = new Date(),
} = {}) {
  const outputPath = path.resolve(output)
  const paths = await resolveReviewPackageArtifactPaths({
    candidateBaseline,
    candidateRefreshPackage,
    output: outputPath,
  })
  const candidatePath = paths.candidateBaseline
  const candidateRefreshPackagePath = paths.candidateRefreshPackage
  if (!candidatePath) {
    throw new Error('candidate_baseline_export_required')
  }
  const candidate = JSON.parse(await readFile(candidatePath, 'utf8'))
  const refreshPackage = candidateRefreshPackagePath
    ? JSON.parse(await readFile(candidateRefreshPackagePath, 'utf8'))
    : {}
  const reviewSurface = resolveReviewSurface(candidate, refreshPackage)
  const reviewedRows = reviewSurface.rows.map((row, index) => normalizeReviewRow(row, index))
  const durationAssetSummary = summarizeDurationAssetEvidence(reviewedRows)
  const baselineId = text(candidate.baselineId ?? candidate.baseline_id)
  const projectId = text(candidate.projectId ?? candidate.project_id)
  const candidateQuality = defaultMasterPlanCandidateQualityBlockers({
    rows: reviewedRows.map((row) => ({
      ...row,
      smartReferenceDays: row.referenceDays,
    })),
    sourceVersionLabel: text(candidate.sourceVersionLabel ?? candidate.source_version_label),
    status: text(candidate.status),
  })
  const candidateRootSourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(candidate))
  const reviewNotesStatedItemCount = readReviewNotesStatedItemCount(reviewNotes)
  const reviewNotesQuality = buildReviewNotesQuality({
    reviewNotes,
    statedItemCount: reviewNotesStatedItemCount,
    actualReviewedItemCount: reviewedRows.length,
  })
  const inputBlockers = [
    ...(Array.isArray(candidate.blockers) ? candidate.blockers.map(text).filter(Boolean) : []),
    ...[
      ...candidateQuality.blockers,
      ...candidateRootSourceGuard.blockers,
    ].map((blocker) => {
      if (blocker === 'candidate_baseline_export_already_blocked') return 'candidate_baseline_not_eligible_for_pm_review'
      if (blocker === 'retired_or_low_information_default_master_plan_source') {
        return 'candidate_baseline_contains_retired_or_low_information_sources'
      }
      if (blocker === 'unsupported_default_master_plan_source_label') {
        return 'candidate_baseline_source_version_label_unsupported'
      }
      return blocker
    }),
    candidate.productionCandidateEligible === false ? 'candidate_baseline_not_eligible_for_pm_review' : null,
    reviewNotesStatedItemCount !== null && reviewNotesStatedItemCount !== reviewedRows.length
      ? 'review_notes_reviewed_item_count_mismatch'
      : null,
  ].filter(Boolean)
  const uniqueInputBlockers = [...new Set(inputBlockers)]
  const reviewedItemIds = uniqueInputBlockers.length > 0
    ? []
    : reviewedRows.map((row) => row.id).filter(Boolean)
  const reviewNotesTemplate = [
    `Human PM reviewed ${reviewedItemIds.length} candidate default master-plan rows for baseline ${baselineId}.`,
    'Accepted as a candidate baseline only; production readiness blockers remain acknowledged.',
  ].join(' ')
  const reviewCommandReviewer = text(reviewedBy) || text(reviewedByPlaceholder) || '<human-project-manager-user-id>'
  const reviewCommandNotes = text(reviewNotes) || '<real-review-notes>'
  const recordReviewCommand = uniqueInputBlockers.length > 0 ? null : [
    'npm run evidence:default-master-plan:record-review --',
    `--baseline-id ${baselineId}`,
    `--project-id ${projectId}`,
    `--reviewed-by ${shellArg(reviewCommandReviewer)}`,
    `--review-notes ${shellArg(reviewCommandNotes)}`,
    `--review-package ${outputPath}`,
    `--environment ${text(environment) || 'staging'}`,
    `--exported-by ${text(exportedBy) || '<real-release-operator>'}`,
    '--mode execute',
  ].join(' ')
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-review-package',
    status: reviewedItemIds.length > 0 && uniqueInputBlockers.length === 0 ? 'ready_for_human_pm_review' : 'blocked',
    productionReady: false,
    baselineId,
    projectId,
    candidateBaselineRef: `candidate_baseline_export:${repoRelative(candidatePath)}`,
    candidateRefreshPackageRef: candidateRefreshPackagePath
      ? `candidate_refresh_package:${repoRelative(candidateRefreshPackagePath)}`
      : '',
    reviewSource: reviewSurface.source,
    sourceVersionLabel: text(candidate.sourceVersionLabel ?? candidate.source_version_label),
    reviewedItemCount: reviewedItemIds.length,
    reviewedItemIds,
    reviewNotesStatedItemCount,
    reviewNotesQuality,
    durationAssetSummary,
    requiredAcknowledgedBlockers: REVIEW_BLOCKERS,
    reviewNotesTemplate,
    recordReviewCommand,
    rows: reviewedRows,
    blockers: uniqueInputBlockers.length > 0
      ? uniqueInputBlockers
      : reviewedItemIds.length > 0
        ? []
        : ['reviewed_item_ids_required'],
    mutationBoundary: {
      readsCandidateBaselineExport: true,
      readsCandidateRefreshPackage: Boolean(candidateRefreshPackagePath),
      writesChangeLogs: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan PM Review Package',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- reviewedItemCount: ${report.reviewedItemCount}`,
    `- mutationBoundary: writesChangeLogs=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false`,
    '',
    ...(report.blockers.length > 0
      ? [
          '## Blockers',
          '',
          ...report.blockers.map((blocker) => `- ${blocker}`),
          '',
        ]
      : []),
    ...(report.reviewNotesQuality?.status === 'blocked_item_count_mismatch'
      ? [
          '## Review Notes Quality',
          '',
          `- status: ${report.reviewNotesQuality.status}`,
          `- statedItemCount: ${report.reviewNotesQuality.statedItemCount}`,
          `- actualReviewedItemCount: ${report.reviewNotesQuality.actualReviewedItemCount}`,
          `- suggestedReviewNotes: ${report.reviewNotesQuality.suggestedReviewNotes}`,
          '',
        ]
      : []),
    '## Required Acknowledged Blockers',
    '',
    ...report.requiredAcknowledgedBlockers.map((blocker) => `- ${blocker}`),
    '',
    '## Duration Asset Summary',
    '',
    `- rowsWithStandardWorkSeed: ${report.durationAssetSummary.rowsWithStandardWorkSeedCount}`,
    `- rowsWithT2RhythmTemplate: ${report.durationAssetSummary.rowsWithT2RhythmTemplateCount}`,
    `- rowsWithRuntimeReferenceDays: ${report.durationAssetSummary.rowsWithRuntimeReferenceDaysCount}`,
    `- rowsMissingRuntimeReferenceDays: ${report.durationAssetSummary.rowsMissingRuntimeReferenceDaysCount}`,
    `- assetGaps: ${Object.keys(report.durationAssetSummary.assetGapCounts).length > 0 ? JSON.stringify(report.durationAssetSummary.assetGapCounts) : 'none'}`,
    '',
    '## Record Review Command',
    '',
    ...(report.recordReviewCommand
      ? [
          '```powershell',
          report.recordReviewCommand,
          '```',
        ]
      : [
          'No record-review command is emitted because this package is blocked.',
        ]),
    '',
    '## Candidate Rows',
    '',
    '| # | id | code | title | start | end | days | duration asset | T2 rhythm | runtime ref days |',
    '|---:|---|---|---|---|---|---:|---|---|---|',
  ]
  for (const row of report.rows) {
    lines.push(`| ${row.index} | ${escapeTable(row.id)} | ${escapeTable(row.standardWorkCode)} | ${escapeTable(row.title)} | ${escapeTable(row.plannedStart)} | ${escapeTable(row.plannedEnd)} | ${row.referenceDays} | ${escapeTable(row.durationAssetEvidence.durationAssetStableCode)} | ${escapeTable(row.durationAssetEvidence.t2RhythmTemplateId)} | ${row.durationAssetEvidence.runtimeReferenceDays.consumed ? 'yes' : 'no'} |`)
  }
  return `${lines.join('\n')}\n`
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

async function resolveReviewPackageArtifactPaths({
  candidateBaseline,
  candidateRefreshPackage,
  output,
}) {
  const outputPath = path.resolve(output || DEFAULT_OUTPUT)
  const reportRoot = path.dirname(outputPath)
  const discoveryPath = await existingFile(path.join(reportRoot, CANDIDATE_DISCOVERY_FILE))
  const discoveryPayload = discoveryPath ? await readJsonIfPresent(discoveryPath) : {}
  const preferredBaselineId = text(
    discoveryPayload.recommendedCandidate?.baselineId
      ?? discoveryPayload.recommendedCandidate?.baseline_id,
  )
  return {
    candidateBaseline: candidateBaseline
      ? path.resolve(candidateBaseline)
      : await findCandidateBaselinePath(reportRoot, preferredBaselineId),
    candidateRefreshPackage: candidateRefreshPackage
      ? path.resolve(candidateRefreshPackage)
      : await existingFile(path.join(reportRoot, CANDIDATE_REFRESH_PACKAGE_FILE)),
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

async function findCandidateBaselinePath(reportRoot, baselineId) {
  const normalizedBaselineId = text(baselineId)
  if (normalizedBaselineId) {
    const exactPath = await existingFile(path.join(reportRoot, `candidate-baseline-${normalizedBaselineId}-school-items.json`))
    if (exactPath && await candidateBaselineExportEligible(exactPath)) return exactPath
  }
  const candidates = await reportFiles(reportRoot, /^candidate-baseline-.+-school-items\.json$/)
  for (const candidate of candidates) {
    if (await candidateBaselineExportEligible(candidate.filePath)) return candidate.filePath
  }
  return ''
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

async function candidateBaselineExportEligible(filePath) {
  const payload = await readJsonIfPresent(filePath)
  const quality = defaultMasterPlanCandidateQualityBlockers({
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    sourceVersionLabel: text(payload.sourceVersionLabel ?? payload.source_version_label),
    status: text(payload.status),
  })
  const sourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(payload))
  return unique([...quality.blockers, ...sourceGuard.blockers]).length === 0
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

function text(value) {
  return String(value ?? '').trim()
}

function readReviewNotesStatedItemCount(value) {
  const notes = text(value)
  if (!notes) return null
  const patterns = [
    /候选\s*([0-9０-９]+)\s*行\s*WBS/i,
    /候选\s*([0-9０-９]+)\s*行/i,
    /\b([0-9]+)\s+candidate\s+(?:default\s+master-plan\s+)?rows?\b/i,
    /\b([0-9]+)\s+rows?\b/i,
  ]
  for (const pattern of patterns) {
    const match = notes.match(pattern)
    if (!match) continue
    const numeric = Number(normalizeFullWidthDigits(match[1]))
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function buildReviewNotesQuality({ reviewNotes, statedItemCount, actualReviewedItemCount }) {
  if (statedItemCount === null) {
    return {
      status: text(reviewNotes) ? 'no_explicit_item_count' : 'not_supplied',
      statedItemCount: null,
      actualReviewedItemCount,
      suggestedReviewNotes: '',
    }
  }
  if (statedItemCount === actualReviewedItemCount) {
    return {
      status: 'matched',
      statedItemCount,
      actualReviewedItemCount,
      suggestedReviewNotes: '',
    }
  }
  return {
    status: 'blocked_item_count_mismatch',
    statedItemCount,
    actualReviewedItemCount,
    suggestedReviewNotes: replaceReviewNotesStatedItemCount(reviewNotes, actualReviewedItemCount),
  }
}

function replaceReviewNotesStatedItemCount(value, actualReviewedItemCount) {
  const notes = text(value)
  if (!notes) return ''
  const replacement = String(actualReviewedItemCount)
  return notes
    .replace(/候选\s*[0-9０-９]+\s*行\s*WBS/i, `候选 ${replacement} 行 WBS`)
    .replace(/候选\s*[0-9０-９]+\s*行/i, `候选 ${replacement} 行`)
    .replace(/\b[0-9]+\s+candidate\s+(default\s+master-plan\s+)?rows?\b/i, (match, qualifier = '') => (
      `${replacement} candidate ${qualifier || ''}rows`
    ))
    .replace(/\b[0-9]+\s+rows?\b/i, `${replacement} rows`)
}

function normalizeFullWidthDigits(value) {
  return text(value).replace(/[０-９]/g, (character) => (
    String(character.charCodeAt(0) - '０'.charCodeAt(0))
  ))
}

function shellArg(value) {
  const normalized = text(value)
  if (!normalized) return '""'
  if (/^<[^>\r\n]+>$/.test(normalized)) return normalized
  if (/^[A-Za-z0-9_./:@+=,-]+$/.test(normalized)) return normalized
  return `"${normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function numberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function resolveReviewSurface(candidate, refreshPackage) {
  const targetReplacementRows = Array.isArray(refreshPackage?.targetReplacementRows)
    ? refreshPackage.targetReplacementRows
    : Array.isArray(refreshPackage?.target_replacement_rows)
      ? refreshPackage.target_replacement_rows
      : []
  const refreshRequired = refreshPackage?.refreshRequired === true
    || refreshPackage?.refresh_required === true
    || text(refreshPackage?.status) === 'refresh_required'
  if (refreshRequired && targetReplacementRows.length > 0) {
    return {
      source: 'candidate_refresh_package_target_replacement_rows',
      rows: targetReplacementRows,
    }
  }
  return {
    source: 'candidate_baseline_export_rows',
    rows: Array.isArray(candidate.rows) ? candidate.rows : [],
  }
}

function normalizeReviewRow(row, index) {
  return {
    index: Number(row.index ?? index + 1),
    id: text(row.id ?? row.clientRowId ?? row.client_row_id ?? row.code ?? row.standardWorkCode ?? row.standard_work_code),
    title: text(row.title),
    standardWorkCode: text(row.standardWorkCode ?? row.standard_work_code ?? row.code ?? row.stableCode ?? row.stable_code),
    plannedStart: text(row.plannedStart ?? row.planned_start ?? row.startDate ?? row.start_date),
    plannedEnd: text(row.plannedEnd ?? row.planned_end ?? row.endDate ?? row.end_date),
    referenceDays: Number(
      row.smartReferenceDays
        ?? row.smart_reference_days
        ?? row.referenceDays
        ?? row.reference_days
        ?? row.selectedDurationDays
        ?? row.selected_duration_days
        ?? row.durationDays
        ?? row.duration_days
        ?? 0,
    ),
    candidateOnly: row.candidateOnly === true || row.candidate_only === true,
    ...normalizeCandidateReviewRowSource(row),
    fallbackApplied: normalizeFallbackApplied(row.fallbackApplied ?? row.fallback_applied),
    controlledDegradation: normalizeControlledDegradation(row.controlledDegradation ?? row.controlled_degradation),
    handoffGenerationMode: text(row.handoffGenerationMode ?? row.handoff_generation_mode),
    scenarioType: text(row.scenarioType ?? row.scenario_type),
    comparisonScenario: text(row.comparisonScenario ?? row.comparison_scenario),
    durationAssetEvidence: normalizeDurationAssetEvidence(row),
  }
}

function normalizeDurationAssetEvidence(row) {
  const durationAssetStableCode = text(row.durationAssetStableCode ?? row.duration_asset_stable_code ?? row.standardWorkDurationSeedStableCode)
  const t2RhythmTemplateId = text(row.t2RhythmTemplateId ?? row.t2_rhythm_template_id)
  const runtimeReferenceDays = {
    flaggedConsumed: row.runtimeReferenceDaysConsumed === true || row.runtime_reference_days_consumed === true,
    evidenceLevel: text(row.runtimeReferenceDaysEvidenceLevel ?? row.runtime_reference_days_evidence_level),
    p50Days: numberOrNull(row.runtimeReferenceDaysP50Days ?? row.runtime_reference_days_p50_days),
    p80Days: numberOrNull(row.runtimeReferenceDaysP80Days ?? row.runtime_reference_days_p80_days),
    sampleCount: numberOrNull(row.runtimeReferenceDaysSampleCount ?? row.runtime_reference_days_sample_count),
    source: text(row.runtimeReferenceDaysSource ?? row.runtime_reference_days_source),
  }
  runtimeReferenceDays.consumed = runtimeReferenceDays.flaggedConsumed
    && runtimeReferenceDays.evidenceLevel === 'runtime_calibrated_l2'
    && Number(runtimeReferenceDays.p50Days) > 0
    && Number(runtimeReferenceDays.sampleCount) > 0
    && runtimeReferenceDays.source === 'accepted_real_project_outcome'
  const standardWorkSeed = {
    resolverSource: text(row.standardWorkDurationSeedResolverSource ?? row.standard_work_duration_seed_resolver_source),
    p50Days: numberOrNull(row.standardWorkDurationSeedP50Days ?? row.standard_work_duration_seed_p50_days),
    productivityP50PerDay: numberOrNull(row.standardWorkDurationSeedProductivityP50PerDay ?? row.standard_work_duration_seed_productivity_p50_per_day),
  }
  const t2RhythmTemplate = {
    p50Days: numberOrNull(row.t2RhythmTemplateP50Days ?? row.t2_rhythm_template_p50_days),
  }
  const quantityProxy = {
    source: text(row.quantityProxySource ?? row.quantity_proxy_source),
    value: numberOrNull(row.quantityProxyValue ?? row.quantity_proxy_value),
    unit: text(row.quantityProxyUnit ?? row.quantity_proxy_unit),
    basis: text(row.quantityProxyBasis ?? row.quantity_proxy_basis),
  }
  const dependencyEvidence = {
    ruleSource: text(row.dependencyRuleSource ?? row.dependency_rule_source),
    layerStack: text(row.dependencyRuleLayerStack ?? row.dependency_rule_layer_stack),
    phaseAnchorDependencyCount: readNumber(row.phaseAnchorDependencyCount ?? row.phase_anchor_dependency_count),
    startAnchor: isProjectStartAnchorReviewRow(row),
    anchorType: isProjectStartAnchorReviewRow(row) ? 'project_start_anchor' : '',
  }
  const assetGaps = unique([
    durationAssetStableCode ? null : 'standard_work_duration_seed_missing',
    t2RhythmTemplateId ? null : 't2_rhythm_template_missing',
    runtimeReferenceDays.consumed
      ? null
      : runtimeReferenceDays.flaggedConsumed
        ? 'runtime_reference_days_incomplete'
        : 'runtime_reference_days_missing',
    quantityProxy.source || quantityProxy.value !== null || standardWorkSeed.productivityP50PerDay !== null
      ? null
      : 'quantity_or_productivity_missing',
    hasDependencyEvidence(dependencyEvidence)
      ? null
      : 'dependency_evidence_missing',
  ])
  return {
    durationAssetStableCode,
    t2RhythmTemplateId,
    runtimeReferenceDays,
    standardWorkSeed,
    t2RhythmTemplate,
    quantityProxy,
    productivityDerivedDurationDays: numberOrNull(row.productivityDerivedDurationDays ?? row.productivity_derived_duration_days),
    selectedDurationDays: numberOrNull(row.selectedDurationDays ?? row.selected_duration_days ?? row.durationDays ?? row.duration_days),
    selectionRule: text(row.selectionRule ?? row.selection_rule),
    durationCalibrationSource: text(row.durationCalibrationSource ?? row.duration_calibration_source),
    durationMaturity: text(row.durationMaturity ?? row.duration_maturity),
    durationReviewGate: text(row.durationReviewGate ?? row.duration_review_gate),
    durationTruthSource: text(row.durationTruthSource ?? row.duration_truth_source),
    dependencyEvidence,
    assetGaps,
  }
}

function isProjectStartAnchorReviewRow(row) {
  const normalizedCode = text(row.code ?? row.standardWorkCode ?? row.standard_work_code ?? row.stableCode ?? row.stable_code).toUpperCase()
  const normalizedIndex = Number(row.index ?? 0)
  const executionPhase = text(row.executionPhase ?? row.execution_phase)
  const executionLane = text(row.executionLane ?? row.execution_lane)
  if (normalizedIndex > 1) return false
  return normalizedCode === 'BTMP-BASE-01'
    || executionPhase === 'startup_site_setup'
    || executionLane === 'site_preparation'
}

function hasDependencyEvidence(dependencyEvidence) {
  return Boolean(dependencyEvidence.ruleSource)
    || Number(dependencyEvidence.phaseAnchorDependencyCount ?? 0) > 0
    || dependencyEvidence.startAnchor === true
}

function summarizeDurationAssetEvidence(rows) {
  const assetGapCounts = {}
  const durationMaturityCounts = {}
  const reviewGateCounts = {}
  for (const row of rows) {
    const evidence = row.durationAssetEvidence
    for (const gap of evidence.assetGaps) {
      assetGapCounts[gap] = (assetGapCounts[gap] ?? 0) + 1
    }
    const maturity = evidence.durationMaturity || 'unknown'
    durationMaturityCounts[maturity] = (durationMaturityCounts[maturity] ?? 0) + 1
    const gate = evidence.durationReviewGate || 'none'
    reviewGateCounts[gate] = (reviewGateCounts[gate] ?? 0) + 1
  }
  return {
    rowCount: rows.length,
    rowsWithStandardWorkSeedCount: rows.filter((row) => row.durationAssetEvidence.durationAssetStableCode).length,
    rowsMissingStandardWorkSeedCount: rows.filter((row) => !row.durationAssetEvidence.durationAssetStableCode).length,
    rowsWithT2RhythmTemplateCount: rows.filter((row) => row.durationAssetEvidence.t2RhythmTemplateId).length,
    rowsMissingT2RhythmTemplateCount: rows.filter((row) => !row.durationAssetEvidence.t2RhythmTemplateId).length,
    rowsWithRuntimeReferenceDaysCount: rows.filter((row) => row.durationAssetEvidence.runtimeReferenceDays.consumed).length,
    rowsMissingRuntimeReferenceDaysCount: rows.filter((row) => !row.durationAssetEvidence.runtimeReferenceDays.consumed).length,
    rowsWithDependencyEvidenceCount: rows.filter((row) => (
      hasDependencyEvidence(row.durationAssetEvidence.dependencyEvidence)
    )).length,
    rowsMissingDependencyEvidenceCount: rows.filter((row) => (
      !hasDependencyEvidence(row.durationAssetEvidence.dependencyEvidence)
    )).length,
    durationMaturityCounts,
    reviewGateCounts,
    assetGapCounts,
  }
}

function normalizeCandidateReviewRowSource(row) {
  const rawSource = text(row.source)
  const rawProfileSourceType = text(row.profileSourceType ?? row.profile_source_type)
  const profileSourceType = rawProfileSourceType || (ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource) ? rawSource : '')
  const source = ALLOWED_REVIEW_SURFACE_SOURCE_LABELS.has(rawSource)
    ? MANAGED_FRONTIER_SOURCE_LABEL
    : rawSource
  return {
    source,
    originalSource: rawSource && rawSource !== source ? rawSource : '',
    profileSourceType,
  }
}

function normalizeFallbackApplied(value) {
  if (value === true) return true
  const label = text(value)
  if (!label || label.toLowerCase() === 'false') return ''
  if (label.toLowerCase() === 'true') return true
  return label
}

function normalizeControlledDegradation(value) {
  if (value === true) return true
  const label = text(value)
  if (!label || label.toLowerCase() === 'false') return ''
  if (label.toLowerCase() === 'true') return true
  return label
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-review-package.mjs',
    '  --candidate-baseline <candidate-baseline.json>',
    '  [--output <pm-review-package.json>]',
    '  [--environment staging] [--exported-by <actor>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanReviewPackage(options)
    console.log(JSON.stringify({
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      reviewedItemCount: report.reviewedItemCount,
      output: repoRelative(path.resolve(options.output)),
      recordReviewCommand: report.recordReviewCommand,
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
