import { describe, expect, it } from 'vitest'

import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'
import {
  checkTemplateAssemblyCompatibility,
} from '../services/templateAssemblyCompatibilityCheckService.js'
import {
  buildT2RhythmProductionCapacityEvidence,
} from '../services/t2RhythmProductionCapacityEvidenceService.js'

describe('templateAssemblyCompatibilityCheckService', () => {
  it('blocks C-19.13 automatic selection when T2 rhythm and construction organization assumptions conflict', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: false,
      },
      organizationAssumptions: ['tower_first_without_basement_handover'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'phase1-network-option-a',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'tower-first-option',
        assumptions: ['tower_first_without_basement_handover'],
      },
      cpmNetwork: {
        edges: [{
          edgeId: 'tower-before-basement',
          predecessorWindowCode: 'tower_start',
          successorWindowCode: 'basement_handover',
          relation: 'FS',
          lagDays: 0,
          mandatory: true,
        }],
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.canWriteTaskDependencies).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 't2_candidate_conflict',
        source: 't2_division_rhythm_schedule_candidate_package',
      }),
      expect.objectContaining({
        conflictCode: 'cpm_edge_unknown_window',
        edgeId: 'tower-before-basement',
      }),
    ]))
  })

  it('blocks assembled candidate networks when CPM rhythm edges form cycles across T2 windows', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })
    const firstWindow = t2Package.packageWindows[0]?.windowCode
    const secondWindow = t2Package.packageWindows[1]?.windowCode

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'phase1-network-cyclic',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'basement-first-option',
        assumptions: ['basement_first_then_tower'],
      },
      cpmNetwork: {
        edges: [
          {
            edgeId: 'forward-edge',
            predecessorWindowCode: firstWindow,
            successorWindowCode: secondWindow,
            relation: 'FS',
            lagDays: 0,
            mandatory: true,
          },
          {
            edgeId: 'back-edge',
            predecessorWindowCode: secondWindow,
            successorWindowCode: firstWindow,
            relation: 'FS',
            lagDays: 0,
            mandatory: true,
          },
        ],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'cpm_topology_cycle',
        source: 'cpm_network',
      }),
    ]))
  })

  it('blocks global assembly when construction organization assumptions conflict with an otherwise compatible T2 package', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
    })

    expect(t2Package.status).toBe('schedulable_candidate')

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'phase1-network-option-b',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'tower-first-option',
        assumptions: ['tower_first_without_basement_handover'],
      },
      productionCapacity: {
        availableParallelWorkfaces: 4,
        availableCrewStreams: 4,
        calendarBasis: 'working_day',
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'construction_organization_t2_assumption_conflict',
        source: 'construction_organization',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      }),
    ]))
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      candidateId: 'phase1-network-option-b',
      selectedTemplateSet: {
        t2TemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
        constructionOrganizationScenarioId: 'tower-first-option',
        cpmEdgeIds: [],
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
        assemblyFeasibilityRequired: true,
        priorityOverrideBlocked: true,
      },
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: ['construction_organization_t2_assumption_conflict'],
      blockedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
      manualReviewReasons: [
        'Construction organization assumption tower_first_without_basement_handover conflicts with T2 rhythm template Residential standard-floor structure cycle rhythm.',
      ],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
  })

  it('blocks assembled candidates when a compatible selected template set still conflicts with construction assumptions', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'superstructure',
        divisionFamily: 'superstructure',
        subdivisionFamily: 'standard_floor_handover',
        methodVariantCodes: ['aluminum_formwork'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasOrderedFloors: true,
        hasBasementHandover: true,
      },
      organizationAssumptions: ['basement_first_then_tower'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(t2Package.selectedTemplateIds).toEqual(['t2-residential-standard-floor-structure-rhythm-v1'])

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'phase1-network-combination-conflict',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'tower-first-option',
        assumptions: ['tower_first_without_basement_handover'],
      },
      productionCapacity: {
        availableParallelWorkfaces: 4,
        availableCrewStreams: 4,
        calendarBasis: 'working_day',
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'construction_organization_t2_assumption_conflict',
        source: 'construction_organization',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      }),
    ]))
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: expect.arrayContaining(['construction_organization_t2_assumption_conflict']),
      blockedTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
    }))
  })

  it('blocks automatic selection when production capacity or work calendar cannot support selected T2 rhythms', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'decoration',
        divisionFamily: 'decoration_fitout',
        subdivisionFamily: 'fitout_workface_handover',
        methodVariantCodes: ['wet_area_fitout'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasFloorHandover: true,
        hasMepRoughInInterface: true,
      },
      organizationAssumptions: ['floor_by_floor_interleaving'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(t2Package.status).toBe('schedulable_candidate')
    expect(t2Package.productionFeasibilitySummaries[0]).toEqual(expect.objectContaining({
      minimumParallelWorkfaces: 2,
      recommendedCrewStreams: 2,
    }))

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'phase1-network-capacity-shortage',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-low-capacity',
        assumptions: ['floor_by_floor_interleaving'],
      },
      productionCapacity: {
        availableParallelWorkfaces: 1,
        availableCrewStreams: 1,
        calendarBasis: 'calendar_day',
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'production_parallel_workface_insufficient',
        source: 'production_capacity',
        templateId: 't2-residential-secondary-structure-fitout-interleave-v1',
      }),
      expect.objectContaining({
        conflictCode: 'production_crew_stream_insufficient',
        source: 'production_capacity',
        templateId: 't2-residential-secondary-structure-fitout-interleave-v1',
      }),
      expect.objectContaining({
        conflictCode: 'production_calendar_basis_mismatch',
        source: 'production_capacity',
        templateId: 't2-residential-secondary-structure-fitout-interleave-v1',
      }),
    ]))
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: expect.arrayContaining([
        'production_parallel_workface_insufficient',
        'production_crew_stream_insufficient',
        'production_calendar_basis_mismatch',
      ]),
      blockedTemplateIds: ['t2-residential-secondary-structure-fitout-interleave-v1'],
    }))
  })

  it('blocks T2 packages from automatic selection when production capacity evidence is absent', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'decoration',
        divisionFamily: 'decoration_fitout',
        subdivisionFamily: 'fitout_workface_handover',
        methodVariantCodes: ['wet_area_fitout'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasFloorHandover: true,
        hasMepRoughInInterface: true,
      },
      organizationAssumptions: ['floor_by_floor_interleaving'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(t2Package.status).toBe('schedulable_candidate')
    expect(t2Package.productionFeasibilitySummaries.length).toBeGreaterThan(0)

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'phase1-network-capacity-evidence-absent',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-option',
        assumptions: ['floor_by_floor_interleaving'],
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'production_capacity_evidence_missing',
        source: 'production_capacity',
        templateId: 't2-residential-secondary-structure-fitout-interleave-v1',
      }),
    ]))
    expect(result.explanation).toEqual(expect.objectContaining({
      checkedSources: expect.arrayContaining(['production_capacity']),
      productionCapacityChecked: true,
      productionCapacityEvidenceStatus: null,
      productionCapacityMissingEvidenceCodes: ['production_capacity_evidence_missing'],
    }))
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: expect.arrayContaining(['production_capacity_evidence_missing']),
      blockedTemplateIds: ['t2-residential-secondary-structure-fitout-interleave-v1'],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
  })

  it('locks the C-19.15a aggregate gate across T2 package, organization, capacity evidence, selector receipt, and no-write boundary', () => {
    const t2Package = buildT2RhythmScheduleCandidatePackage({
      selection: {
        businessTypeCode: 'residential',
        phaseWindow: 'decoration',
        divisionFamily: 'decoration_fitout',
        subdivisionFamily: 'fitout_workface_handover',
        methodVariantCodes: ['wet_area_fitout'],
        scopeDimensions: ['building', 'floor'],
      },
      facts: {
        hasFloorHandover: true,
        hasMepRoughInInterface: true,
      },
      organizationAssumptions: ['floor_by_floor_interleaving'],
      selectedWorkfaceUnits: ['floor'],
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })
    const incompleteCapacityEvidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableParallelWorkfaces: 1,
        evidenceRefs: ['resource-sidecar:limited-fitout-team'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 1,
      },
    })

    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'c1915a-aggregate-gate',
      t2RhythmScheduleCandidatePackage: t2Package,
      constructionOrganization: {
        scenarioId: 'fitout-interleave-option',
        assumptions: ['floor_by_floor_interleaving'],
      },
      productionCapacityEvidence: incompleteCapacityEvidence,
      cpmNetwork: {
        edges: [{
          edgeId: 'selector-receipt-window-edge',
          predecessorWindowCode: t2Package.packageWindows[0]?.windowCode,
          successorWindowCode: 'unknown-fitout-window',
          relation: 'FS',
          lagDays: 0,
          mandatory: true,
        }],
      },
      priorityAdjudication: {
        selectedTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.canWriteTaskDependencies).toBe(false)
    expect(result.canWritePlanDates).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.explanation).toEqual(expect.objectContaining({
      checkedSources: expect.arrayContaining([
        't2_division_rhythm_schedule_candidate_package',
        'production_capacity',
        'cpm_network',
      ]),
      productionCapacityChecked: true,
      productionCapacityEvidenceStatus: 'partial',
      productionCapacityMissingEvidenceCodes: expect.arrayContaining([
        'crew_stream_capacity_missing',
        'calendar_basis_evidence_missing',
      ]),
    }))
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'production_capacity_evidence_missing',
        source: 'production_capacity',
      }),
      expect.objectContaining({
        conflictCode: 'production_parallel_workface_insufficient',
        source: 'production_capacity',
      }),
      expect.objectContaining({
        conflictCode: 'cpm_edge_unknown_window',
        source: 'cpm_network',
        edgeId: 'selector-receipt-window-edge',
      }),
    ]))
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      candidateId: 'c1915a-aggregate-gate',
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: expect.arrayContaining([
        'production_capacity_evidence_missing',
        'production_parallel_workface_insufficient',
        'cpm_edge_unknown_window',
      ]),
      selectedTemplateSet: {
        t2TemplateIds: ['t2-residential-secondary-structure-fitout-interleave-v1'],
        constructionOrganizationScenarioId: 'fitout-interleave-option',
        cpmEdgeIds: ['selector-receipt-window-edge'],
      },
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
  })

  it('blocks non-T2 template families without compatibility receipts from automatic selection', () => {
    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'c1915a-full-family-missing-receipts',
      templateFamilyRequirements: [
        {
          family: 'wbs_template',
          templateId: 'wbs-highrise-core-shell-v1',
          compatibilityReceipt: null,
        },
        {
          family: 't3_productivity',
          templateId: 'productivity-highrise-project-v1',
          compatibilityReceipt: null,
        },
        {
          family: 's_curve',
          templateId: 's-curve-highrise-standard-v1',
          compatibilityReceipt: null,
        },
      ],
      priorityAdjudication: {
        selectedTemplateId: 'wbs-highrise-core-shell-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    } as any)

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conflictCode: 'template_family_compatibility_receipt_missing',
        source: 'template_family',
        templateId: 'wbs-highrise-core-shell-v1',
      }),
      expect.objectContaining({
        conflictCode: 'template_family_compatibility_receipt_missing',
        source: 'template_family',
        templateId: 'productivity-highrise-project-v1',
      }),
      expect.objectContaining({
        conflictCode: 'template_family_compatibility_receipt_missing',
        source: 'template_family',
        templateId: 's-curve-highrise-standard-v1',
      }),
    ]))
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: expect.arrayContaining(['template_family_compatibility_receipt_missing']),
      blockedTemplateIds: [
        'productivity-highrise-project-v1',
        's-curve-highrise-standard-v1',
        'wbs-highrise-core-shell-v1',
      ],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
    expect(result.explanation.checkedSources).toContain('template_family')
  })

  it('blocks non-T2 template family receipts that carry conflict codes even when marked compatible', () => {
    const result = checkTemplateAssemblyCompatibility({
      candidateId: 'c1915a-family-receipt-conflict-codes',
      templateFamilyRequirements: [
        {
          family: 'wbs_template',
          templateId: 'wbs-highrise-core-shell-v1',
          compatibilityReceipt: {
            compatibilityStatus: 'compatible_candidate',
            conflictCodes: ['wbs_scope_gap'],
            manualReviewReasons: [
              'WBS template scope gap must be resolved before automatic assembly.',
            ],
          },
        },
      ],
      priorityAdjudication: {
        selectedTemplateId: 'wbs-highrise-core-shell-v1',
        selectedBy: 'project_experience_over_system_standard_library',
        priorityRank: ['project_experience', 'system_standard_library', 'external_knowledge_candidate'],
      },
    })

    expect(result.status).toBe('candidate_conflict')
    expect(result.canEnterAutomaticSelection).toBe(false)
    expect(result.priorityOverrideBlocked).toBe(true)
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        conflictCode: 'template_family_compatibility_receipt_conflict',
        source: 'template_family',
        templateId: 'wbs-highrise-core-shell-v1',
        detail: 'WBS template scope gap must be resolved before automatic assembly.',
      }),
    ])
    expect(result.templateAssemblyCompatibilityReceipt).toEqual(expect.objectContaining({
      compatibilityStatus: 'candidate_conflict',
      priorityOverrideBlocked: true,
      conflictCodes: ['template_family_compatibility_receipt_conflict'],
      blockedTemplateIds: ['wbs-highrise-core-shell-v1'],
      manualReviewReasons: [
        'WBS template scope gap must be resolved before automatic assembly.',
      ],
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
  })
})
