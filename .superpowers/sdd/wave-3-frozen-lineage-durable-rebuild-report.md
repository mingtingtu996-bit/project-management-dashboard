# Workstream 1 Wave 3 Fix Report

## Result

- Status: DONE
- Branch: `codex/full-code-correctness-closeout`
- Immutable parent: `b5d9832e9a53d845f6be83ef412c62ead5b592ed`
- Scope: frozen cause-segment lineage and durable post-confirmation duration-sample rebuild
- Database, environment, dependency, junction, migration, deployment, and `EXECUTION_PROGRESS.json` changes: none

## RED Evidence

### Frozen candidate lineage

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationBenchmarkCauseSegmentService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts
```

Expected RED result: 3 test files failed, 13 tests failed, 40 tests passed.

The failures proved that candidate attribution lineage omitted `causeRole`, canary promotion did not pass frozen metadata, segment SQL did not bind the exact frozen sample IDs, missing/extra/duplicate rows were accepted, sample fingerprint/timestamp and attribution identity mutations were accepted, and mismatched evidence could reach current-segment replacement.

### Durable confirmation rebuild

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/structuredCauseAttributionService.test.ts src/__tests__/durationExperienceReconciliationService.test.ts
```

Expected RED result: 2 test files failed, 6 tests failed, 30 tests passed.

The failures proved that neither task-primary confirmation entry point transactionally enqueued durable work, enqueue failure did not roll back confirmation, the worker overwrote the stored trigger, and the queue service contract omitted `structured_cause_confirmation`/`source_type` recovery data.

### Integrated chain

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/wave3FrozenLineageDurableRebuild.test.ts
```

Expected RED result: 1 test file failed, 1 test failed. The first behavioral assertion expected one transactional rebuild enqueue and observed zero calls.

## GREEN Implementation

### Frozen cause-segment lineage

- Added `causeRole` to candidate attribution lineage and candidate identity hashing.
- Canary promotion now passes `evidence_contract_hash`, `sample_mutation_lineage`, and `structured_cause_attribution_lineage` from the locked candidate.
- Added a dedicated exact-ID source query using `sample.id = ANY($1::uuid[])`, including frozen samples with no attribution.
- Validates the complete frozen sample set before any current-segment update: no missing, extra, duplicate, or malformed sample/attribution members.
- Validates task identity, evidence fingerprint, source lineage, completed/created/updated timestamps, attribution identity/code/version/event/role/confirmed-at, tenant/scope, and snapshot-to-authority equality.
- Persists `duration-benchmark-cause-segment-lineage/v2` with the evidence contract hash and attribution-rich per-sample lineage.
- Preserves the existing non-canary segment persistence path.

### Durable confirmation rebuild

- Extended the queue contract with `structured_cause_confirmation` while retaining the existing task-completion source.
- Both task-primary confirmation entry points upsert and read back the queue row inside the confirmation transaction before registering the post-commit effect.
- The effect completes the exact queue row only after the duration sample rebuild returns success; thrown or incomplete rebuilds leave the row pending.
- Worker claims both supported source types and uses the stored actor and trigger.
- Existing upsert, retry/backoff, waiting-for-facts, dead-letter, and missing-completed-task discovery behavior remains intact.

## GREEN Evidence

Wave 3 focused and integrated command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationBenchmarkCauseSegmentService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/structuredCauseAttributionService.test.ts src/__tests__/durationExperienceReconciliationService.test.ts src/__tests__/wave3FrozenLineageDurableRebuild.test.ts
```

Result: exit 0; 6 test files passed; 90 tests passed.

Scoped adjacent command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationBenchmarkProductionChain.test.ts src/__tests__/structuredCauseDurationEligibilityContract.test.ts src/__tests__/structuredCauseAttributionRoute.test.ts src/__tests__/durationContextPolicyLearningJob.test.ts src/__tests__/taskWriteChainService.participantUnit.test.ts src/__tests__/templateDurationGovernanceJob.test.ts
```

Result: exit 0; 6 test files passed; 32 tests passed. The production-chain transport-failure case emitted its existing expected warning log.

Migration 324/CLEAN static parity command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/canonicalCauseBenchmarkMigration.test.ts src/__tests__/migrationEntryPoints.test.ts
```

Result: exit 0; 2 test files passed; 15 tests passed.

Server typecheck:

```powershell
npm run typecheck --workspace=server
```

Result: exit 0; no TypeScript diagnostics.

Tracked relative import closure:

```powershell
npm run guard:tracked-relative-imports --workspace=server
```

Result: exit 0; 2,153 tracked source files and 4,871 relative imports scanned; 0 violations.

Diff check:

```powershell
git diff --check
```

Result: exit 0; no whitespace errors.

## Changed Paths

- `.superpowers/sdd/wave-3-frozen-lineage-durable-rebuild-report.md`
- `server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts`
- `server/src/__tests__/durationBenchmarkProductionChain.test.ts`
- `server/src/__tests__/durationExperienceReconciliationService.test.ts`
- `server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts`
- `server/src/__tests__/structuredCauseAttributionService.test.ts`
- `server/src/__tests__/structuredCauseDurationEligibilityContract.test.ts`
- `server/src/__tests__/templateDurationGovernanceService.test.ts`
- `server/src/__tests__/wave3FrozenLineageDurableRebuild.test.ts`
- `server/src/services/durationBenchmarkCauseSegmentService.ts`
- `server/src/services/durationExperienceReconciliationService.ts`
- `server/src/services/durationLearningAssetAtomicStoreService.ts`
- `server/src/services/structuredCauseAttributionService.ts`
- `server/src/services/templateDurationGovernanceService.ts`

## Concerns

None.
