# Workstream 1 Task 4 Report

## Status

DONE

## Commits

- Base: `255d70edef78596fb5a2fef2544a1789c727974a`
- Verified implementation HEAD/full commit: `1c0ac488c10b59d45858ca55d13eaa3c2aca58be`
- Implementation commit subject: `feat(duration): select cause-aware benchmark segments`
- The report itself is committed separately after the verified implementation commit so that this report can contain the implementation commit's full immutable SHA.

## Exact Manifest

- `.superpowers/sdd/task-4-report.md`
- `server/src/services/durationBenchmarkCauseSegmentService.ts`
- `server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts`
- `server/src/services/durationLearningAssetAtomicStoreService.ts`
- `server/src/services/durationSuggestionService.ts`
- `server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts`
- `server/src/__tests__/durationSuggestionService.test.ts`

No adjacent type-file expansion was required: `DurationBenchmarkRow`, `DurationSuggestionInput`, and `DurationSuggestion` are defined in the brief-listed `durationSuggestionService.ts`. Migration 324, UI, deployment, database state, and other workstreams were not touched.

## RED Evidence

The requested root command initially could not launch because the root `node_modules/.bin` has no Vitest executable:

```text
npx vitest run --config server/vitest.config.ts --configLoader runner ...
'vitest' is not recognized as an internal or external command
```

The same command was then run with the repository's existing server-local Vitest binary (`server/node_modules/.bin/vitest.cmd`) and the required `--configLoader runner`:

- Initial RED: missing cause-segment module; atomic writer lacked exact `project_id` replacement scope and did not roll back on segment failure. Result: 2 failed files, 2 failed tests, 99 passed.
- Suggestion RED: exact confirmed cause was not loaded/exposed and all-cause fallback was not marked. Result: 2 failed, 94 passed.
- Benchmark-column RED: insert SQL omitted `project_id`, `generated_at`, `source_window_start`, and `source_as_of`. Result: 1 failed, 6 skipped.
- Aggregation RED: duplicate attributions double-counted one sample and source-window SQL was absent. Result: 1 failed, 1 passed.
- Persisted-timestamp RED: PostgreSQL `Date` values were converted with locale text instead of ISO timestamps. Result: 1 failed, 6 skipped.

Each RED failed on the intended missing behavior before its corresponding production change was restored or added.

## GREEN And Gates

Focused:

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts
```

Result: PASS, 3 files, 105 tests.

Focused plus adjacent:

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts server/src/__tests__/durationSuggestionSimulation.test.ts server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts
```

Result: PASS, 5 files, 157 tests.

TypeScript:

```powershell
& .\node_modules\.bin\tsc.cmd -p server/tsconfig.json --noEmit
```

Result: PASS, exit 0, no diagnostics.

Repository checks before the implementation commit:

```powershell
git diff --check
git status --short
```

Result: `git diff --check` passed. Git emitted only the repository's existing LF-to-CRLF checkout warnings. Status contained exactly the six brief-listed implementation/test files. After implementation commit `1c0ac488c10b59d45858ca55d13eaa3c2aca58be`, status was clean.

## Self-Review

- Cause aggregation accepts only active, included, non-weak production-day samples joined to confirmed canonical task attributions.
- Company and project identity, benchmark key, calendar identity, source upper bound, and source window lower bound are parameterized and checked defensively.
- Duplicate attribution rows cannot double-count a sample within the same cause; mixed taxonomy versions fail closed.
- Cause-segment retirement and insertion use the atomic writer's existing `PoolClient`; any segment error reaches the outer rollback before commit.
- Current benchmark replacement, candidate lookup, persisted benchmark reads, and current segment reads use exact null-safe project scope. Project benchmark reads also bind company scope.
- `project_id` and provenance columns are allowed on benchmark insert. Segment scope and timestamps are read from `RETURNING *`; PostgreSQL `Date` values are normalized to ISO without using the current clock.
- Exact confirmed-cause selection collapses the candidate set to the one exact segment, preventing all-cause/cause-specific blending. Missing or unusable exact segments retain the existing all-cause candidates and expose `benchmarkCauseFallback: 'all_cause'`.
- DTO provenance is sourced from the persisted segment and contains cause code, taxonomy version, generated timestamp, source-as-of timestamp, and sample count.

## Unverified Boundaries

- No database connection, migration execution, deployment, or live/staging verification was performed, as explicitly required by the task.
- SQL behavior was verified through fixed-SQL unit tests and TypeScript compilation, not against a live PostgreSQL schema.
- The root `npx vitest` launcher is unavailable in this worktree; verification used the already-installed server-local Vitest executable with the required runner config.

---

## Review Fix Report (2026-07-23)

### Status And Commits

DONE

- Review baseline: `182ba4b31d111f38816efdc178576c01fa337a08`
- Verified superseding implementation HEAD/full commit: `510ce6ca2ed3324c6cd4009e691efa3bf72e6d4e`
- Implementation commit subject: `fix(duration): harden cause benchmark segments`
- This appended report is committed separately after the verified implementation commit so the implementation SHA is immutable and exact.

### Exact Review-Fix Manifest

- `.superpowers/sdd/task-4-report.md` (this appended report only)
- `server/src/services/durationBenchmarkCauseSegmentService.ts`
- `server/src/services/durationSuggestionService.ts`
- `server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts`
- `server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts`
- `server/src/__tests__/durationSuggestionService.test.ts`

No migration, UI, deployment, database, or other-workstream file was changed. No adjacent type-file expansion was needed because the affected row/DTO types are local to the two changed service files.

### RED Evidence

All Vitest commands used the required runner loader.

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts
```

Result before the attribution and taxonomy fix: RED, 4 tests, 3 failed and 1 passed. Unrelated source/event/role, post-window attribution, snapshot mismatch, and multiple-primary fixtures inflated the accepted material sample count from 3 to 9; multiple canonical identities and cross-cause mixed taxonomy versions did not fail closed.

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts
```

Result before strict INSERT readback: RED, 2 files, 14 tests, 4 failed and 10 passed. Empty, two-row, and malformed scope/provenance `RETURNING` data were accepted, and the atomic writer reached `COMMIT` instead of rejecting and rolling back.

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationSuggestionService.test.ts -t "exact confirmed cause|exact cause segment|falls back to all-cause"
```

Result before usability/CV correction: RED, 98 discovered tests, 3 failed and 95 skipped. Exact segments with sample counts 1 and 4 changed the final recommendation to 12 days instead of retaining the all-cause 10-day recommended/13-day conservative result. The exact-segment case added the covering `sqrt(variance) / mean` assertion; expected final days were calibrated against the pre-change business path before production code was changed.

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts -t "mismatched sample lineage"
```

Result before lineage validation: RED, 1 failed and 7 skipped. The promise resolved with the persisted DTO instead of rejecting the mismatched `RETURNING.lineage`.

Each production correction was made only after its corresponding test demonstrated the missing behavior.

### GREEN And Required Gates

Focused GREEN before the implementation commit:

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts
```

Result: PASS, 3 files, 113 tests.

Required focused plus adjacent suite, run after implementation commit `510ce6ca2ed3324c6cd4009e691efa3bf72e6d4e`:

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts server/src/__tests__/durationSuggestionSimulation.test.ts server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts
```

Result: PASS, 5 files, 165 tests.

Server TypeScript, run after the implementation commit:

```powershell
npm run typecheck --workspace=server
```

Result: PASS, exit 0, no diagnostics (`tsc -p tsconfig.json --noEmit`). The direct `server/node_modules/.bin/tsc.cmd` launcher was absent, so the repository's server workspace script was used.

Repository checks after the implementation commit:

```powershell
git diff --check
git status --short
```

Result: PASS. `git diff --check` produced no output and `git status --short` was empty before this report append.

### Review-Finding Self-Review

- Attribution SQL now joins each accepted sample through `metadata.structured_cause_snapshot.confirmed_causes[].attribution_id`, with matching cause/taxonomy identity, and requires `task_completion`, `completion`, `primary`, `confirmed`, and `confirmed_at <= source_as_of`. Defensive row validation mirrors those constraints.
- A sample must resolve to exactly one primary snapshot identity. Duplicate rows for the same identity deduplicate; conflicting canonical identities fail closed, so one sample cannot populate multiple cause segments.
- Compatible rows are checked for one non-empty taxonomy version across the entire benchmark before any per-cause aggregation or write.
- Exact cause segments use the existing scope/specificity minimum-sample usability gate. Counts 1-4 retain all-cause candidates, final all-cause days, and `benchmarkCauseFallback: 'all_cause'`.
- Segment `INSERT RETURNING` must contain exactly one row. Mapped scope, distribution, timestamps, calendar/day basis, taxonomy, sample count, and lineage must equal the attempted write; empty, multiple, malformed, or mismatched readback throws inside the existing `PoolClient` transaction and causes benchmark plus segment rollback.
- Segment coefficient of variation is `sqrt(variance) / mean` only for finite non-negative variance and finite positive mean; otherwise it is null. The calculation context assertion covers the converted value.
- Self-review found and closed an additional provenance gap: persisted lineage is now validated, with its own RED and GREEN evidence above.

### Unverified Boundaries And Concerns

- No database connection, migration execution, deployment, staging, or production/live verification was performed, as required.
- SQL and rollback behavior were verified with deterministic `PoolClient` tests and TypeScript compilation, not a live PostgreSQL schema.
- No known in-scope code concern remains after the required focused, adjacent, and TypeScript gates.
