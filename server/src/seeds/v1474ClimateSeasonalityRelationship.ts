export type V1474ClimateSeasonalityRuleType =
  | 'regional_climate_rules'
  | 'project_climate_profiles'
  | 'seasonal_productivity'
  | 'process_seasonal_sensitivity'
  | 'work_calendar'
  | 'weather_forecast_impact'

export type V1474ClimateSeasonalityLayer = {
  ruleType: V1474ClimateSeasonalityRuleType
  layer: 'calendar_capacity_context' | 'climate_environment_fact' | 'monthly_productivity_context' | 'process_sensitivity_modifier' | 'weather_fact_candidate'
  owns: string[]
  mustNotOwn: string[]
  consumes: V1474ClimateSeasonalityRuleType[]
  produces: string[]
  downstream: V1474ClimateSeasonalityRuleType[]
  businessQuestion: string
}

export const V1474_CLIMATE_SEASONALITY_RELATIONSHIP_VERSION = 'v1.4.7.5-climate-seasonality-contract-20260518'

export const V1474_CLIMATE_SEASONALITY_RELATIONSHIP: V1474ClimateSeasonalityLayer[] = [
  {
    ruleType: 'work_calendar',
    layer: 'calendar_capacity_context',
    owns: [
      'statutory_holiday_window',
      'compensatory_workday_metadata',
      'forecast_calendar_window',
      'spring_festival_remobilization_window',
      'optional_regional_calendar_windows',
    ],
    mustNotOwn: [
      'province_city_climate_fact',
      'process_productivity_multiplier',
      'weather_fact_observation',
    ],
    consumes: [],
    produces: ['calendar_productivity_context'],
    downstream: ['seasonal_productivity'],
    businessQuestion: 'Does a statutory, forecast, or construction calendar window reduce available site capacity for this month?',
  },
  {
    ruleType: 'regional_climate_rules',
    layer: 'climate_environment_fact',
    owns: [
      'climate_region',
      'thermal_zone',
      'rainy_season_months',
      'high_temp_months',
      'cold_weather_months',
      'typhoon_risk_level',
      'flood_season_months',
      'winter_shutdown_risk_level',
      'climate_tags',
      'confidence',
    ],
    mustNotOwn: [
      'monthly_productivity_coefficient',
      'process_productivity_multiplier',
      'duration_days',
    ],
    consumes: [],
    produces: ['project_climate_profiles'],
    downstream: ['seasonal_productivity', 'process_seasonal_sensitivity', 'weather_forecast_impact'],
    businessQuestion: 'Where is this project, and what climate environment should scheduling rules assume?',
  },
  {
    ruleType: 'project_climate_profiles',
    layer: 'climate_environment_fact',
    owns: [
      'project_resolved_climate_region',
      'project_city_or_province_climate_tags',
      'location_consensus_status',
      'climate_confidence',
    ],
    mustNotOwn: [
      'monthly_productivity_coefficient',
      'process_productivity_multiplier',
      'duration_days',
    ],
    consumes: ['regional_climate_rules'],
    produces: ['project_climate_profile'],
    downstream: ['seasonal_productivity', 'process_seasonal_sensitivity', 'weather_forecast_impact'],
    businessQuestion: 'What is the project-specific climate profile after city/province inference and observations?',
  },
  {
    ruleType: 'seasonal_productivity',
    layer: 'monthly_productivity_context',
    owns: [
      'month_productivity_factor',
      'calendar_productivity_context',
      'monthly_climate_signal',
      'productivity_confidence_delta',
    ],
    mustNotOwn: [
      'province_city_climate_fact',
      'thermal_zone_definition',
      'process_specific_sensitivity_reason',
    ],
    consumes: ['project_climate_profiles', 'regional_climate_rules', 'work_calendar'],
    produces: ['month_productivity_context'],
    downstream: ['process_seasonal_sensitivity'],
    businessQuestion: 'Given this project climate profile and month, is overall site productivity reduced?',
  },
  {
    ruleType: 'process_seasonal_sensitivity',
    layer: 'process_sensitivity_modifier',
    owns: [
      'process_climate_sensitivity',
      'sensitive_months',
      'sensitivity_reason',
      'process_productivity_multiplier',
    ],
    mustNotOwn: [
      'project_location_inference',
      'province_city_climate_fact',
      'base_month_productivity_factor',
    ],
    consumes: ['project_climate_profiles', 'seasonal_productivity'],
    produces: ['process_sensitivity_context'],
    downstream: [],
    businessQuestion: 'Is this specific process more sensitive to the climate signal already identified for this month?',
  },
  {
    ruleType: 'weather_forecast_impact',
    layer: 'weather_fact_candidate',
    owns: [
      'forecast_weather_fact',
      'weather_severity',
      'weather_source_reliability',
      'candidate_process_weather_signal',
      'static_weather_conflict_observation',
    ],
    mustNotOwn: [
      'statutory_holiday_window',
      'province_city_climate_fact',
      'confirmed_plan_revision',
    ],
    consumes: ['project_climate_profiles', 'process_seasonal_sensitivity'],
    produces: ['weather_forecast_candidate_context'],
    downstream: ['process_seasonal_sensitivity'],
    businessQuestion: 'Does a concrete forecast fact create a candidate plan revision or only a confidence/safety signal?',
  },
]

export const V1474_CLIMATE_SEASONALITY_RELATIONSHIP_META = {
  relationshipVersion: V1474_CLIMATE_SEASONALITY_RELATIONSHIP_VERSION,
  flow: [
    'work_calendar',
    'regional_climate_rules',
    'project_climate_profiles',
    'seasonal_productivity',
    'process_seasonal_sensitivity',
    'weather_forecast_impact',
  ],
  compatibilityContract: {
    version: V1474_CLIMATE_SEASONALITY_RELATIONSHIP_VERSION,
    requiredRuleTypes: [
      'work_calendar',
      'regional_climate_rules',
      'project_climate_profiles',
      'seasonal_productivity',
      'process_seasonal_sensitivity',
      'weather_forecast_impact',
    ],
    observabilitySignals: [
      'calendar_forecast_window',
      'climate_coupling_signal',
      'weather_static_overlap',
      'weather_static_conflict',
      'weather_source_missing',
    ],
  },
  boundaryPolicy: [
    'work_calendar owns statutory and optional construction calendar windows, not process sensitivity',
    'regional_climate_rules owns climate facts, not productivity coefficients',
    'seasonal_productivity owns month-level productivity context, not city climate facts',
    'process_seasonal_sensitivity owns process-level sensitivity, not region inference',
    'weather_forecast_impact owns forecast facts and candidate/confidence policy, not confirmed duration changes',
  ],
} as const
