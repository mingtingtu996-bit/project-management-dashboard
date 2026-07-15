import { type WorkEnvironment } from './workEnvironment.js'

export type V1474SeedEvidenceSource = {
  sourceKey: string
  title: string
  url: string
  accessedAt: string
}

export type V1474ProcessSeasonalSignal =
  | 'rainy_season'
  | 'winter_low_temp'
  | 'summer_heat'
  | 'wind_warning'
  | 'persistent_humidity'
  | 'snow_ice'
  | 'dust_storm'
  | 'thunderstorm'
export type V1474ProcessSeasonalImpactBand =
  | 'rain_blocks_work'
  | 'rain_partial_work'
  | 'winter_wet_trade'
  | 'heat_macro_only'
  | 'heat_process_sensitive'
  | 'wind_warning'
  | 'high_wind'
  | 'humidity_dry_window'
  | 'snow_ice_block'
  | 'dust_storm_partial'
  | 'thunderstorm_safety'

export type V1474ProcessSeasonalSensitivity = {
  stableCode: string
  workEnvironment: WorkEnvironment
  keywords: string[]
  standardWorkCodes: string[]
  standardCatalogCodePrefixes?: string[]
  applicableMethodCodes: string[]
  applicableGranularity: 'task' | 'process' | 'both'
  sensitiveMonths: number[]
  requiredClimateSignals: V1474ProcessSeasonalSignal[]
  impactBand: V1474ProcessSeasonalImpactBand
  productivityMultiplier: number
  sensitivityReason: V1474ProcessSeasonalSignal
  weatherWindowRecoveryPolicy?: {
    dryWindowRequiredHours?: number
    maxRelativeHumidityPercent?: number
    appliesToImpactBands: V1474ProcessSeasonalImpactBand[]
    actionPolicy: 'candidate_gate'
    note: string
  }
  schedulingAdvice?: {
    avoidMonths?: number[]
    preferredMonths?: number[]
    strategy: 'avoid_peak_rainy_season' | 'avoid_extreme_heat_window' | 'avoid_wind_window'
    note: string
  }
  indoorDryWorkExclusion?: {
    positiveCodes: string[]
    note: string
  }
  sourceStandard: 'national_standard' | 'industry_standard' | 'enterprise_method'
  sourceVersion: string
  sourceClauseRef: string
  evidenceSourceKeys: string[]
  triggerPolicy: string
  calibrationPolicy: string
  webVerified: true
  reviewNeeded: false
  confidence: 'high' | 'medium' | 'low'
}

export type V1474ProcessSeasonalEligibilityContext = {
  month: number
  monthlyClimateSignal?: string | null
  rainySeasonMonths?: number[] | null
  floodSeasonMonths?: number[] | null
  highTempMonths?: number[] | null
  coldWeatherMonths?: number[] | null
}

export const V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_VERSION = 'v1.4.7.5-climate-gated-process-packages-20260518'

export const V1474_PROCESS_SEASONAL_SENSITIVITY_EVIDENCE_SOURCES: V1474SeedEvidenceSource[] = [
  {
    sourceKey: 'JGJT104_2011',
    title: 'JGJ/T 104-2011 Specification for winter construction of building engineering',
    url: 'https://www.jianbiaoku.com/webarbs/book/111/1679406.shtml',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50207_2012',
    title: 'GB 50207-2012 Code for acceptance of construction quality of roof engineering',
    url: 'https://oa.zlglpt.com/book/book_view.aspx?id=259',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50208_2011',
    title: 'GB 50208-2011 Code for acceptance of construction quality of underground waterproofing',
    url: 'https://zlglpt.com/book/book_view.aspx?id=371',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50210_2018',
    title: 'GB 50210-2018 Standard for construction quality acceptance of building decoration',
    url: 'https://www.jianbiaoku.com/webarbs/book/202/3735415.shtml',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB55032_2022',
    title: 'GB 55032-2022 General code for construction quality control of building and municipal engineering',
    url: 'https://zjj.sm.gov.cn/xxgk/fgwj/jsbz/202209/t20220909_1827392.htm',
    accessedAt: '2026-05-16',
  },
  {
    sourceKey: 'GB50242_2002',
    title: 'GB 50242-2002 Code for acceptance of construction quality of water supply drainage and heating works',
    url: 'https://www.jianbiaoku.com/webarbs/book/106/1676775.shtml',
    accessedAt: '2026-05-16',
  },
]

const BASE_TRIGGER_POLICY = 'requires project_climate_profiles season window or seasonal_productivity climate signal; weather facts override static seed'
const BASE_CALIBRATION_POLICY = 'candidate_only_from duration_experience_samples grouped by standard_work_code + climate_signal + month; no silent overwrite'

function rainRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'outdoor',
    sensitivityReason: 'rainy_season',
    requiredClimateSignals: ['rainy_season'],
    triggerPolicy: BASE_TRIGGER_POLICY,
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'medium',
  }
}

function winterRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'mixed',
    sensitivityReason: 'winter_low_temp',
    requiredClimateSignals: ['winter_low_temp'],
    triggerPolicy: BASE_TRIGGER_POLICY,
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'medium',
  }
}

function heatRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'outdoor',
    sensitivityReason: 'summer_heat',
    requiredClimateSignals: ['summer_heat'],
    triggerPolicy: 'requires high-temperature climate window or weather fact; ordinary summer macro work-hour capacity remains owned by seasonal_productivity',
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'medium',
  }
}

function windRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'outdoor',
    sensitivityReason: 'wind_warning',
    requiredClimateSignals: ['wind_warning'],
    triggerPolicy: 'requires wind warning weather fact or coastal/typhoon wind window; applies only to lifting, scaffolding and facade access packages',
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'medium',
  }
}

function humidityRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'indoor',
    sensitivityReason: 'persistent_humidity',
    requiredClimateSignals: ['persistent_humidity'],
    triggerPolicy: 'requires persistent humidity or return-south weather fact; applies only to drying-window-sensitive wet finish packages',
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'medium',
  }
}

function snowRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'outdoor',
    sensitivityReason: 'snow_ice',
    requiredClimateSignals: ['snow_ice', 'winter_low_temp'],
    triggerPolicy: 'requires snow/ice weather fact or winter low-temperature window; applies to exposed roof, road, high-place and outdoor wet-trade packages',
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'low',
  }
}

function dustRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'outdoor',
    sensitivityReason: 'dust_storm',
    requiredClimateSignals: ['dust_storm', 'wind_warning'],
    triggerPolicy: 'requires dust storm or sandstorm weather fact; intended for northwest arid and wind-sand climate tags',
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'low',
  }
}

function thunderstormRule(input: Omit<V1474ProcessSeasonalSensitivity, 'workEnvironment' | 'sensitivityReason' | 'requiredClimateSignals' | 'triggerPolicy' | 'calibrationPolicy' | 'webVerified' | 'reviewNeeded' | 'confidence'> & { confidence?: V1474ProcessSeasonalSensitivity['confidence'], workEnvironment?: WorkEnvironment }): V1474ProcessSeasonalSensitivity {
  return {
    ...input,
    workEnvironment: input.workEnvironment ?? 'outdoor',
    sensitivityReason: 'thunderstorm',
    requiredClimateSignals: ['thunderstorm'],
    triggerPolicy: 'requires thunderstorm or lightning weather fact; safety signal only and does not create a daily productivity multiplier by itself',
    calibrationPolicy: BASE_CALIBRATION_POLICY,
    webVerified: true,
    reviewNeeded: false,
    confidence: input.confidence ?? 'low',
  }
}

export const V1474_PROCESS_SEASONAL_SENSITIVITY_SEED: V1474ProcessSeasonalSensitivity[] = [
  rainRule({
    stableCode: 'earthwork_excavation_backfill_rainy_season',
    keywords: ['earthwork', 'soil excavation', 'pit excavation', 'backfill', '土方', '开挖', '回填', '基坑土方'],
    standardWorkCodes: ['earthwork_excavation_transport', 'earthwork-backfill', 'basement_waterproof_backfill', 'foundation_pit_retaining_support'],
    applicableMethodCodes: ['open_cut', 'pit_excavation', 'earthwork_backfill'],
    applicableGranularity: 'both',
    sensitiveMonths: [5, 6, 7, 8, 9],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.92,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB55032-2022 quality-control principle + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Rainy season mainly affects earthwork excavation, haulage, backfill and workface organization; coefficient is conservative and requires project calibration.',
    evidenceSourceKeys: ['GB50208_2011'],
  }),
  rainRule({
    stableCode: 'foundation_pit_support_dewatering_rainy_season',
    keywords: ['foundation pit', 'pit support', 'dewatering', 'slope support', '基坑支护', '降排水', '边坡支护'],
    standardWorkCodes: ['foundation_pit_retaining_support', 'groundwater_control_dewatering', 'slope_support_reinforcement', 'deep_foundation_support_dewatering'],
    applicableMethodCodes: ['pit_support', 'wellpoint_dewatering', 'slope_support'],
    applicableGranularity: 'both',
    sensitiveMonths: [5, 6, 7, 8, 9],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.9,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB55032-2022 quality-control principle + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Rainy-season pit support and dewatering are more sensitive because drainage, slope stability and access organization become active constraints.',
    evidenceSourceKeys: ['GB50208_2011'],
  }),
  rainRule({
    stableCode: 'pile_foundation_rainy_season_light',
    keywords: ['pile', 'bored pile', 'cast in place pile', '桩基', '灌注桩', '钻孔桩'],
    standardWorkCodes: ['bored_cast_in_place_pile_foundation', 'long_spiral_drilled_pile_foundation', 'driven_cast_in_place_pile_foundation', 'pile_foundation'],
    applicableMethodCodes: ['bored_pile', 'long_spiral_pile', 'cast_in_place_pile'],
    applicableGranularity: 'both',
    sensitiveMonths: [5, 6, 7, 8, 9],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.95,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'field-calibrated rainy-season fallback',
    sourceClauseRef: 'Pile work is not uniformly blocked by rain, but rainy-season access, spoil transport, mud handling and inspection windows may slightly reduce productivity.',
    evidenceSourceKeys: ['GB55032_2022'],
    confidence: 'low',
  }),
  rainRule({
    stableCode: 'basement_waterproof_rain_window',
    keywords: ['basement waterproof', 'underground waterproof', 'exterior wall waterproof', '地下防水', '地下室防水', '外墙防水'],
    standardWorkCodes: ['basement_waterproof_backfill', 'exterior_wall_waterproof', 'waterproof-membrane', 'waterproof-coating'],
    applicableMethodCodes: ['membrane_waterproof', 'coating_waterproof', 'external_wall_waterproof'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'rain_blocks_work',
    productivityMultiplier: 0.9,
    weatherWindowRecoveryPolicy: {
      dryWindowRequiredHours: 48,
      maxRelativeHumidityPercent: 85,
      appliesToImpactBands: ['rain_blocks_work'],
      actionPolicy: 'candidate_gate',
      note: 'Underground and exterior waterproofing should be released only after a dry substrate window is confirmed.',
    },
    schedulingAdvice: {
      avoidMonths: [6, 7],
      preferredMonths: [4, 5, 8, 9],
      strategy: 'avoid_peak_rainy_season',
      note: 'When schedule float exists, shift exposed waterproofing away from peak plum-rain months instead of only applying passive productivity deduction.',
    },
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50208-2011 + field-calibrated rainy-window fallback',
    sourceClauseRef: 'Underground/exterior waterproofing depends on base condition and qualified weather windows; rain-window impact is stronger than ordinary site organization.',
    evidenceSourceKeys: ['GB50208_2011'],
  }),
  rainRule({
    stableCode: 'roof_membrane_waterproof_rain_window',
    keywords: ['roof waterproof', 'roof membrane', 'roof coating', '屋面防水', '屋面卷材', '涂膜防水'],
    standardWorkCodes: ['roof_waterproof_insulation', 'roof_membrane_waterproof', 'roof_detail_nodes', 'roof-waterproof', 'waterproof-membrane', 'waterproof-coating'],
    applicableMethodCodes: ['sbs_membrane', 'self_adhesive_membrane', 'coating_waterproof', 'tpo_pvc_membrane'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'rain_blocks_work',
    productivityMultiplier: 0.88,
    weatherWindowRecoveryPolicy: {
      dryWindowRequiredHours: 48,
      maxRelativeHumidityPercent: 85,
      appliesToImpactBands: ['rain_blocks_work'],
      actionPolicy: 'candidate_gate',
      note: 'Roof membrane/coating work needs a confirmed dry base window after rain before plan release.',
    },
    schedulingAdvice: {
      avoidMonths: [6, 7],
      preferredMonths: [4, 5, 8, 9],
      strategy: 'avoid_peak_rainy_season',
      note: 'Roof waterproofing should be suggested for early spring-rain windows or post-plum-rain recovery windows when baseline float allows.',
    },
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50207-2012 + field-calibrated rainy-window fallback',
    sourceClauseRef: 'Roof waterproofing is one of the strongest rain-window-sensitive packages; small rain can stop exposed membrane/coating operations.',
    evidenceSourceKeys: ['GB50207_2012'],
  }),
  rainRule({
    stableCode: 'exterior_coating_plaster_rain_window',
    keywords: ['exterior plaster', 'exterior coating', 'external wall coating', '外墙抹灰', '外墙涂料', '外立面涂料'],
    standardWorkCodes: ['exterior_insulation_finish', 'plastering_wall_ceiling', 'coating_paint_finish', 'exterior-coating', 'exterior-plaster'],
    applicableMethodCodes: ['exterior_wet_trade', 'exterior_coating', 'external_wall_finish'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'rain_blocks_work',
    productivityMultiplier: 0.88,
    weatherWindowRecoveryPolicy: {
      dryWindowRequiredHours: 48,
      maxRelativeHumidityPercent: 80,
      appliesToImpactBands: ['rain_blocks_work'],
      actionPolicy: 'candidate_gate',
      note: 'Exterior plaster/coating should require a dry surface and curing window after rain.',
    },
    schedulingAdvice: {
      avoidMonths: [6, 7],
      preferredMonths: [4, 5, 8, 9],
      strategy: 'avoid_peak_rainy_season',
      note: 'Exterior wet finishes should be offered as rain-avoidance revision candidates instead of silently stacking month and weather deductions.',
    },
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018 + field-calibrated rainy-window fallback',
    sourceClauseRef: 'Exterior plaster/coating is strongly rain-window-sensitive; this rule does not apply to indoor dry decoration.',
    evidenceSourceKeys: ['GB50210_2018'],
  }),
  rainRule({
    stableCode: 'curtain_wall_facade_rainy_season',
    keywords: ['curtain wall', 'facade', 'sealant', '幕墙', '外立面', '密封胶'],
    standardWorkCodes: ['curtain_wall_installation', 'facade-exterior', 'curtain-wall'],
    applicableMethodCodes: ['curtain_wall_install', 'facade_access', 'sealant_work'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.92,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018 + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Facade/curtain-wall work is rain-sensitive for exposed access, sealing and water-test windows, but not every sub-process is fully blocked.',
    evidenceSourceKeys: ['GB50210_2018'],
  }),
  rainRule({
    stableCode: 'outdoor_drainage_network_rainy_season_light',
    keywords: ['outdoor drainage', 'stormwater', 'sewage pipe', 'trench pipeline', '室外排水', '雨污水管', '沟槽管道'],
    standardWorkCodes: ['outdoor_drainage_network', 'trench-pipeline', 'site-drainage'],
    applicableMethodCodes: ['trench_excavation', 'pipe_laying', 'water_test'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.94,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50242-2002 + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Outdoor drainage trench work is rainy-season sensitive, but pipe laying and tests can often continue under managed light rain; coefficient is lighter than waterproof/facade.',
    evidenceSourceKeys: ['GB50242_2002'],
  }),
  rainRule({
    stableCode: 'outdoor_water_heating_network_rainy_season_light',
    keywords: ['outdoor water supply', 'outdoor heating', 'utility pipe', '室外给水', '室外供热', '室外管网'],
    standardWorkCodes: ['outdoor_water_supply_network', 'outdoor_heating_network', 'outdoor_utilities', 'outdoor-pipe-network'],
    applicableMethodCodes: ['pipe_laying', 'pressure_test', 'utility_trench'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.95,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50242-2002 + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Outdoor utility networks are affected by trench, traffic and backfill conditions, while many installation/test steps remain workable in light rain.',
    evidenceSourceKeys: ['GB50242_2002'],
  }),
  rainRule({
    stableCode: 'outdoor_road_hardscape_rainy_season',
    keywords: ['outdoor road', 'hardscape', 'pavement', '室外道路', '园区道路', '硬化'],
    standardWorkCodes: ['outdoor_road_hardscape'],
    applicableMethodCodes: ['road_base', 'pavement', 'site_hardscape'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.93,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'field-calibrated rainy-season fallback',
    sourceClauseRef: 'Outdoor road/hardscape depends on subgrade, base course and paving weather windows; impact is kept conservative until enterprise data calibrates it.',
    evidenceSourceKeys: ['GB55032_2022'],
    confidence: 'low',
  }),
  rainRule({
    stableCode: 'foundation_pit_bottom_acceptance_rain_window',
    keywords: ['pit bottom acceptance', 'foundation trench acceptance', 'subgrade acceptance', 'bearing stratum', 'foundation pit bottom', 'trench bottom'],
    standardWorkCodes: ['foundation_pit_bottom_acceptance', 'trench_acceptance', 'bearing_stratum_acceptance', 'earthwork_excavation_transport'],
    standardCatalogCodePrefixes: ['01-05'],
    applicableMethodCodes: ['pit_excavation', 'bearing_stratum_acceptance', 'trench_acceptance'],
    applicableGranularity: 'both',
    sensitiveMonths: [5, 6, 7, 8, 9],
    impactBand: 'rain_blocks_work',
    productivityMultiplier: 0.88,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'GB55032-2022 quality-control principle + field-calibrated rainy-window fallback',
    sourceClauseRef: 'Foundation pit bottom and trench acceptance rely on exposed bearing layer and safe workface conditions; rain can directly invalidate the acceptance window.',
    evidenceSourceKeys: ['GB55032_2022'],
  }),
  rainRule({
    stableCode: 'exterior_insulation_rain_window',
    keywords: ['exterior insulation', 'external insulation', 'facade insulation', 'insulation board', 'external wall insulation'],
    standardWorkCodes: ['exterior_insulation_finish', 'external_wall_insulation', 'facade-insulation'],
    standardCatalogCodePrefixes: ['03-08', '03-11'],
    applicableMethodCodes: ['exterior_insulation', 'external_wall_finish', 'adhesive_mortar'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'rain_blocks_work',
    productivityMultiplier: 0.9,
    weatherWindowRecoveryPolicy: {
      dryWindowRequiredHours: 24,
      maxRelativeHumidityPercent: 85,
      appliesToImpactBands: ['rain_blocks_work'],
      actionPolicy: 'candidate_gate',
      note: 'Exterior insulation bonding and surface layers should be checked against a dry workface window.',
    },
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018 + field-calibrated rainy-window fallback',
    sourceClauseRef: 'Exterior insulation board, adhesive mortar and surface layer work are exposed and rain-window sensitive; indoor insulation is excluded unless matched explicitly.',
    evidenceSourceKeys: ['GB50210_2018'],
  }),
  rainRule({
    stableCode: 'exterior_tile_stone_facade_rain_window',
    keywords: ['exterior tile', 'stone facade', 'stone curtain', 'facade stone', 'external wall tile'],
    standardWorkCodes: ['tile_facing_finish', 'wall_panel_finish', 'curtain_wall_installation', 'exterior_facade_finish'],
    standardCatalogCodePrefixes: ['03-07', '03-09'],
    applicableMethodCodes: ['exterior_tile', 'stone_facade', 'wet_cladding', 'dry_hanging_stone'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.91,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50210-2018 + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Exterior tile and stone facade work is affected by rain for access, bonding, sealing and inspection windows; dry-hanging work is partial rather than fully blocked.',
    evidenceSourceKeys: ['GB50210_2018'],
  }),
  rainRule({
    stableCode: 'roof_screed_insulation_rainy_season',
    keywords: ['roof screed', 'roof leveling', 'roof insulation', 'roof slope layer', 'roof protection layer'],
    standardWorkCodes: ['roof_insulation_thermal_layer', 'roof_waterproof_insulation', 'roof_leveling_layer', 'roof_screed'],
    standardCatalogCodePrefixes: ['04-01', '04-02'],
    applicableMethodCodes: ['roof_screed', 'roof_insulation', 'slope_layer'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.92,
    sourceStandard: 'national_standard',
    sourceVersion: 'GB50207-2012 + field-calibrated rainy-season fallback',
    sourceClauseRef: 'Roof leveling, slope and insulation layers are exposed workface operations; rain impact is lighter than membrane/coating but still material to sequencing.',
    evidenceSourceKeys: ['GB50207_2012'],
  }),
  rainRule({
    stableCode: 'outdoor_electrical_weak_current_trench_rainy_season_light',
    keywords: ['outdoor electrical', 'outdoor cable trench', 'weak current outdoor', 'outdoor duct bank', 'outdoor cable'],
    standardWorkCodes: ['electrical_outdoor_distribution', 'outdoor_utilities', 'outdoor_cable_trench', 'outdoor_weak_current_pipeline'],
    standardCatalogCodePrefixes: ['07-09', '08-19'],
    applicableMethodCodes: ['cable_trench', 'duct_bank', 'outdoor_electrical_pipeline'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.95,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'field-calibrated rainy-season fallback',
    sourceClauseRef: 'Outdoor electrical and weak-current trench or duct-bank works are trench/access sensitive, but cable pulling or indoor termination is excluded unless explicitly matched.',
    evidenceSourceKeys: ['GB55032_2022'],
    confidence: 'low',
  }),
  rainRule({
    stableCode: 'landscape_planting_earthwork_rainy_season_light',
    keywords: ['landscape planting', 'site planting', 'landscape earthwork', 'planting soil', 'green area'],
    standardWorkCodes: ['landscape_planting', 'landscape_earthwork', 'outdoor_road_hardscape'],
    standardCatalogCodePrefixes: ['05-10'],
    applicableMethodCodes: ['planting_soil', 'landscape_grading', 'planting'],
    applicableGranularity: 'both',
    sensitiveMonths: [5, 6, 7, 8, 9],
    impactBand: 'rain_partial_work',
    productivityMultiplier: 0.94,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'field-calibrated rainy-season fallback',
    sourceClauseRef: 'Landscape earthwork and planting are rain/access sensitive, but planting season itself is not modeled here; enterprise history should calibrate the final coefficient.',
    evidenceSourceKeys: ['GB55032_2022'],
    confidence: 'low',
  }),
  winterRule({
    stableCode: 'concrete_winter_low_temperature',
    keywords: ['concrete', 'pouring', 'curing', 'mass concrete', '混凝土', '浇筑', '养护', '大体积混凝土', '冬施混凝土'],
    standardWorkCodes: ['cast_in_place_concrete', 'shallow_foundation_concrete_structure', 'cushion_and_blinding', 'concrete_curing_wait', 'concrete-pouring', 'concrete-curing', 'mass-concrete'],
    applicableMethodCodes: ['normal_concrete', 'mass_concrete', 'winter_concrete', 'early_strength'],
    applicableGranularity: 'both',
    sensitiveMonths: [1, 2, 11, 12],
    impactBand: 'winter_wet_trade',
    productivityMultiplier: 0.92,
    sourceStandard: 'industry_standard',
    sourceVersion: 'JGJ/T104-2011',
    sourceClauseRef: 'Winter low temperature affects concrete pouring, curing and strength-control workflow; it is not a whole-project shutdown rule.',
    evidenceSourceKeys: ['JGJT104_2011'],
  }),
  winterRule({
    stableCode: 'masonry_plaster_screed_winter_low_temperature',
    keywords: ['masonry', 'plaster', 'screed', 'leveling layer', '砌体', '砌筑', '抹灰', '找平层', '湿作业'],
    standardWorkCodes: ['masonry_infill_wall', 'plastering_wall_ceiling', 'screed', 'leveling-layer', 'masonry', 'plaster'],
    applicableMethodCodes: ['wet_trade', 'mortar_work', 'winter_wet_trade'],
    applicableGranularity: 'both',
    sensitiveMonths: [1, 2, 11, 12],
    impactBand: 'winter_wet_trade',
    productivityMultiplier: 0.94,
    sourceStandard: 'industry_standard',
    sourceVersion: 'JGJ/T104-2011 + GB50210-2018',
    sourceClauseRef: 'Winter low temperature affects mortar and wet-trade curing conditions; dry interior works are not covered by this rule.',
    evidenceSourceKeys: ['JGJT104_2011', 'GB50210_2018'],
  }),
  winterRule({
    stableCode: 'waterproof_material_winter_low_temperature',
    keywords: ['waterproof membrane', 'waterproof coating', 'roof waterproof', 'exterior waterproof', '防水卷材', '防水涂料', '低温防水'],
    standardWorkCodes: ['roof_membrane_waterproof', 'roof_waterproof_insulation', 'basement_waterproof_backfill', 'exterior_wall_waterproof', 'waterproof-membrane', 'waterproof-coating'],
    applicableMethodCodes: ['sbs_membrane', 'self_adhesive_membrane', 'coating_waterproof', 'winter_waterproof'],
    applicableGranularity: 'both',
    sensitiveMonths: [1, 2, 11, 12],
    impactBand: 'winter_wet_trade',
    productivityMultiplier: 0.93,
    sourceStandard: 'industry_standard',
    sourceVersion: 'JGJ/T104-2011 + GB50207-2012 + GB50208-2011',
    sourceClauseRef: 'Low temperature affects waterproof material application, base condition and curing/adhesion windows; weather facts and material method override this fallback.',
    evidenceSourceKeys: ['JGJT104_2011', 'GB50207_2012', 'GB50208_2011'],
  }),
  winterRule({
    stableCode: 'prefabricated_grouting_winter_low_temperature',
    keywords: ['sleeve grouting', 'prefabricated grouting', 'precast grouting', '灌浆套筒', '套筒灌浆', '装配式灌浆'],
    standardWorkCodes: ['prefabricated_sleeve_grouting', 'precast_sleeve_grouting', 'PFB-02-01'],
    applicableMethodCodes: ['prefabricated_grouting', 'sleeve_grouting', 'winter_grouting'],
    applicableGranularity: 'both',
    sensitiveMonths: [1, 2, 11, 12],
    impactBand: 'winter_wet_trade',
    productivityMultiplier: 0.88,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'prefabricated grouting low-temperature field-control fallback',
    sourceClauseRef: 'Sleeve grouting is strongly temperature-window-sensitive; below 5C should enter plan revision candidate governance unless project method statements override it.',
    evidenceSourceKeys: ['JGJT104_2011', 'GB55032_2022'],
  }),
  heatRule({
    stableCode: 'concrete_curing_summer_heat',
    keywords: ['concrete curing', 'concrete pouring', 'mass concrete', '混凝土养护', '混凝土浇筑', '大体积混凝土', '高温混凝土'],
    standardWorkCodes: ['cast_in_place_concrete', 'concrete_curing_wait', 'mass-concrete', 'concrete-pouring', 'concrete-curing'],
    applicableMethodCodes: ['normal_concrete', 'mass_concrete', 'summer_concrete', 'early_strength'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9],
    impactBand: 'heat_process_sensitive',
    productivityMultiplier: 0.92,
    indoorDryWorkExclusion: {
      positiveCodes: ['cleanroom_hvac_commissioning', 'cleanroom_balancing', 'indoor_purification_air_conditioning_commissioning'],
      note: 'Indoor cleanroom HVAC balancing and purification air-conditioning commissioning are governed by indoor environmental readiness, not exterior summer-heat process slowdown.',
    },
    sourceStandard: 'enterprise_method',
    sourceVersion: 'heat-protection regulation + field-calibrated summer concrete fallback',
    sourceClauseRef: 'Extreme heat affects concrete placing, cooling and curing workflow; weather facts own shutdown while this seed marks process-family sensitivity.',
    evidenceSourceKeys: ['GB55032_2022'],
  }),
  heatRule({
    stableCode: 'exterior_paint_membrane_summer_heat',
    keywords: ['exterior coating', 'exterior paint', 'waterproof membrane', 'roof membrane', 'asphalt membrane', '外墙涂料', '外墙抹灰', '防水卷材', '屋面卷材', 'SBS'],
    standardWorkCodes: ['exterior_insulation_finish', 'coating_paint_finish', 'exterior-coating', 'roof_membrane_waterproof', 'roof_waterproof_insulation', 'waterproof-membrane', 'waterproof-coating'],
    applicableMethodCodes: ['exterior_coating', 'external_wall_finish', 'sbs_membrane', 'self_adhesive_membrane', 'coating_waterproof'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9],
    impactBand: 'heat_process_sensitive',
    productivityMultiplier: 0.9,
    indoorDryWorkExclusion: {
      positiveCodes: ['cleanroom_hvac_commissioning', 'indoor_purification_air_conditioning_commissioning', 'indoor_mep_commissioning'],
      note: 'Indoor cleanroom/HVAC commissioning should not inherit exterior coating or roof membrane summer-heat sensitivity without an exposed workface signal.',
    },
    sourceStandard: 'enterprise_method',
    sourceVersion: 'heat-protection regulation + facade/waterproof field calibration',
    sourceClauseRef: 'Extreme heat affects exterior coating film formation, membrane adhesion and exposed facade work windows; candidate weather facts should still govern strong events.',
    evidenceSourceKeys: ['GB50207_2012', 'GB50210_2018', 'GB55032_2022'],
  }),
  windRule({
    stableCode: 'tower_crane_high_wind',
    keywords: ['tower crane', 'lifting', 'hoisting', '吊装', '塔吊', '起重吊装', '吊运'],
    standardWorkCodes: ['tower_crane_lifting', 'hoisting_lifting', 'curtain_wall_installation', 'steel_structure_lifting', 'facade-exterior'],
    applicableMethodCodes: ['tower_crane', 'hoisting', 'curtain_wall_install', 'steel_lifting'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'high_wind',
    productivityMultiplier: 0.78,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'lifting safety wind-control field calibration',
    sourceClauseRef: 'Strong wind directly constrains tower-crane lifting, facade hoisting and similar suspended operations; site weather fact remains the primary trigger.',
    evidenceSourceKeys: ['GB55032_2022'],
  }),
  humidityRule({
    stableCode: 'interior_wet_finish_persistent_humidity',
    keywords: ['interior putty', 'interior coating', 'plaster drying', 'paint drying', '腻子', '内墙涂料', '抹灰干燥', '回南天'],
    standardWorkCodes: ['interior_putty', 'coating_paint_finish', 'plastering_wall_ceiling', 'interior-coating', 'interior-plaster'],
    applicableMethodCodes: ['interior_wet_finish', 'putty', 'coating', 'wet_trade'],
    applicableGranularity: 'both',
    sensitiveMonths: [2, 3, 4, 5],
    impactBand: 'humidity_dry_window',
    productivityMultiplier: 0.9,
    weatherWindowRecoveryPolicy: {
      dryWindowRequiredHours: 72,
      maxRelativeHumidityPercent: 80,
      appliesToImpactBands: ['humidity_dry_window', 'rain_blocks_work'],
      actionPolicy: 'candidate_gate',
      note: 'Persistent humidity or return-south weather should gate release of drying-window-sensitive indoor wet finishes.',
    },
    indoorDryWorkExclusion: {
      positiveCodes: ['indoor_partition', 'drywall_partition', 'suspended_ceiling', 'cabinet_installation', 'floor_tile_dry_area'],
      note: 'Dry indoor packages remain excluded unless task metadata or standard work code explicitly identifies wet finish or drying-window dependency.',
    },
    sourceStandard: 'enterprise_method',
    sourceVersion: 'South China persistent-humidity field-calibrated fallback',
    sourceClauseRef: 'Return-south or persistent high humidity blocks drying windows for putty, plaster and coatings; this is weather-fact-gated and not a generic indoor deduction.',
    evidenceSourceKeys: ['GB50210_2018'],
    confidence: 'low',
  }),
  snowRule({
    stableCode: 'exposed_roof_road_snow_ice_window',
    keywords: ['snow', 'ice', 'roof snow', 'road ice', '屋面积雪', '道路结冰', '雪后清理'],
    standardWorkCodes: ['roof_waterproof_insulation', 'roof_membrane_waterproof', 'outdoor_road_hardscape', 'scaffolding', 'facade_access'],
    applicableMethodCodes: ['roof_work', 'site_hardscape', 'facade_access', 'snow_clearance'],
    applicableGranularity: 'both',
    sensitiveMonths: [1, 2, 11, 12],
    impactBand: 'snow_ice_block',
    productivityMultiplier: 0.86,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'snow-ice exposed-workface fallback',
    sourceClauseRef: 'Snow and ice require clearing and safety verification before exposed roof, road, high-place and outdoor wet operations resume.',
    evidenceSourceKeys: ['GB55032_2022', 'JGJT104_2011'],
    confidence: 'low',
  }),
  dustRule({
    stableCode: 'northwest_dust_storm_outdoor_partial',
    keywords: ['dust storm', 'sandstorm', 'wind sand', '沙尘暴', '扬沙', '风沙'],
    standardWorkCodes: ['earthwork_excavation_transport', 'outdoor_road_hardscape', 'exterior-coating', 'facade-exterior', 'survey_setting_out'],
    applicableMethodCodes: ['earthwork', 'site_hardscape', 'facade_access', 'outdoor_measurement'],
    applicableGranularity: 'both',
    sensitiveMonths: [3, 4, 5],
    impactBand: 'dust_storm_partial',
    productivityMultiplier: 0.92,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'northwest wind-sand field-calibrated fallback',
    sourceClauseRef: 'Dust storm or blowing-sand weather affects outdoor visibility, finish quality and exposed workface organization; weather facts must trigger it.',
    evidenceSourceKeys: ['GB55032_2022'],
    confidence: 'low',
  }),
  windRule({
    stableCode: 'scaffolding_climbing_high_wind',
    keywords: ['scaffolding', 'climbing frame', 'outer frame', 'facade access', '脚手架', '外架', '爬架', '高处作业', '外立面作业'],
    standardWorkCodes: ['scaffolding', 'climbing_scaffold', 'facade_access', 'exterior_insulation_finish', 'curtain_wall_installation', 'facade-exterior'],
    applicableMethodCodes: ['scaffolding', 'climbing_frame', 'facade_access', 'external_wall_finish'],
    applicableGranularity: 'both',
    sensitiveMonths: [6, 7, 8, 9, 10],
    impactBand: 'high_wind',
    productivityMultiplier: 0.82,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'working-at-height wind-control field calibration',
    sourceClauseRef: 'Strong wind constrains scaffolding, climbing-frame and facade-access work; this is a process candidate and should be confirmed through plan revision governance.',
    evidenceSourceKeys: ['GB55032_2022'],
  }),
  thunderstormRule({
    stableCode: 'high_place_lifting_thunderstorm_safety',
    keywords: ['thunderstorm', 'lightning', 'high-place work', 'lifting', 'facade access', '雷电', '雷暴', '高处作业', '吊装'],
    standardWorkCodes: ['tower_crane_lifting', 'hoisting_lifting', 'scaffolding', 'climbing_scaffold', 'facade_access', 'curtain_wall_installation'],
    applicableMethodCodes: ['tower_crane', 'hoisting', 'facade_access', 'scaffolding', 'high_place_work'],
    applicableGranularity: 'both',
    sensitiveMonths: [4, 5, 6, 7, 8, 9],
    impactBand: 'thunderstorm_safety',
    productivityMultiplier: 1,
    sourceStandard: 'enterprise_method',
    sourceVersion: 'thunderstorm high-place safety signal fallback',
    sourceClauseRef: 'Thunderstorm and lightning usually create hourly safety holds for high-place, lifting and facade-access work; duration remains confidence-only until a plan revision confirms impact.',
    evidenceSourceKeys: ['GB55032_2022'],
    confidence: 'low',
  }),
]

function normalizedMonthSet(value: unknown) {
  return Array.isArray(value)
    ? new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 1 && item <= 12))
    : new Set<number>()
}

export function isV1474ProcessSeasonalSensitivityClimateEligible(
  item: Pick<V1474ProcessSeasonalSensitivity, 'sensitivityReason' | 'requiredClimateSignals' | 'sensitiveMonths'>,
  context: V1474ProcessSeasonalEligibilityContext,
) {
  const month = Number(context.month)
  if (!Number.isInteger(month) || month < 1 || month > 12) return false

  const requiredSignals = item.requiredClimateSignals?.length ? item.requiredClimateSignals : [item.sensitivityReason]
  const monthlySignal = String(context.monthlyClimateSignal ?? '').trim()
  const monthlySignalMatched = requiredSignals.includes(monthlySignal as V1474ProcessSeasonalSignal)

  const rainyMonths = new Set([
    ...normalizedMonthSet(context.rainySeasonMonths),
    ...normalizedMonthSet(context.floodSeasonMonths),
  ])
  const highTempMonths = normalizedMonthSet(context.highTempMonths)
  const coldMonths = normalizedMonthSet(context.coldWeatherMonths)
  const profileWindowMatched = requiredSignals.some((signal) => {
    if (signal === 'rainy_season') return rainyMonths.has(month)
    if (signal === 'summer_heat') return highTempMonths.has(month)
    if (signal === 'winter_low_temp') return coldMonths.has(month)
    if (signal === 'snow_ice') return coldMonths.has(month) || monthlySignalMatched
    if (signal === 'wind_warning' || signal === 'persistent_humidity' || signal === 'dust_storm' || signal === 'thunderstorm') return monthlySignalMatched
    return false
  })

  return profileWindowMatched || monthlySignalMatched
}

export function findV1474SeasonalSensitivity(text: string, month: number) {
  const normalized = text.toLowerCase()
  return V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.find((item) => (
    item.sensitiveMonths.includes(month)
    && item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  )) ?? null
}

export const V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_META = {
  seedVersion: V1474_PROCESS_SEASONAL_SENSITIVITY_SEED_VERSION,
  seedScope: 'algorithm_auxiliary',
  sourceStandards: ['JGJ/T104-2011', 'GB50207-2012', 'GB50208-2011', 'GB50210-2018', 'GB50242-2002', 'GB55032-2022'],
  expectedCounts: {
    records: V1474_PROCESS_SEASONAL_SENSITIVITY_SEED.length,
  },
  evidenceSources: V1474_PROCESS_SEASONAL_SENSITIVITY_EVIDENCE_SOURCES,
  generationPolicy: 'source_backed_no_generic_generation; conservative process-family modifiers only; requires climate-profile/monthly-signal gate; weather facts and user plans override these rules',
  relationshipRole: 'process_sensitivity_modifier',
  upstreamRuleTypes: ['regional_climate_rules', 'project_climate_profiles', 'seasonal_productivity'],
  downstreamRuleTypes: [],
  boundaryPolicy: [
    'owns rain/winter process-family sensitivity for foundation, pit/dewatering, pile, waterproof, facade, outdoor utility, hardscape, concrete and wet-trade packages',
    'rainy process windows are package-specific: roof/facade/waterproof may start in spring rain windows, while outdoor utility trench work extends through flood/typhoon season',
    'rain_blocks_work waterproof, roof and exterior finish packages expose weatherWindowRecoveryPolicy for dry-window candidate gates; actual release still requires project/weather facts',
    'owns only high-confidence heat process sensitivity for concrete curing, exterior coating and waterproof membrane packages; ordinary summer macro work-hour capacity remains seasonal_productivity',
    'owns only weather-fact-gated wind sensitivity for lifting, scaffolding, climbing-frame and facade-access work; must not infer wind impact without weather or project facts',
    'humidity, snow, dust and thunderstorm are modeled only when weather/project facts provide a matching signal; thunderstorm remains a confidence/safety signal rather than a daily productivity multiplier',
    'indoor dry works are positively excluded through indoorDryWorkExclusion metadata unless task facts identify wet-finish or drying-window dependency',
    'must not duplicate work_calendar statutory holiday or Spring Festival shutdown impact',
    'must not apply to indoor dry works unless standard_work_code or explicit task facts match a listed package',
  ],
  selfCalibrationPolicy: {
    candidateSource: 'duration_experience_samples',
    groupingKeys: ['standardWorkCode', 'climateSignal', 'month'],
    statistic: 'planned_duration / actual_duration p50',
    actionPolicy: 'candidate_only_until_review',
  },
  webVerified: true,
  reviewNeeded: false,
} as const
