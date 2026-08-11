import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uuidCounter: 0,
  tables: {
    algorithm_seed_versions: [] as any[],
    algorithm_seed_records: [] as any[],
    algorithm_seed_import_logs: [] as any[],
    algorithm_seed_overrides: [] as any[],
    algorithm_seed_upgrade_candidates: [] as any[],
  },
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    mocks.uuidCounter += 1
    return `flow-seed-uuid-${mocks.uuidCounter}`
  }),
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async () => null),
  isUuidLike: (value: unknown) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(value ?? '')),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => {
  type Filter = { op: 'eq' | 'neq'; column: string; value: any }
  type TableName = keyof typeof mocks.tables

  function normalizeTable(table: string): TableName {
    if (table in mocks.tables) return table as TableName
    throw new Error(`Unexpected table ${table}`)
  }

  class QueryBuilder {
    private readonly table: TableName
    private readonly filters: Filter[] = []
    private pendingUpdate: any = null
    private pendingDelete = false
    private insertedRows: any[] | null = null

    constructor(table: string) {
      this.table = normalizeTable(table)
    }

    select() {
      return this
    }

    update(payload: any) {
      this.pendingUpdate = payload
      return this
    }

    insert(payload: any) {
      const rows = Array.isArray(payload) ? payload : [payload]
      this.insertedRows = rows.map((row) => ({ ...row }))
      mocks.tables[this.table].push(...this.insertedRows)
      return this
    }

    delete() {
      this.pendingDelete = true
      return this
    }

    eq(column: string, value: any) {
      this.filters.push({ op: 'eq', column, value })
      return this
    }

    neq(column: string, value: any) {
      this.filters.push({ op: 'neq', column, value })
      return this
    }

    order() {
      return this
    }

    limit() {
      return this
    }

    maybeSingle() {
      return Promise.resolve({ data: this.resolveRows()[0] ?? null, error: null })
    }

    single() {
      if (this.pendingUpdate || this.pendingDelete) {
        return this.flush().then(() => ({ data: this.resolveRows()[0] ?? null, error: null }))
      }
      return Promise.resolve({ data: this.insertedRows?.[0] ?? this.resolveRows()[0] ?? null, error: null })
    }

    then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
      return this.flush().then(resolve, reject)
    }

    private async flush() {
      if (this.pendingUpdate) {
        for (const row of mocks.tables[this.table]) {
          if (this.matches(row)) Object.assign(row, this.pendingUpdate)
        }
        return { data: null, error: null }
      }

      if (this.pendingDelete) {
        mocks.tables[this.table] = mocks.tables[this.table].filter((row) => !this.matches(row)) as any
        return { data: null, error: null }
      }

      return { data: this.insertedRows ?? this.resolveRows(), error: null }
    }

    private resolveRows() {
      return mocks.tables[this.table].filter((row) => this.matches(row))
    }

    private matches(row: any) {
      return this.filters.every((filter) => {
        if (filter.op === 'neq') return row[filter.column] !== filter.value
        return row[filter.column] === filter.value
      })
    }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
  }
})

const { importV1474AlgorithmSeeds } = await import('../services/algorithmSeedImportService.js')
const {
  clearAlgorithmSeedResolverCache,
  resolveAlgorithmSeedRecordsWithDiagnostics,
  resolveStandardWorkDurationSeed,
  resolveV1474WorkflowDictionary,
} = await import('../services/algorithmSeedResolver.js')
const {
  createAlgorithmSeedOverride,
  createAlgorithmSeedUpgradeCandidate,
  recordAlgorithmSeedOverrideImpactMonitoring,
  rollbackAlgorithmSeedOverrideRuntimePublication,
  updateAlgorithmSeedOverride,
} = await import('../services/algorithmSeedLearningService.js')
const {
  autoGovernAlgorithmSeedUpgradeCandidate,
} = await import('../services/algorithmSeedAutoGovernanceService.js')
const {
  getAlgorithmSeedEntry,
  listAlgorithmSeedTypes,
} = await import('../services/algorithmSeedRegistry.js')
const {
  validateV1474AlgorithmSeeds,
} = await import('../services/algorithmSeedValidationService.js')

const governedRuleAssetSeedTypes = [
  'regional_climate_rules',
  'risk_issue_warning_rule',
  'progress_deviation_cause',
  'responsibility_health_rule',
  'milestone_integrity_rule',
] as const

describe('algorithm seed governance flow', () => {
  beforeEach(() => {
    mocks.uuidCounter = 0
    clearAlgorithmSeedResolverCache()
    mocks.tables.algorithm_seed_versions = []
    mocks.tables.algorithm_seed_records = []
    mocks.tables.algorithm_seed_import_logs = []
    mocks.tables.algorithm_seed_overrides = []
    mocks.tables.algorithm_seed_upgrade_candidates = []
  })

  it('validates, imports, and resolves active workflow seed records from the governed store', async () => {
    const imported = await importV1474AlgorithmSeeds({
      strict: true,
      seedType: 'workflow_dictionary',
      userId: 'user-1',
    })

    expect(imported.validation.ok).toBe(true)
    expect(imported.summaries[0]).toEqual(expect.objectContaining({
      seedType: 'workflow_dictionary',
      created: true,
      recordCount: mocks.tables.algorithm_seed_records.length,
    }))
    expect(mocks.tables.algorithm_seed_versions).toHaveLength(1)
    expect(mocks.tables.algorithm_seed_import_logs).toHaveLength(1)

    const match = await resolveV1474WorkflowDictionary('masonry plaster', {})

    expect(match).toEqual(expect.objectContaining({
      stableCode: 'masonry_to_plaster',
      __stableCode: 'masonry_to_plaster',
      __resolverSource: 'active_seed',
      __resolverVersionId: mocks.tables.algorithm_seed_versions[0].id,
      seedRuleId: 'masonry_to_plaster',
      ruleVersion: expect.any(Number),
      evidenceQuality: expect.any(Object),
    }))
  })

  it('resolves project-level standard duration overrides ahead of the TS seed fallback', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    mocks.tables.algorithm_seed_overrides.push({
      seed_type: 'standard_work_duration',
      stable_code: 'process_duration:02-01-03-P07',
      scope_type: 'project',
      project_id: projectId,
      company_id: null,
      status: 'active',
      effective_from: null,
      effective_to: null,
      override_payload: {
        stableCode: 'process_duration:02-01-03-P07',
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['02-01-03-P07', 'Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP20: 5,
        defaultDaysP50: 6,
        defaultDaysP80: 7,
        fixedDays: 1,
        variableDays: 5,
        scaleBasis: 'floor',
        defaultDaysByMethod: { cast_in_place: 6 },
        applicableMethodCodes: ['cast_in_place'],
        projectTypeCodes: ['residential'],
        structureTypeCodes: ['frame_shear_wall'],
        elementVariantCodes: ['beam_slab_or_floor_plate'],
        baselineProductivity: {
          p50PerDay: 0.16,
          unit: 'floor/day',
          basis: 'closed-loop project duration sample productivity',
        },
        benchmarkBasis: 'project closed-loop override from duration_experience_samples',
        sourceStandard: 'duration_experience_samples',
        sourceVersion: 'project_history',
        sourceClauseRef: 'duration_experience_samples.closed_loop',
        evidenceSourceKeys: ['duration_experience_samples:closed_loop'],
        confidence: 'high',
      },
    })

    const match = await resolveStandardWorkDurationSeed('', {
      projectId,
      standardWorkCode: '02-01-03-P07',
      methodVariantCodes: ['cast_in_place'],
      applicableGranularity: 'task',
    })

    expect(match).toEqual(expect.objectContaining({
      __resolverSource: 'project_override',
      stableCode: 'process_duration:02-01-03-P07',
      defaultDaysP50: 6,
      benchmarkBasis: expect.stringContaining('project closed-loop override'),
    }))
  })

  it('keeps auto-governed seed candidates out of runtime overrides until release execution is explicit', async () => {
    const candidate = await createAlgorithmSeedUpgradeCandidate({
      seedType: 'standard_work_duration',
      stableCode: 'process_duration:02-01-03-P07',
      candidateSource: 'project_history',
      projectId: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      sampleCount: 50,
      variance: 0.05,
      confidenceLevel: 'high',
      actionPolicy: 'auto_govern',
      candidatePayload: {
        stableCode: 'process_duration:02-01-03-P07',
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['02-01-03-P07', 'Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP20: 5,
        defaultDaysP50: 6,
        defaultDaysP80: 7,
        fixedDays: 1,
        variableDays: 5,
        scaleBasis: 'floor',
        defaultDaysByMethod: { cast_in_place: 6 },
        applicableMethodCodes: ['cast_in_place'],
        projectTypeCodes: ['residential'],
        structureTypeCodes: ['frame_shear_wall'],
        elementVariantCodes: ['beam_slab_or_floor_plate'],
        typicalResponsibilityRole: 'labor_subcontractor',
        sourceStandard: 'duration_experience_samples',
        sourceVersion: 'project_history',
        sourceClauseRef: 'duration_experience_samples.closed_loop',
        evidenceSourceKeys: ['duration_experience_samples:closed_loop'],
        evidenceQuality: {
          source_type: 'runtime_sample',
          source_doc: 'duration_experience_samples',
          source_url: null,
          evidence_source_keys: ['duration_experience_samples:closed_loop'],
          last_review_date: '2026-05-27',
          applicable_region_scope: 'project',
        },
        seedRuleId: 'duration:02-01-03-P07',
        ruleVersion: 1,
        isActive: true,
        webVerified: true,
        reviewNeeded: false,
      },
      evidenceSummary: {
        replayTruePositiveRate: 0.92,
        replayFalsePositiveRate: 0.02,
        conflictCount: 0,
      },
    })

    const result = await autoGovernAlgorithmSeedUpgradeCandidate(candidate.id, {
      triggeredBy: 'governance-bot',
      scopeType: 'project',
      projectId: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
    })

    expect(result.decision.status).toBe('auto_published')
    expect(result.decision.shouldPublish).toBe(true)
    expect(result.decision.runtimePublicationPolicy).toEqual(expect.objectContaining({
      localStatusOnly: true,
      runtimeWriteAllowed: false,
      requiredReleaseChain: expect.arrayContaining([
        'release_exit_package',
        'seed_override_domain_writer',
        'consumer_verification',
        'rollback_target',
      ]),
    }))
    expect(result.override).toBeNull()
    expect(mocks.tables.algorithm_seed_overrides).toHaveLength(0)
  })

  it('does not auto-govern a candidate outside the caller workspace scope', async () => {
    mocks.tables.algorithm_seed_upgrade_candidates.push({
      id: 'candidate-company-1',
      seed_type: 'standard_work_duration',
      stable_code: 'process_duration:02-01-03-P07',
      candidate_payload: {},
      candidate_source: 'project_history',
      project_id: '11111111-1111-4111-8111-111111111111',
      company_id: '22222222-2222-4222-8222-222222222222',
      status: 'candidate',
    })

    await expect(autoGovernAlgorithmSeedUpgradeCandidate('candidate-company-1', {
      triggeredBy: 'governance-bot',
      scopeType: 'project',
      projectId: '33333333-3333-4333-8333-333333333333',
      companyId: '44444444-4444-4444-8444-444444444444',
    })).rejects.toMatchObject({ code: 'CANDIDATE_NOT_FOUND' })

    expect(mocks.tables.algorithm_seed_upgrade_candidates[0].status).toBe('candidate')
  })

  it('rolls back a scoped seed override and prevents the resolver from consuming the rolled back version', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    const stableCode = 'process_duration:02-01-03-P07'
    mocks.tables.algorithm_seed_versions.push({
      id: 'active-version-1',
      seed_type: 'standard_work_duration',
      seed_version: 'v-test',
      status: 'active',
      is_current: true,
    })
    mocks.tables.algorithm_seed_records.push({
      seed_version_id: 'active-version-1',
      seed_type: 'standard_work_duration',
      stable_code: stableCode,
      status: 'active',
      rule_payload: {
        stableCode,
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP50: 8,
        sourceStandard: 'system',
        sourceVersion: 'v-test',
        sourceClauseRef: 'system.seed',
        evidenceSourceKeys: ['system.seed'],
        webVerified: true,
        reviewNeeded: false,
      },
    })
    mocks.tables.algorithm_seed_overrides.push({
      id: 'override-1',
      seed_type: 'standard_work_duration',
      stable_code: stableCode,
      scope_type: 'project',
      project_id: projectId,
      company_id: null,
      status: 'active',
      effective_from: null,
      effective_to: null,
      override_payload: {
        stableCode,
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP50: 6,
        sourceStandard: 'project',
        sourceVersion: 'history',
        sourceClauseRef: 'project.override',
        evidenceSourceKeys: ['project.override'],
        webVerified: true,
        reviewNeeded: false,
      },
      auto_governance_result: {
        releasePackage: 'manual-release-evidence-1',
      },
    })

    const beforeRollback = await resolveStandardWorkDurationSeed('', {
      projectId,
      standardWorkCode: '02-01-03-P07',
      applicableGranularity: 'task',
    })

    expect(beforeRollback).toEqual(expect.objectContaining({
      __resolverSource: 'project_override',
      defaultDaysP50: 6,
    }))

    const rollback = await rollbackAlgorithmSeedOverrideRuntimePublication({
      seedType: 'standard_work_duration',
      stableCode,
      scopeType: 'project',
      projectId,
      rollbackTarget: 'active-version-1',
      reason: 'impact_monitoring_failed',
      executedAt: '2026-06-15T02:00:00.000Z',
      executedBy: 'governance-bot',
    })

    expect(rollback).toEqual(expect.objectContaining({
      status: 'rollback_executed',
      writesSeedOverrideRuntime: true,
      writesSystemSeedRuntimeDirectly: false,
      rollbackTarget: 'active-version-1',
      reasons: [],
    }))
    expect(mocks.tables.algorithm_seed_overrides[0]).toEqual(expect.objectContaining({
      status: 'inactive',
      effective_to: '2026-06-15',
      auto_governance_result: expect.objectContaining({
        releasePackage: 'manual-release-evidence-1',
        rollbackExecution: expect.objectContaining({
          rollbackTarget: 'active-version-1',
          reason: 'impact_monitoring_failed',
          executedBy: 'governance-bot',
        }),
      }),
    }))

    const afterRollback = await resolveStandardWorkDurationSeed('', {
      projectId,
      standardWorkCode: '02-01-03-P07',
      applicableGranularity: 'task',
    })

    expect(afterRollback).toEqual(expect.objectContaining({
      __resolverSource: 'active_seed',
      defaultDaysP50: 8,
    }))
  })

  it('records seed override impact monitoring and rolls back only the scoped override when monitoring fails', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    const stableCode = 'process_duration:02-01-03-P07'
    mocks.tables.algorithm_seed_versions.push({
      id: 'active-version-1',
      seed_type: 'standard_work_duration',
      seed_version: 'v-test',
      status: 'active',
      is_current: true,
    })
    mocks.tables.algorithm_seed_records.push({
      seed_version_id: 'active-version-1',
      seed_type: 'standard_work_duration',
      stable_code: stableCode,
      status: 'active',
      rule_payload: {
        stableCode,
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP50: 8,
        sourceStandard: 'system',
        sourceVersion: 'v-test',
        sourceClauseRef: 'system.seed',
        evidenceSourceKeys: ['system.seed'],
        webVerified: true,
        reviewNeeded: false,
      },
    })
    mocks.tables.algorithm_seed_overrides.push({
      id: 'override-1',
      seed_type: 'standard_work_duration',
      stable_code: stableCode,
      scope_type: 'project',
      project_id: projectId,
      company_id: null,
      status: 'active',
      effective_from: null,
      effective_to: null,
      override_payload: {
        stableCode,
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP50: 6,
        sourceStandard: 'project',
        sourceVersion: 'history',
        sourceClauseRef: 'project.override',
        evidenceSourceKeys: ['project.override'],
        webVerified: true,
        reviewNeeded: false,
      },
      auto_governance_result: {
        releasePackage: 'manual-release-evidence-1',
      },
    })

    const monitoring = await recordAlgorithmSeedOverrideImpactMonitoring({
      seedType: 'standard_work_duration',
      stableCode,
      scopeType: 'project',
      projectId,
      monitoringStatus: 'monitoring_failed',
      eventRef: 'impact_monitoring:algorithm_seed_overrides:override-1:failed',
      rollbackTarget: 'active-version-1',
      reason: 'p50_regression_over_threshold',
      monitoredAt: '2026-06-15T03:00:00.000Z',
      monitoredBy: 'seed-monitor',
      metrics: {
        p50Before: 6,
        p50Fallback: 8,
        regressionRate: 0.34,
      },
    })

    expect(monitoring).toEqual(expect.objectContaining({
      status: 'monitoring_rolled_back',
      writesSeedOverrideRuntime: true,
      writesSystemSeedRuntimeDirectly: false,
      reasons: [],
      rollback: expect.objectContaining({
        status: 'rollback_executed',
        rollbackTarget: 'active-version-1',
        writesSystemSeedRuntimeDirectly: false,
      }),
    }))
    expect(mocks.tables.algorithm_seed_versions[0]).toEqual(expect.objectContaining({
      status: 'active',
      is_current: true,
    }))
    expect(mocks.tables.algorithm_seed_records[0]).toEqual(expect.objectContaining({
      status: 'active',
    }))
    expect(mocks.tables.algorithm_seed_overrides[0]).toEqual(expect.objectContaining({
      status: 'inactive',
      effective_to: '2026-06-15',
      auto_governance_result: expect.objectContaining({
        releasePackage: 'manual-release-evidence-1',
        impactMonitoring: expect.objectContaining({
          status: 'monitoring_failed',
          eventRef: 'impact_monitoring:algorithm_seed_overrides:override-1:failed',
          reason: 'p50_regression_over_threshold',
          monitoredBy: 'seed-monitor',
          metrics: expect.objectContaining({
            regressionRate: 0.34,
          }),
        }),
        rollbackExecution: expect.objectContaining({
          rollbackTarget: 'active-version-1',
          reason: 'p50_regression_over_threshold',
          executedBy: 'seed-monitor',
        }),
      }),
    }))
  })

  it('explains effective and suppressed resolver sources for a stable seed code', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    const companyId = '22222222-2222-4222-8222-222222222222'
    const stableCode = 'process_duration:02-01-03-P07'
    mocks.tables.algorithm_seed_versions.push({
      id: 'active-version-1',
      seed_type: 'standard_work_duration',
      seed_version: 'v-test',
      status: 'active',
      is_current: true,
    })
    mocks.tables.algorithm_seed_records.push({
      seed_version_id: 'active-version-1',
      seed_type: 'standard_work_duration',
      stable_code: stableCode,
      status: 'active',
      rule_payload: {
        stableCode,
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        keywords: ['Concrete placing'],
        durationCoverageMode: 'direct',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        applicableGranularity: 'task',
        defaultDaysP50: 8,
        sourceStandard: 'system',
        sourceVersion: 'v-test',
        sourceClauseRef: 'system.seed',
        evidenceSourceKeys: ['system.seed'],
        webVerified: true,
        reviewNeeded: false,
      },
    })
    mocks.tables.algorithm_seed_overrides.push(
      {
        seed_type: 'standard_work_duration',
        stable_code: stableCode,
        scope_type: 'company',
        project_id: null,
        company_id: companyId,
        status: 'active',
        effective_from: null,
        effective_to: null,
        override_payload: {
          stableCode,
          standardWorkCodes: ['02-01-03-P07'],
          standardCatalogCodePrefixes: ['02-01-03-P07'],
          keywords: ['Concrete placing'],
          durationCoverageMode: 'direct',
          durationContributionMode: 'duration_bearing',
          baseDaysEligible: true,
          applicableGranularity: 'task',
          defaultDaysP50: 7,
          sourceStandard: 'company',
          sourceVersion: 'history',
          sourceClauseRef: 'company.seed',
          evidenceSourceKeys: ['company.seed'],
          webVerified: true,
          reviewNeeded: false,
        },
      },
      {
        seed_type: 'standard_work_duration',
        stable_code: stableCode,
        scope_type: 'project',
        project_id: projectId,
        company_id: null,
        status: 'active',
        effective_from: null,
        effective_to: null,
        override_payload: {
          stableCode,
          standardWorkCodes: ['02-01-03-P07'],
          standardCatalogCodePrefixes: ['02-01-03-P07'],
          keywords: ['Concrete placing'],
          durationCoverageMode: 'direct',
          durationContributionMode: 'duration_bearing',
          baseDaysEligible: true,
          applicableGranularity: 'task',
          defaultDaysP50: 6,
          sourceStandard: 'project',
          sourceVersion: 'history',
          sourceClauseRef: 'project.seed',
          evidenceSourceKeys: ['project.seed'],
          webVerified: true,
          reviewNeeded: false,
        },
      },
    )

    const result = await resolveAlgorithmSeedRecordsWithDiagnostics('standard_work_duration', {
      projectId,
      companyId,
    })

    expect(result.records.find((record) => record.__stableCode === stableCode)).toEqual(expect.objectContaining({
      __resolverSource: 'project_override',
      __runtimeRole: 'stable_runtime',
      __effectiveRuntimeSource: 'project_stable',
      defaultDaysP50: 6,
    }))
    expect(result.diagnostics.sourcesByStableCode[stableCode]).toEqual(expect.objectContaining({
      effectiveSource: 'project_override',
      suppressedSources: ['active_seed', 'company_override'],
      priorityOrder: ['active_seed', 'company_override', 'project_override'],
      sourcePrecedenceTrace: [
        expect.objectContaining({ source: 'active_seed', decision: 'suppressed_by_higher_priority' }),
        expect.objectContaining({ source: 'company_override', decision: 'suppressed_by_higher_priority' }),
        expect.objectContaining({ source: 'project_override', decision: 'effective' }),
      ],
      conflictReason: 'higher_priority_project_override',
    }))
    expect(result.diagnostics.sourcePrecedenceTrace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stableCode,
        effectiveSource: 'project_override',
        suppressedSources: ['active_seed', 'company_override'],
      }),
    ]))
    expect(result.diagnostics.fallbackUsed).toBe(false)
  })

  it('marks TS fallback diagnostics when no governed rows are available', async () => {
    const result = await resolveAlgorithmSeedRecordsWithDiagnostics('workflow_dictionary', {})

    expect(result.records.length).toBeGreaterThan(0)
    expect(result.records.every((record) => record.__resolverSource === 'ts_seed_fallback')).toBe(true)
    expect(result.records.every((record) => record.__runtimeRole === 'system_bootstrap')).toBe(true)
    expect(result.records.every((record) => record.__effectiveRuntimeSource === 'system_bootstrap')).toBe(true)
    expect(result.diagnostics.fallbackUsed).toBe(true)
    expect(result.diagnostics.fallbackReason).toBe('governed_records_empty')
    expect(result.diagnostics.fallbackRiskLevel).toBe('medium')
    expect(result.diagnostics.recommendedAction).toBe('import_active_seed_version')
  })

  it('registers rule assets that belong to the algorithm seed lifecycle', async () => {
    expect(listAlgorithmSeedTypes()).toEqual(expect.arrayContaining([...governedRuleAssetSeedTypes]))

    for (const seedType of governedRuleAssetSeedTypes) {
      const entry = getAlgorithmSeedEntry(seedType)
      expect(entry?.records.length).toBeGreaterThan(0)

      const validation = validateV1474AlgorithmSeeds({ strict: true, seedType })
      expect(validation.ok).toBe(true)
      expect(validation.entries).toEqual([
        expect.objectContaining({
          seedType,
          actualCount: entry?.records.length,
          duplicateStableCodes: [],
          missingEvidenceCount: 0,
          missingSourceCount: 0,
          missingV1475FieldCount: 0,
        }),
      ])

      const resolved = await resolveAlgorithmSeedRecordsWithDiagnostics(seedType, {})
      expect(resolved.records.length).toBe(entry?.records.length)
      expect(resolved.records.every((record) => record.__resolverSource === 'ts_seed_fallback')).toBe(true)
      expect(resolved.records[0]).toEqual(expect.objectContaining({
        __stableCode: expect.any(String),
        seedRuleId: expect.any(String),
        ruleVersion: expect.any(Number),
        evidenceQuality: expect.any(Object),
      }))
      expect(resolved.diagnostics.fallbackReason).toBe('governed_records_empty')
    }
  })

  it('reuses equivalent pending upgrade candidates instead of inserting duplicates', async () => {
    const input = {
      seedType: 'standard_work_duration' as const,
      stableCode: 'learned:standard_work_duration:02-01-03-P07',
      candidatePayload: {
        stableCode: 'learned:standard_work_duration:02-01-03-P07',
        standardWorkCodes: ['02-01-03-P07'],
        standardCatalogCodePrefixes: ['02-01-03-P07'],
        defaultDaysP50: 6,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        sourceStandard: 'duration_experience_samples',
        sourceVersion: 'project_history',
        sourceClauseRef: 'duration_experience_samples.closed_loop',
        evidenceSourceKeys: ['duration_experience_samples:closed_loop'],
        webVerified: true,
        reviewNeeded: false,
      },
      candidateSource: 'project_history' as const,
      projectId: 'project-1',
      companyId: 'company-1',
      sampleCount: 5,
      evidenceSummary: { source: 'duration_experience_samples.actual_duration' },
    }

    const first = await createAlgorithmSeedUpgradeCandidate(input)
    const second = await createAlgorithmSeedUpgradeCandidate(input)

    expect(second.id).toBe(first.id)
    expect(mocks.tables.algorithm_seed_upgrade_candidates).toHaveLength(1)
    expect(mocks.tables.algorithm_seed_upgrade_candidates[0].candidate_fingerprint).toEqual(expect.any(String))
  })

  it('strips legacy scope-object fields from seed candidate and override payloads before persistence', async () => {
    const validPayload = {
      stableCode: 'learned:standard_work_duration:02-01-03-P07',
      standardWorkCodes: ['02-01-03-P07'],
      standardCatalogCodePrefixes: ['02-01-03-P07'],
      defaultDaysP50: 6,
      durationContributionMode: 'duration_bearing',
      baseDaysEligible: true,
      sourceStandard: 'duration_experience_samples',
      sourceVersion: 'project_history',
      sourceClauseRef: 'duration_experience_samples.closed_loop',
      evidenceSourceKeys: ['duration_experience_samples:closed_loop'],
      webVerified: true,
      reviewNeeded: false,
      zone_object_id: 'legacy-zone-1',
      scope_dimensions: [{ type: 'zone', value: 'A区' }],
      nestedLegacy: {
        professional_object_id: 'legacy-professional-1',
        project_scope_dimensions: [{ type: 'professional', value: '机电' }],
        legacy_object_type: 'zone',
      },
    }

    await createAlgorithmSeedUpgradeCandidate({
      seedType: 'standard_work_duration',
      stableCode: 'learned:standard_work_duration:02-01-03-P07',
      candidatePayload: validPayload,
      candidateSource: 'project_history',
      projectId: 'project-1',
      companyId: 'company-1',
      sampleCount: 5,
      evidenceSummary: { source: 'duration_experience_samples.actual_duration' },
    })
    await createAlgorithmSeedOverride({
      seedType: 'standard_work_duration',
      stableCode: 'learned:standard_work_duration:02-01-03-P07',
      scopeType: 'project',
      projectId: 'project-1',
      overridePayload: validPayload,
    })

    const candidatePayloadText = JSON.stringify(mocks.tables.algorithm_seed_upgrade_candidates[0]?.candidate_payload)
    const overridePayloadText = JSON.stringify(mocks.tables.algorithm_seed_overrides[0]?.override_payload)
    for (const payloadText of [candidatePayloadText, overridePayloadText]) {
      expect(payloadText).not.toContain('zone_object_id')
      expect(payloadText).not.toContain('professional_object_id')
      expect(payloadText).not.toContain('scope_dimensions')
      expect(payloadText).not.toContain('project_scope_dimensions')
      expect(payloadText).not.toContain('legacy_object_type')
    }
  })

  it('strips legacy scope-object fields from updated seed override payloads before persistence', async () => {
    mocks.tables.algorithm_seed_overrides.push({
      id: 'override-1',
      seed_type: 'standard_work_duration',
      stable_code: 'learned:standard_work_duration:02-01-03-P07',
      scope_type: 'project',
      project_id: 'project-1',
      company_id: null,
      status: 'active',
      override_payload: { stableCode: 'learned:standard_work_duration:02-01-03-P07' },
    })

    await updateAlgorithmSeedOverride('override-1', {
      overridePayload: {
        stableCode: 'learned:standard_work_duration:02-01-03-P07',
        zone_object_id: 'legacy-zone-1',
        nestedLegacy: {
          scope_dimensions: [{ type: 'zone', value: 'A区' }],
          legacy_object_type: 'zone',
        },
      },
    })

    const payloadText = JSON.stringify(mocks.tables.algorithm_seed_overrides[0]?.override_payload)
    expect(payloadText).not.toContain('zone_object_id')
    expect(payloadText).not.toContain('scope_dimensions')
    expect(payloadText).not.toContain('legacy_object_type')
  })

  it('rejects candidate payloads that do not satisfy runtime seed validation', async () => {
    await expect(createAlgorithmSeedUpgradeCandidate({
      seedType: 'standard_work_duration',
      stableCode: 'invalid-duration-candidate',
      candidatePayload: {
        stableCode: 'invalid-duration-candidate',
        defaultDaysP50: 6,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
      },
      candidateSource: 'project_history',
      projectId: 'project-1',
      companyId: 'company-1',
    })).rejects.toMatchObject({
      code: 'ALGORITHM_SEED_PAYLOAD_VALIDATION_FAILED',
    })
  })

  it('rejects override payloads that do not satisfy runtime seed validation', async () => {
    await expect(createAlgorithmSeedOverride({
      seedType: 'standard_work_duration',
      stableCode: 'invalid-duration-override',
      scopeType: 'project',
      projectId: 'project-1',
      overridePayload: {
        stableCode: 'invalid-duration-override',
        defaultDaysP50: 6,
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
      },
    })).rejects.toMatchObject({
      code: 'ALGORITHM_SEED_PAYLOAD_VALIDATION_FAILED',
    })
  })
})
