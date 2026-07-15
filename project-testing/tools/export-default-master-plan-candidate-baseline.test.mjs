import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  exportDefaultMasterPlanCandidateBaseline,
  exportDefaultMasterPlanCandidateBaselineFromDb,
  isCliEntry,
  normalizeExistingCandidateBaselineExport,
  parseArgs,
} from './export-default-master-plan-candidate-baseline.mjs'

test('exports candidate default master-plan baseline rows with reference duration evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const outputRoot = path.join(root, 'reports')
  const calls = []
  const fetchFn = async (url, options = {}) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          success: true,
          data: {
            id: 'baseline-1',
            project_id: 'project-1',
            source_version_label: 'managed_frontier_default_master_plan',
            status: 'draft',
            title: '学校项目基线',
            summary: { total_items: 2, duration_days: 90 },
            items: [
              candidateItem({
                id: 'item-1',
                code: 'BTMP-BASE-01',
                title: '施工准备与现场临设完成',
                planReferenceDays: 30,
                source: 'managed_frontier_default_master_plan',
                profileSourceType: 'business_type_base_master_plan_profile_v1',
              }),
              candidateItem({
                id: 'item-2',
                code: 'BTMP-SCH-01',
                title: '教学楼主体结构与功能区移交',
                planReferenceDays: 60,
                source: 'managed_frontier_default_master_plan',
                profileSourceType: 'business_type_master_plan_profile_v1',
              }),
            ],
          },
        }
      },
    }
  }

  try {
    const report = await exportDefaultMasterPlanCandidateBaseline({
      baseUrl: 'http://127.0.0.1:3101',
      baselineId: 'baseline-1',
      projectId: 'project-1',
      companyId: 'company-1',
      outputRoot,
      label: 'school-items',
      exportedBy: 'test-user',
      fetchFn,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.baselineId, 'baseline-1')
    assert.equal(report.status, 'draft')
    assert.equal(report.productionCandidateEligible, true)
    assert.equal(report.rowCount, 2)
    assert.equal(report.quality.rowsMissingReferenceDuration, 0)
    assert.deepEqual(report.quality.sourceLabels, [
      'managed_frontier_default_master_plan',
    ])
    assert.deepEqual(report.quality.profileSourceLabels, [
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ])
    assert.equal(report.mutationBoundary.readsApi, true)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.rows[0].smartReferenceDays, 30)
    assert.equal(report.rows[1].durationOutputCode, 'plan_reference')
    assert.match(calls[0].url, /\/api\/task-baselines\/baseline-1\?project_id=project-1$/)
    assert.equal(calls[0].options.headers['x-company-id'], 'company-1')

    const json = JSON.parse(await readFile(path.join(outputRoot, 'candidate-baseline-baseline-1-school-items.json'), 'utf8'))
    assert.equal(json.schemaVersion, 'workbuddy-default-master-plan-candidate-baseline-export/v1')
    assert.equal(json.rows[0].title, '施工准备与现场临设完成')

    const markdown = await readFile(path.join(outputRoot, 'candidate-baseline-baseline-1-school-items.md'), 'utf8')
    assert.match(markdown, /rowsMissingReferenceDuration: 0/)
    assert.match(markdown, /BTMP-SCH-01/)
    assert.doesNotMatch(markdown, /undefined/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('exports candidate default master-plan baseline rows directly from database without API auth', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-db-export-'))
  const outputRoot = path.join(root, 'reports')
  const queries = []
  let ended = false
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params })
      if (String(sql).includes('FROM public.task_baselines')) {
        return {
          rows: [
            {
              id: 'baseline-db-1',
              project_id: 'project-db-1',
              source_version_label: 'managed_frontier_default_master_plan',
              status: 'draft',
              title: '??????',
            },
          ],
        }
      }
      if (String(sql).includes('FROM public.task_baseline_items')) {
        return {
          rows: [
            {
              ...candidateItem({
                plannedStartDate: new Date(2026, 7, 1),
                plannedEndDate: new Date(2026, 8, 29),
                id: 'item-db-2',
                code: 'BTMP-SCH-01',
                title: '?????????????',
                planReferenceDays: 60,
                source: 'managed_frontier_default_master_plan',
                profileSourceType: 'business_type_master_plan_profile_v1',
                clientRowId: 'generated:school:BTMP-SCH-01',
                predecessorDependencies: [{
                  clientRowId: 'generated:school:BTMP-BASE-01',
                  dependencyType: 'FS',
                  lagDays: 0,
                  intentCode: 'business_type_master_plan_profile_sequence',
                }],
              }),
              sort_order: 2,
            },
            {
              ...candidateItem({
                plannedStartDate: new Date(2026, 6, 1),
                plannedEndDate: new Date(2026, 6, 30),
                id: 'item-db-1',
                code: 'BTMP-BASE-01',
                title: '???????????',
                planReferenceDays: 30,
                source: 'managed_frontier_default_master_plan',
                profileSourceType: 'business_type_base_master_plan_profile_v1',
              }),
              sort_order: 1,
            },
          ],
        }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
    async end() {
      ended = true
    },
  }

  try {
    const report = await exportDefaultMasterPlanCandidateBaselineFromDb({
      baselineId: 'baseline-db-1',
      projectId: 'project-db-1',
      outputRoot,
      label: 'school-items',
      exportedBy: 'test-user',
      dbClientFactory: async () => client,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.source, 'export-default-master-plan-candidate-baseline-db')
    assert.equal(report.baselineId, 'baseline-db-1')
    assert.equal(report.status, 'draft')
    assert.equal(report.productionCandidateEligible, true)
    assert.equal(report.rowCount, 2)
    assert.equal(report.rows[0].standardWorkCode, 'BTMP-BASE-01')
    assert.equal(report.rows[0].plannedStart, '2026-07-01')
    assert.equal(report.rows[0].plannedEnd, '2026-07-30')
    assert.equal(report.rows[1].standardWorkCode, 'BTMP-SCH-01')
    assert.equal(report.rows[1].clientRowId, 'generated:school:BTMP-SCH-01')
    assert.deepEqual(report.rows[1].predecessorDependencies, [{
      clientRowId: 'generated:school:BTMP-BASE-01',
      dependencyType: 'FS',
      lagDays: 0,
      intentCode: 'business_type_master_plan_profile_sequence',
    }])
    assert.equal(report.quality.rowsMissingReferenceDuration, 0)
    assert.equal(report.mutationBoundary.readsDatabase, true)
    assert.equal(report.mutationBoundary.readsApi, false)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.writesTaskBaselineItems, false)
    assert.equal(ended, true)
    assert.equal(queries.length, 2)
    assert.match(queries[0].sql, /FROM public\.task_baselines/)
    assert.deepEqual(queries[0].params, ['baseline-db-1', 'project-db-1'])
    assert.match(queries[1].sql, /FROM public\.task_baseline_items/)

    const json = JSON.parse(await readFile(path.join(outputRoot, 'candidate-baseline-baseline-db-1-school-items.json'), 'utf8'))
    assert.equal(json.rowCount, 2)
    assert.equal(json.mutationBoundary.readsDatabase, true)

    const markdown = await readFile(path.join(outputRoot, 'candidate-baseline-baseline-db-1-school-items.md'), 'utf8')
    assert.match(markdown, /readsDatabase=true/)
    assert.match(markdown, /writesProductionTables=false/)
    assert.doesNotMatch(markdown, /readsApi=true, writesProductionTables=false, writesTasks=false, writesTaskDependencies=false/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('parses DB source options for candidate baseline export', () => {
  const options = parseArgs([
    '--source', 'db',
    '--env-file', 'server/.env',
    '--baseline-id', 'baseline-db-1',
    '--project-id', 'project-db-1',
    '--label', 'school-items',
  ])

  assert.equal(options.source, 'db')
  assert.match(options.envFile, /server[\\/]\.env$/)
  assert.equal(options.baselineId, 'baseline-db-1')
  assert.equal(options.projectId, 'project-db-1')
  assert.equal(options.label, 'school-items')
})

test('builds DB export TLS config with sslmode removed so the explicit verifier policy controls the connection', async () => {
  const module = await import('./export-default-master-plan-candidate-baseline.mjs')
  assert.equal(typeof module.buildCandidateBaselineExportPgClientConfig, 'function')

  const config = module.buildCandidateBaselineExportPgClientConfig(
    'postgres://runtime:secret@db.example.supabase.co:5432/postgres?sslmode=require&application_name=workbuddy',
    { PGSSLMODE: 'require' },
  )

  assert.equal(config.connectionString.includes('sslmode='), false)
  assert.equal(config.connectionString.includes('application_name=workbuddy'), true)
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  assert.equal(config.connectionTimeoutMillis, 12000)
  assert.equal(config.query_timeout, 30000)
  assert.equal(config.statement_timeout, 30000)
})

test('fails candidate baseline export when rows come from retired or low-information sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const outputRoot = path.join(root, 'reports')
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: {
          id: 'baseline-legacy',
          project_id: 'project-1',
          source_version_label: 'managed_frontier_default_master_plan',
          status: 'draft',
          title: '旧来源候选基线',
          summary: { total_items: 3, duration_days: 90 },
          items: [
            candidateItem({
              id: 'item-legacy',
              code: 'BTMP-OLD-01',
              title: '旧模板反推施工准备',
              planReferenceDays: 30,
              source: 'legacy_template_reverse_inference',
            }),
            candidateItem({
              id: 'item-low-info',
              code: 'BTMP-LOW-01',
              title: '低信息模板草稿',
              planReferenceDays: 20,
              source: 'low_information_template_draft',
            }),
            candidateItem({
              id: 'item-manual',
              code: 'BTMP-MAN-01',
              title: '人工对照场景',
              planReferenceDays: 40,
              source: 'manual_comparison_scenario',
            }),
          ],
        },
      }
    },
  })

  try {
    const report = await exportDefaultMasterPlanCandidateBaseline({
      baselineId: 'baseline-legacy',
      projectId: 'project-1',
      outputRoot,
      exportedBy: 'test-user',
      fetchFn,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionCandidateEligible, false)
    assert.equal(report.quality.retiredOrLowInformationSourceRowCount, 3)
    assert.equal(report.quality.blockedSourceLabels.includes('legacy_template_reverse_inference'), true)
    assert.equal(report.quality.blockedSourceLabels.includes('low_information_template_draft'), true)
    assert.equal(report.quality.blockedSourceLabels.includes('manual_comparison_scenario'), true)
    assert.match(report.blockers.join('\n'), /candidate_baseline_contains_retired_or_low_information_sources/)

    const json = JSON.parse(await readFile(path.join(outputRoot, 'candidate-baseline-baseline-legacy-items.json'), 'utf8'))
    assert.equal(json.status, 'blocked')
    assert.equal(json.productionCandidateEligible, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizes allowed profile labels from row source into lineage before PM review', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const outputRoot = path.join(root, 'reports')
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: {
          id: 'baseline-profile-source',
          project_id: 'project-1',
          source_version_label: 'managed_frontier_default_master_plan',
          status: 'draft',
          title: '旧 profile source 候选基线',
          summary: { total_items: 2, duration_days: 90 },
          items: [
            candidateItem({
              id: 'item-base-profile-source',
              code: 'BTMP-BASE-01',
              title: '施工准备与现场临设完成',
              planReferenceDays: 30,
              source: 'business_type_base_master_plan_profile_v1',
            }),
            candidateItem({
              id: 'item-profile-source',
              code: 'BTMP-SCH-01',
              title: '教学楼主体结构与功能区移交',
              planReferenceDays: 60,
              source: 'business_type_master_plan_profile_v1',
            }),
          ],
        },
      }
    },
  })

  try {
    const report = await exportDefaultMasterPlanCandidateBaseline({
      baselineId: 'baseline-profile-source',
      projectId: 'project-1',
      outputRoot,
      fetchFn,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'draft')
    assert.equal(report.productionCandidateEligible, true)
    assert.deepEqual(report.quality.sourceLabels, ['managed_frontier_default_master_plan'])
    assert.deepEqual(report.quality.profileSourceLabels, [
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ])
    assert.equal(report.rows[0].source, 'managed_frontier_default_master_plan')
    assert.equal(report.rows[0].profileSourceType, 'business_type_base_master_plan_profile_v1')
    assert.equal(report.rows[0].originalSource, 'business_type_base_master_plan_profile_v1')
    assert.deepEqual(report.blockers, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizes an existing candidate baseline export that still exposes profile labels as row sources', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const input = path.join(root, 'candidate-baseline-old.json')
  const outputRoot = path.join(root, 'reports')

  await writeJson(input, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    generatedAt: '2026-07-01T19:30:12.711Z',
    source: 'export-default-master-plan-candidate-baseline',
    exportedBy: 'old-exporter',
    baselineId: 'baseline-profile-source',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    title: '旧 profile source 候选基线',
    rowCount: 2,
    summary: { total_items: 2, duration_days: 90 },
    quality: {
      rowsMissingReferenceDuration: 0,
      rowsNotCandidateOnly: 0,
      rowsWritingTasks: 0,
      rowsWritingTaskDependencies: 0,
      sourceLabels: [
        'business_type_base_master_plan_profile_v1',
        'business_type_master_plan_profile_v1',
      ],
    },
    rows: [
      {
        index: 1,
        id: 'item-base-profile-source',
        title: '施工准备与现场临设完成',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        standardWorkCode: 'BTMP-BASE-01',
        source: 'business_type_base_master_plan_profile_v1',
        smartReferenceDays: 30,
        durationOutputCode: 'plan_reference',
        durationEvidence: 'candidate_default_master_plan_baseline',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        predecessorCount: 0,
      },
      {
        index: 2,
        id: 'item-profile-source',
        title: '教学楼主体结构与功能区移交',
        plannedStart: '2026-08-01',
        plannedEnd: '2026-09-29',
        standardWorkCode: 'BTMP-SCH-01',
        source: 'business_type_master_plan_profile_v1',
        smartReferenceDays: 60,
        durationOutputCode: 'plan_reference',
        durationEvidence: 'candidate_default_master_plan_baseline',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        predecessorCount: 1,
      },
    ],
    mutationBoundary: {
      readsApi: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
    },
  })

  try {
    const report = await normalizeExistingCandidateBaselineExport({
      input,
      outputRoot,
      exportedBy: 'normalizer-1',
      now: new Date('2026-07-02T03:00:00.000Z'),
    })

    assert.equal(report.status, 'draft')
    assert.equal(report.productionCandidateEligible, true)
    assert.deepEqual(report.quality.sourceLabels, ['managed_frontier_default_master_plan'])
    assert.deepEqual(report.quality.profileSourceLabels, [
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ])
    assert.equal(report.rows[0].source, 'managed_frontier_default_master_plan')
    assert.equal(report.rows[0].originalSource, 'business_type_base_master_plan_profile_v1')
    assert.equal(report.rows[0].profileSourceType, 'business_type_base_master_plan_profile_v1')
    assert.equal(report.mutationBoundary.readsExistingCandidateBaselineExport, true)
    assert.equal(report.mutationBoundary.readsApi, false)

    const json = JSON.parse(await readFile(path.join(outputRoot, 'candidate-baseline-baseline-profile-source-items.json'), 'utf8'))
    assert.equal(json.source, 'normalize-existing-default-master-plan-candidate-baseline-export')
    assert.equal(json.rows[1].source, 'managed_frontier_default_master_plan')
    assert.equal(json.rows[1].profileSourceType, 'business_type_master_plan_profile_v1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails existing candidate baseline normalization when originalSource hides retired lineage', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const input = path.join(root, 'candidate-baseline-hidden-original-source.json')
  const outputRoot = path.join(root, 'reports')

  await writeJson(input, {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-export/v1',
    generatedAt: '2026-07-01T19:30:12.711Z',
    source: 'export-default-master-plan-candidate-baseline',
    baselineId: 'baseline-hidden-original-source',
    projectId: 'project-1',
    sourceVersionLabel: 'managed_frontier_default_master_plan',
    status: 'draft',
    title: '隐藏原始来源候选基线',
    rowCount: 1,
    rows: [
      {
        index: 1,
        id: 'item-hidden-original-source',
        title: '表面合格但隐藏人工对照原始来源的行',
        plannedStart: '2026-07-01',
        plannedEnd: '2026-07-30',
        standardWorkCode: 'BTMP-HIDDEN-01',
        source: 'managed_frontier_default_master_plan',
        originalSource: 'manual_comparison_scenario',
        smartReferenceDays: 30,
        durationOutputCode: 'plan_reference',
        durationEvidence: 'candidate_default_master_plan_baseline',
        candidateOnly: true,
        writesTasks: false,
        writesTaskDependencies: false,
        predecessorCount: 0,
      },
    ],
  })

  try {
    const report = await normalizeExistingCandidateBaselineExport({
      input,
      outputRoot,
      exportedBy: 'normalizer-1',
      now: new Date('2026-07-02T03:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionCandidateEligible, false)
    assert.equal(report.quality.retiredOrLowInformationSourceRowCount, 1)
    assert.equal(report.quality.blockedSourceLabels.includes('manual_comparison_scenario'), true)
    assert.equal(report.blockers.includes('candidate_baseline_contains_retired_or_low_information_sources'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails candidate baseline export when profile lineage comes from manual comparison or low-information drafts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const outputRoot = path.join(root, 'reports')
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: {
          id: 'baseline-manual-profile',
          project_id: 'project-1',
          source_version_label: 'managed_frontier_default_master_plan',
          status: 'draft',
          title: '人工对照 profile 候选基线',
          summary: { total_items: 2, duration_days: 90 },
          items: [
            candidateItem({
              id: 'item-manual-profile',
              code: 'BTMP-MAN-01',
              title: '人工对照场景行',
              planReferenceDays: 30,
              source: 'managed_frontier_default_master_plan',
              profileSourceType: 'manual_comparison_scenario',
            }),
            candidateItem({
              id: 'item-low-profile',
              code: 'BTMP-LOW-01',
              title: '低信息模板草稿行',
              planReferenceDays: 60,
              source: 'managed_frontier_default_master_plan',
              profileSourceType: 'low_information_template_draft',
            }),
          ],
        },
      }
    },
  })

  try {
    const report = await exportDefaultMasterPlanCandidateBaseline({
      baselineId: 'baseline-manual-profile',
      projectId: 'project-1',
      outputRoot,
      fetchFn,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionCandidateEligible, false)
    assert.equal(report.quality.retiredOrLowInformationSourceRowCount, 2)
    assert.equal(report.quality.blockedSourceLabels.includes('manual_comparison_scenario'), true)
    assert.equal(report.quality.blockedSourceLabels.includes('low_information_template_draft'), true)
    assert.equal(report.blockers.includes('candidate_baseline_contains_retired_or_low_information_sources'), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('fails candidate baseline export when metadata hides manual comparison fallback markers', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-baseline-export-'))
  const outputRoot = path.join(root, 'reports')
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: {
          id: 'baseline-hidden-manual',
          project_id: 'project-1',
          source_version_label: 'managed_frontier_default_master_plan',
          status: 'draft',
          title: '隐藏人工对照来源候选基线',
          summary: { total_items: 1, duration_days: 30 },
          items: [
            candidateItem({
              id: 'item-hidden-manual',
              code: 'BTMP-HIDDEN-01',
              title: '表面合格但隐藏人工对照的行',
              planReferenceDays: 30,
              source: 'managed_frontier_default_master_plan',
              fallbackApplied: 'manual_comparison_scenario',
            }),
          ],
        },
      }
    },
  })

  try {
    const report = await exportDefaultMasterPlanCandidateBaseline({
      baselineId: 'baseline-hidden-manual',
      projectId: 'project-1',
      outputRoot,
      fetchFn,
      now: new Date('2026-07-02T02:00:00.000Z'),
    })

    assert.equal(report.status, 'blocked')
    assert.equal(report.productionCandidateEligible, false)
    assert.equal(report.quality.retiredOrLowInformationSourceRowCount, 1)
    assert.equal(report.quality.blockedSourceLabels.includes('manual_comparison_scenario'), true)
    assert.equal(report.blockers.includes('candidate_baseline_contains_retired_or_low_information_sources'), true)

    const json = JSON.parse(await readFile(path.join(outputRoot, 'candidate-baseline-baseline-hidden-manual-items.json'), 'utf8'))
    assert.equal(json.rows[0].fallbackApplied, 'manual_comparison_scenario')
    assert.equal(json.status, 'blocked')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('detects direct CLI execution from a Windows path', () => {
  assert.equal(
    isCliEntry(
      'file:///C:/repo/project-testing/tools/export-default-master-plan-candidate-baseline.mjs',
      'C:\\repo\\project-testing\\tools\\export-default-master-plan-candidate-baseline.mjs',
    ),
    true,
  )
})

function candidateItem({ id, code, title, planReferenceDays, source, profileSourceType, fallbackApplied, clientRowId, predecessorDependencies, plannedStartDate = '2026-07-01T00:00:00.000Z', plannedEndDate = '2026-07-30T00:00:00.000Z' }) {
  return {
    id,
    title,
    planned_start_date: plannedStartDate,
    planned_end_date: plannedEndDate,
    standard_work_code: code,
    generation_metadata: {
      source,
      ...(profileSourceType ? {
        businessTypeMasterPlan: {
          source,
          profileSourceType,
        },
      } : {}),
      candidateOnly: true,
      ...(clientRowId ? { clientRowId } : {}),
      ...(predecessorDependencies ? { predecessorDependencies } : {}),
      ...(fallbackApplied === undefined ? {} : { fallbackApplied }),
      writesTasks: false,
      writesTaskDependencies: false,
      durationSuggestion: {
        planReferenceDays,
        durationOutputCode: 'plan_reference',
        durationEvidenceSource: 'candidate_default_master_plan_baseline',
      },
      mutationBoundary: {
        writesProductionDependencies: false,
        writesCriticalPathFacts: false,
      },
    },
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
