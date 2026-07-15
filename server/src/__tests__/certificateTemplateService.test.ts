import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GENERAL_CERTIFICATE_TEMPLATE_CODE, CERTIFICATE_TEMPLATE_SEED_VERSION } from '../seeds/certificateTemplateSeed.js'

const state = vi.hoisted(() => {
  const runtimePublications: any[] = []
  function createQuery(table: string) {
    const filters: Array<{ column: string, value: unknown }> = []
    let orderColumn: string | null = null
    let orderAscending = false
    let rowLimit: number | null = null
    const readRows = () => {
      let rows = table === 'policy_template_entity_runtime_publications'
        ? [...runtimePublications].filter((row) => filters.every((filter) => row[filter.column] === filter.value))
        : []
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
    }
    return query
  }
  const executeSQL = vi.fn(async (_sql: string, _params: unknown[] = []) => [])
  const executeSQLOne = vi.fn(async (_sql: string, _params: unknown[] = []) => null)
  const client = {
    query: vi.fn(async (_sql: string, _params: unknown[] = []) => ({ rows: [], rowCount: 0 })),
    release: vi.fn(),
  }
  const getClient = vi.fn(async () => client)

  return {
    runtimePublications,
    from: vi.fn((table: string) => createQuery(table)),
    executeSQL,
    executeSQLOne,
    getClient,
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
}))

function buildReadyCertificatePolicyReplaySamples() {
  return [1, 2, 3].map((index) => ({
    projectId: `policy-replay-${index}`,
    provinceCode: 'guangdong',
    cityCode: 'shenzhen',
    certificateType: 'construction_permit',
    expectedMaterialNames: ['农民工工资保证金承诺书'],
    actualMaterialNames: ['农民工工资保证金承诺书'],
    expectedAuthority: '住房和城乡建设主管部门',
    actualAuthority: '住房和城乡建设主管部门',
    expectedReusableOutputNames: ['建设工程施工许可证电子证照'],
    actualReusableOutputNames: ['建设工程施工许可证电子证照'],
  }))
}

async function publishStableCertificatePolicyAutoRun() {
  const {
    parseCertificatePolicyStructuredFacts,
    publishCertificatePolicyAutoPublishPlanWithSourceSnapshots,
  } = await import('../services/certificateTemplatePolicyUpdateService.js')
  const structuredPolicyFacts = parseCertificatePolicyStructuredFacts(`
    施工许可证申请材料：建筑工程施工许可证申请表、质量安全监督登记表、农民工工资保证金承诺书。
    办理部门：住房和城乡建设主管部门、施工许可综合受理窗口。
    办理流程：受理、审查、核发。
    承诺时限：3个工作日。
    办理结果：建设工程施工许可证电子证照。
  `)
  return publishCertificatePolicyAutoPublishPlanWithSourceSnapshots({
    asOfDate: '2026-09-01',
    replaySamples: buildReadyCertificatePolicyReplaySamples(),
    sourceSnapshotProvider: async (source) => ({
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl ?? '',
      policyLevel: source.policyLevel,
      checkedAt: source.checkedAt,
      sourceHealth: 'healthy',
      fetchStatus: 'fetched',
      contentHash: `stable-${source.sourceName}`,
      previousContentHash: `stable-${source.sourceName}`,
      diffStatus: 'unchanged',
      changeSignals: [],
      changeRisk: 'low',
      autoPublishDecision: 'auto_publish_allowed',
      structuredPolicyFacts,
    }),
  })
}

async function addCertificatePolicyRuntimeProjection(run: any) {
  const { mapCertificatePolicyAutoPublishRunToRecord } = await import('../services/certificateTemplatePolicyUpdateService.js')
  state.runtimePublications.push({
    source_run_id: run.runId,
    target_table: 'certificate_template_policy_auto_publish_runs',
    runtime_publication_status: 'runtime_stable_published',
    runtime_record: mapCertificatePolicyAutoPublishRunToRecord(run),
    published_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  })
}

describe('certificate template service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    state.runtimePublications.length = 0
    state.client.query.mockReset()
    state.client.query.mockResolvedValue({ rows: [], rowCount: 0 })
    state.client.release.mockReset()
    state.getClient.mockResolvedValue(state.client)
  })

  it('builds a default four-certificate preview for an empty project without writing facts', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.templateCode).toBe(GENERAL_CERTIFICATE_TEMPLATE_CODE)
    expect(preview.seedVersion).toBe(CERTIFICATE_TEMPLATE_SEED_VERSION)
    expect(preview.summary.certificateCreateCount).toBe(4)
    expect(preview.certificates.map((certificate) => certificate.certificateType)).toEqual([
      'land_certificate',
      'land_use_planning_permit',
      'engineering_planning_permit',
      'construction_permit',
    ])
    expect(preview.certificates.every((certificate) => certificate.action === 'will_create')).toBe(true)
    expect(preview.workItems.length).toBeGreaterThan(20)
    expect(preview.workItems.filter((item) => item.isShared).length).toBeGreaterThanOrEqual(6)
    expect(preview.dependencies.map((dependency) => dependency.dependencyCode)).toEqual(
      expect.arrayContaining([
        'DEP-LAND-TO-LUP',
        'DEP-LUP-TO-EPP',
        'DEP-EPP-TO-CP',
        'DEP-DRAWING-REVIEW-TO-CP',
        'DEP-DRAWING-CERT-TO-CP',
        'DEP-QUALITY-SAFETY-TO-CP',
        'DEP-SITE-CONDITIONS-TO-CP',
        'DEP-CONTRACT-TO-CP',
      ]),
    )
    expect(preview.dependencies.map((dependency) => dependency.dependencyCode)).not.toEqual(
      expect.arrayContaining(['DEP-TRAFFIC-TO-EPP', 'DEP-FIRE-TO-CP', 'DEP-HFD-TO-CP']),
    )
    expect(state.client.query).not.toHaveBeenCalled()
  })

  it('returns business-readable handling steps for judging the four-certificate path', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.handlingSteps.map((step) => step.stepCode)).toEqual(
      expect.arrayContaining([
        'LAND-ACQUISITION-PRECHECK',
        'LAND-OWNERSHIP-REGISTRATION',
        'LUP-LAND-METHOD-MATERIALS',
        'LUP-PRE-REVIEW-SELECTION',
        'LUP-MATERIAL-SUBMISSION',
        'LUP-PERMIT-ISSUE',
        'EPP-DESIGN-PACKAGE-ASSEMBLY',
        'EPP-SCHEME-REVIEW',
        'EPP-PUBLIC-NOTICE-OR-COMMITTEE',
        'EPP-SPECIAL-TECHNICAL-REVIEW',
        'EPP-BLUEPRINT-CHECK',
        'EPP-PERMIT-ISSUE',
        'CP-BIDDING-CONTRACT-LOCK',
        'CP-DRAWING-REVIEW',
        'CP-FIRE-HFD-SPECIALS',
        'CP-CONTRACT-PARTICIPANTS',
        'CP-QUALITY-SAFETY',
        'CP-WAGE-REALNAME-DUST',
        'CP-SITE-CONDITIONS',
        'CP-PERMIT-ISSUE',
      ]),
    )
    expect(preview.handlingSteps.find((step) => step.stepCode === 'CP-DRAWING-REVIEW')).toMatchObject({
      handlingAuthority: expect.stringContaining('施工图审查机'),
      outputDocument: expect.stringContaining('审图合格'),
    })
    expect(preview.handlingSteps.find((step) => step.stepCode === 'CP-PERMIT-ISSUE')).toMatchObject({
      handlingAuthority: expect.stringContaining('住房和城乡建设主管部'),
      outputDocument: expect.stringContaining('施工许可'),
      blockingLevel: 'startup_gate',
    })
    expect(preview.handlingSteps.filter((step) => step.certificateType === 'land_certificate')).toHaveLength(2)
    expect(preview.handlingSteps.filter((step) => step.certificateType === 'land_use_planning_permit')).toHaveLength(4)
    expect(preview.handlingSteps.filter((step) => step.certificateType === 'engineering_planning_permit')).toHaveLength(6)
    expect(preview.handlingSteps.filter((step) => step.certificateType === 'construction_permit')).toHaveLength(8)
    expect(preview.handlingSteps.find((step) => step.stepCode === 'EPP-PUBLIC-NOTICE-OR-COMMITTEE')).toMatchObject({
      handlingAuthority: expect.stringContaining('自然资源和规划主管部门或规划委员会审查机'),
      outputDocument: expect.stringContaining('方案公示、规委会或内部审查确认意'),
    })
    expect(preview.handlingSteps.find((step) => step.stepCode === 'CP-FIRE-HFD-SPECIALS')).toMatchObject({
      outputDocument: '消防、人防或专项审查资料',
      blockingLevel: 'startup_gate',
    })
  })

  it('returns a material evidence chain linking materials to work items departments outputs and reuse', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.materialEvidenceChains.length).toBeGreaterThanOrEqual(preview.handlingSteps.length)
    const drawingReviewEvidence = preview.materialEvidenceChains.find(
      (chain) => chain.materialCode === 'CERT-DOC-DRAWING-REVIEW',
    )
    expect(drawingReviewEvidence).toMatchObject({
      certificateType: 'construction_permit',
      handlingStepCode: 'CP-DRAWING-REVIEW',
      handlingStepName: expect.stringContaining('施工图审'),
      handlingAuthority: expect.stringContaining('施工图审查机'),
      outputDocument: expect.stringContaining('审图合格'),
      linkedWorkItemCodes: ['CERT-DOC-DRAWING-REVIEW'],
      linkedWorkItemNames: [expect.stringContaining('施工图审查资')],
      materialPackageCodes: expect.arrayContaining(['PKG-CERT-CP-COMMON']),
      materialPackageNames: expect.arrayContaining([expect.stringContaining('施工许可通用资料')]),
      reusableForCertificateTypes: ['construction_permit'],
      blockingLevel: 'startup_gate',
    })
    expect(drawingReviewEvidence?.requiredSubmitMaterials).toEqual(
      expect.arrayContaining([expect.stringContaining('全套施工'), '勘察设计成果', '规划许可成果']),
    )
  })

  it('keeps material evidence chains commercially actionable for all four certificates', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1')
    const certificateTypes = [
      'land_certificate',
      'land_use_planning_permit',
      'engineering_planning_permit',
      'construction_permit',
    ] as const

    for (const certificateType of certificateTypes) {
      const certificateChains = preview.materialEvidenceChains.filter(
        (chain) => chain.certificateType === certificateType,
      )
      const certificateSteps = preview.handlingSteps.filter((step) => step.certificateType === certificateType)

      expect(certificateChains.length, certificateType).toBeGreaterThanOrEqual(certificateSteps.length)
      expect(
        certificateChains.some(
          (chain) =>
            chain.linkedWorkItemCodes.length > 0 &&
            chain.linkedWorkItemNames.length > 0 &&
            chain.materialPackageCodes.length > 0 &&
            chain.materialPackageNames.length > 0 &&
            chain.handlingAuthority.length > 0 &&
            chain.outputDocument.length > 0,
        ),
        certificateType,
      ).toBe(true)
    }

    expect(
      preview.materialEvidenceChains.some(
        (chain) =>
          chain.certificateType === 'land_certificate' &&
          chain.linkedWorkItemCodes.includes('CERT-DOC-LAND-TRANSFER') &&
          chain.materialPackageCodes.includes('PKG-CERT-LAND-COMMON') &&
          chain.reusableForCertificateTypes.includes('land_use_planning_permit'),
      ),
    ).toBe(true)
    expect(
      preview.materialEvidenceChains.some(
        (chain) =>
          chain.certificateType === 'land_use_planning_permit' &&
          chain.linkedWorkItemCodes.includes('CERT-DOC-PLANNING-CONDITIONS') &&
          chain.materialPackageCodes.includes('PKG-CERT-LUP-COMMON') &&
          chain.reusableForCertificateTypes.includes('engineering_planning_permit'),
      ),
    ).toBe(true)
    expect(
      preview.materialEvidenceChains.some(
        (chain) =>
          chain.certificateType === 'engineering_planning_permit' &&
          chain.linkedWorkItemCodes.includes('CERT-DOC-DESIGN-SCHEME') &&
          chain.materialPackageCodes.includes('PKG-CERT-EPP-COMMON') &&
          chain.reusableForCertificateTypes.includes('engineering_planning_permit'),
      ),
    ).toBe(true)
    expect(
      preview.materialEvidenceChains.some(
        (chain) =>
          chain.certificateType === 'construction_permit' &&
          chain.linkedWorkItemCodes.includes('CERT-DOC-DRAWING-REVIEW') &&
          chain.materialPackageCodes.includes('PKG-CERT-CP-COMMON') &&
          chain.reusableForCertificateTypes.includes('construction_permit'),
      ),
    ).toBe(true)
  })

  it('defaults land acquisition to transfer and only includes transfer material work items', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.landAcquisition).toMatchObject({
      selectedMethodCode: 'transfer',
      source: 'default',
    })
    expect(preview.landAcquisition.methods.map((method) => method.methodCode)).toEqual([
      'transfer',
      'allocation',
      'existing_land',
      'redevelopment',
    ])
    expect(preview.workItems.map((item) => item.itemName)).toEqual(
      expect.arrayContaining(['出让合同', expect.stringContaining('场地红线'), expect.stringContaining('交地'), '契税、印花税缴纳', '完税证明']),
    )
    expect(preview.workItems.map((item) => item.itemName)).not.toContain('划拨决定')
  })

  it('uses requested land acquisition method to build the matching material package', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'allocation' })

    expect(preview.landAcquisition).toMatchObject({
      selectedMethodCode: 'allocation',
      source: 'preview_option',
    })
    expect(preview.workItems.map((item) => item.itemName)).toEqual(
      expect.arrayContaining([expect.stringContaining('划拨决定'), '建设项目用地预审与选址意见']),
    )
    expect(preview.workItems.map((item) => item.itemName)).not.toContain('出让合同')
  })

  it('uses project metadata land acquisition method when preview options are not provided', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '广东省广州市',
      metadata: { landAcquisitionMethodCode: 'redevelopment' },
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.landAcquisition).toMatchObject({
      selectedMethodCode: 'redevelopment',
      source: 'project_metadata',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      provinceName: expect.stringContaining('广东'),
    })
    expect(preview.workItems.map((item) => item.itemName)).toContain('城市更新实施方案或改扩建立项依据')
  })

  it('auto-applies the inferred province profile as a preview overlay', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '江苏省南京市江宁',
      metadata: {},
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'jiangsu',
      provinceName: expect.stringContaining('江苏'),
      source: 'project_location',
      applied: true,
    })
    expect(preview.provinceProfile?.appliedWorkItemCodes).toEqual(
      expect.arrayContaining(['CERT-EPP-COMMITTEE', 'CERT-DOC-CITY-FEE']),
    )
    expect(preview.provinceProfile?.appliedSoftDependencyCodes).toContain('DEP-BLUEPRINT-CHECK-TO-EPP')
    expect(preview.workItems.map((item) => item.workItemCode)).toContain('CERT-DOC-CITY-FEE')
    expect(preview.dependencies.find((dependency) => dependency.dependencyCode === 'DEP-BLUEPRINT-CHECK-TO-EPP')).toMatchObject({
      dependencyKind: 'soft',
      provinceProfileCodes: ['jiangsu'],
    })
    expect(preview.certificates.find((certificate) => certificate.certificateType === 'land_certificate')).toMatchObject({
      approvingAuthority: expect.stringContaining('自然资源和规划主管部'),
    })
  })

  it('applies the published zhejiang province profile in the business preview', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: 'zhejiang hangzhou',
      metadata: { provinceCode: 'zhejiang' },
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'zhejiang',
      source: 'project_metadata',
      applied: true,
    })
    expect(preview.workItems.map((item) => item.workItemCode)).toContain('CERT-EPP-PUBLIC-NOTICE')
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('curationMethod')
    expect(preview.provinceProfile).not.toHaveProperty('materialOverrides')
    expect(preview.provinceProfile?.policySources[0]).not.toHaveProperty('policyLevel')
  })

  it('falls back to the default published profile when no province can be recognized', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '未填写省份的项目地址',
      metadata: {},
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'default',
      recognizedProvinceName: '全国通用',
      appliedProfileCode: 'default',
      appliedProfileName: '全国通用',
      source: 'default',
      recognitionAccuracy: 'default',
      updateMode: 'governed_seed_update',
      policyUpdatePolicy: 'trusted_source_auto_publish',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'default',
      provinceName: '全国通用',
      source: 'default',
    })
  })

  it('keeps unrecognized locations on the default profile without applying province material packages', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '未填写省份的项目地址',
      metadata: {},
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'default',
      appliedProfileCode: 'default',
      source: 'default',
      recognitionAccuracy: 'default',
      policyUpdatePolicy: 'trusted_source_auto_publish',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'default',
      source: 'default',
    })
    expect(preview.materialPackages.map((materialPackage) => materialPackage.packageCode)).not.toContain('PKG-PROVINCE-XINJIANG-TRANSFER')
    expect(preview.materialPackages.flatMap((materialPackage) => materialPackage.materialNames)).not.toContain('新疆维吾尔自治区工程建设项目审批管理系统项目代码')
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Shanghai after governed publication as the first expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '上海市浦东新',
      metadata: { provinceCode: 'shanghai' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'shanghai',
      appliedProfileCode: 'shanghai',
      source: 'project_metadata',
      policyUpdatePolicy: 'trusted_source_auto_publish',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'shanghai',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('上海市工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-SHANGHAI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'shanghai',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('keeps candidate policy updates out of the business preview payload', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const { buildCertificatePolicyUpdateGovernanceReport } = await import('../services/certificateTemplatePolicyUpdateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '广东省深圳市南山',
      metadata: { provinceCode: 'guangdong', city: 'shenzhen' },
    })

    const governanceReport = buildCertificatePolicyUpdateGovernanceReport({ asOfDate: '2026-09-01' })
    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(governanceReport.summary.autoPublishCandidateCount).toBeGreaterThan(0)
    expect(governanceReport.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          updateStatus: 'auto_publish_candidate',
          proposedAction: 'auto_publish_when_trusted_sources_pass',
        }),
      ]),
    )
    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'guangdong',
      appliedProfileCode: 'guangdong',
      policyUpdatePolicy: 'trusted_source_auto_publish',
    })
    expect(JSON.stringify(preview)).not.toContain('candidate_only')
    expect(JSON.stringify(preview)).not.toContain('refresh_policy_sources_then_manual_publish')
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.cityOverride).not.toHaveProperty('reviewStatus')
  })

  it('consumes auto-published trusted-source policy versions after published assets pass official source coverage', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])

    const run = await publishStableCertificatePolicyAutoRun()
    expect(run.policyOpsDecision.stableConsumptionAllowed).toBe(true)
    await addCertificatePolicyRuntimeProjection(run)

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      location: 'guangdong shenzhen',
      metadata: { provinceCode: 'guangdong', city: 'shenzhen' },
    })
    const guangdongPreview = await buildCertificateTemplatePreview('project-1')

    expect(guangdongPreview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      profileVersion: 'v1.4.22.2-policy-auto-20260901',
    })
    expect(guangdongPreview.cityOverride).toMatchObject({
      overrideCode: 'city_override_guangdong_shenzhen_v14222',
      profileVersion: 'v1.4.22.2-policy-auto-20260901',
    })

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-2',
      location: 'unrecognized location',
      metadata: {},
    })
    const defaultPreview = await buildCertificateTemplatePreview('project-2')

    expect(defaultPreview.provinceProfile).toMatchObject({
      provinceCode: 'default',
      profileVersion: 'v1.4.22.2-policy-auto-20260901',
    })
  })

  it('consumes auto-published low-risk policy rule overlays without exposing governance internals', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const {
      parseCertificatePolicyStructuredFacts,
      publishCertificatePolicyAutoPublishPlanWithSourceSnapshots,
    } = await import('../services/certificateTemplatePolicyUpdateService.js')
    state.executeSQL.mockResolvedValue([])

    const structuredPolicyFacts = parseCertificatePolicyStructuredFacts(`
      施工许可申请材料：施工许可申请表、质量安全监督登记表、农民工工资保证金承诺书。
      办理部门：住房和城乡建设主管部门、施工许可综合受理窗口。
      办理流程：受理、审查、核发。
      承诺时限：3个工作日。
    `)

    const run = await publishCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      asOfDate: '2026-09-01',
      replaySamples: buildReadyCertificatePolicyReplaySamples(),
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'new-low-risk-preview-hash',
        previousContentHash: 'old-low-risk-preview-hash',
        diffStatus: 'changed',
        changeSignals: ['material', 'authority'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
        structuredPolicyFacts,
      }),
    })
    expect(run.policyOpsDecision.stableConsumptionAllowed).toBe(true)
    await addCertificatePolicyRuntimeProjection(run)

    state.executeSQLOne.mockResolvedValueOnce({
      id: 'project-1',
      location: 'guangdong shenzhen',
      metadata: { provinceCode: 'guangdong', city: 'shenzhen' },
    })
    const preview = await buildCertificateTemplatePreview('project-1')
    const constructionPermitPackage = preview.materialPackages.find(
      (materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON',
    )

    expect(constructionPermitPackage?.materialNames).toEqual(
      expect.arrayContaining(['农民工工资保证金承诺书']),
    )
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      profileVersion: 'v1.4.22.2-policy-auto-20260901',
    })
    expect(JSON.stringify(preview)).not.toContain('sourceSnapshots')
    expect(JSON.stringify(preview)).not.toContain('structuredPolicyFacts')
    expect(JSON.stringify(preview)).not.toContain('policyRuleDiffs')
    expect(JSON.stringify(preview)).not.toContain('publishedRuleOverlay')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies published local overrides without exposing governance-only fields in the business preview payload', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    const { buildCertificateLocalOverrideGovernanceReport } = await import('../services/certificateTemplateLocalOverrideGovernanceService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: 'shanghai pudong new area',
      metadata: { provinceCode: 'shanghai', cityCode: 'shanghai', zone: 'shanghai_pudong' },
    })

    const governanceReport = buildCertificateLocalOverrideGovernanceReport()
    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(governanceReport.summary.localOverridePublishReviewCandidateCount).toBe(0)
    expect(governanceReport.localOverridePublishReviewCandidates).toEqual([])
    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'shanghai',
      appliedProfileCode: 'shanghai',
      policyUpdatePolicy: 'trusted_source_auto_publish',
    })
    expect(preview.cityOverride).toMatchObject({
      overrideCode: 'city_override_shanghai_shanghai_v14222',
      cityCode: 'shanghai',
      overrideScope: 'city',
      applied: true,
    })
    expect(preview.cityOverride).not.toHaveProperty('reviewStatus')
    expect(preview.cityOverride).not.toHaveProperty('curationMethod')
    expect(preview.cityOverride).not.toHaveProperty('materialOverrides')
    expect(preview.cityOverride as any).not.toHaveProperty('zoneCode')
    expect(preview.cityOverride as any).not.toHaveProperty('zoneName')
    expect(JSON.stringify(preview)).not.toMatch(/district_override|park_override/)
    expect(JSON.stringify(preview)).not.toContain('ready_for_governed_publish_review')
    expect(JSON.stringify(preview)).not.toContain('governed_review_required')
    expect(JSON.stringify(preview)).not.toContain('not_consumed_until_published')
  })

  it('applies Fujian after governed publication as the second expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '福建省福州市鼓楼',
      metadata: { provinceCode: 'fujian' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'fujian',
      appliedProfileCode: 'fujian',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'fujian',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('福建省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['建设工程设计方案文本及总平面图', expect.stringContaining('蓝图、定位图及规划技术审查材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-FUJIAN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'fujian',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Anhui after governed publication as the third expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '安徽省合肥市蜀山区',
      metadata: { provinceCode: 'anhui' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'anhui',
      appliedProfileCode: 'anhui',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'anhui',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('安徽省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-ANHUI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'anhui',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Shandong after governed publication as the fourth expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '山东省济南市历下',
      metadata: { provinceCode: 'shandong' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'shandong',
      appliedProfileCode: 'shandong',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'shandong',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('山东省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-SHANDONG-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'shandong',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Jiangxi after governed publication as the fifth expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '江西省南昌市红谷滩区',
      metadata: { provinceCode: 'jiangxi' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'jiangxi',
      appliedProfileCode: 'jiangxi',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'jiangxi',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('江西省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['建设工程设计方案文本及总平面图', expect.stringContaining('蓝图、定位图及规划技术审查材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-JIANGXI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'jiangxi',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Beijing after governed publication as the first north expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '北京市朝阳区',
      metadata: { provinceCode: 'beijing' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'beijing',
      appliedProfileCode: 'beijing',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'beijing',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('北京市工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-BEIJING-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'beijing',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Tianjin after governed publication as the second north expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '天津市和平区',
      metadata: { provinceCode: 'tianjin' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'tianjin',
      appliedProfileCode: 'tianjin',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'tianjin',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('天津市工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-TIANJIN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'tianjin',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Hebei after governed publication as the third north expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '河北省石家庄市长安区',
      metadata: { provinceCode: 'hebei' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'hebei',
      appliedProfileCode: 'hebei',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'hebei',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('河北省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['建设工程设计方案文本及总平面图', expect.stringContaining('蓝图、定位图及规划技术审查材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-HEBEI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'hebei',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Shanxi after governed publication as the fourth north expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '山西省太原市小店',
      metadata: { provinceCode: 'shanxi' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'shanxi',
      appliedProfileCode: 'shanxi',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'shanxi',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('山西省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-SHANXI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'shanxi',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Inner Mongolia after governed publication as the fifth north expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '内蒙古自治区呼和浩特市新城区',
      metadata: { provinceCode: 'inner_mongolia' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'inner_mongolia',
      appliedProfileCode: 'inner_mongolia',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'inner_mongolia',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['内蒙古自治区工程建设项目审批管理系统项目代码', '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-INNER_MONGOLIA-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'inner_mongolia',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Liaoning after governed publication as the first northeast expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '辽宁省沈阳市和平',
      metadata: { provinceCode: 'liaoning' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'liaoning',
      appliedProfileCode: 'liaoning',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-29',
      nextReviewDueAt: '2026-08-29',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'liaoning',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('辽宁省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-LIAONING-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'liaoning',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Jilin after governed publication as the second northeast expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '吉林省长春市朝阳',
      metadata: { provinceCode: 'jilin' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'jilin',
      appliedProfileCode: 'jilin',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-29',
      nextReviewDueAt: '2026-08-29',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'jilin',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('吉林省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-JILIN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'jilin',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Heilongjiang after governed publication as the third northeast expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '黑龙江省哈尔滨市道里',
      metadata: { provinceCode: 'heilongjiang' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'heilongjiang',
      appliedProfileCode: 'heilongjiang',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-29',
      nextReviewDueAt: '2026-08-29',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'heilongjiang',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['黑龙江省工程建设项目审批管理系统项目代码', '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['建设工程设计方案文本及总平面图', expect.stringContaining('蓝图、定位图及规划技术审查材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-HEILONGJIANG-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'heilongjiang',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Henan after governed publication as the first central-south expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '河南省郑州市金水',
      metadata: { provinceCode: 'henan' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'henan',
      appliedProfileCode: 'henan',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'henan',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('河南省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-HENAN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'henan',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Hubei after governed publication as the second central-south expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '湖北省武汉市江汉',
      metadata: { provinceCode: 'hubei' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'hubei',
      appliedProfileCode: 'hubei',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'hubei',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('湖北省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['建设工程设计方案文本及总平面图', expect.stringContaining('蓝图、定位图及规划技术审查材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-HUBEI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'hubei',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Hunan after governed publication as the third central-south expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '湖南省长沙市岳麓',
      metadata: { provinceCode: 'hunan' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'hunan',
      appliedProfileCode: 'hunan',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'hunan',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('湖南省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-HUNAN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'hunan',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Guangxi after governed publication as the fourth central-south expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '广西壮族自治区南宁市青秀',
      metadata: { provinceCode: 'guangxi' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'guangxi',
      appliedProfileCode: 'guangxi',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangxi',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('广西壮族自治区工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.policyBasis).toEqual(
      expect.arrayContaining([expect.stringContaining('广西壮族自治区 candidate profile：立项用地规划许可阶段资料包候选补')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-GUANGXI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'guangxi',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Hainan after governed publication as the fifth central-south expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '海南省海口市秀英区',
      metadata: { provinceCode: 'hainan' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'hainan',
      appliedProfileCode: 'hainan',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'hainan',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('海南省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-HAINAN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'hainan',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Chongqing after governed publication as the first southwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '重庆市渝中区',
      metadata: { provinceCode: 'chongqing' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'chongqing',
      appliedProfileCode: 'chongqing',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'chongqing',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('重庆市工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-CHONGQING-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'chongqing',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Sichuan after governed publication as the second southwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '四川省成都市锦江',
      metadata: { provinceCode: 'sichuan' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'sichuan',
      appliedProfileCode: 'sichuan',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'sichuan',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('四川省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-SICHUAN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'sichuan',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Guizhou after governed publication as the third southwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '贵州省贵阳市南明',
      metadata: { provinceCode: 'guizhou' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'guizhou',
      appliedProfileCode: 'guizhou',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guizhou',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('贵州省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-GUIZHOU-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'guizhou',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Yunnan after governed publication as the fourth southwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '云南省昆明市五华',
      metadata: { provinceCode: 'yunnan' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'yunnan',
      appliedProfileCode: 'yunnan',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'yunnan',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('云南省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-YUNNAN-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'yunnan',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Tibet after governed publication as the final southwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '西藏自治区拉萨市城关',
      metadata: { provinceCode: 'tibet' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'tibet',
      appliedProfileCode: 'tibet',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'tibet',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('西藏自治区工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-TIBET-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'tibet',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Shaanxi after governed publication as the first northwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '陕西省西安市雁塔',
      metadata: { provinceCode: 'shaanxi' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'shaanxi',
      appliedProfileCode: 'shaanxi',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'shaanxi',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('陕西省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-SHAANXI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'shaanxi',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Gansu after governed publication as the second northwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '甘肃省兰州市城关',
      metadata: { provinceCode: 'gansu' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'gansu',
      appliedProfileCode: 'gansu',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'gansu',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('甘肃省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-GANSU-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'gansu',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Qinghai after governed publication as the third northwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '青海省西宁市城西',
      metadata: { provinceCode: 'qinghai' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'qinghai',
      appliedProfileCode: 'qinghai',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'qinghai',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('青海省工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-QINGHAI-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'qinghai',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Ningxia after governed publication as the fourth northwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '宁夏回族自治区银川市金凤',
      metadata: { provinceCode: 'ningxia' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'ningxia',
      appliedProfileCode: 'ningxia',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'ningxia',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('宁夏回族自治区工程建设项目审批管理系统项目代'), '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-NINGXIA-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'ningxia',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('applies Xinjiang after governed publication as the final northwest expansion province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '新疆维吾尔自治区乌鲁木齐市水磨沟',
      metadata: { provinceCode: 'xinjiang' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'xinjiang',
      appliedProfileCode: 'xinjiang',
      source: 'project_metadata',
      sourceCheckedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'xinjiang',
      applied: true,
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['新疆维吾尔自治区工程建设项目审批管理系统项目代码', '土地出让合同、成交确认及价款缴纳凭证']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-PROVINCE-XINJIANG-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'xinjiang',
    })
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('materialPackageOverrides')
  })

  it('reports published province rule source metadata without exposing governance-only fields', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: 'zhejiang hangzhou',
      metadata: { provinceCode: 'zhejiang' },
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'zhejiang',
      recognizedProvinceName: expect.stringContaining('浙江'),
      appliedProfileCode: 'zhejiang',
      appliedProfileName: expect.stringContaining('浙江'),
      source: 'project_metadata',
      recognitionAccuracy: 'profile_code',
      updateMode: 'governed_seed_update',
      policyUpdatePolicy: 'trusted_source_auto_publish',
      sourceCheckedAt: '2026-05-28',
      nextReviewDueAt: '2026-08-28',
    })
    expect(preview.provinceRuleSource).not.toHaveProperty('reviewStatus')
    expect(preview.provinceRuleSource).not.toHaveProperty('curationMethod')
    expect(preview.provinceRuleSource).not.toHaveProperty('materialOverrides')
    expect(preview.provinceProfile).not.toHaveProperty('reviewStatus')
    expect(preview.provinceProfile).not.toHaveProperty('curationMethod')
    expect(preview.provinceProfile).not.toHaveProperty('materialOverrides')
  })

  it('composes land acquisition material packages from the published province profile', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: 'guangdong guangzhou',
      metadata: { provinceCode: 'guangdong' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const transfer = preview.landAcquisition.methods.find((method) => method.methodCode === 'transfer')

    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      source: 'project_metadata',
    })
    expect(transfer?.materialNames).toEqual(
      expect.arrayContaining(['出让合同', expect.stringContaining('广东省工程建设项目审批窗口资料清')]),
    )
    expect(transfer?.policyBasis).toEqual(
      expect.arrayContaining(['广东省 profile：出让取得资料包补充']),
    )
  })

  it('returns composed certificate material packages for the commercial template preview', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: 'guangdong guangzhou',
      metadata: { provinceCode: 'guangdong' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(preview.materialPackages.map((materialPackage) => materialPackage.packageCode)).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
        'PKG-LAND-METHOD-TRANSFER',
        'PKG-PROVINCE-GUANGDONG-TRANSFER',
      ]),
    )
    expect(preview.materialPackages.find((materialPackage) => materialPackage.packageCode === 'PKG-LAND-METHOD-TRANSFER')).toMatchObject({
      packageScope: 'land_acquisition_method',
      selected: true,
      source: 'land_acquisition_method',
      methodCode: 'transfer',
    })
    expect(preview.materialPackages.find((materialPackage) => materialPackage.packageCode === 'PKG-PROVINCE-GUANGDONG-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      selected: true,
      source: 'province_profile',
      provinceCode: 'guangdong',
    })
    expect(preview.materialPackages.find((materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('审图合格'), '质量安全监督手续', expect.stringContaining('施工合同及参建单位资'), expect.stringContaining('现场开工条')]),
    )
    expect(preview.materialPackages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reviewStatus: expect.anything(),
          curationMethod: expect.anything(),
          materialOverrides: expect.anything(),
        }),
      ]),
    )
  })

  it('applies city overrides after the province profile for Shenzhen projects', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '广东省深圳市南山区前海片',
      metadata: { provinceCode: 'guangdong', cityCode: 'shenzhen' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'guangdong',
      appliedProfileCode: 'guangdong',
      source: 'project_metadata',
    })
    expect((preview as any).cityOverride).toMatchObject({
      cityCode: 'shenzhen',
      cityName: expect.stringContaining('深圳'),
      provinceCode: 'guangdong',
      source: 'project_metadata',
      applied: true,
    })
    expect((preview as any).cityOverride).not.toHaveProperty('reviewStatus')
    expect((preview as any).cityOverride).not.toHaveProperty('curationMethod')
    expect((preview as any).cityOverride).not.toHaveProperty('materialOverrides')
    expect((preview as any).cityOverride?.policySources[0]).not.toHaveProperty('policyLevel')
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['深圳市施工许可申请表', expect.stringContaining('深圳市质量安全监督与实名制资')]),
    )
    expect(packagesByCode.get('PKG-CITY-SHENZHEN-TRANSFER')).toMatchObject({
      packageScope: 'city_overlay',
      source: 'city_override',
      provinceCode: 'guangdong',
      cityCode: 'shenzhen',
      methodCode: 'transfer',
    })
    expect(packagesByCode.get('PKG-CITY-SHENZHEN-TRANSFER')?.materialNames).toEqual(
      expect.arrayContaining(['深圳市出让取得土地权属链补充材料']),
    )
  })

  it('uses project static location facts to resolve province and city overrides before location text fallback', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: 'unstructured project address without province or city aliases',
      metadata: {
        projectGenerationFacts: {
          locationFacts: {
            province: 'guangdong',
            provinceCode: 'guangdong',
            city: 'shenzhen',
            cityCode: 'shenzhen',
            rawLocation: 'guangdong shenzhen qianhai',
          },
        },
      },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'guangdong',
      appliedProfileCode: 'guangdong',
      source: 'project_static_profile',
      recognitionAccuracy: 'profile_code',
    })
    expect(preview.provinceProfile).toMatchObject({
      provinceCode: 'guangdong',
      source: 'project_static_profile',
      applied: true,
    })
    expect(preview.cityOverride).toMatchObject({
      cityCode: 'shenzhen',
      provinceCode: 'guangdong',
      source: 'project_static_profile',
      applied: true,
    })
    expect(preview.materialPackages.map((materialPackage) => materialPackage.packageCode)).toContain('PKG-CITY-SHENZHEN-TRANSFER')
  })

  it('exposes city material authority and reusable output depth for the business preview', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: null,
      metadata: {
        projectGenerationFacts: {
          locationFacts: {
            province: 'guangdong',
            provinceCode: 'guangdong',
            city: 'shenzhen',
            cityCode: 'shenzhen',
            rawLocation: 'guangdong shenzhen qianhai',
          },
        },
      },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(preview.cityOverride).toMatchObject({
      cityCode: 'shenzhen',
      source: 'project_static_profile',
      applied: true,
      handlingAuthorityOverrides: {
        land: expect.any(String),
        landUsePlanning: expect.any(String),
        engineeringPlanning: expect.any(String),
        constructionPermit: expect.any(String),
      },
      reusableOutputOverrides: {
        landToLandUsePlanning: expect.any(Array),
        landUsePlanningToEngineeringPlanning: expect.any(Array),
        engineeringPlanningToConstructionPermit: expect.any(Array),
        drawingReviewToConstructionPermit: expect.any(Array),
      },
    })
    expect(preview.cityOverride?.reusableOutputOverrides?.landToLandUsePlanning.length).toBeGreaterThanOrEqual(2)
    expect(preview.cityOverride).not.toHaveProperty('reviewStatus')
    expect(preview.cityOverride).not.toHaveProperty('curationMethod')
    expect(preview.cityOverride).not.toHaveProperty('materialOverrides')
    expect(preview.cityOverride).not.toHaveProperty('materialPackageOverrides')
    expect(preview.cityOverride as any).not.toHaveProperty('zoneCode')
    expect(preview.cityOverride as any).not.toHaveProperty('zoneName')
  })

  it('uses wizard location facts as the static profile city source when generated facts are not stored', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: null,
      metadata: {
        wizard_location_facts: {
          province: 'jiangsu',
          city: 'suzhou',
          rawLocation: 'jiangsu suzhou industrial park',
        },
      },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'jiangsu',
      appliedProfileCode: 'jiangsu',
      source: 'project_static_profile',
      recognitionAccuracy: 'province_alias',
    })
    expect(preview.cityOverride).toMatchObject({
      overrideCode: 'city_override_jiangsu_suzhou_v14222',
      cityCode: 'suzhou',
      source: 'project_static_profile',
      applied: true,
    })
    expect(preview.materialPackages.map((materialPackage) => materialPackage.packageCode)).toContain('PKG-CITY-SUZHOU-TRANSFER')
  })

  it('applies Suzhou city overrides when a project location mentions Suzhou Industrial Park', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '江苏省苏州市苏州工业园区星湖',
      metadata: { provinceCode: 'jiangsu', cityCode: 'suzhou', zone: 'suzhou_industrial_park' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'jiangsu',
      appliedProfileCode: 'jiangsu',
      source: 'project_metadata',
    })
    expect((preview as any).cityOverride).toMatchObject({
      overrideCode: 'city_override_jiangsu_suzhou_v14222',
      cityCode: 'suzhou',
      cityName: expect.stringContaining('苏州'),
      provinceCode: 'jiangsu',
      overrideScope: 'city',
      source: 'project_metadata',
      applied: true,
    })
    expect((preview as any).cityOverride).not.toHaveProperty('zoneCode')
    expect((preview as any).cityOverride).not.toHaveProperty('zoneName')
    expect((preview as any).cityOverride).not.toHaveProperty('reviewStatus')
    expect((preview as any).cityOverride).not.toHaveProperty('curationMethod')
    expect((preview as any).cityOverride).not.toHaveProperty('materialOverrides')
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('苏州市建设用地规划许可申请材'), '苏州市规划条件及用地红线资料']),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['苏州市施工许可申请表', expect.stringContaining('苏州市质量安全监督资')]),
    )
    expect(packagesByCode.get('PKG-CITY-SUZHOU-TRANSFER')).toMatchObject({
      packageName: '苏州市出让取得补充资料包',
      packageScope: 'city_overlay',
      source: 'city_override',
      provinceCode: 'jiangsu',
      cityCode: 'suzhou',
      methodCode: 'transfer',
    })
    expect(packagesByCode.get('PKG-CITY-SUZHOU-TRANSFER')?.materialNames).toEqual(
      expect.arrayContaining(['苏州市土地出让及不动产权属链补充材料']),
    )
  })

  it('resolves zone-like project metadata into city-scoped local override packages', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])

    const cases = [
      {
        provinceCode: 'jiangsu',
        cityCode: 'suzhou',
        zone: 'suzhou_industrial_park',
        location: '江苏省苏州市苏州工业园区星湖',
        expectedOverrideCode: 'city_override_jiangsu_suzhou_v14222',
        expectedCityName: expect.stringContaining('苏州'),
        expectedPackageCode: 'PKG-CITY-SUZHOU-TRANSFER',
      },
      {
        provinceCode: 'shanghai',
        cityCode: 'shanghai',
        zone: 'shanghai_pudong',
        location: '上海市浦东新',
        expectedOverrideCode: 'city_override_shanghai_shanghai_v14222',
        expectedCityName: expect.stringContaining('上海'),
        expectedPackageCode: 'PKG-CITY-SHANGHAI-TRANSFER',
      },
      {
        provinceCode: 'zhejiang',
        cityCode: 'hangzhou',
        zone: 'hangzhou_high_tech_zone',
        location: '浙江省杭州市滨江区杭州高新区',
        expectedOverrideCode: 'city_override_zhejiang_hangzhou_v14222',
        expectedCityName: expect.stringContaining('杭州'),
        expectedPackageCode: 'PKG-CITY-HANGZHOU-TRANSFER',
      },
    ]

    for (const testCase of cases) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: 'project-1',
        location: testCase.location,
        metadata: {
          provinceCode: testCase.provinceCode,
          cityCode: testCase.cityCode,
          zone: testCase.zone,
        },
      })

      const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
      const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

      expect(preview.cityOverride).toMatchObject({
        overrideCode: testCase.expectedOverrideCode,
        cityCode: testCase.cityCode,
        cityName: testCase.expectedCityName,
        provinceCode: testCase.provinceCode,
        overrideScope: 'city',
        source: 'project_metadata',
        applied: true,
      })
      expect(preview.cityOverride as any).not.toHaveProperty('zoneCode')
      expect(preview.cityOverride as any).not.toHaveProperty('zoneName')
      expect(packagesByCode.get(testCase.expectedPackageCode)).toMatchObject({
        packageScope: 'city_overlay',
        source: 'city_override',
        provinceCode: testCase.provinceCode,
        cityCode: testCase.cityCode,
        methodCode: 'transfer',
      })
      expect(JSON.stringify(preview)).not.toMatch(/PKG-CITY-(SUZHOU_INDUSTRIAL_PARK|SHANGHAI_PUDONG|HANGZHOU_HIGH_TECH_ZONE)-TRANSFER/)
      expect(JSON.stringify(preview)).not.toMatch(/park_override|district_override/)
    }
  })

  it('applies the direct city expansion batch as published commercial templates', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])

    const cases = [
      {
        provinceCode: 'tianjin',
        cityCode: 'tianjin',
        location: '天津市滨海新',
        expectedCityName: expect.stringContaining('天津'),
        expectedTransferMaterial: '天津市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-TIANJIN-TRANSFER',
      },
      {
        provinceCode: 'chongqing',
        cityCode: 'chongqing',
        location: '重庆市两江新',
        expectedCityName: expect.stringContaining('重庆'),
        expectedTransferMaterial: '重庆市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-CHONGQING-TRANSFER',
      },
      {
        provinceCode: 'shandong',
        cityCode: 'qingdao',
        location: '山东省青岛市崂山',
        expectedCityName: expect.stringContaining('青岛'),
        expectedTransferMaterial: '青岛市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-QINGDAO-TRANSFER',
      },
      {
        provinceCode: 'zhejiang',
        cityCode: 'ningbo',
        location: '浙江省宁波市鄞州',
        expectedCityName: expect.stringContaining('宁波'),
        expectedTransferMaterial: '宁波市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-NINGBO-TRANSFER',
      },
      {
        provinceCode: 'fujian',
        cityCode: 'xiamen',
        location: '福建省厦门市湖里',
        expectedCityName: expect.stringContaining('厦门'),
        expectedTransferMaterial: '厦门市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-XIAMEN-TRANSFER',
      },
      {
        provinceCode: 'anhui',
        cityCode: 'hefei',
        location: '安徽省合肥市蜀山区',
        expectedCityName: expect.stringContaining('合肥'),
        expectedTransferMaterial: '合肥市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-HEFEI-TRANSFER',
      },
      {
        provinceCode: 'jiangsu',
        cityCode: 'wuxi',
        location: '江苏省无锡市新吴',
        expectedCityName: expect.stringContaining('无锡'),
        expectedTransferMaterial: '无锡市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-WUXI-TRANSFER',
      },
      {
        provinceCode: 'guangdong',
        cityCode: 'foshan',
        location: '广东省佛山市顺德',
        expectedCityName: expect.stringContaining('佛山'),
        expectedTransferMaterial: '佛山市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-FOSHAN-TRANSFER',
      },
    ]

    for (const testCase of cases) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: 'project-1',
        location: testCase.location,
        metadata: { provinceCode: testCase.provinceCode, cityCode: testCase.cityCode },
      })

      const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
      const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

      expect(preview.provinceRuleSource).toMatchObject({
        recognizedProvinceCode: testCase.provinceCode,
        appliedProfileCode: testCase.provinceCode,
      })
      expect(preview.cityOverride).toMatchObject({
        cityCode: testCase.cityCode,
        cityName: testCase.expectedCityName,
        provinceCode: testCase.provinceCode,
        source: 'project_metadata',
        applied: true,
      })
      expect(preview.cityOverride).not.toHaveProperty('reviewStatus')
      expect(preview.cityOverride).not.toHaveProperty('curationMethod')
      expect(preview.cityOverride).not.toHaveProperty('materialOverrides')
      expect(packagesByCode.get(testCase.expectedPackageCode)).toMatchObject({
        packageScope: 'city_overlay',
        source: 'city_override',
        provinceCode: testCase.provinceCode,
        cityCode: testCase.cityCode,
        methodCode: 'transfer',
      })
      expect(packagesByCode.get(testCase.expectedPackageCode)?.materialNames).toEqual(
        expect.arrayContaining([testCase.expectedTransferMaterial]),
      )
      expect(JSON.stringify(preview)).not.toContain('not_consumed_until_published')
      expect(JSON.stringify(preview)).not.toContain('governed_review_required')
    }
  })

  it('applies the second direct key city expansion batch as published commercial templates', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])

    const cases = [
      {
        provinceCode: 'henan',
        cityCode: 'zhengzhou',
        location: '河南省郑州市郑东新区',
        expectedCityName: expect.stringContaining('郑州'),
        expectedTransferMaterial: '郑州市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-ZHENGZHOU-TRANSFER',
      },
      {
        provinceCode: 'hunan',
        cityCode: 'changsha',
        location: '湖南省长沙市岳麓',
        expectedCityName: expect.stringContaining('长沙'),
        expectedTransferMaterial: '长沙市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-CHANGSHA-TRANSFER',
      },
      {
        provinceCode: 'shandong',
        cityCode: 'jinan',
        location: '山东省济南市历下',
        expectedCityName: expect.stringContaining('济南'),
        expectedTransferMaterial: '济南市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-JINAN-TRANSFER',
      },
      {
        provinceCode: 'fujian',
        cityCode: 'fuzhou',
        location: '福建省福州市鼓楼',
        expectedCityName: expect.stringContaining('福州'),
        expectedTransferMaterial: '福州市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-FUZHOU-TRANSFER',
      },
      {
        provinceCode: 'liaoning',
        cityCode: 'shenyang',
        location: '辽宁省沈阳市浑南',
        expectedCityName: expect.stringContaining('沈阳'),
        expectedTransferMaterial: '沈阳市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-SHENYANG-TRANSFER',
      },
      {
        provinceCode: 'liaoning',
        cityCode: 'dalian',
        location: '辽宁省大连市金普新区',
        expectedCityName: expect.stringContaining('大连'),
        expectedTransferMaterial: '大连市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-DALIAN-TRANSFER',
      },
      {
        provinceCode: 'yunnan',
        cityCode: 'kunming',
        location: '云南省昆明市呈贡',
        expectedCityName: expect.stringContaining('昆明'),
        expectedTransferMaterial: '昆明市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-KUNMING-TRANSFER',
      },
      {
        provinceCode: 'jiangxi',
        cityCode: 'nanchang',
        location: '江西省南昌市红谷滩区',
        expectedCityName: expect.stringContaining('南昌'),
        expectedTransferMaterial: '南昌市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-NANCHANG-TRANSFER',
      },
    ]

    for (const testCase of cases) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: 'project-1',
        location: testCase.location,
        metadata: { provinceCode: testCase.provinceCode, cityCode: testCase.cityCode },
      })

      const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
      const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

      expect(preview.provinceRuleSource).toMatchObject({
        recognizedProvinceCode: testCase.provinceCode,
        appliedProfileCode: testCase.provinceCode,
      })
      expect(preview.cityOverride).toMatchObject({
        cityCode: testCase.cityCode,
        cityName: testCase.expectedCityName,
        provinceCode: testCase.provinceCode,
        source: 'project_metadata',
        applied: true,
        overrideScope: 'city',
      })
      expect(preview.cityOverride as any).not.toHaveProperty('zoneCode')
      expect(preview.cityOverride as any).not.toHaveProperty('zoneName')
      expect(preview.cityOverride).not.toHaveProperty('reviewStatus')
      expect(preview.cityOverride).not.toHaveProperty('curationMethod')
      expect(preview.cityOverride).not.toHaveProperty('materialOverrides')
      expect(packagesByCode.get(testCase.expectedPackageCode)).toMatchObject({
        packageScope: 'city_overlay',
        source: 'city_override',
        provinceCode: testCase.provinceCode,
        cityCode: testCase.cityCode,
        methodCode: 'transfer',
      })
      expect(packagesByCode.get(testCase.expectedPackageCode)?.materialNames).toEqual(
        expect.arrayContaining([testCase.expectedTransferMaterial]),
      )
      expect(JSON.stringify(preview)).not.toContain('park_override')
      expect(JSON.stringify(preview)).not.toContain('district_override')
    }
  })

  it('applies the first-batch local city rules as published commercial templates', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])

    const cases = [
      {
        provinceCode: 'beijing',
        cityCode: 'beijing',
        location: '北京市朝阳区',
        expectedCityName: expect.stringContaining('北京'),
        expectedTransferMaterial: '北京市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-BEIJING-TRANSFER',
      },
      {
        provinceCode: 'guangdong',
        cityCode: 'guangzhou',
        location: '广东省广州市天河',
        expectedCityName: expect.stringContaining('广州'),
        expectedTransferMaterial: '广州市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-GUANGZHOU-TRANSFER',
      },
      {
        provinceCode: 'jiangsu',
        cityCode: 'nanjing',
        location: '江苏省南京市建邺',
        expectedCityName: expect.stringContaining('南京'),
        expectedTransferMaterial: '南京市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-NANJING-TRANSFER',
      },
      {
        provinceCode: 'sichuan',
        cityCode: 'chengdu',
        location: '四川省成都市高新',
        expectedCityName: expect.stringContaining('成都'),
        expectedTransferMaterial: '成都市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-CHENGDU-TRANSFER',
      },
      {
        provinceCode: 'hubei',
        cityCode: 'wuhan',
        location: '湖北省武汉市东湖高新',
        expectedCityName: expect.stringContaining('武汉'),
        expectedTransferMaterial: '武汉市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-WUHAN-TRANSFER',
      },
      {
        provinceCode: 'shaanxi',
        cityCode: 'xian',
        location: '陕西省西安市雁塔',
        expectedCityName: expect.stringContaining('西安'),
        expectedTransferMaterial: '西安市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-XIAN-TRANSFER',
      },
      {
        provinceCode: 'shanghai',
        cityCode: 'shanghai',
        zone: 'shanghai_pudong',
        location: '上海市浦东新',
        expectedCityName: expect.stringContaining('上海'),
        expectedTransferMaterial: '上海市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-SHANGHAI-TRANSFER',
      },
      {
        provinceCode: 'zhejiang',
        cityCode: 'hangzhou',
        zone: 'hangzhou_high_tech_zone',
        location: '浙江省杭州市滨江区杭州高新区',
        expectedCityName: expect.stringContaining('杭州'),
        expectedTransferMaterial: '杭州市出让取得土地权属链补充材料',
        expectedPackageCode: 'PKG-CITY-HANGZHOU-TRANSFER',
      },
    ]

    for (const testCase of cases) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: 'project-1',
        location: testCase.location,
        metadata: {
          provinceCode: testCase.provinceCode,
          cityCode: testCase.cityCode,
          ...(testCase.zone ? { zone: testCase.zone } : {}),
        },
      })

      const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
      const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

      expect(preview.provinceRuleSource).toMatchObject({
        recognizedProvinceCode: testCase.provinceCode,
        appliedProfileCode: testCase.provinceCode,
      })
      expect(preview.cityOverride).toMatchObject({
        cityCode: testCase.cityCode,
        cityName: testCase.expectedCityName,
        provinceCode: testCase.provinceCode,
        source: 'project_metadata',
        applied: true,
        overrideScope: 'city',
      })
      expect(preview.cityOverride as any).not.toHaveProperty('zoneCode')
      expect(preview.cityOverride as any).not.toHaveProperty('zoneName')
      expect(preview.cityOverride).not.toHaveProperty('reviewStatus')
      expect(preview.cityOverride).not.toHaveProperty('curationMethod')
      expect(preview.cityOverride).not.toHaveProperty('materialOverrides')
      expect(packagesByCode.get(testCase.expectedPackageCode)).toMatchObject({
        packageScope: 'city_overlay',
        source: 'city_override',
        provinceCode: testCase.provinceCode,
        cityCode: testCase.cityCode,
        methodCode: 'transfer',
      })
      expect(packagesByCode.get(testCase.expectedPackageCode)?.materialNames).toEqual(
        expect.arrayContaining([testCase.expectedTransferMaterial]),
      )
      expect(JSON.stringify(preview)).not.toContain('_candidate_v14222')
      expect(JSON.stringify(preview)).not.toContain('not_consumed_until_published')
      expect(JSON.stringify(preview)).not.toContain('governed_review_required')
    }
  })

  it('composes Zhejiang four-certificate material packages as the first deep province sample', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '浙江省杭州市余杭',
      metadata: { provinceCode: 'zhejiang' },
    })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
    const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

    expect(preview.provinceRuleSource).toMatchObject({
      recognizedProvinceCode: 'zhejiang',
      appliedProfileCode: 'zhejiang',
      source: 'project_metadata',
    })
    expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('浙江省投资项目在线审批监管平台项目代'), '宗地图、界址点成果及交地确认材料']),
    )
    expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('建设项目用地预审与选址或规划条件材'), expect.stringContaining('土地取得或权属证明材')]),
    )
    expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining(['设计方案文本及总平面图', expect.stringContaining('蓝图、定位图及规划校核材')]),
    )
    expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料']),
    )
    expect(packagesByCode.get('PKG-PROVINCE-ZHEJIANG-TRANSFER')).toMatchObject({
      packageScope: 'province_overlay',
      source: 'province_profile',
      provinceCode: 'zhejiang',
    })
    expect(preview.materialPackages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reviewStatus: expect.anything(),
          curationMethod: expect.anything(),
          materialPackageOverrides: expect.anything(),
        }),
      ]),
    )
  })

  it('composes Guangdong and Jiangsu four-certificate province material packages after publication', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])

    const cases = [
      {
        provinceCode: 'guangdong',
        location: '广东省广州市天河',
        expected: {
          land: [expect.stringContaining('广东省投资项目在线审批监管平台项目代'), '土地出让合同、成交确认及价款缴纳凭证'],
          lup: [expect.stringContaining('建设用地规划许可统一申请'), expect.stringContaining('土地取得或权属证明材')],
          epp: ['建设工程设计方案文本及总平面图', expect.stringContaining('联合测绘或规划技术审查材')],
          cp: [expect.stringContaining('施工图联合审查合格资'), '质量安全监督登记和实名制管理材料'],
        },
      },
      {
        provinceCode: 'jiangsu',
        location: '江苏省南京市建邺',
        expected: {
          land: [expect.stringContaining('江苏省投资项目在线审批监管平台项目代'), '不动产权属或土地取得证明材料'],
          lup: [expect.stringContaining('用地预审与选址或规划条件材'), expect.stringContaining('用地红线、宗地图和规划条件附')],
          epp: ['方案设计文本、总平面图及单体图', '蓝图、日照分析或规划校核材料'],
          cp: ['施工图审查合格书', '建设工程质量安全监督手续'],
        },
      },
    ]

    for (const testCase of cases) {
      state.executeSQLOne.mockResolvedValueOnce({
        id: 'project-1',
        location: testCase.location,
        metadata: { provinceCode: testCase.provinceCode },
      })
      const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'transfer' })
      const packagesByCode = new Map(preview.materialPackages.map((materialPackage) => [materialPackage.packageCode, materialPackage]))

      expect(preview.provinceRuleSource).toMatchObject({
        recognizedProvinceCode: testCase.provinceCode,
        appliedProfileCode: testCase.provinceCode,
      })
      expect(packagesByCode.get('PKG-CERT-LAND-COMMON')?.materialNames, testCase.provinceCode).toEqual(
        expect.arrayContaining(testCase.expected.land),
      )
      expect(packagesByCode.get('PKG-CERT-LUP-COMMON')?.materialNames, testCase.provinceCode).toEqual(
        expect.arrayContaining(testCase.expected.lup),
      )
      expect(packagesByCode.get('PKG-CERT-EPP-COMMON')?.materialNames, testCase.provinceCode).toEqual(
        expect.arrayContaining(testCase.expected.epp),
      )
      expect(packagesByCode.get('PKG-CERT-CP-COMMON')?.materialNames, testCase.provinceCode).toEqual(
        expect.arrayContaining(testCase.expected.cp),
      )
      expect(packagesByCode.get(`PKG-PROVINCE-${testCase.provinceCode.toUpperCase()}-TRANSFER`)).toMatchObject({
        packageScope: 'province_overlay',
        source: 'province_profile',
        provinceCode: testCase.provinceCode,
      })
    }
  })

  it('switches the selected land acquisition material package in preview output', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'allocation' })

    expect(preview.materialPackages.map((materialPackage) => materialPackage.packageCode)).toEqual(
      expect.arrayContaining(['PKG-LAND-METHOD-ALLOCATION']),
    )
    expect(preview.materialPackages.map((materialPackage) => materialPackage.packageCode)).not.toContain('PKG-LAND-METHOD-TRANSFER')
    expect(preview.materialPackages.find((materialPackage) => materialPackage.packageCode === 'PKG-LAND-METHOD-ALLOCATION')?.materialNames).toEqual(
      expect.arrayContaining([expect.stringContaining('划拨决定'), '建设项目用地预审与选址意见']),
    )
  })

  it('evaluates conditional work items from project metadata facts', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const defaultPreview = await buildCertificateTemplatePreview('project-1')

    expect(defaultPreview.workItems.map((item) => item.workItemCode)).not.toContain('CERT-DOC-HUMAN-DEFENSE-REVIEW')

    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      metadata: { hasCivilDefense: true },
    })

    const civilDefensePreview = await buildCertificateTemplatePreview('project-1')

    expect(civilDefensePreview.workItems.find((item) => item.workItemCode === 'CERT-DOC-HUMAN-DEFENSE-REVIEW')).toMatchObject({
      action: 'will_create',
      requiredPolicy: 'conditional',
    })
  })

  it('keeps broad optional packs out of the default preview and adds them from project facts', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQL.mockResolvedValue([])
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })

    const defaultPreview = await buildCertificateTemplatePreview('project-1')
    const defaultCodes = defaultPreview.workItems.map((item) => item.workItemCode)

    expect(defaultCodes).not.toEqual(expect.arrayContaining([
      'CERT-DOC-TRAFFIC-IMPACT',
      'CERT-EPP-TRAFFIC-REVIEW',
      'CERT-EPP-COMMITTEE',
      'CERT-EPP-PUBLIC-NOTICE',
      'CERT-CP-FIRE-REVIEW',
      'CERT-CP-HFD-CERT',
      'CERT-CP-TEMP-PERMIT',
    ]))

    state.executeSQLOne.mockResolvedValue({
      id: 'project-1',
      location: '广东省广州市',
      metadata: {
        projectFeature: ['traffic_impact', 'planning_committee', 'scheme_public_notice'],
        hasFireReview: true,
        hasCivilDefense: true,
        businessSubtype: 'temporary_construction_permit',
      },
    })

    const featurePreview = await buildCertificateTemplatePreview('project-1')
    const featureCodes = featurePreview.workItems.map((item) => item.workItemCode)

    expect(featureCodes).toEqual(expect.arrayContaining([
      'CERT-DOC-TRAFFIC-IMPACT',
      'CERT-EPP-TRAFFIC-REVIEW',
      'CERT-EPP-COMMITTEE',
      'CERT-EPP-PUBLIC-NOTICE',
      'CERT-CP-FIRE-REVIEW',
      'CERT-CP-HFD-CERT',
      'CERT-CP-TEMP-PERMIT',
    ]))
  })

  it('marks existing certificates and same-name uncoded work items without auto-merging them', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) {
        return [
          {
            id: 'cert-land',
            project_id: 'project-1',
            certificate_type: 'land_certificate',
            milestone_type: 'land_certificate',
            certificate_name: '土地',
            status: 'issued',
            certificate_no: 'LAND-001',
            current_stage: '批复领证',
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM certificate_work_items')) {
        return [
          {
            id: 'work-basic',
            project_id: 'project-1',
            item_code: null,
            item_name: '项目基础资料整理',
            item_stage: '资料准备',
            status: 'pending',
            is_shared: true,
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          },
        ]
      }
      return []
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.certificates.find((certificate) => certificate.certificateType === 'land_certificate')).toMatchObject({
      action: 'will_skip_existing',
      selected: false,
      existingId: 'cert-land',
    })
    expect(preview.workItems.find((item) => item.workItemCode === 'CERT-DOC-PROJECT-BASIC')).toMatchObject({
      action: 'needs_confirmation',
      selected: false,
      existingId: 'work-basic',
    })
    expect(preview.summary.skippedExistingCount).toBeGreaterThanOrEqual(1)
    expect(preview.summary.needsConfirmationCount).toBeGreaterThanOrEqual(1)
  })

  it('keeps preview available when optional project facts are unavailable', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) {
        throw new Error('dbService.executeSQL SELECT pre_milestones skipped because Supabase REST circuit is open')
      }
      return []
    })

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.summary.certificateCreateCount).toBe(4)
    expect(preview.certificates.every((certificate) => certificate.action === 'will_create')).toBe(true)
    expect(preview.workItems.length).toBeGreaterThan(20)
  })

  it('keeps preview available when project base facts are temporarily unavailable', async () => {
    const { buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockRejectedValue(new Error('dbService.executeSQL SELECT projects skipped because Supabase REST circuit is open'))
    state.executeSQL.mockResolvedValue([])

    const preview = await buildCertificateTemplatePreview('project-1')

    expect(preview.projectId).toBe('project-1')
    expect(preview.summary.certificateCreateCount).toBe(4)
    expect(preview.certificates.every((certificate) => certificate.action === 'will_create')).toBe(true)
    expect(preview.workItems.length).toBeGreaterThan(20)
  })

  it('applies the selected template items idempotently and records an apply batch', async () => {
    const { applyCertificateTemplate, buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockResolvedValue([])

    const preview = await buildCertificateTemplatePreview('project-1')
    const selectedWorkItemCodes = preview.workItems.slice(0, 3).map((item) => item.workItemCode)
    const selectedDependencyCodes = preview.dependencies
      .filter((dependency) => dependency.predecessor.type === 'certificate' && dependency.successor.type === 'certificate')
      .map((dependency) => dependency.dependencyCode)

    const insertedRows: Record<string, any>[] = []
    state.client.query.mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] ?? '')
      const params = Array.isArray(args[1]) ? args[1] : []
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('FROM public.certificate_template_apply_batches')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO "pre_milestones"')) {
        const row = {
          id: String(params[0]),
          project_id: String(params[1]),
          certificate_type: String(params[4]),
          milestone_type: String(params[2]),
          certificate_name: String(params[5]),
        }
        insertedRows.push(row)
        return { rows: [row], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO "certificate_work_items"')) {
        const row = {
          id: String(params[0]),
          project_id: String(params[1]),
          item_code: String(params[2]),
          item_name: String(params[3]),
        }
        insertedRows.push(row)
        return { rows: [row], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO "certificate_dependencies"')) {
        const row = {
          id: String(params[0]),
          project_id: String(params[1]),
          predecessor_type: String(params[2]),
          predecessor_id: String(params[3]),
          successor_type: String(params[4]),
          successor_id: String(params[5]),
        }
        insertedRows.push(row)
        return { rows: [row], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO "certificate_template_apply_batches"')) {
        const row = {
          id: String(params[0]),
          project_id: String(params[1]),
          template_code: String(params[2]),
          seed_version: String(params[3]),
          summary: params[6],
        }
        insertedRows.push(row)
        return { rows: [row], rowCount: 1 }
      }
      throw new Error(`unexpected sql: ${sql}`)
    })

    const result = await applyCertificateTemplate('project-1', {
      templateCode: preview.templateCode,
      seedVersion: preview.seedVersion,
      selectedCertificateKeys: preview.certificates.map((certificate) => certificate.certificateType),
      selectedWorkItemCodes,
      selectedDependencyCodes,
      duplicatePolicy: 'skip_existing',
      landAcquisitionMethodCode: 'transfer',
    })

    expect(result.createdCertificateIds).toHaveLength(4)
    expect(result.createdWorkItemIds).toHaveLength(3)
    expect(result.createdDependencyIds).toHaveLength(selectedDependencyCodes.length)
    expect(result.skippedExisting).toEqual([])
    expect(state.client.query).toHaveBeenCalledWith('BEGIN')
    expect(state.client.query).toHaveBeenCalledWith('COMMIT')
    expect(insertedRows.some((row) => row.template_code === GENERAL_CERTIFICATE_TEMPLATE_CODE)).toBe(true)
  })

  it('locks the project before re-reading apply facts and persists an idempotency key', async () => {
    const { applyCertificateTemplate } = await import('../services/certificateTemplateService.js')
    const events: string[] = []
    state.executeSQLOne.mockImplementation(async () => {
      events.push('fact-read')
      return { id: 'project-1', metadata: {} }
    })
    state.executeSQL.mockImplementation(async () => {
      events.push('fact-read')
      return []
    })
    state.client.query.mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] ?? '')
      if (sql.includes('pg_advisory_xact_lock')) {
        events.push('project-lock')
        return { rows: [], rowCount: 1 }
      }
      if (sql.includes('FROM public.certificate_template_apply_batches')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO "certificate_template_apply_batches"')) {
        const params = Array.isArray(args[1]) ? args[1] : []
        expect(params).toContain('apply-request-1')
        return { rows: [{ id: 'batch-1' }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })

    await applyCertificateTemplate('project-1', {
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: [],
      selectedWorkItemCodes: [],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
      idempotencyKey: 'apply-request-1',
    })

    expect(events.indexOf('project-lock')).toBeGreaterThan(-1)
    expect(events.indexOf('fact-read')).toBeGreaterThan(events.indexOf('project-lock'))
  })

  it('replays a committed apply batch for the same idempotency key without writing facts again', async () => {
    const { applyCertificateTemplate } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockResolvedValue([])
    state.client.query.mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] ?? '')
      if (sql.includes('FROM public.certificate_template_apply_batches')) {
        return {
          rows: [{
            project_id: 'project-1',
            template_code: GENERAL_CERTIFICATE_TEMPLATE_CODE,
            seed_version: CERTIFICATE_TEMPLATE_SEED_VERSION,
            created_certificate_ids: ['certificate-1'],
            created_work_item_ids: ['work-item-1'],
            created_dependency_ids: ['dependency-1'],
            skipped_existing: [{ entityType: 'certificate', key: 'land_certificate', reason: 'existing' }],
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: 0 }
    })

    const result = await applyCertificateTemplate('project-1', {
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: ['land_certificate'],
      selectedWorkItemCodes: [],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
      idempotencyKey: 'apply-request-1',
    })

    expect(result).toMatchObject({
      projectId: 'project-1',
      createdCertificateIds: ['certificate-1'],
      createdWorkItemIds: ['work-item-1'],
      createdDependencyIds: ['dependency-1'],
    })
    const statements = state.client.query.mock.calls.map(([sql]) => String(sql))
    expect(statements.some((sql) => sql.includes('INSERT INTO'))).toBe(false)
    expect(statements).toContain('COMMIT')
  })

  it('serializes concurrent apply requests so a stale preview cannot duplicate a certificate', async () => {
    const { applyCertificateTemplate } = await import('../services/certificateTemplateService.js')
    const certificates: Array<Record<string, unknown>> = []
    let certificateInsertCount = 0
    let lockTail = Promise.resolve()

    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) return [...certificates]
      return []
    })

    function concurrentClient(label: string) {
      let releaseLock: (() => void) | null = null
      return {
        release: vi.fn(),
        query: vi.fn(async (...args: unknown[]) => {
          const sql = String(args[0] ?? '')
          const params = Array.isArray(args[1]) ? args[1] : []
          if (sql === 'BEGIN') return { rows: [], rowCount: 0 }
          if (sql.includes('pg_advisory_xact_lock')) {
            const previous = lockTail
            lockTail = new Promise<void>((resolve) => { releaseLock = resolve })
            await previous
            return { rows: [], rowCount: 1 }
          }
          if (sql.includes('FROM public.certificate_template_apply_batches')) return { rows: [], rowCount: 0 }
          if (sql.includes('INSERT INTO "pre_milestones"')) {
            certificateInsertCount += 1
            const row = {
              id: `${label}-certificate-${certificateInsertCount}`,
              project_id: String(params[1]),
              milestone_type: String(params[2]),
              certificate_type: String(params[4]),
              certificate_name: String(params[5]),
              status: String(params[6]),
            }
            certificates.push(row)
            return { rows: [row], rowCount: 1 }
          }
          if (sql.includes('INSERT INTO "certificate_template_apply_batches"')) {
            return { rows: [{ id: `${label}-batch` }], rowCount: 1 }
          }
          if (sql === 'COMMIT' || sql === 'ROLLBACK') {
            releaseLock?.()
            releaseLock = null
            return { rows: [], rowCount: 0 }
          }
          return { rows: [], rowCount: 0 }
        }),
      }
    }

    const firstClient = concurrentClient('first')
    const secondClient = concurrentClient('second')
    state.getClient
      .mockResolvedValueOnce(firstClient as any)
      .mockResolvedValueOnce(secondClient as any)

    const request = {
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: ['land_certificate'],
      selectedWorkItemCodes: [],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing' as const,
    }
    const [first, second] = await Promise.all([
      applyCertificateTemplate('project-1', { ...request, idempotencyKey: 'concurrent-1' }),
      applyCertificateTemplate('project-1', { ...request, idempotencyKey: 'concurrent-2' }),
    ])

    expect(certificateInsertCount).toBe(1)
    expect(first.createdCertificateIds.length + second.createdCertificateIds.length).toBe(1)
    expect(certificates).toHaveLength(1)
  })

  it('skips already coded project facts during apply without duplicating them', async () => {
    const { applyCertificateTemplate } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) {
        return [
          {
            id: 'cert-land',
            project_id: 'project-1',
            certificate_type: 'land_certificate',
            milestone_type: 'land_certificate',
            certificate_name: '土地',
            status: 'issued',
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          },
        ]
      }
      if (sql.includes('FROM certificate_work_items')) {
        return [
          {
            id: 'work-basic',
            project_id: 'project-1',
            item_code: 'CERT-DOC-PROJECT-BASIC',
            item_name: '项目基础资料整理',
            item_stage: '资料准备',
            status: 'pending',
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          },
        ]
      }
      return []
    })

    const insertedTables: string[] = []
    state.client.query.mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] ?? '')
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO "pre_milestones"')) insertedTables.push('pre_milestones')
      if (sql.includes('INSERT INTO "certificate_work_items"')) insertedTables.push('certificate_work_items')
      if (sql.includes('INSERT INTO "certificate_template_apply_batches"')) insertedTables.push('certificate_template_apply_batches')
      return { rows: [{ id: `row-${insertedTables.length}` }], rowCount: 1 }
    })

    const result = await applyCertificateTemplate('project-1', {
      templateCode: GENERAL_CERTIFICATE_TEMPLATE_CODE,
      seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
      selectedCertificateKeys: ['land_certificate'],
      selectedWorkItemCodes: ['CERT-DOC-PROJECT-BASIC'],
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
      landAcquisitionMethodCode: 'transfer',
    })

    expect(result.createdCertificateIds).toEqual([])
    expect(result.createdWorkItemIds).toEqual([])
    expect(result.skippedExisting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'certificate', key: 'land_certificate' }),
        expect.objectContaining({ entityType: 'work_item', key: 'CERT-DOC-PROJECT-BASIC' }),
      ]),
    )
    expect(insertedTables).toEqual(['certificate_template_apply_batches'])
  })

  it('creates dependencies that connect existing project facts with newly generated template items', async () => {
    const { applyCertificateTemplate, buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: { hasCivilDefense: true } })
    state.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM pre_milestones')) {
        return [
          {
            id: 'cert-cp-existing',
            project_id: 'project-1',
            certificate_type: 'construction_permit',
            milestone_type: 'construction_permit',
            certificate_name: '施工许可',
            status: 'pending',
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          },
        ]
      }
      return []
    })

    const preview = await buildCertificateTemplatePreview('project-1')
    expect(preview.dependencies.find((dependency) => dependency.dependencyCode === 'DEP-HFD-TO-CP')).toMatchObject({
      action: 'will_create',
    })

    const insertedDependencyRows: Array<Record<string, string>> = []
    state.client.query.mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] ?? '')
      const params = Array.isArray(args[1]) ? args[1] : []
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO "certificate_work_items"')) {
        return { rows: [{ id: 'work-hfd-new' }], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO "certificate_dependencies"')) {
        const row = {
          id: String(params[0]),
          predecessor_id: String(params[3]),
          successor_id: String(params[5]),
        }
        insertedDependencyRows.push(row)
        return { rows: [row], rowCount: 1 }
      }
      return { rows: [{ id: 'batch-row' }], rowCount: 1 }
    })

    const result = await applyCertificateTemplate('project-1', {
      templateCode: preview.templateCode,
      seedVersion: preview.seedVersion,
      selectedCertificateKeys: [],
      selectedWorkItemCodes: ['CERT-CP-HFD-CERT'],
      selectedDependencyCodes: ['DEP-HFD-TO-CP'],
      duplicatePolicy: 'skip_existing',
      landAcquisitionMethodCode: 'transfer',
    })

    expect(result.createdDependencyIds).toHaveLength(1)
    expect(insertedDependencyRows).toEqual([
      expect.objectContaining({
        predecessor_id: 'work-hfd-new',
        successor_id: 'cert-cp-existing',
      }),
    ])
  })

  it('applies the selected non-default land acquisition method rather than the default package', async () => {
    const { applyCertificateTemplate, buildCertificateTemplatePreview } = await import('../services/certificateTemplateService.js')
    state.executeSQLOne.mockResolvedValue({ id: 'project-1', metadata: {} })
    state.executeSQL.mockResolvedValue([])

    const preview = await buildCertificateTemplatePreview('project-1', { landAcquisitionMethodCode: 'allocation' })
    const selectedWorkItemCodes = preview.workItems
      .filter((item) => ['划拨决定', '建设项目用地预审与选址意见'].includes(item.itemName))
      .map((item) => item.workItemCode)

    const insertedWorkItemNames: string[] = []
    state.client.query.mockImplementation(async (...args: unknown[]) => {
      const sql = String(args[0] ?? '')
      const params = Array.isArray(args[1]) ? args[1] : []
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO "certificate_work_items"')) {
        insertedWorkItemNames.push(String(params[3]))
      }
      return { rows: [{ id: `row-${insertedWorkItemNames.length}` }], rowCount: 1 }
    })

    await applyCertificateTemplate('project-1', {
      templateCode: preview.templateCode,
      seedVersion: preview.seedVersion,
      selectedCertificateKeys: [],
      selectedWorkItemCodes,
      selectedDependencyCodes: [],
      duplicatePolicy: 'skip_existing',
      landAcquisitionMethodCode: 'allocation',
    })

    expect(insertedWorkItemNames).toEqual(
      expect.arrayContaining(['建设项目用地预审与选址意见']),
    )
    expect(insertedWorkItemNames).not.toContain('出让合同')
  })
})
