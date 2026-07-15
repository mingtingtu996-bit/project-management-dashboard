import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createEngineeringObject: vi.fn(),
  updateEngineeringObject: vi.fn(),
}))

vi.mock('../services/engineeringObjectService.js', () => ({
  createEngineeringObject: mocks.createEngineeringObject,
  updateEngineeringObject: mocks.updateEngineeringObject,
}))

const {
  buildDraftWizardGenerationScope,
  materializeWizardScopeTree,
} = await import('../services/wizardScopeMaterializationService.js')

describe('wizard scope materialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let next = 0
    mocks.createEngineeringObject.mockImplementation(async (input: Record<string, any>) => {
      next += 1
      const id = `real-${input.objectType}-${next}`
      return {
        id,
        project_id: input.projectId,
        object_type: input.objectType,
        object_name: input.objectName,
        parent_id: input.parentId ?? null,
        path: input.parentId ? `/${input.parentId}/${id}` : `/${id}`,
        level: input.parentId ? 2 : 1,
        sort_order: input.sortOrder ?? 0,
        status: 'active',
        source_type: 'wizard',
        metadata: input.metadata ?? {},
        created_at: '2026-06-13T00:00:00.000Z',
        updated_at: '2026-06-13T00:00:00.000Z',
      }
    })
    mocks.updateEngineeringObject.mockImplementation(async (id: string, input: Record<string, any>) => ({
      id,
      project_id: input.projectId,
      object_type: 'building',
      object_name: 'updated object',
      parent_id: null,
      path: `/${id}`,
      level: 1,
      sort_order: 0,
      status: 'active',
      source_type: 'wizard',
      metadata: input.metadata ?? {},
      created_at: '2026-06-13T00:00:00.000Z',
      updated_at: '2026-06-13T00:00:00.000Z',
    }))
  })

  it('persists a wizard scope tree into engineering objects and returns real generation scope ids', async () => {
    const result = await materializeWizardScopeTree({
      projectId: 'project-1',
      actorId: 'user-1',
      generationBatchId: 'batch-1',
      scopeTree: [
        {
          id: 'node_phase_1',
          type: 'phase',
          name: 'Phase 1',
          metadata: { organizationScope: 'phase' },
          children: [
            {
              id: 'node_section_1',
              type: 'section',
              name: 'Section 1',
              metadata: { organizationScope: 'construction_section' },
              children: [
                {
                  id: 'node_building_1',
                  type: 'building',
                  name: 'Building 1',
                  metadata: { buildingNumber: 1, functionalUsage: 'residential_tower' },
                  children: [
                    {
                      id: 'node_floor_1',
                      type: 'floor',
                      name: 'L1',
                      metadata: { floorOrder: 1, floorUsage: 'ground_pilotis' },
                      children: [
                        {
                          id: 'node_functional_area_1',
                          type: 'functional_area',
                          name: 'Pilotis lobby',
                          metadata: { functionalCategory: 'lobby' },
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'node_basement_1',
          type: 'basement',
          name: 'Basement 1',
          metadata: {
            basementLevelCount: 3,
            serviceTargetObjectIds: ['node_building_1'],
            serviceTargetNames: ['Building 1'],
          },
          children: [],
        },
        {
          id: 'node_physical_zone_1',
          type: 'physical_zone',
          name: 'Outdoor site',
          metadata: { physicalSpaceKind: 'outdoor_site', physicalCategory: 'outdoor_site_plan' },
          children: [],
        },
      ],
    })

    expect(mocks.createEngineeringObject).toHaveBeenCalledTimes(7)
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(1, expect.objectContaining({
      projectId: 'project-1',
      objectType: 'phase',
      objectName: 'Phase 1',
      parentId: null,
      sortOrder: 0,
    }))
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(2, expect.objectContaining({
      objectType: 'section',
      objectName: 'Section 1',
      parentId: result.objectIdByDraftId.node_phase_1,
    }))
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(3, expect.objectContaining({
      objectType: 'building',
      objectName: 'Building 1',
      parentId: result.objectIdByDraftId.node_section_1,
    }))
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(4, expect.objectContaining({
      objectType: 'floor',
      objectName: 'L1',
      parentId: result.objectIdByDraftId.node_building_1,
    }))
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(5, expect.objectContaining({
      objectType: 'functional_area',
      objectName: 'Pilotis lobby',
      parentId: result.objectIdByDraftId.node_floor_1,
    }))
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(6, expect.objectContaining({
      objectType: 'basement',
      objectName: 'Basement 1',
      parentId: null,
      metadata: expect.objectContaining({
        serviceTargetObjectIds: [result.objectIdByDraftId.node_building_1],
        wizardGenerationBatchId: 'batch-1',
      }),
    }))
    expect(mocks.createEngineeringObject).toHaveBeenNthCalledWith(7, expect.objectContaining({
      objectType: 'physical_zone',
      objectName: 'Outdoor site',
      parentId: null,
    }))

    expect(result.generationScope).toEqual(expect.objectContaining({
      phases: [result.objectIdByDraftId.node_phase_1],
      sections: [result.objectIdByDraftId.node_section_1],
      buildings: [result.objectIdByDraftId.node_building_1],
      basements: [result.objectIdByDraftId.node_basement_1],
      floors: [result.objectIdByDraftId.node_floor_1],
      physical_zones: [result.objectIdByDraftId.node_physical_zone_1],
      functional_areas: [result.objectIdByDraftId.node_functional_area_1],
      scope_combos: expect.arrayContaining([
        expect.objectContaining({
          phase_object_id: result.objectIdByDraftId.node_phase_1,
          section_object_id: result.objectIdByDraftId.node_section_1,
          building_object_id: result.objectIdByDraftId.node_building_1,
          floor_object_id: result.objectIdByDraftId.node_floor_1,
        }),
        expect.objectContaining({
          basement_object_id: result.objectIdByDraftId.node_basement_1,
        }),
      ]),
      scope_objects: expect.arrayContaining([
        expect.objectContaining({
          id: result.objectIdByDraftId.node_building_1,
          type: 'building',
          name: 'Building 1',
          metadata: expect.objectContaining({
            buildingNumber: 1,
            functionalUsage: 'residential_tower',
            wizardScopeNodeId: 'node_building_1',
          }),
        }),
        expect.objectContaining({
          id: result.objectIdByDraftId.node_basement_1,
          type: 'basement',
          metadata: expect.objectContaining({
            serviceTargetObjectIds: [result.objectIdByDraftId.node_building_1],
          }),
        }),
        expect.objectContaining({
          id: result.objectIdByDraftId.node_physical_zone_1,
          type: 'physical_zone',
          metadata: expect.objectContaining({
            physicalSpaceKind: 'outdoor_site',
            physicalCategory: 'outdoor_site_plan',
          }),
        }),
      ]),
    }))
    for (const key of [
      'phase_object_id',
      'section_object_id',
      'building_object_id',
      'basement_object_id',
      'floor_object_id',
      'physical_zone_object_id',
      'functional_area_object_id',
    ]) {
      expect(result.generationScope).not.toHaveProperty(key)
    }
    expect(result.generationScope.scope_combos).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        physical_zone_object_id: result.objectIdByDraftId.node_physical_zone_1,
      }),
      expect.objectContaining({
        functional_area_object_id: result.objectIdByDraftId.node_functional_area_1,
      }),
    ]))
    expect(JSON.stringify(result.enrichedScopeTree)).toContain(result.objectIdByDraftId.node_building_1)
    expect(JSON.stringify(result.enrichedScopeTree)).not.toContain('node_building_1"]')
  })

  it('builds explicit generation scope combos from object lineage instead of cartesian scope arrays', async () => {
    const result = await materializeWizardScopeTree({
      projectId: 'project-1',
      actorId: 'user-1',
      scopeTree: [
        {
          id: 'node_phase_1',
          type: 'phase',
          name: 'Phase 1',
          children: [
            {
              id: 'node_section_1',
              type: 'section',
              name: 'Section 1',
              children: [
                {
                  id: 'node_building_1',
                  type: 'building',
                  name: 'Building 1',
                  children: [
                    { id: 'node_floor_1_l1', type: 'floor', name: 'Building 1 L1', metadata: { floorOrder: 1 }, children: [] },
                  ],
                },
              ],
            },
            {
              id: 'node_section_2',
              type: 'section',
              name: 'Section 2',
              children: [
                {
                  id: 'node_building_2',
                  type: 'building',
                  name: 'Building 2',
                  children: [
                    { id: 'node_floor_2_l1', type: 'floor', name: 'Building 2 L1', metadata: { floorOrder: 1 }, children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.generationScope).toEqual(expect.objectContaining({
      phases: [result.objectIdByDraftId.node_phase_1],
      sections: [result.objectIdByDraftId.node_section_1, result.objectIdByDraftId.node_section_2],
      buildings: [result.objectIdByDraftId.node_building_1, result.objectIdByDraftId.node_building_2],
      floors: [result.objectIdByDraftId.node_floor_1_l1, result.objectIdByDraftId.node_floor_2_l1],
    }))

    expect(result.generationScope.scope_combos).toEqual([
      expect.objectContaining({
        phase_object_id: result.objectIdByDraftId.node_phase_1,
        section_object_id: result.objectIdByDraftId.node_section_1,
        building_object_id: result.objectIdByDraftId.node_building_1,
        floor_object_id: result.objectIdByDraftId.node_floor_1_l1,
      }),
      expect.objectContaining({
        phase_object_id: result.objectIdByDraftId.node_phase_1,
        section_object_id: result.objectIdByDraftId.node_section_2,
        building_object_id: result.objectIdByDraftId.node_building_2,
        floor_object_id: result.objectIdByDraftId.node_floor_2_l1,
      }),
    ])
  })

  it('builds preview generation scope combos directly from draft scope tree lineage', () => {
    const generationScope = buildDraftWizardGenerationScope([
      {
        id: 'phase-1',
        type: 'phase',
        name: 'Phase 1',
        children: [
          {
            id: 'section-1',
            type: 'section',
            name: 'Section 1',
            children: [
              {
                id: 'building-1',
                type: 'building',
                name: 'Building 1',
                children: [
                  { id: 'building-1-l1', type: 'floor', name: 'Building 1 L1', metadata: { floorOrder: 1 }, children: [] },
                ],
              },
            ],
          },
          {
            id: 'section-2',
            type: 'section',
            name: 'Section 2',
            children: [
              {
                id: 'building-2',
                type: 'building',
                name: 'Building 2',
                metadata: {
                  servedByScopeObjectIds: ['basement-1'],
                },
                children: [
                  { id: 'building-2-l1', type: 'floor', name: 'Building 2 L1', metadata: { floorOrder: 1 }, children: [] },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'basement-1',
        type: 'basement',
        name: 'Basement 1',
        metadata: {
          basementLevelCount: 3,
          serviceTargetObjectIds: ['building-1', 'building-2'],
        },
        children: [],
      },
    ])

    expect(generationScope).toEqual(expect.objectContaining({
      phases: ['phase-1'],
      sections: ['section-1', 'section-2'],
      buildings: ['building-1', 'building-2'],
      basements: ['basement-1'],
      floors: ['building-1-l1', 'building-2-l1'],
      scope_combos: [
        expect.objectContaining({
          phase_object_id: 'phase-1',
          section_object_id: 'section-1',
          building_object_id: 'building-1',
          floor_object_id: 'building-1-l1',
        }),
        expect.objectContaining({
          phase_object_id: 'phase-1',
          section_object_id: 'section-2',
          building_object_id: 'building-2',
          floor_object_id: 'building-2-l1',
        }),
        expect.objectContaining({
          basement_object_id: 'basement-1',
        }),
      ],
      scope_objects: expect.arrayContaining([
        expect.objectContaining({
          id: 'building-2',
          type: 'building',
          metadata: expect.objectContaining({
            servedByScopeObjectIds: ['basement-1'],
          }),
        }),
        expect.objectContaining({
          id: 'basement-1',
          type: 'basement',
          metadata: expect.objectContaining({
            serviceTargetObjectIds: ['building-1', 'building-2'],
          }),
        }),
      ]),
    }))
  })

  it('keeps preview generation scope combos aligned with commercial scheduling anchors', () => {
    const generationScope = buildDraftWizardGenerationScope([
      {
        id: 'phase-1',
        type: 'phase',
        name: '一期',
        children: [
          {
            id: 'section-1',
            type: 'section',
            name: '一标段',
            children: [
              {
                id: 'building-1',
                type: 'building',
                name: '1#塔楼',
                metadata: { functionalUsage: 'residential_tower' },
                children: [
                  {
                    id: 'tower-zone-1',
                    type: 'physical_zone',
                    name: '塔楼区',
                    metadata: { structuralRole: 'tower', childrenComplete: true },
                    children: [
                      { id: 'tower-l5', type: 'floor', name: 'L5', metadata: { floorOrder: 5 }, children: [] },
                    ],
                  },
                ],
              },
              {
                id: 'shared-podium-1',
                type: 'physical_zone',
                name: '共享裙房',
                metadata: {
                  physicalSpaceKind: 'shared_podium',
                  physicalCategory: 'shared_podium',
                  structuralRole: 'podium',
                  sharedScopeCandidate: true,
                  serviceTargetObjectIds: ['building-1'],
                  childrenComplete: true,
                },
                children: [
                  { id: 'podium-l1', type: 'floor', name: 'L1', metadata: { floorOrder: 1 }, children: [] },
                ],
              },
              {
                id: 'outdoor-site',
                type: 'physical_zone',
                name: '室外总平',
                metadata: { physicalSpaceKind: 'outdoor_site', physicalCategory: 'outdoor_site_plan' },
                children: [
                  {
                    id: 'outdoor-a',
                    type: 'physical_zone',
                    name: 'A区',
                    metadata: { physicalSpaceKind: 'horizontal_work_zone', physicalCategory: 'construction_work_zone' },
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])

    expect(generationScope.scope_combos).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phase_object_id: 'phase-1',
        section_object_id: 'section-1',
        building_object_id: 'building-1',
        floor_object_id: 'tower-l5',
      }),
      expect.objectContaining({
        phase_object_id: 'phase-1',
        section_object_id: 'section-1',
        physical_zone_object_id: 'shared-podium-1',
        floor_object_id: 'podium-l1',
      }),
    ]))
    expect(generationScope.scope_combos).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ physical_zone_object_id: 'tower-zone-1' }),
      expect.objectContaining({ physical_zone_object_id: 'outdoor-a' }),
    ]))
  })

  it('does not expose global direct anchors when explicit scope combos carry lineage', () => {
    const generationScope = buildDraftWizardGenerationScope([
      {
        id: 'phase-1',
        type: 'phase',
        name: 'Phase 1',
        children: [
          {
            id: 'section-1',
            type: 'section',
            name: 'Section 1',
            children: [
              {
                id: 'building-1',
                type: 'building',
                name: 'Building 1',
                children: [
                  { id: 'floor-1', type: 'floor', name: 'L1', children: [] },
                ],
              },
              {
                id: 'outdoor-site',
                type: 'physical_zone',
                name: 'Outdoor site',
                metadata: { physicalSpaceKind: 'outdoor_site' },
                children: [],
              },
            ],
          },
        ],
      },
    ])

    expect(generationScope).toEqual(expect.objectContaining({
      phases: ['phase-1'],
      sections: ['section-1'],
      buildings: ['building-1'],
      floors: ['floor-1'],
      physical_zones: ['outdoor-site'],
      scope_combos: [
        expect.objectContaining({
          phase_object_id: 'phase-1',
          section_object_id: 'section-1',
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
        }),
      ],
    }))
    for (const key of [
      'phase_object_id',
      'section_object_id',
      'building_object_id',
      'floor_object_id',
      'physical_zone_object_id',
    ]) {
      expect(generationScope).not.toHaveProperty(key)
    }
  })

  it('rewrites forward service references after all scope objects receive real ids', async () => {
    const result = await materializeWizardScopeTree({
      projectId: 'project-1',
      actorId: 'user-1',
      scopeTree: [
        {
          id: 'node_building_1',
          type: 'building',
          name: 'Building 1',
          metadata: {
            buildingNumber: 1,
            servedByScopeObjectIds: ['node_basement_1'],
            servedByScopeNames: ['Basement 1'],
          },
          children: [],
        },
        {
          id: 'node_basement_1',
          type: 'basement',
          name: 'Basement 1',
          metadata: {
            basementLevelCount: 2,
            serviceTargetObjectIds: ['node_building_1'],
            serviceTargetNames: ['Building 1'],
          },
          children: [],
        },
      ],
    })

    expect(mocks.updateEngineeringObject).toHaveBeenCalledWith(
      result.objectIdByDraftId.node_building_1,
      expect.objectContaining({
        projectId: 'project-1',
        metadata: expect.objectContaining({
          servedByScopeObjectIds: [result.objectIdByDraftId.node_basement_1],
        }),
      }),
    )
    expect(mocks.createEngineeringObject).toHaveBeenCalledWith(expect.objectContaining({
      objectType: 'basement',
      objectName: 'Basement 1',
      metadata: expect.objectContaining({
        serviceTargetObjectIds: [result.objectIdByDraftId.node_building_1],
      }),
    }))
    expect(mocks.updateEngineeringObject).not.toHaveBeenCalledWith(
      result.objectIdByDraftId.node_basement_1,
      expect.anything(),
    )
  })

  it('preserves top-level wizard organization relationship fields into scope object metadata', async () => {
    const draftGenerationScope = buildDraftWizardGenerationScope([
      {
        id: 'building-a',
        type: 'building',
        name: 'Building A',
        servedByScopeObjectIds: ['basement-common'],
        metadata: { functionalUsage: 'residential_tower' },
        children: [],
      },
      {
        id: 'building-b',
        type: 'building',
        name: 'Building B',
        served_by_scope_object_ids: ['basement-common'],
        metadata: { functionalUsage: 'residential_tower' },
        children: [],
      },
      {
        id: 'basement-common',
        type: 'basement',
        name: 'Common Basement',
        serviceTargetObjectIds: ['building-a', 'building-b'],
        serviceTargetKinds: ['building', 'building'],
        metadata: { basementKind: 'common_basement' },
        children: [],
      },
      {
        id: 'shared-podium',
        type: 'physical_zone',
        name: 'Shared Podium',
        physicalSpaceKind: 'shared_podium',
        structuralRole: 'podium',
        sharedScopeCandidate: true,
        serviceTargetObjectIds: ['building-a', 'building-b'],
        serviceTargetKinds: ['building', 'building'],
        children: [],
      },
    ])

    expect(draftGenerationScope.scope_objects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'building-a',
        metadata: expect.objectContaining({
          servedByScopeObjectIds: ['basement-common'],
        }),
      }),
      expect.objectContaining({
        id: 'building-b',
        metadata: expect.objectContaining({
          served_by_scope_object_ids: ['basement-common'],
        }),
      }),
      expect.objectContaining({
        id: 'basement-common',
        metadata: expect.objectContaining({
          serviceTargetObjectIds: ['building-a', 'building-b'],
          serviceTargetKinds: ['building', 'building'],
        }),
      }),
      expect.objectContaining({
        id: 'shared-podium',
        metadata: expect.objectContaining({
          physicalSpaceKind: 'shared_podium',
          structuralRole: 'podium',
          sharedScopeCandidate: true,
          serviceTargetObjectIds: ['building-a', 'building-b'],
          serviceTargetKinds: ['building', 'building'],
        }),
      }),
    ]))

    const result = await materializeWizardScopeTree({
      projectId: 'project-1',
      actorId: 'user-1',
      scopeTree: [
        {
          id: 'node_building_a',
          type: 'building',
          name: 'Building A',
          servedByScopeObjectIds: ['node_basement_common'],
          metadata: { functionalUsage: 'residential_tower' },
          children: [],
        },
        {
          id: 'node_building_b',
          type: 'building',
          name: 'Building B',
          served_by_scope_object_ids: ['node_basement_common'],
          metadata: { functionalUsage: 'residential_tower' },
          children: [],
        },
        {
          id: 'node_basement_common',
          type: 'basement',
          name: 'Common Basement',
          serviceTargetObjectIds: ['node_building_a', 'node_building_b'],
          serviceTargetKinds: ['building', 'building'],
          metadata: { basementKind: 'common_basement' },
          children: [],
        },
        {
          id: 'node_shared_podium',
          type: 'physical_zone',
          name: 'Shared Podium',
          physicalSpaceKind: 'shared_podium',
          structuralRole: 'podium',
          sharedScopeCandidate: true,
          serviceTargetObjectIds: ['node_building_a', 'node_building_b'],
          serviceTargetKinds: ['building', 'building'],
          children: [],
        },
      ],
    })

    expect(result.generationScope.scope_objects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: result.objectIdByDraftId.node_building_a,
        metadata: expect.objectContaining({
          servedByScopeObjectIds: [result.objectIdByDraftId.node_basement_common],
        }),
      }),
      expect.objectContaining({
        id: result.objectIdByDraftId.node_building_b,
        metadata: expect.objectContaining({
          served_by_scope_object_ids: [result.objectIdByDraftId.node_basement_common],
        }),
      }),
      expect.objectContaining({
        id: result.objectIdByDraftId.node_basement_common,
        metadata: expect.objectContaining({
          serviceTargetObjectIds: [
            result.objectIdByDraftId.node_building_a,
            result.objectIdByDraftId.node_building_b,
          ],
          serviceTargetKinds: ['building', 'building'],
        }),
      }),
      expect.objectContaining({
        id: result.objectIdByDraftId.node_shared_podium,
        metadata: expect.objectContaining({
          physicalSpaceKind: 'shared_podium',
          structuralRole: 'podium',
          sharedScopeCandidate: true,
          serviceTargetObjectIds: [
            result.objectIdByDraftId.node_building_a,
            result.objectIdByDraftId.node_building_b,
          ],
          serviceTargetKinds: ['building', 'building'],
        }),
      }),
    ]))
  })
})
