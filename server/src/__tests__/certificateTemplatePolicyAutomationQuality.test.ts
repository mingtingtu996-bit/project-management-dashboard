import { describe, expect, it } from 'vitest'

import { GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE } from '../seeds/certificateTemplateSeed.js'
import {
  buildCertificatePolicyUpdateGovernanceReport,
  parseCertificatePolicyStructuredFacts,
  publishCertificatePolicyAutoPublishPlanWithSourceSnapshots,
} from '../services/certificateTemplatePolicyUpdateService.js'

describe('certificate template policy automation quality', () => {
  it('summarizes official source coverage and project replay calibration for automatic seed iteration', () => {
    const report = buildCertificatePolicyUpdateGovernanceReport({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      replaySamples: [
        {
          projectId: 'project-shenzhen-1',
          provinceCode: 'guangdong',
          cityCode: 'shenzhen',
          certificateType: 'construction_permit',
          expectedMaterialNames: ['建筑工程施工许可证申请表', '施工图审查合格书'],
          actualMaterialNames: ['建筑工程施工许可证申请表', '施工图审查合格书'],
          expectedAuthority: '深圳市住房城乡建设主管部门',
          actualAuthority: '深圳市住房城乡建设主管部门',
          expectedReusableOutputNames: ['建设工程规划许可证', '施工图审查合格书'],
          actualReusableOutputNames: ['建设工程规划许可证', '施工图审查合格书'],
        },
        {
          projectId: 'project-hangzhou-1',
          provinceCode: 'zhejiang',
          cityCode: 'hangzhou',
          certificateType: 'land_use_planning_permit',
          expectedMaterialNames: ['建设用地规划许可证申请表', '土地出让合同'],
          actualMaterialNames: ['建设用地规划许可证申请表'],
          expectedAuthority: '杭州市自然资源和规划主管部门',
          actualAuthority: '杭州市规划和自然资源窗口',
          expectedReusableOutputNames: ['土地出让合同', '用地红线图'],
          actualReusableOutputNames: ['土地出让合同'],
        },
      ],
    })

    expect(report.automationQuality.sourceCoverage).toMatchObject({
      totalPublishedAssetCount:
        report.summary.totalPublishedProvinceProfiles + report.summary.totalPublishedCityOverrides,
      trustedOfficialSourceAssetCount: expect.any(Number),
      missingOrWeakSourceAssetCount: expect.any(Number),
      coverageStatus: 'ready',
    })
    expect(report.automationQuality.sourceCoverage.coverageRate).toBeGreaterThanOrEqual(0.95)
    expect(report.automationQuality.policyParseHitRate.status).toBe('not_evaluated')
    expect(report.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 2,
      calibratedSampleCount: 2,
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
      status: expect.stringMatching(/candidate_overlay_ready|needs_more_samples|needs_human_review/),
    })
    expect(report.automationQuality.projectReplayCalibration.materialMatchRate).toBeGreaterThan(0)
  })

  it('attaches parse hit rate and replay calibration summaries to snapshot-aware auto-publish runs', async () => {
    const run = await publishCertificatePolicyAutoPublishPlanWithSourceSnapshots({
      template: GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
      asOfDate: '2026-09-01',
      replaySamples: [
        {
          projectId: 'project-shenzhen-1',
          provinceCode: 'guangdong',
          cityCode: 'shenzhen',
          certificateType: 'construction_permit',
          expectedMaterialNames: ['建筑工程施工许可证申请表', '施工图审查合格书'],
          actualMaterialNames: ['建筑工程施工许可证申请表', '施工图审查合格书'],
          expectedAuthority: '深圳市住房城乡建设主管部门',
          actualAuthority: '深圳市住房城乡建设主管部门',
          expectedReusableOutputNames: ['建设工程规划许可证', '施工图审查合格书'],
          actualReusableOutputNames: ['建设工程规划许可证', '施工图审查合格书'],
        },
      ],
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
        structuredPolicyFacts: parseCertificatePolicyStructuredFacts(`
          施工许可证申请材料：建筑工程施工许可证申请表、施工图审查合格书。
          办理部门：住房和城乡建设主管部门、施工许可综合受理窗口。
          办理流程：受理、审查、核发。
          承诺时限：3个工作日。
          办理结果：建筑工程施工许可证电子证照。
        `),
      }),
    })

    expect(run.automationQuality.policyParseHitRate).toMatchObject({
      evaluatedSnapshotCount: expect.any(Number),
      materialHitCount: expect.any(Number),
      authorityHitCount: expect.any(Number),
      procedureHitCount: expect.any(Number),
      deadlineHitCount: expect.any(Number),
      certificateOutputHitCount: expect.any(Number),
      status: 'ready_for_rule_diff',
    })
    expect(run.automationQuality.policyParseHitRate.averageHitRate).toBeGreaterThanOrEqual(0.8)
    expect(run.automationQuality.projectReplayCalibration).toMatchObject({
      sampleCount: 1,
      calibratedSampleCount: 1,
      materialMatchRate: 1,
      authorityMatchRate: 1,
      predecessorReuseMatchRate: 1,
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    })
  })
})
