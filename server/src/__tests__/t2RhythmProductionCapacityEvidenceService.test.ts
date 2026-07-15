import { describe, expect, it } from 'vitest'

import {
  buildT2RhythmProductionCapacityCoverage,
  buildT2RhythmProductionCapacityEvidence,
} from '../services/t2RhythmProductionCapacityEvidenceService.js'
import { buildT2RhythmScheduleCandidatePackage } from '../services/t2DivisionRhythmTemplateRegistryService.js'

describe('t2RhythmProductionCapacityEvidenceService', () => {
  it('builds ready T2 production capacity evidence from resource sidecar, workfaces, and official calendar context', () => {
    const evidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableCrewStreams: 2,
        evidenceRefs: ['resource-sidecar:project-a:crew-streams'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 3,
        dominantRhythmUnits: ['floor'],
        candidates: [
          {
            backendConsumable: true,
            workfaceCount: 2,
            workfaceKeys: ['floor-01', 'floor-02'],
          },
          {
            backendConsumable: true,
            workfaceCount: 1,
            workfaceKeys: ['floor-03'],
          },
        ],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })

    expect(evidence).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_evidence',
      status: 'ready',
      missingEvidenceCodes: [],
      evidenceRefs: expect.arrayContaining([
        'resource-sidecar:project-a:crew-streams',
        'construction_rhythm_expansion:workfaces',
        'construction_calendar:official_construction_calendar_seed',
      ]),
      productionCapacity: {
        availableParallelWorkfaces: 3,
        availableCrewStreams: 2,
        calendarBasis: 'working_day',
      },
    }))
    expect(evidence.mutationBoundary).toEqual({
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    })
  })

  it('marks capacity evidence partial when crew-stream sidecar data is missing', () => {
    const evidence = buildT2RhythmProductionCapacityEvidence({
      constructionRhythmExpansion: {
        workfaceCandidateCount: 2,
        dominantRhythmUnits: ['floor'],
        candidates: [
          {
            backendConsumable: true,
            workfaceCount: 2,
            workfaceKeys: ['floor-01', 'floor-02'],
          },
        ],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })

    expect(evidence.status).toBe('partial')
    expect(evidence.productionCapacity).toEqual({
      availableParallelWorkfaces: 2,
      calendarBasis: 'working_day',
    })
    expect(evidence.missingEvidenceCodes).toEqual(['crew_stream_capacity_missing'])
  })

  it('cross-checks ready capacity evidence against candidate package peak rhythm demand before C-19.13 phase-1 scheduling', () => {
    const candidatePackage = buildT2RhythmScheduleCandidatePackage({
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
    })
    const evidence = buildT2RhythmProductionCapacityEvidence({
      resourceSidecar: {
        availableCrewStreams: 2,
        evidenceRefs: ['resource-sidecar:project-a:crew-streams'],
      },
      constructionRhythmExpansion: {
        workfaceCandidateCount: 2,
        dominantRhythmUnits: ['floor'],
        candidates: [{
          backendConsumable: true,
          workfaceCount: 2,
          workfaceKeys: ['floor-01', 'floor-02'],
        }],
      },
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [],
      },
    })

    const coverage = buildT2RhythmProductionCapacityCoverage({
      candidatePackage,
      productionCapacityEvidence: evidence,
    })

    expect(coverage).toEqual(expect.objectContaining({
      source: 't2_rhythm_production_capacity_coverage',
      status: 'capacity_supported',
      canEnterC1913Phase1Selection: true,
      requiredParallelWorkfaces: 2,
      availableParallelWorkfaces: 2,
      requiredCrewStreams: 2,
      availableCrewStreams: 2,
      calendarBasisRequired: 'working_day',
      calendarBasisAvailable: 'working_day',
      workfaceCoverageRatio: 1,
      crewStreamCoverageRatio: 1,
      mutationBoundary: {
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
        writesBaseline: false,
        writesRuntimePublications: false,
      },
    }))
    expect(coverage.peakConcurrentWindowCount).toBeGreaterThanOrEqual(1)
    expect(coverage.peakConcurrentWindows).toEqual(expect.arrayContaining([
      expect.stringContaining('W'),
    ]))
    expect(coverage.blockingReasons).toEqual([])
    expect(coverage.evidenceRefs).toEqual(expect.arrayContaining([
      'resource-sidecar:project-a:crew-streams',
      'construction_rhythm_expansion:workfaces',
      'construction_calendar:official_construction_calendar_seed',
    ]))
  })
})
