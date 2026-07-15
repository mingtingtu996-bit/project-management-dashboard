import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const runs: any[] = []
  const runtimePublications: any[] = []
  const tables: Record<string, any[]> = {
    acceptance_template_policy_auto_publish_runs: runs,
    policy_template_entity_runtime_publications: runtimePublications,
  }
  function createQuery(table: string) {
    const filters: Array<{ column: string, value: unknown }> = []
    let orderColumn: string | null = null
    let orderAscending = false
    let rowLimit: number | null = null
    const readRows = () => {
      let rows = [...(tables[table] ?? [])].filter((row) => (
        filters.every((filter) => row[filter.column] === filter.value)
      ))
      if (orderColumn) {
        rows = rows.sort((left, right) => {
          const leftValue = left[orderColumn as string] ?? ''
          const rightValue = right[orderColumn as string] ?? ''
          if (leftValue === rightValue) return 0
          return leftValue > rightValue
            ? orderAscending ? 1 : -1
            : orderAscending ? -1 : 1
        })
      }
      return typeof rowLimit === 'number' ? rows.slice(0, rowLimit) : rows
    }
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return query
      }),
      order: vi.fn((column: string, options?: { ascending?: boolean }) => {
        orderColumn = column
        orderAscending = options?.ascending === true
        return query
      }),
      limit: vi.fn((limit: number) => {
        rowLimit = limit
        return query
      }),
      maybeSingle: vi.fn(async () => ({ data: readRows()[0] ?? null, error: null })),
      insert: vi.fn(async (record: any) => {
        const rows = tables[table] ?? runs
        if (Array.isArray(record)) rows.push(...record)
        else rows.push(record)
        return { data: record, error: null }
      }),
    }
    return query
  }
  const executeSQL = vi.fn(async () => [])
  const executeSQLOne = vi.fn(async () => null)
  const rawQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }))
  const client = {
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  }
  return {
    runs,
    runtimePublications,
    from: vi.fn((table: string) => createQuery(table)),
    executeSQL,
    executeSQLOne,
    rawQuery,
    getClient: vi.fn(async () => client),
    client,
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: state.from,
  },
  executeSQL: state.executeSQL,
  executeSQLOne: state.executeSQLOne,
}))

vi.mock('../database.js', () => ({
  getClient: state.getClient,
  query: state.rawQuery,
}))

describe('acceptance template policy auto-publish end-to-end runtime contract', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    state.runs.length = 0
    state.runtimePublications.length = 0
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      name: '北京普通办公项目',
      business_type: 'commercial office',
      project_type: 'office',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
      },
    })
    state.rawQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    state.client.query.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('includes province-level shared profiles in trusted-source auto-publish candidates', async () => {
    const {
      buildAcceptancePolicyUpdateCandidates,
      buildAcceptancePolicyAutoPublishPlanWithSourceSnapshots,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')

    const requiredProvinceCodes = [
      'GD',
      'JS',
      'ZJ',
      'SH',
      'AH',
      'FJ',
      'JX',
      'SD',
      'BJ',
      'TJ',
      'HE',
      'SX',
      'NM',
      'LN',
      'JL',
      'HLJ',
      'HA',
      'HB',
      'HN',
      'GX',
      'HI',
      'CQ',
      'SC',
      'GZ',
      'YN',
      'XZ',
      'SN',
      'GS',
      'QH',
      'NX',
      'XJ',
    ]
    const candidates = buildAcceptancePolicyUpdateCandidates()
    const plan = await buildAcceptancePolicyAutoPublishPlanWithSourceSnapshots({ asOfDate: '2026-09-01' })
    const provinceCandidates = candidates.filter((candidate) => candidate.assetCode.endsWith(':province'))

    expect(provinceCandidates.length).toBeGreaterThanOrEqual(requiredProvinceCodes.length)
    expect(provinceCandidates.map((candidate) => candidate.provinceCode)).toEqual(expect.arrayContaining(requiredProvinceCodes))
    expect(candidates.map((candidate) => candidate.assetCode)).toEqual(expect.arrayContaining(
      requiredProvinceCodes.map((provinceCode) => `region_profile:${provinceCode}:province`),
    ))
    expect(provinceCandidates.every((candidate) => candidate.sourceHealth === 'healthy')).toBe(true)
    expect(provinceCandidates.every((candidate) => candidate.updateStatus === 'auto_publish_candidate')).toBe(true)
    expect(candidates.find((candidate) => candidate.assetCode === 'region_profile:SD:province')).toMatchObject({
      provinceCode: 'SD',
      cityCode: undefined,
      sourceHealth: 'healthy',
      updateStatus: 'auto_publish_candidate',
      runtimeConsumptionPolicy: 'auto_published_seed_after_job',
    })
    expect(plan.autoPublishedUpdates.map((update) => update.assetCode)).toEqual(expect.arrayContaining(
      requiredProvinceCodes.map((provinceCode) => `region_profile:${provinceCode}:province`),
    ))
    expect(plan.automationQuality.sourceCoverage).toMatchObject({
      missingOrWeakSourceAssetCount: 0,
      coverageStatus: 'ready',
    })
  })

  it('keeps a golden replay baseline for cold-start automation without pretending it is real project data', async () => {
    const {
      buildAcceptancePolicyAutoPublishPlanWithSourceSnapshots,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')

    const plan = await buildAcceptancePolicyAutoPublishPlanWithSourceSnapshots({ asOfDate: '2026-09-01' })

    expect(plan.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 0,
      status: 'needs_more_samples',
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    })
    expect(plan.automationQuality.goldenReplayBaseline).toMatchObject({
      sampleCount: expect.any(Number),
      calibratedSampleCount: expect.any(Number),
      itemMatchRate: 1,
      resultDocumentMatchRate: 1,
      authorityMatchRate: 1,
      status: 'baseline_ready',
      baselinePolicy: 'cold_start_regression_only_not_real_project_calibration',
    })
    expect(plan.automationQuality.goldenReplayBaseline.sampleCount).toBeGreaterThanOrEqual(3)
  })

  it('keeps a low-risk trusted-source run as an audit-only candidate until PolicyOps gates pass', async () => {
    const {
      buildAcceptancePolicySourceSnapshot,
      parseAcceptancePolicyStructuredFacts,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')
    const { AcceptanceTemplatePolicyAutoPublishJob } = await import('../jobs/acceptanceTemplatePolicyAutoPublishJob.js')

    const facts = parseAcceptancePolicyStructuredFacts(`
      建设项目联合验收事项：综合验收、环卫设施验收。
      综合验收办理结果：联合验收电子意见书。
      办理部门：工程建设项目联合验收牵头部门。
    `)
    const job = new AcceptanceTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      sourceSnapshotProvider: async (source) => buildAcceptancePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-low-risk-hash',
        fetchText: async () => `
          建设项目联合验收事项：综合验收、环卫设施验收。
          综合验收办理结果：联合验收电子意见书。
          办理部门：工程建设项目联合验收牵头部门。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'region_profile:BJ:BJ',
          publishedRuleOverlay: expect.objectContaining({
            additionalItemCodes: expect.arrayContaining(['sanitation_facility_acceptance']),
            resultDocumentAdditions: expect.objectContaining({
              comprehensive_acceptance: expect.arrayContaining(['联合验收电子意见书']),
            }),
          }),
        }),
      ]),
    )
    expect(run?.policyOpsDecision).toMatchObject({
      runtimeConsumptionStatus: 'candidate_only',
      promotionDecision: 'hold_as_candidate_overlay',
      stableConsumptionAllowed: false,
      reasonCodes: expect.any(Array),
    })
    expect(state.runs).toHaveLength(1)

    vi.resetModules()
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)
    const comprehensive = preview.items.find((item) => item.itemCode === 'comprehensive_acceptance')

    expect(names).not.toContain('环卫设施验收')
    expect(comprehensive?.resultDocuments).not.toEqual(expect.arrayContaining(['联合验收电子意见书']))
    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'BJ',
      cityCode: 'BJ',
      profileVersion: 'v1.4.22.5',
    })
    expect(JSON.stringify(preview)).not.toContain('sourceSnapshots')
    expect(JSON.stringify(preview)).not.toContain('structuredPolicyFacts')
    expect(JSON.stringify(preview)).not.toContain('policyRuleDiffs')
    expect(JSON.stringify(preview)).not.toContain('publishedRuleOverlay')

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-sanitation',
      name: '北京带垃圾分类设施办公项目',
      business_type: 'commercial office',
      project_type: 'office',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            acceptanceSpecialties: ['垃圾分类设施', '环卫设施验收'],
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
      },
    })
    const sanitationPreview = await buildAcceptanceTemplatePreview('project-sanitation')
    expect(sanitationPreview.items.map((item) => item.itemName)).toEqual(expect.arrayContaining(['环卫设施验收']))
  })

  it('keeps auto-published water-environment specialties condition-gated for ordinary projects', async () => {
    const {
      buildAcceptancePolicySourceSnapshot,
      parseAcceptancePolicyStructuredFacts,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')
    const { AcceptanceTemplatePolicyAutoPublishJob } = await import('../jobs/acceptanceTemplatePolicyAutoPublishJob.js')

    const facts = parseAcceptancePolicyStructuredFacts(`
      建设项目联合验收事项：综合验收、水保验收、节水设施核验、海绵专项核验。
      综合验收办理结果：联合验收电子意见书。
      办理部门：工程建设项目联合验收牵头部门。
    `)
    const job = new AcceptanceTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      sourceSnapshotProvider: async (source) => buildAcceptancePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-water-environment-hash',
        fetchText: async () => `
          建设项目联合验收事项：综合验收、水保验收、节水设施核验、海绵专项核验。
          综合验收办理结果：联合验收电子意见书。
          办理部门：工程建设项目联合验收牵头部门。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.policyOpsDecision).toMatchObject({
      runtimeConsumptionStatus: 'candidate_only',
      stableConsumptionAllowed: false,
      reasonCodes: expect.any(Array),
    })
    expect(run?.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'region_profile:BJ:BJ',
          publishedRuleOverlay: expect.objectContaining({
            additionalItemCodes: expect.arrayContaining([
              'water_conservation_acceptance',
              'water_saving_acceptance',
              'sponge_city_acceptance',
            ]),
          }),
        }),
      ]),
    )

    vi.resetModules()
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const ordinaryPreview = await buildAcceptanceTemplatePreview('project-1')
    const ordinaryItemCodes = ordinaryPreview.items.map((item) => item.itemCode)

    expect(ordinaryPreview.regionProfile).toMatchObject({
      provinceCode: 'BJ',
      cityCode: 'BJ',
      profileVersion: 'v1.4.22.5',
    })
    expect(ordinaryItemCodes).not.toContain('water_conservation_acceptance')
    expect(ordinaryItemCodes).not.toContain('water_saving_acceptance')
    expect(ordinaryItemCodes).not.toContain('sponge_city_acceptance')

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-2',
      name: '北京海绵节水水保项目',
      business_type: 'commercial office',
      project_type: 'office',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            acceptanceSpecialties: ['水土保持方案', '节水设施', '中水系统', '海绵城市', '雨水调蓄'],
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
      },
    })
    const featurePreview = await buildAcceptanceTemplatePreview('project-2')
    const featureItemCodes = featurePreview.items.map((item) => item.itemCode)

    expect(featureItemCodes).toEqual(expect.arrayContaining([
      'water_conservation_acceptance',
      'water_saving_acceptance',
      'sponge_city_acceptance',
    ]))
  })

  it('keeps auto-published operation safety specialties condition-gated for ordinary projects', async () => {
    const {
      buildAcceptancePolicySourceSnapshot,
      parseAcceptancePolicyStructuredFacts,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')
    const { AcceptanceTemplatePolicyAutoPublishJob } = await import('../jobs/acceptanceTemplatePolicyAutoPublishJob.js')

    const facts = parseAcceptancePolicyStructuredFacts(`
      建设项目联合验收事项：综合验收、垃圾分类设施验收、道路开口验收、停车交通组织核验、疾控卫生核验、国家安全事项验收、公众聚集场所消防安全检查。
      综合验收办理结果：联合验收电子意见书。
      办理部门：工程建设项目联合验收牵头部门。
    `)
    const job = new AcceptanceTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      sourceSnapshotProvider: async (source) => buildAcceptancePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-operation-safety-hash',
        fetchText: async () => `
          建设项目联合验收事项：综合验收、垃圾分类设施验收、道路开口验收、停车交通组织核验、疾控卫生核验、国家安全事项验收、公众聚集场所消防安全检查。
          综合验收办理结果：联合验收电子意见书。
          办理部门：工程建设项目联合验收牵头部门。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.policyOpsDecision).toMatchObject({
      runtimeConsumptionStatus: 'candidate_only',
      stableConsumptionAllowed: false,
      reasonCodes: expect.any(Array),
    })
    expect(run?.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'region_profile:BJ:BJ',
          publishedRuleOverlay: expect.objectContaining({
            additionalItemCodes: expect.arrayContaining([
              'sanitation_facility_acceptance',
              'traffic_access_acceptance',
              'health_acceptance',
              'national_security_acceptance',
              'public_assembly_fire_safety_check',
            ]),
          }),
        }),
      ]),
    )

    vi.resetModules()
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const ordinaryPreview = await buildAcceptanceTemplatePreview('project-1')
    const ordinaryItemCodes = ordinaryPreview.items.map((item) => item.itemCode)

    expect(ordinaryPreview.regionProfile).toMatchObject({
      provinceCode: 'BJ',
      cityCode: 'BJ',
      profileVersion: 'v1.4.22.5',
    })
    expect(ordinaryItemCodes).not.toContain('sanitation_facility_acceptance')
    expect(ordinaryItemCodes).not.toContain('traffic_access_acceptance')
    expect(ordinaryItemCodes).not.toContain('health_acceptance')
    expect(ordinaryItemCodes).not.toContain('national_security_acceptance')
    expect(ordinaryItemCodes).not.toContain('public_assembly_fire_safety_check')

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-2',
      name: '北京商业医疗涉密运营专项项目',
      business_type: 'commercial office',
      project_type: 'office',
      metadata: {
        projectGenerationFacts: {
          projectFeatures: {
            businessTypeCode: 'commercial_office',
            acceptanceSpecialties: [
              '垃圾分类设施',
              '道路开口',
              '停车交通组织',
              '疾控卫生核验',
              '国家安全事项',
              '涉密安全',
              '公众聚集场所',
              '营业前消防安全检查',
            ],
            locationFacts: { province: '北京市', city: '北京市' },
          },
        },
      },
    })
    const featurePreview = await buildAcceptanceTemplatePreview('project-2')
    const featureItemCodes = featurePreview.items.map((item) => item.itemCode)

    expect(featureItemCodes).toEqual(expect.arrayContaining([
      'sanitation_facility_acceptance',
      'traffic_access_acceptance',
      'health_acceptance',
      'national_security_acceptance',
      'public_assembly_fire_safety_check',
    ]))
  })

  it('blocks high-risk acceptance policy changes and keeps preview on the previous published seed result', async () => {
    const {
      buildAcceptancePolicySourceSnapshot,
      parseAcceptancePolicyStructuredFacts,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')
    const { AcceptanceTemplatePolicyAutoPublishJob } = await import('../jobs/acceptanceTemplatePolicyAutoPublishJob.js')

    const facts = parseAcceptancePolicyStructuredFacts(`
      不再办理环卫设施验收，改为城市运行条件告知承诺。
      办理流程调整为承诺即办。
      办理结果调整为电子交付许可。
    `)
    const job = new AcceptanceTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      sourceSnapshotProvider: async (source) => buildAcceptancePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-high-risk-hash',
        fetchText: async () => `
          不再办理环卫设施验收，改为城市运行条件告知承诺。
          办理流程调整为承诺即办。
          办理结果调整为电子交付许可。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'region_profile:BJ:BJ',
          blockReason: 'policy_content_material_affecting_change',
          policyRuleDiffs: expect.arrayContaining([
            expect.objectContaining({ diffType: 'acceptance_item_replacement', risk: 'high' }),
            expect.objectContaining({ diffType: 'procedure_change', risk: 'high' }),
            expect.objectContaining({ diffType: 'result_document_change', risk: 'high' }),
          ]),
        }),
      ]),
    )
    expect(state.runs).toHaveLength(1)

    vi.resetModules()
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const preview = await buildAcceptanceTemplatePreview('project-1')
    const names = preview.items.map((item) => item.itemName)

    expect(names).not.toEqual(expect.arrayContaining(['环卫设施验收']))
    expect(JSON.stringify(preview)).not.toContain('电子交付许可')
    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'BJ',
      cityCode: 'BJ',
      profileVersion: 'v1.4.22.5',
    })
  })

  it('lets preview consume a stable acceptance policy run only after runtime projection exists', async () => {
    const {
      buildAcceptancePolicySourceSnapshot,
      parseAcceptancePolicyStructuredFacts,
    } = await import('../services/acceptanceTemplatePolicyUpdateService.js')
    const { AcceptanceTemplatePolicyAutoPublishJob } = await import('../jobs/acceptanceTemplatePolicyAutoPublishJob.js')

    const facts = parseAcceptancePolicyStructuredFacts(`
      建设项目联合验收事项：综合验收。
      条件事项：消防验收、档案验收。
      综合验收办理结果：联合验收意见书。
      办理部门：北京市联合验收牵头部门。
      办理流程：网上申报、并联核验、出具联合验收意见。
    `)
    const job = new AcceptanceTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      replaySampleProvider: async () => [
        {
          projectId: 'project-1',
          provinceCode: 'BJ',
          cityCode: 'BJ',
          itemCode: 'comprehensive_acceptance',
          expectedItemNames: ['综合验收'],
          actualItemNames: ['综合验收'],
          expectedResultDocumentNames: ['联合验收意见书'],
          actualResultDocumentNames: ['联合验收意见书'],
          expectedAuthority: '北京市联合验收牵头部门',
          actualAuthority: '北京市联合验收牵头部门',
        },
        {
          projectId: 'project-2',
          provinceCode: 'BJ',
          cityCode: 'BJ',
          itemCode: 'fire_acceptance',
          expectedItemNames: ['消防验收'],
          actualItemNames: ['消防验收'],
          expectedResultDocumentNames: ['消防验收意见书'],
          actualResultDocumentNames: ['消防验收意见书'],
          expectedAuthority: '住房和城乡建设主管部门消防验收管理机构',
          actualAuthority: '住房和城乡建设主管部门消防验收管理机构',
        },
        {
          projectId: 'project-3',
          provinceCode: 'BJ',
          cityCode: 'BJ',
          itemCode: 'archive_acceptance',
          expectedItemNames: ['档案验收'],
          actualItemNames: ['档案验收'],
          expectedResultDocumentNames: ['城建档案验收认可文件'],
          actualResultDocumentNames: ['城建档案验收认可文件'],
          expectedAuthority: '城建档案管理机构',
          actualAuthority: '城建档案管理机构',
        },
      ],
      sourceSnapshotProvider: async (source) => buildAcceptancePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-replay-quality-hash',
        fetchText: async () => `
          建设项目联合验收事项：综合验收。
          条件事项：消防验收、档案验收。
          综合验收办理结果：联合验收意见书。
          办理部门：北京市联合验收牵头部门。
          办理流程：网上申报、并联核验、出具联合验收意见。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')

    expect(run?.policyOpsDecision).toMatchObject({
      runtimeConsumptionStatus: 'stable_consumable',
      promotionDecision: 'promote_to_stable',
      stableConsumptionAllowed: true,
      reasonCodes: [],
    })
    expect(run?.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 3,
      calibratedSampleCount: 3,
      itemMatchRate: 1,
      resultDocumentMatchRate: 1,
      authorityMatchRate: 1,
      status: 'candidate_overlay_ready',
    })
    expect(run?.automationQuality.policyParseHitRate).toMatchObject({
      averageHitRate: 1,
      status: 'ready_for_rule_diff',
    })

    vi.resetModules()
    const { buildAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const preview = await buildAcceptanceTemplatePreview('project-1')

    expect(preview.regionProfile).toMatchObject({
      provinceCode: 'BJ',
      cityCode: 'BJ',
      profileVersion: 'v1.4.22.5',
    })

    state.runtimePublications.push({
      source_run_id: run?.runId,
      target_table: 'acceptance_template_policy_auto_publish_runs',
      runtime_publication_status: 'runtime_stable_published',
      runtime_record: state.runs[0],
      published_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    })

    vi.resetModules()
    const { buildAcceptanceTemplatePreview: buildProjectedAcceptanceTemplatePreview } = await import('../services/acceptanceTemplateService.js')
    const projectedPreview = await buildProjectedAcceptanceTemplatePreview('project-1')

    expect(projectedPreview.regionProfile).toMatchObject({
      provinceCode: 'BJ',
      cityCode: 'BJ',
      profileVersion: 'v1.4.22.5-policy-auto-20260901',
    })
  })
})
