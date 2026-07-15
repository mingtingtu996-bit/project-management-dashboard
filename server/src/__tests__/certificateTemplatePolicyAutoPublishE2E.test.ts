import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const runs: any[] = []
  const runtimePublications: any[] = []
  const tables: Record<string, any[]> = {
    certificate_template_policy_auto_publish_runs: runs,
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
  query: state.client.query,
}))

describe('certificate template policy auto-publish end-to-end runtime contract', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    state.runs.length = 0
    state.runtimePublications.length = 0
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: { provinceCode: 'guangdong' } })
    state.client.query.mockResolvedValue({ rows: [], rowCount: 0 })
  })

  it('keeps an under-calibrated low-risk trusted-source run as an audit-only candidate overlay', async () => {
    const {
      buildCertificatePolicySourceSnapshot,
      parseCertificatePolicyStructuredFacts,
    } = await import('../services/certificateTemplatePolicyUpdateService.js')
    const { CertificateTemplatePolicyAutoPublishJob } = await import('../jobs/certificateTemplatePolicyAutoPublishJob.js')

    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可证申请材料：施工许可申请表、质量安全监督登记表、工资保证金电子承诺书。
      办理部门：住房和城乡建设主管部门。
    `)
    const job = new CertificateTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      sourceSnapshotProvider: async (source) => buildCertificatePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-low-risk-hash',
        fetchText: async () => `
          施工许可证申请材料：施工许可申请表、质量安全监督登记表、工资保证金电子承诺书。
          办理部门：住房和城乡建设主管部门。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishedRuleOverlay: expect.objectContaining({
            materialPackageOverrides: expect.arrayContaining([
              expect.objectContaining({
                materialPackageCode: 'PKG-CERT-CP-COMMON',
                addMaterialNames: expect.arrayContaining(['工资保证金电子承诺书']),
              }),
            ]),
          }),
        }),
      ]),
    )
    expect(run?.policyOpsDecision).toMatchObject({
      runtimeConsumptionStatus: 'candidate_only',
      promotionDecision: 'hold_as_candidate_overlay',
      stableConsumptionAllowed: false,
    })
    expect(state.runs).toHaveLength(1)

    vi.resetModules()
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const preview = await buildCertificateTemplatePreview('project-1')
    const constructionPermitPackage = preview.materialPackages.find(
      (materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON',
    )

    expect(constructionPermitPackage?.materialNames).not.toEqual(
      expect.arrayContaining(['工资保证金电子承诺书']),
    )
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      profileVersion: 'v1.4.22.2',
    })
    expect(JSON.stringify(preview)).not.toContain('sourceSnapshots')
    expect(JSON.stringify(preview)).not.toContain('structuredPolicyFacts')
    expect(JSON.stringify(preview)).not.toContain('policyRuleDiffs')
    expect(JSON.stringify(preview)).not.toContain('publishedRuleOverlay')
  })

  it('lets preview consume a stable certificate policy run only after runtime projection exists', async () => {
    const {
      buildCertificatePolicySourceSnapshot,
      parseCertificatePolicyStructuredFacts,
    } = await import('../services/certificateTemplatePolicyUpdateService.js')
    const { CertificateTemplatePolicyAutoPublishJob } = await import('../jobs/certificateTemplatePolicyAutoPublishJob.js')

    const policyText = `
      施工许可证申请材料：施工许可申请表、质量安全监督登记表、工资保证金电子承诺书。
      办理部门：住房和城乡建设主管部门。
      办理流程：受理、审查、核发。
      承诺时限：3个工作日。
    `
    const facts = parseCertificatePolicyStructuredFacts(policyText)
    const job = new CertificateTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      replaySampleProvider: async () => [
        {
          projectId: 'project-cert-1',
          provinceCode: 'guangdong',
          cityCode: 'shenzhen',
          certificateType: 'construction_permit',
          expectedMaterialNames: ['工资保证金电子承诺书'],
          actualMaterialNames: ['工资保证金电子承诺书'],
          expectedAuthority: '住房和城乡建设主管部门',
          actualAuthority: '住房和城乡建设主管部门',
        },
        {
          projectId: 'project-cert-2',
          provinceCode: 'guangdong',
          cityCode: 'guangzhou',
          certificateType: 'construction_permit',
          expectedMaterialNames: ['质量安全监督登记表'],
          actualMaterialNames: ['质量安全监督登记表'],
          expectedAuthority: '住房和城乡建设主管部门',
          actualAuthority: '住房和城乡建设主管部门',
        },
        {
          projectId: 'project-cert-3',
          provinceCode: 'guangdong',
          cityCode: 'foshan',
          certificateType: 'construction_permit',
          expectedMaterialNames: ['施工许可申请表'],
          actualMaterialNames: ['施工许可申请表'],
          expectedAuthority: '住房和城乡建设主管部门',
          actualAuthority: '住房和城乡建设主管部门',
        },
      ],
      sourceSnapshotProvider: async (source) => buildCertificatePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-stable-policy-hash',
        fetchText: async () => policyText,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.policyOpsDecision).toMatchObject({
      runtimeConsumptionStatus: 'stable_consumable',
      promotionDecision: 'promote_to_stable',
      stableConsumptionAllowed: true,
      reasonCodes: [],
    })
    expect(run?.automationQuality.policyParseHitRate).toMatchObject({
      status: 'ready_for_rule_diff',
      averageHitRate: 0.8,
    })
    expect(run?.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 3,
      calibratedSampleCount: 3,
      materialMatchRate: 1,
      authorityMatchRate: 1,
      status: 'candidate_overlay_ready',
    })

    vi.resetModules()
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const preview = await buildCertificateTemplatePreview('project-1')
    const constructionPermitPackage = preview.materialPackages.find(
      (materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON',
    )

    expect(constructionPermitPackage?.materialNames).not.toEqual(
      expect.arrayContaining(['工资保证金电子承诺书']),
    )
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      profileVersion: 'v1.4.22.2',
    })

    state.runtimePublications.push({
      source_run_id: run?.runId,
      target_table: 'certificate_template_policy_auto_publish_runs',
      runtime_publication_status: 'runtime_stable_published',
      runtime_record: state.runs[0],
      published_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-01T00:00:00.000Z',
    })

    vi.resetModules()
    const { buildCertificateTemplatePreview: buildProjectedCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const projectedPreview = await buildProjectedCertificateTemplatePreview('project-1')
    const projectedConstructionPermitPackage = projectedPreview.materialPackages.find(
      (materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON',
    )

    expect(projectedConstructionPermitPackage?.materialNames).toEqual(
      expect.arrayContaining(['工资保证金电子承诺书']),
    )
    expect(projectedPreview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      profileVersion: 'v1.4.22.2-policy-auto-20260901',
    })
    expect(JSON.stringify(preview)).not.toContain('sourceSnapshots')
    expect(JSON.stringify(preview)).not.toContain('structuredPolicyFacts')
    expect(JSON.stringify(preview)).not.toContain('policyRuleDiffs')
    expect(JSON.stringify(preview)).not.toContain('publishedRuleOverlay')
    expect(JSON.stringify(projectedPreview)).not.toContain('sourceSnapshots')
    expect(JSON.stringify(projectedPreview)).not.toContain('structuredPolicyFacts')
    expect(JSON.stringify(projectedPreview)).not.toContain('policyRuleDiffs')
    expect(JSON.stringify(projectedPreview)).not.toContain('publishedRuleOverlay')
  })

  it('does not consume a stable certificate policy run after its runtime projection is rolled back', async () => {
    const {
      persistCertificatePolicyAutoPublishRun,
      publishCertificatePolicyAutoPublishPlan,
    } = await import('../services/certificateTemplatePolicyUpdateService.js')
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const stableDecision = {
      ...run.policyOpsDecision,
      runtimeConsumptionStatus: 'stable_consumable' as const,
      promotionDecision: 'promote_to_stable' as const,
      runtimeConsumptionPolicy: 'consume_stable_auto_published_seed' as const,
      stableConsumptionAllowed: true,
      reasonCodes: [],
    }
    const stableRun = {
      ...run,
      policyOpsDecision: stableDecision,
      automationQuality: {
        ...run.automationQuality,
        policyOpsDecision: stableDecision,
      },
    }
    await persistCertificatePolicyAutoPublishRun(stableRun)
    state.runtimePublications.push({
      source_run_id: stableRun.runId,
      target_table: 'certificate_template_policy_auto_publish_runs',
      runtime_publication_status: 'runtime_rolled_back',
      runtime_record: state.runs[0],
      published_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-02T00:00:00.000Z',
    })

    vi.resetModules()
    const {
      loadLatestStableCertificatePolicyAutoPublishRun,
    } = await import('../services/certificateTemplatePolicyUpdateService.js')

    await expect(loadLatestStableCertificatePolicyAutoPublishRun()).resolves.toBeNull()
  })

  it('persists a high-risk trusted-source run while preview retains the previous published seed result', async () => {
    const {
      buildCertificatePolicySourceSnapshot,
      parseCertificatePolicyStructuredFacts,
    } = await import('../services/certificateTemplatePolicyUpdateService.js')
    const { CertificateTemplatePolicyAutoPublishJob } = await import('../jobs/certificateTemplatePolicyAutoPublishJob.js')

    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可证申请材料：审图合格书。
      不再提交质量安全监督手续，改为质量安全监督承诺书。
      办理结果调整为施工许可证电子证照。
    `)
    const job = new CertificateTemplatePolicyAutoPublishJob({
      useLiveSourceSnapshots: true,
      sourceSnapshotProvider: async (source) => buildCertificatePolicySourceSnapshot({
        source,
        previousContentHash: 'previous-high-risk-hash',
        fetchText: async () => `
          施工许可证申请材料：审图合格书。
          不再提交质量安全监督手续，改为质量安全监督承诺书。
          办理结果调整为施工许可证电子证照。
        `,
      }).then((snapshot) => ({ ...snapshot, structuredPolicyFacts: facts })),
    })

    const run = await job.executeNow('2026-09-01')
    expect(run?.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          blockReason: 'policy_content_material_affecting_change',
          policyRuleDiffs: expect.arrayContaining([
            expect.objectContaining({ diffType: 'material_replacement', risk: 'high' }),
            expect.objectContaining({ diffType: 'certificate_output_change', risk: 'high' }),
          ]),
        }),
      ]),
    )
    expect(state.runs).toHaveLength(1)

    vi.resetModules()
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const preview = await buildCertificateTemplatePreview('project-1')
    const constructionPermitPackage = preview.materialPackages.find(
      (materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON',
    )

    expect(constructionPermitPackage?.materialNames).not.toEqual(
      expect.arrayContaining(['质量安全监督承诺书']),
    )
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      profileVersion: 'v1.4.22.2',
    })
    expect(JSON.stringify(preview)).not.toContain('policyRuleDiffs')
    expect(JSON.stringify(preview)).not.toContain('publishedRuleOverlay')
  })
})
