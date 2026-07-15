# Duration Closure Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the v1.4.23.1 duration closure gaps as current code facts: unified L3 input assembly, first-class experience tier persistence, broader E1-E5 engine intake, and reduced direct fact reads in `durationContextService`.

**Architecture:** Keep L0/L1/L5 asset governance separate from L2-L4 computation. Add narrow read-model and assembly contracts first, then migrate engine consumers to the assembler without granting write authority or changing duration numbers.

**Tech Stack:** TypeScript, Vitest, Supabase query builders, existing WorkBuddy server services.

## Global Constraints

- Follow `EXECUTION_PROGRESS.json` project discipline and v1.4.23.1 boundaries.
- New behavior must be test-first: write a failing Vitest contract before production code.
- No runtime writer may write `tasks`, `task_dependencies`, plan dates, seed, baseline, critical-path facts, or runtime publications unless it is an existing governed writer with release/rollback gates.
- Tier means `T1/T2/T3` experience granularity and must stay separate from `DurationLearningScope`.
- L0-L5 processing-layer labels are governance and assembly boundaries, not UI labels or dependency-seed L3/L4/L5 labels.

---

### Task 1: Expand DurationInputAssembler Channels

**Files:**
- Modify: `server/src/services/durationAlgorithmInputHydrationService.ts`
- Modify: `server/src/services/durationInputAssemblerService.ts`
- Test: `server/src/__tests__/durationInputAssemblerService.test.ts`

**Interfaces:**
- Consumes: `assembleDurationInput(input, options)`
- Produces: input channels named `actualExecutionFacts`, `durationExperienceSignals`, and `criticalPathEvidence`

- [ ] **Step 1: Write failing tests**

Add tests asserting that `assembleDurationInput` accepts explicit `actualExecutionFacts`, `durationExperienceSignals`, and `criticalPathEvidence`, exposes them as independent read-only channels, includes them in `sourceLineage`, and keeps all mutation boundary flags false.

- [ ] **Step 2: Verify RED**

Run: `npx.cmd vitest run --config server/vitest.config.ts server/src/__tests__/durationInputAssemblerService.test.ts --reporter=basic`

Expected: FAIL because the new channel names do not exist.

- [ ] **Step 3: Implement minimal assembler support**

Add typed fields to hydration input/result, source detection helpers, channel builders, and assembler result output. Do not read new DB tables in this task.

- [ ] **Step 4: Verify GREEN**

Run the same Vitest command. Expected: PASS.

### Task 2: Make Experience Tier Persistable as a First-Class Candidate Column

**Files:**
- Add: `server/migrations/277_v14231_algorithm_asset_candidate_experience_tier.sql`
- Modify: `server/src/services/algorithmAssetGovernancePersistenceService.ts`
- Modify: producer tests touching `algorithm_asset_candidate_events`
- Test: `server/src/__tests__/experienceTierRegistryService.test.ts` or a focused persistence test

**Interfaces:**
- Consumes: candidate payload fields `experienceTier`, `experienceAssetType`
- Produces: persisted columns `experience_tier`, `experience_asset_type`, with JSON fallback retained for compatibility

- [ ] **Step 1: Write failing persistence/SQL test**

Assert the migration adds `experience_tier` with `T1/T2/T3` check, `experience_asset_type`, and indexes for candidate lookup.

- [ ] **Step 2: Verify RED**

Run the focused migration/contract test. Expected: FAIL because columns are missing.

- [ ] **Step 3: Implement migration and persistence mapping**

Map candidate payload tier fields into new columns while preserving existing JSON payload.

- [ ] **Step 4: Verify GREEN**

Run focused tests and `npx.cmd tsc -p server/tsconfig.json --noEmit --pretty false`.

### Task 3: Replace Hard-Pinned T3 Parameter Learning with Tier-Aware Input

**Files:**
- Modify: `server/src/services/durationContextPolicyParameterLearningService.ts`
- Modify: `server/src/__tests__/durationContextPolicyParameterLearningService.test.ts`

**Interfaces:**
- Consumes: `state_vector.experienceTier`, explicit `state_bucket`, and model-family defaults
- Produces: validated bucket with the correct tier; T3 remains only the default for project productivity parameters

- [ ] **Step 1: Write failing tests**

Assert evaluated decisions with `state_vector.experienceTier='T1'` are grouped into `experience:T1` when the model family permits it, while incompatible explicit buckets still reject.

- [ ] **Step 2: Verify RED**

Run the focused Vitest file. Expected: FAIL because all generated buckets are `experience:T3`.

- [ ] **Step 3: Implement tier resolver**

Read tier from the decision state vector, validate through `durationContextPolicyStateBucketService`, and keep T3 as a fallback only when no tier exists.

- [ ] **Step 4: Verify GREEN**

Run focused tests.

### Task 4: Route E2/E3/E4/E5 Through the Assembler Evidence Contract

**Files:**
- Modify: `server/src/services/taskDurationForecastService.ts`
- Modify: `server/src/services/projectCriticalPathService.ts`
- Modify: `server/src/services/projectRemainingDurationForecastService.ts`
- Modify: `server/src/services/scheduleAccelerationRuntimeService.ts`
- Tests: corresponding existing service tests

**Interfaces:**
- Consumes: `durationInputAssembly` on forecast/runtime contexts
- Produces: `forecastSources.durationInputAssembly` for E2, critical-path lineage evidence for E3, project remaining forecast evidence for E4, and existing E5 runtime evidence

- [ ] **Step 1: Write failing tests per engine**

Assert each engine records assembler lineage without changing forecast dates, critical path, or recoverable days.

- [ ] **Step 2: Verify RED**

Run focused engine tests. Expected: FAIL for engines not yet consuming the assembler.

- [ ] **Step 3: Implement minimal pass-through evidence**

Attach assembler output as read-only evidence only; do not use it to mutate plan dates or dependencies.

- [ ] **Step 4: Verify GREEN**

Run focused engine tests.

### Task 5: Extract DurationContext Direct Fact Reads Behind Read Models

**Files:**
- Add: `server/src/services/durationContextFactReadModelService.ts`
- Modify: `server/src/services/durationContextService.ts`
- Test: `server/src/__tests__/durationContextService.test.ts`
- Test: `server/src/__tests__/durationArchitectureBoundaryGuard.test.ts`

**Interfaces:**
- Consumes: existing Supabase reads for task context, readiness rows, progress snapshots, resource pressure rows, data-quality findings, workflow dependencies
- Produces: read-model functions used by `durationContextService`

- [ ] **Step 1: Write failing boundary test**

Assert `durationContextService.ts` no longer contains direct `.from('tasks')`, `.from('task_conditions')`, `.from('task_obstacles')`, `.from('project_materials')`, `.from('task_progress_snapshots')`, `.from('data_quality_findings')`, or `.from('task_dependencies')`.

- [ ] **Step 2: Verify RED**

Run boundary test. Expected: FAIL on current direct reads.

- [ ] **Step 3: Extract read-model functions**

Move direct reads into `durationContextFactReadModelService.ts`, preserving existing query fields and error behavior.

- [ ] **Step 4: Verify GREEN**

Run `durationContextService.test.ts` and boundary guard tests.

### Task 6: Update v1.4.23.1 Evidence Only After Code Passes

**Files:**
- Modify: `docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md`
- Modify: `docs/plans/v1.4.23.1-A体系收口台账与验收门禁矩阵.md`

**Interfaces:**
- Consumes: passing focused tests and static guards
- Produces: corrected evidence statements that distinguish landed code from still-gated live/runtime claims

- [ ] **Step 1: Add doc assertions only for verified work**

Do not upgrade `production-ready` or live closeout claims unless the relevant tests and current evidence prove it.

- [ ] **Step 2: Verify docs**

Run `git diff --check` and any existing v14231 non-live closeout verification command.
