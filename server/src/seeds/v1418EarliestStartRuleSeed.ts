export type V1418EarliestStartRule = {
  stableCode: string
  ruleName: string
  scenario: 'unstarted_overdue'
  appliesWhen: {
    progressEquals: 0
    actualStartDateMissing: true
    plannedStartOrEndPast: true
  }
  knownDateSources: {
    dependencyForecastFinish: boolean
    materialExpectedArrival: boolean
    criticalObstacleEstimatedResolve: boolean
    hardConditionTargetDate: boolean
    drawingConditionTargetDate: boolean
    certificateConditionTargetDate: boolean
    acceptanceConditionTargetDate: boolean
  }
  unknownBlockerPolicy: {
    hardConditionWithoutDate: 'confidence_only'
    drawingWithoutDate: 'confidence_only'
    acceptanceWithoutDate: 'confidence_only'
    materialWithoutDate: 'confidence_only'
    criticalObstacleWithoutResolveDate: 'confidence_only'
  }
  missedStartPolicy: {
    riskIndexDelta: number
    confidencePenaltyBase: number
    confidencePenaltyPerFiveWorkdays: number
    springFestivalPostWindowConfidencePenaltyRatio: number
  }
  unknownBlockerPenalty: {
    confidencePenaltyPerItem: number
    riskIndexDeltaPerItem: number
    confidencePenaltyMax: number
  }
  unstartedOverdueRiskPolicy: {
    missedWindowRiskBase: number
    missedWindowRiskWindowWorkdays: number
    missedWindowOverflowRiskPerWindow: number
    criticalUnknownRiskIndexDelta: number
    dependencyUnknownRiskIndexDelta: number
    materialUnknownRiskIndexDelta: number
    unknownDateRiskIndexDeltaPerItem: number
  }
  referenceStalenessPolicy: {
    warningRatio: number
    criticalRatio: number
    warningConfidenceDelta: number
    criticalConfidenceDelta: number
    warningRiskIndexDelta: number
    criticalRiskIndexDelta: number
  }
  forecastPolicy: {
    baseExecutionDaysSource: 'durationSuggestionService.execution_reference'
    noHistoryMaturityModel: true
    doNotAddUnknownDateDays: true
    exposeOnlyBusinessReasons: true
  }
  sourceStandard: 'system_default'
  sourceVersion: string
  sourceClauseRef: string
  evidenceSourceKeys: string[]
  webVerified: false
  reviewNeeded: false
  confidence: 'medium'
}

export const V1418_EARLIEST_START_RULE_SEED_VERSION = 'v1.4.18-unstarted-overdue-20260517'

export const V1418_EARLIEST_START_RULE_SEED: V1418EarliestStartRule[] = [
  {
    stableCode: 'unstarted_overdue_default',
    ruleName: 'Unstarted overdue earliest start rule',
    scenario: 'unstarted_overdue',
    appliesWhen: {
      progressEquals: 0,
      actualStartDateMissing: true,
      plannedStartOrEndPast: true,
    },
    knownDateSources: {
      dependencyForecastFinish: true,
      materialExpectedArrival: true,
      criticalObstacleEstimatedResolve: true,
      hardConditionTargetDate: true,
      drawingConditionTargetDate: true,
      certificateConditionTargetDate: true,
      acceptanceConditionTargetDate: true,
    },
    unknownBlockerPolicy: {
      hardConditionWithoutDate: 'confidence_only',
      drawingWithoutDate: 'confidence_only',
      acceptanceWithoutDate: 'confidence_only',
      materialWithoutDate: 'confidence_only',
      criticalObstacleWithoutResolveDate: 'confidence_only',
    },
    missedStartPolicy: {
      riskIndexDelta: 0.12,
      confidencePenaltyBase: 8,
      confidencePenaltyPerFiveWorkdays: 2,
      springFestivalPostWindowConfidencePenaltyRatio: 0.5,
    },
    unknownBlockerPenalty: {
      confidencePenaltyPerItem: 4,
      riskIndexDeltaPerItem: 0.04,
      confidencePenaltyMax: 20,
    },
    unstartedOverdueRiskPolicy: {
      missedWindowRiskBase: 0.35,
      missedWindowRiskWindowWorkdays: 30,
      missedWindowOverflowRiskPerWindow: 0.08,
      criticalUnknownRiskIndexDelta: 0.2,
      dependencyUnknownRiskIndexDelta: 0.2,
      materialUnknownRiskIndexDelta: 0.15,
      unknownDateRiskIndexDeltaPerItem: 0.1,
    },
    referenceStalenessPolicy: {
      warningRatio: 0.5,
      criticalRatio: 1,
      warningConfidenceDelta: -8,
      criticalConfidenceDelta: -16,
      warningRiskIndexDelta: 0.06,
      criticalRiskIndexDelta: 0.12,
    },
    forecastPolicy: {
      baseExecutionDaysSource: 'durationSuggestionService.execution_reference',
      noHistoryMaturityModel: true,
      doNotAddUnknownDateDays: true,
      exposeOnlyBusinessReasons: true,
    },
    sourceStandard: 'system_default',
    sourceVersion: 'WorkBuddy v1.4.18 remaining duration forecast rule',
    sourceClauseRef: 'Unstarted overdue tasks use earliest known start date plus execution reference duration.',
    evidenceSourceKeys: ['workbuddy_v1418_remaining_duration_rule'],
    webVerified: false,
    reviewNeeded: false,
    confidence: 'medium',
  },
]

export const V1418_EARLIEST_START_RULE_SEED_META = {
  seedVersion: V1418_EARLIEST_START_RULE_SEED_VERSION,
  seedScope: 'algorithm_auxiliary',
  sourceStandards: ['WorkBuddy v1.4.18 remaining duration forecast rule'],
  expectedCounts: { records: V1418_EARLIEST_START_RULE_SEED.length },
  evidenceSources: [
    {
      sourceKey: 'workbuddy_v1418_remaining_duration_rule',
      title: 'WorkBuddy v1.4.18 remaining duration forecast rule',
      url: 'docs/plans/v1.4.18模板库与经验工期体系执行方案.md',
      accessedAt: '2026-05-17',
    },
  ],
  generationPolicy: 'rule_seed_only; no L0/L1/L2 maturity model until missed-start recovery facts become stable samples',
  webVerified: false,
  reviewNeeded: false,
} as const
