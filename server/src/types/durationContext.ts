export type DurationContextFactorKey =
  | 'seasonal_productivity'
  | 'process_seasonal_sensitivity'
  | 'weather_forecast_impact'
  | 'calendar_missing'
  | 'workflow_sequence'
  | 'resource_conflict'
  | 'process_constraint'
  | 'external_readiness'
  | 'progress_velocity'
  | 'progress_quality'
  | 'pm_recovery_compensation'
  | 'productivity_compensation'
  | 'project_baseline_calibration'
  | 'project_schedule_state'

export type DurationContextActionPolicy = 'auto_apply' | 'candidate_only' | 'confidence_only'

export interface DurationContextFactor {
  key: DurationContextFactorKey
  label: string
  multiplier: number
  extraDays: number
  confidenceDelta: number
  actionPolicy: DurationContextActionPolicy
  dataDependencies?: string[]
  reason: string
  source: 'v1.4.7.4_seed' | 'project_history' | 'task_fact' | 'external_readiness' | 'weather_fact' | 'project_schedule_state'
  metadata?: Record<string, unknown>
}

export interface DurationContextInput {
  projectId?: string | null
  taskId?: string | null
  standardTaskMetadata?: Record<string, unknown> | null
  templateNodeId?: string | null
  engineeringCategoryId?: string | null
  wbsNodeType?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  taskTitle?: string | null
  plannedStartDate?: string | null
  plannedEndDate?: string | null
  actualStartDate?: string | null
  actualEndDate?: string | null
  progress?: number | null
  plannedQuantity?: number | null
  completedQuantity?: number | null
  quantityUnit?: string | null
  buildingObjectId?: string | null
  floorObjectId?: string | null
  zoneObjectId?: string | null
  responsibleUnitId?: string | null
  projectTypeCode?: string | null
  structureTypeCode?: string | null
  methodVariantCodes?: string[] | null
  elementVariantCodes?: string[] | null
  acceptanceRequired?: boolean | null
  materialRequired?: boolean | null
  durationSource?: 'standard' | 'benchmark' | 'forecast' | 'legacy'
  applicableGranularity?: string | null
  projectGenerationFacts?: Record<string, unknown> | null
  runtimeExecutionFacts?: Record<string, unknown> | null
  algorithmFactPhase?: 'duration_context' | 'runtime_forecast' | 'monthly_plan' | 'new_task_reference' | 'baseline_generation' | 'plan_creation' | 'runtime_delay_recovery' | null
}

export type ActiveReadinessRows = {
  conditions: Record<string, unknown>[]
  obstacles: Record<string, unknown>[]
  materials: Record<string, unknown>[]
}

export type ProgressSnapshotFacts = {
  snapshotCount: number
  firstProgressDate: Date | null
  firstProgressDateText: string | null
  recentSpanDays: number
  recentProgressDelta: number
  recoveredByTrend: boolean
  stagnantByTrend: boolean
  recentRecoveredByTrend: boolean
  progressOscillationByTrend: boolean
  recoverySegmentCount: number
  stagnantOrRegressionSegmentCount: number
}
