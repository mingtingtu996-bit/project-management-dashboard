export type V1474SiteCapacityPressureSeedRecord = {
  stableCode: string
  label: string
  ruleVersion: number
  isActive: boolean
  weights: {
    sameResponsibleUnit: number
    sameBuilding: number
    sameFloor: number
    sameZone: number
    sameResourceClass: number
    lowParallelCapacity: number
    highParallelCapacity: number
    singleTaskProgressOnly: number
    trendPressure: number
    capacityLimitExcess: number
    responsibleUnitHistoryPressure: number
    progressPressure: number
    resourceCondition: number
    resourceObstacle: number
    overdueMaterial: number
    severeObstacle: number
    longTermSignal: number
    veryLongTermBonus: number
    /** v1.4.22.1: 垂直运输受限调节因子。只作用于受垂直运输影响的局部任务包，不作为全局工期乘数。 */
    verticalTransportLimited: number
    /** v1.4.22.1: 季节窗口明显调节因子。提高季节性约束识别优先级，不与 v1474SeasonalProductivitySeed / winterShutdownRiskLevel / typhoonRiskLevel 重复叠乘。 */
    seasonWindowEmphasis: number
  }
  thresholds: {
    longTermSignalDays: number
    veryLongTermSignalDays: number
    trendWindowDays: number
    trendMinSpanDays: number
    trendSlowDeltaPercent: number
    trendStagnantDeltaPercent: number
    trendRecoveryDeltaPercent: number
    mediumScore: number
    highScore: number
    /** v1.4.22.1: 施工复杂度倍率上限档位选择。决定 multiplierMax 使用 normal=1.20 / complex=1.35 / high_complex=1.50 哪一档。 */
    complexityLevel: Record<'normal' | 'complex' | 'high_complex', { multiplierMax: number }>
  }
  caps: {
    multiplierMin: number
    multiplierMax: number
    multiplierStep: number
    maxExtraDays: number
    maxMaterialExtraDays: number
    maxConfidencePenalty: number
  }
  effectPolicy: {
    coldStartPolicy: 'observation_only'
    actionPolicy: 'candidate_only'
    minSamplesForActiveMode: number
    canAffectNewTaskReference: boolean
    canAffectRemainingForecast: boolean
    canExplainDeviation: boolean
    canCreateRiskIssue: false
  }
  sourceStandard: string
  sourceVersion: string
  sourceClauseRef: string
  evidenceSourceKeys: string[]
  webVerified: boolean
  reviewNeeded: boolean
  confidence: 'high' | 'medium' | 'low'
}

export const V1474_SITE_CAPACITY_PRESSURE_SEED: V1474SiteCapacityPressureSeedRecord[] = [
  {
    stableCode: 'default_site_capacity_pressure_policy',
    label: 'Site capacity pressure policy',
    ruleVersion: 1,
    isActive: true,
    weights: {
      sameResponsibleUnit: 1,
      sameBuilding: 1,
      sameFloor: 1.35,
      sameZone: 1.6,
      sameResourceClass: 1,
      lowParallelCapacity: 1.35,
      highParallelCapacity: 0.65,
      singleTaskProgressOnly: 0.35,
      trendPressure: 2,
      capacityLimitExcess: 1.2,
      responsibleUnitHistoryPressure: 1.2,
      progressPressure: 5,
      resourceCondition: 1,
      resourceObstacle: 2,
      overdueMaterial: 1,
      severeObstacle: 2,
      longTermSignal: 2,
      veryLongTermBonus: 2,
      verticalTransportLimited: 1.2,
      seasonWindowEmphasis: 1.15,
    },
    thresholds: {
      longTermSignalDays: 7,
      veryLongTermSignalDays: 14,
      trendWindowDays: 14,
      trendMinSpanDays: 3,
      trendSlowDeltaPercent: 6,
      trendStagnantDeltaPercent: 2,
      trendRecoveryDeltaPercent: 12,
      mediumScore: 6,
      highScore: 13,
      complexityLevel: {
        normal: { multiplierMax: 1.20 },
        complex: { multiplierMax: 1.35 },
        high_complex: { multiplierMax: 1.50 },
      },
    },
    caps: {
      multiplierMin: 1.03,
      multiplierMax: 1.35,
      multiplierStep: 0.018,
      maxExtraDays: 21,
      maxMaterialExtraDays: 3,
      maxConfidencePenalty: 25,
    },
    effectPolicy: {
      coldStartPolicy: 'observation_only',
      actionPolicy: 'candidate_only',
      minSamplesForActiveMode: 30,
      canAffectNewTaskReference: true,
      canAffectRemainingForecast: true,
      canExplainDeviation: true,
      canCreateRiskIssue: false,
    },
    sourceStandard: 'v1.4.7.4 algorithm governance',
    sourceVersion: 'v1.4.7.4-site-capacity-pressure-20260522',
    sourceClauseRef: 'v1.4.7.4.section_13_6',
    evidenceSourceKeys: [
      'tasks.schedule_overlap',
      'tasks.progress_pressure',
      'task_progress_snapshots.recent_velocity',
      'task_conditions.resource_readiness',
      'task_obstacles.resource_obstacle',
      'project_materials.arrival_delay',
    ],
    webVerified: true,
    reviewNeeded: false,
    confidence: 'medium',
  },
]

export const V1474_SITE_CAPACITY_PRESSURE_SEED_META = {
  seedVersion: 'v1.4.7.4-site-capacity-pressure-20260522',
  seedScope: 'algorithm_auxiliary',
  sourceStandards: [
    'v1.4.7.4 project baseline and monthly plan algorithm upgrade',
    'v1.4.8 task dependency, start condition and obstacle governance',
    'v1.4.18 template duration and experience duration governance',
  ],
  expectedCounts: {
    records: V1474_SITE_CAPACITY_PRESSURE_SEED.length,
  },
  evidenceSources: [
    {
      key: 'tasks.schedule_overlap',
      label: 'Task schedule overlap by responsible unit, building/workface and resource class',
    },
    {
      key: 'task_progress_snapshots.recent_velocity',
      label: 'Recent progress trend by task and responsible unit',
    },
    {
      key: 'task_conditions.resource_readiness',
      label: 'Open personnel, equipment and material readiness conditions',
    },
    {
      key: 'task_obstacles.resource_obstacle',
      label: 'Open personnel, equipment and material obstacles',
    },
    {
      key: 'project_materials.arrival_delay',
      label: 'Linked material expected arrival overdue facts',
    },
  ],
  generationPolicy: 'source_backed_no_generic_generation; candidate_only; no precise crew, equipment or material quantity scheduling; active parameters may be overridden by governed project/company algorithm seed records',
  relationshipRole: 'site_capacity_pressure_policy',
  upstreamRuleTypes: ['resource_class', 'external_readiness', 'progress_velocity', 'progress_quality'],
  downstreamRuleTypes: ['duration_suggestion', 'remaining_duration_forecast', 'baseline_generation', 'monthly_plan_generation', 'deviation_explanation'],
  boundaryPolicy: [
    'does_not_create_risk_or_issue',
    'does_not_require_resource_quantity_input',
    'does_not_claim_confirmed_resource_conflict',
    'uses_business_language_site_capacity_pressure',
  ],
  webVerified: true,
  reviewNeeded: false,
} as const
