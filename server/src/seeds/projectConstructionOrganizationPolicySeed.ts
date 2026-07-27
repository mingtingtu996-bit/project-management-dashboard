export type ProjectConstructionOrganizationLaneRole =
  | 'shared_works'
  | 'primary_building_lane'
  | 'functional_zone_lane'
  | 'renovation_zone_lane'
  | 'factory_site_lane'

export type ProjectConstructionOrganizationNetworkPhase =
  | 'foundation'
  | 'earthwork'
  | 'basement'
  | 'tower'
  | 'outdoor'
  | 'handoff'

export type ProjectConstructionOrganizationNetworkStage = {
  code: string
  label: string
  phase: ProjectConstructionOrganizationNetworkPhase
  durationDays: number
}

export type ProjectConstructionOrganizationNetworkDependency = {
  fromStageCode: string
  toStageCode: string
  dependencyType: 'FS' | 'SS'
  lagDays: number
  intent: string
}

export type ProjectConstructionOrganizationLaneSizingPolicy = {
  basis: 'project_building_count' | 'renovation_workface_proxy'
  minimumLaneTotal: number
  areaPerLaneM2?: number
  floorsPerLane?: number
}

export type ProjectConstructionOrganizationPolicySelectionContext = {
  businessSubtype?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: unknown
  prefabSystemCodes?: unknown
  elementVariantCodes?: unknown
  externalInterfaceCodes?: unknown
  hardConstraintCodes?: unknown
  functionalUsageCodes?: unknown
  functionalCategoryCodes?: unknown
  specialRoomTypeCodes?: unknown
  physicalZoneTypeCodes?: unknown
  projectFeatures?: unknown
}

export type ProjectConstructionOrganizationPolicy = {
  policyId: string
  source: 'project_construction_organization_policy_seed'
  sourceVersion: string
  businessTypeCodes: string[]
  strategy: string
  schemeFamily: string
  primaryInterfaceSequence: string[]
  interfaceGateTags: string[]
  laneRole: ProjectConstructionOrganizationLaneRole
  lanePrefix: string
  maxLaneTotal: number
  laneSizingPolicy?: ProjectConstructionOrganizationLaneSizingPolicy
  confidence: 'high' | 'medium' | 'low'
  variantCode?: string
  selectionSignals?: string[]
  selectionPriority?: number
  organizationNetwork?: {
    stages: ProjectConstructionOrganizationNetworkStage[]
    dependencies: ProjectConstructionOrganizationNetworkDependency[]
  }
  networkPolicy: {
    sharedWorksRelease: 'before_primary_lanes' | 'parallel_with_primary_lanes'
    primaryLaneScheduling: 'parallel_lanes_with_interface_gates' | 'staggered_lanes_with_interface_gates'
    interfaceGatePolicy: 'business_type_governed_gate_network'
  }
  governance: {
    assetType: 'project_construction_organization_policy'
    curationStatus: 'seeded'
    directSeedMutation: false
    resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver'
  }
  rationale: string
}

export type ResolvedProjectConstructionOrganizationPolicy = ProjectConstructionOrganizationPolicy & {
  variantCode: string
  selectionSignals: string[]
  organizationNetwork: {
    stages: ProjectConstructionOrganizationNetworkStage[]
    dependencies: ProjectConstructionOrganizationNetworkDependency[]
  }
}

export const PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION = 'v1.4.22-project-organization-20260620'

function defaultOrganizationNetwork(_policy: ProjectConstructionOrganizationPolicy) {
  return {
    stages: [],
    dependencies: [],
  }
}

function policyNetwork(
  stages: Array<readonly [code: string, label: string, phase: ProjectConstructionOrganizationNetworkPhase, durationDays: number]>,
  dependencies: ProjectConstructionOrganizationNetworkDependency[] = [],
) {
  const normalizedStages = stages.map(([code, label, phase, durationDays]) => ({ code, label, phase, durationDays }))
  return {
    stages: normalizedStages,
    dependencies: dependencies.length > 0
      ? dependencies
      : normalizedStages.slice(1).map((stage, index) => ({
        fromStageCode: normalizedStages[index]!.code,
        toStageCode: stage.code,
        dependencyType: 'FS' as const,
        lagDays: 0,
        intent: `policy_interface:${normalizedStages[index]!.code}_to_${stage.code}`,
      })),
  }
}

export const PROJECT_CONSTRUCTION_ORGANIZATION_POLICIES: ProjectConstructionOrganizationPolicy[] = [
  {
    policyId: 'project-organization-general-civil-multi-building-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['general_civil', 'residential', 'commercial'],
    strategy: 'shared_basement_podium_then_multi_tower_lane_network',
    schemeFamily: 'shared_works_then_multi_building_lane',
    primaryInterfaceSequence: ['shared_basement_release', 'podium_interface', 'tower_lane_release', 'site_outdoor_handover'],
    interfaceGateTags: ['shared_basement_gate', 'podium_gate', 'tower_lane_gate', 'outdoor_site_gate'],
    laneRole: 'primary_building_lane',
    lanePrefix: 'tower_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '民用建筑以共享地下/裙房/总平为共同工作面,楼栋作为主施工车道并行或错峰推进。',
  },
  {
    policyId: 'project-organization-general-civil-office-commercial-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['general_civil', 'commercial'],
    strategy: 'office_commercial_podium_tower_fitout_opening_gate_network',
    schemeFamily: 'office_commercial_podium_tower_opening',
    primaryInterfaceSequence: ['podium_tower_structure_release', 'facade_mep_release', 'office_commercial_fitout_release', 'opening_operation_handover'],
    interfaceGateTags: ['podium_tower_gate', 'facade_mep_gate', 'fitout_sample_gate', 'opening_handover_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'office_commercial_zone_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    variantCode: 'general_civil_office_commercial',
    selectionSignals: ['civil_office_commercial', 'office_commercial'],
    selectionPriority: 30,
    organizationNetwork: policyNetwork([
      ['podium_tower_structure_release', '办公塔楼与商业裙房结构分区移交', 'tower', 84],
      ['facade_mep_release', '幕墙封闭与机电系统工作面移交', 'tower', 76],
      ['office_commercial_fitout_release', '办公标准层与商业公区精装分区移交', 'tower', 92],
      ['opening_operation_handover', '系统联调、开业条件验证与运营移交', 'handoff', 48],
    ], [
      { fromStageCode: 'podium_tower_structure_release', toStageCode: 'facade_mep_release', dependencyType: 'SS', lagDays: 28, intent: 'policy_interface:office_structure_to_facade_mep' },
      { fromStageCode: 'podium_tower_structure_release', toStageCode: 'office_commercial_fitout_release', dependencyType: 'SS', lagDays: 56, intent: 'policy_interface:office_structure_to_fitout' },
      { fromStageCode: 'facade_mep_release', toStageCode: 'opening_operation_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:office_facade_mep_to_opening' },
      { fromStageCode: 'office_commercial_fitout_release', toStageCode: 'opening_operation_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:office_fitout_to_opening' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '商办项目按共享地下与裙房、办公塔楼、幕墙机电、公区精装和开业运营接口组织。',
  },
  {
    policyId: 'project-organization-general-civil-mixed-use-complex-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['general_civil', 'commercial'],
    strategy: 'mixed_use_shared_podium_multi_tower_phased_handover_network',
    schemeFamily: 'mixed_use_shared_podium_multi_tower_phasing',
    primaryInterfaceSequence: ['shared_podium_release', 'mixed_use_tower_release', 'multi_system_fitout_interface', 'phased_opening_handover'],
    interfaceGateTags: ['shared_podium_gate', 'mixed_use_tower_gate', 'multi_system_interface_gate', 'phased_opening_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'mixed_use_zone_lane',
    maxLaneTotal: 10,
    confidence: 'high',
    variantCode: 'general_civil_mixed_use_complex',
    selectionSignals: ['civil_complex', 'mixed_use_complex'],
    selectionPriority: 40,
    organizationNetwork: policyNetwork([
      ['shared_podium_release', '共享地下室与商业裙房结构移交', 'tower', 90],
      ['mixed_use_tower_release', '住宅办公塔楼与多业态转换界面移交', 'tower', 98],
      ['multi_system_fitout_interface', '多业态机电、幕墙与精装接口分区闭合', 'tower', 108],
      ['phased_opening_handover', '分业态联调、分期验收与运营移交', 'handoff', 56],
    ], [
      { fromStageCode: 'shared_podium_release', toStageCode: 'mixed_use_tower_release', dependencyType: 'SS', lagDays: 35, intent: 'policy_interface:shared_podium_to_mixed_use_towers' },
      { fromStageCode: 'shared_podium_release', toStageCode: 'multi_system_fitout_interface', dependencyType: 'SS', lagDays: 63, intent: 'policy_interface:shared_podium_to_multi_system_fitout' },
      { fromStageCode: 'mixed_use_tower_release', toStageCode: 'phased_opening_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:mixed_use_towers_to_phased_handover' },
      { fromStageCode: 'multi_system_fitout_interface', toStageCode: 'phased_opening_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:multi_system_fitout_to_phased_handover' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '综合体按共享地下与裙房、多业态塔楼、专业系统接口和分期开放移交组织。',
  },
  {
    policyId: 'project-organization-hotel-tower-fitout-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['hotel'],
    strategy: 'hotel_guestroom_tower_public_area_fitout_gate_network',
    schemeFamily: 'tower_guestroom_public_area_fitout',
    primaryInterfaceSequence: ['tower_structure_release', 'guestroom_standard_floor_release', 'public_area_fitout_release', 'hotel_opening_handover'],
    interfaceGateTags: ['guestroom_mockup_gate', 'public_area_fitout_gate', 'mep_commissioning_gate', 'opening_handover_gate'],
    laneRole: 'primary_building_lane',
    lanePrefix: 'hotel_tower_lane',
    maxLaneTotal: 6,
    confidence: 'medium',
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '酒店项目按塔楼客房标准层、公共区精装、机电调试和开业移交门槛组织。',
  },
  {
    policyId: 'project-organization-hospital-functional-campus-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['hospital'],
    strategy: 'hospital_functional_building_interface_gate_network',
    schemeFamily: 'functional_campus_medical_specialty_gate',
    primaryInterfaceSequence: ['functional_building_release', 'clean_area_release', 'medical_gas_interface', 'special_acceptance_handover'],
    interfaceGateTags: ['cleanroom_gate', 'medical_gas_gate', 'infection_control_gate', 'special_acceptance_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'hospital_function_lane',
    maxLaneTotal: 6,
    confidence: 'medium',
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '医院项目按功能楼栋/洁净区/医气/专项验收接口组织,功能接口 gate 比资源数量更关键。',
  },
  {
    policyId: 'project-organization-school-campus-phasing-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['school'],
    strategy: 'school_campus_teaching_living_sport_phased_handover_network',
    schemeFamily: 'campus_function_zone_phased_handover',
    primaryInterfaceSequence: ['teaching_zone_release', 'living_zone_release', 'sports_zone_release', 'campus_site_handover'],
    interfaceGateTags: ['teaching_zone_gate', 'living_zone_gate', 'sports_facility_gate', 'campus_site_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'campus_function_lane',
    maxLaneTotal: 6,
    confidence: 'medium',
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '学校项目按教学、生活、食堂、运动场和校园总平分期交付组织。',
  },
  {
    policyId: 'project-organization-industrial-production-utility-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['industrial'],
    strategy: 'industrial_main_plant_utility_warehouse_commissioning_network',
    schemeFamily: 'main_plant_utility_process_commissioning',
    primaryInterfaceSequence: ['main_plant_release', 'utility_system_release', 'process_equipment_entry', 'trial_production_handover'],
    interfaceGateTags: ['main_plant_gate', 'utility_gate', 'equipment_entry_gate', 'trial_production_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'industrial_function_lane',
    maxLaneTotal: 6,
    confidence: 'medium',
    variantCode: 'industrial_general_manufacturing',
    selectionSignals: ['industrial_general'],
    organizationNetwork: policyNetwork([
      ['main_plant_release', '主厂房结构与围护分区移交', 'tower', 70],
      ['utility_system_release', '公辅能源介质系统移交', 'tower', 58],
      ['process_equipment_entry', '生产设备进场安装与单机试运', 'tower', 72],
      ['trial_production_handover', '联动负荷试车与投产移交', 'handoff', 42],
    ], [
      { fromStageCode: 'main_plant_release', toStageCode: 'utility_system_release', dependencyType: 'SS', lagDays: 21, intent: 'policy_interface:industrial_shell_to_utility_parallel_release' },
      { fromStageCode: 'main_plant_release', toStageCode: 'process_equipment_entry', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:industrial_shell_to_equipment_entry' },
      { fromStageCode: 'utility_system_release', toStageCode: 'trial_production_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:industrial_utility_to_trial_production' },
      { fromStageCode: 'process_equipment_entry', toStageCode: 'trial_production_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:industrial_equipment_to_trial_production' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '工业项目按主厂房、公辅、仓库、工艺设备进场条件和试生产接口组织。',
  },
  {
    policyId: 'project-organization-industrial-logistics-automation-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['industrial'],
    strategy: 'industrial_logistics_floor_rack_automation_handover_network',
    schemeFamily: 'warehouse_shell_superflat_floor_rack_automation',
    primaryInterfaceSequence: ['warehouse_shell_release', 'superflat_floor_release', 'rack_asrs_agv_release', 'warehouse_operation_handover'],
    interfaceGateTags: ['warehouse_shell_gate', 'superflat_floor_gate', 'rack_automation_gate', 'warehouse_operation_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'logistics_zone_lane',
    maxLaneTotal: 10,
    confidence: 'high',
    variantCode: 'industrial_logistics_automation',
    selectionSignals: ['industrial_logistics', 'logistics', 'logistics_warehouse', 'automated_warehouse', 'logistics_warehouse_fitout', 'warehouse_floor_hardening', 'agv_automation'],
    selectionPriority: 30,
    organizationNetwork: policyNetwork([
      ['warehouse_shell_release', '仓库结构围护与装卸口封闭', 'tower', 58],
      ['superflat_floor_release', '超平地坪分区验收移交', 'tower', 42],
      ['rack_asrs_agv_release', '货架堆垛机与 AGV 系统安装联调', 'tower', 64],
      ['warehouse_operation_handover', '消防联动与仓储运行移交', 'handoff', 32],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'parallel_with_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '物流仓储项目以建筑封闭、超平地坪、货架自动化、消防和运营演练的界面移交组织。',
  },
  {
    policyId: 'project-organization-industrial-process-validation-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['industrial'],
    strategy: 'industrial_process_utility_equipment_validation_network',
    schemeFamily: 'process_shell_clean_utility_equipment_validation',
    primaryInterfaceSequence: ['process_shell_release', 'clean_utility_loop_release', 'equipment_iq_oq_release', 'process_trial_production_handover'],
    interfaceGateTags: ['process_shell_gate', 'clean_utility_gate', 'equipment_iq_oq_gate', 'process_validation_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'process_system_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    variantCode: 'industrial_process_validation',
    selectionSignals: ['industrial_cleanroom', 'process_facility', 'process_manufacturing', 'clean_production', 'process_utility_room', 'process_piping', 'clean_utility'],
    selectionPriority: 40,
    organizationNetwork: policyNetwork([
      ['process_shell_release', '工艺区围护与受控环境移交', 'tower', 60],
      ['clean_utility_loop_release', '工艺介质与洁净公用系统验证', 'tower', 78],
      ['equipment_iq_oq_release', '工艺设备安装及 IQ/OQ 放行', 'tower', 70],
      ['process_trial_production_handover', '工艺联动验证与试生产移交', 'handoff', 48],
    ], [
      { fromStageCode: 'process_shell_release', toStageCode: 'clean_utility_loop_release', dependencyType: 'SS', lagDays: 14, intent: 'policy_interface:process_shell_to_clean_utility' },
      { fromStageCode: 'process_shell_release', toStageCode: 'equipment_iq_oq_release', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:process_shell_to_equipment_iq_oq' },
      { fromStageCode: 'clean_utility_loop_release', toStageCode: 'process_trial_production_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:clean_utility_to_process_trial' },
      { fromStageCode: 'equipment_iq_oq_release', toStageCode: 'process_trial_production_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:equipment_validation_to_process_trial' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '流程生产项目以受控环境、公用介质、设备验证和试生产放行为主接口组织。',
  },
  {
    policyId: 'project-organization-industrial-heavy-equipment-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['industrial'],
    strategy: 'industrial_heavy_foundation_lifting_equipment_load_trial_network',
    schemeFamily: 'heavy_foundation_lift_path_equipment_load_trial',
    primaryInterfaceSequence: ['heavy_foundation_release', 'lifting_route_crane_release', 'heavy_equipment_alignment_release', 'heavy_load_trial_handover'],
    interfaceGateTags: ['heavy_foundation_gate', 'lifting_route_gate', 'equipment_alignment_gate', 'load_trial_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'heavy_equipment_bay_lane',
    maxLaneTotal: 6,
    confidence: 'high',
    variantCode: 'industrial_heavy_equipment',
    selectionSignals: ['industrial_heavy', 'heavy_manufacturing', 'heavy_industry', 'heavy_industrial_plant', 'heavy_equipment_bay', 'heavy_equipment_installation', 'large_equipment_lifting', 'crane_path_control'],
    selectionPriority: 50,
    organizationNetwork: policyNetwork([
      ['heavy_foundation_release', '重型设备基础强度与精度移交', 'foundation', 66],
      ['lifting_route_crane_release', '大型吊装通道与起重系统放行', 'tower', 54],
      ['heavy_equipment_alignment_release', '重型设备就位找正与二次灌浆', 'tower', 82],
      ['heavy_load_trial_handover', '公辅联动重载试车与投产移交', 'handoff', 46],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '重型制造项目以基础精度、吊装通道、设备找正灌浆和重载试车的刚性接口组织。',
  },
  {
    policyId: 'project-organization-data-center-campus-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['data_center'],
    strategy: 'data_center_hall_power_cooling_commissioning_network',
    schemeFamily: 'data_hall_power_cooling_integrated_commissioning',
    primaryInterfaceSequence: ['data_hall_release', 'power_chain_release', 'cooling_chain_release', 'integrated_load_commissioning'],
    interfaceGateTags: ['data_hall_gate', 'power_chain_gate', 'cooling_chain_gate', 'integrated_commissioning_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'data_hall_lane',
    maxLaneTotal: 6,
    confidence: 'medium',
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '数据中心按机房模块、电力、制冷、弱电网络和满载联调接口组织。',
  },
  {
    policyId: 'project-organization-transportation-hub-interface-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['transportation_hub'],
    strategy: 'transportation_hub_station_platform_traffic_transfer_system_network',
    schemeFamily: 'hub_station_platform_transfer_system_interface',
    primaryInterfaceSequence: ['station_hall_release', 'platform_interface_release', 'traffic_transfer_release', 'operation_trial_handover'],
    interfaceGateTags: ['station_hall_gate', 'platform_interface_gate', 'traffic_transfer_gate', 'operation_trial_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'hub_zone_lane',
    maxLaneTotal: 8,
    confidence: 'medium',
    variantCode: 'transportation_multimodal_hub',
    selectionSignals: ['transport_multimodal'],
    organizationNetwork: policyNetwork([
      ['station_hall_release', '综合枢纽站房与公共空间移交', 'tower', 72],
      ['platform_interface_release', '站台与换乘接口移交', 'tower', 56],
      ['traffic_transfer_release', '外部交通与换乘系统放行', 'outdoor', 48],
      ['operation_trial_handover', '全场景试运营与接管移交', 'handoff', 38],
    ], [
      { fromStageCode: 'station_hall_release', toStageCode: 'platform_interface_release', dependencyType: 'SS', lagDays: 21, intent: 'policy_interface:hub_station_hall_to_platform_parallel_release' },
      { fromStageCode: 'station_hall_release', toStageCode: 'traffic_transfer_release', dependencyType: 'SS', lagDays: 28, intent: 'policy_interface:hub_station_hall_to_external_transfer' },
      { fromStageCode: 'platform_interface_release', toStageCode: 'operation_trial_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:hub_platform_to_trial_operation' },
      { fromStageCode: 'traffic_transfer_release', toStageCode: 'operation_trial_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:hub_external_transfer_to_trial_operation' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '交通枢纽按站房、站台、交通转换、系统联调和试运行接口组织。',
  },
  {
    policyId: 'project-organization-transportation-rail-station-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['transportation_hub'],
    strategy: 'transportation_rail_station_hall_platform_operating_interface_network',
    schemeFamily: 'rail_station_hall_platform_trackside_trial_operation',
    primaryInterfaceSequence: ['rail_station_shell_release', 'trackside_protection_release', 'platform_system_release', 'rail_operator_trial_handover'],
    interfaceGateTags: ['rail_station_shell_gate', 'trackside_protection_gate', 'platform_system_gate', 'rail_operator_trial_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'rail_station_zone_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    variantCode: 'transportation_rail_station',
    selectionSignals: ['transport_railway_station', 'railway_station', 'station_hall', 'platform_interface', 'operating_line_interface', 'trackside_protection', 'platform_canopy_installation'],
    selectionPriority: 35,
    organizationNetwork: policyNetwork([
      ['rail_station_shell_release', '站房屋盖围护与公共区封闭', 'tower', 74],
      ['trackside_protection_release', '营业线与站台侧防护放行', 'tower', 46],
      ['platform_system_release', '站台客运系统与运营接口联调', 'tower', 62],
      ['rail_operator_trial_handover', '铁路运营场景试验与移交', 'handoff', 40],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '铁路站房以站房封闭、营业线防护、站台客运系统和运营单位试验移交组织。',
  },
  {
    policyId: 'project-organization-transportation-metro-interchange-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['transportation_hub'],
    strategy: 'transportation_metro_live_operation_night_window_transfer_network',
    schemeFamily: 'metro_live_operation_transfer_passage_night_window',
    primaryInterfaceSequence: ['metro_operation_protection_release', 'interchange_passage_release', 'night_window_system_tiein', 'metro_phased_opening_handover'],
    interfaceGateTags: ['metro_operation_protection_gate', 'interchange_passage_gate', 'night_window_tiein_gate', 'metro_phased_opening_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'metro_interchange_lane',
    maxLaneTotal: 10,
    confidence: 'high',
    variantCode: 'transportation_metro_interchange',
    selectionSignals: ['transport_metro_interchange', 'metro_interchange', 'underground_station', 'metro_platform', 'transfer_hall', 'night_window_tiein', 'metro_transfer_passage'],
    selectionPriority: 50,
    organizationNetwork: policyNetwork([
      ['metro_operation_protection_release', '既有线运营保护与监测放行', 'foundation', 52],
      ['interchange_passage_release', '换乘厅与通道分区移交', 'tower', 66],
      ['night_window_system_tiein', '夜间窗口系统接驳与恢复', 'tower', 44],
      ['metro_phased_opening_handover', '分阶段试运营与开通移交', 'handoff', 42],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'parallel_with_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '地铁换乘项目以既有线保护、换乘通道、夜间窗口接驳和分阶段开通为主线。',
  },
  {
    policyId: 'project-organization-transportation-bus-terminal-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['transportation_hub'],
    strategy: 'transportation_bus_terminal_yard_charging_dispatch_network',
    schemeFamily: 'bus_terminal_yard_charging_dispatch_trial',
    primaryInterfaceSequence: ['bus_terminal_shell_release', 'bus_yard_traffic_release', 'charging_dispatch_system_release', 'passenger_vehicle_trial_handover'],
    interfaceGateTags: ['bus_terminal_shell_gate', 'bus_yard_traffic_gate', 'charging_dispatch_gate', 'passenger_vehicle_trial_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'bus_terminal_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    variantCode: 'transportation_bus_terminal',
    selectionSignals: ['transport_bus_terminal', 'bus_terminal', 'bus_yard', 'dispatch_center', 'bus_yard_phasing', 'charging_system_commissioning'],
    selectionPriority: 40,
    organizationNetwork: policyNetwork([
      ['bus_terminal_shell_release', '客运站房与候车区封闭移交', 'tower', 56],
      ['bus_yard_traffic_release', '发车位停车坪与车流组织放行', 'outdoor', 52],
      ['charging_dispatch_system_release', '充电消防与车辆调度系统联调', 'tower', 46],
      ['passenger_vehicle_trial_handover', '人车分流试运行与运营移交', 'handoff', 32],
    ], [
      { fromStageCode: 'bus_terminal_shell_release', toStageCode: 'charging_dispatch_system_release', dependencyType: 'SS', lagDays: 14, intent: 'policy_interface:bus_terminal_shell_to_dispatch_system' },
      { fromStageCode: 'bus_yard_traffic_release', toStageCode: 'charging_dispatch_system_release', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:bus_yard_to_charging_dispatch' },
      { fromStageCode: 'bus_terminal_shell_release', toStageCode: 'passenger_vehicle_trial_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:bus_terminal_shell_to_trial' },
      { fromStageCode: 'charging_dispatch_system_release', toStageCode: 'passenger_vehicle_trial_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:bus_dispatch_to_trial' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'parallel_with_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '汽车客运站以站房、停车发车场、充电调度系统和人车分流试运行为主线。',
  },
  {
    policyId: 'project-organization-sports-culture-longspan-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['sports_culture'],
    strategy: 'sports_culture_longspan_envelope_system_event_handover_network',
    schemeFamily: 'longspan_envelope_event_handover',
    primaryInterfaceSequence: ['longspan_structure_release', 'envelope_roof_release', 'venue_system_release', 'event_handover'],
    interfaceGateTags: ['longspan_structure_gate', 'envelope_roof_gate', 'venue_system_gate', 'event_handover_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'venue_zone_lane',
    maxLaneTotal: 6,
    confidence: 'medium',
    variantCode: 'sports_culture_stadium',
    selectionSignals: ['sports_stadium'],
    organizationNetwork: policyNetwork([
      ['longspan_structure_release', '大跨度屋盖与看台结构移交', 'tower', 82],
      ['envelope_roof_release', '屋面围护水密封闭移交', 'tower', 58],
      ['venue_system_release', '场地看台与赛事系统联调放行', 'tower', 62],
      ['event_handover', '满载赛事演练与运营移交', 'handoff', 38],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '体育文化建筑按大跨结构、围护屋面、看台/场馆系统和赛事交付接口组织。',
  },
  {
    policyId: 'project-organization-sports-culture-indoor-arena-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['sports_culture'],
    strategy: 'sports_culture_arena_bowl_conversion_event_network',
    schemeFamily: 'arena_bowl_retractable_seating_event_conversion',
    primaryInterfaceSequence: ['arena_shell_bowl_release', 'arena_floor_seating_release', 'arena_event_system_release', 'arena_conversion_trial_handover'],
    interfaceGateTags: ['arena_shell_gate', 'arena_floor_seating_gate', 'arena_event_system_gate', 'arena_conversion_trial_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'arena_zone_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    variantCode: 'sports_culture_indoor_arena',
    selectionSignals: ['sports_indoor_arena', 'indoor_arena', 'arena_bowl', 'retractable_seating', 'arena_event_conversion'],
    selectionPriority: 40,
    organizationNetwork: policyNetwork([
      ['arena_shell_bowl_release', '室内馆屋盖与碗区结构移交', 'tower', 70],
      ['arena_floor_seating_release', '活动场地与伸缩看台系统移交', 'tower', 52],
      ['arena_event_system_release', '计时计分声光电与安保系统联调', 'tower', 58],
      ['arena_conversion_trial_handover', '多模式转换演练与运营移交', 'handoff', 36],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '室内体育馆以碗区、活动场地与伸缩看台、赛事系统和场景转换演练组织。',
  },
  {
    policyId: 'project-organization-sports-culture-theater-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['sports_culture'],
    strategy: 'sports_culture_theater_acoustic_stage_rehearsal_network',
    schemeFamily: 'theater_auditorium_acoustic_stage_machinery_rehearsal',
    primaryInterfaceSequence: ['theater_shell_release', 'auditorium_acoustic_release', 'stage_machinery_system_release', 'performance_rehearsal_handover'],
    interfaceGateTags: ['theater_shell_gate', 'auditorium_acoustic_gate', 'stage_machinery_gate', 'performance_rehearsal_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'theater_function_lane',
    maxLaneTotal: 8,
    confidence: 'high',
    variantCode: 'sports_culture_theater',
    selectionSignals: ['sports_theater', 'theater', 'theater_building', 'stage', 'auditorium', 'performing_arts', 'stage_machinery', 'acoustic_fitout', 'performance_rehearsal'],
    selectionPriority: 50,
    organizationNetwork: policyNetwork([
      ['theater_shell_release', '剧场观众厅舞台塔与围护移交', 'tower', 68],
      ['auditorium_acoustic_release', '观众厅声学装饰与隔声验收', 'tower', 64],
      ['stage_machinery_system_release', '舞台机械灯光音响与防火幕联调', 'tower', 72],
      ['performance_rehearsal_handover', '全流程带妆演出与运营移交', 'handoff', 42],
    ], [
      { fromStageCode: 'theater_shell_release', toStageCode: 'auditorium_acoustic_release', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:theater_shell_to_acoustic_fitout' },
      { fromStageCode: 'theater_shell_release', toStageCode: 'stage_machinery_system_release', dependencyType: 'SS', lagDays: 21, intent: 'policy_interface:theater_shell_to_stage_system' },
      { fromStageCode: 'auditorium_acoustic_release', toStageCode: 'performance_rehearsal_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:theater_acoustic_to_rehearsal' },
      { fromStageCode: 'stage_machinery_system_release', toStageCode: 'performance_rehearsal_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:theater_stage_system_to_rehearsal' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '剧院以观众厅声学、舞台机械、演出系统和带妆排演的联合放行组织。',
  },
  {
    policyId: 'project-organization-sports-culture-exhibition-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['sports_culture'],
    strategy: 'sports_culture_exhibition_environment_display_opening_network',
    schemeFamily: 'exhibition_hall_collection_environment_display_opening',
    primaryInterfaceSequence: ['exhibition_shell_release', 'collection_environment_release', 'display_security_system_release', 'exhibition_opening_handover'],
    interfaceGateTags: ['exhibition_shell_gate', 'collection_environment_gate', 'display_security_gate', 'exhibition_opening_gate'],
    laneRole: 'functional_zone_lane',
    lanePrefix: 'exhibition_zone_lane',
    maxLaneTotal: 10,
    confidence: 'high',
    variantCode: 'sports_culture_exhibition',
    selectionSignals: ['sports_exhibition', 'exhibition_venue', 'exhibition_hall', 'collection_storage', 'museum_exhibition', 'exhibition_fitout', 'collection_environment_control'],
    selectionPriority: 45,
    organizationNetwork: policyNetwork([
      ['exhibition_shell_release', '展厅结构围护与大空间移交', 'tower', 62],
      ['collection_environment_release', '恒温恒湿与藏品环境验证', 'tower', 58],
      ['display_security_system_release', '布展承载照明安防与导览联调', 'tower', 60],
      ['exhibition_opening_handover', '观众流线试开放与运营移交', 'handoff', 34],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '博物馆展览建筑以展厅封闭、藏品环境、布展安防系统和试开放组织。',
  },
  {
    policyId: 'project-organization-tod-deck-tower-interface-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['tod_upper_cover'],
    strategy: 'tod_transfer_deck_upper_cover_tower_interface_network',
    schemeFamily: 'tod_transfer_deck_upper_cover_tower',
    primaryInterfaceSequence: ['rail_interface_release', 'transfer_deck_release', 'upper_cover_podium_release', 'tower_lane_release'],
    interfaceGateTags: ['rail_operation_interface_gate', 'transfer_deck_gate', 'upper_cover_gate', 'tower_lane_gate'],
    laneRole: 'primary_building_lane',
    lanePrefix: 'tod_tower_lane',
    maxLaneTotal: 8,
    confidence: 'medium',
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: 'TOD 上盖按轨交接口、转换板、裙房、塔楼和外部接口 gate 组织。',
  },
  {
    policyId: 'project-organization-renovation-zone-decanting-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['renovation'],
    strategy: 'renovation_occupied_zone_decanting_cutover_network',
    schemeFamily: 'occupied_zone_decanting_cutover',
    primaryInterfaceSequence: ['decanting_zone_release', 'occupied_workface_isolation', 'system_cutover_window', 'phased_reoccupation_handover'],
    interfaceGateTags: ['decanting_gate', 'occupied_workface_gate', 'system_cutover_gate', 'reoccupation_handover_gate'],
    laneRole: 'renovation_zone_lane',
    lanePrefix: 'renovation_zone_lane',
    maxLaneTotal: 8,
    laneSizingPolicy: {
      basis: 'renovation_workface_proxy',
      minimumLaneTotal: 1,
      areaPerLaneM2: 6000,
      floorsPerLane: 5,
    },
    confidence: 'medium',
    networkPolicy: {
      sharedWorksRelease: 'parallel_with_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '改造项目按分区腾挪、不断业施工和系统切换窗口组织。',
  },
  {
    policyId: 'project-organization-renovation-seismic-reinforcement-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['renovation'],
    strategy: 'renovation_seismic_appraisal_support_reinforcement_retest_network',
    schemeFamily: 'seismic_appraisal_reinforcement_retest',
    primaryInterfaceSequence: ['seismic_appraisal_release', 'temporary_support_release', 'reinforcement_zone_release', 'capacity_retest_handover'],
    interfaceGateTags: ['seismic_appraisal_gate', 'temporary_support_gate', 'reinforcement_gate', 'capacity_retest_gate'],
    laneRole: 'renovation_zone_lane',
    lanePrefix: 'seismic_reinforcement_zone_lane',
    maxLaneTotal: 8,
    laneSizingPolicy: {
      basis: 'renovation_workface_proxy',
      minimumLaneTotal: 1,
      areaPerLaneM2: 6000,
      floorsPerLane: 5,
    },
    confidence: 'high',
    variantCode: 'renovation_seismic_reinforcement',
    selectionSignals: ['renovation_seismic', 'seismic_retrofit'],
    selectionPriority: 30,
    organizationNetwork: policyNetwork([
      ['seismic_appraisal_release', '抗震鉴定与加固范围放行', 'foundation', 30],
      ['temporary_support_release', '临时支撑卸载与样板节点放行', 'tower', 36],
      ['reinforcement_zone_release', '植筋粘钢碳纤维及构件补强分区施工', 'tower', 78],
      ['capacity_retest_handover', '承载复测、鉴定闭合与加固验收移交', 'handoff', 38],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '抗震加固按鉴定、临时支撑、分区补强、承载复测和专项验收闭合组织。',
  },
  {
    policyId: 'project-organization-renovation-energy-retrofit-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['renovation'],
    strategy: 'renovation_energy_envelope_mep_metering_verification_network',
    schemeFamily: 'energy_envelope_mep_metering_verification',
    primaryInterfaceSequence: ['energy_audit_release', 'envelope_sample_release', 'mep_energy_system_release', 'energy_acceptance_handover'],
    interfaceGateTags: ['energy_audit_gate', 'envelope_sample_gate', 'mep_energy_gate', 'energy_acceptance_gate'],
    laneRole: 'renovation_zone_lane',
    lanePrefix: 'energy_retrofit_zone_lane',
    maxLaneTotal: 8,
    laneSizingPolicy: {
      basis: 'renovation_workface_proxy',
      minimumLaneTotal: 1,
      areaPerLaneM2: 6000,
      floorsPerLane: 5,
    },
    confidence: 'high',
    variantCode: 'renovation_energy_retrofit',
    selectionSignals: ['renovation_energy', 'energy_retrofit'],
    selectionPriority: 30,
    organizationNetwork: policyNetwork([
      ['energy_audit_release', '围护热工与机电能效诊断放行', 'foundation', 28],
      ['envelope_sample_release', '保温外窗屋面样板与分区施工放行', 'tower', 62],
      ['mep_energy_system_release', '高效机电、照明控制与能耗监测联调', 'tower', 58],
      ['energy_acceptance_handover', '节能专项验收与运行能效移交', 'handoff', 34],
    ], [
      { fromStageCode: 'energy_audit_release', toStageCode: 'envelope_sample_release', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:energy_audit_to_envelope_sample' },
      { fromStageCode: 'energy_audit_release', toStageCode: 'mep_energy_system_release', dependencyType: 'SS', lagDays: 21, intent: 'policy_interface:energy_audit_to_mep_energy' },
      { fromStageCode: 'envelope_sample_release', toStageCode: 'energy_acceptance_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:envelope_to_energy_acceptance' },
      { fromStageCode: 'mep_energy_system_release', toStageCode: 'energy_acceptance_handover', dependencyType: 'FS', lagDays: 0, intent: 'policy_interface:mep_energy_to_energy_acceptance' },
    ]),
    networkPolicy: {
      sharedWorksRelease: 'parallel_with_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '节能改造按能效诊断、围护样板、机电节能与能耗监测、专项验收和运行移交组织。',
  },
  {
    policyId: 'project-organization-renovation-heritage-conservation-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['renovation'],
    strategy: 'heritage_survey_trial_repair_micro_workface_acceptance_network',
    schemeFamily: 'heritage_survey_trial_repair_micro_workface',
    primaryInterfaceSequence: ['heritage_survey_release', 'trial_repair_release', 'traditional_craft_workface_release', 'heritage_acceptance_opening'],
    interfaceGateTags: ['heritage_survey_gate', 'trial_repair_gate', 'traditional_craft_gate', 'heritage_acceptance_gate'],
    laneRole: 'renovation_zone_lane',
    lanePrefix: 'heritage_conservation_lane',
    maxLaneTotal: 6,
    laneSizingPolicy: {
      basis: 'renovation_workface_proxy',
      minimumLaneTotal: 1,
      areaPerLaneM2: 4500,
      floorsPerLane: 3,
    },
    confidence: 'high',
    variantCode: 'renovation_heritage_conservation',
    selectionSignals: ['renovation_heritage', 'heritage', 'historic_preservation', 'heritage_conservation'],
    selectionPriority: 40,
    organizationNetwork: policyNetwork([
      ['heritage_survey_release', '文物本体测绘、病害调查与保护边界放行', 'foundation', 36],
      ['trial_repair_release', '传统材料试配、可逆加固与样板试修确认', 'tower', 42],
      ['traditional_craft_workface_release', '木作彩绘砖石分区修缮与专家复核', 'tower', 84],
      ['heritage_acceptance_opening', '文保专项验收、档案移交与开放恢复', 'handoff', 42],
    ]),
    networkPolicy: {
      sharedWorksRelease: 'before_primary_lanes',
      primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '文保修缮按精细测绘、保护边界、样板试修、传统工艺微工作面、专家复核和专项验收组织。',
  },
  {
    policyId: 'project-organization-modular-factory-site-v1',
    source: 'project_construction_organization_policy_seed',
    sourceVersion: PROJECT_CONSTRUCTION_ORGANIZATION_POLICY_VERSION,
    businessTypeCodes: ['modular_building'],
    strategy: 'modular_factory_site_parallel_assembly_network',
    schemeFamily: 'factory_site_parallel_modular_assembly',
    primaryInterfaceSequence: ['factory_module_completion', 'site_foundation_release', 'module_hoisting_assembly', 'connection_commissioning_handover'],
    interfaceGateTags: ['factory_module_gate', 'site_foundation_gate', 'hoisting_assembly_gate', 'connection_commissioning_gate'],
    laneRole: 'factory_site_lane',
    lanePrefix: 'modular_site_lane',
    maxLaneTotal: 10,
    confidence: 'high',
    networkPolicy: {
      sharedWorksRelease: 'parallel_with_primary_lanes',
      primaryLaneScheduling: 'parallel_lanes_with_interface_gates',
      interfaceGatePolicy: 'business_type_governed_gate_network',
    },
    governance: {
      assetType: 'project_construction_organization_policy',
      curationStatus: 'seeded',
      directSeedMutation: false,
      resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
    },
    rationale: '模块化建筑按工厂生产、现场基础、吊装装配和节点连接调试接口组织。',
  },
]

export function listProjectConstructionOrganizationPolicies() {
  return PROJECT_CONSTRUCTION_ORGANIZATION_POLICIES
}

function normalizePolicySignal(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function hasActivePolicySignalValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  if (typeof value === 'string') {
    const normalized = normalizePolicySignal(value)
    return normalized !== '' && normalized !== 'false' && normalized !== '0' && normalized !== 'none'
  }
  if (Array.isArray(value)) return value.some(hasActivePolicySignalValue)
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasActivePolicySignalValue)
  }
  return value === true
}

function collectPolicySignals(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectPolicySignals)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, nestedValue]) => hasActivePolicySignalValue(nestedValue))
      .flatMap(([key, nestedValue]) => [key, ...collectPolicySignals(nestedValue)])
  }
  if (!hasActivePolicySignalValue(value) || typeof value === 'boolean') return []
  const normalized = normalizePolicySignal(value)
  return normalized ? [normalized] : []
}

function selectionContextSignals(
  businessTypeCode?: string | null,
  projectTypeCode?: string | null,
  context: ProjectConstructionOrganizationPolicySelectionContext = {},
) {
  return new Set([
    ...collectPolicySignals(businessTypeCode),
    ...collectPolicySignals(projectTypeCode),
    ...collectPolicySignals(context.businessSubtype),
    ...collectPolicySignals(context.structureTypeCode),
    ...collectPolicySignals(context.methodVariantCodes),
    ...collectPolicySignals(context.prefabSystemCodes),
    ...collectPolicySignals(context.elementVariantCodes),
    ...collectPolicySignals(context.externalInterfaceCodes),
    ...collectPolicySignals(context.hardConstraintCodes),
    ...collectPolicySignals(context.functionalUsageCodes),
    ...collectPolicySignals(context.functionalCategoryCodes),
    ...collectPolicySignals(context.specialRoomTypeCodes),
    ...collectPolicySignals(context.physicalZoneTypeCodes),
    ...collectPolicySignals(context.projectFeatures),
  ])
}

function resolvedPolicy(policy: ProjectConstructionOrganizationPolicy): ResolvedProjectConstructionOrganizationPolicy {
  return {
    ...policy,
    variantCode: policy.variantCode ?? policy.policyId,
    selectionSignals: policy.selectionSignals ?? [],
    organizationNetwork: policy.organizationNetwork ?? defaultOrganizationNetwork(policy),
  }
}

export function resolveProjectConstructionOrganizationPolicy(
  businessTypeCode?: string | null,
  projectTypeCode?: string | null,
  context: ProjectConstructionOrganizationPolicySelectionContext = {},
): ResolvedProjectConstructionOrganizationPolicy {
  const candidates = [businessTypeCode, projectTypeCode]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)
  const businessPolicies = PROJECT_CONSTRUCTION_ORGANIZATION_POLICIES.filter((policy) => (
    policy.businessTypeCodes.some((code) => candidates.includes(code))
  ))
  if (businessPolicies.length === 0) return resolvedPolicy(PROJECT_CONSTRUCTION_ORGANIZATION_POLICIES[0]!)

  const inputSignals = selectionContextSignals(businessTypeCode, projectTypeCode, context)
  const normalizedBusinessTypeCode = normalizePolicySignal(businessTypeCode)
  const normalizedProjectTypeCode = normalizePolicySignal(projectTypeCode)
  const explicitSubtypeSignal = normalizePolicySignal(context.businessSubtype)
    || (normalizedProjectTypeCode && normalizedProjectTypeCode !== normalizedBusinessTypeCode
      ? normalizedProjectTypeCode
      : '')
  const scoredVariants = businessPolicies
    .filter((policy) => (policy.selectionSignals?.length ?? 0) > 0)
    .map((policy) => {
      const normalizedSelectionSignals = (policy.selectionSignals ?? []).map(normalizePolicySignal)
      return {
        policy,
        explicitSubtypeMatch: Boolean(
          explicitSubtypeSignal
          && normalizedSelectionSignals.includes(explicitSubtypeSignal),
        ),
        matchedSignalCount: normalizedSelectionSignals
          .filter((signal) => inputSignals.has(signal)).length,
      }
    })
    .filter((candidate) => candidate.matchedSignalCount > 0)
    .sort((left, right) => (
      Number(right.explicitSubtypeMatch) - Number(left.explicitSubtypeMatch)
      || right.matchedSignalCount - left.matchedSignalCount
      || (right.policy.selectionPriority ?? 0) - (left.policy.selectionPriority ?? 0)
      || left.policy.policyId.localeCompare(right.policy.policyId)
    ))

  return resolvedPolicy(scoredVariants[0]?.policy ?? businessPolicies.find((policy) => (
    (policy.selectionSignals?.length ?? 0) === 0
  )) ?? businessPolicies[0]!)
}
