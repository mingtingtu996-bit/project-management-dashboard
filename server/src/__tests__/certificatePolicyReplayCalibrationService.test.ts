import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES,
  buildOfficialPublicCertificateReplayCoverageReport,
  collectCertificatePolicyReplayCalibrationSamples,
  collectOfficialPublicCertificateReplayCalibrationSamples,
} from '../services/certificatePolicyReplayCalibrationService.js'
import { buildCertificatePolicyUpdateGovernanceReport } from '../services/certificateTemplatePolicyUpdateService.js'

const serviceSourcePath = fileURLToPath(new URL('../services/certificatePolicyReplayCalibrationService.ts', import.meta.url))

describe('certificate policy replay calibration service', () => {
  it('fails closed for default cross-project reads without system-job capability', async () => {
    await expect(collectCertificatePolicyReplayCalibrationSamples({
      includeOfficialPublicSamples: false,
    })).rejects.toThrow('certificate policy replay requires systemJob capability')
  })

  it('keeps production replay sampling on approved fixed SQL branches', () => {
    const source = readFileSync(serviceSourcePath, 'utf8')

    expect(source).not.toContain('rawQuery(sql')
    expect(source).toContain('unapproved_certificate_policy_replay_calibration_sql')
    expect(source).toContain('FROM pre_milestones')
    expect(source).toContain('FROM certificate_work_items')
    expect(source).toContain('FROM certificate_dependencies')
  })

  it('reports official public replay coverage separately from city service entry coverage', () => {
    const report = buildOfficialPublicCertificateReplayCoverageReport()

    expect(report.seedScope.provinceProfileCount).toBeGreaterThanOrEqual(31)
    expect(report.seedScope.cityProfileCount).toBeGreaterThanOrEqual(50)
    expect(report.seedScope.certificateTypes).toEqual([
      'land_certificate',
      'land_use_planning_permit',
      'engineering_planning_permit',
      'construction_permit',
    ])
    expect(report.publicEvidenceCoverage.sampleCount).toBeGreaterThanOrEqual(46)
    expect(report.publicEvidenceCoverage.missingCertificateTypes).toEqual([])
    expect(report.publicEvidenceCoverage.weakOfficialSourceSamples).toEqual([])
    expect(report.namedPublicCertificateCoverage.sampleCount).toBeGreaterThanOrEqual(32)
    expect(report.namedPublicCertificateCoverage.coveredCityProfileCount).toBeGreaterThanOrEqual(27)
    expect(report.namedPublicCertificateCoverage.missingCertificateTypes).toEqual([])
    expect(report.namedPublicCertificateCoverage.structuredEvidenceFieldCoverage.documentNumberSampleCount).toBeGreaterThanOrEqual(32)
    expect(report.namedPublicCertificateCoverage.structuredEvidenceFieldCoverage.issuedAtSampleCount).toBeGreaterThanOrEqual(31)
    expect(report.namedPublicCertificateCoverage.structuredEvidenceFieldCoverage.missingDocumentNumberSampleKeys).not.toEqual(expect.arrayContaining([
      'shenzhen-baoan-a325-0235-land-use-planning-permit-202604',
      'shenzhen-luohu-shaohua-building-engineering-planning-202412',
      'hangzhou-xiaoshan-2025-29-land-use-planning-202504',
      'hangzhou-xiaoshan-jingshiwei-engineering-planning-202505',
      'hefei-yaohai-yh202213-rental-housing-construction-permit-202506',
      'guangzhou-kemulang-urban-village-land-use-planning-202505',
      'guangzhou-haizhu-fangzhi-road-elevator-engineering-planning-202506',
      'wuxi-xishan-land-supply-result-202509',
      'shenzhen-guangming-sterilization-base-road-construction-permit-202606',
      'fuzhou-sanyuan-road-land-use-planning-202505',
      'zhengzhou-gaoxin-yinping-road-engineering-planning-202511',
      'suzhou-sip-cssd-standard-factory-engineering-planning-202501',
      'xiamen-new-airport-work-area-engineering-planning-202603',
      'shenyang-feiyan-aviation-equipment-engineering-planning-202506',
      'quanzhou-jinjiang-waterway-hot-spring-hotel-construction-permit-202602',
      'nanchang-nanchangcounty-xindian-assembly-decoration-construction-permit-202601',
      'qingdao-westcoast-three-gorges-land-use-planning-202602',
      'ningbo-fenghua-yunke-pneumatic-components-construction-permit-202503',
      'tianjin-hedong-xinkailu-engineering-planning-202503',
      'dalian-wafangdian-wuzhou-heavy-machinery-engineering-planning-202603',
      'shijiazhuang-cangning-road-construction-permit-202501',
      'nantong-rail-transit-taiping-road-north-station-exit-construction-permit-202412',
      'jiaxing-nanhu-meiyingde-smart-transmission-engineering-planning-202006',
      'xian-jingkai-zhongbing-logistics-engineering-planning-202604',
      'beijing-apple-garden-station-renovation-construction-permit-202602',
      'chongqing-tongnan-taisheng-paper-construction-permit-202501',
      'wenzhou-cangnan-yingkeer-ink-construction-permit-202501',
      'changsha-wangcheng-dazehu-geothermal-c-station-land-use-planning-202312',
      'foshan-sanshui-leping-sewage-engineering-planning-202107',
      'dongguan-humen-fushigao-land-use-and-engineering-planning-202403',
      'wuhan-jiangxia-zhongjian-tangxunhu-land-use-planning-202504',
      'wuhan-caidian-huacai-optoelectronics-engineering-planning-202504',
    ]))
    expect(report.namedPublicCertificateCoverage.structuredEvidenceFieldCoverage.missingIssuedAtSampleKeys).not.toEqual(expect.arrayContaining([
      'shenzhen-baoan-a325-0235-land-use-planning-permit-202604',
      'shenzhen-luohu-shaohua-building-engineering-planning-202412',
      'hangzhou-xiaoshan-2025-29-land-use-planning-202504',
      'hangzhou-xiaoshan-jingshiwei-engineering-planning-202505',
      'hefei-yaohai-yh202213-rental-housing-construction-permit-202506',
      'guangzhou-kemulang-urban-village-land-use-planning-202505',
      'guangzhou-haizhu-fangzhi-road-elevator-engineering-planning-202506',
      'wuxi-xishan-land-supply-result-202509',
      'shenzhen-guangming-sterilization-base-road-construction-permit-202606',
      'fuzhou-sanyuan-road-land-use-planning-202505',
      'zhengzhou-gaoxin-yinping-road-engineering-planning-202511',
      'suzhou-sip-cssd-standard-factory-engineering-planning-202501',
      'xiamen-new-airport-work-area-engineering-planning-202603',
      'shenyang-feiyan-aviation-equipment-engineering-planning-202506',
      'quanzhou-jinjiang-waterway-hot-spring-hotel-construction-permit-202602',
      'qingdao-westcoast-three-gorges-land-use-planning-202602',
      'ningbo-fenghua-yunke-pneumatic-components-construction-permit-202503',
      'tianjin-hedong-xinkailu-engineering-planning-202503',
      'dalian-wafangdian-wuzhou-heavy-machinery-engineering-planning-202603',
      'shijiazhuang-cangning-road-construction-permit-202501',
      'nantong-rail-transit-taiping-road-north-station-exit-construction-permit-202412',
      'jiaxing-nanhu-meiyingde-smart-transmission-engineering-planning-202006',
      'xian-jingkai-zhongbing-logistics-engineering-planning-202604',
      'beijing-apple-garden-station-renovation-construction-permit-202602',
      'chongqing-tongnan-taisheng-paper-construction-permit-202501',
      'wenzhou-cangnan-yingkeer-ink-construction-permit-202501',
      'changsha-wangcheng-dazehu-geothermal-c-station-land-use-planning-202312',
      'foshan-sanshui-leping-sewage-engineering-planning-202107',
      'dongguan-humen-fushigao-land-use-and-engineering-planning-202403',
      'wuhan-jiangxia-zhongjian-tangxunhu-land-use-planning-202504',
      'wuhan-caidian-huacai-optoelectronics-engineering-planning-202504',
    ]))
    expect(report.officialCityEntryCoverage.sampleCount).toBeGreaterThanOrEqual(10)
    expect(report.officialCityEntryCoverage.coveredCityProfileCount).toBeGreaterThanOrEqual(10)
    expect(report.calibrationQueues.cityProfilesNeedingNamedPublicSamples.length).toBeGreaterThan(0)
    expect(report.calibrationQueues.cityProfilesNeedingNamedPublicSamples).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ provinceCode: 'zhejiang', cityCode: 'hangzhou' }),
      expect.objectContaining({ provinceCode: 'anhui', cityCode: 'hefei' }),
      expect.objectContaining({ provinceCode: 'hubei', cityCode: 'wuhan' }),
      expect.objectContaining({ provinceCode: 'chongqing', cityCode: 'chongqing' }),
      expect.objectContaining({ provinceCode: 'fujian', cityCode: 'fuzhou' }),
      expect.objectContaining({ provinceCode: 'henan', cityCode: 'zhengzhou' }),
      expect.objectContaining({ provinceCode: 'jiangsu', cityCode: 'suzhou' }),
      expect.objectContaining({ provinceCode: 'tianjin', cityCode: 'tianjin' }),
      expect.objectContaining({ provinceCode: 'fujian', cityCode: 'xiamen' }),
      expect.objectContaining({ provinceCode: 'liaoning', cityCode: 'shenyang' }),
      expect.objectContaining({ provinceCode: 'fujian', cityCode: 'quanzhou' }),
      expect.objectContaining({ provinceCode: 'jiangxi', cityCode: 'nanchang' }),
      expect.objectContaining({ provinceCode: 'shandong', cityCode: 'qingdao' }),
      expect.objectContaining({ provinceCode: 'zhejiang', cityCode: 'ningbo' }),
      expect.objectContaining({ provinceCode: 'guangdong', cityCode: 'foshan' }),
      expect.objectContaining({ provinceCode: 'guangdong', cityCode: 'dongguan' }),
      expect.objectContaining({ provinceCode: 'hunan', cityCode: 'changsha' }),
      expect.objectContaining({ provinceCode: 'zhejiang', cityCode: 'wenzhou' }),
      expect.objectContaining({ provinceCode: 'liaoning', cityCode: 'dalian' }),
      expect.objectContaining({ provinceCode: 'hebei', cityCode: 'shijiazhuang' }),
      expect.objectContaining({ provinceCode: 'jiangsu', cityCode: 'nantong' }),
      expect.objectContaining({ provinceCode: 'zhejiang', cityCode: 'jiaxing' }),
      expect.objectContaining({ provinceCode: 'shaanxi', cityCode: 'xian' }),
      expect.objectContaining({ provinceCode: 'beijing', cityCode: 'beijing' }),
    ]))
    expect(report.calibrationPolicy).toBe(
      'official_certificate_replay_uses_verified_named_records_and_city_entry_anchors_then_expands_by_city_queue',
    )
  })

  it('converts official public certificate records into replay calibration samples across all four certificates', () => {
    const samples = collectOfficialPublicCertificateReplayCalibrationSamples({
      maxSamples: OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.length,
    })
    const certificateTypes = new Set(samples.map((sample) => sample.certificateType))
    const namedSamples = samples.filter((sample) => sample.sampleGranularity === 'named_public_certificate_record')
    const cities = new Set(samples.map((sample) => `${sample.provinceCode}:${sample.cityCode}`))
    const namedSourceUrls = namedSamples.map((sample) => sample.sourceUrl ?? '')

    expect(samples.length).toBeGreaterThanOrEqual(46)
    expect(certificateTypes).toEqual(new Set([
      'construction_permit',
      'engineering_planning_permit',
      'land_certificate',
      'land_use_planning_permit',
    ]))
    expect(namedSamples.length).toBeGreaterThanOrEqual(32)
    expect(cities.size).toBeGreaterThanOrEqual(10)
    expect(namedSourceUrls).not.toEqual(expect.arrayContaining([
      expect.stringContaining('post_11492670'),
      expect.stringContaining('post_12197215'),
      expect.stringContaining('pageId=308452'),
      expect.stringContaining('post_10594845'),
      expect.stringContaining('post_10525278'),
      expect.stringContaining('doc/2025/05/15/4529061'),
      expect.stringContaining('doc/2025/12/02/4503311'),
      expect.stringContaining('ciac.zjw.sh.gov.cn/NetInterBidweb/GKInfoList'),
    ]))
    expect(samples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        projectId: 'official-public:shenzhen-baoan-a325-0235-land-use-planning-permit-202604',
        provinceCode: 'guangdong',
        cityCode: 'shenzhen',
        certificateType: 'land_use_planning_permit',
        sampleSource: 'official_public_certificate_record',
        sourceUrl: expect.stringContaining('pnr.sz.gov.cn'),
        evidenceDocumentNumber: '地字第4403062023YG0053374号',
        evidenceIssuedAt: '2023-12-20',
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:shenzhen-luohu-shaohua-building-engineering-planning-202412',
        provinceCode: 'guangdong',
        cityCode: 'shenzhen',
        certificateType: 'engineering_planning_permit',
        sampleSource: 'official_public_certificate_record',
        sourceUrl: expect.stringContaining('pnr.sz.gov.cn'),
        evidenceDocumentNumber: '建字第4403032025GG0002535号',
        evidenceIssuedAt: '2025-01',
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:guangzhou-kemulang-urban-village-land-use-planning-202505',
        provinceCode: 'guangdong',
        cityCode: 'guangzhou',
        certificateType: 'land_use_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('ghzyj.gz.gov.cn'),
        evidenceDocumentNumber: '穗规划资源地证〔2026〕300号',
        evidenceIssuedAt: '2026-06-04',
        expectedAuthority: expect.stringContaining('Guangzhou'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:guangzhou-haizhu-fangzhi-road-elevator-engineering-planning-202506',
        provinceCode: 'guangdong',
        cityCode: 'guangzhou',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('ghzyj.gz.gov.cn'),
        evidenceDocumentNumber: '穗规划资源建证〔2026〕2354号',
        evidenceIssuedAt: '2026-06-04',
        expectedAuthority: expect.stringContaining('Guangzhou'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:wuxi-xishan-land-supply-result-202509',
        provinceCode: 'jiangsu',
        cityCode: 'wuxi',
        certificateType: 'land_certificate',
        sourceUrl: expect.stringContaining('ggzyjy.wuxi.gov.cn'),
        evidenceDocumentNumber: '锡工告字[2025]17号',
        evidenceIssuedAt: '2025-09-18',
        expectedReusableOutputNames: expect.arrayContaining(['State-owned construction land use right transaction result public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:shenzhen-guangming-sterilization-base-road-construction-permit-202606',
        provinceCode: 'guangdong',
        cityCode: 'shenzhen',
        certificateType: 'construction_permit',
        sourceUrl: expect.stringContaining('sgxkInfo.jsp'),
        evidenceDocumentNumber: '2026-0659',
        evidenceIssuedAt: '2026-06-05',
        expectedAuthority: expect.stringContaining('Shenzhen'),
      }),
      expect.objectContaining({
        projectId: 'official-public:hangzhou-xiaoshan-2025-29-land-use-planning-202504',
        provinceCode: 'zhejiang',
        cityCode: 'hangzhou',
        certificateType: 'land_use_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('xiaoshan.gov.cn'),
        evidenceDocumentNumber: '地字第3301092025YG0075544号',
        evidenceIssuedAt: '2025-04-30',
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:hangzhou-xiaoshan-jingshiwei-engineering-planning-202505',
        provinceCode: 'zhejiang',
        cityCode: 'hangzhou',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('xiaoshan.gov.cn'),
        evidenceDocumentNumber: '建字第3301092025GG0093526号',
        evidenceIssuedAt: '2025-05-07',
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:hefei-yaohai-yh202213-rental-housing-construction-permit-202506',
        provinceCode: 'anhui',
        cityCode: 'hefei',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('hfyaohai.gov.cn'),
        evidenceDocumentNumber: '340102202506090101',
        evidenceIssuedAt: '2025-06-09',
        expectedAuthority: expect.stringContaining('Hefei Yaohai'),
      }),
      expect.objectContaining({
        projectId: 'official-public:wuhan-jiangxia-zhongjian-tangxunhu-land-use-planning-202504',
        provinceCode: 'hubei',
        cityCode: 'wuhan',
        certificateType: 'land_use_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('spxx.zrzyhgh.wuhan.gov.cn'),
        evidenceDocumentNumber: '武资建（夏）地[2025]023号',
        evidenceIssuedAt: '2025-04-21',
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:wuhan-caidian-huacai-optoelectronics-engineering-planning-202504',
        provinceCode: 'hubei',
        cityCode: 'wuhan',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('spxx.zrzyhgh.wuhan.gov.cn'),
        evidenceDocumentNumber: '武资建（蔡）工[2025]012号',
        evidenceIssuedAt: '2025-04-22',
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:chongqing-tongnan-taisheng-paper-construction-permit-202501',
        provinceCode: 'chongqing',
        cityCode: 'chongqing',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('cqtn.gov.cn'),
        evidenceDocumentNumber: '500223202501240101',
        evidenceIssuedAt: '2025-01-24',
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:fuzhou-sanyuan-road-land-use-planning-202505',
        provinceCode: 'fujian',
        cityCode: 'fuzhou',
        certificateType: 'land_use_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('zygh.fuzhou.gov.cn'),
        evidenceDocumentNumber: '地字第3501002025YG0069548号',
        evidenceIssuedAt: '2025-05-13',
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:zhengzhou-gaoxin-yinping-road-engineering-planning-202511',
        provinceCode: 'henan',
        cityCode: 'zhengzhou',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('zzgx.gov.cn'),
        evidenceDocumentNumber: '建字第4101022025GG0111536号交通',
        evidenceIssuedAt: '2025-11-27',
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:suzhou-sip-cssd-standard-factory-engineering-planning-202501',
        provinceCode: 'jiangsu',
        cityCode: 'suzhou',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('wsdc.sipac.gov.cn/gjw/engineeringConstruction'),
        evidenceDocumentNumber: '建字第3205002025GG0012539号',
        evidenceIssuedAt: '2025-01-21',
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:tianjin-hedong-xinkailu-engineering-planning-202503',
        provinceCode: 'tianjin',
        cityCode: 'tianjin',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('tjhd.gov.cn'),
        evidenceDocumentNumber: '2025河东建证0006',
        evidenceIssuedAt: '2025-03-13',
        expectedAuthority: expect.stringContaining('Tianjin'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:xiamen-new-airport-work-area-engineering-planning-202603',
        provinceCode: 'fujian',
        cityCode: 'xiamen',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('zygh.xm.gov.cn'),
        evidenceDocumentNumber: '厦资源规划翔建设准更〔2026〕第034号',
        evidenceIssuedAt: '2026-03-24',
        expectedAuthority: expect.stringContaining('Xiamen'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:shenyang-feiyan-aviation-equipment-engineering-planning-202506',
        provinceCode: 'liaoning',
        cityCode: 'shenyang',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('zrzyj.shenyang.gov.cn'),
        evidenceDocumentNumber: '建字第2101142025GG0023515号',
        evidenceIssuedAt: '2025-05-23',
        expectedAuthority: expect.stringContaining('Shenyang'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:quanzhou-jinjiang-waterway-hot-spring-hotel-construction-permit-202602',
        provinceCode: 'fujian',
        cityCode: 'quanzhou',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('jinjiang.gov.cn'),
        evidenceDocumentNumber: '350582202601040101',
        evidenceIssuedAt: '2026-01-04',
        expectedAuthority: expect.stringContaining('Jinjiang'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:nanchang-nanchangcounty-xindian-assembly-decoration-construction-permit-202601',
        provinceCode: 'jiangxi',
        cityCode: 'nanchang',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('ncx.nc.gov.cn'),
        evidenceDocumentNumber: '360121202512100101',
        expectedAuthority: expect.stringContaining('Nanchang County'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:qingdao-westcoast-three-gorges-land-use-planning-202602',
        provinceCode: 'shandong',
        cityCode: 'qingdao',
        certificateType: 'land_use_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('xihaian.gov.cn'),
        evidenceDocumentNumber: '地字第370201202612001号',
        evidenceIssuedAt: '2026-02-03',
        expectedAuthority: expect.stringContaining('Qingdao West Coast'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:ningbo-fenghua-yunke-pneumatic-components-construction-permit-202503',
        provinceCode: 'zhejiang',
        cityCode: 'ningbo',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('fh.gov.cn'),
        evidenceDocumentNumber: '330213202503040101',
        evidenceIssuedAt: '2025-03-04',
        expectedAuthority: expect.stringContaining('Ningbo Fenghua'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:foshan-sanshui-leping-sewage-engineering-planning-202107',
        provinceCode: 'guangdong',
        cityCode: 'foshan',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('fs-hitech.foshan.gov.cn'),
        evidenceDocumentNumber: '建字第440607202100939号',
        evidenceIssuedAt: '2021-07-21',
        expectedAuthority: expect.stringContaining('Foshan'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:dongguan-humen-fushigao-land-use-and-engineering-planning-202403',
        provinceCode: 'guangdong',
        cityCode: 'dongguan',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('dg.gov.cn'),
        evidenceDocumentNumber: '建字第4419002023GG1829320号（本地编号：2023-03-0045）',
        evidenceIssuedAt: '2023-12-15',
        expectedAuthority: expect.stringContaining('Dongguan'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:changsha-wangcheng-dazehu-geothermal-c-station-land-use-planning-202312',
        provinceCode: 'hunan',
        cityCode: 'changsha',
        certificateType: 'land_use_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('wangcheng.gov.cn'),
        evidenceDocumentNumber: '地字第430112202310076号',
        evidenceIssuedAt: '2023-12-28',
        expectedAuthority: expect.stringContaining('Changsha'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction land planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:wenzhou-cangnan-yingkeer-ink-construction-permit-202501',
        provinceCode: 'zhejiang',
        cityCode: 'wenzhou',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('zj.gov.cn'),
        evidenceDocumentNumber: '330327202501060101',
        evidenceIssuedAt: '2025-01-16',
        expectedAuthority: expect.stringContaining('Cangnan'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:dalian-wafangdian-wuzhou-heavy-machinery-engineering-planning-202603',
        provinceCode: 'liaoning',
        cityCode: 'dalian',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('dlwfd.gov.cn'),
        evidenceDocumentNumber: '建字第2102812026GG0006621号',
        evidenceIssuedAt: '2026-03-06',
        expectedAuthority: expect.stringContaining('Wafangdian'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:shijiazhuang-cangning-road-construction-permit-202501',
        provinceCode: 'hebei',
        cityCode: 'shijiazhuang',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('xzspj.sjz.gov.cn'),
        evidenceDocumentNumber: '130101202501060102',
        evidenceIssuedAt: '2025-01-06',
        expectedAuthority: expect.stringContaining('Shijiazhuang'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:nantong-rail-transit-taiping-road-north-station-exit-construction-permit-202412',
        provinceCode: 'jiangsu',
        cityCode: 'nantong',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('shuju.nantong.gov.cn'),
        evidenceDocumentNumber: '320601202412160102',
        evidenceIssuedAt: '2024-12-16',
        expectedAuthority: expect.stringContaining('Nantong Data Bureau'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:jiaxing-nanhu-meiyingde-smart-transmission-engineering-planning-202006',
        provinceCode: 'zhejiang',
        cityCode: 'jiaxing',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('nanhu.gov.cn'),
        evidenceDocumentNumber: '建字第330402202000098号',
        evidenceIssuedAt: '2020-06-11',
        expectedAuthority: expect.stringContaining('Jiaxing Natural Resources'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:xian-jingkai-zhongbing-logistics-engineering-planning-202604',
        provinceCode: 'shaanxi',
        cityCode: 'xian',
        certificateType: 'engineering_planning_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('xa.gov.cn'),
        evidenceDocumentNumber: '建字第610117202630104JK号',
        evidenceIssuedAt: '2026-04-22',
        expectedAuthority: expect.stringContaining('Xian Natural Resources'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction engineering planning permit public record']),
      }),
      expect.objectContaining({
        projectId: 'official-public:beijing-apple-garden-station-renovation-construction-permit-202602',
        provinceCode: 'beijing',
        cityCode: 'beijing',
        certificateType: 'construction_permit',
        sampleGranularity: 'named_public_certificate_record',
        sourceUrl: expect.stringContaining('zjw.beijing.gov.cn'),
        evidenceDocumentNumber: '110107202602030102',
        evidenceIssuedAt: '2026-02-03',
        expectedAuthority: expect.stringContaining('Beijing'),
        expectedReusableOutputNames: expect.arrayContaining(['Construction permit public record']),
      }),
    ]))
  })

  it('uses official public samples as the default replay baseline when local issued certificates are unavailable', async () => {
    const queryRows = async <T = Record<string, unknown>>(): Promise<T[]> => [] as T[]

    const samples = await collectCertificatePolicyReplayCalibrationSamples({
      maxSamples: 8,
      queryRows,
    })
    const noFallbackSamples = await collectCertificatePolicyReplayCalibrationSamples({
      maxSamples: 8,
      queryRows,
      includeOfficialPublicSamples: false,
    })
    const report = buildCertificatePolicyUpdateGovernanceReport({ replaySamples: samples })

    expect(samples.length).toBe(8)
    expect(samples.every((sample) => sample.sampleSource === 'official_public_certificate_record')).toBe(true)
    expect(noFallbackSamples).toEqual([])
    expect(report.automationQuality.projectReplayCalibration.sampleCount).toBe(8)
    expect(report.automationQuality.projectReplayCalibration.status).toBe('candidate_overlay_ready')
  })

  it('builds replay samples from issued certificates, linked work items, and project static location facts', async () => {
    const seenSql: string[] = []
    const queryRows = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      seenSql.push(sql)
      if (sql.includes('FROM pre_milestones')) {
        return [
          {
            id: 'cert-cp-1',
            project_id: 'project-1',
            certificate_type: 'construction_permit',
            certificate_name: 'Construction Permit',
            status: 'issued',
            approving_authority: 'Shenzhen Housing Bureau',
            issuing_authority: null,
            updated_at: '2026-05-20T08:00:00.000Z',
          },
          {
            id: 'cert-epp-1',
            project_id: 'project-1',
            certificate_type: 'engineering_planning_permit',
            certificate_name: 'Engineering Planning Permit',
            status: 'issued',
            approving_authority: 'Shenzhen Planning Bureau',
            issuing_authority: null,
            updated_at: '2026-05-19T08:00:00.000Z',
          },
        ] as T[]
      }
      if (sql.includes('FROM projects')) {
        return [
          {
            id: 'project-1',
            location: 'Guangdong Shenzhen',
            metadata: {
              projectGenerationFacts: {
                locationFacts: {
                  provinceCode: 'guangdong',
                  cityCode: 'shenzhen',
                },
              },
            },
          },
        ] as T[]
      }
      if (sql.includes('FROM certificate_work_items')) {
        return [
          {
            id: 'work-application',
            project_id: 'project-1',
            item_name: 'Construction Permit Application Form',
            item_code: 'MAT-CP-APPLICATION',
            status: 'issued',
            approving_authority: 'Shenzhen Housing Bureau',
            is_shared: false,
            sort_order: 1,
          },
          {
            id: 'work-drawing-review',
            project_id: 'project-1',
            item_name: 'Drawing Review Approval',
            item_code: 'MAT-CP-DRAWING-REVIEW',
            status: 'approved',
            approving_authority: 'Drawing Review Agency',
            is_shared: true,
            sort_order: 2,
          },
          {
            id: 'work-unlinked',
            project_id: 'project-1',
            item_name: 'Unlinked Internal Note',
            item_code: 'INTERNAL-NOTE',
            status: 'issued',
            approving_authority: 'Internal',
            is_shared: false,
            sort_order: 3,
          },
        ] as T[]
      }
      if (sql.includes('FROM certificate_dependencies')) {
        return [
          {
            project_id: 'project-1',
            predecessor_type: 'certificate',
            predecessor_id: 'cert-cp-1',
            successor_type: 'work_item',
            successor_id: 'work-application',
            dependency_kind: 'hard',
          },
          {
            project_id: 'project-1',
            predecessor_type: 'certificate',
            predecessor_id: 'cert-cp-1',
            successor_type: 'work_item',
            successor_id: 'work-drawing-review',
            dependency_kind: 'hard',
          },
          {
            project_id: 'project-1',
            predecessor_type: 'certificate',
            predecessor_id: 'cert-epp-1',
            successor_type: 'certificate',
            successor_id: 'cert-cp-1',
            dependency_kind: 'hard',
          },
        ] as T[]
      }
      return []
    }

    const samples = await collectCertificatePolicyReplayCalibrationSamples({
      maxSamples: 5,
      queryRows,
      previewBuilder: async () => ({
        provinceProfile: {
          provinceCode: 'guangdong',
          provinceName: 'Guangdong',
        },
        cityOverride: {
          cityCode: 'shenzhen',
          cityName: 'Shenzhen',
        },
        certificates: [
          {
            certificateType: 'construction_permit',
            approvingAuthority: 'Shenzhen Housing Bureau',
          },
        ],
        materialPackages: [
          {
            certificateTypes: ['construction_permit'],
            materialNames: ['Construction Permit Application Form', 'Drawing Review Approval'],
          },
        ],
        materialEvidenceChains: [
          {
            outputDocument: 'Engineering Planning Permit',
            reusableForCertificateTypes: ['construction_permit'],
          },
        ],
      }),
    })

    expect(samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId: 'project-1',
          provinceCode: 'guangdong',
          cityCode: 'shenzhen',
          certificateType: 'construction_permit',
          expectedAuthority: 'Shenzhen Housing Bureau',
          actualAuthority: 'Shenzhen Housing Bureau',
          expectedMaterialNames: ['Construction Permit Application Form', 'Drawing Review Approval'],
          actualMaterialNames: ['Construction Permit Application Form', 'Drawing Review Approval'],
          expectedReusableOutputNames: ['Engineering Planning Permit'],
          actualReusableOutputNames: ['Engineering Planning Permit', 'Drawing Review Approval'],
        }),
      ]),
    )
    expect(samples.find((sample) => sample.certificateType === 'construction_permit')?.actualMaterialNames).not.toContain(
      'Unlinked Internal Note',
    )
    expect(seenSql.some((sql) => sql.includes('FROM certificate_work_items'))).toBe(true)
    expect(seenSql.some((sql) => sql.includes('FROM certificate_dependencies'))).toBe(true)
  })
})
