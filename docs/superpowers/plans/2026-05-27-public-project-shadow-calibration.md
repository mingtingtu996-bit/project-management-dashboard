# Public Project Shadow Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run two public in-build project shadow calibrations, persist only `shadow` / `candidate` rows, and write a report without touching real project facts.

**Architecture:** Keep the public samples as a small manifest registry, create private `public_shadow` project shells only as calibration anchors, and inject synthetic shadow evidence directly into the existing compensation/calibration services. The job path should be admin-triggered, reuse the current calibration table, and hard-stop on any attempt to publish from the public shadow channel.

**Tech Stack:** TypeScript, Express, Supabase, Vitest, existing server services/jobs/routes.

---

### Task 1: Add public shadow manifest and shell helpers

**Files:**
- Create: `server/src/services/publicProjectShadowManifestService.ts`
- Modify: `server/src/services/dbService.ts`
- Test: `server/src/__tests__/publicProjectShadowManifestService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(listPublicProjectShadowManifests()).toHaveLength(2)
expect(manifests[0]).toMatchObject({
  shadowKey: 'jinyang-garden',
  projectName: '锦洋花园',
  projectType: 'residential',
})
expect(buildPublicProjectShadowProjectInput(manifest)).toMatchObject({
  project_type: 'public_shadow',
  project_visibility: 'private',
  status: 'wizard_drafting',
})
```

- [ ] **Step 2: Run the test and confirm the shell creation contract fails first**

Run: `npx vitest run server/src/__tests__/publicProjectShadowManifestService.test.ts`

- [ ] **Step 3: Implement the manifest registry and shell input builder**

```ts
export function listPublicProjectShadowManifests() { ... }
export function buildPublicProjectShadowProjectInput(manifest: PublicProjectShadowManifest) { ... }
```

Update `normalizeProjectStatus()` so `wizard_drafting` is preserved instead of falling back to `未开始`.

- [ ] **Step 4: Re-run the test**

Run: `npx vitest run server/src/__tests__/publicProjectShadowManifestService.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/publicProjectShadowManifestService.ts server/src/services/dbService.ts server/src/__tests__/publicProjectShadowManifestService.test.ts
git commit -m "feat: add public project shadow manifest helpers"
```

### Task 2: Allow shadow evidence injection into calibration services

**Files:**
- Modify: `server/src/services/projectProductivityCompensationService.ts`
- Modify: `server/src/services/projectProductivityCalibrationService.ts`
- Test: `server/src/__tests__/projectProductivityCompensationService.test.ts`
- Test: `server/src/__tests__/projectProductivityCalibrationService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that call the services with injected `shadowEvidence` and assert they do not query real project fact tables.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/src/__tests__/projectProductivityCompensationService.test.ts server/src/__tests__/projectProductivityCalibrationService.test.ts`

- [ ] **Step 3: Add optional shadow evidence inputs**

```ts
shadowEvidence?: {
  durationSamples?: DurationSampleRow[]
  dailySnapshots?: DailySnapshotRow[]
  scheduleStates?: ProjectScheduleStateResult[]
  publishedCalibration?: ProjectProductivityPublishedCalibration | null
}
```

Use injected evidence first; keep the current DB-backed path as fallback.

- [ ] **Step 4: Re-run the tests**

Run: `npx vitest run server/src/__tests__/projectProductivityCompensationService.test.ts server/src/__tests__/projectProductivityCalibrationService.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/projectProductivityCompensationService.ts server/src/services/projectProductivityCalibrationService.ts server/src/__tests__/projectProductivityCompensationService.test.ts server/src/__tests__/projectProductivityCalibrationService.test.ts
git commit -m "feat: support injected shadow evidence for calibration"
```

### Task 3: Build the public-project shadow runner and report writer

**Files:**
- Create: `server/src/services/publicProjectShadowCalibrationService.ts`
- Create: `server/src/jobs/publicProjectShadowCalibrationJob.ts`
- Modify: `server/src/routes/jobs.ts`
- Modify: `server/src/index.ts` if a new import is required
- Test: `server/src/__tests__/publicProjectShadowCalibrationService.test.ts`
- Test: `server/src/__tests__/publicProjectShadowCalibrationJob.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover:
- manifest lookup for `锦洋花园` and `唐山凤栖中学项目施工总承包`
- shadow shell creation with `public_shadow` / `private` / `wizard_drafting`
- `shadow` result writes to `project_productivity_compensation_calibrations`
- job run never writes `published`
- markdown and JSON report files are emitted

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run server/src/__tests__/publicProjectShadowCalibrationService.test.ts server/src/__tests__/publicProjectShadowCalibrationJob.test.ts`

- [ ] **Step 3: Implement the shadow runner**

Use the public manifest to:
- ensure or create a shadow shell project
- synthesize minimal duration / snapshot / schedule-state evidence in memory
- call the calibration services with injected shadow evidence
- persist only `shadow` / `candidate`
- emit a markdown report and a JSON report into `project-search/public-project-data/reports/`

- [ ] **Step 4: Wire the job into the admin job runner**

Add a new `projectPublicShadowCalibrationJob` entry in `jobs.ts` so an admin can trigger the runner with the existing `/api/jobs/:jobName/execute` route.

- [ ] **Step 5: Re-run the tests**

Run: `npx vitest run server/src/__tests__/publicProjectShadowCalibrationService.test.ts server/src/__tests__/publicProjectShadowCalibrationJob.test.ts`

- [ ] **Step 6: Commit**

```bash
git add server/src/services/publicProjectShadowCalibrationService.ts server/src/jobs/publicProjectShadowCalibrationJob.ts server/src/routes/jobs.ts server/src/index.ts server/src/__tests__/publicProjectShadowCalibrationService.test.ts server/src/__tests__/publicProjectShadowCalibrationJob.test.ts
git commit -m "feat: add public project shadow calibration job"
```

### Task 4: Execute the two public shadow runs and verify no published rows appear

**Files:**
- Modify: `project-search/public-project-data/reports/*` through generated report output only
- Test: `server/src/__tests__/publicProjectShadowCalibrationService.test.ts`

- [ ] **Step 1: Run the job against the two manifest keys**

Use the admin job route or the service entry directly to run:
- `锦洋花园`
- `唐山凤栖中学项目施工总承包`

- [ ] **Step 2: Verify persisted rows**

Confirm:
- each project has at least one row in `project_productivity_compensation_calibrations`
- row status is `shadow` or `candidate`
- no `published` row is created by this channel

- [ ] **Step 3: Verify reports**

Check the generated markdown / JSON report for:
- source coverage
- bias before / after
- recommended cap
- schedule-state distribution
- compensation source breakdown

- [ ] **Step 4: Final verification**

Run:
`npx tsc -p server/tsconfig.json --noEmit`

Then run the focused vitest files above.

- [ ] **Step 5: Commit**

```bash
git add project-search/public-project-data/reports server/src/services/publicProjectShadowCalibrationService.ts server/src/jobs/publicProjectShadowCalibrationJob.ts server/src/routes/jobs.ts server/src/index.ts
git commit -m "feat: run public project shadow calibration"
```
