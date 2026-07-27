import { describe, expect, it } from 'vitest'

import {
  expandTitleWeakStandardWorkSearchText,
  extractTitleWeakSemanticText,
  getTitleWeakRecognizability,
  inferTitleWeakStandardWorkCodes,
  inferTitleWeakStandardWorkMatches,
  inferTitleWeakElementVariantSuggestion,
  inferTitleWeakMethodVariantSuggestions,
  inferTitleWeakScaleSignal,
  matchTitleWeakRecognitionRule,
  resolveTitleWeakElementVariant,
  sanitizeTitleWeakRecognitionText,
  supportsTitleWeakElementVariantExpansion,
  TITLE_WEAK_ELEMENT_VARIANT_RULES,
  TITLE_WEAK_METHOD_VARIANT_RULES,
  TITLE_WEAK_RECOGNITION_ALGORITHM_SEED_META,
  TITLE_WEAK_RECOGNITION_RULES,
  TITLE_WEAK_RECOGNITION_SEED_META,
  TITLE_WEAK_STANDARD_WORK_ALIAS_RULES,
} from '../seeds/v1472TitleWeakRecognitionSeed.js'
import { ALGORITHM_SEED_REGISTRY } from '../services/algorithmSeedRegistry.js'
import { STANDARD_WORK_DURATION_SEED } from '../seeds/standardWorkDurationSeed.js'

describe('v1.4.7.2 title weak recognition seed', () => {
  it('keeps title recognition as a search index instead of a duration source', () => {
    expect(TITLE_WEAK_RECOGNITION_SEED_META.seedRole).toBe('template_seed_search_index')
    expect(TITLE_WEAK_RECOGNITION_SEED_META.governanceBoundary).toContain('不直接输出 defaultDurationDays')
    expect(TITLE_WEAK_RECOGNITION_SEED_META.governanceBoundary).toContain('不作为 baseDays 来源')

    for (const rule of [...TITLE_WEAK_ELEMENT_VARIANT_RULES, ...TITLE_WEAK_METHOD_VARIANT_RULES, ...TITLE_WEAK_STANDARD_WORK_ALIAS_RULES]) {
      expect(rule.effectPolicy.canAffectBaseDays).toBe(false)
      expect(rule.effectPolicy.canGenerateRows).toBe(false)
    }
  })

  it('keeps every base standard duration code reachable from title weak recognition', () => {
    const baseDurationCodes = new Set(
      STANDARD_WORK_DURATION_SEED
        .map((item) => item.stableCode)
        .filter((code) => !code.startsWith('process_duration:')),
    )
    const weakRecognitionCodes = new Set(
      TITLE_WEAK_STANDARD_WORK_ALIAS_RULES.flatMap((rule) => rule.standardWorkCodes ?? []),
    )
    for (const rule of STANDARD_WORK_DURATION_SEED) {
      if (rule.stableCode.startsWith('process_duration:')) continue
      if (rule.standardWorkCodes.some((code) => weakRecognitionCodes.has(code))) {
        weakRecognitionCodes.add(rule.stableCode)
      }
    }

    const missingCodes = [...baseDurationCodes].filter((code) => !weakRecognitionCodes.has(code))

    expect(missingCodes).toEqual([])
  })

  it('indexes managed-frontier procurement and renovation controls without granting duration authority', () => {
    expect(inferTitleWeakStandardWorkCodes('\u8bbe\u5907\u9009\u578b\u3001\u6280\u672f\u89c4\u683c\u51bb\u7ed3\u4e0e\u91c7\u8d2d\u91ca\u653e')).toContain(
      'specialist_design_procurement_release',
    )
    expect(inferTitleWeakStandardWorkCodes('\u957f\u5468\u671f\u8bbe\u5907\u8ba2\u8d27\u6392\u4ea7\u3001\u5382\u5bb6FAT\u4e0e\u5206\u6279\u5230\u8d27')).toContain(
      'long_lead_equipment_manufacture_delivery',
    )
    expect(inferTitleWeakStandardWorkCodes('\u65e2\u6709\u5efa\u7b51\u62c6\u6539\u3001\u7ed3\u6784\u52a0\u56fa\u4e0e\u673a\u7535\u5207\u6362')).toContain(
      'expert_domain_renovation_retrofit',
    )

    expect(inferTitleWeakStandardWorkCodes('\u666e\u901a\u6750\u6599\u91c7\u8d2d\u8be2\u4ef7')).not.toContain('specialist_design_procurement_release')
    expect(inferTitleWeakStandardWorkCodes('\u4e00\u822c\u8bbe\u5907\u8fdb\u573a\u9a8c\u6536')).not.toContain('long_lead_equipment_manufacture_delivery')
    expect(inferTitleWeakStandardWorkCodes('\u73b0\u573a\u8d28\u91cf\u6574\u6539')).not.toContain('expert_domain_renovation_retrofit')

    for (const code of [
      'specialist_design_procurement_release',
      'long_lead_equipment_manufacture_delivery',
      'expert_domain_renovation_retrofit',
    ]) {
      const rule = TITLE_WEAK_STANDARD_WORK_ALIAS_RULES.find((candidate) => candidate.standardWorkCodes?.includes(code))
      expect(rule?.effectPolicy).toEqual(expect.objectContaining({
        canInferStandardWork: true,
        canAffectBaseDays: false,
        canGenerateRows: false,
      }))
    }
  })

  it('indexes managed-frontier domain duration assets from concrete field titles without granting duration authority', () => {
    const representativeTitles = [
      ['文保本体病害调查与传统工艺修缮', 'expert_domain_heritage_preservation'],
      ['自动化立体仓库与输送分拣系统安装调试', 'expert_domain_industrial_logistics_automation'],
      ['工艺设备与工艺管线安装验证', 'expert_domain_industrial_process_validation'],
      ['重型工艺设备吊装找正与二次灌浆', 'expert_domain_industrial_heavy_equipment'],
      ['铁路客站站房与站台雨棚施工', 'expert_domain_transportation_rail_station'],
      ['地铁换乘站轨行区接口与屏蔽门联调', 'expert_domain_transportation_metro_interchange'],
      ['汽车客运站发车位与车辆流线施工', 'expert_domain_transportation_bus_terminal'],
      ['体育馆活动看台与赛事照明施工', 'expert_domain_sports_indoor_arena'],
      ['剧院舞台机械与灯光音响安装', 'expert_domain_sports_theater'],
      ['会展中心展陈系统施工与展会转换调试', 'expert_domain_sports_exhibition'],
      ['基坑支护与降排水施工', 'expert_foundation_pit_support'],
      ['桩基础工程综合施工与检测', 'expert_pile_foundation'],
    ] as const

    for (const [title, stableCode] of representativeTitles) {
      expect(inferTitleWeakStandardWorkCodes(title), title).toContain(stableCode)
      const rule = TITLE_WEAK_STANDARD_WORK_ALIAS_RULES.find((candidate) => candidate.standardWorkCodes?.includes(stableCode))
      expect(rule?.effectPolicy).toEqual(expect.objectContaining({
        canInferStandardWork: true,
        canAffectBaseDays: false,
        canGenerateRows: false,
      }))
    }
  })

  it('registers title weak recognition as governed algorithm seed without duration authority', () => {
    const registryEntry = ALGORITHM_SEED_REGISTRY.find((entry) => entry.seedType === 'title_weak_recognition')

    expect(TITLE_WEAK_RECOGNITION_ALGORITHM_SEED_META.expectedCounts.records).toBe(TITLE_WEAK_RECOGNITION_RULES.length)
    expect(registryEntry?.records).toHaveLength(TITLE_WEAK_RECOGNITION_RULES.length)
    expect(registryEntry?.meta.generationPolicy).toContain('source_backed_auto_upgrade')
    expect(registryEntry?.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signalType: 'standard_work_hint',
        effectPolicy: expect.objectContaining({
          canInferStandardWork: true,
          canAffectBaseDays: false,
          canGenerateRows: false,
        }),
      }),
    ]))
  })

  it('expands common construction aliases for standard work matching', () => {
    const text = expandTitleWeakStandardWorkSearchText('1F 梁板砼浇筑')

    expect(text).toContain('1F 梁板混凝土浇筑')
    expect(text).toContain('混凝土')
    expect(text).toContain('浇筑')
  })

  it('cleans imported spreadsheet noise before matching titles', () => {
    expect(sanitizeTitleWeakRecognitionText('01.02.003 2026/05/01 完成 2#楼桥架安装 80%')).toBe('2#楼桥架安装')
    expect(extractTitleWeakSemanticText('XX广场-地下室-外墙防水')).toBe('外墙防水')
    expect(inferTitleWeakStandardWorkCodes('01.02.003 2026/05/01 完成 2#楼桥架安装 80%')[0]).toBe('electrical_distribution_equipment')
    expect(inferTitleWeakStandardWorkCodes('A-12【进行中】室外雨污水管网安装（50%）')[0]).toBe('outdoor_drainage_network')
  })

  it('defines title recognizability gates before keyword matching', () => {
    expect(getTitleWeakRecognizability('T-001')).toMatchObject({
      recognizable: false,
      reason: 'placeholder_or_code_only_title',
    })
    expect(getTitleWeakRecognizability('项目周会')).toMatchObject({
      recognizable: false,
      reason: 'non_construction_or_management_title',
    })
    expect(inferTitleWeakStandardWorkCodes('图纸会审')).toEqual([])
    expect(inferTitleWeakStandardWorkCodes('测试任务')).toEqual([])
    expect(inferTitleWeakStandardWorkCodes('材料封样')).toEqual([])
    expect(inferTitleWeakStandardWorkCodes('材料询价')).toEqual([])
    expect(inferTitleWeakStandardWorkCodes('合同评审')).toEqual([])
    expect(inferTitleWeakStandardWorkCodes('竣工资料归档')).toEqual([
      'completion_acceptance_archive',
      'special_acceptance',
    ])
  })

  it('returns quantified match scores and matched terms for weak title matches', () => {
    const match = inferTitleWeakStandardWorkMatches('1#楼B区3层混凝土浇筑')[0]

    expect(match).toMatchObject({
      standardWorkCode: 'cast_in_place_concrete',
      quality: expect.stringMatching(/exact_alias|keyword_phrase/),
    })
    expect(match.score).toBeGreaterThanOrEqual(0.6)
    expect(match.score).toBeLessThanOrEqual(1)
    expect(match.matchedTerms.length).toBeGreaterThan(0)
  })

  it('allows rule-level negative keywords and exclusion patterns to prevent false positives', () => {
    const concreteRule = TITLE_WEAK_STANDARD_WORK_ALIAS_RULES.find((rule) => rule.standardWorkCodes?.includes('cast_in_place_concrete'))

    expect(concreteRule).toBeTruthy()
    expect(matchTitleWeakRecognitionRule('钢筋混凝土楼板', {
      ...concreteRule!,
      negativeKeywords: ['钢筋混凝土楼板'],
    })).toMatchObject({
      matched: false,
      quality: 'excluded',
    })
    expect(matchTitleWeakRecognitionRule('钢筋混凝土楼板', {
      ...concreteRule!,
      exclusionPatterns: ['楼板$'],
    })).toMatchObject({
      matched: false,
      quality: 'excluded',
    })
  })

  it('keeps every standard work hint explicitly mapped to the duration seed', () => {
    const standardCodes = new Set(STANDARD_WORK_DURATION_SEED.flatMap((rule) => rule.standardWorkCodes))

    for (const rule of TITLE_WEAK_STANDARD_WORK_ALIAS_RULES) {
      expect(rule.standardWorkCodes?.length).toBeGreaterThan(0)
      for (const code of rule.standardWorkCodes ?? []) {
        expect(standardCodes.has(code)).toBe(true)
      }
    }

    expect(inferTitleWeakStandardWorkCodes('喷淋管网试压')).toEqual(['plumbing_fire_hydrant_sprinkler'])
    expect(inferTitleWeakStandardWorkCodes('地下室外墙防水卷材')).toEqual([
      'basement_waterproof_backfill',
      'exterior_wall_waterproof',
      'roof_membrane_waterproof',
      'roof_waterproof_insulation',
    ])
  })

  it('understands high-frequency field shorthand without changing duration authority', () => {
    expect(inferTitleWeakStandardWorkCodes('临建围挡和临电施工')).toEqual(['site_setup_temp_works'])
    expect(inferTitleWeakStandardWorkCodes('安全文明施工')).toEqual(['site_setup_temp_works'])
    expect(inferTitleWeakStandardWorkCodes('洗车槽施工')).toEqual(['site_setup_temp_works'])
    expect(inferTitleWeakStandardWorkCodes('安全通道搭设')).toEqual(['scaffold_temp_access'])
    expect(inferTitleWeakStandardWorkCodes('盘扣架搭设')).toEqual(['scaffold_temp_access'])
    expect(inferTitleWeakStandardWorkCodes('换填垫层施工')[0]).toBe('ground_replacement_cushion')
    expect(inferTitleWeakStandardWorkCodes('强夯地基施工')).toEqual(['dynamic_compaction_ground'])
    expect(inferTitleWeakStandardWorkCodes('分序分段注浆施工')).toEqual(['grouting_ground'])
    expect(inferTitleWeakStandardWorkCodes('真空预压施工')).toEqual(['preloading_ground'])
    expect(inferTitleWeakStandardWorkCodes('砂石桩复合地基')).toEqual(['granular_compaction_composite_ground'])
    expect(inferTitleWeakStandardWorkCodes('高压旋喷注浆施工')).toEqual(['jet_grouting_ground'])
    expect(inferTitleWeakStandardWorkCodes('水泥土搅拌桩施工')).toEqual(['cement_soil_mixing_pile_ground'])
    expect(inferTitleWeakStandardWorkCodes('CFG桩复合地基')).toEqual(['cfg_composite_ground'])
    expect(inferTitleWeakStandardWorkCodes('基坑支护降水')[0]).toBe('foundation_pit_retaining_support')
    expect(inferTitleWeakStandardWorkCodes('井点降水')).toEqual(['groundwater_control_dewatering'])
    expect(inferTitleWeakStandardWorkCodes('边坡喷锚支护')).toEqual(['slope_support_reinforcement'])
    expect(inferTitleWeakStandardWorkCodes('土钉墙施工')[0]).toBe('foundation_pit_soil_nail_wall')
    expect(inferTitleWeakStandardWorkCodes('钢支撑安装')[0]).toBe('foundation_pit_internal_strut')
    expect(inferTitleWeakStandardWorkCodes('预应力管桩施工')[0]).toBe('precast_concrete_pile_foundation')
    expect(inferTitleWeakStandardWorkCodes('灌注桩成孔')).toEqual(['bored_cast_in_place_pile_foundation'])
    expect(inferTitleWeakStandardWorkCodes('干作业成孔桩施工')).toEqual(['dry_bored_pile_foundation'])
    expect(inferTitleWeakStandardWorkCodes('长螺旋钻孔压灌桩')).toEqual(['long_spiral_drilled_pile_foundation'])
    expect(inferTitleWeakStandardWorkCodes('沉管灌注桩施工')).toEqual(['driven_cast_in_place_pile_foundation'])
    expect(inferTitleWeakStandardWorkCodes('钢管桩施工')).toEqual(['steel_pile_foundation'])
    expect(inferTitleWeakStandardWorkCodes('锚杆静压桩施工')).toEqual(['anchor_static_pressure_pile_foundation'])
    expect(inferTitleWeakStandardWorkCodes('岩石锚杆基础施工')).toEqual(['rock_anchor_foundation'])
    expect(inferTitleWeakStandardWorkCodes('基础垫层浇筑')).toEqual([
      'cushion_and_blinding',
      'cast_in_place_concrete',
    ])
    expect(inferTitleWeakStandardWorkCodes('筏板基础钢筋绑扎')).toEqual(expect.arrayContaining(['shallow_foundation_concrete_structure']))
    expect(inferTitleWeakStandardWorkCodes('沉井基础施工')).toEqual(['caisson_well_foundation'])
    expect(inferTitleWeakStandardWorkCodes('地下室结构施工')).toEqual(['basement_structure'])
    expect(inferTitleWeakStandardWorkCodes('坍落度检查')).toEqual(['cast_in_place_concrete'])
    expect(inferTitleWeakStandardWorkCodes('混凝土试块留置')).toEqual(['cast_in_place_concrete'])
    expect(inferTitleWeakStandardWorkCodes('同条件试块送检')).toEqual(['concrete_curing_wait'])
    expect(inferTitleWeakStandardWorkCodes('拆模报告复核')).toEqual(['concrete_curing_wait'])
    expect(inferTitleWeakStandardWorkCodes('梁筋绑扎')).toEqual(['cast_in_place_rebar'])
    expect(inferTitleWeakStandardWorkCodes('钢筋原材复试')).toEqual(['cast_in_place_rebar'])
    expect(inferTitleWeakStandardWorkCodes('二构砌筑')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('二结构砌墙')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('ALC板安装')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('轻质隔墙安装')).toEqual(['lightweight_partition_wall'])
    expect(inferTitleWeakStandardWorkCodes('拉结筋植筋')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('构造柱浇筑')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('止水反坎施工')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('抹灰找平')).toEqual(['plastering_wall_ceiling'])
    expect(inferTitleWeakStandardWorkCodes('刮腻子打磨')[0]).toBe('coating_paint_finish')
    expect(inferTitleWeakStandardWorkCodes('户内墙砖铺贴')[0]).toBe('tile_facing_finish')
    expect(inferTitleWeakStandardWorkCodes('瓦工贴砖')[0]).toBe('tile_facing_finish')
    expect(inferTitleWeakStandardWorkCodes('泥水工砌墙')).toEqual(['masonry_infill_wall'])
    expect(inferTitleWeakStandardWorkCodes('公区吊顶龙骨')[0]).toBe('ceiling_system_finish')
    expect(inferTitleWeakStandardWorkCodes('木工吊顶')[0]).toBe('ceiling_system_finish')
    expect(inferTitleWeakStandardWorkCodes('车库耐磨地坪')[0]).toBe('interior_public_finish')
    expect(inferTitleWeakStandardWorkCodes('油工乳胶漆施工')[0]).toBe('coating_paint_finish')
    expect(inferTitleWeakStandardWorkCodes('木工支模')).toEqual(['cast_in_place_formwork'])
    expect(inferTitleWeakStandardWorkCodes('网架安装')[0]).toBe('large_span_roof_structure')
    expect(inferTitleWeakStandardWorkCodes('木结构安装')).toEqual(['timber_structure'])
    expect(inferTitleWeakStandardWorkCodes('金属屋面板安装')).toEqual(['steel_envelope_roof_wall'])
    expect(inferTitleWeakStandardWorkCodes('外架搭设')).toEqual(['scaffold_temp_access'])
    expect(inferTitleWeakStandardWorkCodes('防火门安装')).toEqual(['door_window_railing'])
    expect(inferTitleWeakStandardWorkCodes('金属窗框安装')).toEqual(['door_window_railing'])
    expect(inferTitleWeakStandardWorkCodes('栏杆扶手安装')).toEqual(['interior_detail_fixture_railing'])
    expect(inferTitleWeakStandardWorkCodes('门窗收口修补')[0]).toBe('interior_unit_finish')
    expect(inferTitleWeakStandardWorkCodes('桥架接地跨接')).toEqual(['electrical_grounding_lightning', 'electrical_distribution_equipment'])
    expect(inferTitleWeakStandardWorkCodes('防雷接地施工')).toEqual(['electrical_grounding_lightning'])
    expect(inferTitleWeakStandardWorkCodes('等电位连接')).toEqual(['electrical_grounding_lightning'])
    expect(inferTitleWeakStandardWorkCodes('配电箱安装')).toEqual(['electrical_distribution_equipment'])
    expect(inferTitleWeakStandardWorkCodes('电缆敷设')).toEqual(['electrical_distribution_equipment'])
    expect(inferTitleWeakStandardWorkCodes('变压器安装')).toEqual(['electrical_power_distribution_room'])
    expect(inferTitleWeakStandardWorkCodes('水电开槽')).toEqual([
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
    ])
    expect(inferTitleWeakStandardWorkCodes('线盒预埋')[0]).toBe('electrical_lighting_terminal')
    expect(inferTitleWeakStandardWorkCodes('套管预留')[0]).toBe('mep_plumbing_fire_pipe')
    expect(inferTitleWeakStandardWorkCodes('给水立管安装')).toEqual(['plumbing_indoor_water_supply_pipe'])
    expect(inferTitleWeakStandardWorkCodes('生活水泵安装')).toEqual(['plumbing_indoor_water_supply_equipment'])
    expect(inferTitleWeakStandardWorkCodes('管道防腐施工')).toEqual(['plumbing_pipe_anticorrosion'])
    expect(inferTitleWeakStandardWorkCodes('管道保温施工')).toEqual(['plumbing_pipe_insulation'])
    expect(inferTitleWeakStandardWorkCodes('给水冲洗')).toEqual(['plumbing_pipe_flushing'])
    expect(inferTitleWeakStandardWorkCodes('给水消毒')).toEqual(['plumbing_water_disinfection'])
    expect(inferTitleWeakStandardWorkCodes('给水压力试验')).toEqual(['plumbing_water_test_commissioning'])
    expect(inferTitleWeakStandardWorkCodes('排水支管安装')).toEqual(['plumbing_indoor_drainage'])
    expect(inferTitleWeakStandardWorkCodes('喷头安装')).toEqual(['plumbing_fire_hydrant_sprinkler'])
    expect(inferTitleWeakStandardWorkCodes('阀组安装')).toEqual(['plumbing_fire_hydrant_sprinkler'])
    expect(inferTitleWeakStandardWorkCodes('风口安装')).toEqual(['hvac_supply_air_system'])
    expect(inferTitleWeakStandardWorkCodes('排风系统安装')).toEqual(['hvac_exhaust_air_system'])
    expect(inferTitleWeakStandardWorkCodes('风机盘管安装')).toEqual(['hvac_comfort_air'])
    expect(inferTitleWeakStandardWorkCodes('冷却塔安装')).toEqual(['hvac_cooling_water_system'])
    expect(inferTitleWeakStandardWorkCodes('地埋管施工')[0]).toBe('hvac_ground_source_heat_pump_exchange')
    expect(inferTitleWeakStandardWorkCodes('水源热泵系统')[0]).toBe('hvac_water_source_heat_pump_exchange')
    expect(inferTitleWeakStandardWorkCodes('冰蓄冷系统')[0]).toBe('hvac_thermal_storage_system')
    expect(inferTitleWeakStandardWorkCodes('太阳能集热器安装')[0]).toBe('hvac_solar_heating_air_system')
    expect(inferTitleWeakStandardWorkCodes('冷水机组安装')[0]).toBe('hvac_compression_chiller_equipment')
    expect(inferTitleWeakStandardWorkCodes('溴化锂机组安装')[0]).toBe('hvac_absorption_refrigeration_equipment')
    expect(inferTitleWeakStandardWorkCodes('室外给水管网安装')[0]).toBe('outdoor_water_supply_network')
    expect(inferTitleWeakStandardWorkCodes('检查井砌筑')[0]).toBe('outdoor_drainage_network')
    expect(inferTitleWeakStandardWorkCodes('化粪池安装')[0]).toBe('outdoor_drainage_network')
    expect(inferTitleWeakStandardWorkCodes('室外供热管网安装')[0]).toBe('outdoor_heating_network')
    expect(inferTitleWeakStandardWorkCodes('散热器安装')[0]).toBe('heating_radiator_system')
    expect(inferTitleWeakStandardWorkCodes('地暖盘管敷设')[0]).toBe('heating_hydronic_floor_system')
    expect(inferTitleWeakStandardWorkCodes('电热膜敷设')[0]).toBe('heating_electric_floor_system')
    expect(inferTitleWeakStandardWorkCodes('燃气辐射管安装')[0]).toBe('heating_gas_radiant_system')
    expect(inferTitleWeakStandardWorkCodes('消防水池施工')[0]).toBe('mep_plumbing_fire_pipe')
    expect(inferTitleWeakStandardWorkCodes('室外路灯安装')).toEqual(['electrical_outdoor_distribution'])
    expect(inferTitleWeakStandardWorkCodes('围墙施工')).toEqual(['outdoor_road_hardscape'])
    expect(inferTitleWeakStandardWorkCodes('弱电点位安装')).toEqual(['intelligent_structured_cabling'])
    expect(inferTitleWeakStandardWorkCodes('摄像机安装')).toEqual(['intelligent_security_technical_system'])
    expect(inferTitleWeakStandardWorkCodes('应急响应系统')).toEqual(['intelligent_emergency_response_system'])
    expect(inferTitleWeakStandardWorkCodes('无线AP安装')).toEqual(['intelligent_network_system', 'intelligent_structured_cabling'])
    expect(inferTitleWeakStandardWorkCodes('火灾报警设备安装')).toEqual(['intelligent_fire_alarm'])
    expect(inferTitleWeakStandardWorkCodes('运营商接入')).toEqual(['intelligent_information_access_system'])
    expect(inferTitleWeakStandardWorkCodes('移动通信室分')).toEqual(['intelligent_mobile_signal_coverage'])
    expect(inferTitleWeakStandardWorkCodes('卫星天线安装')).toEqual(['intelligent_satellite_communication_system'])
    expect(inferTitleWeakStandardWorkCodes('卫生间闭水试验')).toEqual(['interior_unit_finish'])
    expect(inferTitleWeakStandardWorkCodes('电梯导轨安装')).toEqual([
      'elevator_traction_guide_rail',
      'elevator_traction_installation',
      'elevator_installation',
      'elevator_hydraulic_installation',
      'escalator_moving_walk_installation',
    ])
    expect(inferTitleWeakStandardWorkCodes('液压系统压力试验')[0]).toBe('elevator_hydraulic_cylinder_pump_station')
    expect(inferTitleWeakStandardWorkCodes('液压电梯整机载荷试验')[0]).toBe('elevator_hydraulic_final_acceptance')
    expect(inferTitleWeakStandardWorkCodes('材料封样')).toEqual([])

    const expanded = expandTitleWeakStandardWorkSearchText('梁筋绑扎')

    expect(expanded).toContain('钢筋')
    expect(expanded).toContain('绑筋')
  })

  it('keeps ambiguous field terms as candidate standard works for backend resolution', () => {
    expect(inferTitleWeakStandardWorkCodes('保温板铺贴')).toEqual([
      'roof_insulation_thermal_layer',
      'exterior_insulation_finish',
      'roof_waterproof_insulation',
    ])
    expect(inferTitleWeakStandardWorkCodes('管道安装')).toEqual([
      'mep_plumbing_fire_pipe',
      'plumbing_indoor_drainage',
      'outdoor_utilities',
      'plumbing_indoor_water_supply_pipe',
      'plumbing_hot_water_system',
      'plumbing_fire_hydrant_sprinkler',
      'heating_indoor_system',
      'plumbing_special_water_system',
    ])
    expect(inferTitleWeakStandardWorkCodes('系统联调')).toEqual([
      'integrated_commissioning',
      'single_system_commissioning',
    ])
    expect(inferTitleWeakStandardWorkCodes('竣工验收移交')).toEqual([
      'completion_acceptance_archive',
      'special_acceptance',
    ])
  })

  it('orders ambiguous standard work candidates by field context', () => {
    expect(inferTitleWeakStandardWorkCodes('土方开挖外运')).toEqual([
      'earthwork_excavation_transport',
      'basement_waterproof_backfill',
    ])
    expect(inferTitleWeakStandardWorkCodes('肥槽回填')).toEqual([
      'basement_waterproof_backfill',
      'earthwork_excavation_transport',
    ])
    expect(inferTitleWeakStandardWorkCodes('PC构件吊装')).toEqual([
      'pc_component_hoisting',
      'pc_grouting_joint',
    ])
    expect(inferTitleWeakStandardWorkCodes('套筒灌浆')).toEqual([
      'pc_grouting_joint',
      'pc_component_hoisting',
    ])
    expect(inferTitleWeakStandardWorkCodes('钢结构安装')).toEqual([
      'steel_erection',
      'steel_fabrication_deepening',
      'steel_bolting_welding',
    ])
    expect(inferTitleWeakStandardWorkCodes('高强螺栓终拧')).toEqual([
      'steel_bolting_welding',
      'steel_fabrication_deepening',
      'steel_erection',
    ])
    expect(inferTitleWeakStandardWorkCodes('钢管混凝土柱安装')).toEqual(['steel_tube_concrete_structure'])
    expect(inferTitleWeakStandardWorkCodes('型钢混凝土安装')).toEqual(['steel_reinforced_concrete_structure'])
    expect(inferTitleWeakStandardWorkCodes('幕墙打胶')).toEqual([
      'curtain_wall_installation',
      'exterior_insulation_finish',
    ])
    expect(inferTitleWeakStandardWorkCodes('外立面真石漆')).toEqual([
      'exterior_insulation_finish',
      'curtain_wall_installation',
    ])
    expect(inferTitleWeakStandardWorkCodes('屋面保温板铺贴')).toEqual([
      'roof_insulation_thermal_layer',
      'roof_waterproof_insulation',
      'exterior_insulation_finish',
    ])
    expect(inferTitleWeakStandardWorkCodes('外墙保温板施工')).toEqual([
      'exterior_insulation_finish',
      'roof_insulation_thermal_layer',
      'roof_waterproof_insulation',
    ])
    expect(inferTitleWeakStandardWorkCodes('室内消防管道安装')).toEqual([
      'plumbing_fire_hydrant_sprinkler',
      'mep_plumbing_fire_pipe',
      'plumbing_indoor_water_supply_pipe',
      'plumbing_indoor_drainage',
      'outdoor_utilities',
      'plumbing_hot_water_system',
      'heating_indoor_system',
      'plumbing_special_water_system',
    ])
    expect(inferTitleWeakStandardWorkCodes('室外雨污水管网安装')).toEqual([
      'outdoor_drainage_network',
      'mep_plumbing_fire_pipe',
      'plumbing_indoor_drainage',
      'outdoor_utilities',
      'plumbing_indoor_water_supply_pipe',
      'plumbing_hot_water_system',
      'plumbing_fire_hydrant_sprinkler',
      'heating_indoor_system',
      'plumbing_special_water_system',
    ])
    expect(inferTitleWeakStandardWorkCodes('单机调试')).toEqual([
      'single_system_commissioning',
      'integrated_commissioning',
    ])
    expect(inferTitleWeakStandardWorkCodes('消防联动调试')).toEqual([
      'integrated_commissioning',
      'single_system_commissioning',
    ])
    expect(inferTitleWeakStandardWorkCodes('外墙淋水试验')).toEqual([
      'exterior_wall_waterproof',
      'basement_waterproof_backfill',
      'roof_membrane_waterproof',
      'roof_waterproof_insulation',
    ])
    expect(inferTitleWeakStandardWorkCodes('幕墙淋水试验')).toEqual([
      'curtain_wall_installation',
      'exterior_insulation_finish',
      'exterior_wall_waterproof',
      'roof_membrane_waterproof',
      'basement_waterproof_backfill',
      'roof_waterproof_insulation',
    ])
    expect(inferTitleWeakStandardWorkCodes('ϵͳװ')).toEqual(['intelligent_conference_system'])
    expect(inferTitleWeakStandardWorkCodes('消防专项验收')).toEqual([
      'special_acceptance',
      'completion_acceptance_archive',
    ])
  })

  it('keeps a golden set of casually written task names mapped to standard work candidates', () => {
    const goldenSamples: Array<{ title: string; firstCode: string }> = [
      { title: '1#楼B1底板钢筋绑扎', firstCode: 'cast_in_place_rebar' },
      { title: '3#楼屋面闭水试验', firstCode: 'roof_membrane_waterproof' },
      { title: '地下室外墙防水卷材施工', firstCode: 'basement_waterproof_backfill' },
      { title: '肥槽回填', firstCode: 'basement_waterproof_backfill' },
      { title: '土方开挖外运', firstCode: 'earthwork_excavation_transport' },
      { title: '安全文明施工', firstCode: 'site_setup_temp_works' },
      { title: '临边防护搭设', firstCode: 'scaffold_temp_access' },
      { title: '盘扣架搭设', firstCode: 'scaffold_temp_access' },
      { title: '基坑支护降水', firstCode: 'foundation_pit_retaining_support' },
      { title: '土钉墙施工', firstCode: 'foundation_pit_soil_nail_wall' },
      { title: '钢支撑安装', firstCode: 'foundation_pit_internal_strut' },
      { title: '灌注桩成孔', firstCode: 'bored_cast_in_place_pile_foundation' },
      { title: '基础垫层浇筑', firstCode: 'cushion_and_blinding' },
      { title: '地下室结构施工', firstCode: 'basement_structure' },
      { title: '坍落度检查', firstCode: 'cast_in_place_concrete' },
      { title: '混凝土试块留置', firstCode: 'cast_in_place_concrete' },
      { title: '同条件试块送检', firstCode: 'concrete_curing_wait' },
      { title: '拆模报告复核', firstCode: 'concrete_curing_wait' },
      { title: '钢筋送检', firstCode: 'cast_in_place_rebar' },
      { title: 'PC构件吊装', firstCode: 'pc_component_hoisting' },
      { title: '套筒灌浆', firstCode: 'pc_grouting_joint' },
      { title: '高强螺栓终拧', firstCode: 'steel_bolting_welding' },
      { title: '网架安装', firstCode: 'large_span_roof_structure' },
      { title: '木结构安装', firstCode: 'timber_structure' },
      { title: '金属屋面板安装', firstCode: 'steel_envelope_roof_wall' },
      { title: '幕墙打胶', firstCode: 'curtain_wall_installation' },
      { title: '外立面真石漆', firstCode: 'exterior_insulation_finish' },
      { title: '室外雨污水管网安装', firstCode: 'outdoor_drainage_network' },
      { title: '检查井砌筑', firstCode: 'outdoor_drainage_network' },
      { title: '化粪池安装', firstCode: 'outdoor_drainage_network' },
      { title: '消防水池施工', firstCode: 'mep_plumbing_fire_pipe' },
      { title: '道路路缘石安装', firstCode: 'outdoor_road_hardscape' },
      { title: '园路铺装', firstCode: 'outdoor_road_hardscape' },
      { title: '围墙施工', firstCode: 'outdoor_road_hardscape' },
      { title: '绿化苗木栽植', firstCode: 'landscape_greenery' },
      { title: '室内消防管道安装', firstCode: 'plumbing_fire_hydrant_sprinkler' },
      { title: '地下室消防套管预留', firstCode: 'mep_plumbing_fire_pipe' },
      { title: '给水立管安装', firstCode: 'plumbing_indoor_water_supply_pipe' },
      { title: '生活水泵安装', firstCode: 'plumbing_indoor_water_supply_equipment' },
      { title: '管道防腐施工', firstCode: 'plumbing_pipe_anticorrosion' },
      { title: '管道保温施工', firstCode: 'plumbing_pipe_insulation' },
      { title: '给水冲洗', firstCode: 'plumbing_pipe_flushing' },
      { title: '给水消毒', firstCode: 'plumbing_water_disinfection' },
      { title: '给水压力试验', firstCode: 'plumbing_water_test_commissioning' },
      { title: '排水支管安装', firstCode: 'plumbing_indoor_drainage' },
      { title: '3F支盒子', firstCode: 'electrical_lighting_terminal' },
      { title: '防雷接地施工', firstCode: 'electrical_grounding_lightning' },
      { title: '等电位连接', firstCode: 'electrical_grounding_lightning' },
      { title: '配电箱安装', firstCode: 'electrical_distribution_equipment' },
      { title: '电缆敷设', firstCode: 'electrical_distribution_equipment' },
      { title: '变压器安装', firstCode: 'electrical_power_distribution_room' },
      { title: '室外路灯安装', firstCode: 'electrical_outdoor_distribution' },
      { title: '水电压槽', firstCode: 'electrical_distribution_equipment' },
      { title: '线盒预埋', firstCode: 'electrical_lighting_terminal' },
      { title: '套管预留', firstCode: 'mep_plumbing_fire_pipe' },
      { title: '喷头安装', firstCode: 'plumbing_fire_hydrant_sprinkler' },
      { title: '阀组安装', firstCode: 'plumbing_fire_hydrant_sprinkler' },
      { title: '弱电信息点面板安装', firstCode: 'intelligent_structured_cabling' },
      { title: '摄像机安装', firstCode: 'intelligent_security_technical_system' },
      { title: '应急响应系统', firstCode: 'intelligent_emergency_response_system' },
      { title: '无线AP安装', firstCode: 'intelligent_network_system' },
      { title: '火灾报警设备安装', firstCode: 'intelligent_fire_alarm' },
      { title: '运营商接入', firstCode: 'intelligent_information_access_system' },
      { title: '移动通信室分', firstCode: 'intelligent_mobile_signal_coverage' },
      { title: '卫星天线安装', firstCode: 'intelligent_satellite_communication_system' },
      { title: '风口安装', firstCode: 'hvac_supply_air_system' },
      { title: '排风系统安装', firstCode: 'hvac_exhaust_air_system' },
      { title: '风机盘管安装', firstCode: 'hvac_comfort_air' },
      { title: '冷却塔安装', firstCode: 'hvac_cooling_water_system' },
      { title: '地埋管施工', firstCode: 'hvac_ground_source_heat_pump_exchange' },
      { title: '水源热泵系统', firstCode: 'hvac_water_source_heat_pump_exchange' },
      { title: '冰蓄冷系统', firstCode: 'hvac_thermal_storage_system' },
      { title: '太阳能集热器安装', firstCode: 'hvac_solar_heating_air_system' },
      { title: '冷水机组安装', firstCode: 'hvac_compression_chiller_equipment' },
      { title: '溴化锂机组安装', firstCode: 'hvac_absorption_refrigeration_equipment' },
      { title: '卫生间闭水试验', firstCode: 'interior_unit_finish' },
      { title: '市政接驳碰口', firstCode: 'outdoor_utilities' },
      { title: '悬挑架验收', firstCode: 'scaffold_temp_access' },
      { title: '吊顶封板', firstCode: 'ceiling_system_finish' },
      { title: '木工吊顶', firstCode: 'ceiling_system_finish' },
      { title: '乳胶漆施工', firstCode: 'coating_paint_finish' },
      { title: '油工乳胶漆施工', firstCode: 'coating_paint_finish' },
      { title: '瓦工贴砖', firstCode: 'tile_facing_finish' },
      { title: '泥水工砌墙', firstCode: 'masonry_infill_wall' },
      { title: 'ALC板安装', firstCode: 'masonry_infill_wall' },
      { title: '拉结筋植筋', firstCode: 'masonry_infill_wall' },
      { title: '构造柱浇筑', firstCode: 'masonry_infill_wall' },
      { title: '止水反坎施工', firstCode: 'masonry_infill_wall' },
      { title: '木工支模', firstCode: 'cast_in_place_formwork' },
      { title: '自流平施工', firstCode: 'floor_finish_system' },
      { title: '地下室SBS卷材防水', firstCode: 'basement_waterproof_backfill' },
      { title: '屋面TPO卷材施工', firstCode: 'roof_membrane_waterproof' },
      { title: '户内入户门安装', firstCode: 'door_window_railing' },
      { title: '阳台栏杆安装', firstCode: 'interior_detail_fixture_railing' },
      { title: '户内门窗收口修补', firstCode: 'interior_unit_finish' },
      { title: '公区电梯厅收口', firstCode: 'interior_public_finish' },
      { title: '消防联动调试', firstCode: 'integrated_commissioning' },
      { title: '单机试运转', firstCode: 'single_system_commissioning' },
      { title: '竣工验收移交', firstCode: 'completion_acceptance_archive' },
      { title: '甩项移交', firstCode: 'completion_acceptance_archive' },
      { title: '弱电点位安装', firstCode: 'intelligent_structured_cabling' },
      { title: '电梯导轨安装', firstCode: 'elevator_traction_guide_rail' },
    ]

    for (const sample of goldenSamples) {
      expect(inferTitleWeakStandardWorkCodes(sample.title)[0]).toBe(sample.firstCode)
    }
  })

  it('suggests element variants from row names only as low-confidence hints', () => {
    const suggestion = inferTitleWeakElementVariantSuggestion('2F 梁钢筋绑扎')

    expect(suggestion).toEqual({
      code: 'beam',
      label: '梁',
      source: 'row_name_suggestion',
      confidence: 'low',
    })
  })

  it('does not suggest an element variant when the row name lacks process context', () => {
    expect(supportsTitleWeakElementVariantExpansion('2F 梁')).toBe(false)
    expect(inferTitleWeakElementVariantSuggestion('2F 梁')).toBeNull()
  })

  it('keeps explicit engineering features separate from row-name suggestions', () => {
    expect(resolveTitleWeakElementVariant('beam')).toEqual({
      code: 'beam',
      label: '梁',
      source: 'explicit_engineering_feature',
      confidence: 'high',
    })
  })

  it('suggests method variants from row names only as low-confidence hints', () => {
    expect(inferTitleWeakMethodVariantSuggestions('3F 铝模首拼验收')[0]).toMatchObject({
      code: 'aluminum_form_early_strip',
      label: '铝模早拆体系',
      source: 'row_name_suggestion',
      confidence: 'low',
    })
    expect(inferTitleWeakMethodVariantSuggestions('木工支模')[0]).toMatchObject({
      code: 'wood_form',
      source: 'row_name_suggestion',
    })
    expect(inferTitleWeakMethodVariantSuggestions('核心筒爬模提升')[0]).toMatchObject({
      code: 'climbing_form',
      source: 'row_name_suggestion',
    })
    expect(inferTitleWeakMethodVariantSuggestions('筏板大体积混凝土测温')[0]).toMatchObject({
      code: 'mass_concrete',
      source: 'row_name_suggestion',
    })
  })

  it('caps title scale hints as low-confidence fallback signals', () => {
    expect(inferTitleWeakScaleSignal('1#楼-3#楼 外墙抹灰')).toMatchObject({
      factor: 1.15,
      source: 'title',
      confidence: 'low',
      reason: '标题显示覆盖约 3 栋楼',
    })
    expect(inferTitleWeakScaleSignal('1F-10F 风管安装')).toMatchObject({
      factor: 1.3,
      source: 'title',
      confidence: 'low',
      reason: '标题显示覆盖约 10 层',
    })
  })
})
