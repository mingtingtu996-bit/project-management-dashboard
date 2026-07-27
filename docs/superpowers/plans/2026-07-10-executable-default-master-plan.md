# Executable Default Master Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让项目向导仅凭现有向导字段，充分消费标准工期、T2 节奏、WBS 工序和依赖资产，按 v1.4.23.1 的 `managed_frontier + schedule_row / primary_schedule` 样式生成覆盖 11 个业态、可以直接形成现场总控基线的计划。

**Architecture:** 保留现有 `buildTemplateRecommendation -> buildWizardTemplateSelection -> generateWbsTemplateRows` 单一生成链路，在业态骨架生成后增加独立的 executable assembly 层。该层从现有 linked projection 中按可排性、工期可信度、阶段覆盖、父子关系和依赖闭包提升正式计划行，并输出可被向导预览和提交共同校验的质量摘要；真实样本只作为可选校准 overlay，不再是首版计划的阻断条件。

**Tech Stack:** TypeScript, Vitest, Express, PostgreSQL transactional wizard writer, existing WBS/standard duration/T2/CPM services.

## Global Constraints

- 不新增向导必填字段，不要求图纸、分包界面、机械配置、劳动力、审图报批或采购周期。
- 11 个正式业态以 `FORMAL_BUSINESS_TYPE_CODES` 为唯一枚举来源。
- 预览保持 no-write；向导确认继续通过现有事务写入 `tasks` 与 `task_dependencies`。
- 内置标准工期、T2 节奏、施工日历和依赖规则是首版总控计划权威来源；真实项目样本是 optional calibration overlay。
- 现场总控计划保持 v1.4.23.1 的 `managed_frontier`、`schedule_row`、`primary_schedule`、工期字段、依赖字段和 WBS 层级约定。
- 不运行 live、guarded write 或生产数据库测试。

---

### Task 1: Executable assembly contract

**Files:**
- Create: `server/src/services/defaultMasterPlanExecutableAssemblyService.ts`
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`

**Interfaces:**
- Consumes: `GeneratedTemplateRow[]`, `GeneratedMasterPlanProfile`, formal business type code.
- Produces: `assembleExecutableDefaultMasterPlanRows(input): ExecutableDefaultMasterPlanAssemblySummary` and in-place row projection updates.

- [ ] **Step 1: Write the failing 11-business-type integration test**

```ts
expect(scheduleRows.length).toBeGreaterThanOrEqual(generated.masterPlanProfile.rowCountRange[0])
expect(generated.executableDefaultMasterPlanAssembly.status).toBe('executable_default_master_plan_ready')
expect(generated.executableDefaultMasterPlanAssembly.calibrationPolicy).toBe('optional_runtime_overlay')
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run --config server/vitest.config.ts server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts -t "builds executable default master plans"`

Expected: FAIL because current output has only 6-18 schedule rows and no executable assembly summary.

- [ ] **Step 3: Implement deterministic promotion**

```ts
export function assembleExecutableDefaultMasterPlanRows(
  input: ExecutableDefaultMasterPlanAssemblyInput,
): ExecutableDefaultMasterPlanAssemblySummary
```

Select only former schedule projections with valid dates and reference duration, preserve phase coverage, include parent/predecessor closure, stop within the profile upper bound, and annotate promoted rows with system-standard authority lineage.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS for all 11 formal business types.

### Task 2: Duration authority and realistic risk range

**Files:**
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`

**Interfaces:**
- Consumes: standard duration seed, T2 window, project scale facts, calendar and optional runtime reference days.
- Produces: `system_standard_asset_backed` duration provenance and ordered P20/P50/P80 values.

- [ ] **Step 1: Write failing assertions**

```ts
expect(row.values.duration_authority).toBe('system_standard_seed')
expect(row.values.duration_review_required).toBe(false)
expect(p20).toBeGreaterThanOrEqual(Math.ceil(p50 * 0.65))
expect(p80).toBeGreaterThanOrEqual(Math.ceil(p50 * 1.1))
```

- [ ] **Step 2: Verify RED**

Expected: current rows still expose candidate/real-evidence review semantics and allow one-day P20 values.

- [ ] **Step 3: Implement authority normalization and risk floors**

Use the built-in standard seed and T2 result as P50, apply a 65% P20 floor and 110% P80 floor, and record runtime sample use only as `optional_runtime_calibration_overlay`.

- [ ] **Step 4: Verify GREEN**

Run the focused generator tests and duration-asset tests.

### Task 3: Dependency and trust contract

**Files:**
- Modify: `server/src/services/wbsTemplateGenerationService.ts`
- Modify: `server/src/routes/projectWizard.ts`
- Test: `server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts`
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`

**Interfaces:**
- Consumes: promoted row dependency closure and existing candidate network evaluation.
- Produces: visible predecessor coverage, trusted schedule gate, and transactional commit policy metadata.

- [ ] **Step 1: Write failing tests for visible dependency closure and no calibration blocker**
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Mark default-plan dependencies as preview-no-write / wizard-commit-transactional-write, remove `GENERATION_DEPTH_TRUST_REVIEW_REQUIRED` when system assets are complete, and expose the assembly quality summary to the route**
- [ ] **Step 4: Verify GREEN with generator and wizard route tests**

### Task 4: Wizard preview and project-manager output

**Files:**
- Modify: `server/src/routes/projectWizard.ts`
- Test: `server/src/__tests__/projectWizardRoutes.test.ts`
- Test: `server/src/__tests__/wizardGenerationSideEffects.test.ts`

**Interfaces:**
- Produces: preview rows with WBS code, title, level, start, end, duration, phase, lane, predecessor codes, milestone flag, duration basis and authority.

- [ ] **Step 1: Write route contract tests that require the complete schedule preview**
- [ ] **Step 2: Verify RED**
- [ ] **Step 3: Add `executableDefaultMasterPlanPreview` and a pre-write readiness assertion without changing the existing transaction boundary**
- [ ] **Step 4: Verify GREEN**

### Task 5: Eleven-business-type replay and testing-center evidence

**Files:**
- Modify: `project-testing/tools/generate-default-master-plan-profile-report.mjs`
- Create: `project-testing/reports/executable-default-master-plan-20260710/default-master-plan-profile-samples.json`
- Create: `project-testing/reports/executable-default-master-plan-20260710/default-master-plan-profile-samples.md`

**Interfaces:**
- Consumes: all `FORMAL_BUSINESS_TYPE_CODES` through the same generator entry.
- Produces: row counts, phase coverage, duration authority, risk bounds, dependency coverage and no-write mutation evidence for all 11 types.

- [ ] **Step 1: Extend the report test/runner from 10 non-residential types to all 11 formal types**
- [ ] **Step 2: Run focused Vitest, server typecheck and testing-center local-static profile**
- [ ] **Step 3: Generate the 11-type report and inspect the hospital plan row-by-row**
- [ ] **Step 4: Run the relevant regression suite and record any live/DB gates as not run, not pass**
