import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  checkDefaultMasterPlanReviewRecordPreflight,
} from './check-default-master-plan-review-record-preflight.mjs'

const execFileAsync = promisify(execFile)

test('blocks PM review record execution when package command still contains placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, reviewPackageFixture())

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      output,
      now: new Date('2026-07-02T05:00:00.000Z'),
    })

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-review-record-preflight/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteReviewRecord, false)
    assert.equal(report.blockers.includes('review_record_command_contains_placeholders'), true)
    assert.equal(report.blockers.includes('reviewed_by_required'), true)
    assert.equal(report.blockers.includes('review_notes_required'), true)
    assert.equal(report.placeholderFindings.length, 3)
    assert.equal(report.mutationBoundary.writesChangeLogs, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'blocked')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /review_record_command_contains_placeholders/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows PM review record execution when real human reviewer, notes, and package identity are resolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, {
    ...reviewPackageFixture(),
    recordReviewCommand: [
      'npm run evidence:default-master-plan:record-review --',
      '--baseline-id baseline-1',
      '--project-id project-1',
      '--reviewed-by 11111111-1111-4111-8111-111111111111',
      '--review-notes "Human PM reviewed 2 candidate rows and accepts them as candidate baseline only."',
      `--review-package ${reviewPackage}`,
      '--environment staging',
      '--exported-by release-operator-1',
      '--mode execute',
    ].join(' '),
  })

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      reviewEvidence: path.join(root, 'missing-review-evidence.json'),
      output,
      now: new Date('2026-07-02T05:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_execute')
    assert.equal(report.mayExecuteReviewRecord, true)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.projectId, 'project-1')
    assert.equal(report.reviewedItemCount, 2)
    assert.equal(report.executionPlan.mode, 'execute')
    assert.equal(report.executionPlan.reviewPackage.endsWith('pm-review-package.json'), true)
    assert.equal(report.executionPlan.reviewedBy, '11111111-1111-4111-8111-111111111111')
    assert.equal(report.executionPlan.environment, 'staging')
    assert.equal(report.executionPlan.exportedBy, 'release-operator-1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('treats accepted PM review evidence as already recorded even when package command template has placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const reviewEvidence = path.join(root, 'pm-review-evidence.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, reviewPackageFixture())
  await writeJson(reviewEvidence, reviewEvidenceFixture())

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      reviewEvidence,
      output,
      now: new Date('2026-07-02T05:08:00.000Z'),
    })

    assert.equal(report.status, 'already_recorded')
    assert.equal(report.mayExecuteReviewRecord, false)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.alreadyRecorded, true)
    assert.equal(report.executionPlan.reviewedBy, '11111111-1111-4111-8111-111111111111')
    assert.match(report.executionPlan.reviewNotes, /accepts them as candidate baseline only/)
    assert.equal(report.mutationBoundary.writesChangeLogs, false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.status, 'already_recorded')
    const markdown = await readFile(output.replace(/\.json$/, '.md'), 'utf8')
    assert.match(markdown, /already_recorded/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('allows a new concrete review record command even when stale review evidence is present', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-stale-ready-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const reviewEvidence = path.join(root, 'pm-review-evidence.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, {
    ...reviewPackageFixture(),
    reviewedItemCount: 3,
    reviewedItemIds: ['row-1', 'row-2', 'row-3'],
    recordReviewCommand: [
      'npm run evidence:default-master-plan:record-review --',
      '--baseline-id baseline-1',
      '--project-id project-1',
      '--reviewed-by 22222222-2222-4222-8222-222222222222',
      '--review-notes "Human PM reviewed the current 3 row package and accepts it as candidate baseline only."',
      `--review-package ${reviewPackage}`,
      '--environment staging',
      '--exported-by release-operator-1',
      '--mode execute',
    ].join(' '),
  })
  await writeJson(reviewEvidence, reviewEvidenceFixture())

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      reviewEvidence,
      output,
      now: new Date('2026-07-05T11:05:00.000Z'),
    })

    assert.equal(report.status, 'ready_for_execute')
    assert.equal(report.mayExecuteReviewRecord, true)
    assert.deepEqual(report.blockers, [])
    assert.equal(report.reviewEvidence.staleForCurrentPackage, true)
    assert.equal(report.alreadyRecorded, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks stale accepted PM review evidence when reviewed rows no longer match the current package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const reviewEvidence = path.join(root, 'pm-review-evidence.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, {
    ...reviewPackageFixture(),
    reviewedItemCount: 3,
    reviewedItemIds: ['row-1', 'row-2', 'row-3'],
  })
  await writeJson(reviewEvidence, reviewEvidenceFixture())

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      reviewEvidence,
      output,
      now: new Date('2026-07-02T05:09:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.alreadyRecorded, false)
    assert.equal(report.mayExecuteReviewRecord, false)
    assert.equal(report.blockers.includes('pm_review_evidence_stale_for_current_review_package'), true)
    assert.equal(report.blockers.includes('review_evidence_reviewed_item_count_mismatch'), true)
    assert.equal(report.blockers.includes('review_evidence_reviewed_item_ids_mismatch'), true)
    assert.equal(report.reviewEvidence.staleForCurrentPackage, true)
    assert.equal(report.reviewEvidence.reviewedItemCount, 2)
    assert.equal(report.reviewEvidence.currentPackageReviewedItemCount, 3)
    assert.deepEqual(report.reviewEvidence.missingCurrentReviewedItemIds, ['row-3'])

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.reviewEvidence.staleForCurrentPackage, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks automation reviewer identities even when command has no angle-bracket placeholders', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, {
    ...reviewPackageFixture(),
    recordReviewCommand: [
      'npm run evidence:default-master-plan:record-review --',
      '--baseline-id baseline-1',
      '--project-id project-1',
      '--reviewed-by codex-release-bot',
      '--review-notes "Automated review"',
      `--review-package ${reviewPackage}`,
      '--environment staging',
      '--exported-by codex-release-bot',
      '--mode execute',
    ].join(' '),
  })

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      output,
      now: new Date('2026-07-02T05:10:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteReviewRecord, false)
    assert.equal(report.blockers.includes('human_project_manager_reviewer_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review record execution when command omits the PM review package binding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, {
    ...reviewPackageFixture(),
    recordReviewCommand: [
      'npm run evidence:default-master-plan:record-review --',
      '--baseline-id baseline-1',
      '--project-id project-1',
      '--reviewed-by 11111111-1111-4111-8111-111111111111',
      '--review-notes "Human PM reviewed 2 candidate rows and accepts them as candidate baseline only."',
      '--environment staging',
      '--exported-by release-operator-1',
      '--mode execute',
    ].join(' '),
  })

  try {
    const report = await checkDefaultMasterPlanReviewRecordPreflight({
      reviewPackage,
      output,
      now: new Date('2026-07-02T05:12:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.mayExecuteReviewRecord, false)
    assert.equal(report.blockers.includes('record_review_package_arg_required'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('prints review record preflight readiness in CLI summary output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-record-preflight-cli-'))
  const reviewPackage = path.join(root, 'pm-review-package.json')
  const output = path.join(root, 'pm-review-record-preflight.json')

  await writeJson(reviewPackage, reviewPackageFixture())

  try {
    const { stdout } = await execFileAsync(process.execPath, [
      'project-testing/tools/check-default-master-plan-review-record-preflight.mjs',
      '--review-package',
      reviewPackage,
      '--output',
      output,
    ], { cwd: process.cwd() })
    const summary = JSON.parse(stdout)

    assert.equal(summary.status, 'blocked')
    assert.equal(summary.mayExecuteReviewRecord, false)
    assert.equal(summary.blockers.includes('review_record_command_contains_placeholders'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function reviewPackageFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'ready_for_human_pm_review',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    reviewedItemCount: 2,
    reviewedItemIds: ['row-1', 'row-2'],
    requiredAcknowledgedBlockers: [
      'PROJECT_MANAGER_REVIEW_REQUIRED',
      'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
      'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
      'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
      'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
    ],
    recordReviewCommand: [
      'npm run evidence:default-master-plan:record-review --',
      '--baseline-id baseline-1',
      '--project-id project-1',
      '--reviewed-by <human-project-manager-user-id>',
      '--review-notes <real-review-notes>',
      '--review-package <pm-review-package.json>',
      '--environment staging',
      '--exported-by release-operator-1',
      '--mode execute',
    ].join(' '),
    blockers: [],
    mutationBoundary: {
      readsCandidateBaselineExport: true,
      writesChangeLogs: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }
}

function reviewEvidenceFixture() {
  return {
    schemaVersion: 'workbuddy-candidate-default-master-plan-review-evidence/v1',
    status: 'accepted_for_baseline',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    candidate_governance_review: {
      decision: 'accepted_for_baseline',
      reviewed_by: '11111111-1111-4111-8111-111111111111',
      reviewed_at: '2026-07-02T05:06:00.000Z',
      reviewed_item_ids: ['row-1', 'row-2'],
      reviewed_item_count: 2,
      review_notes: 'Human PM reviewed 2 candidate rows and accepts them as candidate baseline only.',
      production_ready: false,
    },
    change_log: {
      entity_type: 'baseline',
      entity_id: 'baseline-1',
      field_name: 'candidate_default_master_plan_review',
      changed_by: '11111111-1111-4111-8111-111111111111',
      changed_at: '2026-07-02T05:06:00.000Z',
      action_type: 'candidate_default_master_plan_review',
    },
    mutationBoundary: {
      writesChangeLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
