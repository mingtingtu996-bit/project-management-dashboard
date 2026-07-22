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
