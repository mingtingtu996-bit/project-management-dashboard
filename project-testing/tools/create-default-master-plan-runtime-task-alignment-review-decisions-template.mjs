#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_REFRESH_PACKAGE = path.join(REPORT_ROOT, 'runtime-task-alignment-refresh-package.json')
const DEFAULT_OUTPUT = path.join(REPORT_ROOT, 'runtime-task-alignment-review-decisions.json')

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    runtimeTaskAlignmentRefreshPackage: DEFAULT_REFRESH_PACKAGE,
    output: DEFAULT_OUTPUT,
    preparedBy: '',
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
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--prepared-by') {
      options.preparedBy = text(nextValue())
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function createDefaultMasterPlanRuntimeTaskAlignmentReviewDecisionsTemplate({
  runtimeTaskAlignmentRefreshPackage = DEFAULT_REFRESH_PACKAGE,
  output = DEFAULT_OUTPUT,
  preparedBy = '',
  now = new Date(),
} = {}) {
  const refreshPackagePath = path.resolve(runtimeTaskAlignmentRefreshPackage)
  const outputPath = path.resolve(output)
  const refreshPackage = JSON.parse(await readFile(refreshPackagePath, 'utf8'))
  const actions = Array.isArray(refreshPackage.actions) ? refreshPackage.actions.map(readAction) : []
  const decisions = actions.map((action) => ({
    actionIndex: action.index,
    stableCode: action.stableCode,
    candidateTitle: action.candidateTitle,
    runtimeTaskId: action.runtimeTaskId,
    runtimeTitle: action.runtimeTitle,
    actionKind: action.actionKind,
    proposedStableCode: action.proposedStableCode,
    recommendedDecisionOptions: recommendedDecisionOptions(action.actionKind),
    decision: '',
    decisionNotes: '',
    decisionEvidenceRef: '',
    collisionReviewRequired: action.blockers.includes('runtime_stable_code_collision_review_required'),
    collisionReviewDecision: '',
    sourceBlockers: action.blockers,
  }))
  const template = {
    schemaVersion: 'workbuddy-default-master-plan-runtime-task-alignment-review-decisions/v1',
    generatedAt: now.toISOString(),
    source: 'create-default-master-plan-runtime-task-alignment-review-decisions-template',
    status: actions.length > 0 ? 'operator_review_required' : 'no_runtime_task_alignment_actions',
    productionReady: false,
    baselineId: text(refreshPackage.baselineId ?? refreshPackage.baseline_id),
    projectId: text(refreshPackage.projectId ?? refreshPackage.project_id),
    preparedBy: text(preparedBy),
    runtimeTaskAlignmentRefreshPackageRef: await localEvidenceRef(
      'runtime_task_alignment_refresh_package',
      refreshPackagePath,
    ),
    summary: {
      actionCount: actions.length,
      decisionPlaceholderCount: decisions.filter((decision) => !decision.decision).length,
      collisionReviewRequiredCount: decisions.filter((decision) => decision.collisionReviewRequired).length,
    },
    decisions,
    blockers: [
      preparedBy ? null : 'prepared_by_required',
      actions.length > 0 ? 'human_operator_decisions_required' : null,
    ].filter(Boolean),
    mutationBoundary: {
      readsRuntimeTaskAlignmentRefreshPackage: true,
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
  await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(template), 'utf8')
  return template
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

function recommendedDecisionOptions(actionKind) {
  if (actionKind === 'review_runtime_task_stable_code_refresh') {
    return [
      'accepted_for_runtime_stable_code_review',
      'rejected_runtime_stable_code_refresh',
    ]
  }
  if (actionKind === 'collect_current_completed_task_or_confirm_scope_gap') {
    return [
      'confirmed_candidate_scope_gap',
      'accepted_current_completed_task_evidence',
      'rejected_missing_runtime_task_action',
    ]
  }
  if (actionKind === 'collect_runtime_task_actual_date_range') {
    return [
      'accepted_actual_date_range_evidence',
      'rejected_actual_date_range_action',
    ]
  }
  return ['rejected_runtime_task_alignment_action']
}

function renderMarkdown(template) {
  const lines = [
    '# Runtime Task Alignment Review Decisions Template',
    '',
    `- status: ${template.status}`,
    `- productionReady: ${template.productionReady}`,
    `- baselineId: ${template.baselineId}`,
    `- projectId: ${template.projectId}`,
    `- preparedBy: ${template.preparedBy || 'missing'}`,
    `- actionCount: ${template.summary.actionCount}`,
    `- decisionPlaceholderCount: ${template.summary.decisionPlaceholderCount}`,
    `- collisionReviewRequiredCount: ${template.summary.collisionReviewRequiredCount}`,
    `- blockers: ${template.blockers.length > 0 ? template.blockers.join(', ') : 'none'}`,
    '',
    'Fill `decision`, `decisionNotes`, and collision review fields where required. This template does not accept or execute runtime task changes.',
    '',
    '| index | stableCode | actionKind | proposedStableCode | options | collisionRequired | decision |',
    '|---:|---|---|---|---|---|---|',
  ]
  for (const decision of template.decisions) {
    lines.push(`| ${[
      decision.actionIndex,
      decision.stableCode,
      decision.actionKind,
      decision.proposedStableCode,
      decision.recommendedDecisionOptions.join(', '),
      decision.collisionReviewRequired,
      decision.decision || '<fill>',
    ].map(escapeTable).join(' | ')} |`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
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
    console.log('Usage: node project-testing/tools/create-default-master-plan-runtime-task-alignment-review-decisions-template.mjs --runtime-task-alignment-refresh-package <json> --output <json> --prepared-by <id>')
    process.exit(0)
  }
  const template = await createDefaultMasterPlanRuntimeTaskAlignmentReviewDecisionsTemplate(options)
  console.log(JSON.stringify({
    status: template.status,
    output: repoRelative(options.output),
    baselineId: template.baselineId,
    projectId: template.projectId,
    actionCount: template.summary.actionCount,
    blockers: template.blockers,
  }, null, 2))
}
