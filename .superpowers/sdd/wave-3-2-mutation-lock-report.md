# Workstream 1 Wave 3.2 Fix Report

## Result

- Status: DONE_WITH_CONCERNS
- Branch: `codex/full-code-correctness-closeout`
- Immutable parent: `dd10222d35d1694dd2d44c1abe7efdb02fedcc47`
- Scope: task-primary mutation locking for every production duration-sample collection/rebuild path
- Queue generation CAS and frozen cause-segment lineage changes: none
- Schema, migration, dependency, junction, deployment, environment, database, and `EXECUTION_PROGRESS.json` changes: none

## RED Evidence

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/taskWriteChainService.participantUnit.test.ts
```

Expected RED result: exit 1; 2 test files failed; 8 tests failed; 28 tests passed.

The deferred/mutex and caller tests proved that:

- rebuild A did not hold the task row lock while paused, so confirmation B acquired its task-primary authority lock and the final sample could be overwritten by stale A;
- both reconciliation source types passed the queue-claim task snapshot to the raw collector instead of re-reading current task B under lock;
- generation A could complete after the intended mutation-lock release hook instead of leaving a newer generation B pending;
- false and throwing collectors ran outside a transaction, so no lock commit/release or rollback/release occurred;
- a stale completed queue snapshot could recreate an active sample after the current task was reopened;
- direct task completion still invoked the raw collector instead of the shared coordinator;
- the production source audit had no shared task-lock coordinator boundary.

## GREEN Implementation

- Added `collectDurationExperienceSampleWithTaskLock` as the single production coordinator.
- The coordinator enters `withDatabaseTransaction`, resolves tenant ownership inside the transaction when the caller does not already have it, and locks the exact company/project/task row with `FOR UPDATE OF task`.
- It re-reads and passes the locked current task row to the raw collector, so structured-cause authority reads happen only after the task-primary lock is held.
- It awaits the raw collector through sample, health-event, and backtest settlement before the transaction commits or rolls back and releases the task lock.
- Reconciliation routes both `task_completion` and `structured_cause_confirmation` queue items through the coordinator and no longer consumes `item.task` for mutation.
- Structured-cause post-commit rebuild delegates to the same coordinator.
- Direct task-completion post-write collection delegates to the same coordinator while preserving existing non-blocking failure enqueue behavior.
- Reopened/uncompleted current rows remain non-collectable and are deferred under the existing worker policy.
- Queue generation compare-and-set SQL and transition semantics are unchanged; completion still happens only after mutation-lock release, so a newer enqueue remains pending when the older completion token is stale.

## GREEN Evidence

Focused mutation-lock and direct-caller suite:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/taskWriteChainService.participantUnit.test.ts
```

Result: exit 0; 2 test files passed; 36 tests passed.

Full Wave 3 focused/integrated suite:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationBenchmarkCauseSegmentService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/structuredCauseAttributionService.test.ts src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/wave3FrozenLineageDurableRebuild.test.ts
```

Result: exit 0; 6 test files passed; 103 tests passed.

Adjacent task-write and production-chain suite:

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

Result: exit 0; 2,154 tracked source files and 4,876 relative imports scanned; 0 violations.

Migration 324/CLEAN entrypoint parity:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/canonicalCauseBenchmarkMigration.test.ts src/__tests__/migrationEntryPoints.test.ts
```

Result: exit 0; 2 test files passed; 15 tests passed.

Production raw-collector caller audit:

```powershell
rg -n "collectDurationExperienceSampleFromTask" server/src --glob "!**/__tests__/**"
rg -n "collectDurationExperienceSampleWithTaskLock" server/src --glob "!**/__tests__/**"
```

Result: the raw collector is defined in `durationExperienceService.ts` and referenced only as the coordinator's injectable/default collector in `durationExperienceReconciliationService.ts`; reconciliation, structured rebuild, and task completion call the shared coordinator.

Queue CAS preservation:

```powershell
$path='server/src/services/durationExperienceReconciliationService.ts'; $parent=(git show "dd10222d35d1694dd2d44c1abe7efdb02fedcc47`:$path" | Out-String); $current=Get-Content -Raw $path; $pattern='(?s)function createDatabaseDurationExperienceReconciliationStore\(.*?\r?\n\}\r?\n\r?\nconst databaseStore'; $parentSection=([regex]::Match($parent,$pattern).Value -replace "`r`n","`n"); $currentSection=([regex]::Match($current,$pattern).Value -replace "`r`n","`n"); if(-not $parentSection -or -not $currentSection){ throw 'queue CAS section extraction failed' }; if($parentSection -cne $currentSection){ throw 'queue CAS section changed' }; 'QUEUE_CAS_SECTION_UNCHANGED'
```

Result: `QUEUE_CAS_SECTION_UNCHANGED`.

Frozen-lineage zero-diff check:

```powershell
git diff --exit-code dd10222d35d1694dd2d44c1abe7efdb02fedcc47 -- server/src/services/durationBenchmarkCauseSegmentService.ts server/src/services/durationLearningAssetAtomicStoreService.ts server/src/services/templateDurationGovernanceService.ts server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/templateDurationGovernanceService.test.ts
```

Result: exit 0; no frozen-lineage changes.

Parent-range diff check:

```powershell
git diff dd10222d35d1694dd2d44c1abe7efdb02fedcc47 --check
```

Result: exit 0; no whitespace errors.

## Changed Paths

- `.superpowers/sdd/wave-3-2-mutation-lock-report.md`
- `server/src/__tests__/durationExperienceReconciliationService.test.ts`
- `server/src/__tests__/taskWriteChainService.participantUnit.test.ts`
- `server/src/__tests__/wave3FrozenLineageDurableRebuild.test.ts`
- `server/src/services/durationExperienceReconciliationService.ts`
- `server/src/services/taskWriteChainService.ts`

## Concern

`server/src/__tests__/durationExperienceService.test.ts` is unchanged from immutable parent `dd10222d` and still has two pre-existing stale structured-cause assertions: one expects the retired subject-only SQL shape, and one expects `unavailable` where current authority resolution returns `review_required`. Its standalone run reported 22 passes and 2 failures. This Wave 3.2 lock scope does not modify that collector or test.
