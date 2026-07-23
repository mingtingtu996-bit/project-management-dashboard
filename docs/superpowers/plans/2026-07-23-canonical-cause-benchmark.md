# Canonical Cause And Cause-Aware Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 14-code structured-cause taxonomy the sole production cause authority, require confirmation for free-text causes, retire new `offline_label` inputs, and add explicit benchmark provenance plus cause-specific benchmark segments.

**Architecture:** A pure domain module owns canonical codes and legacy-factor translation. Existing services re-export compatibility types while production consumers use canonical cause identities. Migration 324 adds benchmark provenance and a tenant-safe cause-segment table; the atomic benchmark writer updates segments in the same transaction, and the task UI uses the existing confirmation route.

**Tech Stack:** TypeScript, Express, Zod, PostgreSQL, Supabase query client, React, Vitest, Testing Library.

## Global Constraints

- Base commit is `23d0b2800ab361f24dbee76470fbfd356a43581f`; application deployment remains frozen.
- Database changes are additive and use exact migration identity `324_canonical_cause_and_benchmark_provenance.sql`.
- Existing APIs remain compatible for at least one release.
- Unknown cause identity fails closed and cannot become a confirmed `other` cause automatically.
- Free text remains in `raw_text`; it is not benchmark-eligible until a user confirms a controlled cause code.
- New production inputs cannot use `offline_label`; historical rows remain readable.
- Responsibility is separate from business cause and requires a confirmed cause.
- Only confirmed structured causes enter cause-specific benchmark segments.
- Local tests and artifacts are not staging, production, or live evidence.

---

### Task 1: Canonical Taxonomy And Legacy Translation Boundary

**Files:**
- Create: `server/src/domain/structuredCauseTaxonomy.ts`
- Create: `server/src/__tests__/structuredCauseTaxonomyAuthority.test.ts`
- Modify: `server/src/services/structuredCauseAttributionService.ts:1-80`
- Modify: `server/src/seeds/progressDeviationCauseRegistry.ts:1-95`
- Modify: `server/src/services/algorithmSeedRegistry.ts`
- Modify: `server/src/services/algorithmCatalogService.ts`

**Interfaces:**
- Produces: `CANONICAL_STRUCTURED_CAUSE_CODES`, `StructuredCauseCode`, `STRUCTURED_CAUSE_TAXONOMY_VERSION`, `isStructuredCauseCode(value)`, `requireStructuredCauseCode(value)`, and `translateLegacyProgressFactor(factorKey)`.
- Compatibility: `structuredCauseAttributionService.ts` re-exports `StructuredCauseCode`, `STRUCTURED_CAUSE_TAXONOMY_VERSION`, and the existing taxonomy entries built from the canonical tuple.

- [ ] **Step 1: Write the authority RED**

```ts
import {
  CANONICAL_STRUCTURED_CAUSE_CODES,
  translateLegacyProgressFactor,
} from '../domain/structuredCauseTaxonomy.js'
import { PROGRESS_DEVIATION_CAUSE_RULES } from '../seeds/progressDeviationCauseRegistry.js'

it('maps every legacy factor to one canonical cause', () => {
  const factors = PROGRESS_DEVIATION_CAUSE_RULES.flatMap((rule) => rule.factorKeys)
  expect(new Set(factors).size).toBe(factors.length)
  expect(factors.every((factorKey) => translateLegacyProgressFactor(factorKey) != null)).toBe(true)
})

it('fails closed for an unknown legacy factor', () => {
  expect(translateLegacyProgressFactor('unregistered_factor')).toBeNull()
})

it('owns exactly fourteen canonical codes', () => {
  expect(CANONICAL_STRUCTURED_CAUSE_CODES).toHaveLength(14)
  expect(new Set(CANONICAL_STRUCTURED_CAUSE_CODES).size).toBe(14)
})
```

- [ ] **Step 2: Run the RED**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/structuredCauseTaxonomyAuthority.test.ts`

Expected: FAIL because `structuredCauseTaxonomy.ts` does not exist.

- [ ] **Step 3: Implement the pure authority and translator**

```ts
export const STRUCTURED_CAUSE_TAXONOMY_VERSION = 'v1.0.0' as const
export const CANONICAL_STRUCTURED_CAUSE_CODES = [
  'predecessor_delay', 'material_shortage', 'labor_shortage',
  'equipment_unavailable', 'design_change', 'drawing_delay',
  'quality_rework', 'weather_impact', 'owner_decision',
  'government_inspection', 'site_capacity_pressure',
  'workflow_sequence', 'external_readiness', 'other',
] as const
export type StructuredCauseCode = typeof CANONICAL_STRUCTURED_CAUSE_CODES[number]

const LEGACY_FACTOR_CAUSE = Object.freeze({
  resource_conflict: 'site_capacity_pressure',
  progress_velocity: 'site_capacity_pressure',
  workflow_sequence: 'workflow_sequence',
  seasonal_productivity: 'weather_impact',
  process_seasonal_sensitivity: 'weather_impact',
  weather_forecast_impact: 'weather_impact',
  productivity_compensation: 'weather_impact',
  process_constraint: 'workflow_sequence',
  external_readiness: 'external_readiness',
} satisfies Record<string, StructuredCauseCode>)

export function isStructuredCauseCode(value: unknown): value is StructuredCauseCode {
  return typeof value === 'string'
    && (CANONICAL_STRUCTURED_CAUSE_CODES as readonly string[]).includes(value)
}

export function requireStructuredCauseCode(value: unknown): StructuredCauseCode {
  if (!isStructuredCauseCode(value)) throw new Error('STRUCTURED_CAUSE_CODE_INVALID')
  return value
}

export function translateLegacyProgressFactor(factorKey: string) {
  const causeCode = LEGACY_FACTOR_CAUSE[factorKey as keyof typeof LEGACY_FACTOR_CAUSE]
  return causeCode
    ? { factorKey, causeCode, taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION }
    : null
}
```

Add `canonicalCauseCode` and `taxonomyVersion` to each legacy rule. Keep reason fields for compatibility, but make the registry a translation-only asset.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/structuredCauseTaxonomyAuthority.test.ts server/src/__tests__/structuredCauseAttributionService.test.ts server/src/__tests__/algorithmRuleAssetInventoryService.test.ts`

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add server/src/domain/structuredCauseTaxonomy.ts server/src/__tests__/structuredCauseTaxonomyAuthority.test.ts server/src/services/structuredCauseAttributionService.ts server/src/seeds/progressDeviationCauseRegistry.ts server/src/services/algorithmSeedRegistry.ts server/src/services/algorithmCatalogService.ts
git commit -m "refactor(causes): establish canonical taxonomy authority"
```

### Task 2: Migrate Consumers And Fail Closed For Manual/Offline Inputs

**Files:**
- Modify: `server/src/services/progressDeviationService.ts`
- Modify: `server/src/services/projectHealthDeviationSummaryService.ts`
- Modify: `server/src/services/structuredCauseAttributionService.ts`
- Modify: `server/src/services/durationExperienceService.ts`
- Modify: `server/src/__tests__/structuredCauseAttributionService.test.ts`
- Modify: `server/src/__tests__/durationExperienceService.test.ts`
- Create: `server/src/__tests__/canonicalCauseConsumerBoundary.test.ts`

**Interfaces:**
- Produces: `StructuredCauseAvailability = 'available' | 'review_required' | 'unavailable'`.
- Produces: `CanonicalCauseResolution { availability, causeCode, taxonomyVersion, reviewReasonCodes }`.
- Consumes: Task 1 canonical translator and type guard.

- [ ] **Step 1: Write consumer and inference REDs**

```ts
it('keeps manual text as review-required raw evidence', () => {
  const candidates = buildStructuredCauseCandidates({
    subjectType: 'task', eventType: 'delay', rawText: 'material not delivered', evidence: [],
  })
  expect(candidates).toEqual([
    expect.objectContaining({
      causeCode: 'other',
      availability: 'review_required',
      rawText: 'material not delivered',
      autoConfirmed: false,
      reviewReasonCodes: expect.arrayContaining(['manual_text_requires_user_confirmation']),
    }),
  ])
})

it('rejects offline labels as new production evidence', () => {
  expect(() => buildStructuredCauseCandidates({
    subjectType: 'task', eventType: 'delay', rawText: null,
    evidence: [{ sourceType: 'offline_label' as never, attributes: { causeCode: 'weather_impact' } }],
  })).toThrowError(/CAUSE_EVIDENCE_SOURCE_UNSUPPORTED/)
})
```

The boundary test reads production sources and permits `progressDeviationCauseRegistry` only in the translation and inventory modules.

- [ ] **Step 2: Run the REDs**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/structuredCauseAttributionService.test.ts server/src/__tests__/durationExperienceService.test.ts server/src/__tests__/canonicalCauseConsumerBoundary.test.ts`

Expected: FAIL on missing availability fields, accepted `offline_label`, and direct registry consumers.

- [ ] **Step 3: Implement canonical consumption**

```ts
export type StructuredCauseAvailability = 'available' | 'review_required' | 'unavailable'
export type CanonicalCauseResolution = {
  availability: StructuredCauseAvailability
  causeCode: StructuredCauseCode | null
  taxonomyVersion: typeof STRUCTURED_CAUSE_TAXONOMY_VERSION
  reviewReasonCodes: string[]
}
```

Use `translateLegacyProgressFactor` in deviation and health services. For manual text, persist `cause_code = 'other'`, `status = 'candidate'`, `auto_confirmed = false`, and `review_reason_codes = ['manual_text_requires_user_confirmation']`. Remove `offline_label` from `StructuredCauseEvidenceSource`; untyped callers receive `CAUSE_EVIDENCE_SOURCE_UNSUPPORTED`. Historical rows remain listable.

Require `status = 'confirmed'` and a canonical code before cause-linked duration evidence is benchmark eligible. Persist `structuredCauseAvailability`, `structuredCauseCode`, and `structuredCauseTaxonomyVersion` in sample metadata.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/structuredCauseAttributionService.test.ts server/src/__tests__/structuredCauseAttributionRoute.test.ts server/src/__tests__/durationExperienceService.test.ts server/src/__tests__/canonicalCauseConsumerBoundary.test.ts server/src/__tests__/projectExecutionSummary.test.ts`

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add server/src/services/progressDeviationService.ts server/src/services/projectHealthDeviationSummaryService.ts server/src/services/structuredCauseAttributionService.ts server/src/services/durationExperienceService.ts server/src/services/metricRegistryService.ts server/src/__tests__/structuredCauseAttributionService.test.ts server/src/__tests__/durationExperienceService.test.ts server/src/__tests__/canonicalCauseConsumerBoundary.test.ts
git commit -m "fix(causes): require canonical confirmed attribution"
```

### Task 3: Migration 324 Benchmark Provenance And Cause Segments

**Files:**
- Create: `server/migrations/324_canonical_cause_and_benchmark_provenance.sql`
- Create: `server/migrations/rollback/324_canonical_cause_and_benchmark_provenance.sql`
- Modify: `server/migrations/CLEAN_MIGRATION_V4.sql`
- Create: `server/src/__tests__/canonicalCauseBenchmarkMigration.test.ts`
- Modify: `server/src/__tests__/migrationEntryPoints.test.ts`

**Interfaces:**
- Produces columns `duration_benchmarks.generated_at`, `source_window_start`, and `source_as_of`.
- Produces table `public.duration_benchmark_cause_segments`.
- Depends on migrations 140, 201a, 314, and 317.

- [ ] **Step 1: Write migration REDs**

```ts
expect(standaloneBody).toBe(cleanTailBody)
expect(forward).toContain('ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ')
expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.duration_benchmark_cause_segments')
expect(forward).toContain('ALTER TABLE public.duration_benchmark_cause_segments FORCE ROW LEVEL SECURITY')
expect(forward).toContain('REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM PUBLIC, anon')
expect(forward).toContain('workbuddy_private.is_active_company_member')
expect(rollback).toContain('DROP TABLE IF EXISTS public.duration_benchmark_cause_segments')
```

Also assert rollback exists, direct grants are closed, runtime grants are explicit, project/company mismatch is rejected, and migration 324 is the CLEAN EOF block.

- [ ] **Step 2: Run the migration RED**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/canonicalCauseBenchmarkMigration.test.ts server/src/__tests__/migrationEntryPoints.test.ts`

Expected: FAIL because migration 324 files do not exist.

- [ ] **Step 3: Implement forward, CLEAN, and rollback SQL**

```sql
BEGIN;

ALTER TABLE public.duration_benchmarks
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_window_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_as_of TIMESTAMPTZ;

UPDATE public.duration_benchmarks
   SET generated_at = COALESCE(generated_at, updated_at, created_at)
 WHERE generated_at IS NULL;

ALTER TABLE public.duration_benchmarks
  ALTER COLUMN generated_at SET DEFAULT NOW(),
  ALTER COLUMN generated_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.duration_benchmark_cause_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id UUID NOT NULL REFERENCES public.duration_benchmarks(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  cause_code TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  sample_count INTEGER NOT NULL CHECK (sample_count > 0),
  p50_days INTEGER NULL CHECK (p50_days IS NULL OR p50_days > 0),
  p75_days INTEGER NULL CHECK (p75_days IS NULL OR p75_days > 0),
  p80_days INTEGER NULL CHECK (p80_days IS NULL OR p80_days > 0),
  mean_days REAL NULL CHECK (mean_days IS NULL OR mean_days > 0),
  variance REAL NULL CHECK (variance IS NULL OR variance >= 0),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_window_start TIMESTAMPTZ NULL,
  source_as_of TIMESTAMPTZ NOT NULL,
  duration_day_basis TEXT NOT NULL CHECK (duration_day_basis = 'construction_production_day'),
  calendar_ref TEXT NOT NULL,
  calendar_version TEXT NOT NULL,
  lineage JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lineage) = 'array'),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_window_start IS NULL OR source_window_start <= source_as_of),
  CHECK (project_id IS NULL OR company_id IS NOT NULL),
  CHECK (cause_code IN (
    'predecessor_delay','material_shortage','labor_shortage','equipment_unavailable',
    'design_change','drawing_delay','quality_rework','weather_impact','owner_decision',
    'government_inspection','site_capacity_pressure','workflow_sequence','external_readiness','other'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_cause_segment_current
  ON public.duration_benchmark_cause_segments (benchmark_id, cause_code, taxonomy_version)
  WHERE is_current = TRUE;

ALTER TABLE public.duration_benchmark_cause_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_benchmark_cause_segments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.duration_benchmark_cause_segments FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.duration_benchmark_cause_segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_benchmark_cause_segments TO workbuddy_runtime;
```

Add a `BEFORE INSERT OR UPDATE` trigger that loads the referenced benchmark and rejects company/project mismatch. Add member-read and backend-runtime policies using the migration 317 helper pattern. Append the exact standalone body at CLEAN EOF. Rollback drops policies, trigger, function, and table, then drops the three added columns.

- [ ] **Step 4: Run migration and diff checks**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/canonicalCauseBenchmarkMigration.test.ts server/src/__tests__/migrationEntryPoints.test.ts server/src/__tests__/structuredCauseAttributionMigration.test.ts server/src/__tests__/durationDayBasisMigrationContract.test.ts`

Run: `git diff --check`

Expected: tests PASS, diff check exits 0, and standalone/CLEAN checksums match.

- [ ] **Step 5: Commit**

```powershell
git add server/migrations/324_canonical_cause_and_benchmark_provenance.sql server/migrations/rollback/324_canonical_cause_and_benchmark_provenance.sql server/migrations/CLEAN_MIGRATION_V4.sql server/src/__tests__/canonicalCauseBenchmarkMigration.test.ts server/src/__tests__/migrationEntryPoints.test.ts
git commit -m "feat(db): add cause-aware benchmark provenance"
```

### Task 4: Transactional Cause-Segment Aggregation And Suggestion Selection

**Files:**
- Create: `server/src/services/durationBenchmarkCauseSegmentService.ts`
- Create: `server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts`
- Modify: `server/src/services/durationLearningAssetAtomicStoreService.ts`
- Modify: `server/src/services/durationSuggestionService.ts`
- Modify: `server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts`
- Modify: `server/src/__tests__/durationSuggestionService.test.ts`

**Interfaces:**
- Produces: `persistCurrentCauseSegments(input, client): Promise<DurationBenchmarkCauseSegment[]>`.
- Produces: `loadCurrentCauseSegment({ benchmarkId, causeCode, companyId, projectId }, queryExec)`.
- Adds optional suggestion input `confirmedCauseCode?: StructuredCauseCode | null`.
- Adds output `benchmarkCauseSegment { causeCode, taxonomyVersion, generatedAt, sourceAsOf, sampleCount } | null`.

- [ ] **Step 1: Write aggregation and selection REDs**

```ts
expect(await persistCurrentCauseSegments(input, client)).toEqual([
  expect.objectContaining({ causeCode: 'material_shortage', sampleCount: 3 }),
  expect.objectContaining({ causeCode: 'quality_rework', sampleCount: 2 }),
])
expect(executedSql.join('\n')).toContain("attribution.status = 'confirmed'")
expect(executedSql.join('\n')).toContain('sample.included_in_benchmark = TRUE')

expect(suggestion.benchmarkCauseSegment).toEqual(expect.objectContaining({
  causeCode: 'material_shortage',
  sourceAsOf: '2026-07-20T00:00:00.000Z',
}))
expect(fallback.benchmarkCauseSegment).toBeNull()
expect(fallback.businessReasonParams?.benchmarkCauseFallback).toBe('all_cause')
```

Cover candidate/rejected cause exclusion, weak sample exclusion, tenant mismatch, transactional replacement, and exact-cause preference.

- [ ] **Step 2: Run the REDs**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts`

Expected: FAIL because the segment service and DTO fields do not exist.

- [ ] **Step 3: Implement the service and transaction hook**

```ts
export type DurationBenchmarkCauseSegment = {
  id: string
  benchmarkId: string
  causeCode: StructuredCauseCode
  taxonomyVersion: string
  sampleCount: number
  generatedAt: string
  sourceWindowStart: string | null
  sourceAsOf: string
  durationDayBasis: 'construction_production_day'
  calendarRef: string
  calendarVersion: string
}

export type PersistCurrentCauseSegmentsInput = {
  benchmarkId: string
  companyId: string | null
  projectId: string | null
  benchmarkKey: string
  generatedAt: string
  sourceWindowStart: string | null
  sourceAsOf: string
  calendarRef: string
  calendarVersion: string
}

export async function persistCurrentCauseSegments(
  input: PersistCurrentCauseSegmentsInput,
  client: PoolClient,
): Promise<DurationBenchmarkCauseSegment[]> {
  const rows = await client.query<ConfirmedCauseSampleRow>(CONFIRMED_CAUSE_SAMPLE_SQL, [
    input.companyId, input.projectId, input.benchmarkKey, input.sourceAsOf,
  ])
  const segments = aggregateConfirmedCauseSamples(rows.rows, input)
  await replaceCurrentCauseSegments(client, input.benchmarkId, segments)
  return segments
}
```

Use fixed SQL placeholders. Join `duration_experience_samples` to confirmed task attributions, group by canonical code/version, and reject mixed tenant/calendar identity. In the atomic benchmark writer, call this service after benchmark insert/update and before transaction return; a failure rolls back both writes.

`findBenchmark` explicitly selects `generated_at, source_window_start, source_as_of`. With `confirmedCauseCode`, load only a tenant-consistent current segment for the selected benchmark. Do not blend causes. Without an exact segment, preserve the existing all-cause benchmark and label `benchmarkCauseFallback = 'all_cause'`.

- [ ] **Step 4: Run focused and adjacent gates**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts server/src/__tests__/durationSuggestionSimulation.test.ts server/src/__tests__/durationLearningRuntimeLifecycleService.test.ts`

Run: `npx tsc -p server/tsconfig.json --noEmit`

Expected: tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```powershell
git add server/src/services/durationBenchmarkCauseSegmentService.ts server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/services/durationLearningAssetAtomicStoreService.ts server/src/services/durationSuggestionService.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts
git commit -m "feat(duration): select cause-aware benchmark segments"
```

### Task 5: Task Cause Confirmation Surface

**Files:**
- Modify: `server/src/routes/cause-attributions.ts`
- Modify: `server/src/__tests__/structuredCauseAttributionRoute.test.ts`
- Create: `client/src/domain/structuredCauseTaxonomy.ts`
- Create: `client/src/services/causeAttributionApi.ts`
- Create: `client/src/services/__tests__/causeAttributionApi.test.ts`
- Create: `client/src/components/task/TaskCauseConfirmationDialog.tsx`
- Create: `client/src/components/task/__tests__/TaskCauseConfirmationDialog.test.tsx`
- Modify: `client/src/pages/TaskSummary.tsx`
- Modify: `client/src/pages/__tests__/TaskSummary.test.tsx`

**Interfaces:**
- Produces: `GET /api/cause-attributions/taxonomy` returning `{ version, entries }`.
- Consumes: existing `POST /api/cause-attributions/projects/:projectId/subjects/task/:taskId/confirm`.
- Produces: client `listCauseTaxonomy()` and `confirmTaskCause(input)`.

- [ ] **Step 1: Write route, API, and component REDs**

```tsx
render(<TaskCauseConfirmationDialog open task={task} onOpenChange={onOpenChange} onConfirmed={onConfirmed} />)
expect(screen.getByLabelText('延期原因分类')).toBeRequired()
expect(screen.getByLabelText('原始说明')).toHaveValue('材料还没到')
await user.selectOptions(screen.getByLabelText('延期原因分类'), 'material_shortage')
await user.click(screen.getByRole('button', { name: '确认原因' }))
expect(confirmTaskCause).toHaveBeenCalledWith(expect.objectContaining({
  projectId: 'project-1', taskId: 'task-1', causeCode: 'material_shortage', rawText: '材料还没到',
}))
```

The route test must assert the taxonomy endpoint returns exactly 14 canonical entries from the backend authority.

- [ ] **Step 2: Run the REDs**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/structuredCauseAttributionRoute.test.ts`

Run: `npx vitest run --config client/vitest.config.ts --configLoader runner client/src/services/__tests__/causeAttributionApi.test.ts client/src/components/task/__tests__/TaskCauseConfirmationDialog.test.tsx client/src/pages/__tests__/TaskSummary.test.tsx`

Expected: FAIL because the taxonomy route, client API, and dialog do not exist.

- [ ] **Step 3: Implement the route and task dialog**

```ts
router.get('/taxonomy', (_req, res) => {
  res.json({
    success: true,
    data: { version: STRUCTURED_CAUSE_TAXONOMY_VERSION, entries: STRUCTURED_CAUSE_TAXONOMY },
    timestamp: new Date().toISOString(),
  })
})
```

Replace the route-local literal `causeCodeSchema` with `z.enum(CANONICAL_STRUCTURED_CAUSE_CODES)` so request validation and taxonomy output cannot drift.

The client domain file defines response types only; it does not hard-code another taxonomy. The dialog loads entries, uses shared Select/Dialog/Button/toast components, and submits:

```ts
await apiPost(
  `/api/cause-attributions/projects/${encodeURIComponent(projectId)}/subjects/task/${encodeURIComponent(taskId)}/confirm`,
  { causeCode, causeRole: 'primary', eventType: 'delay', rawText },
)
```

Task Summary shows this command beside unconfirmed delay text for editors and a read-only canonical label for confirmed causes. Raw text remains visible.

- [ ] **Step 4: Run Workstream 1 verification**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/structuredCauseTaxonomyAuthority.test.ts server/src/__tests__/structuredCauseAttributionService.test.ts server/src/__tests__/structuredCauseAttributionRoute.test.ts server/src/__tests__/canonicalCauseConsumerBoundary.test.ts server/src/__tests__/durationExperienceService.test.ts server/src/__tests__/canonicalCauseBenchmarkMigration.test.ts server/src/__tests__/durationBenchmarkCauseSegmentService.test.ts server/src/__tests__/durationLearningAssetAtomicStoreService.test.ts server/src/__tests__/durationSuggestionService.test.ts`

Run: `npx vitest run --config client/vitest.config.ts --configLoader runner client/src/services/__tests__/causeAttributionApi.test.ts client/src/components/task/__tests__/TaskCauseConfirmationDialog.test.tsx client/src/pages/__tests__/TaskSummary.test.tsx`

Run: `npx tsc -p server/tsconfig.json --noEmit && npx tsc -p client/tsconfig.json --noEmit`

Run: `git diff --check`

Expected: tests PASS, both typechecks exit 0, and diff check exits 0.

- [ ] **Step 5: Commit**

```powershell
git add server/src/routes/cause-attributions.ts server/src/__tests__/structuredCauseAttributionRoute.test.ts client/src/domain/structuredCauseTaxonomy.ts client/src/services/causeAttributionApi.ts client/src/services/__tests__/causeAttributionApi.test.ts client/src/components/task/TaskCauseConfirmationDialog.tsx client/src/components/task/__tests__/TaskCauseConfirmationDialog.test.tsx client/src/pages/TaskSummary.tsx client/src/pages/__tests__/TaskSummary.test.tsx
git commit -m "feat(causes): add task cause confirmation"
```

### Task 6: Workstream 1 Immutable Review Gate

**Files:**
- Modify only when a Workstream 1 gate exposes a defect.
- Record: `.superpowers/sdd/progress.md` (ignored execution ledger).

**Interfaces:**
- Produces an immutable Workstream 1 SHA and exact manifest.
- Does not deploy or mutate a database.

- [ ] **Step 1: Run clean-checkout guards**

Run: `node server/scripts/guard-tracked-relative-import-closure.mjs`

Run: `node server/scripts/run-workflow-contract-gate.mjs`

Expected: import closure reports zero violations and workflow gate exits 0.

- [ ] **Step 2: Verify migration and source boundaries**

Run: `npx vitest run --config server/vitest.config.ts --configLoader runner server/src/__tests__/canonicalCauseBenchmarkMigration.test.ts server/src/__tests__/migrationEntryPoints.test.ts server/src/__tests__/canonicalCauseConsumerBoundary.test.ts`

Run: `git diff --check && git status --short`

Expected: tests PASS, diff check exits 0, and status is clean.

- [ ] **Step 3: Freeze exact evidence**

```powershell
git rev-parse HEAD
git rev-parse HEAD^
git diff-tree --no-commit-id --name-only -r 23d0b280 HEAD
git diff-tree --check 23d0b280 HEAD
```

Expected: full SHA, parent, exact Workstream 1 manifest, and exit 0 diff-tree check.

- [ ] **Step 4: Obtain independent review**

Generate a review package from `23d0b280` to the frozen SHA. Require separate spec-compliance and code-quality verdicts. A P0/P1/P2 finding requires a superseding TDD commit and fresh focused/typecheck evidence before re-review.

- [ ] **Step 5: Record APPROVE and continue**

Append:

```text
Workstream 1: complete (commits 23d0b28..<approved-head>, review clean)
```

Do not apply migrations or deploy. Start Workstream 2 only from the approved SHA.
