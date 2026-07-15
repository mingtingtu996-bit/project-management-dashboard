#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_GAP_SUMMARY = path.join(DEFAULT_OUTPUT_ROOT, 'real-evidence-gap-summary.json')
const DEFAULT_CHECKLIST = path.join(DEFAULT_OUTPUT_ROOT, 'blocked-gate-action-checklist.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'blocked-gate-action-checklist-freshness.json')
const DEFAULT_MARKDOWN = path.join(DEFAULT_OUTPUT_ROOT, 'blocked-gate-action-checklist-freshness.md')

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    gapSummary: DEFAULT_GAP_SUMMARY,
    checklist: DEFAULT_CHECKLIST,
    output: DEFAULT_OUTPUT,
    markdown: DEFAULT_MARKDOWN,
    json: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      index += 1
      return value
    }

    if (arg === '--gap-summary') {
      args.gapSummary = path.resolve(nextValue())
    } else if (arg === '--checklist') {
      args.checklist = path.resolve(nextValue())
    } else if (arg === '--output') {
      args.output = path.resolve(nextValue())
    } else if (arg === '--markdown') {
      args.markdown = path.resolve(nextValue())
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

export function buildBlockedGateActionChecklistFreshnessReport({
  gapSummaryText,
  checklist,
  gapSummaryPath = DEFAULT_GAP_SUMMARY,
  checklistPath = DEFAULT_CHECKLIST,
  now = new Date(),
} = {}) {
  const checklistObject = readObject(checklist)
  const currentGapSummaryDigest = digestText(String(gapSummaryText ?? ''))
  const checklistInputDigest = normalizeDigest(checklistObject.inputDigest ?? checklistObject.input_digest)
  const digestAvailable = Boolean(checklistInputDigest.sha256) && checklistInputDigest.sizeBytes > 0
  const algorithmMatches = digestAvailable && checklistInputDigest.algorithm.toLowerCase() === currentGapSummaryDigest.algorithm
  const sha256Matches = digestAvailable && checklistInputDigest.sha256.toLowerCase() === currentGapSummaryDigest.sha256
  const sizeBytesMatches = digestAvailable && checklistInputDigest.sizeBytes === currentGapSummaryDigest.sizeBytes
  const fresh = digestAvailable && algorithmMatches && sha256Matches && sizeBytesMatches
  const blockers = []

  if (!digestAvailable) {
    blockers.push('blocked_gate_action_checklist_input_digest_missing')
  } else {
    if (!algorithmMatches) blockers.push('blocked_gate_action_checklist_digest_algorithm_mismatch')
    if (!sha256Matches || !sizeBytesMatches) blockers.push('blocked_gate_action_checklist_digest_mismatch')
  }

  return {
    schemaVersion: 'workbuddy-default-master-plan-blocked-gate-action-checklist-freshness/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-blocked-gate-action-checklist-freshness',
    status: fresh ? 'fresh' : digestAvailable ? 'stale' : 'missing_digest',
    productionReady: false,
    gapSummary: gapSummaryPath,
    checklist: checklistPath,
    checklistStatus: String(checklistObject.status ?? '').trim() || 'unknown',
    currentGapSummaryDigest,
    checklistInputDigest,
    summary: {
      fresh,
      digestAvailable,
      algorithmMatches,
      sha256Matches,
      sizeBytesMatches,
    },
    blockers,
    evidenceBoundary: {
      evidenceTier: 'checklist_freshness_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'This freshness check only compares the checklist input digest with the current gap summary file.',
        'It does not execute commands, connect to databases, import seeds, publish runtime, run smoke, perform rollback, or close production readiness gates.',
      ],
    },
    mutationBoundary: [
      'Reads current real-evidence-gap-summary.json and blocked-gate-action-checklist.json only.',
      'Writes freshness JSON and Markdown reports only.',
      'does not run commands, spawn shells, connect to DB, import seeds, publish runtime, run smoke, perform rollback, or close production readiness gates.',
    ],
  }
}

export async function checkDefaultMasterPlanBlockedGateActionChecklistFreshness({
  argv = process.argv.slice(2),
  now = new Date(),
} = {}) {
  const args = parseArgs(argv)
  if (args.help) {
    return {
      status: 'help',
      productionReady: false,
      help: renderHelp(),
    }
  }

  const gapSummaryText = await readFile(args.gapSummary, 'utf8')
  const checklistText = await readFile(args.checklist, 'utf8')
  const checklist = JSON.parse(checklistText)
  const report = {
    ...buildBlockedGateActionChecklistFreshnessReport({
      gapSummaryText,
      checklist,
      gapSummaryPath: args.gapSummary,
      checklistPath: args.checklist,
      now,
    }),
    jsonOutput: args.output,
    markdownOutput: args.markdown,
  }

  await mkdir(path.dirname(args.output), { recursive: true })
  await mkdir(path.dirname(args.markdown), { recursive: true })
  await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(args.markdown, renderMarkdown(report), 'utf8')

  return report
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Blocked Gate Action Checklist Freshness',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- Checklist freshness: ${report.status}`,
    `- productionReady: ${report.productionReady ? 'yes' : 'no'}`,
    `- gapSummary: ${report.gapSummary}`,
    `- checklist: ${report.checklist}`,
    `- checklistStatus: ${report.checklistStatus}`,
    `- currentGapSha256: ${report.currentGapSummaryDigest.sha256 || 'not available'}`,
    `- currentGapSizeBytes: ${report.currentGapSummaryDigest.sizeBytes}`,
    `- checklistInputSha256: ${report.checklistInputDigest.sha256 || 'not available'}`,
    `- checklistInputSizeBytes: ${report.checklistInputDigest.sizeBytes}`,
    `- jsonOutput: ${report.jsonOutput || 'not-written'}`,
    `- markdownOutput: ${report.markdownOutput || 'not-written'}`,
    '',
    '## Summary',
    '',
    `- fresh: ${report.summary.fresh ? 'yes' : 'no'}`,
    `- digest_available: ${report.summary.digestAvailable ? 'yes' : 'no'}`,
    `- algorithm_match: ${report.summary.algorithmMatches ? 'yes' : 'no'}`,
    `- sha256_match: ${report.summary.sha256Matches ? 'yes' : 'no'}`,
    `- size_match: ${report.summary.sizeBytesMatches ? 'yes' : 'no'}`,
    `- blockers: ${report.blockers.length ? report.blockers.join(', ') : 'none'}`,
    '',
    '## Evidence Boundary',
    '',
    `- evidenceTier: ${report.evidenceBoundary.evidenceTier}`,
    `- can_close_production_gates: ${report.evidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`,
  ]

  for (const boundary of report.evidenceBoundary.nonClosingEvidenceBoundary) {
    lines.push(`- nonClosingEvidenceBoundary: ${boundary}`)
  }

  lines.push('')
  lines.push('## Mutation Boundary')
  lines.push('')
  for (const boundary of report.mutationBoundary) {
    lines.push(`- ${boundary}`)
  }
  lines.push('')

  return `${lines.join('\n')}\n`
}

function renderHelp() {
  return [
    'Usage: node project-testing/tools/check-default-master-plan-blocked-gate-action-checklist-freshness.mjs [options]',
    '',
    'Options:',
    '  --gap-summary <json>  real-evidence-gap-summary.json',
    '  --checklist <json>    blocked-gate-action-checklist.json',
    '  --output <json>       output JSON path',
    '  --markdown <md>       output Markdown path',
    '  --json                print JSON summary',
    '  --help                show help',
  ].join('\n')
}

function normalizeDigest(value) {
  const digest = readObject(value)
  return {
    algorithm: String(digest.algorithm ?? '').trim() || 'sha256',
    sha256: String(digest.sha256 ?? '').trim(),
    sizeBytes: readNumber(digest.sizeBytes ?? digest.size_bytes),
  }
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function digestText(text) {
  return {
    algorithm: 'sha256',
    sha256: createHash('sha256').update(text).digest('hex'),
    sizeBytes: Buffer.byteLength(text),
  }
}

async function main() {
  const args = parseArgs()
  const result = await checkDefaultMasterPlanBlockedGateActionChecklistFreshness()
  if (result.help) {
    console.log(result.help)
    return
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Default master-plan blocked gate action checklist freshness: ${result.status}`)
    console.log(`JSON: ${result.jsonOutput}`)
    console.log(`Markdown: ${result.markdownOutput}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
