import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const BUILDER_PATH = path.resolve('project-testing/tools/build-default-master-plan-runtime-publication-evidence.mjs')
const CHECKER_PATH = path.resolve('project-testing/tools/check-default-master-plan-production-readiness.mjs')

test('does not keep legacy serial fallback names in default master-plan runtime publication fixtures', async () => {
  const source = await readFile(new URL('./build-default-master-plan-runtime-publication-evidence.test.mjs', import.meta.url), 'utf8')
  const retiredGenerationMode = ['legacy', 'template', 'serial', 'fallback'].join('_')
  const retiredFallbackPolicy = ['fallback', 'policy'].join('_')

  assert.equal(source.includes(retiredGenerationMode), false)
  assert.equal(source.includes(retiredFallbackPolicy), false)
})

test('blocks runtime publication evidence when exported rows are not a published default master-plan asset', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeJson(exportPath, {
    rows: [{
      publication_key: 'other-asset-publication',
      runtime_publication_status: 'draft',
      runtime_lineage: {
        generationMode: 'non_default_master_plan_asset',
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--published-at',
      '2026-07-01T08:00:00.000Z',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_published_row_required/)
    assert.match(evidence.blockers.join('\n'), /default_master_plan_generation_mode_unsupported/)
    assert.match(evidence.blockers.join('\n'), /rollback_target_required/)
    assert.doesNotMatch(evidence.blockers.join('\n'), /project_manager_review_lineage_required/)
    assert.match(evidence.blockers.join('\n'), /duration_calibration_lineage_required/)
    assert.match(evidence.blockers.join('\n'), /dependency_writer_lineage_required/)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds runtime publication evidence from an exported published default master-plan row', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(exportPath, withExportMetadata({
    wbs_template_runtime_publications: [{
      publication_key: 'default-master-plan-runtime-publication-1',
      asset_kind: 'default_master_plan',
      asset_version_id: 'baseline-1',
      project_id: 'project-1',
      runtime_publication_status: 'runtime_published',
      rollback_target: 'rollback:default-master-plan-runtime-publication-1',
      published_at: '2026-07-01T08:00:00.000Z',
      runtime_lineage: {
        generationMode: 'residential_master_plan_v2',
        acceptedBaselineId: 'baseline-1',
        runtimeAssetKey: 'runtime.default_master_plan.project-1',
        dependencyWriterReleaseRecordTarget: 'default-master-plan-runtime-publication-1',
        durationCalibrationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/duration-calibration.json',
        dependencyWriterEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer.json',
      },
    }],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.schemaVersion, 'workbuddy-default-master-plan-runtime-publication-evidence/v1')
    assert.equal(evidence.status, 'runtime_published')
    assert.equal(evidence.publication.publicationKey, 'default-master-plan-runtime-publication-1')
    assert.equal(evidence.publication.generationMode, 'residential_master_plan_v2')
    assert.equal('projectManagerReviewEvidenceRef' in evidence.releaseLineage, false)
    assert.match(evidence.sourceEvidenceRef, /^wbs_template_runtime_publications_export:/)
    assert.equal(evidence.mutationBoundary.writesProductionTables, false)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')
    const smokeGate = report.gates.find((gate) => gate.id === 'post_publish_smoke_and_rollback_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(publicationGate.status, 'pass')
    assert.equal(smokeGate.status, 'blocked')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when a published row carries a legacy generation mode', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  const retiredGenerationMode = ['legacy', 'template', 'serial', 'fallback'].join('_')
  await writeJson(exportPath, withExportMetadata({
    wbs_template_runtime_publications: [publishedRuntimePublicationRow({
      generationMode: retiredGenerationMode,
    })],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.publication.generationMode, retiredGenerationMode)
    assert.match(evidence.blockers.join('\n'), /default_master_plan_generation_mode_unsupported/)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(publicationGate.status, 'blocked')
    assert.match(publicationGate.blockers.join('\n'), /default_master_plan_generation_mode_unsupported/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when the exported row asset kind is not default master-plan', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeJson(exportPath, withExportMetadata({
    wbs_template_runtime_publications: [{
      publication_key: 'reference-days-runtime-publication-1',
      asset_kind: 'wbs_reference_days',
      asset_version_id: 'baseline-1',
      project_id: 'project-1',
      runtime_publication_status: 'runtime_published',
      rollback_target: 'rollback:reference-days-runtime-publication-1',
      published_at: '2026-07-01T08:00:00.000Z',
      runtime_lineage: {
        generationMode: 'residential_master_plan_v2',
        acceptedBaselineId: 'baseline-1',
        runtimeAssetKey: 'runtime.default_master_plan.project-1',
        dependencyWriterReleaseRecordTarget: 'reference-days-runtime-publication-1',
        projectManagerReviewEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/pm-review.json',
        durationCalibrationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/duration-calibration.json',
        dependencyWriterEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer.json',
      },
    }],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_publication_asset_kind_default_master_plan_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when runtime lineage hides manual-comparison in fallbackApplied', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(exportPath, withExportMetadata({
    wbs_template_runtime_publications: [publishedRuntimePublicationRow({
      generationMode: 'residential_master_plan_v2',
      fallbackApplied: 'manual_comparison_scenario',
    })],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_publication_retired_or_low_information_source_label/)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(publicationGate.status, 'blocked')
    assert.match(publicationGate.blockers.join('\n'), /runtime_publication_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when runtime lineage hides retired original source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(exportPath, withExportMetadata({
    wbs_template_runtime_publications: [publishedRuntimePublicationRow({
      generationMode: 'managed_frontier_default_master_plan',
      originalSource: 'manual_comparison_scenario',
    })],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_publication_retired_or_low_information_source_label/)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(publicationGate.status, 'blocked')
    assert.match(publicationGate.blockers.join('\n'), /runtime_publication_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when runtime lineage hides retired aliases in nested source metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const outputRoot = path.join(root, 'out')
  const profileReport = path.join(root, 'profiles.json')
  const residentialReport = path.join(root, 'residential.md')
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeProfileReport(profileReport)
  await writeResidentialReport(residentialReport)
  await writeJson(exportPath, withExportMetadata({
    wbs_template_runtime_publications: [publishedRuntimePublicationRow({
      generationMode: 'managed_frontier_default_master_plan',
      sourceMetadata: {
        templateSource: 'legacy_template_reverse_inference',
        sourceLineage: [
          { originSource: 'low_information_template_draft' },
        ],
      },
    })],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_publication_retired_or_low_information_source_label/)

    await execFileAsync(process.execPath, [
      CHECKER_PATH,
      '--profile-report',
      profileReport,
      '--residential-report',
      residentialReport,
      '--runtime-publication-evidence',
      outputPath,
      '--output-root',
      outputRoot,
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'readiness.json'), 'utf8'))
    const publicationGate = report.gates.find((gate) => gate.id === 'runtime_publication_evidence')

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(publicationGate.status, 'blocked')
    assert.match(publicationGate.blockers.join('\n'), /runtime_publication_retired_or_low_information_source_label/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when camelCase runtimePublications rows hide retired source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeJson(exportPath, withExportMetadata({
    runtimePublications: [
      publishedRuntimePublicationRow({
        generationMode: 'managed_frontier_default_master_plan',
      }),
      publishedRuntimePublicationRow({
        generationMode: 'managed_frontier_default_master_plan',
        sourceMetadata: {
          sourceLineage: [
            { scenarioSource: 'manual_comparison_scenario' },
          ],
        },
      }),
    ],
  }, 'wbs_template_runtime_publications'))

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_publications_retired_or_low_information_default_master_plan_source/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when the source export lacks auditable export metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeJson(exportPath, {
    wbs_template_runtime_publications: [{
      publication_key: 'default-master-plan-runtime-publication-1',
      asset_kind: 'default_master_plan',
      asset_version_id: 'baseline-1',
      project_id: 'project-1',
      runtime_publication_status: 'runtime_published',
      rollback_target: 'rollback:default-master-plan-runtime-publication-1',
      published_at: '2026-07-01T08:00:00.000Z',
      runtime_lineage: {
        generationMode: 'residential_master_plan_v2',
        acceptedBaselineId: 'baseline-1',
        runtimeAssetKey: 'runtime.default_master_plan.project-1',
        dependencyWriterReleaseRecordTarget: 'default-master-plan-runtime-publication-1',
        projectManagerReviewEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/pm-review.json',
        durationCalibrationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/duration-calibration.json',
        dependencyWriterEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer.json',
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.match(evidence.blockers.join('\n'), /runtime_publications_metadata_required/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks runtime publication evidence when the exported row does not match the requested baseline and project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-runtime-publication-'))
  const exportPath = path.join(root, 'runtime-publications.json')
  const outputPath = path.join(root, 'runtime-publication-evidence.json')

  await writeJson(exportPath, {
    wbs_template_runtime_publications: [{
      publication_key: 'default-master-plan-runtime-publication-1',
      asset_kind: 'default_master_plan',
      asset_version_id: 'baseline-from-other-project',
      project_id: 'project-from-other-chain',
      runtime_publication_status: 'runtime_published',
      rollback_target: 'rollback:default-master-plan-runtime-publication-1',
      published_at: '2026-07-01T08:00:00.000Z',
      runtime_lineage: {
        generationMode: 'residential_master_plan_v2',
        acceptedBaselineId: 'baseline-from-other-project',
        projectId: 'project-from-other-chain',
        runtimeAssetKey: 'runtime.default_master_plan.project-from-other-chain',
        dependencyWriterReleaseRecordTarget: 'default-master-plan-runtime-publication-1',
        projectManagerReviewEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/pm-review.json',
        durationCalibrationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/duration-calibration.json',
        dependencyWriterEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer.json',
      },
    }],
  })

  try {
    await execFileAsync(process.execPath, [
      BUILDER_PATH,
      '--runtime-publications',
      exportPath,
      '--baseline-id',
      'baseline-1',
      '--project-id',
      'project-1',
      '--published-by',
      'release-user-1',
      '--output',
      outputPath,
    ], { cwd: path.resolve('.') })

    const evidence = JSON.parse(await readFile(outputPath, 'utf8'))

    assert.equal(evidence.status, 'blocked')
    assert.equal(evidence.productionReady, false)
    assert.match(evidence.blockers.join('\n'), /runtime_publication_project_id_mismatch/)
    assert.match(evidence.blockers.join('\n'), /runtime_publication_baseline_id_mismatch/)
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
    '- duration evidence: L1',
  ].join('\n'), 'utf8')
}

function publishedRuntimePublicationRow(overrides = {}) {
  return {
    publication_key: 'default-master-plan-runtime-publication-1',
    asset_kind: 'default_master_plan',
    asset_version_id: 'baseline-1',
    project_id: 'project-1',
    runtime_publication_status: 'runtime_published',
    rollback_target: 'rollback:default-master-plan-runtime-publication-1',
    published_at: '2026-07-01T08:00:00.000Z',
    runtime_lineage: {
      generationMode: 'residential_master_plan_v2',
      acceptedBaselineId: 'baseline-1',
      runtimeAssetKey: 'runtime.default_master_plan.project-1',
      dependencyWriterReleaseRecordTarget: 'default-master-plan-runtime-publication-1',
      projectManagerReviewEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/pm-review.json',
      durationCalibrationEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/duration-calibration.json',
      dependencyWriterEvidenceRef: 'project-testing/reports/default-master-plan-production-readiness/dependency-writer.json',
      ...overrides,
    },
  }
}
