export type ProjectDailySnapshotScheduledResult = {
  recorded: number
  failed: number
  snapshotDate: string
}

export type DailyDurationForecastScheduledResult = {
  failed: number
  skippedByTimeBudget: number
  staleCurrentForecastsAfter: number
  freshnessSloMet: boolean
  timeBudgetExceeded: boolean
}

export type TaskProgressSnapshotReconciliationScheduledResult = {
  projectsScanned: number
  tasksScanned: number
  driftCount: number
  repaired: number
  failed: number
  projectFailures: Array<{ projectId: string; error: string }>
}

export function requireCompleteProjectDailySnapshotWrite<T extends ProjectDailySnapshotScheduledResult>(result: T): T {
  if (result.failed > 0) {
    throw Object.assign(
      new Error(`Project daily snapshot write failed for ${result.failed} project(s)`),
      {
        code: 'PROJECT_DAILY_SNAPSHOT_PARTIAL_FAILURE',
        result,
      },
    )
  }
  return result
}

export function requireCompleteDailyDurationForecastRefresh<T extends DailyDurationForecastScheduledResult>(result: T): T {
  const reasons = [
    result.failed > 0 ? 'forecast_refresh_failed_tasks' : null,
    result.timeBudgetExceeded || result.skippedByTimeBudget > 0
      ? 'forecast_refresh_time_budget_exceeded'
      : null,
    !result.freshnessSloMet || result.staleCurrentForecastsAfter > 0
      ? 'forecast_refresh_freshness_slo_not_met'
      : null,
  ].filter((reason): reason is string => Boolean(reason))

  if (reasons.length > 0) {
    throw Object.assign(
      new Error(`Daily duration forecast refresh incomplete: ${reasons.join(', ')}`),
      {
        code: 'DAILY_DURATION_FORECAST_REFRESH_INCOMPLETE',
        reasons,
        result,
      },
    )
  }
  return result
}

export function requireCompleteTaskProgressSnapshotReconciliation<
  T extends TaskProgressSnapshotReconciliationScheduledResult,
>(result: T): T {
  if (result.failed > 0) {
    throw Object.assign(
      new Error(`Task progress snapshot reconciliation failed for ${result.failed} task or project scope(s)`),
      {
        code: 'TASK_PROGRESS_SNAPSHOT_RECONCILIATION_PARTIAL_FAILURE',
        result,
      },
    )
  }
  return result
}

export async function runScheduledProjectDailySnapshotWrite<T extends ProjectDailySnapshotScheduledResult>(
  run: () => Promise<T>,
): Promise<T> {
  return requireCompleteProjectDailySnapshotWrite(await run())
}

export async function runScheduledDailyDurationForecastRefresh<T extends DailyDurationForecastScheduledResult>(
  run: () => Promise<T>,
): Promise<T> {
  return requireCompleteDailyDurationForecastRefresh(await run())
}

export async function runScheduledProjectDailySnapshotCycle<
  TReconciliation extends TaskProgressSnapshotReconciliationScheduledResult,
  TSnapshot extends ProjectDailySnapshotScheduledResult,
>(options: {
  reconcileTaskProgressSnapshots: () => Promise<TReconciliation>
  assertLeaseActive: () => void
  writeProjectDailySnapshots: () => Promise<TSnapshot>
}) {
  options.assertLeaseActive()
  const reconciliation = requireCompleteTaskProgressSnapshotReconciliation(
    await options.reconcileTaskProgressSnapshots(),
  )
  options.assertLeaseActive()
  const snapshot = await runScheduledProjectDailySnapshotWrite(options.writeProjectDailySnapshots)
  options.assertLeaseActive()
  return { reconciliation, snapshot }
}
