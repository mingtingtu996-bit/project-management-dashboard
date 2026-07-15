import { ALGORITHM_SEED_REGISTRY } from './algorithmSeedRegistry.js'

export type PlanSnapshotSeedVersion = {
  seedType: string
  seedVersion: string
  seedScope: string
}

const PLAN_SNAPSHOT_SEED_TYPES = new Set([
  'work_calendar',
  'seasonal_productivity',
  'process_seasonal_sensitivity',
  'process_constraint',
  'resource_class',
  'site_capacity_pressure',
  'building_pattern',
  'standard_work_duration',
  'title_weak_recognition',
  'earliest_start_rule',
  'workflow_dictionary',
  'cross_item_workflow',
])

export function buildPlanSnapshotSeedVersions(): PlanSnapshotSeedVersion[] {
  return ALGORITHM_SEED_REGISTRY
    .filter((entry) => PLAN_SNAPSHOT_SEED_TYPES.has(entry.seedType))
    .map((entry) => ({
      seedType: entry.seedType,
      seedVersion: entry.meta.seedVersion,
      seedScope: entry.meta.seedScope,
    }))
    .sort((left, right) => left.seedType.localeCompare(right.seedType))
}
