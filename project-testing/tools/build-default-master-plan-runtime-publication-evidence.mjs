#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'
import {
  CANONICAL_RUNTIME_CONSUMPTION_SOURCE,
  CANONICAL_RUNTIME_PUBLICATION_SOURCE,
  CONSUMABLE_MONITORING_STATUSES,
  CONSUMABLE_PUBLICATION_STAGES,
  DURATION_LEARNING_ASSET_KEYS,
  TRUSTED_COMMIT_CONSUMER_SURFACES,
  buildRuntimeSourceRef,
  hasLegacyRuntimeSource,
  readJsonObject,
  readRuntimeSourceRows,
  readStringArray,
  runtimeSourceName,
  text,
} from './default-master-plan-runtime-evidence-contract.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'default-master-plan-production-readiness',
  'runtime-publication-evidence.json',
)

function parseArgs(argv) {
  const args = {
    runtimePublications: null,
    runtimeConsumptions: null,
    publicationKey: '',
    baselineId: '',
    projectId: '',
    durationCalibrationEvidenceRef: '',
    dependencyWriterEvidenceRef: '',
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => {
      const value = argv[index + 1]
      index += 1
      return value ?? ''
    }
    if (arg === '--runtime-publications') args.runtimePublications = path.resolve(next())
    else if (arg === '--runtime-consumptions') args.runtimeConsumptions = path.resolve(next())
    else if (arg === '--publication-key') args.publicationKey = text(next())
    else if (arg === '--baseline-id') args.baselineId = text(next())
    else if (arg === '--project-id') args.projectId = text(next())
    else if (arg === '--duration-calibration-evidence-ref') args.durationCalibrationEvidenceRef = text(next())
    else if (arg === '--dependency-writer-evidence-ref') args.dependencyWriterEvidenceRef = text(next())
    else if (arg === '--published-by' || arg === '--published-at' || arg === '--offline-development-quality-review-ref' || arg === '--project-manager-review-evidence-ref') next()
    else if (arg === '--output') args.output = path.resolve(next())
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs',
        '--runtime-publications <duration_learning_runtime_publications_export.json>',
        '--runtime-consumptions <duration_learning_runtime_consumptions_export.json>',
        '--publication-key <publication-key>',
        '--baseline-id <baseline-id>',
        '--project-id <project-id>',
        '--duration-calibration-evidence-ref <ref>',
        '--dependency-writer-evidence-ref <ref>',
        '[--output <json>]',
      ].join(' '))
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

async function sha256File(filePath) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex')
}

async function readRuntimeExport(filePath, kind, metadataLabel) {
  if (!filePath) {
    return {
      payload: {},
      rows: [],
      sourceRef: `${kind === 'publication' ? CANONICAL_RUNTIME_PUBLICATION_SOURCE : CANONICAL_RUNTIME_CONSUMPTION_SOURCE}_export:missing`,
      blockers: [],
      legacy: false,
    }
  }
  const payload = JSON.parse(await fs.readFile(filePath, 'utf8'))
  const hash = await sha256File(filePath)
  return {
    payload,
    rows: readRuntimeSourceRows(payload, kind),
    sourceRef: buildRuntimeSourceRef(kind, repoRelative(filePath), hash),
    blockers: sourceExportMetadataBlockers(payload, metadataLabel),
    legacy: hasLegacyRuntimeSource(payload),
  }
}

function field(record, snakeName, camelName) {
  return record?.[snakeName] ?? record?.[camelName]
}

function publicationRecord(row) {
  return {
    source: CANONICAL_RUNTIME_PUBLICATION_SOURCE,
    publicationKey: text(field(row, 'publication_key', 'publicationKey')),
    assetKey: text(field(row, 'asset_key', 'assetKey')),
    artifactKey: text(field(row, 'artifact_key', 'artifactKey')),
    scopeLevel: text(field(row, 'scope_level', 'scopeLevel')),
    companyId: text(field(row, 'company_id', 'companyId')) || null,
    projectId: text(field(row, 'project_id', 'projectId')) || null,
    industryKey: text(field(row, 'industry_key', 'industryKey')) || null,
    publicationStage: text(field(row, 'publication_stage', 'publicationStage')),
    monitoringStatus: text(field(row, 'monitoring_status', 'monitoringStatus')),
    previousPublicationKey: text(field(row, 'previous_publication_key', 'previousPublicationKey')) || null,
    sourceEvidenceRefs: readStringArray(field(row, 'source_evidence_refs', 'sourceEvidenceRefs')),
    publishedAt: text(field(row, 'published_at', 'publishedAt')) || null,
  }
}

function consumptionRecord(row) {
  return {
    source: CANONICAL_RUNTIME_CONSUMPTION_SOURCE,
    consumptionKey: text(field(row, 'consumption_key', 'consumptionKey')),
    companyId: text(field(row, 'company_id', 'companyId')),
    projectId: text(field(row, 'project_id', 'projectId')),
    publicationKey: text(field(row, 'publication_key', 'publicationKey')),
    assetKey: text(field(row, 'asset_key', 'assetKey')),
    artifactKey: text(field(row, 'artifact_key', 'artifactKey')),
    consumerKey: text(field(row, 'consumer_key', 'consumerKey')),
    consumerSurface: text(field(row, 'consumer_surface', 'consumerSurface')),
    taskId: text(field(row, 'task_id', 'taskId')) || null,
    baselineItemId: text(field(row, 'baseline_item_id', 'baselineItemId')) || null,
    baselineId: text(field(row, 'baseline_id', 'baselineId')) || null,
    baselineProjectId: text(field(row, 'baseline_project_id', 'baselineProjectId')) || null,
    baselineCompanyId: text(field(row, 'baseline_company_id', 'baselineCompanyId')) || null,
    baselineAuthority: text(field(row, 'baseline_authority', 'baselineAuthority')) || null,
    generationBatchId: text(field(row, 'generation_batch_id', 'generationBatchId')) || null,
    templateId: text(field(row, 'template_id', 'templateId')) || null,
    durationDayBasis: text(field(row, 'duration_day_basis', 'durationDayBasis')),
    appliedDurationDays: positiveNumber(field(row, 'applied_duration_days', 'appliedDurationDays')),
    sourceEvidenceRefs: readStringArray(field(row, 'source_evidence_refs', 'sourceEvidenceRefs')),
    consumptionContext: readJsonObject(field(row, 'consumption_context', 'consumptionContext')),
    consumedAt: text(field(row, 'consumed_at', 'consumedAt')) || null,
  }
}

function positiveNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function publicationBlockers(publication, args, rowCount, matchingCount) {
  return [
    rowCount > 0 ? null : 'canonical_runtime_publication_row_required',
    matchingCount === 1 ? null : matchingCount > 1
      ? 'canonical_runtime_publication_key_must_be_unique'
      : 'canonical_runtime_publication_key_not_found',
    publication.publicationKey ? null : 'publication_key_required',
    publication.publicationKey === args.publicationKey ? null : 'runtime_publication_key_mismatch',
    DURATION_LEARNING_ASSET_KEYS.has(publication.assetKey) ? null : 'duration_learning_asset_key_required',
    publication.artifactKey ? null : 'runtime_publication_artifact_key_required',
    CONSUMABLE_PUBLICATION_STAGES.has(publication.publicationStage) ? null : 'runtime_publication_stage_not_consumable',
    CONSUMABLE_MONITORING_STATUSES.has(publication.monitoringStatus) ? null : 'runtime_publication_monitoring_status_not_consumable',
    ['project', 'company', 'industry', 'global'].includes(publication.scopeLevel) ? null : 'runtime_publication_scope_level_invalid',
    publication.scopeLevel === 'project' && publication.projectId !== args.projectId
      ? 'runtime_publication_project_scope_mismatch'
      : null,
    publication.scopeLevel === 'project' && !publication.companyId
      ? 'runtime_publication_company_scope_required'
      : null,
    publication.scopeLevel === 'company' && !publication.companyId
      ? 'runtime_publication_company_scope_required'
      : null,
    publication.scopeLevel === 'industry' && !publication.industryKey
      ? 'runtime_publication_industry_scope_required'
      : null,
    publication.publishedAt && isIsoTimestamp(publication.publishedAt) ? null : 'runtime_publication_published_at_required',
    publication.sourceEvidenceRefs.length > 0 ? null : 'runtime_publication_source_evidence_refs_required',
  ].filter(Boolean)
}

function consumptionBlockers(consumption, publication, args) {
  const subjectCount = Number(Boolean(consumption.taskId)) + Number(Boolean(consumption.baselineItemId))
  const contextAuthority = text(
    consumption.consumptionContext.authoritySource
      ?? consumption.consumptionContext.authority_source,
  )
  const industryKey = text(
    consumption.consumptionContext.industryKey
      ?? consumption.consumptionContext.industry_key,
  )
  return [
    consumption.consumptionKey ? null : 'runtime_consumption_key_required',
    consumption.publicationKey === publication.publicationKey ? null : 'runtime_consumption_publication_key_mismatch',
    consumption.assetKey === publication.assetKey ? null : 'runtime_consumption_asset_key_mismatch',
    consumption.artifactKey === publication.artifactKey ? null : 'runtime_consumption_artifact_key_mismatch',
    consumption.projectId === args.projectId ? null : 'runtime_consumption_project_id_mismatch',
    consumption.baselineId === args.baselineId ? null : 'runtime_consumption_baseline_id_mismatch',
    consumption.baselineProjectId === args.projectId ? null : 'runtime_consumption_baseline_project_id_mismatch',
    consumption.baselineCompanyId ? null : 'runtime_consumption_baseline_company_id_required',
    consumption.companyId === consumption.baselineCompanyId
      ? null
      : 'runtime_consumption_baseline_company_mismatch',
    consumption.baselineAuthority === 'task_baseline_items_physical_join'
      ? null
      : 'runtime_consumption_physical_baseline_authority_required',
    subjectCount === 1 ? null : 'runtime_consumption_subject_identity_invalid',
    TRUSTED_COMMIT_CONSUMER_SURFACES.has(consumption.consumerSurface)
      ? null
      : 'runtime_consumption_commit_surface_required',
    consumption.consumerKey ? null : 'runtime_consumption_consumer_key_required',
    consumption.durationDayBasis === 'construction_production_day'
      ? null
      : 'runtime_consumption_production_day_basis_required',
    consumption.consumedAt && isIsoTimestamp(consumption.consumedAt)
      ? null
      : 'runtime_consumption_consumed_at_required',
    contextAuthority === 'runtime_resolver_publication_set'
      ? null
      : 'runtime_consumption_resolver_authority_required',
    consumption.sourceEvidenceRefs.includes(`duration_learning_runtime_publications:${publication.publicationKey}`)
      ? null
      : 'runtime_consumption_publication_source_ref_required',
    ['project', 'company'].includes(publication.scopeLevel)
      && consumption.companyId !== publication.companyId
      ? 'runtime_consumption_company_scope_mismatch'
      : null,
    publication.scopeLevel === 'industry' && industryKey !== publication.industryKey
      ? 'runtime_consumption_industry_scope_mismatch'
      : null,
  ].filter(Boolean)
}

function isIsoTimestamp(value) {
  const normalized = text(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized)) return false
  const parsed = new Date(normalized)
  if (!Number.isFinite(parsed.getTime())) return false
  return parsed.toISOString() === (normalized.includes('.') ? normalized : normalized.replace('Z', '.000Z'))
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

const args = parseArgs(process.argv.slice(2))
const publicationExport = await readRuntimeExport(args.runtimePublications, 'publication', 'runtime_publications')
const consumptionExport = await readRuntimeExport(args.runtimeConsumptions, 'consumption', 'runtime_consumptions')
const publicationMatches = publicationExport.rows.filter((row) => (
  text(field(row, 'publication_key', 'publicationKey')) === args.publicationKey
))
const publicationRow = publicationMatches[0] ?? publicationExport.rows[0] ?? {}
const publication = publicationRecord(publicationRow)
const consumptionCandidates = consumptionExport.rows
  .filter((row) => text(field(row, 'publication_key', 'publicationKey')) === args.publicationKey)
  .map(consumptionRecord)
const invalidConsumptionBlockers = consumptionCandidates.flatMap((consumption) => (
  consumptionBlockers(consumption, publication, args)
))
const validConsumptions = consumptionCandidates.filter((consumption) => (
  consumptionBlockers(consumption, publication, args).length === 0
))

const blockers = unique([
  args.runtimePublications ? null : 'runtime_publications_export_required',
  args.runtimeConsumptions ? null : 'runtime_consumptions_export_required',
  args.publicationKey ? null : 'publication_key_required',
  args.baselineId ? null : 'baseline_id_required',
  args.projectId ? null : 'project_id_required',
  publicationExport.legacy ? 'legacy_runtime_publication_source_rejected' : null,
  consumptionExport.legacy ? 'legacy_runtime_consumption_source_rejected' : null,
  args.runtimePublications && runtimeSourceName(publicationExport.payload) !== CANONICAL_RUNTIME_PUBLICATION_SOURCE
    ? 'canonical_runtime_publication_source_required'
    : null,
  args.runtimeConsumptions && runtimeSourceName(consumptionExport.payload) !== CANONICAL_RUNTIME_CONSUMPTION_SOURCE
    ? 'canonical_runtime_consumption_source_required'
    : null,
  ...publicationExport.blockers,
  ...consumptionExport.blockers,
  ...publicationBlockers(publication, args, publicationExport.rows.length, publicationMatches.length),
  ...invalidConsumptionBlockers,
  validConsumptions.length > 0 ? null : 'trusted_runtime_consumption_required',
  args.durationCalibrationEvidenceRef ? null : 'duration_calibration_lineage_required',
  args.dependencyWriterEvidenceRef ? null : 'dependency_writer_lineage_required',
])

const evidence = {
  schemaVersion: 'workbuddy-default-master-plan-runtime-publication-evidence/v2',
  baselineId: args.baselineId,
  projectId: args.projectId,
  publicationKey: args.publicationKey,
  status: blockers.length > 0 ? 'blocked' : 'runtime_consumed',
  source: 'canonical_duration_learning_runtime_evidence_builder',
  sourceEvidenceRef: publicationExport.sourceRef,
  sourceEvidenceRefs: [publicationExport.sourceRef, consumptionExport.sourceRef],
  publicationEvidenceRef: publicationExport.sourceRef,
  consumptionEvidenceRef: consumptionExport.sourceRef,
  publication,
  consumptions: validConsumptions,
  trustedConsumptionCount: validConsumptions.length,
  releaseLineage: {
    durationCalibrationEvidenceRef: args.durationCalibrationEvidenceRef,
    dependencyWriterEvidenceRef: args.dependencyWriterEvidenceRef,
  },
  blockers,
  productionReady: false,
  mutationBoundary: {
    readsRuntimePublicationExport: true,
    readsRuntimeConsumptionExport: true,
    writesProductionTables: false,
    writesTaskDependencies: false,
    writesRuntimePublication: false,
    writesSeeds: false,
    writesBaselines: false,
  },
}

await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  output: repoRelative(args.output),
  publicationKey: evidence.publication.publicationKey,
  trustedConsumptionCount: evidence.trustedConsumptionCount,
  blockers: evidence.blockers,
}, null, 2))
