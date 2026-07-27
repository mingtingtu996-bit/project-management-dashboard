// v1.4.22.1 section 6.2: frontend feature data aligned with backend featureToItemPackMap.
export interface FeatureItem {
  code: string
  label: string
  description: string
  hasNumeric: boolean
  numericDefault?: number
  businessTypes?: string[]
  methodVariantCodes?: string[]
  externalConstraint?: boolean
}

export interface FeatureCategory {
  tier: 'required' | 'recommended' | 'optional'
  label: string
  items: FeatureItem[]
}

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    tier: 'required',
    label: '必选确认',
    items: [
      { code: 'hasCivilDefense', label: '人防工程', description: '人防实体施工与专项验收', hasNumeric: false },
    ],
  },
  {
    tier: 'recommended',
    label: '常用特征',
    items: [
      { code: 'has_helipad', label: '屋顶停机坪', description: '屋顶停机坪与航空适航移交', hasNumeric: false, businessTypes: ['hospital', 'hotel'] },
      { code: 'has_pool', label: '泳池', description: '泳池土建、机电与精装范围', hasNumeric: true, numericDefault: 1, businessTypes: ['hotel', 'general_civil'] },
      { code: 'has_central_kitchen', label: '中央厨房', description: '厨房设施与食品安全验收', hasNumeric: false, businessTypes: ['hotel', 'school', 'general_civil'] },
      { code: 'near_metro', label: '临近运营地铁', description: '运营地铁接口与保护距离', hasNumeric: true, numericDefault: 10, externalConstraint: true },
      { code: 'near_heritage', label: '临近文保建筑', description: '文保保护接口与保护距离', hasNumeric: true, numericDefault: 20, externalConstraint: true },
      { code: 'near_high_voltage', label: '临近高压线塔', description: '高压线塔保护接口与距离', hasNumeric: true, numericDefault: 15, externalConstraint: true },
      { code: 'green_building', label: '绿色建筑', description: '绿色建筑或近零能耗等级', hasNumeric: true, numericDefault: 1 },
      { code: 'large_span', label: '大跨度', description: '大跨度结构 (m)', hasNumeric: true, numericDefault: 60, businessTypes: ['transportation_hub', 'sports_culture', 'industrial', 'general_civil'] },
      { code: 'supportHeightM', label: '高支模', description: '高支模高度 (m)', hasNumeric: true, numericDefault: 8, businessTypes: ['transportation_hub', 'sports_culture', 'industrial', 'general_civil'] },
      { code: 'composite_structure', label: '组合结构', description: '钢管混凝土或型钢混凝土', hasNumeric: false, methodVariantCodes: ['steel_frame'] },
      { code: 'prefabRate', label: '装配率', description: '装配式混凝土装配率 (%)', hasNumeric: true, numericDefault: 30, methodVariantCodes: ['precast_concrete'] },
    ],
  },
  {
    tier: 'recommended',
    label: '基础与基坑',
    items: [
      { code: 'deep_pit', label: '深基坑', description: '基坑开挖深度，进入现有 foundationDepthM 判断链路 (m)', hasNumeric: true, numericDefault: 10 },
      { code: 'basementLevelCount', label: '地下层数', description: '地下室层数，用于基坑、防水和组织方案判断', hasNumeric: true, numericDefault: 2 },
      { code: 'basementAreaM2', label: '地下面积', description: '地下建筑面积 (m²)，用于大地下室和工序组织判断', hasNumeric: true, numericDefault: 8000 },
      { code: 'pile_foundation', label: '桩基工程', description: '桩基施工、检测与承台移交范围', hasNumeric: false },
      { code: 'foundation_dewatering', label: '降排水', description: '基坑降排水、回灌和地下水控制', hasNumeric: false },
      { code: 'foundation_monitoring', label: '基坑监测', description: '支护、沉降、邻近保护和自动化监测', hasNumeric: false },
      { code: 'soft_soil', label: '软土地基', description: '软土地基处理', hasNumeric: false },
      { code: 'rock_foundation', label: '岩石地基', description: '岩石地基处理', hasNumeric: false },
      { code: 'diaphragm_wall', label: '地下连续墙', description: '地下连续墙工程', hasNumeric: false },
    ],
  },
  {
    tier: 'optional',
    label: '专项补充',
    items: [
      { code: 'has_spa', label: 'SPA 水疗', description: 'SPA 区域精装与给排水范围', hasNumeric: false, businessTypes: ['hotel'] },
      { code: 'commercial_arcade', label: '商业街区', description: '混合商业街区范围', hasNumeric: false, businessTypes: ['general_civil', 'tod_upper_cover'] },
      { code: 'has_or', label: '手术部', description: '手术部与洁净机电专项', hasNumeric: true, numericDefault: 6, businessTypes: ['hospital'] },
      { code: 'has_medical_gas', label: '医用气体', description: '医用气体系统', hasNumeric: false, businessTypes: ['hospital'] },
      { code: 'has_linac', label: '直线加速器机房', description: '直线加速器机房防护与安装', hasNumeric: true, numericDefault: 1, businessTypes: ['hospital'] },
      { code: 'has_mri', label: 'MRI 机房', description: 'MRI 屏蔽与精装', hasNumeric: true, numericDefault: 1, businessTypes: ['hospital'] },
      { code: 'has_bsl2', label: 'BSL-2 实验室', description: '二级生物安全实验室', hasNumeric: false, businessTypes: ['hospital', 'industrial'] },
      { code: 'has_hbo_chamber', label: '高压氧舱', description: '高压氧舱专项安装与安全验收', hasNumeric: false, businessTypes: ['hospital'] },
      { code: 'tier_level', label: '数据中心 Tier 等级', description: '数据中心 Tier III/IV', hasNumeric: true, numericDefault: 3, businessTypes: ['data_center'] },
      { code: 'dual_utility_power', label: '双路市电', description: '双路市电与 N+1 切换', hasNumeric: false, businessTypes: ['data_center'] },
      { code: 'has_dcim', label: 'DCIM 管理系统', description: '数据中心基础设施管理系统', hasNumeric: false, businessTypes: ['data_center'] },
      { code: 'cabinet_density', label: '机柜功率密度', description: '单柜功率密度 (kW)', hasNumeric: true, numericDefault: 10, businessTypes: ['data_center'] },
      { code: 'data_center_size', label: '机柜规模', description: '数据中心机柜总量', hasNumeric: true, numericDefault: 100, businessTypes: ['data_center'] },
      { code: 'cleanroom_grade', label: '洁净等级', description: '洁净等级与 DQ/IQ/OQ/PQ', hasNumeric: true, numericDefault: 10000, businessTypes: ['industrial', 'hospital'] },
      { code: 'explosion_proof', label: '防爆等级', description: '防爆区域等级', hasNumeric: true, numericDefault: 1, businessTypes: ['industrial'] },
      { code: 'process_pure_water', label: '工艺纯水', description: '工艺纯水制备与循环系统', hasNumeric: true, numericDefault: 10, businessTypes: ['industrial', 'hospital'] },
      { code: 'voc_treatment', label: 'VOC 废气治理', description: '有机废气收集与治理系统', hasNumeric: false, businessTypes: ['industrial'] },
      { code: 'chemical_waste', label: '化学废液处理', description: '化学废液收集、暂存与处理系统', hasNumeric: true, numericDefault: 1, businessTypes: ['industrial'] },
      { code: 'heritage_level', label: '文保等级', description: '国家/省/市级或历史街区', hasNumeric: true, numericDefault: 3, businessTypes: ['renovation'] },
      { code: 'seismic_retrofit_level', label: '抗震加固等级', description: '抗震加固等级', hasNumeric: true, numericDefault: 2, businessTypes: ['renovation'] },
      { code: 'occupied_renovation', label: '不停业/不停产改造', description: '局部运营连续条件下改造', hasNumeric: false, businessTypes: ['renovation'] },
      { code: 'existing_structure_year', label: '既有结构年代', description: '既有建筑建造年份，用于改造加固判断', hasNumeric: true, numericDefault: 2000, businessTypes: ['renovation'] },
      { code: 'integral_lifting', label: '整体提升', description: '大跨度整体提升', hasNumeric: true, numericDefault: 60, businessTypes: ['transportation_hub', 'sports_culture'] },
      { code: 'shm_monitoring', label: '结构健康监测', description: '大跨度或复杂结构健康监测系统', hasNumeric: false, businessTypes: ['transportation_hub', 'sports_culture', 'general_civil'] },
      { code: 'ptfe_membrane', label: 'PTFE 膜结构', description: 'PTFE 膜结构', hasNumeric: true, numericDefault: 5000, businessTypes: ['sports_culture', 'transportation_hub'] },
      { code: 'transport_interface', label: '交通运营接口', description: '高铁、机场、赛事等运营接口约束', hasNumeric: false, businessTypes: ['transportation_hub', 'sports_culture', 'tod_upper_cover'] },
      { code: 'three_level_isolation', label: '三级减振隔振', description: 'TOD 三级减振隔振', hasNumeric: false, businessTypes: ['tod_upper_cover'] },
      { code: 'non_stop_operation', label: '运营接口 / 不停运施工', description: '运营交通约束下施工', hasNumeric: false, businessTypes: ['tod_upper_cover', 'transportation_hub'], externalConstraint: true },
      { code: 'noise_dual_control', label: '噪声双控', description: '运营交通或敏感区噪声控制要求', hasNumeric: false, businessTypes: ['tod_upper_cover', 'transportation_hub'], externalConstraint: true },
    ],
  },
]
