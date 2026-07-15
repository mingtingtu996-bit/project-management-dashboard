# Release Readiness Runbook

This runbook coordinates existing WorkBuddy tests into a usable release dashboard. It is safe to read by itself because it does not run commands.

## Operating Rule

Local profiles are normal entrypoints. Live-only and DB-dependent gates remain controlled because they mutate or interrogate real environments and must not be confused with local readiness.

Always unsafe:

- Treat skipped live gates as passing.
- Treat dry-run, MCP-only, or manual-assisted evidence as hard release pass.
- Run live/DB commands without explicit unlock, ownership, approval, and rollback coverage.

## Gate Order

1. Static compile and type gates.
2. Unit and contract gates.
3. Backend governance guards.
4. Bundle and performance-evidence gates.
5. Local browser suites.
6. UIUX visual, overlap, accessibility, performance, and release smoke gates.
7. Phase 4 tool readiness and evidence-boundary checks.
8. Generate the real-environment handoff pack.
9. Prepare and check the handoff declaration.
10. Live-only gates after handoff.
11. DB-dependent gates after database recovery or safe test database confirmation.
12. Validate produced live/DB evidence before claiming closeout.
13. Run the all-gate closeout decision evaluator.
14. Write the closeout status index.

## Dashboard Orchestrator

Run the orchestrator from the repository root:

```powershell
node project-testing/tools/run-release-dashboard.mjs --profile smoke --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile release-local --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile uiux --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile tool-readiness --dry-run
```

Profiles:

- `smoke`: selected fast local static/readiness gates.
- `release-local`: all matrix gates marked `ready` with `local_static`, `local_browser`, or `tooling_readiness`.
- `uiux`: UIUX visual, overlap, accessibility, performance, and release smoke gates.
- `tool-readiness`: read-only Phase 4 inventory for CloakBrowser, Yingdao RPA, Playwright MCP, and future tools.
- `live`: live-only gates; requires `--include-live --confirm-live-handoff`.
- `db`: DB-dependent gates; requires `--include-db --confirm-db-ready`.

Reports are written to `project-testing/reports/release-YYYYMMDD-HHMMSS/summary.json` and `summary.md`. Dry-run reports list planned gates but execute no commands.

Run dashboard profiles one at a time when comparing logs. The orchestrator allocates a unique `release-YYYYMMDD-HHMMSS[-NNN]` directory if multiple reports start in the same second.

Before environment handoff, generate a planning-only handoff pack:

```powershell
node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout
```

For default master-plan production evidence, run the source-kit checker first:

```powershell
node project-testing/tools/check-default-master-plan-evidence-sources.mjs --json
```

The pack writes `project-testing/reports/handoff-YYYYMMDD-HHMMSS/handoff-plan.json` and `handoff-plan.md`, executes no live/DB commands, and lists each remaining closeout gate's command templates, expected artifacts, validation command, blocking prerequisites, and closeout decision rule.

Before any live or DB command runs, prepare a handoff declaration from `project-testing/runbooks/release-handoff-template.json` and check it:

```powershell
node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <handoff.json> --output <release-report-dir>/handoff-readiness.json
```

The handoff file must use reference fields such as `authTokenRef` and `databaseTargetRef`. Do not store raw JWTs, database URLs, service-role keys, passwords, or migration URLs in `project-testing/**`.

For live-only and DB-dependent closeout packs, the matrix must include structured handoff fields as well as command templates:

- `closeoutTargets`: exact C-number or business closeout targets owned by the gate.
- `unlockPolicy`: profile, required flags, live/DB/write/approval/monitoring/rollback requirements, and operation mode.
- `artifactValidationPolicy`: required metadata, rejection conditions, and artifact filename patterns that prevent local, dry-run, MCP-only, or manual-assisted evidence from being counted as hard pass.
- `handoffChecklist`: items that must be confirmed before the profile is allowed to run.
- `blockingPrerequisites`: conditions that keep the gate deferred or blocked.
- `passCriteria`: evidence-level rules that must be true before closeout can be claimed.
- `expectedArtifacts`: named outputs that should be archived under the release report folder or referenced from it.
- `evidenceOwners`: accountable roles for environment, DB evidence, approval, monitoring, rollback, cleanup, and browser/supporting evidence.

Do not close a live/DB gate from command success alone. The report must show the required evidence, pass criteria, artifacts, and owners for the applicable gate.

After artifacts exist, hydrate artifact refs into the handoff declaration, then run the read-only evidence validator before claiming closeout. The hydration step skips blocked or placeholder artifacts and does not run live/DB commands:

```powershell
node project-testing/tools/hydrate-release-handoff-from-artifacts.mjs --handoff-file <handoff.json> --artifact-root <release-report-dir> --output <release-report-dir>/handoff.hydrated.json
node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <release-report-dir>/handoff.hydrated.json --output <release-report-dir>/handoff-readiness.json
```

```powershell
node project-testing/tools/validate-release-evidence.mjs --gate <gate-id> --evidence-root <release-report-dir> --output <release-report-dir>/<gate-id>-evidence-validation.json
```

The validator checks expected artifact names, required filename patterns, required metadata, and reject markers from the matrix. It cannot turn a dry-run, local-only, MCP-only, or manual-assisted folder into a hard pass.

After all per-gate artifacts exist, run the all-gate closeout evaluator:

```powershell
node project-testing/tools/evaluate-release-closeout.mjs --evidence-root <release-report-dir> --output <release-report-dir>/closeout-decision.json
```

The evaluator writes per-gate validation JSON files and a closeout decision summary. The release remains open unless every remaining real-environment gate has `validationStatus=pass` and `mayClose=true`.

At any point, write a status index from the existing reports:

```powershell
node project-testing/tools/summarize-release-closeout-status.mjs --report-root project-testing/reports --output project-testing/reports/closeout-status-index.json
node project-testing/tools/summarize-release-closeout-status.mjs --report-root project-testing/reports --current-release-dir <release-report-dir> --output <release-report-dir>/closeout-status-index.json
```

The status index is read-only. It does not rerun live/DB commands; it reports the latest available handoff pack, handoff readiness, and closeout decision state plus next actions. Use `--current-release-dir` for release-specific closeout so an older staging or production closeout decision is not reused as the current run's result.

## Real Environment Closeout Packs

The remaining v1.4.23.1 / v1.4.23.1-A closeout items are not local-pass items. They are split in the matrix so a later live/DB handoff can run them without re-reading the planning files. Where v1.4.23.1 capability rows say `production-ready`, that is a capability-status label only; it does not close `realTestEnvironmentReady`, `soloLiveReady`, or live `productionReady` environment gates without the corresponding handoff, execution, rollback, monitoring, and outcome evidence.

### Old Object Physical Drop

Matrix gate: `old-object-physical-drop-closeout`

Profile: `db`, only after `--include-db --confirm-db-ready`.

Must prove all of the following before any physical deletion can close:

- object-level live `rowCount=0`, treated as necessary but insufficient
- live catalog and dependency readback, including `pg_depend`, views, functions, triggers, FK, RLS, policies, jobs, seeds, migrations, registry, route, frontend, test, and import surfaces
- DDL structure export, backup, rollback plan, and controlled drop migration
- post-drop catalog readback and post-drop API/browser smoke
- manual approval and migration window record

Do not close this gate from retired-object audit alone. `runtime surface count 0` and `rowCount=0` are preconditions, not authorization to drop.

### Database Migration And Recovery

Matrix gate: `database-migration-and-recovery`

Profile: `db`, only after the target database, migration env, and Advisor export credentials are available.

MG-07 cannot be closed from catalog readback or Supabase CLI Advisor output alone. Generate a current-run Dashboard UI or Management API Advisor export first:

```powershell
npm run evidence:supabase-advisor:management-api -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-management-api-export.json --operator <operator>
```

If no Management API token is available, use the logged-in Supabase Dashboard UI path: capture the Advisor page as JSON with the project URL plus current security/performance issue counts, then normalize it:

```powershell
npm run evidence:supabase-advisor:dashboard-ui-template -- --env-file deploy/env/staging.env --output <artifact-root>/supabase-advisor-dashboard-ui-capture.template.json --operator <operator>
npm run evidence:supabase-advisor:dashboard-ui-normalize -- --input <operator-captured-dashboard-advisor-json> --output <artifact-root>/supabase-advisor-management-api-export.json --project-ref <project-ref> --dashboard-url <supabase-dashboard-project-advisor-url> --operator <operator>
```

The template is not evidence. Fill it from the current Supabase Dashboard Advisor UI, set `templateOnly=false`, preserve the capture timestamp and screenshot/operator note reference, then run the normalizer. Then pass the same artifact to `migrate:production-governance:evidence` with `--advisor-export-file`. The Management API path requires `SUPABASE_MANAGEMENT_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, or `SUPABASE_API_TOKEN` from the operator environment; if none is available, use the Dashboard UI normalizer above. The capture must not be synthesized from CLI db advisors output, and no fake export should be written.

### C-18.L Live Diagnostics

Matrix gate: `c18-l07-l15-live-diagnostics`

Profile: `live`, only after `--include-live --confirm-live-handoff`.

The gate covers C-18.L07/L08/L09/L10/L11/L12/L14/L15:

- CPM concurrency and advisory/lock telemetry
- acceptance status concurrency
- wizard commit disposable draft and failure injection
- WBS large-generation pressure and route evidence
- warning sync DB query log
- large critical-path network pressure/readback
- company-summary pressure and cache behavior
- spreadsheet malicious/pressure import plus migration replay idempotency

CloakBrowser can support route/browser evidence only. Yingdao RPA evidence is `manual-assisted`; convert stable findings into scripted Playwright/API/Vitest evidence before hard pass. MCP exploration cannot count as pass.

### C-15 Learning Loop Live Closeout

Matrix gate: `c15-live-learning-closeout`

Profile: `live`, only after `--include-live --confirm-live-handoff`.

Closeout requires real sample cohorts, reward/MAE quality readback with `maeAfter < maeBefore` and `evaluatedDecisionCount > 0`, pending prediction closure, policy version uniqueness, tenant isolation, canary approval, monitoring, rollback/supersede, and stable production observation. Local scheduler wiring, flat MAE readback, or canary approval scripts are not enough.

### C-19 Runtime Publication And Rollback

Matrix gate: `c19-runtime-publication-release-rollback`

Profile: `live`, only after `--include-live --confirm-live-handoff`.

Closeout requires replay samples, phase-1/L5 handoff, release closure artifact, verification pass, manual approval, runtime publication apply evidence, impact monitoring, consumer observation, monitoring, rollback, saved outcome, and construction organization E1/E3/E5 runtime evidence. A generated package is not a publication pass unless the apply, monitoring, and rollback evidence also exists.

## Phase 4 Tool Boundary

- CloakBrowser: browser runtime for Playwright scripts. It supports evidence but does not own assertions.
- Yingdao RPA: manual-assisted UAT replay. Use it for realistic operator paths, then convert stable findings into repeatable tests.
- Playwright MCP: exploratory browser control. Do not count MCP observations as release pass.
- MSW: future deterministic frontend data support. Do not use mocks to claim live readiness.
- Schemathesis: future API contract/fuzz gate after an authoritative OpenAPI artifact exists.
- Argos/Lost Pixel: future visual review UI after screenshot baselines stabilize.
- k6/Artillery: future load gate after API budgets and safe targets are agreed.
- ZAP baseline: future security smoke with false-positive triage.

## Readiness Status Rules

- `pass`: command completed successfully and evidence is available.
- `fail`: command completed and reported a failure.
- `blocked`: command cannot run because a prerequisite is missing, such as DB recovery.
- `deferred`: command is intentionally not run because the gate requires live handoff or is out of current scope.

## Evidence Rules

Every release readiness report should capture:

- command
- gate group
- target environment
- exit code
- stdout/stderr summary
- artifact path
- screenshots or trace path when available
- console/network errors for browser gates
- mutation boundary
- next action

## Orchestrator Rules

`project-testing/tools/run-release-dashboard.mjs` must:

1. Read `project-testing/matrix/release-test-matrix.json`.
2. Select a profile: `smoke`, `release-local`, `uiux`, `tool-readiness`, `live`, or `db`.
3. Refuse live/db profiles unless explicit flags and environment handoff are present.
4. Run existing commands without rewriting them.
5. Write `summary.json` and `summary.md` under `project-testing/reports/release-YYYYMMDD-HHMMSS/`.
6. Preserve skipped live/db gates as `deferred` or `blocked`.
