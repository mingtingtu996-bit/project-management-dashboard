import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  uuidCounter: 0,
  state: {
    existingVersion: null as { id: string } | null,
    inserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any; filters: Array<{ op: string; column: string; value: any }> }>,
    deletes: [] as Array<{ table: string; filters: Array<{ op: string; column: string; value: any }> }>,
    operations: [] as Array<{ op: 'insert' | 'update' | 'delete'; table: string; payload?: any; filters?: Array<{ op: string; column: string; value: any }> }>,
  },
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    mocks.uuidCounter += 1
    return `seed-uuid-${mocks.uuidCounter}`
  }),
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
  class QueryBuilder {
    private readonly filters: Array<{ op: string; column: string; value: any }> = []

    constructor(private readonly table: string) {}

    select() {
      return this
    }

    update(payload: any) {
      mocks.state.updates.push({ table: this.table, payload, filters: this.filters })
      mocks.state.operations.push({ op: 'update', table: this.table, payload, filters: this.filters })
      return this
    }

    insert(payload: any) {
      mocks.state.inserts.push({ table: this.table, payload })
      mocks.state.operations.push({ op: 'insert', table: this.table, payload })
      return this
    }

    delete() {
      mocks.state.deletes.push({ table: this.table, filters: this.filters })
      mocks.state.operations.push({ op: 'delete', table: this.table, filters: this.filters })
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

    maybeSingle() {
      if (this.table === 'algorithm_seed_versions') {
        return Promise.resolve({ data: mocks.state.existingVersion, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }

    single() {
      return Promise.resolve({ data: null, error: null })
    }

    then(resolve: (value: any) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: null, error: null }).then(resolve, reject)
    }
  }

  return {
    supabase: {
      from: vi.fn((table: string) => new QueryBuilder(table)),
    },
  }
})

const { importV1474AlgorithmSeeds, previewAlgorithmSeedImport, rollbackAlgorithmSeedVersion } = await import('../services/algorithmSeedImportService.js')
const { ALGORITHM_SEED_REGISTRY } = await import('../services/algorithmSeedRegistry.js')
const { V1474_WORKFLOW_DICTIONARY_SEED } = await import('../seeds/v1474WorkflowDictionarySeed.js')

describe('algorithmSeedImportService', () => {
  beforeEach(() => {
    mocks.uuidCounter = 0
    mocks.state.existingVersion = null
    mocks.state.inserts = []
    mocks.state.updates = []
    mocks.state.deletes = []
    mocks.state.operations = []
  })

  it('imports a validated seed into version, record, and import-log rows', async () => {
    const result = await importV1474AlgorithmSeeds({
      strict: true,
      seedType: 'workflow_dictionary',
      userId: 'user-1',
    })

    expect(result.validation.ok).toBe(true)
    expect(result.summaries).toEqual([
      expect.objectContaining({
        seedType: 'workflow_dictionary',
        seedVersionId: 'seed-uuid-1',
        recordCount: V1474_WORKFLOW_DICTIONARY_SEED.length,
        created: true,
      }),
    ])

    const versionInsert = mocks.state.inserts.find((item) => item.table === 'algorithm_seed_versions')
    expect(versionInsert?.payload).toEqual(expect.objectContaining({
      id: 'seed-uuid-1',
      seed_type: 'workflow_dictionary',
      seed_scope: 'algorithm_auxiliary',
      status: 'draft',
      is_current: false,
      imported_by: 'user-1',
    }))

    const recordInsert = mocks.state.inserts.find((item) => item.table === 'algorithm_seed_records')
    expect(recordInsert?.payload).toHaveLength(V1474_WORKFLOW_DICTIONARY_SEED.length)
    expect(recordInsert?.payload[0]).toEqual(expect.objectContaining({
      seed_version_id: 'seed-uuid-1',
      seed_type: 'workflow_dictionary',
      stable_code: expect.any(String),
      rule_payload: expect.objectContaining({
        seedRuleId: expect.any(String),
        ruleVersion: expect.any(Number),
        evidenceQuality: expect.any(Object),
      }),
      web_verified: true,
      review_needed: false,
      status: 'active',
    }))

    const logInsert = mocks.state.inserts.find((item) => item.table === 'algorithm_seed_import_logs')
    expect(logInsert?.payload).toEqual(expect.objectContaining({
      seed_version_id: 'seed-uuid-1',
      seed_type: 'workflow_dictionary',
      import_source: 'ts_seed',
      actual_counts_snapshot: { records: V1474_WORKFLOW_DICTIONARY_SEED.length },
      imported_by: 'user-1',
    }))

    const recordInsertIndex = mocks.state.operations.findIndex((item) => item.op === 'insert' && item.table === 'algorithm_seed_records')
    const activateIndex = mocks.state.operations.findIndex((item) => (
      item.op === 'update'
      && item.table === 'algorithm_seed_versions'
      && item.payload.status === 'active'
      && item.payload.is_current === true
    ))
    expect(recordInsertIndex).toBeGreaterThan(-1)
    expect(activateIndex).toBeGreaterThan(recordInsertIndex)
  })

  it('splits large standard-duration seed imports into bounded record batches before activation', async () => {
    const result = await importV1474AlgorithmSeeds({
      strict: true,
      seedType: 'standard_work_duration',
      userId: 'user-1',
    })

    const recordInserts = mocks.state.inserts.filter((item) => item.table === 'algorithm_seed_records')
    const importedRecordCount = recordInserts.reduce((total, item) => total + item.payload.length, 0)
    const lastRecordInsertIndex = mocks.state.operations
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.op === 'insert' && item.table === 'algorithm_seed_records')
      .at(-1)?.index ?? -1
    const activateIndex = mocks.state.operations.findIndex((item) => (
      item.op === 'update'
      && item.table === 'algorithm_seed_versions'
      && item.payload.status === 'active'
      && item.payload.is_current === true
    ))

    expect(result.summaries[0]).toEqual(expect.objectContaining({
      seedType: 'standard_work_duration',
      recordCount: importedRecordCount,
    }))
    expect(recordInserts.length).toBeGreaterThan(1)
    expect(recordInserts.every((item) => item.payload.length > 0 && item.payload.length <= 250)).toBe(true)
    expect(activateIndex).toBeGreaterThan(lastRecordInsertIndex)
  })

  it('strips legacy scope-object fields from imported seed record payloads before persistence', async () => {
    const entry = ALGORITHM_SEED_REGISTRY.find((item) => item.seedType === 'workflow_dictionary')
    expect(entry).toBeTruthy()
    const originalPayload = entry!.records[0]
    entry!.records[0] = {
      ...originalPayload,
      zone_object_id: 'legacy-zone-1',
      professional_object_id: 'legacy-professional-1',
      scope_dimensions: [{ type: 'zone', value: 'A区' }],
      nestedLegacy: {
        project_scope_dimensions: [{ type: 'professional', value: '机电' }],
        legacy_object_type: 'zone',
      },
    }

    try {
      await importV1474AlgorithmSeeds({
        strict: true,
        seedType: 'workflow_dictionary',
        userId: 'user-1',
      })
    } finally {
      entry!.records[0] = originalPayload
    }

    const recordInsert = mocks.state.inserts.find((item) => item.table === 'algorithm_seed_records')
    const persistedPayload = recordInsert?.payload?.[0]?.rule_payload
    expect(JSON.stringify(persistedPayload)).not.toContain('zone_object_id')
    expect(JSON.stringify(persistedPayload)).not.toContain('professional_object_id')
    expect(JSON.stringify(persistedPayload)).not.toContain('scope_dimensions')
    expect(JSON.stringify(persistedPayload)).not.toContain('project_scope_dimensions')
    expect(JSON.stringify(persistedPayload)).not.toContain('legacy_object_type')
  })

  it('previews seed import impact without mutating version or record tables', async () => {
    const preview = await previewAlgorithmSeedImport({
      strict: true,
      seedType: 'workflow_dictionary',
    })

    expect(preview.validation.ok).toBe(true)
    expect(preview.dryRun).toBe(true)
    expect(preview.summaries).toEqual([
      expect.objectContaining({
        seedType: 'workflow_dictionary',
        recordCount: V1474_WORKFLOW_DICTIONARY_SEED.length,
        existingVersionId: null,
        wouldCreateVersion: true,
        wouldReplaceRecords: false,
        wouldDeactivateCurrent: true,
        impactedConsumers: expect.any(Array),
        riskLevel: expect.stringMatching(/low|medium|high/),
        stableCodeDiff: expect.objectContaining({
          added: expect.any(Array),
          removed: expect.any(Array),
          changed: expect.any(Array),
        }),
        highRiskFieldChanges: expect.any(Array),
      }),
    ])
    expect(mocks.state.operations).toEqual([])
  })

  it('reimports an existing seed version idempotently by replacing its records', async () => {
    mocks.state.existingVersion = { id: 'existing-seed-version' }

    const result = await importV1474AlgorithmSeeds({
      strict: true,
      seedType: 'workflow_dictionary',
      userId: 'user-1',
    })

    expect(result.summaries[0]).toEqual(expect.objectContaining({
      seedVersionId: 'existing-seed-version',
      created: false,
    }))

    expect(mocks.state.inserts.some((item) => item.table === 'algorithm_seed_versions')).toBe(false)
    expect(mocks.state.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'algorithm_seed_versions',
        payload: expect.objectContaining({
          id: 'existing-seed-version',
          seed_type: 'workflow_dictionary',
          status: 'draft',
          is_current: false,
        }),
      }),
      expect.objectContaining({
        table: 'algorithm_seed_versions',
        payload: expect.objectContaining({
          status: 'active',
          is_current: true,
          published_by: 'user-1',
        }),
        filters: expect.arrayContaining([
          { op: 'eq', column: 'id', value: 'existing-seed-version' },
        ]),
      }),
    ]))
    expect(mocks.state.deletes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'algorithm_seed_records',
        filters: expect.arrayContaining([
          { op: 'eq', column: 'seed_version_id', value: 'existing-seed-version' },
        ]),
      }),
    ]))
  })

  it('rolls back the active seed version to the previous inactive version for the seed type', async () => {
    const result = await rollbackAlgorithmSeedVersion({
      seedType: 'workflow_dictionary',
      fromVersionId: 'current-version',
      toVersionId: 'previous-version',
      userId: 'user-1',
      reason: 'regression_found',
    })

    expect(result).toEqual({
      seedType: 'workflow_dictionary',
      fromVersionId: 'current-version',
      toVersionId: 'previous-version',
      rolledBack: true,
    })
    expect(mocks.state.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'algorithm_seed_versions',
        payload: expect.objectContaining({
          status: 'deprecated',
          is_current: false,
        }),
        filters: expect.arrayContaining([
          { op: 'eq', column: 'id', value: 'current-version' },
          { op: 'eq', column: 'seed_type', value: 'workflow_dictionary' },
        ]),
      }),
      expect.objectContaining({
        table: 'algorithm_seed_versions',
        payload: expect.objectContaining({
          status: 'active',
          is_current: true,
          published_by: 'user-1',
        }),
        filters: expect.arrayContaining([
          { op: 'eq', column: 'id', value: 'previous-version' },
          { op: 'eq', column: 'seed_type', value: 'workflow_dictionary' },
        ]),
      }),
    ]))
    expect(mocks.state.inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'algorithm_seed_import_logs',
        payload: expect.objectContaining({
          seed_version_id: 'previous-version',
          seed_type: 'workflow_dictionary',
          import_source: 'rollback',
          validation_result: expect.objectContaining({
            rollback: true,
            reason: 'regression_found',
            fromVersionId: 'current-version',
          }),
        }),
      }),
    ]))
  })
})
