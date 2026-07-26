# WorkBuddy Full Code Correctness Closeout Design

## Status

- Approved design direction: 2026-07-23
- Implementation base: `fb3bb914f5d5fca8cc3aee2b3e9c9981c8bd9f6e` (`github/main`)
- Development branch: `codex/full-code-correctness-closeout`
- Release policy: application deployment remains frozen until every workstream in this specification is implemented, independently reviewed, integrated, and verified on one immutable commit.
- Schema policy: additive migrations are allowed. Existing tables and APIs remain compatible for at least one release. Destructive rewrites are prohibited in this closeout.

## Purpose

Close the remaining verified code and product gaps from the duration-learning and planning audits without weakening the already-approved calendar, drawing atomicity, scheduled-job, task-summary, ingress, migration, or runtime-consumption behavior.

This is a code-correctness program, not a claim that staging or production is live. Local completion, staging acceptance, production migration, production deployment, and public acceptance remain separate states.

## Scope

The program contains six independently reviewable workstreams:

1. Canonical structured-cause authority and cause-aware benchmarks.
2. Persistent duration-asset review and a unified duration-assets administration surface.
3. Fourteen-day start-readiness aggregation and cross-domain execution-fact governance.
4. Learnable-parameter inventory, target-date probability, and heuristic dependency containment.
5. Post-intervention causal evaluation.
6. WBS generation modularization and scheduler residual classification.

The workstreams are integrated in that order. A later workstream may consume an earlier contract but must not reach into its persistence internals.

## Non-Goals And Environment Boundaries

- Do not deploy the application while this program is in progress.
- Do not apply new program migrations directly to staging or production during implementation.
- Do not treat local fixtures, candidate events, reports, or tests as production evidence.
- Do not modify historical migrations 309 through 323. New schema work starts after the current highest migration and declares its dependencies explicitly.
- Do not rewrite `EXECUTION_PROGRESS.json`; it is pre-existing malformed state and is not an implementation ledger for this program.
- Do not claim ICP approval, production Advisor freshness, production test-user availability, ingress reachability, migration completion, or live runtime consumption without environment evidence.
- Do not replace the existing governance workbench with a parallel approval platform.

## Global Invariants

### Compatibility

- Existing public DTO fields and routes remain available for one release unless they are provably unused internal-only contracts.
- New canonical fields are added to DTOs; old fields are compatibility projections with deprecation markers in code, not independent authorities.
- Database changes are additive and have a forward migration, a clean-install representation, and a rollback script.

### Tenant And Authority Safety

- Every company/project row validates that the project belongs to the company.
- Runtime writers use the established backend runtime role and fixed SQL/transaction helpers.
- Authenticated reads and review actions use company membership and project membership policies. Company administrators cannot review system/global assets.
- Global and industry assets remain service/operator governed; no legacy `users.global_role` value becomes a platform-operator boundary.
- Unknown tenant, scope, calendar identity, cause identity, model parameter, or publication identity fails closed.

### Transaction And Idempotency Safety

- A lifecycle decision and its required review item are one transaction. Failure to persist the review item fails the lifecycle attempt; it cannot be converted to a successful `manualFallback++` result.
- Every event-producing writer supplies a deterministic idempotency key.
- Corrections append a superseding fact/evaluation. Historical evidence is not overwritten.
- Cache invalidation, notifications, and health refresh occur only after commit.

### Availability Honesty

- Missing evidence returns an explicit unavailable state, not a natural-day, PERT-only, heuristic, or empty-data value labeled as authoritative.
- Candidate/advisory output remains usable where safe, but it is visibly distinct from a published dependency, benchmark, execution fact, or learned parameter.

## Workstream 1: Canonical Cause Authority

### Single Authority

The 14-code taxonomy in `structuredCauseAttributionService` becomes the only production business-cause identity. The legacy `progressDeviationCauseRegistry` becomes a translation adapter only.

The adapter contract is:

- Every legacy factor key maps to exactly one canonical cause code.
- Every legacy rule documents the canonical code and taxonomy version it emits.
- A coverage guard rejects an unmapped legacy factor, an unknown canonical target, duplicate ownership, or direct expansion of the legacy registry without a canonical mapping.
- `progressDeviationService`, `projectHealthDeviationSummaryService`, reports, responsibility read models, and duration experience aggregation consume canonical cause identities.
- Unknown values produce `causeAvailability = unavailable` and require review. They never silently become a confirmed `other` cause.

### Manual Text And Offline Labels

- Raw task delay text is retained in `raw_text`.
- Deterministic evidence may prefill a canonical cause, but free text alone cannot auto-confirm it.
- A user must confirm or change the controlled cause code before the attribution becomes benchmark-eligible or responsibility-eligible.
- `offline_label` is removed from new production inference inputs because no production producer exists. Historical evidence that names it remains readable but cannot create or confirm a new attribution.
- Responsibility remains separate from business cause and may only be set on a confirmed attribution.

### Cause-Aware Duration Evidence

Add `duration_benchmark_cause_segments`, linked to `duration_benchmarks`, rather than changing the meaning of the existing all-cause benchmark row. Each segment records:

- benchmark identity and version;
- canonical cause code and taxonomy version;
- sample count and numeric statistics;
- source window and generated timestamp;
- day basis and calendar identity;
- lineage to confirmed structured-cause attributions.

Only confirmed canonical causes enter a cause segment. Consumers prefer an exact cause segment when a confirmed cause is present and otherwise use the existing all-cause benchmark with an explicit fallback label.

### Acceptance

- Production services no longer import the legacy registry except through the canonical translator.
- All legacy factors and all accepted canonical values pass coverage tests; unknown values fail closed.
- Manual text remains raw evidence and cannot be benchmark-eligible before confirmation.
- No production caller emits `offline_label`.
- Material shortage, quality rework, drawing delay, weather, and other causes are not silently mixed in cause-specific results.

## Workstream 2: Persistent Duration-Asset Review And Benchmark Provenance

### Six Asset Families

The review workflow covers the six runtime asset keys already used by the lifecycle:

- `base_duration_benchmark`
- `standard_work_duration_seed`
- `special_work_duration_seed`
- `wbs_reference_days`
- `dependency_rule_candidate`
- `critical_path_rule_candidate`

### Persistence Model

Add `duration_asset_review_items` as a durable review projection over existing candidate, conflict, publication, and evidence records. It contains:

- scope, company, and project identity;
- asset key and stable artifact key;
- candidate event, conflict, and publication references when present;
- deterministic source/idempotency key;
- reason codes and a bounded review payload;
- status: `open`, `approved`, `rejected`, `superseded`, or `resolved_by_publication`;
- assignee/reviewer, review timestamps, and decision reason;
- creation and update timestamps.

The table does not duplicate candidate payload authority. It is an actionable queue and resolves back to existing governance operations.

Lifecycle behavior changes as follows:

- Conflict, insufficient evidence, policy-required manual review, or failed automatic eligibility persists an open review item.
- Repeated processing reuses the same item.
- Persistence failure fails the lifecycle attempt.
- Approval invokes the existing governed publication operation and records the resulting publication.
- Rejection or supersession cannot mutate a published runtime asset.

### Unified Administration Surface

Add `/admin/duration-assets` as the single entry point. It reuses the existing governance workbench operations and accuracy read models instead of creating another approval engine.

The page contains compact tabs for queue, published assets, monitoring, and accuracy. Filters cover asset family, scope, project, reason, status, and age. Existing `/admin/duration-accuracy` and `/admin/rule-assets/governance-workbench` routes remain compatible and link or redirect to the corresponding tab.

The page must include loading, empty, error, read-only, stale-data, and permission states. Review commands use existing confirmation dialogs, loading states, and error toasts.

### Benchmark Timestamp Contract

Add explicit provenance columns to `duration_benchmarks`: `generated_at`, `source_window_start`, and `source_as_of`. Existing rows backfill `generated_at` from `updated_at`; unknown source windows remain null and therefore unavailable rather than inferred.

Duration benchmark DTOs expose:

- `benchmarkGeneratedAt` from the persisted benchmark generation/update event;
- `benchmarkAsOf` for the latest included source event;
- `benchmarkWindowStart` when known;
- benchmark version, sample count, day basis, and scope.

`findBenchmark` reads these values explicitly. `DurationSuggestionTooltip` displays the data time and scope. If provenance is absent, it displays unavailable rather than inventing a timestamp.

### Acceptance

- Every manual fallback for all six asset families has one durable queue item.
- Queue writes are tenant-safe, idempotent, transactional, and RLS protected.
- Review actions reuse the established publication/governance writer.
- The unified page is navigable and fully operable for company-scoped assets.
- Global/industry items are visible only through an appropriately governed read path and cannot be mutated by a company administrator.
- Suggestions display persisted benchmark provenance.

## Workstream 3: Start-Readiness And Execution Facts

### Fourteen-Day Start-Readiness Read Model

Add a project service that returns tasks planned to start within the next 14 calendar dates as interpreted in the project business timezone. The service owns all aggregation; routes only validate input and serialize output.

For each task the read model returns:

- planned start date and construction-calendar identity;
- readiness state;
- unmet conditions grouped by controlled type;
- blocking material, drawing, certificate, predecessor, access, labor/equipment, and approval references;
- responsible party and next action when known;
- freshness/as-of timestamps.

It also returns summary counts registered in `metricRegistry`. Missing timezone or authoritative calendar identity fails closed for production-day metrics while date-only visibility remains available and clearly labeled.

Notifications use the same service output and existing dedupe/lease infrastructure. They do not recompute readiness independently.

### Append-Only Execution-Fact Authority

Add `execution_fact_events` and `executionFactGovernanceService` for task, risk, issue, material batch, drawing version, certificate, and acceptance facts.

Each fact records:

- tenant, project, entity type, and entity id;
- controlled fact type and value;
- effective time and observation time;
- source module, source event id, and actor;
- evidence references and confidence;
- correction/supersession lineage;
- deterministic idempotency key.

Existing task fields such as `actual_start_date`, `actual_end_date`, and `first_progress_at` remain compatibility projections. Their writers first pass the unified authority and project the accepted current fact in the same transaction.

Cross-domain services consume the current governed fact view, not ad hoc precedence rules. Corrections create a new event and supersede the prior current fact.

### Acceptance

- The route layer contains no business aggregation for the lookahead.
- The 14-day window is stable across month/year boundaries and server timezones.
- Notifications and UI consume the same read model.
- Direct writes that bypass execution-fact governance are rejected or covered by an explicit compatibility adapter.
- Corrections preserve history and current projections atomically.

## Workstream 4: Model Reliability

### Learnable-Parameter Inventory

Create a source-level inventory generator and guard. Every tunable parameter found in governed algorithm modules must be either:

- registered as learnable with owner, scope, bounds, default, evidence requirement, publication authority, monitor, and rollback target; or
- registered as frozen with an explicit reason and owner.

Unregistered tunables fail the guard and are frozen at runtime. The current explicit registry remains the runtime authority; generated inventory verifies coverage rather than writing production values.

### Target-Date Completion Probability

Add a target-date query to the existing scoped/project network probability service. Input includes project/scope, target date, as-of, simulation seed, and authoritative calendar identity. Output includes probability, confidence interval, sample count, probability basis, governing tasks, and availability.

The result uses the existing network Monte Carlo implementation. A task-only PERT result or a graph with missing required dependencies cannot be labeled a network completion probability. Such cases return unavailable with reason codes and may include a separately labeled analytic advisory.

### Heuristic Dependency Containment

`heuristic_stagger` and `heuristic_fallback_l0` remain candidate sequencing evidence only. They cannot be inserted as formal `task_dependencies` without a governed confirmation or an exact approved rule asset.

Generated plans may display the candidate edge and remain usable, but the DTO must expose candidate status, evidence level, and confirmation action. CPM and probability services exclude unconfirmed heuristic edges from authoritative graph claims.

### Acceptance

- Source-wide coverage reports zero unregistered tunables.
- Runtime mutation remains impossible for frozen entries.
- Target-date probability is deterministic under a fixed seed and fails closed without network/calendar authority.
- No unconfirmed L0 heuristic edge is persisted or counted as an authoritative dependency.

## Workstream 5: Post-Intervention Causal Evaluation

Add `algorithm_intervention_evaluations` and a service that records and evaluates a governed intervention after publication or an approved operational change.

Each evaluation records:

- intervention/publication identity and affected scope;
- declared proxy metric and observation start;
- pre-period and post-period windows;
- eligible control cohort definition and exclusions;
- rate/level inflection statistics;
- counterfactual estimate and uncertainty;
- data freshness and sample sufficiency;
- decision: `insufficient_data`, `no_detectable_effect`, `benefit_detected`, `harm_detected`, or `confounded`;
- monitor and rollback references.

The evaluator never promotes an asset. It may block further automatic promotion or request rollback through existing governance paths. Missing control evidence, proxy timing, or sufficient samples returns `insufficient_data`, not success.

### Acceptance

- Every guarded-live intervention has a persisted evaluation schedule or an explicit non-causal monitoring classification.
- Evaluation inputs are reproducible from lineage.
- Control, proxy-time, inflection, and counterfactual fields are required before a causal benefit claim.
- Harm or threshold breach produces an actionable governance result.

## Workstream 6: WBS Modularity And Scheduler Residual

### WBS Service Decomposition

Keep `wbsTemplateGenerationService.ts` as a compatibility facade while extracting cohesive modules for:

- input normalization and scope classification;
- asset and strategy selection;
- duration assembly;
- dependency candidate construction;
- physical handoff validation;
- closeout chain construction;
- output projection and lineage;
- audit/diagnostic formatting.

The facade must contain no domain algorithm and must be no more than 1,500 lines. New extracted modules must expose typed interfaces and may not import the facade. A boundary guard prevents domain logic from returning to the facade and prevents dependency cycles.

The extraction is behavior-preserving except for the separately specified heuristic dependency containment. Existing 11-business-type generation, subtype, CPM continuity, physical handoff, and closeout contracts remain green after every extraction step.

### Scheduler Residual

The source-wide timer guard allows only the realtime connection heartbeat. That heartbeat must have tested start/stop, single-instance, error isolation, and shutdown behavior and must not perform persistent business work. Any other recurring business timer must use the established persistent wall-clock scheduler, lease, retry, and catch-up contracts.

### Acceptance

- The facade meets the 1,500-line and no-domain-logic guard.
- Extracted modules have no dependency cycle and retain all generation behavior.
- Repository source contains no unapproved raw recurring business timer.
- The realtime heartbeat is explicitly classified and contract-tested.

## Migration Set

Implementation uses the following dependency order and exact migration identities:

1. `324_canonical_cause_and_benchmark_provenance.sql` for explicit benchmark provenance and `duration_benchmark_cause_segments`.
2. `325_duration_asset_review_queue.sql` for `duration_asset_review_items`.
3. `326_execution_fact_governance.sql` for `execution_fact_events`.
4. `329_algorithm_intervention_evaluations.sql` for `algorithm_intervention_evaluations`.

Migration identities `327_task_write_finalization_outbox.sql` and `328_duration_asset_platform_operator.sql` were already occupied when this workstream was integrated. The intervention evaluation schema therefore follows them as migration 329; this preserves numeric apply order and avoids reusing an immutable migration identity.

Every migration must provide:

- standalone forward SQL;
- the exact corresponding `CLEAN_MIGRATION_V4.sql` body/order;
- rollback SQL that restores the previous policy and schema state;
- RLS and direct-grant revocation tests;
- tenant mismatch and role-authority tests;
- checksum/readback contracts;
- no application or environment write during local verification.

## Error Handling

- Validation errors are typed 4xx responses with stable codes.
- Authority, tenant, persistence, transaction, publication, or scheduler failures are not downgraded to empty success.
- Database mutations use request/job transactions and abort-aware commit gates.
- Retryable job failure remains visible to the persistent slot and next run.
- UI commands retain the queue item and show a retryable error when an operation fails.
- Unavailable data carries reason codes through service, route, API client, and UI.

## Test And Review Strategy

Each workstream follows RED -> GREEN -> refactor and receives a dedicated immutable review before integration.

Required evidence per workstream:

- focused unit and service tests;
- route/API contract tests;
- migration forward/CLEAN/rollback tests where schema changes;
- transaction, idempotency, RLS, and tenant tests;
- server and client typecheck for touched surfaces;
- clean-checkout import-closure and architecture guards;
- UI component tests and Playwright desktop/mobile checks for `/admin/duration-assets`;
- `git diff --check`, exact manifest, clean index/worktree, and immutable SHA.

Required final evidence on the combined SHA:

- all focused cross-workstream suites;
- complete workflow contract gate;
- server and client typecheck/test/build gates;
- migration entry-point, drift, rollback, and governance guards;
- source-wide timer, parameter, cause-authority, heuristic-dependency, and WBS-boundary guards;
- independent whole-branch review with no open P0/P1/P2 findings.

## Integration And Release Sequence

1. Implement and approve Workstream 1.
2. Rebase the next owner on the approved immutable commit, then implement Workstream 2.
3. Repeat for Workstreams 3 through 6.
4. Form one clean integration candidate and run the full combined gates.
5. Push and merge only after review and CI approval.
6. Refresh staging secrets/evidence and apply all pending migrations in numeric order to staging.
7. Run staging DB readback, tenant/RLS checks, application smoke, queue operations, target probability, and rollback rehearsal on the exact merged SHA.
8. Resolve production Advisor freshness, production test-user credentials, ICP/ingress, and maintenance-window gates.
9. Apply production migrations and deploy the same SHA only after all production preflights pass.
10. Record production/live acceptance separately from local and staging completion.

## Completion Definition

The code program is complete only when all six workstreams are present on one clean immutable commit, their migrations and compatibility contracts are complete, the full local/CI gates pass, and independent review reports no unresolved P0/P1/P2 issue.

The overall deployment goal is complete only after the same merged SHA is migrated, deployed, and publicly accepted in production with fresh environment evidence. Code completion alone is not a live claim.
