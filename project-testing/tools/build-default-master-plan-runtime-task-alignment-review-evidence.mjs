#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_REFRESH_PACKAGE = path.join(REPORT_ROOT, 'runtime-task-alignment-refresh-package.json')
const DEFAULT_REVIEW_DECISIONS = path.join(REPORT_ROOT, 'runtime-task-alignment-review-decisions.json')
const DEFAULT_OUTPUT = path.join(REPORT_ROOT, 'runtime-task-alignment-review-evidence.json')

const STABLE_CODE_REFRESH_DECISIONS = new Set([
  'accepted_for_runtime_stable_code_review',
  'rejected_runtime_stable_code_refresh',
])
const MISSING_RUNTIME_TASK_DECISIONS = new Set([
  'confirmed_candidate_scope_gap',
  'accepted_current_completed_task_evidence',
  'rejected_missing_runtime_task_action',
])
const ACTUAL_DATE_RANGE_DECISIONS = new Set([
  'accepted_actual_date_range_evidence',
  'rejected_actual_date_range_action',
])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    runtimeTaskAlignmentRefreshPackage: DEFAULT_REFRESH_PACKAGE,
    reviewDecisions: DEFAULT_REVIEW_DECISIONS,
    output: DEFAULT_OUTPUT,
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
    if (arg === '--runtime-task-alignment-refresh-package') {
      options.runtimeTaskAlignmentRefreshPackage = path.resolve(nextValue())
    } else if (arg === '--review-decisions') {
      options.reviewDecisions = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--reviewed-by') {
      options.reviewedBy = text(nextValue())
    } else if (arg === '--review-notes') {
      options.reviewNotes = text(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanRuntimeTaskAlignmentReviewEvidence({
  runtimeTaskAlignmentRefreshPackage = DEFAULT_REFRESH_PACKAGE,
  reviewDecisions = DEFAULT_REVIEW_DECISIONS,
  output = DEFAULT_OUTPUT,
  reviewedBy = '',
  reviewNotes = '',
  now = new Date(),
} = {}) {
  const refreshPackagePath = path.resolve(runtimeTaskAlignmentRefreshPackage)
  const reviewDecisionsPath = path.resolve(reviewDecisions)
  const outputPath = path.resolve(output)

  const refreshPackage = JSON.parse(await readFile(refreshPackagePath, 'utf8'))
  const reviewDecisionPayload = await readJsonIfPresent(reviewDecisionsPath)
  const actions = Array.isArray(refreshPackage.actions) ? refreshPackage.actions.map(readAction) : []
  const decisions = readDecisionRecords(reviewDecisionPayload)
  const decisionByActionKey = new Map()
  for (const decision of decisions) {
    const key = actionKey(decision.actionIndex, decision.stableCode)
    if (!decisionByActionKey.has(key)) decisionByActionKey.set(key, decision)
  }

  const actionReviews = actions.map((action) => buildActionReview(action, decisionByActionKey))
  const unreviewedActions = actionReviews.filter((review) => !review.reviewed)
  const rejectedActions = actionReviews.filter((review) => review.decision.startsWith('rejected_'))
  const invalidActions = actionReviews.filter((review) => review.blockers.length > 0)
  const stableCodeRefreshReviews = actionReviews.filter((review) => review.actionKind === 'review_runtime_task_stable_code_refresh')
  const missingRuntimeTaskReviews = actionReviews.filter((review) => review.actionKind === 'collect_current_completed_task_or_confirm_scope_gap')
  const actualDateRangeReviews = actionReviews.filter((review) => review.actionKind === 'collect_runtime_task_actual_date_range')
  const blockers = uniqueText([
    text(refreshPackage.baselineId ?? refreshPackage.baseline_id) ? null : 'baseline_id_required',
    text(refreshPackage.projectId ?? refreshPackage.project_id) ? null : 'project_id_required',
    text(reviewedBy) ? null : 'reviewed_by_required',
    text(reviewNotes) ? null : 'review_notes_required',
    Object.keys(reviewDecisionPayload).length > 0 ? null : 'review_decisions_required',
    actions.length === 0 ? 'refresh_actions_required' : null,
    unreviewedActions.length === 0 ? null : 'all_refresh_actions_must_be_reviewed',
    ...invalidActions.flatMap((review) => review.blockers),
  ])
  const accepted = blockers.length === 0
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-review-evidence/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-runtime-task-alignment-review-evidence',
    status: accepted ? 'accepted_for_runtime_alignment_review' : 'blocked',
    productionReady: false,
    baselineId: text(refreshPackage.baselineId ?? refreshPackage.baseline_id),
    projectId: text(refreshPackage.projectId ?? refreshPackage.project_id),
    reviewedBy: text(reviewedBy),
    reviewNotes: text(reviewNotes),
    runtimeTaskAlignmentRefreshPackageRef: await localEvidenceRef(
      'runtime_task_alignment_refresh_package',
      refreshPackagePath,
    ),
    reviewDecisionsRef: Object.keys(reviewDecisionPayload).length > 0
      ? await localEvidenceRef('runtime_task_alignment_review_decisions', reviewDecisionsPath)
      : 'runtime_task_alignment_review_decisions:missing',
    summary: {
      actionCount: actions.length,
      reviewedActionCount: actionReviews.filter((review) => review.reviewed).length,
      unreviewedActionCount: unreviewedActions.length,
      stableCodeRefreshActionCount: stableCodeRefreshReviews.length,
      acceptedStableCodeRefreshCount: stableCodeRefreshReviews.filter((review) => review.decision === 'accepted_for_runtime_stable_code_review').length,
      missingRuntimeTaskActionCount: missingRuntimeTaskReviews.length,
      confirmedScopeGapCount: missingRuntimeTaskReviews.filter((review) => review.decision === 'confirmed_candidate_scope_gap').length,
      acceptedCurrentCompletedTaskEvidenceCount: missingRuntimeTaskReviews.filter((review) => review.decision === 'accepted_current_completed_task_evidence').length,
      actualDateRangeActionCount: actualDateRangeReviews.length,
      acceptedActualDateRangeEvidenceCount: actualDateRangeReviews.filter((review) => review.decision === 'accepted_actual_date_range_evidence').length,
      collisionReviewActionCount: actionReviews.filter((review) => review.collisionReviewRequired).length,
      collisionReviewedCount: actionReviews.filter((review) => review.collisionReviewRequired && text(review.collisionReviewDecision)).length,
      rejectedActionCount: rejectedActions.length,
      invalidActionCount: invalidActions.length,
    },
    actionReviews,
    blockers,
    executionControl: {
      executeAllowed: false,
      reason: 'review_evidence_only_no_automatic_runtime_task_update',
      requiredNextWriter: 'governed_runtime_task_update_or_operator_supplied_source_export_if_any_action_requires_mutation',
    },
    mutationBoundary: {
      readsRuntimeTaskAlignmentRefreshPackage: true,
      readsReviewDecisions: Object.keys(reviewDecisionPayload).length > 0,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildActionReview(action, decisionByActionKey) {
  const decision = decisionByActionKey.get(actionKey(action.index, action.stableCode)) ?? {}
  const decisionText = text(decision.decision)
  const reviewed = Boolean(decisionText)
  const collisionReviewRequired = action.blockers.includes('runtime_stable_code_collision_review_required')
  const blockers = []
  if (!reviewed) {
    blockers.push(...actionDecisionRequiredBlockers(action.actionKind))
  } else if (!isDecisionAllowedForAction(action.actionKind, decisionText)) {
    blockers.push(`${action.actionKind}_decision_invalid`)
  }
  if (reviewed && !text(decision.decisionNotes ?? decision.decision_notes)) {
    blockers.push('action_decision_notes_required')
  }
  if (collisionReviewRequired && !text(decision.collisionReviewDecision ?? decision.collision_review_decision)) {
    blockers.push('collision_review_decision_required')
  }
  return {
    actionIndex: action.index,
    stableCode: action.stableCode,
    candidateTitle: action.candidateTitle,
    runtimeTaskId: action.runtimeTaskId,
    runtimeTitle: action.runtimeTitle,
    actionKind: action.actionKind,
    proposedStableCode: action.proposedStableCode,
    reviewed,
    decision: decisionText,
    decisionNotes: text(decision.decisionNotes ?? decision.decision_notes),
    decisionEvidenceRef: text(decision.evidenceRef ?? decision.evidence_ref),
    collisionReviewRequired,
    collisionReviewDecision: text(decision.collisionReviewDecision ?? decision.collision_review_decision),
    blockers,
  }
}

function isDecisionAllowedForAction(actionKind, decision) {
  if (actionKind === 'review_runtime_task_stable_code_refresh') return STABLE_CODE_REFRESH_DECISIONS.has(decision)
  if (actionKind === 'collect_current_completed_task_or_confirm_scope_gap') return MISSING_RUNTIME_TASK_DECISIONS.has(decision)
  if (actionKind === 'collect_runtime_task_actual_date_range') return ACTUAL_DATE_RANGE_DECISIONS.has(decision)
  return false
}

function actionDecisionRequiredBlockers(actionKind) {
  if (actionKind === 'review_runtime_task_stable_code_refresh') return ['stable_code_refresh_action_decision_required']
  if (actionKind === 'collect_current_completed_task_or_confirm_scope_gap') {
    return [
      'missing_runtime_task_action_decision_required',
      'actual_date_range_action_decision_required',
    ]
  }
  if (actionKind === 'collect_runtime_task_actual_date_range') return ['actual_date_range_action_decision_required']
  return ['runtime_task_alignment_action_decision_required']
}

function readAction(action, index) {
  return {
    index: readNumber(action.index) || index + 1,
    stableCode: text(action.stableCode ?? action.stable_code),
    candidateTitle: text(action.candidateTitle ?? action.candidate_title),
    runtimeTaskId: text(action.runtimeTaskId ?? action.runtime_task_id),
    runtimeTitle: text(action.runtimeTitle ?? action.runtime_title),
    actionKind: text(action.actionKind ?? action.action_kind),
    proposedStableCode: text(action.proposedStableCode ?? action.proposed_stable_code),
    blockers: arrayOfText(action.blockers),
  }
}

function readDecisionRecords(payload) {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.decisions)
      ? payload.decisions
      : Array.isArray(payload.actionReviews)
        ? payload.actionReviews
        : Array.isArray(payload.action_reviews)
          ? payload.action_reviews
          : []
  return records.map((record) => ({
    actionIndex: readNumber(record.actionIndex ?? record.action_index ?? record.index),
    stableCode: text(record.stableCode ?? record.stable_code),
    decision: text(record.decision),
    decisionNotes: text(record.decisionNotes ?? record.decision_notes),
    evidenceRef: text(record.evidenceRef ?? record.evidence_ref),
    collisionReviewDecision: text(record.collisionReviewDecision ?? record.collision_review_decision),
  })).filter((record) => record.actionIndex > 0 || record.stableCode)
}

function actionKey(index, stableCode) {
  return `${readNumber(index)}:${text(stableCode)}`
}

function renderMarkdown(report) {
  const lines = [
    '# Runtime Task Alignment Review Evidence',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- reviewedBy: ${report.reviewedBy || 'missing'}`,
    `- actionCount: ${report.summary.actionCount}`,
    `- reviewedActionCount: ${report.summary.reviewedActionCount}`,
    `- unreviewedActionCount: ${report.summary.unreviewedActionCount}`,
    `- acceptedStableCodeRefreshCount: ${report.summary.acceptedStableCodeRefreshCount}`,
    `- confirmedScopeGapCount: ${report.summary.confirmedScopeGapCount}`,
    `- acceptedActualDateRangeEvidenceCount: ${report.summary.acceptedActualDateRangeEvidenceCount}`,
    `- collisionReviewedCount: ${report.summary.collisionReviewedCount}`,
    `- executeAllowed: ${report.executionControl.executeAllowed}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '',
    'This is no automatic runtime task update evidence. It does not mutate runtime tasks, dependencies, duration samples, publications, or production tables.',
    '',
    '| index | stableCode | actionKind | proposedStableCode | decision | collisionDecision | blockers |',
    '|---:|---|---|---|---|---|---|',
  ]
  for (const review of report.actionReviews) {
    lines.push(`| ${[
      review.actionIndex,
      review.stableCode,
      review.actionKind,
      review.proposedStableCode,
      review.decision,
      review.collisionReviewDecision,
      review.blockers.length > 0 ? review.blockers.join(', ') : 'none',
    ].map(escapeTable).join(' | ')} |`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

async function localEvidenceRef(kind, filePath) {
  const hash = createHash('sha256').update(await readFile(filePath)).digest('hex')
  return `${kind}:${repoRelative(filePath)}#sha256=${hash}`
}

function markdownPathFor(filePath) {
  return filePath.replace(/\.json$/i, '.md')
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function arrayOfText(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs()
  if (options.help) {
    console.log('Usage: node project-testing/tools/build-default-master-plan-runtime-task-alignment-review-evidence.mjs --runtime-task-alignment-refresh-package <json> --review-decisions <json> --output <json> --reviewed-by <id> --review-notes <text>')
    process.exit(0)
  }
  const report = await buildDefaultMasterPlanRuntimeTaskAlignmentReviewEvidence(options)
  console.log(JSON.stringify({
    status: report.status,
    output: repoRelative(options.output),
    baselineId: report.baselineId,
    projectId: report.projectId,
    reviewedActionCount: report.summary.reviewedActionCount,
    blockers: report.blockers,
  }, null, 2))
}
