import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildSourceExportPgClientConfig,
  exportDefaultMasterPlanProductionSources,
} from './export-default-master-plan-production-sources.mjs'

test('keeps the explicit source-export TLS policy when the connection string includes sslmode', () => {
  const config = buildSourceExportPgClientConfig(
    'postgresql://user:secret@example.test:5432/postgres?sslmode=require&application_name=source-export',
  )

  assert.doesNotMatch(config.connectionString, /sslmode=/)
  assert.match(config.connectionString, /application_name=source-export/)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
})

test('exports DB and file source payloads with auditable metadata and no-write boundary', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const envFile = path.join(root, '.env')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')

  await writeFile(envFile, [
    'SUPABASE_URL=https://wwdrkjnbvcbfytwnnyvs.supabase.co',
    'SUPABASE_MIGRATION_URL=postgresql://postgres:secret@db.wwdrkjnbvcbfytwnnyvs.supabase.co:5432/postgres',
    '',
  ].join('\n'), 'utf8')
  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', execution_mode: 'execute' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1' })
  await writeJson(realProductionOutcome, {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: 'runtime-publication:publication-1#sha256=1111111111111111111111111111111111111111111111111111111111111111',
    apiReadSmokeEvidenceRef: 'api-read-smoke:publication-1#sha256=2222222222222222222222222222222222222222222222222222222222222222',
    uiConsumptionSmokeEvidenceRef: 'ui-consumption-smoke:publication-1#sha256=3333333333333333333333333333333333333333333333333333333333333333',
    criticalPathReadbackEvidenceRef: 'critical-path-readback:publication-1#sha256=4444444444444444444444444444444444444444444444444444444444444444',
    rollbackEvidenceRef: 'rollback:publication-1#sha256=5555555555555555555555555555555555555555555555555555555555555555',
  })

  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) {
      return columnsFor(params[1])
    }
    if (sql.includes('public."duration_experience_samples"')) {
      return [{
        id: 'sample-1',
        project_id: 'project-1',
        task_id: 'task-1',
        sample_status: 'accepted',
        included_in_benchmark: true,
        actual_duration_days: 7,
        stable_code: '01-01',
      }]
    }
    if (sql.includes('public."tasks"')) {
      return [{
        id: 'task-1',
        project_id: 'project-1',
        title: '完成任务',
        status: 'completed',
        standard_work_code: '01-01',
        actual_start_date: '2026-06-01',
        actual_end_date: '2026-06-07',
      }]
    }
    if (sql.includes('public."task_dependencies"')) {
      return [{
        id: 'dep-1',
        project_id: 'project-1',
        task_id: 'task-2',
        dependency_task_id: 'task-1',
        source_type: 'construction_organization_plan_network',
      }]
    }
    if (sql.includes('public."wbs_template_runtime_publications"')) {
      return [{
        id: 'pub-1',
        project_id: 'project-1',
        publication_key: 'publication-1',
        accepted_baseline_id: 'baseline-1',
        runtime_publication_status: 'runtime_published',
      }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {
    queries.push({ sql: 'close', params: [] })
  }

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      envFile,
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      realProductionOutcome,
      queryExec,
      now: new Date('2026-07-01T09:00:00.000Z'),
    })

    assert.equal(manifest.status, 'exported')
    assert.match(manifest.exportSessionId, /^default-master-plan-source-export:2026-07-01T09:00:00\.000Z:/)
    assert.deepEqual(manifest.blockers, [])
    assert.equal(manifest.mutationBoundary.writesProductionTables, false)
    assert.equal(manifest.mutationBoundary.invokesRuntimeWriters, false)
    assert.equal(manifest.target.supabaseProjectRef, 'wwdrkjnbvcbfytwnnyvs')
    assert.equal(manifest.target.databaseHost, 'db.wwdrkjnbvcbfytwnnyvs.supabase.co')
    assert.equal(manifest.target.connectionSource, 'SUPABASE_MIGRATION_URL')
    assert.doesNotMatch(JSON.stringify(manifest.target), /secret/)
    assert.equal(manifest.sourceExports.writerResult.rowCount, 1)
    assert.equal(manifest.sourceExports.realProductionOutcome.rowCount, 1)
    assert.equal(manifest.sourceExports.realProductionOutcome.realProductionOutcomeEvidence.environment, 'production')
    assert.equal(manifest.sourceExports.realProductionOutcome.realProductionOutcomeEvidence.target.supabaseProjectRef, 'production-ref-1')
    assert.equal(manifest.sourceExports.realProductionOutcome.sourcePath, repoRelative(realProductionOutcome))
    assert.match(manifest.sourceExports.realProductionOutcome.sourceSha256, /^[a-f0-9]{64}$/)
    assert.equal(
      manifest.sourceExports.realProductionOutcome.realProductionOutcomeEvidence.evidenceRef,
      `real_production_outcome_export:${manifest.sourceExports.realProductionOutcome.sourcePath}#sha256=${manifest.sourceExports.realProductionOutcome.sourceSha256}`,
    )
    assert.match(manifest.sourceExports.writerResult.sha256, /^[a-f0-9]{64}$/)
    assert.equal(manifest.pipelineArgs.includes('--source-manifest'), true)
    assert.equal(manifest.pipelineArgs.includes(`${manifest.outputRoot}/source-exports-manifest.json`), true)
    assert.equal(manifest.pipelineArgs.includes('--review-export'), false)
    assert.equal(manifest.pipelineArgs.includes('--real-production-outcome'), true)
    assert.equal(manifest.pipelineArgs.includes(manifest.sourceExports.realProductionOutcome.path), true)

    await assert.rejects(
      readJson(path.join(outputRoot, 'candidate-default-master-plan-review-export.json')),
      /ENOENT/,
    )

    const wrappedSmoke = await readJson(path.join(outputRoot, 'api-read-smoke-export.json'))
    assert.equal(wrappedSmoke.status, 'pass')
    assert.equal(wrappedSmoke.baselineId, 'baseline-1')
    assert.equal(wrappedSmoke.export_metadata.source, 'api_read_smoke')

    assert.equal(queries.some((query) => query.sql.includes('INSERT')), false)
    assert.equal(queries.some((query) => query.sql.includes('UPDATE')), false)
    assert.equal(queries.some((query) => query.sql.includes('DELETE')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks before DB access when source export identity is incomplete', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot: path.join(root, 'source-exports'),
      baselineId: '',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'local',
      exportedBy: '',
      queryExec,
      now: new Date('2026-07-01T09:00:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.deepEqual(manifest.blockers, [
      'baseline_id_required',
      'real_environment_required',
      'exported_by_required',
    ])
    assert.equal(queryCount, 0)

    const writtenManifest = await readJson(path.join(root, 'source-exports', 'source-exports-manifest.json'))
    assert.equal(writtenManifest.status, 'blocked')
    assert.equal(writtenManifest.mutationBoundary.writesTaskDependencies, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writes blocked manifest when DB connection setup fails before source export queries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const envFile = path.join(root, '.env')

  await writeFile(envFile, [
    'SUPABASE_URL=https://wwdrkjnbvcbfytwnnyvs.supabase.co',
    '',
  ].join('\n'), 'utf8')

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      envFile,
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      now: new Date('2026-07-01T09:05:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(
      manifest.blockers.includes('source_database_connection_failed:SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for default master-plan source exports'),
      true,
    )
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])

    const writtenManifest = await readJson(path.join(outputRoot, 'source-exports-manifest.json'))
    assert.equal(writtenManifest.status, 'blocked')
    assert.equal(
      writtenManifest.blockers.includes('source_database_connection_failed:SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required for default master-plan source exports'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not require real production outcome material for staging source exports', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')

  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', execution_mode: 'execute' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1' })

  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) {
      return columnsFor(params[1])
    }
    if (sql.includes('public."change_logs"')) {
      return [{ id: 'change-1', field_name: 'candidate_default_master_plan_review', entity_id: 'baseline-1', project_id: 'project-1' }]
    }
    if (sql.includes('public."duration_experience_samples"')) {
      return [{ id: 'sample-1', project_id: 'project-1', sample_status: 'accepted', included_in_benchmark: true, actual_duration_days: 7, stable_code: '01-01' }]
    }
    if (sql.includes('public."tasks"')) {
      return [{ id: 'task-1', project_id: 'project-1', title: '完成任务', status: 'completed', standard_work_code: '01-01', actual_start_date: '2026-06-01', actual_end_date: '2026-06-07' }]
    }
    if (sql.includes('public."task_dependencies"')) {
      return [{ id: 'dep-1', project_id: 'project-1', task_id: 'task-2', dependency_task_id: 'task-1', source_type: 'construction_organization_plan_network' }]
    }
    if (sql.includes('public."wbs_template_runtime_publications"')) {
      return [{ id: 'pub-1', project_id: 'project-1', publication_key: 'publication-1', accepted_baseline_id: 'baseline-1', runtime_publication_status: 'runtime_published' }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:10:00.000Z'),
    })

    assert.equal(manifest.status, 'exported')
    assert.deepEqual(manifest.blockers, [])
    assert.equal(Object.hasOwn(manifest.sourceExports, 'realProductionOutcome'), false)
    assert.equal(manifest.pipelineArgs.includes('--real-production-outcome'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('can rebuild full manifest from existing source export files without DB access', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const durationSamples = path.join(outputRoot, 'duration-experience-samples-export.json')
  const rawCompletedTasks = path.join(outputRoot, 'raw-completed-tasks.json')
  const taskDependencies = path.join(outputRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(outputRoot, 'wbs-template-runtime-publications-export.json')
  const stagingSourceRoot = path.join(root, 'staging-runtime')
  const writerResult = path.join(stagingSourceRoot, 'dependency-writer-result.json')
  const criticalPathReadback = path.join(stagingSourceRoot, 'critical-path-readback.json')
  const apiReadSmoke = path.join(stagingSourceRoot, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(stagingSourceRoot, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(stagingSourceRoot, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    throw new Error('DB should not be read in existing source export rebuild mode')
  }

  await writeExportedDbSource(durationSamples, {
    source: 'duration_experience_samples',
    table: 'public.duration_experience_samples',
    rowArrayKey: 'duration_experience_samples',
    rows: [{ id: 'sample-1' }],
  })
  await writeExportedDbSource(rawCompletedTasks, {
    source: 'raw_completed_tasks',
    table: 'public.tasks',
    rowArrayKey: 'tasks',
    rows: [{ id: 'task-1' }],
  })
  await writeExportedDbSource(taskDependencies, {
    source: 'task_dependencies',
    table: 'public.task_dependencies',
    rowArrayKey: 'task_dependencies',
    rows: [{ id: 'dependency-1' }],
  })
  await writeExportedDbSource(runtimePublications, {
    source: 'wbs_template_runtime_publications',
    table: 'public.wbs_template_runtime_publications',
    rowArrayKey: 'wbs_template_runtime_publications',
    rows: [{ id: 'publication-1' }],
  })
  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', execution_mode: 'execute' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      phase: 'all',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      durationSamples,
      rawCompletedTasks,
      taskDependencies,
      runtimePublications,
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:12:00.000Z'),
    })

    assert.equal(queryCount, 0)
    assert.equal(manifest.status, 'exported')
    assert.deepEqual(manifest.blockers, [])
    assert.equal(manifest.sourceExports.runtimePublications.rowCount, 1)
    assert.equal(manifest.sourceExports.writerResult.rowCount, 1)
    assert.equal(manifest.sourceExports.writerResult.sourcePath.endsWith('staging-runtime/dependency-writer-result.json'), true)
    assert.equal(manifest.pipelineArgs.includes('--runtime-publications'), true)
    assert.equal(manifest.pipelineArgs.includes(manifest.sourceExports.runtimePublications.path), true)
    assert.equal(manifest.pipelineArgs.includes('--source-manifest'), true)
    assert.equal(manifest.pipelineArgs.includes(`${manifest.outputRoot}/source-exports-manifest.json`), true)
    assert.equal(manifest.mutationBoundary.readsExistingSourceExports, true)

    const writtenManifest = await readJson(path.join(outputRoot, 'source-exports-manifest.json'))
    assert.equal(writtenManifest.sourceExports.taskDependencies.sha256, manifest.sourceExports.taskDependencies.sha256)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rebuilds manifest with blocked real duration sample source export as an explicit duration blocker', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const reviewExport = path.join(outputRoot, 'candidate-default-master-plan-review-export.json')
  const durationSamples = path.join(outputRoot, 'duration-experience-samples-export.json')
  const rawCompletedTasks = path.join(outputRoot, 'raw-completed-tasks.json')
  const taskDependencies = path.join(outputRoot, 'task-dependencies-export.json')
  const runtimePublications = path.join(outputRoot, 'wbs-template-runtime-publications-export.json')
  const stagingSourceRoot = path.join(root, 'staging-runtime')
  const writerResult = path.join(stagingSourceRoot, 'dependency-writer-result.json')
  const criticalPathReadback = path.join(stagingSourceRoot, 'critical-path-readback.json')
  const apiReadSmoke = path.join(stagingSourceRoot, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(stagingSourceRoot, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(stagingSourceRoot, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    throw new Error('DB should not be read in existing source export rebuild mode')
  }

  await writeExportedDbSource(reviewExport, {
    source: 'candidate_default_master_plan_review',
    table: 'public.change_logs',
    rowArrayKey: 'change_logs',
    rows: [{ id: 'change-1' }],
  })
  await writeJson(durationSamples, {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    export_metadata: {
      ...exportMetadataFixture({
        source: 'duration_experience_samples',
        sourceKind: 'blocked_real_duration_sample_material',
        table: 'public.duration_experience_samples',
      }),
      blocked: true,
    },
    rows: [],
  })
  await writeExportedDbSource(rawCompletedTasks, {
    source: 'raw_completed_tasks',
    table: 'public.tasks',
    rowArrayKey: 'tasks',
    rows: [{ id: 'task-1' }],
  })
  await writeExportedDbSource(taskDependencies, {
    source: 'task_dependencies',
    table: 'public.task_dependencies',
    rowArrayKey: 'task_dependencies',
    rows: [{ id: 'dependency-1' }],
  })
  await writeExportedDbSource(runtimePublications, {
    source: 'wbs_template_runtime_publications',
    table: 'public.wbs_template_runtime_publications',
    rowArrayKey: 'wbs_template_runtime_publications',
    rows: [{ id: 'publication-1' }],
  })
  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', execution_mode: 'execute' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      phase: 'all',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      reviewExport,
      durationSamples,
      rawCompletedTasks,
      taskDependencies,
      runtimePublications,
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:13:00.000Z'),
    })

    assert.equal(queryCount, 0)
    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('durationSamples:blocked_real_duration_sample_material'), true)
    assert.equal(manifest.blockers.includes('durationSamples:source_export_kind_mismatch'), false)
    assert.equal(manifest.sourceExports.durationSamples.kind, 'blocked_real_duration_sample_material')
    assert.equal(manifest.sourceExports.durationSamples.rowCount, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source exports before DB access when real production outcome material is missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot: path.join(root, 'source-exports'),
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      writerResult: path.join(root, 'writer-result.json'),
      criticalPathReadback: path.join(root, 'critical-path-readback.json'),
      apiReadSmoke: path.join(root, 'api-read-smoke.json'),
      uiConsumptionSmoke: path.join(root, 'ui-consumption-smoke.json'),
      rollbackVerification: path.join(root, 'rollback-verification.json'),
      queryExec,
      now: new Date('2026-07-01T09:15:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('real_production_outcome_required'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source exports before DB access when real production outcome material is not qualified', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(realProductionOutcome, {
    status: 'draft',
    environment: 'staging',
    baselineId: 'wrong-baseline',
    projectId: 'project-1',
    publicationKey: 'publication-1',
  })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot: path.join(root, 'source-exports'),
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      realProductionOutcome,
      queryExec,
      now: new Date('2026-07-01T09:20:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.deepEqual(manifest.blockers.slice(0, 18), [
      'real_production_outcome_status_pass_required',
      'real_production_outcome_production_or_live_environment_required',
      'real_production_outcome_environment_mismatch',
      'real_production_outcome_baseline_id_mismatch',
      'real_production_outcome_evidence_ref_required',
      'real_production_outcome_target_required',
      'real_production_outcome_target_supabase_project_ref_required',
      'real_production_outcome_target_database_host_required',
      'real_production_outcome_target_connection_source_required',
      'real_production_outcome_target_environment_required',
      'real_production_outcome_accepted_by_required',
      'real_production_outcome_accepted_at_required',
      'real_production_outcome_approval_ref_required',
      'real_production_outcome_runtime_publication_evidence_ref_required',
      'real_production_outcome_api_read_smoke_evidence_ref_required',
      'real_production_outcome_ui_consumption_smoke_evidence_ref_required',
      'real_production_outcome_critical_path_readback_evidence_ref_required',
      'real_production_outcome_rollback_evidence_ref_required',
    ])
    assert.equal(manifest.blockers.includes('real_production_outcome_api_read_smoke_evidence_ref_source_required'), true)
    assert.equal(manifest.blockers.includes('real_production_outcome_rollback_evidence_ref_source_required'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source exports before DB access when real outcome material refs do not match source files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', execution_mode: 'execute', environment: 'production' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'production' })
  await writeJson(realProductionOutcome, {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: fileEvidenceRef('wbs_template_runtime_publications_export', writerResult),
    apiReadSmokeEvidenceRef: 'api_read_smoke_export:project-testing/reports/default-master-plan-production-readiness/wrong-api-smoke.json#sha256=2222222222222222222222222222222222222222222222222222222222222222',
    uiConsumptionSmokeEvidenceRef: fileEvidenceRef('ui_consumption_smoke_export', uiConsumptionSmoke),
    criticalPathReadbackEvidenceRef: fileEvidenceRef('critical_path_readback_export', criticalPathReadback),
    rollbackEvidenceRef: fileEvidenceRef('rollback_verification_export', rollbackVerification),
  })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      realProductionOutcome,
      queryExec,
      now: new Date('2026-07-01T09:22:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('real_production_outcome_api_read_smoke_evidence_ref_mismatch'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source exports when real outcome runtime publication ref points at writer result', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) {
      return columnsFor(params[1])
    }
    if (sql.includes('public."change_logs"')) {
      return [{ id: 'change-1', field_name: 'candidate_default_master_plan_review', entity_id: 'baseline-1', project_id: 'project-1' }]
    }
    if (sql.includes('public."duration_experience_samples"')) {
      return [{ id: 'sample-1', project_id: 'project-1', sample_status: 'accepted', included_in_benchmark: true, actual_duration_days: 7, stable_code: '01-01' }]
    }
    if (sql.includes('public."tasks"')) {
      return [{ id: 'task-1', project_id: 'project-1', title: '完成任务', status: 'completed', standard_work_code: '01-01', actual_start_date: '2026-06-01', actual_end_date: '2026-06-07' }]
    }
    if (sql.includes('public."task_dependencies"')) {
      return [{ id: 'dep-1', project_id: 'project-1', task_id: 'task-2', dependency_task_id: 'task-1', source_type: 'construction_organization_plan_network' }]
    }
    if (sql.includes('public."wbs_template_runtime_publications"')) {
      return [{ id: 'pub-1', project_id: 'project-1', publication_key: 'publication-1', accepted_baseline_id: 'baseline-1', runtime_publication_status: 'runtime_published' }]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', execution_mode: 'execute', environment: 'production' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'production' })
  await writeJson(realProductionOutcome, {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: fileEvidenceRef('wbs_template_runtime_publications_export', writerResult),
    apiReadSmokeEvidenceRef: fileEvidenceRef('api_read_smoke_export', apiReadSmoke),
    uiConsumptionSmokeEvidenceRef: fileEvidenceRef('ui_consumption_smoke_export', uiConsumptionSmoke),
    criticalPathReadbackEvidenceRef: fileEvidenceRef('critical_path_readback_export', criticalPathReadback),
    rollbackEvidenceRef: fileEvidenceRef('rollback_verification_export', rollbackVerification),
  })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      realProductionOutcome,
      queryExec,
      now: new Date('2026-07-01T09:24:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('real_production_outcome_runtime_publication_evidence_ref_mismatch'), true)
    assert.equal(manifest.sourceExports.runtimePublications.rowCount, 1)
    assert.equal(queries.some((query) => query.sql.includes('public."wbs_template_runtime_publications"')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source exports when source files identify a different environment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, { baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', execution_mode: 'execute', environment: 'production' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'production' })
  await writeJson(realProductionOutcome, {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: 'runtime-publication:publication-1#sha256=1111111111111111111111111111111111111111111111111111111111111111',
    apiReadSmokeEvidenceRef: 'api-read-smoke:publication-1#sha256=2222222222222222222222222222222222222222222222222222222222222222',
    uiConsumptionSmokeEvidenceRef: 'ui-consumption-smoke:publication-1#sha256=3333333333333333333333333333333333333333333333333333333333333333',
    criticalPathReadbackEvidenceRef: 'critical-path-readback:publication-1#sha256=4444444444444444444444444444444444444444444444444444444444444444',
    rollbackEvidenceRef: 'rollback:publication-1#sha256=5555555555555555555555555555555555555555555555555555555555555555',
  })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      realProductionOutcome,
      queryExec,
      now: new Date('2026-07-01T09:25:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('apiReadSmoke:source_file_environment_mismatch'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks production source exports when source files identify a different baseline project or publication', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  const realProductionOutcome = path.join(root, 'real-production-outcome.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, { baselineId: 'wrong-baseline', projectId: 'project-1', publicationKey: 'publication-1', execution_mode: 'execute', environment: 'production' })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'wrong-project', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'wrong-publication', environment: 'production' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'production' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'production' })
  await writeJson(realProductionOutcome, {
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: 'deploy/env/production.env',
      supabaseProjectRef: 'production-ref-1',
      databaseHost: 'db.production-ref-1.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      environment: 'production',
    },
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    evidenceRef: 'project-testing/reports/default-master-plan-production-readiness/real-production-outcome.json#sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    acceptedBy: 'production-owner:9e4a5570-0032-43bd-8f17-0bc415a1eb70',
    acceptedAt: '2026-07-01T10:00:00.000Z',
    approvalRef: 'approval:production-release-window-1',
    runtimePublicationEvidenceRef: 'runtime-publication:publication-1#sha256=1111111111111111111111111111111111111111111111111111111111111111',
    apiReadSmokeEvidenceRef: 'api-read-smoke:publication-1#sha256=2222222222222222222222222222222222222222222222222222222222222222',
    uiConsumptionSmokeEvidenceRef: 'ui-consumption-smoke:publication-1#sha256=3333333333333333333333333333333333333333333333333333333333333333',
    criticalPathReadbackEvidenceRef: 'critical-path-readback:publication-1#sha256=4444444444444444444444444444444444444444444444444444444444444444',
    rollbackEvidenceRef: 'rollback:publication-1#sha256=5555555555555555555555555555555555555555555555555555555555555555',
  })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      realProductionOutcome,
      queryExec,
      now: new Date('2026-07-01T09:25:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('writerResult:source_file_baseline_id_mismatch'), true)
    assert.equal(manifest.blockers.includes('criticalPathReadback:source_file_project_id_mismatch'), true)
    assert.equal(manifest.blockers.includes('apiReadSmoke:source_file_publication_key_mismatch'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports before DB access when writer result carries a legacy default master-plan source label', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    environment: 'staging',
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'legacy_template_serial_fallback',
      source_version_label: 'legacy_template_serial_fallback',
    },
  })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'staging' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:30:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('writerResult:source_file_legacy_default_master_plan_label'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports before DB access when writer result hides manual-comparison in fallbackApplied', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    environment: 'staging',
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
    },
    rows: [
      {
        fallbackApplied: 'manual_comparison_scenario',
      },
    ],
  })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'staging' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:30:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('writerResult:source_file_retired_or_low_information_default_master_plan_label'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports before DB access when writer result hides retired originalSource lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    environment: 'staging',
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
    },
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        originalSource: 'manual_comparison_scenario',
      },
    ],
  })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'staging' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:30:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('writerResult:source_file_retired_or_low_information_default_master_plan_label'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports before DB access when writer result hides retired aliases in nested source metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    environment: 'staging',
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
    },
    rows: [
      {
        source: 'managed_frontier_default_master_plan',
        sourceMetadata: {
          templateSource: 'legacy_template_reverse_inference',
          sourceLineage: [
            { originSource: 'low_information_template_draft' },
          ],
        },
      },
    ],
  })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'staging' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:30:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('writerResult:source_file_retired_or_low_information_default_master_plan_label'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks source exports before DB access when writer result root hides retired sources in governance fields', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const writerResult = path.join(root, 'writer-result.json')
  const criticalPathReadback = path.join(root, 'critical-path-readback.json')
  const apiReadSmoke = path.join(root, 'api-read-smoke.json')
  const uiConsumptionSmoke = path.join(root, 'ui-consumption-smoke.json')
  const rollbackVerification = path.join(root, 'rollback-verification.json')
  let queryCount = 0
  const queryExec = async () => {
    queryCount += 1
    return []
  }

  await writeJson(writerResult, {
    baselineId: 'baseline-1',
    projectId: 'project-1',
    publicationKey: 'publication-1',
    environment: 'staging',
    execution_mode: 'execute',
    candidate_default_master_plan: {
      generation_mode: 'managed_frontier_default_master_plan',
      source_version_label: 'managed_frontier_default_master_plan',
    },
    comparisonBasis: ['manual_comparison_scenario'],
    boundaryPolicy: ['low_information_template_draft'],
    reviewProof: [
      { sourceKind: 'legacy_template_reverse_inference' },
    ],
  })
  await writeJson(criticalPathReadback, { status: 'readback_passed', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(apiReadSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(uiConsumptionSmoke, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', environment: 'staging' })
  await writeJson(rollbackVerification, { status: 'pass', baselineId: 'baseline-1', projectId: 'project-1', publicationKey: 'publication-1', rollbackTarget: 'rollback:publication-1', environment: 'staging' })

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: 'publication-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      writerResult,
      criticalPathReadback,
      apiReadSmoke,
      uiConsumptionSmoke,
      rollbackVerification,
      queryExec,
      now: new Date('2026-07-01T09:30:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('writerResult:source_file_retired_or_low_information_default_master_plan_label'), true)
    assert.equal(queryCount, 0)
    assert.deepEqual(manifest.sourceExports, {})
    assert.deepEqual(manifest.pipelineArgs, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration phase exports duration samples and raw completed tasks without PM review change logs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) {
      return columnsFor(params[1])
    }
    if (sql.includes('public."duration_experience_samples"')) {
      return [{
        id: 'sample-1',
        project_id: 'project-1',
        task_id: 'task-1',
        sample_status: 'accepted',
        included_in_benchmark: true,
        actual_duration_days: 7,
        stable_code: '01-01',
      }]
    }
    if (sql.includes('public."tasks"')) {
      return [{
        id: 'task-1',
        project_id: 'project-1',
        title: '完成任务',
        status: 'completed',
        standard_work_code: '01-01',
        actual_start_date: '2026-06-01',
        actual_end_date: '2026-06-07',
      }]
    }
    throw new Error(`unexpected SQL in duration phase: ${sql}`)
  }
  queryExec.close = async () => {
    queries.push({ sql: 'close', params: [] })
  }

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      phase: 'duration',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: '',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-01T09:00:00.000Z'),
    })

    assert.equal(manifest.status, 'exported')
    assert.equal(manifest.phase, 'duration')
    assert.deepEqual(manifest.blockers, [])
    assert.deepEqual(Object.keys(manifest.sourceExports), ['durationSamples', 'rawCompletedTasks'])
    assert.equal(manifest.pipelineArgs.includes('--review-export'), false)
    assert.equal(manifest.pipelineArgs.includes('--duration-samples'), true)
    assert.equal(manifest.pipelineArgs.includes('--task-dependencies'), false)
    assert.equal(manifest.pipelineArgs.includes('--runtime-publications'), false)
    assert.equal(manifest.sourceExports.rawCompletedTasks.path.endsWith('raw-completed-tasks.json'), true)
    assert.equal(queries.some((query) => query.sql.includes('public."task_dependencies"')), false)
    assert.equal(queries.some((query) => query.sql.includes('public."wbs_template_runtime_publications"')), false)
    assert.equal(queries.some((query) => query.sql.includes('public."change_logs"')), false)
    const rawCompletedTasksQuery = queries.find((query) => query.sql.includes('public."tasks"'))
    assert.ok(rawCompletedTasksQuery, 'expected duration phase to query completed tasks')
    assert.equal(rawCompletedTasksQuery.sql.includes('SELECT *'), false)
    assert.match(rawCompletedTasksQuery.sql, /"id", "project_id", "title", "status", "standard_work_code", "actual_start_date", "actual_end_date", "updated_at", "created_at"/)
    assert.match(rawCompletedTasksQuery.sql, /"status" IN \(\$2, \$3, \$4, \$5, \$6\)/)
    assert.match(rawCompletedTasksQuery.sql, /"actual_start_date" IS NOT NULL/)
    assert.match(rawCompletedTasksQuery.sql, /"actual_end_date" IS NOT NULL/)
    assert.equal(rawCompletedTasksQuery.sql.trim().endsWith('LIMIT 200'), true)
    assert.deepEqual(rawCompletedTasksQuery.params, ['project-1', 'completed', 'complete', 'done', 'closed', 'finished'])

    await assert.rejects(
      readJson(path.join(outputRoot, 'source-exports-manifest.json')),
      /ENOENT/,
    )
    const writtenManifest = await readJson(path.join(outputRoot, 'source-exports-manifest.duration.json'))
    assert.equal(writtenManifest.phase, 'duration')
    const rawTasksExport = await readJson(path.join(outputRoot, 'raw-completed-tasks.json'))
    assert.equal(rawTasksExport.tasks.length, 1)
    await assert.rejects(
      readJson(path.join(outputRoot, 'task-dependencies-export.json')),
      /ENOENT/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('duration phase writes blocked source export when a DB source query times out', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-sources-'))
  const outputRoot = path.join(root, 'source-exports')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) {
      return columnsFor(params[1])
    }
    if (sql.includes('public."duration_experience_samples"')) return []
    if (sql.includes('public."tasks"')) throw new Error('Query read timeout')
    throw new Error(`unexpected SQL in duration phase: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const manifest = await exportDefaultMasterPlanProductionSources({
      outputRoot,
      phase: 'duration',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      publicationKey: '',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-01T09:05:00.000Z'),
    })

    assert.equal(manifest.status, 'blocked')
    assert.equal(manifest.blockers.includes('rawCompletedTasks:db_query_failed:Query read timeout'), true)
    assert.equal(manifest.sourceExports.rawCompletedTasks.rowCount, 0)

    const writtenManifest = await readJson(path.join(outputRoot, 'source-exports-manifest.duration.json'))
    assert.equal(writtenManifest.status, 'blocked')
    const rawTasksExport = await readJson(path.join(outputRoot, 'raw-completed-tasks.json'))
    assert.deepEqual(rawTasksExport.tasks, [])
    assert.equal(rawTasksExport.export_metadata.source, 'raw_completed_tasks')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function writeExportedDbSource(filePath, { source, table, rowArrayKey, rows }) {
  await writeJson(filePath, {
    schemaVersion: 'workbuddy-default-master-plan-source-export/v1',
    export_metadata: exportMetadataFixture({ source, sourceKind: 'database_table', table }),
    rows,
    [rowArrayKey]: rows,
  })
}

function exportMetadataFixture({ source, sourceKind, table = null, sourcePath = null }) {
  return {
    source,
    source_kind: sourceKind,
    table,
    source_path: sourcePath,
    exported_at: '2026-07-01T09:00:00.000Z',
    exported_by: 'release-user-1',
    export_session_id: 'default-master-plan-source-export:test-session',
    environment: 'staging',
    baseline_id: 'baseline-1',
    project_id: 'project-1',
    publication_key: 'publication-1',
    target: {
      envFileRef: 'server/.env',
      supabaseProjectRef: 'wwdrkjnbvcbfytwnnyvs',
      databaseHost: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      connectionSource: 'SUPABASE_MIGRATION_URL',
      readable: true,
    },
    mutation_boundary: {
      readsDatabase: sourceKind === 'database_table',
      readsSourceFile: sourceKind === 'source_file',
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

function fileEvidenceRef(kind, filePath) {
  const sha256 = createHash('sha256').update(readFileSync(filePath)).digest('hex')
  return `${kind}:${repoRelative(filePath)}#sha256=${sha256}`
}

function repoRelative(filePath) {
  return path.relative(path.resolve('project-testing/tools', '..', '..'), filePath).replace(/\\/g, '/')
}

function columnsFor(tableName) {
  const columns = {
    change_logs: ['id', 'field_name', 'entity_id', 'project_id', 'changed_at', 'after_snapshot'],
    duration_experience_samples: ['id', 'project_id', 'task_id', 'sample_status', 'included_in_benchmark', 'actual_duration_days', 'stable_code', 'created_at'],
    tasks: ['id', 'project_id', 'title', 'status', 'standard_work_code', 'actual_start_date', 'actual_end_date', 'updated_at', 'created_at'],
    task_dependencies: ['id', 'project_id', 'task_id', 'dependency_task_id', 'source_type', 'created_at'],
    wbs_template_runtime_publications: ['id', 'project_id', 'publication_key', 'accepted_baseline_id', 'runtime_publication_status', 'published_at'],
  }[tableName] ?? []
  return columns.map((column_name) => ({ column_name }))
}
