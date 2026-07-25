# Calendar Production-Day Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Each task has a separate RED/GREEN cycle and immutable commit boundary.

**Goal:** Prevent unavailable or unproven construction-calendar data from being represented, learned, blended, persisted, or displayed as construction-production-day duration.

**Architecture:** The existing `ConstructionCalendarContext` and `DurationMetricDto` remain the authority. Producers must use `hasIdentifiedConstructionCalendar()` before publishing production-day facts. When identity is absent, completed-task samples retain calendar-day observations but become unusable for production benchmarks; duration consumers expose unavailable typed production metrics rather than numeric aliases; benchmark blending requires date-stamped calendar provenance before it can influence a suggestion.

**Tech Stack:** TypeScript, Vitest, existing construction-calendar resolver, duration metric service, Supabase adapters.

## Global Constraints

- No database migration in this branch.
- Never reinterpret calendar-day counts as construction-production-day counts.
- Preserve raw calendar-day observations for auditability, but exclude them from production-day learning and publication.
- Do not modify drawing, execution-fact, task-summary, or deployment files.
- Local tests prove code behavior only; they do not prove staging or production consumption.

---

### Task 1: Quarantine Completed Samples Without Calendar Identity

**Files:**
- Modify: `server/src/services/durationExperienceService.ts`
- Modify: `server/src/__tests__/durationExperienceService.test.ts`

**Interfaces:**
- Consumes: `ConstructionCalendarContext` from `resolveConstructionCalendarContext()`.
- Produces: a persisted `duration_experience_samples` row whose `duration_day_basis`, production-day fields, sample strength, and benchmark eligibility agree with calendar availability.

- [x] **Step 1: Write failing tests**

Add tests using an empty resolver result and a rejected resolver promise. Each test must assert the inserted row has this contract:

```ts
expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
  duration_day_basis: 'calendar_day',
  actual_duration: 5,
  planned_duration: 6,
  actual_duration_production_days: null,
  planned_duration_production_days: null,
  sample_strength: 'unusable',
  included_in_benchmark: false,
  metadata: expect.objectContaining({
    construction_calendar_availability: 'unavailable',
    construction_calendar_ref: null,
    construction_calendar_version: null,
  }),
}))
```

Keep the existing shutdown-window test, but give its seed a resolver version so it remains a genuinely available production calendar.

- [x] **Step 2: Run RED**

Run:

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server\vitest.config.ts --configLoader runner server/src/__tests__/durationExperienceService.test.ts
```

Expected: the new tests fail because the current producer writes `construction_production_day`, numeric production values, and benchmark eligibility even when calendar identity is missing.

- [x] **Step 3: Implement the smallest producer change**

Import `hasIdentifiedConstructionCalendar`. Derive a single `hasProductionCalendar` boolean immediately after resolution, then use it consistently:

```ts
const durationDayBasis = hasProductionCalendar
  ? 'construction_production_day'
  : 'calendar_day'
const productionActual = hasProductionCalendar ? actualDurationProductionDays : null
const productionPlanned = hasProductionCalendar ? plannedDurationProductionDays : null
const actualDuration = hasProductionCalendar ? productionActual! : actualDurationCalendarDays
const plannedDuration = hasProductionCalendar ? productionPlanned! : plannedDurationCalendarDays
const finalSampleStrength = hasProductionCalendar
  ? measuredSampleStrength
  : 'unusable'
```

Record calendar availability/ref/version/timezone and the completed-date `as_of` in `metadata` and `source_lineage`. Leave `sample_status` as `active` so the raw factual observation remains auditable, but set `included_in_benchmark` from the final sample strength. Pass that same strength into sample-health and accuracy-backtest helpers.

- [x] **Step 4: Run GREEN**

Run the Task 1 test file. Expected: all tests pass, including the existing available-calendar production-day test.

- [ ] **Step 5: Commit**

```powershell
git add server/src/services/durationExperienceService.ts server/src/__tests__/durationExperienceService.test.ts
git commit -m "fix(duration): quarantine samples without calendar identity"
```

### Task 2: Admit Benchmark Candidates Only With Matching Calendar Provenance

**Files:**
- Modify: `server/src/services/durationSuggestionService.ts`
- Modify: `server/src/__tests__/durationSuggestionService.test.ts`

**Interfaces:**
- Consumes: `DurationBenchmarkRow.metadata` calendar provenance and the resolved `DurationSuggestionInput.workCalendar`.
- Produces: benchmark candidates only when a production-day basis has calendar ref, version, timezone, a valid `asOf`, and identity matching the current calendar when one is available.

- [x] **Step 1: Write failing tests**

Add a company benchmark with `duration_day_basis: 'construction_production_day'` but no calendar metadata and prove it does not blend. Add a second benchmark with a distinct calendar version and prove it does not blend into an available current calendar. Add an exact matching provenance row and prove the existing blend still occurs.

- [x] **Step 2: Run RED**

Run:

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server\vitest.config.ts --configLoader runner server/src/__tests__/durationSuggestionService.test.ts
```

Expected: rows with only `duration_day_basis` currently affect the recommendation.

- [x] **Step 3: Implement provenance admission before blending**

Add a pure helper that reads both camelCase and snake_case metadata keys and requires a valid `YYYY-MM-DD` as-of date. Call it inside `addCandidate` before sample-size checks and candidate insertion. Runtime-publication candidates must carry the same provenance or be rejected; do not synthesize identifiers.

- [x] **Step 4: Run GREEN and commit**

Run the focused suggestion suite, then:

```powershell
git add server/src/services/durationSuggestionService.ts server/src/__tests__/durationSuggestionService.test.ts
git commit -m "fix(duration): require benchmark calendar provenance"
```

### Task 3: Fail Closed at Forecast And Critical-Path Publication Boundaries

**Files:**
- Modify: `server/src/services/taskDurationForecastService.ts`
- Modify: `server/src/services/projectCriticalPathService.ts`
- Modify: `server/src/__tests__/taskDurationForecastService.test.ts`
- Modify: `server/src/__tests__/projectCriticalPathService.test.ts`

**Interfaces:**
- Consumes: `buildConstructionProductionDayDurationMetric()`.
- Produces: typed duration metrics with `availability: 'unavailable'` when the calendar is not identified, and no production-day prediction/outcome write based on unavailable numeric aliases.

- [ ] **Step 1: Write failing tests**

For an unavailable calendar, assert task forecast consumer DTOs expose null production-day values with the calendar reason. Assert critical-path prediction/outcome persistence is skipped and its snapshot metric remains unavailable. Preserve the existing available-calendar metric tests.

- [ ] **Step 2: Run RED**

Run the two focused service test files. Expected: existing raw numeric fields still flow into publication/prediction code as production-day values.

- [ ] **Step 3: Implement boundary gates**

Use `DurationMetricDto.availability` as the sole publication predicate. Keep legacy numeric fields internal/deprecated, set public aliases to `null` where the typed metric is unavailable, and avoid recording a `construction_production_day` prediction or actual outcome without an available metric. Do not silently fall back to calendar days under a production unit.

- [ ] **Step 4: Run GREEN and commit**

Run both focused suites and commit only the four Task 3 paths.

### Task 4: Verification And Handoff

**Files:**
- Modify only if a failing focused test demonstrates a direct regression in Tasks 1-3.

- [ ] **Step 1: Run the calendar-chain suite**

```powershell
& .\server\node_modules\.bin\vitest.cmd run --config server\vitest.config.ts --configLoader runner server/src/__tests__/constructionCalendar.test.ts server/src/__tests__/durationExperienceService.test.ts server/src/__tests__/taskDurationForecastService.test.ts server/src/__tests__/projectCriticalPathService.test.ts server/src/__tests__/durationSuggestionService.test.ts
```

- [ ] **Step 2: Typecheck and inspect the diff**

```powershell
& .\server\node_modules\.bin\tsc.cmd -p server\tsconfig.json --noEmit
git diff --check
git status --short
```

- [ ] **Step 3: Freeze the branch**

Record full SHA, parent, exact manifest, focused test result, typecheck result, and clean worktree status. This handoff remains local-code evidence only; staging, production data readback, migration, and live claims remain separate.
