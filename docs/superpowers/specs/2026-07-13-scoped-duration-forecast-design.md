# Scoped Duration Forecast Design

## Objective

Provide first-class duration forecasting for three construction-management scopes:

- division work (`division`);
- subdivision work (`subdivision`);
- specialty work (`specialty`).

The feature must reuse the existing task forecast, dependency, critical-path, and construction-calendar capabilities. It must not introduce a second task-duration algorithm and must not write task dates, plans, dependencies, or production data.

The user-facing result belongs on the existing Task Summary page. Each scope row must show an expected finish, remaining duration, delay, P20/P50/P80 finish dates, confidence, and data status.

## Decision

Implement a dedicated `scopedDurationForecastService` around the existing runtime forecast inputs. Do not add scope semantics directly to the project-total forecast API and do not aggregate forecasts in the browser.

This separation is required because:

- a task that is non-critical for the whole project can still control one division, subdivision, or specialty;
- grouping must happen after project-wide task forecasts and dependency constraints are hydrated;
- the Task Summary page must consume one backend-owned forecast contract;
- a forecast failure must not break the existing completion summary;
- the project-total forecast contract must retain its current meaning and regression surface.

## Definitions

| Term | Meaning |
|---|---|
| Scope group | One division, subdivision, or specialty and all eligible project tasks attributed to it |
| Eligible task | A real schedule row that contributes duration or an attributed milestone that controls completion |
| Active task | An eligible task not completed by status, progress, or actual finish |
| Governing task | A task whose finish date sets one of the group P20, P50, or P80 boundaries |
| Boundary predecessor | A predecessor outside the group that constrains a task inside the group |
| Forecast coverage | Active eligible tasks with a current task forecast divided by all active eligible tasks |
| Probability coverage | Active eligible tasks with an ordered P20/P50/P80 window divided by all active eligible tasks |

## Architecture

### 1. Canonical attribution projection

Extract a reusable pure attribution resolver from the current Task Summary route logic. It receives project task rows plus governed scope bindings and returns the same canonical fields already used by Task Summary:

- `division_id`, `division_name`, and `division_sort_order` from the WBS level-1 ancestor;
- `subdivision_id`, `subdivision_name`, and `subdivision_sort_order` from the WBS level-2 node or ancestor;
- `specialty_id`, `specialty_name`, and `specialty_sort_order` from the governed specialty scope binding.

The resolver must walk the project task parent chain with cycle protection. It must never trust a client-supplied group identity.

Tasks without a valid mapping remain visible in one explicit unassigned group per dimension. They are not silently dropped and are not reassigned by title matching.

### 2. Runtime input adapter

The runtime adapter loads the complete project before applying a group filter:

1. schedule rows and task dependencies;
2. current task duration forecasts;
3. current critical-path projection;
4. construction calendar;
5. task hierarchy and specialty scope bindings.

Loading the complete project first preserves incoming dependency constraints. The adapter may reuse or expose existing schedule-acceleration runtime readers, but it must not refresh forecasts or persist new forecast records from this read endpoint.

Optional inputs fail independently. Missing current forecasts, probability windows, critical-path data, or scope bindings produce explicit degradation reasons. Failure to read the project tasks or membership scope fails the request.

### 3. Pure scoped aggregation

The pure builder receives hydrated rows, forecasts, dependencies, attributions, a construction calendar, and an as-of date. It returns all three dimensions in one pass.

Rows with `rowProjectionMode` other than `schedule_row`, linked projections, catalog rows, and non-duration summary rows do not contribute to the finish calculation. Attributed milestones may provide a completion boundary but do not add duration.

Completed rows remain in counts and completion status but do not extend remaining duration. A fully completed group has zero remaining days and uses its latest actual finish as P20, P50, P80, and expected finish.

For each active task:

- P50 uses the authoritative task `forecastFinishDate` when available;
- P20 and P80 use the task probability window, shifted around the authoritative P50 finish with construction-production-day arithmetic;
- if a probability window is absent, P20 and P80 collapse to P50 and the group is degraded;
- if the current task forecast is absent, the planned finish is a deterministic fallback and the group is degraded;
- if neither forecast nor planned finish is usable, the task is uncovered and the group can become `insufficient_data`.

For each group:

- group P20 is the latest active-task P20 finish;
- group P50 is the latest active-task P50 finish;
- group P80 is the latest active-task P80 finish;
- the existing duration-band ordering guard enforces `P20 <= P50 <= P80`;
- expected finish is P50;
- remaining duration is the existing construction-production-day distance from as-of date to P50;
- target finish is the latest planned finish among eligible group tasks;
- target gap is the signed production-day difference from target finish to P50;
- delay days are `max(0, targetGapDays)`.

Durations are never summed. The controlling finish is the latest constrained task finish, so parallel work is not double-counted.

### 4. Dependency boundary policy

Dependencies are evaluated against the complete project graph before grouping.

- Internal predecessor edges remain normal network evidence.
- Incoming edges from outside the group are counted as boundary predecessors.
- Outgoing edges to another group do not extend the current group's own completion boundary.
- Existing hydrated task forecast dates remain authoritative for dependency-constrained timing.
- An incoming edge with no usable predecessor timing is reported as `unresolved_boundary_predecessor` and degrades the group.
- No new lag or dependency semantics are invented in the scoped aggregator.

This policy avoids the incorrect alternative of filtering tasks first and then treating every scope as an isolated project.

## Result Contract

Add a read-only endpoint:

```text
GET /api/task-summaries/projects/:id/duration-forecasts?as_of_date=YYYY-MM-DD
```

The route uses the existing project-member authorization middleware. `as_of_date` is optional and exists for deterministic reporting and tests. Invalid dates return `400`.

The response shape is:

```ts
type ScopedDurationForecastResponse = {
  projectId: string
  asOfDate: string
  dimensions: {
    division: ScopedDurationForecastGroup[]
    subdivision: ScopedDurationForecastGroup[]
    specialty: ScopedDurationForecastGroup[]
  }
  summary: {
    groupCount: number
    readyCount: number
    degradedCount: number
    insufficientDataCount: number
  }
}

type ScopedDurationForecastGroup = {
  id: string
  dimension: 'division' | 'subdivision' | 'specialty'
  sourceId: string | null
  name: string
  sortOrder: number
  taskIds: string[]
  taskCount: number
  completedTaskCount: number
  remainingTaskCount: number
  criticalTaskCount: number
  boundaryPredecessorCount: number
  unresolvedBoundaryPredecessorCount: number
  targetFinishDate: string | null
  p20FinishDate: string | null
  p50FinishDate: string | null
  p80FinishDate: string | null
  expectedFinishDate: string | null
  remainingDurationDays: number | null
  targetGapDays: number | null
  delayDays: number | null
  confidenceLevel: string | null
  confidenceScore: number | null
  forecastCoverageRate: number
  probabilityCoverageRate: number
  forecastState: 'not_started' | 'in_progress' | 'completed'
  dataStatus: 'ready' | 'degraded' | 'insufficient_data'
  degradationReasons: string[]
  governingTaskIds: string[]
}
```

The group `id` follows the existing Task Summary attribution key format, such as `division-<sourceId>`. This lets the browser join results without recalculating membership.

## Data Status And Confidence

`ready` requires:

- at least one eligible task;
- a usable P50 finish for every active eligible task;
- current-forecast coverage of 100 percent;
- probability-window coverage of 100 percent;
- no unresolved incoming boundary predecessor.

`degraded` means a usable group P50 exists but at least one fallback or unresolved optional input was used.

`insufficient_data` means the group has eligible tasks but no defensible P50 can be produced. A group with no eligible rows is omitted rather than represented as a forecast.

Group confidence is derived only from the tasks governing P20, P50, or P80. The score is the minimum governing-task score, which is conservative and avoids diluting completion risk with early non-governing work. The level is the lowest governing-task confidence level.

## API And Security Behavior

- Project membership is checked before any project data is returned.
- The route does not accept tenant, company, task IDs, or group IDs from the client.
- All rows, dependencies, forecasts, bindings, and critical-path data are constrained to the authorized project.
- Missing project or unauthorized project returns the existing not-found/forbidden behavior.
- A mandatory task read failure returns a normal API error and no partial cross-project data.
- Optional forecast evidence failures remain inside the response as degradation reasons.
- The endpoint performs no insert, update, delete, forecast refresh, or task commit.

## Task Summary UI

The existing Task Summary page remains the entry point. It requests the forecast endpoint in parallel with the existing summary and trend endpoints.

The forecast request has an independent loading and error state:

- summary completion data still renders when scoped forecasting fails;
- each division, subdivision, or specialty row shows expected finish, P50 remaining days, and delay;
- expanded detail shows P20/P50/P80, coverage, boundary predecessor count, confidence, and degradation reasons;
- `ready`, `degraded`, and `insufficient_data` use text plus the existing semantic status treatment;
- unassigned groups are visibly labeled and sorted last;
- refresh reloads summary, trend, and scoped forecast together;
- no client-side date, duration, or confidence aggregation is permitted.

The additional columns must fit the existing responsive Task Summary surface. Narrow layouts may stack forecast details below the attribution name; data must not overflow or overlap.

## Failure And Edge Cases

- Parent cycle in WBS: stop traversal, retain safe known attribution, and report degradation.
- Missing WBS level-1 or level-2 ancestor: place the task in the dimension's unassigned group.
- Invalid specialty label or binding: place the task in the unassigned specialty group.
- All tasks completed: remaining duration is zero and actual completion controls the displayed dates.
- Future not-started group: forecast remains valid and `forecastState` is `not_started`.
- One task belongs to all three dimensions: it appears once in each dimension, never twice within one group.
- Same task has duplicate dependency rows: deduplicate boundary counts by predecessor, successor, type, and lag.
- Current forecast missing for one task: planned finish fallback, `degraded`.
- P20/P50/P80 out of order: order through the existing plausibility guard and record the warning reason.
- No construction calendar: use the existing calendar-day fallback and report the calendar fallback reason.
- Request aborted or page navigated away: do not update stale browser state.

## Performance And Caching

- Load project-wide runtime inputs once per endpoint request, then compute all three dimensions in memory.
- Do not issue one database request per group or per task.
- Reuse existing batched current-forecast reads and dependency reads.
- Add a short project/as-of response cache consistent with Task Summary caching.
- Cache entries must not cross project IDs and must be invalidated or expire after task/forecast changes within the existing short TTL.
- Response size is bounded to group summaries plus task IDs; it does not embed full task rows or forecast calculation contexts.

## Test Strategy

Implementation follows test-driven development.

### Pure service tests

Tests must prove:

- correct WBS level-1 division attribution;
- correct WBS level-2 subdivision attribution;
- governed specialty binding and explicit unassigned behavior;
- parent-cycle protection;
- max-finish aggregation instead of duration summation;
- a project-noncritical task can govern its own scope;
- P20/P50/P80 construction-calendar ordering;
- completed-group zero remaining duration;
- boundary predecessor counting and deduplication;
- outgoing dependencies do not extend the group;
- missing forecast and probability fallbacks produce `degraded`;
- no usable finish produces `insufficient_data`;
- confidence comes from governing tasks only.

### Runtime and route tests

Tests must prove:

- one project-wide input load serves all three dimensions;
- the read path does not call task forecast refresh or any mutation adapter;
- member access succeeds;
- non-member and cross-project access fail;
- invalid as-of date returns `400`;
- optional forecast input failures return degraded groups without hiding completion data;
- response group IDs join the existing attribution IDs.

### Client tests

Tests must prove:

- all three dimensions render backend forecast values;
- forecast loading does not block completion summaries;
- forecast error is isolated and retryable;
- degraded and insufficient states are visible;
- responsive rows do not lose labels or values;
- no client function recomputes finish dates, remaining days, delay, or confidence.

### Regression verification

Run focused tests for task duration forecasting, project remaining forecasting, schedule acceleration runtime, Task Summary routes, and Task Summary UI. Then run server and client type checks plus the relevant Vitest suites.

## Rollout Boundary

This change is locally code-complete only after implementation and automated verification. Staging and production/live remain separate gates.

Production readiness additionally requires current schema compatibility, project membership verification, real project forecast coverage, response-time observation, tenant isolation, monitoring, and rollback validation. No production write or live readiness claim is part of this implementation task.

## Non-Goals

- Do not generate or apply acceleration proposals.
- Do not add labor, equipment, or resource optimization.
- Do not rewrite task duration prediction.
- Do not replace the project-total remaining forecast.
- Do not persist scoped forecast snapshots in this iteration.
- Do not create a database migration.
- Do not auto-refresh missing task forecasts from this read endpoint.
- Do not modify production data during local verification.

## Acceptance Criteria

The feature is code-complete when an authorized project member can open Task Summary and, for every available division, subdivision, and specialty group, inspect backend-calculated expected finish, remaining duration, delay, P20/P50/P80, confidence, and data status; all values are based on the complete project dependency context and construction calendar; missing evidence is explicitly degraded rather than hidden; forecast failure does not break existing completion summaries; and focused backend, route, client, type-check, and regression tests pass without any production mutation.
