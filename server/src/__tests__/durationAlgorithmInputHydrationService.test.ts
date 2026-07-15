import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
}))

function createBuilder(table: string) {
  const filters: Array<{ column: string; value: unknown }> = []
  const rows = () => {
    const source = table === 'projects' ? state.projects : []
    return source.filter((row) => filters.every((filter) => row[filter.column] === filter.value))
  }
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value })
      return builder
    }),
    maybeSingle: vi.fn(async () => ({ data: rows()[0] ?? null, error: null })),
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

const { hydrateDurationAlgorithmInput } = await import('../services/durationAlgorithmInputHydrationService.js')

describe('durationAlgorithmInputHydrationService', () => {
  beforeEach(() => {
    const baseLiveMetadata = {
        projectGenerationFacts: {
          businessType: 'residential',
          methodVariantCodes: ['modular_mic'],
          totalAreaM2: 60000,
          buildingCount: 2,
          scopeOrganizationFacts: {
            source: 'wizard_scope_objects',
            buildingObjectCount: 2,
            sharedBasementObjectCount: 1,
            organizationSignals: ['multi_building_scope_objects', 'shared_basement_service_range'],
          },
        },
        constructionOrganizationScenario: {
          source: 'construction_organization_scenario_selector',
          sourceVersion: 'test',
          recommendedScenarioIds: ['shared_basement_first_then_tower'],
          recommendedPlanOption: {
            optionId: 'snapshot-shared-basement-first',
            source: 'construction_organization_plan_option',
            selectedScenarioIds: ['shared_basement_first_then_tower'],
            combinedScore: 0.82,
            confidence: 'medium',
          },
          planOptions: [],
          scenarioRecommendations: {},
          confidence: 'medium',
          frontendInputRequired: false,
          boundaryPolicy: {
            directSeedMutation: false,
            resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
            virtualNetworkPolicy: 'scenario_candidates_are_evaluated_as_virtual_networks_before_any_write',
          },
          candidates: [],
          factBasis: {},
        },
        t2RhythmScheduleCandidatePackage: {
          source: 't2_division_rhythm_schedule_candidate_package',
          tier: 'T2',
          status: 'schedulable_candidate',
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          durationContextCandidates: [{
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            windowCode: 't2-residential-standard-floor-structure-rhythm-v1:W01',
            planDurationTruthSource: 'parent_package_rhythm_window',
            tier: 'T2',
            autoApply: false,
          }],
          dependencyCandidates: [{
            edgeCode: 'edge-1',
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            autoApply: false,
          }],
          hardGates: [{
            gateCode: 'gate-1',
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            autoApply: false,
          }],
          compatibility: {
            status: 'compatible_candidate',
            compatible: true,
            conflicts: [],
          },
          scheduleTrustPolicy: {
            autoApply: false,
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            requiresAssemblyCompatibility: true,
            requiresL5Publication: true,
          },
        },
        t2RhythmProductionCapacityEvidence: {
          source: 't2_rhythm_production_capacity_evidence',
          status: 'ready',
          productionCapacity: {
            availableParallelWorkfaces: 2,
            availableCrewStreams: 2,
            calendarBasis: 'working_day',
          },
          evidenceRefs: [
            'resource_sidecar:crew-streams',
            'construction_rhythm_expansion:workfaces',
            'construction_calendar:official_construction_calendar_seed',
          ],
          missingEvidenceCodes: [],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesSeed: false,
            writesBaseline: false,
            writesRuntimePublications: false,
          },
        },
        t2RhythmScheduleCandidateNetwork: {
          source: 't2_rhythm_schedule_candidate_network',
          candidateId: 'c19-13-t2-standard-floor-option',
          tier: 'T2',
          status: 'schedulable_network_candidate',
          canEnterC1913Phase1Selection: true,
          requiresManualReview: false,
          selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
          nodes: [{
            nodeId: 't2-residential-standard-floor-structure-rhythm-v1::t2-residential-standard-floor-structure-rhythm-v1:W01',
            templateId: 't2-residential-standard-floor-structure-rhythm-v1',
            windowCode: 't2-residential-standard-floor-structure-rhythm-v1:W01',
            role: 'floor_control_line',
            durationDays: 2,
            durationSource: 'parent_package_rhythm_window',
            tier: 'T2',
            autoApply: false,
          }],
          edges: [{
            edgeId: 'edge-1',
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            predecessorNodeId: 'node-a',
            successorNodeId: 'node-b',
            relation: 'FS',
            lagDays: 0,
            mandatory: true,
            tier: 'T2',
            autoApply: false,
          }],
          gates: [{
            gateCode: 'gate-1',
            sourceTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
            tier: 'T2',
            autoApply: false,
            nodeIds: ['node-a'],
          }],
          assemblyCompatibility: {
            candidateId: 'c19-13-t2-standard-floor-option',
            status: 'compatible_candidate',
            canEnterAutomaticSelection: true,
            canWriteTaskDependencies: false,
            canWritePlanDates: false,
            priorityOverrideBlocked: false,
            conflicts: [],
          },
          scheduleTrustEvidence: {
            selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            durationBearingNodeCount: 1,
            dependencyEdgeCount: 1,
            hardGateCount: 1,
            compatibilityStatus: 'compatible_candidate',
            replayRequiredBeforePublish: true,
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
          },
        },
        t2RhythmScheduleCandidateNetworkEvaluation: {
          source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
          candidateId: 'c19-13-t2-standard-floor-option',
          tier: 'T2',
          status: 'phase1_readonly_evaluation_ready',
          canEnterC1913Phase1Selection: true,
          networkSpanDays: 18,
          topologicalOrder: ['node-a', 'node-b'],
          criticalNodeIds: ['node-a', 'node-b'],
          criticalWindowCodes: [
            't2-residential-standard-floor-structure-rhythm-v1:W01',
            't2-residential-standard-floor-structure-rhythm-v1:W02',
          ],
          nodeEvaluations: [{
            nodeId: 'node-a',
            windowCode: 't2-residential-standard-floor-structure-rhythm-v1:W01',
            role: 'floor_control_line',
            earliestStartDay: 1,
            earliestFinishDay: 2,
            latestStartDay: 1,
            latestFinishDay: 2,
            totalFloatDays: 0,
            isCritical: true,
          }],
          conflictSummary: {
            conflictCount: 0,
            conflictCodes: [],
            priorityOverrideBlocked: false,
          },
          scheduleTrustEvidence: {
            selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
            durationBearingNodeCount: 1,
            dependencyEdgeCount: 1,
            hardGateCount: 1,
            compatibilityStatus: 'compatible_candidate',
            replayRequiredBeforePublish: true,
            topologyEvaluated: true,
            floatCalculated: true,
            writesTaskDependencies: false,
            writesPlanDates: false,
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
          },
        },
        t2RhythmSchedulePhase1Selection: {
          source: 't2_rhythm_schedule_phase1_selection',
          selectionId: 'c19-13-phase1-residential-options',
          status: 'phase1_selection_ready',
          selectedCandidateId: 'c19-13-t2-standard-floor-option',
          eligibleCandidateIds: ['c19-13-t2-standard-floor-option'],
          rejectedCandidates: [],
          combinationConsistencyGate: {
            receiptRequired: true,
            status: 'pass',
            rejectedConflictCandidateCount: 0,
            rejectedMissingReceiptCandidateCount: 0,
          },
          selectionBasis: {
            strategy: 'assembly_compatible_then_shorter_span',
            assemblyFeasibilityRequired: true,
            linearPriorityCanOverrideAssemblyConflict: false,
            rankSignals: [
              'template_assembly_compatibility_receipt',
              'can_enter_c19_13_phase1_selection',
              'network_span_days',
            ],
          },
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
            writesRuntimePublications: false,
          },
        },
        t2RhythmStandardLibraryTrustGate: {
          source: 't2_rhythm_standard_library_live_replay_trust_gate',
          status: 'shadow_replay_ready_not_publishable',
          canTrustForRealScheduleCalibration: true,
          canEnterC1913Phase1Selection: true,
          canAutoMaterializeTaskDependencies: false,
          canAutoPublishRuntimeExperience: false,
          trustBoundary: 'archived_live_shadow_replay_only',
          passedGateCodes: [
            'archived_json_present',
            'live_evidence_metadata_present',
            'readiness_pass',
            't2_replay_sample_available',
            'shadow_replay_acceptance_passed',
          ],
          blockingReasons: [],
          releaseBlockers: [
            'l5_canary_publish_rollback_required',
            'c19_13_phase1_multinetwork_selection_required',
            'manual_publication_approval_required',
          ],
          mutationBoundary: {
            writesTaskDependencies: false,
            writesPlanDates: false,
            writesCriticalPathFacts: false,
            writesSeed: false,
            writesBaseline: false,
            writesRuntimePublications: false,
          },
        },
    }
    state.projects = [{
      id: 'project-live',
      metadata: baseLiveMetadata,
    }, {
      id: 'project-live-raw-capacity',
      metadata: {
        ...baseLiveMetadata,
        t2RhythmProductionCapacityEvidence: undefined,
        resourceSidecar: {
          available_crew_streams: 3,
          evidence_refs: ['resource_sidecar:project-live-raw-capacity'],
        },
        constructionRhythmExpansion: {
          workfaceCandidateCount: 2,
          candidates: [{
            backendConsumable: true,
            workfaceKeys: ['tower-a:f10', 'tower-a:f11', 'tower-a:f12'],
          }],
        },
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'spring_festival_2026',
            startDate: '2026-02-16',
            endDate: '2026-02-22',
          }],
        },
      },
    }]
    mocks.from.mockClear()
  })

  it('keeps task-scoped frozen inputs closed by default', async () => {
    const input = {
      projectId: 'project-live',
      taskId: 'task-1',
      projectGenerationFacts: {
        businessType: 'residential',
        totalAreaM2: 180000,
      },
    }

    const hydrated = await hydrateDurationAlgorithmInput(input, { purpose: 'new_task_reference' })

    expect(hydrated).toBe(input)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('lets execution reference forecasts reread live project facts over explicit frozen facts', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      taskId: 'task-1',
      projectGenerationFacts: {
        businessType: 'residential',
        methodVariantCodes: ['cast_in_place'],
        totalAreaM2: 180000,
        highestBuildingFloorCount: 33,
      },
    }, {
      purpose: 'execution_reference',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).toEqual(expect.objectContaining({
      businessType: 'residential',
      totalAreaM2: 60000,
      buildingCount: 2,
      highestBuildingFloorCount: 33,
      methodVariantCodes: ['modular_mic'],
      scopeOrganizationFacts: expect.objectContaining({
        source: 'wizard_scope_objects',
        buildingObjectCount: 2,
        sharedBasementObjectCount: 1,
      }),
      hydrationSource: 'project_metadata:execution_reference',
    }))
    expect(mocks.from).toHaveBeenCalledWith('projects')
  })

  it('hydrates the committed construction organization recommendation snapshot separately from facts', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).toEqual(expect.objectContaining({
      businessType: 'residential',
      buildingCount: 2,
      hydrationSource: 'project_metadata:schedule_acceleration',
    }))
    expect(hydrated.projectGenerationFacts).not.toHaveProperty('constructionOrganizationScenario')
    expect(hydrated.constructionOrganizationScenario).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      recommendedScenarioIds: ['shared_basement_first_then_tower'],
      recommendedPlanOption: expect.objectContaining({
        optionId: 'snapshot-shared-basement-first',
      }),
    }))
  })

  it('hydrates T2 rhythm schedule candidate package as a separate read-only engine input channel', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'execution_reference',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).toEqual(expect.objectContaining({
      businessType: 'residential',
      hydrationSource: 'project_metadata:execution_reference',
    }))
    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidatePackage')
    expect(hydrated.t2RhythmScheduleCandidatePackage).toEqual(expect.objectContaining({
      source: 't2_division_rhythm_schedule_candidate_package',
      tier: 'T2',
      status: 'schedulable_candidate',
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      scheduleTrustPolicy: expect.objectContaining({
        autoApply: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        requiresAssemblyCompatibility: true,
      }),
    }))
    expect(hydrated.t2RhythmScheduleCandidatePackage?.durationContextCandidates[0]).toEqual(expect.objectContaining({
      planDurationTruthSource: 'parent_package_rhythm_window',
      tier: 'T2',
      autoApply: false,
    }))
    expect(hydrated.t2RhythmScheduleCandidatePackage?.dependencyCandidates[0]).toEqual(expect.objectContaining({
      autoApply: false,
    }))
  })

  it('hydrates T2 production capacity evidence as a separate read-only assembly gate input channel', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmProductionCapacityEvidence')
    expect(hydrated.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_evidence',
      status: 'ready',
      productionCapacity: expect.objectContaining({
        availableParallelWorkfaces: 2,
        availableCrewStreams: 2,
        calendarBasis: 'working_day',
      }),
      missingEvidenceCodes: [],
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      }),
    }))
  })

  it('derives T2 production capacity evidence from raw project resource, workface, and calendar sidecars', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live-raw-capacity',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmProductionCapacityEvidence')
    expect(hydrated.projectGenerationFacts).not.toHaveProperty('resourceSidecar')
    expect(hydrated.t2RhythmProductionCapacityEvidence).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_evidence',
      status: 'ready',
      productionCapacity: expect.objectContaining({
        availableParallelWorkfaces: 3,
        availableCrewStreams: 3,
        calendarBasis: 'working_day',
      }),
      evidenceRefs: expect.arrayContaining([
        'resource_sidecar:project-live-raw-capacity',
        'construction_rhythm_expansion:workfaces',
        'construction_calendar:official_construction_calendar_seed',
      ]),
      missingEvidenceCodes: [],
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      }),
    }))
  })

  it('hydrates T2 rhythm schedule candidate network as a separate read-only C-19.13 phase-1 input channel', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidateNetwork')
    expect(hydrated.t2RhythmScheduleCandidateNetwork).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_candidate_network',
      tier: 'T2',
      status: 'schedulable_network_candidate',
      canEnterC1913Phase1Selection: true,
      selectedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      }),
    }))
    expect(hydrated.t2RhythmScheduleCandidateNetwork?.nodes[0]).toEqual(expect.objectContaining({
      durationSource: 'parent_package_rhythm_window',
      tier: 'T2',
      autoApply: false,
    }))
    expect(hydrated.t2RhythmScheduleCandidateNetwork?.assemblyCompatibility).toEqual(expect.objectContaining({
      status: 'compatible_candidate',
      canWriteTaskDependencies: false,
      canWritePlanDates: false,
    }))
  })

  it('keeps explicit frozen T2 schedule candidate networks closed unless live reread is requested', async () => {
    const explicitNetwork = {
      source: 't2_rhythm_schedule_candidate_network' as const,
      candidateId: 'explicit-frozen-network',
      tier: 'T2' as const,
      status: 'candidate_conflict' as const,
      canEnterC1913Phase1Selection: false,
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      },
    } as any
    const input = {
      projectId: 'project-live',
      t2RhythmScheduleCandidateNetwork: explicitNetwork,
    }

    const hydrated = await hydrateDurationAlgorithmInput(input, { purpose: 'schedule_acceleration' })

    expect(hydrated).toBe(input)
    expect(hydrated.t2RhythmScheduleCandidateNetwork).toBe(explicitNetwork)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('hydrates T2 rhythm schedule candidate network evaluation as separate read-only phase-1 evidence', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmScheduleCandidateNetworkEvaluation')
    expect(hydrated.t2RhythmScheduleCandidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation',
      tier: 'T2',
      status: 'phase1_readonly_evaluation_ready',
      canEnterC1913Phase1Selection: true,
      networkSpanDays: 18,
      criticalWindowCodes: expect.arrayContaining([
        't2-residential-standard-floor-structure-rhythm-v1:W01',
      ]),
      scheduleTrustEvidence: expect.objectContaining({
        topologyEvaluated: true,
        floatCalculated: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      }),
    }))
  })

  it('keeps explicit frozen T2 schedule candidate network evaluations closed unless live reread is requested', async () => {
    const explicitEvaluation = {
      source: 't2_rhythm_schedule_candidate_network_phase1_evaluation' as const,
      candidateId: 'explicit-frozen-evaluation',
      tier: 'T2' as const,
      status: 'candidate_conflict' as const,
      canEnterC1913Phase1Selection: false,
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
      },
    } as any
    const input = {
      projectId: 'project-live',
      t2RhythmScheduleCandidateNetworkEvaluation: explicitEvaluation,
    }

    const hydrated = await hydrateDurationAlgorithmInput(input, { purpose: 'schedule_acceleration' })

    expect(hydrated).toBe(input)
    expect(hydrated.t2RhythmScheduleCandidateNetworkEvaluation).toBe(explicitEvaluation)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('hydrates C-19.13 T2 phase-1 network selection as separate read-only evidence', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmSchedulePhase1Selection')
    expect(hydrated.t2RhythmSchedulePhase1Selection).toEqual(expect.objectContaining({
      source: 't2_rhythm_schedule_phase1_selection',
      selectionId: 'c19-13-phase1-residential-options',
      status: 'phase1_selection_ready',
      selectedCandidateId: 'c19-13-t2-standard-floor-option',
      eligibleCandidateIds: ['c19-13-t2-standard-floor-option'],
      combinationConsistencyGate: expect.objectContaining({
        receiptRequired: true,
        status: 'pass',
        rejectedConflictCandidateCount: 0,
      }),
      selectionBasis: expect.objectContaining({
        assemblyFeasibilityRequired: true,
        linearPriorityCanOverrideAssemblyConflict: false,
      }),
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      }),
    }))
  })

  it('hydrates T2 standard-library live replay trust gate as separate read-only calibration evidence', async () => {
    const hydrated = await hydrateDurationAlgorithmInput({
      projectId: 'project-live',
      projectGenerationFacts: {
        businessType: 'residential',
      },
    }, {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    })

    expect(hydrated.projectGenerationFacts).not.toHaveProperty('t2RhythmStandardLibraryTrustGate')
    expect((hydrated as any).t2RhythmStandardLibraryTrustGate).toEqual(expect.objectContaining({
      source: 't2_rhythm_standard_library_live_replay_trust_gate',
      status: 'shadow_replay_ready_not_publishable',
      canTrustForRealScheduleCalibration: true,
      canEnterC1913Phase1Selection: true,
      canAutoMaterializeTaskDependencies: false,
      canAutoPublishRuntimeExperience: false,
      trustBoundary: 'archived_live_shadow_replay_only',
      mutationBoundary: expect.objectContaining({
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      }),
    }))
  })
})
