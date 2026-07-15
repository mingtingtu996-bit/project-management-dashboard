import { describe, expect, it } from 'vitest'

import { DRAWING_PACKAGE_TEMPLATE_SEED } from '../seeds/drawingPackageTemplateSeed.js'
import {
  buildQualifiedDrawingPackageExperienceOverlay,
  buildDrawingPackageExperienceIterationReport,
  buildDrawingPackageExperienceIterationReportFromProjectExperience,
  collectDrawingPackageExperienceReplaySamples,
  evaluateDrawingPackageExperienceReplay,
  mapDrawingPackageExperienceIterationRunRecordToRun,
  mapDrawingPackageExperienceIterationRunToRecord,
  publishDrawingPackageExperienceIterationRun,
  type DrawingPackageExperienceReplaySample,
} from '../services/drawingPackageExperienceIterationService.js'

const INDUSTRIAL_GENERATED_CORE = [
  'pkg-master-plan-construction',
  'pkg-architecture-construction',
  'pkg-structure-construction',
  'pkg-water-construction',
  'pkg-hvac-construction',
  'pkg-electrical-construction',
  'pkg-intelligent-construction',
  'pkg-fire-review',
  'pkg-energy-green-construction',
  'pkg-completion-archive',
  'pkg-industrial-process',
  'pkg-environment-protection-specialty',
]

describe('drawing package experience iteration service', () => {
  it('keeps drawing package self-iteration as real-project replay, not policy crawling or silent seed mutation', () => {
    expect(DRAWING_PACKAGE_TEMPLATE_SEED.experienceIterationPolicy).toMatchObject({
      sourceMode: 'real_project_experience_replay',
      networkPolicy: 'disabled_for_drawing_package_seed',
      mutationPolicy: 'no_silent_seed_mutation',
      runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
    })
    expect(DRAWING_PACKAGE_TEMPLATE_SEED.commercialMaturityBaseline).toMatchObject({
      assetLevel: 'drawing_package',
      formalBusinessProfileCount: 11,
      responsibilityPolicy: 'reuse_existing_drawing_responsibility_fields_only',
    })
    expect(DRAWING_PACKAGE_TEMPLATE_SEED.packagePool.every((pkg) => (
      pkg.deliverableRole
      && pkg.linkedConstructionStage
      && pkg.linkedAcceptancePurpose
      && pkg.commonMissingSignals.length > 0
      && pkg.precisionHints.length > 0
    ))).toBe(true)
  })

  it('produces candidate overlays from project replay gaps without changing the published seed', () => {
    const industrialDefaultBefore = DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles
      .find((profile) => profile.businessTypeCode === 'industrial')!
      .defaultPackageCodes.join('|')

    const samples: DrawingPackageExperienceReplaySample[] = [
      {
        sampleKey: 'replay:sz-industrial-clean-workshop-final',
        projectName: 'Shenzhen industrial clean workshop final drawing-board replay',
        businessTypeCode: 'industrial',
        cityCode: 'shenzhen',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        projectFeatureText: 'industrial factory with production process and environmental facilities',
        actualPackageCodes: [
          ...INDUSTRIAL_GENERATED_CORE,
          'pkg-clean-room-specialty',
        ],
        evidenceNotes: ['Final drawing board contains a separate clean-room package accepted by project team.'],
      },
      {
        sampleKey: 'replay:bj-hospital-final',
        projectName: 'Beijing hospital final drawing-board replay',
        businessTypeCode: 'hospital',
        cityCode: 'beijing',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        projectFeatureText: 'hospital medical process clean controlled environment and environmental protection',
        actualPackageCodes: [
          'pkg-master-plan-construction',
          'pkg-architecture-construction',
          'pkg-structure-construction',
          'pkg-water-construction',
          'pkg-hvac-construction',
          'pkg-electrical-construction',
          'pkg-intelligent-construction',
          'pkg-fire-review',
          'pkg-civil-defense-review',
          'pkg-energy-green-construction',
          'pkg-medical-process-specialty',
          'pkg-clean-room-specialty',
          'pkg-environment-protection-specialty',
          'pkg-completion-archive',
        ],
        evidenceNotes: ['Hospital sample confirms medical process and clean-room package coverage.'],
      },
    ]

    const report = evaluateDrawingPackageExperienceReplay(samples, { minimumCalibratedSamples: 2 })

    expect(report.quality).toMatchObject({
      sampleCount: 2,
      calibratedSampleCount: 2,
      missingPackageCandidateCount: 1,
      runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
      status: 'candidate_overlay_ready',
    })
    expect(report.quality.packageHitRate).toBeGreaterThan(0.9)
    expect(report.quality.packageHitRate).toBeLessThan(1)
    expect(report.missingPackageCandidates).toEqual([
      expect.objectContaining({
        packageCode: 'pkg-clean-room-specialty',
        businessTypeCodes: ['industrial'],
        observedInSampleKeys: ['replay:sz-industrial-clean-workshop-final'],
        proposedAction: 'add_optional_trigger_or_profile_default_candidate',
      }),
    ])
    expect(report.overGeneratedPackageCandidates).toEqual([])

    const industrialDefaultAfter = DRAWING_PACKAGE_TEMPLATE_SEED.businessProfiles
      .find((profile) => profile.businessTypeCode === 'industrial')!
      .defaultPackageCodes.join('|')
    expect(industrialDefaultAfter).toBe(industrialDefaultBefore)
  })

  it('summarizes commercial maturity with eleven business profiles and package-level project-experience calibration', () => {
    const report = buildDrawingPackageExperienceIterationReport({ minimumCalibratedSamples: 8 })

    expect(report.seedVersion).toBe('v1.4.22.6')
    expect(report.commercialMaturity).toMatchObject({
      assetLevel: 'drawing_package',
      businessProfileCoverage: {
        formalBusinessProfileCount: 11,
        status: 'ready',
      },
      selfIteration: {
        updateMode: 'real_project_experience_replay',
        networkPolicy: 'disabled_for_drawing_package_seed',
        mutationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
      },
    })
    expect(report.quality.calibratedSampleCount).toBeGreaterThanOrEqual(8)
    expect(report.quality.status).toBe('candidate_overlay_ready')
  })

  it('collects replay samples from project drawing-package facts without querying single drawing rows', async () => {
    const sqls: string[] = []
    const queryRows = async (sql: string) => {
      sqls.push(sql.replace(/\s+/g, ' ').trim().toLowerCase())
      if (sql.toLowerCase().includes('from projects')) {
        return [{
          id: 'project-industrial',
          name: 'Industrial final board',
          metadata: {
            projectGenerationFacts: {
              businessTypeCode: 'industrial',
              projectFeatures: {
                cleanRoom: true,
                productionProcess: true,
              },
            },
          },
        }]
      }
      if (sql.toLowerCase().includes('from drawing_packages')) {
        return [
          { project_id: 'project-industrial', package_code: 'pkg-architecture-construction', package_name: 'Architecture', status: 'ready_for_acceptance' },
          { project_id: 'project-industrial', package_code: 'pkg-industrial-process', package_name: 'Industrial process', status: 'ready_for_acceptance' },
          { project_id: 'project-industrial', package_code: 'pkg-clean-room-specialty', package_name: 'Clean room', status: 'ready_for_acceptance' },
        ]
      }
      return []
    }

    const samples = await collectDrawingPackageExperienceReplaySamples({ queryRows, maxSamples: 5 })

    expect(samples).toEqual([
      expect.objectContaining({
        sampleKey: 'project:project-industrial',
        projectName: 'Industrial final board',
        businessTypeCode: 'industrial',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        actualPackageCodes: [
          'pkg-architecture-construction',
          'pkg-industrial-process',
          'pkg-clean-room-specialty',
        ],
      }),
    ])
    expect(sqls.join(' ')).toContain('from drawing_packages')
    expect(sqls.join(' ')).not.toContain('construction_drawings')
    const projectQuery = sqls.find((sql) => sql.includes('from projects')) ?? ''
    expect(projectQuery).toContain('select id, name, metadata from projects')
    expect(projectQuery).not.toContain('business_type')
    expect(projectQuery).not.toContain('project_type')
  })

  it('builds a qualified experience overlay only after replay quality gates pass', () => {
    const report = evaluateDrawingPackageExperienceReplay([
      {
        sampleKey: 'replay:sz-industrial-clean-workshop-final',
        projectName: 'Shenzhen industrial clean workshop final drawing-board replay',
        businessTypeCode: 'industrial',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        projectFeatureText: 'industrial factory with production process and environmental facilities',
        actualPackageCodes: [
          ...INDUSTRIAL_GENERATED_CORE,
          'pkg-clean-room-specialty',
        ],
      },
      {
        sampleKey: 'replay:gz-industrial-clean-workshop-final',
        projectName: 'Guangzhou industrial clean workshop final drawing-board replay',
        businessTypeCode: 'industrial',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        projectFeatureText: 'industrial factory with production process and environmental facilities',
        actualPackageCodes: [
          ...INDUSTRIAL_GENERATED_CORE,
          'pkg-clean-room-specialty',
        ],
      },
    ], { minimumCalibratedSamples: 2 })

    const overlay = buildQualifiedDrawingPackageExperienceOverlay(report, { minimumPackageHitRate: 0.9 })

    expect(overlay).toMatchObject({
      overlayCode: 'drawing_package_experience_overlay',
      runtimeConsumptionPolicy: 'qualified_experience_overlay_after_replay_gate',
      additionalPackageCodes: ['pkg-clean-room-specialty'],
      qualityGate: {
        status: 'passed',
      },
    })

    const blocked = buildQualifiedDrawingPackageExperienceOverlay({
      ...report,
      quality: {
        ...report.quality,
        packageHitRate: 0.5,
      },
    })
    expect(blocked).toMatchObject({
      additionalPackageCodes: [],
      qualityGate: {
        status: 'blocked',
        blockReason: 'experience_replay_quality_gate_not_passed',
      },
    })
  })

  it('builds governance maturity from real project samples before falling back to the cold-start baseline', async () => {
    const queryRows = async (sql: string) => {
      if (sql.toLowerCase().includes('from projects')) {
        return [{
          id: 'project-hotel',
          name: 'Hotel final drawing board',
          business_type: 'hotel',
          project_type: 'hotel',
          metadata: {
            projectGenerationFacts: {
              businessTypeCode: 'hotel',
            },
          },
        }]
      }
      if (sql.toLowerCase().includes('from drawing_packages')) {
        return [
          { project_id: 'project-hotel', package_code: 'pkg-architecture-construction', package_name: 'Architecture', status: 'ready_for_acceptance' },
          { project_id: 'project-hotel', package_code: 'pkg-structure-construction', package_name: 'Structure', status: 'ready_for_acceptance' },
          { project_id: 'project-hotel', package_code: 'pkg-fit-out-specialty', package_name: 'Fit out', status: 'ready_for_acceptance' },
        ]
      }
      return []
    }

    const realProjectReport = await buildDrawingPackageExperienceIterationReportFromProjectExperience({
      queryRows,
      minimumCalibratedSamples: 1,
    })

    expect(realProjectReport.sampleSourceSummary).toMatchObject({
      realProjectSampleCount: 1,
      baselineFallbackUsed: false,
    })
    expect(realProjectReport.quality.sampleCount).toBe(1)

    const fallbackReport = await buildDrawingPackageExperienceIterationReportFromProjectExperience({
      queryRows: async () => [],
      minimumCalibratedSamples: 8,
    })

    expect(fallbackReport.sampleSourceSummary).toMatchObject({
      realProjectSampleCount: 0,
      baselineFallbackUsed: true,
      baselineSampleCount: 11,
    })
    expect(fallbackReport.quality.calibratedSampleCount).toBeGreaterThanOrEqual(8)
  })

  it('publishes a backend-only experience iteration run record without mutating the seed', async () => {
    const report = evaluateDrawingPackageExperienceReplay([
      {
        sampleKey: 'replay:sz-industrial-clean-workshop-final',
        projectName: 'Shenzhen industrial clean workshop final drawing-board replay',
        businessTypeCode: 'industrial',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        projectFeatureText: 'industrial factory with production process and environmental facilities',
        actualPackageCodes: [
          ...INDUSTRIAL_GENERATED_CORE,
          'pkg-clean-room-specialty',
        ],
      },
      {
        sampleKey: 'replay:gz-industrial-clean-workshop-final',
        projectName: 'Guangzhou industrial clean workshop final drawing-board replay',
        businessTypeCode: 'industrial',
        sampleSource: 'completed_project_drawing_board',
        coverageCompleteness: 'final_delivery',
        projectFeatureText: 'industrial factory with production process and environmental facilities',
        actualPackageCodes: [
          ...INDUSTRIAL_GENERATED_CORE,
          'pkg-clean-room-specialty',
        ],
      },
    ], { minimumCalibratedSamples: 2 })
    const run = publishDrawingPackageExperienceIterationRun({
      report,
      asOfDate: '2026-06-07',
    })

    expect(run).toMatchObject({
      runCode: 'drawing_package_experience_iteration_run',
      seedVersion: 'v1.4.22.6',
      asOfDate: '2026-06-07',
      publicationStatus: 'candidate_overlay_published',
      updateMode: 'real_project_experience_replay',
      runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
      promotionGate: 'project_replay_hit_rate_and_sample_count',
      mutationPolicy: 'no_silent_seed_mutation',
      recordVisibilityPolicy: 'backend_admin_audit_only',
      promotedOverlay: {
        additionalPackageCodes: ['pkg-clean-room-specialty'],
        qualityGate: {
          status: 'passed',
        },
      },
    })

    const record = mapDrawingPackageExperienceIterationRunToRecord(run)
    expect(record).toMatchObject({
      run_id: run.runId,
      run_code: 'drawing_package_experience_iteration_run',
      seed_version: 'v1.4.22.6',
      publication_status: 'candidate_overlay_published',
      update_mode: 'real_project_experience_replay',
      runtime_preview_policy: 'qualified_overlay_available_for_explicit_preview_only',
      mutation_policy: 'no_silent_seed_mutation',
      record_visibility_policy: 'backend_admin_audit_only',
    })
    expect(mapDrawingPackageExperienceIterationRunRecordToRun(record)).toMatchObject({
      runId: run.runId,
      promotedOverlay: {
        additionalPackageCodes: ['pkg-clean-room-specialty'],
      },
    })
  })
})
