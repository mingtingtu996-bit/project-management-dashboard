export const SCHEDULE_ACCELERATION_PROFILE_SOURCE = 'schedule_acceleration_profile_seed_v1' as const

export type ScheduleAccelerationProfileSeedRule = {
  profileCode: string
  label: string
  projectTypePatterns: string[]
  methodVariantPatterns: string[]
  fastTrackRatio: number
  fastTrackBudgetRatio: number
  maxFastTrackDays: number
  crashRatio: number
  totalRecoverCapRatio: number
  criticalFallbackPhases: string[]
  confidence: 'baseline' | 'conservative' | 'needs_project_calibration'
}

export type ScheduleAccelerationSeasonalFactorRule = {
  code: string
  label: string
  patterns: string[]
  factor: number
}

export type ScheduleAccelerationResourceCrashCapRule = {
  code: string
  label: string
  resourceGroups: string[]
  crashRatioCap: number
}

const GENERAL_CRITICAL_PHASES = [
  'foundation_pit_pile',
  'basement_structure',
  'superstructure',
  'mep_rough_in',
  'mep_commissioning',
  'finishing',
  'closeout',
]

export const SCHEDULE_ACCELERATION_PROFILE_SEED: ScheduleAccelerationProfileSeedRule[] = [
  {
    profileCode: 'hospital_cleanroom_conservative',
    label: 'Hospital and cleanroom conservative acceleration profile',
    projectTypePatterns: ['hospital', 'medical', 'clinic', 'operating', 'laboratory'],
    methodVariantPatterns: ['cleanroom', 'clean_room'],
    fastTrackRatio: 0.1,
    fastTrackBudgetRatio: 0.027,
    maxFastTrackDays: 8,
    crashRatio: 0.1,
    totalRecoverCapRatio: 0.12,
    criticalFallbackPhases: [
      ...GENERAL_CRITICAL_PHASES,
      'cleanroom_envelope',
      'cleanroom_hvac',
      'medical_gas',
      'medical_purified_water',
      'comprehensive_performance_acceptance',
      'cleanroom_commissioning',
    ],
    confidence: 'conservative',
  },
  {
    profileCode: 'data_center_conservative',
    label: 'Data center and mission critical acceleration profile',
    projectTypePatterns: ['data_center', 'datacenter', 'idc', 'mission_critical', 'server_room'],
    methodVariantPatterns: ['server_room', 'mission_critical'],
    fastTrackRatio: 0.12,
    fastTrackBudgetRatio: 0.035,
    maxFastTrackDays: 10,
    crashRatio: 0.12,
    totalRecoverCapRatio: 0.13,
    criticalFallbackPhases: [
      ...GENERAL_CRITICAL_PHASES,
      'medium_voltage',
      'ups',
      'cooling_system',
      'integrated_commissioning',
      'data_center_mep',
      'server_room_commissioning',
    ],
    confidence: 'conservative',
  },
  {
    profileCode: 'prefabricated_modular_constrained',
    label: 'Prefabricated, precast and modular constrained acceleration profile',
    projectTypePatterns: ['prefabricated', 'precast', 'pc', 'mic', 'modular', 'assembled'],
    methodVariantPatterns: ['prefabricated', 'precast', 'pc', 'mic', 'modular', 'assembled'],
    fastTrackRatio: 0.15,
    fastTrackBudgetRatio: 0.04,
    maxFastTrackDays: 12,
    crashRatio: 0.12,
    totalRecoverCapRatio: 0.13,
    criticalFallbackPhases: [
      ...GENERAL_CRITICAL_PHASES,
      'pc_factory',
      'pc_onsite_install',
      'pc_grouting',
      'precast_hoisting',
      'module_factory',
      'module_install',
    ],
    confidence: 'conservative',
  },
  {
    profileCode: 'general_building',
    label: 'General building acceleration profile',
    projectTypePatterns: ['residential', 'commercial', 'office', 'general_building', 'mixed_use'],
    methodVariantPatterns: [],
    fastTrackRatio: 0.3,
    fastTrackBudgetRatio: 0.08,
    maxFastTrackDays: 21,
    crashRatio: 0.18,
    totalRecoverCapRatio: 0.15,
    criticalFallbackPhases: GENERAL_CRITICAL_PHASES,
    confidence: 'baseline',
  },
]

export const SCHEDULE_ACCELERATION_DEFAULT_PROFILE_CODE = 'general_building'

export const SCHEDULE_ACCELERATION_SEASONAL_FACTOR_SEED: ScheduleAccelerationSeasonalFactorRule[] = [
  {
    code: 'spring_festival_shutdown',
    label: 'Spring Festival shutdown or slow restart',
    patterns: ['spring_festival', 'festival', 'holiday_shutdown'],
    factor: 0.7,
  },
  {
    code: 'winter_restriction',
    label: 'Winter low temperature restriction',
    patterns: ['winter', 'freeze', 'frozen', 'low_temperature', 'cold'],
    factor: 0.8,
  },
  {
    code: 'rain_wind_humidity',
    label: 'Rain, wind, typhoon or humidity restriction',
    patterns: ['rain', 'wet', 'typhoon', 'wind', 'high_wind', 'humidity'],
    factor: 0.85,
  },
  {
    code: 'hot_weather',
    label: 'Hot weather restriction',
    patterns: ['hot_weather', 'heat', 'high_temperature'],
    factor: 0.9,
  },
]

export const SCHEDULE_ACCELERATION_RESOURCE_CRASH_CAP_SEED: ScheduleAccelerationResourceCrashCapRule[] = [
  {
    code: 'labor_intensive',
    label: 'Labor intensive work',
    resourceGroups: ['rebar', 'masonry', 'plaster', 'electrical', 'plumbing', 'general_crew'],
    crashRatioCap: 0.35,
  },
  {
    code: 'material_or_equipment_bound',
    label: 'Material or equipment bound work',
    resourceGroups: ['concrete_pour', 'waterproof', 'facade', 'curtain_wall', 'steel_hoisting', 'precast_hoisting'],
    crashRatioCap: 0.1,
  },
  {
    code: 'system_validation_bound',
    label: 'System validation and commissioning bound work',
    resourceGroups: ['commissioning', 'elevator', 'fire_system', 'intelligent_system', 'hvac'],
    crashRatioCap: 0.08,
  },
]

export const SCHEDULE_ACCELERATION_DEFAULT_RESOURCE_CRASH_CAP = 0.18
export const SCHEDULE_ACCELERATION_MIN_RESOURCE_CRASH_CAP = 0.03

export const SCHEDULE_ACCELERATION_HARD_CONSTRAINT_TYPES = [
  'curing_wait',
  'test_report_wait',
  'acceptance_wait',
  'handover_wait',
  'commissioning_wait',
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
] as const
