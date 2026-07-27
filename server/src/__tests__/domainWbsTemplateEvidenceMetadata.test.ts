import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ChinaTemplateCatalogNode } from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'

const domainWbsTemplateCatalogSource = readFileSync(
  new URL('../seeds/domainWbsTemplateCatalogs.ts', import.meta.url),
  'utf8',
)

function flattenNodes(nodes: ChinaTemplateCatalogNode[] = []): ChinaTemplateCatalogNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])])
}

function processNameMatchesFragment(value: string, fragment: string) {
  return value.includes(fragment)
}

function processChildrenFor(templateId: string, stableCode: string) {
  const template = DOMAIN_WBS_TEMPLATE_CATALOGS.find((item) => item.templateId === templateId)
  expect(template, `${templateId} should exist`).toBeTruthy()

  const itemWork = flattenNodes(template!.divisions)
    .find((node) => node.stableCode === stableCode && node.categoryType === 'item_work')
  expect(itemWork, `${templateId}:${stableCode} should exist`).toBeTruthy()

  return (itemWork!.children ?? []).filter((child) => child.categoryType === 'process')
}

function expectFirstProcessEvidenceKeywords(
  templateId: string,
  stableCode: string,
  fragments: string[],
) {
  const firstProcess = processChildrenFor(templateId, stableCode)[0]!
  const fieldEvidenceKeywords = firstProcess.metadata?.fieldEvidenceKeywords as string[] | undefined

  expect(Array.isArray(fieldEvidenceKeywords), `${stableCode} first process should expose fieldEvidenceKeywords`)
    .toBe(true)
  for (const fragment of fragments) {
    expect(
      fieldEvidenceKeywords?.some((keyword) => processNameMatchesFragment(keyword, fragment)),
      `${stableCode} first process evidence should include ${fragment}`,
    ).toBe(true)
  }
}

function expectTerminalEvidenceMetadata(
  templateId: string,
  stableCode: string,
  expectation: {
    expectedProcessCount: number
    handoverEvidenceType: string
    acceptanceFragments: string[]
  },
) {
  const processChildren = processChildrenFor(templateId, stableCode)
  const terminalProcess = processChildren.at(-1)!
  const acceptanceCheckpoints = terminalProcess.metadata?.acceptanceCheckpoints as string[] | undefined

  expect(processChildren.length, `${stableCode} process count should not regress below the evidence-depth baseline`)
    .toBeGreaterThanOrEqual(expectation.expectedProcessCount)
  expect(terminalProcess.metadata?.handoverEvidenceType, `${stableCode} terminal handover evidence type`)
    .toBe(expectation.handoverEvidenceType)
  expect(Array.isArray(acceptanceCheckpoints), `${stableCode} terminal process should expose acceptanceCheckpoints`)
    .toBe(true)
  expect(acceptanceCheckpoints, `${stableCode} terminal acceptance checkpoint count`)
    .toHaveLength(7)
  for (const fragment of expectation.acceptanceFragments) {
    expect(
      acceptanceCheckpoints?.some((checkpoint) => processNameMatchesFragment(checkpoint, fragment)),
      `${stableCode} terminal acceptance should include ${fragment}`,
    ).toBe(true)
  }
}

function processEvidenceDepthProfileBlock() {
  const start = domainWbsTemplateCatalogSource.indexOf('const PROCESS_EVIDENCE_DEPTH_PROFILES_BY_ITEM_CODE')
  const end = domainWbsTemplateCatalogSource.indexOf('const TERMINAL_PROCESS_NAME_KEYWORDS')

  expect(start, 'PROCESS_EVIDENCE_DEPTH_PROFILES_BY_ITEM_CODE should exist').toBeGreaterThan(-1)
  expect(end, 'terminal process keywords should follow evidence profiles').toBeGreaterThan(start)

  return domainWbsTemplateCatalogSource.slice(start, end)
}

function processEvidenceProfileCodesByPrefix(prefix: string) {
  const profileCodePattern = new RegExp(`'(${prefix}-\\d{2}-\\d{2}-\\d{2})':`, 'g')
  return new Set([...processEvidenceDepthProfileBlock().matchAll(profileCodePattern)].map((match) => match[1]))
}

describe('domain WBS template evidence metadata depth', () => {
  it('keeps prefab evidence-rich packs tied to field evidence and handover checkpoints without dependency-rule imports', () => {
    const expectations = [
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-00-01-02',
        expectedProcessCount: 15,
        firstEvidenceFragments: ['模具尺寸', '钢筋保护层', '套筒定位', '蒸养温控', '二维码追溯'],
        handoverEvidenceType: 'prefab_pc_factory_steam_curing_strength_qr_traceability_delivery_certificate_signoff',
        acceptanceFragments: ['模具开模尺寸', '套筒定位吊点', '蒸养温控记录', '合格证签发'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-02-01-01',
        expectedProcessCount: 15,
        firstEvidenceFragments: ['套筒通畅', '封仓检测', '灌浆窗口', '试块送检编号', '旁站记录'],
        handoverEvidenceType: 'prefab_sleeve_grouting_fullness_test_block_strength_hidden_record_signoff',
        acceptanceFragments: ['套筒通畅封仓检测', '饱满度控制', '强度结果回填', '隐蔽验收签认'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-03-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['安装偏差', '分层分户实测', '灌浆实体检测', '外墙淋水', '质量验收移交'],
        handoverEvidenceType: 'prefab_structure_measurement_entity_test_leakage_recheck_defect_closeout_handover',
        acceptanceFragments: ['分层分户实测', '外墙淋水检测', '结构实体检测报告', '质量验收移交'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-03-01-03',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['构件二维码', '安装位置台账', '竣工图模型', '维保交底', '缺陷责任期'],
        handoverEvidenceType: 'prefab_om_qr_traceability_model_quality_certificate_warranty_training_handover',
        acceptanceFragments: ['构件编码二维码', '质量证明与检测报告', '缺陷责任期', '运维资料移交'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-04-01-11',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['全灌浆套筒', '孔道清理', '封仓检查', '压力流量记录', '隐蔽验收'],
        handoverEvidenceType: 'prefab_full_grouted_sleeve_pressure_flow_overflow_regrout_hidden_acceptance',
        acceptanceFragments: ['孔道清理', '上口出浆', '压力流量记录', '隐蔽验收签认'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-04-01-12',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['浆锚孔道', '孔深复核', '钢筋插入长度', '拉拔抽检', '隐蔽验收'],
        handoverEvidenceType: 'prefab_grouted_anchor_lap_hole_depth_insert_length_overflow_test_block_pullout_signoff',
        acceptanceFragments: ['孔深复核', '钢筋插入长度', '试块留置拉拔抽检', '隐蔽验收签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps IBU, IKU, and MiC factory or site packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-prefab-bathroom-specialty',
        code: 'IBU-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防水底盘', '地漏坡度', '墙顶板接缝', '检修口预留', 'FAT问题闭合'],
        handoverEvidenceType: 'prefab_bathroom_factory_base_pan_wall_ceiling_fat_defect_closure_handover',
        acceptanceFragments: ['地漏坡度', '检修口预留', 'FAT问题清单', '工厂集成移交'],
      },
      {
        templateId: 'china-prefab-bathroom-specialty',
        code: 'IBU-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['洞口复测', '快接接口', '排水坡度', '闭水通水', '保修边界'],
        handoverEvidenceType: 'prefab_bathroom_site_quick_connect_water_test_warranty_boundary_handover',
        acceptanceFragments: ['洞口基层', '快接密封', '渗漏复测', '保修边界'],
      },
      {
        templateId: 'china-prefab-kitchen-specialty',
        code: 'IKU-01-02-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['燃气严密性', '排烟止回阀', '排烟风量', '防火封堵', '工厂FAT'],
        handoverEvidenceType: 'prefab_kitchen_factory_gas_exhaust_water_power_interface_fat_handover',
        acceptanceFragments: ['燃气严密性保压', '排烟风量', '防火封堵', '工厂预装FAT'],
      },
      {
        templateId: 'china-prefab-kitchen-specialty',
        code: 'IKU-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['燃气排烟快接', '止回阀', '给排水快接', '通水通电通气', '保修边界'],
        handoverEvidenceType: 'prefab_kitchen_site_gas_exhaust_quick_connect_trial_warranty_boundary_handover',
        acceptanceFragments: ['排烟快接密封', '给排水快接试压', '通水通电通气', '保修边界'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['机电综合管线', '支吊架', '接口编号', '绝缘接地', '预装缺陷'],
        handoverEvidenceType: 'mic_factory_mep_preinstall_interface_numbering_insulation_defect_closure_handover',
        acceptanceFragments: ['预留预埋接口冻结', '支吊架安装验收', '试压绝缘接地', '预装缺陷整改'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['卫浴底盘', '闭水复测', '给排水快接', '洁具五金', '渗漏整改'],
        handoverEvidenceType: 'mic_factory_bathroom_module_water_test_fixture_leakage_defect_closure_handover',
        acceptanceFragments: ['闭水复测', '给排水快接接口', '工厂试水试电', '渗漏整改'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['厨房柜体', '台面预装', '燃气接口', '排烟接口', '模块FAT放行'],
        handoverEvidenceType: 'mic_factory_kitchen_module_gas_exhaust_power_trial_defect_closure_handover',
        acceptanceFragments: ['燃气排烟接口', '工厂通电通气', '通气整改复测', '模块FAT放行'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps hospital cleanroom main-chain packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-01-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['洁净分区', '气密边界', '彩钢板龙骨', '穿墙管线封堵', '围护气密测试'],
        handoverEvidenceType: 'hospital_cleanroom_envelope_air_tight_panel_floor_wall_penetration_cleaning_handover',
        acceptanceFragments: ['洁净分区边界', '穿墙管线气密封堵', '围护气密性', '洁净围护结构移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['医气点位', '管线路由', '脱脂焊接', '区域阀箱', '压力流量测试'],
        handoverEvidenceType: 'hospital_medical_gas_pipeline_pressure_purge_terminal_alarm_handover',
        acceptanceFragments: ['医气点位', '脱脂焊接', '压力流量', '医用气体管道验收移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-02-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['洁净空调深化', '高效过滤器', '漏风测试', '压差梯度', '悬浮粒子'],
        handoverEvidenceType: 'hospital_cleanroom_hvac_hepa_leak_pressure_gradient_particle_validation_handover',
        acceptanceFragments: ['高效过滤器', '压差梯度', '悬浮粒子浓度', '洁净空调系统验收移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-02-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['检测方案', '静态检测', '动态运行', '悬浮粒子布点', '院感交接'],
        handoverEvidenceType: 'hospital_cleanroom_validation_static_dynamic_particle_microbe_infection_control_handover',
        acceptanceFragments: ['静态动态运行', '沉降菌采样', '复测报告闭合', '院感交接见证'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-03-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['护理呼叫主机', '设备带', '床头终端', '医气接口', '护理站联动'],
        handoverEvidenceType: 'hospital_nurse_call_bedhead_medical_gas_electrical_interface_alarm_handover',
        acceptanceFragments: ['护理呼叫主机设备带', '分机地址编码', '场景报警测试', '护理呼叫设备带系统验收移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps hospital cleanroom specialty packs tied to evidence checkpoints without changing process depth', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防护铅当量', '铅门铅玻璃', '穿墙管线套管', '射线剂量布点', '卫监验收'],
        handoverEvidenceType: 'hospital_radiation_protection_lead_equivalent_dose_test_health_acceptance_dossier_signoff',
        acceptanceFragments: ['铅当量设计值', '穿墙管线套管', '射线剂量布点检测', '卫监验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-03-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['医废暂存间', '防渗基层', '排水沟集液井', '通风消毒', '院感环保'],
        handoverEvidenceType: 'hospital_medical_waste_storage_anti_seepage_disinfection_transport_infection_environment_handover',
        acceptanceFragments: ['防渗基层', '排水沟集液井', '地面防渗闭水', '院感环保验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-03-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['医疗污水', '格栅调节池', '管线接驳试压', '在线监测', '达标排放'],
        handoverEvidenceType: 'hospital_medical_wastewater_pretreatment_pipeline_sampling_online_monitoring_discharge_signoff',
        acceptanceFragments: ['格栅调节池', '管线接驳试压', '在线监测', '达标排放'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps data-center power, rack, and cabling main-chain packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-01-01-02',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['机柜列位', '荷载复核', '抗震固定', '架空地板', '接地铜排'],
        handoverEvidenceType: 'data_center_cabinet_base_raised_floor_grounding_load_equipment_rack_release',
        acceptanceFragments: ['机柜列位荷载', '架空地板', '接地连续性', '设备上架移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['UPS主机', '旁路柜', '电池极性', '假负载', 'EPO安全联锁'],
        handoverEvidenceType: 'data_center_ups_battery_load_bank_transfer_alarm_operations_handover',
        acceptanceFragments: ['UPS设备基础', '电池接线极性', '双路切换', 'UPS电池系统运维移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-02-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['柴油发电机', '基础减振', 'ATS切换', '黑启动', 'EPO联锁'],
        handoverEvidenceType: 'data_center_generator_fuel_cooling_ats_load_black_start_handover',
        acceptanceFragments: ['柴油发电机基础减振', 'ATS市电失电', '备用电源黑启动', '备用电源投运移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['冷热通道桥架', '净距复核', '光铜分离', '链路认证', '机柜接地'],
        handoverEvidenceType: 'data_center_cable_tray_grounding_fiber_copper_certification_firestop_handover',
        acceptanceFragments: ['冷热通道桥架', '光铜分离', '链路认证测试', '综合布线链路报告'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps foundation pit and pile packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-01-01-01',
        expectedProcessCount: 14,
        firstEvidenceFragments: ['桩位复核', '护筒埋设', '泥浆指标', '沉渣厚度', '导管埋深'],
        handoverEvidenceType: 'foundation_bored_pile_position_hole_cleaning_cage_concrete_integrity_handover',
        acceptanceFragments: ['桩位轴线', '泥浆比重', '钢筋笼制作吊装', '承台接口移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-01-01-03',
        expectedProcessCount: 13,
        firstEvidenceFragments: ['试桩方案', '检测单位资质', '加载分级', '沉降曲线', '补桩闭合'],
        handoverEvidenceType: 'foundation_trial_pile_loading_uplift_mass_test_parameter_release_handover',
        acceptanceFragments: ['试桩位置检测方案', '加载分级沉降曲线', '施工参数并冻结', '大面积施工放行'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-02-01-01',
        expectedProcessCount: 13,
        firstEvidenceFragments: ['专项方案交底', '监测点', '支护桩', '冠梁腰梁', '降水井'],
        handoverEvidenceType: 'foundation_pit_support_dewatering_monitoring_warning_structure_workface_handover',
        acceptanceFragments: ['专项方案交底', '降水井排水沟', '监测日报预警', '作业面移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-02-01-02',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['开挖边线', '分区分层', '坑边荷载', '基底清槽', '垫层封闭'],
        handoverEvidenceType: 'foundation_layered_excavation_base_trench_inspection_blinding_handover',
        acceptanceFragments: ['分层分区顺序', '基底清槽', '验槽问题整改', '结构作业面移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-04',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['膨润土泥浆', '导墙轴线', '垂直度监测', '沉渣检测', '刷壁'],
        handoverEvidenceType: 'foundation_diaphragm_wall_trenching_slurry_verticality_bottom_cleaning_cage_handoff',
        acceptanceFragments: ['泥浆配制', '成槽深度宽度垂直度', '接头刷壁', '钢筋笼吊装槽口条件'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-05',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['钢筋笼分节', '吊点验算', '导管水密', '水下混凝土', '隐蔽验收'],
        handoverEvidenceType: 'foundation_diaphragm_wall_cage_lifting_tremie_concrete_joint_hidden_acceptance_handover',
        acceptanceFragments: ['钢筋笼分节制作', '导管水密性', '连续浇筑充盈系数', '下道支撑接口移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-05-01-03',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['承压含水层', '观测井', '降深曲线', '水位连续记录', '突涌风险'],
        handoverEvidenceType: 'foundation_confined_water_pumping_test_drawdown_rebound_depressurization_parameter_handover',
        acceptanceFragments: ['抽水井和观测井', '降深水位连续记录', '停泵回弹观测', '基坑开挖条件移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-06-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['保护区范围', '控制指标', '地铁运营接口', '沉降位移', '停工边界'],
        handoverEvidenceType: 'foundation_adjacent_metro_protection_limit_monitoring_interface_recheck_handover',
        acceptanceFragments: ['地铁保护区范围', '报警阈值', '停工边界', '工况放行签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps industrial cleanroom process packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-02-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['露点目标', '围护气密边界', '穿墙套管封堵', '在线露点点位', '压差梯度'],
        handoverEvidenceType: 'industrial_cleanroom_dry_room_envelope_air_tightness_dew_point_boundary_handover',
        acceptanceFragments: ['露点目标', '穿墙套管封堵', '低露点连续运行', '露点边界移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-03-02-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['防爆分区', '风量平衡', '防爆风机', 'LEL联锁', '粒子检测'],
        handoverEvidenceType: 'industrial_cleanroom_explosion_proof_hvac_air_balance_cleanliness_interlock_handover',
        acceptanceFragments: ['防爆分区', '风量平衡', 'LEL报警排风联锁', '防爆暖通洁净风量平衡'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-14',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['特气种类', '危险等级', 'VMB', 'VMP', '泄漏检测'],
        handoverEvidenceType: 'industrial_cleanroom_special_gas_cabinet_vmb_vmp_leak_interlock_scada_handover',
        acceptanceFragments: ['特气种类危险等级', 'VMB/VMP定位固定', '泄漏率测试', '安全联调验收移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-15',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['CDA压力', '露点', '含油量', '空压机', '终端减压过滤'],
        handoverEvidenceType: 'industrial_cleanroom_cda_pressure_dew_point_oil_content_terminal_handover',
        acceptanceFragments: ['CDA压力露点含油量', '终端减压过滤', '终端取样检测', '工艺用气点移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-16',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['真空等级', '抽气量', '真空泵组', '泄漏率', '设备接口'],
        handoverEvidenceType: 'industrial_cleanroom_process_vacuum_leak_rate_exhaust_noise_terminal_handover',
        acceptanceFragments: ['真空等级抽气量', '保压泄漏率', '异常停机恢复', '终端用点移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-19',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['废水分类', '水质边界', '事故池', '在线监测', '取样井'],
        handoverEvidenceType: 'industrial_cleanroom_wastewater_pretreatment_sampling_online_monitoring_discharge_handover',
        acceptanceFragments: ['废水分类水质边界', '在线监测仪表', '超标偏差整改', '环保验收移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-24',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['AGV路径', '人车分流', '充电站', 'WMS/MES接口', '急停避障'],
        handoverEvidenceType: 'industrial_cleanroom_agv_route_charging_loaded_cycle_safety_handover',
        acceptanceFragments: ['人车分流', 'WMS/MES任务接口', '空载满载路径节拍', '运维培训移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-30',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['吹扫方案', '介质纯度', '分段隔离', '颗粒检测', '纯度放行'],
        handoverEvidenceType: 'industrial_cleanroom_process_media_purge_particle_dew_point_purity_release_handover',
        acceptanceFragments: ['介质纯度标准', '氮气或洁净空气吹扫', '颗粒露点纯度', '吹扫纯度确认报告'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps renovation, heritage, and TOD low-coverage packs tied to typed evidence and handover checkpoints', () => {
    expect(processEvidenceProfileCodesByPrefix('RNV').size, 'renovation evidence profile count')
      .toBeGreaterThanOrEqual(10)
    expect(processEvidenceProfileCodesByPrefix('HRT').size, 'heritage evidence profile count')
      .toBeGreaterThanOrEqual(12)
    expect(processEvidenceProfileCodesByPrefix('TOD').size, 'TOD evidence profile count')
      .toBeGreaterThanOrEqual(12)

    const expectations = [
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['现状勘察', '图纸比对', '结构复核', '风险清单', '改造条件'],
        handoverEvidenceType: 'renovation_existing_condition_survey_structure_review_risk_closeout_handover',
        acceptanceFragments: ['现状勘察图纸比对', '承重构件抽检', '风险清单', '结构复核资料'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-02-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['植筋', '钻孔清孔', '注胶', '拉拔', '隐蔽验收'],
        handoverEvidenceType: 'renovation_rebar_anchoring_steel_plate_cfrp_hidden_acceptance_handover',
        acceptanceFragments: ['钻孔清孔', '拉拔复验', '碳纤维布', '加固施工验收资料'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-02-02-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['既有管线', '分区断点', '临时旁通', '切换演练', '运维移交'],
        handoverEvidenceType: 'renovation_existing_mep_relocation_phased_cutover_operations_handover',
        acceptanceFragments: ['既有管线探测', '临时旁通', '保供值守', '运维移交资料'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-23',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['功能联测', '试运行参数', '使用方确认', '竣工功能', '培训交底'],
        handoverEvidenceType: 'renovation_final_function_retest_trial_run_user_handover',
        acceptanceFragments: ['竣工功能清单', '使用方问题清单', '培训交底', '试运行验收移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-16',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['现状系统', '停用窗口', '临时旁路', '切换演练', '运维交接'],
        handoverEvidenceType: 'renovation_mep_temporary_cutover_service_continuity_recovery_operations_handover',
        acceptanceFragments: ['停用窗口', '临时供电供水通风旁路', '运行参数连续记录', '运维边界挂牌'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-18',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['不停用分区', '消防旁路', '临时报警', '联动矩阵', '恢复签认'],
        handoverEvidenceType: 'renovation_live_fire_system_bypass_watch_linkage_recovery_acceptance_handover',
        acceptanceFragments: ['不停用分区方案', '值守和巡检', '消防联动矩阵', '运营接管签认'],
          },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['文物测绘', '尺寸复核', '病害编号', '材料取样', '影像建档'],
        handoverEvidenceType: 'heritage_survey_mapping_pathology_numbering_material_sampling_handover',
        acceptanceFragments: ['测绘控制点', '病害编号影像', '材料取样', '调查成果移交'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-02-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['传统材料', '灰浆试配', '兼容性试验', '样板试修', '专家确认'],
        handoverEvidenceType: 'heritage_traditional_material_compatibility_trial_repair_handover',
        acceptanceFragments: ['灰浆试配', '兼容性试验', '样板试修', '修复兼容性试验'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['环境监测', '沉降点', '裂缝观测', '报警阈值', '监测报告'],
        handoverEvidenceType: 'heritage_environment_settlement_crack_monitoring_expert_handover',
        acceptanceFragments: ['裂缝位移观测点', '周期观测记录', '专家复核', '监测成果'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-14',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['修缮监测', '专家复核', '监测传感器', '监测报告', '成果归档'],
        handoverEvidenceType: 'heritage_restoration_monitoring_expert_review_report_handover',
        acceptanceFragments: ['专家复核计划', '监测传感器', '监测报告', '专家复核报告'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-08',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['原彩画分层', '颜料取样', '试修样板', '可逆材料', '专家复核'],
        handoverEvidenceType: 'heritage_wood_paint_polychrome_sample_repair_expert_review_archive_handover',
        acceptanceFragments: ['原彩画分层取样', '可逆性说明', '试修样板', '档案移交签认'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-11',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['最小干预', '隐蔽路径', '彩画隔离', '报警回路', '图档绑定'],
        handoverEvidenceType: 'heritage_fire_electrical_hidden_minimal_intervention_image_dossier_acceptance_handover',
        acceptanceFragments: ['最小干预边界', '隐蔽管线敷设影像', '绝缘接地', '资料移交完成'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-15',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['前中后影像', '材料工艺', '隐蔽图档', '专家意见', '档案移交'],
        handoverEvidenceType: 'heritage_restoration_dossier_photo_material_hidden_work_expert_closeout_archive_handover',
        acceptanceFragments: ['前中后影像', '隐蔽工程图档', '开放维护要求', '纸质件移交签认'],
          },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['地铁站现状', '限界复核', '结构复核', '接口确认', '站房移交'],
        handoverEvidenceType: 'tod_existing_station_survey_clearance_structure_interface_handover',
        acceptanceFragments: ['限界复核', '既有站点结构', '监测点布设', '接口确认资料'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['营业线', '天窗审批', '封锁范围', '限界复核', '恢复签认'],
        handoverEvidenceType: 'tod_live_line_protection_night_possession_recovery_handover',
        acceptanceFragments: ['营业线施工边界', '天窗审批封锁范围', '工完场清', '夜间窗口管理记录'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-02-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['转换层', '高支模', '预压', '大跨结构', '支撑卸载'],
        handoverEvidenceType: 'tod_upper_cover_transfer_slab_long_span_structure_unloading_handover',
        acceptanceFragments: ['转换层支撑体系', '高支模验收', '沉降监测', '大跨结构施工'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-09',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['既有轨道', '沉降监测', '变形监测', '报警阈值', '运营见证'],
        handoverEvidenceType: 'tod_existing_track_settlement_deformation_monitoring_handover',
        acceptanceFragments: ['沉降基准网', '变形自动监测', '临时加固', '复核报告移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-23',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['站城联调', '竣工联调', '隔离复测', '缺陷整改', '运营确认'],
        handoverEvidenceType: 'tod_station_city_integrated_commissioning_closeout_handover',
        acceptanceFragments: ['竣工联调计划', '运营系统联调', '缺陷整改', '联调报告移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-05',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['站城消防边界', '联动矩阵', '防烟分隔', '运营隔离', '联合验收'],
        handoverEvidenceType: 'tod_station_city_fire_compartment_smoke_control_linkage_interface_acceptance_handover',
        acceptanceFragments: ['消防边界和联动矩阵', '运营隔离界面', '排烟报警广播', '联合验收签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-08',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['天窗审批', '封锁条件', '人员清点', '工完场清', '运营恢复'],
        handoverEvidenceType: 'tod_night_window_possession_worksite_clearance_operation_recovery_record_handover',
        acceptanceFragments: ['天窗审批封锁范围', '人员机具和材料清点', '工完场清', '运营恢复签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-22',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['接管清单', '现场核验', '系统台账', '培训记录', '钥匙资产'],
        handoverEvidenceType: 'tod_operations_takeover_dossier_asset_training_defect_closeout_handover',
        acceptanceFragments: ['运营接管清单', '系统台账设备清册', '权限账号移交', '运营接管资料签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps hotel fitout, systems, and preopening packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['样板间', '品牌标准', '机电末端', '客控点位', '品牌评审'],
        handoverEvidenceType: 'hotel_mockup_room_brand_review_mep_soft_furnishing_defect_closeout_handover',
        acceptanceFragments: ['品牌标准', '客控点位', '品牌运营方评审', '批量施工交底'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['标准客房', '湿区防水', '木饰面', '客控联调', '分层验收'],
        handoverEvidenceType: 'hotel_standard_room_batch_fitout_waterproof_mep_guestroom_acceptance_handover',
        acceptanceFragments: ['湿区防水闭水', '客房门锁客控', '分层分户缺陷', '批量精装修移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['宴会厅', '声光电', '马道吊点', '场景联动', '模拟宴会'],
        handoverEvidenceType: 'hotel_ballroom_av_lighting_stage_partition_scenario_commissioning_handover',
        acceptanceFragments: ['吊点荷载', '灯光音响视频', '模拟宴会流程', '声光电系统移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['中央厨房', '工艺设备', '排烟补风', '燃气报警', '食品卫生'],
        handoverEvidenceType: 'hotel_central_kitchen_equipment_exhaust_gas_drainage_food_safety_handover',
        acceptanceFragments: ['中央厨房工艺流程', '燃气严密性', '食品卫生许可', '工艺设备验收移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['洗衣房', '设备基础', '蒸汽管道', '物流动线', '运营移交'],
        handoverEvidenceType: 'hotel_laundry_equipment_steam_drainage_exhaust_logistics_trial_handover',
        acceptanceFragments: ['洗衣房设备布置', '蒸汽管道安装', '联动试运行', '设备安装调试移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-19',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['PMS服务器', '房态数据', '接口联调', '权限账号', '试运营'],
        handoverEvidenceType: 'hotel_pms_deployment_room_status_member_finance_interface_operations_handover',
        acceptanceFragments: ['房态数据初始化', 'PMS与门锁客控POS', '权限账号角色', 'PMS酒店管理系统部署移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-20',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['客控主机', '面板地址', '灯光空调', 'PMS接口', '场景复测'],
        handoverEvidenceType: 'hotel_guestroom_control_lighting_hvac_curtain_pms_scene_handover',
        acceptanceFragments: ['客控主机面板地址', '欢迎模式退房模式', 'PMS房态接口', '智能客控系统安装调试移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-26',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['试运营', '满房压力测试', '入住退房', '工程保障', '开业放行'],
        handoverEvidenceType: 'hotel_soft_opening_full_occupancy_pressure_test_defect_closeout_opening_release',
        acceptanceFragments: ['满房场景', '入住退房', '压力测试问题清单', '开业放行签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps campus multi-building, operations, and IT packs tied to typed evidence and handover checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['教学楼结构砌体', '宿舍标准层', '食堂厨房排油烟', '食品卫生预验收', '楼栋交叉界面'],
        handoverEvidenceType: 'campus_teaching_dormitory_canteen_multi_building_interface_handover',
        acceptanceFragments: ['教学楼结构砌体', '宿舍标准层样板间', '食堂排油烟', '楼栋移交清单'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['实验台功能柜', '给排水点位', '气体点位', '通风柜排风', '房间级移交'],
        handoverEvidenceType: 'campus_laboratory_function_room_points_ventilation_safety_room_handover',
        acceptanceFragments: ['实验台功能柜', '通风柜排风补风', '危化废液暂存', '房间级移交清单'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['过渡容量', '课表需求', '临时教室围护', '校方试用', '问题整改'],
        handoverEvidenceType: 'campus_temporary_classroom_transition_space_trial_use_handover',
        acceptanceFragments: ['过渡教室容量', '消防疏散', '课桌椅设备布置', '临时开放交接单'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-05',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['卫浴热水点位', '给排水立支管', '防水闭水', '热水循环', '床位编号'],
        handoverEvidenceType: 'campus_dormitory_bathroom_hot_water_waterproof_balance_occupancy_handover',
        acceptanceFragments: ['卫浴热水点位', '防水闭水', '热水循环', '入住前功能移交'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-12',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['交通导改', '道路基层', '人车分流', '照明监控接入', '交通试运行'],
        handoverEvidenceType: 'campus_road_pedestrian_vehicle_separation_trial_operation_handover',
        acceptanceFragments: ['交通导改', '人行车行分隔', '照明监控接入', '开放道路移交'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-13',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['访客登记', '门禁权限', '人脸车牌识别', '一键报警', '安保接管演练'],
        handoverEvidenceType: 'campus_gate_security_visitor_access_alarm_guard_takeover_handover',
        acceptanceFragments: ['访客登记', '一键报警', '安保接管演练', '运维账号完成移交'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-22',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['分批接收楼栋', '开放条件', '交叉施工隔离', '门禁钥匙台账', '后续施工边界'],
        handoverEvidenceType: 'campus_phased_receiving_trial_operation_access_defect_boundary_handover',
        acceptanceFragments: ['分批接收楼栋', '空气水电消防', '钥匙门禁设备台账', '后续施工边界'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-28',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['网络中心等级', '机柜容量', '校园主干光缆', 'UPS动环', '网络中心验收'],
        handoverEvidenceType: 'campus_it_room_network_center_fiber_ups_environment_monitoring_handover',
        acceptanceFragments: ['网络中心等级', '主干光缆', 'UPS和动环监控', '运维账号和应急流程'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps steel structure fabrication, hoisting, NDT, coating, and monitoring packs tied to evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-01-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['钢结构深化', '节点详图', '构件清单', '构件编号', '进场验收'],
        handoverEvidenceType: 'steel_component_detailing_fabrication_receiving_quality_handover',
        acceptanceFragments: ['节点详图', '加工图版本冻结', '焊接过程记录', '进场外观数量'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['高强螺栓', '摩擦面', '焊接工艺评定', '扭矩检查', '焊缝探伤'],
        handoverEvidenceType: 'steel_high_strength_bolt_welding_ndt_torque_node_acceptance_handover',
        acceptanceFragments: ['抗滑移系数', '初拧终拧', '焊缝探伤', '节点验收签认'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-02-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['吊装方案', '吊机站位', '试吊', '临时支撑', '垂直度'],
        handoverEvidenceType: 'steel_structure_hoisting_alignment_temporary_support_installation_handover',
        acceptanceFragments: ['吊装专项方案', '试吊', '双向校正', '主体钢结构安装验收'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-07',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['UT探伤', 'RT检测', '焊缝编号', '缺陷评级', '返修复探'],
        handoverEvidenceType: 'steel_weld_ut_rt_ndt_defect_repair_retest_report_handover',
        acceptanceFragments: ['无损检测单位资质', 'UT探伤检测', '返修焊缝复探', '验收签认归档'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-09',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['大跨度', '工厂胎架', '三维扫描', '预拼装', '现场接口'],
        handoverEvidenceType: 'steel_large_span_factory_preassembly_scan_ndt_site_interface_handover',
        acceptanceFragments: ['大跨度构件', '首件评审', '三维扫描', '现场安装接口'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-11',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防火涂料', '基层除锈', '耐火极限', '针测厚度', '粘结强度'],
        handoverEvidenceType: 'steel_fireproof_coating_thickness_bond_strength_fire_rating_handover',
        acceptanceFragments: ['耐火极限', '分遍喷涂厚度', '针测厚度', '防火涂装验收'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-17',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['高强螺栓', '摩擦面', '初拧', '终拧', '扭矩复测'],
        handoverEvidenceType: 'steel_high_strength_bolt_initial_final_tightening_torque_acceptance_handover',
        acceptanceFragments: ['高强螺栓批次', '摩擦面处理', '终拧扭矩', '连接质量签认'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-27',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['健康监测', '传感器', '测点布设', '阈值联调', '运维移交'],
        handoverEvidenceType: 'steel_structural_health_monitoring_sensor_threshold_alarm_operations_handover',
        acceptanceFragments: ['测点布设', '结构响应基线', '报警阈值', '监测系统移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps data-center specialty packs tied to SAT, trend, alarm, and handover evidence', () => {
    const expectations = [
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['洁净等级', '气密分区', '穿墙孔洞', '防静电地板', '白区设备进场条件'],
        handoverEvidenceType: 'data_center_white_space_cleanliness_air_tight_enclosure_anti_static_equipment_entry_release',
        acceptanceFragments: ['气密分区', '防火气密封堵', '地板下清洁', '设备进场'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-02-02-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['CRAH', 'CRAC', 'N+1容量', '冷冻水管路', '假负载热成像'],
        handoverEvidenceType: 'data_center_precision_cooling_chilled_water_thermal_trend_alarm_operations_handover',
        acceptanceFragments: ['CRAH/CRAC容量', '水质验收', '连续运行趋势', '运维移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-02-02-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['动环点位矩阵', '水浸', '烟感', '协议网关', '连续监测UAT'],
        handoverEvidenceType: 'data_center_environment_monitoring_sensor_gateway_alarm_trend_dcim_handover',
        acceptanceFragments: ['点位矩阵', '协议网关', 'DCIM和BMS', '投运验收移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防护区容积', '泄压核算', '灭火浓度', '延时释放', '管网试压吹扫'],
        handoverEvidenceType: 'data_center_gas_fire_suppression_release_linkage_retest_defect_closeout_signoff',
        acceptanceFragments: ['防护区边界', '延时释放', '消防联动', '专项验收放行'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps renewable energy generation, storage, booster, dispatch, and grid packs tied to evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['桩位复核', '支架基础', '预埋件标高', '扭矩记录', '组件排布线'],
        handoverEvidenceType: 'renewable_pv_support_foundation_torque_acceptance_handover',
        acceptanceFragments: ['光伏桩位轴线', '支架安装紧固扭矩', '拉拔试验', '移交签认'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['光伏组件', '组串编号', '直流汇流箱', '逆变器', 'IV曲线'],
        handoverEvidenceType: 'renewable_pv_module_string_inverter_dc_combiner_commissioning_handover',
        acceptanceFragments: ['光伏组件批次', '直流汇流箱逆变器', '绝缘电阻', 'IV曲线抽测'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['锚栓笼', '基础环', '混凝土温控', '沉降观测', '接地引下线'],
        handoverEvidenceType: 'renewable_wind_foundation_anchor_cage_concrete_curing_acceptance_handover',
        acceptanceFragments: ['基础环定位', '接地引下线', '混凝土浇筑温控', '吊装条件确认'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['吊装方案', '塔筒节段', '机舱吊装', '叶片组合', '对中校核'],
        handoverEvidenceType: 'renewable_wind_tower_nacelle_blade_hoisting_alignment_handover',
        acceptanceFragments: ['吊机站位', '塔筒法兰', '气象窗口', '对中校核'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-05',
        expectedProcessCount: 13,
        firstEvidenceFragments: ['电池簇', 'PCS', 'EMS', '消防联动', '绝缘监测'],
        handoverEvidenceType: 'renewable_bess_battery_cluster_pcs_fire_linkage_safety_handover',
        acceptanceFragments: ['电池簇PCS', '消防报警灭火', '充放电试验', 'EMS策略'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['主变压器', 'GIS', '开关柜', '继电保护', 'SCADA点表'],
        handoverEvidenceType: 'renewable_booster_transformer_gis_relay_scada_commissioning_handover',
        acceptanceFragments: ['主变GIS开关柜', '机械特性试验', '继电保护定值', 'SCADA点表'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['SCADA', 'AGC', 'AVC', '计量装置', '调度接口'],
        handoverEvidenceType: 'renewable_dispatch_scada_agc_avc_metering_interface_handover',
        acceptanceFragments: ['AGC AVC', '通讯规约', '调度数据一致性', '权限账号移交'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['倒送电', '保护定值', '并网试验', '性能验收', '调度许可'],
        handoverEvidenceType: 'renewable_grid_connection_backfeed_protection_metering_performance_acceptance_handover',
        acceptanceFragments: ['倒送电方案', '同期并网', '电能质量', '并网性能验收'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['全站试运行', '缺陷闭合', '生产移交', '运行曲线', '接管培训'],
        handoverEvidenceType: 'renewable_whole_station_trial_operation_defect_closeout_production_handover',
        acceptanceFragments: ['全站试运行范围', '连续运行记录', '消缺', '生产移交签认'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-13',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['PCS调试', 'EMS策略', '消防安全', '电池簇', '热失控报警'],
        handoverEvidenceType: 'renewable_bess_pcs_ems_fire_safety_charge_discharge_commissioning_handover',
        acceptanceFragments: ['PCS参数', 'EMS充放电策略', '热失控报警', '调试验收资料'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps airport terminal operation-readiness packs tied to full passenger, baggage, airside, and ORAT evidence', () => {
    const expectations = [
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['CUTE工作站', 'CUPPS应用', 'DCS连通', '自助托运', 'BHS注入口'],
        handoverEvidenceType: 'airport_common_use_checkin_cute_cupps_dcs_bagdrop_bhs_airline_handover',
        acceptanceFragments: ['CUTE工作站', 'DCS连通', 'BHS注入口', '航司手册移交'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['自助值机', 'e-gate通道', '证件阅读', '生物识别', '数据追溯'],
        handoverEvidenceType: 'airport_self_service_kiosk_egate_document_biometric_passenger_processing_handover',
        acceptanceFragments: ['自助值机设备', 'e-gate通道', '证件阅读器', '操作手册签认'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['CT安检', '托盘回筐', '图像质检', '报警联动', '安检验收'],
        handoverEvidenceType: 'airport_ct_security_lane_tray_return_image_quality_alarm_acceptance_handover',
        acceptanceFragments: ['CT安检通道', '托盘回筐节拍', '图像质检', '监管验收资料'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['边检e通道', '海关放行', '检疫测温', 'CIQ数据', '主管见证'],
        handoverEvidenceType: 'airport_border_customs_ciq_egate_data_exchange_authority_handover',
        acceptanceFragments: ['边检e通道', '海关申报终端', 'CIQ数据交换', '主管部门手册签认'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['行李源编码', 'BRS事件', '分拣滑槽', 'EBS缓存', 'BHS手册'],
        handoverEvidenceType: 'airport_baggage_makeup_sortation_brs_ebs_throughput_operation_handover',
        acceptanceFragments: ['ATR扫描', '分拣滑槽', 'BRS事件映射', 'BHS维护手册'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['到港转盘', '超规行李', 'BHS提取', 'BRS分配', '异常恢复'],
        handoverEvidenceType: 'airport_baggage_reclaim_carousel_oversized_brs_operation_handover',
        acceptanceFragments: ['到港行李卸载', '超规行李皮带', 'BRS转盘分配', '维护手册签认'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['登机口柜台', '登机牌校验', '登机桥转台', '自动调平', '应急撤桥'],
        handoverEvidenceType: 'airport_boarding_gate_bridge_docking_safety_interlock_operation_handover',
        acceptanceFragments: ['登机口柜台', '登机桥转台', '自动调平', '代理培训'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['AODB', 'FIDS', 'BRS', '广播分区', '航班数据'],
        handoverEvidenceType: 'airport_aodb_fids_brs_pa_clock_data_integration_operations_handover',
        acceptanceFragments: ['点表矩阵', '航班数据源', 'BRS行李跟踪', '信息系统缺陷整改'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['VDGS', 'GPU电源井', 'PCA预制冷风', '机位占用释放', '地服交接'],
        handoverEvidenceType: 'airport_airside_stand_vdgs_gpu_pca_passenger_corridor_handover',
        acceptanceFragments: ['VDGS摄像头', 'GPU地面电源井', 'PCA预制冷风', '地服交接'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-04-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['ORAT场景', '航司开航', '旅客流程', '应急演练', '运行移交'],
        handoverEvidenceType: 'airport_orat_scenario_trial_airline_opening_defect_closeout_operations_handover',
        acceptanceFragments: ['ORAT场景清单', '旅客流程演练', '应急疏散', '运行移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps port terminal berth, yard, equipment, utility, gate, and opening packs tied to operating evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['码头墙', '胸墙', '系船柱预埋', '沉降观测', '分段验收'],
        handoverEvidenceType: 'port_quay_wall_coping_beam_staged_acceptance_berth_interface_handover',
        acceptanceFragments: ['码头墙单元', '胸墙模板', '护舷预埋件', '泊位设备接口'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['系船柱', '橡胶护舷', '快速脱缆钩', '系泊荷载', '靠泊手册'],
        handoverEvidenceType: 'port_bollard_fender_mooring_equipment_berthing_handover',
        acceptanceFragments: ['系船柱基础', '橡胶护舷', '系泊荷载试验', '靠泊手册签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['堆场铺面', '排水沟', '冷藏箱基础', '荷载试验', '交接测量'],
        handoverEvidenceType: 'port_yard_pavement_drainage_trench_load_test_handover',
        acceptanceFragments: ['堆场分区', '基层处理', '排水沟', '运营移交签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['冷藏箱架基础', '供电插座', '接地等电位', 'TOS事件', '假负载送电'],
        handoverEvidenceType: 'port_reefer_rack_power_monitoring_tos_operation_handover',
        acceptanceFragments: ['冷藏箱架基础', '供电插座', 'TOS冷藏箱事件', '监控接口手册'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['岸桥轨道', '铝热焊', '轨距复测', '防风锚定', '运营接收'],
        handoverEvidenceType: 'port_sts_crane_rail_welding_survey_operation_handover',
        acceptanceFragments: ['岸桥轨道', '铝热焊', '轨距水平度', '运营接收签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['RTG', 'RMG', '充电车道', 'TOS指令', '防碰撞'],
        handoverEvidenceType: 'port_rtg_rmg_charging_lane_yard_equipment_commissioning_handover',
        acceptanceFragments: ['充电车道', 'RTG RMG集电接口', 'TOS指令', '作业手册签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['泊位岸电', '电缆卷盘', '船舶插接', '绝缘测试', '投用验收'],
        handoverEvidenceType: 'port_shore_power_cable_reel_vessel_plug_interlock_commissioning_handover',
        acceptanceFragments: ['船舶接口', '电缆卷盘', '保护联锁试验', '投用移交签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['闸口OCR', '地磅', 'TOS接口', '海关接口', '通行测试'],
        handoverEvidenceType: 'port_gate_ocr_weighbridge_tos_customs_lane_integration_handover',
        acceptanceFragments: ['OCR地磅', '箱号车牌识别', 'TOS海关接口', '车道通行高峰'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['消防水泵', '雨水泵站', '隔油设施', '环保监测', '达标排放'],
        handoverEvidenceType: 'port_fire_stormwater_oil_separator_environmental_protection_handover',
        acceptanceFragments: ['消防水泵', '隔油设施', '环保监测', '溢油应急手册'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-04-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['试装卸', '船舶作业', '码头开港', '应急演练', '运营移交'],
        handoverEvidenceType: 'port_trial_cargo_operation_terminal_opening_dispatch_emergency_operations_handover',
        acceptanceFragments: ['试装卸船舶作业计划', 'TOS调度联动', '消防环保溢油', '运营移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps bridge foundation, superstructure, deck, monitoring, and opening packs tied to evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['钻孔桩', '钢筋笼', '泥浆指标', '完整性检测', '桩基验收'],
        handoverEvidenceType: 'bridge_bored_pile_cage_concrete_integrity_foundation_handover',
        acceptanceFragments: ['钻孔桩桩位', '泥浆指标', '完整性检测', '桩基验收资料'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['墩柱模板', '钢筋定位', '垂直度', '混凝土外观', '测量复核'],
        handoverEvidenceType: 'bridge_pier_column_rebar_formwork_verticality_concrete_acceptance_handover',
        acceptanceFragments: ['钢筋定位', '混凝土浇筑', '墩柱垂直度', '盖梁作业面移交'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['预制梁', '台座', '张拉压浆', '梁体编号', '架梁验收'],
        handoverEvidenceType: 'bridge_precast_girder_fabrication_tensioning_transport_erection_handover',
        acceptanceFragments: ['预制梁台座', '预应力张拉', '架梁就位', '预制梁制作运输架设'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['现浇箱梁', '支架预压', '预应力张拉', '孔道压浆', '卸架观测'],
        handoverEvidenceType: 'bridge_cast_in_place_box_girder_support_preload_tensioning_handover',
        acceptanceFragments: ['支架预压', '预拱度', '张拉压浆', '桥面铺装前界面'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['支座安装', '伸缩缝', '桥面防水', '锚固焊接', '闭水检查'],
        handoverEvidenceType: 'bridge_bearing_expansion_joint_deck_waterproofing_acceptance_handover',
        acceptanceFragments: ['支座型号', '伸缩缝槽口', '桥面防水', '桥面铺装'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['桥面铺装', '护栏', '照明排水', '交通标线', '开放验收'],
        handoverEvidenceType: 'bridge_deck_pavement_guardrail_lighting_drainage_traffic_opening_handover',
        acceptanceFragments: ['桥面铺装厚度', '护栏底座', '交通安全设施', '开放验收签认'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['监测传感器', '荷载试验', '结构响应', '缺陷整改', '检测报告'],
        handoverEvidenceType: 'bridge_monitoring_sensor_load_test_defect_rectification_handover',
        acceptanceFragments: ['荷载试验方案', '结构响应', '检测报告', '监测荷载试验'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['桥头搭板', '沉降过渡', '交通安全', '开放条件', '运营移交'],
        handoverEvidenceType: 'bridge_approach_settlement_transition_traffic_safety_opening_handover',
        acceptanceFragments: ['桥头搭板', '开放前', '沉降观测', '开放移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps ultra-high-rise structure, logistics, facade, MEP, and life-safety packs tied to evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['核心筒爬模', '爬升许可', '混凝土放行', '垂直度监测', '安全防护'],
        handoverEvidenceType: 'ultra_high_rise_core_wall_climbing_formwork_cycle_concrete_release_handover',
        acceptanceFragments: ['爬升许可', '混凝土浇筑温控', '垂直度轴线', '下循环作业面移交'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['巨柱节点', '钢骨安装', '栓钉焊接', '混凝土浇筑', '节点验收'],
        handoverEvidenceType: 'ultra_high_rise_mega_column_steel_concrete_node_splice_acceptance_handover',
        acceptanceFragments: ['钢骨分节编号', '栓钉高强螺栓', '钢筋穿插', '巨柱节点'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['伸臂桁架', '转换层', '安装卸载', '焊缝探伤', '变形监测'],
        handoverEvidenceType: 'ultra_high_rise_outrigger_belt_truss_installation_unloading_control_handover',
        acceptanceFragments: ['构件编号', '临时支撑', '卸载步骤', '安装卸载控制'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['高强混凝土', '泵送压力', '温控记录', '堵管应急', '试块强度'],
        handoverEvidenceType: 'ultra_high_rise_high_strength_concrete_pumping_pressure_temperature_handover',
        acceptanceFragments: ['泵送高度', '泵送压力', '堵管停泵', '泵送压力温控'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['塔吊', '施工电梯', '垂直运输', '分区切换', '安全限载'],
        handoverEvidenceType: 'ultra_high_rise_vertical_transport_zoning_switching_safety_handover',
        acceptanceFragments: ['分区计划', '安全限载', '群塔防碰撞', '垂直运输分区切换'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['单元幕墙', '板块吊装', 'BMU接口', '防雷接地', '淋水测试'],
        handoverEvidenceType: 'ultra_high_rise_curtain_wall_unit_bmu_lightning_interface_handover',
        acceptanceFragments: ['单元板块编号', '层间封堵', 'BMU轨道', '单元板块吊装'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['高区泵房', '立管分区', '压力调试', '水锤控制', '联动测试'],
        handoverEvidenceType: 'ultra_high_rise_high_zone_pump_riser_pressure_staging_handover',
        acceptanceFragments: ['分区压力边界', '减压阀', '水锤控制', '分区压力调试'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['避难层', '消防联动', '防排烟', '应急照明', '生命安全'],
        handoverEvidenceType: 'ultra_high_rise_refuge_floor_fire_smoke_evacuation_life_safety_handover',
        acceptanceFragments: ['消防分区', '正压送风', '生命安全系统', '疏散联动资料'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps utility tunnel traffic, structure, waterproofing, pipeline-entry, safety, and handover packs tied to evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['交通导改', '围挡封闭', '监测基线', '管线探测', '交安设施'],
        handoverEvidenceType: 'utility_tunnel_traffic_diversion_enclosure_monitoring_baseline_handover',
        acceptanceFragments: ['交通导改范围', '管线探测', '监测基准点', '交通主管确认'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['支护开挖', '降排水', '分层开挖', '地基处理', '基底验收'],
        handoverEvidenceType: 'utility_tunnel_support_excavation_dewatering_foundation_treatment_handover',
        acceptanceFragments: ['支护开挖降排水', '分层开挖标高', '地基处理承载力', '基底验槽'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['现浇管廊', '底板墙顶板', '施工缝', '预埋套管', '结构验收'],
        handoverEvidenceType: 'utility_tunnel_cast_in_place_structure_rebar_formwork_joint_acceptance_handover',
        acceptanceFragments: ['底板墙顶板', '预埋套管', '结构尺寸', '结构验收资料'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['预制节段', '吊装就位', '接缝灌浆', '线形复核', '拼装验收'],
        handoverEvidenceType: 'utility_tunnel_precast_segment_hoisting_joint_grouting_alignment_handover',
        acceptanceFragments: ['预制管廊节段编号', '节段吊装就位', '接缝止水', '预制综合管廊节段吊装'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防水变形缝', '穿墙套管', '闭水试验', '渗漏整改', '防水验收'],
        handoverEvidenceType: 'utility_tunnel_waterproof_joint_sleeve_closed_water_test_handover',
        acceptanceFragments: ['防水等级', '穿墙套管封堵', '闭水或淋水试验', '防水变形缝穿墙套管'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['支架桥架', '接地系统', '标识编号', '防火封堵', '安装验收'],
        handoverEvidenceType: 'utility_tunnel_bracket_cable_tray_grounding_identification_handover',
        acceptanceFragments: ['支架桥架接地', '接地干线', '标识编号资产台账', '管线入廊作业面'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['管线入廊', '给水电力通信热力', '接口编号', '入廊许可', '分舱管理'],
        handoverEvidenceType: 'utility_tunnel_pipeline_cabin_entry_pressure_interface_permit_handover',
        acceptanceFragments: ['入廊清单', '给水试压', '入廊许可安全交底', '运营维护责任边界'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-09',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['消防通风', '排水泵', '气体监测', '联动测试', '安全系统'],
        handoverEvidenceType: 'utility_tunnel_fire_ventilation_drainage_gas_monitoring_safety_system_handover',
        acceptanceFragments: ['气体监测点位矩阵', '排水泵消防设备', '气体监测报警', '安全系统正式扩展'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-10',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['运营接管', '移交闭合', '资产台账', '培训演练', '竣工资料'],
        handoverEvidenceType: 'utility_tunnel_operations_takeover_asset_permit_training_closeout_handover',
        acceptanceFragments: ['运营接管范围', '钥匙权限账号', '入廊许可流程', '移交闭合资料'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps MiC, prefab bathroom, and prefab kitchen factory-to-site packs evidence-rich enough for real scheduling', () => {
    expect(processEvidenceProfileCodesByPrefix('IBU').size, 'prefab bathroom evidence profile count')
      .toBeGreaterThanOrEqual(8)
    expect(processEvidenceProfileCodesByPrefix('IKU').size, 'prefab kitchen evidence profile count')
      .toBeGreaterThanOrEqual(8)
    expect(processEvidenceProfileCodesByPrefix('MIC').size, 'MiC evidence profile count')
      .toBeGreaterThanOrEqual(9)

    const expectations = [
      {
        templateId: 'china-prefab-bathroom-specialty',
        code: 'IBU-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['尺寸深化', '首件验证', '底盘坡度', '排水接口', '资料签认'],
        handoverEvidenceType: 'prefab_bathroom_dimension_prototype_base_pan_drainage_first_article_handover',
        acceptanceFragments: ['首件验证计划', '地漏坡度', '首件渗漏', '工厂放行签认'],
      },
      {
        templateId: 'china-prefab-bathroom-specialty',
        code: 'IBU-03-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['工厂保压', '漏电保护', '通水通电', 'FAT整改', '出厂移交'],
        handoverEvidenceType: 'prefab_bathroom_factory_water_power_trial_run_fat_handover',
        acceptanceFragments: ['工厂保压复测', '漏电保护动作', 'FAT问题清单', '出厂移交签认'],
      },
      {
        templateId: 'china-prefab-bathroom-specialty',
        code: 'IBU-03-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['现场到货', '批量验收', '快接接口', '闭水通水', '分户移交'],
        handoverEvidenceType: 'prefab_bathroom_site_batch_acceptance_quick_connect_unit_handover',
        acceptanceFragments: ['批量到货', '快接接口', '分户验收问题', '分户签认'],
      },
      {
        templateId: 'china-prefab-kitchen-specialty',
        code: 'IKU-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['厨房模块深化', '柜体台面', '样板确认', '样板整改', '资料归档'],
        handoverEvidenceType: 'prefab_kitchen_module_design_mockup_release_handover',
        acceptanceFragments: ['厨房模块深化', '水槽灶具', '样板问题整改', '样板资料归档'],
      },
      {
        templateId: 'china-prefab-kitchen-specialty',
        code: 'IKU-03-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['工厂通电', '通气试运行', '电器功能', '燃气气密', 'FAT整改'],
        handoverEvidenceType: 'prefab_kitchen_factory_power_gas_trial_run_fat_handover',
        acceptanceFragments: ['通电通气试运行', '电器功能', '模拟燃气气密', '验收移交签认'],
      },
      {
        templateId: 'china-prefab-kitchen-specialty',
        code: 'IKU-03-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['现场到货', '水电燃气排烟', '联动复测', '分户移交', '问题整改'],
        handoverEvidenceType: 'prefab_kitchen_site_batch_acceptance_mep_gas_exhaust_handover',
        acceptanceFragments: ['现场批量到货', '水电燃气排烟', '分户接口缺陷', '分户签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['模块拆分', '编码接口', '样板模块', '吊点重心', '拆分冻结'],
        handoverEvidenceType: 'mic_module_breakdown_mockup_transport_boundary_first_article_handover',
        acceptanceFragments: ['模块拆分编码', '样板模块首件', '运输尺寸吊点', '拆分冻结签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-02-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['带电带水', '系统联动', '故障排查', '出厂条件', '工厂试运转'],
        handoverEvidenceType: 'mic_factory_water_power_trial_operation_fat_handover',
        acceptanceFragments: ['带电带水试运行', '系统联动故障', 'FAT签认', '试运行验收移交'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['吊点重心', '临时支撑', '起吊试吊', '轴线微调', '吊装验收'],
        handoverEvidenceType: 'mic_site_module_hoisting_temporary_support_alignment_handover',
        acceptanceFragments: ['吊点重心', '临时支撑胎架', '轴线微调', '验收资料'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-05-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['模块接缝', '防水节点', '给排水快接', '防火封堵', '整栋联动'],
        handoverEvidenceType: 'mic_site_module_joint_waterproof_mep_interface_integrated_handover',
        acceptanceFragments: ['防水节点', '给排水快接', '整栋功能回归', '整栋移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps life-safety and MEP commissioning packs tied to typed evidence and operational handover checkpoints', () => {
    for (const prefix of ['FIR', 'ELE', 'PLU', 'HVA', 'INT']) {
      expect(processEvidenceProfileCodesByPrefix(prefix).size, `${prefix} evidence profile count`)
        .toBeGreaterThanOrEqual(1)
    }

    const expectations = [
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-03-02-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['联动矩阵', '防排烟逻辑', '消防水逻辑', '全场景模拟', '第三方检测'],
        handoverEvidenceType: 'fire_linkage_matrix_full_scenario_third_party_issue_acceptance_handover',
        acceptanceFragments: ['设备点位编码', '联动逻辑测试', '全场景模拟', '验收意见'],
      },
      {
        templateId: 'china-electrical-system',
        code: 'ELE-05-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['供电方案', '送电窗口', '操作票', '继电保护', '负荷试运行'],
        handoverEvidenceType: 'electrical_formal_power_energization_load_trial_temporary_power_closeout_handover',
        acceptanceFragments: ['倒闸操作票', '继电保护整定', '正式送电许可', '运维移交签认'],
      },
      {
        templateId: 'china-plumbing-heating-system',
        code: 'PLU-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['设备基础', '排水条件', '泵组阀门', '自动切换', '报警联动'],
        handoverEvidenceType: 'plumbing_pump_room_equipment_auto_switch_alarm_operation_handover',
        acceptanceFragments: ['泵组阀门管路', '自动切换', '运维点位台账', '运维交接签认'],
      },
      {
        templateId: 'china-hvac-system',
        code: 'HVA-02-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['调试方案', '测点确认', '风量平衡', '水力平衡', '季节工况'],
        handoverEvidenceType: 'hvac_air_water_balance_seasonal_condition_commissioning_report_handover',
        acceptanceFragments: ['测点清单', '风量平衡', '自控逻辑', '系统调试报告'],
      },
      {
        templateId: 'china-intelligent-building-system',
        code: 'INT-04-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['机房等级', '设备容量', '光纤链路', '动环监控', '资产台账'],
        handoverEvidenceType: 'intelligent_core_room_network_dynamic_environment_runbook_asset_handover',
        acceptanceFragments: ['机房等级容量', '网络冗余', '动环监控', '资产移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps dangerous works, building-detail, and elevator packs tied to explicit evidence profiles', () => {
    for (const prefix of ['DANGER', 'BDT', 'ELV']) {
      expect(processEvidenceProfileCodesByPrefix(prefix).size, `${prefix} evidence profile count`)
        .toBeGreaterThanOrEqual(1)
    }

    const expectations = [
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['深基坑识别', '危大清单', '支护降水方案', '监测点', '预警处置'],
        handoverEvidenceType: 'danger_deep_pit_plan_expert_review_monitoring_acceptance_closeout_handover',
        acceptanceFragments: ['开挖深度', '专家论证', '监测报告', '专项验收'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['高支模识别', '荷载跨度', '立杆基础', '浇筑监测', '拆除条件'],
        handoverEvidenceType: 'danger_high_formwork_plan_load_frame_monitoring_acceptance_closeout_handover',
        acceptanceFragments: ['搭设高度跨度', '架体构造验收', '拆模申请', '资料移交'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-08',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['支护降水监测', '监测点布设', '报警阈值', '降水运行', '专项验收'],
        handoverEvidenceType: 'danger_deep_pit_entity_support_dewatering_monitoring_acceptance_handover',
        acceptanceFragments: ['监测点布设', '报警阈值', '第三方监测报告', '专项验收移交'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['标准层控制线', '铝模爬架', '混凝土浇筑', '实测实量', '流水节拍'],
        handoverEvidenceType: 'building_standard_floor_cycle_structure_measurement_punchlist_handover',
        acceptanceFragments: ['楼层流水节拍', '实测实量', '问题销项', '移交'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['地下室结构', '防水保护层', '底板钢筋', '外墙止水', '渗漏检查'],
        handoverEvidenceType: 'building_basement_structure_waterproof_joint_entity_leakage_handover',
        acceptanceFragments: ['底板钢筋', '外墙施工缝', '实体检测', '作业面移交'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-01-01-05',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['地库管综', '支吊架排布', '防火封堵', '试压绝缘', '作业面移交'],
        handoverEvidenceType: 'building_basement_mep_coordination_pressure_insulation_firestop_commissioning_handover',
        acceptanceFragments: ['管综深化冻结', '防火分区', '联动调试', '运维界面'],
      },
      {
        templateId: 'china-elevator-installation',
        code: 'ELV-01-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['井道尺寸', '垂直度', '机房土建', '样板架', '土建交接'],
        handoverEvidenceType: 'elevator_hoistway_machine_room_template_frame_civil_handover',
        acceptanceFragments: ['井道尺寸', '机房承重梁', '底坑防水', '土建交接'],
      },
      {
        templateId: 'china-elevator-installation',
        code: 'ELV-02-01-02',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['慢车调试', '快车曲线', '监督检验', '使用登记', '维保交接'],
        handoverEvidenceType: 'elevator_commissioning_supervision_inspection_registration_maintenance_handover',
        acceptanceFragments: ['慢车调试', '监督检验', '消防迫降', '维保交接'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps crane, fire, elevator, BIM, concrete, subcontractor, and room-network handovers evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['起重吊装识别', '塔吊安拆', '吊装工况', '顶升附着', '联合验收'],
        handoverEvidenceType: 'danger_crane_tower_install_lift_condition_joint_acceptance_handover',
        acceptanceFragments: ['吊装半径', '专家论证', '顶升附着', '使用登记'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['大跨度钢结构', '吊装分段', '卸载转换', '变形复测', '专项验收'],
        handoverEvidenceType: 'danger_long_span_steel_lifting_unloading_deformation_acceptance_handover',
        acceptanceFragments: ['吊点工况', '卸载转换', '整体变形复测', '专项验收'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-05-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['消防专项验收', '验收意见', '整改复验', '运维交接', '资料归档'],
        handoverEvidenceType: 'fire_authority_acceptance_issue_retest_system_operation_handover',
        acceptanceFragments: ['验收申报资料', '验收意见问题清单', '操作培训', '运维交接'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-07-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['消防泵房', '水池水箱', '稳压系统', '末端试水', '验收移交'],
        handoverEvidenceType: 'fire_pump_room_tank_stabilization_end_water_alarm_handover',
        acceptanceFragments: ['泵房土建', '水池水箱', '末端试水', '运行交接'],
      },
      {
        templateId: 'china-elevator-installation',
        code: 'ELV-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['导轨支架', '导轨垂直度', '层门门锁', '门锁间隙', '层门验收'],
        handoverEvidenceType: 'elevator_guide_rail_landing_door_lock_acceptance_handover',
        acceptanceFragments: ['导轨支架定位', '层门门锁间隙', '导轨层门安装偏差', '移交签认'],
      },
      {
        templateId: 'china-elevator-installation',
        code: 'ELV-02-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['曳引机', '限速器', '钢丝绳张力', '安全钳缓冲器', '整机自检'],
        handoverEvidenceType: 'elevator_traction_car_control_safety_device_self_inspection_handover',
        acceptanceFragments: ['主机曳引轮', '安全钳缓冲器', '空载运行', '监督检验移交'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-05-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['BIM实施策划', '模型责任矩阵', 'LOD精度', '问题关闭', '版本冻结'],
        handoverEvidenceType: 'building_bim_model_lod_review_issue_closeout_construction_handover',
        acceptanceFragments: ['交付深度', 'LOD精度', '模型问题关闭', '施工交底移交'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-05-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['碰撞检查', '专业模型冻结', '净高净宽', '碰撞消项', '施工交底'],
        handoverEvidenceType: 'building_bim_clash_clearance_access_issue_closeout_handover',
        acceptanceFragments: ['碰撞检查范围', '净高净宽', '碰撞问题消项', '施工交底移交'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-07-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['大体积混凝土', '测温点', '温控曲线', '裂缝观测', '裂缝修补'],
        handoverEvidenceType: 'building_mass_concrete_temperature_crack_control_closeout_handover',
        acceptanceFragments: ['温控目标', '中心表面温差', '裂缝风险', '温控成果'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-08-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['分包进场', '合同范围', '穿插条件', '作业面移交', '进场验收'],
        handoverEvidenceType: 'building_subcontractor_entry_interface_readiness_acceptance_handover',
        acceptanceFragments: ['分包合同范围', '作业面移交', '穿插障碍清单', '进场验收'],
      },
      {
        templateId: 'china-intelligent-building-system',
        code: 'INT-01-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['机房环境', '网络设备', '光纤链路', '动环监控', '系统联调'],
        handoverEvidenceType: 'intelligent_room_network_equipment_linkage_asset_handover',
        acceptanceFragments: ['机柜列位', '链路测试', '动环监控', '运维交接'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps waterproofing, facade, decoration, outdoor, and municipal packs evidence-rich for closeout handover', () => {
    for (const prefix of ['WPI', 'FAC', 'DEC', 'OUT', 'MUN']) {
      expect(processEvidenceProfileCodesByPrefix(prefix).size, `${prefix} evidence profile count`)
        .toBeGreaterThanOrEqual(1)
    }

    const expectations = [
      {
        templateId: 'china-waterproof-insulation',
        code: 'WPI-01-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['地下室防水', '接缝附加层', '穿墙管根', '隐蔽影像', '渗漏复测'],
        handoverEvidenceType: 'waterproof_basement_joint_pipe_root_hidden_image_leakage_closeout_handover',
        acceptanceFragments: ['基层含水率', '隐蔽影像编号', '渗漏检查', '保护层移交'],
      },
      {
        templateId: 'china-facade-curtain-wall',
        code: 'FAC-02-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['四性试验', '淋水试验', '层间封堵', '防雷接地', '性能报告'],
        handoverEvidenceType: 'facade_four_property_water_test_firestop_lightning_performance_handover',
        acceptanceFragments: ['四性试验资料', '系统淋水试验', '防雷接地测试', '交付交接签认'],
      },
      {
        templateId: 'china-jgj-tianjin-decoration',
        code: 'DEC-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['厨卫防水', '闭水试验', '渗漏修补', '二次闭水', '湿区交接'],
        handoverEvidenceType: 'decoration_wet_area_waterproof_ponding_retest_household_handover',
        acceptanceFragments: ['管根门槛', '二次闭水试验', '分户验收', '交接签认'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-02-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['室外管线', '测量放线', '闭水试验', 'CCTV检测', '回填压实'],
        handoverEvidenceType: 'outdoor_pipeline_closed_water_cctv_backfill_road_reinstatement_handover',
        acceptanceFragments: ['权属接口清单', '接口渗漏整改', 'CCTV检测', '运维移交签认'],
      },
      {
        templateId: 'china-gb55032-2022-municipal',
        code: 'MUN-04-02-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['既有管线探查', '权属交底', '迁改方案', '功能复测', '权属验收'],
        handoverEvidenceType: 'municipal_existing_utility_relocation_owner_acceptance_handover',
        acceptanceFragments: ['权属单位交底', '停复供窗口', '权属单位现场验收', '运行移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps medical cleanroom, industrial cleanroom, TOD, MiC, prefab, steel, and danger packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-03-01-01',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['放射防护', '医废暂存', '医疗污水', '护理接口', '卫监验收'],
        handoverEvidenceType: 'cleanroom_medical_radiation_wastewater_infection_control_composite_handover',
        acceptanceFragments: ['放射防护', '医废暂存间', '医疗污水预处理', '医疗专项验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-04-02-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['URS边界', 'SAT范围', '试生产放行', '报警趋势', '投产复测'],
        handoverEvidenceType: 'industrial_cleanroom_factory_sat_trial_run_release_training_handover',
        acceptanceFragments: ['SAT测试项', '关键参数连续稳定', '试生产切换', '培训投产放行'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-05-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['装配率核定', '构件清单', '竣工资料', '质量证明', '交付签认'],
        handoverEvidenceType: 'modular_mic_assembly_rate_completion_delivery_quality_certificate_handover',
        acceptanceFragments: ['装配率计算边界', '模块编号二维码', '维保责任边界', '竣工交付'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['商业开口', '市政接驳', '运营边界', '消防疏散', '站城接口'],
        handoverEvidenceType: 'tod_station_city_commercial_municipal_interface_operation_handover',
        acceptanceFragments: ['站厅商业开口', '地铁运营保护区', '消防疏散', '站城商业接口'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-01-01-09',
        expectedProcessCount: 13,
        firstEvidenceFragments: ['重型PC构件', '吊点复核', '吊具索具', '试吊记录', '监测数据'],
        handoverEvidenceType: 'prefab_heavy_long_component_trial_lift_monitoring_deviation_closeout_handover',
        acceptanceFragments: ['构件重量重心', '试吊离地', '监测数据异常', '重型构件移交'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-03-01-01',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['楼承板排版', '栓钉焊接', '洞口边模', '金属围护', '淋水复查'],
        handoverEvidenceType: 'steel_deck_stud_metal_envelope_water_test_leakage_closeout_handover',
        acceptanceFragments: ['楼承板排版', '栓钉焊接', '围护系统淋水复查', '收口销项'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-16',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['网架拼装', '支座复核', '临时支撑', '整体提升', '专项验收'],
        handoverEvidenceType: 'danger_space_frame_membrane_integral_lifting_monitoring_unloading_acceptance_handover',
        acceptanceFragments: ['整体提升专项条件', '同步监测', '卸载转换', '专项验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['URS节拍', '样板范围', '首件验证', '节拍测试', '批量放行'],
        handoverEvidenceType: 'industrial_cleanroom_urs_mockup_first_article_batch_release_handover',
        acceptanceFragments: ['URS节拍边界', '首件验证', '批量施工放行', '样板确认闭合'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps automation, MiC logistics, and dangerous entity work evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['AGV接口', 'ASRS立库', '节拍边界', '堵料恢复', 'SAT验收'],
        handoverEvidenceType: 'industrial_cleanroom_agv_asrs_interface_recovery_sat_handover',
        acceptanceFragments: ['安全联锁', '异常恢复场景', 'WMS/MES/PLC', 'SAT验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['重型设备基础', '标高轴线', '二次灌浆', '单机SAT', '移交闭合'],
        handoverEvidenceType: 'industrial_cleanroom_heavy_equipment_foundation_grouting_sat_handover',
        acceptanceFragments: ['重型设备基础', '吊装窗口', '设备就位', '单机SAT点检'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['工厂深化', '接口清单', '模型冻结', '样板确认', '接口冻结'],
        handoverEvidenceType: 'modular_mic_factory_detailing_interface_freeze_mockup_handover',
        acceptanceFragments: ['模型版本', '结构机电内装', '样板模块', '工厂深化接口冻结'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['超限运输', '路径踏勘', '桥涵限高', '运输保护', '到场记录'],
        handoverEvidenceType: 'modular_mic_oversize_transport_route_protection_arrival_handover',
        acceptanceFragments: ['超限运输审批', '运输车辆支架', '临时交通组织', '运输损伤整改'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['现场卸车', '吊点复核', '外观检查', '临时堆放', '模块接收'],
        handoverEvidenceType: 'modular_mic_site_unloading_lift_point_storage_receipt_handover',
        acceptanceFragments: ['现场卸车吊点', '临时支垫', '到场缺陷清单', '现场接收确认'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-01',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['塔吊基础', '承载力复核', '附墙验收', '顶升记录', '安拆归档'],
        handoverEvidenceType: 'danger_tower_crane_foundation_attachment_jacking_acceptance_handover',
        acceptanceFragments: ['塔吊基础定位', '标准节附着装置', '顶升附着过程', '使用登记'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-02',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['施工升降机基础', '附墙检测', '防坠器', '层门联锁', '资料归档'],
        handoverEvidenceType: 'danger_construction_hoist_foundation_attachment_anti_fall_acceptance_handover',
        acceptanceFragments: ['施工升降机基础', '防坠器限速器', '附墙垂直度', '使用登记'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-03',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['脚手架基础', '连墙件', '卸料平台', '吊篮验收', '拆除恢复'],
        handoverEvidenceType: 'danger_scaffold_platform_gondola_tie_acceptance_dismantle_handover',
        acceptanceFragments: ['连墙件条件', '卸料平台限载', '使用过程巡检', '拆除恢复'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps high-formwork, climbing-formwork, prefab lifting, and trenchless danger work evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-04',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['高支模基础', '承载力复核', '支架验收', '浇筑监测', '拆除归档'],
        handoverEvidenceType: 'danger_high_formwork_support_pour_monitoring_dismantle_handover',
        acceptanceFragments: ['高大模板支撑基础', '混凝土浇筑顺序', '分段拆除', '验收移交'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-05',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['工具式模板', '附着支承', '爬升验收', '防坠装置', '拆除恢复'],
        handoverEvidenceType: 'danger_climbing_formwork_attachment_synchronous_lift_acceptance_handover',
        acceptanceFragments: ['附着支承', '首次提升', '爬升过程', '拆除恢复'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-06',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['预制构件吊装', '吊点吊具', '构件编号', '试吊记录', '安全验收'],
        handoverEvidenceType: 'danger_prefab_component_lifting_trial_fixing_safety_acceptance_handover',
        acceptanceFragments: ['吊点吊具', '试吊就位', '正式吊装', '资料移交'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-02-01-07',
        expectedProcessCount: 7,
        firstEvidenceFragments: ['暗挖顶管盾构', '管线复核', '监测点', '沉降报警', '专项验收'],
        handoverEvidenceType: 'danger_trenchless_pipe_jacking_shield_monitoring_acceptance_handover',
        acceptanceFragments: ['周边环境既有管线', '掘进顶进参数', '地表沉降', '专项验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps prefab transport, vertical lifting, and composite slab evidence-rich without overwriting mature prefab profiles', () => {
    const expectations = [
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-01-01-03',
        expectedProcessCount: 14,
        firstEvidenceFragments: ['墙板柱吊装', '垂直度', '临时支撑', '连接节点', '竖向构件'],
        handoverEvidenceType: 'prefab_wall_column_lifting_alignment_support_connection_acceptance_handover',
        acceptanceFragments: ['构件编号重量', '临时支撑', '安装偏差复测', '竖向构件安装验收'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-01-01-04',
        expectedProcessCount: 13,
        firstEvidenceFragments: ['叠合板支撑', '叠合梁标高', '拼缝处理', '现浇层钢筋', '卸载条件'],
        handoverEvidenceType: 'prefab_composite_slab_beam_support_cast_in_place_curing_unload_handover',
        acceptanceFragments: ['支撑体系承载', '现浇层钢筋', '支撑卸载强度', '移交签认'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-00-01-03',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['运输路线', '超限报备', '构件编号', '堆场接收', '整改闭合'],
        handoverEvidenceType: 'prefab_component_transport_yard_receipt_defect_closeout_handover',
        acceptanceFragments: ['运输方案路线', '堆场承载', '缺陷登记', '吊装移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps BDT, FIR, PFB, DANGER, and FND newly thickened packs tied to explicit evidence checkpoints', () => {
    const expectations = [
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-01-01-03',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['预留预埋', '洞口图', '套管线盒', '联合隐蔽', '防火防水'],
        handoverEvidenceType: 'building_embedded_opening_fire_waterstop_hidden_image_handover',
        acceptanceFragments: ['洞口图复核', '套管线盒', '联合隐蔽', '防火防水封堵'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['喷淋深化', '管综碰撞', '喷头点位', '管材阀件', '试压冲洗'],
        handoverEvidenceType: 'fire_sprinkler_pressure_flush_terminal_water_flow_alarm_handover',
        acceptanceFragments: ['喷淋深化排布', '试压冲洗', '末端试水', '联动测试'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-02-01-04',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['接缝基层', '密封胶', '防火封堵', '淋水试验', '隐蔽复核'],
        handoverEvidenceType: 'prefab_joint_waterproof_firestop_hidden_leakage_retest_handover',
        acceptanceFragments: ['接缝宽度深度', '密封胶复验', '防火封堵', '渗漏整改'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-06',
        expectedProcessCount: 6,
        firstEvidenceFragments: ['临电专项方案', '负荷计算', 'TN-S', '漏保', '接地'],
        handoverEvidenceType: 'danger_temporary_power_acceptance_grounding_leakage_protection_handover',
        acceptanceFragments: ['负荷计算', '接地测试', '漏保试跳', '挂牌资料归档'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['处理范围', '标高复核', '材料配合比', '分层检测', '静载试验'],
        handoverEvidenceType: 'foundation_ground_treatment_composite_static_load_retest_handover',
        acceptanceFragments: ['处理范围', '分层检测', '静载试验', '承载力复测'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps prefab facade, fire inspection, heavy lifting, steel coating, and IQ packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-01-01-07',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['PCF外挂墙板', '吊装就位', '连接件', '保温防水', '淋水验收'],
        handoverEvidenceType: 'prefab_pcf_facade_panel_lifting_connection_water_test_handover',
        acceptanceFragments: ['外挂墙板吊装', '连接件复核', '保温防水', '淋水验收'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-05-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['消防检测', '检测见证', '水系统', '报警联动', '问题销项'],
        handoverEvidenceType: 'fire_detection_report_issue_retest_acceptance_handover',
        acceptanceFragments: ['检测报告', '问题销项', '复检报告', '验收意见'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-14',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['重型超长PC', '危大识别', '吊点吊具', '试吊', '监测闭合'],
        handoverEvidenceType: 'danger_heavy_pc_lifting_trial_monitoring_acceptance_handover',
        acceptanceFragments: ['吊装方案', '吊点吊具', '试吊记录', '专项验收'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-02-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['基层除锈', '环境条件', '涂层厚度', '防火涂料', '粘结强度'],
        handoverEvidenceType: 'steel_anticorrosion_fireproof_coating_thickness_retest_handover',
        acceptanceFragments: ['基层除锈', '涂层厚度', '粘结强度', '防火涂料厚度'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-03',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['安装确认', 'URS', 'DQ', 'IQ', '偏差整改'],
        handoverEvidenceType: 'industrial_cleanroom_iq_installation_confirmation_deviation_closeout_handover',
        acceptanceFragments: ['安装确认方案', 'URS/DQ', '仪表回路', 'IQ报告'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps charging-pile, post-cast, smoke-control, sliding-grid, and facade-height packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-09-01-02',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['充电桩预留', '套管', '配电容量', '电源接口', '土建机电移交'],
        handoverEvidenceType: 'charging_pile_civil_mep_interface_closeout_handover',
        acceptanceFragments: ['预留套管复核', '供电接口复测', '车位编号台账', '移交签认'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-02-01-03',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['后浇带', '现浇层', '钢筋模板', '浇筑养护', '强度报告'],
        handoverEvidenceType: 'prefab_cast_in_place_joint_concrete_strength_handover',
        acceptanceFragments: ['基层凿毛湿润', '钢筋复核', '模板封闭', '试块强度'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-02-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['防排烟', '风量风压', '严密性', '排烟口', '联动测试'],
        handoverEvidenceType: 'fire_smoke_control_airflow_test_acceptance_handover',
        acceptanceFragments: ['风管材料复验', '风量风压记录', '严密性测试', '检测整改'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-19',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['网架滑移', '牵引同步', '滑移轨道', '就位偏差', '变形监测'],
        handoverEvidenceType: 'steel_space_grid_sliding_position_deformation_handover',
        acceptanceFragments: ['轨道复核', '牵引设备调试', '分级滑移记录', '变形数据归档'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['幕墙高处作业', '吊篮', '临边防护', '坠落防护', '作业许可'],
        handoverEvidenceType: 'danger_facade_height_work_protection_acceptance_handover',
        acceptanceFragments: ['高处作业识别', '吊篮验收', '防护巡查', '人员交底'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps MEP mockup, gas extinguishing, assembly-rate, steel-material, and class-100 OR packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-06-01-07',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['机电样板', '支吊架', '管综冻结', '试压保温', '样板放行'],
        handoverEvidenceType: 'building_mep_mockup_pressure_insulation_standard_release_handover',
        acceptanceFragments: ['支吊架验收', '试压记录', '保温复测', '样板标准放行'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-04-02-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['气体灭火', '保护区', '钢瓶间', '模拟喷放', '泄压口'],
        handoverEvidenceType: 'fire_gas_extinguishing_simulation_cylinder_room_handover',
        acceptanceFragments: ['保护区条件', '瓶组验收', '模拟释放', '钢瓶间交接'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-03-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['装配率', '计分项', '第三方评估', '专项验收', '备案资料'],
        handoverEvidenceType: 'prefab_assembly_rate_government_acceptance_filing_handover',
        acceptanceFragments: ['构件清单锁定', '计分复核', '评估报告', '备案回执'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['钢材复验', '焊材烘干', '高强螺栓', '摩擦面', '复验报告'],
        handoverEvidenceType: 'steel_material_bolt_welding_consumable_retest_handover',
        acceptanceFragments: ['批次核验', '螺栓抽样', '焊材记录', '不合格处置'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-13',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['百级手术部', '高效过滤器', '压差梯度', '悬浮粒子', '连续运行'],
        handoverEvidenceType: 'cleanroom_class100_or_hvac_validation_handover',
        acceptanceFragments: ['过滤器检漏', '压差调试', '粒子检测', '院感移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps MiC FAT, TOD vertical transfer, SI/ALC, firestop monitoring, and waterproof mockup packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-10',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['FAT', '模块编号', '通水通电', '缺陷清单', '出厂放行'],
        handoverEvidenceType: 'mic_factory_fat_defect_closeout_release_handover',
        acceptanceFragments: ['FAT方案', '系统试运行', '缺陷复测', '出厂签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-10',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['竖向交通', '扶梯电梯', '换乘接口', '流线验收', '运营接口'],
        handoverEvidenceType: 'tod_vertical_transport_transfer_interface_handover',
        acceptanceFragments: ['接口放线', '设备接驳', '换乘流线复核', '运营检查'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-02-01-05',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['SI管线', 'ALC排板', '轻质隔墙', '板缝抗裂', '装配率证据'],
        handoverEvidenceType: 'prefab_si_alc_partition_hidden_acceptance_handover',
        acceptanceFragments: ['管线分离冻结', 'ALC复验', '隔墙安装', '隐蔽移交'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-04-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['防火门', '监控信号', '防火封堵', '穿墙穿楼板', '完整性验收'],
        handoverEvidenceType: 'fire_door_monitoring_firestop_integrity_handover',
        acceptanceFragments: ['范围清单', '材料复验', '封堵影像', '完整性签认'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-06-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防水样板', '附加层', '闭水', '淋水', '样板放行'],
        handoverEvidenceType: 'building_waterproof_mockup_ponding_spray_release_handover',
        acceptanceFragments: ['基层复核', '附加层收头', '闭水淋水记录', '大面放行'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps prefab stair, interleaving, oxygen-station, hydraulic-lift, and hydrant packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-01-01-05',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['预制楼梯', '支承面', '预埋件', '吊装就位', '成品保护'],
        handoverEvidenceType: 'prefab_stair_hoisting_support_node_product_protection_handover',
        acceptanceFragments: ['支承面复核', '连接节点', '防滑限位', '偏差复测'],
      },
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-09-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['楼层穿插', '作业面放行', '障碍清单', '节奏复核', '移交闭合'],
        handoverEvidenceType: 'building_floor_interleaving_workface_release_rhythm_handover',
        acceptanceFragments: ['楼层条件', '穿插障碍', '节奏复核', '问题闭合'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-06',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['医用氧气', '气源站', '汇流排', '报警屏', '压力测试'],
        handoverEvidenceType: 'medical_oxygen_station_pressure_alarm_pipeline_handover',
        acceptanceFragments: ['设备基础', '管道吹扫', '压力流量', '报警联调'],
      },
      {
        templateId: 'china-steel-structure-specialty',
        code: 'STL-04-01-20',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['液压整体提升', '提升点', '同步控制', '姿态监测', '就位锁定'],
        handoverEvidenceType: 'steel_hydraulic_lifting_synchronization_position_lock_handover',
        acceptanceFragments: ['提升设备调试', '分级提升', '姿态复测', '就位签认'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-01-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['消火栓箱', '立管阀门', '水压测试', '远程启泵', '充实水柱'],
        handoverEvidenceType: 'fire_hydrant_pressure_remote_start_full_water_column_handover',
        acceptanceFragments: ['箱体定位', '管网试压', '远程启泵', '功能验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps indoor-air, substation, plumbing-shaft, HVAC-plantroom, and facade-window packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-jgj-tianjin-decoration',
        code: 'DEC-03A-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['封闭条件', '采样点位', '甲醛TVOC', '超标治理', '复测达标'],
        handoverEvidenceType: 'decoration_indoor_air_sampling_treatment_retest_delivery_release_handover',
        acceptanceFragments: ['封闭条件', '检测机构', '采样记录', '污染源', '治理记录', '复测报告', '交付放行'],
      },
      {
        templateId: 'china-electrical-system',
        code: 'ELE-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['配电室移交', '柜体母线', '继保整定', '局放测试', '送电验收'],
        handoverEvidenceType: 'electrical_substation_switchgear_relay_partial_discharge_energization_handover',
        acceptanceFragments: ['土建环境', '设备进场', '基础槽钢', '母线连接', '继保试验', '局放报告', '送电签认'],
      },
      {
        templateId: 'china-plumbing-heating-system',
        code: 'PLU-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['管井净空', '套管复核', '阀门编号', '分区试压', '防火封堵'],
        handoverEvidenceType: 'plumbing_shaft_riser_pressure_flushing_firestop_hidden_acceptance_handover',
        acceptanceFragments: ['管井移交', '立管支架', '阀门编号', '通球冲洗', '封堵隐蔽', '流向标识', '分层签认'],
      },
      {
        templateId: 'china-hvac-system',
        code: 'HVA-03-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['机房移交', '设备基础', '阀组仪表', '自控接口', '群控联调'],
        handoverEvidenceType: 'hvac_plantroom_equipment_piping_controls_balancing_operations_handover',
        acceptanceFragments: ['土建条件', '减振措施', '设备就位', '管道冲洗', '单机试运', '群控参数', '运维交接'],
      },
      {
        templateId: 'china-facade-curtain-wall',
        code: 'FAC-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['洞口复核', '外窗塞缝', '窗边防水', '栏杆预埋', '启闭淋水'],
        handoverEvidenceType: 'facade_window_railing_louver_waterproof_lightning_safety_handover',
        acceptanceFragments: ['洞口尺寸', '框体固定', '防水收口', '栏杆锚固', '百叶排水', '防雷防腐', '淋水观感'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps exterior-wall waterproof, sponge, fire-control-room, BMS, and scaffold packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-waterproof-insulation',
        code: 'WPI-01-01-04',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['外墙基层', '防水附加层', '保护板', '回填压实', '隐蔽影像'],
        handoverEvidenceType: 'waterproof_basement_exterior_wall_protection_backfill_compaction_handover',
        acceptanceFragments: ['拆模验收', '基层处理', '防水施工', '细部加强', '保护层', '分层回填', '压实复测'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-04-03-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['汇水分区', '透水基层', '雨水花园', '溢流接口', '渗排试验'],
        handoverEvidenceType: 'outdoor_sponge_facility_infiltration_storage_drainage_operation_handover',
        acceptanceFragments: ['专项图纸', '汇水边界', '透水铺装', '调蓄构造', '溢流接驳', '渗排能力', '标识移交'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-03-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['控制室移交', '主机电源', '联动盘', '图形显示', '参数备份'],
        handoverEvidenceType: 'fire_control_room_panel_graphic_display_backup_duty_handover',
        acceptanceFragments: ['环境条件', '电源接地', '报警主机', '联动盘', '图形显示', '系统备份', '值班交接'],
      },
      {
        templateId: 'china-intelligent-building-system',
        code: 'INT-02-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['点表冻结', '传感器回路', 'DDC地址', '趋势采集', '集成平台'],
        handoverEvidenceType: 'intelligent_bms_points_trend_alarm_integration_operations_handover',
        acceptanceFragments: ['接口协议', '点表边界', '回路标识', '单点调试', '场景测试', '报警趋势', '权限移交'],
      },
      {
        templateId: 'china-dangerous-subproject-control',
        code: 'DANGER-01-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['危大识别', '专项方案', '专家论证', '人员资格', '旁站记录'],
        handoverEvidenceType: 'danger_scaffold_plan_expert_review_inspection_acceptance_archive_handover',
        acceptanceFragments: ['清单确认', '方案审批', '论证意见', '资格核查', '巡查旁站', '监测成果', '资料归档'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps roof waterproof, outdoor connection, municipal road, and gas packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-waterproof-insulation',
        code: 'WPI-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['屋面防水', '保温层', '管根泛水', '蓄水试验', '渗漏复测'],
        handoverEvidenceType: 'waterproof_roof_insulation_ponding_leakage_retest_closeout_handover',
        acceptanceFragments: ['基层复核', '附加层', '保温厚度', '蓄水记录', '渗漏整改', '保护层', '屋面移交'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-05-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['综合管网', '正式接口', '压力复测', '送电复测', '权属确认'],
        handoverEvidenceType: 'outdoor_utility_connection_pressure_power_asbuilt_authority_handover',
        acceptanceFragments: ['接口清单', '权属签认', '压力测试', '送电记录', '竣工测量', '资料组卷', '运维交接'],
      },
      {
        templateId: 'china-gb55032-2022-municipal',
        code: 'MUN-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['路基处理', '测量放样', '软弱土', '含水率', '压实度'],
        handoverEvidenceType: 'municipal_roadbed_soft_soil_layered_compaction_deflection_handover',
        acceptanceFragments: ['控制点', '软弱土处理', '填料含水率', '分层压实', '弯沉检测', '平整度', '路基移交'],
      },
      {
        templateId: 'china-gb55032-2022-municipal',
        code: 'MUN-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['面层施工', '基层移交', '配合比', '温度控制', '平整度'],
        handoverEvidenceType: 'municipal_pavement_mix_temperature_thickness_flatness_opening_handover',
        acceptanceFragments: ['基层移交', '材料配合比', '摊铺温度', '厚度检测', '接缝处理', '开放条件', '面层验收'],
      },
      {
        templateId: 'china-plumbing-heating-system',
        code: 'PLU-06-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['燃气报装', '接驳界面', '压力试验', '报警联动', '运营移交'],
        handoverEvidenceType: 'plumbing_gas_connection_pressure_alarm_authority_operation_handover',
        acceptanceFragments: ['报装资料', '接驳确认', '严密性测试', '报警联调', '权属验收', '竣工资料', '运营交接'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps MEP roof, civil-defense, data-center, and medical-gas packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-mep-coordination',
        code: 'MEP-02-01-01',
        expectedProcessCount: 13,
        firstEvidenceFragments: ['屋面设备排布', '基础预埋', '防水泛水', '桥架管线路由', '安全通道', '综合界面'],
        handoverEvidenceType: 'mep_roof_equipment_base_waterproof_route_access_integrated_handover',
        acceptanceFragments: ['排布深化冻结', '基础预埋复核', '防水泛水闭合', '管线路由复测', '安全通道确认', '问题销项', '综合界面交接'],
      },
      {
        templateId: 'china-civil-defense-specialty',
        code: 'CDF-01-01-02',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['防护门框', '灌浆记录', '门扇吊装', '闭锁调试', '密闭胶条', '防爆波阀'],
        handoverEvidenceType: 'civil_defense_protective_door_blast_valve_closure_function_handover',
        acceptanceFragments: ['门框灌浆验收', '门扇启闭复测', '闭锁机构调试', '密闭胶条检查', '防爆波阀测试', '缺陷整改', '功能交接'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-07',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['UPS并机方案', '厂家FAT', '旁路柜', '主机接线', '同步参数', '应急回切'],
        handoverEvidenceType: 'data_center_ups_parallel_bypass_sat_operations_handover',
        acceptanceFragments: ['FAT参数核验', '主机接线验收', '并机同步测试', '旁路切换演练', '告警记录闭合', 'SAT报告签认', '运维移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-08',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['电池FAT', '容量证明', '批次追溯', '架体固定', '电池编号', 'BMS接入'],
        handoverEvidenceType: 'data_center_battery_rack_bms_capacity_traceability_sat_handover',
        acceptanceFragments: ['容量证明复核', '架体固定验收', '电池编号接线', 'BMS监测接入', '均充放电记录', 'SAT问题闭合', '运维移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-11',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['高压柜FAT', '变压器资料', '母排连接', '接地复测', '保护定值', '空载送电'],
        handoverEvidenceType: 'data_center_mv_switchgear_transformer_energization_sat_handover',
        acceptanceFragments: ['FAT资料核验', '基础接地验收', '母排连接复核', '保护定值确认', '空载送电记录', 'SAT缺陷闭合', '高压配电移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-18',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['DCIM边界', '数据源清单', '点表冻结', '告警策略', '权限矩阵', '容量报表'],
        handoverEvidenceType: 'data_center_dcim_point_list_alarm_capacity_uat_training_handover',
        acceptanceFragments: ['系统边界冻结', '数据源接入', '点表核验', '告警策略试运行', '权限场景UAT', '报表校核', '培训移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-22',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['防护区容积', '灭火浓度', '泄压条件', '声光报警', '延时释放', '紧急启停'],
        handoverEvidenceType: 'data_center_gas_extinguishing_zone_linkage_release_acceptance_handover',
        acceptanceFragments: ['防护区参数复核', '管网试压验收', '探测报警联动', '延时释放测试', '紧急启停验证', '消防问题复测', '专项验收'],
      },
      {
        templateId: 'china-civil-defense-specialty',
        code: 'CDF-01-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['人防图纸会审', '预埋清单', '密闭套管', '墙体钢筋', '隐蔽验收', '封堵复测'],
        handoverEvidenceType: 'civil_defense_embedded_sleeve_hidden_acceptance_structure_handover',
        acceptanceFragments: ['图纸清单复核', '套管定位验收', '密闭翼环焊接', '墙体钢筋拉结', '隐蔽影像归档', '拆模封堵复测', '结构预埋验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-07',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['真空泵房', '排风条件', '真空主管', '分区保压', '备用泵切换', '吸引终端'],
        handoverEvidenceType: 'medical_vacuum_station_pipeline_pressure_switch_terminal_handover',
        acceptanceFragments: ['泵房条件复核', '设备安装验收', '主管保压测试', '终端吸引复测', '备用泵切换', '报警记录闭合', '系统移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-08',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['压缩空气站房', '通风排水', '干燥机', '露点过滤', '备用空压机', '终端压力'],
        handoverEvidenceType: 'medical_compressed_air_station_dryness_pressure_terminal_handover',
        acceptanceFragments: ['站房条件复核', '空压机安装验收', '干燥过滤测试', '露点指标复测', '备用机切换', '终端压力校验', '系统移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps IDC closeout, civil-defense conversion, facade panel, prefab outboard, and cleanroom special packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-12',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['低压柜FAT', 'ATS逻辑', '双路电源', '基础槽钢', '柜体就位', '母排连接', '相序检查', 'DCIM接入'],
        handoverEvidenceType: 'data_center_lv_switchgear_ats_transfer_sat_dcim_handover_signoff',
        acceptanceFragments: ['FAT资料', '双路电源', '柜体母排', '电缆端接', '防火封堵', 'ATS切换', 'DCIM告警'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-25',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['假负载容量', '测点方案', 'UPS带载', '配电带载', '制冷同步', '温场电流', '告警数据', '异常整改'],
        handoverEvidenceType: 'data_center_it_load_bank_sat_power_cooling_trend_defect_closure_signoff',
        acceptanceFragments: ['接入隔离', 'UPS配电', '制冷运行', '温场电流', '告警采集', '异常复测', 'SAT报告'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-27',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['断电脚本', '黑启动顺序', '人员分工', '市电失电', '柴发启动', 'UPS续航', '温升监测', '告警时间线'],
        handoverEvidenceType: 'data_center_black_start_power_loss_recovery_drill_alarm_timeline_handover_signoff',
        acceptanceFragments: ['演练脚本', '黑启动交底', '柴发启动', 'UPS保持', '制冷恢复', '运维响应', '验收签认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-28',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['Tier目标', '测试边界', '冗余链路', '可维护性', '单路失效', '旁路场景', '第三方问题', '认证资料'],
        handoverEvidenceType: 'data_center_tier_availability_witness_test_redundancy_closeout_certification_signoff',
        acceptanceFragments: ['目标边界', '冗余台账', '失效测试', '旁路测试', '双路径切换', '问题整改', '认证签认'],
      },
      {
        templateId: 'china-civil-defense-specialty',
        code: 'CDF-03-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['平战转换方案', '构件清单', '封堵构件', '存放条件', '战时接口', '防护单元', '备品备件', '模拟演练'],
        handoverEvidenceType: 'civil_defense_peacetime_wartime_conversion_component_drill_inventory_handover_signoff',
        acceptanceFragments: ['构件清单', '封堵编号', '战时接口', '单元标识', '责任交底', '演练整改', '台账交接'],
      },
      {
        templateId: 'china-facade-curtain-wall',
        code: 'FAC-02-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['面板复验', '编号排布', '挂件托板', '压块安装', '缝宽控制', '密封胶相容性', '开启扇五金'],
        handoverEvidenceType: 'facade_panel_material_numbering_joint_sealant_visual_acceptance_handover',
        acceptanceFragments: ['材料编号', '挂件托板', '吊装就位', '接缝宽度', '密封胶养护', '开启扇调试', '观感验收'],
      },
      {
        templateId: 'china-prefabricated-assembly',
        code: 'PFB-01-01-06',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['吊装方案', '悬挑支撑', '构件就位', '钢筋连接', '排水坡度', '滴水线', '防水节点', '百叶接口'],
        handoverEvidenceType: 'prefab_balcony_ac_slab_bay_window_lifting_slope_waterproof_household_handover',
        acceptanceFragments: ['吊装复核', '构件就位', '节点连接', '坡度滴水', '冷凝水接口', '飘窗收口', '分户保护'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-12',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['应急供气预案', '演练脚本', '主备气源', '阀组检查', '故障切换', '报警屏', '终端压力'],
        handoverEvidenceType: 'medical_gas_emergency_source_switch_pressure_alarm_drill_handover_signoff',
        acceptanceFragments: ['预案脚本', '主备气源', '阀组状态', '故障切换', '值班响应', '压力恢复', '报告签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-17',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['负压梯度', '污染流线', '排风HEPA', '消毒段', '互锁门', '压差监测', '送排风平衡', '报警联动'],
        handoverEvidenceType: 'hospital_negative_pressure_ward_exhaust_hepa_pressure_gradient_acceptance_handover',
        acceptanceFragments: ['负压梯度', 'HEPA安装', '互锁压差', '风量平衡', '防倒灌测试', '连续运行', '病房验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-24',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['RF屏蔽方案', '厂家深化', '导通检查', '基层绝缘', '屏蔽板安装', '导电搭接', '屏蔽门', '效能预测试'],
        handoverEvidenceType: 'hospital_mri_rf_shielding_continuity_leak_retest_third_party_acceptance_handover',
        acceptanceFragments: ['方案复核', '导通绝缘', '屏蔽板连续', '搭接电阻', '门扇调试', '泄漏复测', '第三方验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps building sample, outdoor works, MEP coordination, fire shutter, facade early works, and cabling packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-building-fine-detail',
        code: 'BDT-06-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['主体结构样板', '钢筋模板', '混凝土观感', '实测实量', '样板评审', '问题整改'],
        handoverEvidenceType: 'building_structure_mockup_measurement_defect_release_handover',
        acceptanceFragments: ['样板范围', '钢筋模板', '混凝土观感', '实测实量', '评审意见', '问题整改', '大面放行'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['道路基层', '路基复核', '软弱点', '级配材料', '压实度', '开放条件'],
        handoverEvidenceType: 'outdoor_road_subbase_compaction_slope_opening_handover',
        acceptanceFragments: ['路基复核', '材料级配', '摊铺碾压', '压实度', '坡度排水', '缺陷复测', '开放移交'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-02-02-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['室外照明', '电缆绝缘', '灯杆基础', '防水接地', '送电测试', '照度复测'],
        handoverEvidenceType: 'outdoor_lighting_cable_pole_grounding_illumination_handover',
        acceptanceFragments: ['电缆绝缘', '灯杆基础', '接地防水', '送电测试', '照度复测', '缺陷整改', '运行移交'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-04-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['种植土', '土壤改良', '苗木进场', '栽植支撑', '成活率', '养护移交'],
        handoverEvidenceType: 'outdoor_landscape_soil_planting_survival_maintenance_handover',
        acceptanceFragments: ['种植土改良', '苗木验收', '栽植支撑', '灌溉排水', '成活率', '补植整改', '养护移交'],
      },
      {
        templateId: 'china-gb55032-2022-outdoor',
        code: 'OUT-04-03-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['雨水回用', '泵房设备', '液位联锁', '中水水质', '回用管网', '运维移交'],
        handoverEvidenceType: 'outdoor_rainwater_reuse_pump_water_quality_operations_handover',
        acceptanceFragments: ['设备基础', '泵组安装', '液位联锁', '水质检测', '回用试运行', '缺陷复测', '运维移交'],
      },
      {
        templateId: 'china-mep-coordination',
        code: 'MEP-01-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['管综深化', '碰撞清单', '净高复核', '综合支吊架', '责任闭合', '版本冻结'],
        handoverEvidenceType: 'mep_coordination_clash_clearance_support_version_closeout_handover',
        acceptanceFragments: ['版本冻结', '碰撞清单', '净高复核', '支吊架样板', '洞口套管', '责任闭合', '作业面移交'],
      },
      {
        templateId: 'china-cecs-fire-system',
        code: 'FIR-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['卷帘洞口', '电源复核', '控制箱', '防火卷帘', '联动编码'],
        handoverEvidenceType: 'fire_shutter_power_linkage_descent_reset_issue_closeout_handover',
        acceptanceFragments: ['洞口尺寸', '供电控制', '手自动测试', '降落反馈', '消防联动', '问题销项', '复测签认'],
      },
      {
        templateId: 'china-facade-curtain-wall',
        code: 'FAC-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['幕墙测量', '埋件复核', '控制线', '偏差处理', '样板段', '加工单'],
        handoverEvidenceType: 'facade_survey_embed_deviation_shop_drawing_freeze_handover',
        acceptanceFragments: ['测量控制', '埋件复核', '偏差处理', '样板段', '深化图冻结', '加工单', '测量移交'],
      },
      {
        templateId: 'china-facade-curtain-wall',
        code: 'FAC-01-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['幕墙龙骨', '连接件', '立柱横梁', '防雷连接', '防腐补刷', '隐蔽验收'],
        handoverEvidenceType: 'facade_frame_anchor_lightning_anticorrosion_hidden_acceptance_handover',
        acceptanceFragments: ['连接件复核', '立柱横梁', '安装偏差', '层间封堵', '防雷连接', '防腐隐蔽', '龙骨移交'],
      },
      {
        templateId: 'china-intelligent-building-system',
        code: 'INT-01-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['点位深化', '线缆路由', '弱电桥架', '标签编码', '测试仪表'],
        handoverEvidenceType: 'intelligent_structured_cabling_route_label_test_handover',
        acceptanceFragments: ['路由复核', '桥架净距', '线缆敷设', '链路测试', '标签台账', '机柜端接', '系统交接'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps IDC resilience, cleanroom medical, civil-defense, and industrial validation packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-26',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['双路市电', '切换预案', 'MOP', 'ATS', 'DCIM告警', '演练签认'],
        handoverEvidenceType: 'data_center_dual_utility_mop_ats_dcim_operation_drill_handover',
        acceptanceFragments: ['MOP审批', 'ATS切换', 'DCIM告警', '关键负载', '切换日志', '运维响应', '演练签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-14',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['千级ICU/NICU', '压差复核', '粒子计数', '换气次数', '报警阈值', '动态验证'],
        handoverEvidenceType: 'cleanroom_icu_nicu_grade_1000_pressure_particle_alarm_acceptance_handover',
        acceptanceFragments: ['压差梯度', '粒子计数', '换气次数', '温湿度', '报警阈值', '缺陷复测', '千级区域验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-18',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['PCR实验室', '三区两通道', '全排风', '负压梯度', '气流方向', '污染控制'],
        handoverEvidenceType: 'cleanroom_pcr_exhaust_negative_pressure_contamination_handover',
        acceptanceFragments: ['三区两通道', '排风路径', '负压梯度', '气流方向', '过滤排放', '缺陷复测', 'PCR排风验收'],
      },
      {
        templateId: 'china-civil-defense-specialty',
        code: 'CDF-02-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['人防通风', '滤毒系统', '密闭阀', '过滤吸收器', '风量风压', '战时转换'],
        handoverEvidenceType: 'civil_defense_ventilation_filter_toxicity_seal_mode_acceptance_handover',
        acceptanceFragments: ['设备基础', '密闭阀', '过滤吸收器', '清洁滤毒隔绝', '风量风压', '专项验收', '系统移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-15',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['冷冻水N+1', '流量扬程', '变频阀组', '旁通压差', 'BMS/DCIM', '趋势采集'],
        handoverEvidenceType: 'data_center_chilled_water_pump_vfd_differential_pressure_trend_handover',
        acceptanceFragments: ['N+1冗余', '泵组试运', '变频阀组', '旁通压差', 'BMS/DCIM点表', '压差报警', '趋势采集'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-23',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['极早期探测', '采样管路', '探测分区', '报警阈值', '消防联动', '验收签认'],
        handoverEvidenceType: 'data_center_very_early_smoke_detection_sampling_alarm_handover',
        acceptanceFragments: ['采样管路', '探测分区', '报警阈值', '烟雾测试', '消防联动', '问题销项', '极早期探测验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-04',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['OQ运行确认', '脚本审批', '测试仪表', '偏差记录', '运行记录', '报告签认'],
        handoverEvidenceType: 'industrial_cleanroom_oq_script_deviation_execution_report_handover',
        acceptanceFragments: ['脚本审批', '仪表校准', '运行确认', '偏差关闭', '运行记录', '报告签认', 'OQ归档'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-05',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['PQ性能确认', '试生产批次', '评价标准', '偏差关闭', '放行判定', '试生产放行'],
        handoverEvidenceType: 'industrial_cleanroom_pq_trial_batch_performance_release_handover',
        acceptanceFragments: ['试生产批次', '评价标准', '性能确认', '偏差关闭', '放行判定', '试生产放行', '签认归档'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps VOC, HEPA, medical gas, civil-defense closeout, BMU, heritage, and radioactive wastewater packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-03-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['NMP废气', 'VOC治理', '冷凝点', '排放指标', '在线监测', '达标投运'],
        handoverEvidenceType: 'industrial_cleanroom_nmp_voc_emission_online_monitoring_operation_handover',
        acceptanceFragments: ['NMP收集', '冷凝点', 'VOC治理', '在线监测', '达标排放', '缺陷复测', '运行资料移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-20',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['HEPA', '高效过滤器', '送风末端', '安装位置', 'PAO检漏', '验收报告'],
        handoverEvidenceType: 'cleanroom_hepa_terminal_installation_leak_test_acceptance_handover',
        acceptanceFragments: ['HEPA规格', '安装密封', 'PAO检漏', '风量复测', '洁净检测', '缺陷整改', '高效过滤器验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-09',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['医用气体', '区域阀箱', '报警屏', '压力测试', '报警回路', '台账移交'],
        handoverEvidenceType: 'medical_gas_zone_valve_alarm_panel_pressure_loop_handover',
        acceptanceFragments: ['区域阀箱', '服务范围', '压力测试', '报警回路', '阀门编号', '报警记录', '回路台账'],
      },
      {
        templateId: 'china-civil-defense-specialty',
        code: 'CDF-02-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['人防验收', '现场抽查', '整改清单', '功能复测', '主管验收', '物业交接'],
        handoverEvidenceType: 'civil_defense_special_acceptance_rectification_property_handover',
        acceptanceFragments: ['现场抽查', '整改复测', '功能复测', '主管验收', '资料归档', '物业交接', '移交签认'],
      },
      {
        templateId: 'china-facade-curtain-wall',
        code: 'FAC-04-01-01',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['擦窗机BMU', '屋面荷载', '轨道', '限位保护', '试运行', '运维培训'],
        handoverEvidenceType: 'facade_bmu_roof_load_track_limit_trial_operation_training_handover',
        acceptanceFragments: ['屋面荷载', '轨道安装', '限位保护', '荷载试运行', '救援演练', '维保资料', '设备交接'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-13',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['边开放边施工', '运营边界', '施工窗口', '游客安全', '恢复开放', '开放验收'],
        handoverEvidenceType: 'heritage_open_during_construction_operation_boundary_reopening_handover',
        acceptanceFragments: ['运营边界', '施工窗口', '游客安全', '夜间闭馆', '恢复开放', '缺陷复测', '开放签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-34',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['放射性废水', '衰变池', '防渗结构', '衰变周期', '卫监验收', '移交记录'],
        handoverEvidenceType: 'medical_radioactive_wastewater_decay_tank_health_supervision_handover',
        acceptanceFragments: ['防渗结构', '衰变池', '液位联锁', '衰变周期', '检测记录', '卫监验收', '移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps cleanroom envelope and IDC access or cabinet packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['洁净自动门', '气密窗', '洞口尺寸', '密封胶条', '互锁压差', '移交记录'],
        handoverEvidenceType: 'cleanroom_auto_door_air_tight_window_interlock_handover',
        acceptanceFragments: ['洞口尺寸', '门窗加工', '密封胶条', '互锁压差', '气密复测', '缺陷整改', '门窗移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['抗菌彩钢板', '墙顶系统', '板材封样', '龙骨排版', '板缝密封', '洁净围护'],
        handoverEvidenceType: 'cleanroom_antibacterial_panel_envelope_joint_surface_handover',
        acceptanceFragments: ['板材封样', '龙骨排版', '板缝密封', '表面清洁', '围护观感', '缺陷整改', '围护移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['防静电自流平', '基层强度', '含水率', '接地连续性', '表面电阻', '导电性能'],
        handoverEvidenceType: 'cleanroom_antistatic_self_leveling_floor_resistance_handover',
        acceptanceFragments: ['基层强度', '含水率', '接地连续性', '表面电阻', '平整度', '缺陷整改', '地坪验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-04',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['洁净走廊', '气闸', '互锁系统', '压差梯度', '流线复核', '报警联动'],
        handoverEvidenceType: 'cleanroom_airlock_interlock_pressure_alarm_handover',
        acceptanceFragments: ['压差梯度', '流线复核', '气闸互锁', '报警联动', '烟雾复测', '缺陷整改', '气闸移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['运营商MMR', '双路引入', '进线孔洞', 'ODF端口', 'OTDR', '资产编码'],
        handoverEvidenceType: 'data_center_carrier_mmr_route_odf_otdr_asset_handover',
        acceptanceFragments: ['双路引入', '进线孔洞', 'ODF端口', 'OTDR', '光功率', '资产编码', '接入间移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['冷通道', '气流组织', '封闭门', '顶板密封', '温场复测', '验收移交'],
        handoverEvidenceType: 'data_center_cold_aisle_airflow_sealing_temperature_handover',
        acceptanceFragments: ['冷通道排布', '气流组织', '封闭门', '顶板密封', '温场复测', '缺陷整改', '冷通道验收'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-05',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['服务器机柜', '地板承载', '机柜排布', '抗震固定', 'PDU接地', '资产台账'],
        handoverEvidenceType: 'data_center_server_cabinet_floor_load_anchoring_asset_handover',
        acceptanceFragments: ['地板承载', '机柜排布', '抗震固定', 'PDU接地', '线缆余量', '资产台账', '机柜移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-06',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['PDU', '列头柜', '母线槽', '回路编号', '支路带载', '配电验收'],
        handoverEvidenceType: 'data_center_pdu_rpp_busway_branch_load_distribution_handover',
        acceptanceFragments: ['回路编号', '母线槽支架', '列头柜端接', '绝缘接地', '支路带载', '缺陷整改', '配电移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps operating-room envelope, medical gas, cleanroom HVAC, exhaust, and IDC optical aisle packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-05',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['手术室', '模数排版', '墙顶一体化', '层流送风', '密封缺陷', '洁净检测'],
        handoverEvidenceType: 'cleanroom_operating_room_integrated_envelope_laminar_handover',
        acceptanceFragments: ['模数排版', '墙顶一体化', '层流送风', '密封缺陷', '洁净检测', '样板验收', '移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-10',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['医用气体终端', '点位编号', '流量校验', '压力稳定', '终端标签', '校验记录'],
        handoverEvidenceType: 'medical_gas_terminal_flow_pressure_calibration_handover',
        acceptanceFragments: ['点位编号', '终端安装', '流量校验', '压力稳定', '报警复核', '终端标签', '记录移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-11',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['笑气', '氮气', '二氧化碳', '瓶组间', '通风报警', '验收移交'],
        handoverEvidenceType: 'medical_gas_cylinder_bank_ventilation_alarm_handover',
        acceptanceFragments: ['瓶组间通风', '报警条件', '汇流排', '减压阀组', '泄漏测试', '气体标识', '瓶组移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-15',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['万级检验病理区', '气流组织', '压差温湿度', '排风支路', '洁净度复测', '区域验收'],
        handoverEvidenceType: 'cleanroom_laboratory_pathology_grade_10000_airflow_handover',
        acceptanceFragments: ['气流组织', '压差温湿度', '排风支路', '洁净度复测', '连续运行', '缺陷整改', '万级区域验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-16',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['三十万级', '静配中心', '物流流线', '传递窗', '温湿度压差', '区域验收'],
        handoverEvidenceType: 'cleanroom_iv_admixture_grade_300000_logistics_transfer_handover',
        acceptanceFragments: ['洁净等级', '物流流线', '传递窗联动', '温湿度压差', '连续运行', '缺陷整改', '静配区域验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-19',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['排风净化', '活性炭', 'HEPA', '紫外', '处理风量', '净化效率'],
        handoverEvidenceType: 'cleanroom_exhaust_carbon_hepa_uv_efficiency_handover',
        acceptanceFragments: ['污染物种类', '处理风量', '活性炭', 'HEPA', '紫外联动', '净化效率', '排风验收'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['ODF', '主配线区', '端口编号', '光纤熔接', '链路损耗', '端口台账'],
        handoverEvidenceType: 'data_center_odf_fiber_distribution_port_loss_handover',
        acceptanceFragments: ['ODF容量', '端口编号', '光纤熔接', '链路损耗', '标签台账', '缺陷整改', '端口移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-04',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['热通道', '回风路径', '静压箱', '密封条', '回风效率', '验收移交'],
        handoverEvidenceType: 'data_center_hot_aisle_return_air_sealing_efficiency_handover',
        acceptanceFragments: ['热通道排布', '回风路径', '静压箱', '密封条', '回风效率', '缺陷整改', '热通道验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps foundation pit, TOD, and heritage specialty packs evidence-rich without dependency metadata', () => {
    const expectations = [
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-14',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['分区分层开挖', '支撑轴力', '降水水位', '监测日报', '时空效应', '基底暴露'],
        handoverEvidenceType: 'foundation_pit_zoned_excavation_support_dewatering_monitoring_base_handover',
        acceptanceFragments: ['开挖分区', '支撑轴力', '降水水位', '监测预警', '基底验槽', '垫层封闭', '基底移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-06-01-02',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['自动化监测', '通讯网关', '测点编号', '报警阈值', '数据校验', '监测平台'],
        handoverEvidenceType: 'foundation_pit_automated_monitoring_point_alarm_platform_handover',
        acceptanceFragments: ['测点布设', '传感器校准', '通讯联调', '阈值配置', '数据连续性', '报警演练', '系统移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-06-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['管线权属', '探测复核', '悬吊支架', '保护范围', '变形监测', '权属签认'],
        handoverEvidenceType: 'foundation_pit_utility_suspension_protection_monitoring_authority_handover',
        acceptanceFragments: ['权属确认', '探测复核', '悬吊验收', '支架复测', '监测记录', '复原检查', '保护资料归档'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['既有车站', '接驳条件', '结构复测', '运营边界', '洞口封堵', '联合踏勘'],
        handoverEvidenceType: 'tod_station_existing_structure_connection_joint_survey_handover',
        acceptanceFragments: ['既有结构', '接驳界面', '运营边界', '洞口封堵', '联合踏勘', '整改复测', '接驳移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['运营线路', '保护对象', '控制指标', '监测点', '数据基线', '运营见证'],
        handoverEvidenceType: 'tod_operating_line_protection_monitoring_baseline_acceptance',
        acceptanceFragments: ['保护对象', '控制指标', '测点布设', '基线采集', '报警阈值', '运营见证', '阶段验收'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-15',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['振动噪声', '敏感点', '基线监测', '控制值', '治理构造', '超标复测'],
        handoverEvidenceType: 'tod_vibration_noise_sensitive_point_mitigation_retest_handover',
        acceptanceFragments: ['敏感点', '基线报告', '控制值', '治理构造', '监测复测', '超标整改', '效果移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-18',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['运营联合检查', '检查路线', '缺陷清单', '整改闭合', '复查签认', '接管意见'],
        handoverEvidenceType: 'tod_operator_joint_inspection_defect_closeout_takeover_signoff',
        acceptanceFragments: ['检查计划', '联合走查', '缺陷分级', '整改复测', '资料补齐', '接管意见', '闭合签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-20',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['轨道保护区', '卸载工况', '荷载复核', '运营监测', '复核记录', '签认移交'],
        handoverEvidenceType: 'tod_rail_protection_zone_unloading_operation_recheck_signoff',
        acceptanceFragments: ['卸载工况', '荷载复核', '监测数据', '运营复核', '异常处置', '资料归档', '复核签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-21',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['模拟客流', '峰值客流', '疏散瓶颈', '导向验证', '运营席位', '复盘签认'],
        handoverEvidenceType: 'tod_passenger_flow_drill_wayfinding_operation_replay_signoff',
        acceptanceFragments: ['演练脚本', '峰值设定', '导向验证', '疏散瓶颈', '岗位响应', '问题复盘', '演练签认'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['可逆支撑', '保护方案', '原状记录', '监测点', '拆除恢复', '专家见证'],
        handoverEvidenceType: 'heritage_reversible_temporary_support_monitoring_restoration_handover',
        acceptanceFragments: ['方案交底', '原状记录', '支撑安装', '监测记录', '专家见证', '拆除恢复', '保护移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps radiology cleanroom and IDC technical commissioning packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-25',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['DSA介入室', '铅当量', '观察窗', '穿墙孔', '射线剂量', '卫监验收'],
        handoverEvidenceType: 'hospital_dsa_radiation_shielding_dose_health_supervision_handover',
        acceptanceFragments: ['铅当量', '观察窗', '穿墙封堵', '门体联锁', '剂量检测', '整改复测', '卫监移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-26',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['PET-CT', '防护分区', '衰变接口', '放射废液', '剂量监测', '卫监整改'],
        handoverEvidenceType: 'hospital_pet_ct_shielding_decay_interface_supervision_handover',
        acceptanceFragments: ['防护分区', '屏蔽结构', '衰变接口', '废液流向', '剂量检测', '缺陷复测', '卫监签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-27',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['直线加速器', '防护厚度', '中子防护', '门机联锁', '剂量检测', '专项验收'],
        handoverEvidenceType: 'hospital_linear_accelerator_neutron_shielding_interlock_acceptance',
        acceptanceFragments: ['防护厚度', '中子材料', '迷宫联锁', '剂量检测', '急停联动', '整改复测', '专项验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-28',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['迷宫入口', '几何尺寸', '防护门', '安全联锁', '状态指示', '应急释放'],
        handoverEvidenceType: 'hospital_linac_maze_entrance_door_interlock_acceptance',
        acceptanceFragments: ['入口尺寸', '防护门体', '门机联锁', '状态指示', '应急释放', '剂量复测', '入口验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-35',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['CSSD', '去污区', '清洗流程', '灭菌区', '追溯条码', '生物监测'],
        handoverEvidenceType: 'hospital_cssd_workflow_sterilization_traceability_acceptance',
        acceptanceFragments: ['去污流程', '清洗设备', '灭菌参数', '无菌存放', '条码追溯', '生物监测', 'CSSD验收'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-36',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['PCR实验室', '三区两通道', '全排风', '负压梯度', '气流方向', '生物安全'],
        handoverEvidenceType: 'hospital_pcr_three_zone_exhaust_negative_pressure_biosafety_handover',
        acceptanceFragments: ['三区边界', '两通道流线', '全排风', '负压梯度', '气流方向', '第三方验证', 'PCR移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-24',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['端口矩阵', '链路编号', 'OTDR', '光功率', '标签台账', '链路报告'],
        handoverEvidenceType: 'data_center_network_link_test_port_label_report_handover',
        acceptanceFragments: ['端口矩阵', '链路编号', 'OTDR测试', '光功率', '标签复核', '缺陷复测', '链路报告'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-32',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['EPMS', 'CT/PT变比', '电能质量', '遥信遥测', '告警阈值', '趋势记录'],
        handoverEvidenceType: 'data_center_epms_power_quality_metering_alarm_trend_handover',
        acceptanceFragments: ['变比极性', '仪表校验', '电能质量', '遥信遥测', '告警阈值', '趋势记录', 'EPMS移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-34',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['穿墙洞口', '桥架贯穿', '防火封堵', '气密封堵', '红外复查', '移交验收'],
        handoverEvidenceType: 'data_center_penetration_firestop_air_seal_acceptance_handover',
        acceptanceFragments: ['洞口清单', '材料复核', '防火封堵', '气密封堵', '标识拍照', '抽检复测', '封堵移交'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-37',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['MOP', 'SOP', 'EOP', '运维边界', '演练脚本', '响应复盘'],
        handoverEvidenceType: 'data_center_mop_sop_eop_drill_operations_signoff',
        acceptanceFragments: ['清单冻结', '边界确认', '演练脚本', '值班响应', '异常复盘', '资料归档', '运维签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps industrial cleanroom, MiC, TOD interface, and IDC network packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-35',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['Spine/Leaf', '端口矩阵', '冗余链路', '配置备份', '回滚脚本', '联调记录'],
        handoverEvidenceType: 'data_center_core_network_redundancy_config_backup_handover',
        acceptanceFragments: ['拓扑冻结', '端口矩阵', '冗余联调', '配置备份', '回滚脚本', '故障切换', '网络移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-08',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['防爆分区', '排风量', '泄爆口', '接地导通', '联锁报警', '安全验收'],
        handoverEvidenceType: 'industrial_cleanroom_explosion_proof_exhaust_relief_interlock_handover',
        acceptanceFragments: ['防爆分区', '排风量', '泄爆接口', '接地导通', '报警联锁', '缺陷复测', '安全移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-20',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['酸碱废液', '峰值流量', '中和池', 'pH监测', '防腐管道', '达标排放'],
        handoverEvidenceType: 'industrial_cleanroom_acid_alkali_waste_neutralization_ph_discharge_handover',
        acceptanceFragments: ['废液类别', '峰值流量', '中和设备', '防腐管道', 'pH监测', '达标取样', '系统验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-26',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['MES流程', '批次追溯', '工位终端', '数据接口', '权限审计', '上线培训'],
        handoverEvidenceType: 'industrial_cleanroom_mes_batch_traceability_interface_uat_handover',
        acceptanceFragments: ['流程冻结', '批次规则', '终端点位', '接口联调', '权限审计', 'UAT闭合', '上线培训'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-14',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['吊装方案', '吊装窗口', '吊点复核', '风速控制', '吊次影像', '专项验收'],
        handoverEvidenceType: 'mic_module_lifting_window_lift_point_wind_control_acceptance',
        acceptanceFragments: ['方案审批', '窗口冻结', '吊点复核', '吊具验收', '风速记录', '吊次影像', '吊装验收'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-16',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['节点板间隙', '错边量', '高强螺栓', '焊缝检测', '节点编号', '隐蔽验收'],
        handoverEvidenceType: 'mic_module_joint_bolt_weld_hidden_acceptance_handover',
        acceptanceFragments: ['节点间隙', '错边量', '螺栓扭矩', '焊缝检测', '防腐补涂', '影像编号', '隐蔽验收'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-18',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['快接接口', '给排水', '电气绝缘', '弱电接口', '漏水复测', '联调记录'],
        handoverEvidenceType: 'mic_module_mep_quick_connect_water_power_low_voltage_handover',
        acceptanceFragments: ['接口编号', '给排水试压', '电气绝缘', '弱电联调', '漏水复测', '缺陷闭合', '快接移交'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-20',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['整栋联调', '分区见证点', '消防联动', '给排水复测', '缺陷整改', '功能签认'],
        handoverEvidenceType: 'mic_whole_building_integrated_commissioning_defect_function_signoff',
        acceptanceFragments: ['脚本冻结', '见证点', '消防联动', '机电复测', '缺陷整改', '功能复测', '整栋签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-13',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['换乘通道', '客流动线', '净空复核', '防滑地面', '导向标识', '联合验收'],
        handoverEvidenceType: 'tod_transfer_passage_clearance_wayfinding_joint_acceptance',
        acceptanceFragments: ['客流动线', '净空复核', '防滑验收', '照明导向', '消防疏散', '缺陷复测', '通道联合验收'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-14',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['商业机电', '车站系统', '计量点', '隔离边界', '消防联动', '运营签认'],
        handoverEvidenceType: 'tod_commercial_mep_station_system_isolation_acceptance',
        acceptanceFragments: ['系统边界', '计量点位', '管线隔离', '弱电隔离', '消防联动', '运营复核', '隔离验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps airport, port, bridge, renewable, and ultra-high-rise specialty packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-02-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['CT安检通道', '托盘回筐', 'EDS判图', '开包复检台', '拒包通道', '旅客吞吐模拟'],
        handoverEvidenceType: 'airport_security_ct_lane_access_control_operation_handover_signoff',
        acceptanceFragments: ['CT通道设备安装', '托盘回筐', 'EDS判图', '拒包通道', '门禁CCTV', '旅客吞吐模拟', '安检运行手册'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['ORAT矩阵', '旅客流线', '行李试运行', '航司割接', '缺陷战情室', '首航值守'],
        handoverEvidenceType: 'airport_orat_trial_operation_airline_cutover_opening_handover_signoff',
        acceptanceFragments: ['ORAT场景矩阵', '旅客流线', '行李试运行', '航司割接', '缺陷战情室', '首航日值守', '开航手册'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['岸桥轨道', '轨距基准', '锚栓压板', '接地导通', '行走试验', '设备接口'],
        handoverEvidenceType: 'port_sts_crane_rail_alignment_grounding_travel_test_handover',
        acceptanceFragments: ['轨道基础', '轨距标高', '压板锚栓', '接地导通', '岸桥行走试验', '设备接口', '轨道移交'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-02-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['闸口车道', 'OCR识别', '地磅检定', 'TOS流程', '海关放行', '异常回退'],
        handoverEvidenceType: 'port_gate_tos_ocr_weighbridge_customs_operation_handover',
        acceptanceFragments: ['闸口车道', 'OCR箱号', '地磅检定', 'TOS进出闸', '海关放行', '异常车辆回退', '闸口运行手册'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['桩位复核', '泥浆指标', '成孔记录', '钢筋笼吊装', '桩身检测', '承台界面'],
        handoverEvidenceType: 'bridge_pile_foundation_pilecap_integrity_interface_handover',
        acceptanceFragments: ['桩位轴线', '成孔泥浆', '钢筋笼吊装', '连续灌注', '桩身完整性检测', '桩头处理', '承台界面移交'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-02-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['支座垫石', '锚栓定位', '伸缩缝', '桥面防水', '渗漏复测', '铺装移交'],
        handoverEvidenceType: 'bridge_bearing_expansion_joint_waterproofing_deck_handover',
        acceptanceFragments: ['支座垫石', '支座锚栓', '伸缩缝', '桥面防水', '淋水复测', '缺陷修补', '桥面铺装'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['光伏桩基', '支架倾角', '组件编号', '组串极性', '逆变器', '直流汇流'],
        handoverEvidenceType: 'renewable_pv_pile_support_module_string_inverter_handover',
        acceptanceFragments: ['光伏桩基', '支架倾角', '组件批次编号', '组串极性', '逆变器', '热斑抽检', '并网接口签认'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-02-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['并网保护', '计量网关', '调度通道', '反送电', '同期检查', '电能质量'],
        handoverEvidenceType: 'renewable_grid_protection_metering_dispatch_acceptance_handover',
        acceptanceFragments: ['继电保护定值', '计量网关', '调度数据通道', '反送电操作票', '同期并网检查', '电能质量', '调度验收'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['爬模循环', '预埋锚固', '液压爬升', '钢筋模板', '混凝土养护', '上层界面'],
        handoverEvidenceType: 'ultra_high_rise_core_wall_climbing_formwork_cycle_handover',
        acceptanceFragments: ['爬模循环计划', '预埋锚固', '液压爬升', '钢筋模板隐蔽', '混凝土浇筑养护', '垂直度', '上层循环界面'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['巨柱节点', '型钢拼接', '栓钉焊接', '钢筋穿插', '混凝土浇筑', '结构测量'],
        handoverEvidenceType: 'ultra_high_rise_mega_column_composite_node_acceptance_handover',
        acceptanceFragments: ['型钢拼接', '栓钉焊接', '钢筋穿插', '模板加固', '高性能混凝土', '节点测量', '巨柱节点验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps utility tunnel, hotel, campus, renovation, IDC, and cleanroom specialty packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['交通导改', '支护开挖', '降排水', '监测基线', '管线保护', '结构作业面'],
        handoverEvidenceType: 'utility_tunnel_traffic_diversion_support_excavation_dewatering_handover',
        acceptanceFragments: ['交通导改方案', '支护结构', '分层开挖', '降排水运行', '监测初值', '管线保护', '结构作业面'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-05-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['试运营脚本', '客房抽检', '餐饮场景', 'PMS联动', '缺陷清单', '运营接管'],
        handoverEvidenceType: 'hotel_trial_operation_pressure_test_defect_closeout_takeover_handover',
        acceptanceFragments: ['试运营脚本', '客房入住退房', '餐饮宴会', 'PMS门锁客控', '运营缺陷清单', 'SOP移交', '运营接管'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-04',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['实验室平面', '排风需求', '实验台', '通风柜', '危化排风', '功能验收'],
        handoverEvidenceType: 'campus_laboratory_ventilation_bench_fumehood_function_handover',
        acceptanceFragments: ['实验室平面', '实验台水电气', '通风柜安装', '危化排风管路', '补风压差', '安全联锁', '实验室功能验收'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-17',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['危化品类别', '暂存容量', '防爆通风', '泄漏收集', '门禁监控', '安全验收'],
        handoverEvidenceType: 'campus_hazmat_storage_ventilation_spill_access_safety_handover',
        acceptanceFragments: ['危化品类别', '防爆照明', '泄漏收集', '门禁监控', '安全标识', '管理制度', '安全验收'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['有害材料取样', '检测报告', '隔离封闭', '负压除尘', '清除记录', '复测清场'],
        handoverEvidenceType: 'renovation_hazardous_material_removal_testing_clearance_handover',
        acceptanceFragments: ['取样布点', '第三方检测报告', '隔离封闭', '拆除清除过程', '转运联单', '复测合格', '清场验收'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['开洞放线', '探筋扫描', '临时支撑', '切割控制', '边框加固', '洞口验收'],
        handoverEvidenceType: 'renovation_structural_opening_cutting_frame_reinforcement_handover',
        acceptanceFragments: ['开洞位置', '探筋扫描', '临时支撑', '切割振动粉尘', '边框加固', '裂缝变形复测', '洞口尺寸'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-14',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['列间空调', '气流组织', '冷冻水接口', '冷凝水', '漏水绳', '温湿度趋势'],
        handoverEvidenceType: 'data_center_inrow_cooling_airflow_leak_trend_handover',
        acceptanceFragments: ['列间空调容量', '制冷剂接口', '冷凝水排放', '气流组织', '温湿度传感器', '热场趋势', '空调运行移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-22',
        expectedProcessCount: 12,
        firstEvidenceFragments: ['CT/DR房间', '铅当量', '铅玻璃', '铅门', '穿墙封堵', '卫监检测'],
        handoverEvidenceType: 'hospital_ct_dr_lead_equivalent_radiation_acceptance_handover',
        acceptanceFragments: ['铅当量', '铅板铅玻璃铅门', '防护连续性', '孔洞防护封堵', '射线剂量检测', '超标点补强', '卫监验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-11',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['NMP收集点', '防爆分区', '管道坡度', '冷凝回收', '在线监测', '达标排放'],
        handoverEvidenceType: 'industrial_cleanroom_nmp_recovery_explosionproof_emission_handover',
        acceptanceFragments: ['NMP收集点', '收集管路坡度', '回收设备安装', '在线浓度监测', '回收效率', '应急切换演练', '环保达标验收'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['客房样板', '品牌标准', '机电末端', '卫浴五金', '客控门锁', '批量推广'],
        handoverEvidenceType: 'hotel_guestroom_mockup_brand_standard_batch_release_handover',
        acceptanceFragments: ['客房样板', '机电末端', '卫浴五金', '客控门锁', '软硬装观感', '运营客房体验', '批量推广'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps airport, port, bridge, utility tunnel, renewable, and ultra-high-rise follow-up packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['大跨钢桁架', '屋面天窗', '围护封闭', '天沟排水', '幕墙收口', '结构变形复测'],
        handoverEvidenceType: 'airport_terminal_long_span_roof_envelope_waterproof_drainage_closeout_handover',
        acceptanceFragments: ['大跨屋面', '天窗幕墙', '天沟排水', '围护封闭', '防雷接地', '隐蔽影像', '移交签认'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-02-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['FIDS屏幕', '公共广播', '母钟同步', '网络VLAN', 'NTP校时', '服务台工单'],
        handoverEvidenceType: 'airport_terminal_fids_pa_clock_network_ntp_service_desk_handover',
        acceptanceFragments: ['FIDS航班显示', 'NTP校时', '网络VLAN', '广播分区', '服务台工单', '账号权限', '运行手册'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['VDGS', 'GPU', 'PCA', '机位标线', '廊道净距', '地服交接'],
        handoverEvidenceType: 'airport_airside_stand_vdgs_gpu_pca_apron_service_handover',
        acceptanceFragments: ['VDGS', '旅客廊道净距', 'GPU供电', '机位占用释放', '机坪标识', '运行演练', '地服移交'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['胸墙分段', '帽梁钢筋', '护舷预埋', '系船柱孔', '潮位窗口', '混凝土养护'],
        handoverEvidenceType: 'port_quay_wall_coping_beam_fender_bollard_staged_acceptance_handover',
        acceptanceFragments: ['胸墙分段', '帽梁钢筋', '护舷预埋件', '临水侧外观', '防腐防撞', '强度报告', '移交签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['岸电变电所', '电缆卷盘', '船舶插接', '接电许可', '绝缘测试', '负荷试验'],
        handoverEvidenceType: 'port_shore_power_substation_cable_reel_vessel_plug_load_test_handover',
        acceptanceFragments: ['岸电容量', '电缆卷盘', '绝缘耐压', '船岸联调', '接电许可', '缺陷整改', '运行手册'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['支架预压', '模板线形', '钢筋预应力', '混凝土浇筑', '张拉压浆', '线形复测'],
        handoverEvidenceType: 'bridge_cast_in_place_box_girder_preload_prestress_grouting_line_shape_handover',
        acceptanceFragments: ['支架基础', '预应力管道', '箱梁混凝土', '张拉压浆', '箱梁线形', '桥面防水', '界面移交'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['桩基检测', '承台开挖', '围堰降水', '墩柱垂直度', '钢筋保护层', '混凝土强度'],
        handoverEvidenceType: 'bridge_pile_cap_pier_column_integrity_verticality_strength_handover',
        acceptanceFragments: ['桩基检测报告', '围堰降水', '承台墩柱钢筋', '墩柱混凝土', '蜂窝麻面', '测量成果', '验收移交'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['底板钢筋', '墙体模板', '止水带', '顶板浇筑', '隔墙位置', '闭合节段'],
        handoverEvidenceType: 'utility_tunnel_cast_in_place_structure_waterstop_segment_acceptance_handover',
        acceptanceFragments: ['底板墙体顶板', '止水带变形缝', '混凝土浇筑养护', '舱室净空', '闭合节段渗漏', '结构测量', '节段验收'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-02-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['消防联动', '通风风机', '排水泵', '气体探测', 'SCADA点表', '报警趋势'],
        handoverEvidenceType: 'utility_tunnel_fire_ventilation_drainage_gas_monitoring_scada_handover',
        acceptanceFragments: ['消防通风排水', '风机水泵探测器', 'SCADA报警趋势', '应急联动', '应急演练', '竣工图点表', '运行手册'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['锚笼定位', '基础强度', '吊装天气窗口', '塔筒法兰', '叶片螺栓', '扭矩记录'],
        handoverEvidenceType: 'renewable_wind_foundation_tower_nacelle_blade_torque_grid_handover',
        acceptanceFragments: ['风机基础锚笼', '塔筒机舱叶片', '法兰连接', 'SCADA通讯', '整机保护', '并网前缺陷', '整机验收'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['电缆沟槽', '穿越点', '接地电阻', '电缆终端', '屏蔽接地', '绝缘耐压'],
        handoverEvidenceType: 'renewable_collector_cable_trench_splicing_grounding_energization_handover',
        acceptanceFragments: ['集电线路路径', '电缆敷设终端', '绝缘耐压', '送电边界', '缺陷点返修', '保护定值', '运行移交'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['垂直运输分区', '塔吊覆盖', '施工电梯', '转换楼层', '设备验收', '调度记录'],
        handoverEvidenceType: 'ultra_high_rise_vertical_transport_zoning_lift_switching_operation_handover',
        acceptanceFragments: ['垂直运输分区', '施工电梯', '转换平台', '调度试运行', '运输异常', '运输能力计划', '放行'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['高区泵房', '压力分区', '立管冲洗', '水泵联调', '变频控制', '超压保护'],
        handoverEvidenceType: 'ultra_high_rise_high_zone_pump_pressure_staging_riser_commissioning_handover',
        acceptanceFragments: ['高区泵房', '水泵阀组', '立管冲洗试压', '分区启停', '压差波动', '操作规程', '运维移交'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps IDC, hospital MRI, industrial cleanroom, MiC, TOD, and hotel follow-up packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-17',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['水浸监测', '漏水绳', '采集模块', '报警点位', 'DCIM接入', '模拟漏水'],
        handoverEvidenceType: 'data_center_leak_detection_rope_dcim_alarm_simulation_handover',
        acceptanceFragments: ['漏水绳布置', '采集模块接线', 'DCIM动环平台', '模拟漏水', '误报漏报', '竣工图点表', '运行移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-23',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['MRI屏蔽室', '铜箔搭接', '屏蔽门', '波导窗', '滤波器', '屏蔽效能'],
        handoverEvidenceType: 'hospital_mri_rf_shielding_copper_overlap_filter_screening_acceptance_handover',
        acceptanceFragments: ['MRI屏蔽室', '铜箔搭接', '穿墙管线', '屏蔽效能', '泄漏点修补', '屏蔽检测报告', '专项验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-12',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['VOC集气罩', '废气支管', '净化设备', '在线监测', '排口检测', '防爆联锁'],
        handoverEvidenceType: 'industrial_cleanroom_voc_exhaust_collection_treatment_monitoring_emission_handover',
        acceptanceFragments: ['VOC废气来源', '废气支管', '在线监测', '净化效率', '超限报警', '环保检测报告', '环保验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-13',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['高纯氮气', '氢气管线', '氩气管线', 'VCR接头', '吹扫置换', '纯度检测'],
        handoverEvidenceType: 'industrial_cleanroom_high_purity_gas_pipeline_purge_purity_safety_handover',
        acceptanceFragments: ['高纯气体', 'VCR接头', '压力试验', '气体纯度', '氢气安全联锁', '检测报告', '运行移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-17',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['纯水系统', 'RO膜组', 'EDI', '循环管路', '水质指标', '取样点'],
        handoverEvidenceType: 'industrial_cleanroom_pure_water_ro_edi_loop_quality_handover',
        acceptanceFragments: ['纯水系统', 'RO膜组', '冲洗消毒', '电导率TOC', '不合格指标', '水质报告', '运行参数'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-21',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防静电地坪', '基层含水率', '导电底涂', '铜箔网格', '表面电阻', '洁净保护'],
        handoverEvidenceType: 'industrial_cleanroom_esd_floor_copper_grid_resistance_cleaning_handover',
        acceptanceFragments: ['防静电地坪范围', '铜箔网格', '面层厚度', '表面电阻', '空鼓开裂', '检测报告', '移交签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-27',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['SCADA点表', 'PLC接口', '报警趋势', '历史数据库', '权限配置', '联调截图'],
        handoverEvidenceType: 'industrial_cleanroom_scada_plc_alarm_trend_historian_handover',
        acceptanceFragments: ['SCADA监控范围', '实时数据采集', '权限角色', '设备启停', '通讯中断', '配置备份', '运行移交'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-29',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['设备SAT', '测试脚本', '工艺介质', '安全联锁', '满载试运行', '缺陷关闭'],
        handoverEvidenceType: 'industrial_cleanroom_equipment_sat_process_media_interlock_loaded_trial_handover',
        acceptanceFragments: ['SAT测试范围', '工艺介质', '满载试运行', '产品模拟工况', 'SAT缺陷清单', '测试报告', '投产移交'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-11',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['模块包装', '吊点保护', '重心标识', '运输传感器', '路线踏勘', '到场外观'],
        handoverEvidenceType: 'mic_module_packaging_transport_monitoring_arrival_damage_closeout_handover',
        acceptanceFragments: ['模块包装加固', '运输路线踏勘', '运输监测记录', '到场外观', '损伤清单', '交接台账', '安装界面'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-11',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['穿越区段', '车站结构', '管廊净距', '沉降监测', '防水封堵', '运营复核'],
        handoverEvidenceType: 'tod_station_crossing_utility_tunnel_clearance_settlement_waterproof_operations_handover',
        acceptanceFragments: ['保护范围', '净距测量', '防水封堵', '运营复核', '临时保护拆除', '监测成果', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['洗衣设备', '蒸汽接口', '排水排风', '货运通道', '噪声隔振', '物流流线'],
        handoverEvidenceType: 'hotel_laundry_back_of_house_steam_drainage_exhaust_logistics_trial_handover',
        acceptanceFragments: ['洗衣房设备', '设备基础', '噪声隔振', '布草流线', '保洁保护', 'SOP', '后勤物流系统'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps second-wave cleanroom, renovation, campus, hotel, transport, renewable, and tunnel packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['URS清单', '工艺边界', '洁净等级', '温湿度窗口', '工艺介质', '验证矩阵'],
        handoverEvidenceType: 'industrial_cleanroom_urs_process_boundary_validation_matrix_deviation_signoff',
        acceptanceFragments: ['URS用户需求', '洁净等级', 'DQ IQ OQ PQ', '接口清单', '偏差清单', '变更控制', '放行资料'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-02-01-02',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['万级洁净', '围护气密', '彩钢板', '地坪洁净', '穿墙密封', '压差梯度'],
        handoverEvidenceType: 'industrial_cleanroom_coating_line_class_10000_envelope_air_tight_particle_handover',
        acceptanceFragments: ['涂布线洁净分区', '彩钢板地坪', '压差梯度', '粒子检测', '围护收口', '检测报告', '移交签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['BA管材', '自动焊', '内窥检查', '氮气吹扫', '超纯水电阻率', 'TOC检测'],
        handoverEvidenceType: 'industrial_cleanroom_high_purity_gas_water_weld_purge_toc_terminal_handover',
        acceptanceFragments: ['高纯气体', '自动焊', '氮气吹扫', '超纯水电阻率', '用点标签', '焊口图', '工艺用点'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-03-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['住户告知', '商户营业', '夜间窗口', '噪声监测', '临时隔离', '投诉闭环'],
        handoverEvidenceType: 'renovation_occupied_tenant_night_window_noise_complaint_closeout_handover',
        acceptanceFragments: ['住户商户施工告知', '临时隔离', '噪声粉尘', '投诉问题', '恢复清洁', '协调会议纪要', '恢复移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-03-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['分区边界', '功能复测', '钥匙移交', '保洁恢复', '缺陷清单', '用户签认'],
        handoverEvidenceType: 'renovation_zone_acceptance_function_retest_key_transfer_operation_recovery_handover',
        acceptanceFragments: ['分区移交边界', '保洁恢复', '功能复测', '缺陷清单', '钥匙门禁', '运营恢复条件', '移交确认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-01-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['教学流线', '施工围挡', '人车分流', '临时通道', '分期边界', '安全告示'],
        handoverEvidenceType: 'campus_masterplan_phasing_traffic_separation_school_safety_signoff',
        acceptanceFragments: ['校园分期边界', '施工围挡', '安全告示', '学生安全风险', '分期切换', '校方会议纪要', '校方签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['开学窗口', '智慧校园', '一卡通', '广播时钟', '网络接入', '安防联调'],
        handoverEvidenceType: 'campus_opening_window_smart_campus_network_security_trial_handover',
        acceptanceFragments: ['开学窗口', '智慧校园网络', '安防门禁', '试运行问题', '账号权限', '运行手册', '开学保障'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-01-02-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['套房样板', '连通门', '家具接口', '客控场景', '卫浴防水', '品牌差异'],
        handoverEvidenceType: 'hotel_suite_connecting_room_mockup_guest_control_brand_acceptance_handover',
        acceptanceFragments: ['行政套房样板', '连通门', '卫浴防水', '客控灯光', '观感缺陷', '房态抽检', '交付资料'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['PMS接口', '房态同步', '门锁授权', '客控网关', '灯光空调', '断电恢复'],
        handoverEvidenceType: 'hotel_pms_guest_control_door_lock_room_status_recovery_operations_handover',
        acceptanceFragments: ['PMS接口点表', '门锁授权', '灯光空调', '断电恢复', '运营方抽检', '运行手册', '移交签认'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['departure hall', 'wayfinding', 'passenger flow', 'ceiling interface', 'public seating', 'signage visibility'],
        handoverEvidenceType: 'airport_departure_hall_interior_wayfinding_passenger_flow_operations_handover',
        acceptanceFragments: ['Departure hall interior', 'Ceiling MEP interface', 'Wayfinding visibility', 'Lighting public-address', 'Passenger-flow defects', 'Interior finish', 'handover signed'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['BHS接口', '输送线', '分拣滑槽', '行李源编码', 'BRS事件', 'PLC点表'],
        handoverEvidenceType: 'airport_bhs_conveyor_sorter_plc_brs_jam_alarm_operations_handover',
        acceptanceFragments: ['BHS接口点表', '输送线分拣滑槽', 'PLC BRS事件', '行李空载带载', '运行权限', '维护手册', '移交签认'],
      },
      {
        templateId: 'china-airport-terminal-specialty',
        code: 'APT-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['登机桥', '旋转平台', '伸缩通道', '机型参数', '登机口柜台', '靠接测试'],
        handoverEvidenceType: 'airport_boarding_bridge_gate_equipment_docking_aircraft_type_training_handover',
        acceptanceFragments: ['登机桥机型参数', '旋转平台', '靠接离桥', '登机口柜台', '代理培训', '操作规程', '移交签认'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['quay deck', 'pavement block', 'drainage trench', 'fender anchor', 'bollard interface', 'deck slope'],
        handoverEvidenceType: 'port_quay_deck_pavement_drainage_fender_berth_acceptance_handover',
        acceptanceFragments: ['Quay deck pavement', 'Fender anchor', 'Drainage trench', 'Deck cracking', 'operation clearances', 'As-built survey', 'handover signed'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-02-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['fire water', 'stormwater separation', 'oil interceptor', 'spill response', 'monitoring point', 'pump test'],
        handoverEvidenceType: 'port_fire_water_environmental_oil_spill_monitoring_emergency_handover',
        acceptanceFragments: ['Fire water environmental', 'oil interceptor', 'spill response drill', 'monitoring points', 'Defect retest', 'Emergency manual', 'handover signed'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['support preloading', 'formwork alignment', 'rebar prestress', 'concrete pouring', 'tensioning record', 'grouting record'],
        handoverEvidenceType: 'bridge_cast_in_place_box_girder_preload_tensioning_grouting_line_shape_handover',
        acceptanceFragments: ['Support preloading', 'Rebar prestress', 'Concrete pouring', 'Tensioning grouting', 'Line-shape', 'Survey records', 'handover signed'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['load test', 'monitoring sensor', 'lighting circuit', 'traffic signal', 'deflection record', 'opening condition'],
        handoverEvidenceType: 'bridge_load_test_monitoring_lighting_traffic_opening_operations_handover',
        acceptanceFragments: ['Bridge load-test', 'Lighting circuit', 'Deflection strain', 'Opening readiness', 'safety facilities', 'Operation runbook', 'handover signed'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-02-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['booster transformer', 'GIS switchgear', 'relay setting', 'SCADA point list', 'metering cabinet', 'backfeed test'],
        handoverEvidenceType: 'renewable_booster_substation_transformer_gis_relay_scada_backfeed_handover',
        acceptanceFragments: ['Booster substation', 'Transformer GIS', 'Protection test', 'Backfeed test', 'Defect retest', 'Operation drawings', 'handover signed'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['72小时试运行', '发电曲线', '调度记录', '缺陷销项', '生产移交', '质保边界'],
        handoverEvidenceType: 'renewable_whole_station_trial_operation_generation_curve_defect_production_handover',
        acceptanceFragments: ['全站试运行计划', '发电曲线', '缺陷清单', '质保边界', '电能质量', 'SOP', '移交签认'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['避难层', '防火分区', '防排烟', '疏散照明', '消防广播', '压差测试'],
        handoverEvidenceType: 'ultra_high_rise_refuge_floor_smoke_control_evacuation_fire_linkage_handover',
        acceptanceFragments: ['避难层防火分区', '防排烟压差', '消防联动矩阵', '第三方检测', '应急物资', '检测报告', '生命安全系统'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-02-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['综合联调', '主管验收', '入廊许可', '门禁权限', '备品备件', '试运行值守'],
        handoverEvidenceType: 'utility_tunnel_integrated_commissioning_authority_permit_operations_handover',
        acceptanceFragments: ['综合联调范围', '入廊许可', '试运行值守', '备品备件', '运维培训', '主管验收意见', '运营接管'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps hospital, IDC, cleanroom, renovation, campus, hotel, and MiC extension packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-29',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['医用纯水', 'RO膜', 'EDI', '循环管网', 'TOC', '电导率'],
        handoverEvidenceType: 'hospital_pure_water_ro_edi_loop_quality_sampling_handover',
        acceptanceFragments: ['医用纯水设备', 'RO膜EDI', 'TOC电导率', '取样点标识', '运维移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-30',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['检验软化水', '软化器', '再生盐箱', '硬度检测', '终端取样', '水质报告'],
        handoverEvidenceType: 'hospital_laboratory_softened_water_softener_hardness_sampling_handover',
        acceptanceFragments: ['检验软化水', '软化器再生盐箱', '硬度检测', '再生周期', '科室移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-31',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['CSSD纯蒸汽', '蒸汽发生器', '管道坡度', '灭菌器接口', '干度检测', '冷凝水取样'],
        handoverEvidenceType: 'hospital_cssd_pure_steam_generator_sterilizer_quality_handover',
        acceptanceFragments: ['CSSD纯蒸汽', '灭菌器接口', '干度检测', '消毒供应', '科室移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-32',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['医废暂存', '防渗地坪', '消毒喷淋', '负压排风', '转运通道', '称重台账'],
        handoverEvidenceType: 'hospital_medical_waste_storage_anti_seepage_disinfection_transfer_handover',
        acceptanceFragments: ['医废暂存间', '防渗地坪', '称重台账', '院感检查', '移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-33',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['医疗污水', '预处理设备', '格栅调节池', '消毒投加', '在线监测', '达标排放'],
        handoverEvidenceType: 'hospital_medical_sewage_pretreatment_disinfection_monitoring_discharge_handover',
        acceptanceFragments: ['医疗污水预处理', '在线监测', '达标排放检测', '应急预案', '运维移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-41',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['内镜中心', '清洗槽', '消毒机', '洁净储存', '追溯条码', '通风排湿'],
        handoverEvidenceType: 'hospital_endoscopy_cleaning_disinfection_traceability_storage_handover',
        acceptanceFragments: ['内镜中心', '清洗槽消毒机', '追溯条码', '院感资料', '移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-42',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['血透水处理', '透析用水', '反渗透', '供回水环路', '内毒素', '治疗单元接口'],
        handoverEvidenceType: 'hospital_dialysis_water_treatment_loop_quality_treatment_bay_handover',
        acceptanceFragments: ['血透治疗区', '透析用水', '治疗单元', '水质台账', '科室移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-43',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['血库冷链', '交叉配血', '温度记录', '冰箱报警', '样本流线', '备用电源'],
        handoverEvidenceType: 'hospital_blood_bank_cold_chain_crossmatch_temperature_alarm_handover',
        acceptanceFragments: ['输血科血库', '连续温度记录', '冰箱报警', '冷链台账', '科室移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-44',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['发热门诊', '隔离采样', '缓冲间', '负压排风', '气流方向', '压差报警'],
        handoverEvidenceType: 'hospital_fever_clinic_isolation_sampling_negative_pressure_exhaust_handover',
        acceptanceFragments: ['发热门诊', '负压排风', '气流方向', '运行参数', '移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-48',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['环境监测平台', '压差传感器', '温湿度', '趋势记录', '报警阈值', '权限账号'],
        handoverEvidenceType: 'hospital_cleanroom_environment_monitoring_pressure_temperature_trend_handover',
        acceptanceFragments: ['洁净环境监测', '压差传感器', '趋势平台', '平台账号权限', '运维移交签认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-31',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['冷冻水', '冲洗钝化', '水质检测', '旁滤', '流速记录', '腐蚀率'],
        handoverEvidenceType: 'data_center_chilled_water_flushing_passivation_quality_handover',
        acceptanceFragments: ['冷冻水系统', '冲洗流速', '水质检测', '水质报告', '运维移交签认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-33',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['96小时试运行', '负载曲线', '告警记录', '温湿度趋势', '切换演练', '运维见证'],
        handoverEvidenceType: 'data_center_96h_integrated_commissioning_trial_operation_handover',
        acceptanceFragments: ['96小时综合联调', '负载曲线', '切换演练', '试运行报告', '运维接管签认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-36',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['防尾随', '互锁门', '门禁权限', '视频联动', 'UAT脚本', '访客流程'],
        handoverEvidenceType: 'data_center_mantrap_access_control_security_uat_handover',
        acceptanceFragments: ['防尾随', '互锁门', 'UAT脚本', '安防运行手册', '运维移交签认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-38',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['白区精保洁', '尘粒检测', '设备进场', '地板下清洁', '封堵检查', '放行单'],
        handoverEvidenceType: 'data_center_white_space_final_cleaning_equipment_entry_release_handover',
        acceptanceFragments: ['白区封闭', '尘粒检测', '设备进场放行单', '白区清洁检测报告', '运维移交签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-22',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['洁净棚', 'FFU', '高效过滤器', '围护密封', '粒子检测', '压差风速'],
        handoverEvidenceType: 'industrial_clean_booth_ffu_filter_particle_pressure_handover',
        acceptanceFragments: ['局部洁净棚', 'FFU风速', '过滤器泄漏', '检测报告', '移交签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-23',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['风淋室', '货淋室', '互锁门', '喷嘴风速', '除尘效率', '压差报警'],
        handoverEvidenceType: 'industrial_cleanroom_air_shower_cargo_shower_interlock_handover',
        acceptanceFragments: ['风淋室货淋室', '喷嘴风速', '门禁联动', '操作规程', '运行移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['结构现状', '测绘复核', '裂缝记录', '沉降变形', '隐蔽探查', '检测报告'],
        handoverEvidenceType: 'renovation_existing_structure_survey_detection_risk_handover',
        acceptanceFragments: ['结构现状调查', '裂缝记录', '检测报告', '风险清单', '成果移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['安全鉴定', '检测取样', '承载复核', '鉴定报告', '加固建议', '专家评审'],
        handoverEvidenceType: 'renovation_safety_appraisal_capacity_expert_review_handover',
        acceptanceFragments: ['安全鉴定范围', '鉴定报告', '专家评审意见', '结构安全结论', '移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-04',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['带运营施工', '隔离围挡', '噪声粉尘', '消防疏散', '营业流线', '投诉闭环'],
        handoverEvidenceType: 'renovation_occupied_operation_isolation_noise_dust_complaint_handover',
        acceptanceFragments: ['带运营施工', '隔离围挡', '投诉闭环', '协调会议纪要', '移交签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['教学运行', '分区围挡', '人车分流', '临时通道', '噪声窗口', '校方签认'],
        handoverEvidenceType: 'campus_teaching_continuity_phasing_enclosure_school_safety_handover',
        acceptanceFragments: ['教学运行保通', '分区围挡', '开学考试', '保通方案', '校方移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['大堂前厅', '公共走廊', '石材铺装', '灯光场景', '导视标识', '品牌样板'],
        handoverEvidenceType: 'hotel_lobby_public_corridor_mockup_finish_operations_handover',
        acceptanceFragments: ['大堂前厅', '石材铺装', '运营动线', '维护手册', '运营交付'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['宴会厅', '活动隔断', '舞台灯光', '音响系统', '厨房传菜', '消防排烟'],
        handoverEvidenceType: 'hotel_banquet_hall_partition_av_kitchen_fire_operations_handover',
        acceptanceFragments: ['宴会厅多功能厅', '舞台灯光', '厨房传菜', '运营培训', '移交签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-12',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['超限运输', '路线踏勘', '桥涵限高', '转弯半径', '许可报备', '交警协同'],
        handoverEvidenceType: 'mic_oversize_transport_route_survey_permit_traffic_handover',
        acceptanceFragments: ['超限运输路线', '桥涵限高', '许可报备', '踏勘报告', '移交签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-13',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['模块卸车', '临时堆放', '吊点保护', '防雨防潮', '成品保护', '堆场承载'],
        handoverEvidenceType: 'mic_module_unloading_temporary_storage_protection_handover',
        acceptanceFragments: ['现场卸车', '吊点保护', '模块外观编号', '交接清单', '移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps campus, hotel, industrial, bridge, renewable, high-rise, and tunnel follow-up packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-02-02-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防尘地坪', '防静电铜箔', '接地电阻', '表面电阻', '洁净收边', '导静电测试'],
        handoverEvidenceType: 'industrial_cleanroom_esd_floor_dustproof_resistance_grounding_acceptance_handover',
        acceptanceFragments: ['工业防尘地坪', '防静电铜箔', '表面电阻', '测试点位图', '移交签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['假期窗口', '教学秩序', '围挡隔离', '噪声控制', '校方巡检', '复课确认'],
        handoverEvidenceType: 'campus_holiday_window_teaching_order_noise_access_safety_handover',
        acceptanceFragments: ['教学秩序', '围挡隔离', '校方巡检', '复课前清场', '复课确认签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['校园道路', '雨污管网', '景观绿化', '井盖标高', '排水坡度', '夜间照明'],
        handoverEvidenceType: 'campus_road_pipe_landscape_drainage_lighting_handover',
        acceptanceFragments: ['校园道路管网', '雨污管网', '景观绿化', '照明台账', '校方移交签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['塑胶跑道', '球场面层', '看台栏杆', '场地坡度', '冲击吸收', '体育检测'],
        handoverEvidenceType: 'campus_sports_field_stand_surface_safety_testing_handover',
        acceptanceFragments: ['运动场地看台', '冲击吸收', '看台栏杆', '第三方体育检测', '移交签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['校方接管', '运维培训', '钥匙移交', '设备台账', '保修联系人', '开学巡检'],
        handoverEvidenceType: 'campus_owner_takeover_training_asset_defect_closeout_handover',
        acceptanceFragments: ['校方接管范围', '设备台账', '运维培训', '开学前联合巡检', '移交确认签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-01-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['标准客房', '批量装修', '品牌样板', '湿区闭水', '客控面板', '房态验收'],
        handoverEvidenceType: 'hotel_standard_room_batch_fitout_wet_area_guest_control_handover',
        acceptanceFragments: ['标准客房样板', '湿区闭水', '客控面板', '批量房态抽检', '运营移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['中西厨', '后勤通道', '排油烟', '燃气报警', '地沟排水', '卫生验收'],
        handoverEvidenceType: 'hotel_kitchen_back_of_house_exhaust_gas_drainage_health_handover',
        acceptanceFragments: ['中西厨后勤通道', '排油烟', '地沟排水', '卫生专项验收', '运营移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['SPA', '泳池', '健身房', '池体防水', '水质处理', '卫监验收'],
        handoverEvidenceType: 'hotel_spa_pool_fitness_waterproof_water_quality_health_handover',
        acceptanceFragments: ['SPA健身泳池', '池体防水', '水质检测', '卫监或运营验收', '移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-05-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['品牌标准', '差异澄清', '运营审查', '样板确认', '缺陷清单', '接管评审'],
        handoverEvidenceType: 'hotel_brand_standard_gap_review_defect_closeout_handover',
        acceptanceFragments: ['酒店品牌标准', '差异清单', '接管评审会议纪要', '品牌标准差异台账', '接管签认'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['approach embankment', 'settlement plate', 'pavement core', 'transition slab', 'guardrail', 'ride quality'],
        handoverEvidenceType: 'bridge_approach_embankment_pavement_settlement_transition_handover',
        acceptanceFragments: ['Approach embankment', 'Compaction settlement', 'Pavement core', 'As-built survey', 'handover signed'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['access road', 'site drainage', 'perimeter fencing', 'erosion control', 'environmental restoration', 'vegetation recovery'],
        handoverEvidenceType: 'renewable_access_road_drainage_fencing_environmental_restoration_handover',
        acceptanceFragments: ['Access road drainage', 'Perimeter fencing', 'Erosion control', 'As-built route', 'handover signed'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['collector cable', 'cable trench', 'splice joint', 'insulation test', 'grounding continuity', 'cable marker'],
        handoverEvidenceType: 'renewable_collector_cable_trench_splicing_grounding_test_handover',
        acceptanceFragments: ['Collector cable trench', 'warning tape', 'Splice joint', 'Test reports', 'handover signed'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['高强混凝土', '泵送压力', '入模温度', '坍落扩展度', '试块强度', '温控记录'],
        handoverEvidenceType: 'ultra_high_rise_high_strength_concrete_pumping_temperature_pressure_handover',
        acceptanceFragments: ['高强混凝土', '泵送压力', '同条件标养试块', '泵送压力温控记录', '移交签认'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-01-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['管廊回填', '压实度', '道路恢复', '井盖标高', '交通开放', '沉降观测'],
        handoverEvidenceType: 'utility_tunnel_backfill_road_restoration_traffic_opening_handover',
        acceptanceFragments: ['综合管廊回填', '压实度', '交通标线标识', '开放检查表', '移交签认'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['管廊支架', '电缆桥架', '接地干线', '防腐涂层', '膨胀螺栓', '绝缘测试'],
        handoverEvidenceType: 'utility_tunnel_bracket_cable_tray_grounding_labeling_handover',
        acceptanceFragments: ['综合管廊支架', '接地干线', '舱室标识', '隐蔽验收', '移交签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps hospital clinical-interface, ASRS, renovation demolition, and classroom mockup packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-45',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['手术室吊塔', '无影灯', '情报面板', '医气接口', '结构承载', '联调记录'],
        handoverEvidenceType: 'hospital_operating_room_pendant_shadowless_lamp_panel_interface_handover',
        acceptanceFragments: ['手术室吊塔', '医气电源', '吊塔旋转', '临床场景模拟', '移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-46',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['医疗弱电', '临床系统', '护士站接口', 'PACS', 'LIS', '权限账号'],
        handoverEvidenceType: 'hospital_clinical_low_voltage_system_interface_uat_handover',
        acceptanceFragments: ['临床系统接口', 'PACS LIS', '网络隔离', 'UAT脚本', '移交签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-47',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['标本前处理', '生物安全柜', '冷藏接口', '排风联动', '样本追溯', '温度记录'],
        handoverEvidenceType: 'hospital_laboratory_specimen_pretreatment_bsc_cold_storage_handover',
        acceptanceFragments: ['标本前处理', '生物安全柜', '样本追溯', '温控台账', '移交签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-25',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['ASRS自动立库', '堆垛机', '货位编码', 'WMS接口', '消防分区', '安全联锁'],
        handoverEvidenceType: 'industrial_cleanroom_asrs_wms_stack_crane_safety_handover',
        acceptanceFragments: ['ASRS自动立库', 'WMS接口', '荷载测试', '货位台账', '运营移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-06',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['选择性拆除', '渣土清运', '临时支撑', '粉尘控制', '结构保护', '清运联单'],
        handoverEvidenceType: 'renovation_selective_demolition_waste_hauling_protection_handover',
        acceptanceFragments: ['选择性拆除', '渣土分类清运', '保留结构', '拆除影像', '移交签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['标准教室样板', '黑板讲台', '照明照度', '多媒体接口', '声环境', '校方验收'],
        handoverEvidenceType: 'campus_standard_classroom_mockup_lighting_av_school_acceptance_handover',
        acceptanceFragments: ['标准教室样板', '照明照度', '校方教师试用', '样板影像', '批量放行签认'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps deeper real specialty template evidence profiles tied to field and handover metadata', () => {
    const expectations = [
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-03-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['trial pile plan', 'loading stage', 'uplift anchor', 'settlement curve', 'parameter freeze'],
        handoverEvidenceType: 'foundation_trial_pile_loading_uplift_settlement_parameter_handover',
        acceptanceFragments: ['Trial pile', 'Loading stage', 'Settlement curve', 'Parameter freeze', 'handover signed'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-03-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['casing position', 'confined water', 'mud index', 'hole depth', 'pile integrity'],
        handoverEvidenceType: 'foundation_bored_pile_confined_water_mud_integrity_handover',
        acceptanceFragments: ['Confined water', 'Mud index', 'Integrity test', 'as-built record', 'handover signed'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-03-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['PHC pile certificate', 'static press force', 'welding seam', 'final pressure', 'pile record'],
        handoverEvidenceType: 'foundation_phc_static_press_final_pressure_pile_record_handover',
        acceptanceFragments: ['PHC pile', 'press force', 'welding seam', 'final pressure', 'handover signed'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['SMW guide trench', 'H steel', 'cement slurry', 'verticality', 'wall continuity'],
        handoverEvidenceType: 'foundation_smw_wall_h_steel_slurry_verticality_handover',
        acceptanceFragments: ['SMW wall', 'H steel', 'slurry ratio', 'verticality', 'handover signed'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['TRD platform', 'chain cutter', 'cement soil wall', 'wall thickness', 'wall top'],
        handoverEvidenceType: 'foundation_trd_cement_soil_wall_thickness_top_handover',
        acceptanceFragments: ['TRD wall', 'wall thickness', 'cement soil', 'wall top', 'handover signed'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-21',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['seasonal condition', 'sensor calibration', 'temperature humidity', 'pressure cascade', 'validation report'],
        handoverEvidenceType: 'hospital_cleanroom_seasonal_condition_temperature_humidity_validation_handover',
        acceptanceFragments: ['Seasonal condition', 'Sensor calibration', 'pressure cascade', 'validation report', 'handover signed'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-37',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['pathology ventilation', 'formaldehyde exhaust', 'waste liquid', 'sample bench', 'infection control'],
        handoverEvidenceType: 'hospital_pathology_ventilation_formaldehyde_waste_liquid_handover',
        acceptanceFragments: ['Pathology ventilation', 'formaldehyde', 'waste liquid', 'infection control', 'handover signed'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-38',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['ICU NICU', 'medical headwall', 'isolated power', 'nurse call', 'clinical acceptance'],
        handoverEvidenceType: 'hospital_icu_nicu_headwall_isolated_power_clinical_handover',
        acceptanceFragments: ['ICU NICU', 'headwall', 'isolated power', 'nurse call', 'handover signed'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-09',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['day tank', 'fuel piping', 'leak basin', 'level alarm', 'refueling drill'],
        handoverEvidenceType: 'data_center_generator_day_tank_fuel_alarm_refueling_handover',
        acceptanceFragments: ['Day tank', 'fuel piping', 'level alarm', 'refueling drill', 'handover signed'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-10',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['exhaust route', 'back pressure', 'silencer', 'flexible joint', 'temperature rise'],
        handoverEvidenceType: 'data_center_generator_exhaust_silencer_back_pressure_handover',
        acceptanceFragments: ['Exhaust route', 'back pressure', 'silencer', 'temperature rise', 'handover signed'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-13',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['lightning protection', 'equipotential bonding', 'grounding resistance', 'copper bar', 'hidden acceptance'],
        handoverEvidenceType: 'data_center_lightning_grounding_equipotential_hidden_handover',
        acceptanceFragments: ['Lightning protection', 'equipotential', 'Grounding resistance', 'hidden acceptance', 'handover signed'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-16',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['cooling tower', 'dry cooler', 'antifreeze', 'drainage', 'DCIM trend'],
        handoverEvidenceType: 'data_center_cooling_tower_dry_cooler_antifreeze_dcim_handover',
        acceptanceFragments: ['Cooling tower', 'dry cooler', 'antifreeze', 'DCIM trend', 'handover signed'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['URS interview', 'process boundary', 'user requirement', 'traceability matrix', 'baseline freeze'],
        handoverEvidenceType: 'industrial_cleanroom_urs_requirement_boundary_traceability_handover',
        acceptanceFragments: ['URS', 'process boundary', 'traceability matrix', 'Baseline freeze', 'handover signed'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-02',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['design qualification', 'URS traceability', 'deviation log', 'approval record', 'DQ report'],
        handoverEvidenceType: 'industrial_cleanroom_dq_design_qualification_deviation_handover',
        acceptanceFragments: ['Design qualification', 'URS traceability', 'Deviation log', 'DQ report', 'handover signed'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-06',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['rotor dehumidifier', 'dew point target', 'airtight envelope', 'regeneration air', 'dry room'],
        handoverEvidenceType: 'industrial_cleanroom_dry_room_rotor_dehumidifier_dewpoint_handover',
        acceptanceFragments: ['Rotor dehumidifier', 'dew point', 'regeneration air', 'dry room', 'handover signed'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['dew point validation', 'sensor layout', 'continuous trend', 'retest record', 'deviation closure'],
        handoverEvidenceType: 'industrial_cleanroom_dry_room_dewpoint_validation_retest_handover',
        acceptanceFragments: ['Dew point validation', 'Continuous trend', 'deviation closure', 'handover signed'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-09',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['steel plate bonding', 'base grinding', 'adhesive batch', 'pressure holding', 'hollow defect'],
        handoverEvidenceType: 'renovation_bonded_steel_plate_pressure_hollow_defect_handover',
        acceptanceFragments: ['Steel plate bonding', 'pressure holding', 'hollow defect', 'Anticorrosion seal', 'handover signed'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-10',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['carbon fiber', 'base repair', 'primer batch', 'fiber direction', 'bond quality'],
        handoverEvidenceType: 'renovation_carbon_fiber_base_repair_bond_quality_handover',
        acceptanceFragments: ['Carbon fiber', 'base repair', 'fiber direction', 'bond quality', 'handover signed'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-14',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['facade repair', 'hollow area', 'water leakage', 'sealant joint', 'water spray test'],
        handoverEvidenceType: 'renovation_facade_repair_waterproof_spray_test_handover',
        acceptanceFragments: ['Facade repair', 'water leakage', 'sealant joint', 'water spray test', 'handover signed'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-04',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['historic masonry', 'pathology survey', 'lime mortar', 'sample repair', 'expert review'],
        handoverEvidenceType: 'heritage_masonry_lime_mortar_sample_repair_expert_handover',
        acceptanceFragments: ['Historic masonry', 'lime mortar', 'sample repair', 'expert review', 'handover signed'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-05',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['timber member', 'decay insect', 'moisture content', 'splice repair', 'traditional craft'],
        handoverEvidenceType: 'heritage_timber_member_decay_moisture_splice_repair_handover',
        acceptanceFragments: ['Timber member', 'Moisture content', 'splice repair', 'traditional craft', 'handover signed'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['station hall retail', 'fire boundary', 'MEP terminal', 'shopfront interface', 'commercial opening'],
        handoverEvidenceType: 'tod_station_hall_retail_fire_mep_shopfront_handover',
        acceptanceFragments: ['Station hall retail', 'fire boundary', 'MEP terminal', 'shopfront', 'handover signed'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['metro entrance canopy', 'wayfinding sign', 'drainage interface', 'lighting circuit', 'passenger route'],
        handoverEvidenceType: 'tod_metro_entrance_canopy_wayfinding_passenger_route_handover',
        acceptanceFragments: ['Metro entrance canopy', 'wayfinding sign', 'drainage interface', 'passenger route', 'handover signed'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['module split', 'BIM clash', 'transport limit', 'module numbering', 'manufacturing list'],
        handoverEvidenceType: 'mic_module_split_numbering_manufacturing_list_freeze_handover',
        acceptanceFragments: ['Module split', 'BIM clash', 'module numbering', 'manufacturing list', 'handover signed'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['factory jig', 'tooling drawing', 'dimensional calibration', 'trial assembly', 'jig acceptance'],
        handoverEvidenceType: 'mic_factory_jig_tooling_calibration_trial_assembly_handover',
        acceptanceFragments: ['Factory jig', 'tooling drawing', 'Dimensional calibration', 'trial assembly', 'handover signed'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['executive suite', 'stone finish', 'wood veneer', 'custom soft furnishing', 'brand inspection'],
        handoverEvidenceType: 'hotel_executive_suite_stone_wood_soft_furnishing_handover',
        acceptanceFragments: ['Executive suite', 'stone finish', 'wood veneer', 'soft furnishing', 'handover signed'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['meeting room acoustic', 'AV system', 'movable partition', 'scene simulation', 'operation acceptance'],
        handoverEvidenceType: 'hotel_meeting_room_acoustic_av_partition_scene_handover',
        acceptanceFragments: ['Meeting room acoustic', 'AV system', 'movable partition', 'scene simulation', 'handover signed'],
      },
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-01-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['container yard pavement', 'reefer foundation', 'load test', 'yard drainage', 'terminal yard'],
        handoverEvidenceType: 'port_container_yard_pavement_reefer_foundation_load_handover',
        acceptanceFragments: ['Container yard', 'reefer foundation', 'load test', 'drainage flow', 'handover signed'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-02-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['bridge deck pavement', 'guardrail', 'deck drainage', 'lighting circuit', 'opening condition'],
        handoverEvidenceType: 'bridge_deck_pavement_guardrail_drainage_opening_handover',
        acceptanceFragments: ['Bridge deck pavement', 'guardrail', 'drainage', 'opening condition', 'handover signed'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-02-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['BESS container', 'battery rack', 'PCS BMS', 'fire linkage', 'operation safety'],
        handoverEvidenceType: 'renewable_bess_container_battery_rack_fire_linkage_handover',
        acceptanceFragments: ['BESS container', 'battery rack', 'fire linkage', 'operation safety', 'handover signed'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-01-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['outrigger truss', 'belt truss', 'embedded plate', 'unloading control', 'survey monitoring'],
        handoverEvidenceType: 'ultra_high_rise_outrigger_belt_truss_unloading_monitoring_handover',
        acceptanceFragments: ['Outrigger truss', 'embedded plate', 'unloading control', 'survey monitoring', 'handover signed'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-01-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['utility tunnel waterproofing', 'movement joint', 'wall sleeve', 'water stop', 'closed water test'],
        handoverEvidenceType: 'utility_tunnel_waterproof_movement_joint_sleeve_handover',
        acceptanceFragments: ['Utility tunnel waterproofing', 'movement joint', 'wall sleeve', 'closed water test', 'handover signed'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps third-round specialty engineering seed evidence profiles tied to exact field and handover metadata', () => {
    const expectations = [
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-03-01-04',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['桩位复核', '桩机调平', 'CFG桩', '成桩记录', '低应变'],
        handoverEvidenceType: 'foundation_cfg_pile_position_machine_leveling_integrity_handover',
        acceptanceFragments: ['桩位复核', '桩机调平', '成桩记录', '低应变', '验收移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-03-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['旋喷桩位', '试喷参数', '喷浆压力', '止水帷幕', '验收'],
        handoverEvidenceType: 'foundation_jet_grouting_water_cutoff_trial_parameter_handover',
        acceptanceFragments: ['旋喷桩位', '试喷参数', '喷浆压力', '渗漏点', '止水帷幕验收'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-03-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['搅拌桩位', '水泥掺量', '桩身强度', '复合地基', '验收'],
        handoverEvidenceType: 'foundation_mixed_soil_pile_cement_strength_composite_ground_handover',
        acceptanceFragments: ['搅拌桩位', '水泥掺量', '桩身强度', '复合地基', '验收签认'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['导墙轴线', '放样', '混凝土养护', '泥浆沟', '平台移交'],
        handoverEvidenceType: 'foundation_diaphragm_guide_wall_axis_curing_platform_handover',
        acceptanceFragments: ['导墙轴线', '混凝土养护', '泥浆沟', '作业平台', '移交签认'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-06',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['接头位置', '槽段编号', '接头清刷', '咬合复核', '验收移交'],
        handoverEvidenceType: 'foundation_diaphragm_joint_segment_brushing_overlap_handover',
        acceptanceFragments: ['接头位置', '槽段编号', '接头清刷', '咬合复核', '验收移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['冠梁', '第一道支撑', '轴线标高', '混凝土强度', '内支撑验收'],
        handoverEvidenceType: 'foundation_first_rc_strut_crown_beam_axis_strength_handover',
        acceptanceFragments: ['冠梁', '第一道支撑', '轴线标高', '混凝土强度', '内支撑验收'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['钢支撑', '分道安装', '轴力计', '预加轴力', '安装验收'],
        handoverEvidenceType: 'foundation_steel_strut_sequence_axial_force_preload_handover',
        acceptanceFragments: ['钢支撑', '分道安装', '轴力计', '预加轴力', '安装验收'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-09',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['换撑工况', '主体结构强度', '换撑节点', '接口防水', '验收移交'],
        handoverEvidenceType: 'foundation_strut_replacement_structure_strength_interface_handover',
        acceptanceFragments: ['换撑工况', '主体结构强度', '换撑节点', '接口防水', '验收移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['拆撑条件', '结构强度', '切割顺序', '洞口修补', '验收移交'],
        handoverEvidenceType: 'foundation_strut_removal_condition_strength_opening_repair_handover',
        acceptanceFragments: ['拆撑条件', '结构强度', '切割顺序', '洞口修补', '验收移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-11',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['锚位放样', '孔位复核', '注浆记录', '张拉锁定', '抗拔试验'],
        handoverEvidenceType: 'foundation_anchor_position_grouting_tension_pullout_handover',
        acceptanceFragments: ['锚位放样', '孔位复核', '注浆记录', '张拉锁定', '抗拔试验'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-12',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['边坡修整', '分层开挖', '土钉成孔', '喷射混凝土', '支护验收'],
        handoverEvidenceType: 'foundation_soil_nailing_slope_layer_shotcrete_handover',
        acceptanceFragments: ['边坡修整', '分层开挖', '土钉成孔', '喷射混凝土', '支护验收'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-13',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['墙位放线', '地基处理', '水泥土挡墙', '渗漏复测', '验收移交'],
        handoverEvidenceType: 'foundation_gravity_cement_soil_wall_line_ground_leakage_handover',
        acceptanceFragments: ['墙位放线', '地基处理', '水泥土挡墙', '渗漏复测', '验收移交'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-39',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['静配中心', '物流', '洁净分区', '传递窗', '压差复测'],
        handoverEvidenceType: 'hospital_pivas_cleanroom_logistics_pass_box_pressure_handover',
        acceptanceFragments: ['静配中心', '洁净分区', '传递窗', '压差复测', '验收签认'],
      },
      {
        templateId: 'china-cleanroom-medical-specialty',
        code: 'CLN-04-01-40',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['高压氧舱', '基础', '消防间距', '厂家试运行', '验收'],
        handoverEvidenceType: 'hospital_hyperbaric_oxygen_room_foundation_fire_distance_trial_handover',
        acceptanceFragments: ['高压氧舱', '消防间距', '厂家试运行', '报警联动', '验收签认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-19',
        expectedProcessCount: 10,
        firstEvidenceFragments: ['BMS接口', '点表清单', '网关控制器', '联动场景', '接口验收'],
        handoverEvidenceType: 'data_center_bms_gateway_point_mapping_scene_handover',
        acceptanceFragments: ['BMS接口', '点表清单', '网关控制器', '联动场景', '接口验收'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-20',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['安防分区', '门禁权限矩阵', '访客策略', '视频联动', '权限清册'],
        handoverEvidenceType: 'data_center_access_video_visitor_permission_register_handover',
        acceptanceFragments: ['安防分区', '门禁权限矩阵', '访客策略', '视频联动', '权限清册'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-21',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['周界防区', '巡更路线', '夜间补光', '试运行巡检', '周界安防验收'],
        handoverEvidenceType: 'data_center_perimeter_patrol_route_night_linkage_handover',
        acceptanceFragments: ['周界防区', '巡更路线', '夜间补光', '试运行巡检', '周界安防验收'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-29',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['SOP', '运维边界', '培训演练', '问题清单', '接管签认'],
        handoverEvidenceType: 'data_center_operations_sop_training_boundary_takeover_handover',
        acceptanceFragments: ['SOP', '运维边界', '培训演练', '问题清单', '接管签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['涂布线', '洁净等级', '设备边界', '洁净风口', '露点检测'],
        handoverEvidenceType: 'industrial_cleanroom_coating_line_envelope_cleanliness_dewpoint_handover',
        acceptanceFragments: ['涂布线', '洁净等级', '洁净风口', '露点检测', '验收签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['化成分容区', '荷载', '防火分区', '工艺接口', '安全联动'],
        handoverEvidenceType: 'industrial_cleanroom_formation_capacity_interface_safety_linkage_handover',
        acceptanceFragments: ['化成分容区', '荷载', '防火分区', '工艺接口', '安全联动'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps remaining foundation, IDC closeout, and industrial cleanroom critical profiles evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-15',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['土方外运', '基坑道路', '车辆冲洗', '消纳联单', '道路保洁'],
        handoverEvidenceType: 'foundation_excavation_haulage_road_wash_disposal_handover',
        acceptanceFragments: ['土方外运', '车辆冲洗', '消纳联单', '道路保洁', '移交完成'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-04-01-16',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['边坡喷锚', '稳定监测', '坡面排水', '喷射厚度', '支护验收'],
        handoverEvidenceType: 'foundation_slope_shotcrete_stability_monitoring_drainage_handover',
        acceptanceFragments: ['边坡喷锚', '稳定监测', '坡面排水', '喷射厚度', '支护验收'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-05-01-01',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['管井降水', '井位复核', '滤料回填', '水位曲线', '运行移交'],
        handoverEvidenceType: 'foundation_tube_well_dewatering_filter_drawdown_operation_handover',
        acceptanceFragments: ['管井降水', '井位复核', '滤料回填', '水位曲线', '运行移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-05-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['真空降水', '真空泵组', '密封管路', '真空度', '降水验收'],
        handoverEvidenceType: 'foundation_vacuum_dewatering_pump_seal_vacuum_degree_handover',
        acceptanceFragments: ['真空降水', '真空泵组', '密封管路', '真空度', '降水验收'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-05-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['回灌井', '地下水回灌', '回灌水质', '水位联动', '运行移交'],
        handoverEvidenceType: 'foundation_recharge_well_water_quality_level_linkage_handover',
        acceptanceFragments: ['回灌井', '地下水回灌', '回灌水质', '水位联动', '运行移交'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-06-01-01',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['基坑监测', '测点布设', '初始值', '报警阈值', '监测方案'],
        handoverEvidenceType: 'foundation_pit_monitoring_point_layout_initial_value_handover',
        acceptanceFragments: ['基坑监测', '测点布设', '初始值', '报警阈值', '监测方案'],
      },
      {
        templateId: 'china-foundation-pit-pile',
        code: 'FND-06-01-03',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['警戒值调整', '监测超限', '应急处置', '专家会商', '复工确认'],
        handoverEvidenceType: 'foundation_warning_threshold_adjustment_emergency_review_handover',
        acceptanceFragments: ['警戒值调整', '监测超限', '应急处置', '专家会商', '复工确认'],
      },
      {
        templateId: 'china-data-center-specialty',
        code: 'DTC-04-01-30',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['备品备件', '应急工具', '资产台账', '库位编号', '移交签认'],
        handoverEvidenceType: 'data_center_spare_parts_emergency_tools_asset_register_handover',
        acceptanceFragments: ['备品备件', '应急工具', '资产台账', '库位编号', '移交签认'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-18',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['超纯水系统', 'TOC', '电阻率', '循环管路', '水质放行'],
        handoverEvidenceType: 'industrial_cleanroom_upw_toc_resistivity_loop_quality_handover',
        acceptanceFragments: ['超纯水系统', 'TOC', '电阻率', '循环管路', '水质放行'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-28',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['工艺设备搬入', '二次配管', '吊装路线', '洁净保护', '接口验收'],
        handoverEvidenceType: 'industrial_cleanroom_process_equipment_move_in_hookup_interface_handover',
        acceptanceFragments: ['工艺设备搬入', '二次配管', '吊装路线', '洁净保护', '接口验收'],
      },
      {
        templateId: 'china-industrial-cleanroom-specialty',
        code: 'ICR-05-01-31',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['消防防爆', '安全联动', 'LEL报警', '防爆电气', '联动验收'],
        handoverEvidenceType: 'industrial_cleanroom_fire_explosion_lel_safety_linkage_handover',
        acceptanceFragments: ['消防防爆', '安全联动', 'LEL报警', '防爆电气', '联动验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps campus kitchen, sports, learning, smart-campus, opening, and operations packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-06',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['学生食堂厨房', '排油烟', '燃气报警', '设备联调', '卫生许可'],
        handoverEvidenceType: 'campus_canteen_kitchen_exhaust_gas_hygiene_acceptance_handover',
        acceptanceFragments: ['学生食堂厨房', '排油烟', '燃气报警', '设备联调', '卫生许可'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['体育馆木地板', '声光系统', '弹性垫层', '照明眩光', '赛事验收'],
        handoverEvidenceType: 'campus_gym_wood_floor_acoustic_lighting_sports_acceptance_handover',
        acceptanceFragments: ['体育馆木地板', '声光系统', '照明眩光', '赛事验收', '移交完成'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-08',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['运动场基层', '塑胶面层', '排水坡度', '划线测量', '环保检测'],
        handoverEvidenceType: 'campus_sports_field_base_surface_drainage_environment_handover',
        acceptanceFragments: ['运动场基层', '塑胶面层', '排水坡度', '环保检测', '移交完成'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-09',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['图书馆阅览区', '声学吸声', '照明照度', '书架荷载', '阅读体验'],
        handoverEvidenceType: 'campus_library_reading_acoustic_lighting_load_handover',
        acceptanceFragments: ['图书馆阅览区', '声学照明', '书架荷载', '阅读体验', '移交完成'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-10',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['报告厅舞台', '灯光系统', '声学扩声', '舞台机械', '场景验收'],
        handoverEvidenceType: 'campus_auditorium_stage_lighting_acoustic_scene_handover',
        acceptanceFragments: ['报告厅舞台', '灯光声学', '舞台机械', '场景验收', '移交完成'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-11',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['行政楼窗口', '服务柜台', '叫号系统', '隐私隔断', '便民验收'],
        handoverEvidenceType: 'campus_admin_service_counter_queue_privacy_handover',
        acceptanceFragments: ['行政楼服务窗口', '服务柜台', '叫号系统', '隐私隔断', '便民验收'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-14',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['校园广播', '时钟系统', '分区回路', '授时同步', '联动测试'],
        handoverEvidenceType: 'campus_broadcast_clock_zone_sync_linkage_handover',
        acceptanceFragments: ['校园广播', '时钟系统', '授时同步', '联动测试', '移交完成'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-15',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['校园一卡通', '门禁消费', '权限矩阵', '数据同步', '试运行'],
        handoverEvidenceType: 'campus_card_access_payment_permission_sync_handover',
        acceptanceFragments: ['校园一卡通', '门禁消费', '权限矩阵', '数据同步', '试运行'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-16',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['智慧教室', '多媒体系统', '录播互动', '网络覆盖', '教师试用'],
        handoverEvidenceType: 'campus_smart_classroom_multimedia_recording_network_handover',
        acceptanceFragments: ['智慧教室', '多媒体系统', '录播互动', '网络覆盖', '教师试用'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-18',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['屋面光伏', '节能展示', '逆变器', '并网测试', '数据看板'],
        handoverEvidenceType: 'campus_roof_pv_energy_display_inverter_grid_handover',
        acceptanceFragments: ['屋面光伏', '节能展示', '逆变器', '并网测试', '数据看板'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-19',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['雨水花园', '海绵校园', '下凹绿地', '溢流口', '渗排测试'],
        handoverEvidenceType: 'campus_sponge_rain_garden_overflow_infiltration_handover',
        acceptanceFragments: ['雨水花园', '海绵校园', '下凹绿地', '溢流口', '渗排测试'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-20',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['消防疏散', '演练路线', '应急照明', '疏散标识', '演练记录'],
        handoverEvidenceType: 'campus_fire_evacuation_drill_emergency_lighting_signage_handover',
        acceptanceFragments: ['消防疏散', '演练路线', '应急照明', '疏散标识', '演练记录'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-21',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['无障碍通道', '电梯接口', '坡道扶手', '盲道', '适老验收'],
        handoverEvidenceType: 'campus_accessible_route_elevator_interface_handover',
        acceptanceFragments: ['无障碍通道', '电梯接口', '坡道扶手', '盲道', '适老验收'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-23',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['开学前检查', '联合安全', '问题清单', '整改销项', '开学放行'],
        handoverEvidenceType: 'campus_pre_opening_joint_safety_punch_release_handover',
        acceptanceFragments: ['开学前', '联合安全', '问题清单', '整改销项', '开学放行'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-24',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['教育主管部门', '验收资料', '校舍安全', '功能核验', '验收意见'],
        handoverEvidenceType: 'campus_education_authority_acceptance_school_safety_handover',
        acceptanceFragments: ['教育主管部门', '验收资料', '校舍安全', '功能核验', '验收意见'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-25',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['餐饮卫生许可', '后厨流线', '消毒设施', '水质检测', '许可验收'],
        handoverEvidenceType: 'campus_catering_hygiene_permit_kitchen_flow_handover',
        acceptanceFragments: ['餐饮卫生许可', '后厨流线', '消毒设施', '水质检测', '许可验收'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-26',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['宿舍家具', '床位编号', '防倾倒', '环保检测', '入住验收'],
        handoverEvidenceType: 'campus_dormitory_furniture_bed_numbering_safety_handover',
        acceptanceFragments: ['宿舍家具', '床位编号', '防倾倒', '环保检测', '入住验收'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-27',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['校园绿化', '活动空间', '乔灌木', '灌溉系统', '养护移交'],
        handoverEvidenceType: 'campus_landscape_activity_space_irrigation_maintenance_handover',
        acceptanceFragments: ['校园绿化', '活动空间', '乔灌木', '灌溉系统', '养护移交'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-29',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['校园物业', '运维培训', '设备台账', '保修边界', '接管签认'],
        handoverEvidenceType: 'campus_property_operations_training_asset_warranty_handover',
        acceptanceFragments: ['校园物业', '运维培训', '设备台账', '保修边界', '接管签认'],
      },
      {
        templateId: 'china-campus-specialty',
        code: 'CMP-05-01-30',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['开学保障', '问题销项', '值守安排', '应急响应', '保障验收'],
        handoverEvidenceType: 'campus_opening_support_punch_closeout_duty_response_handover',
        acceptanceFragments: ['开学保障', '问题销项', '值守安排', '应急响应', '保障验收'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps hotel, renovation, and TOD expansion packs tied to evidence-rich handover metadata', () => {
    const expectations = [
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['无障碍客房', '通行净宽', '扶手高度', '卫生间回转', '呼叫按钮'],
        handoverEvidenceType: 'hotel_accessible_guestroom_clear_width_grab_bar_call_button_handover',
        acceptanceFragments: ['无障碍客房', '通行净宽', '呼叫按钮', '客控灯光', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-05',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['行政酒廊', '吧台设备', '餐饮流线', '软装家具', '照明场景'],
        handoverEvidenceType: 'hotel_executive_lounge_bar_equipment_lighting_operation_handover',
        acceptanceFragments: ['行政酒廊', '吧台给排水', '餐饮流线', '消防喷淋', '服务交接'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['全日制餐厅', '开放厨房', '排烟补风', '餐台岛台', '食品卫生'],
        handoverEvidenceType: 'hotel_all_day_dining_open_kitchen_mep_hygiene_operation_handover',
        acceptanceFragments: ['餐位数量', '开放厨房', '食品卫生', '试营业问题', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-11',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['食品冷库', '库温记录', '保温门', '货架编号', '冷凝排水'],
        handoverEvidenceType: 'hotel_food_cold_storage_dry_store_temperature_hygiene_handover',
        acceptanceFragments: ['冷库干货库', '制冷机组', '库温连续记录', '货架编号', '运营交接'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-13',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['大堂石材', '接待台', '石材排版', '空鼓检测', '灯带收口'],
        handoverEvidenceType: 'hotel_lobby_stone_reception_counter_brand_acceptance_handover',
        acceptanceFragments: ['大堂石材', '石材批次', '空鼓检测', '接待台电源', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-14',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['水晶灯', '高空装饰', '吊点复核', '检修通道', '试亮记录'],
        handoverEvidenceType: 'hotel_lobby_chandelier_high_level_decoration_safety_handover',
        acceptanceFragments: ['水晶灯', '吊点预埋', '防坠链', '调光控制', '运维移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-16',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['SPA按摩房', '湿区防水', '私密隔声', '地暖温控', '香氛排风'],
        handoverEvidenceType: 'hotel_spa_treatment_room_waterproof_acoustic_operation_handover',
        acceptanceFragments: ['SPA房型', '湿区防水', '隔声私密', '试运营问题', '移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-17',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['恒温泳池', '池体防水', '水处理', '除湿空调', '防滑地面'],
        handoverEvidenceType: 'hotel_indoor_pool_waterproof_water_treatment_dehumidification_handover',
        acceptanceFragments: ['泳池池体', '池体防水', '水处理', '除湿空调', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-21',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['电子门锁', '一卡通', '房号绑定', '授权策略', '离线开门'],
        handoverEvidenceType: 'hotel_electronic_lock_card_system_room_binding_security_handover',
        acceptanceFragments: ['门锁品牌', '房号绑定', '离线开门', 'PMS门禁', '权限清册'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-24',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['品牌验收', '标准清单', '样板偏差', '运营巡检', '缺陷销项'],
        handoverEvidenceType: 'hotel_brand_operator_standard_acceptance_punch_closeout_handover',
        acceptanceFragments: ['品牌验收范围', '品牌标准条款', '运营方巡检', '缺陷清单', '接收签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-12',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['货运物流', '后勤动线', '耐磨地面', '货梯卸货', '门禁监控'],
        handoverEvidenceType: 'hotel_back_of_house_logistics_freight_route_security_handover',
        acceptanceFragments: ['货运物流通道', '耐磨地面', '货梯', '门禁监控', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-15',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['艺术品布展', '保险清单', '挂点承载', '洗墙灯', '防盗件'],
        handoverEvidenceType: 'hotel_artwork_soft_furnishing_display_mounting_security_handover',
        acceptanceFragments: ['艺术品软装', '挂点坐标', '洗墙灯', '运营巡检', '运营签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-18',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['健身房', '楼板荷载', '减振垫', '声学吸收', 'CO2新风'],
        handoverEvidenceType: 'hotel_gym_acoustic_equipment_vibration_ventilation_safety_handover',
        acceptanceFragments: ['健身房设备', '器械基础', '弹性地面', '新风CO2', '移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-22',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['客房IPTV', '频道清单', '网络带宽', '欢迎页', '逐房测试'],
        handoverEvidenceType: 'hotel_guestroom_iptv_channel_network_room_test_handover',
        acceptanceFragments: ['客房IPTV', '电视机顶盒', '欢迎页', '逐房网络接入', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-23',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['餐饮POS', '菜单库存', '收银终端', 'PMS接口', '结算测试'],
        handoverEvidenceType: 'hotel_fnb_pos_menu_inventory_pms_settlement_handover',
        acceptanceFragments: ['餐饮POS', '收银终端', '菜单价格', 'PMS财务', '运营移交'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-25',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['驻场培训', '岗位清单', '设备操作', '服务流程', '应急演练'],
        handoverEvidenceType: 'hotel_operator_training_equipment_service_emergency_handover',
        acceptanceFragments: ['运营方驻场', '工程设备操作', '服务流程', '应急演练', '移交签认'],
      },
      {
        templateId: 'china-hotel-specialty',
        code: 'HTL-06-01-27',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['软开荒', '精保洁', '备品摆放', '锁房销项', '开业值守'],
        handoverEvidenceType: 'hotel_preopening_cleaning_punch_room_release_handover',
        acceptanceFragments: ['软开荒', '精保洁', '房态锁房', '开业首日值守', '接管签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-11',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['增大截面', '界面凿毛', '植筋连接', '模板加固', '混凝土浇筑'],
        handoverEvidenceType: 'renovation_section_enlargement_rebar_connection_concrete_strength_handover',
        acceptanceFragments: ['增大截面范围', '界面凿毛', '植筋锚固', '混凝土浇筑', '界面移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-12',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['裂缝编号', '宽度复测', '灌浆材料', '压力记录', '封闭检查'],
        handoverEvidenceType: 'renovation_crack_grouting_sealing_pressure_retest_handover',
        acceptanceFragments: ['裂缝编号', '灌浆材料', '灌浆压力', '复测验收', '移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-15',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['屋面翻修', '保温层', '防水卷材', '泛水收口', '蓄水试验'],
        handoverEvidenceType: 'renovation_roof_refurbishment_insulation_waterproof_ponding_handover',
        acceptanceFragments: ['屋面翻修范围', '保温层材料', '防水卷材', '蓄水淋水试验', '屋面移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-17',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['强电迁改', '停电窗口', '临时供电', '配电回路', '相序绝缘'],
        handoverEvidenceType: 'renovation_power_distribution_phased_relocation_energization_handover',
        acceptanceFragments: ['强电迁改范围', '临时供电回路', '绝缘电阻', '分阶段送电', '运维移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-13',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['局部补强', '卸载防护', '钢筋除锈', '型钢安装', '高强修补料'],
        handoverEvidenceType: 'renovation_local_slab_beam_column_reinforcement_strength_handover',
        acceptanceFragments: ['局部补强范围', '钢筋除锈', '型钢连接', '承载复核', '移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-19',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['电气隐患', '断电范围', '漏保接地', '等电位', '温升检测'],
        handoverEvidenceType: 'renovation_electrical_hazard_rectification_grounding_thermal_handover',
        acceptanceFragments: ['电气安全隐患', '漏保接地', '绝缘电阻', '温升检测', '运营移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-20',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['给排水迁改', '管线探查', '临时旁路', '试压通水', '洞口封堵'],
        handoverEvidenceType: 'renovation_plumbing_relocation_bypass_pressure_water_test_handover',
        acceptanceFragments: ['管线探查', '临时供排水', '试压通水', '防水封堵', '运营移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-21',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['粉尘控制', '负压排风', '喷雾降尘', '作业封闭', '连续监测'],
        handoverEvidenceType: 'renovation_air_dust_control_negative_pressure_monitoring_handover',
        acceptanceFragments: ['粉尘控制范围', '负压排风', '连续监测', '室内空气检测', '移交签认'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-22',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['装饰保护', '保留清单', '防撞防尘', '色差复测', '精保洁'],
        handoverEvidenceType: 'renovation_existing_finish_protection_restoration_owner_handover',
        acceptanceFragments: ['装饰保护范围', '防撞防尘', '色差复测', '精保洁', '业主移交'],
      },
      {
        templateId: 'china-renovation-retrofit-specialty',
        code: 'RNV-04-01-24',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['运营移交', '缺陷责任', '运维培训', '备品备件', '保修响应'],
        handoverEvidenceType: 'renovation_operations_handover_defect_liability_warranty_handover',
        acceptanceFragments: ['运营移交范围', '缺陷责任销项', '备品备件', '保修响应', '移交签认'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-12',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['市政接驳', '交通导改', '临时围挡', '管线试通', '道路恢复'],
        handoverEvidenceType: 'tod_municipal_connection_traffic_diversion_road_restoration_handover',
        acceptanceFragments: ['市政接驳', '临时围挡', '分段试通', '道路基层', '运营移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-16',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['防火卷帘', '联动接口', '消防信号', '下降逻辑', '手动控制'],
        handoverEvidenceType: 'tod_fire_shutter_linkage_interface_fire_acceptance_handover',
        acceptanceFragments: ['防火卷帘位置', '消防信号', '迫降逻辑', '控制边界', '运营移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-19',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['屋面广场', '防水节点', '排水坡向', '变形缝', '蓄水试验'],
        handoverEvidenceType: 'tod_podium_roof_plaza_waterproof_drainage_expansion_joint_handover',
        acceptanceFragments: ['上盖屋面广场', '排水口', '防水卷材', '蓄水淋水试验', '运营移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-17',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['客流导向', '导向层级', '吊挂标识', '可视距离', '运营走查'],
        handoverEvidenceType: 'tod_passenger_wayfinding_signage_visibility_operations_handover',
        acceptanceFragments: ['客流流线', '导向标识', '可视距离', '运营单位走查', '运营移交'],
      },
      {
        templateId: 'china-tod-upper-cover-specialty',
        code: 'TOD-04-01-24',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['开业保障', '问题销项', '客流演练', '运营值守', '应急响应'],
        handoverEvidenceType: 'tod_opening_support_punch_closeout_operations_release_handover',
        acceptanceFragments: ['开业保障范围', '问题销项清单', '客流演练', '应急响应', '开业放行'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps MiC factory, site-assembly, and heritage preservation packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['模块钢框架', '焊接工艺', '焊缝检测', '尺寸校正', '防腐底漆'],
        handoverEvidenceType: 'mic_steel_frame_welding_dimension_inspection_traceability_handover',
        acceptanceFragments: ['模块钢框架', '焊缝外观', '二维码追溯', '返修焊缝', '移交签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['围护集成', '墙地顶板', '气密节点', '隔声保温', '接口预留'],
        handoverEvidenceType: 'mic_envelope_wall_floor_ceiling_air_seal_factory_handover',
        acceptanceFragments: ['墙地顶围护', '防火气密', '平整度', '工厂围护样板', '现场拼装移交'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['外立面集成', '面板编号', '窗墙接口', '密封胶缝', '淋水测试'],
        handoverEvidenceType: 'mic_factory_facade_panel_window_seal_water_test_handover',
        acceptanceFragments: ['模块外立面', '面板安装', '密封胶缝', '工厂淋水', '现场移交'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-09',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防火防腐', '耐火等级', '防腐涂层', '防火封闭', '涂层厚度'],
        handoverEvidenceType: 'mic_fireproof_anticorrosion_coating_hidden_acceptance_handover',
        acceptanceFragments: ['模块防火防腐', '防火板', '涂层厚度', '隐蔽记录', '移交签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-15',
        expectedProcessCount: 11,
        firstEvidenceFragments: ['吊装定位', '轴线标高', '临时固定', '垂直度', '微调复测'],
        handoverEvidenceType: 'mic_site_lifting_positioning_alignment_temporary_fixing_handover',
        acceptanceFragments: ['模块吊装定位', '临时支撑', '模块垂直度', '千斤顶顶推', '移交签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-17',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['模块接缝', '防水密封', '淋水试验', '泛水节点', '密封胶'],
        handoverEvidenceType: 'mic_module_joint_waterproof_leakage_retest_handover',
        acceptanceFragments: ['防水接缝', '密封胶', '淋水', '渗漏点位', '移交签认'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-19',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['防火封堵', '模块缝隙', '耐火材料', '封堵厚度', '防烟气密'],
        handoverEvidenceType: 'mic_module_firestopping_gap_smoke_seal_hidden_handover',
        acceptanceFragments: ['防火封堵范围', '耐火材料', '封堵厚度', '隐蔽记录', '消防界面'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-21',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['模块追溯', '二维码台账', '出厂资料', '安装位置', '质量证明'],
        handoverEvidenceType: 'mic_module_qr_traceability_factory_site_dossier_handover',
        acceptanceFragments: ['二维码规则', '质量证明', '安装偏差', '竣工模型', '运营资产'],
      },
      {
        templateId: 'china-modular-mic-specialty',
        code: 'MIC-06-01-22',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['MiC竣工', '运营培训', '维保边界', '系统联调', '缺陷销项'],
        handoverEvidenceType: 'mic_completion_acceptance_operations_training_warranty_handover',
        acceptanceFragments: ['MiC竣工验收', '专项验收资料', '运营培训', '追溯台账', '接管移交'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-06',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['石灰砂浆', '传统材料', '试配记录', '兼容性试验', '样板修复'],
        handoverEvidenceType: 'heritage_lime_mortar_traditional_material_trial_mix_handover',
        acceptanceFragments: ['石灰砂浆', '材料批次', '兼容性', '样板修复', '移交签认'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-07',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['瓦作修缮', '旧瓦编号', '望板椽条', '防水垫层', '脊饰恢复'],
        handoverEvidenceType: 'heritage_roof_tile_repair_numbering_ridge_restoration_handover',
        acceptanceFragments: ['瓦作修缮', '旧瓦编号', '望板椽条', '传统做法', '文保移交'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-09',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['装饰线脚', '灰塑修复', '拓样记录', '分层修补', '色差复核'],
        handoverEvidenceType: 'heritage_plaster_molding_decoration_repair_expert_handover',
        acceptanceFragments: ['装饰线脚', '灰塑修复', '线脚轮廓', '修复影像', '开放展示'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-10',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['潮气盐害', '含盐检测', '脱盐处理', '通风干燥', '防潮隔离'],
        handoverEvidenceType: 'heritage_moisture_salt_damage_desalination_drying_handover',
        acceptanceFragments: ['潮气盐害', '含盐检测', '通风干燥', '含水率', '后续监测'],
      },
      {
        templateId: 'china-heritage-preservation-specialty',
        code: 'HRT-04-01-12',
        expectedProcessCount: 9,
        firstEvidenceFragments: ['开放动线', '参观安全', '临边防护', '消防疏散', '无障碍'],
        handoverEvidenceType: 'heritage_visitor_route_safety_protection_opening_handover',
        acceptanceFragments: ['开放参观动线', '临边防护', '应急联动', '安全培训', '运营接管'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps port, bridge, renewable, high-rise, and utility-tunnel specialty packs evidence-rich', () => {
    const expectations = [
      {
        templateId: 'china-port-terminal-specialty',
        code: 'PRT-03-01-01',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['港区道路', '铁路道路接口', '集卡路线', '开放测试', '信号联动'],
        handoverEvidenceType: 'port_harbor_road_rail_interface_opening_test_handover',
        acceptanceFragments: ['港区道路', '交通信号', '冲突场景', '开放测试', '运营移交'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['承台围堰', '降排水', '桩头处理', '大体积混凝土', '回填压实'],
        handoverEvidenceType: 'bridge_pile_cap_cofferdam_mass_concrete_backfill_handover',
        acceptanceFragments: ['承台围堰', '桩头破除', '大体积混凝土', '回填压实', '墩柱作业面'],
      },
      {
        templateId: 'china-bridge-specialty',
        code: 'BRG-04-01-04',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['盖梁支架', '预应力', '支座垫石', '管道压浆', '张拉伸长量'],
        handoverEvidenceType: 'bridge_cap_beam_support_prestress_bearing_pad_handover',
        acceptanceFragments: ['盖梁支架', '预应力管道', '张拉伸长量', '支座垫石', '架梁界面'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-11',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['光伏组串', 'EL影像', '热成像', 'IV曲线', '失配修正'],
        handoverEvidenceType: 'renewable_pv_string_performance_correction_owner_handover',
        acceptanceFragments: ['光伏组串', 'EL影像', 'IV曲线', '性能比', '生产基线'],
      },
      {
        templateId: 'china-renewable-energy-specialty',
        code: 'REN-04-01-12',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['风机电气', 'SCADA点表', '变桨测试', '偏航系统', '并网规范'],
        handoverEvidenceType: 'renewable_wind_turbine_electrical_scada_grid_code_handover',
        acceptanceFragments: ['风机电气', '偏航电机', 'SCADA点表', '并网无功', '运行移交'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-02-01-03',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['幕墙分区', 'BMU轨道', '防雷接口', '单元板块', '淋水气密'],
        handoverEvidenceType: 'ultra_high_rise_facade_bmu_lightning_interface_handover',
        acceptanceFragments: ['超高层幕墙', '单元板块', 'BMU轨道', '防雷等电位', '立面移交'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-08',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['母线槽', '电气竖井', '防雷接地', '绝缘耐压', '分区送电'],
        handoverEvidenceType: 'ultra_high_rise_busduct_shaft_lightning_grounding_handover',
        acceptanceFragments: ['母线槽', '电气竖井', '绝缘电阻', '防雷引下线', '运维界面'],
      },
      {
        templateId: 'china-ultra-high-rise-specialty',
        code: 'UHR-04-01-10',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['综合调试', '分阶段试运行', '避难层', '联动矩阵', '72小时试运行'],
        handoverEvidenceType: 'ultra_high_rise_integrated_commissioning_trial_operation_handover',
        acceptanceFragments: ['综合调试', '避难层', '高区水泵', '72小时试运行', '物业接管'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-02-01-02',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['管线入廊', '给水试压', '电缆桥架', '光缆熔接', '热力补偿器'],
        handoverEvidenceType: 'utility_tunnel_pipeline_entry_multisystem_handover',
        acceptanceFragments: ['管线入廊', '给水管线', '电力电缆', '光缆熔接', '检修净距'],
      },
      {
        templateId: 'china-utility-tunnel-specialty',
        code: 'UTN-03-01-06',
        expectedProcessCount: 8,
        firstEvidenceFragments: ['管廊回填', '压实度', '道路恢复', '沉降观测', '交通开放'],
        handoverEvidenceType: 'utility_tunnel_backfill_road_restoration_traffic_open_handover',
        acceptanceFragments: ['综合管廊回填', '压实度检测', '路面基层', '交通标线', '质保边界'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps document-commercial support packs tied to evidence-rich non-drawing handover metadata', () => {
    expect(processEvidenceProfileCodesByPrefix('DCS').size, 'document-commercial support evidence profile count')
      .toBeGreaterThanOrEqual(11)

    const expectations = [
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-01',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['施工方案', '技术交底', '隐蔽资料', '检验批', '材料复试'],
        handoverEvidenceType: 'document_commercial_construction_records_submittal_archive_handover',
        acceptanceFragments: ['施工方案', '隐蔽验收', '检验批', '材料合格证', '资料移交'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-02',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['工程联系单', '现场签证', '计量依据', '设计变更', '商务影响'],
        handoverEvidenceType: 'document_commercial_variation_site_instruction_register_handover',
        acceptanceFragments: ['工程联系单', '现场签证', '设计变更', '签证变更台账', '商务资料'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-03',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['品牌规格', '认质认价', '价格批复', '采购依据', '材料商务'],
        handoverEvidenceType: 'document_commercial_material_price_approval_handover',
        acceptanceFragments: ['材料设备', '认质认价', '价格批复', '采购依据', '材料商务资料'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-04',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['形象进度', '工程量核验', '进度款', '付款节点', '计量申报'],
        handoverEvidenceType: 'document_commercial_progress_measurement_payment_handover',
        acceptanceFragments: ['形象进度', '已完工程量', '进度款报审', '付款节点台账', '支付资料'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-05',
        expectedProcessCount: 6,
        firstEvidenceFragments: ['过程结算', '分段计量', '竣工结算', '变更签证', '索赔证据'],
        handoverEvidenceType: 'document_commercial_interim_final_account_settlement_handover',
        acceptanceFragments: ['过程结算', '竣工结算资料', '变更签证', '结算审核意见', '结算资料'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-06',
        expectedProcessCount: 6,
        firstEvidenceFragments: ['设备资产', '竣工图', '维保手册', '物业培训', '应急演练'],
        handoverEvidenceType: 'document_commercial_operations_asset_training_handover',
        acceptanceFragments: ['设备资产编码', '竣工图', '物业运维培训', '消防应急', '物业接管'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-07',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['合同范围', '计价口径', '付款节点', '风险事项', '分包条款'],
        handoverEvidenceType: 'document_commercial_contract_briefing_performance_risk_handover',
        acceptanceFragments: ['合同范围', '关键付款节点', '合同风险事项', '分包合同', '商务管理'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-08',
        expectedProcessCount: 6,
        firstEvidenceFragments: ['索赔事件', '停窝工', '关键路径', '价差资料', '价款调整'],
        handoverEvidenceType: 'document_commercial_claim_price_adjustment_closeout_handover',
        acceptanceFragments: ['索赔事件', '停窝工影响', '工期顺延', '价款调整', '索赔台账'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-09',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['城建档案', '组卷标准', '完整性自查', '预验收', '移交回执'],
        handoverEvidenceType: 'document_commercial_urban_archive_preacceptance_receipt_handover',
        acceptanceFragments: ['城建档案', '竣工资料完整性', '档案预验收', '档案馆移交', '档案移交'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-CLOSEOUT-ARCHIVE',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['竣工资料', '齐套性清单', '问题补正', '验收放行', '备案资料'],
        handoverEvidenceType: 'document_commercial_closeout_archive_acceptance_release_handover',
        acceptanceFragments: ['竣工资料齐套性', '竣工资料目录', '资料问题补正', '竣工验收放行', '备案资料移交'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-10',
        expectedProcessCount: 5,
        firstEvidenceFragments: ['质量保修书', '缺陷责任期', '质保金', '保修金', '维修费用'],
        handoverEvidenceType: 'document_commercial_warranty_retention_defect_liability_handover',
        acceptanceFragments: ['质量保修书', '保修金质保金', '缺陷维修记录', '返还申请', '结清资料'],
      },
      {
        templateId: 'china-document-commercial-support',
        code: 'DCS-01-01-11',
        expectedProcessCount: 6,
        firstEvidenceFragments: ['绿色施工', '节材节水', '文明工地', '影像证据', 'AAA信用'],
        handoverEvidenceType: 'document_commercial_green_civilized_credit_application_handover',
        acceptanceFragments: ['绿色施工', '节材节水', '文明工地', 'AAA信用', '评审结果'],
      },
    ]

    for (const expectation of expectations) {
      expectFirstProcessEvidenceKeywords(
        expectation.templateId,
        expectation.code,
        expectation.firstEvidenceFragments,
      )
      expectTerminalEvidenceMetadata(
        expectation.templateId,
        expectation.code,
        expectation,
      )
    }
  })

  it('keeps scheduling-critical specialty item works runtime evidence-closed for scheduling trust', () => {
    const targetTemplateIds = [
      'china-prefabricated-assembly',
      'china-steel-structure-specialty',
      'china-prefab-bathroom-specialty',
      'china-cecs-fire-system',
      'china-intelligent-building-system',
      'china-hvac-system',
      'china-plumbing-heating-system',
      'china-electrical-system',
      'china-waterproof-insulation',
      'china-building-fine-detail',
      'china-dangerous-subproject-control',
      'china-document-commercial-support',
      'china-building-site-management',
      'china-quality-responsibility-acceptance',
      'china-project-milestone-handover',
      'china-gb55032-2022-outdoor',
      'china-gb55032-2022-municipal',
      'china-jgj-tianjin-decoration',
    ]
    const weakRows: string[] = []

    for (const templateId of targetTemplateIds) {
      const template = DOMAIN_WBS_TEMPLATE_CATALOGS.find((item) => item.templateId === templateId)
      expect(template, `${templateId} should exist`).toBeTruthy()

      const itemWorks = flattenNodes(template!.divisions)
        .filter((node) => node.categoryType === 'item_work')
      expect(itemWorks.length, `${templateId} should expose item-work depth`).toBeGreaterThan(0)

      for (const itemWork of itemWorks) {
        const processChildren = (itemWork.children ?? [])
          .filter((child) => child.categoryType === 'process')
        const firstProcess = processChildren[0]
        const terminalProcess = processChildren.at(-1)
        const firstEvidenceKeywords = firstProcess?.metadata?.fieldEvidenceKeywords as string[] | undefined
        const terminalAcceptanceCheckpoints = terminalProcess?.metadata?.acceptanceCheckpoints as string[] | undefined
        const firstOk = Array.isArray(firstEvidenceKeywords) && firstEvidenceKeywords.length >= 3
        const terminalOk = typeof terminalProcess?.metadata?.handoverEvidenceType === 'string'
          && terminalProcess.metadata.handoverEvidenceType.length > 0
        const acceptanceOk = Array.isArray(terminalAcceptanceCheckpoints)
          && terminalAcceptanceCheckpoints.length === 7
        const processCountOk = processChildren.length >= 5

        if (!firstOk || !terminalOk || !acceptanceOk || !processCountOk) {
          weakRows.push([
            templateId,
            itemWork.stableCode,
            itemWork.name,
            `processCount=${processChildren.length}`,
            `firstOk=${firstOk}`,
            `terminalOk=${terminalOk}`,
            `acceptanceCount=${terminalAcceptanceCheckpoints?.length ?? 0}`,
          ].join(' | '))
        }
      }
    }

    expect(weakRows, weakRows.join('\n')).toEqual([])
  })

  it('keeps evidence-depth profiles out of the dependency rule surface', () => {
    const profileBlock = processEvidenceDepthProfileBlock()

    for (const forbiddenToken of [
      'predecessorStableCode',
      'successorStableCode',
      'additionalPredecessorStableCodes',
      'lagDays',
      'dependencyType',
      'createsDependency',
      '->',
    ]) {
      expect(profileBlock, `evidence-depth profiles should not carry ${forbiddenToken}`)
        .not.toContain(forbiddenToken)
    }
  })
})
