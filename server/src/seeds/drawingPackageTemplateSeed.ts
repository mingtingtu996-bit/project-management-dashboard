import type { ReviewMode } from '../services/drawingPackageService.js'

export const DRAWING_PACKAGE_TEMPLATE_SEED_VERSION = 'v1.4.22.6'
export const GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE = 'general_drawing_package_v1'

export interface DrawingPackageTemplateItemSeed {
  itemCode: string
  itemName: string
  disciplineType?: string
  isRequired: boolean
  sortOrder: number
}

export type DrawingPackageDeliverableRole =
  | 'site_and_building_execution_base'
  | 'statutory_review_package'
  | 'specialty_execution_package'
  | 'completion_archive_package'

export interface DrawingPackageTemplatePackageSeed {
  packageCode: string
  packageName: string
  disciplineType: string
  documentPurpose: string
  reviewMode: ReviewMode
  reviewBasis: string
  scopeLevel: 'project' | 'building' | 'specialty'
  deliverableRole: DrawingPackageDeliverableRole
  linkedConstructionStage: string
  linkedAcceptancePurpose: string
  commonMissingSignals: string[]
  precisionHints: string[]
  experienceTags: string[]
  items: DrawingPackageTemplateItemSeed[]
  triggerKeywords?: string[]
}

export interface DrawingPackageBusinessProfile {
  businessTypeCode: string
  businessTypeName: string
  aliases: string[]
  defaultPackageCodes: string[]
  optionalPackageCodes: string[]
  sourcePolicyHints: string[]
}

export interface DrawingPackageTemplateSeed {
  templateCode: string
  templateName: string
  seedVersion: string
  packagePool: DrawingPackageTemplatePackageSeed[]
  businessProfiles: DrawingPackageBusinessProfile[]
  experienceIterationPolicy: {
    sourceMode: 'real_project_experience_replay'
    networkPolicy: 'disabled_for_drawing_package_seed'
    mutationPolicy: 'no_silent_seed_mutation'
    runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate'
    candidatePromotionGate: 'project_replay_hit_rate_and_sample_count'
  }
  commercialMaturityBaseline: {
    assetLevel: 'drawing_package'
    formalBusinessProfileCount: number
    packagePoolCount: number
    responsibilityPolicy: 'reuse_existing_drawing_responsibility_fields_only'
    pageBoundary: 'template_preview_apply_only_main_drawings_page_owns_versions_and_status'
  }
}

const BUSINESS_PROFILE_SOURCE_POLICY = [
  '来自项目向导 projectGenerationFacts.businessType / businessTypeCode / businessSubtype 的静态画像',
  '施工图纸 seed 第一版只预制图纸包和包内目录项，不生成单张图纸版本',
  '责任字段沿用施工图纸主页面已有 design_unit / review_unit / lead_unit / responsible_user_id，不新增责任方概念',
]

const pkg = (
  packageCode: string,
  packageName: string,
  disciplineType: string,
  documentPurpose: string,
  reviewMode: ReviewMode,
  reviewBasis: string,
  scopeLevel: DrawingPackageTemplatePackageSeed['scopeLevel'],
  itemNames: string[],
  triggerKeywords: string[] = [],
): DrawingPackageTemplatePackageSeed => ({
  packageCode,
  packageName,
  disciplineType,
  documentPurpose,
  reviewMode,
  reviewBasis,
  scopeLevel,
  deliverableRole: resolvePackageDeliverableRole(packageCode, reviewMode),
  linkedConstructionStage: resolvePackageConstructionStage(packageCode),
  linkedAcceptancePurpose: resolvePackageAcceptancePurpose(packageCode, reviewMode),
  commonMissingSignals: resolvePackageCommonMissingSignals(packageCode, triggerKeywords),
  precisionHints: resolvePackagePrecisionHints(packageCode, scopeLevel),
  experienceTags: resolvePackageExperienceTags(packageCode, disciplineType),
  triggerKeywords,
  items: itemNames.map((itemName, index) => ({
    itemCode: `${packageCode.replace(/^pkg-/, '')}-${String(index + 1).padStart(2, '0')}`,
    itemName,
    disciplineType,
    isRequired: true,
    sortOrder: index + 1,
  })),
})

function resolvePackageDeliverableRole(packageCode: string, reviewMode: ReviewMode): DrawingPackageDeliverableRole {
  if (packageCode === 'pkg-completion-archive') return 'completion_archive_package'
  if (reviewMode === 'mandatory') return 'statutory_review_package'
  if (packageCode.includes('specialty') || packageCode.includes('process') || packageCode.includes('interface')) {
    return 'specialty_execution_package'
  }
  return 'site_and_building_execution_base'
}

function resolvePackageConstructionStage(packageCode: string) {
  if (packageCode === 'pkg-completion-archive') return 'completion_handover_archive'
  if (packageCode.includes('review')) return 'design_review_and_preconstruction_clearance'
  if (packageCode.includes('structure')) return 'foundation_and_structure_execution'
  if (
    packageCode.includes('water')
    || packageCode.includes('hvac')
    || packageCode.includes('electrical')
    || packageCode.includes('intelligent')
  ) {
    return 'mep_installation_and_commissioning'
  }
  if (packageCode.includes('landscape') || packageCode.includes('traffic') || packageCode.includes('tod')) {
    return 'site_interface_and_external_works'
  }
  return 'construction_execution'
}

function resolvePackageAcceptancePurpose(packageCode: string, reviewMode: ReviewMode) {
  if (packageCode === 'pkg-completion-archive') return 'as_built_archive_and_delivery_handover'
  if (reviewMode === 'mandatory') return 'statutory_specialty_acceptance_basis'
  if (packageCode.includes('fire')) return 'fire_acceptance_basis'
  if (packageCode.includes('civil-defense')) return 'civil_defense_acceptance_basis'
  if (packageCode.includes('environment')) return 'environmental_acceptance_basis'
  if (packageCode.includes('energy')) return 'energy_saving_and_green_building_check_basis'
  return 'construction_quality_and_completion_acceptance_basis'
}

function resolvePackageCommonMissingSignals(packageCode: string, triggerKeywords: string[]) {
  const signals = [
    'final_board_contains_unmapped_package',
    'package_item_remains_missing_after_first_template_apply',
  ]
  if (triggerKeywords.length > 0) signals.push('project_features_match_optional_specialty_but_package_not_generated')
  if (packageCode === 'pkg-completion-archive') signals.push('as_built_archive_row_exists_without_completion_archive_package')
  return signals
}

function resolvePackagePrecisionHints(packageCode: string, scopeLevel: DrawingPackageTemplatePackageSeed['scopeLevel']) {
  return [
    `package_code:${packageCode}`,
    `scope_level:${scopeLevel}`,
    'compare_against_final_project_drawing_board_package_codes',
  ]
}

function resolvePackageExperienceTags(packageCode: string, disciplineType: string) {
  return [
    packageCode.replace(/^pkg-/, ''),
    disciplineType,
  ]
}

export const DRAWING_PACKAGE_POOL: DrawingPackageTemplatePackageSeed[] = [
  pkg('pkg-master-plan-construction', '总图与竖向施工图包', '总图', '施工执行', 'none', '项目总平面、竖向、道路和场地管综的施工执行底图。', 'project', [
    '总平面施工图',
    '竖向设计图',
    '道路与场地铺装图',
    '室外综合管线图',
  ]),
  pkg('pkg-architecture-construction', '建筑施工图包', '建筑', '施工执行', 'none', '建筑专业施工执行基础包。', 'building', [
    '建筑设计总说明',
    '平面图',
    '立面图',
    '剖面图',
    '门窗表与节点详图',
  ]),
  pkg('pkg-structure-construction', '结构施工图包', '结构', '施工执行', 'none', '结构专业施工执行基础包。', 'building', [
    '结构设计总说明',
    '基础施工图',
    '梁板柱墙配筋图',
    '结构节点详图',
  ]),
  pkg('pkg-water-construction', '给排水施工图包', '给排水', '施工执行', 'none', '给水、排水、雨水和消防水接口的施工执行基础包。', 'building', [
    '给水系统图',
    '排水系统图',
    '雨水系统图',
    '泵房与管井详图',
  ]),
  pkg('pkg-hvac-construction', '暖通施工图包', '暖通', '施工执行', 'none', '采暖、通风、空调和防排烟相关施工执行基础包。', 'building', [
    '暖通设计说明',
    '空调通风平面图',
    '防排烟系统图',
    '机房与风管节点详图',
  ]),
  pkg('pkg-electrical-construction', '电气施工图包', '电气', '施工执行', 'none', '强电、照明、防雷接地和配电系统施工执行基础包。', 'building', [
    '电气设计说明',
    '配电系统图',
    '照明与动力平面图',
    '防雷接地施工图',
  ]),
  pkg('pkg-intelligent-construction', '智能化施工图包', '智能化', '施工执行', 'none', '弱电、安防、通信、BA 等智能化系统施工执行基础包。', 'building', [
    '智能化系统图',
    '综合布线图',
    '安防与门禁图',
    '机房与桥架详图',
  ]),
  pkg('pkg-fire-review', '消防专项图纸包', '消防', '送审报批', 'mandatory', '消防设计审查、消防验收或备案链路默认需要专项图纸包。', 'specialty', [
    '消防设计专篇',
    '消防总平面与防火分区图',
    '火灾自动报警系统图',
    '消火栓与喷淋系统图',
    '防排烟系统图',
  ], ['消防', 'fire']),
  pkg('pkg-civil-defense-review', '人防专项图纸包', '人防', '送审报批', 'mandatory', '涉及人防地下室或人防配建时需要专项图纸包。', 'specialty', [
    '人防设计说明',
    '人防平面图',
    '人防口部详图',
    '人防设备与防护单元图',
  ], ['人防', '地下室', 'civil defense']),
  pkg('pkg-energy-green-construction', '节能与绿色建筑图纸包', '节能绿建', '施工执行', 'optional', '节能、绿建、海绵或装配式要求通常需要独立归集。', 'specialty', [
    '节能设计专篇',
    '围护结构节能构造图',
    '绿色建筑技术措施表',
  ], ['节能', '绿色建筑', 'green', 'energy']),
  pkg('pkg-landscape-construction', '景观与室外工程图纸包', '景观', '施工执行', 'none', '景观、室外铺装、绿化及小市政施工执行包。', 'project', [
    '景观总平面图',
    '绿化种植图',
    '景观给排水与照明图',
    '铺装与构筑物详图',
  ], ['景观', '绿化', '园林', 'landscape']),
  pkg('pkg-curtain-wall-specialty', '幕墙专项图纸包', '幕墙', '施工执行', 'optional', '存在幕墙、采光顶或大面积外立面系统时启用。', 'specialty', [
    '幕墙设计说明',
    '幕墙立面分格图',
    '幕墙节点详图',
    '埋件与连接构造图',
  ], ['幕墙', '采光顶', 'curtain wall']),
  pkg('pkg-fit-out-specialty', '精装修专项图纸包', '精装修', '施工执行', 'optional', '酒店、商业、文体等精装修交付业态常用专项包。', 'specialty', [
    '精装修设计说明',
    '天花与地面铺装图',
    '墙面立面图',
    '固定家具与节点详图',
  ], ['精装修', '装修', 'fit-out']),
  pkg('pkg-hotel-back-of-house', '酒店后勤与机电专项图纸包', '酒店专项', '施工执行', 'optional', '酒店厨房、洗衣房、后勤和客房机电系统需要独立归集。', 'specialty', [
    '厨房工艺与排油烟图',
    '洗衣房工艺图',
    '客房机电综合图',
    '后勤动线与设备布置图',
  ], ['酒店', '厨房', '洗衣房', 'hotel']),
  pkg('pkg-medical-process-specialty', '医疗工艺专项图纸包', '医疗专项', '施工执行', 'optional', '医院、医疗建筑的医技流程、洁污分流和专项系统图纸包。', 'specialty', [
    '医疗工艺流程图',
    '洁污分流与物流图',
    '医用气体系统图',
    '重点科室专项详图',
  ], ['医院', '医疗', '医用气体', '洁净']),
  pkg('pkg-school-lab-specialty', '学校实验与教学专项图纸包', '教育专项', '施工执行', 'optional', '学校项目中实验室、食堂、体育教学等专项空间的图纸包。', 'specialty', [
    '实验室工艺平面图',
    '教学专用空间布置图',
    '食堂后厨工艺图',
    '体育设施配套图',
  ], ['学校', '实验室', '食堂', '体育']),
  pkg('pkg-industrial-process', '工业工艺与厂务图纸包', '工艺厂务', '施工执行', 'optional', '厂房、物流、生产配套项目的工艺、厂务和生产辅助系统图纸包。', 'specialty', [
    '工艺设备布置图',
    '厂务动力管线图',
    '物流与装卸动线图',
    '生产辅助用房详图',
  ], ['厂房', '工业', '工艺', '物流', 'factory']),
  pkg('pkg-environment-protection-specialty', '环保与排放专项图纸包', '环保', '施工执行', 'optional', '涉及废水、废气、噪声、固废治理设施时启用。', 'specialty', [
    '环保设施总说明',
    '废水废气治理设施图',
    '噪声控制措施图',
    '排放口与监测点位图',
  ], ['环保', '废水', '废气', '排污', 'environment']),
  pkg('pkg-data-center-critical-mep', '数据中心关键机电图纸包', '数据中心机电', '施工执行', 'optional', '数据中心供配电、制冷、弱电和可靠性系统需要独立归集。', 'specialty', [
    '关键供配电系统图',
    'UPS 与柴油发电系统图',
    '制冷与气流组织图',
    '机柜与综合布线图',
  ], ['数据中心', 'IDC', '机房', 'UPS']),
  pkg('pkg-clean-room-specialty', '洁净与受控环境图纸包', '洁净专项', '施工执行', 'optional', '医院、数据中心、实验室等存在洁净或受控环境时启用。', 'specialty', [
    '洁净分区与压差图',
    '洁净空调系统图',
    '围护与密封节点图',
  ], ['洁净', '压差', '受控环境', 'clean room']),
  pkg('pkg-traffic-interface-specialty', '交通接驳与客流组织图纸包', '交通接驳', '施工执行', 'optional', '枢纽、TOD、文体商业等客流和交通接驳复杂项目启用。', 'project', [
    '交通组织总图',
    '人车流线图',
    '接驳口与落客区图',
    '导向标识布点图',
  ], ['交通', '接驳', '客流', 'TOD']),
  pkg('pkg-sports-culture-specialty', '体育文体工艺专项图纸包', '文体专项', '施工执行', 'optional', '体育馆、剧院、文化中心等看台、舞台、声光电专项包。', 'specialty', [
    '看台与观众席详图',
    '舞台机械与声光电接口图',
    '大空间疏散与导向图',
    '赛事或演出工艺条件图',
  ], ['体育馆', '剧院', '文化', '舞台', '声光']),
  pkg('pkg-tod-interface-specialty', 'TOD 与轨道接口图纸包', '轨道接口', '施工执行', 'optional', 'TOD 上盖、换乘层、轨道保护区和接口工程专项包。', 'specialty', [
    '轨道接口条件图',
    '换乘与上盖结构接口图',
    '轨道保护区措施图',
    '运营界面移交图',
  ], ['TOD', '轨道', '上盖', '换乘']),
  pkg('pkg-renovation-survey-reinforcement', '改造测绘与加固图纸包', '改造加固', '施工执行', 'optional', '既有建筑改造、加固、节能或文保修缮项目的底图与加固包。', 'building', [
    '既有建筑测绘图',
    '结构检测与加固图',
    '拆改范围图',
    '新旧交接节点详图',
  ], ['改造', '加固', '修缮', '既有建筑']),
  pkg('pkg-modular-factory-assembly', '模块化部品与装配图纸包', '模块化', '施工执行', 'optional', '模块化建筑或 MiC 项目的工厂制造、运输和现场拼装图纸包。', 'specialty', [
    '模块单元拆分图',
    '工厂制造详图',
    '运输吊装方案图',
    '现场拼装与连接节点图',
  ], ['模块化', 'MiC', '装配式', 'modular']),
  pkg('pkg-completion-archive', '竣工图归档包', '竣工归档', '竣工归档', 'manual_confirm', '竣工图归档包只预置归集口径，正式图纸版本仍由图纸主页面维护。', 'project', [
    '竣工图目录',
    '各专业竣工图',
    '变更洽商汇总',
    '归档移交清单',
  ]),
]

const CORE_BUILDING_PACKAGES = [
  'pkg-master-plan-construction',
  'pkg-architecture-construction',
  'pkg-structure-construction',
  'pkg-water-construction',
  'pkg-hvac-construction',
  'pkg-electrical-construction',
  'pkg-intelligent-construction',
  'pkg-fire-review',
  'pkg-civil-defense-review',
  'pkg-energy-green-construction',
  'pkg-completion-archive',
]

const BUSINESS_PROFILES: DrawingPackageBusinessProfile[] = [
  {
    businessTypeCode: 'general_civil',
    businessTypeName: '民用建筑',
    aliases: ['general_civil', 'civil_residential', 'civil_office_commercial', 'residential', 'commercial', 'office', '民用建筑', '住宅', '商办', '综合体'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-landscape-construction'],
    optionalPackageCodes: ['pkg-curtain-wall-specialty', 'pkg-fit-out-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'hotel',
    businessTypeName: '酒店',
    aliases: ['hotel', 'luxury_hotel', '酒店', '宾馆', '客房楼'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-landscape-construction', 'pkg-curtain-wall-specialty', 'pkg-fit-out-specialty', 'pkg-hotel-back-of-house'],
    optionalPackageCodes: ['pkg-clean-room-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'hospital',
    businessTypeName: '医院',
    aliases: ['hospital', 'medical', '医院', '医疗', '医技', '住院楼', '门诊'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-medical-process-specialty', 'pkg-clean-room-specialty', 'pkg-environment-protection-specialty'],
    optionalPackageCodes: ['pkg-landscape-construction', 'pkg-curtain-wall-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'school',
    businessTypeName: '学校',
    aliases: ['school', 'campus', 'education', '学校', '校园', '教学楼', '实验楼', '宿舍楼'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-landscape-construction', 'pkg-school-lab-specialty'],
    optionalPackageCodes: ['pkg-fit-out-specialty', 'pkg-clean-room-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'industrial',
    businessTypeName: '工业建筑',
    aliases: ['industrial', 'industrial_general', 'industrial_logistics', 'factory', 'plant', '工业建筑', '厂房', '物流仓储'],
    defaultPackageCodes: [
      ...CORE_BUILDING_PACKAGES,
      'pkg-industrial-process',
      'pkg-environment-protection-specialty',
    ],
    optionalPackageCodes: ['pkg-clean-room-specialty', 'pkg-landscape-construction'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'data_center',
    businessTypeName: '数据中心',
    aliases: ['data_center', 'data center', 'idc', 'IDC', '数据中心', '机房楼', '动力中心'],
    defaultPackageCodes: [
      ...CORE_BUILDING_PACKAGES,
      'pkg-data-center-critical-mep',
      'pkg-clean-room-specialty',
      'pkg-environment-protection-specialty',
    ],
    optionalPackageCodes: ['pkg-landscape-construction'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'transportation_hub',
    businessTypeName: '交通枢纽',
    aliases: ['transportation_hub', 'transportation', '交通枢纽', '枢纽主体', '站房', '机场', '港口'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-traffic-interface-specialty', 'pkg-curtain-wall-specialty', 'pkg-fit-out-specialty'],
    optionalPackageCodes: ['pkg-landscape-construction', 'pkg-tod-interface-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'sports_culture',
    businessTypeName: '体育文体建筑',
    aliases: ['sports_culture', 'sports', 'culture', '体育文体建筑', '体育馆', '场馆', '剧院', '文化中心'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-sports-culture-specialty', 'pkg-traffic-interface-specialty', 'pkg-curtain-wall-specialty', 'pkg-fit-out-specialty'],
    optionalPackageCodes: ['pkg-landscape-construction'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'tod_upper_cover',
    businessTypeName: 'TOD上盖',
    aliases: ['tod_upper_cover', 'tod', 'TOD上盖', '上盖', '转换层', '轨道交通上盖'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-tod-interface-specialty', 'pkg-traffic-interface-specialty', 'pkg-curtain-wall-specialty'],
    optionalPackageCodes: ['pkg-landscape-construction', 'pkg-fit-out-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'renovation',
    businessTypeName: '改造修缮',
    aliases: ['renovation', 'renovation_seismic', 'renovation_energy', 'renovation_heritage', '改造修缮', '加固抗震', '节能改造', '文保修缮'],
    defaultPackageCodes: [
      'pkg-architecture-construction',
      'pkg-structure-construction',
      'pkg-water-construction',
      'pkg-hvac-construction',
      'pkg-electrical-construction',
      'pkg-intelligent-construction',
      'pkg-fire-review',
      'pkg-energy-green-construction',
      'pkg-renovation-survey-reinforcement',
      'pkg-completion-archive',
    ],
    optionalPackageCodes: ['pkg-fit-out-specialty', 'pkg-curtain-wall-specialty', 'pkg-civil-defense-review'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
  {
    businessTypeCode: 'modular_building',
    businessTypeName: '模块化建筑',
    aliases: ['modular_building', 'modular_mic', 'mic_modular', '模块化建筑', '模块化单元', 'MiC', '装配式'],
    defaultPackageCodes: [...CORE_BUILDING_PACKAGES, 'pkg-modular-factory-assembly'],
    optionalPackageCodes: ['pkg-landscape-construction', 'pkg-fit-out-specialty'],
    sourcePolicyHints: BUSINESS_PROFILE_SOURCE_POLICY,
  },
]

export const DRAWING_PACKAGE_TEMPLATE_SEED: DrawingPackageTemplateSeed = {
  templateCode: GENERAL_DRAWING_PACKAGE_TEMPLATE_CODE,
  templateName: '施工图纸包系统模板',
  seedVersion: DRAWING_PACKAGE_TEMPLATE_SEED_VERSION,
  packagePool: DRAWING_PACKAGE_POOL,
  businessProfiles: BUSINESS_PROFILES,
  experienceIterationPolicy: {
    sourceMode: 'real_project_experience_replay',
    networkPolicy: 'disabled_for_drawing_package_seed',
    mutationPolicy: 'no_silent_seed_mutation',
    runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
    candidatePromotionGate: 'project_replay_hit_rate_and_sample_count',
  },
  commercialMaturityBaseline: {
    assetLevel: 'drawing_package',
    formalBusinessProfileCount: BUSINESS_PROFILES.length,
    packagePoolCount: DRAWING_PACKAGE_POOL.length,
    responsibilityPolicy: 'reuse_existing_drawing_responsibility_fields_only',
    pageBoundary: 'template_preview_apply_only_main_drawings_page_owns_versions_and_status',
  },
}
