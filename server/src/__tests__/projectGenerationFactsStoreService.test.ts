import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  engineeringObjects: [] as Array<Record<string, unknown>>,
}))

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function createBuilder(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  let updatePayload: Record<string, unknown> | null = null
  const sourceRows = () => table === 'projects' ? state.projects : state.engineeringObjects
  const rows = () => sourceRows().filter((row) => filters.every((filter) => row[filter.column] === filter.value))
  const applyUpdate = () => {
    if (!updatePayload) return
    for (const row of rows()) {
      Object.assign(row, updatePayload)
    }
  }

  const builder: any = {
    select: vi.fn(() => builder),
    update: vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload
      return builder
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return builder
    }),
    maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      try {
        applyUpdate()
        return Promise.resolve({ data: updatePayload ? null : rows(), error: null }).then(resolve, reject)
      } catch (error) {
        return Promise.reject(error).then(resolve, reject)
      }
    },
  }
  return builder
}

const mocks = vi.hoisted(() => ({
  from: vi.fn((table: string) => createBuilder(table)),
}))

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

const {
  mergeLiveProjectGenerationFactsForForecast,
  refreshLiveProjectGenerationFactsFromProjectState,
} = await import('../services/projectGenerationFactsStoreService.js')

describe('projectGenerationFactsStoreService', () => {
  beforeEach(() => {
    state.projects = []
    state.engineeringObjects = []
    mocks.from.mockClear()
  })

  it('refreshes the live project generation facts when project scale fields change', async () => {
    state.projects = [{
      id: 'project-1',
      project_type: 'residential',
      structure_type: 'shear_wall',
      total_area: 120000,
      building_count: 3,
      above_ground_floors: 26,
      underground_floors: 2,
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
          totalAreaM2: 60000,
          buildingCount: 1,
        },
      },
    }]

    const facts = await refreshLiveProjectGenerationFactsFromProjectState({
      projectId: 'project-1',
      source: 'project_patch',
    })

    expect(facts).toEqual(expect.objectContaining({
      businessType: 'residential',
      structureTypeCode: 'shear_wall',
      totalAreaM2: 120000,
      buildingCount: 3,
      highestBuildingFloorCount: 26,
      basementLevelCount: 2,
    }))
    expect(readRecord(state.projects[0].metadata).projectGenerationFacts).toEqual(expect.objectContaining({
      totalAreaM2: 120000,
      buildingCount: 3,
      highestBuildingFloorCount: 26,
    }))
    expect(readRecord(state.projects[0].metadata).projectGenerationFactsSource).toBe('project_patch')
  })

  it('refreshes scale facts from active engineering objects when scope objects change', async () => {
    state.projects = [{
      id: 'project-2',
      project_type: 'housing',
      total_area: 90000,
      metadata: {},
    }]
    state.engineeringObjects = [
      { id: 'b1', project_id: 'project-2', status: 'active', object_type: 'building', metadata: { standardFloorCount: 18, structureTypeCode: 'frame' } },
      { id: 'b2', project_id: 'project-2', status: 'active', object_type: 'building', metadata: { standardFloorCount: 22 } },
      { id: 'bs1', project_id: 'project-2', status: 'active', object_type: 'basement', metadata: { basementLevelCount: 1, foundationDepthM: 5.8 } },
      { id: 'old', project_id: 'project-2', status: 'inactive', object_type: 'building', metadata: { standardFloorCount: 33 } },
    ]

    const facts = await refreshLiveProjectGenerationFactsFromProjectState({
      projectId: 'project-2',
      source: 'engineering_object_update',
    })

    expect(facts).toEqual(expect.objectContaining({
      businessType: 'residential',
      structureTypeCode: 'frame',
      totalAreaM2: 90000,
      buildingCount: 2,
      highestBuildingFloorCount: 22,
      basementLevelCount: 1,
      foundationDepthM: 5.8,
    }))
  })

  it('rebuilds scope organization facts from active engineering object relationships', async () => {
    state.projects = [{
      id: 'project-scope-org',
      project_type: 'housing',
      metadata: {
        projectGenerationFacts: {
          businessType: 'residential',
        },
      },
    }]
    state.engineeringObjects = [
      { id: 'building-a', project_id: 'project-scope-org', status: 'active', object_type: 'building', metadata: { servedByScopeObjectIds: ['basement-common'] } },
      { id: 'building-b', project_id: 'project-scope-org', status: 'active', object_type: 'building', metadata: { served_by_scope_object_ids: ['basement-common'] } },
      { id: 'building-c', project_id: 'project-scope-org', status: 'active', object_type: 'building', metadata: { servedByScopeObjectIds: ['basement-common'] } },
      {
        id: 'basement-common',
        project_id: 'project-scope-org',
        status: 'active',
        object_type: 'basement',
        metadata: {
          basementKind: 'common_basement',
          serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
        },
      },
      {
        id: 'shared-podium',
        project_id: 'project-scope-org',
        status: 'active',
        object_type: 'physical_zone',
        metadata: {
          physicalSpaceKind: 'shared_podium',
          structuralRole: 'podium',
          sharedScopeCandidate: true,
          serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
        },
      },
      {
        id: 'inactive-basement',
        project_id: 'project-scope-org',
        status: 'inactive',
        object_type: 'basement',
        metadata: {
          basementKind: 'common_basement',
          serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
        },
      },
    ]

    const facts = await refreshLiveProjectGenerationFactsFromProjectState({
      projectId: 'project-scope-org',
      source: 'engineering_object_update',
    })

    expect(facts.scopeOrganizationFacts).toEqual(expect.objectContaining({
      source: 'engineering_objects',
      scopeObjectCount: 5,
      buildingObjectCount: 3,
      sharedBasementObjectCount: 1,
      sharedPodiumObjectCount: 1,
      sharedBasementServiceTargetCount: 3,
      serviceTargetKindCounts: expect.objectContaining({ building: 6 }),
      servedByScopeKindCounts: expect.objectContaining({ basement: 3 }),
      sharedBasementServiceTargetKindCounts: expect.objectContaining({ building: 3 }),
      sharedScopeServiceTargetKindCounts: expect.objectContaining({ building: 6 }),
      servedRelationCount: 3,
      organizationSignals: expect.arrayContaining([
        'multi_building_scope_objects',
        'shared_basement_service_range',
        'shared_basement_serves_multiple_buildings',
        'shared_podium_service_range',
        'served_by_scope_relation_present',
      ]),
    }))
    expect(readRecord(state.projects[0].metadata).projectGenerationFacts).toEqual(expect.objectContaining({
      scopeOrganizationFacts: expect.objectContaining({
        source: 'engineering_objects',
        sharedBasementServiceTargetCount: 3,
      }),
    }))
  })

  it('keeps live construction-organization facts available for forecast and acceleration hydration', () => {
    const merged = mergeLiveProjectGenerationFactsForForecast(
      {
        businessType: 'residential',
        totalAreaM2: 60000,
      },
      {
        businessType: 'hospital',
        planScopeCaliber: 'general_contract',
        deliveryStandard: 'production_ready',
        terminalEvent: 'owner_handover',
        methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
        prefabSystemCodes: ['pcf_facade_panel'],
        elementVariantCodes: ['steel_structure'],
        locationFacts: {
          provinceCode: 'zhejiang',
          climateSignals: ['plum_rain'],
          weatherImpactBands: ['earthwork_rain_sensitive'],
        },
        towerCraneCount: 2,
        scopeOrganizationFacts: {
          source: 'engineering_objects',
          buildingObjectCount: 3,
          sharedBasementObjectCount: 1,
          organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
        },
      },
    )

    expect(merged).toEqual(expect.objectContaining({
      businessType: 'hospital',
      totalAreaM2: 60000,
      planScopeCaliber: 'general_contract',
      deliveryStandard: 'production_ready',
      terminalEvent: 'owner_handover',
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
      prefabSystemCodes: ['pcf_facade_panel'],
      elementVariantCodes: ['steel_structure'],
      locationFacts: expect.objectContaining({
        provinceCode: 'zhejiang',
        climateSignals: ['plum_rain'],
        weatherImpactBands: ['earthwork_rain_sensitive'],
      }),
      towerCraneCount: 2,
      scopeOrganizationFacts: expect.objectContaining({
        source: 'engineering_objects',
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
      }),
    }))
  })
})
