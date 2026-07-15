import type { WbsTemplateCatalogGroup } from './domainWbsTemplateCatalogs.js'

export type WbsTemplateGoldenProjectCase = {
  caseCode: string
  label: string
  projectType: string
  requiredGroups: WbsTemplateCatalogGroup[]
  expectedSpecialtyKeywords?: string[]
  expectedManagementKeywords?: string[]
  expectedDangerKeywords?: string[]
  maxRecommendedRows?: number
  rationale: string
}

export type WbsTemplateGoldenCaseKeywordExpectation = {
  expectationCode: string
  label: string
  keywords: string[]
  minMatchedProcessCount: number
  rationale: string
}

export type WbsTemplateGoldenCaseExpectedOutput = {
  requiredKeywordGroups: WbsTemplateGoldenCaseKeywordExpectation[]
  expectedPlanItemKinds: string[]
  expectedTriggerAssertions: string[]
  duplicateSuppressionAssertions: string[]
  acceptanceProjectionAssertions: string[]
  evidenceAssertions: string[]
}

export type WbsTemplateApplicabilityProfile = {
  projectType: string
  label: string
  requiredGroups: WbsTemplateCatalogGroup[]
  recommendedSpecialtyKeywords: string[]
  excludedSpecialtyKeywords?: string[]
  triggerKeywords: string[]
  rationale: string
}

export type WbsTemplateProjectApplicabilityPlaybook = {
  defaultScenario: 'complete_suite' | 'main_plus_required_support' | 'custom_recommended'
  groupSelection: Partial<Record<WbsTemplateCatalogGroup, 'all' | 'auto_by_trigger' | 'by_project_type' | 'recommended' | 'optional'>>
  requiredFeatureFields: string[]
  recommendationRules: Array<{
    ruleCode: string
    when: string
    then: string
    rationale: string
  }>
  greyOutRules: Array<{
    keyword: string
    reason: string
  }>
  acceptanceMilestoneKeywords: string[]
  evidenceFocusKeywords: string[]
}

export type WbsTemplateMethodVariantProfile = {
  methodVariantCode: string
  label: string
  triggerKeywords: string[]
  applicableCatalogGroups: WbsTemplateCatalogGroup[]
  preferredTemplateKeywords: string[]
  rationale: string
}

export type WbsTemplateMethodVariantPlaybook = {
  recommendationMode: 'include_supporting_pack' | 'replace_core_when_selected' | 'trigger_control_pack' | 'review_only'
  recommendedActions: Array<{
    action: 'include' | 'replace_core' | 'trigger_danger' | 'require_confirmation' | 'evidence_focus'
    targetKeywords: string[]
    rationale: string
  }>
  controlCheckpoints: string[]
  evidenceKeywords: string[]
  notAutoExpandedBecause: string
}

export type WbsTemplateSemanticRiskBucket = {
  bucketCode: string
  label: string
  priority: 'P0' | 'P1' | 'P2'
  keywords: string[]
  expectedDurationContributionMode: string
  expectedExecutionNatures: string[]
  expectedControlRoles: string[]
  rationale: string
}

export type WbsTemplateEvidenceQualityPolicy = {
  policyCode: string
  label: string
  matchKeywords: string[]
  requiredEvidenceLevels: string[]
  preferredEvidenceLevels: string[]
  requiredDeliverables: string[]
  preferredDeliverables: string[]
  responsibleParties: string[]
  completionSignals: string[]
  upgradeCandidateSignals: string[]
  rationale: string
}

export type WbsTemplateFeedbackCandidatePolicy = {
  candidateCode: string
  label: string
  sourceSignals: string[]
  promotionGate: string
  targetGovernanceArea: 'semantic_override' | 'applicability_matrix' | 'replacement_suppression' | 'depth_precision' | 'title_mapping'
  minimumSampleSize: number
  confidenceThreshold: number
  candidateOutput: string
  quarantineConditions: string[]
  negativeSignals: string[]
  reviewCadence: string
}

export type WbsTemplateGoldenCaseStableCodeExpectation = {
  caseCode: string
  requiredTemplateIds: string[]
  requiredStableCodes: string[]
  requiredStableCodePrefixes: string[]
  duplicateSuppressionCodes?: string[]
  acceptanceProjectionCodes?: string[]
  rationale: string
}

export type WbsTemplateGoldenCaseStrongAssertion = {
  caseCode: string
  semanticChecks: Array<{
    stableCode: string
    metadataField: 'planItemKind' | 'durationContributionMode' | 'executionNature'
    expectedValue: string
  }>
  evidenceRefChecks: Array<{
    stableCode: string
    evidenceCode: string
  }>
  rationale: string
}

export type WbsTemplateProjectTemplateCombination = {
  projectType: string
  requiredTemplateIds: string[]
  recommendedTemplateIds: string[]
  conditionalTemplateRules: Array<{
    ruleCode: string
    when: string
    includeTemplateIds: string[]
    requireStableCodePrefixes: string[]
    rationale: string
  }>
  greyOutTemplateIds: string[]
  rationale: string
}

export type WbsTemplateProjectScenarioCombination = {
  scenarioCode: string
  projectType: string
  label: string
  featureAssumptions: string[]
  primaryTemplateIds: string[]
  supportingTemplateIds: string[]
  requiredStableCodes: string[]
  requiredStableCodePrefixes: string[]
  optionalTemplateIds?: string[]
  greyOutTemplateIds?: string[]
  rationale: string
}

export type WbsTemplateMethodVariantPreciseRule = {
  methodVariantCode: string
  includeTemplateIds: string[]
  replaceCoreStableCodePrefixes: string[]
  requireStableCodes: string[]
  triggerDangerStableCodes: string[]
  evidenceStableCodes: string[]
  confirmationFields: string[]
  rationale: string
}

export type WbsTemplateMethodVariantExtensionRule = WbsTemplateMethodVariantPreciseRule & {
  triggerKeywords: string[]
  promotionPolicy: 'recommend_only' | 'require_confirmation' | 'trigger_control_pack'
}

export type WbsTemplateFeedbackMetricPolicy = {
  metricCode: string
  candidateCode: string
  numerator: string
  denominator: string
  minimumSampleSize: number
  confidenceThreshold: number
  quarantineMetric?: string
  candidateOutputField: string
  rationale: string
}

export type WbsTemplateFeedbackEventPolicy = {
  eventCode: string
  candidateCode: string
  sourceEventName: string
  requiredPayloadFields: string[]
  aggregationKeyFields: string[]
  sampleValidityRules: string[]
  candidateEmitCondition: string
  rationale: string
}

export type WbsTemplateSeedAuthoringRule = {
  ruleCode: string
  label: string
  scope: 'node_metadata' | 'catalog_structure' | 'generation_contract' | 'governance_release'
  requiredFields: string[]
  forbiddenFields: string[]
  validationSignals: string[]
  ordinaryFrontendExposure: 'hidden' | 'business_summary_only'
  rationale: string
}

export type WbsTemplateGoldenGeneratedResultAssertion = {
  assertionCode: string
  caseCode: string
  expectedTemplateIds: string[]
  expectedStableCodes: string[]
  expectedStableCodePrefixes: string[]
  expectedPlanItemKinds: string[]
  expectedDurationContributionModes: string[]
  forbiddenRuntimeEffects: string[]
  verificationMode: 'catalog_index_contract' | 'generation_preview_contract' | 'candidate_feedback_contract'
  rationale: string
}

export const WBS_TEMPLATE_GOLDEN_PROJECT_CASES: WbsTemplateGoldenProjectCase[] = [
  {
    caseCode: 'residential_shear_wall_basement',
    label: '住宅剪力墙+一层地下室',
    projectType: 'residential',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone'],
    expectedSpecialtyKeywords: ['waterproof', 'decoration', 'plumbing', 'electrical'],
    expectedDangerKeywords: ['基坑', '模板', '脚手架', '临时用电'],
    maxRecommendedRows: 650,
    rationale: '住宅项目最常见场景,用于校验主干、现场管理、危大、质量责任和里程碑的默认组合质量。',
  },
  {
    caseCode: 'residential_prefab_standard_floor',
    label: '住宅装配式标准层',
    projectType: 'residential',
    requiredGroups: ['core_quality', 'danger_control', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['prefab', '装配式', '灌浆', '叠合板'],
    maxRecommendedRows: 720,
    rationale: '装配式住宅用于校验 PC 构件、吊装、套筒灌浆和主体质量责任链。',
  },
  {
    caseCode: 'residential_fine_fitout_delivery',
    label: '住宅精装交付',
    projectType: 'residential',
    requiredGroups: ['core_quality', 'quality_responsibility', 'document_commercial_support', 'specialty'],
    expectedSpecialtyKeywords: ['decoration', 'waterproof', 'handover'],
    expectedManagementKeywords: ['分户验收', '开荒', '销项', '移交'],
    maxRecommendedRows: 760,
    rationale: '精装交付用于校验资料、分户验收、成品保护和销项闭环是否被普通施工任务污染。',
  },
  {
    caseCode: 'commercial_complex_basement_podium',
    label: '商业综合体地下室+裙房',
    projectType: 'commercial',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'specialty'],
    expectedSpecialtyKeywords: ['facade', 'fire', 'hvac', 'electrical'],
    expectedDangerKeywords: ['深基坑', '高支模', '塔吊', '脚手架'],
    maxRecommendedRows: 850,
    rationale: '商业综合体用于校验跨专业多、危大多、验收专项多的组合生成质量。',
  },
  {
    caseCode: 'office_tower_core_tube',
    label: '办公塔楼核心筒',
    projectType: 'office',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['facade', 'elevator', 'hvac', 'intelligent'],
    maxRecommendedRows: 780,
    rationale: '办公塔楼用于校验幕墙、电梯、智能化和高处作业安全控制。',
  },
  {
    caseCode: 'hotel_public_area_fitout',
    label: '酒店公区精装修',
    projectType: 'hotel',
    requiredGroups: ['core_quality', 'quality_responsibility', 'document_commercial_support', 'specialty'],
    expectedSpecialtyKeywords: ['decoration', 'fire', 'intelligent', 'plumbing'],
    maxRecommendedRows: 720,
    rationale: '酒店公区用于校验装饰、机电末端、消防联动和商务变更证据链。',
  },
  {
    caseCode: 'school_campus_building',
    label: '学校教学楼',
    projectType: 'school',
    requiredGroups: ['core_quality', 'site_management', 'quality_responsibility', 'project_milestone'],
    expectedSpecialtyKeywords: ['outdoor', 'fire', 'electrical'],
    maxRecommendedRows: 620,
    rationale: '学校项目用于校验常规公建与室外配套、消防验收、节能验收边界。',
  },
  {
    caseCode: 'hospital_cleanroom_medical',
    label: '医院洁净医疗',
    projectType: 'hospital',
    requiredGroups: ['core_quality', 'site_management', 'quality_responsibility', 'project_milestone', 'specialty'],
    expectedSpecialtyKeywords: ['cleanroom', 'medical', 'hvac', 'fire', 'intelligent'],
    maxRecommendedRows: 900,
    rationale: '医院洁净用于校验洁净空调、医用气体、消防智能化和专项验收的深度。',
  },
  {
    caseCode: 'industrial_steel_factory',
    label: '工业钢结构厂房',
    projectType: 'industrial',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['steel', 'fireproof', 'coating', 'industrial'],
    expectedDangerKeywords: ['吊装', '高处', '脚手架'],
    maxRecommendedRows: 760,
    rationale: '工业厂房用于校验钢结构制作安装、防腐防火、吊装和专项检测。',
  },
  {
    caseCode: 'logistics_warehouse_mezzanine',
    label: '物流仓库+夹层',
    projectType: 'logistics',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'specialty'],
    expectedSpecialtyKeywords: ['steel', 'floor', 'fire', 'outdoor'],
    maxRecommendedRows: 680,
    rationale: '物流仓库用于校验大空间钢结构、地坪、消防和室外道路组织。',
  },
  {
    caseCode: 'civil_defense_basement',
    label: '含人防地下室',
    projectType: 'civil_defense',
    requiredGroups: ['core_quality', 'danger_control', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['人防', 'civil_defense', '防护门', '人防通风'],
    maxRecommendedRows: 760,
    rationale: '人防地下室用于校验人防专项与地下防水、结构验收、设备验收的边界。',
  },
  {
    caseCode: 'deep_basement_pit_project',
    label: '深基坑地下室',
    projectType: 'commercial',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility'],
    expectedDangerKeywords: ['深基坑', '支护', '监测', '专家论证'],
    maxRecommendedRows: 720,
    rationale: '深基坑用于校验危大触发、第三方监测和基坑验收不被主干重复生成。',
  },
  {
    caseCode: 'high_formwork_public_hall',
    label: '大堂高支模',
    projectType: 'commercial',
    requiredGroups: ['core_quality', 'danger_control', 'quality_responsibility'],
    expectedDangerKeywords: ['高大模板', '专家论证', '架体', '验收'],
    maxRecommendedRows: 680,
    rationale: '高支模用于校验方案审批、架体实体作业、验收和旁站记录分离。',
  },
  {
    caseCode: 'curtain_wall_tower',
    label: '塔楼幕墙',
    projectType: 'office',
    requiredGroups: ['core_quality', 'danger_control', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['facade', '幕墙', '四性', '防火封堵'],
    maxRecommendedRows: 720,
    rationale: '幕墙项目用于校验深化、埋件、龙骨、防雷防火、四性试验和淋水试验。',
  },
  {
    caseCode: 'fire_system_acceptance',
    label: '消防系统验收',
    projectType: 'commercial',
    requiredGroups: ['core_quality', 'quality_responsibility', 'project_milestone', 'specialty'],
    expectedSpecialtyKeywords: ['fire', '喷淋', '消火栓', '报警', '联动'],
    expectedManagementKeywords: ['消防验收', '备案', '联动调试'],
    maxRecommendedRows: 700,
    rationale: '消防专项用于校验实体调试、验收时间轴投影和资料备案边界。',
  },
  {
    caseCode: 'smart_building_security_ba',
    label: '智能化 BA/安防',
    projectType: 'office',
    requiredGroups: ['core_quality', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['intelligent', 'BA', '安防', '综合布线'],
    maxRecommendedRows: 660,
    rationale: '智能化用于校验弱电点位、设备安装、单体调试、系统联调和资料闭合。',
  },
  {
    caseCode: 'elevator_group_installation',
    label: '电梯群安装调试',
    projectType: 'commercial',
    requiredGroups: ['core_quality', 'danger_control', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['elevator', '电梯', '井道', '调试', '监督检验'],
    maxRecommendedRows: 620,
    rationale: '电梯用于校验设备进场、安装、调试、监督检验和移交。',
  },
  {
    caseCode: 'outdoor_road_pipeline_landscape',
    label: '室外管网道路景观',
    projectType: 'residential',
    requiredGroups: ['core_quality', 'site_management', 'specialty'],
    expectedSpecialtyKeywords: ['outdoor', '管网', '道路', '景观'],
    maxRecommendedRows: 680,
    rationale: '室外工程用于校验室外专业与临水临电/临时道路的边界。',
  },
  {
    caseCode: 'roof_waterproof_energy_saving',
    label: '屋面防水节能',
    projectType: 'residential',
    requiredGroups: ['core_quality', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['waterproof', 'roof', 'insulation', '节能'],
    maxRecommendedRows: 620,
    rationale: '屋面用于校验防水、保温、找坡、蓄淋水和节能验收。',
  },
  {
    caseCode: 'basement_waterproof_detail',
    label: '地下防水细部',
    projectType: 'commercial',
    requiredGroups: ['core_quality', 'quality_responsibility', 'specialty'],
    expectedSpecialtyKeywords: ['waterproof', '地下防水', '施工缝', '后浇带', '穿墙管'],
    maxRecommendedRows: 650,
    rationale: '地下防水用于校验细部节点和主干粗颗粒替代关系。',
  },
  {
    caseCode: 'temporary_facilities_startup',
    label: '开工前临设临水临电',
    projectType: 'residential',
    requiredGroups: ['site_management', 'danger_control', 'project_milestone'],
    expectedManagementKeywords: ['围挡', '临时道路', '临水', '临电', '开工条件'],
    maxRecommendedRows: 360,
    rationale: '开工准备用于校验 site_management 中哪些是实体准备任务、哪些是验收/挂牌节点。',
  },
  {
    caseCode: 'completion_filing_handover',
    label: '竣工备案移交',
    projectType: 'residential',
    requiredGroups: ['quality_responsibility', 'project_milestone', 'document_commercial_support'],
    expectedManagementKeywords: ['竣工验收', '备案', '移交', '保修', '竣工资料'],
    maxRecommendedRows: 420,
    rationale: '竣工收口用于校验验收时间轴投影、资料商务和计划里程碑边界。',
  },
  {
    caseCode: 'variation_claim_closeout',
    label: '变更签证索赔闭合',
    projectType: 'commercial',
    requiredGroups: ['document_commercial_support'],
    expectedManagementKeywords: ['签证', '变更', '索赔', '计量', '结算'],
    maxRecommendedRows: 260,
    rationale: '商务闭合用于校验商业任务不污染实体施工工期。',
  },
  {
    caseCode: 'maintenance_warranty_turnover',
    label: '移交保修启动',
    projectType: 'residential',
    requiredGroups: ['project_milestone', 'document_commercial_support'],
    expectedManagementKeywords: ['移交', '维保', '保修', '培训', '台账'],
    maxRecommendedRows: 260,
    rationale: '保修启动用于校验移交类里程碑、资料交接和运维培训边界。',
  },
]

export const WBS_TEMPLATE_GOLDEN_CASE_EXPECTED_OUTPUTS: Record<string, WbsTemplateGoldenCaseExpectedOutput> = {
  residential_shear_wall_basement: {
    requiredKeywordGroups: [
      { expectationCode: 'BASEMENT_WATERPROOF', label: '地下室防水链', keywords: ['地下防水', '卷材', '施工缝', '后浇带'], minMatchedProcessCount: 3, rationale: '住宅地下室不能只生成基础结构,必须带防水细部控制。' },
      { expectationCode: 'STANDARD_FLOOR_STRUCTURE', label: '标准层主体链', keywords: ['钢筋', '模板', '混凝土', '砌体'], minMatchedProcessCount: 4, rationale: '住宅进度主节奏来自标准层主体和二次结构。' },
      { expectationCode: 'HOUSEHOLD_ACCEPTANCE', label: '分户/交付链', keywords: ['分户验收', '移交', '保修'], minMatchedProcessCount: 1, rationale: '住宅交付必须能联动分户验收和保修移交。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'milestone'],
    expectedTriggerAssertions: ['foundationDepthM 命中时触发深基坑危大', 'floorHeightM 命中时触发高支模危大', 'temporaryPowerCapacity 命中时触发临电检查'],
    duplicateSuppressionAssertions: ['地下防水专项细化后不得重复保留主干粗颗粒地下防水行'],
    acceptanceProjectionAssertions: ['基础验收、主体验收、竣工验收只作为 project_milestone 投影'],
    evidenceAssertions: ['隐蔽验收记录', '材料复验报告', '混凝土试块报告', '分户验收记录'],
  },
  residential_prefab_standard_floor: {
    requiredKeywordGroups: [
      { expectationCode: 'PC_COMPONENT', label: '预制构件链', keywords: ['预制构件', '构件编号', '尺寸偏差', '预埋件'], minMatchedProcessCount: 3, rationale: '装配式首要校验构件进场和构件身份。' },
      { expectationCode: 'PC_INSTALL', label: '预制安装链', keywords: ['墙板吊装', '临时固定', '垂直度校正', '连接件'], minMatchedProcessCount: 3, rationale: '装配式计划要反映吊装、校正和连接。' },
      { expectationCode: 'GROUTING', label: '套筒灌浆链', keywords: ['灌浆', '出浆', '封仓', '试块留置'], minMatchedProcessCount: 3, rationale: '套筒灌浆是质量高风险点。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control'],
    expectedTriggerAssertions: ['methodVariant=pc_grouting 时推荐装配式专项', '塔吊/构件重量命中时触发起重吊装危大'],
    duplicateSuppressionAssertions: ['装配式专项替代对应粗颗粒主体构件安装节点'],
    acceptanceProjectionAssertions: ['主体结构验收不得被装配式专项复刻成第二套验收大节点'],
    evidenceAssertions: ['构件合格证', '套筒灌浆记录', '灌浆料复验报告', '灌浆试块报告'],
  },
  residential_fine_fitout_delivery: {
    requiredKeywordGroups: [
      { expectationCode: 'WET_AREA', label: '湿区防水链', keywords: ['闭水', '保护层', '湿区', '防水'], minMatchedProcessCount: 2, rationale: '住宅精装湿区是交付投诉高发点。' },
      { expectationCode: 'FINISHING', label: '精装修链', keywords: ['地砖', '涂料', '吊顶', '成品保护'], minMatchedProcessCount: 4, rationale: '精装交付必须按分项展开。' },
      { expectationCode: 'PUNCH_LIST', label: '销项移交链', keywords: ['开荒', '销项', '移交', '分户验收'], minMatchedProcessCount: 2, rationale: '交付阶段的计划核心是问题销项和移交。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task', 'milestone'],
    expectedTriggerAssertions: ['projectType=residential 时推荐分户验收节点', 'fineFitout=true 时推荐精装专项'],
    duplicateSuppressionAssertions: ['精装专项与主干装饰装修不得重复生成同名墙地顶工序'],
    acceptanceProjectionAssertions: ['分户验收作为验收事实引用,任务行只显示状态和跳转'],
    evidenceAssertions: ['闭水记录', '实测实量记录', '分户验收表', '移交清单'],
  },
  commercial_complex_basement_podium: {
    requiredKeywordGroups: [
      { expectationCode: 'DEEP_PIT', label: '深基坑链', keywords: ['深基坑', '支护', '降水', '监测'], minMatchedProcessCount: 3, rationale: '综合体地下室通常存在基坑和降水风险。' },
      { expectationCode: 'MEP_FIRE', label: '消防机电链', keywords: ['消防', '喷淋', '防排烟', '联动'], minMatchedProcessCount: 4, rationale: '商业综合体验收关键在消防和机电联动。' },
      { expectationCode: 'FACADE_PUBLIC_FINISH', label: '幕墙公区链', keywords: ['幕墙', '大堂', '装饰', '电梯'], minMatchedProcessCount: 3, rationale: '商业裙房公区和幕墙影响开业节点。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'document_task', 'milestone'],
    expectedTriggerAssertions: ['foundationDepthM 自动触发深基坑', 'largeSpanHeightM 自动触发高支模', 'towerCrane=true 自动触发起重机械'],
    duplicateSuppressionAssertions: ['消防专项与主干机电调试不得重复形成两套联动调试'],
    acceptanceProjectionAssertions: ['消防验收、节能验收、竣工备案由 project_milestone 引用 AcceptanceTimeline'],
    evidenceAssertions: ['消防检测报告', '幕墙四性报告', '隐蔽验收记录', '竣工备案资料'],
  },
  office_tower_core_tube: {
    requiredKeywordGroups: [
      { expectationCode: 'CORE_TUBE', label: '核心筒链', keywords: ['核心筒', '爬模', '钢筋', '混凝土'], minMatchedProcessCount: 2, rationale: '办公塔楼核心筒决定结构主线。' },
      { expectationCode: 'FACADE_ELEVATOR', label: '幕墙电梯链', keywords: ['幕墙', '电梯', '井道', '四性'], minMatchedProcessCount: 3, rationale: '办公塔楼外立面和垂直交通是关键专项。' },
      { expectationCode: 'INTELLIGENT_HVAC', label: '智能化暖通链', keywords: ['智能化', 'BA', '空调', '调试'], minMatchedProcessCount: 2, rationale: '办公交付关注楼宇自控和舒适性系统。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'milestone'],
    expectedTriggerAssertions: ['highRise=true 时推荐高层垂直运输组织', 'curtainWall=true 时推荐幕墙专项'],
    duplicateSuppressionAssertions: ['幕墙专项替代主干幕墙粗颗粒节点,不替代结构主体'],
    acceptanceProjectionAssertions: ['主体验收、幕墙验收、竣工验收只保留大节点投影'],
    evidenceAssertions: ['核心筒测量记录', '幕墙四性报告', '电梯监督检验报告', '智能化调试记录'],
  },
  hotel_public_area_fitout: {
    requiredKeywordGroups: [
      { expectationCode: 'PUBLIC_FINISH', label: '公区精装链', keywords: ['吊顶', '墙地砖', '涂饰', '石材'], minMatchedProcessCount: 4, rationale: '酒店公区需要比普通装饰更细的工序。' },
      { expectationCode: 'MEP_TERMINAL', label: '末端机电链', keywords: ['风口', '灯具', '洁具', '喷淋'], minMatchedProcessCount: 3, rationale: '公区收口依赖机电末端。' },
      { expectationCode: 'OPERATING_HANDOVER', label: '运营移交链', keywords: ['培训', '移交', '维保', '台账'], minMatchedProcessCount: 2, rationale: '酒店开业前必须能管理运营交接。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task', 'commercial_task'],
    expectedTriggerAssertions: ['projectType=hotel 时推荐装饰、消防、智能化和运营移交'],
    duplicateSuppressionAssertions: ['精装专项与主干装饰同部位重复时以专项细项为准'],
    acceptanceProjectionAssertions: ['消防验收和竣工验收仍由里程碑区承接'],
    evidenceAssertions: ['材料认质认价', '样板验收记录', '消防联动记录', '运营移交清单'],
  },
  school_campus_building: {
    requiredKeywordGroups: [
      { expectationCode: 'PUBLIC_BUILDING', label: '常规公建链', keywords: ['主体结构', '装饰装修', '建筑电气', '给水排水'], minMatchedProcessCount: 4, rationale: '学校属于常规公建,主干必须完整。' },
      { expectationCode: 'OUTDOOR', label: '室外配套链', keywords: ['室外', '道路', '管网', '绿化'], minMatchedProcessCount: 2, rationale: '校园交付常受室外配套影响。' },
      { expectationCode: 'FIRE_ENERGY', label: '消防节能链', keywords: ['消防', '节能', '验收'], minMatchedProcessCount: 2, rationale: '学校竣工节点必须覆盖消防和节能。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'milestone'],
    expectedTriggerAssertions: ['projectType=school 时灰显洁净医疗和工业专项'],
    duplicateSuppressionAssertions: ['室外专项不得替代建筑主体主干'],
    acceptanceProjectionAssertions: ['消防验收、节能验收、竣工验收作为项目级节点'],
    evidenceAssertions: ['消防验收资料', '节能检测报告', '室外工程验收记录'],
  },
  hospital_cleanroom_medical: {
    requiredKeywordGroups: [
      { expectationCode: 'CLEANROOM', label: '洁净链', keywords: ['洁净', '净化空调', '洁净度', '风量平衡'], minMatchedProcessCount: 3, rationale: '医院洁净区需要专项工序和检测。' },
      { expectationCode: 'MEDICAL_GAS', label: '医气链', keywords: ['医用气体', '气密性', '报警', '终端'], minMatchedProcessCount: 1, rationale: '医气系统是医院专项关键线。' },
      { expectationCode: 'FIRE_INTELLIGENT', label: '消防智能化链', keywords: ['消防', '报警', '联动', '智能化'], minMatchedProcessCount: 3, rationale: '医疗建筑验收受消防智能化强约束。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task', 'milestone'],
    expectedTriggerAssertions: ['projectType=hospital 时推荐洁净医疗专项', 'cleanroom=true 时推荐洁净检测'],
    duplicateSuppressionAssertions: ['洁净空调专项不得和普通通风空调调试重复生成同名调试节点'],
    acceptanceProjectionAssertions: ['洁净度验收作为专项验收节点,不替代竣工验收'],
    evidenceAssertions: ['洁净度检测报告', '医气检测报告', '消防检测报告', '专项验收记录'],
  },
  industrial_steel_factory: {
    requiredKeywordGroups: [
      { expectationCode: 'STEEL_STRUCTURE', label: '钢结构链', keywords: ['钢结构', '钢柱', '钢梁', '高强螺栓'], minMatchedProcessCount: 4, rationale: '工业厂房主结构通常是钢结构。' },
      { expectationCode: 'COATING_FIREPROOF', label: '防腐防火链', keywords: ['除锈', '防腐', '防火涂料', '厚度检测'], minMatchedProcessCount: 3, rationale: '钢结构交付必须覆盖防腐防火。' },
      { expectationCode: 'LIFTING_SAFETY', label: '吊装安全链', keywords: ['吊装', '起重', '高处', '验收'], minMatchedProcessCount: 2, rationale: '工业厂房吊装和高处作业风险突出。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control'],
    expectedTriggerAssertions: ['steelStructure=true 时推荐钢结构专项', 'liftingWeightT 命中时触发起重吊装危大'],
    duplicateSuppressionAssertions: ['钢结构专项替代主干钢结构粗颗粒加工/安装节点'],
    acceptanceProjectionAssertions: ['主体结构验收仍为 project_milestone 大节点'],
    evidenceAssertions: ['焊缝探伤报告', '高强螺栓记录', '涂层厚度检测', '吊装验收记录'],
  },
  logistics_warehouse_mezzanine: {
    requiredKeywordGroups: [
      { expectationCode: 'WAREHOUSE_STEEL', label: '仓储钢结构链', keywords: ['钢结构', '夹层', '楼承板', '栓钉'], minMatchedProcessCount: 2, rationale: '仓储夹层常涉及组合楼板。' },
      { expectationCode: 'FLOOR', label: '地坪链', keywords: ['地坪', '耐磨', '基层', '切缝'], minMatchedProcessCount: 1, rationale: '物流仓库运营质量高度依赖地坪。' },
      { expectationCode: 'FIRE_OUTDOOR', label: '消防室外链', keywords: ['消防', '室外', '道路', '管网'], minMatchedProcessCount: 3, rationale: '仓储验收关注消防和货运道路。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control'],
    expectedTriggerAssertions: ['projectType=logistics 时推荐钢结构、地坪、消防和室外专项'],
    duplicateSuppressionAssertions: ['地坪专项不得替代普通结构楼板节点'],
    acceptanceProjectionAssertions: ['消防验收和竣工验收作为里程碑投影'],
    evidenceAssertions: ['地坪平整度记录', '消防检测报告', '钢结构验收记录'],
  },
  civil_defense_basement: {
    requiredKeywordGroups: [
      { expectationCode: 'CIVIL_DEFENSE', label: '人防专项链', keywords: ['人防', '防护门', '密闭门', '防爆'], minMatchedProcessCount: 2, rationale: '人防不能只按普通地下室处理。' },
      { expectationCode: 'BASEMENT_STRUCTURE', label: '地下结构链', keywords: ['地下防水', '钢筋', '混凝土', '后浇带'], minMatchedProcessCount: 3, rationale: '人防地下室仍需完整地下结构链。' },
      { expectationCode: 'CIVIL_DEFENSE_ACCEPTANCE', label: '人防验收链', keywords: ['人防验收', '专项验收', '资料'], minMatchedProcessCount: 1, rationale: '人防专项验收是竣工前置节点。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'milestone', 'document_task'],
    expectedTriggerAssertions: ['civilDefense=true 时推荐人防专项和人防验收节点'],
    duplicateSuppressionAssertions: ['人防专项只替代人防设备/构件细项,不替代普通地下防水主干'],
    acceptanceProjectionAssertions: ['人防专项验收由 project_milestone 引用验收时间轴事实'],
    evidenceAssertions: ['人防设备合格证', '隐蔽验收记录', '人防验收资料'],
  },
  deep_basement_pit_project: {
    requiredKeywordGroups: [
      { expectationCode: 'PIT_PLAN', label: '基坑方案链', keywords: ['深基坑', '专项方案', '专家论证'], minMatchedProcessCount: 2, rationale: '深基坑必须先有危大方案和论证。' },
      { expectationCode: 'PIT_PHYSICAL', label: '基坑实体链', keywords: ['支护', '降水', '土方', '监测'], minMatchedProcessCount: 3, rationale: '实体施工和监测必须分开表达。' },
      { expectationCode: 'PIT_ACCEPTANCE', label: '基坑验收链', keywords: ['验收', '监测报告', '移交'], minMatchedProcessCount: 2, rationale: '基坑移交是地下结构前置条件。' },
    ],
    expectedPlanItemKinds: ['work_task', 'safety_control', 'inspection_task', 'document_task'],
    expectedTriggerAssertions: ['foundationDepthM>=5 触发超危大专家论证', 'foundationDepthM>=3 触发危大方案'],
    duplicateSuppressionAssertions: ['危大深基坑包不复刻主干土方全部工序'],
    acceptanceProjectionAssertions: ['基坑验收只作为安全/质量门,不作为竣工大节点'],
    evidenceAssertions: ['专家论证意见', '监测报告', '基坑验收记录'],
  },
  high_formwork_public_hall: {
    requiredKeywordGroups: [
      { expectationCode: 'FORMWORK_PLAN', label: '高支模方案链', keywords: ['高大模板', '专项方案', '专家论证'], minMatchedProcessCount: 2, rationale: '高支模方案审批是安全门。' },
      { expectationCode: 'FORMWORK_PHYSICAL', label: '架体实体链', keywords: ['立杆', '剪刀撑', '架体', '搭设'], minMatchedProcessCount: 2, rationale: '高支模实体搭设要可计划。' },
      { expectationCode: 'FORMWORK_MONITOR', label: '旁站监测链', keywords: ['旁站', '监测', '验收', '拆除'], minMatchedProcessCount: 2, rationale: '浇筑和拆除是高支模控制重点。' },
    ],
    expectedPlanItemKinds: ['work_task', 'safety_control', 'inspection_task'],
    expectedTriggerAssertions: ['formworkHeightM>=8 或 load 命中时触发高支模危大'],
    duplicateSuppressionAssertions: ['高支模专项不复刻普通模板全部工序'],
    acceptanceProjectionAssertions: ['架体验收是 inspection_task,不是项目级验收大节点'],
    evidenceAssertions: ['专家论证意见', '架体验收记录', '浇筑旁站记录', '拆除令'],
  },
  curtain_wall_tower: {
    requiredKeywordGroups: [
      { expectationCode: 'FACADE_DETAIL', label: '幕墙细项链', keywords: ['图纸深化', '埋件', '连接件', '龙骨'], minMatchedProcessCount: 3, rationale: '幕墙必须有深化、埋件和龙骨链。' },
      { expectationCode: 'FACADE_CONTROL', label: '幕墙控制链', keywords: ['防雷', '防火封堵', '四性', '淋水'], minMatchedProcessCount: 3, rationale: '幕墙质量和验收依赖性能检测。' },
      { expectationCode: 'FACADE_SAFETY', label: '高处吊装链', keywords: ['吊篮', '吊装', '高处', '验收'], minMatchedProcessCount: 1, rationale: '塔楼幕墙通常涉及高处作业安全。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'document_task'],
    expectedTriggerAssertions: ['curtainWall=true 时推荐幕墙专项', '吊篮使用时触发吊篮危大控制'],
    duplicateSuppressionAssertions: ['幕墙专项替代主干幕墙粗颗粒节点'],
    acceptanceProjectionAssertions: ['幕墙验收不替代竣工验收大节点'],
    evidenceAssertions: ['后置埋件拉拔报告', '四性检测报告', '淋水试验记录', '防火封堵验收'],
  },
  fire_system_acceptance: {
    requiredKeywordGroups: [
      { expectationCode: 'FIRE_PHYSICAL', label: '消防实体链', keywords: ['喷淋', '消火栓', '报警', '防排烟'], minMatchedProcessCount: 4, rationale: '消防验收前必须覆盖主要系统实体。' },
      { expectationCode: 'FIRE_COMMISSIONING', label: '消防调试链', keywords: ['单机调试', '联动调试', '检测报告'], minMatchedProcessCount: 2, rationale: '消防验收核心是联动和检测。' },
      { expectationCode: 'FIRE_ACCEPTANCE', label: '消防验收链', keywords: ['消防验收', '备案', '整改'], minMatchedProcessCount: 2, rationale: '消防验收是竣工前置。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'milestone', 'document_task'],
    expectedTriggerAssertions: ['fireSystem=true 时推荐消防专项和消防验收节点'],
    duplicateSuppressionAssertions: ['消防专项调试不得和主干系统调试重复生成硬依赖'],
    acceptanceProjectionAssertions: ['消防验收状态绑定 acceptance_plans,任务行只做投影'],
    evidenceAssertions: ['消防检测报告', '联动调试记录', '验收意见书', '整改闭合台账'],
  },
  smart_building_security_ba: {
    requiredKeywordGroups: [
      { expectationCode: 'INTELLIGENT_CABLING', label: '弱电布线链', keywords: ['综合布线', '桥架', '线缆', '测试'], minMatchedProcessCount: 2, rationale: '智能化基础是布线和链路测试。' },
      { expectationCode: 'BA_SECURITY', label: 'BA/安防链', keywords: ['BA', '安防', '门禁', '监控'], minMatchedProcessCount: 1, rationale: '办公智能化要覆盖 BA 和安防。' },
      { expectationCode: 'SYSTEM_COMMISSIONING', label: '系统联调链', keywords: ['单体调试', '系统联调', '移交'], minMatchedProcessCount: 2, rationale: '智能化最终交付看系统联调和移交。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task'],
    expectedTriggerAssertions: ['intelligentSystem=true 时推荐智能化专项'],
    duplicateSuppressionAssertions: ['智能化专项不替代强电主干电气工序'],
    acceptanceProjectionAssertions: ['智能化验收作为专项节点,不替代竣工验收'],
    evidenceAssertions: ['链路测试报告', '系统调试记录', '培训移交记录'],
  },
  elevator_group_installation: {
    requiredKeywordGroups: [
      { expectationCode: 'ELEVATOR_SHAFT', label: '井道移交链', keywords: ['井道', '机房', '移交', '复核'], minMatchedProcessCount: 2, rationale: '电梯安装前置是土建井道移交。' },
      { expectationCode: 'ELEVATOR_INSTALL', label: '电梯安装链', keywords: ['导轨', '主机', '轿厢', '层门'], minMatchedProcessCount: 3, rationale: '电梯安装需要实体工序链。' },
      { expectationCode: 'ELEVATOR_INSPECTION', label: '监督检验链', keywords: ['调试', '监督检验', '验收', '移交'], minMatchedProcessCount: 2, rationale: '电梯交付必须有监督检验和移交。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'milestone'],
    expectedTriggerAssertions: ['elevatorCount>0 时推荐电梯专项', '施工升降机不等同于正式电梯专项'],
    duplicateSuppressionAssertions: ['正式电梯专项不替代施工升降机危大包'],
    acceptanceProjectionAssertions: ['电梯监督检验不等同于单位工程竣工验收'],
    evidenceAssertions: ['设备合格证', '安装自检记录', '监督检验报告', '移交记录'],
  },
  outdoor_road_pipeline_landscape: {
    requiredKeywordGroups: [
      { expectationCode: 'OUTDOOR_PIPE', label: '室外管网链', keywords: ['室外', '管网', '给排水', '检查井'], minMatchedProcessCount: 2, rationale: '室外管网影响综合验收和交付。' },
      { expectationCode: 'ROAD_LANDSCAPE', label: '道路景观链', keywords: ['道路', '铺装', '景观', '绿化'], minMatchedProcessCount: 2, rationale: '小区/园区交付离不开道路景观。' },
      { expectationCode: 'TEMPORARY_SWITCH', label: '临设切换链', keywords: ['临时道路', '临水临电', '切换', '拆改'], minMatchedProcessCount: 1, rationale: '室外施工要和临设退场切换联动。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'management_task'],
    expectedTriggerAssertions: ['outdoorWorks=true 时推荐室外专项和临设切换节点'],
    duplicateSuppressionAssertions: ['室外正式道路不得与临时道路混作同一实体工序'],
    acceptanceProjectionAssertions: ['室外综合验收作为竣工前置节点'],
    evidenceAssertions: ['管道试验记录', '道路验收记录', '绿化移交记录'],
  },
  roof_waterproof_energy_saving: {
    requiredKeywordGroups: [
      { expectationCode: 'ROOF_LAYER', label: '屋面构造链', keywords: ['找坡', '保温', '找平', '保护层'], minMatchedProcessCount: 3, rationale: '屋面防水不是单一铺贴动作。' },
      { expectationCode: 'ROOF_WATERPROOF', label: '屋面防水链', keywords: ['防水', '卷材', '蓄水', '淋水'], minMatchedProcessCount: 3, rationale: '屋面必须体现防水和试验。' },
      { expectationCode: 'ENERGY', label: '节能链', keywords: ['节能', '保温', '检测'], minMatchedProcessCount: 2, rationale: '屋面保温关联建筑节能验收。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'milestone'],
    expectedTriggerAssertions: ['roofWaterproof=true 时推荐屋面防水专项'],
    duplicateSuppressionAssertions: ['屋面专项替代主干粗颗粒屋面防水节点'],
    acceptanceProjectionAssertions: ['节能验收为项目级专项验收投影'],
    evidenceAssertions: ['防水材料复验', '蓄淋水记录', '节能检测报告'],
  },
  basement_waterproof_detail: {
    requiredKeywordGroups: [
      { expectationCode: 'DETAIL_NODE', label: '细部构造链', keywords: ['施工缝', '后浇带', '穿墙管', '变形缝'], minMatchedProcessCount: 4, rationale: '地下防水渗漏风险集中在细部。' },
      { expectationCode: 'WATERSTOP', label: '止水链', keywords: ['止水钢板', '止水带', '密封材料'], minMatchedProcessCount: 2, rationale: '止水措施应明确成工序。' },
      { expectationCode: 'PROTECTION', label: '保护检查链', keywords: ['保护层', '防水层检查', '隐蔽'], minMatchedProcessCount: 2, rationale: '地下防水闭合需要保护层和隐蔽验收。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task'],
    expectedTriggerAssertions: ['basement=true 且 waterproof=true 时推荐地下防水细部包'],
    duplicateSuppressionAssertions: ['地下防水细部包替代主干粗颗粒地下防水节点'],
    acceptanceProjectionAssertions: ['地下防水验收是质量门,不新增竣工大节点'],
    evidenceAssertions: ['材料复验报告', '隐蔽验收记录', '闭水/淋水记录'],
  },
  temporary_facilities_startup: {
    requiredKeywordGroups: [
      { expectationCode: 'SITE_SETUP', label: '场地临设链', keywords: ['围挡', '大门', '临时道路', '加工棚'], minMatchedProcessCount: 3, rationale: '开工准备要可落地到现场实体准备。' },
      { expectationCode: 'TEMP_WATER_POWER', label: '临水临电链', keywords: ['临水', '临电', '配电', '接地'], minMatchedProcessCount: 3, rationale: '临水临电是开工条件的一部分。' },
      { expectationCode: 'CIVILIZED_SITE', label: '安全文明链', keywords: ['扬尘', '消防', '实名制', '验收挂牌'], minMatchedProcessCount: 2, rationale: '安全文明不是普通装饰,属于现场管理。' },
    ],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'management_task', 'safety_control'],
    expectedTriggerAssertions: ['项目开工前默认推荐 site_management', '临电容量命中时触发临电危大控制'],
    duplicateSuppressionAssertions: ['临时道路和正式室外道路必须分离'],
    acceptanceProjectionAssertions: ['开工条件作为阻碍/条件联动,不另建前期手续分区'],
    evidenceAssertions: ['临设验收记录', '临电验收记录', '扬尘联网记录', '消防配置记录'],
  },
  completion_filing_handover: {
    requiredKeywordGroups: [
      { expectationCode: 'COMPLETION_ACCEPTANCE', label: '竣工验收链', keywords: ['竣工验收', '备案', '联合验收'], minMatchedProcessCount: 2, rationale: '竣工大节点必须由里程碑承接。' },
      { expectationCode: 'ARCHIVE', label: '档案资料链', keywords: ['竣工资料', '档案', '组卷', '移交'], minMatchedProcessCount: 3, rationale: '竣工备案强依赖资料归档。' },
      { expectationCode: 'WARRANTY', label: '保修移交链', keywords: ['保修', '维保', '培训', '台账'], minMatchedProcessCount: 2, rationale: '交付后责任边界要明确。' },
    ],
    expectedPlanItemKinds: ['milestone', 'document_task', 'inspection_task', 'linked_projection'],
    expectedTriggerAssertions: ['project_milestone 生成竣工备案大节点', 'document_commercial_support 生成资料交付事项'],
    duplicateSuppressionAssertions: ['验收时间轴大节点不得被质量责任区重复生成'],
    acceptanceProjectionAssertions: ['AcceptanceTimeline 是验收事实真值,计划行只做投影'],
    evidenceAssertions: ['五方验收记录', '备案回执', '档案移交回执', '保修书'],
  },
  variation_claim_closeout: {
    requiredKeywordGroups: [
      { expectationCode: 'VARIATION', label: '变更签证链', keywords: ['变更', '签证', '联系单', '影响测算'], minMatchedProcessCount: 3, rationale: '商务闭合必须能追踪事实和影响。' },
      { expectationCode: 'PAYMENT', label: '计量付款链', keywords: ['计量', '进度款', '付款', '台账'], minMatchedProcessCount: 3, rationale: '计量付款是项目计划里的商务事项。' },
      { expectationCode: 'CLAIM', label: '索赔结算链', keywords: ['索赔', '结算', '争议', '归档'], minMatchedProcessCount: 3, rationale: '索赔资料必须形成闭环。' },
    ],
    expectedPlanItemKinds: ['commercial_task', 'document_task', 'management_task'],
    expectedTriggerAssertions: ['变更/签证事实来自商务资料,不自动改施工工期'],
    duplicateSuppressionAssertions: ['商务任务不得替代实体施工工序'],
    acceptanceProjectionAssertions: ['商务收口不生成竣工验收大节点'],
    evidenceAssertions: ['签证单', '变更单', '计量报表', '索赔通知', '会议纪要'],
  },
  maintenance_warranty_turnover: {
    requiredKeywordGroups: [
      { expectationCode: 'ASSET_HANDOVER', label: '资产移交链', keywords: ['设备资产', '台账', '说明书', '维保手册'], minMatchedProcessCount: 2, rationale: '物业接收需要资产和资料台账。' },
      { expectationCode: 'TRAINING', label: '培训演练链', keywords: ['培训', '演练', '签到', '操作'], minMatchedProcessCount: 2, rationale: '运维交接不只是资料移交。' },
      { expectationCode: 'WARRANTY_CLOSE', label: '保修金链', keywords: ['保修', '质保金', '缺陷责任期', '返还'], minMatchedProcessCount: 2, rationale: '保修和质保金是交付后的商务责任。' },
    ],
    expectedPlanItemKinds: ['document_task', 'commercial_task', 'milestone', 'management_task'],
    expectedTriggerAssertions: ['竣工移交阶段推荐运营移交和保修金事项'],
    duplicateSuppressionAssertions: ['运营移交不替代竣工验收本体'],
    acceptanceProjectionAssertions: ['保修启动只承接竣工后的移交状态'],
    evidenceAssertions: ['资产台账', '培训签到', '移交清单', '质量保修书', '质保金返还申请'],
  },
}

export const WBS_TEMPLATE_PROJECT_APPLICABILITY_PROFILES: WbsTemplateApplicabilityProfile[] = [
  {
    projectType: 'residential',
    label: '住宅',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone'],
    recommendedSpecialtyKeywords: ['waterproof', 'decoration', 'plumbing', 'electrical', 'outdoor', 'elevator'],
    excludedSpecialtyKeywords: ['cleanroom', 'industrial'],
    triggerKeywords: ['住宅', '剪力墙', '标准层', '分户验收', '精装', '住宅交付'],
    rationale: '住宅默认关注标准层节奏、分户验收、精装交付和室外配套。',
  },
  {
    projectType: 'commercial',
    label: '商业综合体',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'specialty'],
    recommendedSpecialtyKeywords: ['facade', 'fire', 'hvac', 'electrical', 'intelligent', 'elevator', 'decoration'],
    triggerKeywords: ['商业', '综合体', '裙房', '大堂', '地下商业', '商业机电'],
    rationale: '商业综合体专业交叉多,应默认增强机电、消防、幕墙、智能化和装饰。',
  },
  {
    projectType: 'office',
    label: '办公',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'specialty'],
    recommendedSpecialtyKeywords: ['facade', 'hvac', 'electrical', 'intelligent', 'elevator', 'fire'],
    triggerKeywords: ['办公', '写字楼', '塔楼', '核心筒', '幕墙'],
    rationale: '办公塔楼关注核心筒、幕墙、电梯和智能化系统。',
  },
  {
    projectType: 'hotel',
    label: '酒店',
    requiredGroups: ['core_quality', 'quality_responsibility', 'project_milestone', 'specialty'],
    recommendedSpecialtyKeywords: ['decoration', 'plumbing', 'hvac', 'fire', 'intelligent', 'elevator'],
    triggerKeywords: ['酒店', '客房', '公区', '厨房', '宴会厅'],
    rationale: '酒店关注精装、末端机电、消防联动和运营移交。',
  },
  {
    projectType: 'school',
    label: '学校',
    requiredGroups: ['core_quality', 'site_management', 'quality_responsibility', 'project_milestone'],
    recommendedSpecialtyKeywords: ['outdoor', 'fire', 'electrical', 'plumbing'],
    triggerKeywords: ['学校', '教学楼', '宿舍', '食堂', '操场'],
    rationale: '学校项目强调公建常规质量、室外配套和消防/节能验收。',
  },
  {
    projectType: 'hospital',
    label: '医院',
    requiredGroups: ['core_quality', 'site_management', 'quality_responsibility', 'project_milestone', 'specialty'],
    recommendedSpecialtyKeywords: ['cleanroom', 'medical', 'hvac', 'fire', 'intelligent', 'plumbing'],
    triggerKeywords: ['医院', '洁净', '手术部', 'ICU', '医用气体', '净化空调'],
    rationale: '医院项目需要洁净、医气、净化空调和专业验收增强。',
  },
  {
    projectType: 'industrial',
    label: '工业厂房',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'specialty'],
    recommendedSpecialtyKeywords: ['steel', 'industrial', 'fire', 'outdoor', 'floor'],
    triggerKeywords: ['工业', '厂房', '钢结构', '行车', '设备基础', '大跨度'],
    rationale: '工业厂房应增强钢结构、防腐防火、地坪和设备基础。',
  },
  {
    projectType: 'logistics',
    label: '物流仓储',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'specialty'],
    recommendedSpecialtyKeywords: ['steel', 'floor', 'fire', 'outdoor'],
    triggerKeywords: ['物流', '仓库', '货架', '月台', '耐磨地坪'],
    rationale: '物流仓储重点在大空间钢结构、地坪和消防。',
  },
  {
    projectType: 'civil_defense',
    label: '人防',
    requiredGroups: ['core_quality', 'danger_control', 'quality_responsibility', 'specialty'],
    recommendedSpecialtyKeywords: ['civil_defense', '人防', '防护门', '人防通风'],
    triggerKeywords: ['人防', '防护单元', '防护门', '密闭门', '人防通风'],
    rationale: '人防项目必须启用人防专项,避免只落到普通地下室主干。',
  },
  {
    projectType: 'data_center',
    label: '数据中心 / IDC',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['数据中心', 'IDC', '机房', 'UPS', '精密空调', '气体灭火', '等保'],
    triggerKeywords: ['数据中心', 'IDC', '机柜', 'UPS', '柴油发电机', '精密空调', '等保'],
    rationale: '数据中心需要把机房围护、双路供电、精密空调、消防联动、等保和运营认证放入同一推荐组合。',
  },
  {
    projectType: 'clean_industrial',
    label: '工业洁净厂房',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['工业洁净', '洁净厂房', '工艺验证', '防静电', 'FAT', 'SAT', 'IQ', 'OQ', 'PQ'],
    triggerKeywords: ['洁净厂房', '电池', '半导体', '制药', '工艺设备', 'DQ', 'IQ', 'OQ', 'PQ'],
    rationale: '工业洁净厂房需要工艺验证、洁净围护、工艺动力、安评环评和投产节点。',
  },
  {
    projectType: 'renovation',
    label: '既有建筑改造',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['既有建筑', '改造', '拆除', '加固', '节能改造', '消防封堵'],
    triggerKeywords: ['既有建筑', '改造', '拆除', '加固', '临时支撑', '新旧结构'],
    rationale: '改造项目的真实风险在既有结构调查、拆除隔离、加固复检、消防封堵和分期运营切换。',
  },
  {
    projectType: 'heritage',
    label: '文保修缮',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['文物', '文保', '修缮', '病害', '原构件', '三防'],
    triggerKeywords: ['文保', '文物', '历史建筑', '修缮', '青砖', '木构', '白蚁'],
    rationale: '文保修缮需要保护方案、病害测绘、原构件保护、替换构件复刻和文物部门验收。',
  },
  {
    projectType: 'campus',
    label: '校园教育建筑',
    requiredGroups: ['core_quality', 'site_management', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['校园', '食堂', '操场', '实验室', '等保', '开学'],
    triggerKeywords: ['校园', '教学楼', '宿舍', '食堂', '实验室', '操场', '开学'],
    rationale: '校园项目是多单体和开学节点驱动，必须把食药监、体育检测、教育主管部门和信息化验收纳入推荐。',
  },
  {
    projectType: 'tod',
    label: 'TOD上盖 / 轨交接口',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['TOD', '地铁', '上盖', '转换层', '隔振', '噪声', '运营单位'],
    triggerKeywords: ['TOD', '地铁', '上盖', '营业线', '转换层', '隔振', '噪声'],
    rationale: 'TOD上盖必须显式管理地铁运营接口、不停运施工、转换层、隔振噪声和规划验收。',
  },
  {
    projectType: 'modular_construction',
    label: 'MiC模块化建筑',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['MiC', '模块', '整体卫浴', '集成厨房', 'FAT'],
    triggerKeywords: ['MiC', '模块化', '模块吊装', '整体卫浴', '集成厨房', '工厂FAT'],
    rationale: 'MiC模块化建筑要从工厂制造、运输审批、现场吊装、模块接口、整体卫浴和集成厨房一起生成。',
  },
  {
    projectType: 'luxury_hotel',
    label: '高端酒店',
    requiredGroups: ['core_quality', 'site_management', 'quality_responsibility', 'project_milestone', 'document_commercial_support', 'specialty'],
    recommendedSpecialtyKeywords: ['酒店', '客房', '宴会厅', 'SPA', '品牌标准', 'PMS'],
    triggerKeywords: ['五星', '高端酒店', '品牌方', '客房样板', '宴会厅', 'SPA', '试运营'],
    rationale: '高端酒店在普通酒店基础上更依赖品牌标准、进口材料封样、样板间多方评审、餐厨卫监和试运营压力测试。',
  },
  {
    projectType: 'deep_foundation',
    label: '深基坑 / 复杂基础',
    requiredGroups: ['core_quality', 'site_management', 'danger_control', 'quality_responsibility', 'project_milestone', 'specialty'],
    recommendedSpecialtyKeywords: ['深基坑', '桩基', '试桩', '地下连续墙', '监测', '邻近保护'],
    triggerKeywords: ['深基坑', '桩基', '试桩', '地下连续墙', '降水', '监测', '邻近保护'],
    rationale: '复杂基础工程要把基坑论证、支护降水、监测投运、试桩和桩基大面积检测验收联成完整骨架。',
  },
]

export const WBS_TEMPLATE_PROJECT_APPLICABILITY_PLAYBOOKS: Record<string, WbsTemplateProjectApplicabilityPlaybook> = {
  residential: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'structureType', 'buildingCount', 'standardFloorCount', 'basementLevelCount', 'foundationDepthM', 'isFineFitout'],
    recommendationRules: [
      { ruleCode: 'RES_BASEMENT_WATERPROOF', when: 'basementLevelCount > 0', then: '推荐地下防水细部、基坑、地下结构质量责任节点', rationale: '住宅地下室渗漏和基坑风险高。' },
      { ruleCode: 'RES_FINE_FITOUT', when: 'isFineFitout = true', then: '推荐精装、湿区防水、分户验收、开荒销项', rationale: '精装住宅交付需要比毛坯更强的销项和分户验收链。' },
      { ruleCode: 'RES_STANDARD_FLOOR', when: 'standardFloorCount >= 3', then: '推荐按楼栋楼层展开主体结构和二次结构', rationale: '标准层节奏是住宅计划主线。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: '住宅默认不启用洁净医疗专项，除非项目事实包含洁净房间。' },
      { keyword: 'industrial', reason: '住宅默认不启用工业厂房专项。' },
    ],
    acceptanceMilestoneKeywords: ['基础验收', '主体验收', '节能验收', '消防验收', '分户验收', '竣工验收', '备案'],
    evidenceFocusKeywords: ['隐蔽验收', '材料复验', '混凝土试块', '分户验收', '竣工资料'],
  },
  commercial: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'basementLevelCount', 'foundationDepthM', 'largeSpanHeightM', 'curtainWallArea', 'fireSystemScope', 'openingDate'],
    recommendationRules: [
      { ruleCode: 'COM_DEEP_BASEMENT', when: 'foundationDepthM >= 3', then: '自动触发深基坑危大和第三方监测候选', rationale: '商业综合体地下室通常复杂。' },
      { ruleCode: 'COM_PUBLIC_HALL', when: 'largeSpanHeightM >= 8', then: '自动触发高支模危大和大堂装饰专项', rationale: '大空间高支模和公区收口是关键路径。' },
      { ruleCode: 'COM_OPENING', when: 'openingDate exists', then: '强化消防、机电联调、移交、商务变更证据链', rationale: '商业开业节点对验收和移交要求强。' },
    ],
    greyOutRules: [
      { keyword: 'civil_defense', reason: '仅当工程对象含人防单元时启用。' },
      { keyword: 'cleanroom', reason: '商业默认不启用洁净医疗专项。' },
    ],
    acceptanceMilestoneKeywords: ['消防验收', '节能验收', '规划核实', '竣工联合验收', '备案', '运营移交'],
    evidenceFocusKeywords: ['消防检测报告', '幕墙四性报告', '机电调试记录', '签证变更台账', '竣工档案'],
  },
  office: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'towerHeightM', 'curtainWallArea', 'elevatorCount', 'intelligentSystemScope', 'hvacSystemType'],
    recommendationRules: [
      { ruleCode: 'OFFICE_TOWER', when: 'towerHeightM >= 50', then: '推荐高层垂直运输、幕墙、电梯、智慧工地监测', rationale: '办公塔楼高处作业和垂直运输复杂。' },
      { ruleCode: 'OFFICE_BA', when: 'intelligentSystemScope includes BA/security', then: '推荐智能化 BA/安防专项', rationale: '办公交付依赖楼控和安防系统。' },
      { ruleCode: 'OFFICE_FACADE', when: 'curtainWallArea > 0', then: '推荐幕墙深化、四性、淋水、防火封堵', rationale: '幕墙影响外立面和竣工验收。' },
    ],
    greyOutRules: [
      { keyword: 'medical', reason: '办公默认不启用医气/洁净专项。' },
      { keyword: 'industrial', reason: '办公默认不启用工业厂房专项。' },
    ],
    acceptanceMilestoneKeywords: ['主体验收', '幕墙验收', '消防验收', '电梯监督检验', '竣工验收'],
    evidenceFocusKeywords: ['幕墙检测', '电梯监督检验', '楼控调试', '消防联动', '竣工资料'],
  },
  hotel: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'recommended',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'roomCount', 'publicAreaFitoutLevel', 'kitchenScope', 'openingDate', 'fireSystemScope'],
    recommendationRules: [
      { ruleCode: 'HOTEL_PUBLIC_AREA', when: 'publicAreaFitoutLevel = high', then: '推荐精装、石材、吊顶、机电末端和样板验收', rationale: '酒店公区对观感和机电末端要求高。' },
      { ruleCode: 'HOTEL_OPENING', when: 'openingDate exists', then: '强化运营移交、培训、消防演练和维保资料', rationale: '酒店开业前要完成运营交接。' },
      { ruleCode: 'HOTEL_VARIATION', when: 'fitoutDesignChanges frequent', then: '强化变更签证和认质认价证据链', rationale: '酒店精装变更频繁。' },
    ],
    greyOutRules: [
      { keyword: 'industrial', reason: '酒店默认不启用工业厂房专项。' },
      { keyword: 'civil_defense', reason: '仅项目含人防时启用。' },
    ],
    acceptanceMilestoneKeywords: ['消防验收', '节能验收', '竣工验收', '运营移交'],
    evidenceFocusKeywords: ['样板验收', '材料认质认价', '消防联动', '培训记录', '移交清单'],
  },
  school: {
    defaultScenario: 'main_plus_required_support',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'campusOutdoorScope', 'fireSystemScope', 'seasonalOpeningDate', 'publicBuildingArea'],
    recommendationRules: [
      { ruleCode: 'SCHOOL_OUTDOOR', when: 'campusOutdoorScope = true', then: '推荐室外道路、管网、绿化、操场配套', rationale: '学校交付常被室外工程拖住。' },
      { ruleCode: 'SCHOOL_OPENING_SEASON', when: 'seasonalOpeningDate before school term', then: '强化竣工备案、消防、室外移交节点', rationale: '开学节点刚性强。' },
      { ruleCode: 'SCHOOL_STANDARD_PUBLIC', when: 'publicBuildingArea > 0', then: '保持主干质量全量,专项按事实推荐', rationale: '学校一般不需要过度专项化。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: '普通学校默认不启用洁净专项。' },
      { keyword: 'industrial', reason: '学校默认不启用工业专项。' },
    ],
    acceptanceMilestoneKeywords: ['消防验收', '节能验收', '竣工验收', '备案', '室外移交'],
    evidenceFocusKeywords: ['消防验收资料', '节能检测', '室外验收记录', '竣工档案'],
  },
  hospital: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'cleanroomLevel', 'medicalGasScope', 'icuOrOperatingRoomScope', 'fireSystemScope', 'hvacSystemType'],
    recommendationRules: [
      { ruleCode: 'HOSPITAL_CLEANROOM', when: 'cleanroomLevel exists', then: '推荐洁净空调、洁净度检测、压差风量平衡', rationale: '洁净医疗是医院差异化核心。' },
      { ruleCode: 'HOSPITAL_MEDICAL_GAS', when: 'medicalGasScope = true', then: '推荐医气专项、气密性、报警和终端验收', rationale: '医气不能被普通给排水/暖通覆盖。' },
      { ruleCode: 'HOSPITAL_SYSTEM_ACCEPTANCE', when: 'icuOrOperatingRoomScope = true', then: '强化专项验收、第三方检测和资料闭合', rationale: '医疗专项验收资料复杂。' },
    ],
    greyOutRules: [
      { keyword: 'industrial', reason: '医院默认不启用工业厂房专项。' },
      { keyword: 'warehouse', reason: '医院默认不启用物流仓储专项。' },
    ],
    acceptanceMilestoneKeywords: ['消防验收', '洁净验收', '专项验收', '竣工验收', '备案'],
    evidenceFocusKeywords: ['洁净度检测', '医气检测', '消防检测', '系统联调', '专项验收记录'],
  },
  industrial: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'steelStructureSpanM', 'craneTonnage', 'equipmentFoundationScope', 'fireproofCoatingScope', 'industrialFloorScope'],
    recommendationRules: [
      { ruleCode: 'IND_STEEL', when: 'steelStructureSpanM > 0', then: '推荐钢结构制作安装、防腐防火、焊缝探伤', rationale: '工业厂房主线通常是钢结构。' },
      { ruleCode: 'IND_LIFTING', when: 'craneTonnage > 0', then: '触发起重吊装危大和吊装安全控制', rationale: '大构件吊装是关键安全风险。' },
      { ruleCode: 'IND_EQUIPMENT_FOUNDATION', when: 'equipmentFoundationScope = true', then: '推荐设备基础、预埋、二次灌浆和移交', rationale: '工业投产依赖设备基础接口。' },
    ],
    greyOutRules: [
      { keyword: 'fine_fitout', reason: '工业厂房默认不启用住宅精装交付专项。' },
      { keyword: 'cleanroom', reason: '仅洁净厂房才启用洁净专项。' },
    ],
    acceptanceMilestoneKeywords: ['主体验收', '消防验收', '设备基础移交', '竣工验收'],
    evidenceFocusKeywords: ['焊缝探伤', '高强螺栓记录', '防火涂层厚度', '吊装验收', '设备基础交接'],
  },
  logistics: {
    defaultScenario: 'custom_recommended',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'recommended',
      project_milestone: 'by_project_type',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'warehouseArea', 'mezzanineScope', 'industrialFloorScope', 'fireSystemScope', 'outdoorTruckRouteScope'],
    recommendationRules: [
      { ruleCode: 'LOG_FLOOR', when: 'industrialFloorScope = true', then: '推荐耐磨地坪、平整度、切缝和养护', rationale: '物流运营对地坪质量敏感。' },
      { ruleCode: 'LOG_FIRE', when: 'warehouseArea large', then: '强化消防喷淋、报警、防排烟和验收', rationale: '仓储消防负荷和验收要求高。' },
      { ruleCode: 'LOG_OUTDOOR', when: 'outdoorTruckRouteScope = true', then: '推荐室外道路、月台、排水和交通组织', rationale: '物流交付依赖货运动线。' },
    ],
    greyOutRules: [
      { keyword: 'medical', reason: '物流仓储默认不启用医疗专项。' },
      { keyword: 'hotel_fitout', reason: '物流仓储默认不启用酒店公区精装专项。' },
    ],
    acceptanceMilestoneKeywords: ['消防验收', '竣工验收', '室外移交'],
    evidenceFocusKeywords: ['地坪检测', '消防检测', '钢结构验收', '室外道路验收'],
  },
  civil_defense: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'recommended',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'civilDefenseUnitCount', 'civilDefenseDoorCount', 'civilDefenseVentilationScope', 'basementLevelCount', 'foundationDepthM'],
    recommendationRules: [
      { ruleCode: 'CD_DOOR', when: 'civilDefenseDoorCount > 0', then: '推荐防护门、密闭门、门框墙和启闭调试', rationale: '人防门和门框墙是专项核心。' },
      { ruleCode: 'CD_VENTILATION', when: 'civilDefenseVentilationScope = true', then: '推荐人防通风、防爆阀、滤毒和系统检测', rationale: '人防通风不能被普通通风空调覆盖。' },
      { ruleCode: 'CD_ACCEPTANCE', when: 'civilDefenseUnitCount > 0', then: '推荐人防专项验收和资料闭合', rationale: '人防验收是竣工前置。' },
    ],
    greyOutRules: [
      { keyword: 'residential_fine_fitout', reason: '人防专项默认不启用住宅精装交付。' },
      { keyword: 'cleanroom', reason: '除医疗人防外默认不启用洁净专项。' },
    ],
    acceptanceMilestoneKeywords: ['人防验收', '消防验收', '竣工验收', '备案'],
    evidenceFocusKeywords: ['人防设备合格证', '隐蔽验收', '专项验收记录', '人防资料'],
  },
  data_center: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'dataCenterTier', 'dualPowerRequired', 'precisionCoolingScope', 'coreRoomArea', 'emergencyPowerScope'],
    recommendationRules: [
      { ruleCode: 'DC_CORE_ROOM', when: 'dataCenterTier exists', then: '推荐机房围护、双路供电、精密空调和动环监控', rationale: '数据中心核心机房必须把围护、供电和环境控制一起生成。' },
      { ruleCode: 'DC_POWER', when: 'dualPowerRequired = true', then: '强化UPS、柴油发电机、配电切换和带载测试', rationale: '数据中心投运高度依赖备用电源链。' },
      { ruleCode: 'DC_COMMISSIONING', when: 'precisionCoolingScope = true', then: '强化精密空调、气体灭火和机房投运', rationale: '精密冷却和消防联动决定交付可用性。' },
    ],
    greyOutRules: [
      { keyword: 'industrial', reason: '数据中心默认不启用普通工业厂房专项。' },
      { keyword: 'cleanroom', reason: '仅在复用洁净机房时才启用洁净医疗专项。' },
    ],
    acceptanceMilestoneKeywords: ['机房验收', '消防验收', '联调验收', '竣工验收', '投运移交'],
    evidenceFocusKeywords: ['UPS测试', '柴油发电机', '精密空调', '动环监控', '等保资料'],
  },
  clean_industrial: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'cleanroomLevel', 'processValidationScope', 'equipmentFoundationScope', 'fireproofCoatingScope', 'industrialFloorScope'],
    recommendationRules: [
      { ruleCode: 'CI_CLEANROOM', when: 'cleanroomLevel exists', then: '推荐工业洁净围护、洁净空调和工艺验证', rationale: '工业洁净先保洁净等级再谈产线。' },
      { ruleCode: 'CI_PROCESS', when: 'processValidationScope = true', then: '强化FAT、SAT、IQ/OQ/PQ和资料闭合', rationale: '工艺验证链是洁净厂房的交付核心。' },
      { ruleCode: 'CI_EQUIPMENT', when: 'equipmentFoundationScope = true', then: '强化设备基础、预埋和二次灌浆', rationale: '工艺设备接口决定投产节奏。' },
    ],
    greyOutRules: [
      { keyword: 'hotel', reason: '工业洁净默认不启用酒店精装专项。' },
      { keyword: 'civil_defense', reason: '工业洁净默认不启用人防专项。' },
    ],
    acceptanceMilestoneKeywords: ['洁净验收', '工艺验证', '消防验收', '竣工验收', '投产'],
    evidenceFocusKeywords: ['FAT', 'SAT', 'IQ', 'OQ', 'PQ', '洁净度检测'],
  },
  renovation: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'existingStructureSurvey', 'demolitionScope', 'temporarySupportRequired', 'newOldStructureConnectionScope', 'fireCompartmentChange'],
    recommendationRules: [
      { ruleCode: 'RNV_SURVEY', when: 'existingStructureSurvey = true', then: '推荐既有建筑调查、结构复核和界面确认', rationale: '改造首先要摸清既有结构底数。' },
      { ruleCode: 'RNV_DEMOLITION', when: 'demolitionScope exists', then: '强化拆改隔离、临时支护和危险性较大分部分项控制', rationale: '拆改必须先控风险。' },
      { ruleCode: 'RNV_CUTOVER', when: 'newOldStructureConnectionScope = true', then: '强化新旧结构连接、机电迁改和分期切换', rationale: '改造交付最怕切换失控。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: '既有建筑改造默认不启用洁净专项。' },
      { keyword: 'industrial', reason: '既有建筑改造默认不启用工业厂房专项。' },
    ],
    acceptanceMilestoneKeywords: ['现状调查确认', '拆改验收', '消防封堵验收', '分区移交', '竣工验收'],
    evidenceFocusKeywords: ['现状调查', '临时支护', '结构复核', '迁改联动', '移交清单'],
  },
  heritage: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'recommended',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'heritageLevel', 'protectionPlanApproved', 'trialRepairScope', 'monitoringScope', 'openTrialOperationScope'],
    recommendationRules: [
      { ruleCode: 'HRT_PLAN', when: 'protectionPlanApproved = true', then: '推荐病害调查、保护方案和样板试修确认', rationale: '文保先批方案再施工。' },
      { ruleCode: 'HRT_REPAIR', when: 'trialRepairScope = true', then: '强化传统材料修复、可逆加固和兼容性试验', rationale: '文保修缮必须可逆且兼容。' },
      { ruleCode: 'HRT_MONITOR', when: 'monitoringScope = true', then: '强化环境监测、沉降裂缝观测和开放试运行', rationale: '文保交付离不开长期监测。' },
    ],
    greyOutRules: [
      { keyword: 'industrial', reason: '文保修缮默认不启用工业厂房专项。' },
      { keyword: 'cleanroom', reason: '文保修缮默认不启用洁净专项。' },
    ],
    acceptanceMilestoneKeywords: ['保护方案批复', '样板试修确认', '病害复核', '开放试运行', '文物验收'],
    evidenceFocusKeywords: ['测绘', '病害调查', '兼容性试验', '环境监测', '文保资料'],
  },
  campus: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'campusOutdoorScope', 'openingDate', 'seasonalOpeningDate', 'publicBuildingArea', 'smartCampusScope'],
    recommendationRules: [
      { ruleCode: 'CMP_OUTDOOR', when: 'campusOutdoorScope = true', then: '推荐室外道路、管网、绿化和运动场地', rationale: '校园交付常被室外工程拖住。' },
      { ruleCode: 'CMP_OPENING', when: 'seasonalOpeningDate exists', then: '强化开学切换、消防和节能验收', rationale: '开学节点刚性强。' },
      { ruleCode: 'CMP_SMART', when: 'smartCampusScope = true', then: '强化智慧校园接入、门禁和网络联动', rationale: '校园交付越来越依赖信息化接入。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: '普通校园默认不启用洁净专项。' },
      { keyword: 'industrial', reason: '普通校园默认不启用工业专项。' },
    ],
    acceptanceMilestoneKeywords: ['室外移交', '消防验收', '节能验收', '开学切换', '备案'],
    evidenceFocusKeywords: ['开学窗口', '室外道路', '智慧校园接入', '校方接管', '竣工档案'],
  },
  tod: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'railTransitInterfaceScope', 'nightWindowConstructionScope', 'vibrationControlScope', 'commercialInterfaceScope', 'upperCoverDepthM'],
    recommendationRules: [
      { ruleCode: 'TOD_INTERFACE', when: 'railTransitInterfaceScope = true', then: '推荐轨交接口、营业线防护和转换层专项', rationale: 'TOD上盖的前提是把运营接口锁清楚。' },
      { ruleCode: 'TOD_VIBRATION', when: 'vibrationControlScope = true', then: '强化隔振、减震和振动噪声监测', rationale: '上盖结构不能影响既有线路。' },
      { ruleCode: 'TOD_HANDOVER', when: 'commercialInterfaceScope = true', then: '强化商业接驳、运营移交和导视接入', rationale: 'TOD交付本质是接口和运营切换。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: 'TOD默认不启用洁净专项。' },
      { keyword: 'medical', reason: 'TOD默认不启用医疗专项。' },
    ],
    acceptanceMilestoneKeywords: ['营业线审批', '转换层验收', '振动噪声验收', '运营移交', '竣工验收'],
    evidenceFocusKeywords: ['地铁接口', '夜间窗口', '振动监测', '运营单位确认', '规划验收'],
  },
  modular_construction: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'moduleCount', 'factoryProductionScope', 'transportApprovalRequired', 'moduleHoistingScope', 'prefabBathroomScope', 'prefabKitchenScope'],
    recommendationRules: [
      { ruleCode: 'MIC_FACTORY', when: 'factoryProductionScope = true', then: '推荐工厂制造、首件评审和出厂检验', rationale: 'MiC先把工厂端闭环做实。' },
      { ruleCode: 'MIC_TRANSPORT', when: 'transportApprovalRequired = true', then: '强化运输审批、路径确认和到场交接', rationale: '模块运输是交付前置条件。' },
      { ruleCode: 'MIC_HOISTING', when: 'moduleHoistingScope = true', then: '强化模块吊装、临时支撑和节点连接', rationale: '模块化项目的关键在现场吊装和接口。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: '模块化建筑默认不启用洁净专项。' },
      { keyword: 'industrial', reason: '模块化建筑默认不启用工业专项。' },
    ],
    acceptanceMilestoneKeywords: ['工厂验收', '运输审批', '模块吊装', '联调移交', '竣工验收'],
    evidenceFocusKeywords: ['FAT', '运输审批', '吊装方案', '模块接口', '整体卫浴'],
  },
  luxury_hotel: {
    defaultScenario: 'complete_suite',
    groupSelection: {
      core_quality: 'all',
      site_management: 'recommended',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'brandStandardLevel', 'roomCount', 'publicAreaFitoutLevel', 'kitchenScope', 'openingDate', 'trialOperationScope'],
    recommendationRules: [
      { ruleCode: 'HTL_BRAND', when: 'brandStandardLevel = high', then: '推荐品牌标准、样板确认和客房批量交付', rationale: '高端酒店首要约束是品牌标准。' },
      { ruleCode: 'HTL_PUBLIC_AREA', when: 'publicAreaFitoutLevel = high', then: '强化大堂公区、机电末端和样板间控制', rationale: '高端酒店公区对观感和机电末端要求更高。' },
      { ruleCode: 'HTL_OPENING', when: 'openingDate exists', then: '强化试运营、运营移交和维保资料', rationale: '酒店开业前要完成运营接管。' },
    ],
    greyOutRules: [
      { keyword: 'industrial', reason: '高端酒店默认不启用工业厂房专项。' },
      { keyword: 'civil_defense', reason: '高端酒店默认不启用人防专项。' },
    ],
    acceptanceMilestoneKeywords: ['样板确认', '消防验收', '试运营', '运营移交', '备案'],
    evidenceFocusKeywords: ['品牌标准', '样板间', '材料封样', '试运营', '移交清单'],
  },
  deep_foundation: {
    defaultScenario: 'main_plus_required_support',
    groupSelection: {
      core_quality: 'all',
      site_management: 'all',
      danger_control: 'auto_by_trigger',
      quality_responsibility: 'all',
      project_milestone: 'by_project_type',
      document_commercial_support: 'recommended',
      specialty: 'recommended',
    },
    requiredFeatureFields: ['projectType', 'foundationDepthM', 'pileType', 'supportSystemScope', 'dewateringScope', 'monitoringScope', 'adjacentProtectionScope'],
    recommendationRules: [
      { ruleCode: 'DF_DEEP_PIT', when: 'foundationDepthM >= 3', then: '推荐基坑支护、降水和深基坑危大控制', rationale: '深基坑首先要把危大专项和监测链压实。' },
      { ruleCode: 'DF_MONITOR', when: 'monitoringScope = true', then: '强化监测预警、邻近保护和资料记录', rationale: '复杂基础的风险控制依赖监测闭环。' },
      { ruleCode: 'DF_TEST_PILE', when: 'pileType exists', then: '强化试桩、桩基检测和验槽移交', rationale: '桩基质量必须通过检测和验槽落地。' },
    ],
    greyOutRules: [
      { keyword: 'cleanroom', reason: '深基坑默认不启用洁净专项。' },
      { keyword: 'hotel', reason: '深基坑默认不启用酒店专项。' },
    ],
    acceptanceMilestoneKeywords: ['危大方案审批', '支护降水验收', '试桩确认', '基坑验槽', '基础移交'],
    evidenceFocusKeywords: ['专家论证', '监测预警', '试桩检测', '桩基检测报告', '验槽记录'],
  },
}

export const WBS_TEMPLATE_METHOD_VARIANT_PROFILES: WbsTemplateMethodVariantProfile[] = [
  {
    methodVariantCode: 'aluminum_formwork',
    label: '铝模',
    triggerKeywords: ['铝模', '铝合金模板', '早拆体系'],
    applicableCatalogGroups: ['core_quality', 'danger_control', 'specialty'],
    preferredTemplateKeywords: ['模板', '高支模', '主体结构'],
    rationale: '铝模影响模板安装、拆模、支撑体系和标准层节奏。',
  },
  {
    methodVariantCode: 'climbing_formwork',
    label: '爬模/液压爬升',
    triggerKeywords: ['爬模', '液压爬升', '核心筒爬升'],
    applicableCatalogGroups: ['core_quality', 'danger_control'],
    preferredTemplateKeywords: ['模板', '核心筒', '高处作业'],
    rationale: '爬模属于高风险工法,需要安全方案、验收和过程监测增强。',
  },
  {
    methodVariantCode: 'bored_pile',
    label: '钻孔灌注桩',
    triggerKeywords: ['钻孔灌注桩', '旋挖', '泥浆护壁', '成孔'],
    applicableCatalogGroups: ['core_quality', 'danger_control', 'specialty'],
    preferredTemplateKeywords: ['桩', '成孔', '清孔', '灌注'],
    rationale: '钻孔灌注桩影响成孔、清孔、钢筋笼、导管、水下混凝土和检测。',
  },
  {
    methodVariantCode: 'manual_dug_pile',
    label: '人工挖孔桩',
    triggerKeywords: ['人工挖孔桩', '挖孔桩', '护壁'],
    applicableCatalogGroups: ['core_quality', 'danger_control'],
    preferredTemplateKeywords: ['人工挖孔', '护壁', '通风', '有毒有害'],
    rationale: '人工挖孔桩是安全敏感工法,应优先触发危大和安全监测。',
  },
  {
    methodVariantCode: 'steel_deck_composite_slab',
    label: '压型钢板组合楼板',
    triggerKeywords: ['压型钢板', '组合楼板', '栓钉'],
    applicableCatalogGroups: ['core_quality', 'specialty'],
    preferredTemplateKeywords: ['钢结构', '楼板', '栓钉'],
    rationale: '组合楼板影响钢结构、栓钉焊接、楼承板铺设和混凝土浇筑。',
  },
  {
    methodVariantCode: 'pc_grouting',
    label: '装配式套筒灌浆',
    triggerKeywords: ['套筒灌浆', '灌浆料', '出浆', '封仓'],
    applicableCatalogGroups: ['core_quality', 'quality_responsibility', 'specialty'],
    preferredTemplateKeywords: ['装配式', '灌浆', '预制构件'],
    rationale: '套筒灌浆是装配式质量关键点,需强化见证、试块和记录。',
  },
  {
    methodVariantCode: 'curtain_wall_unitized',
    label: '单元式幕墙',
    triggerKeywords: ['单元式幕墙', '单元板块', '吊装'],
    applicableCatalogGroups: ['danger_control', 'quality_responsibility', 'specialty'],
    preferredTemplateKeywords: ['幕墙', '板块', '吊装', '四性'],
    rationale: '单元式幕墙需要深化、吊装、安全和性能检测增强。',
  },
  {
    methodVariantCode: 'spray_fireproof_coating',
    label: '喷涂型防火涂料',
    triggerKeywords: ['防火涂料', '喷涂', '厚度检测'],
    applicableCatalogGroups: ['core_quality', 'quality_responsibility', 'specialty'],
    preferredTemplateKeywords: ['钢结构', '防火涂料', '厚度'],
    rationale: '防火涂料重点在基层、喷涂、厚度检测和修补验收。',
  },
  {
    methodVariantCode: 'cleanroom_balancing',
    label: '洁净空调调试',
    triggerKeywords: ['洁净', '净化空调', '风量平衡', '洁净度'],
    applicableCatalogGroups: ['quality_responsibility', 'project_milestone', 'specialty'],
    preferredTemplateKeywords: ['洁净', '空调', '调试', '检测'],
    rationale: '洁净空调需要调试、检测、整改和专项验收闭环。',
  },
  {
    methodVariantCode: 'fire_linkage_commissioning',
    label: '消防联动调试',
    triggerKeywords: ['消防联动', '火灾报警', '喷淋', '防排烟'],
    applicableCatalogGroups: ['quality_responsibility', 'project_milestone', 'specialty'],
    preferredTemplateKeywords: ['消防', '联动', '报警', '防排烟'],
    rationale: '消防联动是竣工专项验收前置关键节点。',
  },
  {
    methodVariantCode: 'bim_prefabrication_coordination',
    label: 'BIM 预制加工协调',
    triggerKeywords: ['BIM', '预制加工', '综合排布', '碰撞检查'],
    applicableCatalogGroups: ['core_quality', 'document_commercial_support', 'specialty'],
    preferredTemplateKeywords: ['深化', '排布', '加工', '图纸'],
    rationale: 'BIM 协调用于减少机电、幕墙和装配式加工返工。',
  },
]

export const WBS_TEMPLATE_METHOD_VARIANT_PLAYBOOKS: Record<string, WbsTemplateMethodVariantPlaybook> = {
  aluminum_formwork: {
    recommendationMode: 'include_supporting_pack',
    recommendedActions: [
      { action: 'include', targetKeywords: ['模板', '混凝土', '标准层'], rationale: '铝模影响模板安装、拆模和标准层节奏。' },
      { action: 'require_confirmation', targetKeywords: ['早拆体系', '支撑保留', '拆模强度'], rationale: '早拆和支撑保留必须由项目技术口径确认。' },
      { action: 'evidence_focus', targetKeywords: ['实测实量', '混凝土成型', '拆模令'], rationale: '铝模成型质量和拆模条件需要证据闭合。' },
    ],
    controlCheckpoints: ['首层样板验收', '支撑体系复核', '拆模强度确认', '实测实量复核'],
    evidenceKeywords: ['铝模深化图', '模板验收记录', '拆模令', '混凝土试块报告', '实测实量记录'],
    notAutoExpandedBecause: '铝模影响标准层节奏和局部节点,但是否按楼栋楼层展开仍取决于生成范围和用户确认。',
  },
  climbing_formwork: {
    recommendationMode: 'trigger_control_pack',
    recommendedActions: [
      { action: 'trigger_danger', targetKeywords: ['爬模', '液压爬升', '高处作业'], rationale: '爬模属于高风险体系,应触发危大方案、验收和监测。' },
      { action: 'include', targetKeywords: ['核心筒', '测量校正', '混凝土浇筑'], rationale: '爬模通常服务核心筒结构主线。' },
      { action: 'evidence_focus', targetKeywords: ['爬升验收', '监测记录', '停用拆除条件'], rationale: '爬升和拆除前置条件必须证据化。' },
    ],
    controlCheckpoints: ['专项方案审批', '专家论证', '首段爬升验收', '爬升过程监测', '停用拆除条件确认'],
    evidenceKeywords: ['专项方案', '专家论证意见', '爬升验收记录', '监测记录', '拆除审批'],
    notAutoExpandedBecause: '爬模工序高度依赖核心筒施工组织和厂家方案,seed 只推荐控制包和候选节点。',
  },
  bored_pile: {
    recommendationMode: 'include_supporting_pack',
    recommendedActions: [
      { action: 'include', targetKeywords: ['成孔', '清孔', '钢筋笼', '水下混凝土'], rationale: '钻孔灌注桩现场管理需要全过程节点。' },
      { action: 'evidence_focus', targetKeywords: ['泥浆指标', '孔深孔径', '沉渣厚度', '桩基检测'], rationale: '桩基质量依赖过程检测和成桩检测。' },
      { action: 'require_confirmation', targetKeywords: ['试桩', '后注浆', '桩端持力层'], rationale: '试桩和后注浆是否启用由设计和施工方案决定。' },
    ],
    controlCheckpoints: ['桩位复核', '成孔验收', '钢筋笼隐蔽验收', '混凝土灌注记录', '桩基检测'],
    evidenceKeywords: ['成孔记录', '泥浆检测记录', '钢筋笼隐蔽验收', '灌注记录', '桩基检测报告'],
    notAutoExpandedBecause: '不同桩型、地层和检测比例差异大,不能只凭“桩基”关键词自动拆全量节点。',
  },
  manual_dug_pile: {
    recommendationMode: 'trigger_control_pack',
    recommendedActions: [
      { action: 'trigger_danger', targetKeywords: ['人工挖孔', '护壁', '有毒有害', '通风'], rationale: '人工挖孔桩安全风险高,必须触发危大和日常安全闭环。' },
      { action: 'include', targetKeywords: ['护壁施工', '孔底验收', '钢筋笼', '混凝土灌注'], rationale: '人工挖孔桩需要安全和实体工序并列管理。' },
      { action: 'evidence_focus', targetKeywords: ['气体检测', '通风记录', '护壁验收'], rationale: '安全证据是人工挖孔桩管理核心。' },
    ],
    controlCheckpoints: ['专项方案审批', '班前气体检测', '护壁验收', '孔底验收', '应急救援准备'],
    evidenceKeywords: ['专项方案', '气体检测记录', '通风记录', '护壁验收记录', '孔底验收记录'],
    notAutoExpandedBecause: '人工挖孔桩受地方禁限政策和深度条件影响,必须由工程对象和项目事实确认。',
  },
  steel_deck_composite_slab: {
    recommendationMode: 'include_supporting_pack',
    recommendedActions: [
      { action: 'include', targetKeywords: ['压型钢板', '栓钉', '钢筋', '混凝土'], rationale: '组合楼板跨钢结构和混凝土工序。' },
      { action: 'evidence_focus', targetKeywords: ['栓钉焊接', '楼承板固定', '混凝土浇筑'], rationale: '栓钉和楼承板固定是关键质量点。' },
      { action: 'require_confirmation', targetKeywords: ['临时支撑', '洞口加强', '施工荷载'], rationale: '支撑和荷载控制依赖专项方案。' },
    ],
    controlCheckpoints: ['楼承板排版复核', '栓钉焊接检查', '洞口加强验收', '浇筑前隐蔽验收', '混凝土养护'],
    evidenceKeywords: ['排版图', '栓钉焊接记录', '隐蔽验收记录', '混凝土浇筑记录'],
    notAutoExpandedBecause: '组合楼板是否替代普通楼板节点取决于结构体系和楼层范围。',
  },
  pc_grouting: {
    recommendationMode: 'replace_core_when_selected',
    recommendedActions: [
      { action: 'include', targetKeywords: ['预制构件', '墙板安装', '套筒灌浆', '叠合板'], rationale: '装配式需要细化构件、吊装、连接和现浇叠合。' },
      { action: 'replace_core', targetKeywords: ['主体结构粗颗粒构件安装'], rationale: '选择装配式专项后应压制部分主干粗颗粒节点。' },
      { action: 'evidence_focus', targetKeywords: ['灌浆料复验', '出浆确认', '试块留置', '灌浆记录'], rationale: '套筒灌浆质量证据必须完整。' },
    ],
    controlCheckpoints: ['构件进场验收', '吊装临时固定', '套筒灌浆封仓', '出浆确认', '灌浆试块留置'],
    evidenceKeywords: ['构件合格证', '吊装记录', '灌浆料复验报告', '灌浆记录', '试块报告'],
    notAutoExpandedBecause: '装配式范围可能只覆盖部分楼栋/楼层,必须由工程对象范围确认。',
  },
  curtain_wall_unitized: {
    recommendationMode: 'replace_core_when_selected',
    recommendedActions: [
      { action: 'include', targetKeywords: ['单元板块', '埋件', '吊装', '防火封堵'], rationale: '单元式幕墙需要比普通幕墙更强吊装和板块交接管理。' },
      { action: 'trigger_danger', targetKeywords: ['吊篮', '高处作业', '吊装'], rationale: '幕墙高处作业需触发安全控制。' },
      { action: 'evidence_focus', targetKeywords: ['四性检测', '后置埋件拉拔', '淋水试验'], rationale: '幕墙验收依赖性能检测和试验记录。' },
    ],
    controlCheckpoints: ['深化图确认', '埋件复核', '板块吊装验收', '防雷防火封堵验收', '淋水试验'],
    evidenceKeywords: ['深化图', '拉拔报告', '四性检测报告', '淋水记录', '防火封堵验收'],
    notAutoExpandedBecause: '单元式幕墙板块划分和吊装批次由深化设计决定,不能按主干固定拆行。',
  },
  spray_fireproof_coating: {
    recommendationMode: 'include_supporting_pack',
    recommendedActions: [
      { action: 'include', targetKeywords: ['基层除锈', '防火涂料喷涂', '厚度检测'], rationale: '防火涂料需要完整基层、喷涂、检测和修补链。' },
      { action: 'evidence_focus', targetKeywords: ['材料复验', '干膜厚度', '耐火极限'], rationale: '防火涂料验收证据强。' },
      { action: 'require_confirmation', targetKeywords: ['薄型', '厚型', '室内外环境'], rationale: '涂料类型和环境会改变工序和养护要求。' },
    ],
    controlCheckpoints: ['基层处理验收', '材料进场复验', '分遍喷涂', '厚度检测', '修补验收'],
    evidenceKeywords: ['材料合格证', '复验报告', '厚度检测记录', '验收记录'],
    notAutoExpandedBecause: '防火涂料类型和构件范围差异大,需按钢结构范围确认。',
  },
  cleanroom_balancing: {
    recommendationMode: 'trigger_control_pack',
    recommendedActions: [
      { action: 'include', targetKeywords: ['净化空调', '风量平衡', '压差', '洁净度检测'], rationale: '洁净空调调试和检测是医疗洁净核心。' },
      { action: 'evidence_focus', targetKeywords: ['检测报告', '参数记录', '整改复测'], rationale: '洁净验收依赖第三方检测和复测。' },
      { action: 'require_confirmation', targetKeywords: ['洁净等级', '温湿度', '压差梯度'], rationale: '洁净等级决定调试和检测要求。' },
    ],
    controlCheckpoints: ['系统清洁确认', '风量平衡', '压差温湿度调试', '洁净度检测', '整改复测'],
    evidenceKeywords: ['调试记录', '洁净度检测报告', '压差记录', '温湿度记录', '整改闭合记录'],
    notAutoExpandedBecause: '洁净等级和房间范围必须来自工程对象/医疗专项事实。',
  },
  fire_linkage_commissioning: {
    recommendationMode: 'trigger_control_pack',
    recommendedActions: [
      { action: 'include', targetKeywords: ['火灾报警', '喷淋', '消火栓', '防排烟', '联动调试'], rationale: '消防联动需要多系统协同。' },
      { action: 'evidence_focus', targetKeywords: ['消防检测报告', '联动记录', '整改闭合'], rationale: '消防验收前必须形成检测和整改证据。' },
      { action: 'require_confirmation', targetKeywords: ['消防验收', '备案', '主管部门意见'], rationale: '消防验收状态由验收时间轴承接。' },
    ],
    controlCheckpoints: ['单系统调试', '联动逻辑确认', '消防检测', '问题整改', '验收资料提交'],
    evidenceKeywords: ['单机调试记录', '联动调试记录', '消防检测报告', '整改台账', '验收意见'],
    notAutoExpandedBecause: '消防联动调试依赖系统范围和主管验收流程,不能按关键词静默生成所有节点。',
  },
  bim_prefabrication_coordination: {
    recommendationMode: 'review_only',
    recommendedActions: [
      { action: 'include', targetKeywords: ['深化', '综合排布', '碰撞检查', '预制加工'], rationale: 'BIM 协调改善加工和安装前置条件。' },
      { action: 'evidence_focus', targetKeywords: ['深化图', '碰撞报告', '会审纪要'], rationale: 'BIM 成果应转为可追溯资料。' },
      { action: 'require_confirmation', targetKeywords: ['加工下单', '综合支吊架', '预制机房'], rationale: '是否进入实体任务由项目实施方式决定。' },
    ],
    controlCheckpoints: ['模型交付标准确认', '碰撞检查', '综合排布会审', '加工图确认', '变更闭合'],
    evidenceKeywords: ['BIM 模型版本', '碰撞报告', '综合排布图', '会审纪要', '加工图确认单'],
    notAutoExpandedBecause: 'BIM 是协同方法,不是天然施工工序；只提供推荐和资料控制候选。',
  },
}

export const WBS_TEMPLATE_SEMANTIC_RISK_BUCKETS: WbsTemplateSemanticRiskBucket[] = [
  {
    bucketCode: 'P0_DANGER_PLAN_APPROVAL',
    label: '危大方案审批/专家论证',
    priority: 'P0',
    keywords: ['专项施工方案', '专家论证', '方案审核审批', '方案编制'],
    expectedDurationContributionMode: 'quality_gate',
    expectedExecutionNatures: ['management_action'],
    expectedControlRoles: ['special_plan_control', 'approval_document', 'technical_control'],
    rationale: '危大方案类是管理/审批动作,不得被当作实体工序进入普通工期族。',
  },
  {
    bucketCode: 'P0_DANGER_PHYSICAL_WORK',
    label: '危大实体作业',
    priority: 'P0',
    keywords: ['架体搭设', '塔吊安装', '施工升降机安装', '吊装', '拆除', '临电安装', '附墙', '顶升'],
    expectedDurationContributionMode: 'duration_bearing',
    expectedExecutionNatures: ['physical_work'],
    expectedControlRoles: ['hazardous_work', 'safety_acceptance'],
    rationale: '危大实体作业既是实体施工,又带安全控制属性,不能只作为审批节点。',
  },
  {
    bucketCode: 'P0_ACCEPTANCE_PROJECTION',
    label: '验收/备案/移交投影',
    priority: 'P0',
    keywords: ['竣工验收', '备案完成', '主体验收', '基础验收', '移交', '保修'],
    expectedDurationContributionMode: 'handover_marker',
    expectedExecutionNatures: ['handover_milestone'],
    expectedControlRoles: ['handover_control', 'handover_document'],
    rationale: '验收时间轴投影只能作为计划骨架节点,不反写普通施工进度。',
  },
  {
    bucketCode: 'P0_DOCUMENT_COMMERCIAL',
    label: '资料商务闭合',
    priority: 'P0',
    keywords: ['计量', '结算', '付款', '签证', '索赔', '报审', '归档', '组卷'],
    expectedDurationContributionMode: 'record_only',
    expectedExecutionNatures: ['document_record', 'management_action'],
    expectedControlRoles: ['commercial_document', 'quantity_measurement', 'settlement', 'variation_claim'],
    rationale: '资料商务类是计划中的事项,但不应进入实体工期/物理依赖计算。',
  },
  {
    bucketCode: 'P1_MATERIAL_RETEST',
    label: '材料复验/见证取样',
    priority: 'P1',
    keywords: ['材料进场复验', '见证取样', '送检', '复试', '试块留置'],
    expectedDurationContributionMode: 'external_wait',
    expectedExecutionNatures: ['inspection_test', 'document_record'],
    expectedControlRoles: ['material_retest', 'test_report', 'inspection_record'],
    rationale: '见证取样和送检常伴随等待周期,应和实体施工工期分离。',
  },
  {
    bucketCode: 'P1_PHYSICAL_TEST',
    label: '实体试验/调试',
    priority: 'P1',
    keywords: ['闭水试验', '淋水试验', '试压', '冲洗', '消毒', '联动调试', '漏风量', '绝缘测试'],
    expectedDurationContributionMode: 'quality_gate',
    expectedExecutionNatures: ['physical_work', 'inspection_test'],
    expectedControlRoles: ['test_control', 'test_report'],
    rationale: '实体试验/调试有现场作业属性,但同时承担质量门禁。',
  },
  {
    bucketCode: 'P1_HIDDEN_ACCEPTANCE',
    label: '隐蔽/封堵/预埋',
    priority: 'P1',
    keywords: ['隐蔽', '封堵', '预埋', '埋件', '止水', '套管'],
    expectedDurationContributionMode: 'quality_gate',
    expectedExecutionNatures: ['physical_work', 'inspection_test'],
    expectedControlRoles: ['hidden_control', 'hidden_acceptance'],
    rationale: '隐蔽控制点经常同时是实体动作和质量责任节点,必须保留横切属性。',
  },
  {
    bucketCode: 'P1_MONITORING_WAIT',
    label: '监测/观测/等待',
    priority: 'P1',
    keywords: ['监测', '观测', '沉降', '位移', '测温', '连续运行'],
    expectedDurationContributionMode: 'external_wait',
    expectedExecutionNatures: ['monitoring_wait'],
    expectedControlRoles: ['monitoring_control'],
    rationale: '监测等待不等同于普通施工工期,但会影响风险和节点判断。',
  },
  {
    bucketCode: 'P2_TECH_PREPARATION',
    label: '技术准备/深化/交底',
    priority: 'P2',
    keywords: ['深化', '排版', '图纸', '交底', '参数确认', '作业面确认'],
    expectedDurationContributionMode: 'embedded_check',
    expectedExecutionNatures: ['technical_preparation', 'management_action'],
    expectedControlRoles: ['technical_control'],
    rationale: '技术准备类要参与计划事项,但通常不应成为实体工期族样本。',
  },
  {
    bucketCode: 'P2_DEFECT_REWORK',
    label: '整改/返修/销项',
    priority: 'P2',
    keywords: ['整改', '返修', '缺陷', '空鼓', '开裂', '销项'],
    expectedDurationContributionMode: 'quality_gate',
    expectedExecutionNatures: ['management_action', 'physical_work'],
    expectedControlRoles: ['defect_rework', 'issue_rectification'],
    rationale: '整改销项需要按问题性质区分管理闭合和实体返修,是回流治理重点。',
  },
]

export const WBS_TEMPLATE_EVIDENCE_QUALITY_POLICIES: WbsTemplateEvidenceQualityPolicy[] = [
  {
    policyCode: 'EVIDENCE_DANGER_HIGH_RISK',
    label: '危大工程高风险证据',
    matchKeywords: ['危大', '专项方案', '专家论证', '塔吊', '高支模', '深基坑', '脚手架', '施工升降机'],
    requiredEvidenceLevels: ['standard'],
    preferredEvidenceLevels: ['clause', 'process', 'enterprise_method', 'execution_history'],
    requiredDeliverables: ['危大工程清单', '专项施工方案', '审批记录', '安全技术交底', '专项验收记录'],
    preferredDeliverables: ['专家论证意见', '监测报告', '旁站记录', '整改闭合台账', '设备检测/备案资料'],
    responsibleParties: ['施工单位', '监理单位', '建设单位', '专项分包', '第三方监测/检测单位'],
    completionSignals: ['方案审批通过', '专家意见闭合', '验收挂牌完成', '监测预警闭合', '资料归档完成'],
    upgradeCandidateSignals: ['同类危大节点反复手工新增', '验收资料反复被补充', '危险源触发条件与工程对象字段不一致'],
    rationale: '危大工程应逐步补到条文/流程级依据,并通过历史项目校验触发条件。',
  },
  {
    policyCode: 'EVIDENCE_ACCEPTANCE',
    label: '验收专项证据',
    matchKeywords: ['验收', '备案', '分户验收', '消防验收', '节能验收', '人防验收'],
    requiredEvidenceLevels: ['standard'],
    preferredEvidenceLevels: ['clause', 'process', 'execution_history'],
    requiredDeliverables: ['验收申请/通知', '验收记录', '整改通知与闭合记录', '参建方签认', '验收结论'],
    preferredDeliverables: ['专项检测报告', '验收纪要', '验收照片', '备案回执', '验收时间轴节点状态'],
    responsibleParties: ['建设单位', '监理单位', '施工单位', '设计单位', '勘察单位', '专项主管部门/检测机构'],
    completionSignals: ['验收通过', '整改闭合', '备案受理或回执取得', '验收时间轴状态更新'],
    upgradeCandidateSignals: ['验收节点在项目中反复被手工提前/后置', '验收资料缺失导致节点延期', '某项目类型出现特有专项验收'],
    rationale: '验收节点要有标准与流程依据,避免被误解为普通任务模板。',
  },
  {
    policyCode: 'EVIDENCE_MATERIAL_TEST',
    label: '材料复验/检测证据',
    matchKeywords: ['复验', '送检', '见证取样', '检测报告', '试验报告', '试块'],
    requiredEvidenceLevels: ['standard'],
    preferredEvidenceLevels: ['clause', 'process', 'execution_history'],
    requiredDeliverables: ['材料合格证', '进场验收记录', '见证取样记录', '委托单', '检测/复验报告'],
    preferredDeliverables: ['不合格处置记录', '复检报告', '样品留置照片', '报告闭合台账', '对应检验批资料'],
    responsibleParties: ['施工单位', '监理单位', '材料供应商', '检测机构'],
    completionSignals: ['报告合格', '不合格处置闭合', '材料允许使用', '资料归档完成'],
    upgradeCandidateSignals: ['报告等待导致计划反复调整', '同材料类别频繁新增取样节点', '材料复验节点被用户改成外部等待'],
    rationale: '检测复验涉及等待、见证和报告闭合,需要比普通工序更强证据。',
  },
  {
    policyCode: 'EVIDENCE_COMMERCIAL',
    label: '商务证据',
    matchKeywords: ['计量', '签证', '变更', '索赔', '结算', '付款'],
    requiredEvidenceLevels: ['standard'],
    preferredEvidenceLevels: ['enterprise_method', 'process', 'execution_history'],
    requiredDeliverables: ['合同或清单依据', '工程联系单/变更单', '现场签证资料', '计量确认单', '审批记录'],
    preferredDeliverables: ['影像证据', '会议纪要', '价款测算表', '索赔通知', '闭合记录', '结算送审资料'],
    responsibleParties: ['施工单位商务', '建设单位成本', '监理单位', '设计单位', '分包单位'],
    completionSignals: ['签认完成', '金额确认', '台账更新', '纳入计量/结算', '闭合'],
    upgradeCandidateSignals: ['同类商务节点反复新增', '用户长期保留商务任务但删除普通工序依赖', '商务节点被频繁改为 record_only'],
    rationale: '商务任务可先以标准/合同口径兜底,后续再用企业流程和历史回流补强。',
  },
]

export const WBS_TEMPLATE_FEEDBACK_CANDIDATE_POLICIES: WbsTemplateFeedbackCandidatePolicy[] = [
  {
    candidateCode: 'SEMANTIC_CORRECTION_REPEAT',
    label: '重复语义修正',
    sourceSignals: ['用户连续修改 durationContributionMode', '用户连续修改 executionNature', '同 stableCode 多项目出现同类修正'],
    promotionGate: '同一 stableCode 至少 5 个项目或 3 家公司出现一致修正,进入 semantic_override 候选。',
    targetGovernanceArea: 'semantic_override',
    minimumSampleSize: 5,
    confidenceThreshold: 0.8,
    candidateOutput: 'stableCode 精确语义覆盖候选,包含修改前后 executionNature / durationContributionMode / 6 类横切属性。',
    quarantineConditions: ['同一 stableCode 在不同项目类型下修正方向冲突', '用户只修改了展示标签但未影响工期/依赖', '样本来自同一项目批量复制'],
    negativeSignals: ['修改后又被用户改回', '只发生在单一公司单一项目', '标题弱识别命中错误但 stableCode 本身无误'],
    reviewCadence: '每月项目关闭回流后汇总,重大 P0 可随版本热修。',
  },
  {
    candidateCode: 'PROJECT_TYPE_SELECTION_REPEAT',
    label: '项目类型选择回流',
    sourceSignals: ['某项目类型下 specialty 模板反复被选择', '某项目类型下模板反复被删除'],
    promotionGate: '同 projectType + templateId 命中率超过阈值后,进入 applicability_matrix 候选。',
    targetGovernanceArea: 'applicability_matrix',
    minimumSampleSize: 8,
    confidenceThreshold: 0.7,
    candidateOutput: '项目类型画像推荐/灰显/强提示候选,不直接隐藏 core_quality。',
    quarantineConditions: ['项目类型字段缺失或被用户误填', '专项选择受合同范围而非项目类型驱动', '同项目类型内地区/业态差异过大'],
    negativeSignals: ['生成后立即删除该专项模板', '专项只被少数管理者个人偏好选择', '项目类型与工程对象事实冲突'],
    reviewCadence: '按季度统计,与销售/实施反馈一起评审。',
  },
  {
    candidateCode: 'CORE_SPECIALTY_DUPLICATE_DELETE',
    label: '主干专项重复删除',
    sourceSignals: ['生成后用户删除 core_quality 粗颗粒行', '保留 specialty 细颗粒行', '删除发生在同一 replacesCoreQualityCodes 邻域'],
    promotionGate: '重复删除率超过 60% 且 specialty 保留率超过 80%,进入 replacement_suppression 候选。',
    targetGovernanceArea: 'replacement_suppression',
    minimumSampleSize: 6,
    confidenceThreshold: 0.75,
    candidateOutput: 'replacesCoreQualityCodes / generationMode=replace_core_when_selected 候选。',
    quarantineConditions: ['删除发生在计划行数量控制而非重复冲突', '专项细项只覆盖主干的一部分', '删除的 core 行是项目里程碑或验收投影'],
    negativeSignals: ['用户后续又手工补回 core 行', '专项行被保留但未排期/未分配责任单位', '删除只出现在自定义导入项目'],
    reviewCadence: '每次模板大版本发布前统一审查。',
  },
  {
    candidateCode: 'DEPTH_MANUAL_INSERT',
    label: '深度不足手工补行',
    sourceSignals: ['同分项下用户反复新增相似工序', '新增工序标题可映射到相同 stableCode 父级'],
    promotionGate: '同父级分项跨项目重复新增 5 次以上,进入 depth_precision 候选。',
    targetGovernanceArea: 'depth_precision',
    minimumSampleSize: 5,
    confidenceThreshold: 0.72,
    candidateOutput: '输出候选补行建议，并附 stableCode 候选、现场证据和是否适用专业模板。',
    quarantineConditions: ['新增行属于项目特有施工段/楼层拆分', '新增行是资料/商务事项但被加在施工分项下', '新增行标题无法稳定映射父级'],
    negativeSignals: ['新增后未被排期', '新增后被合并到备注', '同类项目中多数用户不使用'],
    reviewCadence: '每月治理,优先处理 P0/P1 专项和高频主干分项。',
  },
  {
    candidateCode: 'TITLE_MAPPING_FALSE_POSITIVE',
    label: '标题弱识别误匹配',
    sourceSignals: ['用户改掉系统推荐 standardWorkCode', '同标题多次被纠正到另一个 stableCode'],
    promotionGate: '同标题 false-positive 反馈超过阈值,进入 title_mapping 负样本候选。',
    targetGovernanceArea: 'title_mapping',
    minimumSampleSize: 4,
    confidenceThreshold: 0.85,
    candidateOutput: '标题弱识别负样本/同义词候选,仅影响人工任务映射候选排序。',
    quarantineConditions: ['标题过短或缺少专业上下文', '同标题在不同专业语境下合法多义', '用户只修改任务名称未确认 stableCode'],
    negativeSignals: ['纠正目标分散', '同一用户批量误操作', '后续生成仍接受原推荐'],
    reviewCadence: '每两周合并到标题弱识别治理队列。',
  },
  {
    candidateCode: 'SCENARIO_FEATURE_CONFIRMATION_REPEAT',
    label: 'Scenario feature confirmation feedback',
    sourceSignals: ['users repeatedly confirm the same featureAssumptions before generation', 'auto-inferred engineering features are retained in generated preview', 'generated specialty package survives baseline confirmation'],
    promotionGate: 'Same projectType + featureAssumption cluster appears in at least 8 projects with retained generated rows and low post-generation deletion.',
    targetGovernanceArea: 'applicability_matrix',
    minimumSampleSize: 8,
    confidenceThreshold: 0.78,
    candidateOutput: 'scenario combination candidate with projectType, featureAssumptions, templateIds, required stableCode prefixes, and grey-out hints.',
    quarantineConditions: ['feature source is a one-off contract scope note', 'engineering object facts are missing or manually contradicted', 'retained rows come from copied old project plans only'],
    negativeSignals: ['confirmed feature later removed before baseline', 'recommended package deleted repeatedly after preview', 'scenario only works for one company-specific delivery method'],
    reviewCadence: 'Monthly scenario matrix review; high-volume residential/commercial/hospital cases can be reviewed per release.',
  },
  {
    candidateCode: 'GENERATED_RESULT_ASSERTION_DRIFT',
    label: 'Generated result regression feedback',
    sourceSignals: ['golden case generated preview misses expected stableCode', 'generated row semantics differ from seed metadata', 'forbidden runtime effect appears in preview or generated task dependencies'],
    promotionGate: 'Any P0 generated-result assertion failure creates a release-blocking governance candidate until seed, resolver, or test expectation is corrected.',
    targetGovernanceArea: 'depth_precision',
    minimumSampleSize: 4,
    confidenceThreshold: 0.9,
    candidateOutput: 'generated-result drift candidate containing caseCode, assertionCode, missing stableCodes, unexpected runtime effect, and affected templateIds.',
    quarantineConditions: ['failure caused by intentionally disabled template pack', 'test project lacks required feature facts', 'assertion references retired stableCode after approved migration'],
    negativeSignals: ['single local preview cache issue', 'manual custom mode intentionally bypassed recommended packages', 'assertion expectation conflicts with replacement suppression policy'],
    reviewCadence: 'Every seed release and nightly governance regression.',
  },
]

export const WBS_TEMPLATE_GOLDEN_CASE_STABLE_CODE_EXPECTATIONS: Record<string, WbsTemplateGoldenCaseStableCodeExpectation> = {
  residential_shear_wall_basement: {
    caseCode: 'residential_shear_wall_basement',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-waterproof-insulation'],
    requiredStableCodes: ['01-07-01-P01', '02-01-01-P01', '02-01-03-P03', 'DANGER-01-01-01-P03', 'QR-01-01-03-P04'],
    requiredStableCodePrefixes: ['01-07', '02-01', 'WPI-01-01-01'],
    duplicateSuppressionCodes: ['WPI-01-01-01'],
    rationale: 'Typical residential basement generation must bind core structure, basement waterproofing, dangerous-subproject controls, and quality evidence nodes by stableCode.',
  },
  residential_prefab_standard_floor: {
    caseCode: 'residential_prefab_standard_floor',
    requiredTemplateIds: ['china-gb55032-2022', 'china-prefabricated-assembly', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['02-01-01-P01', 'PFB-01-01-01-P01', 'PFB-01-01-01-P02', '02-01-03-P04'],
    requiredStableCodePrefixes: ['02-01', 'PFB-01-01-01'],
    duplicateSuppressionCodes: ['PFB-01-01-01'],
    rationale: 'Prefab residential projects need exact PC component, hoisting, grouting, and concrete structure references.',
  },
  residential_fine_fitout_delivery: {
    caseCode: 'residential_fine_fitout_delivery',
    requiredTemplateIds: ['china-gb55032-2022', 'china-jgj-tianjin-decoration', 'china-building-fine-detail', 'china-document-commercial-support'],
    requiredStableCodes: ['03-09-01-P01', 'WPI-01-01-01-P01', 'DCS-01-01-05-P02', 'MS-01-01-11'],
    requiredStableCodePrefixes: ['03-09', 'WPI-01-01-01'],
    acceptanceProjectionCodes: ['MS-01-01-11'],
    rationale: 'Fine-fitout delivery needs decoration, waterproof, closeout, and filing references without turning acceptance timeline into ordinary work.',
  },
  commercial_complex_basement_podium: {
    caseCode: 'commercial_complex_basement_podium',
    requiredTemplateIds: ['china-gb55032-2022', 'china-foundation-pit-pile', 'china-cecs-fire-system', 'china-facade-curtain-wall', 'china-hvac-system'],
    requiredStableCodes: ['FND-02-01-01-P01', 'DANGER-01-01-01-P04', 'FAC-02-01-02-P07', 'FIR-05-01-02-P07'],
    requiredStableCodePrefixes: ['01-07', 'FND-02-01', 'FAC-02-01', 'FIR-01-01'],
    acceptanceProjectionCodes: ['MS-01-01-17'],
    rationale: 'Commercial podium projects need exact basement, pit, facade, fire, HVAC, and acceptance references.',
  },
  office_tower_core_tube: {
    caseCode: 'office_tower_core_tube',
    requiredTemplateIds: ['china-gb55032-2022', 'china-facade-curtain-wall', 'china-elevator-installation', 'china-intelligent-building-system', 'china-hvac-system'],
    requiredStableCodes: ['02-01-01-P02', '03-09-01-P01', 'ELV-01-01-01-P01', 'INT-01-01-01-P01'],
    requiredStableCodePrefixes: ['02-01', 'FAC-02-01', 'ELV-01-01', 'INT-01-01'],
    rationale: 'Office towers need core-tube, facade, elevator, intelligent-building, and HVAC references.',
  },
  hotel_public_area_fitout: {
    caseCode: 'hotel_public_area_fitout',
    requiredTemplateIds: ['china-gb55032-2022', 'china-jgj-tianjin-decoration', 'china-cecs-fire-system', 'china-plumbing-heating-system', 'china-document-commercial-support'],
    requiredStableCodes: ['03-09-01-P01', 'FIR-01-01-01-P04', '05-01-01-P01', 'DCS-01-01-04-P01'],
    requiredStableCodePrefixes: ['03-09', 'FIR-01-01', '05-01'],
    rationale: 'Hotel public areas need fitout, MEP terminal, fire, and commercial-change evidence references.',
  },
  school_campus_building: {
    caseCode: 'school_campus_building',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-gb55032-2022-outdoor', 'china-cecs-fire-system'],
    requiredStableCodes: ['OUT-01-01-01-P01', 'OUT-01-01-01-P02', 'FIR-01-01-02-P05', '09-01-01-P02'],
    requiredStableCodePrefixes: ['OUT-01-01', 'FIR-01-01', '09-01'],
    rationale: 'School projects need campus outdoor works, energy-saving, and fire acceptance references.',
  },
  hospital_cleanroom_medical: {
    caseCode: 'hospital_cleanroom_medical',
    requiredTemplateIds: ['china-gb55032-2022', 'china-cleanroom-medical-specialty', 'china-hvac-system', 'china-cecs-fire-system', 'china-intelligent-building-system'],
    requiredStableCodes: ['CLN-01-01-01-P01', 'CLN-01-01-01-P02', 'HVA-01-01-01-P07', 'FIR-05-01-02-P07'],
    requiredStableCodePrefixes: ['CLN-01-01', 'HVA-01-01', 'FIR-05-01'],
    acceptanceProjectionCodes: ['MS-01-01-17'],
    rationale: 'Hospital cleanroom delivery must bind cleanroom, HVAC balancing, fire acceptance, and intelligent-system evidence.',
  },
  industrial_steel_factory: {
    caseCode: 'industrial_steel_factory',
    requiredTemplateIds: ['china-gb55032-2022', 'china-steel-structure-specialty', 'china-dangerous-subproject-control', 'china-cecs-fire-system'],
    requiredStableCodes: ['STL-01-01-01-P03', 'STL-01-01-02-P07', 'STL-02-01-01-P01', 'DANGER-01-01-03-P08'],
    requiredStableCodePrefixes: ['STL-01-01', 'STL-02-01', 'DANGER-01-01-03'],
    rationale: 'Industrial steel factories need fabrication, NDT, hoisting, and dangerous lifting controls.',
  },
  logistics_warehouse_mezzanine: {
    caseCode: 'logistics_warehouse_mezzanine',
    requiredTemplateIds: ['china-gb55032-2022', 'china-steel-structure-specialty', 'china-cecs-fire-system', 'china-gb55032-2022-outdoor'],
    requiredStableCodes: ['STL-02-01-01-P01', 'OUT-01-01-01-P02', 'FIR-01-01-01-P05'],
    requiredStableCodePrefixes: ['STL-02-01', 'OUT-01-01', 'FIR-01-01'],
    rationale: 'Logistics warehouses need steel mezzanine, industrial floor/outdoor route, and fire-system references.',
  },
  civil_defense_basement: {
    caseCode: 'civil_defense_basement',
    requiredTemplateIds: ['china-gb55032-2022', 'china-civil-defense-specialty', 'china-dangerous-subproject-control'],
    requiredStableCodes: ['CDF-01-01-01-P04', 'CDF-01-01-02-P06', '01-07-01-P02', 'DANGER-01-01-01-P03'],
    requiredStableCodePrefixes: ['CDF-01-01', '01-07'],
    acceptanceProjectionCodes: ['MS-01-01-11'],
    rationale: 'Civil-defense basement cases must bind civil-defense embedment, door testing, basement waterproofing, and pit controls.',
  },
  deep_basement_pit_project: {
    caseCode: 'deep_basement_pit_project',
    requiredTemplateIds: ['china-gb55032-2022', 'china-foundation-pit-pile', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['FND-02-01-01-P01', 'FND-02-01-01-P08', 'DANGER-01-01-01-P04', 'DANGER-01-01-01-P07'],
    requiredStableCodePrefixes: ['FND-02-01', 'DANGER-01-01-01'],
    rationale: 'Deep basement cases need exact foundation pit construction, monitoring, expert-review, and acceptance references.',
  },
  high_formwork_public_hall: {
    caseCode: 'high_formwork_public_hall',
    requiredTemplateIds: ['china-gb55032-2022', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['02-01-01-P02', 'DANGER-01-01-02-P03', 'DANGER-01-01-02-P04', 'DANGER-01-01-02-P08'],
    requiredStableCodePrefixes: ['02-01-01', 'DANGER-01-01-02'],
    rationale: 'High-formwork public halls need formwork construction plus exact dangerous-subproject approval and acceptance controls.',
  },
  curtain_wall_tower: {
    caseCode: 'curtain_wall_tower',
    requiredTemplateIds: ['china-gb55032-2022', 'china-facade-curtain-wall', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['03-09-01-P01', 'FAC-02-01-02-P07', 'DANGER-01-01-07-P03', 'DANGER-01-01-07-P08'],
    requiredStableCodePrefixes: ['03-09', 'FAC-02-01', 'DANGER-01-01-07'],
    rationale: 'Curtain wall towers must bind facade deepening, performance testing, high-place work controls, and acceptance.',
  },
  fire_system_acceptance: {
    caseCode: 'fire_system_acceptance',
    requiredTemplateIds: ['china-cecs-fire-system', 'china-project-milestone-handover', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['FIR-01-01-01-P06', 'FIR-01-01-02-P05', 'FIR-05-01-02-P07', 'MS-01-01-17'],
    requiredStableCodePrefixes: ['FIR-01-01', 'FIR-05-01'],
    acceptanceProjectionCodes: ['MS-01-01-17'],
    rationale: 'Fire-system acceptance needs fire-system commissioning, filing correction, and milestone projection references.',
  },
  smart_building_security_ba: {
    caseCode: 'smart_building_security_ba',
    requiredTemplateIds: ['china-intelligent-building-system', 'china-electrical-system', 'china-document-commercial-support'],
    requiredStableCodes: ['INT-01-01-01-P05', 'INT-02-01-01-P01', 'ELE-01-01-02-P05'],
    requiredStableCodePrefixes: ['INT-01-01', 'INT-02-01', 'ELE-01-01'],
    rationale: 'Smart-building cases need weak-current, security, and electrical acceptance references.',
  },
  elevator_group_installation: {
    caseCode: 'elevator_group_installation',
    requiredTemplateIds: ['china-elevator-installation', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['ELV-01-01-01-P01', 'ELV-01-01-01-P03', 'ELV-02-01-01-P01', 'DANGER-01-01-03-P03'],
    requiredStableCodePrefixes: ['ELV-01-01', 'ELV-02-01', 'DANGER-01-01-03'],
    rationale: 'Elevator group installation needs hoistway handover, platform acceptance, major equipment installation, and lifting control references.',
  },
  outdoor_road_pipeline_landscape: {
    caseCode: 'outdoor_road_pipeline_landscape',
    requiredTemplateIds: ['china-gb55032-2022-outdoor', 'china-gb55032-2022-municipal', 'china-building-site-management'],
    requiredStableCodes: ['OUT-01-01-01-P01', 'OUT-01-01-01-P02', 'OUT-01-01-01-P03'],
    requiredStableCodePrefixes: ['OUT-01-01'],
    rationale: 'Outdoor projects need exact road and municipal handover references.',
  },
  roof_waterproof_energy_saving: {
    caseCode: 'roof_waterproof_energy_saving',
    requiredTemplateIds: ['china-gb55032-2022', 'china-waterproof-insulation'],
    requiredStableCodes: ['09-01-01-P02', 'WPI-01-01-01-P02'],
    requiredStableCodePrefixes: ['09-01', 'WPI-01-01'],
    rationale: 'Roof/waterproof energy-saving cases need insulation and waterproof evidence references.',
  },
  basement_waterproof_detail: {
    caseCode: 'basement_waterproof_detail',
    requiredTemplateIds: ['china-gb55032-2022', 'china-waterproof-insulation'],
    requiredStableCodes: ['01-07-01-P01', '01-07-01-P02', 'WPI-01-01-01-P01', 'WPI-01-01-01-P02'],
    requiredStableCodePrefixes: ['01-07', 'WPI-01-01'],
    duplicateSuppressionCodes: ['WPI-01-01-01'],
    rationale: 'Basement waterproof detail cases must bind core waterproofing and specialty waterproof details without duplicate expansion.',
  },
  temporary_facilities_startup: {
    caseCode: 'temporary_facilities_startup',
    requiredTemplateIds: ['china-building-site-management', 'china-dangerous-subproject-control'],
    requiredStableCodes: ['DANGER-01-01-06-P01', 'DANGER-01-01-06-P02', 'DANGER-01-01-06-P06'],
    requiredStableCodePrefixes: ['DANGER-01-01-06'],
    rationale: 'Site startup cases need temporary power scheme, acceptance, and tagging references.',
  },
  completion_filing_handover: {
    caseCode: 'completion_filing_handover',
    requiredTemplateIds: ['china-project-milestone-handover', 'china-document-commercial-support', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['MS-01-01-11', 'FIR-05-01-02-P07', 'DCS-01-01-05-P02'],
    requiredStableCodePrefixes: ['MS-01-01', 'DCS-01-01'],
    acceptanceProjectionCodes: ['MS-01-01-11'],
    rationale: 'Completion filing handover must connect milestones, acceptance evidence, and commercial closeout.',
  },
  variation_claim_closeout: {
    caseCode: 'variation_claim_closeout',
    requiredTemplateIds: ['china-document-commercial-support'],
    requiredStableCodes: ['DCS-01-01-04-P01', 'DCS-01-01-05-P02'],
    requiredStableCodePrefixes: ['DCS-01-01'],
    rationale: 'Variation and claim closeout should be governed as commercial/document tasks, not physical work.',
  },
  maintenance_warranty_turnover: {
    caseCode: 'maintenance_warranty_turnover',
    requiredTemplateIds: ['china-project-milestone-handover', 'china-document-commercial-support'],
    requiredStableCodes: ['MS-01-01-11', 'DCS-01-01-05-P02'],
    requiredStableCodePrefixes: ['MS-01-01', 'DCS-01-01'],
    acceptanceProjectionCodes: ['MS-01-01-11'],
    rationale: 'Warranty turnover needs filing, handover, and document closeout references.',
  },
}

export const WBS_TEMPLATE_GOLDEN_CASE_STRONG_ASSERTIONS: Record<string, WbsTemplateGoldenCaseStrongAssertion> = {
  residential_shear_wall_basement: {
    caseCode: 'residential_shear_wall_basement',
    semanticChecks: [
      { stableCode: '02-01-03-P03', metadataField: 'durationContributionMode', expectedValue: 'embedded_check' },
      { stableCode: 'DANGER-01-01-01-P03', metadataField: 'planItemKind', expectedValue: 'safety_control' },
      { stableCode: 'QR-01-01-03-P04', metadataField: 'planItemKind', expectedValue: 'inspection_task' },
    ],
    evidenceRefChecks: [
      { stableCode: 'DANGER-01-01-01-P04', evidenceCode: 'MOHURD-37-2018' },
      { stableCode: 'QR-01-01-03-P04', evidenceCode: 'GB50300-2013' },
    ],
    rationale: 'Residential basement cases must keep physical preparation, dangerous-subproject approval, and witness-sampling evidence separated.',
  },
  residential_prefab_standard_floor: {
    caseCode: 'residential_prefab_standard_floor',
    semanticChecks: [
      { stableCode: 'PFB-01-01-01-P01', metadataField: 'durationContributionMode', expectedValue: 'embedded_check' },
      { stableCode: 'PFB-01-01-01-P02', metadataField: 'executionNature', expectedValue: 'document_record' },
      { stableCode: '02-01-03-P04', metadataField: 'durationContributionMode', expectedValue: 'quality_gate' },
    ],
    evidenceRefChecks: [
      { stableCode: 'PFB-01-01-01-P02', evidenceCode: 'GB/T51231' },
      { stableCode: 'QR-01-01-03-P04', evidenceCode: 'GB50300-2013' },
    ],
    rationale: 'Prefab cases must keep component acceptance, documentation, and concrete quality gates explicit.',
  },
  commercial_complex_basement_podium: {
    caseCode: 'commercial_complex_basement_podium',
    semanticChecks: [
      { stableCode: 'FND-02-01-01-P04', metadataField: 'executionNature', expectedValue: 'physical_work' },
      { stableCode: 'DANGER-01-01-01-P04', metadataField: 'planItemKind', expectedValue: 'safety_control' },
      { stableCode: 'FIR-05-01-02-P07', metadataField: 'executionNature', expectedValue: 'document_record' },
    ],
    evidenceRefChecks: [
      { stableCode: 'FAC-02-01-02-P07', evidenceCode: 'GB/T21086' },
      { stableCode: 'FIR-05-01-02-P07', evidenceCode: 'GB55036' },
    ],
    rationale: 'Commercial complex regression must distinguish pit physical works, danger expert review, and fire filing evidence.',
  },
  hospital_cleanroom_medical: {
    caseCode: 'hospital_cleanroom_medical',
    semanticChecks: [
      { stableCode: 'CLN-01-01-01-P02', metadataField: 'executionNature', expectedValue: 'physical_work' },
      { stableCode: 'HVA-01-01-01-P07', metadataField: 'durationContributionMode', expectedValue: 'duration_bearing' },
      { stableCode: 'FIR-05-01-02-P07', metadataField: 'durationContributionMode', expectedValue: 'record_only' },
    ],
    evidenceRefChecks: [
      { stableCode: 'CLN-01-01-01-P02', evidenceCode: 'GB50591' },
      { stableCode: 'HVA-01-01-01-P07', evidenceCode: 'GB50243' },
    ],
    rationale: 'Hospital cleanroom cases need cleanroom execution, HVAC testing, and acceptance filing semantics to remain stable.',
  },
  industrial_steel_factory: {
    caseCode: 'industrial_steel_factory',
    semanticChecks: [
      { stableCode: 'STL-01-01-01-P03', metadataField: 'executionNature', expectedValue: 'physical_work' },
      { stableCode: 'STL-01-01-02-P07', metadataField: 'executionNature', expectedValue: 'document_record' },
      { stableCode: 'DANGER-01-01-03-P08', metadataField: 'planItemKind', expectedValue: 'inspection_task' },
    ],
    evidenceRefChecks: [
      { stableCode: 'STL-01-01-02-P07', evidenceCode: 'GB50205-2020' },
      { stableCode: 'DANGER-01-01-03-P08', evidenceCode: 'MOHURD-37-2018' },
    ],
    rationale: 'Industrial steel cases must not confuse steel fabrication, NDT records, and dangerous lifting acceptance.',
  },
  fire_system_acceptance: {
    caseCode: 'fire_system_acceptance',
    semanticChecks: [
      { stableCode: 'FIR-01-01-01-P06', metadataField: 'durationContributionMode', expectedValue: 'quality_gate' },
      { stableCode: 'FIR-05-01-02-P07', metadataField: 'executionNature', expectedValue: 'document_record' },
    ],
    evidenceRefChecks: [
      { stableCode: 'FIR-05-01-02-P07', evidenceCode: 'GB55036' },
      { stableCode: 'FIR-05-01-02-P07', evidenceCode: 'PROCESS-ACCEPTANCE-TIMELINE' },
    ],
    rationale: 'Fire acceptance strong assertions protect the boundary between commissioning work and acceptance filing projection.',
  },
  variation_claim_closeout: {
    caseCode: 'variation_claim_closeout',
    semanticChecks: [
      { stableCode: 'DCS-01-01-04-P01', metadataField: 'planItemKind', expectedValue: 'commercial_task' },
      { stableCode: 'DCS-01-01-04-P01', metadataField: 'durationContributionMode', expectedValue: 'record_only' },
      { stableCode: 'DCS-01-01-05-P02', metadataField: 'planItemKind', expectedValue: 'commercial_task' },
    ],
    evidenceRefChecks: [
      { stableCode: 'DCS-01-01-04-P01', evidenceCode: 'GB/T50500-2024' },
      { stableCode: 'DCS-01-01-05-P02', evidenceCode: 'PROCESS-COMMERCIAL-EVIDENCE' },
    ],
    rationale: 'Commercial closeout must stay out of physical duration-bearing classification while retaining evidence-chain coverage.',
  },
  hotel_public_area_fitout: {
    caseCode: 'hotel_public_area_fitout',
    semanticChecks: [
      { stableCode: 'FIR-05-01-01-P06', metadataField: 'durationContributionMode', expectedValue: 'record_only' },
      { stableCode: 'PLU-06-01-01-P07', metadataField: 'durationContributionMode', expectedValue: 'quality_gate' },
      { stableCode: 'DCS-01-01-04-P01', metadataField: 'planItemKind', expectedValue: 'commercial_task' },
    ],
    evidenceRefChecks: [
      { stableCode: 'FIR-05-01-01-P06', evidenceCode: 'GB55037' },
      { stableCode: 'PLU-06-01-01-P07', evidenceCode: 'CJJ94' },
    ],
    rationale: 'Hotel opening regression protects public-fitout, fire report handover, gas commissioning, and commercial change evidence boundaries.',
  },
  school_campus_building: {
    caseCode: 'school_campus_building',
    semanticChecks: [
      { stableCode: 'SITE-01-01-02-P02', metadataField: 'executionNature', expectedValue: 'physical_work' },
      { stableCode: 'SITE-01-01-06-P05', metadataField: 'planItemKind', expectedValue: 'inspection_task' },
      { stableCode: 'OUT-05-01-01-P02', metadataField: 'durationContributionMode', expectedValue: 'quality_gate' },
    ],
    evidenceRefChecks: [
      { stableCode: 'SITE-01-01-06-P05', evidenceCode: 'JGJ46' },
      { stableCode: 'OUT-05-01-01-P02', evidenceCode: 'GB50268' },
    ],
    rationale: 'School campus delivery must distinguish real temporary-road works, temporary-power acceptance, and external utility connection gates.',
  },
  smart_building_security_ba: {
    caseCode: 'smart_building_security_ba',
    semanticChecks: [
      { stableCode: 'INT-04-01-01-P02', metadataField: 'executionNature', expectedValue: 'physical_work' },
      { stableCode: 'INT-04-01-01-P08', metadataField: 'durationContributionMode', expectedValue: 'handover_marker' },
      { stableCode: 'HVA-02-01-02-P06', metadataField: 'durationContributionMode', expectedValue: 'handover_marker' },
    ],
    evidenceRefChecks: [
      { stableCode: 'INT-04-01-01-P08', evidenceCode: 'GB50174' },
      { stableCode: 'HVA-02-01-02-P06', evidenceCode: 'GB50738' },
    ],
    rationale: 'Smart-building and data-room cases must keep equipment installation, system commissioning, and operation handover semantics explicit.',
  },
  elevator_group_installation: {
    caseCode: 'elevator_group_installation',
    semanticChecks: [
      { stableCode: 'ELV-01-01-01-P03', metadataField: 'durationContributionMode', expectedValue: 'quality_gate' },
      { stableCode: 'ELV-02-01-02-P07', metadataField: 'durationContributionMode', expectedValue: 'handover_marker' },
      { stableCode: 'DANGER-01-01-03-P08', metadataField: 'planItemKind', expectedValue: 'inspection_task' },
    ],
    evidenceRefChecks: [
      { stableCode: 'ELV-02-01-02-P07', evidenceCode: 'TSG T7001' },
      { stableCode: 'DANGER-01-01-03-P08', evidenceCode: 'MOHURD-37-2018' },
    ],
    rationale: 'Elevator group installation must keep working-platform acceptance, supervision-inspection registration, and lifting-control evidence separated.',
  },
  temporary_facilities_startup: {
    caseCode: 'temporary_facilities_startup',
    semanticChecks: [
      { stableCode: 'SITE-01-01-03-P02', metadataField: 'executionNature', expectedValue: 'physical_work' },
      { stableCode: 'SITE-01-01-06-P05', metadataField: 'planItemKind', expectedValue: 'inspection_task' },
      { stableCode: 'DANGER-01-01-06-P06', metadataField: 'planItemKind', expectedValue: 'safety_control' },
    ],
    evidenceRefChecks: [
      { stableCode: 'SITE-01-01-06-P05', evidenceCode: 'JGJ46' },
      { stableCode: 'DANGER-01-01-06-P06', evidenceCode: 'JGJ46' },
    ],
    rationale: 'Startup temporary facilities must keep physical temporary works, site acceptance, and dangerous temporary-power control from collapsing into one task type.',
  },
}

export const WBS_TEMPLATE_PROJECT_SCENARIO_COMBINATIONS: WbsTemplateProjectScenarioCombination[] = [
  {
    scenarioCode: 'residential_basement_pit_waterproof',
    projectType: 'residential',
    label: '住宅地下室 + 深基坑 + 地下防水',
    featureAssumptions: ['basementLevelCount > 0', 'foundationDepthM >= 3', 'waterproofGrade exists'],
    primaryTemplateIds: ['china-gb55032-2022', 'china-foundation-pit-pile', 'china-waterproof-insulation'],
    supportingTemplateIds: ['china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['01-07-01-P01', '01-07-01-P02', 'FND-02-01-01-P04', 'DANGER-01-01-01-P04', 'WPI-01-01-01-P02'],
    requiredStableCodePrefixes: ['01-07', 'FND-02-01', 'WPI-01-01'],
    optionalTemplateIds: ['china-building-fine-detail'],
    rationale: '住宅地下室现场最容易漏掉基坑、地下防水细部和危大专家论证的组合关系。',
  },
  {
    scenarioCode: 'residential_prefab_fine_delivery',
    projectType: 'residential',
    label: '装配式住宅 + 精装交付',
    featureAssumptions: ['structureType includes prefabricated', 'isFineFitout = true', 'handoverMode = batch_delivery'],
    primaryTemplateIds: ['china-gb55032-2022', 'china-prefabricated-assembly', 'china-jgj-tianjin-decoration'],
    supportingTemplateIds: ['china-building-fine-detail', 'china-quality-responsibility-acceptance', 'china-document-commercial-support'],
    requiredStableCodes: ['PFB-01-01-01-P01', 'PFB-01-01-01-P02', 'WPI-01-01-01-P01', 'DCS-01-01-05-P02'],
    requiredStableCodePrefixes: ['PFB-01-01', '03-09', 'WPI-01-01'],
    rationale: '装配式住宅精装交付需要把 PC 质量链、精装防水销项和资料商务闭环绑在一起。',
  },
  {
    scenarioCode: 'commercial_podium_fire_hvac_facade',
    projectType: 'commercial',
    label: '商业裙房 + 消防联动 + 暖通 + 幕墙',
    featureAssumptions: ['openingDate exists', 'fireSystemScope exists', 'curtainWallArea > 0', 'hvacSystemType exists'],
    primaryTemplateIds: ['china-cecs-fire-system', 'china-hvac-system', 'china-facade-curtain-wall'],
    supportingTemplateIds: ['china-gb55032-2022', 'china-project-milestone-handover', 'china-document-commercial-support'],
    requiredStableCodes: ['FIR-01-01-01-P06', 'FIR-05-01-02-P07', 'HVA-01-01-01-P07', 'FAC-02-01-02-P07', 'MS-01-01-17'],
    requiredStableCodePrefixes: ['FIR-01-01', 'HVA-01-01', 'FAC-02-01'],
    rationale: '商业开业压力下,消防、暖通、幕墙和竣工验收投影必须形成一组可解释计划骨架。',
  },
  {
    scenarioCode: 'office_tower_elevator_intelligent_facade',
    projectType: 'office',
    label: '办公塔楼 + 电梯群控 + 智能化 + 幕墙',
    featureAssumptions: ['towerHeightM >= 50', 'elevatorCount >= 4', 'intelligentSystemScope exists', 'curtainWallArea > 0'],
    primaryTemplateIds: ['china-elevator-installation', 'china-intelligent-building-system', 'china-facade-curtain-wall'],
    supportingTemplateIds: ['china-hvac-system', 'china-electrical-system', 'china-dangerous-subproject-control'],
    requiredStableCodes: ['ELV-01-01-01-P01', 'ELV-01-01-01-P03', 'INT-01-01-01-P05', 'FAC-02-01-02-P07'],
    requiredStableCodePrefixes: ['ELV-01-01', 'INT-01-01', 'FAC-02-01'],
    rationale: '办公塔楼交付高度依赖电梯、智能化、幕墙和高处作业控制。',
  },
  {
    scenarioCode: 'hospital_cleanroom_fire_hvac',
    projectType: 'hospital',
    label: '医院洁净区 + 消防 + 暖通平衡',
    featureAssumptions: ['cleanroomLevel exists', 'icuOrOperatingRoomScope = true', 'fireSystemScope exists'],
    primaryTemplateIds: ['china-cleanroom-medical-specialty', 'china-hvac-system', 'china-cecs-fire-system'],
    supportingTemplateIds: ['china-intelligent-building-system', 'china-project-milestone-handover'],
    requiredStableCodes: ['CLN-01-01-01-P01', 'CLN-01-01-01-P02', 'HVA-01-01-01-P07', 'FIR-05-01-02-P07'],
    requiredStableCodePrefixes: ['CLN-01-01', 'HVA-01-01', 'FIR-05-01'],
    rationale: '医院洁净场景必须把洁净装修、空调平衡、消防验收和专项资料闭环一并考虑。',
  },
  {
    scenarioCode: 'industrial_steel_floor_crane',
    projectType: 'industrial',
    label: '工业钢结构厂房 + 耐磨地坪 + 吊装',
    featureAssumptions: ['steelStructureSpanM > 0', 'industrialFloorScope = true', 'craneTonnage > 0'],
    primaryTemplateIds: ['china-steel-structure-specialty', 'china-building-fine-detail', 'china-dangerous-subproject-control'],
    supportingTemplateIds: ['china-cecs-fire-system', 'china-electrical-system'],
    requiredStableCodes: ['STL-02-01-01-P01', 'STL-01-01-02-P07', 'BDT-02-01-01-P03', 'BDT-02-01-01-P08', 'DANGER-01-01-03-P08'],
    requiredStableCodePrefixes: ['STL-01-01', 'STL-02-01', 'BDT-02-01'],
    rationale: '工业厂房现场计划常被钢构吊装、地坪移交和消防验收共同卡住。',
  },
  {
    scenarioCode: 'civil_defense_basement_handover',
    projectType: 'civil_defense',
    label: '人防地下室 + 防护门 + 通风验收',
    featureAssumptions: ['civilDefenseUnitCount > 0', 'civilDefenseDoorCount > 0', 'civilDefenseVentilationScope = true'],
    primaryTemplateIds: ['china-civil-defense-specialty', 'china-waterproof-insulation', 'china-gb55032-2022'],
    supportingTemplateIds: ['china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    requiredStableCodes: ['CDF-01-01-01-P04', 'CDF-01-01-02-P06', '01-07-01-P02', 'WPI-01-01-01-P02'],
    requiredStableCodePrefixes: ['CDF-01-01', 'WPI-01-01', '01-07'],
    rationale: '人防地下室需要把结构预埋、防护门检测、地下防水和专项验收结合起来。',
  },
  {
    scenarioCode: 'logistics_warehouse_outdoor_fire',
    projectType: 'logistics',
    label: '物流仓储 + 室外货运道路 + 消防',
    featureAssumptions: ['warehouseArea large', 'outdoorTruckRouteScope = true', 'fireSystemScope exists'],
    primaryTemplateIds: ['china-steel-structure-specialty', 'china-gb55032-2022-outdoor', 'china-cecs-fire-system'],
    supportingTemplateIds: ['china-electrical-system', 'china-building-fine-detail'],
    requiredStableCodes: ['STL-02-01-01-P01', 'OUT-01-01-01-P02', 'FIR-01-01-01-P05', 'BDT-02-01-01-P08'],
    requiredStableCodePrefixes: ['STL-02-01', 'OUT-01-01', 'FIR-01-01'],
    rationale: '物流仓储投用条件受钢结构、室外道路、消防和地坪验收共同影响。',
  },
  {
    scenarioCode: 'hotel_opening_public_fitout_gas_fire',
    projectType: 'hotel',
    label: 'Hotel opening + public fitout + gas/fire commissioning',
    featureAssumptions: ['openingDate exists', 'publicAreaFitoutLevel = high', 'commercialKitchenGasScope = true', 'fireSystemScope exists'],
    primaryTemplateIds: ['china-jgj-tianjin-decoration', 'china-cecs-fire-system', 'china-plumbing-heating-system'],
    supportingTemplateIds: ['china-hvac-system', 'china-document-commercial-support', 'china-project-milestone-handover'],
    requiredStableCodes: ['FIR-05-01-01-P06', 'FIR-05-01-02-P07', 'PLU-06-01-01-P07', 'HVA-02-01-02-P06', 'DCS-01-01-04-P01'],
    requiredStableCodePrefixes: ['FIR-05-01', 'PLU-06-01', 'HVA-02-01', 'DCS-01-01'],
    rationale: 'Hotel opening pressure commonly couples fitout closeout, fire detection report handover, gas commissioning, HVAC balancing, and commercial change evidence.',
  },
  {
    scenarioCode: 'school_term_campus_outdoor_utility',
    projectType: 'school',
    label: 'School term opening + campus outdoor + utility connection',
    featureAssumptions: ['seasonalOpeningDate exists', 'campusOutdoorScope = true', 'externalUtilityConnectionScope = true'],
    primaryTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-gb55032-2022-outdoor'],
    supportingTemplateIds: ['china-cecs-fire-system', 'china-electrical-system', 'china-project-milestone-handover'],
    requiredStableCodes: ['SITE-01-01-02-P02', 'SITE-01-01-06-P05', 'OUT-01-01-01-P02', 'OUT-05-01-01-P02', 'ELE-05-01-01-P07'],
    requiredStableCodePrefixes: ['SITE-01-01', 'OUT-01-01', 'OUT-05-01', 'ELE-05-01'],
    rationale: 'School delivery is often constrained by temporary-site acceptance, outdoor roads, formal utility connection, and term-opening milestones.',
  },
  {
    scenarioCode: 'data_center_core_room_power_hvac',
    projectType: 'data_center',
    label: 'Data center core room + emergency power + precision HVAC',
    featureAssumptions: ['dataCenterTier exists', 'dualPowerRequired = true', 'precisionCoolingScope = true', 'coreRoomArea > 0'],
    primaryTemplateIds: ['china-intelligent-building-system', 'china-electrical-system', 'china-hvac-system'],
    supportingTemplateIds: ['china-cecs-fire-system', 'china-document-commercial-support'],
    requiredStableCodes: ['INT-04-01-01-P02', 'INT-04-01-01-P08', 'ELE-04-01-01-P08', 'ELE-05-01-01-P07', 'HVA-05-01-01-P08'],
    requiredStableCodePrefixes: ['INT-04-01', 'ELE-04-01', 'ELE-05-01', 'HVA-05-01'],
    optionalTemplateIds: ['china-cleanroom-medical-specialty'],
    rationale: 'Data-center rooms need a precise combination of weak-current room fitout, emergency power, formal energization, cooling mode switching, and operation handover.',
  },
  {
    scenarioCode: 'existing_building_renovation_demolition_reinforcement',
    projectType: 'renovation',
    label: 'Existing building renovation + demolition + reinforcement',
    featureAssumptions: ['existingStructureSurvey = true', 'demolitionScope exists', 'temporarySupportRequired = true', 'newOldStructureConnectionScope = true'],
    primaryTemplateIds: ['china-building-fine-detail', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    supportingTemplateIds: ['china-document-commercial-support', 'china-gb55032-2022'],
    requiredStableCodes: ['BDT-03-01-01-P01', 'BDT-03-01-01-P02', 'BDT-03-01-01-P03', 'DANGER-01-01-08-P04', 'DANGER-01-01-08-P06'],
    requiredStableCodePrefixes: ['BDT-03-01', 'DANGER-01-01-08'],
    rationale: 'Renovation and demolition cases need existing-condition evidence, isolation, support unloading, demolition control, and dangerous-subproject review in one scenario.',
  },
  {
    scenarioCode: 'highrise_residential_elevator_temp_power_fire',
    projectType: 'residential',
    label: 'High-rise residential + elevator group + temporary/formal power + fire handover',
    featureAssumptions: ['buildingHeightM >= 50', 'elevatorCount >= 3', 'temporaryPowerRequired = true', 'formalPowerCutoverRequired = true', 'residentialChargingPileScope = true'],
    primaryTemplateIds: ['china-gb55032-2022', 'china-elevator-installation', 'china-electrical-system'],
    supportingTemplateIds: ['china-dangerous-subproject-control', 'china-cecs-fire-system', 'china-project-milestone-handover'],
    requiredStableCodes: ['ELV-01-01-01-P03', 'ELV-02-01-02-P07', 'SITE-01-01-06-P05', 'DANGER-01-01-06-P06', 'ELE-05-01-01-P07', 'ELE-03-02-01-P08', 'MS-01-01-23'],
    requiredStableCodePrefixes: ['ELV-01-01', 'ELV-02-01', 'SITE-01-01-06', 'DANGER-01-01-06', 'ELE-05-01', 'ELE-03-02', 'MS-01-01'],
    rationale: 'High-rise residential delivery often depends on elevator access, temporary power acceptance, formal power cutover, residential charging-pile acceptance, and fire/electrical handover readiness.',
  },
  {
    scenarioCode: 'site_startup_temp_power_safety_civilized',
    projectType: 'general_building',
    label: 'Site startup + temporary power + civilized construction',
    featureAssumptions: ['temporaryPowerRequired = true', 'siteEntranceScope = true', 'dustControlRequired = true', 'safetyEducationRequired = true'],
    primaryTemplateIds: ['china-building-site-management', 'china-dangerous-subproject-control'],
    supportingTemplateIds: ['china-quality-responsibility-acceptance', 'china-document-commercial-support'],
    requiredStableCodes: ['SITE-01-01-06-P05', 'SITE-04-01-01-P03', 'DANGER-01-01-06-P01', 'DANGER-01-01-06-P06'],
    requiredStableCodePrefixes: ['SITE-01-01', 'SITE-04-01', 'DANGER-01-01-06'],
    rationale: 'Startup projects should generate real site-preparation tasks plus temporary-power control and safety-education closure before ordinary production work.',
  },
  {
    scenarioCode: 'commercial_mep_formal_power_fire_acceptance',
    projectType: 'commercial',
    label: 'Commercial MEP + formal power + fire acceptance',
    featureAssumptions: ['formalPowerCutoverRequired = true', 'fireSystemScope exists', 'commissioningWindow exists', 'openingDate exists'],
    primaryTemplateIds: ['china-electrical-system', 'china-cecs-fire-system', 'china-hvac-system'],
    supportingTemplateIds: ['china-project-milestone-handover', 'china-document-commercial-support'],
    requiredStableCodes: ['ELE-05-01-01-P07', 'FIR-05-01-02-P07', 'HVA-05-01-01-P08', 'MS-01-01-17', 'DCS-01-01-05-P02'],
    requiredStableCodePrefixes: ['ELE-05-01', 'FIR-05-01', 'HVA-05-01', 'MS-01-01'],
    rationale: 'Commercial MEP closeout commonly hinges on formal power, HVAC/fire commissioning, acceptance projection, and document/commercial closeout in one generated package.',
  },
  {
    scenarioCode: 'renovation_demolition_fire_stopping_closeout',
    projectType: 'renovation',
    label: 'Renovation + demolition + fire stopping + closeout',
    featureAssumptions: ['existingStructureSurvey = true', 'demolitionScope exists', 'fireCompartmentChange = true', 'closeoutArchiveRequired = true'],
    primaryTemplateIds: ['china-building-fine-detail', 'china-dangerous-subproject-control', 'china-cecs-fire-system'],
    supportingTemplateIds: ['china-document-commercial-support', 'china-quality-responsibility-acceptance'],
    requiredStableCodes: ['BDT-03-01-01-P01', 'DANGER-01-01-08-P04', 'DANGER-01-01-08-P06', 'FIR-06-01-01-P07', 'DCS-01-01-01-P03'],
    requiredStableCodePrefixes: ['BDT-03-01', 'DANGER-01-01-08', 'FIR-06-01', 'DCS-01-01'],
    rationale: 'Renovation projects need existing-condition evidence, demolition controls, fire-stopping closure, and archive handover without pretending these are ordinary new-build rows.',
  },
]

export const WBS_TEMPLATE_PROJECT_TEMPLATE_COMBINATIONS: Record<string, WbsTemplateProjectTemplateCombination> = {
  residential: {
    projectType: 'residential',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-waterproof-insulation', 'china-jgj-tianjin-decoration', 'china-plumbing-heating-system', 'china-electrical-system', 'china-building-fine-detail'],
    conditionalTemplateRules: [
      { ruleCode: 'RES_BASEMENT', when: 'basementLevelCount > 0', includeTemplateIds: ['china-waterproof-insulation', 'china-foundation-pit-pile'], requireStableCodePrefixes: ['01-07', 'WPI-01-01', 'FND-02-01'], rationale: 'Basement residential projects need waterproof and foundation-pit detail.' },
      { ruleCode: 'RES_PREFAB', when: 'structureType includes prefabricated', includeTemplateIds: ['china-prefabricated-assembly'], requireStableCodePrefixes: ['PFB-01-01'], rationale: 'Prefab should add PC component and grouting detail.' },
      { ruleCode: 'RES_FINE_FITOUT', when: 'isFineFitout = true', includeTemplateIds: ['china-jgj-tianjin-decoration', 'china-building-fine-detail'], requireStableCodePrefixes: ['03-09', 'WPI-01-01'], rationale: 'Fine-fitout delivery needs decoration and detailed closeout coverage.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-civil-defense-specialty'],
    rationale: 'Residential defaults are complete-suite plus waterproof, decoration, MEP, and fine-detail recommendations.',
  },
  commercial: {
    projectType: 'commercial',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-foundation-pit-pile', 'china-cecs-fire-system', 'china-facade-curtain-wall', 'china-hvac-system', 'china-electrical-system', 'china-intelligent-building-system'],
    conditionalTemplateRules: [
      { ruleCode: 'COM_DEEP_PIT', when: 'foundationDepthM >= 3', includeTemplateIds: ['china-foundation-pit-pile'], requireStableCodePrefixes: ['FND-02-01', 'DANGER-01-01-01'], rationale: 'Commercial basements often trigger pit and monitoring detail.' },
      { ruleCode: 'COM_FACADE', when: 'curtainWallArea > 0', includeTemplateIds: ['china-facade-curtain-wall'], requireStableCodePrefixes: ['FAC-02-01', '03-09'], rationale: 'Curtain wall area should add facade specialty.' },
      { ruleCode: 'COM_FIRE_HVAC', when: 'openingDate exists', includeTemplateIds: ['china-cecs-fire-system', 'china-hvac-system'], requireStableCodePrefixes: ['FIR-01-01', 'HVA-01-01'], rationale: 'Opening pressure needs fire/HVAC commissioning detail.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty'],
    rationale: 'Commercial complexes emphasize deep basement, fire, facade, HVAC, electrical, and intelligent systems.',
  },
  office: {
    projectType: 'office',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    recommendedTemplateIds: ['china-facade-curtain-wall', 'china-elevator-installation', 'china-intelligent-building-system', 'china-hvac-system', 'china-electrical-system'],
    conditionalTemplateRules: [
      { ruleCode: 'OFFICE_TOWER_HEIGHT', when: 'towerHeightM >= 50', includeTemplateIds: ['china-elevator-installation', 'china-facade-curtain-wall'], requireStableCodePrefixes: ['ELV-01-01', 'FAC-02-01'], rationale: 'Tower offices need elevator and facade controls.' },
      { ruleCode: 'OFFICE_SMART', when: 'intelligentSystemScope exists', includeTemplateIds: ['china-intelligent-building-system'], requireStableCodePrefixes: ['INT-01-01'], rationale: 'BA/security scope needs intelligent-system detail.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-civil-defense-specialty'],
    rationale: 'Office towers are facade/elevator/intelligent/HVAC heavy.',
  },
  hotel: {
    projectType: 'hotel',
    requiredTemplateIds: ['china-gb55032-2022', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-jgj-tianjin-decoration', 'china-cecs-fire-system', 'china-hvac-system', 'china-plumbing-heating-system', 'china-document-commercial-support'],
    conditionalTemplateRules: [
      { ruleCode: 'HOTEL_OPENING', when: 'openingDate exists', includeTemplateIds: ['china-cecs-fire-system', 'china-document-commercial-support'], requireStableCodePrefixes: ['FIR-05-01', 'DCS-01-01'], rationale: 'Opening date drives acceptance and commercial evidence.' },
      { ruleCode: 'HOTEL_PUBLIC_FITOUT', when: 'publicAreaFitoutLevel = high', includeTemplateIds: ['china-jgj-tianjin-decoration'], requireStableCodePrefixes: ['03-09'], rationale: 'Public-area fitout needs decoration detail.' },
    ],
    greyOutTemplateIds: ['china-steel-structure-specialty', 'china-cleanroom-medical-specialty'],
    rationale: 'Hotel fitout emphasizes public-area decoration, fire, MEP, and commercial evidence.',
  },
  school: {
    projectType: 'school',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-gb55032-2022-outdoor', 'china-cecs-fire-system', 'china-electrical-system'],
    conditionalTemplateRules: [
      { ruleCode: 'SCHOOL_OUTDOOR', when: 'campusOutdoorScope = true', includeTemplateIds: ['china-gb55032-2022-outdoor'], requireStableCodePrefixes: ['OUT-01-01'], rationale: 'Campus delivery depends on outdoor roads and utilities.' },
      { ruleCode: 'SCHOOL_TERM_DATE', when: 'seasonalOpeningDate exists', includeTemplateIds: ['china-project-milestone-handover'], requireStableCodePrefixes: ['MS-01-01'], rationale: 'School-term opening requires milestone discipline.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-steel-structure-specialty'],
    rationale: 'School projects remain core-heavy with outdoor and fire/electrical support.',
  },
  hospital: {
    projectType: 'hospital',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-cleanroom-medical-specialty', 'china-hvac-system', 'china-cecs-fire-system', 'china-intelligent-building-system', 'china-electrical-system'],
    conditionalTemplateRules: [
      { ruleCode: 'HOSPITAL_CLEANROOM', when: 'cleanroomLevel exists', includeTemplateIds: ['china-cleanroom-medical-specialty', 'china-hvac-system'], requireStableCodePrefixes: ['CLN-01-01', 'HVA-01-01'], rationale: 'Cleanroom level drives cleanroom and HVAC balancing.' },
      { ruleCode: 'HOSPITAL_FIRE_INTELLIGENT', when: 'icuOrOperatingRoomScope = true', includeTemplateIds: ['china-cecs-fire-system', 'china-intelligent-building-system'], requireStableCodePrefixes: ['FIR-05-01', 'INT-01-01'], rationale: 'Medical critical areas require fire and intelligent-system controls.' },
    ],
    greyOutTemplateIds: ['china-steel-structure-specialty'],
    rationale: 'Hospitals need cleanroom, HVAC, fire, intelligent, and electrical exact templates.',
  },
  industrial: {
    projectType: 'industrial',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    recommendedTemplateIds: ['china-steel-structure-specialty', 'china-cecs-fire-system', 'china-electrical-system', 'china-gb55032-2022-outdoor'],
    conditionalTemplateRules: [
      { ruleCode: 'IND_STEEL', when: 'steelStructureSpanM > 0', includeTemplateIds: ['china-steel-structure-specialty'], requireStableCodePrefixes: ['STL-01-01', 'STL-02-01'], rationale: 'Industrial buildings frequently use steel structure.' },
      { ruleCode: 'IND_CRANE', when: 'craneTonnage > 0', includeTemplateIds: ['china-dangerous-subproject-control'], requireStableCodePrefixes: ['DANGER-01-01-03'], rationale: 'Crane/lifting facts should trigger dangerous-subproject controls.' },
    ],
    greyOutTemplateIds: ['china-jgj-tianjin-decoration', 'china-cleanroom-medical-specialty'],
    rationale: 'Industrial projects emphasize steel, lifting, fire, electrical, and outdoor logistics.',
  },
  logistics: {
    projectType: 'logistics',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control'],
    recommendedTemplateIds: ['china-steel-structure-specialty', 'china-cecs-fire-system', 'china-gb55032-2022-outdoor', 'china-electrical-system'],
    conditionalTemplateRules: [
      { ruleCode: 'LOG_MEZZANINE', when: 'mezzanineScope = true', includeTemplateIds: ['china-steel-structure-specialty'], requireStableCodePrefixes: ['STL-02-01'], rationale: 'Mezzanine scope should add steel detail.' },
      { ruleCode: 'LOG_TRUCK_ROUTE', when: 'outdoorTruckRouteScope = true', includeTemplateIds: ['china-gb55032-2022-outdoor'], requireStableCodePrefixes: ['OUT-01-01'], rationale: 'Truck routes need outdoor works.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-jgj-tianjin-decoration'],
    rationale: 'Logistics projects emphasize steel, fire, outdoor roads, and electrical support.',
  },
  civil_defense: {
    projectType: 'civil_defense',
    requiredTemplateIds: ['china-gb55032-2022', 'china-civil-defense-specialty', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    recommendedTemplateIds: ['china-hvac-system', 'china-electrical-system', 'china-waterproof-insulation'],
    conditionalTemplateRules: [
      { ruleCode: 'CD_DOOR', when: 'civilDefenseDoorCount > 0', includeTemplateIds: ['china-civil-defense-specialty'], requireStableCodePrefixes: ['CDF-01-01'], rationale: 'Civil-defense doors and embedded parts are mandatory specialty detail.' },
      { ruleCode: 'CD_BASEMENT', when: 'basementLevelCount > 0', includeTemplateIds: ['china-waterproof-insulation', 'china-foundation-pit-pile'], requireStableCodePrefixes: ['WPI-01-01', 'FND-02-01'], rationale: 'Civil-defense basements need waterproof and pit detail.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-jgj-tianjin-decoration'],
    rationale: 'Civil-defense projects must explicitly include civil-defense specialty plus basement controls.',
  },
  data_center: {
    projectType: 'data_center',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-data-center-specialty', 'china-electrical-system', 'china-hvac-system', 'china-cecs-fire-system', 'china-intelligent-building-system', 'china-document-commercial-support'],
    conditionalTemplateRules: [
      { ruleCode: 'DC_CORE_ROOM', when: 'dataCenterTier exists', includeTemplateIds: ['china-data-center-specialty'], requireStableCodePrefixes: ['DTC-01-01', 'DTC-02-01', 'DTC-03-01'], rationale: 'Core room scope should pull in the data-center specialty template.' },
      { ruleCode: 'DC_POWER', when: 'dualPowerRequired = true', includeTemplateIds: ['china-electrical-system'], requireStableCodePrefixes: ['ELE-04-01', 'ELE-05-01'], rationale: 'Dual power needs electrical and switching detail.' },
      { ruleCode: 'DC_COOLING', when: 'precisionCoolingScope = true', includeTemplateIds: ['china-hvac-system', 'china-cecs-fire-system'], requireStableCodePrefixes: ['HVA-05-01', 'FIR-05-01'], rationale: 'Precision cooling should couple HVAC and fire commissioning.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty'],
    rationale: 'Data-center delivery combines power, cooling, monitoring, fire linkage, and operation handover.',
  },
  clean_industrial: {
    projectType: 'clean_industrial',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-industrial-cleanroom-specialty', 'china-hvac-system', 'china-electrical-system', 'china-document-commercial-support', 'china-cecs-fire-system'],
    conditionalTemplateRules: [
      { ruleCode: 'CI_CLEANROOM', when: 'cleanroomLevel exists', includeTemplateIds: ['china-industrial-cleanroom-specialty'], requireStableCodePrefixes: ['ICR-01-01', 'ICR-02-01'], rationale: 'Cleanroom grade should add industrial cleanroom detail.' },
      { ruleCode: 'CI_PROCESS', when: 'processValidationScope = true', includeTemplateIds: ['china-document-commercial-support'], requireStableCodePrefixes: ['DCS-01-01'], rationale: 'Process validation needs document and commercial closeout.' },
      { ruleCode: 'CI_EQUIPMENT', when: 'equipmentFoundationScope = true', includeTemplateIds: ['china-foundation-pit-pile'], requireStableCodePrefixes: ['FND-01-01', 'FND-02-01'], rationale: 'Equipment interfaces often need dedicated base and monitoring support.' },
    ],
    greyOutTemplateIds: ['china-jgj-tianjin-decoration'],
    rationale: 'Industrial cleanrooms combine clean-grade control, process validation, and投产接口。',
  },
  renovation: {
    projectType: 'renovation',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-fine-detail', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-renovation-retrofit-specialty', 'china-document-commercial-support', 'china-cecs-fire-system', 'china-waterproof-insulation'],
    conditionalTemplateRules: [
      { ruleCode: 'RNV_SURVEY', when: 'existingStructureSurvey = true', includeTemplateIds: ['china-renovation-retrofit-specialty', 'china-building-fine-detail'], requireStableCodePrefixes: ['RNV-01-01', 'BDT-03-01'], rationale: 'Existing-building surveys should pull in renovation and detail-control templates.' },
      { ruleCode: 'RNV_DEMOLITION', when: 'demolitionScope exists', includeTemplateIds: ['china-dangerous-subproject-control'], requireStableCodePrefixes: ['DANGER-01-01-08'], rationale: 'Demolition scope must carry dangerous-subproject control.' },
      { ruleCode: 'RNV_CUTOVER', when: 'newOldStructureConnectionScope = true', includeTemplateIds: ['china-cecs-fire-system'], requireStableCodePrefixes: ['FIR-06-01'], rationale: 'New-old structure cutover often needs fire-stopping closure and acceptance.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-civil-defense-specialty'],
    rationale: 'Renovation needs既有调查、拆改控制、迁改切换和交付闭环，不能按新建项目直接套。',
  },
  heritage: {
    projectType: 'heritage',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-fine-detail', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover', 'china-document-commercial-support'],
    recommendedTemplateIds: ['china-heritage-preservation-specialty', 'china-waterproof-insulation', 'china-building-fine-detail', 'china-document-commercial-support'],
    conditionalTemplateRules: [
      { ruleCode: 'HRT_PLAN', when: 'protectionPlanApproved = true', includeTemplateIds: ['china-heritage-preservation-specialty'], requireStableCodePrefixes: ['HRT-01-01', 'HRT-02-01'], rationale: 'Protection-plan approval should surface heritage-specific survey and trial-repair detail.' },
      { ruleCode: 'HRT_REPAIR', when: 'trialRepairScope = true', includeTemplateIds: ['china-building-fine-detail'], requireStableCodePrefixes: ['HRT-02-02', 'HRT-03-01'], rationale: 'Trial repair needs detail-level control and defect closure.' },
      { ruleCode: 'HRT_MONITOR', when: 'monitoringScope = true', includeTemplateIds: ['china-document-commercial-support'], requireStableCodePrefixes: ['DCS-01-01'], rationale: 'Monitoring and open-run records belong in the document/commercial closeout layer.' },
    ],
    greyOutTemplateIds: ['china-industrial-cleanroom-specialty', 'china-jgj-tianjin-decoration'],
    rationale: 'Heritage repair is a survey-plan-trial-repair-monitoring chain, not a generic decorative fitout.',
  },
  campus: {
    projectType: 'campus',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover', 'china-document-commercial-support'],
    recommendedTemplateIds: ['china-campus-specialty', 'china-gb55032-2022-outdoor', 'china-cecs-fire-system', 'china-electrical-system', 'china-intelligent-building-system'],
    conditionalTemplateRules: [
      { ruleCode: 'CMP_OUTDOOR', when: 'campusOutdoorScope = true', includeTemplateIds: ['china-gb55032-2022-outdoor'], requireStableCodePrefixes: ['OUT-01-01', 'OUT-05-01'], rationale: 'Campus delivery should pull outdoor roads and utilities into the recommended set.' },
      { ruleCode: 'CMP_OPENING', when: 'seasonalOpeningDate exists', includeTemplateIds: ['china-project-milestone-handover', 'china-document-commercial-support'], requireStableCodePrefixes: ['MS-01-01', 'DCS-01-01'], rationale: 'Opening windows need milestone and handover discipline.' },
      { ruleCode: 'CMP_SMART', when: 'smartCampusScope = true', includeTemplateIds: ['china-intelligent-building-system'], requireStableCodePrefixes: ['INT-01-01'], rationale: 'Smart-campus delivery needs access-control and network integration.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-industrial-cleanroom-specialty'],
    rationale: 'Campus delivery is dominated by outdoor works, opening windows, and smart-campus integration.',
  },
  tod: {
    projectType: 'tod',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-tod-upper-cover-specialty', 'china-steel-structure-specialty', 'china-cecs-fire-system', 'china-document-commercial-support', 'china-gb55032-2022-outdoor'],
    conditionalTemplateRules: [
      { ruleCode: 'TOD_INTERFACE', when: 'railTransitInterfaceScope = true', includeTemplateIds: ['china-tod-upper-cover-specialty'], requireStableCodePrefixes: ['TOD-01-01', 'TOD-02-01'], rationale: 'Rail-transit interface work should expose TOD specialty detail.' },
      { ruleCode: 'TOD_VIBRATION', when: 'vibrationControlScope = true', includeTemplateIds: ['china-steel-structure-specialty'], requireStableCodePrefixes: ['TOD-02-01', 'TOD-03-01'], rationale: 'Vibration and noise control should stay visible in the generated package.' },
      { ruleCode: 'TOD_HANDOVER', when: 'commercialInterfaceScope = true', includeTemplateIds: ['china-document-commercial-support'], requireStableCodePrefixes: ['DCS-01-01'], rationale: 'Commercial interface and operations handover need document closure.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty'],
    rationale: 'TOD上盖 is a transit-interface, vibration-control, and运营移交组合, not an ordinary commercial block.',
  },
  modular_construction: {
    projectType: 'modular_construction',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-modular-mic-specialty', 'china-prefab-bathroom-specialty', 'china-prefab-kitchen-specialty', 'china-document-commercial-support', 'china-electrical-system'],
    conditionalTemplateRules: [
      { ruleCode: 'MIC_FACTORY', when: 'factoryProductionScope = true', includeTemplateIds: ['china-modular-mic-specialty'], requireStableCodePrefixes: ['MIC-01-01', 'MIC-02-01'], rationale: 'Factory production and首件评审 should surface the MiC specialty template.' },
      { ruleCode: 'MIC_TRANSPORT', when: 'transportApprovalRequired = true', includeTemplateIds: ['china-document-commercial-support'], requireStableCodePrefixes: ['DCS-01-01'], rationale: 'Transport approval belongs to the document/commercial support chain.' },
      { ruleCode: 'MIC_INTERIOR_PACKAGES', when: 'prefabBathroomScope = true || prefabKitchenScope = true', includeTemplateIds: ['china-prefab-bathroom-specialty', 'china-prefab-kitchen-specialty'], requireStableCodePrefixes: ['PFB-01-01', 'PFB-02-01'], rationale: 'Prefab wet-room and kitchen packages should be split out explicitly.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-industrial-cleanroom-specialty'],
    rationale: 'Module-based delivery must make factory, transport,吊装, and package-level prefab scopes visible.',
  },
  luxury_hotel: {
    projectType: 'luxury_hotel',
    requiredTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    recommendedTemplateIds: ['china-hotel-specialty', 'china-jgj-tianjin-decoration', 'china-cecs-fire-system', 'china-hvac-system', 'china-plumbing-heating-system', 'china-document-commercial-support'],
    conditionalTemplateRules: [
      { ruleCode: 'HTL_BRAND', when: 'brandStandardLevel = high', includeTemplateIds: ['china-hotel-specialty'], requireStableCodePrefixes: ['HTL-01-01', 'HTL-02-01'], rationale: 'Brand-standard pressure should surface the hotel specialty package.' },
      { ruleCode: 'HTL_PUBLIC_AREA', when: 'publicAreaFitoutLevel = high', includeTemplateIds: ['china-jgj-tianjin-decoration', 'china-hvac-system'], requireStableCodePrefixes: ['HTL-02-01', 'HTL-04-01'], rationale: 'High-end public areas need decoration and末端机电 detail together.' },
      { ruleCode: 'HTL_OPENING', when: 'openingDate exists', includeTemplateIds: ['china-project-milestone-handover', 'china-document-commercial-support'], requireStableCodePrefixes: ['HTL-05-01', 'DCS-01-01'], rationale: 'Opening date drives trial operation and handover discipline.' },
    ],
    greyOutTemplateIds: ['china-industrial-cleanroom-specialty'],
    rationale: 'Luxury hotel delivery is brand-standard, public-area, and trial-operation heavy.',
  },
  deep_foundation: {
    projectType: 'deep_foundation',
    requiredTemplateIds: ['china-gb55032-2022', 'china-foundation-pit-pile', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    recommendedTemplateIds: ['china-waterproof-insulation', 'china-document-commercial-support', 'china-building-fine-detail'],
    conditionalTemplateRules: [
      { ruleCode: 'DF_DEEP_PIT', when: 'foundationDepthM >= 3', includeTemplateIds: ['china-foundation-pit-pile'], requireStableCodePrefixes: ['FND-02-01', 'DANGER-01-01-01'], rationale: 'Deep foundations should pull pit support and monitoring detail.' },
      { ruleCode: 'DF_MONITOR', when: 'monitoringScope = true', includeTemplateIds: ['china-document-commercial-support'], requireStableCodePrefixes: ['DCS-01-01'], rationale: 'Monitoring and report handover belong in the document/support layer.' },
      { ruleCode: 'DF_TEST_PILE', when: 'pileType exists', includeTemplateIds: ['china-quality-responsibility-acceptance'], requireStableCodePrefixes: ['FND-01-01', 'FND-02-01'], rationale: 'Trial piles and inspection records must stay in the quality-responsibility chain.' },
    ],
    greyOutTemplateIds: ['china-cleanroom-medical-specialty', 'china-hotel-specialty'],
    rationale: 'Deep foundation work is driven by support, dewatering, monitoring, test piles, and acceptance closure.',
  },
}

export const WBS_TEMPLATE_METHOD_VARIANT_PRECISE_RULES: Record<string, WbsTemplateMethodVariantPreciseRule> = {
  aluminum_formwork: {
    methodVariantCode: 'aluminum_formwork',
    includeTemplateIds: ['china-gb55032-2022', 'china-dangerous-subproject-control'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['02-01-01-P01', '02-01-01-P02', '02-01-03-P03'],
    triggerDangerStableCodes: ['DANGER-01-01-02-P03'],
    evidenceStableCodes: ['QR-01-01-03-P04'],
    confirmationFields: ['standardFloorCount', 'floorHeightM', 'earlyStrippingSystem'],
    rationale: 'Aluminum formwork changes formwork cycle and quality controls but should not silently replace core structure rows.',
  },
  climbing_formwork: {
    methodVariantCode: 'climbing_formwork',
    includeTemplateIds: ['china-gb55032-2022', 'china-dangerous-subproject-control'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['02-01-01-P02', 'DANGER-01-01-02-P04', 'DANGER-01-01-04-P08'],
    triggerDangerStableCodes: ['DANGER-01-01-02-P04', 'DANGER-01-01-04-P08'],
    evidenceStableCodes: ['QR-01-01-03-P04'],
    confirmationFields: ['coreTubeScope', 'climbingSystemVendor', 'towerHeightM'],
    rationale: 'Climbing formwork is a controlled method variant that triggers danger controls and evidence checks.',
  },
  bored_pile: {
    methodVariantCode: 'bored_pile',
    includeTemplateIds: ['china-foundation-pit-pile', 'china-quality-responsibility-acceptance'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['FND-01-01-01-P01', 'FND-01-01-01-P03', 'FND-01-01-01-P06', 'FND-01-01-01-P08'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['QR-01-01-03-P04'],
    confirmationFields: ['pileType', 'pileDiameter', 'pileLength', 'testPileRequired'],
    rationale: 'Bored piles need foundation specialty detail and testing evidence, not generic foundation expansion only.',
  },
  manual_dug_pile: {
    methodVariantCode: 'manual_dug_pile',
    includeTemplateIds: ['china-foundation-pit-pile', 'china-dangerous-subproject-control'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['FND-01-01-01-P01', 'DANGER-01-01-09-P03', 'DANGER-01-01-09-P06'],
    triggerDangerStableCodes: ['DANGER-01-01-09-P03', 'DANGER-01-01-09-P06'],
    evidenceStableCodes: ['DANGER-01-01-09-P06'],
    confirmationFields: ['pileDepthM', 'localPolicyAllowsManualDugPile', 'gasDetectionRequired'],
    rationale: 'Manual-dug piles are safety-sensitive and must be driven by project facts and local policy.',
  },
  steel_deck_composite_slab: {
    methodVariantCode: 'steel_deck_composite_slab',
    includeTemplateIds: ['china-steel-structure-specialty', 'china-gb55032-2022'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['STL-02-01-01-P01', '02-01-03-P03', '02-01-03-P04'],
    triggerDangerStableCodes: ['DANGER-01-01-03-P08'],
    evidenceStableCodes: ['STL-01-01-02-P07'],
    confirmationFields: ['compositeSlabScope', 'temporarySupportRequired', 'studWeldingScope'],
    rationale: 'Composite slabs cross steel and concrete execution, so the rule keeps both references instead of replacing one side blindly.',
  },
  pc_grouting: {
    methodVariantCode: 'pc_grouting',
    includeTemplateIds: ['china-prefabricated-assembly', 'china-quality-responsibility-acceptance'],
    replaceCoreStableCodePrefixes: ['02-01'],
    requireStableCodes: ['PFB-01-01-01-P01', 'PFB-01-01-01-P02', '02-01-03-P04'],
    triggerDangerStableCodes: ['DANGER-01-01-03-P08'],
    evidenceStableCodes: ['QR-01-01-03-P04'],
    confirmationFields: ['prefabScope', 'groutingSleeveType', 'componentBatchCount'],
    rationale: 'PC grouting can suppress coarse core rows only when the prefab specialty is explicitly selected.',
  },
  curtain_wall_unitized: {
    methodVariantCode: 'curtain_wall_unitized',
    includeTemplateIds: ['china-facade-curtain-wall', 'china-dangerous-subproject-control'],
    replaceCoreStableCodePrefixes: ['03-09'],
    requireStableCodes: ['03-09-01-P01', 'FAC-02-01-02-P07', 'DANGER-01-01-07-P03'],
    triggerDangerStableCodes: ['DANGER-01-01-07-P03', 'DANGER-01-01-07-P08'],
    evidenceStableCodes: ['FAC-02-01-02-P07'],
    confirmationFields: ['curtainWallSystemType', 'unitPanelBatch', 'hoistingMethod'],
    rationale: 'Unitized curtain wall should replace coarse facade rows only when facade specialty is selected.',
  },
  spray_fireproof_coating: {
    methodVariantCode: 'spray_fireproof_coating',
    includeTemplateIds: ['china-steel-structure-specialty', 'china-quality-responsibility-acceptance'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['STL-01-01-01-P05', 'STL-01-01-02-P07'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['STL-01-01-02-P07'],
    confirmationFields: ['fireproofCoatingScope', 'coatingType', 'requiredThicknessMm'],
    rationale: 'Spray fireproof coating needs steel specialty and exact test-report references.',
  },
  cleanroom_balancing: {
    methodVariantCode: 'cleanroom_balancing',
    includeTemplateIds: ['china-cleanroom-medical-specialty', 'china-hvac-system'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['CLN-01-01-01-P01', 'CLN-01-01-01-P02', 'HVA-01-01-01-P07'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['CLN-01-01-01-P02', 'HVA-01-01-01-P07'],
    confirmationFields: ['cleanroomLevel', 'pressureGradient', 'thirdPartyCleanlinessTestRequired'],
    rationale: 'Cleanroom balancing is driven by cleanroom grade and HVAC testing facts.',
  },
  fire_linkage_commissioning: {
    methodVariantCode: 'fire_linkage_commissioning',
    includeTemplateIds: ['china-cecs-fire-system', 'china-project-milestone-handover'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['FIR-01-01-01-P06', 'FIR-01-01-02-P05', 'FIR-05-01-02-P07', 'MS-01-01-17'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['FIR-05-01-02-P07'],
    confirmationFields: ['fireSystemScope', 'acceptancePlanId', 'linkageCommissioningScope'],
    rationale: 'Fire linkage commissioning should connect fire specialty and acceptance milestone projection.',
  },
  bim_prefabrication_coordination: {
    methodVariantCode: 'bim_prefabrication_coordination',
    includeTemplateIds: ['china-mep-coordination', 'china-document-commercial-support'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['DCS-01-01-04-P01', 'DCS-01-01-05-P02'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['DCS-01-01-04-P01'],
    confirmationFields: ['bimCoordinationScope', 'fabricationDrawingScope', 'clashReviewRequired'],
    rationale: 'BIM coordination is a management/document support method; it should recommend evidence and coordination tasks only.',
  },
}

export const WBS_TEMPLATE_METHOD_VARIANT_EXTENSION_RULES: WbsTemplateMethodVariantExtensionRule[] = [
  {
    methodVariantCode: 'mass_concrete_temperature_control',
    triggerKeywords: ['大体积混凝土', '测温', '温差控制', '承台筏板'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-gb55032-2022', 'china-quality-responsibility-acceptance'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['01-02-03-P07', '02-01-03-P10', '02-01-03-P03'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['01-02-03-P07', 'QR-01-01-03-P04'],
    confirmationFields: ['massConcreteVolumeM3', 'temperatureMonitoringPlan', 'curingAndInsulationMethod'],
    rationale: '大体积混凝土会改变测温、养护和温差控制管理深度,但不应替代普通混凝土主干。',
  },
  {
    methodVariantCode: 'post_tensioned_prestress',
    triggerKeywords: ['预应力', '后张法', '张拉', '压浆'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-gb55032-2022', 'china-building-fine-detail', 'china-quality-responsibility-acceptance'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['02-01-04-P02', '02-01-04-P08', 'BDT-04-01-02-P01', 'BDT-04-01-02-P04'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['BDT-04-01-02-P01', '02-01-04-P08'],
    confirmationFields: ['prestressSystemType', 'tensionSequence', 'groutingInspectionRequired'],
    rationale: '预应力需要专项方案、张拉顺序、穿束锚固和节点验收的精确组合。',
  },
  {
    methodVariantCode: 'shotcrete_anchor_support',
    triggerKeywords: ['喷锚支护', '锚杆', '张拉锁定', '基坑支护'],
    promotionPolicy: 'trigger_control_pack',
    includeTemplateIds: ['china-gb55032-2022', 'china-foundation-pit-pile', 'china-dangerous-subproject-control'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['FND-02-01-01-P04', '01-03-09-P07', '01-03-09-P08', 'DANGER-01-01-01-P04'],
    triggerDangerStableCodes: ['DANGER-01-01-01-P04', 'DANGER-01-01-01-P07'],
    evidenceStableCodes: ['01-03-09-P08', 'DANGER-01-01-01-P07'],
    confirmationFields: ['supportType', 'anchorLengthM', 'monitoringFrequency'],
    rationale: '喷锚和锚杆支护需要把实体作业、张拉锁定、轴力监测和深基坑危大控制联动。',
  },
  {
    methodVariantCode: 'industrial_superflat_floor',
    triggerKeywords: ['超平地坪', '耐磨地坪', '金刚砂', '物流地坪'],
    promotionPolicy: 'recommend_only',
    includeTemplateIds: ['china-building-fine-detail', 'china-jgj-tianjin-decoration'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['BDT-02-01-01-P02', 'BDT-02-01-01-P03', 'BDT-02-01-01-P04', 'BDT-02-01-01-P08'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['BDT-02-01-01-P08'],
    confirmationFields: ['flatnessTolerance', 'forkliftRouteScope', 'floorLoadRequirement'],
    rationale: '物流和工业地坪需要基层、分仓缝、传力杆、面层和验收指标,不适合只走普通地面工序。',
  },
  {
    methodVariantCode: 'integrated_seismic_supports',
    triggerKeywords: ['综合支吊架', '抗震支吊架', '机电综合支架'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-mep-coordination', 'china-hvac-system', 'china-electrical-system'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['MEP-01-01-01-P06', 'HVA-03-01-01-P04', '05-01-01-P02'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['MEP-01-01-01-P06', 'HVA-03-01-01-P04'],
    confirmationFields: ['integratedSupportScope', 'seismicSupportRequired', 'coordinationModelApproved'],
    rationale: '综合/抗震支吊架会改变机电安装前置条件和交叉专业界面,应作为推荐工法变体治理。',
  },
  {
    methodVariantCode: 'lightning_grounding_acceptance',
    triggerKeywords: ['防雷', '接地', '浪涌保护', '防雷验收'],
    promotionPolicy: 'recommend_only',
    includeTemplateIds: ['china-gb55032-2022', 'china-electrical-system'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['07-07-01-P09', '07-07-02-P09', '03-09-01-P06'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['07-07-01-P09', '07-07-02-P09'],
    confirmationFields: ['lightningProtectionCategory', 'groundingResistanceRequirement', 'facadeGroundingScope'],
    rationale: '防雷接地验收跨幕墙、电气和竣工验收,需要独立推荐和证据关注。',
  },
  {
    methodVariantCode: 'elevator_group_supervision_inspection',
    triggerKeywords: ['elevator group', 'supervision inspection', 'use registration', 'hoistway handover'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-elevator-installation', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['ELV-01-01-01-P03', 'ELV-02-01-02-P07', 'DANGER-01-01-03-P08'],
    triggerDangerStableCodes: ['DANGER-01-01-03-P08'],
    evidenceStableCodes: ['ELV-02-01-02-P07', 'DANGER-01-01-03-P08'],
    confirmationFields: ['elevatorCount', 'supervisionInspectionRequired', 'hoistwayPlatformType'],
    rationale: 'Elevator-group installation needs hoistway platform acceptance, supervision inspection, use registration, and lifting-control evidence before handover.',
  },
  {
    methodVariantCode: 'data_center_core_room_commissioning',
    triggerKeywords: ['data center', 'core room', 'precision cooling', 'dual power', 'UPS'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-intelligent-building-system', 'china-electrical-system', 'china-hvac-system'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['INT-04-01-01-P08', 'ELE-04-01-01-P08', 'ELE-05-01-01-P07', 'HVA-05-01-01-P08'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['INT-04-01-01-P08', 'ELE-04-01-01-P08', 'HVA-05-01-01-P08'],
    confirmationFields: ['dataCenterTier', 'dualPowerRequired', 'precisionCoolingScope', 'integratedCommissioningWindow'],
    rationale: 'Data-center commissioning should be recommended only when room grade, dual power, cooling, and integrated commissioning facts are present.',
  },
  {
    methodVariantCode: 'commercial_gas_commissioning_cutover',
    triggerKeywords: ['gas commissioning', 'commercial kitchen', 'gas cutover', 'fuel gas'],
    promotionPolicy: 'trigger_control_pack',
    includeTemplateIds: ['china-plumbing-heating-system', 'china-hvac-system', 'china-cecs-fire-system'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['PLU-06-01-01-P07', 'HVA-04-01-01-P07', 'FIR-05-01-01-P06'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['PLU-06-01-01-P07', 'FIR-05-01-01-P06'],
    confirmationFields: ['commercialKitchenGasScope', 'gasOperatorAcceptanceRequired', 'kitchenExhaustInterlockRequired'],
    rationale: 'Commercial gas commissioning is a safety-sensitive MEP interface and should link gas acceptance, kitchen exhaust interlock, and fire report handover.',
  },
  {
    methodVariantCode: 'existing_building_demolition_reinforcement',
    triggerKeywords: ['renovation demolition', 'existing structure', 'temporary support', 'structural reinforcement'],
    promotionPolicy: 'trigger_control_pack',
    includeTemplateIds: ['china-building-fine-detail', 'china-dangerous-subproject-control', 'china-document-commercial-support'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['BDT-03-01-01-P01', 'BDT-03-01-01-P02', 'BDT-03-01-01-P03', 'DANGER-01-01-08-P04'],
    triggerDangerStableCodes: ['DANGER-01-01-08-P04', 'DANGER-01-01-08-P06'],
    evidenceStableCodes: ['BDT-03-01-01-P02', 'DANGER-01-01-08-P04'],
    confirmationFields: ['existingStructureSurvey', 'demolitionScope', 'temporarySupportRequired', 'hazardousDemolitionTrigger'],
    rationale: 'Existing-building renovation should never be inferred from a title alone; it needs survey, demolition scope, temporary support, and danger trigger facts.',
  },
  {
    methodVariantCode: 'cleanroom_third_party_validation',
    triggerKeywords: ['cleanroom validation', 'third party cleanliness test', 'pressure cascade', 'medical gas'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-cleanroom-medical-specialty', 'china-hvac-system', 'china-intelligent-building-system'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['CLN-02-01-01-P06', 'CLN-02-01-02-P06', 'CLN-01-01-02-P06', 'HVA-02-01-02-P06'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['CLN-02-01-02-P06', 'HVA-02-01-02-P06'],
    confirmationFields: ['cleanroomLevel', 'thirdPartyCleanlinessTestRequired', 'pressureCascadeRequired', 'medicalGasScope'],
    rationale: 'Cleanroom validation extends beyond ordinary HVAC balancing and needs third-party cleanliness, pressure, medical gas, and operation handover evidence.',
  },
  {
    methodVariantCode: 'civil_defense_conversion_acceptance',
    triggerKeywords: ['civil defense conversion', 'wartime conversion', 'protective door acceptance', 'civil defense acceptance'],
    promotionPolicy: 'require_confirmation',
    includeTemplateIds: ['china-civil-defense-specialty', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    replaceCoreStableCodePrefixes: [],
    requireStableCodes: ['CDF-01-01-02-P06', 'CDF-02-01-02-P05', 'CDF-03-01-01-P06', 'QR-01-01-10-P02'],
    triggerDangerStableCodes: [],
    evidenceStableCodes: ['CDF-02-01-02-P05', 'QR-01-01-10-P02'],
    confirmationFields: ['civilDefenseUnitCount', 'wartimeConversionScope', 'civilDefenseAcceptancePlanId'],
    rationale: 'Civil-defense conversion acceptance should link protective equipment tests, conversion rehearsal, acceptance opinion, and quality-responsibility evidence.',
  },
]

export const WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES: WbsTemplateFeedbackMetricPolicy[] = [
  {
    metricCode: 'semantic_override_acceptance_rate',
    candidateCode: 'SEMANTIC_CORRECTION_REPEAT',
    numerator: 'count(distinct project_id, stableCode) where user_confirmed_semantic_correction = true',
    denominator: 'count(distinct project_id, stableCode) where semantic_correction_candidate_shown = true',
    minimumSampleSize: 5,
    confidenceThreshold: 0.8,
    quarantineMetric: 'conflicting_target_semantics_rate',
    candidateOutputField: 'semantic_override_candidate',
    rationale: 'Semantic corrections promote only when repeated stableCode-level corrections are consistent across projects.',
  },
  {
    metricCode: 'project_template_selection_lift',
    candidateCode: 'PROJECT_TYPE_SELECTION_REPEAT',
    numerator: 'count(project_id) where template_selected_after_recommendation = true',
    denominator: 'count(project_id) where project_type_profile_applicable = true',
    minimumSampleSize: 8,
    confidenceThreshold: 0.7,
    quarantineMetric: 'post_generation_delete_rate',
    candidateOutputField: 'applicability_matrix_candidate',
    rationale: 'Project-type recommendations should be measured by selection lift and post-generation retention.',
  },
  {
    metricCode: 'core_specialty_suppression_precision',
    candidateCode: 'CORE_SPECIALTY_DUPLICATE_DELETE',
    numerator: 'count(generated_core_rows_deleted_and_specialty_rows_retained)',
    denominator: 'count(generated_core_rows_with_specialty_replacement_candidate)',
    minimumSampleSize: 6,
    confidenceThreshold: 0.75,
    quarantineMetric: 'manual_core_reinsert_rate',
    candidateOutputField: 'replacement_suppression_candidate',
    rationale: 'Replacement suppression should promote only when users repeatedly keep specialty rows and delete matching coarse core rows.',
  },
  {
    metricCode: 'manual_depth_insert_reuse_rate',
    candidateCode: 'DEPTH_MANUAL_INSERT',
    numerator: 'count(manual_inserted_rows_reused_or_kept_until_closeout)',
    denominator: 'count(manual_inserted_rows_under_same_parent_stableCode)',
    minimumSampleSize: 5,
    confidenceThreshold: 0.72,
    quarantineMetric: 'custom_scope_split_rate',
    candidateOutputField: 'depth_precision_candidate',
    rationale: 'Manual inserts promote to depth candidates only when they survive closeout and map to a stable parent.',
  },
  {
    metricCode: 'title_mapping_false_positive_rate',
    candidateCode: 'TITLE_MAPPING_FALSE_POSITIVE',
    numerator: 'count(title_mapping_suggestions_rejected_or_remapped)',
    denominator: 'count(title_mapping_suggestions_shown)',
    minimumSampleSize: 4,
    confidenceThreshold: 0.85,
    quarantineMetric: 'ambiguous_short_title_rate',
    candidateOutputField: 'title_mapping_negative_sample_candidate',
    rationale: 'Title weak recognition should learn from stable negative samples without mutating template seeds directly.',
  },
  {
    metricCode: 'scenario_feature_confirmation_retention',
    candidateCode: 'SCENARIO_FEATURE_CONFIRMATION_REPEAT',
    numerator: 'count(project_id) where inferred_feature_confirmed = true and recommended_template_rows_retained = true',
    denominator: 'count(project_id) where scenario_feature_cluster_applicable = true',
    minimumSampleSize: 8,
    confidenceThreshold: 0.78,
    quarantineMetric: 'feature_contradiction_rate',
    candidateOutputField: 'scenario_combination_candidate',
    rationale: 'Scenario candidates should promote only when feature-backed recommendations are confirmed and retained after generation.',
  },
  {
    metricCode: 'generated_result_assertion_drift_rate',
    candidateCode: 'GENERATED_RESULT_ASSERTION_DRIFT',
    numerator: 'count(golden_case_generated_assertions_failed)',
    denominator: 'count(golden_case_generated_assertions_evaluated)',
    minimumSampleSize: 4,
    confidenceThreshold: 0.9,
    quarantineMetric: 'approved_assertion_migration_rate',
    candidateOutputField: 'generated_result_drift_candidate',
    rationale: 'Generated-result drift should create governance candidates when preview/generated rows violate stableCode or semantic contracts.',
  },
]

export const WBS_TEMPLATE_FEEDBACK_EVENT_POLICIES: WbsTemplateFeedbackEventPolicy[] = [
  {
    eventCode: 'semantic_correction_confirmed',
    candidateCode: 'SEMANTIC_CORRECTION_REPEAT',
    sourceEventName: 'wbs_template_semantic_correction_confirmed',
    requiredPayloadFields: ['projectId', 'companyId', 'stableCode', 'before.durationContributionMode', 'after.durationContributionMode', 'after.executionNature', 'userId'],
    aggregationKeyFields: ['stableCode', 'after.durationContributionMode', 'after.executionNature'],
    sampleValidityRules: ['stableCode must exist in catalog index', 'correction must survive at least one baseline/monthly confirmation', 'same user bulk edits count once per project'],
    candidateEmitCondition: 'minimumSampleSize and confidenceThreshold in semantic_override_acceptance_rate are met',
    rationale: 'Semantic correction events turn manual fixes into stableCode-level governance candidates without directly changing seed metadata.',
  },
  {
    eventCode: 'template_selection_retained',
    candidateCode: 'PROJECT_TYPE_SELECTION_REPEAT',
    sourceEventName: 'wbs_template_project_type_selection_retained',
    requiredPayloadFields: ['projectId', 'projectType', 'templateId', 'selectionSource', 'generatedRowCount', 'retainedRowCount'],
    aggregationKeyFields: ['projectType', 'templateId'],
    sampleValidityRules: ['templateId must exist', 'projectType must be normalized', 'retention measured after user save or baseline confirmation'],
    candidateEmitCondition: 'project_template_selection_lift passes threshold and post_generation_delete_rate is below quarantine limit',
    rationale: 'Project-type combination refinement should learn from retained generated rows, not only from click selection.',
  },
  {
    eventCode: 'core_specialty_duplicate_action',
    candidateCode: 'CORE_SPECIALTY_DUPLICATE_DELETE',
    sourceEventName: 'wbs_template_core_specialty_duplicate_action',
    requiredPayloadFields: ['projectId', 'coreStableCode', 'specialtyStableCode', 'replacementCode', 'userAction', 'generationBatchId'],
    aggregationKeyFields: ['coreStableCode', 'specialtyStableCode', 'replacementCode'],
    sampleValidityRules: ['coreStableCode and specialtyStableCode must exist', 'delete/retain action must occur in same generation batch', 'manual reinsertion resets confidence'],
    candidateEmitCondition: 'core_specialty_suppression_precision passes threshold',
    rationale: 'Replacement candidates require observed delete/retain behavior around exact core/specialty stableCodes.',
  },
  {
    eventCode: 'manual_depth_insert_mapped',
    candidateCode: 'DEPTH_MANUAL_INSERT',
    sourceEventName: 'wbs_template_manual_depth_insert_mapped',
    requiredPayloadFields: ['projectId', 'parentStableCode', 'insertedTitle', 'mappedStableCodeCandidate', 'keptUntilCloseout', 'taskSource'],
    aggregationKeyFields: ['parentStableCode', 'normalizedInsertedTitle'],
    sampleValidityRules: ['parentStableCode must exist', 'insertedTitle must not be a scope split only', 'row must be scheduled or kept until closeout'],
    candidateEmitCondition: 'manual_depth_insert_reuse_rate passes threshold',
    rationale: 'Depth candidates should come from repeated useful manual inserts under the same parent, not one-off project phrasing.',
  },
  {
    eventCode: 'title_mapping_remapped',
    candidateCode: 'TITLE_MAPPING_FALSE_POSITIVE',
    sourceEventName: 'wbs_template_title_mapping_remapped',
    requiredPayloadFields: ['projectId', 'taskTitle', 'suggestedStableCode', 'confirmedStableCode', 'userId', 'mappingConfidence'],
    aggregationKeyFields: ['normalizedTaskTitle', 'suggestedStableCode', 'confirmedStableCode'],
    sampleValidityRules: ['suggestedStableCode and confirmedStableCode must differ and both exist', 'title must contain at least two meaningful tokens', 'ambiguous multi-discipline titles are quarantined'],
    candidateEmitCondition: 'title_mapping_false_positive_rate passes threshold',
    rationale: 'Title weak-recognition negative samples should improve mapping ranking without rewriting template seed facts.',
  },
  {
    eventCode: 'scenario_feature_confirmed_retained',
    candidateCode: 'SCENARIO_FEATURE_CONFIRMATION_REPEAT',
    sourceEventName: 'wbs_template_scenario_feature_confirmed_retained',
    requiredPayloadFields: ['projectId', 'projectType', 'featureAssumptions', 'templateIds', 'generatedRowCount', 'retainedRowCount', 'featureSource'],
    aggregationKeyFields: ['projectType', 'normalizedFeatureAssumptionCluster', 'templateIds'],
    sampleValidityRules: ['featureAssumptions must come from project profile or engineering object facts', 'templateIds must exist', 'retention measured after baseline or monthly plan confirmation'],
    candidateEmitCondition: 'scenario_feature_confirmation_retention passes threshold and feature_contradiction_rate remains below quarantine limit',
    rationale: 'Scenario feedback should learn from confirmed engineering features and retained generated rows, not only from manual template clicks.',
  },
  {
    eventCode: 'generated_result_assertion_failed',
    candidateCode: 'GENERATED_RESULT_ASSERTION_DRIFT',
    sourceEventName: 'wbs_template_generated_result_assertion_failed',
    requiredPayloadFields: ['caseCode', 'assertionCode', 'templateIds', 'missingStableCodes', 'unexpectedRuntimeEffects', 'governanceVersion'],
    aggregationKeyFields: ['caseCode', 'assertionCode', 'governanceVersion'],
    sampleValidityRules: ['assertionCode must exist in WBS_TEMPLATE_GOLDEN_GENERATED_RESULT_ASSERTIONS', 'failure must be reproducible after cache reset', 'approved stableCode migrations are excluded'],
    candidateEmitCondition: 'generated_result_assertion_drift_rate passes threshold or any release-blocking P0 assertion fails',
    rationale: 'Generated-result assertion failures create backend governance candidates and CI signals without exposing seed mechanics to ordinary users.',
  },
]

export const WBS_TEMPLATE_SEED_AUTHORING_RULES: WbsTemplateSeedAuthoringRule[] = [
  {
    ruleCode: 'AUTHORING-01-STABLE-CODE',
    label: 'Stable code is the only durable identity',
    scope: 'node_metadata',
    requiredFields: ['stableCode', 'categoryType', 'templateId'],
    forbiddenFields: ['runtimeTaskId', 'projectTaskId'],
    validationSignals: ['catalog index has no unresolved stableCode', 'stableCode prefix matches catalog group', 'renames preserve stableCode'],
    ordinaryFrontendExposure: 'hidden',
    rationale: 'Template seeds are foundation task facts. Runtime rows can rename display text, but lineage and governance must bind by stableCode.',
  },
  {
    ruleCode: 'AUTHORING-02-SOURCE-VS-SEMANTIC',
    label: 'Catalog group is source, plan semantics are behavior',
    scope: 'node_metadata',
    requiredFields: ['catalogGroup', 'packType', 'planItemKind', 'durationContributionMode', 'executionNature'],
    forbiddenFields: ['uiDisplayGroupOnly'],
    validationSignals: ['site_management can contain work_task', 'danger_control can contain safety_control/work_task/inspection_task', 'document_commercial_support can contain document_task/commercial_task'],
    ordinaryFrontendExposure: 'business_summary_only',
    rationale: 'Source partition answers where the row came from; plan semantics decide schedule participation, progress mode, filters, and pollution isolation.',
  },
  {
    ruleCode: 'AUTHORING-03-NO-DURATION-DEFAULT',
    label: 'Template nodes do not own duration calculation',
    scope: 'generation_contract',
    requiredFields: ['durationContributionMode'],
    forbiddenFields: ['defaultDurationDays', 'referenceDurationDays', 'p50DurationDays'],
    validationSignals: ['duration rules are resolved by dedicated duration seeds', 'record_only nodes never become physical duration anchors', 'embedded_check nodes do not inflate schedule length'],
    ordinaryFrontendExposure: 'hidden',
    rationale: 'The two template seeds provide rows and metadata only; duration belongs to standard work duration, benchmarks, overrides, and resolver rules.',
  },
  {
    ruleCode: 'AUTHORING-04-NO-CROSS-ITEM-DEPENDENCY',
    label: 'Template nodes do not own cross-item dependency calculation',
    scope: 'generation_contract',
    requiredFields: ['referencedCoreQualityCodes', 'referencedQualityResponsibilityCodes'],
    forbiddenFields: ['hardPredecessorTaskId', 'runtimeDependencyId'],
    validationSignals: ['same-parent flow can be curated by internal-flow seed', 'cross-item dependencies come from dependency intent templates', 'reference fields remain semantic links'],
    ordinaryFrontendExposure: 'hidden',
    rationale: 'Template references can explain relationships, but generated task_dependencies must be decided by the dedicated dependency seed layers.',
  },
  {
    ruleCode: 'AUTHORING-05-REPLACEMENT-SUPPRESSION',
    label: 'Specialty replacement must be explicit and reversible',
    scope: 'catalog_structure',
    requiredFields: ['replacesCoreQualityCodes', 'generationMode'],
    forbiddenFields: ['silentCoreDelete'],
    validationSignals: ['replacement code resolves to core prefix', 'generationMode is replace_core_when_selected', 'additive specialty rows do not suppress core rows'],
    ordinaryFrontendExposure: 'business_summary_only',
    rationale: 'Specialty detail can replace coarse core rows only when the relation is explicit; otherwise it remains additive and avoids hidden loss of scope.',
  },
  {
    ruleCode: 'AUTHORING-06-EVIDENCE-TRACE',
    label: 'High-risk rows need evidence traceability',
    scope: 'node_metadata',
    requiredFields: ['evidenceRefs', 'sourceStandard'],
    forbiddenFields: ['sourceFreeTextOnly'],
    validationSignals: ['required evidence policy has zero missing required refs', 'preferred evidence gaps create governance candidates', 'exact stableCode overrides win over keyword inference'],
    ordinaryFrontendExposure: 'business_summary_only',
    rationale: 'Commercial-grade field templates must explain why dangerous, quality, acceptance, and commercial rows exist without asking ordinary users to read seed internals.',
  },
  {
    ruleCode: 'AUTHORING-07-SCENARIO-FEATURES',
    label: 'Project scenario recommendations must be feature-backed',
    scope: 'catalog_structure',
    requiredFields: ['projectType', 'featureAssumptions', 'primaryTemplateIds', 'supportingTemplateIds'],
    forbiddenFields: ['projectTypeOnlyHardInclude'],
    validationSignals: ['feature assumptions include engineering object or project profile fields', 'required template ids resolve', 'required stableCode prefixes resolve'],
    ordinaryFrontendExposure: 'business_summary_only',
    rationale: 'Project type narrows the candidate set, but real site fit comes from structure, method, equipment, scope, and handover features.',
  },
  {
    ruleCode: 'AUTHORING-08-FEEDBACK-CANDIDATE-ONLY',
    label: 'Real-project feedback creates candidates only',
    scope: 'governance_release',
    requiredFields: ['minimumSampleSize', 'confidenceThreshold', 'candidateOutput', 'quarantineConditions'],
    forbiddenFields: ['autoMutateTsSeed', 'ordinaryUserApprovalTodo'],
    validationSignals: ['each candidate policy has metric policy', 'each candidate policy has event policy', 'promotion requires governance release'],
    ordinaryFrontendExposure: 'hidden',
    rationale: 'History should improve seed quality, but it must not silently rewrite template facts or add user-facing approval noise.',
  },
]

export const WBS_TEMPLATE_GOLDEN_GENERATED_RESULT_ASSERTIONS: WbsTemplateGoldenGeneratedResultAssertion[] = [
  {
    assertionCode: 'GEN-RES-RES-BASEMENT-01',
    caseCode: 'residential_shear_wall_basement',
    expectedTemplateIds: ['china-gb55032-2022', 'china-building-site-management', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover', 'china-waterproof-insulation'],
    expectedStableCodes: ['01-07-01-P01', '02-01-03-P03', 'DANGER-01-01-01-P03', 'QR-01-01-03-P04'],
    expectedStableCodePrefixes: ['01-07', '02-01', 'WPI-01-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'milestone'],
    expectedDurationContributionModes: ['duration_bearing', 'embedded_check', 'quality_gate', 'handover_marker'],
    forbiddenRuntimeEffects: ['defaultDurationDays from template node', 'cross-item dependency from template reference only', 'duplicate basement waterproof core row when specialty replacement selected'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Residential basement preview must show physical work, checks, danger controls, and milestone projection without turning template metadata into schedule math.',
  },
  {
    assertionCode: 'GEN-RES-PREFAB-01',
    caseCode: 'residential_prefab_standard_floor',
    expectedTemplateIds: ['china-gb55032-2022', 'china-prefabricated-assembly', 'china-quality-responsibility-acceptance', 'china-dangerous-subproject-control'],
    expectedStableCodes: ['PFB-01-01-01-P01', 'PFB-01-01-01-P02', '02-01-03-P04'],
    expectedStableCodePrefixes: ['PFB-01-01', '02-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control'],
    expectedDurationContributionModes: ['duration_bearing', 'embedded_check', 'quality_gate'],
    forbiddenRuntimeEffects: ['prefab document row counted as physical duration anchor', 'ordinary core component rows duplicated after specialty replacement'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Prefab generation needs component receipt, hoisting/grouting checks, and concrete quality gates separated by semantics.',
  },
  {
    assertionCode: 'GEN-COM-FIRE-FACADE-01',
    caseCode: 'commercial_complex_basement_podium',
    expectedTemplateIds: ['china-gb55032-2022', 'china-foundation-pit-pile', 'china-cecs-fire-system', 'china-facade-curtain-wall', 'china-hvac-system', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover', 'china-document-commercial-support'],
    expectedStableCodes: ['FND-02-01-01-P01', 'DANGER-01-01-01-P04', 'FAC-02-01-02-P07', 'FIR-05-01-02-P07'],
    expectedStableCodePrefixes: ['FND-02-01', 'FAC-02-01', 'FIR-01-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'document_task', 'milestone'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'external_wait', 'handover_marker', 'record_only'],
    forbiddenRuntimeEffects: ['fire acceptance projection duplicated as normal construction task', 'facade performance test treated as facade panel installation duration'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Commercial podium generation must keep fire/HVAC/facade acceptance evidence visible while preventing acceptance and records from polluting physical duration.',
  },
  {
    assertionCode: 'GEN-HOSP-CLEAN-01',
    caseCode: 'hospital_cleanroom_medical',
    expectedTemplateIds: ['china-cleanroom-medical-specialty', 'china-hvac-system', 'china-cecs-fire-system', 'china-intelligent-building-system', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover', 'china-document-commercial-support'],
    expectedStableCodes: ['CLN-01-01-01-P01', 'CLN-01-01-01-P02', 'HVA-01-01-01-P07', 'FIR-05-01-02-P07'],
    expectedStableCodePrefixes: ['CLN-01-01', 'HVA-01-01', 'FIR-05-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task', 'milestone'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'record_only', 'handover_marker'],
    forbiddenRuntimeEffects: ['cleanroom acceptance replaces unit completion acceptance', 'ordinary HVAC balancing suppresses cleanroom validation'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Hospital cleanroom output must keep cleanroom validation, HVAC balancing, fire evidence, and milestone projection distinct.',
  },
  {
    assertionCode: 'GEN-IND-STEEL-01',
    caseCode: 'industrial_steel_factory',
    expectedTemplateIds: ['china-steel-structure-specialty', 'china-dangerous-subproject-control', 'china-cecs-fire-system'],
    expectedStableCodes: ['STL-01-01-01-P03', 'STL-01-01-02-P07', 'STL-02-01-01-P01', 'DANGER-01-01-03-P08'],
    expectedStableCodePrefixes: ['STL-01-01', 'STL-02-01', 'DANGER-01-01-03'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'embedded_check'],
    forbiddenRuntimeEffects: ['lifting safety control counted as steel installation duration', 'NDT report treated as fabrication work duration'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Industrial steel output must separate fabrication/installation duration, NDT gates, and lifting safety controls.',
  },
  {
    assertionCode: 'GEN-DC-POWER-01',
    caseCode: 'smart_building_security_ba',
    expectedTemplateIds: ['china-intelligent-building-system', 'china-electrical-system', 'china-document-commercial-support', 'china-quality-responsibility-acceptance'],
    expectedStableCodes: ['INT-01-01-01-P05', 'INT-02-01-01-P01', 'ELE-01-01-02-P05'],
    expectedStableCodePrefixes: ['INT-01-01', 'INT-02-01', 'ELE-01-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'document_task'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'record_only'],
    forbiddenRuntimeEffects: ['weak-current evidence rows converted to physical cable duration', 'commercial document rows shown as ordinary workflow dependency'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Intelligent-building output must keep weak-current installation, testing, and evidence handover as different generated semantics.',
  },
  {
    assertionCode: 'GEN-ELEVATOR-01',
    caseCode: 'elevator_group_installation',
    expectedTemplateIds: ['china-elevator-installation', 'china-dangerous-subproject-control', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    expectedStableCodes: ['ELV-01-01-01-P01', 'ELV-01-01-01-P03', 'ELV-02-01-01-P01', 'DANGER-01-01-03-P03'],
    expectedStableCodePrefixes: ['ELV-01-01', 'ELV-02-01', 'DANGER-01-01-03'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'safety_control', 'milestone'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'handover_marker'],
    forbiddenRuntimeEffects: ['construction hoist danger package replacing formal elevator specialty', 'supervision inspection counted as installation production duration'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Elevator output must distinguish civil handover, equipment installation, supervision inspection, and lifting control.',
  },
  {
    assertionCode: 'GEN-SITE-TEMP-POWER-01',
    caseCode: 'temporary_facilities_startup',
    expectedTemplateIds: ['china-building-site-management', 'china-dangerous-subproject-control'],
    expectedStableCodes: ['SITE-01-01-06-P05', 'DANGER-01-01-06-P01', 'DANGER-01-01-06-P06'],
    expectedStableCodePrefixes: ['SITE-01-01-06', 'DANGER-01-01-06'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'management_task', 'safety_control'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'external_wait'],
    forbiddenRuntimeEffects: ['temporary power acceptance merged into formal electrical energization', 'site management pack hidden because it is not core quality'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Site startup output needs real temporary works plus acceptance and danger-control rows before construction begins.',
  },
  {
    assertionCode: 'GEN-CLOSEOUT-01',
    caseCode: 'completion_filing_handover',
    expectedTemplateIds: ['china-project-milestone-handover', 'china-document-commercial-support', 'china-quality-responsibility-acceptance'],
    expectedStableCodes: ['MS-01-01-11', 'FIR-05-01-02-P07', 'DCS-01-01-05-P02'],
    expectedStableCodePrefixes: ['MS-01-01', 'DCS-01-01'],
    expectedPlanItemKinds: ['milestone', 'document_task', 'inspection_task', 'linked_projection'],
    expectedDurationContributionModes: ['handover_marker', 'record_only', 'quality_gate'],
    forbiddenRuntimeEffects: ['AcceptanceTimeline detail copied into ordinary template tasks', 'filing document task blocks physical critical path by default'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Closeout output must project acceptance status and document handover without duplicating the acceptance timeline fact table.',
  },
  {
    assertionCode: 'GEN-COMMERCIAL-01',
    caseCode: 'variation_claim_closeout',
    expectedTemplateIds: ['china-document-commercial-support'],
    expectedStableCodes: ['DCS-01-01-04-P01', 'DCS-01-01-05-P02'],
    expectedStableCodePrefixes: ['DCS-01-01'],
    expectedPlanItemKinds: ['commercial_task', 'document_task'],
    expectedDurationContributionModes: ['record_only'],
    forbiddenRuntimeEffects: ['commercial task changes standard physical duration', 'commercial evidence creates construction dependency without dependency seed'],
    verificationMode: 'candidate_feedback_contract',
    rationale: 'Commercial output should be visible as plan work where it has owner/date/deliverable, while remaining isolated from physical duration math.',
  },
  {
    assertionCode: 'GEN-OUTDOOR-01',
    caseCode: 'outdoor_road_pipeline_landscape',
    expectedTemplateIds: ['china-gb55032-2022-outdoor', 'china-gb55032-2022-municipal', 'china-building-site-management'],
    expectedStableCodes: ['OUT-01-01-01-P01', 'OUT-01-01-01-P02', 'OUT-05-01-01-P02'],
    expectedStableCodePrefixes: ['OUT-01-01', 'OUT-05-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'management_task'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'handover_marker'],
    forbiddenRuntimeEffects: ['temporary road and formal outdoor road collapsed into one physical row', 'outdoor handover hidden because it is outside core quality'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Outdoor output must show formal road, utility connection, and temporary facility cutover as separate site realities.',
  },
  {
    assertionCode: 'GEN-ROOF-WPI-01',
    caseCode: 'roof_waterproof_energy_saving',
    expectedTemplateIds: ['china-gb55032-2022', 'china-waterproof-insulation', 'china-quality-responsibility-acceptance', 'china-project-milestone-handover'],
    expectedStableCodes: ['09-01-01-P02', 'WPI-01-01-01-P02'],
    expectedStableCodePrefixes: ['09-01', 'WPI-01-01'],
    expectedPlanItemKinds: ['work_task', 'inspection_task', 'milestone'],
    expectedDurationContributionModes: ['duration_bearing', 'quality_gate', 'handover_marker'],
    forbiddenRuntimeEffects: ['roof waterproof specialty suppresses unrelated energy-saving milestone', 'waterproof test record inflates physical waterproof duration'],
    verificationMode: 'generation_preview_contract',
    rationale: 'Roof output must include waterproof and energy-saving checks while keeping milestone projection isolated.',
  },
]

export const WBS_TEMPLATE_QUALITY_SCORE_WEIGHTS = {
  semanticOverrideCoverage: 0.2,
  evidenceQuality: 0.2,
  applicabilityCoverage: 0.15,
  replacementIntegrity: 0.2,
  goldenCaseCoverage: 0.15,
  feedbackReadiness: 0.1,
} as const
