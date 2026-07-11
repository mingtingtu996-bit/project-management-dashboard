# Task Plan Drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a selected Gantt master-plan task to a governed, previewable, transactionally committed execution-plan drilldown and then review a simulated project execution plan from a construction project manager perspective.

**Architecture:** The Gantt row action opens a route-level lazy `expand` workbench keyed only by project and parent task IDs. The server reloads the parent task, locks scope and drilldown depth, resolves a matching governed template node, removes the selected template root so only the next planning level is materialized, enforces an 80 schedule-row limit, and commits generated tasks plus dependencies in one PostgreSQL transaction. Existing project-wide generation remains unchanged and the 500-row fuse remains a single-operation or single-batch boundary, never a project-total limit.

**Tech Stack:** React 18, TypeScript, React Router, Vitest, Express, PostgreSQL `pg`, existing WBS generation services and planning-table commit APIs.

## Global Constraints

- Wizard master plans remain 60-300 rows, normally 80-200 rows.
- Normal project execution plans may accumulate 300-800 rows; project totals above 500 are allowed.
- A selected-row drilldown targets 5-40 schedule rows and has a hard server limit of 80 schedule rows.
- Planning lineage is `master_control -> process_detail -> activity_step` and is independent of display `wbs_node_type`.
- First expansion never generates activity steps; activity steps require a second explicit expansion.
- Parent project, engineering-object scope, planned window, template lineage, and standard-work lineage are loaded from the server.
- No direct client task inserts and no production-data writes during local verification.
- Existing unrelated working-tree changes must not be reverted.

---

### Task 1: Authoritative drilldown policy and context

**Files:**
- Create: `server/src/services/taskPlanDrilldownPolicyService.ts`
- Create: `server/src/__tests__/taskPlanDrilldownPolicyService.test.ts`
- Modify: `server/src/routes/tasks.ts`

**Interfaces:**
- Produces: `TASK_PLAN_DRILLDOWN_ROW_LIMIT = 80`.
- Produces: `resolveTaskPlanDrilldownLevel(task)`, `buildTaskPlanDrilldownScope(task)`, `resolveTaskPlanDrilldownRecommendation(task, catalogs)`, and `governTaskPlanDrilldownOperation(task, operation)`.
- Produces: `GET /api/tasks/:id/plan-drilldown-context` with authoritative parent, locked scope, current/next level, generation depth, recommendation, row limit, and project row-count warning.

- [ ] **Step 1: Write failing pure policy tests**

```ts
expect(resolveTaskPlanDrilldownLevel(masterTask)).toBe('master_control')
expect(resolveTaskPlanDrilldownLevel(processTask)).toBe('process_detail')
expect(governTaskPlanDrilldownOperation(masterTask, forgedOperation)).toMatchObject({
  attachUnderRowId: masterTask.id,
  generationDepth: 'process',
  includeActivitySteps: false,
  drilldownGenerationLevel: 'process_detail',
  scope: { building_object_id: masterTask.building_object_id },
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/taskPlanDrilldownPolicyService.test.ts`

Expected: FAIL because the policy service does not exist.

- [ ] **Step 3: Implement level, scope, and deterministic catalog matching**

```ts
export const TASK_PLAN_DRILLDOWN_ROW_LIMIT = 80
export type TaskPlanDrilldownLevel = 'master_control' | 'process_detail' | 'activity_step'

export function governTaskPlanDrilldownOperation(task: TaskLike, operation: Record<string, unknown>) {
  const currentLevel = resolveTaskPlanDrilldownLevel(task)
  const nextLevel = currentLevel === 'master_control' ? 'process_detail'
    : currentLevel === 'process_detail' ? 'activity_step' : null
  if (!nextLevel) throw drilldownError('TASK_PLAN_DRILLDOWN_MAX_DEPTH', '作业步骤已是最细执行层级')
  return {
    ...operation,
    attachUnderRowId: task.id,
    scope: buildTaskPlanDrilldownScope(task),
    generationDepth: nextLevel === 'process_detail' ? 'process' : 'activity_step',
    includeActivitySteps: nextLevel === 'activity_step',
    drilldownMode: 'selected_children',
    drilldownGenerationLevel: nextLevel,
    sourceParentTaskId: task.id,
  }
}
```

- [ ] **Step 4: Add the authenticated context endpoint**

The endpoint reloads the task with `supabase.getTask`, checks project membership through the existing middleware, calls `listWbsTemplateCatalog({ includeNodes: true })`, and returns no mutation result.

- [ ] **Step 5: Run policy and route tests GREEN**

Run: `npm exec --workspace=server -- vitest run src/__tests__/taskPlanDrilldownPolicyService.test.ts src/__tests__/tasksCommitRoute.test.ts`

Expected: policy tests pass; the two pre-existing dependency-call assertions are updated to include `{ preserveCurrentTaskFacts: false }`.

### Task 2: Selected-children frontier, lineage, and 80-row hard limit

**Files:**
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Modify: `server/src/services/defaultMasterPlanExecutableAssemblyService.ts`
- Modify: `server/src/routes/wbs-templates.ts`
- Modify: `server/src/__tests__/wbsTemplateGenerationService.test.ts`
- Modify: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`

**Interfaces:**
- Consumes: `governTaskPlanDrilldownOperation` and `TASK_PLAN_DRILLDOWN_ROW_LIMIT`.
- Produces: retained rows whose selected template root is removed and whose immediate children attach to the authoritative parent task.
- Produces: persisted `standard_task_metadata.drilldownGenerationLineage` with level, parent, batch, template, and selected-node identity.

- [ ] **Step 1: Write failing generation tests**

```ts
expect(generated.rows.every((row) => row.values.template_node_id !== selectedRootId)).toBe(true)
expect(generated.rows.filter((row) => !row.parentClientRowId).every((row) => row.parentRowId === parentTaskId)).toBe(true)
expect(readLineage(generated.rows[0]).level).toBe('process_detail')
await expect(generateEightyOneScheduleRows()).rejects.toMatchObject({
  code: 'TASK_PLAN_DRILLDOWN_ROW_LIMIT_EXCEEDED',
  statusCode: 413,
})
```

- [ ] **Step 2: Run the focused tests RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/wbsTemplateGenerationService.test.ts -t "drilldown"`

Expected: FAIL because root pruning, lineage, and the 80-row limit are absent.

- [ ] **Step 3: Implement selected-child frontier and metadata**

```ts
function applyTaskPlanDrilldownFrontier(rows: GeneratedTemplateRow[], operation: PlanningTableOperation) {
  if (operation.drilldownMode !== 'selected_children') return rows
  const removedRootIds = new Set(rows
    .filter((row) => selectedNodeIds.has(String(row.values.template_node_id ?? '')))
    .map((row) => row.clientRowId))
  return rows.filter((row) => !removedRootIds.has(row.clientRowId)).map((row) => ({
    ...row,
    parentClientRowId: removedRootIds.has(String(row.parentClientRowId ?? '')) ? null : row.parentClientRowId,
    parentRowId: removedRootIds.has(String(row.parentClientRowId ?? '')) ? attachUnderRowId : row.parentRowId,
  }))
}
```

The implementation also removes dependency references to pruned roots, annotates lineage, errors on an empty frontier, and returns `rowLimit: 80` for attached generation.

- [ ] **Step 4: Govern preview operations with the authoritative parent**

Before `generateWbsTemplateRows`, `wbs-templates.ts` reloads `attachUnderRowId`, verifies the same project, and replaces client-supplied scope/depth with `governTaskPlanDrilldownOperation` output.

- [ ] **Step 5: Mark generated default-master-plan rows as `master_control`**

Add `drilldownGenerationLineage: { level: 'master_control', ... }` to executable default-master-plan metadata without changing display `wbs_node_type`.

- [ ] **Step 6: Run focused generation tests GREEN**

Run: `npm exec --workspace=server -- vitest run src/__tests__/wbsTemplateGenerationService.test.ts -t "drilldown"`

Run: `npm exec --workspace=server -- vitest run src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts -t "master control"`

### Task 3: Atomic task and dependency materialization

**Files:**
- Modify: `server/src/services/taskWriteChainService.ts`
- Modify: `server/src/routes/tasks.ts`
- Modify: `server/src/__tests__/tasksCommitRoute.test.ts`
- Modify: `server/src/__tests__/taskWriteChainService.test.ts`

**Interfaces:**
- Consumes: existing `createTasksInWizardBatch` and `replaceWizardGeneratedTaskDependenciesBatch` transaction-client contracts.
- Produces: one `BEGIN -> task batch -> dependency batch -> COMMIT` unit; any task/dependency failure executes `ROLLBACK`.

- [ ] **Step 1: Write failing rollback and existing-parent hierarchy tests**

```ts
expect(transactionStatements).toEqual(expect.arrayContaining(['BEGIN', 'ROLLBACK']))
expect(transactionStatements).not.toContain('COMMIT')
expect(createdChild.parent_id).toBe(existingParent.id)
expect(createdChild.wbs_code.startsWith(`${existingParent.wbs_code}.`)).toBe(true)
```

- [ ] **Step 2: Run tests RED**

Run: `npm exec --workspace=server -- vitest run src/__tests__/tasksCommitRoute.test.ts -t "template_generate"`

Expected: FAIL because template rows are currently created one by one and dependencies are committed separately.

- [ ] **Step 3: Extend batch creation for an existing external parent**

Load external parent WBS context once, seed its child count, and allow a display `process` parent to create process-detail children only when its metadata level is `master_control`.

- [ ] **Step 4: Wrap generated tasks and dependencies in one transaction**

```ts
const client = await getClient()
await client.query('BEGIN')
try {
  const created = await createTasksInWizardBatch(items, actorId, { transactionClient: client, deferPostCreateEffects: true })
  await replaceWizardGeneratedTaskDependenciesBatch({ projectId, dependencies, actorId, transactionClient: client })
  await client.query('COMMIT')
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  client.release?.()
}
```

- [ ] **Step 5: Run commit tests GREEN**

Run: `npm exec --workspace=server -- vitest run src/__tests__/tasksCommitRoute.test.ts src/__tests__/taskWriteChainService.test.ts`

### Task 4: Route-level Gantt drilldown workbench

**Files:**
- Create: `client/src/services/taskPlanDrilldownApi.ts`
- Create: `client/src/pages/GanttView/TaskPlanDrilldownWorkbench.tsx`
- Create: `client/src/pages/GanttView/__tests__/TaskPlanDrilldownWorkbench.test.tsx`
- Modify: `client/src/pages/GanttView/PlanningModelingWorkbenchDialog.tsx`
- Modify: `client/src/pages/GanttView.tsx`
- Modify: `client/src/pages/GanttViewRows.tsx`
- Modify: `client/src/components/planning/TemplateInlineExpand.tsx`
- Modify: `client/src/components/planning/TemplateBrowser.tsx`
- Modify: `client/src/components/planning/TemplateGenerationPreview.tsx`
- Modify: `client/src/components/planning/PlanningCommitModel.ts`
- Modify: `client/src/pages/__tests__/GanttView.test.tsx`
- Modify: `client/src/components/planning/__tests__/templateGenerationComponents.test.tsx`

**Interfaces:**
- Changes: `onGenerateTasks?: (task?: Task) => void`; a row passes its task and the empty/page action passes nothing.
- Changes: `PlanningModelingWorkbenchMode = 'generate' | 'adjust' | 'expand'`.
- Produces: async `TemplateInlineExpand.onApply`, explicit drilldown selection mode, locked generation depth, nested-node search, 80-row apply block, and immediate planning-table commit.

- [ ] **Step 1: Write failing UI and callback tests**

```tsx
expect(row.onSmartExpand).toBeDefined()
row.onSmartExpand?.()
expect(onGenerateTasks).toHaveBeenCalledWith(task)
expect(generateWbsTemplatePreview).toHaveBeenCalledWith(expect.objectContaining({
  attachUnderRowId: task.id,
  generationDepth: 'process',
  drilldownMode: 'selected_children',
}))
expect(commitTaskListTable).toHaveBeenCalledTimes(1)
```

- [ ] **Step 2: Run UI tests RED**

Run: `npm exec --workspace=client -- vitest run src/pages/__tests__/GanttView.test.tsx src/components/planning/__tests__/templateGenerationComponents.test.tsx src/pages/GanttView/__tests__/TaskPlanDrilldownWorkbench.test.tsx`

- [ ] **Step 3: Implement the task-aware route contract**

The row opens `?modelingWorkbench=expand&parentTask=<id>`. Page-level generation continues to open `?modelingWorkbench=generate`. Successful commit returns to `?highlight=<parentTaskId>`.

- [ ] **Step 4: Implement the lazy workbench and commit operation**

```ts
const operation: PlanningTableTemplateGenerate = {
  type: 'template_generate',
  generationBatchId: preview.generationBatchId,
  templateId: context.templateId,
  templateIds: context.templateIds,
  selectedNodeIds: context.selectedNodeIds,
  selectedNodesByTemplate: context.selectedNodesByTemplate,
  scope: drilldown.scope,
  attachUnderRowId: drilldown.parentTask.id,
  generationDepth: drilldown.generationDepth,
  includeActivitySteps: drilldown.generationDepth === 'activity_step',
  duplicatePolicy: context.duplicatePolicy,
  previewRows: selectedRows,
  drilldownMode: 'selected_children',
  drilldownGenerationLevel: drilldown.nextLevel,
  sourceParentTaskId: drilldown.parentTask.id,
}
```

- [ ] **Step 5: Remove automatic root selection in drilldown mode and add nested-node search**

Default baseline/full-generation behavior remains unchanged. Drilldown mode selects only an exact server recommendation; otherwise no node is selected until the user chooses a searched node.

- [ ] **Step 6: Enforce client counts and execution-plan warnings**

The preview displays generated/selected schedule-row counts, blocks apply above 80, and the task page warns at more than 800 persisted execution rows without imposing a 500-row project-total block.

- [ ] **Step 7: Run UI tests GREEN**

Run: `npm exec --workspace=client -- vitest run src/pages/__tests__/GanttView.test.tsx src/components/planning/__tests__/templateGenerationComponents.test.tsx src/pages/GanttView/__tests__/TaskPlanDrilldownWorkbench.test.tsx`

### Task 5: Simulated execution-plan review and final verification

**Files:**
- Create: `project-testing/tools/generate-task-plan-drilldown-simulation.mjs`
- Create: `project-testing/tools/task-plan-drilldown-construction-quality.test.mjs`
- Create: `project-testing/reports/task-plan-drilldown-20260711/README.md`
- Create: `project-testing/reports/task-plan-drilldown-20260711/residential-execution-plan.md`
- Create: `project-testing/reports/task-plan-drilldown-20260711/residential-execution-plan.json`

**Interfaces:**
- Consumes: default residential master-plan simulation plus governed row-specific generation.
- Produces: counts, WBS hierarchy, dependencies, dates, scope, milestone/interface coverage, row-limit checks, and a project-manager verdict.

- [ ] **Step 1: Write a failing construction-quality test**

```js
assert.ok(report.totalRows >= 300 && report.totalRows <= 800)
assert.ok(report.expansions.every((item) => item.scheduleRowCount <= 80))
assert.equal(report.orphanDependencyCount, 0)
assert.equal(report.cycleCount, 0)
assert.ok(report.scopeCoverageRate >= 0.95)
assert.ok(report.keyWorkPackageCoverageRate >= 0.9)
```

- [ ] **Step 2: Generate the system-only simulated plan**

Run: `node project-testing/tools/generate-task-plan-drilldown-simulation.mjs`

Expected: report artifacts are generated without DB writes or model-generated task content.

- [ ] **Step 3: Run construction-quality tests and typechecks**

Run: `node --test project-testing/tools/task-plan-drilldown-construction-quality.test.mjs`

Run: `npm run typecheck --workspace=client`

Run: `npm run typecheck --workspace=server`

- [ ] **Step 4: Run focused regression suites**

Run: `npm exec --workspace=client -- vitest run src/components/planning/__tests__/templateGenerationComponents.test.tsx src/pages/__tests__/GanttView.test.tsx src/pages/GanttView/__tests__/TaskPlanDrilldownWorkbench.test.tsx`

Run: `npm exec --workspace=server -- vitest run src/__tests__/taskPlanDrilldownPolicyService.test.ts src/__tests__/tasksCommitRoute.test.ts src/__tests__/taskWriteChainService.test.ts`

- [ ] **Step 5: Review as project manager**

Review the generated table for controllable work packages, sequence and overlap, interfaces, acceptance/handover chain, scope ownership, resource-constraining items, practical update cadence, and whether remaining edits are normal project-specific micro-adjustments or structural defects.
