import { query as rawQuery } from '../database.js'
import { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } from '../seeds/acceptanceTimelineTemplateSeed.js'
import { buildAcceptanceTemplatePreview } from './acceptanceTemplateService.js'
import type { AcceptancePolicyReplayCalibrationSample } from './acceptanceTemplatePolicyUpdateService.js'

type QueryRows = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>

interface AcceptancePolicyReplayPreview {
  regionProfile?: { provinceCode?: string | null; cityCode?: string | null } | null
  items: Array<{
    itemCode: string
    canonicalType?: string | null
    itemName: string
    authority?: string | null
    resultDocuments: string[]
  }>
}

type PreviewBuilder = (projectId: string) => Promise<AcceptancePolicyReplayPreview>

interface AcceptanceReplayProjectRow {
  id: string
  location?: string | null
  metadata?: unknown
}

interface AcceptanceReplayPlanRow {
  id: string
  project_id: string
  type_id?: string | null
  type_name?: string | null
  acceptance_type?: string | null
  acceptance_name?: string | null
  plan_name?: string | null
  status?: string | null
  inspection_authority?: string | null
  updated_at?: string | null
}

interface AcceptanceReplayRequirementRow {
  id: string
  project_id: string
  plan_id: string
  requirement_type?: string | null
  source_entity_type?: string | null
  source_entity_id?: string | null
  description?: string | null
  status?: string | null
  is_satisfied?: boolean | null
}

export interface CollectAcceptancePolicyReplayCalibrationSamplesOptions {
  maxSamples?: number
  queryRows?: QueryRows
  previewBuilder?: PreviewBuilder
  includeOfficialPublicSamples?: boolean
  systemJob?: boolean
}

const DEFAULT_SAMPLE_LIMIT = 80
const COMPLETE_ACCEPTANCE_STATUSES = new Set(['passed', 'archived'])
const COMPLETE_REQUIREMENT_STATUSES = new Set(['met', 'closed'])
const DEFAULT_REGION_PROFILE_KEY = 'default:province'

export interface OfficialPublicAcceptanceReplaySample {
  sampleKey: string
  provinceCode: string
  cityCode: string
  cityName: string
  businessTypeCode: string
  projectName: string
  sourceName: string
  sourceUrl: string
  evidenceScope:
    | 'completion_filing_occurrence_check'
    | 'completion_acceptance_occurrence_check'
    | 'joint_acceptance_occurrence_check'
    | 'joint_acceptance_and_completion_filing_occurrence_check'
    | 'specialty_acceptance_occurrence_check'
    | 'operation_specialty_occurrence_check'
    | 'delivery_acceptance_occurrence_check'
  sampleGranularity?: 'named_public_project' | 'official_city_entry'
  actualItemCodes: string[]
  actualItemNames: string[]
  resultDocumentNames: string[]
  authorityName: string
}

export const OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES: OfficialPublicAcceptanceReplaySample[] = [
  {
    sampleKey: 'SZ:industrial-factory-completion-filing',
    provinceCode: 'GD',
    cityCode: 'SZ',
    cityName: '深圳市',
    businessTypeCode: 'industrial',
    projectName: '深圳市厂房竣工验收备案公开项目样本',
    sourceName: '深圳市住房和建设局竣工验收备案结果公开',
    sourceUrl: 'https://zjj.sz.gov.cn/projreg/public/jgys/jgysList.jsp',
    evidenceScope: 'completion_filing_occurrence_check',
    actualItemCodes: ['completion_filing', 'fire_acceptance', 'archive_acceptance'],
    actualItemNames: ['竣工验收备案', '消防验收', '城建档案验收'],
    resultDocumentNames: ['竣工验收备案表', '消防验收意见书', '城建档案验收认可文件'],
    authorityName: '深圳市住房和建设主管部门',
  },
  {
    sampleKey: 'SZ:industrial-xiaomo-auto-park-factory-completion-filing-202606',
    provinceCode: 'GD',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    businessTypeCode: 'industrial',
    projectName: 'Shenshan Xiaomo auto industrial park plot X2022-0002 C area building 1 factory and building 13 completion filing',
    sourceName: 'Shenzhen housing-construction completion acceptance public result list',
    sourceUrl: 'https://zjj.sz.gov.cn/projreg/webService/getJgysLogList.json',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record M07M00112605280001'],
    authorityName: 'Shenzhen housing and construction authority',
  },
  {
    sampleKey: 'SZ:school-mingde-bihai-comprehensive-building-archive-acceptance-202502',
    provinceCode: 'GD',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    businessTypeCode: 'school',
    projectName: 'Mingde Experimental School Bihai campus new comprehensive building archive receiving',
    sourceName: 'Shenzhen Housing and Construction Bureau Urban Construction Archives February 2025 receiving public notice',
    sourceUrl: 'https://zjj.sz.gov.cn/xxgk/ztzl/cjdafw/jsgs/content/post_12070642.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive receiving / archive acceptance'],
    resultDocumentNames: [
      'Shenzhen Urban Construction Archives February 2025 construction archive receiving public row for Mingde Experimental School Bihai campus new comprehensive building project',
    ],
    authorityName: 'Shenzhen Housing and Construction Bureau / Shenzhen Urban Construction Archives',
  },
  {
    sampleKey: 'SZ:industrial-haijixing-guangming-logistics-park-archive-acceptance-202508',
    provinceCode: 'GD',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    businessTypeCode: 'industrial',
    projectName: 'Haijixing agricultural products Guangming logistics park archive receiving',
    sourceName: 'Shenzhen Housing and Construction Bureau Urban Construction Archives August 2025 receiving public notice',
    sourceUrl: 'https://zjj.sz.gov.cn/xxgk/ztzl/cjdafw/jsgs/content/post_12363084.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive receiving / archive acceptance'],
    resultDocumentNames: [
      'Shenzhen Urban Construction Archives August 2025 construction archive receiving public row for Haijixing agricultural products Guangming logistics park',
    ],
    authorityName: 'Shenzhen Housing and Construction Bureau / Shenzhen Urban Construction Archives',
  },
  {
    sampleKey: 'SZ:general-civil-china-merchants-bank-headquarters-archive-acceptance-202604',
    provinceCode: 'GD',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    businessTypeCode: 'general_civil',
    projectName: 'China Merchants Bank headquarters building archive receiving',
    sourceName: 'Shenzhen Housing and Construction Bureau Urban Construction Archives April 2026 receiving public notice',
    sourceUrl: 'https://zjj.sz.gov.cn/xxgk/ztzl/cjdafw/jsgs/content/post_12766498.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive receiving / archive acceptance'],
    resultDocumentNames: [
      'Shenzhen Urban Construction Archives April 2026 construction archive receiving public row for China Merchants Bank headquarters building',
    ],
    authorityName: 'Shenzhen Housing and Construction Bureau / Shenzhen Urban Construction Archives',
  },
  {
    sampleKey: 'SZ:hospital-yantian-fever-clinic-building-archive-acceptance-202604',
    provinceCode: 'GD',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    businessTypeCode: 'hospital',
    projectName: 'Yantian District People Hospital fever-clinic building and supporting facilities archive receiving',
    sourceName: 'Shenzhen Housing and Construction Bureau Urban Construction Archives April 2026 receiving public notice',
    sourceUrl: 'https://zjj.sz.gov.cn/xxgk/ztzl/cjdafw/jsgs/content/post_12766498.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive receiving / archive acceptance'],
    resultDocumentNames: [
      'Shenzhen Urban Construction Archives April 2026 construction archive receiving public row for Yantian District People Hospital fever-clinic building and supporting facilities project',
    ],
    authorityName: 'Shenzhen Housing and Construction Bureau / Shenzhen Urban Construction Archives',
  },
  {
    sampleKey: 'SZ:school-liulian-primary-school-expansion-archive-acceptance-202505',
    provinceCode: 'GD',
    cityCode: 'shenzhen',
    cityName: 'Shenzhen',
    businessTypeCode: 'school',
    projectName: 'Liulian primary school expansion construction general contract archive receiving',
    sourceName: 'Shenzhen Housing and Construction Bureau Urban Construction Archives May 2025 receiving public notice',
    sourceUrl: 'https://zjj.sz.gov.cn/xxgk/ztzl/cjdafw/jsgs/content/post_12223857.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive receiving / archive acceptance'],
    resultDocumentNames: [
      'Shenzhen Urban Construction Archives May 2025 construction archive receiving public row for Liulian primary school expansion construction general contract project',
    ],
    authorityName: 'Shenzhen Housing and Construction Bureau / Shenzhen Urban Construction Archives',
  },
  {
    sampleKey: 'BJ:hotel-public-assembly-fire-safety',
    provinceCode: 'BJ',
    cityCode: 'BJ',
    cityName: '北京市',
    businessTypeCode: 'hotel',
    projectName: '北京酒店公众聚集场所投入使用前消防安全检查公开样本',
    sourceName: '北京市建设工程消防验收和公众聚集场所投入使用、营业前消防安全检查协同办理口径',
    sourceUrl: 'https://www.beijing.gov.cn/zhengce/zhengcefagui/202604/t20260409_4577704.html',
    evidenceScope: 'operation_specialty_occurrence_check',
    actualItemCodes: ['public_assembly_fire_safety_check', 'fire_acceptance'],
    actualItemNames: ['公众聚集场所消防安全检查', '消防验收'],
    resultDocumentNames: ['公众聚集场所投入使用、营业前消防安全检查意见书', '消防验收意见书'],
    authorityName: '消防救援机构',
  },
  {
    sampleKey: 'SH:commercial-office-completion-filing',
    provinceCode: 'SH',
    cityCode: 'SH',
    cityName: '上海市',
    businessTypeCode: 'general_civil',
    projectName: '上海办公项目竣工验收备案公开服务样本',
    sourceName: '上海一网通办建设工程竣工验收备案服务指南',
    sourceUrl: 'https://zwdt.sh.gov.cn/govPortals/bsfw/item/5dfbcfce-5f6c-460b-a4c0-ee011474de49',
    evidenceScope: 'completion_filing_occurrence_check',
    actualItemCodes: ['completion_filing', 'comprehensive_acceptance'],
    actualItemNames: ['建设工程竣工验收备案', '综合竣工验收'],
    resultDocumentNames: ['建设工程竣工验收备案凭证', '综合竣工验收合格通知书'],
    authorityName: '上海市住房和城乡建设管理部门',
  },
  {
    sampleKey: 'GZ:general-civil-joint-acceptance',
    provinceCode: 'GD',
    cityCode: 'GZ',
    cityName: '广州市',
    businessTypeCode: 'general_civil',
    projectName: '广州工程建设项目联合验收公开服务样本',
    sourceName: '广州市工程建设项目竣工联合验收办事指南',
    sourceUrl: 'https://www.thnet.gov.cn/zwgk/zdjsxmpzhss/jgygxx/content/post_10179949.html',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'archive_acceptance'],
    actualItemNames: ['联合验收', '竣工验收备案', '城建档案验收'],
    resultDocumentNames: ['联合验收意见书', '竣工验收备案表', '建设工程档案验收认可文件'],
    authorityName: '工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'GZ:school-huanan-normal-knowledge-city-completion-filing-202606',
    provinceCode: 'GD',
    cityCode: 'GZ',
    cityName: 'Guangzhou',
    businessTypeCode: 'school',
    projectName: 'Huanan Normal University Affiliated High School Knowledge City campus B1 teaching-library building completion filing',
    sourceName: 'Guangzhou housing-construction project completion acceptance public information list',
    sourceUrl: 'https://zfcj.gz.gov.cn/ysqgk/Api/WebApi/gcjgysxxlb.ashx',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing'],
    actualItemNames: ['Joint acceptance', 'Completion filing'],
    resultDocumentNames: [
      'Joint acceptance opinion Sui joint acceptance Huangpu 2026-121',
      'Completion filing record Sui Huangpu construction acceptance filing 2026-121',
    ],
    authorityName: 'Guangzhou Development District Construction Bureau / Huangpu District Housing and Construction Bureau',
  },
  {
    sampleKey: 'JN:residential-heat-completion-filing',
    provinceCode: 'SD',
    cityCode: 'JN',
    cityName: '济南市',
    businessTypeCode: 'general_civil',
    projectName: '济南住宅项目供热和联合验收公开服务样本',
    sourceName: '济南市建设项目联合验收一件事服务指南',
    sourceUrl: 'https://zwfw.jinan.gov.cn/col125392/art/2025/art_125392_1285.html',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'heat_supply_acceptance', 'completion_filing'],
    actualItemNames: ['联合验收', '供热接入确认', '竣工验收备案'],
    resultDocumentNames: ['联合验收意见书', '供热接入确认文件', '竣工验收备案表'],
    authorityName: '济南市联合验收牵头部门',
  },
  {
    sampleKey: 'CD:hospital-health-security',
    provinceCode: 'SC',
    cityCode: 'CD',
    cityName: '成都市',
    businessTypeCode: 'hospital',
    projectName: '成都医院项目卫生疾控和条件专项公开服务样本',
    sourceName: '成都市工程建设项目联合验收一件事服务专区',
    sourceUrl: 'https://cds.sczwfw.gov.cn/wwdt/epointcdzwfw/pages/lhyjs/index',
    evidenceScope: 'operation_specialty_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'health_acceptance', 'national_security_acceptance'],
    actualItemNames: ['联合验收', '卫生疾控专项核验', '国家安全事项验收'],
    resultDocumentNames: ['联合验收意见书', '卫生专项核验意见', '国家安全事项验收意见'],
    authorityName: '成都市联合验收牵头部门',
  },
  {
    sampleKey: 'SU:school-health-sanitation',
    provinceCode: 'JS',
    cityCode: 'SZ',
    cityName: '苏州市',
    businessTypeCode: 'school',
    projectName: '苏州学校项目卫生和环卫条件公开服务样本',
    sourceName: '江苏省工程建设项目审批制度改革和联合验收服务口径',
    sourceUrl: 'https://www.jiangsu.gov.cn/',
    evidenceScope: 'operation_specialty_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'health_acceptance', 'sanitation_facility_acceptance'],
    actualItemNames: ['竣工联合验收', '卫生专项核验', '环卫设施验收'],
    resultDocumentNames: ['联合验收意见书', '卫生专项核验意见', '环卫设施验收意见'],
    authorityName: '苏州市联合验收牵头部门',
  },
  {
    sampleKey: 'SUZ:transportation-suzhou-rail-line-2-extension-civil-completion-filing-201812',
    provinceCode: 'JS',
    cityCode: 'suzhou',
    cityName: 'Suzhou',
    businessTypeCode: 'transportation_hub',
    projectName: 'Suzhou rail transit line 2 extension civil construction lot II-Y-TS-05 completion filing',
    sourceName: 'Suzhou housing and urban-rural construction bureau major construction project completion filing page',
    sourceUrl: 'https://zfcjj.suzhou.gov.cn/szszjj/zdjsxm/201812/7aafc257d0474d399ef8b963d3eb295a.shtml',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record 3205011208090105-JX-004'],
    authorityName: 'Suzhou housing and urban-rural construction authority / construction quality and safety supervision station',
  },
  {
    sampleKey: 'QD:data-center-utility-completion',
    provinceCode: 'SD',
    cityCode: 'QD',
    cityName: '青岛市',
    businessTypeCode: 'data_center',
    projectName: '青岛数据中心市政和通信接入公开服务样本',
    sourceName: '青岛市工程建设项目联合竣工验收服务口径',
    sourceUrl: 'https://www.qingdao.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'power_acceptance', 'telecom_acceptance', 'drainage_acceptance'],
    actualItemNames: ['联合竣工验收', '供电接入确认', '通信接入验收', '排水接入验收'],
    resultDocumentNames: ['联合验收意见书', '供电接入确认文件', '通信设施移交确认文件', '排水接入确认文件'],
    authorityName: '青岛市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'CQ:transportation-hub-traffic-fire',
    provinceCode: 'CQ',
    cityCode: 'CQ',
    cityName: '重庆市',
    businessTypeCode: 'transportation_hub',
    projectName: '重庆交通枢纽交通接驳和公众聚集消防公开服务样本',
    sourceName: '重庆市工程建设项目竣工联合验收服务口径',
    sourceUrl: 'https://www.cq.gov.cn/',
    evidenceScope: 'operation_specialty_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'traffic_access_acceptance', 'public_assembly_fire_safety_check'],
    actualItemNames: ['竣工联合验收', '交通接驳核验', '公众聚集场所消防安全检查'],
    resultDocumentNames: ['联合验收意见书', '交通接驳核验意见', '公众聚集场所消防安全检查意见书'],
    authorityName: '重庆市联合验收牵头部门',
  },
  {
    sampleKey: 'FZ:sports-culture-public-assembly',
    provinceCode: 'FJ',
    cityCode: 'FZ',
    cityName: '福州市',
    businessTypeCode: 'sports_culture',
    projectName: '福州体育文化建筑公众聚集场所公开服务样本',
    sourceName: '福州市工程建设项目联合验收政策材料',
    sourceUrl: 'https://www.fuzhou.gov.cn/zgfzzt/shfgfgg/18zb/hdjycsyszfw/yszc/202204/P020220425424596560586.pdf',
    evidenceScope: 'operation_specialty_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'traffic_access_acceptance', 'public_assembly_fire_safety_check', 'sanitation_facility_acceptance'],
    actualItemNames: ['工程建设项目联合验收', '交通组织核验', '公众聚集场所消防安全检查', '环卫设施验收'],
    resultDocumentNames: ['联合验收意见书', '交通组织核验意见', '公众聚集场所消防安全检查意见书', '环卫设施验收意见'],
    authorityName: '福州市联合验收牵头部门',
  },
  {
    sampleKey: 'GZ:tod-upper-cover-traffic-telecom',
    provinceCode: 'GD',
    cityCode: 'GZ',
    cityName: '广州市',
    businessTypeCode: 'tod_upper_cover',
    projectName: '广州 TOD 上盖项目交通和通信接口公开服务样本',
    sourceName: '广东省及广州市工程建设项目联合验收办事服务口径',
    sourceUrl: 'https://www.gd.gov.cn/',
    evidenceScope: 'operation_specialty_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'traffic_access_acceptance', 'telecom_acceptance'],
    actualItemNames: ['联合验收', '交通接口核验', '通信接入验收'],
    resultDocumentNames: ['联合验收意见书', '交通接口核验意见', '通信设施移交确认文件'],
    authorityName: '广州市联合验收牵头部门',
  },
  {
    sampleKey: 'BJ:renovation-fire-energy',
    provinceCode: 'BJ',
    cityCode: 'BJ',
    cityName: '北京市',
    businessTypeCode: 'renovation',
    projectName: '北京改造修缮项目消防和节能验收公开服务样本',
    sourceName: '北京市建设项目联合验收一件事办事指南',
    sourceUrl: 'https://banshi.beijing.gov.cn/pubtask/bhyjs/jsxmlhys/bszn.pdf',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['fire_acceptance', 'energy_acceptance', 'archive_acceptance'],
    actualItemNames: ['消防验收', '节能验收', '城建档案验收'],
    resultDocumentNames: ['消防验收意见书', '建筑节能专项验收资料', '城建档案验收认可文件'],
    authorityName: '北京市联合验收牵头部门',
  },
  {
    sampleKey: 'ZS:modular-building-delivery',
    provinceCode: 'GD',
    cityCode: 'ZS',
    cityName: '中山市',
    businessTypeCode: 'modular_building',
    projectName: '中山模块化建筑交付备案公开服务样本',
    sourceName: '中山市工程建设项目联合验收一件事服务口径',
    sourceUrl: 'https://www.zs.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'delivery_filing'],
    actualItemNames: ['联合验收一件事', '竣工验收备案', '交付条件备案'],
    resultDocumentNames: ['联合验收意见书', '竣工验收备案表', '交付条件确认文件'],
    authorityName: '中山市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'ZS:industrial-huaxing-park-factory-13-joint-acceptance-202504',
    provinceCode: 'GD',
    cityCode: 'ZS',
    cityName: 'Zhongshan',
    businessTypeCode: 'industrial',
    projectName: 'Huaxing industrial park factory building 13 joint completion acceptance and completion filing',
    sourceName: 'Zhongshan housing and urban-rural construction bureau April 2025 administrative licensing public list',
    sourceUrl: 'https://www.zs.gov.cn/attachment/0/542/542112/2530168.pdf',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'fire_acceptance'],
    actualItemNames: ['Joint completion acceptance', 'Completion filing', 'Fire acceptance'],
    resultDocumentNames: [
      'Zhongshan building and municipal infrastructure completion joint acceptance opinion Zhongjian Lianyan Zi 2025 No. 580',
      'Zhongshan building and municipal infrastructure completion joint acceptance opinion Zhongjian Lianyan Zi 2025 No. 580',
      'Construction project fire acceptance opinion Zhongjian Xiaoyan Zi 2025 No. 127',
    ],
    authorityName: 'Zhongshan housing and urban-rural construction bureau',
  },
  {
    sampleKey: 'HZ:general-civil-joint-acceptance',
    provinceCode: 'ZJ',
    cityCode: 'hangzhou',
    cityName: '杭州市',
    businessTypeCode: 'general_civil',
    projectName: '杭州房建项目联合验收公开服务样本',
    sourceName: '浙江省工程建设项目审批制度改革和联合验收治理入口',
    sourceUrl: 'https://www.zj.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'landscape_acceptance'],
    actualItemNames: ['工程建设项目联合验收', '竣工验收备案', '园林绿化验收'],
    resultDocumentNames: ['联合验收意见书', '竣工验收备案表', '绿化工程竣工验收意见'],
    authorityName: '杭州市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'NJ:general-civil-completion-filing',
    provinceCode: 'JS',
    cityCode: 'nanjing',
    cityName: '南京市',
    businessTypeCode: 'general_civil',
    projectName: '南京房建项目竣工联合验收公开服务样本',
    sourceName: '江苏省工程建设项目审批制度改革和联合验收服务入口',
    sourceUrl: 'https://www.jiangsu.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'archive_acceptance'],
    actualItemNames: ['竣工联合验收', '竣工验收备案', '城建档案验收'],
    resultDocumentNames: ['联合验收意见书', '竣工验收备案表', '建设工程档案验收认可文件'],
    authorityName: '南京市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'NJ:industrial-huadian-technology-park-completion-filing-202312',
    provinceCode: 'JS',
    cityCode: 'nanjing',
    cityName: 'Nanjing',
    businessTypeCode: 'industrial',
    projectName: 'Nanjing Huadong Electronics Huadian Technology Park plot 01 completion filing',
    sourceName: 'Nanjing Qixia District construction completion filing public notice',
    sourceUrl: 'https://www.njqxq.gov.cn/qxqrmzf/202312/t20231229_4135312.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Completion filing record Ning Bei Zi 32011320230301'],
    authorityName: 'Nanjing Qixia District housing and construction bureau',
  },
  {
    sampleKey: 'WH:general-civil-joint-acceptance',
    provinceCode: 'HB',
    cityCode: 'wuhan',
    cityName: '武汉市',
    businessTypeCode: 'general_civil',
    projectName: '武汉工程建设项目联合验收公开服务样本',
    sourceName: '湖北省工程建设项目审批制度改革和联合验收服务入口',
    sourceUrl: 'https://www.hubei.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'sponge_city_acceptance'],
    actualItemNames: ['工程建设项目联合验收', '竣工验收备案', '海绵城市专项核验'],
    resultDocumentNames: ['联合验收意见书', '竣工验收备案表', '海绵城市专项核验意见'],
    authorityName: '武汉市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'XA:general-civil-heat-completion',
    provinceCode: 'SN',
    cityCode: 'xian',
    cityName: '西安市',
    businessTypeCode: 'general_civil',
    projectName: '西安房建项目供热和竣工备案公开服务样本',
    sourceName: '陕西省工程建设项目审批制度改革和联合验收服务入口',
    sourceUrl: 'https://www.shaanxi.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'heat_supply_acceptance', 'completion_filing'],
    actualItemNames: ['联合验收', '供热接入确认', '竣工验收备案'],
    resultDocumentNames: ['联合验收意见书', '供热接入确认文件', '竣工验收备案表'],
    authorityName: '西安市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'TJ:general-civil-heat-gas-completion',
    provinceCode: 'TJ',
    cityCode: 'tianjin',
    cityName: '天津市',
    businessTypeCode: 'general_civil',
    projectName: '天津工程建设项目联合验收公开服务样本',
    sourceName: '天津市工程建设项目审批制度改革和联合验收服务入口',
    sourceUrl: 'https://www.tj.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'heat_supply_acceptance', 'gas_acceptance', 'completion_filing'],
    actualItemNames: ['工程建设项目联合验收', '供热接入确认', '燃气接入验收', '竣工验收备案'],
    resultDocumentNames: ['联合验收意见书', '供热接入确认文件', '燃气接入确认文件', '竣工验收备案表'],
    authorityName: '天津市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'XM:general-civil-joint-acceptance',
    provinceCode: 'FJ',
    cityCode: 'xiamen',
    cityName: '厦门市',
    businessTypeCode: 'general_civil',
    projectName: '厦门工程建设项目联合验收公开服务样本',
    sourceName: '福建省工程建设项目联合验收政策与服务入口',
    sourceUrl: 'https://www.fujian.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'traffic_access_acceptance'],
    actualItemNames: ['工程建设项目联合验收', '竣工验收备案', '交通接驳核验'],
    resultDocumentNames: ['联合验收意见书', '竣工验收备案表', '交通接驳核验意见'],
    authorityName: '厦门市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'XM:industrial-tianma-display-line-8-6-completion-filing-202505',
    provinceCode: 'FJ',
    cityCode: 'xiamen',
    cityName: 'Xiamen',
    businessTypeCode: 'industrial',
    projectName: 'Xiamen Tianma Optoelectronics 8.6-generation display panel production line general contract lot 1 completion filing',
    sourceName: 'Xiamen housing and construction bureau May 6-9 2025 completion filing result notice',
    sourceUrl: 'https://szjj.xm.gov.cn/zwgk/tzgg/202505/t20250513_2932643.htm',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing certificate 350200202505094725'],
    authorityName: 'Xiamen housing and construction bureau / Xiamen construction quality and safety station',
  },
  {
    sampleKey: 'WZ:hospital-wenzhou-development-zone-hospital-renovation-completion-filing-202505',
    provinceCode: 'ZJ',
    cityCode: 'wenzhou',
    cityName: 'Wenzhou',
    businessTypeCode: 'hospital',
    projectName: 'Wenzhou Economic and Technological Development Zone Central Hospital renovation and expansion completion filing',
    sourceName: 'Wenzhou development-zone hospital construction completion filing form',
    sourceUrl: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web1826/site/attach/0/c9487db7d58a4a18a4c955d7db4a88f4.pdf',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record 32501120250513101'],
    authorityName: 'Wenzhou Economic and Technological Development Zone administrative approval bureau',
  },
  {
    sampleKey: 'HF:industrial-gongtou-chuangzhi-a5-1-factory-archive-acceptance-202506',
    provinceCode: 'AH',
    cityCode: 'hefei',
    cityName: 'Hefei',
    businessTypeCode: 'industrial',
    projectName: 'Gongtou Chuangzhi Tiandi A5-1 factory construction archive acceptance opinion',
    sourceName: 'Anhui construction drawing review joint platform Hefei construction-project archive acceptance opinion issuance announcement',
    sourceUrl: 'https://anhuitushen.com/xinxigongshi/217.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive acceptance'],
    resultDocumentNames: [
      'Hefei construction-project archive acceptance opinion certificate No. 20251129 for Gongtou Chuangzhi Tiandi A5-1 factory',
    ],
    authorityName: 'Hefei urban construction archive authority / housing-construction archive acceptance authority',
  },
  {
    sampleKey: 'HF:general-civil-utility-completion',
    provinceCode: 'AH',
    cityCode: 'hefei',
    cityName: '合肥市',
    businessTypeCode: 'general_civil',
    projectName: '合肥工程建设项目市政和竣工备案公开服务样本',
    sourceName: '安徽省工程建设项目审批制度改革和联合验收服务入口',
    sourceUrl: 'https://www.ah.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'water_supply_acceptance', 'power_acceptance', 'completion_filing'],
    actualItemNames: ['工程建设项目联合验收', '供水接入确认', '供电接入确认', '竣工验收备案'],
    resultDocumentNames: ['联合验收意见书', '供水接入确认文件', '供电接入确认文件', '竣工验收备案表'],
    authorityName: '合肥市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'ZZ:general-civil-utility-completion',
    provinceCode: 'HA',
    cityCode: 'zhengzhou',
    cityName: '郑州市',
    businessTypeCode: 'general_civil',
    projectName: '郑州工程建设项目联合验收公开服务样本',
    sourceName: '河南省工程建设项目联合验收一件事服务入口',
    sourceUrl: 'https://www.henan.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'gas_acceptance', 'completion_filing'],
    actualItemNames: ['建设项目联合验收一件事', '燃气接入验收', '竣工验收备案'],
    resultDocumentNames: ['联合验收意见书', '燃气接入确认文件', '竣工验收备案表'],
    authorityName: '郑州市工程建设项目联合验收牵头部门',
  },
  {
    sampleKey: 'NB:general-civil-joint-acceptance-replay',
    provinceCode: 'ZJ',
    cityCode: 'ningbo',
    cityName: 'Ningbo',
    businessTypeCode: 'general_civil',
    projectName: 'Ningbo public construction-project joint-acceptance replay sample',
    sourceName: 'Ningbo housing-construction / government-service joint-acceptance public service entry',
    sourceUrl: 'https://zjw.ningbo.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'planning_acceptance', 'archive_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Planning verification', 'Urban construction archive acceptance'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Planning verification opinion', 'Archive acceptance document'],
    authorityName: 'Ningbo joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'WX:general-civil-joint-acceptance-replay',
    provinceCode: 'JS',
    cityCode: 'wuxi',
    cityName: 'Wuxi',
    businessTypeCode: 'general_civil',
    projectName: 'Guanshan Mingzhu Block C delivery-use completion acceptance public notice',
    sourceName: 'Wuxi housing-construction Guanshan Mingzhu Block C delivery-use completion acceptance notice',
    sourceUrl: 'https://js.wuxi.gov.cn/doc/2021/08/27/3445839.shtml',
    evidenceScope: 'delivery_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['delivery_filing', 'planning_acceptance', 'fire_acceptance', 'landscape_acceptance', 'power_acceptance', 'water_supply_acceptance'],
    actualItemNames: ['Delivery-use completion acceptance', 'Planning acceptance', 'Fire acceptance', 'Landscape acceptance', 'Power acceptance', 'Municipal utility acceptance'],
    resultDocumentNames: ['Delivery-use completion acceptance notice', 'Planning acceptance document', 'Fire acceptance opinion', 'Landscape acceptance document', 'Power supply acceptance document', 'Municipal utility acceptance document'],
    authorityName: 'Wuxi joint-acceptance lead authority',
  },
  {
    sampleKey: 'WX:industrial-huishan-energy-storage-manufacturing-hq-completion-filing-202511',
    provinceCode: 'JS',
    cityCode: 'wuxi',
    cityName: 'Wuxi',
    businessTypeCode: 'industrial',
    projectName: 'Jiangsu Nengdian energy-storage and hybrid-energy system R&D manufacturing headquarters project completion filing',
    sourceName: 'Wuxi Huishan District Housing and Urban-Rural Construction Bureau November 2025 completion filing project table',
    sourceUrl: 'https://www.huishan.gov.cn/uploadfiles/202512/02/2025120209333394639541.xlsx',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: [
      'Completion filing project table row with filing No. 25076, quality-supervision No. 202400710322-327, filing date 2025-11-12, construction unit, contractor, project name, location, and floor area',
    ],
    authorityName: 'Wuxi Huishan District Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'CZ:general-civil-hubin-jiayuan-phase2-delivery-filing-202110',
    provinceCode: 'JS',
    cityCode: 'changzhou',
    cityName: 'Changzhou',
    businessTypeCode: 'general_civil',
    projectName: 'Hubin Jiayuan phase 2 commodity housing delivery-use filing notice',
    sourceName: 'Changzhou Wujin District People Government commodity housing delivery-use filing notice No. 2021-026',
    sourceUrl: 'https://www.wj.gov.cn/html/czwj/2021/BCPPQENA_1104/69127.html',
    evidenceScope: 'delivery_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: [
      'delivery_filing',
      'completion_filing',
      'planning_acceptance',
      'civil_defense_acceptance',
      'water_supply_acceptance',
      'power_acceptance',
      'gas_acceptance',
      'telecom_acceptance',
    ],
    actualItemNames: [
      'Commodity housing delivery-use filing',
      'Housing construction completion acceptance filing',
      'Planning acceptance',
      'Civil-defense acceptance',
      'Water supply acceptance',
      'Power supply acceptance',
      'Gas acceptance',
      'Telecom acceptance',
    ],
    resultDocumentNames: [
      'Commodity housing delivery-use filing notice 2021 No. 026 for Hubin Jiayuan phase 2',
      'Housing construction completion acceptance filing completed before delivery-use filing',
      'Acceptance opinions from planning, land, civil-defense, water, power, gas, and telecom authorities or units',
    ],
    authorityName: 'Changzhou Wujin District Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'FS:industrial-completion-filing-replay',
    provinceCode: 'GD',
    cityCode: 'foshan',
    cityName: 'Foshan',
    businessTypeCode: 'industrial',
    projectName: 'Foshan industrial project completion replay sample',
    sourceName: 'Foshan housing-construction / Guangdong government-service completion acceptance public service entry',
    sourceUrl: 'https://fszj.foshan.gov.cn/',
    evidenceScope: 'completion_filing_occurrence_check',
    actualItemCodes: ['completion_filing', 'fire_acceptance', 'planning_acceptance', 'archive_acceptance'],
    actualItemNames: ['Completion filing', 'Fire acceptance', 'Planning verification', 'Archive acceptance'],
    resultDocumentNames: ['Completion filing form', 'Fire acceptance opinion', 'Planning verification opinion', 'Archive acceptance document'],
    authorityName: 'Foshan housing and construction authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'FS:general-civil-foshan-municipal-eldercare-home-completion-acceptance-202212',
    provinceCode: 'GD',
    cityCode: 'foshan',
    cityName: 'Foshan',
    businessTypeCode: 'general_civil',
    projectName: 'Foshan municipal eldercare home project and Foshan University new campus North Campus south-area old-building renovation project',
    sourceName: 'Foshan Housing and Urban-Rural Construction Bureau 2022 rule-of-law government annual report',
    sourceUrl: 'http://fszj.foshan.gov.cn/zwgk/ghjh/content/post_5484171.html',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['Completion acceptance'],
    resultDocumentNames: [
      'Foshan Housing and Urban-Rural Construction Bureau official annual report confirming the municipal eldercare home project and Foshan University new campus North Campus south-area old-building renovation project completed completion acceptance',
    ],
    authorityName: 'Foshan Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'CS:general-civil-joint-acceptance-replay',
    provinceCode: 'HN',
    cityCode: 'changsha',
    cityName: 'Changsha',
    businessTypeCode: 'general_civil',
    projectName: 'Changsha construction-project joint-acceptance replay sample',
    sourceName: 'Changsha housing-construction / Hunan government-service joint-acceptance public service entry',
    sourceUrl: 'https://szjw.changsha.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'planning_acceptance', 'energy_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Planning verification', 'Building energy acceptance'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Planning verification opinion', 'Energy acceptance record'],
    authorityName: 'Changsha joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'SY:general-civil-joint-acceptance-replay',
    provinceCode: 'LN',
    cityCode: 'shenyang',
    cityName: 'Shenyang',
    businessTypeCode: 'general_civil',
    projectName: 'Shenyang construction-project completion replay sample',
    sourceName: 'Shenyang urban-rural construction / Liaoning government-service joint-acceptance public service entry',
    sourceUrl: 'https://cxjsj.shenyang.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'fire_acceptance', 'civil_defense_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Fire acceptance', 'Civil defense acceptance'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Fire acceptance opinion', 'Civil defense acceptance document'],
    authorityName: 'Shenyang joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'DL:general-civil-completion-filing-replay',
    provinceCode: 'LN',
    cityCode: 'dalian',
    cityName: 'Dalian',
    businessTypeCode: 'general_civil',
    projectName: 'Dalian construction-project completion filing replay sample',
    sourceName: 'Dalian housing-construction / government-service completion filing public service entry',
    sourceUrl: 'https://zjj.dl.gov.cn/',
    evidenceScope: 'completion_filing_occurrence_check',
    actualItemCodes: ['completion_filing', 'planning_acceptance', 'fire_acceptance', 'archive_acceptance'],
    actualItemNames: ['Completion filing', 'Planning verification', 'Fire acceptance', 'Archive acceptance'],
    resultDocumentNames: ['Completion filing form', 'Planning verification opinion', 'Fire acceptance opinion', 'Archive acceptance document'],
    authorityName: 'Dalian housing and construction authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'DL:general-civil-modern-agriculture-market-joint-acceptance-202211',
    provinceCode: 'LN',
    cityCode: 'dalian',
    cityName: 'Dalian',
    businessTypeCode: 'general_civil',
    projectName: 'Dalian modern agriculture industry center agricultural-products trading market joint acceptance',
    sourceName: 'Dalian Jinpu New Area government public page for completion-immediate acceptance project',
    sourceUrl: 'https://dljp.gov.cn/dt/001003/20221208/d8a3e48a-c443-422c-b6aa-14b8007e988d.html',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: [
      'comprehensive_acceptance',
      'planning_acceptance',
      'fire_acceptance',
      'archive_acceptance',
      'completion_filing',
    ],
    actualItemNames: [
      'Joint acceptance',
      'Planning verification',
      'Fire acceptance',
      'Urban construction archive acceptance',
      'Completion filing',
    ],
    resultDocumentNames: [
      'Official Jinpu New Area page states that on 2022-11-30 the named agricultural-products trading market passed joint acceptance and obtained planning verification, land acceptance, fire acceptance, urban construction archive acceptance, and completion filing procedures at one time',
    ],
    authorityName: 'Dalian Jinpu New Area government / engineering construction joint acceptance authorities',
  },
  {
    sampleKey: 'KM:general-civil-joint-acceptance-replay',
    provinceCode: 'YN',
    cityCode: 'kunming',
    cityName: 'Kunming',
    businessTypeCode: 'general_civil',
    projectName: 'Kunming construction-project joint-acceptance replay sample',
    sourceName: 'Kunming housing-construction / Yunnan government-service joint-acceptance public service entry',
    sourceUrl: 'https://zfcxjsj.km.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'planning_acceptance', 'civil_defense_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Planning verification', 'Civil defense acceptance'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Planning verification opinion', 'Civil defense acceptance document'],
    authorityName: 'Kunming joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'KM:general-civil-boyicheng-a3-completion-filing-201912',
    provinceCode: 'YN',
    cityCode: 'kunming',
    cityName: 'Kunming',
    businessTypeCode: 'general_civil',
    projectName: 'Boyicheng project phase 1 A3 plot lot 1 completion filing',
    sourceName: 'People Daily Online leadership-message-board public reply from Kunming housing-construction authority',
    sourceUrl: 'https://leaders.people.com.cn/n1/2020/0110/c178291-31542472.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: [
      'Public reply states that the construction unit completed engineering completion acceptance filing for Boyicheng project phase 1 A3 plot lot 1 at the municipal quality and safety supervision station on 2019-12-10',
    ],
    authorityName: 'Kunming housing and urban-rural construction authority / municipal quality and safety supervision station',
  },
  {
    sampleKey: 'NC:general-civil-joint-acceptance-replay',
    provinceCode: 'JX',
    cityCode: 'nanchang',
    cityName: 'Nanchang',
    businessTypeCode: 'general_civil',
    projectName: 'Nanchang construction-project joint-acceptance replay sample',
    sourceName: 'Nanchang housing-construction / Jiangxi government-service joint-acceptance public service entry',
    sourceUrl: 'https://zjj.nc.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'archive_acceptance', 'energy_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Archive acceptance', 'Building energy acceptance'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Archive acceptance document', 'Energy acceptance record'],
    authorityName: 'Nanchang joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'SJZ:general-civil-joint-acceptance-replay',
    provinceCode: 'HE',
    cityCode: 'shijiazhuang',
    cityName: 'Shijiazhuang',
    businessTypeCode: 'general_civil',
    projectName: 'Shijiazhuang construction-project completion replay sample',
    sourceName: 'Shijiazhuang housing-construction / Hebei government-service joint-acceptance public service entry',
    sourceUrl: 'https://zjj.sjz.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'fire_acceptance', 'heat_supply_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Fire acceptance', 'Heat-supply access confirmation'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Fire acceptance opinion', 'Heat-supply confirmation document'],
    authorityName: 'Shijiazhuang joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'TY:general-civil-completion-filing-replay',
    provinceCode: 'SX',
    cityCode: 'taiyuan',
    cityName: 'Taiyuan',
    businessTypeCode: 'general_civil',
    projectName: 'Taiyuan construction-project completion filing replay sample',
    sourceName: 'Taiyuan housing-construction / Shanxi government-service completion filing public service entry',
    sourceUrl: 'https://zjj.taiyuan.gov.cn/',
    evidenceScope: 'completion_filing_occurrence_check',
    actualItemCodes: ['completion_filing', 'planning_acceptance', 'fire_acceptance', 'heat_supply_acceptance'],
    actualItemNames: ['Completion filing', 'Planning verification', 'Fire acceptance', 'Heat-supply access confirmation'],
    resultDocumentNames: ['Completion filing form', 'Planning verification opinion', 'Fire acceptance opinion', 'Heat-supply confirmation document'],
    authorityName: 'Taiyuan housing and construction authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'TY:general-civil-sange-village-north-archive-acceptance-202605',
    provinceCode: 'SX',
    cityCode: 'taiyuan',
    cityName: 'Taiyuan',
    businessTypeCode: 'general_civil',
    projectName: 'Taiyuan Jiancaoping District Sange area Sange village urban-village renovation plot 1 north district project',
    sourceName: 'National Government Service Platform investment-project approval-result public interface',
    sourceUrl: 'https://app.gjzwfw.gov.cn/jmopen/webapp/html5/fgwqgtzxmzxspjgptgsxx/index.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction archive acceptance'],
    resultDocumentNames: [
      'Official approval-result row: project code 2019-140108-70-03-013941, item 建设工程档案验收, result passed, completed on 2026-05-25',
    ],
    authorityName: 'National Government Service Platform / construction archive acceptance authority',
  },
  {
    sampleKey: 'HHHT:general-civil-completion-filing-replay',
    provinceCode: 'NM',
    cityCode: 'hohhot',
    cityName: 'Hohhot',
    businessTypeCode: 'general_civil',
    projectName: 'Hohhot construction-project completion replay sample',
    sourceName: 'Hohhot housing-construction / Inner Mongolia government-service completion acceptance public service entry',
    sourceUrl: 'https://zfcxjsj.huhhot.gov.cn/',
    evidenceScope: 'completion_filing_occurrence_check',
    actualItemCodes: ['completion_filing', 'fire_acceptance', 'heat_supply_acceptance', 'gas_acceptance'],
    actualItemNames: ['Completion filing', 'Fire acceptance', 'Heat-supply access confirmation', 'Gas access acceptance'],
    resultDocumentNames: ['Completion filing form', 'Fire acceptance opinion', 'Heat-supply confirmation document', 'Gas access confirmation document'],
    authorityName: 'Hohhot housing and construction authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'HHHT:transportation-qingshuihe-laoniuwan-airport-completion-acceptance-202411',
    provinceCode: 'NM',
    cityCode: 'hohhot',
    cityName: 'Hohhot',
    businessTypeCode: 'transportation_hub',
    projectName: 'Qingshuihe Laoniuwan general aviation airport project',
    sourceName: 'Inner Mongolia Department of Transportation press-conference transcript',
    sourceUrl: 'https://jtyst.nmg.gov.cn/zwgk/xwfbh/202411/t20241112_2605707.html',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['Project completion acceptance'],
    resultDocumentNames: [
      'Official transportation department transcript confirming Qingshuihe Laoniuwan general aviation airport passed completion acceptance and was ready for operation in Hohhot area',
    ],
    authorityName: 'Inner Mongolia Department of Transportation / Hohhot transportation authorities',
  },
  {
    sampleKey: 'CC:general-civil-joint-acceptance-replay',
    provinceCode: 'JL',
    cityCode: 'changchun',
    cityName: 'Changchun',
    businessTypeCode: 'general_civil',
    projectName: 'Changchun construction-project joint-acceptance replay sample',
    sourceName: 'Changchun housing-construction / Jilin government-service joint-acceptance public service entry',
    sourceUrl: 'https://zjj.changchun.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'fire_acceptance', 'heat_supply_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Fire acceptance', 'Heat-supply access confirmation'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Fire acceptance opinion', 'Heat-supply confirmation document'],
    authorityName: 'Changchun joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'HRB:general-civil-joint-acceptance-replay',
    provinceCode: 'HLJ',
    cityCode: 'harbin',
    cityName: 'Harbin',
    businessTypeCode: 'general_civil',
    projectName: 'Harbin construction-project completion replay sample',
    sourceName: 'Harbin housing-construction / Heilongjiang government-service joint-acceptance public service entry',
    sourceUrl: 'https://zfcxjsj.harbin.gov.cn/',
    evidenceScope: 'joint_acceptance_occurrence_check',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing', 'fire_acceptance', 'heat_supply_acceptance'],
    actualItemNames: ['Joint acceptance', 'Completion filing', 'Fire acceptance', 'Heat-supply access confirmation'],
    resultDocumentNames: ['Joint acceptance opinion', 'Completion filing form', 'Fire acceptance opinion', 'Heat-supply confirmation document'],
    authorityName: 'Harbin joint-acceptance lead authority',
    sampleGranularity: 'official_city_entry',
  },
  {
    sampleKey: 'HRB:sports-culture-asian-winter-games-venue-renovation-completion-acceptance-202410',
    provinceCode: 'HLJ',
    cityCode: 'harbin',
    cityName: 'Harbin',
    businessTypeCode: 'sports_culture',
    projectName: 'Harbin 2025 Asian Winter Games competition venue renovation projects including Harbin Sport University student skating rink',
    sourceName: 'Heilongjiang Provincial People Government Asian Winter Games venue preparation public article',
    sourceUrl: 'https://www.hlj.gov.cn/hlj/c107856/202410/c00_31780636.shtml',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['Competition venue renovation completion acceptance'],
    resultDocumentNames: [
      'Heilongjiang Provincial People Government article confirming the 13 competition venue renovation projects for the 2025 Asian Winter Games had completed completion acceptance',
    ],
    authorityName: 'Heilongjiang Provincial People Government / Harbin Asian Winter Games venue preparation authorities',
  },
  {
    sampleKey: 'NB:industrial-fenghua-dabu-park-completion-filing-202412',
    provinceCode: 'ZJ',
    cityCode: 'ningbo',
    cityName: 'Ningbo',
    businessTypeCode: 'industrial',
    projectName: 'Dabu micro industrial park service-support block completion filing',
    sourceName: 'Ningbo Fenghua District December 2024 building completion filing list',
    sourceUrl: 'https://www.fh.gov.cn/art/2025/1/9/art_1229597937_59157607.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion filing'],
    resultDocumentNames: ['Completion filing record 2024-154'],
    authorityName: 'Ningbo Fenghua District housing and construction authority',
  },
  {
    sampleKey: 'NB:school-fenghua-education-park-completion-filing-202412',
    provinceCode: 'ZJ',
    cityCode: 'ningbo',
    cityName: 'Ningbo',
    businessTypeCode: 'school',
    projectName: 'Xikou Hushan new district education industrial park completion filing',
    sourceName: 'Ningbo Fenghua District December 2024 building completion filing list',
    sourceUrl: 'https://www.fh.gov.cn/art/2025/1/9/art_1229597937_59157607.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion filing'],
    resultDocumentNames: ['Completion filing record 2024-157'],
    authorityName: 'Ningbo Fenghua District housing and construction authority',
  },
  {
    sampleKey: 'NC:general-civil-wanli-changchun-huayuan-completion-filing-202306',
    provinceCode: 'JX',
    cityCode: 'nanchang',
    cityName: 'Nanchang',
    businessTypeCode: 'general_civil',
    projectName: 'Changchun Huayuan Building 6 completion filing',
    sourceName: 'Nanchang Wanli Management Bureau May-June 2023 construction completion filing list',
    sourceUrl: 'https://wl.nc.gov.cn/ncswlglj/czzjzdjc/202307/ab5a75b902be44eab87d1027dd65a1f1.shtml',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Completion filing record 360105202306260042'],
    authorityName: 'Nanchang Wanli scenic urban-rural construction authority',
  },
  {
    sampleKey: 'TJ:hospital-xiqing-tcm-hospital-completion-filing-202301',
    provinceCode: 'TJ',
    cityCode: 'tianjin',
    cityName: 'Tianjin',
    businessTypeCode: 'hospital',
    projectName: 'Xiqing District Traditional Chinese Medicine Hospital construction project completion filing',
    sourceName: 'Tianjin Xiqing District 2023 building and municipal completion filing list',
    sourceUrl: 'https://www.tjxq.gov.cn/zwgk/zfxxgk/zfgbm/zfhjswyh/fdzdgk/ggzyjy/202312/t20231227_6491916.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building and municipal completion filing'],
    resultDocumentNames: ['Completion filing record (Xiqing) 2023-003'],
    authorityName: 'Tianjin Xiqing District housing and construction authority',
  },
  {
    sampleKey: 'TJ:school-xiqing-kindergarten-completion-filing-202302',
    provinceCode: 'TJ',
    cityCode: 'tianjin',
    cityName: 'Tianjin',
    businessTypeCode: 'school',
    projectName: 'Xinkou Town First Central Kindergarten completion filing',
    sourceName: 'Tianjin Xiqing District 2023 building and municipal completion filing list',
    sourceUrl: 'https://www.tjxq.gov.cn/zwgk/zfxxgk/zfgbm/zfhjswyh/fdzdgk/ggzyjy/202312/t20231227_6491916.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building and municipal completion filing'],
    resultDocumentNames: ['Completion filing record (Xiqing) 2023-007'],
    authorityName: 'Tianjin Xiqing District housing and construction authority',
  },
  {
    sampleKey: 'FZ:hotel-international-convention-center-hotel-completion-filing-201910',
    provinceCode: 'FJ',
    cityCode: 'fuzhou',
    cityName: 'Fuzhou',
    businessTypeCode: 'hotel',
    projectName: 'International Convention and Exhibition Center supporting hotel Tower A/B and podium completion filing',
    sourceName: 'Fuzhou housing-construction November 2019 completion filing approval notice',
    sourceUrl: 'https://zjj.fuzhou.gov.cn/zwgk/xzsp/jgysbags/201911/t20191112_3080504.htm',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record FJYSBA-0591-FZ-2019-00031'],
    authorityName: 'Fuzhou housing and construction authority',
  },
  {
    sampleKey: 'WH:data-center-cicc-wuhan-big-data-room-completion-filing-202306',
    provinceCode: 'HB',
    cityCode: 'wuhan',
    cityName: 'Wuhan',
    businessTypeCode: 'data_center',
    projectName: 'CICC Wuhan big data center data room building completion filing',
    sourceName: 'Wuhan Dongxihu June 2023 construction completion filing list',
    sourceUrl: 'https://www.dxh.gov.cn/ZWGK/QZFXXGKML/GCJSXM/CXJSGL/202307/P020230721582223320809.pdf',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record 09-23-0216'],
    authorityName: 'Wuhan Dongxihu housing and construction authority',
  },
  {
    sampleKey: 'CQ:transportation-hub-jinxinyuan-bus-yard-completion-filing-202411',
    provinceCode: 'CQ',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    businessTypeCode: 'transportation_hub',
    projectName: 'Jinxinyuan bus yard management and support buildings completion filing',
    sourceName: 'Chongqing Beibei District completion filing public information',
    sourceUrl: 'https://www.beibei.gov.cn/bm/qfzggw/zwgk_58246/zfxxgk_bm/jczfxxgk/zdjsxmly_134076/ssxx/jgygxx/202501/t20250103_14047042.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record Beibei joint acceptance 2024-056'],
    authorityName: 'Chongqing Beibei housing and construction authority',
  },
  {
    sampleKey: 'CQ:general-civil-changshou-emergency-rescue-base-archive-acceptance-202508',
    provinceCode: 'CQ',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    businessTypeCode: 'general_civil',
    projectName: 'Changshou District comprehensive emergency rescue team base construction and decoration works archive acceptance',
    sourceName: 'Chongqing Municipal Urban Construction Archives August 2025 construction project archive special acceptance information',
    sourceUrl: 'https://zfcxjw.cq.gov.cn/cqcjdag/days/202509/t20250924_15037868.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction project archive special acceptance'],
    resultDocumentNames: [
      'Official archive special acceptance information row for Changshou District comprehensive emergency rescue team base new-build and decoration works, construction unit Changshou District Emergency Management Bureau, acceptance date 2025-08-15',
    ],
    authorityName: 'Chongqing Municipal Urban Construction Archives / Changshou District Urban Construction Archives Office',
  },
  {
    sampleKey: 'CQ:school-jiangbei-huaxin-luming-school-archive-acceptance-202508',
    provinceCode: 'CQ',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    businessTypeCode: 'school',
    projectName: 'Jiangbei District Huaxin Luming Experimental School new-build project archive special acceptance',
    sourceName: 'Chongqing Municipal Urban Construction Archives August 2025 construction project archive special acceptance information',
    sourceUrl: 'https://zfcxjw.cq.gov.cn/cqcjdag/days/202509/t20250924_15037868.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction project archive special acceptance'],
    resultDocumentNames: [
      'Official archive special acceptance row for Jiangbei District Huaxin Luming Experimental School new-build project, construction unit Chongqing Jiangbei Urban Development and Construction Co., Ltd., acceptance date 2025-08-07',
    ],
    authorityName: 'Chongqing Municipal Urban Construction Archives / Jiangbei District Urban Construction Archives Office',
  },
  {
    sampleKey: 'CQ:industrial-rongchang-lianrong-mold-workshop-archive-acceptance-202508',
    provinceCode: 'CQ',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    businessTypeCode: 'industrial',
    projectName: 'Chongqing Lianrong precision mold production project building 2 workshop archive special acceptance',
    sourceName: 'Chongqing Municipal Urban Construction Archives August 2025 construction project archive special acceptance information',
    sourceUrl: 'https://zfcxjw.cq.gov.cn/cqcjdag/days/202509/t20250924_15037868.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction project archive special acceptance'],
    resultDocumentNames: [
      'Official archive special acceptance row for Chongqing Lianrong precision mold production project building 2 workshop, construction unit Chongqing Lianrong Precision Mold Co., Ltd., acceptance date 2025-08-13',
    ],
    authorityName: 'Chongqing Municipal Urban Construction Archives / Rongchang District Urban Construction Archives Office',
  },
  {
    sampleKey: 'CQ:industrial-yubei-daming-electronics-factory-archive-acceptance-202505',
    provinceCode: 'CQ',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    businessTypeCode: 'industrial',
    projectName: 'Yubei District Daming Electronics Chongqing new factory project A and E factory buildings archive special acceptance',
    sourceName: 'Chongqing Municipal Urban Construction Archives May 2025 construction project archive special acceptance information',
    sourceUrl: 'https://zfcxjw.cq.gov.cn/cqcjdag/days/202506/t20250624_14738569.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction project archive special acceptance'],
    resultDocumentNames: [
      'Official archive special acceptance row for Yubei District Daming Electronics Chongqing new factory project A and E factory buildings, construction unit Daming Electronics Chongqing Co., Ltd., acceptance date 2025-05-26',
    ],
    authorityName: 'Chongqing Municipal Urban Construction Archives / Yubei District Housing and Urban-Rural Construction Archives Center',
  },
  {
    sampleKey: 'CQ:hotel-yuzhong-jujiahao-decoration-archive-acceptance-202509',
    provinceCode: 'CQ',
    cityCode: 'chongqing',
    cityName: 'Chongqing',
    businessTypeCode: 'hotel',
    projectName: 'Chongqing Jujiahao hotel management decoration works archive special acceptance',
    sourceName: 'Chongqing Municipal Urban Construction Archives September 2025 construction project archive special acceptance information',
    sourceUrl: 'https://zfcxjw.cq.gov.cn/cqcjdag/days/202510/t20251020_15096969.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['archive_acceptance'],
    actualItemNames: ['Construction project archive special acceptance'],
    resultDocumentNames: [
      'Official archive special acceptance row for Chongqing Jujiahao Hotel Management Co., Ltd. decoration works, handled by Yuzhong District housing and urban construction archives office, acceptance date 2025-09-30',
    ],
    authorityName: 'Chongqing Municipal Urban Construction Archives / Yuzhong District Housing and Urban Construction Archives Office',
  },
  {
    sampleKey: 'WH:sports-culture-dongxihu-culture-center-theater-completion-filing-202308',
    provinceCode: 'HB',
    cityCode: 'wuhan',
    cityName: 'Wuhan',
    businessTypeCode: 'sports_culture',
    projectName: 'Dongxihu Culture Center theater completion filing',
    sourceName: 'Wuhan Dongxihu August 2023 construction completion filing list',
    sourceUrl: 'https://www.dxh.gov.cn/ZWGK/QZFXXGKML/GCJSXM/CXJSGL/202309/P020230912312859121515.pdf',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record 09-23-0287'],
    authorityName: 'Wuhan Dongxihu housing and construction authority',
  },
  {
    sampleKey: 'WH:tod-sanjintan-vehicle-depot-upper-cover-completion-filing-202210',
    provinceCode: 'HB',
    cityCode: 'wuhan',
    cityName: 'Wuhan',
    businessTypeCode: 'tod_upper_cover',
    projectName: 'Sanjintan vehicle-depot upper-cover composite residential project A9 building completion filing',
    sourceName: 'Wuhan Dongxihu November 2022 construction completion filing list',
    sourceUrl: 'https://www.dxh.gov.cn/ZWGK/QZFXXGKML/GCJSXM/CXJSGL/202301/P020230103339936118644.pdf',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record 09-22-0481'],
    authorityName: 'Wuhan Dongxihu housing and construction authority',
  },
  {
    sampleKey: 'TJ:renovation-yuantian-building-fire-decoration-completion-filing-202208',
    provinceCode: 'TJ',
    cityCode: 'tianjin',
    cityName: 'Tianjin',
    businessTypeCode: 'renovation',
    projectName: 'Yuantian Building fire-protection and decoration renovation completion filing',
    sourceName: 'Tianjin Heping District construction completion filing public query',
    sourceUrl: 'https://www.tjhp.gov.cn/zw/zfxxgk/zfgbm/qzfjsw/fdzdgknr/qtfdgkxx/202302/t20230217_6110440.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record Heping 2022-008'],
    authorityName: 'Tianjin Heping District housing and construction authority',
  },
  {
    sampleKey: 'TJ:modular-building-xiqing-bingshui-commercial-assembly-completion-filing-202212',
    provinceCode: 'TJ',
    cityCode: 'tianjin',
    cityName: 'Tianjin',
    businessTypeCode: 'modular_building',
    projectName: 'Xiqing Bingshui West Road extension plot 3 commercial assembly-concrete project completion filing',
    sourceName: 'Tianjin Xiqing District 2022 building and municipal completion filing list',
    sourceUrl: 'https://www.tjxq.gov.cn/zwgk/zfxxgk/zfgbm/zfhjswyh/fdzdgk/ggzyjy/202301/t20230103_6067112.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record Xiqing 2022-076'],
    authorityName: 'Tianjin Xiqing District housing and construction authority',
  },
  {
    sampleKey: 'BJ:general-civil-dougezhuang-resettlement-completion-filing-202602',
    provinceCode: 'BJ',
    cityCode: 'BJ',
    cityName: 'Beijing',
    businessTypeCode: 'general_civil',
    projectName: 'Dougezhuang 3/4 plot Tonghui canal west Dongcheng old-city protection resettlement housing buildings 2-5 and 2-10 completion filing',
    sourceName: 'Beijing Dongcheng February-March 2026 building completion filing public list',
    sourceUrl: 'https://www.bjdch.gov.cn/zwgk/jgdh/qzfzcbmdh/qzfcsjsw/jgbaqkzjw/202602/t20260228_4545464.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion filing'],
    resultDocumentNames: ['Completion filing record 0022 Dong completion 2026 building 0002'],
    authorityName: 'Beijing Dongcheng District Housing and Urban Construction Commission',
  },
  {
    sampleKey: 'ZZ:industrial-east-environmental-energy-completion-filing-202103',
    provinceCode: 'HA',
    cityCode: 'zhengzhou',
    cityName: 'Zhengzhou',
    businessTypeCode: 'industrial',
    projectName: 'Zhengzhou east environmental energy project main plant and supporting buildings completion filing',
    sourceName: 'Zhongmu County government Zhengzhou east environmental energy completion filing public notice',
    sourceUrl: 'https://public.zhongmu.gov.cn/D49Y/4879252.jhtml',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing records 20210323-1 to 20210323-20'],
    authorityName: 'Zhongmu County housing and urban-rural construction authority',
  },
  {
    sampleKey: 'SJZ:school-hebei-engineering-technical-college-expansion-completion-filing-202601',
    provinceCode: 'HE',
    cityCode: 'shijiazhuang',
    cityName: 'Shijiazhuang',
    businessTypeCode: 'school',
    projectName: 'Hebei Engineering Technical College campus expansion phase 2 international student center teaching building auditorium dormitory and gymnasium completion filing',
    sourceName: 'Shijiazhuang Administrative Approval Bureau 2026 urban-district completion filing public ledger',
    sourceUrl: 'https://xzspj.sjz.gov.cn/columns/82dab922-bb4f-4f11-a919-4ccf0f650e6a/202604/07/33987960-25cc-4967-ba63-0ec6dbd02be5.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building and municipal completion filing'],
    resultDocumentNames: ['Completion filing record 2026J1301010002'],
    authorityName: 'Shijiazhuang Administrative Approval Bureau',
  },
  {
    sampleKey: 'QZ:industrial-yayi-printing-factory-completion-filing-202512',
    provinceCode: 'FJ',
    cityCode: 'quanzhou',
    cityName: 'Quanzhou',
    businessTypeCode: 'industrial',
    projectName: 'Fujian Yayi Color Printing factory and supporting facilities phase 2 building 1 production workshop completion filing',
    sourceName: 'Jinjiang January 2026 building completion filing public list',
    sourceUrl: 'https://www.jinjiang.gov.cn/xxgk/zdxxgk/zdjsxm/xmdt/202602/t20260224_3269023.htm',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion filing'],
    resultDocumentNames: ['Completion filing record 3505822107230105-JX-003'],
    authorityName: 'Jinjiang Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'ZK:general-civil-country-garden-tianxiwan-completion-filing-202311',
    provinceCode: 'HA',
    cityCode: 'ZK',
    cityName: 'Zhoukou',
    businessTypeCode: 'general_civil',
    projectName: 'Zhoukou Country Garden Tianxiwan phase 1 building 2 commercial-residential building completion filing',
    sourceName: 'Zhoukou housing-construction completion filing public information table',
    sourceUrl: 'https://zfcxjs.zhoukou.gov.cn/sitesources/zfcxjsj/page_pc/xwdt/gsgg/articlec09d2cf9c85343038c7e275282cf8467.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record 4116002008180101-JX-009'],
    authorityName: 'Zhoukou housing and urban-rural construction authority',
  },
  {
    sampleKey: 'JXG:general-civil-pinghu-youlinc-center-completion-filing-202209',
    provinceCode: 'ZJ',
    cityCode: 'jiaxing',
    cityName: 'Jiaxing',
    businessTypeCode: 'general_civil',
    projectName: 'Pinghu Youlin Center completion filing',
    sourceName: 'Pinghu construction completion filing certificate public PDF',
    sourceUrl: 'https://zjjcmspublic.oss-cn-hangzhou-zwynet-d01-a.internet.cloud.zj.gov.cn/jcms_files/jcms1/web3087/site/attach/0/138e03957497435082f530c959619480.pdf',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Completion filing record 31420020220920101'],
    authorityName: 'Pinghu construction completion filing authority',
  },
  {
    sampleKey: 'QD:general-civil-licang-qingyin-expressway-east-residential-completion-filing-202501',
    provinceCode: 'SD',
    cityCode: 'QD',
    cityName: 'Qingdao',
    businessTypeCode: 'general_civil',
    projectName: 'Licang District Qingyin Expressway east renovation plot 4364-02 building 18 and underground garage completion filing',
    sourceName: 'Qingdao housing-construction 2025 H1 urban-district residential completion filing XLS public list',
    sourceUrl: 'https://sjw.qingdao.gov.cn/cxjsj8/cxjsj65/202507/P020250709494194137464.xls',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Residential project completion filing'],
    resultDocumentNames: ['Qingdao 2025 H1 urban-district residential completion filing public list; filing date 2025-01-08'],
    authorityName: 'Qingdao housing and urban-rural construction authority',
  },
  {
    sampleKey: 'PJ:industrial-north-new-material-gas-office-completion-filing-202210',
    provinceCode: 'LN',
    cityCode: 'PJ',
    cityName: 'Panjin',
    businessTypeCode: 'industrial',
    projectName: 'Liaoning North New Material Industrial Park Shuguang block gas supply project comprehensive office building completion filing',
    sourceName: 'Panshan County government major-project completion filing record page',
    sourceUrl: 'https://www.panshan.gov.cn/2022_11/01_14/content-393913.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building and municipal infrastructure completion filing'],
    resultDocumentNames: ['Liaoning building and municipal infrastructure completion filing record 2022 No.011'],
    authorityName: 'Panshan County completion filing authority',
  },
  {
    sampleKey: 'DZ:hospital-dazhou-central-hospital-underground-parking-completion-filing-202502',
    provinceCode: 'SC',
    cityCode: 'DZ',
    cityName: 'Dazhou',
    businessTypeCode: 'hospital',
    projectName: 'Dazhou Central Hospital underground parking and business support building completion filing',
    sourceName: 'Dazhou housing and urban-rural construction bureau completion filing record page',
    sourceUrl: 'https://zjj.dazhou.gov.cn/news-show-9420.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Completion filing'],
    resultDocumentNames: ['Completion filing record Dazhou housing-construction filing 2025 No.2'],
    authorityName: 'Dazhou Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'JN:industrial-new-material-park-factory-completion-filing-202112',
    provinceCode: 'SD',
    cityCode: 'JN',
    cityName: 'Jinan',
    businessTypeCode: 'industrial',
    projectName: 'Jinan Jiantong Logistics new material technology park industrial factory phase 1 building 1 completion filing',
    sourceName: 'Jinan Administrative Approval Service Bureau house-building completion filing certificate issuance announcement',
    sourceUrl: 'https://jnzwfw.jinan.gov.cn/art/2021/12/24/art_82910_4774789.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['House building completion filing'],
    resultDocumentNames: ['House building completion filing record 2021240192; issued 2021-12-21'],
    authorityName: 'Jinan Administrative Approval Service Bureau',
  },
  {
    sampleKey: 'CS:general-civil-tiancheng-rongyuan-completion-filing-201409',
    provinceCode: 'HN',
    cityCode: 'changsha',
    cityName: 'Changsha',
    businessTypeCode: 'general_civil',
    projectName: 'Hunan Runjiang Tiancheng Rongyuan residential development completion filing',
    sourceName: 'Hunan Housing and Urban-Rural Construction Department public project performance data governance page',
    sourceUrl: 'https://zjt.hunan.gov.cn/zjt/xxgk/xinxigongkaimulu/tzgg/tzgg2jzgl/202508/t20250828_33785167.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Completion filing record 21960; filing date 2014-09-30'],
    authorityName: 'Hunan Housing and Urban-Rural Construction Department',
  },
  {
    sampleKey: 'NT:general-civil-university-city-supporting-service-completion-filing-201809',
    provinceCode: 'JS',
    cityCode: 'nantong',
    cityName: 'Nantong',
    businessTypeCode: 'general_civil',
    projectName: 'Nantong University City comprehensive supporting service area buildings 1-6 including basement and civil-defense works completion filing',
    sourceName: 'Nantong Municipal People Government project-completion filing page',
    sourceUrl: 'https://www.nantong.gov.cn/ntsrmzf/xmjg/content/b0816f56-e187-4df5-8b95-eab420e886f5.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Project filing record 3206021504080102-JX-001; filing date 2018-09-10'],
    authorityName: 'Nantong Administrative Approval Bureau',
  },
  {
    sampleKey: 'XY:transportation-garden-avenue-phase-1-joint-completion-filing-202512',
    provinceCode: 'HB',
    cityCode: 'xiangyang',
    cityName: 'Xiangyang',
    businessTypeCode: 'transportation_hub',
    projectName: 'Xiangyang Garden Avenue phase 1 from Zuanshi Avenue to Sulingshan Bridge joint acceptance and completion filing',
    sourceName: 'Xiangyang housing and urban renewal bureau July-November 2025 joint acceptance and completion filing public list',
    sourceUrl: 'http://szjj.xiangyang.gov.cn/zwgk/zc/qtzdgkwj/gsgg/202512/t20251204_3920214.shtml',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing'],
    actualItemNames: ['Joint acceptance', 'Completion filing'],
    resultDocumentNames: ['Joint acceptance and completion filing public record 420606-2025-016'],
    authorityName: 'Xiangyang Housing and Urban Renewal Bureau',
  },
  {
    sampleKey: 'NN:general-civil-asean-digital-economy-park-rd-center-completion-filing-202606',
    provinceCode: 'GX',
    cityCode: 'nanning',
    cityName: 'Nanning',
    businessTypeCode: 'general_civil',
    projectName: 'China-ASEAN digital economy industrial park phase 1 building 4 research and development center completion filing',
    sourceName: 'Nanning building completion filing information official query system',
    sourceUrl: 'http://116.10.194.120/JGService/api/JGCenter/getProjRecordInfoList?page=1&limit=15&projname=',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion filing'],
    resultDocumentNames: ['Completion filing record 450100202606050114; filing date 2026-06-05'],
    authorityName: 'Nanning housing-construction completion filing authority',
  },
  {
    sampleKey: 'LZ:general-civil-poly-lingxiushan-b9-joint-acceptance-202511',
    provinceCode: 'GS',
    cityCode: 'lanzhou',
    cityName: 'Lanzhou',
    businessTypeCode: 'general_civil',
    projectName: 'Poly Lingxiushan district 12 plot B building 9 and plot B underground garage joint acceptance',
    sourceName: 'Lanzhou Housing and Urban-Rural Construction Bureau joint acceptance opinion public page',
    sourceUrl: 'https://zjj.lanzhou.gov.cn/art/2025/11/24/art_11415_1576181.html',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['comprehensive_acceptance'],
    actualItemNames: ['Joint acceptance'],
    resultDocumentNames: ['Joint acceptance opinion Lan joint acceptance 2025 No. 031; passed 2025-11-21'],
    authorityName: 'Lanzhou Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'HZ:industrial-semiconductor-wafer-completion-filing-202302',
    provinceCode: 'ZJ',
    cityCode: 'hangzhou',
    cityName: 'Hangzhou',
    businessTypeCode: 'industrial',
    projectName: 'Semiconductor large silicon wafer 200mm and 300mm project completion filing',
    sourceName: 'Hangzhou Municipal People Government completion filing information page',
    sourceUrl: 'https://www.hangzhou.gov.cn/art/2023/3/17/art_1229794563_59076700.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Completion acceptance record 31122220230224101; filing date 2023-02-24'],
    authorityName: 'Hangzhou Qiantang District Administrative Approval Bureau',
  },
  {
    sampleKey: 'SY:hospital-china-medical-university-regional-center-completion-filing-202503',
    provinceCode: 'LN',
    cityCode: 'shenyang',
    cityName: 'Shenyang',
    businessTypeCode: 'hospital',
    projectName: 'China Medical University First Affiliated Hospital national tumor and cardiovascular regional medical center phase 1.1 completion filing',
    sourceName: 'Shenyang Urban-Rural Construction Bureau municipal building completion filing list 2024-10 to 2025-09',
    sourceUrl: 'https://jw.shenyang.gov.cn/xmxx/jgbaxx/202510/P020251014569603548328.xlsx',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion filing'],
    resultDocumentNames: ['Shenyang municipal building completion filing public list; completed 2025-03-14'],
    authorityName: 'Shenyang Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'CC:industrial-changde-industrial-park-factory-completion-filing-202509',
    provinceCode: 'JL',
    cityCode: 'changchun',
    cityName: 'Changchun',
    businessTypeCode: 'industrial',
    projectName: 'Changchun Guotou Changde Industrial Park construction project buildings 85, 86, and 107 completion filing',
    sourceName: 'China-Korea Changchun International Cooperation Demonstration Zone building and municipal completion filing public list',
    sourceUrl: 'https://zhsfq.jl.gov.cn/zw/zjgs/fwjzhszjcssgcjgysba/',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building and municipal infrastructure completion filing'],
    resultDocumentNames: ['Official completion filing public list; public notice date 2025-09-26'],
    authorityName: 'China-Korea Changchun International Cooperation Demonstration Zone housing-construction authority',
  },
  {
    sampleKey: 'URUMQI:general-civil-joint-acceptance-service-profile-202109',
    provinceCode: 'XJ',
    cityCode: 'urumqi',
    cityName: 'Urumqi',
    businessTypeCode: 'general_civil',
    projectName: 'Urumqi building and municipal construction joint completion acceptance official service profile',
    sourceName: 'Urumqi Municipal People Government construction joint completion acceptance application form',
    sourceUrl: 'https://www.wlmq.gov.cn/wlmqs/c119201/202109/9bb5d321a59a4ac4b00f32b427037a83.shtml',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'completion_acceptance',
      'civil_defense_acceptance',
      'fire_acceptance',
      'planning_acceptance',
      'archive_acceptance',
      'landscape_acceptance',
      'completion_filing',
    ],
    actualItemNames: [
      'Completion acceptance',
      'Civil-defense acceptance',
      'Fire acceptance',
      'Planning acceptance',
      'Archive acceptance',
      'Greening acceptance',
      'Building and municipal completion filing',
    ],
    resultDocumentNames: ['Joint completion acceptance application form and related acceptance/filing result materials'],
    authorityName: 'Urumqi construction authority / civil-defense office joint-acceptance lead authority',
  },
  {
    sampleKey: 'LY:general-civil-joint-acceptance-service-profile-202603',
    provinceCode: 'HA',
    cityCode: 'LY',
    cityName: 'Luoyang',
    businessTypeCode: 'general_civil',
    projectName: 'Luoyang construction project joint acceptance one-thing official service profile',
    sourceName: 'Luoyang construction project joint acceptance one-thing material package',
    sourceUrl: 'https://oss.ly.gov.cn/upload-file/files/20260330/ac2638d846c541d48c902eeb70d809b2.pdf',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'completion_acceptance',
      'comprehensive_acceptance',
      'completion_filing',
      'fire_acceptance',
      'planning_acceptance',
      'archive_acceptance',
      'water_supply_acceptance',
      'gas_acceptance',
      'heat_supply_acceptance',
      'drainage_acceptance',
      'sanitation_facility_acceptance',
      'landscape_acceptance',
    ],
    actualItemNames: [
      'Construction completion acceptance report',
      'Joint acceptance',
      'Completion filing',
      'Fire acceptance or fire check',
      'Planning and land verification',
      'Archive acceptance',
      'Water access confirmation',
      'Gas access confirmation',
      'Heat-supply access confirmation',
      'Drainage acceptance',
      'Sanitation facility filing',
      'Ancillary greening filing',
    ],
    resultDocumentNames: [
      'Joint acceptance material package',
      'Construction completion acceptance report',
      'Luoyang city-management access/filing form for water, gas, heat, drainage, sanitation, and greening',
    ],
    authorityName: 'Luoyang joint-acceptance lead authority / Luoyang City Administration Bureau',
  },
  {
    sampleKey: 'LUOYANG:general-civil-joint-acceptance-service-profile-202603',
    provinceCode: 'HA',
    cityCode: 'luoyang',
    cityName: 'Luoyang',
    businessTypeCode: 'general_civil',
    projectName: 'Luoyang construction project joint acceptance one-thing official service profile',
    sourceName: 'Luoyang construction project joint acceptance one-thing material package',
    sourceUrl: 'https://oss.ly.gov.cn/upload-file/files/20260330/ac2638d846c541d48c902eeb70d809b2.pdf',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'completion_acceptance',
      'comprehensive_acceptance',
      'completion_filing',
      'fire_acceptance',
      'planning_acceptance',
      'archive_acceptance',
      'water_supply_acceptance',
      'gas_acceptance',
      'heat_supply_acceptance',
      'drainage_acceptance',
      'sanitation_facility_acceptance',
      'landscape_acceptance',
    ],
    actualItemNames: [
      'Construction completion acceptance report',
      'Joint acceptance',
      'Completion filing',
      'Fire acceptance or fire check',
      'Planning and land verification',
      'Archive acceptance',
      'Water access confirmation',
      'Gas access confirmation',
      'Heat-supply access confirmation',
      'Drainage acceptance',
      'Sanitation facility filing',
      'Ancillary greening filing',
    ],
    resultDocumentNames: [
      'Joint acceptance material package',
      'Construction completion acceptance report',
      'Luoyang city-management access/filing form for water, gas, heat, drainage, sanitation, and greening',
    ],
    authorityName: 'Luoyang joint-acceptance lead authority / Luoyang City Administration Bureau',
  },
  {
    sampleKey: 'DG:general-civil-joint-acceptance-service-profile-202308',
    provinceCode: 'GD',
    cityCode: 'dongguan',
    cityName: 'Dongguan',
    businessTypeCode: 'general_civil',
    projectName: 'Dongguan building and municipal infrastructure joint completion acceptance official service profile',
    sourceName: 'Dongguan housing and construction bureau building and municipal joint completion acceptance guide and Dongjian 2023 No.6 notice',
    sourceUrl: 'https://zjj.dg.gov.cn/zjj_mgr/itemmanage/itemSecond/viewSecond.action?id=8a1288e98c165210018c38e8c347357d',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'planning_acceptance',
      'archive_acceptance',
      'civil_defense_acceptance',
      'fire_acceptance',
      'completion_filing',
      'telecom_acceptance',
    ],
    actualItemNames: [
      'Joint completion acceptance',
      'Building and municipal completion acceptance',
      'Planning condition verification',
      'Urban construction archive acceptance',
      'Civil-defense completion acceptance',
      'Special construction fire acceptance or fire filing',
      'Building and municipal completion filing',
      'Broadband fiber and 5G indoor distribution acceptance filing',
    ],
    resultDocumentNames: [
      'Dongguan building and municipal infrastructure joint completion acceptance opinion form',
      'Dongguan building and municipal completion filing certificate and filing form',
      'Telecommunications infrastructure acceptance filing commitment/result materials',
    ],
    authorityName: 'Dongguan Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'NN:general-civil-completion-filing-service-profile',
    provinceCode: 'GX',
    cityCode: 'nanning',
    cityName: 'Nanning',
    businessTypeCode: 'general_civil',
    projectName: 'Nanning construction completion filing and completion-stage acceptance official service profile',
    sourceName: 'Guangxi investment-project online approval platform Nanning construction completion filing guide and approval catalog',
    sourceUrl: 'https://zxsp.fgw.gxzf.gov.cn/metters/guid.jspx?id=2026D380BEB5EB9BA862BBA53FE75DE2',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'completion_filing',
      'completion_acceptance',
      'planning_acceptance',
      'fire_acceptance',
      'environment_acceptance',
      'civil_defense_acceptance',
      'lightning_acceptance',
    ],
    actualItemNames: [
      'Construction completion filing',
      'Completion acceptance report',
      'Planning approval or planning condition verification',
      'Fire acceptance for special or densely occupied projects',
      'Environmental protection facility completion acceptance',
      'Civil-defense completion filing',
      'Lightning-protection completion acceptance',
    ],
    resultDocumentNames: [
      'Construction completion filing form',
      'Construction completion acceptance report',
      'Planning approval document',
      'Fire acceptance certificate where legally required',
      'Environmental acceptance approval document',
    ],
    authorityName: 'Nanning housing-construction authority / Nanning administrative approval departments',
  },
  {
    sampleKey: 'ZH:general-civil-joint-acceptance-service-profile-202306',
    provinceCode: 'GD',
    cityCode: 'zhuhai',
    cityName: 'Zhuhai',
    businessTypeCode: 'general_civil',
    projectName: 'Zhuhai building and municipal infrastructure joint completion acceptance official service profile',
    sourceName: 'Zhuhai building and municipal infrastructure joint completion acceptance implementation plan 2.0',
    sourceUrl: 'https://zhsme.org.cn/newWebchatService/toTextPolicy?id=cd3e5a6e-ce6e-43dc-a1d2-ec86b8ae73e2',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'planning_acceptance',
      'fire_acceptance',
      'civil_defense_acceptance',
      'archive_acceptance',
      'gas_acceptance',
      'lightning_acceptance',
      'completion_filing',
    ],
    actualItemNames: [
      'Joint completion acceptance',
      'Building and municipal completion acceptance',
      'Planning condition verification',
      'Special fire acceptance or fire filing',
      'Civil-defense completion acceptance or offsite civil-defense permit',
      'Urban construction archive acceptance',
      'Gas facility completion acceptance',
      'Lightning-protection completion acceptance where required',
      'Joint acceptance opinion substituting completion filing opinion',
    ],
    resultDocumentNames: [
      'Zhuhai building and municipal infrastructure joint completion acceptance opinion',
      'Special acceptance or filing result documents attached to the joint acceptance opinion',
      'Completion filing-equivalent joint acceptance opinion',
    ],
    authorityName: 'Zhuhai Housing and Urban-Rural Construction Bureau / Zhuhai joint-acceptance office',
  },
  {
    sampleKey: 'LZ:general-civil-joint-acceptance-service-profile-202412',
    provinceCode: 'GS',
    cityCode: 'lanzhou',
    cityName: 'Lanzhou',
    businessTypeCode: 'general_civil',
    projectName: 'Lanzhou construction project joint acceptance one-thing official service profile',
    sourceName: 'Gansu housing-construction and big-data departments construction-project joint acceptance one-thing work plan',
    sourceUrl: 'https://www.qinan.gov.cn/info/12012/1369272.htm',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_filing',
      'archive_acceptance',
      'fire_acceptance',
      'planning_acceptance',
      'civil_defense_acceptance',
    ],
    actualItemNames: [
      'Construction project joint acceptance one-thing',
      'Construction completion filing',
      'Construction archive acceptance',
      'Special construction fire acceptance or fire filing',
      'Land verification and planning condition verification',
      'Civil-defense completion acceptance filing',
    ],
    resultDocumentNames: [
      'Joint acceptance unified opinion',
      'Construction completion filing result',
      'Special acceptance or filing documents generated through one form, one material set, one window, and one acceptance opinion',
    ],
    authorityName: 'Lanzhou construction-project approval reform authorities / Gansu joint-acceptance lead departments',
  },
  {
    sampleKey: 'GY:general-civil-qingzhen-completion-filing-service-profile',
    provinceCode: 'GZ',
    cityCode: 'guiyang',
    cityName: 'Guiyang',
    businessTypeCode: 'general_civil',
    projectName: 'Guiyang-administered Qingzhen building and municipal completion filing official service profile',
    sourceName: 'Guizhou Government Service Network Qingzhen building and municipal completion filing guide',
    sourceUrl: 'https://zwfw.guizhou.gov.cn/bsznindex.do?areacode=520181&orgcode=009710586&otheritemcode=11520181009710586X400101700600001',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'completion_filing',
      'completion_acceptance',
      'planning_acceptance',
      'fire_acceptance',
      'quality_supervision_report',
      'archive_acceptance',
      'lightning_acceptance',
    ],
    actualItemNames: [
      'Building and municipal completion filing',
      'Completion acceptance report',
      'Construction planning permit or completion planning approval',
      'Fire acceptance or filing opinion',
      'Engineering quality supervision report',
      'Construction archive acceptance document',
      'Lightning-protection device test report',
    ],
    resultDocumentNames: [
      'Completion filing form',
      'Completion acceptance report',
      'Planning approval document',
      'Fire acceptance or filing opinion',
      'Engineering archive acceptance document',
    ],
    authorityName: 'Qingzhen Housing and Urban-Rural Construction Bureau under Guiyang jurisdiction',
  },
  {
    sampleKey: 'GY:general-civil-vanke-lushan-e3-e5-completion-filing-202503',
    provinceCode: 'GZ',
    cityCode: 'guiyang',
    cityName: 'Guiyang',
    businessTypeCode: 'general_civil',
    projectName: 'Vanke Lushan Area E E3 and E5 residential buildings completion filing',
    sourceName: 'Guiyang Housing and Urban-Rural Construction Bureau March 2025 district completion filing monthly report',
    sourceUrl: 'https://zhujianju.guiyang.gov.cn/zfxxgk_5618855/fdzdgknr_5618858/gsgg_5618880/jgbaxxgs/202504/t20250415_87522689.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction project completion filing'],
    resultDocumentNames: [
      'Official completion filing monthly report row for Vanke Lushan Area E E3 and E5 residential buildings, construction unit Guiyang Guangsheng Xinde Real Estate Development Co., Ltd., completion date 2025-03-14, filing date 2025-03-18',
    ],
    authorityName: 'Guiyang Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'YB:general-civil-parallel-acceptance-service-profile-201911',
    provinceCode: 'SC',
    cityCode: 'yibin',
    cityName: 'Yibin',
    businessTypeCode: 'general_civil',
    projectName: 'Yibin building and urban infrastructure parallel completion acceptance official service profile',
    sourceName: 'Yibin housing and construction bureau building and urban infrastructure parallel completion acceptance implementation rules',
    sourceUrl: 'https://ybs.sczwfw.gov.cn/attach/0/fcee1c1634f746daa87ee894fa9587e5.pdf',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'completion_filing',
      'planning_acceptance',
      'fire_acceptance',
      'archive_acceptance',
      'civil_defense_acceptance',
      'lightning_acceptance',
      'quality_supervision_report',
      'landscape_acceptance',
      'sponge_city_acceptance',
      'energy_acceptance',
    ],
    actualItemNames: [
      'Parallel joint completion acceptance',
      'Construction completion acceptance report',
      'Construction completion filing document',
      'Planning verification and land verification',
      'Fire acceptance',
      'Construction archive acceptance',
      'Civil-defense completion acceptance',
      'Lightning-protection completion acceptance for specific works',
      'Quality supervision report',
      'Landscape or greening acceptance',
      'Sponge-city acceptance',
      'Building energy and green building acceptance',
    ],
    resultDocumentNames: [
      'Written qualified opinions from participating acceptance departments',
      'Construction completion acceptance report',
      'Engineering quality supervision report',
      'Construction completion filing document delivered through the comprehensive window',
    ],
    authorityName: 'Yibin Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'CD:general-civil-joint-acceptance-service-profile-202008',
    provinceCode: 'HE',
    cityCode: 'CD',
    cityName: 'Chengde',
    businessTypeCode: 'general_civil',
    projectName: 'Chengde building and municipal construction project joint completion acceptance official service profile',
    sourceName: 'Chengde Municipal People Government construction project joint completion acceptance implementation rules',
    sourceUrl: 'https://www.chengde.gov.cn/art/2020/9/2/art_11903_733229.html',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'quality_supervision_report',
      'fire_acceptance',
      'planning_acceptance',
      'civil_defense_acceptance',
      'archive_acceptance',
      'heat_supply_acceptance',
      'gas_acceptance',
      'water_supply_acceptance',
      'power_acceptance',
    ],
    actualItemNames: [
      'Construction project joint completion acceptance',
      'Construction quality acceptance',
      'Engineering quality supervision report',
      'Construction fire acceptance',
      'Planning approval content and planning condition verification',
      'Civil-defense completion quality acceptance',
      'Construction archive material acceptance',
      'Heat-supply supporting facility acceptance or connection confirmation',
      'Gas supporting facility acceptance or connection confirmation',
      'Water-supply supporting facility acceptance or connection confirmation',
      'Power supporting facility acceptance or connection confirmation',
    ],
    resultDocumentNames: [
      'Joint acceptance opinions issued by participating departments and utility units',
      'Unified joint acceptance confirmation',
      'Professional acceptance opinions for quality, fire, planning, land-use, civil defense, archive, and utility interfaces',
    ],
    authorityName: 'Chengde administrative approval, housing-construction, natural-resources, civil-defense, archive, and utility joint-acceptance authorities',
  },
  {
    sampleKey: 'YT:general-civil-completion-certificate-service-profile-202411',
    provinceCode: 'SD',
    cityCode: 'yantai',
    cityName: 'Yantai',
    businessTypeCode: 'general_civil',
    projectName: 'Yantai completion-to-certificate joint acceptance official service profile',
    sourceName: 'Yantai Municipal People Government long-term land and housing property-right protection mechanism policy',
    sourceUrl: 'https://www.yantai.gov.cn/art/2024/11/1/art_99956_73739.html',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'completion_filing',
      'planning_acceptance',
      'fire_acceptance',
      'civil_defense_acceptance',
      'archive_acceptance',
    ],
    actualItemNames: [
      'Completion joint acceptance',
      'Construction completion acceptance',
      'Construction completion filing',
      'Planning and land verification',
      'Fire acceptance',
      'Civil-defense acceptance',
      'Construction archive acceptance',
    ],
    resultDocumentNames: [
      'Unified joint acceptance opinion',
      'Planning, land, fire, civil-defense, and archive acceptance opinions',
      'Construction completion filing materials supporting first real-estate registration',
    ],
    authorityName: 'Yantai natural-resources, housing-construction, administrative-approval, civil-defense, and archive joint-acceptance authorities',
  },
  {
    sampleKey: 'HK:general-civil-government-investment-joint-acceptance-service-profile-202110',
    provinceCode: 'HI',
    cityCode: 'haikou',
    cityName: 'Haikou',
    businessTypeCode: 'general_civil',
    projectName: 'Haikou government-investment construction project joint acceptance official service profile',
    sourceName: 'Haikou Municipal Government Investment Project Management Rules',
    sourceUrl: 'https://ggzy.haikou.gov.cn/wenzhang/1026',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'completion_filing',
      'planning_acceptance',
      'quality_supervision_report',
      'fire_acceptance',
      'civil_defense_acceptance',
      'landscape_acceptance',
    ],
    actualItemNames: [
      'Government-investment project joint acceptance',
      'Project completion acceptance',
      'Construction completion filing',
      'Planning and land joint acceptance',
      'Engineering quality supervision acceptance',
      'Fire acceptance',
      'Civil-defense acceptance',
      'Supporting greening completion acceptance',
    ],
    resultDocumentNames: [
      'Unified joint acceptance opinion',
      'Construction completion filing record handled by the housing-construction authority',
      'Planning, land, quality, fire, and civil-defense acceptance opinions',
    ],
    authorityName: 'Haikou housing-construction, natural-resources, fire, civil-defense, quality-supervision, and greening authorities',
  },
  {
    sampleKey: 'CZ:general-civil-joint-acceptance-service-profile-201910',
    provinceCode: 'JS',
    cityCode: 'changzhou',
    cityName: 'Changzhou',
    businessTypeCode: 'general_civil',
    projectName: 'Changzhou construction project joint completion acceptance official service profile',
    sourceName: 'Changzhou Municipal People Government construction-project approval reform implementation plan and housing-construction joint-acceptance one-thing practice page',
    sourceUrl: 'https://www.changzhou.gov.cn/gi_news/666157068450980',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'planning_acceptance',
      'fire_acceptance',
      'civil_defense_acceptance',
      'archive_acceptance',
    ],
    actualItemNames: [
      'Construction project joint completion acceptance',
      'Construction completion acceptance',
      'Planning and land limited-time joint acceptance',
      'Fire acceptance',
      'Civil-defense acceptance',
      'Construction archive acceptance',
    ],
    resultDocumentNames: [
      'Unified joint acceptance opinion',
      'Unified completion acceptance drawings and acceptance standards',
      'Fire and archive joint acceptance materials demonstrated through the one-thing service workflow',
    ],
    authorityName: 'Changzhou housing-construction, natural-resources, fire, civil-defense, and archive joint-acceptance authorities',
  },
  {
    sampleKey: 'QQHE:general-civil-joint-acceptance-service-profile-202410',
    provinceCode: 'HLJ',
    cityCode: 'QQHE',
    cityName: 'Qiqihar',
    businessTypeCode: 'general_civil',
    projectName: 'Qiqihar building and municipal infrastructure joint completion acceptance official service profile',
    sourceName: 'Qiqihar building and municipal infrastructure project joint completion acceptance implementation rules',
    sourceUrl: 'https://www.hlj.gov.cn/hljzqc/c100118/202410/c00_31782325.shtml',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'completion_filing',
      'planning_acceptance',
      'civil_defense_acceptance',
      'fire_acceptance',
      'archive_acceptance',
      'water_supply_acceptance',
      'drainage_acceptance',
      'heat_supply_acceptance',
      'power_acceptance',
      'gas_acceptance',
      'telecom_acceptance',
    ],
    actualItemNames: [
      'Joint completion acceptance',
      'Construction completion acceptance',
      'Completion filing through joint acceptance opinion',
      'Construction planning verification',
      'Civil-defense completion acceptance filing',
      'Construction fire acceptance or filing',
      'Construction archive acceptance',
      'Water-supply service readiness',
      'Drainage service readiness',
      'Heat-supply service readiness',
      'Power service readiness',
      'Gas service readiness',
      'Telecom and broadcast television service readiness',
    ],
    resultDocumentNames: [
      'Qiqihar construction project joint completion acceptance opinion',
      'Planning, civil-defense, fire, and archive acceptance opinions',
      'Joint acceptance opinion deemed as completion filing result',
    ],
    authorityName: 'Qiqihar housing-construction, natural-resources, civil-defense, fire, archive, and municipal utility joint-acceptance authorities',
  },
  {
    sampleKey: 'WF:general-civil-linqu-commitment-joint-acceptance-service-profile-202308',
    provinceCode: 'SD',
    cityCode: 'weifang',
    cityName: 'Weifang',
    businessTypeCode: 'general_civil',
    projectName: 'Weifang-administered Linqu key construction project commitment and joint acceptance official service profile',
    sourceName: 'Linqu County People Government key construction project commitment-to-start reform implementation plan citing Weifang commitment approval rules',
    sourceUrl: 'https://www.linqu.gov.cn/102/29119/1694977803327508480.html',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'planning_acceptance',
      'fire_acceptance',
      'civil_defense_acceptance',
      'landscape_acceptance',
      'drainage_acceptance',
      'energy_acceptance',
    ],
    actualItemNames: [
      'Joint acceptance before completion acceptance',
      'Construction completion acceptance',
      'Planning condition verification materials',
      'Fire acceptance or fire technical approval chain',
      'Civil-defense approval or civil-defense procedure materials where applicable',
      'Ancillary greening completion acceptance',
      'Drainage facility acceptance and discharge permit closeout',
      'Fixed-asset energy assessment before completion acceptance',
    ],
    resultDocumentNames: [
      'Joint acceptance application and construction dossier materials submitted to housing-construction authority',
      'Planning verification materials',
      'Greening, drainage, and energy-assessment closeout materials where applicable',
    ],
    authorityName: 'Linqu administrative approval and housing-construction authorities under Weifang jurisdiction',
  },
  {
    sampleKey: 'MY:general-civil-approval-reform-joint-acceptance-service-profile-201907',
    provinceCode: 'SC',
    cityCode: 'mianyang',
    cityName: 'Mianyang',
    businessTypeCode: 'general_civil',
    projectName: 'Mianyang construction project approval reform and joint completion acceptance official service profile',
    sourceName: 'Mianyang Municipal People Government Office construction-project approval reform implementation plan',
    sourceUrl: 'https://mysztx.sczwfw.gov.cn/picture/old/3975929897152425984.pdf',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'official_city_entry',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_acceptance',
      'completion_filing',
      'archive_acceptance',
      'planning_acceptance',
      'quality_supervision_report',
      'fire_acceptance',
      'civil_defense_acceptance',
      'lightning_acceptance',
      'national_security_acceptance',
      'water_supply_acceptance',
      'power_acceptance',
      'gas_acceptance',
      'drainage_acceptance',
      'telecom_acceptance',
    ],
    actualItemNames: [
      'Joint completion acceptance',
      'Construction completion acceptance',
      'Completion filing',
      'Construction archive acceptance',
      'Planning verification',
      'Quality acceptance supervision',
      'Fire acceptance or filing',
      'Civil-defense acceptance',
      'Lightning-protection acceptance where required',
      'National-security project completion acceptance where required',
      'Water utility connection after completion acceptance',
      'Power utility connection after completion acceptance',
      'Gas utility connection after completion acceptance',
      'Drainage utility connection after completion acceptance',
      'Telecom utility connection after completion acceptance',
    ],
    resultDocumentNames: [
      'Unified joint acceptance opinion',
      'Unified completion acceptance drawings and acceptance standards',
      'Completion filing and utility connection result materials',
    ],
    authorityName: 'Mianyang housing-construction, natural-resources, civil-defense, archive, fire, meteorology, national-security, and utility authorities',
  },
  {
    sampleKey: 'ZZ:general-civil-wanbolong-commercial-plaza-joint-acceptance-202205',
    provinceCode: 'HN',
    cityCode: 'zhuzhou',
    cityName: 'Zhuzhou',
    businessTypeCode: 'general_civil',
    projectName: 'Zhuzhou Wanbolong commercial plaza joint acceptance and opening approval',
    sourceName: 'Hunan Provincial People Government portal Hunan Daily report on project approval reform iteration',
    sourceUrl: 'https://www.hunan.gov.cn/topic/yjsycb/ymjj/202205/t20220517_24619165.html',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: [
      'comprehensive_acceptance',
      'completion_filing',
      'public_assembly_fire_safety_check',
    ],
    actualItemNames: [
      'Construction project joint acceptance',
      'Completion filing',
      'Public gathering place pre-use and pre-opening fire safety inspection',
    ],
    resultDocumentNames: [
      'Hunan Province Zhuzhou construction project joint acceptance certificate',
      'Construction completion filing form',
      'Public gathering place pre-use and pre-opening fire safety inspection opinion',
    ],
    authorityName: 'Zhuzhou housing-construction and administrative approval authorities',
  },
  {
    sampleKey: 'SH:renovation-hejian-road-interior-decoration-completion-filing-201203',
    provinceCode: 'SH',
    cityCode: 'shanghai',
    cityName: 'Shanghai',
    businessTypeCode: 'renovation',
    projectName: 'Hejian Road real-estate internal decoration project completion filing',
    sourceName: 'Shanghai Yangpu District Construction and Transport Commission construction project completion filing public page',
    sourceUrl: 'https://www.shyp.gov.cn/yp-zwgk/zwgk/buffersInformation/details?id=ac4235a6-2458-4745-bc16-953f5b0dc54f',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction completion filing'],
    resultDocumentNames: ['Completion filing public record with project registration number, project name, filing authority, and filing date'],
    authorityName: 'Shanghai Yangpu District Construction and Transport Commission',
  },
  {
    sampleKey: 'DG:industrial-jinglue-factory-water-conservation-acceptance-filing-202507',
    provinceCode: 'GD',
    cityCode: 'dongguan',
    cityName: 'Dongguan',
    businessTypeCode: 'industrial',
    projectName: 'Jinglue electronics industrial factory buildings 3 and 4 product testing project water-conservation facility acceptance filing',
    sourceName: 'Dongguan Water Affairs Bureau production and construction project water-conservation facility acceptance filing public list',
    sourceUrl: 'https://dgwater.dg.gov.cn/gkmlpt/content/4/4419/post_4419554.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['water_conservation_acceptance'],
    actualItemNames: ['Production and construction project water-conservation facility acceptance filing'],
    resultDocumentNames: [
      'Water-conservation facility acceptance filing record Dongguan water-conservation filing 2025-0709 with receipt and completion dates',
    ],
    authorityName: 'Dongguan Water Affairs Bureau',
  },
  {
    sampleKey: 'DG:industrial-huisheng-wool-textile-factory-completion-filing-202606',
    provinceCode: 'GD',
    cityCode: 'dongguan',
    cityName: 'Dongguan',
    businessTypeCode: 'industrial',
    projectName: 'Dongguan Huisheng Industrial Investment wool textile production project building 1 factory completion filing',
    sourceName: 'Dongguan Housing and Urban-Rural Construction Bureau completion filing information public list',
    sourceUrl: 'https://zjj.dg.gov.cn/mware_cms/xxgs/finishRecordList.action?page=1&rows=10',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Building completion acceptance filing'],
    resultDocumentNames: [
      'Completion filing public row: record 441900202606040002, project Dongguan Huisheng Industrial Investment wool textile production project building 1 factory, construction unit Dongguan Huisheng Industrial Investment Co., Ltd., filing date 2026-06-04',
    ],
    authorityName: 'Dongguan Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'ZH:industrial-pingsha-shucheng-industrial-park-joint-acceptance-202605',
    provinceCode: 'GD',
    cityCode: 'zhuhai',
    cityName: 'Zhuhai',
    businessTypeCode: 'industrial',
    projectName: 'Zhuhai Pingsha Shucheng Industrial Park project joint acceptance and completion filing',
    sourceName: 'Zhuhai Housing and Urban-Rural Construction Bureau completion acceptance filing information public service',
    sourceUrl: 'https://zjj.zhuhai.gov.cn/wafdirectionipv4/aHR0cHM6Ly96aGdqLnpoc3pqai5jb20=/aplanmis-mall/rest/zhzj/getJgysbaZhzj?pageNum=1&pageSize=10',
    evidenceScope: 'joint_acceptance_and_completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['comprehensive_acceptance', 'completion_filing'],
    actualItemNames: ['Joint acceptance', 'Completion acceptance filing'],
    resultDocumentNames: [
      'Zhuhai completion acceptance filing public row: project Zhuhai Pingsha Shucheng Industrial Park, construction unit Zhuhai Shucheng Factory Development Co., Ltd., joint acceptance record Zhu Jin Lian Yan 2026 No. 022, filing date 2026-05-29',
    ],
    authorityName: 'Zhuhai Housing and Urban-Rural Construction Bureau',
  },
  {
    sampleKey: 'XA:general-civil-zhonghai-xueshili-completion-registration-202412',
    provinceCode: 'SN',
    cityCode: 'xian',
    cityName: "Xi'an",
    businessTypeCode: 'general_civil',
    projectName: "Xi'an High-Tech Zone Zhonghai Xueshili residential project completion filing and first registration",
    sourceName: "Shaanxi Natural Resources Department Xi'an High-Tech Zone inspection-registration integration public project page",
    sourceUrl: 'https://zrzyt.shaanxi.gov.cn/news/sxxx/xa/202412/t20241230_3275971.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['planning_acceptance', 'completion_filing'],
    actualItemNames: ['Planning condition verification', 'Completion filing'],
    resultDocumentNames: [
      'Planning condition verification opinion',
      'Completion filing forms for 17 residential buildings',
      'First real-estate registration certificate issued through inspection-registration integration',
    ],
    authorityName: "Xi'an natural-resources, housing-construction, and administrative approval authorities",
  },
  {
    sampleKey: 'URUMQI:data-center-fengyun-4-ground-system-environment-acceptance-202303',
    provinceCode: 'XJ',
    cityCode: 'urumqi',
    cityName: 'Urumqi',
    businessTypeCode: 'data_center',
    projectName: 'Fengyun-4 research satellite ground application system including Urumqi station environmental acceptance',
    sourceName: 'National Satellite Meteorological Center Fengyun-4 ground application system environmental completion acceptance public notice',
    sourceUrl: 'https://www.nsmc.org.cn/nsmc/cn/news/123033.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental protection completion acceptance'],
    resultDocumentNames: [
      'Environmental acceptance monitoring report',
      'Environmental acceptance opinion',
      'Other explanation materials published with the acceptance notice',
    ],
    authorityName: 'National Satellite Meteorological Center',
  },
  {
    sampleKey: 'URUMQI:renovation-petrochina-hetian-street-gas-station-completion-acceptance-202410',
    provinceCode: 'XJ',
    cityCode: 'urumqi',
    cityName: 'Urumqi',
    businessTypeCode: 'renovation',
    projectName: 'PetroChina Xinjiang Sales Urumqi branch Hetian Street gas station renovation project',
    sourceName: 'Urumqi government-service engineering-construction project handling publicity',
    sourceUrl: 'https://zwfw.wlmq.gov.cn/themes/icity/engineering/projectchart/progress?item_name=%E4%B8%AD%E7%9F%B3%E6%B2%B9%E6%96%B0%E7%96%86%E9%94%80%E5%94%AE%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8%E4%B9%8C%E9%B2%81%E6%9C%A8%E9%BD%90%E5%88%86%E5%85%AC%E5%8F%B8%E5%92%8C%E7%94%B0%E8%A1%97%E5%8A%A0%E6%B2%B9%E7%AB%99%E6%94%B9%E9%80%A0%E9%A1%B9%E7%9B%AE',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance', 'fire_acceptance'],
    actualItemNames: ['Housing and municipal works completion acceptance supervision', 'Special construction fire acceptance'],
    resultDocumentNames: [
      'Official project handling publicity row: completion acceptance stage, business serial number 2024092915160602242, stage state completed, actual finish time 2024-10-31',
      'Item row: Urumqi Shayibak District Construction Bureau handled housing and municipal works completion acceptance supervision, receive number 11650103MB1163258L465101705900003202409290002',
      'Item row: Urumqi Shayibak District Construction Bureau handled special construction fire acceptance, receive number 11650103MB1163258L40001170510000220240929G3h1',
    ],
    authorityName: 'Urumqi Shayibak District Construction Bureau',
  },
  {
    sampleKey: 'YT:industrial-shandong-bandao-south-3-offshore-wind-environment-acceptance-202206',
    provinceCode: 'SD',
    cityCode: 'yantai',
    cityName: 'Yantai',
    businessTypeCode: 'industrial',
    projectName: 'Shandong Bandao South No.3 offshore wind-power project environmental-protection completion acceptance',
    sourceName: 'Yantai Municipal People Government public approval decision for construction-project environmental-protection completion acceptance',
    sourceUrl: 'https://www.yantai.gov.cn/art/2022/6/6/art_43294_2978497.html',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance approval decision for Shandong Bandao South No.3 offshore wind-power project',
    ],
    authorityName: 'Yantai ecological-environment authority',
  },
  {
    sampleKey: 'YT:industrial-marine-fishery-germplasm-resource-bank-completion-acceptance-202506',
    provinceCode: 'SD',
    cityCode: 'yantai',
    cityName: 'Yantai',
    businessTypeCode: 'industrial',
    projectName: 'National marine fishery biological germplasm resource bank construction and installation project',
    sourceName: 'Yantai Municipal People Government departmental public article',
    sourceUrl: 'https://www.yantai.gov.cn/art/2025/6/10/art_11748_3203594.html',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['Construction and installation project completion acceptance'],
    resultDocumentNames: [
      'Yantai Municipal People Government article confirming the national marine fishery biological germplasm resource bank construction and installation project passed completion acceptance',
    ],
    authorityName: 'Yantai Municipal People Government / project construction acceptance authorities',
  },
  {
    sampleKey: 'WF:general-civil-linqu-planned-roads-completion-certificate-202412',
    provinceCode: 'SD',
    cityCode: 'weifang',
    cityName: 'Weifang',
    businessTypeCode: 'general_civil',
    projectName: 'Linqu planned road construction-project completion acceptance certificate',
    sourceName: 'Linqu County People Government public construction-project completion acceptance certificate page',
    sourceUrl: 'https://www.linqu.gov.cn/102/7466/1873540126324428800.html',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['Construction-project completion acceptance'],
    resultDocumentNames: [
      'Construction-project completion acceptance certificate with project name and certificate publication page',
    ],
    authorityName: 'Linqu County housing-construction authority',
  },
  {
    sampleKey: 'CZ:industrial-qiangli-electronic-materials-environment-acceptance-201804',
    provinceCode: 'JS',
    cityCode: 'changzhou',
    cityName: 'Changzhou',
    businessTypeCode: 'industrial',
    projectName: 'Changzhou Qiangli Electronic New Material Co., Ltd. electronic-specialty materials construction project environmental-protection completion acceptance',
    sourceName: 'Changzhou ecological-environment authority hosted construction-project environmental-protection completion acceptance monitoring report',
    sourceUrl: 'https://sthjj.changzhou.gov.cn/uploadfile/hbj/2018/0427/20180427153516_36500.pdf',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance monitoring report with project name, location, acceptance stage, and prior acceptance approval references',
    ],
    authorityName: 'Changzhou ecological-environment authority',
  },
  {
    sampleKey: 'CD:industrial-faw-volkswagen-chengdu-environment-acceptance-201203',
    provinceCode: 'SC',
    cityCode: 'chengdu',
    cityName: 'Chengdu',
    businessTypeCode: 'industrial',
    projectName: 'FAW-Volkswagen Chengdu 350,000 passenger-car construction project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/ywgz/hjyxpj/jsxmhjyxpj/ypzxmgg/201605/t20160522_340930.shtml',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2012 No. 53 for FAW-Volkswagen Chengdu passenger-car project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'CD:general-civil-yuelin-completion-filing-202507',
    provinceCode: 'SC',
    cityCode: 'chengdu',
    cityName: 'Chengdu',
    businessTypeCode: 'general_civil',
    projectName: 'Chengdu Yuelin Real Estate construction completion filing public case',
    sourceName: 'Chengdu / Sichuan government-service engineering-construction public case list',
    sourceUrl: 'https://cds.sczwfw.gov.cn/wwdt/epointcdzwfw/pages/bjgs/handlepublicity.html',
    evidenceScope: 'completion_filing_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_filing'],
    actualItemNames: ['Construction project completion filing'],
    resultDocumentNames: [
      'Official public case flow STD202507090023: phase 竣工验收阶段, task 建设工程竣工验收备案, applicant 成都樾林置业有限公司, accepted 2025-07-09 10:21:00, status 正常办结',
    ],
    authorityName: 'Chengdu / Sichuan government-service engineering-construction approval platform',
  },
  {
    sampleKey: 'DL:industrial-dalian-lng-environment-acceptance-201307',
    provinceCode: 'LN',
    cityCode: 'dalian',
    cityName: 'Dalian',
    businessTypeCode: 'industrial',
    projectName: 'PetroChina Dalian LNG project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/ywgz/hjyxpj/jsxmhjyxpj/ypzxmgg/201605/t20160522_340932.shtml',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2013 No. 147 for Dalian LNG project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'FS:industrial-nanhai-power-plant-environment-acceptance-201209',
    provinceCode: 'GD',
    cityCode: 'foshan',
    cityName: 'Foshan',
    businessTypeCode: 'industrial',
    projectName: 'Nanhai Power Plant Phase 1 oil-to-gas unit conversion project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/ywgz/hjyxpj/jsxmhjyxpj/ypzxmgg/201605/t20160522_340917.shtml',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2012 No. 180 for Nanhai Power Plant conversion project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'HF:general-civil-steady-high-magnetic-field-environment-acceptance-201707',
    provinceCode: 'AH',
    cityCode: 'hefei',
    cityName: 'Hefei',
    businessTypeCode: 'general_civil',
    projectName: 'Steady high magnetic field experimental facility environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201707/t20170728_418684.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2017 No. 30 for steady high magnetic field experimental facility',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'TY:industrial-longquan-coal-mine-environment-acceptance-201609',
    provinceCode: 'SX',
    cityCode: 'taiyuan',
    cityName: 'Taiyuan',
    businessTypeCode: 'industrial',
    projectName: 'Taiyuan Dongshan Coal and Electricity Group Longquan mine environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201609/t20160922_364524.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2016 No. 72 for Taiyuan Longquan mine project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'HRB:industrial-harbin-500kv-transmission-environment-acceptance-201407',
    provinceCode: 'HLJ',
    cityCode: 'harbin',
    cityName: 'Harbin',
    businessTypeCode: 'industrial',
    projectName: 'Harbin 500kV power transmission and transformation project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201407/t20140708_278396.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion for Harbin 500kV transmission and transformation project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'ZH:transportation-zhuhai-port-coal-terminal-environment-acceptance-201609',
    provinceCode: 'GD',
    cityCode: 'zhuhai',
    cityName: 'Zhuhai',
    businessTypeCode: 'transportation_hub',
    projectName: 'Zhuhai Port Gaolan Port coal-terminal project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201609/t20160920_364392.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion for Zhuhai Port Gaolan Port coal-terminal project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'NN:transportation-nanning-wuxu-airport-environment-acceptance-201412',
    provinceCode: 'GX',
    cityCode: 'nanning',
    cityName: 'Nanning',
    businessTypeCode: 'transportation_hub',
    projectName: 'Nanning Wuxu International Airport new terminal area and supporting facility expansion environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201412/t20141212_292932.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 244 for Nanning Wuxu International Airport expansion project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'QQHE:general-civil-nierji-water-conservancy-environment-acceptance-201402',
    provinceCode: 'HLJ',
    cityCode: 'QQHE',
    cityName: 'Qiqihar',
    businessTypeCode: 'general_civil',
    projectName: 'Nierji water-conservancy hub environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201402/t20140213_267696.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 4 for Nierji water-conservancy hub',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'QQHE:industrial-qiqihar-yili-factory-completion-fire-acceptance-202307',
    provinceCode: 'HLJ',
    cityCode: 'QQHE',
    cityName: 'Qiqihar',
    businessTypeCode: 'industrial',
    projectName: 'Qiqihar Yili Dairy factory construction and green-factory improvement projects',
    sourceName: 'Heilongjiang Department of Industry and Information Technology green-factory case page',
    sourceUrl: 'https://gxt.hlj.gov.cn/gxt/c107069/202307/c00_31653221.shtml',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance', 'fire_acceptance', 'environment_acceptance'],
    actualItemNames: [
      'Construction completion acceptance',
      'Fire acceptance and filing',
      'Environmental and safety three-simultaneous approval and acceptance',
    ],
    resultDocumentNames: [
      'Official green-factory case confirming planning permit, safety and environmental approvals, completion acceptance, chemical-reagent warehouse fire acceptance and filing, and energy assessment report',
    ],
    authorityName: 'Heilongjiang industry-information authority / Qiqihar project acceptance authorities',
  },
  {
    sampleKey: 'CHENGDE:industrial-hanhai-guyuan-pingancheng-transmission-environment-acceptance-201605',
    provinceCode: 'HE',
    cityCode: 'CD',
    cityName: 'Chengde',
    businessTypeCode: 'industrial',
    projectName: 'Hanhai-Guyuan-Pingancheng 500kV transmission and transformation project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201605/t20160518_337842.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion for the Hanhai-Guyuan-Pingancheng 500kV project involving Chengde',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'CHENGDE:general-civil-shuangfengsi-reservoir-completion-preacceptance-202012',
    provinceCode: 'HE',
    cityCode: 'CD',
    cityName: 'Chengde',
    businessTypeCode: 'general_civil',
    projectName: 'Hebei Chengde Shuangfengsi reservoir project completion technical pre-acceptance',
    sourceName: 'Chengde Municipal People Government public project article',
    sourceUrl: 'https://www.chengde.gov.cn/art/2020/12/25/art_360_675619.html',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance', 'archive_acceptance', 'water_conservation_acceptance', 'environment_acceptance'],
    actualItemNames: [
      'Completion technical pre-acceptance',
      'Construction archive special acceptance report review',
      'Water-conservation special acceptance report review',
      'Environmental-protection special acceptance report review',
    ],
    resultDocumentNames: [
      'Hebei Chengde Shuangfengsi reservoir project completion technical pre-acceptance report',
      'Official article confirming project quality qualified, initial operation normal, archive materials basically complete, and completion acceptance conditions satisfied',
    ],
    authorityName: 'Chengde Municipal Government / Chengde Water Affairs Bureau completion-acceptance organization',
  },
  {
    sampleKey: 'LUOYANG:industrial-sinopec-sulfur-recovery-environment-acceptance-201409',
    provinceCode: 'HA',
    cityCode: 'luoyang',
    cityName: 'Luoyang',
    businessTypeCode: 'industrial',
    projectName: 'Sinopec Luoyang branch 2.6 million t/a diesel quality upgrade supporting sulfur-recovery project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201409/t20140930_289809.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 194 for Sinopec Luoyang diesel-upgrade supporting sulfur-recovery project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'LY:industrial-luoyang-comprehensive-bonded-zone-national-joint-acceptance-202112',
    provinceCode: 'HA',
    cityCode: 'LY',
    cityName: 'Luoyang',
    businessTypeCode: 'industrial',
    projectName: 'Luoyang Comprehensive Bonded Zone national joint acceptance',
    sourceName: 'State Administration of Foreign Exchange Henan Branch public article on Luoyang Comprehensive Bonded Zone acceptance',
    sourceUrl: 'https://www.safe.gov.cn/henan/2022/0303/1132.html',
    evidenceScope: 'joint_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['comprehensive_acceptance'],
    actualItemNames: ['National joint acceptance for comprehensive bonded-zone operation readiness'],
    resultDocumentNames: [
      'Official public article confirming Luoyang Comprehensive Bonded Zone passed joint acceptance by the General Administration of Customs, State Administration of Foreign Exchange, and other ministries on 2021-12-02',
    ],
    authorityName: 'General Administration of Customs, State Administration of Foreign Exchange, and other national joint-acceptance authorities',
  },
  {
    sampleKey: 'KM:industrial-yunnan-salt-vacuum-salt-environment-acceptance-201408',
    provinceCode: 'YN',
    cityCode: 'kunming',
    cityName: 'Kunming',
    businessTypeCode: 'industrial',
    projectName: 'Yunnan salt chemical 800,000 t/a vacuum salt production facility environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201408/t20140821_288062.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 156 for Yunnan salt chemical vacuum salt project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'HHHT:industrial-fengtai-power-phase-2-environment-acceptance-201410',
    provinceCode: 'NM',
    cityCode: 'hohhot',
    cityName: 'Hohhot',
    businessTypeCode: 'industrial',
    projectName: 'Inner Mongolia Fengtai power plant phase 2 environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201410/t20141030_290898.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 212 for Inner Mongolia Fengtai power plant phase 2',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'GY:industrial-hazardous-medical-waste-center-environment-acceptance-201402',
    provinceCode: 'GZ',
    cityCode: 'guiyang',
    cityName: 'Guiyang',
    businessTypeCode: 'industrial',
    projectName: 'Guiyang hazardous waste and medical waste disposal center environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201402/t20140213_267694.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 2 for Guiyang hazardous waste and medical waste disposal center',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'LZ:industrial-lanzhou-petrochemical-ethylene-revamp-environment-acceptance-201612',
    provinceCode: 'GS',
    cityCode: 'lanzhou',
    cityName: 'Lanzhou',
    businessTypeCode: 'industrial',
    projectName: 'Lanzhou petrochemical ethylene revamp project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201612/t20161222_369428.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2016 No. 115 for Lanzhou petrochemical ethylene revamp project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'YB:industrial-fuxi-power-plant-environment-acceptance-201402',
    provinceCode: 'SC',
    cityCode: 'yibin',
    cityName: 'Yibin',
    businessTypeCode: 'industrial',
    projectName: 'Sichuan Huadian Yibin Fuxi power plant new-build project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201402/t20140219_267925.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 19 for Sichuan Huadian Yibin Fuxi power plant',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'YB:industrial-yibin-comprehensive-bonded-zone-national-acceptance-202407',
    provinceCode: 'SC',
    cityCode: 'yibin',
    cityName: 'Yibin',
    businessTypeCode: 'industrial',
    projectName: 'Yibin comprehensive bonded zone project',
    sourceName: 'Sichuan Provincial People Government public article on Yibin comprehensive bonded zone national formal acceptance',
    sourceUrl: 'https://www.sc.gov.cn/10462/10464/10465/10595/2024/7/18/57e9c33629c544f4a3fbe890412b1090.shtml',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['National formal acceptance'],
    resultDocumentNames: [
      'Sichuan Provincial People Government article confirming Yibin comprehensive bonded zone passed formal acceptance by the national joint acceptance group organized by eight ministries including the General Administration of Customs',
    ],
    authorityName: 'National joint acceptance group / Sichuan Provincial People Government',
  },
  {
    sampleKey: 'MY:industrial-mianyang-south-500kv-substation-environment-acceptance-202202',
    provinceCode: 'SC',
    cityCode: 'mianyang',
    cityName: 'Mianyang',
    businessTypeCode: 'industrial',
    projectName: 'Sichuan Mianyang South 500kV transmission and transformation project environmental-protection completion acceptance',
    sourceName: 'Sichuan Department of Ecology and Environment radiation project environmental impact approval public page',
    sourceUrl: 'https://sthjt.sc.gov.cn/sthjt/c103940/2025/11/10/e5d8e87a149c43a7856f785167a8a5b2.shtml',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'State Grid Sichuan Electric Power technology notice Chuan Dian Keji 2022 No. 9 confirming completion environmental-protection acceptance for Sichuan Mianyang South 500kV transmission and transformation project',
    ],
    authorityName: 'Sichuan Department of Ecology and Environment / State Grid Sichuan Electric Power',
  },
  {
    sampleKey: 'MY:transportation-mianyang-xichong-expressway-completion-acceptance-202407',
    provinceCode: 'SC',
    cityCode: 'mianyang',
    cityName: 'Mianyang',
    businessTypeCode: 'transportation_hub',
    projectName: 'Mianyang to Xichong expressway project',
    sourceName: 'Sichuan Department of Transportation project completion acceptance public article from Mianyang Transportation Bureau',
    sourceUrl: 'https://jtt.sc.gov.cn/jtt/c101534/2024/7/18/0db9e779d21d4287a57692ae5be21d4c.shtml',
    evidenceScope: 'completion_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['completion_acceptance'],
    actualItemNames: ['Project completion acceptance'],
    resultDocumentNames: [
      'Official transportation department article confirming the Mianyang to Xichong expressway project passed completion acceptance on July 17, 2024, completed all construction procedures, and was officially put into operation',
    ],
    authorityName: 'Sichuan Department of Transportation / Mianyang Transportation Bureau',
  },
  {
    sampleKey: 'HK:industrial-haikou-waste-to-energy-final-acceptance-201711',
    provinceCode: 'HI',
    cityCode: 'haikou',
    cityName: 'Haikou',
    businessTypeCode: 'industrial',
    projectName: 'Haikou municipal solid-waste incineration power plant phase 1 and phase 2 final environmental acceptance',
    sourceName: 'Hainan Provincial People Government central ecological-environmental inspection rectification public table',
    sourceUrl: 'https://en.hainan.gov.cn/hainan/zysthjxxgk/201908/bad744bd533e4ea799a34964c5449c42.shtml?ddtab=true',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance', 'completion_acceptance'],
    actualItemNames: [
      'Construction project environmental-protection completion acceptance',
      'Final project acceptance',
    ],
    resultDocumentNames: [
      'Hainan Provincial People Government rectification public table confirming final acceptance of Haikou municipal solid-waste incineration power plant phase 1 and phase 2 and complete environmental operation procedures',
    ],
    authorityName: 'Hainan Provincial People Government / Haikou ecological-environment authority',
  },
  {
    sampleKey: 'XZ:industrial-jiama-copper-polymetallic-environment-acceptance-201411',
    provinceCode: 'XZ',
    cityCode: 'lhasa',
    cityName: 'Lhasa',
    businessTypeCode: 'industrial',
    projectName: 'Tibet Huatailong Jiama copper polymetallic mine processing technical renovation project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201411/t20141105_291157.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 229 for Tibet Huatailong Jiama copper polymetallic mine processing renovation project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'QH:industrial-kunlun-soda-ash-environment-acceptance-201409',
    provinceCode: 'QH',
    cityCode: 'haixi',
    cityName: 'Haixi',
    businessTypeCode: 'industrial',
    projectName: 'China Salt Qinghai Kunlun Alkali 1 million t/a soda ash project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201409/t20140930_289810.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2014 No. 202 for China Salt Qinghai Kunlun Alkali 1 million t/a soda ash project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
  },
  {
    sampleKey: 'NX:industrial-yipin-corn-processing-environment-acceptance-201501',
    provinceCode: 'NX',
    cityCode: 'yinchuan',
    cityName: 'Yinchuan',
    businessTypeCode: 'industrial',
    projectName: 'Ningxia Yipin Biotechnology 450,000 t/a corn deep-processing project environmental-protection completion acceptance',
    sourceName: 'Ministry of Ecology and Environment construction-project environmental-protection completion acceptance opinion announcement',
    sourceUrl: 'https://www.mee.gov.cn/gkml/sthjbgw/spwj1/201501/t20150123_294752.htm',
    evidenceScope: 'specialty_acceptance_occurrence_check',
    sampleGranularity: 'named_public_project',
    actualItemCodes: ['environment_acceptance'],
    actualItemNames: ['Construction project environmental-protection completion acceptance'],
    resultDocumentNames: [
      'Environmental-protection completion acceptance opinion Huan Yan 2015 No. 28 for Ningxia Yipin Biotechnology 450,000 t/a corn deep-processing project',
    ],
    authorityName: 'Ministry of Ecology and Environment',
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

function normalizeRegionProfileKey(provinceCode: unknown, cityCode?: unknown) {
  const province = normalizeComparableText(provinceCode)
  const city = normalizeComparableText(cityCode)
  if (!province) return ''
  return city ? `${province}:${city}` : `${province}:province`
}

function displayRegionProfileKey(provinceCode: unknown, cityCode?: unknown) {
  const province = normalizeText(provinceCode)
  const city = normalizeText(cityCode)
  if (!province) return ''
  return city ? `${province}:${city}` : `${province}:province`
}

function getGovernedRegionProfiles() {
  return ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles
    .filter((profile) => profile.reviewStatus === 'published')
    .filter((profile) => displayRegionProfileKey(profile.provinceCode, profile.cityCode) !== DEFAULT_REGION_PROFILE_KEY)
}

function getGovernedFormalBusinessTypeCodes() {
  return ACCEPTANCE_TIMELINE_TEMPLATE_SEED.businessProfiles.map((profile) => profile.businessTypeCode)
}

function isPublicSampleForCityProfile(
  sample: OfficialPublicAcceptanceReplaySample,
  profile: (typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED.regionProfiles)[number],
) {
  if (normalizeComparableText(sample.provinceCode) !== normalizeComparableText(profile.provinceCode)) return false
  const sampleCityTokens = [
    sample.cityCode,
    sample.cityName,
    sample.cityName.replace(/市$/u, ''),
  ].map(normalizeComparableText).filter(Boolean)
  const profileCityTokens = [
    profile.cityCode,
    profile.cityName,
    profile.cityName?.replace(/市$/u, ''),
    ...(profile.aliases ?? []),
  ].map(normalizeComparableText).filter(Boolean)
  return sampleCityTokens.some((sampleToken) => profileCityTokens.includes(sampleToken))
}

function isNamedPublicProjectSample(sample: OfficialPublicAcceptanceReplaySample) {
  return sample.sampleGranularity === 'named_public_project'
}

function isOfficialCityEntrySample(sample: OfficialPublicAcceptanceReplaySample) {
  return sample.sampleGranularity !== 'named_public_project'
}

const STRONG_CONSTRUCTION_CLOSEOUT_ITEM_CODES = new Set([
  'completion_filing',
  'comprehensive_acceptance',
  'archive_acceptance',
  'completion_acceptance',
])

function isStrongConstructionCloseoutReplaySample(sample: OfficialPublicAcceptanceReplaySample) {
  return isNamedPublicProjectSample(sample)
    && sample.actualItemCodes.some((itemCode) => STRONG_CONSTRUCTION_CLOSEOUT_ITEM_CODES.has(itemCode))
}

const SECTOR_AUTHORITY_STRONG_SOURCE_PATTERNS = [
  'airport',
  'expressway',
  'reservoir',
  'bonded zone',
  'customs',
  'foreign exchange',
  'transportation',
  'water affairs',
  'water-conservation',
  'solid-waste',
  'incineration',
  'ecological',
  'environmental',
  'sports',
  'games',
  'venue',
  'marine',
  'fishery',
  'germplasm',
  'general administration of customs',
  'state administration of foreign exchange',
  'department of transportation',
  'ministry of ecology',
]

function isSectorAuthorityStrongCloseoutReplaySample(sample: OfficialPublicAcceptanceReplaySample) {
  if (!isStrongConstructionCloseoutReplaySample(sample)) return false
  if (sample.businessTypeCode === 'transportation_hub') return true
  const evidenceText = [
    sample.projectName,
    sample.sourceName,
    sample.sourceUrl,
    sample.authorityName,
    ...sample.actualItemNames,
    ...sample.resultDocumentNames,
  ].map(normalizeComparableText).join(' ')
  return SECTOR_AUTHORITY_STRONG_SOURCE_PATTERNS.some((pattern) => evidenceText.includes(normalizeComparableText(pattern)))
}

const HOUSING_ARCHIVE_STRONG_SOURCE_PATTERNS = [
  'housing',
  'urban-rural construction',
  'housing-construction',
  'construction bureau',
  'construction commission',
  'urban construction archives',
  'completion filing',
  'completion acceptance filing',
  'joint acceptance opinion',
  '竣工验收备案',
  '住房和城乡建设',
  '住房城乡建设',
  '住建',
  '城建档案',
  '建设工程档案',
  '工程档案',
  'zjj',
  'zfcj',
  'zfcjj',
  'projreg',
  'jgys',
  'ysqgk',
  'finishrecord',
]

function isHousingArchiveStrongCloseoutReplaySample(sample: OfficialPublicAcceptanceReplaySample) {
  if (!isStrongConstructionCloseoutReplaySample(sample)) return false
  const evidenceText = [
    sample.sourceName,
    sample.sourceUrl,
    sample.authorityName,
    ...sample.resultDocumentNames,
  ].map(normalizeComparableText).join(' ')
  return HOUSING_ARCHIVE_STRONG_SOURCE_PATTERNS.some((pattern) => evidenceText.includes(normalizeComparableText(pattern)))
}

export function buildOfficialPublicAcceptanceReplayCoverageReport() {
  const regionProfiles = getGovernedRegionProfiles()
  const provinceCodes = uniqueStrings(regionProfiles.map((profile) => profile.provinceCode))
  const cityProfiles = regionProfiles.filter((profile) => normalizeText(profile.cityCode))
  const businessProfileCodes = getGovernedFormalBusinessTypeCodes()
  const namedPublicProjectSamples = OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.filter(isNamedPublicProjectSample)
  const officialCityEntrySamples = OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.filter(isOfficialCityEntrySample)
  const strongConstructionCloseoutSamples = OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES
    .filter(isStrongConstructionCloseoutReplaySample)
  const sectorAuthorityStrongCloseoutSamples = strongConstructionCloseoutSamples
    .filter(isSectorAuthorityStrongCloseoutReplaySample)
  const buildingCloseoutStrongSamples = strongConstructionCloseoutSamples
    .filter((sample) => !sectorAuthorityStrongCloseoutSamples.includes(sample))
  const housingArchiveStrongCloseoutSamples = buildingCloseoutStrongSamples
    .filter(isHousingArchiveStrongCloseoutReplaySample)
  const nonHousingArchiveStrongCloseoutSamples = buildingCloseoutStrongSamples
    .filter((sample) => !housingArchiveStrongCloseoutSamples.includes(sample))

  const publicEvidenceBusinessTypes = new Set(
    OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.map((sample) => sample.businessTypeCode),
  )
  const namedPublicProjectBusinessTypes = new Set(
    namedPublicProjectSamples.map((sample) => sample.businessTypeCode),
  )

  const missingServiceProfileSourceKeys = regionProfiles
    .filter((profile) => !profile.policySources.some((source) => normalizeText(source.sourceUrl)))
    .map((profile) => displayRegionProfileKey(profile.provinceCode, profile.cityCode))

  const missingBusinessTypeCodes = businessProfileCodes
    .filter((businessTypeCode) => !publicEvidenceBusinessTypes.has(businessTypeCode))
  const missingNamedPublicProjectBusinessTypeCodes = businessProfileCodes
    .filter((businessTypeCode) => !namedPublicProjectBusinessTypes.has(businessTypeCode))
  const namedPublicProjectProvinceCodes = new Set(
    namedPublicProjectSamples.map((sample) => normalizeComparableText(sample.provinceCode)),
  )
  const coveredNamedPublicProjectProvinceCodes = provinceCodes
    .filter((provinceCode) => namedPublicProjectProvinceCodes.has(normalizeComparableText(provinceCode)))
  const missingNamedPublicProjectProvinceCodes = provinceCodes
    .filter((provinceCode) => !namedPublicProjectProvinceCodes.has(normalizeComparableText(provinceCode)))

  const cityProfilesNeedingNamedPublicProjectSamples = cityProfiles
    .filter((profile) => !namedPublicProjectSamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .map((profile) => ({
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode ?? '',
      cityName: profile.cityName ?? '',
      sourceUrls: profile.policySources.map((source) => source.sourceUrl).filter(Boolean),
      calibrationNeed: 'named_public_completion_filing_or_joint_acceptance_project_sample' as const,
    }))
  const cityProfilesCoveredByOfficialEntryOnly = cityProfiles
    .filter((profile) => !namedPublicProjectSamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .filter((profile) => officialCityEntrySamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .map((profile) => ({
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode ?? '',
      cityName: profile.cityName ?? '',
    }))
  const strongConstructionCloseoutCoveredCityProfiles = cityProfiles
    .filter((profile) => strongConstructionCloseoutSamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
    .map((profile) => ({
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode ?? '',
      cityName: profile.cityName ?? '',
    }))

  return {
    reportCode: 'acceptance_official_public_replay_coverage',
    seedScope: {
      provinceCount: provinceCodes.length,
      provinceCodes,
      cityProfileCount: cityProfiles.length,
      businessProfileCodes,
    },
    serviceProfileSourceCoverage: {
      checkedRegionProfileCount: regionProfiles.length,
      coveredRegionProfileCount: regionProfiles.length - missingServiceProfileSourceKeys.length,
      missingRegionProfileKeys: missingServiceProfileSourceKeys,
      coveragePolicy: 'province_or_city_official_service_profile_source_required' as const,
    },
    namedPublicProjectCoverage: {
      sampleCount: namedPublicProjectSamples.length,
      coveredProvinceCount: coveredNamedPublicProjectProvinceCodes.length,
      coveredProvinceCodes: coveredNamedPublicProjectProvinceCodes,
      missingProvinceCodes: missingNamedPublicProjectProvinceCodes,
      coveredCityProfileCount: cityProfiles.length - cityProfilesNeedingNamedPublicProjectSamples.length,
      coveredCityProfiles: cityProfiles
        .filter((profile) => namedPublicProjectSamples.some((sample) => isPublicSampleForCityProfile(sample, profile)))
        .map((profile) => ({
          provinceCode: profile.provinceCode,
          cityCode: profile.cityCode ?? '',
          cityName: profile.cityName ?? '',
        })),
      coveredBusinessTypeCodes: businessProfileCodes.filter((businessTypeCode) => namedPublicProjectBusinessTypes.has(businessTypeCode)),
      missingBusinessTypeCodes: missingNamedPublicProjectBusinessTypeCodes,
      strongConstructionCloseoutSampleCount: strongConstructionCloseoutSamples.length,
      strongConstructionCloseoutCoveredCityProfileCount: strongConstructionCloseoutCoveredCityProfiles.length,
      strongConstructionCloseoutCoveredCityProfiles,
      buildingCloseoutStrongSampleCount: buildingCloseoutStrongSamples.length,
      housingArchiveStrongCloseoutSampleCount: housingArchiveStrongCloseoutSamples.length,
      housingArchiveStrongCloseoutSampleRate: buildingCloseoutStrongSamples.length === 0
        ? 0
        : Number((housingArchiveStrongCloseoutSamples.length / buildingCloseoutStrongSamples.length).toFixed(4)),
      nonHousingArchiveStrongCloseoutSamples: nonHousingArchiveStrongCloseoutSamples.map((sample) => ({
        sampleKey: sample.sampleKey,
        provinceCode: sample.provinceCode,
        cityCode: sample.cityCode,
        cityName: sample.cityName,
        sourceName: sample.sourceName,
        sourceUrl: sample.sourceUrl,
        actualItemCodes: sample.actualItemCodes,
      })),
      sectorAuthorityStrongCloseoutSampleCount: sectorAuthorityStrongCloseoutSamples.length,
      sectorAuthorityStrongCloseoutSamples: sectorAuthorityStrongCloseoutSamples.map((sample) => ({
        sampleKey: sample.sampleKey,
        provinceCode: sample.provinceCode,
        cityCode: sample.cityCode,
        cityName: sample.cityName,
        sourceName: sample.sourceName,
        sourceUrl: sample.sourceUrl,
        actualItemCodes: sample.actualItemCodes,
      })),
      coveragePolicy: 'named_public_project_samples_expand_incrementally_without_over_generating_rules' as const,
    },
    publicEvidenceCoverage: {
      sampleCount: OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.length,
      coveredBusinessTypeCodes: businessProfileCodes.filter((businessTypeCode) => publicEvidenceBusinessTypes.has(businessTypeCode)),
      missingBusinessTypeCodes,
      coveragePolicy: 'official_public_evidence_may_anchor_rules_but_named_project_replay_is_stricter' as const,
    },
    officialCityEntryCoverage: {
      sampleCount: officialCityEntrySamples.length,
      coveredCityProfileCount: cityProfilesCoveredByOfficialEntryOnly.length,
      coveredCityProfiles: cityProfilesCoveredByOfficialEntryOnly,
      coveragePolicy: 'official_city_entries_are_source_discovery_anchors_not_strict_replay_completion' as const,
    },
    calibrationQueues: {
      cityProfilesNeedingNamedPublicProjectSamples,
    },
    calibrationPolicy: 'official_service_profile_for_all_regions_named_public_project_replay_expands_by_queue' as const,
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

function readProjectLocationFacts(project?: AcceptanceReplayProjectRow | null) {
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

function normalizeItemCode(plan: AcceptanceReplayPlanRow) {
  return normalizeText(plan.type_id ?? plan.acceptance_type ?? plan.type_name ?? plan.acceptance_name ?? plan.plan_name)
}

function normalizeItemName(plan: AcceptanceReplayPlanRow) {
  return normalizeText(plan.acceptance_name ?? plan.plan_name ?? plan.type_name ?? plan.acceptance_type ?? plan.type_id)
}

function isCompletePlan(plan: AcceptanceReplayPlanRow) {
  return COMPLETE_ACCEPTANCE_STATUSES.has(normalizeComparableText(plan.status))
}

function isCompleteRequirement(requirement: AcceptanceReplayRequirementRow) {
  return Boolean(requirement.is_satisfied) || COMPLETE_REQUIREMENT_STATUSES.has(normalizeComparableText(requirement.status))
}

function isResultRequirement(requirement: AcceptanceReplayRequirementRow) {
  return normalizeComparableText(requirement.requirement_type) === 'resultdocument'
    || normalizeComparableText(requirement.source_entity_type) === 'templateresultdocument'
    || normalizeComparableText(requirement.source_entity_id).includes('result')
}

// workspace-isolation-system-job-approved: acceptance policy replay is an offline cross-project calibration job and returns only aggregate replay evidence.
async function runDefaultAcceptancePolicyReplayQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized === 'select id, project_id, type_id, type_name, acceptance_type, acceptance_name, plan_name, status, inspection_authority, updated_at from acceptance_plans where status in (\'passed\', \'archived\') order by updated_at desc limit $1') {
      const result = await rawQuery(
        `SELECT id, project_id, type_id, type_name, acceptance_type, acceptance_name, plan_name,
                status, inspection_authority, updated_at
         FROM acceptance_plans
         WHERE status IN ('passed', 'archived')
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
    if (normalized === 'select id, project_id, plan_id, requirement_type, source_entity_type, source_entity_id, description, status, is_satisfied from acceptance_requirements where project_id = any($1::uuid[])') {
      const result = await rawQuery(
        `SELECT id, project_id, plan_id, requirement_type, source_entity_type, source_entity_id,
                description, status, is_satisfied
         FROM acceptance_requirements
         WHERE project_id = ANY($1::uuid[])`,
        params as any[],
      )
    return result.rows as T[]
    }
  throw new Error('unapproved_acceptance_policy_replay_calibration_sql')
}

function buildDefaultQueryRows(): QueryRows {
  return runDefaultAcceptancePolicyReplayQuery
}

async function loadProjectRows(queryRows: QueryRows, projectIds: string[]) {
  if (projectIds.length === 0) return []
  try {
    return await queryRows<AcceptanceReplayProjectRow>(
      `SELECT id, location, metadata
       FROM projects
       WHERE id = ANY($1::uuid[])`,
      [projectIds],
    )
  } catch (error) {
    if (!String(error instanceof Error ? error.message : error).includes('metadata')) throw error
    return queryRows<AcceptanceReplayProjectRow>(
      `SELECT id, location
       FROM projects
       WHERE id = ANY($1::uuid[])`,
      [projectIds],
    )
  }
}

function findExpectedItem(preview: AcceptancePolicyReplayPreview, plan: AcceptanceReplayPlanRow) {
  const code = normalizeItemCode(plan)
  const name = normalizeItemName(plan)
  return preview.items.find((item) => {
    const candidateCodes = [item.itemCode, item.canonicalType, item.itemName]
    return candidateCodes.some((candidate) => normalizeComparableText(candidate) === normalizeComparableText(code))
      || candidateCodes.some((candidate) => normalizeComparableText(candidate) === normalizeComparableText(name))
  }) ?? null
}

function collectActualResultDocuments(plan: AcceptanceReplayPlanRow, requirementsByPlanId: Map<string, AcceptanceReplayRequirementRow[]>) {
  return uniqueStrings(
    (requirementsByPlanId.get(plan.id) ?? [])
      .filter(isCompleteRequirement)
      .filter(isResultRequirement)
      .map((requirement) => requirement.description),
  )
}

function toOfficialPublicReplayCalibrationSample(
  sample: OfficialPublicAcceptanceReplaySample,
): AcceptancePolicyReplayCalibrationSample {
  const primaryItemCode = sample.actualItemCodes[0] ?? null
  const primaryItemName = sample.actualItemNames[0] ?? null
  return {
    projectId: `official-public:${sample.sampleKey}`,
    provinceCode: sample.provinceCode,
    cityCode: sample.cityCode,
    businessTypeCode: sample.businessTypeCode,
    sampleSource: 'official_public_completion_filing',
    evidenceScope: sample.evidenceScope,
    sourceUrl: sample.sourceUrl,
    actualItemCodes: sample.actualItemCodes,
    itemCode: primaryItemCode,
    expectedItemNames: primaryItemName ? [primaryItemName] : [],
    actualItemNames: primaryItemName ? [primaryItemName] : [],
    expectedResultDocumentNames: sample.resultDocumentNames,
    actualResultDocumentNames: sample.resultDocumentNames,
    expectedAuthority: sample.authorityName,
    actualAuthority: sample.authorityName,
  }
}

const OFFICIAL_PUBLIC_REPLAY_REPRESENTATIVE_ITEM_CODES = [
  'completion_filing',
  'comprehensive_acceptance',
  'archive_acceptance',
  'public_assembly_fire_safety_check',
  'environment_acceptance',
]

function selectOfficialPublicReplaySamples(maxSamples: number) {
  if (maxSamples >= OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.length) {
    return OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.slice()
  }

  const selected: OfficialPublicAcceptanceReplaySample[] = []
  const selectedKeys = new Set<string>()
  const addSample = (sample?: OfficialPublicAcceptanceReplaySample) => {
    if (!sample || selectedKeys.has(sample.sampleKey) || selected.length >= maxSamples) return
    selectedKeys.add(sample.sampleKey)
    selected.push(sample)
  }

  for (const itemCode of OFFICIAL_PUBLIC_REPLAY_REPRESENTATIVE_ITEM_CODES) {
    addSample(OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.find((sample) => sample.actualItemCodes[0] === itemCode))
  }
  for (const itemCode of OFFICIAL_PUBLIC_REPLAY_REPRESENTATIVE_ITEM_CODES) {
    addSample(OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES.find((sample) => sample.actualItemCodes.includes(itemCode)))
  }
  for (const sample of OFFICIAL_PUBLIC_ACCEPTANCE_REPLAY_SAMPLES) {
    addSample(sample)
  }

  return selected
}

export function collectOfficialPublicAcceptanceReplayCalibrationSamples(options: { maxSamples?: number } = {}) {
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_SAMPLE_LIMIT))
  return selectOfficialPublicReplaySamples(maxSamples)
    .map(toOfficialPublicReplayCalibrationSample)
}

export async function collectAcceptancePolicyReplayCalibrationSamples(
  options: CollectAcceptancePolicyReplayCalibrationSamplesOptions = {},
): Promise<AcceptancePolicyReplayCalibrationSample[]> {
  if (!options.queryRows && options.systemJob !== true) {
    throw new Error('acceptance policy replay requires systemJob capability for cross-project reads')
  }
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_SAMPLE_LIMIT))
  const queryRows = options.queryRows ?? buildDefaultQueryRows()
  const previewBuilder: PreviewBuilder = options.previewBuilder ?? buildAcceptanceTemplatePreview
  const includeOfficialPublicSamples = options.includeOfficialPublicSamples ?? true

  const planRows = await queryRows<AcceptanceReplayPlanRow>(
    `SELECT id, project_id, type_id, type_name, acceptance_type, acceptance_name, plan_name,
            status, inspection_authority, updated_at
     FROM acceptance_plans
     WHERE status IN ('passed', 'archived')
     ORDER BY updated_at DESC
     LIMIT $1`,
    [maxSamples * 2],
  )
  const projectIds = uniqueStrings(planRows.map((row) => row.project_id))
  if (projectIds.length === 0) {
    return includeOfficialPublicSamples
      ? collectOfficialPublicAcceptanceReplayCalibrationSamples({ maxSamples })
      : []
  }

  const [projects, requirements] = await Promise.all([
    loadProjectRows(queryRows, projectIds),
    queryRows<AcceptanceReplayRequirementRow>(
      `SELECT id, project_id, plan_id, requirement_type, source_entity_type, source_entity_id,
              description, status, is_satisfied
       FROM acceptance_requirements
       WHERE project_id = ANY($1::uuid[])`,
      [projectIds],
    ),
  ])

  const projectsById = new Map(projects.map((project) => [project.id, project]))
  const requirementsByPlanId = new Map<string, AcceptanceReplayRequirementRow[]>()
  for (const requirement of requirements) {
    requirementsByPlanId.set(requirement.plan_id, [
      ...(requirementsByPlanId.get(requirement.plan_id) ?? []),
      requirement,
    ])
  }
  const previewByProjectId = new Map<string, Awaited<ReturnType<PreviewBuilder>> | null>()
  const samples: AcceptancePolicyReplayCalibrationSample[] = []

  for (const plan of planRows) {
    if (samples.length >= maxSamples) break
    if (!isCompletePlan(plan)) continue

    if (!previewByProjectId.has(plan.project_id)) {
      try {
        previewByProjectId.set(plan.project_id, await previewBuilder(plan.project_id))
      } catch {
        previewByProjectId.set(plan.project_id, null)
      }
    }
    const preview = previewByProjectId.get(plan.project_id)
    if (!preview) continue
    const expectedItem = findExpectedItem(preview, plan)
    if (!expectedItem) continue

    const projectLocationFacts = readProjectLocationFacts(projectsById.get(plan.project_id))
    const actualItemName = normalizeItemName(plan)
    const actualResultDocuments = collectActualResultDocuments(plan, requirementsByPlanId)

    samples.push({
      projectId: plan.project_id,
      provinceCode: preview.regionProfile?.provinceCode ?? projectLocationFacts.provinceCode,
      cityCode: preview.regionProfile?.cityCode ?? projectLocationFacts.cityCode,
      itemCode: expectedItem.itemCode,
      expectedItemNames: [expectedItem.itemName],
      actualItemNames: actualItemName ? [actualItemName] : [],
      expectedResultDocumentNames: expectedItem.resultDocuments,
      actualResultDocumentNames: actualResultDocuments,
      expectedAuthority: normalizeText(expectedItem.authority) || null,
      actualAuthority: normalizeText(plan.inspection_authority) || null,
    })
  }

  if (includeOfficialPublicSamples && samples.length < maxSamples) {
    const existingProjectIds = new Set(samples.map((sample) => sample.projectId))
    for (const sample of collectOfficialPublicAcceptanceReplayCalibrationSamples({ maxSamples })) {
      if (samples.length >= maxSamples) break
      if (existingProjectIds.has(sample.projectId)) continue
      samples.push(sample)
    }
  }

  return samples
}
