#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSourceExportMetadata, sourceExportMetadataBlockers } from './default-master-plan-source-export-metadata.mjs'
import {
  defaultMasterPlanRowSourceSignals,
  defaultMasterPlanSourceBlockers,
} from './default-master-plan-source-guard.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness', 'pm-review-evidence.json')
const REVIEW_BLOCKER_CODES = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]

function parseArgs(argv) {
  const args = {
    reviewExport: null,
    baselineId: null,
    projectId: null,
    output: DEFAULT_OUTPUT,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--review-export') {
      args.reviewExport = path.resolve(argv[index + 1] ?? '')
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
      console.log(`Usage: node project-testing/tools/build-default-master-plan-review-evidence.mjs --review-export <candidate_default_master_plan_review_export.json> --baseline-id <id> --project-id <id> [--output <json>]`)
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
  if (Array.isArray(payload?.change_logs)) return payload.change_logs
  if (Array.isArray(payload?.changeLogs)) return payload.changeLogs
  if (Array.isArray(payload?.candidateDefaultMasterPlanReviews)) return payload.candidateDefaultMasterPlanReviews
  if (Array.isArray(payload?.candidate_default_master_plan_reviews)) return payload.candidate_default_master_plan_reviews
  return []
}

async function sha256File(filePath) {
  const content = await fs.readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function reviewFromRow(row) {
  const record = readObject(row)
  const afterSnapshot = readObject(record.after_snapshot ?? record.afterSnapshot)
  return readObject(
    record.candidate_governance_review
      ?? record.candidateGovernanceReview
      ?? afterSnapshot.candidate_governance_review
      ?? afterSnapshot.candidateGovernanceReview
      ?? record.review,
  )
}

function rowProjectId(row) {
  return text(row.project_id ?? row.projectId)
}

function rowBaselineId(row) {
  return text(row.entity_id ?? row.entityId ?? row.baseline_id ?? row.baselineId)
}

function rowFieldName(row) {
  return text(row.field_name ?? row.fieldName)
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : []
}

function selectReviewRow(rows, args) {
  const candidateRows = rows.filter((row) => rowFieldName(row) === 'candidate_default_master_plan_review')
  const matchingRows = candidateRows.filter((row) => {
    const baselineId = rowBaselineId(row)
    const projectId = rowProjectId(row)
    return (!args.baselineId || baselineId === args.baselineId)
      && (!args.projectId || !projectId || projectId === args.projectId)
  })
  return matchingRows[0] ?? candidateRows[0] ?? rows[0] ?? {}
}

function reviewRowSourceBlockers(row) {
  const guard = defaultMasterPlanSourceBlockers(defaultMasterPlanRowSourceSignals(row))
  return guard.blockers
}

function buildEvidence({ args, rows, row, sourceEvidenceRef, sourceMetadataBlockers = [] }) {
  const review = reviewFromRow(row)
  const baselineId = rowBaselineId(row)
  const projectId = rowProjectId(row)
  const reviewedItemIds = normalizeStringArray(review.reviewed_item_ids ?? review.reviewedItemIds)
  const acknowledgedBlockers = normalizeStringArray(review.acknowledged_blockers ?? review.acknowledgedBlockers)
  const missingBlockers = REVIEW_BLOCKER_CODES.filter((code) => !acknowledgedBlockers.includes(code))
  const reviewNotes = text(review.review_notes ?? review.reviewNotes ?? review.change_summary ?? review.changeSummary)
  const blockers = [
    args.reviewExport ? null : 'review_export_required',
    args.baselineId ? null : 'baseline_id_required',
    args.projectId ? null : 'project_id_required',
    rows.length > 0 ? null : 'review_export_rows_required',
    rowFieldName(row) === 'candidate_default_master_plan_review' ? null : 'change_log_candidate_default_master_plan_review_required',
    baselineId === args.baselineId ? null : 'review_baseline_id_mismatch',
    !projectId || projectId === args.projectId ? null : 'review_project_id_mismatch',
    text(review.decision) === 'accepted_for_baseline' ? null : 'decision_must_be_accepted_for_baseline',
    text(review.reviewed_by ?? review.reviewedBy ?? row.changed_by ?? row.changedBy) ? null : 'reviewed_by_required',
    text(review.reviewed_at ?? review.reviewedAt ?? row.changed_at ?? row.changedAt) ? null : 'reviewed_at_required',
    reviewedItemIds.length > 0 ? null : 'reviewed_item_ids_required',
    missingBlockers.length === 0 ? null : `acknowledged_blockers_missing:${missingBlockers.join(',')}`,
    reviewNotes ? null : 'review_notes_or_change_summary_required',
    ...sourceMetadataBlockers,
    ...reviewRowSourceBlockers(row),
  ].filter(Boolean)

  const normalizedReview = {
    decision: 'accepted_for_baseline',
    reviewed_by: text(review.reviewed_by ?? review.reviewedBy ?? row.changed_by ?? row.changedBy),
    reviewed_at: text(review.reviewed_at ?? review.reviewedAt ?? row.changed_at ?? row.changedAt),
    reviewed_item_ids: reviewedItemIds,
    reviewed_item_count: Number(review.reviewed_item_count ?? review.reviewedItemCount ?? reviewedItemIds.length),
    acknowledged_blockers: acknowledgedBlockers,
    review_notes: reviewNotes,
    production_ready: false,
  }

  return {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    baselineId: args.baselineId,
    projectId: args.projectId,
    status: blockers.length > 0 ? 'blocked' : 'accepted_for_baseline',
    source: 'candidate_default_master_plan_review_evidence_builder',
    sourceEvidenceRef,
    candidate_governance_review: normalizedReview,
    change_log: {
      entity_type: text(row.entity_type ?? row.entityType) || 'baseline',
      entity_id: baselineId,
      field_name: rowFieldName(row),
      changed_by: text(row.changed_by ?? row.changedBy ?? normalizedReview.reviewed_by),
      changed_at: text(row.changed_at ?? row.changedAt ?? normalizedReview.reviewed_at),
      action_type: text(row.action_type ?? row.actionType),
    },
    blockers,
    productionReady: false,
    mutationBoundary: {
      readsCandidateReviewExport: true,
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
let rows = []
let sourceMetadataBlockers = []
let sourceEvidenceRef = args.reviewExport
  ? `candidate_default_master_plan_review_export:${repoRelative(args.reviewExport)}`
  : 'candidate_default_master_plan_review_export:missing'
if (args.reviewExport) {
  const hash = await sha256File(args.reviewExport)
  sourceEvidenceRef = `${sourceEvidenceRef}#sha256=${hash}`
  const payload = JSON.parse(await fs.readFile(args.reviewExport, 'utf8'))
  rows = readRows(payload)
  const metadata = readSourceExportMetadata(payload)
  sourceMetadataBlockers = [
    ...sourceExportMetadataBlockers(payload, 'review_export'),
    text(metadata.source_kind ?? metadata.sourceKind) === 'database_table'
      ? null
      : 'review_export_database_change_log_required',
    text(metadata.table) === 'public.change_logs'
      ? null
      : 'review_export_change_logs_table_required',
  ].filter(Boolean)
}

const row = selectReviewRow(rows, args)
const evidence = buildEvidence({ args, rows, row, sourceEvidenceRef, sourceMetadataBlockers })

await fs.mkdir(path.dirname(args.output), { recursive: true })
await fs.writeFile(args.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  status: evidence.status,
  output: repoRelative(args.output),
  baselineId: evidence.baselineId,
  projectId: evidence.projectId,
  blockers: evidence.blockers,
}, null, 2))
