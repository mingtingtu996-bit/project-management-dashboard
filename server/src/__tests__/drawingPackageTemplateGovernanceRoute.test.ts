import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

const state = vi.hoisted(() => ({
  globalRole: 'company_admin',
  membershipRole: null as string | null,
  buildDrawingPackageExperienceIterationReportFromProjectExperience: vi.fn(async () => ({
    reportCode: 'drawing_package_experience_iteration_report',
    templateCode: 'general_drawing_package_v1',
    seedVersion: 'v1.4.22.6',
    asOfDate: '2026-06-07T00:00:00.000Z',
    frontendExposurePolicy: 'backend_admin_api_only',
    sampleSourceSummary: {
      realProjectSampleCount: 3,
      baselineSampleCount: 11,
      baselineFallbackUsed: false,
      sourcePolicy: 'real_project_experience_first_baseline_only_for_cold_start',
    },
    quality: {
      sampleCount: 11,
      calibratedSampleCount: 11,
      packageHitRate: 1,
      missingPackageCandidateCount: 0,
      overGeneratedPackageCandidateCount: 0,
      status: 'candidate_overlay_ready',
      runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
      calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
    },
    missingPackageCandidates: [],
    overGeneratedPackageCandidates: [],
    commercialMaturity: {
      assetLevel: 'drawing_package',
      businessProfileCoverage: {
        formalBusinessProfileCount: 11,
        packagePoolCount: 25,
        status: 'ready',
      },
      selfIteration: {
        updateMode: 'real_project_experience_replay',
        networkPolicy: 'disabled_for_drawing_package_seed',
        mutationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
        runtimeConsumptionPolicy: 'candidate_overlay_after_project_replay_gate',
      },
    },
  })),
  loadLatestDrawingPackageExperienceIterationRun: vi.fn(async () => ({
    runCode: 'drawing_package_experience_iteration_run',
    runId: 'drawing-package-experience:2026-06-07:1',
    seedVersion: 'v1.4.22.6',
    asOfDate: '2026-06-07',
    publicationStatus: 'candidate_overlay_published',
    updateMode: 'real_project_experience_replay',
    runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
    recordVisibilityPolicy: 'backend_admin_audit_only',
    promotedOverlay: {
      additionalPackageCodes: ['pkg-clean-room-specialty'],
      qualityGate: {
        status: 'passed',
      },
    },
  })),
  publishDrawingPackageExperienceIterationRunFromProjectExperience: vi.fn(async () => ({
    runCode: 'drawing_package_experience_iteration_run',
    runId: 'drawing-package-experience:2026-06-07:manual',
    seedVersion: 'v1.4.22.6',
    asOfDate: '2026-06-07',
    publicationStatus: 'candidate_overlay_published',
    updateMode: 'real_project_experience_replay',
    runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
    recordVisibilityPolicy: 'backend_admin_audit_only',
    promotedOverlay: {
      additionalPackageCodes: ['pkg-clean-room-specialty'],
      qualityGate: {
        status: 'passed',
      },
    },
  })),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: state.globalRole }
    next()
  }),
}))

vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: vi.fn(async () => (
    state.membershipRole ? { role: state.membershipRole } : null
  )),
  isCompanyAdminRole: vi.fn((role: unknown) => role === 'company_admin' || role === 'super_admin'),
}))

vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))

vi.mock('../services/drawingPackageExperienceIterationService.js', async () => {
  const actual = await vi.importActual<any>('../services/drawingPackageExperienceIterationService.js')
  return {
    ...actual,
    buildDrawingPackageExperienceIterationReportFromProjectExperience: state.buildDrawingPackageExperienceIterationReportFromProjectExperience,
    loadLatestDrawingPackageExperienceIterationRun: state.loadLatestDrawingPackageExperienceIterationRun,
    publishDrawingPackageExperienceIterationRunFromProjectExperience: state.publishDrawingPackageExperienceIterationRunFromProjectExperience,
  }
})

const { default: router } = await import('../routes/drawing-package-template-governance.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin/drawing-package-template-governance', router)
  return app
}

describe('drawing package template governance route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.globalRole = 'company_admin'
    state.membershipRole = 'company_admin'
  })

  it('returns experience iteration report to company admins only', async () => {
    const response = await supertest(buildApp())
      .get('/api/admin/drawing-package-template-governance/experience-iteration/report')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      reportCode: 'drawing_package_experience_iteration_report',
      frontendExposurePolicy: 'backend_admin_api_only',
      sampleSourceSummary: {
        realProjectSampleCount: 3,
        baselineFallbackUsed: false,
      },
      commercialMaturity: {
        selfIteration: {
          updateMode: 'real_project_experience_replay',
          networkPolicy: 'disabled_for_drawing_package_seed',
        },
      },
    })
    expect(state.buildDrawingPackageExperienceIterationReportFromProjectExperience).toHaveBeenCalledWith({
      minimumCalibratedSamples: undefined,
    })
  })

  it('returns the latest persisted experience iteration run to company admins only', async () => {
    const response = await supertest(buildApp())
      .get('/api/admin/drawing-package-template-governance/experience-iteration/latest-run')
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      runCode: 'drawing_package_experience_iteration_run',
      publicationStatus: 'candidate_overlay_published',
      runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
      recordVisibilityPolicy: 'backend_admin_audit_only',
      promotedOverlay: {
        additionalPackageCodes: ['pkg-clean-room-specialty'],
      },
    })
    expect(state.loadLatestDrawingPackageExperienceIterationRun).toHaveBeenCalled()
  })

  it('runs and persists drawing package experience iteration from real project facts for admins', async () => {
    const response = await supertest(buildApp())
      .post('/api/admin/drawing-package-template-governance/experience-iteration/run')
      .send({ asOfDate: '2026-06-07', minimumCalibratedSamples: 2 })
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      runCode: 'drawing_package_experience_iteration_run',
      publicationStatus: 'candidate_overlay_published',
      updateMode: 'real_project_experience_replay',
    })
    expect(state.publishDrawingPackageExperienceIterationRunFromProjectExperience).toHaveBeenCalledWith({
      asOfDate: '2026-06-07',
      minimumCalibratedSamples: 2,
    })
  })

  it('blocks non-admin users from drawing package seed governance diagnostics', async () => {
    state.globalRole = 'member'
    state.membershipRole = 'project_member'

    const response = await supertest(buildApp())
      .get('/api/admin/drawing-package-template-governance/experience-iteration/report')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(state.buildDrawingPackageExperienceIterationReportFromProjectExperience).not.toHaveBeenCalled()
    expect(state.loadLatestDrawingPackageExperienceIterationRun).not.toHaveBeenCalled()
    expect(state.publishDrawingPackageExperienceIterationRunFromProjectExperience).not.toHaveBeenCalled()
  })

  it('does not trust JWT globalRole when current company membership is not admin', async () => {
    state.globalRole = 'company_admin'
    state.membershipRole = 'project_member'

    const response = await supertest(buildApp())
      .get('/api/admin/drawing-package-template-governance/experience-iteration/report')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
    expect(state.buildDrawingPackageExperienceIterationReportFromProjectExperience).not.toHaveBeenCalled()
    expect(state.loadLatestDrawingPackageExperienceIterationRun).not.toHaveBeenCalled()
    expect(state.publishDrawingPackageExperienceIterationRunFromProjectExperience).not.toHaveBeenCalled()
  })
})
