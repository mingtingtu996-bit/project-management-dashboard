# Task Status Unified Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out the unified task status derivation stack by making the unified outlet the single source of truth, adding rule/provenance metadata, and removing redundant downstream fallback logic.

**Architecture:** Keep `taskStatusDerivationService` as the canonical state-axis outlet. Add a small rule registry inside the service for lifecycle, business, due, and lag priorities/thresholds, plus provenance fields that distinguish direct facts, derived signals, seed-backed inputs, and legacy fallback. Then simplify consumers (`businessStatusService`, `taskLagStatusService`, task routes, and client display helpers) so they prefer backend DTO output and only use local fallback as a compatibility floor.

**Tech Stack:** TypeScript, Vitest, existing Express routes, existing DTO/model services, existing status dictionary service.

---

### Task 1: Centralize task status rules and provenance

**Files:**
- Modify: `server/src/services/taskStatusDerivationService.ts`
- Modify: `server/src/services/statusDictionaryService.ts`
- Test: `server/src/__tests__/taskStatusDerivationService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('exposes provenance and rule metadata for the unified status axes', () => {
  const result = deriveTaskUnifiedStatus({
    status: 'todo',
    progress: 0,
    ready_for_start: false,
    dependency_status: 'blocking',
    condition_status: 'blocking',
    obstacle_status: 'clear',
    progress_impact_level: 'none',
    blocked_for_progress: false,
    planned_end_date: '2026-06-10',
  }, { currentDate: new Date('2026-05-27T00:00:00Z') })

  expect(result.ruleVersion).toBe('v1.4.5-task-status-unified-p2')
  expect(result.businessStatus.evidence).toEqual(expect.objectContaining({
    ruleSource: 'direct_fact',
    ruleVersion: 'v1.4.5-task-status-unified-p2',
  }))
  expect(result.dueStatus.evidence).toEqual(expect.objectContaining({
    ruleSource: 'derived_window',
  }))
  expect(result.lagLevel).toBe('none')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskStatusDerivationService.test.ts`
Expected: FAIL because the rule metadata and provenance fields are not yet emitted.

- [ ] **Step 3: Write minimal implementation**

```ts
type TaskStatusRuleSource = 'direct_fact' | 'derived_window' | 'seed_signal' | 'legacy_fallback'

const TASK_STATUS_RULE_REGISTRY = {
  business: {
    blockedPriority: ['blocked', 'partial', 'warning'],
    readinessPriority: ['dependency_status', 'condition_status', 'ready_for_start'],
  },
  due: {
    urgentDays: 3,
    approachingDays: 7,
  },
  lag: {
    explicitFields: ['lagLevel', 'lag_level', 'forecast_lag_level', 'lagStatus', 'lag_status', 'delay_signal_status'],
  },
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskStatusDerivationService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/taskStatusDerivationService.ts server/src/services/statusDictionaryService.ts server/src/__tests__/taskStatusDerivationService.test.ts
git commit -m "feat: centralize task status derivation rules"
```

### Task 2: Make unified DTO the preferred consumer contract

**Files:**
- Modify: `server/src/services/taskStandardModelService.ts`
- Modify: `server/src/services/businessStatusService.ts`
- Modify: `server/src/routes/tasks.ts`
- Test: `server/src/__tests__/taskStandardModelService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('buildStandardDTO returns unified status evidence and does not require follow-up lag attachment for the list surface', async () => {
  const dto = await buildStandardDTO({
    id: 'task-status-dto',
    status: 'in_progress',
    progress: 40,
    building_object_id: 'building-1',
    wbs_node_type: 'process',
    ready_for_start: true,
    dependency_status: 'satisfied',
    condition_status: 'satisfied',
    obstacle_status: 'clear',
    progress_impact_level: 'none',
  }, { mode: 'list' })

  expect(dto.statusDerivation).toBeTruthy()
  expect(dto.statusDerivation.businessStatus.evidence).toEqual(expect.objectContaining({
    ruleSource: 'direct_fact',
  }))
  expect(dto.lagLevel).toBeDefined()
  expect(dto.lagStatus).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskStandardModelService.test.ts`
Expected: FAIL until DTO carries the new evidence shape and the route stops re-attaching lag from the old path.

- [ ] **Step 3: Write minimal implementation**

```ts
const unified = deriveTaskUnifiedStatus(...)
const dto = {
  ...task,
  statusDerivation: unified,
  businessStatus: { status: unified.businessStatus.status, label: unified.businessStatus.label },
  displayStatus: unified.businessStatus.label,
  lagLevel: unified.lagLevel,
  lagStatus: unified.lagStatus,
  dueStatus: { status: unified.dueStatus.status, label: unified.dueStatus.label, daysUntilDue: unified.dueStatus.daysUntilDue },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskStandardModelService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/taskStandardModelService.ts server/src/services/businessStatusService.ts server/src/routes/tasks.ts server/src/__tests__/taskStandardModelService.test.ts
git commit -m "feat: prefer unified task status dto"
```

### Task 3: Reduce downstream fallback logic

**Files:**
- Modify: `server/src/services/taskLagStatusService.ts`
- Modify: `client/src/lib/taskBusinessStatus.ts`
- Modify: `client/src/pages/GanttView/ganttViewUtils.ts`
- Test: `client/src/lib/__tests__/taskBusinessStatus.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('prefers backend businessStatus and lag fields while keeping fallback behavior only for missing backend data', () => {
  expect(getTaskBusinessStatus({
    id: 'backend-status',
    status: 'todo',
    progress: 0,
    businessStatus: { status: 'progress_warning', label: '执行预警' },
    lagLevel: 'none',
    lagStatus: '正常',
  })).toEqual(TASK_STATUS_THEME.progress_warning)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config client/vitest.config.ts client/src/lib/__tests__/taskBusinessStatus.test.ts`
Expected: FAIL if the client still takes too much local precedence or duplicates status derivation.

- [ ] **Step 3: Write minimal implementation**

```ts
export function getTaskBusinessStatus(task: TaskLike, options = {}): TaskBusinessStatus {
  const backendStatus = normalizeStatus(task.businessStatus?.status)
  if (backendStatus && backendStatus in TASK_STATUS_THEME) return TASK_STATUS_THEME[backendStatus as TaskBusinessStatusCode]
  // keep fallback only here
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config client/vitest.config.ts client/src/lib/__tests__/taskBusinessStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/taskLagStatusService.ts client/src/lib/taskBusinessStatus.ts client/src/pages/GanttView/ganttViewUtils.ts client/src/lib/__tests__/taskBusinessStatus.test.ts
git commit -m "feat: reduce task status fallback logic"
```

### Task 4: Add batch-friendly business status reuse

**Files:**
- Modify: `server/src/services/businessStatusService.ts`
- Modify: `server/src/routes/task-conditions.ts`
- Modify: `server/src/routes/task-obstacles.ts`
- Test: `server/src/__tests__/taskStatusDerivationService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('can derive business status from an already-loaded task fact bundle without requerying', async () => {
  const status = BusinessStatusService.evaluateBusinessStatusFromFacts({
    taskStatus: 'in_progress',
    taskProgress: 35,
    conditions: [{ is_satisfied: false }],
    obstacles: [{ status: 'resolving' }],
    task: {
      ready_for_start: false,
      dependency_status: 'blocking',
      condition_status: 'blocking',
      obstacle_status: 'blocked',
      progress_impact_level: 'blocked',
    },
  })
  expect(status.display).toBe('受阻')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskStatusDerivationService.test.ts`
Expected: FAIL until the helper exists.

- [ ] **Step 3: Write minimal implementation**

```ts
static evaluateBusinessStatusFromFacts(input: { taskStatus: string; taskProgress: number; conditions: TaskCondition[]; obstacles: TaskObstacle[]; task?: Partial<Task> & Record<string, unknown> }): BusinessStatus {
  const unified = deriveTaskUnifiedStatus(...)
  return { display: ..., reason: unified.businessStatus.reason, priority: ... }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/taskStatusDerivationService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/businessStatusService.ts server/src/routes/task-conditions.ts server/src/routes/task-obstacles.ts server/src/__tests__/taskStatusDerivationService.test.ts
git commit -m "feat: reuse loaded facts for business status"
```

### Task 5: Sync docs and execution progress

**Files:**
- Modify: `docs/plans/v1.4.5状态与生命周期字典体系执行方案.md`
- Modify: `docs/plans/v1.4.22算法与规则口径治理体系执行方案.md`
- Modify: `EXECUTION_PROGRESS.json`

- [ ] **Step 1: Write the failing documentation expectation**

```md
Update the status-system sections to say the implementation is a unified task-status outlet with multiple axes, not a six-layer tree, and record that seed/rule assets only contribute upstream signals and provenance.
```

- [ ] **Step 2: Run validation**

Run: `node -e "JSON.parse(require('fs').readFileSync('EXECUTION_PROGRESS.json','utf8')); console.log('ok')"`
Expected: PASS after the progress record is updated.

- [ ] **Step 3: Write minimal implementation**

Update the closeout note to mention:
1. unified task status outlet
2. rule registry / provenance metadata
3. backend DTO preferred
4. seed as upstream signals only
5. compatibility fallbacks retained only where unavoidable

- [ ] **Step 4: Run validation**

Run: `node -e "JSON.parse(require('fs').readFileSync('EXECUTION_PROGRESS.json','utf8')); console.log('ok')"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/v1.4.5状态与生命周期字典体系执行方案.md docs/plans/v1.4.22算法与规则口径治理体系执行方案.md EXECUTION_PROGRESS.json
git commit -m "docs: close out unified task status axis"
```
