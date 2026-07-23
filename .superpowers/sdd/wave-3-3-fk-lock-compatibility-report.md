# Workstream 1 Wave 3.3 Fix Report

## Result

- Status: DONE_WITH_CONCERNS
- Branch: `codex/full-code-correctness-closeout`
- Immutable parent: `e818480485426c96632b1e8f86c55c0862090f0d`
- Child SHA: finalized by the single commit containing this report and returned in the final response; a Git commit cannot embed its own resulting SHA in its tree.
- Scope: FK-compatible task-primary duration-sample mutation lock
- Production choice: `FOR NO KEY UPDATE OF task`
- Queue generation CAS, frozen benchmark lineage, current-task reread, caller routing, and stale-generation behavior changes: none
- Schema, migration, dependency, junction, deployment, environment, database, and `EXECUTION_PROGRESS.json` changes: none

## RED Evidence

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts
```

Expected RED result: exit 1; 1 test file failed; 2 tests failed; 22 tests passed.

The lock-compatibility contract called the production rebuild/coordinator boundary with two modeled connections:

- the coordinator transaction acquired the task lock selected by the production SQL;
- the independent REST collector connection requested PostgreSQL `KEY SHARE`, matching the lock requested by an FK check on first insertion into `duration_experience_samples(task_id)`;
- PostgreSQL row-lock compatibility was modeled for `UPDATE`, `NO KEY UPDATE`, and `KEY SHARE`;
- immutable parent `e818480` selected `UPDATE`, so the FK `KEY SHARE` remained waiting while the coordinator awaited the collector;
- the test recorded that self-block, released the modeled coordinator lock only for deterministic cleanup, and failed on both the blocked FK insert and exact lock SQL;
- the existing deferred/mutex serialization, current-task reread, stale-generation, false/throw, and reopened-task tests remained green during RED.

## GREEN Implementation

The only production change is:

```sql
FOR NO KEY UPDATE OF task
```

PostgreSQL lock reasoning:

- `KEY SHARE` conflicts with `UPDATE` but is compatible with `NO KEY UPDATE`, so the independent first-sample insert can complete its task FK check while the coordinator holds the task row.
- `NO KEY UPDATE` still conflicts with another `NO KEY UPDATE` and with `UPDATE`; task-primary confirmation/candidate writers using `FOR UPDATE` and ordinary task mutations therefore remain serialized against the coordinator.
- The coordinator still acquires the task lock before the raw collector reads structured-cause authority and still holds it until sample, sample-health, and both backtest promises settle.
- The task row is still re-read under the lock. False/throw transaction settlement, post-lock queue CAS, and stale-generation no-op behavior are unchanged.
- No advisory lock, parallel authority, timeout, retry workaround, same-transaction collector refactor, schema, or migration was introduced.

## GREEN Evidence

Focused FK lock-compatibility suite:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts
```

Result: exit 0; 1 test file passed; 24 tests passed.

Existing Wave 3.2 mutation-lock and direct-caller suite:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/taskWriteChainService.participantUnit.test.ts
```

Result: exit 0; 2 test files passed; 37 tests passed.

Full Wave 3 focused/integrated suite:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationBenchmarkCauseSegmentService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/structuredCauseAttributionService.test.ts src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/wave3FrozenLineageDurableRebuild.test.ts
```

Result: exit 0; 6 test files passed; 104 tests passed.

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

Production caller audit:

```powershell
rg -n "collectDurationExperienceSampleFromTask|collectDurationExperienceSampleWithTaskLock" server/src --glob "!**/__tests__/**"
```

Result: reconciliation for both source types, structured rebuild, and direct task completion still route through `collectDurationExperienceSampleWithTaskLock`; the raw collector remains only the coordinator default/injection boundary.

Queue CAS preservation:

```powershell
$path='server/src/services/durationExperienceReconciliationService.ts'; $parent=(git show "e818480485426c96632b1e8f86c55c0862090f0d`:$path" | Out-String); $current=Get-Content -Raw $path; $pattern='(?s)function createDatabaseDurationExperienceReconciliationStore\(.*?\r?\n\}\r?\n\r?\nconst databaseStore'; $parentSection=([regex]::Match($parent,$pattern).Value -replace "`r`n","`n"); $currentSection=([regex]::Match($current,$pattern).Value -replace "`r`n","`n"); if(-not $parentSection -or -not $currentSection){ throw 'queue CAS section extraction failed' }; if($parentSection -cne $currentSection){ throw 'queue CAS section changed' }; 'QUEUE_CAS_SECTION_UNCHANGED'
```

Result: `QUEUE_CAS_SECTION_UNCHANGED`.

Frozen-lineage zero-diff check:

```powershell
git diff --exit-code e818480485426c96632b1e8f86c55c0862090f0d -- server/src/services/durationBenchmarkCauseSegmentService.ts server/src/services/durationLearningAssetAtomicStoreService.ts server/src/services/templateDurationGovernanceService.ts server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/templateDurationGovernanceService.test.ts
```

Result: exit 0; no frozen-lineage changes.

Parent-range diff check:

```powershell
git diff e818480485426c96632b1e8f86c55c0862090f0d --check
```

Result: exit 0; no whitespace errors.

## Changed Paths

- `.superpowers/sdd/wave-3-3-fk-lock-compatibility-report.md`
- `server/src/__tests__/durationExperienceReconciliationService.test.ts`
- `server/src/services/durationExperienceReconciliationService.ts`

## Concerns

- A real two-connection PostgreSQL test was not run because creating the required temporary task/sample schema and FK would mutate database state, which this binding scope prohibits. The focused contract instead uses the strongest deterministic no-DB model available around the production coordinator and exact SQL.
- The three explicitly deferred stale assertions in `durationExperienceService.test.ts` and `durationLearningAssetArchitectureClosureMigration.test.ts` remain untouched for the separate test-only child required by the review brief.
