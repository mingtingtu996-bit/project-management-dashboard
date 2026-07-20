import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const SCRIPT_PATH = path.resolve('project-testing/tools/check-default-master-plan-evidence-sources.mjs')

test('reports missing source evidence and command templates without writing production data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.schemaVersion, 'workbuddy-default-master-plan-evidence-sources/v1')
    assert.equal(report.status, 'blocked')
    assert.equal(report.missingCount, 4)
    assert.deepEqual(report.missingEvidenceTypes, [
      'durationCalibrationEvidence',
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ])
    assert.equal(
      report.sourceKit.sourceExporter.tool,
      'project-testing/tools/export-default-master-plan-production-sources.mjs',
    )
    assert.equal(
      report.sourceKit.entryTemplatePreflight.tool,
      'project-testing/tools/ensure-default-master-plan-entry-templates.mjs',
    )
    assert.equal(report.candidateHygieneCheck.status, 'blocked')
    assert.deepEqual(report.candidateHygieneCheck.blockers, ['candidate_export_hygiene_report_missing'])
    assert.equal(
      report.sourceKit.candidateHygiene.tool,
      'project-testing/tools/check-default-master-plan-candidate-export-hygiene.mjs',
    )
    assert.deepEqual(report.sourceKit.entryTemplatePreflight.commandTemplate, [
      'node',
      'project-testing/tools/ensure-default-master-plan-entry-templates.mjs',
    ])
    assert.match(report.sourceKit.entryTemplatePreflight.executeCommandTemplate.join(' '), /--execute --installed-by <operator>/)
    assert.match(report.sourceKit.entryTemplatePreflight.mutationBoundary, /does not generate baselines/)
    assert.match(report.sourceKit.sourceExporter.commandTemplate.join(' '), /--environment <staging\|production\|live>/)
    assert.match(report.sourceKit.sourceExporter.commandTemplate.join(' '), /--real-production-outcome <real-production-outcome\.json>/)
    assert.match(report.sourceKit.sourceExporter.mutationBoundary, /does not execute writer/)
    assert.equal(report.sourceKit.builders.length, 4)
    assert.deepEqual(report.sourceKit.builders[0].commandTemplate.slice(0, 4), [
      'node',
      'project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs',
      '--samples',
      '<duration_experience_samples_export.json>',
    ])
    assert.match(report.sourceKit.builders[3].commandTemplate.join(' '), /--publication-key <publication-key>/)
    assert.equal(report.mutationBoundary.readsOnly, true)
    assert.equal(report.mutationBoundary.writesTasks, false)
    assert.equal(report.mutationBoundary.writesRuntimePublication, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports incomplete source export manifest before production evidence assembly', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(sourceManifest, {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'exported',
    phase: 'review-duration',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: '',
    environment: 'staging',
    sourceExports: {
      reviewExport: {
        source: 'candidate_default_master_plan_review',
        kind: 'database_table',
        table: 'public.change_logs',
        path: 'project-testing/reports/default-master-plan-production-readiness/source-exports/candidate-default-master-plan-review-export.json',
        rowCount: 0,
        blockers: [],
      },
      durationSamples: {
        source: 'duration_experience_samples',
        kind: 'database_table',
        table: 'public.duration_experience_samples',
        path: 'project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json',
        rowCount: 0,
        blockers: [],
      },
    },
    blockers: [],
    pipelineArgs: [
      'node',
      'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
      '--review-export',
      'project-testing/reports/default-master-plan-production-readiness/source-exports/candidate-default-master-plan-review-export.json',
      '--duration-samples',
      'project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json',
    ],
    mutationBoundary: {
      readsDatabase: true,
      readsSourceFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.status, 'blocked')
    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.equal(report.sourceManifestCheck.exists, true)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_session_id_required/)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_phase_all_required/)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_publication_key_required/)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_pipeline_arg_missing:--source-manifest/)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_row_count_required:durationSamples/)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_missing_record:runtimePublications/)
    assert.equal(report.sourceManifestCheck.mutationBoundary.writesProductionTables, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('uses default evidence files under output root when explicit paths are omitted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(outputRoot, 'source-exports', 'source-exports-manifest.json')

  await writeJson(path.join(outputRoot, 'duration-calibration-evidence.json'), { status: 'blocked' })
  await writeJson(sourceManifest, {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'exported',
    generatedAt: '2026-07-02T05:31:26.169Z',
    exportSessionId: 'default-master-plan-source-export:session',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: '',
    phase: 'duration',
    environment: 'staging',
    sourceExports: {},
    blockers: [],
    pipelineArgs: ['node', 'pipeline', '--source-manifest', path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/')],
    mutationBoundary: {
      readsDatabase: true,
      readsSourceFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  })

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceChecks.some((item) => item.key === 'reviewEvidence'), false)
    assert.equal(report.sourceChecks.find((item) => item.key === 'durationCalibrationEvidence')?.exists, true)
    assert.equal(report.missingCount, 3)
    assert.deepEqual(report.missingEvidenceTypes, [
      'dependencyWriterEvidence',
      'runtimePublicationEvidence',
      'postPublishSmokeRollbackEvidence',
    ])
    assert.equal(report.sourceManifestCheck.sourcePath.endsWith('source-exports/source-exports-manifest.json'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not qualify a staging controlled replay manifest as production pipeline ready', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')

  await writeJson(sourceManifest, completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  }))
  await writeJson(path.join(outputRoot, 'pm-review-evidence.json'), { status: 'ready' })
  await writeJson(path.join(outputRoot, 'duration-calibration-evidence.json'), { status: 'ready' })
  await writeJson(path.join(outputRoot, 'dependency-writer-evidence.json'), { status: 'ready' })
  await writeJson(path.join(outputRoot, 'runtime-publication-evidence.json'), { status: 'ready' })
  await writeJson(path.join(outputRoot, 'post-publish-smoke-rollback-evidence.json'), { status: 'ready' })
  await writeCandidateHygienePass(outputRoot)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'ready_for_staging_evidence_pipeline')
    assert.equal(report.sourceManifestCheck.structuralStatus, 'ready')
    assert.equal(report.sourceManifestCheck.qualifiedProductionPipelineStatus, 'blocked')
    assert.deepEqual(report.sourceManifestCheck.target, {
      envFileRef: 'server/.env',
      envFileSha256: 'f'.repeat(64),
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      readable: true,
    })
    assert.deepEqual(report.sourceManifestCheck.productionReadinessBlockers, [
      'staging_controlled_replay_not_production_ready',
      'staging_or_non_production_environment_not_production_ready',
      'real_production_or_live_outcome_evidence_required',
    ])
    assert.equal(report.candidateHygieneCheck.status, 'pass')
    assert.equal(report.candidateHygieneCheck.totalCandidateExportCount, 1)
    assert.equal(report.status, 'ready_with_staging_blockers')
    assert.equal(report.productionReady, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a production manifest when real outcome source record is not wired into pipeline args', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/live',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
    environment: 'production',
    includeRealProductionOutcome: true,
  })
  const outcomeFlagIndex = manifest.pipelineArgs.indexOf('--real-production-outcome')
  manifest.pipelineArgs.splice(outcomeFlagIndex, 2)

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_pipeline_arg_missing:--real-production-outcome/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a source manifest record that exposes a legacy default master-plan source label', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  })
  manifest.sourceExports.writerResult.sourceVersionLabel = 'legacy_template_serial_fallback'

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_legacy_default_master_plan_label:writerResult/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('classifies blocked real duration sample source export without kind or row-count noise', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  })
  manifest.status = 'blocked'
  manifest.blockers = ['durationSamples:blocked_real_duration_sample_material']
  manifest.sourceExports.durationSamples.kind = 'blocked_real_duration_sample_material'
  manifest.sourceExports.durationSamples.rowCount = 0
  manifest.sourceExports.durationSamples.blockers = ['blocked_real_duration_sample_material']

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))
    const blockers = report.sourceManifestCheck.blockers

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.equal(blockers.includes('source_export_manifest_record_blocked:durationSamples'), true)
    assert.equal(blockers.includes('source_export_manifest_not_exported'), false)
    assert.equal(blockers.includes('source_export_manifest_kind_mismatch:durationSamples'), false)
    assert.equal(blockers.includes('source_export_manifest_row_count_required:durationSamples'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a source manifest record that hides manual-comparison in fallbackApplied', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  })
  manifest.sourceExports.writerResult.fallbackApplied = 'manual_comparison_scenario'

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_retired_or_low_information_default_master_plan_label:writerResult/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a source manifest record that hides retired original source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  })
  manifest.sourceExports.writerResult.originalSource = 'manual_comparison_scenario'

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_retired_or_low_information_default_master_plan_label:writerResult/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a source manifest record that hides retired aliases in nested source metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  })
  manifest.sourceExports.writerResult.sourceMetadata = {
    templateSource: 'legacy_template_reverse_inference',
    sourceLineage: [
      { originSource: 'low_information_template_draft' },
    ],
  }

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_retired_or_low_information_default_master_plan_label:writerResult/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a source manifest record that hides retired sources in governance fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/staging-runtime',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
  })
  manifest.sourceExports.writerResult.comparisonBasis = ['manual_comparison_scenario']
  manifest.sourceExports.writerResult.boundaryPolicy = ['low_information_template_draft']
  manifest.sourceExports.writerResult.reviewProof = [
    { sourceKind: 'legacy_template_reverse_inference' },
  ]

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_retired_or_low_information_default_master_plan_label:writerResult/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks a source manifest whose pipeline args omit or mismatch runtime identity flags', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-source-kit-'))
  const outputRoot = path.join(root, 'out')
  const sourceManifest = path.join(root, 'source-exports-manifest.json')
  const manifest = completeSourceManifestFixture({
    sourcePathPrefix: 'project-testing/reports/default-master-plan-production-readiness/live',
    sourceManifestPath: path.relative(path.resolve('.'), sourceManifest).replace(/\\/g, '/'),
    environment: 'production',
    includeRealProductionOutcome: true,
  })
  const baselineFlagIndex = manifest.pipelineArgs.indexOf('--baseline-id')
  if (baselineFlagIndex !== -1) manifest.pipelineArgs.splice(baselineFlagIndex, 2)
  const projectFlagIndex = manifest.pipelineArgs.indexOf('--project-id')
  if (projectFlagIndex !== -1) manifest.pipelineArgs[projectFlagIndex + 1] = 'wrong-project'

  await writeJson(sourceManifest, manifest)

  try {
    await execFileAsync(process.execPath, [
      SCRIPT_PATH,
      '--output-root',
      outputRoot,
      '--source-manifest',
      sourceManifest,
      '--json',
    ], { cwd: path.resolve('.') })

    const report = JSON.parse(await readFile(path.join(outputRoot, 'evidence-sources-report.json'), 'utf8'))

    assert.equal(report.sourceManifestCheck.status, 'blocked')
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_pipeline_arg_missing:--baseline-id/)
    assert.match(report.sourceManifestCheck.blockers.join('\n'), /source_export_manifest_pipeline_arg_value_mismatch:--project-id/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(filePath), { recursive: true }))
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeCandidateHygienePass(outputRoot) {
  await writeJson(path.join(outputRoot, 'candidate-export-hygiene.json'), {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'pass',
    productionReady: false,
    totalCandidateExportCount: 1,
    currentCandidate: {
      fileName: 'candidate-baseline-baseline-1-school-items.json',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      productionCandidateEligible: true,
    },
    ignoredCandidateExports: [],
    extraEligibleCandidateExports: [],
    blockers: [],
    mutationBoundary: {
      readsLocalReports: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  })
}

function completeSourceManifestFixture({
  sourcePathPrefix,
  sourceManifestPath,
  environment = 'staging',
  includeRealProductionOutcome = false,
}) {
  const sourceExports = {
    reviewExport: {
      source: 'candidate_default_master_plan_review',
      kind: 'database_table',
      table: 'public.change_logs',
      path: 'source-exports/candidate-default-master-plan-review-export.json',
      sha256: 'a'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    durationSamples: {
      source: 'duration_experience_samples',
      kind: 'database_table',
      table: 'public.duration_experience_samples',
      path: 'source-exports/duration-experience-samples-export.json',
      sha256: 'b'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    taskDependencies: {
      source: 'task_dependencies',
      kind: 'database_table',
      table: 'public.task_dependencies',
      path: 'source-exports/task-dependencies-export.json',
      sha256: 'c'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    runtimePublications: {
      source: 'duration_learning_runtime_publications',
      kind: 'database_table',
      table: 'public.duration_learning_runtime_publications',
      path: 'source-exports/duration-learning-runtime-publications-export.json',
      sha256: 'd'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    runtimeConsumptions: {
      source: 'duration_learning_runtime_consumptions',
      kind: 'database_table',
      table: 'public.duration_learning_runtime_consumptions',
      path: 'source-exports/duration-learning-runtime-consumptions-export.json',
      sha256: '6'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    writerResult: {
      source: 'dependency_writer_result',
      kind: 'source_file',
      sourcePath: `${sourcePathPrefix}/dependency-writer-result.json`,
      path: 'source-exports/dependency-writer-result-export.json',
      sha256: 'e'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    criticalPathReadback: {
      source: 'critical_path_readback',
      kind: 'source_file',
      sourcePath: `${sourcePathPrefix}/critical-path-readback.json`,
      path: 'source-exports/critical-path-readback-export.json',
      sha256: 'f'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    apiReadSmoke: {
      source: 'api_read_smoke',
      kind: 'source_file',
      sourcePath: `${sourcePathPrefix}/api-read-smoke.json`,
      path: 'source-exports/api-read-smoke-export.json',
      sha256: '1'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    uiConsumptionSmoke: {
      source: 'ui_consumption_smoke',
      kind: 'source_file',
      sourcePath: `${sourcePathPrefix}/ui-consumption-smoke.json`,
      path: 'source-exports/ui-consumption-smoke-export.json',
      sha256: '2'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
    rollbackVerification: {
      source: 'rollback_verification',
      kind: 'source_file',
      sourcePath: `${sourcePathPrefix}/rollback-verification.json`,
      path: 'source-exports/rollback-verification-export.json',
      sha256: '3'.repeat(64),
      rowCount: 1,
      blockers: [],
    },
  }
  if (includeRealProductionOutcome) {
    sourceExports.realProductionOutcome = {
      source: 'real_production_outcome',
      kind: 'source_file',
      sourcePath: `${sourcePathPrefix}/real-production-outcome.json`,
      path: 'source-exports/real-production-outcome-export.json',
      sha256: '4'.repeat(64),
      rowCount: 1,
      blockers: [],
      realProductionOutcomeEvidence: {
        status: 'verified',
        environment,
        baselineId: 'baseline-1',
        projectId: 'project-1',
        publicationKey: 'runtime.default_master_plan.project-1',
        evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=4444444444444444444444444444444444444444444444444444444444444444',
      },
    }
  }

  const pipelineArgs = [
    'node',
    'project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs',
    '--baseline-id',
    'baseline-1',
    '--project-id',
    'project-1',
    '--publication-key',
    'runtime.default_master_plan.project-1',
    '--environment',
    environment,
    '--source-manifest',
    sourceManifestPath,
  ]
  for (const [flag, key] of [
    ['--review-export', 'reviewExport'],
    ['--duration-samples', 'durationSamples'],
    ['--writer-result', 'writerResult'],
    ['--task-dependencies', 'taskDependencies'],
    ['--runtime-publications', 'runtimePublications'],
    ['--runtime-consumptions', 'runtimeConsumptions'],
    ['--api-read-smoke', 'apiReadSmoke'],
    ['--ui-consumption-smoke', 'uiConsumptionSmoke'],
    ['--critical-path-readback', 'criticalPathReadback'],
    ['--rollback-verification', 'rollbackVerification'],
    ...(includeRealProductionOutcome ? [['--real-production-outcome', 'realProductionOutcome']] : []),
  ]) {
    pipelineArgs.push(flag, sourceExports[key].path)
  }

  return {
    schemaVersion: 'workbuddy-default-master-plan-production-source-exports/v1',
    status: 'exported',
    generatedAt: '2026-07-02T05:31:26.169Z',
    exportSessionId: 'default-master-plan-source-export:session',
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'runtime.default_master_plan.project-1',
    phase: 'all',
    environment,
    exportedBy: 'reviewer-1',
    target: {
      envFileRef: 'server/.env',
      envFileSha256: 'f'.repeat(64),
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      readable: true,
    },
    sourceExports,
    blockers: [],
    pipelineArgs,
    mutationBoundary: {
      readsDatabase: true,
      readsSourceFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }
}
