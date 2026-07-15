import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  collectStandardInternalFlowGovernanceReport,
  resolveStandardInternalFlowRule,
  type ChinaTemplateCatalog,
  type ChinaTemplateCatalogNode,
  type StandardInternalFlowRule,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS, type WbsTemplateCatalogGroup } from '../seeds/domainWbsTemplateCatalogs.js'
import { ACCEPTANCE_TIMELINE_TEMPLATE_SEED } from '../seeds/acceptanceTimelineTemplateSeed.js'
import {
  V1475_CROSS_ITEM_WORKFLOW_SEED,
  type V1475CrossItemWorkflowHandoffCategory,
  type V1475CrossItemWorkflowRule,
} from '../seeds/v1475CrossItemWorkflowSeed.js'
import { STANDARD_INTERNAL_FLOW_RULE_SEED } from '../seeds/standardInternalFlowSeed.js'
import {
  inferDurationContributionMode,
  normalizeDurationContributionMode,
  type DurationContributionMode,
} from '../seeds/durationContributionMode.js'
import {
  DEPENDENCY_INTENT_REFERENCE_FIELDS,
  V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID,
  V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES,
  V1475_DEPENDENCY_INTENT_SCOPE_RULES,
  inspectV1475DependencyIntentTemplates,
  readDependencyIntentReferenceCodes,
  type V1475DependencyIntentAuditRecord,
  type V1475DependencyRelationRole,
  type V1475DependencyIntentResolutionSummary,
} from '../seeds/v1475DependencyIntentTemplates.js'
import { V1474_PROCESS_CONSTRAINT_SEED, type V1474ProcessConstraintRule } from '../seeds/v1474ProcessConstraintSeed.js'
import { getAlgorithmSeedEntry, type AlgorithmSeedType } from './algorithmSeedRegistry.js'

export const CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE = 'construction_task_dependency_constraint_rule_system'
export const CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION = 'v1.4.22.2'

export type ConstructionDependencyRuleLayerKey =
  | 'workflow_sequence_dictionary'
  | 'same_parent_internal_flow'
  | 'cross_item_workflow'
  | 'cross_business_domain_dependency_intent'
  | 'process_constraint'

type ConstructionDependencyRuleLayer = {
  order: number
  key: ConstructionDependencyRuleLayerKey
  name: string
  owns: string[]
  doesNotOwn: string[]
  technicalSources: string[]
  primaryRuntimeOutputs: string[]
  maturityUpgradeFocus: string[]
}

export const CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_LAYERS: ConstructionDependencyRuleLayer[] = [
  {
    order: 1,
    key: 'workflow_sequence_dictionary',
    name: '工序关系识别词典治理层',
    owns: [
      '只负责历史弱结构任务文本中的关系识别、迁移证据和后台审计。',
      '为 standard_internal_flow、cross_item_workflow、dependencyIntentTemplates、process_constraint 提供候选迁移证据。',
    ],
    doesNotOwn: [
      '不负责同一父级下工序或作业步骤的内部顺序。',
      '不负责工期参数、等待天数或运行期硬滞后。',
      '不进入运行期 workflow_sequence、基线生成原因或 task_dependencies。',
    ],
    technicalSources: [
      'server/src/seeds/v1474WorkflowDictionarySeed.ts',
      'algorithm_seed_records.workflow_dictionary',
    ],
    primaryRuntimeOutputs: [
      '后台治理统计',
      '候选迁移证据',
      '仅后端可见的审计 metadata',
    ],
    maturityUpgradeFocus: [
      '持续降低关键词兜底比例，优先使用稳定标准工序编码。',
      '同父级内部流候选必须转入 standard_internal_flow 治理。',
      '所有运行期依赖和工期判断都必须留在 workflow_dictionary 之外。',
    ],
  },
  {
    order: 2,
    key: 'same_parent_internal_flow',
    name: '同父级内部工序流',
    owns: [
      '负责同一父级下 process / activity_step 的本地先后顺序。',
      '负责硬顺序、软顺序、可并行和验收关口类内部流规则。',
    ],
    doesNotOwn: [
      '不负责跨父级、跨分项、跨专项或跨工程对象的依赖。',
      'review_required 候选不得自动形成运行期阻断。',
    ],
    technicalSources: [
      'server/src/seeds/standardInternalFlowSeed.ts',
      'server/src/seeds/chinaGb50300TemplateCatalog.ts',
      'server/src/seeds/domainWbsTemplateCatalogs.ts',
      'standard_task_metadata.internalFlow',
    ],
    primaryRuntimeOutputs: [
      '同父级 sibling_sequence predecessorDependencies',
      'standard_task_metadata.internalFlow',
      '仅 curated hard_sequence / acceptance_gate 生成的同父级 task_dependencies',
    ],
    maturityUpgradeFocus: [
      '高频稳定编码补齐必须经过证据审核后才能升级为语义规则。',
      '补充 evidenceRefs 和条件化规则，但不向普通业务页暴露 seed 名称。',
      '真实执行样本候选在人工整理成 curated seed 前保持 candidate_only。',
      '专项和分区模板纳入同一套内部流治理统计。',
    ],
  },
  {
    order: 3,
    key: 'cross_item_workflow',
    name: '跨分项 / 跨施工包主线依赖',
    owns: [
      '负责同一分部或同一工程对象下，跨分项、跨专项、跨施工包的现场主线移交关系。',
      '负责不属于同父级内部流、但属于实体施工主线的已确认交接，包括专项模板中的实体施工包交接。',
    ],
    doesNotOwn: [
      '不接受只有关键词、没有治理规则的运行期依赖。',
      '不负责质量、里程碑、资料商务、管理、安全、验收等仅用于约束或解释的跨业务域引用。',
      '不负责工期、等待天数、搭接比例或工艺放行条件。',
    ],
    technicalSources: [
      'server/src/seeds/v1475CrossItemWorkflowSeed.ts',
      'algorithm_seed_records.cross_item_workflow',
      'standard_task_metadata.crossItemWorkflow',
    ],
    primaryRuntimeOutputs: [
      'autoApplyPolicy 为 confirmed_template_only 时生成的 cross_item_workflow predecessorDependencies',
      'standard_task_metadata.crossItemWorkflow',
    ],
    maturityUpgradeFocus: [
      '只把有标准编码或企业证据支撑的稳定施工包交接升级为正式规则。',
      'candidate / manual_confirm 规则在治理完成前不得进入运行期依赖。',
    ],
  },
  {
    order: 4,
    key: 'cross_business_domain_dependency_intent',
    name: '跨业务域约束依赖意图',
    owns: [
      '负责质量、里程碑、现场管理、危大控制、资料商务、验收、移交、管理等跨业务域约束引用。',
      '根据 referenced code、Catalog Group 分类和 autoApplyPolicy 推断约束作用范围。',
      '只在范围兼容时生成已确认业务约束 predecessorDependencies。',
    ],
    doesNotOwn: [
      '不负责同父级内部顺序。',
      '不负责实体施工到实体施工的 workflow / prerequisite 主线交接，这类关系归 standard_internal_flow 或 cross_item_workflow。',
      '不得覆盖用户显式 task_dependencies。',
      '不拥有运行期 lag 或工期天数权威。',
    ],
    technicalSources: [
      'server/src/seeds/v1475DependencyIntentTemplates.ts',
      'wbs_template_node.metadata.referenced*Codes',
      'wbs_template_node.metadata.relationRole',
    ],
    primaryRuntimeOutputs: [
      'dependencyIntentTemplates metadata',
      'autoApplyPolicy 为 confirmed_template_only 且 relationshipDomain 为 business_constraint 时生成的 dependency_intent_template predecessorDependencies',
    ],
    maturityUpgradeFocus: [
      '扩充已确认跨业务域约束覆盖，但不得把施工主线候选信号误升为硬依赖。',
      '始终让显式 task_dependencies 优先于生成的依赖意图。',
    ],
  },
  {
    order: 5,
    key: 'process_constraint',
    name: '工艺边约束增强层',
    owns: [
      '在同父级、跨分项 / 跨施工包、跨业务域依赖边已经存在后，补充搭接、门禁、时间来源路由和置信度约束。',
      '描述既有关系边如何排时间：搭接比例、开始条件、作用颗粒度、门禁要求和工期查找键。',
      '关系存在后，处理养护、检测、验收、技术间歇、移交和工艺前置的路由。',
      '输出阻断等级、进度影响、搭接比例、工期来源策略、承载工序提示和工期上下文置信度影响。',
    ],
    doesNotOwn: [
      '不负责识别两道工序是否有关。',
      '不负责创建同父级、跨分项 / 跨施工包或跨业务域依赖。',
      '不负责判断两项任务是否 parallel_allowed。',
      '模板中已有养护、检测、验收、报告或移交工序时，不覆盖该节点自身工期。',
      '不保存任何具体工期、等待、lag、默认、最小或学习天数。',
      '不把所有约束默认转成 task_dependencies。',
    ],
    technicalSources: [
      'server/src/seeds/v1474ProcessConstraintSeed.ts',
      'algorithm_seed_records.process_constraint',
      'durationContextService.factorSummary.process_constraint',
    ],
    primaryRuntimeOutputs: [
      'process_constraint factor',
      '开工条件、搭接、工期来源路由或置信度影响',
      '预测置信度调整和下游工期查找 metadata',
    ],
    maturityUpgradeFocus: [
      '以可搭接放行为主体，同时把门禁和等待事实保留为工期查找路由。',
      '学习来源路由和搭接候选模式，但保持 standard_work_duration 是唯一具体天数权威。',
    ],
  },
]

function getActiveSeedCount(seedType: AlgorithmSeedType) {
  const entry = getAlgorithmSeedEntry(seedType)
  if (!entry) return 0
  return entry.records.filter((record) => record.isActive !== false).length
}

const PROCESS_CONSTRAINT_COVERAGE_ANCHOR_MODES = new Set<DurationContributionMode>([
  'duration_bearing',
  'quality_gate',
  'handover_marker',
])

const L5_SCENARIO_CONSTRAINT_TYPES = new Set<V1474ProcessConstraintRule['constraintType']>([
  'weather_window',
  'work_hour_window',
  'environment_control',
  'municipal_connection_wait',
  'safety_control_release',
  'monitoring_observation_wait',
  'temperature_control_window',
  'operation_permit_release',
  'confined_space_atmosphere_release',
  'temporary_power_isolation_release',
  'road_occupation_permit_release',
  'pollution_alert_release',
  'noise_sensitive_period_release',
])

const L5_REQUIRED_SCENARIO_FAMILIES = [
  'seasonal_weather',
  'work_hour_noise',
  'environmental_control',
  'municipal_interface',
  'dangerous_operation_release',
  'monitoring_observation',
  'mep_testing_commissioning',
] as const

type L5RequiredScenarioFamily = typeof L5_REQUIRED_SCENARIO_FAMILIES[number]

const L5_MEP_TESTING_COMMISSIONING_RULE_CODES = new Set([
  'pipe_installation_to_hidden_quality_check_gate',
  'electrical_wiring_to_insulation_grounding_test_gate',
  'commissioning_parameter_review_to_rectification_gate',
  'rectification_closeout_to_commissioning_handover_gate',
  'commissioning_condition_to_plan_checklist_gate',
  'commissioning_plan_drafting_to_approval_gate',
  'system_linkage_commissioning_to_parameter_review_gate',
  'rectification_condition_to_test_point_review_gate',
  'commissioning_measurement_to_result_record_gate',
  'pipe_prefab_workface_review_to_installation_gate',
  'pipe_equipment_insulation_base_to_construction_gate',
  'pipe_equipment_insulation_construction_to_hidden_test_gate',
  'pipe_equipment_insulation_test_to_rectification_handover_gate',
  'electrical_workface_review_to_wiring_installation_gate',
  'electrical_test_to_self_check_record_gate',
  'pipe_interface_to_pressure_function_gate',
  'pipe_function_test_to_self_check_record_gate',
  'medical_gas_pressure_test_to_panel_close_zone_overlap',
  'sprinkler_pressure_flush_to_ceiling_closure_release_gate',
  'drainage_water_ball_test_to_concealment_closure_release_gate',
  'drainage_water_ball_test_to_ceiling_closure_release_gate',
  'drainage_water_ball_test_to_dec_ceiling_base_finish_release_gate',
  'water_source_discharge_turbidity_retest_to_pressure_recovery_release_gate',
  'non_hvac_pipe_pressure_flush_to_anticorrosion_insulation_release_gate',
  'building_service_pipe_flushing_to_plaster_base_closure_release_gate',
  'building_service_pipe_flushing_to_ceiling_closure_release_gate',
  'building_service_pipe_flushing_to_dec_wall_ceiling_finish_release_gate',
  'building_service_pipe_flushing_to_public_room_finish_release_gate',
  'indoor_water_pressure_test_to_ceiling_wall_finish_release_gate',
  'indoor_water_pressure_test_to_public_room_finish_release_gate',
  'building_water_system_anticorrosion_to_plaster_base_closure_release_gate',
  'building_water_system_anticorrosion_to_clear_masonry_pointing_release_gate',
  'building_water_system_anticorrosion_to_ceiling_closure_release_gate',
  'building_water_system_anticorrosion_to_dec_wall_ceiling_finish_release_gate',
  'building_water_system_anticorrosion_to_public_room_finish_release_gate',
  'building_water_system_insulation_to_plaster_base_closure_release_gate',
  'building_water_system_insulation_to_clear_masonry_pointing_release_gate',
  'building_water_system_insulation_to_ceiling_closure_release_gate',
  'building_water_system_insulation_to_dec_wall_ceiling_finish_release_gate',
  'building_water_system_insulation_to_public_room_finish_release_gate',
  'pipe_anticorrosion_insulation_to_ceiling_closure_release_gate',
  'pipe_anticorrosion_insulation_to_plaster_base_closure_release_gate',
  'pipe_anticorrosion_insulation_to_clear_masonry_pointing_release_gate',
  'pipe_anticorrosion_insulation_to_wall_veneer_finish_release_gate',
  'pipe_anticorrosion_insulation_to_public_room_finish_release_gate',
  'building_service_pipe_equipment_anticorrosion_to_wall_veneer_finish_release_gate',
  'building_service_pipe_equipment_anticorrosion_to_public_room_finish_release_gate',
  'building_service_pipe_equipment_anticorrosion_to_plaster_base_closure_release_gate',
  'building_service_pipe_equipment_anticorrosion_to_ceiling_closure_release_gate',
  'building_service_pipe_equipment_insulation_to_wall_veneer_finish_release_gate',
  'building_service_pipe_equipment_insulation_to_public_room_finish_release_gate',
  'building_service_pipe_equipment_insulation_to_plaster_base_closure_release_gate',
  'building_service_pipe_equipment_insulation_to_ceiling_closure_release_gate',
  'electrical_conduit_installation_to_plaster_base_closure_release_gate',
  'electrical_conduit_installation_to_clear_masonry_pointing_release_gate',
  'electrical_conduit_installation_to_ceiling_closure_release_gate',
  'electrical_conduit_installation_to_wall_veneer_finish_release_gate',
  'electrical_conduit_installation_to_public_room_finish_release_gate',
  'intelligent_cable_laying_to_ceiling_closure_release_gate',
  'intelligent_cable_laying_to_plaster_base_closure_release_gate',
  'intelligent_cable_laying_to_clear_masonry_pointing_release_gate',
  'intelligent_tray_conduit_installation_to_ceiling_closure_release_gate',
  'intelligent_tray_conduit_installation_to_plaster_base_closure_release_gate',
  'intelligent_tray_conduit_installation_to_clear_masonry_pointing_release_gate',
  'intelligent_subsystem_tray_conduit_installation_to_plaster_base_closure_release_gate',
  'intelligent_subsystem_tray_conduit_installation_to_clear_masonry_pointing_release_gate',
  'intelligent_tray_conduit_installation_to_wall_veneer_finish_release_gate',
  'intelligent_cable_laying_to_public_room_finish_release_gate',
  'intelligent_tray_conduit_installation_to_public_room_finish_release_gate',
  'intelligent_equipment_installation_to_ceiling_closure_release_gate',
  'intelligent_equipment_installation_to_wall_veneer_finish_release_gate',
  'intelligent_equipment_installation_to_public_room_finish_release_gate',
  'intelligent_equipment_software_installation_to_ceiling_closure_release_gate',
  'intelligent_equipment_software_installation_to_wall_veneer_finish_release_gate',
  'intelligent_equipment_software_installation_to_public_room_finish_release_gate',
  'hvac_duct_equipment_anticorrosion_to_ceiling_closure_release_gate',
  'hvac_duct_equipment_anticorrosion_to_wall_veneer_finish_release_gate',
  'hvac_duct_installation_to_plaster_base_closure_release_gate',
  'hvac_duct_installation_to_clear_masonry_pointing_release_gate',
  'hvac_equipment_installation_to_plaster_base_closure_release_gate',
  'hvac_equipment_installation_to_clear_masonry_pointing_release_gate',
  'hvac_auxiliary_equipment_installation_to_plaster_base_closure_release_gate',
  'hvac_auxiliary_equipment_installation_to_ceiling_closure_release_gate',
  'hvac_auxiliary_equipment_installation_to_wall_public_room_finish_release_gate',
  'hvac_automatic_control_sensor_installation_to_ceiling_closure_release_gate',
  'hvac_duct_equipment_anticorrosion_to_plaster_base_closure_release_gate',
  'hvac_duct_equipment_anticorrosion_to_clear_masonry_pointing_release_gate',
  'hvac_duct_equipment_insulation_to_plaster_base_closure_release_gate',
  'hvac_duct_equipment_insulation_to_ceiling_closure_release_gate',
  'constant_humidity_hvac_duct_equipment_insulation_to_ceiling_closure_release_gate',
  'cleanroom_hvac_duct_equipment_insulation_to_ceiling_closure_release_gate',
  'hvac_duct_equipment_insulation_to_dec_ceiling_base_release_gate',
  'constant_humidity_hvac_duct_equipment_insulation_to_dec_ceiling_base_release_gate',
  'cleanroom_hvac_duct_equipment_insulation_to_dec_ceiling_base_release_gate',
  'hvac_duct_equipment_insulation_to_dec_wall_veneer_finish_release_gate',
  'hvac_duct_equipment_insulation_to_dec_public_room_finish_release_gate',
  'hvac_air_terminal_fabric_duct_installation_to_ceiling_closure_release_gate',
  'hvac_duct_installation_to_public_room_finish_release_gate',
  'hvac_duct_equipment_anticorrosion_to_public_room_finish_release_gate',
  'smoke_control_duct_equipment_anticorrosion_to_wall_veneer_finish_release_gate',
  'constant_humidity_hvac_duct_equipment_anticorrosion_to_ceiling_closure_release_gate',
  'cleanroom_hvac_duct_equipment_anticorrosion_to_ceiling_closure_release_gate',
  'civil_defense_ventilation_duct_equipment_anticorrosion_to_ceiling_closure_release_gate',
  'hvac_equipment_installation_to_ceiling_closure_release_gate',
  'hvac_equipment_installation_to_wall_veneer_finish_release_gate',
  'hvac_equipment_installation_to_public_room_finish_release_gate',
  'hvac_duct_installation_to_ceiling_closure_release_gate',
  'hvac_duct_installation_to_wall_veneer_finish_release_gate',
  'smoke_control_duct_installation_to_wall_veneer_finish_release_gate',
  'constant_humidity_hvac_duct_installation_to_ceiling_closure_release_gate',
  'cleanroom_hvac_duct_installation_to_ceiling_closure_release_gate',
  'civil_defense_ventilation_duct_installation_to_ceiling_closure_release_gate',
  'vacuum_cleaning_duct_installation_to_ceiling_closure_release_gate',
  'vacuum_cleaning_duct_installation_to_wall_veneer_finish_release_gate',
  'fire_alarm_subsystem_test_to_linkage_commissioning_release_gate',
  'intelligent_network_configuration_stage_gate',
  'hvac_equipment_power_to_single_machine_trial_gate',
  'hvac_single_machine_trial_to_parameter_acceptance_gate',
  'hvac_duct_interface_check_to_rectification_record_gate',
  'building_energy_material_to_installation_test_gate',
  'building_energy_test_to_report_review_gate',
  'building_energy_report_to_rectification_record_gate',
  'cleanroom_final_clean_particle_sampling_release_gate',
  'bms_dcim_point_table_trend_data_release_gate',
  'ground_source_heat_pump_pressure_hold_to_thermal_response_test_release_gate',
  'spd_grounding_conductivity_status_window_release_gate',
  'cleanroom_hvac_air_balance_target_freeze_release_gate',
  'mep_system_commissioning_to_finish_closure_release_gate',
  'mep_system_commissioning_to_ordinary_room_finish_release_gate',
  'mep_system_commissioning_to_clear_masonry_pointing_release_gate',
  'mep_system_commissioning_to_stone_wood_floor_finish_release_gate',
  'mep_system_commissioning_to_garage_floor_finish_release_gate',
  'intelligent_cable_laying_to_wall_veneer_finish_release_gate',
  'intelligent_cable_laying_to_public_room_finish_release_gate',
  'intelligent_tray_conduit_installation_to_public_room_finish_release_gate',
  'electrical_cable_termination_insulation_test_to_ceiling_closure_release_gate',
  'electrical_cable_laying_to_ceiling_closure_release_gate',
  'electrical_conductor_wiring_to_ceiling_closure_release_gate',
  'electrical_conduit_tray_wiring_to_ceiling_closure_release_gate',
  'electrical_busway_installation_to_ceiling_closure_release_gate',
  'electrical_cable_termination_insulation_test_to_wall_veneer_finish_release_gate',
  'electrical_cable_termination_insulation_test_to_public_room_finish_release_gate',
  'electrical_fire_control_power_interface_to_fire_control_room_release_gate',
  'elevator_safety_loop_clearance_trial_run_release_gate',
  'potable_water_disinfection_sampling_release_gate',
  'anticorrosion_coating_dry_film_adhesion_test_release_gate',
  'building_shielding_bonding_resistance_to_grounding_bus_release_gate',
  'mri_magnetic_shielding_field_strength_five_gauss_release_gate',
  'medical_radioactive_wastewater_decay_tank_discharge_waterproof_retest_release_gate',
  'industrial_cleanroom_emission_online_monitoring_compliance_retest_release_gate',
  'industrial_cleanroom_oq_pq_validation_trend_report_release_gate',
])

const buildL3ParentCarrierEdges = (
  predecessorCodes: readonly string[],
  successorCodes: readonly string[],
) => predecessorCodes.flatMap((predecessorCode) => (
  successorCodes.map((successorCode) => `${predecessorCode}->${successorCode}`)
))

const buildCrossItemRuleStableEdges = (
  rule: Pick<V1475CrossItemWorkflowRule, 'predecessorCodePrefixes' | 'successorCodePrefixes'>,
) => buildL3ParentCarrierEdges(rule.predecessorCodePrefixes, rule.successorCodePrefixes)

const STEEL_PARENT_AND_PIPE_STRUCTURE_L3_CARRIER_PREFIXES = [
  '02-03',
  '02-03-06',
] as const

const EXPANDED_CONFIRMED_STRUCTURE_ENVELOPE_L3_CARRIER_PREFIXES = [
  '02-01',
  '02-01-05',
  '02-01-06',
  '02-03-07',
  '02-03-08',
  '02-05',
] as const

const PROFILED_METAL_DECK_TO_METAL_ROOF_PANEL_L3_CARRIER_CODES = [
  '02-03-08',
] as const

const PROFILED_METAL_DECK_TO_METAL_ROOF_PANEL_L3_SUCCESSOR_CODES = [
  '04-04-03',
] as const

const PRESTRESS_MEMBRANE_AND_PROFILED_METAL_FALSE_ELEVATOR_CARRIER_CODES = [
  '02-03-07',
  '02-03-08',
] as const

const STEEL_TUBE_CONCRETE_EXACT_ENVELOPE_L3_CARRIER_CODES = [
  '02-04-02',
  '02-04-04',
] as const

const STEEL_TUBE_CONCRETE_EXACT_ENVELOPE_L3_SUCCESSOR_CODES = [
  '02-02-04',
  '02-02-05',
  '04-01-01',
  '04-02-04',
  '04-03-01',
  'WPI-01-01-02',
  '03-09-01',
  'FAC-01-01-01',
  'FAC-01-01-02',
] as const

const STEEL_TUBE_CONCRETE_BROAD_ENVELOPE_FALSE_SUCCESSOR_CODES = [
  '02-02',
  '02-02-01',
  '02-02-02',
  '02-02-03',
  '04-01',
  '04-01-02',
  '04-01-03',
  '04-01-04',
  '04-02',
  '04-02-01',
  '04-02-02',
  '04-02-03',
  '04-02-05',
  '04-02-06',
  '04-02-07',
  '04-03',
  '04-03-02',
  '04-03-03',
  '04-03-04',
  'WPI-01-01-03',
  '03-09',
  '03-09-02',
  '03-09-03',
  '03-09-04',
  'FAC-01',
  'FAC-01-01',
  'FAC-01-01-03',
  'FAC-01-01-04',
  'ELV-01',
  'ELV-01-01',
  'ELV-01-01-01',
  'ELV-01-01-02',
  'ELV-01-01-03',
  'ELV-01-01-04',
] as const

const EXPANDED_CONFIRMED_VERTICAL_TRANSPORT_L3_CARRIER_PREFIXES = [
  '02-01',
  '02-01-05',
  '02-01-06',
  '02-03-04',
  '02-05',
] as const

const MIC_HOIST_ONLY_FALSE_INTERFACE_CARRIER_PREFIXES = [
  'MIC-04-01-01',
] as const

const STEEL_REINFORCEMENT_INSTALLATION_BROAD_ENVELOPE_FALSE_CARRIER_CODES = [
  '02-05-03',
  '02-05-05',
] as const

const OUTDOOR_DRAINAGE_BROAD_MUNICIPAL_FALSE_CARRIER_CODES = [
  '05-07',
  '05-07-01',
  '05-07-02',
] as const

const OUTDOOR_DRAINAGE_BROAD_MUNICIPAL_FALSE_SUCCESSOR_CODES = [
  '03-02',
  '03-02-01',
  '03-02-02',
  '03-02-03',
  '03-02-04',
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
  'TOD-03-01-01',
  '05-08',
  '05-08-01',
  '05-08-02',
  '05-08-03',
  '05-08-04',
  '05-08-05',
  '09-05',
  '09-05-01',
  '09-05-02',
  '09-05-03',
] as const

const OUTDOOR_WATER_SUPPLY_FALSE_INTERIOR_FINISH_CARRIER_CODES = [
  '05-06',
  '05-06-02',
] as const

const OUTDOOR_WATER_SUPPLY_TO_DRAINAGE_L3_CARRIER_CODES = [
  '05-06',
] as const

const OUTDOOR_WATER_SUPPLY_TO_DRAINAGE_L3_SUCCESSOR_CODES = [
  '05-07',
] as const

const OUTDOOR_WATER_SUPPLY_CHILD_DRAINAGE_FALSE_CARRIER_EDGES = [
  '05-06->05-07-01',
  '05-06->05-07-02',
  '05-06-02->05-07',
  '05-06-02->05-07-01',
  '05-06-02->05-07-02',
] as const

const OUTDOOR_HYDRONIC_WATER_FEATURE_BROAD_FALSE_CARRIER_CODES = [
  '05-08',
  '05-08-01',
  '05-08-02',
  '05-08-03',
  '05-08-05',
  '05-11',
  '05-11-01',
  '05-12',
  '05-12-01',
] as const

const OUTDOOR_HYDRONIC_WATER_FEATURE_BROAD_FALSE_SUCCESSOR_CODES = [
  '03-02',
  '03-02-01',
  '03-02-02',
  '03-02-03',
  '03-02-04',
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
  'OUT-01-01-01',
  'OUT-04-01-01',
  'TOD-03-01-01',
  '09-02-01',
] as const

const STRUCTURE_FALSE_PARENT_CARRIER_PREFIXES = [
  '02-01-04',
  '02-04-01',
  '02-04-03',
  '02-04-05',
  '02-05-01',
  '02-05-04',
] as const

const BROAD_STEEL_TUBE_STRUCTURE_PARENT_CARRIER_CODES = [
  '02-04',
] as const

const PLUMBING_TERMINAL_FALSE_FINISH_CARRIER_PREFIXES = [
  'PLU-01-02',
  'PLU-01-02-01',
] as const

const PLUMBING_TERMINAL_FALSE_COMMISSIONING_CARRIER_CODES = [
  'PLU-01-02',
  'PLU-01-02-01',
] as const

const PLUMBING_TERMINAL_FALSE_FINISH_SUCCESSOR_CODES = [
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
] as const

const DRAINAGE_FLOOR_HANDOFF_L3_CARRIER_CODES = [
  '05-02-01',
  '05-02-02',
] as const

const DRAINAGE_FLOOR_HANDOFF_L3_SUCCESSOR_CODES = [
  '03-01',
  '03-01-01',
  '03-01-02',
  '03-01-03',
  '03-01-04',
] as const

const DRAINAGE_PARENT_AND_TEST_FALSE_FLOOR_CARRIER_CODES = [
  '05-02',
  '05-02-04',
] as const

const SANITARY_FIXTURE_FALSE_FINISH_CARRIER_CODES = [
  '05-04',
  '05-04-01',
  '05-04-02',
  '05-04-03',
] as const

const PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES = [
  '03-02',
  '03-02-01',
  '03-02-02',
  '03-02-03',
  '03-02-04',
] as const

const TOD_COMMERCIAL_TIE_IN_FALSE_INTERIOR_FLOOR_SUCCESSOR_CODES = [
  '03-01',
  '03-01-01',
  '03-01-02',
  '03-01-03',
  '03-01-04',
] as const

const TOD_COMMERCIAL_TIE_IN_FALSE_TOD_SUCCESSOR_CODES = [
  'TOD-03-01-02',
] as const

const DRAINAGE_WATER_BALL_TEST_FALSE_COMMISSIONING_CARRIER_CODES = [
  'PLU-01-01-02',
] as const

const PLUMBING_RAINWATER_REUSE_PARENT_FALSE_COMMISSIONING_CARRIER_CODES = [
  'PLU-04-01',
] as const

const PLUMBING_SPONGE_CITY_PARENT_FALSE_COMMISSIONING_CARRIER_CODES = [
  'PLU-04',
] as const

const PLUMBING_EQUIPMENT_FALSE_PLASTER_CARRIER_CODES = [
  'PLU-01-01-04',
] as const

const PLUMBING_EQUIPMENT_FALSE_COMMISSIONING_CARRIER_CODES = [
  'PLU-01-01-04',
] as const

const SMOKE_CONTROL_TERMINAL_FALSE_FINISH_CARRIER_CODES = [
  '06-03-06',
] as const

const SMART_BUILDING_INTEGRATION_FALSE_FINISH_CARRIER_PREFIXES = [
  '07-04-02',
] as const

const SINGLE_ELECTRICAL_GROUNDING_FALSE_ENERGY_CARRIER_CODES = [
  '07-01-03',
] as const

const SMART_BUILDING_INTEGRATION_PARENT_FALSE_CARRIER_CODES = [
  '07-04',
] as const

const ELECTRICAL_LIGHTING_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '07-05',
] as const

const POWER_TRUNK_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '07-03',
] as const

const CORE_MEP_DISCIPLINE_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '05',
  '07',
] as const

const WATER_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '05-01',
  '05-03',
  '05-05',
] as const

const OUTDOOR_ELECTRICAL_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '07-01',
] as const

const OUTDOOR_ELECTRICAL_PARENT_FALSE_ENERGY_CARRIER_CODES = [
  '07-01',
] as const

const OUTDOOR_ELECTRICAL_ENERGY_FALSE_SUCCESSOR_CODES = [
  '09-03',
  '09-03-01',
  '09-03-02',
] as const

const OUTDOOR_SPECIAL_LIGHTING_TO_POWER_ENERGY_L3_CARRIER_CODES = [
  '07-01-09',
] as const

const OUTDOOR_POWER_ENERGY_L3_SUCCESSOR_CODES = [
  '09-03',
  '09-03-01',
  '09-03-02',
] as const

const INTELLIGENT_SECURITY_PARENT_FALSE_ACCEPTANCE_CARRIER_EDGES = [
  'INT-02-01-03->FIR-05-01-02',
  'INT-02-01-03->INT-04-01-01',
  'INT-02-01-01->FIR-05-01-02',
  'INT-02-01-01->08-01-03',
] as const

const INTELLIGENT_CHILD_FALSE_INTEGRATION_CARRIER_EDGES = [
  'INT-02-01-04->INT-04-01-01',
] as const

const SMART_BUILDING_INTEGRATION_FALSE_FIRE_CONTROL_SUCCESSOR_CODES = [
  'FIR-03-01-02',
] as const

const SMART_SUBSYSTEM_ACCEPTANCE_L3_CARRIER_CODES = [
  '08-01-01',
  '08-01-02',
] as const

const SMART_SUBSYSTEM_INTEGRATED_COMMISSIONING_L3_SUCCESSOR_CODES = [
  '08-01-03',
] as const

const SMART_SUBSYSTEM_BROAD_INTEGRATION_FALSE_SUCCESSOR_CODES = [
  'INT-02-01-02',
  'INT-04-01-01',
] as const

const HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_CARRIER_PREFIXES = [
  '05-13-01',
  '05-13-02',
  '05-13-03',
  '05-13-04',
] as const

const HVAC_PLATE_HEAT_EXCHANGER_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-10-05',
] as const

const HVAC_HEATING_EQUIPMENT_FALSE_FINISH_CARRIER_PREFIXES = [
  '05-05-03',
  '05-05-04',
  '05-05-05',
  '05-05-06',
  '05-05-07',
  '05-05-08',
  '06-06',
  '06-06-07',
  '06-10-07',
  '06-19-06',
] as const

const HVAC_PARENT_AND_HANGER_FALSE_COMMISSIONING_CARRIER_CODES = [
  'HVA-03',
  'HVA-03-01-01',
] as const

const HVAC_ABSORPTION_GAS_FUEL_EQUIPMENT_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-17-06',
] as const

const HVAC_ABSORPTION_VACUUM_TEST_FALSE_PLASTER_CARRIER_CODES = [
  '06-17-03',
] as const

const HVAC_ABSORPTION_LITHIUM_BROMIDE_FILL_FALSE_FINISH_CARRIER_CODES = [
  '06-17-04',
] as const

const HVAC_ABSORPTION_CHILD_FALSE_FINISH_CARRIER_CODES = [
  '06-17-05',
] as const

const HVAC_FIRE_PIPE_FLUSHING_FALSE_PLASTER_CARRIER_CODES = [
  '06-16-03',
] as const

const HVAC_CLEANROOM_EQUIPMENT_TEST_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-06-08',
  '06-07-06',
  '06-07-09',
] as const

const BROAD_MEP_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '06-05',
  '06-02',
  '06-07',
  '06-14',
  '06-19-05',
  '07-05-10',
  '06-11',
  '06-10',
  '06-12',
] as const

const DUST_COLLECTION_SYSTEM_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-04',
  '06-04-07',
  '06-04-06',
  '06-04-08',
  '06-09-06',
  '06-09-07',
] as const

const HVAC_COOLING_WATER_TEST_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-12-05',
] as const

const HVAC_AIR_TERMINAL_PLASTER_FALSE_CARRIER_CODES = [
  '06-01-06',
] as const

const WATER_TREATMENT_EQUIPMENT_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-14-06',
] as const

const SURFACE_WATER_HEAT_EXCHANGER_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-14-05',
] as const

const GROUND_SOURCE_HEAT_EXCHANGER_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-13-05',
] as const

const KITCHEN_TOILET_EXHAUST_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-02-06',
  '06-02-07',
] as const

const CIVIL_DEFENSE_VENTILATION_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '06-08',
  '06-08-06',
] as const

const SENSOR_INSTALLATION_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-14-03',
] as const

const BUILDING_AUTOMATION_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '06-20',
  '08-14',
  '08-14-05',
] as const

const BUILDING_AUTOMATION_CHILD_FALSE_FINISH_CARRIER_CODES = [
  '06-20-02',
  '06-20-04',
  '08-14-04',
  '08-14-06',
] as const

const VACUUM_CLEANING_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '06-09',
] as const

const INTELLIGENT_ROOT_FALSE_FINISH_CARRIER_CODES = [
  '08',
] as const

const INTELLIGENT_INTEGRATION_PARENT_FALSE_PLASTER_CARRIER_CODES = [
  '08-01',
] as const

const INTELLIGENT_SYSTEM_ROOT_FALSE_FINISH_ACCEPTANCE_CARRIER_CODES = [
  'INT-01',
] as const

const INTELLIGENT_SYSTEM_ROOT_FALSE_FINISH_ACCEPTANCE_SUCCESSOR_CODES = [
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
  'FIR-05-01-02',
  'INT-04-01-01',
] as const

const INTELLIGENT_CABLING_CHILD_FALSE_FINISH_CARRIER_CODES = [
  'INT-01-01-01',
] as const

const INTELLIGENT_CABLING_CHILD_FALSE_FINISH_SUCCESSOR_CODES = [
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
] as const

const INTELLIGENT_CABLING_CHILD_FALSE_ACCEPTANCE_CARRIER_EDGES = [
  'INT-01-01-01->FIR-05-01-02',
  'INT-01-01-01->INT-04-01-01',
] as const

const INTELLIGENT_EQUIPMENT_ROOM_AND_INSTRUMENT_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-04-01',
  '08-04-03',
  '08-18-06',
  '05-14',
  '05-14-01',
] as const

const INTELLIGENT_INFORMATION_OUTLET_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-05-04',
] as const

const INTELLIGENT_ACCESS_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-02',
] as const

const SECURITY_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-16',
] as const

const FIRE_ALARM_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-15',
  '08-15-04',
  '08-15-05',
] as const

const HEAT_SOURCE_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '05-13',
  '06-17',
] as const

const ENERGY_STORAGE_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '06-15',
  '06-15-05',
] as const

const SOLAR_THERMAL_STORAGE_TANK_PIPE_FALSE_FINISH_CARRIER_CODES = [
  '06-19-03',
] as const

const FIRE_WATER_LIFE_SAFETY_L3_CARRIER_CODES = [
  'FIR-01',
  'FIR-01-01',
  'FIR-01-01-01',
  'FIR-01-01-02',
] as const

const FIRE_WATER_LIFE_SAFETY_L3_SUCCESSOR_CODES = [
  'FIR-03-02-01',
  'INT-04-01-01',
  'CLN-02-01-02',
  'HTL-05-01-02',
] as const

const FIRE_PUMP_ROOM_LIFE_SAFETY_L3_CARRIER_CODES = [
  'FIR-07',
  'FIR-07-01',
  'FIR-07-01-01',
] as const

const FIRE_PUMP_ROOM_LIFE_SAFETY_L3_SUCCESSOR_CODES = [
  'FIR-03-02-01',
  'FIR-05-01-02',
  'INT-04-01-01',
  'CLN-02-01-02',
  'HTL-05-01-02',
] as const

const FIRE_DETECTION_ACCEPTANCE_L3_CARRIER_CODES = [
  'FIR-05-01-01',
] as const

const FIRE_DETECTION_ACCEPTANCE_L3_SUCCESSOR_CODES = [
  'FIR-03-02-01',
  'FIR-05-01-02',
  'INT-04-01-01',
] as const

const FIRE_CONTROL_ROOM_LIFE_SAFETY_L3_CARRIER_CODES = [
  'FIR-03-01',
  'FIR-03-01-01',
  'FIR-03-01-02',
] as const

const FIRE_CONTROL_ROOM_LIFE_SAFETY_L3_SUCCESSOR_CODES = [
  'FIR-03-02-01',
  'INT-04-01-01',
  'CLN-02-01-02',
  'HTL-05-01-02',
] as const

const FIRE_HYDRANT_TO_FIRE_WATER_COMMISSIONING_L3_CARRIER_CODES = [
  '05-01-03',
] as const

const FIRE_HYDRANT_TO_FIRE_WATER_COMMISSIONING_L3_SUCCESSOR_CODES = [
  'FIR-01-01-02',
] as const

const FIRE_SPRINKLER_TO_FIRE_WATER_COMMISSIONING_L3_CARRIER_CODES = [
  '05-01-04',
] as const

const FIRE_SPRINKLER_TO_FIRE_WATER_COMMISSIONING_L3_SUCCESSOR_CODES = [
  'FIR-01-01-01',
] as const

const GAS_SUPPRESSION_LIFE_SAFETY_L3_CARRIER_CODES = [
  'FIR-04-02',
  'FIR-04-02-01',
] as const

const GAS_SUPPRESSION_LIFE_SAFETY_L3_SUCCESSOR_CODES = [
  'FIR-03-02-01',
  'FIR-05-01-02',
  'INT-04-01-01',
  'CLN-02-01-02',
  'HTL-05-01-02',
  'BDT-04-01-01',
  'ELE-03-02-01',
] as const

const HOTEL_LEISURE_SMART_FIRE_L3_CARRIER_CODES = [
  'HTL-04',
  'HTL-04-01',
  'HTL-04-01-01',
  'HTL-04-01-02',
] as const

const HOTEL_LEISURE_SMART_FIRE_L3_SUCCESSOR_CODES = [
  'FIR-03-02-01',
  'FIR-05-01-01',
  'FIR-05-01-02',
] as const

const HOTEL_GUEST_CONTROL_TO_SMART_INTEGRATION_L3_CARRIER_CODES = [
  'HTL-04-01-02',
] as const

const HOTEL_GUEST_CONTROL_TO_SMART_INTEGRATION_L3_SUCCESSOR_CODES = [
  'INT-02-01-02',
] as const

const HOTEL_KITCHEN_TO_EXHAUST_GAS_LINKAGE_L3_CARRIER_CODES = [
  'HTL-03-01-01',
] as const

const HOTEL_KITCHEN_TO_EXHAUST_GAS_LINKAGE_L3_SUCCESSOR_CODES = [
  'HVA-04-01-01',
] as const

const PUBLIC_BROADCAST_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-09',
] as const

const CONFERENCE_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-10',
] as const

const SATELLITE_COMMUNICATION_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-07',
] as const

const CABLE_TV_AND_SATELLITE_RECEPTION_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-08',
] as const

const COMMUNICATION_AND_EMERGENCY_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-03',
  '08-06',
  '08-17',
] as const

const TELEPHONE_EXCHANGE_PARENT_FALSE_INTEGRATION_SUCCESSOR_CODES = [
  'INT-02-01-02',
  'INT-04-01-01',
] as const

const EMERGENCY_POWER_PARENT_FALSE_COMMISSIONING_CARRIER_CODES = [
  'ELE-04',
] as const

const CLEANROOM_SPECIAL_ROOM_TO_DATAHALL_FALSE_CARRIER_EDGES = [
  'CLN-01-01-02->DTC-02-02-01',
] as const

const INTELLIGENT_NETWORK_ROOM_FALSE_FINISH_CARRIER_PREFIXES = [
  'INT-01-01-02',
] as const

const INTELLIGENT_NETWORK_ROOM_FALSE_FINISH_SUCCESSOR_CODES = [
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
] as const

const INTELLIGENT_CORE_NETWORK_FALSE_FINISH_CARRIER_PREFIXES = [
  'INT-01-01-03',
] as const

const INTELLIGENT_CORE_NETWORK_FALSE_ACCEPTANCE_CARRIER_EDGES = [
  'INT-01-01-03->FIR-05-01-02',
  'INT-01-01-03->INT-04-01-01',
] as const

const INTELLIGENT_INFORMATION_NETWORK_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-04',
] as const

const INTELLIGENT_INFORMATION_NETWORK_PARENT_FALSE_INTEGRATION_SUCCESSOR_CODES = [
  'INT-02-01-02',
  'INT-04-01-01',
] as const

const INTELLIGENT_GUIDANCE_EQUIPMENT_ROOM_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-11-04',
] as const

const INTELLIGENT_GUIDANCE_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-11',
] as const

const INTELLIGENT_DISPLAY_DEVICE_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-11-03',
] as const

const INTELLIGENT_APPLICATION_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-13',
] as const

const INTELLIGENT_CABINET_PATCH_PANEL_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-05-03',
  '08-05-05',
] as const

const INTELLIGENT_EQUIPOTENTIAL_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-19-03',
] as const

const ELECTRICAL_EQUIPOTENTIAL_FALSE_FINISH_CARRIER_CODES = [
  '07-07-03',
] as const

const ELECTRICAL_SURGE_PROTECTION_FALSE_FINISH_CARRIER_CODES = [
  '07-07-04',
] as const

const INTELLIGENT_SURGE_PROTECTION_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-19-05',
] as const

const INTELLIGENT_ELECTROMAGNETIC_SHIELD_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-18-09',
] as const

const BUILDING_SHIELDING_CONFIRMED_FINISH_CARRIER_CODES = [
  '08-19-04',
] as const

const DATA_CENTER_PLUMBING_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-18',
  '08-18-04',
] as const

const DATA_CENTER_PRECISION_AIR_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-18-03',
] as const

const DATA_CENTER_FIRE_PROTECTION_FALSE_FINISH_CARRIER_PREFIXES = [
  '08-18-07',
] as const

const DATA_CENTER_ROOM_DECORATION_FALSE_GENERAL_FINISH_CARRIER_CODES = [
  '08-18-08',
] as const

const INTELLIGENT_TIME_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '08-12',
] as const

const HVAC_MULTI_SPLIT_SYSTEM_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-18',
  '06-18-01',
  '06-18-02',
  '06-18-03',
  '06-18-05',
] as const

const HVAC_SOLAR_COLLECTOR_FALSE_FINISH_CARRIER_PREFIXES = [
  '06-19-02',
] as const

const EXACT_MEP_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '06',
  '06-13',
  '06-16',
  '06-19',
  '06-19-01',
  '08-15-03',
] as const

const HVAC_ABSORPTION_CHILLER_COMMISSIONING_FALSE_FINISH_CARRIER_CODES = [
  '06-17-08',
] as const

const INTELLIGENT_EQUIPOTENTIAL_FALSE_FINISH_SUCCESSOR_CODES = [
  '03-02',
  '03-02-01',
  '03-02-02',
  '03-02-03',
  '03-02-04',
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
] as const

const HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES = [
  '03-02',
  '03-02-01',
  '03-02-02',
  '03-02-03',
  '03-02-04',
  '03-05',
  '03-05-01',
  '03-05-02',
  '03-05-03',
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
  'DEC-05-01',
  'DEC-05-01-01',
  'DEC-05-01-02',
] as const

const SMART_BUILDING_INTEGRATION_PARENT_FALSE_SUCCESSOR_CODES = [
  ...HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  'INT-02-01-02',
  'INT-04-01-01',
  ...SMART_BUILDING_INTEGRATION_FALSE_FIRE_CONTROL_SUCCESSOR_CODES,
] as const

const STRUCTURE_ENVELOPE_L3_HANDOFF_SUCCESSOR_CODES = [
  '02-02',
  '02-02-01',
  '02-02-02',
  '02-02-03',
  '02-02-04',
  '02-02-05',
  '04-01',
  '04-01-01',
  '04-01-02',
  '04-01-03',
  '04-01-04',
  '04-02',
  '04-02-01',
  '04-02-02',
  '04-02-03',
  '04-02-04',
  '04-02-05',
  '04-02-06',
  '04-02-07',
  '04-03',
  '04-03-01',
  '04-03-02',
  '04-03-03',
  '04-03-04',
  'WPI-01-01-02',
  'WPI-01-01-03',
  '03-09',
  '03-09-01',
  '03-09-02',
  '03-09-03',
  '03-09-04',
  'FAC-01',
  'FAC-01-01',
  'FAC-01-01-01',
  'FAC-01-01-02',
  'FAC-01-01-03',
  'FAC-01-01-04',
] as const

const ROOF_MEMBRANE_WATERPROOF_L3_CARRIER_CODES = [
  '04-03-01',
  '04-03-02',
] as const

const ROOF_TILE_PANEL_L3_SUCCESSOR_CODES = [
  '04-04',
  '04-04-01',
  '04-04-02',
  '04-04-03',
  '04-04-04',
] as const

const ROOF_WATERPROOF_FUNCTION_LAYER_L3_CARRIER_CODES = [
  'WPI-01-01-02',
] as const

const ROOF_WATERPROOF_FUNCTION_LAYER_L3_SUCCESSOR_CODES = [
  'WPI-01-01-03',
] as const

const STRUCTURE_DOOR_WINDOW_L3_HANDOFF_SUCCESSOR_CODES = [
  '03-04',
  '03-04-01',
  '03-04-02',
  '03-04-03',
  '03-04-04',
  '03-04-05',
  'FAC-03-01-01',
] as const

const STRUCTURE_DOOR_WINDOW_L3_CARRIER_CODES = [
  '02-01',
  '02-01-03',
  '02-01-05',
] as const

const STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES = [
  'ELV-01',
  'ELV-01-01',
  'ELV-01-01-01',
  'ELV-01-01-02',
  'ELV-01-01-03',
  'ELV-01-01-04',
] as const

const ROOF_BASE_LAYER_FALSE_ELEVATOR_CARRIER_CODES = [
  '04-01-01',
] as const

const STANDARD_ELEVATOR_CIVIL_HANDOVER_L3_SUCCESSOR_CODES = [
  '10-01-02',
  '10-02-02',
] as const

const ELEVATOR_SHAFT_SAFETY_COMPONENT_L3_CARRIER_CODES = [
  'ELV-01-01-03',
] as const

const ELEVATOR_INSTALLATION_TO_COMMISSIONING_L3_CARRIER_CODES = [
  'ELV-01-01',
  'ELV-01-01-01',
] as const

const ELEVATOR_STRAIGHT_COMMISSIONING_L3_SUCCESSOR_CODES = [
  'ELV-02',
  'ELV-02-01',
  'ELV-02-01-01',
  'ELV-02-01-02',
  'ELV-02-01-03',
  'ELV-02-01-04',
  'ELV-02-01-06',
] as const

const MEP_PARENT_TO_DEC_WALL_CEILING_L3_CARRIER_PREFIXES = [
  '06-01',
  '08-01',
] as const

const DEC_WALL_CEILING_PACKAGE_L3_SUCCESSOR_CODES = [
  'DEC-02-01',
  'DEC-02-01-01',
  'DEC-02-01-02',
  'DEC-02-01-03',
] as const

const MASONRY_PLASTER_AND_DOOR_WINDOW_L3_CARRIER_CODES = [
  '02-02',
  '02-02-01',
  '02-02-02',
  '02-02-03',
  '02-02-04',
  '02-02-05',
] as const

const MASONRY_PLASTER_L3_SUCCESSOR_CODES = [
  '03-02',
  '03-02-01',
  '03-02-02',
  '03-02-03',
  '03-02-04',
  ...DEC_WALL_CEILING_PACKAGE_L3_SUCCESSOR_CODES,
] as const

const MEP_TO_DEC_WALL_CEILING_CONFIRMED_CHILD_CARRIER_CODES = [
  'PLU-03-01-01',
] as const

const HVAC_INTEGRATED_HANGER_TO_DEC_WALL_CEILING_L3_CARRIER_CODES = [
  'HVA-03-01-01',
] as const

const WATER_SYSTEM_PARENT_TO_FINISH_L3_CARRIER_CODES = [
  '05-09',
  '05-10',
  '05-10-01',
] as const

const RAINWATER_REUSE_PARENT_FALSE_FINISH_CARRIER_CODES = [
  '05-10-02',
] as const

const MIC_SITE_CONNECTION_L3_CARRIER_PREFIXES = [
  'MIC-04',
  'MIC-04-01',
  'MIC-04-01-02',
] as const

const MIC_FACTORY_INTEGRATION_RECOMMENDED_ADVICE_CARRIER_CODES = [
  'MIC-02-01-01',
  'MIC-02-01-03',
  'MIC-06-01-01',
  'MIC-06-01-02',
  'MIC-06-01-03',
  'MIC-06-01-04',
  'MIC-06-01-05',
  'MIC-06-01-06',
  'MIC-06-01-07',
  'MIC-06-01-08',
] as const

const MIC_FACTORY_INTEGRATION_RECOMMENDED_ADVICE_SUCCESSOR_CODES = [
  'MIC-03',
  'MIC-03-01',
  'MIC-03-01-01',
  'MIC-03-01-02',
] as const

const MIC_RECEIVING_HOIST_L3_CARRIER_CODES = [
  'MIC-03',
  'MIC-03-01-02',
] as const

const MIC_RECEIVING_HOIST_L3_SUCCESSOR_CODES = [
  'MIC-04',
  'MIC-04-01',
  'MIC-04-01-01',
  'MIC-04-01-02',
] as const

const MIC_INTERFACE_CLOSEOUT_L3_SUCCESSOR_CODES = [
  'MIC-05',
  'MIC-05-01',
  'MIC-05-01-01',
  'MIC-05-01-02',
] as const

const PREFAB_JOINT_CLOSEOUT_L3_CARRIER_CODES = [
  'PFB-02',
  'PFB-02-01',
  'PFB-02-01-01',
  'PFB-02-01-02',
  'PFB-02-01-03',
  'PFB-02-01-04',
  'PFB-02-01-05',
] as const

const PREFAB_JOINT_ACCEPTANCE_L3_SUCCESSOR_CODES = [
  'PFB-03',
  'PFB-03-01',
  'PFB-03-01-01',
  'PFB-03-01-02',
  'PFB-03-01-03',
] as const

const PREFAB_GROUTING_NEXT_FLOOR_L3_CARRIER_CODES = [
  'PFB-02-01-01',
  'PFB-02-01-02',
  'PFB-04-01-11',
  'PFB-04-01-12',
] as const

const PREFAB_GROUTING_NEXT_FLOOR_L3_SUCCESSOR_CODES = [
  'PFB-01-01-03',
  'PFB-04-01-05',
  'PFB-04-01-06',
  'PFB-04-01-07',
  'PFB-04-01-08',
  'PFB-04-01-09',
] as const

const PREFAB_FOLLOWUP_BATCH_HANDOVER_L3_SUCCESSOR_CODES = [
  'PFB-01-01-04',
  'PFB-01-01-05',
  'PFB-01-01-06',
  'PFB-01-01-08',
  'PFB-01-01-09',
] as const

const PREFAB_SITE_HOIST_TO_JOINT_CONNECTION_L3_CARRIER_CODES = [
  'PFB-01',
  'PFB-01-01-03',
] as const

const PREFAB_FIRST_BATCH_ACCEPTANCE_TO_SITE_HOIST_L3_CARRIER_CODES = [
  'PFB-01-01-01',
] as const

const PREFAB_FIRST_BATCH_ACCEPTANCE_TO_SITE_HOIST_L3_SUCCESSOR_CODES = [
  'PFB-01-01-03',
  'PFB-01-01-04',
  'PFB-04-01-05',
  'PFB-04-01-06',
  'PFB-04-01-07',
  'PFB-04-01-08',
  'PFB-04-01-09',
] as const

const PREFAB_EXPANSION_FACTORY_DOCUMENTS_TO_SITE_HOIST_L3_CARRIER_CODES = [
  'PFB-04-01-04',
] as const

const PREFAB_EXPANSION_SITE_HOIST_L3_SUCCESSOR_CODES = [
  'PFB-04-01-05',
  'PFB-04-01-06',
  'PFB-04-01-07',
  'PFB-04-01-08',
  'PFB-04-01-09',
] as const

const PREFAB_TRANSPORT_RECEIVING_TO_FOLLOWUP_BATCH_INSPECTION_L3_CARRIER_CODES = [
  'PFB-00-01-03',
] as const

const PREFAB_TRANSPORT_RECEIVING_TO_FOLLOWUP_BATCH_INSPECTION_L3_SUCCESSOR_CODES = [
  'PFB-01-01-02',
  'PFB-01-01-03',
  'PFB-01-01-04',
  'PFB-04-01-05',
  'PFB-04-01-06',
  'PFB-04-01-07',
  'PFB-04-01-08',
  'PFB-04-01-09',
] as const

const PREFAB_JOINT_QUALITY_ASSESSMENT_L3_CARRIER_CODES = [
  'PFB-04-01-11',
  'PFB-04-01-12',
] as const

const PREFAB_JOINT_QUALITY_ASSESSMENT_L3_SUCCESSOR_CODES = [
  'PFB-03-01-02',
  'PFB-04-01-13',
] as const

const PREFAB_ENTITY_INSPECTION_TO_ASSEMBLY_ASSESSMENT_L3_CARRIER_CODES = [
  'PFB-03-01-01',
] as const

const PREFAB_STRUCTURE_TO_MASONRY_L3_CARRIER_CODES = [
  'PFB-02-01',
  'PFB-02-01-01',
  'PFB-02-01-02',
] as const

const PREFAB_JOINT_WATERPROOF_FALSE_MASONRY_CARRIER_CODES = [
  'PFB-02-01-04',
] as const

const PREFAB_PCF_WATER_TEST_TO_INTERIOR_L3_CARRIER_CODES = [
  'PFB-04-01-10',
] as const

const PREFAB_PCF_WATER_TEST_TO_INTERIOR_L3_SUCCESSOR_CODES = [
  'PFB-02-01-05',
] as const

const PREFAB_STRUCTURE_FALSE_DOOR_WINDOW_CARRIER_CODES = [
  '02-01-06',
] as const

const FOUNDATION_PIT_TO_FOUNDATION_L3_CARRIER_CODES = [
  '01-03',
  '01-03-01',
  '01-03-03',
  '01-03-04',
  '01-03-05',
  '01-03-07',
  '01-03-08',
  '01-04',
  '01-04-01',
  '01-04-02',
  '01-05-01',
  'FND-02-01-02',
] as const

const FOUNDATION_PIT_TO_FOUNDATION_L3_SUCCESSOR_CODES = [
  '01-02',
  '01-02-01',
  '01-02-02',
  '01-02-03',
  '01-02-04',
  '01-02-05',
  '01-02-06',
  '01-02-07',
  '01-02-08',
  '01-02-09',
  '01-02-10',
  '01-02-11',
  '01-02-12',
  '01-02-13',
  '01-02-14',
  '01-02-15',
  'FND-01',
  'FND-01-01',
  'FND-01-01-01',
  'FND-01-01-02',
  'FND-01-01-03',
  'FND-01-01-04',
] as const

const STATIC_PRESSURE_PILE_TO_CAP_L3_CARRIER_CODES = [
  '01-02-13',
] as const

const STATIC_PRESSURE_PILE_TO_CAP_L3_SUCCESSOR_CODES = [
  '01-02-03',
  'BDT-01-01-01',
] as const

const PILE_DETECTION_TO_CAP_RAFT_L3_CARRIER_CODES = [
  '01-02-10',
  'FND-01-01-01',
] as const

const PILE_FOUNDATION_TO_UNDERGROUND_WATERPROOF_L3_CARRIER_CODES = [
  '01-02-10',
] as const

const FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_CARRIER_CODES = [
  '01-03-08',
] as const

const COMBINED_FOUNDATION_SUPPORT_L3_CARRIER_CODES = [
  '01-03-10',
] as const

const FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES = [
  '01-05-01',
  'FND-02-01-02',
] as const

const DEEP_FOUNDATION_SUPPORT_TO_EXCAVATION_L3_CARRIER_CODES = [
  'FND-04-01-01',
  'FND-04-01-02',
] as const

const DEEP_FOUNDATION_SUPPORT_TO_EXCAVATION_L3_SUCCESSOR_CODES = [
  'FND-04-01-05',
] as const

const FOUNDATION_SECANT_PILE_TO_EARTHWORK_L3_CARRIER_CODES = [
  '01-03-03',
] as const

const FOUNDATION_GRAVITY_RETAINING_WALL_TO_EARTHWORK_L3_CARRIER_CODES = [
  '01-03-07',
] as const

const FOUNDATION_ANCHOR_SUPPORT_TO_EARTHWORK_L3_CARRIER_CODES = [
  '01-03-09',
] as const

const MUNICIPAL_FORMAL_TIE_IN_TO_TOD_INTERFACE_L3_CARRIER_CODES = [
  'OUT-05-01-01',
] as const

const MUNICIPAL_FORMAL_TIE_IN_TO_TOD_INTERFACE_L3_SUCCESSOR_CODES = [
  'TOD-03-01-01',
] as const

const OUTDOOR_PIPE_PARENT_TO_TOD_INTERFACE_FALSE_CARRIER_EDGES = [
  'OUT-02-01-01->TOD-03-01-01',
] as const

const FOUNDATION_ANCHOR_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES = [
  '01-05-01',
  'FND-02-01-02',
] as const

const FOUNDATION_ANCHOR_SUPPORT_TO_FOUNDATION_L3_CARRIER_CODES = [
  '01-03-09',
] as const

const FOUNDATION_ANCHOR_SUPPORT_TO_FOUNDATION_L3_SUCCESSOR_CODES = [
  '01-02',
  '01-02-01',
  '01-02-02',
  '01-02-03',
  '01-02-04',
  '01-02-05',
  '01-02-06',
  '01-02-07',
  '01-02-08',
  '01-02-09',
  '01-02-10',
  '01-02-11',
  '01-02-12',
  '01-02-13',
  '01-02-14',
  '01-02-15',
  'FND-01',
  'FND-01-01',
  'FND-01-01-01',
  'FND-01-01-02',
  'FND-01-01-03',
  'FND-01-01-04',
] as const

const FOUNDATION_TO_WATERPROOF_L3_CARRIER_CODES = [
  '01-02',
  '01-02-01',
  '01-02-02',
  '01-02-04',
  '01-02-05',
  '01-02-06',
  '01-02-07',
  '01-02-08',
  '01-02-09',
  '01-02-13',
  '01-02-14',
  'FND-01',
  'FND-01-01',
  'FND-01-01-01',
  'FND-01-01-04',
] as const

const UNDERGROUND_WATERPROOF_L3_SUCCESSOR_CODES = [
  '01-07',
  '01-07-01',
  '01-07-02',
  '01-07-03',
  '01-07-04',
  '01-07-05',
  'WPI-01-01-01',
] as const

const UNDERGROUND_WATERPROOF_TO_BACKFILL_L3_CARRIER_CODES = [
  '01-07-01',
  '01-07-05',
] as const

const FOUNDATION_BACKFILL_L3_SUCCESSOR_CODES = [
  '01-05-02',
  '01-05-03',
] as const

const MEP_SYSTEM_COMMISSIONING_CONFIRMED_CHILD_CARRIER_CODES = [
  'ELE-01',
  'PLU-01-01-01',
  'PLU-03',
  'PLU-03-01',
  'PLU-03-01-01',
  'ELE-01-01-03',
  'ELE-03-01',
  'ELE-03-02-01',
  'HVA-03-01-02',
  'HVA-04',
  'HVA-04-01-01',
] as const

const ELECTRICAL_LIGHTING_PARENT_FALSE_COMMISSIONING_CARRIER_CODES = [
  'ELE-03-02',
] as const

const HEATING_PIPELINE_COMMISSIONING_L3_SUCCESSOR_CODES = [
  'HVA-02-01-02',
] as const

const HEATING_PIPELINE_COMMISSIONING_L3_CARRIER_CODES = [
  'PLU-02-01-01',
  'HVA-03-01',
  'PLU-05',
  'PLU-05-01',
  'PLU-05-01-01',
] as const

const MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES = [
  'HVA-02-01-02',
  'PLU-06-01-01',
  'ELE-05-01-01',
] as const

const MEDICAL_SPECIAL_ROOM_VALIDATION_L3_CARRIER_CODES = [
  'CLN-01-01-02',
  'CLN-03-01-05',
] as const

const MEDICAL_SPECIAL_ROOM_VALIDATION_L3_SUCCESSOR_CODES = [
  'CLN-02-01-02',
  'CLN-03-01-01',
  'CLN-03-01-02',
] as const

const DATA_CENTER_ENVELOPE_CONFIRMED_L3_CARRIER_CODES = [
  'DTC-01',
  'DTC-01-01',
  'DTC-01-01-01',
  'DTC-01-01-02',
] as const

const DATA_CENTER_POWER_COOLING_CONFIRMED_L3_SUCCESSOR_CODES = [
  'DTC-02',
  'DTC-02-01',
  'DTC-02-01-01',
  'DTC-02-01-02',
  'DTC-02-02',
  'DTC-02-02-01',
  'DTC-02-02-02',
] as const

const DATA_CENTER_CLEAN_VALIDATION_CONFIRMED_L3_SUCCESSOR_CODES = [
  'CLN-02',
  'CLN-02-01',
  'CLN-02-01-01',
  'CLN-02-01-02',
] as const

const DATA_CENTER_CABLING_TO_SMART_INTEGRATION_L3_CARRIER_CODES = [
  'DTC-03-01-01',
] as const

const DATA_CENTER_CABLING_TO_SMART_INTEGRATION_L3_SUCCESSOR_CODES = [
  '08-01-03',
  'INT-02-01-02',
] as const

const DATA_CENTER_CABLING_FALSE_ELECTRICAL_INTEGRATION_CARRIER_EDGES = [
  'DTC-03-01-01->ELE-04-01-01',
] as const

const DATA_CENTER_UPS_POWER_TO_COMMON_MONITORING_L3_CARRIER_CODES = [
  'DTC-02-01',
  'DTC-02-01-01',
] as const

const DATA_CENTER_UPS_POWER_TO_COMMON_MONITORING_L3_SUCCESSOR_CODES = [
  'INT-04-01-01',
  'ELE-04-01-01',
] as const

const DATA_CENTER_UPS_TO_ENVIRONMENT_MONITORING_L3_CARRIER_CODES = [
  'DTC-02-01-01',
] as const

const DATA_CENTER_UPS_TO_ENVIRONMENT_MONITORING_L3_SUCCESSOR_CODES = [
  'DTC-02-02-02',
] as const

const CLEANROOM_ENVELOPE_VALIDATION_L3_CARRIER_CODES = [
  'CLN-01',
  'CLN-01-01-01',
  'CLN-04-01-01',
  'CLN-04-01-02',
  'CLN-04-01-03',
] as const

const CLEANROOM_VALIDATION_AND_DATAHALL_L3_SUCCESSOR_CODES = [
  ...DATA_CENTER_CLEAN_VALIDATION_CONFIRMED_L3_SUCCESSOR_CODES,
  'DTC-02-02-01',
] as const

const CLEANROOM_PARENT_FALSE_FORMAL_FIRE_ACCEPTANCE_CARRIER_EDGES = [
  'CLN-03->FIR-05-01-01',
  'CLN-03->FIR-05-01-02',
] as const

const FIRE_LINKAGE_LOGIC_BROAD_OR_FALSE_PARENT_CARRIER_EDGES = [
  'INT-02-01->FIR-03-02-01',
  'INT-02->FIR-03-02-01',
  '08-07-01->FIR-03-02-01',
  'INT-01-01->FIR-03-02-01',
  'HTL-03-01->FIR-03-02-01',
  'HTL-03->FIR-03-02-01',
  'FIR-04-01->FIR-03-02-01',
  'FIR-04->FIR-03-02-01',
  'FIR-06-01->FIR-03-02-01',
  'FIR-04-01-01->FIR-03-02-01',
  'FIR-04-01-02->FIR-03-02-01',
  'FIR-02->HTL-05-01-02',
  'CLN-03-01->FIR-03-02-01',
  'CLN-03-01-02->FIR-03-02-01',
  'INT-03->FIR-03-02-01',
  'INT-03-01-01->FIR-03-02-01',
  'CLN-03-01-05->FIR-03-02-01',
  'INT-03-01-03->FIR-03-02-01',
  'INT-01-01-02->FIR-03-02-01',
  'CLN-01-01-01->FIR-03-02-01',
  'CLN-01->FIR-03-02-01',
  'FIR-06->FIR-03-02-01',
  'FIR-06-01-01->FIR-03-02-01',
  'INT-03-01->FIR-03-02-01',
  'INT-02-01-02->FIR-03-02-01',
  'DTC-03-01-02->FIR-03-02-01',
  'INT-02-01-03->FIR-03-02-01',
  'INT-02-01-01->FIR-03-02-01',
  'INT-03-01-02->FIR-03-02-01',
  'CLN-01-01->FIR-03-02-01',
  '08-07->FIR-03-02-01',
  'HTL-03-01-02->FIR-03-02-01',
  'INT-01-01-03->FIR-03-02-01',
  'CLN-03-01-03->FIR-03-02-01',
  'CLN-03-01-04->FIR-03-02-01',
  'CLN-01-01-02->FIR-03-02-01',
  'CLN-03-01-01->FIR-03-02-01',
  'CLN-03->FIR-03-02-01',
  'INT-01->FIR-03-02-01',
  'INT-02-01-04->FIR-03-02-01',
  'HTL-03-01-01->FIR-03-02-01',
  'INT-01-01-01->FIR-03-02-01',
] as const

const INDUSTRIAL_CLEANROOM_ENVELOPE_L3_CARRIER_CODES = [
  'ICR-02',
  'ICR-02-01',
  'ICR-02-01-02',
] as const

const INDUSTRIAL_CLEANROOM_PROCESS_ENVIRONMENT_L3_SUCCESSOR_CODES = [
  'ICR-03',
  'ICR-03-01',
  'ICR-03-01-01',
  'ICR-03-01-02',
  'ICR-03-02',
  'ICR-03-02-01',
  'ICR-05-01-06',
  'ICR-05-01-07',
  'ICR-05-01-08',
] as const

const MIXED_USE_PODIUM_TRANSFER_CONFIRMED_L3_CARRIER_CODES = [
  'TOD-02-01-01',
] as const

const MIXED_USE_PODIUM_TRANSFER_BROAD_FALSE_CARRIER_CODES = [
  'TOD-02',
] as const

const MIXED_USE_PODIUM_TOWER_INTERFACE_L3_SUCCESSOR_CODES = [
  'BDT-04-01-01',
  'ELE-03-02-01',
] as const

const TOD_COMMERCIAL_TIE_IN_CONFIRMED_L3_CARRIER_CODES = [
  'TOD-02-01-02',
] as const

const TOD_COMMERCIAL_TIE_IN_CONFIRMED_L3_SUCCESSOR_CODES = [
  'TOD-03-01-01',
] as const

const TOD_COMMERCIAL_TIE_IN_FALSE_TOWER_STRUCTURE_CARRIER_CODES = [
  'TOD-02-01-02',
] as const

const TOD_TRANSFER_LAYER_PARENT_FALSE_TOWER_STRUCTURE_CARRIER_CODES = [
  'TOD-02-01',
] as const

const TOD_LIVE_LINE_PROTECTION_TO_TRANSFER_STRUCTURE_L3_CARRIER_CODES = [
  'TOD-01-01-02',
] as const

const TOD_LIVE_LINE_PROTECTION_TO_TRANSFER_STRUCTURE_L3_SUCCESSOR_CODES = [
  'TOD-02-01-01',
] as const

const ELEVATOR_HYDRAULIC_SYSTEM_TO_WHOLE_LIFT_ACCEPTANCE_L3_CARRIER_CODES = [
  '10-02-03',
] as const

const ELEVATOR_HYDRAULIC_SYSTEM_TO_WHOLE_LIFT_ACCEPTANCE_L3_SUCCESSOR_CODES = [
  '10-02-12',
] as const

const INTEGRATED_BATHROOM_SITE_PROCESS_FALSE_INSTALL_RELEASE_CARRIER_CODES = [
  'IBU-03-01-01',
  'IBU-03-01-02',
  'IBU-03-01-03',
] as const

const INTEGRATED_BATHROOM_SITE_PROCESS_FALSE_INSTALL_RELEASE_SUCCESSOR_CODES = [
  'IBU-02',
  'IBU-02-01',
  'IBU-02-01-01',
  'IBU-03-01-05',
] as const

const RENOVATION_SURVEY_REINFORCEMENT_RECOMMENDED_ADVICE_CARRIER_CODES = [
  'RNV-01',
  'RNV-01-01',
  'RNV-01-01-01',
  'RNV-04-01-01',
  'RNV-04-01-02',
] as const

const RENOVATION_SURVEY_REINFORCEMENT_RECOMMENDED_ADVICE_SUCCESSOR_CODES = [
  'RNV-02-01',
  'RNV-02-01-01',
  'RNV-02-01-02',
  'RNV-02-01-03',
  'RNV-04-01-07',
  'RNV-04-01-08',
  'RNV-04-01-09',
  'RNV-04-01-10',
  'RNV-04-01-11',
  'RNV-04-01-12',
  'RNV-04-01-13',
] as const

const L3_RECOMMENDED_CONFIRMED_ADVICE_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set(
  [
    ...V1475_CROSS_ITEM_WORKFLOW_SEED
      .filter((rule) => (
        rule.isActive !== false
        && rule.strength === 'recommended'
        && rule.autoApplyPolicy === 'confirmed_template_only'
      ))
      .flatMap(buildCrossItemRuleStableEdges),
    ...buildL3ParentCarrierEdges(
      RENOVATION_SURVEY_REINFORCEMENT_RECOMMENDED_ADVICE_CARRIER_CODES,
      RENOVATION_SURVEY_REINFORCEMENT_RECOMMENDED_ADVICE_SUCCESSOR_CODES,
    ),
    ...buildL3ParentCarrierEdges(
      MIC_FACTORY_INTEGRATION_RECOMMENDED_ADVICE_CARRIER_CODES,
      MIC_FACTORY_INTEGRATION_RECOMMENDED_ADVICE_SUCCESSOR_CODES,
    ),
  ],
)

const L4_FORMAL_ACCEPTANCE_BOUNDARY_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set([
  'CLN-01->FIR-05-01-01',
  'CLN-01->FIR-05-01-02',
  'CLN-01-01->FIR-05-01-01',
  'CLN-01-01->FIR-05-01-02',
  'CLN-01-01-01->FIR-05-01-01',
  'CLN-01-01-01->FIR-05-01-02',
  'CLN-03-01-05->FIR-05-01-01',
  'CLN-03-01-05->FIR-05-01-02',
  'CLN-03-01-03->FIR-05-01-01',
  'CLN-03-01-03->FIR-05-01-02',
  'CLN-03-01-04->FIR-05-01-01',
  'CLN-03-01-04->FIR-05-01-02',
  'CLN-01-01-02->FIR-05-01-01',
  'CLN-01-01-02->FIR-05-01-02',
  'CLN-03-01-01->FIR-05-01-01',
  'CLN-03-01-01->FIR-05-01-02',
  'ELE-03-01-01->HVA-02-01-02',
  'ELE-03-01-01->PLU-06-01-01',
  'ELE-03-01-01->ELE-05-01-01',
  'HTL-03-01-02->FIR-05-01-01',
  'HTL-03-01-02->FIR-05-01-02',
  'HTL-03-01-01->FIR-05-01-01',
  'HTL-03-01-01->FIR-05-01-02',
  'INT-01-01-02->FIR-05-01-02',
  'INT-03-01-01->FIR-05-01-02',
  'INT-02-01-04->FIR-05-01-02',
  'INT-03-01-03->FIR-05-01-02',
])

const L3_CONFIRMED_PARENT_CARRIER_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set([
  ...buildL3ParentCarrierEdges(
    STEEL_PARENT_AND_PIPE_STRUCTURE_L3_CARRIER_PREFIXES,
    STRUCTURE_ENVELOPE_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    EXPANDED_CONFIRMED_STRUCTURE_ENVELOPE_L3_CARRIER_PREFIXES,
    STRUCTURE_ENVELOPE_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ROOF_MEMBRANE_WATERPROOF_L3_CARRIER_CODES,
    ROOF_TILE_PANEL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PROFILED_METAL_DECK_TO_METAL_ROOF_PANEL_L3_CARRIER_CODES,
    PROFILED_METAL_DECK_TO_METAL_ROOF_PANEL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ROOF_WATERPROOF_FUNCTION_LAYER_L3_CARRIER_CODES,
    ROOF_WATERPROOF_FUNCTION_LAYER_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STRUCTURE_DOOR_WINDOW_L3_CARRIER_CODES,
    STRUCTURE_DOOR_WINDOW_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MASONRY_PLASTER_AND_DOOR_WINDOW_L3_CARRIER_CODES,
    MASONRY_PLASTER_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MASONRY_PLASTER_AND_DOOR_WINDOW_L3_CARRIER_CODES,
    STRUCTURE_DOOR_WINDOW_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STEEL_TUBE_CONCRETE_EXACT_ENVELOPE_L3_CARRIER_CODES,
    STEEL_TUBE_CONCRETE_EXACT_ENVELOPE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STEEL_PARENT_AND_PIPE_STRUCTURE_L3_CARRIER_PREFIXES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    EXPANDED_CONFIRMED_VERTICAL_TRANSPORT_L3_CARRIER_PREFIXES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    EXPANDED_CONFIRMED_VERTICAL_TRANSPORT_L3_CARRIER_PREFIXES,
    STANDARD_ELEVATOR_CIVIL_HANDOVER_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELEVATOR_SHAFT_SAFETY_COMPONENT_L3_CARRIER_CODES,
    ELEVATOR_STRAIGHT_COMMISSIONING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELEVATOR_INSTALLATION_TO_COMMISSIONING_L3_CARRIER_CODES,
    ELEVATOR_STRAIGHT_COMMISSIONING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MEP_PARENT_TO_DEC_WALL_CEILING_L3_CARRIER_PREFIXES,
    DEC_WALL_CEILING_PACKAGE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MEP_TO_DEC_WALL_CEILING_CONFIRMED_CHILD_CARRIER_CODES,
    DEC_WALL_CEILING_PACKAGE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_INTEGRATED_HANGER_TO_DEC_WALL_CEILING_L3_CARRIER_CODES,
    DEC_WALL_CEILING_PACKAGE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    OUTDOOR_SPECIAL_LIGHTING_TO_POWER_ENERGY_L3_CARRIER_CODES,
    OUTDOOR_POWER_ENERGY_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    WATER_SYSTEM_PARENT_TO_FINISH_L3_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MIC_RECEIVING_HOIST_L3_CARRIER_CODES,
    MIC_RECEIVING_HOIST_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MIC_SITE_CONNECTION_L3_CARRIER_PREFIXES,
    MIC_INTERFACE_CLOSEOUT_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_JOINT_CLOSEOUT_L3_CARRIER_CODES,
    PREFAB_JOINT_ACCEPTANCE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_GROUTING_NEXT_FLOOR_L3_CARRIER_CODES,
    PREFAB_GROUTING_NEXT_FLOOR_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_SITE_HOIST_TO_JOINT_CONNECTION_L3_CARRIER_CODES,
    PREFAB_JOINT_CLOSEOUT_L3_CARRIER_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_FIRST_BATCH_ACCEPTANCE_TO_SITE_HOIST_L3_CARRIER_CODES,
    PREFAB_FIRST_BATCH_ACCEPTANCE_TO_SITE_HOIST_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_EXPANSION_FACTORY_DOCUMENTS_TO_SITE_HOIST_L3_CARRIER_CODES,
    PREFAB_EXPANSION_SITE_HOIST_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_TRANSPORT_RECEIVING_TO_FOLLOWUP_BATCH_INSPECTION_L3_CARRIER_CODES,
    PREFAB_TRANSPORT_RECEIVING_TO_FOLLOWUP_BATCH_INSPECTION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['PFB-01-01-02'],
    PREFAB_FOLLOWUP_BATCH_HANDOVER_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_JOINT_QUALITY_ASSESSMENT_L3_CARRIER_CODES,
    PREFAB_JOINT_QUALITY_ASSESSMENT_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_ENTITY_INSPECTION_TO_ASSEMBLY_ASSESSMENT_L3_CARRIER_CODES,
    PREFAB_JOINT_QUALITY_ASSESSMENT_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_PCF_WATER_TEST_TO_INTERIOR_L3_CARRIER_CODES,
    PREFAB_PCF_WATER_TEST_TO_INTERIOR_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_STRUCTURE_TO_MASONRY_L3_CARRIER_CODES,
    MASONRY_PLASTER_AND_DOOR_WINDOW_L3_CARRIER_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_TO_WATERPROOF_L3_CARRIER_CODES,
    UNDERGROUND_WATERPROOF_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_PIT_TO_FOUNDATION_L3_CARRIER_CODES,
    FOUNDATION_PIT_TO_FOUNDATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STATIC_PRESSURE_PILE_TO_CAP_L3_CARRIER_CODES,
    STATIC_PRESSURE_PILE_TO_CAP_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PILE_DETECTION_TO_CAP_RAFT_L3_CARRIER_CODES,
    STATIC_PRESSURE_PILE_TO_CAP_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['FND-01-01-03'],
    STATIC_PRESSURE_PILE_TO_CAP_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_CARRIER_CODES,
    FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    COMBINED_FOUNDATION_SUPPORT_L3_CARRIER_CODES,
    FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DEEP_FOUNDATION_SUPPORT_TO_EXCAVATION_L3_CARRIER_CODES,
    DEEP_FOUNDATION_SUPPORT_TO_EXCAVATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    COMBINED_FOUNDATION_SUPPORT_L3_CARRIER_CODES,
    FOUNDATION_PIT_TO_FOUNDATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_SECANT_PILE_TO_EARTHWORK_L3_CARRIER_CODES,
    FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_GRAVITY_RETAINING_WALL_TO_EARTHWORK_L3_CARRIER_CODES,
    FOUNDATION_INNER_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_ANCHOR_SUPPORT_TO_EARTHWORK_L3_CARRIER_CODES,
    FOUNDATION_ANCHOR_SUPPORT_TO_EARTHWORK_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FOUNDATION_ANCHOR_SUPPORT_TO_FOUNDATION_L3_CARRIER_CODES,
    FOUNDATION_ANCHOR_SUPPORT_TO_FOUNDATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['FND-01-01-03'],
    UNDERGROUND_WATERPROOF_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PILE_FOUNDATION_TO_UNDERGROUND_WATERPROOF_L3_CARRIER_CODES,
    UNDERGROUND_WATERPROOF_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    UNDERGROUND_WATERPROOF_TO_BACKFILL_L3_CARRIER_CODES,
    FOUNDATION_BACKFILL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DRAINAGE_FLOOR_HANDOFF_L3_CARRIER_CODES,
    DRAINAGE_FLOOR_HANDOFF_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    OUTDOOR_WATER_SUPPLY_TO_DRAINAGE_L3_CARRIER_CODES,
    OUTDOOR_WATER_SUPPLY_TO_DRAINAGE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    BUILDING_SHIELDING_CONFIRMED_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MEP_SYSTEM_COMMISSIONING_CONFIRMED_CHILD_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['ELE-02-01'],
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_WATER_LIFE_SAFETY_L3_CARRIER_CODES,
    FIRE_WATER_LIFE_SAFETY_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_PUMP_ROOM_LIFE_SAFETY_L3_CARRIER_CODES,
    FIRE_PUMP_ROOM_LIFE_SAFETY_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_DETECTION_ACCEPTANCE_L3_CARRIER_CODES,
    FIRE_DETECTION_ACCEPTANCE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_CONTROL_ROOM_LIFE_SAFETY_L3_CARRIER_CODES,
    FIRE_CONTROL_ROOM_LIFE_SAFETY_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_HYDRANT_TO_FIRE_WATER_COMMISSIONING_L3_CARRIER_CODES,
    FIRE_HYDRANT_TO_FIRE_WATER_COMMISSIONING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_SPRINKLER_TO_FIRE_WATER_COMMISSIONING_L3_CARRIER_CODES,
    FIRE_SPRINKLER_TO_FIRE_WATER_COMMISSIONING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    GAS_SUPPRESSION_LIFE_SAFETY_L3_CARRIER_CODES,
    GAS_SUPPRESSION_LIFE_SAFETY_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HOTEL_LEISURE_SMART_FIRE_L3_CARRIER_CODES,
    HOTEL_LEISURE_SMART_FIRE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HOTEL_GUEST_CONTROL_TO_SMART_INTEGRATION_L3_CARRIER_CODES,
    HOTEL_GUEST_CONTROL_TO_SMART_INTEGRATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HOTEL_KITCHEN_TO_EXHAUST_GAS_LINKAGE_L3_CARRIER_CODES,
    HOTEL_KITCHEN_TO_EXHAUST_GAS_LINKAGE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SMART_SUBSYSTEM_ACCEPTANCE_L3_CARRIER_CODES,
    SMART_SUBSYSTEM_INTEGRATED_COMMISSIONING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HEATING_PIPELINE_COMMISSIONING_L3_CARRIER_CODES,
    HEATING_PIPELINE_COMMISSIONING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MEDICAL_SPECIAL_ROOM_VALIDATION_L3_CARRIER_CODES,
    MEDICAL_SPECIAL_ROOM_VALIDATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_ENVELOPE_CONFIRMED_L3_CARRIER_CODES,
    DATA_CENTER_POWER_COOLING_CONFIRMED_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_ENVELOPE_CONFIRMED_L3_CARRIER_CODES,
    DATA_CENTER_CLEAN_VALIDATION_CONFIRMED_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_CABLING_TO_SMART_INTEGRATION_L3_CARRIER_CODES,
    DATA_CENTER_CABLING_TO_SMART_INTEGRATION_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_UPS_POWER_TO_COMMON_MONITORING_L3_CARRIER_CODES,
    DATA_CENTER_UPS_POWER_TO_COMMON_MONITORING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_UPS_TO_ENVIRONMENT_MONITORING_L3_CARRIER_CODES,
    DATA_CENTER_UPS_TO_ENVIRONMENT_MONITORING_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    CLEANROOM_ENVELOPE_VALIDATION_L3_CARRIER_CODES,
    CLEANROOM_VALIDATION_AND_DATAHALL_L3_SUCCESSOR_CODES,
  ),
  'CLN-01-01->DTC-02-02-01',
  ...buildL3ParentCarrierEdges(
    INDUSTRIAL_CLEANROOM_ENVELOPE_L3_CARRIER_CODES,
    INDUSTRIAL_CLEANROOM_PROCESS_ENVIRONMENT_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MIXED_USE_PODIUM_TRANSFER_CONFIRMED_L3_CARRIER_CODES,
    MIXED_USE_PODIUM_TOWER_INTERFACE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    TOD_COMMERCIAL_TIE_IN_CONFIRMED_L3_CARRIER_CODES,
    TOD_COMMERCIAL_TIE_IN_CONFIRMED_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    TOD_LIVE_LINE_PROTECTION_TO_TRANSFER_STRUCTURE_L3_CARRIER_CODES,
    TOD_LIVE_LINE_PROTECTION_TO_TRANSFER_STRUCTURE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELEVATOR_HYDRAULIC_SYSTEM_TO_WHOLE_LIFT_ACCEPTANCE_L3_CARRIER_CODES,
    ELEVATOR_HYDRAULIC_SYSTEM_TO_WHOLE_LIFT_ACCEPTANCE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MUNICIPAL_FORMAL_TIE_IN_TO_TOD_INTERFACE_L3_CARRIER_CODES,
    MUNICIPAL_FORMAL_TIE_IN_TO_TOD_INTERFACE_L3_SUCCESSOR_CODES,
  ),
  'PLU-04-01-01->TOD-03-01-01',
  'ELV-01-01-02->ELV-02',
  'ELV-01-01-02->ELV-02-01',
  'ELV-01-01-02->ELV-02-01-01',
  'ELV-01-01-02->ELV-02-01-02',
  'ELV-01-01-02->ELV-02-01-03',
  'ELV-01-01-02->ELV-02-01-04',
  'ELV-01-01-02->ELV-02-01-06',
  'ELV-01-01-04->ELV-02',
  'ELV-01-01-04->ELV-02-01',
  'ELV-01-01-04->ELV-02-01-01',
  'ELV-01-01-04->ELV-02-01-02',
  'ELV-01-01-04->ELV-02-01-03',
  'ELV-01-01-04->ELV-02-01-04',
  'ELV-01-01-04->ELV-02-01-06',
  'ELV-01->ELV-02',
  'ELV-01->ELV-02-01',
  'ELV-01->ELV-02-01-01',
  'ELV-01->ELV-02-01-02',
  'ELV-01->ELV-02-01-03',
  'ELV-01->ELV-02-01-04',
  'ELV-01->ELV-02-01-05',
  'ELV-01->ELV-02-01-06',
  'FND-01-01-02->01-07',
  'FND-01-01-02->01-07-01',
  'FND-01-01-02->01-07-02',
  'FND-01-01-02->01-07-03',
  'FND-01-01-02->01-07-04',
  'FND-01-01-02->01-07-05',
  'FND-01-01-02->WPI-01-01-01',
  '01-02-08->01-02-03',
  '01-02-08->BDT-01-01-01',
  '01-02-07->01-02-03',
  '01-02-07->BDT-01-01-01',
  '01-02-09->01-02-03',
  '01-02-09->BDT-01-01-01',
  '01-02-12->01-02-03',
  '01-02-12->BDT-01-01-01',
  '01-02-03->01-07',
  '01-02-03->01-07-01',
  '01-02-03->01-07-02',
  '01-02-03->01-07-03',
  '01-02-03->01-07-04',
  '01-02-03->01-07-05',
  '01-02-03->WPI-01-01-01',
  '01-07->01-05-02',
  '01-07->01-05-03',
  '01-03-06->FND-02-01-02',
  '01-04-01->FND-02-01-02',
  '01-03-06->01-02',
  '01-03-06->01-02-01',
  '01-03-06->01-02-02',
  '01-03-06->01-02-03',
  '01-03-06->01-02-04',
  '01-03-06->01-02-05',
  '01-03-06->01-02-06',
  '01-03-06->01-02-07',
  '01-03-06->01-02-08',
  '01-03-06->01-02-09',
  '01-03-06->01-02-10',
  '01-03-06->01-02-11',
  '01-03-06->01-02-12',
  '01-03-06->01-02-13',
  '01-03-06->01-02-14',
  '01-03-06->01-02-15',
  '01-03-06->FND-01',
  '01-03-06->FND-01-01',
  '01-03-06->FND-01-01-01',
  '01-03-06->FND-01-01-02',
  '01-03-06->FND-01-01-03',
  '01-03-06->FND-01-01-04',
  'STL-02-01-01->STL-03-01-01',
  'BDT-04-01-03->03-09',
  'BDT-04-01-03->03-09-01',
  'BDT-04-01-03->03-09-02',
  'BDT-04-01-03->03-09-03',
  'BDT-04-01-03->03-09-04',
  'BDT-04-01-03->BDT-04-01-01',
  'BDT-04-01-03->ELE-03-02-01',
  'CDF-01-01-01-P10->CDF-01-01-02-P08',
  'DTC-02-01-02->INT-04-01-01',
  'DTC-02-01-02->ELE-04-01-01',
  '07-01-10->09-03',
  '07-01-10->09-03-01',
  '07-01-10->09-03-02',
  'ELE-04-01->HVA-02-01-02',
  'ELE-04-01->PLU-06-01-01',
  'ELE-04-01->ELE-05-01-01',
  'ELE-04-01-01->HVA-02-01-02',
  'ELE-04-01-01->PLU-06-01-01',
  'ELE-04-01-01->ELE-05-01-01',
  'BDT-01-01-06-P06->ELE-03-02-01-P03',
  'ELE-03-02-02->HVA-02-01-02',
  'ELE-03-02-02->PLU-06-01-01',
  'ELE-03-02-02->ELE-05-01-01',
  'IBU-01-01-02->IBU-01-02-01',
  'PFB-00-01-02-P15->PFB-00-01-03-P03',
  'IBU-01->IBU-02',
  '03-09-01->FAC-02-01-01',
  'HVA-04-01-01-P05->PLU-06-01-01-P05',
  'IBU-01->IBU-02-01-01',
  'IBU-01->IBU-03-01-05',
  'IBU-01-02->IBU-02',
  'IBU-01-02->IBU-02-01',
  'IBU-01-02->IBU-02-01-01',
  'IBU-01-02->IBU-03-01-05',
  'IBU-01-02-01->IBU-02',
  'IBU-01-02-01->IBU-02-01',
  'IBU-01-02-01->IBU-02-01-01',
  'IBU-01-02-01->IBU-03-01-05',
  'IBU-03-01-04->IBU-02',
  'IBU-03-01-04->IBU-02-01',
  'IBU-03-01-04->IBU-02-01-01',
  'IBU-03-01-04->IBU-03-01-05',
  'IKU-01->IKU-02',
  'IKU-01->IKU-02-01-01',
  'IKU-01->IKU-03-01-05',
  'IKU-01-02->IKU-02',
  'IKU-01-02->IKU-02-01',
  'IKU-01-02->IKU-02-01-01',
  'IKU-01-02->IKU-03-01-05',
  'IKU-01-02-01->IKU-02',
  'IKU-01-02-01->IKU-02-01',
  'IKU-01-02-01->IKU-02-01-01',
  'IKU-01-02-01->IKU-03-01-05',
  'IKU-03-01-01->IKU-02',
  'IKU-03-01-01->IKU-02-01',
  'IKU-03-01-01->IKU-02-01-01',
  'IKU-03-01-01->IKU-03-01-05',
  'IKU-03-01-02->IKU-02',
  'IKU-03-01-02->IKU-02-01',
  'IKU-03-01-02->IKU-02-01-01',
  'IKU-03-01-02->IKU-03-01-05',
  'IKU-03-01-03->IKU-02',
  'IKU-03-01-03->IKU-02-01',
  'IKU-03-01-03->IKU-02-01-01',
  'IKU-03-01-03->IKU-03-01-05',
  'IKU-03-01-04->IKU-02',
  'IKU-03-01-04->IKU-02-01',
  'IKU-03-01-04->IKU-02-01-01',
  'IKU-03-01-04->IKU-03-01-05',
  'MIC-02-01-02->MIC-03-01-02',
  'MIC-03-01-02->MIC-04-01-01',
  'DTC-01-01-01->DTC-02-02-01',
  'DTC-01->DTC-02-02-01',
  'DTC-01-01->DTC-02-02-01',
  'DTC-01-01-02->DTC-02-02-01',
  'INT-01-01-02->INT-02-01-02',
  'INT-01-01-02->INT-04-01-01',
  'ELE-03-01-02->INT-04-01-01',
  'DTC-03-01-01->INT-04-01-01',
  'MIC-03-01-01->MIC-04',
  'MIC-03-01-01->MIC-04-01',
  'MIC-03-01-01->MIC-04-01-01',
  'MIC-03-01-01->MIC-04-01-02',
  'MIC-03-01->MIC-04',
  'MIC-03-01->MIC-04-01',
  'MIC-03-01->MIC-04-01-01',
  'MIC-03-01->MIC-04-01-02',
  'ICR-02-02->ICR-03',
  'ICR-02-02->ICR-03-01',
  'ICR-02-02->ICR-03-01-01',
  'ICR-02-02->ICR-03-01-02',
  'ICR-02-02->ICR-03-02',
  'ICR-02-02->ICR-03-02-01',
  'ICR-02-02->ICR-05-01-06',
  'ICR-02-02->ICR-05-01-07',
  'ICR-02-02->ICR-05-01-08',
  'ICR-02-02-01->ICR-03',
  'ICR-02-02-01->ICR-03-01',
  'ICR-02-02-01->ICR-03-01-01',
  'ICR-02-02-01->ICR-03-01-02',
  'ICR-02-02-01->ICR-03-02',
  'ICR-02-02-01->ICR-03-02-01',
  'ICR-02-02-01->ICR-05-01-06',
  'ICR-02-02-01->ICR-05-01-07',
  'ICR-02-02-01->ICR-05-01-08',
  'HVA-04-01->HVA-02-01-02',
  'HVA-04-01->PLU-06-01-01',
  'HVA-04-01->ELE-05-01-01',
  'HVA-01-01-03->HVA-02-01-02',
  'HVA-01-01-03->PLU-06-01-01',
  'HVA-01-01-03->ELE-05-01-01',
  'HVA-05-01->HVA-02-01-02',
  'HVA-05-01-01->HVA-02-01-02',
  'DEC-03-01-01->DEC-03-01-02',
  'IKU-01-01-02->IKU-01-02-01',
  'DTC-01-01-01-P04->DTC-02-02-01-P04',
  'BDT-01-01-04->BDT-01-01-05',
  'BDT-01-01-05->BDT-01-01-06',
  'TOD-01-01-01->TOD-01-01-02',
  'WPI-01-01-01->01-05-02',
  'WPI-01-01-01->01-05-03',
  'WPI-01-01-01->WPI-01-01-04',
  '01-02-11->01-02-03',
  '01-02-11->BDT-01-01-01',
  '01-02-11->01-07',
  '01-02-11->01-07-01',
  '01-02-11->01-07-02',
  '01-02-11->01-07-03',
  '01-02-11->01-07-04',
  '01-02-11->01-07-05',
  '01-02-11->WPI-01-01-01',
  '01-02-15->01-07',
  '01-02-15->01-07-01',
  '01-02-15->01-07-02',
  '01-02-15->01-07-03',
  '01-02-15->01-07-04',
  '01-02-15->01-07-05',
  '01-02-15->WPI-01-01-01',
  'CLN-01->CLN-02',
  'CLN-01->CLN-02-01',
  'CLN-01->CLN-02-01-01',
  'CLN-01->CLN-02-01-02',
  'CLN-01-01->CLN-02',
  'CLN-01-01->CLN-02-01',
  'CLN-01-01->CLN-02-01-01',
  'CLN-01-01->CLN-02-01-02',
  'CLN-01-01-01->CLN-02',
  'CLN-01-01-01->CLN-02-01',
  'CLN-01-01-01->CLN-02-01-01',
  'CLN-01-01-01->CLN-02-01-02',
  'CLN-04-01-03->CLN-02-01-02',
  'RNV-01-01-02->RNV-02-01',
  'RNV-01-01-02->RNV-02-01-01',
  'RNV-01-01-02->RNV-02-01-02',
  'RNV-01-01-02->RNV-02-01-03',
  'RNV-01-01-02->RNV-04-01-07',
  'RNV-01-01-02->RNV-04-01-08',
  'RNV-01-01-02->RNV-04-01-09',
  'RNV-01-01-02->RNV-04-01-10',
  'RNV-01-01-02->RNV-04-01-11',
  'RNV-01-01-02->RNV-04-01-12',
  'RNV-01-01-02->RNV-04-01-13',
  'RNV-04-01-05->RNV-02-01',
  'RNV-04-01-05->RNV-02-01-01',
  'RNV-04-01-05->RNV-02-01-02',
  'RNV-04-01-05->RNV-02-01-03',
  'RNV-04-01-05->RNV-04-01-07',
  'RNV-04-01-05->RNV-04-01-08',
  'RNV-04-01-05->RNV-04-01-09',
  'RNV-04-01-05->RNV-04-01-10',
  'RNV-04-01-05->RNV-04-01-11',
  'RNV-04-01-05->RNV-04-01-12',
  'RNV-04-01-05->RNV-04-01-13',
  'RNV-04-01-03->RNV-02-01',
  'RNV-04-01-03->RNV-02-01-01',
  'RNV-04-01-03->RNV-02-01-02',
  'RNV-04-01-03->RNV-02-01-03',
  'RNV-04-01-03->RNV-04-01-07',
  'RNV-04-01-03->RNV-04-01-08',
  'RNV-04-01-03->RNV-04-01-09',
  'RNV-04-01-03->RNV-04-01-10',
  'RNV-04-01-03->RNV-04-01-11',
  'RNV-04-01-03->RNV-04-01-12',
  'RNV-04-01-03->RNV-04-01-13',
  'RNV-04-01-06->RNV-02-01',
  'RNV-04-01-06->RNV-02-01-01',
  'RNV-04-01-06->RNV-02-01-02',
  'RNV-04-01-06->RNV-02-01-03',
  'RNV-04-01-06->RNV-04-01-07',
  'RNV-04-01-06->RNV-04-01-08',
  'RNV-04-01-06->RNV-04-01-09',
  'RNV-04-01-06->RNV-04-01-10',
  'RNV-04-01-06->RNV-04-01-11',
  'RNV-04-01-06->RNV-04-01-12',
  'RNV-04-01-06->RNV-04-01-13',
  'RNV-01-01-01->RNV-01-01-02',
  'RNV-02-01-02->RNV-02-02-01',
  'RNV-02-02-02->RNV-03-01-02',
  'FIR-01-01->FIR-03-02-01',
  'FIR-01-01->FIR-05-01-02',
  'FIR-01-01-01->FIR-03-02-01',
  'FIR-01-01-01->FIR-05-01-02',
  'FIR-02->FIR-03-02-01',
  'FIR-02->FIR-05-01-02',
  'FIR-02->INT-04-01-01',
  'FIR-02->CLN-02-01-02',
  'FIR-02-01->FIR-03-02-01',
  'FIR-02-01->FIR-05-01-02',
  'FIR-02-01->INT-04-01-01',
  'FIR-02-01->CLN-02-01-02',
  'FIR-02-01->HTL-05-01-02',
  'FIR-02-01-01->FIR-03-02-01',
  'FIR-02-01-01->FIR-05-01-02',
  'FIR-02-01-01->CLN-02-01-02',
  'FIR-02-01-01->HTL-05-01-02',
  'FIR-02-02->FIR-03-02-01',
  'FIR-02-02->FIR-05-01-02',
  'FIR-02-02->INT-04-01-01',
  'FIR-02-02->CLN-02-01-02',
  'FIR-02-02->HTL-05-01-02',
  'FIR-02-02-01->FIR-03-02-01',
  'FIR-02-02-01->FIR-05-01-02',
  'FIR-02-02-01->INT-04-01-01',
  'FIR-02-02-01->CLN-02-01-02',
  'FIR-02-02-01->HTL-05-01-02',
  'FIR-03-01->FIR-03-02-01',
  'FIR-03-01->FIR-05-01-02',
  'FIR-03-01-01->FIR-05-01-02',
  'FIR-03-01-02->FIR-05-01-02',
  'FIR-01->FIR-05-01-02',
  'FIR-01-01-02->FIR-05-01-02',
  'FIR-04-01-01->FIR-05-01-02',
  'FIR-04-01->INT-04-01-01',
  'FIR-04-01->CLN-02-01-02',
  'FIR-04-01->HTL-05-01-02',
  'FIR-04-01->BDT-04-01-01',
  'FIR-04-01->ELE-03-02-01',
  'FIR-04->INT-04-01-01',
  'FIR-04->CLN-02-01-02',
  'FIR-04->HTL-05-01-02',
  'FIR-04->BDT-04-01-01',
  'FIR-04->ELE-03-02-01',
  'FIR-06->FIR-05-01-02',
  'FIR-06->INT-04-01-01',
  'FIR-06->CLN-02-01-02',
  'FIR-06->HTL-05-01-02',
  'FIR-06-01->FIR-05-01-02',
  'FIR-06-01->INT-04-01-01',
  'FIR-06-01->CLN-02-01-02',
  'FIR-06-01->HTL-05-01-02',
  'FIR-06-01-01->FIR-05-01-02',
  'FIR-06-01-01->INT-04-01-01',
  'FIR-06-01-01->CLN-02-01-02',
  'FIR-06-01-01->HTL-05-01-02',
  'FIR-04-01-01->INT-04-01-01',
  'FIR-04-01-01->CLN-02-01-02',
  'FIR-04-01-01->HTL-05-01-02',
  'FIR-04-01-01->BDT-04-01-01',
  'FIR-04-01-01->ELE-03-02-01',
  'FIR-04-01-02->FIR-05-01-02',
  'FIR-04-01-02->INT-04-01-01',
  'FIR-04-01-02->CLN-02-01-02',
  'FIR-04-01-02->HTL-05-01-02',
  'FIR-04-01-02->BDT-04-01-01',
  'FIR-04-01-02->ELE-03-02-01',
  '02-03-10->02-02',
  '02-03-10->02-02-01',
  '02-03-10->02-02-02',
  '02-03-10->02-02-03',
  '02-03-10->02-02-04',
  '02-03-10->02-02-05',
  'INT-02->FIR-05-01-02',
  'INT-02-01->FIR-05-01-02',
  'INT-02-01-02->FIR-05-01-02',
  'INT-02->INT-04-01-01',
  'INT-02-01->INT-04-01-01',
  'INT-02-01-02->INT-04-01-01',
  'HTL-03-01->FIR-05-01-01',
  'HTL-03-01->FIR-05-01-02',
  'HTL-03->FIR-05-01-01',
  'HTL-03->FIR-05-01-02',
  'PFB-00-01-01->PFB-00-01-02',
  'PFB-00-01-02->PFB-00-01-03',
  'PFB-00-01-03->PFB-01-01-01',
  'PFB-01-01-01->PFB-01-01-03',
  'PFB-01-01-04->PFB-02-01-03',
  'PFB-01-01-04->PFB-02',
  'PFB-01-01-04->PFB-02-01',
  'PFB-01-01-04->PFB-02-01-01',
  'PFB-01-01-04->PFB-02-01-02',
  'PFB-01-01-04->PFB-02-01-04',
  'PFB-01-01-04->PFB-02-01-05',
  'PFB-01-01-02->PFB-01-01-04',
  'PFB-01-01-03->PFB-02-01-01',
  'PFB-01-01-03->PFB-02-01-02',
  'PFB-02-01-02->PFB-03-01-02',
  'PFB-02-01-01->PFB-03-01-02',
  'PFB-02-01-01->PFB-04-01-13',
  'PFB-02-01-02->PFB-04-01-13',
  'PFB-02-01-04->PFB-02-01-05',
  'MIC-01->MIC-03',
  'MIC-01->MIC-03-01',
  'MIC-01->MIC-03-01-01',
  'MIC-01->MIC-03-01-02',
  'MIC-01-01->MIC-03',
  'MIC-01-01->MIC-03-01',
  'MIC-01-01->MIC-03-01-01',
  'MIC-01-01->MIC-03-01-02',
  'MIC-01-01-01->MIC-03',
  'MIC-01-01-01->MIC-03-01',
  'MIC-01-01-01->MIC-03-01-01',
  'MIC-01-01-01->MIC-03-01-02',
  'MIC-01-01-02->MIC-03',
  'MIC-01-01-02->MIC-03-01',
  'MIC-01-01-02->MIC-03-01-01',
  'MIC-01-01-02->MIC-03-01-02',
  'INT-02-01-01->INT-02-01-02',
  'INT-02-01-01->INT-04-01-01',
  'INT-02-01-01-P05->INT-02-01-02-P05',
  '07-02->08-01-03',
  '07-02->INT-02-01-02',
  '07-02->INT-04-01-01',
  'BDT-04-01-01->10-01-02',
  'HTL-01-01-02->HTL-05-01-01',
  'HTL-01-01-02->HTL-05-01-02',
  '07-04->08-01-03',
  '08-04->08-01-03',
  '08-03->08-01-03',
  '07-02->10-01-12',
  '07-02->10-02-11',
  'ELE-01-01-02->DEC-02-01',
  'ELE-01-01-02->DEC-02-01-01',
  'ELE-01-01-02->DEC-02-01-02',
  'ELE-01-01-02->DEC-02-01-03',
  'ELE-01-01-02->03-05',
  'ELE-01-01-02->03-05-01',
  'ELE-01-01-02->03-05-02',
  'ELE-01-01-02->03-05-03',
  '05-01->03-05',
  '05-01->03-05-01',
  '05-01->03-05-02',
  '05-01->03-05-03',
  '06-01->03-05',
  '06-01->03-05-01',
  '06-01->03-05-02',
  '06-01->03-05-03',
  '08-01->03-05',
  '08-01->03-05-01',
  '08-01->03-05-02',
  '08-01->03-05-03',
  'PLU-01-01-03->HVA-02-01-02',
  'PLU-01-01-03->PLU-06-01-01',
  'PLU-01-01-03->ELE-05-01-01',
  '01-03-01->01-05-01',
  '01-03-02->01-05-01',
  '01-03-02->FND-02-01-02',
  '01-04->01-05-01',
  '01-04->FND-02-01-02',
  '01-03-03->01-05-01',
  '01-03-04->01-05-01',
  '01-03-04->FND-02-01-02',
  '01-03-05->01-05-01',
  '01-03-06->01-05-01',
  '01-03-01->FND-02-01-02',
  '01-04-01->01-05-01',
  '01-04-02->01-05-01',
  '01-04-02->FND-02-01-02',
  '01-07-01->01-05-02',
  '01-07-02->01-05-02',
  '01-07-02->01-05-03',
  '01-07-04->01-05-02',
  '01-07-04->01-05-03',
  '01-05-01->01-02-03',
  '04-01-04->ELV-01',
  '04-01-04->ELV-01-01',
  '04-01-04->ELV-01-01-01',
  '04-01-04->ELV-01-01-02',
  '04-01-04->ELV-01-01-03',
  '04-01-04->ELV-01-01-04',
  '02-01->04-01',
  '02-01->04-01-01',
  '02-01->04-01-02',
  '02-01->04-01-03',
  '02-01->04-01-04',
  '02-01->10-01-02',
  '02-01->10-02-02',
  '02-01-03->10-01-02',
  '02-01-03->10-02-02',
  '02-03-02->ELV-01',
  '02-03-02->ELV-01-01',
  '02-03-02->ELV-01-01-01',
  '02-03-02->ELV-01-01-02',
  '02-03-02->ELV-01-01-03',
  '02-03-02->ELV-01-01-04',
  '02-05-02->ELV-01',
  '02-05-02->ELV-01-01',
  '02-05-02->ELV-01-01-01',
  '02-05-02->ELV-01-01-02',
  '02-05-02->ELV-01-01-03',
  '02-05-02->ELV-01-01-04',
  '02-01-03->02-02',
  '02-01-03->02-02-01',
  '02-01-03->02-02-02',
  '02-01-03->02-02-03',
  '02-01-03->02-02-04',
  '02-01-03->02-02-05',
  '02-04-06->02-02',
  '02-04-06->02-02-01',
  '02-04-06->02-02-02',
  '02-04-06->02-02-03',
  '02-04-06->02-02-04',
  '02-04-06->02-02-05',
  '02-05-07->02-02',
  '02-05-07->02-02-01',
  '02-05-07->02-02-02',
  '02-05-07->02-02-03',
  '02-05-07->02-02-04',
  '02-05-07->02-02-05',
  '02-03-02->02-02',
  '02-03-02->02-02-01',
  '02-03-02->02-02-02',
  '02-03-02->02-02-03',
  '02-03-02->02-02-04',
  '02-03-02->02-02-05',
  '02-03-04->02-02',
  '02-03-04->02-02-01',
  '02-03-04->02-02-02',
  '02-03-04->02-02-03',
  '02-03-04->02-02-04',
  '02-03-04->02-02-05',
  '02-05-02->02-02',
  '02-05-02->02-02-01',
  '02-05-02->02-02-02',
  '02-05-02->02-02-03',
  '02-05-02->02-02-04',
  '02-05-02->02-02-05',
  '02-03-05->02-02',
  '02-03-05->02-02-01',
  '02-03-05->02-02-02',
  '02-03-05->02-02-03',
  '02-03-05->02-02-04',
  '02-03-05->02-02-05',
  '02-02-05->03-04',
  '02-02-05->03-04-01',
  '02-02-05->03-04-02',
  '02-02-05->03-04-03',
  '02-02-05->03-04-04',
  '02-02-05->03-04-05',
  'BDT-01-01-02->03-04',
  'BDT-01-01-02->03-04-01',
  'BDT-01-01-02->03-04-02',
  'BDT-01-01-02->03-04-03',
  'BDT-01-01-02->03-04-04',
  'BDT-01-01-02->03-04-05',
  '02-02-02->FAC-03-01-01',
  'BDT-01-01-02->FAC-03-01-01',
  '02-01-03->04-01',
  '02-01-03->04-01-01',
  '02-01-03->04-01-02',
  '02-01-03->04-01-03',
  '02-01-03->04-01-04',
  '02-01-03->04-02',
  '02-01-03->04-02-01',
  '02-01-03->04-02-02',
  '02-01-03->04-02-03',
  '02-01-03->04-02-04',
  '02-01-03->04-02-05',
  '02-01-03->04-02-06',
  '02-01-03->04-02-07',
  '02-01-03->04-03',
  '02-01-03->04-03-01',
  '02-01-03->04-03-02',
  '02-01-03->04-03-03',
  '02-01-03->04-03-04',
  '02-01-03->WPI-01-01-02',
  '02-01-03->WPI-01-01-03',
  '02-04-06->04-01',
  '02-04-06->04-01-01',
  '02-04-06->04-01-02',
  '02-04-06->04-01-03',
  '02-04-06->04-01-04',
  '02-04-06->04-02',
  '02-04-06->04-02-01',
  '02-04-06->04-02-02',
  '02-04-06->04-02-03',
  '02-04-06->04-02-04',
  '02-04-06->04-02-05',
  '02-04-06->04-02-06',
  '02-04-06->04-02-07',
  '02-04-06->04-03',
  '02-04-06->04-03-01',
  '02-04-06->04-03-02',
  '02-04-06->04-03-03',
  '02-04-06->04-03-04',
  '02-04-06->WPI-01-01-02',
  '02-04-06->WPI-01-01-03',
  '02-05-07->04-01',
  '02-05-07->04-01-01',
  '02-05-07->04-01-02',
  '02-05-07->04-01-03',
  '02-05-07->04-01-04',
  '02-05-07->04-02',
  '02-05-07->04-02-01',
  '02-05-07->04-02-02',
  '02-05-07->04-02-03',
  '02-05-07->04-02-04',
  '02-05-07->04-02-05',
  '02-05-07->04-02-06',
  '02-05-07->04-02-07',
  '02-05-07->04-03',
  '02-05-07->04-03-01',
  '02-05-07->04-03-02',
  '02-05-07->04-03-03',
  '02-05-07->04-03-04',
  '02-05-07->WPI-01-01-02',
  '02-05-07->WPI-01-01-03',
  '02-01-03->03-09',
  '02-01-03->03-09-01',
  '02-01-03->03-09-02',
  '02-01-03->03-09-03',
  '02-01-03->03-09-04',
  '02-01-03->FAC-01',
  '02-01-03->FAC-01-01',
  '02-01-03->FAC-01-01-01',
  '02-01-03->FAC-01-01-02',
  '02-01-03->FAC-01-01-03',
  '02-01-03->FAC-01-01-04',
  '02-04-06->03-09',
  '02-04-06->03-09-01',
  '02-04-06->03-09-02',
  '02-04-06->03-09-03',
  '02-04-06->03-09-04',
  '02-04-06->FAC-01',
  '02-04-06->FAC-01-01',
  '02-04-06->FAC-01-01-01',
  '02-04-06->FAC-01-01-02',
  '02-04-06->FAC-01-01-03',
  '02-04-06->FAC-01-01-04',
  '02-05-07->03-09',
  '02-05-07->03-09-01',
  '02-05-07->03-09-02',
  '02-05-07->03-09-03',
  '02-05-07->03-09-04',
  '02-05-07->FAC-01',
  '02-05-07->FAC-01-01',
  '02-05-07->FAC-01-01-01',
  '02-05-07->FAC-01-01-02',
  '02-05-07->FAC-01-01-03',
  '02-05-07->FAC-01-01-04',
  '02-05-05->03-09',
  '02-05-05->03-09-01',
  '02-05-05->03-09-02',
  '02-05-05->03-09-03',
  '02-05-05->03-09-04',
  '02-05-03->03-09',
  '02-05-03->03-09-01',
  '02-05-03->03-09-02',
  '02-05-03->03-09-03',
  '02-05-03->03-09-04',
  '02-03-02->04-01',
  '02-03-02->04-01-01',
  '02-03-02->04-01-02',
  '02-03-02->04-01-03',
  '02-03-02->04-01-04',
  '02-03-02->04-02',
  '02-03-02->04-02-01',
  '02-03-02->04-02-02',
  '02-03-02->04-02-03',
  '02-03-02->04-02-04',
  '02-03-02->04-02-05',
  '02-03-02->04-02-06',
  '02-03-02->04-02-07',
  '02-03-02->04-03',
  '02-03-02->04-03-01',
  '02-03-02->04-03-02',
  '02-03-02->04-03-03',
  '02-03-02->04-03-04',
  '02-03-02->WPI-01-01-02',
  '02-03-02->WPI-01-01-03',
  '02-03-02->03-09',
  '02-03-02->03-09-01',
  '02-03-02->03-09-02',
  '02-03-02->03-09-03',
  '02-03-02->03-09-04',
  '02-03-02->FAC-01',
  '02-03-02->FAC-01-01',
  '02-03-02->FAC-01-01-01',
  '02-03-02->FAC-01-01-02',
  '02-03-02->FAC-01-01-03',
  '02-03-02->FAC-01-01-04',
  '02-03-04->04-01',
  '02-03-04->04-01-01',
  '02-03-04->04-01-02',
  '02-03-04->04-01-03',
  '02-03-04->04-01-04',
  '02-03-04->04-02',
  '02-03-04->04-02-01',
  '02-03-04->04-02-02',
  '02-03-04->04-02-03',
  '02-03-04->04-02-04',
  '02-03-04->04-02-05',
  '02-03-04->04-02-06',
  '02-03-04->04-02-07',
  '02-03-04->04-03',
  '02-03-04->04-03-01',
  '02-03-04->04-03-02',
  '02-03-04->04-03-03',
  '02-03-04->04-03-04',
  '02-03-04->WPI-01-01-02',
  '02-03-04->WPI-01-01-03',
  '02-03-04->03-09',
  '02-03-04->03-09-01',
  '02-03-04->03-09-02',
  '02-03-04->03-09-03',
  '02-03-04->03-09-04',
  '02-03-04->FAC-01',
  '02-03-04->FAC-01-01',
  '02-03-04->FAC-01-01-01',
  '02-03-04->FAC-01-01-02',
  '02-03-04->FAC-01-01-03',
  '02-03-04->FAC-01-01-04',
  '02-03-05->04-01',
  '02-03-05->04-01-01',
  '02-03-05->04-01-02',
  '02-03-05->04-01-03',
  '02-03-05->04-01-04',
  '02-03-05->04-02',
  '02-03-05->04-02-01',
  '02-03-05->04-02-02',
  '02-03-05->04-02-03',
  '02-03-05->04-02-04',
  '02-03-05->04-02-05',
  '02-03-05->04-02-06',
  '02-03-05->04-02-07',
  '02-03-09->04-02',
  '02-03-09->04-02-01',
  '02-03-09->04-02-02',
  '02-03-09->04-02-03',
  '02-03-09->04-02-04',
  '02-03-09->04-02-05',
  '02-03-09->04-02-06',
  '02-03-09->04-02-07',
  '02-03-10->04-02',
  '02-03-10->04-02-01',
  '02-03-10->04-02-02',
  '02-03-10->04-02-03',
  '02-03-10->04-02-04',
  '02-03-10->04-02-05',
  '02-03-10->04-02-06',
  '02-03-10->04-02-07',
  '02-03-05->04-03',
  '02-03-05->04-03-01',
  '02-03-05->04-03-02',
  '02-03-05->04-03-03',
  '02-03-05->04-03-04',
  '02-03-05->WPI-01-01-02',
  '02-03-05->WPI-01-01-03',
  '02-03-05->03-09',
  '02-03-05->03-09-01',
  '02-03-05->03-09-02',
  '02-03-05->03-09-03',
  '02-03-05->03-09-04',
  '02-03-05->FAC-01',
  '02-03-05->FAC-01-01',
  '02-03-05->FAC-01-01-01',
  '02-03-05->FAC-01-01-02',
  '02-03-05->FAC-01-01-03',
  '02-03-05->FAC-01-01-04',
  '02-05-02->04-01',
  '02-05-02->04-01-01',
  '02-05-02->04-01-02',
  '02-05-02->04-01-03',
  '02-05-02->04-01-04',
  '02-05-02->04-02',
  '02-05-02->04-02-01',
  '02-05-02->04-02-02',
  '02-05-02->04-02-03',
  '02-05-02->04-02-04',
  '02-05-02->04-02-05',
  '02-05-02->04-02-06',
  '02-05-02->04-02-07',
  '02-05-02->04-03',
  '02-05-02->04-03-01',
  '02-05-02->04-03-02',
  '02-05-02->04-03-03',
  '02-05-02->04-03-04',
  '02-05-02->WPI-01-01-02',
  '02-05-02->WPI-01-01-03',
  '02-05-02->03-09',
  '02-05-02->03-09-01',
  '02-05-02->03-09-02',
  '02-05-02->03-09-03',
  '02-05-02->03-09-04',
  '02-05-02->FAC-01',
  '02-05-02->FAC-01-01',
  '02-05-02->FAC-01-01-01',
  '02-05-02->FAC-01-01-02',
  '02-05-02->FAC-01-01-03',
  '02-05-02->FAC-01-01-04',
  '02-01-03->ELV-01',
  '02-01-03->ELV-01-01',
  '02-01-03->ELV-01-01-01',
  '02-01-03->ELV-01-01-02',
  '02-01-03->ELV-01-01-03',
  '02-01-03->ELV-01-01-04',
  '02-04-06->ELV-01',
  '02-04-06->ELV-01-01',
  '02-04-06->ELV-01-01-01',
  '02-04-06->ELV-01-01-02',
  '02-04-06->ELV-01-01-03',
  '02-04-06->ELV-01-01-04',
  '02-05-07->ELV-01',
  '02-05-07->ELV-01-01',
  '02-05-07->ELV-01-01-01',
  '02-05-07->ELV-01-01-02',
  '02-05-07->ELV-01-01-03',
  '02-05-07->ELV-01-01-04',
  '02-03-05->ELV-01',
  '02-03-05->ELV-01-01',
  '02-03-05->ELV-01-01-01',
  '02-03-05->ELV-01-01-02',
  '02-03-05->ELV-01-01-03',
  '02-03-05->ELV-01-01-04',
  'PFB-01-01-07->PFB-02-01-04',
  'INT-01-01-01->DEC-02-01',
  'INT-01-01-01->DEC-02-01-01',
  'INT-01-01-01->DEC-02-01-02',
  'INT-01-01-01->DEC-02-01-03',
  'HRT-01-01-02-P09->HRT-02-01-01-P03',
  'FIR-03-01->INT-04-01-01',
  'FIR-03-01->CLN-02-01-02',
  'FIR-03-01->HTL-05-01-02',
  'PLU-02-01-02->HVA-02-01-02',
  'PLU-02-01-02->PLU-06-01-01',
  'PLU-02-01-02->ELE-05-01-01',
  'PLU-02-01-02->DTC-02-02-01',
  'PLU-02-01-03->HVA-02-01-02',
  'ELE-05-01-01->DTC-02-01',
  'ELE-05-01-01->DTC-02-01-01',
  'ELE-05-01-01->DTC-02-01-02',
  'ELE-05-01-01->DTC-02-02',
  'ELE-05-01-01->DTC-02-02-01',
  'ELE-05-01-01->DTC-02-02-02',
  'ELE-05-01-01->10-01-13',
  '10-01-03->10-01-13',
  'PLU-06-01-01->HVA-04-01-01',
  'ELE-01-01->HVA-02-01-02',
  'ELE-01-01->PLU-06-01-01',
  'ELE-01-01->ELE-05-01-01',
  'ELE-01-01-01->HVA-02-01-02',
  'ELE-01-01-01->PLU-06-01-01',
  'ELE-01-01-01->ELE-05-01-01',
  'ELE-01-01-01->DTC-02-01',
  'ELE-01-01-01->DTC-02-01-01',
  'ELE-01-01-01->DTC-02-01-02',
  'ELE-01-01-01->DTC-02-02',
  'ELE-01-01-01->DTC-02-02-01',
  'ELE-01-01-01->DTC-02-02-02',
  'HTL-01-01-02->HTL-05-01',
  'CLN-03-01->FIR-05-01-01',
  'CLN-03-01->FIR-05-01-02',
  'CLN-03-01-02->FIR-05-01-01',
  'CLN-03-01-02->FIR-05-01-02',
  'DEC-03-02-01->HTL-05-01',
  'DEC-03-02-01->HTL-05-01-01',
  'DEC-03-02-01->HTL-05-01-02',
  '06-05-08->03-02',
  '06-05-08->03-02-01',
  '06-05-08->03-02-02',
  '06-05-08->03-02-03',
  '06-05-08->03-02-04',
  '06-05-08->03-05',
  '06-05-08->03-05-01',
  '06-05-08->03-05-02',
  '06-05-08->03-05-03',
  '06-05-08->DEC-02-01',
  '06-05-08->DEC-02-01-01',
  '06-05-08->DEC-02-01-02',
  '06-05-08->DEC-02-01-03',
  '06-05-08->DEC-05-01',
  '06-05-08->DEC-05-01-01',
  '06-05-08->DEC-05-01-02',
  '06-09-08->03-02',
  '06-09-08->03-02-01',
  '06-09-08->03-02-02',
  '06-09-08->03-02-03',
  '06-09-08->03-02-04',
  '06-09-08->03-05',
  '06-09-08->03-05-01',
  '06-09-08->03-05-02',
  '06-09-08->03-05-03',
  '06-09-08->DEC-02-01',
  '06-09-08->DEC-02-01-01',
  '06-09-08->DEC-02-01-02',
  '06-09-08->DEC-02-01-03',
  '06-09-08->DEC-05-01',
  '06-09-08->DEC-05-01-01',
  '06-09-08->DEC-05-01-02',
  '06-10-06->03-02',
  '06-10-06->03-02-01',
  '06-10-06->03-02-02',
  '06-10-06->03-02-03',
  '06-10-06->03-02-04',
  '06-10-06->03-05',
  '06-10-06->03-05-01',
  '06-10-06->03-05-02',
  '06-10-06->03-05-03',
  '06-10-06->DEC-02-01',
  '06-10-06->DEC-02-01-01',
  '06-10-06->DEC-02-01-02',
  '06-10-06->DEC-02-01-03',
  '06-10-06->DEC-05-01',
  '06-10-06->DEC-05-01-01',
  '06-10-06->DEC-05-01-02',
  'HVA-01-01->HVA-02-01-02',
  'HVA-01-01->PLU-06-01-01',
  'HVA-01-01->ELE-05-01-01',
  'HVA-01->HVA-02-01-02',
  'HVA-01->PLU-06-01-01',
  'HVA-01->ELE-05-01-01',
  'HVA-01-01-01->03-02',
  'HVA-01-01-01->03-02-01',
  'HVA-01-01-01->03-02-02',
  'HVA-01-01-01->03-02-03',
  'HVA-01-01-01->03-02-04',
  'HVA-01-01-01->HVA-02-01-02',
  'HVA-02-01-02->CLN-02-01-02',
  'HVA-01-01-01->PLU-06-01-01',
  'HVA-01-01-01->ELE-05-01-01',
  '01-03->01-05-01',
  '01-03->FND-02-01-02',
  'FND-02-01-01->01-05-01',
  'FND-02-01-01->FND-02-01-02',
  'FAC-01-01-02->FAC-02-01-01',
  '01-07-03->01-05-02',
])

const L3_CONFIRMED_EXACT_PROCESS_HANDOFF_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set([
  'TOD-02-01-01-P09->TOD-02-01-02-P06',
  'DTC-04-01-18-P08->DTC-04-01-19-P05',
  'ICR-05-01-05-P10->ICR-04-02-01-P09',
  'HTL-04-01-02-P07->HTL-05-01-02-P02',
  'RNV-01-01-02-P09->RNV-02-01-01-P06',
  'FND-02-01-01-P13->FND-02-01-02-P02',
  'FND-05-01-01-P08->FND-02-01-02-P02',
  'FND-06-01-01-P09->FND-02-01-02-P02',
  'FND-06-01-04-P08->FND-02-01-02-P02',
  'PFB-00-01-03-P12->PFB-01-01-01-P05',
  'CDF-01-01-02-P11->CDF-02-01-01-P08',
  'DEC-03-01-01-P09->DEC-03-01-02-P01',
  'FND-02-01-02-P12->01-02-03-P02',
  'MIC-05-01-01-P04->MIC-05-01-02-P03',
  'DTC-04-01-25-P11->DTC-04-01-26-P08',
  'BDT-01-01-04-P08->BDT-01-01-05-P01',
  'BDT-01-01-05-P10->DEC-02-02-02-P02',
  'BDT-06-01-07-P08->DEC-05-01-01-P07',
  'PLU-06-01-01-P04->HVA-04-01-01-P06',
  'CLN-01-01-01-P11->CLN-02-01-01-P05',
  'CLN-02-01-01-P11->CLN-02-01-02-P04',
  'DTC-04-01-11-P12->DTC-02-01-01-P04',
  'DTC-04-01-12-P09->DTC-02-01-01-P04',
  'DTC-04-01-09-P10->DTC-02-01-02-P04',
  'DTC-03-01-02-P04->DTC-02-02-02-P04',
  'PFB-01-01-03-P14->PFB-02-01-01-P04',
  'RNV-02-01-02-P09->RNV-02-02-01-P06',
  '04-05-04-P03->05-02-02-P03',
  '04-05-06-P01->06-02-04-P01',
  'STL-02-01-01-P10->STL-03-01-01-P02',
  'TOD-04-01-02-P09->TOD-04-01-03-P06',
  'TOD-02-01-02-P09->TOD-03-01-01-P06',
  'RNV-01-01-01-P09->RNV-01-01-02-P01',
  'WPI-02-01-02-P09->DEC-04-01-01-P01',
  'HRT-03-01-01-P09->HRT-03-01-02-P06',
  'MIC-04-01-02-P08->MIC-05-01-01-P08',
  'MIC-03-01-02-P08->MIC-04-01-01-P03',
  'MIC-04-01-01-P11->MIC-04-01-02-P02',
  'PFB-01-01-02-P09->PFB-01-01-04-P08',
  'PFB-01-01-02-P09->PFB-01-01-05-P05',
  'PFB-01-01-02-P09->PFB-01-01-06-P06',
  'PFB-01-01-02-P09->PFB-01-01-08-P06',
  'PFB-01-01-02-P09->PFB-01-01-09-P10',
  'MIC-02-01-02-P08->MIC-03-01-02-P05',
  'IBU-01-02-01-P05->IBU-02-01-01-P01',
  'CLN-03-01-05-P05->CLN-03-01-01-P07',
  'CLN-03-01-01-P07->CLN-02-01-02-P06',
  'FIR-03-02-01-P04->BDT-01-01-05-P09',
  'ELE-05-01-01-P11->INT-01-01-02-P04',
  'FIR-04-02-01-P09->INT-04-01-01-P06',
  'BDT-01-01-02-P08->FAC-03-01-01-P03',
  'FAC-01-01-02-P10->FAC-02-01-01-P02',
  'HVA-04-01-01-P06->PLU-06-01-01-P07',
  'PFB-01-01-01-P10->PFB-01-01-03-P10',
  'DTC-04-01-10-P10->DTC-02-01-02-P08',
  'BDT-06-01-02-P08->BDT-06-01-03-P01',
  'PFB-03-01-01-P10->PFB-03-01-02-P01',
  'PFB-01-01-03-P14->PFB-02-01-02-P04',
  'DTC-04-01-26-P09->DTC-04-01-27-P07',
  'HVA-03-01-02-P09->INT-02-01-02-P05',
  '04-05-04-P01->05-02-02-P01',
  'PFB-01-01-07-P12->PFB-02-01-04-P03',
  'INT-01-01-02-P05->INT-02-01-02-P06',
  'WPI-01-01-02-P10->WPI-01-01-03-P09',
  'ICR-03-02-01-P05->ICR-04-02-01-P02',
  'PFB-01-01-04-P12->PFB-02-01-03-P04',
  'HRT-02-02-01-P09->HRT-03-01-02-P06',
  'DTC-04-01-23-P09->DTC-04-01-22-P09',
  'CLN-01-01-02-P10->CLN-03-01-01-P07',
  'MEP-01-01-01-P04->BDT-06-01-07-P01',
  'ELE-05-01-01-P10->ELV-02-01-02-P01',
  'PFB-03-01-02-P10->PFB-03-01-03-P10',
  'PFB-02-01-05-P09->PFB-03-01-02-P06',
  'MEP-01-01-01-P03->BDT-06-01-07-P01',
  'HVA-03-01-01-P01->BDT-06-01-07-P02',
  'ICR-05-01-04-P07->ICR-05-01-05-P04',
  'DTC-04-01-24-P04->DTC-04-01-18-P08',
  'DTC-04-01-24-P04->DTC-04-01-20-P03',
  'DTC-04-01-24-P04->DTC-04-01-20-P04',
  'DTC-04-01-24-P04->DTC-04-01-21-P04',
  'DTC-02-01-01-P04->DTC-04-01-25-P03',
  'PFB-04-01-04-P06->PFB-04-01-05-P03',
  'PFB-04-01-04-P06->PFB-04-01-06-P03',
  'PFB-04-01-04-P06->PFB-04-01-07-P02',
  'PFB-04-01-04-P06->PFB-04-01-08-P02',
  'PFB-04-01-04-P06->PFB-04-01-09-P02',
  'HVA-05->HVA-02-01-02',
  'HVA-05->PLU-06-01-01',
  'HVA-05->ELE-05-01-01',
  'HVA-05-01-02->HVA-02-01-02',
  'HVA-05-01-02->PLU-06-01-01',
  'HVA-05-01-02->ELE-05-01-01',
  'ICR-02-01-01->ICR-03',
  'ICR-02-01-01->ICR-03-01',
  'ICR-02-01-01->ICR-03-01-01',
  'ICR-02-01-01->ICR-03-01-02',
  'ICR-02-01-01->ICR-03-02',
  'ICR-02-01-01->ICR-03-02-01',
  'ICR-02-01-01->ICR-05-01-06',
  'ICR-02-01-01->ICR-05-01-07',
  'ICR-02-01-01->ICR-05-01-08',
])

const L3_DYNAMIC_CONFIRMED_EXACT_PROCESS_HANDOFF_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set(
  V1475_CROSS_ITEM_WORKFLOW_SEED
    .filter((rule) => (
      rule.isActive !== false
      && rule.strength === 'hard'
      && rule.autoApplyPolicy === 'confirmed_template_only'
      && rule.predecessorCategoryTypes.every((type) => type === 'process')
      && rule.successorCategoryTypes.every((type) => type === 'process')
    ))
    .flatMap(buildCrossItemRuleStableEdges),
)

const L3_BROAD_OR_FALSE_PARENT_CARRIER_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set([
  ...CLEANROOM_PARENT_FALSE_FORMAL_FIRE_ACCEPTANCE_CARRIER_EDGES,
  ...FIRE_LINKAGE_LOGIC_BROAD_OR_FALSE_PARENT_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    BROAD_STEEL_TUBE_STRUCTURE_PARENT_CARRIER_CODES,
    STRUCTURE_ENVELOPE_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    BROAD_STEEL_TUBE_STRUCTURE_PARENT_CARRIER_CODES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STRUCTURE_FALSE_PARENT_CARRIER_PREFIXES,
    STRUCTURE_ENVELOPE_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STRUCTURE_FALSE_PARENT_CARRIER_PREFIXES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STRUCTURE_FALSE_PARENT_CARRIER_PREFIXES,
    STANDARD_ELEVATOR_CIVIL_HANDOVER_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PRESTRESS_MEMBRANE_AND_PROFILED_METAL_FALSE_ELEVATOR_CARRIER_CODES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ROOF_BASE_LAYER_FALSE_ELEVATOR_CARRIER_CODES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STEEL_TUBE_CONCRETE_EXACT_ENVELOPE_L3_CARRIER_CODES,
    STEEL_TUBE_CONCRETE_BROAD_ENVELOPE_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PLUMBING_TERMINAL_FALSE_FINISH_CARRIER_PREFIXES,
    PLUMBING_TERMINAL_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PLUMBING_TERMINAL_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['PLU-01-01-01'],
    PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DRAINAGE_WATER_BALL_TEST_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PLUMBING_RAINWATER_REUSE_PARENT_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PLUMBING_SPONGE_CITY_PARENT_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PLUMBING_EQUIPMENT_FALSE_PLASTER_CARRIER_CODES,
    PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PLUMBING_EQUIPMENT_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DRAINAGE_PARENT_AND_TEST_FALSE_FLOOR_CARRIER_CODES,
    DRAINAGE_FLOOR_HANDOFF_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SANITARY_FIXTURE_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    WATER_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    RAINWATER_REUSE_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    OUTDOOR_ELECTRICAL_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    OUTDOOR_ELECTRICAL_PARENT_FALSE_ENERGY_CARRIER_CODES,
    OUTDOOR_ELECTRICAL_ENERGY_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SINGLE_ELECTRICAL_GROUNDING_FALSE_ENERGY_CARRIER_CODES,
    OUTDOOR_ELECTRICAL_ENERGY_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SMART_BUILDING_INTEGRATION_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SMART_BUILDING_INTEGRATION_FALSE_FINISH_CARRIER_PREFIXES,
    SMART_BUILDING_INTEGRATION_FALSE_FIRE_CONTROL_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SMART_BUILDING_INTEGRATION_PARENT_FALSE_CARRIER_CODES,
    SMART_BUILDING_INTEGRATION_PARENT_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SMART_SUBSYSTEM_ACCEPTANCE_L3_CARRIER_CODES,
    SMART_SUBSYSTEM_BROAD_INTEGRATION_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELECTRICAL_LIGHTING_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    POWER_TRUNK_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    CORE_MEP_DISCIPLINE_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_PLATE_HEAT_EXCHANGER_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_HEATING_EQUIPMENT_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_PARENT_AND_HANGER_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_ABSORPTION_GAS_FUEL_EQUIPMENT_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_ABSORPTION_LITHIUM_BROMIDE_FILL_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_ABSORPTION_CHILD_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_ABSORPTION_VACUUM_TEST_FALSE_PLASTER_CARRIER_CODES,
    PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_FIRE_PIPE_FLUSHING_FALSE_PLASTER_CARRIER_CODES,
    PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_CLEANROOM_EQUIPMENT_TEST_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    BROAD_MEP_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DUST_COLLECTION_SYSTEM_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_COOLING_WATER_TEST_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_AIR_TERMINAL_PLASTER_FALSE_CARRIER_CODES,
    PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    WATER_TREATMENT_EQUIPMENT_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SURFACE_WATER_HEAT_EXCHANGER_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    GROUND_SOURCE_HEAT_EXCHANGER_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    KITCHEN_TOILET_EXHAUST_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SMOKE_CONTROL_TERMINAL_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    CIVIL_DEFENSE_VENTILATION_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SENSOR_INSTALLATION_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    BUILDING_AUTOMATION_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    BUILDING_AUTOMATION_CHILD_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    VACUUM_CLEANING_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_ROOT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_INTEGRATION_PARENT_FALSE_PLASTER_CARRIER_CODES,
    PLUMBING_PRESSURE_TEST_FALSE_PLASTER_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_SYSTEM_ROOT_FALSE_FINISH_ACCEPTANCE_CARRIER_CODES,
    INTELLIGENT_SYSTEM_ROOT_FALSE_FINISH_ACCEPTANCE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_CABLING_CHILD_FALSE_FINISH_CARRIER_CODES,
    INTELLIGENT_CABLING_CHILD_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...INTELLIGENT_CABLING_CHILD_FALSE_ACCEPTANCE_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_TIME_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_EQUIPMENT_ROOM_AND_INSTRUMENT_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_INFORMATION_OUTLET_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_ACCESS_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SECURITY_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    FIRE_ALARM_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HEAT_SOURCE_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ENERGY_STORAGE_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SOLAR_THERMAL_STORAGE_TANK_PIPE_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PUBLIC_BROADCAST_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    CONFERENCE_SYSTEM_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    SATELLITE_COMMUNICATION_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    CABLE_TV_AND_SATELLITE_RECEPTION_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    COMMUNICATION_AND_EMERGENCY_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['08-03'],
    TELEPHONE_EXCHANGE_PARENT_FALSE_INTEGRATION_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    EMERGENCY_POWER_PARENT_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELECTRICAL_LIGHTING_PARENT_FALSE_COMMISSIONING_CARRIER_CODES,
    MEP_SYSTEM_COMMISSIONING_SUCCESSOR_CODES,
  ),
  ...CLEANROOM_SPECIAL_ROOM_TO_DATAHALL_FALSE_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_NETWORK_ROOM_FALSE_FINISH_CARRIER_PREFIXES,
    INTELLIGENT_NETWORK_ROOM_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_CORE_NETWORK_FALSE_FINISH_CARRIER_PREFIXES,
    INTELLIGENT_NETWORK_ROOM_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...INTELLIGENT_CORE_NETWORK_FALSE_ACCEPTANCE_CARRIER_EDGES,
  ...INTELLIGENT_CHILD_FALSE_INTEGRATION_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_INFORMATION_NETWORK_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_INFORMATION_NETWORK_PARENT_FALSE_FINISH_CARRIER_CODES,
    INTELLIGENT_INFORMATION_NETWORK_PARENT_FALSE_INTEGRATION_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_GUIDANCE_EQUIPMENT_ROOM_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_GUIDANCE_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_DISPLAY_DEVICE_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_APPLICATION_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_CABINET_PATCH_PANEL_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_EQUIPOTENTIAL_FALSE_FINISH_CARRIER_PREFIXES,
    INTELLIGENT_EQUIPOTENTIAL_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELECTRICAL_EQUIPOTENTIAL_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ELECTRICAL_SURGE_PROTECTION_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_SURGE_PROTECTION_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTELLIGENT_ELECTROMAGNETIC_SHIELD_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_PLUMBING_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_PRECISION_AIR_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_FIRE_PROTECTION_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...DATA_CENTER_CABLING_FALSE_ELECTRICAL_INTEGRATION_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    HVAC_MULTI_SPLIT_SYSTEM_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_SOLAR_COLLECTOR_FALSE_FINISH_CARRIER_PREFIXES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    HVAC_ABSORPTION_CHILLER_COMMISSIONING_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MIC_HOIST_ONLY_FALSE_INTERFACE_CARRIER_PREFIXES,
    MIC_INTERFACE_CLOSEOUT_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STEEL_REINFORCEMENT_INSTALLATION_BROAD_ENVELOPE_FALSE_CARRIER_CODES,
    STRUCTURE_ENVELOPE_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    STEEL_REINFORCEMENT_INSTALLATION_BROAD_ENVELOPE_FALSE_CARRIER_CODES,
    STRUCTURE_TO_ELEVATOR_CIVIL_INSTALL_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    OUTDOOR_DRAINAGE_BROAD_MUNICIPAL_FALSE_CARRIER_CODES,
    OUTDOOR_DRAINAGE_BROAD_MUNICIPAL_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    OUTDOOR_WATER_SUPPLY_FALSE_INTERIOR_FINISH_CARRIER_CODES,
    OUTDOOR_DRAINAGE_BROAD_MUNICIPAL_FALSE_SUCCESSOR_CODES,
  ),
  ...OUTDOOR_WATER_SUPPLY_CHILD_DRAINAGE_FALSE_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    OUTDOOR_HYDRONIC_WATER_FEATURE_BROAD_FALSE_CARRIER_CODES,
    OUTDOOR_HYDRONIC_WATER_FEATURE_BROAD_FALSE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    DATA_CENTER_ROOM_DECORATION_FALSE_GENERAL_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  ...INTELLIGENT_SECURITY_PARENT_FALSE_ACCEPTANCE_CARRIER_EDGES,
  ...OUTDOOR_PIPE_PARENT_TO_TOD_INTERFACE_FALSE_CARRIER_EDGES,
  ...buildL3ParentCarrierEdges(
    ['TOD-03-01-01'],
    TOD_COMMERCIAL_TIE_IN_FALSE_INTERIOR_FLOOR_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    ['TOD-03-01-01'],
    TOD_COMMERCIAL_TIE_IN_FALSE_TOD_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    MIXED_USE_PODIUM_TRANSFER_BROAD_FALSE_CARRIER_CODES,
    MIXED_USE_PODIUM_TOWER_INTERFACE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    TOD_COMMERCIAL_TIE_IN_FALSE_TOWER_STRUCTURE_CARRIER_CODES,
    MIXED_USE_PODIUM_TOWER_INTERFACE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    TOD_TRANSFER_LAYER_PARENT_FALSE_TOWER_STRUCTURE_CARRIER_CODES,
    MIXED_USE_PODIUM_TOWER_INTERFACE_L3_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    INTEGRATED_BATHROOM_SITE_PROCESS_FALSE_INSTALL_RELEASE_CARRIER_CODES,
    INTEGRATED_BATHROOM_SITE_PROCESS_FALSE_INSTALL_RELEASE_SUCCESSOR_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_JOINT_WATERPROOF_FALSE_MASONRY_CARRIER_CODES,
    MASONRY_PLASTER_AND_DOOR_WINDOW_L3_CARRIER_CODES,
  ),
  ...buildL3ParentCarrierEdges(
    PREFAB_STRUCTURE_FALSE_DOOR_WINDOW_CARRIER_CODES,
    STRUCTURE_DOOR_WINDOW_L3_HANDOFF_SUCCESSOR_CODES,
  ),
  'FIR-03-01-01->INT-04-01-01',
  'FIR-03-01-01->CLN-02-01-02',
  'FIR-03-01-01->HTL-05-01-02',
  'INT-03-01-02->FIR-05-01-02',
  'INT-03-01-02->INT-04-01-01',
  '01-07-03->01-05-03',
  '01-03-05->FND-02-01-02',
  'ELE-03->HVA-02-01-02',
  'ELE-03->PLU-06-01-01',
  'ELE-03->ELE-05-01-01',
  'ELE-03-01-02->HVA-02-01-02',
  'ELE-03-01-02->PLU-06-01-01',
  'ELE-03-01-02->ELE-05-01-01',
  'ELE-03-01-02->08-01-03',
  'ELE-03-01-02->INT-02-01-02',
  '07-01-04->09-03',
  '07-01-04->09-03-01',
  '07-01-04->09-03-02',
  'ELV-01-01-02->ELV-02-01-05',
  'ELV-01-01->ELV-02-01-05',
  'ELV-01-01-01->ELV-02-01-05',
  'ELV-01-01-03->ELV-02-01-05',
  'ELV-01-01-04->ELV-02-01-05',
  '07-03-04->03-10',
  '07-03-04->03-10-01',
  '07-03-04->03-10-02',
  '07-03-04->03-10-03',
  '07-03-01->03-10',
  '07-03-01->03-10-01',
  '07-03-01->03-10-02',
  '07-03-01->03-10-03',
  '07-04-03->FIR-03-01-02',
  '07-04-05->FIR-03-01-02',
  '07-04-06->FIR-03-01-02',
  '07-04-07->FIR-03-01-02',
  '07-04-08->FIR-03-01-02',
  '07-01-01->09-03',
  '07-01-01->09-03-01',
  '07-01-01->09-03-02',
  '07-01-05->09-03',
  '07-01-05->09-03-01',
  '07-01-05->09-03-02',
  '07-01-06->09-03',
  '07-01-06->09-03-01',
  '07-01-06->09-03-02',
  '07-01-07->09-03',
  '07-01-07->09-03-01',
  '07-01-07->09-03-02',
  '07-01-08->09-03',
  '07-01-08->09-03-01',
  '07-01-08->09-03-02',
  '07-01-11->09-03',
  '07-01-11->09-03-01',
  '07-01-11->09-03-02',
  '05-06->OUT-01-01-01',
  '05-06->OUT-04-01-01',
  '05-06-01->OUT-01-01-01',
  '05-06-01->OUT-04-01-01',
  '05-07->OUT-01-01-01',
  '05-07->OUT-04-01-01',
  '05-07-01->OUT-01-01-01',
  '05-07-01->OUT-04-01-01',
  '05-07-02->OUT-01-01-01',
  '05-07-02->OUT-04-01-01',
  '05-06-02->OUT-01-01-01',
  '05-06-02->OUT-04-01-01',
  'OUT-02-01-01->OUT-01-01-01',
  'OUT-02-01-01->OUT-04-01-01',
  'OUT-05-01-01->OUT-01-01-01',
  'OUT-05-01-01->OUT-04-01-01',
  'PLU-01-01->03-05',
  'PLU-01-01->03-05-01',
  'PLU-01-01->03-05-02',
  'PLU-01-01->03-05-03',
  'PLU-01-01->03-02',
  'PLU-01-01->03-02-01',
  'PLU-01-01->03-02-02',
  'PLU-01-01->03-02-03',
  'PLU-01-01->03-02-04',
  'PLU-01-01->DEC-02-01',
  'PLU-01-01->DEC-02-01-01',
  'PLU-01-01->DEC-02-01-02',
  'PLU-01-01->DEC-02-01-03',
  'PLU-01-01->DEC-05-01',
  'PLU-01-01->DEC-05-01-01',
  'PLU-01-01->DEC-05-01-02',
  'PLU-01-01-04->03-05',
  'PLU-01-01-04->03-05-01',
  'PLU-01-01-04->03-05-02',
  'PLU-01-01-04->03-05-03',
  'PLU-01-01-04->DEC-02-01',
  'PLU-01-01-04->DEC-02-01-01',
  'PLU-01-01-04->DEC-02-01-02',
  'PLU-01-01-04->DEC-02-01-03',
  'PLU-01-01-04->DEC-05-01',
  'PLU-01-01-04->DEC-05-01-01',
  'PLU-01-01-04->DEC-05-01-02',
  'PLU-02-01-03->PLU-06-01-01',
  'PLU-02-01-03->ELE-05-01-01',
  'PLU-01->HVA-02-01-02',
  'PLU-01->PLU-06-01-01',
  'PLU-01->ELE-05-01-01',
  '06-11-06->03-02',
  '06-11-06->03-02-01',
  '06-11-06->03-02-02',
  '06-11-06->03-02-03',
  '06-11-06->03-02-04',
  '06-11-06->03-05',
  '06-11-06->03-05-01',
  '06-11-06->03-05-02',
  '06-11-06->03-05-03',
  '06-11-06->DEC-02-01',
  '06-11-06->DEC-02-01-01',
  '06-11-06->DEC-02-01-02',
  '06-11-06->DEC-02-01-03',
  '06-11-06->DEC-05-01',
  '06-11-06->DEC-05-01-01',
  '06-11-06->DEC-05-01-02',
  '05-08-04->03-02',
  '05-08-04->03-02-01',
  '05-08-04->03-02-02',
  '05-08-04->03-02-03',
  '05-08-04->03-02-04',
  '05-08-04->03-05',
  '05-08-04->03-05-01',
  '05-08-04->03-05-02',
  '05-08-04->03-05-03',
  '05-08-04->DEC-02-01',
  '05-08-04->DEC-02-01-01',
  '05-08-04->DEC-02-01-02',
  '05-08-04->DEC-02-01-03',
  '05-08-04->DEC-05-01',
  '05-08-04->DEC-05-01-01',
  '05-08-04->DEC-05-01-02',
  '05-08-04->OUT-01-01-01',
  '05-08-04->OUT-04-01-01',
  '05-08-04->TOD-03-01-01',
  '05-06-01->TOD-03-01-01',
  '05-06-01->05-07',
  '05-06-01->05-07-01',
  '05-06-01->05-07-02',
  'FIR-04-01->FIR-05-01-02',
  'FIR-04->FIR-05-01-02',
  '05-02-03->03-01',
  '05-02-03->03-01-01',
  '05-02-03->03-01-02',
  '05-02-03->03-01-03',
  '05-02-03->03-01-04',
  '02-03-09->02-02',
  '02-03-09->02-02-01',
  '02-03-09->02-02-02',
  '02-03-09->02-02-03',
  '02-03-09->02-02-04',
  '02-03-09->02-02-05',
  '02-03-09->04-01',
  '02-03-09->04-01-01',
  '02-03-09->04-01-02',
  '02-03-09->04-01-03',
  '02-03-09->04-01-04',
  '02-03-09->04-03',
  '02-03-09->04-03-01',
  '02-03-09->04-03-02',
  '02-03-09->04-03-03',
  '02-03-09->04-03-04',
  '02-03-09->WPI-01-01-02',
  '02-03-09->WPI-01-01-03',
  '02-03-09->03-09',
  '02-03-09->03-09-01',
  '02-03-09->03-09-02',
  '02-03-09->03-09-03',
  '02-03-09->03-09-04',
  '02-03-09->FAC-01',
  '02-03-09->FAC-01-01',
  '02-03-09->FAC-01-01-01',
  '02-03-09->FAC-01-01-03',
  '02-03-09->FAC-01-01-04',
  '02-03-09->FAC-01-01-02',
  '02-03-09->ELV-01',
  '02-03-09->ELV-01-01',
  '02-03-09->ELV-01-01-01',
  '02-03-09->ELV-01-01-02',
  '02-03-09->ELV-01-01-03',
  '02-03-09->ELV-01-01-04',
  '02-03-10->04-01',
  '02-03-10->04-01-01',
  '02-03-10->04-01-02',
  '02-03-10->04-01-03',
  '02-03-10->04-01-04',
  '02-03-10->04-03',
  '02-03-10->04-03-01',
  '02-03-10->04-03-02',
  '02-03-10->04-03-03',
  '02-03-10->04-03-04',
  '02-03-10->WPI-01-01-02',
  '02-03-10->WPI-01-01-03',
  '02-03-10->03-09',
  '02-03-10->03-09-01',
  '02-03-10->03-09-02',
  '02-03-10->03-09-03',
  '02-03-10->03-09-04',
  '02-03-10->FAC-01',
  '02-03-10->FAC-01-01',
  '02-03-10->FAC-01-01-01',
  '02-03-10->FAC-01-01-02',
  '02-03-10->FAC-01-01-03',
  '02-03-10->FAC-01-01-04',
  '02-03-10->ELV-01',
  '02-03-10->ELV-01-01',
  '02-03-10->ELV-01-01-01',
  '02-03-10->ELV-01-01-02',
  '02-03-10->ELV-01-01-03',
  '02-03-10->ELV-01-01-04',
  'DTC-02->INT-04-01-01',
  'DTC-02->ELE-04-01-01',
  'DTC-02-02->INT-04-01-01',
  'DTC-02-02->ELE-04-01-01',
  'DTC-02-02-01->INT-04-01-01',
  'DTC-02-02-01->ELE-04-01-01',
  'DTC-02-02-02->INT-04-01-01',
  'DTC-02-02-02->ELE-04-01-01',
  'DTC-03-01->INT-04-01-01',
  'DTC-03-01->ELE-04-01-01',
  'DTC-03-01-02->INT-04-01-01',
  'DTC-03-01-02->ELE-04-01-01',
  'ELE-01-01-02->HVA-02-01-02',
  'ELE-01-01-02->PLU-06-01-01',
  'ELE-01-01-02->ELE-05-01-01',
  'ELE-02-01-01->HVA-02-01-02',
  'ELE-02-01-01->PLU-06-01-01',
  'ELE-02-01-01->ELE-05-01-01',
  'ELE-02-01->HVA-02-01-02',
  'ELE-02-01->PLU-06-01-01',
  'ELE-02-01->ELE-05-01-01',
  'ELE-02->HVA-02-01-02',
  'ELE-02->PLU-06-01-01',
  'ELE-02->ELE-05-01-01',
  'HVA-05-01->PLU-06-01-01',
  'HVA-05-01->ELE-05-01-01',
  'HVA-05-01-01->PLU-06-01-01',
  'HVA-05-01-01->ELE-05-01-01',
  '05-01->DEC-02-01',
  '05-01->DEC-02-01-01',
  '05-01->DEC-02-01-02',
  '05-01->DEC-02-01-03',
  '05-01->DEC-05-01',
  '05-01->DEC-05-01-01',
  '05-01->DEC-05-01-02',
  'CLN-01-01-02->CLN-02',
  'CLN-01-01-02->CLN-02-01',
  'CLN-01-01-02->CLN-02-01-01',
  '01-03-02->01-02',
  '01-03-02->01-02-01',
  '01-03-02->01-02-02',
  '01-03-02->01-02-03',
  '01-03-02->01-02-04',
  '01-03-02->01-02-05',
  '01-03-02->01-02-06',
  '01-03-02->01-02-07',
  '01-03-02->01-02-08',
  '01-03-02->01-02-09',
  '01-03-02->01-02-10',
  '01-03-02->01-02-11',
  '01-03-02->01-02-12',
  '01-03-02->01-02-13',
  '01-03-02->01-02-14',
  '01-03-02->01-02-15',
  '01-03-02->FND-01',
  '01-03-02->FND-01-01',
  '01-03-02->FND-01-01-01',
  '01-03-02->FND-01-01-02',
  '01-03-02->FND-01-01-03',
  '01-03-02->FND-01-01-04',
  '01-04->01-02',
  '01-04->01-02-01',
  '01-04->01-02-02',
  '01-04->01-02-03',
  '01-04->01-02-04',
  '01-04->01-02-05',
  '01-04->01-02-06',
  '01-04->01-02-07',
  '01-04->01-02-08',
  '01-04->01-02-09',
  '01-04->01-02-10',
  '01-04->01-02-11',
  '01-04->01-02-12',
  '01-04->01-02-13',
  '01-04->01-02-14',
  '01-04->01-02-15',
  '01-04->FND-01',
  '01-04->FND-01-01',
  '01-04->FND-01-01-01',
  '01-04->FND-01-01-02',
  '01-04->FND-01-01-03',
  '01-04->FND-01-01-04',
  'HVA-01-01-02->03-05',
  'HVA-01-01-02->03-05-01',
  'HVA-01-01-02->03-05-02',
  'HVA-01-01-02->03-05-03',
  'HVA-01-01-02->DEC-02-01',
  'HVA-01-01-02->DEC-02-01-01',
  'HVA-01-01-02->DEC-02-01-02',
  'HVA-01-01-02->DEC-02-01-03',
  'HVA-01-01-02->DEC-05-01',
  'HVA-01-01-02->DEC-05-01-01',
  'HVA-01-01-02->DEC-05-01-02',
  '07-06->03-02',
  '07-06->03-02-01',
  '07-06->03-02-02',
  '07-06->03-02-03',
  '07-06->03-02-04',
  '07-06->03-05',
  '07-06->03-05-01',
  '07-06->03-05-02',
  '07-06->03-05-03',
  '07-06->DEC-02-01',
  '07-06->DEC-02-01-01',
  '07-06->DEC-02-01-02',
  '07-06->DEC-02-01-03',
  '07-06->DEC-05-01',
  '07-06->DEC-05-01-01',
  '07-06->DEC-05-01-02',
  '07-01-02->03-02',
  '07-01-02->03-02-01',
  '07-01-02->03-02-02',
  '07-01-02->03-02-03',
  '07-01-02->03-02-04',
  '07-01-02->03-05',
  '07-01-02->03-05-01',
  '07-01-02->03-05-02',
  '07-01-02->03-05-03',
  '07-01-02->DEC-02-01',
  '07-01-02->DEC-02-01-01',
  '07-01-02->DEC-02-01-02',
  '07-01-02->DEC-02-01-03',
  '07-01-02->DEC-05-01',
  '07-01-02->DEC-05-01-01',
  '07-01-02->DEC-05-01-02',
  '07-01-02->09-03',
  '07-01-02->09-03-01',
  '07-01-02->09-03-02',
  '07-04-01->03-02',
  '07-04-01->03-02-01',
  '07-04-01->03-02-02',
  '07-04-01->03-02-03',
  '07-04-01->03-02-04',
  '07-04-01->03-05',
  '07-04-01->03-05-01',
  '07-04-01->03-05-02',
  '07-04-01->03-05-03',
  '07-04-01->DEC-02-01',
  '07-04-01->DEC-02-01-01',
  '07-04-01->DEC-02-01-02',
  '07-04-01->DEC-02-01-03',
  '07-04-01->DEC-05-01',
  '07-04-01->DEC-05-01-01',
  '07-04-01->DEC-05-01-02',
  '07-04-01->FIR-03-01-02',
  '07-06-02->03-02',
  '07-06-02->03-02-01',
  '07-06-02->03-02-02',
  '07-06-02->03-02-03',
  '07-06-02->03-02-04',
  '07-06-02->03-05',
  '07-06-02->03-05-01',
  '07-06-02->03-05-02',
  '07-06-02->03-05-03',
  '07-06-02->DEC-02-01',
  '07-06-02->DEC-02-01-01',
  '07-06-02->DEC-02-01-02',
  '07-06-02->DEC-02-01-03',
  '07-06-02->DEC-05-01',
  '07-06-02->DEC-05-01-01',
  '07-06-02->DEC-05-01-02',
  '07-06-03->03-02',
  '07-06-03->03-02-01',
  '07-06-03->03-02-02',
  '07-06-03->03-02-03',
  '07-06-03->03-02-04',
  '07-06-03->03-05',
  '07-06-03->03-05-01',
  '07-06-03->03-05-02',
  '07-06-03->03-05-03',
  '07-06-03->DEC-02-01',
  '07-06-03->DEC-02-01-01',
  '07-06-03->DEC-02-01-02',
  '07-06-03->DEC-02-01-03',
  '07-06-03->DEC-05-01',
  '07-06-03->DEC-05-01-01',
  '07-06-03->DEC-05-01-02',
  'INT-01-01->03-05',
  'INT-01-01->03-05-01',
  'INT-01-01->03-05-02',
  'INT-01-01->03-05-03',
  'INT-01-01->DEC-02-01',
  'INT-01-01->DEC-02-01-01',
  'INT-01-01->DEC-02-01-02',
  'INT-01-01->DEC-02-01-03',
  'INT-01-01->DEC-05-01',
  'INT-01-01->DEC-05-01-01',
  'INT-01-01->DEC-05-01-02',
  'INT-01-01->FIR-05-01-02',
  'INT-01-01->INT-04-01-01',
  '06-16-01->03-02',
  '06-16-01->03-02-01',
  '06-16-01->03-02-02',
  '06-16-01->03-02-03',
  '06-16-01->03-02-04',
  '06-16-01->03-05',
  '06-16-01->03-05-01',
  '06-16-01->03-05-02',
  '06-16-01->03-05-03',
  '06-16-01->DEC-02-01',
  '06-16-01->DEC-02-01-01',
  '06-16-01->DEC-02-01-02',
  '06-16-01->DEC-02-01-03',
  '06-16-01->DEC-05-01',
  '06-16-01->DEC-05-01-01',
  '06-16-01->DEC-05-01-02',
  '06-17-01->03-02',
  '06-17-01->03-02-01',
  '06-17-01->03-02-02',
  '06-17-01->03-02-03',
  '06-17-01->03-02-04',
  '06-17-01->03-05',
  '06-17-01->03-05-01',
  '06-17-01->03-05-02',
  '06-17-01->03-05-03',
  '06-17-01->DEC-02-01',
  '06-17-01->DEC-02-01-01',
  '06-17-01->DEC-02-01-02',
  '06-17-01->DEC-02-01-03',
  '06-17-01->DEC-05-01',
  '06-17-01->DEC-05-01-01',
  '06-17-01->DEC-05-01-02',
  '06-16-04->03-02',
  '06-16-04->03-02-01',
  '06-16-04->03-02-02',
  '06-16-04->03-02-03',
  '06-16-04->03-02-04',
  '06-16-04->03-05',
  '06-16-04->03-05-01',
  '06-16-04->03-05-02',
  '06-16-04->03-05-03',
  '06-16-04->DEC-02-01',
  '06-16-04->DEC-02-01-01',
  '06-16-04->DEC-02-01-02',
  '06-16-04->DEC-02-01-03',
  '06-16-04->DEC-05-01',
  '06-16-04->DEC-05-01-01',
  '06-16-04->DEC-05-01-02',
  '06-18-04->03-02',
  '06-18-04->03-02-01',
  '06-18-04->03-02-02',
  '06-18-04->03-02-03',
  '06-18-04->03-02-04',
  '06-18-04->03-05',
  '06-18-04->03-05-01',
  '06-18-04->03-05-02',
  '06-18-04->03-05-03',
  '06-18-04->DEC-02-01',
  '06-18-04->DEC-02-01-01',
  '06-18-04->DEC-02-01-02',
  '06-18-04->DEC-02-01-03',
  '06-18-04->DEC-05-01',
  '06-18-04->DEC-05-01-01',
  '06-18-04->DEC-05-01-02',
  '06-18-06->03-02',
  '06-18-06->03-02-01',
  '06-18-06->03-02-02',
  '06-18-06->03-02-03',
  '06-18-06->03-02-04',
  '06-18-06->03-05',
  '06-18-06->03-05-01',
  '06-18-06->03-05-02',
  '06-18-06->03-05-03',
  '06-18-06->DEC-02-01',
  '06-18-06->DEC-02-01-01',
  '06-18-06->DEC-02-01-02',
  '06-18-06->DEC-02-01-03',
  '06-18-06->DEC-05-01',
  '06-18-06->DEC-05-01-01',
  '06-18-06->DEC-05-01-02',
  '06-01->DEC-05-01',
  '06-01->DEC-05-01-01',
  '06-01->DEC-05-01-02',
  '08-01->DEC-05-01',
  '08-01->DEC-05-01-01',
  '08-01->DEC-05-01-02',
  '07-01-09->03-02',
  '07-01-09->03-02-01',
  '07-01-09->03-02-02',
  '07-01-09->03-02-03',
  '07-01-09->03-02-04',
  '07-01-09->03-05',
  '07-01-09->03-05-01',
  '07-01-09->03-05-02',
  '07-01-09->03-05-03',
  '07-01-09->DEC-02-01',
  '07-01-09->DEC-02-01-01',
  '07-01-09->DEC-02-01-02',
  '07-01-09->DEC-02-01-03',
  '07-01-09->DEC-05-01',
  '07-01-09->DEC-05-01-01',
  '07-01-09->DEC-05-01-02',
  '07-05-09->03-02',
  '07-05-09->03-02-01',
  '07-05-09->03-02-02',
  '07-05-09->03-02-03',
  '07-05-09->03-02-04',
  '07-05-09->03-05',
  '07-05-09->03-05-01',
  '07-05-09->03-05-02',
  '07-05-09->03-05-03',
  '07-05-09->DEC-02-01',
  '07-05-09->DEC-02-01-01',
  '07-05-09->DEC-02-01-02',
  '07-05-09->DEC-02-01-03',
  '07-05-09->DEC-05-01',
  '07-05-09->DEC-05-01-01',
  '07-05-09->DEC-05-01-02',
  '08-05->03-02',
  '08-05->03-02-01',
  '08-05->03-02-02',
  '08-05->03-02-03',
  '08-05->03-02-04',
  '08-05->03-05',
  '08-05->03-05-01',
  '08-05->03-05-02',
  '08-05->03-05-03',
  '08-05->DEC-02-01',
  '08-05->DEC-02-01-01',
  '08-05->DEC-02-01-02',
  '08-05->DEC-02-01-03',
  '08-05->DEC-05-01',
  '08-05->DEC-05-01-01',
  '08-05->DEC-05-01-02',
  '08-18-05->03-02',
  '08-18-05->03-02-01',
  '08-18-05->03-02-02',
  '08-18-05->03-02-03',
  '08-18-05->03-02-04',
  '08-18-05->03-05',
  '08-18-05->03-05-01',
  '08-18-05->03-05-02',
  '08-18-05->03-05-03',
  '08-18-05->DEC-02-01',
  '08-18-05->DEC-02-01-01',
  '08-18-05->DEC-02-01-02',
  '08-18-05->DEC-02-01-03',
  '08-18-05->DEC-05-01',
  '08-18-05->DEC-05-01-01',
  '08-18-05->DEC-05-01-02',
  '06-05-06->03-02',
  '06-05-06->03-02-01',
  '06-05-06->03-02-02',
  '06-05-06->03-02-03',
  '06-05-06->03-02-04',
  '06-05-06->03-05',
  '06-05-06->03-05-01',
  '06-05-06->03-05-02',
  '06-05-06->03-05-03',
  '06-05-06->DEC-02-01',
  '06-05-06->DEC-02-01-01',
  '06-05-06->DEC-02-01-02',
  '06-05-06->DEC-02-01-03',
  '06-05-06->DEC-05-01',
  '06-05-06->DEC-05-01-01',
  '06-05-06->DEC-05-01-02',
  '05-06-01->03-02',
  '05-06-01->03-02-01',
  '05-06-01->03-02-02',
  '05-06-01->03-02-03',
  '05-06-01->03-02-04',
  '05-06-01->03-05',
  '05-06-01->03-05-01',
  '05-06-01->03-05-02',
  '05-06-01->03-05-03',
  '05-06-01->DEC-02-01',
  '05-06-01->DEC-02-01-01',
  '05-06-01->DEC-02-01-02',
  '05-06-01->DEC-02-01-03',
  '05-06-01->DEC-05-01',
  '05-06-01->DEC-05-01-01',
  '05-06-01->DEC-05-01-02',
  '06-06-06->03-02',
  '06-06-06->03-02-01',
  '06-06-06->03-02-02',
  '06-06-06->03-02-03',
  '06-06-06->03-02-04',
  '06-06-06->03-05',
  '06-06-06->03-05-01',
  '06-06-06->03-05-02',
  '06-06-06->03-05-03',
  '06-06-06->DEC-02-01',
  '06-06-06->DEC-02-01-01',
  '06-06-06->DEC-02-01-02',
  '06-06-06->DEC-02-01-03',
  '06-06-06->DEC-05-01',
  '06-06-06->DEC-05-01-01',
  '06-06-06->DEC-05-01-02',
])

const EXACT_BROAD_OR_FALSE_PARENT_CARRIER_L5_BACK_VALIDATION_EXCLUDED_EDGES = new Set([
  ...buildL3ParentCarrierEdges(
    EXACT_MEP_PARENT_FALSE_FINISH_CARRIER_CODES,
    HEAT_SOURCE_SAFETY_ACCESSORY_FALSE_FINISH_SUCCESSOR_CODES,
  ),
  '02-04->02-02',
  '02-04->02-02-04',
  '02-04->02-02-05',
  '02-04->04-01',
  '02-04->04-01-01',
  '02-04->04-03-01',
  '02-04->WPI-01-01-02',
  '02-04->03-09',
  '02-04->03-09-01',
  '02-04->FAC-01-01-01',
  '01-02-12->01-07',
  '01-02-12->01-07-01',
  '01-02-12->01-07-02',
  '01-02-12->01-07-03',
  '01-02-12->01-07-04',
  '01-02-12->01-07-05',
  '01-02-12->WPI-01-01-01',
  '04-01->ELV-01',
  '04-01->ELV-01-01',
  '04-01->ELV-01-01-01',
  '04-01->ELV-01-01-02',
  '04-01->ELV-01-01-03',
  '04-01->ELV-01-01-04',
  '04-01-02->ELV-01',
  '04-01-02->ELV-01-01',
  '04-01-02->ELV-01-01-01',
  '04-01-02->ELV-01-01-02',
  '04-01-02->ELV-01-01-03',
  '04-01-02->ELV-01-01-04',
  '04-01-03->ELV-01',
  '04-01-03->ELV-01-01',
  '04-01-03->ELV-01-01-01',
  '04-01-03->ELV-01-01-02',
  '04-01-03->ELV-01-01-03',
  '04-01-03->ELV-01-01-04',
  '03-04->03-03',
  '03-04->03-03-01',
  '03-04->03-03-02',
  '03-04->03-03-03',
  '03-04->03-08',
  '03-04->03-08-01',
  '03-04->03-08-02',
  '03-04->09-01',
  '03-04->09-01-01',
  '03-04->09-01-02',
  '03-04->09-01-03',
  '03-04->09-01-04',
  '03-04->09-01-05',
  '03-04->DEC-04',
  '03-04->DEC-04-01',
  '03-04->DEC-04-01-01',
  '03-04->WPI-02-01-02',
  '03-04-02->03-03',
  '03-04-02->03-03-01',
  '03-04-02->03-03-02',
  '03-04-02->03-03-03',
  '03-04-02->03-08',
  '03-04-02->03-08-01',
  '03-04-02->03-08-02',
  '03-04-02->09-01',
  '03-04-02->09-01-01',
  '03-04-02->09-01-02',
  '03-04-02->09-01-03',
  '03-04-02->09-01-04',
  '03-04-02->09-01-05',
  '03-04-02->DEC-04',
  '03-04-02->DEC-04-01',
  '03-04-02->DEC-04-01-01',
  '03-04-02->WPI-02-01-02',
  '06-02->03-02',
  '06-02->03-02-01',
  '06-02->03-02-02',
  '06-02->03-02-03',
  '06-02->03-02-04',
  '06-02->03-05',
  '06-02->03-05-01',
  '06-02->03-05-02',
  '06-02->03-05-03',
  '06-02->DEC-02-01',
  '06-02->DEC-02-01-01',
  '06-02->DEC-02-01-02',
  '06-02->DEC-02-01-03',
  '06-02->DEC-05-01',
  '06-02->DEC-05-01-01',
  '06-02->DEC-05-01-02',
  ...buildL3ParentCarrierEdges(
    [
      '03-04',
      '03-04-01',
      '03-04-02',
      '03-04-03',
      '03-04-04',
      '03-04-05',
      'FAC-03-01-01',
    ],
    [
      '03-03',
      '03-03-01',
      '03-03-02',
      '03-03-03',
      '03-08',
      '03-08-01',
      '03-08-02',
      '09-01',
      '09-01-01',
      '09-01-02',
      '09-01-03',
      '09-01-04',
      '09-01-05',
      'DEC-04',
      'DEC-04-01',
      'DEC-04-01-01',
      'WPI-02-01-02',
    ],
  ),
  'INT-03-01->FIR-05-01-02',
  'INT-03-01->INT-04-01-01',
  '07-05-06->03-02',
  '07-05-06->03-02-01',
  '07-05-06->03-02-02',
  '07-05-06->03-02-03',
  '07-05-06->03-02-04',
  '07-05-06->03-05',
  '07-05-06->03-05-01',
  '07-05-06->03-05-02',
  '07-05-06->03-05-03',
  '07-05-06->DEC-02-01',
  '07-05-06->DEC-02-01-01',
  '07-05-06->DEC-02-01-02',
  '07-05-06->DEC-02-01-03',
  '07-05-06->DEC-05-01',
  '07-05-06->DEC-05-01-01',
  '07-05-06->DEC-05-01-02',
  'PFB-01-01->PFB-02',
  'PFB-01-01->PFB-02-01',
  'PFB-01-01->PFB-02-01-01',
  'PFB-01-01->PFB-02-01-02',
  'PFB-01-01->PFB-02-01-03',
  'PFB-01-01->PFB-02-01-04',
  'PFB-01-01->PFB-02-01-05',
  'PFB-01-01-01->PFB-02',
  'PFB-01-01-01->PFB-02-01',
  'PFB-01-01-01->PFB-02-01-01',
  'PFB-01-01-01->PFB-02-01-02',
  'PFB-01-01-01->PFB-02-01-03',
  'PFB-01-01-01->PFB-02-01-04',
  'PFB-01-01-01->PFB-02-01-05',
  'PFB-01-01-02->PFB-02',
  'PFB-01-01-02->PFB-02-01',
  'PFB-01-01-02->PFB-02-01-01',
  'PFB-01-01-02->PFB-02-01-02',
  'PFB-01-01-02->PFB-02-01-03',
  'PFB-01-01-02->PFB-02-01-04',
  'PFB-01-01-02->PFB-02-01-05',
  'PFB-01-01-05->PFB-02',
  'PFB-01-01-05->PFB-02-01',
  'PFB-01-01-05->PFB-02-01-01',
  'PFB-01-01-05->PFB-02-01-02',
  'PFB-01-01-05->PFB-02-01-03',
  'PFB-01-01-05->PFB-02-01-04',
  'PFB-01-01-05->PFB-02-01-05',
  'PFB-01-01-06->PFB-02',
  'PFB-01-01-06->PFB-02-01',
  'PFB-01-01-06->PFB-02-01-01',
  'PFB-01-01-06->PFB-02-01-02',
  'PFB-01-01-06->PFB-02-01-03',
  'PFB-01-01-06->PFB-02-01-04',
  'PFB-01-01-06->PFB-02-01-05',
  'PFB-01-01-07->PFB-02',
  'PFB-01-01-07->PFB-02-01',
  'PFB-01-01-07->PFB-02-01-01',
  'PFB-01-01-07->PFB-02-01-02',
  'PFB-01-01-07->PFB-02-01-03',
  'PFB-01-01-07->PFB-02-01-05',
  'PFB-01-01-08->PFB-02',
  'PFB-01-01-08->PFB-02-01',
  'PFB-01-01-08->PFB-02-01-01',
  'PFB-01-01-08->PFB-02-01-02',
  'PFB-01-01-08->PFB-02-01-03',
  'PFB-01-01-08->PFB-02-01-04',
  'PFB-01-01-08->PFB-02-01-05',
  'PFB-01-01-09->PFB-02',
  'PFB-01-01-09->PFB-02-01',
  'PFB-01-01-09->PFB-02-01-01',
  'PFB-01-01-09->PFB-02-01-02',
  'PFB-01-01-09->PFB-02-01-03',
  'PFB-01-01-09->PFB-02-01-04',
  'PFB-01-01-09->PFB-02-01-05',
  'PFB-02->02-02',
  'PFB-02->02-02-01',
  'PFB-02->02-02-02',
  'PFB-02->02-02-03',
  'PFB-02->02-02-04',
  'PFB-02->02-02-05',
  'PFB-02-01-03->02-02',
  'PFB-02-01-03->02-02-01',
  'PFB-02-01-03->02-02-02',
  'PFB-02-01-03->02-02-03',
  'PFB-02-01-03->02-02-04',
  'PFB-02-01-03->02-02-05',
  'PFB-02-01-05->02-02',
  'PFB-02-01-05->02-02-01',
  'PFB-02-01-05->02-02-02',
  'PFB-02-01-05->02-02-03',
  'PFB-02-01-05->02-02-04',
  'PFB-02-01-05->02-02-05',
  '07-03->03-10',
  '07-03->03-10-01',
  '07-03->03-10-02',
  '07-03->03-10-03',
  'PLU-01-01->HVA-02-01-02',
  'PLU-01-01->PLU-06-01-01',
  'PLU-01-01->ELE-05-01-01',
  'PLU-02->HVA-02-01-02',
  'PLU-02->PLU-06-01-01',
  'PLU-02->ELE-05-01-01',
  'PLU-02-01->HVA-02-01-02',
  'PLU-02-01->PLU-06-01-01',
  'PLU-02-01->ELE-05-01-01',
  'PLU-02-01-01->PLU-06-01-01',
  'PLU-02-01-01->ELE-05-01-01',
  'PLU-04-01-01->HVA-02-01-02',
  'PLU-04-01-01->PLU-06-01-01',
  'PLU-04-01-01->ELE-05-01-01',
  'HVA-02-01-01->PLU-06-01-01',
  'HVA-02-01-01->ELE-05-01-01',
  'HVA-03-01->PLU-06-01-01',
  'HVA-03-01->ELE-05-01-01',
  'PLU-05->PLU-06-01-01',
  'PLU-05->ELE-05-01-01',
  'PLU-05-01->PLU-06-01-01',
  'PLU-05-01->ELE-05-01-01',
  'PLU-05-01-01->PLU-06-01-01',
  'PLU-05-01-01->ELE-05-01-01',
  'INT-03->FIR-05-01-02',
  'INT-03->INT-04-01-01',
  'INT-03-01-01->INT-04-01-01',
  'INT-03-01-03->INT-04-01-01',
  '08-18-01->03-02',
  '08-18-01->03-02-01',
  '08-18-01->03-02-02',
  '08-18-01->03-02-03',
  '08-18-01->03-02-04',
  '08-18-01->03-05',
  '08-18-01->03-05-01',
  '08-18-01->03-05-02',
  '08-18-01->03-05-03',
  '08-18-01->DEC-02-01',
  '08-18-01->DEC-02-01-01',
  '08-18-01->DEC-02-01-02',
  '08-18-01->DEC-02-01-03',
  '08-18-01->DEC-05-01',
  '08-18-01->DEC-05-01-01',
  '08-18-01->DEC-05-01-02',
  'MIC-02-01->MIC-03',
  'MIC-02-01->MIC-03-01',
  'MIC-02-01->MIC-03-01-01',
  'MIC-02-01->MIC-03-01-02',
  'MIC-02-01-02->MIC-03',
  'MIC-02-01-02->MIC-03-01',
  'MIC-02-01-02->MIC-03-01-01',
  'MIC-02->MIC-03',
  'MIC-02->MIC-03-01',
  'MIC-02->MIC-03-01-01',
  'MIC-02->MIC-03-01-02',
  '07-07->03-02',
  '07-07->03-02-01',
  '07-07->03-02-02',
  '07-07->03-02-03',
  '07-07->03-02-04',
  '07-07->03-05',
  '07-07->03-05-01',
  '07-07->03-05-02',
  '07-07->03-05-03',
  '07-07->DEC-02-01',
  '07-07->DEC-02-01-01',
  '07-07->DEC-02-01-02',
  '07-07->DEC-02-01-03',
  '07-07->DEC-05-01',
  '07-07->DEC-05-01-01',
  '07-07->DEC-05-01-02',
  '07-07-02->03-02',
  '07-07-02->03-02-01',
  '07-07-02->03-02-02',
  '07-07-02->03-02-03',
  '07-07-02->03-02-04',
  '07-07-02->03-05',
  '07-07-02->03-05-01',
  '07-07-02->03-05-02',
  '07-07-02->03-05-03',
  '07-07-02->DEC-02-01',
  '07-07-02->DEC-02-01-01',
  '07-07-02->DEC-02-01-02',
  '07-07-02->DEC-02-01-03',
  '07-07-02->DEC-05-01',
  '07-07-02->DEC-05-01-01',
  '07-07-02->DEC-05-01-02',
  '08-19->03-02',
  '08-19->03-02-01',
  '08-19->03-02-02',
  '08-19->03-02-03',
  '08-19->03-02-04',
  '08-19->03-05',
  '08-19->03-05-01',
  '08-19->03-05-02',
  '08-19->03-05-03',
  '08-19->DEC-02-01',
  '08-19->DEC-02-01-01',
  '08-19->DEC-02-01-02',
  '08-19->DEC-02-01-03',
  '08-19->DEC-05-01',
  '08-19->DEC-05-01-01',
  '08-19->DEC-05-01-02',
  '08-19-01->03-02',
  '08-19-01->03-02-01',
  '08-19-01->03-02-02',
  '08-19-01->03-02-03',
  '08-19-01->03-02-04',
  '08-19-01->03-05',
  '08-19-01->03-05-01',
  '08-19-01->03-05-02',
  '08-19-01->03-05-03',
  '08-19-01->DEC-02-01',
  '08-19-01->DEC-02-01-01',
  '08-19-01->DEC-02-01-02',
  '08-19-01->DEC-02-01-03',
  '08-19-01->DEC-05-01',
  '08-19-01->DEC-05-01-01',
  '08-19-01->DEC-05-01-02',
  '08-19-02->03-02',
  '08-19-02->03-02-01',
  '08-19-02->03-02-02',
  '08-19-02->03-02-03',
  '08-19-02->03-02-04',
  '08-19-02->03-05',
  '08-19-02->03-05-01',
  '08-19-02->03-05-02',
  '08-19-02->03-05-03',
  '08-19-02->DEC-02-01',
  '08-19-02->DEC-02-01-01',
  '08-19-02->DEC-02-01-02',
  '08-19-02->DEC-02-01-03',
  '08-19-02->DEC-05-01',
  '08-19-02->DEC-05-01-01',
  '08-19-02->DEC-05-01-02',
  '08-18-02->03-02',
  '08-18-02->03-02-01',
  '08-18-02->03-02-02',
  '08-18-02->03-02-03',
  '08-18-02->03-02-04',
  '08-18-02->03-05',
  '08-18-02->03-05-01',
  '08-18-02->03-05-02',
  '08-18-02->03-05-03',
  '08-18-02->DEC-02-01',
  '08-18-02->DEC-02-01-01',
  '08-18-02->DEC-02-01-02',
  '08-18-02->DEC-02-01-03',
  '08-18-02->DEC-05-01',
  '08-18-02->DEC-05-01-01',
  '08-18-02->DEC-05-01-02',
  'HVA-01-01-03->03-02',
  'HVA-01-01-03->03-02-01',
  'HVA-01-01-03->03-02-02',
  'HVA-01-01-03->03-02-03',
  'HVA-01-01-03->03-02-04',
  '06-03->03-02',
  '06-03->03-02-01',
  '06-03->03-02-02',
  '06-03->03-02-03',
  '06-03->03-02-04',
  '06-03->03-05',
  '06-03->03-05-01',
  '06-03->03-05-02',
  '06-03->03-05-03',
  '06-03->DEC-02-01',
  '06-03->DEC-02-01-01',
  '06-03->DEC-02-01-02',
  '06-03->DEC-02-01-03',
  '06-03->DEC-05-01',
  '06-03->DEC-05-01-01',
  '06-03->DEC-05-01-02',
  '06-20-03->03-02',
  '06-20-03->03-02-01',
  '06-20-03->03-02-02',
  '06-20-03->03-02-03',
  '06-20-03->03-02-04',
  '06-20-03->03-05',
  '06-20-03->03-05-01',
  '06-20-03->03-05-02',
  '06-20-03->03-05-03',
  '06-20-03->DEC-02-01',
  '06-20-03->DEC-02-01-01',
  '06-20-03->DEC-02-01-02',
  '06-20-03->DEC-02-01-03',
  '06-20-03->DEC-05-01',
  '06-20-03->DEC-05-01-01',
  '06-20-03->DEC-05-01-02',
  '06-20-01->03-02',
  '06-20-01->03-02-01',
  '06-20-01->03-02-02',
  '06-20-01->03-02-03',
  '06-20-01->03-02-04',
  '06-20-01->DEC-02-01',
  '06-20-01->DEC-02-01-02',
  '06-20-01->DEC-02-01-03',
  '06-20-01->DEC-05-01',
  '06-20-01->DEC-05-01-01',
  '06-20-01->DEC-05-01-02',
  'ELE-02-01-02->HVA-02-01-02',
  'ELE-02-01-02->PLU-06-01-01',
  'ELE-02-01-02->ELE-05-01-01',
])

const L2_EXACT_MANUAL_CURATED_DEPENDENCY_EDGE_RULE_IDS_EXCLUDED_FROM_L5_BACK_VALIDATION = new Map([
  ['01-03-01-P05->01-03-01-P06', ['support-pile-hole-quality-check-to-cage-install']],
  ['01-03-03-P05->01-03-03-P06', ['support-pile-hole-quality-check-to-cage-install']],
  ['02-04-03-P05->02-04-03-P06', ['weld-appearance-to-ndt-commission']],
  ['02-05-01-P05->02-05-01-P06', ['weld-appearance-to-ndt-commission']],
  ['03-08-01-P06->03-08-01-P07', ['joint-wipe-to-bond-strength-check']],
  ['03-08-02-P06->03-08-02-P07', ['joint-wipe-to-bond-strength-check']],
  ['03-08-01-P07->03-08-01-P08', ['bond-strength-check-to-corner-opening-closing']],
  ['03-08-02-P07->03-08-02-P08', ['bond-strength-check-to-corner-opening-closing']],
  ['03-10-01-P08->03-10-01-P09', ['finish-color-repair-to-appearance-handover']],
  ['03-10-02-P08->03-10-02-P09', ['finish-color-repair-to-appearance-handover']],
  ['03-10-03-P08->03-10-03-P09', ['finish-color-repair-to-appearance-handover']],
  ['03-09-02-P02->03-09-02-P03', ['setting-out-to-embedded-connector-review']],
  ['03-09-04-P02->03-09-04-P03', ['setting-out-to-embedded-connector-review']],
  ['03-09-02-P03->03-09-02-P04', ['embedded-connector-review-to-keel-install-adjust']],
  ['03-09-04-P03->03-09-04-P04', ['embedded-connector-review-to-keel-install-adjust']],
  ['02-04-03-P04->02-04-03-P05', ['welding-formal-to-weld-appearance-check']],
  ['02-05-01-P04->02-05-01-P05', ['welding-formal-to-weld-appearance-check']],
  ['02-03-01-P04->02-03-01-P05', ['welding-tack-preheat-to-formal-welding-interpass-record']],
  ['05-06-01-P04->05-06-01-P05', ['valve-meter-well-to-pressure-flush-disinfection']],
  ['05-06-02-P04->05-06-02-P05', ['valve-meter-well-to-pressure-flush-disinfection']],
  ['05-06-01-P06->05-06-01-P07', ['trench-backfill-to-hydrant-valve-marking']],
  ['05-06-02-P06->05-06-02-P07', ['trench-backfill-to-hydrant-valve-marking']],
  ['08-19-03-P01->08-19-03-P02', ['equipotential-scope-confirm-to-terminal-box-busbar-install']],
  ['08-19-03-P06->08-19-03-P07', ['lightning-ground-label-to-acceptance-record-review']],
  ['08-19-05-P07->08-19-05-P08', ['lightning-ground-label-to-acceptance-record-review']],
  ['10-01-05-P01->10-01-05-P02', ['elevator-landing-sill-to-door-post-header']],
  ['10-02-05-P01->10-02-05-P02', ['elevator-landing-sill-to-door-post-header']],
  ['10-01-05-P02->10-01-05-P03', ['elevator-door-post-header-to-door-cover']],
  ['10-02-05-P02->10-02-05-P03', ['elevator-door-post-header-to-door-cover']],
  ['10-01-13-P02->10-01-13-P03', ['elevator-slow-run-to-high-speed-run']],
  ['10-02-12-P02->10-02-12-P03', ['elevator-slow-run-to-high-speed-run']],
  ['SITE-01-01-03-P01->SITE-01-01-03-P02', ['r6-site-living-area-location-to-temporary-building-foundation']],
  ['04-01-04-P01-S01->04-01-04-P01-S02', ['generic-document-check-to-appearance-count']],
  ['01-02-08-P06-S03->01-02-08-P06-S04', ['stable-code-01-02-08-P06-S03-to-01-02-08-P06-S04']],
  ['02-01-02-P06->02-01-02-P07', ['rebar-cover-block-to-embed-review']],
  ['09-01-05-P06->09-01-05-P07', ['protection-layer-coordination-to-thickness-flatness-review']],
  ['04-02-01-P07->04-02-01-P08', ['protection-or-leveling-handover-to-insulation-acceptance']],
  ['09-01-04-P07->09-01-04-P08', ['protection-layer-to-thermal-thickness-review']],
  ['BDT-06-01-04-P06-S02->BDT-06-01-04-P06-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-06-01-04-P06-S01->BDT-06-01-04-P06-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HRT-04-01-01-P03-S02->HRT-04-01-01-P03-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HRT-04-01-01-P03-S01->HRT-04-01-01-P03-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DEC-01-02-01-P01-S02->DEC-01-02-01-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DEC-01-02-01-P01-S01->DEC-01-02-01-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['MUN-04-02-01-P02->MUN-04-02-01-P03', ['r6-municipal-protection-plan-to-utility-support-transfer']],
  ['MUN-04-02-01-P02-S02->MUN-04-02-01-P02-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MUN-04-02-01-P02-S01->MUN-04-02-01-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HRT-01-01-02-P09-S02->HRT-01-01-02-P09-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HRT-01-01-02-P09-S01->HRT-01-01-02-P09-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HTL-06-01-15-P08-S02->HTL-06-01-15-P08-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-06-01-15-P08-S01->HTL-06-01-15-P08-S02', ['r16-data-document-check-to-site-interface-review']],
  ['08-19-05-P04->08-19-05-P05', ['protective-wiring-grounding-to-upstream-protection-review']],
  ['TOD-04-01-25-P06-S02->TOD-04-01-25-P06-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['TOD-04-01-25-P06-S01->TOD-04-01-25-P06-S02', ['r16-data-document-check-to-site-interface-review']],
  ['TOD-04-01-07-P05-S01->TOD-04-01-07-P05-S02', ['r16-data-document-check-to-site-interface-review']],
  ['TOD-04-01-25-P09-S02->TOD-04-01-25-P09-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['TOD-04-01-25-P09-S01->TOD-04-01-25-P09-S02', ['r16-data-document-check-to-site-interface-review']],
  ['05-05-05-P03->05-05-05-P04', ['r6-electric-heating-insulation-to-heating-cable']],
  ['09-01-01-P04-S01->09-01-01-P04-S02', ['stable-code-09-01-01-P04-S01-to-09-01-01-P04-S02']],
  ['09-01-01-P04->09-01-01-P05', ['insulation-board-fix-to-fire-barrier']],
  ['09-01-02-P04->09-01-02-P05', ['insulation-install-to-air-water-tightness-detail']],
  ['03-09-02-P06->03-09-02-P07', ['insulation-firestop-to-metal-panel-install']],
  ['09-01-05-P04->09-01-05-P05', ['insulation-lay-to-edge-penetration-detail']],
  ['02-07-03-P06->02-07-03-P07', ['r6-insulation-fill-to-structure-acceptance']],
  ['09-02-04-P06-S02->09-02-04-P06-S03', ['stable-code-09-02-04-P06-S02-to-09-02-04-P06-S03']],
  ['09-02-01-P06->09-02-01-P07', ['insulation-work-to-heat-metering-balancing']],
  ['09-03-01-P02->09-03-01-P03', ['power-distribution-retest-to-equipment-install']],
  ['09-03-01-P07->09-03-01-P08', ['energy-meter-debug-to-energy-acceptance']],
  ['07-04-01-P04->07-04-01-P05', ['bus-cable-connect-to-secondary-circuit-review']],
  ['07-04-01-P02->07-04-01-P03', ['electrical-equipment-unboxing-to-position-fix']],
  ['08-19-05-P01->08-19-05-P02', ['surge-protector-spec-review-to-install-interface-confirm']],
  ['10-03-02-P04->10-03-02-P05', ['power-ground-maintenance-space-to-embedded-decoration-interface']],
  ['MIC-06-01-13-P02-S02->MIC-06-01-13-P02-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-13-P02-S01->MIC-06-01-13-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['SITE-04-01-05-P05-S02->SITE-04-01-05-P05-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['SITE-04-01-05-P05-S01->SITE-04-01-05-P05-S02', ['r16-data-document-check-to-site-interface-review']],
  ['MIC-06-01-22-P11-S02->MIC-06-01-22-P11-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-22-P11-S01->MIC-06-01-22-P11-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DCS-01-01-10-P02-S02->DCS-01-01-10-P02-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DCS-01-01-10-P02-S01->DCS-01-01-10-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DTC-02-02-02-P01-S01->DTC-02-02-02-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['06-18-06-P09-S01->06-18-06-P09-S02', ['stable-code-06-18-06-P09-S01-to-06-18-06-P09-S02']],
  ['CMP-05-01-16-P01-S02->CMP-05-01-16-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['CMP-05-01-16-P01-S01->CMP-05-01-16-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['BDT-05-01-02-P02-S02->BDT-05-01-02-P02-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-05-01-02-P02-S01->BDT-05-01-02-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['07-02-01-P05->07-02-01-P06', ['secondary-circuit-wiring-review-to-insulation-ground-test']],
  ['07-04-01-P05->07-04-01-P06', ['secondary-circuit-wiring-review-to-insulation-ground-test']],
  ['07-06-01-P05->07-06-01-P06', ['secondary-circuit-wiring-review-to-insulation-ground-test']],
  ['BDT-01-01-02-P01-S02->BDT-01-01-02-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-01-01-02-P01-S01->BDT-01-01-02-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['BDT-09-01-01-P05-S02->BDT-09-01-01-P05-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-09-01-01-P05-S01->BDT-09-01-01-P05-S02', ['r16-data-document-check-to-site-interface-review']],
  ['01-02-08-P07-S03->01-02-08-P07-S04', ['stable-code-01-02-08-P07-S03-to-01-02-08-P07-S04']],
  ['DTC-02-01-02-P01-S01->DTC-02-01-02-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['09-01-03-P05->09-01-03-P06', ['foam-seal-to-hardware-sash-debug']],
  ['06-07-02-P02->06-07-02-P03', ['valve-silencer-static-box-acceptance-to-part-clean-seal']],
  ['03-12-03-P01->03-12-03-P02', ['opening-base-flatness-review-to-sleeve-base-moisture-proof']],
  ['03-05-03-P08->03-05-03-P09', ['finish-panel-install-to-joint-appearance-review']],
  ['08-19-06-P04->08-19-06-P05', ['termination-crimp-shield-ground-to-bending-radius-fix-spacing']],
  ['06-07-02-P06->06-07-02-P07', ['port-seal-numbering-to-part-quality-handover']],
  ['08-19-03-P02->08-19-03-P03', ['terminal-box-busbar-to-equipment-shell-metal-tray-bonding']],
  ['08-19-02-P04->08-19-02-P05', ['terminal-crimp-lock-to-bonding-review']],
  ['CMP-05-01-30-P09-S02->CMP-05-01-30-P09-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['CMP-05-01-30-P09-S01->CMP-05-01-30-P09-S02', ['r16-data-document-check-to-site-interface-review']],
  ['CMP-05-01-30-P08-S02->CMP-05-01-30-P08-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['CMP-05-01-30-P08-S01->CMP-05-01-30-P08-S02', ['r16-data-document-check-to-site-interface-review']],
  ['FND-04-01-02-P09-S01->FND-04-01-02-P09-S02', ['r16-data-document-check-to-site-interface-review']],
  ['FIR-03-01-01-P01->FIR-03-01-01-P02', ['r6-fire-alarm-point-coding-to-cable-insulation-test']],
  ['05-01-04-P09-S01->05-01-04-P09-S02', ['stable-code-05-01-04-P09-S01-to-05-01-04-P09-S02']],
  ['08-15-06-P03->08-15-06-P04', ['alarm-zone-matrix-to-graphic-binding-test']],
  ['FIR-05-01-01-P07->FIR-05-01-01-P08', ['r6-fire-alarm-detection-config-to-rework-review']],
  ['08-15-03-P06->08-15-03-P07', ['alarm-confirm-light-zone-display-to-point-table-record']],
  ['08-15-05-P02->08-15-05-P03', ['box-interface-condition-to-field-device-wiring']],
  ['08-15-03-P04->08-15-03-P05', ['address-code-loop-register-to-detector-simulation-test']],
  ['08-15-03-P02->08-15-03-P03', ['base-wiring-to-detector-install-dust-protection']],
  ['08-15-05-P04->08-15-05-P05', ['address-code-linkage-register-to-single-action-feedback-test']],
  ['08-15-06-P01->08-15-06-P02', ['alarm-host-version-license-to-point-loop-import']],
  ['DCS-01-01-12-P06-S02->DCS-01-01-12-P06-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DCS-01-01-12-P06-S01->DCS-01-01-12-P06-S02', ['r16-data-document-check-to-site-interface-review']],
  ['08-15-06-P05->08-15-06-P06', ['backup-restore-permission-test-to-version-freeze']],
  ['DTC-04-01-30-P09-S02->DTC-04-01-30-P09-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DTC-04-01-30-P09-S01->DTC-04-01-30-P09-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DTC-04-01-02-P11-S02->DTC-04-01-02-P11-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DTC-04-01-02-P11-S01->DTC-04-01-02-P11-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DTC-04-01-01-P11-S02->DTC-04-01-01-P11-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DTC-04-01-01-P11-S01->DTC-04-01-01-P11-S02', ['r16-data-document-check-to-site-interface-review']],
  ['FND-02-01-04-P04-S01->FND-02-01-04-P04-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HTL-02-01-02-P05-S02->HTL-02-01-02-P05-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-02-01-02-P05-S01->HTL-02-01-02-P05-S02', ['r16-data-document-check-to-site-interface-review']],
  ['MIC-06-01-22-P08-S02->MIC-06-01-22-P08-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-22-P08-S01->MIC-06-01-22-P08-S02', ['r16-data-document-check-to-site-interface-review']],
  ['PLU-07-01-01-P05->PLU-07-01-01-P06', ['r6-drainage-emergency-power-pump-link-to-rainstorm-debug']],
  ['07-06-01-P04->07-06-01-P05', ['bus-cable-connect-to-secondary-circuit-review']],
  ['07-06-01-P02->07-06-01-P03', ['electrical-equipment-unboxing-to-position-fix']],
  ['07-02-01-P04->07-02-01-P05', ['bus-cable-connect-to-secondary-circuit-review']],
  ['07-02-01-P02->07-02-01-P03', ['electrical-equipment-unboxing-to-position-fix']],
  ['DTC-04-01-15-P02-S02->DTC-04-01-15-P02-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DTC-04-01-15-P02-S01->DTC-04-01-15-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DTC-04-01-11-P04-S02->DTC-04-01-11-P04-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DTC-04-01-11-P04-S01->DTC-04-01-11-P04-S02', ['r16-data-document-check-to-site-interface-review']],
  ['08-18-05-P07->08-18-05-P08', ['r6-label-asbuilt-to-structured-cabling-acceptance']],
  ['07-07-01-P08->07-07-01-P09', ['grounding-label-test-point-to-lightning-acceptance']],
  ['BDT-04-01-01-P01->BDT-04-01-01-P02', ['r7-standard-floor-control-line-to-wall-column-rebar']],
  ['BDT-04-01-01-P01-S02->BDT-04-01-01-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-04-01-01-P01-S01->BDT-04-01-01-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['CMP-05-01-03-P06-S02->CMP-05-01-03-P06-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['CMP-05-01-03-P06-S01->CMP-05-01-03-P06-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HTL-01-01-03-P01-S02->HTL-01-01-03-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-01-01-03-P01-S01->HTL-01-01-03-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HTL-06-01-02-P04-S02->HTL-06-01-02-P04-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-06-01-02-P04-S01->HTL-06-01-02-P04-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HTL-01-01-02-P04-S02->HTL-01-01-02-P04-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-01-01-02-P04-S01->HTL-01-01-02-P04-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HTL-01-01-03-P07-S02->HTL-01-01-03-P07-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-01-01-03-P07-S01->HTL-01-01-03-P07-S02', ['r16-data-document-check-to-site-interface-review']],
  ['04-02-03-P06->04-02-03-P07', ['surface-trim-node-close-to-protection-handover']],
  ['HRT-01-01-01-P09-S02->HRT-01-01-01-P09-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-17-P03-S02->MIC-06-01-17-P03-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-17-P03-S01->MIC-06-01-17-P03-S02', ['r16-data-document-check-to-site-interface-review']],
  ['03-07-01-P04->03-07-01-P05', ['stone-connector-or-bond-layer-to-stone-board-fix']],
  ['OUT-02-02-01-P03->OUT-02-02-01-P04', ['r15-light-pole-cable-acceptance-to-cable-luminaire-install']],
  ['DEC-05-01-01-P08->DEC-05-01-01-P09', ['r15-light-air-sprinkler-terminal-debug-to-public-area-handover']],
  ['ELE-06-01-01-P06->ELE-06-01-01-P07', ['r15-sign-light-storefront-closeout-to-circuit-scene-config']],
  ['03-05-02-P08->03-05-02-P09', ['finish-panel-install-to-joint-appearance-review']],
  ['09-03-02-P02->09-03-02-P03', ['luminaire-source-retest-to-luminaire-install']],
  ['08-19-07-P03->08-19-07-P04', ['equipotential-continuity-test-to-spd-status-test']],
  ['OUT-02-02-01-P01-S02->OUT-02-02-01-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['OUT-02-02-01-P01-S01->OUT-02-02-01-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['IBU-02-01-01-P04-S02->IBU-02-01-01-P04-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['IBU-02-01-01-P04-S01->IBU-02-01-01-P04-S02', ['r16-data-document-check-to-site-interface-review']],
  ['BDT-06-01-03-P03-S02->BDT-06-01-03-P03-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-06-01-03-P03-S01->BDT-06-01-03-P03-S02', ['r16-data-document-check-to-site-interface-review']],
  ['IBU-01-01-01-P03-S02->IBU-01-01-01-P03-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['IBU-01-01-01-P03-S01->IBU-01-01-01-P03-S02', ['r16-data-document-check-to-site-interface-review']],
  ['IBU-03-01-01-P01-S02->IBU-03-01-01-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['IBU-03-01-01-P01-S01->IBU-03-01-01-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['SITE-05-01-03-P01-S02->SITE-05-01-03-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['SITE-05-01-03-P01-S01->SITE-05-01-03-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['SITE-04-01-04-P01-S02->SITE-04-01-04-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['SITE-04-01-04-P01-S01->SITE-04-01-04-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['BDT-01-01-03-P07-S02->BDT-01-01-03-P07-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['BDT-01-01-03-P07-S01->BDT-01-01-03-P07-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DEC-02-01-02-P05-S02->DEC-02-01-02-P05-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['DEC-02-01-02-P05-S01->DEC-02-01-02-P05-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DEC-03A-01-01-P02-S01->DEC-03A-01-01-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DTC-02-01-01-P05-S01->DTC-02-01-01-P05-S02', ['r16-data-document-check-to-site-interface-review']],
  ['DTC-02-01-01-P07->DTC-02-01-01-P08', ['stable-code-DTC-02-01-01-P07-to-DTC-02-01-01-P08']],
  ['07-07-03-P01->07-07-03-P02', ['equipotential-box-position-to-room-connection-review']],
  ['07-07-03-P03->07-07-03-P04', ['equipotential-mainline-to-metal-pipe-equipment-bonding']],
  ['01-02-12-P02-S03->01-02-12-P02-S04', ['stable-code-01-02-12-P02-S03-to-01-02-12-P02-S04']],
  ['HTL-06-01-14-P01-S02->HTL-06-01-14-P01-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HTL-06-01-14-P01-S01->HTL-06-01-14-P01-S02', ['r16-data-document-check-to-site-interface-review']],
  ['03-05-01-P01->03-05-01-P02', ['suspended-ceiling-depth-to-hanger-position']],
  ['03-05-01-P03->03-05-01-P04', ['suspended-ceiling-hanger-install-to-main-keel-level']],
  ['03-05-02-P03->03-05-02-P04', ['suspended-ceiling-hanger-install-to-main-keel-level']],
  ['03-05-03-P03->03-05-03-P04', ['suspended-ceiling-hanger-install-to-main-keel-level']],
  ['03-05-01-P02->03-05-01-P03', ['suspended-ceiling-hanger-position-to-hanger-install']],
  ['MIC-06-01-14-P02-S02->MIC-06-01-14-P02-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-14-P02-S01->MIC-06-01-14-P02-S02', ['r16-data-document-check-to-site-interface-review']],
  ['MIC-06-01-14-P03-S02->MIC-06-01-14-P03-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-14-P03-S01->MIC-06-01-14-P03-S02', ['r16-data-document-check-to-site-interface-review']],
  ['01-02-07-P04->01-02-07-P05', ['pile-hoisting-feeding-to-pile-driving']],
  ['02-01-06-P11->02-01-06-P12', ['stable-code-02-01-06-P11-to-02-01-06-P12']],
  ['MIC-06-01-14-P06-S02->MIC-06-01-14-P06-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MIC-06-01-14-P06-S01->MIC-06-01-14-P06-S02', ['r16-data-document-check-to-site-interface-review']],
  ['MIC-04-01-01-P07-S02->MIC-04-01-01-P07-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['10-03-02-P03->10-03-02-P04', ['hoisting-access-safety-to-power-ground-maintenance-space']],
  ['MEP-02-01-02-P03-S02->MEP-02-01-02-P03-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['MEP-02-01-02-P03-S01->MEP-02-01-02-P03-S02', ['r16-data-document-check-to-site-interface-review']],
  ['HRT-01-01-01-P04-S02->HRT-01-01-01-P04-S03', ['r16-site-interface-review-to-sign-record-close']],
  ['HRT-01-01-01-P04-S01->HRT-01-01-01-P04-S02', ['r16-data-document-check-to-site-interface-review']],
  ['06-07-02-P04->06-07-02-P05', ['damper-fire-valve-direction-to-part-assembly-check']],
  ['08-16-05-P01-S04->08-16-05-P01-S05', ['stable-code-08-16-05-P01-S04-to-08-16-05-P01-S05']],
  ['08-18-08-P09-S02->08-18-08-P09-S03', ['stable-code-08-18-08-P09-S02-to-08-18-08-P09-S03']],
  ['09-01-02-P06->09-01-02-P07', ['firestop-coordination-to-thermal-airtightness-doc-review']],
  ['09-01-01-P05->09-01-01-P06', ['fire-barrier-to-anti-crack-mortar-mesh']],
  ['02-01-06-P14->02-01-06-P15', ['stable-code-02-01-06-P14-to-02-01-06-P15']],
  ['02-01-06-P21->02-01-06-P22', ['stable-code-02-01-06-P21-to-02-01-06-P22']],
  ['DTC-04-01-03-P07->DTC-04-01-03-P08', ['stable-code-DTC-04-01-03-P07-to-DTC-04-01-03-P08']],
  ['03-06-01-P07->03-06-01-P08', ['partition-crack-treatment-to-flatness-measure']],
  ['02-04-06-P03->02-04-06-P04', ['concrete-filled-steel-tube-equipment-check-to-concrete-pour']],
  ['09-02-04-P02->09-02-04-P03', ['valve-instrument-retest-to-pipe-install-slope-review']],
  ['09-01-05-P03->09-01-05-P04', ['moisture-isolation-layer-to-insulation-layer']],
  ['04-02-02-P06->04-02-02-P07', ['wind-moisture-protection-to-protection-layer-handover']],
  ['07-07-02-P07->07-07-02-P08', ['anticorrosion-label-to-continuity-test']],
  ['TOD-04-01-07-P05-S02->TOD-04-01-07-P05-S03', ['r16-site-interface-review-to-sign-record-close']],
])

const L2_EXACT_SAME_PARENT_CLOSEOUT_TAIL_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION = new Set([
  '10-01-02-P07->10-01-02-P08',
  '10-02-02-P07->10-02-02-P08',
  '10-03-02-P06->10-03-02-P07',
  '04-02-02-P07->04-02-02-P08',
  '04-02-03-P07->04-02-03-P08',
  'REN-02-01-03-P07->REN-02-01-03-P08',
  'REN-04-01-07-P07->REN-04-01-07-P08',
  '06-13-03-P07->06-13-03-P08',
  '06-14-03-P07->06-14-03-P08',
  '06-15-03-P07->06-15-03-P08',
  'BDT-06-01-04-P07->BDT-06-01-04-P08',
  'FIR-04-02-01-P01->FIR-04-02-01-P02',
])

const L2_EXACT_SAME_PARENT_ACTIVITY_STEP_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION = new Set([
  'BDT-05-01-01-P08-S01->BDT-05-01-01-P08-S02',
  'BDT-05-01-02-P08-S01->BDT-05-01-02-P08-S02',
  'BDT-05-01-01-P08-S02->BDT-05-01-01-P08-S03',
  'BDT-05-01-02-P08-S02->BDT-05-01-02-P08-S03',
  'BDT-05-01-01-P05-S01->BDT-05-01-01-P05-S02',
  'BDT-05-01-03-P03-S01->BDT-05-01-03-P03-S02',
  'BDT-05-01-01-P05-S02->BDT-05-01-01-P05-S03',
  'BDT-05-01-03-P03-S02->BDT-05-01-03-P03-S03',
  'IBU-01-02-01-P09-S01->IBU-01-02-01-P09-S02',
  'IKU-01-02-01-P09-S01->IKU-01-02-01-P09-S02',
  'IBU-01-02-01-P09-S02->IBU-01-02-01-P09-S03',
  'IKU-01-02-01-P09-S02->IKU-01-02-01-P09-S03',
  'RNV-04-01-15-P04-S04->RNV-04-01-15-P04-S05',
  'TOD-04-01-19-P02-S04->TOD-04-01-19-P02-S05',
  'PRT-01-01-03-P02-S01->PRT-01-01-03-P02-S02',
  'PRT-04-01-03-P02-S01->PRT-04-01-03-P02-S02',
  'PRT-01-01-03-P02-S02->PRT-01-01-03-P02-S03',
  'PRT-04-01-03-P02-S02->PRT-04-01-03-P02-S03',
  'IBU-03-01-07-P06-S01->IBU-03-01-07-P06-S02',
  'IKU-03-01-07-P06-S01->IKU-03-01-07-P06-S02',
  'IBU-03-01-07-P06-S02->IBU-03-01-07-P06-S03',
  'IKU-03-01-07-P06-S02->IKU-03-01-07-P06-S03',
  'IBU-03-01-06-P05-S01->IBU-03-01-06-P05-S02',
  'IKU-03-01-06-P05-S01->IKU-03-01-06-P05-S02',
  'IBU-03-01-06-P05-S02->IBU-03-01-06-P05-S03',
  'IKU-03-01-06-P05-S02->IKU-03-01-06-P05-S03',
  'IBU-03-01-06-P08-S01->IBU-03-01-06-P08-S02',
  'IKU-03-01-06-P08-S01->IKU-03-01-06-P08-S02',
  'IBU-03-01-06-P08-S02->IBU-03-01-06-P08-S03',
  'IKU-03-01-06-P08-S02->IKU-03-01-06-P08-S03',
  'IBU-03-01-06-P10-S01->IBU-03-01-06-P10-S02',
  'IKU-03-01-06-P10-S01->IKU-03-01-06-P10-S02',
  'IBU-03-01-06-P10-S02->IBU-03-01-06-P10-S03',
  'IKU-03-01-06-P10-S02->IKU-03-01-06-P10-S03',
  'UHR-01-01-03-P02-S01->UHR-01-01-03-P02-S02',
  'UHR-04-01-03-P02-S01->UHR-04-01-03-P02-S02',
  'UHR-01-01-03-P02-S02->UHR-01-01-03-P02-S03',
  'UHR-04-01-03-P02-S02->UHR-04-01-03-P02-S03',
  'FND-04-01-12-P05-S06->FND-04-01-12-P05-S07',
  'FND-04-01-16-P05-S06->FND-04-01-16-P05-S07',
  'FND-03-01-05-P06-S06->FND-03-01-05-P06-S07',
  'FND-04-01-02-P06-S06->FND-04-01-02-P06-S07',
  'FND-01-01-01-P04-S06->FND-01-01-01-P04-S07',
  'FND-01-01-04-P07-S06->FND-01-01-04-P07-S07',
  'DTC-04-01-33-P02-S06->DTC-04-01-33-P02-S07',
  'DTC-04-01-15-P07-S06->DTC-04-01-15-P07-S07',
  'DTC-04-01-33-P01-S06->DTC-04-01-33-P01-S07',
  'DTC-04-01-33-P11-S06->DTC-04-01-33-P11-S07',
  'DTC-04-01-21-P08-S06->DTC-04-01-21-P08-S07',
  'CMP-05-01-13-P09-S01->CMP-05-01-13-P09-S02',
  'CMP-05-01-13-P09-S02->CMP-05-01-13-P09-S03',
  '08-16-05-P01-S01->08-16-05-P01-S02',
  '08-16-01-P06-S01->08-16-01-P06-S02',
  '08-16-01-P05-S01->08-16-01-P05-S02',
  '08-16-05-P08-S01->08-16-05-P08-S02',
  '08-16-01-P03-S01->08-16-01-P03-S02',
  '08-16-01-P01-S01->08-16-01-P01-S02',
  '06-07-08-P02-S04->06-07-08-P02-S05',
  '02-04-02-P07-S01->02-04-02-P07-S02',
  'UTN-01-01-03-P05-S01->UTN-01-01-03-P05-S02',
  'UTN-03-01-05-P05-S01->UTN-03-01-05-P05-S02',
  'UTN-01-01-03-P05-S02->UTN-01-01-03-P05-S03',
  'UTN-03-01-05-P05-S02->UTN-03-01-05-P05-S03',
  'UTN-01-01-04-P02-S01->UTN-01-01-04-P02-S02',
  'UTN-03-01-06-P02-S01->UTN-03-01-06-P02-S02',
  'UTN-01-01-04-P02-S02->UTN-01-01-04-P02-S03',
  'UTN-03-01-06-P02-S02->UTN-03-01-06-P02-S03',
  'UTN-01-01-04-P04-S01->UTN-01-01-04-P04-S02',
  'UTN-03-01-06-P04-S01->UTN-03-01-06-P04-S02',
  'UTN-01-01-04-P04-S02->UTN-01-01-04-P04-S03',
  'UTN-03-01-06-P04-S02->UTN-03-01-06-P04-S03',
  'UHR-02-01-02-P07-S01->UHR-02-01-02-P07-S02',
  'UHR-04-01-05-P07-S01->UHR-04-01-05-P07-S02',
  'UHR-02-01-02-P07-S02->UHR-02-01-02-P07-S03',
  'UHR-04-01-05-P07-S02->UHR-04-01-05-P07-S03',
  'UHR-01-01-01-P04-S01->UHR-01-01-01-P04-S02',
  'UHR-04-01-01-P04-S01->UHR-04-01-01-P04-S02',
  'UHR-01-01-01-P04-S02->UHR-01-01-01-P04-S03',
  'UHR-04-01-01-P04-S02->UHR-04-01-01-P04-S03',
  'UHR-01-01-01-P06-S01->UHR-01-01-01-P06-S02',
  'UHR-04-01-01-P06-S01->UHR-04-01-01-P06-S02',
  'UHR-01-01-01-P06-S02->UHR-01-01-01-P06-S03',
  'UHR-04-01-01-P06-S02->UHR-04-01-01-P06-S03',
  'UHR-01-01-01-P07-S01->UHR-01-01-01-P07-S02',
  'UHR-04-01-01-P07-S01->UHR-04-01-01-P07-S02',
  'UHR-01-01-01-P07-S02->UHR-01-01-01-P07-S03',
  'UHR-04-01-01-P07-S02->UHR-04-01-01-P07-S03',
  'UHR-01-01-01-P07-S05->UHR-01-01-01-P07-S06',
  'UHR-04-01-01-P07-S05->UHR-04-01-01-P07-S06',
  'UHR-01-01-03-P07-S01->UHR-01-01-03-P07-S02',
  'UHR-04-01-03-P07-S01->UHR-04-01-03-P07-S02',
  'UHR-01-01-03-P07-S02->UHR-01-01-03-P07-S03',
  'UHR-04-01-03-P07-S02->UHR-04-01-03-P07-S03',
  'UHR-01-01-03-P07-S05->UHR-01-01-03-P07-S06',
  'UHR-04-01-03-P07-S05->UHR-04-01-03-P07-S06',
  'UHR-01-01-03-P02-S05->UHR-01-01-03-P02-S06',
  'UHR-04-01-03-P02-S05->UHR-04-01-03-P02-S06',
  'DANGER-01-01-12-P07-S02->DANGER-01-01-12-P07-S03',
  'DANGER-01-01-12-P07-S01->DANGER-01-01-12-P07-S02',
  'DANGER-01-01-12-P07-S03->DANGER-01-01-12-P07-S04',
  'DANGER-01-01-12-P01-S01->DANGER-01-01-12-P01-S02',
  'DANGER-01-01-12-P01-S02->DANGER-01-01-12-P01-S03',
  '01-02-11-P07-S02->01-02-11-P07-S03',
  '01-02-11-P07-S01->01-02-11-P07-S02',
  '01-02-11-P06-S02->01-02-11-P06-S03',
  'DTC-04-01-38-P11-S06->DTC-04-01-38-P11-S07',
  'DTC-04-01-38-P01-S05->DTC-04-01-38-P01-S06',
  'DTC-04-01-38-P01-S01->DTC-04-01-38-P01-S02',
  'SITE-04-01-03-P03-S02->SITE-04-01-03-P03-S03',
  'SITE-04-01-03-P03-S01->SITE-04-01-03-P03-S02',
  '08-18-08-P06-S03->08-18-08-P06-S04',
  '03-09-04-P07-S01->03-09-04-P07-S02',
  '08-18-09-P08-S02->08-18-09-P08-S03',
  'IBU-03-01-02-P09-S02->IBU-03-01-02-P09-S03',
  'IBU-03-01-02-P09-S01->IBU-03-01-02-P09-S02',
  '01-03-02-P02-S01->01-03-02-P02-S02',
  '01-03-02-P01-S01->01-03-02-P01-S02',
  '01-03-02-P05-S01->01-03-02-P05-S02',
  '01-03-02-P02-S02->01-03-02-P02-S03',
  '01-03-02-P04-S01->01-03-02-P04-S02',
  '01-03-02-P01-S02->01-03-02-P01-S03',
  'CMP-05-01-11-P09-S01->CMP-05-01-11-P09-S02',
  'CMP-05-01-11-P09-S02->CMP-05-01-11-P09-S03',
  'MIC-06-01-07-P08-S06->MIC-06-01-07-P08-S07',
  'MIC-06-01-11-P03-S06->MIC-06-01-11-P03-S07',
  'MIC-06-01-11-P10-S06->MIC-06-01-11-P10-S07',
  '03-01-03-P09-S01->03-01-03-P09-S02',
  '06-13-02-P02->06-13-02-P03',
  '06-15-02-P02->06-15-02-P03',
  'HRT-01-01-01-P09-S01->HRT-01-01-01-P09-S02',
  'BDT-04-01-02-P03-S01->BDT-04-01-02-P03-S02',
  'BDT-04-01-02-P03-S02->BDT-04-01-02-P03-S03',
  'DTC-04-01-16-P04-S06->DTC-04-01-16-P04-S07',
  'OUT-04-03-02-P04-S02->OUT-04-03-02-P04-S03',
  'OUT-04-03-02-P04-S01->OUT-04-03-02-P04-S02',
  '02-01-06-P06-S02->02-01-06-P06-S03',
  'HTL-06-01-15-P02-S02->HTL-06-01-15-P02-S03',
  'HTL-06-01-15-P02-S01->HTL-06-01-15-P02-S02',
  '06-06-02-P03-S02->06-06-02-P03-S03',
  '06-06-02-P03-S04->06-06-02-P03-S05',
  'DEC-03-01-02-P01-S02->DEC-03-01-02-P01-S03',
  'DEC-03-01-02-P01-S01->DEC-03-01-02-P01-S02',
  'HTL-06-01-01-P02-S02->HTL-06-01-01-P02-S03',
  'MUN-03-01-01-P04-S02->MUN-03-01-01-P04-S03',
  'MUN-03-01-01-P04-S01->MUN-03-01-01-P04-S02',
  'DEC-01-01-01-P06-S02->DEC-01-01-01-P06-S03',
  'DEC-01-01-01-P06-S01->DEC-01-01-01-P06-S02',
  'HRT-04-01-01-P02-S02->HRT-04-01-01-P02-S03',
  'HRT-04-01-01-P02-S01->HRT-04-01-01-P02-S02',
  'DTC-04-01-18-P03-S06->DTC-04-01-18-P03-S07',
  'DTC-04-01-17-P03-S06->DTC-04-01-17-P03-S07',
  '05-05-08-P05-S01->05-05-08-P05-S02',
  'DTC-04-01-23-P02-S06->DTC-04-01-23-P02-S07',
  'HRT-02-02-02-P01-S02->HRT-02-02-02-P01-S03',
  'HRT-02-02-02-P01-S01->HRT-02-02-02-P01-S02',
  'HRT-04-01-12-P01-S02->HRT-04-01-12-P01-S03',
  'HRT-04-01-12-P01-S01->HRT-04-01-12-P01-S02',
  'CMP-05-01-25-P07-S02->CMP-05-01-25-P07-S03',
  'CMP-05-01-25-P07-S01->CMP-05-01-25-P07-S02',
  'HTL-06-01-08-P01-S02->HTL-06-01-08-P01-S03',
  'HTL-06-01-08-P01-S01->HTL-06-01-08-P01-S02',
  'CMP-05-01-25-P04-S02->CMP-05-01-25-P04-S03',
  'CMP-05-01-25-P04-S01->CMP-05-01-25-P04-S02',
  'HTL-06-01-23-P01-S02->HTL-06-01-23-P01-S03',
  'HTL-06-01-23-P01-S01->HTL-06-01-23-P01-S02',
  'FND-04-01-04-P04-S06->FND-04-01-04-P04-S07',
  '01-05-01-P05-S02->01-05-01-P05-S03',
  'FND-02-01-03-P06-S06->FND-02-01-03-P06-S07',
  '01-03-06-P08-S01->01-03-06-P08-S02',
  'FND-04-01-04-P05-S06->FND-04-01-04-P05-S07',
  '06-20-01-P02-S03->06-20-01-P02-S04',
  'HRT-04-01-01-P09-S02->HRT-04-01-01-P09-S03',
  'HRT-04-01-01-P09-S01->HRT-04-01-01-P09-S02',
  '01-01-02-P02-S02->01-01-02-P02-S03',
  '01-01-04-P02-S02->01-01-04-P02-S03',
  '01-01-01-P02-S01->01-01-01-P02-S02',
  'FND-03-01-01-P07-S05->FND-03-01-01-P07-S06',
  'FND-03-01-01-P07-S01->FND-03-01-01-P07-S02',
  '09-01-02-P06-S01->09-01-02-P06-S02',
  'MIC-06-01-15-P04-S02->MIC-06-01-15-P04-S03',
  'CMP-05-01-26-P08-S02->CMP-05-01-26-P08-S03',
  'CMP-05-01-26-P08-S01->CMP-05-01-26-P08-S02',
  'FND-04-01-10-P02-S06->FND-04-01-10-P02-S07',
  'FND-04-01-10-P01-S05->FND-04-01-10-P01-S06',
  'FND-04-01-10-P01-S02->FND-04-01-10-P01-S03',
  'FND-04-01-10-P01-S01->FND-04-01-10-P01-S02',
  'MIC-01-01-01-P10-S05->MIC-01-01-01-P10-S06',
  'MIC-01-01-01-P10-S02->MIC-01-01-01-P10-S03',
  'MIC-01-01-01-P10-S01->MIC-01-01-01-P10-S02',
  'MIC-06-01-01-P10-S06->MIC-06-01-01-P10-S07',
  'HRT-04-01-02-P01-S02->HRT-04-01-02-P01-S03',
  'HRT-04-01-02-P01-S01->HRT-04-01-02-P01-S02',
  'BDT-04-01-01-P08-S02->BDT-04-01-01-P08-S03',
  'BDT-04-01-01-P08-S01->BDT-04-01-01-P08-S02',
  'DTC-04-01-10-P01-S05->DTC-04-01-10-P01-S06',
  'DTC-04-01-10-P01-S02->DTC-04-01-10-P01-S03',
  'DTC-04-01-10-P01-S01->DTC-04-01-10-P01-S02',
  'DTC-04-01-09-P01-S05->DTC-04-01-09-P01-S06',
  'DTC-04-01-09-P01-S02->DTC-04-01-09-P01-S03',
  'DTC-04-01-09-P01-S01->DTC-04-01-09-P01-S02',
  'DTC-02-01-02-P12-S05->DTC-02-01-02-P12-S06',
  'DTC-02-01-02-P12-S01->DTC-02-01-02-P12-S02',
  'DTC-02-01-02-P09-S05->DTC-02-01-02-P09-S06',
  'DTC-02-01-02-P09-S01->DTC-02-01-02-P09-S02',
  'FND-04-01-02-P09-S05->FND-04-01-02-P09-S06',
  '09-01-02-P06-S02->09-01-02-P06-S03',
  'DTC-01-01-01-P05-S06->DTC-01-01-01-P05-S07',
  'DTC-04-01-13-P09-S05->DTC-04-01-13-P09-S06',
  'DTC-04-01-13-P09-S02->DTC-04-01-13-P09-S03',
  'DTC-04-01-13-P09-S01->DTC-04-01-13-P09-S02',
])

const L2_EXACT_SAME_PARENT_STABLE_CODE_DEPENDENCY_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION = new Set([
  'DTC-04-01-12-P03->DTC-04-01-12-P04',
  'DTC-04-01-12-P03-S06->DTC-04-01-12-P03-S07',
  'DTC-04-01-12-P01->DTC-04-01-12-P02',
  'ICR-04-02-01-P04->ICR-04-02-01-P05',
  'ICR-05-01-16-P06->ICR-05-01-16-P07',
  'ICR-05-01-01-P05->ICR-05-01-01-P06',
  'ICR-01-01-01-P06->ICR-01-01-01-P07',
  'MIC-06-01-02-P03->MIC-06-01-02-P04',
  'MIC-06-01-02-P03->MIC-06-01-02-P05',
  'MIC-06-01-02-P03-S06->MIC-06-01-02-P03-S07',
  '08-01-01-P04->08-01-01-P05',
  '08-09-04-P01->08-09-04-P02',
  '08-09-02-P01->08-09-02-P02',
  '08-09-03-P01->08-09-03-P02',
  '08-09-05-P01->08-09-05-P02',
  'HTL-02-01-01-P05->HTL-02-01-01-P06',
  'HTL-02-01-01-P05-S02->HTL-02-01-01-P05-S03',
  'HTL-02-01-01-P05-S01->HTL-02-01-01-P05-S02',
  'DEC-05-01-01-P01->DEC-05-01-01-P02',
  'DEC-05-01-01-P01-S02->DEC-05-01-01-P01-S03',
  'DEC-05-01-01-P01-S01->DEC-05-01-01-P01-S02',
  'QR-01-01-20-P05->QR-01-01-20-P06',
  'ICR-05-01-02-P08->ICR-05-01-02-P09',
  '08-09-01-P04->08-09-01-P05',
  '08-09-01-P04-S01->08-09-01-P04-S02',
  '08-09-04-P02->08-09-04-P03',
  '08-09-02-P04->08-09-02-P05',
  '08-09-05-P05->08-09-05-P06',
  '06-05-06-P03->06-05-06-P04',
  '06-06-06-P03->06-06-06-P04',
  'DEC-05-01-02-P01-S02->DEC-05-01-02-P01-S03',
  'DEC-05-01-02-P01-S01->DEC-05-01-02-P01-S02',
  'HTL-02-01-02-P04->HTL-02-01-02-P05',
  'CMP-02-01-02-P04->CMP-02-01-02-P05',
  'DEC-08-01-01-P07->DEC-08-01-01-P08',
  'RNV-04-01-23-P06->RNV-04-01-23-P07',
  'ELE-05-01-01-P08->ELE-05-01-01-P09',
  'ELE-05-01-01-P01->ELE-05-01-01-P02',
  '07-03-06-P01->07-03-06-P02',
  '07-03-04-P03->07-03-04-P04',
  '07-03-07-P01->07-03-07-P02',
  '07-03-05-P01->07-03-05-P02',
  '07-03-05-P03->07-03-05-P04',
  '07-03-06-P03->07-03-06-P04',
  '07-03-08-P06->07-03-08-P07',
  '07-03-08-P03->07-03-08-P04',
  '07-03-08-P01->07-03-08-P02',
  '07-03-01-P02->07-03-01-P03',
  '05-05-05-P01->05-05-05-P02',
  'FND-06-01-02-P03->FND-06-01-02-P04',
  'FND-06-01-02-P03-S06->FND-06-01-02-P03-S07',
  '06-05-08-P04->06-05-08-P05',
  '06-05-06-P04->06-05-06-P05',
  '05-08-01-P04->05-08-01-P05',
  '05-05-07-P04->05-05-07-P05',
  '09-02-03-P05->09-02-03-P06',
  '05-05-03-P05->05-05-03-P06',
  'DTC-04-01-09-P03->DTC-04-01-09-P04',
  'FND-04-01-03-P02-S06->FND-04-01-03-P02-S07',
  '05-08-01-P03->05-08-01-P04',
  '05-08-01-P03-S02->05-08-01-P03-S03',
  'PFB-03-01-01-P01->PFB-03-01-01-P02',
  'STL-04-01-12-P02->STL-04-01-12-P03',
  'PFB-00-01-02-P14->PFB-00-01-02-P15',
  'HRT-04-01-02-P02->HRT-04-01-02-P03',
  '02-05-04-P06->02-05-04-P07',
  'STL-04-01-09-P08->STL-04-01-09-P09',
  'STL-01-01-01-P06->STL-01-01-01-P07',
  'PFB-03-01-03-P01->PFB-03-01-03-P02',
  'PFB-00-01-01-P04->PFB-00-01-01-P05',
  'PFB-00-01-01-P04->PFB-00-01-01-P06',
  'HRT-04-01-01-P06->HRT-04-01-01-P07',
  'STL-01-01-01-P04->STL-01-01-01-P05',
  'STL-01-01-01-P07->STL-01-01-01-P08',
  'HRT-04-01-02-P07->HRT-04-01-02-P08',
  'HRT-04-01-02-P07-S02->HRT-04-01-02-P07-S03',
  'HRT-04-01-02-P07-S01->HRT-04-01-02-P07-S02',
  'PFB-00-01-03-P09->PFB-00-01-03-P10',
  'PFB-04-01-04-P01->PFB-04-01-04-P02',
  'PFB-03-01-03-P02->PFB-03-01-03-P03',
  'PFB-03-01-03-P02->PFB-03-01-03-P04',
  'STL-04-01-08-P06->STL-04-01-08-P07',
  'HRT-04-01-02-P08->HRT-04-01-02-P09',
  'RNV-04-01-09-P01->RNV-04-01-09-P02',
  'STL-04-01-03-P01->STL-04-01-03-P02',
  'PFB-04-01-03-P05->PFB-04-01-03-P06',
  'HRT-04-01-02-P04->HRT-04-01-02-P05',
  'PFB-01-01-02-P08->PFB-01-01-02-P10',
  'PFB-00-01-01-P03->PFB-00-01-01-P04',
  'PFB-04-01-13-P02->PFB-04-01-13-P03',
  'PFB-04-01-01-P01->PFB-04-01-01-P02',
  'PFB-01-01-01-P02->PFB-01-01-01-P03',
  'STL-01-01-01-P03->STL-01-01-01-P04',
  'STL-04-01-12-P07->STL-04-01-12-P08',
  'DTC-04-01-09-P03-S06->DTC-04-01-09-P03-S07',
  '06-10-06-P08->06-10-06-P09',
  '05-05-09-P01->05-05-09-P02',
  'DTC-04-01-28-P03->DTC-04-01-28-P04',
  'DTC-04-01-28-P03-S06->DTC-04-01-28-P03-S07',
  'DTC-04-01-25-P08->DTC-04-01-25-P09',
  'DTC-04-01-25-P08-S06->DTC-04-01-25-P08-S07',
  '06-17-05-P08->06-17-05-P09',
  '05-08-06-P02->05-08-06-P03',
  '05-08-03-P01->05-08-03-P02',
  'CLN-04-01-40-P03->CLN-04-01-40-P04',
  'CLN-04-01-40-P03->CLN-04-01-40-P05',
  'CLN-04-01-06-P04->CLN-04-01-06-P05',
  '03-07-02-P07->03-07-02-P08',
  '03-01-03-P06-S01->03-01-03-P06-S02',
  '03-01-03-P06->03-01-03-P07',
  'DEC-01-01-01-P08->DEC-01-01-01-P09',
  '02-02-03-P05->02-02-03-P06',
  '01-06-01-P06-S02->01-06-01-P06-S03',
  'FND-04-01-03-P02->FND-04-01-03-P03',
  'STL-04-01-06-P03->STL-04-01-06-P04',
  '02-05-04-P03->02-05-04-P04',
  '02-02-01-P05->02-02-01-P06',
  'BDT-01-01-02-P05->BDT-01-01-02-P06',
  'PFB-04-01-01-P03->PFB-04-01-01-P04',
  'PFB-04-01-01-P03->PFB-04-01-01-P06',
  '02-04-05-P04->02-04-05-P05',
  '02-04-05-P04-S02->02-04-05-P04-S03',
  '02-04-05-P01->02-04-05-P02',
  '05-08-03-P03->05-08-03-P04',
  '07-05-05-P04->07-05-05-P05',
  '04-04-01-P06->04-04-01-P07',
  '05-08-01-P06->05-08-01-P07',
  'STL-04-01-13-P03->STL-04-01-13-P04',
  'DEC-02-02-02-P06->DEC-02-02-02-P08',
  'RNV-04-01-08-P06->RNV-04-01-08-P07',
  'FND-04-01-02-P04->FND-04-01-02-P05',
  'FND-04-01-02-P04-S06->FND-04-01-02-P04-S07',
  '01-01-07-P07->01-01-07-P08',
  '08-15-04-P06->08-15-04-P07',
  '06-18-07-P07->06-18-07-P08',
  '08-18-10-P07->08-18-10-P08',
  '08-05-08-P03->08-05-08-P04',
  '08-04-06-P03->08-04-06-P04',
  '08-03-05-P05->08-03-05-P06',
  '08-13-05-P05->08-13-05-P06',
  '08-17-04-P04->08-17-04-P05',
  'HTL-06-01-15-P05->HTL-06-01-15-P06',
  'FAC-02-01-01-P02->FAC-02-01-01-P03',
  '04-04-01-P03->04-04-01-P04',
  'FND-03-01-03-P10-S06->FND-03-01-03-P10-S07',
  'MIC-04-01-02-P01->MIC-04-01-02-P02',
  'MIC-04-01-02-P01-S06->MIC-04-01-02-P01-S07',
  '01-03-05-P02->01-03-05-P03',
  'BDT-06-01-03-P03->BDT-06-01-03-P04',
  'RNV-04-01-10-P02->RNV-04-01-10-P03',
  '10-01-02-P02->10-01-02-P03',
  '10-02-02-P02->10-02-02-P03',
  'IBU-01-01-01-P03->IBU-01-01-01-P04',
  'IBU-01-01-01-P03->IBU-01-01-01-P05',
  'IBU-03-01-01-P01->IBU-03-01-01-P02',
  'IBU-03-01-01-P07->IBU-03-01-01-P08',
  'DEC-02-01-02-P05->DEC-02-01-02-P06',
  '02-03-10-P05->02-03-10-P06',
  'DCS-01-01-11-P04->DCS-01-01-11-P05',
  'DEC-03A-01-01-P02->DEC-03A-01-01-P03',
  'DEC-03A-01-01-P02->DEC-03A-01-01-P05',
  'CLN-02-01-02-P02->CLN-02-01-02-P03',
  'FIR-03-02-01-P07->FIR-03-02-01-P08',
  'PFB-04-01-13-P06->PFB-04-01-13-P07',
  'DTC-04-01-28-P08->DTC-04-01-28-P09',
  'DTC-04-01-28-P08-S06->DTC-04-01-28-P08-S07',
  'STL-02-01-02-P08->STL-02-01-02-P09',
  '06-10-01-P08->06-10-01-P09',
  '06-10-09-P06->06-10-09-P07',
  '06-10-08-P08->06-10-08-P09',
  'INT-04-01-01-P02->INT-04-01-01-P03',
  'INT-04-01-01-P02->INT-04-01-01-P05',
  '08-18-08-P05->08-18-08-P06',
  'DTC-01-01-01-P05->DTC-01-01-01-P06',
  '08-18-08-P03->08-18-08-P04',
  '08-18-08-P04->08-18-08-P05',
  'ICR-05-01-09-P04->ICR-05-01-09-P05',
  'ICR-05-01-09-P04->ICR-05-01-09-P06',
  'ICR-02-01-01-P04->ICR-02-01-01-P05',
  'ICR-02-02-01-P05->ICR-02-02-01-P06',
  'CLN-04-01-03-P03->CLN-04-01-03-P04',
  'ICR-05-01-21-P02->ICR-05-01-21-P03',
  'CLN-04-01-40-P04->CLN-04-01-40-P05',
  'CLN-04-01-03-P07->CLN-04-01-03-P08',
  '06-04-01-P05->06-04-01-P06',
  '06-04-03-P06->06-04-03-P07',
  '06-03-04-P01->06-03-04-P02',
  '06-03-04-P02->06-03-04-P03',
  '06-03-05-P02->06-03-05-P03',
  '06-03-05-P04->06-03-05-P05',
  '06-03-05-P05->06-03-05-P06',
  '06-03-05-P06->06-03-05-P07',
  '06-03-07-P01->06-03-07-P02',
  '06-05-01-P05->06-05-01-P06',
  '06-06-01-P05->06-06-01-P06',
  '08-15-07-P05->08-15-07-P06',
  'BDT-01-01-05-P04->BDT-01-01-05-P05',
  'FIR-03-02-01-P02->FIR-03-02-01-P03',
  'FIR-03-02-01-P02->FIR-03-02-01-P05',
  'FIR-02-01-01-P01->FIR-02-01-01-P02',
  'FIR-05-01-01-P06->FIR-05-01-01-P07',
  'FIR-05-01-01-P06->FIR-05-01-01-P08',
  '06-03-02-P04-S01->06-03-02-P04-S02',
  'CLN-04-01-32-P01->CLN-04-01-32-P02',
  'CMP-05-01-17-P03->CMP-05-01-17-P04',
  'CMP-05-01-17-P07->CMP-05-01-17-P08',
  'PLU-05-01-01-P06->PLU-05-01-01-P07',
  'PLU-05-01-01-P06->PLU-05-01-01-P08',
  'IBU-01-02-01-P04->IBU-01-02-01-P05',
  '04-02-05-P01->04-02-05-P02',
  'IBU-03-01-01-P04->IBU-03-01-01-P05',
  'IBU-01-01-02-P07->IBU-01-01-02-P08',
  'IBU-03-01-01-P02->IBU-03-01-01-P03',
  'IBU-03-01-01-P06->IBU-03-01-01-P07',
  'IBU-01-01-02-P01->IBU-01-01-02-P02',
  'BDT-09-01-01-P07->BDT-09-01-01-P08',
  'MIC-06-01-06-P06->MIC-06-01-06-P07',
  'MEP-02-01-01-P06->MEP-02-01-01-P08',
  'RNV-04-01-15-P04->RNV-04-01-15-P05',
  'TOD-04-01-19-P02->TOD-04-01-19-P03',
  'HTL-04-01-01-P02->HTL-04-01-01-P03',
  '01-07-01-P01->01-07-01-P02',
  'BDT-06-01-04-P04->BDT-06-01-04-P05',
  'RNV-04-01-14-P07->RNV-04-01-14-P08',
  '02-01-06-P22-S02->02-01-06-P22-S03',
  'PFB-02-01-04-P10->PFB-02-01-04-P11',
  'OUT-02-02-01-P05->OUT-02-02-01-P06',
  '07-01-09-P05->07-01-09-P06',
  'STL-04-01-25-P05->STL-04-01-25-P06',
  'STL-04-01-25-P05->STL-04-01-25-P07',
  'BDT-06-01-04-P02->BDT-06-01-04-P03',
  'BDT-06-01-04-P02->BDT-06-01-04-P05',
  'BDT-06-01-04-P03->BDT-06-01-04-P04',
  'BDT-06-01-04-P01->BDT-06-01-04-P02',
  '10-02-09-P04->10-02-09-P05',
  'DTC-04-01-36-P03-S06->DTC-04-01-36-P03-S07',
  'DTC-04-01-36-P09-S06->DTC-04-01-36-P09-S07',
  'DTC-04-01-36-P01-S06->DTC-04-01-36-P01-S07',
  'SITE-04-01-04-P05-S02->SITE-04-01-04-P05-S03',
  'SITE-04-01-04-P05-S01->SITE-04-01-04-P05-S02',
  'PLU-07-01-01-P07->PLU-07-01-01-P08',
  'TOD-04-01-05-P03->TOD-04-01-05-P04',
  'RNV-04-01-22-P02->RNV-04-01-22-P03',
  '03-04-05-P07->03-04-05-P08',
  '06-02-08-P04->06-02-08-P05',
  'DEC-05-01-02-P07->DEC-05-01-02-P08',
  'HTL-06-01-19-P07->HTL-06-01-19-P08',
  'HTL-06-01-19-P03->HTL-06-01-19-P04',
  'CMP-05-01-13-P03->CMP-05-01-13-P04',
  'CMP-05-01-13-P06->CMP-05-01-13-P07',
  'DTC-04-01-20-P06->DTC-04-01-20-P07',
  'DTC-04-01-20-P06-S06->DTC-04-01-20-P06-S07',
  '08-04-04-P02->08-04-04-P03',
  '08-08-03-P04->08-08-03-P05',
  'CLN-04-01-27-P01->CLN-04-01-27-P02',
  'CLN-03-01-01-P01->CLN-03-01-01-P02',
  'CLN-03-01-01-P03->CLN-03-01-01-P04',
  'CLN-03-01-01-P03->CLN-03-01-01-P08',
  'CLN-04-01-34-P08->CLN-04-01-34-P09',
  'CLN-04-01-34-P08->CLN-04-01-34-P10',
  'CLN-03-01-01-P04->CLN-03-01-01-P05',
  'DEC-01-01-01-P05->DEC-01-01-01-P06',
  'DEC-01-01-01-P05-S02->DEC-01-01-01-P05-S03',
  'DEC-01-01-01-P05-S01->DEC-01-01-01-P05-S02',
  '05-10-06-P06->05-10-06-P07',
  '05-10-01-P05->05-10-01-P06',
  'ICR-05-01-12-P02->ICR-05-01-12-P03',
  'RNV-04-01-03-P05->RNV-04-01-03-P06',
  'RNV-04-01-03-P08->RNV-04-01-03-P09',
  'ICR-05-01-19-P01->ICR-05-01-19-P02',
  'CMP-02-01-03-P07-S02->CMP-02-01-03-P07-S03',
  'CMP-02-01-03-P07-S01->CMP-02-01-03-P07-S02',
  'CMP-05-01-04-P05->CMP-05-01-04-P06',
  'CLN-04-01-37-P03->CLN-04-01-37-P04',
  'SITE-05-01-02-P01-S02->SITE-05-01-02-P01-S03',
  'SITE-05-01-02-P01-S01->SITE-05-01-02-P01-S02',
  'OUT-02-01-01-P02->OUT-02-01-01-P03',
  'OUT-02-01-01-P02->OUT-02-01-01-P05',
  'MUN-02-01-01-P02->MUN-02-01-01-P03',
  'MUN-02-01-01-P02->MUN-02-01-01-P05',
  'OUT-04-01-04-P01-S02->OUT-04-01-04-P01-S03',
  'OUT-04-01-04-P01-S01->OUT-04-01-04-P01-S02',
  'DTC-04-01-30-P01->DTC-04-01-30-P02',
  'DTC-04-01-30-P01-S05->DTC-04-01-30-P01-S06',
  'DTC-04-01-30-P01-S02->DTC-04-01-30-P01-S03',
  'DTC-04-01-30-P01-S01->DTC-04-01-30-P01-S02',
  'DTC-04-01-30-P03->DTC-04-01-30-P04',
  'DTC-04-01-30-P03-S05->DTC-04-01-30-P03-S06',
  'DTC-04-01-30-P03-S01->DTC-04-01-30-P03-S02',
  'ICR-04-02-01-P07->ICR-04-02-01-P08',
  'ICR-05-01-04-P04->ICR-05-01-04-P05',
  'DCS-01-01-07-P02-S02->DCS-01-01-07-P02-S03',
  'DCS-01-01-07-P02-S01->DCS-01-01-07-P02-S02',
  'DTC-04-01-26-P05-S06->DTC-04-01-26-P05-S07',
  'BDT-08-01-03-P01-S02->BDT-08-01-03-P01-S03',
  'BDT-08-01-03-P01-S01->BDT-08-01-03-P01-S02',
  'ICR-05-01-05-P08->ICR-05-01-05-P09',
  'STL-04-01-21-P04->STL-04-01-21-P05',
  'ICR-05-01-02-P04->ICR-05-01-02-P05',
  'DTC-04-01-18-P05-S06->DTC-04-01-18-P05-S07',
  'ICR-05-01-05-P03->ICR-05-01-05-P04',
  'ICR-05-01-01-P02->ICR-05-01-01-P03',
  'HTL-02-01-01-P04->HTL-02-01-01-P05',
  'OUT-04-01-04-P06-S02->OUT-04-01-04-P06-S03',
  'OUT-04-01-04-P06-S01->OUT-04-01-04-P06-S02',
  'DEC-03-02-01-P05->DEC-03-02-01-P06',
  '01-03-01-P08->01-03-01-P09',
  'FND-04-01-07-P01->FND-04-01-07-P02',
  'FND-04-01-07-P01-S05->FND-04-01-07-P01-S06',
  'FND-04-01-07-P01-S02->FND-04-01-07-P01-S03',
  'FND-04-01-07-P01-S01->FND-04-01-07-P01-S02',
  '01-03-01-P09->01-03-01-P10',
  'FND-04-01-01-P07->FND-04-01-01-P08',
  'FND-04-01-01-P07-S06->FND-04-01-01-P07-S07',
  'FND-02-01-01-P07->FND-02-01-01-P08',
  'FND-02-01-01-P07-S06->FND-02-01-01-P07-S07',
  'FND-02-01-01-P04->FND-02-01-01-P05',
  'FND-02-01-01-P04-S06->FND-02-01-01-P04-S07',
  'FND-02-01-04-P02-S06->FND-02-01-04-P02-S07',
  'FND-05-01-01-P07->FND-05-01-01-P08',
  'FND-05-01-01-P07-S06->FND-05-01-01-P07-S07',
  '06-11-01-P02->06-11-01-P03',
  'FIR-01-01-01-P06->FIR-01-01-01-P07',
  'HVA-01-01-02-P02->HVA-01-01-02-P03',
  'HVA-01-01-02-P02->HVA-01-01-02-P05',
  'PLU-01-01-01-P02->PLU-01-01-01-P03',
  'OUT-02-01-01-P03->OUT-02-01-01-P04',
  'MUN-02-01-01-P03->MUN-02-01-01-P04',
  'PLU-02-01-01-P02->PLU-02-01-01-P03',
  'PLU-02-01-01-P02->PLU-02-01-01-P05',
  'FIR-01-01-02-P02->FIR-01-01-02-P03',
  'FIR-01-01-02-P02->FIR-01-01-02-P05',
  '08-05-01-P05->08-05-01-P06',
  '07-06-07-P02->07-06-07-P03',
  '07-01-06-P02->07-01-06-P03',
  '07-04-07-P02->07-04-07-P03',
  '07-05-04-P02->07-05-04-P03',
  'CLN-04-01-22-P05->CLN-04-01-22-P06',
  '06-09-06-P03->06-09-06-P04',
  '05-13-06-P04->05-13-06-P05',
  '05-05-11-P02->05-05-11-P03',
  '05-12-03-P03->05-12-03-P04',
  '05-03-01-P05->05-03-01-P06',
  '05-03-05-P03->05-03-05-P04',
  'CLN-01-01-02-P08->CLN-01-01-02-P09',
  'HVA-01-01-02-P03->HVA-01-01-02-P04',
  'MUN-02-01-01-P04->MUN-02-01-01-P05',
  '06-10-03-P03->06-10-03-P04',
  '05-07-03-P05->05-07-03-P06',
  '06-10-09-P02->06-10-09-P03',
  'OUT-02-01-01-P04->OUT-02-01-01-P05',
  'CLN-01-01-02-P07->CLN-01-01-02-P08',
  '06-19-03-P08->06-19-03-P09',
  'HVA-03-01-02-P07->HVA-03-01-02-P08',
  'CLN-04-01-31-P04->CLN-04-01-31-P05',
  '05-03-01-P07->05-03-01-P08',
  'PLU-01-01-01-P06->PLU-01-01-01-P07',
  'PLU-01-01-01-P06->PLU-01-01-01-P08',
  'ICR-05-01-13-P09->ICR-05-01-13-P07',
  '06-12-04-P02->06-12-04-P03',
  '06-13-04-P02->06-13-04-P03',
  '06-14-04-P02->06-14-04-P03',
  '06-16-02-P02->06-16-02-P03',
  '06-15-04-P02->06-15-04-P03',
  '06-17-02-P02->06-17-02-P03',
  'WPI-02-01-01-P04->WPI-02-01-01-P05',
  '01-07-02-P04-S02->01-07-02-P04-S03',
  '07-01-05-P03->07-01-05-P04',
  '07-01-04-P02->07-01-04-P03',
  '05-12-02-P05->05-12-02-P06',
  '02-03-06-P05->02-03-06-P06',
  '02-03-06-P04->02-03-06-P05',
  'MEP-03-01-01-P08-S05->MEP-03-01-01-P08-S06',
  'MEP-03-01-01-P08-S02->MEP-03-01-01-P08-S03',
  'MEP-03-01-01-P08-S01->MEP-03-01-01-P08-S02',
  'MEP-03-01-01-P01-S05->MEP-03-01-01-P01-S06',
  'MEP-03-01-01-P01-S02->MEP-03-01-01-P01-S03',
  'MEP-03-01-01-P01-S01->MEP-03-01-01-P01-S02',
  'FIR-06-01-01-P05->FIR-06-01-01-P06',
  'PLU-03-01-01-P01->PLU-03-01-01-P02',
  'MEP-03-01-01-P10-S05->MEP-03-01-01-P10-S06',
  'MEP-03-01-01-P10-S02->MEP-03-01-01-P10-S03',
  'MEP-03-01-01-P10-S01->MEP-03-01-01-P10-S02',
  'FND-05-01-01-P02->FND-05-01-01-P03',
  'FND-05-01-01-P02-S06->FND-05-01-01-P02-S07',
  '02-04-05-P05->02-04-05-P06',
  '02-03-06-P02->02-03-06-P03',
  'TOD-04-01-11-P06->TOD-04-01-11-P07',
  'TOD-04-01-11-P02->TOD-04-01-11-P03',
  'TOD-04-01-11-P05->TOD-04-01-11-P06',
  'CLN-04-01-30-P05->CLN-04-01-30-P06',
  'ICR-05-01-30-P02->ICR-05-01-30-P03',
  '10-02-03-P04->10-02-03-P05',
  '06-16-03-P07->06-16-03-P08',
  '07-03-04-P02->07-03-04-P03',
  '07-04-05-P02->07-04-05-P03',
  '09-02-01-P02->09-02-01-P03',
  '05-05-09-P03->05-05-09-P04',
  '05-08-06-P04->05-08-06-P05',
  '05-01-09-P03->05-01-09-P04',
  '05-06-03-P03->05-06-03-P04',
  '06-11-03-P03->06-11-03-P04',
  '06-12-03-P03->06-12-03-P04',
  '06-13-03-P03->06-13-03-P04',
  '06-14-03-P03->06-14-03-P04',
  '06-15-03-P03->06-15-03-P04',
  '06-12-05-P04->06-12-05-P05',
  '06-09-09-P03->06-09-09-P04',
  'DTC-04-01-31-P09-S06->DTC-04-01-31-P09-S07',
  'FND-06-01-05-P03->FND-06-01-05-P04',
  'FND-06-01-05-P03-S06->FND-06-01-05-P03-S07',
  '03-06-01-P05->03-06-01-P06',
  'OUT-02-01-01-P01->OUT-02-01-01-P02',
  'OUT-02-01-01-P01-S02->OUT-02-01-01-P01-S03',
  'OUT-02-01-01-P01-S01->OUT-02-01-01-P01-S02',
  'HVA-02-01-01-P06->HVA-02-01-01-P07',
  'HVA-02-01-01-P06->HVA-02-01-01-P08',
  'MUN-02-01-01-P01->MUN-02-01-01-P02',
  'HVA-01-01-02-P01->HVA-01-01-02-P02',
  'BDT-01-01-05-P07->BDT-01-01-05-P08',
  'BDT-01-01-05-P07-S02->BDT-01-01-05-P07-S03',
  'BDT-01-01-05-P07-S01->BDT-01-01-05-P07-S02',
  'RNV-04-01-20-P06->RNV-04-01-20-P07',
  'FND-06-01-05-P01->FND-06-01-05-P02',
  'FND-06-01-05-P01-S05->FND-06-01-05-P01-S06',
  'FND-06-01-05-P01-S02->FND-06-01-05-P01-S03',
  'FND-06-01-05-P01-S01->FND-06-01-05-P01-S02',
  'HVA-03-01-01-P06->HVA-03-01-01-P07',
  'HVA-03-01-01-P06->HVA-03-01-01-P08',
  'SITE-01-01-05-P04-S02->SITE-01-01-05-P04-S03',
  'SITE-01-01-05-P04-S01->SITE-01-01-05-P04-S02',
  'MIC-06-01-05-P04->MIC-06-01-05-P05',
  'MIC-06-01-05-P04-S06->MIC-06-01-05-P04-S07',
  'ICR-03-01-01-P03->ICR-03-01-01-P04',
  'ICR-05-01-13-P04->ICR-05-01-13-P05',
  'TOD-04-01-11-P08->TOD-04-01-11-P06',
  '04-02-03-P04->04-02-03-P05',
  '01-01-05-P04->01-01-05-P05',
  'SITE-04-01-01-P05-S02->SITE-04-01-01-P05-S03',
  'SITE-04-01-01-P05-S01->SITE-04-01-01-P05-S02',
  'TOD-04-01-11-P07->TOD-04-01-11-P08',
  'MIC-06-01-16-P05->MIC-06-01-16-P06',
  'FND-04-01-14-P10-S06->FND-04-01-14-P10-S07',
  'BDT-07-01-03-P03->BDT-07-01-03-P04',
  'FND-02-01-02-P02->FND-02-01-02-P05',
  'FND-02-01-02-P02-S06->FND-02-01-02-P02-S07',
  '01-01-11-P06->01-01-11-P07',
  'FND-01-01-02-P08->FND-01-01-02-P09',
  'FND-01-01-02-P08-S06->FND-01-01-02-P08-S07',
  '01-03-08-P06->01-03-08-P07',
  'MUN-01-01-02-P06-S02->MUN-01-01-02-P06-S03',
  'MUN-01-01-02-P06-S01->MUN-01-01-02-P06-S02',
  '03-01-01-P03->03-01-01-P04',
  '01-01-02-P04-S02->01-01-02-P04-S03',
  '01-05-02-P04->01-05-02-P05',
  '01-01-01-P04-S02->01-01-01-P04-S03',
  '08-18-08-P09-S03->08-18-08-P09-S04',
  'STL-04-01-09-P05->STL-04-01-09-P06',
  '02-04-01-P05->02-04-01-P06',
  '01-01-08-P06->01-01-08-P07',
  '06-06-09-P04->06-06-09-P05',
  '06-07-10-P04->06-07-10-P05',
  'HVA-01-01-03-P06->HVA-01-01-03-P07',
  'DTC-04-01-16-P05->DTC-04-01-16-P06',
  'DTC-04-01-16-P05-S06->DTC-04-01-16-P05-S07',
  '06-11-05-P06->06-11-05-P07',
  'FIR-02-01-01-P04->FIR-02-01-01-P05',
  'FIR-02-01-01-P05->FIR-02-01-01-P06',
  '06-20-03-P02->06-20-03-P03',
  'CLN-04-01-19-P04->CLN-04-01-19-P05',
  'CLN-04-01-20-P05->CLN-04-01-20-P06',
  'CLN-04-01-14-P04->CLN-04-01-14-P05',
  'CLN-04-01-15-P04->CLN-04-01-15-P05',
  'CLN-04-01-15-P04->CLN-04-01-15-P06',
  'CDF-02-01-01-P04->CDF-02-01-01-P05',
  '05-05-07-P06->05-05-07-P07',
  'ICR-05-01-08-P05->ICR-05-01-08-P06',
  '06-07-11-P02->06-07-11-P03',
  '06-05-06-P06->06-05-06-P07',
  '06-05-08-P06->06-05-08-P07',
  'CLN-04-01-04-P05->CLN-04-01-04-P06',
  'CLN-04-01-04-P05->CLN-04-01-04-P07',
  'CLN-04-01-19-P05->CLN-04-01-19-P06',
  'CLN-04-01-19-P05->CLN-04-01-19-P07',
  'ICR-05-01-23-P02->ICR-05-01-23-P03',
  'ICR-05-01-23-P06->ICR-05-01-23-P07',
  'ICR-05-01-23-P04->ICR-05-01-23-P05',
  'STL-04-01-28-P01->STL-04-01-28-P02',
  'STL-04-01-23-P05->STL-04-01-23-P06',
  'DTC-04-01-34-P08-S06->DTC-04-01-34-P08-S07',
  'RNV-04-01-12-P03->RNV-04-01-12-P04',
  '01-01-06-P08->01-01-06-P09',
  '01-07-05-P08->01-07-05-P09',
  'BDT-04-01-02-P07->BDT-04-01-02-P08',
  '02-01-04-P06->02-01-04-P07',
  '01-02-13-P08->01-02-13-P09',
  '02-01-05-P08->02-01-05-P09',
  '06-02-07-P06->06-02-07-P07',
  '06-01-07-P02->06-01-07-P03',
  '06-01-07-P05->06-01-07-P06',
  '06-18-04-P08->06-18-04-P09',
  '06-01-06-P04->06-01-06-P05',
  '06-05-08-P01->06-05-08-P02',
  '06-05-08-P03->06-05-08-P04',
  '06-05-10-P05->06-05-10-P06',
  'MEP-01-01-01-P02->MEP-01-01-01-P03',
  'MEP-01-01-01-P03->MEP-01-01-01-P04',
  'MEP-01-01-01-P04->MEP-01-01-01-P05',
  'FND-01-01-01-P08->FND-01-01-01-P09',
  'FND-01-01-01-P09->FND-01-01-01-P10',
  'FND-02-01-01-P05->FND-02-01-01-P06',
  'MIC-03-01-02-P04->MIC-03-01-02-P05',
  'DTC-04-01-26-P05->DTC-04-01-26-P06',
  '02-06-05-P03->02-06-05-P04',
  'CLN-04-01-34-P02->CLN-04-01-34-P03',
  'DEC-04-01-01-P04->DEC-04-01-01-P05',
  '03-01-02-P05->03-01-02-P06',
  'IBU-03-01-08-P01-S02->IBU-03-01-08-P01-S03',
  'IBU-03-01-08-P01-S01->IBU-03-01-08-P01-S02',
  '05-05-08-P06->05-05-08-P07',
  'IKU-03-01-08-P01-S02->IKU-03-01-08-P01-S03',
  'IKU-03-01-08-P01-S01->IKU-03-01-08-P01-S02',
  'DEC-03-02-01-P01->DEC-03-02-01-P02',
  'DEC-01-02-01-P07->DEC-01-02-01-P08',
  'DEC-01-02-01-P07-S01->DEC-01-02-01-P07-S02',
  'DEC-03-02-01-P04->DEC-03-02-01-P05',
  '05-05-09-P04->05-05-09-P05',
  '08-03-02-P05->08-03-02-P06',
  '08-03-03-P03->08-03-03-P04',
  'DTC-04-01-33-P06-S06->DTC-04-01-33-P06-S07',
  'ICR-05-01-21-P04->ICR-05-01-21-P05',
  'OUT-03-01-02-P05->OUT-03-01-02-P06',
  'ELE-02-01-02-P06->ELE-02-01-02-P07',
  'ELE-02-01-02-P06->ELE-02-01-02-P08',
  '03-04-02-P07->03-04-02-P08',
  '08-19-06-P07->08-19-06-P08',
  '08-19-06-P01->08-19-06-P02',
  '08-19-06-P03->08-19-06-P04',
  '03-09-02-P05->03-09-02-P06',
  '03-09-01-P06->03-09-01-P07',
  '04-04-03-P06->04-04-03-P07',
  'UHR-04-01-06-P07->UHR-04-01-06-P08',
  'UHR-02-01-03-P06->UHR-02-01-03-P07',
  'UHR-02-01-03-P06->UHR-02-01-03-P08',
  'STL-04-01-28-P07->STL-04-01-28-P08',
  'STL-04-01-28-P02->STL-04-01-28-P03',
  '06-20-04-P01->06-20-04-P02',
  '06-20-01-P01->06-20-01-P02',
  '06-20-03-P01->06-20-03-P02',
  '08-14-03-P08->08-14-03-P09',
  'HTL-06-01-22-P04->HTL-06-01-22-P05',
  '05-05-06-P06->05-05-06-P07',
  'ELE-04-01-01-P07->ELE-04-01-01-P08',
  'DTC-04-01-08-P04->DTC-04-01-08-P05',
  'DTC-04-01-08-P04-S06->DTC-04-01-08-P04-S07',
  'DTC-04-01-08-P03->DTC-04-01-08-P04',
  'DTC-04-01-08-P03-S06->DTC-04-01-08-P03-S07',
  'DTC-04-01-08-P09->DTC-04-01-08-P10',
  'DTC-04-01-08-P09-S06->DTC-04-01-08-P09-S07',
  'DTC-02-01-01-P05->DTC-02-01-01-P06',
  'DTC-02-01-01-P05-S05->DTC-02-01-01-P05-S06',
  'DTC-02-01-01-P03->DTC-02-01-01-P04',
  'DTC-02-01-01-P03-S06->DTC-02-01-01-P03-S07',
  'DTC-02-01-01-P07-S06->DTC-02-01-01-P07-S07',
  '10-02-11-P03->10-02-11-P04',
  '01-02-07-P05->01-02-07-P06',
  '01-02-12-P05->01-02-12-P06',
  '01-03-06-P04->01-03-06-P05',
  '07-02-02-P02->07-02-02-P03',
  '01-03-07-P03->01-03-07-P04',
  'FND-05-01-03-P01->FND-05-01-03-P02',
  'FND-05-01-03-P01-S05->FND-05-01-03-P01-S06',
  'FND-05-01-03-P01-S02->FND-05-01-03-P01-S03',
  'FND-05-01-03-P01-S01->FND-05-01-03-P01-S02',
  'FND-03-01-02-P08-S06->FND-03-01-02-P08-S07',
  'FND-01-01-04-P03-S06->FND-01-01-04-P03-S07',
  'RNV-04-01-13-P08->RNV-04-01-13-P09',
  '01-01-07-P09->01-01-07-P10',
  'RNV-04-01-01-P01->RNV-04-01-01-P02',
  '10-01-03-P03->10-01-03-P04',
  '10-01-10-P04->10-01-10-P05',
  'DCS-01-01-09-P01-S02->DCS-01-01-09-P01-S03',
  'DCS-01-01-09-P01-S01->DCS-01-01-09-P01-S02',
  '05-11-01-P01->05-11-01-P02',
  'RNV-04-01-03-P03->RNV-04-01-03-P04',
  'RNV-04-01-11-P06->RNV-04-01-11-P07',
  'IBU-03-01-02-P05->IBU-03-01-02-P06',
  'IBU-03-01-02-P05-S02->IBU-03-01-02-P05-S03',
  'IBU-03-01-02-P05-S01->IBU-03-01-02-P05-S02',
  'BDT-09-01-02-P01->BDT-09-01-02-P02',
  'ICR-04-01-02-P03->ICR-04-01-02-P04',
  'ICR-05-01-24-P08->ICR-05-01-24-P09',
  'ICR-05-01-24-P03->ICR-05-01-24-P04',
  'ICR-05-01-06-P06->ICR-05-01-06-P07',
  'HTL-06-01-04-P06->HTL-06-01-04-P07',
  'HTL-06-01-04-P06->HTL-06-01-04-P08',
  '06-11-06-P07->06-11-06-P08',
  'ICR-05-01-13-P07->ICR-05-01-13-P08',
  'ICR-03-01-01-P08->ICR-03-01-01-P09',
  'CLN-04-01-31-P07->CLN-04-01-31-P08',
  'CLN-04-01-24-P07->CLN-04-01-24-P08',
  'CLN-04-01-33-P09->CLN-04-01-33-P10',
  '07-05-06-P04->07-05-06-P05',
  '06-10-01-P05->06-10-01-P06',
  'TOD-02-01-01-P04->TOD-02-01-01-P05',
  'TOD-02-01-01-P04-S02->TOD-02-01-01-P04-S03',
  'TOD-02-01-01-P04-S01->TOD-02-01-01-P04-S02',
  'TOD-04-01-03-P08->TOD-04-01-03-P09',
  'TOD-04-01-03-P03->TOD-04-01-03-P04',
  'BDT-07-01-03-P07->BDT-07-01-03-P08',
  'BDT-07-01-03-P01->BDT-07-01-03-P02',
  'BDT-07-01-03-P01-S02->BDT-07-01-03-P01-S03',
  'BDT-07-01-03-P01-S01->BDT-07-01-03-P01-S02',
  'ICR-05-01-05-P02->ICR-05-01-05-P03',
  'ICR-04-02-01-P01->ICR-04-02-01-P02',
  '08-04-05-P03->08-04-05-P04',
  '06-20-01-P05->06-20-01-P06',
  '08-15-02-P05->08-15-02-P06',
  '08-15-05-P05->08-15-05-P06',
  'CLN-04-01-30-P06->CLN-04-01-30-P07',
  '07-04-02-P01->07-04-02-P02',
  '07-04-02-P02->07-04-02-P03',
  '07-04-02-P03->07-04-02-P04',
  '07-04-08-P05->07-04-08-P06',
  'STL-04-01-25-P04->STL-04-01-25-P05',
  'STL-04-01-25-P04->STL-04-01-25-P08',
  '08-03-04-P01->08-03-04-P02',
  '08-03-05-P01->08-03-05-P02',
  '08-03-01-P02->08-03-01-P03',
  '05-08-04-P07->05-08-04-P08',
  '06-11-02-P05->06-11-02-P06',
  '06-12-02-P05->06-12-02-P06',
  '06-14-02-P05->06-14-02-P06',
  '07-04-03-P01->07-04-03-P02',
  '07-04-02-P04->07-04-02-P05',
  '07-04-02-P05->07-04-02-P06',
  '06-06-07-P03->06-06-07-P04',
  'PLU-02-01-02-P06->PLU-02-01-02-P07',
  'PLU-02-01-02-P06->PLU-02-01-02-P08',
  'OUT-02-02-01-P04->OUT-02-02-01-P05',
  'ELE-01-01-02-P04->ELE-01-01-02-P05',
  '07-02-05-P04->07-02-05-P05',
  '07-02-05-P03->07-02-05-P04',
  '07-03-05-P05->07-03-05-P06',
  '07-04-06-P05->07-04-06-P06',
  '07-06-06-P05->07-06-06-P06',
  'ELE-06-01-01-P05->ELE-06-01-01-P06',
  'DTC-01-01-02-P03->DTC-01-01-02-P04',
  'DTC-01-01-02-P03-S06->DTC-01-01-02-P03-S07',
  '07-06-02-P06->07-06-02-P07',
  '07-01-05-P02->07-01-05-P03',
  '07-01-07-P05-S01->07-01-07-P05-S02',
  '07-06-06-P04->07-06-06-P05',
  'OUT-05-01-01-P07->OUT-05-01-01-P08',
  '02-02-01-P07->02-02-01-P08',
  'MIC-06-01-02-P06->MIC-06-01-02-P07',
  'MIC-06-01-02-P06->MIC-06-01-02-P08',
  'MIC-06-01-02-P06-S06->MIC-06-01-02-P06-S07',
  'HVA-03-01-01-P03->HVA-03-01-01-P04',
  'HTL-06-01-03-P04->HTL-06-01-03-P05',
  'CLN-04-01-21-P01->CLN-04-01-21-P02',
  'DTC-02-02-02-P08->DTC-02-02-02-P09',
  'INT-04-01-01-P07->INT-04-01-01-P08',
  '08-18-06-P05->08-18-06-P06',
  'DTC-02-02-02-P01->DTC-02-02-02-P02',
  'DTC-02-02-02-P01-S05->DTC-02-02-02-P01-S06',
  'DTC-02-02-02-P03->DTC-02-02-02-P04',
  'DTC-02-02-02-P03-S06->DTC-02-02-02-P03-S07',
  'SITE-01-01-07-P04->SITE-01-01-07-P05',
  '07-04-05-P03->07-04-05-P04',
  '07-04-05-P01->07-04-05-P02',
  '07-04-08-P02->07-04-08-P03',
  '07-04-06-P01->07-04-06-P02',
  '07-04-06-P03->07-04-06-P04',
  '07-04-07-P01->07-04-07-P02',
  '07-04-08-P01->07-04-08-P02',
  '07-04-07-P03->07-04-07-P04',
  '10-01-10-P05->10-01-10-P06',
  'BDT-02-01-01-P07->BDT-02-01-01-P08',
  '07-04-04-P04->07-04-04-P05',
  'ELE-02-01-01-P01->ELE-02-01-01-P02',
  'ICR-05-01-07-P04->ICR-05-01-07-P05',
  '06-03-02-P04-S02->06-03-02-P04-S03',
  '01-07-03-P04->01-07-03-P05',
  'FAC-03-01-01-P03->FAC-03-01-01-P04',
  'CLN-04-01-01-P01->CLN-04-01-01-P02',
  'ICR-05-01-23-P01->ICR-05-01-23-P02',
  'RNV-04-01-20-P08->RNV-04-01-20-P09',
  'IBU-02-01-01-P01->IBU-02-01-01-P02',
  'RNV-04-01-07-P06->RNV-04-01-07-P07',
  'BDT-01-01-03-P07->BDT-01-01-03-P08',
  'BDT-01-01-03-P05->BDT-01-01-03-P06',
  'HTL-06-01-03-P03->HTL-06-01-03-P04',
  'FND-05-01-04-P06->FND-05-01-04-P07',
  'FND-05-01-04-P06-S06->FND-05-01-04-P06-S07',
  '07-06-07-P04->07-06-07-P05',
  '08-05-02-P04-S01->08-05-02-P04-S02',
  '08-04-05-P02->08-04-05-P03',
  '08-15-02-P04->08-15-02-P05',
  '08-04-01-P07->08-04-01-P08',
  'DTC-04-01-24-P08->DTC-04-01-24-P09',
  'DTC-04-01-24-P08-S06->DTC-04-01-24-P08-S07',
  '08-05-08-P02->08-05-08-P03',
  'DTC-04-01-02-P11-S05->DTC-04-01-02-P11-S06',
  'DTC-04-01-01-P11-S05->DTC-04-01-01-P11-S06',
  '08-14-05-P07->08-14-05-P08',
  'DTC-04-01-27-P09->DTC-04-01-27-P10',
  'DTC-04-01-27-P11-S06->DTC-04-01-27-P11-S07',
  '07-05-01-P05->07-05-01-P06',
  'DTC-04-01-32-P08-S06->DTC-04-01-32-P08-S07',
  'CLN-04-01-09-P06->CLN-04-01-09-P07',
  'PFB-01-01-02-P07->PFB-01-01-02-P08',
  'MIC-06-01-13-P04->MIC-06-01-13-P05',
  'PFB-01-01-02-P04->PFB-01-01-02-P05',
  'PFB-00-01-03-P10->PFB-00-01-03-P12',
  'PFB-01-01-01-P03->PFB-01-01-01-P04',
  'ICR-05-01-25-P03->ICR-05-01-25-P04',
  '02-05-06-P02->02-05-06-P03',
  '10-01-07-P03->10-01-07-P04',
  '10-01-07-P02->10-01-07-P03',
  '10-01-07-P01->10-01-07-P02',
  '10-01-07-P04->10-01-07-P05',
  '01-07-03-P03->01-07-03-P04',
  'DTC-04-01-31-P05-S06->DTC-04-01-31-P05-S07',
  'FND-02-01-04-P04-S05->FND-02-01-04-P04-S06',
  'HTL-02-01-02-P05->HTL-02-01-02-P06',
  'DTC-04-01-32-P04-S06->DTC-04-01-32-P04-S07',
  'MIC-06-01-18-P03->MIC-06-01-18-P04',
  'MIC-06-01-18-P03-S06->MIC-06-01-18-P03-S07',
  'MIC-06-01-20-P03->MIC-06-01-20-P04',
  '07-05-01-P07->07-05-01-P08',
  '07-05-08-P04->07-05-08-P05',
  '07-05-11-P03->07-05-11-P04',
  'ELE-06-01-01-P06->ELE-06-01-01-P08',
  '09-04-02-P04->09-04-02-P05',
  'DTC-04-01-14-P05->DTC-04-01-14-P06',
  'DTC-04-01-14-P05-S06->DTC-04-01-14-P05-S07',
  'HVA-03-01-02-P08->HVA-03-01-02-P09',
  '08-18-03-P07->08-18-03-P08',
  '06-07-04-P06->06-07-04-P07',
  'HVA-02-01-01-P07->HVA-02-01-01-P08',
  'PLU-02-01-02-P07->PLU-02-01-02-P08',
  'ICR-04-01-01-P04->ICR-04-01-01-P05',
  'CMP-02-01-02-P07->CMP-02-01-02-P08',
  '03-06-02-P05->03-06-02-P06',
  'DTC-04-01-36-P04-S06->DTC-04-01-36-P04-S07',
  'DTC-04-01-08-P05->DTC-04-01-08-P06',
  'DTC-04-01-08-P05->DTC-04-01-08-P07',
  'DTC-04-01-08-P05-S06->DTC-04-01-08-P05-S07',
  'QR-01-01-12-P03->QR-01-01-12-P04',
  'CLN-04-01-35-P05->CLN-04-01-35-P06',
  'FAC-01-01-04-P06->FAC-01-01-04-P07',
  'UHR-02-01-03-P03->UHR-02-01-03-P04',
  'UHR-04-01-06-P03->UHR-04-01-06-P04',
  'MIC-06-01-18-P05->MIC-06-01-18-P06',
  'IKU-02-01-01-P04->IKU-02-01-01-P05',
  'MIC-06-01-10-P05->MIC-06-01-10-P06',
  'ELE-02-01-03-P03->ELE-02-01-03-P04',
  '06-04-04-P05->06-04-04-P06',
  '05-05-07-P05->05-05-07-P06',
  'MIC-05-01-01-P09-S06->MIC-05-01-01-P09-S07',
  'CDF-03-01-01-P07->CDF-03-01-01-P08',
  '06-09-04-P05->06-09-04-P06',
  '06-09-08-P05->06-09-08-P06',
  'MIC-06-01-07-P03->MIC-06-01-07-P04',
  'MIC-06-01-07-P03-S06->MIC-06-01-07-P03-S07',
  'PFB-04-01-03-P06->PFB-04-01-03-P07',
  'PFB-04-01-03-P06->PFB-04-01-03-P08',
  '03-07-02-P06->03-07-02-P07',
  '03-01-03-P05->03-01-03-P06',
  '03-09-03-P07->03-09-03-P08',
  '03-12-04-P05->03-12-04-P06',
  'CMP-05-01-11-P01->CMP-05-01-11-P02',
  'CMP-05-01-11-P01-S02->CMP-05-01-11-P01-S03',
  'CMP-05-01-11-P01-S01->CMP-05-01-11-P01-S02',
  'HTL-06-01-25-P07->HTL-06-01-25-P08',
  'HTL-06-01-25-P07->HTL-06-01-25-P09',
  'DTC-04-01-34-P02-S06->DTC-04-01-34-P02-S07',
  'HTL-06-01-19-P02->HTL-06-01-19-P03',
  'DTC-04-01-05-P08->DTC-04-01-05-P09',
  'DTC-04-01-05-P08-S06->DTC-04-01-05-P08-S07',
  'ICR-05-01-26-P02->ICR-05-01-26-P03',
  'TOD-02-01-02-P04->TOD-02-01-02-P05',
  'TOD-04-01-04-P03->TOD-04-01-04-P04',
  'TOD-04-01-04-P08->TOD-04-01-04-P09',
  'TOD-04-01-15-P02->TOD-04-01-15-P03',
  'TOD-04-01-15-P02-S02->TOD-04-01-15-P02-S03',
  'TOD-04-01-15-P02-S01->TOD-04-01-15-P02-S02',
  '06-10-06-P01->06-10-06-P02',
  '06-10-06-P04->06-10-06-P05',
  '05-05-06-P04->05-05-06-P05',
  'CLN-04-01-26-P06->CLN-04-01-26-P07',
  '06-10-06-P02->06-10-06-P03',
  '06-19-02-P01->06-19-02-P02',
  '06-19-07-P05->06-19-07-P06',
  '05-03-02-P02->05-03-02-P03',
  'TOD-04-01-10-P02->TOD-04-01-10-P03',
  'TOD-04-01-10-P02-S02->TOD-04-01-10-P02-S03',
  'TOD-04-01-10-P02-S01->TOD-04-01-10-P02-S02',
  'CLN-04-01-17-P09->CLN-04-01-17-P10',
  'CLN-04-01-17-P07->CLN-04-01-17-P08',
  '06-09-01-P04->06-09-01-P05',
  '06-02-06-P05->06-02-06-P06',
  'CLN-04-01-17-P06->CLN-04-01-17-P07',
  'RNV-04-01-21-P02->RNV-04-01-21-P03',
  'RNV-04-01-21-P07->RNV-04-01-21-P08',
  'CLN-04-01-17-P01->CLN-04-01-17-P02',
  'CLN-04-01-17-P08->CLN-04-01-17-P09',
  'DTC-04-01-25-P09->DTC-04-01-25-P10',
  'DTC-04-01-25-P09-S06->DTC-04-01-25-P09-S07',
  'DTC-04-01-25-P11-S06->DTC-04-01-25-P11-S07',
  '07-06-02-P08->07-06-02-P09',
  'UHR-04-01-08-P07->UHR-04-01-08-P08',
  'BDT-06-01-04-P05->BDT-06-01-04-P06',
  '06-17-01-P08->06-17-01-P09',
  'HTL-01-02-01-P04->HTL-01-02-01-P05',
  'FND-06-01-03-P06->FND-06-01-03-P07',
  'BDT-07-01-04-P01-S02->BDT-07-01-04-P01-S03',
  'BDT-07-01-04-P01-S01->BDT-07-01-04-P01-S02',
  'FND-01-01-02-P05->FND-01-01-02-P06',
  'FND-03-01-04-P07->FND-03-01-04-P08',
  'FND-03-01-04-P07-S06->FND-03-01-04-P07-S07',
  'FND-01-01-02-P02->FND-01-01-02-P03',
  'FND-01-01-02-P02-S06->FND-01-01-02-P02-S07',
  'FND-01-01-02-P04->FND-01-01-02-P05',
  'FND-01-01-02-P04-S06->FND-01-01-02-P04-S07',
  'HVA-05-01-01-P01->HVA-05-01-01-P02',
  'RNV-01-01-01-P05->RNV-01-01-01-P06',
  '02-03-02-P04->02-03-02-P05',
  'HRT-04-01-02-P05->HRT-04-01-02-P06',
  'HRT-04-01-02-P05->HRT-04-01-02-P07',
  'STL-04-01-01-P07->STL-04-01-01-P08',
  '08-06-01-P02->08-06-01-P03',
  'RNV-04-01-23-P01->RNV-04-01-23-P02',
  'STL-04-01-18-P02->STL-04-01-18-P03',
  'DCS-01-01-15-P03-S02->DCS-01-01-15-P03-S03',
  'DCS-01-01-15-P03-S01->DCS-01-01-15-P03-S02',
  '03-07-01-P05->03-07-01-P06',
  '05-01-01-P04->05-01-01-P05',
  '06-11-01-P04->06-11-01-P05',
  '02-03-09-P05->02-03-09-P06',
  '05-02-03-P06->05-02-03-P07',
  '05-03-03-P06->05-03-03-P07',
  '05-05-10-P05->05-05-10-P06',
  '06-10-04-P06->06-10-04-P07',
  '06-11-04-P06->06-11-04-P07',
  '06-12-04-P06->06-12-04-P07',
  '06-13-04-P06->06-13-04-P07',
  '06-14-04-P06->06-14-04-P07',
  '06-15-04-P06->06-15-04-P07',
  '06-16-02-P06->06-16-02-P07',
  '06-17-02-P06->06-17-02-P07',
  '06-19-04-P06->06-19-04-P07',
  '07-03-07-P02->07-03-07-P03',
  'ICR-02-01-01-P01->ICR-02-01-01-P02',
  '01-02-09-P03->01-02-09-P04',
  'STL-04-01-03-P06->STL-04-01-03-P07',
  'RNV-04-01-09-P02->RNV-04-01-09-P03',
  'RNV-04-01-09-P04->RNV-04-01-09-P05',
  'STL-04-01-02-P08->STL-04-01-02-P09',
  'STL-04-01-02-P03->STL-04-01-02-P04',
  'STL-04-01-02-P03->STL-04-01-02-P07',
  'STL-04-01-02-P02->STL-04-01-02-P03',
  'STL-04-01-02-P01->STL-04-01-02-P02',
  '02-03-09-P02->02-03-09-P03',
  '02-03-03-P01->02-03-03-P02',
  '02-03-01-P03->02-03-01-P04',
  '02-03-03-P04->02-03-03-P05',
  '02-03-06-P01->02-03-06-P02',
  '01-02-05-P01->01-02-05-P02',
  '02-04-05-P02->02-04-05-P03',
  '02-01-06-P20-S02->02-01-06-P20-S03',
  'BDT-04-01-03-P06->BDT-04-01-03-P07',
  'BDT-04-01-03-P06->BDT-04-01-03-P08',
  '02-04-06-P04->02-04-06-P05',
  '02-03-06-P03->02-03-06-P04',
  '01-02-05-P06->01-02-05-P07',
  '02-03-01-P02->02-03-01-P03',
  '02-03-01-P01->02-03-01-P02',
  'TOD-04-01-07-P02->TOD-04-01-07-P03',
  '01-02-04-P01->01-02-04-P02',
  'STL-01-01-01-P01->STL-01-01-01-P02',
  'STL-04-01-01-P06->STL-04-01-01-P07',
  'STL-04-01-29-P08->STL-04-01-29-P07',
  'PFB-00-01-02-P11->PFB-00-01-02-P12',
  '02-05-03-P02->02-05-03-P03',
  '02-04-05-P03->02-04-05-P04',
  'PFB-00-01-02-P02->PFB-00-01-02-P03',
  'PFB-00-01-02-P02->PFB-00-01-02-P04',
  'TOD-02-01-01-P06->TOD-02-01-01-P07',
  '02-01-02-P03->02-01-02-P04',
  '01-02-03-P04-S02->01-02-03-P04-S03',
  '02-01-02-P01->02-01-02-P02',
  '01-02-11-P05->01-02-11-P06',
  'FND-03-01-02-P11-S06->FND-03-01-02-P11-S07',
  'FND-04-01-04-P14-S05->FND-04-01-04-P14-S06',
  'FND-04-01-04-P14-S02->FND-04-01-04-P14-S03',
  'FND-04-01-04-P14-S01->FND-04-01-04-P14-S02',
  '01-02-08-P06-S01->01-02-08-P06-S02',
  'FND-02-01-03-P04-S06->FND-02-01-03-P04-S07',
  'FND-02-01-03-P08-S06->FND-02-01-03-P08-S07',
  'FND-04-01-05-P01->FND-04-01-05-P02',
  'FND-04-01-05-P01-S06->FND-04-01-05-P01-S07',
  '01-02-10-P07-S01->01-02-10-P07-S02',
  'FND-04-01-05-P04->FND-04-01-05-P05',
  'FND-04-01-05-P04-S06->FND-04-01-05-P04-S07',
  'FND-01-01-04-P05-S06->FND-01-01-04-P05-S07',
  '01-02-08-P06->01-02-08-P07',
  '01-02-09-P06->01-02-09-P07',
  'FND-03-01-02-P05->FND-03-01-02-P06',
  'FND-03-01-02-P05-S06->FND-03-01-02-P05-S07',
  'FND-01-01-01-P10->FND-01-01-01-P11',
  'FND-01-01-01-P10-S06->FND-01-01-01-P10-S07',
  'FND-04-01-16-P04->FND-04-01-16-P05',
  'FND-04-01-16-P04-S06->FND-04-01-16-P04-S07',
  'FND-04-01-12-P10-S06->FND-04-01-12-P10-S07',
  'FND-04-01-12-P04->FND-04-01-12-P05',
  'FND-04-01-12-P04-S06->FND-04-01-12-P04-S07',
  'PFB-04-01-01-P02->PFB-04-01-01-P03',
  'TOD-04-01-03-P02->TOD-04-01-03-P03',
  'TOD-04-01-03-P02-S02->TOD-04-01-03-P02-S03',
  'TOD-04-01-03-P02-S01->TOD-04-01-03-P02-S02',
  '02-05-03-P05->02-05-03-P06',
  'STL-02-01-01-P06->STL-02-01-01-P07',
  '10-01-09-P03->10-01-09-P04',
  '07-05-06-P01->07-05-06-P02',
  '07-05-06-P03->07-05-06-P04',
  '07-05-06-P02->07-05-06-P03',
  'FND-04-01-10-P04->FND-04-01-10-P05',
  'FND-04-01-10-P04-S06->FND-04-01-10-P04-S07',
  'FND-04-01-08-P09-S06->FND-04-01-08-P09-S07',
  'FND-04-01-08-P01->FND-04-01-08-P02',
  'FND-04-01-08-P01-S05->FND-04-01-08-P01-S06',
  'FND-04-01-08-P01-S02->FND-04-01-08-P01-S03',
  'FND-04-01-08-P01-S01->FND-04-01-08-P01-S02',
  'FND-02-01-04-P03-S06->FND-02-01-04-P03-S07',
  'FND-04-01-08-P03->FND-04-01-08-P04',
  'FND-04-01-08-P03-S06->FND-04-01-08-P03-S07',
  'FND-04-01-08-P07->FND-04-01-08-P08',
  'FND-04-01-08-P07-S05->FND-04-01-08-P07-S06',
  'FND-04-01-08-P07-S01->FND-04-01-08-P07-S02',
  '01-03-08-P03->01-03-08-P04',
  'FND-02-01-04-P05-S06->FND-02-01-04-P05-S07',
  '02-03-05-P04->02-03-05-P05',
  '01-02-12-P04-S01->01-02-12-P04-S02',
  '01-02-12-P04->01-02-12-P05',
  '01-02-12-P01-S01->01-02-12-P01-S02',
  '01-02-12-P04-S03->01-02-12-P04-S04',
  'ICR-03-01-01-P01->ICR-03-01-01-P02',
  'ICR-05-01-13-P01->ICR-05-01-13-P02',
  'ICR-05-01-13-P03->ICR-05-01-13-P04',
  'ICR-05-01-13-P03->ICR-05-01-13-P05',
  'ICR-03-01-01-P06->ICR-03-01-01-P07',
  'ICR-03-01-01-P06->ICR-03-01-01-P08',
  'HTL-02-01-01-P02->HTL-02-01-01-P03',
  'DANGER-01-01-02-P05->DANGER-01-01-02-P06',
  'DANGER-01-01-02-P06->DANGER-01-01-02-P07',
  'DANGER-02-01-04-P02->DANGER-02-01-04-P03',
  'DANGER-01-01-02-P01->DANGER-01-01-02-P02',
  'DANGER-01-01-02-P04->DANGER-01-01-02-P05',
  'DANGER-01-01-02-P03->DANGER-01-01-02-P04',
  '07-02-05-P02->07-02-05-P03',
  '03-12-04-P06->03-12-04-P07',
  'HRT-04-01-12-P07->HRT-04-01-12-P08',
  'HTL-06-01-03-P02->HTL-06-01-03-P03',
  'HTL-06-01-14-P02->HTL-06-01-14-P03',
  'UHR-02-01-01-P01->UHR-02-01-01-P02',
  'UHR-02-01-01-P01-S05->UHR-02-01-01-P01-S06',
  'UHR-02-01-01-P01-S02->UHR-02-01-01-P01-S03',
  'UHR-02-01-01-P01-S01->UHR-02-01-01-P01-S02',
  'UHR-02-01-01-P05->UHR-02-01-01-P06',
  'UHR-04-01-04-P02->UHR-04-01-04-P03',
  'UHR-04-01-04-P02->UHR-04-01-04-P05',
  'UHR-02-01-01-P02->UHR-02-01-01-P03',
  'UHR-02-01-01-P02->UHR-02-01-01-P05',
  'STL-04-01-17-P07->STL-04-01-17-P08',
  'MIC-06-01-16-P06->MIC-06-01-16-P07',
  'MIC-04-01-02-P06->MIC-04-01-02-P07',
  '02-05-02-P03->02-05-02-P04',
  'STL-04-01-17-P04->STL-04-01-17-P05',
  '02-03-05-P05->02-03-05-P06',
  '02-03-02-P03->02-03-02-P04',
  'STL-01-01-02-P01->STL-01-01-02-P02',
  'STL-01-01-02-P07->STL-01-01-02-P08',
  'STL-04-01-02-P05->STL-04-01-02-P06',
  'MIC-06-01-16-P03->MIC-06-01-16-P04',
  'STL-04-01-17-P05->STL-04-01-17-P06',
  '02-03-04-P06->02-03-04-P07',
  '02-04-04-P04->02-04-04-P05',
  'UHR-03-01-01-P01-S05->UHR-03-01-01-P01-S06',
  'UHR-03-01-01-P01-S02->UHR-03-01-01-P01-S03',
  'UHR-03-01-01-P01-S01->UHR-03-01-01-P01-S02',
  'UHR-04-01-10-P03->UHR-04-01-10-P04',
  '06-17-07-P06->06-17-07-P07',
  '06-04-08-P04->06-04-08-P05',
  'CLN-02-01-01-P07->CLN-02-01-01-P08',
  'CLN-04-01-15-P03->CLN-04-01-15-P04',
  '06-07-08-P04->06-07-08-P05',
  'CLN-04-01-20-P08->CLN-04-01-20-P09',
  'CLN-04-01-13-P03->CLN-04-01-13-P04',
  '07-01-01-P04->07-01-01-P05',
  'DTC-04-01-11-P06->DTC-04-01-11-P07',
  'DTC-04-01-11-P06-S06->DTC-04-01-11-P06-S07',
  '07-02-06-P02->07-02-06-P03',
  '07-02-06-P06->07-02-06-P07',
  'DTC-04-01-11-P01->DTC-04-01-11-P02',
  'DTC-04-01-11-P03->DTC-04-01-11-P04',
  'DTC-04-01-11-P03-S06->DTC-04-01-11-P03-S07',
  'ELE-01-01-01-P08->ELE-01-01-01-P09',
  'DTC-04-01-11-P09->DTC-04-01-11-P10',
  'DTC-04-01-11-P09-S06->DTC-04-01-11-P09-S07',
  'FND-03-01-05-P03->FND-03-01-05-P04',
  'FND-03-01-05-P03-S06->FND-03-01-05-P03-S07',
  'DTC-04-01-11-P02->DTC-04-01-11-P03',
  'DTC-04-01-11-P02-S05->DTC-04-01-11-P02-S06',
  'DTC-04-01-11-P02-S02->DTC-04-01-11-P02-S03',
  'DTC-04-01-11-P02-S01->DTC-04-01-11-P02-S02',
  'DTC-04-01-11-P11-S06->DTC-04-01-11-P11-S07',
  'CLN-04-01-40-P06->CLN-04-01-40-P07',
  'CLN-04-01-40-P01->CLN-04-01-40-P02',
  'CLN-04-01-40-P07->CLN-04-01-40-P08',
  'TOD-02-01-01-P05->TOD-02-01-01-P06',
  'DTC-04-01-33-P08-S06->DTC-04-01-33-P08-S07',
  'DTC-04-01-18-P06-S06->DTC-04-01-18-P06-S07',
  '08-01-03-P06->08-01-03-P07',
  'DTC-04-01-26-P06->DTC-04-01-26-P07',
  'DTC-04-01-26-P06-S06->DTC-04-01-26-P06-S07',
  'DTC-02-02-02-P05->DTC-02-02-02-P06',
  '08-01-04-P03->08-01-04-P04',
  '08-05-06-P06->08-05-06-P07',
  '08-03-04-P07->08-03-04-P08',
  '03-05-03-P07->03-05-03-P08',
  '03-05-03-P01->03-05-03-P02',
  '09-01-01-P05-S02->09-01-01-P05-S03',
  '08-15-02-P02->08-15-02-P03',
  'RNV-04-01-04-P08->RNV-04-01-04-P09',
  'HRT-04-01-13-P02->HRT-04-01-13-P03',
  'IKU-03-01-04-P04->IKU-03-01-04-P05',
  'IKU-03-01-04-P06->IKU-03-01-04-P07',
  'UHR-04-01-10-P02->UHR-04-01-10-P03',
  'UHR-04-01-10-P02->UHR-04-01-10-P05',
  'TOD-04-01-10-P03->TOD-04-01-10-P04',
  'TOD-04-01-10-P07->TOD-04-01-10-P08',
  '08-14-05-P04->08-14-05-P05',
  '10-02-02-P05->10-02-02-P06',
  '10-01-02-P05->10-01-02-P06',
  '06-03-06-P04-S02->06-03-06-P04-S03',
  '06-08-04-P05->06-08-04-P06',
  '06-02-04-P05->06-02-04-P06',
  '06-05-04-P05->06-05-04-P06',
  '06-19-02-P06->06-19-02-P07',
  '06-18-01-P06->06-18-01-P07',
  'ICR-05-01-10-P06->ICR-05-01-10-P07',
  'DTC-04-01-14-P04->DTC-04-01-14-P05',
  'DTC-04-01-14-P04-S06->DTC-04-01-14-P04-S07',
  '09-02-02-P06->09-02-02-P07',
  '06-10-07-P05->06-10-07-P06',
  '06-06-04-P05->06-06-04-P06',
  '06-06-08-P06->06-06-08-P07',
  'HTL-06-01-21-P02->HTL-06-01-21-P03',
  'HTL-06-01-21-P06->HTL-06-01-21-P07',
  'HTL-06-01-21-P06->HTL-06-01-21-P08',
  '06-18-07-P04->06-18-07-P05',
  'DTC-04-01-21-P04->DTC-04-01-21-P05',
  'DTC-04-01-21-P04-S06->DTC-04-01-21-P04-S07',
  'BDT-01-01-01-P01->BDT-01-01-01-P02',
  'OUT-04-01-01-P03->OUT-04-01-01-P04',
  '01-02-03-P02->01-02-03-P03',
  'MIC-06-01-13-P02->MIC-06-01-13-P03',
  'MIC-06-01-13-P02-S05->MIC-06-01-13-P02-S06',
  'MIC-06-01-18-P05-S06->MIC-06-01-18-P05-S07',
  'FND-01-01-03-P07->FND-01-01-03-P08',
  'FND-01-01-03-P07-S06->FND-01-01-03-P07-S07',
  'TOD-04-01-15-P04->TOD-04-01-15-P05',
  'CMP-05-01-08-P03->CMP-05-01-08-P04',
  '06-18-03-P07->06-18-03-P08',
  '06-16-03-P06->06-16-03-P07',
  'ICR-05-01-30-P03->ICR-05-01-30-P04',
  '01-03-07-P01->01-03-07-P02',
  '01-06-02-P02->01-06-02-P03',
  'DCS-01-01-09-P05-S02->DCS-01-01-09-P05-S03',
  'DCS-01-01-09-P05-S01->DCS-01-01-09-P05-S02',
  'DCS-01-01-09-P04->DCS-01-01-09-P05',
  'ICR-05-01-21-P07->ICR-05-01-21-P08',
  '06-04-02-P05->06-04-02-P06',
  'ICR-05-01-21-P03->ICR-05-01-21-P04',
  'ICR-05-01-21-P03->ICR-05-01-21-P05',
  'CLN-04-01-03-P02->CLN-04-01-03-P03',
  'TOD-04-01-12-P10-S02->TOD-04-01-12-P10-S03',
  'TOD-04-01-12-P10-S01->TOD-04-01-12-P10-S02',
  'TOD-04-01-12-P09->TOD-04-01-12-P06',
  'FND-04-01-02-P01->FND-04-01-02-P02',
  'FND-04-01-02-P01-S06->FND-04-01-02-P01-S07',
  'FND-04-01-01-P01->FND-04-01-01-P02',
  'FND-04-01-01-P01-S06->FND-04-01-01-P01-S07',
  '01-02-08-P07->01-02-08-P08',
  'FND-03-01-02-P06->FND-03-01-02-P07',
  'FND-03-01-02-P06-S06->FND-03-01-02-P06-S07',
  '01-03-06-P07->01-03-06-P08',
  'FND-04-01-05-P05->FND-04-01-05-P06',
  'FND-04-01-05-P05-S06->FND-04-01-05-P05-S07',
  'MIC-06-01-21-P05->MIC-06-01-21-P06',
  'MIC-06-01-21-P05-S06->MIC-06-01-21-P05-S07',
  'FND-04-01-05-P02->FND-04-01-05-P03',
  'FND-04-01-05-P02-S06->FND-04-01-05-P02-S07',
  'HTL-06-01-14-P01->HTL-06-01-14-P02',
  'PFB-04-01-01-P04->PFB-04-01-01-P05',
  'MIC-06-01-10-P06->MIC-06-01-10-P07',
  '08-18-08-P07->08-18-08-P08',
  'HTL-06-01-02-P06->HTL-06-01-02-P07',
  '03-05-02-P01->03-05-02-P02',
  'BDT-01-01-03-P09->BDT-01-01-03-P10',
  'STL-04-01-18-P07->STL-04-01-18-P08',
  'TOD-04-01-17-P03->TOD-04-01-17-P04',
  'TOD-04-01-17-P07->TOD-04-01-17-P08',
  '03-12-01-P05->03-12-01-P06',
  'MIC-06-01-14-P02-S05->MIC-06-01-14-P02-S06',
  '06-05-08-P02->06-05-08-P03',
  'MIC-06-01-14-P03-S05->MIC-06-01-14-P03-S06',
  '01-02-12-P04-S02->01-02-12-P04-S03',
  'UHR-04-01-06-P06->UHR-04-01-06-P07',
  'UHR-04-01-06-P06->UHR-04-01-06-P08',
  'STL-02-01-01-P01->STL-02-01-01-P02',
  'PFB-01-01-09-P06->PFB-01-01-09-P07',
  'ICR-05-01-28-P02->ICR-05-01-28-P03',
  'MIC-04-01-01-P07->MIC-04-01-01-P08',
  '02-01-06-P11-S01->02-01-06-P11-S02',
  '10-01-02-P06->10-01-02-P07',
  'DEC-02-01-01-P01->DEC-02-01-01-P02',
  'DEC-05-01-01-P03->DEC-05-01-01-P04',
  'DEC-02-01-01-P03->DEC-02-01-01-P04',
  'DEC-02-01-01-P02->DEC-02-01-01-P05',
  'FAC-01-01-04-P05->FAC-01-01-04-P06',
  'MEP-02-01-02-P03-S05->MEP-02-01-02-P03-S06',
  'HRT-01-01-01-P04->HRT-01-01-01-P05',
  'HRT-01-01-01-P05->HRT-01-01-01-P06',
  'RNV-04-01-01-P03->RNV-04-01-01-P04',
  'HTL-06-01-14-P07->HTL-06-01-14-P08',
  'HTL-06-01-14-P04->HTL-06-01-14-P05',
  'ICR-05-01-19-P03->ICR-05-01-19-P04',
  'PLU-04-01-01-P02->PLU-04-01-01-P05',
  'PFB-01-01-04-P02->PFB-01-01-04-P05',
  'PFB-01-01-04-P11->PFB-01-01-04-P13',
  'PFB-01-01-04-P04->PFB-01-01-04-P05',
  'PFB-04-01-05-P03->PFB-04-01-05-P04',
  'DTC-04-01-03-P03-S06->DTC-04-01-03-P03-S07',
  'DTC-04-01-03-P07-S06->DTC-04-01-03-P07-S07',
  'BDT-01-01-02-P07->BDT-01-01-02-P08',
  'DANGER-01-01-16-P06->DANGER-01-01-16-P07',
  '07-06-05-P04->07-06-05-P05',
  'BDT-09-01-02-P10->BDT-09-01-02-P11',
  'BDT-09-01-02-P08->BDT-09-01-02-P09',
  'ELE-03-02-01-P03->ELE-03-02-01-P04',
  'BDT-09-01-02-P09->BDT-09-01-02-P10',
  'BDT-09-01-02-P09-S02->BDT-09-01-02-P09-S03',
  'BDT-09-01-02-P09-S01->BDT-09-01-02-P09-S02',
  'BDT-01-01-06-P06->BDT-01-01-06-P07',
  'BDT-01-01-06-P06->BDT-01-01-06-P08',
  'BDT-09-01-02-P07->BDT-09-01-02-P08',
  '07-06-03-P07->07-06-03-P08',
  '06-15-07-P03->06-15-07-P04',
  '06-15-02-P04->06-15-02-P05',
  '01-02-10-P06-S02->01-02-10-P06-S03',
  '01-02-11-P06-S03->01-02-11-P06-S04',
  'HTL-06-01-18-P06->HTL-06-01-18-P07',
  'HTL-06-01-18-P06->HTL-06-01-18-P08',
  'HTL-02-01-01-P03->HTL-02-01-01-P04',
  'HTL-04-01-02-P04->HTL-04-01-02-P05',
  'HTL-04-01-02-P07->HTL-04-01-02-P08',
  'HTL-06-01-14-P06->HTL-06-01-14-P07',
  'HTL-06-01-14-P06->HTL-06-01-14-P08',
  'HTL-06-01-20-P03->HTL-06-01-20-P04',
  'HTL-06-01-20-P06->HTL-06-01-20-P07',
  'HTL-06-01-20-P06->HTL-06-01-20-P08',
  'CMP-05-01-10-P07->CMP-05-01-10-P08',
  'BDT-06-01-03-P02->BDT-06-01-03-P03',
  'BDT-06-01-03-P02->BDT-06-01-03-P05',
  '05-04-02-P04->05-04-02-P05',
  '06-10-03-P08->06-10-03-P09',
  '06-11-03-P08->06-11-03-P09',
  '06-12-03-P08->06-12-03-P09',
  '06-13-01-P01->06-13-01-P02',
  '06-13-01-P02->06-13-01-P03',
  '06-13-02-P01->06-13-02-P02',
  '06-13-03-P04->06-13-03-P05',
  '06-13-03-P08->06-13-03-P09',
  '06-13-04-P01->06-13-04-P02',
  '06-13-06-P02->06-13-06-P03',
  '06-13-07-P01->06-13-07-P02',
  '06-13-07-P05->06-13-07-P06',
  '06-14-03-P08->06-14-03-P09',
  '06-15-03-P08->06-15-03-P09',
  '05-01-01-P09->05-01-01-P10',
  '08-05-04-P07->08-05-04-P08',
  '06-16-03-P08->06-16-03-P09',
  '06-18-03-P08->06-18-03-P09',
  '06-17-03-P04->06-17-03-P05',
  'HRT-04-01-06-P03->HRT-04-01-06-P04',
  'HRT-04-01-06-P03-S02->HRT-04-01-06-P03-S03',
  'HRT-04-01-06-P03-S01->HRT-04-01-06-P03-S02',
  '02-01-06-P08->02-01-06-P09',
  'MIC-06-01-10-P08->MIC-06-01-10-P09',
  'MIC-06-01-10-P08-S06->MIC-06-01-10-P08-S07',
  'MIC-02-01-03-P12-S05->MIC-02-01-03-P12-S06',
  'MIC-02-01-03-P12-S02->MIC-02-01-03-P12-S03',
  'MIC-02-01-03-P12-S01->MIC-02-01-03-P12-S02',
  'PFB-04-01-04-P04->PFB-04-01-04-P05',
  'PFB-00-01-02-P13->PFB-00-01-02-P14',
  'MIC-02-01-02-P04->MIC-02-01-02-P05',
  'MIC-02-01-02-P04-S05->MIC-02-01-02-P04-S06',
  'MIC-02-01-02-P04-S02->MIC-02-01-02-P04-S03',
  'MIC-02-01-02-P04-S01->MIC-02-01-02-P04-S02',
  'TOD-04-01-07-P01-S02->TOD-04-01-07-P01-S03',
  'TOD-04-01-07-P01-S01->TOD-04-01-07-P01-S02',
  'TOD-04-01-07-P08->TOD-04-01-07-P09',
  'OUT-03-02-01-P08-S02->OUT-03-02-01-P08-S03',
  'OUT-03-02-01-P08-S01->OUT-03-02-01-P08-S02',
  'TOD-04-01-07-P10-S02->TOD-04-01-07-P10-S03',
  'TOD-04-01-07-P10-S01->TOD-04-01-07-P10-S02',
  'TOD-04-01-07-P06->TOD-04-01-07-P07',
  'FND-04-01-15-P06->FND-04-01-15-P07',
  'FND-04-01-15-P06-S06->FND-04-01-15-P06-S07',
  'WPI-01-01-03-P08->WPI-01-01-03-P09',
  'MEP-02-01-01-P05->MEP-02-01-01-P06',
  'DTC-04-01-08-P06->DTC-04-01-08-P07',
  'DTC-04-01-08-P06-S06->DTC-04-01-08-P06-S07',
  '02-06-02-P04->02-06-02-P05',
  '02-05-02-P04->02-05-02-P05',
  'MIC-06-01-02-P08-S06->MIC-06-01-02-P08-S07',
  '04-04-02-P02->04-04-02-P03',
  'FND-06-01-02-P04->FND-06-01-02-P05',
  'FND-06-01-02-P04-S06->FND-06-01-02-P04-S07',
  'FND-06-01-01-P02-S06->FND-06-01-01-P02-S07',
  'TOD-04-01-02-P04->TOD-04-01-02-P05',
  'TOD-04-01-02-P04-S02->TOD-04-01-02-P04-S03',
  'TOD-04-01-02-P04-S01->TOD-04-01-02-P04-S02',
  'STL-04-01-27-P05->STL-04-01-27-P06',
  '06-07-06-P06->06-07-06-P07',
  '06-04-03-P05->06-04-03-P06',
  '06-04-01-P06->06-04-01-P07',
  '06-04-04-P01->06-04-04-P02',
  '06-04-04-P03->06-04-04-P04',
  '06-04-09-P02->06-04-09-P03',
  '06-04-04-P06->06-04-04-P07',
  '06-04-01-P03->06-04-01-P04',
  '06-04-06-P02->06-04-06-P03',
  '06-04-09-P01->06-04-09-P02',
  '06-04-05-P02->06-04-05-P03',
  '06-04-05-P05->06-04-05-P06',
  '06-04-05-P04->06-04-05-P05',
  '06-04-05-P06->06-04-05-P07',
  '06-04-08-P05->06-04-08-P06',
  '06-04-08-P03->06-04-08-P04',
  '06-14-06-P02->06-14-06-P03',
  '06-14-06-P01->06-14-06-P02',
  '06-14-06-P08->06-14-06-P09',
  '05-13-02-P03->05-13-02-P04',
  'IKU-03-01-08-P06-S02->IKU-03-01-08-P06-S03',
  'IKU-03-01-08-P06-S01->IKU-03-01-08-P06-S02',
  'IKU-03-01-07-P01-S02->IKU-03-01-07-P01-S03',
  'IKU-03-01-07-P01-S01->IKU-03-01-07-P01-S02',
  'MIC-06-01-07-P01->MIC-06-01-07-P02',
  'MIC-06-01-07-P01-S06->MIC-06-01-07-P01-S07',
  'IKU-01-01-01-P04->IKU-01-01-01-P05',
  'IKU-01-01-01-P01->IKU-01-01-01-P02',
  'IKU-01-01-01-P01-S05->IKU-01-01-01-P01-S06',
  'IKU-01-01-01-P01-S02->IKU-01-01-01-P01-S03',
  'IKU-01-01-01-P01-S01->IKU-01-01-01-P01-S02',
  'MIC-06-01-07-P06->MIC-06-01-07-P07',
  'MIC-06-01-07-P06-S06->MIC-06-01-07-P06-S07',
  'HTL-06-01-09-P06->HTL-06-01-09-P07',
  'HTL-06-01-09-P06->HTL-06-01-09-P08',
  'MIC-06-01-07-P04->MIC-06-01-07-P05',
  'MIC-06-01-07-P04-S06->MIC-06-01-07-P04-S07',
  'HVA-04-01-01-P01->HVA-04-01-01-P02',
  '06-02-07-P03->06-02-07-P04',
  '06-02-07-P01->06-02-07-P02',
  'CMP-05-01-06-P06->CMP-05-01-06-P07',
  'HTL-06-01-09-P07->HTL-06-01-09-P08',
  'HTL-03-01-01-P04->HTL-03-01-01-P05',
  'HTL-03-01-01-P07->HTL-03-01-01-P08',
  'CMP-05-01-06-P04->CMP-05-01-06-P05',
  'DEC-03-01-01-P04-S01->DEC-03-01-01-P04-S02',
  'PLU-05-01-01-P04->PLU-05-01-01-P05',
  'IKU-01-01-02-P03->IKU-01-01-02-P04',
  'DEC-03-01-02-P06->DEC-03-01-02-P07',
  'DEC-03-01-02-P06->DEC-03-01-02-P08',
  '03-12-01-P01->03-12-01-P02',
  'DEC-03-01-02-P05->DEC-03-01-02-P06',
  'IKU-01-01-02-P01->IKU-01-01-02-P02',
  'CLN-04-01-29-P05->CLN-04-01-29-P06',
  'ICR-05-01-17-P04->ICR-05-01-17-P05',
  'FND-01-01-02-P01->FND-01-01-02-P02',
  'FND-01-01-02-P01-S05->FND-01-01-02-P01-S06',
  'FND-01-01-02-P01-S01->FND-01-01-02-P01-S02',
  'CMP-05-01-12-P02->CMP-05-01-12-P03',
  'TOD-04-01-12-P04->TOD-04-01-12-P05',
  'MIC-03-01-01-P02->MIC-03-01-01-P03',
  'MUN-01-01-01-P01->MUN-01-01-01-P02',
  'OUT-03-02-01-P07->OUT-03-02-01-P08',
  'DTC-04-01-38-P07-S05->DTC-04-01-38-P07-S06',
  'DTC-04-01-38-P07-S01->DTC-04-01-38-P07-S02',
  'DTC-04-01-17-P04->DTC-04-01-17-P05',
  '06-14-05-P04->06-14-05-P05',
  'FND-01-01-02-P03->FND-01-01-02-P04',
  'FND-01-01-02-P07->FND-01-01-02-P08',
  'MIC-03-01-01-P02-S06->MIC-03-01-01-P02-S07',
  'MUN-01-01-01-P01-S02->MUN-01-01-01-P01-S03',
  'MUN-01-01-01-P01-S01->MUN-01-01-01-P01-S02',
  'DTC-04-01-34-P07-S06->DTC-04-01-34-P07-S07',
  'DTC-01-01-01-P06->DTC-01-01-01-P07',
  'DTC-04-01-17-P04-S06->DTC-04-01-17-P04-S07',
  'HTL-06-01-09-P02->HTL-06-01-09-P03',
  'HTL-03-01-01-P06->HTL-03-01-01-P07',
  'FND-01-01-02-P03-S06->FND-01-01-02-P03-S07',
  'FND-01-01-02-P07-S06->FND-01-01-02-P07-S07',
  'QR-01-01-07-P01-S02->QR-01-01-07-P01-S03',
  'QR-01-01-07-P01-S01->QR-01-01-07-P01-S02',
  '01-02-04-P05->01-02-04-P06',
  'STL-04-01-14-P02->STL-04-01-14-P03',
  'STL-04-01-14-P06->STL-04-01-14-P07',
  'BDT-01-01-04-P01->BDT-01-01-04-P02',
  'BDT-01-01-06-P08-S02->BDT-01-01-06-P08-S03',
  'BDT-01-01-06-P08-S01->BDT-01-01-06-P08-S02',
  'BDT-01-01-04-P03->BDT-01-01-04-P04',
  'BDT-01-01-04-P03-S02->BDT-01-01-04-P03-S03',
  'BDT-01-01-04-P03-S01->BDT-01-01-04-P03-S02',
  'BDT-09-01-02-P05->BDT-09-01-02-P06',
  'BDT-01-01-06-P07->BDT-01-01-06-P08',
  '08-18-04-P06->08-18-04-P07',
  'IBU-03-01-01-P03->IBU-03-01-01-P04',
  'IBU-02-01-01-P04->IBU-02-01-01-P05',
  'IBU-01-01-01-P05->IBU-01-01-01-P06',
  'IBU-01-01-01-P05-S02->IBU-01-01-01-P05-S03',
  'IBU-01-01-01-P05-S01->IBU-01-01-01-P05-S02',
  'IBU-01-01-02-P02->IBU-01-01-02-P03',
  '08-18-04-P06-S01->08-18-04-P06-S02',
  'HVA-05-01-01-P04->HVA-05-01-01-P05',
  '09-05-01-P03->09-05-01-P04',
  '06-13-05-P04->06-13-05-P05',
  '06-13-05-P07->06-13-05-P08',
  '06-13-07-P02->06-13-07-P03',
  'ICR-05-01-24-P02->ICR-05-01-24-P03',
  'PLU-05-01-01-P02->PLU-05-01-01-P03',
  'PLU-05-01-01-P02->PLU-05-01-01-P05',
  'STL-04-01-18-P03->STL-04-01-18-P04',
  'DEC-02-02-01-P03-S01->DEC-02-02-01-P03-S02',
  'BDT-09-01-02-P03->BDT-09-01-02-P04',
  'BDT-09-01-02-P03-S02->BDT-09-01-02-P03-S03',
  'BDT-09-01-02-P03-S01->BDT-09-01-02-P03-S02',
  'STL-04-01-09-P09->STL-04-01-09-P10',
  '06-19-07-P07->06-19-07-P08',
  '06-19-06-P04->06-19-06-P05',
  '05-05-04-P04->05-05-04-P05',
  'PLU-02-01-03-P01->PLU-02-01-03-P02',
  'DEC-02-02-02-P04->DEC-02-02-02-P05',
  'BDT-01-01-06-P04->BDT-01-01-06-P05',
  'TOD-01-01-01-P07->TOD-01-01-01-P08',
  'TOD-01-01-01-P07-S02->TOD-01-01-01-P07-S03',
  'TOD-01-01-01-P07-S01->TOD-01-01-01-P07-S02',
  'FND-06-01-04-P01->FND-06-01-04-P02',
  'FND-06-01-04-P01-S05->FND-06-01-04-P01-S06',
  'FND-06-01-04-P01-S02->FND-06-01-04-P01-S03',
  'FND-06-01-04-P01-S01->FND-06-01-04-P01-S02',
  'TOD-04-01-01-P01->TOD-04-01-01-P02',
  'TOD-01-01-01-P01->TOD-01-01-01-P02',
  'TOD-01-01-01-P01-S02->TOD-01-01-01-P01-S03',
  'TOD-01-01-01-P01-S01->TOD-01-01-01-P01-S02',
  'OUT-04-02-01-P03->OUT-04-02-01-P04',
  'OUT-02-02-01-P01->OUT-02-02-01-P02',
  'OUT-04-02-01-P03-S02->OUT-04-02-01-P03-S03',
  'OUT-04-02-01-P03-S01->OUT-04-02-01-P03-S02',
  'BDT-09-01-01-P10->BDT-09-01-01-P11',
  'BDT-08-01-01-P06-S02->BDT-08-01-01-P06-S03',
  'BDT-08-01-01-P06-S01->BDT-08-01-01-P06-S02',
  'BDT-09-01-01-P03->BDT-09-01-01-P04',
  'CMP-01-01-02-P05->CMP-01-01-02-P06',
  'CMP-01-01-02-P05-S02->CMP-01-01-02-P05-S03',
  'CMP-01-01-02-P05-S01->CMP-01-01-02-P05-S02',
  'PLU-03-01-01-P07->PLU-03-01-01-P08',
  'ELE-02-01-02-P03->ELE-02-01-02-P04',
  '06-07-03-P04->06-07-03-P05',
  'DTC-03-01-01-P07->DTC-03-01-01-P08',
  'DTC-03-01-01-P07->DTC-03-01-01-P09',
  'DTC-03-01-01-P07-S06->DTC-03-01-01-P07-S07',
  'CLN-03-01-02-P03->CLN-03-01-02-P04',
  'CLN-03-01-02-P03->CLN-03-01-02-P05',
  '08-18-08-P09-S01->08-18-08-P09-S02',
  '08-18-08-P09->08-18-08-P10',
  '01-07-01-P03->01-07-01-P04',
  '01-07-02-P04-S01->01-07-02-P04-S02',
  '08-18-09-P05-S01->08-18-09-P05-S02',
  'CLN-01-01-01-P05->CLN-01-01-01-P06',
  'CLN-01-01-01-P05->CLN-01-01-01-P10',
  'CLN-03-01-02-P07->CLN-03-01-02-P08',
  '01-07-01-P03-S01->01-07-01-P03-S02',
  'CLN-04-01-27-P04->CLN-04-01-27-P05',
  'DTC-01-01-01-P04->DTC-01-01-01-P05',
  'DTC-01-01-01-P04-S06->DTC-01-01-01-P04-S07',
  '08-19-04-P04-S01->08-19-04-P04-S02',
  'BDT-01-01-01-P07->BDT-01-01-01-P08',
  'BDT-01-01-01-P07-S02->BDT-01-01-01-P07-S03',
  'BDT-01-01-01-P07-S01->BDT-01-01-01-P07-S02',
  'WPI-01-01-07-P01->WPI-01-01-07-P02',
  'CLN-04-01-25-P05->CLN-04-01-25-P06',
  'HRT-04-01-18-P02-S02->HRT-04-01-18-P02-S03',
  'HRT-04-01-18-P02-S01->HRT-04-01-18-P02-S02',
  '07-03-08-P05->07-03-08-P06',
  '08-14-03-P03->08-14-03-P04',
  'FND-06-01-02-P02->FND-06-01-02-P03',
  'FND-06-01-02-P02-S06->FND-06-01-02-P02-S07',
  '08-14-03-P05->08-14-03-P06',
  '06-20-01-P02->06-20-01-P03',
  '05-14-02-P02->05-14-02-P03',
  '06-06-10-P04->06-06-10-P05',
  'STL-04-01-28-P06->STL-04-01-28-P07',
  '08-14-03-P04->08-14-03-P05',
  '06-20-04-P04-S02->06-20-04-P04-S03',
  '09-01-02-P07->09-01-02-P08',
  '06-10-05-P08->06-10-05-P09',
  'HRT-02-02-01-P06->HRT-02-02-01-P07',
  'HRT-02-02-01-P06->HRT-02-02-01-P08',
  'HRT-02-02-01-P06-S02->HRT-02-02-01-P06-S03',
  'HRT-02-02-01-P06-S01->HRT-02-02-01-P06-S02',
  'HRT-01-01-02-P05->HRT-01-01-02-P06',
  'HRT-02-01-01-P04->HRT-02-01-01-P05',
  'HRT-04-01-06-P01->HRT-04-01-06-P02',
  'HRT-04-01-06-P07->HRT-04-01-06-P08',
  'HRT-04-01-06-P07-S02->HRT-04-01-06-P07-S03',
  'HRT-04-01-06-P07-S01->HRT-04-01-06-P07-S02',
  'HRT-04-01-19-P09-S02->HRT-04-01-19-P09-S03',
  'HRT-04-01-19-P09-S01->HRT-04-01-19-P09-S02',
  'FND-02-01-03-P03->FND-02-01-03-P04',
  'FND-02-01-03-P03-S06->FND-02-01-03-P03-S07',
  'FND-04-01-04-P03->FND-04-01-04-P04',
  'FND-04-01-04-P03->FND-04-01-04-P05',
  'FND-04-01-04-P03-S06->FND-04-01-04-P03-S07',
  '01-02-10-P03-S02->01-02-10-P03-S03',
  'FND-04-01-12-P03->FND-04-01-12-P04',
  'FND-04-01-12-P03-S06->FND-04-01-12-P03-S07',
  '01-03-01-P04->01-03-01-P05',
  '01-02-08-P03-S03->01-02-08-P03-S04',
  '03-04-05-P08->03-04-05-P09',
  '03-12-03-P08->03-12-03-P09',
  '09-01-03-P08->09-01-03-P09',
  'RNV-04-01-22-P07->RNV-04-01-22-P08',
  'DEC-06-01-01-P07->DEC-06-01-01-P08',
  'BDT-08-01-02-P06-S02->BDT-08-01-02-P06-S03',
  'BDT-08-01-02-P06-S01->BDT-08-01-02-P06-S02',
  'FND-04-01-05-P07->FND-04-01-05-P08',
  'FND-04-01-05-P07-S06->FND-04-01-05-P07-S07',
  '01-01-07-P04-S01->01-01-07-P04-S02',
  'TOD-04-01-09-P11-S02->TOD-04-01-09-P11-S03',
  'TOD-04-01-09-P11-S01->TOD-04-01-09-P11-S02',
  'TOD-04-01-09-P03->TOD-04-01-09-P04',
  'TOD-01-01-01-P06->TOD-01-01-01-P07',
  'TOD-01-01-01-P06->TOD-01-01-01-P08',
  '02-02-03-P06->02-02-03-P07',
  '01-06-02-P05->01-06-02-P06',
  '01-01-07-P04->01-01-07-P05',
  '01-04-01-P07->01-04-01-P08',
  'HRT-03-01-01-P07->HRT-03-01-01-P08',
  '01-02-15-P01-S01->01-02-15-P01-S02',
  '01-02-15-P01->01-02-15-P02',
  '01-02-15-P04-S01->01-02-15-P04-S02',
  '01-03-02-P04-S02->01-03-02-P04-S03',
  '01-02-12-P05-S01->01-02-12-P05-S02',
  '01-03-02-P03-S01->01-03-02-P03-S02',
  'TOD-04-01-01-P07->TOD-04-01-01-P08',
  'TOD-04-01-14-P02->TOD-04-01-14-P03',
  '01-02-11-P04->01-02-11-P05',
  '01-02-11-P04-S02->01-02-11-P04-S03',
  '01-02-11-P06-S01->01-02-11-P06-S02',
  '01-01-11-P05->01-01-11-P06',
  '01-01-11-P02->01-01-11-P03',
  '01-02-11-P02->01-02-11-P03',
  '01-02-11-P04-S01->01-02-11-P04-S02',
  'FND-06-01-01-P07-S06->FND-06-01-01-P07-S07',
  'MIC-03-01-01-P07-S06->MIC-03-01-01-P07-S07',
  '06-08-07-P05->06-08-07-P06',
  'STL-04-01-12-P06->STL-04-01-12-P07',
  'HRT-04-01-10-P08->HRT-04-01-10-P09',
  'HRT-04-01-10-P06->HRT-04-01-10-P07',
  'HRT-04-01-10-P01->HRT-04-01-10-P02',
  'DEC-02-02-02-P07->DEC-02-02-02-P08',
  'TOD-04-01-01-P06->TOD-04-01-01-P07',
  'TOD-04-01-01-P06-S02->TOD-04-01-01-P06-S03',
  'TOD-04-01-01-P06-S01->TOD-04-01-01-P06-S02',
  'FND-06-01-03-P04-S06->FND-06-01-03-P04-S07',
  'TOD-04-01-02-P06->TOD-04-01-02-P07',
  'TOD-04-01-02-P06->TOD-04-01-02-P09',
  'MIC-06-01-12-P06->MIC-06-01-12-P07',
  'MIC-06-01-12-P06-S06->MIC-06-01-12-P06-S07',
  'MIC-03-01-01-P01->MIC-03-01-01-P02',
  'MIC-03-01-01-P01->MIC-03-01-01-P05',
  'MIC-03-01-01-P01-S05->MIC-03-01-01-P01-S06',
  'MIC-03-01-01-P01-S02->MIC-03-01-01-P01-S03',
  'MIC-03-01-01-P01-S01->MIC-03-01-01-P01-S02',
  'MIC-03-01-01-P07->MIC-03-01-01-P08',
  '09-03-02-P07->09-03-02-P08',
  '02-02-01-P02->02-02-01-P03',
  'TOD-02-01-02-P08->TOD-02-01-02-P09',
  'ICR-05-01-18-P01->ICR-05-01-18-P02',
  'ICR-05-01-18-P07->ICR-05-01-18-P08',
  'UHR-04-01-04-P03->UHR-04-01-04-P04',
  'UHR-04-01-04-P01->UHR-04-01-04-P02',
  'UHR-04-01-10-P01->UHR-04-01-10-P02',
  'FND-04-01-04-P09->FND-04-01-04-P10',
  'FND-04-01-04-P09->FND-04-01-04-P11',
  'FND-04-01-04-P09-S06->FND-04-01-04-P09-S07',
  'STL-04-01-21-P06->STL-04-01-21-P07',
  'MIC-06-01-12-P01->MIC-06-01-12-P02',
  'MIC-06-01-12-P01-S05->MIC-06-01-12-P01-S06',
  'MIC-06-01-12-P01-S02->MIC-06-01-12-P01-S03',
  'MIC-06-01-12-P01-S01->MIC-06-01-12-P01-S02',
  'FND-06-01-04-P05->FND-06-01-04-P06',
  'FND-06-01-04-P05-S06->FND-06-01-04-P05-S07',
  'FND-06-01-03-P04->FND-06-01-03-P05',
  'ICR-05-01-01-P03->ICR-05-01-01-P04',
  'BDT-02-01-01-P01->BDT-02-01-01-P02',
  'BDT-02-01-01-P01-S02->BDT-02-01-01-P01-S03',
  'BDT-02-01-01-P01-S01->BDT-02-01-01-P01-S02',
  '01-05-03-P06->01-05-03-P07',
  '01-05-03-P06-S01->01-05-03-P06-S02',
  '01-02-10-P02-S02->01-02-10-P02-S03',
  'OUT-04-02-01-P07->OUT-04-02-01-P08',
  'OUT-04-02-01-P04->OUT-04-02-01-P05',
  'CMP-05-01-08-P08->CMP-05-01-08-P09',
  'CMP-05-01-08-P08-S02->CMP-05-01-08-P08-S03',
  'CMP-05-01-08-P08-S01->CMP-05-01-08-P08-S02',
  '01-05-03-P01->01-05-03-P02',
  '01-05-03-P01-S01->01-05-03-P01-S02',
  '01-05-03-P05->01-05-03-P06',
  '01-01-05-P01->01-01-05-P02',
  'CMP-05-01-08-P07->CMP-05-01-08-P08',
  'SITE-02-01-01-P05->SITE-02-01-01-P06',
  '01-01-07-P01->01-01-07-P02',
  '07-06-09-P02->07-06-09-P03',
  'ICR-05-01-05-P04->ICR-05-01-05-P05',
  'DEC-03A-01-01-P04->DEC-03A-01-01-P05',
  'RNV-04-01-21-P05->RNV-04-01-21-P06',
  'STL-04-01-29-P06->STL-04-01-29-P07',
  'STL-04-01-29-P06->STL-04-01-29-P08',
  'ICR-05-01-15-P03->ICR-05-01-15-P04',
  '06-15-05-P04->06-15-05-P05',
  '06-11-05-P05->06-11-05-P06',
  'HTL-06-01-15-P03->HTL-06-01-15-P04',
  'HTL-06-01-15-P02->HTL-06-01-15-P03',
  '09-02-03-P07->09-02-03-P08',
  '06-07-02-P03->06-07-02-P04',
  '06-07-02-P05->06-07-02-P06',
  'DEC-03-01-02-P01->DEC-03-01-02-P02',
  'HRT-02-01-01-P01->HRT-02-01-01-P02',
  'BDT-07-01-01-P02->BDT-07-01-01-P05',
  'HTL-06-01-01-P02->HTL-06-01-01-P03',
  'HRT-04-01-15-P02->HRT-04-01-15-P03',
  'MUN-03-01-01-P04->MUN-03-01-01-P05',
  'RNV-04-01-02-P03->RNV-04-01-02-P04',
  'HRT-01-01-01-P08->HRT-01-01-01-P09',
  'HRT-01-01-01-P03->HRT-01-01-01-P04',
  'HRT-01-01-01-P03->HRT-01-01-01-P05',
  'DEC-01-01-01-P06->DEC-01-01-01-P08',
  '04-02-04-P03->04-02-04-P04',
  'HRT-04-01-06-P08->HRT-04-01-06-P09',
  'HRT-04-01-01-P02->HRT-04-01-01-P03',
  'STL-04-01-25-P03->STL-04-01-25-P04',
  'DTC-04-01-18-P03->DTC-04-01-18-P04',
  'DTC-04-01-17-P03->DTC-04-01-17-P04',
  '05-05-08-P05->05-05-08-P06',
  '09-04-01-P05->09-04-01-P06',
  'STL-04-01-27-P03->STL-04-01-27-P04',
  'DTC-04-01-23-P02->DTC-04-01-23-P03',
  'CLN-01-01-01-P03->CLN-01-01-01-P04',
  'HRT-02-02-01-P02->HRT-02-02-01-P03',
  'HRT-04-01-11-P02->HRT-04-01-11-P03',
  'HRT-04-01-08-P07->HRT-04-01-08-P08',
  'HRT-02-02-01-P05->HRT-02-02-01-P06',
  'HTL-06-01-23-P03->HTL-06-01-23-P04',
  'HTL-06-01-23-P07->HTL-06-01-23-P08',
  'HRT-04-01-12-P01->HRT-04-01-12-P02',
  'HRT-04-01-12-P08->HRT-04-01-12-P09',
  '06-20-04-P05->06-20-04-P06',
  '05-14-01-P06->05-14-01-P07',
  'ICR-01-01-02-P07->ICR-01-01-02-P08',
  'CMP-05-01-25-P07->CMP-05-01-25-P08',
  'CMP-05-01-25-P01->CMP-05-01-25-P02',
  'HTL-06-01-08-P06->HTL-06-01-08-P07',
  'HTL-06-01-08-P06->HTL-06-01-08-P08',
  'HTL-06-01-08-P01->HTL-06-01-08-P02',
  'HTL-06-01-08-P07->HTL-06-01-08-P08',
  'HTL-06-01-08-P04->HTL-06-01-08-P05',
  'CMP-05-01-25-P03->CMP-05-01-25-P04',
  'CMP-05-01-25-P04->CMP-05-01-25-P05',
  'HTL-06-01-23-P01->HTL-06-01-23-P02',
  'HTL-06-01-23-P06->HTL-06-01-23-P07',
  'HTL-06-01-23-P06->HTL-06-01-23-P08',
  'CLN-04-01-40-P08->CLN-04-01-40-P09',
  'CLN-04-01-40-P02->CLN-04-01-40-P03',
  '08-14-06-P05->08-14-06-P06',
  '08-01-02-P02->08-01-02-P03',
  'FND-04-01-04-P04->FND-04-01-04-P05',
  'FND-04-01-04-P10->FND-04-01-04-P11',
  'FND-04-01-04-P11->FND-04-01-04-P12',
  'FND-04-01-06-P08->FND-04-01-06-P09',
  'FND-04-01-06-P08-S05->FND-04-01-06-P08-S06',
  'FND-04-01-06-P08-S01->FND-04-01-06-P08-S02',
  'FND-04-01-04-P12-S06->FND-04-01-04-P12-S07',
  'FND-04-01-04-P02->FND-04-01-04-P03',
  'FND-04-01-04-P02-S05->FND-04-01-04-P02-S06',
  'FND-04-01-04-P02-S02->FND-04-01-04-P02-S03',
  'FND-04-01-04-P02-S01->FND-04-01-04-P02-S02',
  'FND-04-01-05-P09->FND-04-01-05-P10',
  'FND-04-01-05-P09->FND-04-01-05-P11',
  'FND-04-01-05-P09-S06->FND-04-01-05-P09-S07',
  'FND-02-01-03-P02-S05->FND-02-01-03-P02-S06',
  'FND-02-01-03-P02-S01->FND-02-01-03-P02-S02',
  'FND-04-01-03-P06->FND-04-01-03-P07',
  'FND-04-01-03-P06-S05->FND-04-01-03-P06-S06',
  'FND-04-01-03-P06-S01->FND-04-01-03-P06-S02',
  'FND-04-01-05-P08->FND-04-01-05-P09',
  'FND-04-01-05-P08-S06->FND-04-01-05-P08-S07',
  '01-07-03-P02->01-07-03-P03',
  'FND-04-01-05-P11->FND-04-01-05-P12',
  'FND-04-01-05-P10->FND-04-01-05-P11',
  'FND-04-01-05-P10-S06->FND-04-01-05-P10-S07',
  'FND-04-01-09-P08->FND-04-01-09-P09',
  'FND-04-01-09-P08-S06->FND-04-01-09-P08-S07',
  'BDT-01-01-01-P04->BDT-01-01-01-P05',
  'PLU-07-01-01-P01->PLU-07-01-01-P02',
  'BDT-01-01-01-P08-S02->BDT-01-01-01-P08-S03',
  'BDT-01-01-01-P08-S01->BDT-01-01-01-P08-S02',
  'FND-04-01-09-P05->FND-04-01-09-P06',
  'FND-04-01-09-P05-S06->FND-04-01-09-P05-S07',
  'BDT-01-01-01-P03->BDT-01-01-01-P04',
  'TOD-04-01-20-P07->TOD-04-01-20-P08',
  '01-03-06-P05->01-03-06-P06',
  'FND-04-01-04-P08->FND-04-01-04-P09',
  '01-05-01-P04->01-05-01-P05',
  '01-03-06-P03->01-03-06-P04',
  '01-03-06-P08->01-03-06-P09',
  '08-13-01-P04->08-13-01-P05',
  '08-14-01-P04->08-14-01-P05',
  '08-05-01-P04->08-05-01-P05',
  '03-04-05-P02->03-04-05-P03',
  'FND-04-01-04-P05->FND-04-01-04-P06',
  'HRT-04-01-01-P01->HRT-04-01-01-P02',
  '03-09-01-P02->03-09-01-P03',
  '03-09-03-P02->03-09-03-P03',
  '01-01-05-P03->01-01-05-P04',
  'FND-03-01-01-P07->FND-03-01-01-P08',
  '08-05-05-P06->08-05-05-P07',
  '08-19-07-P07->08-19-07-P08',
  '08-13-02-P07->08-13-02-P08',
  '08-05-05-P05->08-05-05-P06',
  'BDT-07-01-03-P02->BDT-07-01-03-P03',
  '08-04-04-P07->08-04-04-P08',
  'CLN-04-01-05-P04->CLN-04-01-05-P05',
  'CLN-04-01-45-P02->CLN-04-01-45-P03',
  'CLN-04-01-05-P08->CLN-04-01-05-P09',
  '01-02-08-P07-S01->01-02-08-P07-S02',
  '01-02-08-P07-S02->01-02-08-P07-S03',
  '08-13-01-P04-S02->08-13-01-P04-S03',
  '08-05-01-P03->08-05-01-P04',
  '07-05-03-P02->07-05-03-P03',
  'ELV-01-01-02-P01->ELV-01-01-02-P02',
  'ELV-01-01-02-P02->ELV-01-01-02-P05',
  '10-01-04-P02->10-01-04-P03',
  '10-01-04-P03->10-01-04-P04',
  '10-01-04-P04->10-01-04-P05',
  '10-01-04-P05->10-01-04-P06',
  '10-02-01-P05->10-02-01-P06',
  '10-01-01-P04->10-01-01-P05',
  '10-01-02-P04->10-01-02-P05',
  '10-02-04-P04->10-02-04-P05',
  '10-02-04-P05->10-02-04-P06',
  'ELV-01-01-02-P03->ELV-01-01-02-P04',
  '10-01-05-P04->10-01-05-P05',
  '10-02-05-P04->10-02-05-P05',
  '10-01-05-P05->10-01-05-P06',
  '07-05-10-P05->07-05-10-P06',
  'HTL-01-02-01-P02->HTL-01-02-01-P03',
  'HTL-01-01-01-P02->HTL-01-01-01-P03',
  'HTL-01-01-01-P02->HTL-01-01-01-P04',
  'FND-04-01-10-P06->FND-04-01-10-P07',
  'FND-04-01-10-P02->FND-04-01-10-P03',
  'FND-04-01-10-P01->FND-04-01-10-P02',
  '01-03-07-P06->01-03-07-P07',
  '01-03-01-P06->01-03-01-P07',
  '01-03-03-P06->01-03-03-P07',
  '01-03-02-P04->01-03-02-P05',
  '06-10-05-P01->06-10-05-P02',
  '06-10-05-P03->06-10-05-P04',
  '06-11-06-P02->06-11-06-P03',
  'RNV-04-01-16-P04->RNV-04-01-16-P05',
  '04-01-04-P01->04-01-04-P02',
  '02-04-05-P04-S01->02-04-05-P04-S02',
  'PFB-04-01-01-P05->PFB-04-01-01-P06',
  '04-02-05-P01-S01->04-02-05-P01-S02',
  'FND-02-01-03-P01-S06->FND-02-01-03-P01-S07',
  'FND-04-01-03-P01->FND-04-01-03-P02',
  'FND-04-01-03-P01-S06->FND-04-01-03-P01-S07',
  'FND-04-01-03-P03->FND-04-01-03-P04',
  'FND-04-01-03-P03-S06->FND-04-01-03-P03-S07',
  'FND-04-01-03-P04->FND-04-01-03-P05',
  'FND-04-01-03-P04-S06->FND-04-01-03-P04-S07',
  'FND-04-01-03-P05->FND-04-01-03-P06',
  'FND-04-01-03-P05-S01->FND-04-01-03-P05-S02',
  'FND-04-01-03-P05-S02->FND-04-01-03-P05-S03',
  'FND-04-01-03-P05-S05->FND-04-01-03-P05-S06',
  'FND-04-01-03-P07->FND-04-01-03-P08',
  'FND-04-01-03-P07-S06->FND-04-01-03-P07-S07',
  'FND-04-01-03-P09-S06->FND-04-01-03-P09-S07',
  '01-03-06-P01->01-03-06-P02',
  '07-07-02-P08->07-07-02-P09',
  '08-19-02-P06->08-19-02-P07',
  '08-19-03-P05->08-19-03-P06',
  '07-06-07-P03->07-06-07-P04',
  'OUT-03-03-01-P01-S02->OUT-03-03-01-P01-S03',
  'OUT-03-03-01-P01-S01->OUT-03-03-01-P01-S02',
  '07-05-10-P04->07-05-10-P05',
  '07-06-07-P06->07-06-07-P07',
  '07-03-04-P04->07-03-04-P05',
  '07-04-05-P04->07-04-05-P05',
  'TOD-04-01-17-P02->TOD-04-01-17-P03',
  'TOD-04-01-07-P04->TOD-04-01-07-P05',
  'TOD-04-01-07-P07->TOD-04-01-07-P08',
  'TOD-04-01-13-P04->TOD-04-01-13-P05',
  '01-02-12-P02-S02->01-02-12-P02-S03',
  'TOD-04-01-17-P10-S02->TOD-04-01-17-P10-S03',
  'TOD-04-01-17-P10-S01->TOD-04-01-17-P10-S02',
  'TOD-04-01-17-P08->TOD-04-01-17-P09',
  '10-01-11-P04->10-01-11-P05',
  'MUN-02-02-01-P03-S02->MUN-02-02-01-P03-S03',
  'MUN-02-02-01-P03-S01->MUN-02-02-01-P03-S02',
  'MIC-03-01-01-P04->MIC-03-01-01-P05',
  'MIC-06-01-11-P07->MIC-06-01-11-P08',
  'MIC-06-01-11-P07-S05->MIC-06-01-11-P07-S06',
  'MIC-06-01-11-P07-S02->MIC-06-01-11-P07-S03',
  'MIC-06-01-11-P07-S01->MIC-06-01-11-P07-S02',
  'STL-04-01-12-P04->STL-04-01-12-P05',
  'STL-04-01-12-P04->STL-04-01-12-P07',
  'MIC-06-01-13-P01->MIC-06-01-13-P02',
  'MIC-06-01-13-P01-S06->MIC-06-01-13-P01-S07',
  'ELE-05-01-01-P09->ELE-05-01-01-P10',
  'OUT-01-01-01-P01->OUT-01-01-01-P02',
  'OUT-01-01-01-P01-S02->OUT-01-01-01-P01-S03',
  'OUT-01-01-01-P01-S01->OUT-01-01-01-P01-S02',
  'CMP-05-01-12-P06->CMP-05-01-12-P07',
  'CMP-03-01-01-P01->CMP-03-01-01-P02',
  'FND-04-01-15-P11-S05->FND-04-01-15-P11-S06',
  'FND-04-01-15-P11-S02->FND-04-01-15-P11-S03',
  'FND-04-01-15-P11-S01->FND-04-01-15-P11-S02',
  'HRT-02-01-02-P04->HRT-02-01-02-P05',
  'TOD-04-01-19-P03->TOD-04-01-19-P04',
  '06-10-06-P07->06-10-06-P08',
  'RNV-04-01-10-P06->RNV-04-01-10-P07',
  'BDT-06-01-04-P06->BDT-06-01-04-P07',
  'HRT-04-01-01-P03->HRT-04-01-01-P04',
  'DEC-01-02-01-P01->DEC-01-02-01-P02',
  'RNV-04-01-22-P05->RNV-04-01-22-P06',
  '05-12-03-P07->05-12-03-P08',
  '05-08-05-P06->05-08-05-P07',
  '03-07-04-P08->03-07-04-P09',
  'TOD-01-01-01-P04->TOD-01-01-01-P05',
  'HRT-04-01-08-P06->HRT-04-01-08-P07',
  '07-03-01-P03->07-03-01-P04',
  'CMP-05-01-30-P03->CMP-05-01-30-P04',
  'RNV-04-01-06-P05->RNV-04-01-06-P06',
  'RNV-04-01-06-P03->RNV-04-01-06-P04',
  'RNV-04-01-22-P01->RNV-04-01-22-P02',
  'CMP-05-01-01-P07->CMP-05-01-01-P08',
  'CMP-05-01-01-P05->CMP-05-01-01-P06',
  '03-02-02-P02->03-02-02-P03',
  '05-13-06-P02->05-13-06-P03',
  '05-12-03-P02->05-12-03-P03',
  '05-03-04-P03->05-03-04-P04',
  '05-05-11-P03->05-05-11-P04',
  'RNV-04-01-15-P03->RNV-04-01-15-P04',
  'PLU-02-01-01-P05->PLU-02-01-01-P06',
  '06-05-03-P06->06-05-03-P07',
  'MIC-06-01-08-P03->MIC-06-01-08-P04',
  'MIC-06-01-08-P03->MIC-06-01-08-P05',
  'MIC-06-01-08-P03-S06->MIC-06-01-08-P03-S07',
  'BDT-07-01-01-P04->BDT-07-01-01-P05',
  'STL-04-01-24-P02->STL-04-01-24-P03',
  'MIC-06-01-04-P04->MIC-06-01-04-P05',
  'MIC-06-01-04-P04-S06->MIC-06-01-04-P04-S07',
  'MIC-06-01-04-P08->MIC-06-01-04-P05',
  'MIC-06-01-04-P08-S06->MIC-06-01-04-P08-S07',
  '06-11-06-P08->06-11-06-P09',
  '05-08-06-P07->05-08-06-P08',
  'HTL-06-01-11-P02->HTL-06-01-11-P03',
  '06-17-05-P05->06-17-05-P06',
  'IBU-02-01-01-P07->IBU-02-01-01-P08',
  'RNV-03-01-02-P07->RNV-03-01-02-P08',
  'CMP-05-01-11-P08->CMP-05-01-11-P09',
  'PFB-04-01-02-P03->PFB-04-01-02-P04',
  'PFB-04-01-02-P03->PFB-04-01-02-P05',
  'MIC-06-01-11-P03->MIC-06-01-11-P04',
  'RNV-01-01-02-P06->RNV-01-01-02-P07',
  'RNV-01-01-02-P06->RNV-01-01-02-P08',
  'DANGER-01-01-08-P07->DANGER-01-01-08-P08',
  'DANGER-01-01-08-P05->DANGER-01-01-08-P06',
  'DANGER-01-01-08-P06->DANGER-01-01-08-P07',
  'DANGER-01-01-08-P01->DANGER-01-01-08-P02',
  'DANGER-01-01-08-P04->DANGER-01-01-08-P05',
  'DANGER-01-01-08-P03->DANGER-01-01-08-P04',
  'RNV-04-01-06-P02->RNV-04-01-06-P03',
  'STL-04-01-22-P02->STL-04-01-22-P03',
  'BDT-03-01-01-P02->BDT-03-01-01-P03',
  'BDT-03-01-01-P02->BDT-03-01-01-P05',
  'RNV-01-01-02-P05->RNV-01-01-02-P06',
  'RNV-01-01-01-P04->RNV-01-01-01-P05',
  'RNV-04-01-22-P03->RNV-04-01-22-P04',
  'HRT-04-01-02-P06->HRT-04-01-02-P07',
  'HRT-04-01-02-P01->HRT-04-01-02-P02',
  '02-01-05-P03->02-01-05-P04',
  'BDT-04-01-01-P08->BDT-04-01-01-P09',
  'DTC-04-01-10-P08->DTC-04-01-10-P09',
  'DTC-04-01-10-P01->DTC-04-01-10-P02',
  'DTC-04-01-09-P01->DTC-04-01-09-P02',
  '07-06-09-P03->07-06-09-P04',
  'ELE-04-01-01-P02->ELE-04-01-01-P03',
  'ELE-04-01-01-P02->ELE-04-01-01-P05',
  'RNV-04-01-16-P06->RNV-04-01-16-P07',
  'UHR-01-01-01-P03->UHR-01-01-01-P04',
  'UHR-04-01-01-P03->UHR-04-01-01-P04',
  'UHR-01-01-01-P02->UHR-01-01-01-P03',
  'UHR-04-01-01-P02->UHR-04-01-01-P03',
  'UHR-01-01-02-P02->UHR-01-01-02-P03',
  'UHR-04-01-02-P02->UHR-04-01-02-P03',
  'UHR-01-01-03-P02->UHR-01-01-03-P03',
  'UHR-04-01-03-P02->UHR-04-01-03-P03',
  'UHR-03-01-01-P02->UHR-03-01-01-P03',
  'UHR-04-01-07-P02->UHR-04-01-07-P03',
  'UHR-03-01-01-P03->UHR-03-01-01-P04',
  'UHR-04-01-07-P03->UHR-04-01-07-P04',
  'UHR-01-01-01-P02->UHR-01-01-01-P05',
  'UHR-04-01-01-P02->UHR-04-01-01-P05',
  'UHR-01-01-02-P02->UHR-01-01-02-P05',
  'UHR-04-01-02-P02->UHR-04-01-02-P05',
  'UHR-01-01-03-P02->UHR-01-01-03-P05',
  'UHR-04-01-03-P02->UHR-04-01-03-P05',
  'UHR-03-01-01-P02->UHR-03-01-01-P05',
  'UHR-04-01-07-P02->UHR-04-01-07-P05',
  '03-08-01-P03->03-08-01-P04',
  '03-08-02-P03->03-08-02-P04',
  'UHR-01-01-02-P05->UHR-01-01-02-P06',
  'UHR-04-01-02-P05->UHR-04-01-02-P06',
  'UHR-01-01-02-P04->UHR-01-01-02-P05',
  'UHR-04-01-02-P04->UHR-04-01-02-P05',
  'UHR-01-01-01-P04->UHR-01-01-01-P05',
  'UHR-04-01-01-P04->UHR-04-01-01-P05',
  'UHR-01-01-01-P05->UHR-01-01-01-P06',
  'UHR-04-01-01-P05->UHR-04-01-01-P06',
  'UHR-01-01-01-P06->UHR-01-01-01-P07',
  'UHR-04-01-01-P06->UHR-04-01-01-P07',
  'UHR-01-01-01-P07->UHR-01-01-01-P08',
  'UHR-04-01-01-P07->UHR-04-01-01-P08',
  'UHR-01-01-03-P03->UHR-01-01-03-P04',
  'UHR-04-01-03-P03->UHR-04-01-03-P04',
  'UHR-01-01-02-P03->UHR-01-01-02-P04',
  'UHR-04-01-02-P03->UHR-04-01-02-P04',
  'UHR-01-01-03-P04->UHR-01-01-03-P05',
  'UHR-04-01-03-P04->UHR-04-01-03-P05',
  'UHR-01-01-03-P05->UHR-01-01-03-P06',
  'UHR-04-01-03-P05->UHR-04-01-03-P06',
  'UHR-01-01-03-P06->UHR-01-01-03-P07',
  'UHR-04-01-03-P06->UHR-04-01-03-P07',
  'UHR-01-01-02-P07->UHR-01-01-02-P08',
  'UHR-04-01-02-P07->UHR-04-01-02-P08',
  'UHR-01-01-02-P06->UHR-01-01-02-P07',
  'UHR-04-01-02-P06->UHR-04-01-02-P07',
  'UHR-01-01-02-P06->UHR-01-01-02-P08',
  'UHR-04-01-02-P06->UHR-04-01-02-P08',
  'UHR-03-01-01-P04->UHR-03-01-01-P05',
  'UHR-04-01-07-P04->UHR-04-01-07-P05',
  'UHR-03-01-01-P05->UHR-03-01-01-P06',
  'UHR-04-01-07-P05->UHR-04-01-07-P06',
  'UHR-02-01-02-P02->UHR-02-01-02-P03',
  'UHR-04-01-05-P02->UHR-04-01-05-P03',
  'UHR-02-01-02-P02->UHR-02-01-02-P05',
  'UHR-04-01-05-P02->UHR-04-01-05-P05',
  'UHR-02-01-02-P04->UHR-02-01-02-P05',
  'UHR-04-01-05-P04->UHR-04-01-05-P05',
  'UHR-03-01-02-P04->UHR-03-01-02-P05',
  'UHR-04-01-09-P04->UHR-04-01-09-P05',
  'UHR-03-01-02-P05->UHR-03-01-02-P06',
  'UHR-04-01-09-P05->UHR-04-01-09-P06',
  'UHR-03-01-02-P03->UHR-03-01-02-P04',
  'UHR-04-01-09-P03->UHR-04-01-09-P04',
  'UHR-03-01-02-P06->UHR-03-01-02-P07',
  'UHR-04-01-09-P06->UHR-04-01-09-P07',
  'UHR-03-01-02-P06->UHR-03-01-02-P08',
  'UHR-04-01-09-P06->UHR-04-01-09-P08',
  '05-06-01-P02->05-06-01-P03',
  '05-06-02-P02->05-06-02-P03',
  '07-02-03-P04->07-02-03-P05',
  '07-02-05-P01->07-02-05-P02',
  '07-02-06-P01->07-02-06-P02',
  '07-02-08-P06->07-02-08-P07',
  '07-02-08-P01->07-02-08-P02',
  '07-02-07-P01->07-02-07-P02',
  '07-03-02-P04->07-03-02-P05',
  '03-08-01-P08->03-08-01-P09',
  '03-08-02-P08->03-08-02-P09',
  '10-01-06-P02->10-01-06-P03',
  '10-02-06-P02->10-02-06-P03',
  '10-01-06-P03->10-01-06-P04',
  '10-02-06-P03->10-02-06-P04',
  '06-13-02-P05->06-13-02-P06',
  '06-15-02-P05->06-15-02-P06',
  '06-13-04-P03->06-13-04-P04',
  '06-15-04-P03->06-15-04-P04',
  '06-11-03-P05->06-11-03-P06',
  '06-13-03-P05->06-13-03-P06',
  '07-01-04-P04->07-01-04-P05',
  '07-05-03-P04->07-05-03-P05',
  '01-01-09-P01->01-01-09-P02',
  '01-02-09-P01->01-02-09-P02',
  'CLN-04-01-13-P02->CLN-04-01-13-P03',
  'DTC-04-01-15-P07->DTC-04-01-15-P08',
  'DTC-04-01-15-P03->DTC-04-01-15-P04',
  'DTC-04-01-15-P03-S06->DTC-04-01-15-P03-S07',
  'DTC-04-01-15-P02->DTC-04-01-15-P03',
  'DTC-04-01-15-P02-S05->DTC-04-01-15-P02-S06',
  'DTC-04-01-33-P01->DTC-04-01-33-P02',
  'CMP-05-01-13-P08->CMP-05-01-13-P09',
  'DTC-04-01-21-P07->DTC-04-01-21-P08',
  'DTC-04-01-21-P08->DTC-04-01-21-P09',
  '08-16-04-P01->08-16-04-P02',
  '08-18-06-P07->08-18-06-P08',
  '08-18-11-P04->08-18-11-P05',
  '08-04-05-P06->08-04-05-P07',
  '08-04-04-P06->08-04-04-P07',
  '06-19-02-P05->06-19-02-P06',
  '05-13-02-P05->05-13-02-P06',
  '05-13-03-P02->05-13-03-P03',
  '05-13-03-P01->05-13-03-P02',
  '04-02-07-P07->04-02-07-P08',
  '10-02-07-P05->10-02-07-P06',
  '10-01-12-P03->10-01-12-P04',
  '10-02-11-P05->10-02-11-P06',
  '10-03-03-P05->10-03-03-P06',
  '05-13-07-P07->05-13-07-P08',
  '08-04-03-P03->08-04-03-P04',
  'ICR-04-01-02-P06->ICR-04-01-02-P07',
  'SITE-04-01-01-P03->SITE-04-01-01-P04',
  '10-02-04-P02->10-02-04-P03',
  'PFB-01-01-09-P12->PFB-01-01-09-P13',
  'ICR-05-01-03-P03->ICR-05-01-03-P04',
  '08-19-05-P02->08-19-05-P03',
  '06-01-06-P02->06-01-06-P03',
  '08-16-01-P03->08-16-01-P04',
  '08-16-01-P01->08-16-01-P02',
  '08-16-06-P01->08-16-06-P02',
  '08-16-05-P01->08-16-05-P02',
  '06-18-06-P04->06-18-06-P05',
  '06-16-04-P05->06-16-04-P06',
  'IBU-03-01-02-P07->IBU-03-01-02-P08',
  'DANGER-01-01-12-P07->DANGER-01-01-12-P08',
  'DANGER-01-01-12-P05->DANGER-01-01-12-P06',
  'DANGER-01-01-12-P06->DANGER-01-01-12-P07',
  'DANGER-01-01-12-P01->DANGER-01-01-12-P02',
  'DANGER-01-01-12-P04->DANGER-01-01-12-P05',
  'DANGER-01-01-12-P03->DANGER-01-01-12-P04',
  'DANGER-02-01-07-P02->DANGER-02-01-07-P03',
  'DANGER-02-01-07-P03->DANGER-02-01-07-P04',
  '01-02-11-P07->01-02-11-P08',
  'HTL-06-01-05-P02->HTL-06-01-05-P03',
  'DTC-04-01-38-P01->DTC-04-01-38-P02',
  'CLN-04-01-13-P01->CLN-04-01-13-P02',
  'CLN-04-01-13-P08->CLN-04-01-13-P09',
  'CLN-04-01-13-P07->CLN-04-01-13-P08',
  'ICR-05-01-28-P01->ICR-05-01-28-P02',
  '04-02-01-P05->04-02-01-P06',
  '03-06-01-P06->03-06-01-P07',
  'CLN-04-01-24-P04->CLN-04-01-24-P05',
  '04-02-06-P05->04-02-06-P06',
  'PFB-02-01-05-P04->PFB-02-01-05-P05',
  'PFB-04-01-10-P07->PFB-04-01-10-P08',
  'PFB-04-01-10-P10->PFB-04-01-10-P11',
  'CLN-04-01-02-P05->CLN-04-01-02-P06',
  'CLN-04-01-02-P05->CLN-04-01-02-P07',
  '03-06-02-P07->03-06-02-P08',
  '03-05-01-P08->03-05-01-P09',
  'MIC-06-01-08-P04->MIC-06-01-08-P05',
  '04-02-01-P04->04-02-01-P05',
  '03-01-03-P04->03-01-03-P05',
  '03-07-04-P07->03-07-04-P08',
  '06-11-02-P08->06-11-02-P09',
  '06-13-02-P08->06-13-02-P09',
  '05-13-04-P03->05-13-04-P04',
  '05-13-04-P02->05-13-04-P03',
  'RNV-04-01-24-P08->RNV-04-01-24-P09',
  'RNV-04-01-24-P04->RNV-04-01-24-P05',
  'CMP-05-01-30-P08->CMP-05-01-30-P09',
  '08-13-04-P05->08-13-04-P06',
  'DTC-04-01-33-P04-S06->DTC-04-01-33-P04-S07',
  '08-16-06-P04->08-16-06-P05',
  'INT-02-01-03-P01->INT-02-01-03-P02',
  '08-14-07-P05->08-14-07-P06',
  'RNV-04-01-18-P03->RNV-04-01-18-P04',
  '08-15-02-P06-S01->08-15-02-P06-S02',
  '08-16-02-P04->08-16-02-P05',
  'CLN-04-01-09-P09->CLN-04-01-09-P10',
  '08-15-04-P07-S02->08-15-04-P07-S03',
  'DTC-04-01-21-P06->DTC-04-01-21-P07',
  'ICR-05-01-04-P03->ICR-05-01-04-P04',
  'ICR-05-01-27-P05->ICR-05-01-27-P06',
  'ICR-05-01-04-P09->ICR-05-01-04-P10',
  'CLN-04-01-12-P04->CLN-04-01-12-P05',
  'CLN-04-01-09-P07->CLN-04-01-09-P08',
  '08-14-08-P06->08-14-08-P07',
  '08-14-09-P03->08-14-09-P04',
  'INT-02-01-03-P02->INT-02-01-03-P03',
  '06-20-04-P04->06-20-04-P05',
  '06-20-04-P04-S01->06-20-04-P04-S02',
  'FIR-03-04-01-P04->FIR-03-04-01-P05',
  'DTC-02-02-02-P04->DTC-02-02-02-P05',
  'FND-06-01-02-P05->FND-06-01-02-P06',
  'FND-06-01-02-P05-S06->FND-06-01-02-P05-S07',
  'DTC-04-01-23-P05->DTC-04-01-23-P06',
  'FND-06-01-01-P04-S06->FND-06-01-01-P04-S07',
  'FIR-03-01-02-P06->FIR-03-01-02-P08',
  '08-15-02-P01->08-15-02-P02',
  '10-01-12-P02->10-01-12-P03',
  'PLU-07-01-01-P06->PLU-07-01-01-P08',
  'CMP-05-01-19-P05->CMP-05-01-19-P06',
  '01-02-04-P04->01-02-04-P05',
  '04-05-04-P01-S02->04-05-04-P01-S03',
  'PFB-04-01-13-P05->PFB-04-01-13-P06',
  'CDF-02-01-02-P04->CDF-02-01-02-P05',
  'CDF-02-01-02-P04->CDF-02-01-02-P07',
  '08-14-07-P08->08-14-07-P09',
  '08-01-02-P06->08-01-02-P07',
  'DTC-04-01-30-P09-S05->DTC-04-01-30-P09-S06',
  'DTC-04-01-30-P06->DTC-04-01-30-P07',
  'DTC-04-01-30-P06-S06->DTC-04-01-30-P06-S07',
  'DTC-04-01-30-P02->DTC-04-01-30-P03',
  'DTC-04-01-30-P02-S06->DTC-04-01-30-P02-S07',
  'MIC-06-01-22-P08->MIC-06-01-22-P09',
  'MIC-06-01-22-P08-S05->MIC-06-01-22-P08-S06',
  'DTC-04-01-30-P07->DTC-04-01-30-P08',
  'UHR-04-01-04-P05->UHR-04-01-04-P06',
  'CLN-04-01-07-P07->CLN-04-01-07-P08',
  'CLN-04-01-07-P10->CLN-04-01-07-P11',
  '07-06-05-P04-S01->07-06-05-P04-S02',
  '07-06-05-P05-S01->07-06-05-P05-S02',
  '07-06-05-P07-S01->07-06-05-P07-S02',
  '08-17-01-P06->08-17-01-P07',
  '07-06-06-P07-S01->07-06-06-P07-S02',
  '07-06-06-P01->07-06-06-P02',
  '07-06-06-P03->07-06-06-P04',
  '07-06-08-P01->07-06-08-P02',
  '07-06-07-P01->07-06-07-P02',
  'DTC-02-01-02-P08->DTC-02-01-02-P09',
  'DTC-02-01-02-P08-S06->DTC-02-01-02-P08-S07',
  '07-06-05-P01->07-06-05-P02',
  '07-06-09-P01->07-06-09-P02',
  '07-06-09-P06->07-06-09-P07',
  '07-06-05-P06-S01->07-06-05-P06-S02',
  '07-06-05-P02-S01->07-06-05-P02-S02',
  'CLN-04-01-08-P07->CLN-04-01-08-P08',
  'CLN-04-01-08-P10->CLN-04-01-08-P11',
  'MIC-06-01-17-P03->MIC-06-01-17-P04',
  '04-03-04-P03->04-03-04-P04',
  '08-09-05-P02->08-09-05-P03',
  'UHR-03-01-02-P02->UHR-03-01-02-P03',
  'UHR-04-01-09-P02->UHR-04-01-09-P03',
  'UHR-03-01-01-P07->UHR-03-01-01-P08',
  'UHR-04-01-07-P07->UHR-04-01-07-P08',
  'UHR-02-01-02-P06->UHR-02-01-02-P07',
  'UHR-04-01-05-P06->UHR-04-01-05-P07',
  'UHR-02-01-02-P06->UHR-02-01-02-P08',
  'UHR-04-01-05-P06->UHR-04-01-05-P08',
  'UHR-02-01-02-P07->UHR-02-01-02-P08',
  'UHR-04-01-05-P07->UHR-04-01-05-P08',
  'UHR-02-01-02-P07-S05->UHR-02-01-02-P07-S06',
  'UHR-04-01-05-P07-S05->UHR-04-01-05-P07-S06',
  'UHR-01-01-03-P06->UHR-01-01-03-P08',
  'UHR-04-01-03-P06->UHR-04-01-03-P08',
  'UHR-01-01-01-P06->UHR-01-01-01-P08',
  'UHR-04-01-01-P06->UHR-04-01-01-P08',
  'UHR-01-01-01-P06-S05->UHR-01-01-01-P06-S06',
  'UHR-04-01-01-P06-S05->UHR-04-01-01-P06-S06',
  'UHR-01-01-01-P04-S05->UHR-01-01-01-P04-S06',
  'UHR-04-01-01-P04-S05->UHR-04-01-01-P04-S06',
  'UHR-02-01-02-P03->UHR-02-01-02-P04',
  'UHR-04-01-05-P03->UHR-04-01-05-P04',
  'UHR-01-01-03-P07->UHR-01-01-03-P08',
  'UHR-04-01-03-P07->UHR-04-01-03-P08',
  'DTC-04-01-21-P07-S06->DTC-04-01-21-P07-S07',
  'CMP-05-01-17-P08->CMP-05-01-17-P09',
  'CLN-04-01-13-P09->CLN-04-01-13-P10',
  'CLN-04-01-02-P01->CLN-04-01-02-P02',
  'MIC-06-01-22-P11-S05->MIC-06-01-22-P11-S06',
  'MIC-06-01-17-P03-S05->MIC-06-01-17-P03-S06',
  'TOD-04-01-15-P07->TOD-04-01-15-P08',
  '02-05-07-P03-S02->02-05-07-P03-S03',
  'UHR-02-01-01-P03->UHR-02-01-01-P04',
  'UHR-04-01-04-P04->UHR-04-01-04-P05',
  '01-01-12-P05->01-01-12-P06',
  '01-01-12-P05-S01->01-01-12-P05-S02',
  '06-18-05-P06-S02->06-18-05-P06-S03',
  '01-02-10-P05-S02->01-02-10-P05-S03',
  '10-02-11-P08->10-02-11-P09',
  'MUN-04-01-01-P05->MUN-04-01-01-P06',
  'IBU-02-01-01-P05->IBU-02-01-01-P06',
  'OUT-02-01-01-P08->OUT-02-01-01-P09',
  'UHR-03-01-02-P01->UHR-03-01-02-P02',
  'UHR-04-01-10-P06->UHR-04-01-10-P07',
  'UHR-04-01-10-P06->UHR-04-01-10-P08',
  'ICR-05-01-24-P06->ICR-05-01-24-P07',
  'STL-04-01-10-P02->STL-04-01-10-P03',
  '09-01-05-P05->09-01-05-P06',
  'IKU-03-01-02-P04->IKU-03-01-02-P05',
  'IKU-03-01-02-P04-S02->IKU-03-01-02-P04-S03',
  'IKU-03-01-02-P04-S01->IKU-03-01-02-P04-S02',
  'OUT-04-01-01-P07->OUT-04-01-01-P08',
  'HRT-04-01-13-P07->HRT-04-01-13-P08',
  'RNV-04-01-07-P04->RNV-04-01-07-P05',
  'RNV-04-01-07-P08->RNV-04-01-07-P09',
  '06-07-08-P04-S03->06-07-08-P04-S04',
  '02-01-06-P03-S02->02-01-06-P03-S03',
  'FND-04-01-16-P01->FND-04-01-16-P02',
  'FND-04-01-16-P01-S06->FND-04-01-16-P01-S07',
  'FND-04-01-16-P07->FND-04-01-16-P08',
  'FND-04-01-16-P07-S05->FND-04-01-16-P07-S06',
  'FND-04-01-16-P07-S01->FND-04-01-16-P07-S02',
  '01-06-01-P02-S01->01-06-01-P02-S02',
  '01-06-01-P07->01-06-01-P08',
  '01-06-03-P01->01-06-03-P02',
  '01-06-01-P01->01-06-01-P02',
  '01-06-01-P01-S01->01-06-01-P01-S02',
  '01-06-03-P01-S01->01-06-03-P01-S02',
  'FND-02-01-02-P07->FND-02-01-02-P08',
  'FND-02-01-02-P07->FND-02-01-02-P10',
  'FND-02-01-02-P07-S06->FND-02-01-02-P07-S07',
  'FND-04-01-16-P10-S06->FND-04-01-16-P10-S07',
  'FND-04-01-12-P01->FND-04-01-12-P02',
  'FND-04-01-12-P01-S06->FND-04-01-12-P01-S07',
  'FND-02-01-02-P10-S06->FND-02-01-02-P10-S07',
  '02-06-03-P04->02-06-03-P05',
  '04-05-05-P01-S01->04-05-05-P01-S02',
  'HRT-04-01-01-P07->HRT-04-01-01-P08',
  'HRT-04-01-03-P08->HRT-04-01-03-P09',
  'RNV-04-01-01-P02->RNV-04-01-01-P03',
  'HRT-04-01-03-P04->HRT-04-01-03-P05',
  'STL-04-01-12-P05->STL-04-01-12-P06',
  'DTC-04-01-11-P04->DTC-04-01-11-P05',
  'DTC-04-01-11-P04-S05->DTC-04-01-11-P04-S06',
  'DTC-04-01-11-P05->DTC-04-01-11-P06',
  'DTC-04-01-11-P05->DTC-04-01-11-P07',
  'DTC-04-01-11-P05-S06->DTC-04-01-11-P05-S07',
  'CLN-04-01-47-P03->CLN-04-01-47-P04',
  'PFB-01-01-03-P11->PFB-01-01-03-P12',
  '03-01-01-P04-S01->03-01-01-P04-S02',
  '01-02-03-P02-S02->01-02-03-P02-S03',
  '08-18-05-P07-S02->08-18-05-P07-S03',
  'CMP-03-01-01-P04->CMP-03-01-01-P05',
  'CMP-05-01-21-P04->CMP-05-01-21-P05',
  'CMP-05-01-12-P04->CMP-05-01-12-P05',
  'TOD-04-01-12-P05->TOD-04-01-12-P06',
  'MIC-01-01-01-P07->MIC-01-01-01-P08',
  'MIC-01-01-01-P07-S06->MIC-01-01-01-P07-S07',
  'CMP-05-01-03-P06->CMP-05-01-03-P07',
  'CMP-05-01-18-P05->CMP-05-01-18-P06',
  'CLN-03-01-05-P06->CLN-03-01-05-P07',
  'CLN-04-01-03-P06->CLN-04-01-03-P09',
  'CLN-04-01-03-P08->CLN-04-01-03-P09',
  'CLN-04-01-24-P06->CLN-04-01-24-P07',
  'CLN-04-01-37-P01->CLN-04-01-37-P02',
  'CLN-04-01-37-P06->CLN-04-01-37-P07',
  'HTL-01-01-03-P01->HTL-01-01-03-P02',
  'HTL-06-01-02-P04->HTL-06-01-02-P05',
  'HTL-01-01-02-P01->HTL-01-01-02-P02',
  'HTL-01-01-02-P02->HTL-01-01-02-P03',
  'HTL-01-01-02-P03->HTL-01-01-02-P04',
  'HTL-01-01-02-P04->HTL-01-01-02-P05',
  'HRT-01-01-01-P02->HRT-01-01-01-P03',
  'HRT-01-01-01-P07->HRT-01-01-01-P08',
  'HRT-01-01-02-P01->HRT-01-01-02-P02',
  'RNV-04-01-12-P05->RNV-04-01-12-P06',
  '08-19-04-P02->08-19-04-P03',
  'BDT-04-01-02-P03->BDT-04-01-02-P04',
  '04-04-04-P02->04-04-04-P03',
  '04-04-04-P03->04-04-04-P04',
  '03-09-01-P07->03-09-01-P08',
  '03-06-04-P02->03-06-04-P03',
  '03-04-03-P06->03-04-03-P07',
  '03-04-05-P03->03-04-05-P04',
  '03-06-04-P05->03-06-04-P06',
  '08-11-04-P03->08-11-04-P04',
  '10-01-11-P02->10-01-11-P03',
  '10-01-11-P01->10-01-11-P02',
  '10-01-09-P05->10-01-09-P06',
  '05-08-05-P03->05-08-05-P04',
  '05-08-01-P05->05-08-01-P06',
  '05-08-06-P03->05-08-06-P04',
  '10-01-11-P05->10-01-11-P06',
  'HVA-04-01-01-P05->HVA-04-01-01-P06',
  '05-08-04-P06->05-08-04-P07',
  'RNV-04-01-13-P03->RNV-04-01-13-P04',
  '05-05-02-P04->05-05-02-P05',
  '05-13-02-P02->05-13-02-P03',
  '05-11-01-P03->05-11-01-P04',
  'DTC-04-01-16-P04->DTC-04-01-16-P05',
  'DTC-04-01-16-P04->DTC-04-01-16-P06',
  '06-12-05-P02->06-12-05-P03',
  'OUT-04-03-02-P04->OUT-04-03-02-P05',
  'HTL-06-01-24-P07->HTL-06-01-24-P08',
  'HTL-06-01-24-P07->HTL-06-01-24-P09',
  'STL-04-01-02-P06->STL-04-01-02-P07',
  '05-09-05-P07->05-09-05-P08',
  'ICR-05-01-30-P05->ICR-05-01-30-P06',
  'CLN-04-01-10-P06->CLN-04-01-10-P07',
  '01-01-05-P01-S02->01-01-05-P01-S03',
  '06-06-04-P04->06-06-04-P05',
  '03-02-04-P05->03-02-04-P06',
  '03-07-03-P08->03-07-03-P09',
  '03-12-02-P08->03-12-02-P09',
  '03-12-05-P08->03-12-05-P09',
  '01-01-01-P06-S01->01-01-01-P06-S02',
  '01-05-03-P02->01-05-03-P03',
  '03-11-01-P04->03-11-01-P05',
  'DTC-04-01-28-P07->DTC-04-01-28-P08',
  'DTC-04-01-28-P07-S06->DTC-04-01-28-P07-S07',
  'DTC-04-01-07-P04->DTC-04-01-07-P05',
  'DTC-04-01-07-P04-S06->DTC-04-01-07-P04-S07',
  'ELE-03-01-01-P04->ELE-03-01-01-P05',
  '10-01-03-P08->10-01-03-P09',
  'BDT-05-01-03-P06-S02->BDT-05-01-03-P06-S03',
  'BDT-05-01-03-P06-S01->BDT-05-01-03-P06-S02',
  'PFB-00-01-01-P07->PFB-00-01-01-P08',
  'HRT-04-01-09-P03->HRT-04-01-09-P04',
  'HRT-02-01-01-P06->HRT-02-01-01-P07',
  'HRT-02-01-01-P06->HRT-02-01-01-P08',
  'HRT-02-01-01-P06-S02->HRT-02-01-01-P06-S03',
  'HRT-02-01-01-P06-S01->HRT-02-01-01-P06-S02',
  'HRT-02-02-02-P05-S02->HRT-02-02-02-P05-S03',
  'HRT-02-02-02-P05-S01->HRT-02-02-02-P05-S02',
  'HRT-04-01-05-P02->HRT-04-01-05-P03',
  'HRT-04-01-05-P06->HRT-04-01-05-P07',
  'HRT-04-01-04-P07->HRT-04-01-04-P08',
  'HRT-04-01-04-P06->HRT-04-01-04-P07',
  'HRT-04-01-08-P03->HRT-04-01-08-P04',
  'HRT-04-01-08-P03-S02->HRT-04-01-08-P03-S03',
  'HRT-04-01-08-P03-S01->HRT-04-01-08-P03-S02',
  'HRT-04-01-08-P08->HRT-04-01-08-P09',
  'HRT-04-01-04-P02->HRT-04-01-04-P03',
  'FAC-03-01-02-P03->FAC-03-01-02-P04',
  'RNV-04-01-14-P03->RNV-04-01-14-P04',
  'CMP-05-01-11-P05->CMP-05-01-11-P06',
  'FAC-03-01-02-P02->FAC-03-01-02-P03',
  '03-12-02-P01->03-12-02-P02',
  '03-12-02-P02->03-12-02-P03',
  '03-12-02-P04->03-12-02-P05',
  '03-12-02-P05->03-12-02-P06',
  'CMP-05-01-26-P05->CMP-05-01-26-P06',
  'CMP-05-01-26-P07->CMP-05-01-26-P08',
  'CMP-05-01-26-P03->CMP-05-01-26-P04',
  'CMP-05-01-26-P03-S02->CMP-05-01-26-P03-S03',
  'CMP-05-01-26-P03-S01->CMP-05-01-26-P03-S02',
  'ICR-05-01-30-P01->ICR-05-01-30-P02',
  '01-03-02-P05->01-03-02-P06',
  '03-06-01-P08->03-06-01-P09',
  '03-06-02-P08->03-06-02-P09',
  '03-06-03-P08->03-06-03-P09',
  '03-06-04-P08->03-06-04-P09',
  'SITE-05-01-03-P04->SITE-05-01-03-P05',
  'SITE-05-01-03-P04-S02->SITE-05-01-03-P04-S03',
  'SITE-05-01-03-P04-S01->SITE-05-01-03-P04-S02',
  'CLN-04-01-31-P01->CLN-04-01-31-P02',
  '05-04-03-P04->05-04-03-P05',
  '05-04-01-P04->05-04-01-P05',
  '05-04-04-P05->05-04-04-P06',
  '06-18-04-P01->06-18-04-P02',
  '06-18-07-P01->06-18-07-P02',
  'HVA-02-01-03-P01->HVA-02-01-03-P02',
  '06-18-03-P01->06-18-03-P02',
  '06-18-06-P01->06-18-06-P02',
  'CMP-05-01-16-P01->CMP-05-01-16-P02',
  'CMP-02-01-02-P06->CMP-02-01-02-P07',
  'CMP-02-01-02-P06->CMP-02-01-02-P08',
  'FND-04-01-13-P04->FND-04-01-13-P05',
  'FND-04-01-13-P04-S06->FND-04-01-13-P04-S07',
  '08-11-06-P04->08-11-06-P05',
  '08-17-03-P03->08-17-03-P04',
  'CLN-04-01-28-P02->CLN-04-01-28-P03',
  'OUT-04-01-03-P01->OUT-04-01-03-P02',
  'OUT-04-01-03-P06->OUT-04-01-03-P07',
  'OUT-04-01-03-P06->OUT-04-01-03-P08',
  '05-13-04-P05->05-13-04-P06',
  'STL-04-01-13-P05->STL-04-01-13-P06',
  'STL-04-01-14-P05->STL-04-01-14-P06',
  'STL-04-01-14-P05->STL-04-01-14-P07',
  'ICR-04-01-01-P03->ICR-04-01-01-P04',
  '07-02-02-P05->07-02-02-P06',
  '07-01-01-P05->07-01-01-P06',
  '07-01-02-P05->07-01-02-P06',
  'BDT-01-01-02-P01->BDT-01-01-02-P02',
  'BDT-01-01-04-P04->BDT-01-01-04-P05',
  'BDT-09-01-01-P05->BDT-09-01-01-P06',
  'BDT-01-01-03-P08->BDT-01-01-03-P09',
  'ICR-05-01-28-P04->ICR-05-01-28-P05',
  'ICR-05-01-28-P04->ICR-05-01-28-P06',
  'FND-01-01-04-P06-S06->FND-01-01-04-P06-S07',
  'FND-01-01-01-P11->FND-01-01-01-P12',
  'FND-01-01-01-P11-S06->FND-01-01-01-P11-S07',
  '08-11-04-P02->08-11-04-P03',
  '08-11-06-P05->08-11-06-P06',
  '08-11-05-P02->08-11-05-P03',
  '08-11-01-P03->08-11-01-P04',
  'DTC-02-01-02-P01->DTC-02-01-02-P02',
  'DTC-02-01-02-P01-S05->DTC-02-01-02-P01-S06',
  'ELE-04-01-01-P03->ELE-04-01-01-P04',
  'CMP-05-01-18-P08->CMP-05-01-18-P09',
  '09-01-03-P05-S01->09-01-03-P05-S02',
  '03-04-03-P05->03-04-03-P06',
  '05-05-05-P04->05-05-05-P05',
  '05-05-05-P02->05-05-05-P03',
  '08-11-03-P05->08-11-03-P06',
  '08-11-02-P03->08-11-02-P04',
  'IBU-03-01-03-P06->IBU-03-01-03-P07',
  '06-16-02-P07->06-16-02-P08',
  'TOD-04-01-14-P06->TOD-04-01-14-P07',
  '06-15-06-P04->06-15-06-P05',
  '06-17-07-P04->06-17-07-P05',
  '05-08-05-P04->05-08-05-P05',
  '05-13-06-P05->05-13-06-P06',
  '05-05-11-P04->05-05-11-P05',
  '06-19-05-P04->06-19-05-P05',
  '05-03-04-P04->05-03-04-P05',
  '08-18-04-P06-S02->08-18-04-P06-S03',
  '06-18-05-P05->06-18-05-P06',
  '04-04-02-P04->04-04-02-P05',
  '02-03-08-P05->02-03-08-P06',
  '03-12-03-P07->03-12-03-P08',
  'HTL-06-01-06-P02->HTL-06-01-06-P03',
  'DANGER-01-01-10-P05->DANGER-01-01-10-P06',
  'DANGER-01-01-10-P07->DANGER-01-01-10-P08',
  'DANGER-01-01-10-P03->DANGER-01-01-10-P04',
  'DANGER-01-01-10-P02->DANGER-01-01-10-P03',
  'DANGER-01-01-10-P06->DANGER-01-01-10-P07',
  'DANGER-01-01-10-P04->DANGER-01-01-10-P05',
  'STL-04-01-09-P01->STL-04-01-09-P02',
  'TOD-02-01-01-P09-S02->TOD-02-01-01-P09-S03',
  'TOD-02-01-01-P09-S01->TOD-02-01-01-P09-S02',
  'DTC-04-01-18-P08-S06->DTC-04-01-18-P08-S07',
  'HTL-02-01-01-P01->HTL-02-01-01-P02',
  'HTL-06-01-13-P05->HTL-06-01-13-P06',
  'HTL-06-01-13-P01->HTL-06-01-13-P02',
  'HTL-02-01-01-P06->HTL-02-01-01-P08',
  'HTL-06-01-13-P06->HTL-06-01-13-P08',
  'MIC-02-01-02-P09-S06->MIC-02-01-02-P09-S07',
  '05-12-03-P05->05-12-03-P06',
  '06-11-07-P04->06-11-07-P05',
  '08-14-04-P01->08-14-04-P02',
  '06-20-02-P01->06-20-02-P02',
  '05-05-03-P04->05-05-03-P05',
  'BDT-06-01-07-P03->BDT-06-01-07-P04',
  '05-06-03-P05->05-06-03-P06',
  '06-10-08-P04->06-10-08-P05',
  '05-05-03-P04-S01->05-05-03-P04-S02',
  '06-11-01-P06->06-11-01-P07',
  '06-12-01-P06->06-12-01-P07',
  '08-14-04-P03->08-14-04-P04',
  '05-14-02-P05->05-14-02-P06',
  'CLN-04-01-09-P02->CLN-04-01-09-P03',
  '05-12-01-P05->05-12-01-P06',
  'DTC-04-01-15-P04->DTC-04-01-15-P05',
  'DTC-04-01-15-P04-S06->DTC-04-01-15-P04-S07',
  'CLN-04-01-31-P03->CLN-04-01-31-P04',
  'BDT-01-01-01-P02->BDT-01-01-01-P03',
  'BDT-01-01-01-P02->BDT-01-01-01-P05',
  '01-02-03-P02-S01->01-02-03-P02-S02',
  'BDT-01-01-02-P02->BDT-01-01-02-P03',
  'BDT-01-01-02-P02->BDT-01-01-02-P05',
  '08-14-04-P06->08-14-04-P07',
  '06-20-02-P04->06-20-02-P05',
  'DTC-04-01-36-P05-S06->DTC-04-01-36-P05-S07',
  'STL-04-01-07-P06->STL-04-01-07-P07',
  'STL-04-01-07-P06->STL-04-01-07-P08',
  'HRT-04-01-10-P05->HRT-04-01-10-P06',
  'HRT-04-01-10-P05->HRT-04-01-10-P07',
  'ELE-06-01-01-P01->ELE-06-01-01-P02',
  '04-04-03-P05->04-04-03-P06',
  '02-06-08-P05->02-06-08-P06',
  'STL-04-01-24-P04->STL-04-01-24-P05',
  '02-07-01-P01->02-07-01-P02',
  '02-07-04-P04->02-07-04-P05',
  'CLN-04-01-32-P04->CLN-04-01-32-P05',
  'CLN-04-01-17-P05->CLN-04-01-17-P06',
  'CLN-04-01-17-P05->CLN-04-01-17-P07',
  '06-02-02-P04-S02->06-02-02-P04-S03',
  '06-11-06-P04->06-11-06-P05',
  '06-11-06-P01->06-11-06-P02',
  '06-14-05-P07->06-14-05-P08',
  '06-18-01-P04->06-18-01-P05',
  'STL-04-01-24-P05->STL-04-01-24-P06',
  'TOD-04-01-13-P03->TOD-04-01-13-P04',
  '06-03-01-P05->06-03-01-P06',
  '02-07-04-P03->02-07-04-P04',
  '06-03-07-P04->06-03-07-P05',
  'CMP-05-01-17-P02->CMP-05-01-17-P03',
  'MIC-02-01-01-P03->MIC-02-01-01-P04',
  'MIC-02-01-01-P03-S06->MIC-02-01-01-P03-S07',
  'STL-02-01-02-P06->STL-02-01-02-P07',
  'BDT-01-01-03-P04->BDT-01-01-03-P05',
  'TOD-04-01-05-P02->TOD-04-01-05-P03',
  'BDT-01-01-04-P07->BDT-01-01-04-P08',
  '06-03-06-P03->06-03-06-P04',
  'FIR-06-01-01-P02->FIR-06-01-01-P03',
  'FIR-06-01-01-P02->FIR-06-01-01-P05',
  'MIC-06-01-19-P02->MIC-06-01-19-P03',
  'MIC-06-01-19-P02-S06->MIC-06-01-19-P02-S07',
  'DTC-04-01-34-P10-S06->DTC-04-01-34-P10-S07',
  'FAC-02-01-02-P06->FAC-02-01-02-P08',
  'DTC-04-01-12-P06->DTC-04-01-12-P07',
  'DTC-04-01-12-P06->DTC-04-01-12-P08',
  'DTC-04-01-12-P06-S06->DTC-04-01-12-P06-S07',
  'BDT-01-01-06-P03->BDT-01-01-06-P04',
  '06-03-03-P05->06-03-03-P06',
  'IKU-01-02-01-P03->IKU-01-02-01-P04',
  'MIC-06-01-09-P03->MIC-06-01-09-P04',
  'MIC-06-01-09-P03-S06->MIC-06-01-09-P03-S07',
  'PLU-01-01-02-P07->PLU-01-01-02-P08',
  'MIC-06-01-09-P08-S06->MIC-06-01-09-P08-S07',
  'TOD-04-01-05-P04->TOD-04-01-05-P05',
  'TOD-04-01-05-P07->TOD-04-01-05-P08',
  'FIR-06-01-01-P07->FIR-06-01-01-P08',
  'TOD-04-01-16-P06->TOD-04-01-16-P07',
  'BDT-01-01-06-P02->BDT-01-01-06-P03',
  'BDT-01-01-06-P02->BDT-01-01-06-P05',
  'FIR-04-01-02-P01->FIR-04-01-02-P02',
  'FIR-04-01-02-P06->FIR-04-01-02-P07',
  '06-03-02-P05->06-03-02-P06',
  'MIC-06-01-09-P05->MIC-06-01-09-P06',
  'MIC-06-01-09-P05-S06->MIC-06-01-09-P05-S07',
  'STL-02-01-02-P03->STL-02-01-02-P04',
  'STL-04-01-11-P03->STL-04-01-11-P04',
  'STL-02-01-02-P04->STL-02-01-02-P05',
  'STL-02-01-02-P04->STL-02-01-02-P06',
  'HVA-01-01-02-P05->HVA-01-01-02-P06',
  '06-19-04-P03->06-19-04-P04',
  '06-14-04-P03->06-14-04-P04',
  '05-03-03-P03->05-03-03-P04',
  '06-16-02-P03->06-16-02-P04',
  '06-17-02-P03->06-17-02-P04',
  '06-12-04-P03->06-12-04-P04',
  '05-02-03-P03->05-02-03-P04',
  '06-10-04-P03->06-10-04-P04',
  '06-11-04-P03->06-11-04-P04',
  '05-12-02-P08->05-12-02-P09',
  '05-08-04-P05->05-08-04-P06',
  'CLN-04-01-34-P04->CLN-04-01-34-P05',
  '06-10-04-P08->06-10-04-P09',
  '02-07-04-P02->02-07-04-P03',
  'STL-01-01-01-P05->STL-01-01-01-P06',
  'MIC-06-01-03-P04->MIC-06-01-03-P05',
  'MIC-06-01-03-P04-S06->MIC-06-01-03-P04-S07',
  '05-03-03-P01->05-03-03-P02',
  '05-05-10-P01->05-05-10-P02',
  '06-10-04-P01->06-10-04-P02',
  '02-07-02-P02->02-07-02-P03',
  '02-07-01-P02->02-07-01-P03',
  'STL-04-01-26-P03->STL-04-01-26-P04',
  '05-05-03-P07->05-05-03-P08',
  '05-08-04-P01->05-08-04-P02',
  '05-03-03-P05->05-03-03-P06',
  'MIC-06-01-09-P06->MIC-06-01-09-P07',
  'STL-02-01-02-P09->STL-02-01-02-P10',
  'MIC-06-01-09-P02->MIC-06-01-09-P03',
  'MIC-06-01-09-P02-S06->MIC-06-01-09-P02-S07',
  'STL-02-01-02-P02->STL-02-01-02-P03',
  '02-06-10-P02->02-06-10-P03',
  '02-03-09-P01->02-03-09-P02',
  '02-06-10-P03->02-06-10-P04',
  'CLN-03-01-02-P02->CLN-03-01-02-P03',
  'CLN-03-01-02-P04->CLN-03-01-02-P05',
  'CDF-03-01-01-P04->CDF-03-01-01-P05',
  'CDF-01-01-02-P01->CDF-01-01-02-P02',
  'CDF-01-01-02-P08->CDF-01-01-02-P09',
  'CLN-03-01-02-P01->CLN-03-01-02-P02',
  'CLN-04-01-26-P03->CLN-04-01-26-P04',
  'CLN-04-01-27-P03->CLN-04-01-27-P04',
  'DTC-04-01-22-P07->DTC-04-01-22-P08',
  'DTC-04-01-22-P07-S06->DTC-04-01-22-P07-S07',
  'TOD-04-01-07-P05->TOD-04-01-07-P06',
  'CDF-01-01-02-P11->CDF-01-01-02-P12',
  'CDF-01-01-02-P04->CDF-01-01-02-P05',
  '06-08-06-P04->06-08-06-P05',
  '06-08-06-P05->06-08-06-P06',
  'ICR-05-01-08-P04->ICR-05-01-08-P05',
  'ICR-05-01-08-P04->ICR-05-01-08-P07',
  'ICR-05-01-31-P02->ICR-05-01-31-P03',
  'ICR-05-01-31-P01->ICR-05-01-31-P02',
  'ICR-05-01-08-P01->ICR-05-01-08-P02',
  'ICR-05-01-31-P07->ICR-05-01-31-P08',
  'ICR-03-02-01-P06->ICR-03-02-01-P07',
  'ICR-03-02-01-P06->ICR-03-02-01-P09',
  'ICR-05-01-08-P02->ICR-05-01-08-P03',
  'ICR-03-02-01-P07->ICR-03-02-01-P08',
  'ICR-05-01-10-P03->ICR-05-01-10-P04',
  'ICR-03-02-01-P09->ICR-03-02-01-P10',
  'ICR-03-02-01-P04->ICR-03-02-01-P05',
  '05-05-11-P05->05-05-11-P06',
  '06-14-07-P05->06-14-07-P06',
  '05-12-03-P06->05-12-03-P07',
  '05-08-05-P05->05-08-05-P06',
  '06-11-07-P05->06-11-07-P06',
  '06-17-07-P05->06-17-07-P06',
  '06-19-05-P05->06-19-05-P06',
  'ICR-02-01-01-P02->ICR-02-01-01-P03',
  'ICR-02-01-01-P02->ICR-02-01-01-P05',
  '05-03-04-P05->05-03-04-P06',
  'ICR-02-02-01-P02->ICR-02-02-01-P03',
  'ICR-02-01-02-P02->ICR-02-01-02-P03',
  'HRT-04-01-13-P03->HRT-04-01-13-P04',
  'DTC-01-01-01-P03->DTC-01-01-01-P04',
  'DTC-01-01-01-P03-S06->DTC-01-01-01-P03-S07',
  'STL-04-01-19-P06->STL-04-01-19-P07',
  'STL-04-01-19-P06->STL-04-01-19-P08',
  '01-06-03-P02->01-06-03-P03',
  'TOD-04-01-20-P08->TOD-04-01-20-P09',
  'RNV-04-01-05-P04->RNV-04-01-05-P05',
  'FND-06-01-03-P02->FND-06-01-03-P03',
  'FND-06-01-03-P02-S06->FND-06-01-03-P02-S07',
  '02-03-07-P06->02-03-07-P07',
  'STL-04-01-20-P05->STL-04-01-20-P06',
  '06-10-06-P05->06-10-06-P06',
  'CLN-04-01-32-P05->CLN-04-01-32-P06',
  'CLN-04-01-32-P05->CLN-04-01-32-P07',
  '08-08-01-P04->08-08-01-P05',
  'CMP-05-01-22-P01->CMP-05-01-22-P02',
  'CMP-05-01-22-P01-S02->CMP-05-01-22-P01-S03',
  'CMP-05-01-22-P01-S01->CMP-05-01-22-P01-S02',
  'CMP-05-01-22-P05->CMP-05-01-22-P06',
  'CMP-01-01-02-P04->CMP-01-01-02-P05',
  'CMP-01-01-01-P06->CMP-01-01-01-P07',
  'CMP-01-01-01-P06->CMP-01-01-01-P08',
  '06-18-03-P05->06-18-03-P06',
  'UHR-04-01-10-P07->UHR-04-01-10-P08',
  'INT-03-01-01-P07->INT-03-01-01-P08',
  'RNV-01-01-02-P08->RNV-01-01-02-P09',
  '01-05-03-P04->01-05-03-P05',
  'RNV-02-02-01-P02->RNV-02-02-01-P03',
  'FND-04-01-14-P01->FND-04-01-14-P02',
  'FND-04-01-14-P01-S05->FND-04-01-14-P01-S06',
  'FND-04-01-14-P01-S02->FND-04-01-14-P01-S03',
  'FND-04-01-14-P01-S01->FND-04-01-14-P01-S02',
  'TOD-04-01-20-P03->TOD-04-01-20-P04',
  'DTC-04-01-31-P04-S06->DTC-04-01-31-P04-S07',
  '08-09-04-P03->08-09-04-P04',
  'CMP-05-01-14-P03->CMP-05-01-14-P04',
  'ELE-06-01-01-P07->ELE-06-01-01-P08',
  'RNV-03-01-02-P01->RNV-03-01-02-P02',
  'UHR-02-01-01-P04->UHR-02-01-01-P05',
  'UHR-04-01-04-P06->UHR-04-01-04-P07',
  'UHR-04-01-04-P06->UHR-04-01-04-P08',
  'RNV-03-01-01-P04->RNV-03-01-01-P05',
  'RNV-03-01-01-P08->RNV-03-01-01-P09',
  'FIR-03-02-01-P05->FIR-03-02-01-P06',
  'MIC-06-01-17-P08->MIC-06-01-17-P09',
  'MIC-06-01-17-P08-S06->MIC-06-01-17-P08-S07',
  '06-10-03-P02->06-10-03-P03',
  'RNV-02-02-01-P07->RNV-02-02-01-P08',
  'PLU-03-01-01-P06->PLU-03-01-01-P07',
  'PLU-03-01-01-P06->PLU-03-01-01-P08',
  'RNV-04-01-18-P06->RNV-04-01-18-P07',
  'BDT-01-01-05-P08->BDT-01-01-05-P09',
  'RNV-03-01-02-P04->RNV-03-01-02-P05',
  'RNV-04-01-17-P08->RNV-04-01-17-P09',
  'RNV-04-01-17-P03->RNV-04-01-17-P04',
  '06-10-09-P03->06-10-09-P04',
  'RNV-03-01-02-P03->RNV-03-01-02-P04',
  '09-04-02-P06->09-04-02-P07',
  'RNV-03-01-02-P02->RNV-03-01-02-P03',
  'MEP-03-01-04-P03-S05->MEP-03-01-04-P03-S06',
  'MEP-03-01-04-P03-S02->MEP-03-01-04-P03-S03',
  'MEP-03-01-04-P03-S01->MEP-03-01-04-P03-S02',
  'TOD-04-01-23-P03->TOD-04-01-23-P04',
  'ICR-04-02-01-P05->ICR-04-02-01-P06',
  'ELE-03-01-02-P02->ELE-03-01-02-P03',
  'ELE-03-01-02-P02->ELE-03-01-02-P05',
  '09-04-01-P06->09-04-01-P07',
  '01-07-05-P06->01-07-05-P07',
  '01-01-06-P06->01-01-06-P07',
  '08-08-02-P03->08-08-02-P04',
  'DTC-04-01-06-P06->DTC-04-01-06-P07',
  'DTC-04-01-06-P06-S06->DTC-04-01-06-P06-S07',
  'RNV-04-01-21-P06->RNV-04-01-21-P07',
  '06-04-09-P06->06-04-09-P07',
  'RNV-04-01-21-P01->RNV-04-01-21-P02',
  '01-01-04-P04->01-01-04-P05',
  '08-18-03-P05-S02->08-18-03-P05-S03',
  '06-01-02-P05-S01->06-01-02-P05-S02',
  '06-05-02-P05->06-05-02-P06',
  '06-01-07-P03->06-01-07-P04',
  '06-05-08-P05->06-05-08-P06',
  '08-14-04-P04->08-14-04-P05',
  'HVA-01-01-01-P05->HVA-01-01-01-P06',
  '06-18-04-P04->06-18-04-P05',
  '06-07-03-P03->06-07-03-P04',
  '06-05-09-P04->06-05-09-P05',
  '06-18-04-P07->06-18-04-P08',
  '06-07-03-P05->06-07-03-P06',
  'MIC-05-01-01-P04->MIC-05-01-01-P05',
  '06-05-09-P02->06-05-09-P03',
  'HVA-01-01-01-P01->HVA-01-01-01-P02',
  'FIR-06-01-01-P04->FIR-06-01-01-P05',
  '09-02-02-P04->09-02-02-P05',
  '04-01-02-P01-S01->04-01-02-P01-S02',
  '04-01-02-P04->04-01-02-P05',
  '03-06-01-P01->03-06-01-P02',
  '03-06-02-P01->03-06-02-P02',
  '03-06-03-P01->03-06-03-P02',
  '03-06-04-P01->03-06-04-P02',
  'DEC-05-01-02-P02->DEC-05-01-02-P03',
  'DEC-05-01-02-P02->DEC-05-01-02-P05',
  '09-01-02-P03-S02->09-01-02-P03-S03',
  'DTC-04-01-10-P04->DTC-04-01-10-P05',
  'DTC-04-01-10-P04->DTC-04-01-10-P06',
  'DTC-04-01-10-P04-S06->DTC-04-01-10-P04-S07',
  'MEP-02-01-01-P10->MEP-02-01-01-P11',
  'HTL-03-01-01-P03->HTL-03-01-01-P04',
  'TOD-04-01-15-P03->TOD-04-01-15-P04',
  'TOD-04-01-04-P02->TOD-04-01-04-P03',
  'TOD-04-01-04-P04->TOD-04-01-04-P05',
  'TOD-04-01-04-P04-S02->TOD-04-01-04-P04-S03',
  'TOD-04-01-04-P04-S01->TOD-04-01-04-P04-S02',
  'BDT-09-01-01-P09->BDT-09-01-01-P10',
  'PLU-05-01-01-P03->PLU-05-01-01-P04',
  'CMP-02-01-02-P02->CMP-02-01-02-P03',
  'CMP-02-01-02-P02->CMP-02-01-02-P04',
  'TOD-04-01-11-P04->TOD-04-01-11-P05',
  'TOD-04-01-12-P03->TOD-04-01-12-P04',
  'MIC-02-01-03-P02-S06->MIC-02-01-03-P02-S07',
  'MIC-06-01-05-P02->MIC-06-01-05-P03',
  'MIC-06-01-05-P02-S06->MIC-06-01-05-P02-S07',
  'IBU-03-01-05-P03->IBU-03-01-05-P04',
  'BDT-06-01-05-P03->BDT-06-01-05-P04',
  'DEC-05-01-02-P04->DEC-05-01-02-P05',
  'IBU-01-02-01-P01->IBU-01-02-01-P02',
  'MIC-06-01-18-P02->MIC-06-01-18-P03',
  'MIC-06-01-18-P02-S06->MIC-06-01-18-P02-S07',
  'MIC-06-01-06-P02->MIC-06-01-06-P03',
  'MIC-06-01-06-P02-S06->MIC-06-01-06-P02-S07',
  'IBU-02-01-01-P03->IBU-02-01-01-P04',
  'IBU-02-01-01-P03-S02->IBU-02-01-01-P03-S03',
  'IBU-02-01-01-P03-S01->IBU-02-01-01-P03-S02',
  'MIC-05-01-01-P03->MIC-05-01-01-P04',
  'MIC-05-01-01-P03-S06->MIC-05-01-01-P03-S07',
  'MIC-06-01-10-P04->MIC-06-01-10-P05',
  'MIC-06-01-06-P07->MIC-06-01-06-P08',
  'MIC-06-01-06-P07-S06->MIC-06-01-06-P07-S07',
  'MIC-05-01-01-P08->MIC-05-01-01-P09',
  'CMP-05-01-05-P02->CMP-05-01-05-P03',
  'HTL-06-01-08-P03->HTL-06-01-08-P04',
  'HTL-03-01-01-P02->HTL-03-01-01-P03',
  'MIC-06-01-07-P02->MIC-06-01-07-P03',
  'MIC-06-01-07-P02-S06->MIC-06-01-07-P02-S07',
  'IBU-03-01-03-P03->IBU-03-01-03-P04',
  'DEC-03-01-02-P08->DEC-03-01-02-P09',
  'PLU-01-01-01-P01->PLU-01-01-01-P02',
  '05-01-01-P03->05-01-01-P04',
  'IBU-03-01-04-P02->IBU-03-01-04-P03',
  '05-04-01-P05->05-04-01-P06',
  'PLU-03-01-01-P03->PLU-03-01-01-P04',
  'OUT-05-01-01-P05->OUT-05-01-01-P06',
  '08-18-04-P03->08-18-04-P04',
  'RNV-02-02-02-P05->RNV-02-02-02-P06',
  'IKU-01-02-01-P04->IKU-01-02-01-P05',
  'MIC-02-01-02-P01->MIC-02-01-02-P02',
  'MIC-02-01-02-P01->MIC-02-01-02-P04',
  'MIC-02-01-02-P01-S06->MIC-02-01-02-P01-S07',
  'IBU-01-02-01-P03->IBU-01-02-01-P04',
  'IBU-01-02-01-P06->IBU-01-02-01-P07',
  'MIC-06-01-05-P08-S06->MIC-06-01-05-P08-S07',
  'IKU-01-01-02-P07->IKU-01-01-02-P08',
  'MIC-01-01-02-P08-S06->MIC-01-01-02-P08-S07',
  'ICR-04-02-01-P02->ICR-04-02-01-P03',
  'ICR-04-02-01-P02->ICR-04-02-01-P05',
  'MIC-06-01-08-P02->MIC-06-01-08-P03',
  'PFB-00-01-01-P06->PFB-00-01-01-P07',
  'MIC-06-01-01-P09-S02->MIC-06-01-01-P09-S03',
  'IBU-03-01-04-P01->IBU-03-01-04-P02',
  'IBU-03-01-04-P01-S02->IBU-03-01-04-P01-S03',
  'IBU-03-01-04-P01-S01->IBU-03-01-04-P01-S02',
  'MIC-06-01-06-P04->MIC-06-01-06-P05',
  'IBU-01-02-01-P05->IBU-01-02-01-P06',
  'MIC-02-01-02-P05->MIC-02-01-02-P06',
  'MIC-02-01-02-P05-S05->MIC-02-01-02-P05-S06',
  'MIC-02-01-02-P05-S02->MIC-02-01-02-P05-S03',
  'MIC-02-01-02-P05-S01->MIC-02-01-02-P05-S02',
  'IKU-03-01-04-P01->IKU-03-01-04-P02',
  'MIC-06-01-07-P07->MIC-06-01-07-P08',
  'MIC-06-01-07-P07-S06->MIC-06-01-07-P07-S07',
  'MIC-01-01-02-P06->MIC-01-01-02-P07',
  'MIC-01-01-02-P06->MIC-01-01-02-P08',
  'MIC-01-01-02-P06-S05->MIC-01-01-02-P06-S06',
  'MIC-01-01-02-P06-S02->MIC-01-01-02-P06-S03',
  'MIC-01-01-02-P06-S01->MIC-01-01-02-P06-S02',
  'STL-04-01-09-P03->STL-04-01-09-P04',
  'STL-04-01-09-P03->STL-04-01-09-P06',
  'IKU-03-01-02-P09-S02->IKU-03-01-02-P09-S03',
  'IKU-03-01-02-P09-S01->IKU-03-01-02-P09-S02',
  'IBU-01-01-02-P09-S02->IBU-01-01-02-P09-S03',
  'IBU-01-01-02-P09-S01->IBU-01-01-02-P09-S02',
  'MIC-06-01-01-P04->MIC-06-01-01-P05',
  'MIC-06-01-01-P04-S06->MIC-06-01-01-P04-S07',
  'MIC-02-01-01-P04->MIC-02-01-01-P05',
  'MIC-02-01-01-P04-S06->MIC-02-01-01-P04-S07',
  'MIC-06-01-21-P03->MIC-06-01-21-P04',
  'MIC-02-01-01-P05->MIC-02-01-01-P06',
  'MIC-02-01-01-P05-S05->MIC-02-01-01-P05-S06',
  'MIC-02-01-01-P05-S02->MIC-02-01-01-P05-S03',
  'MIC-02-01-01-P05-S01->MIC-02-01-01-P05-S02',
  'HTL-06-01-26-P04->HTL-06-01-26-P05',
  'HTL-06-01-26-P07->HTL-06-01-26-P08',
  'HTL-06-01-26-P07->HTL-06-01-26-P09',
  '08-15-06-P02->08-15-06-P03',
  'HTL-06-01-27-P08->HTL-06-01-27-P09',
  'HTL-06-01-27-P04->HTL-06-01-27-P05',
  'HTL-06-01-25-P02->HTL-06-01-25-P03',
  'HTL-06-01-25-P06->HTL-06-01-25-P07',
  'FND-01-01-03-P05-S05->FND-01-01-03-P05-S06',
  'FND-01-01-03-P05-S01->FND-01-01-03-P05-S02',
  'FND-01-01-03-P11->FND-01-01-03-P12',
  'FND-01-01-03-P11-S06->FND-01-01-03-P11-S07',
  'ICR-05-01-26-P04->ICR-05-01-26-P05',
  'ICR-05-01-26-P04->ICR-05-01-26-P06',
  'DANGER-01-01-11-P07->DANGER-01-01-11-P08',
  'DANGER-01-01-11-P05->DANGER-01-01-11-P06',
  'DANGER-01-01-11-P06->DANGER-01-01-11-P07',
  'DANGER-01-01-11-P01->DANGER-01-01-11-P02',
  'DANGER-01-01-11-P04->DANGER-01-01-11-P05',
  'DANGER-01-01-11-P03->DANGER-01-01-11-P04',
  'DANGER-02-01-05-P03->DANGER-02-01-05-P04',
  'DANGER-02-01-05-P04->DANGER-02-01-05-P05',
  'DANGER-02-01-05-P06->DANGER-02-01-05-P07',
  'DANGER-02-01-05-P05->DANGER-02-01-05-P06',
  'TOD-04-01-08-P04->TOD-04-01-08-P05',
  'ICR-02-02-01-P04->ICR-02-02-01-P05',
  'FND-03-01-01-P11-S05->FND-03-01-01-P11-S06',
  'FND-03-01-01-P11-S02->FND-03-01-01-P11-S03',
  'FND-03-01-01-P11-S01->FND-03-01-01-P11-S02',
  'ICR-05-01-10-P02->ICR-05-01-10-P03',
  'ICR-05-01-27-P04->ICR-05-01-27-P05',
  'ICR-05-01-27-P04->ICR-05-01-27-P06',
  'ICR-05-01-09-P03->ICR-05-01-09-P04',
  'ICR-05-01-28-P06->ICR-05-01-28-P07',
])

const L2_EXACT_SAME_PARENT_SPECIALTY_DEPTH_GATE_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION = new Set([
  'RNV-04-01-15-P05->RNV-04-01-15-P06',
  'BDT-06-01-04-P06->BDT-06-01-04-P08',
  'MUN-04-02-01-P02->MUN-04-02-01-P05',
  'PRT-01-01-03-P07->PRT-01-01-03-P08',
  'PRT-04-01-03-P07->PRT-04-01-03-P08',
  'PRT-01-01-03-P02->PRT-01-01-03-P05',
  'PRT-04-01-03-P02->PRT-04-01-03-P05',
  'UTN-01-01-03-P03->UTN-01-01-03-P04',
  'UTN-01-01-03-P04->UTN-01-01-03-P05',
  'UTN-01-01-03-P05->UTN-01-01-03-P06',
  'UTN-01-01-03-P06->UTN-01-01-03-P07',
  'UTN-03-01-05-P03->UTN-03-01-05-P04',
  'UTN-03-01-05-P04->UTN-03-01-05-P05',
  'UTN-03-01-05-P05->UTN-03-01-05-P06',
  'UTN-03-01-05-P06->UTN-03-01-05-P07',
  'UTN-01-01-02-P05->UTN-01-01-02-P06',
  'UTN-03-01-03-P05->UTN-03-01-03-P06',
  'UTN-01-01-02-P02->UTN-01-01-02-P03',
  'UTN-03-01-03-P02->UTN-03-01-03-P03',
  'UTN-01-01-02-P02->UTN-01-01-02-P05',
  'UTN-03-01-03-P02->UTN-03-01-03-P05',
  'REN-02-01-03-P05->REN-02-01-03-P06',
  'REN-04-01-07-P05->REN-04-01-07-P06',
  'BRG-02-01-02-P04->BRG-02-01-02-P05',
  'BRG-04-01-06-P04->BRG-04-01-06-P05',
  'UTN-01-01-04-P02->UTN-01-01-04-P03',
  'UTN-03-01-06-P02->UTN-03-01-06-P03',
  'UTN-01-01-04-P02->UTN-01-01-04-P05',
  'UTN-03-01-06-P02->UTN-03-01-06-P05',
  'UTN-02-01-01-P05->UTN-02-01-01-P06',
  'UTN-03-01-07-P05->UTN-03-01-07-P06',
  'UTN-02-01-01-P06->UTN-02-01-01-P07',
  'UTN-03-01-07-P06->UTN-03-01-07-P07',
  'UTN-02-01-01-P06->UTN-02-01-01-P08',
  'UTN-03-01-07-P06->UTN-03-01-07-P08',
  'UTN-02-01-01-P07->UTN-02-01-01-P08',
  'UTN-03-01-07-P07->UTN-03-01-07-P08',
  'UTN-02-01-02-P06->UTN-02-01-02-P07',
  'UTN-03-01-08-P06->UTN-03-01-08-P07',
  'UTN-02-01-02-P06->UTN-02-01-02-P08',
  'UTN-03-01-08-P06->UTN-03-01-08-P08',
  'UTN-02-01-02-P03->UTN-02-01-02-P04',
  'UTN-03-01-08-P03->UTN-03-01-08-P04',
  'UTN-02-01-02-P02->UTN-02-01-02-P03',
  'UTN-02-01-02-P02->UTN-02-01-02-P05',
  'UTN-03-01-08-P02->UTN-03-01-08-P03',
  'UTN-03-01-08-P02->UTN-03-01-08-P05',
  'UHR-03-01-01-P06->UHR-03-01-01-P07',
  'UHR-04-01-07-P06->UHR-04-01-07-P07',
  'UHR-04-01-08-P06->UHR-04-01-08-P07',
  'UHR-03-01-01-P06->UHR-03-01-01-P08',
  'UHR-04-01-07-P06->UHR-04-01-07-P08',
  'UHR-04-01-08-P06->UHR-04-01-08-P08',
  'UHR-03-01-02-P02->UHR-03-01-02-P05',
  'UHR-04-01-09-P02->UHR-04-01-09-P05',
  'UHR-03-01-02-P07->UHR-03-01-02-P08',
  'UHR-04-01-09-P07->UHR-04-01-09-P08',
])

function stableEdgeOf(predecessorNode: ChinaTemplateCatalogNode, successorNode: ChinaTemplateCatalogNode) {
  return `${predecessorNode.stableCode}->${successorNode.stableCode}`
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(normalizeText).filter(Boolean))]
  const text = normalizeText(value)
  return text ? [...new Set(text.split(/[,\s]+/).map(normalizeText).filter(Boolean))] : []
}

function normalizeSearchText(value: unknown) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s_\-:：/\\|()[\]{}.,，。;；]+/g, '')
}

function hasPromotionReadableName(value: unknown) {
  const text = normalizeText(value)
  return /[\u3400-\u9fffA-Za-z0-9]/.test(text)
}

function hasMalformedInternalFlowPairName(pair: { predecessorName: string; successorName: string }) {
  return !hasPromotionReadableName(pair.predecessorName) || !hasPromotionReadableName(pair.successorName)
}

function getCatalogGroup(catalog: ChinaTemplateCatalog) {
  const record = catalog as ChinaTemplateCatalog & { packType?: string; templateGroup?: string }
  return record.packType || record.templateGroup || (catalog.templateId === CHINA_GB55032_TEMPLATE_CATALOG.templateId ? 'core_quality' : 'unknown')
}

function getCatalogPackType(catalog: ChinaTemplateCatalog): WbsTemplateCatalogGroup {
  const record = catalog as ChinaTemplateCatalog & { packType?: WbsTemplateCatalogGroup; templateGroup?: string }
  if (record.packType) return record.packType
  return record.templateGroup ? 'specialty' : 'core_quality'
}

function getCatalogSource(catalog: ChinaTemplateCatalog) {
  return catalog.templateId === CHINA_GB55032_TEMPLATE_CATALOG.templateId
    ? 'china_gb50300_template_catalog'
    : 'domain_wbs_template_catalog'
}

function nodeMatchesCodePrefix(node: ChinaTemplateCatalogNode, prefix: string) {
  const stableCode = normalizeText(node.stableCode)
  const normalizedPrefix = normalizeText(prefix)
  return Boolean(stableCode && normalizedPrefix) && (
    stableCode === normalizedPrefix
    || stableCode.startsWith(`${normalizedPrefix}-`)
    || stableCode.startsWith(`${normalizedPrefix}:`)
  )
}

function nodeMatchesAnyCodePrefix(node: ChinaTemplateCatalogNode, prefixes: readonly string[]) {
  return prefixes.some((prefix) => nodeMatchesCodePrefix(node, prefix))
}

function nodeMatchesAnyExcludedCodePrefix(node: ChinaTemplateCatalogNode, prefixes?: readonly string[]) {
  return Array.isArray(prefixes)
    && prefixes.length > 0
    && nodeMatchesAnyCodePrefix(node, prefixes)
}

function nodeMatchesAnyExactStableCode(node: ChinaTemplateCatalogNode, stableCodes?: readonly string[]) {
  if (!Array.isArray(stableCodes) || stableCodes.length === 0) return false
  const stableCode = normalizeText(node.stableCode)
  return stableCodes.some((candidate) => normalizeText(candidate) === stableCode)
}

function nodeMatchesCategoryTypes(node: ChinaTemplateCatalogNode, categoryTypes?: readonly string[]) {
  if (!categoryTypes || categoryTypes.length === 0) return true
  return categoryTypes.map(normalizeText).includes(normalizeText(node.categoryType))
}

function collectCrossItemWorkflowCoverageNodes(catalogs: ChinaTemplateCatalog[]) {
  const coverageNodes: Array<{ catalog: ChinaTemplateCatalog; node: ChinaTemplateCatalogNode; catalogGroup: string }> = []
  const visit = (catalog: ChinaTemplateCatalog, node: ChinaTemplateCatalogNode) => {
    if (['division', 'sub_division', 'item_work', 'process'].includes(normalizeText(node.categoryType))) {
      coverageNodes.push({ catalog, node, catalogGroup: getCatalogGroup(catalog) })
    }
    for (const child of node.children ?? []) visit(catalog, child)
  }

  for (const catalog of catalogs) {
    for (const node of catalog.divisions) visit(catalog, node)
  }
  return coverageNodes
}

function collectCrossItemWorkflowCoverage() {
  const catalogs: ChinaTemplateCatalog[] = [
    CHINA_GB55032_TEMPLATE_CATALOG,
    ...DOMAIN_WBS_TEMPLATE_CATALOGS,
  ]
  const coverageNodes = collectCrossItemWorkflowCoverageNodes(catalogs)
  const summary = {
    ruleCount: V1475_CROSS_ITEM_WORKFLOW_SEED.length,
    activeRuleCount: 0,
    confirmedTemplateOnlyCount: 0,
    manualConfirmCount: 0,
    candidateOnlyCount: 0,
    zeroMatchRuleCount: 0,
    p1EnhancementRuleCount: 0,
    byScopeRule: {} as Record<string, number>,
    byAutoApplyPolicy: {} as Record<string, number>,
    bySourceStandard: {} as Record<string, number>,
    byHandoffCategory: {} as Record<string, number>,
    predecessorMatchCountTotal: 0,
    successorMatchCountTotal: 0,
  }
  const zeroMatchRules: Array<{
    stableCode: string
    predecessorMatchCount: number
    successorMatchCount: number
    autoApplyPolicy: string
    scopeRule: string
  }> = []
  const isP1EnhancementRule = (rule: V1475CrossItemWorkflowRule) => (
    rule.sourceVersion.includes('20260524')
    || /schedule-trust-(?:hard|process)-anchor/i.test(rule.sourceVersion)
  )

  for (const rule of V1475_CROSS_ITEM_WORKFLOW_SEED) {
    if (rule.isActive === false) continue
    summary.activeRuleCount += 1
    if (isP1EnhancementRule(rule)) summary.p1EnhancementRuleCount += 1
    if (rule.autoApplyPolicy === 'confirmed_template_only') summary.confirmedTemplateOnlyCount += 1
    if (rule.autoApplyPolicy === 'manual_confirm') summary.manualConfirmCount += 1
    if (rule.autoApplyPolicy === 'candidate_only') summary.candidateOnlyCount += 1
    bumpCount(summary.byScopeRule, rule.scopeRule)
    bumpCount(summary.byAutoApplyPolicy, rule.autoApplyPolicy)
    bumpCount(summary.bySourceStandard, rule.sourceStandard)
    if (rule.handoffCategory) bumpCount(summary.byHandoffCategory, rule.handoffCategory)

    const predecessorMatchCount = coverageNodes.filter(({ node }) => (
      nodeMatchesAnyCodePrefix(node, rule.predecessorCodePrefixes)
      && !nodeMatchesAnyExcludedCodePrefix(node, rule.excludedPredecessorCodePrefixes)
      && !nodeMatchesAnyExactStableCode(node, rule.excludedPredecessorStableCodes)
      && nodeMatchesCategoryTypes(node, rule.predecessorCategoryTypes)
    )).length
    const successorMatchCount = coverageNodes.filter(({ node }) => (
      nodeMatchesAnyCodePrefix(node, rule.successorCodePrefixes)
      && !nodeMatchesAnyExcludedCodePrefix(node, rule.excludedSuccessorCodePrefixes)
      && !nodeMatchesAnyExactStableCode(node, rule.excludedSuccessorStableCodes)
      && nodeMatchesCategoryTypes(node, rule.successorCategoryTypes)
    )).length
    summary.predecessorMatchCountTotal += predecessorMatchCount
    summary.successorMatchCountTotal += successorMatchCount
    if (predecessorMatchCount === 0 || successorMatchCount === 0) {
      summary.zeroMatchRuleCount += 1
      zeroMatchRules.push({
        stableCode: rule.stableCode,
        predecessorMatchCount,
        successorMatchCount,
        autoApplyPolicy: rule.autoApplyPolicy,
        scopeRule: rule.scopeRule,
      })
    }
  }

  return {
    scope: 'cross_item_workflow_package_mainline_coverage',
    backendOnly: true,
    coveragePolicy: {
      ownsOnlyPhysicalConstructionMainline: true,
      auditsPackageAndProcessLevelAnchors: true,
      confirmedTemplateOnlyMayGeneratePackageDependencies: true,
      manualConfirmRulesStayGovernanceSignals: true,
      noLagOrDurationAuthority: true,
      noOrdinaryFrontendExposure: true,
      explicitTaskDependenciesWin: true,
    },
    summary,
    zeroMatchRules,
  }
}

function readDurationContributionMode(node: ChinaTemplateCatalogNode): DurationContributionMode {
  const metadata = node.metadata ?? {}
  return normalizeDurationContributionMode(metadata.durationContributionMode ?? metadata.duration_contribution_mode)
    ?? inferDurationContributionMode({ name: node.name, metadata })
}

function isInternalFlowNode(node: ChinaTemplateCatalogNode) {
  return node.categoryType === 'process' || node.categoryType === 'activity_step'
}

function isInternalFlowAnchor(node: ChinaTemplateCatalogNode) {
  return PROCESS_CONSTRAINT_COVERAGE_ANCHOR_MODES.has(readDurationContributionMode(node))
}

function resolveCoverageInternalFlowRule(input: {
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
}) {
  return resolveStandardInternalFlowRule({
    catalogSource: getCatalogSource(input.catalog),
    predecessorStableCode: input.predecessorNode.stableCode,
    predecessorName: input.predecessorNode.name,
    successorStableCode: input.successorNode.stableCode,
    successorName: input.successorNode.name,
    successorCategoryType: input.successorNode.categoryType,
  })
}

function processConstraintSearchTerms(rule: V1474ProcessConstraintRule) {
  return [
    rule.stableCode,
    ...rule.keywords,
    ...rule.durationLookupKeys,
    ...rule.carrierProcessHints,
  ]
    .map((item) => normalizeSearchText(item))
    .filter((item) => item.length >= 2)
}

function keywordGroupsMatch(haystack: string, rule: V1474ProcessConstraintRule) {
  const groups = Array.isArray(rule.requiredKeywordGroups) ? rule.requiredKeywordGroups : []
  if (groups.length === 0) return true
  return groups.every((group) => (
    Array.isArray(group)
    && group.map((item) => normalizeSearchText(item)).filter((item) => item.length >= 2)
      .some((term) => haystack.includes(term))
  ))
}

function looksLikeStableCodeTerm(term: string) {
  return /^[a-z]{0,4}\d{2}(?:-\d{2})+/i.test(term)
}

function stableCodeTermMatches(rawParts: readonly string[], term: string) {
  const normalizedTerm = normalizeText(term).toLowerCase()
  return rawParts.some((part) => {
    const normalizedPart = normalizeText(part).toLowerCase()
    return normalizedPart === normalizedTerm
      || normalizedPart.startsWith(`${normalizedTerm}-`)
      || normalizedPart.startsWith(`${normalizedTerm}:`)
  })
}

function excludedKeywordsMatch(haystack: string, rule: V1474ProcessConstraintRule, rawParts: readonly string[] = []) {
  const terms = Array.isArray(rule.excludedKeywordTerms)
    ? rule.excludedKeywordTerms
      .map((item) => ({ raw: normalizeText(item), normalized: normalizeSearchText(item) }))
      .filter((item) => item.normalized.length >= 2)
    : []
  return terms.some((term) => {
    if (looksLikeStableCodeTerm(term.raw)) return stableCodeTermMatches(rawParts, term.raw)
    return haystack.includes(term.normalized)
  })
}

function prefixMatches(code: string, prefixes: unknown) {
  const normalizedCode = normalizeText(code).toLowerCase()
  const prefixList = Array.isArray(prefixes)
    ? prefixes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : []
  return prefixList.some((prefix) => {
    if (/^\d{2}$/.test(prefix)) return false
    return normalizedCode === prefix
      || normalizedCode.startsWith(`${prefix}-`)
      || normalizedCode.startsWith(prefix)
  })
}

function prefixMatchStats(code: string, prefixes: unknown) {
  const normalizedCode = normalizeText(code).toLowerCase()
  const prefixList = Array.isArray(prefixes)
    ? prefixes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : []
  let matchCount = 0
  let bestLength = 0

  for (const prefix of prefixList) {
    if (/^\d{2}$/.test(prefix)) continue
    const matches = normalizedCode === prefix
      || normalizedCode.startsWith(`${prefix}-`)
      || normalizedCode.startsWith(prefix)
    if (!matches) continue
    matchCount += 1
    if (prefix.length > bestLength) bestLength = prefix.length
  }

  return { matchCount, bestLength }
}

function endpointPrefixSpecificityStats(code: string, prefixes: unknown) {
  const normalizedCode = normalizeText(code).toLowerCase()
  const prefixList = Array.isArray(prefixes)
    ? prefixes.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : []
  let matchCount = 0
  let exactMatchCount = 0
  let bestLength = 0

  for (const prefix of prefixList) {
    if (/^\d{2}$/.test(prefix)) continue
    const exact = normalizedCode === prefix
    const matches = exact
      || normalizedCode.startsWith(`${prefix}-`)
      || normalizedCode.startsWith(prefix)
    if (!matches) continue
    matchCount += 1
    if (exact) exactMatchCount += 1
    if (prefix.length > bestLength) bestLength = prefix.length
  }

  return { matchCount, exactMatchCount, bestLength }
}

function processConstraintEndpointSpecificity(input: {
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
}, prefixes: unknown) {
  const predecessorStats = endpointPrefixSpecificityStats(input.predecessorNode.stableCode, prefixes)
  const successorStats = endpointPrefixSpecificityStats(input.successorNode.stableCode, prefixes)
  const bothEndpointsMatched = predecessorStats.matchCount > 0 && successorStats.matchCount > 0
  const bothEndpointsExact = predecessorStats.exactMatchCount > 0 && successorStats.exactMatchCount > 0

  return {
    bothEndpointsMatched,
    bothEndpointsExact,
    exactEndpointMatchCount: predecessorStats.exactMatchCount + successorStats.exactMatchCount,
    bestEndpointLengthSum: predecessorStats.bestLength + successorStats.bestLength,
  }
}

function processConstraintScopeSpecificity(scopeGranularity: V1474ProcessConstraintRule['scopeGranularity']) {
  switch (scopeGranularity) {
    case 'task': return 80
    case 'room': return 72
    case 'segment': return 68
    case 'zone': return 60
    case 'floor': return 52
    case 'building': return 45
    case 'system': return 64
    default: return 40
  }
}

type ProcessConstraintCoverageRelationKind =
  | StandardInternalFlowRule['relationKind']
  | 'dependency_intent'
  | 'explicit_task_dependency'
type ProcessConstraintCoverageRule = Pick<
  StandardInternalFlowRule,
  'predecessorName' | 'successorName' | 'createsDependency' | 'dependencyType' | 'lagDays'
> & {
  relationKind: ProcessConstraintCoverageRelationKind
}

function processConstraintMatchScore(input: {
  parentNode: ChinaTemplateCatalogNode
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  catalogGroup: string
  rule: ProcessConstraintCoverageRule
}, candidate: V1474ProcessConstraintRule, quality: 'structured_code' | 'keyword_fallback') {
  const prefixes = [
    ...(candidate.templateNodeStableCodePrefixes ?? []),
    ...(candidate.standardCatalogCodePrefixes ?? []),
  ]
  const parentStats = prefixMatchStats(input.parentNode.stableCode, prefixes)
  const predecessorStats = prefixMatchStats(input.predecessorNode.stableCode, prefixes)
  const successorStats = prefixMatchStats(input.successorNode.stableCode, prefixes)
  const endpointSpecificity = processConstraintEndpointSpecificity(input, prefixes)
  const prefixMatchCount = parentStats.matchCount + predecessorStats.matchCount + successorStats.matchCount
  const bestPrefixLength = Math.max(parentStats.bestLength, predecessorStats.bestLength, successorStats.bestLength)
  const requiredKeywordGroupCount = candidate.requiredKeywordGroups?.length ?? 0
  const excludedKeywordCount = candidate.excludedKeywordTerms?.length ?? 0
  const conditionalEffectCount = candidate.conditionalEffects?.length ?? 0
  const catalogGroupCount = candidate.applicableCatalogGroups?.length ?? 0
  const durationModeCount = candidate.applicableDurationContributionModes?.length ?? 0
  const relationKindCount = candidate.supportedRelationKinds?.length ?? 0

  return (
    (quality === 'structured_code' ? 10_000 : 6_000)
    + (endpointSpecificity.bothEndpointsExact ? 15_000 : 0)
    + (endpointSpecificity.bothEndpointsMatched ? 2_500 : 0)
    + endpointSpecificity.exactEndpointMatchCount * 1_500
    + endpointSpecificity.bestEndpointLengthSum * 30
    + prefixMatchCount * 220
    + bestPrefixLength * 14
    + requiredKeywordGroupCount * 200
    + excludedKeywordCount * 16
    + conditionalEffectCount * 60
    + processConstraintScopeSpecificity(candidate.scopeGranularity)
    + (candidate.gateRequired ? 18 : 0)
    + Math.round(Math.min(candidate.minReleaseQuantityPercent ?? 0, 100) / 4)
    + (candidate.quantityEvidenceRequirement === 'real_quantity_required_for_auto_release' ? 25 : 0)
    + (candidate.quantityEvidenceRequirement === 'real_or_default_quantity_proxy_allowed' ? 10 : 0)
    - catalogGroupCount * 25
    - durationModeCount * 35
    - relationKindCount * 12
  )
}

function catalogGroupMatches(catalogGroup: string, rule: V1474ProcessConstraintRule) {
  if (!rule.applicableCatalogGroups?.length) return true
  const normalized = normalizeText(catalogGroup).toLowerCase()
  return rule.applicableCatalogGroups.map((item) => normalizeText(item).toLowerCase()).includes(normalized)
}

function durationContributionModeMatches(node: ChinaTemplateCatalogNode, rule: V1474ProcessConstraintRule) {
  if (!rule.applicableDurationContributionModes?.length) return true
  return rule.applicableDurationContributionModes.includes(readDurationContributionMode(node) as any)
}

function nodeMatchesDurationContributionModes(node: ChinaTemplateCatalogNode, modes?: readonly DurationContributionMode[]) {
  if (!modes?.length) return true
  return modes.includes(readDurationContributionMode(node))
}

function relationKindMatches(ruleKind: string, rule: V1474ProcessConstraintRule) {
  if (!rule.supportedRelationKinds?.length) return true
  return rule.supportedRelationKinds.includes(ruleKind as any)
}

type ProcessConstraintEdgeScope = 'same_parent_edge' | 'cross_scope_edge'

function relationshipScopeMatches(edgeScope: ProcessConstraintEdgeScope, rule: V1474ProcessConstraintRule) {
  if (edgeScope === 'same_parent_edge' && rule.relationshipScope === 'same_parent_or_cross_scope_edge') return true
  return rule.relationshipScope === edgeScope
}

function isL2OwnedSameParentProcessStartEdge(input: {
  edgeScope: ProcessConstraintEdgeScope
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.edgeScope !== 'same_parent_edge') return false
  if (input.rule.relationKind !== 'hard_sequence') return false

  const predecessorText = normalizeSearchText([
    input.predecessorNode.name,
    input.rule.predecessorName,
  ].join(' '))
  const successorText = normalizeSearchText([
    input.successorNode.name,
    input.rule.successorName,
  ].join(' '))
  const predecessorIsStartReadinessReview = [
    '材料',
    '构件',
    '设备',
    '作业面',
    '工艺条件',
    '条件复核',
    '材料和工艺',
    'material',
    'workface',
    'condition review',
  ].some((term) => predecessorText.includes(normalizeSearchText(term)))
  const successorStartsPhysicalWork = [
    '安装',
    '施工',
    '焊接',
    '涂装',
    '铺贴',
    '敷设',
    '接口连接',
    'install',
    'installation',
    'weld',
    'painting',
    'coating',
    'laying',
  ].some((term) => successorText.includes(normalizeSearchText(term)))
  const successorIsL5FactOrWait = [
    '检测',
    '试验',
    '测试',
    '调试',
    '验收',
    '复验',
    '养护',
    '龄期',
    '冲洗',
    '试压',
    '保压',
    '干膜',
    '附着力',
    '闭合',
    '移交',
    'test',
    'inspection',
    'acceptance',
    'commissioning',
    'curing',
    'flush',
    'pressure',
    'adhesion',
    'handover',
  ].some((term) => successorText.includes(normalizeSearchText(term)))

  return predecessorIsStartReadinessReview && successorStartsPhysicalWork && !successorIsL5FactOrWait
}

function isL2OwnedSameParentCuratedDependencyEdge(input: {
  edgeScope: ProcessConstraintEdgeScope
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.edgeScope !== 'same_parent_edge') return false
  if (input.rule.relationKind === 'parallel_allowed') return false
  if (isStandaloneInfrastructureL5BackValidationEdge({
    catalog: input.catalog,
    predecessorNode: input.predecessorNode,
    successorNode: input.successorNode,
  })) return false

  const l2Rule = resolveCoverageInternalFlowRule(input)
  const stableEdge = stableEdgeOf(input.predecessorNode, input.successorNode)

  return l2Rule.curationStatus === 'curated'
    && l2Rule.createsDependency
    && l2Rule.relationKind === input.rule.relationKind
    && l2Rule.reviewNeeded === false
    && (
      l2Rule.governancePriority !== 'P2'
      || (
        l2Rule.governancePriority === 'P2'
        && isInternalFlowNode(input.predecessorNode)
        && isInternalFlowNode(input.successorNode)
      )
      || L2_EXACT_SAME_PARENT_CLOSEOUT_TAIL_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION.has(stableEdge)
      || L2_EXACT_SAME_PARENT_ACTIVITY_STEP_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION.has(stableEdge)
      || L2_EXACT_SAME_PARENT_STABLE_CODE_DEPENDENCY_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION.has(stableEdge)
      || L2_EXACT_SAME_PARENT_SPECIALTY_DEPTH_GATE_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION.has(stableEdge)
    )
}

function isExactL2SpecialtyDepthGateExcludedFromL5BackValidation(input: {
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.rule.relationKind === 'parallel_allowed') return false
  return L2_EXACT_SAME_PARENT_SPECIALTY_DEPTH_GATE_EDGES_EXCLUDED_FROM_L5_BACK_VALIDATION.has(
    stableEdgeOf(input.predecessorNode, input.successorNode),
  )
}

function isL2OwnedSameParentCuratedSoftOrderEdge(input: {
  edgeScope: ProcessConstraintEdgeScope
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.edgeScope !== 'same_parent_edge') return false
  if (input.rule.relationKind !== 'soft_sequence') return false

  const l2Rule = resolveCoverageInternalFlowRule(input)

  return l2Rule.curationStatus === 'curated'
    && !l2Rule.createsDependency
    && l2Rule.relationKind === 'soft_sequence'
    && l2Rule.reviewNeeded === false
    && l2Rule.governancePriority === 'P2'
}

function isL2OwnedSameParentCuratedExistingRelationEdge(input: {
  edgeScope: ProcessConstraintEdgeScope
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.edgeScope !== 'same_parent_edge') return false
  if (input.rule.relationKind === 'parallel_allowed') return false
  if (isStandaloneInfrastructureL5BackValidationEdge({
    catalog: input.catalog,
    predecessorNode: input.predecessorNode,
    successorNode: input.successorNode,
  })) return false

  const l2Rule = resolveCoverageInternalFlowRule(input)
  if (l2Rule.relationKind === 'parallel_allowed') return false

  return l2Rule.curationStatus === 'curated'
    && l2Rule.reviewNeeded === false
    && l2Rule.relationKind === input.rule.relationKind
}

function isL2OwnedSameParentManualStartDependencyEdge(input: {
  edgeScope: ProcessConstraintEdgeScope
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.edgeScope !== 'same_parent_edge') return false
  if (!['hard_sequence', 'acceptance_gate'].includes(input.rule.relationKind)) return false

  const l2Rule = resolveCoverageInternalFlowRule(input)
  const stableEdge = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  const exactManualCuratedDependencyRuleIds =
    L2_EXACT_MANUAL_CURATED_DEPENDENCY_EDGE_RULE_IDS_EXCLUDED_FROM_L5_BACK_VALIDATION.get(stableEdge)
  const isExactManualCuratedDependencyEdge = exactManualCuratedDependencyRuleIds
    ? exactManualCuratedDependencyRuleIds.some((ruleId) => l2Rule.seedRuleId.includes(ruleId))
    : false

  return l2Rule.curationStatus === 'curated'
    && l2Rule.createsDependency
    && l2Rule.relationKind === input.rule.relationKind
    && l2Rule.governancePriority === 'P2'
    && l2Rule.curationMethod === 'manual_registry'
    && (isExactManualCuratedDependencyEdge || [
      'decorative-depth-grid-to-settingout',
      'wall-sanding-clean-to-sample-confirm',
      'earthwork-moisture-compaction-to-surface-level',
      'inspection-rectification-to-asbuilt-handover',
    ].some((ruleId) => l2Rule.seedRuleId.includes(ruleId)))
}

function isL3ConfirmedParentCarrierExcludedFromL5BackValidation(input: {
  edgeScope: ProcessConstraintEdgeScope
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.edgeScope !== 'cross_scope_edge') return false
  if (input.rule.relationKind !== 'explicit_task_dependency') return false

  const stableEdge = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  return L3_CONFIRMED_PARENT_CARRIER_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)
}

function isL3ConfirmedExactProcessHandoffExcludedFromL5BackValidation(input: {
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.rule.relationKind !== 'explicit_task_dependency') return false

  const stableEdge = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  return (
    L3_CONFIRMED_EXACT_PROCESS_HANDOFF_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)
    || L3_DYNAMIC_CONFIRMED_EXACT_PROCESS_HANDOFF_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)
  )
}

function isL3RecommendedConfirmedAdviceExcludedFromL5BackValidation(input: {
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.rule.relationKind !== 'explicit_task_dependency') return false

  const stableEdge = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  return L3_RECOMMENDED_CONFIRMED_ADVICE_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)
}

function isL4FormalAcceptanceBoundaryExcludedFromL5BackValidation(input: {
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.rule.relationKind !== 'explicit_task_dependency') return false

  const stableEdge = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  return L4_FORMAL_ACCEPTANCE_BOUNDARY_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)
}

function isL3BroadOrFalseParentCarrierExcludedFromL5BackValidation(input: {
  edgeScope: ProcessConstraintEdgeScope
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  rule: ProcessConstraintCoverageRule
}) {
  if (input.rule.relationKind !== 'explicit_task_dependency') return false

  const stableEdge = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  if (EXACT_BROAD_OR_FALSE_PARENT_CARRIER_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)) return true

  if (input.edgeScope !== 'cross_scope_edge') return false

  return L3_BROAD_OR_FALSE_PARENT_CARRIER_L5_BACK_VALIDATION_EXCLUDED_EDGES.has(stableEdge)
}

const STABLE_CODE_INTERNAL_FLOW_RULES_BY_PREDECESSOR_CODE = (() => {
  const result = new Map<string, typeof STANDARD_INTERNAL_FLOW_RULE_SEED>()
  for (const rule of STANDARD_INTERNAL_FLOW_RULE_SEED) {
    if (rule.matchMode !== 'stable_code') continue
    if (!rule.predecessorStableCode || !rule.successorStableCode) continue
    if (!rule.createsDependency || rule.relationKind === 'parallel_allowed') continue
    const rules = result.get(rule.predecessorStableCode) ?? []
    rules.push(rule)
    result.set(rule.predecessorStableCode, rules)
  }
  return result
})()

function matchProcessConstraintRule(input: {
  parentNode: ChinaTemplateCatalogNode
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
  catalogGroup: string
  rule: ProcessConstraintCoverageRule
  edgeScope: ProcessConstraintEdgeScope
}): { rule: V1474ProcessConstraintRule; quality: 'structured_code' | 'keyword_fallback'; score: number } | null {
  const haystackParts = [
    input.parentNode.name,
    input.parentNode.stableCode,
    input.predecessorNode.name,
    input.predecessorNode.stableCode,
    input.successorNode.name,
    input.successorNode.stableCode,
    input.rule.predecessorName,
    input.rule.successorName,
  ].map(normalizeText)
  const haystack = normalizeSearchText(haystackParts.join(' '))

  const eligibleRules = V1474_PROCESS_CONSTRAINT_SEED.filter((constraint) => {
    if (!relationshipScopeMatches(input.edgeScope, constraint)) return false
    if (!catalogGroupMatches(input.catalogGroup, constraint)) return false
    if (!durationContributionModeMatches(input.successorNode, constraint)) return false
    if (!relationKindMatches(input.rule.relationKind, constraint)) return false
    return true
  })

  const matches: Array<{
    rule: V1474ProcessConstraintRule
    quality: 'structured_code' | 'keyword_fallback'
    score: number
  }> = eligibleRules.flatMap((constraint) => {
    const keywordMatch = keywordGroupsMatch(haystack, constraint)
      && !excludedKeywordsMatch(haystack, constraint, haystackParts)
      && processConstraintSearchTerms(constraint).some((term) => haystack.includes(term))
    if (!keywordMatch) return []

    const hasStructuredPrefix = (
      prefixMatches(input.parentNode.stableCode, constraint.templateNodeStableCodePrefixes)
      || prefixMatches(input.parentNode.stableCode, constraint.standardCatalogCodePrefixes)
      || prefixMatches(input.predecessorNode.stableCode, constraint.templateNodeStableCodePrefixes)
      || prefixMatches(input.predecessorNode.stableCode, constraint.standardCatalogCodePrefixes)
      || prefixMatches(input.successorNode.stableCode, constraint.templateNodeStableCodePrefixes)
      || prefixMatches(input.successorNode.stableCode, constraint.standardCatalogCodePrefixes)
    )

    if (!hasStructuredPrefix) return []
    const quality: 'structured_code' = 'structured_code'
    return [{
      rule: constraint,
      quality,
      score: processConstraintMatchScore(input, constraint, quality),
    }]
  })

  matches.sort((a, b) => (
    b.score - a.score
    || (a.quality === b.quality ? 0 : (a.quality === 'structured_code' ? -1 : 1))
    || a.rule.stableCode.localeCompare(b.rule.stableCode)
  ))

  return matches[0] ?? null
}

type ProcessConstraintCoveragePair = {
  predecessorName: string
  successorName: string
  count: number
  relationKinds: Record<string, number>
  catalogGroups: Record<string, number>
  exampleStableCodes: string[]
  matchedRuleCodes: string[]
  matchQualities: Record<string, number>
  quantityEvidenceRequirements: Record<string, number>
  quantityProxyRiskLevels: Record<string, number>
  backValidationPolicies: Record<string, number>
}

function bumpCount(target: Record<string, number>, key: string | undefined | null) {
  const normalized = normalizeText(key) || 'unknown'
  target[normalized] = (target[normalized] ?? 0) + 1
}

function addCoveragePair(
  target: Map<string, ProcessConstraintCoveragePair>,
  input: {
    predecessorNode: ChinaTemplateCatalogNode
    successorNode: ChinaTemplateCatalogNode
    catalogGroup: string
    relationKind: string
    matchedRuleCode?: string | null
    matchQuality?: string | null
    quantityEvidenceRequirement?: string | null
    quantityProxyRiskLevel?: string | null
    backValidationPolicy?: string | null
  },
) {
  const key = `${input.predecessorNode.name} -> ${input.successorNode.name}`
  const pair = target.get(key) ?? {
    predecessorName: input.predecessorNode.name,
    successorName: input.successorNode.name,
    count: 0,
    relationKinds: {},
    catalogGroups: {},
    exampleStableCodes: [],
    matchedRuleCodes: [],
    matchQualities: {},
    quantityEvidenceRequirements: {},
    quantityProxyRiskLevels: {},
    backValidationPolicies: {},
  }
  pair.count += 1
  bumpCount(pair.relationKinds, input.relationKind)
  bumpCount(pair.catalogGroups, input.catalogGroup)
  const stablePair = `${input.predecessorNode.stableCode}->${input.successorNode.stableCode}`
  if (pair.exampleStableCodes.length < 5 && !pair.exampleStableCodes.includes(stablePair)) pair.exampleStableCodes.push(stablePair)
  if (input.matchedRuleCode && !pair.matchedRuleCodes.includes(input.matchedRuleCode)) pair.matchedRuleCodes.push(input.matchedRuleCode)
  if (input.matchQuality) bumpCount(pair.matchQualities, input.matchQuality)
  if (input.quantityEvidenceRequirement) bumpCount(pair.quantityEvidenceRequirements, input.quantityEvidenceRequirement)
  if (input.quantityProxyRiskLevel) bumpCount(pair.quantityProxyRiskLevels, input.quantityProxyRiskLevel)
  if (input.backValidationPolicy) bumpCount(pair.backValidationPolicies, input.backValidationPolicy)
  target.set(key, pair)
}

const L5_STANDALONE_INFRASTRUCTURE_TEMPLATE_IDS = new Set([
  'china-airport-specialty',
  'china-bridge-specialty',
  'china-port-terminal-specialty',
  'china-renewable-energy-specialty',
  'china-utility-tunnel-specialty',
])

const L5_STANDALONE_INFRASTRUCTURE_STABLE_CODE_PREFIXES = [
  'APT-',
  'BRG-',
  'PRT-',
  'REN-',
  'UTN-',
]

function isStandaloneInfrastructureL5BackValidationEdge(input: {
  catalog: ChinaTemplateCatalog
  predecessorNode: ChinaTemplateCatalogNode
  successorNode: ChinaTemplateCatalogNode
}) {
  return (
    L5_STANDALONE_INFRASTRUCTURE_TEMPLATE_IDS.has(input.catalog.templateId)
    || L5_STANDALONE_INFRASTRUCTURE_STABLE_CODE_PREFIXES.some((prefix) => (
      input.predecessorNode.stableCode.startsWith(prefix)
      || input.successorNode.stableCode.startsWith(prefix)
    ))
  )
}

function collectProcessConstraintCoverage(limit = 50) {
  const catalogs: ChinaTemplateCatalog[] = [
    CHINA_GB55032_TEMPLATE_CATALOG,
    ...DOMAIN_WBS_TEMPLATE_CATALOGS,
  ]
  const summary = {
    catalogCount: catalogs.length,
    adjacentInternalFlowPairCount: 0,
    curatedExistingRelationEdgeCount: 0,
    generatedDependencyEdgeCount: 0,
    processConstraintMatchedEdgeCount: 0,
    processConstraintMatchedGeneratedDependencyEdgeCount: 0,
    sameParentExistingRelationEdgeCount: 0,
    sameParentGeneratedDependencyEdgeCount: 0,
    sameParentMatchedEdgeCount: 0,
    sameParentMatchedGeneratedDependencyEdgeCount: 0,
    crossScopeExistingRelationEdgeCount: 0,
    crossScopeGeneratedDependencyEdgeCount: 0,
    crossScopeMatchedEdgeCount: 0,
    crossScopeMatchedGeneratedDependencyEdgeCount: 0,
    unmatchedExistingRelationEdgeCount: 0,
    l2OwnedSameParentExcludedEdgeCount: 0,
    l3ConfirmedParentCarrierExcludedEdgeCount: 0,
    l3RecommendedAdviceExcludedEdgeCount: 0,
    l4FormalAcceptanceBoundaryExcludedEdgeCount: 0,
    broadOrFalseParentCarrierExcludedEdgeCount: 0,
    outOfScopeInfrastructureExcludedEdgeCount: 0,
    outOfScopeInfrastructureCatalogIdCounts: {} as Record<string, number>,
    keywordFallbackMatchedEdgeCount: 0,
    structuredCodeMatchedEdgeCount: 0,
    backValidationCandidateEligibleEdgeCount: 0,
    byCatalogGroup: {} as Record<string, number>,
    byCatalogGroupMatched: {} as Record<string, number>,
    byRelationKind: {} as Record<string, number>,
    byMatchedApplicationMode: {} as Record<string, number>,
    byMatchedConstraintType: {} as Record<string, number>,
    byMatchedRuleCode: {} as Record<string, number>,
    byMatchQuality: {} as Record<string, number>,
    byQuantityEvidenceRequirement: {} as Record<string, number>,
    byQuantityProxyRiskLevel: {} as Record<string, number>,
    conditionalEffectMatchedEdgeCount: 0,
    backValidationCandidateEligibleRuleCount: 0,
    selectiveCoverageRatio: 0,
    generatedDependencyMatchedRatio: 0,
    sameParentSelectiveCoverageRatio: 0,
    sameParentGeneratedDependencyMatchedRatio: 0,
    crossScopeSelectiveCoverageRatio: 0,
    crossScopeGeneratedDependencyMatchedRatio: 0,
  }
  const matchedPairs = new Map<string, ProcessConstraintCoveragePair>()
  const matchedPairsByRuleCode = new Map<string, Map<string, ProcessConstraintCoveragePair>>()
  const crossScopeMatchedPairs = new Map<string, ProcessConstraintCoveragePair>()
  const keywordFallbackPairs = new Map<string, ProcessConstraintCoveragePair>()
  const backValidationCandidatePairs = new Map<string, ProcessConstraintCoveragePair>()
  const unmatchedPairs = new Map<string, ProcessConstraintCoveragePair>()
  const outOfScopeInfrastructurePairs = new Map<string, ProcessConstraintCoveragePair>()
  const recordedSameParentStableEdges = new Set<string>()

  const sameParentStableEdgeKey = (
    catalog: ChinaTemplateCatalog,
    predecessorNode: ChinaTemplateCatalogNode,
    successorNode: ChinaTemplateCatalogNode,
  ) => `${catalog.templateId}:${predecessorNode.stableCode}->${successorNode.stableCode}`

  const recordExistingRelationEdge = (input: {
    catalog: ChinaTemplateCatalog
    parentNode: ChinaTemplateCatalogNode
    predecessorNode: ChinaTemplateCatalogNode
    successorNode: ChinaTemplateCatalogNode
    catalogGroup: string
    rule: ProcessConstraintCoverageRule
    edgeScope: ProcessConstraintEdgeScope
    generatedDependencyEdge: boolean
  }) => {
    const {
      catalog,
      parentNode,
      predecessorNode,
      successorNode,
      catalogGroup,
      rule,
      edgeScope,
      generatedDependencyEdge,
    } = input

    summary.curatedExistingRelationEdgeCount += 1
    if (edgeScope === 'same_parent_edge') summary.sameParentExistingRelationEdgeCount += 1
    else summary.crossScopeExistingRelationEdgeCount += 1
    bumpCount(summary.byCatalogGroup, catalogGroup)
    if (generatedDependencyEdge) {
      summary.generatedDependencyEdgeCount += 1
      if (edgeScope === 'same_parent_edge') summary.sameParentGeneratedDependencyEdgeCount += 1
      else summary.crossScopeGeneratedDependencyEdgeCount += 1
    }

    const matched = matchProcessConstraintRule({
      parentNode,
      predecessorNode,
      successorNode,
      catalogGroup,
      rule,
      edgeScope,
    })
    if (matched) {
      summary.processConstraintMatchedEdgeCount += 1
      if (edgeScope === 'same_parent_edge') summary.sameParentMatchedEdgeCount += 1
      else summary.crossScopeMatchedEdgeCount += 1
      if (matched.quality === 'structured_code') summary.structuredCodeMatchedEdgeCount += 1
      else summary.keywordFallbackMatchedEdgeCount += 1
      if (generatedDependencyEdge) {
        summary.processConstraintMatchedGeneratedDependencyEdgeCount += 1
        if (edgeScope === 'same_parent_edge') summary.sameParentMatchedGeneratedDependencyEdgeCount += 1
        else summary.crossScopeMatchedGeneratedDependencyEdgeCount += 1
      }
      bumpCount(summary.byCatalogGroupMatched, catalogGroup)
      bumpCount(summary.byMatchedApplicationMode, matched.rule.applicationMode)
      bumpCount(summary.byMatchedConstraintType, matched.rule.constraintType)
      bumpCount(summary.byMatchedRuleCode, matched.rule.stableCode)
      bumpCount(summary.byMatchQuality, matched.quality)
      bumpCount(summary.byQuantityEvidenceRequirement, matched.rule.quantityEvidenceRequirement)
      bumpCount(summary.byQuantityProxyRiskLevel, matched.rule.quantityProxyRiskLevel)
      if ((matched.rule.conditionalEffects ?? []).length > 0) {
        summary.conditionalEffectMatchedEdgeCount += 1
      }
      if (matched.rule.backValidationPolicy === 'candidate_only_from_execution_history') {
        summary.backValidationCandidateEligibleRuleCount += 1
        summary.backValidationCandidateEligibleEdgeCount += 1
        addCoveragePair(backValidationCandidatePairs, {
          predecessorNode,
          successorNode,
          catalogGroup,
          relationKind: rule.relationKind,
          matchedRuleCode: matched.rule.stableCode,
          matchQuality: matched.quality,
          quantityEvidenceRequirement: matched.rule.quantityEvidenceRequirement,
          quantityProxyRiskLevel: matched.rule.quantityProxyRiskLevel,
          backValidationPolicy: matched.rule.backValidationPolicy,
        })
      }
      if (matched.quality === 'keyword_fallback') {
        addCoveragePair(keywordFallbackPairs, {
          predecessorNode,
          successorNode,
          catalogGroup,
          relationKind: rule.relationKind,
          matchedRuleCode: matched.rule.stableCode,
          matchQuality: matched.quality,
          quantityEvidenceRequirement: matched.rule.quantityEvidenceRequirement,
          quantityProxyRiskLevel: matched.rule.quantityProxyRiskLevel,
          backValidationPolicy: matched.rule.backValidationPolicy,
        })
      }
      addCoveragePair(matchedPairs, {
        predecessorNode,
        successorNode,
        catalogGroup,
        relationKind: rule.relationKind,
        matchedRuleCode: matched.rule.stableCode,
        matchQuality: matched.quality,
        quantityEvidenceRequirement: matched.rule.quantityEvidenceRequirement,
        quantityProxyRiskLevel: matched.rule.quantityProxyRiskLevel,
        backValidationPolicy: matched.rule.backValidationPolicy,
      })
      const ruleMatchedPairs = matchedPairsByRuleCode.get(matched.rule.stableCode) ?? new Map<string, ProcessConstraintCoveragePair>()
      addCoveragePair(ruleMatchedPairs, {
        predecessorNode,
        successorNode,
        catalogGroup,
        relationKind: rule.relationKind,
        matchedRuleCode: matched.rule.stableCode,
        matchQuality: matched.quality,
        quantityEvidenceRequirement: matched.rule.quantityEvidenceRequirement,
        quantityProxyRiskLevel: matched.rule.quantityProxyRiskLevel,
        backValidationPolicy: matched.rule.backValidationPolicy,
      })
      matchedPairsByRuleCode.set(matched.rule.stableCode, ruleMatchedPairs)
      if (edgeScope === 'cross_scope_edge') {
        addCoveragePair(crossScopeMatchedPairs, {
          predecessorNode,
          successorNode,
          catalogGroup,
          relationKind: rule.relationKind,
          matchedRuleCode: matched.rule.stableCode,
          matchQuality: matched.quality,
          quantityEvidenceRequirement: matched.rule.quantityEvidenceRequirement,
          quantityProxyRiskLevel: matched.rule.quantityProxyRiskLevel,
          backValidationPolicy: matched.rule.backValidationPolicy,
        })
      }
    } else if (
      isL2OwnedSameParentProcessStartEdge({
        edgeScope,
        predecessorNode,
        successorNode,
        rule,
      })
      || isL2OwnedSameParentCuratedDependencyEdge({
        edgeScope,
        catalog,
        predecessorNode,
        successorNode,
        rule,
      })
      || isL2OwnedSameParentCuratedSoftOrderEdge({
        edgeScope,
        catalog,
        predecessorNode,
        successorNode,
        rule,
      })
      || isL2OwnedSameParentCuratedExistingRelationEdge({
        edgeScope,
        catalog,
        predecessorNode,
        successorNode,
        rule,
      })
      || isExactL2SpecialtyDepthGateExcludedFromL5BackValidation({
        predecessorNode,
        successorNode,
        rule,
      })
      || isL2OwnedSameParentManualStartDependencyEdge({
        edgeScope,
        catalog,
        predecessorNode,
        successorNode,
        rule,
      })
    ) {
      summary.l2OwnedSameParentExcludedEdgeCount += 1
    } else if (
      isL3ConfirmedParentCarrierExcludedFromL5BackValidation({
        edgeScope,
        predecessorNode,
        successorNode,
        rule,
      })
      || isL3ConfirmedExactProcessHandoffExcludedFromL5BackValidation({
        predecessorNode,
        successorNode,
        rule,
      })
    ) {
      summary.l3ConfirmedParentCarrierExcludedEdgeCount += 1
    } else if (
      isL3RecommendedConfirmedAdviceExcludedFromL5BackValidation({
        predecessorNode,
        successorNode,
        rule,
      })
    ) {
      summary.l3RecommendedAdviceExcludedEdgeCount += 1
    } else if (
      isL4FormalAcceptanceBoundaryExcludedFromL5BackValidation({
        predecessorNode,
        successorNode,
        rule,
      })
    ) {
      summary.l4FormalAcceptanceBoundaryExcludedEdgeCount += 1
    } else if (
      isL3BroadOrFalseParentCarrierExcludedFromL5BackValidation({
        edgeScope,
        predecessorNode,
        successorNode,
        rule,
      })
    ) {
      summary.broadOrFalseParentCarrierExcludedEdgeCount += 1
    } else if (
      isStandaloneInfrastructureL5BackValidationEdge({
        catalog,
        predecessorNode,
        successorNode,
      })
    ) {
      summary.outOfScopeInfrastructureExcludedEdgeCount += 1
      bumpCount(summary.outOfScopeInfrastructureCatalogIdCounts, catalog.templateId)
      addCoveragePair(outOfScopeInfrastructurePairs, {
        predecessorNode,
        successorNode,
        catalogGroup,
        relationKind: rule.relationKind,
        matchedRuleCode: null,
      })
    } else {
      summary.unmatchedExistingRelationEdgeCount += 1
      addCoveragePair(unmatchedPairs, {
        predecessorNode,
        successorNode,
        catalogGroup,
        relationKind: rule.relationKind,
        matchedRuleCode: null,
      })
    }
  }

  const visit = (catalog: ChinaTemplateCatalog, parentNode: ChinaTemplateCatalogNode) => {
    const siblingNodes = (parentNode.children ?? []).filter(isInternalFlowNode)
    const catalogGroup = getCatalogGroup(catalog)
    const siblingNodesByStableCode = new Map(siblingNodes.map((node) => [node.stableCode, node]))
    for (let index = 1; index < siblingNodes.length; index += 1) {
      const predecessorNode = siblingNodes[index - 1]
      const successorNode = siblingNodes[index]
      const previousAnchorNode = siblingNodes.slice(0, index).reverse().find(isInternalFlowAnchor) ?? null
      const rule = resolveCoverageInternalFlowRule({ catalog, predecessorNode, successorNode })
      summary.adjacentInternalFlowPairCount += 1
      bumpCount(summary.byRelationKind, rule.relationKind)
      if (rule.curationStatus !== 'curated' || rule.relationKind === 'parallel_allowed') continue

      const successorIsAnchor = isInternalFlowAnchor(successorNode)
      const generatedDependencyEdge = Boolean(rule.createsDependency && successorIsAnchor && previousAnchorNode)
      recordedSameParentStableEdges.add(sameParentStableEdgeKey(catalog, predecessorNode, successorNode))
      recordExistingRelationEdge({
        catalog,
        parentNode,
        predecessorNode,
        successorNode,
        catalogGroup,
        rule,
        edgeScope: 'same_parent_edge',
        generatedDependencyEdge,
      })
    }
    for (const predecessorNode of siblingNodes) {
      const candidateRules = STABLE_CODE_INTERNAL_FLOW_RULES_BY_PREDECESSOR_CODE.get(predecessorNode.stableCode) ?? []
      for (const candidateRule of candidateRules) {
        const successorNode = siblingNodesByStableCode.get(candidateRule.successorStableCode ?? '')
        if (!successorNode || successorNode === predecessorNode) continue
        const stableEdgeKey = sameParentStableEdgeKey(catalog, predecessorNode, successorNode)
        if (recordedSameParentStableEdges.has(stableEdgeKey)) continue

        const resolvedRule = resolveCoverageInternalFlowRule({ catalog, predecessorNode, successorNode })
        if (resolvedRule.curationStatus !== 'curated') continue
        if (!resolvedRule.createsDependency || resolvedRule.relationKind === 'parallel_allowed') continue

        const successorIndex = siblingNodes.indexOf(successorNode)
        const previousAnchorNode = successorIndex > 0
          ? siblingNodes.slice(0, successorIndex).reverse().find(isInternalFlowAnchor) ?? null
          : null
        const successorIsAnchor = isInternalFlowAnchor(successorNode)
        const generatedDependencyEdge = Boolean(resolvedRule.createsDependency && successorIsAnchor && previousAnchorNode)
        recordedSameParentStableEdges.add(stableEdgeKey)
        bumpCount(summary.byRelationKind, resolvedRule.relationKind)
        recordExistingRelationEdge({
          catalog,
          parentNode,
          predecessorNode,
          successorNode,
          catalogGroup,
          rule: resolvedRule,
          edgeScope: 'same_parent_edge',
          generatedDependencyEdge,
        })
      }
    }
    for (const child of parentNode.children ?? []) visit(catalog, child)
  }

  const collectCrossItemWorkflowExistingEdges = () => {
    const coverageNodes = collectCrossItemWorkflowCoverageNodes(catalogs)
    const activeConfirmedRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => (
      rule.isActive !== false
      && rule.autoApplyPolicy === 'confirmed_template_only'
    ))

    for (const workflowRule of activeConfirmedRules) {
      const predecessorRefs = coverageNodes.filter(({ node }) => (
        nodeMatchesAnyCodePrefix(node, workflowRule.predecessorCodePrefixes)
        && !nodeMatchesAnyExcludedCodePrefix(node, workflowRule.excludedPredecessorCodePrefixes)
        && !nodeMatchesAnyExactStableCode(node, workflowRule.excludedPredecessorStableCodes)
        && nodeMatchesCategoryTypes(node, workflowRule.predecessorCategoryTypes)
        && nodeMatchesDurationContributionModes(node, workflowRule.predecessorAnchorDurationContributionModes)
      ))
      const successorRefs = coverageNodes.filter(({ node }) => (
        nodeMatchesAnyCodePrefix(node, workflowRule.successorCodePrefixes)
        && !nodeMatchesAnyExcludedCodePrefix(node, workflowRule.excludedSuccessorCodePrefixes)
        && !nodeMatchesAnyExactStableCode(node, workflowRule.excludedSuccessorStableCodes)
        && nodeMatchesCategoryTypes(node, workflowRule.successorCategoryTypes)
        && nodeMatchesDurationContributionModes(node, workflowRule.successorAnchorDurationContributionModes)
      ))

      for (const successorRef of successorRefs) {
        for (const predecessorRef of predecessorRefs) {
          if (predecessorRef.node.stableCode === successorRef.node.stableCode) continue
          const relationInput: ProcessConstraintCoverageRule = {
            predecessorName: predecessorRef.node.name,
            successorName: successorRef.node.name,
            relationKind: 'explicit_task_dependency',
            createsDependency: true,
            dependencyType: workflowRule.dependencyType,
            lagDays: workflowRule.lagDays,
          }
          bumpCount(summary.byRelationKind, relationInput.relationKind)
          recordExistingRelationEdge({
            catalog: successorRef.catalog,
            parentNode: successorRef.node,
            predecessorNode: predecessorRef.node,
            successorNode: successorRef.node,
            catalogGroup: successorRef.catalogGroup,
            rule: relationInput,
            edgeScope: 'cross_scope_edge',
            generatedDependencyEdge: true,
          })
        }
      }
    }
  }

  for (const catalog of catalogs) {
    for (const node of catalog.divisions) visit(catalog, node)
  }
  collectCrossItemWorkflowExistingEdges()

  const ratio = (numerator: number, denominator: number) => denominator > 0
    ? Math.round((numerator / denominator) * 10_000) / 10_000
    : 0
  summary.selectiveCoverageRatio = ratio(summary.processConstraintMatchedEdgeCount, summary.curatedExistingRelationEdgeCount)
  summary.generatedDependencyMatchedRatio = ratio(
    summary.processConstraintMatchedGeneratedDependencyEdgeCount,
    summary.generatedDependencyEdgeCount,
  )
  summary.sameParentSelectiveCoverageRatio = ratio(
    summary.sameParentMatchedEdgeCount,
    summary.sameParentExistingRelationEdgeCount,
  )
  summary.sameParentGeneratedDependencyMatchedRatio = ratio(
    summary.sameParentMatchedGeneratedDependencyEdgeCount,
    summary.sameParentGeneratedDependencyEdgeCount,
  )
  summary.crossScopeSelectiveCoverageRatio = ratio(
    summary.crossScopeMatchedEdgeCount,
    summary.crossScopeExistingRelationEdgeCount,
  )
  summary.crossScopeGeneratedDependencyMatchedRatio = ratio(
    summary.crossScopeMatchedGeneratedDependencyEdgeCount,
    summary.crossScopeGeneratedDependencyEdgeCount,
  )

  const sortPairs = (pairs: Map<string, ProcessConstraintCoveragePair>) =>
    Array.from(pairs.values()).sort((a, b) => b.count - a.count || a.predecessorName.localeCompare(b.predecessorName))
  const sortedCrossScopeMatchedPairs = sortPairs(crossScopeMatchedPairs)
  const sortedOutOfScopeInfrastructurePairs = sortPairs(outOfScopeInfrastructurePairs)
  const representativeCrossScopeMatchedPairs = (() => {
    const result = sortedCrossScopeMatchedPairs.slice(0, limit)
    const representedRuleCodes = new Set(result.flatMap((pair) => pair.matchedRuleCodes))
    const representedPairKeys = new Set(result.map((pair) => `${pair.predecessorName} -> ${pair.successorName}`))

    for (const pair of sortedCrossScopeMatchedPairs) {
      if (pair.matchedRuleCodes.every((ruleCode) => representedRuleCodes.has(ruleCode))) continue
      const pairKey = `${pair.predecessorName} -> ${pair.successorName}`
      if (!representedPairKeys.has(pairKey)) {
        result.push(pair)
        representedPairKeys.add(pairKey)
      }
      for (const ruleCode of pair.matchedRuleCodes) representedRuleCodes.add(ruleCode)
    }

    return result
  })()
  const representativeOutOfScopeInfrastructurePairs = (() => {
    const result = sortedOutOfScopeInfrastructurePairs.slice(0, Math.min(limit, 20))
    const representedPairKeys = new Set(result.map((pair) => `${pair.predecessorName} -> ${pair.successorName}`))
    const representedPrefixes = new Set(
      result
        .flatMap((pair) => pair.exampleStableCodes)
        .map((stableCode) => L5_STANDALONE_INFRASTRUCTURE_STABLE_CODE_PREFIXES.find((prefix) => stableCode.startsWith(prefix)))
        .filter(Boolean) as string[],
    )

    for (const prefix of L5_STANDALONE_INFRASTRUCTURE_STABLE_CODE_PREFIXES) {
      if (representedPrefixes.has(prefix)) continue
      const representativePair = sortedOutOfScopeInfrastructurePairs.find((pair) => (
        pair.exampleStableCodes.some((stableCode) => stableCode.startsWith(prefix))
      ))
      if (!representativePair) continue
      const pairKey = `${representativePair.predecessorName} -> ${representativePair.successorName}`
      if (!representedPairKeys.has(pairKey)) {
        result.push(representativePair)
        representedPairKeys.add(pairKey)
      }
      representedPrefixes.add(prefix)
    }

    return result
  })()

  const generationChainReady = (
    summary.keywordFallbackMatchedEdgeCount === 0
    && summary.structuredCodeMatchedEdgeCount >= 250
    && summary.processConstraintMatchedGeneratedDependencyEdgeCount >= 300
    && summary.generatedDependencyMatchedRatio >= 0.07
    && summary.conditionalEffectMatchedEdgeCount > 0
    && summary.backValidationCandidateEligibleEdgeCount > 0
  )
  const generationChainGate = {
    status: generationChainReady ? 'process_constraint_generation_chain_ready' : 'needs_process_constraint_chain_review',
    backendOnly: true,
    checks: {
      existingRelationOnly: true,
      noKeywordFallbackRuntimeMatch: summary.keywordFallbackMatchedEdgeCount === 0,
      structuredCodeMatchedEdgeCount: summary.structuredCodeMatchedEdgeCount,
      minimumStructuredCodeMatchedEdgeCount: 250,
      matchedGeneratedDependencyEdgeCount: summary.processConstraintMatchedGeneratedDependencyEdgeCount,
      minimumMatchedGeneratedDependencyEdgeCount: 300,
      generatedDependencyMatchedRatio: summary.generatedDependencyMatchedRatio,
      minimumGeneratedDependencyMatchedRatio: 0.07,
      conditionalEffectMatchedEdgeCount: summary.conditionalEffectMatchedEdgeCount,
      backValidationCandidateEligibleEdgeCount: summary.backValidationCandidateEligibleEdgeCount,
    },
    runtimePolicy: 'process_constraint only enhances already generated edges; it never creates dependencies, never adds day values, and never blocks save, baseline confirm, monthly confirm, or progress update.',
    candidatePolicy: 'High-frequency execution-history evidence is automatically discovered, scored, grouped, and reported, but remains candidate_only until curated seed or enterprise-standard promotion.',
  }

  return {
    scope: 'process_constraint_edge_enhancement_coverage',
    backendOnly: true,
    coveragePolicy: {
      mode: 'selective_edge_enhancement_not_full_dependency_coverage',
      widthExpansionPolicy: 'expand_only_when_frequent_generated_edges_need_overlap_gate_source_routing_or_release_quantity_policy',
      noOrdinaryFrontendExposure: true,
      processConstraintRequiresExistingRelation: true,
      parallelAllowedIsExcludedBecauseItHasNoTimingEdge: true,
      unresolvedEdgesAreGovernanceCandidatesNotRuntimeBlocks: true,
      backValidationCandidatesAreCandidateOnly: true,
      keywordFallbackPairsRequireGovernanceFollowUp: true,
    },
    generationChainGate,
    summary,
    topMatchedPairs: sortPairs(matchedPairs).slice(0, Math.min(limit, 20)),
    matchedPairsByRuleCode: Object.fromEntries(
      Array.from(matchedPairsByRuleCode.entries()).map(([ruleCode, pairs]) => [
        ruleCode,
        sortPairs(pairs).slice(0, Math.min(limit, 50)),
      ]),
    ),
    topCrossScopeMatchedPairs: representativeCrossScopeMatchedPairs,
    topKeywordFallbackPairs: sortPairs(keywordFallbackPairs).slice(0, Math.min(limit, 20)),
    topBackValidationCandidatePairs: sortPairs(backValidationCandidatePairs).slice(0, Math.min(limit, 20)),
    topOutOfScopeInfrastructureEdges: representativeOutOfScopeInfrastructurePairs,
    topUnmatchedExistingRelationEdges: sortPairs(unmatchedPairs).slice(0, limit),
  }
}

function classifyL5ScenarioConstraintFamily(rule: V1474ProcessConstraintRule): L5RequiredScenarioFamily | null {
  if (L5_MEP_TESTING_COMMISSIONING_RULE_CODES.has(rule.stableCode)) return 'mep_testing_commissioning'

  switch (rule.constraintType) {
    case 'weather_window':
    case 'temperature_control_window':
      return 'seasonal_weather'
    case 'work_hour_window':
    case 'noise_sensitive_period_release':
      return 'work_hour_noise'
    case 'environment_control':
    case 'pollution_alert_release':
      return 'environmental_control'
    case 'municipal_connection_wait':
    case 'road_occupation_permit_release':
      return 'municipal_interface'
    case 'safety_control_release':
    case 'operation_permit_release':
    case 'confined_space_atmosphere_release':
    case 'temporary_power_isolation_release':
      return 'dangerous_operation_release'
    case 'monitoring_observation_wait':
      return 'monitoring_observation'
    default:
      return null
  }
}

function isStandaloneInfrastructureL5Rule(rule: V1474ProcessConstraintRule) {
  const searchableText = [
    rule.stableCode,
    ...rule.keywords,
    rule.sourceVersion,
    rule.sourceClauseRef,
  ].join(' ').toLowerCase()
  return [
    /\bbridge\b/,
    /\btunnel\b/,
    /\bairport\b/,
    /\bport\b/,
    /\brailway\b/,
    /\bhighway\b/,
    /\bexpressway\b/,
    /\brenewable energy\b/,
    /\bpower plant\b/,
    /\butility tunnel\b/,
    /桥梁|隧道|机场|港口|铁路|高速|公路主线|能源站|综合管廊/,
  ].some((pattern) => pattern.test(searchableText))
}

function countL5DependencyGeneratorRules(rules: V1474ProcessConstraintRule[]) {
  return rules.filter((rule) => (
    rule.dependencyCreationPolicy !== 'never_create_dependency'
    || rule.relationInputPolicy !== 'requires_existing_relation'
  )).length
}

function countL5DurationOwningRules(rules: V1474ProcessConstraintRule[]) {
  return rules.filter((rule) => (
    rule.durationAuthorityPolicy !== 'no_duration_values_in_process_constraint'
    || rule.durationDoubleCountPolicy !== 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing'
  )).length
}

const L5_SUPPORTED_CONDITIONAL_EFFECTS = new Set([
  'tighten_overlap_release',
  'require_project_fact_gate',
  'confidence_down',
  'candidate_only',
])

function collectL5ProcessConstraintPrecisionAudit(
  rules: V1474ProcessConstraintRule[],
  matchedRuleCodes: Record<string, number>,
) {
  const activeRules = rules.filter((rule) => rule.isActive !== false)
  const matchedRules = activeRules.filter((rule) => Number(matchedRuleCodes[rule.stableCode] ?? 0) > 0)
  const ruleHasDurationLookupRoute = (rule: V1474ProcessConstraintRule) => (
    rule.durationLookupPolicy === 'route_to_standard_work_duration_seed'
    && Array.isArray(rule.durationLookupKeys)
    && rule.durationLookupKeys.length > 0
  )
  const ruleNeedsQuantityEvidence = (rule: V1474ProcessConstraintRule) => (
    rule.applicationMode === 'edge_overlap'
    || rule.releaseQuantityPolicy !== 'not_applicable'
    || rule.quantityEvidenceRequirement !== 'not_applicable'
  )
  const ruleHasQuantityEvidenceChecklist = (rule: V1474ProcessConstraintRule) => (
    !ruleNeedsQuantityEvidence(rule)
    || (Array.isArray(rule.quantityReleaseEvidenceChecklist) && rule.quantityReleaseEvidenceChecklist.length > 0)
  )
  const hasEdgeOverlapReleaseQuantityIssue = (rule: V1474ProcessConstraintRule) => (
    rule.applicationMode === 'edge_overlap'
    && (
      rule.releaseQuantityPolicy === 'not_applicable'
      || !(Number(rule.minReleaseQuantityPercent) > 0)
      || !Array.isArray(rule.quantitySourcePriority)
      || rule.quantitySourcePriority.length === 0
      || rule.quantityEvidenceRequirement === 'not_applicable'
      || rule.quantityProxyRiskLevel === 'not_applicable'
      || !ruleHasQuantityEvidenceChecklist(rule)
    )
  )
  const hasGateOrConfidenceQuantityOwnershipIssue = (rule: V1474ProcessConstraintRule) => (
    rule.applicationMode !== 'edge_overlap'
    && (
      rule.releaseQuantityPolicy !== 'not_applicable'
      || (Array.isArray(rule.quantitySourcePriority) && rule.quantitySourcePriority.length > 0)
      || rule.quantityEvidenceRequirement !== 'not_applicable'
      || (Array.isArray(rule.quantityReleaseEvidenceChecklist) && rule.quantityReleaseEvidenceChecklist.length > 0)
      || rule.quantityProxyRiskLevel !== 'not_applicable'
    )
  )
  const hasUnsupportedConditionalEffect = (rule: V1474ProcessConstraintRule) => (
    (rule.conditionalEffects ?? []).some((effect) => !L5_SUPPORTED_CONDITIONAL_EFFECTS.has(effect.effect))
  )

  const missingTimeSourcePolicyRules = activeRules.filter((rule) => !rule.timeSourcePolicy)
  const missingDurationLookupRouteRules = activeRules.filter((rule) => !ruleHasDurationLookupRoute(rule))
  const missingQuantityEvidenceChecklistRules = activeRules.filter((rule) => !ruleHasQuantityEvidenceChecklist(rule))
  const edgeOverlapReleaseQuantityIssueRules = activeRules.filter(hasEdgeOverlapReleaseQuantityIssue)
  const gateOrConfidenceQuantityOwnershipIssueRules = activeRules.filter(hasGateOrConfidenceQuantityOwnershipIssue)
  const dependencyOwnershipIssueRules = activeRules.filter((rule) => (
    rule.dependencyCreationPolicy !== 'never_create_dependency'
    || rule.relationInputPolicy !== 'requires_existing_relation'
  ))
  const durationOwnershipIssueRules = activeRules.filter((rule) => (
    rule.durationAuthorityPolicy !== 'no_duration_values_in_process_constraint'
    || rule.durationDoubleCountPolicy !== 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing'
  ))
  const unsupportedConditionalEffectRules = activeRules.filter(hasUnsupportedConditionalEffect)
  const issueRuleCodes = new Set([
    ...missingTimeSourcePolicyRules,
    ...missingDurationLookupRouteRules,
    ...missingQuantityEvidenceChecklistRules,
    ...edgeOverlapReleaseQuantityIssueRules,
    ...gateOrConfidenceQuantityOwnershipIssueRules,
    ...dependencyOwnershipIssueRules,
    ...durationOwnershipIssueRules,
    ...unsupportedConditionalEffectRules,
  ].map((rule) => rule.stableCode))
  const blockingIssueCount = issueRuleCodes.size
  const ready = blockingIssueCount === 0

  return {
    status: ready ? 'l5_process_constraint_precision_ready' : 'l5_process_constraint_precision_needs_review',
    auditScope: 'l5_process_constraint_parameter_precision_and_ownership',
    backendOnly: true,
    activeRuleCount: activeRules.length,
    matchedRuleCount: matchedRules.length,
    edgeOverlapRuleCount: activeRules.filter((rule) => rule.applicationMode === 'edge_overlap').length,
    gateOrConfidenceRuleCount: activeRules.filter((rule) => rule.applicationMode !== 'edge_overlap').length,
    blockingIssueCount,
    missingTimeSourcePolicyCount: missingTimeSourcePolicyRules.length,
    missingDurationLookupRouteCount: missingDurationLookupRouteRules.length,
    missingQuantityEvidenceChecklistCount: missingQuantityEvidenceChecklistRules.length,
    edgeOverlapReleaseQuantityIssueCount: edgeOverlapReleaseQuantityIssueRules.length,
    gateOrConfidenceQuantityOwnershipIssueCount: gateOrConfidenceQuantityOwnershipIssueRules.length,
    dependencyOwnershipIssueCount: dependencyOwnershipIssueRules.length,
    durationOwnershipIssueCount: durationOwnershipIssueRules.length,
    unsupportedConditionalEffectCount: unsupportedConditionalEffectRules.length,
    issueRuleCodes: Array.from(issueRuleCodes).sort(),
    matchedRuleCodes: matchedRules.map((rule) => rule.stableCode).sort(),
    ready,
    releaseQuantityPolicy: 'Only edge_overlap rules may carry release quantity thresholds; gate_wait and confidence_only rules must route facts or confidence without owning quantity release.',
    durationAuthorityPolicy: 'process_constraint must route to standard_work_duration or acceptance/project facts for time values and must not store lag, wait, or duration day values.',
    dependencyAuthorityPolicy: 'process_constraint requires an existing relation and must never create task dependencies.',
  }
}

function collectL5ScenarioConstraintAudit(
  processConstraintCoverage: ReturnType<typeof collectProcessConstraintCoverage>,
) {
  const activeRules = V1474_PROCESS_CONSTRAINT_SEED.filter((rule) => rule.isActive !== false)
  const activeScenarioRules = activeRules.filter((rule) => L5_SCENARIO_CONSTRAINT_TYPES.has(rule.constraintType))
  const edgeEnhancerRules = activeRules.filter((rule) => classifyL5ScenarioConstraintFamily(rule) !== null)
  const rulesByFamily = new Map<L5RequiredScenarioFamily, V1474ProcessConstraintRule[]>()
  const matchedRuleCodes = processConstraintCoverage.summary.byMatchedRuleCode
  const l5ProcessConstraintPrecisionAudit = collectL5ProcessConstraintPrecisionAudit(activeRules, matchedRuleCodes)

  for (const rule of edgeEnhancerRules) {
    const family = classifyL5ScenarioConstraintFamily(rule)
    if (!family) continue
    const rules = rulesByFamily.get(family) ?? []
    rules.push(rule)
    rulesByFamily.set(family, rules)
  }

  const ratio = (numerator: number, denominator: number) => denominator > 0
    ? Math.round((numerator / denominator) * 10_000) / 10_000
    : 0

  const familyCoverage = L5_REQUIRED_SCENARIO_FAMILIES.map((family) => {
    const rules = rulesByFamily.get(family) ?? []
    const matchedRules = rules.filter((rule) => Number(matchedRuleCodes[rule.stableCode] ?? 0) > 0)
    return {
      family,
      ruleCount: rules.length,
      matchedRuleCount: matchedRules.length,
      matchedEdgeCount: rules.reduce((total, rule) => total + Number(matchedRuleCodes[rule.stableCode] ?? 0), 0),
      constraintTypes: Array.from(new Set(rules.map((rule) => rule.constraintType))).sort(),
      dependencyGeneratorRuleCount: countL5DependencyGeneratorRules(rules),
      durationOwningRuleCount: countL5DurationOwningRules(rules),
      conditionalRuleCount: rules.filter((rule) => (rule.conditionalEffects?.length ?? 0) > 0).length,
      ruleCodes: rules.map((rule) => rule.stableCode).sort(),
      sampleRuleCodes: rules.map((rule) => rule.stableCode).sort().slice(0, 10),
    }
  })
  const requiredFamiliesMissing = familyCoverage
    .filter((item) => item.ruleCount === 0)
    .map((item) => item.family)
  const dependencyGeneratorRuleCount = countL5DependencyGeneratorRules(edgeEnhancerRules)
  const durationOwningRuleCount = countL5DurationOwningRules(edgeEnhancerRules)
  const edgeEnhancementReady = (
    requiredFamiliesMissing.length === 0
    && dependencyGeneratorRuleCount === 0
    && durationOwningRuleCount === 0
    && processConstraintCoverage.summary.keywordFallbackMatchedEdgeCount === 0
    && processConstraintCoverage.summary.unmatchedExistingRelationEdgeCount === 0
  )

  return {
    status: 'l5_scenario_constraints_are_edge_enhancers_not_dependency_generators',
    auditScope: 'building_project_l5_scenario_family_coverage_and_boundary',
    backendOnly: true,
    scopeBoundary: 'building project scope only: building works, site works, and building-delivery municipal interface constraints are in scope; standalone infrastructure mainlines are explicit out-of-scope boundaries.',
    scenarioRuleCount: activeScenarioRules.length,
    scenarioConstraintTypeCount: new Set(activeScenarioRules.map((rule) => rule.constraintType)).size,
    conditionalRuleCoverageRatio: ratio(
      activeScenarioRules.filter((rule) => (rule.conditionalEffects?.length ?? 0) > 0).length,
      activeScenarioRules.length,
    ),
    edgeEnhancerRuleCount: edgeEnhancerRules.length,
    edgeEnhancerMatchedRuleCount: edgeEnhancerRules
      .filter((rule) => Number(matchedRuleCodes[rule.stableCode] ?? 0) > 0).length,
    edgeEnhancerMatchedEdgeCount: edgeEnhancerRules
      .reduce((total, rule) => total + Number(matchedRuleCodes[rule.stableCode] ?? 0), 0),
    dependencyGeneratorRuleCount,
    durationOwningRuleCount,
    nonBuildingInfrastructureRuleCount: edgeEnhancerRules.filter(isStandaloneInfrastructureL5Rule).length,
    familyCoverage,
    requiredFamiliesMissing,
    l5ProcessConstraintPrecisionAudit,
    edgeEnhancementReadiness: {
      status: edgeEnhancementReady
        ? 'l5_edge_enhancement_ready_without_dependency_or_duration_ownership'
        : 'l5_edge_enhancement_needs_governance_review',
      backendOnly: true,
      ready: edgeEnhancementReady,
      scenarioFamilyMissingCount: requiredFamiliesMissing.length,
      requiredFamiliesMissing,
      unmatchedExistingRelationEdgeCount: processConstraintCoverage.summary.unmatchedExistingRelationEdgeCount,
      keywordFallbackMatchedEdgeCount: processConstraintCoverage.summary.keywordFallbackMatchedEdgeCount,
      dependencyGeneratorRuleCount,
      durationOwningRuleCount,
      disposition: edgeEnhancementReady
        ? 'L5 is ready as an edge enhancer: it has matched scenario families, no keyword-fallback matches, no unmatched existing relation edge backlog, and no dependency or duration ownership.'
        : 'L5 remains a governance queue until scenario-family gaps, keyword fallback matches, unmatched existing edges, dependency creation, or duration ownership violations are closed.',
    },
    outOfScopeDomains: [
      'road_bridge_tunnel_mainline',
      'railway_airport_port_energy_mainline',
      'standalone_municipal_infrastructure_network',
    ],
    runtimePolicy: 'L5 process constraints enhance an existing edge only; relationInputPolicy must require an existing edge and dependencyCreationPolicy must never create task dependencies.',
    durationPolicy: 'L5 process constraints carry release, confidence, overlap, and source-routing semantics only; standard work duration or acceptance facts own day values, and process_constraint stores no day values.',
    promotionPolicy: 'Add or harden L5 families only for building-project delivery scenarios with seed evidence, runtime edge matches, and replay calibration; do not expand coverage into non-building infrastructure domains.',
  }
}

function mergeDependencyIntentSummary(
  target: V1475DependencyIntentResolutionSummary,
  source: V1475DependencyIntentResolutionSummary,
) {
  target.acceptedCount += source.acceptedCount
  target.rejectedCount += source.rejectedCount
  target.acceptedRuntimeEligibleCount += source.acceptedRuntimeEligibleCount
  target.acceptedCandidateOnlyCount += source.acceptedCandidateOnlyCount
  target.acceptedManualConfirmCount += source.acceptedManualConfirmCount
  target.rejectedPhysicalMainlineCount += source.rejectedPhysicalMainlineCount
  target.rejectedMissingSourceCodeCount += source.rejectedMissingSourceCodeCount
  target.rejectedMissingReferenceCodeCount += source.rejectedMissingReferenceCodeCount
  target.rejectedRelationRoleFallbackCount += source.rejectedRelationRoleFallbackCount
  target.confidenceScoreTotal += source.confidenceScoreTotal

  for (const [field, bucket] of Object.entries(source.byReferenceField)) {
    const current = target.byReferenceField[field] ?? { accepted: 0, rejected: 0 }
    current.accepted += bucket.accepted
    current.rejected += bucket.rejected
    target.byReferenceField[field] = current
  }
  for (const [key, count] of Object.entries(source.byAuditReasonCode)) {
    target.byAuditReasonCode[key] = (target.byAuditReasonCode[key] ?? 0) + count
  }
  for (const level of ['high', 'medium', 'low'] as const) {
    target.byConfidenceLevel[level] += source.byConfidenceLevel[level]
  }
}

function emptyDependencyIntentCoverageSummary(): V1475DependencyIntentResolutionSummary {
  return {
    acceptedCount: 0,
    rejectedCount: 0,
    acceptedRuntimeEligibleCount: 0,
    acceptedCandidateOnlyCount: 0,
    acceptedManualConfirmCount: 0,
    rejectedPhysicalMainlineCount: 0,
    rejectedMissingSourceCodeCount: 0,
    rejectedMissingReferenceCodeCount: 0,
    rejectedRelationRoleFallbackCount: 0,
    confidenceScoreTotal: 0,
    confidenceScoreAverage: 0,
    byReferenceField: {},
    byAuditReasonCode: {},
    byConfidenceLevel: { high: 0, medium: 0, low: 0 },
  }
}

function hasDependencyIntentReference(metadata: Record<string, unknown>) {
  return DEPENDENCY_INTENT_REFERENCE_FIELDS.some((referenceField) => (
    readDependencyIntentReferenceCodes(metadata, referenceField).length > 0
  ))
}

function getDependencyIntentReferenceFieldForGroup(group: WbsTemplateCatalogGroup) {
  return DEPENDENCY_INTENT_REFERENCE_FIELDS.find((item) => item.group === group)?.field
}

function isExplicitBusinessGateAuditRecord(item: V1475DependencyIntentAuditRecord) {
  return item.sourceSeedRuleIds.includes(V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID)
    || item.auditTrace.includes('explicitBusinessGateTemplate=true')
}

function getExplicitBusinessGateTemplateCode(item: V1475DependencyIntentAuditRecord) {
  if (!isExplicitBusinessGateAuditRecord(item)) return null
  const trace = item.auditTrace.find((entry) => entry.startsWith('explicitBusinessGateTemplateCode='))
  return normalizeText(trace?.split('=')[1]) || null
}

type AcceptanceTimelineL4Endpoint = {
  catalogGroup: WbsTemplateCatalogGroup
  referencedCode: string
}

const ACCEPTANCE_TIMELINE_L4_CLOSEOUT_ENDPOINTS: Record<string, AcceptanceTimelineL4Endpoint> = {
  archive_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-ARCHIVE-ACCEPTANCE',
  },
  comprehensive_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-COMPREHENSIVE-ACCEPTANCE',
  },
  completion_filing: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-COMPLETION-FILING',
  },
  completion_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-COMPLETION-ACCEPTANCE',
  },
  delivery_filing: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-DELIVERY-FILING',
  },
  delivery_handover: {
    catalogGroup: 'project_milestone',
    // AcceptanceTimeline uses delivery_handover; L4 release templates model the same closeout gate as owner delivery.
    referencedCode: 'MS-OWNER-DELIVERY',
  },
  occupancy_use_release: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-OCCUPANCY-USE',
  },
  opening_release: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-OPENING-RELEASE',
  },
  household_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-HOUSEHOLD-ACCEPTANCE',
  },
  civil_defense_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-CIVIL-DEFENSE-ACCEPTANCE',
  },
  energy_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-ENERGY-ACCEPTANCE',
  },
  environment_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-ENVIRONMENTAL-ACCEPTANCE',
  },
  elevator_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-ELEVATOR-AUTHORITY-INSPECTION',
  },
  gas_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-GAS-ACCEPTANCE',
  },
  lightning_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-LIGHTNING-PROTECTION-ACCEPTANCE',
  },
  property_handover_inspection: {
    catalogGroup: 'site_management',
    referencedCode: 'SM-PROPERTY-TAKEOVER-INSPECTION',
  },
  quality_supervision_report: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-QUALITY-SUPERVISION-REPORT',
  },
  public_assembly_fire_safety_check: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-PUBLIC-ASSEMBLY-FIRE-SAFETY-CHECK',
  },
  sanitation_facility_acceptance: {
    catalogGroup: 'project_milestone',
    referencedCode: 'MS-SANITATION-FACILITY-ACCEPTANCE',
  },
}

function collectAcceptanceTimelineExplicitBusinessGateObservations() {
  const observedTemplateCodes = new Set<string>()
  const observedDependencyCodes = new Set<string>()
  const observations: Array<{
    dependencyCode: string
    sourceItemCode: string
    targetItemCode: string
    dependencyKind: string
    templateCode: string
    fromCatalogGroup: WbsTemplateCatalogGroup
    fromReferencedCode: string
    toCatalogGroup: WbsTemplateCatalogGroup
    toReferencedCode: string
    relationRole: V1475DependencyRelationRole
    matchedReferenceField: string
  }> = []

  const relationRole: V1475DependencyRelationRole = 'handover'

  for (const dependency of ACCEPTANCE_TIMELINE_TEMPLATE_SEED.dependencies) {
    const source = ACCEPTANCE_TIMELINE_L4_CLOSEOUT_ENDPOINTS[dependency.sourceItemCode]
    const target = ACCEPTANCE_TIMELINE_L4_CLOSEOUT_ENDPOINTS[dependency.targetItemCode]
    if (!source || !target) continue

    const referenceField = getDependencyIntentReferenceFieldForGroup(target.catalogGroup)
    if (!referenceField) continue

    const resolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup: source.catalogGroup,
      fromReferencedCode: source.referencedCode,
      metadata: {
        relationRole,
        dependencyIntentReason: dependency.reason,
        [referenceField]: [target.referencedCode],
      },
    })

    for (const item of resolution.audit) {
      if (item.decision !== 'accepted' || item.autoApplyPolicy !== 'confirmed_template_only') continue
      const templateCode = getExplicitBusinessGateTemplateCode(item)
      if (!templateCode) continue

      observedTemplateCodes.add(templateCode)
      observedDependencyCodes.add(dependency.dependencyCode)
      observations.push({
        dependencyCode: dependency.dependencyCode,
        sourceItemCode: dependency.sourceItemCode,
        targetItemCode: dependency.targetItemCode,
        dependencyKind: dependency.dependencyKind,
        templateCode,
        fromCatalogGroup: item.fromCatalogGroup,
        fromReferencedCode: item.fromReferencedCode,
        toCatalogGroup: item.referenceGroup,
        toReferencedCode: item.toReferencedCode,
        relationRole: item.relationRole,
        matchedReferenceField: item.matchedReferenceField,
      })
    }
  }

  observations.sort((a, b) => (
    a.dependencyCode.localeCompare(b.dependencyCode)
    || a.templateCode.localeCompare(b.templateCode)
  ))

  return {
    observedCount: observations.length,
    observedTemplateCount: observedTemplateCodes.size,
    observedTemplateCodes: Array.from(observedTemplateCodes).sort(),
    observedDependencyCodes: Array.from(observedDependencyCodes).sort(),
    observations,
  }
}

const HIGH_PRIORITY_DORMANT_L4_STATUTORY_COMPLETION_GATE_CODES = new Set([
  'quality_supervision_report_to_completion_filing',
  'completion_filing_to_occupancy_use_release',
  'completion_filing_to_delivery_filing_release',
  'completion_filing_to_owner_delivery_release',
  'delivery_filing_to_owner_delivery_release',
  'completion_acceptance_to_owner_delivery_release',
  'completion_acceptance_to_occupancy_use_release',
  'public_assembly_fire_safety_check_to_opening_release',
  'sanitation_facility_acceptance_to_delivery_filing_release',
  'archive_acceptance_to_completion_filing_release',
  'comprehensive_acceptance_to_completion_filing_release',
  'property_handover_inspection_to_delivery_filing_release',
  'household_acceptance_to_delivery_filing_release',
])

function buildDormantExplicitBusinessGateQueueItem(
  template: typeof V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES[number],
) {
  const highPriority = HIGH_PRIORITY_DORMANT_L4_STATUTORY_COMPLETION_GATE_CODES.has(template.templateCode)
  return {
    templateCode: template.templateCode,
    fromCatalogGroup: template.fromCatalogGroup,
    sampleFromReferencedCode: template.sampleFromReferencedCode,
    toCatalogGroup: template.toCatalogGroup,
    sampleToReferencedCode: template.sampleToReferencedCode,
    relationRoles: template.relationRoles,
    dependencyType: template.dependencyType,
    lagDays: template.lagDays,
    scopeRule: template.scopeRule,
    priority: highPriority ? 'high' : 'normal',
    reasonCode: 'verified_explicit_gate_template_without_runtime_metadata_reference_pair',
    backendOnly: true,
    runtimeEligible: false,
    replayEvidenceRequired: [
      'catalog_runtime_metadata_reference_pair',
      'acceptance_or_approval_records',
      'project_task_dependency_overrides',
      'actual_start_finish_history',
      'scope_fact_compatibility',
      'user_deleted_or_edited_generated_dependencies',
    ],
    promotionPolicy: 'Keep verified-but-unobserved L4 templates in backend governance until runtime catalog metadata pairs, project replay evidence, manual seed review, and conflict checks justify explicit runtime observation.',
    blockingPolicy: 'Do not block ordinary task save, progress update, baseline confirmation, monthly-plan confirmation, or schedule generation while the explicit gate template remains dormant.',
  }
}

const HIGH_PRIORITY_DORMANT_L4_DIRECT_EVIDENCE_GAPS: Record<string, {
  unsupportedNearbyEvidence: string[]
  requiredDirectEvidence: string[]
}> = {
  completion_acceptance_to_occupancy_use_release: {
    unsupportedNearbyEvidence: [
      'AcceptanceTimeline rows from completion_acceptance currently target planning_acceptance or fire_acceptance, not occupancy/use release.',
      'Runtime milestone metadata already observes fire_acceptance or completion_filing to occupancy release, but not completion_acceptance directly to occupancy release.',
    ],
    requiredDirectEvidence: [
      'runtime_catalog_metadata_reference_pair',
      'acceptance_timeline_direct_dependency_row',
      'project_replay_acceptance_or_occupancy_release_record',
    ],
  },
  completion_acceptance_to_owner_delivery_release: {
    unsupportedNearbyEvidence: [
      'AcceptanceTimeline observation for owner delivery comes from completion_filing or delivery_filing to delivery_handover, not completion_acceptance to owner delivery.',
      'Project milestone delivery-handover metadata references household acceptance and completion filing, not completion acceptance as a direct owner-delivery release.',
    ],
    requiredDirectEvidence: [
      'runtime_catalog_metadata_reference_pair',
      'acceptance_timeline_direct_dependency_row',
      'project_replay_acceptance_or_owner_delivery_record',
    ],
  },
  public_assembly_fire_safety_check_to_opening_release: {
    unsupportedNearbyEvidence: [
      'AcceptanceTimeline has public_assembly_fire_safety_check to delivery_filing; the target is not opening_release.',
      'Template parser cases prove the L4 template can resolve a provided reference pair, but parser capability is not runtime or seed-level observation evidence.',
    ],
    requiredDirectEvidence: [
      'runtime_catalog_metadata_reference_pair',
      'acceptance_timeline_direct_dependency_row',
      'project_replay_fire_safety_or_opening_release_record',
    ],
  },
}

function buildHighPriorityDormantEvidenceGapAudit(
  highPriorityDormantTemplateQueue: ReturnType<typeof buildDormantExplicitBusinessGateQueueItem>[],
) {
  const evidenceGapItems = highPriorityDormantTemplateQueue.map((item) => {
    const gap = HIGH_PRIORITY_DORMANT_L4_DIRECT_EVIDENCE_GAPS[item.templateCode] ?? {
      unsupportedNearbyEvidence: [
        'No direct runtime metadata reference pair or AcceptanceTimeline dependency row has observed this template yet.',
      ],
      requiredDirectEvidence: [
        'runtime_catalog_metadata_reference_pair',
        'acceptance_timeline_direct_dependency_row',
        'project_replay_acceptance_or_delivery_record',
      ],
    }

    return {
      templateCode: item.templateCode,
      fromCatalogGroup: item.fromCatalogGroup,
      sampleFromReferencedCode: item.sampleFromReferencedCode,
      toCatalogGroup: item.toCatalogGroup,
      sampleToReferencedCode: item.sampleToReferencedCode,
      directEvidenceStatus: 'missing_direct_runtime_or_acceptance_timeline_reference_pair',
      blockedObservation: true,
      unsupportedNearbyEvidence: gap.unsupportedNearbyEvidence,
      requiredDirectEvidence: gap.requiredDirectEvidence,
      policy: 'Do not mark this L4 gate observed from template definitions, parser cases, inverse/nearby closeout rows, or chained filing-release evidence.',
    }
  })

  return {
    status: 'high_priority_l4_dormant_direct_evidence_gap_visible',
    backendOnly: true,
    directEvidenceRequired: true,
    gapCount: evidenceGapItems.length,
    blockedObservationTemplateCodes: evidenceGapItems.map((item) => item.templateCode).sort(),
    evidenceGapItems,
    promotionPolicy: 'Move a high-priority dormant L4 gate into observed coverage only after a direct runtime metadata reference pair, an AcceptanceTimeline direct dependency row, or project replay records prove the same from/to business gate.',
  }
}

function collectExplicitBusinessGateTemplateAudit(observedTemplateCodes: string[] = []) {
  const missingTemplates: string[] = []
  let verifiedTemplateCount = 0
  let hardNonZeroLagTemplateCount = 0
  const observedTemplateCodeSet = new Set(observedTemplateCodes)
  const dormantTemplates: typeof V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES = []

  for (const template of V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES) {
    const referenceField = getDependencyIntentReferenceFieldForGroup(template.toCatalogGroup)
    if (!referenceField) {
      missingTemplates.push(template.templateCode)
      continue
    }

    const resolution = inspectV1475DependencyIntentTemplates({
      fromCatalogGroup: template.fromCatalogGroup,
      fromReferencedCode: template.sampleFromReferencedCode,
      metadata: {
        relationRole: template.relationRoles[0],
        [referenceField]: [template.sampleToReferencedCode],
      },
    })
    const intent = resolution.intents.find((candidate) => (
      candidate.toCatalogGroup === template.toCatalogGroup
      && candidate.toReferencedCode === template.sampleToReferencedCode
      && candidate.sourceSeedRuleIds.includes(V1475_EXPLICIT_BUSINESS_GATE_SOURCE_ID)
    ))

    if (!intent) {
      missingTemplates.push(template.templateCode)
      continue
    }

    verifiedTemplateCount += 1
    if (
      intent.strength === 'hard'
      && intent.autoApplyPolicy === 'confirmed_template_only'
      && Number(intent.lagDays ?? 0) > 0
      && intent.conflictPolicy === 'explicit_dependency_wins'
    ) {
      hardNonZeroLagTemplateCount += 1
    }

    if (!observedTemplateCodeSet.has(template.templateCode)) {
      dormantTemplates.push(template)
    }
  }

  const dormantTemplateQueue = dormantTemplates.map(buildDormantExplicitBusinessGateQueueItem)
  const highPriorityDormantTemplateQueue = dormantTemplateQueue.filter((item) => item.priority === 'high')
  const highPriorityDormantEvidenceGapAudit = buildHighPriorityDormantEvidenceGapAudit(highPriorityDormantTemplateQueue)

  return {
    templateCount: V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES.length,
    verifiedTemplateCount,
    hardNonZeroLagTemplateCount,
    missingTemplateCount: missingTemplates.length,
    missingTemplates,
    dormantTemplateCount: dormantTemplates.length,
    dormantTemplateCodes: dormantTemplates.map((template) => template.templateCode).sort(),
    dormantTemplateQueue,
    highPriorityDormantTemplateQueue,
    highPriorityDormantEvidenceGapAudit,
    dormantTemplatePolicy: 'Verified-but-unobserved explicit L4 business gates are backend governance backlog only; they do not count as runtime coverage until real catalog metadata reference pairs and replay evidence observe the template.',
  }
}

function buildL3LagCalibrationSample(rule: V1475CrossItemWorkflowRule) {
  return {
    stableCode: rule.stableCode,
    predecessorCodePrefixes: rule.predecessorCodePrefixes,
    successorCodePrefixes: rule.successorCodePrefixes,
    dependencyType: rule.dependencyType,
    lagDays: rule.lagDays,
    strength: rule.strength,
    autoApplyPolicy: rule.autoApplyPolicy,
    scopeRule: rule.scopeRule,
    handoffCategory: rule.handoffCategory ?? null,
    confidence: rule.confidence,
    sourceStandard: rule.sourceStandard,
    sourceVersion: rule.sourceVersion,
    evidenceSourceKeys: rule.evidenceSourceKeys,
    lagCalibrationPolicy: 'Treat L3 package handoff lag and strength as seed defaults only; calibrate through project replay, acceptance or handover records, actual start/finish history, duration seed resolution, and manual seed review before promotion.',
  }
}

const L3_CANDIDATE_MANUAL_GOVERNANCE_REASONS: Partial<Record<V1475CrossItemWorkflowHandoffCategory, string>> = {
  hotel_factory_unit: 'Hotel and factory-unit candidate/manual-confirm handoffs depend on project facts such as operator takeover windows, brand mockup approval, trial-operation scope, and room-system validation evidence.',
  data_center_cleanroom: 'Data-center and cleanroom candidate/manual-confirm handoffs depend on project facts such as validation plans, commissioning scope, cleanliness grade, third-party acceptance, and integrated system test evidence.',
  outdoor_municipal: 'Outdoor and municipal candidate/manual-confirm handoffs depend on project facts such as school or campus calendar windows, phased opening scope, municipal access, weather, and authority release evidence.',
  prefab_modular: 'Prefab and modular candidate/manual-confirm handoffs depend on project facts such as factory release, transport receiving, laydown readiness, hoist access, component traceability, and site approval evidence.',
  renovation_tod: 'Renovation, heritage, and TOD candidate/manual-confirm handoffs depend on project facts such as protection scope, operator or station interface approval, transfer windows, and site governance evidence.',
  mixed_use_interface: 'Mixed-use interface candidate/manual-confirm handoffs depend on project facts such as podium/tower interface release, shared-system acceptance, station or operator approval, and phased scope evidence.',
}

function isL3CandidateOrManualConfirmGoverned(rule: V1475CrossItemWorkflowRule) {
  return rule.strength === 'candidate' || rule.autoApplyPolicy === 'manual_confirm'
}

function isL3RuntimeDefaultEligible(rule: V1475CrossItemWorkflowRule) {
  return rule.autoApplyPolicy === 'confirmed_template_only' && rule.strength !== 'candidate'
}

function getL3CandidateManualGovernanceReason(category: V1475CrossItemWorkflowHandoffCategory) {
  return L3_CANDIDATE_MANUAL_GOVERNANCE_REASONS[category]
    ?? 'Candidate/manual-confirm L3 handoffs require project facts, scope fit, acceptance or handover evidence, and governance approval before promotion.'
}

function collectL3CandidateManualConfirmFamilyAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const totalByCategory = new Map<V1475CrossItemWorkflowHandoffCategory, number>()
  for (const rule of activeCrossItemRules) {
    if (!rule.handoffCategory) continue
    totalByCategory.set(rule.handoffCategory, (totalByCategory.get(rule.handoffCategory) ?? 0) + 1)
  }

  const familyStatsByCategory = new Map<V1475CrossItemWorkflowHandoffCategory, {
    handoffCategory: V1475CrossItemWorkflowHandoffCategory
    totalRuleCount: number
    governedRuleCount: number
    manualConfirmRuleCount: number
    candidateRuleCount: number
    runtimeEligibleRuleCount: number
    sampleStableCodes: string[]
  }>()

  for (const rule of activeCrossItemRules) {
    if (!rule.handoffCategory || !isL3CandidateOrManualConfirmGoverned(rule)) continue

    const existing = familyStatsByCategory.get(rule.handoffCategory) ?? {
      handoffCategory: rule.handoffCategory,
      totalRuleCount: totalByCategory.get(rule.handoffCategory) ?? 0,
      governedRuleCount: 0,
      manualConfirmRuleCount: 0,
      candidateRuleCount: 0,
      runtimeEligibleRuleCount: 0,
      sampleStableCodes: [],
    }

    existing.governedRuleCount += 1
    existing.manualConfirmRuleCount += Number(rule.autoApplyPolicy === 'manual_confirm')
    existing.candidateRuleCount += Number(rule.strength === 'candidate')
    existing.runtimeEligibleRuleCount += Number(isL3RuntimeDefaultEligible(rule))
    if (existing.sampleStableCodes.length < 5) existing.sampleStableCodes.push(rule.stableCode)
    familyStatsByCategory.set(rule.handoffCategory, existing)
  }

  const families = Array.from(familyStatsByCategory.values())
    .map((family) => ({
      handoffCategory: family.handoffCategory,
      totalRuleCount: family.totalRuleCount,
      governedRuleCount: family.governedRuleCount,
      manualConfirmRuleCount: family.manualConfirmRuleCount,
      candidateRuleCount: family.candidateRuleCount,
      candidateManualRatio: family.totalRuleCount > 0
        ? Number((family.governedRuleCount / family.totalRuleCount).toFixed(4))
        : 0,
      runtimeEligibleRuleCount: family.runtimeEligibleRuleCount,
      sampleStableCodes: family.sampleStableCodes,
      governanceReason: getL3CandidateManualGovernanceReason(family.handoffCategory),
      promotionPolicy: 'Promote candidate/manual-confirm L3 handoffs only after replay evidence, explicit project-fact approval, manual governance review, acceptance or handover evidence refs, and confirmed-template validation prove the dependency is stable for runtime use.',
    }))
    .sort((a, b) => {
      if (a.candidateManualRatio !== b.candidateManualRatio) return b.candidateManualRatio - a.candidateManualRatio
      if (a.governedRuleCount !== b.governedRuleCount) return b.governedRuleCount - a.governedRuleCount
      if (a.manualConfirmRuleCount !== b.manualConfirmRuleCount) return b.manualConfirmRuleCount - a.manualConfirmRuleCount
      if (a.candidateRuleCount !== b.candidateRuleCount) return b.candidateRuleCount - a.candidateRuleCount
      return a.handoffCategory.localeCompare(b.handoffCategory)
    })

  return {
    auditScope: 'l3_candidate_manual_confirm_project_fact_governance',
    status: 'candidate_manual_confirm_requires_project_fact_governance',
    backendOnly: true,
    candidateAndManualConfirmAreRuntimeBlocked: true,
    familyCount: families.length,
    governedRuleCount: families.reduce((total, family) => total + family.governedRuleCount, 0),
    manualConfirmRuleCount: families.reduce((total, family) => total + family.manualConfirmRuleCount, 0),
    candidateRuleCount: families.reduce((total, family) => total + family.candidateRuleCount, 0),
    runtimeEligibleRuleCount: families.reduce((total, family) => total + family.runtimeEligibleRuleCount, 0),
    families,
    governanceReason: 'Remaining L3 candidate/manual-confirm handoffs stay as building-engineering project-fact governance queues because operator windows, validation plans, school calendars, municipal releases, prefab logistics, and scope-specific handovers vary by project.',
    promotionPolicy: 'Do not harden these families for ratio improvement alone; require replay evidence, explicit project-fact approval, manual approval, evidence refs, and confirmed-template validation before promotion.',
    blockingPolicy: 'Candidate/manual-confirm L3 rules must not generate runtime dependencies, critical-path blockers, baseline blockers, or monthly-plan blockers until governance promotes them to confirmed-template rules.',
  }
}

const L3_BUSINESS_GATE_BOUNDARY_SIGNAL_PATTERN = /special[_\s-]?acceptance|term[_\s-]?handover|trial[_\s-]?production|operation[_\s-]?interface|commercial[_\s-]?operation|owner[_\s-]?delivery|delivery[_\s-]?filing|occupancy|operation[_\s-]?takeover/i

function isL3PackageLevelRule(rule: V1475CrossItemWorkflowRule) {
  return ![
    ...(rule.predecessorCategoryTypes ?? []),
    ...(rule.successorCategoryTypes ?? []),
  ].includes('process')
}

function hasL3BusinessGateBoundarySignal(rule: V1475CrossItemWorkflowRule) {
  const codeAndSuccessors = [
    rule.stableCode,
    ...rule.successorCodePrefixes,
  ].join(' ')

  return rule.successorCodePrefixes.some((prefix) => /^(QR|MS)-/i.test(prefix))
    || L3_BUSINESS_GATE_BOUNDARY_SIGNAL_PATTERN.test(codeAndSuccessors)
}

function buildL3BusinessGateBoundarySample(rule: V1475CrossItemWorkflowRule) {
  return {
    stableCode: rule.stableCode,
    handoffCategory: rule.handoffCategory ?? null,
    strength: rule.strength,
    autoApplyPolicy: rule.autoApplyPolicy,
    lagDays: rule.lagDays,
    predecessorCodePrefixes: rule.predecessorCodePrefixes,
    successorCodePrefixes: rule.successorCodePrefixes,
    runtimeEligible: isL3RuntimeDefaultEligible(rule),
    boundaryTreatment: isL3RuntimeDefaultEligible(rule)
      ? 'must_be_demoted_or_split_to_l4_before_runtime_generation'
      : 'manual_confirm_business_boundary_signal_not_runtime_l3_dependency',
    boundaryPolicy: rule.boundaryPolicy,
  }
}

function collectL3BusinessGateBoundaryAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const businessGateBoundaryRules = activeCrossItemRules
    .filter((rule) => isL3PackageLevelRule(rule) && hasL3BusinessGateBoundarySignal(rule))
    .sort((a, b) => a.stableCode.localeCompare(b.stableCode))
  const runtimeEligibleBusinessGateRiskRules = businessGateBoundaryRules
    .filter(isL3RuntimeDefaultEligible)
  const quarantinedManualConfirmBusinessGateRules = businessGateBoundaryRules
    .filter((rule) => !isL3RuntimeDefaultEligible(rule))

  return {
    auditScope: 'l3_business_gate_boundary',
    status: runtimeEligibleBusinessGateRiskRules.length === 0
      ? 'l3_runtime_business_gate_boundary_clean'
      : 'l3_runtime_business_gate_boundary_review_required',
    backendOnly: true,
    scopeBoundary: 'building_engineering_only',
    runtimeEligibleBusinessGateRiskCount: runtimeEligibleBusinessGateRiskRules.length,
    highRiskRuntimeEligibleStableCodes: runtimeEligibleBusinessGateRiskRules
      .map((rule) => rule.stableCode),
    quarantinedManualConfirmBusinessGateCount: quarantinedManualConfirmBusinessGateRules.length,
    quarantinedManualConfirmStableCodes: quarantinedManualConfirmBusinessGateRules
      .map((rule) => rule.stableCode),
    runtimeEligibleSamples: runtimeEligibleBusinessGateRiskRules
      .slice(0, 10)
      .map(buildL3BusinessGateBoundarySample),
    quarantinedSamples: quarantinedManualConfirmBusinessGateRules
      .slice(0, 10)
      .map(buildL3BusinessGateBoundarySample),
    boundaryPolicy: 'L3 may retain building-engineering physical interface readiness signals, but statutory acceptance, business release, occupancy, delivery, formal handover, opening, owner/operator takeover, and trial-production approval belong to L4 or project facts; L5 owns retest buffers, release waits, and actual waiting calibration without creating dependencies.',
    promotionPolicy: 'Promote a quarantined L3 business-boundary signal back to confirmed-template runtime generation only after it is split into a physical L3 handoff plus explicit L4 business gate or backed by replay evidence proving the edge is not a business/statutory release.',
    blockingPolicy: 'Runtime-eligible business-gate risk rules must be treated as P1 governance findings; manual-confirm business-boundary signals remain backend governance notes and must not generate default schedule dependencies.',
  }
}

type L3MacroDomainCoverageCatalogItem = {
  macroDomain: string
  expectedHandoffFamilies: string[]
  categorySignals: V1475CrossItemWorkflowHandoffCategory[]
  directStableCodeSignals?: string[]
  priority: 'P0' | 'P1' | 'P2'
  scope: 'building_engineering' | 'out_of_scope_infrastructure'
}

const L3_MACRO_DOMAIN_COVERAGE_CATALOG: L3MacroDomainCoverageCatalogItem[] = [
  {
    macroDomain: 'residential_commercial_building',
    expectedHandoffFamilies: [
      'foundation-to-basement',
      'waterproofing-to-backfill',
      'structure-to-masonry',
      'mep-to-finishes',
      'fire-life-safety',
      'vertical-transport',
    ],
    categorySignals: [
      'foundation_deep_basement',
      'underground_waterproof_backfill',
      'structure_masonry_infill',
      'structure_envelope_roof',
      'mep_to_finishes',
      'fire_life_safety',
      'vertical_transport',
    ],
    directStableCodeSignals: [
      'foundation_pit_to_foundation_work',
      'foundation_to_underground_waterproof',
      'main_structure_to_masonry_infill',
      'concealed_mep_acceptance_to_ceiling_wall_closure',
      'fire_subsystems_to_linkage_commissioning',
      'structure_handover_to_elevator_civil_install',
    ],
    priority: 'P0',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'prefab_modular_building',
    expectedHandoffFamilies: [
      'factory-first-batch-to-site-release',
      'module-logistics-to-lifting',
      'module-interface-to-waterproof-mep',
    ],
    categorySignals: ['prefab_modular'],
    directStableCodeSignals: ['prefab_first_batch_acceptance_to_site_hoist_release'],
    priority: 'P0',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'data_center_cleanroom',
    expectedHandoffFamilies: [
      'envelope-airtightness-to-clean-validation',
      'critical-power-to-monitoring',
      'clean-system-to-specialty-validation',
    ],
    categorySignals: ['data_center_cleanroom', 'smart_building_commissioning', 'fire_life_safety'],
    directStableCodeSignals: ['cleanroom_envelope_acceptance_to_clean_validation_release'],
    priority: 'P0',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'mixed_use_complex',
    expectedHandoffFamilies: [
      'podium-tower-shared-system',
      'tod-commercial-interface',
      'operator-takeover-boundary',
    ],
    categorySignals: ['mixed_use_interface', 'renovation_tod', 'outdoor_municipal'],
    directStableCodeSignals: ['podium_tower_shared_system_acceptance_to_operation_interface_release'],
    priority: 'P0',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'hotel_factory_unit',
    expectedHandoffFamilies: [
      'factory-unit-fat-to-site-install',
      'quick-connect-to-room-commissioning',
      'mockup-to-batch-release',
    ],
    categorySignals: ['hotel_factory_unit'],
    directStableCodeSignals: [
      'integrated_bathroom_fat_to_site_install_release',
      'integrated_kitchen_fat_to_site_install_release',
    ],
    priority: 'P1',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'renovation_retrofit_tod',
    expectedHandoffFamilies: [
      'hazard-closeout-to-reinforcement',
      'existing-structure-review-to-demolition',
      'operating-line-protection-to-interface-release',
    ],
    categorySignals: ['renovation_tod'],
    directStableCodeSignals: ['renovation_hazard_demolition_closeout_to_reinforcement_release'],
    priority: 'P1',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'campus_outdoor_municipal',
    expectedHandoffFamilies: [
      'pipe-pressure-test-to-road-restoration',
      'municipal-connection-to-use-release',
      'outdoor-utility-interface',
    ],
    categorySignals: ['outdoor_municipal'],
    directStableCodeSignals: ['municipal_pipe_test_to_road_restore_release'],
    priority: 'P1',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'smart_building_integration',
    expectedHandoffFamilies: [
      'subsystem-acceptance-to-integrated-commissioning',
      'power-network-security-to-bas-release',
      'monitoring-to-operation-validation',
    ],
    categorySignals: ['smart_building_commissioning'],
    directStableCodeSignals: ['smart_subsystem_acceptance_to_integrated_commissioning_release'],
    priority: 'P1',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'industrial_factory_building',
    expectedHandoffFamilies: [
      'industrial-equipment-fat-to-site-install',
      'utility-commissioning-to-process-validation',
      'clean-production-boundary-to-trial-operation',
    ],
    categorySignals: ['hotel_factory_unit', 'data_center_cleanroom', 'mep_system_commissioning'],
    directStableCodeSignals: ['industrial_cleanroom_process_validation_to_trial_production_release'],
    priority: 'P1',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'medical_healthcare_building',
    expectedHandoffFamilies: [
      'medical-gas-to-special-room-release',
      'cleanroom-validation-to-occupancy',
      'life-safety-to-healthcare-acceptance',
    ],
    categorySignals: ['data_center_cleanroom', 'fire_life_safety', 'mep_system_commissioning'],
    directStableCodeSignals: ['medical_gas_validation_to_special_room_release'],
    priority: 'P1',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'education_cultural_sports_venue',
    expectedHandoffFamilies: [
      'large-span-structure-to-envelope',
      'life-safety-to-public-assembly-release',
      'smart-venue-commissioning-to-operation',
    ],
    categorySignals: ['structure_envelope_roof', 'fire_life_safety', 'smart_building_commissioning'],
    directStableCodeSignals: [
      'campus_safety_and_smart_access_to_term_handover_release',
      'public_venue_life_safety_and_special_space_to_special_acceptance_release',
    ],
    priority: 'P2',
    scope: 'building_engineering',
  },
  {
    macroDomain: 'bridge_engineering',
    expectedHandoffFamilies: [
      'pile-cap-to-pier',
      'pier-to-girder-erection',
      'deck-waterproofing-to-pavement',
      'load-test-to-traffic-release',
    ],
    categorySignals: [],
    priority: 'P0',
    scope: 'out_of_scope_infrastructure',
  },
  {
    macroDomain: 'airport_terminal',
    expectedHandoffFamilies: [
      'terminal-structure-to-baggage-system',
      'airside-interface-to-commissioning',
      'security-screening-to-trial-operation',
    ],
    categorySignals: [],
    priority: 'P1',
    scope: 'out_of_scope_infrastructure',
  },
  {
    macroDomain: 'port_terminal',
    expectedHandoffFamilies: [
      'yard-foundation-to-crane-rail',
      'berth-structure-to-utility-commissioning',
      'heavy-equipment-test-to-operation-release',
    ],
    categorySignals: [],
    priority: 'P1',
    scope: 'out_of_scope_infrastructure',
  },
  {
    macroDomain: 'utility_tunnel',
    expectedHandoffFamilies: [
      'tunnel-structure-to-waterproofing',
      'waterproofing-to-mep-rack-install',
      'integrated-monitoring-to-operation-release',
    ],
    categorySignals: [],
    priority: 'P1',
    scope: 'out_of_scope_infrastructure',
  },
  {
    macroDomain: 'renewable_energy',
    expectedHandoffFamilies: [
      'foundation-to-equipment-install',
      'equipment-install-to-grid-connection',
      'grid-test-to-operation-release',
    ],
    categorySignals: [],
    priority: 'P2',
    scope: 'out_of_scope_infrastructure',
  },
]

function collectL3MacroDomainCoverageAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const rulesByCategory = new Map<V1475CrossItemWorkflowHandoffCategory, V1475CrossItemWorkflowRule[]>()
  const rulesByStableCode = new Map<string, V1475CrossItemWorkflowRule>()

  for (const rule of activeCrossItemRules) {
    rulesByStableCode.set(rule.stableCode, rule)
    if (!rule.handoffCategory) continue
    const rules = rulesByCategory.get(rule.handoffCategory) ?? []
    rules.push(rule)
    rulesByCategory.set(rule.handoffCategory, rules)
  }

  const inScopeCatalog = L3_MACRO_DOMAIN_COVERAGE_CATALOG
    .filter((item) => item.scope === 'building_engineering')
  const outOfScopeCatalog = L3_MACRO_DOMAIN_COVERAGE_CATALOG
    .filter((item) => item.scope === 'out_of_scope_infrastructure')

  const coveredMacroDomains = inScopeCatalog
    .map((item) => {
      const matchedHandoffCategories = item.categorySignals
        .filter((category) => (rulesByCategory.get(category)?.length ?? 0) > 0)
      const directMatchedStableCodes = (item.directStableCodeSignals ?? [])
        .filter((stableCode) => rulesByStableCode.has(stableCode))
      const totalRuleCount = matchedHandoffCategories.reduce(
        (total, category) => total + (rulesByCategory.get(category)?.length ?? 0),
        0,
      )
      const hardAnchorCount = matchedHandoffCategories.reduce(
        (total, category) => total + (rulesByCategory.get(category) ?? [])
          .filter((rule) => rule.strength === 'hard').length,
        0,
      )
      const directHardAnchorCount = directMatchedStableCodes.reduce(
        (total, stableCode) => total + Number(rulesByStableCode.get(stableCode)?.strength === 'hard'),
        0,
      )

      return {
        macroDomain: item.macroDomain,
        coverageMode: directMatchedStableCodes.length > 0 ? 'direct_anchor_present' : 'borrowed_category_only',
        matchedHandoffCategories,
        directMatchedStableCodes,
        expectedHandoffFamilies: item.expectedHandoffFamilies,
        totalRuleCount,
        hardAnchorCount,
        directHardAnchorCount,
        priority: item.priority,
      }
    })
    .filter((item) => item.matchedHandoffCategories.length > 0 || item.directMatchedStableCodes.length > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority.localeCompare(b.priority)
      return a.macroDomain.localeCompare(b.macroDomain)
    })

  const coveredDomainNames = new Set(coveredMacroDomains.map((item) => item.macroDomain))
  const borrowedOnlyCoveredMacroDomains = coveredMacroDomains
    .filter((item) => item.coverageMode === 'borrowed_category_only')
    .map((item) => ({
      macroDomain: item.macroDomain,
      matchedHandoffCategories: item.matchedHandoffCategories,
      expectedHandoffFamilies: item.expectedHandoffFamilies,
      priority: item.priority,
    }))
  const missingMacroDomains = inScopeCatalog
    .filter((item) => !coveredDomainNames.has(item.macroDomain))
    .map((item) => ({
      macroDomain: item.macroDomain,
      expectedHandoffFamilies: item.expectedHandoffFamilies,
      priority: item.priority,
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority.localeCompare(b.priority)
      return a.macroDomain.localeCompare(b.macroDomain)
    })
  const outOfScopeMacroDomains = outOfScopeCatalog
    .map((item) => ({
      macroDomain: item.macroDomain,
      reason: 'Outside the current L3 building-engineering product scope; track only as an explicit boundary, not as a missing building handoff family.',
    }))
    .sort((a, b) => a.macroDomain.localeCompare(b.macroDomain))

  return {
    auditScope: 'l3_cross_item_macro_domain_coverage',
    backendOnly: true,
    scopeBoundary: 'building_engineering_only',
    expectedMacroDomainCount: inScopeCatalog.length,
    coveredMacroDomainCount: coveredMacroDomains.length,
    borrowedOnlyCoveredMacroDomainCount: borrowedOnlyCoveredMacroDomains.length,
    missingMacroDomainCount: missingMacroDomains.length,
    outOfScopeMacroDomainCount: outOfScopeMacroDomains.length,
    coveredMacroDomains,
    borrowedOnlyCoveredMacroDomains,
    missingMacroDomains,
    outOfScopeMacroDomains,
    coveragePolicy: 'Macro-domain coverage is a backend governance audit for building engineering only; a covered macro-domain means at least one mapped L3 handoff family exists, while coverageMode, directMatchedStableCodes, and borrowedOnlyCoveredMacroDomains distinguish direct stable-code anchors from borrowed category-only coverage.',
    promotionPolicy: 'Promote missing in-scope building macro-domain families through template discovery, candidate rules, manual seed review, replay evidence, and confirmed-template validation before any runtime dependency generation.',
    blockingPolicy: 'Do not block user scheduling, baseline confirmation, or progress updates because an in-scope building macro-domain remains missing; missing domains stay visible as governance backlog, while infrastructure domains remain explicit out-of-scope boundaries.',
  }
}

function classifyL3RecommendedConfirmedGovernance(rule: V1475CrossItemWorkflowRule) {
  const searchableText = [
    rule.stableCode,
    rule.sourceClauseRef,
    rule.boundaryPolicy,
  ].join(' ')

  if (/rolling|supply|batch|factory|transport|receiving|MiC|module|prefab/i.test(searchableText)) {
    return /rolling|full[- ]?batch|supply lane|does not serialize|critical path/i.test(searchableText)
      ? 'rolling_supply_chain_advice'
      : 'prefab_project_fact_advice'
  }

  if (rule.handoffCategory === 'renovation_tod') return 'renovation_project_fact_advice'

  return 'project_fact_calibrated_advice'
}

function buildL3RecommendedConfirmedAdviceSample(rule: V1475CrossItemWorkflowRule) {
  return {
    stableCode: rule.stableCode,
    handoffCategory: rule.handoffCategory ?? null,
    dependencyType: rule.dependencyType,
    lagDays: rule.lagDays,
    strength: rule.strength,
    autoApplyPolicy: rule.autoApplyPolicy,
    governanceClass: classifyL3RecommendedConfirmedGovernance(rule),
    runtimeTreatment: 'template_visible_advisory_dependency_not_hard_blocker',
    hardeningDisposition: 'do_not_harden_for_coverage_ratio_without_replay_evidence',
    blockerPolicy: 'Not eligible as a critical-path, baseline, monthly-plan, or hard blocker until replay evidence, project facts, acceptance or handover records, manual review, and confirmed-template promotion prove it should be hardened.',
    boundaryPolicy: rule.boundaryPolicy,
    evidenceSourceKeys: rule.evidenceSourceKeys,
  }
}

function buildL3ResidualTailDispositionSample(rule: V1475CrossItemWorkflowRule) {
  const isRecommendedConfirmedAdvice = rule.strength === 'recommended'
    && rule.autoApplyPolicy === 'confirmed_template_only'
  const disposition = isRecommendedConfirmedAdvice
    ? 'project_fact_calibrated_advice'
    : 'project_fact_governance'
  const runtimeTreatment = isRecommendedConfirmedAdvice
    ? 'template_visible_advisory_dependency_not_hard_blocker'
    : rule.strength === 'hard'
      ? 'manual_confirm_business_boundary_signal_not_runtime_l3_dependency'
      : 'candidate_project_fact_governance_signal_not_runtime_l3_dependency'

  return {
    stableCode: rule.stableCode,
    handoffCategory: rule.handoffCategory ?? null,
    strength: rule.strength,
    autoApplyPolicy: rule.autoApplyPolicy,
    disposition,
    runtimeTreatment,
    hardBlockerEligible: false,
    criticalPathBlockerEligible: false,
    baselineBlockerEligible: false,
    monthlyPlanBlockerEligible: false,
    boundaryPolicy: rule.boundaryPolicy,
  }
}

function collectL3ResidualTailDispositionAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const residualRules = activeCrossItemRules.filter((rule) => (
    rule.strength !== 'hard' || rule.autoApplyPolicy !== 'confirmed_template_only'
  ))
  const samples = residualRules.map(buildL3ResidualTailDispositionSample)
  const sampleByStableCode = new Map(samples.map((sample) => [sample.stableCode, sample]))
  const nonDefaultNonConfirmedRuleCount = activeCrossItemRules.filter((rule) => (
    rule.strength !== 'hard' && rule.autoApplyPolicy !== 'confirmed_template_only'
  )).length
  const hardManualBoundaryRuleCount = activeCrossItemRules.filter((rule) => (
    rule.strength === 'hard' && rule.autoApplyPolicy === 'manual_confirm'
  )).length
  const candidateConfirmedRuleCount = activeCrossItemRules.filter((rule) => (
    rule.strength === 'candidate' && rule.autoApplyPolicy === 'confirmed_template_only'
  )).length
  const recommendedConfirmedAdviceRuleCount = activeCrossItemRules.filter((rule) => (
    rule.strength === 'recommended' && rule.autoApplyPolicy === 'confirmed_template_only'
  )).length
  const unclassifiedResidualRuleCount = samples.filter((sample) => sample.disposition === 'unclassified_residual').length
  const allResidualStableCodes = residualRules.map((rule) => rule.stableCode).sort()
  const missingDispositionStableCodes = residualRules
    .filter((rule) => !sampleByStableCode.has(rule.stableCode))
    .map((rule) => rule.stableCode)
    .sort()
  const unexpectedDispositionStableCodes = samples
    .filter((sample) => !residualRules.some((rule) => rule.stableCode === sample.stableCode))
    .map((sample) => sample.stableCode)
    .sort()

  return {
    auditScope: 'l3_residual_tail_disposition',
    status: 'l3_residual_tail_fully_dispositioned',
    backendOnly: true,
    scopeBoundary: 'building_engineering_only',
    totalActiveRuleCount: activeCrossItemRules.length,
    runtimeDefaultHardRuleCount: activeCrossItemRules.length - residualRules.length,
    residualRuleCount: residualRules.length,
    nonDefaultNonConfirmedRuleCount,
    hardManualBoundaryRuleCount,
    candidateConfirmedRuleCount,
    recommendedConfirmedAdviceRuleCount,
    unclassifiedResidualRuleCount,
    hardBlockerEligibleResidualRuleCount: samples.filter((sample) => sample.hardBlockerEligible).length,
    criticalPathBlockerEligibleResidualRuleCount: samples.filter((sample) => sample.criticalPathBlockerEligible).length,
    baselineBlockerEligibleResidualRuleCount: samples.filter((sample) => sample.baselineBlockerEligible).length,
    monthlyPlanBlockerEligibleResidualRuleCount: samples.filter((sample) => sample.monthlyPlanBlockerEligible).length,
    missingDispositionStableCodes,
    unexpectedDispositionStableCodes,
    allResidualStableCodes,
    samples,
    scheduleTrustPolicy: 'Residual L3 tails are only trusted after every non-hard/non-confirmed rule is explicitly dispositioned into project-fact governance or calibrated advice; none may silently become default runtime dependencies or hidden schedule trust debt.',
    completionPolicy: 'All residual L3 tails must remain visible, partitioned, and auditable by stableCode until runtime-default hard coverage, candidate/manual governance, and recommended advisory cues are all explicitly dispositioned.',
  }
}

function collectL3RecommendedConfirmedAdviceAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const adviceRules = activeCrossItemRules
    .filter((rule) => rule.strength === 'recommended' && rule.autoApplyPolicy === 'confirmed_template_only')

  const familyStatsByCategory = new Map<string, {
    handoffCategory: string
    recommendedConfirmedRuleCount: number
    runtimeVisibleRuleCount: number
    hardeningBacklogRuleCount: number
    sampleStableCodes: string[]
  }>()

  for (const rule of adviceRules) {
    const handoffCategory = rule.handoffCategory ?? 'unclassified'
    const existing = familyStatsByCategory.get(handoffCategory) ?? {
      handoffCategory,
      recommendedConfirmedRuleCount: 0,
      runtimeVisibleRuleCount: 0,
      hardeningBacklogRuleCount: 0,
      sampleStableCodes: [],
    }

    existing.recommendedConfirmedRuleCount += 1
    existing.runtimeVisibleRuleCount += 1
    if (existing.sampleStableCodes.length < 8) existing.sampleStableCodes.push(rule.stableCode)
    familyStatsByCategory.set(handoffCategory, existing)
  }

  const families = Array.from(familyStatsByCategory.values())
    .sort((a, b) => {
      if (a.recommendedConfirmedRuleCount !== b.recommendedConfirmedRuleCount) {
        return b.recommendedConfirmedRuleCount - a.recommendedConfirmedRuleCount
      }
      return a.handoffCategory.localeCompare(b.handoffCategory)
    })

  return {
    auditScope: 'l3_recommended_confirmed_template_project_fact_advice',
    status: 'recommended_confirmed_template_rules_are_project_fact_calibrated_advice',
    backendOnly: true,
    scopeBoundary: 'building_engineering_only',
    ruleCount: adviceRules.length,
    runtimeVisibleRuleCount: adviceRules.length,
    hardBlockerEligibleRuleCount: 0,
    criticalPathBlockerEligibleRuleCount: 0,
    hardeningBacklogRuleCount: 0,
    familyCount: families.length,
    families,
    samples: adviceRules.map(buildL3RecommendedConfirmedAdviceSample),
    governanceReason: 'Residual recommended confirmed-template L3 rules are visible as calibrated building-engineering advice because rolling prefab supply, factory logistics, MiC receiving, and renovation survey-to-strengthening releases vary by project facts and should not be hardened only to improve family coverage ratios.',
    blockingPolicy: 'These advisory rules are not hard critical-path, baseline, or monthly-plan blockers unless later promoted through replay evidence, project facts, acceptance or handover records, manual governance review, and confirmed-template validation.',
    promotionPolicy: 'Promote a recommended confirmed-template advice rule only after replay evidence, explicit project-fact support, acceptance or handover evidence, manual seed review, false-positive checks, and confirmed-template validation prove it is stable enough to become a hard gate.',
  }
}

function readStrictConditionalLagDays(rule: V1475CrossItemWorkflowRule) {
  const baseLagDays = Number(rule.lagDays ?? 0)
  return (rule.conditionalLagProfiles ?? [])
    .map((profile) => Number(profile.lagDays ?? 0))
    .filter((lagDays) => Number.isFinite(lagDays) && lagDays > baseLagDays)
}

function buildL3LowLagHardGateSample(rule: V1475CrossItemWorkflowRule) {
  const strictLagDays = readStrictConditionalLagDays(rule)

  return {
    stableCode: rule.stableCode,
    handoffCategory: rule.handoffCategory ?? null,
    dependencyType: rule.dependencyType,
    baseLagDays: Number(rule.lagDays ?? 0),
    strictProfileMaxLagDays: strictLagDays.length > 0 ? Math.max(...strictLagDays) : Number(rule.lagDays ?? 0),
    conditionProfileCount: rule.conditionalLagProfiles?.length ?? 0,
    calibrationDisposition: 'base_lag_is_minimum_template_buffer_not_no_wait',
    calibrationPolicy: 'Treat low-lag hard L3 gates as minimum confirmed-template buffers only; stricter conditional profiles, project replay, acceptance and handover evidence, weather or scope facts, and duration seeds calibrate real waiting time.',
    evidenceSourceKeys: rule.evidenceSourceKeys,
  }
}

function collectL3LowLagHardGateCalibrationAudit(
  activeCrossItemRules: V1475CrossItemWorkflowRule[],
  lowLagThresholdDays: number,
) {
  const hardLowLagRules = activeCrossItemRules.filter((rule) => (
    rule.strength === 'hard'
    && rule.autoApplyPolicy === 'confirmed_template_only'
    && Number(rule.lagDays ?? 0) <= lowLagThresholdDays
  ))
  const flatZeroLagHardRules = hardLowLagRules.filter((rule) => Number(rule.lagDays ?? 0) === 0)
  const rulesWithoutConditionProfile = hardLowLagRules.filter((rule) => (rule.conditionalLagProfiles?.length ?? 0) === 0)
  const rulesWithoutStricterProfile = hardLowLagRules.filter((rule) => readStrictConditionalLagDays(rule).length === 0)
  const strictConditionalLagDays = hardLowLagRules.flatMap(readStrictConditionalLagDays)
  const familyStatsByCategory = new Map<string, {
    handoffCategory: string
    hardLowLagRuleCount: number
    flatZeroLagHardRuleCount: number
    rulesWithoutConditionProfileCount: number
    rulesWithoutStricterProfileCount: number
    sampleStableCodes: string[]
  }>()

  for (const rule of hardLowLagRules) {
    const handoffCategory = rule.handoffCategory ?? 'unclassified'
    const existing = familyStatsByCategory.get(handoffCategory) ?? {
      handoffCategory,
      hardLowLagRuleCount: 0,
      flatZeroLagHardRuleCount: 0,
      rulesWithoutConditionProfileCount: 0,
      rulesWithoutStricterProfileCount: 0,
      sampleStableCodes: [],
    }

    existing.hardLowLagRuleCount += 1
    existing.flatZeroLagHardRuleCount += Number(Number(rule.lagDays ?? 0) === 0)
    existing.rulesWithoutConditionProfileCount += Number((rule.conditionalLagProfiles?.length ?? 0) === 0)
    existing.rulesWithoutStricterProfileCount += Number(readStrictConditionalLagDays(rule).length === 0)
    if (existing.sampleStableCodes.length < 5) existing.sampleStableCodes.push(rule.stableCode)
    familyStatsByCategory.set(handoffCategory, existing)
  }

  const conditionProfileCoveredRuleCount = hardLowLagRules.length - rulesWithoutConditionProfile.length
  const stricterConditionalProfileRuleCount = hardLowLagRules.length - rulesWithoutStricterProfile.length
  const noWaitAssumptionRuleCount = hardLowLagRules.filter((rule) => (
    Number(rule.lagDays ?? 0) === 0
    || (rule.conditionalLagProfiles?.length ?? 0) === 0
    || readStrictConditionalLagDays(rule).length === 0
  )).length

  return {
    auditScope: 'l3_low_lag_hard_gate_calibration',
    status: 'hard_low_lag_gates_are_minimum_template_buffers_not_no_wait_defaults',
    backendOnly: true,
    scopeBoundary: 'building_engineering_only',
    lowLagThresholdDays,
    hardLowLagRuleCount: hardLowLagRules.length,
    flatZeroLagHardRuleCount: flatZeroLagHardRules.length,
    noWaitAssumptionRuleCount,
    conditionProfileCoveredRuleCount,
    conditionProfileCoverageRatio: hardLowLagRules.length > 0
      ? Number((conditionProfileCoveredRuleCount / hardLowLagRules.length).toFixed(4))
      : 0,
    stricterConditionalProfileRuleCount,
    rulesWithoutConditionProfileCount: rulesWithoutConditionProfile.length,
    rulesWithoutStricterProfileCount: rulesWithoutStricterProfile.length,
    minimumStrictConditionalLagDays: strictConditionalLagDays.length > 0 ? Math.min(...strictConditionalLagDays) : 0,
    maximumStrictConditionalLagDays: strictConditionalLagDays.length > 0 ? Math.max(...strictConditionalLagDays) : 0,
    familyCount: familyStatsByCategory.size,
    families: Array.from(familyStatsByCategory.values())
      .sort((a, b) => {
        if (a.hardLowLagRuleCount !== b.hardLowLagRuleCount) return b.hardLowLagRuleCount - a.hardLowLagRuleCount
        return a.handoffCategory.localeCompare(b.handoffCategory)
      }),
    samples: hardLowLagRules.map(buildL3LowLagHardGateSample),
    calibrationPolicy: 'A hard L3 rule with base lagDays <= 1 is a minimum confirmed-template buffer, not a no-wait default. Real waiting time must be widened by stricter conditional profiles, project replay, acceptance or handover facts, scope and climate signals, and duration seed calibration.',
    promotionPolicy: 'Keep low-lag hard gates only when every rule has nonzero base lag and stricter conditional profiles; otherwise move the rule into replay review before using it as a hard schedule gate.',
    falsePositiveGuard: 'If replay shows actual same-day overlap, missing acceptance evidence, scope mismatch, or repeated user deletion, downgrade or conditionize the rule instead of treating low lag as universally trusted.',
  }
}

type L3ConditionalTriggerSourceType =
  | 'project_feature'
  | 'hard_constraint'
  | 'climate_or_weather'
  | 'external_interface'
  | 'method_variant_or_prefab'
  | 'acceptance_or_handover_fact'

const L3_CONDITIONAL_TRIGGER_SOURCE_TYPES: L3ConditionalTriggerSourceType[] = [
  'project_feature',
  'hard_constraint',
  'climate_or_weather',
  'external_interface',
  'method_variant_or_prefab',
  'acceptance_or_handover_fact',
]

function classifyL3ConditionalTriggerSourceTypes(signal: string): L3ConditionalTriggerSourceType[] {
  const normalizedSignal = signal.toLowerCase()
  const sourceTypes = new Set<L3ConditionalTriggerSourceType>(['project_feature'])

  if (
    /required|authority|witness|approval|booking|locked|reinspection|retest|rectification|exception|gap|abnormality/.test(normalizedSignal)
  ) {
    sourceTypes.add('hard_constraint')
  }

  if (
    /rain|rainy|winter|weather|wind|groundwater|moisture|season|seasonal|temperature|humidity|climate/.test(normalizedSignal)
  ) {
    sourceTypes.add('climate_or_weather')
  }

  if (
    /tod|municipal|operator|traffic|utility|metro|station|interface|switch_over|takeover|live_line|formal_power|gas|power/.test(normalizedSignal)
  ) {
    sourceTypes.add('external_interface')
  }

  if (
    /prefab|module|modular|mic|pcf|factory|batch|component|hoist|grouting|alc|curtain_wall|steel|deck|transport|yard|traceability/.test(normalizedSignal)
  ) {
    sourceTypes.add('method_variant_or_prefab')
  }

  if (
    /acceptance|handover|record|closed|closeout|passed|validation|inspection|test|trial|commissioning|witness/.test(normalizedSignal)
  ) {
    sourceTypes.add('acceptance_or_handover_fact')
  }

  return L3_CONDITIONAL_TRIGGER_SOURCE_TYPES.filter((sourceType) => sourceTypes.has(sourceType))
}

function collectL3ConditionalTriggerSourceAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const conditionalRules = activeCrossItemRules.filter((rule) => (rule.conditionalLagProfiles?.length ?? 0) > 0)
  const bucketStats = new Map<L3ConditionalTriggerSourceType, {
    sourceType: L3ConditionalTriggerSourceType
    signals: Set<string>
    profileKeys: Set<string>
    ruleCodes: Set<string>
  }>()
  const uniqueTriggerSignals = new Set<string>()
  const samples: Array<{
    stableCode: string
    handoffCategory: string | null
    conditionCode: string
    triggerSignals: string[]
    sourceTypes: L3ConditionalTriggerSourceType[]
  }> = []

  const ensureBucket = (sourceType: L3ConditionalTriggerSourceType) => {
    const existing = bucketStats.get(sourceType)
    if (existing) return existing

    const created = {
      sourceType,
      signals: new Set<string>(),
      profileKeys: new Set<string>(),
      ruleCodes: new Set<string>(),
    }
    bucketStats.set(sourceType, created)
    return created
  }

  for (const rule of conditionalRules) {
    for (const profile of rule.conditionalLagProfiles ?? []) {
      const normalizedSignals = profile.triggerSignals
        .map((signal) => signal.trim())
        .filter(Boolean)
      const sourceTypes = Array.from(new Set(normalizedSignals.flatMap(classifyL3ConditionalTriggerSourceTypes)))
        .sort((a, b) => L3_CONDITIONAL_TRIGGER_SOURCE_TYPES.indexOf(a) - L3_CONDITIONAL_TRIGGER_SOURCE_TYPES.indexOf(b))
      const profileKey = `${rule.stableCode}:${profile.conditionCode}`

      for (const signal of normalizedSignals) {
        uniqueTriggerSignals.add(signal)
        for (const sourceType of classifyL3ConditionalTriggerSourceTypes(signal)) {
          const bucket = ensureBucket(sourceType)
          bucket.signals.add(signal)
          bucket.profileKeys.add(profileKey)
          bucket.ruleCodes.add(rule.stableCode)
        }
      }

      samples.push({
        stableCode: rule.stableCode,
        handoffCategory: rule.handoffCategory ?? null,
        conditionCode: profile.conditionCode,
        triggerSignals: normalizedSignals,
        sourceTypes,
      })
    }
  }

  const sourceBuckets = L3_CONDITIONAL_TRIGGER_SOURCE_TYPES
    .map((sourceType) => {
      const bucket = ensureBucket(sourceType)

      return {
        sourceType,
        signalCount: bucket.signals.size,
        profileCount: bucket.profileKeys.size,
        ruleCount: bucket.ruleCodes.size,
        sampleSignals: Array.from(bucket.signals).sort(),
        sampleStableCodes: Array.from(bucket.ruleCodes).sort().slice(0, 20),
      }
    })

  return {
    auditScope: 'l3_conditional_lag_trigger_source_audit',
    status: 'l3_conditional_lag_triggers_are_project_fact_consumable',
    backendOnly: true,
    scopeBoundary: 'building_engineering_only',
    conditionalRuleCount: conditionalRules.length,
    conditionalLagProfileCount: conditionalRules.reduce(
      (total, rule) => total + (rule.conditionalLagProfiles?.length ?? 0),
      0,
    ),
    uniqueTriggerSignalCount: uniqueTriggerSignals.size,
    sourceBuckets,
    samples: samples.sort((a, b) => {
      if (a.stableCode !== b.stableCode) return a.stableCode.localeCompare(b.stableCode)
      return a.conditionCode.localeCompare(b.conditionCode)
    }),
    factSourcePolicy: 'L3 conditional lag profiles are consumable from projectFeatures, hardConstraintCodes, acceptance/handover facts, weather/climate facts, and duration replay evidence; matched trigger signals explain why effectiveLagDays is stricter than baseLagDays.',
    fallbackPolicy: 'Do not infer stricter L3 lag from keyword fallback or seed presence alone; a conditional profile is applied only when explicit trigger signals are present in project facts, hard constraints, acceptance/handover records, climate facts, or replay-calibrated evidence.',
  }
}

function collectL3LagCalibrationAudit(activeCrossItemRules: V1475CrossItemWorkflowRule[]) {
  const lowLagThresholdDays = 1
  const flatZeroLagRules = activeCrossItemRules.filter((rule) => Number(rule.lagDays ?? 0) === 0)
  const lowLagRules = activeCrossItemRules.filter((rule) => Number(rule.lagDays ?? 0) <= lowLagThresholdDays)
  const flatZeroLagConfirmedTemplateOnlyRules = flatZeroLagRules.filter((rule) => rule.autoApplyPolicy === 'confirmed_template_only')
  const flatZeroLagReviewQueueRules = flatZeroLagRules
    .filter((rule) => rule.strength !== 'hard')
    .sort((a, b) => {
      const autoApplyWeight = Number(b.autoApplyPolicy === 'confirmed_template_only') - Number(a.autoApplyPolicy === 'confirmed_template_only')
      if (autoApplyWeight !== 0) return autoApplyWeight
      const categoryWeight = Number(Boolean(b.handoffCategory)) - Number(Boolean(a.handoffCategory))
      if (categoryWeight !== 0) return categoryWeight
      const confidenceWeight = Number(b.confidence === 'high') - Number(a.confidence === 'high')
      if (confidenceWeight !== 0) return confidenceWeight
      return a.stableCode.localeCompare(b.stableCode)
    })
  const topFlatZeroLagSamples = flatZeroLagReviewQueueRules.slice(0, 10).map(buildL3LagCalibrationSample)
  const categoryAuditByName = new Map<string, {
    handoffCategory: string
    totalRuleCount: number
    hardRuleCount: number
    recommendedRuleCount: number
    candidateRuleCount: number
    lowLagRuleCount: number
    minimumLagDays: number
    maximumLagDays: number
    lagDaysTotal: number
  }>()

  for (const rule of activeCrossItemRules) {
    if (!rule.handoffCategory) continue

    const existing = categoryAuditByName.get(rule.handoffCategory) ?? {
      handoffCategory: rule.handoffCategory,
      totalRuleCount: 0,
      hardRuleCount: 0,
      recommendedRuleCount: 0,
      candidateRuleCount: 0,
      lowLagRuleCount: 0,
      minimumLagDays: Number.POSITIVE_INFINITY,
      maximumLagDays: 0,
      lagDaysTotal: 0,
    }
    const lagDays = Number(rule.lagDays ?? 0)

    existing.totalRuleCount += 1
    existing.hardRuleCount += Number(rule.strength === 'hard')
    existing.recommendedRuleCount += Number(rule.strength === 'recommended')
    existing.candidateRuleCount += Number(rule.strength === 'candidate')
    existing.lowLagRuleCount += Number(lagDays <= lowLagThresholdDays)
    existing.minimumLagDays = Math.min(existing.minimumLagDays, lagDays)
    existing.maximumLagDays = Math.max(existing.maximumLagDays, lagDays)
    existing.lagDaysTotal += lagDays
    categoryAuditByName.set(rule.handoffCategory, existing)
  }

  const handoffCategoryHardCoverage = Array.from(categoryAuditByName.values())
    .map((item) => ({
      handoffCategory: item.handoffCategory,
      totalRuleCount: item.totalRuleCount,
      hardRuleCount: item.hardRuleCount,
      recommendedRuleCount: item.recommendedRuleCount,
      candidateRuleCount: item.candidateRuleCount,
      hardCoverageRatio: Number((item.hardRuleCount / item.totalRuleCount).toFixed(4)),
      lowLagRuleCount: item.lowLagRuleCount,
      minimumLagDays: item.minimumLagDays === Number.POSITIVE_INFINITY ? 0 : item.minimumLagDays,
      maximumLagDays: item.maximumLagDays,
      averageLagDays: Number((item.lagDaysTotal / item.totalRuleCount).toFixed(2)),
    }))
    .sort((a, b) => a.handoffCategory.localeCompare(b.handoffCategory))

  const topHardCoverageReviewFamilies = handoffCategoryHardCoverage
    .filter((item) => item.hardCoverageRatio < 1 || item.recommendedRuleCount > 0 || item.candidateRuleCount > 0)
    .sort((a, b) => {
      if (a.hardCoverageRatio !== b.hardCoverageRatio) return a.hardCoverageRatio - b.hardCoverageRatio
      if (a.lowLagRuleCount !== b.lowLagRuleCount) return b.lowLagRuleCount - a.lowLagRuleCount
      if (a.totalRuleCount !== b.totalRuleCount) return b.totalRuleCount - a.totalRuleCount
      return a.handoffCategory.localeCompare(b.handoffCategory)
    })
    .slice(0, 10)
    .map((item) => ({
      handoffCategory: item.handoffCategory,
      hardCoverageRatio: item.hardCoverageRatio,
      totalRuleCount: item.totalRuleCount,
      hardRuleCount: item.hardRuleCount,
      recommendedRuleCount: item.recommendedRuleCount,
      candidateRuleCount: item.candidateRuleCount,
      lowLagRuleCount: item.lowLagRuleCount,
      minimumLagDays: item.minimumLagDays,
      reviewReason: item.hardRuleCount === 0
        ? 'no_hard_anchor_in_confirmed_cross_item_family'
        : 'non_hard_cross_item_family_requires_project_fact_governance_or_replay_calibration',
    }))
  const macroDomainCoverageAudit = collectL3MacroDomainCoverageAudit(activeCrossItemRules)
  const candidateManualConfirmFamilyAudit = collectL3CandidateManualConfirmFamilyAudit(activeCrossItemRules)
  const recommendedConfirmedTemplateAdviceAudit = collectL3RecommendedConfirmedAdviceAudit(activeCrossItemRules)
  const residualTailDispositionAudit = collectL3ResidualTailDispositionAudit(activeCrossItemRules)
  const lowLagHardGateCalibrationAudit = collectL3LowLagHardGateCalibrationAudit(activeCrossItemRules, lowLagThresholdDays)
  const conditionalTriggerSourceAudit = collectL3ConditionalTriggerSourceAudit(activeCrossItemRules)
  const businessGateBoundaryAudit = collectL3BusinessGateBoundaryAudit(activeCrossItemRules)

  return {
    status: 'l3_strength_lag_depth_require_project_replay',
    backendOnly: true,
    totalActiveRuleCount: activeCrossItemRules.length,
    lowLagThresholdDays,
    lowLagRuleCount: lowLagRules.length,
    flatZeroLagRuleCount: flatZeroLagRules.length,
    flatZeroLagConfirmedTemplateOnlyRuleCount: flatZeroLagConfirmedTemplateOnlyRules.length,
    flatZeroLagHardRuleCount: flatZeroLagRules.filter((rule) => rule.strength === 'hard').length,
    nonZeroLagRuleCount: activeCrossItemRules.filter((rule) => Number(rule.lagDays ?? 0) > 0).length,
    conditionalRuleCount: activeCrossItemRules.filter((rule) => (rule.conditionalLagProfiles?.length ?? 0) > 0).length,
    conditionalLagProfileCount: activeCrossItemRules.reduce(
      (total, rule) => total + (rule.conditionalLagProfiles?.length ?? 0),
      0,
    ),
    handoffCategoryHardCoverage,
    topHardCoverageReviewFamilies,
    macroDomainCoverageAudit,
    candidateManualConfirmFamilyAudit,
    recommendedConfirmedTemplateAdviceAudit,
    residualTailDispositionAudit,
    lowLagHardGateCalibrationAudit,
    conditionalTriggerSourceAudit,
    businessGateBoundaryAudit,
    sampleSize: topFlatZeroLagSamples.length,
    topFlatZeroLagSamples,
    replayEvidenceRequired: [
      'actual_start_finish_history',
      'acceptance_or_handover_records',
      'project_scope_facts',
      'duration_seed_resolution',
      'weather_or_climate_records',
      'user_dependency_override_history',
    ],
    queuePolicy: 'L3 package handoffs with zero or low lag, weak hard coverage, or broad recommended families remain visible as a backend replay queue; they must not be interpreted as field-proven no-wait or fully trusted hard-path handoffs.',
    promotionPolicy: 'Promote an L3 handoff to a stricter nonzero default, hard gate, or conditional lag profile only after project replay evidence, acceptance/handover evidence, manual seed review, and conflict checks.',
    falsePositiveGuard: 'If replay shows frequent user deletion, scope mismatch, skipped handover evidence, or actual overlap that belongs to same-parent internal flow, keep the handoff as recommended/candidate instead of hardening it.',
  }
}

function collectDependencyTrustHardeningMetrics(
  internalFlowReport: ReturnType<typeof collectStandardInternalFlowGovernanceReport>,
  dependencyIntentCoverage: ReturnType<typeof collectDependencyIntentCoverage>,
  processConstraintCoverage: ReturnType<typeof collectProcessConstraintCoverage>,
) {
  const activeCrossItemRules = V1475_CROSS_ITEM_WORKFLOW_SEED.filter((rule) => rule.isActive !== false)
  const activeL3ConditionalLagRules = activeCrossItemRules.filter((rule) => (rule.conditionalLagProfiles?.length ?? 0) > 0)
  const l3ConditionalLagProfileCount = activeL3ConditionalLagRules.reduce(
    (total, rule) => total + (rule.conditionalLagProfiles?.length ?? 0),
    0,
  )
  const handoffCategories = new Set(activeCrossItemRules.map((rule) => rule.handoffCategory).filter(Boolean))
  const l3LagCalibrationAudit = collectL3LagCalibrationAudit(activeCrossItemRules)
  const acceptanceTimelineExplicitGateObservations = collectAcceptanceTimelineExplicitBusinessGateObservations()
  const explicitGateObservedTemplateCodes = Array.from(new Set([
    ...dependencyIntentCoverage.explicitGateRuntimeObservedTemplateCodes,
    ...acceptanceTimelineExplicitGateObservations.observedTemplateCodes,
  ])).sort()
  const explicitGateTemplateAudit = collectExplicitBusinessGateTemplateAudit(
    explicitGateObservedTemplateCodes,
  )
  const activeScenarioConstraints = V1474_PROCESS_CONSTRAINT_SEED.filter((rule) => (
    rule.isActive !== false
    && L5_SCENARIO_CONSTRAINT_TYPES.has(rule.constraintType)
  ))
  const l5ScenarioConstraintAudit = collectL5ScenarioConstraintAudit(processConstraintCoverage)
  const catalogGroupReviewRequiredCounts = Object.fromEntries(
    Object.entries(internalFlowReport.summary.byCatalogGroupCurationStatus)
      .flatMap(([catalogGroup, counts]) => {
        const count = Number(counts.review_required ?? 0)
        return count > 0 ? [[catalogGroup, count] as const] : []
      }),
  )
  const metadataBackValidationSamples = dependencyIntentCoverage.samples.metadataInferredRuntimeEligible
    .slice(0, 10)
    .map(buildMetadataInferredBackValidationSample)
  const l2InScopeReviewRequiredPairs = internalFlowReport.inScopeTopReviewRequiredPairs ?? internalFlowReport.topReviewRequiredPairs
  const l2OutOfScopeReviewPairs = internalFlowReport.outOfScopeReviewTailPairs ?? []
  const l2NameQualityReviewPairs = l2InScopeReviewRequiredPairs
    .filter(hasMalformedInternalFlowPairName)
  const l2PromotionCandidatePairs = l2InScopeReviewRequiredPairs
    .filter((pair) => !hasMalformedInternalFlowPairName(pair))
  const l2ReviewTailClassificationAudit = internalFlowReport.reviewRequiredTailClassificationAudit
  const l2RuntimeBlockingMissingPairCount = l2ReviewTailClassificationAudit.promotionEligibleTailCount
    + l2ReviewTailClassificationAudit.reviewTailEffectiveCreatesDependencyCount
  const l2ActionableSeedDepthCandidateCount = Number(
    l2ReviewTailClassificationAudit.reviewTailActionBuckets?.l2_seed_depth_candidate ?? 0,
  )
  const l2RawReviewRequiredTailCount = internalFlowReport.summary.reviewRequired
  const l2NonActionableOrOutOfScopeTailCount = Math.max(
    0,
    l2RawReviewRequiredTailCount - l2ActionableSeedDepthCandidateCount,
  )
  const buildL2ReverseOmissionPair = (pair: typeof internalFlowReport.topReviewRequiredPairs[number]) => ({
    ...pair,
    promotionPriority: pair.governancePriority,
  })

  return {
    status: 'schedule_trust_hardening_in_progress',
    l2ReverseCoverage: {
      auditMode: 'catalog_adjacent_pair_reverse_coverage',
      totalAdjacentPairCount: internalFlowReport.summary.totalRules,
      curatedRuleCount: internalFlowReport.summary.curated,
      curatedCoverageRatio: internalFlowReport.summary.curatedCoverageRatio,
      evidenceRefRuleCount: internalFlowReport.summary.rulesWithEvidenceRefs,
      evidenceRefCoverageRatio: internalFlowReport.summary.evidenceRefCoverageRatio,
      conditionalRuleCount: internalFlowReport.summary.conditionalRuleCount,
      evidenceStrengthAudit: internalFlowReport.evidenceStrengthAudit,
      p0ReviewRequiredRuleCount: internalFlowReport.executionBaselineGate.highPriorityReviewRequiredRuleCount,
      reviewRequiredTailCount: internalFlowReport.summary.reviewRequired,
      reviewTailPolicy: internalFlowReport.executionBaselineGate.p2TailPolicy,
      runtimeBlockingPolicy: internalFlowReport.executionBaselineGate.runtimePolicy,
      reverseOmissionAudit: {
        auditScope: 'review_required_catalog_adjacent_pairs',
        missingPairCount: internalFlowReport.summary.reviewRequired,
        inScopeMissingPairCount: l2ReviewTailClassificationAudit.inScopeReviewTailRuleCount,
        inScopeUniqueMissingPairCount: l2ReviewTailClassificationAudit.inScopeUniqueMissingPairCount,
        outOfScopeReviewRequiredRuleCount: l2ReviewTailClassificationAudit.outOfScopeReviewTailRuleCount,
        outOfScopeUniqueMissingPairCount: l2ReviewTailClassificationAudit.outOfScopeUniqueMissingPairCount,
        outOfScopeCatalogIdCounts: l2ReviewTailClassificationAudit.outOfScopeCatalogIdCounts,
        missingRuleRatio: internalFlowReport.summary.reviewRequiredRatio,
        catalogGroupReviewRequiredCounts,
        runtimePromotionEligibleMissingPairCount: l2ReviewTailClassificationAudit.promotionEligibleTailCount,
        runtimeCreatesDependencyMissingPairCount: l2ReviewTailClassificationAudit.reviewTailCreatesDependencyCount,
        runtimeEffectiveCreatesDependencyMissingPairCount: l2ReviewTailClassificationAudit.reviewTailEffectiveCreatesDependencyCount,
        rawBacklogPolicy: 'Raw review_required backlog is a seed-depth governance signal and may grow as process seeds deepen; schedule-trust gates must use runtime promotion eligibility, evidence refs, and creates-dependency counters before promoting any pair.',
        scopeBoundaryPolicy: 'Building-engineering L2 reverse-coverage backlog excludes standalone infrastructure mainlines; out-of-scope tails are reported separately and must not be promoted to close building-project coverage.',
        runtimeGapAudit: {
          status: l2RuntimeBlockingMissingPairCount === 0
            ? 'runtime_missing_dependency_gap_closed_with_p2_governance_tail'
            : 'runtime_missing_dependency_gap_requires_review',
          backendOnly: true,
          rawReviewRequiredRuleCount: internalFlowReport.summary.reviewRequired,
          runtimePromotionEligibleMissingPairCount: l2ReviewTailClassificationAudit.promotionEligibleTailCount,
          runtimeCreatesDependencyMissingPairCount: l2ReviewTailClassificationAudit.reviewTailCreatesDependencyCount,
          runtimeEffectiveCreatesDependencyMissingPairCount: l2ReviewTailClassificationAudit.reviewTailEffectiveCreatesDependencyCount,
          runtimeBlockingMissingPairCount: l2RuntimeBlockingMissingPairCount,
          runtimeGapClosed: l2RuntimeBlockingMissingPairCount === 0,
          governanceTailStillOpen: internalFlowReport.summary.reviewRequired > 0,
          governanceTailReason: internalFlowReport.summary.reviewRequired > 0
            ? 'raw_review_required_tail_below_curated_coverage_target'
            : 'raw_review_required_tail_closed',
          scheduleTrustDisposition: l2RuntimeBlockingMissingPairCount === 0
            ? 'runtime ready: raw review_required tail remains P2 governance backlog and must not block schedule generation, baseline confirmation, monthly-plan confirmation, or task progress writes.'
            : 'runtime review required: promotion-eligible or effective dependency-generating review tail remains before schedule trust can be closed.',
        },
        actionableL2BreadthGapAudit: {
          status: 'l2_actionable_breadth_gap_is_seed_depth_not_runtime_blocking',
          backendOnly: true,
          rawReviewRequiredTailCount: l2RawReviewRequiredTailCount,
          actionableL2SeedDepthCandidateCount: l2ActionableSeedDepthCandidateCount,
          nonL2OrOutOfScopeTailCount: l2NonActionableOrOutOfScopeTailCount,
          runtimeBlockingMissingPairCount: l2RuntimeBlockingMissingPairCount,
          runtimeBlockingGapClosed: l2RuntimeBlockingMissingPairCount === 0,
          actionBuckets: l2ReviewTailClassificationAudit.reviewTailActionBuckets,
          l2SeedDepthCandidateSamples: l2ReviewTailClassificationAudit.reviewTailActionSamples?.l2_seed_depth_candidate ?? [],
          seedDepthCandidatePolicy: 'Only the l2_seed_depth_candidate bucket is treated as actionable L2 breadth work; it still requires seed-depth evidence, manual curation, and runtime-impact checks before promotion.',
          nextActionPolicy: 'Do not promote the raw review_required tail wholesale: route L3/L4/L5/data-quality/out-of-scope buckets to their owning layer, and use the L2 seed-depth bucket as the next same-pack internal-flow evidence queue.',
        },
        reviewTailClassificationAudit: l2ReviewTailClassificationAudit,
        nameQualityPolicy: 'malformed_or_suspect_names_require_catalog_text_cleanup_before_rule_promotion',
        nameQualityReviewPairs: l2NameQualityReviewPairs.map(buildL2ReverseOmissionPair),
        outOfScopeReviewPairs: l2OutOfScopeReviewPairs.map(buildL2ReverseOmissionPair),
        topMissingPairs: l2PromotionCandidatePairs.map(buildL2ReverseOmissionPair),
        rankedBy: 'frequency_then_governance_priority_from_reverse_catalog_scan',
        promotionPolicy: 'backend governance backlog only: promote missing pairs through candidate discovery, manual curation, evidence refs, and seed review before any runtime dependency generation.',
        blockingPolicy: 'never block ordinary task save, progress update, baseline confirmation, or monthly-plan confirmation while a pair remains review_required.',
      },
    },
    l3ActiveRuleCount: activeCrossItemRules.length,
    l3ConfirmedTemplateOnlyRuleCount: activeCrossItemRules.filter((rule) => rule.autoApplyPolicy === 'confirmed_template_only').length,
    l3HardGateRuleCount: activeCrossItemRules.filter((rule) => rule.strength === 'hard').length,
    l3NonZeroLagRuleCount: activeCrossItemRules.filter((rule) => Number(rule.lagDays ?? 0) > 0).length,
    l3ConditionalRuleCount: activeL3ConditionalLagRules.length,
    l3ConditionalLagProfileCount,
    l3HandoffCategoryCount: handoffCategories.size,
    l3HandoffCategories: Array.from(handoffCategories).sort(),
    l3LagCalibrationAudit,
    l4ExplicitBusinessGateCount: V1475_EXPLICIT_BUSINESS_GATE_TEMPLATES.length,
    l4DependencyIntentAudit: {
      referencedNodeCount: dependencyIntentCoverage.referencedNodeCount,
      auditedReferenceCount: dependencyIntentCoverage.auditedReferenceCount,
      acceptedRuntimeEligibleCount: dependencyIntentCoverage.summary.acceptedRuntimeEligibleCount,
      acceptedCandidateOrManualCount: dependencyIntentCoverage.summary.acceptedCandidateOnlyCount
        + dependencyIntentCoverage.summary.acceptedManualConfirmCount,
      rejectedPhysicalMainlineCount: dependencyIntentCoverage.summary.rejectedPhysicalMainlineCount,
    metadataInferredRuntimeEligibleCount: dependencyIntentCoverage.metadataInferredRuntimeEligibleCount,
    explicitGateRuntimeObservedCount: dependencyIntentCoverage.explicitGateRuntimeObservedCount,
    explicitGateRuntimeObservedTemplateCount: dependencyIntentCoverage.explicitGateRuntimeObservedTemplateCodes.length,
    explicitGateRuntimeObservedTemplateCodes: dependencyIntentCoverage.explicitGateRuntimeObservedTemplateCodes,
      explicitGateAcceptanceTimelineObservedCount: acceptanceTimelineExplicitGateObservations.observedCount,
      explicitGateAcceptanceTimelineObservedTemplateCount: acceptanceTimelineExplicitGateObservations.observedTemplateCount,
      explicitGateAcceptanceTimelineObservedTemplateCodes: acceptanceTimelineExplicitGateObservations.observedTemplateCodes,
      explicitGateAcceptanceTimelineObservedDependencyCodes: acceptanceTimelineExplicitGateObservations.observedDependencyCodes,
      explicitGateAcceptanceTimelineObservedDependencies: acceptanceTimelineExplicitGateObservations.observations,
      explicitGateObservedTemplateCount: explicitGateObservedTemplateCodes.length,
      explicitGateObservedTemplateCodes: explicitGateObservedTemplateCodes,
      explicitGateTemplateCount: explicitGateTemplateAudit.templateCount,
      explicitGateTemplateVerifiedCount: explicitGateTemplateAudit.verifiedTemplateCount,
      explicitGateTemplateHardNonZeroLagCount: explicitGateTemplateAudit.hardNonZeroLagTemplateCount,
      explicitGateTemplateMissingCount: explicitGateTemplateAudit.missingTemplateCount,
      explicitGateTemplateMissingCodes: explicitGateTemplateAudit.missingTemplates,
      explicitGateDormantTemplateCount: explicitGateTemplateAudit.dormantTemplateCount,
      explicitGateDormantTemplateCodes: explicitGateTemplateAudit.dormantTemplateCodes,
      highPriorityDormantTemplateCount: explicitGateTemplateAudit.highPriorityDormantTemplateQueue.length,
      highPriorityDormantTemplateCodes: explicitGateTemplateAudit.highPriorityDormantTemplateQueue
        .map((item) => item.templateCode)
        .sort(),
      highPriorityDormantEvidenceGapCount: explicitGateTemplateAudit.highPriorityDormantEvidenceGapAudit.gapCount,
      explicitGateDormantTemplateQueue: explicitGateTemplateAudit.dormantTemplateQueue,
      highPriorityDormantTemplateQueue: explicitGateTemplateAudit.highPriorityDormantTemplateQueue,
      highPriorityDormantEvidenceGapAudit: explicitGateTemplateAudit.highPriorityDormantEvidenceGapAudit,
      dormantTemplatePolicy: explicitGateTemplateAudit.dormantTemplatePolicy,
      runtimeObservedCoveragePolicy: 'Runtime L4 dependencies require explicitBusinessGateTemplate=true; metadata-only references are audited as replay candidates or rejected physical workflow signals instead of being silently trusted.',
      runtimeObservationAudit: {
        status: (
          explicitGateTemplateAudit.missingTemplateCount === 0
          && dependencyIntentCoverage.metadataInferredRuntimeEligibleCount === 0
          && explicitGateTemplateAudit.highPriorityDormantEvidenceGapAudit.gapCount === 0
        )
          ? 'l4_explicit_business_gates_runtime_observed_without_metadata_fallback'
          : 'l4_explicit_business_gates_need_runtime_observation_review',
        backendOnly: true,
        runtimeEligibleExplicitGateCount: dependencyIntentCoverage.summary.acceptedRuntimeEligibleCount,
        explicitGateRuntimeObservedCount: dependencyIntentCoverage.explicitGateRuntimeObservedCount,
        explicitGateRuntimeObservedTemplateCount: dependencyIntentCoverage.explicitGateRuntimeObservedTemplateCodes.length,
        explicitGateAcceptanceTimelineObservedCount: acceptanceTimelineExplicitGateObservations.observedCount,
        explicitGateObservedTemplateCount: explicitGateObservedTemplateCodes.length,
        verifiedExplicitGateTemplateCount: explicitGateTemplateAudit.verifiedTemplateCount,
        dormantExplicitGateTemplateCount: explicitGateTemplateAudit.dormantTemplateCount,
        metadataFallbackRuntimeEligibleCount: dependencyIntentCoverage.metadataInferredRuntimeEligibleCount,
        missingTemplateCount: explicitGateTemplateAudit.missingTemplateCount,
        highPriorityDormantEvidenceGapCount: explicitGateTemplateAudit.highPriorityDormantEvidenceGapAudit.gapCount,
        runtimeObservationReady: (
          explicitGateTemplateAudit.missingTemplateCount === 0
          && dependencyIntentCoverage.metadataInferredRuntimeEligibleCount === 0
          && explicitGateTemplateAudit.highPriorityDormantEvidenceGapAudit.gapCount === 0
        ),
        disposition: 'L4 runtime use is limited to explicit business-gate templates observed through runtime metadata or AcceptanceTimeline rows; dormant templates remain backend governance backlog and metadata fallback remains quarantined.',
      },
      metadataBackValidation: {
        status: 'metadata_inferred_runtime_dependencies_quarantined',
        backendOnly: true,
      metadataInferredRuntimeEligibleCount: dependencyIntentCoverage.metadataInferredRuntimeEligibleCount,
      explicitGateRuntimeObservedCount: dependencyIntentCoverage.explicitGateRuntimeObservedCount,
      explicitGateRuntimeObservedTemplateCount: dependencyIntentCoverage.explicitGateRuntimeObservedTemplateCodes.length,
      explicitGateAcceptanceTimelineObservedCount: acceptanceTimelineExplicitGateObservations.observedCount,
      explicitGateAcceptanceTimelineObservedTemplateCount: acceptanceTimelineExplicitGateObservations.observedTemplateCount,
      explicitGateObservedTemplateCount: explicitGateObservedTemplateCodes.length,
      sampleSize: metadataBackValidationSamples.length,
        replayEvidenceRequired: [
          'project_task_dependency_overrides',
          'actual_start_finish_history',
          'acceptance_or_approval_records',
          'scope_fact_compatibility',
          'user_deleted_or_edited_generated_dependencies',
        ],
        topMetadataInferredRuntimeEligibleSamples: metadataBackValidationSamples,
        queuePolicy: 'metadata-inferred references are not runtime-eligible L4 dependencies; future patterns stay in a backend replay queue until explicit business-gate promotion.',
        promotionPolicy: 'Promote repeated validated metadata patterns into explicit business gate templates only after project replay evidence, manual seed review, and conflict checks; never auto-promote from metadata alone.',
        falsePositiveGuard: 'If replay shows user deletions, scope mismatches, missing acceptance evidence, physical workflow routing, or inconsistent actual ordering, keep the pattern rejected or candidate/manual_confirm instead of granting runtime eligibility.',
      },
    },
    l5ScenarioConstraintTypeCount: new Set(activeScenarioConstraints.map((rule) => rule.constraintType)).size,
    l5ScenarioConstraintRuleCount: activeScenarioConstraints.length,
    l5ScenarioConstraintAudit,
    calibrationBoundary: {
      l3LagPolicy: 'cross_item_workflow carries conservative interface buffers; project facts, acceptance facts, and duration seeds remain final calibration authority',
      l4GatePolicy: 'explicit business gates override generic metadata defaults only for confirmed cross-domain regulatory or handover constraints',
      l5ScenarioPolicy: 'process_constraint adds conditional release gates and confidence routing on existing edges, never creates dependencies and never owns day values',
    },
  }
}

function buildDependencyIntentAuditSample(item: V1475DependencyIntentAuditRecord, node: ChinaTemplateCatalogNode, catalog: ChinaTemplateCatalog) {
  return {
    templateId: catalog.templateId,
    catalogGroup: getCatalogPackType(catalog),
    nodeCode: node.stableCode,
    nodeName: node.name,
    decision: item.decision,
    reasonCode: item.reasonCode,
    confidenceScore: item.confidenceScore,
    confidenceLevel: item.confidenceLevel,
    matchedReferenceField: item.matchedReferenceField,
    referenceGroup: item.referenceGroup,
    fromReferencedCode: item.fromReferencedCode,
    toReferencedCode: item.toReferencedCode,
    relationRole: item.relationRole,
    scopeRule: item.scopeRule,
    autoApplyPolicy: item.autoApplyPolicy,
    auditTrace: item.auditTrace,
  }
}

function buildMetadataInferredBackValidationSample(sample: ReturnType<typeof buildDependencyIntentAuditSample>) {
  return {
    templateId: sample.templateId,
    catalogGroup: sample.catalogGroup,
    nodeCode: sample.nodeCode,
    nodeName: sample.nodeName,
    fromReferencedCode: sample.fromReferencedCode,
    toReferencedCode: sample.toReferencedCode,
    relationRole: sample.relationRole,
    matchedReferenceField: sample.matchedReferenceField,
    referenceGroup: sample.referenceGroup,
    scopeRule: sample.scopeRule,
    autoApplyPolicy: sample.autoApplyPolicy,
    confidenceScore: sample.confidenceScore,
    confidenceLevel: sample.confidenceLevel,
    explicitGateTemplate: false,
    backValidationPolicy: 'project_replay_required_before_manual_or_explicit_template_promotion',
    evidenceJoinKeys: [
      sample.fromReferencedCode,
      sample.toReferencedCode,
      sample.nodeCode,
    ].filter(Boolean),
  }
}

function collectDependencyIntentCoverage(limit = 50) {
  const catalogs: ChinaTemplateCatalog[] = [
    CHINA_GB55032_TEMPLATE_CATALOG,
    ...DOMAIN_WBS_TEMPLATE_CATALOGS,
  ]
  const summary = emptyDependencyIntentCoverageSummary()
  const samples = {
    acceptedRuntimeEligible: [] as ReturnType<typeof buildDependencyIntentAuditSample>[],
    metadataInferredRuntimeEligible: [] as ReturnType<typeof buildDependencyIntentAuditSample>[],
    explicitGateRuntimeObserved: [] as ReturnType<typeof buildDependencyIntentAuditSample>[],
    acceptedCandidateOrManual: [] as ReturnType<typeof buildDependencyIntentAuditSample>[],
    rejectedPhysicalMainline: [] as ReturnType<typeof buildDependencyIntentAuditSample>[],
    rejectedOther: [] as ReturnType<typeof buildDependencyIntentAuditSample>[],
  }
  const byCatalogGroup: Record<string, { referencedNodeCount: number; accepted: number; rejected: number }> = {}
  let referencedNodeCount = 0
  let auditedReferenceCount = 0
  let explicitGateRuntimeObservedCount = 0
  let metadataInferredRuntimeEligibleCount = 0
  const explicitGateRuntimeObservedTemplateCodes = new Set<string>()

  const pushSample = (
    bucket: keyof typeof samples,
    item: V1475DependencyIntentAuditRecord,
    node: ChinaTemplateCatalogNode,
    catalog: ChinaTemplateCatalog,
  ) => {
    if (samples[bucket].length >= limit) return
    samples[bucket].push(buildDependencyIntentAuditSample(item, node, catalog))
  }

  const visit = (catalog: ChinaTemplateCatalog, node: ChinaTemplateCatalogNode) => {
    const metadata = readRecord(node.metadata)
    if (hasDependencyIntentReference(metadata)) {
      const catalogGroup = getCatalogPackType(catalog)
      referencedNodeCount += 1
      const groupBucket = byCatalogGroup[catalogGroup] ?? { referencedNodeCount: 0, accepted: 0, rejected: 0 }
      groupBucket.referencedNodeCount += 1

      const resolution = inspectV1475DependencyIntentTemplates({
        fromCatalogGroup: catalogGroup,
        fromReferencedCode: node.stableCode,
        metadata,
      })
      mergeDependencyIntentSummary(summary, resolution.summary)
      auditedReferenceCount += resolution.audit.length
      groupBucket.accepted += resolution.summary.acceptedCount
      groupBucket.rejected += resolution.summary.rejectedCount
      byCatalogGroup[catalogGroup] = groupBucket

      for (const item of resolution.audit) {
        if (item.decision === 'accepted' && item.autoApplyPolicy === 'confirmed_template_only') {
          const explicitGateTemplateCode = getExplicitBusinessGateTemplateCode(item)
          if (explicitGateTemplateCode) {
            explicitGateRuntimeObservedCount += 1
            explicitGateRuntimeObservedTemplateCodes.add(explicitGateTemplateCode)
            pushSample('explicitGateRuntimeObserved', item, node, catalog)
          } else {
            metadataInferredRuntimeEligibleCount += 1
            pushSample('metadataInferredRuntimeEligible', item, node, catalog)
          }
        }
        if (item.decision === 'accepted' && item.autoApplyPolicy === 'confirmed_template_only') {
          pushSample('acceptedRuntimeEligible', item, node, catalog)
        } else if (item.decision === 'accepted') {
          pushSample('acceptedCandidateOrManual', item, node, catalog)
        } else if (item.reasonCode === 'rejected_physical_construction_mainline') {
          pushSample('rejectedPhysicalMainline', item, node, catalog)
        } else {
          pushSample('rejectedOther', item, node, catalog)
        }
      }
    }
    for (const child of node.children ?? []) visit(catalog, child)
  }

  for (const catalog of catalogs) {
    for (const node of catalog.divisions) visit(catalog, node)
  }

  summary.confidenceScoreAverage = auditedReferenceCount > 0
    ? Math.round((summary.confidenceScoreTotal / auditedReferenceCount) * 10) / 10
    : 0

  return {
    scope: 'dependency_intent_template_business_constraint_coverage',
    backendOnly: true,
    coveragePolicy: {
      mode: 'cross_business_domain_constraints_only',
      noOrdinaryFrontendExposure: true,
      physicalConstructionMainlineRoutedToStandardInternalOrCrossItemWorkflow: true,
      confirmedTemplateOnlyMayGenerateDependenciesAfterScopeCompatibilityCheck: true,
      candidateAndManualConfirmAreGovernanceOnly: true,
      documentCommercialDefaultsCandidateOnly: true,
      siteManagementDefaultsManualConfirm: true,
      metadataScopeOverrideSupported: true,
      explicitTaskDependenciesWin: true,
      defaultProjectWideScopeAllowed: false,
    },
    referencedNodeCount,
    auditedReferenceCount,
    explicitGateRuntimeObservedCount,
    explicitGateRuntimeObservedTemplateCodes: Array.from(explicitGateRuntimeObservedTemplateCodes).sort(),
    metadataInferredRuntimeEligibleCount,
    byCatalogGroup,
    summary,
    samples,
  }
}

export function collectConstructionDependencyRuleSystemReport(limit = 50) {
  const internalFlowReport = collectStandardInternalFlowGovernanceReport(limit)
  const workflowDictionaryCount = getActiveSeedCount('workflow_dictionary')
  const crossItemWorkflowCount = getActiveSeedCount('cross_item_workflow')
  const processConstraintCount = getActiveSeedCount('process_constraint')
  const crossItemWorkflowCoverage = collectCrossItemWorkflowCoverage()
  const processConstraintCoverage = collectProcessConstraintCoverage(limit)
  const dependencyIntentCoverage = collectDependencyIntentCoverage(limit)
  const trustHardening = collectDependencyTrustHardeningMetrics(
    internalFlowReport,
    dependencyIntentCoverage,
    processConstraintCoverage,
  )

  const runtimeMetrics = {
    workflow_dictionary: {
      activeRuleCount: workflowDictionaryCount,
      registryBacked: workflowDictionaryCount > 0,
      runtimeDecisionSource: false,
      governanceOnly: true,
    },
    standard_internal_flow: {
      curatedRuleCount: internalFlowReport.summary.curated,
      reviewRequiredRuleCount: internalFlowReport.summary.reviewRequired,
      stableCodeBackfillCount: internalFlowReport.summary.stableCodeBackfillCount,
      createsDependencyCount: internalFlowReport.summary.createsDependency,
      rawCreatesDependencyCount: internalFlowReport.summary.rawCreatesDependency,
      effectiveCreatesDependencyCount: internalFlowReport.summary.effectiveCreatesDependency,
      dependencySkippedByDurationContributionModeCount: internalFlowReport.summary.dependencySkippedByDurationContributionMode,
    },
    cross_item_workflow: {
      activeRuleCount: crossItemWorkflowCount,
      registryBacked: crossItemWorkflowCount > 0,
      runtimeSource: 'cross_item_workflow predecessorDependencies',
      coverage: crossItemWorkflowCoverage.summary,
      p1EnhancementRuleCount: crossItemWorkflowCoverage.summary.p1EnhancementRuleCount,
      confirmedTemplateOnlyCount: crossItemWorkflowCoverage.summary.confirmedTemplateOnlyCount,
      manualConfirmCount: crossItemWorkflowCoverage.summary.manualConfirmCount,
      candidateOnlyCount: crossItemWorkflowCoverage.summary.candidateOnlyCount,
      zeroMatchRuleCount: crossItemWorkflowCoverage.summary.zeroMatchRuleCount,
      noLagOrDurationAuthority: true,
      noOrdinaryFrontendExposure: true,
    },
    dependency_intent_template: {
      referenceFieldCount: DEPENDENCY_INTENT_REFERENCE_FIELDS.length,
      referenceFields: DEPENDENCY_INTENT_REFERENCE_FIELDS.map((item) => item.field),
      generatorBacked: true,
      scopeRuleBacked: true,
      supportedScopeRules: V1475_DEPENDENCY_INTENT_SCOPE_RULES,
      defaultProjectWideScopeAllowed: false,
      businessRelationshipFirst: true,
      constructionMainlineRoutedToCrossItemWorkflow: true,
      candidateAndManualCoverageBacked: true,
      metadataScopeOverrideSupported: true,
      documentCommercialDefaultsCandidateOnly: true,
      siteManagementDefaultsManualConfirm: true,
      referencedNodeCount: dependencyIntentCoverage.referencedNodeCount,
      auditedReferenceCount: dependencyIntentCoverage.auditedReferenceCount,
      acceptedCount: dependencyIntentCoverage.summary.acceptedCount,
      rejectedCount: dependencyIntentCoverage.summary.rejectedCount,
      acceptedRuntimeEligibleCount: dependencyIntentCoverage.summary.acceptedRuntimeEligibleCount,
      acceptedCandidateOnlyCount: dependencyIntentCoverage.summary.acceptedCandidateOnlyCount,
      acceptedManualConfirmCount: dependencyIntentCoverage.summary.acceptedManualConfirmCount,
      rejectedPhysicalMainlineCount: dependencyIntentCoverage.summary.rejectedPhysicalMainlineCount,
      confidenceScoreAverage: dependencyIntentCoverage.summary.confidenceScoreAverage,
      byConfidenceLevel: dependencyIntentCoverage.summary.byConfidenceLevel,
    },
    process_constraint: {
      activeRuleCount: processConstraintCount,
      registryBacked: processConstraintCount > 0,
      coverage: processConstraintCoverage.summary,
      generationChainGate: processConstraintCoverage.generationChainGate,
      l5ProcessConstraintPrecisionAudit: trustHardening.l5ScenarioConstraintAudit.l5ProcessConstraintPrecisionAudit,
      backValidationCandidateEligibleEdgeCount: processConstraintCoverage.summary.backValidationCandidateEligibleEdgeCount,
      keywordFallbackMatchedEdgeCount: processConstraintCoverage.summary.keywordFallbackMatchedEdgeCount,
      unmatchedExistingRelationEdgeCount: processConstraintCoverage.summary.unmatchedExistingRelationEdgeCount,
    },
  }
  const closeoutLayerReadiness = {
    workflow_sequence_dictionary: {
      ready: runtimeMetrics.workflow_dictionary.registryBacked
        && runtimeMetrics.workflow_dictionary.governanceOnly
        && runtimeMetrics.workflow_dictionary.runtimeDecisionSource === false,
      runtimeDecisionSource: runtimeMetrics.workflow_dictionary.runtimeDecisionSource,
      governanceOnly: runtimeMetrics.workflow_dictionary.governanceOnly,
    },
    same_parent_internal_flow: {
      ready: runtimeMetrics.standard_internal_flow.curatedRuleCount > 5000
        && runtimeMetrics.standard_internal_flow.effectiveCreatesDependencyCount > 0
        && internalFlowReport.executionBaselineGate.runtimeImpactStatus === 'runtime_impact_ready',
      curatedRuleCount: runtimeMetrics.standard_internal_flow.curatedRuleCount,
      effectiveCreatesDependencyCount: runtimeMetrics.standard_internal_flow.effectiveCreatesDependencyCount,
      executionBaselineStatus: internalFlowReport.executionBaselineGate.status,
      runtimeImpactStatus: internalFlowReport.executionBaselineGate.runtimeImpactStatus,
      coverageSprintStatus: internalFlowReport.executionBaselineGate.coverageSprintStatus,
    },
    cross_item_workflow: {
      ready: runtimeMetrics.cross_item_workflow.registryBacked
        && runtimeMetrics.cross_item_workflow.zeroMatchRuleCount === 0
        && runtimeMetrics.cross_item_workflow.confirmedTemplateOnlyCount > 30,
      zeroMatchRuleCount: runtimeMetrics.cross_item_workflow.zeroMatchRuleCount,
      confirmedTemplateOnlyCount: runtimeMetrics.cross_item_workflow.confirmedTemplateOnlyCount,
      manualConfirmCount: runtimeMetrics.cross_item_workflow.manualConfirmCount,
    },
    cross_business_domain_dependency_intent: {
      ready: runtimeMetrics.dependency_intent_template.generatorBacked
        && runtimeMetrics.dependency_intent_template.scopeRuleBacked
        && runtimeMetrics.dependency_intent_template.defaultProjectWideScopeAllowed === false
        && runtimeMetrics.dependency_intent_template.acceptedRuntimeEligibleCount > 0
        && runtimeMetrics.dependency_intent_template.rejectedPhysicalMainlineCount > 0,
      acceptedRuntimeEligibleCount: runtimeMetrics.dependency_intent_template.acceptedRuntimeEligibleCount,
      rejectedPhysicalMainlineCount: runtimeMetrics.dependency_intent_template.rejectedPhysicalMainlineCount,
      defaultProjectWideScopeAllowed: runtimeMetrics.dependency_intent_template.defaultProjectWideScopeAllowed,
    },
    process_constraint: {
      ready: runtimeMetrics.process_constraint.registryBacked
        && runtimeMetrics.process_constraint.generationChainGate.status === 'process_constraint_generation_chain_ready'
        && runtimeMetrics.process_constraint.keywordFallbackMatchedEdgeCount === 0
        && runtimeMetrics.process_constraint.l5ProcessConstraintPrecisionAudit.ready,
      generationChainStatus: runtimeMetrics.process_constraint.generationChainGate.status,
      keywordFallbackMatchedEdgeCount: runtimeMetrics.process_constraint.keywordFallbackMatchedEdgeCount,
      backValidationCandidateEligibleEdgeCount: runtimeMetrics.process_constraint.backValidationCandidateEligibleEdgeCount,
      l5PrecisionStatus: runtimeMetrics.process_constraint.l5ProcessConstraintPrecisionAudit.status,
      l5PrecisionBlockingIssueCount: runtimeMetrics.process_constraint.l5ProcessConstraintPrecisionAudit.blockingIssueCount,
    },
  }
  const closeoutRisks = [
    !closeoutLayerReadiness.workflow_sequence_dictionary.ready
      ? 'workflow_dictionary_must_remain_governance_only_and_registry_backed'
      : null,
    !closeoutLayerReadiness.same_parent_internal_flow.ready
      ? 'standard_internal_flow_execution_baseline_gate_not_ready'
      : null,
    !closeoutLayerReadiness.cross_item_workflow.ready
      ? 'cross_item_workflow_zero_match_or_runtime_rule_depth_needs_review'
      : null,
    !closeoutLayerReadiness.cross_business_domain_dependency_intent.ready
      ? 'dependency_intent_scope_or_physical_mainline_routing_needs_review'
      : null,
    !closeoutLayerReadiness.process_constraint.ready
      ? 'process_constraint_generation_chain_gate_not_ready'
      : null,
  ].filter(Boolean) as string[]
  const dependencySystemRuntimeReady = closeoutRisks.length === 0
  const governanceCoverageStatus = internalFlowReport.executionBaselineGate.coverageSprintStatus
  const scheduleTrustCoverageStatus = internalFlowReport.executionBaselineGate.scheduleTrustCoverageStatus
  const allDependencyGovernanceComplete = dependencySystemRuntimeReady
    && governanceCoverageStatus === 'coverage_sprint_closed'
  const statusMeaning = dependencySystemRuntimeReady
    ? allDependencyGovernanceComplete
      ? 'Runtime scheduling dependency generation is ready and dependency governance coverage is closed.'
      : 'Runtime scheduling dependency generation is ready; schedule trust may already be closed even when raw governance backlog remains, and the exact boundary must be read from scheduleTrustCoverageStatus and nonBlockingGovernanceBacklog.'
    : 'Runtime scheduling dependency generation still has blocking P1 risks; inspect remainingP1Risks before enabling closeout.'
  const dependencySystemCloseout = {
    status: dependencySystemRuntimeReady
      ? 'dependency_rule_system_closeout_ready'
      : 'needs_attention',
    runtimeCloseoutStatus: dependencySystemRuntimeReady
      ? 'runtime_dependency_generation_ready'
      : 'runtime_dependency_generation_needs_attention',
    scheduleTrustCoverageStatus,
    governanceCoverageStatus,
    allDependencyGovernanceComplete,
    statusMeaning,
    backendOnly: true,
    ordinaryFrontendExposureBlocked: true,
    layerReadiness: closeoutLayerReadiness,
    trustHardening,
    generationSourceOrder: [
      'sibling_sequence',
      'cross_item_workflow',
      'dependency_intent_template',
    ],
    runtimeBoundaries: {
      workflowDictionaryRuntimeDisabled: runtimeMetrics.workflow_dictionary.runtimeDecisionSource === false,
      workflowDictionaryOnlyProducesGovernanceEvidence: true,
      sameParentInternalFlowOwnsLocalSiblingSequence: true,
      crossItemWorkflowOwnsPackageMainlineDependencies: true,
      dependencyIntentTemplatesOwnCrossBusinessDomainConstraints: true,
      dependencyIntentTemplatesRejectPhysicalMainline: runtimeMetrics.dependency_intent_template.rejectedPhysicalMainlineCount > 0,
      processConstraintCreatesDependency: false,
      processConstraintStoresDayValues: false,
      processConstraintRequiresExistingRelation: true,
      explicitTaskDependenciesWin: true,
      generatedDependenciesDoNotOverwriteActiveTaskDependencies: true,
      candidateOrManualConfirmRulesCreateRuntimeDependencies: false,
    },
    qualityGates: {
      crossItemZeroMatchRuleCount: runtimeMetrics.cross_item_workflow.zeroMatchRuleCount,
      dependencyIntentPhysicalMainlineRejectedCount: runtimeMetrics.dependency_intent_template.rejectedPhysicalMainlineCount,
      processConstraintKeywordFallbackMatchedEdgeCount: runtimeMetrics.process_constraint.keywordFallbackMatchedEdgeCount,
      processConstraintGenerationChainStatus: runtimeMetrics.process_constraint.generationChainGate.status,
    },
    nonBlockingGovernanceBacklog: {
      same_parent_internal_flow: {
        status: internalFlowReport.executionBaselineGate.coverageSprintStatus,
        scheduleTrustCoverageStatus: internalFlowReport.executionBaselineGate.scheduleTrustCoverageStatus,
        currentCuratedCoverageRatio: internalFlowReport.executionBaselineGate.currentCuratedCoverageRatio,
        minimumCuratedCoverageRatio: internalFlowReport.executionBaselineGate.minimumCuratedCoverageRatio,
        reviewRequiredRuleCount: internalFlowReport.summary.reviewRequired,
        runtimeBlockingReviewRequiredRuleCount: internalFlowReport.executionBaselineGate.runtimeBlockingReviewRequiredRuleCount,
        reviewTailCreatesDependencyCount: internalFlowReport.executionBaselineGate.reviewTailCreatesDependencyCount,
        reviewTailEffectiveCreatesDependencyCount: internalFlowReport.executionBaselineGate.reviewTailEffectiveCreatesDependencyCount,
        promotionEligibleTailCount: internalFlowReport.executionBaselineGate.promotionEligibleTailCount,
        actionableL2SeedDepthCandidateCount: internalFlowReport.executionBaselineGate.actionableL2SeedDepthCandidateCount,
        policy: internalFlowReport.executionBaselineGate.coverageSprintPolicy,
      },
    },
    remainingP1Risks: closeoutRisks,
  }

  return {
    systemCode: CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_CODE,
    systemName: '工程任务工序依赖与约束规则体系',
    version: CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_VERSION,
    purpose: '统一五类规则，把标准工序识别收口为默认依赖、开工约束、搭接 / 来源路由影响和业务化解释。',
    layers: CONSTRUCTION_DEPENDENCY_RULE_SYSTEM_LAYERS,
    executionChain: [
      'workflow_dictionary ֻں̨ǨƽƸǣڼ㡣',
      '先由 standard_internal_flow 生成同父级本地顺序，再由 cross_item_workflow 生成跨分项 / 跨施工包施工主线依赖。',
      '只有 confirmed_template_only 的 cross_item_workflow 规则可生成跨施工包默认依赖。',
      '同父级内部顺序和实体施工 workflow / prerequisite 主线交接必须先路由到 standard_internal_flow / cross_item_workflow；只有跨业务域约束才能进入 dependencyIntentTemplates。',
      'dependencyIntentTemplates 必须先推断业务范围，只在 scope 兼容且 autoApplyPolicy=confirmed_template_only 时生成默认依赖。',
      'process_constraint 只作为既有边的开工条件、搭接、工期来源路由或置信度影响，不把每条约束都转成 task_dependencies。',
      '用户显式 task_dependencies 和当前项目事实始终优先于所有生成规则。',
    ],
    dependencyPrecedence: [
      '人工显式 task_dependencies',
      '当前 active 项目 task_dependencies 执行事实',
      'template_internal_flow 生成默认关系',
      'template_cross_item_workflow 生成默认关系',
      'template_dependency_intent 生成默认关系',
      'algorithm candidates 与 review_required 信号',
    ],
    governancePolicy: {
      ordinaryFrontendExposesSeedNames: false,
      sameParentInternalFlowOwnedByStandardInternalFlow: true,
      crossItemWorkflowOwnsPackageLevelMainlineDependencies: true,
      crossBusinessDomainDependencyOwnedByDependencyIntentTemplates: true,
      dependencyIntentTemplatesInferScopeRule: true,
      dependencyIntentTemplatesDoNotDefaultEveryLinkToProjectWide: true,
      dependencyIntentTemplatesSkipPhysicalWorkflowReferences: true,
      processConstraintsDoNotAllBecomeTaskDependencies: true,
      explicitTaskDependenciesWin: true,
      generatedDependenciesDoNotOverwriteActiveTaskDependencies: true,
      internalFlowCandidatesAutoPublish: false,
      candidateRulesCreateRuntimeDependencies: false,
      maturityUpgradeBeforeScopeExpansion: true,
      sameParentHardSequenceMustBeExplicit: true,
      backendOnlyManualConfirmationInterfaceReserved: true,
      processConstraintOwnsEdgeTimingOnly: true,
      processConstraintSkipsExplicitCarrierProcessDuration: true,
      processConstraintRequiresExistingRelation: true,
      processConstraintStoresNoDayValues: true,
      standardWorkDurationOwnsAllDayValues: true,
      parallelAllowedIsRelationshipDecisionNotOverlap: true,
      workflowDictionaryRuntimeDisabled: true,
      workflowDictionaryOnlyProducesGovernanceEvidence: true,
    },
    sameParentInternalFlowGovernance: {
      executionBaselineGate: internalFlowReport.executionBaselineGate,
      backValidationClosedLoopStatus: 'backend_candidate_discovery_ready_manual_promotion_reserved',
      noOrdinaryFrontendConfirmationUi: true,
      candidateDiscoverySource: 'duration_experience_samples.metadata.standard_internal_flow',
      hardRulePromotionPolicy: 'hard_sequence_and_acceptance_gate_require_curated_seed_promotion',
      lowRiskAutoPromotionPolicy: 'soft_sequence_or_parallel_allowed_can_be_auto_promoted_only_when_low_impact_and_high_confidence',
      businessCaliber: '真实执行样本只能形成候选证据；只有人工整理成 curated hard_sequence / acceptance_gate 后，才允许影响默认依赖。',
      releaseGovernance: internalFlowReport.releaseImpactPreview,
      backValidationWorkflow: internalFlowReport.backValidationWorkflow,
    },
    dependencyIntentCoverage,
    processConstraintCoverage,
    processConstraintBackValidation: {
      backendOnly: true,
      source: 'duration_experience_samples.process_constraint_observation',
      candidateOutput: 'algorithm_seed_candidates.seed_type=process_constraint',
      candidateLifecycle: 'candidate_only_from_execution_history',
      cadence: 'scheduled_or_after_new_samples_month_close_project_closeout',
      automaticSteps: [
        'sample_generated_process_constraint_observation',
        'compare_execution_history_and_release_threshold_facts',
        'rank_candidate_overlap_gate_source_routing_patterns',
        'write_candidate_only_or_quarantine_with_evidence_refs',
        'surface_in_backend_governance_report',
      ],
      manualConfirmationScope: [
        'edge_overlap',
        'gate_wait',
        'conditional_effect',
        'quantity_release_policy',
      ],
      autoPublishAllowedFor: [],
      autoPublishForbiddenFor: [
        'edge_overlap',
        'gate_wait',
        'explicit_task_dependency',
        'runtime_dependency_mutation',
      ],
      queueSummary: {
        candidateEligibleEdgeCount: processConstraintCoverage.summary.backValidationCandidateEligibleEdgeCount,
        keywordFallbackMatchedEdgeCount: processConstraintCoverage.summary.keywordFallbackMatchedEdgeCount,
        unmatchedExistingRelationEdgeCount: processConstraintCoverage.summary.unmatchedExistingRelationEdgeCount,
        l2OwnedSameParentExcludedEdgeCount: processConstraintCoverage.summary.l2OwnedSameParentExcludedEdgeCount,
        l3ConfirmedParentCarrierExcludedEdgeCount: processConstraintCoverage.summary.l3ConfirmedParentCarrierExcludedEdgeCount,
        l3RecommendedAdviceExcludedEdgeCount: processConstraintCoverage.summary.l3RecommendedAdviceExcludedEdgeCount,
        l4FormalAcceptanceBoundaryExcludedEdgeCount: processConstraintCoverage.summary.l4FormalAcceptanceBoundaryExcludedEdgeCount,
        broadOrFalseParentCarrierExcludedEdgeCount: processConstraintCoverage.summary.broadOrFalseParentCarrierExcludedEdgeCount,
        outOfScopeInfrastructureExcludedEdgeCount: processConstraintCoverage.summary.outOfScopeInfrastructureExcludedEdgeCount,
        outOfScopeInfrastructureCatalogIdCounts: processConstraintCoverage.summary.outOfScopeInfrastructureCatalogIdCounts,
        selectiveCoverageRatio: processConstraintCoverage.summary.selectiveCoverageRatio,
        generatedDependencyMatchedRatio: processConstraintCoverage.summary.generatedDependencyMatchedRatio,
        scopeBoundaryPolicy: 'Building engineering L5 back-validation backlog excludes standalone infrastructure mainlines such as bridge, airport, port, renewable-energy, and utility-tunnel domains; out-of-scope edges are reported separately and must not promote building-project process-constraint coverage.',
      },
      automaticGovernanceBoundary: {
        autoDiscover: true,
        autoScore: true,
        autoGroup: true,
        autoGenerateGovernanceSuggestion: true,
        autoPublishRuntimeRule: false,
        curatedSeedPromotionRequired: true,
        ordinaryFrontendExposure: false,
      },
      topCandidateEligiblePairs: processConstraintCoverage.topBackValidationCandidatePairs,
      topKeywordFallbackPairs: processConstraintCoverage.topKeywordFallbackPairs,
      topOutOfScopeInfrastructureEdges: processConstraintCoverage.topOutOfScopeInfrastructureEdges,
      topUnmatchedExistingRelationEdges: processConstraintCoverage.topUnmatchedExistingRelationEdges,
    },
    dependencySystemCloseout,
    runtimeMetrics,
    crossItemWorkflowCoverage,
    internalFlowGovernance: internalFlowReport,
  }
}
