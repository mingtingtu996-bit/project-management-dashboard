# Wizard Duration Runtime Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect governed duration candidates to the wizard runtime, preserve preview/commit scope parity, and durably store project-manager baseline acceptance.

**Architecture:** Keep `standard_work_duration` as the sole duration authority. Add one scoped override domain writer behind the existing governance workbench, pass authenticated scope into wizard preview, and persist the existing normalized candidate review with the baseline status update.

**Tech Stack:** TypeScript, Express, Supabase/PostgreSQL, React, Vitest, Supertest.

## Global Constraints

- Do not connect to or mutate a real database during implementation verification.
- Do not add a parallel runtime-reference-days store.
- Do not relax seed validation, company isolation, T2 governance, or production-evidence gates.
- Work in the existing `codex/production-closeout-readiness` branch because relevant files contain uncommitted user work; do not commit or revert unrelated changes.
- Every production behavior change follows red-green-refactor.

---

### Task 1: Scoped standard-work-duration override writer

**Files:**
- Create: `server/src/services/algorithmSeedOverrideReleaseExecutionService.ts`
- Create: `server/src/__tests__/algorithmSeedOverrideReleaseExecutionService.test.ts`
- Modify: `server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts`
- Modify: `server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts`

**Interfaces:**
- Consumes: `AlgorithmSeedOverrideReleaseExecutionInput` with source publication key, authenticated company/project, publisher, evidence token, release/consumer/monitoring/rollback refs, and `queryExec`.
- Produces: `publishApprovedAlgorithmSeedOverride(input): Promise<AlgorithmSeedOverrideReleaseExecutionResult>`.

- [x] **Step 1: Write the failing domain-writer tests**

Add tests that provide an `auto_published` `standard_work_duration` candidate and assert the result is `algorithm_seed_override_published`, the mutation SQL is a single CTE statement, release lineage is parameter-bound, and resolver cache is cleared. Add rejection tests for `candidate_only`, foreign company, and project mismatch.

- [x] **Step 2: Run the focused domain-writer test and verify RED**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/algorithmSeedOverrideReleaseExecutionService.test.ts`

Expected: FAIL because the service module and exported function do not exist.

- [x] **Step 3: Implement the minimal domain writer**

Implement strict publication-key parsing, candidate loading, status/type/scope validation, existing seed payload validation/sanitization, one-statement override replacement, release lineage, and cache invalidation. The result must keep these boundaries:

```ts
{
  writesSeedOverrideRuntime: true,
  writesSystemSeedRuntimeDirectly: false,
  writesTasksOrBaselinesDirectly: false,
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all new tests pass.

- [x] **Step 5: Write failing workbench-delegation tests**

Add a test for `action='runtime_apply'`, `assetType='algorithm_seed'`, and writer key `algorithmSeedOverrideReleaseExecutionService.publishApprovedCandidate`. Assert complete release evidence delegates once; missing consumer/monitoring/rollback evidence and wrong writer remain blocked.

- [x] **Step 6: Run the workbench test and verify RED**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts`

Expected: the new delegation test fails with `domain_operation_not_registered_for_asset_type`.

- [x] **Step 7: Register and delegate the writer**

Extend the workbench dependency interface, validation reasons, exact writer constant, delegation helper, and `runtime_apply` branch. Do not broaden any other algorithm-seed operation.

- [x] **Step 8: Run both Task 1 test files**

Expected: all tests pass with no runtime database connection.

### Task 2: Wizard preview scope parity

**Files:**
- Modify: `server/src/routes/projectWizard.ts`
- Modify: `server/src/__tests__/wizardGenerationSideEffects.test.ts`

**Interfaces:**
- `buildWizardProfilePreview(body, { projectId, companyId, constructionCalendar })`
- Route-scoped preview sends real project ID; unscoped preview sends company ID in generation context.

- [x] **Step 1: Write the failing route-scoped preview test**

Add an authorized `POST /api/projects/:id/wizard/preview` test that expects `generateWbsTemplateRows` to receive the route project ID and `operation.clientContext.companyId` to equal the authenticated company.

- [x] **Step 2: Verify RED**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/wizardGenerationSideEffects.test.ts -t "uses authenticated project and company scope for wizard preview duration assets"`

Expected: FAIL because generation receives `wizard-preview` and no company ID.

- [x] **Step 3: Implement scoped preview context**

Pass route project/company through preview options, use the real project ID when available, and put company ID in `clientContext`. Keep the existing synthetic ID for unscoped previews.

- [x] **Step 4: Verify GREEN and preserve unscoped behavior**

Run the new test plus the existing `previews project profile with location facts and target feasibility without creating tasks` test. Expected: both pass.

### Task 3: Durable candidate baseline review

**Files:**
- Modify: `server/src/routes/task-baselines.ts`
- Modify: `server/src/__tests__/planningRealignmentRoutes.test.ts`

**Interfaces:**
- `buildBaselineGovernanceMetadataWithCandidateReview(baseline, review)` returns existing metadata plus `candidate_governance_review`.

- [x] **Step 1: Extend the accepted-review test and verify RED**

After successful candidate baseline publication, assert the stored baseline row contains:

```ts
governance_metadata: expect.objectContaining({
  candidate_governance_review: expect.objectContaining({
    decision: 'accepted_for_baseline',
    reviewed_by: 'owner-1',
  }),
})
```

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/planningRealignmentRoutes.test.ts -t "publishes a candidate default master plan only with complete project manager review evidence"`

Expected: FAIL because only the response and change log contain the review.

- [x] **Step 2: Persist normalized review with publish/confirm updates**

Merge the normalized server review into existing baseline governance metadata and include it in both status update payloads. Do not trust client actor/time fields and do not overwrite existing candidate governance metadata.

- [x] **Step 3: Verify GREEN**

Run the Step 1 command. Expected: the baseline row, response, and audit log all contain the same normalized review.

### Task 4: Integrated verification and readiness refresh

**Files:**
- Modify only if generated by existing commands: `project-testing/reports/default-master-plan-production-readiness/*`

**Interfaces:**
- No new runtime interface. This task verifies boundaries and reports remaining external gates.

- [x] **Step 1: Run focused server tests**

Run all four affected test files. Expected: pass.

- [x] **Step 2: Run server and client type checks**

Run:

```powershell
npx tsc -p server/tsconfig.json --noEmit
npx tsc -p client/tsconfig.json --noEmit
```

Expected: both exit 0.

- [x] **Step 3: Run default-master-plan concurrency regression**

Run: `npm.cmd run evidence:default-master-plan:test-concurrent`

Expected: all default-master-plan Node and server Vitest suites pass.

- [x] **Step 4: Refresh read-only testing-center evidence**

Run the testing-center check and default-master-plan readiness dashboard without guarded write or live execution. Expected: local/tooling gates remain green; real DB, accepted samples, T2 approval, and production/live outcome gates remain explicitly external.

- [x] **Step 5: Review the scoped diff**

## Execution Result

- Completed on 2026-07-10 without real database, guarded writer, credential, staging, or production/live execution.
- Expanded server regression: 195 tests passed across the wizard, baseline, seed governance, seed import, and release-writer files.
- Testing-center regression: 624 Node tests and 147 server Vitest tests passed.
- T2 rhythm seed governance preflight now passes both required seed types without granting direct runtime write or auto-publish authority.
- Server and client TypeScript checks passed.
- Refreshed readiness remains 6/11 (54.5%): the five remaining gates require external runtime/source/sample/calibration/production evidence and are not code-completion failures.

Confirm no unrelated user files were reverted, no credential or production target was added, and no code path claims local tests are production evidence.
