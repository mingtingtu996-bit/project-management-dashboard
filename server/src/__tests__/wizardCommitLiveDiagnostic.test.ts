import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  buildWizardCommitLiveDiagnosticReport,
  parseWizardCommitLiveDiagnosticOptionsFromArgs,
  shouldFailWizardCommitLiveDiagnosticReport,
} from '../scripts/diagnose-wizard-commit-live.js'
import type {
  WizardArtifactInventoryRequest,
} from '../scripts/diagnose-wizard-commit-live.js'

describe('wizard commit live diagnostic', () => {
  const wizardPayload = {
    step: 6,
    mode: 'new',
    projectName: 'Disposable L09 School Project',
    location: 'Shanghai',
    totalAreaM2: 8000,
    plannedStartDate: '2026-06-21',
    plannedEndDate: '2026-07-21',
    detailLevel: 'overview',
    businessType: 'school',
    methodVariantCodes: [],
    projectFeatures: {},
    scopeTree: [
      {
        id: 'building-1',
        type: 'building',
        name: '教学楼',
        metadata: {
          functionalUsage: '教学楼',
          standardFloorCount: 3,
          childrenComplete: true,
        },
        children: [
          {
            id: 'floor-1',
            type: 'floor',
            name: '1F',
            metadata: {
              floorNumber: 1,
            },
            children: [],
          },
        ],
      },
      {
        id: 'outdoor-site-1',
        type: 'physical_zone',
        name: '室外总平',
        metadata: {
          physicalSpaceKind: 'outdoor_site',
          physicalCategory: 'outdoor_site_plan',
        },
        children: [],
      },
    ],
  }
  const diagnosticRunId = 'c18-l09-2026-06-21T00-01-06-000Z'

  function correlatedFailureInjectionRun(
    key: 'engineering' | 'tasks' | 'dependencies',
    injectedStage: 'engineering_objects' | 'tasks' | 'dependencies_acceptance_plans',
    batchId = `failure-batch-${key}`,
  ) {
    return {
      runId: `run-${key}`,
      attemptId: `attempt-${key}`,
      diagnosticRunId,
      requestId: `request-${key}`,
      routeInvocationId: `route-${key}`,
      injectedStage,
      wizardGenerationBatchId: batchId,
      failureInjected: true,
      cleanupReadback: {
        wizardGenerationBatchId: batchId,
        tasksRemaining: 0,
        dependenciesRemaining: 0,
        acceptancePlansRemaining: 0,
        engineeringObjectsRemaining: 0,
        projectStatus: 'wizard_drafting',
        wizardGenerationState: 'failed_compensated',
      },
    }
  }

  function correlatedFailureInjectionEvidence(overrides: Record<string, unknown> = {}) {
    return {
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      projectId: 'project-live',
      diagnosticRunId,
      runs: [
        correlatedFailureInjectionRun('engineering', 'engineering_objects'),
        correlatedFailureInjectionRun('tasks', 'tasks'),
        correlatedFailureInjectionRun('dependencies', 'dependencies_acceptance_plans'),
      ],
      ...overrides,
    }
  }

  it('blocks by default so the diagnostic cannot commit wizard projects accidentally', async () => {
    const requestCommit = vi.fn()

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:00:00.000+08:00'),
      requestCommit,
    })

    expect(report.reportCode).toBe('c18_l09_wizard_commit_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowWrite).toBe(false)
    expect(report.projectId).toBeNull()
    expect(report.liveEvidenceChecklist).toEqual([
      'Run against a real DB/API environment using a disposable wizard draft project.',
      'Send two concurrent commit requests for the same project and require one reentrant conflict.',
      'Read back generated tasks and wizard metadata after the race.',
      'Run a separate step-N failure-injection probe in the same FK/RLS/trigger environment.',
      'Archive both the double-commit JSON and the failure-injection cleanup JSON before closing C-18.L09.',
    ])
    expect(report.failureInjectionEvidenceChecklist).toEqual([
      'Inject a failure after engineering objects have started materializing.',
      'Inject a failure after generated tasks have started writing.',
      'Inject a failure after dependencies or acceptance plans have started writing.',
      'Read back tasks, dependencies, acceptance plans, engineering objects, and project status after each injected failure.',
      'Prove partial artifacts are physically deleted and the project does not remain falsely active.',
    ])
    expect(report.runtimeEvidenceGap).toEqual({
      missingAllowWrite: true,
      missingBaseUrl: true,
      missingAuthToken: true,
      missingProjectId: true,
      missingPayload: true,
      missingLiveDoubleCommitRun: true,
      missingArtifactInventoryReadback: true,
      missingFailureInjectionRun: true,
      missingCleanupReadback: true,
      missingDisposableDraftCleanup: false,
      missingArchivedJson: true,
    })
    expect(requestCommit).not.toHaveBeenCalled()
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails without failure-injection cleanup evidence even when the double-commit probe passes', async () => {
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      requestCommit,
      requestArtifactInventory,
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json')
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingAllowWrite: false,
      missingBaseUrl: false,
      missingAuthToken: false,
      missingProjectId: false,
      missingPayload: false,
      missingLiveDoubleCommitRun: false,
      missingArtifactInventoryReadback: false,
      missingFailureInjectionRun: true,
      missingCleanupReadback: true,
      missingArchivedJson: false,
    }))
    expect(report.checks.concurrentCommit).toEqual(expect.objectContaining({
      attemptCount: 2,
      successCount: 1,
      reentrantConflictCount: 1,
      unexpectedFailureCount: 0,
      status: 'fail',
      failureInjectionEvidenceRequired: true,
    }))
    expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
      status: 'pass',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
    }))
    expect(report.checks.concurrentCommit.reason).toContain('failure-injection cleanup evidence')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when failure-injection cleanup evidence is only a summary without per-stage runs', async () => {
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:05.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        projectId: 'project-live',
        injectedStages: ['engineering_objects', 'tasks', 'dependencies_acceptance_plans'],
        cleanupReadback: {
          tasksRemaining: 0,
          dependenciesRemaining: 0,
          acceptancePlansRemaining: 0,
          engineeringObjectsRemaining: 0,
          projectStatus: 'wizard_drafting',
          wizardGenerationState: 'failed_compensated',
        },
      },
      requestCommit,
      requestArtifactInventory,
    })

    expect(report.status).toBe('fail')
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      projectIdMatches: true,
      injectedEngineeringObjects: true,
      injectedTasks: true,
      injectedDependenciesOrAcceptancePlans: true,
      cleanupReadbackPresent: true,
      partialArtifactsDeleted: true,
      projectNotFalselyActive: true,
      perStageRunCount: 0,
      cleanupBatchIdEvidencePresent: false,
      cleanupBatchIdsConsistent: false,
      missingSignals: expect.arrayContaining([
        'diagnostic_run_id',
        'per_stage_run_correlation',
        'per_stage_failure_runs',
        'cleanup_batch_id_evidence',
      ]),
    }))
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingLiveDoubleCommitRun: false,
      missingArtifactInventoryReadback: false,
      missingArchivedJson: false,
    }))
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes only when double commit, artifact readback, and per-stage failure-injection cleanup evidence all pass', async () => {
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: correlatedFailureInjectionEvidence(),
      requestCommit,
      requestArtifactInventory,
      diagnosticRunId,
    })

    expect(report.status).toBe('pass')
    expect(report.failureInjectionEvidenceFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json')
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      missingEvidenceMetadata: false,
      status: 'pass',
      projectIdMatches: true,
      diagnosticRunIdPresent: true,
      diagnosticRunIdMatches: true,
      perStageRunCorrelationPresent: true,
      injectedEngineeringObjects: true,
      injectedTasks: true,
      injectedDependenciesOrAcceptancePlans: true,
      cleanupReadbackPresent: true,
      partialArtifactsDeleted: true,
      projectNotFalselyActive: true,
      cleanupBatchIdEvidencePresent: true,
      cleanupBatchIdsConsistent: true,
      perStageRunCount: 3,
      missingSignals: [],
    }))
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingFailureInjectionRun: false,
      missingCleanupReadback: false,
      missingLiveDoubleCommitRun: false,
      missingArtifactInventoryReadback: false,
      missingArchivedJson: false,
    }))
    expect(requestCommit).toHaveBeenCalledTimes(2)
    expect(requestCommit.mock.calls[0][0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
    })
    expect(requestArtifactInventory).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
    })
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(false)
  })

  it('creates and cleans up a disposable wizard draft before allowing L09 to close', async () => {
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: 'project-disposable',
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-disposable' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-disposable',
      wizardGenerationState: 'completed',
      generatedTaskCount: 55,
      generatedPrimaryScheduleTaskCount: 45,
      generatedPrimaryScheduleExecutableTaskCount: 43,
      generatedPrimaryScheduleRecordOnlyTaskCount: 2,
      generatedNonPrimaryTaskCount: 10,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      candidateBaselinesRemaining: 1,
      candidateBaselineDraftCount: 1,
      candidateBaselineIds: ['baseline-1'],
      candidateBaselineStatuses: ['draft'],
      candidateBaselineItemCount: 45,
      candidateBaselineMappedItemCount: 45,
      candidateBaselineUnmappedItemCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.100+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      companyId: 'company-staging',
      createDisposableDraft: true,
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: correlatedFailureInjectionEvidence({ projectId: 'project-disposable' }),
      requestCommit,
      requestArtifactInventory,
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      diagnosticRunId,
    })

    expect(report.status).toBe('pass')
    expect(report.createdDisposableDraft).toBe(true)
    expect(report.projectId).toBe('project-disposable')
    expect(report.disposableProjectCleanup).toEqual(expect.objectContaining({
      status: 'pass',
      projectStillReadable: false,
    }))
    expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
      generatedTaskCount: 55,
      generatedPrimaryScheduleTaskCount: 45,
      generatedPrimaryScheduleExecutableTaskCount: 43,
      generatedPrimaryScheduleRecordOnlyTaskCount: 2,
      generatedNonPrimaryTaskCount: 10,
      candidateBaselineItemCount: 45,
      candidateBaselineMappedItemCount: 45,
      status: 'pass',
    }))
    expect(createDisposableWizardDraft).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      companyId: 'company-staging',
      wizardPayload,
      now: new Date('2026-06-21T00:01:06.100Z'),
      diagnosticRunId,
    })
    expect(requestCommit.mock.calls[0][0]).toMatchObject({
      projectId: 'project-disposable',
    })
    expect(cleanupDisposableWizardProject).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-disposable',
    })
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingDisposableDraftCleanup: false,
    }))
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(false)
  })

  it('waits for completed artifact inventory after a timed-out commit before cleaning a disposable draft', async () => {
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: 'project-disposable',
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestCommit = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('The operation was aborted due to timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      }))
      .mockResolvedValueOnce({
        httpStatus: 409,
        success: false,
        errorCode: 'WIZARD_GENERATION_NOT_REENTRANT',
        projectId: null,
      })
    const requestArtifactInventory = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        projectId: 'project-disposable',
        wizardGenerationState: 'running',
        generatedTaskCount: 0,
        generationBatchIds: [],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        projectId: 'project-disposable',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.110+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      createDisposableDraft: true,
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: correlatedFailureInjectionEvidence({ projectId: 'project-disposable' }),
      requestCommit,
      requestArtifactInventory,
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      diagnosticRunId,
      artifactInventoryPollAttempts: 2,
      artifactInventoryPollIntervalMs: 0,
    } as any)

    expect(report.status).toBe('pass')
    expect(requestArtifactInventory).toHaveBeenCalledTimes(2)
    expect(report.checks.concurrentCommit.successCount).toBe(1)
    expect(report.checks.concurrentCommit.unexpectedFailureCount).toBe(0)
    expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
      status: 'pass',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
    }))
    expect(report.checks.concurrentCommit.responses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        success: true,
        projectId: 'project-disposable',
        inferredFromArtifactInventory: true,
      }),
    ]))
    expect(cleanupDisposableWizardProject).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-disposable',
    })
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(false)
  })

  it('can generate archived per-stage failure-injection evidence from disposable wizard drafts', async () => {
    const createdProjectIds = [
      'project-disposable',
      'failure-project-engineering',
      'failure-project-tasks',
      'failure-project-dependencies',
    ]
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: createdProjectIds.shift() ?? null,
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestFailureInjectionCommit = vi.fn(async (request: any) => ({
      httpStatus: 500,
      success: false,
      errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
      errorMessage: `Injected ${request.failureStage}`,
      projectId: request.projectId,
      requestId: `request-${request.failureStage}`,
      routeInvocationId: `route-${request.failureStage}`,
    }))
    const requestFailureInjectionCleanupReadback = vi.fn(async (request: any) => ({
      httpStatus: 200,
      success: true,
      projectId: request.projectId,
      wizardGenerationBatchId: `batch-${request.failureStage}`,
      tasksRemaining: 0,
      dependenciesRemaining: 0,
      acceptancePlansRemaining: 0,
      engineeringObjectsRemaining: 0,
      projectStatus: 'wizard_drafting',
      wizardGenerationState: 'failed',
      errorCode: null,
    }))
    const writeFailureInjectionEvidence = vi.fn()
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-disposable' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-disposable',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.150+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      createDisposableDraft: true,
      createFailureInjectionEvidence: true,
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      requestCommit,
      requestArtifactInventory,
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      requestFailureInjectionCommit,
      requestFailureInjectionCleanupReadback,
      writeFailureInjectionEvidence,
      diagnosticRunId,
    })

    expect(report.status).toBe('pass')
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      projectIdMatches: true,
      diagnosticRunIdMatches: true,
      perStageRunCount: 3,
      cleanupBatchIdEvidencePresent: true,
      cleanupBatchIdsConsistent: true,
      missingSignals: [],
    }))
    expect(createDisposableWizardDraft).toHaveBeenCalledTimes(4)
    expect(requestFailureInjectionCommit).toHaveBeenCalledTimes(3)
    expect(requestFailureInjectionCleanupReadback).toHaveBeenCalledTimes(3)
    expect(cleanupDisposableWizardProject).toHaveBeenCalledTimes(4)
    expect(writeFailureInjectionEvidence).toHaveBeenCalledTimes(1)
    const evidence = writeFailureInjectionEvidence.mock.calls[0][1] as any
    expect(evidence).toEqual(expect.objectContaining({
      environment: 'live_http',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      projectId: 'project-disposable',
      diagnosticRunId,
    }))
    expect(evidence.runs.map((run: any) => run.injectedStage)).toEqual([
      'engineering_objects',
      'tasks',
      'dependencies_acceptance_plans',
    ])
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(false)
  })

  it('archives failure-injection evidence when one stage times out instead of aborting the whole diagnostic', async () => {
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: 'failure-project-tasks',
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestFailureInjectionCommit = vi.fn(async () => {
      throw Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' })
    })
    const requestFailureInjectionCleanupReadback = vi.fn(async () => ({
      httpStatus: 200,
      success: true,
      projectId: 'failure-project-tasks',
      wizardGenerationBatchId: null,
      tasksRemaining: 0,
      dependenciesRemaining: 0,
      acceptancePlansRemaining: 0,
      engineeringObjectsRemaining: 0,
      projectStatus: 'wizard_drafting',
      wizardGenerationState: 'failed',
      errorCode: null,
    }))
    const writeFailureInjectionEvidence = vi.fn()

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.200+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createFailureInjectionEvidence: true,
      failureInjectionStages: ['after_tasks'],
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      requestFailureInjectionCommit,
      requestFailureInjectionCleanupReadback,
      writeFailureInjectionEvidence,
      diagnosticRunId,
    })

    expect(report.status).toBe('fail')
    expect(writeFailureInjectionEvidence).toHaveBeenCalledTimes(1)
    const evidence = writeFailureInjectionEvidence.mock.calls[0][1] as any
    expect(evidence.runs).toHaveLength(1)
    expect(evidence.runs[0]).toEqual(expect.objectContaining({
      injectedStage: 'tasks',
      requestedFailureStage: 'after_tasks',
      failureInjected: false,
    }))
    expect(evidence.runs[0].commitResponse).toEqual(expect.objectContaining({
      httpStatus: 0,
      success: false,
      errorCode: 'REQUEST_TIMEOUT',
      errorMessage: 'Headers Timeout Error',
    }))
    expect(cleanupDisposableWizardProject).toHaveBeenCalledTimes(1)
  })

  it('waits for timed-out failure-injection stages to finish compensating before cleanup', async () => {
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: 'failure-project-tasks',
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestFailureInjectionCommit = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      })
    })
    const requestFailureInjectionCleanupReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        projectId: 'failure-project-tasks',
        wizardGenerationBatchId: 'batch-after-tasks',
        tasksRemaining: 0,
        dependenciesRemaining: 0,
        acceptancePlansRemaining: 0,
        engineeringObjectsRemaining: 8,
        projectStatus: 'wizard_drafting',
        wizardGenerationState: 'running',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        projectId: 'failure-project-tasks',
        wizardGenerationBatchId: 'batch-after-tasks',
        tasksRemaining: 0,
        dependenciesRemaining: 0,
        acceptancePlansRemaining: 0,
        engineeringObjectsRemaining: 0,
        projectStatus: 'wizard_drafting',
        wizardGenerationState: 'failed',
        errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
      })
    const writeFailureInjectionEvidence = vi.fn()

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.225+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createFailureInjectionEvidence: true,
      failureInjectionStages: ['after_tasks'],
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      requestFailureInjectionCommit,
      requestFailureInjectionCleanupReadback,
      writeFailureInjectionEvidence,
      diagnosticRunId,
      failureInjectionReadbackPollAttempts: 2,
      failureInjectionReadbackPollIntervalMs: 0,
    } as any)

    const evidence = writeFailureInjectionEvidence.mock.calls[0][1] as any
    expect(requestFailureInjectionCleanupReadback).toHaveBeenCalledTimes(2)
    expect(cleanupDisposableWizardProject).toHaveBeenCalledTimes(1)
    expect(evidence.runs[0]).toEqual(expect.objectContaining({
      injectedStage: 'tasks',
      failureInjected: true,
      wizardGenerationBatchId: 'batch-after-tasks',
    }))
    expect(evidence.runs[0].cleanupReadback).toEqual(expect.objectContaining({
      wizardGenerationState: 'failed',
      engineeringObjectsRemaining: 0,
      errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
    }))
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      cleanupReadbackPresent: true,
      partialArtifactsDeleted: true,
      projectNotFalselyActive: true,
    }))
  })

  it('retries transient failure-injection cleanup readback errors before cleanup', async () => {
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: 'failure-project-dependencies',
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestFailureInjectionCommit = vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        code: 'UND_ERR_HEADERS_TIMEOUT',
      })
    })
    const requestFailureInjectionCleanupReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 500,
        success: false,
        projectId: 'failure-project-dependencies',
        wizardGenerationBatchId: null,
        tasksRemaining: 0,
        dependenciesRemaining: 0,
        acceptancePlansRemaining: 0,
        engineeringObjectsRemaining: 0,
        projectStatus: null,
        wizardGenerationState: null,
        errorCode: 'AUTH_ERROR',
        errorMessage: '认证过程中发生错误',
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        projectId: 'failure-project-dependencies',
        wizardGenerationBatchId: 'batch-after-dependencies',
        tasksRemaining: 0,
        dependenciesRemaining: 0,
        acceptancePlansRemaining: 0,
        engineeringObjectsRemaining: 0,
        projectStatus: 'wizard_drafting',
        wizardGenerationState: 'failed',
        errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
      })
    const writeFailureInjectionEvidence = vi.fn()

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.250+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createFailureInjectionEvidence: true,
      failureInjectionStages: ['after_dependencies_or_acceptance_plans'],
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      requestFailureInjectionCommit,
      requestFailureInjectionCleanupReadback,
      writeFailureInjectionEvidence,
      diagnosticRunId,
      failureInjectionReadbackPollAttempts: 2,
      failureInjectionReadbackPollIntervalMs: 0,
    } as any)

    const evidence = writeFailureInjectionEvidence.mock.calls[0][1] as any
    expect(requestFailureInjectionCleanupReadback).toHaveBeenCalledTimes(2)
    expect(cleanupDisposableWizardProject).toHaveBeenCalledTimes(1)
    expect(evidence.runs[0]).toEqual(expect.objectContaining({
      injectedStage: 'dependencies_acceptance_plans',
      failureInjected: true,
      wizardGenerationBatchId: 'batch-after-dependencies',
    }))
    expect(evidence.runs[0].cleanupReadback).toEqual(expect.objectContaining({
      httpStatus: 200,
      wizardGenerationState: 'failed',
      errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
    }))
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      injectedDependenciesOrAcceptancePlans: true,
      partialArtifactsDeleted: true,
      projectNotFalselyActive: true,
    }))
  })

  it('uses lightweight generated artifact inventory endpoint instead of project export for post-commit readback', async () => {
    const fetchUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const href = String(url)
      fetchUrls.push(href)

      if (href.includes('/api/projects/project-live/wizard/artifact-inventory')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            projectId: 'project-live',
            wizardGenerationState: 'completed',
            generatedTaskCount: 12,
            generationBatchIds: ['batch-1'],
            duplicateGeneratedTaskSignatureCount: 0,
            candidateBaselinesRemaining: 1,
            candidateBaselineDraftCount: 1,
            candidateBaselineIds: ['baseline-1'],
            candidateBaselineStatuses: ['draft'],
            candidateBaselineItemCount: 12,
            candidateBaselineMappedItemCount: 12,
            candidateBaselineUnmappedItemCount: 0,
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      if (href.includes('/api/projects/project-live/export')) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'EXPORT_TOO_HEAVY_FOR_DIAGNOSTIC' },
        }), { status: 500, headers: { 'content-type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: false, error: { code: 'UNEXPECTED_URL' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }))

    try {
      const report = await buildWizardCommitLiveDiagnosticReport({
        now: new Date('2026-06-21T08:01:06.120+08:00'),
        allowWrite: true,
        baseUrl: 'http://127.0.0.1:3001',
        authToken: 'token',
        projectId: 'project-live',
        wizardPayload,
        outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
        failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        failureInjectionEvidence: correlatedFailureInjectionEvidence({ projectId: 'project-live' }),
        requestCommit: vi.fn()
          .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
          .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
        diagnosticRunId,
      })

      expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
        status: 'pass',
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
      }))
      expect(fetchUrls.some((href) => href.includes('/api/projects/project-live/wizard/artifact-inventory'))).toBe(true)
      expect(fetchUrls.some((href) => href.includes('/api/projects/project-live/export'))).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses lightweight generated artifact readback for failure-injection cleanup instead of project export or acceptance plan route', async () => {
    const fetchUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const href = String(url)
      fetchUrls.push(href)

      if (href.includes('/api/projects/failure-project-tasks/wizard/artifact-inventory')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            projectId: 'failure-project-tasks',
            wizardGenerationBatchId: 'batch-after-tasks',
            wizardGenerationState: 'failed_compensated',
            projectStatus: 'wizard_drafting',
            generatedTaskCount: 0,
            dependenciesRemaining: 0,
            acceptancePlansRemaining: 0,
            engineeringObjectsRemaining: 0,
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      if (href.includes('/api/engineering-objects')) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (href.includes('/api/acceptance-plans')) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'ACCEPTANCE_SCHEMA_DRIFT' },
        }), { status: 500, headers: { 'content-type': 'application/json' } })
      }

      if (href.includes('/api/projects/failure-project-tasks/export')) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'EXPORT_TOO_HEAVY_FOR_DIAGNOSTIC' },
        }), { status: 500, headers: { 'content-type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: false, error: { code: 'UNEXPECTED_URL' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }))

    try {
      const report = await buildWizardCommitLiveDiagnosticReport({
        now: new Date('2026-06-21T08:01:06.220+08:00'),
        allowWrite: true,
        baseUrl: 'http://127.0.0.1:3001',
        authToken: 'token',
        projectId: 'project-live',
        createFailureInjectionEvidence: true,
        failureInjectionStages: ['after_tasks'],
        wizardPayload,
        outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
        failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        requestCommit: vi.fn()
          .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
          .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
        requestArtifactInventory: vi.fn(async () => ({
          httpStatus: 200,
          success: true,
          projectId: 'project-live',
          wizardGenerationState: 'completed',
          generatedTaskCount: 12,
          generationBatchIds: ['batch-1'],
          duplicateGeneratedTaskSignatureCount: 0,
          errorCode: null,
        })),
        createDisposableWizardDraft: vi.fn(async () => ({
          httpStatus: 201,
          success: true,
          projectId: 'failure-project-tasks',
          errorCode: null,
        })),
        cleanupDisposableWizardProject: vi.fn(async () => ({
          status: 'pass' as const,
          rollback: { httpStatus: 200, success: true, errorCode: null },
          deleteDraft: { httpStatus: 204, success: true, errorCode: null },
          projectStillReadable: false,
          errorCode: null,
          errorMessage: null,
        })),
        requestFailureInjectionCommit: vi.fn(async (request: any) => ({
          httpStatus: 500,
          success: false,
          errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
          errorMessage: `Injected ${request.failureStage}`,
          projectId: request.projectId,
          requestId: `request-${request.failureStage}`,
          routeInvocationId: `route-${request.failureStage}`,
        })),
        writeFailureInjectionEvidence: vi.fn(),
        diagnosticRunId,
      })

      expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
        status: 'fail',
        cleanupReadbackPresent: true,
        partialArtifactsDeleted: true,
        projectNotFalselyActive: true,
      }))
      expect(report.failureInjectionEvidenceAssessment.missingSignals).toEqual(expect.arrayContaining([
        'injected_engineering_objects',
        'injected_dependencies_or_acceptance_plans',
      ]))
      expect(fetchUrls.some((href) => href.includes('/api/projects/failure-project-tasks/wizard/artifact-inventory'))).toBe(true)
      expect(fetchUrls.some((href) => href.includes('/api/projects/failure-project-tasks/export'))).toBe(false)
      expect(fetchUrls.some((href) => href.includes('/api/acceptance-plans'))).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses lightweight artifact inventory readback for disposable draft cleanup instead of project export', async () => {
    const fetchUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url)
      fetchUrls.push(`${init?.method ?? 'GET'} ${href}`)

      if (href.includes('/api/projects/project-live/wizard/rollback')) {
        return new Response(JSON.stringify({ success: true, data: { id: 'project-live', rolledBack: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (href.includes('/api/projects/project-live/wizard/draft')) {
        return new Response(null, { status: 204 })
      }

      if (href.includes('/api/projects/project-live/wizard/artifact-inventory')) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'PROJECT_NOT_FOUND' },
        }), { status: 404, headers: { 'content-type': 'application/json' } })
      }

      if (href.includes('/api/projects/project-live/export')) {
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'EXPORT_TOO_HEAVY_FOR_DIAGNOSTIC' },
        }), { status: 500, headers: { 'content-type': 'application/json' } })
      }

      return new Response(JSON.stringify({ success: false, error: { code: 'UNEXPECTED_URL' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }))

    try {
      const report = await buildWizardCommitLiveDiagnosticReport({
        now: new Date('2026-06-21T08:01:06.260+08:00'),
        allowWrite: true,
        baseUrl: 'http://127.0.0.1:3001',
        authToken: 'token',
        createDisposableDraft: true,
        wizardPayload,
        outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
        failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        failureInjectionEvidence: correlatedFailureInjectionEvidence({ projectId: 'project-live' }),
        createDisposableWizardDraft: vi.fn(async () => ({
          httpStatus: 201,
          success: true,
          projectId: 'project-live',
          errorCode: null,
        })),
        requestCommit: vi.fn()
          .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
          .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
        requestArtifactInventory: vi.fn(async () => ({
          httpStatus: 200,
          success: true,
          projectId: 'project-live',
          wizardGenerationState: 'completed',
          generatedTaskCount: 12,
          generationBatchIds: ['batch-1'],
          duplicateGeneratedTaskSignatureCount: 0,
          errorCode: null,
        })),
        diagnosticRunId,
      })

      expect(report.status).toBe('pass')
      expect(report.disposableProjectCleanup).toEqual(expect.objectContaining({
        status: 'pass',
        projectStillReadable: false,
      }))
      expect(fetchUrls.some((href) => href.includes('/api/projects/project-live/wizard/artifact-inventory'))).toBe(true)
      expect(fetchUrls.some((href) => href.includes('/api/projects/project-live/export'))).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('can limit generated failure-injection evidence to one requested stage', async () => {
    const createDisposableWizardDraft = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      projectId: 'failure-project-tasks',
      errorCode: null,
    }))
    const cleanupDisposableWizardProject = vi.fn(async () => ({
      status: 'pass' as const,
      rollback: { httpStatus: 200, success: true, errorCode: null },
      deleteDraft: { httpStatus: 204, success: true, errorCode: null },
      projectStillReadable: false,
      errorCode: null,
      errorMessage: null,
    }))
    const requestFailureInjectionCommit = vi.fn(async (request: any) => ({
      httpStatus: 500,
      success: false,
      errorCode: 'WIZARD_DIAGNOSTIC_FAILURE_INJECTED',
      errorMessage: `Injected ${request.failureStage}`,
      projectId: request.projectId,
    }))
    const requestFailureInjectionCleanupReadback = vi.fn(async (request: any) => ({
      httpStatus: 200,
      success: true,
      projectId: request.projectId,
      wizardGenerationBatchId: `batch-${request.failureStage}`,
      tasksRemaining: 0,
      dependenciesRemaining: 0,
      acceptancePlansRemaining: 0,
      engineeringObjectsRemaining: 0,
      projectStatus: 'wizard_drafting',
      wizardGenerationState: 'failed',
      errorCode: null,
    }))
    const writeFailureInjectionEvidence = vi.fn()

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.250+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createFailureInjectionEvidence: true,
      failureInjectionStages: ['after_tasks'],
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
      createDisposableWizardDraft,
      cleanupDisposableWizardProject,
      requestFailureInjectionCommit,
      requestFailureInjectionCleanupReadback,
      writeFailureInjectionEvidence,
      diagnosticRunId,
    })

    expect(report.status).toBe('fail')
    expect(createDisposableWizardDraft).toHaveBeenCalledTimes(1)
    expect(requestFailureInjectionCommit).toHaveBeenCalledTimes(1)
    expect(requestFailureInjectionCommit.mock.calls[0][0]).toEqual(expect.objectContaining({
      failureStage: 'after_tasks',
    }))
    const evidence = writeFailureInjectionEvidence.mock.calls[0][1] as any
    expect(evidence.runs.map((run: any) => run.injectedStage)).toEqual(['tasks'])
    expect(report.failureInjectionEvidenceAssessment.missingSignals).toEqual(expect.arrayContaining([
      'injected_engineering_objects',
      'injected_dependencies_or_acceptance_plans',
    ]))
  })

  it('fails when per-stage failure-injection evidence is not tied to one diagnostic run', async () => {
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.250+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        projectId: 'project-live',
        runs: [
          {
            runId: 'run-engineering',
            attemptId: 'attempt-engineering',
            injectedStage: 'engineering_objects',
            wizardGenerationBatchId: 'failure-batch-engineering',
            failureInjected: true,
            cleanupReadback: {
              wizardGenerationBatchId: 'failure-batch-engineering',
              tasksRemaining: 0,
              dependenciesRemaining: 0,
              acceptancePlansRemaining: 0,
              engineeringObjectsRemaining: 0,
              projectStatus: 'wizard_drafting',
              wizardGenerationState: 'failed_compensated',
            },
          },
          {
            runId: 'run-tasks',
            attemptId: 'attempt-tasks',
            injectedStage: 'tasks',
            wizardGenerationBatchId: 'failure-batch-tasks',
            failureInjected: true,
            cleanupReadback: {
              wizardGenerationBatchId: 'failure-batch-tasks',
              tasksRemaining: 0,
              dependenciesRemaining: 0,
              acceptancePlansRemaining: 0,
              engineeringObjectsRemaining: 0,
              projectStatus: 'wizard_drafting',
              wizardGenerationState: 'failed_compensated',
            },
          },
          {
            runId: 'run-dependencies',
            attemptId: 'attempt-dependencies',
            injectedStage: 'dependencies_acceptance_plans',
            wizardGenerationBatchId: 'failure-batch-dependencies',
            failureInjected: true,
            cleanupReadback: {
              wizardGenerationBatchId: 'failure-batch-dependencies',
              tasksRemaining: 0,
              dependenciesRemaining: 0,
              acceptancePlansRemaining: 0,
              engineeringObjectsRemaining: 0,
              projectStatus: 'wizard_drafting',
              wizardGenerationState: 'failed_compensated',
            },
          },
        ],
      },
      requestCommit,
      requestArtifactInventory,
      diagnosticRunId: 'c18-l09-2026-06-21T00-01-06-250Z',
    })

    expect(report.status).toBe('fail')
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      diagnosticRunIdPresent: false,
      diagnosticRunIdMatches: false,
      perStageRunCorrelationPresent: false,
      missingSignals: expect.arrayContaining([
        'diagnostic_run_id',
        'per_stage_run_correlation',
      ]),
    }))
    expect(report.runtimeEvidenceGap.missingFailureInjectionRun).toBe(true)
    expect(report.checks.concurrentCommit.reason).toContain('failure-injection cleanup evidence')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when per-stage failure-injection cleanup is not tied to generated wizard batch ids', async () => {
    const requestCommit = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null })
    const requestArtifactInventory = vi.fn(async (_request: WizardArtifactInventoryRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      wizardGenerationState: 'completed',
      generatedTaskCount: 12,
      generationBatchIds: ['batch-1'],
      duplicateGeneratedTaskSignatureCount: 0,
      errorCode: null,
    }))

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:06.500+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup-missing-batch.json',
      failureInjectionEvidence: correlatedFailureInjectionEvidence({
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup-missing-batch.json',
        runs: [
          correlatedFailureInjectionRun('engineering', 'engineering_objects', ''),
          correlatedFailureInjectionRun('tasks', 'tasks', ''),
          correlatedFailureInjectionRun('dependencies', 'dependencies_acceptance_plans', ''),
        ],
      }),
      requestCommit,
      requestArtifactInventory,
      diagnosticRunId,
    })

    expect(report.status).toBe('fail')
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      projectIdMatches: true,
      perStageRunCount: 3,
      cleanupReadbackPresent: true,
      partialArtifactsDeleted: true,
      projectNotFalselyActive: true,
      diagnosticRunIdMatches: true,
      perStageRunCorrelationPresent: true,
      cleanupBatchIdEvidencePresent: false,
      cleanupBatchIdsConsistent: false,
      missingSignals: ['cleanup_batch_id_evidence'],
    }))
    expect(report.checks.concurrentCommit.reason).toContain('failure-injection cleanup evidence')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('blocks before mutating when all live parameters are present but no diagnostic JSON is archived', async () => {
    const requestCommit = vi.fn()
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:07.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        projectId: 'project-live',
        injectedStages: ['engineering_objects', 'tasks', 'dependencies_acceptance_plans'],
        cleanupReadback: {
          tasksRemaining: 0,
          dependenciesRemaining: 0,
          acceptancePlansRemaining: 0,
          engineeringObjectsRemaining: 0,
          projectStatus: 'wizard_drafting',
          wizardGenerationState: 'failed_compensated',
        },
      },
      requestCommit,
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
    })

    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingArchivedJson: true,
    }))
    expect(report.status).toBe('blocked')
    expect(requestCommit).not.toHaveBeenCalled()
    expect(report.checks.concurrentCommit.reason).toContain('Archive')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps the probe failed when failure-injection evidence leaves partial artifacts or a falsely active project', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:10.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-bad.json',
      failureInjectionEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-bad.json',
        projectId: 'project-live',
        injectedStages: ['engineering_objects', 'tasks'],
        cleanupReadback: {
          tasksRemaining: 1,
          dependenciesRemaining: 0,
          acceptancePlansRemaining: 0,
          engineeringObjectsRemaining: 0,
          projectStatus: 'active',
          wizardGenerationState: 'running',
        },
      },
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingFailureInjectionRun).toBe(true)
    expect(report.runtimeEvidenceGap.missingCleanupReadback).toBe(true)
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      partialArtifactsDeleted: false,
      projectNotFalselyActive: false,
      perStageRunCount: 0,
      cleanupBatchIdEvidencePresent: false,
      cleanupBatchIdsConsistent: false,
      missingSignals: expect.arrayContaining([
        'diagnostic_run_id',
        'per_stage_run_correlation',
        'injected_dependencies_or_acceptance_plans',
        'per_stage_failure_runs',
        'cleanup_batch_id_evidence',
        'partial_artifacts_deleted',
        'project_not_falsely_active',
      ]),
    }))
    expect(report.checks.concurrentCommit.reason).toContain('failure-injection cleanup evidence')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps the probe failed when failure-injection cleanup evidence lacks environment or evidence reference metadata', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:20.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-sample.json',
      failureInjectionEvidence: {
        projectId: 'project-live',
        injectedStages: ['engineering_objects', 'tasks', 'dependencies_acceptance_plans'],
        cleanupReadback: {
          tasksRemaining: 0,
          dependenciesRemaining: 0,
          acceptancePlansRemaining: 0,
          engineeringObjectsRemaining: 0,
          projectStatus: 'wizard_drafting',
          wizardGenerationState: 'failed_compensated',
        },
      },
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingFailureInjectionRun).toBe(true)
    expect(report.failureInjectionEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      projectIdMatches: true,
      partialArtifactsDeleted: true,
      projectNotFalselyActive: true,
      perStageRunCount: 0,
      cleanupBatchIdEvidencePresent: false,
      cleanupBatchIdsConsistent: false,
      missingSignals: expect.arrayContaining([
        'evidence_metadata',
        'diagnostic_run_id',
        'per_stage_run_correlation',
        'per_stage_failure_runs',
        'cleanup_batch_id_evidence',
      ]),
    }))
    expect(report.checks.concurrentCommit.reason).toContain('failure-injection cleanup evidence')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when the post-commit artifact inventory shows duplicated wizard generation output', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:30.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 24,
        generationBatchIds: ['batch-1', 'batch-2'],
        duplicateGeneratedTaskSignatureCount: 12,
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
      status: 'fail',
      generationBatchIds: ['batch-1', 'batch-2'],
      duplicateGeneratedTaskSignatureCount: 12,
    }))
    expect(report.checks.concurrentCommit.reason).toContain('post-commit artifact inventory')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when generated tasks are not backed by one fully mapped wizard candidate baseline', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:32.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: correlatedFailureInjectionEvidence({ projectId: 'project-live' }),
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        candidateBaselinesRemaining: 1,
        candidateBaselineDraftCount: 1,
        candidateBaselineIds: ['baseline-1'],
        candidateBaselineStatuses: ['draft'],
        candidateBaselineItemCount: 12,
        candidateBaselineMappedItemCount: 11,
        candidateBaselineUnmappedItemCount: 1,
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
      status: 'fail',
      candidateBaselinesRemaining: 1,
      candidateBaselineMappedItemCount: 11,
      candidateBaselineUnmappedItemCount: 1,
      reason: expect.stringContaining('wizard_candidate_baseline_items_not_fully_mapped'),
    }))
  })

  it('fails when the post-commit artifact inventory belongs to a different project', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:35.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: {
        projectId: 'project-live',
        injectedStages: ['engineering_objects', 'tasks', 'dependencies_acceptance_plans'],
        cleanupReadback: {
          tasksRemaining: 0,
          dependenciesRemaining: 0,
          acceptancePlansRemaining: 0,
          engineeringObjectsRemaining: 0,
          projectStatus: 'wizard_drafting',
          wizardGenerationState: 'failed_compensated',
        },
      },
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'other-project',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentCommit.artifactInventoryReadback).toEqual(expect.objectContaining({
      status: 'fail',
      projectId: 'other-project',
      reason: expect.stringContaining('artifact_inventory_project_id_mismatch'),
    }))
    expect(report.checks.concurrentCommit.reason).toContain('post-commit artifact inventory')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when a successful commit response belongs to a different project', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:01:40.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
        projectId: 'project-live',
        runs: [
          {
            runId: 'run-engineering',
            injectedStage: 'engineering_objects',
            failureInjected: true,
            cleanupReadback: {
              tasksRemaining: 0,
              dependenciesRemaining: 0,
              acceptancePlansRemaining: 0,
              engineeringObjectsRemaining: 0,
              projectStatus: 'wizard_drafting',
              wizardGenerationState: 'failed_compensated',
            },
          },
          {
            runId: 'run-tasks',
            injectedStage: 'tasks',
            failureInjected: true,
            cleanupReadback: {
              tasksRemaining: 0,
              dependenciesRemaining: 0,
              acceptancePlansRemaining: 0,
              engineeringObjectsRemaining: 0,
              projectStatus: 'wizard_drafting',
              wizardGenerationState: 'failed_compensated',
            },
          },
          {
            runId: 'run-dependencies',
            injectedStage: 'dependencies_acceptance_plans',
            failureInjected: true,
            cleanupReadback: {
              tasksRemaining: 0,
              dependenciesRemaining: 0,
              acceptancePlansRemaining: 0,
              engineeringObjectsRemaining: 0,
              projectStatus: 'wizard_drafting',
              wizardGenerationState: 'failed_compensated',
            },
          },
        ],
      },
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'other-project' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentCommit.successResponseProjectIdMatches).toBe(false)
    expect(report.checks.concurrentCommit.reason).toContain('successful wizard commit response project mismatch')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when both concurrent commits succeed', async () => {
    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:02:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      wizardPayload,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      requestCommit: vi.fn(async () => ({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentCommit.reason).toContain('Expected exactly one successful wizard commit')
    expect(shouldFailWizardCommitLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses live diagnostic CLI flags', () => {
    expect(parseWizardCommitLiveDiagnosticOptionsFromArgs([
      '--allow-write',
      '--base-url=http://127.0.0.1:3001',
      '--auth-token=token',
      '--company-id=company-staging',
      '--project-id=project-1',
      '--payload-file=tmp/wizard-payload.json',
      '--output-file=artifacts/test-runs/c18-l09.json',
      '--failure-injection-evidence-file=artifacts/test-runs/c18-l09-failure-injection.json',
      '--create-failure-injection-evidence',
      '--failure-injection-stage=after_tasks',
      '--request-timeout-ms=60000',
    ])).toEqual({
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      companyId: 'company-staging',
      projectId: 'project-1',
      payloadFile: 'tmp/wizard-payload.json',
      outputFile: 'artifacts/test-runs/c18-l09.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/c18-l09-failure-injection.json',
      createFailureInjectionEvidence: true,
      failureInjectionStages: ['after_tasks'],
      requestTimeoutMs: 60000,
    })
  })

  it('loads UTF-8 BOM wizard payload files produced by Windows PowerShell', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wizard-live-diagnostic-'))
    const payloadFile = join(dir, 'wizard-payload.json')
    await writeFile(payloadFile, `\uFEFF${JSON.stringify(wizardPayload)}`, 'utf8')

    const report = await buildWizardCommitLiveDiagnosticReport({
      now: new Date('2026-06-21T08:02:30.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      payloadFile,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-wizard-double-commit.json',
      failureInjectionEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l09-failure-injection-cleanup.json',
      failureInjectionEvidence: correlatedFailureInjectionEvidence(),
      requestCommit: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null, projectId: 'project-live' })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'WIZARD_GENERATION_NOT_REENTRANT', projectId: null }),
      requestArtifactInventory: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        wizardGenerationState: 'completed',
        generatedTaskCount: 12,
        generationBatchIds: ['batch-1'],
        duplicateGeneratedTaskSignatureCount: 0,
        errorCode: null,
      })),
      diagnosticRunId,
    })

    expect(report.status).toBe('pass')
    expect(report.payloadProvided).toBe(true)
  })
})
