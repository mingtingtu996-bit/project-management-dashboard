import type { BusinessTypeCode } from './projectTypeRecommendations.js'

type DefaultMasterPlanRowVolumeStrategy = {
  baseMinimum: number
  baseMaximum: number
  additionalScopeMinimum: number
  additionalScopeMaximum: number
  operationalFloor: number
}

const DEFAULT_MASTER_PLAN_ROW_VOLUME_STRATEGIES: Record<BusinessTypeCode, DefaultMasterPlanRowVolumeStrategy> = {
  general_civil: {
    baseMinimum: 70,
    baseMaximum: 160,
    additionalScopeMinimum: 10,
    additionalScopeMaximum: 18,
    operationalFloor: 60,
  },
  hotel: {
    baseMinimum: 60,
    baseMaximum: 120,
    additionalScopeMinimum: 6,
    additionalScopeMaximum: 12,
    operationalFloor: 60,
  },
  hospital: {
    baseMinimum: 70,
    baseMaximum: 170,
    additionalScopeMinimum: 8,
    additionalScopeMaximum: 15,
    operationalFloor: 60,
  },
  school: {
    baseMinimum: 60,
    baseMaximum: 130,
    additionalScopeMinimum: 6,
    additionalScopeMaximum: 12,
    operationalFloor: 60,
  },
  industrial: {
    baseMinimum: 60,
    baseMaximum: 130,
    additionalScopeMinimum: 6,
    additionalScopeMaximum: 15,
    operationalFloor: 60,
  },
  data_center: {
    baseMinimum: 60,
    baseMaximum: 150,
    additionalScopeMinimum: 8,
    additionalScopeMaximum: 15,
    operationalFloor: 60,
  },
  transportation_hub: {
    baseMinimum: 65,
    baseMaximum: 180,
    additionalScopeMinimum: 8,
    additionalScopeMaximum: 20,
    operationalFloor: 60,
  },
  sports_culture: {
    baseMinimum: 60,
    baseMaximum: 120,
    additionalScopeMinimum: 5,
    additionalScopeMaximum: 12,
    operationalFloor: 60,
  },
  tod_upper_cover: {
    baseMinimum: 72,
    baseMaximum: 200,
    additionalScopeMinimum: 7,
    additionalScopeMaximum: 20,
    operationalFloor: 65,
  },
  renovation: {
    baseMinimum: 60,
    baseMaximum: 80,
    additionalScopeMinimum: 3,
    additionalScopeMaximum: 10,
    operationalFloor: 60,
  },
  modular_building: {
    baseMinimum: 60,
    baseMaximum: 100,
    additionalScopeMinimum: 1,
    additionalScopeMaximum: 8,
    operationalFloor: 60,
  },
}

function strategyFor(businessType: string) {
  return DEFAULT_MASTER_PLAN_ROW_VOLUME_STRATEGIES[businessType as BusinessTypeCode]
    ?? DEFAULT_MASTER_PLAN_ROW_VOLUME_STRATEGIES.general_civil
}

export function resolveDefaultMasterPlanRowCountRange(params: {
  businessType: string
  buildingCount?: number | null
  basementLevelCount?: number | null
  highestBuildingFloorCount?: number | null
}): [number, number] {
  const strategy = strategyFor(params.businessType)
  const buildingCount = Math.max(1, Math.floor(Number(params.buildingCount) || 1))
  const additionalScopeCount = Math.max(0, buildingCount - 1)
  const basementLevelCount = Math.max(0, Number(params.basementLevelCount) || 0)
  const highestBuildingFloorCount = Math.max(0, Number(params.highestBuildingFloorCount) || 0)
  const complexityBump = Math.min(20, Math.max(0, Math.round(
    basementLevelCount * 3 + highestBuildingFloorCount / 12,
  )))
  const lower = Math.min(240,
    strategy.baseMinimum
      + additionalScopeCount * strategy.additionalScopeMinimum
      + complexityBump)
  const upper = Math.min(300, Math.max(
    lower + 30,
    strategy.baseMaximum
      + additionalScopeCount * strategy.additionalScopeMaximum
      + complexityBump * 2,
  ))
  return [lower, upper]
}

export function resolveDefaultMasterPlanOperationalRowFloor(businessType: string) {
  return strategyFor(businessType).operationalFloor
}
