import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const BUILDER_PATH = path.resolve('project-testing/tools/build-default-master-plan-review-evidence.mjs')
const CHECKER_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')
const REVIEW_BLOCKERS = [
  'PROJECT_MANAGER_REVIEW_REQUIRED',
  'DURATION_EVIDENCE_NOT_RUNTIME_CALIBRATED',
  'PRODUCTION_DEPENDENCY_WRITER_NOT_APPLIED',
  'RUNTIME_PUBLICATION_EVIDENCE_MISSING',
  'POST_PUBLISH_SMOKE_ROLLBACK_EVIDENCE_MISSING',
]

test('blocks PM review evidence when the export does not contain an accepted candidate review change log', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-pm-review-'))
  const exportPath = path.join(root, 'pm-review-export.json')
  const outputPath = path.join(root, 'pm-review-evidence.json')

  await writeJson(exportPath, {
    rows: [{
      project_id: 'project-1',
      entity_type: 'baseline',
      entity_id: 'baseline-1',
      field_name: 'candidate_default_master_plan_review',
      after_snapshot: {
        candidate_governance_review: {
          decision: 'needs_rework',
          reviewed_by: 'owner-1',
          reviewed_at: '2026-07-01T06:30:00.000Z',
          reviewed_item_ids: ['candidate-item-1'],
          acknowledged_blockers: REVIEW_BLOCKERS,
          review_notes: '需要返工。',
        },
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--review-export',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.sourceEvidenceRef, /^candidate_default_master_plan_review_export:/)
    assert.match(evidence.blockers.join('\n'), /decision_must_be_accepted_for_baseline/)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds PM review evidence from an exported candidate review change log', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-pm-review-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const exportPath = path.join(root, 'pm-review-export.json')
  const outputPath = path.join(root, 'pm-review-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(exportPath, withExportMetadata({
    change_logs: [{
      project_id: 'project-1',
      entity_type: 'baseline',
      entity_id: 'baseline-1',
      field_name: 'candidate_default_master_plan_review',
      changed_by: 'owner-1',
      changed_at: '2026-07-01T06:30:00.000Z',
      action_type: 'candidate_default_master_plan_review',
      after_snapshot: {
        candidate_governance_review: {
          decision: 'accepted_for_baseline',
          reviewed_by: 'owner-1',
          reviewed_at: '2026-07-01T06:30:00.000Z',
          reviewed_item_ids: ['candidate-item-1', 'candidate-item-2'],
          reviewed_item_count: 2,
          acknowledged_blockers: REVIEW_BLOCKERS,
          review_notes: '项目经理已逐项复核候选默认主计划，可作为当前基线发布。',
          production_ready: false,
        },
      },
      metadata: {
        candidateItemCount: 2,
        acknowledgedBlockers: REVIEW_BLOCKERS,
      },
    }],
  }, 'candidate_default_master_plan_review'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--review-export',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.schemaVersion, 'workbuddy-candidate-default-master-plan-review-evidence/v1')
    assert.equal(evidence.status, 'accepted_for_baseline')
    assert.equal(evidence.baselineId, 'baseline-1')
    assert.equal(evidence.projectId, 'project-1')
    assert.equal(evidence.candidate_governance_review.reviewed_item_count, 2)
    assert.equal(evidence.change_log.entity_id, 'baseline-1')
    assert.match(evidence.sourceEvidenceRef, /^candidate_default_master_plan_review_export:/)
    assert.match(evidence.sourceEvidenceRef, /#sha256=[a-f0-9]{64}$/)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--review-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const pmGate = report.gates.find((gate) => gate.id === 'project_manager_review_evidence')
    const durationGate = report.gates.find((gate) => gate.id === 'runtime_duration_calibration_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(pmGate.status, 'pass')
    assert.equal(durationGate.status, 'blocked')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review evidence when the source export lacks auditable export metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-evidence-'))
  const exportPath = path.join(root, 'candidate-review-export.json')
  const outputPath = path.join(root, 'pm-review-evidence.json')

  await writeJson(exportPath, {
    change_logs: [{
      entity_type: 'baseline',
      entity_id: 'baseline-1',
      project_id: 'project-1',
      field_name: 'candidate_default_master_plan_review',
      changed_by: 'pm-1',
      changed_at: '2026-07-01T06:00:00.000Z',
      after_snapshot: {
        candidate_governance_review: {
          decision: 'accepted_for_baseline',
          reviewed_by: 'pm-1',
          reviewed_at: '2026-07-01T06:00:00.000Z',
          reviewed_item_ids: ['item-1', 'item-2'],
          reviewed_item_count: 2,
          acknowledged_blockers: REVIEW_BLOCKERS,
          review_notes: '项目经理已复核候选默认主计划，可作为当前项目基线发布。',
        },
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--review-export',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /review_export_metadata_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review evidence when the source export is only a dry-run preview', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-evidence-'))
  const exportPath = path.join(root, 'candidate-review-export.json')
  const outputPath = path.join(root, 'pm-review-evidence.json')

  await writeJson(exportPath, {
    export_metadata: {
      source: 'candidate_default_master_plan_review',
      source_kind: 'dry_run_candidate_review',
      exported_at: '2026-07-01T08:00:00.000Z',
      exported_by: 'pm-preview-operator',
      environment: 'staging',
    },
    change_logs: [{
      entity_type: 'baseline',
      entity_id: 'baseline-1',
      project_id: 'project-1',
      field_name: 'candidate_default_master_plan_review',
      changed_by: 'pm-1',
      changed_at: '2026-07-01T06:00:00.000Z',
      after_snapshot: {
        candidate_governance_review: {
          decision: 'accepted_for_baseline',
          reviewed_by: 'pm-1',
          reviewed_at: '2026-07-01T06:00:00.000Z',
          reviewed_item_ids: ['item-1', 'item-2'],
          reviewed_item_count: 2,
          acknowledged_blockers: REVIEW_BLOCKERS,
          review_notes: 'Dry-run preview must not close the PM gate.',
        },
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--review-export',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /review_export_database_change_log_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review evidence when review export hides retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-review-evidence-'))
  const exportPath = path.join(root, 'candidate-review-export.json')
  const outputPath = path.join(root, 'pm-review-evidence.json')

  await writeJson(exportPath, withExportMetadata({
    change_logs: [{
      entity_type: 'baseline',
      entity_id: 'baseline-1',
      project_id: 'project-1',
      field_name: 'candidate_default_master_plan_review',
      changed_by: 'pm-1',
      changed_at: '2026-07-01T06:00:00.000Z',
      sourceMetadata: {
        sourceLineage: [
          { scenarioSource: 'manual_comparison_scenario' },
        ],
      },
      after_snapshot: {
        candidate_governance_review: {
          decision: 'accepted_for_baseline',
          reviewed_by: 'pm-1',
          reviewed_at: '2026-07-01T06:00:00.000Z',
          reviewed_item_ids: ['item-1', 'item-2'],
          reviewed_item_count: 2,
          acknowledged_blockers: REVIEW_BLOCKERS,
          review_notes: 'PM review export must fail closed if retired source lineage is hidden in the row.',
        },
      },
    }],
  }, 'candidate_default_master_plan_review'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--review-export',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /retired_or_low_information_default_master_plan_source/)
    assert.equal(evidence.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks PM review evidence when the exported change log belongs to another baseline or project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-pm-review-'))
  const exportPath = path.join(root, 'pm-review-export.json')
  const outputPath = path.join(root, 'pm-review-evidence.json')

  await writeJson(exportPath, {
    change_logs: [{
      project_id: 'project-from-other-chain',
      entity_type: 'baseline',
      entity_id: 'baseline-from-other-chain',
      field_name: 'candidate_default_master_plan_review',
      after_snapshot: {
        candidate_governance_review: {
          decision: 'accepted_for_baseline',
          reviewed_by: 'owner-1',
          reviewed_at: '2026-07-01T06:30:00.000Z',
          reviewed_item_ids: ['candidate-item-1'],
          reviewed_item_count: 1,
          acknowledged_blockers: REVIEW_BLOCKERS,
          review_notes: '其他链路复核。',
        },
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--review-export',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /review_project_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /review_baseline_id_mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function withExportMetadata(payload, source) {
  return {
    export_metadata: {
      source,
      source_kind: source === 'candidate_default_master_plan_review' ? 'database_table' : 'source_file',
      table: source === 'candidate_default_master_plan_review' ? 'public.change_logs' : null,
      exported_at: '2026-07-01T08:00:00.000Z',
      exported_by: 'evidence-exporter-1',
      environment: 'staging',
    },
    ...payload,
  }
}

async function writeProfileReport(filePath) {
  await writeJson(filePath, {
    businessTypes: [
      'hotel',
      'hospital',
      'school',
      'industrial',
      'data_center',
      'transportation_hub',
      'sports_culture',
      'tod_upper_cover',
      'renovation',
      'modular_building',
    ].map((businessType, index) => ({
      businessType,
      scheduleRowCount: 32 + index,
      profileRowCount: 4,
      profilePhaseAnchorRowCount: 1,
      reviewStatus: 'candidate_master_plan_reviewable',
      profileDurationEvidenceReady: true,
      gaps: [],
    })),
  })
}

async function writeResidentialReport(filePath) {
  await writeFile(filePath, [
    '# Residential default master plan',
    '- schedule_row: 60 条',
    '- mode: residential_master_plan_v2',
    '- boundary: candidate only, no writes to tasks, task_dependencies, or runtime publication',
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
}
