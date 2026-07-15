import { describe, expect, it } from 'vitest'

import { GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE } from '../seeds/certificateTemplateSeed.js'
import {
  buildCertificatePolicyUpdateGovernanceReport,
  buildCertificatePolicyUpdateCandidates,
  buildCertificatePolicyAutoPublishPlan,
  buildCertificatePolicyAutoPublishPlanWithSourceSnapshots,
  buildCertificatePolicyRuleDiffs,
  extractCertificatePolicySourceText,
  buildCertificatePolicySourceSnapshot,
  buildCertificatePolicySourceSnapshotHash,
  getLatestCertificatePolicyAutoPublishRun,
  mapCertificatePolicyAutoPublishRunToRecord,
  mapCertificatePolicyAutoPublishRunRecordToRun,
  parseCertificatePolicyStructuredFacts,
  publishCertificatePolicyAutoPublishPlan,
  publishCertificatePolicyAutoPublishPlanWithSourceSnapshots,
} from '../services/certificateTemplatePolicyUpdateService.js'

function buildTemplateWithMissingDefaultPolicySourceUrl() {
  const template = structuredClone(GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE)
  const defaultProfile = template.provinceProfiles.find((profile) => profile.provinceCode === 'default')
  if (!defaultProfile) throw new Error('default province profile not found')
  defaultProfile.policySources = defaultProfile.policySources.map((source, index) => {
    if (index !== 0) return source
    const { sourceUrl: _sourceUrl, ...sourceWithoutUrl } = source
    return sourceWithoutUrl
  })
  return template
}

describe('certificate template policy update governance', () => {
  it('creates auto-publish candidates for overdue published province and city policy assets', () => {
    const candidates = buildCertificatePolicyUpdateCandidates({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.map((candidate) => candidate.updateStatus)).toEqual(
      expect.arrayContaining(['auto_publish_candidate']),
    )
    expect(candidates.map((candidate) => candidate.assetCode)).toEqual(
      expect.arrayContaining([
        'province_profile:guangdong',
        'city_override:city_override_guangdong_shenzhen_v14222',
        'city_override:city_override_jiangsu_suzhou_v14222',
      ]),
    )
    expect(candidates.find((candidate) => candidate.assetCode === 'province_profile:guangdong')).toMatchObject({
      assetType: 'province_profile',
      provinceCode: 'guangdong',
      currentReviewStatus: 'published',
      nextReviewDueAt: '2026-08-27',
      reasonCode: 'review_due',
      runtimeConsumptionPolicy: 'auto_published_seed_after_job',
      proposedAction: 'auto_publish_when_trusted_sources_pass',
    })
    expect(JSON.stringify(candidates)).not.toContain('refresh_policy_sources_then_manual_publish')
  })

  it('flags published assets with weak or missing source urls without mutating runtime profiles', () => {
    const template = buildTemplateWithMissingDefaultPolicySourceUrl()
    const candidates = buildCertificatePolicyUpdateCandidates({
      template,
      asOfDate: '2026-06-01',
    })

    const weakSourceCandidate = candidates.find(
      (candidate) => candidate.assetCode === 'province_profile:default' && candidate.reasonCode === 'weak_source',
    )

    expect(weakSourceCandidate).toMatchObject({
      assetType: 'province_profile',
      provinceCode: 'default',
      currentReviewStatus: 'published',
      updateStatus: 'auto_publish_blocked',
      sourceHealth: 'missing_url',
      runtimeConsumptionPolicy: 'previous_published_seed_retained',
      proposedAction: 'block_auto_publish_and_retain_previous_seed',
    })
    expect(weakSourceCandidate?.sourceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issueCode: 'missing_source_url',
        }),
      ]),
    )
  })

  it('summarizes source health and exposes automatic publish decisions for business preview consumption', () => {
    const report = buildCertificatePolicyUpdateGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
    })

    expect(report.reportCode).toBe('certificate_template_policy_update_governance')
    expect(report.frontendExposurePolicy).toBe('backend_admin_api_only')
    expect(report.runtimePreviewPolicy).toBe('business_preview_consumes_runtime_projection_only')
    expect(report.summary.totalPublishedProvinceProfiles).toBeGreaterThanOrEqual(31)
    expect(report.summary.totalPublishedCityOverrides).toBe(50)
    expect(report.summary.autoPublishCandidateCount).toBe(report.candidates.length)
    expect(report.summary.autoPublishedUpdateCount).toBe(report.autoPublishPlan.summary.autoPublishedUpdateCount)
    expect(report.summary.blockedAutoPublishUpdateCount).toBe(report.autoPublishPlan.summary.blockedUpdateCount)
    expect(report.summary.overdueAssetCount).toBeGreaterThanOrEqual(3)
    expect(report.summary.weakSourceAssetCount).toBe(0)
    expect(report.sourceHealthCounts).toHaveProperty('healthy')
    expect(report.sourceHealthCounts.missing_url).toBe(0)
    expect(report.sourceHealthCounts.untrusted_url).toBe(0)
    expect(JSON.stringify(report.candidates)).not.toContain('candidate_only')
    expect(JSON.stringify(report.candidates)).not.toContain('refresh_policy_sources_then_manual_publish')

    const weakSourceReport = buildCertificatePolicyUpdateGovernanceReport({
      template: buildTemplateWithMissingDefaultPolicySourceUrl(),
      asOfDate: '2026-09-01',
    })
    expect(weakSourceReport.summary.weakSourceAssetCount).toBeGreaterThanOrEqual(1)
    expect(weakSourceReport.sourceHealthCounts.missing_url).toBeGreaterThanOrEqual(1)
  })

  it('builds an automatic publish plan for trusted source-backed policy updates', () => {
    const plan = buildCertificatePolicyAutoPublishPlan({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
    })

    expect(plan.planCode).toBe('certificate_template_policy_auto_publish_plan')
    expect(plan.updateMode).toBe('trusted_source_auto_publish')
    expect(plan.runtimePreviewPolicy).toBe('business_preview_consumes_runtime_projection_only')
    expect(plan.summary.autoPublishedUpdateCount).toBeGreaterThan(0)
    expect(plan.summary.blockedUpdateCount).toBe(0)
    expect(plan.summary.autoPublishedUpdateCount).toBe(plan.summary.candidateUpdateCount)
    expect(plan.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'auto_published',
          runtimeConsumptionPolicy: 'auto_published_seed',
          publicationGate: 'trusted_official_sources_only',
        }),
      ]),
    )
    expect(plan.autoPublishedUpdates.every((update) => update.sourceHealth === 'healthy')).toBe(true)
    expect(plan.blockedUpdates).toEqual([])

    const weakSourcePlan = buildCertificatePolicyAutoPublishPlan({
      template: buildTemplateWithMissingDefaultPolicySourceUrl(),
      asOfDate: '2026-09-01',
    })
    expect(weakSourcePlan.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:default',
          publishStatus: 'blocked',
          blockReason: 'missing_or_weak_policy_source',
        }),
      ]),
    )
  })

  it('parses trusted policy text into material authority procedure and deadline facts for low-risk rule diffs', () => {
    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可申请材料：施工许可申请表、质量安全监督登记表、农民工工资保证金承诺书。
      办理部门：住房和城乡建设主管部门、施工许可综合受理窗口。
      办理流程：受理、审查、核发。
      承诺时限：3个工作日。
    `)

    expect(facts.materialPackages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          materialNames: expect.arrayContaining(['农民工工资保证金承诺书']),
        }),
      ]),
    )
    expect(facts.authorityNames).toEqual(
      expect.arrayContaining(['住房和城乡建设主管部门', '施工许可综合受理窗口']),
    )
    expect(facts.procedureSteps).toEqual(expect.arrayContaining(['受理', '审查', '核发']))
    expect(facts.deadlineTexts).toEqual(expect.arrayContaining(['3个工作日']))

    const diffs = buildCertificatePolicyRuleDiffs({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      assetCode: 'province_profile:guangdong',
      facts,
    })

    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diffType: 'material_package_addition',
          risk: 'low',
          targetCode: 'PKG-CERT-CP-COMMON',
          addedValues: expect.arrayContaining(['农民工工资保证金承诺书']),
        }),
        expect.objectContaining({
          diffType: 'authority_alias_addition',
          risk: 'low',
          targetCode: 'approvalWindow',
          addedValues: expect.arrayContaining(['施工许可综合受理窗口']),
        }),
      ]),
    )
    expect(diffs.some((diff) => diff.risk === 'high')).toBe(false)
  })

  it('parses four-certificate policy text into package scoped materials roles and certificate outputs', () => {
    const facts = parseCertificatePolicyStructuredFacts(`
      土地权属办理申请材料：不动产权证书、土地出让合同。
      建设用地规划许可证申请材料：建设用地规划许可证申请表、规划条件通知书。
      建设工程规划许可证申请材料：建设工程规划许可证申请表、建设工程设计方案文本。
      施工许可证申请材料：建筑工程施工许可证申请表、农民工工资保证金承诺书。
      可容缺材料：施工合同备案表。
      可调用电子证照：营业执照、不动产权证书。
      前置成果：建设用地规划许可证、建设工程规划许可证。
      办理结果：建设工程施工许可证电子证照。
    `)

    expect(facts.materialPackages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          materialPackageCode: 'PKG-CERT-LAND-COMMON',
          materialNames: expect.arrayContaining(['不动产权证书', '土地出让合同']),
        }),
        expect.objectContaining({
          materialPackageCode: 'PKG-CERT-LUP-COMMON',
          materialNames: expect.arrayContaining(['建设用地规划许可证申请表', '规划条件通知书']),
        }),
        expect.objectContaining({
          materialPackageCode: 'PKG-CERT-EPP-COMMON',
          materialNames: expect.arrayContaining(['建设工程规划许可证申请表', '建设工程设计方案文本']),
        }),
        expect.objectContaining({
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          materialNames: expect.arrayContaining(['建筑工程施工许可证申请表', '农民工工资保证金承诺书']),
        }),
      ]),
    )
    expect(facts.materialItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          materialName: '施工合同备案表',
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          requirementRole: 'tolerance',
        }),
        expect.objectContaining({
          materialName: '营业执照',
          requirementRole: 'electronic_license',
        }),
        expect.objectContaining({
          materialName: '建设工程规划许可证',
          materialPackageCode: 'PKG-CERT-CP-COMMON',
          requirementRole: 'prerequisite_output',
        }),
      ]),
    )
    expect(facts.certificateOutputs).toEqual(expect.arrayContaining(['建设工程施工许可证电子证照']))
  })

  it('classifies material aliases replacements removals and certificate output changes with risk levels', () => {
    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可证申请材料：审图合格书。
      材料别名：审图合格书=审图合格证。
      不再提交质量安全监督手续，改为质量安全监督承诺书。
      取消提交现场开工条件。
      办理结果调整为施工许可证电子证照。
    `)

    const diffs = buildCertificatePolicyRuleDiffs({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      assetCode: 'province_profile:guangdong',
      facts,
    })

    expect(diffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          diffType: 'material_alias_addition',
          risk: 'low',
          targetCode: 'PKG-CERT-CP-COMMON',
          addedValues: expect.arrayContaining(['审图合格书']),
        }),
        expect.objectContaining({
          diffType: 'material_replacement',
          risk: 'high',
          targetCode: 'PKG-CERT-CP-COMMON',
          removedValues: expect.arrayContaining(['质量安全监督手续']),
          addedValues: expect.arrayContaining(['质量安全监督承诺书']),
        }),
        expect.objectContaining({
          diffType: 'material_removal',
          risk: 'high',
          removedValues: expect.arrayContaining(['现场开工条件']),
        }),
        expect.objectContaining({
          diffType: 'certificate_output_change',
          risk: 'high',
          addedValues: expect.arrayContaining(['施工许可证电子证照']),
        }),
      ]),
    )
  })

  it('auto-publishes structured low-risk material additions as a consumable rule overlay', async () => {
    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可申请材料：施工许可申请表、质量安全监督登记表、农民工工资保证金承诺书。
      办理部门：住房和城乡建设主管部门、施工许可综合受理窗口。
      办理流程：受理、审查、核发。
      承诺时限：3个工作日。
    `)

    const plan = await buildCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'new-low-risk-material-hash',
        previousContentHash: 'old-low-risk-material-hash',
        diffStatus: 'changed',
        changeSignals: ['material', 'authority', 'procedure', 'deadline'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
        structuredPolicyFacts: facts,
      }),
    })

    expect(plan.autoPublishedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'auto_published',
          policyRuleDiffs: expect.arrayContaining([
            expect.objectContaining({
              diffType: 'material_package_addition',
              risk: 'low',
              addedValues: expect.arrayContaining(['农民工工资保证金承诺书']),
            }),
          ]),
          publishedRuleOverlay: expect.objectContaining({
            materialPackageOverrides: expect.arrayContaining([
              expect.objectContaining({
                materialPackageCode: 'PKG-CERT-CP-COMMON',
                addMaterialNames: expect.arrayContaining(['农民工工资保证金承诺书']),
              }),
            ]),
          }),
        }),
      ]),
    )
    expect(plan.blockedUpdates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          blockReason: 'policy_content_material_affecting_change',
        }),
      ]),
    )
  })

  it('keeps procedure and deadline policy changes blocked even when structured facts are available', async () => {
    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可办理流程调整为审前公示、联合审查、核发。
      承诺时限由3个工作日调整为5个工作日。
    `)

    const plan = await buildCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'new-high-risk-procedure-hash',
        previousContentHash: 'old-high-risk-procedure-hash',
        diffStatus: 'changed',
        changeSignals: ['procedure', 'deadline'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
        structuredPolicyFacts: facts,
      }),
    })

    expect(plan.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'blocked',
          blockReason: 'policy_content_material_affecting_change',
          policyRuleDiffs: expect.arrayContaining([
            expect.objectContaining({
              diffType: 'procedure_change',
              risk: 'high',
            }),
            expect.objectContaining({
              diffType: 'deadline_change',
              risk: 'high',
            }),
          ]),
        }),
      ]),
    )
  })

  it('blocks auto-publication for structured material replacement and certificate output changes', async () => {
    const facts = parseCertificatePolicyStructuredFacts(`
      施工许可证申请材料：审图合格书。
      材料别名：审图合格书=审图合格证。
      不再提交质量安全监督手续，改为质量安全监督承诺书。
      办理结果调整为施工许可证电子证照。
    `)

    const plan = await buildCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'new-structured-high-risk-hash',
        previousContentHash: 'old-structured-high-risk-hash',
        diffStatus: 'changed',
        changeSignals: ['material', 'document'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
        structuredPolicyFacts: facts,
      }),
    })

    expect(plan.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          blockReason: 'policy_content_material_affecting_change',
          policyRuleDiffs: expect.arrayContaining([
            expect.objectContaining({
              diffType: 'material_replacement',
              risk: 'high',
            }),
            expect.objectContaining({
              diffType: 'certificate_output_change',
              risk: 'high',
            }),
          ]),
        }),
      ]),
    )
  })

  it('blocks automatic publication when trusted source content changes material or authority rules', async () => {
    const plan = await buildCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'new-material-hash',
        previousContentHash: 'old-material-hash',
        diffStatus: 'changed',
        changeSignals: ['material', 'authority'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
      }),
    })

    expect(plan.summary.autoPublishedUpdateCount).toBe(0)
    expect(plan.summary.blockedUpdateCount).toBe(plan.summary.candidateUpdateCount)
    expect(plan.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'blocked',
          blockReason: 'policy_content_material_affecting_change',
          runtimeConsumptionPolicy: 'previous_published_seed_retained',
          sourceSnapshots: expect.arrayContaining([
            expect.objectContaining({
              diffStatus: 'changed',
              changeRisk: 'material_affecting',
              autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
            }),
          ]),
        }),
      ]),
    )
  })

  it('keeps source-unavailable policy assets blocked without classifying them as material content changes', async () => {
    const plan = await buildCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'blocked',
        contentHash: null,
        previousContentHash: 'old-stable-hash',
        diffStatus: 'unknown',
        changeSignals: [],
        changeRisk: 'source_unavailable',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
      }),
    })

    expect(plan.summary.autoPublishedUpdateCount).toBe(0)
    expect(plan.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          publishStatus: 'blocked',
          blockReason: 'policy_source_unavailable',
          runtimeConsumptionPolicy: 'previous_published_seed_retained',
          sourceSnapshots: expect.arrayContaining([
            expect.objectContaining({
              fetchStatus: 'blocked',
              changeRisk: 'source_unavailable',
            }),
          ]),
        }),
      ]),
    )
  })

  it('captures trusted official source snapshots and classifies material-affecting content changes', async () => {
    const unchangedText = '广东省工程建设项目审批改革。办理窗口、申请材料、建设用地规划许可、施工许可资料清单保持一致。'
    const changedText = '广东省工程建设项目审批改革。新增施工许可申请材料：质量安全监督登记表，并调整自然资源主管部门窗口。'
    const oldHash = buildCertificatePolicySourceSnapshotHash(unchangedText)

    const unchangedSnapshot = await buildCertificatePolicySourceSnapshot({
      source: {
        sourceName: '广东省工程建设项目审批制度改革政策',
        sourceUrl: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/yfb/content/post_2194928.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      previousContentHash: oldHash,
      fetchText: async () => unchangedText,
    })

    expect(unchangedSnapshot).toMatchObject({
      sourceHealth: 'healthy',
      fetchStatus: 'fetched',
      diffStatus: 'unchanged',
      changeRisk: 'low',
      autoPublishDecision: 'auto_publish_allowed',
      contentHash: oldHash,
    })

    const changedSnapshot = await buildCertificatePolicySourceSnapshot({
      source: {
        sourceName: '广东省工程建设项目审批制度改革政策',
        sourceUrl: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/yfb/content/post_2194928.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      previousContentHash: oldHash,
      fetchText: async () => changedText,
    })

    expect(changedSnapshot).toMatchObject({
      sourceHealth: 'healthy',
      fetchStatus: 'fetched',
      diffStatus: 'changed',
      changeRisk: 'material_affecting',
      autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
    })
    expect(changedSnapshot.changeSignals).toEqual(expect.arrayContaining(['material', 'authority']))
  })

  it('extracts government HTML policy body before hashing and structured parsing', async () => {
    const html = `
      <html>
        <head><title>广东省工程建设项目审批制度改革政策</title><style>.nav{}</style></head>
        <body>
          <div class="nav">首页 政务公开 政策解读 相关推荐</div>
          <main class="article">
            <h1>广东省工程建设项目审批制度改革政策</h1>
            <p>粤建审〔2026〕1号</p>
            <p>为优化工程建设项目审批，施工许可证申请材料：施工许可申请表、质量安全监督登记表、工资保证金电子承诺书。</p>
            <p>办理部门：住房和城乡建设主管部门。办理流程：受理、审查、核发。承诺时限：3个工作日。</p>
            <p>附件：施工许可证申请材料清单.docx</p>
          </main>
          <footer>网站地图 联系我们 版权声明</footer>
          <script>window.__noise = true</script>
        </body>
      </html>
    `

    const extracted = extractCertificatePolicySourceText(html)

    expect(extracted).toMatchObject({
      accepted: true,
      format: 'html',
      confidence: 'high',
    })
    expect(extracted.text).toContain('广东省工程建设项目审批制度改革政策')
    expect(extracted.text).toContain('工资保证金电子承诺书')
    expect(extracted.text).toContain('附件：施工许可证申请材料清单.docx')
    expect(extracted.text).not.toContain('window.__noise')
    expect(extracted.text).not.toContain('首页 政务公开')

    const snapshot = await buildCertificatePolicySourceSnapshot({
      source: {
        sourceName: '广东省工程建设项目审批制度改革政策',
        sourceUrl: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/yfb/content/post_2194928.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      previousContentHash: buildCertificatePolicySourceSnapshotHash('old policy body'),
      fetchText: async () => html,
    })

    expect(snapshot).toMatchObject({
      fetchStatus: 'fetched',
      changeRisk: 'material_affecting',
      autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
      structuredPolicyFacts: expect.objectContaining({
        materialPackages: expect.arrayContaining([
          expect.objectContaining({
            materialPackageCode: 'PKG-CERT-CP-COMMON',
            materialNames: expect.arrayContaining(['工资保证金电子承诺书']),
          }),
        ]),
      }),
    })
    expect(snapshot.contentHash).toBe(buildCertificatePolicySourceSnapshotHash(extracted.text))
  })

  it('blocks trusted source snapshots when fetched pages do not contain a policy body', async () => {
    const portalHtml = `
      <html>
        <body>
          <header>广东省政务服务网</header>
          <nav>首页 办事服务 政民互动 数据开放</nav>
          <section>
            <a href="/search">政策搜索</a>
            <a href="/service">工程建设项目审批入口</a>
          </section>
          <footer>网站地图 联系我们</footer>
        </body>
      </html>
    `

    const extracted = extractCertificatePolicySourceText(portalHtml)
    expect(extracted).toMatchObject({
      accepted: false,
      blockReason: 'policy_body_too_short',
      confidence: 'low',
    })

    const snapshot = await buildCertificatePolicySourceSnapshot({
      source: {
        sourceName: '广东省工程建设项目审批制度改革政策',
        sourceUrl: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/yfb/content/post_2194928.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      previousContentHash: 'previous-trusted-content-hash',
      fetchText: async () => portalHtml,
    })

    expect(snapshot).toMatchObject({
      fetchStatus: 'blocked',
      contentHash: null,
      diffStatus: 'unknown',
      changeRisk: 'source_unavailable',
      autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
      extractionStatus: 'blocked',
      extractionBlockReason: 'policy_body_too_short',
    })
  })

  it('blocks automatic publication when a trusted official source cannot be fetched', async () => {
    const snapshot = await buildCertificatePolicySourceSnapshot({
      source: {
        sourceName: '广东省工程建设项目审批制度改革政策',
        sourceUrl: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/yfb/content/post_2194928.html',
        checkedAt: '2026-05-30',
        updateMode: 'governed_seed_update',
        policyLevel: 'province',
      },
      previousContentHash: 'previous-trusted-content-hash',
      fetchText: async () => {
        throw new Error('network unavailable')
      },
    })

    expect(snapshot).toMatchObject({
      sourceHealth: 'healthy',
      fetchStatus: 'blocked',
      contentHash: null,
      previousContentHash: 'previous-trusted-content-hash',
      diffStatus: 'unknown',
      changeRisk: 'source_unavailable',
      autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
    })
  })

  it('publishes trusted-source policy updates as a backend auto-published seed run', () => {
    const run = publishCertificatePolicyAutoPublishPlan({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
    })

    expect(run).toMatchObject({
      runCode: 'certificate_template_policy_auto_publish_run',
      publicationStatus: 'published',
      updateMode: 'trusted_source_auto_publish',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(run.appliedAutoPublishedSeedCount).toBe(run.summary.autoPublishedUpdateCount)
    expect(run.retainedPreviousPublishedSeedCount).toBe(run.summary.blockedUpdateCount)
    expect(run.autoPublishedUpdates.every((update) => update.runtimeConsumptionPolicy === 'auto_published_seed')).toBe(true)
    expect(run.blockedUpdates.every((update) => update.runtimeConsumptionPolicy === 'previous_published_seed_retained')).toBe(true)
    expect(getLatestCertificatePolicyAutoPublishRun()).toMatchObject({
      runId: run.runId,
      publicationStatus: 'published',
    })
  })

  it('publishes snapshot-aware trusted-source policy runs and retains blocked material-affecting assets', async () => {
    const run = await publishCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl ?? '',
        policyLevel: source.policyLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'new-material-hash',
        previousContentHash: 'old-material-hash',
        diffStatus: 'changed',
        changeSignals: ['material', 'authority'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
      }),
    })

    expect(run).toMatchObject({
      runCode: 'certificate_template_policy_auto_publish_run',
      publicationStatus: 'published',
      updateMode: 'trusted_source_auto_publish',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(run.summary.autoPublishedUpdateCount).toBe(0)
    expect(run.summary.blockedUpdateCount).toBe(run.summary.candidateUpdateCount)
    expect(run.appliedAutoPublishedSeedCount).toBe(0)
    expect(run.retainedPreviousPublishedSeedCount).toBe(run.summary.blockedUpdateCount)
    expect(run.blockedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetCode: 'province_profile:guangdong',
          blockReason: 'policy_content_material_affecting_change',
          runtimeConsumptionPolicy: 'previous_published_seed_retained',
          sourceSnapshots: expect.arrayContaining([
            expect.objectContaining({
              diffStatus: 'changed',
              changeRisk: 'material_affecting',
            }),
          ]),
        }),
      ]),
    )
    expect(getLatestCertificatePolicyAutoPublishRun()).toMatchObject({
      runId: run.runId,
      summary: run.summary,
    })
  })

  it('maps auto-published policy runs to a durable audit record for latest published consumption', () => {
    const run = publishCertificatePolicyAutoPublishPlan({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
    })

    const record = mapCertificatePolicyAutoPublishRunToRecord(run)

    expect(record).toMatchObject({
      run_id: run.runId,
      run_code: 'certificate_template_policy_auto_publish_run',
      seed_version: run.seedVersion,
      as_of_date: '2026-09-01',
      publication_status: 'published',
      update_mode: 'trusted_source_auto_publish',
      runtime_preview_policy: 'business_preview_consumes_runtime_projection_only',
      publication_gate: 'trusted_official_sources_only',
      rollback_policy: 'previous_seed_version_retained_for_rollback',
      applied_auto_published_seed_count: run.summary.autoPublishedUpdateCount,
      retained_previous_published_seed_count: run.summary.blockedUpdateCount,
    })
    expect(record.summary).toEqual(run.summary)
    expect(record.auto_published_updates).toEqual(run.autoPublishedUpdates)
    expect(record.blocked_updates).toEqual(run.blockedUpdates)
    expect(record.record_visibility_policy).toBe('backend_admin_audit_only')

    expect(mapCertificatePolicyAutoPublishRunRecordToRun(record)).toMatchObject({
      runId: run.runId,
      runCode: 'certificate_template_policy_auto_publish_run',
      publicationStatus: 'published',
      seedVersion: run.seedVersion,
      asOfDate: '2026-09-01',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
      summary: run.summary,
    })
  })
})
