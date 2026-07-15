#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'
import {
  defaultMasterPlanFallbackAppliedSourceSignal,
  defaultMasterPlanStructuredSourceSignals,
  retiredOrLowInformationDefaultMasterPlanSource,
} from './default-master-plan-source-guard.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'runtime-publication-evidence.json')
const DEFAULT_MASTER_PLAN_GENERATION_MODES = new Set([
  'residential_master_plan_v2',
  'managed_frontier_default_master_plan',
])
function parseArgs(argv) {
  const args = {
    runtimePublications: null,
    baselineId: null,
    projectId: null,
    publishedBy: null,
    publishedAt: null,
    offlineDevelopmentQualityReviewRef: null,
    durationCalibrationEvidenceRef: null,
    dependencyWriterEvidenceRef: null,
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--runtime-publications') {
      args.runtimePublications = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--baseline-id') {
      args.baselineId = text(argv[index + 1])
      index += 1
    } else if (arg === '--project-id') {
      args.projectId = text(argv[index + 1])
      index += 1
    } else if (arg === '--published-by') {
      args.publishedBy = text(argv[index + 1])
      index += 1
    } else if (arg === '--published-at') {
      args.publishedAt = text(argv[index + 1])
      index += 1
    } else if (arg === '--offline-development-quality-review-ref' || arg === '--project-manager-review-evidence-ref') {
      args.offlineDevelopmentQualityReviewRef = text(argv[index + 1])
      index += 1
    } else if (arg === '--duration-calibration-evidence-ref') {
      args.durationCalibrationEvidenceRef = text(argv[index + 1])
      index += 1
    } else if (arg === '--dependency-writer-evidence-ref') {
      args.dependencyWriterEvidenceRef = text(argv[index + 1])
      index += 1
    } else if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs --runtime-publications <wbs_template_runtime_publications_export.json> --baseline-id <id> --project-id <id> --published-by <actor> [--published-at <iso>] [--offline-development-quality-review-ref <ref>] [--duration-calibration-evidence-ref <ref>] [--dependency-writer-evidence-ref <ref>] [--output <json>]`)
      process.exit(0)
    }
  }
  return args
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function text(value) {
  return String(value ?? '').trim()
}

function readObject(value) {
  if (typeof value === 'string') {
    try {
      return readObject(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.runtimePublications)) return payload.runtimePublications
  if (Array.isArray(payload?.runtime_publications)) return payload.runtime_publications
  if (Array.isArray(payload?.wbsTemplateRuntimePublications)) return payload.wbsTemplateRuntimePublications
  if (Array.isArray(payload?.wbs_template_runtime_publications)) return payload.wbs_template_runtime_publications
  return []
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function rowProjectId(row, lineage) {
  return text(row.project_id ?? row.projectId ?? lineage.projectId ?? lineage.project_id)
}

function rowAssetKind(row, lineage) {
  return text(row.asset_kind ?? row.assetKind ?? lineage.assetKind ?? lineage.asset_kind ?? lineage.assetType ?? lineage.asset_type)
}

function rowBaselineId(row, lineage) {
  return text(lineage.acceptedBaselineId ?? lineage.accepted_baseline_id ?? row.accepted_baseline_id ?? row.acceptedBaselineId ?? row.asset_version_id ?? row.assetVersionId)
}

function rowGenerationMode(row, lineage) {
  return text(lineage.generationMode ?? lineage.generation_mode ?? row.generationMode ?? row.generation_mode)
}

function rowRuntimeAssetKey(row, lineage, args) {
  return text(lineage.runtimeAssetKey ?? lineage.runtime_asset_key ?? row.runtimeAssetKey ?? row.runtime_asset_key)
    || (args.projectId ? `runtime.default_master_plan.${args.projectId}` : '')
}

function rowDependencyWriterReleaseRecordTarget(row, lineage) {
  return text(
    lineage.dependencyWriterReleaseRecordTarget
      ?? lineage.dependency_writer_release_record_target
      ?? row.dependencyWriterReleaseRecordTarget
      ?? row.dependency_writer_release_record_target
      ?? row.publication_key
      ?? row.publicationKey,
  )
}

function defaultMasterPlanGenerationModeBlockers(generationMode) {
  if (DEFAULT_MASTER_PLAN_GENERATION_MODES.has(generationMode)) return []
  return [generationMode ? 'default_master_plan_generation_mode_unsupported' : 'default_master_plan_generation_mode_required']
}

function runtimePublicationSourceLabels(row, lineage) {
  return [
    ...defaultMasterPlanStructuredSourceSignals(row.sourceMetadata ?? row.source_metadata),
    ...defaultMasterPlanStructuredSourceSignals(row.sourceLineage ?? row.source_lineage),
    ...defaultMasterPlanStructuredSourceSignals(lineage),
    row.source,
    row.originalSource,
    row.original_source,
    row.source_type,
    row.sourceType,
    row.generation_source,
    row.generationSource,
    row.source_version_label,
    row.sourceVersionLabel,
    lineage.source,
    lineage.originalSource,
    lineage.original_source,
    lineage.source_type,
    lineage.sourceType,
    lineage.generation_source,
    lineage.generationSource,
    lineage.source_version_label,
    lineage.sourceVersionLabel,
    lineage.profile_source_type,
    lineage.profileSourceType,
    lineage.handoff_generation_mode,
    lineage.handoffGenerationMode,
    lineage.controlledDegradation,
    lineage.controlled_degradation,
    defaultMasterPlanFallbackAppliedSourceSignal(lineage.fallbackApplied),
    defaultMasterPlanFallbackAppliedSourceSignal(lineage.fallback_applied),
    lineage.scenario_type,
    lineage.scenarioType,
  ].map(text).filter(Boolean)
}

function runtimePublicationSourceLabelBlockers(row, lineage) {
  const labels = runtimePublicationSourceLabels(row, lineage)
  return labels.some(retiredOrLowInformationDefaultMasterPlanSource)
    ? ['runtime_publication_retired_or_low_information_source_label']
    : []
}

function selectRuntimePublicationRow(rows, args) {
  const normalizedRows = rows.map((row) => ({
    row,
    lineage: readObject(row.runtime_lineage ?? row.runtimeLineage),
    status: text(row.runtime_publication_status ?? row.runtimePublicationStatus ?? row.status),
  }))
  const sameProjectRows = normalizedRows.filter(({ row, lineage }) => {
    const projectId = rowProjectId(row, lineage)
    return !args.projectId || projectId === args.projectId
  })
  const pool = sameProjectRows.length > 0 ? sameProjectRows : normalizedRows
  return pool.find(({ status }) => status === 'runtime_published') ?? pool[0] ?? { row: {}, lineage: {}, status: '' }
}

function buildEvidence({ args, row, lineage, status, sourceEvidenceRef, rows, sourceMetadataBlockers = [] }) {
  const publicationKey = text(row.publication_key ?? row.publicationKey)
  const assetKind = rowAssetKind(row, lineage)
  const generationMode = rowGenerationMode(row, lineage)
  const acceptedBaselineId = rowBaselineId(row, lineage)
  const exportedProjectId = rowProjectId(row, lineage)
  const rollbackTarget = text(row.rollback_target ?? row.rollbackTarget ?? lineage.rollbackTarget ?? lineage.rollback_target)
  const durationCalibrationEvidenceRef = text(
    args.durationCalibrationEvidenceRef
      ?? lineage.durationCalibrationEvidenceRef
      ?? lineage.duration_calibration_evidence_ref,
  )
  const dependencyWriterEvidenceRef = text(
    args.dependencyWriterEvidenceRef
      ?? lineage.dependencyWriterEvidenceRef
      ?? lineage.dependency_writer_evidence_ref,
  )
  const publishedAt = text(row.published_at ?? row.publishedAt ?? args.publishedAt)
  const publishedBy = text(row.published_by ?? row.publishedBy ?? lineage.publishedBy ?? lineage.published_by ?? args.publishedBy)
  const runtimeAssetKey = rowRuntimeAssetKey(row, lineage, args)
  const dependencyWriterReleaseRecordTarget = rowDependencyWriterReleaseRecordTarget(row, lineage)
  const sourceLabelBlockers = runtimePublicationSourceLabelBlockers(row, lineage)

  const blockers = [
    args.runtimePublications ? null : 'runtime_publications_export_required',
    args.baselineId ? null : 'baseline_id_required',
    args.projectId ? null : 'project_id_required',
    rows.length > 0 ? null : 'runtime_publication_export_rows_required',
    status === 'runtime_published' ? null : 'runtime_published_row_required',
    assetKind === 'default_master_plan' ? null : 'runtime_publication_asset_kind_default_master_plan_required',
    exportedProjectId === args.projectId ? null : 'runtime_publication_project_id_mismatch',
    acceptedBaselineId === args.baselineId ? null : 'runtime_publication_baseline_id_mismatch',
    ...defaultMasterPlanGenerationModeBlockers(generationMode),
    ...sourceLabelBlockers,
    publicationKey ? null : 'publication_key_required',
    acceptedBaselineId ? null : 'accepted_baseline_id_required',
    dependencyWriterReleaseRecordTarget ? null : 'dependency_writer_release_record_target_required',
    runtimeAssetKey ? null : 'runtime_asset_key_required',
    rollbackTarget ? null : 'rollback_target_required',
    publishedBy ? null : 'published_by_required',
    publishedAt ? null : 'published_at_required',
    durationCalibrationEvidenceRef ? null : 'duration_calibration_lineage_required',
    dependencyWriterEvidenceRef ? null : 'dependency_writer_lineage_required',
    ...sourceMetadataBlockers,
  ].filter(Boolean)

  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-publication-evidence/v1',
    baselineId: args.baselineId,
    projectId: args.projectId,
    status: blockers.length > 0 ? 'blocked' : 'runtime_published',
    source: 'default_master_plan_runtime_publication_evidence_builder',
    sourceEvidenceRef,
    publication: {
      source: 'default_master_plan_runtime_publication',
      status,
      publicationKey,
      assetKind,
      generationMode,
      acceptedBaselineId,
      dependencyWriterReleaseRecordTarget,
      runtimeAssetKey,
      rollbackTarget,
      publishedBy,
      publishedAt,
    },
    releaseLineage: {
      durationCalibrationEvidenceRef,
      dependencyWriterEvidenceRef,
    },
    ...(args.offlineDevelopmentQualityReviewRef
      ? { offlineDevelopmentQualityReviewRef: args.offlineDevelopmentQualityReviewRef }
      : {}),
    blockers,
    productionReady: false,
    mutationBoundary: {
      readsRuntimePublicationExport: true,
      writesProductionTables: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
    },
  }
}

const args = parseArgs(process.argv.slice(2))
let rows = []
let sourceMetadataBlockers = []
let sourceEvidenceRef = args.runtimePublications ? `wbs_template_runtime_publications_export:${repoRelative(args.runtimePublications)}` : 'wbs_template_runtime_publications_export:missing'
if (args.runtimePublications) {
  const hash = await sha256File(args.runtimePublications)
  sourceEvidenceRef = `${sourceEvidenceRef}#sha256=${hash}`
  const payload = JSON.parse(await fs.readFile(args.runtimePublications, 'utf8'))
  rows = readRows(payload)
  sourceMetadataBlockers = sourceExportMetadataBlockers(payload, 'runtime_publications')
}
const selected = selectRuntimePublicationRow(rows, args)
const evidence = buildEvidence({
  args,
  rows,
  row: selected.row,
  lineage: selected.lineage,
  status: selected.status,
  sourceEvidenceRef,
  sourceMetadataBlockers,
})

await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  output: repoRelative(args.output),
  publicationKey: evidence.publication.publicationKey,
  generationMode: evidence.publication.generationMode,
  blockers: evidence.blockers,
}, null, 2))
