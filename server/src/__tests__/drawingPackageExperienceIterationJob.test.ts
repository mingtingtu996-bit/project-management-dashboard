import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  publishDrawingPackageExperienceIterationRunFromProjectExperience: vi.fn(async () => ({
    runCode: 'drawing_package_experience_iteration_run',
    runId: 'drawing-package-experience:2026-06-07:job',
    seedVersion: 'v1.4.22.6',
    asOfDate: '2026-06-07',
    publicationStatus: 'candidate_overlay_published',
    updateMode: 'real_project_experience_replay',
    runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
    recordVisibilityPolicy: 'backend_admin_audit_only',
    promotedOverlay: {
      additionalPackageCodes: ['pkg-clean-room-specialty'],
    },
  })),
}))

vi.mock('../services/drawingPackageExperienceIterationService.js', async () => {
  const actual = await vi.importActual<any>('../services/drawingPackageExperienceIterationService.js')
  return {
    ...actual,
    publishDrawingPackageExperienceIterationRunFromProjectExperience:
      state.publishDrawingPackageExperienceIterationRunFromProjectExperience,
  }
})

const { DrawingPackageExperienceIterationJob } = await import('../jobs/drawingPackageExperienceIterationJob.js')

describe('drawing package experience iteration job', () => {
  it('is wired into the scheduler, admin jobs route, and audit persistence table', () => {
    const schedulerSource = readFileSync(new URL('../scheduler.ts', import.meta.url), 'utf8')
    const jobsRouteSource = readFileSync(new URL('../routes/jobs.ts', import.meta.url), 'utf8')
    const jobSource = readFileSync(new URL('../jobs/drawingPackageExperienceIterationJob.ts', import.meta.url), 'utf8')
    const migrationSource = readFileSync(
      new URL('../../migrations/187_drawing_package_experience_iteration_runs.sql', import.meta.url),
      'utf8',
    )

    expect(schedulerSource).toContain(
      "import { drawingPackageExperienceIterationJob } from './jobs/drawingPackageExperienceIterationJob.js'",
    )
    expect(schedulerSource).toContain('drawingPackageExperienceIterationJob.start()')
    expect(schedulerSource).toContain('drawingPackageExperienceIterationJob.stop()')

    expect(jobsRouteSource).toContain("name: 'drawingPackageExperienceIterationJob'")
    expect(jobsRouteSource).toContain("schedule: '45 5 * * *'")
    expect(jobsRouteSource).toContain("case 'drawingPackageExperienceIterationJob'")
    expect(jobsRouteSource).toContain('result: await drawingPackageExperienceIterationJob.executeNow()')

    expect(jobSource).toContain('publishDrawingPackageExperienceIterationRunFromProjectExperience')
    expect(jobSource).toContain('real_project_experience_replay')
    expect(jobSource).not.toContain('fetch(')
    expect(jobSource).not.toContain('gov.cn')

    expect(migrationSource).toContain('CREATE TABLE IF NOT EXISTS public.drawing_package_experience_iteration_runs')
    expect(migrationSource).toContain('run_id TEXT PRIMARY KEY')
    expect(migrationSource).toContain("record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_audit_only'")
    expect(migrationSource).toContain("mutation_policy TEXT NOT NULL DEFAULT 'no_silent_seed_mutation'")
  })

  it('runs drawing package experience iteration without network or manual review input', async () => {
    const job = new DrawingPackageExperienceIterationJob()

    const result = await job.executeNow('2026-06-07')

    expect(result).toMatchObject({
      runCode: 'drawing_package_experience_iteration_run',
      publicationStatus: 'candidate_overlay_published',
      updateMode: 'real_project_experience_replay',
      runtimePreviewPolicy: 'qualified_overlay_available_for_explicit_preview_only',
    })
    expect(state.publishDrawingPackageExperienceIterationRunFromProjectExperience).toHaveBeenCalledWith({
      asOfDate: '2026-06-07',
    })
  })
})
