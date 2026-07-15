#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_REVIEW_PACKAGE = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/pm-review-package.json')
const DEFAULT_REVIEW_EVIDENCE = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/pm-review-evidence.json')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/pm-review-record-preflight.json')
const PLACEHOLDER_PATTERN = /<[^>\r\n]+>|\bTODO\b|\bTBD\b|\bplaceholder\b/i
const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])
const AUTOMATION_REVIEWER_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
  /after-/i,
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    reviewPackage: DEFAULT_REVIEW_PACKAGE,
    reviewEvidence: DEFAULT_REVIEW_EVIDENCE,
    output: DEFAULT_OUTPUT,
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
    if (arg === '--review-package') {
      options.reviewPackage = path.resolve(nextValue())
    } else if (arg === '--review-evidence') {
      options.reviewEvidence = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function checkDefaultMasterPlanReviewRecordPreflight({
  reviewPackage = DEFAULT_REVIEW_PACKAGE,
  reviewEvidence = DEFAULT_REVIEW_EVIDENCE,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const reviewPackagePath = path.resolve(reviewPackage)
  const reviewEvidencePath = path.resolve(reviewEvidence)
  const outputPath = path.resolve(output)
  const reviewPackagePayload = JSON.parse(await readFile(reviewPackagePath, 'utf8'))
  const reviewEvidencePayload = await readJsonIfPresent(reviewEvidencePath)
  const command = text(reviewPackagePayload.recordReviewCommand)
  const commandArgs = parseRecordReviewCommand(command)
  const placeholderFindings = (command.match(new RegExp(PLACEHOLDER_PATTERN.source, 'gi')) ?? [])
    .map((placeholder) => ({ placeholder, command }))
  const baselineId = text(reviewPackagePayload.baselineId)
  const projectId = text(reviewPackagePayload.projectId)
  const reviewedItemIds = Array.isArray(reviewPackagePayload.reviewedItemIds)
    ? reviewPackagePayload.reviewedItemIds.map(text).filter(Boolean)
    : []
  const reviewedItemCount = Number(reviewPackagePayload.reviewedItemCount ?? reviewedItemIds.length)
  const mode = text(commandArgs.mode) || (commandArgs.execute === true ? 'execute' : '')
  const reviewedBy = stripPlaceholderValue(commandArgs.reviewedBy)
  const reviewNotes = stripPlaceholderValue(commandArgs.reviewNotes)
  const environment = text(commandArgs.environment)
  const exportedBy = text(commandArgs.exportedBy)
  const commandReviewPackage = stripPlaceholderValue(commandArgs.reviewPackage)
  const commandBaselineId = text(commandArgs.baselineId)
  const commandProjectId = text(commandArgs.projectId)
  const acceptedReviewRecord = parseAcceptedReviewEvidence(reviewEvidencePayload, {
    baselineId,
    projectId,
    reviewedItemCount,
    reviewedItemIds,
  })

  if (acceptedReviewRecord.accepted) {
    const report = {
      schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
      generatedAt: now.toISOString(),
      source: 'check-default-master-plan-review-record-preflight',
      status: 'already_recorded',
      baselineId,
      projectId,
      reviewPackageRef: `pm_review_package:${repoRelative(reviewPackagePath)}`,
      reviewEvidenceRef: `pm_review_evidence:${repoRelative(reviewEvidencePath)}`,
      reviewedItemCount: acceptedReviewRecord.reviewedItemCount,
      mayExecuteReviewRecord: false,
      alreadyRecorded: true,
      blockers: [],
      placeholderFindings: [],
      executionPlan: {
        command: '',
        baselineId,
        projectId,
        reviewedBy: acceptedReviewRecord.reviewedBy,
        reviewNotes: acceptedReviewRecord.reviewNotes,
        environment: acceptedReviewRecord.environment,
        exportedBy: acceptedReviewRecord.exportedBy,
        mode: 'already_recorded',
      },
      mutationBoundary: {
        readsReviewPackage: true,
        readsReviewEvidence: true,
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

  const commandBlockers = unique([
    text(reviewPackagePayload.status) === 'ready_for_human_pm_review' ? null : 'review_package_not_ready',
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    command ? null : 'record_review_command_required',
    command.includes('evidence:default-master-plan:record-review') || command.includes('record-default-master-plan-review-export')
      ? null
      : 'record_review_command_not_recognized',
    placeholderFindings.length === 0 ? null : 'review_record_command_contains_placeholders',
    commandBaselineId === baselineId ? null : 'record_review_baseline_id_mismatch',
    commandProjectId === projectId ? null : 'record_review_project_id_mismatch',
    commandReviewPackage ? null : 'record_review_package_arg_required',
    commandReviewPackage && path.resolve(commandReviewPackage) === reviewPackagePath
      ? null
      : commandReviewPackage
        ? 'record_review_package_arg_mismatch'
        : null,
    reviewedItemCount > 0 && reviewedItemIds.length > 0 ? null : 'reviewed_item_ids_required',
    reviewedBy ? null : 'reviewed_by_required',
    isHumanReviewer(reviewedBy) ? null : 'human_project_manager_reviewer_required',
    reviewNotes ? null : 'review_notes_required',
    REAL_ENVIRONMENTS.has(environment) ? null : 'real_environment_required',
    exportedBy ? null : 'exported_by_required',
    mode === 'execute' ? null : 'review_record_execute_mode_required',
    reviewPackagePayload.productionReady === false ? null : 'review_package_must_not_mark_production_ready',
  ])
  const blockers = unique([
    ...commandBlockers,
    ...(commandBlockers.length > 0 ? readArray(acceptedReviewRecord.blockers) : []),
  ])
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-review-record-preflight/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-review-record-preflight',
    status: blockers.length === 0 ? 'ready_for_execute' : 'blocked',
    baselineId,
    projectId,
    reviewPackageRef: `pm_review_package:${repoRelative(reviewPackagePath)}`,
    reviewEvidenceRef: reviewEvidencePayload ? `pm_review_evidence:${repoRelative(reviewEvidencePath)}` : '',
    reviewedItemCount: Number.isFinite(reviewedItemCount) ? reviewedItemCount : 0,
    mayExecuteReviewRecord: blockers.length === 0,
    alreadyRecorded: false,
    blockers,
    placeholderFindings,
    reviewEvidence: acceptedReviewRecord.reviewEvidence,
    executionPlan: {
      command,
      baselineId: commandBaselineId,
      projectId: commandProjectId,
      reviewedBy,
      reviewNotes,
      environment,
      exportedBy,
      reviewPackage: commandReviewPackage,
      mode,
    },
    mutationBoundary: {
      readsReviewPackage: true,
      readsReviewEvidence: Boolean(reviewEvidencePayload),
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

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function parseAcceptedReviewEvidence(reviewEvidence, { baselineId, projectId, reviewedItemCount, reviewedItemIds = [] }) {
  if (!reviewEvidence || typeof reviewEvidence !== 'object') {
    return {
      accepted: false,
      blockers: [],
      reviewEvidence: {
        present: false,
        staleForCurrentPackage: false,
      },
    }
  }
  const review = reviewEvidence.candidate_governance_review ?? reviewEvidence.candidateGovernanceReview ?? {}
  const decision = firstText(review.decision, reviewEvidence.status)
  const evidenceBaselineId = firstText(reviewEvidence.baselineId, reviewEvidence.baseline_id, reviewEvidence.change_log?.entity_id)
  const evidenceProjectId = firstText(reviewEvidence.projectId, reviewEvidence.project_id, reviewEvidence.change_log?.project_id)
  const reviewedBy = firstText(review.reviewed_by, review.reviewedBy, reviewEvidence.change_log?.changed_by)
  const reviewNotes = firstText(review.review_notes, review.reviewNotes, review.change_summary, review.changeSummary)
  const reviewedAt = firstText(review.reviewed_at, review.reviewedAt, reviewEvidence.change_log?.changed_at)
  const evidenceReviewedItemCount = readNumber(review.reviewed_item_count ?? review.reviewedItemCount)
  const evidenceReviewedItemIds = readTextArray(review.reviewed_item_ids ?? review.reviewedItemIds)
  const environment = firstText(reviewEvidence.environment, reviewEvidence.export_metadata?.environment)
  const exportedBy = firstText(reviewEvidence.exportedBy, reviewEvidence.export_metadata?.exported_by)
  const productionReady = review.production_ready ?? review.productionReady ?? reviewEvidence.productionReady
  const itemCountMatches = evidenceReviewedItemCount === reviewedItemCount
  const itemIdsMatch = sameStringSet(evidenceReviewedItemIds, reviewedItemIds)
  const staleForCurrentPackage = !itemCountMatches || !itemIdsMatch
  const blockers = unique([
    staleForCurrentPackage ? 'pm_review_evidence_stale_for_current_review_package' : null,
    itemCountMatches ? null : 'review_evidence_reviewed_item_count_mismatch',
    itemIdsMatch ? null : 'review_evidence_reviewed_item_ids_mismatch',
  ])
  const accepted = [
    decision === 'accepted_for_baseline' || text(reviewEvidence.status) === 'accepted_for_baseline',
    evidenceBaselineId === baselineId,
    evidenceProjectId === projectId,
    itemCountMatches,
    itemIdsMatch,
    reviewedBy,
    isHumanReviewer(reviewedBy),
    reviewNotes,
    reviewedAt,
    productionReady === false,
  ].every(Boolean)

  return {
    accepted,
    reviewedBy,
    reviewNotes,
    reviewedAt,
    reviewedItemCount: evidenceReviewedItemCount,
    environment,
    exportedBy,
    blockers,
    reviewEvidence: {
      present: true,
      staleForCurrentPackage,
      reviewedItemCount: evidenceReviewedItemCount,
      currentPackageReviewedItemCount: reviewedItemCount,
      reviewedItemIds: evidenceReviewedItemIds,
      currentPackageReviewedItemIds: reviewedItemIds,
      missingCurrentReviewedItemIds: reviewedItemIds.filter((id) => !evidenceReviewedItemIds.includes(id)),
      extraEvidenceReviewedItemIds: evidenceReviewedItemIds.filter((id) => !reviewedItemIds.includes(id)),
      baselineId: evidenceBaselineId,
      projectId: evidenceProjectId,
      reviewedBy,
      reviewedAt,
      environment,
      exportedBy,
    },
  }
}

function parseRecordReviewCommand(command) {
  const result = {}
  const tokens = shellSplit(command)
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const readValue = () => {
      const value = tokens[index + 1] ?? ''
      index += 1
      return value
    }
    if (token === '--baseline-id') result.baselineId = readValue()
    else if (token === '--project-id') result.projectId = readValue()
    else if (token === '--reviewed-by') result.reviewedBy = readValue()
    else if (token === '--review-notes') result.reviewNotes = readValue()
    else if (token === '--review-package') result.reviewPackage = readValue()
    else if (token === '--environment') result.environment = readValue()
    else if (token === '--exported-by') result.exportedBy = readValue()
    else if (token === '--mode') result.mode = readValue()
    else if (token === '--execute') result.execute = true
  }
  return result
}

function shellSplit(command) {
  const tokens = []
  let current = ''
  let quote = ''
  let escaping = false
  for (const char of command) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\') {
      current += char
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

function isHumanReviewer(value) {
  const reviewer = text(value)
  if (!reviewer) return false
  return !AUTOMATION_REVIEWER_PATTERNS.some((pattern) => pattern.test(reviewer))
}

function stripPlaceholderValue(value) {
  const normalized = text(value)
  if (!normalized) return ''
  return PLACEHOLDER_PATTERN.test(normalized) ? '' : normalized
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan PM Review Record Preflight',
    '',
    `- status: ${report.status}`,
    `- mayExecuteReviewRecord: ${report.mayExecuteReviewRecord}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- reviewedItemCount: ${report.reviewedItemCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesChangeLogs=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false`,
    '',
    '## Execution Plan',
    '',
    '| field | value |',
    '|---|---|',
    `| reviewedBy | ${escapeTable(report.executionPlan.reviewedBy)} |`,
    `| environment | ${escapeTable(report.executionPlan.environment)} |`,
    `| exportedBy | ${escapeTable(report.executionPlan.exportedBy)} |`,
    `| mode | ${escapeTable(report.executionPlan.mode)} |`,
    '',
    '## Placeholder Findings',
    '',
    '| placeholder |',
    '|---|',
  ]
  for (const finding of report.placeholderFindings) {
    lines.push(`| ${escapeTable(finding.placeholder)} |`)
  }
  if (report.placeholderFindings.length === 0) lines.push('| none |')
  return `${lines.join('\n')}\n`
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readTextArray(value) {
  return readArray(value).map(text).filter(Boolean)
}

function sameStringSet(left, right) {
  const leftSet = new Set(readTextArray(left))
  const rightSet = new Set(readTextArray(right))
  if (leftSet.size !== rightSet.size) return false
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false
  }
  return true
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

function readNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/check-default-master-plan-review-record-preflight.mjs',
    '  [--review-package <pm-review-package.json>]',
    '  [--output <pm-review-record-preflight.json>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await checkDefaultMasterPlanReviewRecordPreflight(options)
    console.log(JSON.stringify({
      status: report.status,
      mayExecuteReviewRecord: report.mayExecuteReviewRecord,
      baselineId: report.baselineId,
      projectId: report.projectId,
      reviewedItemCount: report.reviewedItemCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
