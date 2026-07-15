# Default Master Plan Significance And Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wizard-generated default master plans show project-manager-level control activities while retaining detailed constraints for calculation, and connect explicit PM row decisions to the governed learning loop without any LLM runtime dependency.

**Architecture:** Add a governed `master_plan_visibility_policy` seed asset and a deterministic significance service. The service classifies every generated row, keeps contractual/control/interface rows visible, demotes temporary-work and detail rows to internal projections, rewires visible dependencies across hidden rows, and exposes an auditable summary. Explicit preview/delete decisions become candidate-only feedback; a scheduled learner aggregates repeat evidence into governed policy candidates, while the wizard consumes only active published seed records through `algorithmSeedResolver`.

**Tech Stack:** TypeScript, Vitest, existing algorithm seed resolver/governance services, existing scheduler, WorkBuddy project-testing tools.

## Global Constraints

- No LLM call or LLM-generated content in the runtime plan-generation path.
- No direct write to production tasks, dependencies, baselines, seeds, or runtime publications from preview, feedback, or learning code.
- Contractual milestones and protected handover gates cannot be hidden by learned policy.
- Company/project learning remains tenant-scoped; unpublished feedback is candidate-only.
- Existing dirty-worktree changes must be preserved.

---

### Task 1: Governed Visibility Policy And Deterministic Classification

**Files:**
- Create: `server/src/seeds/defaultMasterPlanVisibilityPolicySeed.ts`
- Create: `server/src/services/defaultMasterPlanVisibilityService.ts`
- Modify: `server/src/services/algorithmSeedRegistry.ts`
- Modify: `server/src/services/algorithmSeedResolver.ts`
- Test: `server/src/__tests__/defaultMasterPlanVisibilityService.test.ts`

**Interfaces:**
- Produces: `resolveDefaultMasterPlanVisibilityPolicy(context)` and `applyDefaultMasterPlanVisibilityPolicy(input)`.
- Consumes: generated rows, business type, project/company scope, and governed/fallback policy records.

- [ ] Write tests proving temporary vertical-transport activities remain in the internal network but are absent from visible schedule rows.
- [ ] Write tests proving contractual milestones and interface gates remain visible even when an override requests hiding.
- [ ] Write tests proving hidden predecessor chains are bridged to visible predecessors without dangling dependencies.
- [ ] Run the targeted test and confirm it fails because the service and seed type do not exist.
- [ ] Implement the seed type, resolver, classifier, metadata audit trail, coverage guard, and dependency bridge.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Wizard And Executable Assembly Integration

**Files:**
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Modify: `server/src/services/defaultMasterPlanExecutableAssemblyService.ts`
- Modify: `project-testing/tools/generate-executable-default-master-plan-simulation.mjs`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`
- Test: `server/src/__tests__/defaultMasterPlanExecutableAssemblyService.test.ts`

**Interfaces:**
- Consumes: Task 1 visibility decisions.
- Produces: `masterPlanVisibilitySummary` in generation results and a simple visible plan whose hidden support rows remain candidate/internal evidence.

- [ ] Add failing residential tests asserting tower-crane and construction-hoist support rows are hidden while core stage/control coverage remains complete.
- [ ] Add failing non-residential tests asserting managed-frontier profile rows are retained and detailed catalog rows are not promoted to satisfy a row floor.
- [ ] Apply visibility policy after profile generation and before executable assembly.
- [ ] Prevent assembly promotion of rows explicitly rejected by visibility policy and replace row-count-only readiness with policy/phase coverage evidence.
- [ ] Include the visibility summary in simulation output and rerun targeted tests.

### Task 3: PM Feedback Candidate And Automated Aggregation

**Files:**
- Create: `server/src/services/defaultMasterPlanVisibilityFeedbackService.ts`
- Create: `server/src/services/defaultMasterPlanVisibilityLearningService.ts`
- Create: `server/src/jobs/defaultMasterPlanVisibilityLearningJob.ts`
- Modify: `server/src/services/wbsTemplateCandidateEventService.ts`
- Modify: `server/src/routes/tasks.ts`
- Modify: `server/src/scheduler.ts`
- Test: `server/src/__tests__/defaultMasterPlanVisibilityFeedbackService.test.ts`
- Test: `server/src/__tests__/defaultMasterPlanVisibilityLearningService.test.ts`
- Test: `server/src/__tests__/defaultMasterPlanVisibilityLearningJob.test.ts`
- Test: `server/src/__tests__/schedulerJobContracts.test.ts`

**Interfaces:**
- Produces: candidate-only per-row PM feedback and repeat-evidence policy candidates.
- Consumes: explicit preview selections and deletion of generated master-plan tasks.

- [ ] Write failing tests for explicit keep/hide feedback, protected-row rejection, tenant-scoped aggregation, and minimum independent-project evidence.
- [ ] Persist feedback through the unified algorithm asset candidate adapter with no runtime mutation.
- [ ] Add a daily learner that reads feedback candidates and emits `master_plan_visibility_policy` candidates only when sample/agreement gates pass.
- [ ] Wire preview-selection and generated-task deletion feedback into task commit/delete flows without blocking the user operation on governance-write failure.
- [ ] Register the job in the scheduler and run targeted tests.

### Task 4: Verification And Simulated Project Acceptance

**Files:**
- Modify only if needed: `project-testing/reports/executable-default-master-plan-20260711/*`

**Interfaces:**
- Verifies: pure code behavior, local generation flow, construction-plan content, and no-write boundaries.

- [ ] Run targeted Vitest suites for visibility, assembly, wizard generation, feedback, learner, and scheduler.
- [ ] Run server typecheck.
- [ ] Run the testing-center integrity check.
- [ ] Generate a fresh three-building residential plan under `project-testing/reports/executable-default-master-plan-20260711`.
- [ ] Verify the visible table excludes temporary tower-crane/hoist rows, retains all major stages and protected milestones, has no dangling dependencies/cycles, and reports candidate-only learning lineage.
- [ ] Record local-static versus live/production boundaries in the final result.
