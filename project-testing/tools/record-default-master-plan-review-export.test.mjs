import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { recordDefaultMasterPlanReviewExport } from './record-default-master-plan-review-export.mjs'

const REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]

test('dry-run builds an auditable PM review source export without writing change_logs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baseline_items')) return [
      { id: 'item-1' },
      { id: 'item-2' },
    ]
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: '11111111-1111-4111-8111-111111111111',
      reviewNotes: '项目经理已复核 16 行候选主计划，可作为当前基线发布。',
      environment: 'staging',
      exportedBy: 'pm-user-1',
      output,
      mode: 'dry_run',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'dry_run_ready')
    assert.equal(report.writesChangeLogs, false)
    assert.equal(report.reviewedItemCount, 2)
    assert.equal(queries.some((query) => /\binsert\s+into\s+public\.change_logs\b/i.test(query.sql)), false)

    const exportPayload = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(exportPayload.export_metadata.source, 'candidate_default_master_plan_review')
    assert.equal(exportPayload.export_metadata.environment, 'staging')
    assert.equal(exportPayload.change_logs.length, 1)
    assert.equal(exportPayload.change_logs[0].field_name, 'candidate_default_master_plan_review')
    assert.deepEqual(
      exportPayload.change_logs[0].after_snapshot.candidate_governance_review.acknowledged_blockers,
      REVIEW_BLOCKERS,
    )
    assert.equal(exportPayload.change_logs[0].metadata.mutationBoundary.writesTasks, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('execute inserts the PM review change_log and writes the same source export', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const reviewPackage = path.join(root, 'pm-review-package.json')
  await writeJson(reviewPackage, readyReviewPackage())
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baseline_items')) return [{ id: 'item-1' }]
    if (/\binsert\s+into\s+public\.change_logs\b/i.test(sql)) {
      assert.equal(params[0], 'project-1')
      assert.equal(params[2], 'baseline-1')
      assert.equal(params[3], 'candidate_default_master_plan_review')
      assert.equal(params[6], '11111111-1111-4111-8111-111111111111')
      return [{ id: 'change-log-1', changed_at: '2026-07-02T02:00:00.000Z' }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: '11111111-1111-4111-8111-111111111111',
      reviewNotes: '项目经理已复核候选默认主计划。',
      environment: 'staging',
      exportedBy: 'pm-user-1',
      reviewPackage,
      output,
      mode: 'execute',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'review_recorded')
    assert.equal(report.writesChangeLogs, true)
    assert.equal(report.changeLogId, 'change-log-1')
    assert.equal(queries.filter((query) => /\binsert\s+into\s+public\.change_logs\b/i.test(query.sql)).length, 1)

    const exportPayload = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(exportPayload.change_logs[0].id, 'change-log-1')
    assert.equal(exportPayload.change_logs[0].changed_at, '2026-07-02T02:00:00.000Z')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('execute accepts a dependency-anchor profile lineage when the root source is supported', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const reviewPackage = path.join(root, 'pm-review-package.json')
  await writeJson(reviewPackage, readyReviewPackage({
    rows: [{
      ...readyReviewPackage().rows[0],
      profileSourceType: 'dependency_anchor_master_plan_profile_v1',
    }],
  }))
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baseline_items')) return [{ id: 'item-1' }]
    if (/\binsert\s+into\s+public\.change_logs\b/i.test(sql)) {
      return [{ id: 'change-log-anchor-profile', changed_at: '2026-07-02T02:00:00.000Z' }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: '11111111-1111-4111-8111-111111111111',
      reviewNotes: 'Staging reviewer checked the supported candidate plan and its dependency-anchor profile lineage.',
      environment: 'staging',
      exportedBy: 'pm-user-1',
      reviewPackage,
      output,
      mode: 'execute',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'review_recorded')
    assert.equal(report.writesChangeLogs, true)
    assert.equal(report.changeLogId, 'change-log-anchor-profile')
    assert.equal(queries.filter((query) => /\binsert\s+into\s+public\.change_logs\b/i.test(query.sql)).length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review record execution when package root hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const reviewPackage = path.join(root, 'pm-review-package.json')
  await writeJson(reviewPackage, readyReviewPackage({
    comparisonBasis: {
      selectedSource: 'manual_comparison_scenario',
    },
  }))
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baseline_items')) return [{ id: 'item-1' }]
    if (/\binsert\s+into\s+public\.change_logs\b/i.test(sql)) {
      return [{ id: 'change-log-1', changed_at: '2026-07-02T02:00:00.000Z' }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: '11111111-1111-4111-8111-111111111111',
      reviewNotes: '项目经理已复核候选默认主计划。',
      environment: 'staging',
      exportedBy: 'pm-user-1',
      reviewPackage,
      output,
      mode: 'execute',
      queryExec,
      now: new Date('2026-07-02T02:01:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.writesChangeLogs, false)
    assert.equal(report.blockers.includes('pm_review_package_retired_or_low_information_default_master_plan_source'), true)
    assert.equal(queries.some((query) => /\binsert\s+into\s+public\.change_logs\b/i.test(query.sql)), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review record execution when package rows hide retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const reviewPackage = path.join(root, 'pm-review-package.json')
  await writeJson(reviewPackage, readyReviewPackage({
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        referenceDays: 30,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
        sourceLineage: {
          originalSource: 'legacy_template_reverse_inference',
        },
      },
    ],
  }))
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baseline_items')) return [{ id: 'item-1' }]
    if (/\binsert\s+into\s+public\.change_logs\b/i.test(sql)) {
      return [{ id: 'change-log-1', changed_at: '2026-07-02T02:00:00.000Z' }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: '11111111-1111-4111-8111-111111111111',
      reviewNotes: '项目经理已复核候选默认主计划。',
      environment: 'staging',
      exportedBy: 'pm-user-1',
      reviewPackage,
      output,
      mode: 'execute',
      queryExec,
      now: new Date('2026-07-02T02:01:30.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.writesChangeLogs, false)
    assert.equal(report.blockers.includes('pm_review_package_retired_or_low_information_default_master_plan_source'), true)
    assert.equal(queries.some((query) => /\binsert\s+into\s+public\.change_logs\b/i.test(query.sql)), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review record execution without a ready PM review package', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: '11111111-1111-4111-8111-111111111111',
      reviewNotes: '项目经理已复核候选默认主计划。',
      environment: 'staging',
      exportedBy: 'pm-user-1',
      output,
      mode: 'execute',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.writesChangeLogs, false)
    assert.match(report.blockers.join('\n'), /pm_review_package_required/)
    assert.equal(queries.some((query) => /\binsert\s+into\s+public\.change_logs\b/i.test(query.sql)), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks automation identities from being used as the PM reviewer', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-record-pm-review-'))
  const output = path.join(root, 'candidate-default-master-plan-review-export.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await recordDefaultMasterPlanReviewExport({
      baselineId: 'baseline-1',
      projectId: 'project-1',
      reviewedBy: 'codex-after-discovery-query-serialization',
      reviewNotes: '自动复核。',
      environment: 'staging',
      exportedBy: 'codex-after-discovery-query-serialization',
      output,
      mode: 'execute',
      queryExec,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.match(report.blockers.join('\n'), /human_project_manager_reviewer_required/)
    assert.equal(report.writesChangeLogs, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readyReviewPackage(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-review-package/v1',
    status: 'ready_for_human_pm_review',
    productionReady: false,
    baselineId: 'baseline-1',
    projectId: 'project-1',
    reviewedItemCount: 1,
    reviewedItemIds: ['item-1'],
    blockers: [],
    rows: [
      {
        index: 1,
        id: 'item-1',
        title: '施工准备与现场临设完成',
        standardWorkCode: 'BTMP-BASE-01',
        referenceDays: 30,
        candidateOnly: true,
        source: 'managed_frontier_default_master_plan',
      },
    ],
    mutationBoundary: {
      writesChangeLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
    ...overrides,
  }
}

function columnsFor(tableName) {
  const columns = {
    task_baseline_items: ['id', 'baseline_version_id', 'generation_metadata'],
    change_logs: [
      'id',
      'project_id',
      'entity_type',
      'entity_id',
      'field_name',
      'old_value',
      'new_value',
      'changed_by',
      'changed_at',
      'change_source',
      'action_type',
      'action_group',
      'after_snapshot',
      'metadata',
      'visibility',
      'retention_policy',
    ],
  }[tableName] ?? []
  return columns.map((column_name) => ({ column_name }))
}
