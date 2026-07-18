# v1.4.23.1 Learning Asset Architecture Closure Implementation Plan

> **Execution rule:** Every behavior change follows RED -> GREEN -> focused regression. Do not modify BI, generic tenant infrastructure, production monitoring, or deploy workflows.

**Goal:** Close the learning/calibration asset architecture with strict tiered automation, governed raw-sample access, tenant-safe and atomic publication, complete C-19.01 registration, and recoverable sample collection.

## Task 1: Central Automation Policy

- [x] Add failing tests for strict project/company/industry/global canary and stable floors.
- [x] Add negative tests for duplicated edits, behavioral-only stable promotion, equal MAE, tenant ambiguity, structural changes and recent rollback.
- [x] Implement `durationLearningAssetAutomationPolicyService` with immutable hard floors and tighten-only overrides.
- [x] Make insufficient evidence return collecting/candidate instead of manual review.

## Task 2: C-19.01 Asset Identity Registry

- [x] Extend `experienceTierRegistryService` with allowed `reuseScope` and `factSource` declarations.
- [x] Validate or resolve tier, asset type, scope and source on every learning candidate.
- [x] Add registry contract tests for mixed-tier, mixed-scope and unsupported fact-source rejection.

## Task 3: Unified Candidate And Runtime Publication

- [x] Route the duration context auto-publish gate through the central policy.
- [x] Require all automatically promoted assets to pass canary before stable.
- [x] Keep structural or tenant-conflicted changes as exception review only.
- [x] Preserve the previous stable publication until monitoring succeeds; rollback restores it atomically.

## Task 4: Raw Sample Boundary

- [x] Move direct progress-velocity sample SQL into `durationContextSampleReadModelService`.
- [x] Permit project/company validated raw reads only; require governed aggregate/runtime publication for industry/global consumers.
- [x] Persist explicit company, tier, scope, fact-source and lineage fields on samples.
- [x] Add static and unit tests preventing runtime consumers from querying raw samples directly.

## Task 5: Tenant-Safe Approval And Atomic Stores

- [x] Require `companyId` on canary approve/reject/rollback operations and route calls.
- [x] Validate candidate project ownership and constrain every mutation by company.
- [x] Make candidate/version activation, benchmark replacement and project calibration replacement transactional.
- [x] Make rollback reactivate the previous stable version, not only label the current row.

## Task 6: Missed-Sample Reconciliation

- [x] Add a retry queue migration and indexes/RLS.
- [x] Enqueue collection failures without failing task completion.
- [x] Reconcile failed and missing completed-task samples idempotently from the existing learning job.
- [x] Add retry-budget and dead-letter tests.

## Task 7: Migration And Registry Contracts

- [x] Add migration 305 and append the exact segment to `CLEAN_MIGRATION_V4.sql`.
- [x] Register new services and migration in `system-domain-registry.json`.
- [x] Add migration coverage and RLS/constraint contract tests.

## Task 8: Verification

- [x] Run all focused learning, publication, approval, sample and migration tests.
- [x] Run duration architecture, system registry and SQL guards; distinguish cross-track shared-workspace failures.
- [x] Run server TypeScript checking and report unrelated failures separately.
- [x] Perform a read-only real-DB check for sample identity and tenant fields; do not write production.
- [x] Report local, deployed staging and production/live status separately.

## Task 9: Structured Cause Dimension Follow-up

- [x] Add one controlled taxonomy and candidate/confirmed/rejected state machine for task, risk, issue and baseline-change subjects.
- [x] Infer task causes from scoped obstacle, condition, dependency, material-arrival and forecast facts before duration sample collection.
- [x] Require user confirmation before contractual responsibility is stored; exclude responsibility from algorithm facts, fingerprints and benchmark keys.
- [x] Snapshot confirmed causes into duration sample metadata; keep unconfirmed candidates count-only.
- [x] Add structured risk/issue closure result fields and UI payload contracts; keep migrations 317/318 pending until controlled deployment.
- [x] Require baseline publication cause classification and original wording; atomically write the `baseline_publish` change log and confirmed `baseline_change` attribution with the baseline state transition.
- [x] Verify current evidence SQL against the configured real Supabase in a read-only transaction.

## Verification Record (2026-07-14)

- Focused regression: 25 files / 457 tests passed, covering automation policy, tier registry, replay, canary, tenant approval, atomic stores, raw-sample boundary, reconciliation, migrations and the affected runtime consumers.
- TypeScript: `npm.cmd exec --workspace server -- tsc -p tsconfig.json --noEmit --pretty false` passed.
- Duration architecture: `guard:duration-architecture` passed, 954 files scanned, legacy debt 0.
- System registry: this closure's entries pass validation. The global guard remains red on migrations 300/301/302/304/306, `company-dashboard`, `acceptancePlanTaskLinkService`, `wizardGenerationSummaryService`, and stale `health` / `dueDateService.example`; these are separate shared-workspace tracks.
- SQL guard: 7/8 assertions passed; the remaining four findings are pre-existing shared-track literals in `dataQualityService` (two JOINs), `executionGateSeedService` (JOIN) and `planningIntegrityService` (COALESCE), outside this closure.
- Read-only staging readback: migration 305 is not ledgered; the five sample identity columns, project calibration `company_id`, reconciliation queue and two atomic publication functions are absent. No migration or business write was executed.
- Classification: `local-current-code=implemented and focused-verified`; `deployed-staging=pending migration 305 and same-SHA deployment`; `production/live=not deployed or validated`.
- Raw-date follow-up: reconciliation retry/deferred one-day offsets now use `calendarDaysToMilliseconds(1)` from the duration-day domain helper. RED reproduced the missing helper contract; GREEN passed 1 file / 9 tests, `guard:raw-date-math` scanned 667 server files with 65/65 approved sites, and server TypeScript passed.

## Verification Addendum (2026-07-17)

- Environment correction: the currently configured real Supabase ledger contains migration 305 and 307. This does not prove a same-SHA deployed staging release; migration 317/318 remains unapplied in that database.
- Structured-cause service regression: 1 file / 10 tests passed. A real PostgreSQL bind-count defect found by the read-only smoke was reproduced RED and fixed by separating two-parameter scope queries from four-parameter window queries.
- Real-DB read-only compatibility: `loadTaskStructuredCauseEvidence` completed all five fact queries under `workbuddy_runtime_login`; the selected task returned 51 evidence rows with no write or migration.
- Risk/issue UI regression: 1 file / 17 tests passed, including ordinary risk closure and the full issue `investigating -> resolved -> closed` payload with a confirmed attribution ID.
- Baseline publication regression: service 12/12, route 30/30 and client 13/13 passed. Missing or unknown causes fail before mutation; attribution failure rolls the publication transaction back; ordinary project names do not create false cause preselection. Migration 317 remains unapplied, so this is local code evidence only.
- Classification remains `local-current-code + real-DB-read-only=verified for this increment`; `deployed-staging` and `production/live` remain unverified for migrations 317/318 and the new user workflow.
