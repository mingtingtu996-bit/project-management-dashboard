---
name: workbuddy-release-testing
description: WorkBuddy release testing workflow. Use when planning, running, expanding, or interpreting release-readiness tests, full-app smoke tests, browser automation, Playwright MCP checks, UIUX visual/a11y/performance gates, API/contract tests, live-only diagnostics, DB-dependent gates, or project-testing artifacts. Enforces non-live/live separation, existing-script reuse, report capture, and no production mutation during testing.
---

# WorkBuddy Release Testing

Use this skill before release-readiness or full-app testing in this repository. Keep testing governance artifacts under `project-testing/`.

## Workflow

1. Read `project-testing/README.md` and `project-testing/matrix/release-test-matrix.json`.
2. Classify the requested test as one of:
   - `local_static`: typecheck, build, unit, contract, lint, bundle, no live service.
   - `local_browser`: local browser smoke or UIUX checks against local app or built client.
   - `local_browser_msw`: local frontend/page/browser checks backed by MSW fixtures; useful for deterministic rendering, empty/error states, and permission display, but not live readiness.
   - `local_api_contract`: route/client-service contract checks that validate request/response shape without live Supabase state.
   - `container_db`: backend integration checks against an ephemeral PostgreSQL database through `DB_CONNECTION_STRING`; useful for SQL behavior, not Supabase-specific live evidence.
   - `live_only`: real Supabase, live workspace isolation, live evidence, live migration, production-like auth or network.
   - `db_dependent`: blocked until database recovery or confirmed test database availability.
   - `exploratory_mcp`: Playwright MCP or agent-driven browser exploration that must be converted into repeatable scripts before release claims.
   - `tooling_readiness`: read-only checks for testing tools, local executables, package presence, MCP hints, and evidence boundaries.
   - `solo_live`: personal real-environment checks for a single-owner staging or personal live deployment; can close `soloLiveReady`, not company-grade `productionReady`.
   - `uat_rpa`: Yingdao RPA or other manual-assisted workflow replay; useful evidence but not a hard automated release pass.
   - `future_tooling`: Schemathesis, Testcontainers PostgreSQL, Argos/Lost Pixel, k6/Artillery, ZAP, or similar tools before prerequisites are satisfied.
3. Reuse existing commands from the matrix before creating new scripts.
4. Local profiles are normal entrypoints. Keep real-environment work behind the matrix unlock, handoff, evidence, approval, monitoring, and rollback rules.
5. Write new readiness notes, reports, screenshots, traces, or summaries under `project-testing/reports/`.
6. For profile-based release checks, use `node project-testing/tools/run-release-dashboard.mjs --profile <smoke|release-local|uiux|tool-readiness> --dry-run` before executing commands.
7. For Phase 4 tooling checks, use `node project-testing/tools/run-release-dashboard.mjs --profile tool-readiness --dry-run`.
8. Report status as `pass`, `fail`, `blocked`, or `deferred`. Never collapse a skipped live-only gate into pass.
9. For default master-plan production evidence, check `node project-testing/tools/check-default-master-plan-evidence-sources.mjs --json` before assembling or requesting the real evidence chain. Treat `sourceManifestStatus=blocked` and `sourceManifestBlockers` as hard preflight blockers for the full production evidence pipeline, not as production-readiness evidence.
10. For candidate refresh execution, build `candidate-refresh-authorization-package.json`, then run `node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs` before any human operator runs the guarded execute command. The seal is no-write and must not be treated as DB execution evidence.
11. For candidate baseline materialization, run `node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs` before any human operator runs the guarded materialization command. The seal is no-write, checks only local reports/env unlocks, and must not be treated as DB execution evidence.
12. For runtime seed import execution, run `node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs` before any human operator runs the guarded import command. The seal is no-write, checks only the import gate, prior execution report, explicit unlock, and auditable seed-smoke operator, and must not be treated as DB execution evidence.
13. For operator-supplied real duration sample material, run `npm run evidence:default-master-plan:real-duration-sample-preflight` before any source export consumes it. The preflight is no-write, checks placeholder/source/coverage boundaries, and must not be treated as accepted duration sample evidence.
14. After source-kit and readiness reports are refreshed, run `npm run evidence:default-master-plan:real-evidence-gaps` to generate `real-evidence-gap-summary.md|json` for handoff. This summary is reporting-only; it does not replace PM review, duration samples, dependency writer, runtime publication, or smoke/rollback evidence.

## Release Gate Boundaries

- Local static gates may support readiness but cannot prove live production readiness.
- Browser gates prove rendered workflow health only for their configured environment and test data.
- MSW-backed local browser gates prove deterministic UI behavior against mocked API contracts only; they cannot close live, DB, RLS, storage, or production-readiness gates.
- Container DB gates prove SQL integration behavior against an ephemeral database only; they cannot close Supabase Advisor, RLS, storage, live migration, or production-readiness gates.
- UIUX visual/a11y/performance gates must preserve screenshots, console errors, network failures, and thresholds when available.
- Solo-live gates require explicit personal owner, self-approval, rollback plan, and monitoring plan before claiming `soloLiveReady`.
- Live-only gates require explicit environment ownership handoff before running.
- DB-dependent gates remain blocked until the database is restored or a safe test database is available.

## Output Contract

Every release-readiness result should include:

- command or MCP tool used
- environment target
- gate tier
- status
- evidence path or output summary
- known skips and blockers
- whether production mutation was possible or impossible
- next action

## Orchestrator Guardrails

- `smoke`, `release-local`, and `uiux` are local profiles.
- `live` must refuse to run unless both `--include-live` and `--confirm-live-handoff` are present.
- `db` must refuse to run unless both `--include-db` and `--confirm-db-ready` are present.
- Dry-run reports are planning evidence only; they do not prove gates pass.
- Generated reports belong under `project-testing/reports/`.

## Phase 4 Tool Boundaries

- CloakBrowser is a browser runtime for Playwright. It supports repeatable evidence but does not own assertions.
- Yingdao RPA is manual-assisted UAT replay. Convert stable findings into Playwright, Vitest, API, or contract tests before hard release gating.
- Playwright MCP is exploratory. MCP observations are not release pass evidence until scripted.
- Future tools remain inventory-only until their prerequisites are explicit in the matrix.
