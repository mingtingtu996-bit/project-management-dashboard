export type V1474ResourceClass =
  | 'concrete_pour'
  | 'tower_crane'
  | 'construction_hoist'
  | 'formwork'
  | 'rebar'
  | 'masonry'
  | 'plaster'
  | 'waterproof'
  | 'scaffold'
  | 'flooring'
  | 'interior_finishing'
  | 'insulation'
  | 'facade'
  | 'curtain_wall'
  | 'steel_hoisting'
  | 'precast_hoisting'
  | 'electrical'
  | 'plumbing'
  | 'outdoor_utility'
  | 'hvac'
  | 'fire_system'
  | 'intelligent_system'
  | 'elevator'
  | 'commissioning'
  | 'landscape'
  | 'general_crew'

export type V1474ResourceOperationType =
  | 'install'
  | 'use'
  | 'add_section'
  | 'dismantle'
  | 'inspection_acceptance'
  | 'commissioning'
  | 'maintenance'
  | 'transport'
  | 'support'
  | 'cleanup'

export type V1474PressureDimension = 'labor' | 'material' | 'equipment' | 'workface'

export type V1474SeedEvidenceSource = {
  sourceKey: string
  title: string
  url: string
  accessedAt: string
}

export type V1474ResourceOperationRule = {
  operationType: V1474ResourceOperationType
  keywords: string[]
  standardWorkCodes?: string[]
  standardCatalogCodePrefixes?: string[]
  confidence: 'high' | 'medium' | 'low'
}

export type V1474ResourceClassMapping = {
  stableCode: string
  resourceClass: V1474ResourceClass
  keywords: string[]
  standardWorkCodes?: string[]
  standardCatalogCodePrefixes?: string[]
  pressureDimensions?: V1474PressureDimension[]
  operationRules?: V1474ResourceOperationRule[]
  parallelCapacity?: 'low' | 'medium' | 'high'
  sameBuildingDailyLimit: number
  sameUnitDailyLimit: number
  sameFloorDailyLimit: number
  sameZoneDailyLimit?: number
  sameSystemDailyLimit: number
  sourceStandard: 'national_standard' | 'system_default' | 'enterprise_method'
  sourceVersion: string
  sourceClauseRef: string
  evidenceSourceKeys: string[]
  webVerified: true
  reviewNeeded: false
  confidence: 'high' | 'medium' | 'low'
}

export type V1474ResourceClassMatch = {
  stableCode: string
  resourceClass: V1474ResourceClass
  mapping: V1474ResourceClassMapping
  resourceOperationType?: V1474ResourceOperationType
  operationConfidence?: 'high' | 'medium' | 'low'
  operationMatchSource?: 'standard_work_code' | 'standard_catalog_prefix' | 'keyword'
  pressureDimensions: V1474PressureDimension[]
}

export const V1474_RESOURCE_CLASS_SEED_VERSION = 'v1.4.7.4-source-backed-20260522-pressure-dimensions'

export function inferV1474ResourcePressureDimensions(resourceClass: V1474ResourceClass | string | null | undefined): V1474PressureDimension[] {
  const normalized = normalizeResourceClassText(resourceClass)
  if (['tower_crane', 'construction_hoist', 'steel_hoisting', 'precast_hoisting', 'scaffold', 'elevator'].includes(normalized)) {
    return ['equipment', 'workface']
  }
  if (normalized === 'concrete_pour') {
    return ['labor', 'material', 'equipment', 'workface']
  }
  if (['waterproof', 'insulation', 'flooring', 'interior_finishing', 'facade', 'curtain_wall', 'outdoor_utility', 'landscape'].includes(normalized)) {
    return ['labor', 'material', 'workface']
  }
  if (['electrical', 'plumbing', 'hvac', 'fire_system', 'intelligent_system', 'commissioning'].includes(normalized)) {
    return ['labor', 'material', 'equipment', 'workface']
  }
  if (['formwork', 'rebar', 'masonry', 'plaster', 'general_crew'].includes(normalized)) {
    return ['labor', 'workface']
  }
  return ['labor', 'workface']
}

export const V1474_RESOURCE_CLASS_EVIDENCE_SOURCES: V1474SeedEvidenceSource[] = [
  {
    sourceKey: 'GB50204_2015',
    title: 'GB 50204-2015 混凝土结构工程施工质量验收规范',
    url: 'https://www.guifanku.com/3518.html',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50205_2020',
    title: 'GB 50205-2020 钢结构工程施工质量验收标准',
    url: 'https://www.bzfyw.com/site/bz/standard/GB50205-2020.html',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50208_2011',
    title: 'GB 50208-2011 地下防水工程质量验收规范',
    url: 'https://zlglpt.com/book/book_view.aspx?id=371',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50210_2018',
    title: 'GB 50210-2018 建筑装饰装修工程质量验收标准',
    url: 'https://www.jianbiaoku.com/webarbs/book/202/3735415.shtml',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50242_2002',
    title: 'GB 50242-2002 建筑给水排水及采暖工程施工质量验收规范',
    url: 'https://www.jianbiaoku.com/webarbs/book/106/1676775.shtml',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50303_2015',
    title: 'GB 50303-2015 建筑电气工程施工质量验收规范',
    url: 'https://zlglpt.com/book/book_view.aspx?id=3214',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50243_2016',
    title: 'GB 50243-2016 通风与空调工程施工质量验收规范',
    url: 'https://www.zlglpt.com/book/book_view.aspx?id=71',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50310_2002',
    title: 'GB 50310-2002 电梯工程施工质量验收规范',
    url: 'https://zlglpt.com/book/book_view.aspx?id=258',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GBT51231_2016',
    title: 'GB/T 51231-2016 Technical standard for assembled buildings with concrete structure',
    url: 'https://www.zlglpt.com/book/book_view.aspx?id=3409',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB55024_2022',
    title: 'GB 55024-2022 General code for building electrical and intelligent systems',
    url: 'https://www.jsjlztb.org.cn/zcfginfo845.html',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB55037_2022',
    title: 'GB 55037-2022 General code for building fire protection',
    url: 'https://www.gongbiaoku.com/read/95i26925upv?secId=bro1099373zvj',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB55032_2022',
    title: 'GB 55032-2022 General code for construction quality control of building and municipal engineering',
    url: 'https://zjj.sm.gov.cn/xxgk/fgwj/jsbz/202209/t20220909_1827392.htm',
    accessedAt: '2026-05-16',
  },
]

export const V1474_RESOURCE_CLASS_SEED: V1474ResourceClassMapping[] = [
  {
    stableCode: 'resource_concrete_pour',
    resourceClass: 'concrete_pour',
    parallelCapacity: 'low',
    standardWorkCodes: ['cast_in_place_concrete'],
    standardCatalogCodePrefixes: ['01-02', '02-01-03', '02-04-06', '02-05-07'],
    keywords: ['concrete', 'pouring', '浇筑', '混凝土'],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50204-2015',
    sourceClauseRef: 'Concrete structure sub-works; pump/placing resource limit is project-calibrated',
    evidenceSourceKeys: ['GB50204_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_rebar',
    resourceClass: 'rebar',
    parallelCapacity: 'medium',
    standardWorkCodes: ['rebar_installation'],
    standardCatalogCodePrefixes: ['01-02', '02-01-02'],
    keywords: ['rebar', 'reinforcement', '钢筋', '钢筋绑扎', '钢筋加工'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50204-2015',
    sourceClauseRef: 'Reinforcement works and concealed acceptance; labor capacity limit is project-calibrated',
    evidenceSourceKeys: ['GB50204_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_formwork',
    resourceClass: 'formwork',
    parallelCapacity: 'medium',
    standardWorkCodes: ['cast_in_place_formwork'],
    standardCatalogCodePrefixes: ['01-02', '02-01-01', '02-05-06'],
    keywords: ['formwork', '模板', '支架', '模板安装'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50204-2015',
    sourceClauseRef: 'Template works; labor capacity limit is project-calibrated',
    evidenceSourceKeys: ['GB50204_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_tower_crane',
    resourceClass: 'tower_crane',
    parallelCapacity: 'low',
    standardCatalogCodePrefixes: ['DANGER-01-01-03', 'DANGER-02-01-01'],
    keywords: ['crane', 'tower crane', 'tower crane installation', '塔吊', '塔式起重机', '塔吊安装', '塔吊附墙', '塔吊顶升'],
    operationRules: [
      {
        operationType: 'install',
        keywords: ['installation', 'erection', '安装', '安拆', '基础安装'],
        confidence: 'high',
      },
      {
        operationType: 'add_section',
        keywords: ['climbing', 'jacking', 'mast section', '顶升', '加节', '附墙'],
        confidence: 'high',
      },
      {
        operationType: 'dismantle',
        keywords: ['dismantle', 'removal', '拆除', '拆卸'],
        confidence: 'high',
      },
      {
        operationType: 'use',
        keywords: ['lifting operation', '吊装', '吊运', '垂直运输', '使用'],
        confidence: 'medium',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', '检测', '验收', '报验'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 1,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB50205-2020 + project lifting plan',
    sourceClauseRef: 'Steel installation and lifting sequence; actual lifting capacity must use project lifting plan',
    evidenceSourceKeys: ['GB50205_2020'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_construction_hoist',
    resourceClass: 'construction_hoist',
    parallelCapacity: 'low',
    standardCatalogCodePrefixes: ['DANGER-01-01-05', 'DANGER-02-01-02'],
    keywords: ['construction hoist', 'material hoist', '施工升降机', '施工电梯', '物料提升机', '升降机附墙', '升降机加节'],
    operationRules: [
      {
        operationType: 'install',
        keywords: ['installation', 'erection', '安装', '安拆', '基础安装'],
        confidence: 'high',
      },
      {
        operationType: 'add_section',
        keywords: ['mast-section addition', 'mast section', 'section addition', 'add section', '加节', '附墙', '导轨架加节'],
        confidence: 'high',
      },
      {
        operationType: 'dismantle',
        keywords: ['dismantle', 'removal', '拆除', '拆卸', '退场'],
        confidence: 'high',
      },
      {
        operationType: 'use',
        keywords: ['vertical transport', 'material transport', 'operation', 'use', '使用', '垂直运输', '材料运输', '运输'],
        confidence: 'medium',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', 'test', '检测', '验收', '报验', '检测验收'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 1,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 1,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB55032-2022 + construction hoist special plan',
    sourceClauseRef: 'Construction hoist installation, attachment, mast-section addition and dismantling are constrained by hoist-set capacity and safety acceptance.',
    evidenceSourceKeys: ['GB55032_2022'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_steel_hoisting',
    resourceClass: 'steel_hoisting',
    parallelCapacity: 'low',
    standardWorkCodes: ['steel_fabrication_deepening', 'steel_erection', 'steel_bolting_welding'],
    standardCatalogCodePrefixes: ['02-03', '02-04', '02-05', '02-06', 'STL'],
    keywords: ['steel structure', 'steel hoisting', '钢结构', '构件吊装', '钢构件'],
    operationRules: [
      {
        operationType: 'install',
        keywords: ['installation', 'erection', '安装', '拼装', '钢柱安装', '钢梁安装'],
        confidence: 'high',
      },
      {
        operationType: 'transport',
        keywords: ['hoisting', 'lifting', '吊装', '吊运', '构件吊装'],
        confidence: 'high',
      },
      {
        operationType: 'dismantle',
        keywords: ['dismantle', '拆除', '拆卸'],
        confidence: 'medium',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', '检测', '验收', '报验'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 1,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50205-2020',
    sourceClauseRef: 'Steel member installation, connection and coating works',
    evidenceSourceKeys: ['GB50205_2020'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_waterproof',
    resourceClass: 'waterproof',
    parallelCapacity: 'medium',
    standardWorkCodes: [
      'basement_waterproof_backfill',
      'exterior_wall_waterproof',
      'roof_membrane_waterproof',
      'roof_waterproof_insulation',
      'interior_wet_area_waterproof',
    ],
    standardCatalogCodePrefixes: ['01-07', '03-03', '04-03', 'WPI-01', 'WPI-02-01-01', 'DEC-03-01'],
    keywords: ['waterproof', 'waterproof membrane', 'coating membrane', '防水', '卷材', '涂膜'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 3,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50207-2012 + GB50208-2011',
    sourceClauseRef: 'Roof and underground waterproof works; crew capacity limit is project-calibrated',
    evidenceSourceKeys: ['GB50208_2011'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_scaffold',
    resourceClass: 'scaffold',
    parallelCapacity: 'low',
    standardWorkCodes: ['scaffold_temp_access'],
    standardCatalogCodePrefixes: ['DANGER-01-01-04', 'DANGER-02-01-03', 'FAC-04'],
    keywords: ['scaffold', 'temporary access', '脚手架', '外架', '落地架', '悬挑架', '爬架', '吊篮'],
    operationRules: [
      {
        operationType: 'install',
        keywords: ['erection', 'setup', '搭设', '安装', '外架搭设', '爬架安装', '吊篮安装'],
        confidence: 'high',
      },
      {
        operationType: 'use',
        keywords: ['use', 'access', '使用', '作业面', '作业平台', '临边防护'],
        confidence: 'medium',
      },
      {
        operationType: 'dismantle',
        keywords: ['dismantle', 'removal', '拆除', '拆卸', '退场'],
        confidence: 'high',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', '验收', '检测', '报验'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 1,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 1,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'construction temporary access practice',
    sourceClauseRef: 'Temporary access scaffold and climbing-frame work is constrained by specialist crew, acceptance and handover sequence',
    evidenceSourceKeys: ['GB55032_2022'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_masonry',
    resourceClass: 'masonry',
    parallelCapacity: 'medium',
    standardWorkCodes: ['masonry_infill_wall', 'lightweight_partition_wall'],
    standardCatalogCodePrefixes: ['02-02'],
    keywords: ['masonry', 'blockwork', 'brickwork', '砌体', '砌筑'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50203-2011',
    sourceClauseRef: 'Masonry works; crew capacity limit is project-calibrated',
    evidenceSourceKeys: ['GB50210_2018'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'low',
  },
  {
    stableCode: 'resource_plaster',
    resourceClass: 'plaster',
    parallelCapacity: 'medium',
    standardWorkCodes: ['plastering_wall_ceiling'],
    standardCatalogCodePrefixes: ['03-02'],
    keywords: ['plaster', 'rendering', '抹灰', '粉刷'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018',
    sourceClauseRef: 'Plastering works; crew capacity limit is project-calibrated',
    evidenceSourceKeys: ['GB50210_2018'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_flooring',
    resourceClass: 'flooring',
    parallelCapacity: 'medium',
    standardWorkCodes: ['floor_finish_system', 'tile_facing_finish'],
    standardCatalogCodePrefixes: ['03-01', '03-07', 'DEC-01-01', 'DEC-02-02'],
    keywords: ['flooring', 'floor finish', 'tile', 'screed', '地坪', '地面', '找平', '自流平', '贴砖', '墙砖', '地砖', '瓷砖', '铺贴'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018',
    sourceClauseRef: 'Floor finish, tile facing and wet-trade flooring workface capacity is project-calibrated',
    evidenceSourceKeys: ['GB50210_2018'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_interior_finishing',
    resourceClass: 'interior_finishing',
    parallelCapacity: 'medium',
    standardWorkCodes: ['ceiling_system_finish', 'coating_paint_finish', 'interior_unit_finish', 'interior_public_finish'],
    standardCatalogCodePrefixes: ['03-05', '03-10', '03-11', '03-12', 'DEC-02-01', 'DEC-05', 'DEC-06', 'DEC-07', 'DEC-08', 'DEC-09'],
    keywords: ['ceiling', 'putty', 'paint', 'coating', '吊顶', '天花', '顶棚', '腻子', '刮腻子', '批腻子', '涂料', '乳胶漆', '油漆'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018',
    sourceClauseRef: 'Interior ceiling, putty, coating and finish sequence is constrained by workface and wet-trade handover',
    evidenceSourceKeys: ['GB50210_2018'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_insulation',
    resourceClass: 'insulation',
    parallelCapacity: 'medium',
    standardWorkCodes: ['roof_insulation_thermal_layer', 'exterior_insulation_finish', 'roof_waterproof_insulation'],
    standardCatalogCodePrefixes: ['04-02', '09', 'WPI-02-01-02'],
    keywords: ['insulation', 'thermal insulation', '保温', '外保温', '屋面保温', '节能'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018 + GB55032-2022',
    sourceClauseRef: 'Insulation work requires substrate handover, material acceptance and weather-sensitive workface capacity',
    evidenceSourceKeys: ['GB50210_2018', 'GB55032_2022'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_facade',
    resourceClass: 'facade',
    parallelCapacity: 'medium',
    standardWorkCodes: ['exterior_insulation_finish'],
    standardCatalogCodePrefixes: ['03-04', '03-08', 'FAC-03'],
    keywords: ['facade', 'external wall', 'door', 'window', 'railing', '外墙', '外立面', '门窗', '栏杆'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 2,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018',
    sourceClauseRef: 'Exterior decoration and curtain wall works; access equipment limit is project-calibrated',
    evidenceSourceKeys: ['GB50210_2018'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_plumbing',
    resourceClass: 'plumbing',
    parallelCapacity: 'high',
    standardCatalogCodePrefixes: ['05', 'PLU'],
    keywords: ['plumbing', 'water supply', 'drainage', '给排水', '管道', '水管'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50242-2002',
    sourceClauseRef: 'Water supply, drainage and heating pipeline installation and testing',
    evidenceSourceKeys: ['GB50242_2002'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_electrical',
    resourceClass: 'electrical',
    parallelCapacity: 'high',
    standardCatalogCodePrefixes: ['07', 'ELE', 'OUT-02-02', 'OUT-05-01'],
    keywords: ['electrical', 'wiring', 'cable', '电气', '穿线', '电缆', '配电'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50303-2015',
    sourceClauseRef: 'Electrical conduit, cable, wiring, grounding and testing',
    evidenceSourceKeys: ['GB50303_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_hvac',
    resourceClass: 'hvac',
    parallelCapacity: 'high',
    standardCatalogCodePrefixes: ['06', 'HVA', 'CLN-02'],
    keywords: ['HVAC', 'air conditioning', 'ventilation', '暖通', '空调', '风管'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50243-2016',
    sourceClauseRef: 'Ventilation and air-conditioning duct, equipment and commissioning works',
    evidenceSourceKeys: ['GB50243_2016'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_fire_system',
    resourceClass: 'fire_system',
    parallelCapacity: 'medium',
    standardCatalogCodePrefixes: ['08-18', 'FIR-01', 'FIR-02', 'FIR-03', 'FIR-04', 'FIR-06', 'FIR-07'],
    keywords: ['fire system', 'sprinkler', 'fire alarm', '消防', '喷淋', '火灾报警'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB50242-2002 + GB50303-2015 + fire acceptance practice',
    sourceClauseRef: 'Fire system includes pipeline pressure test, alarm wiring and linkage commissioning',
    evidenceSourceKeys: ['GB50242_2002', 'GB50303_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_elevator',
    resourceClass: 'elevator',
    parallelCapacity: 'low',
    standardCatalogCodePrefixes: ['10', 'ELV-01', 'ELV-02-01-01'],
    keywords: ['elevator', 'lift', '电梯', '导轨', '轿厢'],
    operationRules: [
      {
        operationType: 'install',
        keywords: ['installation', 'install', '安装', '导轨安装', '轿厢安装', '门机安装'],
        confidence: 'high',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', '检测', '验收', '报验'],
        confidence: 'medium',
      },
      {
        operationType: 'maintenance',
        keywords: ['maintenance', 'repair', '维保', '维修', '保养'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 1,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50310-2002',
    sourceClauseRef: 'Elevator installation and whole-machine acceptance',
    evidenceSourceKeys: ['GB50310_2002'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_commissioning',
    resourceClass: 'commissioning',
    parallelCapacity: 'low',
    standardCatalogCodePrefixes: ['06-07', '06-20', '08-18-10', '10-01-13', '10-02-12', 'ELV-02-01-02', 'FIR-03-02'],
    keywords: ['commissioning', 'trial operation', 'integrated test', '调试', '试运行', '联动'],
    operationRules: [
      {
        operationType: 'commissioning',
        keywords: ['commissioning', 'testing', 'trial operation', 'integrated test', '调试', '联调', '试运行', '功能测试'],
        confidence: 'high',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', '验收', '检测', '报验'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50243-2016 + GB50303-2015 + GB50310-2002',
    sourceClauseRef: 'System commissioning and trial operation must be sequenced by system',
    evidenceSourceKeys: ['GB50243_2016', 'GB50303_2015', 'GB50310_2002'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_precast_hoisting',
    resourceClass: 'precast_hoisting',
    parallelCapacity: 'low',
    standardWorkCodes: ['pc_component_hoisting', 'pc_grouting_joint'],
    standardCatalogCodePrefixes: ['PFB'],
    keywords: ['precast hoisting', 'prefabricated component', 'sleeve grouting', '预制构件吊装', '装配式', '套筒灌浆'],
    operationRules: [
      {
        operationType: 'transport',
        keywords: ['hoisting', 'lifting', '吊装', '吊运', '构件吊装'],
        confidence: 'high',
      },
      {
        operationType: 'install',
        keywords: ['installation', 'install', '安装', '就位', '临时固定'],
        confidence: 'high',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', '验收', '复核', '灌浆饱满度'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 1,
    sameFloorDailyLimit: 1,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB/T51231-2016 + GB50204-2015',
    sourceClauseRef: 'Prefabricated component hoisting and connection work is constrained by crane, component acceptance and grouting sequence',
    evidenceSourceKeys: ['GBT51231_2016', 'GB50204_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_curtain_wall_specialist',
    resourceClass: 'curtain_wall',
    parallelCapacity: 'low',
    standardWorkCodes: ['curtain_wall_installation'],
    standardCatalogCodePrefixes: ['02-06-09', '03-09', 'FAC-01', 'FAC-02'],
    keywords: ['curtain wall', 'mullion', 'glass panel', 'weather sealant', '幕墙', '龙骨', '玻璃安装', '耐候胶'],
    operationRules: [
      {
        operationType: 'install',
        keywords: ['installation', 'install', '安装', '龙骨安装', '面板安装', '玻璃安装'],
        confidence: 'high',
      },
      {
        operationType: 'support',
        keywords: ['sealant', 'weather sealant', '打胶', '耐候胶', '密封胶', '收口'],
        confidence: 'medium',
      },
      {
        operationType: 'inspection_acceptance',
        keywords: ['inspection', 'acceptance', 'water spray test', '淋水试验', '检测', '验收', '报验'],
        confidence: 'medium',
      },
      {
        operationType: 'dismantle',
        keywords: ['dismantle', 'removal', '拆除', '拆卸'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 1,
    sameUnitDailyLimit: 1,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018',
    sourceClauseRef: 'Curtain wall frame, panel and sealing sequence is constrained by facade access equipment and specialist crew capacity',
    evidenceSourceKeys: ['GB50210_2018'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_intelligent_system',
    resourceClass: 'intelligent_system',
    parallelCapacity: 'high',
    standardWorkCodes: ['intelligent_public_broadcast_system'],
    standardCatalogCodePrefixes: ['08', 'INT', 'CLN-03'],
    keywords: ['intelligent system', 'BAS', 'security system', 'access control', 'cabling test', '智能化', '楼宇自控', '安防', '综合布线'],
    sameBuildingDailyLimit: 2,
    sameUnitDailyLimit: 2,
    sameFloorDailyLimit: 2,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB55024-2022 + GB50303-2015',
    sourceClauseRef: 'Intelligent-system installation and platform commissioning must be controlled by subsystem and interface capacity',
    evidenceSourceKeys: ['GB55024_2022', 'GB50303_2015'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_outdoor_utility',
    resourceClass: 'outdoor_utility',
    parallelCapacity: 'high',
    standardWorkCodes: ['outdoor_road_hardscape'],
    standardCatalogCodePrefixes: ['OUT-01', 'OUT-02', 'OUT-03', 'OUT-05', 'MUN'],
    keywords: ['outdoor pipe network', 'site drainage', 'cable trench', 'road base', '室外管网', '雨污水管', '电缆沟', '园区道路'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 3,
    sameFloorDailyLimit: 3,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB55032-2022 + GB50242-2002',
    sourceClauseRef: 'Outdoor utility work is constrained by zone handover, trench conditions, pressure or water tests and backfill sequence',
    evidenceSourceKeys: ['GB55032_2022', 'GB50242_2002'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_landscape',
    resourceClass: 'landscape',
    parallelCapacity: 'high',
    standardWorkCodes: ['landscape_greenery'],
    standardCatalogCodePrefixes: ['OUT-04-01'],
    keywords: ['landscape', 'greenery', 'planting', '景观', '绿化', '乔木', '灌木', '草坪', '种植'],
    sameBuildingDailyLimit: 3,
    sameUnitDailyLimit: 3,
    sameFloorDailyLimit: 3,
    sameSystemDailyLimit: 1,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB55032-2022',
    sourceClauseRef: 'Landscape and greenery work is constrained by site handover, planting season and subcontractor crew rhythm',
    evidenceSourceKeys: ['GB55032_2022'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
  {
    stableCode: 'resource_general_site_crew',
    resourceClass: 'general_crew',
    parallelCapacity: 'high',
    standardWorkCodes: ['site_setup_temp_works', 'QR-01-01-11', 'QR-01-01-13', 'QR-01-01-15', 'QR-01-01-16', 'MS-01'],
    standardCatalogCodePrefixes: ['SITE', 'OUT-04-02', 'QR-01-01-11', 'QR-01-01-13', 'QR-01-01-15', 'QR-01-01-16', 'MS'],
    keywords: [
      'site setup',
      'temporary works',
      'site cleanup',
      'owner delivery',
      'household inspection',
      'property takeover',
      'handover inspection',
      '\u5206\u6237\u9a8c\u6536',
      '\u4e1a\u4e3b\u4ea4\u4ed8',
      '\u7269\u4e1a\u627f\u63a5\u67e5\u9a8c',
      '\u4ea4\u4ed8\u9a8c\u6536',
      '\u79fb\u4ea4\u9a8c\u6536',
      '\u7ae3\u5907',
      '\u7ae3\u5de5\u5907\u6848',
      '\u4e13\u9879\u9a8c\u6536',
    ],
    operationRules: [
      {
        operationType: 'inspection_acceptance',
        keywords: [
          'owner delivery',
          'household inspection',
          'property takeover',
          'handover inspection',
          'acceptance',
          '\u5206\u6237\u9a8c\u6536',
          '\u4e1a\u4e3b\u4ea4\u4ed8',
          '\u7269\u4e1a\u627f\u63a5\u67e5\u9a8c',
          '\u4ea4\u4ed8\u9a8c\u6536',
          '\u79fb\u4ea4\u9a8c\u6536',
        ],
        standardWorkCodes: ['QR-01-01-11', 'QR-01-01-13', 'QR-01-01-15', 'QR-01-01-16', 'MS-01'],
        standardCatalogCodePrefixes: ['QR-01-01-11', 'QR-01-01-13', 'QR-01-01-15', 'QR-01-01-16', 'MS'],
        confidence: 'medium',
      },
    ],
    sameBuildingDailyLimit: 4,
    sameUnitDailyLimit: 4,
    sameFloorDailyLimit: 3,
    sameSystemDailyLimit: 2,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB55032-2022 + site management practice',
    sourceClauseRef: 'General site setup, temporary works and site restoration are high-parallel background resource classes and must not catch management-only records.',
    evidenceSourceKeys: ['GB55032_2022'],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
]

function normalizeResourceClassText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function readResourceClassContextCodes(context: { standardWorkCode?: string | null; standardWorkCodes?: string[] | null } = {}) {
  return Array.from(new Set([
    ...(Array.isArray(context.standardWorkCodes) ? context.standardWorkCodes : []),
    context.standardWorkCode,
  ].map(normalizeResourceClassText).filter(Boolean)))
}

function semanticKeywordLength(keyword: string) {
  const normalized = normalizeResourceClassText(keyword)
  if (!normalized) return 0
  let score = 0
  for (const char of normalized) {
    if (/[\u3400-\u9fff]/u.test(char)) {
      score += 4
    } else if (/[a-z0-9]/i.test(char)) {
      score += 1
    } else if (char.trim()) {
      score += 0.5
    }
  }
  return score
}

function isConstructionLikeGeneralResourceText(text: string) {
  if (!text) return false
  return [
    '施工', '现场', '作业', '工序', '安装', '拆除', '清理', '清运', '临设', '围挡', '临时道路', '场地恢复',
    'construction', 'site', 'workface', 'temporary works', 'site cleanup', 'crew',
  ].some((token) => text.includes(token))
}

function resourceClassMatchScore(
  item: V1474ResourceClassMapping,
  text: string,
  context: { standardWorkCode?: string | null; standardWorkCodes?: string[] | null } = {},
) {
  const contextCodes = readResourceClassContextCodes(context)
  const recordCodes = (item.standardWorkCodes ?? []).map(normalizeResourceClassText)
  const exactContextCode = normalizeResourceClassText(context.standardWorkCode)
  if (exactContextCode && recordCodes.includes(exactContextCode)) return 260
  const directIndex = contextCodes.findIndex((code) => recordCodes.includes(code))
  if (directIndex >= 0) return 140 - Math.min(directIndex, 20)

  const matchedPrefixLength = (item.standardCatalogCodePrefixes ?? []).reduce((max, rawPrefix) => {
    const prefix = normalizeResourceClassText(rawPrefix)
    const matched = contextCodes.some((code) => code === prefix || code.startsWith(`${prefix}-`))
    return matched ? Math.max(max, prefix.length) : max
  }, 0)
  if (matchedPrefixLength > 0) return 80 + matchedPrefixLength

  const matchedKeywordLength = item.keywords.reduce((max, keyword) => {
    const normalizedKeyword = normalizeResourceClassText(keyword)
    return normalizedKeyword && text.includes(normalizedKeyword) ? Math.max(max, semanticKeywordLength(normalizedKeyword)) : max
  }, 0)
  return matchedKeywordLength > 0 ? 20 + Math.min(10, matchedKeywordLength / 10) : 0
}

function resourceOperationMatch(
  rule: V1474ResourceOperationRule,
  text: string,
  context: { standardWorkCode?: string | null; standardWorkCodes?: string[] | null } = {},
) {
  const contextCodes = readResourceClassContextCodes(context)
  const ruleCodes = (rule.standardWorkCodes ?? []).map(normalizeResourceClassText)
  const exactContextCode = normalizeResourceClassText(context.standardWorkCode)
  if (exactContextCode && ruleCodes.includes(exactContextCode)) {
    return { score: 260, matchSource: 'standard_work_code' as const }
  }
  const directIndex = contextCodes.findIndex((code) => ruleCodes.includes(code))
  if (directIndex >= 0) {
    return { score: 140 - Math.min(directIndex, 20), matchSource: 'standard_work_code' as const }
  }

  const matchedPrefixLength = (rule.standardCatalogCodePrefixes ?? []).reduce((max, rawPrefix) => {
    const prefix = normalizeResourceClassText(rawPrefix)
    const matched = contextCodes.some((code) => code === prefix || code.startsWith(`${prefix}-`))
    return matched ? Math.max(max, prefix.length) : max
  }, 0)
  if (matchedPrefixLength > 0) {
    return { score: 80 + matchedPrefixLength, matchSource: 'standard_catalog_prefix' as const }
  }

  const matchedKeywordLength = rule.keywords.reduce((max, keyword) => {
    const normalizedKeyword = normalizeResourceClassText(keyword)
    return normalizedKeyword && text.includes(normalizedKeyword) ? Math.max(max, semanticKeywordLength(normalizedKeyword)) : max
  }, 0)
  return matchedKeywordLength > 0
    ? { score: 20 + Math.min(10, matchedKeywordLength / 10), matchSource: 'keyword' as const }
    : { score: 0, matchSource: 'keyword' as const }
}

const RESOURCE_OPERATION_SEQUENCE_RANK: Record<V1474ResourceOperationType, number> = {
  transport: 1,
  install: 2,
  use: 3,
  support: 4,
  add_section: 5,
  inspection_acceptance: 6,
  commissioning: 7,
  maintenance: 8,
  dismantle: 9,
  cleanup: 10,
}

function operationSequenceRank(operationType: V1474ResourceOperationType) {
  return RESOURCE_OPERATION_SEQUENCE_RANK[operationType] ?? 99
}

function findV1474ResourceOperation(
  item: V1474ResourceClassMapping,
  text: string,
  context: { standardWorkCode?: string | null; standardWorkCodes?: string[] | null } = {},
) {
  const candidates = (item.operationRules ?? [])
    .map((rule, index) => ({ rule, index, ...resourceOperationMatch(rule, text, context) }))
    .filter((candidate) => candidate.score > 0)
  const hasStandardWorkEvidence = candidates.some((candidate) => candidate.matchSource !== 'keyword')
  return candidates
    .sort((left, right) => {
      if (!hasStandardWorkEvidence && left.matchSource === 'keyword' && right.matchSource === 'keyword') {
        const sequenceDiff = operationSequenceRank(left.rule.operationType) - operationSequenceRank(right.rule.operationType)
        if (sequenceDiff !== 0) return sequenceDiff
      }
      return right.score - left.score || left.index - right.index
    })[0]
}

export function findV1474ResourceClassMatch(
  text: string,
  context: { standardWorkCode?: string | null; standardWorkCodes?: string[] | null } = {},
): V1474ResourceClassMatch | null {
  const normalized = normalizeResourceClassText(text)
  const candidates = V1474_RESOURCE_CLASS_SEED
    .map((item, index) => ({ item, index, score: resourceClassMatchScore(item, normalized, context) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
  const winner = candidates[0]?.item
    ?? (
      isConstructionLikeGeneralResourceText(normalized)
        ? V1474_RESOURCE_CLASS_SEED.find((item) => item.resourceClass === 'general_crew')
        : null
    )
  if (!winner) return null

  const operation = findV1474ResourceOperation(winner, normalized, context)
  const pressureDimensions = winner.pressureDimensions?.length
    ? winner.pressureDimensions
    : inferV1474ResourcePressureDimensions(winner.resourceClass)
  return {
    stableCode: winner.stableCode,
    resourceClass: winner.resourceClass,
    mapping: {
      ...winner,
      sameZoneDailyLimit: winner.sameZoneDailyLimit ?? winner.sameFloorDailyLimit,
      pressureDimensions,
    },
    pressureDimensions,
    ...(operation
      ? {
        resourceOperationType: operation.rule.operationType,
        operationConfidence: operation.rule.confidence,
        operationMatchSource: operation.matchSource,
      }
      : {}),
  }
}

export function findV1474ResourceClass(
  text: string,
  context: { standardWorkCode?: string | null; standardWorkCodes?: string[] | null } = {},
) {
  return findV1474ResourceClassMatch(text, context)?.mapping ?? null
}

export const V1474_RESOURCE_CLASS_SEED_META = {
  seedVersion: V1474_RESOURCE_CLASS_SEED_VERSION,
  seedScope: 'algorithm_auxiliary',
  sourceStandards: ['GB50204-2015', 'GB50205-2020', 'GB50208-2011', 'GB50210-2018', 'GB50242-2002', 'GB50303-2015', 'GB50243-2016', 'GB50310-2002', 'GB/T51231-2016', 'GB55024-2022', 'GB55037-2022', 'GB55032-2022'],
  expectedCounts: {
    records: V1474_RESOURCE_CLASS_SEED.length,
  },
  evidenceSources: V1474_RESOURCE_CLASS_EVIDENCE_SOURCES,
  generationPolicy: 'source_backed_no_generic_generation; daily limits are algorithm constraints and must be calibrated by project resource plans',
  webVerified: true,
  reviewNeeded: false,
} as const
