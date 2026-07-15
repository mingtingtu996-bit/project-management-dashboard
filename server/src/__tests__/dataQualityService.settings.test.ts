import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'

const state = vi.hoisted(() => ({
  selectRows: [] as any[],
  upsertRows: [] as any[],
  updateCalls: [] as any[],
  notificationEmits: [] as any[],
  executeSQL: vi.fn(),
  rawQuery: vi.fn(async () => ({ rows: [] })),
  listTaskProgressSnapshotsByTaskIds: vi.fn(async () => []),
  getProjectCriticalPathSnapshot: vi.fn(async () => ({
    projectId: 'project-1',
    autoTaskIds: ['task-critical'],
    manualAttentionTaskIds: [],
    manualInsertedTaskIds: [],
    primaryChain: {
      id: 'primary',
      source: 'auto',
      taskIds: ['task-critical'],
      totalDurationDays: 0,
      displayLabel: '关键路径',
    },
    alternateChains: [],
    displayTaskIds: ['task-critical'],
    watchedTaskIds: [],
    edges: [],
    tasks: [],
    projectDurationDays: 0,
    calculatedAt: '2026-04-18T12:00:00.000Z',
  })),
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: state.executeSQL,
  listTaskProgressSnapshotsByTaskIds: state.listTaskProgressSnapshotsByTaskIds,
  supabase: {
    from: vi.fn(() => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(async () => ({ data: state.selectRows, error: null })),
        order: vi.fn(async () => ({ data: state.selectRows, error: null })),
        limit: vi.fn(async () => ({ data: state.selectRows, error: null })),
        upsert: vi.fn((payload: any) => {
          state.upsertRows = [payload]
          state.selectRows = Array.isArray(payload) ? payload : [payload]
          return builder
        }),
        update: vi.fn((payload: any) => {
          state.updateCalls.push(payload)
          return builder
        }),
        single: vi.fn(async () => ({ data: state.selectRows[0] ?? null, error: null })),
        then: vi.fn((resolve: any, reject: any) => Promise.resolve({ data: state.selectRows, error: null }).then(resolve, reject)),
      }
      return builder
    }),
  },
}))

vi.mock('../services/notificationStore.js', () => ({
  findNotification: vi.fn(async () => null),
  insertNotification: vi.fn(),
  listNotifications: vi.fn(async () => []),
  updateNotificationById: vi.fn(),
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: state.getProjectCriticalPathSnapshot,
}))

vi.mock('../services/notificationTouchpointService.js', () => ({
  notificationTouchpointService: {
    emit: vi.fn(async (payload: any) => {
      state.notificationEmits.push(payload)
      return payload
    }),
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { DataQualityService } = await import('../services/dataQualityService.js')

describe('DataQualityService project settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.selectRows = []
    state.upsertRows = []
    state.updateCalls = []
    state.notificationEmits = []
    state.rawQuery.mockResolvedValue({ rows: [] })
    state.getProjectCriticalPathSnapshot.mockResolvedValue({
      projectId: 'project-1',
      autoTaskIds: ['task-critical'],
      manualAttentionTaskIds: [],
      manualInsertedTaskIds: [],
      primaryChain: {
        id: 'primary',
        source: 'auto',
        taskIds: ['task-critical'],
        totalDurationDays: 0,
        displayLabel: '关键路径',
      },
      alternateChains: [],
      displayTaskIds: ['task-critical'],
      watchedTaskIds: [],
      edges: [],
      tasks: [],
      projectDurationDays: 0,
      calculatedAt: '2026-04-18T12:00:00.000Z',
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-18T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns normalized default weights when no project override exists', async () => {
    const service = new DataQualityService()

    const settings = await service.getProjectSettings('project-1')

    expect(settings).toMatchObject({
      projectId: 'project-1',
      isDefault: true,
      weights: {
        timeliness: 0.3,
        anomaly: 0.25,
        consistency: 0.2,
        jumpiness: 0.1,
        coverage: 0.15,
      },
    })
  })

  it('uses project weights when building confidence scores', async () => {
    const service = new DataQualityService()

    const tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: '任务 1',
        status: 'in_progress',
        progress: 20,
        updated_at: '2026-04-01T00:00:00.000Z',
        created_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-1',
        title: '任务 2',
        status: 'in_progress',
        progress: 60,
        updated_at: '2026-04-17T00:00:00.000Z',
        created_at: '2026-04-01T00:00:00.000Z',
      },
    ] as any

    const snapshots = [
      {
        id: 'snapshot-1',
        task_id: 'task-2',
        progress: 60,
        snapshot_date: '2026-04-17T00:00:00.000Z',
        created_at: '2026-04-17T00:00:00.000Z',
      },
    ] as any

    const findings = [
      {
        id: 'finding-1',
        project_id: 'project-1',
        task_id: 'task-1',
        rule_type: 'anomaly',
        rule_code: 'SNAPSHOT_GAP',
        status: 'active',
        severity: 'warning',
      },
    ] as any

    const mostlyTimeliness = (service as any).computeConfidence('2026-04', tasks, snapshots, findings, {
      timeliness: 1,
      anomaly: 0,
      consistency: 0,
      jumpiness: 0,
      coverage: 0,
    })
    const mostlyConsistency = (service as any).computeConfidence('2026-04', tasks, snapshots, findings, {
      timeliness: 0,
      anomaly: 0,
      consistency: 1,
      jumpiness: 0,
      coverage: 0,
    })

    expect(mostlyTimeliness.score).toBe(50)
    expect(mostlyConsistency.score).toBe(100)
    expect(mostlyConsistency.weights.consistency).toBe(1)
    expect(mostlyTimeliness.dimensions[0]).toMatchObject({
      key: 'timeliness',
      lossContribution: 50,
    })
  })

  it('returns low confidence instead of a high default score when there are no assessable tasks', async () => {
    const service = new DataQualityService()

    const confidence = (service as any).computeConfidence('2026-04', [], [], [], {
      timeliness: 0.3,
      anomaly: 0.25,
      consistency: 0.2,
      jumpiness: 0.1,
      coverage: 0.15,
    })

    expect(confidence).toMatchObject({
      score: 0,
      flag: 'low',
      note: '缺少可评估任务数据，仅供参考',
      timelinessScore: 0,
      anomalyScore: 0,
      consistencyScore: 0,
      coverageScore: 0,
      jumpinessScore: 0,
    })
    expect(confidence.dimensions.every((dimension: any) => dimension.score === 0)).toBe(true)
  })

  it('previews live cross-check prompts for the edited task draft', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) {
        return [
          {
            id: 'task-parent',
            project_id: 'project-1',
            title: '主体结构',
            status: 'completed',
            progress: 100,
            updated_at: '2026-04-18T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
          },
          {
            id: 'task-child',
            project_id: 'project-1',
            title: '二层梁板施工',
            parent_id: 'task-parent',
            status: 'pending',
            progress: 0,
            updated_at: '2026-04-18T00:00:00.000Z',
            created_at: '2026-04-01T00:00:00.000Z',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) {
        return []
      }

      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) {
        return []
      }

      return []
    })

    const service = new DataQualityService()

    const summary = await service.previewTaskLiveCheck(
      'project-1',
      {
        id: 'task-parent',
        status: 'completed',
        progress: 100,
      } as any,
      'task-parent',
    )

    expect(summary.count).toBe(1)
    expect(summary.summary).toContain('1 条任务存在数据矛盾')
    expect(summary.items[0]).toMatchObject({
      ruleCode: 'PARENT_CHILD_INCONSISTENT',
    })
  })

  it('uses the shared rule registry for prompt recommendations and exported extended rules', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) {
        return [
          {
            id: 'task-generated',
            project_id: 'project-1',
            title: 'generated task missing lineage',
            status: 'in_progress',
            progress: 10,
            template_id: 'template-1',
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-18T00:00:00.000Z',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) return []
      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) return []
      if (query.includes('FROM data_lineage_links WHERE target_entity_type')) return []
      if (query.includes('FROM acceptance_plans WHERE project_id = ?')) return []
      if (query.includes('FROM project_data_quality_settings')) return []

      return []
    })

    const service = new DataQualityService()

    const summary = await service.buildProjectSummary('project-1')

    const lineageItem = summary.prompt.items.find((item) => item.ruleCode === 'LINEAGE_INCOMPLETE')
    expect(lineageItem).toMatchObject({
      recommendation: '请补齐任务来源映射，确保模板、基线或月度计划生成链路可追溯。',
    })
    expect(summary.extendedRules).toContain('LINEAGE_INCOMPLETE')
    expect(summary.extendedRules).toContain('MATERIAL_ARRIVAL_OVERDUE')
    expect(new Set(summary.extendedRules).size).toBe(summary.extendedRules?.length)
  })

  it('detects registered material quality rules from runtime project materials', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) return []
      if (query.includes('FROM task_conditions WHERE project_id = ?')) return []
      if (query.includes('FROM data_lineage_links WHERE target_entity_type')) return []
      if (query.includes('FROM acceptance_plans WHERE project_id = ?')) return []
      if (query.includes('FROM deletion_retention_events WHERE project_id = ?')) return []
      if (query.includes('FROM project_daily_snapshot WHERE project_id = ?')) return []
      if (query.includes('FROM project_data_quality_settings')) return []
      if (query.includes('FROM project_materials WHERE project_id = ?')) {
        return [
          {
            id: 'material-1',
            project_id: 'project-1',
            material_name: 'concrete',
            participant_unit_id: null,
            specialty_type: null,
            requires_sample_confirmation: true,
            sample_confirmed: false,
            expected_arrival_date: '2026-04-15',
            actual_arrival_date: null,
            record_status: 'active',
            lifecycle_status: 'active',
          },
          {
            id: 'material-archived',
            project_id: 'project-1',
            material_name: 'archived steel',
            participant_unit_id: null,
            specialty_type: null,
            requires_sample_confirmation: true,
            sample_confirmed: false,
            expected_arrival_date: '2026-04-01',
            actual_arrival_date: null,
            record_status: 'archived',
            lifecycle_status: 'archived',
          },
        ]
      }

      return []
    })

    const service = new DataQualityService()

    const summary = await service.buildProjectSummary('project-1')
    const activeMaterialCodes = summary.findings
      .filter((finding) => finding.entity_type === 'project_material' && finding.entity_id === 'material-1')
      .map((finding) => finding.rule_code)

    expect(activeMaterialCodes).toEqual(expect.arrayContaining([
      'MATERIAL_SPECIALTY_MISSING',
      'MATERIAL_UNIT_MISSING',
      'MATERIAL_ARRIVAL_OVERDUE',
      'MATERIAL_SAMPLE_PENDING',
    ]))
    expect(summary.findings.some((finding) => finding.entity_id === 'material-archived')).toBe(false)
    expect(summary.findings.find((finding) => finding.rule_code === 'MATERIAL_ARRIVAL_OVERDUE')).toMatchObject({
      quality_dimension: 'timeliness',
      source_type: 'project_materials',
    })
  })

  it('detects retention and metric caliber rule assets from governance tables', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) return []
      if (query.includes('FROM task_conditions WHERE project_id = ?')) return []
      if (query.includes('FROM data_lineage_links WHERE target_entity_type')) return []
      if (query.includes('FROM acceptance_plans WHERE project_id = ?')) return []
      if (query.includes('FROM project_materials WHERE project_id = ?')) return []
      if (query.includes('FROM project_data_quality_settings')) return []
      if (query.includes('FROM deletion_retention_events WHERE project_id = ?')) {
        return [
          {
            id: 'retention-expired',
            project_id: 'project-1',
            entity_type: 'task',
            entity_id: 'task-deleted',
            entity_name_snapshot: 'deleted task',
            requested_action: 'delete',
            resolved_action: 'soft_delete',
            execution_status: 'pending_confirmation',
            requires_user_confirmation: true,
            decision_token_hash: 'expired-token-hash',
            expires_at: '2026-04-10T00:00:00.000Z',
            confirmed_at: null,
          },
          {
            id: 'retention-current',
            project_id: 'project-1',
            entity_type: 'task',
            entity_id: 'task-current',
            execution_status: 'pending_confirmation',
            requires_user_confirmation: true,
            decision_token_hash: 'current-token-hash',
            expires_at: '2026-04-20T00:00:00.000Z',
            confirmed_at: null,
          },
          {
            id: 'retention-failed',
            project_id: 'project-1',
            entity_type: 'project_material',
            entity_id: 'material-1',
            entity_name_snapshot: 'failed material retention',
            requested_action: 'delete',
            resolved_action: 'archive',
            execution_status: 'failed',
            requires_user_confirmation: true,
            decision_token_hash: 'failed-token-hash',
            expires_at: '2026-04-20T00:00:00.000Z',
            confirmed_at: null,
            confirmation_metadata: {
              last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
              last_error_message: 'material update failed',
            },
          },
          {
            id: 'retention-stale-confirming',
            project_id: 'project-1',
            entity_type: 'construction_drawing',
            entity_id: 'drawing-1',
            entity_name_snapshot: 'stale drawing retention',
            requested_action: 'delete',
            resolved_action: 'archive',
            execution_status: 'confirming',
            requires_user_confirmation: true,
            decision_token_hash: 'confirming-token-hash',
            expires_at: '2026-04-20T00:00:00.000Z',
            confirmed_at: null,
            confirmation_metadata: {
              reserved_at: '2026-04-18T11:40:00.000Z',
              recovery_attempts: 1,
            },
          },
        ]
      }
      if (query.includes('FROM project_daily_snapshot WHERE project_id = ?')) {
        return [
          {
            id: 'snapshot-1',
            project_id: 'project-1',
            snapshot_date: '2026-04-18',
            metric_availability: {
              business_health_score: 'insufficient_data',
              overall_progress: 'ready',
              plan_governance_score: 'source_unavailable',
              archived_metric: 'not_applicable',
            },
            metric_registry_version: '',
            metric_snapshot_version: null,
          },
        ]
      }

      return []
    })

    const service = new DataQualityService()

    const summary = await service.buildProjectSummary('project-1')
    const ruleCodes = summary.findings.map((finding) => finding.rule_code)

    expect(ruleCodes).toEqual(expect.arrayContaining([
      'RETENTION_DECISION_EXPIRED',
      'RETENTION_CONFIRMATION_FAILED',
      'RETENTION_CONFIRMING_STALE',
      'METRIC_CALIBER_MISSING',
      'METRIC_VALUE_UNAVAILABLE',
    ]))
    expect(summary.findings.some((finding) => finding.entity_id === 'retention-current')).toBe(false)
    expect(summary.findings.find((finding) => finding.rule_code === 'RETENTION_CONFIRMATION_FAILED')?.details_json).toMatchObject({
      last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
      last_error_message: 'material update failed',
    })
    expect(summary.findings.find((finding) => finding.rule_code === 'RETENTION_CONFIRMING_STALE')?.details_json).toMatchObject({
      recovery_attempts: 1,
    })
    expect(summary.findings.find((finding) => finding.rule_code === 'METRIC_VALUE_UNAVAILABLE')?.details_json).toMatchObject({
      unavailable_metrics: ['business_health_score', 'plan_governance_score'],
    })
  })

  it('does not auto-resolve existing findings when a governed source table read fails', async () => {
    state.selectRows = [
      {
        id: 'finding-material-1',
        finding_key: 'MATERIAL_UNIT_MISSING:project:material-1',
        project_id: 'project-1',
        task_id: null,
        rule_code: 'MATERIAL_UNIT_MISSING',
        rule_type: 'completeness',
        severity: 'warning',
        dimension_key: 'material:material-1',
        summary: 'existing material unit missing',
        details_json: {},
        detected_at: '2026-04-10T00:00:00.000Z',
        resolved_at: null,
        status: 'active',
        entity_type: 'project_material',
        entity_id: 'material-1',
        quality_dimension: 'completeness',
        source_type: 'project_materials',
      },
    ]
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) return []
      if (query.includes('FROM task_conditions WHERE project_id = ?')) return []
      if (query.includes('FROM data_lineage_links WHERE target_entity_type')) return []
      if (query.includes('FROM acceptance_plans WHERE project_id = ?')) return []
      if (query.includes('FROM deletion_retention_events WHERE project_id = ?')) return []
      if (query.includes('FROM project_daily_snapshot WHERE project_id = ?')) return []
      if (query.includes('FROM project_data_quality_settings')) return []
      if (query.includes('FROM projects WHERE id = ?')) return [{ id: 'project-1', owner_id: 'owner-1' }]
      if (query.includes('FROM project_members WHERE project_id = ?')) return []
      if (query.includes('FROM project_materials WHERE project_id = ?')) {
        throw new Error('project_materials unavailable')
      }

      return []
    })

    const service = new DataQualityService()

    const summary = await service.syncProjectDataQuality('project-1')

    expect(summary.findings.some((finding) => finding.id === 'finding-material-1' && finding.status === 'active')).toBe(true)
    expect(state.updateCalls).not.toContainEqual(expect.objectContaining({
      status: 'resolved',
    }))
  })

  it('keeps backend governance findings out of owner digest notification policy', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) return []
      if (query.includes('FROM task_conditions WHERE project_id = ?')) return []
      if (query.includes('FROM data_lineage_links WHERE target_entity_type')) return []
      if (query.includes('FROM acceptance_plans WHERE project_id = ?')) return []
      if (query.includes('FROM project_materials WHERE project_id = ?')) return []
      if (query.includes('FROM project_data_quality_settings')) return []
      if (query.includes('FROM projects WHERE id = ?')) return [{ id: 'project-1', owner_id: 'owner-1' }]
      if (query.includes('FROM project_members WHERE project_id = ?')) return []
      if (query.includes('FROM deletion_retention_events WHERE project_id = ?')) {
        return [
          {
            id: 'retention-expired-1',
            project_id: 'project-1',
            entity_type: 'task',
            entity_id: 'task-deleted-1',
            entity_name_snapshot: 'deleted task 1',
            execution_status: 'expired',
            requires_user_confirmation: true,
            decision_token_hash: 'expired-token-hash-1',
            expires_at: '2026-04-10T00:00:00.000Z',
            confirmed_at: null,
          },
          {
            id: 'retention-expired-2',
            project_id: 'project-1',
            entity_type: 'task',
            entity_id: 'task-deleted-2',
            entity_name_snapshot: 'deleted task 2',
            execution_status: 'expired',
            requires_user_confirmation: true,
            decision_token_hash: 'expired-token-hash-2',
            expires_at: '2026-04-10T00:00:00.000Z',
            confirmed_at: null,
          },
          {
            id: 'retention-expired-3',
            project_id: 'project-1',
            entity_type: 'task',
            entity_id: 'task-deleted-3',
            entity_name_snapshot: 'deleted task 3',
            execution_status: 'expired',
            requires_user_confirmation: true,
            decision_token_hash: 'expired-token-hash-3',
            expires_at: '2026-04-10T00:00:00.000Z',
            confirmed_at: null,
          },
        ]
      }
      if (query.includes('FROM project_daily_snapshot WHERE project_id = ?')) {
        return [
          {
            id: 'snapshot-1',
            project_id: 'project-1',
            snapshot_date: '2026-04-18',
            metric_availability: {
              business_health_score: 'source_unavailable',
              plan_governance_score: 'insufficient_data',
              overall_progress: 'ready',
            },
            metric_registry_version: '',
            metric_snapshot_version: null,
          },
        ]
      }

      return []
    })

    const service = new DataQualityService()

    const summary = await service.syncProjectDataQuality('project-1')
    const { getDataQualityRuleDefinition } = await import('../services/dataQualityRuleRegistry.js')

    expect(summary.findings.map((finding) => finding.rule_code)).toEqual(expect.arrayContaining([
      'RETENTION_DECISION_EXPIRED',
      'METRIC_CALIBER_MISSING',
      'METRIC_VALUE_UNAVAILABLE',
    ]))
    expect(getDataQualityRuleDefinition('RETENTION_DECISION_EXPIRED')).toMatchObject({ ownerDigestPolicy: 'silent' })
    expect(getDataQualityRuleDefinition('RETENTION_CONFIRMATION_FAILED')).toMatchObject({ ownerDigestPolicy: 'silent' })
    expect(getDataQualityRuleDefinition('RETENTION_CONFIRMING_STALE')).toMatchObject({ ownerDigestPolicy: 'silent' })
    expect(getDataQualityRuleDefinition('METRIC_CALIBER_MISSING')).toMatchObject({ ownerDigestPolicy: 'silent' })
    expect(getDataQualityRuleDefinition('METRIC_VALUE_UNAVAILABLE')).toMatchObject({ ownerDigestPolicy: 'silent' })
    expect(summary.ownerDigest).toMatchObject({
      shouldNotify: false,
    })
    expect(state.notificationEmits).not.toContainEqual(expect.objectContaining({
      type: 'data_quality_digest',
    }))
  })

  it('keeps runtime rule registry aligned with seeded data quality rule assets', async () => {
    const { readFileSync } = await import('node:fs')
    const { DATA_QUALITY_RULE_REGISTRY } = await import('../services/dataQualityRuleRegistry.js')
    const seededSql = [
      readFileSync(new URL('../../migrations/134_v1416_data_quality_governance.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../../migrations/139a_v1421_material_lifecycle_fields.sql', import.meta.url), 'utf8'),
    ].join('\n')

    const seededRuleCodes = [...seededSql.matchAll(/\('([A-Z0-9_]+)',\s*'[^']+',\s*'[^']+',\s*'(critical|warning|info)'/g)]
      .map((match) => match[1])
      .filter((code) => code.includes('_'))

    const runtimeCodes = DATA_QUALITY_RULE_REGISTRY.map((rule) => rule.ruleCode)
    expect(new Set(runtimeCodes).size).toBe(runtimeCodes.length)
    expect(runtimeCodes).toEqual(expect.arrayContaining(seededRuleCodes))
  })

  it('keeps extended quality dimension weights normalized after registry expansion', async () => {
    const { buildProjectQualitySummary } = await import('../services/dataQualityGovernanceService.js')

    const summary = await buildProjectQualitySummary('project-1')

    const totalWeight = summary.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0)
    expect(totalWeight).toBeCloseTo(1, 5)
    expect(summary.confidenceScore).toBeLessThanOrEqual(100)
    expect(summary.dimensions.map((dimension) => dimension.dimension)).toEqual(
      expect.arrayContaining(['retention', 'metric_caliber']),
    )
  })

  it('maps progress filling anomalies into data quality findings and learning exclusions', async () => {
    const service = new DataQualityService()

    const findings = await (service as any).detectProgressJumpFindings(
      'project-1',
      [
        {
          id: 'task-1',
          project_id: 'project-1',
          title: 'month end burst task',
          status: 'in_progress',
          progress: 82,
          assignee_name: 'site manager',
        },
        {
          id: 'task-low-source',
          project_id: 'project-1',
          title: 'low source task',
          status: 'in_progress',
          progress: 35,
        },
        {
          id: 'task-rollback',
          project_id: 'project-1',
          title: 'rollback task',
          status: 'in_progress',
          progress: 45,
        },
        {
          id: 'task-duplicate',
          project_id: 'project-1',
          title: 'duplicate progress task',
          status: 'in_progress',
          progress: 45,
        },
      ],
      new Map([
        ['task-1', [
          { id: 's1', task_id: 'task-1', progress: 20, snapshot_date: '2026-05-27', created_at: '2026-05-27T08:00:00.000Z' },
          { id: 's2', task_id: 'task-1', progress: 82, snapshot_date: '2026-05-29', created_at: '2026-05-29T08:00:00.000Z' },
        ]],
        ['task-low-source', [
          { id: 's3', task_id: 'task-low-source', progress: 20, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z', event_source: 'excel_import' },
          { id: 's4', task_id: 'task-low-source', progress: 35, snapshot_date: '2026-05-02', created_at: '2026-05-02T08:00:00.000Z', event_source: 'batch_update' },
        ]],
        ['task-rollback', [
          { id: 's5', task_id: 'task-rollback', progress: 70, snapshot_date: '2026-05-03', created_at: '2026-05-03T08:00:00.000Z', event_source: 'manual' },
          { id: 's6', task_id: 'task-rollback', progress: 45, snapshot_date: '2026-05-04', created_at: '2026-05-04T08:00:00.000Z', event_source: 'manual' },
        ]],
        ['task-duplicate', [
          { id: 's7', task_id: 'task-duplicate', progress: 45, snapshot_date: '2026-05-01', created_at: '2026-05-01T08:00:00.000Z', event_source: 'manual' },
          { id: 's8', task_id: 'task-duplicate', progress: 45, snapshot_date: '2026-05-03', created_at: '2026-05-03T08:00:00.000Z', event_source: 'manual' },
          { id: 's9', task_id: 'task-duplicate', progress: 45, snapshot_date: '2026-05-06', created_at: '2026-05-06T08:00:00.000Z', event_source: 'manual' },
        ]],
      ]),
    )

    expect(findings.map((finding: any) => finding.rule_code)).toEqual(
      expect.arrayContaining([
        'PROGRESS_MONTH_END_BURST',
        'PROGRESS_JUMP',
        'PROGRESS_SOURCE_LOW_CONFIDENCE',
        'PROGRESS_ROLLBACK',
        'PROGRESS_DUPLICATE_FILL',
      ]),
    )
    expect(findings.find((finding: any) => finding.rule_code === 'PROGRESS_SOURCE_LOW_CONFIDENCE').details_json.source_confidence_related).toBe(true)
    expect(findings.find((finding: any) => finding.rule_code === 'PROGRESS_ROLLBACK').details_json.excluded_from_velocity_learning).toBe(true)
    expect(findings.find((finding: any) => finding.rule_code === 'PROGRESS_DUPLICATE_FILL').details_json.anomaly_code).toBe('duplicate_progress_fill')
  })

  it('only emits individual progress trend warnings for critical path tasks', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) {
        return [
          {
            id: 'task-critical',
            project_id: 'project-1',
            title: '关键路径主体结构',
            status: 'in_progress',
            progress: 20,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: true,
            assignee_name: '张工',
          },
          {
            id: 'task-normal',
            project_id: 'project-1',
            title: '普通任务机电深化',
            status: 'in_progress',
            progress: 20,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '张工',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) {
        return []
      }

      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) {
        return []
      }

      return []
    })

    const service = new DataQualityService()

    const warnings = await service.scanTrendWarnings('project-1')

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      task_id: 'task-critical',
      warning_type: 'progress_trend_delay',
    })
  })

  it('folds non-critical progress trend findings into the owner digest summary', async () => {
    state.executeSQL.mockImplementation(async (query: string) => {
      if (query.includes('FROM tasks task')) {
        return [
          {
            id: 'task-1',
            project_id: 'project-1',
            title: '机电深化一',
            status: 'in_progress',
            progress: 10,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '李工',
          },
          {
            id: 'task-2',
            project_id: 'project-1',
            title: '机电深化二',
            status: 'in_progress',
            progress: 15,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '李工',
          },
          {
            id: 'task-3',
            project_id: 'project-1',
            title: '机电深化三',
            status: 'in_progress',
            progress: 12,
            planned_start_date: '2026-04-01',
            planned_end_date: '2026-04-20',
            is_critical: false,
            assignee_name: '李工',
          },
        ]
      }

      if (query.includes('FROM task_conditions WHERE project_id = ?')) {
        return []
      }

      if (query.includes('FROM task_progress_snapshots WHERE task_id IN')) {
        return []
      }

      return []
    })

    const service = new DataQualityService()

    const summary = await service.buildProjectSummary('project-1')

    expect(summary.ownerDigest).toMatchObject({
      shouldNotify: true,
      scopeLabel: '李工',
    })
    expect(summary.ownerDigest.findingCount).toBeGreaterThanOrEqual(3)
    const trendFinding = summary.findings.find((finding) => finding.rule_code === 'TREND_DELAY')
    expect(trendFinding?.details_json).toEqual(expect.objectContaining({
      plannedRemainingDays: expect.any(Number),
    }))
    expect(trendFinding?.details_json).not.toHaveProperty('remaining_days')
    expect(summary.ownerDigest.summary).toContain('进度趋势异常')
  })
})
