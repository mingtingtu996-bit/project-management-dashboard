export type TitleWeakRecognitionSignalType =
  | 'standard_work_hint'
  | 'scope_hint'
  | 'element_variant_hint'
  | 'method_variant_hint'

export type TitleWeakRecognitionSource =
  | 'template_seed_alias'
  | 'row_name_suggestion'

export type TitleWeakRecognitionConfidence = 'low' | 'medium' | 'high'

export type TitleWeakRecognitionMatchQuality =
  | 'exact_alias'
  | 'keyword_phrase'
  | 'token_combo'
  | 'label_hint'
  | 'excluded'
  | 'unrecognizable'
  | 'no_match'

export type TitleWeakRecognitionEffectPolicy = {
  canInferStandardWork: boolean
  canAffectBaseDays: false
  canAffectScale: false | 'low_confidence_only'
  canGenerateRows: false
  maxScaleFactor?: number
}

export type TitleWeakRecognitionRule = {
  ruleId: string
  signalType: TitleWeakRecognitionSignalType
  code: string
  standardWorkCodes?: string[]
  contextKeywordsByStandardWorkCode?: Record<string, string[]>
  label: string
  keywords: string[]
  aliases?: string[]
  synonymGroups?: string[][]
  negativeKeywords?: string[]
  exclusionPatterns?: string[]
  minMatchScore?: number
  applicableProcessKeywords?: string[]
  confidence: TitleWeakRecognitionConfidence
  source: TitleWeakRecognitionSource
  templateSeedReferences: string[]
  effectPolicy: TitleWeakRecognitionEffectPolicy
}

export type TitleWeakRecognitionMatch = {
  matched: boolean
  score: number
  quality: TitleWeakRecognitionMatchQuality
  reason: string
  normalizedText: string
  semanticText: string
  matchedTerms: string[]
  excludedBy?: string | null
}

export type TitleWeakRecognizability = {
  recognizable: boolean
  reason: string
  normalizedText: string
  semanticText: string
}

export type TitleWeakElementVariant = {
  code: string
  label: string
  source: 'explicit_engineering_feature' | 'row_name_suggestion'
  confidence: TitleWeakRecognitionConfidence
}

export type TitleWeakMethodVariant = {
  code: string
  label: string
  source: 'explicit_engineering_feature' | 'row_name_suggestion'
  confidence: TitleWeakRecognitionConfidence
}

export type TitleWeakScaleSignal = {
  factor: number
  reason: string | null
  source: 'title'
  confidence: 'low'
  signals: string[]
}

export const TITLE_WEAK_RECOGNITION_SEED_META = {
  seedCode: 'v1472-title-weak-recognition',
  seedName: 'v1.4.7.2 标题弱识别规则',
  seedRole: 'template_seed_search_index',
  version: '2026-05-17',
  templateSeedBasis: [
    'server/src/seeds/chinaGb50300TemplateCatalog.ts',
    'server/src/seeds/domainWbsTemplateCatalogs.ts',
    'server/src/seeds/standardWorkDurationSeed.ts',
  ],
  governanceBoundary: [
    '不直接输出 defaultDurationDays',
    '不直接生成 recommendedDurationDays',
    '不作为 baseDays 来源',
    '不自动生成构件拆分行',
    '不自动创建工程对象',
    '只作为标准工序推断、范围规模提示、构件/工法候选的低置信输入',
  ],
} as const

export const TITLE_WEAK_MATCHING_POLICY = {
  version: '2026-05-18',
  algorithm: 'normalize_nfkc_then_substring_phrase_match_with_token_combo_fallback',
  minScore: {
    standardWorkHint: 0.42,
    elementVariantHint: 0.38,
    scopeHint: 0.38,
    methodVariantHint: 0.38,
  },
  score: {
    exactAlias: 0.78,
    keywordPhrase: 0.68,
    tokenComboBase: 0.42,
    tokenComboBonus: 0.08,
    labelHint: 0.52,
  },
  excludesBeforePositiveMatch: true,
  garbageTitlesDoNotEnterCandidateLearning: true,
} as const

export const TITLE_WEAK_PROCESS_CONTEXT_KEYWORDS = [
  '钢筋',
  '绑扎',
  '模板',
  '支模',
  '混凝土',
  '砼',
  '浇筑',
  '现浇',
  '预制',
  '装配',
  '砌筑',
  '安装',
  '施工',
  '调试',
  '敷设',
  '铺贴',
  '防水',
  '保温',
  '幕墙',
  '门窗',
  '管线',
  '桥架',
  '风管',
  '喷淋',
  '消火栓',
  '探测器',
  '电梯',
  '导轨',
  '轿厢',
  '设备',
  '支吊架',
]

const noBaseDaysPolicy: TitleWeakRecognitionEffectPolicy = {
  canInferStandardWork: false,
  canAffectBaseDays: false,
  canAffectScale: false,
  canGenerateRows: false,
}

const MANAGED_FRONTIER_DOMAIN_STANDARD_WORK_ALIAS_CONFIG = [
  {
    stableCode: 'expert_domain_heritage_preservation',
    label: '文物建筑保护修缮',
    keywords: ['文保本体', '病害调查', '传统工艺修缮', '可逆加固', '微环境监测'],
    aliases: ['文保建筑保护修缮', '传统材料与传统工艺修缮', '文物建筑可逆加固与监测'],
  },
  {
    stableCode: 'expert_domain_industrial_logistics_automation',
    label: '工业物流与自动化系统',
    keywords: ['自动化物流', '立体仓库', '输送分拣', 'ASRS', 'AGV调试'],
    aliases: ['智能物流系统安装调试', '自动化立体仓库与输送分拣系统', '工业物流自动化联调'],
  },
  {
    stableCode: 'expert_domain_industrial_process_validation',
    label: '工业工艺系统安装验证',
    keywords: ['工艺设备安装', '工艺管线', '工艺系统验证', '性能验证', '试生产验证'],
    aliases: ['工艺设备与工艺管线安装验证', '工业工艺系统性能验证', '工艺系统试生产验证'],
  },
  {
    stableCode: 'expert_domain_industrial_heavy_equipment',
    label: '工业重型设备安装',
    keywords: ['重型设备基础', '大件吊装', '精密找正', '设备二次灌浆', '重载调试'],
    aliases: ['重型设备基础与安装', '重型工艺设备吊装找正', '重型设备安装与负荷调试'],
  },
  {
    stableCode: 'expert_domain_transportation_rail_station',
    label: '铁路客站站房与旅客系统',
    keywords: ['铁路客站', '高铁站房', '站台雨棚', '旅客服务系统', '站房联调'],
    aliases: ['铁路客站站房施工', '高铁站房与站台雨棚施工', '铁路客站旅客服务系统联调'],
  },
  {
    stableCode: 'expert_domain_transportation_metro_interchange',
    label: '地铁换乘站接口与联调',
    keywords: ['地铁换乘站', '轨行区接口', '车站机电', '屏蔽门', '换乘站综合联调'],
    aliases: ['地铁换乘车站施工', '地铁车站轨行区接口施工', '换乘站机电与屏蔽门联调'],
  },
  {
    stableCode: 'expert_domain_transportation_bus_terminal',
    label: '汽车客运站运营系统',
    keywords: ['汽车客运站', '客运枢纽', '发车位', '车辆流线', '检票系统'],
    aliases: ['汽车客运站施工', '客运枢纽发车位与车辆流线施工', '客运站检票与运营系统联调'],
  },
  {
    stableCode: 'expert_domain_sports_culture',
    label: '体育场馆大跨赛事系统',
    keywords: ['体育场', '大跨度屋盖', '看台碗区', '比赛场地', '赛事照明', '广播转播', '满载演练'],
    aliases: ['体育场施工', '体育场看台碗区与大跨度屋盖施工', '体育场赛事系统与比赛场地综合联调'],
  },
  {
    stableCode: 'expert_domain_sports_indoor_arena',
    label: '体育馆赛事系统',
    keywords: ['体育馆', '活动看台', '赛事照明', '计时计分', '场馆转换'],
    aliases: ['室内体育馆施工', '体育馆活动看台与赛事照明施工', '体育馆计时计分与赛事系统联调'],
  },
  {
    stableCode: 'expert_domain_sports_theater',
    label: '剧院舞台与声学系统',
    keywords: ['剧院', '舞台机械', '舞台灯光', '舞台音响', '声学调试'],
    aliases: ['剧院舞台系统施工', '剧院舞台机械与灯光音响安装', '剧院声学与演出系统联调'],
  },
  {
    stableCode: 'expert_domain_sports_exhibition',
    label: '会展中心展陈系统',
    keywords: ['会展中心', '展览馆', '展陈系统', '展馆大跨度', '展会转换'],
    aliases: ['会展中心施工', '展览馆展陈系统施工', '会展中心展陈与展会转换调试'],
  },
  {
    stableCode: 'expert_foundation_pit_support',
    label: '基坑支护与降水',
    keywords: ['基坑支护', '基坑围护', '围护桩', '内支撑', '基坑降水'],
    aliases: ['基坑支护与降排水施工', '围护桩与内支撑施工', '基坑锚索支护与降水'],
  },
  {
    stableCode: 'expert_pile_foundation',
    label: '桩基础施工',
    keywords: ['桩基础工程', '桩基综合施工', '试桩与工程桩', '群桩施工组织'],
    aliases: ['桩基础工程施工', '桩基综合施工与检测', '试桩与工程桩施工'],
  },
] as const

const lowScalePolicy: TitleWeakRecognitionEffectPolicy = {
  canInferStandardWork: false,
  canAffectBaseDays: false,
  canAffectScale: 'low_confidence_only',
  canGenerateRows: false,
  maxScaleFactor: 1.3,
}

export const TITLE_WEAK_ELEMENT_VARIANT_RULES: TitleWeakRecognitionRule[] = [
  {
    ruleId: 'element_post_cast_strip',
    signalType: 'element_variant_hint',
    code: 'post_cast_strip',
    label: '后浇带',
    keywords: ['后浇带'],
    applicableProcessKeywords: ['混凝土', '浇筑', '封闭', '防水'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_constructional_column',
    signalType: 'element_variant_hint',
    code: 'constructional_column',
    label: '构造柱',
    keywords: ['构造柱'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '砌筑'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_ring_beam',
    signalType: 'element_variant_hint',
    code: 'ring_beam',
    label: '圈梁',
    keywords: ['圈梁'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '砌筑'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_lintel',
    signalType: 'element_variant_hint',
    code: 'lintel',
    label: '过梁',
    keywords: ['过梁'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '砌筑'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_foundation',
    signalType: 'element_variant_hint',
    code: 'foundation',
    label: '基础',
    keywords: ['基础', '承台', '筏板', '底板'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '浇筑', '防水'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_column',
    signalType: 'element_variant_hint',
    code: 'column',
    label: '柱',
    keywords: ['柱'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '浇筑'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_beam',
    signalType: 'element_variant_hint',
    code: 'beam',
    label: '梁',
    keywords: ['梁'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '浇筑'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_slab',
    signalType: 'element_variant_hint',
    code: 'slab',
    label: '板',
    keywords: ['板', '楼板'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '浇筑'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_wall',
    signalType: 'element_variant_hint',
    code: 'wall',
    label: '墙',
    keywords: ['墙', '剪力墙', '墙体'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '砌筑', '抹灰', '防水'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_stair',
    signalType: 'element_variant_hint',
    code: 'stair',
    label: '楼梯',
    keywords: ['楼梯', '梯段'],
    applicableProcessKeywords: ['钢筋', '模板', '混凝土', '浇筑', '安装'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_window',
    signalType: 'element_variant_hint',
    code: 'window',
    label: '窗',
    keywords: ['窗', '门窗', '窗框', '窗扇'],
    applicableProcessKeywords: ['安装', '塞缝', '淋水', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'china-facade-curtain-wall'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_door',
    signalType: 'element_variant_hint',
    code: 'door',
    label: '门',
    keywords: ['门', '防火门', '入户门', '门框', '门扇'],
    applicableProcessKeywords: ['安装', '调试', '验收', '联动'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'china-cecs-fire-system'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_curtain_wall_panel',
    signalType: 'element_variant_hint',
    code: 'curtain_wall_panel',
    label: '幕墙面板',
    keywords: ['幕墙面板', '玻璃幕墙', '石材幕墙', '金属幕墙', '幕墙'],
    applicableProcessKeywords: ['龙骨', '安装', '打胶', '淋水', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-facade-curtain-wall'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_keel',
    signalType: 'element_variant_hint',
    code: 'keel',
    label: '龙骨',
    keywords: ['龙骨', '次龙骨', '主龙骨'],
    applicableProcessKeywords: ['安装', '调平', '隐蔽', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'china-facade-curtain-wall'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_pipeline',
    signalType: 'element_variant_hint',
    code: 'pipeline',
    label: '管线',
    keywords: ['管线', '管道', '管网'],
    applicableProcessKeywords: ['安装', '敷设', '试压', '冲洗', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-plumbing-heating-system', 'china-hvac-system', 'china-cecs-fire-system'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_cable_tray',
    signalType: 'element_variant_hint',
    code: 'cable_tray',
    label: '桥架',
    keywords: ['桥架', '梯架', '托盘', '槽盒'],
    applicableProcessKeywords: ['安装', '敷设', '接地', '隐蔽'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-electrical-system', 'china-intelligent-building-system'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_air_duct',
    signalType: 'element_variant_hint',
    code: 'air_duct',
    label: '风管',
    keywords: ['风管', '风道'],
    applicableProcessKeywords: ['制作', '安装', '严密性', '漏风', '调试'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-hvac-system', 'china-cecs-fire-system'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_equipment_base',
    signalType: 'element_variant_hint',
    code: 'equipment_base',
    label: '设备基础',
    keywords: ['设备基础', '基础复核'],
    applicableProcessKeywords: ['安装', '复核', '灌浆', '找平'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-hvac-system', 'china-plumbing-heating-system', 'china-elevator-installation'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_hanger',
    signalType: 'element_variant_hint',
    code: 'hanger',
    label: '支吊架',
    keywords: ['支吊架', '吊架', '支架'],
    applicableProcessKeywords: ['安装', '固定', '防腐', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-mep-coordination', 'china-hvac-system', 'china-electrical-system'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_terminal_point',
    signalType: 'element_variant_hint',
    code: 'terminal_point',
    label: '末端点位',
    keywords: ['点位', '末端', '探测器', '模块', '喷头', '面板'],
    applicableProcessKeywords: ['安装', '接线', '调试', '测试'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-intelligent-building-system', 'china-cecs-fire-system'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_elevator_rail',
    signalType: 'element_variant_hint',
    code: 'elevator_rail',
    label: '导轨',
    keywords: ['导轨'],
    applicableProcessKeywords: ['电梯', '安装', '校正', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-elevator-installation'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'element_elevator_car',
    signalType: 'element_variant_hint',
    code: 'elevator_car',
    label: '轿厢',
    keywords: ['轿厢'],
    applicableProcessKeywords: ['电梯', '安装', '调试', '验收'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-elevator-installation'],
    effectPolicy: noBaseDaysPolicy,
  },
]

export const TITLE_WEAK_METHOD_VARIANT_RULES: TitleWeakRecognitionRule[] = [
  {
    ruleId: 'method_aluminum_form_early_strip',
    signalType: 'method_variant_hint',
    code: 'aluminum_form_early_strip',
    label: '铝模早拆体系',
    keywords: ['铝模', '早拆', '铝模板'],
    aliases: ['铝模深化', '铝模配模', '铝模首拼', '铝模早拆', '铝模板安装', '铝模验收'],
    applicableProcessKeywords: ['铝模', '铝模板', '早拆', '模板', '支模', '配模', '结构', '混凝土', '楼层'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'method_wood_form',
    signalType: 'method_variant_hint',
    code: 'wood_form',
    label: '木模板体系',
    keywords: ['木模', '木模板', '木工支模'],
    aliases: ['木模配模', '木模板安装', '木工配模', '木工模板', '木工支模'],
    applicableProcessKeywords: ['木模', '木模板', '木工', '模板', '支模', '配模', '结构', '混凝土', '楼层'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'method_large_form',
    signalType: 'method_variant_hint',
    code: 'large_form',
    label: '大模板体系',
    keywords: ['大模板', '全钢大模', '钢模', '钢模板'],
    aliases: ['大模板安装', '全钢大模板', '全钢大模安装', '钢模板安装', '大模加固'],
    applicableProcessKeywords: ['大模板', '全钢大模', '钢模', '钢模板', '模板', '支模', '配模', '结构', '混凝土', '楼层'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'method_climbing_form',
    signalType: 'method_variant_hint',
    code: 'climbing_form',
    label: '爬模体系',
    keywords: ['爬模', '液压爬模', '爬架模板'],
    aliases: ['爬模安装', '爬模提升', '液压爬模提升', '核心筒爬模', '爬模验收'],
    applicableProcessKeywords: ['爬模', '液压爬模', '模板', '支模', '配模', '结构', '混凝土', '核心筒'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
  {
    ruleId: 'method_mass_concrete',
    signalType: 'method_variant_hint',
    code: 'mass_concrete',
    label: '大体积混凝土',
    keywords: ['大体积混凝土', '测温', '温控', '降温管'],
    aliases: ['大体积混凝土浇筑', '大体积测温', '混凝土温控', '测温点布设', '降温管安装'],
    applicableProcessKeywords: ['大体积', '混凝土', '浇筑', '测温', '温控', '筏板', '底板'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: noBaseDaysPolicy,
  },
]

export const TITLE_WEAK_STANDARD_WORK_ALIAS_RULES: TitleWeakRecognitionRule[] = [
  {
    ruleId: 'alias_site_setup_temp_works',
    signalType: 'standard_work_hint',
    code: 'site_setup_alias',
    standardWorkCodes: ['site_setup_temp_works'],
    label: '临建与三通一平',
    keywords: ['临建', '临水', '临电', '围挡', '场平', '三通一平', '临时道路', '临设', '安全文明', '扬尘治理', '洗车槽'],
    aliases: ['场地平整', '临时用水', '临时用电', '施工围挡', '临时道路', '现场准备', '临设搭设', '安全文明施工', '扬尘治理', '喷淋降尘', '雾炮安装', '洗车槽施工', '临时消防'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-site-management', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_scaffold_temp_access',
    signalType: 'standard_work_hint',
    code: 'scaffold_temp_access_alias',
    standardWorkCodes: ['scaffold_temp_access'],
    label: '脚手架与临时作业平台',
    keywords: ['脚手架', '外架', '落地架', '悬挑架', '爬架', '卸料平台', '吊篮', '连墙件', '剪刀撑', '安全通道', '防护棚', '临边防护', '盘扣架', '满堂架'],
    aliases: ['脚手架搭设', '脚手架拆除', '外架搭设', '外架拆除', '悬挑架搭设', '爬架提升', '落地架搭设', '卸料平台验收', '吊篮安装验收', '连墙件设置', '剪刀撑设置', '安全通道搭设', '防护棚搭设', '临边防护搭设', '洞口防护', '盘扣架搭设', '满堂架搭设'],
    negativeKeywords: ['周转材料询价', '脚手架租赁合同'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-danger-control', 'china-site-management', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_earthwork_excavation_backfill',
    signalType: 'standard_work_hint',
    code: 'earthwork_alias',
    standardWorkCodes: ['earthwork_excavation_transport', 'basement_waterproof_backfill'],
    contextKeywordsByStandardWorkCode: {
      earthwork_excavation_transport: ['土方', '开挖', '挖土', '外运', '清槽', '基坑开挖', '弃土'],
      basement_waterproof_backfill: ['回填', '肥槽', '地下室', '顶板覆土', '外墙回填', '房心回填'],
    },
    label: '土方开挖回填',
    keywords: ['土方', '开挖', '挖土', '外运', '回填', '清槽', '肥槽'],
    aliases: ['土方开挖', '土方外运', '基坑开挖', '清槽验槽', '肥槽回填', '房心回填', '顶板覆土'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_ground_replacement_cushion',
    signalType: 'standard_work_hint',
    code: 'ground_replacement_cushion_alias',
    standardWorkCodes: ['ground_replacement_cushion'],
    label: '换填垫层地基',
    keywords: ['换填', '垫层地基', '灰土地基', '砂石地基', '土工合成材料地基', '粉煤灰地基', '褥垫层'],
    aliases: ['换填垫层', '素土灰土地基', '砂和砂石地基', '土工格栅地基', '粉煤灰地基施工', '褥垫层施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_dynamic_compaction_ground',
    signalType: 'standard_work_hint',
    code: 'dynamic_compaction_ground_alias',
    standardWorkCodes: ['dynamic_compaction_ground'],
    label: '强夯地基',
    keywords: ['强夯', '夯点', '夯沉量', '补夯', '强夯置换'],
    aliases: ['强夯处理', '强夯地基施工', '分遍强夯施工', '夯后整平压实', '试夯区确认'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_grouting_ground',
    signalType: 'standard_work_hint',
    code: 'grouting_ground_alias',
    standardWorkCodes: ['grouting_ground'],
    label: '注浆地基',
    keywords: ['注浆地基', '注浆加固', '分序分段注浆', '封孔养护', '注浆效果检测'],
    aliases: ['注浆处理', '地基注浆加固', '注浆管安装', '压力流量和浆量记录', '封孔养护'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_preloading_ground',
    signalType: 'standard_work_hint',
    code: 'preloading_ground_alias',
    standardWorkCodes: ['preloading_ground'],
    label: '预压地基',
    keywords: ['预压地基', '堆载预压', '真空预压', '排水板', '沉降观测'],
    aliases: ['预压处理', '堆载预压施工', '真空预压施工', '砂垫层排水板施工', '预压沉降观测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_granular_compaction_composite_ground',
    signalType: 'standard_work_hint',
    code: 'granular_compaction_composite_ground_alias',
    standardWorkCodes: ['granular_compaction_composite_ground'],
    label: '砂石桩及挤密桩复合地基',
    keywords: ['砂石桩', '挤密桩', '夯实水泥土桩', '分层填料成桩', '振密控制'],
    aliases: ['砂石桩复合地基', '灰土挤密桩复合地基', '土和灰土挤密桩', '夯实水泥土桩复合地基', '振密夯实控制'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_jet_grouting_ground',
    signalType: 'standard_work_hint',
    code: 'jet_grouting_ground_alias',
    standardWorkCodes: ['jet_grouting_ground'],
    label: '高压旋喷注浆地基',
    keywords: ['高压旋喷', '旋喷桩', '试喷', '提升旋喷', '桩顶补浆'],
    aliases: ['高压旋喷注浆', '旋喷注浆地基', '提升旋喷施工', '试喷参数确认', '取芯承载力检测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_cement_soil_mixing_pile_ground',
    signalType: 'standard_work_hint',
    code: 'cement_soil_mixing_pile_ground_alias',
    standardWorkCodes: ['cement_soil_mixing_pile_ground'],
    label: '水泥土搅拌桩地基',
    keywords: ['水泥土搅拌桩', '深层搅拌', '喷浆搅拌', '提升复搅', '搅拌桩'],
    aliases: ['水泥土搅拌桩施工', '深层搅拌桩施工', '下沉喷浆搅拌', '提升复搅施工', '搅拌桩强度检测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_cfg_composite_ground',
    signalType: 'standard_work_hint',
    code: 'cfg_composite_ground_alias',
    standardWorkCodes: ['cfg_composite_ground'],
    label: 'CFG复合地基',
    keywords: ['CFG', '水泥粉煤灰碎石桩', 'CFG桩', 'CFG复合地基'],
    aliases: ['CFG桩复合地基', '水泥粉煤灰碎石桩复合地基', 'CFG桩施工', 'CFG桩桩顶处理'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_ground_treatment',
    signalType: 'standard_work_hint',
    code: 'ground_treatment_alias',
    standardWorkCodes: ['ground_treatment'],
    label: '地基处理',
    keywords: ['地基处理', '地基加固', '软基处理', '复合地基处理'],
    aliases: ['地基处理施工', '软土地基处理', '地基加固处理', '复合地基处理'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_foundation_pit_retaining_support',
    signalType: 'standard_work_hint',
    code: 'foundation_pit_retaining_support_alias',
    standardWorkCodes: [
      'foundation_pit_bored_pile_support',
      'foundation_pit_sheet_pile_wall',
      'foundation_pit_secant_pile_wall',
      'foundation_pit_smw_wall',
      'foundation_pit_soil_nail_wall',
      'foundation_pit_diaphragm_wall',
      'foundation_pit_cement_soil_wall',
      'foundation_pit_internal_strut',
      'foundation_pit_anchor_support',
      'foundation_pit_interface_support',
      'foundation_pit_retaining_support',
    ],
    contextKeywordsByStandardWorkCode: {
      foundation_pit_bored_pile_support: ['排桩', '支护桩', '冠梁', '桩间土', '挂网喷护'],
      foundation_pit_sheet_pile_wall: ['板桩', '钢板桩', '锁口', '围檩', '沉桩'],
      foundation_pit_secant_pile_wall: ['咬合桩', '套管钻机', '素桩', '荤桩', '交替施工'],
      foundation_pit_smw_wall: ['SMW', '三轴搅拌桩', 'H型钢', '冷缝', '型钢起拔'],
      foundation_pit_soil_nail_wall: ['土钉墙', '土钉', '喷锚', '挂网', '喷射混凝土'],
      foundation_pit_diaphragm_wall: ['地下连续墙', '地连墙', '成槽', '导墙', '接头管'],
      foundation_pit_cement_soil_wall: ['水泥土挡墙', '搅拌桩', '旋喷桩', '压顶板'],
      foundation_pit_internal_strut: ['内支撑', '钢支撑', '混凝土支撑', '换撑', '轴力'],
      foundation_pit_anchor_support: ['锚杆', '锚索', '腰梁', '张拉', '锁定'],
      foundation_pit_interface_support: ['围护体系对接', '主体结构界面', '支撑拆除条件', '换撑传力'],
      foundation_pit_retaining_support: ['基坑支护', '支护结构', '止水帷幕', '监测移交'],
    },
    label: '基坑支护',
    keywords: ['基坑支护', '支护桩', '止水帷幕', '土钉墙', '锚索', '喷锚', '冠梁', '腰梁', '钢支撑', '地下连续墙', '排桩', '钢板桩', '咬合桩', 'SMW'],
    aliases: ['支护结构', '喷锚支护', '锚杆锚索', '冠梁施工', '止水帷幕施工', '土钉墙施工', '钢支撑安装', '内支撑安装', '地下连续墙施工', '地连墙施工', '排桩支护', '钢板桩支护', '咬合桩施工', 'SMW工法桩', '三轴搅拌桩支护', '锚索张拉'],
    negativeKeywords: ['边坡'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_groundwater_control_dewatering',
    signalType: 'standard_work_hint',
    code: 'groundwater_control_dewatering_alias',
    standardWorkCodes: ['groundwater_control_dewatering'],
    label: '地下水控制降水',
    keywords: ['降水', '井点降水', '深井降水', '地下水控制', '回灌井', '排水沟', '集水井'],
    aliases: ['基坑降水', '井点降水', '深井降水', '降水井施工', '回灌井施工', '试抽水', '连续降水运行监测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_slope_support_reinforcement',
    signalType: 'standard_work_hint',
    code: 'slope_support_reinforcement_alias',
    standardWorkCodes: ['slope_support_reinforcement'],
    label: '边坡支护',
    keywords: ['边坡', '边坡支护', '边坡开挖', '挡土墙', '边坡喷锚', '边坡排水'],
    aliases: ['边坡开挖', '边坡喷锚支护', '挡土墙施工', '边坡支护施工', '边坡排水施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_foundation_support_dewatering',
    signalType: 'standard_work_hint',
    code: 'foundation_support_alias',
    standardWorkCodes: ['deep_foundation_support_dewatering'],
    label: '基坑支护降水',
    keywords: ['基坑支护降水', '深基坑工程', '基坑工程'],
    aliases: ['基坑支护及降水', '深基坑支护降水', '基坑工程施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_precast_concrete_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'precast_concrete_pile_foundation_alias',
    standardWorkCodes: ['precast_concrete_pile_foundation'],
    label: '钢筋混凝土预制桩基础',
    keywords: ['预制桩', '管桩', 'PHC', '静压桩', '沉桩', '接桩'],
    aliases: ['预应力管桩', '静压管桩', '预制桩进场验收', '吊桩喂桩', '沉桩施工', '接桩焊接'],
    negativeKeywords: ['钢管桩', 'H型钢桩', '钢桩', '锚杆静压桩'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_bored_cast_in_place_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'bored_cast_in_place_pile_foundation_alias',
    standardWorkCodes: ['bored_cast_in_place_pile_foundation'],
    label: '泥浆护壁成孔灌注桩基础',
    keywords: ['泥浆护壁', '钻孔灌注桩', '灌注桩', '旋挖桩', '成孔灌注', '水下混凝土'],
    aliases: ['灌注桩成孔', '钻孔灌注桩施工', '旋挖成孔', '泥浆循环系统检查', '一次清孔', '导管安装和二次清孔', '水下混凝土灌注'],
    negativeKeywords: ['沉管灌注桩', '沉管成孔', '沉管施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_dry_bored_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'dry_bored_pile_foundation_alias',
    standardWorkCodes: ['dry_bored_pile_foundation'],
    label: '干作业成孔桩基础',
    keywords: ['干作业成孔', '干成孔桩', '干钻孔桩', '孔底清理'],
    aliases: ['干作业成孔桩施工', '干作业钻孔桩', '孔底清理', '干作业成孔施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_long_spiral_drilled_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'long_spiral_drilled_pile_foundation_alias',
    standardWorkCodes: ['long_spiral_drilled_pile_foundation'],
    label: '长螺旋钻孔压灌桩基础',
    keywords: ['长螺旋', '压灌桩', '泵送混凝土压灌', '后插钢筋笼', '提钻速度'],
    aliases: ['长螺旋钻孔压灌桩', '长螺旋钻机就位', '连续钻进成孔', '泵送混凝土压灌', '后插钢筋笼'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_driven_cast_in_place_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'driven_cast_in_place_pile_foundation_alias',
    standardWorkCodes: ['driven_cast_in_place_pile_foundation'],
    label: '沉管灌注桩基础',
    keywords: ['沉管灌注桩', '沉管成孔', '拔管速度', '试沉管'],
    aliases: ['沉管灌注桩施工', '沉管设备就位', '试沉管和贯入控制', '沉管成孔', '拔管速度控制'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_steel_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'steel_pile_foundation_alias',
    standardWorkCodes: ['steel_pile_foundation'],
    label: '钢桩基础',
    keywords: ['钢桩', '钢管桩', 'H型钢桩', '钢桩吊装', '钢桩沉桩'],
    aliases: ['钢桩基础施工', '钢管桩施工', 'H型钢桩施工', '钢桩吊装喂桩', '钢桩接桩焊接'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_anchor_static_pressure_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'anchor_static_pressure_pile_foundation_alias',
    standardWorkCodes: ['anchor_static_pressure_pile_foundation'],
    label: '锚杆静压桩基础',
    keywords: ['锚杆静压桩', '反力架', '压桩孔位', '终压值', '稳压时间'],
    aliases: ['锚杆静压桩施工', '反力架安装验收', '静压设备就位', '压桩施工', '终压值记录'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_rock_anchor_foundation',
    signalType: 'standard_work_hint',
    code: 'rock_anchor_foundation_alias',
    standardWorkCodes: ['rock_anchor_foundation'],
    label: '岩石锚杆基础',
    keywords: ['岩石锚杆', '岩石锚杆基础', '锚杆基础', '岩石锚杆监测'],
    aliases: ['岩石锚杆基础施工', '岩石锚杆基础测量放线', '岩石锚杆基础支护结构施工', '岩石锚杆基础质量检测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_pile_foundation',
    signalType: 'standard_work_hint',
    code: 'pile_foundation_alias',
    standardWorkCodes: ['pile_foundation'],
    label: '桩基',
    keywords: ['桩基', '试桩', '桩身完整性', '桩基验收', '桩基检测', '静载', '小应变', '超声波检测', '钻芯'],
    aliases: ['桩基施工', '试桩检测', '桩身完整性检测', '桩基验收复核', '桩基检测', '桩基静载试验', '桩基小应变检测', '桩基超声波检测', '桩基钻芯检测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_cushion_blinding',
    signalType: 'standard_work_hint',
    code: 'cushion_alias',
    standardWorkCodes: ['cushion_and_blinding'],
    label: '垫层',
    keywords: ['垫层', '素砼', '素混凝土', '基础垫层', '找平层'],
    aliases: ['混凝土垫层', '素砼垫层', '基础找平层', '垫层浇筑', '垫层施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_shallow_foundation_concrete_structure',
    signalType: 'standard_work_hint',
    code: 'shallow_foundation_concrete_structure_alias',
    standardWorkCodes: ['shallow_foundation_concrete_structure'],
    label: '浅基础混凝土结构',
    keywords: ['独立基础', '条形基础', '筏板基础', '箱型基础', '扩展基础', '基础钢筋', '基础模板', '基础混凝土'],
    aliases: ['独立基础施工', '条形基础施工', '筏板基础施工', '箱型基础施工', '扩展基础施工', '基础钢筋绑扎', '基础模板安装', '基础混凝土浇筑'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_caisson_well_foundation',
    signalType: 'standard_work_hint',
    code: 'caisson_well_foundation_alias',
    standardWorkCodes: ['caisson_well_foundation'],
    label: '沉井沉箱基础',
    keywords: ['沉井', '沉箱', '沉井基础', '沉箱基础', '下沉施工'],
    aliases: ['沉井基础施工', '沉箱基础施工', '沉井下沉施工', '沉箱下沉施工', '沉井封底'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_basement_structure',
    signalType: 'standard_work_hint',
    code: 'basement_structure_alias',
    standardWorkCodes: ['basement_structure'],
    label: '地下室结构',
    keywords: ['地下室结构', '地下结构', '地下室主体', '地下室底板结构', '地下室顶板结构'],
    aliases: ['地下室结构施工', '地下结构施工', '地下室主体结构', '地下室底板结构施工', '地下室顶板结构施工'],
    negativeKeywords: ['地下室防水', '地下室外墙防水', '肥槽回填', '顶板覆土'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_standard_floor_structure_rhythm_itempack',
    signalType: 'standard_work_hint',
    code: 'standard_floor_structure_rhythm_itempack_alias',
    standardWorkCodes: ['BDT-04-01-01'],
    label: 'standard floor structure rhythm itemPack',
    keywords: [
      'BDT-04-01-01',
      'standard floor rhythm',
      'standard floor structure',
      'standard-floor structure',
      'floor cycle',
      'floor_cycle_matrix',
      'building_rhythm_series',
      'cast-in-place standard floor structure',
    ],
    aliases: [
      'BDT-04-01-01 standard floor rhythm',
      'standard floor structure cycle',
      'standard floor itemPack rhythm',
      'building rhythm series standard floor',
      'cast-in-place standard floor structure rhythm',
    ],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-building-fine-detail', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_concrete_short_name',
    signalType: 'standard_work_hint',
    code: 'concrete_alias',
    standardWorkCodes: ['cast_in_place_concrete'],
    label: '混凝土',
    keywords: ['砼', '混凝土', '浇筑', '浇砼', '打灰', '坍落度', '试块留置'],
    aliases: [
      '混凝土',
      '浇筑',
      '砼浇筑',
      '混凝土浇筑',
      '浇砼',
      '打灰',
      '振捣',
      '找平收面',
      '混凝土进场验收',
      '坍落度检查',
      '坍落度检测',
      '混凝土试块留置',
      '标养试块留置',
      '抗渗试块留置',
    ],
    negativeKeywords: ['构造柱浇筑', '圈梁浇筑', '过梁浇筑', '反坎浇筑', '止水反坎', '屋面刚性层', '钢管混凝土', '型钢混凝土'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_formwork_shoring',
    signalType: 'standard_work_hint',
    code: 'formwork_alias',
    standardWorkCodes: ['cast_in_place_formwork'],
    label: '模板',
    keywords: ['支模', '配模', '拆模', '模板', '加固'],
    aliases: ['模板', '模板安装', '支撑体系', '支模', '配模', '模板加固', '拆模', '支撑架'],
    negativeKeywords: ['拆模报告', '拆模强度', '强度报告', '构造柱支模', '圈梁支模', '过梁支模', '反坎支模'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_rebar_binding',
    signalType: 'standard_work_hint',
    code: 'rebar_alias',
    standardWorkCodes: ['cast_in_place_rebar'],
    label: '钢筋绑扎',
    keywords: ['绑筋', '钢筋绑扎', '梁筋', '板筋', '墙柱筋', '钢筋安装', '绑扎', '钢筋复试', '钢筋送检'],
    aliases: ['钢筋', '绑扎', '绑筋', '梁筋', '板筋', '墙筋', '柱筋', '墙柱筋', '钢筋安装', '钢筋绑扎安装', '钢筋原材复试', '钢筋送检', '钢筋取样'],
    negativeKeywords: ['钢管混凝土', '型钢混凝土'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_lightweight_partition_wall',
    signalType: 'standard_work_hint',
    code: 'lightweight_partition_wall_alias',
    standardWorkCodes: ['lightweight_partition_wall'],
    label: '轻质隔墙',
    keywords: ['轻质隔墙', '隔墙板', '龙骨隔墙', '石膏板隔墙', '板材隔墙'],
    aliases: ['轻质隔墙安装', '隔墙板安装', '加气条板安装', '龙骨隔墙安装', '石膏板隔墙安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_masonry_secondary_structure',
    signalType: 'standard_work_hint',
    code: 'masonry_alias',
    standardWorkCodes: ['masonry_infill_wall'],
    label: '砌筑及二次结构',
    keywords: ['砌筑', '砌体', '二构', '二次结构', '构造柱', '圈梁', '过梁', 'ALC', '隔墙板', '植筋', '拉结筋', '反坎'],
    aliases: ['填充墙', '砌块墙', '加气块', '砌体施工', '二构施工', '构造柱圈梁过梁', 'ALC板安装', '砌体植筋', '拉结筋植筋', '构造柱支模', '构造柱浇筑', '反坎浇筑', '止水反坎施工'],
    negativeKeywords: ['检查井砌筑', '雨水口砌筑', '化粪池', '隔油池', '围墙施工', '小区围墙', '轻质隔墙', '隔墙板', '加气条板', '龙骨隔墙', '石膏板隔墙'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_concrete_curing_wait',
    signalType: 'standard_work_hint',
    code: 'concrete_curing_alias',
    standardWorkCodes: ['concrete_curing_wait'],
    label: '混凝土养护等待',
    keywords: ['养护', '拆模强度', '同条件试块', '强度报告', '测温', '试块送检'],
    aliases: [
      '混凝土养护',
      '同条件养护',
      '拆模强度报告',
      '拆模报告',
      '拆模报告复核',
      '大体积测温',
      '强度等待',
      '同条件试块送检',
      '标养试块送检',
      '强度报告复核',
    ],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_rebar_anchor_pull_out_test',
    signalType: 'standard_work_hint',
    code: 'rebar_anchor_pull_out_test_alias',
    standardWorkCodes: ['masonry_infill_wall'],
    label: '植筋拉拔试验',
    keywords: ['植筋拉拔', '拉拔试验', '拉拔检测', '植筋检测', '锚固拉拔', '化学植筋'],
    aliases: ['植筋拉拔试验', '拉拔试验', '植筋拉拔检测', '化学植筋拉拔', '拉结筋拉拔试验', '锚栓拉拔试验', '植筋承载力检测'],
    negativeKeywords: ['保温锚固拉拔', '保温拉拔', '保温板拉拔', '瓷砖拉拔', '饰面砖拉拔', '锚栓固定拉拔'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_pc_component_and_grouting',
    signalType: 'standard_work_hint',
    code: 'pc_component_alias',
    standardWorkCodes: ['pc_component_hoisting', 'pc_grouting_joint'],
    contextKeywordsByStandardWorkCode: {
      pc_component_hoisting: ['吊装', '叠合板', '预制墙板', '预制楼梯', '构件安装', 'PC安装'],
      pc_grouting_joint: ['灌浆', '套筒', '拼缝', '后浇节点', '座浆'],
    },
    label: '装配式构件',
    keywords: ['装配式', 'PC', '预制构件', '叠合板', '套筒灌浆', '构件吊装'],
    aliases: ['PC吊装', '预制构件吊装', '叠合板安装', '预制墙板安装', '套筒灌浆', '拼缝灌浆'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-prefabricated-pc', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_large_span_roof_structure',
    signalType: 'standard_work_hint',
    code: 'large_span_roof_alias',
    standardWorkCodes: ['large_span_roof_structure'],
    label: '大跨度屋盖结构',
    keywords: ['大跨度', '网架', '空间结构', '钢桁架', '屋盖结构'],
    aliases: ['大跨度屋面', '大跨度屋盖', '网架安装', '网架吊装', '空间网架', '钢桁架安装', '屋盖钢结构安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-steel-structure', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_steel_structure',
    signalType: 'standard_work_hint',
    code: 'steel_structure_alias',
    standardWorkCodes: ['steel_fabrication_deepening', 'steel_erection', 'steel_bolting_welding'],
    contextKeywordsByStandardWorkCode: {
      steel_fabrication_deepening: ['深化', '详图', '加工', '下料', '构件加工'],
      steel_erection: ['安装', '吊装', '钢柱', '钢梁', '钢构', '网架', '支撑'],
      steel_bolting_welding: ['高强螺栓', '终拧', '初拧', '焊接', '探伤', '栓钉', '节点'],
    },
    label: '钢结构',
    keywords: ['钢结构', '钢柱', '钢梁', '钢构', '网架', '高强螺栓', '焊接', '探伤', '栓钉'],
    aliases: ['钢结构深化', '钢构件加工', '钢柱安装', '钢梁安装', '钢结构吊装', '高强螺栓终拧', '焊缝探伤'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-steel-structure', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_steel_tube_concrete_structure',
    signalType: 'standard_work_hint',
    code: 'steel_tube_concrete_structure_alias',
    standardWorkCodes: ['steel_tube_concrete_structure'],
    label: '钢管混凝土结构',
    keywords: ['钢管混凝土', '钢管柱', '管内混凝土'],
    aliases: ['钢管混凝土柱安装', '钢管混凝土结构施工', '钢管内混凝土浇筑'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-steel-structure', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_steel_reinforced_concrete_structure',
    signalType: 'standard_work_hint',
    code: 'steel_reinforced_concrete_structure_alias',
    standardWorkCodes: ['steel_reinforced_concrete_structure'],
    label: '型钢混凝土结构',
    keywords: ['型钢混凝土', '型钢柱', '型钢梁'],
    aliases: ['型钢混凝土安装', '型钢混凝土结构施工', '型钢柱安装', '型钢梁安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-steel-structure', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_timber_structure',
    signalType: 'standard_work_hint',
    code: 'timber_structure_alias',
    standardWorkCodes: ['timber_structure'],
    label: '木结构',
    keywords: ['木结构', '胶合木', '木屋架', '木梁', '木柱'],
    aliases: ['木结构安装', '胶合木安装', '木屋架安装', '木梁安装', '木柱安装', '木结构防腐防火'],
    negativeKeywords: ['木工支模', '木工吊顶', '木门安装', '木地板'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-building-main', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_steel_envelope_roof_wall',
    signalType: 'standard_work_hint',
    code: 'steel_envelope_alias',
    standardWorkCodes: ['steel_envelope_roof_wall'],
    label: '钢围护屋面墙面',
    keywords: ['金属屋面', '压型钢板', '围护墙板', '彩钢板', '檩条'],
    aliases: ['金属屋面板安装', '压型钢板屋面', '钢结构屋面板', '围护墙板安装', '彩钢板安装', '檩条安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-steel-structure', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_steel_fireproof_coating',
    signalType: 'standard_work_hint',
    code: 'steel_fireproof_coating_alias',
    standardWorkCodes: ['steel_erection', 'steel_bolting_welding'],
    contextKeywordsByStandardWorkCode: {
      steel_erection: ['钢结构', '钢构', '防火', '涂料', '喷涂', '涂装', '耐火'],
      steel_bolting_welding: ['节点', '螺栓', '焊接', '连接', '包覆'],
    },
    label: '钢结构防火涂料',
    keywords: ['防火涂料', '防火涂装', '耐火涂料', '厚涂型', '薄涂型', '防火漆'],
    aliases: ['钢结构防火涂料施工', '防火涂料喷涂', '钢结构防火涂装', '钢构防火涂料', '耐火极限涂装', '防火涂料分遍施工', '防火涂层厚度检测', '防火涂料粘结强度检测'],
    negativeKeywords: ['木结构防火', '木结构防腐防火', '防火门', '防火卷帘', '防火封堵'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-steel-structure', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_plastering_leveling',
    signalType: 'standard_work_hint',
    code: 'plastering_alias',
    standardWorkCodes: ['plastering_wall_ceiling'],
    label: '抹灰找平',
    keywords: ['抹灰', '粉刷', '找平', '批荡', '冲筋', '灰饼'],
    aliases: ['墙面抹灰', '顶棚抹灰', '砂浆找平', '基层找平', '挂网冲筋', '灰饼护角'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_ceiling_finish',
    signalType: 'standard_work_hint',
    code: 'ceiling_finish_alias',
    standardWorkCodes: ['ceiling_system_finish', 'interior_unit_finish', 'interior_public_finish'],
    contextKeywordsByStandardWorkCode: {
      ceiling_system_finish: ['吊顶', '天花', '顶棚', '龙骨', '石膏板', '矿棉板', '铝扣板', '格栅'],
      interior_unit_finish: ['户内', '套内', '房间', '厨卫', '住宅', '阳台'],
      interior_public_finish: ['公区', '走廊', '大堂', '电梯厅', '楼梯间', '商业', '学校', '医院'],
    },
    label: '吊顶天花',
    keywords: ['吊顶', '天花', '顶棚', '龙骨', '石膏板', '矿棉板', '铝扣板', '格栅', '检修口'],
    aliases: ['吊顶龙骨', '吊顶封板', '石膏板吊顶', '矿棉板吊顶', '铝扣板吊顶', '格栅吊顶', '天花安装', '顶棚施工', '检修口安装', '吊顶隐蔽验收'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_tile_stone_finish',
    signalType: 'standard_work_hint',
    code: 'tile_stone_finish_alias',
    standardWorkCodes: ['tile_facing_finish', 'wall_panel_finish', 'interior_public_finish', 'interior_unit_finish'],
    contextKeywordsByStandardWorkCode: {
      tile_facing_finish: ['瓷砖', '墙砖', '地砖', '镶贴', '勾缝', '美缝', '贴砖'],
      wall_panel_finish: ['石材', '石板', '饰面板', '木板', '金属板'],
      interior_unit_finish: ['户内', '厨卫', '阳台', '房间', '套内', '住宅'],
      interior_public_finish: ['公区', '走廊', '大堂', '电梯厅', '商业', '学校', '医院'],
    },
    label: '墙地砖石材铺贴',
    keywords: ['瓷砖', '墙砖', '地砖', '石材', '镶贴', '勾缝', '美缝', '排版'],
    aliases: ['墙砖铺贴', '地砖铺贴', '瓷砖铺贴', '石材铺贴', '墙地砖铺贴', '砖缝勾缝', '瓷砖美缝', '石材排版', '湿贴石材'],
    negativeKeywords: ['保温板铺贴', '防水卷材铺贴', '卷材铺贴'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_putty_coating_paint',
    signalType: 'standard_work_hint',
    code: 'putty_coating_alias',
    standardWorkCodes: ['coating_paint_finish', 'interior_unit_finish', 'interior_public_finish', 'exterior_insulation_finish', 'plastering_wall_ceiling'],
    contextKeywordsByStandardWorkCode: {
      coating_paint_finish: ['腻子', '涂饰', '涂料', '乳胶漆', '内墙漆', '油漆', '喷漆', '滚涂', '打磨'],
      interior_unit_finish: ['户内', '套内', '房间', '卧室', '客厅', '住宅', '内墙'],
      interior_public_finish: ['公区', '走廊', '大堂', '电梯厅', '楼梯间'],
      exterior_insulation_finish: ['外墙', '外立面', '真石漆', '质感漆', '仿石漆', '保温'],
      plastering_wall_ceiling: ['基层', '找平', '砂浆', '抹灰', '空鼓', '裂缝'],
    },
    label: '腻子涂饰油漆',
    keywords: ['腻子', '涂饰', '涂料', '乳胶漆', '内墙漆', '油漆', '喷漆', '滚涂', '大白', '打磨'],
    aliases: ['刮腻子', '批腻子', '腻子打磨', '乳胶漆施工', '内墙漆施工', '涂料施工', '油漆施工', '喷涂施工', '滚涂施工', '外墙涂料', '真石漆施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'china-waterproof-insulation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_wallpaper_soft_finish',
    signalType: 'standard_work_hint',
    code: 'wallpaper_soft_finish_alias',
    standardWorkCodes: ['wallpaper_soft_finish'],
    label: '裱糊软包',
    keywords: ['裱糊', '软包', '硬包', '壁纸', '壁布'],
    aliases: ['壁纸铺贴', '壁布铺贴', '软包安装', '硬包安装', '裱糊施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_floor_screed_finish',
    signalType: 'standard_work_hint',
    code: 'floor_screed_finish_alias',
    standardWorkCodes: ['interior_unit_finish', 'interior_public_finish', 'outdoor_road_hardscape', 'floor_finish_system'],
    contextKeywordsByStandardWorkCode: {
      interior_public_finish: ['车库', '公区', '大堂', '走廊', '商业', '耐磨', '环氧', '交通标识'],
      interior_unit_finish: ['户内', '套内', '房间', '住宅', '厨卫'],
      outdoor_road_hardscape: ['室外', '园路', '道路', '广场', '铺装', '透水砖'],
      floor_finish_system: ['建筑地面', '地面', '地坪', '找平', '面层', '自流平', '水泥砂浆', '地砖', '木地板'],
    },
    label: '地坪地面找平',
    keywords: ['地坪', '自流平', '地面找平', '耐磨地坪', '环氧地坪', '水泥砂浆地面', '分仓缝', '地坪漆', '车位划线', '交通标识'],
    aliases: ['自流平施工', '地坪施工', '耐磨地坪施工', '环氧地坪施工', '地面找平层', '水泥砂浆地面', '车库地坪', '地坪分仓缝', '固化地坪', '地下室地坪漆', '车位划线', '交通标识施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_sprinkler_pipe',
    signalType: 'standard_work_hint',
    code: 'sprinkler_alias',
    standardWorkCodes: ['plumbing_fire_hydrant_sprinkler'],
    label: '消防喷淋消火栓管网',
    keywords: ['喷淋', '喷淋管', '消火栓', '消防管', '喷头', '阀组', '报警阀', '消防水泵'],
    aliases: ['喷淋管网', '消火栓管网', '消防管道', '喷头安装', '消火栓箱安装', '报警阀组安装', '阀组安装', '消防水泵安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-cecs-fire-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_cross_trade_fire_stop',
    signalType: 'standard_work_hint',
    code: 'fire_stop_seal_alias',
    standardWorkCodes: ['mep_plumbing_fire_pipe', 'plumbing_fire_hydrant_sprinkler'],
    contextKeywordsByStandardWorkCode: {
      mep_plumbing_fire_pipe: ['套管', '预留', '管道', '洞口', '封堵', '防火', '穿墙', '穿楼板', '管井'],
      plumbing_fire_hydrant_sprinkler: ['消防', '喷淋', '消火栓', '防火分区', '防火封堵'],
    },
    label: '防火封堵',
    keywords: ['防火封堵', '封堵验收', '穿墙封堵', '穿楼板封堵', '管井封堵', '层间封堵', '桥架封堵', '风管封堵', '防火堵料', '防火包'],
    aliases: ['防火封堵施工', '穿墙套管防火封堵', '穿楼板防火封堵', '桥架穿墙防火封堵', '风管穿墙防火封堵', '管井楼板封堵', '电井层间封堵', '幕墙层间防火封堵', '防火封堵隐蔽验收', '防火封堵影像签认'],
    negativeKeywords: ['伸缩节和防火封堵', '防雷连接和防火封堵', '防火门', '防火卷帘', '防火涂料', '防火隔离带', '屏蔽封堵', '气密封堵', '临时封堵', '系统隔离封堵'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-cecs-fire-system', 'china-mep-coordination', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_indoor_water_supply',
    signalType: 'standard_work_hint',
    code: 'indoor_water_supply_alias',
    standardWorkCodes: ['plumbing_indoor_water_supply_pipe'],
    label: '室内给水系统',
    keywords: ['给水管', '给水立管', '给水支管', '给水管道'],
    aliases: ['给水立管安装', '给水支管安装', '给水管道安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_indoor_water_supply_legacy_compat',
    signalType: 'standard_work_hint',
    code: 'indoor_water_supply_legacy_compat_alias',
    standardWorkCodes: ['plumbing_indoor_supply_drainage'],
    label: '室内给水综合兼容',
    keywords: ['室内给水综合', '给水综合包', '给水系统综合'],
    aliases: ['室内给水综合', '给水综合包', '给水系统综合'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_indoor_water_supply_equipment',
    signalType: 'standard_work_hint',
    code: 'indoor_water_supply_equipment_alias',
    standardWorkCodes: ['plumbing_indoor_water_supply_equipment'],
    label: '室内给水设备',
    keywords: ['给水设备', '生活水泵', '水表', '水箱', '泵组'],
    aliases: ['生活水泵安装', '水表安装', '给水设备安装', '水箱安装', '泵组安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_plumbing_pipe_anticorrosion',
    signalType: 'standard_work_hint',
    code: 'plumbing_pipe_anticorrosion_alias',
    standardWorkCodes: ['plumbing_pipe_anticorrosion'],
    label: '管道防腐',
    keywords: ['管道防腐', '防腐', '除锈', '防腐涂装'],
    aliases: ['管道防腐施工', '管道除锈防腐', '防腐涂装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_plumbing_pipe_insulation',
    signalType: 'standard_work_hint',
    code: 'plumbing_pipe_insulation_alias',
    standardWorkCodes: ['plumbing_pipe_insulation'],
    label: '管道绝热保温',
    keywords: ['管道绝热', '管道保温', '保温层', '绝热'],
    aliases: ['管道保温施工', '管道绝热施工', '保温层施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_plumbing_pipe_flushing',
    signalType: 'standard_work_hint',
    code: 'plumbing_pipe_flushing_alias',
    standardWorkCodes: ['plumbing_pipe_flushing'],
    label: '管道冲洗',
    keywords: ['给水冲洗', '管道冲洗', '冲洗'],
    aliases: ['给水冲洗', '管道冲洗', '管网冲洗'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_plumbing_water_disinfection',
    signalType: 'standard_work_hint',
    code: 'plumbing_water_disinfection_alias',
    standardWorkCodes: ['plumbing_water_disinfection'],
    label: '给水消毒',
    keywords: ['给水消毒', '水质检测', '取样', '消毒'],
    aliases: ['给水消毒', '管道消毒', '水质取样', '水质检测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_plumbing_water_test_commissioning',
    signalType: 'standard_work_hint',
    code: 'plumbing_water_test_commissioning_alias',
    standardWorkCodes: ['plumbing_water_test_commissioning'],
    label: '给水试验调试',
    keywords: ['给水试验', '压力试验', '试验调试', '给水调试'],
    aliases: ['给水压力试验', '给水试验调试', '给水系统调试', '管道压力试验'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_indoor_drainage',
    signalType: 'standard_work_hint',
    code: 'indoor_drainage_alias',
    standardWorkCodes: ['plumbing_indoor_drainage'],
    label: '室内排水系统',
    keywords: ['排水', '排水管', '排水支管', '雨水管', '闭水', '通球'],
    aliases: ['排水支管安装', '排水立管安装', '排水管道安装', '雨水管安装', '排水闭水试验', '通球试验'],
    negativeKeywords: ['卫生间闭水', '厨卫闭水', '厨房闭水', '阳台闭水'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hot_water_supply',
    signalType: 'standard_work_hint',
    code: 'hot_water_supply_alias',
    standardWorkCodes: ['plumbing_hot_water_system'],
    label: '室内热水供应系统',
    keywords: ['热水供应', '热水管', '热水设备', '热水循环'],
    aliases: ['热水管安装', '热水供应系统', '热水设备安装', '热水循环管安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_electrical_grounding_lightning',
    signalType: 'standard_work_hint',
    code: 'electrical_grounding_lightning_alias',
    standardWorkCodes: ['electrical_grounding_lightning'],
    label: '防雷接地等电位',
    keywords: ['防雷', '接地', '等电位', '避雷', '接地扁钢', '接地干线', '接地跨接'],
    aliases: ['防雷接地施工', '等电位连接', '接地扁钢安装', '接地干线安装', '桥架接地跨接', '避雷带安装', '防雷检测配合'],
    negativeKeywords: ['防雷检测报告'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_electrical_outdoor_distribution',
    signalType: 'standard_work_hint',
    code: 'electrical_outdoor_distribution_alias',
    standardWorkCodes: ['electrical_outdoor_distribution'],
    label: '室外电气与照明',
    keywords: ['室外电气', '路灯', '庭院灯', '景观照明', '室外照明', '外线电缆', '室外配电'],
    aliases: ['室外路灯安装', '庭院灯安装', '景观照明施工', '室外照明施工', '室外配电箱安装', '室外电缆敷设'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_electrical_power_distribution_room',
    signalType: 'standard_work_hint',
    code: 'electrical_power_distribution_room_alias',
    standardWorkCodes: ['electrical_power_distribution_room'],
    label: '变配电室与供电干线',
    keywords: ['变配电', '配电室', '变压器', '高低压柜'],
    aliases: ['变压器安装', '高低压柜安装', '配电室设备安装', '变配电室设备安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_electrical_feeder_busway',
    signalType: 'standard_work_hint',
    code: 'electrical_feeder_busway_alias',
    standardWorkCodes: ['electrical_feeder_busway'],
    label: '供电干线与母线槽',
    keywords: ['供电干线', '母线槽', '电缆干线', '馈线'],
    aliases: ['母线槽安装', '供电干线敷设', '电缆干线敷设', '馈线电缆敷设'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_electrical_standby_power_ups',
    signalType: 'standard_work_hint',
    code: 'electrical_standby_power_ups_alias',
    standardWorkCodes: ['electrical_standby_power_ups'],
    label: '备用和不间断电源',
    keywords: ['UPS', 'EPS', '柴油发电机', '备用电源', '不间断电源', '应急电源'],
    aliases: ['UPS安装', 'EPS安装', '柴油发电机安装', '备用电源系统', '应急电源装置安装', '不间断电源装置安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_electrical_lighting_terminal',
    signalType: 'standard_work_hint',
    code: 'electrical_lighting_terminal_alias',
    standardWorkCodes: ['electrical_lighting_terminal'],
    label: '照明开关插座终端',
    keywords: ['照明', '灯具', '开关', '插座', '底盒', '线盒', '支盒子', '接线盒'],
    aliases: ['灯具安装', '开关插座安装', '底盒安装', '线盒预埋', '支盒子', '接线盒安装', '照明通电调试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_cable_tray',
    signalType: 'standard_work_hint',
    code: 'cable_tray_alias',
    standardWorkCodes: ['electrical_distribution_equipment'],
    label: '桥架',
    keywords: ['桥架', '线槽', '槽盒', '托盘', '梯架', '穿线', '配电箱', '配电柜', '电缆', '电缆头'],
    aliases: ['梯架', '托盘', '槽盒', '线槽', '电缆桥架', '桥架敷设', '桥架安装', '管内穿线', '穿线施工', '配电箱安装', '配电柜安装', '电缆敷设', '电缆头制作'],
    negativeKeywords: ['防雷检测'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_supply_air_system',
    signalType: 'standard_work_hint',
    code: 'hvac_supply_air_system_alias',
    standardWorkCodes: ['hvac_supply_air_system'],
    label: '送风系统',
    keywords: ['送风', '送风管', '送风口', '新风', '空气处理机组', '风机安装'],
    aliases: ['送风系统安装', '送风风管安装', '送风口安装', '风口安装', '新风系统安装', '空气处理机组安装', '送风机安装'],
    negativeKeywords: ['正压送风', '防排烟'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_exhaust_air_system',
    signalType: 'standard_work_hint',
    code: 'hvac_exhaust_air_system_alias',
    standardWorkCodes: ['hvac_exhaust_air_system'],
    label: '排风系统',
    keywords: ['排风', '排风管', '排风口', '吸风罩', '厨房排风', '卫生间排风'],
    aliases: ['排风系统安装', '排风风管安装', '排风口安装', '吸风罩安装', '厨房排风系统', '卫生间排风系统'],
    negativeKeywords: ['防排烟', '排烟', '除尘', '排尘'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_air_duct',
    signalType: 'standard_work_hint',
    code: 'air_duct_alias',
    standardWorkCodes: ['hvac_air_distribution'],
    label: '风管',
    keywords: ['风管', '风道', '送排风', '空调风', '风阀', '漏风量', '严密性'],
    aliases: ['通风风管', '风管安装', '送排风管', '漏风量测试', '严密性测试', '风管严密性', '风阀安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_smoke_control',
    signalType: 'standard_work_hint',
    code: 'hvac_smoke_control_alias',
    standardWorkCodes: ['hvac_smoke_control'],
    label: '防排烟系统',
    keywords: ['防排烟', '排烟风机', '正压送风', '防火阀', '排烟阀'],
    aliases: ['防排烟风管', '排烟风机安装', '正压送风系统', '防火阀安装', '排烟阀安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'china-cecs-fire-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_dust_exhaust',
    signalType: 'standard_work_hint',
    code: 'hvac_dust_exhaust_alias',
    standardWorkCodes: ['hvac_dust_exhaust'],
    label: '除尘与排风',
    keywords: ['除尘', '排尘', '防爆排风', '工业排风'],
    aliases: ['除尘风管安装', '排尘系统安装', '防爆排风系统', '除尘设备安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_vacuum_cleaning_system',
    signalType: 'standard_work_hint',
    code: 'hvac_vacuum_cleaning_system_alias',
    standardWorkCodes: ['hvac_vacuum_cleaning_system'],
    label: '真空吸尘系统',
    keywords: ['真空吸尘', '中央吸尘', '吸尘系统', '快速接口'],
    aliases: ['真空吸尘系统', '中央吸尘系统', '真空吸尘管道安装', '吸尘快速接口安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_comfort_air',
    signalType: 'standard_work_hint',
    code: 'hvac_comfort_air_alias',
    standardWorkCodes: ['hvac_comfort_air'],
    label: '舒适性空调',
    keywords: ['风机盘管', '空调机组', '新风机组', '冷凝水管'],
    aliases: ['风机盘管安装', '空调机组安装', '新风机组安装', '冷凝水管安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_vrf_multisplit_system',
    signalType: 'standard_work_hint',
    code: 'hvac_vrf_multisplit_system_alias',
    standardWorkCodes: ['hvac_vrf_multisplit_system'],
    label: '多联机 VRF 空调系统',
    keywords: ['多联机', 'VRV', 'VRF', '制冷剂管', '室外机组', '室内机组'],
    aliases: ['多联机安装', 'VRF安装', 'VRV安装', '制冷剂管安装', '多联机系统调试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_precision_cleanroom',
    signalType: 'standard_work_hint',
    code: 'hvac_precision_cleanroom_alias',
    standardWorkCodes: ['hvac_constant_humidity', 'hvac_cleanroom_system'],
    contextKeywordsByStandardWorkCode: {
      hvac_constant_humidity: ['恒温恒湿', '精密空调', '数据机房', '温湿度'],
      hvac_cleanroom_system: ['洁净', '净化', '高效过滤器', '手术室', '实验室'],
    },
    label: '恒温恒湿与净化空调',
    keywords: ['恒温恒湿', '精密空调', '洁净空调', '净化空调', '高效过滤器', '洁净室'],
    aliases: ['恒温恒湿空调安装', '精密空调安装', '洁净空调系统', '净化空调系统', '高效过滤器安装', '洁净度测试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_civil_defense_and_water',
    signalType: 'standard_work_hint',
    code: 'hvac_civil_defense_water_alias',
    standardWorkCodes: ['hvac_civil_defense_ventilation'],
    label: '人防通风',
    keywords: ['人防通风', '防护密闭', '战时通风', '防爆阀'],
    aliases: ['人防通风安装', '防护密闭阀安装', '战时通风系统', '防爆阀安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_condensate_system',
    signalType: 'standard_work_hint',
    code: 'hvac_condensate_system_alias',
    standardWorkCodes: ['hvac_condensate_system'],
    label: '冷凝水系统',
    keywords: ['冷凝水', '冷凝水管', '排水坡度', '凝结水'],
    aliases: ['冷凝水管安装', '冷凝水系统安装', '冷凝水坡度复核', '冷凝水系统调试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_water_equipment_system',
    signalType: 'standard_work_hint',
    code: 'hvac_water_equipment_system_alias',
    standardWorkCodes: ['hvac_water_equipment_system'],
    label: '空调冷热水系统',
    keywords: ['冷冻水', '冷热水', '空调水', '空调水系统', '空调水泵'],
    aliases: ['冷冻水管安装', '冷热水管安装', '空调水系统调试', '空调水泵安装', '空调冷热水系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_cooling_water_system',
    signalType: 'standard_work_hint',
    code: 'hvac_cooling_water_system_alias',
    standardWorkCodes: ['hvac_cooling_water_system'],
    label: '冷却水系统',
    keywords: ['冷却水', '冷却塔', '冷却水泵'],
    aliases: ['冷却塔安装', '冷却水管安装', '冷却水系统调试', '冷却水泵安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_ground_source_heat_pump_exchange',
    signalType: 'standard_work_hint',
    code: 'hvac_ground_source_heat_pump_exchange_alias',
    standardWorkCodes: ['hvac_ground_source_heat_pump_exchange'],
    label: '土壤源热泵换热',
    keywords: ['土壤源热泵', '地源热泵', '地埋管', '换热井', '地埋换热'],
    aliases: ['土壤源热泵系统', '地源热泵系统', '地埋管施工', '换热井施工', '地埋管换热系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_water_source_heat_pump_exchange',
    signalType: 'standard_work_hint',
    code: 'hvac_water_source_heat_pump_exchange_alias',
    standardWorkCodes: ['hvac_water_source_heat_pump_exchange'],
    label: '水源热泵换热',
    keywords: ['水源热泵', '地表水源', '取水井', '回灌井', '除垢设备'],
    aliases: ['水源热泵系统', '地表水源换热系统', '取水井施工', '回灌井施工', '水源热泵换热系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_heat_pump_exchange_system',
    signalType: 'standard_work_hint',
    code: 'hvac_heat_pump_exchange_system_alias',
    standardWorkCodes: ['hvac_heat_pump_exchange_system'],
    label: '热泵换热系统',
    keywords: ['热泵换热', '换热器', '换热系统'],
    aliases: ['热泵换热系统', '热泵换热器安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_thermal_storage_system',
    signalType: 'standard_work_hint',
    code: 'hvac_thermal_storage_system_alias',
    standardWorkCodes: ['hvac_thermal_storage_system'],
    label: '蓄能空调系统',
    keywords: ['蓄能', '冰蓄冷', '水蓄冷', '蓄冷罐', '蓄能水箱'],
    aliases: ['蓄能系统安装', '冰蓄冷系统', '水蓄冷系统', '蓄冷罐安装', '蓄能水箱安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_solar_heating_air_system',
    signalType: 'standard_work_hint',
    code: 'hvac_solar_heating_air_system_alias',
    standardWorkCodes: ['hvac_solar_heating_air_system'],
    label: '太阳能供暖空调',
    keywords: ['太阳能供暖', '太阳能空调', '太阳能集热', '集热器', '储热水箱'],
    aliases: ['太阳能空调系统', '太阳能集热器安装', '太阳能供暖系统', '太阳能储热水箱安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_energy_storage_solar_system',
    signalType: 'standard_work_hint',
    code: 'hvac_energy_storage_solar_system_alias',
    standardWorkCodes: ['hvac_energy_storage_solar_system'],
    label: '蓄能与太阳能空调',
    keywords: ['蓄能空调', '太阳能暖通', '可再生能源空调'],
    aliases: ['蓄能与太阳能空调系统', '可再生能源空调系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_compression_chiller_equipment',
    signalType: 'standard_work_hint',
    code: 'hvac_compression_chiller_equipment_alias',
    standardWorkCodes: ['hvac_compression_chiller_equipment'],
    label: '压缩式制冷设备',
    keywords: ['压缩式制冷', '冷水机组', '制冷机组', '螺杆机组', '离心机组'],
    aliases: ['压缩式制冷设备安装', '冷水机组安装', '制冷机组安装', '螺杆冷水机组安装', '离心冷水机组安装'],
    negativeKeywords: ['吸收式', '溴化锂'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_absorption_refrigeration_equipment',
    signalType: 'standard_work_hint',
    code: 'hvac_absorption_refrigeration_equipment_alias',
    standardWorkCodes: ['hvac_absorption_refrigeration_equipment'],
    label: '吸收式制冷设备',
    keywords: ['吸收式制冷', '溴化锂', '吸收式冷水机组', '真空试验', '蒸汽管道'],
    aliases: ['吸收式制冷设备安装', '溴化锂机组安装', '吸收式冷水机组安装', '溴化锂吸收式机组'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_chiller_absorption_equipment',
    signalType: 'standard_work_hint',
    code: 'hvac_chiller_absorption_equipment_alias',
    standardWorkCodes: ['hvac_chiller_absorption_equipment'],
    label: '制冷机组设备',
    keywords: ['制冷设备', '制冷系统设备'],
    aliases: ['制冷系统设备安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_hvac_automation_control',
    signalType: 'standard_work_hint',
    code: 'hvac_automation_control_alias',
    standardWorkCodes: ['hvac_automation_control'],
    label: '暖通自控',
    keywords: ['空调自控', '暖通自控', 'DDC', '楼控点位', '阀门执行器', '传感器'],
    aliases: ['空调自控系统', '暖通DDC安装', '楼控点位接线', '阀门执行器安装', '温湿度传感器安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-hvac-system', 'china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_information_access_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_information_access_system_alias',
    standardWorkCodes: ['intelligent_information_access_system'],
    label: '信息接入系统',
    keywords: ['信息接入', '运营商接入', '通信接入', '接入机房', '入户通信'],
    aliases: ['信息接入系统', '运营商接入', '通信接入系统', '接入机房检查', '信息接入场地检查'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_mobile_signal_coverage',
    signalType: 'standard_work_hint',
    code: 'intelligent_mobile_signal_coverage_alias',
    standardWorkCodes: ['intelligent_mobile_signal_coverage'],
    label: '移动通信室内覆盖',
    keywords: ['移动通信', '室分', '无线覆盖', '室内信号', '分布式天线'],
    aliases: ['移动通信室分', '无线覆盖施工', '室内信号覆盖', '室内分布系统', '分布式天线安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_satellite_communication_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_satellite_communication_system_alias',
    standardWorkCodes: ['intelligent_satellite_communication_system'],
    label: '卫星通信系统',
    keywords: ['卫星通信', '卫星天线', '卫星接收', '卫星电视接收'],
    aliases: ['卫星通信系统', '卫星天线安装', '卫星接收系统', '卫星电视接收系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_telecom_access_coverage',
    signalType: 'standard_work_hint',
    code: 'intelligent_telecom_access_coverage_alias',
    standardWorkCodes: ['intelligent_telecom_access_coverage'],
    label: '运营商接入与移动覆盖',
    keywords: ['通信接入覆盖', '运营商覆盖'],
    aliases: ['运营商接入与移动覆盖', '通信接入覆盖系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_telephone_exchange',
    signalType: 'standard_work_hint',
    code: 'intelligent_telephone_exchange_alias',
    standardWorkCodes: ['intelligent_telephone_exchange'],
    label: '电话交换系统',
    keywords: ['电话交换', '语音交换', '程控交换'],
    aliases: ['电话交换系统', '电话交换设备安装', '语音交换系统', '程控交换机安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_network_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_network_system_alias',
    standardWorkCodes: ['intelligent_network_system'],
    label: '信息网络系统',
    keywords: ['信息网络', '网络设备', '交换机', '路由器', '无线AP'],
    aliases: ['信息网络系统', '网络设备安装', '交换机安装', '路由器安装', '无线AP安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_network_ap_terminal',
    signalType: 'standard_work_hint',
    code: 'intelligent_network_ap_terminal_alias',
    standardWorkCodes: ['intelligent_network_system', 'intelligent_structured_cabling'],
    contextKeywordsByStandardWorkCode: {
      intelligent_network_system: ['无线AP', 'AP安装', '网络设备'],
      intelligent_structured_cabling: ['点位', '网线', '面板', '模块'],
    },
    label: '无线AP与网络点位',
    keywords: ['无线AP', 'AP安装'],
    aliases: ['无线AP安装', 'AP安装', '无线AP点位'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_communication_media',
    signalType: 'standard_work_hint',
    code: 'intelligent_communication_media_alias',
    standardWorkCodes: ['intelligent_communication_media'],
    label: '有线电视与卫星接收系统',
    keywords: ['有线电视', '卫星电视'],
    aliases: ['有线电视系统', '有线电视安装', '卫星电视接收系统', '卫星电视安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_public_broadcast_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_public_broadcast_system_alias',
    standardWorkCodes: ['intelligent_public_broadcast_system'],
    label: '公共广播系统',
    keywords: ['广播', '公共广播', '应急广播'],
    aliases: ['广播系统安装', '公共广播系统安装', '应急广播系统安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_conference_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_conference_system_alias',
    standardWorkCodes: ['intelligent_conference_system'],
    label: 'ϵͳ',
    keywords: ['ϵͳ', '扩声系统', 'Ƶ'],
    aliases: ['ϵͳװ', '扩声系统安装', 'Ƶϵͳװ'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_information_display_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_information_display_system_alias',
    standardWorkCodes: ['intelligent_information_display_system'],
    label: '信息导引发布系统',
    keywords: ['信息发布', '信息导引', '发布屏', '显示屏'],
    aliases: ['信息发布屏安装', '信息导引系统安装', '信息发布系统安装', '显示屏安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_clock_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_clock_system_alias',
    standardWorkCodes: ['intelligent_clock_system'],
    label: '时钟系统',
    keywords: ['时钟系统', '母钟', '子钟'],
    aliases: ['时钟系统安装', '母钟安装', '子钟安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_ba_control',
    signalType: 'standard_work_hint',
    code: 'intelligent_ba_control_alias',
    standardWorkCodes: ['intelligent_ba_control'],
    label: '建筑设备监控 BA',
    keywords: ['BA', '楼宇自控', '建筑设备监控', '楼控', 'DDC', '执行器'],
    aliases: ['BA系统安装', '楼宇自控系统', '建筑设备监控系统', '楼控DDC安装', '执行器调试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_fire_alarm',
    signalType: 'standard_work_hint',
    code: 'intelligent_fire_alarm_alias',
    standardWorkCodes: ['intelligent_fire_alarm'],
    label: '火灾自动报警',
    keywords: ['火灾报警', '消防报警', '烟感', '温感', '手报', '声光报警', '报警主机'],
    aliases: ['火灾报警设备安装', '消防报警穿线', '烟感探测器安装', '手报安装', '声光报警器安装', '报警主机安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'china-cecs-fire-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_security_technical_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_security_technical_system_alias',
    standardWorkCodes: ['intelligent_security_technical_system'],
    label: '安全技术防范系统',
    keywords: ['安防', '监控', '摄像机', '门禁', '读卡器', '巡更', '入侵报警'],
    aliases: ['摄像机安装', '监控摄像机安装', '门禁读卡器安装', '安防监控系统', '巡更点安装', '入侵报警系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_emergency_response_system',
    signalType: 'standard_work_hint',
    code: 'intelligent_emergency_response_system_alias',
    standardWorkCodes: ['intelligent_emergency_response_system'],
    label: '应急响应系统',
    keywords: ['应急响应', '应急系统', '应急终端', '应急联动', '应急平台'],
    aliases: ['应急响应系统', '应急终端安装', '应急联动系统', '应急平台调试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_security_emergency',
    signalType: 'standard_work_hint',
    code: 'intelligent_security_emergency_alias',
    standardWorkCodes: ['intelligent_security_emergency'],
    label: '安防与应急响应',
    keywords: ['安防应急', '安全应急'],
    aliases: ['安防与应急响应系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_data_center_room',
    signalType: 'standard_work_hint',
    code: 'intelligent_data_center_room_alias',
    standardWorkCodes: [
      'intelligent_data_center_power',
      'intelligent_data_center_grounding',
      'intelligent_data_center_precision_air',
      'intelligent_data_center_plumbing',
      'intelligent_data_center_cabling',
      'intelligent_data_center_security_monitoring',
      'intelligent_data_center_fire_suppression',
      'intelligent_data_center_interior_fitout',
      'intelligent_data_center_shielding',
      'intelligent_data_center_commissioning',
      'intelligent_data_center_trial_operation',
      'intelligent_data_center_room',
    ],
    contextKeywordsByStandardWorkCode: {
      intelligent_data_center_power: ['UPS', '供配电', '配电', '不间断电源', '电源', '负载测试'],
      intelligent_data_center_grounding: ['防雷', '接地', '等电位', '浪涌', '接地电阻'],
      intelligent_data_center_precision_air: ['精密空调', '新风', '温湿度', '冷通道', '热通道'],
      intelligent_data_center_plumbing: ['给水', '排水', '冷凝水', '漏水检测', '加湿'],
      intelligent_data_center_cabling: ['综合布线', '网线', '光纤', '配线架', '机柜跳线'],
      intelligent_data_center_security_monitoring: ['环境监控', '门禁', '视频监控', '安防', '监控平台'],
      intelligent_data_center_fire_suppression: ['消防', '气体灭火', '火灾报警', '极早期', '联动'],
      intelligent_data_center_interior_fitout: ['机房装修', '防静电地板', '微模块', '机柜', '冷通道'],
      intelligent_data_center_shielding: ['电磁屏蔽', '屏蔽门', '屏蔽检测', '屏蔽室'],
      intelligent_data_center_commissioning: ['系统调试', '联调', '综合测试', '负载测试', '联动测试'],
      intelligent_data_center_trial_operation: ['试运行', '稳定性', '运行记录', '72小时', '168小时'],
      intelligent_data_center_room: ['机房', '数据中心', '微模块', '机柜', '冷通道'],
    },
    label: '数据中心机房',
    keywords: ['机房', '数据中心', '机柜', '冷通道', '微模块', '机房装修', '精密空调', 'UPS', '气体灭火', '电磁屏蔽'],
    aliases: ['数据中心机房施工', '机柜安装', '冷通道安装', '微模块机房', '机房综合测试', '机房UPS安装', '精密空调安装', '机房综合布线', '机房气体灭火', '机房电磁屏蔽', '机房试运行'],
    negativeKeywords: ['地源热泵机房', '热泵机房'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_lightning_grounding',
    signalType: 'standard_work_hint',
    code: 'intelligent_lightning_grounding_alias',
    standardWorkCodes: ['intelligent_lightning_grounding'],
    label: '智能化防雷接地屏蔽',
    keywords: ['智能化防雷', '屏蔽', '浪涌保护', '弱电接地', '机房接地'],
    aliases: ['智能化防雷接地', '弱电接地施工', '机房接地施工', '屏蔽接地', '浪涌保护器安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_intelligent_structured_cabling_points',
    signalType: 'standard_work_hint',
    code: 'intelligent_structured_cabling_points_alias',
    standardWorkCodes: ['intelligent_structured_cabling'],
    label: '综合布线与弱电点位',
    keywords: ['综合布线', '弱电点位', '智能化点位', '信息点', '网线', '模块', '面板', '信息插座', '网络面板'],
    aliases: ['弱电点位', '智能化点位', '综合布线施工', '模块安装', '信息点安装', '网线敷设', '面板模块安装', '点位移交', '信息插座安装', '网络面板安装'],
    negativeKeywords: ['金属屋面板', '屋面板', '围护墙板', '压型钢板', '彩钢板'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_weak_current_smart_system',
    signalType: 'standard_work_hint',
    code: 'weak_current_alias',
    standardWorkCodes: [
      'intelligent_structured_cabling',
      'intelligent_network_system',
      'intelligent_integration_network',
      'intelligent_information_application',
    ],
    contextKeywordsByStandardWorkCode: {
      intelligent_structured_cabling: ['综合布线', '信息点', '网线', '模块', '面板', '信息插座'],
      intelligent_network_system: ['无线AP', '网络设备', '交换机', '路由器'],
      intelligent_integration_network: ['智能化集成', '系统集成', '接口联调'],
      intelligent_information_application: ['信息化应用', '应用系统', '平台'],
    },
    label: '弱电智能化',
    keywords: ['弱电', '智能化'],
    aliases: ['弱电智能化', '智能化系统', '智能化工程', '弱电系统'],
    negativeKeywords: ['金属屋面板', '屋面板', '围护墙板', '压型钢板', '彩钢板', '综合布线', '点位', '信息点', '网线', '模块', '面板', 'AP', '无线AP', '信息插座', '网络面板'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_mep_rough_in_chasing',
    signalType: 'standard_work_hint',
    code: 'mep_rough_in_chasing_alias',
    standardWorkCodes: [
      'electrical_distribution_equipment',
      'electrical_lighting_terminal',
      'mep_plumbing_fire_pipe',
      'intelligent_integration_network',
      'intelligent_structured_cabling',
      'intelligent_network_system',
      'electrical_outdoor_distribution',
      'electrical_power_distribution_room',
      'electrical_feeder_busway',
      'intelligent_communication_media',
      'intelligent_ba_control',
      'intelligent_security_technical_system',
    ],
    contextKeywordsByStandardWorkCode: {
      electrical_distribution_equipment: ['强电', '电气', '电缆', '电线', '穿线', '线管', '线盒', '接线盒', '底盒', '配管'],
      electrical_lighting_terminal: ['开关', '插座', '照明', '灯具', '底盒', '支盒子'],
      electrical_power_distribution_room: ['配电室', '母线', '桥架', '电缆'],
      electrical_feeder_busway: ['供电干线', '母线槽', '电缆干线', '桥架'],
      electrical_outdoor_distribution: ['室外', '外线', '路灯', '庭院灯', '景观照明'],
      mep_plumbing_fire_pipe: ['给水', '排水', '消防', '喷淋', '消火栓', '水管', '套管', '留洞'],
      intelligent_integration_network: ['弱电', '智能化', '网线', '信息点', '模块', '面板'],
      intelligent_structured_cabling: ['综合布线', '信息点', '网线', '模块', '面板', '信息插座'],
      intelligent_network_system: ['无线AP', '网络设备', '交换机', '路由器'],
      intelligent_communication_media: ['广播', '会议', '信息发布'],
      intelligent_ba_control: ['BA', '自控', '楼控'],
      intelligent_security_technical_system: ['监控', '门禁', '安防'],
    },
    label: '机电预埋开槽',
    keywords: ['开槽', '压槽', '剔槽', '预埋', '穿管', '穿线', '线盒', '底盒', '支盒子', '接线盒', '留洞', '套管'],
    aliases: ['墙面开槽', '地面开槽', '水电开槽', '水电压槽', '二次配管', '线管预埋', '电气预埋', '水电预埋', '管线预埋', '穿线配管', '水电穿线', '底盒预埋', '线盒预埋', '支盒子', '套管预留', '洞口预留', '预留洞'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-electrical-system', 'china-plumbing-heating-system', 'china-intelligent-building-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_combined_support_hanger',
    signalType: 'standard_work_hint',
    code: 'combined_support_hanger_alias',
    standardWorkCodes: ['mep_plumbing_fire_pipe', 'electrical_distribution_equipment'],
    contextKeywordsByStandardWorkCode: {
      mep_plumbing_fire_pipe: ['综合', '支吊架', '抗震', '管综', 'BIM', '排布', '管线', '管道', '桥架', '风管'],
      electrical_distribution_equipment: ['桥架', '电缆', '配电', '母线'],
    },
    label: '综合支吊架',
    keywords: ['综合支吊架', '抗震支吊架', '联合支吊架', '共用支吊架', '管综支吊架'],
    aliases: ['综合支吊架施工', '综合支吊架安装', '抗震支吊架安装', '联合支吊架安装', '共用支吊架安装', '综合支吊架前置确认', '综合支吊架样板', '抗震斜撑安装'],
    negativeKeywords: ['支吊架防腐', '支吊架询价', '支吊架材料', '管道支吊架', '风管支吊架'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-mep-coordination', 'china-hvac-system', 'china-electrical-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_curtain_wall_facade',
    signalType: 'standard_work_hint',
    code: 'curtain_wall_alias',
    standardWorkCodes: ['curtain_wall_installation', 'exterior_insulation_finish'],
    contextKeywordsByStandardWorkCode: {
      curtain_wall_installation: ['幕墙', '龙骨', '玻璃幕墙', '石材幕墙', '铝板幕墙', '打胶', '淋水试验'],
      exterior_insulation_finish: ['外墙涂料', '真石漆', '外立面涂料', '保温', '抹灰'],
    },
    label: '幕墙外立面',
    keywords: ['幕墙', '龙骨', '玻璃幕墙', '石材幕墙', '铝板幕墙', '外立面', '真石漆'],
    aliases: ['幕墙龙骨', '玻璃幕墙安装', '石材幕墙安装', '铝板幕墙安装', '幕墙打胶', '幕墙淋水试验', '外立面施工', '真石漆施工'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-facade-curtain-wall', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_interior_detail_fixture_railing',
    signalType: 'standard_work_hint',
    code: 'interior_detail_fixture_railing_alias',
    standardWorkCodes: ['interior_detail_fixture_railing'],
    label: '细部橱柜栏杆扶手',
    keywords: ['橱柜', '窗帘盒', '窗台板', '门窗套', '栏杆', '扶手', '护栏', '花饰'],
    aliases: ['橱柜安装', '橱柜制作安装', '窗帘盒安装', '窗台板安装', '门窗套安装', '栏杆安装', '扶手安装', '护栏安装', '花饰安装', '阳台栏杆安装'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_door_window_railing',
    signalType: 'standard_work_hint',
    code: 'door_window_railing_alias',
    standardWorkCodes: ['door_window_railing'],
    label: '门窗栏杆',
    keywords: ['门窗', '窗框', '窗扇', '门框', '门扇', '防火门', '入户门', '人防门', '玻璃门', '五金', '百叶'],
    aliases: ['门窗安装', '窗框安装', '窗扇安装', '门框安装', '门扇安装', '防火门安装', '入户门安装', '人防门安装', '玻璃门安装', '门窗五金安装', '启闭调试', '淋水试验', '百叶安装'],
    negativeKeywords: ['门窗收口', '洞口收口', '收口修补', '五金询价', '栏杆合同', '卫浴五金', '外墙淋水', '幕墙淋水'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'china-facade-curtain-wall', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_interior_fixture_finish',
    signalType: 'standard_work_hint',
    code: 'interior_fixture_finish_alias',
    standardWorkCodes: ['interior_unit_finish', 'plumbing_sanitary_fixture'],
    label: '户内精装部品安装',
    keywords: ['木地板', '踢脚线', '洁具', '卫浴五金', '橱柜', '淋浴屏', '精保洁'],
    aliases: ['木地板安装', '踢脚线安装', '洁具安装', '卫浴五金安装', '橱柜安装', '淋浴屏安装', '户内精保洁', '精装修保洁', '户内开荒保洁'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_interior_wet_area_waterproof',
    signalType: 'standard_work_hint',
    code: 'interior_wet_area_waterproof_alias',
    standardWorkCodes: ['interior_unit_finish'],
    label: '厨卫阳台防水',
    keywords: ['厨卫防水', '卫生间防水', '厨房防水', '阳台防水', '卫生间闭水', '厨卫闭水'],
    aliases: ['厨卫防水施工', '卫生间防水施工', '厨房防水施工', '阳台防水施工', '卫生间闭水试验', '厨卫闭水试验'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_roof_layer_package',
    signalType: 'standard_work_hint',
    code: 'roof_layer_package_alias',
    standardWorkCodes: ['roof_waterproof_insulation', 'roof_insulation_thermal_layer', 'roof_membrane_waterproof', 'roof_tile_panel_surface', 'roof_detail_nodes'],
    label: '屋面构造层',
    keywords: ['屋面找坡', '屋面保护层', '屋面刚性层', '女儿墙压顶', '天沟防水', '屋面细部'],
    aliases: ['屋面找坡层施工', '屋面保护层施工', '屋面刚性层浇筑', '女儿墙压顶施工', '天沟防水施工', '屋面细部处理'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-waterproof-insulation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_waterproof_membrane',
    signalType: 'standard_work_hint',
    code: 'waterproof_membrane_alias',
    standardWorkCodes: ['basement_waterproof_backfill', 'exterior_wall_waterproof', 'roof_membrane_waterproof', 'roof_waterproof_insulation'],
    contextKeywordsByStandardWorkCode: {
      basement_waterproof_backfill: ['地下室', '外墙', '底板', '顶板', '肥槽', '回填', '抗渗', '后浇带'],
      exterior_wall_waterproof: ['外墙', '外立面', '立面', '外窗', '淋水', '防渗漏'],
      roof_membrane_waterproof: ['屋面', '屋顶', '卷材', '涂膜', 'SBS', 'TPO', 'PVC', '蓄水', '淋水'],
      roof_waterproof_insulation: ['屋面', '屋顶', '女儿墙', '天沟', '找坡', '保护层'],
    },
    label: '卷材防水',
    keywords: ['卷材', '防水卷材', '防水', '涂膜', '闭水', '蓄水', 'SBS', 'TPO', 'PVC防水'],
    aliases: ['防水', '卷材铺贴', '涂膜防水', '搭接', '附加层', '闭水试验', '蓄水试验', '淋水试验', 'SBS卷材', '自粘卷材', 'TPO卷材', 'PVC防水卷材'],
    negativeKeywords: ['卫生间', '厨卫', '厨房防水', '阳台防水', '厨卫闭水', '消防水池'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-waterproof-insulation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_insulation_ambiguous',
    signalType: 'standard_work_hint',
    code: 'insulation_alias',
    standardWorkCodes: ['roof_insulation_thermal_layer', 'exterior_insulation_finish', 'roof_waterproof_insulation'],
    contextKeywordsByStandardWorkCode: {
      roof_insulation_thermal_layer: ['屋面', '屋顶', '保温层', '隔热', '热桥'],
      exterior_insulation_finish: ['外墙', '外立面', '立面', '真石漆', '涂料', '幕墙'],
      roof_waterproof_insulation: ['屋面', '屋顶', '女儿墙', '天沟', '找坡', '保护层'],
    },
    label: '保温',
    keywords: ['保温', '外保温', '屋面保温', '保温板'],
    aliases: ['保温层', '保温板铺贴', '外墙保温', '屋面保温', '节能保温'],
    negativeKeywords: ['管道保温', '管道绝热', '热力管道防腐保温'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-waterproof-insulation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_outdoor_water_supply_network',
    signalType: 'standard_work_hint',
    code: 'outdoor_water_supply_network_alias',
    standardWorkCodes: ['outdoor_water_supply_network'],
    label: '室外给水管网',
    keywords: ['室外给水', '给水管网', '室外消火栓', '给水碰口', '给水接驳'],
    aliases: ['室外给水管网安装', '给水管道安装', '室外消火栓系统安装', '给水管网试压', '给水接市政'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_outdoor_drainage_network',
    signalType: 'standard_work_hint',
    code: 'outdoor_drainage_network_alias',
    standardWorkCodes: ['outdoor_drainage_network'],
    label: '室外排水管网',
    keywords: ['室外排水', '雨污水', '雨水管', '污水管', '检查井', '雨水口', '化粪池', '隔油池', '闭水试验'],
    aliases: ['室外雨污水管网安装', '雨污水管网', '排水管道安装', '检查井砌筑', '雨水口施工', '化粪池安装', '隔油池安装', '雨污水闭水试验', '管道闭水试验'],
    negativeKeywords: ['卫生间', '厨房', '户内', '室内', '阳台', '屋面'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_outdoor_heating_network',
    signalType: 'standard_work_hint',
    code: 'outdoor_heating_network_alias',
    standardWorkCodes: ['outdoor_heating_network'],
    label: '室外供热管网',
    keywords: ['室外供热', '供热管网', '热力管网', '热力管道', '供热管道', '热力小室'],
    aliases: ['室外供热管网安装', '热力管网施工', '供热管道安装', '供热管网水压试验', '热力管道防腐保温'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_indoor_heating_systems',
    signalType: 'standard_work_hint',
    code: 'indoor_heating_systems_alias',
    standardWorkCodes: [
      'heating_radiator_system',
      'heating_hydronic_floor_system',
      'heating_electric_floor_system',
      'heating_gas_radiant_system',
      'heating_indoor_system',
    ],
    contextKeywordsByStandardWorkCode: {
      heating_radiator_system: ['散热器', '暖气片', '托钩', '放气阀', '组对试压'],
      heating_hydronic_floor_system: ['地暖', '低温热水', '盘管', '分集水器', '反射膜', '填充层'],
      heating_electric_floor_system: ['电地暖', '发热电缆', '电热膜', '温控器', '绝缘电阻'],
      heating_gas_radiant_system: ['燃气辐射', '辐射管', '辐射器', '气密性', '点火控制'],
      heating_indoor_system: ['供暖', '采暖', '热力', '供热', '热水采暖'],
    },
    label: '室内供暖系统',
    keywords: [
      '供暖',
      '采暖',
      '散热器',
      '暖气片',
      '地暖',
      '低温热水',
      '盘管',
      '电地暖',
      '发热电缆',
      '电热膜',
      '燃气辐射',
      '辐射管',
      '辐射器',
    ],
    aliases: [
      '散热器安装',
      '暖气片安装',
      '散热器组对试压',
      '地暖盘管敷设',
      '低温热水地暖',
      '低温热水地暖施工',
      '电热膜敷设',
      '发热电缆敷设',
      '电地暖安装',
      '燃气辐射管安装',
      '燃气辐射器安装',
      '辐射器安装',
      '采暖系统安装',
      '室内供暖系统安装',
    ],
    negativeKeywords: ['室外供热', '供热管网', '热力管网', '热力管道', '供热管道', '热力小室', '风机盘管', '空调盘管', '空调水盘管', '风口', '排风', '新风', '冷却塔', '冷水机组'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_pipeline_ambiguous',
    signalType: 'standard_work_hint',
    code: 'pipeline_alias',
    standardWorkCodes: [
      'mep_plumbing_fire_pipe',
      'plumbing_indoor_drainage',
      'outdoor_utilities',
      'plumbing_indoor_water_supply_pipe',
      'plumbing_hot_water_system',
      'plumbing_fire_hydrant_sprinkler',
      'heating_indoor_system',
      'plumbing_special_water_system',
    ],
    contextKeywordsByStandardWorkCode: {
      mep_plumbing_fire_pipe: ['套管', '预留', '管道', '给排水', '水管', '泵房', '水池'],
      plumbing_indoor_water_supply_pipe: ['室内', '楼层', '立管', '支管', '给水', '水管', '卫生间'],
      plumbing_indoor_drainage: ['排水', '雨水', '污水', '支管', '闭水', '通球'],
      plumbing_hot_water_system: ['热水', '热水供应', '热水管', '循环管'],
      plumbing_fire_hydrant_sprinkler: ['喷淋', '消火栓', '消防', '喷头', '阀组', '报警阀'],
      outdoor_utilities: ['室外', '总平', '场区', '小区', '道路', '接驳', '接入', '碰口', '外线', '综合管网'],
      heating_indoor_system: ['供暖', '采暖', '散热器', '地暖', '热水', '热力'],
      plumbing_special_water_system: ['饮用水', '中水', '雨水利用', '泳池', '浴池', '水景', '喷泉', '锅炉', '仪表'],
    },
    label: '管道管网',
    keywords: ['管道', '给排水', '雨污水', '雨水管', '污水管', '外线', '碰口', '接驳', '接入', '检查井', '雨水口', '化粪池', '隔油池', '消防水池', '管沟'],
    aliases: ['给排水管道', '雨污水管网', '室外管网', '管道敷设', '管道安装', '通水试验', '小区外线', '市政接驳', '市政接入', '雨污水碰口', '外线碰口', '接市政', '检查井砌筑', '雨水口施工', '化粪池安装', '隔油池安装', '消防水池施工', '雨污水闭水试验', '管道闭水试验', '管沟回填'],
    negativeKeywords: ['运营商', '通信接入', '信息接入', '移动通信', '室分', '无线覆盖', '卫星通信', '管道防腐', '防腐', '管道保温', '管道绝热', '绝热', '给水冲洗', '给水消毒', '给水压力试验', '压力试验'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_special_water_systems',
    signalType: 'standard_work_hint',
    code: 'special_water_systems_alias',
    standardWorkCodes: [
      'plumbing_reclaimed_rainwater_system',
      'plumbing_pool_bath_system',
      'plumbing_water_feature_system',
      'heating_source_auxiliary_equipment',
      'plumbing_instrument_control_system',
    ],
    contextKeywordsByStandardWorkCode: {
      plumbing_reclaimed_rainwater_system: ['中水', '雨水利用', '回用水', '雨水回收'],
      plumbing_pool_bath_system: ['泳池', '游泳池', '浴池', '循环水', '水处理'],
      plumbing_water_feature_system: ['水景', '喷泉', '景观水', '喷头'],
      heating_source_auxiliary_equipment: ['热源', '锅炉', '换热站', '换热机组', '安全附件'],
      plumbing_instrument_control_system: ['检测仪表', '控制仪表', '取源部件', '传感器', '仪表调试'],
    },
    label: '专项水系统',
    keywords: ['中水', '雨水利用', '泳池', '浴池', '水景', '喷泉', '锅炉', '换热站', '检测仪表', '控制仪表'],
    aliases: ['中水系统安装', '雨水利用系统', '泳池水处理系统', '公共浴池水系统', '水景喷泉系统', '锅炉安装', '换热站安装', '检测仪表安装', '控制仪表调试'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-plumbing-heating-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_outdoor_road_hardscape',
    signalType: 'standard_work_hint',
    code: 'outdoor_road_hardscape_alias',
    standardWorkCodes: ['outdoor_road_hardscape'],
    label: '室外道路与硬景铺装',
    keywords: ['道路', '路基', '道路基层', '沥青', '混凝土路面', '铺装', '园路', '路缘石', '道牙', '透水砖', '硬景', '广场铺装', '围墙', '大门', '岗亭', '水稳层', '水泥稳定碎石', '级配碎石', '摊铺', 'ϳ'],
    aliases: ['道路基层施工', '沥青摊铺', '混凝土路面施工', '园路铺装', '路缘石安装', '道牙安装', '人行道铺装', '透水砖铺装', '广场铺装', '室外硬景铺装', '道路恢复', '围墙施工', '小区围墙施工', '大门安装', '岗亭安装', '水稳层施工', '水稳层摊铺', '级配碎石施工', '·ϳ'],
    negativeKeywords: ['临时道路', '临建道路', '道路租赁', '道路协调会', '水稳层租赁'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-outdoor', 'china-gb55032-2022-municipal', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_landscape_greenery',
    signalType: 'standard_work_hint',
    code: 'landscape_greenery_alias',
    standardWorkCodes: ['landscape_greenery'],
    label: '景观绿化',
    keywords: ['景观', '绿化', '园林', '种植土', '苗木', '乔木', '灌木', '草坪', '栽植', '水景', '灌溉'],
    aliases: ['绿化栽植', '苗木栽植', '种植土回填', '乔木种植', '灌木种植', '草坪铺设', '景观施工', '园林绿化', '水景施工', '灌溉系统施工', '绿化养护'],
    negativeKeywords: ['景观灯', '景观照明', '绿化招标'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-gb55032-2022-outdoor', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_finish_closing_repair',
    signalType: 'standard_work_hint',
    code: 'finish_closing_alias',
    standardWorkCodes: ['interior_unit_finish', 'interior_public_finish', 'plastering_wall_ceiling'],
    contextKeywordsByStandardWorkCode: {
      interior_unit_finish: ['户内', '户内精装', '厨卫', '房间', '分户', '套内', '住宅'],
      interior_public_finish: ['公区', '走廊', '大堂', '电梯厅', '楼梯间', '公共区域'],
      plastering_wall_ceiling: ['抹灰', '找平', '基层', '砂浆', '墙面修补', '空鼓', '裂缝'],
    },
    label: '装饰收口修补',
    keywords: ['收口', '修补', '补烂', '补洞', '成品保护', '开荒', '细部处理', '空鼓', '裂缝'],
    aliases: ['装饰收口', '墙面修补', '空鼓修补', '裂缝修补', '洞口收口', '门窗收口', '开荒保洁', '成品保护恢复', '细部收口'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-jgj-tianjin-decoration', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_commissioning_ambiguous',
    signalType: 'standard_work_hint',
    code: 'commissioning_alias',
    standardWorkCodes: ['single_system_commissioning', 'integrated_commissioning'],
    contextKeywordsByStandardWorkCode: {
      single_system_commissioning: ['单机', '单系统', '送电', '水泵', '风机', '电梯', '试运行', '试运转'],
      integrated_commissioning: ['联调', '联试', '联动', '综合', '消防联动', '系统联调'],
    },
    label: '调试联调',
    keywords: ['调试', '联调', '单机调试', '系统调试', '送电', '试运行', '试运转', '单机试运转'],
    aliases: ['单系统调试', '单机试运转', '系统联调', '联合调试', '送电调试', '试运行'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-mep-coordination', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_energy_saving_system',
    signalType: 'standard_work_hint',
    code: 'energy_saving_system_alias',
    standardWorkCodes: ['energy_hvac_system', 'energy_electrical_lighting', 'energy_monitoring_control', 'energy_renewable_system'],
    contextKeywordsByStandardWorkCode: {
      energy_hvac_system: ['暖通', '空调', '冷热源', '水系统', '平衡调试'],
      energy_electrical_lighting: ['电气', '照明', '功率密度', '配电', '灯具'],
      energy_monitoring_control: ['能耗', '监测', '计量', '能源管理', '监控'],
      energy_renewable_system: ['光伏', '太阳能', '可再生', '新能源', '屋面光伏', '地源热泵', '热泵'],
    },
    label: '节能系统',
    keywords: ['节能', '能耗', '光伏', '太阳能', '可再生能源', '地源热泵', '热泵', '能源管理', '绿色建筑'],
    aliases: ['暖通节能', '空调节能', '照明节能', '能耗监测', '能源管理系统', '屋面光伏', '光伏组件安装', '太阳能系统安装', '地源热泵机房', '地源热泵系统', '可再生能源系统'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-energy-saving-system', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_acceptance_ambiguous',
    signalType: 'standard_work_hint',
    code: 'acceptance_alias',
    standardWorkCodes: ['special_acceptance', 'completion_acceptance_archive'],
    contextKeywordsByStandardWorkCode: {
      special_acceptance: ['专项', '消防', '电梯', '人防', '节能', '防雷', '幕墙', '分户', '隐蔽', '检验批'],
      completion_acceptance_archive: ['竣工', '备案', '移交', '交付', '资料', '档案', '归档'],
    },
    label: '验收移交',
    keywords: ['验收', '专项验收', '竣工验收', '移交', '消缺', '甩项'],
    aliases: ['专项验收', '竣工验收', '分项验收', '移交验收', '消缺整改', '资料归档', '甩项处理', '甩项移交', '缺陷整改', '交付移交'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['acceptance_plans', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_guide_rail',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_guide_rail_alias',
    standardWorkCodes: [
      'elevator_traction_guide_rail',
    ],
    contextKeywordsByStandardWorkCode: {
      elevator_traction_guide_rail: ['\u5bfc\u8f68', '\u6837\u677f\u67b6', '\u57fa\u51c6\u7ebf'],
    },
    label: '\u7535\u68af\u5bfc\u8f68',
    keywords: [
      '\u5bfc\u8f68',
      '\u6837\u677f\u67b6',
      '\u57fa\u51c6\u7ebf',
    ],
    aliases: [
      '\u5bfc\u8f68\u5b89\u88c5',
      '\u5bfc\u8f68\u6821\u6b63',
      '\u5bfc\u8f68\u9a8c\u6536',
    ],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_equipment_acceptance',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_equipment_acceptance_alias',
    standardWorkCodes: ['elevator_traction_equipment_acceptance'],
    label: '\u7535\u68af\u8bbe\u5907\u8fdb\u573a',
    keywords: ['\u8bbe\u5907\u8fdb\u573a', '\u5f00\u7bb1\u9a8c\u6536', '\u88c5\u7bb1\u6e05\u5355', '\u968f\u673a\u8d44\u6599'],
    aliases: ['\u7535\u68af\u8bbe\u5907\u8fdb\u573a', '\u7535\u68af\u5f00\u7bb1\u9a8c\u6536'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_civil_handover',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_civil_handover_alias',
    standardWorkCodes: ['elevator_traction_civil_handover'],
    label: '\u7535\u68af\u571f\u5efa\u4ea4\u63a5',
    keywords: ['\u571f\u5efa\u4ea4\u63a5', '\u4e95\u9053\u590d\u6838', '\u5e95\u5751', '\u5c42\u95e8\u6d1e\u53e3'],
    aliases: ['\u7535\u68af\u571f\u5efa\u4ea4\u63a5', '\u4e95\u9053\u4ea4\u63a5\u9a8c\u6536'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_machine_drive',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_machine_drive_alias',
    standardWorkCodes: ['elevator_traction_machine_drive'],
    label: '\u7535\u68af\u66f3\u5f15\u673a',
    keywords: ['\u66f3\u5f15\u673a', '\u9a71\u52a8\u4e3b\u673a', '\u63a7\u5236\u67dc', '\u53d8\u9891\u5668'],
    aliases: ['\u66f3\u5f15\u673a\u5b89\u88c5', '\u9a71\u52a8\u4e3b\u673a\u5b89\u88c5'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_door_system',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_door_system_alias',
    standardWorkCodes: ['elevator_traction_door_system'],
    label: '\u7535\u68af\u95e8\u7cfb\u7edf',
    keywords: ['\u5c42\u95e8', '\u5385\u95e8', '\u95e8\u5957', '\u95e8\u9501', '\u5730\u574e'],
    aliases: ['\u5385\u95e8\u5b89\u88c5', '\u5c42\u95e8\u5b89\u88c5', '\u95e8\u5957\u5b89\u88c5'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_car_assembly',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_car_assembly_alias',
    standardWorkCodes: ['elevator_traction_car_assembly'],
    label: '\u7535\u68af\u8f7f\u53a2',
    keywords: ['\u8f7f\u53a2', '\u8f7f\u5e95', '\u8f7f\u9876', '\u8f7f\u95e8', '\u79f0\u91cd'],
    aliases: ['\u8f7f\u53a2\u5b89\u88c5', '\u8f7f\u95e8\u5b89\u88c5', '\u8f7f\u53a2\u88c5\u4fee'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_counterweight',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_counterweight_alias',
    standardWorkCodes: ['elevator_traction_counterweight'],
    label: '\u7535\u68af\u5bf9\u91cd',
    keywords: ['\u5bf9\u91cd', '\u5bf9\u91cd\u5757', '\u5bf9\u91cd\u5bfc\u9774'],
    aliases: ['\u5bf9\u91cd\u5b89\u88c5', '\u5bf9\u91cd\u6846\u67b6\u7ec4\u88c5'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_safety_components',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_safety_components_alias',
    standardWorkCodes: ['elevator_traction_safety_components'],
    label: '\u7535\u68af\u5b89\u5168\u90e8\u4ef6',
    keywords: ['\u9650\u901f\u5668', '\u5b89\u5168\u94b3', '\u7f13\u51b2\u5668', '\u6781\u9650\u5f00\u5173'],
    aliases: ['\u5b89\u5168\u94b3\u5b89\u88c5', '\u9650\u901f\u5668\u5b89\u88c5', '\u7f13\u51b2\u5668\u5b89\u88c5'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_suspension_rope',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_suspension_rope_alias',
    standardWorkCodes: ['elevator_traction_suspension_rope'],
    label: '\u7535\u68af\u60ac\u6302\u88c5\u7f6e',
    keywords: ['\u66f3\u5f15\u94a2\u4e1d\u7ef3', '\u7ef3\u5934', '\u60ac\u6302\u88c5\u7f6e'],
    aliases: ['\u66f3\u5f15\u94a2\u4e1d\u7ef3\u5b89\u88c5', '\u7ef3\u5934\u7ec4\u5408\u5236\u4f5c'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_traveling_cable',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_traveling_cable_alias',
    standardWorkCodes: ['elevator_traction_traveling_cable'],
    label: '\u7535\u68af\u968f\u884c\u7535\u7f06',
    keywords: ['\u968f\u884c\u7535\u7f06', '\u4e95\u9053\u7535\u7f06'],
    aliases: ['\u968f\u884c\u7535\u7f06\u5b89\u88c5', '\u4e95\u9053\u7535\u7f06\u652f\u67b6'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_compensation_device',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_compensation_device_alias',
    standardWorkCodes: ['elevator_traction_compensation_device'],
    label: '\u7535\u68af\u8865\u507f\u88c5\u7f6e',
    keywords: ['\u8865\u507f\u94fe', '\u8865\u507f\u7ef3', '\u5f20\u7d27\u88c5\u7f6e'],
    aliases: ['\u8865\u507f\u94fe\u5b89\u88c5', '\u8865\u507f\u88c5\u7f6e\u5b89\u88c5'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_electrical_device',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_electrical_device_alias',
    standardWorkCodes: ['elevator_traction_electrical_device'],
    label: '\u7535\u68af\u7535\u6c14\u88c5\u7f6e',
    keywords: ['\u7535\u6c14\u88c5\u7f6e', '\u63a7\u5236\u67dc', '\u5b89\u5168\u56de\u8def', '\u95e8\u9501\u56de\u8def', '\u7edd\u7f18\u7535\u963b'],
    aliases: ['\u63a7\u5236\u67dc\u5b89\u88c5', '\u7535\u68af\u7535\u6c14\u5b89\u88c5', '\u5b89\u5168\u56de\u8def\u63a5\u7ebf'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_traction_final_acceptance',
    signalType: 'standard_work_hint',
    code: 'elevator_traction_final_acceptance_alias',
    standardWorkCodes: ['elevator_traction_final_acceptance'],
    label: '\u7535\u68af\u6574\u673a\u9a8c\u6536',
    keywords: ['\u6574\u673a\u9a8c\u6536', '\u5feb\u8f66', '\u8f7d\u8377\u8bd5\u9a8c', '\u76d1\u7763\u68c0\u9a8c'],
    aliases: ['\u7535\u68af\u6574\u673a\u9a8c\u6536', '\u7535\u68af\u76d1\u7763\u68c0\u9a8c', '\u8f7d\u8377\u8bd5\u9a8c'],
    negativeKeywords: ['\u6db2\u538b\u7535\u68af'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_equipment_acceptance',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_equipment_acceptance_alias',
    standardWorkCodes: ['elevator_hydraulic_equipment_acceptance'],
    label: '\u6db2\u538b\u7535\u68af\u8bbe\u5907\u8fdb\u573a',
    keywords: ['\u6db2\u538b\u7535\u68af\u8bbe\u5907\u8fdb\u573a', '\u6db2\u538b\u6cf5\u7ad9', '\u6db2\u538b\u7f38', '\u5f00\u7bb1\u9a8c\u6536'],
    aliases: ['\u6db2\u538b\u7535\u68af\u5f00\u7bb1\u9a8c\u6536', '\u6db2\u538b\u7535\u68af\u8bbe\u5907\u6e05\u70b9'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_civil_handover',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_civil_handover_alias',
    standardWorkCodes: ['elevator_hydraulic_civil_handover'],
    label: '\u6db2\u538b\u7535\u68af\u571f\u5efa\u4ea4\u63a5',
    keywords: ['\u6db2\u538b\u7535\u68af\u571f\u5efa\u4ea4\u63a5', '\u4e95\u9053\u590d\u6838', '\u5e95\u5751', '\u6cf5\u7ad9\u57fa\u7840'],
    aliases: ['\u6db2\u538b\u7535\u68af\u4e95\u9053\u4ea4\u63a5', '\u6db2\u538b\u7535\u68af\u571f\u5efa\u9a8c\u6536'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_cylinder_pump_station',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_cylinder_pump_station_alias',
    standardWorkCodes: ['elevator_hydraulic_cylinder_pump_station'],
    label: '\u6db2\u538b\u7535\u68af\u6db2\u538b\u7cfb\u7edf',
    keywords: ['\u6db2\u538b\u7f38', '\u67f1\u585e', '\u6db2\u538b\u6cf5\u7ad9', '\u6cb9\u7bb1', '\u6db2\u538b\u7ba1\u8def', '\u6db2\u538b\u6cb9', '\u6ea2\u6d41\u9600', '\u9650\u901f\u5207\u65ad\u9600', '\u6db2\u538b\u7cfb\u7edf\u538b\u529b\u8bd5\u9a8c'],
    aliases: ['\u6db2\u538b\u7cfb\u7edf\u5b89\u88c5', '\u6db2\u538b\u7cfb\u7edf\u538b\u529b\u8bd5\u9a8c', '\u6db2\u538b\u6cf5\u7ad9\u5b89\u88c5', '\u6db2\u538b\u7f38\u5b89\u88c5', '\u6db2\u538b\u7ba1\u8def\u8bd5\u538b'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_guide_rail',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_guide_rail_alias',
    standardWorkCodes: ['elevator_hydraulic_guide_rail'],
    label: '\u6db2\u538b\u7535\u68af\u5bfc\u8f68',
    keywords: ['\u6db2\u538b\u7f38\u5bfc\u8f68', '\u6db2\u538b\u7535\u68af\u5bfc\u8f68', '\u6db2\u538b\u7535\u68af\u6837\u677f\u67b6', '\u6db2\u538b\u7535\u68af\u57fa\u51c6\u7ebf'],
    aliases: ['\u6db2\u538b\u7535\u68af\u5bfc\u8f68\u5b89\u88c5', '\u6db2\u538b\u7f38\u5bfc\u8f68\u6821\u6b63'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_door_system',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_door_system_alias',
    standardWorkCodes: ['elevator_hydraulic_door_system'],
    label: '\u6db2\u538b\u7535\u68af\u95e8\u7cfb\u7edf',
    keywords: ['\u5c42\u95e8', '\u5730\u574e', '\u95e8\u5934', '\u95e8\u9501', '\u5f3a\u8feb\u5173\u95e8'],
    aliases: ['\u6db2\u538b\u7535\u68af\u5c42\u95e8\u5b89\u88c5', '\u6db2\u538b\u7535\u68af\u95e8\u9501\u8c03\u8bd5'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_car_assembly',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_car_assembly_alias',
    standardWorkCodes: ['elevator_hydraulic_car_assembly'],
    label: '\u6db2\u538b\u7535\u68af\u8f7f\u53a2',
    keywords: ['\u8f7f\u53a2', '\u8f7f\u5e95', '\u67f1\u585e\u8fde\u63a5', '\u8f7f\u9876', '\u5bfc\u9774', '\u95e8\u673a'],
    aliases: ['\u6db2\u538b\u7535\u68af\u8f7f\u53a2\u5b89\u88c5', '\u6db2\u538b\u7535\u68af\u67f1\u585e\u8fde\u63a5'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_balance_weight',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_balance_weight_alias',
    standardWorkCodes: ['elevator_hydraulic_balance_weight'],
    label: '\u6db2\u538b\u7535\u68af\u5e73\u8861\u91cd',
    keywords: ['\u5e73\u8861\u91cd', '\u5e73\u8861\u91cd\u5757', '\u5e73\u8861\u91cd\u5bfc\u9774'],
    aliases: ['\u6db2\u538b\u7535\u68af\u5e73\u8861\u91cd\u5b89\u88c5', '\u5e73\u8861\u91cd\u5757\u88c5\u5165'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_safety_components',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_safety_components_alias',
    standardWorkCodes: ['elevator_hydraulic_safety_components'],
    label: '\u6db2\u538b\u7535\u68af\u5b89\u5168\u90e8\u4ef6',
    keywords: ['\u9650\u901f\u5668', '\u5b89\u5168\u94b3', '\u9650\u901f\u5207\u65ad\u9600', '\u7f13\u51b2\u5668', '\u8054\u52a8\u529f\u80fd'],
    aliases: ['\u6db2\u538b\u7535\u68af\u5b89\u5168\u94b3\u5b89\u88c5', '\u9650\u901f\u5207\u65ad\u9600\u5b89\u88c5'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_suspension_device',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_suspension_device_alias',
    standardWorkCodes: ['elevator_hydraulic_suspension_device'],
    label: '\u6db2\u538b\u7535\u68af\u60ac\u6302\u88c5\u7f6e',
    keywords: ['\u60ac\u6302\u94a2\u4e1d\u7ef3', '\u94fe\u6761', '\u7ef3\u5934', '\u5f20\u529b\u5747\u5300', '\u9632\u6643'],
    aliases: ['\u6db2\u538b\u7535\u68af\u60ac\u6302\u88c5\u7f6e\u5b89\u88c5', '\u6db2\u538b\u7535\u68af\u94fe\u6761\u8fde\u63a5'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_traveling_cable',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_traveling_cable_alias',
    standardWorkCodes: ['elevator_hydraulic_traveling_cable'],
    label: '\u6db2\u538b\u7535\u68af\u968f\u884c\u7535\u7f06',
    keywords: ['\u968f\u884c\u7535\u7f06', '\u4e95\u9053\u7535\u7f06', '\u7535\u7f06\u652f\u67b6', '\u5f2f\u66f2\u534a\u5f84'],
    aliases: ['\u6db2\u538b\u7535\u68af\u968f\u884c\u7535\u7f06\u5b89\u88c5', '\u6db2\u538b\u7535\u68af\u4e95\u9053\u7535\u7f06\u652f\u67b6'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_electrical_device',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_electrical_device_alias',
    standardWorkCodes: ['elevator_hydraulic_electrical_device'],
    label: '\u6db2\u538b\u7535\u68af\u7535\u6c14\u88c5\u7f6e',
    keywords: ['\u6db2\u538b\u7535\u68af\u63a7\u5236\u67dc', '\u6db2\u538b\u7535\u68af\u7ebf\u69fd', '\u6db2\u538b\u7535\u68af\u5b89\u5168\u56de\u8def', '\u6db2\u538b\u7535\u68af\u95e8\u9501\u56de\u8def', '\u6db2\u538b\u7535\u68af\u63a5\u5730', '\u6db2\u538b\u7535\u68af\u7edd\u7f18\u7535\u963b'],
    aliases: ['\u6db2\u538b\u7535\u68af\u63a7\u5236\u67dc\u5b89\u88c5', '\u6db2\u538b\u7535\u68af\u7535\u6c14\u9a8c\u6536'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_hydraulic_final_acceptance',
    signalType: 'standard_work_hint',
    code: 'elevator_hydraulic_final_acceptance_alias',
    standardWorkCodes: ['elevator_hydraulic_final_acceptance'],
    label: '\u6db2\u538b\u7535\u68af\u6574\u673a\u9a8c\u6536',
    keywords: ['\u6574\u673a\u9a8c\u6536', '\u6162\u8f66', '\u5feb\u8f66', '\u8f7d\u8377\u8bd5\u9a8c', '\u6c89\u964d\u8bd5\u9a8c', '\u8d85\u538b\u9759\u8f7d', '\u76d1\u7763\u68c0\u9a8c'],
    aliases: ['\u6db2\u538b\u7535\u68af\u6574\u673a\u9a8c\u6536', '\u6db2\u538b\u7535\u68af\u6574\u673a\u8f7d\u8377\u8bd5\u9a8c', '\u6db2\u538b\u7535\u68af\u8f7d\u8377\u8bd5\u9a8c', '\u6db2\u538b\u7535\u68af\u76d1\u7763\u68c0\u9a8c'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_elevator_rail',
    signalType: 'standard_work_hint',
    code: 'elevator_rail_alias',
    standardWorkCodes: ['elevator_traction_installation', 'elevator_hydraulic_installation', 'escalator_moving_walk_installation', 'elevator_installation'],
    contextKeywordsByStandardWorkCode: {
      elevator_traction_installation: ['电梯', '导轨', '轿厢', '曳引机', '厅门', '井道'],
      elevator_hydraulic_installation: ['液压电梯', '液压', '油缸', '泵站'],
      escalator_moving_walk_installation: ['扶梯', '自动扶梯', '自动人行道', '桁架', '梯级', '扶手带'],
      elevator_installation: ['电梯', '整机', '安装验收'],
    },
    label: '电梯导轨',
    keywords: ['电梯', '导轨', '轿厢', '曳引机', '厅门', '井道', '扶梯'],
    aliases: ['电梯安装', '导轨安装', '轿厢安装', '厅门安装', '曳引机安装', '电梯调试', '整机安装验收'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-elevator-installation', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_specialist_design_procurement_release',
    signalType: 'standard_work_hint',
    code: 'specialist_design_procurement_release_alias',
    standardWorkCodes: ['specialist_design_procurement_release'],
    label: '\u4e13\u9879\u6df1\u5316\u4e0e\u91c7\u8d2d\u91ca\u653e',
    keywords: [
      '\u4e13\u9879\u6df1\u5316',
      '\u8bbe\u5907\u9009\u578b\u6df1\u5316',
      '\u6280\u672f\u89c4\u683c\u51bb\u7ed3',
      '\u91c7\u8d2d\u91ca\u653e',
      'design release',
      'procurement release',
    ],
    aliases: [
      '\u4e13\u9879\u8bbe\u8ba1\u6df1\u5316\u4e0e\u91c7\u8d2d\u91ca\u653e',
      '\u8bbe\u5907\u9009\u578b\u3001\u6280\u672f\u89c4\u683c\u51bb\u7ed3\u4e0e\u91c7\u8d2d\u91ca\u653e',
      '\u5173\u952e\u8bbe\u5907\u9009\u578b\u6df1\u5316\u53ca\u91c7\u8d2d\u91ca\u653e',
    ],
    negativeKeywords: ['\u6750\u6599\u8be2\u4ef7', '\u666e\u901a\u91c7\u8d2d\u8be2\u4ef7', '\u62db\u6807\u8bc4\u5ba1'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['managed-frontier-default-master-plan', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_long_lead_equipment_manufacture_delivery',
    signalType: 'standard_work_hint',
    code: 'long_lead_equipment_manufacture_delivery_alias',
    standardWorkCodes: ['long_lead_equipment_manufacture_delivery'],
    label: '\u957f\u5468\u671f\u8bbe\u5907\u5236\u9020\u4e0e\u4ea4\u4ed8',
    keywords: [
      '\u957f\u5468\u671f\u8bbe\u5907',
      '\u8ba2\u8d27\u6392\u4ea7',
      '\u8bbe\u5907\u5236\u9020\u4ea4\u4ed8',
      '\u5382\u5bb6FAT',
      '\u5de5\u5382\u9a8c\u6536',
      '\u5206\u6279\u5230\u8d27',
      'long lead equipment',
      'factory acceptance',
    ],
    aliases: [
      '\u957f\u5468\u671f\u8bbe\u5907\u8ba2\u8d27\u6392\u4ea7\u3001\u5382\u5bb6FAT\u4e0e\u5206\u6279\u5230\u8d27',
      '\u8bbe\u5907\u5236\u9020\u3001\u5de5\u5382\u9a8c\u6536\u4e0e\u5206\u6279\u4ea4\u4ed8',
      '\u5173\u952e\u8bbe\u5907\u6392\u4ea7\u5236\u9020\u53ca\u5230\u8d27',
    ],
    negativeKeywords: ['\u666e\u901a\u6750\u6599\u8fdb\u573a', '\u96f6\u661f\u91c7\u8d2d', '\u8bbe\u5907\u8fdb\u573a\u9a8c\u6536'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['managed-frontier-default-master-plan', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  {
    ruleId: 'alias_expert_domain_renovation_retrofit',
    signalType: 'standard_work_hint',
    code: 'expert_domain_renovation_retrofit_alias',
    standardWorkCodes: ['expert_domain_renovation_retrofit'],
    label: '\u65e2\u6709\u5efa\u7b51\u6539\u9020\u4e0e\u52a0\u56fa',
    keywords: [
      '\u65e2\u6709\u7ed3\u6784\u68c0\u6d4b\u9274\u5b9a',
      '\u7ed3\u6784\u62c6\u6539',
      '\u7ed3\u6784\u52a0\u56fa\u6539\u9020',
      '\u88c5\u4fee\u6539\u9020',
      '\u673a\u7535\u5207\u6362',
      '\u8fd0\u8425\u5bfc\u6539',
      'renovation retrofit',
      'structural retrofit',
    ],
    aliases: [
      '\u65e2\u6709\u7ed3\u6784\u68c0\u6d4b\u9274\u5b9a\u4e0e\u62c6\u6539\u51c6\u5907',
      '\u65e2\u6709\u5efa\u7b51\u62c6\u6539\u3001\u7ed3\u6784\u52a0\u56fa\u4e0e\u673a\u7535\u5207\u6362',
      '\u8425\u4e1a\u533a\u5206\u533a\u5bfc\u6539\u4e0e\u88c5\u4fee\u6539\u9020',
    ],
    negativeKeywords: ['\u8bbe\u8ba1\u53d8\u66f4', '\u8d28\u91cf\u6574\u6539', '\u7f3a\u9677\u6574\u6539'],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['china-renovation-retrofit', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  },
  ...MANAGED_FRONTIER_DOMAIN_STANDARD_WORK_ALIAS_CONFIG.map((config): TitleWeakRecognitionRule => ({
    ruleId: `alias_${config.stableCode}`,
    signalType: 'standard_work_hint',
    code: `${config.stableCode}_alias`,
    standardWorkCodes: [config.stableCode],
    label: config.label,
    keywords: [...config.keywords],
    aliases: [...config.aliases],
    confidence: 'low',
    source: 'template_seed_alias',
    templateSeedReferences: ['managed-frontier-default-master-plan', 'standard_work_duration_seed'],
    effectPolicy: { ...noBaseDaysPolicy, canInferStandardWork: true },
  })),
]

export const TITLE_WEAK_SCOPE_RULES: TitleWeakRecognitionRule[] = [
  {
    ruleId: 'scope_title_floor_or_building',
    signalType: 'scope_hint',
    code: 'title_scope_range',
    label: '标题范围词',
    keywords: ['全部', '整体', '整栋', '整层', '所有', '全楼', '全区', '各栋', '各层', '局部', '试做', '样板', '部分'],
    confidence: 'low',
    source: 'row_name_suggestion',
    templateSeedReferences: ['engineering_objects', 'v1.4.18 task scale proxy'],
    effectPolicy: lowScalePolicy,
  },
]

export const TITLE_WEAK_RECOGNITION_RULES: TitleWeakRecognitionRule[] = [
  ...TITLE_WEAK_STANDARD_WORK_ALIAS_RULES,
  ...TITLE_WEAK_ELEMENT_VARIANT_RULES,
  ...TITLE_WEAK_METHOD_VARIANT_RULES,
  ...TITLE_WEAK_SCOPE_RULES,
]

export const TITLE_WEAK_RECOGNITION_ALGORITHM_SEED_META = {
  seedVersion: 'v1.4.7.2-title-weak-recognition-20260517',
  seedScope: 'algorithm_auxiliary',
  sourceStandards: [
    'v1.4.7.2 standard work catalog',
    'v1.4.18 standard work duration seed',
  ],
  expectedCounts: { records: TITLE_WEAK_RECOGNITION_RULES.length },
  evidenceSources: [
    { key: 'v1472_standard_catalog', source: 'server/src/seeds/chinaGb50300TemplateCatalog.ts' },
    { key: 'v1472_domain_catalogs', source: 'server/src/seeds/domainWbsTemplateCatalogs.ts' },
    { key: 'v1418_standard_duration', source: 'server/src/seeds/standardWorkDurationSeed.ts' },
  ],
  generationPolicy: 'source_backed_auto_upgrade; source_backed_no_generic_generation; no_duration_authority',
  webVerified: true,
  reviewNeeded: false,
} as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

const FULL_WIDTH_SPACE = /\u3000/g
const STATUS_TAG_PATTERN = /[\u3010\[(\uff08(]\s*(?:已完成|完成|进行中|待开始|未开始|暂停|返工|整改|计划|实际|今日|本周|本月)\s*[\u3011\])\uff09)]/g
const LEADING_LIST_CODE_PATTERN = /^\s*(?:(?:[A-Za-z]?\d+(?:[.\-_]\d+)+)|(?:[一二三四五六七八九十]+))\s*[\u3001.)\uff09\]-_:\uff1a]?\s*/g
const LEADING_SIMPLE_CODE_PATTERN = /^\s*[A-Za-z]?\d+\s+[\u3001.)\uff09\]-_:\uff1a]?\s*/g

export const TITLE_WEAK_PLACEHOLDER_TITLE_PATTERNS = [
  /^\s*$/,
  /^T[-_ ]?\d+$/i,
  /^T[-_ ]?\d+\s+(?:process|summary|task)$/i,
  /^任务\s*\d*$/,
  /^新任务$/,
  /^未命名$/,
  /^待编辑$/,
  /^测试任务$/,
  /^占位任务$/,
]

export const TITLE_WEAK_NON_CONSTRUCTION_KEYWORDS = [
  '项目周会',
  '周会',
  '例会',
  '纪要',
  '合同评审',
  '合同',
  '付款',
  '请款',
  '报销',
  '工资',
  '考勤',
  '材料询价',
  '材料封样',
  '材料样品确认',
  '询价',
  '招标',
  '投标',
  '商务谈判',
  '图纸会审',
  '方案评审',
  '培训',
  '行政',
]

export const TITLE_WEAK_CONSTRUCTION_DOCUMENT_ALLOW_KEYWORDS = [
  '竣工资料',
  '资料归档',
  '工程资料归档',
  '验收资料',
  '专项验收资料',
  '竣工档案',
  '移交资料',
  '交付资料',
]

export const TITLE_WEAK_NOISE_PREFIX_KEYWORDS = [
  '土建',
  '机电',
  '水电',
  '精装',
  '装饰',
  '幕墙',
  '消防',
  '智能化',
  '景观',
  '市政',
]

const TITLE_WEAK_LOCATION_PREFIX_PATTERN = /^(?:(?:[A-Za-z]?\d+#?(?:楼|栋|号楼|单元)?)|(?:[A-Za-z]区)|(?:地上|地下)?\d+层|(?:-?\d+F)|B\d+|地下室|地库|车库|屋面|首层|标准层|户内|公区|室内|室外|东区|西区|南区|北区|样板段|施工段)\s*/i

function uniqueTokens(value: string) {
  return Array.from(new Set(value.split(/[\s,，、/|;；:：()（）\[\]【】]+/).map(normalizeText).filter(Boolean)))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeUnicodeText(value: unknown) {
  return normalizeText(value)
    .normalize('NFKC')
    .replace(FULL_WIDTH_SPACE, ' ')
}

function normalizeConstructionSynonyms(value: string) {
  return value
    .replace(/砼/g, '混凝土')
    .replace(/浇砼|打灰|浇捣/g, '混凝土浇筑')
    .replace(/钢混|RC/gi, '钢筋混凝土')
    .replace(/扎筋/g, '钢筋绑扎')
    .replace(/绑筋/g, '钢筋绑扎')
    .replace(/支模|立模/g, '模板')
    .replace(/二结构|二构/g, '二次结构')
    .replace(/砌墙|砌砖|砌块/g, '砌筑')
    .replace(/外架|落地架|悬挑架|爬架/g, '脚手架')
    .replace(/瓦工贴砖|瓦工铺砖|泥工贴砖|泥工铺砖|泥水工贴砖|泥水工铺砖/g, '瓷砖铺贴')
    .replace(/瓦工砌墙|瓦工砌筑|泥工砌墙|泥工砌筑|泥水工砌墙|泥水工砌筑/g, '砌筑')
    .replace(/油工刷漆|油工喷漆|油工涂料|油工乳胶漆|油工/g, '涂饰')
    .replace(/木工支模|木工配模|木工模板/g, '模板')
    .replace(/刮腻子|批腻子|大白/g, '腻子')
    .replace(/贴砖|镶贴/g, '瓷砖铺贴')
    .replace(/乳胶漆|内墙漆|油漆/g, '涂饰')
    .replace(/天花|顶棚/g, '吊顶')
    .replace(/自粘卷材|SBS|TPO/g, '防水卷材')
    .replace(/PVC防水|PVC卷材/gi, '防水卷材')
    .replace(/水暖电/g, '水电')
    .replace(/MEP|M&E/gi, '机电')
    .replace(/强弱电/g, '强电 弱电')
    .replace(/精装修|二次装修/g, '精装')
    .replace(/打压/g, '压力试验')
    .replace(/灌水(?!试验|测试|检查)/g, '灌水试验')
    .replace(/通球(?!试验)/g, '通球试验')
    .replace(/水稳层|水稳(?=层|施工|摊铺|拌合|铺筑)/g, '水泥稳定碎石')
}

function stripProjectPrefix(value: string) {
  const parts = value.split(/\s*[-–—]\s*/).map(normalizeText).filter(Boolean)
  if (parts.length < 2) return value
  const [first, ...rest] = parts
  if (/(项目|工程|广场|花园|地块|标段|总包|施工总承包)/.test(first) && rest.join('').length >= 2) {
    return rest.join(' ')
  }
  return value
}

export function extractTitleWeakSemanticText(value: unknown) {
  let text = sanitizeTitleWeakRecognitionText(value)
  text = stripProjectPrefix(text)
  for (const prefix of TITLE_WEAK_NOISE_PREFIX_KEYWORDS) {
    text = text.replace(new RegExp(`^${escapeRegExp(prefix)}\\s*[-:：]?\\s*`), ' ')
  }
  let previous = ''
  while (previous !== text) {
    previous = text
    text = text.replace(TITLE_WEAK_LOCATION_PREFIX_PATTERN, ' ')
  }
  return text.replace(/\s+/g, ' ').trim()
}

export function getTitleWeakRecognizability(value: unknown): TitleWeakRecognizability {
  const normalizedText = sanitizeTitleWeakRecognitionText(value)
  const semanticText = extractTitleWeakSemanticText(normalizedText)
  if (!normalizedText) {
    return { recognizable: false, reason: 'empty_title', normalizedText, semanticText }
  }
  if (TITLE_WEAK_PLACEHOLDER_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedText))) {
    return { recognizable: false, reason: 'placeholder_or_code_only_title', normalizedText, semanticText }
  }
  const normalizedLower = normalizedText.toLowerCase()
  if (findTitleWeakNonConstructionKeyword(normalizedLower)) {
    return { recognizable: false, reason: 'non_construction_or_management_title', normalizedText, semanticText }
  }
  if (!semanticText || semanticText.length < 2) {
    return { recognizable: false, reason: 'semantic_title_too_short', normalizedText, semanticText }
  }
  return { recognizable: true, reason: 'recognizable', normalizedText, semanticText }
}

export function isTitleWeakRecognizableTitle(value: unknown) {
  return getTitleWeakRecognizability(value).recognizable
}

function cleanTitleWeakRecognitionText(value: unknown, applyConstructionSynonyms: boolean) {
  const normalized = normalizeUnicodeText(value)
  const source = applyConstructionSynonyms ? normalizeConstructionSynonyms(normalized) : normalized
  return source
    .replace(LEADING_LIST_CODE_PATTERN, ' ')
    .replace(LEADING_SIMPLE_CODE_PATTERN, ' ')
    .replace(/\b20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\b/g, ' ')
    .replace(/\b\d{1,2}[-/.月]\d{1,2}日?\b/g, ' ')
    .replace(/\b\d{1,3}(?:\.\d+)?\s*%/g, ' ')
    .replace(/\bC\d{2,3}\b/gi, ' ')
    .replace(/\bP\d+\b/gi, ' ')
    .replace(STATUS_TAG_PATTERN, ' ')
    .replace(/^\s*(?:计划|实际|今日|本周|本月|开始|完成|已完成|进行中|待开始|未开始|暂停|返工|整改)\s*[：:、-]?\s*/g, ' ')
    .replace(/[;；，、\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeTitleWeakRecognitionText(value: unknown) {
  return cleanTitleWeakRecognitionText(value, true)
}

function sanitizeTitleWeakOriginalText(value: unknown) {
  return cleanTitleWeakRecognitionText(value, false)
}

function uniqueStringArray(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function includesAny(text: string, keywords: string[] = []) {
  const normalized = sanitizeTitleWeakRecognitionText(text).toLowerCase()
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword).toLowerCase()))
}

function isTitleWeakConstructionDocumentAllowed(normalizedLower: string) {
  return TITLE_WEAK_CONSTRUCTION_DOCUMENT_ALLOW_KEYWORDS.some((keyword) => (
    normalizedLower.includes(keyword.toLowerCase())
  ))
}

function findTitleWeakNonConstructionKeyword(normalizedLower: string) {
  if (isTitleWeakConstructionDocumentAllowed(normalizedLower)) return null
  return TITLE_WEAK_NON_CONSTRUCTION_KEYWORDS.find((keyword) => normalizedLower.includes(keyword.toLowerCase())) ?? null
}

function titleWeakSearchCorpus(text: string) {
  const recognizable = getTitleWeakRecognizability(text)
  return {
    ...recognizable,
    corpus: uniqueStringArray([
      recognizable.normalizedText,
      recognizable.semanticText,
      ...uniqueTokens(recognizable.semanticText),
    ]).join(' ').toLowerCase(),
  }
}

function normalizePatternText(value: unknown) {
  return normalizeConstructionSynonyms(normalizeUnicodeText(value)).toLowerCase()
}

function keywordHitScore(corpus: string, terms: string[] = [], baseScore: number, quality: TitleWeakRecognitionMatchQuality) {
  const matchedTerms = uniqueStringArray(terms).filter((term) => {
    const normalizedTerm = normalizePatternText(term)
    return normalizedTerm.length >= 2 && corpus.includes(normalizedTerm)
  })
  if (matchedTerms.length === 0) return null
  const score = Math.min(0.92, baseScore + Math.max(0, matchedTerms.length - 1) * 0.04)
  return { score, quality, matchedTerms }
}

function synonymGroupHitScore(corpus: string, groups: string[][] = []) {
  const matchedTerms: string[] = []
  let matchedGroupCount = 0
  for (const group of groups) {
    const groupHits = uniqueStringArray(group).filter((term) => corpus.includes(normalizePatternText(term)))
    if (groupHits.length === 0) continue
    matchedGroupCount += 1
    matchedTerms.push(...groupHits)
  }
  if (matchedGroupCount === 0) return null
  return {
    score: Math.min(0.82, TITLE_WEAK_MATCHING_POLICY.score.tokenComboBase + (matchedGroupCount - 1) * TITLE_WEAK_MATCHING_POLICY.score.tokenComboBonus),
    quality: 'token_combo' as const,
    matchedTerms: uniqueStringArray(matchedTerms),
  }
}

function titleWeakMinScore(rule: TitleWeakRecognitionRule) {
  if (typeof rule.minMatchScore === 'number' && Number.isFinite(rule.minMatchScore)) return rule.minMatchScore
  if (rule.signalType === 'standard_work_hint') return TITLE_WEAK_MATCHING_POLICY.minScore.standardWorkHint
  if (rule.signalType === 'element_variant_hint') return TITLE_WEAK_MATCHING_POLICY.minScore.elementVariantHint
  if (rule.signalType === 'scope_hint') return TITLE_WEAK_MATCHING_POLICY.minScore.scopeHint
  return TITLE_WEAK_MATCHING_POLICY.minScore.methodVariantHint
}

export function matchTitleWeakRecognitionRule(text: string, rule: TitleWeakRecognitionRule): TitleWeakRecognitionMatch {
  const input = titleWeakSearchCorpus(text)
  if (!input.recognizable) {
    return {
      matched: false,
      score: 0,
      quality: 'unrecognizable',
      reason: input.reason,
      normalizedText: input.normalizedText,
      semanticText: input.semanticText,
      matchedTerms: [],
    }
  }

  const negativeTerms = [
    ...(isTitleWeakConstructionDocumentAllowed(input.normalizedText.toLowerCase()) ? [] : TITLE_WEAK_NON_CONSTRUCTION_KEYWORDS),
    ...(rule.negativeKeywords ?? []),
  ]
  const excludedByKeyword = negativeTerms.find((keyword) => input.corpus.includes(normalizePatternText(keyword)))
  if (excludedByKeyword) {
    return {
      matched: false,
      score: 0,
      quality: 'excluded',
      reason: 'negative_keyword',
      normalizedText: input.normalizedText,
      semanticText: input.semanticText,
      matchedTerms: [],
      excludedBy: excludedByKeyword,
    }
  }

  for (const patternText of rule.exclusionPatterns ?? []) {
    try {
      const pattern = new RegExp(patternText, 'i')
      if (pattern.test(input.corpus)) {
        return {
          matched: false,
          score: 0,
          quality: 'excluded',
          reason: 'exclusion_pattern',
          normalizedText: input.normalizedText,
          semanticText: input.semanticText,
          matchedTerms: [],
          excludedBy: patternText,
        }
      }
    } catch {
      // Invalid override patterns should not break task saving; seed validation catches them separately.
    }
  }

  const candidates = [
    keywordHitScore(input.corpus, rule.aliases ?? [], TITLE_WEAK_MATCHING_POLICY.score.exactAlias, 'exact_alias'),
    keywordHitScore(input.corpus, rule.keywords, TITLE_WEAK_MATCHING_POLICY.score.keywordPhrase, 'keyword_phrase'),
    synonymGroupHitScore(input.corpus, rule.synonymGroups ?? []),
    keywordHitScore(input.corpus, [rule.label], TITLE_WEAK_MATCHING_POLICY.score.labelHint, 'label_hint'),
  ].filter((item): item is { score: number; quality: TitleWeakRecognitionMatchQuality; matchedTerms: string[] } => Boolean(item))

  candidates.sort((left, right) => right.score - left.score)
  const best = candidates[0]
  if (!best || best.score < titleWeakMinScore(rule)) {
    return {
      matched: false,
      score: best?.score ?? 0,
      quality: best?.quality ?? 'no_match',
      reason: best ? 'below_min_match_score' : 'no_positive_term',
      normalizedText: input.normalizedText,
      semanticText: input.semanticText,
      matchedTerms: best?.matchedTerms ?? [],
    }
  }

  return {
    matched: true,
    score: Math.round(best.score * 100) / 100,
    quality: best.quality,
    reason: 'matched',
    normalizedText: input.normalizedText,
    semanticText: input.semanticText,
    matchedTerms: best.matchedTerms,
  }
}

function standardWorkAliasMatches(text: string, rule: TitleWeakRecognitionRule) {
  return matchTitleWeakRecognitionRule(text, rule).matched
}

function orderStandardWorkCodesByTitleContext(
  codes: string[] = [],
  text: string,
  contextKeywordsByStandardWorkCode?: Record<string, string[]>,
) {
  const normalized = sanitizeTitleWeakRecognitionText(text).toLowerCase()
  if (!normalized || !contextKeywordsByStandardWorkCode) return codes
  return [...codes].sort((a, b) => {
    const scoreA = countTitleContextHits(normalized, contextKeywordsByStandardWorkCode[a] ?? [])
    const scoreB = countTitleContextHits(normalized, contextKeywordsByStandardWorkCode[b] ?? [])
    return scoreB - scoreA
  })
}

function countTitleContextHits(normalizedText: string, keywords: string[] = []) {
  return uniqueStringArray(keywords).reduce((count, keyword) => (
    normalizedText.includes(normalizeText(keyword).toLowerCase()) ? count + 1 : count
  ), 0)
}

export function supportsTitleWeakElementVariantExpansion(text: string) {
  return includesAny(text, TITLE_WEAK_PROCESS_CONTEXT_KEYWORDS)
}

export function resolveTitleWeakElementVariant(
  code: string,
  source: TitleWeakElementVariant['source'] = 'explicit_engineering_feature',
  confidence: TitleWeakRecognitionConfidence = 'high',
): TitleWeakElementVariant | null {
  const normalized = normalizeText(code).toLowerCase()
  const rule = TITLE_WEAK_ELEMENT_VARIANT_RULES.find((item) => item.code === normalized)
  if (!rule) return null
  return { code: normalized, label: rule.label, source, confidence }
}

export function inferTitleWeakElementVariantSuggestion(text: string): TitleWeakElementVariant | null {
  if (!supportsTitleWeakElementVariantExpansion(text)) return null
  for (const rule of TITLE_WEAK_ELEMENT_VARIANT_RULES) {
    if (includesAny(text, rule.keywords)) {
      const applicable = rule.applicableProcessKeywords?.length
        ? includesAny(text, rule.applicableProcessKeywords)
        : true
      if (!applicable) continue
      return resolveTitleWeakElementVariant(rule.code, 'row_name_suggestion', 'low')
    }
  }
  return null
}

export function resolveTitleWeakMethodVariant(
  code: string,
  source: TitleWeakMethodVariant['source'] = 'explicit_engineering_feature',
  confidence: TitleWeakRecognitionConfidence = 'high',
): TitleWeakMethodVariant | null {
  const normalized = normalizeText(code).toLowerCase()
  const rule = TITLE_WEAK_METHOD_VARIANT_RULES.find((item) => item.code === normalized)
  if (!rule) return null
  return { code: normalized, label: rule.label, source, confidence }
}

export function inferTitleWeakMethodVariantSuggestions(text: string): TitleWeakMethodVariant[] {
  const normalized = sanitizeTitleWeakRecognitionText(text)
  if (!getTitleWeakRecognizability(normalized).recognizable) return []
  return TITLE_WEAK_METHOD_VARIANT_RULES.flatMap((rule) => {
    const match = matchTitleWeakRecognitionRule(normalized, rule)
    if (!match.matched) return []
    const applicable = rule.applicableProcessKeywords?.length
      ? includesAny(normalized, rule.applicableProcessKeywords)
      : true
    if (!applicable) return []
    const suggestion = resolveTitleWeakMethodVariant(rule.code, 'row_name_suggestion', 'low')
    return suggestion ? [suggestion] : []
  })
}

export function expandTitleWeakStandardWorkSearchText(text: string) {
  const original = sanitizeTitleWeakOriginalText(text)
  const normalized = sanitizeTitleWeakRecognitionText(text)
  if (!getTitleWeakRecognizability(normalized).recognizable) return ''
  const aliases = TITLE_WEAK_STANDARD_WORK_ALIAS_RULES.flatMap((rule) => (
    standardWorkAliasMatches(normalized, rule) ? [rule.label, ...(rule.aliases ?? [])] : []
  ))
  return uniqueStringArray([original, normalized, ...aliases]).join(' ')
}

export function inferTitleWeakStandardWorkMatches(text: string) {
  const normalized = sanitizeTitleWeakRecognitionText(text)
  if (!getTitleWeakRecognizability(normalized).recognizable) return []
  const matches = TITLE_WEAK_STANDARD_WORK_ALIAS_RULES.flatMap((rule, ruleIndex) => {
    const match = matchTitleWeakRecognitionRule(normalized, rule)
    if (!match.matched) return []
    return orderStandardWorkCodesByTitleContext(
      rule.standardWorkCodes ?? [],
      normalized,
      rule.contextKeywordsByStandardWorkCode,
    ).map((standardWorkCode, codeIndex) => ({
      standardWorkCode,
      score: match.score,
      quality: match.quality,
      ruleId: rule.ruleId,
      seedCode: rule.code,
      confidence: rule.confidence,
      matchedTerms: match.matchedTerms,
      reason: match.reason,
      ruleIndex,
      codeIndex,
    }))
  })
  const byCode = new Map<string, typeof matches[number]>()
  for (const match of matches) {
    const existing = byCode.get(match.standardWorkCode)
    if (!existing || match.score > existing.score || (match.score === existing.score && match.ruleIndex < existing.ruleIndex)) {
      byCode.set(match.standardWorkCode, match)
    }
  }
  return [...byCode.values()]
    .sort((left, right) => right.score - left.score || left.ruleIndex - right.ruleIndex || left.codeIndex - right.codeIndex)
}

export function inferTitleWeakStandardWorkCodes(text: string) {
  return inferTitleWeakStandardWorkMatches(text).map((match) => match.standardWorkCode)
}

function inferCountFromTitle(title: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (!match) continue
    const from = Number(match[1])
    const to = Number(match[2])
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) return to - from + 1
  }
  return null
}

export function inferTitleWeakScaleSignal(text: string): TitleWeakScaleSignal {
  const normalized = sanitizeTitleWeakRecognitionText(text).toLowerCase()
  const explicitBuildings = inferCountFromTitle(normalized, [
    /(\d+)\s*#?\s*(?:\u697c|\u680b|\u53f7\u697c)?\s*[-~\u81f3\u5230]\s*(\d+)\s*#?\s*(?:\u697c|\u680b|\u53f7\u697c)?/,
  ])
  const explicitFloors = inferCountFromTitle(normalized, [
    /(\d+)\s*(?:f|\u5c42)\s*[-~\u81f3\u5230]\s*(\d+)\s*(?:f|\u5c42)/i,
  ])
  if (explicitBuildings && explicitBuildings >= 2) {
    const factor = explicitBuildings >= 4 ? 1.3 : 1.15
    return { factor, reason: '\u6807\u9898\u663e\u793a\u8986\u76d6\u7ea6 ' + explicitBuildings + ' \u680b\u697c', source: 'title', confidence: 'low', signals: ['buildingRange=' + explicitBuildings] }
  }
  if (explicitFloors && explicitFloors >= 2) {
    const factor = explicitFloors >= 8 ? 1.3 : explicitFloors >= 4 ? 1.2 : 1.1
    return { factor, reason: '\u6807\u9898\u663e\u793a\u8986\u76d6\u7ea6 ' + explicitFloors + ' \u5c42', source: 'title', confidence: 'low', signals: ['floorRange=' + explicitFloors] }
  }

  if (/(\u5168\u90e8|\u6574\u4f53|\u6574\u680b|\u6574\u5c42|\u6240\u6709|\u5168\u697c|\u5168\u533a|\u5404\u680b|\u5404\u5c42)/.test(normalized)) {
    return { factor: 1.25, reason: '\u6807\u9898\u663e\u793a\u4e3a\u6574\u4f53\u6216\u5168\u90e8\u8303\u56f4', source: 'title', confidence: 'low', signals: ['overallScope'] }
  }
  if (/(\u5c40\u90e8|\u8bd5\u505a|\u6837\u677f|\u90e8\u5206|\u9996\u5c42|\u4e00\u6237|\u9996\u6279)/.test(normalized)) {
    return { factor: 0.85, reason: '\u6807\u9898\u663e\u793a\u4e3a\u5c40\u90e8\u6216\u6837\u677f\u8303\u56f4', source: 'title', confidence: 'low', signals: ['partialScope'] }
  }
  return { factor: 1, reason: null, source: 'title', confidence: 'low', signals: [] }
}
