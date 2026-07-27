import { describe, expect, it, vi } from 'vitest'

import { commitWizardProject, getWizardGenerationStatus, previewWizardProfile } from '../projectWizardApi'
import type { WizardCreateResult } from '../projectWizardApi'
import { apiGet, apiPost } from '@/lib/apiClient'

vi.mock('@/lib/apiClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

describe('projectWizardApi', () => {
  it('types post-commit generation evidence returned by the wizard commit endpoint', () => {
    const result = {
      id: 'project-1',
      projectId: 'project-1',
      status: '进行中',
      generation: {
        generationBatchId: 'batch-1',
        candidateDurationAssetPreview: {
          source: 'generated_wbs_rows_candidate_duration_asset_preview',
          evidenceLevel: 'candidate_duration_asset_preview_l1',
          mutationBoundary: 'preview_only_no_duration_runtime_write_no_task_write',
          totalCount: 1,
          riskRangeCount: 1,
          processSeasonalAdjustmentCount: 1,
          constructionCalendarCount: 1,
          writesDurationRuntime: false,
          writesTasks: false,
          items: [],
        },
        candidateNetworkEvaluation: {
          source: 'generated_wbs_row_candidate_network_cpm',
          networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
          projectedNetworkSpanDays: 10,
          previewEdgeCount: 1,
          unresolvedEdgeCount: 0,
          criticalGeneratedRowIds: ['row-1'],
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        },
        candidateAcceptancePlanPreview: {
          source: 'generated_wbs_rows_candidate_acceptance_plan_preview',
          evidenceLevel: 'candidate_acceptance_plan_preview_l1',
          mutationBoundary: 'preview_only_no_acceptance_plan_write',
          totalCount: 1,
          datedCount: 1,
          writesAcceptancePlans: false,
          items: [],
        },
        criticalPathRefresh: {
          source: 'project_wizard_post_commit_critical_path_refresh',
          status: 'refreshed',
          criticalTaskCount: 2,
          projectDurationDays: 320,
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: true,
        },
      },
    } satisfies WizardCreateResult

    expect(result.generation?.candidateDurationAssetPreview?.writesTasks).toBe(false)
    expect(result.generation?.candidateAcceptancePlanPreview?.writesAcceptancePlans).toBe(false)
    expect(result.generation?.criticalPathRefresh?.writesTaskDependencies).toBe(false)
  })

  it('uses the project-scoped side-effect-free preview endpoint when a project id is available', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ estimatedRowCount: 0 })

    await previewWizardProfile({
      step: 6,
      mode: 'new',
      projectName: 'Preview Project',
      businessType: 'general_civil',
      detailLevel: 'overview',
      scopeTree: [],
    } as any, 'project-123')

    expect(apiPost).toHaveBeenCalledWith('/api/projects/project-123/wizard/preview', expect.not.objectContaining({
      projectId: 'project-123',
    }))
  })

  it('keeps generic profile preview side-effect-free when no project id exists yet', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ estimatedRowCount: 0 })

    await previewWizardProfile({
      step: 6,
      mode: 'new',
      projectName: 'Preview Project',
      businessType: 'general_civil',
      detailLevel: 'overview',
      scopeTree: [],
    } as any)

    expect(apiPost).toHaveBeenCalledWith('/api/projects/wizard/preview', expect.not.objectContaining({
      projectId: expect.anything(),
    }))
  })

  it('submits final wizard generation as an async job and reads generation status', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ projectId: 'project-1', generation: { state: 'queued', attemptId: 'attempt-1' } })
    vi.mocked(apiGet).mockResolvedValueOnce({ projectId: 'project-1', state: 'completed', attemptId: 'attempt-1' })

    await commitWizardProject({
      step: 6,
      mode: 'new',
      projectName: 'Async Project',
      businessType: 'general_civil',
      detailLevel: 'overview',
      scopeTree: [],
    } as any, { projectId: 'project-1', companyId: 'company-1' })
    await getWizardGenerationStatus('project-1', 'attempt-1')

    expect(apiPost).toHaveBeenCalledWith('/api/projects/wizard', expect.objectContaining({
      projectId: 'project-1',
      companyId: 'company-1',
      commit: true,
      asyncGeneration: true,
    }))
    expect(apiGet).toHaveBeenCalledWith('/api/projects/project-1/wizard/generation/attempt-1')
  })

  it('normalizes typed target-feasibility facts on commit and status responses', async () => {
    const malformedFeasibility = {
      mode: 'compression_preview',
      targetEndDate: '2026-07-20',
      naturalEndDate: '2026-07-25',
      overshootDays: 999,
      overshoot: {
        value: 5,
        unit: 'calendar_day',
        calendarRef: null,
        calendarVersion: 'ISO-8601',
        timezone: 'Asia/Shanghai',
        asOf: '2026-07-20',
        availability: 'available',
      },
      recoverableDays: 999,
      recoverable: null,
      unrecoverableDays: 999,
      unrecoverable: null,
      verdict: 'compressible',
      strategies: [],
    }
    vi.mocked(apiPost).mockResolvedValueOnce({
      id: 'project-1',
      projectId: 'project-1',
      status: 'wizard_drafting',
      generation: { generationBatchId: 'batch-1', targetFeasibility: malformedFeasibility },
    })
    vi.mocked(apiGet).mockResolvedValueOnce({
      projectId: 'project-1',
      attemptId: 'attempt-1',
      state: 'completed',
      targetFeasibility: malformedFeasibility,
    })

    const committed = await commitWizardProject({
      step: 6,
      mode: 'new',
      projectName: 'Typed duration project',
      businessType: 'general_civil',
      detailLevel: 'overview',
      scopeTree: [],
    } as any)
    const status = await getWizardGenerationStatus('project-1', 'attempt-1')

    expect(committed.generation?.targetFeasibility?.overshoot).toBeNull()
    expect(status.targetFeasibility?.overshoot).toBeNull()
  })

  it('preserves explicit resource sidecar facts in wizard preview payloads', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({ estimatedRowCount: 0 })

    await previewWizardProfile({
      step: 6,
      mode: 'new',
      projectName: 'Resource Sidecar Project',
      businessType: 'general_civil',
      detailLevel: 'overview',
      scopeTree: [],
      towerCraneCount: 2,
      constructionHoistCount: 3,
    })

    expect(apiPost).toHaveBeenCalledWith('/api/projects/wizard/preview', expect.objectContaining({
      towerCraneCount: 2,
      constructionHoistCount: 3,
    }))
  })
})
