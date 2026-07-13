# Scoped Duration Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative backend duration forecasts for division, subdivision, and specialty groups and render them in Task Summary without introducing writes or a second task-duration algorithm.

**Architecture:** A shared attribution projector resolves WBS and specialty ownership. A pure scoped forecast builder aggregates already-constrained task forecasts into P20/P50/P80 group finishes, while a runtime adapter loads the complete project before grouping. A protected read endpoint returns all three dimensions, and Task Summary joins results by the existing attribution group key.

**Tech Stack:** TypeScript, Express, Zod, React, Vitest, Supertest, Supabase/PostgreSQL read adapters, existing construction-calendar and task-duration forecast services.

## Global Constraints

- Reuse current task forecasts, dependency rows, critical-path projection, and construction calendar.
- Never sum parallel task durations; the latest constrained task finish governs each group.
- Load the complete project before grouping so incoming cross-group dependencies remain visible.
- The endpoint is read-only and must not refresh forecasts or mutate tasks, plans, dependencies, baselines, or production data.
- Return all three dimensions in one request; do not issue one database query per group.
- Keep forecast loading/errors independent from the existing Task Summary completion data.
- Preserve every unrelated dirty-worktree change and do not revert parallel work.
- No database migration is required.
- Local completion, staging validation, and production/live readiness remain separate claims.

---

### Task 1: Canonical Project Task Attribution

**Files:**
- Create: `server/src/services/taskAttributionProjectionService.ts`
- Create: `server/src/__tests__/taskAttributionProjectionService.test.ts`
- Modify: `server/src/routes/task-summaries.ts`
- Modify: `server/src/services/scheduleAccelerationRuntimeService.ts`

**Interfaces:**
- Consumes: project task rows containing `id`, `parent_id`, `wbs_level`, `sort_order`, `engineering_category_id`, `engineering_category_name`, `specialty_type`, and engineering-object fields.
- Produces: `buildProjectTaskAttributionProjection(tasks): Map<string, ProjectTaskAttribution>` and stable attribution IDs compatible with `division-<sourceId>`, `subdivision-<sourceId>`, and `specialty-<sourceId>`.

- [ ] **Step 1: Write failing projection tests**

Cover WBS level-1 ancestry, WBS level-2 ancestry, engineering-category specialty, explicit-label specialty fallback, unassigned groups, and parent-cycle protection:

```ts
const projection = buildProjectTaskAttributionProjection([
  { id: 'division-1', parent_id: null, title: 'Structure', wbs_level: 1 },
  { id: 'subdivision-1', parent_id: 'division-1', title: 'Concrete', wbs_level: 2 },
  {
    id: 'task-1',
    parent_id: 'subdivision-1',
    title: 'Pour slab',
    wbs_level: 3,
    engineering_category_id: 'category-1',
    engineering_category_name: 'Civil',
  },
])

expect(projection.get('task-1')).toEqual(expect.objectContaining({
  divisionId: 'division-1',
  subdivisionId: 'subdivision-1',
  specialtyId: 'category-1',
}))
```

- [ ] **Step 2: Run the projection test and verify RED**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskAttributionProjectionService.test.ts`

Expected: FAIL because `taskAttributionProjectionService` does not exist.

- [ ] **Step 3: Implement the pure projector**

Define:

```ts
export type ProjectTaskAttribution = {
  divisionId: string | null
  divisionName: string | null
  divisionSortOrder: number
  subdivisionId: string | null
  subdivisionName: string | null
  subdivisionSortOrder: number
  specialtyId: string | null
  specialtyName: string | null
  specialtySortOrder: number
  specialtySource: 'engineering_category' | 'business_label' | 'unassigned'
  degradationReasons: string[]
}

export function buildProjectTaskAttributionProjection(
  tasks: ProjectTaskAttributionInput[],
): Map<string, ProjectTaskAttribution>
```

Use a task lookup and visited set for parent traversal. Prefer `engineering_category_id/name`; otherwise use a deterministic normalized `specialty_type` label key and record `specialty_business_label_fallback`; otherwise leave specialty unassigned.

- [ ] **Step 4: Make runtime task rows carry attribution inputs**

Add `parent_id`, `wbs_level`, `sort_order`, `engineering_category_id`, `specialty_type`, and required object IDs to `RUNTIME_TASK_COLUMNS` and copy them into `ScheduleAccelerationRow.values`. `getTasks` will hydrate `engineering_category_name` when `engineering_category_id` is selected.

- [ ] **Step 5: Replace Task Summary's inline WBS/specialty resolution**

Build the projection once from `taskRows`, then map each normalized summary row from the shared projection. Preserve existing building, region, and phase resolution and response keys.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npx vitest run --config server/vitest.config.ts server/src/__tests__/taskAttributionProjectionService.test.ts server/src/__tests__/taskAttributionSummaryService.test.ts server/src/__tests__/taskSummariesProductionSemantics.test.ts server/src/__tests__/scheduleAccelerationRuntimeService.test.ts
```

Expected: all tests pass.

---

### Task 2: Pure Scoped Forecast Aggregation

**Files:**
- Create: `server/src/services/scopedDurationForecastService.ts`
- Create: `server/src/__tests__/scopedDurationForecastService.test.ts`

**Interfaces:**
- Consumes: `ScheduleAccelerationRow[]`, `TaskDurationForecast[]`, task attribution map, critical task IDs, as-of date, and `ConstructionCalendarContext`.
- Produces: `buildScopedDurationForecasts(input): ScopedDurationForecastResponse` with `division`, `subdivision`, and `specialty` arrays.

- [ ] **Step 1: Write failing aggregation tests**

Use real pure inputs and assert:

```ts
const result = buildScopedDurationForecasts({
  projectId: 'project-1',
  asOfDate: '2026-07-13',
  rows,
  forecasts,
  attributions,
  criticalTaskIds: new Set(['task-a']),
  constructionCalendar: { basis: 'calendar_day', windows: [] },
})

expect(result.dimensions.division[0]).toEqual(expect.objectContaining({
  p20FinishDate: '2026-07-17',
  p50FinishDate: '2026-07-20',
  p80FinishDate: '2026-07-24',
  expectedFinishDate: '2026-07-20',
  remainingDurationDays: 8,
}))
```

Separate tests prove max-finish aggregation, group-local governing tasks, construction shutdown handling, completed groups, boundary predecessor deduplication, outgoing-edge exclusion, missing-forecast degradation, insufficient data, and governing-task confidence.

- [ ] **Step 2: Run the scoped service test and verify RED**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/scopedDurationForecastService.test.ts`

Expected: FAIL because `scopedDurationForecastService` does not exist.

- [ ] **Step 3: Implement contract types and row eligibility**

Define exact response/group types from the approved design. Include only real `schedule_row` rows that are duration-bearing or controlling milestones. Preserve completed rows for counts but exclude them from remaining-duration extension.

- [ ] **Step 4: Implement task probability finish calculation**

P50 uses `forecastFinishDate`. Shift P20/P80 around P50 by the difference between task probability remaining days and task P50 remaining days, walking construction production days in either direction. Planned finish is the deterministic fallback. Pass every group band through `orderDurationBand`.

- [ ] **Step 5: Implement grouping, boundary, status, and confidence**

Group each task once per dimension. Build incoming boundary keys from each row's predecessor list and the full task-to-group map. Set `ready`, `degraded`, or `insufficient_data` from forecast/probability coverage and unresolved boundary evidence. Confidence is the minimum score/level among tasks governing P20, P50, or P80.

- [ ] **Step 6: Run the scoped service test and verify GREEN**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/scopedDurationForecastService.test.ts`

Expected: all scoped forecast tests pass.

---

### Task 3: Runtime Reader And Protected API

**Files:**
- Create: `server/src/services/scopedDurationForecastRuntimeService.ts`
- Create: `server/src/__tests__/scopedDurationForecastRuntimeService.test.ts`
- Create: `server/src/__tests__/taskScopedDurationForecastRoute.test.ts`
- Modify: `server/src/routes/task-summaries.ts`

**Interfaces:**
- Consumes: `buildRuntimeScheduleAccelerationRows`, `listCurrentTaskDurationForecasts`, `getProjectCriticalPathSnapshot`, and `resolveConstructionCalendarContext`.
- Produces: `buildRuntimeScopedDurationForecast(projectId, { asOfDate? })` and `GET /projects/:id/duration-forecasts` under the existing `/api/task-summaries` router.

- [ ] **Step 1: Write failing runtime no-write tests**

Inject runtime dependencies and assert one project-wide read, current forecast listing, and no refresh function:

```ts
expect(deps.buildRuntimeScheduleAccelerationRows).toHaveBeenCalledTimes(1)
expect(deps.listCurrentTaskDurationForecasts).toHaveBeenCalledWith(
  ['task-1', 'task-2'],
  expect.objectContaining({ projectId: 'project-1' }),
)
expect(deps.forecastTaskDuration).toBeUndefined()
```

Also prove forecast/critical-path optional failures produce degraded output while task-row failure rejects.

- [ ] **Step 2: Write failing route tests**

Mount the real router with mocked auth/service and assert `200`, service arguments, cache behavior, and `400` for invalid `as_of_date`. The auth mock must verify `requireProjectMember` is attached to `req.params.id`.

- [ ] **Step 3: Run runtime and route tests and verify RED**

Run:

```powershell
npx vitest run --config server/vitest.config.ts server/src/__tests__/scopedDurationForecastRuntimeService.test.ts server/src/__tests__/taskScopedDurationForecastRoute.test.ts
```

Expected: FAIL because the runtime service and route do not exist.

- [ ] **Step 4: Implement the runtime service**

Load rows first. Resolve current forecasts, critical path, and construction calendar with independent optional fallbacks. Build the shared attribution projection from row values and call the pure builder. Return no persistence handles and do not import `forecastTaskDuration` or refresh jobs.

- [ ] **Step 5: Implement route validation, auth, and cache**

Add:

```ts
const scopedDurationForecastQuerySchema = z.object({
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough()

router.get(
  '/projects/:id/duration-forecasts',
  validateIdParam,
  validate(scopedDurationForecastQuerySchema, 'query'),
  requireProjectMember((req) => req.params.id),
  asyncHandler(async (req, res) => { /* service call and ApiResponse */ }),
)
```

Use a 15-second key scoped by project and as-of date.

- [ ] **Step 6: Run runtime, route, and existing authorization regressions**

Run:

```powershell
npx vitest run --config server/vitest.config.ts server/src/__tests__/scopedDurationForecastRuntimeService.test.ts server/src/__tests__/taskScopedDurationForecastRoute.test.ts server/src/__tests__/taskSummariesProductionSemantics.test.ts server/src/__tests__/scheduleAccelerationRoute.test.ts
```

Expected: all tests pass.

---

### Task 4: Task Summary Forecast Consumption

**Files:**
- Modify: `client/src/pages/TaskSummary.tsx`
- Modify: `client/src/pages/__tests__/TaskSummary.test.tsx`

**Interfaces:**
- Consumes: `ScopedDurationForecastResponse` from `/api/task-summaries/projects/:id/duration-forecasts`.
- Produces: independent forecast state joined by existing attribution group ID and visible forecast facts in the division, subdivision, and specialty rows.

- [ ] **Step 1: Extend the client test fixture and write failing UI assertions**

Mock the new endpoint and assert:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  `/api/task-summaries/projects/${projectId}/duration-forecasts`,
  expect.objectContaining({ signal: expect.any(AbortSignal) }),
)
expect(container.textContent).toContain('预计完成')
expect(container.textContent).toContain('2026-07-20')
expect(container.textContent).toContain('P20 / P50 / P80')
expect(container.textContent).toContain('数据降级')
```

Add a separate test where the forecast endpoint returns `500`; the completion KPI and attribution ledger must still render with a forecast error/retry state.

- [ ] **Step 2: Run the Task Summary test and verify RED**

Run: `npx vitest run --config client/vitest.config.ts client/src/pages/__tests__/TaskSummary.test.tsx`

Expected: FAIL because the page does not request or render scoped forecasts.

- [ ] **Step 3: Add response types and independent state**

Add scoped forecast types, `forecastByGroupId`, `forecastLoading`, and `forecastError`. Fetch summary, trend, and forecast in parallel, but catch forecast failure separately so it never enters the page-level completion-data failure path.

- [ ] **Step 4: Render compact and expanded forecast facts**

For division/subdivision/specialty rows, render expected finish, remaining production days, delay, and semantic data status. In expanded details render P20/P50/P80, coverage, boundary predecessors, confidence, governing tasks, and degradation reasons. Other dimensions retain their current layout.

- [ ] **Step 5: Preserve responsive and accessible states**

Use existing cards/table/dialog primitives, no nested cards, no client date arithmetic, and stable responsive columns. Include loading text, unavailable text, and an accessible retry button using the existing icon set.

- [ ] **Step 6: Run the client test and verify GREEN**

Run: `npx vitest run --config client/vitest.config.ts client/src/pages/__tests__/TaskSummary.test.tsx`

Expected: all Task Summary tests pass.

---

### Task 5: Integrated Verification And Closeout

**Files:**
- Modify only if test-driven fixes are required: files from Tasks 1-4.

**Interfaces:**
- Consumes: completed backend and client implementation.
- Produces: verified local feature with no production/live claim.

- [ ] **Step 1: Run focused backend suites**

```powershell
npx vitest run --config server/vitest.config.ts server/src/__tests__/taskAttributionProjectionService.test.ts server/src/__tests__/scopedDurationForecastService.test.ts server/src/__tests__/scopedDurationForecastRuntimeService.test.ts server/src/__tests__/taskScopedDurationForecastRoute.test.ts server/src/__tests__/taskDurationForecastService.test.ts server/src/__tests__/projectRemainingDurationForecastService.test.ts server/src/__tests__/scheduleAccelerationRuntimeService.test.ts server/src/__tests__/taskAttributionSummaryService.test.ts server/src/__tests__/taskSummariesProductionSemantics.test.ts
```

Expected: all focused backend tests pass.

- [ ] **Step 2: Run focused client suite**

```powershell
npx vitest run --config client/vitest.config.ts client/src/pages/__tests__/TaskSummary.test.tsx
```

Expected: all Task Summary tests pass.

- [ ] **Step 3: Run type checks**

```powershell
npx tsc -p server/tsconfig.json --noEmit
npx tsc -p client/tsconfig.json --noEmit
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run source and diff checks**

```powershell
git diff --check
rg -n "forecastTaskDuration|refreshDailyActiveTaskDurationForecasts|insert\(|update\(|delete\(" server/src/services/scopedDurationForecastRuntimeService.ts
```

Expected: no whitespace errors and no mutation/refresh imports or calls in the scoped runtime reader.

- [ ] **Step 5: Verify the running local app**

Open the existing Task Summary route for a local project. Confirm completion data still loads, three scoped dimensions show forecast data or explicit degradation, refresh works, and the browser console has no new error. This is local verification only.

- [ ] **Step 6: Review the final diff against the approved design**

Confirm all acceptance criteria are implemented, no unrelated dirty file was reverted, and every newly added function was driven by a failing test.

## Execution Mode

The user explicitly selected inline execution in the current task. After this plan is saved and reviewed, use `superpowers:executing-plans` and proceed without another implementation-choice prompt.
