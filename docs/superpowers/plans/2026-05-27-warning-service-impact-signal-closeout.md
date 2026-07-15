# Warning Service Impact Signal Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the condition, obstacle, acceptance, and delay-warning algorithm line by wiring runtime policy into scan output and adding an explicit scheduled governance job.

**Architecture:** Keep `warningImpactSignalService` as the pure projection layer. Keep `WarningService` as the orchestration layer for project-aware policy, lifecycle sync, and governance artifact writes. Add one small job module that can be scheduled without changing frontend behavior.

**Tech Stack:** TypeScript, Vitest, Supabase SDK, existing scheduler/jobRuntime patterns.

---

### Task 1: Runtime Policy Enters Scan Output

**Files:**
- Modify: `server/src/__tests__/warningService.impactGovernance.test.ts`
- Modify: `server/src/services/warningService.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('applies runtime governance policy to impact signal warning scans', async () => {
  state.tables.warning_policy_configs.push({
    project_id: 'project-1',
    project_type: 'hospital',
    is_active: true,
    config: {
      thresholdsByProjectType: {
        hospital: { warningWeightedRiskScore: 0.95 },
      },
    },
  })
  state.tables.tasks.push({
    id: 'task-policy',
    project_id: 'project-1',
    title: 'Policy Task',
    readiness_summary: null,
  })
  state.tables.task_duration_forecasts.push({
    id: 'forecast-policy',
    project_id: 'project-1',
    task_id: 'task-policy',
    is_current: true,
    forecast_delay_days: 0,
    metadata: {
      forecastSources: {
        impactSignalSummary: {
          rawCount: 1,
          dedupedCount: 1,
          confirmedDelayDays: 0,
          weightedRiskScore: 0.8,
          uncertaintyIndex: 0.8,
          signals: [signal({
            signalId: 'policy-signal',
            runtimePolicy: 'candidate_only',
            impactMode: 'confidence_only',
            weightedRiskScore: 0.8,
          })],
        },
      },
    },
  })

  const warnings = await new WarningService().scanExecutionImpactSignalWarnings('project-1')

  expect(warnings[0].metadata?.thresholdPolicy).toMatchObject({
    thresholdSource: 'governance_config',
    warningWeightedRiskScore: 0.95,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run --config vitest.config.ts src/__tests__/warningService.impactGovernance.test.ts`

Expected: FAIL because scan output still uses the default signal policy.

- [ ] **Step 3: Write minimal implementation**

Update `WarningService.scanExecutionImpactSignalWarnings(projectId)` to load `resolveRuntimeImpactSignalPolicy(projectId)` when `projectId` is provided, and pass the policy to `scanWarningsFromImpactSignalSummaries`.

- [ ] **Step 4: Run test to verify it passes**

Run the same Vitest command. Expected: PASS.

### Task 2: Scheduled Governance Job

**Files:**
- Create: `server/src/jobs/warningImpactSignalGovernanceJob.ts`
- Create: `server/src/__tests__/warningImpactSignalGovernanceJob.test.ts`
- Modify: `server/src/scheduler.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('runs lifecycle sync and governance artifact recording for each active project', async () => {
  state.tables.projects.push({ id: 'project-1', status: 'active' })

  const result = await warningImpactSignalGovernanceJob.executeNow()

  expect(result).toMatchObject({ total: 1, scanned: 1, failed: 0 })
  expect(state.service.syncImpactSignalWarningLifecycle).toHaveBeenCalledWith('project-1')
  expect(state.service.recordImpactSignalGovernanceArtifacts).toHaveBeenCalledWith('project-1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run --config vitest.config.ts src/__tests__/warningImpactSignalGovernanceJob.test.ts`

Expected: FAIL because the job module does not exist.

- [ ] **Step 3: Write minimal implementation**

Create a job following the existing `responsibilityAlertJob` shape: list active projects, call both WarningService governance methods per project, return `{ total, scanned, failed }`, and expose `start`, `stop`, `executeNow`, `getStatus`.

- [ ] **Step 4: Wire scheduler**

Import and start/stop the job in `server/src/scheduler.ts`, scheduled daily after duration forecasts.

- [ ] **Step 5: Run test to verify it passes**

Run the job test. Expected: PASS.

### Task 3: Closeout Verification

**Files:**
- Modify: `EXECUTION_PROGRESS.json`

- [ ] **Step 1: Run focused regression**

Run warning/impact regression suite including:

```powershell
npx vitest run --config vitest.config.ts src/__tests__/warningImpactSignalGovernanceJob.test.ts src/__tests__/warningImpactSignalGovernanceMigration.test.ts src/__tests__/warningImpactSignalService.test.ts src/__tests__/warningService.impactGovernance.test.ts src/__tests__/warning-chain.test.ts src/__tests__/warningChainContract.test.ts src/__tests__/warningService.notifications.test.ts src/__tests__/upgradeChainService.warningRecipients.test.ts src/__tests__/warnings.test.ts src/__tests__/executionImpactSignals.test.ts src/__tests__/delayWarningSignalReplayEvaluator.test.ts src/__tests__/executionGateSeedService.test.ts src/__tests__/taskDurationForecastService.test.ts
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc -p tsconfig.json --noEmit --pretty false`

Expected: no new warningService errors; record unrelated blockers if any remain.

- [ ] **Step 3: Update progress JSON**

Add a closeout record under `uiux_v1_3.steps` noting runtime-policy scan injection, scheduled governance job, verification results, and any unrelated TypeScript blockers.

---

### 2026-05-27 Addendum: Owner Feedback and Incremental Scan

**Goal:** Complete user-selected optimization items 3/4 for the warningService condition, obstacle, acceptance, and delay-warning algorithm line.

**Scope:** Backend only. No frontend interaction changes and no new warning rules.

**Implemented:**
- Owner confirmation results now feed back into `algorithm_seed_quality_events` through `WarningService.applyOwnerConfirmationFeedback(projectId)`.
- Confirmed owner feedback records `quality_grade=confirmed` and `runtime_role=normal`; rejected/false-positive owner feedback records `quality_grade=owner_rejected` and `runtime_role=explain_only`.
- `warning_owner_confirmations.feedback_status` and `feedback_applied_at` prevent duplicate feedback event writes.
- `scanExecutionImpactSignalWarnings`, debug reports, lifecycle sync, and artifact recording now accept `taskIds`, `changedSince`, and `limit` scan bounds.
- `warningImpactSignalGovernanceJob` uses a default 48-hour / 500-row incremental scan window and passes the same bounds into lifecycle sync and artifact recording.
- Incremental lifecycle sync only resolves/downgrades active warnings for tasks included in the current scan window, avoiding false closure of warnings outside the window.

**Verification:**
- Red tests first: owner feedback, query-bound scan, job incremental options, migration fields, incremental lifecycle no-false-resolve.
- Green tests: `warningService.impactGovernance`, `warningImpactSignalGovernanceJob`, and `warningImpactSignalGovernanceMigration`.
- Server TypeScript check passed: `npx tsc -p tsconfig.json --noEmit --pretty false`.
