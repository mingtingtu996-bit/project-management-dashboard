# Workstream 1 Wave 3.1 Fix Report

## Result

- Status: DONE_WITH_CONCERNS
- Branch: `codex/full-code-correctness-closeout`
- Immutable parent: `bbc1184a596d8cd5be236055cf0db9aa542907cf`
- Scope: generation-safe durable duration-sample rebuild transitions
- Schema, migration, dependency, junction, deployment, environment, database, and `EXECUTION_PROGRESS.json` changes: none
- Approved frozen-lineage segment/governance/promotion files changed: none

## RED Evidence

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/structuredCauseAttributionService.test.ts src/__tests__/wave3FrozenLineageDurableRebuild.test.ts
```

Expected RED result: 3 test files failed; 13 tests failed; 30 tests passed.

The failures proved that:

- enqueue and worker claim did not return a generation token;
- completion, defer, and failure transitions updated by ID only and returned no applied/no-op result;
- structured-cause re-enqueue did not explicitly rearm terminal/exhausted rows;
- worker transitions did not pass a claim token and reported stale outcomes as recovered/deferred/retrying/dead-lettered;
- both task-primary confirmation closures discarded the enqueue generation token;
- an older post-commit closure could not distinguish its generation from a newer same-row enqueue.

## GREEN Implementation

- Uses `updated_at` as the no-schema optimistic generation/claim token.
- Every enqueue and claim advances `updated_at` with `GREATEST(clock_timestamp(), previous_updated_at + interval '1 microsecond')` where a previous row exists.
- Enqueue and claim return `updated_at::text AS generation_token`, preserving PostgreSQL microseconds without JavaScript `Date` conversion.
- `markCompleted`, `markDeferred`, and `markFailed` require queue ID, generation token, and expected status; each uses `RETURNING id` and returns whether the compare-and-set transition applied.
- Structured-cause confirmation enqueue always resets status, attempts, fresh budget, due time, errors, completion, and dead-letter fields.
- Task-completion dead-letter preservation remains unchanged.
- Worker counters increment only when their tokened transition applies.
- Both task-primary confirmation entry points capture and propagate the exact enqueue generation into their post-commit closure.
- A stale post-commit completion is an expected no-op; rebuild failure still leaves the current generation pending.
- The Wave 3 production-shaped contract now includes generation A/B same-row supersession before worker recovery.

## GREEN Evidence

Focused Wave 3.1 and production-shaped contract:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/structuredCauseAttributionService.test.ts src/__tests__/wave3FrozenLineageDurableRebuild.test.ts
```

Result: exit 0; 3 test files passed; 43 tests passed.

Scoped adjacent contracts:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationBenchmarkProductionChain.test.ts src/__tests__/structuredCauseDurationEligibilityContract.test.ts src/__tests__/structuredCauseAttributionRoute.test.ts src/__tests__/durationContextPolicyLearningJob.test.ts src/__tests__/taskWriteChainService.participantUnit.test.ts src/__tests__/templateDurationGovernanceJob.test.ts
```

Result: exit 0; 6 test files passed; 32 tests passed. The production-chain transport-failure case emitted its existing expected warning log.

Server typecheck:

```powershell
npm run typecheck --workspace=server
```

Result: exit 0; no diagnostics.

Client typecheck:

```powershell
npm run typecheck --workspace=client
```

Result: exit 0; no diagnostics.

Tracked relative import closure:

```powershell
npm run guard:tracked-relative-imports --workspace=server
```

Result: exit 0; 2,154 tracked source files and 4,875 relative imports scanned; 0 violations.

Current migration 324/CLEAN entrypoint parity:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/canonicalCauseBenchmarkMigration.test.ts src/__tests__/migrationEntryPoints.test.ts
```

Result: exit 0; 2 test files passed; 15 tests passed.

Full-range diff check:

```powershell
git diff bbc1184a596d8cd5be236055cf0db9aa542907cf --check
```

Result: exit 0; no whitespace errors.

Frozen-lineage zero-diff check:

```powershell
git diff --exit-code bbc1184a596d8cd5be236055cf0db9aa542907cf -- server/src/services/durationBenchmarkCauseSegmentService.ts server/src/services/durationLearningAssetAtomicStoreService.ts server/src/services/templateDurationGovernanceService.ts server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/templateDurationGovernanceService.test.ts
```

Result: exit 0; no frozen-lineage changes.

## Changed Paths

- `.superpowers/sdd/wave-3-1-generation-safe-rebuild-report.md`
- `server/src/__tests__/durationExperienceReconciliationService.test.ts`
- `server/src/__tests__/structuredCauseAttributionService.test.ts`
- `server/src/__tests__/structuredCauseDurationEligibilityContract.test.ts`
- `server/src/__tests__/wave3FrozenLineageDurableRebuild.test.ts`
- `server/src/services/durationExperienceReconciliationService.ts`
- `server/src/services/structuredCauseAttributionService.ts`

## Concern

`durationLearningAssetArchitectureClosureMigration.test.ts` has a pre-existing stale assertion that the CLEAN header ends at migration 323. Immutable parent `bbc1184` already contains the migration 324 header, and the migration, CLEAN bundle, and stale test are unchanged in this wave. Its combined parity run reported 1 failure and 19 passes; the current migration 324/CLEAN parity gate above passes 15/15.
