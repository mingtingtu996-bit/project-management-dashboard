# WorkBuddy Release Testing Dashboard

This folder is the project-local home for release testing rules, test inventory, runbooks, and generated readiness reports.

## Boundary

This dashboard is a coordination layer. It does not replace existing `npm run verify:*`, `guard:*`, Vitest, Playwright, UIUX, deployment, or live-diagnostic scripts. Local profiles are normal day-to-day entrypoints. Personal real-environment work can use the lighter `solo-live` lane. Company-grade live/DB work still requires explicit unlock, handoff, evidence, approval, monitoring, and rollback discipline.

## Folder Map

- `skills/workbuddy-release-testing/`: project testing skill. Read it before release-readiness, full-app, browser, UIUX, live, or DB-dependent testing work.
- `matrix/release-test-matrix.json`: current inventory of release gates and their execution tier.
- `index/moved-files.json`: migration ledger for legacy testing artifacts moved out of scattered `artifacts/` paths.
- `artifacts/`: real storage root for browser checks, diagnostic runs, smoke-test output, logs, packages, and legacy generated reports.
- `runbooks/release-readiness.md`: human-readable order of operations and failure handling.
- `tools/run-release-dashboard.mjs`: main orchestrator for profile selection, command execution, and readiness reports.
- `tools/check-local-deterministic-readiness.mjs`: read-only checker for the MSW, DB override, boot switch, and GitHub Actions Postgres service-container prerequisites needed to move flaky real-environment gates into deterministic local lanes.
- `tools/check-solo-live-readiness.mjs`: read-only checker for a personal real-environment handoff; separates `realTestEnvironmentReady`, `soloLiveReady`, and `productionReady`.
- `tools/run-server-vitest-slices.mjs`: observable server Vitest runner that discovers server test files without Vitest collection, then runs selected files one by one with per-file JSON/log evidence.
- `tools/generate-release-handoff-pack.mjs`: planning-only generator for live/DB handoff plans, command templates, expected artifacts, and validation commands.
- `tools/check-release-handoff-readiness.mjs`: read-only checker for live/DB handoff input readiness before any real command can run.
- `tools/validate-release-evidence.mjs`: read-only validator for live/DB closeout artifacts after a handoff run has produced evidence files.
- `tools/evaluate-release-closeout.mjs`: read-only closeout decision evaluator that validates all remaining real-environment gates and writes an overall decision.
- `tools/summarize-release-closeout-status.mjs`: read-only status index that summarizes handoff, readiness, evidence validation, and closeout decision reports.
- `tools/check-testing-tools.mjs`: read-only Phase 4 tool readiness checker.
- `tools/check-default-master-plan-evidence-sources.mjs`: read-only source-kit checker for default master-plan review, calibration, writer, publication, smoke source inputs, and the full source-export manifest contract.
- `tools/check-default-master-plan-candidate-export-hygiene.mjs`: read-only hygiene checker that makes the selected candidate export explicit and reports stale/ineligible candidate exports as ignored instead of allowing auto-discovery ambiguity.
- `tools/run-default-master-plan-staging-runtime-evidence.mjs`: controlled staging writer for an explicitly authorized default master-plan test project; it writes staging task carriers, duration samples, dependencies, runtime publication, smoke/readback evidence, and rollback evidence only after staging unlock flags and a matching authorization file.
- `tools/build-default-master-plan-real-production-outcome-package.mjs`: no-write package builder for the production/live real outcome JSON contract and source-export command template.
- `tools/check-default-master-plan-candidate-refresh-db-repair-readiness.mjs`: no-write DB repair preflight for failed candidate refresh execution; it compares the failed target fingerprint with the current env-file target without connecting to the database.
- `tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs`: no-write seal checker for candidate refresh execution; it validates the authorization package, preflight binding, sealed command, and explicit unlock environment variable without connecting to the database or running the writer.
- `tools/summarize-default-master-plan-real-evidence-gaps.mjs`: read-only handoff summary for default master-plan production-readiness gaps after source-kit and readiness reports have been refreshed.
- `tools/check-default-master-plan-runtime-seed-import-readiness.mjs`: no-write seal checker for runtime seed import execution; it validates the import gate, prior execution report, explicit unlock, and auditable seed-smoke operator without connecting to the database or running the import.
- `tools/check-default-master-plan-real-duration-sample-material-preflight.mjs`: no-write preflight for operator-supplied real duration sample material; it validates coverage, placeholder removal, source evidence, and mutation boundaries before any source export can use the material.
- `tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs`: no-write preflight for the operator-filled real duration sample collection kit; it validates required operator fields and mutation boundaries before material generation.
- `tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs`: no-write builder that converts a ready collection-kit preflight into operator-supplied real duration sample material.
- `tools/build-default-master-plan-blocked-gate-action-checklist.mjs`: no-write checklist builder that turns `real-evidence-gap-summary.json` into action-group sequencing, operator requirements, and read-only/manual/guarded command queues for the remaining blocked gates.
- `tools/check-default-master-plan-blocked-gate-action-checklist-freshness.mjs`: no-write digest checker that verifies the blocked-gate checklist was built from the current `real-evidence-gap-summary.json`.
- `tools/plan-default-master-plan-read-only-evidence-queue.mjs`: plan-only projector for `operatorCommandExecutionQueues.readOnlyEvidence`; it writes the executable-looking read-only queue plan and rejects any manual, guarded, live, DB, or placeholder command that leaks into that queue.
- `plugins/`: notes for testing MCP/plugin/tool integrations.
- `reports/`: generated release readiness reports and future orchestrator outputs.

For default master-plan production evidence, start with the source-kit checker:

For personal real-environment readiness, use the solo-live lane:

```powershell
node project-testing/tools/check-solo-live-readiness.mjs --handoff-file project-testing/runbooks/solo-live-handoff-template.json --output project-testing/reports/solo-live-readiness.json
node project-testing/tools/run-release-dashboard.mjs --profile solo-live --dry-run --include-solo-live --confirm-solo-live-owner
```

`realTestEnvironmentReady=true` means the app is wired to an explicit staging/personal environment and has at least API health evidence. `soloLiveReady=true` additionally requires a non-local URL, deployment ref, self-approval ref, rollback owner, monitoring owner, rollback plan, monitoring plan, API read smoke, and UI smoke. This lane never sets `productionReady=true`.

```powershell
npm run evidence:default-master-plan:candidate-hygiene
node project-testing/tools/check-default-master-plan-evidence-sources.mjs --json
```

The hygiene check makes the selected candidate export explicit and blocks ambiguous extra eligible exports. The source-kit report then shows which real exports are still missing, whether the current `source-exports-manifest.json` can enter the full production evidence pipeline, and which builder templates must be filled before the production evidence pipeline can run. A production-ready default master-plan pipeline also needs a production/live `--real-production-outcome <json>` source wired through the source exporter, manifest `pipelineArgs`, and post-publish smoke/rollback evidence; staging smoke remains useful evidence but cannot close production-ready.

Build the no-write real outcome package before asking an operator for production/live material:

```powershell
npm run evidence:default-master-plan:real-outcome-package
```

It writes `project-testing/reports/default-master-plan-production-readiness/real-production-outcome-package.json|md`, fills the baseline/project/publication identity from `operator-handoff.json`, emits the production/live `real-production-outcome.json` field contract, and generates a source-export command with production placeholders. It does not run writers, publish runtime, run smoke, perform rollback, or claim production readiness.

Before treating any handoff command as runnable for production evidence, run:

```powershell
npm run evidence:default-master-plan:operator-handoff-preflight
```

`mayBuildRealProductionOutcomePackage=true` means only that the no-write production/live outcome contract package can be generated. It is not real outcome evidence. The production/live outcome evidence gate is `mayAcceptRealProductionOutcomeEvidence`; it must be `true` with empty `realProductionOutcomeEvidenceBlockers` before a production/live real outcome file may be used to close production readiness. Current staging handoffs should stay at `mayAcceptRealProductionOutcomeEvidence=false`.

Before running candidate refresh execution, build the authorization package and then run the readiness seal:

```powershell
node project-testing/tools/build-default-master-plan-candidate-refresh-authorization-package.mjs
node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs
```

The seal must be `ready_for_candidate_refresh_execution` before a human operator uses the execute command. A `blocked` seal with `executionCommandReady=true` and `candidate_refresh_execution_unlock_not_present` means the command is fully materialized but the explicit unlock has not been set; it still performs no DB connection and no write.

If candidate refresh execution failed with DB authentication or connection blockers, run the no-write DB repair preflight before rerunning the guarded writer:

```powershell
npm run evidence:default-master-plan:candidate-refresh-db-repair-readiness
```

It writes `project-testing/reports/default-master-plan-production-readiness/candidate-refresh-db-repair-readiness.json|md`. `ready_for_candidate_refresh_rerun` means the current env-file fingerprint changed since the failed execution and still points at the same Supabase project/host; it does not prove the credential works. `blocked` means the failed credential fingerprint still appears unchanged or current target metadata is unusable. `target_reconfirmation_required` means the target identity changed and discovery must be rerun before refresh execution. This preflight does not connect to the database, write candidate rows, import seeds, publish runtime, run smoke, perform rollback, or close production-readiness gates.

Before running candidate baseline materialization, run the no-write readiness seal:

```powershell
node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs
```

The seal must be `ready_for_candidate_baseline_materialization` before a human operator uses the guarded materialization command. A `blocked` seal means the dry-run package, execute-mode arguments, operator approval, human actor, or explicit unlock still need to be satisfied. The seal does not connect to the database and does not write candidate baselines or task baseline items.

Before running runtime seed import execution, run the no-write readiness seal:

```powershell
node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs
```

The seal must be `ready_for_runtime_seed_import_execution` before a human operator uses the guarded runtime seed import command. A `blocked` seal means the import gate, previous execution report, explicit `--allow-import`, auditable `--seed-smoke-user-id`, local/remote unlock, or write-boundary checks still need to be satisfied. The seal does not connect to the database, does not run runtime seed import, and cannot be treated as DB execution evidence.

Before using operator-supplied real duration sample material in a source export, run the no-write material preflight:

```powershell
npm run evidence:default-master-plan:real-duration-sample-preflight
```

The preflight must be `ready_for_source_export` before `real-duration-sample-export` can be treated as usable source material. A `blocked` preflight means the operator file is missing, still a template, contains placeholders, has invalid samples, lacks accepted coverage, or lacks `checked-by`. The preflight writes only `real-duration-sample-material-preflight.json|md`; it does not write duration samples or production tables.

Before converting an operator-filled collection kit into real duration sample material, run the no-write collection-kit preflight:

```powershell
node project-testing/tools/check-default-master-plan-real-duration-sample-collection-kit-preflight.mjs --collection-kit project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json --checked-by <operator-id>
```

The collection-kit preflight must be `ready_for_real_duration_sample_material_build` before its rows can be used to build material. It writes only `real-duration-sample-collection-kit-preflight.json|md`, does not write `duration_experience_samples`, tasks, dependencies, runtime publication, rollback, or production tables, and cannot close production readiness by itself.

After the collection-kit preflight is ready, build the real duration sample material without writing production tables:

```powershell
node project-testing/tools/build-default-master-plan-real-duration-sample-material-from-collection-kit-preflight.mjs --collection-package project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json --collection-kit-preflight project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit-preflight.json --output project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json --prepared-by <operator-id>
```

The material builder requires `ready_for_real_duration_sample_material_build` and writes only `real-duration-sample-material.json`, `real-duration-sample-material.report.json|md`. It does not write `duration_experience_samples`, tasks, dependencies, runtime publication, rollback, or production tables, and it still must pass the material preflight before source export.

Check candidate export hygiene whenever old candidate exports may still exist in the readiness folder:

```powershell
npm run evidence:default-master-plan:candidate-hygiene
```

It writes `project-testing/reports/default-master-plan-production-readiness/candidate-export-hygiene.json|md`, confirms the candidate selected by `operator-handoff.json`, lists stale/ineligible exports as ignored, and blocks if another eligible candidate export remains beside the selected baseline. It is read-only and cannot close production-ready.

For an explicitly authorized staging test project, run the controlled staging runtime evidence writer only with all unlock flags and the matching authorization file:

```powershell
npm run evidence:default-master-plan:staging-runtime -- --env-file <env-file-containing-authorized-baseline> --baseline-id <baseline-id> --project-id <project-id> --company-id <company-id> --environment staging --reviewed-by <user-id> --staging-authorization-file project-testing/reports/default-master-plan-production-readiness/staging-runtime/staging-authorization.json --include-staging --confirm-staging-handoff --allow-write
```

This is a real staging write path. It may write task carriers, duration samples, task dependencies, runtime publication rows, readback/smoke evidence, and rollback events for the authorized test object. The report records the selected env-file fingerprint, Supabase project ref, database host, and connection source without secrets; an env-file/baseline mismatch is staging evidence boundary material, not production failure evidence. It must remain labeled staging controlled replay and cannot close production-ready; a separate production/live real outcome file is still required.

After refreshing the source-kit and readiness reports, generate the concise handoff summary:

```powershell
npm run evidence:default-master-plan:real-evidence-gaps
```

It writes `project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.md|json` and separates locally closed gates from real PM review, duration sample, dependency writer, runtime publication, and smoke/rollback gaps. This summary is reporting-only and cannot close a production-readiness gate.

Then generate the no-write blocked gate action checklist:

```powershell
npm run evidence:default-master-plan:blocked-gate-checklist
```

It writes `project-testing/reports/default-master-plan-production-readiness/blocked-gate-action-checklist.json|md`, grouping blocked gates by action group, operator requirements, repair steps, evidence inputs, and read-only/manual/guarded command queues. The checklist records `inputDigest.sha256` for the `real-evidence-gap-summary.json` it was built from, so stale action lists can be detected after a gap refresh. It is sequencing evidence only; it does not execute commands, connect to databases, import seeds, publish runtime, export live sources, run smoke, perform rollback, or close production-readiness gates.

Then verify the checklist still matches the current gap summary:

```powershell
npm run evidence:default-master-plan:blocked-gate-checklist-freshness
```

It writes `project-testing/reports/default-master-plan-production-readiness/blocked-gate-action-checklist-freshness.json|md` and returns `status=fresh`, `stale`, or `missing_digest`. This is freshness evidence only; it does not execute commands, connect to databases, import seeds, publish runtime, export live sources, run smoke, perform rollback, or close production-readiness gates.

Then project the auto-runnable read-only evidence queue without executing it:

```powershell
node project-testing/tools/plan-default-master-plan-read-only-evidence-queue.mjs --input project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.json --output project-testing/reports/default-master-plan-production-readiness/read-only-evidence-queue-plan.json --markdown project-testing/reports/default-master-plan-production-readiness/read-only-evidence-queue-plan.md --plan-only
```

The queue plan is still plan-only evidence. It may identify commands that are safe to run as read-only tooling, but it does not execute them and does not make candidate refresh, materialization, runtime seed import, runtime publication, smoke, rollback, or production-ready claims. If an operator later uses `--execute --confirm-read-only-execution`, the tool still refuses contaminated read-only queues and only runs entries that remain `queueId=read_only_evidence`, `commandKind=read_only_evidence`, and `autoRunAllowed=true`.

The queue plan and dashboard refresh expose `executionEvidenceBoundary.evidenceTier=tooling_readiness_supporting_only`, `canCloseProductionReadinessGates=false`, and the blocked gate ids that the read-only queue cannot close. Passing read-only execution results are supporting evidence only; they do not replace DB execution, runtime seed import, runtime publication, production/live source export, smoke, rollback, or real outcome evidence.

The readiness dashboard refresh also embeds `blockedGateActionChecklistCompactActionItems`, a compact per-action-group view of covered gates, next action, unlocks, operator fields, evidence inputs, blockers, and read-only/manual/guarded command counts. This is operator sequencing support only; it does not execute the commands and cannot close production-readiness gates.

The release dashboard stable handoff, `project-testing/reports/default-master-plan-production-readiness/default-master-plan-action-handoff.json|md`, also embeds `compactActionItems` with the same sequencing purpose. Threads that consume the stable handoff can use those compact items directly without treating them as executed evidence.

Legacy `artifacts/*` paths are compatibility junctions where practical. New testing outputs should use `project-testing/artifacts/` or `project-testing/reports/`.

## Current Phase

Phase 1 and Phase 2 are documentation/inventory. Phase 3 adds the release dashboard orchestrator. Phase 4 adds testing tool governance:

1. Establish the dashboard folder and testing skill.
2. Classify the existing test surfaces without running live checks or modifying hot scripts.
3. Run profile-based local plans and write readiness summaries.
4. Separate CloakBrowser, Yingdao RPA, exploratory MCP, and future specialized tools into clear evidence layers.
5. For default master-plan production evidence, first run `node project-testing/tools/check-default-master-plan-evidence-sources.mjs` to see which real evidence files are present, whether the source manifest is complete for the full production pipeline, and which builder templates still need to be filled.

Use dry-run first:

```powershell
node project-testing/tools/run-release-dashboard.mjs --profile smoke --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile release-local --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile local-deterministic --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile uiux --dry-run
node project-testing/tools/run-release-dashboard.mjs --profile tool-readiness --dry-run
node project-testing/tools/check-local-deterministic-readiness.mjs --output project-testing/reports/local-deterministic-readiness.json
node project-testing/tools/check-default-master-plan-evidence-sources.mjs --json
```

The `local-deterministic` profile is the preferred lane when real Supabase, live network, or staging data instability is blocking everyday testing. It selects non-live static/contract/governance checks, the deterministic readiness checker, and the first MSW-backed page smoke for `CompanyCockpit`. Use `local_browser_msw`, `local_api_contract`, and `container_db` matrix tiers to move selected gates out of real-environment blocking. Keep RLS, real migrations, storage, workspace isolation, live concurrency, query-log, rollback, and production-readiness evidence in `live_only` or `db_dependent`.

Server Vitest is routed through observable slices in the local release matrix:

```powershell
npm run testing:server-vitest:slices -- --project server-default --plan-only --output project-testing/reports/server-vitest-default-slices.plan.json
npm run testing:server-vitest:slices -- --project server-default --output project-testing/reports/server-vitest-default-slices.json
```

The heavy WBS/generation test set remains an explicit inventory/planned gate:

```powershell
npm run testing:server-vitest:slices -- --project server-wbs-long --timeout-ms 420000 --output project-testing/reports/server-vitest-wbs-long-slices.json
```

Remove `--dry-run` whenever the selected profile and environment are actually ready to run. `live` and `db` profiles remain protected by explicit unlock flags plus handoff/evidence rules because they are real-environment operations, not because the dashboard itself is limited.

Phase 4 tool boundaries:

- CloakBrowser is the browser runtime for repeatable Playwright evidence.
- Yingdao RPA is manual-assisted UAT evidence and should feed repeatable tests after findings stabilize.
- Playwright MCP is exploratory; it does not count as pass until converted into scripts.
- Schemathesis, visual review, load, and security tools stay future/inventory-only until prerequisites are met.

## Execution Rule

Do not treat a passing local or mock gate as production readiness. Live-only and DB-dependent gates must remain explicit `blocked` or `deferred` until the required live environment, secrets, database recovery, and ownership handoff are confirmed.

Before requesting a live or DB handoff, generate the closeout handoff pack:

```powershell
node project-testing/tools/generate-release-handoff-pack.mjs --target real-closeout
```

The handoff pack is planning-only. It writes `project-testing/reports/handoff-*/handoff-plan.json` and `handoff-plan.md`, executes no commands, and lists the command templates, expected artifacts, validation commands, blockers, and owners for the four remaining real-environment gates.

Prepare a handoff declaration from the template, keeping all raw secrets outside the repository:

```powershell
project-testing/runbooks/release-handoff-template.json
```

Then check whether the handoff is ready before running any live or DB command:

```powershell
node project-testing/tools/check-release-handoff-readiness.mjs --handoff-file <handoff.json> --output project-testing/reports/<run>/handoff-readiness.json
```

The readiness checker fails if required unlock flags, target ids, owners, approval refs, rollback refs, artifact roots, or DB readiness refs are missing. It also fails if raw token, password, database URL, or migration URL fields are placed in the handoff file instead of `*Ref` fields.

After a live or DB handoff run produces artifacts, validate the evidence folder before claiming closeout:

```powershell
node project-testing/tools/validate-release-evidence.mjs --gate c18-l07-l15-live-diagnostics --evidence-root project-testing/reports/release-YYYYMMDD-HHMMSS --output project-testing/reports/release-YYYYMMDD-HHMMSS/c18-evidence-validation.json
node project-testing/tools/validate-release-evidence.mjs --gate c15-live-learning-closeout --evidence-root project-testing/reports/release-YYYYMMDD-HHMMSS --output project-testing/reports/release-YYYYMMDD-HHMMSS/c15-evidence-validation.json
node project-testing/tools/validate-release-evidence.mjs --gate c19-runtime-publication-release-rollback --evidence-root project-testing/reports/release-YYYYMMDD-HHMMSS --output project-testing/reports/release-YYYYMMDD-HHMMSS/c19-evidence-validation.json
node project-testing/tools/validate-release-evidence.mjs --gate old-object-physical-drop-closeout --evidence-root project-testing/reports/release-YYYYMMDD-HHMMSS --output project-testing/reports/release-YYYYMMDD-HHMMSS/old-object-evidence-validation.json
```

The validator only reads evidence files. A `pass` result means the expected artifact names, required filename patterns, required metadata, and reject markers in the matrix are satisfied; it does not run missing live/DB diagnostics by itself.

To make the final all-gate decision after artifacts exist:

```powershell
node project-testing/tools/evaluate-release-closeout.mjs --evidence-root project-testing/reports/release-YYYYMMDD-HHMMSS --output project-testing/reports/release-YYYYMMDD-HHMMSS/closeout-decision.json
```

The closeout evaluator writes per-gate validation files plus `closeout-decision.json` and `closeout-decision.md`. All four real-environment gates must have `validationStatus=pass` and `mayClose=true`; otherwise the whole closeout remains open.

To summarize the current end-to-end state:

```powershell
node project-testing/tools/summarize-release-closeout-status.mjs --report-root project-testing/reports --output project-testing/reports/closeout-status-index.json
node project-testing/tools/summarize-release-closeout-status.mjs --report-root project-testing/reports --current-release-dir project-testing/reports/release-YYYYMMDD-HHMMSS --output project-testing/reports/release-YYYYMMDD-HHMMSS/closeout-status-index.json
```

The status index reads existing reports only. It does not rerun live/DB checks, but it shows whether the selected state is missing the handoff pack, handoff-not-ready, ready-for-live-db-execution, or closeout-ready. For a release-specific decision, pass `--current-release-dir`; otherwise the tool may intentionally summarize the latest historical closeout decision under the broader report root.
