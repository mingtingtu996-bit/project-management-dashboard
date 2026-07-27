# Project Wizard Profile Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-profile confirmation loop before WBS generation, using existing template generation and target-duration compression preview instead of creating a parallel duration algorithm.

**Architecture:** The backend exposes a preview endpoint that builds canonical project facts, location facts, recommendation, estimated row count, generated preview feasibility, and confirmation issues from the same wizard payload used for commit. The frontend inserts a profile confirmation step before generation, hides starting-line inputs for new projects, derives starting-line buildings from the scope tree, and upgrades scope-description parsing with deterministic structured rules.

**Tech Stack:** Express + TypeScript backend, React + TypeScript frontend, existing WBS template generation service, Vitest tests.

---

### Task 1: Backend Profile Preview Contract

**Files:**
- Modify: `server/src/routes/projectWizard.ts`
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`

- [x] Add `buildWizardLocationFacts(payload.location)` to normalize province/city/climate facts and inject them into `projectFacts`, `operation.scope`, and `operation.clientContext`.
- [x] Extend `handleWizardPreview` to optionally run `generateWbsTemplateRows` with the existing `compression_preview` target context and return `targetFeasibility`.
- [x] Return a `profile` object containing identity, scale facts, recommendation, location facts, confirmation issues, expected row count, and target feasibility.
- [x] Add tests proving preview uses existing `generateWbsTemplateRows`, does not create tasks, and includes location facts.

### Task 2: Frontend API Types

**Files:**
- Modify: `client/src/components/project/wizard/projectWizardApi.ts`
- Modify: `client/src/components/project/wizard/types.ts`

- [x] Add `WizardProfilePreview` and `previewWizardProfile(payload)` API.
- [x] Keep `WbsTargetFeasibility` as the existing target-duration contract.
- [x] Add wizard step support for a profile confirmation step while keeping existing payload shape compatible.

### Task 3: Profile Confirmation UI

**Files:**
- Create: `client/src/components/project/wizard/Step6ProjectProfileConfirmation.tsx`
- Modify: `client/src/pages/ProjectInfoModule/ProjectInfoModule.tsx`

- [x] Add a business-facing confirmation page: project identity, scale, generated template sources, location facts, row estimate, target-duration preview, and confirmation issues.
- [x] Load preview when entering the confirmation step, with loading/error/empty states.
- [x] Move actual generate button to the confirmation page. `Step6Generation` remains the detail-level/company-template configuration step.

### Task 4: Dynamic Wizard Flow

**Files:**
- Modify: `client/src/pages/ProjectInfoModule/ProjectInfoModule.tsx`
- Modify: `client/src/components/project/wizard/StepIndicator.tsx`

- [x] New project flow: identity -> business/method -> scope -> features -> generation settings -> profile confirmation.
- [x] Starting-line flow: identity -> business/method -> scope -> features -> starting line -> generation settings -> profile confirmation.
- [x] Selecting `planScopeCaliber='continuation_start_line'` switches mode to `starting_line`; switching to `new` clears starting-line-only fields.
- [x] Do not show starting-line controls for new projects.

### Task 5: Starting-Line Building Source

**Files:**
- Modify: `client/src/components/project/wizard/Step5StartingLine.tsx`

- [x] Replace `MOCK_BUILDINGS` with buildings derived from `draft.scopeTree`.
- [x] Build floor options from building metadata `standardFloorCount` and child floor nodes.
- [x] Show an actionable empty state if no buildings exist in scope.

### Task 6: Structured Scope Parser

**Files:**
- Modify: `client/src/components/project/wizard/Step3EngineeringScopeScale.tsx`

- [x] Enhance `buildScopeTreeFromDescription()` to parse multi-building phrases, phase/section markers, tower/podium mixed uses, basement facts, functional areas, and outdoor zones.
- [x] Keep it deterministic and transparent; no LLM.
- [x] Ensure parsed functional areas are available for profile issues and feature suggestions.

### Task 7: Verification

**Files:**
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`
- Test: `client/src/components/project/__tests__/*` or existing wizard tests

- [x] Run targeted backend wizard tests.
- [x] Run targeted frontend wizard tests or client typecheck if test surface is limited.
- [x] Run `npx tsc -p client/tsconfig.json --noEmit` and `npx tsc -p server/tsconfig.json --noEmit`.

Verification note:
- Targeted frontend wizard tests passed: Step3/Step4/Step5/Step6, 31 tests.
- Targeted backend wizard preview tests passed: `wizardGenerationSideEffects.test.ts`, 19 tests.
- Client TypeScript passed.
- Server TypeScript was attempted, but full compilation is currently blocked by an unrelated pre-existing syntax/binary-file issue in `server/src/__tests__/certificateTemplateService.test.ts`.
