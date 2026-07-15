# v1.4.23.1 Runtime Consumption And Learning Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing v1.4.23.1 duration assets measurably affect wizard, drilldown, and downstream schedule outputs, then let governed low/medium-risk learning publications enter runtime automatically while confirmed baselines remain PM-approved revisions.

**Architecture:** Keep `algorithmSeedResolver`, runtime publication services, `durationInputAssemblerService`, `durationOutputGovernanceService`, and the five-layer dependency system as the existing owners. Add pure role/resolution and consumption-receipt contracts, then adapt each consumer to those contracts; learning and baseline bridges orchestrate existing publication and revision services without creating a second truth store.

**Tech Stack:** TypeScript, Vitest, Express, PostgreSQL/Supabase adapters already present in the repository, existing scheduler and planning revision services.

## Global Constraints

- No LLM dependency in plan generation.
- No production/live database access, guarded writes, or credential repair during local implementation.
- Existing uncommitted user changes must not be reverted or reformatted wholesale.
- Preview and simulation remain no-write; only existing authenticated transactional commit paths may write tasks and dependencies.
- TypeScript seed history is immutable; runtime upgrades use versioned publications/overrides and rollback targets.
- A receipt is `effective_applied` only when task selection, duration, dates, dependency, overlap, buffer, or confidence changes.
- Confirmed baselines may receive an automatic revision draft but are never auto-confirmed or silently replaced.
- `project-testing/reports/implementation-integrity-review-v1.4.22-v1.4.23.1-v1.4.23.2-20260711.md` is read-only historical audit input and must not be edited or deleted.
- `AUDIT_FINDINGS.md` is also read-only historical audit input and must not be edited or deleted.
- Historical artifacts never satisfy a current staging or production/live gate; environment evidence must record target, execution time, code digest, and outcome.
- Every production behavior change follows red-green-refactor.

---

### Task 1: P0-P1 Asset Role And Effective Resolution Contract

**Files:**
- Create: `server/src/services/durationAssetRuntimeContractService.ts`
- Modify: `server/src/services/algorithmSeedResolver.ts`
- Test: `server/src/__tests__/durationAssetRuntimeContractService.test.ts`
- Test: `server/src/__tests__/algorithmSeedGovernanceFlow.test.ts`

**Interfaces:**
- Produces: `DurationAssetRole`, `EffectiveDurationAssetSource`, `EffectiveDurationAssetResolution<T>`.
- Produces: `classifyAlgorithmSeedRuntimeRole(seedType, source)` and `resolveEffectiveDurationAsset(candidates)`.
- Extends resolved seed metadata with `__runtimeRole` and `__effectiveRuntimeSource` while preserving `__resolverSource` compatibility.

- [ ] **Step 1: Write the failing role and precedence tests**

```ts
expect(classifyAlgorithmSeedRuntimeRole('standard_work_duration', 'ts_seed_fallback'))
  .toBe('system_bootstrap')
expect(resolveEffectiveDurationAsset(candidates)).toMatchObject({
  effectiveSource: 'project_stable',
  versionId: 'project-v2',
  runtimeConsumable: true,
})
```

Cover project > company > industry > system stable > bootstrap, candidate non-override, retired rejection, conflict blocking, and canary boundary requirements.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationAssetRuntimeContractService.test.ts`

Expected: FAIL because the new service does not exist.

- [ ] **Step 3: Implement the pure contract and resolver**

```ts
export function resolveEffectiveDurationAsset<T>(
  candidates: DurationAssetResolutionCandidate<T>[],
  options: { canaryBoundary?: DurationAssetCanaryBoundary | null } = {},
): EffectiveDurationAssetResolution<T>
```

Use an exhaustive source rank, reject non-runtime roles, allow canary only with matching company/project/surface/traffic boundary, and return suppressed sources, conflicts, publication lineage, and rollback target.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all contract tests pass.

- [ ] **Step 5: Write failing seed-resolver metadata assertions**

Assert `project_override`, `company_override`, `active_seed`, and `ts_seed_fallback` map to the new role/source fields without changing the existing stable-code merge result.

- [ ] **Step 6: Add compatible metadata in `withResolverMeta`**

Keep `__resolverSource` unchanged and add:

```ts
__runtimeRole: classifyAlgorithmSeedRuntimeRole(seedType, source),
__effectiveRuntimeSource: mapAlgorithmSeedResolverSource(source),
```

- [ ] **Step 7: Run resolver tests**

Run: `npm exec --workspace=server -- vitest run src/__tests__/algorithmSeedGovernanceFlow.test.ts src/__tests__/algorithmSeedResolverFastFallback.test.ts src/__tests__/durationAssetRuntimeContractService.test.ts`

Expected: all tests pass with no live DB requirement.

### Task 2: P2 Effective Consumption Receipt

**Files:**
- Create: `server/src/services/durationAssetConsumptionReceiptService.ts`
- Modify: `server/src/services/durationInputAssemblerService.ts`
- Test: `server/src/__tests__/durationAssetConsumptionReceiptService.test.ts`
- Test: `server/src/__tests__/durationInputAssemblerService.test.ts`

**Interfaces:**
- Produces: `DurationAssetConsumptionReceipt`, `DurationAssetConsumptionStatus`, `DurationAssetChangedField`.
- Produces: `buildDurationAssetConsumptionReceipt(input)` and `summarizeDurationAssetConsumption(receipts)`.
- Extends assembler output with `assetConsumptionReceipts` and `assetConsumptionSummary` only when supplied by the consumer.

- [ ] **Step 1: Write failing receipt-classification tests**

```ts
expect(buildDurationAssetConsumptionReceipt({
  resolution,
  consumer: 'wizard_master_plan',
  before: { durationDays: 12 },
  after: { durationDays: 10 },
  targetRowIds: ['row-1'],
})).toMatchObject({ status: 'effective_applied', changedFields: ['duration'] })
```

Add cases for metadata-only `evidence_only`, confidence-only `advisory_used`, inapplicable assets, conflict blocking, dependency/overlap changes, and deduplicated target rows.

- [ ] **Step 2: Run the receipt test and verify RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationAssetConsumptionReceiptService.test.ts`

Expected: FAIL because the receipt service does not exist.

- [ ] **Step 3: Implement deterministic projection comparison**

Compare only governed fields through structured normalized projections; do not infer effective use from lineage or read attempts. Summary counts derive only from receipt statuses.

- [ ] **Step 4: Verify receipt tests GREEN**

Run the Step 2 command. Expected: all receipt tests pass.

- [ ] **Step 5: Add failing assembler propagation tests**

Assert supplied receipts survive hydration unchanged, unsupplied receipts default to an empty list, and assembler mutation boundaries remain all `false`.

- [ ] **Step 6: Add receipt propagation to the assembler contract**

```ts
assetConsumptionReceipts: DurationAssetConsumptionReceipt[]
assetConsumptionSummary: DurationAssetConsumptionSummary
```

The assembler does not manufacture effective receipts; it only validates and propagates consumer-produced receipts.

- [ ] **Step 7: Run Task 2 tests**

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationAssetConsumptionReceiptService.test.ts src/__tests__/durationInputAssemblerService.test.ts`

Expected: all tests pass.

### Task 3: P3 Wizard Master Plan Consumption Closure

**Files:**
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Modify: `server/src/services/defaultMasterPlanExecutableAssemblyService.ts`
- Modify: `server/src/services/defaultMasterPlanVisibilityService.ts`
- Modify: `server/src/routes/projectWizard.ts`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`
- Test: `server/src/__tests__/defaultMasterPlanExecutableAssemblyService.test.ts`
- Test: `server/src/__tests__/wbsPlanRollupContract.test.ts`
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`

**Interfaces:**
- Consumes: resolved standard-work, T2, visibility, construction-organization, calendar, and dependency assets.
- Produces: `durationAssetConsumptionReceipts` and receipt-derived `durationAssetUtilizationSummary` in preview and commit responses.

- [ ] **Step 1: Add failing 11-business-type assertions**

For every formal business type assert 60-300 visible master rows, milestone/phase coverage, no dangling dependencies, and at least one effective duration/dependency receipt. Assert tower-crane/hoist detail remains hidden unless it is a hard control gate.

- [ ] **Step 2: Verify RED on the managed-frontier test**

Run: `npm exec --workspace=server -- vitest run src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts -t "consumption receipt"`

Expected: FAIL because current utilization counts do not prove actual output changes.

- [ ] **Step 3: Capture before/after projections at existing generation stages**

Build receipts after standard duration selection, T2 application, dependency application, calendar scheduling, executable assembly, and visibility filtering. Replace utilization counts derived from source metadata with receipt-derived counts.

- [ ] **Step 4: Preserve preview/commit parity**

Return the same receipt summary from preview and from the existing transactional commit result; do not add a second writer or write evidence rows to business tables.

- [ ] **Step 5: Run Task 3 tests**

Keep the centralized rollup contract as the single business rule: only `duration_bearing`, `quality_gate`, `external_wait`, and `handover_marker` extend a parent plan window. Update the legacy WBS generation expectation to reuse the shared contributor predicate and assert excluded children remain dated but do not extend the parent; do not change the production rule or weaken the assertion just to make the suite green.

Run: `npm exec --workspace=server -- vitest run src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts src/__tests__/defaultMasterPlanExecutableAssemblyService.test.ts src/__tests__/wbsPlanRollupContract.test.ts src/__tests__/wizardGenerationSideEffects.test.ts`

Expected: all tests pass.

### Task 4: P4 Execution Plan Drilldown Uses Governed Runtime Assets

**Files:**
- Modify: `server/src/services/taskPlanDrilldownRhythmService.ts`
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Test: `server/src/__tests__/taskPlanDrilldownRhythmService.test.ts`
- Test: `server/src/__tests__/wbsTemplateGenerationCompositeE2E.test.ts`

**Interfaces:**
- Replaces direct `T2_DIVISION_RHYTHM_TEMPLATE_SEED` lookup with injected/async `resolveT2DivisionRhythmTemplateByTemplateId` resolution.
- Produces: governed cycle windows, parent-window fit diagnostics, five-layer dependency lineage, and consumption receipts.

- [ ] **Step 1: Write failing active-version and parent-window tests**

Assert an active T2 resolver record changes generated cycle duration, direct seed fallback is identified as `system_bootstrap`, and a parent window shorter than the minimum rhythm returns a conflict instead of evenly compressing every cycle.

- [ ] **Step 2: Run the drilldown test and verify RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/taskPlanDrilldownRhythmService.test.ts`

Expected: active version and conflict receipt assertions fail against the direct seed import/equal split implementation.

- [ ] **Step 3: Refactor drilldown to async governed resolution**

Resolve T2 through the existing resolver, use construction-calendar production days, keep the parent window as a boundary, and produce an explicit compression/buffer decision. Route generated dependencies through the existing five-layer dependency evidence builder rather than emitting ungoverned FS edges.

- [ ] **Step 4: Remove the WBS early-return bypass**

The rhythm result may provide rows, but those rows must still pass common schedule trust, output governance, dependency closure, and receipt aggregation before return.

- [ ] **Step 5: Run Task 4 tests**

Run: `npm exec --workspace=server -- vitest run src/__tests__/taskPlanDrilldownRhythmService.test.ts src/__tests__/wbsTemplateGenerationCompositeE2E.test.ts`

Expected: all tests pass; a single expansion remains capped at 80 rows and project totals may exceed 500.

### Task 5: P5 Downstream Consumer Parity

**Files:**
- Modify: `server/src/services/projectCriticalPathService.ts`
- Modify: `server/src/services/scheduleAccelerationRuntimeService.ts`
- Modify: `server/src/services/projectRemainingDurationForecastService.ts`
- Create: `server/src/services/wizardPostCommitDerivationRecoveryService.ts`
- Modify: `server/src/routes/projectWizard.ts`
- Modify: `server/src/routes/reports.ts`
- Test: `server/src/__tests__/projectCriticalPathService.test.ts`
- Test: `server/src/__tests__/scheduleAccelerationRuntimeService.test.ts`
- Test: `server/src/__tests__/projectRemainingDurationForecastService.test.ts`
- Test: `server/src/__tests__/wizardPostCommitDerivationRecoveryService.test.ts`
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`
- Test: `server/src/__tests__/reportsRoutes.test.ts`

**Interfaces:**
- Consumes the same effective resolution semantics and assembler receipt contract.
- Produces consumer-specific receipt arrays and explicit S-curve fallback provenance.

- [ ] **Step 1: Fix the existing critical-path cache test contract first**

Write/adjust a failing test that clears the project cache after mocked task/dependency changes and verifies recalculation, rather than asserting changed mocks against a cached read.

- [ ] **Step 2: Verify the isolated critical-path failures, then make them GREEN**

Run: `npm exec --workspace=server -- vitest run src/__tests__/projectCriticalPathService.test.ts`

Expected after correction: all critical-path tests pass without weakening the five-minute production cache.

- [ ] **Step 3: Add failing consumer receipt parity tests**

Assert the same publication/version selected for a duration parameter appears in critical-path, acceleration, and remaining-duration receipts; candidate-only inputs must not change official dates.

- [ ] **Step 4: Add receipt propagation to each consumer**

Use `assembleDurationInput`, build before/after projections around existing calculations, and return receipt summaries. Do not duplicate source precedence logic inside consumers.

- [ ] **Step 5: Mark report fallback provenance**

When S-curve planned snapshots are unavailable and linear interpolation is used, return `plannedCurveSource: 'linear_fallback_no_snapshot'`; real snapshot output returns `project_daily_snapshot`.

- [ ] **Step 6: Make wizard post-commit derivations recoverable**

Write the failing recovery test first, then persist an idempotent pending state for critical-path and duration-evidence derivations. A failed post-commit effect must be retryable by generation batch/project and expose `pending`, `succeeded`, or terminal `failed` status instead of logging success with incomplete derived state.

- [ ] **Step 7: Run raw date-math guard and replace business day arithmetic**

Run: `npm run guard:raw-date-math --workspace=server`

Replace violations owned by the duration/default-master-plan chain with `constructionCalendar`, `inclusiveDurationDays`, or the established calendar/date utility. Add DST/timezone, parallel-chain, deleted-task, and failed-cache regression assertions.

- [ ] **Step 8: Run Task 5 tests**

Run: `npm exec --workspace=server -- vitest run src/__tests__/projectCriticalPathService.test.ts src/__tests__/scheduleAccelerationRuntimeService.test.ts src/__tests__/projectRemainingDurationForecastService.test.ts src/__tests__/wizardPostCommitDerivationRecoveryService.test.ts src/__tests__/wizardGenerationSideEffects.test.ts src/__tests__/reportsRoutes.test.ts src/__tests__/serverRawDateMathGuard.test.ts`

Expected: all tests pass.

### Task 6: P6 Learning Publication And Runtime Consumption Bridge

**Files:**
- Create: `server/src/services/durationContextPolicyRuntimePublicationBridgeService.ts`
- Create: `server/src/services/durationContextPolicyLearningCheckpointService.ts`
- Modify: `server/src/jobs/durationContextPolicyLearningJob.ts`
- Modify: `server/src/services/durationContextPolicySelectorService.ts`
- Modify: `server/src/services/defaultMasterPlanVisibilityLearningService.ts`
- Test: `server/src/__tests__/durationContextPolicyRuntimePublicationBridgeService.test.ts`
- Test: `server/src/__tests__/durationContextPolicyLearningCheckpointService.test.ts`
- Test: `server/src/__tests__/durationContextPolicyLearningJob.test.ts`
- Test: `server/src/__tests__/durationContextPolicySelectorService.test.ts`
- Test: `server/src/__tests__/executeSqlGuard.test.ts`

**Interfaces:**
- Consumes: auto-publish decisions, activation readiness, trial plan, existing release execution and runtime consumption services.
- Produces: risk classification, canary/stable publication result, monitoring/rollback result, and runtime selector value.

- [ ] **Step 1: Write failing risk and bridge tests**

Assert low-risk candidates may auto-publish stable after gates, medium-risk duration/lag/overlap candidates run bounded canary before stable, and high-risk task/dependency/milestone changes remain `manual_professional_approval_required`.

Also write stage-by-stage failure-injection tests for one stable operation ID: after candidate/canary/decision persistence succeeds and a later publication or monitoring stage fails, retry must resume from the last verified checkpoint and must not create a second candidate, decision, event, or publication. Cover process restart and same-operation multi-instance dedupe through injected persistence adapters.

- [ ] **Step 2: Verify RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationContextPolicyRuntimePublicationBridgeService.test.ts`

Expected: FAIL because current job stops at canary registry/trial-plan evidence.

- [ ] **Step 3: Implement operation identity and stage checkpoints**

Derive a stable operation ID from scheduled window, project scope, input fact digest, and learner version. Persist/check each stage's terminal status and output hash; a retry skips a completed matching stage, rejects a mismatched hash, and resumes only incomplete stages. Each candidate/decision/publication write uses operation ID plus stage as its idempotency key.

- [ ] **Step 4: Implement the bridge with existing writers**

Delegate numeric publications to `persistAlgorithmAssetLearnableParameterRuntimePublication`, monitoring to `recordAlgorithmAssetLearnableParameterImpactMonitoring`, rollback to `executeAlgorithmAssetLearnableParameterRuntimeRollback`, and reads to `loadAlgorithmAssetLearnableParameterRuntimeValue`. Do not write seed files or task facts.

- [ ] **Step 5: Connect the learning job**

After activation readiness, invoke the bridge and return `runtimeMutationPolicy` that accurately describes canary/stable publication actions. A gate miss retains the previous stable version.

- [ ] **Step 6: Connect selector consumption**

Use a stable runtime publication when consumable, otherwise keep deterministic current factors; canary use requires the explicit boundary.

- [ ] **Step 7: Run Task 6 tests**

Convert the default-master-plan visibility feedback reader to a fixed parameterized query accepted by the SQL guard; do not approve a truly dynamic SQL string merely to turn the test green.

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationContextPolicyLearningCheckpointService.test.ts src/__tests__/durationContextPolicyRuntimePublicationBridgeService.test.ts src/__tests__/durationContextPolicyLearningJob.test.ts src/__tests__/durationContextPolicySelectorService.test.ts src/__tests__/executeSqlGuard.test.ts`

Expected: all tests pass with injected query executors and no real DB.

### Task 7: P7 Automatic Baseline Revision Draft Bridge

**Files:**
- Create: `server/src/services/durationAssetBaselineRevisionBridgeService.ts`
- Modify: `server/src/services/baselineGovernanceService.ts`
- Modify: `server/src/scheduler.ts`
- Test: `server/src/__tests__/durationAssetBaselineRevisionBridgeService.test.ts`
- Test: `server/src/__tests__/baselineGovernanceService.test.ts`
- Test: `server/src/__tests__/schedulerJobContracts.test.ts`

**Interfaces:**
- Consumes: stable publication event, affected project/baseline lineage, no-write recalculation callback, `submitObservationPoolItems`, and `startRevisionFromBaseline`.
- Produces: `no_revision_required`, `revision_draft_created`, or blocked audit result.

- [ ] **Step 1: Write failing revision bridge tests**

Assert no material diff creates no draft; duration/date/dependency changes mark `pending_realign`, submit revision-pool items, and create one draft; returned state is never `confirmed`.

- [ ] **Step 2: Verify RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationAssetBaselineRevisionBridgeService.test.ts`

Expected: FAIL because publication impact currently only reaches generic baseline validity status.

- [ ] **Step 3: Implement idempotent impact-to-draft orchestration**

Use publication key + baseline ID as the idempotency key, compare structured task/duration/date/dependency projections, call existing revision services, and preserve actor as system automation with PM confirmation required.

- [ ] **Step 4: Schedule after stable publication/validity scan**

The scheduler may create drafts only for stable publication events that have passed release gates. Candidate and canary events never create confirmed-plan revisions.

- [ ] **Step 5: Run Task 7 tests**

Run: `npm exec --workspace=server -- vitest run src/__tests__/durationAssetBaselineRevisionBridgeService.test.ts src/__tests__/baselineGovernanceService.test.ts src/__tests__/schedulerJobContracts.test.ts`

Expected: all tests pass.

### Task 8: P8 Integrated Verification And Runtime-Level Audit

**Files:**
- Modify: `project-testing/tools/generate-executable-default-master-plan-simulation.mjs`
- Create: `project-testing/tools/audit-duration-runtime-consumption-closure.mjs`
- Create: `project-testing/tools/audit-duration-runtime-consumption-closure.test.mjs`
- Modify: `server/src/registry/system-domain-registry.json`
- Test: `server/src/__tests__/systemRegistryGuard.test.ts`
- Test: `server/src/__tests__/v14231NonLiveCloseoutContract.test.ts`
- Create: `server/src/__tests__/durationSuggestionAssemblyIntegration.test.ts`
- Create: `server/src/fixtures/duration-accuracy/frozen-accepted-samples.json`
- Create: `project-testing/reports/duration-runtime-consumption-closure-20260711/readiness.md`

**Interfaces:**
- Consumes: simulation output and receipt summaries from Tasks 1-7.
- Produces: separate candidate/read-only, staging, and production/live gate statuses.

- [ ] **Step 1: Write the failing audit test**

Require the audit to reject metadata-only utilization, missing downstream consumers, missing rollback target, auto-confirmed revisions, and any production/live claim without matching environment evidence.

- [ ] **Step 2: Verify RED**

Run: `node --test project-testing/tools/audit-duration-runtime-consumption-closure.test.mjs`

Expected: FAIL because the audit tool does not exist.

- [ ] **Step 3: Implement the read-only audit**

Read generated artifacts only, calculate gates from receipt status and test results, and render separate environment-level conclusions. The tool must never connect to DB or mutate plans.

- [ ] **Step 4: Run focused server verification**

Run all test files listed in Tasks 1-7 with `npm exec --workspace=server -- vitest run ...`.

Expected: all focused tests pass.

- [ ] **Step 5: Register this专项's new services and jobs**

Add only the default-master-plan, drilldown, runtime-publication, monitoring, rollback, recovery, and revision members introduced or modified by Tasks 1-7. Run `npm run guard:system-registry --workspace=server`; unrelated global registry architecture remains outside this专项, but no new unknown member from this专项 is allowed.

- [ ] **Step 6: Run compile and broader regression**

Run:

```powershell
npm run typecheck --workspace=server
npm run test:run --workspace=server
```

Expected: TypeScript passes and server tests have no new failures; any unrelated pre-existing failure is listed with exact evidence.

- [ ] **Step 7: Re-run retained duration regression gates**

Re-run the already-passing 224-04 through 224-07 context calibration, residual overlay, cold-start baseline, and factor-synthesis tests. They remain regression gates and are not removed or reclassified because this专项 touches adjacent code.

- [ ] **Step 8: Add a non-fully-mocked duration assembly accuracy chain**

Use versioned, provenance-bearing frozen accepted samples and the real input assembler, seed resolver fallback/active-version logic, duration suggestion calculation, output governance, and accuracy service. Mock only the external persistence boundary. Assert sample lineage, minimum coverage, MAE/MAPE thresholds, and over-compensation rate; printed engineering references without assertions do not satisfy this gate. Keep the old mocked test as a simulation/contract test, not production accuracy evidence.

- [ ] **Step 9: Generate a simulated residential plan and audit**

Run the existing simulation tool, then the new audit tool. Verify the master plan is simple and control-focused, drilldown uses governed T2 assets, and receipt counts are based on changed outputs. This closes candidate/read-only behavior only.

- [ ] **Step 10: Run staging smoke when a real staging DB and credentials are available**

Record current schema/migration state, authenticated wizard preview/commit, concurrent retry/idempotency behavior, post-commit derivation recovery, runtime consumer observation, canary publication, monitoring, rollback, tenant/company/project boundary, target, timestamp, and code digest. Missing access leaves staging rows `unable_to_verify`.

- [ ] **Step 11: Run production/live smoke only with explicit production access**

Run read-only/current evidence checks first, then only the already-guarded publication/rollback procedures authorized for that environment. Browser/API wizard smoke, accepted real samples, four-layer consumer observation, publication, monitoring, rollback, accuracy outcome, and final claim must all be fresh. Missing credentials or any missing layer leaves production/live `not_closed`.

- [ ] **Step 12: Write the readiness report**

Record code implementation and actual local behavior first, tests second, and evidence artifacts last. Explicitly list staging requirements (schema/migrations, scheduler, tenant isolation, monitoring, rollback) and production/live requirements (real credentials, real publication, real consumption and outcome); do not mark them complete from local evidence.

## Implementation Integrity Audit Mapping

The historical audit remains unchanged. Final reporting must include, for every row below, exact code files/functions, runtime call chain, tests, and separate candidate/read-only, staging, and production/live evidence.

| Audit item | P0-P8 owner | Required closure evidence |
| --- | --- | --- |
| `221-10` | P8 | Fresh target-environment wizard browser/API smoke, concurrency/retry, post-commit state and rollback; local simulation is insufficient. |
| `224-03` | P3-P5, P8 | E1-E5 accuracy/stability tests, shared receipt/version lineage, and critical-path regression green. |
| `224-08` | P2, P5, P8 | Completion fact -> actual outcome -> sample health -> calibration lineage with accepted real sample evidence only at staging/live. |
| `224-09` | P4-P5, P8 | Dependency/CPM/cache/calendar contracts, no raw day math in owned code, parallel/delete/DST/failure-cache tests. |
| `224-10` | P6, P8 | Current canary -> runtime consumption -> monitor -> accuracy comparison -> rollback outcome; production remains open without fresh live results. |
| `226-04` | P8 | Canonical real sample/outcome reads for each in-scope duration asset. |
| `226-05` | P3-P6, P8 | Fresh observation, integration, runtime-call and business-path evidence from a real consumer. |
| `226-06` | P6, P8 | Approved publication execution bound to asset/version/publication key and observed runtime change. |
| `226-07` | P6, P8 | Monitoring event bound to the same publication and measured outcome. |
| `226-08` | P6, P8 | Executed rollback bound to the same publication, restored prior value and subsequent consumer observation. |
| `226-10` | P8 | Canonical current final-claim audit; any missing asset/layer degrades to not closed. |
| `231-05` | P0-P8 | C-19 L0-L5, E1-E5, sample, consumer, publication, monitoring and rollback mapped end-to-end. |
| `22-06` duration slice | P6, P8 | Current publication-monitor-rollback chain for duration/default-master-plan assets only. |
| `22-08` duration slice | P6 | `defaultMasterPlanVisibilityLearningService` fixed parameter SQL and `executeSqlGuard` green. |
| `221-09` duration slice | P5, P8 | Wizard post-commit critical-path/evidence derivations have idempotent pending/retry/terminal state. |
| `223-08` duration slice | P6, P8 | Current impact and rollback for in-scope duration assets only. |
| `231-06` duration slice | P5, P8 | Critical-path failures, owned raw day-math violations and newly introduced non-live failures red-to-green. |
| `231A-07` duration slice | P8 | Fresh staging/production/live evidence for the default-master-plan/duration chain; otherwise unable to verify. |
| `232-01`, `232A-01`, `232A-04` duration slice | P8 | Every new/modified in-scope service/job registered and no in-scope unknown scan result. |
| `232-03` duration slice | P6-P8 | New/modified learning/monitor/rollback/recovery jobs prove idempotency, single-flight, terminal state and recovery. |
| `224-04` through `224-07` | P8 regression | Existing passing calibration, residual-overlay, cold-start and factor gates remain green and are not deleted. |
| `BACKEND-046` | P6, `232-03` duration slice | Stable operation ID, stage checkpoint/output hash, committed-stage retry, process restart and same-operation dedupe tests prove exactly-once effects. |
| `BACKEND-051` | P3-P4, P8 | Centralized duration-contribution rollup is the sole contract; legacy WBS generation and shared contract tests both pass without weakening behavior. |
| `BACKEND-052` | P8, `224-03`, `224-08` | Real assembler/non-fully-mocked chain over provenance-bearing frozen samples asserts coverage, MAE/MAPE and over-compensation; staging/live claims still require real readback. |
| `BACKEND-055` | P3-P8 regression risk | No line-count rewrite is required; extracted new services stay focused, characterization and long WBS tests remain regression gates, and no new rule is embedded in the large route/service. |

Out of scope remains exactly as delegated: external knowledge connectors/writers, root governance command dependency, governance-workbench lint, generic readiness hardcoding, global registry redesign, commercialization, release workflow, tenant-wide isolation redesign, and global Git cleanup.
