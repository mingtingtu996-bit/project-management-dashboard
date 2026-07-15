# Algorithm Seed Governance Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out algorithm seed governance services 27-31 with diagnostics, safer import semantics, auditable auto-governance, idempotent learning candidates, and shared payload validation.

**Architecture:** Keep the existing lifecycle unchanged: import -> validate -> resolve -> learn candidate -> auto-govern override. Add observability and guardrails around the lifecycle instead of creating a parallel rule system.

**Tech Stack:** TypeScript, Vitest, Supabase query builder.

---

### Task 1: Resolver Diagnostics

**Files:**
- Modify: `server/src/services/algorithmSeedResolver.ts`
- Test: `server/src/__tests__/algorithmSeedGovernanceFlow.test.ts`

- [ ] Add a failing test for resolver diagnostics that reports effective source, suppressed sources, and fallback reason.
- [ ] Implement `resolveAlgorithmSeedRecordsWithDiagnostics()` while preserving `resolveAlgorithmSeedRecords()` behavior.
- [ ] Run the focused algorithm seed governance tests.

### Task 2: Payload Validation And Idempotent Candidates

**Files:**
- Modify: `server/src/services/algorithmSeedValidationService.ts`
- Modify: `server/src/services/algorithmSeedLearningService.ts`
- Test: `server/src/__tests__/algorithmSeedGovernanceFlow.test.ts`

- [ ] Add failing tests for candidate payload validation and duplicate candidate reuse.
- [ ] Export a reusable runtime payload validator from the validation service.
- [ ] Normalize and validate candidate/override payloads before writes.
- [ ] Add a deterministic candidate fingerprint and reuse existing pending/candidate-only candidates.

### Task 3: Auto-Governance Audit

**Files:**
- Modify: `server/src/services/algorithmSeedAutoGovernanceService.ts`
- Test: `server/src/__tests__/algorithmSeedCandidateDiscoveryService.test.ts`

- [ ] Add failing tests that decision results include threshold snapshot, evidence gate, and score breakdown.
- [ ] Persist the richer audit payload in candidate and override governance result.
- [ ] Run focused auto-governance tests.

### Task 4: Staged Import And Rollback Helper

**Files:**
- Modify: `server/src/services/algorithmSeedImportService.ts`
- Modify: `server/src/routes/algorithm-seeds.ts`
- Test: `server/src/__tests__/algorithmSeedImportService.test.ts`

- [ ] Add failing tests for staged import activation order and rollback/deprecate helper.
- [ ] Insert or update versions as `draft`, insert records, then activate and deprecate previous current versions.
- [ ] Export `rollbackAlgorithmSeedVersion()` and expose it through the admin route.

### Task 5: Rule Asset Inventory

**Files:**
- No production code required unless a reusable inventory helper is already present.

- [ ] Scan rule/seed/registry assets outside `ALGORITHM_SEED_REGISTRY`.
- [ ] Summarize assets not yet governed by algorithm seed lifecycle.
