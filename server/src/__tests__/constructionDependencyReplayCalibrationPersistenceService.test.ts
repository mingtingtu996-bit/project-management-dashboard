import { describe, expect, it } from 'vitest'
import {
  listConstructionDependencySeedPromotionReviewPackageReport,
  listConstructionDependencyReplayCalibrationHistoryReport,
  persistConstructionDependencyReplayCalibrationReport,
} from '../services/constructionDependencyReplayCalibrationPersistenceService.js'
import type { ConstructionDependencyReplayCalibrationReport } from '../services/constructionDependencyReplayCalibrationService.js'

function buildReport(): ConstructionDependencyReplayCalibrationReport {
  return {
    reportCode: 'construction_dependency_replay_calibration',
    generatedAt: '2026-06-02T00:00:00.000Z',
    governancePolicy: {
      replayMode: 'report_only',
      seedWritePolicy: 'never_write_seed_from_replay',
      taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
      promotionPolicy: 'manual_seed_review_required',
    },
    summary: {
      inputDependencyCount: 3,
      matchedDependencyCount: 2,
      comparableActualDateCount: 2,
      l3MatchedDependencyCount: 1,
      l4MatchedDependencyCount: 1,
      validatedDependencyCount: 1,
      reviewRequiredDependencyCount: 1,
      conflictDependencyCount: 0,
      insufficientActualDateCount: 0,
      unmatchedSeedCount: 1,
    },
    calibrationQueues: {
      l3LagCalibrationCandidates: [
        {
          matchedLayer: 'cross_item_workflow',
          matchedSeedCode: 'l3-seed-a',
          sampleCount: 2,
          projectCount: 1,
          conflictCount: 0,
          seedLagDays: 0,
          medianObservedWaitDays: 4,
          suggestedLagDays: 4,
          queueStatus: 'manual_review_required',
          recommendation: 'review_nonzero_lag_or_condition_profile',
          promotionPolicy: 'manual review',
          sampleDependencyIds: ['dep-1'],
          projectIds: ['project-1'],
        },
      ],
      l4ConflictQuarantineCandidates: [],
      evidenceCollectionCandidates: [],
    },
    items: [],
  }
}

describe('construction dependency replay calibration persistence service', () => {
  it('persists report-only L3/L4 calibration snapshots without mutating seeds or task dependencies', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const result = await persistConstructionDependencyReplayCalibrationReport({
      projectId: 'project-1',
      runId: 'run-1',
      triggeredBy: 'scheduled_or_manual_governance_job',
      report: buildReport(),
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        return (sql.includes('RETURNING id') ? [{ id: 'report-1' }] : []) as T[]
      },
    })

    expect(result).toEqual({ persisted: true, reportId: 'report-1' })
    expect(calls[0].sql).toContain('CREATE TABLE IF NOT EXISTS public.construction_dependency_replay_calibration_reports')
    expect(calls.some((call) => call.sql.includes('INSERT INTO public.construction_dependency_replay_calibration_reports'))).toBe(true)
    expect(calls.every((call) => !/INSERT INTO\s+public\.task_dependencies/i.test(call.sql))).toBe(true)
    expect(calls.every((call) => !/UPDATE\s+public\.task_dependencies/i.test(call.sql))).toBe(true)
    expect(calls.every((call) => !/algorithm_seed_records/i.test(call.sql))).toBe(true)

    const insert = calls.find((call) => call.sql.includes('INSERT INTO public.construction_dependency_replay_calibration_reports'))
    expect(insert?.params).toEqual(expect.arrayContaining([
      'project-1',
      'run-1',
      'scheduled_or_manual_governance_job',
      'construction_dependency_replay_calibration',
      '2026-06-02T00:00:00.000Z',
      expect.objectContaining({
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
      }),
      expect.objectContaining({
        inputDependencyCount: 3,
        l3MatchedDependencyCount: 1,
      }),
      expect.objectContaining({
        l3LagCalibrationCandidates: expect.any(Array),
      }),
      expect.objectContaining({
        reportCode: 'construction_dependency_replay_calibration',
      }),
    ]))
  })

  it('aggregates persisted reports into seed-level manual review history', async () => {
    const rows = [
      {
        id: 'report-1',
        project_id: 'project-1',
        run_id: 'run-1',
        report_generated_at: '2026-06-02T00:00:00.000Z',
        created_at: '2026-06-02T00:01:00.000Z',
        governance_policy: {
          replayMode: 'report_only',
          seedWritePolicy: 'never_write_seed_from_replay',
          taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        },
        summary: { inputDependencyCount: 4 },
        calibration_queues: {
          l3LagCalibrationCandidates: [
            {
              matchedLayer: 'cross_item_workflow',
              matchedSeedCode: 'l3-seed-a',
              sampleCount: 2,
              projectCount: 1,
              conflictCount: 0,
              seedLagDays: 0,
              medianObservedWaitDays: 4,
              suggestedLagDays: 4,
              queueStatus: 'manual_review_required',
              recommendation: 'review_nonzero_lag_or_condition_profile',
              promotionPolicy: 'manual review only',
              sampleDependencyIds: ['dep-1', 'dep-2'],
              projectIds: ['project-1'],
            },
          ],
          l4ConflictQuarantineCandidates: [],
          evidenceCollectionCandidates: [],
        },
        report_payload: {},
      },
      {
        id: 'report-2',
        project_id: 'project-2',
        run_id: 'run-2',
        report_generated_at: '2026-06-03T00:00:00.000Z',
        created_at: '2026-06-03T00:01:00.000Z',
        governance_policy: {
          replayMode: 'report_only',
          seedWritePolicy: 'never_write_seed_from_replay',
          taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        },
        summary: { inputDependencyCount: 3 },
        calibration_queues: {
          l3LagCalibrationCandidates: [
            {
              matchedLayer: 'cross_item_workflow',
              matchedSeedCode: 'l3-seed-a',
              sampleCount: 1,
              projectCount: 1,
              conflictCount: 0,
              seedLagDays: 0,
              medianObservedWaitDays: 5,
              suggestedLagDays: 5,
              queueStatus: 'manual_review_required',
              recommendation: 'review_nonzero_lag_or_condition_profile',
              promotionPolicy: 'manual review only',
              sampleDependencyIds: ['dep-3'],
              projectIds: ['project-2'],
            },
          ],
          l4ConflictQuarantineCandidates: [
            {
              matchedLayer: 'cross_business_domain_dependency_intent',
              matchedSeedCode: 'l4-fire-occupancy',
              sampleCount: 1,
              projectCount: 1,
              conflictCount: 1,
              seedLagDays: 1,
              medianObservedWaitDays: -2,
              suggestedLagDays: null,
              queueStatus: 'quarantine_review_required',
              recommendation: 'quarantine_or_manual_review',
              promotionPolicy: 'quarantine review',
              sampleDependencyIds: ['dep-4'],
              projectIds: ['project-2'],
            },
          ],
          evidenceCollectionCandidates: [],
        },
        report_payload: {},
      },
    ]

    const report = await listConstructionDependencyReplayCalibrationHistoryReport({
      limit: 20,
      queryExec: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
        expect(sql).toContain('FROM public.construction_dependency_replay_calibration_reports')
        expect(params).toEqual([null, 20])
        return rows as T[]
      },
    })

    expect(report).toEqual(expect.objectContaining({
      reportCode: 'construction_dependency_replay_calibration_history',
      governancePolicy: {
        replayMode: 'report_only',
        seedWritePolicy: 'never_write_seed_from_replay',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        promotionPolicy: 'manual_seed_review_required',
      },
      summary: expect.objectContaining({
        reportCount: 2,
        seedReviewItemCount: 2,
        manualReviewRequiredCount: 1,
        quarantineReviewRequiredCount: 1,
        seedPromotionReadyCount: 1,
        seedPromotionReviewPackageCount: 1,
        blockedByConflictCount: 1,
        needsMoreReplayEvidenceCount: 0,
      }),
    }))
    expect(report.seedReviewItems).toEqual([
      expect.objectContaining({
        matchedSeedCode: 'l3-seed-a',
        matchedLayer: 'cross_item_workflow',
        reportCount: 2,
        sampleCount: 3,
        projectCount: 2,
        latestSuggestedLagDays: 5,
        queueStatus: 'manual_review_required',
        latestReportIds: ['report-2', 'report-1'],
        projectIds: ['project-2', 'project-1'],
        promotionReadiness: expect.objectContaining({
          status: 'ready_for_seed_promotion_review',
          canEnterSeedPromotionReview: true,
          requiredAction: 'manual_l3_lag_or_condition_profile_review',
          blockingReasons: [],
          evidenceThresholds: expect.objectContaining({
            minSampleCount: 3,
            minProjectCount: 2,
            conflictCountMustBeZero: true,
            suggestedLagDaysRequired: true,
            runtimeMutationPolicy: 'none_report_only',
          }),
        }),
      }),
      expect.objectContaining({
        matchedSeedCode: 'l4-fire-occupancy',
        matchedLayer: 'cross_business_domain_dependency_intent',
        reportCount: 1,
        conflictCount: 1,
        queueStatus: 'quarantine_review_required',
        latestReportIds: ['report-2'],
        promotionReadiness: expect.objectContaining({
          status: 'blocked_by_conflict_quarantine',
          canEnterSeedPromotionReview: false,
          requiredAction: 'quarantine_conflict_review_before_template_or_seed_change',
          blockingReasons: expect.arrayContaining(['actual_order_conflict_quarantine']),
        }),
      }),
    ])
    expect(report.seedPromotionReviewPackages).toEqual([
      expect.objectContaining({
        packageCode: 'construction_dependency_seed_promotion_review_package',
        matchedSeedCode: 'l3-seed-a',
        matchedLayer: 'cross_item_workflow',
        proposedAction: 'draft_l3_lag_days_or_condition_profile_update',
        currentSeedLagDays: 0,
        suggestedLagDays: 5,
        medianObservedWaitDays: 5,
        packageIdentity: {
          packageId: expect.stringMatching(/^construction_dependency_seed_promotion_review_package:cross_item_workflow:l3-seed-a:[a-f0-9]{12}$/),
          evidenceFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          fingerprintInputs: {
            matchedLayer: 'cross_item_workflow',
            matchedSeedCode: 'l3-seed-a',
            suggestedLagDays: 5,
            reportIds: ['report-1', 'report-2'],
            dependencyIds: ['dep-1', 'dep-2', 'dep-3'],
            projectIds: ['project-1', 'project-2'],
          },
          stabilityPolicy: 'same_seed_same_replay_evidence_same_fingerprint',
        },
        evidence: expect.objectContaining({
          sampleCount: 3,
          projectCount: 2,
          conflictCount: 0,
          latestReportIds: ['report-2', 'report-1'],
          sampleDependencyIds: ['dep-3', 'dep-1', 'dep-2'],
          projectIds: ['project-2', 'project-1'],
        }),
        proposedSeedPatchDraft: {
          draftMode: 'manual_review_only',
          targetSeedLayer: 'cross_item_workflow',
          targetSeedCode: 'l3-seed-a',
          operation: 'update_lag_days_or_add_condition_profile',
          currentValues: {
            lagDays: 0,
          },
          proposedValues: {
            lagDays: 5,
            calibrationBasis: 'median_observed_wait_days',
          },
          evidenceRefs: {
            reportIds: ['report-2', 'report-1'],
            dependencyIds: ['dep-3', 'dep-1', 'dep-2'],
            projectIds: ['project-2', 'project-1'],
          },
          safetyGuards: {
            runtimeMutationPolicy: 'none_report_only',
            requiresManualApproval: true,
            requiresCriticalPathImpactCheck: true,
            requiresConditionProfileDecision: true,
          },
        },
        governanceBoundary: {
          runtimeMutationPolicy: 'none_report_only',
          seedWritePolicy: 'never_write_seed_from_review_package',
          taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package',
          approvalRequired: true,
          allowedUse: 'manual_seed_promotion_review',
        },
        reviewChecklist: expect.arrayContaining([
          'confirm_handoff_scope_matches_seed',
          'validate_actual_date_quality',
          'decide_flat_lag_vs_conditional_profile',
          'check_critical_path_impact_before_seed_promotion',
        ]),
      }),
    ])
    expect(report.seedPromotionReviewPackages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ matchedSeedCode: 'l4-fire-occupancy' }),
    ]))
  })

  it('exposes ready replay evidence as a package-only manual seed promotion review report', async () => {
    const rows = [
      {
        id: 'report-1',
        project_id: 'project-1',
        run_id: 'run-1',
        report_generated_at: '2026-06-02T00:00:00.000Z',
        created_at: '2026-06-02T00:01:00.000Z',
        governance_policy: {},
        summary: { inputDependencyCount: 4 },
        calibration_queues: {
          l3LagCalibrationCandidates: [
            {
              matchedLayer: 'cross_item_workflow',
              matchedSeedCode: 'l3-seed-a',
              sampleCount: 2,
              projectCount: 1,
              conflictCount: 0,
              seedLagDays: 0,
              medianObservedWaitDays: 4,
              suggestedLagDays: 4,
              queueStatus: 'manual_review_required',
              recommendation: 'review_nonzero_lag_or_condition_profile',
              promotionPolicy: 'manual review only',
              sampleDependencyIds: ['dep-1', 'dep-2'],
              projectIds: ['project-1'],
            },
          ],
          l4ConflictQuarantineCandidates: [],
          evidenceCollectionCandidates: [],
        },
        report_payload: {},
      },
      {
        id: 'report-2',
        project_id: 'project-2',
        run_id: 'run-2',
        report_generated_at: '2026-06-03T00:00:00.000Z',
        created_at: '2026-06-03T00:01:00.000Z',
        governance_policy: {},
        summary: { inputDependencyCount: 3 },
        calibration_queues: {
          l3LagCalibrationCandidates: [
            {
              matchedLayer: 'cross_item_workflow',
              matchedSeedCode: 'l3-seed-a',
              sampleCount: 1,
              projectCount: 1,
              conflictCount: 0,
              seedLagDays: 0,
              medianObservedWaitDays: 5,
              suggestedLagDays: 5,
              queueStatus: 'manual_review_required',
              recommendation: 'review_nonzero_lag_or_condition_profile',
              promotionPolicy: 'manual review only',
              sampleDependencyIds: ['dep-3'],
              projectIds: ['project-2'],
            },
          ],
          l4ConflictQuarantineCandidates: [
            {
              matchedLayer: 'cross_business_domain_dependency_intent',
              matchedSeedCode: 'l4-fire-occupancy',
              sampleCount: 1,
              projectCount: 1,
              conflictCount: 1,
              seedLagDays: 1,
              medianObservedWaitDays: -2,
              suggestedLagDays: null,
              queueStatus: 'quarantine_review_required',
              recommendation: 'quarantine_or_manual_review',
              promotionPolicy: 'quarantine review',
              sampleDependencyIds: ['dep-4'],
              projectIds: ['project-2'],
            },
          ],
          evidenceCollectionCandidates: [],
        },
        report_payload: {},
      },
    ]

    const report = await listConstructionDependencySeedPromotionReviewPackageReport({
      limit: 20,
      queryExec: async <T = Record<string, unknown>>() => rows as T[],
    })

    expect(report).toEqual(expect.objectContaining({
      reportCode: 'construction_dependency_seed_promotion_review_packages',
      governanceBoundary: {
        reportOnly: true,
        runtimeMutationPolicy: 'none_report_only',
        seedWritePolicy: 'never_write_seed_from_review_package',
        taskDependencyWritePolicy: 'never_write_task_dependencies_from_review_package',
        approvalRequired: true,
        allowedUse: 'manual_seed_promotion_review',
      },
      summary: {
        sourceReportCount: 2,
        sourceSeedReviewItemCount: 2,
        packageCount: 1,
        blockedByConflictCount: 1,
        needsMoreReplayEvidenceCount: 0,
      },
      seedPromotionReviewPackages: [
        expect.objectContaining({
          matchedSeedCode: 'l3-seed-a',
          proposedAction: 'draft_l3_lag_days_or_condition_profile_update',
          suggestedLagDays: 5,
          proposedSeedPatchDraft: expect.objectContaining({
            draftMode: 'manual_review_only',
            operation: 'update_lag_days_or_add_condition_profile',
            proposedValues: expect.objectContaining({ lagDays: 5 }),
          }),
          packageIdentity: expect.objectContaining({
            packageId: expect.stringMatching(/^construction_dependency_seed_promotion_review_package:cross_item_workflow:l3-seed-a:[a-f0-9]{12}$/),
            evidenceFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          }),
        }),
      ],
    }))
  })

  it('keeps package evidence fingerprints stable when replay evidence id order changes', async () => {
    const buildRows = (sampleDependencyIds: string[], projectIds: string[]) => [
      {
        id: 'report-1',
        project_id: 'project-1',
        run_id: 'run-1',
        report_generated_at: '2026-06-02T00:00:00.000Z',
        created_at: '2026-06-02T00:01:00.000Z',
        governance_policy: {
          replayMode: 'report_only',
          seedWritePolicy: 'never_write_seed_from_replay',
          taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay',
        },
        summary: { inputDependencyCount: 3 },
        calibration_queues: {
          l3LagCalibrationCandidates: [
            {
              matchedLayer: 'cross_item_workflow',
              matchedSeedCode: 'l3-seed-a',
              sampleCount: 3,
              projectCount: 2,
              conflictCount: 0,
              seedLagDays: 0,
              medianObservedWaitDays: 5,
              suggestedLagDays: 5,
              queueStatus: 'manual_review_required',
              recommendation: 'review_nonzero_lag_or_condition_profile',
              promotionPolicy: 'manual review only',
              sampleDependencyIds,
              projectIds,
            },
          ],
          l4ConflictQuarantineCandidates: [],
          evidenceCollectionCandidates: [],
        },
        report_payload: {},
      },
    ]

    const orderedReport = await listConstructionDependencySeedPromotionReviewPackageReport({
      limit: 20,
      queryExec: async <T = Record<string, unknown>>() => buildRows(
        ['dep-1', 'dep-2', 'dep-3'],
        ['project-1', 'project-2'],
      ) as T[],
    })
    const reorderedReport = await listConstructionDependencySeedPromotionReviewPackageReport({
      limit: 20,
      queryExec: async <T = Record<string, unknown>>() => buildRows(
        ['dep-3', 'dep-2', 'dep-1'],
        ['project-2', 'project-1'],
      ) as T[],
    })

    const orderedIdentity = orderedReport.seedPromotionReviewPackages[0]?.packageIdentity
    const reorderedIdentity = reorderedReport.seedPromotionReviewPackages[0]?.packageIdentity

    expect(orderedIdentity?.fingerprintInputs).toEqual({
      matchedLayer: 'cross_item_workflow',
      matchedSeedCode: 'l3-seed-a',
      suggestedLagDays: 5,
      reportIds: ['report-1'],
      dependencyIds: ['dep-1', 'dep-2', 'dep-3'],
      projectIds: ['project-1', 'project-2'],
    })
    expect(reorderedIdentity?.fingerprintInputs).toEqual(orderedIdentity?.fingerprintInputs)
    expect(reorderedIdentity?.evidenceFingerprint).toBe(orderedIdentity?.evidenceFingerprint)
    expect(reorderedIdentity?.packageId).toBe(orderedIdentity?.packageId)
  })
})
