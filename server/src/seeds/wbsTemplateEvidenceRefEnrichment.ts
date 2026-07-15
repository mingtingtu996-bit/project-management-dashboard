export type WbsTemplateEvidenceRef = {
  code: string
  level: 'standard' | 'clause' | 'process' | 'enterprise_method' | 'execution_history'
  ref?: string
  rationale?: string
}

export const WBS_TEMPLATE_NODE_EVIDENCE_REF_OVERRIDES: Record<string, WbsTemplateEvidenceRef[]> = {
  'DANGER-01-01-01-P04': [
    {
      code: 'MOHURD-37-2018',
      level: 'clause',
      ref: 'deep_foundation_pit_expert_review_closeout',
      rationale: 'Deep foundation pit expert review nodes need exact dangerous-subproject evidence, not only keyword-inferred evidence.',
    },
  ],
  'DANGER-01-01-02-P04': [
    {
      code: 'MOHURD-37-2018',
      level: 'clause',
      ref: 'high_formwork_expert_review_closeout',
      rationale: 'High formwork expert review is a high-risk mandatory control checkpoint.',
    },
  ],
  'DANGER-01-01-03-P08': [
    {
      code: 'MOHURD-37-2018',
      level: 'clause',
      ref: 'lifting_and_tower_crane_acceptance_archive',
      rationale: 'Lifting and tower-crane acceptance must retain equipment, acceptance, and archive evidence.',
    },
  ],
  'DANGER-01-01-06-P06': [
    {
      code: 'JGJ46',
      level: 'clause',
      ref: 'temporary_power_stage_acceptance_and_tagging',
      rationale: 'Temporary power acceptance should be governed as a safety acceptance node.',
    },
  ],
  'DANGER-01-01-09-P06': [
    {
      code: 'MOHURD-37-2018',
      level: 'clause',
      ref: 'manual_dug_pile_monitoring_patrol_record',
      rationale: 'Manual-dug pile process monitoring needs exact safety evidence due to ventilation and gas-detection risk.',
    },
  ],
  'QR-01-01-03-P04': [
    {
      code: 'GB50300-2013',
      level: 'clause',
      ref: 'witness_sampling_report_closeout',
      rationale: 'Witness sampling report closeout is a quality responsibility evidence endpoint.',
    },
  ],
  'FAC-02-01-02-P07': [
    {
      code: 'GB/T21086',
      level: 'clause',
      ref: 'curtain_wall_performance_test_report_review',
      rationale: 'Curtain wall performance testing needs exact third-party test evidence.',
    },
  ],
  'FIR-05-01-02-P07': [
    {
      code: 'GB55036',
      level: 'clause',
      ref: 'fire_acceptance_filing_document_correction',
      rationale: 'Fire acceptance filing correction must be tied to fire-system acceptance evidence.',
    },
  ],
  'WPI-01-01-01-P02': [
    {
      code: 'GB50208-2011',
      level: 'clause',
      ref: 'basement_waterproof_material_retest',
      rationale: 'Basement waterproof material retest is an exact waterproof quality control evidence point.',
    },
  ],
  'PFB-01-01-01-P02': [
    {
      code: 'GB/T51231',
      level: 'clause',
      ref: 'prefabricated_component_appearance_dimension_document_acceptance',
      rationale: 'Prefabricated component arrival acceptance must bind appearance, dimension, and document evidence.',
    },
  ],
  'CLN-01-01-01-P02': [
    {
      code: 'GB50591',
      level: 'clause',
      ref: 'cleanroom_floor_self_leveling_epoxy_quality_control',
      rationale: 'Cleanroom floor execution requires exact cleanroom quality and environmental evidence.',
    },
  ],
  'STL-01-01-02-P07': [
    {
      code: 'GB50205-2020',
      level: 'clause',
      ref: 'steel_weld_ndt_commission_and_report_review',
      rationale: 'Steel weld NDT report review is a high-confidence steel specialty evidence point.',
    },
  ],
  'ELE-01-01-01-P08': [
    {
      code: 'GB50303',
      level: 'clause',
      ref: 'formal_power_operation_ticket_and_receiving_record',
      rationale: 'Formal power receiving must retain operation-ticket and receiving records.',
    },
  ],
  'HVA-01-01-01-P07': [
    {
      code: 'GB50243',
      level: 'clause',
      ref: 'duct_leakage_and_light_leakage_test',
      rationale: 'Duct leakage and light-leakage testing needs exact HVAC system evidence.',
    },
  ],
  'CDF-01-01-02-P06': [
    {
      code: 'GB50134',
      level: 'clause',
      ref: 'civil_defense_door_tightness_and_opening_force_test',
      rationale: 'Civil-defense protective equipment tests require exact civil-defense acceptance evidence.',
    },
  ],
  '01-02-03-P07': [
    {
      code: 'GB50496',
      level: 'clause',
      ref: 'mass_concrete_temperature_monitoring_and_delta_control',
      rationale: 'Mass concrete temperature monitoring must retain exact temperature-control evidence.',
    },
  ],
  '02-01-03-P10': [
    {
      code: 'GB50496',
      level: 'clause',
      ref: 'superstructure_mass_concrete_temperature_monitoring',
      rationale: 'Mass concrete temperature monitoring is a quality-control and monitoring checkpoint.',
    },
  ],
  'BDT-04-01-02-P01': [
    {
      code: 'GB50204',
      level: 'clause',
      ref: 'prestress_plan_and_tension_sequence_confirmation',
      rationale: 'Prestress tension sequence must be governed with exact technical-plan evidence.',
    },
  ],
  'BDT-04-01-02-P04': [
    {
      code: 'GB50204',
      level: 'clause',
      ref: 'prestress_tendon_threading_and_anchor_installation',
      rationale: 'Prestress tendon installation and anchorage are exact process quality evidence points.',
    },
  ],
  'FND-02-01-01-P04': [
    {
      code: 'JGJ120',
      level: 'clause',
      ref: 'foundation_pit_crown_beam_waist_beam_shotcrete_anchor_execution',
      rationale: 'Foundation pit shotcrete and anchor support should retain exact support-system evidence.',
    },
  ],
  '01-03-09-P08': [
    {
      code: 'JGJ120',
      level: 'clause',
      ref: 'anchor_force_and_displacement_monitoring',
      rationale: 'Anchor force and displacement monitoring is an exact foundation-pit monitoring checkpoint.',
    },
  ],
  'BDT-02-01-01-P08': [
    {
      code: 'GB50209',
      level: 'clause',
      ref: 'industrial_floor_flatness_load_and_logistics_route_acceptance',
      rationale: 'Industrial floor flatness, load, and logistics route acceptance need exact floor evidence.',
    },
  ],
  'HVA-03-01-01-P04': [
    {
      code: 'GB50981',
      level: 'clause',
      ref: 'integrated_and_seismic_support_installation_acceptance',
      rationale: 'Integrated and seismic support installation should retain exact MEP support evidence.',
    },
  ],
  'MEP-01-01-01-P06': [
    {
      code: 'GB50981',
      level: 'process',
      ref: 'integrated_support_precondition_confirmation',
      rationale: 'Integrated support preconditions are a cross-discipline interface control point.',
    },
  ],
  '07-07-01-P09': [
    {
      code: 'GB50303',
      level: 'clause',
      ref: 'lightning_grounding_acceptance',
      rationale: 'Lightning grounding acceptance must retain exact electrical acceptance evidence.',
    },
  ],
  '07-07-02-P09': [
    {
      code: 'GB50303',
      level: 'clause',
      ref: 'lightning_protection_acceptance',
      rationale: 'Lightning protection acceptance is a dedicated electrical evidence checkpoint.',
    },
  ],
  '04-03-01-P08': [
    {
      code: 'GB50207',
      level: 'clause',
      ref: 'roof_membrane_water_spray_or_impoundment_test',
      rationale: 'Roof waterproofing water testing should retain exact waterproof acceptance evidence.',
    },
  ],
  '01-07-02-P06': [
    {
      code: 'GB50208-2011',
      level: 'clause',
      ref: 'basement_detail_waterproof_water_spray_or_impoundment_test',
      rationale: 'Basement waterproof detail tests are exact hidden-quality and leakage-risk evidence points.',
    },
  ],
  'SITE-01-01-06-P05': [
    {
      code: 'JGJ46',
      level: 'clause',
      ref: 'temporary_power_acceptance_tagging_and_patrol_archive',
      rationale: 'Temporary power acceptance and tagging should carry exact site-safety evidence, not only generic site-management evidence.',
    },
  ],
  'OUT-05-01-01-P02': [
    {
      code: 'GB50268',
      level: 'clause',
      ref: 'external_utility_connection_condition_acceptance',
      rationale: 'Formal utility connection conditions are external-interface gates that need exact handover evidence.',
    },
  ],
  'BDT-03-01-01-P02': [
    {
      code: 'JGJ147',
      level: 'clause',
      ref: 'renovation_demolition_isolation_temporary_support_unloading',
      rationale: 'Existing-building renovation and demolition isolation must retain exact safety and temporary-support evidence.',
    },
  ],
  'DANGER-01-01-08-P04': [
    {
      code: 'MOHURD-37-2018',
      level: 'clause',
      ref: 'demolition_expert_review_and_opinion_closeout',
      rationale: 'Demolition expert review is a mandatory dangerous-subproject checkpoint when trigger conditions are met.',
    },
  ],
  'FIR-04-02-01-P06': [
    {
      code: 'GB55037',
      level: 'clause',
      ref: 'gas_extinguishing_linkage_retest_and_cylinder_room_handover',
      rationale: 'Gas extinguishing linkage and cylinder-room handover need exact fire-system acceptance evidence.',
    },
  ],
  'FIR-05-01-01-P06': [
    {
      code: 'GB55037',
      level: 'clause',
      ref: 'fire_detection_report_handover_confirmation',
      rationale: 'Fire detection report handover should be distinguishable from ordinary document archive nodes.',
    },
  ],
  'ELV-02-01-02-P07': [
    {
      code: 'TSG T7001',
      level: 'clause',
      ref: 'elevator_supervision_inspection_registration_archive',
      rationale: 'Elevator use registration handover must retain supervision-inspection and registration evidence.',
    },
  ],
  'INT-04-01-01-P08': [
    {
      code: 'GB50174',
      level: 'clause',
      ref: 'data_center_core_room_trial_operation_handover',
      rationale: 'Data-center core room trial operation and handover need exact data-center facility evidence.',
    },
  ],
  'HVA-02-01-02-P06': [
    {
      code: 'GB50738',
      level: 'clause',
      ref: 'hvac_system_commissioning_report_handover',
      rationale: 'HVAC balancing and commissioning reports are acceptance-linked handover evidence, not generic HVAC evidence.',
    },
  ],
  'HVA-05-01-01-P08': [
    {
      code: 'GB50738',
      level: 'clause',
      ref: 'multi_energy_seasonal_mode_switching_operation_handover',
      rationale: 'Complex energy systems need exact seasonal operating-condition switching and handover evidence.',
    },
  ],
  'PLU-06-01-01-P07': [
    {
      code: 'CJJ94',
      level: 'clause',
      ref: 'gas_commissioning_acceptance_and_safety_handover',
      rationale: 'Gas commissioning acceptance is a safety-sensitive handover gate that needs exact gas-system evidence.',
    },
  ],
  'ELE-04-01-01-P08': [
    {
      code: 'GB50303',
      level: 'clause',
      ref: 'emergency_power_acceptance_operation_handover',
      rationale: 'Emergency power acceptance and operation handover should carry exact electrical-system evidence.',
    },
  ],
  'ELE-05-01-01-P07': [
    {
      code: 'GB50303',
      level: 'clause',
      ref: 'formal_power_energization_load_trial_operation',
      rationale: 'Formal power energization and load trial operation need exact electrical acceptance and operation evidence.',
    },
  ],
  'PFB-02-01-01-P06': [
    {
      code: 'JGJ1',
      level: 'clause',
      ref: 'grouting_sleeve_joint_retest_hidden_acceptance',
      rationale: 'Prefab grouting-sleeve joint retest and hidden acceptance are high-risk exact prefab evidence points.',
    },
  ],
  'PFB-02-01-02-P06': [
    {
      code: 'GB50204',
      level: 'clause',
      ref: 'prefabricated_structure_special_acceptance_handover',
      rationale: 'Prefab structure special acceptance handover needs exact structure-acceptance evidence.',
    },
  ],
  'CLN-02-01-02-P06': [
    {
      code: 'GB50591',
      level: 'clause',
      ref: 'cleanroom_third_party_validation_operation_handover',
      rationale: 'Cleanroom validation handover should bind third-party validation and operation evidence.',
    },
  ],
  'CDF-02-01-02-P05': [
    {
      code: 'RFJ01',
      level: 'clause',
      ref: 'civil_defense_acceptance_opinion_rectification_closeout',
      rationale: 'Civil-defense acceptance opinion and rectification closeout need exact civil-defense evidence.',
    },
  ],
}

function includesAny(text: string, terms: string[]) {
  const normalized = text.toLowerCase()
  return terms.some((term) => normalized.includes(term.toLowerCase()))
}

function mergeEvidenceRefs(refs: WbsTemplateEvidenceRef[]) {
  const seen = new Set<string>()
  const result: WbsTemplateEvidenceRef[] = []
  for (const ref of refs) {
    const key = `${ref.code}:${ref.level}:${ref.ref ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ref)
  }
  return result
}

const DANGER_TERMS = [
  '危大',
  '危险性较大',
  '专项管理',
  '专项方案',
  '专家论证',
  '论证',
  '方案交底',
  '人员资格',
  '安全技术交底',
  '深基坑',
  '高支模',
  '高大模板',
  '脚手架',
  '塔吊',
  '施工升降机',
  '吊篮',
  '卸料平台',
  '临时用电',
  '临电',
  '人工挖孔',
]

const ACCEPTANCE_TERMS = [
  '验收',
  '备案',
  '分户验收',
  '消防验收',
  '节能验收',
  '人防验收',
  '竣工验收',
  '移交',
]

const MATERIAL_TEST_TERMS = [
  '复验',
  '复试',
  '送检',
  '见证取样',
  '检测报告',
  '试验报告',
  '试块',
  '探伤',
  '四性',
  '拉拔',
]

const COMMERCIAL_TERMS = [
  '计量',
  '签证',
  '变更',
  '索赔',
  '结算',
  '付款',
  '认质认价',
  '商务',
]

export function inferWbsTemplatePreferredEvidenceRefs(context: string, stableCode?: string): WbsTemplateEvidenceRef[] {
  const refs: WbsTemplateEvidenceRef[] = stableCode
    ? [...(WBS_TEMPLATE_NODE_EVIDENCE_REF_OVERRIDES[stableCode] ?? [])]
    : []

  if (includesAny(context, DANGER_TERMS)) {
    refs.push(
      {
        code: 'MOHURD-37-2018',
        level: 'clause',
        ref: '危险性较大的分部分项工程安全管理规定及相关危大工程范围',
        rationale: '危大工程节点需要专项方案、审批、专家论证、验收和监测证据链。',
      },
      {
        code: 'PROCESS-DANGER-CONTROL',
        level: 'process',
        ref: 'danger_identification_plan_review_acceptance_closeout',
        rationale: '危大工程按识别清单、方案审批、专家论证、实体实施、专项验收、资料归档闭合。',
      },
      {
        code: 'HISTORY-DANGER-CONTROL-CANDIDATE',
        level: 'execution_history',
        ref: 'project_feedback.danger_control.trigger_and_closeout',
        rationale: '危大触发条件和验收闭合需要通过真实项目回流持续校准。',
      },
    )
  }

  if (includesAny(context, ACCEPTANCE_TERMS)) {
    refs.push(
      {
        code: 'GB50300-2013',
        level: 'clause',
        ref: '建筑工程质量验收层级、组织和验收记录要求',
        rationale: '验收/备案/移交类节点需要对应验收组织、记录、整改闭合和签认依据。',
      },
      {
        code: 'PROCESS-ACCEPTANCE-TIMELINE',
        level: 'process',
        ref: 'acceptance_plans.requirement_record_rectification_pass_filing',
        rationale: '验收节点按验收时间轴事实闭合,计划行只承接投影和跳转。',
      },
      {
        code: 'HISTORY-ACCEPTANCE-CANDIDATE',
        level: 'execution_history',
        ref: 'project_feedback.acceptance_milestone_delay_and_closeout',
        rationale: '专项验收延期、整改和资料缺口需要通过历史项目回流形成候选。',
      },
    )
  }

  if (includesAny(context, MATERIAL_TEST_TERMS)) {
    refs.push(
      {
        code: 'GB50300-2013',
        level: 'clause',
        ref: '进场验收、见证取样、检验批质量验收资料要求',
        rationale: '材料复验/检测报告节点需要见证、委托、报告和不合格处置闭合依据。',
      },
      {
        code: 'PROCESS-MATERIAL-TEST',
        level: 'process',
        ref: 'material_acceptance_witness_sampling_testing_report_closeout',
        rationale: '材料检测按进场验收、见证取样、送检、报告接收、不合格处置闭合。',
      },
      {
        code: 'HISTORY-MATERIAL-TEST-CANDIDATE',
        level: 'execution_history',
        ref: 'project_feedback.material_retest_wait_and_rework',
        rationale: '报告等待周期和复检返工需由真实项目回流持续校准。',
      },
    )
  }

  if (includesAny(context, COMMERCIAL_TERMS)) {
    refs.push(
      {
        code: 'GB/T50500-2024',
        level: 'clause',
        ref: '工程量清单计价、变更、计量、结算相关管理口径',
        rationale: '商务节点需要合同/清单、签证变更、计量、付款、结算和索赔证据依据。',
      },
      {
        code: 'PROCESS-COMMERCIAL-EVIDENCE',
        level: 'process',
        ref: 'variation_claim_measurement_payment_settlement_evidence_closeout',
        rationale: '商务事项按事实记录、证据归集、审批签认、台账更新、结算闭合治理。',
      },
      {
        code: 'HISTORY-COMMERCIAL-CANDIDATE',
        level: 'execution_history',
        ref: 'project_feedback.commercial_variation_claim_settlement',
        rationale: '商务节点是否高频保留、删除或改为 record_only 需要由真实项目回流校准。',
      },
    )
  }

  return mergeEvidenceRefs(refs)
}

export function mergeWbsTemplateEvidenceRefs(
  left: unknown,
  right: WbsTemplateEvidenceRef[],
): WbsTemplateEvidenceRef[] {
  const leftRefs = Array.isArray(left)
    ? left.filter((item): item is WbsTemplateEvidenceRef => Boolean(item) && typeof item === 'object') as WbsTemplateEvidenceRef[]
    : []
  return mergeEvidenceRefs([...leftRefs, ...right])
}
