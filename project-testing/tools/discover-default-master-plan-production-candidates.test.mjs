import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildDiscoveryPgClientConfig,
  discoverDefaultMasterPlanProductionCandidates,
} from './discover-default-master-plan-production-candidates.mjs'

test('discovers candidate default master-plan baselines and reports production evidence gaps', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-1',
        project_id: 'project-1',
        status: 'draft',
        name: '住宅默认主计划候选',
        source_version_label: 'residential_master_plan_v2',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 60 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 1 }]
    if (sql.includes('FROM public."duration_experience_samples"') && sql.includes('included_in_benchmark')) return [{ count: 2 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 5 }]
    if (sql.includes('FROM public."task_dependencies"') && sql.includes('construction_organization_plan_network')) return [{ count: 0 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 3 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {
    queries.push({ sql: 'close', params: [] })
  }

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'candidates_found')
    assert.equal(report.candidateCount, 1)
    assert.equal(report.recommendedCandidate.baselineId, 'baseline-1')
    assert.equal(report.recommendedCandidate.evidenceReadiness.baselineItemCount, 60)
    assert.equal(report.recommendedCandidate.evidenceReadiness.gateStatus.projectManagerReview, undefined)
    assert.deepEqual(report.recommendedCandidate.offlineDevelopmentQualityReview, {
      status: 'not_evaluated_by_runtime_discovery',
      requiredForRuntime: false,
      intendedUse: 'offline_development_quality_review_and_template_calibration',
    })
    assert.equal(report.recommendedCandidate.evidenceReadiness.acceptedDurationSampleCount, 2)
    assert.deepEqual(report.recommendedCandidate.evidenceReadiness.blockers, [
      'construction_organization_task_dependencies_missing',
      'runtime_publication_missing',
    ])
    assert.match(report.nextAction.sourceExportCommand.join(' '), /--baseline-id baseline-1/)
    assert.match(report.nextAction.sourceExportCommand.join(' '), /--publication-key <publication-key>/)
    assert.equal(report.nextAction.sourceExportMode, 'supporting_non_production')
    assert.equal(report.nextAction.mayRunProductionEvidencePipeline, false)
    assert.doesNotMatch(report.nextAction.description, /pass its pipelineArgs to the production evidence pipeline/)
    assert.equal(report.mutationBoundary.writesTaskDependencies, false)
    assert.equal(queries.some((query) => query.sql.includes('FROM public."change_logs"')), false)
    assert.equal(queries.some((query) => /\b(?:INSERT|UPDATE|DELETE)\b/i.test(query.sql)), false)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(written.schemaVersion, 'workbuddy-default-master-plan-production-candidate-discovery/v1')
    assert.equal(written.recommendedCandidate.projectId, 'project-1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('builds discovery pg config with sslmode stripped so explicit TLS verifier policy is authoritative', () => {
  const config = buildDiscoveryPgClientConfig(
    'postgresql://workbuddy_runtime_login:secret@db.example.supabase.co:5432/postgres?sslmode=require&application_name=discovery',
    {},
  )

  assert.equal(config.connectionString.includes('sslmode='), false)
  assert.equal(config.connectionString.includes('application_name=discovery'), true)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
})

test('labels production candidate source export next action as production/live only for production environments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-production',
        project_id: 'project-1',
        status: 'draft',
        name: 'production candidate',
        source_version_label: 'managed_frontier_default_master_plan',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 1 }]
    if (sql.includes('FROM public."duration_experience_samples"') && sql.includes('included_in_benchmark')) return [{ count: 16 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 16 }]
    if (sql.includes('FROM public."task_dependencies"') && sql.includes('construction_organization_plan_network')) return [{ count: 21 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 21 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) {
      return runtimePublicationRows('runtime.default_master_plan.project-1')
    }
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) {
      return trustedConsumptionRows('runtime.default_master_plan.project-1')
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'candidates_found')
    assert.equal(report.nextAction.sourceExportMode, 'production_or_live')
    assert.equal(report.nextAction.mayRunProductionEvidencePipeline, true)
    assert.match(report.nextAction.description, /production\/live evidence pipeline/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('keeps an applicable publication distinct from missing trusted baseline consumption', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-publication-only',
        project_id: 'project-1',
        status: 'draft',
        name: 'publication without consumption',
        source_version_label: 'managed_frontier_default_master_plan',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 16 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 21 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) {
      return runtimePublicationRows('runtime.default_master_plan.project-1')
    }
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    const readiness = report.recommendedCandidate.evidenceReadiness
    assert.equal(readiness.runtimePublishedCount, 1)
    assert.equal(readiness.trustedRuntimeConsumptionCount, 0)
    assert.equal(readiness.blockers.includes('runtime_publication_missing'), false)
    assert.equal(readiness.blockers.includes('trusted_runtime_consumption_missing'), true)
    assert.equal(readiness.gateStatus.runtimePublication, 'blocked')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('recommends the latest publication trusted-consumed by the baseline instead of a newer publication-only row', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const newerPublicationKey = 'runtime.default_master_plan.project-1.v2'
  const consumedPublicationKey = 'runtime.default_master_plan.project-1.v1'
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-exact-publication-pair',
        project_id: 'project-1',
        status: 'draft',
        name: 'exact publication pair',
        source_version_label: 'managed_frontier_default_master_plan',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 16 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 21 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) {
      return [
        {
          ...runtimePublicationRows(newerPublicationKey)[0],
          artifact_key: 'facade-v4',
          published_at: '2026-07-02T00:45:00.000Z',
        },
        {
          ...runtimePublicationRows(consumedPublicationKey)[0],
          published_at: '2026-07-01T00:45:00.000Z',
        },
      ]
    }
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) {
      return trustedConsumptionRows(consumedPublicationKey)
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      environment: 'production',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    const readiness = report.recommendedCandidate.evidenceReadiness
    const command = report.recommendedCandidate.suggestedSourceExportCommand.join(' ')
    assert.equal(readiness.runtimePublishedCount, 2)
    assert.equal(readiness.trustedRuntimeConsumptionCount, 1)
    assert.equal(readiness.gateStatus.runtimePublication, 'pass')
    assert.equal(readiness.latestPublicationKey, consumedPublicationKey)
    assert.match(command, new RegExp(`--publication-key ${consumedPublicationKey}`))
    assert.doesNotMatch(command, new RegExp(`--publication-key ${newerPublicationKey}`))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects physically joined consumptions without resolver authority and an exact publication ref', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const publicationKey = 'runtime.default_master_plan.project-1'
  let consumptionSql = ''
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-untrusted-consumption',
        project_id: 'project-1',
        status: 'draft',
        name: 'untrusted consumption',
        source_version_label: 'managed_frontier_default_master_plan',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 16 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 21 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) {
      return runtimePublicationRows(publicationKey)
    }
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) {
      consumptionSql = sql
      return [
        {
          ...trustedConsumptionRows(publicationKey)[0],
          consumption_key: 'missing-authority',
          consumption_context: { authoritySource: 'user_metadata' },
        },
        {
          ...trustedConsumptionRows(publicationKey)[0],
          consumption_key: 'missing-exact-ref',
          source_evidence_refs: ['duration_learning_runtime_publications:another-publication'],
        },
      ]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    const readiness = report.recommendedCandidate.evidenceReadiness
    const command = report.recommendedCandidate.suggestedSourceExportCommand.join(' ')
    assert.equal(readiness.runtimePublishedCount, 1)
    assert.equal(readiness.trustedRuntimeConsumptionCount, 0)
    assert.equal(readiness.gateStatus.runtimePublication, 'blocked')
    assert.equal(readiness.blockers.includes('trusted_runtime_consumption_missing'), true)
    assert.equal(readiness.latestPublicationKey, '')
    assert.match(command, /--publication-key <publication-key>/)
    assert.match(consumptionSql, /authoritySource.*runtime_resolver_publication_set/s)
    assert.match(consumptionSql, /source_evidence_refs.*duration_learning_runtime_publications:/s)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('carries candidate export hygiene blockers into the recommended candidate readiness', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const candidateHygiene = path.join(root, 'candidate-export-hygiene.json')
  await writeFile(candidateHygiene, `${JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    status: 'blocked',
    productionReady: false,
    currentCandidate: {
      baselineId: 'baseline-school-16',
      projectId: 'project-school',
      rowCount: 16,
      businessType: 'school',
    },
    blockers: ['selected_candidate_export_profile_shape_mismatch'],
    profileComparison: {
      status: 'mismatch',
      businessType: 'school',
      candidateRowCount: 16,
      profileScheduleRowCount: 18,
      missingProfileRowCount: 2,
    },
  }, null, 2)}\n`, 'utf8')

  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-school-16',
        project_id: 'project-school',
        status: 'draft',
        name: '学校默认主计划候选',
        source_version_label: 'managed_frontier_default_master_plan',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 1 }]
    if (sql.includes('FROM public."duration_experience_samples"') && sql.includes('included_in_benchmark')) return [{ count: 16 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 16 }]
    if (sql.includes('FROM public."task_dependencies"') && sql.includes('construction_organization_plan_network')) return [{ count: 21 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 21 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) {
      return runtimePublicationRows('runtime.default_master_plan.project-school')
    }
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) {
      return trustedConsumptionRows('runtime.default_master_plan.project-school')
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-school',
      environment: 'staging',
      exportedBy: 'release-user-1',
      candidateHygiene,
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'candidates_found')
    assert.equal(report.recommendedCandidate.baselineId, 'baseline-school-16')
    assert.equal(
      report.recommendedCandidate.evidenceReadiness.blockers.includes('selected_candidate_export_profile_shape_mismatch'),
      true,
    )
    assert.equal(report.recommendedCandidate.evidenceReadiness.candidateHygiene.status, 'blocked')
    assert.equal(report.nextAction.blockedBy.includes('selected_candidate_export_profile_shape_mismatch'), true)
    assert.equal(report.candidateHygiene.status, 'blocked')
    assert.equal(report.candidateHygiene.artifact.endsWith('candidate-export-hygiene.json'), true)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(
      written.recommendedCandidate.evidenceReadiness.blockers.includes('selected_candidate_export_profile_shape_mismatch'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('records the selected environment target without exposing secrets', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const envFile = path.join(root, 'staging.env')
  await writeFile(envFile, [
    'SUPABASE_URL=https://wwdrkjnbvcbfytwnnyvs.supabase.co',
    'DB_CONNECTION_STRING=postgresql://postgres:secret@db.wwdrkjnbvcbfytwnnyvs.supabase.co:5432/postgres',
    '',
  ].join('\n'), 'utf8')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      envFile,
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.target.supabaseProjectRef, 'wwdrkjnbvcbfytwnnyvs')
    assert.equal(report.target.databaseHost, 'db.wwdrkjnbvcbfytwnnyvs.supabase.co')
    assert.equal(report.target.connectionSource, 'DB_CONNECTION_STRING')
    assert.match(report.target.envFileRef, /workbuddy-default-master-plan-discovery-/)
    assert.doesNotMatch(JSON.stringify(report.target), /secret/)

    const written = JSON.parse(await readFile(output, 'utf8'))
    assert.deepEqual(written.target, report.target)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('counts candidate baseline items through baseline_version_id when legacy baseline_id is absent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queries = []
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('information_schema.columns')) return columnsForBaselineVersionOnly(params[1])
    if (sql.includes('FROM public.task_baselines')) {
      return [{
        id: 'baseline-versioned',
        project_id: 'project-1',
        status: 'draft',
        name: '学校默认主计划候选',
        source_version_label: 'managed_frontier_default_master_plan',
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      }]
    }
    if (sql.includes('FROM public."task_baseline_items"')) {
      assert.match(sql, /"baseline_version_id" = \$1/)
      return [{ count: 49 }]
    }
    if (sql.includes('FROM public."change_logs"')) return [{ count: 0 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 0 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 0 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {
    queries.push({ sql: 'close', params: [] })
  }

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'candidates_found')
    assert.equal(report.recommendedCandidate.baselineId, 'baseline-versioned')
    assert.equal(report.recommendedCandidate.evidenceReadiness.baselineItemCount, 49)
    assert.equal(report.recommendedCandidate.evidenceReadiness.gateStatus.candidateBaselineItems, 'pass')
    assert.equal(
      report.recommendedCandidate.evidenceReadiness.blockers.includes('candidate_baseline_items_missing'),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not issue concurrent queries against a single database client', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  let activeQuery = false
  const queryExec = async (sql, params = []) => {
    assert.equal(activeQuery, false, `concurrent query detected: ${sql}`)
    activeQuery = true
    try {
      await new Promise((resolve) => setTimeout(resolve, 2))
      if (sql.includes('information_schema.columns')) return columnsFor(params[1])
      if (sql.includes('FROM public.task_baselines')) {
        return [{
          id: 'baseline-serial',
          project_id: 'project-serial',
          status: 'draft',
          name: '学校默认主计划候选',
          source_version_label: 'managed_frontier_default_master_plan',
          created_at: '2026-07-01T08:00:00.000Z',
          updated_at: '2026-07-01T08:10:00.000Z',
        }]
      }
      if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
      if (sql.includes('FROM public."change_logs"')) return [{ count: 0 }]
      if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 0 }]
      if (sql.includes('FROM public."task_dependencies"')) return [{ count: 0 }]
      if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
      if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
      throw new Error(`unexpected SQL: ${sql}`)
    } finally {
      activeQuery = false
    }
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-serial',
      environment: 'staging',
      exportedBy: 'release-user-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'candidates_found')
    assert.equal(report.recommendedCandidate.evidenceReadiness.baselineItemCount, 16)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('blocks when no candidate default master-plan baseline exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) return [{
      id: 'baseline-ordinary',
      project_id: 'project-1',
      source_version_label: 'ordinary_template',
    }]
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.deepEqual(report.blockers, ['candidate_default_master_plan_baseline_not_found'])
    assert.equal(report.nextAction, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not discover legacy baselines that only carry candidate boolean metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const retiredLabel = ['legacy', 'template', 'serial', 'fallback'].join('_')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsForWithMetadata(params[1])
    if (sql.includes('FROM public.task_baselines')) return [{
      id: 'baseline-legacy-boolean',
      project_id: 'project-1',
      status: 'draft',
      name: '旧模板候选',
      source_version_label: retiredLabel,
      generation_metadata: {
        candidate_default_master_plan_baseline: true,
        candidateOnly: true,
      },
      created_at: '2026-07-01T08:00:00.000Z',
      updated_at: '2026-07-01T08:10:00.000Z',
    }]
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.equal(report.recommendedCandidate, null)
    assert.deepEqual(report.blockers, [
      'candidate_default_master_plan_baseline_not_found',
      'candidate_default_master_plan_candidates_disqualified',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed instead of recommending low-information or manual-comparison default-plan drafts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsForWithMetadata(params[1])
    if (sql.includes('FROM public.task_baselines')) return [
      {
        id: 'baseline-low-info',
        project_id: 'project-1',
        status: 'draft',
        name: '低信息模板草稿',
        source_version_label: 'managed_frontier_default_master_plan',
        generation_metadata: {
          source: 'low_information_template_draft',
          candidate_default_master_plan_baseline: true,
        },
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      },
      {
        id: 'baseline-manual-comparison',
        project_id: 'project-1',
        status: 'draft',
        name: '人工对照场景',
        source_version_label: 'managed_frontier_default_master_plan',
        generation_metadata: {
          source: 'manual_comparison_scenario',
          candidate_default_master_plan_baseline: true,
        },
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:11:00.000Z',
      },
    ]
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.equal(report.recommendedCandidate, null)
    assert.equal(report.disqualifiedCandidateCount, 2)
    assert.deepEqual(report.disqualifiedCandidates.map((candidate) => candidate.baselineId), [
      'baseline-low-info',
      'baseline-manual-comparison',
    ])
    assert.match(report.blockers.join('\n'), /candidate_default_master_plan_baseline_not_found/)
    assert.match(report.blockers.join('\n'), /candidate_default_master_plan_candidates_disqualified/)
    assert.match(
      report.disqualifiedCandidates.flatMap((candidate) => candidate.reasons).join('\n'),
      /retired_or_low_information_default_master_plan_source/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed when managed-frontier rows carry hidden legacy handoff or degradation markers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsForWithMetadata(params[1])
    if (sql.includes('FROM public.task_baselines')) return [
      {
        id: 'baseline-hidden-legacy',
        project_id: 'project-1',
        status: 'draft',
        name: '隐藏旧路径标记',
        source_version_label: 'managed_frontier_default_master_plan',
        generation_metadata: {
          generationMode: 'managed_frontier_default_master_plan',
          handoffGenerationMode: 'legacy_template_serial_fallback',
          controlledDegradation: 'low_information_template_draft',
          fallbackApplied: true,
          scenarioType: 'human_comparison_scenario',
          candidate_default_master_plan_baseline: true,
        },
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      },
    ]
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 16 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 0 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 0 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 0 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.equal(report.recommendedCandidate, null)
    assert.equal(report.disqualifiedCandidateCount, 1)
    assert.deepEqual(report.disqualifiedCandidates[0].reasons, [
      'retired_or_low_information_default_master_plan_source',
    ])
    assert.equal(
      report.disqualifiedCandidates[0].sourceLabels.includes('legacy_template_serial_fallback'),
      true,
    )
    assert.equal(
      report.disqualifiedCandidates[0].sourceLabels.includes('human_comparison_scenario'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed when baseline items hide option-comparison package markers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsForWithMetadata(params[1])
    if (sql.includes('FROM public.task_baselines')) return [
      {
        id: 'baseline-hidden-option-comparison',
        project_id: 'project-1',
        status: 'draft',
        name: '表面合格但行内隐藏方案比选来源',
        source_version_label: 'managed_frontier_default_master_plan',
        generation_metadata: {
          generationMode: 'managed_frontier_default_master_plan',
          candidate_default_master_plan_baseline: true,
        },
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      },
    ]
    if (sql.includes('SELECT generation_metadata') && sql.includes('FROM public."task_baseline_items"')) return [
      {
        generation_metadata: {
          source: 'managed_frontier_default_master_plan',
          candidateOnly: true,
          scenarioType: 'construction_organization_plan_option_comparison_package',
          durationSuggestion: { planReferenceDays: 30 },
        },
      },
      {
        generation_metadata: {
          source: 'managed_frontier_default_master_plan',
          candidateOnly: true,
          comparisonScenario: 'construction_organization_plan_network_option_comparison_package',
          durationSuggestion: { planReferenceDays: 20 },
        },
      },
    ]
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 2 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 0 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 0 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 0 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.equal(report.recommendedCandidate, null)
    assert.equal(report.disqualifiedCandidateCount, 1)
    assert.equal(report.disqualifiedCandidates[0].baselineId, 'baseline-hidden-option-comparison')
    assert.deepEqual(report.disqualifiedCandidates[0].reasons, [
      'retired_or_low_information_default_master_plan_source',
    ])
    assert.equal(
      report.disqualifiedCandidates[0].sourceLabels.includes('construction_organization_plan_option_comparison_package'),
      true,
    )
    assert.equal(
      report.disqualifiedCandidates[0].sourceLabels.includes('construction_organization_plan_network_option_comparison_package'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails closed when baseline items hide retired original source lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsForWithMetadata(params[1])
    if (sql.includes('FROM public.task_baselines')) return [
      {
        id: 'baseline-hidden-original-source',
        project_id: 'project-1',
        status: 'draft',
        name: '表面合格但行内隐藏原始旧来源',
        source_version_label: 'managed_frontier_default_master_plan',
        generation_metadata: {
          generationMode: 'managed_frontier_default_master_plan',
          candidate_default_master_plan_baseline: true,
        },
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:00:00.000Z',
      },
    ]
    if (sql.includes('SELECT generation_metadata') && sql.includes('FROM public."task_baseline_items"')) return [
      {
        generation_metadata: {
          source: 'managed_frontier_default_master_plan',
          originalSource: 'manual_comparison_scenario',
          candidateOnly: true,
          durationSuggestion: { planReferenceDays: 30 },
        },
      },
    ]
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 1 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 0 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 0 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 0 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.equal(report.recommendedCandidate, null)
    assert.equal(report.disqualifiedCandidateCount, 1)
    assert.equal(report.disqualifiedCandidates[0].baselineId, 'baseline-hidden-original-source')
    assert.deepEqual(report.disqualifiedCandidates[0].reasons, [
      'retired_or_low_information_default_master_plan_source',
    ])
    assert.equal(
      report.disqualifiedCandidates[0].sourceLabels.includes('manual_comparison_scenario'),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not disqualify managed-frontier baselines whose item source is allowed profile lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsForWithMetadata(params[1])
    if (sql.includes('FROM public.task_baselines')) return [
      {
        id: 'baseline-profile-lineage',
        project_id: 'project-1',
        status: 'draft',
        name: 'profile lineage 合法候选',
        source_version_label: 'managed_frontier_default_master_plan',
        generation_metadata: {
          generationMode: 'managed_frontier_default_master_plan',
          candidate_default_master_plan_baseline: true,
        },
        created_at: '2026-07-01T08:00:00.000Z',
        updated_at: '2026-07-01T08:10:00.000Z',
      },
    ]
    if (sql.includes('SELECT generation_metadata') && sql.includes('FROM public."task_baseline_items"')) return [
      {
        generation_metadata: {
          source: 'business_type_base_master_plan_profile_v1',
          businessTypeMasterPlan: {
            profileSourceType: 'business_type_master_plan_profile_v1',
          },
          candidateOnly: true,
          durationSuggestion: { planReferenceDays: 30 },
        },
      },
    ]
    if (sql.includes('FROM public."task_baseline_items"')) return [{ count: 1 }]
    if (sql.includes('FROM public."change_logs"')) return [{ count: 0 }]
    if (sql.includes('FROM public."duration_experience_samples"')) return [{ count: 0 }]
    if (sql.includes('FROM public."task_dependencies"')) return [{ count: 0 }]
    if (sql.includes('FROM public.duration_learning_runtime_publications publication')) return []
    if (sql.includes('FROM public.duration_learning_runtime_consumptions consumption')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'candidates_found')
    assert.equal(report.candidateCount, 1)
    assert.equal(report.recommendedCandidate.baselineId, 'baseline-profile-lineage')
    assert.equal(report.disqualifiedCandidateCount, 0)
    assert.deepEqual(report.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('reports requested baseline not found separately from candidate source filtering', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-discovery-'))
  const output = path.join(root, 'candidate-discovery.json')
  const queryExec = async (sql, params = []) => {
    if (sql.includes('information_schema.columns')) return columnsFor(params[1])
    if (sql.includes('FROM public.task_baselines')) return []
    throw new Error(`unexpected SQL: ${sql}`)
  }
  queryExec.close = async () => {}

  try {
    const report = await discoverDefaultMasterPlanProductionCandidates({
      output,
      projectId: 'project-1',
      baselineId: 'missing-baseline-1',
      queryExec,
      now: new Date('2026-07-02T01:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.candidateCount, 0)
    assert.deepEqual(report.blockers, [
      'requested_baseline_not_found',
      'candidate_default_master_plan_baseline_not_found',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function columnsFor(tableName) {
  const columns = {
    task_baselines: ['id', 'project_id', 'status', 'name', 'source_version_label', 'created_at', 'updated_at'],
    task_baseline_items: ['id', 'project_id', 'baseline_id', 'baseline_version_id', 'source_task_id'],
    change_logs: ['id', 'field_name', 'entity_id', 'project_id'],
    duration_experience_samples: ['id', 'project_id', 'sample_status', 'included_in_benchmark', 'actual_duration_days'],
    task_dependencies: ['id', 'project_id', 'source_type'],
    projects: ['id', 'company_id'],
    duration_learning_runtime_publications: canonicalPublicationColumns(),
    duration_learning_runtime_consumptions: canonicalConsumptionColumns(),
  }[tableName] ?? []
  return columns.map((column_name) => ({ column_name }))
}

function columnsForBaselineVersionOnly(tableName) {
  const columns = {
    task_baselines: ['id', 'project_id', 'status', 'name', 'source_version_label', 'created_at', 'updated_at'],
    task_baseline_items: ['id', 'project_id', 'baseline_version_id', 'source_task_id'],
    change_logs: ['id', 'field_name', 'entity_id', 'project_id'],
    duration_experience_samples: ['id', 'project_id', 'sample_status', 'included_in_benchmark', 'actual_duration_days'],
    task_dependencies: ['id', 'project_id', 'source_type'],
    projects: ['id', 'company_id'],
    duration_learning_runtime_publications: canonicalPublicationColumns(),
    duration_learning_runtime_consumptions: canonicalConsumptionColumns(),
  }[tableName] ?? []
  return columns.map((column_name) => ({ column_name }))
}

function columnsForWithMetadata(tableName) {
  const columns = {
    task_baselines: ['id', 'project_id', 'status', 'name', 'source_version_label', 'generation_metadata', 'created_at', 'updated_at'],
    task_baseline_items: ['id', 'project_id', 'baseline_id', 'baseline_version_id', 'source_task_id', 'generation_metadata'],
    change_logs: ['id', 'field_name', 'entity_id', 'project_id'],
    duration_experience_samples: ['id', 'project_id', 'sample_status', 'included_in_benchmark', 'actual_duration_days'],
    task_dependencies: ['id', 'project_id', 'source_type'],
    projects: ['id', 'company_id'],
    duration_learning_runtime_publications: canonicalPublicationColumns(),
    duration_learning_runtime_consumptions: canonicalConsumptionColumns(),
  }[tableName] ?? []
  return columns.map((column_name) => ({ column_name }))
}

function canonicalPublicationColumns() {
  return [
    'publication_key', 'asset_key', 'artifact_key', 'scope_level', 'company_id',
    'project_id', 'industry_key', 'publication_stage', 'monitoring_status', 'published_at',
  ]
}

function canonicalConsumptionColumns() {
  return [
    'consumption_key', 'publication_key', 'asset_key', 'artifact_key', 'company_id',
    'project_id', 'consumer_surface', 'task_id', 'baseline_item_id', 'consumption_context',
    'duration_day_basis', 'source_evidence_refs', 'consumed_at',
  ]
}

function runtimePublicationRows(publicationKey) {
  return [{
    publication_key: publicationKey,
    asset_key: 'wbs_reference_days',
    artifact_key: 'facade-v3',
    publication_stage: 'stable',
    monitoring_status: 'passed',
  }]
}

function trustedConsumptionRows(publicationKey) {
  return [{
    publication_key: publicationKey,
    asset_key: 'wbs_reference_days',
    artifact_key: 'facade-v3',
    consumption_key: `duration-learning-consumption:${publicationKey}`,
    consumer_surface: 'baseline_commit',
    consumption_context: { authoritySource: 'runtime_resolver_publication_set' },
    source_evidence_refs: [`duration_learning_runtime_publications:${publicationKey}`],
    consumed_at: '2026-07-02T00:30:00.000Z',
  }]
}
