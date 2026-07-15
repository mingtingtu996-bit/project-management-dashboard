import { describe, expect, it } from 'vitest'

import { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } from '../seeds/acceptanceTimelineTemplateSeed.js'
import {
  buildAcceptancePolicySourceSnapshot,
  buildAcceptancePolicyUpdateGovernanceReport,
  parseAcceptancePolicyStructuredFacts,
  publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots,
} from '../services/acceptanceTemplatePolicyUpdateService.js'

describe('acceptance template policy automation quality', () => {
  it('parses real Chinese official policy text into structured acceptance facts', () => {
    const facts = parseAcceptancePolicyStructuredFacts(
      '建设项目联合验收事项：综合验收、消防验收、档案验收。条件事项：环卫设施验收、水土保持设施验收。综合验收办理结果：联合验收意见书。办理部门：工程建设项目联合验收牵头部门。办理流程：网上申报、并联核验、出具联合验收意见。',
    )

    expect(facts.acceptanceItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'comprehensive_acceptance',
      'fire_acceptance',
      'archive_acceptance',
    ]))
    expect(facts.conditionItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'sanitation_facility_acceptance',
      'water_conservation_acceptance',
    ]))
    expect(facts.resultDocuments.map((document) => document.documentName)).toContain('联合验收意见书')
    expect(facts.authorityNames).toContain('工程建设项目联合验收牵头部门')
    expect(facts.handlingModes).toEqual(expect.arrayContaining(['网上申报', '并联核验', '出具联合验收意见']))
  })

  it('accepts real Chinese gov.cn policy bodies before automatic publication', async () => {
    const snapshot = await buildAcceptancePolicySourceSnapshot({
      source: {
        sourceName: '北京市工程建设项目联合验收政策',
        sourceUrl: 'https://zjw.beijing.gov.cn/bjjs/zwgk/zcwj/acceptance.html',
        sourceLevel: 'city',
        checkedAt: '2026-09-01',
        notes: [],
      },
      previousContentHash: 'previous-real-chinese-policy-hash',
      fetchText: async () => `
        <html>
          <main>
            <p>建设项目联合验收事项：综合验收、消防验收、档案验收。</p>
            <p>条件事项：环卫设施验收、水土保持设施验收。</p>
            <p>综合验收办理结果：联合验收意见书。</p>
            <p>办理部门：工程建设项目联合验收牵头部门。</p>
            <p>办理流程：网上申报、并联核验、出具联合验收意见。</p>
          </main>
        </html>
      `,
    })

    expect(snapshot.fetchStatus).toBe('fetched')
    expect(snapshot.extractionStatus).toBe('accepted')
    expect(snapshot.changeSignals).toEqual(expect.arrayContaining(['item', 'condition', 'authority', 'procedure', 'document']))
    expect(snapshot.structuredPolicyFacts?.acceptanceItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'comprehensive_acceptance',
      'fire_acceptance',
      'archive_acceptance',
    ]))
    expect(snapshot.structuredPolicyFacts?.conditionItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'sanitation_facility_acceptance',
      'water_conservation_acceptance',
    ]))
    expect(snapshot.structuredPolicyFacts?.resultDocuments.map((document) => document.documentName)).toContain('联合验收意见书')
  })

  it('parses one-paragraph official policy text into structured acceptance facts', () => {
    const facts = parseAcceptancePolicyStructuredFacts(
      '建设项目联合验收事项：综合验收、消防验收、档案验收。条件事项：环卫设施验收、水土保持设施验收。综合验收办理结果：联合验收意见书。办理部门：工程建设项目联合验收牵头部门。办理流程：网上申报、并联核验、出具联合验收意见。',
    )

    expect(facts.acceptanceItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'comprehensive_acceptance',
      'fire_acceptance',
      'archive_acceptance',
    ]))
    expect(facts.conditionItems.map((item) => item.itemCode)).toEqual(expect.arrayContaining([
      'sanitation_facility_acceptance',
      'water_conservation_acceptance',
    ]))
    expect(facts.resultDocuments.map((document) => document.documentName)).toContain('联合验收意见书')
    expect(facts.authorityNames).toContain('工程建设项目联合验收牵头部门')
    expect(facts.handlingModes).toEqual(expect.arrayContaining(['网上申报', '并联核验', '出具联合验收意见']))
  })

  it('summarizes official source coverage and real-project replay calibration for automatic seed iteration', () => {
    const report = buildAcceptancePolicyUpdateGovernanceReport({
      template: ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
      asOfDate: '2026-09-01',
      replaySamples: [
        {
          projectId: 'project-beijing-1',
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
          projectId: 'project-shandong-1',
          provinceCode: 'SD',
          itemCode: 'heat_supply_acceptance',
          expectedItemNames: ['供热验收'],
          actualItemNames: ['供热验收'],
          expectedResultDocumentNames: ['供热验收意见'],
          actualResultDocumentNames: ['供热验收意见'],
          expectedAuthority: '供热主管部门或供热企业',
          actualAuthority: '供热主管部门或供热企业',
        },
        {
          projectId: 'project-guangdong-1',
          provinceCode: 'GD',
          itemCode: 'sanitation_facility_acceptance',
          expectedItemNames: ['环卫设施验收'],
          actualItemNames: ['环卫设施验收'],
          expectedResultDocumentNames: ['环卫设施验收意见'],
          actualResultDocumentNames: ['环卫设施验收意见'],
          expectedAuthority: '城市管理或环卫主管部门',
          actualAuthority: '城市管理或环卫主管部门',
        },
      ],
    })

    expect(report).toMatchObject({
      reportCode: 'acceptance_template_policy_update_governance',
      frontendExposurePolicy: 'backend_admin_api_only',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    })
    expect(report.summary).toMatchObject({
      totalPublishedRegionProfiles: expect.any(Number),
      totalPublishedProvinceSharedProfiles: 31,
      totalPublishedCityProfiles: expect.any(Number),
      weakSourceAssetCount: 0,
    })
    expect(report.summary.totalPublishedCityProfiles).toBeGreaterThanOrEqual(15)
    expect(report.automationQuality.sourceCoverage).toMatchObject({
      missingOrWeakSourceAssetCount: 0,
      coverageStatus: 'ready',
    })
    expect(report.automationQuality.sourceCoverage.coverageRate).toBe(1)
    expect(report.automationQuality.policyParseHitRate.status).toBe('not_evaluated')
    expect(report.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 3,
      calibratedSampleCount: 3,
      itemMatchRate: 1,
      resultDocumentMatchRate: 1,
      authorityMatchRate: 1,
      status: 'candidate_overlay_ready',
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    })
    expect(report.automationQuality.officialPublicReplayCoverage).toMatchObject({
      seedScope: expect.objectContaining({
        provinceCount: expect.any(Number),
        cityProfileCount: expect.any(Number),
        businessProfileCodes: expect.arrayContaining(['industrial', 'hotel', 'modular_building']),
      }),
      serviceProfileSourceCoverage: expect.objectContaining({
        missingRegionProfileKeys: [],
      }),
      namedPublicProjectCoverage: expect.objectContaining({
        sampleCount: expect.any(Number),
      }),
      publicEvidenceCoverage: expect.objectContaining({
        missingBusinessTypeCodes: [],
      }),
      calibrationPolicy: 'official_service_profile_for_all_regions_named_public_project_replay_expands_by_queue',
    })
    expect(report.automationQuality.officialPublicReplayCoverage.seedScope.provinceCount).toBeGreaterThanOrEqual(31)
    expect(report.automationQuality.officialPublicReplayCoverage.seedScope.cityProfileCount).toBeGreaterThanOrEqual(50)
    expect(report.automationQuality.officialPublicReplayCoverage.namedPublicProjectCoverage.sampleCount).toBeGreaterThan(0)
    expect(report.automationQuality.officialPublicReplayCoverage.namedPublicProjectCoverage.coveredCityProfileCount).toBeGreaterThanOrEqual(
      report.automationQuality.officialPublicReplayCoverage.seedScope.cityProfileCount,
    )
    expect(report.automationQuality.officialPublicReplayCoverage.calibrationQueues.cityProfilesNeedingNamedPublicProjectSamples).toEqual([])
    expect(report.automationQuality.goldenReplayBaseline).toMatchObject({
      status: 'baseline_ready',
      baselinePolicy: 'cold_start_regression_only_not_real_project_calibration',
    })
  })

  it('attaches parser hit rate and replay calibration summaries to snapshot-aware auto-publish runs', async () => {
    const run = await publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots({
      template: ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
      asOfDate: '2026-09-01',
      replaySamples: [
        {
          projectId: 'project-beijing-1',
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
      ],
      sourceSnapshotProvider: async (source) => ({
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        sourceLevel: source.sourceLevel,
        checkedAt: source.checkedAt,
        sourceHealth: 'healthy',
        fetchStatus: 'fetched',
        contentHash: 'acceptance-policy-material-hash',
        previousContentHash: 'acceptance-policy-old-hash',
        diffStatus: 'changed',
        changeSignals: ['item', 'condition', 'authority', 'procedure', 'document'],
        changeRisk: 'material_affecting',
        autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
        structuredPolicyFacts: parseAcceptancePolicyStructuredFacts(`
          建设项目联合验收事项：综合验收、消防验收、档案验收。
          条件事项：环卫设施验收、水土保持设施验收。
          综合验收办理结果：联合验收意见书。
          办理部门：工程建设项目联合验收牵头部门。
          办理流程：网上申报、并联核验、出具联合验收意见。
        `),
      }),
    })

    expect(run.automationQuality.policyParseHitRate).toMatchObject({
      evaluatedSnapshotCount: expect.any(Number),
      itemHitCount: expect.any(Number),
      conditionHitCount: expect.any(Number),
      authorityHitCount: expect.any(Number),
      handlingModeHitCount: expect.any(Number),
      resultDocumentHitCount: expect.any(Number),
      status: 'ready_for_rule_diff',
    })
    expect(run.automationQuality.policyParseHitRate.averageHitRate).toBeGreaterThanOrEqual(0.8)
    expect(run.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 1,
      calibratedSampleCount: 1,
      itemMatchRate: 1,
      resultDocumentMatchRate: 1,
      authorityMatchRate: 1,
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    })
    expect(run.automationQuality.goldenReplayBaseline.status).toBe('baseline_ready')
  })
})
