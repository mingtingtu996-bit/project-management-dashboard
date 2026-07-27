# Workstream 1 Final Fix Wave 2 Evidence

Branch: `codex/full-code-correctness-closeout`
Immutable parent: `72a1b9d37e4695cfbef7ea0c289d11369e3f39a4`

## TDD Evidence

Evidence is appended only after each command is run and its result is inspected.

### Findings 1, 2, 5, and 6 - initial RED

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/canonicalCauseBenchmarkMigration.test.ts
```

Observed result: RED as expected (`7 failed, 31 passed`). The failures prove the missing migration invariants, outstanding-canary replay mutation, same-operation contract acceptance, missing advisory operation lock, missing evidence-based `source_as_of`, operation-id aliasing when attribution lineage changes, and eligibility of evidence confirmed after generation.

### Findings 1, 2, 5, and 6 - strengthened RED

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/canonicalCauseBenchmarkMigration.test.ts
```

Observed result: RED as expected (`8 failed, 31 passed`). The added behavioral interleaving produced two inserts for one absent operation, while the corrected migration assertion now requires valid PostgreSQL whole-index `NULLS NOT DISTINCT` syntax.

### Findings 1, 2, and 6 - read-model and ownership-lock RED

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationContextSampleReadModelService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/canonicalCauseBenchmarkMigration.test.ts
```

Observed result: RED as expected (`10 failed, 36 passed`). In addition to the replay/source/migration failures, the governance SELECT omitted `updated_at` and project authority used `FOR KEY SHARE` instead of `FOR NO KEY UPDATE`.

### Findings 1, 2, and migration/ownership slice - GREEN

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts src/__tests__/durationContextSampleReadModelService.test.ts src/__tests__/durationLearningAssetAtomicStoreService.test.ts src/__tests__/canonicalCauseBenchmarkMigration.test.ts
```

Observed result: GREEN (`46 passed, 0 failed`). Evidence-derived source time/lineage, immutable replay, behavioral concurrent staging, `FOR NO KEY UPDATE`, candidate/task-primary uniqueness, composite ownership, rollback, and exact CLEAN tail contracts all passed.

### Finding 3 - RED

Commands:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimePublicationService.test.ts -t "existing publication|publication key|compatible|masquerades"
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimeLifecycleService.test.ts -t "wider-scope benchmark|promotes a measured"
npm exec --workspace=server -- vitest run src/__tests__/durationBenchmarkProductionChain.test.ts -t "aggregate as all-cause"
```

Observed result: RED as expected. Publication had `6` scope-contract failures, lifecycle had `4` aggregate/promotion failures, and all `3` upper-scope consumer cases returned `null`; project exact publication/promotion remained passing.

### Finding 3 - GREEN

Commands:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimePublicationService.test.ts -t "existing publication|publication key|compatible|masquerades"
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimeLifecycleService.test.ts -t "wider-scope benchmark|promotes a measured"
npm exec --workspace=server -- vitest run src/__tests__/durationBenchmarkProductionChain.test.ts -t "aggregate as all-cause"
```

Observed result: GREEN (`8 passed`, `5 passed`, and `3 passed`, respectively). Project exact candidates retain atomic activation; company/industry/global aggregates publish/replay/promote generically and resolve only as all-cause fallback.

### Finding 4 - RED

Commands:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/taskStructuredCauseAuthorityService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/taskDurationForecastService.test.ts -t "confirmed canonical|discriminated"
npm exec --workspace=server -- vitest run src/__tests__/durationSuggestionService.test.ts -t "authority state"
```

Observed result: RED as expected (`15`, `4`, and `3` failures). The authority result had no discriminator and prefiltered malformed/history rows; forecast passed only nullable `confirmedCauseCode`; review/unavailable states were consumed as ordinary all-cause fallback.

### Finding 4 - GREEN

Commands:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/taskStructuredCauseAuthorityService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/taskDurationForecastService.test.ts -t "confirmed canonical|discriminated"
npm exec --workspace=server -- vitest run src/__tests__/durationSuggestionService.test.ts -t "authority state"
```

Observed result: GREEN (`15 passed`, `4 passed`, `4 passed`). Only a truly empty task-subject read becomes `no_cause`; forecast propagates the discriminator and suggestion fails closed for review/unavailable authority.

### Finding 5 - RED

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/structuredCauseAttributionService.test.ts
```

Observed result: RED as expected (`3 failed, 20 passed`). Concurrent delay/completion candidate writers left two active primaries; existing-candidate confirmation had no unlocked identity -> task lock -> attribution lock order; direct user confirmation had no task lock.

### Finding 5 - GREEN

Command:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/structuredCauseAttributionService.test.ts
```

Observed result: GREEN (`23 passed, 0 failed`). Task-primary writers share parent-first task locking, delay/completion candidates serialize to one active primary, and contributing causes remain outside the primary lock/supersede path.

### Finding 7 - page and architecture RED

Commands:

```powershell
npm exec --workspace=client -- vitest run src/pages/__tests__/structuredCauseTaxonomyArchitecture.test.ts
npm exec --workspace=client -- vitest run src/pages/__tests__/RiskManagement.test.tsx -t "taxonomy is empty"
npm exec --workspace=client -- vitest run src/pages/__tests__/BaselinePage.test.tsx -t "absent from the current taxonomy"
```

Observed result: RED as expected (`1 failed` in each command). The architecture guard found the two complete local taxonomy authorities; Risk allowed closure with an empty taxonomy; Baseline allowed an inferred code absent from the current response.

### Finding 7 - page and architecture GREEN

Commands: the same three focused commands above.

Observed result: GREEN (`1 passed`, `1 passed`, `1 passed`). Both submission surfaces now resolve open string codes only against the current server response, and no production client file contains the complete canonical taxonomy.

### Finding 7 - shared cache and stale-state RED

Command:

```powershell
npm exec --workspace=client -- vitest run src/hooks/__tests__/useStructuredCauseTaxonomy.test.tsx
```

Observed result: initial RED (`4 failed`) proved the cache reset contract was absent; after exposing reset isolation, behavioral RED was `2 failed, 2 passed`: two consumers issued two requests and TTL expiry remained `ready` instead of clearing authority to `stale`.

### Finding 7 - shared cache and stale-state GREEN

Command: the same hook command above.

Observed result: GREEN (`4 passed`). Loading/error/empty/stale states expose no entries, one in-flight request is shared, a fresh response is reused, and five-minute expiry clears entries before refresh.

### Full serial changed/adjacent suite verification

Server commands were run one at a time:

```powershell
npm exec --workspace=server -- vitest run src/__tests__/canonicalCauseBenchmarkMigration.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationContextSampleReadModelService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/templateDurationGovernanceService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationLearningAssetAtomicStoreService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationBenchmarkProductionChain.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimePublicationService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimeLifecycleService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationSuggestionService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/taskStructuredCauseAuthorityService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/taskDurationForecastService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/structuredCauseAttributionService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationBenchmarkCauseSegmentService.test.ts
npm exec --workspace=server -- vitest run src/__tests__/durationLearningRuntimeConsumptionService.test.ts
```

Observed result: GREEN (`362 passed` total: `9 + 7 + 13 + 17 + 4 + 26 + 42 + 104 + 15 + 82 + 23 + 11 + 9`). The first full lifecycle pass exposed one stale test dependency injection for a company-scope promotion replay (`1 failed, 41 passed`); changing that test to inject the required generic upper-scope promoter produced focused `1 passed` and full `42 passed`.

Client commands were run one at a time:

```powershell
npm exec --workspace=client -- vitest run src/services/__tests__/causeAttributionApi.test.ts
npm exec --workspace=client -- vitest run src/components/task/__tests__/TaskCauseConfirmationDialog.test.tsx
npm exec --workspace=client -- vitest run src/hooks/__tests__/useStructuredCauseTaxonomy.test.tsx
npm exec --workspace=client -- vitest run src/pages/__tests__/structuredCauseTaxonomyArchitecture.test.ts
npm exec --workspace=client -- vitest run src/pages/__tests__/RiskManagement.test.tsx
npm exec --workspace=client -- vitest run src/pages/__tests__/BaselinePage.test.tsx
```

Observed result: GREEN (`45 passed` total: `3 + 3 + 4 + 1 + 18 + 16`).

### Typecheck, import closure, SQL readback, and diff check

Commands:

```powershell
npm run typecheck --workspace=server
npm run typecheck --workspace=client
npm run guard:tracked-relative-imports --workspace=server
git diff --check
```

Observed result: server typecheck initially found two exact errors (authority union narrowing and a widened test day-basis literal); after the minimal fixes, server and client typechecks are GREEN. The tracked relative-import guard scanned `2150` tracked source files and `4870` relative imports with `0` violations. The unstaged tracked diff check is GREEN; a staged closure/diff check is recorded below after all new files are tracked.

After staging all scoped files, tracked relative-import closure scanned `2153` tracked source files and `4871` relative imports with `0` violations, and `git diff --cached --check` completed with no findings.

Static SQL readback only (no migration or DB access) confirmed:

- standalone migration 324 equals the CLEAN EOF block exactly;
- both normalized SHA-256 values are `f234075047e0645d31d514fe23e837d114188d599fa2c81fb2468d0250bbed60`;
- CLEAN ends with the standalone migration;
- rollback contains the composite FK and all three new index reversal tokens and ends with `COMMIT`.

No broad workflow gate, migration apply, database/environment access, deployment, or live/staging claim was performed.
