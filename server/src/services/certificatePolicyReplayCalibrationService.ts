import { query as rawQuery } from '../database.js'
import { GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE } from '../seeds/certificateTemplateSeed.js'
import { buildCertificateTemplatePreview } from './certificateTemplateService.js'
import type { CertificatePolicyReplayCalibrationSample } from './certificateTemplatePolicyUpdateService.js'

type QueryRows = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

interface CertificatePolicyReplayPreview {
  provinceProfile?: { provinceCode?: string | null; provinceName?: string | null } | null
  cityOverride?: { cityCode?: string | null; cityName?: string | null } | null
  certificates: Array<{ certificateType: string; approvingAuthority?: string | null }>
  materialPackages: Array<{ certificateTypes: string[]; materialNames: string[] }>
  materialEvidenceChains: Array<{ outputDocument: string; reusableForCertificateTypes: string[] }>
}

type PreviewBuilder = (projectId: string) => Promise<CertificatePolicyReplayPreview>

interface CertificateReplayProjectRow {
  id: string
  location?: string | null
  metadata?: unknown
}

interface CertificateReplayCertificateRow {
  id: string
  project_id: string
  certificate_type?: string | null
  milestone_type?: string | null
  certificate_name?: string | null
  milestone_name?: string | null
  status?: string | null
  approving_authority?: string | null
  issuing_authority?: string | null
  updated_at?: string | null
}

interface CertificateReplayWorkItemRow {
  id: string
  project_id: string
  item_code?: string | null
  item_name?: string | null
  status?: string | null
  approving_authority?: string | null
  is_shared?: boolean | null
  sort_order?: number | null
}

interface CertificateReplayDependencyRow {
  project_id: string
  predecessor_type: 'certificate' | 'work_item' | string
  predecessor_id: string
  successor_type: 'certificate' | 'work_item' | string
  successor_id: string
  dependency_kind?: string | null
}

export interface CollectCertificatePolicyReplayCalibrationSamplesOptions {
  maxSamples?: number
  queryRows?: QueryRows
  previewBuilder?: PreviewBuilder
  includeOfficialPublicSamples?: boolean
  systemJob?: boolean
}

const DEFAULT_SAMPLE_LIMIT = 80
const COMPLETE_CERTIFICATE_STATUSES = new Set(['issued', 'approved'])
const COMPLETE_WORK_ITEM_STATUSES = new Set(['issued', 'approved', 'completed'])

export interface OfficialPublicCertificateReplaySample {
  sampleKey: string
  provinceCode: string
  cityCode: string
  cityName: string
  certificateType: 'land_certificate' | 'land_use_planning_permit' | 'engineering_planning_permit' | 'construction_permit'
  projectName: string
  sourceName: string
  sourceUrl: string
  evidenceScope:
    | 'land_supply_result_or_real_estate_right_occurrence_check'
    | 'land_use_planning_permit_occurrence_check'
    | 'engineering_planning_permit_occurrence_check'
    | 'construction_permit_occurrence_check'
    | 'official_city_service_entry_check'
  sampleGranularity: 'named_public_certificate_record' | 'official_city_entry'
  materialNames?: string[]
  resultDocumentNames: string[]
  authorityName: string
  evidenceDocumentNumber?: string
  evidenceIssuedAt?: string
}

export const OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES: OfficialPublicCertificateReplaySample[] = [
  {
    sampleKey: 'shenzhen-baoan-a325-0235-land-use-planning-permit-202604',
    provinceCode: 'guangdong',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    certificateType: 'land_use_planning_permit',
    projectName: 'Baoan A325-0235 mixed-use land use planning permit public record',
    sourceName: 'Shenzhen Planning and Natural Resources Bureau public notice',
    sourceUrl: 'https://pnr.sz.gov.cn/xxgk/gggs/content/post_12623701.html',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Shenzhen Planning and Natural Resources Bureau',
    evidenceDocumentNumber: '地字第4403062023YG0053374号',
    evidenceIssuedAt: '2023-12-20',
  },
  {
    sampleKey: 'shenzhen-luohu-shaohua-building-engineering-planning-202412',
    provinceCode: 'guangdong',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    certificateType: 'engineering_planning_permit',
    projectName: 'Luohu Shaohua Building engineering planning permit public record',
    sourceName: 'Shenzhen Planning and Natural Resources Bureau public notice',
    sourceUrl: 'https://pnr.sz.gov.cn/xxgk/gggs/content/post_12467801.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Shenzhen Planning and Natural Resources Bureau',
    evidenceDocumentNumber: '建字第4403032025GG0002535号',
    evidenceIssuedAt: '2025-01',
  },
  {
    sampleKey: 'guangzhou-kemulang-urban-village-land-use-planning-202505',
    provinceCode: 'guangdong',
    cityCode: 'guangzhou',
    cityName: 'Guangzhou',
    certificateType: 'land_use_planning_permit',
    projectName: 'Tianhe Kemu Lang urban village first-open resettlement land use planning permit public record',
    sourceName: 'Guangzhou Planning and Natural Resources Bureau public notice',
    sourceUrl: 'https://ghzyj.gz.gov.cn/ywpd/cxgh/ghxkgsgb/phgbnew/ydghxkz/2025/content/post_10842172.html',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Guangzhou Planning and Natural Resources Bureau',
    evidenceDocumentNumber: '穗规划资源地证〔2026〕300号',
    evidenceIssuedAt: '2026-06-04',
  },
  {
    sampleKey: 'guangzhou-haizhu-fangzhi-road-elevator-engineering-planning-202506',
    provinceCode: 'guangdong',
    cityCode: 'guangzhou',
    cityName: 'Guangzhou',
    certificateType: 'engineering_planning_permit',
    projectName: 'Haizhu Fangzhi Road existing residential elevator engineering planning permit public record',
    sourceName: 'Guangzhou Planning and Natural Resources Bureau public notice',
    sourceUrl: 'https://ghzyj.gz.gov.cn/ywpd/cxgh/ghxkgsgb/phgbnew/gcghxkz/2025/content/post_10844456.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Guangzhou Planning and Natural Resources Bureau',
    evidenceDocumentNumber: '穗规划资源建证〔2026〕2354号',
    evidenceIssuedAt: '2026-06-04',
  },
  {
    sampleKey: 'wuxi-xishan-land-supply-result-202509',
    provinceCode: 'jiangsu',
    cityCode: 'wuxi',
    cityName: 'Wuxi',
    certificateType: 'land_certificate',
    projectName: 'Wuxi state-owned construction land transaction public result sample',
    sourceName: 'Wuxi Public Resources Trading Center land transaction public notice',
    sourceUrl: 'https://ggzyjy.wuxi.gov.cn/doc/2025/09/18/4650382.shtml',
    evidenceScope: 'land_supply_result_or_real_estate_right_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['State-owned construction land use right transaction result public record'],
    authorityName: 'Wuxi Public Resources Trading Center / natural resources authority',
    evidenceDocumentNumber: '锡工告字[2025]17号',
    evidenceIssuedAt: '2025-09-18',
  },
  {
    sampleKey: 'shenzhen-guangming-sterilization-base-road-construction-permit-202606',
    provinceCode: 'guangdong',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    certificateType: 'construction_permit',
    projectName: 'Guangming sterilization industrial base supporting road construction permit public record',
    sourceName: 'Shenzhen Housing and Construction Bureau construction permit detail query',
    sourceUrl: 'https://zjj.sz.gov.cn/projreg/public/sgxk/sgxkInfo.jsp?id=20e3d3f1-e45b-401f-a3e1-43c02997a545',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public query record'],
    authorityName: 'Shenzhen Housing and Construction Bureau',
    evidenceDocumentNumber: '2026-0659',
    evidenceIssuedAt: '2026-06-05',
  },
  {
    sampleKey: 'hangzhou-xiaoshan-2025-29-land-use-planning-202504',
    provinceCode: 'zhejiang',
    cityCode: 'hangzhou',
    cityName: 'Hangzhou',
    certificateType: 'land_use_planning_permit',
    projectName: 'Xiaoshan Hangzhou 2025-29 residential and kindergarten land use planning permit public record',
    sourceName: 'Hangzhou Planning and Natural Resources Bureau Xiaoshan Branch weekly planning approval notice',
    sourceUrl: 'https://www.xiaoshan.gov.cn/art/2025/5/12/art_1229416528_59111989.html',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Hangzhou Planning and Natural Resources Bureau Xiaoshan Branch',
    evidenceDocumentNumber: '地字第3301092025YG0075544号',
    evidenceIssuedAt: '2025-04-30',
  },
  {
    sampleKey: 'hangzhou-xiaoshan-jingshiwei-engineering-planning-202505',
    provinceCode: 'zhejiang',
    cityCode: 'hangzhou',
    cityName: 'Hangzhou',
    certificateType: 'engineering_planning_permit',
    projectName: 'Zhejiang Jingshiwei contact lens care solution annex engineering planning permit public record',
    sourceName: 'Hangzhou Planning and Natural Resources Bureau Xiaoshan Branch weekly planning approval notice',
    sourceUrl: 'https://www.xiaoshan.gov.cn/art/2025/5/12/art_1229416528_59111989.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Hangzhou Planning and Natural Resources Bureau Xiaoshan Branch',
    evidenceDocumentNumber: '建字第3301092025GG0093526号',
    evidenceIssuedAt: '2025-05-07',
  },
  {
    sampleKey: 'hefei-yaohai-yh202213-rental-housing-construction-permit-202506',
    provinceCode: 'anhui',
    cityCode: 'hefei',
    cityName: 'Hefei',
    certificateType: 'construction_permit',
    projectName: 'Yizhongxi rental housing YH202213 land parcel construction permit public record',
    sourceName: 'Hefei Yaohai Housing and Urban-Rural Development Bureau construction permit approval notice',
    sourceUrl: 'https://www.hfyaohai.gov.cn/public/14751/111152261.html',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Hefei Yaohai Housing and Urban-Rural Development Bureau',
    evidenceDocumentNumber: '340102202506090101',
    evidenceIssuedAt: '2025-06-09',
  },
  {
    sampleKey: 'wuhan-jiangxia-zhongjian-tangxunhu-land-use-planning-202504',
    provinceCode: 'hubei',
    cityCode: 'wuhan',
    cityName: 'Wuhan',
    certificateType: 'land_use_planning_permit',
    projectName: 'Zhongjian Tangxunhu No.1 land use planning permit public record',
    sourceName: 'Wuhan Natural Resources and Planning Bureau administrative licensing public record',
    sourceUrl: 'https://spxx.zrzyhgh.wuhan.gov.cn/showSgsJyh.asp?cid=2255&instanceID=SX20250421002021&type=1',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Wuhan Natural Resources and Planning Bureau Jiangxia District Branch',
    evidenceDocumentNumber: '武资建（夏）地[2025]023号',
    evidenceIssuedAt: '2025-04-21',
  },
  {
    sampleKey: 'wuhan-caidian-huacai-optoelectronics-engineering-planning-202504',
    provinceCode: 'hubei',
    cityCode: 'wuhan',
    cityName: 'Wuhan',
    certificateType: 'engineering_planning_permit',
    projectName: 'Huacai Optoelectronics Central China Base engineering planning permit public record',
    sourceName: 'Wuhan Natural Resources and Planning Bureau administrative licensing public record',
    sourceUrl: 'https://spxx.zrzyhgh.wuhan.gov.cn/showSgsJyh.asp?cid=2255&instanceID=SX20250422002037&type=1',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Wuhan Natural Resources and Planning Bureau Caidian District Branch',
    evidenceDocumentNumber: '武资建（蔡）工[2025]012号',
    evidenceIssuedAt: '2025-04-22',
  },
  {
    sampleKey: 'chongqing-tongnan-taisheng-paper-construction-permit-202501',
    provinceCode: 'chongqing',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    certificateType: 'construction_permit',
    projectName: 'Tongnan Taisheng paper production project construction permit public record',
    sourceName: 'Chongqing Tongnan Housing and Urban-Rural Construction Bureau construction permit statistics',
    sourceUrl: 'https://www.cqtn.gov.cn/bm/qzfcxjw/zwgk_25192/zfxxgkml_bm/zdjsxm/sgygxx/202512/t20251223_15263005.html',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Chongqing Tongnan Housing and Urban-Rural Construction Bureau',
    evidenceDocumentNumber: '500223202501240101',
    evidenceIssuedAt: '2025-01-24',
  },
  {
    sampleKey: 'fuzhou-sanyuan-road-land-use-planning-202505',
    provinceCode: 'fujian',
    cityCode: 'fuzhou',
    cityName: 'Fuzhou',
    certificateType: 'land_use_planning_permit',
    projectName: 'Fuzhou Sanyuan area supporting road phase I land use planning permit public record',
    sourceName: 'Fuzhou Natural Resources and Planning Bureau land use planning permit issuance statistics',
    sourceUrl: 'https://zygh.fuzhou.gov.cn/zwgk/tjxx/202506/t20250603_5027343.htm',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Fuzhou Natural Resources and Planning Bureau',
    evidenceDocumentNumber: '地字第3501002025YG0069548号',
    evidenceIssuedAt: '2025-05-13',
  },
  {
    sampleKey: 'zhengzhou-gaoxin-yinping-road-engineering-planning-202511',
    provinceCode: 'henan',
    cityCode: 'zhengzhou',
    cityName: 'Zhengzhou',
    certificateType: 'engineering_planning_permit',
    projectName: 'Zhengzhou Gaoxin Yinping Road drainage and lighting engineering planning permit public record',
    sourceName: 'Zhengzhou High-Tech Industrial Development Zone Management Committee engineering planning permit post-approval notice',
    sourceUrl: 'https://www.zzgx.gov.cn/gcphgg/9756866.jhtml',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Zhengzhou Natural Resources and Planning Bureau High-Tech Branch',
    evidenceDocumentNumber: '建字第4101022025GG0111536号交通',
    evidenceIssuedAt: '2025-11-27',
  },
  {
    sampleKey: 'suzhou-sip-cssd-standard-factory-engineering-planning-202501',
    provinceCode: 'jiangsu',
    cityCode: 'suzhou',
    cityName: 'Suzhou',
    certificateType: 'engineering_planning_permit',
    projectName: 'Suzhou Export Processing Zone Area B CSSD standard factory engineering planning permit public record',
    sourceName: 'Suzhou Industrial Park Planning and Construction Committee engineering planning permit issuance record',
    sourceUrl: 'https://wsdc.sipac.gov.cn/gjw/engineeringConstruction?projectName=',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Suzhou Industrial Park Planning and Construction Committee',
    evidenceDocumentNumber: '建字第3205002025GG0012539号',
    evidenceIssuedAt: '2025-01-21',
  },
  {
    sampleKey: 'tianjin-hedong-xinkailu-engineering-planning-202503',
    provinceCode: 'tianjin',
    cityCode: 'tianjin',
    cityName: 'Tianjin',
    certificateType: 'engineering_planning_permit',
    projectName: 'Tianjin Hedong Xinkailu land parcel engineering planning permit public record',
    sourceName: 'Tianjin Hedong District Government administrative licensing disclosure',
    sourceUrl: 'https://www.tjhd.gov.cn/zwgk/zfxxgk/cgdw/sghzyjhdfj/fdzdgknr78/xzxkfwsx78/202503/t20250317_6884318.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Tianjin Planning and Natural Resources Bureau Hedong Branch',
    evidenceDocumentNumber: '2025河东建证0006',
    evidenceIssuedAt: '2025-03-13',
  },
  {
    sampleKey: 'xiamen-new-airport-work-area-engineering-planning-202603',
    provinceCode: 'fujian',
    cityCode: 'xiamen',
    cityName: 'Xiamen',
    certificateType: 'engineering_planning_permit',
    projectName: 'Xiamen new airport work area stationed-unit supporting project B-30 and B-31 engineering planning permit public record',
    sourceName: 'Xiamen Natural Resources and Planning Bureau engineering planning permit disclosure',
    sourceUrl: 'https://zygh.xm.gov.cn/zfxxgk/zfxxgkml/89211/xzxkgs/gcghxk/202603/t20260330_2988351.htm',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Xiamen Natural Resources and Planning Bureau',
    evidenceDocumentNumber: '厦资源规划翔建设准更〔2026〕第034号',
    evidenceIssuedAt: '2026-03-24',
  },
  {
    sampleKey: 'shenyang-feiyan-aviation-equipment-engineering-planning-202506',
    provinceCode: 'liaoning',
    cityCode: 'shenyang',
    cityName: 'Shenyang',
    certificateType: 'engineering_planning_permit',
    projectName: 'Shenyang Feiyan aviation equipment intelligent R&D and manufacturing base engineering planning permit public record',
    sourceName: 'Shenyang Natural Resources Bureau engineering planning permit post-approval notice',
    sourceUrl: 'https://zrzyj.shenyang.gov.cn/zxbs/gsgg/jsxmfapqphgs/202506/t20250618_4865688.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Shenyang Natural Resources Bureau Yuhong Branch',
    evidenceDocumentNumber: '建字第2101142025GG0023515号',
    evidenceIssuedAt: '2025-05-23',
  },
  {
    sampleKey: 'quanzhou-jinjiang-waterway-hot-spring-hotel-construction-permit-202602',
    provinceCode: 'fujian',
    cityCode: 'quanzhou',
    cityName: 'Quanzhou',
    certificateType: 'construction_permit',
    projectName: 'Jinjiang Waterway hot spring hotel construction permit public record',
    sourceName: 'Jinjiang Municipal Government construction permit issuance disclosure',
    sourceUrl: 'https://www.jinjiang.gov.cn/xxgk/zdxxgk/zdjsxm/xmdt/202602/t20260224_3269022.htm',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Jinjiang Housing and Urban-Rural Construction Bureau',
    evidenceDocumentNumber: '350582202601040101',
    evidenceIssuedAt: '2026-01-04',
  },
  {
    sampleKey: 'nanchang-nanchangcounty-xindian-assembly-decoration-construction-permit-202601',
    provinceCode: 'jiangxi',
    cityCode: 'nanchang',
    cityName: 'Nanchang',
    certificateType: 'construction_permit',
    projectName: 'Nanchang County Xindian whole-house intelligent assembly decoration production base workshop construction permit public record',
    sourceName: 'Nanchang County Government construction permit government information disclosure',
    sourceUrl: 'https://ncx.nc.gov.cn/ncxrmzf/zjjzwgz/202601/e1c58241bb7640cb9903776e6f6d6aed.shtml',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Nanchang County Housing and Urban-Rural Construction Bureau',
    evidenceDocumentNumber: '360121202512100101',
  },
  {
    sampleKey: 'qingdao-westcoast-three-gorges-land-use-planning-202602',
    provinceCode: 'shandong',
    cityCode: 'qingdao',
    cityName: 'Qingdao',
    certificateType: 'land_use_planning_permit',
    projectName: 'Three Gorges Qingdao offshore wind project land use planning permit public record',
    sourceName: 'Qingdao West Coast New Area construction land planning permit post-approval disclosure PDF',
    sourceUrl: 'https://www.xihaian.gov.cn/ywdt/tzgg/202602/P020260210387880602046.pdf',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Qingdao West Coast New Area planning and natural resources authority',
    evidenceDocumentNumber: '地字第370201202612001号',
    evidenceIssuedAt: '2026-02-03',
  },
  {
    sampleKey: 'ningbo-fenghua-yunke-pneumatic-components-construction-permit-202503',
    provinceCode: 'zhejiang',
    cityCode: 'ningbo',
    cityName: 'Ningbo',
    certificateType: 'construction_permit',
    projectName: 'Ningbo Yunke annual 5 million high-efficiency pneumatic components construction permit public record',
    sourceName: 'Ningbo Fenghua District Government March 2025 construction permit registration summary',
    sourceUrl: 'https://www.fh.gov.cn/art/2025/4/1/art_1229597944_59161561.html',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Ningbo Fenghua District Housing and Urban-Rural Construction Bureau',
    evidenceDocumentNumber: '330213202503040101',
    evidenceIssuedAt: '2025-03-04',
  },
  {
    sampleKey: 'foshan-sanshui-leping-sewage-engineering-planning-202107',
    provinceCode: 'guangdong',
    cityCode: 'foshan',
    cityName: 'Foshan',
    certificateType: 'engineering_planning_permit',
    projectName: 'Sanshui Leping sewage interception project engineering planning permit public record',
    sourceName: 'Foshan High-Tech Zone engineering planning permit post-approval disclosure',
    sourceUrl: 'https://fs-hitech.foshan.gov.cn/zw/11/03/content/mpost_4890367.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Foshan High-Tech Zone planning authority',
    evidenceDocumentNumber: '建字第440607202100939号',
    evidenceIssuedAt: '2021-07-21',
  },
  {
    sampleKey: 'dongguan-humen-fushigao-land-use-and-engineering-planning-202403',
    provinceCode: 'guangdong',
    cityCode: 'dongguan',
    cityName: 'Dongguan',
    certificateType: 'engineering_planning_permit',
    projectName: 'Dongguan Fushigao electroacoustic technology electronics industrial project phase I planning permit public record',
    sourceName: 'Dongguan Humen Town planning post-approval disclosure',
    sourceUrl: 'https://www.dg.gov.cn/humen/zt/jczwgk/cxgh/content/post_4166771.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Dongguan planning and natural resources authority',
    evidenceDocumentNumber: '建字第4419002023GG1829320号（本地编号：2023-03-0045）',
    evidenceIssuedAt: '2023-12-15',
  },
  {
    sampleKey: 'changsha-wangcheng-dazehu-geothermal-c-station-land-use-planning-202312',
    provinceCode: 'hunan',
    cityCode: 'changsha',
    cityName: 'Changsha',
    certificateType: 'land_use_planning_permit',
    projectName: 'Dazehu Haigui Town shallow geothermal energy station C land use planning permit public record',
    sourceName: 'Changsha Wangcheng District Government land use planning permit post-approval disclosure',
    sourceUrl: 'http://www.wangcheng.gov.cn/xxgk_343/gdwxxgk/bmxxgk/qzfgzbmhbmgljg/qgtj/csgh/phgb/202312/t20231229_11333894.html',
    evidenceScope: 'land_use_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction land planning permit public record'],
    authorityName: 'Changsha Natural Resources and Planning Bureau Wangcheng Branch',
    evidenceDocumentNumber: '地字第430112202310076号',
    evidenceIssuedAt: '2023-12-28',
  },
  {
    sampleKey: 'wenzhou-cangnan-yingkeer-ink-construction-permit-202501',
    provinceCode: 'zhejiang',
    cityCode: 'wenzhou',
    cityName: 'Wenzhou',
    certificateType: 'construction_permit',
    projectName: 'Wenzhou Yingkeer annual 10,000 tons water-based plastic ink intelligent production line construction permit public record',
    sourceName: 'Cangnan Housing and Urban-Rural Construction Bureau 2025 January-April construction permit post-approval PDF',
    sourceUrl: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web1831/site/attach/0/185179c367174437bdfbbfd2456c9db0.pdf',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Cangnan Housing and Urban-Rural Construction Bureau',
    evidenceDocumentNumber: '330327202501060101',
    evidenceIssuedAt: '2025-01-16',
  },
  {
    sampleKey: 'dalian-wafangdian-wuzhou-heavy-machinery-engineering-planning-202603',
    provinceCode: 'liaoning',
    cityCode: 'dalian',
    cityName: 'Dalian',
    certificateType: 'engineering_planning_permit',
    projectName: 'Dalian Wuzhou Qinda bearing heavy machinery processing workshop engineering planning permit public record',
    sourceName: 'Wafangdian Municipal Government engineering planning permit post-approval disclosure',
    sourceUrl: 'https://www.dlwfd.gov.cn/2026/0311/11579.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Wafangdian Natural Resources Bureau',
    evidenceDocumentNumber: '建字第2102812026GG0006621号',
    evidenceIssuedAt: '2026-03-06',
  },
  {
    sampleKey: 'shijiazhuang-cangning-road-construction-permit-202501',
    provinceCode: 'hebei',
    cityCode: 'shijiazhuang',
    cityName: 'Shijiazhuang',
    certificateType: 'construction_permit',
    projectName: 'Cangning Road road and pipe-gallery second construction section construction permit public record',
    sourceName: 'Shijiazhuang Administrative Approval Bureau 2025 construction permit issuance disclosure',
    sourceUrl: 'https://xzspj.sjz.gov.cn/columns/82dab922-bb4f-4f11-a919-4ccf0f650e6a/202512/26/64ef5931-ac4a-4b52-adbf-169c4494ca58.html',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Shijiazhuang Administrative Approval Bureau',
    evidenceDocumentNumber: '130101202501060102',
    evidenceIssuedAt: '2025-01-06',
  },
  {
    sampleKey: 'nantong-rail-transit-taiping-road-north-station-exit-construction-permit-202412',
    provinceCode: 'jiangsu',
    cityCode: 'nantong',
    cityName: 'Nantong',
    certificateType: 'construction_permit',
    projectName: 'Nantong urban rail transit line 2 phase 1 Taiping Road North Station exit 2 construction permit public record',
    sourceName: 'Nantong Data Bureau construction permit PDF disclosure',
    sourceUrl: 'https://shuju.nantong.gov.cn//truecms/attachmentController/download.do?id=ba7ca5bd-50f8-4768-b292-963e83298847',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Nantong Data Bureau',
    evidenceDocumentNumber: '320601202412160102',
    evidenceIssuedAt: '2024-12-16',
  },
  {
    sampleKey: 'jiaxing-nanhu-meiyingde-smart-transmission-engineering-planning-202006',
    provinceCode: 'zhejiang',
    cityCode: 'jiaxing',
    cityName: 'Jiaxing',
    certificateType: 'engineering_planning_permit',
    projectName: 'Jiaxing Meiyingde intelligent permanent-magnet transmission system project engineering planning permit public record',
    sourceName: 'Nanhu District Government engineering planning permit post-approval disclosure',
    sourceUrl: 'https://www.nanhu.gov.cn/art/2020/7/22/art_1229299414_2817120.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Jiaxing Natural Resources and Planning Bureau',
    evidenceDocumentNumber: '建字第330402202000098号',
    evidenceIssuedAt: '2020-06-11',
  },
  {
    sampleKey: 'xian-jingkai-zhongbing-logistics-engineering-planning-202604',
    provinceCode: 'shaanxi',
    cityCode: 'xian',
    cityName: 'Xian',
    certificateType: 'engineering_planning_permit',
    projectName: 'Xian Jingkai Zhongbing northwest centralized procurement center and modern logistics phase II engineering planning permit public record',
    sourceName: 'Xian Municipal Government construction engineering planning permit approval result disclosure',
    sourceUrl: 'https://www.xa.gov.cn/gk/zdjsxm/pzjg/2046897231662469122.html',
    evidenceScope: 'engineering_planning_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction engineering planning permit public record'],
    authorityName: 'Xian Natural Resources and Planning Bureau Jingkai Branch',
    evidenceDocumentNumber: '建字第610117202630104JK号',
    evidenceIssuedAt: '2026-04-22',
  },
  {
    sampleKey: 'beijing-apple-garden-station-renovation-construction-permit-202602',
    provinceCode: 'beijing',
    cityCode: 'beijing',
    cityName: 'Beijing',
    certificateType: 'construction_permit',
    projectName: 'Beijing metro line 1 Apple Garden Station renovation project construction permit public record',
    sourceName: 'Beijing Municipal Commission of Housing and Urban-Rural Development construction permit information disclosure',
    sourceUrl: 'https://bjjs.zjw.beijing.gov.cn/eportal/ui?pageId=53613832',
    evidenceScope: 'construction_permit_occurrence_check',
    sampleGranularity: 'named_public_certificate_record',
    resultDocumentNames: ['Construction permit public record'],
    authorityName: 'Beijing Municipal Commission of Housing and Urban-Rural Development',
    evidenceDocumentNumber: '110107202602030102',
    evidenceIssuedAt: '2026-02-03',
  },
  {
    sampleKey: 'guangzhou-land-use-planning-permit-official-entry',
    provinceCode: 'guangdong',
    cityCode: 'guangzhou',
    cityName: 'Guangzhou',
    certificateType: 'land_use_planning_permit',
    projectName: 'Guangzhou land use planning permit public notice entry',
    sourceName: 'Guangzhou Planning and Natural Resources Bureau land use planning permit public notice entry',
    sourceUrl: 'https://ghzyj.gz.gov.cn/ywpd/cxgh/ghxkgsgb/phgbnew/ydghxkz/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction land planning permit public notice entry'],
    authorityName: 'Guangzhou Planning and Natural Resources Bureau',
  },
  {
    sampleKey: 'wuxi-planning-permit-official-entry',
    provinceCode: 'jiangsu',
    cityCode: 'wuxi',
    cityName: 'Wuxi',
    certificateType: 'land_use_planning_permit',
    projectName: 'Wuxi planning permit public notice entry',
    sourceName: 'Wuxi Natural Resources and Planning Bureau public notice entry',
    sourceUrl: 'https://zrzy.wuxi.gov.cn/gggs/index.shtml',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Planning permit public notice entry'],
    authorityName: 'Wuxi Natural Resources and Planning Bureau',
  },
  {
    sampleKey: 'shenzhen-construction-permit-official-entry',
    provinceCode: 'guangdong',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    certificateType: 'construction_permit',
    projectName: 'Shenzhen construction permit public query entry',
    sourceName: 'Shenzhen Housing and Construction Bureau construction permit public notice entry',
    sourceUrl: 'https://zjj.sz.gov.cn/bsfw/jggs/sgxk/index.html',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction permit public query entry'],
    authorityName: 'Shenzhen Housing and Construction Bureau',
  },
  {
    sampleKey: 'beijing-construction-permit-official-entry',
    provinceCode: 'beijing',
    cityCode: 'beijing',
    cityName: 'Beijing',
    certificateType: 'construction_permit',
    projectName: 'Beijing construction permit official source entry',
    sourceName: 'Beijing Municipal Commission of Housing and Urban-Rural Development official entry',
    sourceUrl: 'https://zjw.beijing.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction permit official source entry'],
    authorityName: 'Beijing Municipal Commission of Housing and Urban-Rural Development',
  },
  {
    sampleKey: 'shanghai-construction-permit-official-entry',
    provinceCode: 'shanghai',
    cityCode: 'shanghai',
    cityName: 'Shanghai',
    certificateType: 'construction_permit',
    projectName: 'Shanghai construction permit official source entry',
    sourceName: 'Shanghai Housing and Urban-Rural Construction Management Commission official entry',
    sourceUrl: 'https://zjw.sh.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction permit official source entry'],
    authorityName: 'Shanghai Housing and Urban-Rural Construction Management Commission',
  },
  {
    sampleKey: 'suzhou-construction-permit-official-entry',
    provinceCode: 'jiangsu',
    cityCode: 'suzhou',
    cityName: 'Suzhou',
    certificateType: 'construction_permit',
    projectName: 'Suzhou engineering construction approval public entry',
    sourceName: 'Suzhou municipal government engineering construction approval service entry',
    sourceUrl: 'https://www.suzhou.gov.cn/szsrmzf/qxkx/202506/ddce4a24337c41e1ad0441e86b39f8ce.shtml',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Engineering construction approval service public entry'],
    authorityName: 'Suzhou engineering construction approval authority',
  },
  {
    sampleKey: 'hangzhou-planning-permit-official-entry',
    provinceCode: 'zhejiang',
    cityCode: 'hangzhou',
    cityName: 'Hangzhou',
    certificateType: 'engineering_planning_permit',
    projectName: 'Hangzhou planning permit official service entry',
    sourceName: 'Zhejiang government service engineering construction approval entry',
    sourceUrl: 'https://www.zjzwfw.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Planning permit official service entry'],
    authorityName: 'Hangzhou natural resources and planning authority',
  },
  {
    sampleKey: 'wuhan-planning-permit-official-entry',
    provinceCode: 'hubei',
    cityCode: 'wuhan',
    cityName: 'Wuhan',
    certificateType: 'engineering_planning_permit',
    projectName: 'Wuhan planning permit official service entry',
    sourceName: 'Wuhan Natural Resources and Planning Bureau service entry',
    sourceUrl: 'https://zrzyhgh.wuhan.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Planning permit official service entry'],
    authorityName: 'Wuhan Natural Resources and Planning Bureau',
  },
  {
    sampleKey: 'qingdao-construction-permit-official-entry',
    provinceCode: 'shandong',
    cityCode: 'qingdao',
    cityName: 'Qingdao',
    certificateType: 'construction_permit',
    projectName: 'Qingdao construction permit official service entry',
    sourceName: 'Qingdao Housing and Urban-Rural Development Bureau service entry',
    sourceUrl: 'https://zjj.qingdao.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction permit official service entry'],
    authorityName: 'Qingdao Housing and Urban-Rural Development Bureau',
  },
  {
    sampleKey: 'chengdu-land-use-planning-official-entry',
    provinceCode: 'sichuan',
    cityCode: 'chengdu',
    cityName: 'Chengdu',
    certificateType: 'land_use_planning_permit',
    projectName: 'Chengdu land use planning permit official service entry',
    sourceName: 'Chengdu planning and natural resources official service entry',
    sourceUrl: 'https://mpnr.chengdu.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Land use planning permit official service entry'],
    authorityName: 'Chengdu planning and natural resources authority',
  },
  {
    sampleKey: 'tianjin-land-supply-official-entry',
    provinceCode: 'tianjin',
    cityCode: 'tianjin',
    cityName: 'Tianjin',
    certificateType: 'land_certificate',
    projectName: 'Tianjin land supply official service entry',
    sourceName: 'Tianjin public resources / natural resources land service entry',
    sourceUrl: 'https://ggzy.zwfwb.tj.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Land supply or transaction official service entry'],
    authorityName: 'Tianjin public resources and natural resources authority',
  },
  {
    sampleKey: 'chongqing-construction-permit-official-entry',
    provinceCode: 'chongqing',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    certificateType: 'construction_permit',
    projectName: 'Chongqing construction permit official service entry',
    sourceName: 'Chongqing Housing and Urban-Rural Construction Commission service entry',
    sourceUrl: 'https://zfcxjw.cq.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction permit official service entry'],
    authorityName: 'Chongqing Housing and Urban-Rural Construction Commission',
  },
  {
    sampleKey: 'ningbo-land-supply-official-entry',
    provinceCode: 'zhejiang',
    cityCode: 'ningbo',
    cityName: 'Ningbo',
    certificateType: 'land_certificate',
    projectName: 'Ningbo land supply public resource official entry',
    sourceName: 'Ningbo public resources land transaction service entry',
    sourceUrl: 'https://jyxt.zwb.ningbo.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Land supply or transaction official service entry'],
    authorityName: 'Ningbo public resources and natural resources authority',
  },
  {
    sampleKey: 'hefei-construction-permit-official-entry',
    provinceCode: 'anhui',
    cityCode: 'hefei',
    cityName: 'Hefei',
    certificateType: 'construction_permit',
    projectName: 'Hefei construction permit official service entry',
    sourceName: 'Hefei Urban-Rural Construction Bureau service entry',
    sourceUrl: 'https://cxjsj.hefei.gov.cn/',
    evidenceScope: 'official_city_service_entry_check',
    sampleGranularity: 'official_city_entry',
    resultDocumentNames: ['Construction permit official service entry'],
    authorityName: 'Hefei Urban-Rural Construction Bureau',
  },
]

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeComparableText(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = normalizeText(value)
    const key = normalizeComparableText(text)
    if (!text || seen.has(key)) continue
    seen.add(key)
    result.push(text)
  }
  return result
}

function normalizeCityProfileKey(provinceCode: unknown, cityCode: unknown) {
  return `${normalizeComparableText(provinceCode)}:${normalizeComparableText(cityCode)}`
}

function isNamedPublicCertificateReplaySample(sample: OfficialPublicCertificateReplaySample) {
  return sample.sampleGranularity === 'named_public_certificate_record'
}

function isOfficialCityEntryReplaySample(sample: OfficialPublicCertificateReplaySample) {
  return sample.sampleGranularity === 'official_city_entry'
}

function isTrustedOfficialUrl(url: unknown) {
  const text = normalizeComparableText(url)
  return Boolean(text) && (
    text.includes('.gov.cn') ||
    text.includes('gov.cn') ||
    text.includes('zwfw') ||
    text.includes('ggzy') ||
    text.includes('ciac.zjw.sh.cn')
  )
}

function isPublicSampleForCityProfile(sample: OfficialPublicCertificateReplaySample, profile: { provinceCode?: string | null; cityCode?: string | null }) {
  return normalizeCityProfileKey(sample.provinceCode, sample.cityCode) === normalizeCityProfileKey(profile.provinceCode, profile.cityCode)
}

function getPublishedCertificateCityProfiles() {
  return GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.cityOverrides
    .filter((override) => override.reviewStatus === 'published')
    .map((override) => ({
      provinceCode: override.provinceCode,
      cityCode: override.cityCode,
      cityName: override.cityName,
      sourceUrls: override.policySources.map((source) => source.sourceUrl).filter(Boolean),
    }))
}

function getGovernedCertificateTypes() {
  return GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.certificates.map((certificate) => certificate.certificateType)
}

export function buildOfficialPublicCertificateReplayCoverageReport() {
  const provinceProfiles = GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE.provinceProfiles
    .filter((profile) => profile.reviewStatus === 'published' && profile.provinceCode !== 'default')
  const cityProfiles = getPublishedCertificateCityProfiles()
  const certificateTypes = getGovernedCertificateTypes()
  const namedPublicSamples = OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.filter(isNamedPublicCertificateReplaySample)
  const officialCityEntrySamples = OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.filter(isOfficialCityEntryReplaySample)
  const publicEvidenceCertificateTypes = new Set(
    OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.map((sample) => sample.certificateType),
  )
  const namedPublicCertificateTypes = new Set(
    namedPublicSamples.map((sample) => sample.certificateType),
  )
  const namedPublicSamplesWithDocumentNumber = namedPublicSamples.filter((sample) => normalizeText(sample.evidenceDocumentNumber))
  const namedPublicSamplesWithIssuedAt = namedPublicSamples.filter((sample) => normalizeText(sample.evidenceIssuedAt))
  const weakOfficialSourceSamples = OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES
    .filter((sample) => !isTrustedOfficialUrl(sample.sourceUrl))
    .map((sample) => ({
      sampleKey: sample.sampleKey,
      sourceUrl: sample.sourceUrl,
    }))

  const coveredNamedCityProfiles = cityProfiles
    .filter((profile) => namedPublicSamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .map((profile) => ({
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode,
      cityName: profile.cityName,
    }))
  const coveredOfficialEntryCityProfiles = cityProfiles
    .filter((profile) => officialCityEntrySamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .map((profile) => ({
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode,
      cityName: profile.cityName,
    }))
  const cityProfilesNeedingNamedPublicSamples = cityProfiles
    .filter((profile) => !namedPublicSamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .map((profile) => ({
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode,
      cityName: profile.cityName,
      sourceUrls: profile.sourceUrls,
      calibrationNeed: 'named_public_land_or_planning_or_construction_permit_record' as const,
    }))

  return {
    reportCode: 'certificate_official_public_replay_coverage',
    seedScope: {
      provinceProfileCount: provinceProfiles.length,
      provinceCodes: provinceProfiles.map((profile) => profile.provinceCode),
      cityProfileCount: cityProfiles.length,
      certificateTypes,
    },
    publicEvidenceCoverage: {
      sampleCount: OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.length,
      coveredCertificateTypes: certificateTypes.filter((certificateType) => publicEvidenceCertificateTypes.has(certificateType)),
      missingCertificateTypes: certificateTypes.filter((certificateType) => !publicEvidenceCertificateTypes.has(certificateType)),
      weakOfficialSourceSamples,
      coveragePolicy: 'official_source_url_required_for_every_public_certificate_replay_sample' as const,
    },
    namedPublicCertificateCoverage: {
      sampleCount: namedPublicSamples.length,
      coveredCityProfileCount: coveredNamedCityProfiles.length,
      coveredCityProfiles: coveredNamedCityProfiles,
      coveredCertificateTypes: certificateTypes.filter((certificateType) => namedPublicCertificateTypes.has(certificateType)),
      missingCertificateTypes: certificateTypes.filter((certificateType) => !namedPublicCertificateTypes.has(certificateType)),
      structuredEvidenceFieldCoverage: {
        documentNumberSampleCount: namedPublicSamplesWithDocumentNumber.length,
        issuedAtSampleCount: namedPublicSamplesWithIssuedAt.length,
        missingDocumentNumberSampleKeys: namedPublicSamples
          .filter((sample) => !normalizeText(sample.evidenceDocumentNumber))
          .map((sample) => sample.sampleKey),
        missingIssuedAtSampleKeys: namedPublicSamples
          .filter((sample) => !normalizeText(sample.evidenceIssuedAt))
          .map((sample) => sample.sampleKey),
        coveragePolicy: 'named_public_certificate_records_should_carry_machine_checkable_document_number_and_issue_date_when_verified' as const,
      },
      coveragePolicy: 'named_public_certificate_records_are_precision_calibration_samples' as const,
    },
    officialCityEntryCoverage: {
      sampleCount: officialCityEntrySamples.length,
      coveredCityProfileCount: coveredOfficialEntryCityProfiles.length,
      coveredCityProfiles: coveredOfficialEntryCityProfiles,
      coveragePolicy: 'official_city_entries_anchor_source_discovery_but_do_not_replace_named_project_replay' as const,
    },
    calibrationQueues: {
      cityProfilesNeedingNamedPublicSamples,
    },
    calibrationPolicy: 'official_certificate_replay_uses_verified_named_records_and_city_entry_anchors_then_expands_by_city_queue' as const,
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return readRecord(parsed)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readProjectLocationFacts(project?: CertificateReplayProjectRow | null) {
  const metadata = readRecord(project?.metadata)
  const generationFacts = readRecord(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
  const projectFeatures = readRecord(generationFacts.projectFeatures ?? generationFacts.project_features)
  const metadataProjectFeatures = readRecord(metadata.projectFeatures ?? metadata.project_features)
  const candidates = [
    readRecord(generationFacts.locationFacts ?? generationFacts.location_facts),
    readRecord(projectFeatures.locationFacts ?? projectFeatures.location_facts),
    readRecord(metadata.wizard_location_facts),
    readRecord(metadata.locationFacts ?? metadata.location_facts),
    readRecord(metadataProjectFeatures.locationFacts ?? metadataProjectFeatures.location_facts),
  ]
  const locationFacts = candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {}
  return {
    provinceCode: normalizeText(
      locationFacts.provinceCode ??
      locationFacts.province_code ??
      locationFacts.province ??
      locationFacts.locationProvince ??
      locationFacts.location_province,
    ) || null,
    cityCode: normalizeText(
      locationFacts.cityCode ??
      locationFacts.city_code ??
      locationFacts.city ??
      locationFacts.locationCity ??
      locationFacts.location_city,
    ) || null,
  }
}

function normalizeCertificateType(row: CertificateReplayCertificateRow) {
  return normalizeText(row.certificate_type ?? row.milestone_type)
}

function isCompleteCertificate(row: CertificateReplayCertificateRow) {
  return COMPLETE_CERTIFICATE_STATUSES.has(normalizeComparableText(row.status))
}

function isCompleteWorkItem(row: CertificateReplayWorkItemRow) {
  return COMPLETE_WORK_ITEM_STATUSES.has(normalizeComparableText(row.status))
}

// workspace-isolation-system-job-approved: certificate policy replay is an offline cross-project calibration job and returns aggregate policy evidence.
async function runDefaultCertificatePolicyReplayQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized === 'select id, project_id, certificate_type, milestone_type, certificate_name, milestone_name, status, approving_authority, issuing_authority, updated_at from pre_milestones where status in (\'issued\', \'approved\') order by updated_at desc limit $1') {
      const result = await rawQuery(
        `SELECT id, project_id, certificate_type, milestone_type, certificate_name, milestone_name, status,
                approving_authority, issuing_authority, updated_at
         FROM pre_milestones
         WHERE status IN ('issued', 'approved')
         ORDER BY updated_at DESC
         LIMIT $1`,
        params as any[],
      )
    return result.rows as T[]
    }
    if (normalized === 'select id, location, metadata from projects where id = any($1::uuid[])') {
      const result = await rawQuery(
        `SELECT id, location, metadata
         FROM projects
         WHERE id = ANY($1::uuid[])`,
        params as any[],
      )
    return result.rows as T[]
    }
    if (normalized === 'select id, location from projects where id = any($1::uuid[])') {
      const result = await rawQuery(
        `SELECT id, location
         FROM projects
         WHERE id = ANY($1::uuid[])`,
        params as any[],
      )
    return result.rows as T[]
    }
    if (normalized === 'select id, project_id, item_code, item_name, status, approving_authority, is_shared, sort_order from certificate_work_items where project_id = any($1::uuid[])') {
      const result = await rawQuery(
        `SELECT id, project_id, item_code, item_name, status, approving_authority, is_shared, sort_order
         FROM certificate_work_items
         WHERE project_id = ANY($1::uuid[])`,
        params as any[],
      )
    return result.rows as T[]
    }
    if (normalized === 'select project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind from certificate_dependencies where project_id = any($1::uuid[])') {
      const result = await rawQuery(
        `SELECT project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind
         FROM certificate_dependencies
         WHERE project_id = ANY($1::uuid[])`,
        params as any[],
      )
    return result.rows as T[]
    }
  throw new Error('unapproved_certificate_policy_replay_calibration_sql')
}

function buildDefaultQueryRows(): QueryRows {
  return runDefaultCertificatePolicyReplayQuery
}

async function loadProjectRows(queryRows: QueryRows, projectIds: string[]) {
  if (projectIds.length === 0) return []
  try {
    return await queryRows<CertificateReplayProjectRow>(
      `SELECT id, location, metadata
       FROM projects
       WHERE id = ANY($1::uuid[])`,
      [projectIds],
    )
  } catch (error) {
    if (!String(error instanceof Error ? error.message : error).includes('metadata')) throw error
    return queryRows<CertificateReplayProjectRow>(
      `SELECT id, location
       FROM projects
       WHERE id = ANY($1::uuid[])`,
      [projectIds],
    )
  }
}

function collectLinkedWorkItems(params: {
  certificate: CertificateReplayCertificateRow
  workItemsById: Map<string, CertificateReplayWorkItemRow>
  dependencies: CertificateReplayDependencyRow[]
}) {
  const linkedIds = params.dependencies
    .filter((dependency) =>
      dependency.project_id === params.certificate.project_id &&
      dependency.predecessor_type === 'certificate' &&
      dependency.predecessor_id === params.certificate.id &&
      dependency.successor_type === 'work_item',
    )
    .map((dependency) => dependency.successor_id)

  return linkedIds
    .map((id) => params.workItemsById.get(id))
    .filter((item): item is CertificateReplayWorkItemRow => Boolean(item))
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
}

function collectActualReusableOutputs(params: {
  certificate: CertificateReplayCertificateRow
  certificatesById: Map<string, CertificateReplayCertificateRow>
  linkedWorkItems: CertificateReplayWorkItemRow[]
  dependencies: CertificateReplayDependencyRow[]
}) {
  const predecessorCertificateNames = params.dependencies
    .filter((dependency) =>
      dependency.project_id === params.certificate.project_id &&
      dependency.predecessor_type === 'certificate' &&
      dependency.successor_type === 'certificate' &&
      dependency.successor_id === params.certificate.id,
    )
    .map((dependency) => params.certificatesById.get(dependency.predecessor_id))
    .filter((certificate): certificate is CertificateReplayCertificateRow =>
      Boolean(certificate) && isCompleteCertificate(certificate),
    )
    .map((certificate) => certificate.certificate_name ?? certificate.milestone_name)

  const sharedWorkItemNames = params.linkedWorkItems
    .filter((item) => Boolean(item.is_shared) && isCompleteWorkItem(item))
    .map((item) => item.item_name)

  return uniqueStrings([...predecessorCertificateNames, ...sharedWorkItemNames])
}

function dominantAuthority(certificate: CertificateReplayCertificateRow, linkedWorkItems: CertificateReplayWorkItemRow[]) {
  const certificateAuthority = normalizeText(certificate.approving_authority ?? certificate.issuing_authority)
  if (certificateAuthority) return certificateAuthority

  const counts = new Map<string, { label: string; count: number }>()
  for (const item of linkedWorkItems) {
    const label = normalizeText(item.approving_authority)
    const key = normalizeComparableText(label)
    if (!key) continue
    const current = counts.get(key) ?? { label, count: 0 }
    current.count += 1
    counts.set(key, current)
  }
  return Array.from(counts.values()).sort((left, right) => right.count - left.count)[0]?.label ?? null
}

function expectedMaterialNames(preview: Awaited<ReturnType<PreviewBuilder>>, certificateType: string) {
  return uniqueStrings(
    preview.materialPackages
      .filter((materialPackage) => materialPackage.certificateTypes.some((type) => normalizeComparableText(type) === normalizeComparableText(certificateType)))
      .flatMap((materialPackage) => materialPackage.materialNames),
  )
}

function expectedReusableOutputNames(preview: Awaited<ReturnType<PreviewBuilder>>, certificateType: string) {
  return uniqueStrings(
    preview.materialEvidenceChains
      .filter((chain) => chain.reusableForCertificateTypes.some((type) => normalizeComparableText(type) === normalizeComparableText(certificateType)))
      .map((chain) => chain.outputDocument),
  )
}

function expectedAuthority(preview: Awaited<ReturnType<PreviewBuilder>>, certificateType: string) {
  return normalizeText(
    preview.certificates.find((certificate) =>
      normalizeComparableText(certificate.certificateType) === normalizeComparableText(certificateType),
    )?.approvingAuthority,
  ) || null
}

function toOfficialPublicReplayCalibrationSample(
  sample: OfficialPublicCertificateReplaySample,
): CertificatePolicyReplayCalibrationSample {
  const materialNames = sample.materialNames ?? []
  return {
    projectId: `official-public:${sample.sampleKey}`,
    provinceCode: sample.provinceCode,
    cityCode: sample.cityCode,
    certificateType: sample.certificateType,
    sampleSource: 'official_public_certificate_record',
    sampleGranularity: sample.sampleGranularity,
    evidenceScope: sample.evidenceScope,
    sourceUrl: sample.sourceUrl,
    evidenceDocumentNumber: sample.evidenceDocumentNumber,
    evidenceIssuedAt: sample.evidenceIssuedAt,
    expectedMaterialNames: materialNames,
    actualMaterialNames: materialNames,
    expectedAuthority: sample.authorityName,
    actualAuthority: sample.authorityName,
    expectedReusableOutputNames: sample.resultDocumentNames,
    actualReusableOutputNames: sample.resultDocumentNames,
  }
}

const OFFICIAL_PUBLIC_REPLAY_REPRESENTATIVE_CERTIFICATE_TYPES = [
  'land_certificate',
  'land_use_planning_permit',
  'engineering_planning_permit',
  'construction_permit',
]

function selectOfficialPublicCertificateReplaySamples(maxSamples: number) {
  if (maxSamples >= OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.length) {
    return OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.slice()
  }

  const selected: OfficialPublicCertificateReplaySample[] = []
  const selectedKeys = new Set<string>()
  const addSample = (sample?: OfficialPublicCertificateReplaySample) => {
    if (!sample || selectedKeys.has(sample.sampleKey) || selected.length >= maxSamples) return
    selectedKeys.add(sample.sampleKey)
    selected.push(sample)
  }

  for (const certificateType of OFFICIAL_PUBLIC_REPLAY_REPRESENTATIVE_CERTIFICATE_TYPES) {
    addSample(OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.find((sample) =>
      sample.certificateType === certificateType && isNamedPublicCertificateReplaySample(sample),
    ))
  }
  for (const certificateType of OFFICIAL_PUBLIC_REPLAY_REPRESENTATIVE_CERTIFICATE_TYPES) {
    addSample(OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES.find((sample) => sample.certificateType === certificateType))
  }
  for (const sample of OFFICIAL_PUBLIC_CERTIFICATE_REPLAY_SAMPLES) {
    addSample(sample)
  }

  return selected
}

export function collectOfficialPublicCertificateReplayCalibrationSamples(options: { maxSamples?: number } = {}) {
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_SAMPLE_LIMIT))
  return selectOfficialPublicCertificateReplaySamples(maxSamples)
    .map(toOfficialPublicReplayCalibrationSample)
}

export async function collectCertificatePolicyReplayCalibrationSamples(
  options: CollectCertificatePolicyReplayCalibrationSamplesOptions = {},
): Promise<CertificatePolicyReplayCalibrationSample[]> {
  if (!options.queryRows && options.systemJob !== true) {
    throw new Error('certificate policy replay requires systemJob capability for cross-project reads')
  }
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_SAMPLE_LIMIT))
  const queryRows = options.queryRows ?? buildDefaultQueryRows()
  const previewBuilder: PreviewBuilder = options.previewBuilder ?? buildCertificateTemplatePreview
  const includeOfficialPublicSamples = options.includeOfficialPublicSamples ?? true

  const certificateRows = await queryRows<CertificateReplayCertificateRow>(
    `SELECT id, project_id, certificate_type, milestone_type, certificate_name, milestone_name, status,
            approving_authority, issuing_authority, updated_at
     FROM pre_milestones
     WHERE status IN ('issued', 'approved')
     ORDER BY updated_at DESC
     LIMIT $1`,
    [maxSamples * 2],
  )
  const projectIds = uniqueStrings(certificateRows.map((row) => row.project_id))
  if (projectIds.length === 0) {
    return includeOfficialPublicSamples
      ? collectOfficialPublicCertificateReplayCalibrationSamples({ maxSamples })
      : []
  }

  const [projects, workItems, dependencies] = await Promise.all([
    loadProjectRows(queryRows, projectIds),
    queryRows<CertificateReplayWorkItemRow>(
      `SELECT id, project_id, item_code, item_name, status, approving_authority, is_shared, sort_order
       FROM certificate_work_items
       WHERE project_id = ANY($1::uuid[])`,
      [projectIds],
    ),
    queryRows<CertificateReplayDependencyRow>(
      `SELECT project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind
       FROM certificate_dependencies
       WHERE project_id = ANY($1::uuid[])`,
      [projectIds],
    ),
  ])

  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const workItemsById = new Map(workItems.map((item) => [item.id, item]))
  const certificatesById = new Map(certificateRows.map((certificate) => [certificate.id, certificate]))
  const previewByProjectId = new Map<string, Awaited<ReturnType<PreviewBuilder>> | null>()
  const samples: CertificatePolicyReplayCalibrationSample[] = []

  for (const certificate of certificateRows) {
    if (samples.length >= maxSamples) break
    const certificateType = normalizeCertificateType(certificate)
    if (!certificateType || !isCompleteCertificate(certificate)) continue

    if (!previewByProjectId.has(certificate.project_id)) {
      try {
        previewByProjectId.set(certificate.project_id, await previewBuilder(certificate.project_id))
      } catch {
        previewByProjectId.set(certificate.project_id, null)
      }
    }
    const preview = previewByProjectId.get(certificate.project_id)
    if (!preview) continue

    const expectedMaterials = expectedMaterialNames(preview, certificateType)
    const expectedAuthorityName = expectedAuthority(preview, certificateType)
    const expectedReusableOutputs = expectedReusableOutputNames(preview, certificateType)
    if (expectedMaterials.length === 0 && !expectedAuthorityName && expectedReusableOutputs.length === 0) continue

    const linkedWorkItems = collectLinkedWorkItems({ certificate, workItemsById, dependencies })
    const actualMaterials = uniqueStrings(
      linkedWorkItems
        .filter(isCompleteWorkItem)
        .map((item) => item.item_name),
    )
    const projectLocationFacts = readProjectLocationFacts(projectsById.get(certificate.project_id))

    samples.push({
      projectId: certificate.project_id,
      provinceCode: preview.provinceProfile?.provinceCode ?? projectLocationFacts.provinceCode,
      cityCode: preview.cityOverride?.cityCode ?? projectLocationFacts.cityCode,
      certificateType,
      expectedMaterialNames: expectedMaterials,
      actualMaterialNames: actualMaterials,
      expectedAuthority: expectedAuthorityName,
      actualAuthority: dominantAuthority(certificate, linkedWorkItems),
      expectedReusableOutputNames: expectedReusableOutputs,
      actualReusableOutputNames: collectActualReusableOutputs({
        certificate,
        certificatesById,
        linkedWorkItems,
        dependencies,
      }),
    })
  }

  if (includeOfficialPublicSamples && samples.length < maxSamples) {
    const existingProjectIds = new Set(samples.map((sample) => sample.projectId))
    for (const sample of collectOfficialPublicCertificateReplayCalibrationSamples({ maxSamples })) {
      if (samples.length >= maxSamples) break
      if (existingProjectIds.has(sample.projectId)) continue
      samples.push(sample)
    }
  }

  return samples
}
