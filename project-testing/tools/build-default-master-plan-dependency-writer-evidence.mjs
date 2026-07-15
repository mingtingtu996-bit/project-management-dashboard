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
  supportedDefaultMasterPlanSourceLabel,
} from './default-master-plan-source-guard.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'dependency-writer-evidence.json')

function parseArgs(argv) {
  const args = {
    writerResult: null,
    taskDependencies: null,
    criticalPathReadback: null,
    baselineId: null,
    projectId: null,
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--writer-result') {
      args.writerResult = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--task-dependencies') {
      args.taskDependencies = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--critical-path-readback') {
      args.criticalPathReadback = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--baseline-id') {
      args.baselineId = text(argv[index + 1])
      index += 1
    } else if (arg === '--project-id') {
      args.projectId = text(argv[index + 1])
      index += 1
    } else if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs --writer-result <writer_evidence.json> --task-dependencies <task_dependencies_export.json> --critical-path-readback <critical_path_readback.json> --baseline-id <id> --project-id <id> [--output <json>]`)
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

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function readBoolean(value) {
  return value === true || text(value).toLowerCase() === 'true'
}

function readRows(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.task_dependencies)) return payload.task_dependencies
  if (Array.isArray(payload?.taskDependencies)) return payload.taskDependencies
  return []
}

async function readJson(filePath) {
  if (!filePath) return {}
  return readObject(JSON.parse(await fs.readFile(filePath, 'utf8')))
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function writerEvidenceRoot(payload) {
  const root = readObject(payload)
  return readObject(root.evidence ?? root)
}

function writerResultFrom(root) {
  const candidates = [
    root.domain_writer_result,
    root.domainWriterResult,
    root.writer_result,
    root.writerResult,
  ]
  return readObject(candidates.find((candidate) => Object.keys(readObject(candidate)).length > 0))
}

function normalizeAppliedDependency(dependency) {
  const record = readObject(dependency)
  return {
    edgeId: text(record.edgeId ?? record.edge_id),
    taskId: text(record.taskId ?? record.task_id),
    dependencyTaskId: text(record.dependencyTaskId ?? record.dependency_task_id),
    dependencyType: text(record.dependencyType ?? record.dependency_type) || 'FS',
    lagDays: readNumber(record.lagDays ?? record.lag_days),
    sourceType: text(record.sourceType ?? record.source_type),
    sourceRefId: text(record.sourceRefId ?? record.source_ref_id) || null,
    sourceEventId: text(record.sourceEventId ?? record.source_event_id) || null,
    intent: text(record.intent) || null,
  }
}

function unresolvedExternalDependencyCount(writerResult) {
  const dependencies = Array.isArray(writerResult.unresolvedExternalDependencies)
    ? writerResult.unresolvedExternalDependencies
    : Array.isArray(writerResult.unresolved_external_dependencies)
      ? writerResult.unresolved_external_dependencies
      : []
  return Math.max(
    dependencies.length,
    readNumber(writerResult.unresolvedExternalDependencyCount ?? writerResult.unresolved_external_dependency_count),
  )
}

function normalizeTaskDependencyRow(row) {
  const record = readObject(row)
  return {
    id: text(record.id),
    projectId: text(record.project_id ?? record.projectId),
    taskId: text(record.task_id ?? record.taskId),
    dependencyTaskId: text(record.dependency_task_id ?? record.dependencyTaskId),
    dependencyType: text(record.dependency_type ?? record.dependencyType) || 'FS',
    lagDays: readNumber(record.lag_days ?? record.lagDays),
    sourceType: text(record.source_type ?? record.sourceType),
    sourceEventId: text(record.source_event_id ?? record.sourceEventId) || null,
  }
}

function dependencyKey(value) {
  return [
    text(value.taskId),
    text(value.dependencyTaskId),
    text(value.dependencyType) || 'FS',
    readNumber(value.lagDays),
    text(value.sourceType),
  ].join('|')
}

function selectCriticalPathEvidence(readback, args, sourcePath) {
  const record = readObject(readback)
  const status = text(record.status)
  const hashRef = sourcePath ? `critical_path_readback_export:${repoRelative(sourcePath)}` : ''
  return {
    status,
    evidence_ref: text(record.evidenceRef ?? record.evidence_ref ?? record.sourceEvidenceRef ?? record.source_evidence_ref) || hashRef,
    baselineId: text(record.baselineId ?? record.baseline_id),
    projectId: text(record.projectId ?? record.project_id),
    publicationKey: text(record.publicationKey ?? record.publication_key),
    blockers: [
      text(record.baselineId ?? record.baseline_id) ? null : 'critical_path_readback_baseline_id_required',
      text(record.projectId ?? record.project_id) ? null : 'critical_path_readback_project_id_required',
      text(record.baselineId ?? record.baseline_id) && text(record.baselineId ?? record.baseline_id) !== args.baselineId ? 'critical_path_readback_baseline_id_mismatch' : null,
      text(record.projectId ?? record.project_id) && text(record.projectId ?? record.project_id) !== args.projectId ? 'critical_path_readback_project_id_mismatch' : null,
      ['completed', 'readback_passed'].includes(status) ? null : 'critical_path_readback_pass_required',
    ].filter(Boolean),
  }
}

function defaultMasterPlanBlockers(candidatePlan) {
  const generationMode = text(candidatePlan.generation_mode ?? candidatePlan.generationMode)
  const sourceVersionLabel = text(candidatePlan.source_version_label ?? candidatePlan.sourceVersionLabel)
  if (supportedDefaultMasterPlanSourceLabel(generationMode) || supportedDefaultMasterPlanSourceLabel(sourceVersionLabel)) return []
  if (!generationMode && !sourceVersionLabel) return ['candidate_default_master_plan_source_version_label_required']
  return ['candidate_default_master_plan_source_version_label_unsupported']
}

function extractDefaultMasterPlanSourceLabels(payload) {
  const record = readObject(payload)
  const candidatePlan = readObject(record.candidate_default_master_plan ?? record.candidateDefaultMasterPlan)
  const rows = readRows(record)
  const labels = [
    ...defaultMasterPlanStructuredSourceSignals(record),
    ...defaultMasterPlanStructuredSourceSignals(candidatePlan),
    ...defaultMasterPlanStructuredSourceSignals(record.sourceMetadata ?? record.source_metadata),
    ...defaultMasterPlanStructuredSourceSignals(record.runtimeLineage ?? record.runtime_lineage),
    ...defaultMasterPlanStructuredSourceSignals(record.sourceLineage ?? record.source_lineage),
    candidatePlan.generation_mode,
    candidatePlan.generationMode,
    candidatePlan.source_version_label,
    candidatePlan.sourceVersionLabel,
    record.generation_mode,
    record.generationMode,
    record.source_version_label,
    record.sourceVersionLabel,
    record.source,
    record.originalSource,
    record.original_source,
    record.source_type,
    record.sourceType,
    ...rows.flatMap((row) => {
      const rowRecord = readObject(row)
      const metadata = readObject(rowRecord.metadata ?? rowRecord.generation_metadata ?? rowRecord.generationMetadata)
      return [
        ...defaultMasterPlanStructuredSourceSignals(rowRecord),
        ...defaultMasterPlanStructuredSourceSignals(metadata),
        rowRecord.generation_mode,
        rowRecord.generationMode,
        rowRecord.source_version_label,
        rowRecord.sourceVersionLabel,
        rowRecord.source,
        rowRecord.originalSource,
        rowRecord.original_source,
        rowRecord.source_type,
        rowRecord.sourceType,
        rowRecord.handoff_generation_mode,
        rowRecord.handoffGenerationMode,
        rowRecord.controlledDegradation,
        rowRecord.controlled_degradation,
        defaultMasterPlanFallbackAppliedSourceSignal(rowRecord.fallbackApplied),
        defaultMasterPlanFallbackAppliedSourceSignal(rowRecord.fallback_applied),
        metadata.generation_mode,
        metadata.generationMode,
        metadata.source_version_label,
        metadata.sourceVersionLabel,
        metadata.source,
        metadata.originalSource,
        metadata.original_source,
        metadata.source_type,
        metadata.sourceType,
        metadata.handoff_generation_mode,
        metadata.handoffGenerationMode,
        metadata.controlledDegradation,
        metadata.controlled_degradation,
        defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallbackApplied),
        defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallback_applied),
        metadata.scenario_type,
        metadata.scenarioType,
      ]
    }),
  ].map(text).filter(Boolean)
  return [...new Set(labels)]
}

function retiredOrLowInformationSourceLabelBlockers(payload) {
  const labels = extractDefaultMasterPlanSourceLabels(payload)
  return labels.some(retiredOrLowInformationDefaultMasterPlanSource)
    ? ['candidate_default_master_plan_retired_or_low_information_source_label']
    : []
}

function buildEvidence({ args, writerRoot, taskDependencyRows, criticalPath, sourceEvidenceRef, sourceMetadataBlockers = [] }) {
  const writerResult = writerResultFrom(writerRoot)
  const candidatePlan = readObject(writerRoot.candidate_default_master_plan ?? writerRoot.candidateDefaultMasterPlan)
  const candidateGenerationMode = text(candidatePlan.generation_mode ?? candidatePlan.generationMode)
  const candidateSourceVersionLabel = text(candidatePlan.source_version_label ?? candidatePlan.sourceVersionLabel)
  const sourceLabelBlockers = retiredOrLowInformationSourceLabelBlockers(writerRoot)
  const isSupportedDefaultMasterPlan = sourceLabelBlockers.length === 0 && (
    supportedDefaultMasterPlanSourceLabel(candidateGenerationMode)
    || supportedDefaultMasterPlanSourceLabel(candidateSourceVersionLabel)
  )
  const taskMapping = readObject(writerRoot.task_mapping ?? writerRoot.taskMapping)
  const appliedDependencies = Array.isArray(writerResult.appliedDependencies)
    ? writerResult.appliedDependencies.map(normalizeAppliedDependency)
    : Array.isArray(writerResult.applied_dependencies)
      ? writerResult.applied_dependencies.map(normalizeAppliedDependency)
      : []
  const allExportedDependencies = taskDependencyRows.map(normalizeTaskDependencyRow)
  const exportedDependencies = allExportedDependencies.filter((dependency) => (
    dependency.sourceType === 'construction_organization_plan_network'
  ))
  const ignoredUnrelatedDependencyCount = allExportedDependencies.length - exportedDependencies.length
  const exportedKeys = new Set(exportedDependencies.map(dependencyKey))
  const missingWriterEdges = appliedDependencies.filter((dependency) => !exportedKeys.has(dependencyKey(dependency)))
  const unresolvedExternalDependencyCountValue = unresolvedExternalDependencyCount(writerResult)
  const invalidExportRows = exportedDependencies.filter((dependency) => {
    return dependency.projectId !== args.projectId
      || dependency.sourceType !== 'construction_organization_plan_network'
      || !dependency.taskId
      || !dependency.dependencyTaskId
  })

  const blockers = [
    args.writerResult ? null : 'writer_result_required',
    args.taskDependencies ? null : 'task_dependencies_export_required',
    args.criticalPathReadback ? null : 'critical_path_readback_required',
    args.baselineId ? null : 'baseline_id_required',
    args.projectId ? null : 'project_id_required',
    text(writerRoot.baselineId ?? writerRoot.baseline_id) === args.baselineId ? null : 'writer_result_baseline_id_mismatch',
    text(writerRoot.projectId ?? writerRoot.project_id) === args.projectId ? null : 'writer_result_project_id_mismatch',
    ...defaultMasterPlanBlockers(candidatePlan),
    ...sourceLabelBlockers,
    text(writerRoot.execution_mode ?? writerRoot.executionMode) === 'execute' ? null : 'dependency_writer_execute_mode_required',
    text(taskMapping.status) === 'runtime_task_mapping_verified' ? null : 'runtime_task_mapping_verified_required',
    writerResult.source === 'construction_organization_plan_network_domain_writer' ? null : 'construction_organization_plan_network_domain_writer_required',
    writerResult.status === 'runtime_apply_ready' ? null : 'domain_writer_runtime_apply_ready_required',
    readBoolean(writerResult.writesTaskDependencies ?? writerResult.writes_task_dependencies) ? null : 'domain_writer_must_write_task_dependencies',
    readBoolean(writerResult.writesPlanDates ?? writerResult.writes_plan_dates) ? 'domain_writer_must_not_write_plan_dates_for_dependency_gate' : null,
    readBoolean(writerResult.writesSeed ?? writerResult.writes_seed) ? 'domain_writer_must_not_write_seed' : null,
    readBoolean(writerResult.writesBaseline ?? writerResult.writes_baseline) ? 'domain_writer_must_not_write_baseline' : null,
    readBoolean(writerResult.releaseRecordPersisted ?? writerResult.release_record_persisted) ? null : 'release_record_persisted_required',
    text(writerResult.releaseHandoffCandidateEventId ?? writerResult.release_handoff_candidate_event_id) ? null : 'release_handoff_candidate_event_id_required',
    text(writerResult.releaseRecordTarget ?? writerResult.release_record_target) ? null : 'release_record_target_required',
    text(writerResult.rollbackTarget ?? writerResult.rollback_target) ? null : 'rollback_target_required',
    unresolvedExternalDependencyCountValue === 0 ? null : 'unresolved_external_dependency_anchors_present',
    appliedDependencies.length > 0 ? null : 'applied_dependencies_required',
    exportedDependencies.length >= appliedDependencies.length ? null : 'task_dependencies_export_count_too_low',
    missingWriterEdges.length === 0 ? null : 'task_dependencies_export_missing_writer_edges',
    invalidExportRows.length === 0 ? null : 'task_dependencies_export_rows_invalid',
    ...criticalPath.blockers,
    criticalPath.evidence_ref ? null : 'critical_path_evidence_ref_required',
    ...sourceMetadataBlockers,
  ].filter(Boolean)

  const domainWriterResult = {
    ...writerResult,
    status: blockers.length > 0 ? 'blocked' : writerResult.status,
    appliedDependencies,
    insertedDependencyCount: readNumber(writerResult.insertedDependencyCount ?? writerResult.inserted_dependency_count) || appliedDependencies.length,
    unresolvedExternalDependencyCount: unresolvedExternalDependencyCountValue,
  }

  return {
    schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
    baselineId: args.baselineId,
    projectId: args.projectId,
    status: blockers.length > 0 ? 'blocked' : 'writer_execute_readback_verified',
    execution_mode: text(writerRoot.execution_mode ?? writerRoot.executionMode),
    sourceEvidenceRef,
    candidate_default_master_plan: {
      generation_mode: candidateGenerationMode,
      source_version_label: candidateSourceVersionLabel,
      candidate_default_master_plan_baseline: isSupportedDefaultMasterPlan,
    },
    task_mapping: {
      status: blockers.length > 0 ? 'blocked' : text(taskMapping.status),
      mapped_generated_row_count: readNumber(taskMapping.mapped_generated_row_count ?? taskMapping.mappedGeneratedRowCount),
      mapped_task_count: readNumber(taskMapping.mapped_task_count ?? taskMapping.mappedTaskCount),
      unresolved_generated_row_ids: Array.isArray(taskMapping.unresolved_generated_row_ids)
        ? taskMapping.unresolved_generated_row_ids
        : Array.isArray(taskMapping.unresolvedGeneratedRowIds)
          ? taskMapping.unresolvedGeneratedRowIds
          : [],
    },
    domain_writer_result: domainWriterResult,
    task_dependencies_export: {
      exportedDependencyCount: exportedDependencies.length,
      ignoredUnrelatedDependencyCount,
      matchedWriterEdgeCount: appliedDependencies.length - missingWriterEdges.length,
      missingWriterEdgeCount: missingWriterEdges.length,
    },
    critical_path_recalculation: {
      status: criticalPath.blockers.length > 0 ? 'blocked' : criticalPath.status,
      evidence_ref: criticalPath.evidence_ref,
    },
    blockers,
    productionReady: false,
    mutationBoundary: {
      readsWriterResult: true,
      readsTaskDependenciesExport: true,
      readsCriticalPathReadback: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesSeeds: false,
      writesBaselines: false,
    },
  }
}

const args = parseArgs(process.argv.slice(2))
let writerRoot = {}
let taskDependencyRows = []
let criticalPathRecord = {}
let sourceMetadataBlockers = []
let sourceEvidenceRef = args.taskDependencies ? `task_dependencies_export:${repoRelative(args.taskDependencies)}` : 'task_dependencies_export:missing'
if (args.writerResult) {
  const writerPayload = await readJson(args.writerResult)
  writerRoot = writerEvidenceRoot(writerPayload)
  sourceMetadataBlockers.push(...sourceExportMetadataBlockers(writerPayload, 'writer_result'))
}
if (args.taskDependencies) {
  const hash = await sha256File(args.taskDependencies)
  sourceEvidenceRef = `${sourceEvidenceRef}#sha256=${hash}`
  const taskDependencyPayload = await readJson(args.taskDependencies)
  taskDependencyRows = readRows(taskDependencyPayload)
  sourceMetadataBlockers.push(...sourceExportMetadataBlockers(taskDependencyPayload, 'task_dependencies_export'))
}
if (args.criticalPathReadback) {
  criticalPathRecord = await readJson(args.criticalPathReadback)
  sourceMetadataBlockers.push(...sourceExportMetadataBlockers(criticalPathRecord, 'critical_path_readback'))
}
const criticalPath = selectCriticalPathEvidence(criticalPathRecord, args, args.criticalPathReadback)
const evidence = buildEvidence({
  args,
  writerRoot,
  taskDependencyRows,
  criticalPath,
  sourceEvidenceRef,
  sourceMetadataBlockers,
})

await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  output: repoRelative(args.output),
  baselineId: evidence.baselineId,
  projectId: evidence.projectId,
  insertedDependencyCount: evidence.domain_writer_result.insertedDependencyCount,
  blockers: evidence.blockers,
}, null, 2))
