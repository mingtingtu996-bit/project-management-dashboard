# Non-Residential Default Master Plan Asset Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all ten formal non-residential wizard plans satisfy a non-collapsing project-manager master-schedule contract using system duration, T2, dependency, organization, visibility, and governed learning assets.

**Architecture:** Preserve the existing wizard and managed-frontier generator. Move non-residential control definitions behind a typed seed contract, compose a shared control package with business-type specialty and existing-fact expansion rules, and require executable assembly to fail closed when the authored asset inventory cannot satisfy the approved plan contract.

**Tech Stack:** TypeScript, Vitest, existing WBS generator, algorithm seed resolver, duration/T2 registries, dependency rules, construction calendar, and transactional wizard writer.

## Global Constraints

- No LLM dependency in plan generation.
- No new required wizard fields.
- No deployment, staging, production/live, guarded write, or credential repair in this scope.
- Existing uncommitted changes and historical audit reports are preserved.
- Main-plan rows remain coarse controls; process/checklist/document detail stays in drilldown or metadata.
- Candidate/evidence assets do not alter runtime output.
- Confirmed plans are changed only through revision drafts and PM confirmation.
- Every behavior change follows red-green-refactor.

---

### Task 1: Non-Collapsing Executable Readiness Gate

**Files:**
- Modify: `server/src/services/defaultMasterPlanExecutableAssemblyService.ts`
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Test: `server/src/__tests__/defaultMasterPlanExecutableAssemblyService.test.ts`

**Interfaces:**
- Produces `readinessReasonCodes: string[]` and preserves `recommendedMinimumScheduleRowCount` as the effective minimum when it is within the configured maximum.
- Returns blocked when `availableScheduleRowCount` is below the effective minimum or operational floor.

- [ ] Add a failing assembly test with 18 valid hospital rows, configured range `[116, 172]`, and operational floor `80`; assert blocked, minimum `116`, `assetInventoryExhausted=true`, and reason `master_plan_asset_inventory_below_required_minimum`.
- [ ] Run `npm exec --workspace=server -- vitest run src/__tests__/defaultMasterPlanExecutableAssemblyService.test.ts` and confirm the new assertion fails because the current minimum collapses to 18.
- [ ] Replace the available-row-clamped minimum with `Math.min(maximum, Math.max(rowFloor, recommendedMinimum))`; add reason codes for inventory, operational floor, and configured minimum gaps.
- [ ] Remove the later hierarchy recalculation that again clamps the minimum to current row count.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Typed Non-Residential Asset Package

**Files:**
- Create: `server/src/seeds/nonResidentialMasterPlanAssetSeed.ts`
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Test: `server/src/__tests__/nonResidentialMasterPlanAssetSeed.test.ts`

**Interfaces:**
- Produces `NonResidentialMasterPlanActivityAsset`, `NonResidentialMasterPlanAssetPackage`, `NON_RESIDENTIAL_MASTER_PLAN_ASSET_PACKAGES`, and `buildNonResidentialMasterPlanActivities(input)`.
- Consumes only existing wizard facts and returns deterministic activity assets.

- [ ] Write failing tests for all ten business codes, unique stable codes, valid predecessor references, required asset/T2 mappings, and required control-capability codes.
- [ ] Verify RED because the typed seed module does not exist.
- [ ] Implement the shared control package, specialty packages, and building/functional-zone expansion using existing facts.
- [ ] Move the current inline business-type arrays behind the typed seed interface without changing residential generation.
- [ ] Re-run the asset tests and server typecheck.

### Task 3: Business-Type Content And Network Closure

**Files:**
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Modify: `server/src/services/defaultMasterPlanExecutableAssemblyService.ts`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`

**Interfaces:**
- Produces required capability coverage, phase coverage, one connected primary network, and explicit blocked reasons.

- [ ] Add one failing probe per business type asserting its required specialty controls and a visible-row count at or above the configured minimum.
- [ ] Add failing multi-building probes for hospital, school, industrial, data center, transportation hub, TOD, and modular construction.
- [ ] Generate shared and specialty rows, assign organization lanes, and connect each stream to project start and terminal handover.
- [ ] Ensure tower-crane, temporary-hoist, checklist, document-only, and quality-detail rows remain hidden unless classified as hard control gates.
- [ ] Run the managed-frontier test and inspect failures by business type rather than weakening thresholds.

### Task 4: Governed Runtime Asset Overlay In Wizard

**Files:**
- Create: `server/src/services/defaultMasterPlanRuntimeAssetBundleService.ts`
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Modify: `server/src/routes/projectWizard.ts`
- Test: `server/src/__tests__/defaultMasterPlanRuntimeAssetBundleService.test.ts`
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`

**Interfaces:**
- Produces `loadDefaultMasterPlanRuntimeAssetBundle({ companyId, projectId, businessType })` containing resolved standard duration, T2, benchmark/reference-day, visibility, dependency/organization, publication lineage, and consumer-observation inputs.
- Preview and commit consume the same bundle.

- [ ] Write failing precedence and tenant-scope tests for project, company, system stable, bootstrap, candidate, and rollback states.
- [ ] Implement batched bundle resolution through existing readers; do not duplicate publication SQL.
- [ ] Replace manual runtime-reference injection with the bundle while preserving explicit project facts as the highest-priority override.
- [ ] Pass `runtimeArtifactPublications` and consumer observation to generation; require receipts to carry version/publication lineage.
- [ ] Verify preview/commit parity and no-write preview behavior.

### Task 5: Learning Publication To Wizard Consumption

**Files:**
- Modify: `server/src/jobs/standardWorkDurationSeedReplayJob.ts`
- Modify: `server/src/jobs/defaultMasterPlanVisibilityLearningJob.ts`
- Modify: `server/src/jobs/durationContextPolicyLearningJob.ts`
- Modify: existing publication/rollback services only where orchestration input is missing.
- Test: corresponding job and publication service tests.

**Interfaces:**
- Low-risk results progress through candidate, shadow, bounded canary, monitoring, stable publication, cache invalidation, and rollback.
- Medium/high-risk structural results remain candidate until governed approval.

- [ ] Add failing end-to-end job tests proving candidate-only output cannot affect the wizard.
- [ ] Add failing tests proving an approved low-risk duration/visibility publication changes only attributable rows and carries a rollback target.
- [ ] Wire existing publication services into governed job orchestration with operation IDs and stage checkpoints.
- [ ] Verify rollback restores prior resolver output and confirmed plans receive revision drafts only.

### Task 6: Eleven-Type Local Acceptance

**Files:**
- Modify: `project-testing/tools/generate-executable-default-master-plan-simulation.mjs`
- Generate: `project-testing/reports/nonresidential-default-master-plan-asset-closure-20260712/*`
- Test: focused server and testing-center suites.

**Interfaces:**
- Produces per-type row counts, capability coverage, phase coverage, asset/T2/runtime lineage, dependency metrics, CPM metrics, and local-only environment classification.

- [ ] Run multiple probes per type and reject self-relaxed thresholds.
- [ ] Run server typecheck, focused Vitest, workspace-isolation guard, duration-architecture guard, and report integrity checks.
- [ ] Generate simple plan tables for all ten non-residential types and perform construction-manager review.
- [ ] Record deployment/staging/production/live as not run, not pass.
