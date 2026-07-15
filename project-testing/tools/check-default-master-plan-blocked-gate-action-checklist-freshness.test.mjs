import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  checkDefaultMasterPlanBlockedGateActionChecklistFreshness,
  parseArgs,
} from './check-default-master-plan-blocked-gate-action-checklist-freshness.mjs'

test('parseArgs accepts explicit freshness inputs and outputs', () => {
  const args = parseArgs([
    '--gap-summary',
    'tmp/real-evidence-gap-summary.json',
    '--checklist',
    'tmp/blocked-gate-action-checklist.json',
    '--output',
    'tmp/blocked-gate-action-checklist-freshness.json',
    '--markdown',
    'tmp/blocked-gate-action-checklist-freshness.md',
    '--json',
  ])

  assert.equal(args.gapSummary.endsWith(path.join('tmp', 'real-evidence-gap-summary.json')), true)
  assert.equal(args.checklist.endsWith(path.join('tmp', 'blocked-gate-action-checklist.json')), true)
  assert.equal(args.output.endsWith(path.join('tmp', 'blocked-gate-action-checklist-freshness.json')), true)
  assert.equal(args.markdown.endsWith(path.join('tmp', 'blocked-gate-action-checklist-freshness.md')), true)
  assert.equal(args.json, true)
})

test('reports fresh when checklist input digest matches the current gap summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-checklist-freshness-fresh-'))
  const gapSummaryPath = path.join(root, 'real-evidence-gap-summary.json')
  const checklistPath = path.join(root, 'blocked-gate-action-checklist.json')
  const outputPath = path.join(root, 'blocked-gate-action-checklist-freshness.json')
  const markdownPath = path.join(root, 'blocked-gate-action-checklist-freshness.md')

  try {
    const gapSummaryText = `${JSON.stringify({
      status: 'blocked',
      productionReady: false,
      gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    }, null, 2)}\n`
    const digest = digestText(gapSummaryText)
    await writeFile(gapSummaryPath, gapSummaryText, 'utf8')
    await writeFile(checklistPath, `${JSON.stringify({
      status: 'blocked',
      productionReady: false,
      inputDigest: digest,
      summary: { blockedGateCount: 5 },
    }, null, 2)}\n`, 'utf8')

    const report = await checkDefaultMasterPlanBlockedGateActionChecklistFreshness({
      argv: [
        '--gap-summary',
        gapSummaryPath,
        '--checklist',
        checklistPath,
        '--output',
        outputPath,
        '--markdown',
        markdownPath,
        '--json',
      ],
      now: new Date('2026-07-08T13:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-blocked-gate-action-checklist-freshness/v1')
    assert.equal(report.status, 'fresh')
    assert.equal(report.productionReady, false)
    assert.deepEqual(report.currentGapSummaryDigest, digest)
    assert.deepEqual(report.checklistInputDigest, digest)
    assert.deepEqual(report.summary, {
      fresh: true,
      digestAvailable: true,
      algorithmMatches: true,
      sha256Matches: true,
      sizeBytesMatches: true,
    })
    assert.deepEqual(report.blockers, [])
    assert.equal(report.evidenceBoundary.evidenceTier, 'checklist_freshness_only')
    assert.equal(report.evidenceBoundary.canCloseProductionReadinessGates, false)

    const persisted = JSON.parse(await readFile(outputPath, 'utf8'))
    assert.equal(persisted.status, 'fresh')
    assert.deepEqual(persisted.summary, report.summary)

    const markdown = await readFile(markdownPath, 'utf8')
    assert.match(markdown, /Checklist freshness: fresh/)
    assert.match(markdown, /can_close_production_gates: no/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports stale when checklist digest differs from the current gap summary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-checklist-freshness-stale-'))
  const gapSummaryPath = path.join(root, 'real-evidence-gap-summary.json')
  const checklistPath = path.join(root, 'blocked-gate-action-checklist.json')
  const outputPath = path.join(root, 'blocked-gate-action-checklist-freshness.json')
  const markdownPath = path.join(root, 'blocked-gate-action-checklist-freshness.md')

  try {
    const gapSummaryText = '{"status":"blocked","version":2}\n'
    await writeFile(gapSummaryPath, gapSummaryText, 'utf8')
    await writeFile(checklistPath, `${JSON.stringify({
      status: 'blocked',
      productionReady: false,
      inputDigest: digestText('{"status":"blocked","version":1}\n'),
    }, null, 2)}\n`, 'utf8')

    const report = await checkDefaultMasterPlanBlockedGateActionChecklistFreshness({
      argv: [
        '--gap-summary',
        gapSummaryPath,
        '--checklist',
        checklistPath,
        '--output',
        outputPath,
        '--markdown',
        markdownPath,
      ],
      now: new Date('2026-07-08T13:01:00.000Z'),
    })

    assert.equal(report.status, 'stale')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.fresh, false)
    assert.equal(report.summary.digestAvailable, true)
    assert.equal(report.summary.sha256Matches, false)
    assert.equal(report.blockers.includes('blocked_gate_action_checklist_digest_mismatch'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports missing_digest when checklist has no recorded input digest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-checklist-freshness-missing-'))
  const gapSummaryPath = path.join(root, 'real-evidence-gap-summary.json')
  const checklistPath = path.join(root, 'blocked-gate-action-checklist.json')
  const outputPath = path.join(root, 'blocked-gate-action-checklist-freshness.json')
  const markdownPath = path.join(root, 'blocked-gate-action-checklist-freshness.md')

  try {
    await writeFile(gapSummaryPath, '{"status":"blocked"}\n', 'utf8')
    await writeFile(checklistPath, '{"status":"blocked","productionReady":false}\n', 'utf8')

    const report = await checkDefaultMasterPlanBlockedGateActionChecklistFreshness({
      argv: [
        '--gap-summary',
        gapSummaryPath,
        '--checklist',
        checklistPath,
        '--output',
        outputPath,
        '--markdown',
        markdownPath,
      ],
      now: new Date('2026-07-08T13:02:00.000Z'),
    })

    assert.equal(report.status, 'missing_digest')
    assert.equal(report.productionReady, false)
    assert.equal(report.summary.fresh, false)
    assert.equal(report.summary.digestAvailable, false)
    assert.equal(report.blockers.includes('blocked_gate_action_checklist_input_digest_missing'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function digestText(text) {
  return {
    algorithm: 'sha256',
    sha256: createHash('sha256').update(text).digest('hex'),
    sizeBytes: Buffer.byteLength(text),
  }
}
