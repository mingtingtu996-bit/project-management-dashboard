import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const BUILDER_PATH = path.resolve('project-testing/tools/build-default-master-plan-dependency-writer-evidence.mjs')
const CHECKER_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')

test('builds dependency writer evidence from executed writer result, task dependency export, and critical-path readback', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')
  const outputRoot = path.join(root, 'out')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(writerResult, withExportMetadata(executedWriterResultFixture(), 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.schemaVersion, 'workbuddy-default-master-plan-dependency-writer-evidence/v1')
    assert.equal(evidence.baselineId, 'baseline-reviewed')
    assert.equal(evidence.projectId, 'project-1')
    assert.equal(evidence.execution_mode, 'execute')
    assert.match(evidence.sourceEvidenceRef, /^task_dependencies_export:/)
    assert.match(evidence.sourceEvidenceRef, /#sha256=[a-f0-9]{64}$/)
    assert.equal(evidence.task_mapping.status, 'runtime_task_mapping_verified')
    assert.equal(evidence.domain_writer_result.insertedDependencyCount, 1)
    assert.equal(evidence.domain_writer_result.appliedDependencies[0].taskId, 'task-foundation')
    assert.equal(evidence.critical_path_recalculation.status, 'readback_passed')
    assert.equal(evidence.mutationBoundary.writesTaskDependencies, false)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--dependency-writer-evidence',
      evidencePath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const writerGate = report.gates.find((gate) => gate.id === 'production_dependency_writer_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(writerGate.status, 'pass')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when exported task dependencies do not match writer applied edges', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  await writeJson(writerResult, executedWriterResultFixture())
  await writeJson(taskDependencies, {
    rows: [{
      id: 'dependency-foreign',
      project_id: 'project-1',
      task_id: 'task-other',
      dependency_task_id: 'task-site',
      source_type: 'construction_organization_plan_network',
    }],
  })
  await writeJson(criticalPathReadback, {
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    evidenceRef: 'critical-path-readback',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /task_dependencies_export_missing_writer_edges/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ignores unrelated project dependency sources while verifying the default master-plan network edges', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const dependencies = taskDependenciesExportFixture()
  dependencies.rows.push({
    id: 'dependency-unrelated',
    project_id: 'project-1',
    task_id: 'task-unrelated-2',
    dependency_task_id: 'task-unrelated-1',
    dependency_type: 'FS',
    lag_days: 0,
    source_type: 't2_rhythm_schedule_runtime',
  })

  await writeJson(writerResult, withExportMetadata(executedWriterResultFixture(), 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(dependencies, 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
    assert.equal(evidence.status, 'writer_execute_readback_verified')
    assert.equal(evidence.task_dependencies_export.exportedDependencyCount, 1)
    assert.equal(evidence.task_dependencies_export.ignoredUnrelatedDependencyCount, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when selected candidate scope leaves external dependency anchors unresolved', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const partialWriterResult = executedWriterResultFixture()
  partialWriterResult.domain_writer_result.unresolvedExternalDependencies = [{
    fromGeneratedRowId: 'generated:school:template:foundation-anchor',
    toGeneratedRowId: 'generated:school:BTMP-SCH-01',
    dependencyType: 'FS',
    lagDays: 0,
    reason: 'predecessor_task_outside_selected_candidate_scope',
  }]
  partialWriterResult.domain_writer_result.unresolvedExternalDependencyCount = 1

  await writeJson(writerResult, withExportMetadata(partialWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    evidenceRef: 'critical_path_readback',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))
    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.domain_writer_result.unresolvedExternalDependencyCount, 1)
    assert.match(evidence.blockers.join('\n'), /unresolved_external_dependency_anchors_present/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when a legacy source label only carries a candidate boolean marker', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const legacyWriterResult = executedWriterResultFixture()
  legacyWriterResult.candidate_default_master_plan = {
    generation_mode: '',
    source_version_label: 'legacy_template_serial_fallback',
    candidate_default_master_plan_baseline: true,
  }

  await writeJson(writerResult, withExportMetadata(legacyWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.candidate_default_master_plan.candidate_default_master_plan_baseline, false)
    assert.match(evidence.blockers.join('\n'), /candidate_default_master_plan_source_version_label_unsupported/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when writer result rows hide manual-comparison in fallbackApplied', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const manualComparisonWriterResult = executedWriterResultFixture()
  manualComparisonWriterResult.rows = [
    {
      fallbackApplied: 'manual_comparison_scenario',
    },
  ]

  await writeJson(writerResult, withExportMetadata(manualComparisonWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.candidate_default_master_plan.candidate_default_master_plan_baseline, false)
    assert.match(evidence.blockers.join('\n'), /candidate_default_master_plan_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when writer result hides retired aliases in nested source metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const hiddenSourceWriterResult = executedWriterResultFixture()
  hiddenSourceWriterResult.rows = [
    {
      source: 'managed_frontier_default_master_plan',
      sourceMetadata: {
        templateSource: 'legacy_template_reverse_inference',
        sourceLineage: [
          { originSource: 'low_information_template_draft' },
          { scenarioSource: 'manual_comparison_scenario' },
        ],
      },
    },
  ]

  await writeJson(writerResult, withExportMetadata(hiddenSourceWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.candidate_default_master_plan.candidate_default_master_plan_baseline, false)
    assert.match(evidence.blockers.join('\n'), /candidate_default_master_plan_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when writer result hides retired sources in governance fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const hiddenSourceWriterResult = executedWriterResultFixture()
  hiddenSourceWriterResult.rows = [
    {
      source: 'managed_frontier_default_master_plan',
      comparisonBasis: ['manual_comparison_scenario'],
      boundaryPolicy: ['low_information_template_draft'],
      decisionReasons: JSON.stringify([
        { sourceKind: 'legacy_template_reverse_inference' },
      ]),
      reviewProof: {
        sourceStatus: 'controlled_degradation',
      },
      handoffEvidence: [
        { sourceType: 'legacy_template_serial_fallback' },
      ],
    },
  ]

  await writeJson(writerResult, withExportMetadata(hiddenSourceWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.candidate_default_master_plan.candidate_default_master_plan_baseline, false)
    assert.match(evidence.blockers.join('\n'), /candidate_default_master_plan_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when writer result root hides retired sources in governance fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  const hiddenSourceWriterResult = executedWriterResultFixture()
  hiddenSourceWriterResult.comparisonBasis = ['manual_comparison_scenario']
  hiddenSourceWriterResult.boundaryPolicy = ['low_information_template_draft']
  hiddenSourceWriterResult.reviewProof = [
    { sourceKind: 'legacy_template_reverse_inference' },
  ]

  await writeJson(writerResult, withExportMetadata(hiddenSourceWriterResult, 'construction_organization_plan_network_domain_writer'))
  await writeJson(taskDependencies, withExportMetadata(taskDependenciesExportFixture(), 'task_dependencies'))
  await writeJson(criticalPathReadback, withExportMetadata({
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  }, 'critical_path_readback'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.candidate_default_master_plan.candidate_default_master_plan_baseline, false)
    assert.match(evidence.blockers.join('\n'), /candidate_default_master_plan_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when source exports lack auditable export metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  await writeJson(writerResult, executedWriterResultFixture())
  await writeJson(taskDependencies, taskDependenciesExportFixture())
  await writeJson(criticalPathReadback, {
    status: 'readback_passed',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    publicationKey: 'default-master-plan-runtime-publication-1',
    evidenceRef: 'critical_path_readback_export:project-testing/reports/default-master-plan-production-readiness/critical-path-readback.json#sha256=eeee',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /writer_result_metadata_required/)
    assert.match(evidence.blockers.join('\n'), /task_dependencies_export_metadata_required/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_metadata_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks dependency writer evidence when critical-path readback belongs to another baseline or project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-dependency-writer-'))
  const writerResult = path.join(root, 'writer-result.json')
  const taskDependencies = path.join(root, 'task-dependencies-export.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const evidencePath = path.join(root, 'dependency-writer-evidence.json')

  await writeJson(writerResult, executedWriterResultFixture())
  await writeJson(taskDependencies, taskDependenciesExportFixture())
  await writeJson(criticalPathReadback, {
    status: 'readback_passed',
    baselineId: 'other-baseline',
    projectId: 'other-project',
    evidenceRef: 'critical-path-readback',
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--writer-result',
      writerResult,
      '--task-dependencies',
      taskDependencies,
      '--critical-path-readback',
      criticalPathReadback,
      '--baseline-id',
      'baseline-reviewed',
      '--project-id',
      'project-1',
      '--output',
      evidencePath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_baseline_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /critical_path_readback_project_id_mismatch/)
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
  ].join('\n'), 'utf8')
}

function executedWriterResultFixture() {
  return {
    schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
    baselineId: 'baseline-reviewed',
    projectId: 'project-1',
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'residential_master_plan_v2',
      source_version_label: 'residential_master_plan_v2',
      candidate_default_master_plan_baseline: true,
    },
    task_mapping: {
      status: 'runtime_task_mapping_verified',
      mapped_generated_row_count: 2,
      mapped_task_count: 2,
      unresolved_generated_row_ids: [],
    },
    domain_writer_result: {
      source: 'construction_organization_plan_network_domain_writer',
      status: 'runtime_apply_ready',
      writesTaskDependencies: true,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      insertedDependencyCount: 1,
      skippedDependencyCount: 0,
      releaseRecordPersisted: true,
      draftNetworkKey: 'default-master-plan-network-1',
      releaseHandoffCandidateEventId: 'event-release-1',
      releaseRecordTarget: 'default-master-plan-runtime-publication-1',
      rollbackTarget: 'rollback:default-master-plan-runtime-publication-1',
      appliedDependencies: [{
        edgeId: 'edge-1',
        taskId: 'task-foundation',
        dependencyTaskId: 'task-site',
        dependencyType: 'FS',
        lagDays: 0,
        sourceType: 'construction_organization_plan_network',
        sourceEventId: 'event-release-1',
      }],
      reasons: [],
    },
  }
}

function taskDependenciesExportFixture() {
  return {
    rows: [{
      id: 'dependency-1',
      project_id: 'project-1',
      task_id: 'task-foundation',
      dependency_task_id: 'task-site',
      dependency_type: 'FS',
      lag_days: 0,
      source_type: 'construction_organization_plan_network',
      source_event_id: 'event-release-1',
    }],
  }
}
